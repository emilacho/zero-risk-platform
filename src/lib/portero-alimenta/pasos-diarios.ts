/**
 * PASOS DIARIOS (01-nov · encargo «fallas pendientes y retención», punto 1a).
 * Ninguna corrida larga depende de UNA sola llamada: cada paso (cuentas y comentarios · tendencias · bodega · transcripción) es su propia llamada con su propio plazo
 * y su propio renglón en `cerebro_pasos_diarios`. El renglón dice «en curso» al empezar y «hecha» SOLO cuando el paso terminó de verdad. Una llamada cortada deja el renglón
 * «en curso»: pasado el plazo se retoma (nunca dos a la vez) y tras 3 intentos queda «abandonada» (no hay reintento infinito).
 */
export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>

export const PASOS = ['cuentas_y_comentarios', 'tendencias', 'bodega', 'transcripcion'] as const
export type Paso = (typeof PASOS)[number]
export const esPaso = (v: unknown): v is Paso => typeof v === 'string' && (PASOS as readonly string[]).includes(v)

/** una llamada vive como máximo 300 s: pasado esto, un «en curso» es una llamada cortada */
export const PLAZO_DE_UN_PASO_MS = 6 * 60_000
export const MAX_INTENTOS_DE_UN_PASO = 3
/** pasos que cada cliente tiene al día, en este orden */
export const PASOS_DEL_DIA_DE_UN_CLIENTE: readonly Paso[] = PASOS

export type Reclamo =
  | { ok: true; id: string; intento: number }
  | { ok: false; motivo: 'ya_hecha' | 'en_curso' | 'abandonada' | 'error'; detalle?: string }

const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esDuplicado = (m: string | undefined) => !!m && /duplicate key|23505|unique/i.test(m)

/** pone el paso «en curso». Atómico: el insert choca con la clave única si otro ya lo tomó; retomar un atascado es un update condicionado a que siga atascado. */
/** lo que se sabe de un paso al abandonarse: de ahí sale el aviso a #alertas */
export interface PasoAbandonado { clientId: string; dia: string; paso: Paso; intentos: number; iniciadoEn: string | null; ultimoError: string | null; ejecucionId: string | null }

export async function reclamarPaso(db: Db, a: { clientId: string; dia: string; paso: Paso; ahora: Date; workflowId?: string; ejecucionId?: string; /** se llama UNA vez, solo por quien de verdad lo pasó a «abandonada» */ alAbandonar?: (p: PasoAbandonado) => Promise<unknown> }): Promise<Reclamo> {
  const ins = await db.from('cerebro_pasos_diarios').insert({ client_id: a.clientId, dia: a.dia, paso: a.paso, estado: 'en_curso', intentos: 1, iniciado_en: a.ahora.toISOString(), workflow_id: a.workflowId ?? null, workflow_execution_id: a.ejecucionId ?? null }).select('id')
  if (!ins.error) return { ok: true, id: String(lista(ins.data)[0]?.id ?? ''), intento: 1 }
  if (!esDuplicado(ins.error.message)) return { ok: false, motivo: 'error', detalle: String(ins.error.message).slice(0, 160) }
  const ex = await db.from('cerebro_pasos_diarios').select('id, estado, intentos, iniciado_en, resumen, workflow_execution_id').eq('client_id', a.clientId).eq('dia', a.dia).eq('paso', a.paso).limit(1)
  if (ex.error) return { ok: false, motivo: 'error', detalle: String(ex.error.message).slice(0, 160) }
  const f = lista(ex.data)[0]
  if (!f) return { ok: false, motivo: 'error', detalle: 'el renglón del paso existe y no se pudo leer' }
  if (f.estado === 'hecha' || f.estado === 'con_errores') return { ok: false, motivo: 'ya_hecha' }
  if (f.estado === 'abandonada') return { ok: false, motivo: 'abandonada' }
  const desde = Date.parse(String(f.iniciado_en))
  if (Number.isFinite(desde) && a.ahora.getTime() - desde < PLAZO_DE_UN_PASO_MS) return { ok: false, motivo: 'en_curso' }
  const intentos = Number(f.intentos) || 1
  if (intentos >= MAX_INTENTOS_DE_UN_PASO) {
    const ab = await db.from('cerebro_pasos_diarios').update({ estado: 'abandonada', terminado_en: a.ahora.toISOString() }).eq('id', String(f.id)).eq('estado', 'en_curso').select('id')
    // el aviso lo da SOLO quien logró el cambio (si dos llegan a la vez, una sola ve la fila): un incidente, un aviso
    if (!ab.error && lista(ab.data).length && a.alAbandonar) {
      const errs = f.resumen && typeof f.resumen === 'object' && Array.isArray((f.resumen as Fila).errores) ? ((f.resumen as Fila).errores as unknown[]).map(String) : []
      await a.alAbandonar({ clientId: a.clientId, dia: a.dia, paso: a.paso, intentos, iniciadoEn: typeof f.iniciado_en === 'string' ? f.iniciado_en : null, ultimoError: errs.length ? errs[errs.length - 1] : null, ejecucionId: typeof f.workflow_execution_id === 'string' ? f.workflow_execution_id : null }).catch(() => undefined)
    }
    return { ok: false, motivo: 'abandonada' }
  }
  // retomar: solo gana quien encuentra el renglón todavía atascado con el mismo intento
  const up = await db.from('cerebro_pasos_diarios').update({ intentos: intentos + 1, iniciado_en: a.ahora.toISOString(), workflow_id: a.workflowId ?? null, workflow_execution_id: a.ejecucionId ?? null }).eq('id', String(f.id)).eq('estado', 'en_curso').eq('intentos', intentos).select('id')
  if (up.error) return { ok: false, motivo: 'error', detalle: String(up.error.message).slice(0, 160) }
  if (!lista(up.data).length) return { ok: false, motivo: 'en_curso' }
  return { ok: true, id: String(f.id), intento: intentos + 1 }
}

