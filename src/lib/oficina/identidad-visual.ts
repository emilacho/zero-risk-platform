/**
 * LA IDENTIDAD VISUAL DEL CLIENTE PARA LAS LÁMINAS (CC#2 · 21-oct · ENCARGO «manual visual con todas las fuentes», puntos 6 y 7).
 * Hallazgo de la tercera prueba: una ficha solo con Instagram no tenía colores ni tipografía en las columnas viejas del manual (`primary_colors`/`typography`), las láminas los exigen, y los 3 encargos cerraron `fallido`
 * a los 3 s. Dos cosas, ambas puras y sin red:
 *  ⑥ El BLOQUE VISUAL del manual (`content_text.brand_book_draft.visual.capa_grafica`: paleta con rol, tipografías con rol, logo; lo escribe el piso visual con todas las fuentes y su procedencia) es la fuente para quien NO tiene las columnas viejas
 *     (`primary_colors`/`typography`). Orden por cosa: columnas del manual (lo de siempre: así un cliente que ya funciona, con su manual completo, no cambia de aspecto ni un byte) → bloque visual → ficha → por omisión.
 *     Se aceptan los colores observados marcados como PROPUESTA (material real y propio con procedencia declarada); lo que no es un color de verdad no entra. Si Lenovo/Emilio quieren que un cliente adopte los roles del bloque, es una firma aparte.
 *  ⑦ PRE-VUELO: antes de crear un encargo de láminas se comprueba que haya identidad visual legible y carpeta (slug). Si falta algo, no se crea el encargo (falla en la PUERTA, no a los 3 s de abrirlo), se dice por qué
 *     y queda pendiente de que el re-proceso visual llene el dato. NUNCA se inventa una paleta ni se le pregunta al dueño (eso sería un punto humano nuevo, no firmado).
 */
import type { MarcaParaRender } from './puertos'

type Fila = Record<string, unknown>
const RE_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const lista = <T>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : [])
const objeto = (d: unknown): Fila | null => (d && typeof d === 'object' && !Array.isArray(d) ? (d as Fila) : null)
const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

export type OrigenDelDato = 'bloque_visual' | 'manual' | 'ficha' | 'por_omision' | null
export interface IdentidadVisual {
  marca: MarcaParaRender | null
  /** de dónde salió cada cosa (la procedencia por cosa vive dentro del bloque; esto dice qué CAPA se usó) */
  procedencia: { colores: OrigenDelDato; tipografias: OrigenDelDato; logo: OrigenDelDato }
  /** `null` si hay marca; si no, por qué no */
  motivo: 'sin_color_primario' | null
}

/** el bloque `visual.capa_grafica` del manual: vive dentro de `content_text` (texto JSON) en `brand_book_draft.visual` (o plano en la raíz); ilegible o ausente ⇒ null (nunca lanza) */
export function bloqueVisualDelManual(manual: Fila): { paleta: unknown[]; tipografias: unknown[]; logo_url: string | null } | null {
  let raiz: unknown = manual.content_text
  if (typeof raiz === 'string') { try { raiz = JSON.parse(raiz) } catch { return null } }
  // la forma REAL (medida en los manuales vivos): `content_text = { brand_book_draft: { …, visual: { capa_grafica } }, fidelity_*, gate_outcome… }`; como segunda opción, el bloque plano en la raíz
  const r = objeto(raiz)
  const capa = objeto(objeto(objeto(r?.brand_book_draft)?.visual)?.capa_grafica) ?? objeto(objeto(r?.visual)?.capa_grafica)
  if (!capa) return null
  const logo = typeof capa.logo_url === 'string' && /^https?:\/\//i.test(capa.logo_url.trim()) ? capa.logo_url.trim() : null
  return { paleta: lista(capa.paleta), tipografias: lista(capa.tipografias), logo_url: logo }
}

const hexDe = (x: unknown): string | null => {
  const o = objeto(x)
  const v = typeof x === 'string' ? x : (o?.color ?? o?.hex)
  return typeof v === 'string' && RE_HEX.test(v.trim()) ? v.trim() : null
}
const rolDe = (x: unknown): string => { const r = objeto(x)?.rol; return typeof r === 'string' ? sinTildes(r) : '' }
const RANGO_DE_ROL: Record<string, number> = { principal: 0, primario: 0, primary: 0, secundario: 1, secondary: 1, acento: 2, accent: 2 }

/**
 * los colores en el orden en que se usan: principal · secundario · acento · el resto (estable). Sin roles (texto plano, como siempre) el orden es el de llegada: idéntico a antes.
 * `sinRepetidos`: el bloque sí (un color solo cuenta una vez); las columnas NO (se conserva el comportamiento de siempre byte a byte).
 */
function ordenarColores(items: unknown[], sinRepetidos: boolean): string[] {
  const ordenados = items.map((x, i) => ({ hex: hexDe(x), rango: RANGO_DE_ROL[rolDe(x)] ?? 3, i })).filter((c): c is { hex: string; rango: number; i: number } => !!c.hex)
    .sort((a, b) => a.rango - b.rango || a.i - b.i).map((c) => c.hex)
  return sinRepetidos ? ordenados.filter((h, i, a) => a.indexOf(h) === i) : ordenados
}
const coloresDelBloque = (paleta: unknown[]): string[] => ordenarColores(paleta, true)

