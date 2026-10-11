#!/usr/bin/env node
/**
 * BARRIDO DEL VOSEO (relevo «sin voseo», 2026-10-11 · firma de Emilio: «idioma: tuteo de Ecuador, nunca voseo»).
 * Lo que se barre son las INSTRUCCIONES que leen los agentes, los CC y el equipo: el modo imperativo y la segunda persona escritos en voseo («Usá», «Sos», «podés»)
 * pasan a español neutro con tuteo («Usa», «Eres», «puedes»). El REGISTRO de cada pieza que se escribe para un cliente NO lo fija la instrucción: lo dicen el manual y el país.
 *
 *   node scripts/ops/barrer-voseo.mjs listar  <archivo...>              · muestra cada hallazgo (y lo que queda PROTEGIDO) · no escribe
 *   node scripts/ops/barrer-voseo.mjs barrer  <entrada> <salida>        · barre un flujo de n8n (JSON) y escribe la salida · informa cada cambio
 *   node scripts/ops/barrer-voseo.mjs texto   <archivo...> [--ejecutar] · barre archivos de texto en su sitio (solo con --ejecutar)
 *
 * PROTEGIDO (no se toca): el DICCIONARIO del detector de voseo (las listas de formas que el sistema usa para RECONOCER el voseo en un manual: tiene que nombrarlas),
 * y las líneas que explican el registro («sin voseo (tú, no vos…)»). Todo lo demás se barre. Nunca se toca una cita literal entre comillas angulares marcada como cita.
 */
import fs from 'node:fs'

