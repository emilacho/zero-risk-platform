// ⓪ ENTRADA · LLAVE · CC#2 · J4 · 2026-10-13 · flujo `zero-risk/jefatura-turno` (UN paso de una revisión de la jefatura por ejecución). INACTIVO.
// Lo despierta la ruta de la jefatura (o el vigía, o este mismo flujo para el paso siguiente) con { revision_id, turno } y la llave de despacho. Nada de aquí paga: solo valida.
// A diferencia de la oficina, aquí NO hay portero: el portero y la llamada a GPT viven DENTRO de la ruta (diseño v4 §10); este flujo solo ejecuta pasos de AGENTE.
const w = $input.first().json || {}
const body = w.body && typeof w.body === 'object' && !Array.isArray(w.body) ? w.body : {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}

const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) throw new Error('JEFATURA_TURNO_CERRADO · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) · el flujo queda cerrado · E67.')
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) throw new Error('JEFATURA_TURNO_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · E67.')

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.revision_id || ''))) throw new Error('JEFATURA_TURNO_SIN_REVISION · revision_id no es un uuid · se DETIENE')
const t = body.turno && typeof body.turno === 'object' ? body.turno : null
if (!t || !Number.isInteger(t.n) || t.n < 1) throw new Error('JEFATURA_TURNO_SIN_NUMERO · falta turno.n (entero ≥ 1) · se DETIENE')
if (t.tipo !== 'agente') throw new Error('JEFATURA_TURNO_TIPO_INVALIDO · este flujo solo ejecuta pasos de agente (llegó ' + JSON.stringify(t.tipo) + ')')
if (!t.pedido || typeof t.pedido !== 'object') throw new Error('JEFATURA_TURNO_SIN_PEDIDO · falta turno.pedido · se DETIENE')
if (typeof t.pedido.agent_name !== 'string' || typeof t.pedido.task !== 'string' || !t.pedido.task) throw new Error('JEFATURA_TURNO_PEDIDO_INVALIDO · el pedido de un agente necesita agent_name y task')
if (typeof t.pedido.esquema !== 'string' || !t.pedido.esquema) throw new Error('JEFATURA_TURNO_SIN_ESQUEMA · el pedido de un agente necesita su esquema de salida (sin esquema no hay molde ni contrato)')
// dry_run OBLIGATORIO y booleano (diseño v4 §2): ausente o no booleano = se DETIENE, nunca se lee como «real»
if (typeof t.pedido.dry_run !== 'boolean') throw new Error('JEFATURA_TURNO_SIN_DRY_RUN · turno.pedido.dry_run debe ser booleano (true/false) · se DETIENE')

return [{ json: { revision_id: String(body.revision_id), turno: t, dry_run: t.pedido.dry_run === true } }]
