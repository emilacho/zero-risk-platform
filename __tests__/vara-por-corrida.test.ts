/**
 * LA VARA POR CORRIDA · $5 · firmada por el Arquitecto 2026-08-25 02:45 UTC
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
 *   1. CONDUCTA · la vara corta a $5 · se prueba contra el freno
 *   2. CABLEADO · los DOS puntos de conexión le PASAN el identificador al freno
 *      ← ésta es la que distingue "en ámbito" de "hecho". Sin ella, implementar el
 *        freno daría verde con la vara desconectada: decoración.
 *
 * $0 · sin red · sin base · sin modelo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  it('🔴 EL ROJO DE ACEPTACIÓN · una corrida que el $5 bloquea y el $8 NO', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    // el caso medido · cliente con $2,90 acumulado + una corrida que se desboca a $5
    //   por cliente/24h → 7,90 < 8  ⇒ el freno viejo NO bloquea
    //   por corrida     → 5,00 ≥ 5  ⇒ la vara nueva SÍ
    filas = [
      { cost_usd: 2.9, workflow_execution_id: OTRA_CORRIDA },
      { cost_usd: 5.0, workflow_execution_id: CORRIDA },
    ]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      agentSlug: 'onboarding-specialist',
      runId: CORRIDA,
      notify: (() => {}) as never,
    })

    expect(r.blocked, 'la vara por corrida no bloqueó').toBe(true)
    expect(r.reason).toBe('run_over_cap')
    expect(r.run_spent_usd).toBe(5.0)
    expect(r.run_cap_usd).toBe(5.0)
    // Y la comprobación que separa freno de decoración: el $8 NO habría bloqueado
    expect(r.spent_usd).toBeCloseTo(7.9, 5)
    expect(r.spent_usd!).toBeLessThan(8)
  })

  it('una corrida legítima ($2,88 · la más cara jamás registrada) NO se corta', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    filas = [{ cost_usd: 2.8778, workflow_execution_id: CORRIDA }]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      runId: CORRIDA,
      notify: (() => {}) as never,
    })
    expect(r.blocked).toBe(false)
  })

  it('la acumulación la sigue atrapando el $8 · 3 corridas de $2,80 pasan una a una', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    filas = [
      { cost_usd: 2.8, workflow_execution_id: 'a' },
      { cost_usd: 2.8, workflow_execution_id: 'b' },
      { cost_usd: 2.8, workflow_execution_id: CORRIDA },
    ]

    const r = await checkRunSdkSpendCap(supabaseFalso(), CLIENTE, {
      runId: CORRIDA,
      notify: (() => {}) as never,
    })
    expect(r.blocked, 'el freno por cliente no atrapó la acumulación').toBe(true)
    expect(r.reason).toBe('over_cap')   // el $8, no el $5 · cada corrida iba bajo $5
  })

  it('sólo suma la corrida propia · el gasto de otra corrida NO cuenta contra la vara', async () => {
    const { checkRunSdkSpendCap } = await import('../src/lib/run-sdk-spend-gate')
    filas = [
      { cost_usd: 4.9, workflow_execution_id: OTRA_CORRIDA },
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

    expect(src, 'falta el default de la vara').toContain('DEFAULT_RUN_SCOPED_CAP_USD = 5.0')
    // la aritmética del margen · como la de K=3
    expect(src, 'falta el margen real medido').toMatch(/2[.,]88/)
    expect(src, 'falta el múltiplo del margen').toMatch(/1[.,]74/)
    // el disparador textual del Arquitecto
    expect(src, 'falta el disparador de recalibración').toContain('3,50')
    expect(src, 'falta el umbral de margen del disparador').toMatch(/1[.,]4/)
  })
})
