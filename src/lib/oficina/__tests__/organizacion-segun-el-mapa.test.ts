/**
 * 02-nov · LOS DATOS DE LA ORGANIZACIÓN SEGÚN EL MAPA FIRMADO · se lee la MIGRACIÓN REAL. Lo que se protege: ordenar el organigrama no cambia quién se sienta en las mesas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const NOMBRE = '202611020100_organizacion_segun_el_mapa_firmado'
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', `${NOMBRE}.sql`), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', `${NOMBRE}_REVERSA.sql`), 'utf8')

const tarjetas = () => [...SQL.matchAll(/^ {2}\('([\w-]+)', '(\w+)', '((?:[^']|'')*)', '(\{\})', (true|false), '(\w+)'\)/gm)].map((m) => ({ agente: m[1], rol: m[2], especialidad: m[3], pertinente: m[4], activo: m[5], equipo: m[6] }))
const LAS_19_DE_HOY = ['portero', 'campaign-brief-agent', 'carousel-designer', 'design-image-prompt-engineer', 'design-visual-storyteller', 'inclusive-visuals-specialist', 'marketing_video_optimization_specialist', 'marketing_short_video_editing_coach', 'content-creator', 'tiktok-strategist', 'marketing_instagram_curator', 'creative-director-mesa', 'video-editor', 'whimsy-injector', 'market_research_analyst', 'competitive-intelligence-agent', 'feedback-synthesizer', 'x-twitter-intelligence-analyst', 'growth-hacker']

describe('🔴 las tarjetas nuevas', () => {
  it('son las del mapa, una por empleado, por equipo', () => {
    const t = tarjetas()
    expect(new Set(t.map((x) => x.agente)).size).toBe(t.length)
    const cuantos = (e: string) => t.filter((x) => x.equipo === e).length
    expect([cuantos('direccion'), cuantos('estrategia'), cuantos('web'), cuantos('medios'), cuantos('relaciones'), cuantos('creativo')]).toEqual([4, 2, 12, 11, 5, 0])
    expect(t.length).toBe(34)
  })
  it('🔴 ninguna se sienta en una mesa: apagadas, sin pertinencia y sin dirigir', () => {
    for (const x of tarjetas()) expect([x.agente, x.activo, x.pertinente, x.rol]).toEqual([x.agente, 'false', '{}', 'miembro'])
  })
  it('🔴 ninguna pisa una de las 19 de hoy y tampoco se inventa lo que sabe hacer', () => {
    const nuevas = tarjetas().map((x) => x.agente)
    for (const a of LAS_19_DE_HOY) expect(nuevas).not.toContain(a)
    expect(SQL).toMatch(/ON CONFLICT \(agente\) DO NOTHING/)
    expect(SQL).not.toMatch(/sabe_hacer\s*[,)=]/)
    expect(SQL).not.toMatch(/UPDATE public\.oficina_directorio/)
  })
  it('🔴 el revisor externo tiene tarjeta y no fila de empleado', () => {
    expect(tarjetas().find((x) => x.agente === 'revisor-externo-gpt')?.equipo).toBe('direccion')
    expect(SQL).not.toMatch(/INSERT INTO public\.agents/)
  })
  it('una tarjeta con el estado de estas no llega al pedido de un turno: el directorio de la mesa se lee con activo=true', () => {
    const adaptador = fs.readFileSync(path.join(__dirname, '..', 'mesa', 'adaptador.ts'), 'utf8')
    expect(adaptador).toMatch(/from\('oficina_directorio'\)\.select\('\*'\)\.eq\('activo', true\)/)
  })
})

describe('🔴 los departamentos', () => {
  it('Ventas queda una sola vez, con el nombre en español, sobre la fila que tiene la gente', () => {
    expect(SQL).toMatch(/DELETE FROM public\.departments WHERE id = '3dbba4e0-e325-4dd4-8115-f899c386c4e4' AND name = 'ventas'/)
    expect(SQL).toMatch(/SET display_name = 'Ventas'.*WHERE id = 'df6c193c-2584-40af-a869-7cea79c7059a'/)
    expect(SQL).not.toMatch(/DELETE FROM public\.departments WHERE id = 'df6c193c-2584-40af-a869-7cea79c7059a'/)
  })
  it('🔴 la pauta pasa a Marketing ANTES de borrar su departamento', () => {
    expect(SQL.indexOf(`SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428' WHERE department_id = 'fabeb80c-a5c7-48ff-9725-33c52ba0a322'`)).toBeGreaterThan(-1)
    expect(SQL.indexOf(`SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428' WHERE department_id = 'fabeb80c-a5c7-48ff-9725-33c52ba0a322'`)).toBeLessThan(SQL.indexOf(`DELETE FROM public.departments WHERE id = 'fabeb80c-a5c7-48ff-9725-33c52ba0a322'`))
  })
  it('🔴 editor_en_jefe y reporting_agent, según Lenovo; el carrusel no entra', () => {
    expect(SQL).toMatch(/SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428', reports_to = '62ca50de-d9da-4b98-8861-3ae30ebe5377', role = 'empleado' WHERE name = 'editor_en_jefe'/)
    expect(SQL).toMatch(/SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428' WHERE name = 'reporting_agent'/)
    expect(tarjetas().find((x) => x.agente === 'editor_en_jefe')?.equipo).toBe('direccion')
    expect(tarjetas().find((x) => x.agente === 'brand_strategist')?.equipo).toBe('estrategia')
    expect(SQL).not.toMatch(/marketing_carousel_growth_engine/)
  })
  it('Sales Enablement pasa a Ventas y deja de reportar a marketing', () => {
    expect(SQL).toMatch(/SET department_id = 'df6c193c-2584-40af-a869-7cea79c7059a', reports_to = NULL WHERE name = 'sales-enablement'/)
  })
  it('🔴 no toca identidades ni el cerebro', () => {
    expect(SQL).not.toMatch(/identity_content|client_brain|cerebro_|contexto_del_cliente/)
  })
})

describe('🔴 la reversa', () => {
  it('devuelve los dos departamentos, las asignaciones y borra solo tarjetas apagadas de la lista', () => {
    for (const x of ['fabeb80c-a5c7-48ff-9725-33c52ba0a322', '3dbba4e0-e325-4dd4-8115-f899c386c4e4', "display_name = 'Sales'", "reports_to = '62ca50de-d9da-4b98-8861-3ae30ebe5377'", "role = 'jefe_departamento' WHERE name = 'editor_en_jefe'", "'530570e8-8ca2-4e63-b9f6-236c0c4a1d35' WHERE name = 'reporting_agent'", 'DELETE FROM public.oficina_directorio WHERE activo = false']) expect(REVERSA).toContain(x)
    for (const x of tarjetas()) expect(REVERSA).toContain(`'${x.agente}'`)
    for (const a of LAS_19_DE_HOY) expect(REVERSA).not.toContain(`'${a}'`)
  })
})
