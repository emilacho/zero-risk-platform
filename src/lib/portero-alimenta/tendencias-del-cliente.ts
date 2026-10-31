/**
 * Orquesta las tendencias de UN cliente y la bodega del mundo (una vez por día cada una). Los términos del embudo los propone el modelo desde la ficha (rubro, país, ciudades);
 * sin modelo se arman por código con las palabras del rubro. Nunca tumba la corrida del portero.
 */
import { competidoresDeLaFicha, correrConsultas, ejecutarEnApify, guardarTendencias, planDeLaBodega, planDeTendencias, TOPE_DEL_DIA_BODEGA_USD, TOPE_DEL_DIA_POR_CLIENTE_USD, yaSeMiroHoy, type Ejecutar, type ResultadoDeTendencias, type TerminosDelRubro } from './tendencias'

type Fila = Record<string, unknown>
type Traer = (url: string, init?: RequestInit) => Promise<Response>
type LlamarModelo = (instruccion: string, mensaje: string) => Promise<{ texto: string; costo_usd: number }>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export const INSTRUCCION_DE_TERMINOS = `Eres un analista de tendencias en redes sociales. Recibes la ficha de un negocio (rubro, país, ciudades). Propón palabras para buscar lo más gustado y visto en TikTok, Instagram y X, en tres niveles:
- «global»: 2 palabras o hashtags en INGLÉS del rubro a nivel mundial (una sola palabra o frase corta sin espacios para hashtag).
- «pais»: 2 palabras o hashtags en ESPAÑOL del rubro en el país del cliente.
- «competencia»: 2 palabras o hashtags del rubro con la ciudad o la región del cliente (donde están sus competidores).
Solo palabras que describan el RUBRO y su comida, servicio o producto: nunca el nombre del cliente ni de personas. Responde solo con un objeto JSON: {"global":["..",".."],"pais":["..",".."],"competencia":["..",".."]}`

export function terminosDelModelo(texto: string): TerminosDelRubro | null {
  const m = /\{[\s\S]*\}/.exec(texto)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length >= 3 && x.length <= 60).slice(0, 3) : [])
    const t = { global: lista(j.global), pais: lista(j.pais), competencia: lista(j.competencia) }
    return t.global.length && t.pais.length && t.competencia.length ? t : null
  } catch { return null }
}

/** sin modelo: las palabras del rubro de la ficha, tal cual (mejor poco que nada) */
export function terminosPorCodigo(rubro: string, ciudad: string): TerminosDelRubro {
  const palabras = rubro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 5 && !['costero', 'ecuatoriano', 'servicio', 'servicios'].includes(w))
  const base = palabras.slice(0, 2)
  const c = ciudad.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
  return { global: base, pais: base, competencia: c ? base.map((b) => `${b}${c}`) : base }
}

export interface InformeDeTendencias extends Partial<ResultadoDeTendencias> {
  estado: 'corrida' | 'ya_miradas_hoy' | 'apagado' | 'sin_token' | 'sin_base' | 'sin_consultas' | 'error'
  guardadas?: number
  terminos?: TerminosDelRubro & { fuente: 'modelo' | 'codigo' }
  costo_modelo_usd?: number
  detalle?: string
}

