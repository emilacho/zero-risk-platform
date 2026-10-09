/**
 * EL ORQUESTADOR · recorre una plantilla con el motor puro y las funciones de código, hablando con el mundo SOLO por los puertos (puertos.ts). Sin red propia, sin modelo propio.
 *  · `abrirEncargo`  → crea el encargo (idempotente) y avanza hasta el primer paso que espera a un empleado;
 *  · `avanzar`       → ejecuta pasos de código y del revisor externo en línea; se detiene en un paso de agente/portero y devuelve el PEDIDO (n8n lo ejecuta con run-sdk);
 *  · `recibirResultado` → recibe la respuesta del empleado, aplica el CONTRATO DE FORMATO y los VALIDADORES de código, registra el paso y sigue.
 * Reglas de oficio: `dry_run` explícito (en dry_run no se llama a ningún proveedor ni se escribe salida/bandeja); la oficina APAGADA no abre encargos (409); un fallo de formato tras el
 * reintento cierra el encargo como `fallido` (visible, nunca relleno); un fallo de Slack nunca frena nada; nadie pregunta al cliente.
 */
import crypto from 'node:crypto'
import { parsearBrief, prohibePersonas, proporcionDelBrief, protagonistasDelBrief, fechaLimiteDelBrief, esPostDeImagen, type BriefLeido } from './brief'
import { chequeosDePost, type FuentesDelCliente } from './chequeos'
import { aUtc, chequeosDeEntrega, manifiesto, nombreDeArchivo, textoParaCopiar, leerMedidas, type ArchivoDeEntrega } from './entrega'
import { armarPedidoCiego } from './ciego'
import { candidatasFoto } from './fotos'
import { duenoDeLaFicha, registrarPaso, siguientePaso, type ResultadoDePaso } from './motor'
import { construirTarea, fuentesDelCiego, INSTRUCCION_DEL_CIEGO, type ContextoDePedido } from './pedidos'
import type { Cambios, Encargo, FuentesCompletas, Puertos, TurnoRegistrado } from './puertos'
import { chequearPrompts, citasExisten, derivarDecision, elegirVersion, veredictoDeImagenes, type ObservacionDeImagen, type ReglasDeImagen } from './reglas-de-imagen'
import { procesarSalida } from './salida'
import { decidirPuerta, TARGET_STEP_PRODUCIR, validarSobre, type Sobre } from './sobre'
import { estadoInicial, type Estado, type Ficha, type Paso, type Plantilla } from './tipos'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')
const datos = (e: Estado, n: string): Record<string, unknown> | undefined => e.artefactos[n]?.datos
const AGENTE_DEL_TEXTO = 'content-creator'

// ───────────────────────── lo que se arma a partir del estado
function reglasVisuales(e: Estado, brief: BriefLeido): ReglasDeImagen {
  const rv = (datos(e, 'visual_direction')?.reglas_de_imagen ?? { obligatorio: [], prohibido: [] }) as ReglasDeImagen
  return {
    obligatorio: [...rv.obligatorio, ...brief.visual_obligatorio.map((t, i) => ({ id: `brief-o${i + 1}`, texto: t }))],
    prohibido: [...rv.prohibido, ...brief.visual_prohibido.map((t, i) => ({ id: `brief-p${i + 1}`, texto: t }))],
  }
}
/** para los prompts además se vigilan las palabras prohibidas del manual y del brief */
function reglasParaPrompts(e: Estado, brief: BriefLeido, F: FuentesCompletas): ReglasDeImagen {
  const v = reglasVisuales(e, brief)
  const palabras = [...F.fuentes.palabras_prohibidas, ...brief.prohibido]
  return { obligatorio: v.obligatorio, prohibido: [...v.prohibido, ...palabras.map((p, i) => ({ id: `txt-p${i + 1}`, texto: `palabra prohibida «${p}»`, claves: [p] }))] }
}
interface Base { brief: BriefLeido; proporcion: string; F: FuentesCompletas }
function base(e: Estado): Base { return datos(e, 'encargo') as unknown as Base }
/** lo que el curador debe mirar AHORA: con imagen generada, la última tanda; con foto real, la foto elegida */
function imagenesAMirar(e: Estado): Array<{ indice: number; url: string }> {
  const modo = ((datos(e, 'visual_direction')?.decision as { modo?: string } | undefined)?.modo) ?? 'ninguna'
  if (modo === 'generada') {
    const im = datos(e, 'imagenes')
    const ult = (im?.ultimo_intento as number | undefined) ?? 0
    return ((im?.items ?? []) as Array<{ indice: number; intento: number; url: string }>).filter((x) => x.intento === ult).map((x) => ({ indice: x.indice, url: x.url }))
  }
  if (modo === 'real') {
    const id = (datos(e, 'visual_direction')?.decision as { foto_id?: string } | undefined)?.foto_id
    const f = base(e).F.fotos.find((x) => x.id === id)
    return f?.url ? [{ indice: 0, url: f.url }] : []
  }
  return []
}
const contexto = (e: Estado): ContextoDePedido => {
  const b = base(e)
  return { fuentes: b.F, brief: b.brief, proporcion: b.proporcion, estado: e, reglas: reglasVisuales(e, b.brief), imagenesAMirar: imagenesAMirar(e), art: (n) => datos(e, n) }
}
const fichaNueva = (id: string, origen: Ficha['origen'], donde: string, gravedad: Ficha['gravedad'], que: string, contra_que = 'proceso de la oficina', propuesta = 'revisar'): Ficha => ({ id, origen, donde, gravedad, estado: 'abierta', que, contra_que, propuesta })
const turnoDe = (e: Estado) => e.pasos_ejecutados + 1

