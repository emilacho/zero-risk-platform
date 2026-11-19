/**
 * «NO ES DE ESTE CLIENTE» · encargo 10 de Cerebro (18-nov) + DECISIÓN 19-nov. PURO + una lectura acotada. US$ 0: sin modelo, sin Apify.
 * Una ficha se marca SOLO con PRUEBA de que es de OTRO negocio. Las dos pruebas (exactas, por código; juzgar el contenido es de un agente, no de esto):
 *   1) su FUENTE es una página web de otro sitio: la regla única «¿es del cliente?» (`src/lib/propio/regla-propio.ts`) dice «no» y la página no es de una red
 *      ni de una plataforma (una publicación de Instagram o una ficha de Mapas no se juzgan por su dirección: eso lo decide quien las trae);
 *      solo para lo que se presenta como del cliente (`propiedad` propia o incierta): lo de un competidor ya es ajeno a sabiendas.
 *   2) se armó para una SEDE cuyos datos salieron de esas páginas de otro sitio, sin ningún dato con prueba (del dueño o de una página del cliente).
 *      Precedente: «antioquia» (la dirección y el teléfono del hotel Click Clack de Medellín) → 18 fichas de Náufrago, 18-oct a 31-oct.
 * La sede del cliente NUNCA es filtro ni marca (corrección de Emilio 18-nov 19:19): una sede sin datos NO es «de otro negocio»; solo lo es con la prueba de (2).
 * Nada se borra: la ficha se guarda con la marca, su motivo y su prueba, y los lectores la entregan CON la marca, como dato.
 * Lo que marca este código va como `nada` (no sabe si sirve de referencia); `mercado` + nivel lo pone una decisión (p. ej. la de Cerebro del 19-nov para Medellín).
 */
import { baseDeFicha, hostDe, redDe, veredictoDePagina, type BaseDelCliente } from '../propio/regla-propio'
import type { Db } from './alimentar'

export const COMO_DE_LA_MARCA = ['mercado', 'nada'] as const
export type ComoDeLaMarca = (typeof COMO_DE_LA_MARCA)[number]
/** los niveles del embudo que admite una marca «mercado» (los mismos nombres que `origen-de-lo-ajeno.ts`) */
export const NIVELES_DE_MERCADO = ['global', 'pais', 'mundo'] as const
export const MARCADO_POR_LA_REGLA = 'regla:otro-negocio'

export interface MarcaDeOtroNegocio { motivo: string; prueba: string; como: ComoDeLaMarca; nivel: (typeof NIVELES_DE_MERCADO)[number] | null; por: string }

/** plataformas cuyas direcciones NO dicen de quién es la cosa (una ficha de Mapas, un buscador): no prueban nada por sí solas */
const PLATAFORMAS: RegExp[] = [/(^|\.)google\.[a-z.]+$/, /(^|\.)goo\.gl$/, /(^|\.)maps\.app\.goo\.gl$/, /(^|\.)bing\.com$/, /(^|\.)apple\.com$/]

