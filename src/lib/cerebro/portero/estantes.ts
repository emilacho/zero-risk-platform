/**
 * LAS DOS PASADAS de una lista que no cabe entera (diseño firmado del tramo 2, sección «Más: dos pasadas»).
 *  1) el sistema agrupa por ESTANTE (mecánico, sin modelo): una línea por estante con su conteo, su peso y los títulos de las 5 cosas más recientes;
 *  2) el portero dice qué estantes abrir y el sistema despliega las líneas de esos estantes; si no caben, muestra las que MÁS COINCIDEN en palabras
 *     con el pedido (máx. 100 por estante) y el resto queda por conteo.
 * La coincidencia de palabras es el ÚNICO lugar con búsqueda (límite declarado en el diseño): no mira rubro ni tipo de trabajo, solo las palabras del pedido.
 * Los números de las líneas desplegadas son los de la lista COMPLETA, así lo que el portero elige se entrega con el mismo mecanismo de siempre.
 */
import type { Pedido } from '../conversacion'
import { armarMensaje, INSTRUCCION_DEL_PORTERO } from './instruccion'
import { lineaParaElModelo, type LineaNumerada, type ListaNumerada } from './lista-numerada'
import { CARACTERES_POR_TOKEN, estimarTokens } from './medida'

export const MAXIMO_DE_LINEAS_POR_ESTANTE = 100
const MAXIMO_DE_RECIENTES = 5
const RESERVA_POR_AVISO = 260

const SIN_VALOR = new Set(['para', 'como', 'pero', 'donde', 'cuando', 'porque', 'sobre', 'entre', 'desde', 'hasta', 'esta', 'este', 'esto', 'estos', 'estas', 'tengo', 'quiero', 'necesito', 'hacer', 'algo', 'todo', 'todos', 'cada', 'tiene', 'tienen'])

const palabras = (t: string): string[] =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !SIN_VALOR.has(w))

export function palabrasDelPedido(p: Pedido): Set<string> {
  const vp = p.voy_a_producir
  return new Set(palabras([vp.output, vp.material, vp.canal, vp.formato, vp.objetivo, p.necesito].filter(Boolean).join(' ')))
}

const puntaje = (l: LineaNumerada, buscadas: Set<string>): number => {
  if (buscadas.size === 0) return 0
  const f = l.ficha
  const dentro = new Set(palabras([f.titulo, f.que_es, ...(f.producto ?? [])].join(' ')))
  let n = 0
  for (const w of buscadas) if (dentro.has(w)) n++
  return n
}

export interface Estante { nombre: string; lineas: LineaNumerada[] }

export function agruparPorEstante(numerada: ListaNumerada): Estante[] {
  const por = new Map<string, LineaNumerada[]>()
  for (const l of numerada.lineas) por.set(l.ficha.estante, [...(por.get(l.ficha.estante) ?? []), l])
  return [...por.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([nombre, lineas]) => ({ nombre, lineas }))
}

const masReciente = (a: LineaNumerada, b: LineaNumerada): number => {
  const x = a.ficha.fecha_fuente ?? ''
  const y = b.ficha.fecha_fuente ?? ''
  return x < y ? 1 : x > y ? -1 : a.numero - b.numero
}

/** una línea por estante: conteo, peso total y los títulos de las 5 cosas más recientes (sin modelo) */
export function indiceDeEstantes(estantes: Estante[]): string {
  return estantes.map((e) => {
    const peso = e.lineas.reduce((a, l) => a + l.ficha.peso_estimado, 0)
    const clases = new Map<string, number>()
    for (const l of e.lineas) clases.set(l.ficha.clase, (clases.get(l.ficha.clase) ?? 0) + 1)
    const recientes = [...e.lineas].sort(masReciente).slice(0, MAXIMO_DE_RECIENTES).map((l) => l.ficha.titulo.replace(/\s+/g, ' ').trim().slice(0, 80))
    return `${e.nombre} · ${e.lineas.length} cosas · peso ${peso} · clases: ${[...clases.entries()].map(([c, n]) => `${c} ${n}`).join(', ')} · más recientes: ${recientes.join(' | ')}`
  }).join('\n')
}

export interface Despliegue {
  /** la lista que ve el modelo en la pasada 2: solo las líneas desplegadas (con su número de la lista completa) */
  numerada: ListaNumerada
  mostradas: number
  no_mostradas: number
  recortada_por_coincidencia: boolean
}

/** despliega las líneas de los estantes elegidos; si no caben en `topeDeEntrada`, las que más coinciden con el pedido */
export function desplegar(numerada: ListaNumerada, elegidos: string[], pedido: Pedido, topeDeEntrada: number): Despliegue {
  const abiertos = agruparPorEstante(numerada).filter((e) => elegidos.includes(e.nombre))
  const candidatas = abiertos.flatMap((e) => e.lineas)
  const base = estimarTokens(INSTRUCCION_DEL_PORTERO.length + armarMensaje(pedido, { ...numerada, texto: '' }).length)
  const presupuesto = Math.max(0, Math.floor((topeDeEntrada - base) * CARACTERES_POR_TOKEN) - RESERVA_POR_AVISO * abiertos.length)
  const texto = (l: LineaNumerada) => lineaParaElModelo(l.numero, l.ficha)
  const total = candidatas.reduce((a, l) => a + texto(l).length + 1, 0)
  const armar = (lineas: LineaNumerada[], avisos: string[]): ListaNumerada => ({ ...numerada, lineas, texto: [...lineas.map(texto), ...avisos].join('\n') })
  if (total <= presupuesto) return { numerada: armar(candidatas, []), mostradas: candidatas.length, no_mostradas: 0, recortada_por_coincidencia: false }

  const buscadas = palabrasDelPedido(pedido)
  const orden = (a: LineaNumerada, b: LineaNumerada) => puntaje(b, buscadas) - puntaje(a, buscadas) || a.numero - b.numero
  const preseleccion = abiertos.flatMap((e) => [...e.lineas].sort(orden).slice(0, MAXIMO_DE_LINEAS_POR_ESTANTE)).sort(orden)
  const elegidas: LineaNumerada[] = []
  let usado = 0
  for (const l of preseleccion) {
    const n = texto(l).length + 1
    if (usado + n > presupuesto) break
    elegidas.push(l)
    usado += n
  }
  elegidas.sort((a, b) => a.numero - b.numero)
  const vistas = new Set(elegidas.map((l) => l.numero))
  const avisos = abiertos
    .map((e) => ({ nombre: e.nombre, fuera: e.lineas.filter((l) => !vistas.has(l.numero)).length }))
    .filter((e) => e.fuera > 0)
    .map((e) => `(${e.nombre}: ${e.fuera} cosas más de este estante no se muestran aquí; solo las que más coinciden en palabras con el pedido)`)
  return { numerada: armar(elegidas, avisos), mostradas: elegidas.length, no_mostradas: candidatas.length - elegidas.length, recortada_por_coincidencia: true }
}
