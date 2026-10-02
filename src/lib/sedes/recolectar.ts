/**
 * EL RECOLECTOR DE SEDES · CC#1 · 2026-10-02 · encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1, 2, 3 y 6.
 *
 * Lee lo que el sistema YA tiene guardado de un cliente (su sitio propio · el raspado de su Instagram · las fichas de Mapas que alguien pidió) y lo deja en la ficha de sedes CON su fuente y su fecha.
 * US$ 0: NO llama a Apify ni a nada de pago · sólo lee tablas propias y escribe en `client_sedes` y `client_sede_datos`.
 *
 *   · Mapas NUNCA crea una sede (sólo observa sobre las que el cliente declaró en su sitio o su Instagram): la ficha de Gualaceo se DESCARTA con su motivo.
 *   · Sólo cuentan los raspados REALES (`ensayo = false`) y SÓLO los de la cuenta propia (los de la competencia están en la misma tabla y no son del cliente).
 *   · Lo que choca o falta se DECLARA en la respuesta; nada se rellena.
 *   · Idempotente: la misma observación (misma fuente · mismo valor · mismo raspado) no se guarda dos veces.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
const L = require('./sedes-logica.js') as SedesLogica

export interface Observacion {
  sede: string | null
  ciudad: string | null
  campo: 'ciudad' | 'horario' | 'direccion' | 'canal_pedido'
  valor_texto: string
  valor_norm: unknown
  fuente: 'sitio' | 'instagram' | 'mapas'
  fuente_ref: string | null
  observado_en: string | null
  alcance: 'sede' | 'cuenta'
}
export interface CampoResuelto { estado: 'coincide' | 'una_fuente' | 'conflicto' | 'sin_dato' | 'sin_interpretar'; valor: string | null; fuentes: unknown[]; versiones?: unknown[] }
export interface SedeResuelta { clave: string; ciudad: string; direccion: CampoResuelto; horario: CampoResuelto; canal_pedido: CampoResuelto }
interface SedesLogica {
  observacionesDelSitio(contenido: string, ctx: { url?: string | null; crawled_at?: string | null }): Observacion[]
  observacionesDeInstagram(perfil: unknown, ctx: { observado_en?: string | null; url?: string | null }): Observacion[]
  observacionesDeMaps(item: unknown, sedes: { clave: string; ciudad: string }[], nombre: string, ctx: { observado_en?: string | null }): { observaciones: Observacion[]; descartado: { motivo: string; ciudad?: string | null } | null }
  descubrirSedes(obs: Observacion[]): { clave: string; ciudad: string }[]
  resolverSedes(sedes: { clave: string; ciudad: string }[], obs: Observacion[]): SedeResuelta[]
  textosPropios(posts: unknown, op?: { max?: number; largo?: number }): { fecha: string | null; texto: string; post: string | null }[]
  clave(s: string): string
}

export interface ResultadoRecoleccion {
  ok: boolean
  error?: string
  sedes: SedeResuelta[]
  textos_propios: { fecha: string | null; texto: string; post: string | null }[]
  descartes: { fuente: string; motivo: string; ref?: string | null }[]
  /** observaciones que no se pudieron atar a una sede (p. ej. un horario de la cuenta) · se guardan con alcance «cuenta» */
  de_la_cuenta: number
  nuevas: number
  fuentes_leidas: { sitio: number; instagram: number; mapas: number }
}

const RAPIDO = <T,>(x: { data: T | null; error: { message: string } | null }, que: string): T => {
  if (x.error) throw new Error(que + ': ' + x.error.message)
  return (x.data ?? ([] as unknown)) as T
}

type FilaApify = { id: string; apify_function: string; params: Record<string, unknown> | null; respuesta: unknown; ensayo: boolean; created_at: string }

/** el Instagram propio de la ficha (config.apify.own_handles.instagram) en minúsculas y sin @ */
function instagramPropio(config: unknown): string | null {
  const c = (config && typeof config === 'object' ? (config as Record<string, unknown>) : {}) as { apify?: { own_handles?: { instagram?: unknown } } }
  const v = c.apify?.own_handles?.instagram
  const h = Array.isArray(v) ? v.find((x) => typeof x === 'string' && x.trim()) : typeof v === 'string' ? v : null
  return h ? String(h).trim().replace(/^@/, '').toLowerCase() : null
}

