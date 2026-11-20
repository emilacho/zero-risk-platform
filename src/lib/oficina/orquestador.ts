/**
 * EL ORQUESTADOR · recorre una plantilla con el motor puro y las funciones de código, hablando con el mundo SOLO por los puertos (puertos.ts). Sin red propia, sin modelo propio.
 *  · `abrirEncargo`  → crea el encargo (idempotente) y avanza hasta el primer paso que espera a un empleado;
 *  · `avanzar`       → ejecuta pasos de código y del revisor externo en línea; se detiene en un paso de agente/portero y devuelve el PEDIDO (n8n lo ejecuta con run-sdk);
 *  · `recibirResultado` → recibe la respuesta del empleado, aplica el CONTRATO DE FORMATO y los VALIDADORES de código, registra el paso y sigue.
 * Reglas de oficio: `dry_run` explícito (en dry_run no se llama a ningún proveedor ni se escribe salida/bandeja); la oficina APAGADA no abre encargos (409); un fallo de formato tras el
 * reintento cierra el encargo como `fallido` (visible, nunca relleno); un fallo de Slack nunca frena nada; nadie pregunta al cliente.
 */
import { ARTEFACTO_ESPERA_DE_LA_CADENA, RESULTADO_ESPERANDO_A_LA_CADENA, RESULTADO_REEMPLAZADA, consultarLaCadena } from './espera-de-la-cadena'
import crypto from 'node:crypto'
import { CABECERA_SALTAR_EDITOR } from '../cadena/constantes'
import { datos, fichaNueva, opinionExterna, reglasParaPrompts, reglasVisuales } from './ayudas'
import { parsearBrief, planDeOrigen, prohibePersonas, proporcionDelBrief, protagonistasDelBrief, fechaLimiteDelBrief, type BriefLeido } from './brief'
import { briefEsDelEncargo, claseDeLaFamilia } from './familia-del-brief'
import { chequeosDePost, type FuentesDelCliente } from './chequeos'
import { corregirContactoDeLaPieza } from './contacto-ajeno'
import { comoDataUri, disenoDeAnuncio, textoEnImagenDe, textoEnImagenParaChequear } from './composicion'
import { encajarAProporcion } from './encaje'
import { aUtc, chequeosDeEntrega, cuandoSePublica, manifiesto, nombreDeArchivo, textoParaCopiar, leerMedidas, type ArchivoDeEntrega } from './entrega'
import { armarPedidoAlRevisor } from './ciego'
import type { SalidaDeRevision } from '../jefatura/revision/contrato'
import { fichasAlCierre, marcaDeObservaciones } from './reglas-duras'
import { aplicarSalidaDeJefatura, aplicarSinRevisar, costoDeLaJefatura, datosDeLaJefatura, llavesYaDevueltas, metadataDeLaJefatura, prefijoDeLaBandeja, reglasDurasNoTomadas, revisionIncompleta, sobreDeLaRevision, type OpcionesDeAplicacion } from './paso-jefatura'
import { contextoDeLaFicha, fichaDeLaHoja } from './sentido-contra-la-ficha'
import { chequeosExactos, fichaConCierreVivo } from './exactos-de-la-ficha'
import { fechaDeLaFila } from './piezas-por-publicar'
import { previueloDeLaminas } from './identidad-visual'
import { armarPedidoL, contextoDeRevisorL, decisionDeReImagenL, ejecutarCodigoL, familiaDeLaminas, procesarValorL, resumenDeCierreL, saltoL, sinLecturaDeMirarL } from './orquestador-laminas'
import { armarPedidoV, cabeLaVuelta, contextoDeRevisorV, costoDeVolver, ejecutarCodigoV, quedaVueltaDelPaso, enviarVideo, familiaDeVideo, procesarValorV, resumenDeCierreV, sinLecturaDeMirarV, sinLecturaDeRevisarImagenesClaveV, TOPE_POR_VIDEO } from './orquestador-video'
import { FUNCION_BORRADOR_VIDEO } from './video/borradores'
import { alLlegarAlPaso, decidir, FUNCION_APROBAR_PROPUESTAS, metadataDeAvisosDeConcepto, TURNO_DEL_DUENO, type DecisionDelDueno } from './video/aprobacion'
import { PASO_MIRAR_VIDEO } from './video/mirada'
import { PASO_REVISAR_IMAGENES_CLAVE } from './video/imagen-clave'
import { confianzaDeLaFoto } from './fotos'
import { candidatasDelEncargo } from './material-fotos'
import { fotoDeReferencia, fotosDeReferencia } from './foto-de-referencia'
import { reglasDeInvencion } from './prompts-sin-invencion'
import { marcaDeOrigenActiva, origenesDeImagenes } from './marcas-de-origen'
import { seccionDeCambiosDelDueno } from './cambios-del-dueno'
import { antesDeLasFotos, despuesDeUnAgente, pedirLoQueElAgenteNecesita, seccionDeMaterialParaElAgente } from './material-orquestador'
import { duenoDeLaFicha, registrarPaso, siguientePaso, type ResultadoDePaso } from './motor'
import { contextoDeHechos } from './hechos-del-negocio'
import { construirTarea, contextoDelRevisor, CONTRATOS_EN_TEXTO, resumenParaElJefe, type ContextoDePedido } from './pedidos'
import { seccionDeAutorevision, validarAutorevision, type NotaVista } from '../notas-del-dueno/autorevision'
import type { Cambios, Encargo, FuentesCompletas, Puertos, TurnoRegistrado } from './puertos'
import { chequearPrompts, citasExisten, derivarDecision, elegirVersion, veredictoDeImagenes, type ObservacionDeImagen, type ReglasDeImagen } from './reglas-de-imagen'
import { DESCARTAR_EYEBROW_LARGO, procesarSalida, proyectarAlEsquema, CORRECCIONES_DE_LARGO } from './salida'
import { agotaLasVersiones, alcanzaElTechoDeCortadas, MAX_VERSIONES_CORTADAS, MAX_VERSIONES_POR_BRIEF, rastroDe, type RastroDeEncargo } from './reapertura'
import { conCausaDelFallo, type OrigenDeCorteNuestro } from './causa-del-fallo'
import { decidirPuerta, TARGET_STEP_PRODUCIR, validarSobre, type Sobre } from './sobre'
import { CLAVE_DE_LA_PALANCA, FAMILIA_CON_MESA, familiaConMesa } from './mesa/con-mesa'
import { claseDe, tienePasarela } from './clase'
import { aplicarTopesPorDuracion, coberturaDelTope } from './topes-por-duracion'
import { CLAVE_DE_LA_DURACION, duracionDeLaPieza, segundosDelEncargo, topesPorSegundoDeVideo, type DuracionDeLaPieza } from './video/duracion-de-la-pieza'
import { estadoInicial, type Estado, type Ficha, type Paso, type Plantilla, type Siguiente } from './tipos'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')
const AGENTE_DEL_TEXTO = 'content-creator'
const AGENTE_DE_LA_IMAGEN = 'marketing_instagram_curator'

// ───────────────────────── lo que se arma a partir del estado
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
const turnoDe = (e: Estado) => e.pasos_ejecutados + 1

// ───────────────────────── abrir
/** r79 · D5 · la fila del calendario (id, fecha, hora) viaja con el encargo dentro de `sala_ref.fila`; sin esos datos `sala_ref` queda como llegó */
function salaRefConFila(ref: Record<string, unknown> | null | undefined, s: { fila_id?: string; fecha?: string; hora?: string }): Record<string, unknown> | null {
  if (!s.fecha && !s.fila_id) return ref ?? null
  return { ...(ref ?? {}), fila: { ...(s.fila_id ? { id: s.fila_id } : {}), ...(s.fecha ? { fecha: s.fecha } : {}), ...(s.hora ? { hora: s.hora } : {}) } }
}

/**
 * 17-nov · «creativos en cada paso» · la ruta a la versión con mesa (`mesa/con-mesa.ts`): solo una pieza NUEVA (sin reapertura ni devolución del dueño), con la palanca `creativos_con_mesa`
 * del cliente encendida y la plantilla con mesa ACTIVA. Cualquier lectura que falle = sin ruta: la pieza sigue EXACTA la línea de siempre. Devuelve la plantilla a abrir o null.
 */
async function rutaConMesa(P: Puertos, s: Sobre, clientId: string): Promise<{ familia: string; pl: { plantilla: Plantilla; activo: boolean; cruda?: Plantilla } } | null> {
  if (!s.familia || s.reabrir_causa_corregida || s.cambios_del_dueno || !FAMILIA_CON_MESA[s.familia] || !P.mesa?.configDeLaCadena) return null
  try {
    // la actividad de la versión con mesa se mira leyendo SU plantilla (abajo): aquí solo se decide si la palanca la pide
    const destino = familiaConMesa(s.familia, await P.mesa.configDeLaCadena(CLAVE_DE_LA_PALANCA), clientId, () => true)
    if (!destino || destino === s.familia) return null
    const pl = await P.almacen.leerPlantilla(destino)
    return pl && pl.activo ? { familia: destino, pl } : null
  } catch { return null }
}

export async function abrirEncargo(P: Puertos, entrada: { cuerpo: unknown; client_id: string; target_step_id: string; sala_ref?: Record<string, unknown> | null; prueba?: boolean; permitir_apagada?: boolean }): Promise<Respuesta> {
  const v = validarSobre(entrada.cuerpo)
  if (!v.ok) return r(400, { error: v.codigo, errores: v.errores })
  const config = await P.almacen.leerConfig()
  // fila #19 · la plantilla se lee ANTES de la puerta: si la familia tiene pieza simple lo dice la clase de su plantilla (dato), no su nombre
  // 17-nov · «creativos en cada paso» · con la palanca del cliente encendida, una pieza NUEVA abre la versión CON MESA de su familia (si está activa); una reapertura o una devolución del dueño sigue en la línea en que nació
  const ruta = entrada.target_step_id === TARGET_STEP_PRODUCIR && v.sobre.familia ? await rutaConMesa(P, v.sobre, entrada.client_id) : null
  const pl = ruta ? ruta.pl : entrada.target_step_id === TARGET_STEP_PRODUCIR && v.sobre.familia ? await P.almacen.leerPlantilla(v.sobre.familia) : null
  const clase = claseDe(pl?.plantilla)
  const dec = decidirPuerta(v.sobre, entrada.permitir_apagada ? { ...config, estado: 'encendida', familias_activas: [v.sobre.familia ?? ''] } : config, entrada.target_step_id, entrada.client_id, !tienePasarela(clase))
  if (dec.accion === 'rechazar') return r(400, { error: 'origen_no_aceptado', detalle: `solo se acepta ${TARGET_STEP_PRODUCIR}` })
  if (dec.accion === 'pasarela') return r(409, { error: 'oficina_no_abre', motivo: dec.motivo, detalle: 'la oficina no abre este encargo; el sobre sigue por la pieza simple (pasarela)' })
  // T8 · el video no tiene pieza simple: el sobre espera a que la mesa de video esté activa (el flujo NO debe mandarlo por la pasarela)
  if (dec.accion === 'sin_sala') return r(409, { error: 'sin_sala', familia: dec.familia, motivo: dec.motivo, sin_pasarela: true, detalle: `la familia ${dec.familia} no tiene pieza simple: el sobre espera a que la oficina la abra; no sigue por la pasarela` })
  if (!pl) return r(404, { error: 'plantilla_desconocida', familia: dec.familia })
  // fila #19 · una plantilla que no declara su clase no abre encargos: no se adivina por el nombre (antes caía como «post»)
  if (!clase) return r(409, { error: 'plantilla_sin_clase', familia: dec.familia, detalle: `la plantilla ${dec.familia} no declara su clase (post_img · carrusel · kit · video · interna) en oficina_tipos_de_grupo.clase: la oficina no la abre hasta que la declare` })
  if (!pl.activo && !entrada.permitir_apagada) return r(409, { error: 'plantilla_inactiva', familia: dec.familia, ...(!tienePasarela(clase) ? { sin_pasarela: true } : {}) })
  // 17-nov · T7a · los topes que crecen con la pieza (idempotente: el almacén real ya los aplicó) y la condición 1 de CC6: el tope con que nace el encargo (el menor entre
  //   el sobre y la plantilla) cubre una pasada por los pasos que gastan; si no, el encargo NO nace (antes nacía y se cortaba a medias, con lo gastado perdido)
  // 19-nov · G5b · el video: la duración la define la GRAN IDEA (firma de Emilio, GO Lenovo 15:05 Zúrich; la hoja la copia en `DURACIÓN`) y los topes de ESTE encargo se calculan con ella (no con la pieza más
  //   larga que admite la plantilla). El tope con que nace el encargo es el de la campaña (el sobre, hasta el techo de la plantilla): si el guion pide más, los topes
  //   se recalculan dentro de él. La cobertura se mide con la duración de la idea
  const cruda = pl.cruda ?? pl.plantilla
  let duracion: DuracionDeLaPieza | null = null
  if (topesPorSegundoDeVideo(cruda)) {
    const parte = await P.parte(v.sobre.parte_id, entrada.client_id)
    duracion = duracionDeLaPieza(parte ? parsearBrief(parte.texto, v.sobre.brief_id) : null, cruda)
  }
  const topes = aplicarTopesPorDuracion(cruda)
  if (topes.errores.length) return r(409, { error: 'topes_invalidos', familia: dec.familia, detalle: topes.errores.join(' · ') })
  const plantillaDelEncargo = topes.plantilla
  const topeDelEncargo = Math.min(v.sobre.tope_usd ?? plantillaDelEncargo.limites.tope_encargo_usd, plantillaDelEncargo.limites.tope_encargo_usd)
  const deLaPieza = duracion ? aplicarTopesPorDuracion(cruda, duracion.segundos).plantilla : plantillaDelEncargo
  const cobertura = coberturaDelTope(deLaPieza, Math.min(topeDelEncargo, deLaPieza.limites.tope_encargo_usd))
  if (!cobertura.cubre) return r(409, { error: 'tope_no_cubre', familia: dec.familia, requerido_usd: cobertura.requerido, tope_usd: topeDelEncargo, detalle: `${cobertura.detalle}: el encargo no se abre para no cortarse a medias` })
  // 28-oct · CHEQUEO GRATIS de la puerta del portero: si el portero no contesta (llave rota tras una rotación, flujo apagado), el encargo NO se crea ni gasta; una sola alarma por incidente
  if (P.chequearPortero && pl.plantilla.pasos.some((x) => x.tipo === 'portero')) {
    const ch = await P.chequearPortero()
    if (!ch.ok) {
      await P.avisar({ canal: 'alertas', encargo_id: v.sobre.brief_id, texto: `🚪 La oficina no puede hablar con el portero (${ch.detalle}). Las piezas esperan; no se gasta nada hasta que se arregle la llave de la puerta.`, dry_run: v.sobre.dry_run })
      return r(409, { error: 'portero_no_responde', detalle: ch.detalle, pendiente: 'puerta_del_portero' })
    }
  }
  // 21-oct · PRE-VUELO de las láminas: sin identidad visual legible o sin carpeta (slug) el encargo NO se crea (antes nacía y cerraba `fallido` a los 3 s); queda pendiente del re-proceso visual. Una lectura que falla no bloquea (el paso `abrir` la vuelve a leer y lo dice)
  if (familiaDeLaminas(pl.plantilla)) {
    const fu = await P.fuentes(entrada.client_id)
    const falta = 'error' in fu ? null : previueloDeLaminas(fu)
    if (falta) return r(409, { error: falta.error, familia: dec.familia, detalle: falta.detalle, pendiente: 'reproceso_visual' })
  }
  const s: Sobre = v.sobre
  const tope = topeDelEncargo
  const salaBase = ruta ? { ...(salaRefConFila(entrada.sala_ref, s) ?? {}), con_mesa: { de: dec.familia, a: ruta.familia } } : salaRefConFila(entrada.sala_ref, s)
  const c = await P.almacen.crearEncargo({ client_id: entrada.client_id, parte_id: s.parte_id, brief_id: s.brief_id, tipo_de_grupo: pl.plantilla.tipo, familia: ruta ? ruta.familia : dec.familia, tope_usd: tope, dry_run: s.dry_run, prueba: !!entrada.prueba, sala_ref: duracion ? { ...(salaBase ?? {}), [CLAVE_DE_LA_DURACION]: duracion } : salaBase, estado_del_motor: estadoInicial(), ...(s.reabrir_causa_corregida ? { reabrir_causa: s.reabrir_causa_corregida } : {}), ...(s.cambios_del_dueno ? { cambios_del_dueno: s.cambios_del_dueno } : {}) })
  if (!c.ok) return r(500, { error: 'almacen_error', detalle: c.error })
  if (!c.nuevo) return r(200, { accion: 'ya_existia', encargo_id: c.encargo.id, estado: c.encargo.estado })
  const sal = await avanzar(P, c.encargo.id)
  return r(sal.status, { ...sal.cuerpo, encargo_id: c.encargo.id, ignorados: v.ignorados })
}

