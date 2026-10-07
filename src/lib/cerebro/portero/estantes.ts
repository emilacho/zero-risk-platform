/**
 * LISTAS GRANDES POR NIVELES (diseño v3 §3 · paso 6). Cuando la lista no cabe entera en una llamada, el archivo se recorre por niveles con
 * campos que YA existen en cada ficha: ESTANTE → CLASE → FAMILIA. En cada nivel el sistema arma, sin modelo, una línea por grupo (conteo,
 * peso y títulos de lo más reciente) y el PORTERO decide qué grupos abrir. No hay tablas de reglas ni búsqueda por palabras: ninguna línea
 * se oculta por «parecerse poco» al pedido. Si lo abierto aún no cabe, se lee entero en TROZOS consecutivos (cada trozo, una llamada),
 * así toda línea de lo elegido es alcanzable. Los números de las líneas son SIEMPRE los de la lista completa.
 */
import type { Pedido } from '../conversacion'
import type { Ficha } from '../tipos'
import { armarMensaje, INSTRUCCION_DEL_PORTERO } from './instruccion'
import { lineaParaElModelo, type LineaNumerada, type ListaNumerada } from './lista-numerada'
import { CARACTERES_POR_TOKEN, estimarTokens } from './medida'

export type Nivel = 'estante' | 'clase' | 'familia'
export const NIVELES: readonly Nivel[] = ['estante', 'clase', 'familia']

const MAXIMO_DE_RECIENTES = 5
/** lo que se reserva para el recordatorio de «parte i de n» que lleva cada trozo */
const RESERVA_POR_PARTE = 450
const SIN_FAMILIA = '(sin familia)'

export interface Grupo { nombre: string; lineas: LineaNumerada[] }

/** el grupo al que pertenece una ficha en cada nivel (campos de la propia ficha; nada se infiere del texto) */
export function claveDeNivel(f: Ficha, nivel: Nivel): string {
  if (nivel === 'estante') return f.estante
  if (nivel === 'clase') return `${f.estante} ${f.clase}`
  const fam = typeof f.datos?.familia === 'string' ? f.datos.familia.replace(/\s+/g, ' ').trim() : ''
  return fam || SIN_FAMILIA
}

/** ¿la ficha trae familia? Las que no la traen (páginas, sedes, horarios, documentos…) NO forman un grupo que el modelo deba adivinar: se abren siempre (arreglo de la condición 2 de CC#3) */
export const tieneFamilia = (f: Ficha): boolean => typeof f.datos?.familia === 'string' && f.datos.familia.replace(/\s+/g, ' ').trim() !== ''

/** el nombre de un grupo sin importar mayúsculas, espacios de más ni comillas que el modelo le ponga alrededor */
export const normalizarNombre = (t: string): string => t.replace(/[«»"'`“”‘’]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

export function agruparLineas(lineas: LineaNumerada[], nivel: Nivel): Grupo[] {
  const por = new Map<string, Grupo>()
  for (const l of lineas) {
    const nombre = claveDeNivel(l.ficha, nivel)
    const k = normalizarNombre(nombre)
    const g = por.get(k)
    if (g) g.lineas.push(l)
    else por.set(k, { nombre, lineas: [l] })
  }
  return [...por.values()].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0))
}

export const agruparPorEstante = (numerada: ListaNumerada): Grupo[] => agruparLineas(numerada.lineas, 'estante')

const masReciente = (a: LineaNumerada, b: LineaNumerada): number => {
  const x = a.ficha.fecha_fuente ?? ''
  const y = b.ficha.fecha_fuente ?? ''
  return x < y ? 1 : x > y ? -1 : a.numero - b.numero
}

/** una línea por grupo: conteo, peso total y los títulos de las 5 cosas más recientes (sin modelo); en el nivel de estante, también cuántas de cada clase */
export function indiceDeGrupos(grupos: Grupo[], nivel: Nivel): string {
  return grupos.map((g) => {
    const peso = g.lineas.reduce((a, l) => a + l.ficha.peso_estimado, 0)
    const recientes = [...g.lineas].sort(masReciente).slice(0, MAXIMO_DE_RECIENTES).map((l) => l.ficha.titulo.replace(/\s+/g, ' ').trim().slice(0, 80))
    let clases = ''
    if (nivel === 'estante') {
      const por = new Map<string, number>()
      for (const l of g.lineas) por.set(l.ficha.clase, (por.get(l.ficha.clase) ?? 0) + 1)
      clases = ` · clases: ${[...por.entries()].map(([c, n]) => `${c} ${n}`).join(', ')}`
    }
    return `${g.nombre} · ${g.lineas.length} cosas · peso ${peso}${clases} · más recientes: ${recientes.join(' | ')}`
  }).join('\n')
}
export const indiceDeEstantes = (grupos: Grupo[]): string => indiceDeGrupos(grupos, 'estante')

/** la lista que ve el modelo con SOLO estas líneas (con su número de la lista completa) */
export function vistaDe(numerada: ListaNumerada, lineas: LineaNumerada[]): ListaNumerada {
  return { ...numerada, lineas, texto: lineas.map((l) => lineaParaElModelo(l.numero, l.ficha)).join('\n') }
}

const largo = (l: LineaNumerada): number => lineaParaElModelo(l.numero, l.ficha).length + 1

/** cuántos caracteres de líneas caben en UNA llamada de decisión, descontando instrucción, pedido y el recordatorio de parte */
export function presupuestoDeLineas(numerada: ListaNumerada, pedido: Pedido, topeDeEntrada: number): number {
  const base = estimarTokens(INSTRUCCION_DEL_PORTERO.length + armarMensaje(pedido, { ...numerada, texto: '' }).length)
  return Math.max(0, Math.floor((topeDeEntrada - base) * CARACTERES_POR_TOKEN) - RESERVA_POR_PARTE)
}

export const cabeEnUna = (lineas: LineaNumerada[], presupuesto: number): boolean => lineas.reduce((a, l) => a + largo(l), 0) <= presupuesto

/**
 * parte las líneas en trozos CONSECUTIVOS (en el orden de la lista) que caben cada uno en `presupuesto`. Ninguna línea se descarta:
 * una línea que sola pasa el presupuesto queda en un trozo propio.
 */
export function trocear(lineas: LineaNumerada[], presupuesto: number): LineaNumerada[][] {
  const trozos: LineaNumerada[][] = []
  let actual: LineaNumerada[] = []
  let usado = 0
  for (const l of lineas) {
    const n = largo(l)
    if (actual.length > 0 && usado + n > presupuesto) { trozos.push(actual); actual = []; usado = 0 }
    actual.push(l)
    usado += n
  }
  if (actual.length > 0) trozos.push(actual)
  return trozos
}
