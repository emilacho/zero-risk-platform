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
  pruebasDePropiedad(obs: Observacion[], ficha: { website_url?: unknown; instagram?: unknown; cuentas?: string[] }): unknown
  observacionesDeMaps(item: unknown, sedes: { clave: string; ciudad: string }[], nombre: string, ctx: { observado_en?: string | null; pruebas?: unknown }): { observaciones: Observacion[]; descartado: { motivo: string; ciudad?: string | null } | null; prueba?: string; sede?: string }
  cuentasSocialesDe(texto: unknown): string[]
  horarioDeMapsEnTexto(lista: unknown): string | null
  telefonoNorm(s: unknown): string | null
  descubrirSedes(obs: Observacion[]): { clave: string; ciudad: string }[]
  resolverSedes(sedes: { clave: string; ciudad: string }[], obs: Observacion[]): SedeResuelta[]
  textosPropios(posts: unknown, op?: { max?: number; largo?: number }): { fecha: string | null; texto: string; post: string | null }[]
  clave(s: string): string
}

export interface AporteMapas {
  sede: string
  ciudad: string
  ficha: { titulo: string; ref: string | null; prueba: string; observado_en: string | null } | null
  aporta: { direccion: string | null; codigo_plus: boolean; horario: string | null; telefono: string | null; puntaje: number | null; resenas: number | null; fotos: number | null; categoria: string | null }
  falta: string[]
}
export interface ChoqueDeFichas { sede: string; ciudad: string; fichas: { titulo: string; ref: string | null; prueba: string; direccion: string | null; horario: string | null; telefono: string | null }[]; chocan: string[] }

export interface ResultadoRecoleccion {
  ok: boolean
  error?: string
  sedes: SedeResuelta[]
  textos_propios: { fecha: string | null; texto: string; post: string | null }[]
  descartes: { fuente: string; motivo: string; ref?: string | null }[]
  /** observaciones que no se pudieron atar a una sede (p. ej. un horario de la cuenta) · se guardan con alcance «cuenta» */
  de_la_cuenta: number
  /** lo que cada ficha de Mapas PROBADA aporta a cada sede (con su procedencia) y lo que le falta · se calcula en cada corrida, no se guarda aparte */
  mapas_por_sede: AporteMapas[]
  /** dos fichas de Mapas distintas pasaron la prueba para la MISMA sede: se DECLARAN (y, si difieren en un dato, ese dato queda en conflicto, nunca se elige uno) */
  choques: ChoqueDeFichas[]
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
  const vacio: ResultadoRecoleccion = { ok: false, sedes: [], textos_propios: [], descartes: [], de_la_cuenta: 0, mapas_por_sede: [], choques: [], nuevas: 0, fuentes_leidas: { sitio: 0, instagram: 0, mapas: 0 } }
  try {
    const cli = RAPIDO(await supabase.from('clients').select('id,name,website_url,config').eq('id', clientId).limit(1), 'leer el cliente') as Array<{ id: string; name: string; website_url?: string | null; config: unknown }>
    if (!cli[0]) return { ...vacio, error: 'el cliente ' + clientId + ' no existe' }
    const nombre = String(cli[0].name || '')
    const propio = instagramPropio(cli[0].config)

    // ── lo que el cliente declara en SUS fuentes (sitio · Instagram) ──
    const paginas = RAPIDO(await supabase.from('client_web_pages').select('url,content_text,crawled_at').eq('client_id', clientId).eq('owner_role', 'propio'), 'leer las páginas del sitio') as Array<{ url: string; content_text: string | null; crawled_at: string | null }>
    const obs: Observacion[] = []
    let nSitio = 0
    const cuentasPropias = new Set<string>()
    for (const p of paginas) { const o = L.observacionesDelSitio(p.content_text || '', { url: p.url, crawled_at: p.crawled_at }); nSitio += o.length; obs.push(...o); for (const k of L.cuentasSocialesDe(p.content_text || '')) cuentasPropias.add(k) }

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
      // las cuentas que el propio perfil enlaza (su sitio, su Facebook…) también son «cuentas del cliente» para probar propiedad
      for (const k of L.cuentasSocialesDe([perfil.biography, perfil.externalUrl, ...(Array.isArray(perfil.externalUrls) ? (perfil.externalUrls as unknown[]).map((u) => (u && typeof u === 'object' ? (u as Record<string, unknown>).url : u)) : [])].filter(Boolean).join(' '))) cuentasPropias.add(k)
    }