// ───────────────────────── avanzar
export async function plantillaDe(P: Puertos, enc: Encargo): Promise<Plantilla> {
  const p = await P.almacen.leerPlantilla(enc.familia)
  if (!p) throw new Error(`plantilla «${enc.familia}» no existe`)
  // el tope de ESTE encargo (el del sobre, nunca más que el de la plantilla) manda sobre el de la plantilla
  // 17-nov · T7a · idempotente (el almacén real ya los aplicó): un almacén que no los aplica no deja al motor con la parte fija sola
  // 19-nov · G5b · los topes con la duración de ESTE encargo (la del brief, o la recalculada por el guion) sobre la plantilla cruda; sin cruda, como antes
  const cruda = p.cruda ?? p.plantilla
  const pl = aplicarTopesPorDuracion(cruda, segundosDelEncargo(enc, cruda)).plantilla
  return { ...pl, limites: { ...pl.limites, tope_encargo_usd: Math.min(pl.limites.tope_encargo_usd, enc.tope_usd) } }
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
    if (['cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'].includes(enc.estado)) return r(200, { accion: 'cerrado', estado: enc.estado, con_desacuerdo: enc.con_desacuerdo })
    const abierto = await P.almacen.turnoAbierto(enc.id)
    if (abierto) {
      // un «siguiente» repetido no abre otro paso: ENTREGA DE NUEVO el mismo pedido (mismo número, misma dispatch_key)
      // el turno abierto es el de MATERIAL (el portero está trayendo lo pedido): se contesta con la MISMA acción que al abrirlo; nunca se re-entrega el pedido del agente
      if (abierto.tipo === 'material') return r(200, { accion: 'esperar_material', reentrega: true, turno: { n: abierto.n, paso: abierto.paso, tipo: 'material', dispatch_key: abierto.dispatch_key } })
      // el turno abierto es el del BRAZO DE VIDEO (el proveedor está filmando): la misma acción que al abrirlo; el vigía sondea y registra cuando termine
      if (abierto.tipo === 'brazo') return r(200, { accion: 'esperar_brazo', reentrega: true, turno: { n: abierto.n, paso: abierto.paso, tipo: 'brazo', dispatch_key: abierto.dispatch_key } })
      // 16-nov · Sprint 2 · el encargo espera al DUEÑO (propuestas del video): la misma acción que al abrirlo; lo despierta el tablero cuando el dueño decide
      if (abierto.tipo === TURNO_DEL_DUENO) return r(200, { accion: 'esperar_dueno', reentrega: true, turno: { n: abierto.n, paso: abierto.paso, tipo: TURNO_DEL_DUENO, dispatch_key: abierto.dispatch_key } })
      if (abierto.paso.startsWith('mesa:')) return (await import('./mesa/orquestador')).reentregaDelTurno(P, enc, abierto, pl.limites.tope_encargo_usd)
      const sg = siguientePaso(enc.estado_del_motor, pl)
      if (sg.accion === 'ejecutar' && (sg.paso.tipo === 'agente' || sg.paso.tipo === 'portero')) {
        const a = armarPedido(enc, pl, sg.paso, enc.estado_del_motor)
        return r(200, { accion: 'esperar', reentrega: true, turno: { n: abierto.n, paso: abierto.paso, tipo: abierto.tipo, agente: abierto.agente, dispatch_key: abierto.dispatch_key, pedido: a.pedido } })
      }
      // el turno abierto es el de la JEFATURA: se contesta con la MISMA acción que al abrirlo (el flujo `oficina · turno` la conoce y termina sin error); nunca «esperar» sin pedido
      if (abierto.tipo === 'jefatura') return r(200, { accion: 'esperar_jefatura', reentrega: true, turno: { n: abierto.n, paso: abierto.paso, tipo: 'jefatura', dispatch_key: abierto.dispatch_key } })
      return r(200, { accion: 'esperar', turno: { n: abierto.n, paso: abierto.paso, agente: abierto.agente, dispatch_key: abierto.dispatch_key }, nota: 'ya hay un paso esperando respuesta' })
    }
    const sig = siguientePaso(enc.estado_del_motor, pl)
    if (sig.accion === 'fin') return cerrar(P, enc, pl, false)
    if (sig.accion === 'cierre_por_tope') return cerrarPorTope(P, enc, pl, sig.razon, sig.detalle)
    const paso = pl.pasos[sig.indice]
    const e = enc.estado_del_motor
    try {
      if (paso.tipo === 'codigo' && paso.funcion === 'mesa') return (await import('./mesa/orquestador')).avanzarMesa(P, enc, pl, sig.indice, sig.vuelta)
      if (paso.tipo === 'codigo' && (paso.funcion === 'video' || paso.funcion === FUNCION_BORRADOR_VIDEO)) {
        // EL BRAZO DE VIDEO (parte 2 · 31-oct): en dry_run el paso cierra en el acto (simulado); en real abre un turno `brazo` y espera al vigía
        const out = await enviarVideo(P, enc, pl, paso)
        if (out.fallido) return fallar(P, enc, out.fallido)
        if (out.esperar) return r(200, out.esperar)
        enc = await aplicar(P, enc, pl, sig.indice, out.res!, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'codigo', agente: null, dispatch_key: null, cost_usd: 0 } })
        continue
      }
      if (paso.tipo === 'codigo' && paso.funcion === FUNCION_APROBAR_PROPUESTAS) {
        // 16-nov · Sprint 2 · S2-1 parte B · la ÚNICA parada del video: con propuestas, el encargo espera al dueño (turno `dueno`); sin propuestas, pasa de largo
        const ll = alLlegarAlPaso(e)
        if ('saltar' in ll) { enc = await aplicar(P, enc, pl, sig.indice, ll.saltar, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'codigo', agente: null, dispatch_key: null, cost_usd: 0 } }); continue }
        const n = turnoDe(e)
        const dispatch_key = `${enc.id}:${n}`
        await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd, estado: 'en_paso', turno: { n, paso: paso.clave, tipo: TURNO_DEL_DUENO, agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 } })
        return r(200, { accion: 'esperar_dueno', turno: { n, paso: paso.clave, tipo: TURNO_DEL_DUENO, dispatch_key }, ronda: ll.ronda })
      }
      if (paso.tipo === 'codigo') {
        // MATERIAL · antes de asignar/elegir fotos: si faltan fotos propias aptas, se le PIDE al portero (apagado por omisión: devuelve null y todo sigue igual)
        if (paso.funcion === 'asignar_fotos' || paso.funcion === 'elegir_foto') {
          const m = await antesDeLasFotos(P, enc, pl, paso.clave)
          if (m) return m
        }
        const out = await ejecutarCodigo(P, enc, pl, paso)
        if (out.fallido) return fallar(P, enc, out.fallido)
        enc = await aplicar(P, enc, pl, sig.indice, out.res, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'codigo', agente: null, dispatch_key: null, cost_usd: out.res.costo_usd }, gastos: out.gastos, usos: out.usos, imagen_generada: out.imagen_generada })
        if (paso.funcion === 'cierre') return cerrar(P, enc, pl, false)
        continue
      }
      if (paso.tipo === 'jefatura') {
        // J8a · la pieza ya pasó los chequeos duros: se abre UNA revisión en la jefatura y se espera su cierre
        const material = materialDeLaRevision(pl, e)
        // 01-nov · un revisor nunca tiene menos contexto que quien escribe; si el puerto falla, se dice y la revisión sigue
        const carpeta = P.carpetaParaRevisar ? await P.carpetaParaRevisar(String(enc.client_id)).catch((x: unknown) => [{ titulo: 'La carpeta del cliente', funcion: 'lo que el negocio sabe', texto: `(no se pudo leer: ${x instanceof Error ? x.message : String(x)}. No lo tomes como que no existe.)` }]) : []
        // 17-nov · coherencia con los hechos: el bloque de Cerebro (o el aviso de que no lo hay) va SIEMPRE como un documento más del revisor
        const hechos = contextoDeHechos(P.hechosDelNegocio ? await P.hechosDelNegocio(String(enc.client_id)).catch((x: unknown) => ({ no_se_pudo_leer: x instanceof Error ? x.message : String(x) })) : null)
        // cambio 4 · la ficha de la oferta, tal cual la trae la hoja: SOLO si la hay (sin ficha el pedido queda como antes)
        const ficha = contextoDeLaFicha(fichaDeLaHoja(briefDe(e)?.texto))
        // 19-nov · ADENDA 1 · P2b: el resumen del encargo (red, formato, objetivo, llamado) va al jefe como un documento más, en las tres familias
        const hoja = briefDe(e)
        const resumen = resumenParaElJefe(hoja)
        const sobre = sobreDeLaRevision(enc, pl, e, { pieza: material.pieza, imagenes: material.imagenes, contexto: [...resumen, ...material.contexto, ...carpeta, hechos, ...(ficha ? [ficha] : [])] })
        const ap = P.jefatura ? await P.jefatura(sobre) : ({ estado: 'error', motivo: 'el puerto de la jefatura no está configurado' } as const)
        if (ap.estado === 'esperando') {
          const n = turnoDe(e)
          const dispatch_key = `${enc.id}:${n}`
          await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd, estado: 'en_paso', turno: { n, paso: paso.clave, tipo: 'jefatura', agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 } })
          return r(200, { accion: 'esperar_jefatura', turno: { n, paso: paso.clave, tipo: 'jefatura', dispatch_key }, revision_id: ap.revision_id })
        }
        if (ap.estado !== 'cerrada') await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `⚠️ La jefatura no revisó la pieza · ${enc.brief_id}: ${ap.motivo}; sigue a la bandeja marcada «sin revisar»`, dry_run: enc.dry_run })
        const res = ap.estado === 'cerrada' ? aplicarSalidaDeJefatura(pl, e, ap.salida, { reImagen: reImagenDe(pl, e), puedeVolverALaMesa: puedeVolverALaMesa(pl, paso, e), sentido: await sentidoDe(P, enc, e, material.pieza) }) : aplicarSinRevisar(ap.motivo)
        enc = await aplicar(P, enc, pl, sig.indice, res, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'jefatura', agente: null, dispatch_key: null, cost_usd: res.costo_usd } })
        continue
      }
      if (paso.tipo === 'externo') {
        const out = await ejecutarExterno(P, enc, pl, paso)
        enc = await aplicar(P, enc, pl, sig.indice, out.res, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: 'externo', agente: paso.quien, dispatch_key: null, cost_usd: out.res.costo_usd }, gastos: out.gastos })
        continue
      }
      // portero y agente: salto sin llamar a nadie si no hay nada que hacer
      const salto = familiaDeLaminas(pl) ? saltoL(paso, e) : saltoPorFalta(paso, e)
      if (salto) { enc = await aplicar(P, enc, pl, sig.indice, salto, { vuelta: sig.vuelta, turno: { paso: paso.clave, tipo: paso.tipo, agente: null, dispatch_key: null, cost_usd: 0 } }); continue }
      const { agente, pedido } = armarPedido(enc, pl, paso, e)
      const n = turnoDe(e)
      const dispatch_key = `${enc.id}:${n}`
      await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd, estado: 'en_paso', turno: { n, paso: paso.clave, tipo: paso.tipo, agente, estado: 'corriendo', dispatch_key, cost_usd: 0 } })
      return r(200, { accion: 'esperar', turno: { n, paso: paso.clave, tipo: paso.tipo, agente, dispatch_key, pedido } })
    } catch (err) {
      // 11-nov · regla (b) · un error de NUESTRO código corta la versión por causa nuestra: no cuenta entre las 3
      return fallar(P, enc, `error interno en «${paso.clave}»: ${err instanceof Error ? err.message : String(err)}`, 'error_interno')
    }
  }
  // 11-nov · regla (b) · a propósito SIN marca de corte nuestro: un motor que da vueltas sin avanzar no debe repetirse libre; cuenta como intento (pedido de CC7 al certificar #1057)
  return fallar(P, enc, 'el orquestador dio más de 80 vueltas (no debería pasar)')
}
/** la re-imagen que ya existía, según la familia: la jefatura devuelve «imagen por rehacer» y la oficina decide si cabe */
const reImagenDe = (pl: Plantilla, e: Estado) => (tomada: { razon: string } | null): Record<string, unknown> => {
  if (familiaDeLaminas(pl)) return decisionDeReImagenL(e, pl, tomada)
  const re = decidirReImagen(e, pl, !!tomada)
  return { re_imagen: re.si, por_rehacer_humano: !!tomada && !re.si, motivo: re.motivo, razon: tomada?.razon ?? null }
}