/** «hecha» (o «con errores» si el paso declaró fallas) SOLO al terminar */
export async function cerrarPaso(db: Db, a: { id: string; ahora: Date; errores: string[]; resumen: Record<string, unknown>; gastoUsd: number }): Promise<{ ok: boolean; detalle?: string }> {
  const r = await db.from('cerebro_pasos_diarios').update({ estado: a.errores.length ? 'con_errores' : 'hecha', terminado_en: a.ahora.toISOString(), resumen: { ...a.resumen, errores: a.errores }, gasto_usd: Math.round(a.gastoUsd * 1e6) / 1e6 }).eq('id', a.id)
  return r.error ? { ok: false, detalle: String(r.error.message).slice(0, 160) } : { ok: true }
}

/** el siguiente paso pendiente de hoy (en orden de clientes y de pasos); lo que ya está hecho, abandonado o en curso reciente se salta */
export async function siguientePaso(db: Db, a: { clientes: string[]; dia: string; ahora: Date }): Promise<{ ok: true; siguiente: { clientId: string; paso: Paso } | null; pendientes: number } | { ok: false; detalle: string }> {
  const r = await db.from('cerebro_pasos_diarios').select('client_id, paso, estado, intentos, iniciado_en').eq('dia', a.dia)
  if (r.error) return { ok: false, detalle: String(r.error.message).slice(0, 160) }
  const hoy = new Map(lista(r.data).map((f) => [`${f.client_id}|${f.paso}`, f]))
  const pendientes: Array<{ clientId: string; paso: Paso }> = []
  for (const clientId of a.clientes) {
    for (const paso of PASOS_DEL_DIA_DE_UN_CLIENTE) {
      const f = hoy.get(`${clientId}|${paso}`)
      if (!f) { pendientes.push({ clientId, paso }); continue }
      if (f.estado === 'hecha' || f.estado === 'con_errores' || f.estado === 'abandonada') continue
      const desde = Date.parse(String(f.iniciado_en))
      if (!Number.isFinite(desde) || a.ahora.getTime() - desde >= PLAZO_DE_UN_PASO_MS) pendientes.push({ clientId, paso })
    }
  }
  return { ok: true, siguiente: pendientes[0] ?? null, pendientes: pendientes.length }
}

/** el texto del aviso a #alertas: quién, qué paso, qué día, el último error y cómo reintentar (una línea de contexto + una de acción) */
export function textoDelAvisoDePasoAbandonado(p: PasoAbandonado): string {
  const error = p.ultimoError ? p.ultimoError.slice(0, 200) : 'la llamada se cortó antes de cerrar el paso (no dejó error)'
  return `⚠️ Paso abandonado tras ${p.intentos} intentos · cliente ${p.clientId} · paso ${p.paso} · día ${p.dia}. Último error: ${error}. Para reintentar: POST /api/brain/alimentar/redes {"client_id":"${p.clientId}","paso":"${p.paso}","dry_run":false,"reintentar":true,"workflow_id":"…","workflow_execution_id":"…"}.`
}

/** reabre un paso ABANDONADO de hoy para que la siguiente llamada lo corra (intentos desde 1); no toca uno hecho ni uno en curso */
export async function reabrirPaso(db: Db, a: { clientId: string; dia: string; paso: Paso }): Promise<{ ok: boolean; reabierto: boolean; detalle?: string }> {
  const r = await db.from('cerebro_pasos_diarios').update({ estado: 'en_curso', intentos: 1, iniciado_en: '1970-01-01T00:00:00Z', terminado_en: null }).eq('client_id', a.clientId).eq('dia', a.dia).eq('paso', a.paso).eq('estado', 'abandonada').select('id')
  if (r.error) return { ok: false, reabierto: false, detalle: String(r.error.message).slice(0, 160) }
  return { ok: true, reabierto: lista(r.data).length > 0 }
}
