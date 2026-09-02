/**
 * C7 · late-binding de `client_id` para `calendar_bookings`.
 *
 * ── EL DEFECTO, MEDIDO ────────────────────────────────────────────────────
 * `calendar_bookings.client_id` viene NULL en **16 de 16** filas (corrida real
 * GoEuropeAdventure 2026-09-01 · fila `0f26f698` · reserva REAL en Cal.com
 * `pRSJHjKFKPqYEj8GSXaViE`). Es la sexta vez seguida que se registra.
 *
 * La causa NO es el endpoint: `/api/calendar/book` ya acepta `body.client_id`
 * y lo persiste. La causa es que **el que llama nunca lo manda**. El nodo
 * "Schedule Kickoff Call (Cal.com)" (LyVoK · y ahora wu1DU · segunda fase)
 * arma este cuerpo y ahí no hay `client_id`:
 *
 *     { contact_id, event_title, contact_email, contact_name,
 *       duration_minutes, scheduled_at, description }
 *
 * ── POR QUÉ SE ARREGLA ACÁ Y NO EN EL FLUJO ───────────────────────────────
 * Regla vigente de Emilio · *"cambios que SUMEN, nada que modifique el camino
 * que acaba de correr bien"*. Tocar el nodo de n8n para agregarle una clave
 * significa editar un camino que acaba de correr verde de punta a punta. Este
 * módulo resuelve el vínculo **del lado del que escribe**, con lo que YA llega:
 *
 *     contact_name  = `contact_name || client_name`  ⇒ "GoEuropeAdventure"
 *     event_title   = `"Kickoff Call: " + client_name`
 *
 * El flujo queda byte-idéntico. Cuando `client_id` SÍ viene en el cuerpo, el
 * resultado es exactamente el de hoy (rama `body`, cero consultas).
 *
 * ── LO QUE NO HACE (a propósito) ──────────────────────────────────────────
 * · NO adivina. Coincidencia **exacta** de nombre contra `clients.name`.
 *   Nada de parecidos, nada de subcadenas, nada de distancia de edición.
 * · Si el nombre coincide con MÁS DE UN cliente ⇒ `ambiguous` y se deja NULL.
 *   Precedente vivo · Peniche tiene dos fichas (`e388a370` + `53b05ecb`).
 *   Atar una reunión a la ficha equivocada es PEOR que dejarla suelta.
 * · NO usa `contact_email`: en toda la historia es siempre el mismo correo del
 *   dueño (`emilacho@hotmail.com`) ⇒ no identifica a nadie.
 * · NO lanza NUNCA · un fallo de consulta devuelve `none` y la reserva se
 *   persiste igual que hoy (§148 · la red de seguridad no es punto de falla).
 *
 * Hermano de `client-id-enricher.ts` (Sprint 7.7 D2), misma forma: lectura
 * pura, primera coincidencia gana, el que llama decide qué hacer con el
 * resultado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** De dónde salió el `client_id` · queda escrito en `metadata` para forense. */
export type CalendarClientSource =
  /** vino en el cuerpo · camino de hoy, sin consultas */
  | 'body'
  /** resuelto por `contact_name` */
  | 'contact_name'
  /** resuelto por `event_title` tras sacarle el prefijo de la reunión */
  | 'event_title'
  /** no se pudo · queda NULL, igual que hoy */
  | 'none'

export interface CalendarClientResolutionInput {
  client_id?: string | null
  contact_name?: string | null
  event_title?: string | null
}

export interface CalendarClientResolution {
  client_id: string | null
  source: CalendarClientSource
  /** Nombres probados, en orden · sirve para entender un `none`. */
  candidates_tried: string[]
  /** true si algún candidato coincidió con 2+ fichas · NUNCA se elige una. */
  ambiguous: boolean
  /** Motivo legible cuando `source === 'none'`. */
  detail?: string
}

/**
 * Prefijos con los que los flujos titulan la reunión de arranque. Se sacan
 * para quedarse con el nombre del cliente. Orden · del más largo al más corto,
 * así "Kickoff Call entre Zero Risk y X" no lo come "Kickoff Call".
 *
 * Los dos primeros están MEDIDOS contra producción:
 *   wu1DU  → "Kickoff Call: GoEuropeAdventure"
 *   Cal.com → "Kickoff Call entre Zero Risk y GoEuropeAdventure"
 */
const KICKOFF_TITLE_PREFIXES: ReadonlyArray<RegExp> = [
  /^kickoff\s+call\s+entre\s+zero\s+risk\s+y\s+/i,
  /^llamada\s+de\s+arranque\s+(?:con|para)\s+(?:el\s+cliente\s+)?/i,
  /^kickoff\s+call\s*[:·-]\s*/i,
  /^kickoff\s*[:·-]\s*/i,
]

