// ── JEF · plan · evaluar · J7 · CC#1 · 2026-10-14 · cada versión que produjo la jefatura (B, C) se mide con LOS MISMOS chequeos por código de hoy, que son el módulo de arriba (copia EXACTA del de «¿Llegó la vuelta?»: una prueba compara la huella).
// Salida: evaluaciones { etiqueta, marcas, largo } y, por versión, el texto ya revisado (calentamiento fuera, registro corregido) que sería el que se guarde.
const entrada = $input.first().json || {}
const jef = entrada.jef || {}
const v = $('¿Llegó la vuelta?').first().json
const salida = jef.salida || {}
let registroDelPlan = null
try { registroDelPlan = $('Redactor (B4)').first().json.registro_usado.registro } catch (x) { registroDelPlan = null }
let contextoChequeo = null
try { contextoChequeo = $('Redactor (B4)').first().json.contexto_chequeo } catch (x) { contextoChequeo = null }
function procesar(textoCrudo) {
  const crudo = String(textoCrudo || '')
  const sinCalentamiento = quitarCalentamiento(crudo)
  const base = sinCalentamiento.texto.trim() ? sinCalentamiento.texto : crudo
  const reg = corregirRegistroDelPlan(base, registroDelPlan)
  const revisado = reg ? reg.texto : crudo
  const chequeo = revisarPlan(revisado, contextoChequeo)
  const pendientes = chequeo ? pendientesDelPlan(chequeo) : null
  const texto = revisado.replace(/\s+$/, '') + '\n'
  return { texto, caracteres: texto.length, chequeo_del_plan: chequeo, pendientes, estado_del_plan: pendientes ? 'con_pendientes' : 'sin_marcas', con_pendientes: !!pendientes, marcas: chequeo && Array.isArray(chequeo.marcas) ? chequeo.marcas.length : 0 }
}
const procesadas = {}
const evaluaciones = [{ etiqueta: 'A', marcas: v.chequeo_del_plan && Array.isArray(v.chequeo_del_plan.marcas) ? v.chequeo_del_plan.marcas.length : 0, largo: String(v.texto || '').length }]
for (const x of (Array.isArray(salida.versiones) ? salida.versiones : [])) {
  if (!x || (x.etiqueta !== 'B' && x.etiqueta !== 'C') || typeof x.texto !== 'string' || !x.texto.trim()) continue
  const p = procesar(x.texto)
  procesadas[x.etiqueta] = p
  evaluaciones.push({ etiqueta: x.etiqueta, marcas: p.marcas, largo: p.caracteres })
}
return [{ json: { jef, id_de_a: jef.id_de_a, client_id: jef.client_id, evaluaciones, procesadas } }]
