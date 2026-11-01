/**
 * ENCARGO Lenovo 01-nov firmado por Emilio: cada empleado con su nombre propio. La migración se ensayó aparte; esto fija su contenido. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const MIG = lee('supabase/migrations/202611012200_agents_nombres_propios.sql')
const REV = lee('supabase/reversas/202611012200_agents_nombres_propios_REVERSA.sql')

const CAMBIOS: Array<[string, string, string]> = [
  ['account_manager', 'Account Strategist', 'Account Manager'],
  ['brand_strategist', 'Brand Guardian', 'Brand Strategist'],
  ['community_manager', 'Reddit Community Builder', 'Community Manager'],
  ['editor_en_jefe', 'Reality Checker', 'Editor en Jefe'],
  ['jefe_client_success', 'Account Strategist', 'Jefe de Client Success'],
  ['market_research_analyst', 'Trend Researcher', 'Market Research Agent'],
  ['onboarding_specialist', 'Support Responder', 'Onboarding Specialist'],
  ['reporting_agent', 'Executive Summary Generator', 'Reporting Agent'],
  ['web_designer', 'UI Designer', 'Web Designer'],
]
const updates = (sql: string) => sql.split('\n').filter((l) => l.startsWith('UPDATE '))

describe('los nombres propios de los empleados', () => {
  it.each(CAMBIOS)('%s: de «%s» a «%s», solo si el nombre vivo es el leído; la reversa lo devuelve', (slug, antes, despues) => {
    expect(MIG).toContain(`SET display_name = '${despues}' WHERE name = '${slug}' AND display_name = '${antes}';`)
    expect(MIG).toContain(`('${slug}', '${despues}')`)
    expect(REV).toContain(`SET display_name = '${antes}' WHERE name = '${slug}' AND display_name = '${despues}';`)
  })
  it('solo toca display_name, de esos 9 empleados', () => {
    for (const sql of [MIG, REV]) {
      expect(updates(sql)).toHaveLength(CAMBIOS.length)
      for (const l of updates(sql)) expect(l).toMatch(/^UPDATE public\.agents SET display_name = '[^']+' WHERE name = '[^']+' AND display_name = '[^']+';$/)
    }
    expect(MIG).not.toMatch(/SET\s+identity_content|DELETE|DROP|INSERT/i)
  })
  it('ningún nombre nuevo se repite, y la migración se revierte si quedan repetidos o falta alguno', () => {
    expect(new Set(CAMBIOS.map((c) => c[2])).size).toBe(CAMBIOS.length)
    expect(MIG).toMatch(/IF bien <> 9 THEN RAISE EXCEPTION/)
    expect(MIG).toMatch(/GROUP BY display_name HAVING count\(\*\) > 1/)
    expect(MIG).toMatch(/IF repetidos <> 0 THEN RAISE EXCEPTION/)
  })
})
