/**
 * EL VALIDADOR DE FORMA DEL PLAN · 31-oct · T1 «lo afectado por la auditoría» (plan v3 firmado por CC#3) · CC#1 · certifica CC#3.
 *
 * Lo que se prueba: que el plan v2 REAL de Náufrago (corrida real 12-oct, `__tests__/fixtures/ronda78/plan-v2-811b9e94.md`) PASA;
 * que tres planes rotos (sin calendario fechado · sin meta por semana · sin canal y con cifra «,77») NO pasan, cada uno con su hallazgo
 * y su texto de corrección; que un plan vacío es hallazgo; y que la puerta `POST /api/planeacion/validar-plan` contesta el contrato
 * propuesto a CC#2 (llave · firma de la corrida · `{ ok, hallazgos, correccion }`) sin llamar a nada (US$ 0).
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canalesNombrados, cifrasCentinela, correccionDeForma, fasesConDias, LARGO_MINIMO, semanasFechadas, validarFormaDelPlan } from '@/lib/planeacion/validador-plan'

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'ok' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }),
}))
import { POST as validar } from '@/app/api/planeacion/validar-plan/route'

const PLAN_REAL = readFileSync(join(__dirname, 'fixtures', 'ronda78', 'plan-v2-811b9e94.md'), 'utf8')

/** un plan de práctica, agnóstico, que cumple la forma (de aquí salen los tres rotos) */
const relleno = (n: number) => Array.from({ length: n }, (_, i) => `Párrafo ${i + 1} del plan de práctica: la agencia produce variantes creativas, prueba y optimiza cada semana con los datos que el negocio comparte.`).join('\n')
const SEMANAS = [
  '| Sem. | Período | Tema | Formato |', '|---|---|---|---|',
  '| 1 | 3-9 nov | Arreglar la base | Auditoría |', '| 2 | 10-16 nov | Completar la base | Setup |', '| 3 | 17-23 nov | Lanzar | Reel + anuncio |',
  '| 4 | 24-30 nov | Revisión #1 | Post |', '| 5 | 1-7 dic | Segunda plaza | Carrusel |', '| 6 | 8-14 dic | Comunidad | Repost |',
  '| 7 | 15-21 dic | Revisión #2 | Informe |', '| 8 | 22-28 dic | Temporada | Contenido |', '| 9 | 29 dic - 4 ene | Temporada 2 | Pauta |',
  '| 10 | 5-11 ene | Revisión #3 | Contenido |', '| 11 | 12-18 ene | Cierre de temporada | Festejo |', '| 12 | 19-25 ene | Cierre + propuesta | Informe |',
].join('\n')
const PLAN_DE_PRACTICA = [
  '# PLAN DE CAMPAÑA 90 DÍAS · CAFETERÍA DE PRÁCTICA', '',
  '## 1 · EL NÚMERO', '**Meta prudente a 90 días:**', '- Pedidos rastreables por semana: 15 (desde 2)', '- Reseñas en el mapa: 50', '',
  '## 3 · LOS CANALES', 'Instagram es el canal principal; Facebook replica el feed. TikTok queda fuera del plan.', '',
  '## 7 · EL PRESUPUESTO', '| Renglón | Escenario prudente | Escenario ambicioso |', '|---|---|---|', '| Inversión mensual | $300 | $800 |', '| Costo por pedido | $5,00 | $4,00 |', '',
  '## CALENDARIO DE 12 SEMANAS', SEMANAS, '', '## QUÉ ASUMIMOS', relleno(8),
].join('\n')