/**
 * 17-nov · GO Lenovo (d) · ¿la pieza puede volver a la mesa desde el paso `jefatura`? Solo si la plantilla lo declara (`vuelve_a` a la mesa), le queda la vuelta y cabe en el tope
 * contando lo que costó ESTA revisión (la vuelta repite la mesa y lo que sigue, incluida otra revisión). Sin `vuelve_a`, nunca (la pieza va a la bandeja como siempre).
 */
/** lo que ve el revisor de la jefatura (la misma función para abrir la revisión y para aplicar lo que vuelve) */
function materialDeLaRevision(pl: Plantilla, e: Estado) {
  return familiaDeLaminas(pl) ? contextoDeRevisorL(pl, e) : familiaDeVideo(pl) ? contextoDeRevisorV(pl, e) : contextoDelRevisor(contexto(e))
}
/** la hoja de la pieza (el brief leído); un encargo sin ella no tiene ficha */
const briefDe = (e: Estado): BriefLeido | null => (datos(e, 'encargo') as unknown as Partial<Base> | undefined)?.brief ?? null
/** cambio 4 · lo que la aplicación necesita para el sentido: la ficha de la hoja, la pieza, la fila (la del calendario o, si no viaja, el brief, que es su id) y lo ya devuelto */
/**
 * 19-nov · caso 3 del grupo 2 (nada se frena) · ¿la pieza está en una campaña? Sin campaña, sus correcciones no tienen a quién volver en la cadena:
 * la jefatura las manda al creador DE LA PIEZA (la vuelta a la mesa de #1182). Se decide solo con lo que se SABE: sin parte, o un parte leído sin campaña.
 * Si la lectura falla, no se decide nada (queda como antes) · la espera de la cadena lo vuelve a mirar.
 */
export async function piezaSinCampana(P: Pick<Puertos, 'parte'>, enc: Pick<Encargo, 'parte_id' | 'client_id'>): Promise<boolean> {
  if (!enc.parte_id) return true
  try {
    const parte = await P.parte(enc.parte_id, enc.client_id)
    return !(typeof parte?.campana_id === 'string' && parte.campana_id.trim())
  } catch {
    return false
  }
}

async function sentidoDe(P: Pick<Puertos, 'hechosPorOferta' | 'parte'>, enc: Pick<Encargo, 'id' | 'brief_id' | 'sala_ref' | 'client_id' | 'parte_id' | 'dry_run'>, e: Estado, textoDeLaPieza: string): Promise<OpcionesDeAplicacion['sentido']> {
  const fila = (enc.sala_ref?.fila as { id?: unknown } | undefined)?.id
  // firma de Emilio · si la revisión anterior mandó correcciones a la mesa, esta revisión lee lo que respondió el creador (la mesa guardó sus líneas al cerrar)
  const enviadas = datosDeLaJefatura(e)?.sentido?.enviadas ?? []
  const lineas = datos(e, 'mesa')?.respuestas_a_la_jefatura
  const previas = enviadas.length ? { enviadas, lineasDeRespuesta: Array.isArray(lineas) ? lineas.filter((l): l is string => typeof l === 'string') : [] } : null
  // D1 · el estado de la oferta en la fecha de la fila se lee EN VIVO del cerebro y, si choca con la hoja, manda el cerebro (18-nov · #1147 · Lenovo).
  // Una sola lectura por revisión, sin gasto; si no se puede, vale lo de la hoja y se declara «sin verificar»
  const deLaHoja = fichaDeLaHoja(briefDe(e)?.texto)
  const hechos = deLaHoja.oferta && P.hechosPorOferta ? await P.hechosPorOferta(String(enc.client_id)).catch(() => null) : null
  const vivo = fichaConCierreVivo(deLaHoja, hechos, fechaDeLaFila(enc.sala_ref))
  // sin campaña, ninguna fila de la cadena: todo lo que vio la jefatura vuelve al creador de la pieza (`aPieza` en `sentidoDeLaRevision`).
  //   Solo en lo real: el ensayo no toca la cadena (sus devoluciones se declaran y la pieza sigue), así que ahí no cambia nada
  const sinCampana = !enc.dry_run && (await piezaSinCampana(P, enc))
  return { ficha: vivo.ficha, declarado: vivo.declarado, textoDeLaPieza, filaId: sinCampana ? null : typeof fila === 'string' && fila ? fila : enc.brief_id || null, encargoId: enc.id, yaDevueltas: llavesYaDevueltas(e), exactos: chequeosExactos, previas }
}

export function puedeVolverALaMesa(pl: Plantilla, paso: Paso, e: Estado): ((costo: number) => boolean) | undefined {
  if (paso.vuelve_a?.paso !== 'mesa' || !quedaVueltaDelPaso(paso, e)) return undefined
  // 18-nov · con varias vueltas por regla dura, también tiene que caber en los PASOS: lo que falta desde la mesa hasta el final, dentro de plantilla + margen
  //   (sin esto, la vuelta empezaría y el motor cerraría por tope de pasos a mitad de camino)
  const iMesa = pl.pasos.findIndex((x) => x.clave === 'mesa')
  const cabenLosPasos = iMesa >= 0 && e.pasos_ejecutados + (pl.pasos.length - iMesa) < pl.pasos.length + pl.limites.margen
  return (costo) => cabenLosPasos && cabeLaVuelta(pl, { ...e, gasto_usd: e.gasto_usd + costo }, costoDeVolver(pl, paso))
}

/**
 * J8a · la revisión de la jefatura cerró y entregó (webhook a `/api/jefatura/oficina-vuelta`): se aplica al encargo y sigue. IDEMPOTENTE: si el paso ya se aplicó (entrega repetida), solo avanza.
 */
export async function recibirJefatura(P: Puertos, encargoId: string, salida: SalidaDeRevision): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  if (salida.artifact_id !== enc.id) return r(409, { error: 'salida_de_otro_encargo' })
  const pl = await plantillaDe(P, enc)
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.tipo !== 'jefatura') return avanzar(P, enc.id)
  const sig = siguientePaso(enc.estado_del_motor, pl)
  if (sig.accion !== 'ejecutar' || sig.paso.tipo !== 'jefatura') return r(409, { error: 'sin_paso_pendiente' })
  const e = enc.estado_del_motor
  await aplicar(P, enc, pl, sig.indice, aplicarSalidaDeJefatura(pl, e, salida, { reImagen: reImagenDe(pl, e), puedeVolverALaMesa: puedeVolverALaMesa(pl, sig.paso, e), sentido: await sentidoDe(P, enc, e, materialDeLaRevision(pl, e).pieza) }), { vuelta: sig.vuelta, turno: { paso: sig.paso.clave, tipo: 'jefatura', agente: null, dispatch_key: abierto.dispatch_key, cost_usd: costoDeLaJefatura(salida.costo_usd) } })
  return avanzar(P, enc.id)
}

/**
 * 16-nov · Sprint 2 · S2-1 parte B · el DUEÑO decidió las propuestas del video (desde el tablero): se aplica al paso que espera y el encargo sigue solo.
 * Solo vale si el encargo está esperando al dueño en ese paso y la tarjeta muestra la ronda vigente; si no, se dice por qué y no se toca nada.
 */
export async function recibirDecisionDelDueno(P: Puertos, encargoId: string, d: DecisionDelDueno): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente', detalle: 'no existe ese encargo' })
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.tipo !== TURNO_DEL_DUENO) return r(409, { error: 'no_espera_al_dueno', detalle: `el encargo no está esperando la decisión del dueño (está «${enc.estado}»)` })
  const pl = await plantillaDe(P, enc)
  const sig = siguientePaso(enc.estado_del_motor, pl)
  if (sig.accion !== 'ejecutar' || sig.paso.funcion !== FUNCION_APROBAR_PROPUESTAS) return r(409, { error: 'no_espera_al_dueno', detalle: 'el paso pendiente no es la aprobación de las propuestas' })
  const dec = decidir(enc.estado_del_motor, sig.paso, d)
  if (!dec.ok) return r(dec.status, { error: dec.error, detalle: dec.detalle })
  await aplicar(P, enc, pl, sig.indice, dec.res, { vuelta: sig.vuelta, turno: { paso: sig.paso.clave, tipo: TURNO_DEL_DUENO, agente: null, dispatch_key: abierto.dispatch_key, cost_usd: 0 } })
  const sal = await avanzar(P, enc.id)
  return r(sal.status, { ...sal.cuerpo, decision: dec.aprobacion })
}

/** J8a · la revisión nunca contestó (el vigía de la oficina esperó de más): la pieza sigue marcada «sin revisar»; nunca se pierde */
export async function jefaturaSinRespuesta(P: Puertos, encargoId: string, motivo: string): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const pl = await plantillaDe(P, enc)
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.tipo !== 'jefatura') return avanzar(P, enc.id)
  const sig = siguientePaso(enc.estado_del_motor, pl)
  if (sig.accion !== 'ejecutar' || sig.paso.tipo !== 'jefatura') return r(409, { error: 'sin_paso_pendiente' })
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.gasto_usd, turno: { n: abierto.n, paso: sig.paso.clave, tipo: 'jefatura', agente: null, estado: 'muerto', dispatch_key: abierto.dispatch_key, cost_usd: 0, error: motivo } })
  await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `⚠️ La jefatura no contestó · ${enc.brief_id}: ${motivo}; sigue a la bandeja marcada «sin revisar»`, dry_run: enc.dry_run })
  await aplicar(P, enc, pl, sig.indice, aplicarSinRevisar(motivo), { vuelta: sig.vuelta, turno: { paso: sig.paso.clave, tipo: 'jefatura', agente: null, dispatch_key: null, cost_usd: 0 } })
  return avanzar(P, enc.id)
}

const contexto2 = (e: Estado): ContextoDePedido | null => (datos(e, 'encargo') ? contexto(e) : null)

/** el agente y el pedido de un paso de agente o de portero (puro: sale del estado, así se puede volver a entregar) */
function armarPedido(enc: Encargo, pl: Plantilla, paso: Paso, e: Estado, errorDeFormato?: string): { agente: string; pedido: Record<string, unknown> } {
  if (paso.revisa) return armarPedidoDeAutorevision(enc, pl, paso, e, errorDeFormato)
  if (familiaDeLaminas(pl)) {
    // salas 2 y 3: el agente de cada paso es el que dice la plantilla (los hallazgos tienen un paso por dueño)
    const t = paso.tipo === 'agente' ? armarPedidoL(pl, paso, e, errorDeFormato ? { errorDeFormato } : undefined) : null
    const tm0 = t && seccionDeMaterialParaElAgente(e, paso.clave) ? { ...t, task: t.task + seccionDeMaterialParaElAgente(e, paso.clave) } : t
    const tm = tm0 ? { ...tm0, task: tm0.task + seccionDeCambiosDelDueno(enc.sala_ref) } : tm0
    return { agente: paso.quien, pedido: pedidoDe(enc, pl, paso, paso.quien, tm, e) }
  }
  // 11-nov · la sala de video: el agente que mira el video tiene su pedido propio (los cuadros y el guion)
  const tv = familiaDeVideo(pl) && paso.tipo === 'agente' ? armarPedidoV(paso, e, errorDeFormato) : null
  if (tv) return { agente: paso.quien, pedido: pedidoDe(enc, pl, paso, paso.quien, tv, e) }
  const agente = paso.quien === 'dueno_del_donde' ? AGENTE_DEL_TEXTO : paso.quien
  const fichasPropias = paso.clave === 'corrige' || paso.clave === 'decide' || paso.clave === 'decide_imagen' ? fichasQueTocan(e, paso) : []
  const t = paso.tipo === 'agente' ? construirTarea(paso.clave, { ...contexto2(e)!, sinFoto: pl.limites.generar_cuando_no_hay_foto === true }, { fichas: fichasPropias, ...(errorDeFormato ? { errorDeFormato } : {}) }) : null
  const tm0 = t && seccionDeMaterialParaElAgente(e, paso.clave) ? { ...t, task: t.task + seccionDeMaterialParaElAgente(e, paso.clave) } : t
  const tm = tm0 ? { ...tm0, task: tm0.task + seccionDeCambiosDelDueno(enc.sala_ref) } : tm0
  return { agente, pedido: pedidoDe(enc, pl, paso, agente, tm, e) }
}

/**
 * EL SEGUNDO CEREBRO · el pedido de la auto-revisión: el MISMO pedido del paso que revisa (mismo agente, mismo contexto, mismas imágenes) con una sección al final que trae sus notas y su entrega actual.
 * Las notas SOLO viajan en este pedido: nunca en el del paso original, ni en el de la jefatura, ni en el del revisor GPT.
 */
