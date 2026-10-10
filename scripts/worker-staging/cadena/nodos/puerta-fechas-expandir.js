// 3 · FECHAS ESPECIALES · SOLO los tipos que la estrategia de ESTE cliente declaró. Lista vacía (lo normal) = nada se investiga y nada se bloquea.
const s = $input.first().json
const pedidos = Array.isArray(s.fechas_pedidas) ? s.fechas_pedidas : []
return [{ json: { ...s, hay_fechas: pedidos.length > 0 } }]