describe('el plan real pasa y los planes rotos no', () => {
  it('el plan v2 real de Náufrago (12-oct) cumple la forma: 12 semanas fechadas, meta por semana, canales, sin «,77»', () => {
    expect(PLAN_REAL.length).toBeGreaterThan(LARGO_MINIMO)
    expect(semanasFechadas(PLAN_REAL)).toBe(12)
    expect(canalesNombrados(PLAN_REAL)).toEqual(expect.arrayContaining(['instagram', 'facebook', 'whatsapp']))
    expect(cifrasCentinela(PLAN_REAL)).toEqual([])
    const r = validarFormaDelPlan(PLAN_REAL)
    expect(r).toEqual({ ok: true, hallazgos: [], correccion: null })
  })
  it('el plan de práctica (agnóstico) también pasa', () => {
    expect(validarFormaDelPlan(PLAN_DE_PRACTICA)).toEqual({ ok: true, hallazgos: [], correccion: null })
  })
  it('roto 1 · sin calendario fechado ni fases con días → hallazgo en «calendario» y corrección que lo pide', () => {
    const roto = PLAN_DE_PRACTICA.replace(SEMANAS, '| Sem. | Tema |\n|---|---|\n' + Array.from({ length: 12 }, (_, i) => `| ${i + 1} | Tema de la semana |`).join('\n'))
    expect(semanasFechadas(roto)).toBe(0)
    const r = validarFormaDelPlan(roto)
    expect(r.ok).toBe(false)
    expect(r.hallazgos).toHaveLength(1)
    expect(r.hallazgos[0]).toMatchObject({ donde: 'calendario' })
    expect(r.hallazgos[0].que).toMatch(/0 de 12 semanas/)
    expect(r.correccion).toContain('# CORRECCIÓN DE FORMA (única)')
    expect(r.correccion).toContain('1. [calendario]')
    expect(r.correccion).toMatch(/plan COMPLETO/)
  })
  it('roto 1b · sin tabla pero con fases con días («fase 1 · días 1–30») sí pasa: las fases valen como calendario', () => {
    const conFases = PLAN_DE_PRACTICA.replace(SEMANAS, 'Fase 1 · días 1–30: presentar. Fase 2 · días 31–60: convertir. Fase 3 · días 61–90: retener.')
    expect(semanasFechadas(conFases)).toBe(0)
    expect(fasesConDias(conFases)).toBe(3)
    expect(validarFormaDelPlan(conFases).ok).toBe(true)
    // una sola fase no alcanza: no es un calendario
    const unaFase = PLAN_DE_PRACTICA.replace(SEMANAS, 'Fase única · días 1–90: todo a la vez.')
    expect(validarFormaDelPlan(unaFase).ok).toBe(false)
  })
  it('roto 2 · sin meta con cifra por semana → hallazgo en «metas»', () => {
    const roto = PLAN_DE_PRACTICA.replace('- Pedidos rastreables por semana: 15 (desde 2)', '- Pedidos rastreables: los que se pueda (a definir con el dueño)')
    const r = validarFormaDelPlan(roto)
    expect(r.ok).toBe(false)
    expect(r.hallazgos.map((x) => x.donde)).toEqual(['metas'])
    expect(r.hallazgos[0].que).toMatch(/POR SEMANA/)
  })
  it('roto 3 · sin ningún canal y con una cifra «57,77» → dos hallazgos (canales + centinela con su sección)', () => {
    const roto = PLAN_DE_PRACTICA
      .replace('Instagram es el canal principal; Facebook replica el feed. TikTok queda fuera del plan.', 'Se publica donde esté el público, con la frecuencia que el negocio pueda sostener.')
      .replace('| Costo por pedido | $5,00 | $4,00 |', '| Costo por pedido | $57,77 | $17,77 |')
    expect(canalesNombrados(roto)).toEqual([])
    const r = validarFormaDelPlan(roto)
    expect(r.ok).toBe(false)
    expect(r.hallazgos.map((x) => x.donde)).toEqual(['canales', '7 · EL PRESUPUESTO', '7 · EL PRESUPUESTO'])
    expect(r.hallazgos[1].que).toContain('57,77')
    expect(r.hallazgos[2].que).toContain('17,77')
    expect(r.correccion?.split('\n').filter((l) => /^\d+\. \[/.test(l))).toHaveLength(3)
  })
  it('un plan vacío o corto es un solo hallazgo («todo el plan») y no se siguen mirando las demás reglas', () => {
    for (const t of ['', '   ', 'Plan: publicar en Instagram 3 veces por semana. Meta: 15 pedidos por semana.', null, 42]) {
      const r = validarFormaDelPlan(t)
      expect(r.ok).toBe(false)
      expect(r.hallazgos).toHaveLength(1)
      expect(r.hallazgos[0].donde).toBe('todo el plan')
    }
  })
  it('las semanas se pueden fijar (un plan de 8 semanas) y la corrección vacía es null', () => {
    const ocho = PLAN_DE_PRACTICA.replace(SEMANAS, SEMANAS.split('\n').slice(0, 10).join('\n'))
    expect(validarFormaDelPlan(ocho).ok).toBe(false)
    expect(validarFormaDelPlan(ocho, { semanas: 8 }).ok).toBe(true)
    expect(correccionDeForma([])).toBeNull()
  })
  it('los retornos de carro de Windows no cambian el veredicto', () => {
    expect(validarFormaDelPlan(PLAN_DE_PRACTICA.replace(/\n/g, '\r\n')).ok).toBe(true)
  })
})

describe('la puerta POST /api/planeacion/validar-plan (contrato propuesto a CC#2)', () => {
  const pedir = (cuerpo: unknown, llave = 'ok') =>
    validar(new Request('http://x/api/planeacion/validar-plan', {
      method: 'POST', headers: { 'x-api-key': llave, 'content-type': 'application/json' },
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    }))
  const FIRMA = { workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '999001' }

  it('sin llave → 401; sin JSON → 400; sin firma → 400 (dice cuál falta); sin texto → 400', async () => {
    expect((await pedir({ texto: PLAN_DE_PRACTICA, ...FIRMA }, 'mala')).status).toBe(401)
    expect((await pedir('{no es json')).status).toBe(400)
    const sinFirma = await pedir({ texto: PLAN_DE_PRACTICA, workflow_id: 'X9F0zp6LQ2xGEYVS' })
    expect(sinFirma.status).toBe(400)
    expect(((await sinFirma.json()) as { error: string }).error).toMatch(/workflow_execution_id/)
    expect((await pedir({ ...FIRMA })).status).toBe(400)
  })
  it('con el plan real → 200 { ok: true, hallazgos: [], correccion: null } y devuelve la firma', async () => {
    const r = await pedir({ texto: PLAN_REAL, ...FIRMA })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, hallazgos: [], correccion: null, ...FIRMA })
  })
  it('con un plan roto → 200 { ok: false, hallazgos, correccion } (el reintento y el fallo los decide el flujo)', async () => {
    const r = await pedir({ texto: PLAN_DE_PRACTICA.replace('- Pedidos rastreables por semana: 15 (desde 2)', '- Pedidos: a definir'), ...FIRMA })
    expect(r.status).toBe(200)
    const j = (await r.json()) as { ok: boolean; hallazgos: Array<{ que: string; donde: string }>; correccion: string }
    expect(j.ok).toBe(false)
    expect(j.hallazgos).toEqual([{ que: expect.stringMatching(/POR SEMANA/), donde: 'metas' }])
    expect(j.correccion).toContain('1. [metas]')
  })
  it('`semanas` del pedido manda sobre las 12 por omisión', async () => {
    const ocho = PLAN_DE_PRACTICA.replace(SEMANAS, SEMANAS.split('\n').slice(0, 10).join('\n'))
    expect(((await (await pedir({ texto: ocho, ...FIRMA })).json()) as { ok: boolean }).ok).toBe(false)
    expect(((await (await pedir({ texto: ocho, semanas: 8, ...FIRMA })).json()) as { ok: boolean }).ok).toBe(true)
  })
})
