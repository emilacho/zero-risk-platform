// MENCIONES DE TERCEROS · suma la función `menciones_en_redes` al Servicio de Apify (`3lyknrP3PoS2KzUf`) desde un respaldo FRESCO. ADITIVO: ninguna función existente cambia.
// Actor: `apify~instagram-tagged-scraper` (publicaciones de OTRAS cuentas que etiquetan o mencionan al negocio). Entrada real: `username` (lista) y `resultsLimit`; precio US$ 0,0027 por publicación.
// Reutiliza la ruta «fuentes_publicas» (un solo nodo HTTP con `actor_id`): solo se amplía su lista de prefijos. Agnóstico: ningún cliente, lugar ni rubro.
//   node scripts/worker-staging/construir-menciones.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
const DIR = RAIZ + 'scripts/worker-staging/3lyknrP3PoS2KzUf/'
export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}
export const FUNCION = 'menciones_en_redes'
export const ACTOR = 'apify~instagram-tagged-scraper'

const NODOS = ['Validate Body', 'Validar params · contrato', 'Validar el cuerpo contra el esquema', 'Armar el cuerpo del raspador', 'transform-sections', 'Switch · apify_function', 'Guardar lo crudo']

export function servicioConMenciones(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const por = (n) => { const x = f.nodes.filter((m) => m.name === n); if (x.length !== 1) throw new Error(`${x.length} nodos «${n}»`); return x[0] }
  if (JSON.stringify(f).includes(`"${FUNCION}"`) || JSON.stringify(f).includes(`'${FUNCION}'`)) throw new Error('la función ya existe en el Servicio')

  const vb = por('Validate Body')
  vb.parameters.jsCode = conFinDeLinea(vb.parameters.jsCode, (c) => cambiar(c, "    'videos_youtube',\n  ]);", `    'videos_youtube',\n    // MENCIONES DE TERCEROS (14-oct) · publicaciones de OTRAS cuentas que etiquetan al negocio\n    '${FUNCION}',\n  ]);`, 'permitidas'))

  const ct = por('Validar params · contrato')
  ct.parameters.jsCode = conFinDeLinea(ct.parameters.jsCode, (c) => cambiar(c,
    '  videos_youtube: () => tiene("startUrls") ? null : "falta uno de · startUrls (la dirección o el usuario PÚBLICO del propio negocio · no se inventa)",\n',
    '  videos_youtube: () => tiene("startUrls") ? null : "falta uno de · startUrls (la dirección o el usuario PÚBLICO del propio negocio · no se inventa)",\n' +
      `  ${FUNCION}: () => tiene("username","usernames") ? null : "falta uno de · username | usernames (la cuenta PÚBLICA del propio negocio · no se inventa)",\n`, 'contrato'))

  const es = por('Validar el cuerpo contra el esquema')
  es.parameters.jsCode = conFinDeLinea(es.parameters.jsCode, (c) => cambiar(c, 'const ESQUEMAS = {',
    `const ESQUEMAS = {${JSON.stringify(FUNCION)}:${JSON.stringify({ acepta: ['username', 'usernames', 'resultsLimit'], obligatorios: [] })},`, 'esquemas'))

  const ar = por('Armar el cuerpo del raspador')
  ar.parameters.jsCode = conFinDeLinea(ar.parameters.jsCode, (c) => {
    const i = c.indexOf('const ACTOR_NUEVO = ')
    if (i < 0) throw new Error('no hay ACTOR_NUEVO')
    const fin = c.indexOf(';\n', i) + 2
    c = c.slice(0, fin) + `ACTOR_NUEVO[${JSON.stringify(FUNCION)}] = ${JSON.stringify(ACTOR)};\n` + c.slice(fin)
    return cambiar(c, 'const CONSTRUCTORES = {\n',
      "const CONSTRUCTORES = {\n  // MENCIONES DE TERCEROS (14-oct) · el actor pide SOLO `username` (lista) y `resultsLimit`; el tope es de 50 publicaciones por cuenta (US$ 0,0027 cada una)\n" +
      `  ${FUNCION}: ($json) => ({ username: [].concat($json.params.username || $json.params.usernames || []).map((s) => String(s).trim().replace(/^@/, '')).filter(Boolean), resultsLimit: Math.min(Number($json.params.resultsLimit) || 30, 50) }),\n`, 'constructores')
  })

  const ts = por('transform-sections')
  ts.parameters.jsCode = conFinDeLinea(ts.parameters.jsCode, (c) => {
    c = cambiar(c, 'const ES_FUENTE_PUBLICA = /^(resenas_|publicaciones_|videos_)/.test(apifyFunction);', 'const ES_FUENTE_PUBLICA = /^(resenas_|publicaciones_|videos_|menciones_)/.test(apifyFunction);', 'es_fuente')
    c = cambiar(c, "    } else if (fn === 'publicaciones_facebook') {",
      "    } else if (fn === 'menciones_en_redes') {\n" +
      "      // publicación de OTRA cuenta que etiqueta o menciona al negocio: fecha · pie · dirección; SIN el nombre de quien la publicó (dato de un tercero)\n" +
      "      const pie = primeroTexto(it, ['caption', 'text']);\n" +
      "      if (!pie) return;\n" +
      "      const dir = primeroTexto(it, ['url']);\n" +
      "      out.push('mención · ' + String(primeroTexto(it, ['timestamp', 'takenAtTimestamp', 'date'])).slice(0, 10) + ' · «' + aplanar(pie) + '»' + (dir ? ' · ' + dir : ''));\n" +
      "    } else if (fn === 'publicaciones_facebook') {", 'rama')
    return cambiar(c, "'videos_youtube'].map((f) => [f, 'client_voc_library'])", "'videos_youtube', 'menciones_en_redes'].map((f) => [f, 'client_voc_library'])", 'origen')
  })

  // «Guardar lo crudo»: cada publicación trae ~15 KB de direcciones de imágenes; 23 publicaciones pasaban los 200 KB y se guardaba solo una muestra de texto. Para ESTA función se guarda la versión
  // DELGADA (id, tipo, pie, fecha, cuenta, etiquetas, menciones, conteos, dirección de la publicación). Las demás funciones quedan idénticas.
  const gc = por('Guardar lo crudo')
  const ANTES_ITEMS = "const items = $items().map(i => i.json); const texto = JSON.stringify(items);"
  const DESPUES_ITEMS = "const items0 = $items().map(i => i.json); const items = ctx.apify_function === 'menciones_en_redes' ? items0.map(m => ({ id: m.id, shortCode: m.shortCode, type: m.type, url: m.url, caption: m.caption, timestamp: m.timestamp, ownerUsername: m.ownerUsername, likesCount: m.likesCount, commentsCount: m.commentsCount, mentions: m.mentions, hashtags: m.hashtags, taggedUsers: (m.taggedUsers || []).map(t => (t && t.username) || t).filter(Boolean) })) : items0; const texto = JSON.stringify(items);"
  gc.parameters.jsonBody = conFinDeLinea(gc.parameters.jsonBody, (c) => cambiar(c, ANTES_ITEMS, DESPUES_ITEMS, 'crudo delgado'))

  const sw = por('Switch · apify_function')
  const regla = sw.parameters.rules.values.find((r) => r.outputKey === 'fuentes_publicas')
  if (!regla) throw new Error('no existe la ruta fuentes_publicas')
  regla.conditions.conditions.push({ id: 'fp4', leftValue: '={{ $json.apify_function }}', rightValue: 'menciones_', operator: { type: 'string', operation: 'startsWith' } })
  return f
}

