/**
 * Camino III · rama "corregir" estándar para workers productores
 * (SPEC 2026-06-27 §6) · §144 rama.
 *
 * Patrón ÚNICO reutilizable · capa transversal · todo worker productor (NEXUS,
 * onboarding, etc.) enchufa la MISMA rama cuando el router le manda una tarea
 * `corregir` con item_id + _journey_id ·
 *   1. lee editorial_decisions[item_id].corrections + revision_count (1 fuente)
 *   2. re-invoca al MISMO agente productor con el borrador previo + las
 *      correcciones inyectadas ("corregí SOLO esto · no regeneres todo")
 *   3. reentrega al gate (mismo item_id · revision_count++)
 *
 * Principio que no se rompe · el CREADOR corrige · NO los jefes (SPEC §1). Los
 * jefes diagnostican (corrections) · el creador ejecuta. Esta rama es el lado
 * del creador · NO toca camino_iii_votes.
 *
 * §148 honest · `loadCorrectionPackage` NEVER throws (fail-open) · requiere
 * migración 202606271200 (corrections + revision_count). El cableado del NODO
 * n8n que llama esta rama vive OUT-OF-REPO (los workers son n8n) · este módulo
 * es el contrato TS que ese nodo invoca · documentado, no inventado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsolidatedCorrection } from './corrections'

export interface CorrectionPackage {
  readonly item_type: string
  readonly item_id: string
  readonly revision_count: number
  readonly corrections: ConsolidatedCorrection[]
  /** false when no editorial_decisions row was found for the item. */
  readonly found: boolean
}

export interface LoadCorrectionPackageResult {
  readonly ok: boolean
  readonly pkg: CorrectionPackage
  readonly reason?: string
}

const emptyPkg = (item_type: string, item_id: string): CorrectionPackage => ({
  item_type,
  item_id,
  revision_count: 0,
  corrections: [],
  found: false,
})

/**
 * Read the correction package for a piece by its item key. The item_id is THE
 * key (SPEC §4) · the worker recovers the corrections of its own piece. NEVER
 * throws · fail-open returns an empty package tagged `ok:false`.
 */
export async function loadCorrectionPackage(
  supabase: Pick<SupabaseClient, 'from'>,
  item_type: string,
  item_id: string,
): Promise<LoadCorrectionPackageResult> {
  try {
    const { data, error } = await supabase
      .from('editorial_decisions')
      .select('corrections, revision_count')
      .eq('item_type', item_type)
      .eq('item_id', item_id)
      .maybeSingle()

    if (error) {
      return { ok: false, pkg: emptyPkg(item_type, item_id), reason: error.message }
    }
    if (!data) {
      return {
        ok: true,
        pkg: emptyPkg(item_type, item_id),
        reason: 'no editorial_decisions row for item',
      }
    }
    const row = data as { corrections?: unknown; revision_count?: unknown }
    return {
      ok: true,
      pkg: {
        item_type,
        item_id,
        revision_count:
          typeof row.revision_count === 'number' ? row.revision_count : 0,
        corrections: Array.isArray(row.corrections)
          ? (row.corrections as ConsolidatedCorrection[])
          : [],
        found: true,
      },
    }
  } catch (e) {
    return {
      ok: false,
      pkg: emptyPkg(item_type, item_id),
      reason: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Inject the corrections into the producer agent's re-invocation prompt. The
 * contract · "tu borrador previo + estas correcciones · corregí SOLO esto · NO
 * regeneres la pieza completa" (SPEC §6 paso 3). Groups corrections by axis so
 * the creator sees factual vs voz vs posicionamiento vs cliente clearly.
 */
export function buildCorrectionPrompt(
  draft: string,
  pkg: CorrectionPackage,
): string {
  if (pkg.corrections.length === 0) {
    // Defensive · the router should not route "corregir" with zero corrections.
    return draft
  }
  const lines: string[] = []
  lines.push(
    `Esta es tu pieza (borrador previo). La Jefatura la revisó y pide correcciones ` +
      `CONCRETAS. Corregí ÚNICAMENTE los puntos listados abajo · NO regeneres la ` +
      `pieza completa · mantené todo lo demás igual. Ciclo de revisión ${pkg.revision_count}/3.`,
  )
  lines.push('')
  lines.push('--- BORRADOR PREVIO ---')
  lines.push(draft)
  lines.push('')
  lines.push('--- CORRECCIONES A APLICAR ---')
  let n = 1
  for (const c of pkg.corrections) {
    lines.push(
      `${n}. [${c.eje} · ${c.severidad}] en "${c.donde}"\n` +
        `   problema: ${c.problema}\n` +
        `   por qué: ${c.por_que}\n` +
        `   cambio: ${c.cambio_sugerido}\n` +
        `   (revisor: ${c.reviewer_agent}${c.is_voting ? '' : ' · advisor no-votante'})`,
    )
    n++
  }
  lines.push('')
  lines.push(
    'Devolvé la pieza corregida completa, con SOLO esos cambios aplicados.',
  )
  return lines.join('\n')
}
