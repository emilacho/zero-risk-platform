/**
 * LAS MESAS DE LA CADENA · lado de la CADENA (31-oct · nuevo orden · T3 · CC#1). El lado de la OFICINA es `oficina/mesa/de-la-cadena.ts` (CC#2, T2).
 *
 * Tres piezas:
 *   · ABRIR (`brief/abrir` · `concepto/abrir`): la cadena crea su fila (`cadena_brief_creativo` / `cadena_conceptos`) y DEVUELVE EL SOBRE que el flujo le lleva a la oficina
 *     (`POST /api/oficina/encargos` con `origen: 'cadena'`). La cadena no llama a la oficina: el flujo es el cartero (contrato de CC2, 31-oct).
 *   · RECIBIR (`P.cadena.entregarBrief/entregarConcepto` · y `brief/entregar` · `concepto/entregar` por HTTP): la mesa entrega su tablero; la cadena lo lee POR CÓDIGO
 *     (`leerBriefCreativo` · `leerConcepto`), guarda lo leído y decide: brief `validada`/`devuelta`; concepto `lista` (→ tarjeta a Emilio + espera que no vence),
 *     `sin_mesa` o `brief_devuelto`. «La primera entrega que cierra gana» (una entrega sobre una fila ya cerrada contesta `ya_cerrada`).
 *   · DECIDIR (`concepto/decidir`): Emilio aprueba o pide cambios (al concepto o al brief). Aprobar deja pasar la tanda 1 (`calendarioPreparar` consulta `aprobacion`).
 *     Cambios abre la versión n+1 con la nota EN EL MARCO. Cap: 2 vueltas por campaña; a la tercera, `necesita_humano`. Cambios sobre un concepto ya aprobado se ACEPTAN (nota 3 de CC3).
 *
 * Dos plazos, un dueño cada uno (reserva 2 de CC3 a T2): el plazo de TRABAJO de la mesa lo cierra la OFICINA (`plazo_mesa_min`); aquí `plazo_en` es solo una red de seguridad
 * (plazo + holgura): si la oficina nunca entrega, el reloj deja la mesa `sin_mesa` y la campaña sigue. El plazo de APROBACIÓN de Emilio vive en `cadena_esperas` (`aprobacion_concepto`).
 * Reaperturas: brief devuelto o concepto `sin_mesa` reabren UNA vez (versión 2); a la segunda, `necesita_humano`.
 * Todo esto solo existe con la palanca `cadena_config.nuevo_orden` encendida para el cliente; apagada, la cadena de hoy no tiene estas mesas (409).
 */
import type { Almacen, BriefCreativoGuardado, Campana, ConceptoGuardado, ContextoDelCliente } from './almacen'
import { autorizarLlamada, cadena, err, type Respuesta } from './autorizar'
import { hallazgosDelBrief, leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO, type BriefCreativoLeido } from './brief-creativo'
import { escribirHoja } from './hoja'
import { hallazgosDelConcepto, idDeBrief, idDeConcepto, insumosDesdeEstrategia, leerConcepto, resumenDelBanco, type ConceptoLeido } from './conceptos'
import { abrirEsperaDe, ponerNecesitaHumano, resolverEsperas } from './nucleo'
import { reglaDeIdioma, reglaDeRegistro } from './registro'
import type { Estrategia, FormatosPorRed } from './tipos'

export const CAP_DE_VUELTAS_DE_CAMBIOS = 2
/** versión 1 + UNA reapertura (brief devuelto · concepto sin_mesa); a la siguiente, necesita_humano */
export const MAX_VERSIONES_POR_REAPERTURA = 2
export const PLAZO_DE_MESA_MIN = { brief: 30, concepto: 90 } as const
export const HOLGURA_DE_MESA_MIN = 30
export const TIPO_DE_ESPERA_DE_CONCEPTO = 'aprobacion_concepto'
export const objetoDeEsperaDeConcepto = (version: number): string => `concepto:v${version}`

export interface SobreParaLaOficina { tipo_de_mesa: 'brief' | 'concepto'; client_id: string; campana_id: string; version: number; dry_run: boolean; marco_texto: string; condiciones: string[] }
export type EntregaALaCadena = { ok: true; estado?: string; ya_cerrada?: boolean } | { ok: false; error?: string }
export interface EntregaDeBrief { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }
export interface EntregaDeConcepto extends EntregaDeBrief { brief_devuelto?: string | null }

// ───────────────────────────────────────────────────────── palanca y condiciones (puros)
export async function nuevoOrdenEncendido(al: Almacen, clientId: string): Promise<boolean> {
  const p = await al.leerConfig('nuevo_orden')
  const clientes = p && typeof p === 'object' && Array.isArray((p as { clientes?: unknown }).clientes) ? ((p as { clientes: unknown[] }).clientes as unknown[]) : []
  return clientes.includes(clientId)
}

