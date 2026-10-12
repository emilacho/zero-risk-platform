/**
 * Las dos puertas de «lo que falta lo proponen los agentes» (ronda 75). Ninguna llama a un modelo ni escribe: el flujo de n8n llama al agente entre las dos y guarda la versión nueva por la puerta de siempre.
 *  · preparar → { faltantes, pedidos[] (un pedido por agente), foto del manual }
 *  · aplicar  → lee lo que contestó cada agente, fusiona en una COPIA del borrador y devuelve el cuerpo listo para guardar + las diferencias por campo (solo lo propuesto debe diferir).
 */
import { armarPedidos, CAMPOS_PROPONIBLES, fusionarPropuestas, leerRespuesta, type Propuesta } from './propuesta'
import { fuenteHumana } from './materia'
import type { Fuente } from './procedencia'
import { borradorDeContentText, diferenciasPorCampo, leerInsumos, type Db } from './revision'

/** anotaciones del borrador (no son campos del manual): la lista de provisionales/ausentes se actualiza y se anota qué campos llevan propuesta */
const METADATOS = ['campos_provisionales', 'campos_ausentes', 'campos_con_propuesta_del_agente']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Resp = { status: number; body: Record<string, unknown> }
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null)
const camposDe = (c: Record<string, unknown>): string[] | undefined => (Array.isArray(c.campos) ? c.campos.filter((x): x is string => typeof x === 'string') : undefined)
const repropuestosDe = (c: Record<string, unknown>): string[] | undefined => (Array.isArray(c.reproponer) ? c.reproponer.filter((x): x is string => typeof x === 'string') : undefined)

/**
 * LO QUE DIJO EL DUEÑO: los datos de sede con `fuente = 'dueno'` (corrección o dato declarado por él). Mandan sobre lo inferido y llegan al agente primero y completos.
 * Devuelve las líneas para el pedido y las fuentes «humanas» con las que el chequeo de hechos puede respaldar lo que la propuesta diga de ellas.
 * Si la lectura falla NO se lee como «no hay nada»: se devuelve el error y quien llama decide (aquí: se avisa y no se pide nada).
 */
export async function datosDelDueno(db: Db, clientId: string): Promise<{ ok: true; lineas: string[]; /** los mismos datos como HECHOS, sin decir quién los dijo (para lo que lee el cliente) */ hechos: string[]; fuentes: Fuente[] } | { ok: false; error: string }> {
  const s = await db.from('client_sedes').select('id, clave, ciudad').eq('client_id', clientId)
  if (s.error) return { ok: false, error: 'client_sedes: ' + String(s.error.message ?? s.error) }
  const d = await db.from('client_sede_datos').select('sede_id, campo, valor_texto, fuente, fuente_ref, observado_en').eq('client_id', clientId).eq('fuente', 'dueno')
  if (d.error) return { ok: false, error: 'client_sede_datos: ' + String(d.error.message ?? d.error) }
  const ciudad = new Map<string, string>((Array.isArray(s.data) ? s.data : []).map((x: Record<string, unknown>) => [String(x.id), String(x.ciudad ?? x.clave ?? '')]))
  const filas = (Array.isArray(d.data) ? d.data : []) as Array<Record<string, unknown>>
  // lo más nuevo de cada (sede, campo): una corrección posterior reemplaza a la anterior
  const ultimas = new Map<string, Record<string, unknown>>()
  for (const f of filas) { const k = `${f.sede_id}|${f.campo}`; const p = ultimas.get(k); if (!p || String(f.observado_en) > String(p.observado_en)) ultimas.set(k, f) }
  const lineas: string[] = []
  const hechos: string[] = []
  const fuentes: Fuente[] = []
  for (const f of ultimas.values()) {
    const donde = f.sede_id ? `sede de ${ciudad.get(String(f.sede_id)) || 'ciudad sin declarar'}` : 'toda la cuenta'
    const campo = String(f.campo).replace(/_/g, ' ')
    const fecha = String(f.observado_en ?? '').slice(0, 10)
    const l = `${donde} · ${campo}: ${String(f.valor_texto)} (corrección del dueño${fecha ? ', ' + fecha : ''})`
    lineas.push(l)
    hechos.push(`${donde} · ${campo}: ${String(f.valor_texto)}`)
    fuentes.push(fuenteHumana(`dueno:${String(f.sede_id)}:${String(f.campo)}`, 'corrección del dueño', l, 'ficha'))
  }
  return { ok: true, lineas, hechos, fuentes }
}