// ───────────────────────── abrir
export async function abrirEncargo(P: Puertos, entrada: { cuerpo: unknown; client_id: string; target_step_id: string; sala_ref?: Record<string, unknown> | null; prueba?: boolean; permitir_apagada?: boolean }): Promise<Respuesta> {
  const v = validarSobre(entrada.cuerpo)
  if (!v.ok) return r(400, { error: v.codigo, errores: v.errores })
  const config = await P.almacen.leerConfig()
  const dec = decidirPuerta(v.sobre, entrada.permitir_apagada ? { ...config, estado: 'encendida', familias_activas: [v.sobre.familia ?? ''] } : config, entrada.target_step_id, entrada.client_id)
  if (dec.accion === 'rechazar') return r(400, { error: 'origen_no_aceptado', detalle: `solo se acepta ${TARGET_STEP_PRODUCIR}` })
  if (dec.accion === 'pasarela') return r(409, { error: 'oficina_no_abre', motivo: dec.motivo, detalle: 'la oficina no abre este encargo; el sobre sigue por la pieza simple (pasarela)' })
  const pl = await P.almacen.leerPlantilla(dec.familia)
  if (!pl) return r(404, { error: 'plantilla_desconocida', familia: dec.familia })
  if (!pl.activo && !entrada.permitir_apagada) return r(409, { error: 'plantilla_inactiva', familia: dec.familia })
  const s: Sobre = v.sobre
  const tope = Math.min(s.tope_usd ?? pl.plantilla.limites.tope_encargo_usd, pl.plantilla.limites.tope_encargo_usd)
  const c = await P.almacen.crearEncargo({ client_id: entrada.client_id, parte_id: s.parte_id, brief_id: s.brief_id, tipo_de_grupo: pl.plantilla.tipo, familia: dec.familia, tope_usd: tope, dry_run: s.dry_run, prueba: !!entrada.prueba, sala_ref: entrada.sala_ref ?? null, estado_del_motor: estadoInicial() })
  if (!c.ok) return r(500, { error: 'almacen_error', detalle: c.error })
  if (!c.nuevo) return r(200, { accion: 'ya_existia', encargo_id: c.encargo.id, estado: c.encargo.estado })
  const sal = await avanzar(P, c.encargo.id)
  return r(sal.status, { ...sal.cuerpo, encargo_id: c.encargo.id, ignorados: v.ignorados })
}

// ───────────────────────── avanzar
async function plantillaDe(P: Puertos, enc: Encargo): Promise<Plantilla> {
  const p = await P.almacen.leerPlantilla(enc.familia)
  if (!p) throw new Error(`plantilla «${enc.familia}» no existe`)
  // el tope de ESTE encargo (el del sobre, nunca más que el de la plantilla) manda sobre el de la plantilla
  return { ...p.plantilla, limites: { ...p.plantilla.limites, tope_encargo_usd: Math.min(p.plantilla.limites.tope_encargo_usd, enc.tope_usd) } }
}

async function aplicar(P: Puertos, enc: Encargo, pl: Plantilla, indice: number, res: ResultadoDePaso, extra: { vuelta?: string; turno: Omit<TurnoRegistrado, 'n' | 'estado'>; gastos?: Cambios['gastos']; usos?: Cambios['usos_de_fotos']; imagen_generada?: boolean; autor?: string | null; estado?: Encargo['estado'] }): Promise<Encargo> {
  const antes = enc.estado_del_motor
  const nuevo = registrarPaso(antes, pl, indice, { ...res, ...(extra.vuelta ? { vuelta: extra.vuelta } : {}) })
  const paso = pl.pasos[indice]
  const art = res.artefacto ? { tipo: paso.salida_artefacto, version: nuevo.artefactos[paso.salida_artefacto].version, contenido: res.artefacto, sha256: sha(res.artefacto), autor: extra.autor ?? paso.quien } : undefined
  const ambos: Cambios = {
    encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: extra.estado ?? 'en_paso',
    ...(extra.imagen_generada !== undefined ? { imagen_generada: extra.imagen_generada } : {}),
    turno: { n: turnoDe(antes), estado: 'hecho', ...extra.turno }, ...(art ? { artefacto: art } : {}), fichas: nuevo.fichas,
    ...(extra.gastos?.length ? { gastos: extra.gastos } : {}), ...(extra.usos?.length ? { usos_de_fotos: extra.usos } : {}),
  }
  await P.almacen.guardar(ambos)
  return { ...enc, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: ambos.estado ?? enc.estado, imagen_generada: extra.imagen_generada ?? enc.imagen_generada }
}