    // ── Mapas: SÓLO observa sobre las sedes que el cliente ya declaró · lo demás se descarta con su motivo ──
    const sedesDeclaradas = L.descubrirSedes(obs)
    // D1 · lo ya visto en las fuentes PROPIAS (sitio · Instagram · la ficha) es contra lo que se prueba que una ficha de Mapas es del cliente: nombre + ciudad no alcanzan
    const pruebas = L.pruebasDePropiedad(obs, { website_url: cli[0].website_url, instagram: propio, cuentas: [...cuentasPropias] })
    const descartes: ResultadoRecoleccion['descartes'] = []
    const descartesVistos = new Set<string>()
    let nMapas = 0
    const aprobadas: { sede: string; id: string; item: Record<string, unknown>; prueba: string; ref: string | null; cuando: string }[] = []
    for (const f of crudas.filter((x) => x.apify_function !== 'instagram_scraper')) {
      const items = Array.isArray(f.respuesta) ? (f.respuesta as unknown[]) : []
      for (const item of items) {
        const r = L.observacionesDeMaps(item, sedesDeclaradas, nombre, { observado_en: f.created_at, pruebas })
        if (r.descartado) {
          // una ficha descartada se declara UNA vez aunque el raspado se repita (la misma ficha en 5 copias del raspado = 1 descarte)
          const it = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
          const ref = (it.url as string) || (it.placeId ? 'placeId ' + String(it.placeId) : null) || f.id
          const llaveDescarte = ref + '|' + r.descartado.motivo
          if (!descartesVistos.has(llaveDescarte)) { descartesVistos.add(llaveDescarte); descartes.push({ fuente: 'mapas', motivo: r.descartado.motivo, ref }) }
        }
        else {
          nMapas += r.observaciones.length; obs.push(...r.observaciones)
          if (r.sede) { const it = item as Record<string, unknown>; aprobadas.push({ sede: r.sede, id: String(it.placeId || it.url || it.title || ''), item: it, prueba: r.prueba || '', ref: (it.url as string) || (it.placeId ? 'placeId ' + String(it.placeId) : null) || f.id, cuando: f.created_at }) }
        }
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
    // D2 · una ficha raspada varias veces con el MISMO contenido no duplica observaciones: se compara con LO ÚLTIMO guardado de cada (sede · campo · fuente) y sólo se agrega si cambió
    //      (A → B → A sí agrega la vuelta a A: se compara con lo último, no con «alguna vez existió»)
    const ultimo = new Map<string, { cuando: number; valor: string }>()
    const grupo = (sedeId: string | null, campo: string, fuente: string) => [sedeId || '', campo, fuente].join('|')
    const valorDe = (norm: unknown, texto: string) => JSON.stringify(norm ?? texto)
    for (const g of guardadas) {
      const k = grupo(g.sede_id, g.campo, g.fuente)
      const c = new Date(g.observado_en).getTime()
      if (!ultimo.has(k) || c >= ultimo.get(k)!.cuando) ultimo.set(k, { cuando: c, valor: valorDe(g.valor_norm, g.valor_texto) })
    }
    const aInsertar: Record<string, unknown>[] = []
    let deLaCuenta = 0
    const enOrden = [...obs].sort((x, y) => String(x.observado_en ?? '').localeCompare(String(y.observado_en ?? '')))
    for (const o of enOrden) {
      if (o.campo === 'ciudad') continue // la ciudad ya está en la sede
      const sede = o.sede ? porClave.get(o.sede) : null
      if (o.sede && !sede) continue // una observación de una sede que no existe no se guarda (no se inventa una sede)
      if (!o.observado_en) continue
      if (!sede) deLaCuenta++
      const k = llave(sede ? sede.id : null, o.campo, o.fuente, o.valor_norm, o.valor_texto, o.observado_en)
      if (ya.has(k)) continue
      const g = grupo(sede ? sede.id : null, o.campo, o.fuente)
      const cuando = new Date(o.observado_en).getTime()
      const previo = ultimo.get(g)
      if (previo && cuando >= previo.cuando && previo.valor === valorDe(o.valor_norm, o.valor_texto)) continue // el mismo contenido que lo último guardado
      ya.add(k)
      if (!previo || cuando >= previo.cuando) ultimo.set(g, { cuando, valor: valorDe(o.valor_norm, o.valor_texto) })
      aInsertar.push({ client_id: clientId, sede_id: sede ? sede.id : null, campo: o.campo, valor_texto: o.valor_texto, valor_norm: o.valor_norm ?? null, fuente: o.fuente, fuente_ref: o.fuente_ref, alcance: sede ? 'sede' : 'cuenta', observado_en: o.observado_en })
    }
    if (aInsertar.length) RAPIDO(await supabase.from('client_sede_datos').insert(aInsertar), 'guardar las observaciones')

    // ── la ficha resuelta, desde TODO lo guardado (no sólo lo de hoy) ──
    const todas = RAPIDO(await supabase.from('client_sede_datos').select('sede_id,campo,valor_texto,valor_norm,fuente,fuente_ref,alcance,observado_en').eq('client_id', clientId), 'leer la ficha de sedes') as Array<{ sede_id: string | null; campo: Observacion['campo']; valor_texto: string; valor_norm: unknown; fuente: Observacion['fuente']; fuente_ref: string | null; alcance: Observacion['alcance']; observado_en: string }>
    const clavePorId = new Map([...porClave.values()].map((s) => [s.id, s.clave]))
    const deLaBase: Observacion[] = todas.map((t) => ({ sede: t.sede_id ? clavePorId.get(t.sede_id) ?? null : null, ciudad: null, campo: t.campo, valor_texto: t.valor_texto, valor_norm: t.valor_norm, fuente: t.fuente, fuente_ref: t.fuente_ref, observado_en: t.observado_en, alcance: t.alcance }))
    const sedes = L.resolverSedes([...porClave.values()].map((s) => ({ clave: s.clave, ciudad: s.ciudad })), deLaBase)
    // ── qué aporta Mapas a cada sede · y si dos fichas distintas pasaron para la misma: se DECLARA, no se elige en silencio ──
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const resumen = (a: (typeof aprobadas)[number]) => {
      const it = a.item
      const dir = (it.street || it.address) ? String(it.street || it.address) : null
      return { direccion: dir, codigo_plus: !!dir && /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i.test(dir), horario: L.horarioDeMapsEnTexto(it.openingHours), telefono: L.telefonoNorm(it.phone) ? String(it.phone) : null, puntaje: num(it.totalScore), resenas: num(it.reviewsCount), fotos: num(it.imagesCount), categoria: it.categoryName ? String(it.categoryName) : null }
    }
    const mapas_por_sede: AporteMapas[] = []
    const choques: ChoqueDeFichas[] = []
    for (const s of porClave.values()) {
      // la versión MÁS RECIENTE de cada ficha distinta (la misma ficha raspada varias veces cuenta una vez)
      const ultimas = new Map<string, (typeof aprobadas)[number]>()
      for (const a of aprobadas.filter((x) => x.sede === s.clave)) { const p = ultimas.get(a.id); if (!p || a.cuando >= p.cuando) ultimas.set(a.id, a) }
      const fichas = [...ultimas.values()]
      if (!fichas.length) {
        mapas_por_sede.push({ sede: s.clave, ciudad: s.ciudad, ficha: null, aporta: { direccion: null, codigo_plus: false, horario: null, telefono: null, puntaje: null, resenas: null, fotos: null, categoria: null }, falta: ['ninguna ficha de Mapas probada como del cliente para esta sede'] })
        continue
      }
      const res = fichas.map((a) => ({ a, r: resumen(a) }))
      if (res.length > 1) {
        const chocan: string[] = []
        const dif = (k: 'direccion' | 'horario' | 'telefono', etiqueta: string) => { const v = new Set(res.map((x) => x.r[k]).filter(Boolean).map((x) => L.clave(String(x)))); if (v.size > 1) chocan.push(etiqueta) }
        dif('direccion', 'direccion'); dif('horario', 'horario'); dif('telefono', 'canal_pedido')
        choques.push({ sede: s.clave, ciudad: s.ciudad, fichas: res.map((x) => ({ titulo: String(x.a.item.title || ''), ref: x.a.ref, prueba: x.a.prueba, direccion: x.r.direccion, horario: x.r.horario, telefono: x.r.telefono })), chocan })
        const sr = sedes.find((x) => x.clave === s.clave)
        if (sr) for (const campo of chocan) {
          const k = campo === 'canal_pedido' ? 'telefono' : (campo as 'direccion' | 'horario')
          const vistas = res.filter((x) => x.r[k])
          ;(sr as unknown as Record<string, CampoResuelto>)[campo] = { estado: 'conflicto', valor: null, fuentes: vistas.map((x) => ({ fuente: 'mapas', valor: x.r[k], fuente_ref: x.a.ref, observado_en: x.a.cuando, alcance: 'sede' })), versiones: vistas.map((x) => ({ valor: x.r[k], fuentes: ['mapas'] })) }
        }
      }
      const elegida = res[0]
      const falta: string[] = []
      if (!elegida.r.direccion) falta.push('dirección'); if (!elegida.r.horario) falta.push('horario'); if (!elegida.r.telefono) falta.push('teléfono'); if (elegida.r.puntaje === null) falta.push('puntaje'); if (elegida.r.resenas === null) falta.push('reseñas'); if (elegida.r.fotos === null) falta.push('fotos')
      mapas_por_sede.push({ sede: s.clave, ciudad: s.ciudad, ficha: { titulo: String(elegida.a.item.title || ''), ref: elegida.a.ref, prueba: elegida.a.prueba, observado_en: elegida.a.cuando }, aporta: elegida.r, falta })
    }
    return { ok: true, sedes, textos_propios: textos, descartes, de_la_cuenta: deLaCuenta, mapas_por_sede, choques, nuevas: aInsertar.length, fuentes_leidas: { sitio: nSitio, instagram: nIg, mapas: nMapas } }
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : String(e) }
  }
}
