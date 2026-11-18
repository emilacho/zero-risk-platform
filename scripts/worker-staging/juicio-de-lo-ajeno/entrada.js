// ⓪ ENTRADA · el juicio de lo ajeno POR EL FLUJO (ADENDA 2 del encargo 4 · CC-CEREBRO · 18-nov).
//  · Solo por webhook con la llave interna (x-api-key). Sin llave, sin client_id uuid o sin `dry_run` booleano: se DETIENE aquí y no llama a nadie.
//  · El flujo y la ejecución salen de n8n ($workflow.id y $execution.id): son REALES; nadie los puede inventar desde afuera.
//  · Como mucho 6 tandas por ejecución (≤ 6 llamadas · ≤ US$ 0,144 con el tope por llamada; y caben en los 280 s de la ruta).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const h = $('Webhook · a mano (llave interna)').first().json
const esperada = String($env.INTERNAL_API_KEY || '')
const recibida = String((h.headers || {})['x-api-key'] || '')
if (!esperada || recibida !== esperada) throw new Error('SIN_LLAVE · falta o no coincide x-api-key · se DETIENE')
const b = h.body || {}
if (!UUID.test(String(b.client_id || ''))) throw new Error('SIN_CLIENTE · client_id debe ser un uuid · se DETIENE')
if (typeof b.dry_run !== 'boolean') throw new Error('DRY_RUN_OBLIGATORIO · dry_run debe ser true o false · se DETIENE')
const ids = Array.isArray(b.ids) ? b.ids.map(String).filter((x) => UUID.test(x)) : undefined
const tandas = Number.isInteger(b.tandas) && b.tandas >= 1 && b.tandas <= 6 ? b.tandas : 2
return [{ json: { client_id: b.client_id, dry_run: b.dry_run, escribir: b.escribir !== false, tandas, ...(ids ? { ids } : {}), workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) } }]
