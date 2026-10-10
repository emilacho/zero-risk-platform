// ④ CIERRE · junta lo de todos los clientes en una línea por cliente y dice qué pasó. Un error de la ruta o del plan se DICE. De las reseñas y comentarios solo hay señales agregadas (sin nombre ni texto).
// Los elementos del paso ③ y las respuestas de `correr` van EN EL MISMO ORDEN (el flujo es lineal, sin ramas que filtren). Un elemento sin pedido real («saltado») se ignora aunque `correr` haya contestado 400.
const respuestas = $input.all().map((i) => i.json)
const pedidos = $('③ Pedido a correr').all().map((i) => i.json)
const clientes = pedidos.map((pedido, k) => {
  const saltado = pedido.correr_body === null
  const r0 = respuestas[k] || {}
  const r = r0.body ? r0.body : r0
  return {
    cliente: pedido.cliente || null,
    plan_fallo: pedido.falla || null,
    ampliacion: pedido.ampliacion ? { hecho: pedido.ampliacion.hecho, gasto_usd: pedido.ampliacion.gasto_usd, parado: pedido.ampliacion.parado, llamadas: (pedido.ampliacion.llamadas || []).length } : null,
    estado: saltado ? 'saltado' : r.estado || 'sin_respuesta',
    ok: saltado ? null : r.ok === true,
    fuentes: !saltado && Array.isArray(r.fuentes) ? r.fuentes.map((f) => f.fuente + ':' + f.accion) : [],
    oportunidades: !saltado && Array.isArray(r.oportunidades) ? r.oportunidades.length : 0,
    gasto: saltado ? null : r.gasto || null,
    errores: !saltado && Array.isArray(r.errores) ? r.errores : [],
    detalle: saltado ? null : r.detalle || r.error || null,
  }
})
const e = $('⓪ Entrada').first().json
const malo = clientes.some((c) => c.plan_fallo || (c.estado !== 'saltado' && (c.errores.length > 0 || (c.ok === false && c.estado !== 'ya_corrio_hoy'))))
return [{ json: { fin: malo ? 'con_errores' : 'hecho', via: e.via, dry_run: e.dry_run, clientes } }]
