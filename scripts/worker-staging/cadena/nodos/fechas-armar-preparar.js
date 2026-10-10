// ③ ARMAR `preparar` de las fechas · las páginas ya descargadas viajan en el pedido; la ruta arma el cuerpo completo del agente
const s = $input.first().json
const pedido = { accion: 'preparar', campana_id: s.campana_id, seco: s.seco, pais: s.pais, tipo: s.tipo, ambito: s.ambito, anio: s.anio, paginas: s.paginas || [], workflow_id: s.workflow_id, workflow_execution_id: s.workflow_execution_id }
return [{ json: { ...s, pedido } }]
