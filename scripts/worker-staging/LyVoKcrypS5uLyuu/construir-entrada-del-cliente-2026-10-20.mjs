// CC#1 · 20-oct · LA ENTRADA DEL CLIENTE · el alta deja de tratar una red social como «sitio web» y lee el PERFIL público de la cuenta dada.
//   node construir-entrada-del-cliente-2026-10-20.mjs        → ANTES (respaldo del vivo) → ARREGLADO
//   import { construirFlujo } y pasarle el flujo               → lo que prueba __tests__/alta-entrada-del-cliente.test.ts
// Cambia (todo sistémico: vale para cualquier cliente):
//  · «Validate Deal Data»: el sitio solo es sitio si lo es (nunca una red, un agregador de enlaces o un chat); las cuentas DADAS por el trato mandan y se guardan; deja `_entrada` con lo que hizo.
//  · IF «¿El cliente dio un sitio propio?» → solo entonces se lee el sitio (antes se llamaba a Apify aun sin sitio).
//  · «El texto del sitio, o el hueco»: sin sitio ⇒ `sin_dato` honesto; y una PARED (login, bloqueo, error) ⇒ `sin_dato`, nunca «texto del negocio».
//  · IF «¿El cliente dio una cuenta de Instagram?» → HTTP «Leer el perfil de Instagram del cliente» (Servicio de Apify, `instagram_scraper`, destino `respuesta`: no escribe en el cerebro) → «El perfil de la red, o el hueco».
//  · La tarea del descubridor: lleva el perfil medido (o el hueco declarado), prohíbe abrir instagram.com con sus herramientas, y fija que la cuenta DADA manda y que otras se reportan como DUDAS.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const N_VALIDAR = 'Validate Deal Data'
export const N_LEER_SITIO = 'Leer el sitio del cliente (materia prima)'
export const N_TEXTO_SITIO = 'El texto del sitio, o el hueco'
export const N_DESPACHO = 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)'
export const N_SI_SITIO = '¿El cliente dio un sitio propio?'
export const N_SI_CUENTA = '¿El cliente dio una cuenta de Instagram?'
export const N_LEER_PERFIL = 'Leer el perfil de Instagram del cliente'
export const N_PERFIL = 'El perfil de la red, o el hueco'

const aqui = dirname(fileURLToPath(import.meta.url))
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
export const BLOQUE = fs.readFileSync(join(aqui, 'bloque-entrada-del-cliente-2026-10-20.js'), 'utf8').split(CR + LF).join(LF).trim()

const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
const enLF = (c) => ({ crlf: c.includes(CR + LF), s: c.split(CR + LF).join(LF) })
const devolver = (crlf, s) => (crlf ? s.split(LF).join(CR + LF) : s)

// ───────────────────────── «Validate Deal Data»
export function cambiarValidar(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('entNormalizar')) throw new Error('«Validate Deal Data» ya trae la entrada del cliente · no construir dos veces')
  const s = unaVez(s0, `b.website = b.website || b.domain || null;
`, `// 🔴 LA ENTRADA DEL CLIENTE (20-oct · prueba real): el trato traía SOLO su Instagram como «web» y el alta lo leyó como sitio (volvió el muro de login). El sitio solo es sitio si lo es;
// las cuentas que dio quien cerró el trato MANDAN (el descubridor puede proponer otras, nunca reemplazarlas).
${BLOQUE}
var _ent = entNormalizar(b);
b.website = _ent.sitio;
if (!_ent.sitio) b.domain = null; // si la «web» era una red o un enlace, tampoco viaja por el otro nombre
if (_ent.cuentas.instagram) b.instagram_handle = _ent.cuentas.instagram; // la cuenta LIMPIA (sin @ ni dirección): es la que lee «Persist Client»
b._entrada = { direccion_original: _ent.direccion_original, direccion_era: _ent.direccion_era, cuentas: _ent.cuentas, origen: _ent.origen, avisos: _ent.avisos };
`, 'validar')
  return devolver(crlf, s)
}

