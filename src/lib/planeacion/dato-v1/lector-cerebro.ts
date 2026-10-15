/**
 * PLAN v3 · V14 · EL LECTOR DEL CEREBRO (rev. 3 §14.1, §15.1, §17.3). El brazo PRIMARIO del plan: lo que el `portero` ya archivó (fichas vivas) y, si falta, lo ya raspado
 * (`apify_raw` del cliente, `ensayo=false`) por LA MISMA compuerta del `portero` (`unidadesDeRaspados` → `filtrar`). Solo LEE: US$ 0, sin modelo, sin Apify, sin escribir.
 *   cerebro (fichas vivas) → crudo (apify_raw filtrado) → relleno (Apify, solo cuando el cerebro está listo y NO hay el dato o venció; ese paso es de `relleno.ts`).
 *
 * 🔴 Ficha viva = `retirada_en IS NULL` ∧ `descartada = false` ∧ `prueba <> true` (la definición del `portero`). Una fila con `reemplazada_por` y `retirada_en` nulo es una ANOMALÍA
 *    (nadie debería verla): sale como `rechazado` con aviso, nunca como dato.
 * 🔴 NO CITA `contenido` (está normalizado: sin tildes ni mayúsculas): el valor de un TEXTO sale de `que_es`/`titulo`; `contenido` solo entra como insumo del parser de cifras.
 * 🔴 `identidad`: una ficha viva ya pasó el filtro (`via: 'portero'`, SOLO con `via: 'cerebro'`); el crudo pasa `filtrar` AQUÍ y entra como `crudo_filtrado` (SOLO con `via: 'crudo'`).
 *    Un homónimo del crudo NO llega al pedido; lo que no se confirma se cuenta y se declara.
 * 🔴 Una lectura que FALLA no es «no hay nada»: devuelve `{ ok: false }` y el plan no la toma por vacía (N6).
 */
import { propiosDeFicha } from '../../manual/cliente'
import { contextoDelCliente } from '../../portero-alimenta/alimentar'
import { TRANSITORIOS_COMUNES, transitoriosDe, varianteDelCliente } from '../../portero-alimenta/datos'
import { filtrar } from '../../portero-alimenta/filtro'
import { fichaPropiaDeMapas } from '../../portero-alimenta/mapas-propia'
import { unidadesDeRaspados, type FilaCruda, type Unidad } from '../../portero-alimenta/unidades'
import { leerNumero } from './cifras'
import type { CatalogoSnapshot, FilaDeTipo } from './catalogo'
import type { EntradaCruda, PeriodoDeDato } from './tipos'

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/
import type { Faltante } from './relleno'
import { resolverFrescura } from './normalizador'

export interface Db { from(t: string): any }
type Fila = Record<string, unknown>
type Res = { data: unknown; error: { message: string } | null }
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

/** las columnas que se leen (nunca `select *`) */
export const COLUMNAS_DE_FICHA = 'id,clase,atributo,titulo,que_es,contenido,origen,observado_en,fecha_fuente,vigente_hasta,retirada_en,reemplazada_por,descartada,prueba,fuente_url,juzgado_por,propiedad,sede,huella,provenance_tag,creado_en'
/** las columnas de `clients` que usan `contextoDelCliente`, `propiosDeFicha` y `varianteDelCliente` y que EXISTEN (la tabla no tiene city/phone/pais: la ciudad sale de `client_sedes` y el teléfono de `config`) */
export const COLUMNAS_DE_CLIENTE = 'id,name,website_url,industry,country,config,canonical_client_id'
export const FILAS_MAXIMAS_DEL_CRUDO = 400

