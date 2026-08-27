/**
 * EL CORTE DE DOS FUENTES + EL CANARIO DE NULOS
 * Encargo · `raw/tasks/2026-08-27-LENOVO-CC1-corte-dos-fuentes-y-canario.md`
 * Firma del Arquitecto · 2026-08-27 09:14:29 UTC.
 *
 * ── (a) EL CORTE ──────────────────────────────────────────────────────────────
 * El freno lee el identificador de corrida ARRIBA **o** anidado (`run/route.ts:149`).
 * El registro lo leía **SÓLO anidado** (`run/route.ts:668`) ⇒ quien lo mandaba arriba
 * pasaba la guarda, el freno comparaba bien, y **su fila quedaba con el id en NULO** ⇒
 * la vara por corrida sumaba 0 para siempre y no disparaba nunca.
 *
 * Decisión del Arquitecto, textual: **que funcionen LAS DOS.** No se rechaza la forma de
 * arriba — *"el propio mensaje se la enseñó a los llamadores, y romperlos por un defecto
 * nuestro es cobrarles nuestro error."*
 *
 * ⚠️ LA TRAMPA DEL ROJO, leída dos veces:
 *   "Si la prueba pasa ANTES del arreglo, está mirando la forma ANIDADA — que ya
 *    funciona — y no prueba nada."
 * Por eso **cada afirmación que tiene que ir de rojo a verde usa SÓLO la forma de arriba**,
 * con el contexto VACÍO. Las de la forma anidada están aparte y marcadas: ésas pasan
 * antes y después, y su trabajo es detectar que el arreglo no rompa lo que ya andaba.
 *
 * ── (b) EL CANARIO ────────────────────────────────────────────────────────────
 * No toca la vara. Cuenta filas con el identificador en NULO. Hoy: **0 de 96 en toda la
 * historia** ⇒ cualquier valor > 0 es señal, no ruido. NO desambigua el estado D:
 * hace visible la corrupción en el momento en que aparece.
 *
 * $0 · sin red · sin base · sin modelo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAttributionForInsert } from '../src/app/api/agents/run/route'
import { contarInvocacionesSinIdentificador } from '../src/lib/canario-invocaciones-sin-id'

const leer = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

const EJEC = '92833'
const FLUJO = 'LyVoKcrypS5uLyuu'

describe('(a) EL CORTE · la forma de ARRIBA · lo que HOY queda en NULO', () => {
  it('🔴 identificador de corrida ARRIBA · con contexto VACÍO · la fila lo lleva', () => {
    const r = resolveAttributionForInsert({ workflow_execution_id: EJEC }, {})
    expect(
      r.workflow_execution_id,
      'la fila queda con el id en NULO · la vara sumará 0 para siempre',
    ).toBe(EJEC)
  })

  it('🔴 identificador de flujo ARRIBA · con contexto VACÍO · la fila lo lleva', () => {
    // el mismo corte, en la línea de al lado · el encargo nombra uno, el defecto son dos
    const r = resolveAttributionForInsert({ workflow_id: FLUJO }, {})
    expect(r.workflow_id, 'el identificador de flujo también quedaba en NULO').toBe(FLUJO)
  })

  it('🔴 los dos ARRIBA a la vez · como los manda el mensaje de rechazo', () => {
    const r = resolveAttributionForInsert(
      { workflow_id: FLUJO, workflow_execution_id: EJEC },
      {},
    )
    expect(r.workflow_id).toBe(FLUJO)
    expect(r.workflow_execution_id).toBe(EJEC)
  })

  it('🔴 el registro NO puede leer de otra fuente que el freno · misma precedencia', () => {
    // si los dos vienen, gana el de arriba · IGUAL que `wfExecCandidate` (L149-155)
    const r = resolveAttributionForInsert(
      { workflow_execution_id: 'DE-ARRIBA' },
      { workflow_execution_id: 'ANIDADO' },
    )
    expect(r.workflow_execution_id, 'la precedencia difiere de la del freno').toBe('DE-ARRIBA')
  })
})

describe('(a) NO-REGRESIÓN · la forma anidada · pasa ANTES y DESPUÉS', () => {
  // ⚠️ ESTAS NO PRUEBAN EL ARREGLO. Están para detectar que el arreglo no rompa
  //    lo único que hoy funciona. Si fueran las únicas, la trampa se habría comido la prueba.
  it('anidado sigue funcionando', () => {
    const r = resolveAttributionForInsert({}, { workflow_id: FLUJO, workflow_execution_id: EJEC })
    expect(r.workflow_execution_id).toBe(EJEC)
    expect(r.workflow_id).toBe(FLUJO)
  })

  it('sin ninguno de los dos · null, no cadena vacía', () => {
    const r = resolveAttributionForInsert({}, {})
    expect(r.workflow_execution_id).toBeNull()
    expect(r.workflow_id).toBeNull()
  })

  it('los otros dos campos del registro no cambian de fuente', () => {
    const r = resolveAttributionForInsert({}, { pipeline_id: 'p1', journey_id: 'j1' })
    expect(r.task_id).toBe('p1')
    expect(r.journey_id).toBe('j1')
  })
})

describe('(a) CABLEADO · el registro USA el resolvedor, no el contexto suelto', () => {
  it('el insert no vuelve a leer `context.workflow_execution_id` por su cuenta', () => {
    const src = leer('src/app/api/agents/run/route.ts')
    const i = src.indexOf("from('agent_invocations')")
    expect(i, 'no encontré el insert').toBeGreaterThan(-1)
    const insert = src.slice(i, i + 900)

    expect(insert, 'el insert sigue leyendo el contexto suelto · el corte sigue vivo')
      .not.toContain('context.workflow_execution_id')
    expect(insert, 'el insert sigue leyendo el contexto suelto para el flujo')
      .not.toContain('context.workflow_id')
  })
})

describe('(b) EL CANARIO · cuenta los nulos · no toca la vara', () => {
  const base = (nulos: number | null, error: unknown) =>
    ({
      from: () => ({
        select: () => {
          const q: Record<string, unknown> = {}
          q.is = () => Promise.resolve({ count: nulos, error })
          return q
        },
      }),
    }) as never

  it('hoy hay 0 · no avisa', async () => {
    const r = await contarInvocacionesSinIdentificador(base(0, null))
    expect(r.nulos).toBe(0)
    expect(r.alerta).toBe(false)
  })

  it('🔴 si sube de 0 · avisa · cualquier valor > 0 es señal, no ruido', async () => {
    const r = await contarInvocacionesSinIdentificador(base(3, null))
    expect(r.nulos).toBe(3)
    expect(r.alerta).toBe(true)
    expect(r.detalle).toMatch(/3/)
  })

  it('si NO puede contar · NO reporta 0 · lo declara', async () => {
    // la lección de toda la semana · "no pude medir" nunca se disfraza de "dio cero"
    const r = await contarInvocacionesSinIdentificador(base(null, { message: 'boom' }))
    expect(r.nulos, 'fabricó un 0 para una cuenta que no pudo hacer').toBeNull()
    expect(r.medido).toBe(false)
    expect(r.alerta).toBe(false) // no se alarma por no poder mirar · pero lo dice
  })

  it('el cron horario lo consulta · si no, el canario no canta', () => {
    const src = leer('src/app/api/cost-monitor/cron/route.ts')
    expect(src, 'el canario no está enganchado al cron').toContain(
      'contarInvocacionesSinIdentificador',
    )
  })
})