/** ¿esta corrida de Instagram es de la cuenta propia? (la tabla guarda también las de la competencia) */
function esDeLaCuentaPropia(fila: FilaApify, propio: string | null): boolean {
  if (!propio) return false
  const p = fila.params || {}
  const candidatos: unknown[] = []
  for (const k of ['usernames', 'username']) { const v = (p as Record<string, unknown>)[k]; if (Array.isArray(v)) candidatos.push(...v); else if (v) candidatos.push(v) }
  const urls = (p as Record<string, unknown>).directUrls
  if (Array.isArray(urls)) candidatos.push(...urls.map((u) => String(u).replace(/\/+$/, '').split('/').pop()))
  return candidatos.some((c) => String(c).trim().replace(/^@/, '').toLowerCase() === propio)
}

const primerItem = (r: unknown): Record<string, unknown> | null => (Array.isArray(r) ? (r[0] as Record<string, unknown>) ?? null : r && typeof r === 'object' ? (r as Record<string, unknown>) : null)

export async function recolectarSedes(supabase: SupabaseClient, clientId: string): Promise<ResultadoRecoleccion> {
  const vacio: ResultadoRecoleccion = { ok: false, sedes: [], textos_propios: [], descartes: [], de_la_cuenta: 0, nuevas: 0, fuentes_leidas: { sitio: 0, instagram: 0, mapas: 0 } }
  try {
    const cli = RAPIDO(await supabase.from('clients').select('id,name,config').eq('id', clientId).limit(1), 'leer el cliente') as Array<{ id: string; name: string; config: unknown }>
    if (!cli[0]) return { ...vacio, error: 'el cliente ' + clientId + ' no existe' }
    const nombre = String(cli[0].name || '')
    const propio = instagramPropio(cli[0].config)

    // ── lo que el cliente declara en SUS fuentes (sitio · Instagram) ──
    const paginas = RAPIDO(await supabase.from('client_web_pages').select('url,content_text,crawled_at').eq('client_id', clientId).eq('owner_role', 'propio'), 'leer las páginas del sitio') as Array<{ url: string; content_text: string | null; crawled_at: string | null }>
    const obs: Observacion[] = []
    let nSitio = 0
    for (const p of paginas) { const o = L.observacionesDelSitio(p.content_text || '', { url: p.url, crawled_at: p.crawled_at }); nSitio += o.length; obs.push(...o) }

    const crudas = RAPIDO(await supabase.from('apify_raw').select('id,apify_function,params,respuesta,ensayo,created_at').eq('client_id', clientId).eq('ensayo', false).in('apify_function', ['instagram_scraper', 'google_maps_scraper', 'own_google_maps_profile']).order('created_at', { ascending: false }).limit(12), 'leer lo raspado') as FilaApify[]
    const igFila = crudas.find((f) => f.apify_function === 'instagram_scraper' && esDeLaCuentaPropia(f, propio) && primerItem(f.respuesta))
    let textos: ResultadoRecoleccion['textos_propios'] = []
    let nIg = 0
    if (igFila) {
      const perfil = primerItem(igFila.respuesta) as Record<string, unknown>
      const o = L.observacionesDeInstagram(perfil, { observado_en: igFila.created_at, url: propio ? 'instagram.com/' + propio : null })
      nIg = o.length
      obs.push(...o)
      textos = L.textosPropios(perfil.latestPosts, { max: 8 })
    }

    // ── Mapas: SÓLO observa sobre las sedes que el cliente ya declaró · lo demás se descarta con su motivo ──
    const sedesDeclaradas = L.descubrirSedes(obs)
    const descartes: ResultadoRecoleccion['descartes'] = []
    let nMapas = 0
    for (const f of crudas.filter((x) => x.apify_function !== 'instagram_scraper')) {
      const items = Array.isArray(f.respuesta) ? (f.respuesta as unknown[]) : []
      for (const item of items) {
        const r = L.observacionesDeMaps(item, sedesDeclaradas, nombre, { observado_en: f.created_at })
        if (r.descartado) descartes.push({ fuente: 'mapas', motivo: r.descartado.motivo, ref: f.id })
        else { nMapas += r.observaciones.length; obs.push(...r.observaciones) }
      }
    }

    // ── guardar: las sedes y las observaciones que todavía no están ──
    const existentes = RAPIDO(await supabase.from('client_sedes').select('id,clave,ciudad').eq('client_id', clientId), 'leer las sedes') as Array<{ id: string; clave: string; ciudad: string }>
    const porClave = new Map(existentes.map((s) => [s.clave, s]))
    const faltantes = sedesDeclaradas.filter((s) => !porClave.has(s.clave))
    if (faltantes.length) {
      const nuevas = RAPIDO(await supabase.from('client_sedes').insert(faltantes.map((s) => ({ client_id: clientId, clave: s.clave, ciudad: s.ciudad }))).select('id,clave,ciudad'), 'guardar las sedes') as Array<{ id: string; clave: string; ciudad: string }>
      for (const s of nuevas) porClave.set(s.clave, s)
    }
    const guardadas = RAPIDO(await supabase.from('client_sede_datos').select('sede_id,campo,fuente,valor_norm,valor_texto,observado_en').eq('client_id', clientId), 'leer las observaciones') as Array<{ sede_id: string | null; campo: string; fuente: string; valor_norm: unknown; valor_texto: string; observado_en: string }>
    const llave = (sedeId: string | null, campo: string, fuente: string, norm: unknown, texto: string, cuando: string | null) =>
      [sedeId || '', campo, fuente, JSON.stringify(norm ?? texto), String(cuando ? new Date(cuando).toISOString() : '')].join('|')
    const ya = new Set(guardadas.map((g) => llave(g.sede_id, g.campo, g.fuente, g.valor_norm, g.valor_texto, g.observado_en)))
    const aInsertar: Record<string, unknown>[] = []
    let deLaCuenta = 0
    for (const o of obs) {
      if (o.campo === 'ciudad') continue // la ciudad ya está en la sede
      const sede = o.sede ? porClave.get(o.sede) : null
      if (o.sede && !sede) continue // una observación de una sede que no existe no se guarda (no se inventa una sede)
      if (!o.observado_en) continue
      if (!sede) deLaCuenta++
      const k = llave(sede ? sede.id : null, o.campo, o.fuente, o.valor_norm, o.valor_texto, o.observado_en)
      if (ya.has(k)) continue
      ya.add(k)
      aInsertar.push({ client_id: clientId, sede_id: sede ? sede.id : null, campo: o.campo, valor_texto: o.valor_texto, valor_norm: o.valor_norm ?? null, fuente: o.fuente, fuente_ref: o.fuente_ref, alcance: sede ? 'sede' : 'cuenta', observado_en: o.observado_en })
    }
    if (aInsertar.length) RAPIDO(await supabase.from('client_sede_datos').insert(aInsertar), 'guardar las observaciones')

    // ── la ficha resuelta, desde TODO lo guardado (no sólo lo de hoy) ──
    const todas = RAPIDO(await supabase.from('client_sede_datos').select('sede_id,campo,valor_texto,valor_norm,fuente,fuente_ref,alcance,observado_en').eq('client_id', clientId), 'leer la ficha de sedes') as Array<{ sede_id: string | null; campo: Observacion['campo']; valor_texto: string; valor_norm: unknown; fuente: Observacion['fuente']; fuente_ref: string | null; alcance: Observacion['alcance']; observado_en: string }>
    const clavePorId = new Map([...porClave.values()].map((s) => [s.id, s.clave]))
    const deLaBase: Observacion[] = todas.map((t) => ({ sede: t.sede_id ? clavePorId.get(t.sede_id) ?? null : null, ciudad: null, campo: t.campo, valor_texto: t.valor_texto, valor_norm: t.valor_norm, fuente: t.fuente, fuente_ref: t.fuente_ref, observado_en: t.observado_en, alcance: t.alcance }))
    const sedes = L.resolverSedes([...porClave.values()].map((s) => ({ clave: s.clave, ciudad: s.ciudad })), deLaBase)
    return { ok: true, sedes, textos_propios: textos, descartes, de_la_cuenta: deLaCuenta, nuevas: aInsertar.length, fuentes_leidas: { sitio: nSitio, instagram: nIg, mapas: nMapas } }
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : String(e) }
  }
}
