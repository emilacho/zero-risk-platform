/**
 * PERFIL DEL PÚBLICO · T2b · el PRODUCTOR de piezas (`lVCLzxQCKNkd3uS0`) lee el perfil por la PUERTA del cerebro · CC3 · 2026-11-11 · GO Lenovo 14:25 Zúrich.
 * SIN red: parte del respaldo EXACTO del vivo (`vivo/lVCLzxQCKNkd3uS0-antes-t2b-2026-11-11.json`, sacado con `n8n-flujo.mjs respaldar`) y escribe
 * `nuevo/lVCLzxQCKNkd3uS0-t2b.json`. NADA se publica aquí: se publica con la certificación de CC6, n8n en 0/0 y `n8n-flujo.mjs restaurar … --ejecutar`;
 * la REVERSA es restaurar el respaldo.
 *
 * Qué cambia (lo mínimo):
 *   1. Un nodo HTTP nuevo, «⑤ Perfil del público · puerta del cerebro», entre la ficha y las sedes: `GET /api/brain/consultar` con la llave interna,
 *      `oficina=productor`, `agente=campaign-brief-agent` (queda registrado quién consulta). US$ 0, sin reintento, nunca se traga un error:
 *      `fullResponse` + `neverError` + `continueRegularOutput` y el nodo del cuerpo declara el fallo como «no disponible».
 *   2. «⑤ Armar el cuerpo del productor»: el bloque del perfil entra al pedido después del trato. Sin perfil el bloque es VACÍO y el pedido queda
 *      idéntico (hoy no hay ningún perfil: T3 apagado). El lector va EMPAQUETADO desde `src/lib/perfil-del-publico/para-el-productor.ts`, no copiado.
 *   3. La pieza lleva `perfil_resumen` (estado, corte y ficha, sin el texto) para que quien aprueba vea si hubo perfil.
 * Lo que NO toca: ningún chequeo nuevo (nada frena ni se verifica), las tablas del cerebro, el plan (T2c) ni la palanca (T3).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { AQUI, agregarNodo, cambiarCodigo, conectar, nodo, redirigir } from './lib.mjs'

export const ID = 'lVCLzxQCKNkd3uS0'
export const RESPALDO = path.join(AQUI, 'vivo', `${ID}-antes-t2b-2026-11-11.json`)
export const SALIDA = path.join(AQUI, 'nuevo', `${ID}-t2b.json`)
export const NODO_PERFIL = '⑤ Perfil del público · puerta del cerebro'
const FICHA = '⑤ Ficha del cliente'
const SEDES = '⑤ Sedes y voz del cliente'
const CUERPO = '⑤ Armar el cuerpo del productor'
const SOBRE = '⓪ Sobre · llave · modo seco'
export const GLOBAL = 'PERFIL_DEL_PUBLICO'
const RAIZ = path.join(AQUI, '..', '..', '..')

/** el lector del perfil EMPAQUETADO (esbuild, el mismo que ya trae vite): IIFE pura, sin `require` ni `import` */
export function paqueteDelPerfil() {
  const req = createRequire(path.join(RAIZ, 'package.json'))
  const esbuild = createRequire(req.resolve('vite/package.json'))('esbuild')
  const r = esbuild.buildSync({
    stdin: { contents: "export { perfilDelProductor, bloqueDelPerfil, resumenDelPerfil } from './src/lib/perfil-del-publico/para-el-productor'", resolveDir: RAIZ, loader: 'ts' },
    bundle: true, format: 'iife', globalName: GLOBAL, platform: 'neutral', target: 'es2020', write: false, treeShaking: true, charset: 'utf8', legalComments: 'none',
  })
  const js = r.outputFiles[0].text.replace(/\r\n/g, '\n')
  if (/\brequire\(|^\s*import\s/m.test(js)) throw new Error('el paquete del perfil trae require/import: no corre en un nodo Code de n8n')
  return js
}

const URL_PUERTA = `=https://zero-risk-platform.vercel.app/api/brain/consultar?client_id={{ encodeURIComponent($('${SOBRE}').first().json.client_id) }}&oficina=productor&agente=campaign-brief-agent&clase=informe_de_analisis&limite=1`

export const ANCLA_REGLAS = 'const REGLAS = ['
export const LECTURA = [
  '// 🔴 11-nov · T2b · PERFIL DEL PÚBLICO (GO Lenovo 14:25 Zúrich): el productor lo lee por la PUERTA del cerebro (nodo «' + NODO_PERFIL + '»), nunca por tablas.',
  '// Sin perfil (hoy: T3 apagado) el bloque es VACÍO y el pedido queda idéntico al de antes. Un fallo al leer es «no disponible», nunca «no hay». CONTEXTO, NO MANDATO.',
  `const perfilDelPublico = ${GLOBAL}.perfilDelProductor($('${NODO_PERFIL}').first().json)`,
  `const bloquePerfil = ${GLOBAL}.bloqueDelPerfil(perfilDelPublico)`,
  `const perfil_resumen = ${GLOBAL}.resumenDelPerfil(perfilDelPublico)`,
  '',
].join('\n')
const TRATO_VIEJO = "  bloqueDeTrato(trato),\n  '',\n  'Reglas de la pieza:',"
export const TRATO_NUEVO = "  bloqueDeTrato(trato),\n  '',\n  bloquePerfil,\n  '',\n  'Reglas de la pieza:',"
const SALIDA_VIEJA = 'voz_resumen } }]'
const SALIDA_NUEVA = 'voz_resumen, perfil_resumen } }]'

export function construirPerfilT2b(f, paquete = paqueteDelPerfil()) {
  if (f.id !== ID) throw new Error(`este constructor es solo para ${ID}`)
  const anterior = f.connections[FICHA]?.main?.[0]
  if (!anterior || anterior.length !== 1 || anterior[0].node !== SEDES) throw new Error('la ficha ya no va directo a las sedes: el vivo cambió, vuelve a respaldar')
  agregarNodo(f, {
    name: NODO_PERFIL, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      method: 'GET', url: URL_PUERTA, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, FICHA, 0, 220)
  redirigir(f, FICHA, SEDES, NODO_PERFIL)
  conectar(f, NODO_PERFIL, SEDES)
  const c = nodo(f, CUERPO).parameters.jsCode
  nodo(f, CUERPO).parameters.jsCode = `// ── PERFIL DEL PÚBLICO · T2b · empaquetado de src/lib/perfil-del-publico/para-el-productor.ts (no editar a mano) ──\n${paquete}\n${c}`
  cambiarCodigo(f, CUERPO, ANCLA_REGLAS, LECTURA + ANCLA_REGLAS)
  cambiarCodigo(f, CUERPO, TRATO_VIEJO, TRATO_NUEVO)
  cambiarCodigo(f, CUERPO, SALIDA_VIEJA, SALIDA_NUEVA)
  return f
}

if (process.argv[1] && process.argv[1].endsWith('perfil-t2b-productor.mjs')) {
  const f = construirPerfilT2b(JSON.parse(fs.readFileSync(RESPALDO, 'utf8')))
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true })
  fs.writeFileSync(SALIDA, JSON.stringify(f, null, 2) + '\n')
  console.log('escrito', path.relative(RAIZ, SALIDA), '· nodos', f.nodes.length)
}