const nombreDeTipografia = (x: unknown): string | null => {
  const o = objeto(x)
  const v = typeof x === 'string' ? x : (o?.nombre ?? o?.family ?? o?.name)
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
const ROLES_DE_TIPOGRAFIA = new Set(['titulos', 'titulo', 'headline', 'cuerpo', 'texto', 'body'])
/** tipografías del bloque: `cuerpo` ⇒ family; `titulos` ⇒ headline_family; sin rol, el orden en que vienen (primera = family, segunda = headline) */
function tipografiasDelBloque(tipografias: unknown[]): { family?: string; headline?: string } {
  const items = tipografias.map((x) => ({ n: nombreDeTipografia(x), rol: rolDe(x) })).filter((t): t is { n: string; rol: string } => !!t.n)
  if (!items.length) return {}
  const titulos = items.find((t) => t.rol === 'titulos' || t.rol === 'titulo' || t.rol === 'headline')?.n
  const cuerpo = items.find((t) => t.rol === 'cuerpo' || t.rol === 'texto' || t.rol === 'body')?.n
  const family = cuerpo ?? items.find((t) => t.n !== titulos)?.n ?? items[0].n
  const headline = titulos ?? items.find((t) => t.n !== family)?.n
  return { family, ...(headline && headline !== family ? { headline } : {}) }
}

export function identidadVisualDelCliente(manual: Fila, cliente: Fila, handles: string[]): IdentidadVisual {
  const bloque = bloqueVisualDelManual(manual)
  const hexes = (d: unknown): string[] => ordenarColores(lista<unknown>(d), false)
  // ORDEN (21-oct · aviso de CC#3: un cliente que ya funciona NO puede cambiar de aspecto sin firma): 1.º las columnas del manual (`primary_colors`, `typography`) cuando ya vienen llenas = el resultado de siempre;
  // 2.º el BLOQUE VISUAL (`visual.capa_grafica`, con roles y procedencia) para quien no las tiene (la ficha de solo Instagram); 3.º la ficha. Cada cosa (colores, tipografías, logo) se resuelve por separado.
  let colores = hexes(manual.primary_colors)
  let origenColores: OrigenDelDato = colores.length ? 'manual' : null
  if (!colores.length && bloque) { colores = coloresDelBloque(bloque.paleta); if (colores.length) origenColores = 'bloque_visual' }
  if (!colores.length) { colores = hexes(cliente.brand_colors); if (colores.length) origenColores = 'ficha' }
  const procedenciaVacia = { colores: null as OrigenDelDato, tipografias: null as OrigenDelDato, logo: null as OrigenDelDato }
  if (!colores.length) return { marca: null, procedencia: procedenciaVacia, motivo: 'sin_color_primario' }

  const comoLista = (d: unknown): string[] => lista<unknown>(d).map(nombreDeTipografia).filter((x): x is string => !!x)
  const delOrden = (t: string[]): { family?: string; headline?: string } => (t.length ? { family: t[0], ...(t[1] ? { headline: t[1] } : {}) } : {})
  // las columnas pueden traer objetos con rol (el piso visual con todas las fuentes los escribe así): con un rol reconocido se resuelve por rol; en texto plano, por orden = como siempre
  const tiposDeColumnas = lista<unknown>(manual.typography)
  let tf = tiposDeColumnas.some((x) => ROLES_DE_TIPOGRAFIA.has(rolDe(x))) ? tipografiasDelBloque(tiposDeColumnas) : delOrden(comoLista(tiposDeColumnas))
  let origenTipos: OrigenDelDato = tf.family ? 'manual' : null
  if (!tf.family && bloque) { tf = tipografiasDelBloque(bloque.tipografias); if (tf.family) origenTipos = 'bloque_visual' }
  if (!tf.family) { tf = delOrden(comoLista(cliente.brand_fonts)); if (tf.family) origenTipos = 'ficha' }
  if (!tf.family) origenTipos = 'por_omision'

  // el logo: el de la ficha (como siempre) y, si no hay, el del bloque
  const logoFicha = typeof cliente.logo_url === 'string' && cliente.logo_url ? cliente.logo_url : null
  const logo = logoFicha ?? bloque?.logo_url ?? null
  const origenLogo: OrigenDelDato = logoFicha ? 'ficha' : bloque?.logo_url ? 'bloque_visual' : null

  return {
    marca: {
      colors: { primary: colores[0], ...(colores[1] ? { secondary: colores[1] } : {}), ...(colores[2] ? { accent: colores[2] } : {}) },
      fonts: { family: tf.family ?? 'Inter', ...(tf.headline ? { headline_family: tf.headline } : {}) },
      ...(logo ? { logo_url: logo } : {}),
      ...(handles[0] ? { brand_handle: handles[0] } : {}),
    },
    procedencia: { colores: origenColores, tipografias: origenTipos, logo: origenLogo },
    motivo: null,
  }
}

/** las familias que dibujan láminas (las que necesitan identidad visual y carpeta): la misma lista que `familiaDeLaminas` del orquestador de láminas (una prueba las mantiene iguales) */
export const esFamiliaDeLaminas = (familia: string): boolean => familia === 'carrusel_ig_v1' || familia === 'kit_historias'

export type MotivoDePrevuelo = 'sin_identidad_visual' | 'sin_slug'
/** ⑦ ¿se puede abrir un encargo de láminas con estas fuentes? `null` = sí. Solo bloquea con un dato que FALTA de verdad (una lectura que falló no se confunde con «falta»). */
export function previueloDeLaminas(f: { marca?: MarcaParaRender | null; slug?: string | null }): { error: MotivoDePrevuelo; detalle: string } | null {
  if (!f.marca) return { error: 'sin_identidad_visual', detalle: 'el cliente no tiene identidad visual legible (colores y tipografía en el bloque visual del manual): no se abre el encargo de láminas; queda pendiente del re-proceso visual' }
  if (!f.slug) return { error: 'sin_slug', detalle: 'el cliente no tiene identificador de carpeta (slug) para guardar las láminas: no se abre el encargo; queda pendiente' }
  return null
}
