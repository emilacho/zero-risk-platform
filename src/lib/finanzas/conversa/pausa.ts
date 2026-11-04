/**
 * LA PAUSA DE LA OFICINA FINANCIERA (Emilio, 04-nov 15:18Z: «si financiera necesita respuestas para poder enviar el informe al creador del plan, debe haber una pausa en el flujo hasta que yo conteste»).
 * Misma forma que la pausa del manual: NADA queda corriendo. El plan guarda aquí su pedido y el material ya pagado y termina; la respuesta del dueño lo suelta una sola vez y el plan vuelve con ese mismo pedido.
 *  · `pausarOficina`: guarda la espera, deja la corrida `en_pausa` y pregunta.
 *  · `atenderPausa`: la llama el vigía del buzón cada 10 min. Reintenta lo que no salió, recoge y, si ya no falta nada, suelta y despierta al plan.
 *  · La ronda 2 la conduce el mismo plan al volver: «abrir» con la misma corrida devuelve este encargo. No hay un segundo conductor.
 *  · Sin vencimiento y sin gasto mientras espera. Lo que no pueda salir avisa UNA vez en #alertas.
 */
import { preguntarAlDueno, recogerRespuestas, type PuertosDelBuzon } from './buzon'
import { ESPERANDO_AL_DUENO, preguntasQueFaltan, type Respuesta } from './orquestador'
import { sha256 } from './util'

export interface EsperaDeFinanzas {
  id: string
  client_id: string
  encargo_id: string
  corrida: string | null
  estado: 'esperando' | 'soltada' | 'reemplazada'
  cuerpo: Record<string, unknown>
  material: unknown
  despertado: boolean | null
  intentos_de_despertar: number
}

export interface PuertoDeEsperas {
  guardar(f: { client_id: string; encargo_id: string; cuerpo: Record<string, unknown>; material: unknown; workflow_id: string | null; workflow_execution_id: string | null }): Promise<{ ok: true; id: string; nueva: boolean } | { ok: false; error: string }>
  /** una lectura fallida LANZA: leer un error como «no hay espera» dejaría al plan sin volver */
  delEncargo(encargo_id: string): Promise<EsperaDeFinanzas | null>
  porId(id: string): Promise<EsperaDeFinanzas | null>
  /** de `esperando` a `soltada`: gana UNA llamada */
  soltar(id: string, ahora: Date): Promise<boolean>
  marcarDespertar(id: string, despertado: boolean, intentos: number, detalle: string): Promise<void>
  /** la corrida (`plan_corridas.id`) pasa de `corriendo` a `en_pausa` */
  pausarCorrida(corrida_id: string): Promise<void>
}

