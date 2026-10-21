/**
 * Los puertos REALES del reintento sistémico de piezas (`@/lib/cadena/reintento-piezas`): lo que el reintento lee de la base y el aviso a #oficina-creativa.
 * Lo llama el vigía de la oficina (cada 10 min, `POST /api/oficina/vigia`): ese reloj ya existe y está vivo, así que el reintento no necesita un flujo nuevo en n8n.
 * Las tablas `cadena_*` se leen SOLO por el almacén de la cadena (`almacenDeSupabase` de la cadena): aquí no se nombran.
 */
import { almacenDeSupabase as almacenDeLaCadena } from '@/lib/cadena/almacen-supabase'
import { reintentarPiezas, CLAVE_INTERRUPTOR, CLAVE_LIBRETA, type Libreta, type ParteParaReintento, type PuertosDeReintento, type ResultadoDelReintento } from '@/lib/cadena/reintento-piezas'
import type { Db } from './almacen-supabase'
import { identidadVisualDelCliente, previueloDeLaminas, esFamiliaDeLaminas } from './identidad-visual'
import { almacenDeSupabase as almacenDeLaOficina } from './almacen-supabase'

type Fila = Record<string, unknown>
const CANAL_DEL_HILO = 'C0C7XUKNCLS'
const fallo = (que: string, e: { message?: string } | null): never => { throw new Error(`reintento de piezas · ${que}: ${e?.message ?? 'error de la base'}`) }

export function puertosDeReintento(db: Db, env: { slackToken?: string; canalHilo?: string }, ahora: () => Date = () => new Date()): PuertosDeReintento {
  const cadena = almacenDeLaCadena()
  const oficina = almacenDeLaOficina(db)
  return {
    ahora,
    async interruptor() { return (await cadena.leerConfig(CLAVE_INTERRUPTOR)) === true },
    async cadenaEncendida() { return (await cadena.leerConfig('estado_cadena')) === 'encendida' },
    async campanas() {
      const activas = await cadena.campanasActivas()
      return activas.filter((c) => c.autoproducir === true && c.seco !== true).map((c) => ({ id: c.id, client_id: c.client_id, sala_ref: c.sala_ref ?? null }))
    },
    async partes(c): Promise<ParteParaReintento[]> {
      const r = (await db.from('client_historical_outputs').select('id,created_at,provenance_tag').eq('client_id', c.client_id).eq('output_type', 'campaign_brief_pack').like('provenance_tag->>lote_key', `${c.id}:%`).order('created_at', { ascending: false }).limit(200)) as { data: Fila[] | null; error: { message: string } | null }
      if (r.error) fallo('leer los partes', r.error)
      return (r.data ?? []).flatMap((f) => {
        const t = f.provenance_tag && typeof f.provenance_tag === 'object' && !Array.isArray(f.provenance_tag) ? (f.provenance_tag as Record<string, unknown>) : {}
        if (t.seco === true) return []
        const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
        const lista = Array.isArray(t.familias_por_brief) ? (t.familias_por_brief as Array<Record<string, unknown>>) : []
        return [{ id: String(f.id), creado_en: String(f.created_at), valido: t.valido === true, briefs: lista.map((b) => ({ brief_id: texto(b?.brief_id), fila_id: texto(b?.fila_id), familia: texto(b?.familia) })) }]
      })
    },
    async briefsConEncargo(parteId) {
      const r = (await db.from('oficina_encargos').select('brief_id').eq('parte_id', parteId).eq('dry_run', false)) as { data: Fila[] | null; error: { message: string } | null }
      if (r.error) fallo('leer los encargos', r.error)
      return new Set((r.data ?? []).map((f) => String(f.brief_id)))
    },
    async configOficina() { return oficina.leerConfig() },
    async plantillaActiva(familia) { const p = await oficina.leerPlantilla(familia); return !!p && p.activo === true },
    async cuando(campanaId) {
      const m = new Map<string, { fecha: string; hora: string | null }>()
      try { for (const f of await cadena.filas(campanaId, Math.max(1, await cadena.ultimaVersionDeCalendario(campanaId)))) if (f.fecha) m.set(f.id, { fecha: f.fecha, hora: f.hora ?? null }) } catch { /* sin filas legibles: los sobres salen sin fecha */ }
      return m
    },
    frenoDeGasto: (clientId) => cadena.frenoDeGasto(clientId),
    async previueloDeLaminas(clientId, familia) {
      if (!esFamiliaDeLaminas(familia)) return { ok: true }
      // las mismas lecturas que el pre-vuelo de la puerta (`fuentes`): la ficha y el manual vigente; una lectura que falla NO bloquea (la puerta la vuelve a leer y decide)
      const cl = (await db.from('clients').select('id,slug,logo_url,brand_colors,brand_fonts,config').eq('id', clientId).limit(1)) as { data: Fila[] | null; error: { message: string } | null }
      const mb = (await db.from('client_brand_books').select('*').eq('client_id', clientId).order('version', { ascending: false }).limit(1)) as { data: Fila[] | null; error: { message: string } | null }
      if (cl.error || mb.error || !cl.data?.[0] || !mb.data?.[0]) return { ok: true }
      const cliente = cl.data[0]
      const config = (cliente.config ?? {}) as { apify?: { own_handles?: Record<string, string> } }
      const handles = Object.values(config.apify?.own_handles ?? {}).filter(Boolean).map((h) => (String(h).startsWith('@') ? String(h) : `@${h}`))
      const falta = previueloDeLaminas({ marca: identidadVisualDelCliente(mb.data[0], cliente, handles).marca, slug: typeof cliente.slug === 'string' && cliente.slug ? cliente.slug : null })
      return falta ? { ok: false, motivo: falta.error } : { ok: true }
    },
    emitirSobre: (sobre) => cadena.emitirSobre(sobre),
    async leerLibreta() {
      const v = await cadena.leerConfig(CLAVE_LIBRETA)
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Libreta) : {}
    },
    async escribirLibreta(l) { await cadena.escribirConfig(CLAVE_LIBRETA, l) },
    async avisar(texto) {
      if (!env.slackToken) return
      try {
        await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify({ channel: env.canalHilo ?? CANAL_DEL_HILO, text: texto }) })
      } catch { /* un fallo de Slack nunca frena la pasada */ }
    },
  }
}

/** lo que corre dentro del vigía de la oficina: NUNCA lanza (un fallo del reintento no frena el vencimiento de la bandeja ni los pasos muertos) */
export async function reintentoDeLaCadena(db: Db, env: { slackToken?: string; canalHilo?: string }, o: { ejecutar: boolean }, ahora?: () => Date): Promise<ResultadoDelReintento | { accion: 'error'; detalle: string }> {
  try { return await reintentarPiezas(puertosDeReintento(db, env, ahora), o) } catch (e) { return { accion: 'error', detalle: e instanceof Error ? e.message : String(e) } }
}