// ───────────────────────── «El texto del sitio, o el hueco»
export function cambiarTextoSitio(codigo) {
  const { crlf, s: s0 } = enLF(codigo)
  if (s0.includes('entEsMuro')) throw new Error('«El texto del sitio» ya trae la detección de muros · no construir dos veces')
  let s = unaVez(s0, `const r = (($input.first() || {}).json) || {};
`, `${BLOQUE}

const r = (($input.first() || {}).json) || {};
const _val = $('Validate Deal Data').first().json || {};
const _sinSitio = !String(_val.website || '').trim();
`, 'cabecera')
  s = unaVez(s, `if (r && r.ok === true) {
  const datos = String(r.datos || '');
  if (r.sin_resultados === true || datos.trim() === '') {`, `let muro = null;
if (_sinSitio) {
  // el cliente no dio un sitio propio (solo redes, o ninguno): NO se llamó al Servicio y NO se supone nada
  estado = 'sin_dato';
  const _av = ((_val._entrada || {}).avisos || []).join(' · ');
  motivo = 'el cliente no dio un sitio web propio' + (_av ? ' (' + _av + ')' : '') + ' · no se leyó ningún sitio';
} else if (r && r.ok === true) {
  const datos = String(r.datos || '');
  muro = entEsMuro(datos, '');
  if (muro.es) {
    // una PARED no es el texto del negocio: login, bloqueo antirrobots o página de error
    estado = 'sin_dato';
    motivo = muro.motivo;
  } else if (r.sin_resultados === true || datos.trim() === '') {`, 'rama ok')
  s = unaVez(s, `    sitio_es_materia_prima: (r && r.materia_prima) === true,
`, `    sitio_es_materia_prima: (r && r.materia_prima) === true,
    sitio_era_muro: muro && muro.es ? { tipo: muro.tipo, senales: muro.senales.slice(0, 4) } : null,
`, 'salida')
  return devolver(crlf, s)
}

// ───────────────────────── «El perfil de la red, o el hueco» (nodo nuevo)
export const CODIGO_PERFIL = `// 🔴 EL PERFIL DE LA RED (20-oct · prueba real): sin sitio propio, el negocio vive en su cuenta. Se lee el perfil PÚBLICO por el Servicio de Apify (perfil + últimas publicaciones) y se le da al descubridor MEDIDO.
// Tres estados, nunca un supuesto (igual que el sitio): 'trajo' · 'sin_dato' (se miró y no hay) · 'sin_respuesta' (no se pudo preguntar).
${BLOQUE}

const TOPE = 8000;
const _val = $('Validate Deal Data').first().json || {};
const usuario = String((((_val._entrada || {}).cuentas) || {}).instagram || '').trim();
const r = (($input.first() || {}).json) || {};
let estado = 'sin_dato';
let motivo = 'el trato no trajo una cuenta de Instagram';
let texto = '';
let muro = null;
if (usuario) {
  estado = 'sin_respuesta';
  motivo = 'el Servicio no contestó · NO se preguntó de verdad · no es que la cuenta no exista';
  if (r && r.ok === true) {
    const datos = String(r.datos || '');
    muro = entEsMuro(datos, '');
    if (r.dry_run === true) {
      estado = 'sin_dato';
      motivo = 'FUE UN ENSAYO · el Servicio devolvió datos sintéticos, no medidos · no se miró de verdad';
    } else if (muro.es) {
      estado = 'sin_dato';
      motivo = muro.motivo;
    } else if (r.sin_resultados === true || datos.trim() === '') {
      estado = 'sin_dato';
      motivo = (r.cero && r.cero.motivo) ? String(r.cero.motivo) : 'se miró y la cuenta no devolvió contenido (privada, inexistente o sin publicaciones)';
    } else {
      estado = 'trajo';
      motivo = '';
      texto = datos.length > TOPE ? datos.slice(0, TOPE) + String.fromCharCode(10) + String.fromCharCode(10) + '[…recortado en ' + TOPE + ' caracteres]' : datos;
    }
  } else if (r && r.ok === false) {
    motivo = String(r.error || r.motivo || 'el Servicio contestó que no pudo');
  }
}
return [{
  json: {
    perfil_estado: estado,
    perfil_motivo: motivo,
    perfil_texto: texto,
    perfil_usuario: usuario,
    perfil_caracteres: texto.length,
    perfil_era_muro: muro && muro.es ? { tipo: muro.tipo, senales: muro.senales.slice(0, 4) } : null,
  },
  pairedItem: { item: 0 },
}];
`

