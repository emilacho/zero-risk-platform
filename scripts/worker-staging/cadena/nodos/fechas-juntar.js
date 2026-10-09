// ② JUNTAR LAS PÁGINAS · el CÓDIGO descargó las páginas (nodo HTTP); aquí solo se limpian a texto. El agente NUNCA navega: lee lo que el código bajó.
const filas = $('① ¿Qué dijo?').all()
const respuestas = $input.all()
const aTexto = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const paginas = []
respuestas.forEach((r, i) => {
  const j = r.json || {}
  const url = filas[i] && filas[i].json ? filas[i].json.dominio : null
  const cuerpo = typeof j.body === 'string' ? j.body : ''
  if (url && Number(j.statusCode) >= 200 && Number(j.statusCode) < 300 && cuerpo) paginas.push({ url, texto: aTexto(cuerpo).slice(0, 60000) })
})
const s = filas[0].json
return [{ json: { ...s, paginas } }]
