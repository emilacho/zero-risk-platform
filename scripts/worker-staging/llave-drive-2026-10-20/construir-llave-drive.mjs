#!/usr/bin/env node
/**
 * La llave en las dos puertas de Drive (texto-a-drive y manual-a-drive) y en quienes las llaman · CC#3 · 2026-10-20 · GO de Lenovo (16:20 Berlín).
 *   node construir-llave-drive.mjs   · lee <id>-ANTES.json (respaldo EXACTO del flujo vivo) y escribe <id>-ARREGLADO.json
 *
 * Qué cambia (y nada más):
 *   · PUERTAS (rXR5GmnrGF6Dkwgq · XTQTgIUMq9OHNs0a): un nodo Code «⓪ Llave · Drive» entre el webhook y el primer nodo. Mismo patrón que `zero-risk/brief`,
 *     `pieza`, `rsa-generate` (E67): exige la cabecera `x-sala-dispatch-key` == `$env.SALA_DISPATCH_KEY` del motor, comparación de largo constante, CERRADO si el motor no la tiene.
 *   · LLAMADORES (un nodo HTTP por flujo): mandan esa misma cabecera desde `$env.SALA_DISPATCH_KEY` (la llave nunca se escribe en el flujo).
 *     En el Cimiento el nodo cambia de destino cuando dry_run=true (va al eco de la plataforma): ahí la cabecera va VACÍA, la llave solo viaja a la puerta de n8n.
 * No toca los flujos inactivos «TEMPORAL» (si alguno se activara, tendría que mandar la cabecera).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const CABECERA = 'x-sala-dispatch-key'
const VALOR = '={{ $env.SALA_DISPATCH_KEY }}'
const VALOR_CIMIENTO = "={{ $('Validate Deal Data').first().json.dry_run === true ? '' : $env.SALA_DISPATCH_KEY }}"

export const CODIGO_LLAVE = `// ⓪ LA LLAVE · CC#3 · 2026-10-20 · puerta de Drive (GO Lenovo) · mismo patrón que \`zero-risk/brief\`, \`pieza\` y \`rsa-generate\` (lección E67).
// Este flujo ESCRIBE en el Drive de Emilio (crea carpetas y documentos en «Cuentas»). Por eso exige la llave de despacho del motor en la cabecera
// \`x-sala-dispatch-key\` (la misma \`SALA_DISPATCH_KEY\` del entorno de n8n; no se copia a ningún otro sitio) y, si falta o no coincide, se DETIENE antes de tocar nada.
// Falla CERRADO: sin la llave en el entorno, el flujo queda cerrado. Quienes lo llaman (planeación, brief, cadena, manual, cimiento) la mandan desde su propio \`$env\`.
const w = $input.first().json || {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}
const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) {
  throw new Error('DRIVE_CERRADO · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) en su entorno · este flujo escribe en Drive y queda cerrado hasta que exista · E67.')
}
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) {
  throw new Error('DRIVE_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · este flujo escribe en Drive y solo lo despiertan los flujos de la oficina · E67.')
}
return $input.all()
`

const PUERTAS = ['rXR5GmnrGF6Dkwgq', 'XTQTgIUMq9OHNs0a']
const LLAMADORES = {
  X9F0zp6LQ2xGEYVS: ['Plan → Drive (PDF)'],
  PQdIgbuFexuBsoh8: ['⑤ Parte a Drive'],
  BNXqlaX1oHSfZIpF: ['⑤ Parte a Drive'],
  aTLEk64o1BFAindd: ['PDF a Drive'],
  ssLtwYPt7zxuvnM2: ['[BB] Manual → Drive (PDF)'],
}

export function conPuerta(flujo) {
  const f = structuredClone(flujo)
  const wh = f.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')
  if (f.nodes.some((n) => n.name === '⓪ Llave · Drive')) throw new Error('ya tiene la puerta: ' + f.id)
  const sig = f.connections[wh.name].main[0]
  const puerta = {
    parameters: { jsCode: CODIGO_LLAVE },
    id: crypto.randomUUID(),
    name: '⓪ Llave · Drive',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [(wh.position?.[0] ?? 0) + 40, (wh.position?.[1] ?? 0) + 220],
  }
  f.nodes.push(puerta)
  f.connections[wh.name] = { main: [[{ node: puerta.name, type: 'main', index: 0 }]] }
  f.connections[puerta.name] = { main: [sig] }
  return f
}

export function conCabecera(flujo, nombres) {
  const f = structuredClone(flujo)
  for (const nombre of nombres) {
    const n = f.nodes.find((x) => x.name === nombre)
    if (!n) throw new Error(`no existe el nodo «${nombre}» en ${f.id}`)
    if (n.type !== 'n8n-nodes-base.httpRequest') throw new Error('no es un HTTP: ' + nombre)
    const params = n.parameters.headerParameters?.parameters ?? []
    if (params.some((p) => p.name === CABECERA)) throw new Error(`«${nombre}» ya manda la cabecera`)
    n.parameters.sendHeaders = true
    n.parameters.headerParameters = { parameters: [...params, { name: CABECERA, value: f.id === 'ssLtwYPt7zxuvnM2' ? VALOR_CIMIENTO : VALOR }] }
  }
  return f
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const leer = (id) => JSON.parse(fs.readFileSync(path.join(DIR, `${id}-ANTES.json`), 'utf8'))
  const escribir = (id, f) => fs.writeFileSync(path.join(DIR, `${id}-ARREGLADO.json`), JSON.stringify(f, null, 2) + '\n')
  for (const id of PUERTAS) escribir(id, conPuerta(leer(id)))
  for (const [id, nodos] of Object.entries(LLAMADORES)) escribir(id, conCabecera(leer(id), nodos))
  console.log('escritos', PUERTAS.length + Object.keys(LLAMADORES).length, 'ARREGLADO')
}
