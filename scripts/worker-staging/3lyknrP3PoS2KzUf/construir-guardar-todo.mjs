// «Guardar todo» en el Servicio de Apify (3lyknrP3PoS2KzUf) · CC-CEREBRO · 2026-10-31 · firma de Emilio «todo es todo» (VISTO BUENO DE CEREBRO).
// Cambia SOLO código y ajustes de nodos existentes (no agrega nodos ni toca conexiones):
//   · «Armar el cuerpo del raspador» → sitio propio hasta 200 páginas, competidor hasta 50, profundidad, mapa del sitio, HTML crudo (para sacar imágenes) y captura por página;
//   · «apify-web» → espera hasta 290 s (el límite de la llamada síncrona de Apify es 300 s);
//   · «Guardar la página» → el texto de todas las páginas cabe hasta 1.000.000 de caracteres (antes 200.000);
//   · «Guardar lo crudo» → las webs dejan en lo crudo sus enlaces a documentos y videos (`_enlaces`) en vez del HTML, y el límite de lo crudo sube a 5 MB para webs;
//   · «Fotos · lista» y «Fotos · revisar» → todas las imágenes de cada página + capturas (lógica `fotosDeSitio` de fotos-contexto-logica.js).
//   node construir-guardar-todo.mjs <flujo-vivo.json> [salida.json]   → NO toca n8n
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codigoDeNodo } from './construir-contexto-fotos.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
export const LIGERO = fs.readFileSync(join(aqui, 'crudo-ligero.js'), 'utf8').trim()

const CAP_PROPIO = 200
const CAP_COMPETIDOR = 50
const EXTRAS = "useSitemaps: true, saveHtml: true, saveScreenshots: true, htmlTransformer: 'none'"

function cambiar(texto, de, a, que) {
  if (!texto.includes(de)) throw new Error('no se halló el ancla: ' + que)
  return texto.replace(de, a)
}

export function aplicarGuardarTodo(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo «' + n + '»'); return x }

  // 1 · el cuerpo del raspador
  const armar = nodo('Armar el cuerpo del raspador')
  let c = armar.parameters.jsCode
  const hay = c.match(/maxCrawlPages: Math\.min\(Number\(\$json\.params\.maxCrawlPages\) \|\| 10, 25\)/g) || []
  if (hay.length !== 2) throw new Error('se esperaban 2 topes de 25 páginas y hay ' + hay.length)
  const reemplazo = (cap) => `maxCrawlPages: Math.min(Number($json.params.maxCrawlPages) || 10, ${cap}), maxCrawlDepth: Math.min(Number($json.params.maxCrawlDepth) || 10, 20), ${EXTRAS}`
  c = cambiar(c, "website_content_scraper: ($json) => ({", "website_content_scraper: ($json) => ({", 'website_content_scraper')
  // el primero es el sitio propio; el segundo, el de competidor (en ese orden en el código)
  let n = 0
  c = c.replace(/maxCrawlPages: Math\.min\(Number\(\$json\.params\.maxCrawlPages\) \|\| 10, 25\)/g, () => reemplazo(n++ === 0 ? CAP_PROPIO : CAP_COMPETIDOR))
  const iPropio = c.indexOf('website_content_scraper: ($json)')
  const iComp = c.indexOf('competitor_website_scraper: ($json)')
  if (iPropio < 0 || iComp < 0 || iPropio > iComp) throw new Error('el orden de los dos cuerpos cambió: revisar a mano')
  if (c.indexOf(`, ${CAP_PROPIO}), maxCrawlDepth`) > iComp || c.indexOf(`, ${CAP_COMPETIDOR}), maxCrawlDepth`) < iComp) throw new Error('los topes no cayeron en su función')
  // las fotos de Mapas de los COMPETIDORES (hoy solo la portada): `maxImages` pasa al actor si la llamada lo pide (tope 20). La ficha propia no: puede ser un homónimo y la elige el portero.
  const ancla = "($json.params.customGeolocation), maxCrawledPlacesPerSearch: $json.params.resultsLimit || 10, language: $json.params.language || 'es' })"
  if (!c.includes(ancla)) throw new Error('no se halló el cuerpo de google_maps_scraper')
  c = c.replace(ancla, "($json.params.customGeolocation), maxCrawledPlacesPerSearch: $json.params.resultsLimit || 10, language: $json.params.language || 'es', ...(Number($json.params.maxImages) > 0 ? { maxImages: Math.min(Number($json.params.maxImages), 20) } : {}) })")
  armar.parameters.jsCode = c

  // 2 · espera de la llamada
  const web = nodo('apify-web')
  web.parameters.url = cambiar(web.parameters.url, '?timeout=240', '?timeout=290', 'timeout=240 de apify-web')
  web.parameters.options = { ...web.parameters.options, timeout: 295000 }

  // 3 · el texto de todas las páginas
  const guardar = nodo('Guardar la página')
  guardar.parameters.jsonBody = cambiar(guardar.parameters.jsonBody, '.slice(0, 200000)', '.slice(0, 1000000)', 'tope de texto de la página')

  // 4 · lo crudo
  const crudo = nodo('Guardar lo crudo')
  let b = crudo.parameters.jsonBody
  if (b.includes('const ligero')) throw new Error('lo crudo ya tiene el aligerado')
  if (LIGERO.includes('}}')) throw new Error('el aligerado trae «}}» y cerraría la expresión')
  const a1 = 'const items0 = $items().map(i => i.json); '
  b = cambiar(b, a1, a1 + LIGERO + ' ', 'items0')
  b = cambiar(b, ': items0; const texto = JSON.stringify(items);', ': (web ? items0.map(ligero) : items0); const texto = JSON.stringify(items);', 'items0 → texto')
  b = b.replace(/texto\.length > 200000/g, 'texto.length > limite').replace(/texto\.slice\(0, 200000\)/g, 'texto.slice(0, limite)')
  if (/200000/.test(b.replace(LIGERO, ''))) throw new Error('quedó un 200000 en lo crudo')
  crudo.parameters.jsonBody = b

  // 5 · las fotos
  for (const [clave, nombre] of [['lista', 'Fotos · lista'], ['revisar', 'Fotos · revisar']]) {
    const x = nodo(nombre)
    const nuevo = codigoDeNodo(clave)
    x.parameters = { ...x.parameters, jsCode: x.parameters.jsCode.includes('\r\n') ? nuevo.replace(/\r?\n/g, '\r\n') : nuevo }
  }
  if (!nodo('Fotos · lista').parameters.jsCode.includes('fotosDeSitio(')) throw new Error('«Fotos · lista» no usa fotosDeSitio')
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-guardar-todo.mjs')) {
  const [entrada, salida] = process.argv.slice(2)
  if (!entrada) { console.error('uso: node construir-guardar-todo.mjs <flujo-vivo.json> [salida.json]'); process.exit(2) }
  const nuevo = aplicarGuardarTodo(JSON.parse(fs.readFileSync(entrada, 'utf8')))
  const out = salida || join(aqui, 'servicio-apify-ARREGLADO-guardar-todo-2026-10-31.json')
  fs.writeFileSync(out, JSON.stringify(nuevo, null, 2))
  console.log('escrito', out)
}
