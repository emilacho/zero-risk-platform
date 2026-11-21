/**
 * ENCARGO 7 · 21-nov · UNA SOLA LECTURA «POR CARPETA» PARA EL VAULT DEL DASHBOARD. US$ 0, sin modelo, solo lee.
 *
 * El árbol es igual para cualquier cliente (y la bodega del mundo): capa → red → tipo, con los nombres de Lenovo
 * (`red-de-la-pieza.ts`). Por carpeta: conteo, nuevas (7 días) y portada (la pieza más nueva con enlace); al abrirla,
 * las piezas paginadas con sus etiquetas. El dashboard solo pinta; no lee tablas del cerebro.
 *
 * Qué entra y qué no (declarado, no escondido):
 *  · FOTOS (`client_social_images`, estado ok): las copias (`duplicado_de` o el mismo archivo con `hash_archivo`) van a
 *    RAW «Duplicado», no al árbol; lo clasificado sin motivo (`sin_motivo`) va a RAW «Sin clasificar». Nada se borra.
 *  · VIDEOS (`client_videos`): cuentan aunque el archivo no se haya podido bajar (sus datos y capturas existen).
 *  · TENDENCIAS: solo las del último día observado (las filas más nuevas; la tabla crece una fila por día y video,
 *    así que se leen las últimas `TENDENCIAS_A_LEER` ordenadas por día, nunca la tabla entera — lección del 🟡 1 de #1153).
 *  · COMENTARIOS de la competencia: sin quién comentó (la regla de personas privadas ya la cumple su tabla).
 *  · FICHAS (`cerebro_fichas`): solo vigentes (sin retirar, no descartadas y con `vigente_hasta` en el futuro o sin plazo).
 *  · La vista `por_vencer` queda FUERA hasta el vencimiento de los informes (encargo 14); «usada en», parecidas,
 *    capítulos y autor/derechos piden datos que hoy no hay y quedan fuera (ADENDA del encargo 7).
 *  · La red de una pieza es su columna `red` y, si aún no está rellenada, se deduce aquí mismo; sin señal → «no consta»
 *    (la carpeta sale con la clave `no_consta` dentro de su capa).
 */
import type { Consulta, Fila } from '../consulta'
import { rolEfectivo } from '../../portero-alimenta/embudo'
import { idsDeFotosRepetidas } from './fotos-pendientes'
import {
  CAPAS_DEL_VAULT, REDES_DEL_VAULT, TIPOS_DEL_VAULT, RAW_DEL_VAULT,
  capaDeLaFicha, capaDeLaPieza, redDeLaFicha, redDeLaFotoOVideo,
  tipoDeCarpetaDeFicha, tipoDeCarpetaDeFoto, tipoDeCarpetaDeVideo,
  type CapaDelVault, type RedDelVault, type TipoDelVault,
} from './red-de-la-pieza'

export const DIAS_DE_RECIEN_LLEGADO = 7
/** cuántas filas de tendencias se leen (ordenadas del día más nuevo hacia atrás): alcanzan para el día vigente entero */
export const TENDENCIAS_A_LEER = 500
export const POR_PAGINA_POR_DEFECTO = 30
export const POR_PAGINA_MAXIMO = 100
export const SIN_RED = 'no_consta'

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export interface PiezaDeCarpeta {
  fuente: 'foto' | 'video' | 'tendencia' | 'comentario' | 'ficha'
  id: string
  capa: CapaDelVault
  red: RedDelVault | typeof SIN_RED
  tipo: TipoDelVault
  titulo: string | null
  url: string | null
  fecha: string | null
  etiquetas: Record<string, string | null>
  /** solo en RAW: por qué está ahí */
  raw?: keyof typeof RAW_DEL_VAULT
}

export interface CarpetaVista { tipo: TipoDelVault; rotulo: string; total: number; nuevas_7_dias: number; portada: { id: string; url: string | null; titulo: string | null } | null }
export interface RedVista { red: RedDelVault | typeof SIN_RED; rotulo: string; total: number; tipos: CarpetaVista[] }
export interface CapaVista { capa: CapaDelVault; rotulo: string; total: number; redes: RedVista[] }

