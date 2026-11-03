/** 03-nov · Náufrago desde cero: se lee la migración real. Se quedan el cerebro con lo que recolectó, la ficha limpia por campos y los importes. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611031000_naufrago_desde_cero.sql'), 'utf8').replace(/\r/g, '')
const CUERPO = SQL.split('\n').filter((l) => !l.startsWith('--')).join('\n')
const BORRADAS = [...CUERPO.matchAll(/^DELETE FROM public\.(\w+) x/gm)].map((m) => m[1])
const antes = (hija: string, madre: string) => expect(BORRADAS.indexOf(hija), `${hija} antes de ${madre}`).toBeLessThan(BORRADAS.indexOf(madre))

describe('🔴 Náufrago desde cero', () => {
  it('🔴 lo recolectado por el cerebro no se toca', () => {
    for (const t of ['cerebro_comentarios_competencia', 'cerebro_consultas', 'cerebro_credenciales', 'cerebro_ingresos', 'cerebro_tendencias', 'cerebro_unidades_vistas', 'apify_raw', 'client_social_images', 'client_videos', 'client_web_pages', 'client_sedes', 'client_sede_datos']) expect(CUERPO).not.toContain(t)
    expect(BORRADAS.filter((t) => t.startsWith('cerebro_') || t === 'client_brain_chunks')).toEqual([])
    expect(CUERPO).not.toMatch(/(DELETE FROM|UPDATE) public\.(cerebro_fichas|client_brain_chunks)/)
  })
  it('🔴 los importes se conservan: el libro solo pierde textos y costos no se toca', () => {
    expect(BORRADAS).not.toContain('agent_invocations')
    expect(CUERPO).not.toMatch(/public\.(costs|brain_embed_costs)\b/)
    const libro = /UPDATE public\.agent_invocations x\nSET ([^\n]*)\n/.exec(CUERPO)![1]
    for (const c of ['cost_usd', 'started_at', 'ended_at', 'tokens_input', 'tokens_output', 'model', 'client_id', 'created_at']) expect(libro).not.toContain(c)
    for (const c of ['system_prompt', 'input_summary', 'output_summary', 'metadata', 'command', 'error_message']) expect(libro).toContain(`${c} = NULL`)
    // la columna no admite vacío: sin el id original nadie puede reanudar una conversación vieja
    expect(libro).toContain("session_id = 'vaciada'")
    expect(CUERPO).toContain('el libro cambió de importe')
  })
  it('🔴 la ficha no se borra: cae en cascada sobre el cerebro. Se limpia por campos y conserva cuentas y tope', () => {
    expect(BORRADAS).not.toContain('clients')
    const ficha = /UPDATE public\.clients\nSET ([^\n]*)\n/.exec(CUERPO)![1]
    expect(ficha).toContain("config = config - 'business_model' - 'moneda'")
    // el alta solo escribe la industria si el trato la trae: si queda la vieja, nadie la descubre de nuevo
    for (const c of ['industry', 'market', 'brand_colors', 'brand_fonts']) expect(ficha).toContain(`${c} = NULL`)
    expect(ficha).not.toMatch(/\b(name|slug|website_url)\b/)
    expect(CUERPO).toContain("config ? 'apify' AND config ? 'spend_cap_usd'")
  })
  it('🔴 el rastro de Emilio no se toca: la tabla no lo permite y un intento abortaría todo', () => {
    expect(CUERPO).not.toContain('public.eventos_de_emilio')
    expect(CUERPO).not.toMatch(/\b(GRANT|REVOKE|DISABLE|ALTER)\b/i)
  })
  it('🔴 los marcadores de corridas se borran: si no, devuelven respuestas viejas', () => expect(BORRADAS).toContain('workflow_checkpoints'))
  it('🔴 las hijas van antes que sus madres', () => {
    for (const h of ['cadena_validaciones', 'cadena_esperas', 'cadena_corridas', 'cadena_estrategias', 'cadena_calendario_filas']) antes(h, 'cadena_campanas')
    for (const h of ['jefatura_fichas', 'jefatura_pasos']) antes(h, 'jefatura_revisiones')
    antes('jefatura_fichas', 'jefatura_pasos')
    for (const h of ['oficina_uso_de_fotos', 'oficina_gastos', 'oficina_fichas', 'oficina_artefactos', 'oficina_turnos']) antes(h, 'oficina_encargos')
    for (const h of ['oficina_gastos', 'oficina_fichas', 'oficina_artefactos']) antes(h, 'oficina_turnos')
    for (const h of ['finanzas_artefactos', 'finanzas_turnos']) antes(h, 'finanzas_encargos')
    for (const h of ['plan_aprobaciones', 'plan_cambios', 'hitl_queue']) antes(h, 'client_historical_outputs')
    antes('plan_cambios', 'client_brand_books')
    antes('finanzas_encargos', 'finanzas_tableros')
  })
  it('🔴 si un conteo no calza, aborta antes de escribir, todo en una transacción', () => {
    for (const t of BORRADAS) expect(CUERPO).toMatch(new RegExp(`IF n <> \\d+ THEN RAISE EXCEPTION '${t}: esperaba`))
    expect(CUERPO.indexOf('RAISE EXCEPTION')).toBeLessThan(CUERPO.indexOf('DELETE FROM'))
    expect(CUERPO.indexOf('BEGIN;')).toBeLessThan(CUERPO.indexOf('DO $$'))
    expect(CUERPO.trim().endsWith('COMMIT;')).toBe(true)
  })
  it('🔴 comprueba al final que no quedó nada y que el cerebro sigue igual', () => {
    for (const t of BORRADAS) expect(CUERPO).toContain(`quedaron filas en ${t}`)
    expect(CUERPO).toContain('cambiaron las fichas del cerebro')
    expect(CUERPO).toContain('cambiaron los trozos del cerebro')
  })
})