export async function tendenciasDelCliente(a: {
  cliente: Fila
  clientId: string
  ciudades: string[]
  urlDeLaBase: string
  llave: string
  token: string
  ahora: Date
  llamarModelo?: LlamarModelo
  ejecutar?: Ejecutar
  fetchImpl?: Traer
  /** gasto de Apify de hoy ya hecho para este cliente (el tope del día lo incluye) */
  gastoPrevioUsd?: number
}): Promise<InformeDeTendencias> {
  try {
    if (!a.token) return { estado: 'sin_token', detalle: 'no hay llave de Apify en el servidor' }
    if (!a.urlDeLaBase || !a.llave) return { estado: 'sin_base' }
    const ya = await yaSeMiroHoy({ clientId: a.clientId, urlDeLaBase: a.urlDeLaBase, llave: a.llave, ahora: a.ahora, fetchImpl: a.fetchImpl })
    if (ya === null) return { estado: 'sin_base', detalle: 'no se pudo leer si ya se miró hoy' }
    if (ya) return { estado: 'ya_miradas_hoy' }
    const rubro = txt(a.cliente.industry) || txt(a.cliente.name)
    const pais = txt(a.cliente.country) || null
    const ciudad = a.ciudades[0] ?? ''
    let terminos: (TerminosDelRubro & { fuente: 'modelo' | 'codigo' }) | null = null
    let costoModelo = 0
    if (a.llamarModelo) {
      try {
        const r = await a.llamarModelo(INSTRUCCION_DE_TERMINOS, `Rubro: ${rubro}\nPaís: ${pais ?? '(sin país)'}\nCiudades: ${a.ciudades.join(', ') || '(sin ciudades)'}`)
        costoModelo = r.costo_usd
        const t = terminosDelModelo(r.texto)
        if (t) terminos = { ...t, fuente: 'modelo' }
      } catch { /* cae al código */ }
    }
    if (!terminos) terminos = { ...terminosPorCodigo(rubro, ciudad), fuente: 'codigo' }
    const b2b = /b2b/i.test(`${rubro} ${JSON.stringify(a.cliente.config && typeof a.cliente.config === 'object' ? (a.cliente.config as Fila).business_model ?? '' : '')}`)
    const plan = planDeTendencias({ terminos, pais, competidores: competidoresDeLaFicha(a.cliente.config), b2b })
    if (!plan.length) return { estado: 'sin_consultas', terminos, costo_modelo_usd: costoModelo }
    const r = await correrConsultas({ plan, ejecutar: a.ejecutar ?? ejecutarEnApify({ token: a.token, fetchImpl: a.fetchImpl }), topeDelDiaUsd: TOPE_DEL_DIA_POR_CLIENTE_USD, gastoPrevioUsd: 0 })
    const g = await guardarTendencias({ clientId: a.clientId, piezas: r.filas, urlDeLaBase: a.urlDeLaBase, llave: a.llave, ahora: a.ahora, fetchImpl: a.fetchImpl })
    const { filas: _f, ...resto } = r
    void _f
    return { estado: 'corrida', ...resto, guardadas: g.guardadas, terminos, costo_modelo_usd: costoModelo, ...(g.error ? { detalle: g.error } : {}) }
  } catch (e) {
    return { estado: 'error', detalle: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}

export async function bodegaDelMundo(a: { paises: string[]; urlDeLaBase: string; llave: string; token: string; ahora: Date; ejecutar?: Ejecutar; fetchImpl?: Traer }): Promise<InformeDeTendencias> {
  try {
    if (!a.token) return { estado: 'sin_token' }
    if (!a.urlDeLaBase || !a.llave) return { estado: 'sin_base' }
    const ya = await yaSeMiroHoy({ clientId: null, urlDeLaBase: a.urlDeLaBase, llave: a.llave, ahora: a.ahora, fetchImpl: a.fetchImpl })
    if (ya === null) return { estado: 'sin_base' }
    if (ya) return { estado: 'ya_miradas_hoy' }
    const r = await correrConsultas({ plan: planDeLaBodega({ paises: a.paises }), ejecutar: a.ejecutar ?? ejecutarEnApify({ token: a.token, fetchImpl: a.fetchImpl }), topeDelDiaUsd: TOPE_DEL_DIA_BODEGA_USD })
    const g = await guardarTendencias({ clientId: null, piezas: r.filas, urlDeLaBase: a.urlDeLaBase, llave: a.llave, ahora: a.ahora, fetchImpl: a.fetchImpl })
    const { filas: _f, ...resto } = r
    void _f
    return { estado: 'corrida', ...resto, guardadas: g.guardadas, ...(g.error ? { detalle: g.error } : {}) }
  } catch (e) {
    return { estado: 'error', detalle: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}
