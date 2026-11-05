/**
 * 05-nov · decisión de Lenovo sobre #928: si un analista de la mesa falla también en su reintento, el plan declara que no hubo ese informe y por qué. Flujo `X9F0zp6LQ2xGEYVS`, nodo «¿Llegó la vuelta?».
 * El redactor ya recibe el hueco en su bloque «NO SE PUDO VERIFICAR», pero que lo escriba depende de él. Esta sección la escribe EL SISTEMA, al final del texto que se guarda, se sube a Drive y lee el brief.
 * Va en lenguaje llano y sin detalles técnicos: el motivo completo queda en la salida de la rama de análisis.
 * NO se declara: un ensayo, ni la mesa apagada para ese cliente cuando corre el paso 0 de mercado (no es una falta). Todo lo demás que no contestó sí: por omisión se dice, no se calla.
 * Reparos de CC6: si el disparo quitó el paso 0 (`con_mercado: false`) y la mesa estaba apagada al correr, no hubo ni uno ni otro: se declara. Y al volver de una pausa la mesa no corre: se lee del material guardado.
 * Reparos de CC7: (1) la corrección de la jefatura reescribe el plan con un modelo y esa versión queda vigente: la sección se vuelve a pegar en cada versión que se guarda, sin duplicarla; (2) al cliente solo le llega el motivo llano: todo lo que no sea «no hubo informe…» sale con una frase general.
 * Si nadie pidió análisis, no sale ninguna sección. No limita a ningún agente: solo informa.
 */
import { cambiarCodigo } from './lib.mjs'

const VIEJO = "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + '\\n' : textoDelRedactor;"

export const CODIGO_INFORMES_QUE_NO_LLEGARON = `// 05-nov · lo que la mesa de análisis no entregó lo declara el sistema, no depende de que el redactor lo recuerde
let itemsDeLaMesa = [];
try { itemsDeLaMesa = $('firma de la rama · analisis').all().map((i) => i.json || {}); } catch (x) { itemsDeLaMesa = []; }
if (!itemsDeLaMesa.length) {
  try { const guardado = $('Reanudar · poner el material guardado').first().json.material; itemsDeLaMesa = Array.isArray(guardado) ? guardado.filter((m) => m && m.brazo === 'analisis') : []; } catch (x) { itemsDeLaMesa = []; }
}
let sinPasoCeroDeMercado = false;
try { sinPasoCeroDeMercado = $('Webhook · planeacion').first().json.body.con_mercado === false; } catch (x) { sinPasoCeroDeMercado = false; }
const mesaApagada = (j) => /la mesa está (apagada|encendida pero)/.test(String(j.motivo || ''));
const informesQueNoLlegaron = itemsDeLaMesa.filter((j) => {
  if (j.error !== undefined && j.error !== null) return true;
  if (j.estado !== 'sin_respuesta' || /fue un ensayo/.test(String(j.motivo || ''))) return false;
  return !mesaApagada(j) || sinPasoCeroDeMercado;
});
const bloqueInformesQueNoLlegaron = informesQueNoLlegaron.length
  ? '\\n## Informes de análisis que no llegaron\\n' + informesQueNoLlegaron.map((j) => '- ' + String(j.objetivo || 'un informe de análisis').split('_').join(' ') + ' — ' + (j.error !== undefined && j.error !== null ? 'la mesa de análisis no contestó' : mesaApagada(j) ? 'la mesa de análisis estaba apagada cuando le tocó correr' : (/^no hubo informe/.test(String(j.motivo || '')) ? String(j.motivo).split(' · ')[0] : 'no se pudo preparar este informe'))).join('\\n') + '\\n'
  : '';
`

const NUEVO = CODIGO_INFORMES_QUE_NO_LLEGARON + "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + '\\n' + bloqueInformesQueNoLlegaron : textoDelRedactor;"

const VIEJO_SALIDA = "  llego_la_vuelta: llego,\n  texto: texto,"
const NUEVO_SALIDA = "  llego_la_vuelta: llego,\n  bloque_informes_que_no_llegaron: llego ? bloqueInformesQueNoLlegaron : '',\n  texto: texto,"

