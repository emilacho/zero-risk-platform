// ⓪ ENTRADA · cadena · fechas especiales · SOLO corre si el cliente declaró este tipo de fecha (la lista vacía no investiga NADA)
// Paga un agente: `seco` explícito o se DETIENE antes de gastar. El simulacro (páginas y respuesta enlatadas) SOLO existe en seco.
const e = $input.first().json || {}
if (typeof e.campana_id !== 'string' || e.campana_id.trim() === '') throw new Error('CADENA_SIN_CAMPANA · falta campana_id · se DETIENE y no escribe nada')
if (typeof e.seco !== 'boolean') throw new Error('CADENA_SECO_AUSENTE · el pedido debe traer seco explícito (true o false) · se DETIENE antes de gastar')
for (const k of ['pais', 'tipo', 'ambito']) if (typeof e[k] !== 'string' || e[k].trim() === '') throw new Error('CADENA_FECHAS_SIN_' + k.toUpperCase() + ' · falta ' + k)
if (!Number.isInteger(e.anio)) throw new Error('CADENA_FECHAS_SIN_ANIO · falta anio (entero)')
const simulacro = e.seco === true && e.simulacro && typeof e.simulacro === 'object' ? e.simulacro : null
return [{ json: { paso: 'fechas', campana_id: e.campana_id, seco: e.seco, pais: e.pais, tipo: e.tipo, ambito: e.ambito, anio: e.anio, simulacro, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) } }]
