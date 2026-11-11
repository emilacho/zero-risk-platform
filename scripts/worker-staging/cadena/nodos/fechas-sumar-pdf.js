// ② SUMAR LOS PDF · 11-nov · opción b de Lenovo (19:30): lo que `leer_pdf` sacó de cada PDF oficial entra como una página MÁS (con el mismo chequeo de texto legible de «② Juntar»);
// lo que no se pudo leer queda descartado con su razón NUEVA (escaneado, protegido, fuera de la lista…). Si la lectura misma falló, todo sigue como estaba y se dice.
const s = $('② Juntar las páginas').first().json
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
const leidas = Number(r.statusCode) === 200 && Array.isArray(b.paginas) ? b.paginas.filter((p) => p && typeof p.url === 'string' && typeof p.texto === 'string' && p.texto.trim().length >= 30) : []
const nuevas = Number(r.statusCode) === 200 && Array.isArray(b.descartadas) ? b.descartadas.filter((d) => d && typeof d.url === 'string' && typeof d.razon === 'string') : []
const tocadas = new Set([...leidas.map((p) => p.url), ...nuevas.map((d) => d.url)])
const fallo = Number(r.statusCode) === 200 ? [] : (s.pdfs_por_leer || []).map((url) => ({ url, razon: 'no es texto (application/pdf) y la lectura del PDF falló (' + String(b.code || b.error || r.statusCode || 'sin respuesta') + ')' }))
const descartadas = [...(s.paginas_descartadas || []).filter((d) => !tocadas.has(d.url) && !fallo.some((f) => f.url === d.url)), ...nuevas, ...fallo]
return [{ json: { ...s, paginas: [...(s.paginas || []), ...leidas.map((p) => ({ url: p.url, texto: p.texto.slice(0, 60000) }))], paginas_descartadas: descartadas } }]
