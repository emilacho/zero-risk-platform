// ① ARMAR EL PEDIDO A LA CADENA · la entrada de cada vuelta (la primera, o la que sigue a una corrección / un reintento)
const s = $input.first().json
const pedido = { accion: 'preparar', campana_id: s.campana_id, seco: s.seco, workflow_id: s.workflow_id, workflow_execution_id: s.workflow_execution_id }
if (s.tanda !== null && s.tanda !== undefined) pedido.tanda = s.tanda
if (s.correccion) pedido.correccion = s.correccion
return [{ json: { ...s, pedido } }]
