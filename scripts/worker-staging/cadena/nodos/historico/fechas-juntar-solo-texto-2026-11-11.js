// ② JUNTAR LAS PÁGINAS · el CÓDIGO descargó las páginas (nodo HTTP); aquí solo se limpian a texto. El agente NUNCA navega: lee lo que el código bajó.
// 🔴 11-nov · CC3 · arreglo genérico de CC7 (RESPUESTA 10-nov «fuentes oficiales de Ecuador»): SOLO cuenta como página una respuesta de TEXTO que, ya limpia,
// tenga texto legible. Un PDF, una imagen o una página vacía se DESCARTAN con su razón: si no queda ninguna, `preparar` responde «sin fuente» SIN llamar al agente
// (antes, un PDF bajado «como texto» contaba como página, se llamaba al agente, ninguna cita aparecía literal y se gastaban 3 intentos para nada). Vale para cualquier país.
const filas = $('① ¿Qué dijo?').all()
const respuestas = $input.all()
const aTexto = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
// umbrales FIJOS (no dependen del país ni del tipo de fecha): una frase corta con su fecha ya alcanza; la basura binaria SIN tipo no llega a la proporción de letras
const MINIMO_DE_CARACTERES = 30
const MINIMO_DE_LETRAS = 0.6
const MAXIMO_DE_ROTOS = 0.05
const TIPOS_DE_TEXTO = /^(text\/html|text\/plain|application\/xhtml\+xml)\b/i
const tipoDe = (h) => { if (!h || typeof h !== 'object') return ''; const k = Object.keys(h).find((x) => x.toLowerCase() === 'content-type'); return k ? String(h[k] || '').trim() : '' }
function razonParaDescartar(texto, tipo) {
  if (tipo && !TIPOS_DE_TEXTO.test(tipo)) return 'no es texto (' + tipo.split(';')[0].trim() + ')'
  if (texto.length < MINIMO_DE_CARACTERES) return 'sin texto legible (' + texto.length + ' caracteres)'
  const visibles = texto.replace(/\s/g, '')
  if (/[\u0000-\u0008\u000E-\u001F]/.test(visibles)) return 'sin texto legible (trae caracteres de control: parece un archivo binario)'
  // el car\u00E1cter roto (U+FFFD) descarta solo si son MUCHOS: una p\u00E1gina oficial en latin-1 le\u00EDda como UTF-8 trae uno en cada \u00F1 o tilde y sus fechas se leen igual
  // (CC7, 11-nov); un binario mal declarado como texto sale lleno de ellos. Vale con y sin tipo declarado.
  const rotos = (visibles.match(/\uFFFD/g) || []).length
  if (rotos / visibles.length > MAXIMO_DE_ROTOS) return 'sin texto legible (' + Math.round((100 * rotos) / visibles.length) + ' % de caracteres rotos: parece un archivo binario)'
  // la proporci\u00F3n de letras decide SOLO si la respuesta no dice qu\u00E9 es: una tabla oficial de feriados (\u00AB01/01/2026 A\u00F1o Nuevo\u2026\u00BB) declarada como texto
  // tiene muchos n\u00FAmeros y es justo la fuente buena (CC7, 11-nov: medida en 59 % de letras); sin tipo, la proporci\u00F3n reconoce un archivo binario
  if (tipo) return null
  const letras = (visibles.match(/\p{L}/gu) || []).length
  if (letras / visibles.length < MINIMO_DE_LETRAS) return 'sin texto legible (' + Math.round((100 * letras) / visibles.length) + ' % de letras: parece un archivo binario)'
  return null
}
const paginas = []
const descartadas = []
respuestas.forEach((r, i) => {
  const j = r.json || {}
  const url = filas[i] && filas[i].json ? filas[i].json.dominio : null
  const cuerpo = typeof j.body === 'string' ? j.body : ''
  if (!url || !(Number(j.statusCode) >= 200 && Number(j.statusCode) < 300) || !cuerpo) return
  const texto = aTexto(cuerpo)
  const razon = razonParaDescartar(texto, tipoDe(j.headers))
  if (razon) descartadas.push({ url, razon })
  else paginas.push({ url, texto: texto.slice(0, 60000) })
})
const s = filas[0].json
return [{ json: { ...s, paginas, paginas_descartadas: descartadas } }]
