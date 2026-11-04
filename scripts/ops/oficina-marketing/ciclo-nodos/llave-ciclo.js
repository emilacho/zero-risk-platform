// 01-nov · CICLO DEL PLAN (tramo 2): entradas nuevas del disparo. Se rechazan ANTES de gastar; ausentes = el flujo de hoy.
const wb = w.body && typeof w.body === 'object' ? w.body : {}
const UUID_CICLO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const pb = wb.plan_base_id
const hayBase = pb !== undefined && pb !== null && pb !== ''
if (hayBase && (typeof pb !== 'string' || !UUID_CICLO.test(pb))) throw new Error('PLANEACION_PLAN_BASE_INVALIDO · plan_base_id solo admite un uuid (llegó ' + JSON.stringify(pb).slice(0, 60) + ') · se DETIENE antes de gastar')
const cd = wb.cambios_del_dueno
if (cd !== undefined && cd !== null && (typeof cd !== 'string' || cd.trim().length < 5 || cd.trim().length > 100000)) throw new Error('PLANEACION_CAMBIOS_INVALIDOS · cambios_del_dueno solo admite texto de 5 a 100000 caracteres · se DETIENE antes de gastar')
if (hayBase && !(typeof cd === 'string' && cd.trim().length >= 5)) throw new Error('PLANEACION_CAMBIOS_OBLIGATORIOS · con plan_base_id hay que decir qué cambios pidió el dueño (cambios_del_dueno) · se DETIENE antes de gastar')
const pcid = wb.plan_cambio_id
if (pcid !== undefined && pcid !== null && (typeof pcid !== 'string' || !UUID_CICLO.test(pcid))) throw new Error('PLANEACION_PLAN_CAMBIO_INVALIDO · plan_cambio_id solo admite un uuid · se DETIENE antes de gastar')
const sc = wb.sin_compuerta
if (sc !== undefined && sc !== null && typeof sc !== 'boolean') throw new Error('PLANEACION_SIN_COMPUERTA_INVALIDO · sin_compuerta solo admite true o false (llegó ' + JSON.stringify(sc).slice(0, 60) + ') · se DETIENE antes de gastar')
const tr = wb.tope_reescritura_usd
if (tr !== undefined && tr !== null && (typeof tr !== 'number' || !isFinite(tr) || tr <= 0)) throw new Error('PLANEACION_TOPE_REESCRITURA_INVALIDO · tope_reescritura_usd solo admite un número mayor que 0 (llegó ' + JSON.stringify(tr).slice(0, 60) + ') · se DETIENE antes de gastar')
