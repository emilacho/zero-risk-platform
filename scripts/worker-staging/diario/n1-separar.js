// ① SEPARAR EL PLAN EN UN ELEMENTO POR CLIENTE. Si el plan falló, se DICE (un fallo nunca se lee como «no hay clientes»).
const e = $('⓪ Entrada').first().json
const r = $input.first().json || {}
const p = r.body ? r.body : r
if (!p || p.error || !Array.isArray(p.clientes)) return [{ json: { ...e, cliente: null, falla: 'El plan falló: ' + String((p && (p.error || p.detalle)) || 'sin respuesta') + ' ' + String((p && p.detalle) || '') } }]
if (!p.clientes.length) return [{ json: { ...e, cliente: null, falla: null, sin_clientes: true, excluidos: p.excluidos || [] } }]
return p.clientes.map((c) => ({ json: { ...e, cliente: c.client_id, nombre: c.nombre, acciones: (c.plan && c.plan.hacer) || [], omitidas: (c.plan && c.plan.omitidas) || [], no_cubiertas: (c.plan && c.plan.no_cubiertas) || [], gastado_hoy_usd: c.gastado_hoy_usd, falla: null } }))
