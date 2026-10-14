// JEF · armar · ESTRATEGIA / CALENDARIO · J7 · CC#1 · 2026-10-14 · en el sub-flujo, entre «④ ¿Termina?» (terminó bien o necesita humano) y «⑤ Salida».
// CONDICIÓN 4 (mecanismo de espera «antes de pasar de paso»): el sub-flujo NO termina hasta que la revisión cierre o se acabe el plazo, y la puerta de la cadena solo sigue con el paso siguiente cuando
// el sub-flujo devuelve su salida; así la estrategia no la lee el calendario ni el calendario llega a producción mientras se revisa. Solo se revisa lo que terminó BIEN (resultado ok):
// con `necesita_humano` o `ya_hecha` no se abre (regla 8: la cadena ya está detenida y la jefatura no lo pasa por encima).
// NO lanza: si algo no cuadra, `abrir = false` y todo sigue como hoy. La ENTREGA de la corrección no se aplica aquí (ver el papel: hace falta `guardar_revisada` antes de activar este tipo).
const CFG = __CFG__
const s = $input.first().json || {}
const jef = { fase: 'no_abre', motivo: '', plazo_fin: Date.now() + CFG.plazo_s * 1000 }
const no = (m) => [{ json: { jef: { ...jef, motivo: m }, orig: s } }]
if (s.resultado !== 'ok') return no('el paso no terminó bien (' + String(s.resultado) + '): no hay nada nuevo que revisar')
if (typeof s.seco !== 'boolean') return no('seco no es booleano: no se abre')
// 🔴 Hasta que exista `guardar_revisada` la corrección de la jefatura NO se aplica (se pagaría y no se usaría): en REAL este tipo no abre aunque esté en `tipos_activos`; el seco sí (US$ 0: sirve para probar la espera).
if (CFG.correccion_aplicable !== true && s.seco !== true) return no('la corrección de la jefatura todavía no se puede aplicar (falta `guardar_revisada`): en real no se abre; el seco sí')
let salida = null, run = null
try { salida = $('③ Armar guardar').last().json.guardar.resultado.structured_output } catch (x) { return no('no hay salida de «③ Armar guardar»') }
try { run = $('① ¿Qué dijo?').last().json.run_sdk } catch (x) { return no('no hay pedido de «① ¿Qué dijo?»') }
if (!salida || typeof salida !== 'object') return no('el empleado no entregó un objeto')
if (!run || typeof run.client_id !== 'string' || !run.client_id) return no('el pedido no trae client_id')
if (typeof s.campana_id !== 'string' || !s.campana_id) return no('falta campana_id')
const d = s.detalle && typeof s.detalle === 'object' ? s.detalle : {}
const corrida = s.corrida_id !== undefined && s.corrida_id !== null ? 'c' + String(s.corrida_id) : null
if (!corrida) return no('falta corrida_id')
const artifact_id = CFG.tipo === 'calendario' ? s.campana_id + ':calendario:t' + String(s.tanda ?? 1) + ':' + corrida : s.campana_id + ':estrategia:' + corrida
const contexto = []
if (typeof run.task === 'string' && run.task.trim()) contexto.push({ titulo: CFG.titulo_del_pedido, texto: run.task, funcion: 'el pedido que recibió el empleado: trae el manual, el plan y lo que debía cumplir' })
const avisos = Array.isArray(d.avisos) ? d.avisos.map((a) => String(a)).slice(0, 20) : []
const sobre = {
  artifact_type: CFG.tipo,
  artifact_id,
  client_id: run.client_id,
  journey_id: null,
  payload: {
    texto: JSON.stringify(salida),
    version: CFG.tipo === 'estrategia' && Number.isInteger(d.version) && d.version >= 1 ? d.version : 1,
    dry_run: s.seco,
    devolver_a: { tipo: 'ninguno', destino: '' },
    chequeos_previos: { pasaron: true, necesita_humano: false, marcas: avisos },
    contexto,
  },
}
return [{ json: { jef: { ...jef, fase: 'abrir', motivo: '' }, abrir: true, sobre, orig: s } }]
