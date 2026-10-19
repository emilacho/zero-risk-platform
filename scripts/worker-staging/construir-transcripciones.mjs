// Videos sin subtítulos (19-oct) · el Servicio de Apify lee la TRANSCRIPCIÓN que Apify deja FUERA del resultado.
// Con `transcriptionAndSubtitle: TRANSCRIPTION_AS_FALLBACK`, un video sin subtítulos se transcribe y el texto queda en el almacén de Apify (`transcriptionUrl`), no en `subtitles`.
// Medido 19-oct con un video real: el elemento trae `subtitles: null` y `transcriptionUrl` (pide la llave de Apify: sin ella responde 403); la transcripción de un spot sin voz mide 0 bytes.
// Cambio, aditivo y sin nada a la medida de un cliente o de un video:
//   1 · un nodo «Leer transcripciones» entre «Merge · apify data ready» y sus dos lectores (el redactor de secciones y «Guardar lo crudo»): por cada elemento con `transcriptionUrl` y sin subtítulos
//       pide el texto (solo a api.apify.com, con la llave del entorno) y lo deja en `transcription`; marca `transcripcion_leida` o `transcripcion_error`;
//   2 · el redactor rotula lo que no hay: «SIN voz (…)» si se leyó y vino vacío o sin voz real; «SIN transcripción (no se pudo leer: …)» si falló la lectura.
import { cambiar } from './construir-fuentes-publicas.mjs'

export const NODO_NUEVO = 'Leer transcripciones'
export const MAXIMO_DE_LECTURAS = 25
export const LARGO_MAXIMO = 60000

export const CODIGO_DE_LEER_TRANSCRIPCIONES = String.raw`// TRANSCRIPCIONES (19-oct) · un video sin subtítulos que Apify transcribió deja el texto en su almacén (transcriptionUrl); aquí se lee y se pone en «transcription».
const items = $input.all();
const salida = [];
let lecturas = 0;
for (const it of items) {
  const j = (it && it.json) || {};
  const url = typeof j.transcriptionUrl === 'string' ? j.transcriptionUrl : '';
  const conSubtitulos = Array.isArray(j.subtitles) ? j.subtitles.length > 0 : !!j.subtitles;
  if (!url || conSubtitulos || url.indexOf('https://api.apify.com/') !== 0 || lecturas >= ${MAXIMO_DE_LECTURAS}) { salida.push(it); continue; }
  lecturas++;
  try {
    const r = await this.helpers.httpRequest({ method: 'GET', url: url, headers: { Authorization: 'Bearer ' + $env.APIFY_API_TOKEN }, json: false, timeout: 30000 });
    const texto = typeof r === 'string' ? r : (r && typeof r === 'object' && !Array.isArray(r) && typeof r.text === 'string' ? r.text : (r == null ? '' : String(r)));
    salida.push({ json: Object.assign({}, j, { transcription: texto.trim().slice(0, ${LARGO_MAXIMO}), transcripcion_leida: true }) });
  } catch (e) {
    salida.push({ json: Object.assign({}, j, { transcripcion_error: String((e && e.message) || e).slice(0, 160) }) });
  }
}
return salida;`

const ANTES_SIN_TRANSCRIPCION = "(transCruda ? 'SIN voz (' + voz.motivo + ')' : 'SIN transcripción')"
const DESPUES_SIN_TRANSCRIPCION = "(transCruda ? 'SIN voz (' + voz.motivo + ')' : (it.transcripcion_error ? 'SIN transcripción (no se pudo leer: ' + it.transcripcion_error + ')' : (it.transcripcion_leida ? 'SIN voz (Apify transcribió el video y no encontró voz)' : 'SIN transcripción')))"

/** el flujo del Servicio (objeto de la API) con el nodo nuevo y el rótulo; no toca otra cosa. Idempotente: si ya está, lo deja igual. */
export function servicioConTranscripciones(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  if (f.nodes.some((n) => n.name === NODO_NUEVO)) return f
  const merge = f.nodes.find((n) => n.name === 'Merge · apify data ready')
  if (!merge) throw new Error('no está «Merge · apify data ready»')
  const sig = f.connections['Merge · apify data ready']?.main?.[0]
  const nombres = (sig ?? []).map((c) => c.node).sort().join('|')
  if (nombres !== ['Guardar lo crudo', 'transform-sections'].sort().join('|')) throw new Error('«Merge · apify data ready» ya no alimenta solo a transform-sections y Guardar lo crudo: ' + nombres)
  f.nodes.push({ parameters: { jsCode: CODIGO_DE_LEER_TRANSCRIPCIONES }, id: 'a3f5c2d1-7b4e-4c9a-9d21-5e6f7a8b9c10', name: NODO_NUEVO, type: 'n8n-nodes-base.code', typeVersion: 2, position: [merge.position[0] + 224, merge.position[1] - 160] })
  f.connections['Merge · apify data ready'].main[0] = [{ node: NODO_NUEVO, type: 'main', index: 0 }]
  f.connections[NODO_NUEVO] = { main: [sig] }
  const t = f.nodes.find((n) => n.name === 'transform-sections')
  const crlf = t.parameters.jsCode.includes('\r\n')
  const cuerpo = crlf ? t.parameters.jsCode.split('\r\n').join('\n') : t.parameters.jsCode
  const nuevo = cambiar(cuerpo, ANTES_SIN_TRANSCRIPCION, DESPUES_SIN_TRANSCRIPCION, 'rótulo de transcripción')
  t.parameters.jsCode = crlf ? nuevo.split('\n').join('\r\n') : nuevo
  return f
}
