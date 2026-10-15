// PLAN v3 · LA CONEXIÓN EN EL FLUJO DE PLANEACIÓN (CC#1 · 2026-10-15) · NO SE APLICA (lo aplica CC#3 con respaldo, n8n 0/0, fuera de 12:00–14:00 UTC, «vivo = respaldo»).
//   node construir-conexion.mjs [--salida=<carpeta>]   → escribe el ARREGLADO · NO toca n8n
// Qué engancha, TODO detrás de `plan_v3: true` + `corrida` + `client_id` en el sobre (sin ellos: salida IDÉNTICA a hoy, byte por byte):
//   · 4 nodos `PV3 ·` entre «Unir lo del dueño al paquete» y `FIN · ¿abre la oficina?`: pide el `dato.v1` a `POST /api/planeacion/dato` (catálogo + cerebro + crudo + normalizador + semilla compacta);
//   · «Redactor (B4)»: suma el pedido v3 (`pedidoV3Lineas`: TABLA DE DATOS dato.v1, citas [D#], huecos declarados) y lleva `datos` + léxico al contexto del chequeo;
//   · «Redactor (B4)» y «¿Llegó la vuelta?»: el chequeo P10a–m (`p10Revisar`) dentro de `revisarPlan`: las ALTAS marcan (plan «con pendientes»), las LEVES salen en `avisos_p10`; NUNCA bloquean;
//   · «FIN · armar la semilla»: si el dato v1 llegó, la oficina recibe la semilla compacta (`datos` con procedencia) en lugar de solo los resúmenes del paquete.
// Base: el flujo VIVO de hoy (80 nodos = V9 sobre F4 v2.1), respaldado en `ANTES-X9F0zp6LQ2xGEYVS-2026-10-15-tanda2.json`. Si el texto de un nodo cambió debajo, el constructor se DETIENE.
// NO engancha (declarado): el relleno por Apify (`relleno_plan` viaja como información; el brazo sigue con su recolección de hoy) y el refresco V10 (no hay dato previo guardado: falta la tabla `plan_datos`).
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const lf = (s) => String(s).split('\r\n').join('\n')
export const BASE = join(aqui, 'ANTES-X9F0zp6LQ2xGEYVS-2026-10-15-tanda2.json')
export const MODULO_PEDIDO_V3 = lf(fs.readFileSync(join(aqui, '..', 'planeacion-v3', 'pedido-v3.js'), 'utf8'))
export const MODULO_P10 = lf(fs.readFileSync(join(aqui, '..', 'planeacion-v3', 'chequeos-p10.js'), 'utf8'))
export const antesDeLaConexion = () => JSON.parse(lf(fs.readFileSync(BASE, 'utf8')).replace(/^﻿/, ''))

export const NODOS = { b4: 'Redactor (B4)', vuelta: '¿Llegó la vuelta?', unir: 'Unir lo del dueño al paquete', abreOficina: 'FIN · ¿abre la oficina?', armarOficina: 'FIN · armar la semilla', hook: 'Webhook · planeacion', decidirV9: 'V9 · decidir' }
export const PV = { si: 'PV3 · ¿pide el dato v1?', armar: 'PV3 · armar el pedido', dato: 'PV3 · armar el dato v1', paquete: 'PV3 · paquete' }
export const NOMBRES_NUEVOS = Object.values(PV)

const unaVez = (s, de, a, que) => {
  const n = s.split(de).length - 1
  if (n !== 1) throw new Error(`${que}: se esperaba 1 aparición y hay ${n}; el flujo cambió, se revisa la conexión`)
  return s.replace(de, () => a)
}
const ETIQUETAS_P10 = ['P10a', 'P10b', 'P10c', 'P10d', 'P10e', 'P10f', 'P10g', 'P10h', 'P10i', 'P10j', 'P10k', 'P10l', 'P10m']

