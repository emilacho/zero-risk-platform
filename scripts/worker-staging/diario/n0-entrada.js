// ⓪ ENTRADA · mantenimiento diario del portero · CC#2 · 2026-10-10.
//  · por HORARIO: corre de verdad (dry_run=false), para todos los clientes activos.
//  · a mano (webhook): exige la llave de despacho y `dry_run` BOOLEANO OBLIGATORIO; `client_id` (uuid) opcional limita el alcance.
// 🔴 Sin llave, o sin `dry_run` booleano en la entrada a mano, el flujo SE DETIENE aquí: no se lee ni se escribe nada.
let w = null
try { w = $('Webhook · a mano (con llave)').first() } catch (e) { w = null }
const base = { workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }
if (!w) return [{ json: { ...base, via: 'horario', dry_run: false, client_id: null } }]
const h = w.json || {}
const esperada = String($env.SALA_DISPATCH_KEY || '')
const recibida = String((h.headers || {})['x-sala-dispatch-key'] || '')
if (!esperada || recibida !== esperada) throw new Error('DIARIO_SIN_LLAVE · falta o no coincide x-sala-dispatch-key (o SALA_DISPATCH_KEY no está configurada) · se DETIENE')
const b = h.body || {}
if (typeof b.dry_run !== 'boolean') throw new Error('DIARIO_DRY_RUN_OBLIGATORIO · `dry_run` es obligatorio y debe ser true o false · se DETIENE')
if (b.client_id !== undefined && (typeof b.client_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.client_id))) throw new Error('DIARIO_CLIENTE_INVALIDO · `client_id` debe ser un uuid · se DETIENE')
return [{ json: { ...base, via: 'a mano', dry_run: b.dry_run, client_id: b.client_id || null } }]
