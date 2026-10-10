// ⓪ ENTRADA DEL SUB-FLUJO · cadena · @@PASO@@ · CC#1 · 2026-10-09 · diseño v2 §3.7
// Este flujo PAGA un agente. El pedido trae `seco` EXPLÍCITO (true|false): no se asume nunca (lección 28-sep: un `dry_run` que moría en el primer nodo cobró US$ 0,37) · se DETIENE antes de gastar.
const e = $input.first().json || {}
if (typeof e.campana_id !== 'string' || e.campana_id.trim() === '') throw new Error('CADENA_SIN_CAMPANA · falta campana_id · se DETIENE y no escribe nada')
if (typeof e.seco !== 'boolean') throw new Error('CADENA_SECO_AUSENTE · el pedido debe traer seco explícito (true o false) · se DETIENE antes de gastar')
const tanda = @@CON_TANDA@@ ? (Number.isInteger(e.tanda) && e.tanda >= 1 ? e.tanda : 1) : null
// el simulacro (respuestas enlatadas del agente, UNA por vuelta) SOLO existe en seco: en real se ignora por completo y el agente se llama de verdad
const simulacro = e.seco === true && Array.isArray(e.simulacro) ? e.simulacro : null
return [{ json: { paso: '@@PASO@@', campana_id: e.campana_id, seco: e.seco, tanda, simulacro, vuelta: 0, correccion: null, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) } }]