const ES_VIDEO = /video|reel|short|tiktok/i
/** las condiciones del directorio (`si_…`) las calcula la CADENA del plan de canales; la oficina solo las aplica (contrato de CC2) */
export function condicionesDe(e: Pick<Estrategia, 'canales' | 'patron_semanal'>, formatos: FormatosPorRed = {}): string[] {
  // solo las redes que publican (rol principal/réplica); un canal con rol «no» (excluido por el plan) no enciende condiciones
  const redes = new Set(e.canales.filter((c) => c.rol !== 'no').map((c) => String(c.red).toLowerCase()))
  const out = new Set<string>()
  if (redes.has('instagram') || redes.has('ig')) out.add('si_instagram')
  const hayVideo = e.patron_semanal.some((s) => ES_VIDEO.test(String(s.formato))) || redes.has('tiktok') || redes.has('youtube') ||
    [...redes].some((r) => (formatos[r] ?? []).some((f) => ES_VIDEO.test(f.formato)) && e.patron_semanal.some((s) => String(s.red).toLowerCase() === r && ES_VIDEO.test(String(s.formato))))
  if (hayVideo) out.add('si_video')
  return [...out]
}

// ───────────────────────────────────────────────────────── los marcos (texto, sin cliente en el código)
const fasesEnTexto = (e: Estrategia): string => e.fases.map((f) => `- ${f.clave}: días ${f.dia_desde}–${f.dia_hasta} · objetivo: ${f.objetivo} · plan dice: «${f.cita_plan}»`).join('\n') || '(la estrategia no trae fases)'
const canalesEnTexto = (e: Estrategia): string => e.canales.map((c) => `- ${c.red} (${c.rol})`).join('\n') || '(sin canales)'

const reglaDeLengua = (ctx: ContextoDelCliente): string => [reglaDeRegistro(ctx.registro), reglaDeIdioma(ctx.idioma)].filter(Boolean).join(' ')

export function marcoDelBrief(a: { ctx: ContextoDelCliente; estrategia: Estrategia; version: number; devolucion: string | null; nota: string | null; informeDeMercado?: string | null }): string {
  return [
    '# Qué te pido',
    `Escribe el brief creativo de ESTA campaña (versión ${a.version}) a partir del plan, la estrategia y el manual del cliente. ${reglaDeLengua(a.ctx)}`,
    '',
    REFERENCIA_DEL_BRIEF_CREATIVO,
    ...(a.devolucion ? ['', '# DEVOLUCIÓN (la versión anterior se devolvió por esto; corrígelo, no lo discutas)', a.devolucion] : []),
    ...(a.nota ? ['', '# CAMBIOS PEDIDOS POR EL CLIENTE', a.nota] : []),
    '',
    '# ESTRATEGIA · canales',
    canalesEnTexto(a.estrategia),
    '# ESTRATEGIA · fases',
    fasesEnTexto(a.estrategia),
    ...(a.informeDeMercado ? ['', '# INFORME DE MERCADO (PROPUESTA · no es dato del cliente · contexto, no mandato)', a.informeDeMercado] : []),
    '',
    `# PALABRAS PROHIBIDAS DEL MANUAL\n${a.ctx.forbiddenWords.length ? a.ctx.forbiddenWords.map((w) => `- ${w}`).join('\n') : '(ninguna)'}`,
    '',
    `# PLAN\n${a.ctx.planTexto}`,
  ].join('\n')
}

export function marcoDelConcepto(a: { ctx: ContextoDelCliente; estrategia: Estrategia; briefTexto: string; version: number; nota: string | null }): string {
  return [
    '# Qué te pido',
    `La gran idea de ESTA campaña (versión ${a.version}): UNA frase paraguas, por qué funciona, cómo se ve, cómo suena; un CAPÍTULO por fase de la estrategia, y el BANCO DE IDEAS por capítulo y por red. ${reglaDeLengua(a.ctx)}`,
    '',
    '# Formato (concepto.v1) · se lee por código, exacto',
    '## Gran idea · «- nombre: …» y «- frase: …» · ## Por qué funciona · ## Cómo se ve (cita fotos propias como `foto:<id>`) · ## Cómo suena',
    '## Capítulo <clave de fase> · qué cuenta · «- serie: S1 · nombre · qué cuenta · redes» · y debajo «### Banco de ideas» con UNA idea por línea:',
    '`- C<fase>-I<nn> · red · formato · idea · mensaje: … · gancho: … · protagonista: … · serie: S1 · foto:<id>|ninguna`',
    'Cada idea trae mensaje y gancho propios y distintos; ids únicos; mínimo por red = huecos del patrón semanal × semanas de la fase (si no alcanza, lo declaras en «## Banco parcial»).',
    'Sin cifras con decimales inventadas, sin datos con valor (precios, horarios: los pone el estratega con su referencia), sin palabras prohibidas. ## Caminos descartados · ## Citas.',
    'Si la dirección decide que el brief no sirve, escribe «## Devolución del brief» con los puntos de los 6 criterios que fallan (UNA sola vez por campaña) y la mesa cierra.',
    ...(a.nota ? ['', '# CAMBIOS PEDIDOS POR EL CLIENTE (sobre la versión anterior)', a.nota] : []),
    '',
    '# BRIEF CREATIVO DE LA CAMPAÑA (validado)',
    a.briefTexto,
    '',
    '# ESTRATEGIA · fases (un capítulo por fase)',
    fasesEnTexto(a.estrategia),
    '# ESTRATEGIA · canales y patrón semanal',
    canalesEnTexto(a.estrategia),
    a.estrategia.patron_semanal.map((s) => `- ${s.slot}: ${s.red} · ${s.formato} · día ${s.dia_semana} ${s.hora}`).join('\n') || '(sin patrón)',
    '',
    `# SEDES\n${a.ctx.sedes.length ? a.ctx.sedes.map((s) => `- ${s.clave}${s.nombre ? ` · ${s.nombre}` : ''}`).join('\n') : '(sin sedes)'}`,
    `# PALABRAS PROHIBIDAS DEL MANUAL\n${a.ctx.forbiddenWords.length ? a.ctx.forbiddenWords.map((w) => `- ${w}`).join('\n') : '(ninguna)'}`,
  ].join('\n')
}

