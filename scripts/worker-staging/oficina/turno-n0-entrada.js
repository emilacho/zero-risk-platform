// ⓪ ENTRADA · LLAVE · CC#2 · 2026-10-09 · flujo `zero-risk/oficina-turno` (UN paso de la oficina por ejecución). INACTIVO.
// Lo despierta la puerta (o el vigía, o este mismo flujo para el paso siguiente) con { encargo_id, turno } y la llave de despacho. Nada de aquí paga: solo valida.
const w = $input.first().json || {}
const body = w.body && typeof w.body === 'object' && !Array.isArray(w.body) ? w.body : {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}

const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) throw new Error('OFICINA_TURNO_CERRADO · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) · el flujo queda cerrado · E67.')
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) throw new Error('OFICINA_TURNO_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · E67.')

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.encargo_id || ''))) throw new Error('OFICINA_TURNO_SIN_ENCARGO · encargo_id no es un uuid · se DETIENE')
const t = body.turno && typeof body.turno === 'object' ? body.turno : null
if (!t || !Number.isInteger(t.n) || t.n < 1) throw new Error('OFICINA_TURNO_SIN_NUMERO · falta turno.n (entero ≥ 1) · se DETIENE')
if (t.tipo !== 'agente' && t.tipo !== 'portero') throw new Error('OFICINA_TURNO_TIPO_INVALIDO · este flujo solo ejecuta pasos de agente o de portero (llegó ' + JSON.stringify(t.tipo) + ')')
if (!t.pedido || typeof t.pedido !== 'object') throw new Error('OFICINA_TURNO_SIN_PEDIDO · falta turno.pedido · se DETIENE')
if (t.tipo === 'agente' && (typeof t.pedido.agent_name !== 'string' || typeof t.pedido.task !== 'string' || !t.pedido.task)) throw new Error('OFICINA_TURNO_PEDIDO_INVALIDO · el pedido de un agente necesita agent_name y task')

return [{ json: { llave: recibida, encargo_id: String(body.encargo_id), turno: t, dry_run: t.pedido.dry_run === true } }]
