// ② ARMAR LA LLAMADA AL AGENTE · el cuerpo COMPLETO lo armó la ruta (tarea, esquema, tope, razonamiento, modelo): aquí solo se le pone el contexto del flujo
// 🔴 `workflow_id` + `workflow_execution_id` SIEMPRE (canon: agentes solo vía workflows) · `dry_run` EXPLÍCITO y booleano · `force_restart` para que no devuelva una respuesta vieja del checkpoint
const s = $input.first().json
const llamada = { ...s.run_sdk, workflow_id: s.workflow_id, workflow_execution_id: s.workflow_execution_id, force_restart: true, dry_run: s.seco === true }
return [{ json: { ...s, llamada } }]
