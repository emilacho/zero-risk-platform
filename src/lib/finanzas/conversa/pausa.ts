/**
 * LA PAUSA DE LA OFICINA FINANCIERA (Emilio, 04-nov 15:18Z: «si financiera necesita respuestas para poder enviar el informe al creador del plan, debe haber una pausa en el flujo hasta que yo conteste»).
 * Misma forma que la pausa del manual: NADA queda corriendo. El plan guarda aquí su pedido y el material ya pagado y termina; la respuesta del dueño lo suelta una sola vez y el plan vuelve con ese mismo pedido.
 * Emilio, 15:37Z: si ya revisó la ronda y no contestó alguna, el plan sigue; lo no contestado queda abierto en la oficina y el plan no lo menciona. «Ya revisó» = contestó algo y en la vuelta siguiente del vigía no hay nada nuevo (o contestó todo).
 *  · `pausarOficina`: guarda la espera, deja la corrida `en_pausa` y pregunta.
 *  · `atenderPausa`: la llama el vigía del buzón cada 10 min. Reintenta lo que no salió, recoge y, si ya no falta nada, suelta y despierta al plan.
 *  · La ronda 2 la conduce el mismo plan al volver: «abrir» con la misma corrida devuelve este encargo. No hay un segundo conductor.
 *  · Sin vencimiento y sin gasto mientras espera. Lo que no pueda salir avisa UNA vez en #alertas.
 */
import { cerrarLoContestado, prepararPreguntas, preguntarAlDueno, recogerRespuestas, temaDe, type PuertosDelBuzon } from './buzon'
import { ESPERANDO_AL_DUENO, preguntasQueFaltan, type Respuesta } from './orquestador'
import { sha256 } from './util'
import { EN_PAUSA } from '../../planeacion/corridas'

export interface EsperaDeFinanzas {
  id: string
  client_id: string
  encargo_id: string
  corrida: string | null
  estado: 'esperando' | 'soltada' | 'reemplazada'
  sobre: Record<string, unknown>
  despertado: boolean | null
  intentos_de_despertar: number
  /** cuándo se anotó el último intento de despertar */
  despertado_en: string | null
}

export interface PuertoDeEsperas {
  guardar(f: { client_id: string; encargo_id: string; sobre: Record<string, unknown>; material: Record<string, unknown>; workflow_id: string | null; workflow_execution_id: string | null }): Promise<{ ok: true; id: string; nueva: boolean } | { ok: false; error: string }>
  /** una lectura fallida LANZA: leer un error como «no hay espera» dejaría al plan sin volver */
  delEncargo(encargo_id: string): Promise<EsperaDeFinanzas | null>
  /** la espera viva de un cliente: hay una sola, porque otro plan reemplaza a la anterior */
  vivaDelCliente(client_id: string): Promise<EsperaDeFinanzas | null>
  /** de `esperando` a `soltada`: gana UNA llamada */
  soltar(id: string, ahora: Date): Promise<boolean>
  marcarDespertar(id: string, despertado: boolean, intentos: number, detalle: string): Promise<void>
  /** en qué quedó la corrida de esta espera y si el cliente tiene otra en marcha. Una lectura fallida LANZA: no es «no arrancó» */
  estadoDeLaCorrida(f: EsperaDeFinanzas): Promise<{ estado: string | null; otra_activa: boolean }>
  /** la corrida (`plan_corridas.id`) pasa de `corriendo` a `en_pausa` */
  pausarCorrida(corrida_id: string): Promise<void>
}

