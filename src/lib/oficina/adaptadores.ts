/**
 * LOS ADAPTADORES REALES de los puertos de la oficina. NADA de esto corre mientras la oficina esté apagada (la puerta devuelve 409 antes) y NADA llama a un proveedor en `dry_run`.
 * Todo recibe sus dependencias por parámetro (base, `fetch`, claves) para probarse sin red. Un fallo de Slack nunca se lanza; un proveedor sin configurar responde «no configurado», no revienta.
 */
import zlib from 'node:zlib'
import { renderManualLimpio } from '../brand-book-render-limpio'
import { extraerCatalogo } from '../cerebro/datos-estructurados'
import { datosDeContacto } from './texto'
import { almacenDeSupabase, type Db } from './almacen-supabase'
import type { FotoEtiquetada } from './fotos'
import { ESPERAS_DEL_REVISOR_MS, llamarRevisorGpt } from '../revisor-gpt'
import type { FuentesCompletas, MarcaParaRender, Puertos, ResultadoImagen, ResultadoRender, ResultadoRevisor } from './puertos'
import type { Registro } from './chequeos'

type Fila = Record<string, unknown>
type Fetch = typeof fetch
export interface Entorno { baseUrl: string; internalKey: string; openaiKey?: string; revisorModelo?: string; revisorPrecioEntrada?: number; revisorPrecioSalida?: number; slackToken?: string; slackCanalHilo?: string; slackCanalAlertas?: string; bucket?: string; /** esperas entre reintentos del revisor (ms); por omisión 5 s, 20 s, 60 s */ esperasRevisorMs?: number[]; /** dormir (inyectable en pruebas) */ esperar?: (ms: number) => Promise<void> }

/** reintentos del revisor GPT (firma de Emilio, 10-oct): espera creciente antes de cada uno */
export { ESPERAS_DEL_REVISOR_MS }

/** el marcador de una imagen simulada (dry_run): `descargar` la reconoce y no sale a la red */
export const PREFIJO_DRY = 'https://dry.invalid/'

const DIAS_DE_USO = 90
const lista = <T>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : [])
const cuerpoPng = (w: number, h: number): Buffer => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t), d, Buffer.alloc(4)]) }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(10))), chunk('IEND', Buffer.alloc(0))])
}

/** tamaños de cada plataforma del brazo de láminas (los mismos que `PLATFORM_SPECS` del motor de carruseles) */
export const MEDIDAS_DE_PLATAFORMA: Record<string, { ancho: number; alto: number }> = {
  'instagram-feed': { ancho: 1080, alto: 1350 }, 'instagram-reel': { ancho: 1080, alto: 1920 }, tiktok: { ancho: 1080, alto: 1920 }, 'facebook-feed': { ancho: 1200, alto: 630 }, 'twitter-card': { ancho: 1200, alto: 675 },
}

const RE_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** colores, tipografías, logo y usuario del cliente para dibujar láminas: del manual (`primary_colors`, `typography`) y, si faltan, de la ficha (`brand_colors`, `brand_fonts`). Sin color primario ⇒ null (no se inventa una paleta). */
export function marcaDelCliente(manual: Fila, cliente: Fila, handles: string[]): MarcaParaRender | null {
  const hex = (x: unknown): string | null => { const v = typeof x === 'string' ? x : (x as { hex?: unknown } | null)?.hex; return typeof v === 'string' && RE_HEX.test(v.trim()) ? v.trim() : null }
  let colores = lista<unknown>(manual.primary_colors).map(hex).filter((x): x is string => !!x)
  if (!colores.length) colores = lista<unknown>(cliente.brand_colors).map(hex).filter((x): x is string => !!x)
  if (!colores.length) return null
  const tipos = (lista<unknown>(manual.typography).length ? lista<unknown>(manual.typography) : lista<unknown>(cliente.brand_fonts)).map((x) => (typeof x === 'string' ? x : (x as { family?: unknown; name?: unknown } | null)?.family ?? (x as { name?: unknown } | null)?.name)).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
  return {
    colors: { primary: colores[0], ...(colores[1] ? { secondary: colores[1] } : {}), ...(colores[2] ? { accent: colores[2] } : {}) },
    fonts: { family: tipos[0] ?? 'Inter', ...(tipos[1] ? { headline_family: tipos[1] } : {}) },
    ...(typeof cliente.logo_url === 'string' && cliente.logo_url ? { logo_url: cliente.logo_url } : {}),
    ...(handles[0] ? { brand_handle: handles[0] } : {}),
  }
}

