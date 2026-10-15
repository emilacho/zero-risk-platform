/**
 * LA SEÑAL «CEREBRO LISTO» (15-oct · prerrequisito del plan v3). UNA lectura por `client_id`: `{ listo, motivo, desde, origen, ... }`. Solo LEE; US$ 0 (ni Apify ni modelo).
 * `listo` = la última corrida del portero (el DESPERTAR del alta o la corrida DIARIA) quedó `hecha`, es RECIENTE (≤ 36 h), el vigilante no dejó un problema en ella, el alta/la corrida
 * dejó algo (≥ 1 unidad) y el puente al índice está al día (`quedan = 0`). Sirve igual para clientes que ya estaban dados de alta: no depende de que haya habido un despertar.
 * Una falla de lectura se DICE (502): nunca se lee como «no está listo» en silencio ni como «listo».
 */
import { reconciliarYEnviar, type DepsDeRutas, type Respuesta } from './rutas'

export const FRESCURA_DEL_LISTO_HORAS = 36
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface SenalDeListo {
  client_id: string
  listo: boolean
  /** por qué sí o por qué no, en una línea */
  motivo: string
  /** desde cuándo está listo (la hora de la corrida que lo dejó listo); null si no lo está */
  desde: string | null
  origen: 'despertar' | 'corrida_diaria' | null
  /** la corrida que se miró (la más nueva), esté bien o no */
  ultima_corrida: { dia: string; estado: string; tipo: 'despertar' | 'corrida_diaria'; hace_horas: number | null } | null
  puente_quedan: number | null
  /** el tope de frescura usado */
  frescura_horas: number
}

export async function rutaListo(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const clientId = esObjeto(cuerpo) && typeof cuerpo.client_id === 'string' ? cuerpo.client_id.trim() : ''
  if (!UUID.test(clientId)) return { status: 400, body: { error: 'entrada_invalida', detalle: '`client_id` debe ser un uuid' } }
  const ahora = deps.ahora ?? new Date()
  const base = (extra: Partial<SenalDeListo>): SenalDeListo => ({ client_id: clientId, listo: false, motivo: '', desde: null, origen: null, ultima_corrida: null, puente_quedan: null, frescura_horas: FRESCURA_DEL_LISTO_HORAS, ...extra })

  const cl = await deps.db.from('clients').select('id').eq('id', clientId).limit(1)
  if (cl.error) return { status: 502, body: { error: 'lectura_fallida', detalle: `clients: ${cl.error.message}` } }
  if (!lista(cl.data).length) return { status: 404, body: { error: 'cliente_inexistente', detalle: 'no existe la ficha del cliente' } }

  const q = await deps.db.from('cerebro_portero_corridas').select('id, dia, estado, resumen, creado_en').eq('client_id', clientId).order('dia', { ascending: false }).limit(10)
  if (q.error) return { status: 502, body: { error: 'lectura_fallida', detalle: `cerebro_portero_corridas: ${q.error.message}` } }
  const filas = lista(q.data).sort((a, b) => (String(a.dia) < String(b.dia) ? 1 : String(a.dia) > String(b.dia) ? -1 : String(a.creado_en) < String(b.creado_en) ? 1 : -1))
  const ultima = filas[0]
  if (!ultima) return { status: 200, body: base({ motivo: 'el portero todavía no ha corrido para este cliente' }) as unknown as Record<string, unknown> }

  const resumen = esObjeto(ultima.resumen) ? ultima.resumen : {}
  const vig = esObjeto(resumen.vigilante) ? resumen.vigilante : {}
  const tipo: 'despertar' | 'corrida_diaria' = resumen.tipo === 'despertar' ? 'despertar' : 'corrida_diaria'
  const marca = typeof vig.revisado_en === 'string' ? vig.revisado_en : typeof ultima.creado_en === 'string' ? ultima.creado_en : `${String(ultima.dia).slice(0, 10)}T00:00:00Z`
  const t = Date.parse(marca)
  const haceHoras = Number.isFinite(t) ? Math.round(((ahora.getTime() - t) / 3_600_000) * 10) / 10 : null
  const corrida = { dia: String(ultima.dia).slice(0, 10), estado: String(ultima.estado), tipo, hace_horas: haceHoras }
  const no = (motivo: string, extra: Partial<SenalDeListo> = {}) => ({ status: 200, body: base({ motivo, ultima_corrida: corrida, ...extra }) as unknown as Record<string, unknown> })

  if (ultima.estado !== 'hecha') return no(`la última corrida quedó «${String(ultima.estado)}»`)
  if (haceHoras === null || haceHoras > FRESCURA_DEL_LISTO_HORAS) return no(haceHoras === null ? 'la última corrida no tiene hora legible' : `la última corrida hecha es de hace ${haceHoras} h (más de ${FRESCURA_DEL_LISTO_HORAS} h)`)
  if (vig.ok === false) return no('el vigilante dejó un problema en la última corrida')
  if (typeof resumen.unidades === 'number' && resumen.unidades === 0) return no('la última corrida no encontró nada que archivar (el cliente aún no trae raspado)')

  const p = await reconciliarYEnviar(deps, clientId, true)
  if (p.errores.length || p.puente.lectura_fallida === true) return { status: 502, body: { error: 'lectura_fallida', detalle: p.errores[0] ?? 'puente: lectura fallida' } }
  const quedan = typeof p.puente.quedan === 'number' ? p.puente.quedan : null
  if (quedan === null || quedan > 0) return no(quedan === null ? 'no se pudo medir el puente al índice' : `el puente al índice tiene ${quedan} trozo(s) por escribir o sacar`, { puente_quedan: quedan })

  return {
    status: 200,
    body: base({
      listo: true, desde: new Date(t).toISOString(), origen: tipo, ultima_corrida: corrida, puente_quedan: 0,
      motivo: tipo === 'despertar' ? 'despertar del alta terminado y puente al índice al día' : `corrida diaria hecha hace ${haceHoras} h y puente al índice al día`,
    }) as unknown as Record<string, unknown>,
  }
}