// ───────────────────────── la tarea del descubridor
export function cambiarDespacho(jsonBody) {
  const { crlf, s: s0 } = enLF(jsonBody)
  if (s0.includes(N_PERFIL)) throw new Error('el despacho ya trae el perfil de la red · no construir dos veces')
  const NL = 'String.fromCharCode(10)'
  const ancla = `       + ' con tus herramientas.')
)
) }},`
  const nuevo = `       + ' con tus herramientas.')
)
+ ${NL} + ${NL} + (
  $('${N_PERFIL}').first().json.perfil_estado === 'trajo'
    ? ('====== PERFIL PUBLICO DEL CLIENTE EN INSTAGRAM (@' + $('${N_PERFIL}').first().json.perfil_usuario + ') · ya leido, medido hoy ======'
       + ${NL} + $('${N_PERFIL}').first().json.perfil_texto + ${NL}
       + '====== FIN DEL PERFIL ======' + ${NL}
       + 'Es una fuente primaria PROPIA del cliente: usala para decir QUE ES el negocio. No hace falta (ni sirve) abrir instagram.com con tus herramientas: pide inicio de sesion.')
    : ($('${N_PERFIL}').first().json.perfil_usuario
        ? ('NO SE PUDO LEER EL PERFIL DE INSTAGRAM (@' + $('${N_PERFIL}').first().json.perfil_usuario + ') · ' + $('${N_PERFIL}').first().json.perfil_motivo
           + ${NL} + 'Dilo con estas palabras: \\"no se pudo leer el perfil\\". NO abras instagram.com con tus herramientas: devuelve un muro de inicio de sesion, que NO es el negocio. NO lo rellenes con un supuesto.')
        : '')
)
+ (
  Object.keys((($('Validate Deal Data').first().json._entrada || {}).cuentas) || {}).length
    ? (${NL} + ${NL} + 'CUENTAS PROPIAS DADAS POR QUIEN CERRO EL TRATO (MANDAN · NO LAS REEMPLACES): '
       + Object.entries(($('Validate Deal Data').first().json._entrada || {}).cuentas).map(function (p) { return p[0] + ' @' + p[1] }).join(' · ')
       + '. Si encuentras OTRA cuenta parecida, NO la pongas como cuenta propia: reportala al final de competitive_landscape_summary bajo DUDAS como \\"posible otra cuenta\\". En own_handles de la herramienta emit_discovery_output deja SIEMPRE la cuenta dada.')
    : ''
)
) }},`
  return devolver(crlf, unaVez(s0, ancla, nuevo, 'despacho'))
}