function armarPedidoDeAutorevision(enc: Encargo, pl: Plantilla, paso: Paso, e: Estado, errorDeFormato?: string): { agente: string; pedido: Record<string, unknown> } {
  const revisado = pl.pasos.find((x) => x.clave === paso.revisa)
  if (!revisado?.salida) throw new Error(`la auto-revisión «${paso.clave}» apunta a «${paso.revisa}», que no es un paso de agente`)
  const original = armarPedido(enc, pl, revisado, e)
  const notas = (datos(e, 'notas_del_dueno')?.notas ?? []) as NotaVista[]
  const actual = proyectarAlEsquema(revisado.salida.esquema, datos(e, revisado.salida_artefacto)) ?? {}
  const seccion = seccionDeAutorevision({ piezaActual: actual, notas, contratoOriginal: CONTRATOS_EN_TEXTO[revisado.salida.esquema] ?? null, ...(errorDeFormato ? { errorDeFormato } : {}) })
  const extra = (original.pedido.extra ?? {}) as Record<string, unknown>
  return { agente: original.agente, pedido: { ...original.pedido, task: `${String(original.pedido.task)}

${seccion}`, esquema: 'autorevision.v1', max_budget_usd: paso.tope_usd, extra: { ...extra, paso_de_la_oficina: paso.clave } } }
}

/** la indicación de ESTE agente en ESTA sala: sus reglas numeradas (encima de su identidad; la identidad no se edita) */
export function indicacionDe(pl: Plantilla, agente: string): string {
  const reglas = pl.indicaciones[agente] ?? []
  if (!reglas.length) return ''
  return ['Indicación de esta sala (capa local; el texto de tu identidad no cambia):', ...reglas.map((x, i) => `${i + 1}. ${x.regla}`)].join('\n')
}

export function pedidoDe(enc: Encargo, pl: Plantilla, paso: Paso, agente: string, t: { task: string; images: string[]; esquema: string } | null, e: Estado): Record<string, unknown> {
  if (paso.tipo === 'portero') {
    const b = base(e)
    return { destino: 'portero', cuerpo: { cliente: enc.client_id, voy_a_producir: { entregable: b.brief.id, red: b.brief.red, formato: b.brief.formato, que_es: b.brief.que_es, protagonista: b.brief.protagonista }, ya_trae: ['manual_vigente', 'fotos_etiquetadas'], ronda: 1 }, dry_run: enc.dry_run }
  }
  return {
    agent_name: agente, task: t!.task, images: t!.images.map((url) => ({ url })), esquema: t!.esquema,
    // 04-nov · de qué trabajo es la llamada: el encargo es la pieza (el mismo id que recibe la jefatura como `artifact_id`)
    trabajo_tipo: 'pieza', trabajo_id: enc.id,
    extra: { indicacion_oficina: indicacionDe(pl, agente), paso_de_la_oficina: paso.clave, encargo_id: enc.id }, max_budget_usd: paso.tope_usd, thinking_mode: 'maximo', dry_run: enc.dry_run, client_id: enc.client_id,
    workflow_hint: 'oficina · turno',
    headers_requeridos: { [CABECERA_SALTAR_EDITOR]: '1' },
  }
}

/** fichas abiertas cuyo dueño es el agente del texto (las de imagen o sin dueño se declaran sin tomar: la imagen solo se rehace en «mirar») */
function fichasQueTocan(e: Estado, paso: Paso): Ficha[] {
  const origen = paso.clave === 'corrige' ? 'jefe' : 'externa'
  const dueno = paso.clave === 'decide_imagen' ? AGENTE_DE_LA_IMAGEN : AGENTE_DEL_TEXTO
  return e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && duenoDeLaFicha(f) === dueno && (origen === 'externa' || f.gravedad === 'bloquea'))
}

function saltoPorFalta(paso: Paso, e: Estado): ResultadoDePaso | null {
  if (paso.clave === 'corrige' || paso.clave === 'decide') {
    const origen = paso.clave === 'corrige' ? 'jefe' : 'externa'
    const propias = fichasQueTocan(e, paso)
    // las demás abiertas de ese origen no tienen quién las resuelva en esta ronda: se declaran SIN tomar
    const huerfanas = e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && !propias.includes(f) && (origen === 'externa' ? duenoDeLaFicha(f) !== AGENTE_DE_LA_IMAGEN : f.gravedad === 'bloquea'))
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

/**
 * 11-nov · GO Lenovo 12:52 Zúrich · «mirar» respondió (con su reintento) pero la respuesta no se pudo LEER: «no pude leer» nunca es «descartar» (la forma de #1014).
 * La imagen que se le mostró sigue en la pieza tal cual (nadie dijo que no cumpla) y una ficha QUE BLOQUEA pide que una persona la mire: no pasa sola.
 * Una re-imagen ilegible no pisa nada: se queda la imagen anterior.
 */
export function sinLecturaDeMirar(paso: Paso, e: Estado, errores: string[]): ResultadoDePaso {
  const motivo = errores.slice(0, 2).join(' · ')
  if (paso.clave === 'reimagen_mirar') return { costo_usd: 0, fichas: [fichaNueva(`reimagen-sin-lectura-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'sugerencia', `no se pudo leer lo que el curador dijo de la imagen nueva (${motivo}): se queda la anterior`, 'formato de la observación', 'queda declarado: la re-imagen fue la vuelta de su creador')] }
  const items = imagenesAMirar(e)
  return {
    costo_usd: 0,
    artefacto: { observaciones: [], preferencia: [], veredicto: { pasan: items.map((i) => i.indice), porImagen: [], regenerar: false }, sin_lectura: true },
    fichas: [fichaNueva(`mirar-sin-lectura-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'bloquea', `nadie pudo confirmar que la imagen cumple el brief: la respuesta del curador no se pudo leer dos veces (${motivo}); la imagen sigue en la pieza sin juzgar`, 'formato de la observación', 'su creador ya tuvo su reintento: queda declarado y la pieza sigue')],
    reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' },
  }
}
// S2-3 · la revisión de las imágenes clave también es un «mirar»: ilegible tras su reintento, el video sigue (con su ficha de sugerencia), nunca se cae el encargo
const ES_MIRAR = (clave: string): boolean => clave === 'mirar' || clave === 'reimagen_mirar' || clave === PASO_MIRAR_VIDEO || clave === PASO_REVISAR_IMAGENES_CLAVE

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
      const planId = planDeOrigen(parte.texto)
      const plan = planId ? await P.plan(planId, enc.client_id) : null
      if (plan) fu.plan_texto = plan
      const sala = await briefEsDelEncargo(brief, enc.familia, P.formatosDeLaCadena?.bind(P), claseDeLaFamilia(P))
      if (!sala.ok) return { res: { costo_usd: 0 }, fallido: sala.motivo }
      const proporcion = proporcionDelBrief(brief, String(pl.limites.formato_por_omision ?? '1:1'))
      return { res: { costo_usd: 0, artefacto: { brief, proporcion, F: fu } } }
    }
    case 'elegir_foto': {
      // #15 · las cercanas ya vienen siempre rotuladas en las candidatas: el director visual decide
      const { cf, protas, prohibe } = candidatasDelEncargo(e, pl, P.ahora())
      return { res: { costo_usd: 0, artefacto: { ...cf, protagonistas: protas, prohibe_personas: prohibe, cercanas: cf.candidatas.filter((c) => c.cercana).map((c) => c.id) } } }
    }
    case 'chequear_prompts': {
      const b = base(e)
      const prompts = ((datos(e, 'prompts')?.prompts ?? []) as Array<{ prompt: string; idea_en_una_linea: string }>)
      const ch = chequearPrompts(prompts.map((p) => p.prompt), reglasParaPrompts(e, b.brief, b.F), b.F.propios, reglasDeInvencion(pl.limites, b.F.referencias))
      const fichasDeAviso = ch.avisos.map((a, n) => fichaNueva(`prompts-aviso-${e.pasos_ejecutados}-${n}`, 'chequeo', 'imagen', 'sugerencia', a, 'palabras declaradas por norma, por el dueño o por el brief', 'revisar si corresponde'))
      const esRe = paso.clave.startsWith('reimagen_')
      const repeticion = (e.vueltas['chequear_prompts'] ?? 0) >= 1
      if (esRe && ch.ninguno) return { res: { costo_usd: 0, artefacto: { indices: [], ninguno: true, fallan: ch.fallan, prompts: [] }, fichas: [fichaNueva(`reimagen-prompts-ninguno-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'sugerencia', 'ningún prompt de la re-imagen cumple las reglas del brief: se queda la imagen anterior', 'reglas de imagen del brief', 'queda declarado: la re-imagen fue la vuelta de su creador')] } }
      const res: ResultadoDePaso = {
        costo_usd: 0,
        artefacto: { indices: ch.pasan, ninguno: ch.ninguno, fallan: ch.fallan, prompts: ch.pasan.map((i) => prompts[i]) },
        ...(!(ch.ninguno && repeticion) && fichasDeAviso.length ? { fichas: fichasDeAviso } : {}),
        ...(ch.ninguno && repeticion ? { fichas: [...fichasDeAviso, fichaNueva('prompts-ninguno', 'chequeo', 'imagen', 'bloquea', 'ningún prompt cumple las reglas del brief (ni tras repetir al ingeniero de prompts)', 'reglas de imagen del brief', 'declarar la pieza sin imagen generada')], reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' } } : {}),
      }
      return { res }
    }
    case 'imagen': {
      const b = base(e)
      const validos = ((datos(e, 'prompts_validos')?.prompts ?? []) as Array<{ prompt: string }>).slice(0, Number(pl.limites.imagenes_generadas_max ?? 3))
      const previo = (datos(e, 'imagenes')?.items ?? []) as Array<Record<string, unknown>>
      if (validos.length === 0 && paso.clave.startsWith('reimagen_')) return { res: { costo_usd: 0 } } // la re-imagen sin prompts válidos no inventa una tanda vacía
      const intento = ((datos(e, 'imagenes')?.ultimo_intento as number | undefined) ?? 0) + 1
      const items = [...previo]
      const nuevos: Array<{ indice: number; url: string }> = []
      const gastos: NonNullable<Cambios['gastos']> = []
      let costo = 0
      const fichas: Ficha[] = []
      // sprint 1 · mejora 3: con foto propia apta del protagonista, la imagen se edita SOBRE la foto real (conserva el producto); sin ella, se genera como siempre
      const aptas = fotosDeReferencia(b.F.fotos, (datos(e, 'candidatas_foto')?.candidatas ?? []) as Array<{ id: string; cercana?: boolean }>, { preferida: (datos(e, 'visual_direction')?.decision as { foto_id?: string } | undefined)?.foto_id })
      for (let i = 0; i < validos.length; i++) {
        const foto = fotoDeReferencia(aptas, i)
        const g = await P.imagen({ prompt: validos[i].prompt, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run, foto })
        if (!g.ok) { fichas.push(fichaNueva(`imagen-${intento}-${i}`, 'chequeo', 'imagen', 'sugerencia', `el generador no devolvió una imagen para el prompt ${i + 1}: ${g.error}`)); continue }
        const sobre = foto && g.referencia?.usada ? { foto_referencia_id: foto.id } : {}
        if (foto && !g.referencia?.usada) fichas.push(fichaNueva(`imagen-sin-foto-${intento}-${i}`, 'chequeo', 'imagen', 'sugerencia', `la imagen ${i + 1} se generó sin la foto real «${foto.id}» (${g.referencia?.motivo ?? 'sin motivo'}): el producto puede no ser el del cliente`, 'fotos propias del cliente', 'mirar que el producto sea el real'))
        const indice = items.length
        items.push({ indice, intento, prompt_idx: i, url: g.url, generation_id: g.generation_id, prompt: validos[i].prompt, ...sobre })
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
        // control ③ también para la foto real: si el curador la miró y el código la rechazó, se DESCARTA (queda declarado), no se entrega
        const obs = datos(e, 'observacion_imagen')
        if (obs && !((obs.veredicto as { pasan?: number[] } | undefined)?.pasan ?? []).includes(0)) {
          return { res: { costo_usd: 0, artefacto: { origen: 'ninguna', nota: 'la foto real elegida no cumple el brief y se descartó' } } }
        }
        const nota = f && f.formato === 'vertical' && b.proporcion === '1:1' ? 'la foto real es vertical y el brief pide 1:1: recortar al publicar' : null
        return { res: { costo_usd: 0, artefacto: { origen: 'real', url: f?.url ?? null, foto_id: id, nota } }, usos: id ? [{ foto_id: id, rol: 'pieza' }] : undefined }
      }
      return { res: { costo_usd: 0, artefacto: { origen: 'ninguna', nota: 'la pieza sale sin imagen' } } }
    }
    case 'chequeos': {
      const b = base(e)
      const pz0 = datos(e, 'pieza_post')
      if (!pz0) return { res: { costo_usd: 0, artefacto: { fichas: 0 } }, fallido: 'no hay pieza que chequear' }
      // 18-nov · GO Lenovo «lo exacto se autocorrige»: el teléfono o el @ ajeno del texto que se publica se reemplaza por el del cliente ANTES de chequear (sin modelo)
      const auto = corregirContactoDeLaPieza(pz0, b.F.fuentes as FuentesDelCliente)
      const pz = auto.pieza
      const fin = datos(e, 'imagen_final') ?? {}
      const fs = chequeosDePost({
        // Mejora 5 · lo que va escrito sobre la imagen se chequea igual que el pie (prohibidas, registro, teléfonos, @ y precios); el tope del pie no lo cuenta
        pieza: { pie_de_foto: [String(pz.pie_de_foto ?? ''), textoEnImagenParaChequear(pz)].filter(Boolean).join('\n'), hashtags: (pz.hashtags as string[]) ?? [], llamado: pz.llamado as string | undefined },
        fuentes: b.F.fuentes as FuentesDelCliente,
        limites: { pie_de_foto_max: Number(pl.limites.pie_de_foto_max ?? 2200) + (textoEnImagenParaChequear(pz) ? textoEnImagenParaChequear(pz).length + 1 : 0), hashtags_max: Number(pl.limites.hashtags_max ?? 30), limites_verificados: pl.limites.limites_verificados === true },
        prohibidas_del_brief: b.brief.prohibido,
        imagen: { generada: fin.origen === 'generada', declarada_en_bandeja: true },
      })
      const prefijo = `chk${e.pasos_ejecutados}`
      return { res: { costo_usd: 0, artefacto: { fichas: fs.length, ...(auto.declarado.length ? { autocorregido: auto.declarado } : {}) }, fichas: fs.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })), reemplazar_fichas: { origen: 'chequeo', donde: ['texto', 'hashtags'] }, ...(auto.declarado.length ? { otros_artefactos: { pieza_post: pz } } : {}) } }
    }
    case 'empaquetar_entrega': return empaquetar(P, enc, pl)
    case 'cierre': return { res: { costo_usd: 0, artefacto: { cerrado_en: P.ahora().toISOString() } } }
    case 'leer_notas': {
      // el segundo cerebro: las notas del dueño que el productor puede ver. Un fallo de lectura NO frena el encargo: sin notas, la pieza sigue como siempre (y el motivo queda en el artefacto)
      let notas: NotaVista[] = []
      let error: string | undefined
      try { if (P.notas) { const l = await P.notas.leer(enc.client_id); notas = l.notas; error = l.error } } catch (err) { error = err instanceof Error ? err.message : String(err) }
      return { res: { costo_usd: 0, artefacto: { hay: notas.length > 0, notas, ...(error ? { error } : {}) } } }
    }
    // 17-nov · tramo B · la foto con mesa usa el observador de la mesa (otro proveedor), que no se sienta en ella
    case 'mesa_observar': return (await import('./mesa/observar')).observarImagenes(P, enc, pl)
    // 17-nov · propuestas en imagen · tramo 2b · el borrador de cada propuesta (solo antes de aprobar; aprobada o sin propuestas, US$ 0)
    case 'borrador_imagen': {
      const { correrBorradorDeImagen, avisoDeBorradorDeImagenIncompleto } = await import('./mesa/borrador-imagen')
      const familia = familiaDeLaminas(pl) ?? 'post'
      const b = await correrBorradorDeImagen(P, enc, pl, familia)
      const aviso = avisoDeBorradorDeImagenIncompleto(enc.brief_id, b.artefacto, familia)
      if (aviso) await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: aviso, dry_run: enc.dry_run })
      return { res: { costo_usd: b.artefacto.costo_usd, artefacto: b.artefacto as unknown as Record<string, unknown> }, ...(b.gastos.length ? { gastos: b.gastos } : {}), ...(b.imagen_generada ? { imagen_generada: true } : {}) }
    }
    default: return familiaDeLaminas(pl) ? ejecutarCodigoL(P, enc, pl, paso) : familiaDeVideo(pl) ? ejecutarCodigoV(P, enc, pl, paso) : { res: { costo_usd: 0 }, fallido: `función de código «${paso.funcion}» sin implementar` }
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
  const cuando = cuandoSePublica(enc.sala_ref, fechaLimiteDelBrief(b.brief.aprueba))
  const expires = cuando ? aUtc(cuando.fecha, cuando.hora, b.F.zona) : null
  const archivos: ArchivoDeEntrega[] = []
  const nombres: string[] = []
  let ajuste: { modo: string; detalle: string } | null = null
  let composicion: Record<string, unknown> | null = null
  const avisosDeComposicion: string[] = []
  if (fin.url) {
    let bytes = await P.descargar(String(fin.url))
    if (bytes) {
      // r79 · D6 · el acabado encaja la imagen a la proporción del formato POR CÓDIGO (recorta si lo quitado es casi vacío; si no, la encaja entera con franjas): ya no bloquea la entrega por eso
      const medOriginal = leerMedidas(bytes)
      if (fila && medOriginal?.tipo === 'png' && Math.abs(medOriginal.ancho / medOriginal.alto - fila.ancho / fila.alto) > 0.01) {
        const enc2 = encajarAProporcion(bytes, { ancho: fila.ancho, alto: fila.alto })
        if (enc2.modo !== 'no_soportada') { bytes = enc2.bytes; ajuste = { modo: enc2.modo, detalle: enc2.detalle } }
      }
      // Sprint 1 · Mejora 5 · encima de la foto ya encajada, la marca: logo, textos del autor y colores del manual (por código; la IA nunca escribe texto). Sin rejas: lo que falte se dice y la foto sale como siempre
      const comp = await componerConLaMarca(P, enc, b, pz, bytes)
      composicion = comp.composicion
      avisosDeComposicion.push(...comp.avisos)
      if (comp.bytes) bytes = comp.bytes
      const med = leerMedidas(bytes)
      const ext = med?.tipo === 'jpeg' ? 'jpg' : 'png'
      const nombre = nombreDeArchivo({ fecha: cuando?.de === 'fila' ? cuando.fecha : null, hora: cuando?.de === 'fila' ? cuando.hora : null, red, formato: 'foto', brief_id: b.brief.id, n: 1, de: 1, ext })
      archivos.push({ nombre, bytes }); nombres.push(nombre)
    }
  }
  const texto = textoParaCopiar({ pie_de_foto: String(pz.pie_de_foto ?? ''), hashtags: (pz.hashtags as string[]) ?? [] })
  const baseNombre = nombreDeArchivo({ fecha: cuando?.de === 'fila' ? cuando.fecha : null, hora: cuando?.de === 'fila' ? cuando.hora : null, red, formato: 'foto', brief_id: b.brief.id, n: 1, de: 1, ext: 'txt' }).replace(/\.txt$/, '')
  const hoja = `# Publicar a mano · ${b.brief.id}\nRed: ${b.brief.red} · formato: ${b.brief.formato} · proporción ${b.proporcion}\nHora de publicación: ${cuando ? (cuando.de === 'fila' ? `${cuando.fecha}${cuando.hora ? ' ' + cuando.hora : ''}${b.F.zona ? ' (' + b.F.zona + ')' : ' (zona del cliente sin registrar)'}` : `(aprobar antes de ${cuando.fecha})`) : 'sin fecha: se decide al aprobar'}\n${(fin.origen === 'generada') ? '⚠️ La imagen es GENERADA, no una foto del producto real.\n' : ''}${fin.nota ? `Nota de la imagen: ${fin.nota}\n` : ''}${pz.nota_para_quien_publica ? `Nota: ${String(pz.nota_para_quien_publica)}\n` : ''}\n## Pasos\n${(fila ? [] : ['(sin especificación de formato)']).join('\n')}\n`
  const man = manifiesto(archivos, { encargo_id: enc.id, brief_id: b.brief.id, aprobada_version: e.artefactos['pieza_post']?.version ?? 1, expires_at: expires, imagen_generada: fin.origen === 'generada' })
  const fichas = chequeosDeEntrega(archivos, fila ?? null, { pie_de_foto: String(pz.pie_de_foto ?? ''), hashtags: (pz.hashtags as string[]) ?? [] }, man)
  avisosDeComposicion.forEach((a, i) => fichas.push(fichaNueva(`entrega-composicion-${i}`, 'chequeo', 'imagen', 'sugerencia', a, 'composición con la marca', 'mirar la imagen compuesta antes de aprobar')))
  if (ajuste) fichas.push(fichaNueva('entrega-imagen-encajada', 'chequeo', 'imagen', 'sugerencia', `la imagen se ajustó por código al formato: ${ajuste.detalle}`, 'proporción del formato', 'mirar la imagen ajustada antes de aprobar'))
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
      artefacto: { archivos: man.archivos, nombres: todos.map((x) => x.nombre), urls, texto_para_copiar: texto, expires_at: expires, sin_imagen: sinImagen, simulado: enc.dry_run, ...(composicion ? { composicion } : {}) },
      fichas: [...fichas.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })), ...(sinImagen && fin.origen !== 'ninguna' ? [] : [])],
      reemplazar_fichas: { origen: 'chequeo', donde: 'entrega' },
    },
  }
}

