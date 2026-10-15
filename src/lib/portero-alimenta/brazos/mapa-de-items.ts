/**
 * MAPA DE ÍTEMS POR SINÓNIMO · PURO · agnóstico (cualquier rubro, cualquier punto de venta).
 * Une los nombres de la caja (punto de venta) con los de la carta web SIN esperar al dueño: «deberían coincidir; si alguno es diferente es un sinónimo».
 * Por código, en capas; lo que no se puede afirmar queda DUDOSO o SIN EQUIVALENTE, nunca se inventa.
 *
 *   exacta          · mismo nombre (sin tildes ni mayúsculas)
 *   sinonimo        · mismas palabras que distinguen el producto, tras quitar la PRESENTACIÓN (con/sin guarnición, envase, porción), abreviaturas conocidas (jr → junior) y el nombre del negocio
 *   probable        · el nombre de la caja es una variante de UN solo ítem de la carta (o a la inversa): sabor, tamaño o forma de entrega; se usa pero se rotula «probable»
 *   dudosa          · comparte el producto con VARIOS ítems de la carta o difiere en lo que distingue: se muestra el candidato, no se afirma
 *   sin_equivalente · nada de la carta se le parece (extras, envases, platos que la web no lista)
 */
import { normalizar } from '../../manual/texto'

export type Certeza = 'exacta' | 'sinonimo' | 'probable' | 'dudosa' | 'sin_equivalente'
export interface EquivalenciaDeItem { pos: string; web: string | null; certeza: Certeza; motivo: string; candidatos?: string[] }
export interface MapaDeItems {
  /** nombre de la caja → nombre de la carta (exacta, sinónimo y probable) */
  mapa: Record<string, string>
  equivalencias: EquivalenciaDeItem[]
  resumen: Record<Certeza, number>
}

/** abreviaturas y variantes de escritura que NO cambian el producto (dato; se amplía sin tocar el algoritmo) */
export const SINONIMOS_DE_ESCRITURA: Record<string, string> = {
  jr: 'junior', jun: 'junior', peque: 'pequeno', pequena: 'pequeno', pequeno: 'pequeno', chico: 'pequeno', chica: 'pequeno', gde: 'grande', mixta: 'mixto', mixtas: 'mixto',
  maracuya: 'maracuya', naranjilla: 'naranjilla', cafe: 'cafe',
}
/** palabras que describen la PRESENTACIÓN o la guarnición, no el producto (se ignoran para comparar; se declaran) */
export const PALABRAS_DE_PRESENTACION = new Set(['con', 'sin', 'tarrina', 'tarrinas', 'envase', 'envases', 'vaso', 'ploma', 'plomo', 'blanca', 'blanco', 'porcion', 'adicional', 'extra', 'ctv', 'unidad', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'al', 'a', 'o', 'u', 'natural', 'dia'])
/** palabras de relleno que nunca distinguen un producto */
const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'al', 'a', 'o', 'u', 'con', 'sin'])

const singular = (t: string): string => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)
/** pone «encebolladojr» → «encebollado jr» y quita números de precio pegados */
const separaPegados = (s: string): string => s.replace(/([a-z]{4,})(jr)\b/g, '$1 $2')

function palabras(nombre: string, negocio: string[]): { todas: string[]; clave: string[] } {
  const sinParentesis = nombre.replace(/\([^)]*\)/g, ' ')
  // «con chifle» / «sin chifle» / «+ chifle» es la guarnición de un plato; «Chifle» solo es un ítem de la carta
  const n = separaPegados(normalizar(sinParentesis.replace(/(?:\bcon\b|\bsin\b|\+)\s*chifle\b/gi, ' '))).replace(/[^a-z0-9ñ ]+/g, ' ')
  const todas = n.split(/\s+/).filter(Boolean).map((t) => SINONIMOS_DE_ESCRITURA[t] ?? singular(t))
  const base = todas.filter((t) => !RELLENO.has(t) && !negocio.includes(t) && !/^\d+$/.test(t))
  const estricta = base.filter((t) => !PALABRAS_DE_PRESENTACION.has(t))
  // si solo quedan palabras de presentación («Chifle», «Pan adicional»), esas SON el producto
  const clave = estricta.length ? estricta : base.filter((t) => !['adicional', 'extra', 'porcion', 'unidad', 'ctv'].includes(t))
  return { todas, clave }
}
const igual = (a: string[], b: string[]): boolean => a.length === b.length && a.every((t) => b.includes(t))
const contenido = (chico: string[], grande: string[]): boolean => chico.length > 0 && chico.every((t) => grande.includes(t))

