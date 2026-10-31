/**
 * Constructor de los flujos de n8n de la oficina de marketing (T5 · CC#2 · 31-oct). SIN red: parte de la copia VIVA respaldada (`vivo/<id>.json`, sacada con
 * `scripts/ops/n8n-flujo.mjs respaldar`) y produce el flujo NUEVO (`nuevo/<id>.json`) con cambios mínimos y deterministas. NADA se publica aquí: la publicación es de T9
 * (una sola vez, con n8n en 0/0 y la certificación de CC#3), con `n8n-flujo.mjs restaurar <id> <archivo> --ejecutar`, y la REVERSA es restaurar `vivo/<id>.json`.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const AQUI = path.dirname(fileURLToPath(import.meta.url))

export function leerVivo(id) {
  return JSON.parse(fs.readFileSync(path.join(AQUI, 'vivo', `${id}.json`), 'utf8'))
}

/** el id de un nodo nuevo es determinista (mismo nombre ⇒ mismo id): dos corridas del constructor dan el mismo archivo */
export const idDeNodo = (flujo, nombre) => {
  const h = crypto.createHash('sha1').update(`${flujo}|${nombre}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export const nodo = (f, nombre) => {
  const n = f.nodes.find((x) => x.name === nombre)
  if (!n) throw new Error(`el flujo ${f.name} no tiene el nodo «${nombre}» (¿cambió el vivo? vuelve a respaldar y revisa)`)
  return n
}

/** cambia el código de un nodo Code: el fragmento viejo debe aparecer UNA sola vez (si el vivo cambió, el constructor se detiene) */
export function cambiarCodigo(f, nombre, viejo, nuevo) {
  const n = nodo(f, nombre)
  const c = n.parameters.jsCode
  const i = c.indexOf(viejo)
  if (i < 0 || c.indexOf(viejo, i + 1) >= 0) throw new Error(`«${nombre}»: el fragmento a cambiar no aparece exactamente una vez: ${viejo.slice(0, 70)}`)
  n.parameters.jsCode = c.replace(viejo, () => nuevo)
}

export function agregarNodo(f, def, junto, dx, dy) {
  if (f.nodes.some((x) => x.name === def.name)) throw new Error(`el nodo «${def.name}» ya existe`)
  const base = nodo(f, junto).position
  const n = { id: idDeNodo(f.id, def.name), position: [base[0] + dx, base[1] + dy], typeVersion: def.typeVersion ?? 2, ...def }
  f.nodes.push(n)
  return n
}

export const codigo = (name, jsCode) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode } })

export const si = (name, izquierda, derecha = true, operacion = 'equals', tipo = 'boolean') => ({
  name, type: 'n8n-nodes-base.if', typeVersion: 2,
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: izquierda, rightValue: derecha, operator: { type: tipo, operation: operacion } }] }, options: {} },
})

export const http = (name, url, headers, cuerpoJs, timeout = 60000) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: {
    method: 'POST', url, sendHeaders: true,
    headerParameters: { parameters: headers },
    sendBody: true, specifyBody: 'json', jsonBody: cuerpoJs,
    options: { timeout, response: { response: { fullResponse: true, neverError: true } } },
  },
})

/** reemplaza el destino `viejo` de la salida `salida` (0 por omisión) del nodo `de` por `nuevo`; si no estaba, se detiene */
export function redirigir(f, de, viejo, nuevo, salida = 0) {
  const grupo = f.connections[de]?.main?.[salida]
  const c = grupo?.find((x) => x.node === viejo)
  if (!c) throw new Error(`«${de}» no conectaba la salida ${salida} con «${viejo}»`)
  c.node = nuevo
}

export function conectar(f, de, a, salida = 0) {
  f.connections[de] ??= { main: [] }
  const m = f.connections[de].main
  while (m.length <= salida) m.push([])
  m[salida] = m[salida] ?? []
  m[salida].push({ node: a, type: 'main', index: 0 })
}

export function escribirNuevo(f) {
  const dir = path.join(AQUI, 'nuevo')
  fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, `${f.id}.json`)
  fs.writeFileSync(archivo, JSON.stringify(f, null, 2) + '\n')
  return archivo
}
