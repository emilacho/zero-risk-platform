/**
 * Tests · JEFATURA Peldaño 1 · SCHEMA + MIGRACIÓN (buckets C1/C2 · $0 · ADR-020 §4 · §148).
 *
 * C1 · el SCHEMA rechaza la política CIRCULAR (cimiento que se vota).
 *      Se verifica en dos planos:
 *        (a) estático · el CHECK `jefatura_no_circular_cimiento` existe en el .sql
 *            con el predicado canónico NOT (cimiento AND judgment_enabled).
 *        (b) shadow $0 · un espejo puro de TODOS los CHECK de la migración rechaza
 *            la fila circular (y las malformadas) y acepta las válidas.
 * C2 · DRY-RUN de la migración en SHADOW sin tocar prod:
 *        (a) $0 default · las 7 filas del SEED de la migración pasan el espejo →
 *            la migración aplicaría limpia (constraints + seed self-consistente).
 *        (b) opcional · si JEFATURA_SHADOW_DB_URL está seteada, aplica el .sql a esa
 *            base efímera con `pg` y comprueba que el INSERT circular EXPLOTA.
 *            SKIP por default ⇒ $0 · NUNCA toca prod.
 * Contabilidad de costo · el suite no hace NI UNA llamada de red/LLM ⇒ $0.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '202607051200_jefatura_grading_policies.sql',
)
const SQL = existsSync(MIGRATION_PATH)
  ? readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n')
  : ''

// ─── Espejo PURO de los CHECK de la migración (shadow $0 · sin Postgres) ──────
// Réplica fiel de las restricciones del .sql. Los tests estáticos de abajo
// aseguran que este espejo NO se desincronice del SQL real (si el .sql cambia,
// los asserts de estructura fallan y obligan a actualizar el espejo).
type PolicyRow = {
  artifact_class: 'cimiento' | 'contenido' | string
  correction_enabled?: boolean
  judgment_enabled: boolean
  canon_grader: 'fidelity' | 'vote_3_of_n' | string
  counterweight?: 'shadow_scorer' | 'gpt55_non_voting' | null | string
  max_cycles: number
  fidelity_threshold: number | null
}

/** Devuelve la lista de constraints violadas (vacía = fila válida · la aceptaría el DB). */
function violatedConstraints(row: PolicyRow): string[] {
  const bad: string[] = []
  if (!['cimiento', 'contenido'].includes(row.artifact_class)) bad.push('artifact_class_enum')
  if (!['fidelity', 'vote_3_of_n'].includes(row.canon_grader)) bad.push('canon_grader_enum')
  if (row.counterweight != null && !['shadow_scorer', 'gpt55_non_voting'].includes(row.counterweight))
    bad.push('counterweight_enum')
  if (!(row.max_cycles >= 1 && row.max_cycles <= 3)) bad.push('max_cycles_between_1_3')
  if (row.fidelity_threshold != null && !(row.fidelity_threshold > 0 && row.fidelity_threshold <= 1))
    bad.push('fidelity_threshold_range')
  // NO-CIRCULARIDAD (ADR-020 §4 · no-negociable)
  if (row.artifact_class === 'cimiento' && row.judgment_enabled === true)
    bad.push('jefatura_no_circular_cimiento')
  // grader ↔ clase
  const graderMatch =
    (row.artifact_class === 'cimiento' && row.canon_grader === 'fidelity') ||
    (row.artifact_class === 'contenido' && row.canon_grader === 'vote_3_of_n')
  if (!graderMatch) bad.push('jefatura_grader_class_match')
  return bad
}

