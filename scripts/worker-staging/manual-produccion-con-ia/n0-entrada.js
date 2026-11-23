// ⓪ Entrada · llave y cuerpo. El webhook trae { client_id, dry_run, reescribir? } y la llave de despacho en la cabecera.
const h = $input.first().json.headers || {}
const b = $input.first().json.body || {}
const llave = h['x-sala-dispatch-key'] || ''
if (!llave) throw new Error('falta la llave de despacho (x-sala-dispatch-key)')
if (typeof b.client_id !== 'string' || !b.client_id.trim()) throw new Error('falta client_id')
if (typeof b.dry_run !== 'boolean') throw new Error('dry_run es obligatorio y debe ser true o false')
return [{ json: { llave, client_id: b.client_id.trim(), dry_run: b.dry_run, reescribir: b.reescribir === true, workflow_id: $workflow.id, workflow_execution_id: $execution.id } }]