// ───────────────────────────────────────────────────────── lo común
interface Cargado { campana: Campana; ctx: ContextoDelCliente; estrategia: Estrategia }
async function cargar(al: Almacen, cuerpo: Record<string, unknown>, autorizar: boolean): Promise<{ ok: true; c: Cargado } | { ok: false; r: Respuesta }> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return { ok: false, r: err(400, 'E-CAMPOS', 'falta campana_id') }
  const campana = await al.campana(id)
  if (!campana) return { ok: false, r: err(404, 'E-CAMPANA', 'campaña inexistente') }
  if (autorizar) { const noAut = await autorizarLlamada(al, cuerpo, campana.client_id); if (noAut) return { ok: false, r: noAut } }
  if (!(await nuevoOrdenEncendido(al, campana.client_id))) return { ok: false, r: err(409, 'E-NUEVO-ORDEN-APAGADO', 'la palanca nuevo_orden está apagada para este cliente: la cadena de hoy no tiene mesas de brief ni de concepto') }
  const estr = await al.ultimaEstrategia(campana.id)
  if (!estr || estr.estado !== 'validada') return { ok: false, r: err(409, 'E-SIN-ESTRATEGIA', 'no hay una estrategia validada: el brief creativo sale de la estrategia') }
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  if (!ctx) return { ok: false, r: err(409, 'E-SIN-CONTEXTO', 'no se pudo cargar el contexto del cliente (plan, manual)') }
  return { ok: true, c: { campana, ctx, estrategia: estr.contenido } }
}
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const masMinutos = (iso: string, min: number): string => new Date(Date.parse(iso) + min * 60_000).toISOString()

// ───────────────────────────────────────────────────────── BRIEF
export async function briefAbrir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo, true)
  if (!c.ok) return c.r
  const { campana, ctx, estrategia } = c.c
  const nota = texto(cuerpo.nota)
  const ultimo = await al.ultimoBriefCreativo(campana.id)
  if (ultimo?.estado === 'borrador') return { status: 200, cuerpo: { ya_abierta: true, version: ultimo.version, brief_id: idDeBrief(campana.id, ultimo.version) } }
  if (ultimo?.estado === 'validada' && !nota) return { status: 200, cuerpo: { ya_hecha: true, version: ultimo.version, brief_id: idDeBrief(campana.id, ultimo.version) } }
  const version = (ultimo?.version ?? 0) + 1
  // reapertura por devolución o fallo: UNA vez; con nota de Emilio (cambios) no cuenta como reapertura
  if (ultimo && (ultimo.estado === 'devuelta' || ultimo.estado === 'descartada') && !nota && ultimo.version >= MAX_VERSIONES_POR_REAPERTURA) {
    const r = await ponerNecesitaHumano(al, campana, `el brief creativo ya se ${ultimo.estado === 'devuelta' ? 'devolvió' : 'descartó'} ${ultimo.version} veces`, ahora)
    return { status: 409, cuerpo: { error: 'brief_agotado', necesita_humano: true, alerta: r.alerta } }
  }
  const fila: BriefCreativoGuardado = { campana_id: campana.id, version, estado: 'borrador', texto_md: null, leido: null, devolucion_texto: null, motivo: null, costo_usd: null, encargo_id: null, seco: campana.seco }
  await al.insertarBriefCreativo(fila)
  const sobre: SobreParaLaOficina = {
    tipo_de_mesa: 'brief', client_id: campana.client_id, campana_id: campana.id, version, dry_run: campana.seco,
    marco_texto: marcoDelBrief({ ctx, estrategia, version, devolucion: ultimo?.estado === 'devuelta' ? ultimo.devolucion_texto : null, nota, informeDeMercado: texto(cuerpo.informe_de_mercado) }),
    condiciones: condicionesDe(estrategia, await al.formatos()),
  }
  return { status: 200, cuerpo: { version, brief_id: idDeBrief(campana.id, version), plazo_mesa_min: PLAZO_DE_MESA_MIN.brief, sobre } }
}