/** PostgREST `ilike` interpreta `%` y `_` · se escapan para que siga siendo exacto. */
function escapeLikeWildcards(s: string): string {
  return s.replace(/([%_\\])/g, '\\$1')
}

/**
 * Saca el nombre del cliente de un título de reunión. Devuelve `null` si el
 * título no tiene ninguno de los prefijos conocidos — **no se inventa** un
 * nombre a partir de un título con forma desconocida.
 */
export function clientNameFromEventTitle(title: string | null | undefined): string | null {
  const t = (title ?? '').trim()
  if (!t) return null
  for (const re of KICKOFF_TITLE_PREFIXES) {
    if (re.test(t)) {
      const rest = t.replace(re, '').trim()
      return rest.length > 0 ? rest : null
    }
  }
  return null
}

/**
 * Candidatos de nombre, en orden de confianza y sin repetidos.
 * Función pura · sin IO · testeable sola.
 */
export function buildClientNameCandidates(
  input: CalendarClientResolutionInput,
): Array<{ name: string; source: Exclude<CalendarClientSource, 'body' | 'none'> }> {
  const out: Array<{ name: string; source: Exclude<CalendarClientSource, 'body' | 'none'> }> = []
  const seen = new Set<string>()
  const push = (raw: string | null, source: Exclude<CalendarClientSource, 'body' | 'none'>) => {
    const name = (raw ?? '').trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, source })
  }
  push(input.contact_name ?? null, 'contact_name')
  push(clientNameFromEventTitle(input.event_title), 'event_title')
  return out
}

/** Filas mínimas que necesitamos de `clients`. */
interface ClientRow {
  id: string
}

/**
 * Busca fichas cuyo `name` sea EXACTAMENTE `name`. Primero sensible a
 * mayúsculas (`eq`), después insensible (`ilike` sin comodines) · las dos son
 * coincidencia exacta, no parecido.
 *
 * Devuelve `null` si la consulta falla (se traga el error a propósito).
 */
async function findClientsByExactName(
  supabase: SupabaseClient,
  name: string,
): Promise<ClientRow[] | null> {
  try {
    const eq = await supabase.from('clients').select('id').eq('name', name).limit(2)
    if (eq.error) return null
    if (Array.isArray(eq.data) && eq.data.length > 0) return eq.data as ClientRow[]

    const ci = await supabase
      .from('clients')
      .select('id')
      .ilike('name', escapeLikeWildcards(name))
      .limit(2)
    if (ci.error) return null
    return (Array.isArray(ci.data) ? ci.data : []) as ClientRow[]
  } catch {
    return null
  }
}

/**
 * Resuelve el `client_id` de una reserva de calendario.
 *
 * Contrato ·
 *   1. `client_id` en el cuerpo ⇒ se usa tal cual (`body`) · CERO consultas.
 *   2. Si no ⇒ se prueban los candidatos en orden. Exactamente 1 ficha ⇒ atado.
 *   3. 2+ fichas ⇒ `ambiguous: true` y se CORTA · queda NULL, nunca se elige.
 *   4. Nada ⇒ `none` · queda NULL, exactamente como hoy.
 *
 * NUNCA lanza.
 */
export async function resolveCalendarClientId(
  supabase: SupabaseClient,
  input: CalendarClientResolutionInput,
): Promise<CalendarClientResolution> {
  const fromBody = (input.client_id ?? '').trim()
  if (fromBody) {
    return { client_id: fromBody, source: 'body', candidates_tried: [], ambiguous: false }
  }

  const candidates = buildClientNameCandidates(input)
  const tried: string[] = []

  for (const c of candidates) {
    tried.push(c.name)
    const rows = await findClientsByExactName(supabase, c.name)
    if (rows === null) {
      return {
        client_id: null,
        source: 'none',
        candidates_tried: tried,
        ambiguous: false,
        detail: 'consulta a clients falló · se deja NULL (fail-open §148)',
      }
    }
    if (rows.length === 1) {
      return { client_id: rows[0].id, source: c.source, candidates_tried: tried, ambiguous: false }
    }
    if (rows.length > 1) {
      return {
        client_id: null,
        source: 'none',
        candidates_tried: tried,
        ambiguous: true,
        detail: `"${c.name}" coincide con 2+ fichas · atar a la equivocada es peor que dejarla suelta`,
      }
    }
  }

  return {
    client_id: null,
    source: 'none',
    candidates_tried: tried,
    ambiguous: false,
    detail:
      tried.length === 0
        ? 'sin contact_name ni event_title con prefijo conocido'
        : 'ningún candidato coincide exactamente con clients.name',
  }
}
