/**
 * SALIDA ESTRUCTURADA POR CORRIDA · OPT-IN (cadena · PR 3 · CC#1 · 2026-10-09 · diseño v2 §9.2, condición 7 de CC#3).
 *
 * El pedido puede traer `output_schema` (un JSON Schema): el corredor se lo pasa al SDK como `outputFormat: { type: 'json_schema', schema }`
 * y devuelve el objeto ya validado por el modelo (`structured_output`). Sin `output_schema` el camino es EXACTAMENTE el de siempre.
 *
 * Un esquema MAL ESCRITO se rechaza (400) ANTES de gastar, igual que el tope y el modelo: ignorarlo correría el agente sin formato y se pagaría un texto libre.
 * Subconjunto aceptado (lo que el modo estructurado puede garantizar): object / array / string / integer / number / boolean / null / enum / required / anyOf,
 * con `additionalProperties: false` en CADA objeto. Nada de minLength / maxLength / minimum / maximum / pattern / format / $ref: eso se valida en el código
 * (el modo estructurado no lo garantiza). Tope de tamaño 20 KB y profundidad 8.
 *
 * La copia de este archivo que usa la ruta `run-sdk` (`src/lib/salida-estructurada.ts`) debe ser IDÉNTICA; lo comprueba una prueba.
 */
import { createHash } from 'node:crypto'

export const ESQUEMA_MAX_BYTES = 20_000
export const ESQUEMA_MAX_PROFUNDIDAD = 8
const CLAVES_PERMITIDAS = new Set(['type', 'properties', 'required', 'items', 'enum', 'additionalProperties', 'anyOf', 'description', 'title'])
const TIPOS = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'])

export type EsquemaResuelto =
  | { ok: true; valor: Record<string, unknown> | null; hash: string | null }
  | { ok: false; motivo: string }

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

/** Recorre el esquema y devuelve el primer problema (o null). `ruta` solo sirve para decir dónde. */
function problema(nodo: unknown, ruta: string, prof: number): string | null {
  if (prof > ESQUEMA_MAX_PROFUNDIDAD) return `${ruta}: más de ${ESQUEMA_MAX_PROFUNDIDAD} niveles de profundidad`
  if (!esObjeto(nodo)) return `${ruta}: debe ser un objeto`
  for (const k of Object.keys(nodo)) {
    if (!CLAVES_PERMITIDAS.has(k)) return `${ruta}: la clave «${k}» no está permitida (el modo estructurado no la garantiza: se valida en el código)`
  }
  const enums = nodo.enum
  if (enums !== undefined) {
    if (!Array.isArray(enums) || enums.length === 0 || !enums.every((e) => typeof e === 'string' || typeof e === 'number')) return `${ruta}.enum: lista no vacía de textos o números`
    return null
  }
  if (nodo.anyOf !== undefined) {
    if (!Array.isArray(nodo.anyOf) || nodo.anyOf.length === 0) return `${ruta}.anyOf: lista no vacía`
    for (let i = 0; i < nodo.anyOf.length; i++) {
      const p = problema(nodo.anyOf[i], `${ruta}.anyOf[${i}]`, prof + 1)
      if (p) return p
    }
    return null
  }
  const tipo = nodo.type
  if (typeof tipo !== 'string' || !TIPOS.has(tipo)) return `${ruta}.type: debe ser uno de ${[...TIPOS].join(' | ')}`
  if (tipo === 'object') {
    if (nodo.additionalProperties !== false) return `${ruta}: todo objeto lleva additionalProperties: false`
    const props = nodo.properties
    if (!esObjeto(props)) return `${ruta}.properties: debe ser un objeto`
    for (const [n, sub] of Object.entries(props)) {
      const p = problema(sub, `${ruta}.properties.${n}`, prof + 1)
      if (p) return p
    }
    const req = nodo.required
    if (req !== undefined) {
      if (!Array.isArray(req) || !req.every((r) => typeof r === 'string')) return `${ruta}.required: lista de textos`
      for (const r of req) if (!(r in props)) return `${ruta}.required: «${r}» no está en properties`
    }
  } else if (tipo === 'array') {
    const p = problema(nodo.items, `${ruta}.items`, prof + 1)
    if (p) return p
  } else if (nodo.properties !== undefined || nodo.items !== undefined || nodo.required !== undefined || nodo.additionalProperties !== undefined) {
    return `${ruta}: un ${tipo} no lleva properties/items/required/additionalProperties`
  }
  return null
}

/** Texto canónico (claves ordenadas) para que el mismo esquema dé siempre el mismo sello. */
function canonico(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(canonico).join(',') + ']'
  if (esObjeto(x)) return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canonico(x[k])).join(',') + '}'
  return JSON.stringify(x)
}

export function hashDeEsquema(schema: Record<string, unknown>): string {
  return createHash('sha256').update(canonico(schema)).digest('hex').slice(0, 16)
}

export function validarEsquemaDeSalida(x: unknown): EsquemaResuelto {
  if (!esObjeto(x)) return { ok: false, motivo: 'output_schema debe ser un objeto JSON Schema' }
  if (x.type !== 'object') return { ok: false, motivo: 'output_schema: la raíz debe ser type: object' }
  const bytes = Buffer.byteLength(JSON.stringify(x), 'utf8')
  if (bytes > ESQUEMA_MAX_BYTES) return { ok: false, motivo: `output_schema pesa ${bytes} bytes y el tope es ${ESQUEMA_MAX_BYTES}` }
  const p = problema(x, 'output_schema', 1)
  if (p) return { ok: false, motivo: p }
  return { ok: true, valor: x, hash: hashDeEsquema(x) }
}

/** el primer candidato presente (no `undefined`) manda; `null` explícito NO es «ausente» y se rechaza; un texto JSON se lee una sola vez */
export function resolverEsquema(...candidatos: unknown[]): EsquemaResuelto {
  const presente = candidatos.find((c) => c !== undefined)
  if (presente === undefined) return { ok: true, valor: null, hash: null }
  let valor = presente
  if (typeof presente === 'string') {
    try { valor = JSON.parse(presente) } catch { return { ok: false, motivo: 'output_schema llegó como texto que no es JSON' } }
  }
  return validarEsquemaDeSalida(valor)
}

export const SUBTIPO_REINTENTOS_AGOTADOS = 'error_max_structured_output_retries'

/** Causa de un fallo de la salida estructurada · null si no aplica (sin esquema, o llegó el objeto). Sin objeto NO hay éxito: el texto libre no se da por respuesta. */
export function falloDeSalidaEstructurada(
  esquema: Record<string, unknown> | null | undefined,
  resultSubtype: string | null | undefined,
  structuredOutput: unknown,
): string | null {
  if (!esquema) return null
  if (resultSubtype === SUBTIPO_REINTENTOS_AGOTADOS) return 'E-OUTPUT-SCHEMA-RETRIES · el modelo no logró entregar el formato pedido tras los reintentos del SDK'
  if (structuredOutput === undefined || structuredOutput === null) return 'E-OUTPUT-SCHEMA-MISSING · la corrida terminó sin el objeto estructurado que se pidió'
  return null
}