export interface PedidoDeCarpetas { cliente: string | null; bodega?: boolean; capa?: string | null; red?: string | null; tipo?: string | null; raw?: string | null; pagina?: number; por_pagina?: number }
export type RespuestaDeCarpetas =
  | { ok: true; alcance: 'cliente' | 'bodega'; cliente: string | null; arbol: CapaVista[]; raw: Record<keyof typeof RAW_DEL_VAULT, number>; vistas: { recien_llegado: number }; piezas_contadas: number; fuera: string[]; modelos_llamados: 0; costo_usd: 0 }
  | { ok: true; alcance: 'cliente' | 'bodega'; cliente: string | null; carpeta: { capa: string | null; red: string | null; tipo: string | null; raw: string | null }; total: number; pagina: number; por_pagina: number; paginas: number; piezas: PiezaDeCarpeta[]; modelos_llamados: 0; costo_usd: 0 }
  | { ok: false; error: string; detalle: string }

/** lo que queda fuera de esta lectura, dicho en la respuesta (la ADENDA del encargo 7) */
export const FUERA_DE_LA_LECTURA = [
  'por_vencer (hasta el vencimiento de los informes, encargo 14)',
  'usado_en_piezas y nunca_usado (piden el cruce «usada en», que hoy no hay)',
  'parecidas, capítulos de video y autor/derechos (piden datos que hoy no hay)',
] as const

const fechaDe = (f: Fila): string | null => txt(f.posted_at) ?? txt(f.fecha_comentario) ?? txt(f.publicado_en) ?? txt(f.observado_en) ?? txt(f.fecha_fuente) ?? txt(f.created_at) ?? txt(f.creado_en)
const cortito = (v: unknown): string | null => { const s = txt(v); return s ? (s.match(/^[\s\S]{0,160}/)?.[0] ?? s) : null }
const redVista = (v: unknown): RedDelVault | typeof SIN_RED => (typeof v === 'string' && v in REDES_DEL_VAULT ? (v as RedDelVault) : SIN_RED)

