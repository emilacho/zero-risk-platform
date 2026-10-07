/**
 * LO QUE DECIDIÓ EL MODELO, leído con las reglas de la sección 1.5 del diseño del tramo 2.
 *
 * El modelo devuelve SOLO números y frases cortas; el sistema los traduce a referencias y copia el texto por su cuenta
 * (el modelo nunca transcribe material). Nada de lo que el modelo escribe se toma sin comprobar: una respuesta rota,
 * vacía donde había material, o con números inventados cae al respaldo con su motivo; nunca se lee como «sin material».
 */
import type { ListaNumerada } from './lista-numerada'

export interface Decision {
  /** referencias de lo que el portero decidió entregar, en su orden */
  entregar: string[]
  entregar_numeros: number[]
  /** referencias de las fotos o portadas que el empleado debe VER (a lo más 6) */
  pixeles: string[]
  por_que: Array<{ numeros: number[]; linea: string }>
  faltantes: string[]
  /** solo al leer una lista por trozos: lo que un trozo dio por «faltante» y que puede estar en otro trozo (NO es un faltante declarado) */
  faltantes_no_concluyentes?: string[]
  duda: number[]
  /** números que el modelo puso y que no están en la lista (descartados) */
  numeros_invalidos: unknown[]
  /** solo cuando la lista estaba vacía: no hay nada que elegir */
  sin_material?: boolean
}

export type CaidaDeLaRespuesta = 'json_roto' | 'salida_cortada' | 'campos_que_faltan' | 'todos_los_numeros_invalidos' | 'entregar_vacio_sospechoso'
export type ResultadoDeDecision = { ok: true; decision: Decision } | { ok: false; caida: CaidaDeLaRespuesta }

const MAXIMO_DE_PIXELES = 6
const MAXIMO_DE_FRASE = 300
const CLASES_CON_PIXELES = new Set(['foto', 'portada_de_video'])
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const frase = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAXIMO_DE_FRASE) : null)

const MAXIMO_DE_INICIOS = 60

/** el cierre de la llave que abre en `desde`, sabiendo de comillas y escapes (una llave dentro de una frase no cuenta); -1 si no cierra */
function cierreDeLaLlave(t: string, desde: number): number {
  let profundidad = 0
  let enTexto = false
  for (let i = desde; i < t.length; i++) {
    const c = t[i]
    if (enTexto) { if (c === '\\') i++; else if (c === '"') enTexto = false; continue }
    if (c === '"') enTexto = true
    else if (c === '{') profundidad++
    else if (c === '}' && --profundidad === 0) return i
  }
  return -1
}

/**
 * Lee el JSON de lo que contestó el modelo AUNQUE traiga texto antes o después (4 de 20 respuestas reales venían con un párrafo).
 * Primero el texto entero; si no, el primer objeto que trae la clave pedida; si ninguno la trae, el primer objeto que se pueda leer
 * (así «campos que faltan» sigue siendo distinto de «json roto»). Nada del texto de alrededor entra a la decisión.
 */
export function extraerJson(crudo: string, clave: string): { valor: unknown } | null {
  const t = crudo.trim()
  const envuelto = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)
  try { return { valor: JSON.parse(envuelto ? envuelto[1] : t) } } catch { /* sigue: hay texto alrededor */ }
  let primero: { valor: unknown } | null = null
  let inicios = 0
  for (let i = t.indexOf('{'); i !== -1 && inicios < MAXIMO_DE_INICIOS; i = t.indexOf('{', i + 1), inicios++) {
    const fin = cierreDeLaLlave(t, i)
    if (fin === -1) continue
    let v: unknown
    try { v = JSON.parse(t.slice(i, fin + 1)) } catch { continue }
    if (!esObjeto(v)) continue
    if (clave in v) return { valor: v }
    primero ??= { valor: v }
  }
  return primero
}

export function interpretarDecision(textoCrudo: string, numerada: ListaNumerada, opciones: { pixeles: boolean; cortada?: boolean }): ResultadoDeDecision {
  const leido = extraerJson(textoCrudo, 'entregar')
  // sin ninguna decisión legible: si el modelo paró por max_tokens se dice así, no «json roto»
  if (!leido) return { ok: false, caida: opciones.cortada ? 'salida_cortada' : 'json_roto' }
  const x = leido.valor
  if (!esObjeto(x) || !Array.isArray(x.entregar)) return { ok: false, caida: 'campos_que_faltan' }
  const porNumero = new Map(numerada.lineas.map((l) => [l.numero, l.ficha]))
  const validos: number[] = []
  const invalidos: unknown[] = []
  for (const n of x.entregar) {
    if (entero(n) && porNumero.has(n)) { if (!validos.includes(n)) validos.push(n) } else invalidos.push(n)
  }
  if (x.entregar.length > 0 && validos.length === 0) return { ok: false, caida: 'todos_los_numeros_invalidos' }
  const sinMaterial = x.entregar.length === 0 && numerada.lineas.length === 0
  // «no entrego nada» solo vale si de verdad no había nada que elegir; si no, es una respuesta sospechosa (el respaldo la cubre)
  if (x.entregar.length === 0 && !sinMaterial) return { ok: false, caida: 'entregar_vacio_sospechoso' }

  const pixelesPedidos = opciones.pixeles && Array.isArray(x.pixeles) ? (x.pixeles as unknown[]) : []
  const pixeles: string[] = []
  for (const n of pixelesPedidos) {
    const f = entero(n) ? porNumero.get(n) : undefined
    if (f && CLASES_CON_PIXELES.has(f.clase) && !pixeles.includes(f.ref) && pixeles.length < MAXIMO_DE_PIXELES) pixeles.push(f.ref)
  }
  const por_que: Decision['por_que'] = []
  if (Array.isArray(x.por_que)) {
    for (const p of x.por_que) {
      const linea = esObjeto(p) ? frase(p.linea) : null
      if (esObjeto(p) && linea && Array.isArray(p.numeros) && p.numeros.every(entero)) por_que.push({ numeros: p.numeros as number[], linea })
    }
  }
  const faltantes = Array.isArray(x.faltantes) ? (x.faltantes.map(frase).filter(Boolean) as string[]).slice(0, 20) : []
  const duda = Array.isArray(x.duda) ? [...new Set((x.duda as unknown[]).filter((n): n is number => entero(n) && porNumero.has(n)))] : []
  return {
    ok: true,
    decision: { entregar: validos.map((n) => (porNumero.get(n) as { ref: string }).ref), entregar_numeros: validos, pixeles, por_que, faltantes, duda, numeros_invalidos: invalidos, ...(sinMaterial ? { sin_material: true } : {}) },
  }
}
