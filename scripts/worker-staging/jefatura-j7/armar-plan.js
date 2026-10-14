// JEF · armar · PLAN · J7 · CC#1 · 2026-10-14 · después de «Guardar el plan» (A SIEMPRE se guarda primero y nunca se pierde) y ANTES del PDF a Drive y del «BRIEF · sobre».
// El plan A ya pasó los chequeos por código de hoy (P1–P7, con o sin marcas). NO lanza: si algo no cuadra, `abrir = false` y todo sigue como hoy (A vigente).
// Una versión que produce la jefatura (B, C) NUNCA abre otra revisión: la puerta de la ruta lo impide (409 sin_otra_vuelta) y aquí A es la única que se manda (generado_por_jefatura = null).
const CFG = __CFG__
const jef = { fase: 'no_abre', motivo: '', plazo_fin: Date.now() + CFG.plazo_s * 1000 }
const no = (m) => [{ json: { jef: { ...jef, motivo: m } } }]
let v = null, fila = null, body = {}
try { v = $('¿Llegó la vuelta?').first().json } catch (x) { return no('no hay salida de «¿Llegó la vuelta?»') }
try { const g = $('Guardar el plan').first().json; const gb = g && g.body ? g.body : g; fila = Array.isArray(gb) ? gb[0] : gb } catch (x) { fila = null }
try { body = $('Webhook · planeacion').first().json.body || {} } catch (x) { body = {} }
if (!v || v.llego_la_vuelta !== true || !String(v.texto || '').trim()) return no('el redactor no entregó plan: no hay nada que revisar')
if (!fila || typeof fila.id !== 'string' || !fila.id) return no('el plan A no quedó guardado: sin A no se abre (A se guarda siempre primero)')
if (!fila.provenance_tag || typeof fila.provenance_tag !== 'object' || Array.isArray(fila.provenance_tag) || !Object.keys(fila.provenance_tag).length) return no('la fila de A no devolvió su provenance_tag: no se puede reescribir el rastro completo')
if (!/^[0-9a-fA-F-]{36}$/.test(String(v.client_id || ''))) return no('client_id no es un uuid')
const txt = (f) => { try { const j = f(); return typeof j === 'string' ? j : '' } catch (x) { return '' } }
const manual = txt(() => { const m = $('① Cargar el manual de marca').all().map((i) => i.json).filter((r) => r && r.id)[0]; return m ? m.content_text : '' })
const ficha = txt(() => JSON.stringify($('Ficha del cliente').first().json))
const hechos = txt(() => { const h = $('Unir lo del dueño al paquete').first().json.hechos_del_dueno; return Array.isArray(h) && h.length ? JSON.stringify(h) : '' })
const pedido = txt(() => $('Redactor (B4)').first().json.pedido)
const contexto = []
if (manual.trim()) contexto.push({ titulo: 'Manual de marca vigente', texto: manual, funcion: 'manda si dos documentos se contradicen' })
if (ficha.trim()) contexto.push({ titulo: 'Ficha del cliente', texto: ficha, funcion: 'hechos del negocio' })
if (hechos.trim()) contexto.push({ titulo: 'Lo que dijo el dueño', texto: hechos, funcion: 'correcciones del dueño; mandan sobre la investigación' })
const marcas = (v.chequeo_del_plan && Array.isArray(v.chequeo_del_plan.marcas) ? v.chequeo_del_plan.marcas : []).slice(0, 20).map((m) => String((m && m.que) || m || ''))
const sobre = {
  artifact_type: 'plan',
  artifact_id: fila.id,
  client_id: String(v.client_id),
  journey_id: typeof body._journey_id === 'string' && body._journey_id ? body._journey_id : null,
  payload: {
    texto: String(v.texto),
    version: 1,
    dry_run: body.dry_run === true,
    devolver_a: { tipo: 'ninguno', destino: '' },
    chequeos_previos: { pasaron: v.con_pendientes !== true, necesita_humano: false, marcas },
    contexto,
    ...(pedido.trim() ? { pedido_del_plan: pedido } : {}),
    generado_por_jefatura: null,
  },
}
return [{ json: { jef: { ...jef, fase: 'abrir', motivo: '', id_de_a: fila.id, client_id: String(v.client_id) }, abrir: true, sobre } }]