export async function rutaPrepararPropuesta(db: Db, cuerpo: unknown): Promise<Resp> {
  const c = obj(cuerpo)
  if (!c) return { status: 400, body: { error: 'invalid_body', detail: 'el cuerpo debe ser un objeto JSON' } }
  if (typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return { status: 400, body: { error: 'invalid_client_id', detail: 'client_id debe ser un uuid' } }
  const r = await leerInsumos(db, c.client_id)
  if (!r.ok) return { status: r.status, body: { error: r.error, detail: r.detalle } }
  const ins = r.insumos
  const dueno = await datosDelDueno(db, c.client_id)
  if (!dueno.ok) return { status: 502, body: { error: 'lectura_fallida', detail: 'lo que dijo el dueño no se pudo leer: ' + dueno.error + ' · no se pide nada sin saberlo' } }
  const p = armarPedidos({ draft: ins.manual, fuentes: [...ins.fuentes, ...dueno.fuentes], campos: camposDe(c), cliente: ins.client_name, delDueno: dueno.lineas, reproponer: repropuestosDe(c) })
  return { status: 200, body: { ok: true, client_id: ins.client_id, datos_del_dueno: dueno.lineas.length, client_name: ins.client_name, version_base: ins.version_vigente, huella_base: ins.foto.huella, faltantes: p.faltantes, rechazados: p.rechazados, pedidos: p.pedidos } }
}

export async function rutaAplicarPropuesta(db: Db, cuerpo: unknown): Promise<Resp> {
  const c = obj(cuerpo)
  if (!c) return { status: 400, body: { error: 'invalid_body', detail: 'el cuerpo debe ser un objeto JSON' } }
  if (typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return { status: 400, body: { error: 'invalid_client_id', detail: 'client_id debe ser un uuid' } }
  if (typeof c.dry_run !== 'boolean') return { status: 400, body: { error: 'dry_run_obligatorio', detail: 'dry_run debe ser true o false' } }
  if (!Array.isArray(c.respuestas) || !c.respuestas.length) return { status: 400, body: { error: 'sin_respuestas', detail: 'respuestas[] debe traer lo que contestó cada agente' } }
  const r = await leerInsumos(db, c.client_id)
  if (!r.ok) return { status: r.status, body: { error: r.error, detail: r.detalle } }
  const ins = r.insumos
  // el manual NO cambió desde que se prepararon los pedidos (si cambió, lo propuesto podría pisar algo nuevo)
  if (typeof c.version_base === 'number' && c.version_base !== ins.version_vigente) return { status: 409, body: { error: 'el_manual_cambio', detail: `se preparó sobre la versión ${c.version_base} y ahora la vigente es la ${ins.version_vigente}` } }
  if (typeof c.huella_base === 'string' && c.huella_base !== ins.foto.huella) return { status: 409, body: { error: 'el_manual_cambio', detail: 'la huella del manual vigente ya no es la de cuando se prepararon los pedidos' } }
  const dueno = await datosDelDueno(db, c.client_id)
  if (!dueno.ok) return { status: 502, body: { error: 'lectura_fallida', detail: 'lo que dijo el dueño no se pudo leer: ' + dueno.error } }
  const fuentesTodas = [...ins.fuentes, ...dueno.fuentes]
  const p = armarPedidos({ draft: ins.manual, fuentes: fuentesTodas, campos: camposDe(c), cliente: ins.client_name, delDueno: dueno.lineas, reproponer: repropuestosDe(c) })
  const campos_por_agente = new Map(p.pedidos.map((x) => [x.agente, x.campos]))
  const propuestas: Propuesta[] = []
  const sin_leer: Array<{ campo: string; motivo: string }> = []
  for (const x of c.respuestas) {
    const o = obj(x)
    const agente = typeof o?.agente === 'string' ? o.agente : ''
    const campos = campos_por_agente.get(agente)
    if (!campos) { sin_leer.push({ campo: `(agente ${agente || '?'})`, motivo: 'no se pidió nada a ese agente' }); continue }
    const l = leerRespuesta(o?.response, campos)
    propuestas.push(...l.propuestas); sin_leer.push(...l.sin_leer)
  }
  const f = fusionarPropuestas(ins.manual, propuestas, fuentesTodas, { reproponer: repropuestosDe(c) })
  // GUARDA: lo único que cambió son los campos aplicados, y todos son proponibles
  const inesperado = f.campos_distintos.filter((k) => !f.aplicadas.includes(k) || !CAMPOS_PROPONIBLES[k])
  if (inesperado.length) return { status: 500, body: { error: 'cambio_inesperado', detail: `cambiaron campos que no eran propuestas: ${inesperado.join(', ')}` } }
  const resumen = { client_id: ins.client_id, version_base: ins.version_vigente, aplicadas: f.aplicadas, rechazadas: [...p.rechazados, ...f.rechazadas], sin_leer, dry_run: c.dry_run }
  if (!f.aplicadas.length) return { status: 200, body: { ok: true, aplicado: false, ...resumen, motivo: 'no hay nada que guardar: ninguna propuesta pasó' } }
  // el cuerpo para guardar la versión nueva por la puerta de siempre (POST /api/brand-book/{id}); los datos del veredicto vienen de la versión base
  const fila = await db.from('client_brand_books').select('content_text, gate_outcome').eq('client_id', ins.client_id).order('version', { ascending: false }).limit(1)
  const base = obj(Array.isArray(fila.data) ? fila.data[0] : null)
  let ct: Record<string, unknown> = {}
  try { ct = JSON.parse(String(base?.content_text ?? '{}')) as Record<string, unknown> } catch { ct = {} }
  if (!borradorDeContentText(base?.content_text)) return { status: 409, body: { error: 'manual_ilegible', detail: 'el manual vigente no trae borrador legible' } }
  const promote_body = {
    brand_book: f.draft, source: 'propuesta_del_agente',
    fidelity_passed: ct.fidelity_passed === true, fidelity_scores: ct.fidelity_scores ?? null, fidelity_threshold: ct.fidelity_threshold ?? null,
    approved_by: 'propuesta_del_agente', approved_at: new Date().toISOString(),
    gate_outcome: (base?.gate_outcome as string | null) ?? null,
    gate_nota: `versión con ${f.aplicadas.length} campo(s) «propuesta del agente»: ${f.aplicadas.join(', ')}; lo demás igual que la versión ${ins.version_vigente}`,
  }
  return { status: 200, body: { ok: true, aplicado: true, ...resumen, diferencias: diferenciasPorCampo(ins.manual, f.draft).filter((d) => !METADATOS.includes(d.campo)), metadatos_que_cambian: diferenciasPorCampo(ins.manual, f.draft).filter((d) => METADATOS.includes(d.campo)).map((d) => d.campo), promote_body } }
}
