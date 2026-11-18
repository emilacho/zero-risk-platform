/**
 * PERFIL DEL PÚBLICO · las dependencias REALES de `correrPerfil` (base, consulta del cerebro, filtro, redactor y puerta de informes).
 * 18-nov · firma de Emilio: el perfil NO RASPA · la voz del público se lee SOLO por la consulta del cerebro (el único que raspa es el portero).
 * Vive fuera del archivo de la ruta para poder probarse (una ruta de Next solo puede exportar sus métodos).
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { baseDeRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { DEFAULT_ROUTE_POLICY, runIngressFilter } from '@/lib/ingress-filter'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaConsultar } from '@/lib/portero-alimenta/consultar'
import { AGENTE, CLASES_DE_HABLA, CLAVE_DE_LA_PALANCA, leerPalanca, OFICINA, vozDelCerebro, type VozConId } from './perfil'
import { RUTA, type DepsDeLaCorrida } from './corrida'

const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const lista = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : [])
const db = () => getSupabaseAdmin()

export function dependenciasReales(a: { client_id: string; workflow_id: string; workflow_execution_id: string; idioma: string | null; trato: string | null }): DepsDeLaCorrida {
  const base = () => db() as unknown as Db
  return {
    async leerPalanca() {
      return leerPalanca(await almacenDeSupabase().leerConfig(CLAVE_DE_LA_PALANCA), a.client_id)
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
      // la voz del público que ya juntó el portero: SOLO por la consulta del cerebro (registra quién consultó · US$ 0 · nunca raspa)
      const voces: VozConId[] = []
      let desde = 0
      for (let pagina = 0; pagina < 20; pagina++) {
        const r = await rutaConsultar({ db: base() }, { client_id: a.client_id, oficina: OFICINA, agente: AGENTE, que: 'reseñas comentarios menciones cómo habla el público', clase: CLASES_DE_HABLA.join(','), todo: true, contenido_completo: true, desde })
        const c = r.body as { resultados?: unknown[]; siguiente_desde?: number | null; error?: string }
        if (r.status !== 200) throw new Error(`el portero no contestó la consulta (${r.status} ${c.error ?? ''})`)
        for (const x of lista(c.resultados)) { const v = vozDelCerebro(x); if (v) voces.push(v) }
        if (typeof c.siguiente_desde !== 'number' || c.siguiente_desde <= desde) break
        desde = c.siguiente_desde
      }
      return voces
    },
    async filtroDeSeguridad(texto) {
      const d = await runIngressFilter(
        // el texto lo raspó el portero (vector de origen ADR-012): es de terceros aunque hoy llegue por la consulta del cerebro
        { raw_text: texto, source: 'apify_scrape', ingress_route: RUTA, client_id: a.client_id },
        { route: { ...DEFAULT_ROUTE_POLICY, route_id: 'perfil_del_publico', shadow_mode: false }, skip_classifier: true },
      )
      return d.allow === true
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
