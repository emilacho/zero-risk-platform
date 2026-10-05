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
  duda: number[]
  /** números que el modelo puso y que no están en la lista (descartados) */
  numeros_invalidos: unknown[]
  /** solo cuando la lista estaba vacía: no hay nada que elegir */
  sin_material?: boolean
}

export type CaidaDeLaRespuesta = 'json_roto' | 'campos_que_faltan' | 'todos_los_numeros_invalidos' | 'entregar_vacio_sospechoso'
export type ResultadoDeDecision = { ok: true; decision: Decision } | { ok: false; caida: CaidaDeLaRespuesta }

const MAXIMO_DE_PIXELES = 6
const MAXIMO_DE_FRASE = 300
const CLASES_CON_PIXELES = new Set(['foto', 'portada_de_video'])
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const frase = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAXIMO_DE_FRASE) : null)

function leerJson(crudo: string): unknown {
  const t = crudo.trim()
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)
  return JSON.parse(m ? m[1] : t)
}

export function interpretarDecision(textoCrudo: string, numerada: ListaNumerada, opciones: { pixeles: boolean }): ResultadoDeDecision {
  let x: unknown
  try { x = leerJson(textoCrudo) } catch { return { ok: false, caida: 'json_roto' } }
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