/** lo que NO debe cambiar: todos los nodos fuera de la lista NODOS, las conexiones, el nombre y los ajustes */
export function soloCambiaLoPrevisto(antes, despues) {
  const A = new Map(antes.nodes.map((n) => [n.name, JSON.stringify(n)]))
  const cambian = despues.nodes.filter((n) => A.get(n.name) !== JSON.stringify(n)).map((n) => n.name).sort()
  const nuevos = despues.nodes.filter((n) => !A.has(n.name)).map((n) => n.name)
  return { cambian, nuevos, esperados: [...NODOS].sort(), conexionesIguales: JSON.stringify(antes.connections) === JSON.stringify(despues.connections), nombreIgual: antes.name === despues.name }
}

if (process.argv[1] && process.argv[1].endsWith('construir-menciones.mjs')) {
  const antes = JSON.parse(fs.readFileSync(DIR + 'servicio-apify-ANTES-menciones-2026-10-14.json', 'utf8'))
  const despues = servicioConMenciones(antes)
  const r = soloCambiaLoPrevisto(antes, despues)
  if (JSON.stringify(r.cambian) !== JSON.stringify(r.esperados) || r.nuevos.length || !r.conexionesIguales || !r.nombreIgual) throw new Error('cambió algo no previsto: ' + JSON.stringify(r))
  fs.writeFileSync(DIR + 'servicio-apify-ARREGLADO-menciones-2026-10-14.json', JSON.stringify(despues, null, 2))
  console.log('ok · cambian', r.cambian.length, 'nodos · nuevos', r.nuevos.length)
}
