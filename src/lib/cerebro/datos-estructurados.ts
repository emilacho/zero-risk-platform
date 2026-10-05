/**
 * Catálogo de productos o servicios leído de datos estructurados (schema.org) de CUALQUIER tipo, no de un rubro.
 *
 * Es lectura de lo que el sitio YA declara: no adivina nada. Lo que no puede resolver lo DECLARA:
 *   · sin datos estructurados  ⇒ `motivo: 'sin_datos_estructurados'` (el portero razonará sobre el texto)
 *   · un bloque roto           ⇒ se cuenta en `bloques_descartados`, nunca revienta
 */
export interface ItemCatalogo {
  nombre: string
  descripcion: string | null
  precio: number | null
  moneda: string | null
  familia: string | null
  tipo: string
}

export interface CatalogoExtraido {
  items: ItemCatalogo[]
  motivo?: 'sin_datos_estructurados'
  bloques_descartados: number
}

/** vocabulario de schema.org para «algo que se ofrece» · no depende de un rubro */
const TIPOS_DE_ITEM = new Set(['Product', 'ProductGroup', 'ProductModel', 'IndividualProduct', 'Service', 'Course', 'Event', 'MenuItem', 'SoftwareApplication'])
/** contenedores cuyo nombre sirve de «familia» de lo que tienen dentro */
const TIPOS_DE_FAMILIA = new Set(['MenuSection', 'OfferCatalog', 'ItemList', 'ProductGroup'])

type Json = unknown
const esObjeto = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v)
const tiposDe = (o: Record<string, Json>): string[] => ([] as Json[]).concat(o['@type'] ?? []).filter((t): t is string => typeof t === 'string')
const texto = (v: Json): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Índice después del cierre que corresponde al primer símbolo de apertura, o -1 si nunca cierra. Entiende cadenas y escapes. */
function cierreBalanceado(t: string, desde: number): number {
  const pila: string[] = []
  let enCadena = false
  for (let i = desde; i < t.length; i++) {
    const c = t[i]
    if (enCadena) {
      if (c === '\\') i++
      else if (c === '"') enCadena = false
      continue
    }
    if (c === '"') enCadena = true
    else if (c === '{' || c === '[') pila.push(c)
    else if (c === '}' || c === ']') {
      const abre = pila.pop()
      if ((c === '}' && abre !== '{') || (c === ']' && abre !== '[')) return -1
      if (pila.length === 0) return i + 1
    }
  }
  return -1
}

export interface BloquesEncontrados { rangos: Array<[number, number]>; validos: Json[]; descartados: number }

/** Encuentra los bloques JSON que declaran datos estructurados (llevan una clave que empieza con «@»). */
export function escanearBloques(t: string): BloquesEncontrados {
  const rangos: Array<[number, number]> = []
  const validos: Json[] = []
  let descartados = 0
  let i = 0
  while (i < t.length) {
    const c = t[i]
    const pareceJson = (c === '{' || c === '[') && /^[\s]*["{[\]]/.test(t.slice(i + 1, i + 40))
    if (!pareceJson) { i++; continue }
    const fin = cierreBalanceado(t, i)
    if (fin === -1) {
      if (t.slice(i).includes('"@')) descartados++
      break
    }
    const candidato = t.slice(i, fin)
    if (candidato.includes('"@')) {
      rangos.push([i, fin])
      try { validos.push(JSON.parse(candidato)) } catch { descartados++ }
    }
    i = fin
  }
  return { rangos, validos, descartados }
}

function numero(v: Json): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  let s = v.replace(/[^\d.,-]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(s.indexOf(',') < s.indexOf('.') ? /,/g : /\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function precioDe(ofertas: Json): { precio: number | null; moneda: string | null } {
  for (const o of ([] as Json[]).concat(ofertas ?? [])) {
    if (!esObjeto(o)) continue
    const especs = ([] as Json[]).concat(o.priceSpecification ?? []).filter(esObjeto)
    const precio = numero(o.price) ?? numero(o.lowPrice) ?? especs.map((e) => numero(e.price)).find((p) => p !== null) ?? null
    if (precio !== null) return { precio, moneda: texto(o.priceCurrency) ?? especs.map((e) => texto(e.priceCurrency)).find(Boolean) ?? null }
  }
  return { precio: null, moneda: null }
}

export function extraerCatalogo(textoCompleto: string): CatalogoExtraido {
  const { validos, descartados } = escanearBloques(textoCompleto)
  const items: ItemCatalogo[] = []
  const vistos = new Set<string>()
  const consumidos = new WeakSet<object>()

  const agregar = (o: Record<string, Json>, tipo: string, familiaDeContexto: string | null, ofertas: Json): void => {
    const nombre = texto(o.name)
    if (!nombre) return
    const { precio, moneda } = precioDe(ofertas ?? o.offers)
    const familia = texto(o.category) ?? familiaDeContexto
    const clave = [nombre, precio, familia, tipo].join('|')
    if (vistos.has(clave)) return
    vistos.add(clave)
    items.push({ nombre, descripcion: texto(o.description), precio, moneda, familia, tipo })
  }

  const visitar = (v: Json, familia: string | null): void => {
    if (Array.isArray(v)) { for (const x of v) visitar(x, familia); return }
    if (!esObjeto(v) || consumidos.has(v)) return
    const tipos = tiposDe(v)
    if (Array.isArray(v['@graph'])) visitar(v['@graph'], familia)
    const nuevaFamilia = tipos.some((t) => TIPOS_DE_FAMILIA.has(t)) ? texto(v.name) ?? familia : familia
    if (tipos.some((t) => t === 'Offer' || t === 'AggregateOffer') && esObjeto(v.itemOffered)) {
      const ofrecido = v.itemOffered
      const tipoOfrecido = tiposDe(ofrecido).find((t) => TIPOS_DE_ITEM.has(t))
      if (tipoOfrecido) { agregar(ofrecido, tipoOfrecido, nuevaFamilia, v); consumidos.add(ofrecido) }
    }
    const tipoItem = tipos.find((t) => TIPOS_DE_ITEM.has(t))
    if (tipoItem) agregar(v, tipoItem, nuevaFamilia, v.offers)
    for (const [k, hijo] of Object.entries(v)) if (k !== '@graph' && k !== 'offers') visitar(hijo, nuevaFamilia)
  }
  for (const raiz of validos) visitar(raiz, null)

  return items.length === 0 ? { items, motivo: 'sin_datos_estructurados', bloques_descartados: descartados } : { items, bloques_descartados: descartados }
}