export interface ItemConPrecio { nombre: string; precio?: number | null }
export interface EntradaDelMapa {
  /** la caja (catálogo y/o vendidos); el precio, si se conoce, sostiene una variante «probable» */
  pos: Array<string | ItemConPrecio>
  /** la carta web */
  web: Array<string | ItemConPrecio>
  /** nombre del negocio (sus palabras no distinguen un producto: «Encebollado Náufrago» = «Encebollado») */
  negocio?: string | null
}

export function armarMapaDeItems(e: EntradaDelMapa): MapaDeItems {
  const negocio = palabras(e.negocio ?? '', []).todas
  const aItem = (x: string | ItemConPrecio): ItemConPrecio => (typeof x === 'string' ? { nombre: x } : x)
  const cartaUnica = [...new Map(e.web.map(aItem).map((w) => [normalizar(w.nombre), w] as const)).values()]
  const carta = cartaUnica.map((w) => ({ w: w.nombre, precio: typeof w.precio === 'number' ? w.precio : null, ...palabras(w.nombre, negocio), norm: normalizar(w.nombre) }))
  const vistos = new Set<string>()
  const equivalencias: EquivalenciaDeItem[] = []
  for (const it of e.pos.map(aItem)) {
    const limpio = it.nombre.trim()
    const precioPos = typeof it.precio === 'number' ? it.precio : null
    if (!limpio || vistos.has(normalizar(limpio))) continue
    vistos.add(normalizar(limpio))
    const p = { ...palabras(limpio, negocio), norm: normalizar(limpio) }
    const eq = (certeza: Certeza, web: string | null, motivo: string, candidatos?: string[]): EquivalenciaDeItem => ({ pos: limpio, web, certeza, motivo, ...(candidatos ? { candidatos } : {}) })
    if (!p.clave.length) { equivalencias.push(eq('sin_equivalente', null, 'el nombre solo trae palabras de presentación')); continue }
    // 1 · exacta
    const ex = carta.find((c) => c.norm === p.norm)
    if (ex) { equivalencias.push(eq('exacta', ex.w, 'mismo nombre')); continue }
    // 2 · sinónimo: mismas palabras que distinguen el producto
    const sin = carta.filter((c) => c.clave.length && igual(c.clave, p.clave))
    if (sin.length === 1) { equivalencias.push(eq('sinonimo', sin[0].w, 'mismas palabras que distinguen el producto (se ignoran la presentación, el envase y el nombre del negocio)')); continue }
    if (sin.length > 1) { equivalencias.push(eq('dudosa', null, 'coincide por igual con varios ítems de la carta', sin.map((c) => c.w))); continue }
    // 3 · variante: la carta ⊂ caja (sabor/tamaño de un ítem genérico) o la caja ⊂ carta (nombre abreviado)
    const masEspecifico = carta.filter((c) => c.clave.length && contenido(c.clave, p.clave))
    const masGeneral = carta.filter((c) => c.clave.length && contenido(p.clave, c.clave))
    const maximo = Math.max(0, ...masEspecifico.map((c) => c.clave.length))
    const tope = masEspecifico.filter((c) => c.clave.length === maximo)
    // una variante solo se afirma «probable» si el precio de la caja y el de la carta COINCIDEN: sin esa prueba, una variante con otro precio es otro plato (Ceviche de camarón ≠ Ceviche del negocio)
    const mismoPrecio = (c: { precio: number | null }): boolean => precioPos !== null && c.precio !== null && Math.abs(precioPos - c.precio) < 0.005
    if (tope.length === 1 && masGeneral.length === 0 && mismoPrecio(tope[0])) { equivalencias.push(eq('probable', tope[0].w, `variante de «${tope[0].w}» (agrega ${p.clave.filter((t) => !tope[0].clave.includes(t)).join(', ') || 'otra forma de entrega'}) y mismo precio`)); continue }
    if (masGeneral.length === 1 && masEspecifico.length === 0 && mismoPrecio(masGeneral[0])) { equivalencias.push(eq('probable', masGeneral[0].w, `nombre abreviado de «${masGeneral[0].w}» (la carta agrega ${masGeneral[0].clave.filter((t) => !p.clave.includes(t)).join(', ')}) y mismo precio`)); continue }
    const cand = [...new Set([...tope, ...masGeneral].map((c) => c.w))]
    if (cand.length) { equivalencias.push(eq('dudosa', null, 'se parece a más de un ítem de la carta o difiere en lo que distingue el producto', cand)); continue }
    // 4 · comparten la cabeza del producto pero cada uno agrega algo distinto: dudosa con el candidato más cercano
    const cabeza = p.clave[0]
    const parecidos = carta.filter((c) => c.clave.includes(cabeza) && p.clave.some((t) => c.clave.includes(t)))
    if (parecidos.length) { equivalencias.push(eq('dudosa', null, 'comparte el producto con la carta pero agrega algo que la carta no dice', parecidos.map((c) => c.w))); continue }
    equivalencias.push(eq('sin_equivalente', null, 'la carta web no lista nada parecido'))
  }
  const resumen: Record<Certeza, number> = { exacta: 0, sinonimo: 0, probable: 0, dudosa: 0, sin_equivalente: 0 }
  for (const q of equivalencias) resumen[q.certeza]++
  const mapa: Record<string, string> = {}
  for (const q of equivalencias) if (q.web && q.certeza !== 'dudosa' && q.certeza !== 'sin_equivalente') mapa[q.pos] = q.web
  return { mapa, equivalencias, resumen }
}

