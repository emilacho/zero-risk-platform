/**
 * LA SEÑAL «CEREBRO LISTO» (15-oct · prerrequisito del plan v3). UNA lectura por `client_id`: `{ listo, motivo, desde, origen, ... }`. Solo LEE; US$ 0 (ni Apify ni modelo).
 * `listo` = la última corrida del portero (el DESPERTAR del alta o la corrida DIARIA) quedó `hecha`, es RECIENTE (≤ 36 h), el vigilante no dejó un problema en ella, el alta/la corrida
 * dejó algo (≥ 1 unidad) y el puente al índice está al día (`quedan = 0`). Sirve igual para clientes que ya estaban dados de alta: no depende de que haya habido un despertar.
 * Una falla de lectura se DICE (502): nunca se lee como «no está listo» en silencio ni como «listo».
 * Despertar completo (15-oct): tras el despertar, el cerebro NO está listo hasta que la cadena que pide lo que el alta no trajo termine (esa cadena reemplaza la fila del despertar). Si no termina
 * en `ESPERA_MAXIMA_DEL_DESPERTAR_MIN`, se da por listo CON HUECOS declarados (lo que se debía pedir y no llegó): no bloquea para siempre. Una fuente que falló también sale en `huecos`.
 */
import { rutaLeerPedido } from './pedidos'
import { cerrarPausasDeAlta } from './pausa-de-alta'
import { reconciliarYEnviar, type DepsDeRutas, type Respuesta } from './rutas'
import { corridasCadaDiasDelEntorno, pausaDelRaspadoDelEntorno, raspadoEnPausa } from './modo'
import { motivoDeLaPausa } from './pausa-del-raspado'

export const FRESCURA_DEL_LISTO_HORAS = 36
/**
 * La frescura sigue el RITMO REAL del portero (09-nov · hallazgo del estado consolidado): con `PORTERO_CORRIDAS_CADA_DIAS` = N vigente, una corrida cada N días es lo normal,
 * así que el tope es 12 h de holgura + 24 h × N (N=1 → 36 h, N=2 → 60 h). Sin la ventana de 12 h en «no listo» cada dos días. Fuera de esa vigencia, 36 h.
 */
export function frescuraDelListoHoras(ahora: Date, env: Record<string, string | undefined> = process.env): number {
  const c = corridasCadaDiasDelEntorno(env)
  if (!c.activo || c.hasta === null || ahora.getTime() >= Date.parse(`${c.hasta}T00:00:00Z`)) return FRESCURA_DEL_LISTO_HORAS
  return 12 + 24 * c.cada
}
/** cuánto se espera a que la cadena del despertar pida lo que falta (el plan v3 espera la señal hasta ~30 min; esto da 15 min de margen sobre el tope de la cadena) */
export const ESPERA_MAXIMA_DEL_DESPERTAR_MIN = 45
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
  /** el tope de frescura usado (null = en la pausa del raspado la edad de la corrida no cuenta) */
  frescura_horas: number | null
  /** la pausa del raspado programado, si está vigente: hasta cuándo y el último raspado real del cliente */
  raspado_en_pausa?: { hasta: string; ultimo_raspado: string | null }
  /** true mientras el despertar espera la cadena que pide lo que el alta no trajo */
  completando: boolean
  /** lo que se debía pedir y no llegó (fuente que falló o cadena que no terminó): el cerebro queda listo igual, con esto declarado */
  huecos: Array<{ fuente: string; funcion: string; objetivo: string }>
  /** si la alta terminó y cerró pausas «hasta la alta» de este cliente (o no pudo) */
  pausa_de_alta?: { cerradas: number; error?: string }
}

/**
 * La señal de listo + (si viene `pedido_id`) el resultado de ese pedido libre al portero (16-oct): quién pidió, huecos, estado, costo, fichas y lo que no se pudo llenar.
 * El pedido se lee aparte: un pedido inexistente se DICE (`pedido: { error }`) y nunca cambia la señal de listo.
 */
