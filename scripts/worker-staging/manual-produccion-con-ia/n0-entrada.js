// ⓪ Entrada · llave y cuerpo. El webhook trae { client_id, dry_run, reescribir? } y la llave interna en la cabecera.
// 🔴 de CC6 en #1275 + firma de Cerebro (23-nov): la llave se COMPARA con INTERNAL_API_KEY (la misma de las puertas de
// la plataforma; NUNCA SALA_DISPATCH_KEY). Sin llave, llave errada o entorno sin INTERNAL_API_KEY → el flujo SE DETIENE
// aquí, ANTES de `preparar`: no se lee nada y no se paga nada.
const h = $input.first().json.headers || {}
const b = $input.first().json.body || {}
const esperada = String($env.INTERNAL_API_KEY || '')
const recibida = String(h['x-api-key'] || '')
if (!esperada || recibida !== esperada) throw new Error('PRODUCCION_CON_IA_SIN_LLAVE · falta o no coincide x-api-key (o INTERNAL_API_KEY no está configurada) · se DETIENE')
if (typeof b.client_id !== 'string' || !b.client_id.trim()) throw new Error('falta client_id')
if (typeof b.dry_run !== 'boolean') throw new Error('dry_run es obligatorio y debe ser true o false')
return [{ json: { client_id: b.client_id.trim(), dry_run: b.dry_run, reescribir: b.reescribir === true, workflow_id: $workflow.id, workflow_execution_id: $execution.id } }]