/** ¿es una página WEB de OTRO sitio? → su anfitrión (la prueba); si no (es del cliente, es una red o una plataforma, no es una dirección, o no hay con qué comparar) → null */
export function paginaDeOtroSitio(base: BaseDelCliente, url: unknown): string | null {
  const host = hostDe(url)
  if (!host || !/^https?:\/\//i.test(String(url ?? '').trim())) return null
  if (redDe(host) !== null || PLATAFORMAS.some((re) => re.test(host))) return null
  return veredictoDePagina(base, url) === 'no' ? host : null
}

export interface DatoDeSede { sede_id: string | null; fuente: string | null; fuente_ref: string | null }
/**
 * Las sedes «de otro negocio»: con al menos un dato que salió de una página web de otro sitio y NINGÚN dato con prueba
 * (del dueño, o de una página que la regla da por del cliente). clave → la prueba (la dirección de la página ajena).
 */
export function sedesDeOtroNegocio(base: BaseDelCliente, sedes: Array<{ id: string; clave: string }>, datos: DatoDeSede[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of sedes) {
    const suyos = datos.filter((d) => d.sede_id === s.id)
    const conPrueba = suyos.some((d) => d.fuente === 'dueno' || veredictoDePagina(base, d.fuente_ref) === 'si')
    if (conPrueba) continue
    const ajena = suyos.map((d) => (paginaDeOtroSitio(base, d.fuente_ref) ? String(d.fuente_ref) : null)).find((x): x is string => !!x)
    if (ajena) out.set(s.clave, ajena)
  }
  return out
}

export interface PruebasDelCliente { base: BaseDelCliente; sedesDeOtroNegocio: Map<string, string> }

/** la marca que le toca a una ficha al guardarla, o null (la gran mayoría) */
export function marcaDeOtroNegocio(f: { propiedad?: string | null; fuente_url?: string | null; sede?: string | null }, p: PruebasDelCliente): MarcaDeOtroNegocio | null {
  if (f.propiedad !== 'ajena') {
    const host = paginaDeOtroSitio(p.base, f.fuente_url)
    if (host) return { motivo: `la fuente es una página de otro negocio: ${host} no es el sitio ni una cuenta del cliente`, prueba: String(f.fuente_url), como: 'nada', nivel: null, por: MARCADO_POR_LA_REGLA }
  }
  // una ficha de varias sedes lleva la clave «a,b» (`claveDeAlcance`): basta UNA sede de otro negocio para que la ficha no sea del cliente tal cual
  const sede = (typeof f.sede === 'string' ? f.sede.split(',') : []).map((x) => x.trim()).find((x) => x && p.sedesDeOtroNegocio.has(x)) ?? ''
  const pagina = sede ? p.sedesDeOtroNegocio.get(sede) : undefined
  if (pagina) return { motivo: `se armó para la sede «${sede}», que salió de una página de otro negocio (${hostDe(pagina)}), no del cliente`, prueba: pagina, como: 'nada', nivel: null, por: MARCADO_POR_LA_REGLA }
  return null
}

/** las columnas de `cerebro_fichas` (migración 202611191600) para una marca; sin marca → nada (la fila queda como siempre) */
export function columnasDeLaMarca(m: MarcaDeOtroNegocio | null, ahora: Date): Record<string, unknown> {
  if (!m) return {}
  return { otro_negocio_motivo: m.motivo, otro_negocio_prueba: m.prueba, otro_negocio_como: m.como, otro_negocio_nivel: m.nivel, otro_negocio_por: m.por, otro_negocio_en: ahora.toISOString() }
}

/** lee lo necesario para marcar al guardar: la ficha del cliente (sitio y cuentas) y sus sedes con el origen de cada dato. Un error se DICE: quien guarda no escribe a ciegas */
export async function cargarPruebasDelCliente(db: Db, clientId: string, ya: { cliente?: { website_url?: unknown; config?: unknown } | null; sedes?: Array<Record<string, unknown>> } = {}): Promise<{ ok: true; pruebas: PruebasDelCliente } | { ok: false; error: string }> {
  let cliente = ya.cliente
  if (cliente === undefined) {
    const c = await db.from('clients').select('website_url, config').eq('id', clientId).limit(1)
    if (c.error) return { ok: false, error: `clients: ${c.error.message}` }
    cliente = (Array.isArray(c.data) ? c.data[0] : null) as { website_url?: unknown; config?: unknown } | null
  }
  const base = baseDeFicha({ website_url: typeof cliente?.website_url === 'string' ? cliente.website_url : null, config: cliente?.config })
  let filasDeSedes = ya.sedes
  if (filasDeSedes === undefined) {
    const s = await db.from('client_sedes').select('id, clave').eq('client_id', clientId)
    if (s.error) return { ok: false, error: `client_sedes: ${s.error.message}` }
    filasDeSedes = Array.isArray(s.data) ? s.data : []
  }
  const sedes = (filasDeSedes ?? []).map((x) => ({ id: String(x.id), clave: String(x.clave ?? '') }))
  if (!sedes.length) return { ok: true, pruebas: { base, sedesDeOtroNegocio: new Map() } }
  const d = await db.from('client_sede_datos').select('sede_id, fuente, fuente_ref').eq('client_id', clientId).is('retirada_en', null)
  if (d.error) return { ok: false, error: `client_sede_datos: ${d.error.message}` }
  const datos = (Array.isArray(d.data) ? d.data : []).map((x: Record<string, unknown>) => ({ sede_id: x.sede_id == null ? null : String(x.sede_id), fuente: typeof x.fuente === 'string' ? x.fuente : null, fuente_ref: typeof x.fuente_ref === 'string' ? x.fuente_ref : null }))
  return { ok: true, pruebas: { base, sedesDeOtroNegocio: sedesDeOtroNegocio(base, sedes, datos) } }
}
