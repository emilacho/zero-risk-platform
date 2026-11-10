/**
 * POST /api/perfil-del-publico · la puerta del PERFIL DEL PÚBLICO (T1 · GO de Lenovo por Emilio 10-nov · apagado hasta el «dale» de T3).
 * Cablea las dependencias reales de `correrPerfil` (src/lib/perfil-del-publico/corrida.ts); la lógica y sus garantías viven allá y se prueban allá.
 *
 *   · exige la llave interna, `dry_run` explícito y la firma REAL de la corrida (workflow_id + execution id): el redactor solo se invoca vía flujo;
 *   · PALANCA APAGADA POR OMISIÓN (`cadena_config.perfil_del_publico` = { encendida, clientes[] });
 *   · crédito de Apify leído por el mismo lector que la puerta del Servicio (#977), pero aquí una lectura caída es «sin crédito»;
 *   · voces: tabla propia `perfil_publico_voces` (fuera del cerebro) + fichas de habla del cerebro leídas por su consulta pública (US$ 0);
 *   · raspado por el Servicio de Apify existente, con la firma de quien llama; lo crudo se lee de vuelta de `apify_raw` por `llamado_por`;
 *   · el perfil se archiva por la puerta de informes del cerebro (`POST /api/brain/alimentar/informe`), como cualquier oficina.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { baseDeRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { creditoDeApify, leerUsoDelMes } from '@/lib/apify/credito'
import { DEFAULT_ROUTE_POLICY, runIngressFilter } from '@/lib/ingress-filter'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaConsultar } from '@/lib/portero-alimenta/consultar'
import { AGENTE, CLAVE_DE_LA_PALANCA, huellaDeVoz, leerPalanca, OFICINA, type LecturaDeCredito, type Objetivos, type VozConId } from '@/lib/perfil-del-publico/perfil'
import { correrPerfil, RUTA, type DepsDeLaCorrida } from '@/lib/perfil-del-publico/corrida'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** las clases del cerebro donde vive el habla del público (las mismas que lee el analista de voz del público) */
const CLASES_DE_HABLA = 'comentarios,resenas,mencion,foro,competidor_comentarios'
const LIMITE_DEL_CREDITO_MS = 20_000
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const lista = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : [])
const db = () => getSupabaseAdmin()

