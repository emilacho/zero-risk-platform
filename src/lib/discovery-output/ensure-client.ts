/**
 * ensure-client · ordering guard para el lazo Discovery → brain (Sprint 13).
 *
 * BUG (raw/findings/2026-06-28-bug-discovery-persist-client-not-found):
 * el worker n8n LyVoKcrypS5uLyuu dispara el agente discovery en modo
 * fire-and-forget EN PARALELO con el nodo "Persist Client to Supabase". El
 * brain-push corre síncrono dentro de /api/agents/run-sdk; si llega antes que
 * el upsert del cliente, la fila `clients` todavía no existe →
 *   - populate-config → errors:["client_not_found"]
 *   - persist-brain → los child rows (competitive_landscape · icp · chunks) son
 *     FK-dependientes de clients.id → fallan soft → brain_chunks_upserted:0
 *
 * Fix (Opción A · backend · sin tocar n8n): antes de persistir el brain,
 * garantizar que la fila `clients` exista. La identidad (name/industry/website)
 * NO viaja en el payload emit_discovery_output (solo client_id), pero SÍ está
 * embebida en el `task` que el worker arma. La parseamos y creamos la fila con
 * el slug canónico → cuando el nodo "Persist Client to Supabase" corra después,
 * su upsert on_conflict=slug hace UPDATE idempotente de la misma fila (sin
 * colisión de PK · sin duplicado).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Slugify · DEBE producir el MISMO resultado que slugify() en
 * src/app/api/clients/upsert/route.ts · de eso depende que el upsert posterior
 * (on_conflict=slug) reconcilie esta fila en vez de colisionar el PK.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100) || 'client'
}

export interface ParsedClientIdentity {
  name?: string
  industry?: string
  website?: string
}

/**
 * Extrae name/industry/website del task que arma el worker. Formato canónico:
 *   "Auto-discover Client Brain for <name> (industry: <ind>, website: <web>, client_id: <id>)."
 * Fallback laxo · "... for <name> (" cuando el formato completo no matchea.
 */
export function parseClientIdentityFromTask(
  task: string | null | undefined,
): ParsedClientIdentity {
  if (!task || typeof task !== 'string') return {}
  const out: ParsedClientIdentity = {}
  const full =
    /\bfor\s+(.+?)\s*\(industry:\s*(.+?)\s*,\s*website:\s*(.+?)\s*,\s*client_id:/i.exec(
      task,
    )
  if (full) {
    out.name = full[1].trim()
    if (full[2] && full[2].trim() && full[2].trim().toLowerCase() !== 'unknown')
      out.industry = full[2].trim()
    if (full[3] && full[3].trim() && full[3].trim().toLowerCase() !== 'unknown')
      out.website = full[3].trim()
    return out
  }
  const loose = /\bfor\s+(.+?)\s*\(/i.exec(task)
  if (loose && loose[1].trim()) {
    out.name = loose[1].trim()
    return out
  }

  // FIX 2026-08-11 (CC#1 · ficha fantasma del tiro Peniche) · la tarea del
  // RE-descubrimiento está en ESPAÑOL y no dice «for <nombre> (», así que ninguno
  // de los dos patrones de arriba calzaba y la ficha nacía anónima:
  //   "Rehacé el descubrimiento de competidores de Peniche Surf Escape (https://…)"
  // → `Cliente 53b05ecb`, país por defecto, sin web (exec 88922 · fila creada
  // 19:49:18, un segundo después de que terminara la re-invocación).
  // El nombre SÍ estaba en el texto; sólo faltaba saber leerlo.
  const es = /\bde\s+competidores\s+de\s+(.+?)\s*[(·\n]/i.exec(task)
  if (es && es[1].trim()) {
    out.name = es[1].trim()
    const web = /\((https?:\/\/[^\s)]+)\)/i.exec(task)
    if (web) out.website = web[1]
    return out
  }
  return out
}

export interface EnsureClientInput {
  supabase: SupabaseClient
  clientId: string
  task?: string | null
}

export interface EnsureClientResult {
  status: 'existed' | 'created' | 'failed'
  error?: string
}

/**
 * Garantiza que exista una fila `clients` con id = clientId. Idempotente · si ya
 * existe no hace nada. Si falta, la crea con la identidad parseada del task (o un
 * placeholder cuando no se puede parsear · el objetivo primario es satisfacer la
 * FK para que el brain-push persista). Nunca lanza · devuelve outcome.
 */
export async function ensureClientExists(
  input: EnsureClientInput,
): Promise<EnsureClientResult> {
  const { supabase, clientId, task } = input
  if (!clientId) return { status: 'failed', error: 'no_client_id' }

  const { data: existing, error: readErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()
  if (readErr) return { status: 'failed', error: `read_error: ${readErr.message}` }
  if (existing) return { status: 'existed' }

  const ident = parseClientIdentityFromTask(task)
  const name = ident.name && ident.name.length > 0
    ? ident.name
    : `Cliente ${clientId.slice(0, 8)}`
  // FIX 2026-08-11 (CC#1) · el `slug` se comporta como ÚNICO (el upsert canónico
  // usa on_conflict=slug). Ahora que el nombre SÍ se lee de la tarea del
  // re-descubrimiento, el slug natural puede chocar con la ficha REAL del mismo
  // cliente —que es justo el caso de Peniche: `peniche-surf-escape` ya existía en
  // `e388a370`—. Este upsert va con on_conflict=**id**, así que un choque de slug
  // NO se ignora: devolvería error y se perdería la garantía de FK que esta función
  // existe para dar. Si el slug está tomado por OTRA fila, se desambigua.
  //
  // Ojo · desambiguar NO unifica las dos fichas: sólo evita el choque y deja la
  // duplicación VISIBLE (nombre real + sufijo) en vez de escondida tras un
  // `Cliente xxxxxxxx`. La causa de fondo —el alta pre-inventa un UUID mientras el
  // upsert resuelve por slug, dos autoridades de identidad— se arregla aguas arriba.
  const base = slugify(name)
  let slug = base
  const { data: choque } = await supabase
    .from('clients')
    .select('id')
    .eq('slug', base)
    .maybeSingle()
  if (choque && (choque as { id?: string }).id !== clientId) {
    slug = `${base}-${clientId.slice(0, 8)}`
    console.warn(
      `[ensure-client] slug "${base}" ya lo usa ${String((choque as { id?: string }).id).slice(0, 8)} · ` +
        `se crea "${slug}" para ${clientId.slice(0, 8)} · DOS fichas para el mismo cliente`,
    )
  }
  const row: Record<string, unknown> = {
    id: clientId,
    name,
    slug,
    status: 'onboarding',
  }
  if (ident.website) row.website_url = ident.website
  if (ident.industry) row.industry = ident.industry

  // on_conflict=id + ignoreDuplicates · seguro ante carrera (otra invocación
  // pudo crearla entremedio). NO pisa una fila existente.
  const { error: insErr } = await supabase
    .from('clients')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
  if (insErr) return { status: 'failed', error: `insert_error: ${insErr.message}` }
  return { status: 'created' }
}