export async function avanzar(P: Puertos, encargoId: string): Promise<Respuesta> {
  let enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const pl = await plantillaDe(P, enc)
  for (let vuelta = 0; vuelta < 80; vuelta++) {
    if (['cerrado', 'cerrado_por_tope', 'fallido'].includes(enc.estado)) return r(200, { accion: 'cerrado', estado: enc.estado, con_desacuerdo: enc.con_desacuerdo })
    const abierto = await P.almacen.turnoAbierto(enc.id)
    if (abierto) return r(200, { accion: 'esperar', turno: { n: abierto.n, paso: abierto.paso, agente: abierto.agente, dispatch_key: abierto.dispatch_key }, nota: 'ya hay un paso esperando respuesta' })
    const sig = siguientePaso(enc.estado_del_motor, pl)
    if (sig.accion === 'fin') return cerrar(P, enc, pl, false)
    if (sig.accion === 'cierre_por_tope') return cerrarPorTope(P, enc, pl, sig.razon, sig.detalle)
    const paso = pl.pasos[sig.indice]
    const e = enc.estado_del_motor
    try {
      if (paso.tipo === 'codigo') {
        const out = await ejecutarCodigo(P, enc, pl, paso)
        if (out.fallido) return fallar(P, enc, out.fallido)
        enc = await aplicar(P, enc, pl, sig.indice, out.res, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'codigo', agente: null, dispatch_key: null, cost_usd: out.res.costo_usd }, gastos: out.gastos, usos: out.usos, imagen_generada: out.imagen_generada })
        if (paso.funcion === 'cierre') return cerrar(P, enc, pl, false)
        continue
      }
      if (paso.tipo === 'externo') {
        const out = await ejecutarExterno(P, enc, paso)
        enc = await aplicar(P, enc, pl, sig.indice, out.res, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'externo', agente: paso.quien, dispatch_key: null, cost_usd: out.res.costo_usd }, gastos: out.gastos })
        continue
      }
      // portero y agente: salto sin llamar a nadie si no hay nada que hacer
      const salto = saltoPorFalta(paso, e)
      if (salto) { enc = await aplicar(P, enc, pl, sig.indice, salto, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: paso.tipo, agente: null, dispatch_key: null, cost_usd: 0 } }); continue }
      const agente = paso.quien === 'dueno_del_donde' ? AGENTE_DEL_TEXTO : paso.quien
      const n = turnoDe(e)
      const ctx = contexto2(e)
      const fichasPropias = paso.clave === 'corrige' || paso.clave === 'decide' ? fichasQueTocan(e, paso) : []
      const t = paso.tipo === 'agente' ? construirTarea(paso.clave, ctx!, { fichas: fichasPropias }) : null
      const dispatch_key = `${enc.id}:${n}`
      await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd, estado: 'en_paso', turno: { n, paso: paso.clave, tipo: paso.tipo, agente, estado: 'corriendo', dispatch_key, cost_usd: 0 } })
      return r(200, { accion: 'esperar', turno: { n, paso: paso.clave, tipo: paso.tipo, agente, dispatch_key, pedido: pedidoDe(enc, paso, agente, t, e) } })
    } catch (err) {
      return fallar(P, enc, `error interno en «${paso.clave}»: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return fallar(P, enc, 'el orquestador dio más de 80 vueltas (no debería pasar)')
}
const contexto2 = (e: Estado): ContextoDePedido | null => (datos(e, 'encargo') ? contexto(e) : null)

function pedidoDe(enc: Encargo, paso: Paso, agente: string, t: { task: string; images: string[]; esquema: string } | null, e: Estado): Record<string, unknown> {
  if (paso.tipo === 'portero') {
    const b = base(e)
    return { destino: 'portero', cuerpo: { cliente: enc.client_id, voy_a_producir: `${b.brief.id} · ${b.brief.red} · ${b.brief.formato}: ${b.brief.que_es}`, ya_trae: ['manual_vigente', 'fotos_etiquetadas'], ronda: 1 }, dry_run: enc.dry_run }
  }
  return {
    agent_name: agente, task: t!.task, images: t!.images.map((url) => ({ url })), esquema: t!.esquema,
    extra: { indicacion_oficina: `oficina:${paso.clave}` }, max_budget_usd: paso.tope_usd, thinking_mode: 'disabled', dry_run: enc.dry_run, client_id: enc.client_id,
    workflow_hint: 'oficina · turno',
  }
}

/** fichas abiertas cuyo dueño es el agente del texto (las de imagen o sin dueño se declaran sin tomar: la imagen solo se rehace en «mirar») */
function fichasQueTocan(e: Estado, paso: Paso): Ficha[] {
  const origen = paso.clave === 'corrige' ? 'jefe' : 'externa'
  return e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && duenoDeLaFicha(f) === AGENTE_DEL_TEXTO && (origen === 'externa' || f.gravedad === 'bloquea'))
}

function saltoPorFalta(paso: Paso, e: Estado): ResultadoDePaso | null {
  if (paso.clave === 'corrige' || paso.clave === 'decide') {
    const origen = paso.clave === 'corrige' ? 'jefe' : 'externa'
    const propias = fichasQueTocan(e, paso)
    // las demás abiertas de ese origen no tienen quién las resuelva en esta ronda: se declaran SIN tomar
    const huerfanas = e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && !propias.includes(f) && (origen === 'externa' || f.gravedad === 'bloquea'))
    if (propias.length === 0) {
      return { costo_usd: 0, resoluciones: huerfanas.map((f) => ({ id: f.id, estado: 'no_tomada' as const, razon: duenoDeLaFicha(f) ? 'sin respuesta' : 'sin dueño en esta ronda: la imagen solo se rehace en el paso «mirar»; se declara' })) }
    }
    return null
  }
  if (paso.clave === 'mirar') {
    const items = imagenesAMirar(e)
    if (items.length === 0) {
      return { costo_usd: 0, artefacto: { observaciones: [], preferencia: [], veredicto: { pasan: [], porImagen: [], regenerar: false }, sin_imagenes: true }, fichas: [fichaNueva('mirar-sin-imagen', 'chequeo', 'imagen', 'bloquea', 'no hay ninguna imagen que mirar (ningún prompt pasó el brief o el generador falló)', 'reglas de imagen del brief', 'declarar la pieza sin imagen')], reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' } }
    }
  }
  return null
}

// ───────────────────────── funciones de código
type SalidaCodigo = { res: ResultadoDePaso; gastos?: Cambios['gastos']; usos?: Cambios['usos_de_fotos']; imagen_generada?: boolean; fallido?: string }

async function ejecutarCodigo(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<SalidaCodigo> {
  const e = enc.estado_del_motor
  switch (paso.funcion) {
    case 'abrir': {
      const fu = await P.fuentes(enc.client_id)
      if ('error' in fu) return { res: { costo_usd: 0 }, fallido: `no se pudieron leer las fuentes del cliente: ${fu.error}` }
      const parte = await P.parte(enc.parte_id, enc.client_id)
      if (!parte) return { res: { costo_usd: 0 }, fallido: `la parte ${enc.parte_id} no existe para este cliente` }
      const brief = parsearBrief(parte.texto, enc.brief_id)
      if (!brief) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no está en la parte` }
      if (!esPostDeImagen(brief)) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no es un post de imagen (${brief.formato}): esta sala hace post con foto` }
      const proporcion = proporcionDelBrief(brief, String(pl.limites.formato_por_omision ?? '1:1'))
      return { res: { costo_usd: 0, artefacto: { brief, proporcion, F: fu } } }
    }
    case 'elegir_foto': {
      const b = base(e)
      const protas = protagonistasDelBrief(b.brief, b.F.vocabulario_de_productos)
      const prohibe = prohibePersonas(b.brief)
      const cf = candidatasFoto(b.F.fotos, { protagonista: protas, prohibe_personas: prohibe, proporcion: b.proporcion, usos: b.F.usos, reuso_dias: Number(pl.limites.reuso_dias ?? 14), ahora: P.ahora() }, b.F.propios)
      return { res: { costo_usd: 0, artefacto: { ...cf, protagonistas: protas, prohibe_personas: prohibe } } }
    }
    case 'chequear_prompts': {
      const b = base(e)
      const prompts = ((datos(e, 'prompts')?.prompts ?? []) as Array<{ prompt: string; idea_en_una_linea: string }>)
      const ch = chequearPrompts(prompts.map((p) => p.prompt), reglasParaPrompts(e, b.brief, b.F), b.F.propios)
      const repeticion = (e.vueltas['chequear_prompts'] ?? 0) >= 1
      const res: ResultadoDePaso = {
        costo_usd: 0,
        artefacto: { indices: ch.pasan, ninguno: ch.ninguno, fallan: ch.fallan, prompts: ch.pasan.map((i) => prompts[i]) },
        ...(ch.ninguno && repeticion ? { fichas: [fichaNueva('prompts-ninguno', 'chequeo', 'imagen', 'bloquea', 'ningún prompt cumple las reglas del brief (ni tras repetir al ingeniero de prompts)', 'reglas de imagen del brief', 'declarar la pieza sin imagen generada')], reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' } } : {}),
      }
      return { res }
    }
    case 'imagen': {
      const b = base(e)
      const validos = ((datos(e, 'prompts_validos')?.prompts ?? []) as Array<{ prompt: string }>).slice(0, Number(pl.limites.imagenes_generadas_max ?? 3))
      const previo = (datos(e, 'imagenes')?.items ?? []) as Array<Record<string, unknown>>
      const intento = ((datos(e, 'imagenes')?.ultimo_intento as number | undefined) ?? 0) + 1
      const items = [...previo]
      const nuevos: Array<{ indice: number; url: string }> = []
      const gastos: NonNullable<Cambios['gastos']> = []
      let costo = 0
      const fichas: Ficha[] = []
      for (let i = 0; i < validos.length; i++) {
        const g = await P.imagen({ prompt: validos[i].prompt, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run })
        if (!g.ok) { fichas.push(fichaNueva(`imagen-${intento}-${i}`, 'chequeo', 'imagen', 'sugerencia', `el generador no devolvió una imagen para el prompt ${i + 1}: ${g.error}`)); continue }
        const indice = items.length
        items.push({ indice, intento, prompt_idx: i, url: g.url, generation_id: g.generation_id, prompt: validos[i].prompt })
        nuevos.push({ indice, url: g.url })
        costo += g.costo_usd
        gastos.push({ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: g.generation_id, cost_usd: g.costo_usd, base: 'usage' })
      }
      void b; void nuevos
      return { res: { costo_usd: costo, artefacto: { items, ultimo_intento: intento }, ...(fichas.length ? { fichas } : {}) }, gastos, imagen_generada: nuevos.length > 0 ? true : undefined }
    }
    case 'elegir_version': {
      const obs = datos(e, 'observacion_imagen')
      const items = (datos(e, 'imagenes')?.items ?? []) as Array<{ indice: number; url: string; generation_id: string; prompt: string }>
      const ver = (obs?.veredicto ?? { pasan: [] }) as { pasan: number[] }
      const elegido = elegirVersion(ver.pasan, ((obs?.preferencia ?? []) as number[]))
      const it = elegido === null ? null : items.find((x) => x.indice === elegido) ?? null
      return { res: { costo_usd: 0, artefacto: it ? { elegido: true, ...it } : { elegido: false } } }
    }
    case 'acabado_imagen': {
      const b = base(e)
      const vd = datos(e, 'visual_direction') ?? {}
      const modo = ((vd.decision as { modo?: string } | undefined)?.modo ?? 'ninguna') as 'real' | 'generada' | 'ninguna'
      if (modo === 'generada') {
        const el = datos(e, 'imagen_elegida')
        if (!el || el.elegido !== true) return { res: { costo_usd: 0, artefacto: { origen: 'ninguna', nota: 'ninguna versión generada pasó el brief' } } }
        const nota = b.proporcion === '1:1' ? null : `la imagen generada es 1:1 y el brief pide ${b.proporcion}: recortar al publicar`
        return { res: { costo_usd: 0, artefacto: { origen: 'generada', url: el.url, generation_id: el.generation_id, ancho: 1024, alto: 1024, nota } } }
      }
      if (modo === 'real') {
        const id = (vd.decision as { foto_id?: string }).foto_id
        const f = b.F.fotos.find((x) => x.id === id)
        const nota = f && f.formato === 'vertical' && b.proporcion === '1:1' ? 'la foto real es vertical y el brief pide 1:1: recortar al publicar' : null
        return { res: { costo_usd: 0, artefacto: { origen: 'real', url: f?.url ?? null, foto_id: id, nota } }, usos: id ? [{ foto_id: id, rol: 'pieza' }] : undefined }
      }
      return { res: { costo_usd: 0, artefacto: { origen: 'ninguna', nota: 'la pieza sale sin imagen' } } }
    }
    case 'chequeos': {
      const b = base(e)
      const pz = datos(e, 'pieza_post')
      if (!pz) return { res: { costo_usd: 0, artefacto: { fichas: 0 } }, fallido: 'no hay pieza que chequear' }
      const fin = datos(e, 'imagen_final') ?? {}
      const fs = chequeosDePost({
        pieza: { pie_de_foto: String(pz.pie_de_foto ?? ''), hashtags: (pz.hashtags as string[]) ?? [], llamado: pz.llamado as string | undefined },
        fuentes: b.F.fuentes as FuentesDelCliente,
        limites: { pie_de_foto_max: Number(pl.limites.pie_de_foto_max ?? 2200), hashtags_max: Number(pl.limites.hashtags_max ?? 30), limites_verificados: pl.limites.limites_verificados === true },
        prohibidas_del_brief: b.brief.prohibido,
        imagen: { generada: fin.origen === 'generada', declarada_en_bandeja: true },
      })
      const prefijo = `chk${e.pasos_ejecutados}`
      return { res: { costo_usd: 0, artefacto: { fichas: fs.length }, fichas: fs.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })), reemplazar_fichas: { origen: 'chequeo', donde: ['texto', 'hashtags'] } } }
    }
    case 'empaquetar_entrega': return empaquetar(P, enc, pl)
    case 'cierre': return { res: { costo_usd: 0, artefacto: { cerrado_en: P.ahora().toISOString() } } }
    default: return { res: { costo_usd: 0 }, fallido: `función de código «${paso.funcion}» sin implementar` }
  }
}

async function empaquetar(P: Puertos, enc: Encargo, pl: Plantilla): Promise<SalidaCodigo> {
  const e = enc.estado_del_motor
  const b = base(e)
  const pz = datos(e, 'pieza_post')
  if (!pz) return { res: { costo_usd: 0 }, fallido: 'no hay pieza que empaquetar' }
  const fin = datos(e, 'imagen_final') ?? {}
  const red = b.brief.red.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() || 'red'
  const formatoClave = b.proporcion === '4:5' ? 'foto_4x5' : 'foto_1x1'
  const fila = await P.almacen.leerFormato(red, formatoClave)
  const limite = fechaLimiteDelBrief(b.brief.aprueba)
  const expires = limite ? aUtc(limite.fecha, limite.hora, b.F.zona) : null
  const archivos: ArchivoDeEntrega[] = []
  const nombres: string[] = []
  if (fin.url) {
    const bytes = await P.descargar(String(fin.url))
    if (bytes) {
      const med = leerMedidas(bytes)
      const ext = med?.tipo === 'jpeg' ? 'jpg' : 'png'
      const nombre = nombreDeArchivo({ fecha: null, hora: null, red, formato: 'foto', brief_id: b.brief.id, n: 1, de: 1, ext })
      archivos.push({ nombre, bytes }); nombres.push(nombre)
    }
  }
  const texto = textoParaCopiar({ pie_de_foto: String(pz.pie_de_foto ?? ''), hashtags: (pz.hashtags as string[]) ?? [] })
  const baseNombre = nombreDeArchivo({ fecha: null, hora: null, red, formato: 'foto', brief_id: b.brief.id, n: 1, de: 1, ext: 'txt' }).replace(/\.txt$/, '')
  const hoja = `# Publicar a mano · ${b.brief.id}\nRed: ${b.brief.red} · formato: ${b.brief.formato} · proporción ${b.proporcion}\nHora de publicación: ${limite ? `(aprobar antes de ${limite.fecha})` : 'sin fecha en el brief: se decide al aprobar'}\n${(fin.origen === 'generada') ? '⚠️ La imagen es GENERADA, no una foto del producto real.\n' : ''}${fin.nota ? `Nota de la imagen: ${fin.nota}\n` : ''}${pz.nota_para_quien_publica ? `Nota: ${String(pz.nota_para_quien_publica)}\n` : ''}\n## Pasos\n${(fila ? [] : ['(sin especificación de formato)']).join('\n')}\n`
  const man = manifiesto(archivos, { encargo_id: enc.id, brief_id: b.brief.id, aprobada_version: e.artefactos['pieza_post']?.version ?? 1, expires_at: expires, imagen_generada: fin.origen === 'generada' })
  const fichas = chequeosDeEntrega(archivos, fila ?? null, { pie_de_foto: String(pz.pie_de_foto ?? ''), hashtags: (pz.hashtags as string[]) ?? [] }, man)
  const sinImagen = archivos.length === 0
  const todos = [...archivos.map((a) => ({ ...a, tipo: a.nombre.endsWith('.jpg') ? 'image/jpeg' : 'image/png' })),
    { nombre: `${baseNombre}_texto.txt`, bytes: Buffer.from(texto, 'utf8'), tipo: 'text/plain' },
    { nombre: `${baseNombre}_publicar.md`, bytes: Buffer.from(hoja + (fila?.pasos_publicacion?.map((x, i) => `${i + 1}. ${x}`).join('\n') ?? ''), 'utf8'), tipo: 'text/markdown' },
    { nombre: 'manifest.json', bytes: Buffer.from(JSON.stringify(man, null, 2), 'utf8'), tipo: 'application/json' }]
  let urls: Record<string, string> = {}
  if (!enc.dry_run) {
    const g = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}`, todos)
    if (!g.ok) return { res: { costo_usd: 0 }, fallido: `no se pudieron guardar los archivos de la entrega: ${g.error}` }
    urls = g.urls
  }
  const prefijo = `ent${e.pasos_ejecutados}`
  return {
    res: {
      costo_usd: 0,
      artefacto: { archivos: man.archivos, nombres: todos.map((x) => x.nombre), urls, texto_para_copiar: texto, expires_at: expires, sin_imagen: sinImagen, simulado: enc.dry_run },
      fichas: [...fichas.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })), ...(sinImagen && fin.origen !== 'ninguna' ? [] : [])],
      reemplazar_fichas: { origen: 'chequeo', donde: 'entrega' },
    },
  }
}

// ───────────────────────── revisor externo
async function ejecutarExterno(P: Puertos, enc: Encargo, paso: Paso): Promise<{ res: ResultadoDePaso; gastos: Cambios['gastos'] }> {
  const e = enc.estado_del_motor
  const ciego = armarPedidoCiego(fuentesDelCiego(contexto(e)))
  if (!ciego.ok) throw new Error(`pedido ciego inválido: ${ciego.sobran.join(', ')}`)
  const fin = datos(e, 'imagen_final') ?? {}
  let total = 0
  const gastos: NonNullable<Cambios['gastos']> = []
  for (let intento = 0; intento <= (paso.salida?.reintento_formato ?? 0); intento++) {
    const rev = await P.revisor({ pedido: { instruccion: INSTRUCCION_DEL_CIEGO, ...ciego.pedido }, dry_run: enc.dry_run, imagen_url: (fin.url as string | undefined) ?? null })
    if (!rev.ok) {
      return { res: { costo_usd: total, artefacto: { sin_revision: true, motivo: rev.error }, fichas: [fichaNueva('externa-no-respondio', 'externa', 'proceso', 'bloquea', `el revisor externo no respondió (${rev.error}): la pieza va sin segunda mirada`, 'revisión externa firmada', 'revisar a mano')] }, gastos }
    }
    total += rev.costo_usd
    gastos.push({ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: rev.costo_usd, base: 'usage' })
    const p = procesarSalida(rev.texto, paso.salida!.esquema, intento, paso.salida!.reintento_formato)
    if (p.ok) {
      const fs = (p.valor.fichas as Array<{ que: string; donde: string; contra_que: string; gravedad: 'bloquea' | 'sugerencia'; propuesta: string }>).map((f, i) => fichaNueva(`ext-${e.pasos_ejecutados}-${i}`, 'externa', f.donde, f.gravedad, f.que, f.contra_que, f.propuesta))
      return { res: { costo_usd: total, artefacto: { fichas: fs.length, modelo: rev.modelo }, fichas: fs }, gastos }
    }
    if (p.accion === 'falla_visible') return { res: { costo_usd: total, artefacto: { sin_revision: true, motivo: p.errores.join(' · ') }, fichas: [fichaNueva('externa-formato', 'externa', 'proceso', 'bloquea', 'la respuesta del revisor externo no cumple el formato tras el reintento: la pieza va sin segunda mirada', 'contrato de formato')] }, gastos }
  }
  throw new Error('revisor externo: salida de ciclo inalcanzable')
}

// ───────────────────────── recibir el resultado de un agente / del portero
export interface ResultadoDeTurno { texto?: string; error?: string; costo_usd?: number; workflow_execution_id?: string | null; tokens_in?: number | null; tokens_out?: number | null }

export async function recibirResultado(P: Puertos, encargoId: string, n: number, res: ResultadoDeTurno): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const pl = await plantillaDe(P, enc)
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.n !== n) {
    if (n < turnoDe(enc.estado_del_motor)) return avanzar(P, enc.id) // respuesta repetida: ya registrada, no se cuenta dos veces
    return r(409, { error: 'turno_no_esperado', esperado: abierto?.n ?? null, recibido: n })
  }
  const e = enc.estado_del_motor
  const sig = siguientePaso(e, pl)
  if (sig.accion !== 'ejecutar') return r(409, { error: 'sin_paso_pendiente' })
  const paso = sig.paso
  const costo = Math.max(0, Number(res.costo_usd ?? 0))
  const gastoModelo: NonNullable<Cambios['gastos']> = costo > 0 ? [{ concepto: paso.tipo === 'portero' ? 'portero' : 'modelo', ref_tabla: res.workflow_execution_id ? 'agent_invocations' : null, ref_id: res.workflow_execution_id ?? null, cost_usd: costo, base: 'usage' }] : []
  const turnoBase = { paso: paso.clave, tipo: paso.tipo, agente: abierto.agente, dispatch_key: abierto.dispatch_key, cost_usd: costo, workflow_execution_id: res.workflow_execution_id ?? null, tokens_in: res.tokens_in ?? null, tokens_out: res.tokens_out ?? null }

  if (res.error || typeof res.texto !== 'string') {
    // el turno murió o devolvió error: se registra como fallo y el encargo cierra visible (el vigía reintenta UNA vez antes de llegar aquí)
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd + costo, turno: { ...turnoBase, n, estado: 'fallo', error: res.error ?? 'respuesta vacía' }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return fallar(P, { ...enc, gasto_usd: e.gasto_usd + costo }, `el paso «${paso.clave}» falló: ${res.error ?? 'respuesta vacía'}`)
  }

  if (paso.tipo === 'portero') {
    const out = await aplicarResultado(P, enc, pl, sig.indice, { costo_usd: costo, artefacto: { texto: res.texto } }, { vuelta: sig.vuelta, turno: { ...turnoBase, estado: 'hecho' }, gastos: gastoModelo, n })
    void out
    return avanzar(P, enc.id)
  }

  // agente: contrato de formato
  const intentos = e.vueltas[`fmt:${paso.clave}`] ?? 0
  const p = procesarSalida(res.texto, paso.salida!.esquema, intentos, paso.salida!.reintento_formato)
  if (!p.ok && p.accion === 'reintentar') {
    const nuevo: Estado = { ...e, vueltas: { ...e.vueltas, [`fmt:${paso.clave}`]: intentos + 1 }, pasos_ejecutados: e.pasos_ejecutados + 1, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, turno: { ...turnoBase, n, estado: 'hecho', error: 'formato: reintento' }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    const reabierto = await P.almacen.leerEncargo(enc.id)
    const ctx = contexto2(nuevo)
    const fichasPropias = paso.clave === 'corrige' || paso.clave === 'decide' ? fichasQueTocan(nuevo, paso) : []
    const t = construirTarea(paso.clave, ctx!, { fichas: fichasPropias, errorDeFormato: p.mensaje_de_error })
    const n2 = turnoDe(nuevo)
    const dk = `${enc.id}:${n2}`
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', turno: { n: n2, paso: paso.clave, tipo: paso.tipo, agente: abierto.agente, estado: 'corriendo', dispatch_key: dk, cost_usd: 0 } })
    void reabierto
    return r(200, { accion: 'esperar', reintento_de_formato: true, turno: { n: n2, paso: paso.clave, tipo: paso.tipo, agente: abierto.agente, dispatch_key: dk, pedido: pedidoDe(enc, paso, abierto.agente ?? paso.quien, t, nuevo) } })
  }
  if (!p.ok) {
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), fichas: [...e.fichas, fichaNueva(`formato-${paso.clave}`, 'chequeo', 'formato', 'bloquea', p.ficha.que ?? 'formato inválido')], turno: { ...turnoBase, n, estado: 'fallo', error: p.errores.join(' · ') }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return fallar(P, { ...enc, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, p.ficha.que ?? 'formato inválido')
  }
  const proc = procesarValor(paso, p.valor, enc, e, pl)
  if (proc.fallido) {
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), turno: { ...turnoBase, n, estado: 'fallo', error: proc.fallido }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return fallar(P, { ...enc, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, proc.fallido)
  }
  await aplicarResultado(P, enc, pl, sig.indice, { ...proc.res, costo_usd: costo }, { vuelta: sig.vuelta, turno: { ...turnoBase, estado: 'hecho' }, gastos: gastoModelo, n })
  return avanzar(P, enc.id)
}

async function aplicarResultado(P: Puertos, enc: Encargo, pl: Plantilla, indice: number, res: ResultadoDePaso, o: { vuelta?: string; turno: Omit<TurnoRegistrado, 'n'>; gastos: Cambios['gastos']; n: number }): Promise<Encargo> {
  const { estado: _e, ...t } = o.turno
  void _e
  return aplicar(P, enc, pl, indice, res, { vuelta: o.vuelta, turno: t, gastos: o.gastos })
}

// ───────────────────────── lo que cada paso de agente hace con su salida (validadores de código)
function procesarValor(paso: Paso, v: Record<string, unknown>, enc: Encargo, e: Estado, pl: Plantilla): { res: ResultadoDePaso; fallido?: string } {
  const b = base(e)
  switch (paso.clave) {
    case 'direccion_visual': {
      const dec = v.decision as { modo: 'real' | 'generada' | 'ninguna'; foto_id?: string; motivo: string }
      const cand = ((datos(e, 'candidatas_foto')?.candidatas ?? []) as Array<{ id: string; requiere_mirar: boolean }>)
      const politica = String(pl.limites.politica_imagen_generada ?? 'permitida')
      const fichas: Ficha[] = []
      let modo = dec.modo
      let fotoId = dec.foto_id
      // el CÓDIGO decide lo que no se confía al modelo: una foto real tiene que ser una de las candidatas; «ninguna» no se acepta si la política permite generar
      if (modo === 'real' && !cand.some((c) => c.id === fotoId)) {
        fichas.push(fichaNueva('vd-foto-invalida', 'chequeo', 'imagen', 'sugerencia', `el curador eligió la foto «${fotoId ?? '(sin id)'}», que no es una candidata: se genera una imagen`, 'candidatas de la sala'))
        modo = 'generada'; fotoId = undefined
      }
      if (modo === 'ninguna' && politica !== 'prohibida') {
        fichas.push(fichaNueva('vd-ninguna', 'chequeo', 'imagen', 'sugerencia', 'el curador dijo «ninguna imagen»; como no hay foto apta y la política lo permite, se genera una (marcada como tal en la bandeja)', 'política de imagen generada'))
        modo = 'generada'
      }
      if (modo === 'generada' && politica === 'prohibida') {
        modo = 'ninguna'
        fichas.push(fichaNueva('vd-prohibida', 'chequeo', 'imagen', 'bloquea', 'la política del cliente prohíbe imágenes generadas y no hay foto real apta: la pieza sale sin imagen', 'política de imagen generada'))
      }
      const reglasBrutas = v.reglas_de_imagen as ReglasDeImagen
      const ci = citasExisten(reglasBrutas, b.brief.texto)
      for (const x of ci.rechazadas) fichas.push(fichaNueva(`vd-regla-${x.id}`, 'chequeo', 'imagen', 'sugerencia', `regla de imagen «${x.id}» descartada: ${x.motivo}`, 'citas literales del brief'))
      const conf = modo === 'real' ? b.F.fotos.find((f) => f.id === fotoId)?.etiqueta_confianza : null
      const derivada = derivarDecision(modo, conf)
      return { res: { costo_usd: 0, artefacto: { ...v, reglas_de_imagen: ci.validas, reglas_rechazadas: ci.rechazadas, decision: { ...dec, foto_id: fotoId, ...derivada } }, ...(fichas.length ? { fichas } : {}) } }
    }
    case 'prompts': return { res: { costo_usd: 0, artefacto: v } }
    case 'mirar': {
      const obs = v.imagenes as ObservacionDeImagen[]
      const validos = new Set(imagenesAMirar(e).map((i) => i.indice))
      const filtradas = obs.filter((o) => validos.has(o.indice))
      const modo = ((datos(e, 'visual_direction')?.decision as { modo?: string } | undefined)?.modo) ?? 'ninguna'
      const puede = modo === 'generada' && (e.vueltas['mirar'] ?? 0) < Number(pl.pasos.find((p) => p.clave === 'mirar')?.vuelve_a?.max ?? 0)
      const ver = veredictoDeImagenes(filtradas, reglasVisuales(e, b.brief), b.F.propios, puede)
      const fichas: Ficha[] = []
      if (ver.pasan.length === 0 && !ver.regenerar) fichas.push(fichaNueva(`mirar-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'bloquea', `ninguna imagen cumple el brief: ${ver.porImagen.flatMap((x) => x.fallas.map((f) => f.detalle)).slice(0, 4).join(' · ') || 'sin observaciones'}`, 'reglas de imagen del brief', 'la pieza sale sin imagen o con la mejor disponible, declarado'))
      return { res: { costo_usd: 0, artefacto: { observaciones: filtradas, preferencia: v.preferencia, veredicto: ver }, fichas, reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' } } }
    }
    case 'texto': return { res: { costo_usd: 0, artefacto: v } }
    case 'revision_jefe': {
      const fs = (v.fichas as Array<{ que: string; donde: string; contra_que: string; gravedad: 'bloquea' | 'sugerencia'; propuesta: string }>).map((f, i) => fichaNueva(`jefe-${e.pasos_ejecutados}-${i}`, 'jefe', f.donde, f.gravedad, f.que, f.contra_que, f.propuesta))
      return { res: { costo_usd: 0, artefacto: { fichas: fs.length }, fichas: fs } }
    }
    case 'corrige':
    case 'decide': {
      const mias = fichasQueTocan(e, paso)
      const respuestas = v.respuestas as Array<{ id: string; estado: 'tomada' | 'no_tomada'; razon: string }>
      const validas = respuestas.filter((x) => mias.some((f) => f.id === x.id))
      const huerfanas = mias.filter((f) => !validas.some((x) => x.id === f.id))
      const pieza = v.pieza as Record<string, unknown> | undefined
      const origen = paso.clave === 'corrige' ? 'jefe' : 'externa'
      const otras = e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && !mias.includes(f) && (origen === 'externa' || f.gravedad === 'bloquea'))
      return {
        res: {
          costo_usd: 0,
          ...(pieza ? { artefacto: { ...(datos(e, 'pieza_post') ?? {}), ...pieza } } : {}),
          resoluciones: [
            ...validas.map((x) => ({ id: x.id, estado: x.estado, razon: x.razon })),
            ...huerfanas.map((f) => ({ id: f.id, estado: 'no_tomada' as const, razon: 'el empleado no respondió este hallazgo' })),
            ...otras.map((f) => ({ id: f.id, estado: 'no_tomada' as const, razon: 'sin dueño en esta ronda: la imagen solo se rehace en el paso «mirar»; se declara' })),
          ],
        },
      }
    }
    default: return { res: { costo_usd: 0, artefacto: v } }
  }
}