/** el módulo común: P10 dentro de `revisarPlan`, SOLO si el contexto trae `plan_v3` (sin él, la salida es la de hoy) */
export function moduloConP10(modulo) {
  let m = lf(modulo)
  m = unaVez(m, 'var _ETIQUETA_DE_MARCA = { P8:', `var _ETIQUETA_DE_MARCA = { ${ETIQUETAS_P10.map((c) => `${c}: 'afirmación del plan sin respaldo en la tabla de datos'`).join(', ')}, P8:`, 'etiquetas P10')
  m = unaVez(m, 'function revisarPlan(texto, ctx) {', MODULO_P10.trimEnd() + '\n\nfunction revisarPlan(texto, ctx) {', 'revisarPlan')
  m = unaVez(m,
    '  return { ok: marcas.length === 0, marcas: marcas }',
    [
      '  // plan v3 · P10a–m contra la tabla `dato.v1`: las ALTAS marcan (el plan sale «con pendientes»); las LEVES van en `avisos_p10`. NUNCA bloquea. Sin `plan_v3` en el contexto: nada cambia.',
      '  var _avisosP10 = []',
      '  if (ctx && ctx.plan_v3 && Array.isArray(ctx.plan_v3.datos)) {',
      '    try {',
      '      p10Revisar(texto, ctx.plan_v3.datos, ctx.plan_v3.op || {}).forEach(function (m) {',
      "        var f = { codigo: m.codigo, que: m.que, ejemplos: m.ejemplos || [] }",
      "        if (m.severidad === 'alta') marcas.push(f); else _avisosP10.push(f)",
      '      })',
      '    } catch (x) { /* un fallo del chequeo nunca bloquea el plan ni lo marca */ }',
      '  }',
      '  var _r = { ok: marcas.length === 0, marcas: marcas }',
      '  if (_avisosP10.length) _r.avisos_p10 = _avisosP10',
      '  return _r',
    ].join('\n'), 'cierre de revisarPlan')
  return m
}

const LEER_PV3 = [
  '// PLAN v3 · el `dato.v1` armado por «' + PV.dato + '» (solo si el sobre pidió `plan_v3`). Sin él: null y el pedido queda IDÉNTICO a hoy, byte por byte.',
  'const PV3 = (function () {',
  '  try {',
  "    const p = $('" + PV.paquete + "').first().json",
  "    return p && p.plan_version === 'v3' && Array.isArray(p.datos) && typeof p.catalogo_huella === 'string' ? p : null",
  '  } catch (x) { return null }',
  '})()',
  '// largo del pedido SIN las líneas v3 (estimado con margen: el contrato de run-sdk es 120.000 y el tope de las líneas v3 es 110.000)',
  "const LINEAS_V3 = PV3 ? pedidoV3Lineas({ plan_version: 'v3', datos: PV3.datos, catalogo_version: PV3.catalogo_version, catalogo_huella: PV3.catalogo_huella, criticos: PV3.criticos || [], dry_run: PV3.dry_run === true ? true : undefined }, { base_chars: String((ent && ent.referencia) || '').length + 12000 }).lineas : []",
  '',
].join('\n')

export function cambiarB4(codigo) {
  let s = lf(codigo)
  // 1 · los módulos (el común con P10 + el pedido v3) y el lector
  s = unaVez(s, 'const FIN = (function () {', MODULO_PEDIDO_V3.trimEnd() + '\n\n' + LEER_PV3 + 'const FIN = (function () {', 'lector PV3')
  // 2 · el pedido
  s = unaVez(s, '...lineasDeFinanzas(FIN),\n', '...lineasDeFinanzas(FIN),\n...LINEAS_V3,\n', 'líneas v3 en el pedido')
  // 3 · el contexto del chequeo y la marca de qué se usó
  s = unaVez(s, 'declaradas: FIN.declaradas } } : {}),\n',
    "declaradas: FIN.declaradas } } : {}, PV3 ? { plan_v3: { catalogo_version: PV3.catalogo_version, catalogo_huella: PV3.catalogo_huella, datos: PV3.datos, op: { lexico: PV3.lexico || {}, cifras_de_slots: [], tolerancias: {}, textos_con_imperativos: [] } } } : {}),\n    ...(PV3 ? { plan_v3_usado: { catalogo_version: PV3.catalogo_version, catalogo_huella: PV3.catalogo_huella, datos: PV3.datos.length, recolectado_en: PV3.recolectado_en || null, lineas: LINEAS_V3.length } } : {}),\n",
    'contexto_chequeo v3')
  return s
}
export function cambiarVuelta(codigo) { return moduloConP10Sobre(codigo) }
/** B4 y «¿Llegó la vuelta?» llevan el MISMO módulo común: el de F4 ya está dentro, se le suma P10 */
function moduloConP10Sobre(codigo) {
  let s = lf(codigo)
  s = unaVez(s, 'var _ETIQUETA_DE_MARCA = { P8:', `var _ETIQUETA_DE_MARCA = { ${ETIQUETAS_P10.map((c) => `${c}: 'afirmación del plan sin respaldo en la tabla de datos'`).join(', ')}, P8:`, 'etiquetas P10')
  s = unaVez(s, 'function revisarPlan(texto, ctx) {', MODULO_P10.trimEnd() + '\n\nfunction revisarPlan(texto, ctx) {', 'revisarPlan')
  s = unaVez(s,
    '  return { ok: marcas.length === 0, marcas: marcas }',
    [
      '  // plan v3 · P10a–m contra la tabla `dato.v1`: las ALTAS marcan (el plan sale «con pendientes»); las LEVES van en `avisos_p10`. NUNCA bloquea. Sin `plan_v3` en el contexto: nada cambia.',
      '  var _avisosP10 = []',
      '  if (ctx && ctx.plan_v3 && Array.isArray(ctx.plan_v3.datos)) {',
      '    try {',
      '      p10Revisar(texto, ctx.plan_v3.datos, ctx.plan_v3.op || {}).forEach(function (m) {',
      "        var f = { codigo: m.codigo, que: m.que, ejemplos: m.ejemplos || [] }",
      "        if (m.severidad === 'alta') marcas.push(f); else _avisosP10.push(f)",
      '      })',
      '    } catch (x) { /* un fallo del chequeo nunca bloquea el plan ni lo marca */ }',
      '  }',
      '  var _r = { ok: marcas.length === 0, marcas: marcas }',
      '  if (_avisosP10.length) _r.avisos_p10 = _avisosP10',
      '  return _r',
    ].join('\n'), 'cierre de revisarPlan')
  return s
}

