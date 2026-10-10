// ⓪ ENTRADA · la revisión del manual · CC#2 · 2026-10-10. Valida la llave de despacho (la de siempre, nunca escrita en el JSON) y el cuerpo: `client_id` uuid y `dry_run` BOOLEANO OBLIGATORIO.
// 🔴 Sin llave, sin cliente válido o sin `dry_run` booleano el flujo SE DETIENE aquí: no se lee ni se escribe nada.
const h = $input.first().json
const esperada = String($env.SALA_DISPATCH_KEY || '')
const recibida = String((h.headers || {})['x-sala-dispatch-key'] || '')
if (!esperada || recibida !== esperada) throw new Error('MANUAL_SIN_LLAVE · falta o no coincide x-sala-dispatch-key (o SALA_DISPATCH_KEY no está configurada) · se DETIENE')
const b = h.body || {}
if (typeof b.client_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.client_id)) throw new Error('MANUAL_CLIENTE_INVALIDO · `client_id` debe ser un uuid · se DETIENE')
if (typeof b.dry_run !== 'boolean') throw new Error('MANUAL_DRY_RUN_OBLIGATORIO · `dry_run` es obligatorio y debe ser true o false · se DETIENE')
return [{ json: { client_id: b.client_id, dry_run: b.dry_run, llave: recibida, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id), costo_usd: 0 } }]
