// 1 · PEDIDO DEL RELOJ · el vigía corre 2 veces al día (esperado medible: 2 ejecuciones/día) · el lunes por la mañana pide además el resumen semanal
const ahora = new Date()
const lunesTemprano = ahora.getUTCDay() === 1 && ahora.getUTCHours() < 12
return [{ json: { pedido: { accion: 'reloj', resumen: lunesTemprano, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) } } }]
