/**
 * LA VARA POR CORRIDA · $5 · firmada por el Arquitecto 2026-08-25 02:45 UTC → 3 × lo medido, 18-nov: $13,58 (y el freno por cliente, $8 → $24,05 → $60 · 21-nov · A1: 24,05 → 60, firma de Emilio)
 *
 * FORMA FIRMADA · dos varas · UN solo punto de corte · UNA sola consulta · colgando del
 * freno de $8. NO un módulo nuevo. La vara nueva HEREDA la política de fallo del $8
 * (fallo abierto acotado, K=3) · no inventa la suya.
 * Identificador · `workflow_execution_id` (100 % poblado) · NO `journey_id` (vacío al 100 %).
 *
 * ⚠️ EL ROJO, ENDURECIDO (textual del Arquitecto):
 *   "El ROJO tiene que fallar sobre el estado SIN CABLEAR. Si la prueba pasa antes de la
 *    línea de cableado, lo que probó es que la vara NO EXISTE. 'En ámbito' NO es 'hecho'."
 *
 * Por eso esto tiene DOS familias de pruebas, y las dos deben ir de rojo a verde:
 *   1. CONDUCTA · la vara corta a $13,58 (era $5) · se prueba contra el freno
 *   2. CABLEADO · los DOS puntos de conexión le PASAN el identificador al freno
 *      ← ésta es la que distingue "en ámbito" de "hecho". Sin ella, implementar el
 *        freno daría verde con la vara desconectada: decoración.
 *
 * $0 · sin red · sin base · sin modelo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_RUN_SCOPED_CAP_USD, DEFAULT_RUN_SPEND_CAP_USD } from '../src/lib/run-sdk-spend-gate'

const raiz = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')

// ── base simulada · devuelve las filas que le pongamos ────────────────────────
type Fila = { cost_usd: number; workflow_execution_id: string | null }
let filas: Fila[] = []

const supabaseFalso = () =>
  ({
    from: () => ({
      select: () => {
        const q: Record<string, unknown> = {}
        const term = () => Promise.resolve({ data: filas, error: null })
        q.eq = () => q
        q.in = () => q
        q.is = () => q
        q.gte = term
        q.maybeSingle = () => Promise.resolve({ data: null, error: null })
        return q
      },
    }),
  }) as never

const CORRIDA = '92833'
const OTRA_CORRIDA = '92818'
const CLIENTE = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

beforeEach(() => {
  filas = []
  process.env.RUN_SPEND_CAP_ENFORCE = 'true'
  delete process.env.RUN_SPEND_CAP_USD
  delete process.env.RUN_SCOPED_CAP_USD
})
afterEach(() => {
  delete process.env.RUN_SPEND_CAP_ENFORCE
})

describe('vara por corrida · CONDUCTA', () => {
  it('🔴 EL ROJO DE ACEPTACIÓN · una corrida que el $13,58 bloquea y el $60 NO', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    // el caso medido · cliente con $2,90 acumulado + una corrida que se desboca a la vara ($13,58)
    //   por cliente/24h → 16,48 < 60  ⇒ el freno por cliente NO bloquea
    //   por corrida     → 13,58 ≥ 13,58  ⇒ la vara SÍ
    filas = [
      { cost_usd: 2.9, workflow_execution_id: OTRA_CORRIDA },
      { cost_usd: 13.58, workflow_execution_id: CORRIDA },
    ]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      agentSlug: 'onboarding-specialist',
      runId: CORRIDA,
      notify: (() => {}) as never,
    })

    expect(r.blocked, 'la vara por corrida no bloqueó').toBe(true)
    expect(r.reason).toBe('run_over_cap')
    expect(r.run_spent_usd).toBe(13.58)
    expect(r.run_cap_usd).toBe(DEFAULT_RUN_SCOPED_CAP_USD)
    // Y la comprobación que separa freno de decoración: el $60 NO habría bloqueado
    expect(r.spent_usd).toBeCloseTo(16.48, 5)
    expect(r.spent_usd!).toBeLessThan(DEFAULT_RUN_SPEND_CAP_USD)
  })

  it('una corrida legítima ($4,52 · la más cara medida, 213037 del 01-nov; antes $2,88) NO se corta', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    filas = [{ cost_usd: 4.52, workflow_execution_id: CORRIDA }]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      runId: CORRIDA,
      notify: (() => {}) as never,
    })
    expect(r.blocked).toBe(false)
  })

  it('la acumulación la sigue atrapando el $60 · 5 corridas de $12,01 pasan una a una', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    // 5 × 12,01 = 60,05 ≥ 60 · cada una bajo la vara (13,58)
    filas = [
      { cost_usd: 12.01, workflow_execution_id: 'a' },
      { cost_usd: 12.01, workflow_execution_id: 'b' },
      { cost_usd: 12.01, workflow_execution_id: 'c' },
      { cost_usd: 12.01, workflow_execution_id: 'd' },
      { cost_usd: 12.01, workflow_execution_id: CORRIDA },
    ]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      runId: CORRIDA,
      notify: (() => {}) as never,
    })
    expect(r.blocked, 'el freno por cliente no atrapó la acumulación').toBe(true)
    expect(r.reason).toBe('over_cap')   // el $60, no el $13,58 · cada corrida iba bajo $13,58
  })

  it('sólo suma la corrida propia · el gasto de otra corrida NO cuenta contra la vara', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    // sumadas (14) pasarían la vara (13,58); solas, la propia (1) no
    filas = [
      { cost_usd: 13.0, workflow_execution_id: OTRA_CORRIDA },
      { cost_usd: 1.0, workflow_execution_id: CORRIDA },
    ]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      runId: CORRIDA,
      notify: (() => {}) as never,
    })
    expect(r.run_spent_usd, 'contó gasto de otra corrida').toBe(1.0)
    expect(r.blocked).toBe(false)
  })

  it('🔴 REGLA DEL CAMINO RUIDOSO · corrida NO identificable no cuenta como $0 · avisa', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    filas = [{ cost_usd: 1.0, workflow_execution_id: CORRIDA }]
    const avisos: Array<Record<string, unknown>> = []

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      runId: null, // hoy no ocurre · las dos puertas rechazan · esto es la red de respaldo
      notify: ((a: Record<string, unknown>) => { avisos.push(a) }) as never,
    })

    // NO se inventa un $0 que diga "bajo el tope"
    expect(r.run_spent_usd, 'fabricó un $0 para una corrida que no pudo identificar').toBeUndefined()
    expect(r.run_unidentified).toBe(true)
    // y hace ruido
    expect(avisos.some((a) => String(a.kind).includes('unidentified')), 'pasó en silencio').toBe(true)
  })
})

/**
 * ⚠️ ESTA FAMILIA ES LA QUE EXIGIÓ EL ARQUITECTO.
 * Sin ella, implementar el freno da verde con la vara DESCONECTADA — y lo que se habría
 * probado es que la vara no existe. Yo mismo lo medí: el identificador está EN ÁMBITO en
 * los dos puntos de conexión, pero HOY NADIE LO LEE ahí. Eso es lo que esto detecta.
 */
