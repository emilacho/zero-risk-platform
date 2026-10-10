/**
 * Lecturas (SOLO lectura) que necesita la revisión del manual sobre Supabase. El único archivo de `src/lib/manual` que nombra tablas.
 * Nada se escribe aquí: las rutas `/api/manual/*` de esta etapa son de consulta (US$ 0, sin modelo).
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import type { SintesisDeAgente } from './cliente'
import type { FilaDeRaspado } from './materia'

const fallo = (e: { message?: string } | null): never => { throw new Error(e?.message ?? 'error de la base') }

export interface FichaMinima { id: string; website_url: string | null; config: unknown }

export async function cargarFichaYRaspado(clientId: string): Promise<{ ficha: FichaMinima | null; filas: FilaDeRaspado[] }> {
  const db = getSupabaseAdmin()
  const f = await db.from('clients').select('id,website_url,config').eq('id', clientId).maybeSingle()
  if (f.error) fallo(f.error)
  const r = await db.from('apify_raw').select('id,apify_function,params,respuesta,ensayo').eq('client_id', clientId).eq('ensayo', false).order('created_at', { ascending: false }).limit(300)
  if (r.error) fallo(r.error)
  return { ficha: (f.data as FichaMinima | null) ?? null, filas: (r.data ?? []) as FilaDeRaspado[] }
}

const CAMPOS_DEL_MANUAL = 'id,version,brand_purpose,brand_vision,brand_mission,brand_values,brand_personality,voice_description,tone_guidelines,writing_style,tagline,elevator_pitch,key_messages,value_propositions,imagery_style,compliance_notes,positioning'

/** la versión vigente del manual (la más alta) o null; no se edita nunca */
export async function ultimoManual(clientId: string): Promise<{ version: number; manual: Record<string, unknown> } | null> {
  const r = await getSupabaseAdmin().from('client_brand_books').select(CAMPOS_DEL_MANUAL).eq('client_id', clientId).order('version', { ascending: false }).limit(1)
  if (r.error) fallo(r.error)
  const fila = ((r.data ?? [])[0] ?? null) as Record<string, unknown> | null
  if (!fila) return null
  const { id: _id, version, ...manual } = fila
  void _id
  return { version: Number(version) || 0, manual }
}

const cortar = (s: unknown) => String(s ?? '').slice(0, 8000)

/** lo que escribieron los agentes del descubrimiento (documentos de ICP y panorama competitivo): sirve para detectar dudas, jamás como respaldo */
export async function sintesisDelCliente(clientId: string): Promise<SintesisDeAgente[]> {
  const db = getSupabaseAdmin()
  const a = await db.from('client_icp_documents').select('id,audience_segment,content_text').eq('client_id', clientId).limit(20)
  if (a.error) fallo(a.error)
  const b = await db.from('client_competitive_landscape').select('id,competitor_name,content_text').eq('client_id', clientId).limit(40)
  if (b.error) fallo(b.error)
  return [
    ...((a.data ?? []) as Array<{ id: string; audience_segment: string | null; content_text: string | null }>).map((x) => ({ id: `icp:${x.id}`, rotulo: `documento de ICP · ${x.audience_segment ?? x.id}`, texto: cortar(x.content_text) })),
    ...((b.data ?? []) as Array<{ id: string; competitor_name: string | null; content_text: string | null }>).map((x) => ({ id: `panorama:${x.id}`, rotulo: `panorama competitivo · ${x.competitor_name ?? x.id}`, texto: cortar(x.content_text) })),
  ].filter((s) => s.texto.trim() !== '')
}