function deps(a: { client_id: string; workflow_id: string; workflow_execution_id: string; idioma: string | null; trato: string | null }): DepsDeLaCorrida {
  const base = () => db() as unknown as Db
  return {
    async leerPalanca() {
      return leerPalanca(await almacenDeSupabase().leerConfig(CLAVE_DE_LA_PALANCA), a.client_id)
    },
    async leerCredito(): Promise<LecturaDeCredito> {
      // el reloj también falla cerrado: una lectura que no vuelve es «sin crédito»
      const reloj = new Promise<LecturaDeCredito>((res) => setTimeout(() => res({ ok: false, detalle: `la lectura tardó más de ${LIMITE_DEL_CREDITO_MS / 1000} s` }), LIMITE_DEL_CREDITO_MS))
      const lectura = leerUsoDelMes().then((u): LecturaDeCredito => (u.ok ? { ok: true, respuesta: creditoDeApify(u.uso) } : { ok: false, detalle: u.detalle }))
      return Promise.race([lectura, reloj])
    },
    async empleadoListo() {
      const { data, error } = await db().from('agents').select('name, is_active').eq('name', AGENTE).limit(1)
      if (error) return { ok: false, motivo: `no se pudo leer el registro de empleados (${error.message})` }
      const f = lista(data)[0]
      if (!f) return { ok: false, motivo: `el redactor «${AGENTE}» no está dado de alta en agents` }
      return f.is_active === true ? { ok: true } : { ok: false, motivo: `el redactor «${AGENTE}» está inactivo` }
    },
    async leerFicha() {
      const { data, error } = await db().from('clients').select('industry, market, country').eq('id', a.client_id).limit(1)
      if (error) throw new Error(`clients: ${error.message}`)
      const f = lista(data)[0]
      return f ? { rubro: txt(f.industry) || null, plaza: txt(f.market) || null, pais: txt(f.country) || null, idioma: a.idioma, trato: a.trato } : null
    },
    async leerPublicos() {
      const { data, error } = await db().from('client_icp_documents').select('id, audience_segment, segment_priority, job_titles, company_size, industries, geography').eq('client_id', a.client_id).limit(50)
      if (error) throw new Error(`client_icp_documents: ${error.message}`)
      return lista(data)
    },
    async leerVoces() {
      const { data, error } = await db().from('perfil_publico_voces').select('id, texto, fuente, enlace, fecha, huella').eq('client_id', a.client_id).order('created_at', { ascending: false }).limit(3000)
      if (error) throw new Error(`perfil_publico_voces: ${error.message}`)
      const propias: VozConId[] = lista(data).map((f) => ({ id: String(f.id), texto: String(f.texto), fuente: String(f.fuente), enlace: txt(f.enlace) || null, fecha: txt(f.fecha) || null, huella: String(f.huella) }))
      // las fichas de habla del cerebro, por su consulta pública (registra quién consultó · US$ 0)
      const fichas: VozConId[] = []
      let desde = 0
      for (let pagina = 0; pagina < 20; pagina++) {
        const r = await rutaConsultar({ db: base() }, { client_id: a.client_id, oficina: OFICINA, agente: AGENTE, que: 'reseñas comentarios menciones cómo habla el público', clase: CLASES_DE_HABLA, todo: true, contenido_completo: true, desde })
        const c = r.body as { resultados?: unknown[]; siguiente_desde?: number | null; error?: string }
        if (r.status !== 200) throw new Error(`el portero no contestó la consulta (${r.status} ${c.error ?? ''})`)
        for (const x of lista(c.resultados)) {
          const texto = String(x.contenido ?? '').replace(/\s+/g, ' ').trim()
          if (texto) fichas.push({ id: String(x.ficha_id), texto, fuente: `cerebro:${txt(x.clase) || 'ficha'}`, enlace: null, fecha: txt(x.fecha_de_la_fuente) || txt(x.fecha) || null, huella: huellaDeVoz(texto) })
        }
        if (typeof c.siguiente_desde !== 'number' || c.siguiente_desde <= desde) break
        desde = c.siguiente_desde
      }
      return [...propias, ...fichas]
    },
    async leerObjetivos(): Promise<Objetivos> {
      const leer = async (fn: string, n: number) => {
        const { data, error } = await db().from('apify_raw').select('respuesta').eq('client_id', a.client_id).eq('ensayo', false).eq('apify_function', fn).order('created_at', { ascending: false }).limit(n)
        if (error) throw new Error(`apify_raw: ${error.message}`)
        return lista(data).flatMap((f) => lista(f.respuesta))
      }
      const lugares = [...(await leer('own_google_maps_profile', 3)), ...(await leer('google_maps_scraper', 3))].map((x) => txt(x.url)).filter((u) => /^https?:\/\//i.test(u))
      const perfiles = await leer('instagram_scraper', 5)
      const publicaciones = perfiles.flatMap((p) => lista(p.latestPosts)).map((x) => txt(x.url)).filter((u) => /^https?:\/\//i.test(u))
      const cuentas = perfiles.map((p) => txt(p.username)).filter(Boolean)
      const videos = (await leer('videos_youtube', 3)).map((x) => txt(x.url)).filter((u) => /^https?:\/\//i.test(u))
      const ficha = await this.leerFicha()
      const etiqueta = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const busquedas = [etiqueta(ficha?.plaza), `${etiqueta(ficha?.rubro)}${etiqueta(ficha?.plaza)}`].filter((x) => x.length >= 3)
      return { lugares, publicaciones, busquedas, cuentas, videos }
    },
    async recolectar(ll, n) {
      const puerta = process.env.APIFY_SERVICE_WEBHOOK_URL
      if (!puerta) return { ok: false, detalle: 'el Servicio de Apify no está configurado (falta APIFY_SERVICE_WEBHOOK_URL)', costo_usd: 0 }
      const llamadoPor = `perfil-del-publico:${a.workflow_execution_id}:${n}`
      const r = await fetch(puerta, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: a.client_id, apify_function: ll.funcion, destination: 'respuesta', dry_run: false, tope_usd: ll.usd_max, params: ll.params,
          metadata: { scope: OFICINA, llamado_por: llamadoPor, calling_workflow_id: a.workflow_id, calling_workflow_execution_id: a.workflow_execution_id },
        }),
        signal: AbortSignal.timeout(300_000),
      })
      if (!r.ok) return { ok: false, detalle: `el Servicio contestó HTTP ${r.status}`, costo_usd: null }
      const { data, error } = await db().from('apify_raw').select('respuesta').eq('client_id', a.client_id).eq('apify_function', ll.funcion).eq('ensayo', false).eq('metadata->>llamado_por', llamadoPor).limit(1)
      if (error) return { ok: false, detalle: `apify_raw: ${error.message}`, costo_usd: null }
      const fila = lista(data)[0]
      if (!fila) return { ok: false, detalle: 'el Servicio contestó pero no dejó lo crudo en apify_raw', costo_usd: null }
      return { ok: true, items: lista(fila.respuesta), costo_usd: null }
    },
    async filtroDeSeguridad(texto) {
      const d = await runIngressFilter(
        { raw_text: texto, source: 'apify_scrape', ingress_route: RUTA, client_id: a.client_id },
        { route: { ...DEFAULT_ROUTE_POLICY, route_id: 'perfil_del_publico', shadow_mode: false }, skip_classifier: true },
      )
      return d.allow === true
    },
    async guardarVoces(voces) {
      const filas = voces.map((v) => ({ client_id: a.client_id, texto: v.texto, fuente: v.fuente, enlace: v.enlace, fecha: v.fecha, huella: v.huella, provenance_tag: v.etiqueta, workflow_execution_id: a.workflow_execution_id }))
      const { data, error } = await db().from('perfil_publico_voces').upsert(filas, { onConflict: 'client_id,huella', ignoreDuplicates: true }).select('id, texto, fuente, enlace, fecha, huella')
      if (error) throw new Error(`perfil_publico_voces: ${error.message}`)
      return lista(data).map((f) => ({ id: String(f.id), texto: String(f.texto), fuente: String(f.fuente), enlace: txt(f.enlace) || null, fecha: txt(f.fecha) || null, huella: String(f.huella) }))
    },
    async redactar(tarea, tope_usd) {
      const modelo = modeloRunSdk({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY, fetch: globalThis.fetch, workflow_id: a.workflow_id })
      const r = await modelo.invocar({ agente: AGENTE, tarea, encargo_id: a.workflow_execution_id, client_id: a.client_id, paso: 'perfil-del-publico', tope_usd, dry_run: false })
      if (!r.ok) return { ok: false as const, error: r.error, costo_usd: r.costo_usd }
      return typeof r.salida === 'string' ? { ok: true as const, salida: r.salida, costo_usd: r.costo_usd } : { ok: false as const, error: 'el redactor no devolvió texto', costo_usd: r.costo_usd }
    },
    async archivar(cuerpo) {
      const llave = process.env.INTERNAL_API_KEY
      if (!llave) return { ok: false, detalle: 'no se archivó: falta la llave interna en el servidor' }
      const r = await fetch(`${baseDeRunSdk(process.env).replace(/\/+$/, '')}/api/brain/alimentar/informe`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': llave }, body: JSON.stringify(cuerpo) })
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
      if (!r.ok) return { ok: false, detalle: `el portero no archivó (${r.status}) · ${String(j?.error ?? '')} ${String(j?.detalle ?? '')}`.trim().slice(0, 300) }
      if (j?.apagado === true) return { ok: false, detalle: 'el portero no archivó: su puerta de informes está apagada' }
      return { ok: true, detalle: `archivado (${r.status})${j?.repetido ? ' · ya estaba igual' : ''}` }
    },
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) return NextResponse.json({ error: 'no_autorizado', detalle: auth.reason }, { status: 401 })
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!c || typeof c !== 'object') return NextResponse.json({ error: 'entrada_invalida', detalle: 'el cuerpo debe ser JSON' }, { status: 400 })
  const client_id = txt(c.client_id)
  if (!UUID.test(client_id)) return NextResponse.json({ error: 'entrada_invalida', detalle: '`client_id` debe ser un uuid' }, { status: 400 })
  // 🔴 el ensayo se DECIDE, no se asume: asumir `false` sería gastar sin que nadie lo pidiera
  if (typeof c.dry_run !== 'boolean') return NextResponse.json({ error: 'entrada_invalida', detalle: 'falta `dry_run` explícito (true o false) · no se hizo nada' }, { status: 400 })
  const workflow_id = txt(c.workflow_id), workflow_execution_id = txt(c.workflow_execution_id)
  // 🔴 el redactor SOLO se invoca vía flujo: sin firma no hay corrida
  if (!workflow_id || !workflow_execution_id) return NextResponse.json({ error: 'sin_firma', detalle: 'falta la firma de la corrida (workflow_id y workflow_execution_id) · no se hizo nada' }, { status: 403 })
  try {
    const r = await correrPerfil(deps({ client_id, workflow_id, workflow_execution_id, idioma: txt(c.idioma) || null, trato: txt(c.trato) || null }), {
      client_id, dry_run: c.dry_run, workflow_id, workflow_execution_id, ...(typeof c.tope_usd === 'number' ? { tope_usd: c.tope_usd } : {}),
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: 'se_rompio', detalle: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 })
  }
}
