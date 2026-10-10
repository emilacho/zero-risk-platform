// ③ ARMAR EL PEDIDO A `correr` (pasos 2, 3 y 5) de CADA cliente. Pasa el gasto REAL de la ampliación para que la ruta lo compare con el tope. Sin cliente o con falla del plan no hay pedido (queda «saltado»).
return $input.all().map((item) => {
  const e = item.json
  if (e.falla || !e.cliente) return { json: { ...e, correr_body: null } }
  return { json: { ...e, correr_body: { client_id: e.cliente, dry_run: e.dry_run, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, gasto_ampliacion_usd: (e.ampliacion && e.ampliacion.gasto_usd) || 0 } } }
})