// ───────────────────────── armar el flujo
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo ' + n); return x }
  if (copia.nodes.some((n) => n.name === N_PERFIL)) throw new Error('el flujo ya trae la entrada del cliente · no construir dos veces')

  nodo(N_VALIDAR).parameters.jsCode = cambiarValidar(nodo(N_VALIDAR).parameters.jsCode)
  nodo(N_TEXTO_SITIO).parameters.jsCode = cambiarTextoSitio(nodo(N_TEXTO_SITIO).parameters.jsCode)
  nodo(N_DESPACHO).parameters.jsonBody = cambiarDespacho(nodo(N_DESPACHO).parameters.jsonBody)

  const leerSitio = nodo(N_LEER_SITIO)
  const pos = leerSitio.position || [920, 600]
  const si = (nombre, id, condicion, x, y) => ({
    id, name: nombre, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [x, y],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 }, conditions: [{ id: id + '-c', leftValue: condicion, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  })
  const nSi = si(N_SI_SITIO, 'entrada-si-sitio', "={{ !!String(($('Validate Deal Data').first().json.website || '')).trim() }}", pos[0] - 220, pos[1])
  const nCuenta = si(N_SI_CUENTA, 'entrada-si-cuenta', "={{ !!String(((($('Validate Deal Data').first().json._entrada || {}).cuentas) || {}).instagram || '').trim() }}", pos[0] + 440, pos[1] + 200)
  const nLeer = {
    id: 'entrada-leer-perfil', name: N_LEER_PERFIL, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput', position: [pos[0] + 660, pos[1] + 120],
    notes: 'Entrada del cliente (20-oct): sin sitio propio, el negocio vive en su cuenta. Se lee el perfil PUBLICO (perfil + ultimas publicaciones) por el Servicio de Apify, con destino `respuesta`: NO escribe en el cerebro (eso lo decide el portero). Sin reintento: un raspado que arranco y se reintenta se paga dos veces.',
    parameters: {
      method: 'POST', url: 'https://n8n-production-72be.up.railway.app/webhook/apify-service-workflow', sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] }, sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({\n  client_id: $('Validate Deal Data').first().json.client_id,\n  apify_function: 'instagram_scraper',\n  destination: 'respuesta',\n  dry_run: $('Validate Deal Data').first().json.dry_run === true,\n  params: { usernames: [String(((($('Validate Deal Data').first().json._entrada || {}).cuentas) || {}).instagram || '')], resultsLimit: 12 },\n  metadata: { paso: 'antes-del-descubridor', encargo: 'entrada-del-cliente' }\n}) }}",
      options: { timeout: 180000, response: { response: { neverError: true } } },
    },
  }
  const nPerfil = { id: 'entrada-perfil', name: N_PERFIL, type: 'n8n-nodes-base.code', typeVersion: 2, position: [pos[0] + 880, pos[1] + 200], parameters: { jsCode: CODIGO_PERFIL } }
  copia.nodes.push(nSi, nCuenta, nLeer, nPerfil)

  // cables: Validate → (IF sitio) ; IF sitio: sí → Leer sitio, no → El texto ; El texto → (IF cuenta) ; IF cuenta: sí → Leer perfil → Perfil, no → Perfil ; Perfil → Despacho
  const c = copia.connections
  const sal = c[N_VALIDAR].main[0]
  const i = sal.findIndex((x) => x.node === N_LEER_SITIO)
  if (i < 0) throw new Error('Validate no apunta a «Leer el sitio»')
  sal[i] = { node: N_SI_SITIO, type: 'main', index: 0 }
  c[N_SI_SITIO] = { main: [[{ node: N_LEER_SITIO, type: 'main', index: 0 }], [{ node: N_TEXTO_SITIO, type: 'main', index: 0 }]] }
  if (!(c[N_TEXTO_SITIO].main[0].length === 1 && c[N_TEXTO_SITIO].main[0][0].node === N_DESPACHO)) throw new Error('«El texto del sitio» ya no apunta solo al despacho')
  c[N_TEXTO_SITIO] = { main: [[{ node: N_SI_CUENTA, type: 'main', index: 0 }]] }
  c[N_SI_CUENTA] = { main: [[{ node: N_LEER_PERFIL, type: 'main', index: 0 }], [{ node: N_PERFIL, type: 'main', index: 0 }]] }
  c[N_LEER_PERFIL] = { main: [[{ node: N_PERFIL, type: 'main', index: 0 }]] }
  c[N_PERFIL] = { main: [[{ node: N_DESPACHO, type: 'main', index: 0 }]] }
  return copia
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'LyVoKcrypS5uLyuu-ANTES-entrada-del-cliente-2026-10-20.json'), 'utf8'))
  const salida = join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-entrada-del-cliente-2026-10-20.json')
  const nuevo = construirFlujo(w)
  fs.writeFileSync(salida, JSON.stringify(nuevo, null, 2))
  console.log('escrito', salida, '· nodos', nuevo.nodes.length)
}
