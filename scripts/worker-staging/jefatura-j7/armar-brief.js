// JEF · armar · BRIEF · J7 · CC#1 · 2026-10-14 · entre «④ Chequeos» y «⑤ ¿Modo seco?» (el chequeo por código va ANTES; el enganche va antes del IF, así que sirve al camino real y al seco).
// El parte entero es UNA revisión (idempotente por `campana:lote:versión`). Solo marca: el brief no recibe corrección (reentrega = ninguna). NO lanza: si algo no cuadra, `abrir = false` y todo sigue como hoy.
const CFG = __CFG__
const jef = { fase: 'no_abre', motivo: '', plazo_fin: Date.now() + CFG.plazo_s * 1000 }
const no = (m) => [{ json: { jef: { ...jef, motivo: m } } }]
let c = null
try { c = $('④ Chequeos').first().json } catch (x) { return no('no hay salida de «④ Chequeos»') }
if (!c || c.llego_la_vuelta !== true || c.parte_valido !== true) return no('el parte no es válido o la vuelta no llegó: no hay nada que revisar')
if (typeof c.dry_run !== 'boolean') return no('dry_run no es booleano: no se abre (ausente no se lee como real)')
const pt = c.fila_parte && c.fila_parte.provenance_tag ? c.fila_parte.provenance_tag : null
if (!pt || typeof pt.lote_key !== 'string' || !pt.lote_key) return no('el parte no trae lote_key')
const texto = String(c.parte_md || '')
if (!texto.trim()) return no('el parte no trae texto')
const txt = (f) => { try { const j = f(); return typeof j === 'string' ? j : '' } catch (x) { return '' } }
const manual = txt(() => $('① GUARDA · sin manual aprobado se DETIENE').first().json.manual_texto)
const plan = txt(() => $('② GUARDA · sin plan se DETIENE').first().json.plan_texto)
let filas = ''
try { filas = JSON.stringify($('⓪ GUARDA · el lote').first().json.filas_lote || []) } catch (x) { filas = '' }
const contexto = []
if (manual.trim()) contexto.push({ titulo: 'Manual de marca vigente', texto: manual, funcion: 'manda si dos documentos se contradicen' })
if (plan.trim()) contexto.push({ titulo: 'Plan vigente', texto: plan, funcion: 'el brief sale de él' })
if (filas.length > 2) contexto.push({ titulo: 'Filas del calendario', texto: filas, funcion: 'las filas que originaron cada brief' })
const marcas = (Array.isArray(c.hallazgos) ? c.hallazgos : []).slice(0, 20).map((h) => String((h && h.chequeo) || 'chequeo') + ': ' + String((h && h.detalle) || '').slice(0, 200))
const sobre = {
  artifact_type: 'brief',
  artifact_id: pt.lote_key,
  client_id: c.client_id,
  journey_id: typeof c._journey_id === 'string' && c._journey_id ? c._journey_id : null,
  payload: {
    texto,
    version: 1,
    dry_run: c.dry_run,
    devolver_a: { tipo: 'ninguno', destino: '' },
    chequeos_previos: { pasaron: c.chequeos_ok === true, necesita_humano: false, marcas },
    contexto,
  },
}
return [{ json: { jef: { ...jef, fase: 'abrir', motivo: '' }, abrir: true, sobre } }]