// ───────────────────────────────────────────────────────── el tipo de una ficha o unidad (fila del catálogo, no código)
export function tipoDe(snap: CatalogoSnapshot, p: { atributo?: string | null; clase?: string | null }): FilaDeTipo | null {
  const tipos = snap.filas.tipos
  const a = texto(p.atributo)
  if (a) {
    const exacto = tipos.find((t) => t.atributo_cerebro === a)
    if (exacto) return exacto
    const prefijo = tipos.find((t) => typeof t.atributo_cerebro === 'string' && t.atributo_cerebro.endsWith(':*') && a.startsWith(t.atributo_cerebro.slice(0, -1)))
    if (prefijo) return prefijo
    // comodín en medio (`metrica:*:ingreso:*`): el TIPO es «ventas del punto de venta», no un proveedor; `*` = un segmento (sin «:»), y un `:*` final = el resto
    const glob = tipos.find((t) => typeof t.atributo_cerebro === 'string' && t.atributo_cerebro.slice(0, -2).includes('*') && coincideConComodin(t.atributo_cerebro, a))
    if (glob) return glob
  }
  const c = texto(p.clase)
  if (c) return tipos.find((t) => t.atributo_cerebro === `clase:${c}`) ?? null
  return null
}

const esNumerico = (t: FilaDeTipo) => t.unidad !== 'texto'

/** `metrica:*:ingreso:*` ↔ `metrica:<proveedor>:ingreso:<lo que sea>`: cada `*` interior es UN segmento; un `:*` final admite el resto */
export function coincideConComodin(patron: string, atributo: string): boolean {
  const final = patron.endsWith(':*')
  const cuerpo = final ? patron.slice(0, -2) : patron
  const re = cuerpo.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^:]+')
  return new RegExp(`^${re}${final ? '(?::.+)?' : ''}$`).test(atributo)
}

/**
 * De un texto del cerebro saca UNA cifra con el parser único; con 0 o varios números, nada (no se adivina).
 * 🔴 HALLAZGO EN VIVO (15-oct, 173 fichas del piloto): `contenido` y `que_es` llegan NORMALIZADOS — el separador decimal se volvió un espacio
 *    («producto agua precio 1 00 usd» era «1,00 USD»). Dos grupos de dígitos, el segundo de EXACTAMENTE 2, se leen como entero + centavos; el segundo de 3 como miles («1 234»).
 */
function cifraDeContenido(c: string | null): number | undefined {
  if (!c) return undefined
  const toks = c.match(/\d[\d.,]*\d|\d/g) ?? []
  if (toks.length === 1) {
    const r = leerNumero(toks[0])
    return r.ok ? r.cifra.numero : undefined
  }
  if (toks.length === 2 && /^\d+$/.test(toks[0]) && /^\d+$/.test(toks[1])) {
    // contiguos: «10 a 20» (hay una palabra en medio) NO es «10,20»
    const juntos = `${toks[0]} ${toks[1]}`
    if (!c.includes(juntos)) return undefined
    if (toks[1].length === 2) return Number(`${toks[0]}.${toks[1]}`)
    if (toks[1].length === 3 && toks[0].length <= 3) return Number(`${toks[0]}${toks[1]}`)
  }
  return undefined
}