/** la entrega de la mesa del brief (puerto `P.cadena.entregarBrief`) · nunca lanza hacia la oficina: lo que falle se dice en `error` */
export async function recibirBrief(al: Almacen, p: EntregaDeBrief, ahora: string): Promise<EntregaALaCadena> {
  const campana = await al.campana(p.campana_id)
  if (!campana) return { ok: false, error: 'campaña inexistente' }
  const ultimo = await al.ultimoBriefCreativo(campana.id)
  if (!ultimo || ultimo.version !== p.version) return { ok: false, error: `la cadena no tiene abierta la versión ${p.version} del brief (última: ${ultimo?.version ?? 'ninguna'})` }
  if (ultimo.estado !== 'borrador') return { ok: true, ya_cerrada: true, estado: ultimo.estado }
  const base = { costo_usd: p.costo_usd, encargo_id: p.encargo_id, motivo: p.motivo }
  if (!texto(p.texto)) {
    await al.actualizarBriefCreativo(campana.id, p.version, { ...base, estado: 'descartada', motivo: p.motivo ?? 'la mesa no entregó texto' })
    if (p.version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `la mesa del brief no entregó dos veces (${p.motivo ?? 'sin motivo'})`, ahora)
    return { ok: true, estado: 'descartada' }
  }
  const estr = await al.ultimaEstrategia(campana.id)
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const leido = leerBriefCreativo(p.texto as string, { planTexto: ctx?.planTexto ?? '', prohibidas: ctx?.forbiddenWords ?? [], redes: (estr?.contenido.canales ?? []).filter((x) => x.rol !== 'no').map((x) => x.red) })
  const bloquea = hallazgosDelBrief(leido).filter((h) => h.severidad === 'bloquea').map((h) => h.ficha.que)
  const estado = bloquea.length ? 'devuelta' : 'validada'
  await al.actualizarBriefCreativo(campana.id, p.version, { ...base, estado, texto_md: p.texto, leido: leido as unknown as Record<string, unknown>, devolucion_texto: bloquea.length ? bloquea.map((b) => `- ${b}`).join('\n') : null })
  if (estado === 'devuelta' && p.version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `el brief creativo se devolvió por código dos veces: ${bloquea.slice(0, 3).join(' · ')}`, ahora)
  return { ok: true, estado }
}

// ───────────────────────────────────────────────────────── CONCEPTO
const cuentaDe = (cs: ConceptoGuardado[], f: (c: ConceptoGuardado) => boolean): number => cs.filter(f).length

export async function conceptoAbrir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo, true)
  if (!c.ok) return c.r
  const { campana, ctx, estrategia } = c.c
  const nota = texto(cuerpo.nota)
  const brief = await al.ultimoBriefCreativo(campana.id)
  if (!brief || brief.estado !== 'validada') return err(409, 'E-SIN-BRIEF', `no hay un brief creativo validado (último: ${brief?.estado ?? 'ninguno'})`)
  const todos = await al.conceptosDe(campana.id)
  const ultimo = todos[todos.length - 1] ?? null
  if (ultimo?.estado === 'abierta') return { status: 200, cuerpo: { ya_abierta: true, version: ultimo.version, concepto_id: idDeConcepto(campana.id, ultimo.version) } }
  if (ultimo?.estado === 'lista' && !nota) return { status: 200, cuerpo: { ya_hecha: true, version: ultimo.version, aprobacion: ultimo.aprobacion, concepto_id: idDeConcepto(campana.id, ultimo.version) } }
  if (!nota && cuentaDe(todos, (x) => x.estado === 'sin_mesa') >= MAX_VERSIONES_POR_REAPERTURA) {
    const r = await ponerNecesitaHumano(al, campana, 'la mesa de concepto no entregó concepto dos veces', ahora)
    return { status: 409, cuerpo: { error: 'concepto_agotado', necesita_humano: true, alerta: r.alerta } }
  }
  const version = (ultimo?.version ?? 0) + 1
  const plazoMin = typeof cuerpo.plazo_mesa_min === 'number' && cuerpo.plazo_mesa_min > 0 ? cuerpo.plazo_mesa_min : PLAZO_DE_MESA_MIN.concepto
  const fila: ConceptoGuardado = {
    campana_id: campana.id, version, estado: 'abierta', aprobacion: null, texto_md: null, leido: null, brief_devuelto: null, motivo: null, costo_usd: null,
    plazo_en: masMinutos(ahora, plazoMin + HOLGURA_DE_MESA_MIN), encargo_id: null, hitl_id: null, nota_de_emilio: nota, apunta_a: null, decidido_en: null, seco: campana.seco,
  }
  await al.insertarConcepto(fila)
  const sobre: SobreParaLaOficina = {
    tipo_de_mesa: 'concepto', client_id: campana.client_id, campana_id: campana.id, version, dry_run: campana.seco,
    marco_texto: marcoDelConcepto({ ctx, estrategia, briefTexto: brief.texto_md ?? '', version, nota }), condiciones: condicionesDe(estrategia, await al.formatos()),
  }
  return { status: 200, cuerpo: { version, concepto_id: idDeConcepto(campana.id, version), brief_version: brief.version, plazo_mesa_min: plazoMin, sobre } }
}