/** las cinco lecturas, cada una con sus columnas mínimas; un error de cualquiera es un error de todo (nada a medias) */
async function leerTodo(consulta: Consulta, clienteONull: string | null): Promise<{ ok: true; piezas: PiezaDeCarpeta[] } | { ok: false; detalle: string }> {
  const piezas: PiezaDeCarpeta[] = []
  const donde = { client_id: clienteONull }

  const fo = await consulta({ tabla: 'client_social_images', columnas: ['id', 'owner_role', 'papel', 'via', 'nivel', 'tipo', 'red', 'post_url', 'url', 'caption', 'posted_at', 'created_at', 'duplicado_de', 'hash_archivo', 'sin_motivo', 'que_muestra'], donde: { ...donde, estado: 'ok' }, limite: 2000 })
  if (fo.error) return { ok: false, detalle: `client_social_images: ${fo.error}` }
  const repetidas = idsDeFotosRepetidas(fo.filas)
  for (const f of fo.filas) {
    const papel = rolEfectivo(f)
    const base: PiezaDeCarpeta = {
      fuente: 'foto', id: String(f.id), capa: capaDeLaPieza(papel, String(f.nivel ?? '')), red: redVista(txt(f.red) ?? redDeLaFotoOVideo(f)), tipo: tipoDeCarpetaDeFoto(f.tipo),
      titulo: cortito(f.que_muestra) ?? cortito(f.caption), url: txt(f.post_url) ?? txt(f.url), fecha: fechaDe(f),
      etiquetas: { papel, via: txt(f.via), nivel: txt(f.nivel), tipo_original: txt(f.tipo) },
    }
    if (txt(f.duplicado_de) || repetidas.has(String(f.id))) base.raw = 'raw_duplicado'
    else if (f.sin_motivo === true) base.raw = 'raw_sin_clasificar'
    piezas.push(base)
  }

  const vi = await consulta({ tabla: 'client_videos', columnas: ['id', 'owner_role', 'papel', 'via', 'nivel', 'tipo', 'red', 'post_url', 'fuente_url', 'caption', 'posted_at', 'created_at', 'sin_motivo'], donde, limite: 2000 })
  if (vi.error) return { ok: false, detalle: `client_videos: ${vi.error}` }
  for (const f of vi.filas) {
    const papel = rolEfectivo(f)
    piezas.push({
      fuente: 'video', id: String(f.id), capa: capaDeLaPieza(papel, String(f.nivel ?? '')), red: redVista(txt(f.red) ?? redDeLaFotoOVideo(f)), tipo: tipoDeCarpetaDeVideo(f.tipo),
      titulo: cortito(f.caption), url: txt(f.post_url), fecha: fechaDe(f),
      etiquetas: { papel, via: txt(f.via), nivel: txt(f.nivel), tipo_original: txt(f.tipo) },
      ...(f.sin_motivo === true ? { raw: 'raw_sin_clasificar' as const } : {}),
    })
  }

  // tendencias: SOLO el día vigente, leído de lo más nuevo hacia atrás (nunca la tabla entera)
  const te = await consulta({ tabla: 'cerebro_tendencias', columnas: ['id', 'nivel', 'red', 'consulta', 'tipo', 'autor', 'texto', 'url', 'publicado_en', 'observado_en', 'observado_dia'], donde, orden: { columna: 'observado_dia', descendente: true }, limite: TENDENCIAS_A_LEER })
  if (te.error) return { ok: false, detalle: `cerebro_tendencias: ${te.error}` }
  const diaVigente = te.filas.length ? String(te.filas[0].observado_dia) : null
  for (const f of te.filas) {
    if (String(f.observado_dia) !== diaVigente) continue
    piezas.push({
      fuente: 'tendencia', id: String(f.id), capa: capaDeLaPieza('referencia', String(f.nivel ?? '')), red: redVista(f.red), tipo: 'tendencia',
      titulo: cortito(f.texto) ?? cortito(f.consulta), url: txt(f.url), fecha: fechaDe(f),
      etiquetas: { nivel: txt(f.nivel), busqueda: txt(f.consulta), autor: txt(f.autor), tipo_original: txt(f.tipo) },
    })
  }

  const co = await consulta({ tabla: 'cerebro_comentarios_competencia', columnas: ['id', 'red', 'cuenta', 'texto', 'capa', 'nivel', 'fecha_comentario', 'post_url', 'observado_en'], donde, limite: 2000 })
  if (co.error) return { ok: false, detalle: `cerebro_comentarios_competencia: ${co.error}` }
  for (const f of co.filas) {
    piezas.push({
      fuente: 'comentario', id: String(f.id), capa: txt(f.capa) === 'mercado' ? 'mercado' : 'competencia', red: redVista(f.red), tipo: 'comentario',
      titulo: cortito(f.texto), url: txt(f.post_url), fecha: fechaDe(f),
      etiquetas: { cuenta: txt(f.cuenta), nivel: txt(f.nivel) },
    })
  }

  if (clienteONull !== null) {
    const fi = await consulta({ tabla: 'cerebro_fichas', columnas: ['id', 'clase', 'alcance', 'red', 'titulo', 'fuente_url', 'fecha_fuente', 'observado_en', 'creado_en', 'vigente_hasta', 'descartada'], donde: { client_id: clienteONull, retirada_en: null }, limite: 2000 })
    if (fi.error) return { ok: false, detalle: `cerebro_fichas: ${fi.error}` }
    const ahora = Date.now()
    for (const f of fi.filas) {
      if (f.descartada === true) continue
      const hasta = txt(f.vigente_hasta)
      if (hasta && Date.parse(hasta) < ahora) continue
      piezas.push({
        fuente: 'ficha', id: String(f.id), capa: capaDeLaFicha(f.alcance), red: redVista(txt(f.red) ?? redDeLaFicha(f)), tipo: tipoDeCarpetaDeFicha(f.clase),
        titulo: cortito(f.titulo), url: txt(f.fuente_url), fecha: fechaDe(f),
        etiquetas: { clase: txt(f.clase), alcance: txt(f.alcance) },
      })
    }
  }
  return { ok: true, piezas }
}

const masNuevaPrimero = (a: PiezaDeCarpeta, b: PiezaDeCarpeta) => (Date.parse(b.fecha ?? '') || 0) - (Date.parse(a.fecha ?? '') || 0)