// ───────────────────────────────────────────────────────── fichas vivas → entradas
export interface ResumenDeFichas {
  fichas_leidas: number
  mapeadas: number
  sin_tipo: Record<string, number>
  reemplazadas: Array<{ ficha_id: string; atributo: string | null }>
  anomalias: Array<{ ficha_id: string; motivo: string }>
  descartadas: number
}
export function fichasAEntradas(fichas: Fila[], snap: CatalogoSnapshot): { entradas: EntradaCruda[]; resumen: ResumenDeFichas } {
  const resumen: ResumenDeFichas = { fichas_leidas: fichas.length, mapeadas: 0, sin_tipo: {}, reemplazadas: [], anomalias: [], descartadas: 0 }
  // viva = la definición del portero (se re-verifica aquí: el lector no confía en el filtro de la consulta)
  const vivas = fichas.filter((f) => {
    if (f.retirada_en || f.descartada === true || f.prueba === true) { resumen.descartadas++; return false }
    return true
  })
  // D4 · dos vivas del mismo atributo (corrida del portero a medias): manda la más nueva por `creado_en`; la otra se declara `reemplazada`
  const porAtributo = new Map<string, Fila[]>()
  const sueltas: Fila[] = []
  for (const f of vivas) { const a = texto(f.atributo); if (a) porAtributo.set(a, [...(porAtributo.get(a) ?? []), f]); else sueltas.push(f) }
  const elegidas: Fila[] = [...sueltas]
  for (const [a, grupo] of porAtributo) {
    const orden = [...grupo].sort((x, y) => String(y.creado_en ?? '').localeCompare(String(x.creado_en ?? '')) || String(y.id).localeCompare(String(x.id)))
    elegidas.push(orden[0])
    for (const otra of orden.slice(1)) resumen.reemplazadas.push({ ficha_id: String(otra.id), atributo: a })
  }
  const entradas: EntradaCruda[] = []
  for (const f of elegidas.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const id = String(f.id)
    // anomalía: `reemplazada_por` con `retirada_en` nulo (el retiro escribe las dos a la vez)
    if (f.reemplazada_por) {
      resumen.anomalias.push({ ficha_id: id, motivo: 'reemplazada_por sin retirada_en' })
      const t = tipoDe(snap, { atributo: texto(f.atributo), clase: texto(f.clase) })
      if (t) entradas.push({ fuente_id: 'cerebro_vivo', tipo_id: t.tipo_id, atributo: texto(f.atributo), estado: 'rechazado', via: 'cerebro', identidad: { via: 'portero' }, medido_en: texto(f.observado_en) })
      continue
    }
    const tipo = tipoDe(snap, { atributo: texto(f.atributo), clase: texto(f.clase) })
    if (!tipo) { const c = texto(f.clase) ?? 'sin_clase'; resumen.sin_tipo[c] = (resumen.sin_tipo[c] ?? 0) + 1; continue }
    resumen.mapeadas++
    const metrica = (f.provenance_tag as { metrica?: { valor?: unknown } } | null)?.metrica
    let contenido: unknown
    if (esNumerico(tipo)) contenido = typeof metrica?.valor === 'number' ? metrica.valor : cifraDeContenido(texto(f.contenido))
    else contenido = (texto(f.que_es) ?? texto(f.titulo))?.slice(0, 200)
    // ventas del punto de venta (y cualquier cifra que declare su ventana): `provenance_tag.datos.desde/hasta` → `periodo` (un tipo con `periodo_requerido` sin él saldría «desconocido»)
    const dd = (f.provenance_tag as { datos?: { desde?: unknown; hasta?: unknown } } | null)?.datos
    const periodo: PeriodoDeDato | undefined = dd && typeof dd.desde === 'string' && typeof dd.hasta === 'string' && FECHA_ISO.test(dd.desde) && FECHA_ISO.test(dd.hasta) ? { tipo: 'ventana', desde: dd.desde, hasta: dd.hasta } : undefined
    const origen = f.origen as EntradaCruda['origen_ficha']
    const propiedad = f.propiedad === 'ajena' ? 'tercero' : f.propiedad === 'propia' || f.propiedad === 'incierta' ? (f.propiedad as 'propia' | 'incierta') : null
    entradas.push({
      fuente_id: 'cerebro_vivo', tipo_id: tipo.tipo_id, atributo: texto(f.atributo), estado: 'trajo', via: 'cerebro', contenido,
      // la fecha de la OBSERVACIÓN, no `fecha_fuente` (que es la del contenido): sin ella el dato es un hueco `sin_fecha`
      medido_en: texto(f.observado_en), vigente_hasta: texto(f.vigente_hasta), identidad: { via: 'portero' },
      origen_ficha: origen ?? null, juzgado_por: (f.juzgado_por as EntradaCruda['juzgado_por']) ?? null, propiedad,
      huella: texto(f.huella), fuente_url: texto(f.fuente_url), ejecucion: id, ...(periodo ? { periodo } : {}),
    })
  }
  return { entradas, resumen }
}