/**
 * Sprint 1 · Mejora 5 · la pieza con foto, compuesta con la marca. Devuelve los bytes nuevos (PNG del mismo tamaño) o null para dejar la foto como estaba.
 * Nunca lanza ni bloquea: sin identidad visual, sin puerto, foto ilegible o un fallo del dibujo ⇒ la foto sale como siempre y queda un aviso.
 */
async function componerConLaMarca(P: Puertos, enc: Encargo, b: ReturnType<typeof base>, pz: Record<string, unknown>, foto: Buffer): Promise<{ bytes: Buffer | null; composicion: Record<string, unknown> | null; avisos: string[] }> {
  if (!P.componer) return { bytes: null, composicion: null, avisos: [] }
  const marca = b.F.marca
  if (!marca) return { bytes: null, composicion: { compuesta: false, motivo: 'sin_identidad_visual' }, avisos: ['el cliente no tiene identidad visual legible en el manual: la imagen sale sin logo ni textos de la marca'] }
  const med = leerMedidas(foto)
  const fotoUri = comoDataUri(foto)
  if (!med || !fotoUri) return { bytes: null, composicion: { compuesta: false, motivo: 'foto_ilegible' }, avisos: ['no se pudo leer la foto para componerla con la marca: sale sin logo ni textos'] }
  const { texto, avisos } = textoEnImagenDe(pz, b.F.propios.urls[0] ?? null)
  let logo: string | null = null
  if (marca.logo_url) {
    logo = comoDataUri(await P.descargar(marca.logo_url).catch(() => null))
    if (!logo) avisos.push('no se pudo leer el logo del manual: en su lugar va el nombre de la marca')
  } else avisos.push('el manual no trae logo: en su lugar va el nombre de la marca')
  const diseno = disenoDeAnuncio(marca, b.brief.id || enc.id)
  const firma = marca.brand_handle || b.F.cliente_nombre || null
  const r = await P.componer({ ancho: med.ancho, alto: med.alto, foto: fotoUri, logo, firma: logo ? null : firma, texto, diseno })
  if (!r.ok) return { bytes: null, composicion: { compuesta: false, motivo: 'fallo_del_dibujo', detalle: r.error }, avisos: [...avisos, `no se pudo componer la imagen con la marca (${r.error}): sale la foto sin textos`] }
  if (r.fonts_faltantes.length) avisos.push(`tipografías del manual que no se pudieron cargar (se dibujó con la de reserva): ${r.fonts_faltantes.join(', ')}`)
  // S2-5 · el servicio de render HTML falló: se dibujó igual con el motor de siempre, y se avisa
  if (r.aviso_motor) avisos.push(`el servicio de render HTML falló (${r.aviso_motor}): la imagen se compuso con el dibujo de siempre`)
  return { bytes: r.png, composicion: { compuesta: true, ...(r.motor ? { motor: r.motor } : {}), variante: diseno.variante, colores: { etiqueta: diseno.etiqueta.fondo, boton: diseno.boton.fondo, franja: diseno.franja.fondo }, tipografia: diseno.tipografia, texto, con_logo: !!logo, fonts_faltantes: r.fonts_faltantes }, avisos }
}

// ───────────────────────── re-imagen que pide la opinión
/** ¿queda una imagen que el curador quiso cambiar y la sala no pudo rehacer? (sin margen, sin imagen generada, o la nueva no cumplió) */
export const imagenPorRehacer = (e: Estado): boolean => datos(e, 'respuesta_imagen')?.por_rehacer_humano === true || e.fichas.some((f) => f.id.startsWith('reimagen-'))
/** el encargo tiene UNA re-imagen por opinión, y solo si le queda margen del tope de regeneraciones (el control ③ comparte ese tope) y la imagen es generada */
export function decidirReImagen(e: Estado, pl: Plantilla, tomada: boolean): { si: boolean; motivo: string | null } {
  if (!tomada) return { si: false, motivo: null }
  const modo = ((datos(e, 'visual_direction')?.decision as { modo?: string } | undefined)?.modo) ?? 'ninguna'
  if (modo !== 'generada') return { si: false, motivo: 'la imagen no es generada (es una foto real o no hay): no se puede re-imaginar' }
  const tope = Number(pl.pasos.find((p) => p.clave === 'mirar')?.vuelve_a?.max ?? 0)
  if ((e.vueltas['mirar'] ?? 0) >= tope) return { si: false, motivo: 'el encargo ya usó su tope de regeneraciones de imagen' }
  return { si: true, motivo: null }
}

// ───────────────────────── revisor externo
/** los «donde» que tienen dueño en la ronda 2: texto (autor) e imagen (curador) siempre; en el carrusel lo que dibuja el diseñador; en el kit lo que estructura el narrador */
export function duenosDeLaOpinion(pl: Plantilla): string[] {
  const fam = familiaDeLaminas(pl)
  return ['texto', 'imagen', ...(fam === 'carrusel' ? ['laminas'] : fam === 'kit' ? ['estructura'] : [])]
}
/**
 * El revisor externo (GPT) da su OPINIÓN LIBRE: recibe la pieza y el cerebro del cliente que lee la sala, sin reglas, sin rúbrica y sin formato (firma de Emilio, 10-oct).
 * Su texto se guarda como OPINIÓN: una sola ficha `externa` de gravedad «sugerencia» que lleva el texto entero; nunca bloquea ni cuenta como desacuerdo. El AUTOR (`decide`) decide qué toma.
 * Sigue ciego al hilo y a las fichas del jefe: `armarPedidoAlRevisor` solo recibe la pieza, las imágenes y el contexto.
 */