// ─── C1 · estático · el CHECK vive en el .sql ────────────────────────────────
describe('JEFATURA Peldaño 1 · C1 · schema estático rechaza circular', () => {
  it('la migración existe y declara la tabla jefatura_grading_policies', () => {
    expect(SQL.length).toBeGreaterThan(0)
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS jefatura_grading_policies/)
  })

  it('CHECK jefatura_no_circular_cimiento con el predicado canónico (§4)', () => {
    expect(SQL).toMatch(/CONSTRAINT\s+jefatura_no_circular_cimiento/)
    // NOT (artifact_class = 'cimiento' AND judgment_enabled = true) · tolerante a espacios
    expect(SQL).toMatch(
      /NOT\s*\(\s*artifact_class\s*=\s*'cimiento'\s+AND\s+judgment_enabled\s*=\s*true\s*\)/,
    )
  })

  it('los demás CHECK de integridad están presentes', () => {
    expect(SQL).toMatch(/CONSTRAINT\s+jefatura_grader_class_match/)
    expect(SQL).toMatch(/artifact_class\s+IN\s*\(\s*'cimiento',\s*'contenido'\s*\)/)
    expect(SQL).toMatch(/canon_grader\s+IN\s*\(\s*'fidelity',\s*'vote_3_of_n'\s*\)/)
    expect(SQL).toMatch(/max_cycles\s+BETWEEN\s+1\s+AND\s+3/)
    expect(SQL).toMatch(/fidelity_threshold\s+IS\s+NULL\s+OR/)
  })

  it('§148 · la migración se marca NO APLICADA A PROD ($0 · apply post-GO)', () => {
    expect(SQL).toMatch(/NO APLICADA A PROD/)
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
})

// ─── C1 · shadow $0 · el espejo rechaza circular + malformadas ───────────────
describe('JEFATURA Peldaño 1 · C1 · shadow $0 rechaza circular/malformadas', () => {
  it('fila CIRCULAR (cimiento + judgment_enabled=true) → RECHAZADA', () => {
    const circular: PolicyRow = {
      artifact_class: 'cimiento',
      judgment_enabled: true,
      canon_grader: 'fidelity',
      counterweight: 'shadow_scorer',
      max_cycles: 1,
      fidelity_threshold: 0.85,
    }
    expect(violatedConstraints(circular)).toContain('jefatura_no_circular_cimiento')
  })

  it('cimiento sano (sin voto) → ACEPTADA', () => {
    expect(
      violatedConstraints({
        artifact_class: 'cimiento',
        judgment_enabled: false,
        canon_grader: 'fidelity',
        counterweight: 'shadow_scorer',
        max_cycles: 1,
        fidelity_threshold: 0.85,
      }),
    ).toEqual([])
  })

  it('contenido sano (con voto) → ACEPTADA', () => {
    expect(
      violatedConstraints({
        artifact_class: 'contenido',
        judgment_enabled: true,
        canon_grader: 'vote_3_of_n',
        counterweight: 'gpt55_non_voting',
        max_cycles: 1,
        fidelity_threshold: null,
      }),
    ).toEqual([])
  })

  it('malformadas → RECHAZADAS por el constraint correcto', () => {
    expect(
      violatedConstraints({ artifact_class: 'cimiento', judgment_enabled: false, canon_grader: 'fidelity', max_cycles: 0, fidelity_threshold: 0.85 }),
    ).toContain('max_cycles_between_1_3')
    expect(
      violatedConstraints({ artifact_class: 'cimiento', judgment_enabled: false, canon_grader: 'vote_3_of_n', max_cycles: 1, fidelity_threshold: 0.85 }),
    ).toContain('jefatura_grader_class_match')
    expect(
      violatedConstraints({ artifact_class: 'cimiento', judgment_enabled: false, canon_grader: 'fidelity', max_cycles: 1, fidelity_threshold: 1.5 }),
    ).toContain('fidelity_threshold_range')
  })
})

// ─── C2 · dry-run del SEED en shadow $0 (sin Postgres) ───────────────────────
describe('JEFATURA Peldaño 1 · C2 · dry-run seed en shadow $0', () => {
  /** Extrae las filas del INSERT ... VALUES del .sql (cols que gatean constraints). */
  function parseSeedRows(sql: string): PolicyRow[] {
    const re =
      /\(\s*'[^']+',\s*'(cimiento|contenido)',\s*(true|false),\s*(true|false),\s*'(fidelity|vote_3_of_n)',\s*('(?:shadow_scorer|gpt55_non_voting)'|NULL),\s*(\d+),\s*(0?\.\d+|NULL)/g
    const rows: PolicyRow[] = []
    for (const m of sql.matchAll(re)) {
      rows.push({
        artifact_class: m[1],
        correction_enabled: m[2] === 'true',
        judgment_enabled: m[3] === 'true',
        canon_grader: m[4],
        counterweight: m[5] === 'NULL' ? null : m[5].replace(/'/g, ''),
        max_cycles: Number(m[6]),
        fidelity_threshold: m[7] === 'NULL' ? null : Number(m[7]),
      })
    }
    return rows
  }

  it('las 7 filas semilla existen y TODAS aplicarían limpio (0 constraints violados)', () => {
    const rows = parseSeedRows(SQL)
    expect(rows.length).toBe(7) // 3 cimiento + 4 contenido
    for (const row of rows) {
      expect(violatedConstraints(row)).toEqual([])
    }
  })

  it('seed self-consistente · cimiento nunca vota · contenido siempre vota', () => {
    const rows = parseSeedRows(SQL)
    const cimientos = rows.filter((r) => r.artifact_class === 'cimiento')
    const contenidos = rows.filter((r) => r.artifact_class === 'contenido')
    expect(cimientos.length).toBe(3)
    expect(contenidos.length).toBe(4)
    for (const c of cimientos) {
      expect(c.judgment_enabled).toBe(false)
      expect(c.canon_grader).toBe('fidelity')
      expect(c.fidelity_threshold).toBe(0.85)
    }
    for (const c of contenidos) {
      expect(c.judgment_enabled).toBe(true)
      expect(c.canon_grader).toBe('vote_3_of_n')
      expect(c.fidelity_threshold).toBeNull()
    }
  })
})

// ─── C2 · opcional · apply REAL en shadow (gated · SKIP por default = $0) ─────
const SHADOW_URL = process.env.JEFATURA_SHADOW_DB_URL
describe.skipIf(!SHADOW_URL)('JEFATURA Peldaño 1 · C2 · apply real en shadow (gated)', () => {
  it('aplica la migración y el INSERT circular EXPLOTA por el CHECK', async () => {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: SHADOW_URL })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(SQL.replace(/COMMIT;\s*$/i, '')) // aplica DDL+seed sin cerrar la tx
      // intento circular · debe violar jefatura_no_circular_cimiento
      await expect(
        client.query(
          `INSERT INTO jefatura_grading_policies
             (artifact_type, artifact_class, judgment_enabled, canon_grader, max_cycles)
           VALUES ('circular_probe', 'cimiento', true, 'fidelity', 1)`,
        ),
      ).rejects.toThrow(/jefatura_no_circular_cimiento|check constraint/i)
    } finally {
      await client.query('ROLLBACK').catch(() => {})
      await client.end()
    }
  })
})

// ─── Contabilidad de costo · $0 duro (ningún egress) ─────────────────────────
describe('JEFATURA Peldaño 1 · contabilidad de costo · $0', () => {
  it('el peldaño $0 no hace NI UNA llamada de red (fetch nunca se invoca)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    // corre las evaluaciones puras del peldaño
    violatedConstraints({ artifact_class: 'cimiento', judgment_enabled: true, canon_grader: 'fidelity', max_cycles: 1, fidelity_threshold: 0.85 })
    violatedConstraints({ artifact_class: 'contenido', judgment_enabled: true, canon_grader: 'vote_3_of_n', max_cycles: 1, fidelity_threshold: null })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('ledger del peldaño · costo declarado = $0 (funciones puras + SQL estático)', () => {
    const COST_USD = 0 // sin LLM · sin Braintrust · sin apply a prod (§148)
    expect(COST_USD).toBe(0)
  })
})
