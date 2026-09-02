/**
 * La advertencia del empleado sale de la prosa y pasa a ser un dato.
 *
 * ── EL DEFECTO, MEDIDO ────────────────────────────────────────────────────
 * Corrida real GoEuropeAdventure · 2026-09-01 · manual `5648b126`. El
 * editor-en-jefe cerró su `voice_description` así:
 *
 *   "...compite en conveniencia y transparencia. ADVERTENCIA DE CONFIANZA BAJA:
 *    esta descripción es inferida exclusivamente desde el positioning
 *    estratégico y los datos del ICP; no existen muestras directas de copy del
 *    cliente en la evidencia (apify_sources vacío)."
 *
 * Esa frase quedó DENTRO del texto que se guarda en la columna, se indexa en el
 * cerebro y se le muestra al cliente. `apify_sources` es el nombre de una
 * variable interna: el cliente no tiene por qué leerlo, y el empleado no tiene
 * dónde más ponerlo.
 *
 * ── LO QUE NO SE HACE ─────────────────────────────────────────────────────
 * 🔴 **NO se borra la advertencia.** El empleado hizo lo correcto al declarar su
 * desconfianza sin que nadie se lo pidiera — con `voice_description` puntuando
 * 0.30, ese aviso es la información MÁS valiosa del campo. Borrarlo sería
 * premiar el silencio. Se MUEVE: sale de la prosa, entra como dato estructurado
 * en `content_text._caveats`, donde se puede consultar, contar y mostrar aparte.
 *
 * ── LO QUE SÍ SE HACE ─────────────────────────────────────────────────────
 *   1. Se corta la advertencia SOLO si está al FINAL y empieza con un marcador
 *      conocido. Un texto sin marcador no se toca ni un carácter.
 *   2. La advertencia se guarda entera, textual, en `_caveats[campo]`.
 *   3. `brand_book_draft` dentro de `content_text` se preserva VERBATIM · es el
 *      registro forense de lo que la lente produjo. Lo que se limpia es la
 *      COLUMNA, que es lo que leen el cerebro, el visor y el cliente.
 *   4. Aparte, se DETECTAN (sin tocar el texto) identificadores internos que se
 *      hayan colado igual · quedan en `_leaked_internal_terms` para que la
 *      próxima vez alguien se entere sin tener que leer los manuales a mano.
 *
 * Función pura · sin IO · misma forma que `buildBrandBookRow`, que ya se prueba
 * sin HTTP ni Supabase.
 */

/**
 * Marcadores con los que un empleado abre una advertencia sobre su propio
 * trabajo. Anclados al inicio de la advertencia, buscados sólo al FINAL del
 * texto. El primero es el medido en producción.
 */
const CAVEAT_MARKERS: ReadonlyArray<string> = [
  'ADVERTENCIA DE CONFIANZA BAJA',
  'ADVERTENCIA DE BAJA CONFIANZA',
  'NOTA DE CONFIANZA',
  'NOTA INTERNA',
  'CONFIANZA BAJA',
  'LOW CONFIDENCE WARNING',
  'LOW-CONFIDENCE WARNING',
  'CONFIDENCE WARNING',
]

/**
 * Identificadores internos que NUNCA deberían aparecer en texto que ve el
 * cliente. No se borran (borrar a ciegas mutila la frase) · se DECLARAN.
 */
const INTERNAL_TERMS: ReadonlyArray<string> = [
  'apify_sources',
  'apify_scrape',
  'discovery_package',
  'discovery_summary',
  '_field_meta',
  'client_brain_chunks',
  'provenance_tag',
  'run-sdk',
  'brand_book_draft',
  'icp_summary',
  'retention_notes',
  'customer_angle',
  'gate_outcome',
  'fidelity_scores',
]

export interface CaveatExtraction {
  /** El texto sin la advertencia · idéntico al original si no había ninguna. */
  clean: string
  /** La advertencia, textual y entera. `null` si no había. */
  caveat: string | null
}

/**
 * Corta una advertencia final. Sólo actúa si el marcador está al FINAL del
 * texto (nada relevante después salvo la propia advertencia).
 *
 * Se elige la aparición MÁS TEMPRANA entre todos los marcadores, para no
 * partir una advertencia por la mitad cuando encadena dos marcadores.
 */
export function extractTrailingCaveat(text: string | null | undefined): CaveatExtraction {
  const t = typeof text === 'string' ? text : ''
  if (!t.trim()) return { clean: t ?? '', caveat: null }

  const upper = t.toUpperCase()
  let cut = -1
  for (const marker of CAVEAT_MARKERS) {
    const i = upper.indexOf(marker)
    if (i >= 0 && (cut === -1 || i < cut)) cut = i
  }
  if (cut === -1) return { clean: t, caveat: null }

  const caveat = t.slice(cut).trim()
  // Limpieza mínima del borde: el punto/espacio que quedó colgando antes de la
  // advertencia se conserva; sólo se recortan espacios finales.
  const clean = t.slice(0, cut).trimEnd()

  // Guardia · si al sacar la advertencia no queda nada útil, el campo ERA la
  // advertencia. En ese caso no se limpia: se deja el texto entero y se declara
  // el aviso igual. Vaciar un campo es peor que dejarlo feo.
  if (!clean) return { clean: t, caveat }

  return { clean, caveat }
}

/** Identificadores internos presentes en el texto · sin modificarlo. */
export function detectInternalTerms(text: string | null | undefined): string[] {
  const t = (typeof text === 'string' ? text : '').toLowerCase()
  if (!t) return []
  return INTERNAL_TERMS.filter((term) => t.includes(term.toLowerCase()))
}

/** Campos de PROSA del manual · los que un cliente lee como texto corrido. */
export const PROSE_FIELDS: ReadonlyArray<string> = [
  'voice_description',
  'positioning',
  'icp_summary',
  'customer_angle',
  'retention_notes',
  'mision',
  'proposito',
  'elevator_pitch',
]

export interface ProseSanitizeResult {
  /** Sólo los campos que CAMBIARON · texto ya limpio. */
  cleaned: Record<string, string>
  /** Advertencias rescatadas, por campo · nunca se pierden. */
  caveats: Record<string, string>
  /** Identificadores internos que quedaron, por campo · se declaran, no se borran. */
  leaked: Record<string, string[]>
}

/**
 * Pasa los campos de prosa por el extractor. Devuelve SÓLO lo que cambió · un
 * manual sin advertencias produce los tres objetos vacíos y nada se toca.
 */
export function sanitizeProseFields(bb: Record<string, unknown>): ProseSanitizeResult {
  const cleaned: Record<string, string> = {}
  const caveats: Record<string, string> = {}
  const leaked: Record<string, string[]> = {}

  for (const field of PROSE_FIELDS) {
    const raw = bb[field]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const { clean, caveat } = extractTrailingCaveat(raw)
    if (caveat) caveats[field] = caveat
    if (clean !== raw) cleaned[field] = clean
    const terms = detectInternalTerms(clean)
    if (terms.length > 0) leaked[field] = terms
  }

  return { cleaned, caveats, leaked }
}