async function ejecutarExterno(P: Puertos, enc: Encargo, pl: Plantilla, _paso: Paso): Promise<{ res: ResultadoDePaso; gastos: Cambios['gastos'] }> {
  void _paso
  const e = enc.estado_del_motor
  const pedido = armarPedidoAlRevisor(familiaDeLaminas(pl) ? contextoDeRevisorL(pl, e) : contextoDelRevisor(contexto(e)))
  const rev = await P.revisor({ texto: pedido.texto, imagenes_urls: pedido.imagenes, dry_run: enc.dry_run, client_id: enc.client_id, ref_id: enc.id, n: e.pasos_ejecutados })
  if (!rev.ok) {
    // firma de Emilio: tras los 3 reintentos (los hace el adaptador) la pieza sigue a la bandeja marcada «sin segunda mirada» y se avisa en el hilo de #oficina-creativa; nunca bloquea
    const intentos = rev.intentos ?? []
    const costo = rev.costo_usd ?? 0
    const gastosFallo: NonNullable<Cambios['gastos']> = costo > 0 ? [{ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: costo, base: 'usage' }] : []
    await P.avisar({ canal: 'hilo', encargo_id: enc.id, texto: `⚠️ Sin segunda mirada · ${enc.brief_id}: el revisor externo no respondió tras ${intentos.length || 1} intento(s) (${rev.error}); la pieza va a la bandeja sin su opinión`, dry_run: enc.dry_run })
    return { res: { costo_usd: costo, artefacto: { sin_revision: true, motivo: rev.error, intentos }, fichas: [fichaNueva('externa-no-respondio', 'externa', 'proceso', 'sugerencia', `el revisor externo no respondió (${rev.error}): la pieza va sin segunda mirada`, 'revisión externa firmada', 'revisar a mano')] }, gastos: gastosFallo }
  }
  const gastos: NonNullable<Cambios['gastos']> = [{ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: rev.costo_usd, base: 'usage' }]
  const opinion = rev.texto.trim()
  if (!opinion) return { res: { costo_usd: rev.costo_usd, artefacto: { opinion: null, sin_opinion: true, modelo: rev.modelo, intentos: rev.intentos ?? [] } }, gastos }
  // la opinión llega a TODOS los que hicieron algo (autor, curador y quien dibuja o estructura): una ficha por dueño, con el mismo texto; cada uno decide sobre SU parte, con razón (firma de Emilio, 10-oct)
  const fichas = duenosDeLaOpinion(pl).map((d) => fichaNueva(d === 'texto' ? `ext-opinion-${e.pasos_ejecutados}` : `ext-opinion-${e.pasos_ejecutados}-${d}`, 'externa', d, 'sugerencia', opinion, 'opinión libre del revisor externo (sin criterios ni reglas)', `quien hizo la parte «${d}» decide qué toma y qué no, con razón`))
  return { res: { costo_usd: rev.costo_usd, artefacto: { opinion, modelo: rev.modelo, intentos: rev.intentos ?? [] }, fichas }, gastos }
}

// ───────────────────────── recibir el resultado de un agente / del portero
export interface ResultadoDeTurno {
  texto?: string; error?: string; costo_usd?: number; workflow_execution_id?: string | null; tokens_in?: number | null; tokens_out?: number | null
  /** 11-nov · regla (b) · el código que devolvió run-sdk cuando NO llegó al corredor o el corredor contestó roto (lo pasa el flujo «Oficina · un turno» como campo; nunca se lee del texto) */
  upstream_status?: number | null
  /** 11-nov · regla (b) · el pedido del turno ni siquiera llegó a run-sdk (el nodo HTTP del flujo falló) */
  pedido_no_llego?: boolean
}

/** regla (b) · el corte nuestro de una vuelta con error: SOLO por los campos que pasa el flujo, jamás por el texto */
export const corteNuestroDeLaVuelta = (res: ResultadoDeTurno): OrigenDeCorteNuestro | undefined =>
  res.pedido_no_llego === true ? 'pedido_no_llego' : typeof res.upstream_status === 'number' && Number.isInteger(res.upstream_status) ? 'corredor_caido' : undefined

/**
 * 10-nov · LA COPIA TAMBIÉN SE PAGA (costo de la mesa · GO de Lenovo 13:28Z). Una respuesta repetida de un turno ya registrado viene de OTRA ejecución (el vigía lo re-entregó porque nadie lo acusó):
 * esa llamada al modelo se pagó. Antes se descartaba y el tope solo veía lo anotado (la gran idea v4 anotó 6,15 y gastó 10,39). Se anota una vez por ejecución y se suma al gasto del encargo.
 * Sin ejecución no se puede saber si ya se anotó: no se suma (se evita contar dos veces). Nunca frena el avance.
 */
export async function anotarCostoDeLaCopia(P: Puertos, encargoId: string, res: ResultadoDeTurno): Promise<'anotado' | 'ya_estaba' | 'sin_costo' | 'sin_ejecucion' | 'sin_capacidad'> {
  const costo = Math.max(0, Number(res.costo_usd ?? 0))
  if (!(costo > 0)) return 'sin_costo'
  if (!res.workflow_execution_id) return 'sin_ejecucion'
  if (typeof P.almacen.anotarGastoDeCopia !== 'function') return 'sin_capacidad'
  return P.almacen.anotarGastoDeCopia({ encargo_id: encargoId, gasto: { concepto: 'modelo', ref_tabla: 'agent_invocations', ref_id: String(res.workflow_execution_id), cost_usd: costo, base: 'usage' } })
}

/** EL ACUSE (28-oct): el flujo `oficina · turno` avisa que TOMÓ el turno. Una sola vez por turno: un segundo despertar (el vigía, un reintento) recibe `ya_tomado` y el flujo se detiene SIN llamar al agente ni al portero (nada se paga dos veces) */
export async function acusarTurno(P: Puertos, encargoId: string, n: number, ejecucion: string): Promise<Respuesta> {
  const x = await P.almacen.acusarTurno(encargoId, n, ejecucion)
  return r(200, { acuse: x, encargo_id: encargoId, n })
}

/** lo que el flujo manda cuando la puerta del portero contestó otra cosa que un portero */
export const PORTERO_NO_RESPONDE = 'PORTERO_NO_RESPONDE'
export async function recibirResultado(P: Puertos, encargoId: string, n: number, res: ResultadoDeTurno): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const pl = await plantillaDe(P, enc)
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.n !== n) {
    if (n < turnoDe(enc.estado_del_motor)) { await anotarCostoDeLaCopia(P, enc.id, res); return avanzar(P, enc.id) } // respuesta repetida: el turno ya está registrado (no se cuenta dos veces), pero la COPIA sí se pagó
    return r(409, { error: 'turno_no_esperado', esperado: abierto?.n ?? null, recibido: n })
  }
  if (abierto.paso.startsWith('mesa:')) return (await import('./mesa/orquestador')).recibirResultadoMesa(P, encargoId, n, res)
  const e = enc.estado_del_motor
  const sig = siguientePaso(e, pl)
  if (sig.accion !== 'ejecutar') return r(409, { error: 'sin_paso_pendiente' })
  const paso = sig.paso
  const costo = Math.max(0, Number(res.costo_usd ?? 0))
  const gastoModelo: NonNullable<Cambios['gastos']> = costo > 0 ? [{ concepto: paso.tipo === 'portero' ? 'portero' : 'modelo', ref_tabla: res.workflow_execution_id ? 'agent_invocations' : null, ref_id: res.workflow_execution_id ?? null, cost_usd: costo, base: 'usage' }] : []
  const turnoBase = { paso: paso.clave, tipo: paso.tipo, agente: abierto.agente, dispatch_key: abierto.dispatch_key, cost_usd: costo, workflow_execution_id: res.workflow_execution_id ?? null, tokens_in: res.tokens_in ?? null, tokens_out: res.tokens_out ?? null }

  // el segundo cerebro: la auto-revisión NUNCA frena ni rompe la entrega (si algo sale mal, la pieza sigue tal cual la hizo el agente)
  if (paso.revisa) return recibirAutorevision(P, enc, pl, sig, abierto.agente, res, { costo, gastoModelo, turnoBase, n })

  // 28-oct · lo que contestó la puerta NO era el portero (rechazo de llave, HTML, vacío): jamás cuenta como éxito. Se reintenta UNA vez; si sigue, UNA alarma y la pieza queda en espera SIN gastar (se reanuda con `siguiente` cuando se arregle la llave)
  if (paso.tipo === 'portero' && typeof res.error === 'string' && res.error.startsWith(PORTERO_NO_RESPONDE)) {
    const k = `portero_roto:${paso.clave}`
    const veces = (e.vueltas[k] ?? 0) + 1
    const nuevo: Estado = { ...e, pasos_ejecutados: e.pasos_ejecutados + 1, vueltas: { ...e.vueltas, [k]: veces } }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', turno: { ...turnoBase, n, estado: 'fallo', error: res.error.slice(0, 300), cost_usd: 0 } })
    if (veces < 2) return avanzar(P, enc.id)
    if (veces === 2) await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `🚪 El portero no respondió dos veces seguidas (${res.error.slice(0, 160)}). La pieza ${enc.brief_id} queda en espera, sin gasto; se reanuda cuando se arregle la llave de la puerta.`, dry_run: enc.dry_run })
    return r(200, { accion: 'esperando_al_portero', encargo_id: enc.id, veces })
  }
  if (res.error || typeof res.texto !== 'string') {
    // el turno murió o devolvió error: se registra como fallo y el encargo cierra visible (el vigía reintenta UNA vez antes de llegar aquí)
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd + costo, turno: { ...turnoBase, n, estado: 'fallo', error: res.error ?? 'respuesta vacía' }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return fallar(P, { ...enc, gasto_usd: e.gasto_usd + costo }, `el paso «${paso.clave}» falló: ${res.error ?? 'respuesta vacía'}`, corteNuestroDeLaVuelta(res))
  }

  if (paso.tipo === 'portero') {
    const out = await aplicarResultado(P, enc, pl, sig.indice, { costo_usd: costo, artefacto: { texto: res.texto } }, { vuelta: sig.vuelta, turno: { ...turnoBase, estado: 'hecho' }, gastos: gastoModelo, n })
    void out
    return avanzar(P, enc.id)
  }

  // agente: contrato de formato
  const intentos = e.vueltas[`fmt:${paso.clave}`] ?? 0
  const p = procesarSalida(res.texto, paso.salida!.esquema, intentos, paso.salida!.reintento_formato, { limpiarForma: { descartarEyebrowLargo: DESCARTAR_EYEBROW_LARGO } })
  /** un reintento: la misma pregunta con el error literal (de formato, o de lo que la sala comprueba por código) */
  const pedirReintento = async (mensaje: string, motivo: string): Promise<Respuesta> => {
    const nuevo: Estado = { ...e, vueltas: { ...e.vueltas, [`fmt:${paso.clave}`]: intentos + 1 }, pasos_ejecutados: e.pasos_ejecutados + 1, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, turno: { ...turnoBase, n, estado: 'hecho', error: motivo }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    const { agente, pedido } = armarPedido(enc, pl, paso, nuevo, mensaje)
    const n2 = turnoDe(nuevo)
    const dk = `${enc.id}:${n2}`
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', turno: { n: n2, paso: paso.clave, tipo: paso.tipo, agente, estado: 'corriendo', dispatch_key: dk, cost_usd: 0 } })
    return r(200, { accion: 'esperar', reintento_de_formato: true, turno: { n: n2, paso: paso.clave, tipo: paso.tipo, agente, dispatch_key: dk, pedido } })
  }
  if (!p.ok && p.accion === 'reintentar') return pedirReintento(p.mensaje_de_error, 'formato: reintento')
  // 11-nov · «mirar» ilegible tras su reintento: la pieza sigue con la imagen SIN juzgar y una ficha que bloquea (una persona mira); nunca se cae el encargo por la forma de la respuesta
  if (!p.ok && ES_MIRAR(paso.clave)) {
    const sl = familiaDeLaminas(pl) ? sinLecturaDeMirarL(paso, e, p.errores) : paso.clave === PASO_MIRAR_VIDEO ? sinLecturaDeMirarV(e, p.errores) : paso.clave === PASO_REVISAR_IMAGENES_CLAVE ? sinLecturaDeRevisarImagenesClaveV(e, p.errores) : sinLecturaDeMirar(paso, e, p.errores)
    const { [`fmt:${paso.clave}`]: _fm, ...vueltasSinFmt } = e.vueltas
    void _fm
    await aplicarResultado(P, { ...enc, estado_del_motor: { ...e, vueltas: vueltasSinFmt } }, pl, sig.indice, { ...sl, costo_usd: costo }, { vuelta: sig.vuelta, turno: { ...turnoBase, estado: 'hecho', error: `formato ilegible tras ${intentos + 1} intento(s): ${p.errores.slice(0, 2).join(' · ')} · sigue sin juzgar la imagen` }, gastos: gastoModelo, n })
    return avanzar(P, enc.id)
  }
  if (!p.ok) {
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), fichas: [...e.fichas, fichaNueva(`formato-${paso.clave}`, 'chequeo', 'formato', 'bloquea', p.ficha.que ?? 'formato inválido')], turno: { ...turnoBase, n, estado: 'fallo', error: p.errores.join(' · ') }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return fallar(P, { ...enc, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, p.ficha.que ?? 'formato inválido')
  }
  // MATERIAL · el campo `necesito` de la salida (lo que BLOQUEA su trabajo) se cumple UNA vez por paso: se descarta esta salida, se le pide al portero y el MISMO agente vuelve a trabajar con la respuesta
  const nec = await despuesDeUnAgente(P, enc, pl, paso.clave, p.valor)
  if (nec.necesidades.length) {
    const { [`fmt:${paso.clave}`]: _f, ...vs } = e.vueltas
    void _f
    const nuevo: Estado = { ...e, vueltas: vs, pasos_ejecutados: e.pasos_ejecutados + 1, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, turno: { ...turnoBase, n, estado: 'hecho', error: 'necesito: espera al portero' }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return pedirLoQueElAgenteNecesita(P, { ...enc, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd }, pl, paso.clave, nec.necesidades)
  }
  const proc: { res?: ResultadoDePaso; fallido?: string; reintentar?: string } = familiaDeLaminas(pl) ? procesarValorL(paso, p.valor, enc, e, pl, intentos) : (familiaDeVideo(pl) ? procesarValorV(paso, p.valor, e, pl) : null) ?? procesarValor(paso, p.valor, enc, e, pl)
  if (proc.reintentar !== undefined) return pedirReintento(proc.reintentar, 'validación de la sala: reintento')
  if (proc.fallido || !proc.res) {
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), turno: { ...turnoBase, n, estado: 'fallo', error: proc.fallido ?? 'sin resultado' }, ...(gastoModelo.length ? { gastos: gastoModelo } : {}) })
    return fallar(P, { ...enc, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, proc.fallido ?? 'el paso no produjo resultado')
  }
  // C2 de CC#1: el contador de reintento de formato es del PASE, no del paso: al aceptar la salida se reinicia (si no, el segundo pase de una vuelta ya no tendría reintento)
  const { [`fmt:${paso.clave}`]: _fmt, ...vueltasSinFormato } = e.vueltas
  void _fmt
  const encLimpio: Encargo = { ...enc, estado_del_motor: { ...e, vueltas: vueltasSinFormato } }
  await aplicarResultado(P, encLimpio, pl, sig.indice, { ...proc.res, costo_usd: costo }, { vuelta: sig.vuelta, turno: { ...turnoBase, estado: 'hecho' }, gastos: gastoModelo, n })
  return avanzar(P, enc.id)
}