describe('vara por corrida · CABLEADO · las dos puertas le pasan el identificador', () => {
  const PUERTAS: ReadonlyArray<readonly [string, string, string]> = [
    ['src/app/api/agents/run-sdk/route.ts', 'wfAttr.workflow_execution_id', 'el punto firmado'],
    ['src/app/api/agents/run/route.ts', 'wfExecCandidate', 'el hermano'],
  ]

  it.each(PUERTAS)('%s le pasa el identificador al freno (%s · %s)', (archivo, expresion) => {
    const texto = leer(archivo)
    const i = texto.indexOf('checkRunSdkSpendCap(')
    expect(i, `${archivo} · no llama al freno`).toBeGreaterThan(-1)

    // la llamada completa · desde el nombre hasta el cierre del objeto de opciones
    const llamada = texto.slice(i, i + 400)
    expect(llamada, `${archivo} · el freno se llama SIN runId · la vara está desconectada`).toContain('runId')
    expect(llamada, `${archivo} · runId no viene del identificador de corrida real`).toContain(expresion)
  })

  it('ninguna de las dos usa journey_id · está vacío al 100 % y daría un freno que nunca dispara', () => {
    for (const [archivo] of PUERTAS) {
      const texto = leer(archivo)
      const i = texto.indexOf('checkRunSdkSpendCap(')
      expect(texto.slice(i, i + 400)).not.toContain('journey_id')
    }
  })
})

describe('vara por corrida · lo que va ESCRITO al lado del default', () => {
  it('el margen real, el disparador de recalibración y la regla del camino ruidoso', () => {
    const src = leer('src/lib/run-sdk-spend-gate.ts')

    expect(src, 'falta el default de la vara').toContain('DEFAULT_RUN_SCOPED_CAP_USD = 13.58')
    // 18-nov · la cuenta de hoy: 3 × la corrida más cara medida (4,52)
    expect(src, 'falta el máximo medido de hoy').toMatch(/4[.,]52/)
    expect(src, 'falta el «3 × lo medido»').toContain('3 × lo medido')
    // la aritmética de la firma del 25-ago (la vara de $5), que sigue escrita como historia
    // la aritmética del margen · como la de K=3
    expect(src, 'falta el margen real medido').toMatch(/2[.,]88/)
    expect(src, 'falta el múltiplo del margen').toMatch(/1[.,]74/)
    // el disparador textual del Arquitecto
    expect(src, 'falta el disparador de recalibración').toContain('3,50')
    expect(src, 'falta el umbral de margen del disparador').toMatch(/1[.,]4/)
  })
})
