/**
 * 10-nov · «Plan de 90 días» → «Plan de Marketing» en lo que lee el dueño (Lenovo por Emilio · `2026-11-10-RESPUESTA-LENOVO-a-CC1-CC3-CC4-CC5-CC6-CC7-decisiones-barrido-0030.md`).
 * El título lo dice desde la constante única; la versión NO va en el título: viaja aparte, para mostrarse a la derecha de la fecha. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { problemasDeLaFicha, type FichaDeDecision } from '../src/lib/direccion/decisiones-ficha'

const AHORA = new Date('2026-11-10T02:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const base = () => new DbFalsa().semilla('clients', [{ id: C1, name: 'Uno', industry: 'restaurante', status: 'active' }])
const ctx = (db: DbFalsa): Contexto => ({ db, ahora: () => AHORA, env: {} })
const compuerta = (version: unknown) => ({ id: 'a', client_id: C1, plan_id: 'plan-1', version, estado: 'pendiente', creado_en: hace(3) })

describe('el plan se llama «Plan de Marketing» y su versión va aparte', () => {
  it('🔴 el título dice «Plan de Marketing: espera tu decisión», sin la versión; la versión viaja en su campo y en la ficha', async () => {
    const d = (await leerDecisiones(ctx(base().semilla('plan_aprobaciones', [compuerta(3)])))).decisiones.find((x) => x.id === 'plan-1')!
    expect(d.titulo).toBe('Plan de Marketing: espera tu decisión')
    expect(d.titulo_interno).toBe('Plan de Marketing, versión 3: espera tu decisión')
    expect(d.version_del_documento).toBe(3)
    expect(d.ficha?.espera.version_del_documento).toBe(3)
    expect(d.ficha?.que_se_decide).not.toMatch(/90 d|versión/i)
  })
  it('🔴 sin versión legible no se inventa: ni campo ni número en la ficha', async () => {
    for (const v of [null, 'dos', 0, 1.5]) {
      const d = (await leerDecisiones(ctx(base().semilla('plan_aprobaciones', [compuerta(v)])))).decisiones.find((x) => x.id === 'plan-1')!
      expect(d, String(v)).not.toHaveProperty('version_del_documento')
      expect(d.ficha?.espera, String(v)).not.toHaveProperty('version_del_documento')
      expect(d.titulo).toBe('Plan de Marketing: espera tu decisión')
    }
  })
  it('🔴 un título de otra oficina que dice «plan de 90 días» también sale «Plan de Marketing»', async () => {
    const h = { id: 'h1', client_id: C1, type: 'palabra_del_dueno', status: 'pending', title: 'Plan de 90 días: revisa estos avisos antes de aprobar', created_at: hace(2), metadata: {} }
    const d = (await leerDecisiones(ctx(base().semilla('hitl_queue', [h])))).decisiones.find((x) => x.id === 'h1')
    expect(d?.titulo).toBe('Plan de Marketing: revisa estos avisos antes de aprobar')
  })
  it('🔴 la ficha rechaza una versión que no es un entero positivo', () => {
    const f = (v: unknown) => ({ espera: { desde: hace(1), version_del_documento: v } }) as unknown as FichaDeDecision
    for (const v of [0, -1, 1.5, '2']) expect(problemasDeLaFicha(f(v)), String(v)).toContain('versión del documento que no es un número entero positivo')
    expect(problemasDeLaFicha(f(2))).not.toContain('versión del documento que no es un número entero positivo')
  })
})
