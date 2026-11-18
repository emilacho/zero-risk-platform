/**
 * 18-nov · la limpieza de Náufrago antes de la prueba final (`202611180500`) · GO de Lenovo en modo jefe, «dale» de Emilio.
 * Fija lo que no puede cambiar sin que alguien lo vea: una sola transacción, cada borrado con su candado de conteo, el REEL `2ed549cc`
 * y todo lo suyo fuera del borrado, la bitácora inmutable de Emilio sin tocar, y la campaña que queda vacía (camino A: reabrir).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202611180500_limpieza_naufrago_prueba_final.sql'), 'utf8')
const cuerpo = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const REEL = '2ed549cc-f452-4261-b334-3b35a6dd5a4d'
const PARTE_DEL_REEL = '009abba3-0da4-4d7e-9329-5f3bfe34ce36'

describe('limpieza de Náufrago · 202611180500', () => {
  it('es UNA transacción: un begin y un commit, y el trabajo va dentro de un solo bloque', () => {
    expect(cuerpo.match(/^begin;$/gm)).toHaveLength(1)
    expect(cuerpo.match(/^commit;$/gm)).toHaveLength(1)
    expect(cuerpo.indexOf('begin;')).toBeLessThan(cuerpo.indexOf('do $limpieza$'))
    expect(cuerpo.indexOf('end\n$limpieza$;')).toBeLessThan(cuerpo.indexOf('commit;'))
  })

  it('cada borrado y cada cambio de libreta lleva su candado de conteo inmediatamente después', () => {
    const lineas = cuerpo.split('\n')
    const escrituras = lineas.map((l, i) => ({ l, i })).filter(({ l }) => /^\s*(delete from|update public\.)/.test(l))
    expect(escrituras.length).toBeGreaterThanOrEqual(28)
    for (const { i } of escrituras) {
      const siguiente = lineas.slice(i + 1, i + 12).find((x) => /get diagnostics n = row_count/.test(x))
      expect(siguiente, `sin candado después de la línea ${i + 1}: ${lineas[i].trim()}`).toMatch(/if n <> \d+ then raise exception 'candado /)
    }
  })

  it('el reel queda fuera: los encargos a borrar excluyen su id y se comprueba que conserva lo suyo', () => {
    expect(cuerpo).toContain(`reel constant uuid := '${REEL}'`)
    expect(cuerpo).toMatch(/create temp table _enc on commit drop as select id from public\.oficina_encargos where client_id = ct and id <> reel;/)
    // ninguna hija de la oficina se borra por cliente: todas por los encargos de `_enc`
    for (const t of ['oficina_artefactos', 'oficina_fichas', 'oficina_gastos', 'oficina_mesa_aportes', 'oficina_turnos']) expect(cuerpo).toMatch(new RegExp(`delete from public\\.${t} where encargo_id in \\(select id from _enc\\);`))
    for (const [t, n] of [['oficina_turnos', 17], ['oficina_artefactos', 6], ['oficina_mesa_aportes', 19], ['oficina_gastos', 28]] as const) expect(cuerpo).toMatch(new RegExp(`from public\\.${t} where encargo_id = reel\\) <> ${n}`))
  })

  it('el parte del reel y sus imágenes no se borran', () => {
    expect(cuerpo).not.toMatch(new RegExp(`delete[^;]*${PARTE_DEL_REEL}`))
    expect(cuerpo).not.toMatch(/delete from public\.agent_image_generations/)
    expect(cuerpo).toMatch(/from public\.agent_image_generations where client_id = ct\) <> 11/)
  })

  it('la bitácora de Emilio no se toca (la base la protege: un DELETE haría fallar todo)', () => {
    expect(cuerpo).not.toMatch(/delete from public\.eventos_de_emilio/)
    expect(cuerpo).not.toMatch(/update public\.eventos_de_emilio/)
  })

  it('lo del manual y el plan se queda: la bandeja, la jefatura y la espera se borran solo por campaña o por pieza', () => {
    expect(cuerpo).toMatch(/delete from public\.hitl_queue where client_id = c and type in \('concepto_review', 'content_piece_review'\);/)
    expect(cuerpo).toMatch(/delete from public\.jefatura_revisiones where client_id = ct and artifact_type = 'pieza';/)
    expect(cuerpo).not.toMatch(/delete from public\.esperas_del_dueno/)
    expect(cuerpo).not.toMatch(/delete from public\.(client_brand_books|plan_aprobaciones|plan_cambios|finanzas_\w+|clients|cadena_campanas)\b/)
    expect(cuerpo).not.toMatch(/output_type = 'campaign_plan_90d'[^;]*;\s*\n\s*get diagnostics/)
  })

  it('la sala se borra por stream entero, y se quedan el alta, el plan y los streams del reel (009abba3)', () => {
    const borrado = cuerpo.slice(cuerpo.indexOf('delete from public.sala_event_log'), cuerpo.indexOf("candado sala_event_log"))
    expect(borrado).toMatch(/where stream_id in \(select stream_id from public\.sala_event_log where client_id = c group by stream_id/)
    expect(borrado).toMatch(/bool_or\(journey_type = 'BRIEF'\)/)
    expect(borrado).toContain("(bool_or(journey_type = 'PIEZAS') and not bool_or(coalesce(logical_period, '') || coalesce(idempotency_key, '') like '%009abba3%'))")
    expect(borrado).not.toMatch(/journey_type = '(PRODUCE|ONBOARD)'/)
    expect(cuerpo).toMatch(/from public\.sala_event_log where client_id = c\) <> 35/)
    expect(cuerpo).toMatch(/from public\.sala_event_log where client_id = c and journey_type = 'PIEZAS'\) <> 6/)
  })

  it('los SET NULL hacia las salidas que se borran se cuentan ANTES del borrado', () => {
    const antes = cuerpo.indexOf("then raise exception 'antes: hay filas que apuntan a las salidas que se borran")
    expect(antes).toBeGreaterThan(-1)
    expect(antes).toBeLessThan(cuerpo.indexOf('delete from public.client_historical_outputs'))
    for (const t of ['hitl_queue', 'agent_outcomes', 'campaign_results']) expect(cuerpo).toMatch(new RegExp(`from public\\.${t} h join public\\.client_historical_outputs o on o\\.id = h\\.output_id`))
  })

  it('la campaña queda vacía para reabrirla: se borran la estrategia, el calendario, el brief y la gran idea, y se comprueba', () => {
    for (const t of ['cadena_estrategias', 'cadena_calendario_filas', 'cadena_brief_creativo', 'cadena_conceptos']) expect(cuerpo).toMatch(new RegExp(`delete from public\\.${t} where campana_id = camp;`))
    expect(cuerpo).toMatch(/E-YA-ARMADA/)
  })
})