export async function leerFichasVivas(db: Db, client_id: string): Promise<{ ok: true; fichas: Fila[] } | { ok: false; error: string }> {
  try {
    const r = (await db.from('cerebro_fichas').select(COLUMNAS_DE_FICHA).eq('client_id', client_id).is('retirada_en', null)) as Res
    if (r.error) return { ok: false, error: `cerebro_fichas: ${r.error.message}` }
    if (!Array.isArray(r.data)) return { ok: false, error: 'cerebro_fichas: la base no devolvió una lista' }
    return { ok: true, fichas: r.data as Fila[] }
  } catch (e) { return { ok: false, error: `cerebro_fichas: ${e instanceof Error ? e.message : String(e)}` } }
}

// ───────────────────────────────────────────────────────── crudo (apify_raw) por la MISMA compuerta del portero
export interface ResumenDelCrudo { filas: number; unidades: number; propias: number; sin_confirmar: number; ajenas: number; ruido: number; mapeadas: number; sin_tipo: Record<string, number> }
export function crudoAEntradas(filas: FilaCruda[], cliente: Fila, sedes: Fila[], snap: CatalogoSnapshot): { entradas: EntradaCruda[]; resumen: ResumenDelCrudo } {
  const ctx = contextoDelCliente(cliente, sedes)
  const cfg = (cliente.config ?? {}) as { registro?: string; idioma?: { registro?: string }; apify?: { url_reparto?: unknown } }
  const variante = varianteDelCliente({ registro: cfg.registro ?? cfg.idioma?.registro, pais: ((cliente.country ?? cliente.pais) as string | null) ?? null })
  const patrones = transitoriosDe(variante) ?? TRANSITORIOS_COMUNES
  const reparto = Array.isArray(cfg.apify?.url_reparto) ? (cfg.apify!.url_reparto as unknown[]).filter((u): u is string => typeof u === 'string') : []
  const unidades: Unidad[] = unidadesDeRaspados(filas, {
    propios: propiosDeFicha(cliente as never), hostsDeReparto: reparto.map(hostDe).filter(Boolean), transitorios: patrones,
    fichaDeMapas: (items) => fichaPropiaDeMapas(items, ctx).ficha,
  })
  // `filtrar` ES la compuerta del portero (misma función): lo que no es del cliente NO llega al plan
  const f = filtrar(unidades, ctx, new Set<string>(), patrones)
  const resumen: ResumenDelCrudo = {
    filas: filas.length, unidades: unidades.length, propias: f.propias.length, sin_confirmar: f.sin_confirmar.length,
    ajenas: f.descartadas.filter((d) => d.estado === 'ajeno').length, ruido: f.descartadas.filter((d) => d.estado === 'ruido' || d.estado === 'repetida').length, mapeadas: 0, sin_tipo: {},
  }
  const entradas: EntradaCruda[] = []
  // D1 · una por (fuente, huella): la compuerta ya dejó solo las propias; la más nueva por fila cruda manda (unidadesDeRaspados ya ordena)
  for (const u of f.propias) {
    const tipo = tipoDe(snap, { atributo: u.atributo, clase: u.atributo ? u.atributo.split(':')[0] : u.fuente })
    if (!tipo) { const c = u.atributo ? u.atributo.split(':')[0] : u.fuente; resumen.sin_tipo[c] = (resumen.sin_tipo[c] ?? 0) + 1; continue }
    resumen.mapeadas++
    const contenido = esNumerico(tipo) ? (u.metrica ? u.metrica.valor : cifraDeContenido(u.texto)) : u.texto.slice(0, 200)
    entradas.push({
      fuente_id: 'cerebro_vivo', tipo_id: tipo.tipo_id, atributo: u.atributo, estado: 'trajo', via: 'crudo', contenido, medido_en: u.observado_en,
      identidad: { via: 'crudo_filtrado' }, origen_ficha: u.autoria === 'tercero' ? 'tercero' : 'su_fuente', propiedad: u.autoria === 'tercero' ? 'tercero' : 'propia',
      huella: u.huella, fuente_url: u.url ?? null, ejecucion: u.apify_raw_id,
    })
  }
  return { entradas, resumen }
}