/** los ítems de la carta web (con su precio) desde el JSON-LD (MenuItem) de la página; sin repetir, en orden de aparición */
export function itemsDeLaCarta(contenido: string): ItemConPrecio[] {
  const out: ItemConPrecio[] = []
  const visto = new Set<string>()
  const re = /\{\s*"@type"\s*:\s*"MenuItem"/g
  for (let m = re.exec(contenido); m; m = re.exec(contenido)) {
    // el objeto entero: se balancean las llaves (respetando las cadenas) desde donde abre
    let nivel = 0, enCadena = false, fin = -1
    for (let i = m.index; i < contenido.length && i < m.index + 4000; i++) {
      const ch = contenido[i]
      if (enCadena) { if (ch === '\\') i++; else if (ch === '"') enCadena = false; continue }
      if (ch === '"') enCadena = true
      else if (ch === '{') nivel++
      else if (ch === '}' && --nivel === 0) { fin = i; break }
    }
    if (fin < 0) continue
    try {
      const o = JSON.parse(contenido.slice(m.index, fin + 1)) as { name?: unknown; offers?: { price?: unknown } }
      const nombre = typeof o.name === 'string' ? o.name.trim() : ''
      const p = Number(String(o.offers?.price ?? '').replace(',', '.'))
      if (nombre && !visto.has(normalizar(nombre))) { visto.add(normalizar(nombre)); out.push({ nombre, precio: Number.isFinite(p) && String(o.offers?.price ?? '') !== '' ? p : null }) }
    } catch { /* un objeto que no es JSON no es un ítem */ }
  }
  return out
}

/** el bloque que se guarda junto al mapa: de dónde salió y qué quedó sin afirmar (el consumidor lo rotula) */
export interface MetaDelMapa {
  origen: 'automático por sinónimo'
  generado_en: string
  resumen: Record<Certeza, number>
  probables: Record<string, string>
  dudosos: Record<string, string[]>
  sin_equivalente: string[]
}
export function metaDelMapa(m: MapaDeItems, ahora: Date): MetaDelMapa {
  const probables: Record<string, string> = {}
  const dudosos: Record<string, string[]> = {}
  const sin: string[] = []
  for (const q of m.equivalencias) {
    if (q.certeza === 'probable' && q.web) probables[q.pos] = q.web
    else if (q.certeza === 'dudosa') dudosos[q.pos] = q.candidatos ?? []
    else if (q.certeza === 'sin_equivalente') sin.push(q.pos)
  }
  return { origen: 'automático por sinónimo', generado_en: ahora.toISOString(), resumen: m.resumen, probables, dudosos, sin_equivalente: sin }
}