// De aquí sale lo que se guarda (`armar B/C`) y lo que sigue por la cadena (`Plan vigente` → PDF y brief): es el único punto antes de los dos.
export const CODIGO_REPONER_INFORMES = `// 05-nov · reparo de CC7: la versión corregida la reescribe un modelo: la sección de informes que no llegaron se vuelve a pegar aquí, una sola vez. Sin sección, nada cambia.
let bloqueDeInformes = ''
try { bloqueDeInformes = String($('¿Llegó la vuelta?').first().json.bloque_informes_que_no_llegaron || '') } catch (x) { bloqueDeInformes = '' }
const reponerInformes = (t) => {
  if (!bloqueDeInformes || typeof t !== 'string' || !t.trim()) return t
  // solo el título (la línea entera es el título) y la lista pegada a él: lo demás es del plan y se queda, aunque a lo sumo algo se lea dos veces
  const esTitulo = (l) => /^(?:#{1,6}\\s*\\**\\s*|\\*\\*\\s*)Informes de análisis que no llegaron\\**\\s*:?\\s*(?:\\([^)]*\\))?\\s*:?\\s*\\**\\s*$/iu.test(l)
  const esDeLista = (l) => /^\\s*(?:[-*+•]|\\d+[.)])\\s/u.test(l)
  const lineas = t.split('\\n')
  const quedan = []
  for (let i = 0; i < lineas.length; i++) {
    if (!esTitulo(lineas[i])) { quedan.push(lineas[i]); continue }
    let j = i + 1
    while (j < lineas.length && !lineas[j].trim()) j++
    if (j < lineas.length && esDeLista(lineas[j])) {
      while (j < lineas.length && esDeLista(lineas[j])) j++
      i = j - 1
    }
  }
  return quedan.join('\\n').replace(/\\s+$/, '') + '\\n' + bloqueDeInformes
}
const procesadasConInformes = {}
for (const k of Object.keys(ev.procesadas || {})) {
  const p = ev.procesadas[k]
  const conSeccion = p && typeof p === 'object' ? reponerInformes(p.texto) : null
  procesadasConInformes[k] = typeof conSeccion === 'string' ? { ...p, texto: conSeccion, caracteres: conSeccion.length } : p
}
const textosConInformes = (o) => { const s = {}; for (const k of Object.keys(o)) s[k] = reponerInformes(o[k]); return s }
`

const VIEJO_GUARDADO = 'return [{ json: { jef: ev.jef, id_de_a: ev.id_de_a, client_id: ev.client_id, procesadas: ev.procesadas,'
const NUEVO_GUARDADO = CODIGO_REPONER_INFORMES + 'return [{ json: { jef: ev.jef, id_de_a: ev.id_de_a, client_id: ev.client_id, procesadas: procesadasConInformes,'
const VIEJO_TEXTOS = "!Array.isArray(b.textos_a_guardar) ? b.textos_a_guardar : {} } }]"
const NUEVO_TEXTOS = "!Array.isArray(b.textos_a_guardar) ? textosConInformes(b.textos_a_guardar) : {} } }]"

// 05-nov · decisión de Lenovo: el PDF sale de `jef_vigente.texto`, y ese texto no llevaba «Qué cambió» (la fila guardada sí).
// Ahora `Plan vigente` toma el mismo texto que `armar B/C` guarda: el de la plataforma si lo devolvió, y si no, el de hoy. Sin versión nueva, nada cambia.
const VIEJO_VIGENTE = 'return [{ json: { ...ultima, jef_vigente: { texto: p.texto, caracteres: p.caracteres,'
const NUEVO_VIGENTE = "// 05-nov · el PDF lleva el mismo texto que se guardó: con «Qué cambió» y la sección de informes que no llegaron\n"
  + "const _txv = est.textos_a_guardar && typeof est.textos_a_guardar[etiqueta] === 'string' && est.textos_a_guardar[etiqueta].trim() ? est.textos_a_guardar[etiqueta] : null\n"
  + 'return [{ json: { ...ultima, jef_vigente: { texto: _txv || p.texto, caracteres: _txv ? _txv.length : p.caracteres,'

export function construirPlanInformesQueNoLlegaron(f) {
  cambiarCodigo(f, '¿Llegó la vuelta?', VIEJO, NUEVO)
  cambiarCodigo(f, '¿Llegó la vuelta?', VIEJO_SALIDA, NUEVO_SALIDA)
  cambiarCodigo(f, 'JEF · plan · el plan de guardado', VIEJO_GUARDADO, NUEVO_GUARDADO)
  cambiarCodigo(f, 'JEF · plan · el plan de guardado', VIEJO_TEXTOS, NUEVO_TEXTOS)
  cambiarCodigo(f, 'Plan vigente', VIEJO_VIGENTE, NUEVO_VIGENTE)
}