/** la entrega de la mesa de concepto (puerto `P.cadena.entregarConcepto`) */
export async function recibirConcepto(al: Almacen, p: EntregaDeConcepto, ahora: string): Promise<EntregaALaCadena> {
  const campana = await al.campana(p.campana_id)
  if (!campana) return { ok: false, error: 'campaña inexistente' }
  const todos = await al.conceptosDe(campana.id)
  const fila = todos.find((x) => x.version === p.version)
  if (!fila) return { ok: false, error: `la cadena no tiene la versión ${p.version} del concepto` }
  if (fila.estado !== 'abierta') return { ok: true, ya_cerrada: true, estado: fila.estado }
  const base = { costo_usd: p.costo_usd, encargo_id: p.encargo_id, motivo: p.motivo }
  const devolucion = texto(p.brief_devuelto)
  if (devolucion) {
    await al.actualizarConcepto(campana.id, p.version, { ...base, estado: 'brief_devuelto', brief_devuelto: devolucion, texto_md: p.texto })
    const brief = await al.ultimoBriefCreativo(campana.id)
    if (brief) {
      await al.actualizarBriefCreativo(campana.id, brief.version, { estado: 'devuelta', devolucion_texto: devolucion })
      if (brief.version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, 'la dirección devolvió el brief y ya era la segunda versión', ahora)
    }
    return { ok: true, estado: 'brief_devuelto' }
  }
  const sinMesa = async (motivo: string): Promise<EntregaALaCadena> => {
    await al.actualizarConcepto(campana.id, p.version, { ...base, estado: 'sin_mesa', motivo, texto_md: p.texto })
    if (cuentaDe(todos, (x) => x.estado === 'sin_mesa') + 1 >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `la mesa de concepto no entregó concepto dos veces (${motivo.slice(0, 160)})`, ahora)
    return { ok: true, estado: 'sin_mesa' }
  }
  if (!texto(p.texto)) return sinMesa(p.motivo ?? 'la mesa no entregó texto')
  const estr = await al.ultimaEstrategia(campana.id)
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const ins = estr ? insumosDesdeEstrategia(estr.contenido, ctx?.forbiddenWords ?? [], []) : { fases: [], redes: [], prohibidas: ctx?.forbiddenWords ?? [], fotos: [] }
  const leido = leerConcepto(p.texto as string, ins)
  if (leido.estado === 'sin_concepto') return sinMesa(`sin_concepto: ${leido.bloqueos.join(' · ')}`)
  const hallazgos = hallazgosDelConcepto(leido)
  await al.actualizarConcepto(campana.id, p.version, { ...base, estado: 'lista', aprobacion: 'pendiente', texto_md: p.texto, leido: leido as unknown as Record<string, unknown> })
  await abrirEsperaDe(al, campana, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(p.version), 'esperando la aprobación de Emilio sobre la gran idea', ahora, { fechaInicio: campana.fecha_inicio, zona: campana.zona_horaria }, `concepto:${campana.id}:v${p.version}`)
  const vueltasUsadas = cuentaDe(todos, (x) => x.aprobacion === 'cambios')
  const resumen = resumenDelBanco(leido)
  const hitl_id = await al.abrirTarjetaDeConcepto({
    client_id: campana.client_id, campana_id: campana.id, version: p.version, seco: campana.seco,
    titulo: `Gran idea · ${leido.gran_idea?.nombre ?? '(sin nombre)'} · campaña ${ctx?.nombreDelNegocio ?? campana.client_id}`,
    vista_previa: `${leido.gran_idea?.frase ?? ''}\n${resumen.total} ideas en el banco · ${leido.capitulos.length} capítulo(s)${resumen.parcial.length ? ' · banco parcial' : ''}`,
    metadata: {
      origen: 'cadena', tipo: 'concepto', campana_id: campana.id, version: p.version, concepto_id: idDeConcepto(campana.id, p.version), brief_version: (await al.ultimoBriefCreativo(campana.id))?.version ?? null,
      seco: campana.seco, costo_usd: p.costo_usd, vueltas_restantes: Math.max(0, CAP_DE_VUELTAS_DE_CAMBIOS - vueltasUsadas), avisos: hallazgos.filter((h) => h.severidad === 'aviso').map((h) => h.ficha.que), resumen_del_banco: resumen,
    },
  })
  await al.actualizarConcepto(campana.id, p.version, { hitl_id })
  return { ok: true, estado: 'lista' }
}

