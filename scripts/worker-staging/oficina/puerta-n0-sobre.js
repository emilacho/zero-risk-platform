// ⓪ SOBRE · LLAVE · CC#2 · 2026-10-09 · flujo `zero-risk/oficina` (la PUERTA de la oficina de creativos). INACTIVO hasta que Emilio diga.
// Solo lo despierta la sala (llave de despacho, lección E67). NO valida el resto del sobre: si NO trae `familia`, el cuerpo sigue TAL CUAL a la pieza simple (pasarela) y ella valida lo suyo;
// si trae `familia`, la ruta /api/oficina/encargos valida (dry_run explícito, uuid, tope) ANTES de gastar nada.
const w = $input.first().json || {}
const body = w.body && typeof w.body === 'object' && !Array.isArray(w.body) ? w.body : {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}

const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) {
  throw new Error('OFICINA_CERRADA · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) en su entorno · esta puerta queda cerrada hasta que exista · E67.')
}
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) {
  throw new Error('OFICINA_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · solo la sala despierta esta puerta · E67.')
}

return [{ json: { body, llave: recibida, tiene_familia: typeof body.familia === 'string' && body.familia.trim() !== '' } }]