export async function rutaListo(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const r = await rutaListoBase(deps, cuerpo)
  const pid = esObjeto(cuerpo) && typeof cuerpo.pedido_id === 'string' ? cuerpo.pedido_id.trim() : ''
  if (!pid) return r
  const p = await rutaLeerPedido({ db: deps.db, ahora: deps.ahora }, pid)
  const mismoCliente = p.status === 200 && esObjeto(cuerpo) && String(p.body.client_id) === String(cuerpo.client_id)
  return { status: r.status, body: { ...r.body, pedido: p.status === 200 && mismoCliente ? p.body : { error: p.status === 200 ? 'el pedido es de otro cliente' : p.body.error, detalle: p.status === 200 ? '' : p.body.detalle } } }
}

async function rutaListoBase(deps: DepsDeRutas, cuerpo: unknown): Promise<Respuesta> {
  const clientId = esObjeto(cuerpo) && typeof cuerpo.client_id === 'string' ? cuerpo.client_id.trim() : ''
  if (!UUID.test(clientId)) return { status: 400, body: { error: 'entrada_invalida', detalle: '`client_id` debe ser un uuid' } }
  const ahora = deps.ahora ?? new Date()
  const env = (deps as { env?: Record<string, string | undefined> }).env ?? process.env
  const pausa = pausaDelRaspadoDelEntorno(env)
  const enPausa = pausa.hasta !== null && raspadoEnPausa(ahora, env)
  const frescura = enPausa ? null : frescuraDelListoHoras(ahora, env)
  const base = (extra: Partial<SenalDeListo>): SenalDeListo => ({ client_id: clientId, listo: false, motivo: '', desde: null, origen: null, ultima_corrida: null, puente_quedan: null, frescura_horas: frescura, completando: false, huecos: [], ...extra })

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
  // en la pausa del raspado la edad no cuenta: lo guardado sigue sirviendo y la corrida del horario sigue como mantenimiento
  if (haceHoras === null || (frescura !== null && haceHoras > frescura)) return no(haceHoras === null ? 'la última corrida no tiene hora legible' : `la última corrida hecha es de hace ${haceHoras} h (más de ${frescura} h)`)
  if (vig.ok === false) return no('el vigilante dejó un problema en la última corrida')

  // el despertar con su cadena: ¿sigue esperando lo que el alta no trajo, o ya se pidió (o venció la espera)?
  const dsp = esObjeto(resumen.despertar) ? resumen.despertar : null
  const comp = dsp && esObjeto(dsp.completando) ? dsp.completando : null
  const desdeComp = comp && typeof comp.desde === 'string' ? Date.parse(comp.desde) : NaN
  const pendiente = !!comp && !dsp!.completado_en
  let venciada = false
  if (pendiente) {
    const min = Number.isFinite(desdeComp) ? Math.round(((ahora.getTime() - desdeComp) / 60_000) * 10) / 10 : null
    if (min !== null && min <= ESPERA_MAXIMA_DEL_DESPERTAR_MIN) return no(`el despertar espera lo que el alta no trajo (hace ${min} min; espera máxima ${ESPERA_MAXIMA_DEL_DESPERTAR_MIN} min)`, { completando: true })
    venciada = true
  }
  if (typeof resumen.unidades === 'number' && resumen.unidades === 0) return no('la última corrida no encontró nada que archivar (el cliente aún no trae raspado)')

  const p = await reconciliarYEnviar(deps, clientId, true)
  if (p.errores.length || p.puente.lectura_fallida === true) return { status: 502, body: { error: 'lectura_fallida', detalle: p.errores[0] ?? 'puente: lectura fallida' } }
  const quedan = typeof p.puente.quedan === 'number' ? p.puente.quedan : null
  if (quedan === null || quedan > 0) return no(quedan === null ? 'no se pudo medir el puente al índice' : `el puente al índice tiene ${quedan} trozo(s) por escribir o sacar`, { puente_quedan: quedan })

  // los huecos: lo que el despertar debía pedir y no llegó a `apify_raw` (una fuente que falló, un tope, o la cadena que no terminó)
  const huecos: SenalDeListo['huecos'] = []
  if (comp && Array.isArray(comp.falta)) {
    const raw = await deps.db.from('apify_raw').select('apify_function, created_at').eq('client_id', clientId).eq('ensayo', false).gte('created_at', Number.isFinite(desdeComp) ? new Date(desdeComp).toISOString() : new Date(0).toISOString()).limit(400)
    if (raw.error) return { status: 502, body: { error: 'lectura_fallida', detalle: `apify_raw: ${raw.error.message}` } }
    const llegaron = new Set(lista(raw.data).map((x) => String(x.apify_function)))
    for (const a of lista(comp.falta)) if (!llegaron.has(String(a.funcion))) huecos.push({ fuente: String(a.fuente ?? ''), funcion: String(a.funcion ?? ''), objetivo: String(a.objetivo ?? '') })
  }
  if (venciada && !huecos.length) huecos.push({ fuente: 'cadena', funcion: 'cadena_del_despertar', objetivo: `no terminó en ${ESPERA_MAXIMA_DEL_DESPERTAR_MIN} min` })
  // 03-nov: lo que el filtro de entrada del índice rechazó es un hueco DECLARADO: el cerebro queda listo igual y el plan no espera por esto
  const rechazadas = Array.isArray(p.puente.rechazadas) ? (p.puente.rechazadas as Array<{ id: string; clase: string; razon: string }>) : []
  for (const x of rechazadas) huecos.push({ fuente: 'indice', funcion: 'rechazado_por_el_filtro', objetivo: `${x.clase} ${x.id.slice(0, 8)}: ${x.razon}` })
  const conHuecos = huecos.length ? ` · con ${huecos.length} hueco(s) declarado(s)` : ''
  // la pausa a la vista: hasta cuándo y la fecha del último raspado real (lo último que Apify trajo de este cliente)
  let enLaPausa: SenalDeListo['raspado_en_pausa'] | undefined
  if (enPausa && pausa.hasta) {
    const ur = await deps.db.from('apify_raw').select('created_at').eq('client_id', clientId).eq('ensayo', false).order('created_at', { ascending: false }).limit(1)
    if (ur.error) return { status: 502, body: { error: 'lectura_fallida', detalle: `apify_raw: ${ur.error.message}` } }
    const u = lista(ur.data)[0]
    enLaPausa = { hasta: pausa.hasta, ultimo_raspado: u && typeof u.created_at === 'string' ? u.created_at : null }
  }
  const conPausa = enLaPausa ? ` · ${motivoDeLaPausa(enLaPausa.hasta)} (último raspado: ${enLaPausa.ultimo_raspado ? enLaPausa.ultimo_raspado.slice(0, 10) : 'sin fecha'})` : ''
  // la alta terminó (despertar/completar listo): cierra SOLAS las pausas «hasta la alta» de este cliente (no frenan a la alta; solo a la corrida diaria)
  const cierre = dsp || tipo === 'despertar' ? await cerrarPausasDeAlta(deps.db, clientId, new Date(t), ahora) : { cerradas: 0 }

  return {
    status: 200,
    body: base({
      listo: true, desde: new Date(t).toISOString(), origen: dsp ? 'despertar' : tipo, ultima_corrida: corrida, puente_quedan: 0, huecos, ...(cierre.cerradas || cierre.error ? { pausa_de_alta: cierre } : {}), ...(enLaPausa ? { raspado_en_pausa: enLaPausa } : {}),
      motivo: (venciada ? `la cadena del despertar no terminó en ${ESPERA_MAXIMA_DEL_DESPERTAR_MIN} min: se da por listo con lo que hay y puente al índice al día` : dsp ? 'despertar del alta completo (lo que faltaba ya se pidió) y puente al índice al día' : tipo === 'despertar' ? 'despertar del alta terminado y puente al índice al día' : `corrida diaria hecha hace ${haceHoras} h y puente al índice al día`) + conHuecos + conPausa,
    }) as unknown as Record<string, unknown>,
  }
}
