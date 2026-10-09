// ④ ARMAR LA LLAMADA AL AGENTE · contexto del flujo sobre el cuerpo que armó la ruta (workflow ids siempre · dry_run explícito)
const s = $input.first().json
const llamada = { ...s.run_sdk, workflow_id: s.workflow_id, workflow_execution_id: s.workflow_execution_id, force_restart: true, dry_run: s.seco === true }
return [{ json: { ...s, llamada } }]