/** el árbol con conteos, o el contenido paginado de UNA carpeta (con `capa`/`red`/`tipo`, o `raw`) */
export async function leerCarpetas(consulta: Consulta, p: PedidoDeCarpetas): Promise<RespuestaDeCarpetas> {
  const bodega = p.bodega === true
  const cliente = bodega ? null : txt(p.cliente)
  if (!bodega && !cliente) return { ok: false, error: 'entrada_invalida', detalle: 'falta `client_id` (o `bodega=1` para la bodega viral del mundo)' }
  if (p.capa && !(p.capa in CAPAS_DEL_VAULT)) return { ok: false, error: 'entrada_invalida', detalle: `\`capa\` debe ser ${Object.keys(CAPAS_DEL_VAULT).join(', ')}` }
  if (p.red && p.red !== SIN_RED && !(p.red in REDES_DEL_VAULT)) return { ok: false, error: 'entrada_invalida', detalle: `\`red\` debe ser ${Object.keys(REDES_DEL_VAULT).join(', ')} o ${SIN_RED}` }
  if (p.tipo && !(p.tipo in TIPOS_DEL_VAULT)) return { ok: false, error: 'entrada_invalida', detalle: `\`tipo\` debe ser ${Object.keys(TIPOS_DEL_VAULT).join(', ')}` }
  if (p.raw && !(p.raw in RAW_DEL_VAULT)) return { ok: false, error: 'entrada_invalida', detalle: `\`raw\` debe ser ${Object.keys(RAW_DEL_VAULT).join(', ')}` }

  const r = await leerTodo(consulta, cliente)
  if (!r.ok) return { ok: false, error: 'error_de_lectura', detalle: r.detalle.match(/^[\s\S]{0,200}/)?.[0] ?? '' }
  const alcance = bodega ? ('bodega' as const) : ('cliente' as const)

  // ── abrir una carpeta: piezas paginadas, lo más nuevo primero
  if (p.capa || p.raw) {
    const por_pagina = Math.min(Math.max(Math.trunc(p.por_pagina ?? POR_PAGINA_POR_DEFECTO) || POR_PAGINA_POR_DEFECTO, 1), POR_PAGINA_MAXIMO)
    const pagina = Math.max(Math.trunc(p.pagina ?? 1) || 1, 1)
    const dentro = p.raw
      ? r.piezas.filter((x) => x.raw === p.raw)
      : r.piezas.filter((x) => !x.raw && x.capa === p.capa && (!p.red || x.red === p.red) && (!p.tipo || x.tipo === p.tipo))
    const ordenadas = [...dentro].sort(masNuevaPrimero)
    const desde = (pagina - 1) * por_pagina
    const piezas = ordenadas.filter((_x, i) => i >= desde && i < desde + por_pagina)
    return { ok: true, alcance, cliente, carpeta: { capa: p.capa ?? null, red: p.red ?? null, tipo: p.tipo ?? null, raw: p.raw ?? null }, total: dentro.length, pagina, por_pagina, paginas: Math.max(1, Math.ceil(dentro.length / por_pagina)), piezas, modelos_llamados: 0, costo_usd: 0 }
  }

  // ── el árbol con conteos
  const corte = Date.now() - DIAS_DE_RECIEN_LLEGADO * 24 * 3_600_000
  const esNueva = (x: PiezaDeCarpeta) => (Date.parse(x.fecha ?? '') || 0) >= corte
  const raw: Record<keyof typeof RAW_DEL_VAULT, number> = { raw_sin_clasificar: 0, raw_duplicado: 0 }
  const delArbol: PiezaDeCarpeta[] = []
  for (const x of r.piezas) { if (x.raw) raw[x.raw]++; else delArbol.push(x) }

  const arbol: CapaVista[] = []
  for (const capa of Object.keys(CAPAS_DEL_VAULT) as CapaDelVault[]) {
    const deLaCapa = delArbol.filter((x) => x.capa === capa)
    if (!deLaCapa.length) continue
    const redes: RedVista[] = []
    for (const red of [...Object.keys(REDES_DEL_VAULT), SIN_RED] as Array<RedDelVault | typeof SIN_RED>) {
      const deLaRed = deLaCapa.filter((x) => x.red === red)
      if (!deLaRed.length) continue
      const tipos: CarpetaVista[] = []
      for (const tipo of Object.keys(TIPOS_DEL_VAULT) as TipoDelVault[]) {
        const deLaCarpeta = deLaRed.filter((x) => x.tipo === tipo)
        if (!deLaCarpeta.length) continue
        const conUrl = [...deLaCarpeta].sort(masNuevaPrimero).find((x) => x.url)
        tipos.push({ tipo, rotulo: TIPOS_DEL_VAULT[tipo], total: deLaCarpeta.length, nuevas_7_dias: deLaCarpeta.filter(esNueva).length, portada: conUrl ? { id: conUrl.id, url: conUrl.url, titulo: conUrl.titulo } : null })
      }
      redes.push({ red, rotulo: red === SIN_RED ? 'Datos sin red' : REDES_DEL_VAULT[red], total: deLaRed.length, tipos })
    }
    arbol.push({ capa, rotulo: CAPAS_DEL_VAULT[capa], total: deLaCapa.length, redes })
  }
  return { ok: true, alcance, cliente, arbol, raw, vistas: { recien_llegado: delArbol.filter(esNueva).length }, piezas_contadas: r.piezas.length, fuera: [...FUERA_DE_LA_LECTURA], modelos_llamados: 0, costo_usd: 0 }
}