// ───────────────────────── la tabla (forma voseante → forma con tuteo) · en minúscula, con tilde; el código conserva MAYÚSCULAS / Inicial
export const TABLA = {
  // pronombre y verbo ser
  // «vos» NO se sustituye palabra por palabra: en el código del detector de trato es un VALOR («'tu' | 'vos' | 'usted'», «argentina: 'vos'») y cambiarlo rompería la lógica; solo se cambia en prosa, tras preposición («a vos» → «a ti»)
  sos: 'eres',
  // presente de indicativo
  sabés: 'sabes', tenés: 'tienes', podés: 'puedes', querés: 'quieres', decís: 'dices', hacés: 'haces', ponés: 'pones', venís: 'vienes', pedís: 'pides', vivís: 'vives',
  escribís: 'escribes', salís: 'sales', sentís: 'sientes', creés: 'crees', leés: 'lees', elegís: 'eliges', seguís: 'sigues', repetís: 'repites', conocés: 'conoces', entendés: 'entiendes',
  necesitás: 'necesitas', usás: 'usas', mirás: 'miras', llamás: 'llamas', buscás: 'buscas', mandás: 'mandas', hablás: 'hablas', pagás: 'pagas', encontrás: 'encuentras',
  // imperativo (-ar)
  usá: 'usa', llamá: 'llama', pasá: 'pasa', agregá: 'agrega', declará: 'declara', priorizá: 'prioriza', tratá: 'trata', mirá: 'mira', probá: 'prueba', comprobá: 'comprueba',
  revisá: 'revisa', diagnosticá: 'diagnostica', verificá: 'verifica', confirmá: 'confirma', aclará: 'aclara', explicá: 'explica', calculá: 'calcula', marcá: 'marca',
  cambiá: 'cambia', ignorá: 'ignora', completá: 'completa', aplicá: 'aplica', ejecutá: 'ejecuta', publicá: 'publica', activá: 'activa', apagá: 'apaga', buscá: 'busca',
  guardá: 'guarda', mandá: 'manda', enviá: 'envía', sacá: 'saca', quitá: 'quita', cargá: 'carga', generá: 'genera', creá: 'crea', armá: 'arma', dejá: 'deja', tomá: 'toma',
  cuidá: 'cuida', evitá: 'evita', contá: 'cuenta', ayudá: 'ayuda', cerrá: 'cierra', empezá: 'empieza', pensá: 'piensa', ubicá: 'ubica', separá: 'separa', juntá: 'junta',
  comparé: 'compara', limitá: 'limita', respetá: 'respeta', citá: 'cita', copiá: 'copia', pegá: 'pega', nombrá: 'nombra', listá: 'lista', anotá: 'anota', registrá: 'registra',
  clasificá: 'clasifica', identificá: 'identifica', determiná: 'determina', estimá: 'estima', validá: 'valida', contrastá: 'contrasta', cotejá: 'coteja', adjuntá: 'adjunta',
  incorporá: 'incorpora', agrupá: 'agrupa', filtrá: 'filtra', seleccioná: 'selecciona', asigná: 'asigna', reservá: 'reserva', aprobá: 'aprueba', rechazá: 'rechaza',
  cancelá: 'cancela', continuá: 'continúa', terminá: 'termina', finalizá: 'finaliza', entregá: 'entrega', preguntá: 'pregunta', trabajá: 'trabaja', utilizá: 'utiliza',
  informá: 'informa', recomendá: 'recomienda', sugerí: 'sugiere', andá: 've', hablá: 'habla', dale: 'dale', fijá: 'fija', asegurá: 'asegura', acordá: 'acuerda',
  // imperativo (-er)
  elegí: 'elige', devolvé: 'devuelve', mantené: 'mantén', respondé: 'responde', leé: 'lee', poné: 'pon', tené: 'ten', hacé: 'haz', decí: 'di', corré: 'corre', volvé: 'vuelve',
  resolvé: 'resuelve', rehacé: 'rehaz', rehacelo: 'rehazlo', sumá: 'suma', dividí: 'divide', ofrecé: 'ofrece', conocé: 'conoce', comprendé: 'comprende', vendé: 'vende', prometé: 'promete',
  // imperativo (-ir)
  emití: 'emite', construí: 'construye', describí: 'describe', escribí: 'escribe', decidí: 'decide', definí: 'define', incluí: 'incluye', vení: 've', salí: 'sal', seguí: 'sigue',
  descubrí: 'descubre', pedí: 'pide', resumí: 'resume', medí: 'mide', abrí: 'abre', repetí: 'repite', corregí: 'corrige', recibí: 'recibe', dirigí: 'dirige', invitá: 'invita',
  distinguí: 'distingue', cumplí: 'cumple', sumate: 'súmate', elegilo: 'elígelo', hacelo: 'hazlo',
  // reflexivos y con pronombre pegado
  fijate: 'fíjate', asegurate: 'asegúrate', acordate: 'acuérdate', olvidate: 'olvídate', andate: 'vete', quedate: 'quédate', cuidate: 'cuídate', ponete: 'ponte', animate: 'anímate',
  apurate: 'apúrate', calmate: 'cálmate', mirate: 'mírate', sentate: 'siéntate', enterate: 'entérate', avisate: 'avísate',
  pedilo: 'pídelo', pedila: 'pídela', decilo: 'dilo', decila: 'dila', decime: 'dime', decíles: 'diles', usalo: 'úsalo', usala: 'úsala', usalas: 'úsalas', usalos: 'úsalos',
  mandalo: 'mándalo', escribinos: 'escríbenos', dejalo: 'déjalo', tomalo: 'tómalo', mostrame: 'muéstrame', contame: 'cuéntame', avisame: 'avísame', mandame: 'mándame', escribilo: 'escríbelo', buscalo: 'búscalo',
  // subjuntivo
  hagás: 'hagas', tengás: 'tengas', digás: 'digas', vayás: 'vayas', seás: 'seas', pongás: 'pongas', sepás: 'sepas',
}
Object.assign(TABLA, { decidís: 'decides', corrés: 'corres', rompés: 'rompes', completés: 'completes', metés: 'metes', preferís: 'prefieres', parate: 'párate', apoyate: 'apóyate', esperá: 'espera', estructurá: 'estructura', procurá: 'procura', ahorrá: 'ahorra', enumerá: 'enumera', orientá: 'orienta', imaginá: 'imagina', despachás: 'despachas', consultás: 'consultas', marcalo: 'márcalo', marcala: 'márcala', consultalo: 'consúltalo', repetilo: 'repítelo', elegí: 'elige', perdé: 'pierde', entendé: 'entiende', volvé: 'vuelve', seguinos: 'síguenos', contanos: 'cuéntanos', llamanos: 'llámanos', etiquetanos: 'etiquétanos', perdés: 'pierdes', olvidás: 'olvidas', tirás: 'tiras', tirala: 'tírala', tirame: 'tírame', acordás: 'acuerdas', mirás: 'miras', dejás: 'dejas', alcanzás: 'alcanzas', pensás: 'piensas', llevás: 'llevas', ayudás: 'ayudas', tocás: 'tocas', manejás: 'manejas', leés: 'lees', ejecutás: 'ejecutas', preguntás: 'preguntas', dependés: 'dependes', cuidás: 'cuidas', estudiás: 'estudias', demostrás: 'demuestras', aprobás: 'apruebas', recordá: 'recuerda', pasame: 'pásame', mostrale: 'muéstrale', dale: 'dale', votás: 'votas', llenás: 'llenas', dejalos: 'déjalos', dejala: 'déjala', dejalas: 'déjalas', hacelos: 'hazlos', ponelo: 'ponlo', ponela: 'ponla' })
// presente de indicativo (más verbos de instrucción)
Object.assign(TABLA, { aplicás: 'aplicas', integrás: 'integras', reescribís: 'reescribes', corregís: 'corriges', revisás: 'revisas', confirmás: 'confirmas', verificás: 'verificas', enviás: 'envías', guardás: 'guardas', generás: 'generas', creás: 'creas', definís: 'defines', declarás: 'declaras', agregás: 'agregas', mantenés: 'mantienes', tratás: 'tratas', comprobás: 'compruebas', probás: 'pruebas', integrá: 'integra', reescribí: 'reescribe', aplicá: 'aplica' })
// imperativos en «-rá»: no se pueden distinguir del futuro («declará» / «declarará») por la forma sola, así que van uno por uno
Object.assign(TABLA, { mejorá: 'mejora', elaborá: 'elabora', explorá: 'explora', borrá: 'borra', registrá: 'registra', ilustrá: 'ilustra', demostrá: 'demuestra', mostrá: 'muestra', considerá: 'considera', prepará: 'prepara', compará: 'compara', separá: 'separa', analizá: 'analiza', evaluá: 'evalúa', reevaluá: 'reevalúa', revisá: 'revisa', enfocá: 'enfoca', buscá: 'busca', ordená: 'ordena', ponderá: 'pondera', apoyá: 'apoya', basá: 'basa', fundá: 'funda', corregilo: 'corrígelo' })
// variantes SIN tilde (el voseo también se escribe «podes», «usala», «decilo»)
Object.assign(TABLA, { podes: 'puedes', tenes: 'tienes', queres: 'quieres', decis: 'dices', usala: 'úsala', usalo: 'úsalo', usalas: 'úsalas', usalos: 'úsalos', decilo: 'dilo', decila: 'dila', decime: 'dime', pedilo: 'pídelo', pedila: 'pídela', hacelo: 'hazlo', elegilo: 'elígelo', dejalo: 'déjalo', tomalo: 'tómalo', mostrame: 'muéstrame', contame: 'cuéntame', avisame: 'avísame', mandame: 'mándame', escribilo: 'escríbelo', buscalo: 'búscalo', fijate: 'fíjate', acordate: 'acuérdate', asegurate: 'asegúrate', animate: 'anímate', sumate: 'súmate', andate: 'vete', quedate: 'quédate' })
// el imperativo voseante de los verbos en -ar es regular: la tilde final se quita («Mejorá» → «Mejora», «Analizá» → «Analiza»). Fuera quedan las palabras que acaban en -á y no son verbos
const NO_IMPERATIVO_A = new Set(['está', 'allá', 'acá', 'papá', 'mamá', 'sofá', 'ojalá', 'canadá', 'panamá', 'bogotá', 'maná', 'quizá', 'alá', 'ahá'])
const esImperativoA = (w) => w.length >= 4 && w.endsWith('á') && !w.endsWith('rá') && !NO_IMPERATIVO_A.has(w)
// formas voseantes que también son la 1.ª persona del pretérito («medí», «corregí»): en un COMENTARIO de código son narración, no instrucción · ahí no se tocan
const AMBIGUAS = new Set(['pedí', 'escribí', 'decidí', 'definí', 'salí', 'abrí', 'resumí', 'medí', 'recibí', 'corregí', 'repetí', 'vení', 'seguí', 'miré'])
const RE_TOKEN = /[\p{L}]+/gu
// una forma dentro de una EXPRESIÓN REGULAR (\b, (?:, .test(, new RegExp) es dato del detector, no texto de instrucción
const MARCAS_PROTEGIDAS = [/\\b|\(\?:|\.test\(|new RegExp|\[\^/, /_pal\(/, /_VOSEO|_TUTEO|_DECLARA/, /voseo/i, /«vos»/, /\bvos\b[^\n]*\btú\b|\btú\b[^\n]*\bvos\b/i, /\bni vos\b/i, /uses vos/i, /trato de vos/i, /(?:habla|hablar)\s+(?:de\s+)?vos/i]

function conCaja(original, nuevo) {
  if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) return nuevo.toUpperCase()
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) return nuevo[0].toUpperCase() + nuevo.slice(1)
  return nuevo
}
/** «a vos», «de vos», «para vos» → «a ti», «de ti»…; «con vos» → «contigo» */
function pronombre(texto) {
  return texto
    .replace(/\bcon vos\b/gi, (m) => conCaja(m, 'contigo'))
    .replace(/\b(a|de|para|por|sin|sobre|entre|hacia|desde|hasta|en|tras) vos\b/gi, (m, p) => p + ' ' + (m === m.toUpperCase() ? 'TI' : 'ti'))
    // «vos» suelto en PROSA («los jefes diagnostican, vos reescribes») → «tú» · si parece código («'vos'», «vos:», «|vos|», «(vos») es un VALOR del detector y no se toca
    .replace(/\bvos\b/gi, (m, off, str) => (VOS_EN_CODIGO.test(str.slice(Math.max(0, off - 2), off + 8)) ? m : conCaja(m, 'tú')))
}
const VOS_EN_CODIGO = /['"`]vos['"`]|vos\s*[:=]|\|vos\||\(vos\b|\bvos\)|\[vos\]/
const esLineaProtegida = (linea) => MARCAS_PROTEGIDAS.some((r) => r.test(linea))
// presente de indicativo de los verbos en -ar («consultás» → «consultas»): regular, así que basta quitar la tilde. Fuera quedan las palabras en -ás que no son verbos (más, además, jamás, nombres propios) y los futuros en -rás
const NO_PRESENTE_AS = new Set(['más', 'además', 'jamás', 'atrás', 'detrás', 'demás', 'quizás', 'compás', 'estás', 'anás', 'nicolás', 'tomás', 'matías', 'lucás', 'andrés', 'ramás', 'bernabás', 'tobías', 'esdrás', 'barrabás', 'gamás', 'fanás'])
const esPresenteAs = (w) => w.length >= 5 && w.endsWith('ás') && !w.endsWith('rás') && !NO_PRESENTE_AS.has(w)
const esForma = (w) => Object.prototype.hasOwnProperty.call(TABLA, w) || esImperativoA(w) || esPresenteAs(w)
const nuevaForma = (w) => (Object.prototype.hasOwnProperty.call(TABLA, w) ? TABLA[w] : w.endsWith('ás') ? w.slice(0, -2) + 'as' : w.slice(0, -1) + 'a')
const formasDeLinea = (linea) => [...linea.matchAll(RE_TOKEN)].map((m) => m[0].toLowerCase()).filter(esForma)
/** una línea con ≥ 4 formas DISTINTAS Y que son ≥ 30 % de sus palabras es un diccionario (datos del detector), no una instrucción: un párrafo de prompt con cinco imperativos NO lo es */
const esDiccionario = (linea) => {
  const formas = formasDeLinea(linea)
  const palabras = (linea.match(RE_TOKEN) ?? []).length || 1
  return new Set(formas).size >= 4 && formas.length / palabras >= 0.3
}

/** barre un texto línea por línea · devuelve el texto nuevo, los cambios (antes → después) y las líneas protegidas que contenían formas */
export function barrerTexto(texto, op = {}) {
  const cambios = [], protegidas = []
  const salida = String(texto).split('\n').map((linea) => {
    const formas = formasDeLinea(linea)
    if (!formas.length && !/\bvos\b/i.test(linea)) return linea
    if (esLineaProtegida(linea) || esDiccionario(linea)) { protegidas.push(linea.trim().slice(0, 160)); return linea }
    const antes = linea
    // el COMENTARIO de una línea (al inicio, o tras « // » al final del código) es narración para quien programa: si cita («…»), habla del TRATO o lista ≥ 2 formas de ejemplo, no se toca
    // (en un papel Markdown no hay comentarios de código: «**Regla:**» o «# Título» no son comentarios)
    const cut = op.soloInicio ? -1 : /^\s*(\/\/|\*|\/\*|#)/.test(linea) ? 0 : linea.search(/\s\/\/\s/)
    const codigo = cut === -1 ? linea : linea.slice(0, cut), comentario = cut === -1 ? '' : linea.slice(cut)
    const protegerComentario = comentario && (/[«»]/.test(comentario) || /trato/i.test(comentario) || new Set(formasDeLinea(comentario)).size >= 2)
    if (protegerComentario && !formasDeLinea(codigo).length) { protegidas.push(linea.trim().slice(0, 160)); return linea }
    // una forma ambigua («pedí»: imperativo voseante O 1.ª persona del pretérito) solo es imperativo al ARRANCAR una oración o cláusula; tras «no», «yo», «lo», comillas de cita… es pasado y se deja
    const cambiar = (trozo, esComentario) => pronombre(trozo).replace(RE_TOKEN, (w, off, str) => {
      const k = w.toLowerCase()
      if (!esForma(k) || (k === 'sos' && w === 'SOS')) return w
      // en un REGISTRO histórico («cerré», «abrí cero frentes») las formas en -í/-é son pasado, no instrucción: no se tocan
      if (op.sinPreteritos && /[íé]$/.test(k)) return w
      if (AMBIGUAS.has(k)) {
        if (esComentario) return w
        const previo = str.slice(0, off)
        // en un papel (Markdown) solo cuenta como imperativo la PRIMERA palabra de la línea (tras viñeta, número o negrita); en un prompt, el arranque de cualquier cláusula
        const arranque = op.soloInicio ? /^\s*(?:[-*>+]|\d+[.)])?\s*(?:\*\*|__|\*|_)?\s*$/ : /(^|[.:;·(\[\-—¿!"'`]\s*)$/
        if (!arranque.test(previo)) return w
      }
      return conCaja(w, nuevaForma(k))
    })
    const nueva = cut === -1 ? cambiar(linea, false) : cambiar(codigo, false) + (protegerComentario ? comentario : cambiar(comentario, true))
    if (nueva !== antes) cambios.push({ antes: antes.trim().slice(0, 200), despues: nueva.trim().slice(0, 200) })
    return nueva
  })
  return { texto: salida.join('\n'), cambios, protegidas }
}

function hojas(o, ruta, fn) {
  if (typeof o === 'string') return fn(ruta, o)
  if (Array.isArray(o)) return o.map((x, i) => hojas(x, ruta + '[' + i + ']', fn))
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hojas(v, ruta + '.' + k, fn)]))
  return o
}
/** barre TODOS los textos de los nodos de un flujo (sus parámetros) · no toca nombres de nodos, ids, conexiones ni ajustes */
export function barrerFlujo(flujo) {
  const f = JSON.parse(JSON.stringify(flujo)); const cambios = [], protegidas = []
  for (const n of f.nodes || []) {
    n.parameters = hojas(n.parameters, n.name, (ruta, t) => {
      const r = barrerTexto(t)
      r.cambios.forEach((c) => cambios.push({ nodo: n.name, ...c })); r.protegidas.forEach((p) => protegidas.push({ nodo: n.name, linea: p }))
      return r.texto
    })
  }
  return { flujo: f, cambios, protegidas }
}

/**
 * barre un PAPEL en Markdown (el vault, los CLAUDE.md): igual que `barrerTexto` pero las CITAS no se tocan —lo que va entre «…», entre comillas rectas “…”/"…" o en `código`— y tampoco el aviso del idioma
 * que enumera las formas prohibidas. Así la redacción pasa a tuteo y las palabras literales de Emilio quedan como las dijo.
 */
export function barrerMarkdown(texto, op = {}) {
  const cambios = [], protegidas = []
  const salida = String(texto).split('\n').map((linea) => {
    if (!formasDeLinea(linea).length && !/\bvos\b/i.test(linea)) return linea
    // el aviso del idioma nombra las formas (para prohibirlas): se deja entero
    if (/nunca voseo|sin voseo|«vos»|no vos\b|tuteo.*voseo|voseo.*tuteo/i.test(linea)) { protegidas.push(linea.trim().slice(0, 160)); return linea }
    const guardadas = []
    const mascara = linea.replace(/«[^»]*»|“[^”]*”|"[^"\n]{2,300}"|`[^`\n]*`/g, (m) => { guardadas.push(m); return '\u0001' + (guardadas.length - 1) + '\u0001' })
    const r = barrerTexto(mascara, { soloInicio: true, sinPreteritos: op.sinPreteritos === true })
    const nueva = r.texto.replace(/\u0001(\d+)\u0001/g, (_, i) => guardadas[Number(i)])
    if (nueva !== linea) cambios.push({ antes: linea.trim().slice(0, 200), despues: nueva.trim().slice(0, 200) })
    else if (r.protegidas.length) protegidas.push(linea.trim().slice(0, 160))
    return nueva
  })
  return { texto: salida.join('\n'), cambios, protegidas }
}

if (process.argv[1] && process.argv[1].endsWith('barrer-voseo.mjs')) {
  const [orden, ...resto] = process.argv.slice(2)
  const ejecutar = resto.includes('--ejecutar'); const args = resto.filter((x) => x !== '--ejecutar')
  if (orden === 'barrer') {
    const [entrada, salida] = args
    const r = barrerFlujo(JSON.parse(fs.readFileSync(entrada, 'utf8')))
    fs.writeFileSync(salida, JSON.stringify(r.flujo, null, 1) + '\n')
    console.log(`${r.cambios.length} líneas cambiadas · ${r.protegidas.length} protegidas (diccionario del detector / explicación del registro)`)
    for (const c of r.cambios) console.log(`  [${c.nodo}]\n    - ${c.antes}\n    + ${c.despues}`)
  } else if (['listar', 'texto', 'md', 'md-listar', 'md-historico', 'md-historico-listar'].includes(orden)) {
    const barre = orden.startsWith('md-historico') ? (t) => barrerMarkdown(t, { sinPreteritos: true }) : orden.startsWith('md') ? (t) => barrerMarkdown(t) : (t) => barrerTexto(t)
    for (const a of args) {
      const t = fs.readFileSync(a, 'utf8'); const crlf = t.includes('\r\n'); const r = barre(t.split('\r\n').join('\n'))
      console.log(`${a} · ${r.cambios.length} cambios · ${r.protegidas.length} protegidas`)
      if (orden.endsWith('listar')) r.cambios.forEach((c) => console.log(`   - ${c.antes}\n   + ${c.despues}`))
      if (['texto', 'md', 'md-historico'].includes(orden) && ejecutar && r.cambios.length) fs.writeFileSync(a, crlf ? r.texto.split('\n').join('\r\n') : r.texto)
    }
  } else { console.error('uso: barrer-voseo.mjs listar|barrer|texto|md-listar|md …'); process.exit(2) }
}