export type DespertarAlPlan = (cuerpo: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>
export interface PuertosDePausa extends PuertosDelBuzon { esperas: PuertoDeEsperas; despertar: DespertarAlPlan }

/** tras este número de fallos deja de insistir y avisa: un plan que no despierta lo arregla una persona */
export const MAX_INTENTOS_DE_DESPERTAR = 3
/** la puerta del plan contesta «recibido» antes de correr. Su pre-vuelo es el primer paso y saca la corrida de la pausa en segundos: pasado este margen, no arrancó */
export const MARGEN_PARA_ARRANCAR_MIN = 5
export const MAX_MATERIAL = 4_000_000
/** contestó parte desde Tu oficina: se le da este margen para seguir contestando antes de que el plan arranque */
export const SILENCIO_TRAS_RESPONDER_MIN = 15

const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textoDe = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** avisa una sola vez por motivo: la pausa puede pasar días y el vigía entra cada 10 minutos */
async function avisarUnaVez(P: PuertosDePausa, encargo_id: string, motivo: string, texto: string): Promise<void> {
  const arts = await P.almacen.artefactos(encargo_id).catch(() => ({} as Record<string, Record<string, unknown>>))
  const llave = sha256({ motivo })
  if ((arts.pausa_aviso as { llave?: string } | undefined)?.llave === llave) return
  const previa = Number((arts.pausa_aviso as { n?: unknown } | undefined)?.n ?? 0)
  const reg = { n: previa + 1, llave, motivo, en: P.ahora().toISOString() }
  await P.almacen.guardarBuzon?.({ encargo_id, artefacto: { tipo: 'pausa_aviso', version: previa + 1, contenido: reg, sha256: sha256(reg) } }).catch(() => undefined)
  await P.avisar?.(texto).catch(() => undefined)
}

const SALIO = new Set(['ya_enviado', 'respondidas_en_el_cerebro', 'registrada', 'ya_registrada'])
/** pregunta en modo pausa; si no pudo salir, lo dice en #alertas una vez y la pausa sigue: el vigía reintenta */
async function preguntarEnPausa(P: PuertosDePausa, encargo_id: string): Promise<Respuesta> {
  const r = await preguntarAlDueno(P, encargo_id, { pausa: true })
  const motivo = String(r.cuerpo.motivo ?? (r.status === 200 ? '' : `http_${r.status}`))
  if (r.cuerpo.enviado !== true && !SALIO.has(motivo)) await avisarUnaVez(P, encargo_id, motivo, `⚠️ Un plan está en pausa esperando respuestas del dueño y las preguntas no pudieron salir (${motivo || 'sin motivo'}, encargo ${encargo_id.slice(0, 8)}). Sigue en pausa y se reintenta cada 10 minutos.`)
  return r
}

/** `POST /api/finanzas/pausar` · `{ encargo_id, sobre, material, workflow_id, workflow_execution_id }` · idempotente: una segunda llamada encuentra la misma espera */
export async function pausarOficina(P: PuertosDePausa, c: Record<string, unknown>): Promise<Respuesta> {
  const encargo_id = textoDe(c.encargo_id)
  if (!encargo_id) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`encargo_id` es obligatorio'] } }
  if (!objeto(c.sobre) || !textoDe(c.sobre.corrida)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`sobre` es el pedido original del plan y lleva `corrida`'] } }
  if (!objeto(c.material)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`material` es el resultado de la junta de brazos'] } }
  // lo que cabe en una llamada a Vercel (4,5 MB): el material medido pesa ~100 mil caracteres
  if (JSON.stringify(c.material).length > MAX_MATERIAL) return { status: 413, cuerpo: { error: 'material_demasiado_grande', maximo: MAX_MATERIAL } }
  const e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  if (e.estado !== ESPERANDO_AL_DUENO) return { status: 409, cuerpo: { error: 'no_esta_en_pausa', estado: e.estado } }
  const g = await P.esperas.guardar({ client_id: e.client_id, encargo_id, sobre: c.sobre, material: c.material, workflow_id: textoDe(c.workflow_id), workflow_execution_id: textoDe(c.workflow_execution_id) })
  if (!g.ok) return { status: 502, cuerpo: { error: 'no_se_pudo_guardar', detalle: g.error } }
  const corrida_id = e.semilla?.corrida
  if (typeof corrida_id === 'string' && corrida_id) await P.esperas.pausarCorrida(corrida_id)
  const envio = await preguntarEnPausa(P, encargo_id)
  // el cerebro ya tenía todas las respuestas: no hay nada que esperar
  const atendida = await atenderPausa(P, encargo_id, { sinRecoger: true })
  return { status: 200, cuerpo: { pausado: true, espera_id: g.id, nueva: g.nueva, enviado: envio.cuerpo.enviado === true, ...(envio.cuerpo.motivo ? { motivo: envio.cuerpo.motivo } : {}), ...(Array.isArray(envio.cuerpo.claves) ? { claves: envio.cuerpo.claves } : {}), ...(atendida.cuerpo.soltada ? { soltada: true } : {}) } }
}

async function despertarAlPlan(P: PuertosDePausa, f: EsperaDeFinanzas): Promise<Respuesta> {
  const intentos = f.intentos_de_despertar + 1
  const r = await P.despertar({ ...f.sobre, reanudar_esperas_id: f.id }).catch((x) => ({ ok: false as const, error: x instanceof Error ? x.message : String(x) }))
  await P.esperas.marcarDespertar(f.id, r.ok, intentos, r.ok ? 'el plan recibió el pedido' : `fallo ${intentos}: ${r.error}`.slice(0, 300))
  if (!r.ok && intentos >= MAX_INTENTOS_DE_DESPERTAR) await avisarUnaVez(P, f.encargo_id, 'no_despierta', `🚨 El dueño ya contestó, pero el plan no pudo volver a arrancar tras ${intentos} intentos (encargo ${f.encargo_id.slice(0, 8)}). Último error: ${r.error}`.slice(0, 500))
  return { status: 200, cuerpo: { soltada: true, despertado: r.ok, intentos } }
}

/**
 * «Recibido» no es «arrancó» (05-nov · hallazgo de CC2): el plan pudo morir tras contestar 200. La corrida lo dice: si sigue en pausa pasado el margen, se le llama otra vez con el mismo tope.
 * Es seguro repetir: el pre-vuelo reanuda una sola vez. Con otra corrida en marcha no se insiste: el flujo ya avisó y esa corrida decide.
 */
async function revisarQueArranco(P: PuertosDePausa, f: EsperaDeFinanzas): Promise<Respuesta> {
  const base = { soltada: true, despertado: true }
  const desde = f.despertado_en ? Date.parse(f.despertado_en) : NaN
  if (!(P.ahora().getTime() - desde >= MARGEN_PARA_ARRANCAR_MIN * 60_000)) return { status: 200, cuerpo: base }
  let c: { estado: string | null; otra_activa: boolean }
  try { c = await P.esperas.estadoDeLaCorrida(f) } catch (x) {
    return { status: 200, cuerpo: { ...base, arranco: 'no_se_pudo_leer', detalle: x instanceof Error ? x.message : String(x) } }
  }
  if (c.estado !== EN_PAUSA) return { status: 200, cuerpo: base }
  if (c.otra_activa) return { status: 200, cuerpo: { ...base, arranco: false, motivo: 'otra_corrida_activa' } }
  if (f.intentos_de_despertar >= MAX_INTENTOS_DE_DESPERTAR) {
    await avisarUnaVez(P, f.encargo_id, 'no_arranco', `🚨 El dueño ya contestó y el plan recibió el pedido ${f.intentos_de_despertar} veces, pero no arrancó: la corrida sigue en pausa (encargo ${f.encargo_id.slice(0, 8)}). Hay que revisar el flujo del plan.`)
    return { status: 200, cuerpo: { ...base, arranco: false } }
  }
  return despertarAlPlan(P, f)
}

/** lo que hace el vigía por cada encargo. Sin espera de finanzas es el buzón de siempre */
export async function atenderPausa(P: PuertosDePausa, encargo_id: string, opc: { sinRecoger?: boolean } = {}): Promise<Respuesta> {
  const f = await P.esperas.delEncargo(encargo_id)
  if (!f) return opc.sinRecoger ? { status: 200, cuerpo: { pausa: false } } : recogerRespuestas(P, encargo_id)
  if (f.estado === 'reemplazada') return { status: 200, cuerpo: { pausa: false, motivo: 'reemplazada' } }
  // ya se soltó: lo único que puede faltar es que el plan reciba el pedido y arranque
  if (f.estado === 'soltada') {
    if (f.despertado === true) return revisarQueArranco(P, f)
    if (f.intentos_de_despertar >= MAX_INTENTOS_DE_DESPERTAR) return { status: 200, cuerpo: { soltada: true, despertado: false } }
    return despertarAlPlan(P, f)
  }
  let e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  if (e.estado !== ESPERANDO_AL_DUENO) return { status: 200, cuerpo: { pausa: false, estado: e.estado } }
  let recogido: Record<string, unknown> = {}
  if (!opc.sinRecoger) {
    if (!e.slack_ts) await preguntarEnPausa(P, encargo_id)
    else {
      recogido = (await recogerRespuestas(P, encargo_id)).cuerpo
      await pedirElNumero(P, e.id, e.slack_canal, e.slack_ts, recogido)
    }
    e = (await P.almacen.leerEncargo(encargo_id)) ?? e
  }
  const arts = await P.almacen.artefactos(encargo_id)
  const faltan = preguntasQueFaltan(arts, e.semilla)
  // contestó todo, o contestó algo y ya no escribe más: sigue. Sin ninguna respuesta, o si aún está escribiendo, espera
  // sin Slack, lo que el cerebro ya sabía antes de la pausa no cuenta como «ya revisó la ronda»: soltaría el plan sin que el dueño haya visto la pregunta
  const contesto = P.modo === 'registra' ? typeof e.semilla?.ultima_respuesta_en === 'string' : Array.isArray(e.semilla?.respuestas_del_dueno) && e.semilla.respuestas_del_dueno.length > 0
  const siguioEscribiendo = Array.isArray(recogido.aplicadas) && recogido.aplicadas.length > 0
  const ultima = e.semilla?.ultima_respuesta_en
  const reciente = typeof ultima === 'string' && P.ahora().getTime() - Date.parse(ultima) < SILENCIO_TRAS_RESPONDER_MIN * 60_000
  if (faltan.length && (!contesto || siguioEscribiendo || reciente)) return { status: 200, cuerpo: { esperando: true, faltan, ...recogido } }
  if (!(await P.esperas.soltar(f.id, P.ahora()))) return { status: 200, cuerpo: { soltada: false, motivo: 'otra_llamada_la_solto' } }
  await P.almacen.guardarBuzon?.({ encargo_id, semilla: { ...e.semilla, pausa_atendida: true } })
  await P.almacen.guardar({ encargo_id, estado_del_motor: e.estado_del_motor, gasto_usd: e.gasto_usd, estado: 'en_curso' })
  return despertarAlPlan(P, { ...f, estado: 'soltada' })
}

/**
 * `POST /api/finanzas/responder` · `{ client_id, tema, respuesta, quien }`: Emilio contesta en Tu oficina. `tema` es el de la pregunta en `cerebro_dueno_preguntas` (el `subtipo` de la decisión).
 * Si no hay pausa, o la pregunta no es de ella, no toca nada y lo dice: quien llama la guarda por su camino de siempre. Si contestó todo, el plan sigue en el acto.
 */
export async function responderEnLaOficina(P: PuertosDePausa, c: Record<string, unknown>): Promise<Respuesta> {
  const client_id = textoDe(c.client_id), tema = textoDe(c.tema), respuesta = textoDe(c.respuesta), quien = textoDe(c.quien)
  const errores = [!client_id && '`client_id`', !tema && '`tema`', !respuesta && '`respuesta`', !quien && '`quien`'].filter(Boolean)
  if (errores.length) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: errores.map((x) => `${x} es obligatorio`) } }
  const f = await P.esperas.vivaDelCliente(client_id as string)
  if (!f) return { status: 200, cuerpo: { en_pausa: false } }
  const e = await P.almacen.leerEncargo(f.encargo_id)
  if (!e || e.estado !== ESPERANDO_AL_DUENO) return { status: 200, cuerpo: { en_pausa: false } }
  const arts = await P.almacen.artefactos(e.id)
  const clave = prepararPreguntas(arts, e.semilla, { pausa: true }).aprobadas.map((q) => q.clave).find((k) => temaDe(k) === temaDe(tema as string))
  if (!clave) return { status: 200, cuerpo: { en_pausa: true, es_de_la_pausa: false } }
  const hora = P.ahora().toISOString()
  const previas = Array.isArray(e.semilla?.respuestas_del_dueno) ? e.semilla.respuestas_del_dueno : []
  const nueva = { clave, valor: respuesta as string, literal: respuesta as string }
  const semilla = { ...e.semilla, respuestas_del_dueno: [...previas.filter((x) => x.clave !== clave), nueva], ultima_respuesta_en: hora }
  await P.almacen.guardarBuzon?.({ encargo_id: e.id, semilla })
  // si el cerebro falla, la respuesta ya sirve para este plan: se dice, y la decisión seguiría viva en la bandeja
  const registro = (arts.buzon_respuestas as { preguntas?: Array<{ clave?: string; texto?: string; pregunta_id?: string | null }> } | undefined)?.preguntas?.find((x) => x.clave === clave)
  const texto = prepararPreguntas(arts, e.semilla, { pausa: true }).aprobadas.find((q) => q.clave === clave)?.texto ?? (tema as string)
  const guardada = await P.cerebro.registrarRespuesta({ client_id: e.client_id, tema: temaDe(clave), pregunta: registro?.texto ?? texto, respuesta: respuesta as string, mensaje_ref: `tu-oficina:${quien}:${hora}`, respondido_en: hora, pregunta_id: registro?.pregunta_id ?? null }).catch(() => ({ ok: false as const, error: 'red' }))
  const cerrada = guardada.ok ? await cerrarLoContestado(P, e.client_id, temaDe(clave)) : false
  const a = await atenderPausa(P, e.id, { sinRecoger: true })
  return { status: 200, cuerpo: { en_pausa: true, es_de_la_pausa: true, aplicada: true, clave, en_el_cerebro: guardada.ok, tema_cerrado: cerrada, ...(guardada.ok ? {} : { aviso: 'el cerebro no recibió la respuesta: el plan sí la usa' }), faltan: Array.isArray(a.cuerpo.faltan) ? a.cuerpo.faltan : [], ...(a.cuerpo.soltada ? { soltada: true } : {}) } }
}

/** con varias preguntas abiertas, un texto sin número no se adivina; pero en una pausa, callarse dejaría al dueño creyendo que ya contestó */
async function pedirElNumero(P: PuertosDePausa, encargo_id: string, canal: string | null, ts: string, recogido: Record<string, unknown>): Promise<void> {
  if (!canal || !Array.isArray(recogido.aclaracion_necesaria) || !P.slack.enHilo) return
  const arts = await P.almacen.artefactos(encargo_id).catch(() => ({} as Record<string, Record<string, unknown>>))
  const notas = (arts.buzon_respuestas as { notas?: unknown[] } | undefined)?.notas?.length ?? 0
  const previo = arts.pausa_aclaracion as { notas?: number; n?: number } | undefined
  if ((previo?.notas ?? 0) >= notas) return
  const envio = await P.slack.enHilo(canal, ts, 'Recibí tu mensaje, pero no sé a cuál pregunta responde. Escríbelo con su número, por ejemplo «1: 200». El plan sigue en pausa hasta entonces.').catch(() => ({ ok: false as const }))
  if (!envio.ok) return
  const reg = { n: (previo?.n ?? 0) + 1, notas, en: P.ahora().toISOString() }
  await P.almacen.guardarBuzon?.({ encargo_id, artefacto: { tipo: 'pausa_aclaracion', version: reg.n, contenido: reg, sha256: sha256(reg) } }).catch(() => undefined)
}
