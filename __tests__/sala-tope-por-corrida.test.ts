/**
 * Tests · tope de costo POR CLIENTE del despacho de la sala (antes atado al cliente piloto).
 *
 * Cubre · bandera apagada por omisión · techo general y variable de entorno · techo de la ficha (`config.spend_cap_usd`) ·
 * veredictos (pasa · bloquea) · foto de configuración · que ya no exista nada atado a un cliente.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  capDeLaFicha,
  evaluateRunCap,
  getRunCapSnapshot,
  isRunCapEnforced,
  resolveRunCapUsd,
  DAILY_ALERT_USD,
  RUN_CAP_DEFAULT_USD,
} from '@/lib/sala-journey-dispatch'

const entorno = { cap: process.env.SALA_RUN_CAP_USD, enforce: process.env.SALA_RUN_CAP_ENFORCE }
afterEach(() => {
  for (const [k, v] of [['SALA_RUN_CAP_USD', entorno.cap], ['SALA_RUN_CAP_ENFORCE', entorno.enforce]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('techo general · SALA_RUN_CAP_USD', () => {
  it('sin variable: el general (5)', () => {
    delete process.env.SALA_RUN_CAP_USD
    expect(resolveRunCapUsd()).toBe(RUN_CAP_DEFAULT_USD)
    expect(RUN_CAP_DEFAULT_USD).toBe(5)
  })
  it('con variable válida manda; basura, cero o negativo vuelven al general', () => {
    process.env.SALA_RUN_CAP_USD = '30'
    expect(resolveRunCapUsd()).toBe(30)
    for (const malo of ['not-a-number', '0', '-3', '']) { process.env.SALA_RUN_CAP_USD = malo; expect(resolveRunCapUsd()).toBe(RUN_CAP_DEFAULT_USD) }
  })
  it('la alarma diaria informativa es 10', () => { expect(DAILY_ALERT_USD).toBe(10) })
})

describe('techo de la ficha · clients.config.spend_cap_usd', () => {
  it('número > 0 (también como texto) vale; lo demás es null', () => {
    expect(capDeLaFicha({ spend_cap_usd: 6 })).toBe(6)
    expect(capDeLaFicha({ spend_cap_usd: '6.5' })).toBe(6.5)
    for (const malo of [{ spend_cap_usd: 0 }, { spend_cap_usd: -1 }, { spend_cap_usd: 'x' }, {}, null, undefined, [], 'texto']) expect(capDeLaFicha(malo)).toBeNull()
  })
})

describe('bandera SALA_RUN_CAP_ENFORCE · apagada por omisión', () => {
  it('solo el texto exacto «true» la enciende', () => {
    delete process.env.SALA_RUN_CAP_ENFORCE
    expect(isRunCapEnforced()).toBe(false)
    process.env.SALA_RUN_CAP_ENFORCE = 'true'
    expect(isRunCapEnforced()).toBe(true)
    for (const v of ['1', 'TRUE', 'yes', 'false']) { process.env.SALA_RUN_CAP_ENFORCE = v; expect(isRunCapEnforced()).toBe(false) }
  })
  it('el parámetro explícito pisa el entorno', () => {
    process.env.SALA_RUN_CAP_ENFORCE = 'true'
    expect(isRunCapEnforced({ enforce: false })).toBe(false)
    delete process.env.SALA_RUN_CAP_ENFORCE
    expect(isRunCapEnforced({ enforce: true })).toBe(true)
  })
})

describe('evaluateRunCap · veredictos', () => {
  it('bandera apagada: pasa aunque el gasto sea enorme', () => {
    expect(evaluateRunCap({ spent_usd: 9999, enforce: false })).toEqual({ verdict: 'pass', reason: 'flag_off' })
  })
  it('encendida y bajo el techo general: pasa', () => {
    delete process.env.SALA_RUN_CAP_USD
    expect(evaluateRunCap({ spent_usd: 4.99, enforce: true })).toEqual({ verdict: 'pass', reason: 'under_cap' })
  })
  it('encendida y en el techo (>=): bloquea con el techo y el gasto', () => {
    delete process.env.SALA_RUN_CAP_USD
    expect(evaluateRunCap({ spent_usd: 5, enforce: true })).toEqual({ verdict: 'block', reason: 'over_cap', cap_usd: 5, spent_usd: 5 })
  })
  it('el techo de la ficha pisa al general, hacia arriba y hacia abajo', () => {
    process.env.SALA_RUN_CAP_USD = '5'
    expect(evaluateRunCap({ spent_usd: 5.5, enforce: true, cap_usd: 20 })).toMatchObject({ verdict: 'pass' })
    expect(evaluateRunCap({ spent_usd: 5.5, enforce: true, cap_usd: 6 })).toMatchObject({ verdict: 'pass' })
    expect(evaluateRunCap({ spent_usd: 6, enforce: true, cap_usd: 6 })).toMatchObject({ verdict: 'block', cap_usd: 6 })
  })
  it('sin nombre de cliente: no hay conjunto de tenants (cualquiera cuenta)', () => {
    const r = evaluateRunCap({ spent_usd: 100, enforce: true })
    expect(r.verdict).toBe('block')
  })
})

describe('foto de configuración', () => {
  it('dice de dónde sale cada dato y no nombra a ningún cliente', () => {
    const f = getRunCapSnapshot()
    expect(f).toMatchObject({ cap_env_var: 'SALA_RUN_CAP_USD', enforce_env_var: 'SALA_RUN_CAP_ENFORCE', cap_por_cliente: 'clients.config.spend_cap_usd', cap_usd_default: 5, daily_alert_usd: 10 })
    expect(JSON.stringify(f)).not.toMatch(/naufrago|náufrago/i)
  })
})

describe('rastro cero · nada del código ejecutable del tope nombra a un cliente', () => {
  it('el módulo viejo ya no existe y los archivos del tope no traen nombre de cliente ni de variable atada a uno', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/sala-journey-dispatch/naufrago-cost-cap.ts'))).toBe(false)
    for (const f of ['src/lib/sala-journey-dispatch/tope-por-corrida.ts', 'src/lib/sala-router-consumer/dispatch.ts', 'src/lib/sala-router-consumer/orchestrator.ts', 'src/lib/sala-router-consumer/cap-spend-query.ts', 'services/agent-runner/src/lib/spend-gate.ts']) {
      const t = readFileSync(join(process.cwd(), f), 'utf8')
      expect(t, f).not.toMatch(/naufrago|náufrago/i)
    }
  })
})