export async function conceptoDecidir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const campana = await al.campana(id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return noAut
  const decision = cuerpo.decision === 'aprobar' || cuerpo.decision === 'cambios' ? cuerpo.decision : null
  if (!decision) return err(400, 'E-DECISION', 'decision debe ser «aprobar» o «cambios»')
  const todos = await al.conceptosDe(campana.id)
  const version = Number.isInteger(cuerpo.version) ? (cuerpo.version as number) : (todos[todos.length - 1]?.version ?? 0)
  const fila = todos.find((x) => x.version === version)
  if (!fila || fila.estado !== 'lista') return err(409, 'E-SIN-TARJETA', `la versión ${version} del concepto no está lista para decidir (${fila?.estado ?? 'no existe'})`)
  const autor = texto(cuerpo.autor) ?? 'emilio'
  const nota = texto(cuerpo.nota)
  if (decision === 'aprobar') {
    if (fila.aprobacion === 'aprobado') return { status: 200, cuerpo: { ya_decidido: true, decision: 'aprobar', version } }
    await al.actualizarConcepto(campana.id, version, { aprobacion: 'aprobado', decidido_en: ahora, nota_de_emilio: nota ?? fila.nota_de_emilio, apunta_a: null })
    await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(version))
    if (fila.hitl_id) await al.cerrarTarjetaDeConcepto(fila.hitl_id, { status: 'approved', decision: { accion: 'aprobar', nota, version } })
    if (fila.hitl_id) await al.registrarDecisionDeEmilio({ hitl_id: fila.hitl_id, accion: 'aprobar', comentario: nota, autor, ahora })
    return { status: 200, cuerpo: { decision: 'aprobar', version, concepto_id: idDeConcepto(campana.id, version) } }
  }
  const apuntaA = cuerpo.apunta_a === 'brief' ? 'brief' : cuerpo.apunta_a === 'concepto' ? 'concepto' : null
  if (!apuntaA) return err(400, 'E-APUNTA-A', 'cambios necesita apunta_a: «concepto» (otra ronda de la mesa) o «brief» (brief nuevo y concepto sobre él)')
  if (!nota) return err(400, 'E-NOTA', 'cambios necesita una nota: qué cambiar (va al marco de la mesa)')
  const vueltas = cuentaDe(todos, (x) => x.aprobacion === 'cambios')
  if (vueltas >= CAP_DE_VUELTAS_DE_CAMBIOS) {
    const r = await ponerNecesitaHumano(al, campana, `Emilio pidió cambios por tercera vez sobre la gran idea (cap ${CAP_DE_VUELTAS_DE_CAMBIOS}); se decide a mano`, ahora)
    return { status: 409, cuerpo: { error: 'vueltas_agotadas', necesita_humano: true, alerta: r.alerta } }
  }
  // cambios sobre un concepto YA aprobado también valen (cambio de rumbo a mitad de campaña · nota 3 de CC3): las filas ya ordenadas conservan su idea_ref
  await al.actualizarConcepto(campana.id, version, { aprobacion: 'cambios', apunta_a: apuntaA, nota_de_emilio: nota, decidido_en: ahora })
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(version))
  if (fila.hitl_id) await al.cerrarTarjetaDeConcepto(fila.hitl_id, { status: 'rejected', decision: { accion: 'pedir_cambios', apunta_a: apuntaA, nota, version } })
  if (fila.hitl_id) await al.registrarDecisionDeEmilio({ hitl_id: fila.hitl_id, accion: 'pedir_cambios', comentario: nota, autor, ahora })
  const brief = await al.ultimoBriefCreativo(campana.id)
  const siguiente = apuntaA === 'brief' ? { mesa: 'brief' as const, version: (brief?.version ?? 0) + 1 } : { mesa: 'concepto' as const, version: version + 1 }
  return { status: 200, cuerpo: { decision: 'cambios', version, apunta_a: apuntaA, siguiente, vueltas_restantes: CAP_DE_VUELTAS_DE_CAMBIOS - vueltas - 1, nota } }
}

// ───────────────────────────────────────────────────────── lo que el CALENDARIO y el RELOJ necesitan de las mesas
export interface ConceptoParaElCalendario {
  /** la gran idea APROBADA más reciente (una versión posterior en vuelta de cambios no la quita: las tandas siguientes la toman cuando se apruebe) */
  concepto: ConceptoLeido | null
  version: number | null
  /** palanca encendida y sin gran idea aprobada: el calendario espera (qué falta) · null = puede seguir (sin palanca o con concepto) */
  espera: null | { falta: 'brief' | 'concepto' | 'entrega' | 'aprobacion'; version: number | null; estado: string | null; aprobacion: string | null }
}
export async function conceptoParaElCalendario(al: Almacen, campana: Pick<Campana, 'id' | 'client_id'>): Promise<ConceptoParaElCalendario> {
  if (!(await nuevoOrdenEncendido(al, campana.client_id))) return { concepto: null, version: null, espera: null }
  const todos = await al.conceptosDe(campana.id)
  const aprobado = [...todos].reverse().find((c) => c.aprobacion === 'aprobado' && c.leido)
  if (aprobado) return { concepto: aprobado.leido as unknown as ConceptoLeido, version: aprobado.version, espera: null }
  const ultimo = todos[todos.length - 1] ?? null
  const brief = await al.ultimoBriefCreativo(campana.id)
  const falta = !brief || brief.estado !== 'validada' ? 'brief' : !ultimo || ultimo.estado === 'sin_mesa' || ultimo.estado === 'brief_devuelto' ? 'concepto' : ultimo.estado === 'abierta' ? 'entrega' : 'aprobacion'
  return { concepto: null, version: null, espera: { falta, version: ultimo?.version ?? null, estado: ultimo?.estado ?? null, aprobacion: ultimo?.aprobacion ?? null } }
}