// ───────────────────────── cierres
async function fallar(P: Puertos, enc: Encargo, motivo: string): Promise<Respuesta> {
  const e = enc.estado_del_motor
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: enc.gasto_usd, estado: 'fallido', con_desacuerdo: true })
  await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `🛑 Encargo fallido · ${enc.brief_id}: ${motivo}`, dry_run: enc.dry_run })
  return r(200, { accion: 'cerrado', estado: 'fallido', motivo, resultado_para_la_sala: 'fallido' })
}

async function cerrarPorTope(P: Puertos, enc: Encargo, pl: Plantilla, razon: string, detalle: string): Promise<Respuesta> {
  await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `🛑 Cierre por tope (${razon}) · ${enc.brief_id}: ${detalle}`, dry_run: enc.dry_run })
  return cerrar(P, enc, pl, true, `cierre por tope: ${detalle}`)
}

async function cerrar(P: Puertos, enc: Encargo, pl: Plantilla, parcial: boolean, nota?: string): Promise<Respuesta> {
  void pl
  const e = enc.estado_del_motor
  const abiertasQueBloquean = e.fichas.filter((f) => f.gravedad === 'bloquea' && (f.estado === 'abierta' || f.estado === 'no_tomada'))
  const conDesacuerdo = abiertasQueBloquean.length > 0 || parcial
  const estadoFinal: Encargo['estado'] = parcial ? 'cerrado_por_tope' : 'cerrado'
  const pz = datos(e, 'pieza_post')
  const fin = datos(e, 'imagen_final')
  const ent = datos(e, 'entrega')
  const b = datos(e, 'encargo') ? base(e) : null
  const generada = fin?.origen === 'generada'
  let output_id: string | null = null, hitl_id: string | null = null
  const desacuerdos = abiertasQueBloquean.map((f) => `${f.donde}: ${f.que ?? ''}`)
  if (!enc.dry_run && pz && b) {
    const contenido = { pie_de_foto: pz.pie_de_foto, hashtags: pz.hashtags, llamado: pz.llamado ?? null, nota_para_quien_publica: pz.nota_para_quien_publica ?? null, imagen: fin ?? null, entrega: ent ? { urls: ent.urls, expires_at: ent.expires_at } : null }
    const metadata = { origen: 'oficina', familia: enc.familia, parte_id: enc.parte_id, brief_id: enc.brief_id, oficina_encargo_id: enc.id, imagen_generada: generada, con_desacuerdo: conDesacuerdo, desacuerdos }
    const s = await P.salida({ client_id: enc.client_id, titulo: `Pieza ${enc.brief_id} · ${b.brief.red}`, contenido, metadata })
    if (s.ok) {
      output_id = s.output_id
      const q = await P.bandeja({ client_id: enc.client_id, output_id, titulo: `Aprobación · Pieza ${enc.brief_id} · ${b.brief.red} · versión ${e.artefactos['pieza_post']?.version ?? 1} · ${b.F.cliente_nombre}`, vista_previa: String(pz.pie_de_foto ?? '').slice(0, 280), metadata: { ...metadata, costo_usd: e.gasto_usd, enlace_entrega: ent ? ent.urls : null }, expires_at: (ent?.expires_at as string | null | undefined) ?? null })
      if (q.ok) hitl_id = q.id
    }
  }
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: enc.gasto_usd, estado: estadoFinal, con_desacuerdo: conDesacuerdo, imagen_generada: generada, salida_output_id: output_id, hitl_queue_id: hitl_id })
  await P.avisar({ canal: 'hilo', encargo_id: enc.id, texto: conDesacuerdo ? `⚠️ Con desacuerdo · ${enc.brief_id}${nota ? ` · ${nota}` : ''}` : `✅ En la bandeja · ${enc.brief_id} · US$ ${e.gasto_usd.toFixed(3)}`, dry_run: enc.dry_run })
  if (conDesacuerdo && !parcial) await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `⚠️ Encargo con desacuerdo · ${enc.brief_id}: ${desacuerdos.slice(0, 3).join(' | ')}`, dry_run: enc.dry_run })
  return r(200, {
    accion: 'cerrado', estado: estadoFinal, con_desacuerdo: conDesacuerdo, simulado: enc.dry_run, gasto_usd: e.gasto_usd, output_id, hitl_queue_id: hitl_id,
    resultado_para_la_sala: parcial ? 'cerrado_por_tope' : conDesacuerdo ? 'con_desacuerdo' : 'encargo_en_bandeja', sala_ref: enc.sala_ref, desacuerdos,
  })
}