const CODIGO_ARMAR = [
  '// PLAN v3 · arma el pedido del `dato.v1`: el cliente y el ensayo del sobre, y lo que V9 decidió sobre el relleno. Nunca lanza.',
  "const body = ($('" + NODOS.hook + "').first().json.body || {})",
  'let v9 = {}',
  "try { v9 = $('" + NODOS.decidirV9 + "').first().json || {} } catch (x) { v9 = {} }",
  '// `dry_run` AUSENTE = real (como la sala): no se inventa; un valor no booleano viaja tal cual y la ruta lo rechaza',
  "const salida = { client_id: String(body.client_id), relleno_permitido: v9.relleno_permitido === true, huecos_tipos: Array.isArray(v9.huecos_tipos) ? v9.huecos_tipos : [] }",
  "if (body.dry_run !== undefined) salida.dry_run = body.dry_run",
  'return [{ json: salida }]',
].join('\n')

const CODIGO_PAQUETE = [
  '// PLAN v3 · lo que contestó la ruta. Lo que no se entiende NO activa el plan v3: «Redactor (B4)» queda como hoy. Nunca lanza.',
  'const r = $input.first().json || {}',
  'const b = r.body && typeof r.body === "object" && !Array.isArray(r.body) ? r.body : {}',
  'const http = Number(r.statusCode)',
  "const ok = http === 200 && b.ok === true && b.plan_version === 'v3' && Array.isArray(b.datos) && typeof b.catalogo_huella === 'string'",
  "if (!ok) return [{ json: { plan_version: null, motivo: 'dato_no_disponible', http: Number.isFinite(http) ? http : null, error: typeof b.error === 'string' ? b.error : null } }]",
  "return [{ json: { plan_version: 'v3', datos: b.datos, criticos: Array.isArray(b.criticos) ? b.criticos : [], catalogo_version: b.catalogo_version, catalogo_huella: b.catalogo_huella, lexico: b.lexico || {}, semilla: b.semilla || null, descartados: b.descartados || [], resumen: b.resumen || null, relleno_plan: b.relleno_plan || null, dry_run: b.dry_run === true, recolectado_en: b.recolectado_en || null } }]",
].join('\n')

const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const WEBHOOK_BODY = "($('" + NODOS.hook + "').first().json.body || {})"