export type DespertarAlPlan = (cuerpo: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>
export interface PuertosDePausa extends PuertosDelBuzon { esperas: PuertoDeEsperas; despertar: DespertarAlPlan }

/** tras este número de fallos deja de insistir y avisa: un plan que no despierta lo arregla una persona */
export const MAX_INTENTOS_DE_DESPERTAR = 3

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

const SALIO = new Set(['ya_enviado', 'respondidas_en_el_cerebro'])
/** pregunta en modo pausa; si no pudo salir, lo dice en #alertas una vez y la pausa sigue: el vigía reintenta */
async function preguntarEnPausa(P: PuertosDePausa, encargo_id: string): Promise<Respuesta> {
  const r = await preguntarAlDueno(P, encargo_id, { pausa: true })
  const motivo = String(r.cuerpo.motivo ?? (r.status === 200 ? '' : `http_${r.status}`))
  if (r.cuerpo.enviado !== true && !SALIO.has(motivo)) await avisarUnaVez(P, encargo_id, motivo, `⚠️ Un plan está en pausa esperando respuestas del dueño y las preguntas no pudieron salir (${motivo || 'sin motivo'}, encargo ${encargo_id.slice(0, 8)}). Sigue en pausa y se reintenta cada 10 minutos.`)
  return r
}

/** `{ accion: 'pausar', encargo_id, cuerpo, material, workflow_id, workflow_execution_id }` · idempotente: una segunda llamada encuentra la misma espera */
export async function pausarOficina(P: PuertosDePausa, c: Record<string, unknown>): Promise<Respuesta> {
  const encargo_id = textoDe(c.encargo_id)
  if (!encargo_id) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`encargo_id` es obligatorio'] } }
  if (!objeto(c.cuerpo) || !textoDe(c.cuerpo.corrida)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`cuerpo` es el pedido original del plan y lleva `corrida`'] } }
  if (!objeto(c.material)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`material` es el resultado de la junta de brazos'] } }
  const e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  if (e.estado !== ESPERANDO_AL_DUENO) return { status: 409, cuerpo: { error: 'no_esta_en_pausa', estado: e.estado } }
  const g = await P.esperas.guardar({ client_id: e.client_id, encargo_id, cuerpo: c.cuerpo, material: c.material, workflow_id: textoDe(c.workflow_id), workflow_execution_id: textoDe(c.workflow_execution_id) })
  if (!g.ok) return { status: 502, cuerpo: { error: 'no_se_pudo_guardar', detalle: g.error } }
  const corrida_id = e.semilla?.corrida
  if (typeof corrida_id === 'string' && corrida_id) await P.esperas.pausarCorrida(corrida_id)
  const envio = await preguntarEnPausa(P, encargo_id)
  // el cerebro ya tenía todas las respuestas: no hay nada que esperar
  const atendida = await atenderPausa(P, encargo_id, { sinRecoger: true })
  return { status: 200, cuerpo: { pausado: true, espera_id: g.id, nueva: g.nueva, enviado: envio.cuerpo.enviado === true, ...(envio.cuerpo.motivo ? { motivo: envio.cuerpo.motivo } : {}), ...(Array.isArray(envio.cuerpo.claves) ? { claves: envio.cuerpo.claves } : {}), ...(atendida.cuerpo.soltada ? { soltada: true } : {}) } }
}

/** `{ accion: 'material', espera_id }`: lo que el plan guardó al pausar, para seguir sin volver a pagarlo */
export async function materialDeLaEspera(P: Pick<PuertosDePausa, 'esperas'>, espera_id: unknown): Promise<Respuesta> {
  const id = textoDe(espera_id)
  if (!id) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`espera_id` es obligatorio'] } }
  const f = await P.esperas.porId(id)
  return f ? { status: 200, cuerpo: { espera_id: f.id, estado: f.estado, material: f.material } } : { status: 404, cuerpo: { error: 'espera_inexistente' } }
}

async function despertarAlPlan(P: PuertosDePausa, f: EsperaDeFinanzas): Promise<Respuesta> {
  const intentos = f.intentos_de_despertar + 1
  const r = await P.despertar({ ...f.cuerpo, reanudar_esperas_id: f.id }).catch((x) => ({ ok: false as const, error: x instanceof Error ? x.message : String(x) }))
  await P.esperas.marcarDespertar(f.id, r.ok, intentos, r.ok ? 'el plan recibió el pedido' : `fallo ${intentos}: ${r.error}`.slice(0, 300))
  if (!r.ok && intentos >= MAX_INTENTOS_DE_DESPERTAR) await avisarUnaVez(P, f.encargo_id, 'no_despierta', `🚨 El dueño ya contestó, pero el plan no pudo volver a arrancar tras ${intentos} intentos (encargo ${f.encargo_id.slice(0, 8)}). Último error: ${r.error}`.slice(0, 500))
  return { status: 200, cuerpo: { soltada: true, despertado: r.ok, intentos } }
}

/** lo que hace el vigía por cada encargo. Sin espera de finanzas es el buzón de siempre */
export async function atenderPausa(P: PuertosDePausa, encargo_id: string, opc: { sinRecoger?: boolean } = {}): Promise<Respuesta> {
  const f = await P.esperas.delEncargo(encargo_id)
  if (!f) return opc.sinRecoger ? { status: 200, cuerpo: { pausa: false } } : recogerRespuestas(P, encargo_id)
  if (f.estado === 'reemplazada') return { status: 200, cuerpo: { pausa: false, motivo: 'reemplazada' } }
  // ya se soltó: lo único que puede faltar es que el plan reciba el pedido
  if (f.estado === 'soltada') {
    if (f.despertado === true || f.intentos_de_despertar >= MAX_INTENTOS_DE_DESPERTAR) return { status: 200, cuerpo: { soltada: true, despertado: f.despertado === true } }
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
  if (faltan.length) return { status: 200, cuerpo: { esperando: true, faltan, ...recogido } }
  if (!(await P.esperas.soltar(f.id, P.ahora()))) return { status: 200, cuerpo: { soltada: false, motivo: 'otra_llamada_la_solto' } }
  await P.almacen.guardar({ encargo_id, estado_del_motor: e.estado_del_motor, gasto_usd: e.gasto_usd, estado: 'en_curso' })
  return despertarAlPlan(P, { ...f, estado: 'soltada' })
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