export async function leerCrudo(db: Db, client_id: string, max = FILAS_MAXIMAS_DEL_CRUDO): Promise<{ ok: true; filas: FilaCruda[]; cliente: Fila; sedes: Fila[] } | { ok: false; error: string }> {
  try {
    const c = (await db.from('clients').select(COLUMNAS_DE_CLIENTE).eq('id', client_id).limit(1)) as Res
    if (c.error) return { ok: false, error: `clients: ${c.error.message}` }
    const cliente = lista(c.data)[0]
    if (!cliente) return { ok: false, error: 'clients: no existe la ficha del cliente' }
    const s = (await db.from('client_sedes').select('ciudad, clave').eq('client_id', client_id)) as Res
    if (s.error) return { ok: false, error: `client_sedes: ${s.error.message}` }
    const r = (await db.from('apify_raw').select('id, apify_function, params, respuesta, ensayo, metadata, created_at').eq('client_id', client_id).eq('ensayo', false).order('created_at', { ascending: false }).limit(max)) as Res
    if (r.error) return { ok: false, error: `apify_raw: ${r.error.message}` }
    if (!Array.isArray(r.data)) return { ok: false, error: 'apify_raw: la base no devolvió una lista' }
    return { ok: true, filas: r.data as unknown as FilaCruda[], cliente, sedes: lista(s.data) }
  } catch (e) { return { ok: false, error: `lectura: ${e instanceof Error ? e.message : String(e)}` } }
}

// ───────────────────────────────────────────────────────── qué falta: cerebro → crudo → relleno
/**
 * De los tipos que el plan REQUIERE, lo que ni el cerebro ni el crudo cubren con un dato fresco. Eso (y solo eso) es lo que `planificarRelleno` puede salir a buscar.
 * El orden de vías es el del catálogo: un tipo que el cerebro cubre fresco no mira el crudo; uno que el crudo cubre fresco no va a Apify.
 */
export function faltantesDeLasVias(e: {
  snapshot: CatalogoSnapshot
  ahora: Date
  requeridos: string[]
  /** entradas de las fichas vivas y del crudo, YA normalizadas o crudas con `medido_en` */
  del_cerebro: EntradaCruda[]
  del_crudo: EntradaCruda[]
}): { faltantes: Faltante[]; cubiertos: Array<{ tipo_id: string; via: 'cerebro' | 'crudo' }> } {
  const fresco = (en: EntradaCruda): boolean => {
    if (en.estado !== 'trajo' || (en.contenido === undefined || en.contenido === null || en.contenido === '')) return false
    const t = e.snapshot.tipo(en.tipo_id)
    return resolverFrescura(en.medido_en ?? null, en.vigente_hasta ?? null, t?.frescura_limite_h ?? 0, e.ahora).estado === 'fresco'
  }
  const hay = (xs: EntradaCruda[], tipo: string) => xs.filter((x) => x.tipo_id === tipo)
  const faltantes: Faltante[] = []
  const cubiertos: Array<{ tipo_id: string; via: 'cerebro' | 'crudo' }> = []
  for (const tipo of [...new Set(e.requeridos)]) {
    if (hay(e.del_cerebro, tipo).some(fresco)) { cubiertos.push({ tipo_id: tipo, via: 'cerebro' }); continue }
    if (hay(e.del_crudo, tipo).some(fresco)) { cubiertos.push({ tipo_id: tipo, via: 'crudo' }); continue }
    const conAlgo = hay(e.del_cerebro, tipo).length + hay(e.del_crudo, tipo).length > 0
    faltantes.push({ tipo_id: tipo, motivo: conAlgo ? 'vencida' : hay(e.del_cerebro, tipo).length === 0 && e.del_crudo.length > 0 ? 'sin_crudo' : 'sin_ficha' })
  }
  return { faltantes, cubiertos }
}