export function cambiarSemillaDeLaOficina(codigo) {
  return unaVez(lf(codigo), "return [{ json: { accion: 'abrir',",
    [
      '// plan v3: si el `dato.v1` llegó, la oficina recibe la SEMILLA COMPACTA (datos con procedencia; lo que no cupo, declarado) en vez de solo los resúmenes del paquete',
      'let pv = null',
      "try { const p = $('" + PV.paquete + "').first().json; if (p && p.plan_version === 'v3' && p.semilla && Array.isArray(p.semilla.datos)) pv = p } catch (x) { pv = null }",
      'if (pv) {',
      '  semilla.datos = pv.semilla.datos',
      '  semilla.datos_omitidos = Number(pv.semilla.datos_omitidos) || 0',
      '  if (pv.semilla.nota) semilla.brazos_resumen = String(pv.semilla.nota).slice(0, 1500)',
      '  if (pv.dry_run === true) semilla.corrida_es_de_ensayo = true',
      '}',
      "return [{ json: { accion: 'abrir',",
    ].join('\n'), 'semilla de la oficina')
}

export function conectaPlanV3(antes) {
  const copia = JSON.parse(JSON.stringify(antes))
  for (const n of copia.nodes) if (NOMBRES_NUEVOS.includes(n.name)) throw new Error(`el flujo ya tiene «${n.name}»`)
  const get = (nombre) => { const x = copia.nodes.filter((n) => n.name === nombre); if (x.length !== 1) throw new Error(`${x.length} nodos «${nombre}»`); return x[0] }
  const b4 = get(NODOS.b4), vuelta = get(NODOS.vuelta), unir = get(NODOS.unir), armarOf = get(NODOS.armarOficina)
  get(NODOS.abreOficina)
  const sal = copia.connections[NODOS.unir]?.main?.[0] ?? []
  if (sal.length !== 1 || sal[0].node !== NODOS.abreOficina) throw new Error('«Unir lo del dueño al paquete» ya no va directo a «FIN · ¿abre la oficina?»: el flujo cambió, se revisa la conexión')
  b4.parameters.jsCode = cambiarB4(moduloConSoloP10(b4.parameters.jsCode))
  vuelta.parameters.jsCode = cambiarVuelta(vuelta.parameters.jsCode)
  armarOf.parameters.jsCode = cambiarSemillaDeLaOficina(armarOf.parameters.jsCode)
  const [x, y] = unir.position
  const cond = (leftValue) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} })
  copia.nodes.push(
    { parameters: cond(`={{ ${WEBHOOK_BODY}.plan_v3 === true && typeof ${WEBHOOK_BODY}.corrida === 'string' && ${WEBHOOK_BODY}.corrida.length > 0 && typeof ${WEBHOOK_BODY}.client_id === 'string' && ${WEBHOOK_BODY}.client_id.length > 0 }}`), name: PV.si, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 120, y + 760] },
    { parameters: { jsCode: CODIGO_ARMAR }, name: PV.armar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 360, y + 760] },
    {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/planeacion/dato' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}',
        options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
      },
      name: PV.dato, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 600, y + 760], onError: 'continueRegularOutput',
    },
    { parameters: { jsCode: CODIGO_PAQUETE }, name: PV.paquete, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 840, y + 760] },
  )
  const enlace = (de, a, i = 0) => { copia.connections[de] = copia.connections[de] || { main: [] }; while (copia.connections[de].main.length <= i) copia.connections[de].main.push([]); copia.connections[de].main[i].push({ node: a, type: 'main', index: 0 }) }
  copia.connections[NODOS.unir].main[0] = [{ node: PV.si, type: 'main', index: 0 }]
  enlace(PV.si, PV.armar, 0)               // pide el dato v1 (plan_v3 + corrida + client_id)
  enlace(PV.si, NODOS.abreOficina, 1)      // no lo pide: DIRECTO (idéntico a hoy)
  enlace(PV.armar, PV.dato)
  enlace(PV.dato, PV.paquete)
  enlace(PV.paquete, NODOS.abreOficina)
  return copia
}
/** B4 ya trae el módulo común de F4; aquí solo se le deja listo para sumarle P10 (misma operación que «¿Llegó la vuelta?») */
function moduloConSoloP10(codigo) { return moduloConP10Sobre(codigo) }

// ── CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const salida = arg ? arg.slice('--salida='.length) : aqui
  const despues = conectaPlanV3(antesDeLaConexion())
  const ruta = join(salida, 'ARREGLADO-X9F0zp6LQ2xGEYVS-conexion-plan-v3-2026-10-15.json')
  fs.writeFileSync(ruta, JSON.stringify(despues, null, 2))
  console.log(`plan · ${despues.nodes.length} nodos (+${NOMBRES_NUEVOS.length}) → ${ruta}`)
}