/** el reloj: una mesa de concepto que pasó su red de seguridad (plazo + holgura) sin entregar queda `sin_mesa` (la campaña sigue; dos veces ⇒ necesita_humano). Devuelve una línea por mesa cerrada. */
export async function cerrarMesasVencidas(al: Almacen, ahora: string): Promise<Array<{ campana_id: string; texto: string }>> {
  const out: Array<{ campana_id: string; texto: string }> = []
  for (const c of await al.conceptosVencidos(ahora)) {
    const motivo = `la mesa de concepto (versión ${c.version}) no entregó antes de su plazo más la holgura (${c.plazo_en})`
    await al.actualizarConcepto(c.campana_id, c.version, { estado: 'sin_mesa', motivo })
    const campana = await al.campana(c.campana_id)
    const sinMesa = (await al.conceptosDe(c.campana_id)).filter((x) => x.estado === 'sin_mesa').length
    if (campana && sinMesa >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `la mesa de concepto no entregó dos veces (la última venció: ${c.plazo_en})`, ahora)
    out.push({ campana_id: c.campana_id, texto: `${motivo}: queda sin_mesa${sinMesa >= MAX_VERSIONES_POR_REAPERTURA ? ' · ya son dos: necesita_humano' : ' · se reabre una vez'}` })
  }
  return out
}

export const HOLGURA_DE_PRODUCCION_DIAS = 2
/** cuántos días antes de la fecha de inicio hay que tener la gran idea: el mayor `lead_dias` de los formatos del patrón (mínimo 1) */
export function leadDiasDeLaPrimeraSemana(e: Pick<Estrategia, 'patron_semanal'>, formatos: FormatosPorRed): number {
  let lead = 1
  for (const s of e.patron_semanal) for (const f of formatos[String(s.red).toLowerCase()] ?? []) if (f.formato === s.formato && f.lead_dias > lead) lead = f.lead_dias
  return lead
}
/** UN aviso de ESTADO (el reloj lo repite solo si cambia): sin la gran idea aprobada la campaña perderá su primera semana · null si todavía hay tiempo */
export async function avisoDePrimeraSemana(al: Almacen, campana: Pick<Campana, 'id' | 'fecha_inicio'>, hoy: string): Promise<string | null> {
  const estr = await al.ultimaEstrategia(campana.id)
  const lead = estr ? leadDiasDeLaPrimeraSemana(estr.contenido, await al.formatos()) : 1
  const diasHasta = Math.floor((Date.parse(`${campana.fecha_inicio}T00:00:00Z`) - Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
  if (diasHasta > lead + HOLGURA_DE_PRODUCCION_DIAS) return null
  return diasHasta < 0
    ? `la campaña ya empezó (${campana.fecha_inicio}) y la gran idea sigue sin aprobarse: cada día sin decisión es un día sin piezas`
    : `sin la gran idea aprobada la campaña perderá su primera semana: las piezas del ${campana.fecha_inicio} necesitan ${lead} día(s) de producción más ${HOLGURA_DE_PRODUCCION_DIAS} de holgura y faltan ${diasHasta} día(s)`
}

// ───────────────────────────────────────────────────────── LA HOJA DE PRODUCCIÓN por código (hoja.v1) · `POST /api/cadena/hojas {accion: 'escribir'}`
const ESTADOS_QUE_NO_VAN_A_LA_HOJA = new Set(['esquema', 'cancelada', 'espera_video', 'vencida_sin_brazo', 'perdio_su_fecha', 'descartada_sin_fuente'])
/** la hoja de un lote de filas (por `fila_ids` o por `semana`): brief creativo validado + gran idea aprobada + filas con su `idea_ref` → el texto que la oficina ya lee (`parsearBrief`). No llama a nadie ni gasta. */
export async function hojaEscribir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo, true)
  if (!c.ok) return c.r
  const { campana, ctx } = c.c
  const brief = await al.ultimoBriefCreativo(campana.id)
  if (!brief || brief.estado !== 'validada' || !brief.leido) return err(409, 'E-SIN-BRIEF', 'la hoja necesita el brief creativo validado')
  const mesa = await conceptoParaElCalendario(al, campana)
  if (!mesa.concepto) return err(409, 'E-SIN-CONCEPTO', 'la hoja necesita la gran idea aprobada')
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const todas = (await al.filas(campana.id, version)).filter((f) => !ESTADOS_QUE_NO_VAN_A_LA_HOJA.has(f.estado))
  const ids = Array.isArray(cuerpo.fila_ids) ? new Set(cuerpo.fila_ids.map(String)) : null
  const semana = Number.isInteger(cuerpo.semana) ? (cuerpo.semana as number) : null
  if (!ids && semana === null) return err(400, 'E-CAMPOS', 'la hoja se escribe por fila_ids (lista) o por semana (entero)')
  const filas = todas.filter((f) => (ids ? ids.has(f.id) : f.semana === semana))
  if (!filas.length) return err(409, 'E-SIN-FILAS', 'ninguna fila del calendario coincide (o todas están en un estado que no va a la hoja)')
  const manual = ctx.referencias.find((r) => r.origen === 'manual')
  const hoja = escribirHoja({
    client_name: ctx.nombreDelNegocio, plan_id: campana.plan_id, manual_id: manual?.id.replace(/^manual:/, '') ?? 'sin-manual', manual_version: cadena(cuerpo.manual_version) ?? 'vigente',
    hoy: ahora.slice(0, 10), lote_key: cadena(cuerpo.lote_key) ?? (ids ? `${campana.id.slice(0, 8)}:v${version}:ids` : `${campana.id.slice(0, 8)}:v${version}:s${semana}`),
    brief: brief.leido as unknown as BriefCreativoLeido, brief_id: idDeBrief(campana.id, brief.version), concepto: mesa.concepto, concepto_id: idDeConcepto(campana.id, mesa.version ?? 1),
    filas: filas.map((f) => ({ id: f.id, fecha: f.fecha, hora: f.hora, red: f.red, formato: f.formato, pilar: f.pilar, tema: f.tema, datos: f.datos, fase: f.fase ?? null, idea_ref: f.idea_ref ?? null })),
    formatos: await al.formatos(), seco: campana.seco,
  })
  return { status: 200, cuerpo: { hoja: hoja.texto_md, briefs: hoja.briefs, provenance: hoja.provenance, avisos: hoja.avisos, filas: filas.map((f) => f.id), brief_version: brief.version, concepto_version: mesa.version } }
}