/**
 * EL SEGUNDO CEREBRO · la respuesta de una auto-revisión. Lo que decide el CÓDIGO: que el formato sea el del sobre, que las notas citadas existan, que solo cambie lo que el agente nombró y que la entrega corregida
 * pase el MISMO esquema y los MISMOS validadores del paso que revisa. Un fallo en cualquiera de esas cosas da UN reintento con el error literal; si vuelve a fallar (o el agente no contesta) la pieza sigue TAL CUAL:
 * la auto-revisión es una mejora, nunca un riesgo para la entrega.
 */
async function recibirAutorevision(P: Puertos, enc: Encargo, pl: Plantilla, sig: Extract<Siguiente, { accion: 'ejecutar' }>, agente: string | null, res: ResultadoDeTurno, c: { costo: number; gastoModelo: NonNullable<Cambios['gastos']>; turnoBase: Omit<TurnoRegistrado, 'n' | 'estado'>; n: number }): Promise<Respuesta> {
  const e = enc.estado_del_motor
  const paso = sig.paso
  const revisado = pl.pasos.find((x) => x.clave === paso.revisa)
  if (!revisado?.salida) return fallar(P, enc, `la auto-revisión «${paso.clave}» apunta a «${paso.revisa}», que no es un paso de agente`)
  const notas = (datos(e, 'notas_del_dueno')?.notas ?? []) as NotaVista[]
  const original = proyectarAlEsquema(revisado.salida.esquema, datos(e, revisado.salida_artefacto)) ?? {}
  const intentos = e.vueltas[`fmt:${paso.clave}`] ?? 0
  const quedaReintento = intentos < paso.salida!.reintento_formato
  const { [`fmt:${paso.clave}`]: _fmt, ...vueltasSinFormato } = e.vueltas
  void _fmt
  const encLimpio: Encargo = { ...enc, estado_del_motor: { ...e, vueltas: vueltasSinFormato } }
  const registrar = async (choco: boolean, cambios: unknown[]): Promise<void> => {
    try { await P.notas?.registrar({ client_id: enc.client_id, encargo_id: enc.id, agente: agente ?? paso.quien, paso: paso.clave, notas_vistas: notas.map((x) => x.id), choco, cambios, costo_usd: c.costo, clave_unica: `${enc.id}:${paso.clave}:${c.n}` }) } catch { /* el rastro nunca frena la entrega */ }
  }
  /** la pieza sigue tal cual (o con la corrección ya validada): se anota el paso y se sigue */
  const seguir = async (resultado: ResultadoDePaso, error?: string): Promise<Respuesta> => {
    await aplicarResultado(P, encLimpio, pl, sig.indice, { ...resultado, costo_usd: c.costo }, { vuelta: sig.vuelta, turno: { ...c.turnoBase, estado: 'hecho', ...(error ? { error } : {}) }, gastos: c.gastoModelo, n: c.n })
    return avanzar(P, enc.id)
  }
  // RESPUESTA Lenovo (punto 6 + fila 9): una lámina corregida que solo pasa el largo de la plantilla se devuelve hasta CORRECCIONES_DE_LARGO veces; después la corrección SE QUEDA con la sugerencia del largo
  const reintentarOSeguir = async (mensaje: string, largo = false): Promise<Respuesta> => {
    if (!(largo ? intentos < CORRECCIONES_DE_LARGO : quedaReintento)) { await registrar(false, [{ sin_cambios: mensaje.slice(0, 300) }]); return seguir({ costo_usd: c.costo }, `auto-revisión sin efecto: ${mensaje.slice(0, 300)}`) }
    const nuevo: Estado = { ...e, vueltas: { ...e.vueltas, [`fmt:${paso.clave}`]: intentos + 1 }, pasos_ejecutados: e.pasos_ejecutados + 1, gasto_usd: +(e.gasto_usd + c.costo).toFixed(6) }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, turno: { ...c.turnoBase, n: c.n, estado: 'hecho', error: `auto-revisión: reintento (${mensaje.slice(0, 200)})` }, ...(c.gastoModelo.length ? { gastos: c.gastoModelo } : {}) })
    const { agente: ag, pedido } = armarPedido(enc, pl, paso, nuevo, `Tu respuesta no sirvió: ${mensaje}. Devuelve solo el JSON del contrato.`)
    const n2 = turnoDe(nuevo)
    const dk = `${enc.id}:${n2}`
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', turno: { n: n2, paso: paso.clave, tipo: paso.tipo, agente: ag, estado: 'corriendo', dispatch_key: dk, cost_usd: 0 } })
    return r(200, { accion: 'esperar', reintento_de_formato: true, turno: { n: n2, paso: paso.clave, tipo: paso.tipo, agente: ag, dispatch_key: dk, pedido } })
  }

  if (res.error || typeof res.texto !== 'string') { await registrar(false, [{ sin_respuesta: res.error ?? 'respuesta vacía' }]); return seguir({ costo_usd: c.costo }, `auto-revisión sin respuesta: ${res.error ?? 'respuesta vacía'}`) }
  const p = procesarSalida(res.texto, paso.salida!.esquema, intentos, paso.salida!.reintento_formato, { limpiarForma: { descartarEyebrowLargo: DESCARTAR_EYEBROW_LARGO } })
  if (!p.ok) return p.accion === 'reintentar' ? reintentarOSeguir(p.mensaje_de_error) : (await registrar(false, [{ sin_cambios: 'formato' }]), seguir({ costo_usd: c.costo }, `auto-revisión sin efecto: ${p.errores.slice(0, 2).join(' · ')}`))
  const v = validarAutorevision(p.valor, notas.map((x) => x.id), original)
  if (!v.ok) return reintentarOSeguir(v.error)
  if (!v.choca) { await registrar(false, []); return seguir({ costo_usd: c.costo }) }

  // algo chocó: la entrega corregida pasa el MISMO esquema y los MISMOS validadores del paso que revisa, como si él la hubiera entregado
  const f = procesarSalida(JSON.stringify(v.corregida), revisado.salida.esquema, 0, 0)
  if (!f.ok) return reintentarOSeguir(`la pieza corregida no cumple el formato de «${revisado.salida_artefacto}»: ${f.accion === 'falla_visible' ? f.errores.slice(0, 4).join(' · ') : f.mensaje_de_error}`)
  const proc: { res?: ResultadoDePaso; fallido?: string; reintentar?: string } = familiaDeLaminas(pl) ? procesarValorL(revisado, f.valor, enc, e, pl, intentos) : procesarValor(revisado, f.valor, enc, e, pl)
  if (proc.reintentar !== undefined) return reintentarOSeguir(proc.reintentar, 'largo' in proc && proc.largo === true)
  if (proc.fallido || !proc.res) return reintentarOSeguir(proc.fallido ?? 'la pieza corregida no pasó los validadores del paso')
  // las fichas que el validador vuelve a levantar (mismo id que las de la primera vez) no se duplican
  const conocidas = new Set(e.fichas.map((x) => x.id))
  const fichasNuevas = (proc.res.fichas ?? []).filter((x) => !conocidas.has(x.id))
  await registrar(true, v.hallazgos)
  return seguir({ ...proc.res, ...(fichasNuevas.length ? { fichas: fichasNuevas } : { fichas: undefined }) })
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
      // 17-nov · GO creativos punto 5: la referencia se comprueba contra lo que el agente recibió; lo no comprobable se MARCA (sin rejas), no se descarta
      const ci = citasExisten(reglasBrutas, { brief: b.brief.texto, manual: b.F.manual_texto, plan: b.F.plan_texto })
      for (const x of ci.marcadas) fichas.push(fichaNueva(`vd-regla-${x.id}`, 'chequeo', 'imagen', 'sugerencia', `regla de imagen «${x.id}» sin referencia comprobable (${x.motivo}): se usa igual, marcada`, 'referencias al brief, la hoja, la gran idea, el manual o el plan'))
      const conf = modo === 'real' ? confianzaDeLaFoto(b.F.fotos, fotoId) : null
      const derivada = derivarDecision(modo, conf)
      return { res: { costo_usd: 0, artefacto: { ...v, reglas_de_imagen: ci.validas, reglas_marcadas: ci.marcadas, reglas_comprobadas: ci.comprobadas, decision: { ...dec, foto_id: fotoId, ...derivada } }, ...(fichas.length ? { fichas } : {}) } }
    }
    case 'prompts': case 'reimagen_prompts': return { res: { costo_usd: 0, artefacto: v } }
    case 'mirar': case 'reimagen_mirar': {
      const esRe = paso.clave === 'reimagen_mirar'
      const obs = v.imagenes as ObservacionDeImagen[]
      const validos = new Set(imagenesAMirar(e).map((i) => i.indice))
      const filtradas = obs.filter((o) => validos.has(o.indice))
      const modo = ((datos(e, 'visual_direction')?.decision as { modo?: string } | undefined)?.modo) ?? 'ninguna'
      const puede = !esRe && modo === 'generada' && (e.vueltas['mirar'] ?? 0) < Number(pl.pasos.find((p) => p.clave === 'mirar')?.vuelve_a?.max ?? 0)
      const ver = veredictoDeImagenes(filtradas, reglasVisuales(e, b.brief), b.F.propios, puede, { exigirDato: reglasDeInvencion(pl.limites) !== null, esGenerada: () => modo === 'generada' })
      // re-imagen que no cumple el brief: NO se pisa la observación ni la imagen anterior (se queda la que estaba) y se dice
      if (esRe && ver.pasan.length === 0) return { res: { costo_usd: 0, fichas: [fichaNueva(`reimagen-no-cumplio-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'sugerencia', 'la imagen nueva (re-imagen que pidió la opinión) no cumple el brief: se queda la anterior', 'reglas de imagen del brief', 'queda declarado: la re-imagen fue la vuelta de su creador')] } }
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
      const otras = e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && !mias.includes(f) && (origen === 'externa' ? duenoDeLaFicha(f) !== AGENTE_DE_LA_IMAGEN : f.gravedad === 'bloquea'))
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
    case 'decide_imagen': {
      const mias = fichasQueTocan(e, paso)
      const respuestas = v.respuestas as Array<{ id: string; estado: 'tomada' | 'no_tomada'; razon: string }>
      const validas = respuestas.filter((x) => mias.some((f) => f.id === x.id))
      const huerfanas = mias.filter((f) => !validas.some((x) => x.id === f.id))
      const tomada = validas.find((x) => x.estado === 'tomada')
      const re = decidirReImagen(e, pl, !!tomada)
      return { res: { costo_usd: 0, artefacto: { re_imagen: re.si, por_rehacer_humano: !!tomada && !re.si, motivo: re.motivo, razon: tomada?.razon ?? null }, resoluciones: [...validas.map((x) => ({ id: x.id, estado: x.estado, razon: x.razon })), ...huerfanas.map((f) => ({ id: f.id, estado: 'no_tomada' as const, razon: 'el empleado no respondió este hallazgo' }))] } }
    }
    default: return { res: { costo_usd: 0, artefacto: v } }
  }
}

// ───────────────────────── cierres
export async function fallar(P: Puertos, enc: Encargo, motivo: string, corte?: OrigenDeCorteNuestro): Promise<Respuesta> {
  // 11-nov · GO Lenovo (un reel que cerró fallido a ciegas) · la causa queda GUARDADA en el encargo, no solo en el aviso: un fallido nunca más queda a ciegas
  // 11-nov · regla (b) · `corte` = la marca de corte por causa nuestra que declara QUIEN DETECTÓ la caída (solo una de la lista cerrada marca)
  const e = conCausaDelFallo(enc.estado_del_motor, motivo, P.ahora(), corte)
  enc = { ...enc, estado_del_motor: e }
  // 31-oct · la mesa de brief o de concepto que falla se lo dice a la cadena (que sigue con lo que tenga o pide a un humano); jamás deja a la campaña esperando
  if (enc.familia === 'brief_mesa' || enc.familia === 'concepto_mesa' || enc.familia === 'reubicacion_mesa' || enc.familia === 'fallidos_mesa' || enc.familia === 'banco_mesa') {
    const { entregarALaCadena } = await import('./mesa/de-la-cadena')
    await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `🛑 La mesa de la cadena falló · ${enc.brief_id}: ${motivo}`, dry_run: enc.dry_run })
    return entregarALaCadena(P, enc, { texto: null, motivo: `fallo: ${motivo}`.slice(0, 300), estado: 'fallido' })
  }
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: enc.gasto_usd, estado: 'fallido', con_desacuerdo: true })
  // una alarma por incidente: la v1 avisa a `alertas`; las versiones reabiertas (v2, v3…) repiten el mismo incidente y van al HILO (la versión nueva hereda el hilo de la anterior)
  await P.avisar({ canal: enc.version_encargo >= 2 ? 'hilo' : 'alertas', encargo_id: enc.id, texto: `🛑 Encargo fallido · ${enc.brief_id}${enc.version_encargo >= 2 ? ` (intento ${enc.version_encargo})` : ''}: ${motivo}`, dry_run: enc.dry_run })
  // 21-oct · el aviso ÚNICO del tope de versiones: este encargo agota los intentos que cuentan y cierra fallido (cada encargo cierra una sola vez): ya no se reabre solo
  // 11-nov · regla (b) · los intentos se cuentan sobre las versiones reales del brief (`intentosQueCuentan`): una cortada por causa nuestra no cuenta. Sin la lectura de hermanos, se cuenta como antes (por número)
  const yo: RastroDeEncargo = rastroDe({ ...enc, estado: 'fallido', estado_del_motor: e })
  let hermanos: RastroDeEncargo[] = []
  try { hermanos = P.almacen.hermanosDe ? await P.almacen.hermanosDe(enc) : [] } catch { hermanos = [] }
  if (agotaLasVersiones(yo, hermanos)) await P.avisar({ canal: 'hilo', encargo_id: enc.id, texto: `🧱 ${enc.brief_id}: ${MAX_VERSIONES_POR_BRIEF} intentos de la oficina y ninguno salió. No se reabre solo.`, dry_run: enc.dry_run })
  // 11-nov · regla (b) · techo de Lenovo: la 3.ª versión cortada por causa nuestra dispara UNA alarma real (desde la siguiente, una cortada ya cuenta)
  if (alcanzaElTechoDeCortadas(yo, hermanos)) await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `🧯 ${enc.brief_id}: ${MAX_VERSIONES_CORTADAS} versiones cortadas por causa nuestra (${e.fallo?.corte_nuestro?.origen ?? 'corte'}). La pieza queda fallida con su causa; desde ahora un nuevo corte cuenta como intento.`, dry_run: enc.dry_run })
  return r(200, { accion: 'cerrado', estado: 'fallido', motivo, resultado_para_la_sala: 'fallido', sala_ref: enc.sala_ref, simulado: enc.dry_run })
}

export async function cerrarPorTope(P: Puertos, enc: Encargo, pl: Plantilla, razon: string, detalle: string): Promise<Respuesta> {
  // LA MESA (T9 de CC#3): si el tope corta antes de que la pieza esté armada, lo que el equipo escribió llega igual a la bandeja (nunca «nada entregado»)
  if (pl.limites.mesa === true) {
    const entregada = await (await import('./mesa/orquestador')).entregarPorTopeDeLaMesa(P, enc, `cierre por tope (${razon}): ${detalle}`)
    if (entregada) return entregada
  }
  await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `🛑 Cierre por tope (${razon}) · ${enc.brief_id}: ${detalle}`, dry_run: enc.dry_run })
  return cerrar(P, enc, pl, true, `cierre por tope: ${detalle}`)
}

export async function cerrar(P: Puertos, enc: Encargo, pl: Plantilla, parcial: boolean, nota?: string): Promise<Respuesta> {
  const e = enc.estado_del_motor
  // salas 2 y 3: el resumen de lo que va a la salida y a la bandeja sale de las láminas; el video, del guion y del video (null para el post de la sala 1)
  const lam = resumenDeCierreL(enc, e, pl) ?? resumenDeCierreV(enc, e, pl)
  // REVISIÓN 2 · el único lugar que decide (`fichasAlCierre`): frena SOLO una regla dura de la lista que sigue rota; la devuelta a la cadena va «con desacuerdo»;
  //   lo demás (criterio de cualquier agente, lo que antes «decidía una persona», la revisión incompleta o sin revisar) es una OBSERVACIÓN DECLARADA: la pieza sigue
  const cierre = fichasAlCierre(e)
  let conDesacuerdo = cierre.en_la_cadena.length > 0 || parcial
  const estadoFinal: Encargo['estado'] = parcial ? 'cerrado_por_tope' : 'cerrado'
  const pz = datos(e, 'pieza_post')
  const fin = datos(e, 'imagen_final')
  const ent = datos(e, 'entrega')
  const b = datos(e, 'encargo') ? base(e) : null
  const generada = lam ? lam.generada : fin?.origen === 'generada'
  // RESPUESTA-LENOVO 17-nov punto 3 · una regla dura que sigue rota tras la vuelta FRENA (ver abajo)
  const frenoDuro = cierre.frenan
  // ESLABONES 1 y 3 de #1150 · lo devuelto a la cadena: el receptor dice qué hace la pieza. Solo `sigue` la deja ir a la bandeja;
  //   reemplazada / frenada / esperando: ni salida ni bandeja. El que espera queda `cerrado` con `esperando_a_la_cadena` y lo vuelve a mirar el vigía
  const cadena = cierre.en_la_cadena.length ? await consultarLaCadena(P, enc, e) : null
  if (cadena) {
    // CERTIFICACION-CC7 punto 4 · la pieza que ya FRENA por su propia regla dura no sale nunca: la devolución igual llegó al receptor (corrige la cadena),
    //   pero el encargo NO queda pendiente de la cadena · el vigía no lo vuelve a correr y su alarma de freno sale UNA vez
    if (frenoDuro.length) cadena.espera.pendiente = false
    const antes = e.artefactos[ARTEFACTO_ESPERA_DE_LA_CADENA]
    e.artefactos[ARTEFACTO_ESPERA_DE_LA_CADENA] = { version: (antes?.version ?? 0) + 1, version_consumida: antes?.version_consumida ?? 0, datos: cadena.espera as unknown as Record<string, unknown> }
    for (const a of cadena.alarmas) await P.avisar({ canal: a.canal, encargo_id: enc.id, texto: a.texto, dry_run: enc.dry_run })
    if (cadena.veredicto === 'sigue') conDesacuerdo = parcial
    else if (!frenoDuro.length) {
      const frenada = cadena.veredicto === 'frenada'
      await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: enc.gasto_usd, estado: estadoFinal, con_desacuerdo: frenada, imagen_generada: generada, salida_output_id: null, hitl_queue_id: null })
      const resultado = cadena.veredicto === 'esperando' ? RESULTADO_ESPERANDO_A_LA_CADENA : cadena.veredicto === 'reemplazada' ? RESULTADO_REEMPLAZADA : 'con_desacuerdo'
      return r(200, { accion: 'cerrado', estado: estadoFinal, con_desacuerdo: frenada, ...(frenada ? { frenada: true } : {}), para_la_pieza: cadena.veredicto, simulado: enc.dry_run, gasto_usd: e.gasto_usd, output_id: null, hitl_queue_id: null, resultado_para_la_sala: resultado, sala_ref: enc.sala_ref })
    }
  }
  let output_id: string | null = null, hitl_id: string | null = null
  // RESPUESTA-LENOVO 17-nov punto 3 · una regla dura que sigue rota tras la vuelta FRENA: la pieza no va a la salida ni a la bandeja (nadie la aprueba encima) y sale UNA alarma con el motivo
  const desacuerdos = [...cierre.frenan, ...(cadena?.veredicto === 'sigue' ? [] : cierre.en_la_cadena)].map((f) => `${f.donde}: ${f.que ?? ''}`)
  const observaciones = [...(cadena?.veredicto === 'sigue' ? cadena.observaciones : []), ...cierre.observaciones.map((f) => `${f.donde}: ${f.que ?? ''}`), ...(revisionIncompleta(e) ? [datosDeLaJefatura(e)?.sin_revisar ? 'revisión: sin revisar (la jefatura no abrió o no contestó)' : `revisión: incompleta (${datosDeLaJefatura(e)?.resultado})`] : [])]
  if (!enc.dry_run && (pz || lam) && b && !frenoDuro.length) {
    // la opinión libre del revisor externo viaja con la pieza, rotulada como OPINIÓN (y lo que el autor decidió con ella)
    const opinion = opinionExterna(e)
    const sinSegunda = datos(e, 'fichas_externas')?.sin_revision === true
    const contenido = { ...(lam ? lam.contenido : { pie_de_foto: pz!.pie_de_foto, hashtags: pz!.hashtags, llamado: pz!.llamado ?? null, nota_para_quien_publica: pz!.nota_para_quien_publica ?? null, imagen: fin ?? null, entrega: ent ? { urls: ent.urls, expires_at: ent.expires_at } : null }), ...(opinion ? { opinion_externa: opinion } : {}) }
    // de dónde viene cada imagen (foto propia · cercana · generada · tipográfica): solo con la plantilla que lo pide
    const origenes = marcaDeOrigenActiva(pl.limites) ? origenesDeImagenes(e, pl.limites) : null
    const metadata = { origen: 'oficina', ...(sinSegunda ? { sin_segunda_mirada: true } : {}), familia: enc.familia, parte_id: enc.parte_id, brief_id: enc.brief_id, oficina_encargo_id: enc.id, imagen_generada: generada, con_desacuerdo: conDesacuerdo, desacuerdos, ...(observaciones.length ? { observaciones } : {}), ...(opinion ? { opinion_externa: { texto: opinion.texto.slice(0, 2000), modelo: opinion.modelo, el_autor: opinion.el_autor, por_dueno: opinion.por_dueno } } : {}), ...(imagenPorRehacer(e) ? { imagen_por_rehacer: true } : {}), ...(datos(e, 'respuesta_imagen')?.re_imagen === true ? { re_imagen_hecha: true } : {}), ...metadataDeLaJefatura(e), ...(origenes ? { origen_de_imagenes: origenes.por_imagen, origen_de_imagenes_resumen: origenes.resumen } : {}), ...metadataDeAvisosDeConcepto(e) }
    const s = await P.salida({ client_id: enc.client_id, titulo: lam ? lam.titulo : `Pieza ${enc.brief_id} · ${b.brief.red}`, contenido, metadata })
    if (s.ok) {
      output_id = s.output_id
      const q = await P.bandeja({ client_id: enc.client_id, output_id, titulo: prefijoDeLaBandeja(e) + marcaDeObservaciones(cierre.observaciones) + (sinSegunda ? '⚠️ SIN SEGUNDA MIRADA · ' : '') + (imagenPorRehacer(e) ? '🖼️ IMAGEN POR REHACER (declarado) · ' : '') + (lam ? lam.tituloBandeja : `Aprobación · Pieza ${enc.brief_id} · ${b.brief.red} · versión ${e.artefactos['pieza_post']?.version ?? 1} · ${b.F.cliente_nombre}`), vista_previa: (origenes?.resumen ? `🖼️ ${origenes.resumen} — ` : '') + (lam ? lam.vista_previa : String(pz!.pie_de_foto ?? '').slice(0, 280)), metadata: { ...metadata, costo_usd: e.gasto_usd, enlace_entrega: ent ? ent.urls : null }, expires_at: lam ? lam.expires_at : (ent?.expires_at as string | null | undefined) ?? null })
      if (q.ok) hitl_id = q.id
    }
  }
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: enc.gasto_usd, estado: estadoFinal, con_desacuerdo: conDesacuerdo, imagen_generada: generada, salida_output_id: output_id, hitl_queue_id: hitl_id })
  // revisión 2 · pregunta 4 · el video que cobró más que su tope: alarma de gasto (sin bloquear, sin persona); si además frena, va DENTRO de la misma alarma del freno
  const sobreTope = e.fichas.filter((f) => f.contra_que === TOPE_POR_VIDEO)
  const textoDelGasto = sobreTope.length ? `💸 Gasto sobre el tope · ${enc.brief_id}: ${sobreTope[0].que ?? ''}.` : ''
  if (frenoDuro.length) {
    // una alarma por incidente: si el cierre fue por tope (ya avisó a #alertas) o es la versión 2 o más del mismo brief, va al hilo (ADENDA 2 de CC7 a #1148)
    const nt = reglasDurasNoTomadas(e)
    const motivos = [...nt.map((h) => `${h.destino}: ${h.que}`), ...frenoDuro.filter((f) => !f.id.startsWith('sentido-no-tomada-')).map((f) => `${f.donde}: ${f.que ?? ''}`)]
    // 18-nov · GO Lenovo 13:52Z · ya no «frenada»: mientras cupo, la pieza volvió a su creador; aquí ya no cabe otra vuelta y queda EN CORRECCIÓN (la campaña sigue)
    await P.avisar({ canal: parcial || enc.version_encargo >= 2 ? 'hilo' : 'alertas', encargo_id: enc.id, texto: `🔁 Pieza en corrección · ${enc.brief_id}: regla dura pendiente — ${motivos.join(' | ')}. No se publica ni va a la bandeja hasta cumplirla; su creador ya no tiene otra vuelta dentro del tope del encargo, así que espera tu criterio. Las demás piezas siguen.${textoDelGasto ? ` ${textoDelGasto}` : ''}`, dry_run: enc.dry_run })
    return r(200, { accion: 'cerrado', estado: estadoFinal, con_desacuerdo: true, frenada: true, en_correccion: true, simulado: enc.dry_run, gasto_usd: e.gasto_usd, output_id: null, hitl_queue_id: null, resultado_para_la_sala: 'con_desacuerdo', sala_ref: enc.sala_ref, desacuerdos, ...(observaciones.length ? { observaciones } : {}) })
  }
  // la alarma de gasto sola (la pieza sigue): las versiones 2+ y el cierre por tope (ya avisó) van al hilo
  if (textoDelGasto) await P.avisar({ canal: parcial || enc.version_encargo >= 2 ? 'hilo' : 'alertas', encargo_id: enc.id, texto: `${textoDelGasto} La pieza sigue (el dinero ya se gastó).`, dry_run: enc.dry_run })
  await P.avisar({ canal: 'hilo', encargo_id: enc.id, texto: conDesacuerdo ? `⚠️ Con desacuerdo · ${enc.brief_id}${nota ? ` · ${nota}` : ''}` : `✅ En la bandeja · ${enc.brief_id} · US$ ${e.gasto_usd.toFixed(3)}`, dry_run: enc.dry_run })
  if (conDesacuerdo && !parcial) await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `⚠️ Encargo con desacuerdo · ${enc.brief_id}: ${desacuerdos.slice(0, 3).join(' | ')}`, dry_run: enc.dry_run })
  return r(200, {
    accion: 'cerrado', estado: estadoFinal, con_desacuerdo: conDesacuerdo, simulado: enc.dry_run, gasto_usd: e.gasto_usd, output_id, hitl_queue_id: hitl_id,
    resultado_para_la_sala: parcial ? 'cerrado_por_tope' : conDesacuerdo ? 'con_desacuerdo' : 'encargo_en_bandeja', sala_ref: enc.sala_ref, desacuerdos, ...(observaciones.length ? { observaciones } : {}),
  })
}