/** el registro (tuteo / voseo) que fija el manual; sin dato, «sin_dato» (el chequeo solo avisa) */
export function registroDelManual(voz: string | null | undefined): Registro {
  const t = (voz ?? '').toLowerCase()
  if (/nunca\s+(?:uses?\s+)?vos|tutea|tuteo|\bt[uú]\b.*siempre/.test(t)) return 'tuteo'
  if (/\bvoseo\b|usa\s+vos|vosea/.test(t)) return 'voseo'
  return 'sin_dato'
}

export function crearPuertos(db: Db, env: Entorno, f: Fetch = fetch, ahora: () => Date = () => new Date()): Puertos {
  const almacen = almacenDeSupabase(db)
  return {
    almacen,
    ahora,
    async fuentes(clientId) {
      try {
        const cl = (await db.from('clients').select('id,name,country,language,config,slug,logo_url,website_url').eq('id', clientId).limit(1)) as { data: Fila[] | null; error: { message: string } | null }
        if (cl.error) return { error: `clients: ${cl.error.message}` }
        const cliente = cl.data?.[0]
        if (!cliente) return { error: 'el cliente no existe (¿falta la ficha previa?)' }
        const mb = (await db.from('client_brand_books').select('*').eq('client_id', clientId).order('version', { ascending: false }).limit(1)) as { data: Fila[] | null; error: { message: string } | null }
        if (mb.error) return { error: `manual: ${mb.error.message}` }
        const manual = mb.data?.[0]
        if (!manual) return { error: 'el cliente no tiene manual de marca' }
        const fo = (await db.from('client_social_images').select('id,url,estado,que_muestra,producto_visto,texto_visible,con_personas,tipo_de_toma,formato,etiqueta_confianza').eq('client_id', clientId).eq('estado', 'ok')) as { data: Fila[] | null; error: { message: string } | null }
        if (fo.error) return { error: `fotos: ${fo.error.message}` }
        const fotos = lista<Fila>(fo.data).map((x) => ({ ...x, id: String(x.id) }) as unknown as FotoEtiquetada)
        const desde = new Date(ahora().getTime() - DIAS_DE_USO * 86_400_000).toISOString()
        const us = (await db.from('oficina_uso_de_fotos').select('foto_id,usada_en').eq('client_id', clientId).gte('usada_en', desde)) as { data: Fila[] | null; error: { message: string } | null }
        const usos: Record<string, string> = {}
        for (const u of lista<Fila>(us.error ? [] : us.data)) { const id = String(u.foto_id); const t = String(u.usada_en); if (!usos[id] || usos[id] < t) usos[id] = t }
        const sd = (await db.from('client_sede_datos').select('valor_texto').eq('client_id', clientId).eq('campo', 'canal_pedido')) as { data: Fila[] | null; error: { message: string } | null }
        const telefonos = sd.error ? [] : [...new Set(lista<Fila>(sd.data).flatMap((x) => datosDeContacto(String(x.valor_texto ?? '')).telefonos))]
        const wp = (await db.from('client_web_pages').select('content_text').eq('client_id', clientId).is('competitor_id', null)) as { data: Fila[] | null; error: { message: string } | null }
        const precios = wp.error ? [] : [...new Set(lista<Fila>(wp.data).flatMap((p) => extraerCatalogo(String(p.content_text ?? '')).items.map((i) => i.precio).filter((x): x is number => typeof x === 'number').map((x) => x.toFixed(2))))]
        const config = (cliente.config ?? {}) as { apify?: { own_handles?: Record<string, string>; competitor_list?: Array<{ name?: string }> }; zona_horaria?: string; timezone?: string }
        const handles = Object.values(config.apify?.own_handles ?? {}).filter(Boolean).map((h) => (String(h).startsWith('@') ? String(h) : `@${h}`))
        const competidores = (config.apify?.competitor_list ?? []).map((c) => c.name ?? '').filter(Boolean)
        const nombre = String(cliente.name ?? 'cliente')
        const manual_texto = renderManualLimpio({ brand_book: manual, client_name: nombre, country: (cliente.country as string | null) ?? null }).texto
        const out: FuentesCompletas = {
          cliente_nombre: nombre, manual_texto, plan_texto: null,
          fuentes: {
            palabras_prohibidas: lista<string>(manual.forbidden_words), telefonos, handles, precios, competidores,
            registro: registroDelManual(manual.voice_description as string | null),
            telefonos_verificables: telefonos.length > 0, handles_verificables: handles.length > 0,
          },
          propios: { telefonos, handles, urls: cliente.website_url ? [String(cliente.website_url)] : [], marcas_ajenas: competidores.map((c) => c.toLowerCase()) },
          fotos, usos, vocabulario_de_productos: [...new Set(fotos.flatMap((x) => x.producto_visto ?? []))],
          zona: config.zona_horaria ?? config.timezone ?? null,
          slug: typeof cliente.slug === 'string' && cliente.slug ? cliente.slug : null,
          marca: marcaDelCliente(manual, cliente, handles),
        }
        return out
      } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
    },
    async plan(planId, clientId) {
      const r = (await db.from('client_historical_outputs').select('content').eq('id', planId).eq('client_id', clientId).limit(1)) as { data: Fila[] | null; error: { message: string } | null }
      if (r.error) return null
      const c = r.data?.[0]?.content
      return typeof c === 'string' && c.trim() ? c : null
    },
    async parte(parteId, clientId) {
      const r = (await db.from('client_historical_outputs').select('content').eq('id', parteId).eq('client_id', clientId).eq('output_type', 'campaign_brief_pack').limit(1)) as { data: Fila[] | null; error: { message: string } | null }
      if (r.error) throw new Error(`leer la parte: ${r.error.message}`)
      const c = r.data?.[0]?.content
      return typeof c === 'string' ? { texto: c } : null
    },
    async imagen(p): Promise<ResultadoImagen> {
      if (p.dry_run) { const id = `dry-${Math.random().toString(36).slice(2, 10)}`; return { ok: true, url: `${PREFIJO_DRY}${id}.png`, generation_id: id, costo_usd: 0 } }
      try {
        const r = await f(`${env.baseUrl}/api/images/generate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.internalKey }, body: JSON.stringify({ prompt: p.prompt, client_id: p.client_id, agent_slug: 'design-image-prompt-engineer', size: '1024x1024', quality: 'medium' }) })
        const j = (await r.json().catch(() => ({}))) as Fila
        if (!r.ok || !j.image_url) return { ok: false, error: String(j.error ?? j.detail ?? `HTTP ${r.status}`) }
        return { ok: true, url: String(j.image_url), generation_id: String(j.generation_id ?? ''), costo_usd: Number(j.cost_usd ?? 0) }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },
    async revisor(p): Promise<ResultadoRevisor> {
      if (p.dry_run) return { ok: true, texto: '', costo_usd: 0, modelo: 'simulado (dry_run)' }
      if (!env.openaiKey) return { ok: false, error: 'OPENAI_API_KEY no configurada', costo_usd: 0, intentos: [] }
      if (!env.revisorModelo) return { ok: false, error: 'OFICINA_REVISOR_MODEL no configurado (el nombre del modelo del revisor no está verificado)', costo_usd: 0, intentos: [] }
      return llamarRevisorGpt({ f, apiKey: env.openaiKey, modelo: env.revisorModelo, precioEntrada: env.revisorPrecioEntrada, precioSalida: env.revisorPrecioSalida, texto: p.texto, imagenes_urls: p.imagenes_urls, esperasMs: env.esperasRevisorMs, esperar: env.esperar })
    },
    async renderLaminas(p): Promise<ResultadoRender> {
      const medidas = MEDIDAS_DE_PLATAFORMA[p.plataforma]
      if (!medidas) return { ok: false, error: `plataforma «${p.plataforma}» desconocida` }
      if (p.dry_run) return { ok: true, urls: p.slides.map((_, i) => `${PREFIJO_DRY}lamina-${i + 1}-${medidas.ancho}x${medidas.alto}.png`), ancho: medidas.ancho, alto: medidas.alto, fonts_usadas: [p.marca.fonts.family], fonts_faltantes: [], timings_ms: [] }
      // el brazo guarda las láminas en el bucket de la oficina (OFICINA_BUCKET en su propio entorno); aquí se falla antes de gastar si no está configurado
      if (!(env.bucket ?? '').trim()) return { ok: false, error: 'OFICINA_BUCKET no configurado: las láminas no se guardan en el bucket de la web del cliente' }
      try {
        const r = await f(`${env.baseUrl}/api/carousel/generate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.internalKey }, body: JSON.stringify({ client_slug: p.slug, platform: p.plataforma, brand: p.marca, slides: p.slides, subcarpeta: p.subcarpeta }) })
        const j = (await r.json().catch(() => ({}))) as Fila
        if (!r.ok || !Array.isArray(j.slide_urls)) return { ok: false, error: String(j.detail ?? j.error ?? `HTTP ${r.status}`) }
        return { ok: true, urls: (j.slide_urls as unknown[]).map(String), ancho: Number(j.width ?? medidas.ancho), alto: Number(j.height ?? medidas.alto), fonts_usadas: lista<string>(j.fonts_usadas), fonts_faltantes: lista<string>(j.fonts_faltantes), timings_ms: lista<number>(j.timings_ms) }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },
    async descargar(url) {
      if (url.startsWith(PREFIJO_DRY)) { const m = /-(\d{2,5})x(\d{2,5})\.png$/.exec(url); return m ? cuerpoPng(Number(m[1]), Number(m[2])) : cuerpoPng(1024, 1024) }
      try {
        const r = await f(url)
        return r.ok ? Buffer.from(await r.arrayBuffer()) : null
      } catch { return null }
    },
    async guardarArchivos(ruta, archivos) {
      // frontera: el bucket `client-websites` es de la WEB del cliente (dueño: CC#4). La oficina escribe SOLO en el suyo; sin `OFICINA_BUCKET` no escribe (falla visible)
      const bucket = (env.bucket ?? '').trim()
      if (!bucket) return { ok: false, error: 'OFICINA_BUCKET no configurado: la oficina no escribe en el bucket de la web del cliente' }
      const urls: Record<string, string> = {}
      const storage = (db as unknown as { storage: { from(b: string): { upload(p: string, b: Buffer, o: Record<string, unknown>): Promise<{ error: { message: string } | null }>; getPublicUrl(p: string): { data: { publicUrl: string } } } } }).storage
      for (const a of archivos) {
        const path = `${ruta}/${a.nombre}`
        const r = await storage.from(bucket).upload(path, a.bytes, { contentType: a.tipo, upsert: false })
        if (r.error) return { ok: false, error: `${a.nombre}: ${r.error.message}` }
        urls[a.nombre] = storage.from(bucket).getPublicUrl(path).data.publicUrl
      }
      return { ok: true, urls }
    },
    async salida(p) {
      const md = [`# ${p.titulo}`, '', String((p.contenido as { pie_de_foto?: string }).pie_de_foto ?? ''), '', ((p.contenido as { hashtags?: string[] }).hashtags ?? []).join(' '), '', '```json', JSON.stringify(p.contenido, null, 2), '```'].join('\n')
      const r = await db.from('client_historical_outputs').insert({ client_id: p.client_id, title: p.titulo, output_type: 'campaign_piece', content: md, content_text: md, producing_agent: 'oficina · content-creator', status: 'draft', provenance_tag: { fuente: 'oficina', ...p.metadata } }).select('id').single()
      if (r.error) return { ok: false, error: r.error.message }
      return { ok: true, output_id: String((r.data as Fila).id) }
    },
    async bandeja(p) {
      const s = (await db.from('client_historical_outputs').select('client_id').eq('id', p.output_id).limit(1)) as { data: Fila[] | null; error: { message: string } | null }
      if (s.error) return { ok: false, error: s.error.message }
      if (!s.data?.[0]) return { ok: false, error: 'output_id inexistente' }
      if (String(s.data[0].client_id) !== p.client_id) return { ok: false, error: 'output_id de otro cliente' }
      const r = await db.from('hitl_queue').insert({ client_id: p.client_id, agent_name: 'oficina', risk_type: 'strategic_decision', output_preview: p.vista_previa || p.titulo, type: 'content_piece_review', title: p.titulo, priority: 'medium', status: 'pending', payload: {}, metadata: p.metadata, output_id: p.output_id, expires_at: p.expires_at }).select('id').single()
      if (r.error) return { ok: false, error: r.error.message }
      return { ok: true, id: String((r.data as Fila).id) }
    },
    async avisar(p) {
      if (p.dry_run || !env.slackToken) return
      try {
        const canal = p.canal === 'alertas' ? env.slackCanalAlertas ?? 'C0B7XUUEBHA' : env.slackCanalHilo ?? 'C0C7XUKNCLS'
        let thread: string | undefined
        if (p.canal === 'hilo') {
          const e = (await db.from('oficina_encargos').select('slack_ts').eq('id', p.encargo_id).limit(1)) as { data: Fila[] | null }
          thread = (e.data?.[0]?.slack_ts as string | null) ?? undefined
        }
        const post = async (text: string, thread_ts?: string) => {
          const r = await f('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify({ channel: canal, text, ...(thread_ts ? { thread_ts } : {}) }) })
          return (await r.json().catch(() => ({}))) as { ok?: boolean; ts?: string }
        }
        if (p.canal === 'hilo' && !thread) {
          const raiz = await post(`🧵 Encargo ${p.encargo_id}`)
          if (raiz.ok && raiz.ts) { thread = raiz.ts; await db.from('oficina_encargos').update({ slack_canal: canal, slack_ts: raiz.ts }).eq('id', p.encargo_id) }
        }
        await post(p.texto, thread)
      } catch { /* un fallo de Slack nunca frena un encargo */ }
    },
  }
}