// ───────────────────────────────────────────────────────── las entregas por HTTP (el flujo de la oficina también puede entregar por aquí) y el puerto en proceso
function leerEntrega(cuerpo: Record<string, unknown>): { ok: true; p: EntregaDeConcepto } | { ok: false; r: Respuesta } {
  const campana_id = cadena(cuerpo.campana_id)
  if (!campana_id) return { ok: false, r: err(400, 'E-CAMPOS', 'falta campana_id') }
  if (!Number.isInteger(cuerpo.version) || (cuerpo.version as number) < 1) return { ok: false, r: err(400, 'E-CAMPOS', 'version debe ser un entero positivo') }
  return { ok: true, p: { campana_id, version: cuerpo.version as number, encargo_id: cadena(cuerpo.encargo_id) ?? '', texto: texto(cuerpo.texto), costo_usd: typeof cuerpo.costo_usd === 'number' && cuerpo.costo_usd >= 0 ? cuerpo.costo_usd : 0, motivo: texto(cuerpo.motivo), brief_devuelto: texto(cuerpo.brief_devuelto) } }
}
export async function briefEntregar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const e = leerEntrega(cuerpo)
  if (!e.ok) return e.r
  const campana = await al.campana(e.p.campana_id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return noAut
  const r = await recibirBrief(al, e.p, ahora)
  return { status: r.ok ? 200 : 409, cuerpo: { ...r } }
}
export async function conceptoEntregar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const e = leerEntrega(cuerpo)
  if (!e.ok) return e.r
  const campana = await al.campana(e.p.campana_id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return noAut
  const r = await recibirConcepto(al, e.p, ahora)
  return { status: r.ok ? 200 : 409, cuerpo: { ...r } }
}

/** el puerto que la OFICINA recibe en su entorno (`Entorno.puertoDeLaCadena`, CC2): en proceso, sin HTTP; nunca lanza.
 *  El almacén puede venir como fábrica DIFERIDA (se crea en la primera entrega): armar el entorno de la oficina no debe abrir la base. */
export function puertoDeLaCadena(al: Almacen | (() => Almacen), reloj: () => string = () => new Date().toISOString()): { entregarBrief(p: EntregaDeBrief): Promise<EntregaALaCadena>; entregarConcepto(p: EntregaDeConcepto): Promise<EntregaALaCadena> } {
  let instancia: Almacen | null = typeof al === 'function' ? null : al
  const almacen = (): Almacen => (instancia ??= (al as () => Almacen)())
  const seguro = async (f: (a: Almacen) => Promise<EntregaALaCadena>): Promise<EntregaALaCadena> => { try { return await f(almacen()) } catch (e) { return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } } }
  return {
    entregarBrief: (p) => seguro((a) => recibirBrief(a, p, reloj())),
    entregarConcepto: (p) => seguro((a) => recibirConcepto(a, p, reloj())),
  }
}
