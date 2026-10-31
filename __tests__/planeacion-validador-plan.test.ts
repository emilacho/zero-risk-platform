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
import { canalesNombrados, cifrasCentinela, correccionDeForma, fasesConDias, LARGO_MINIMO, metaPorSemana, semanasFechadas, validarFormaDelPlan } from '@/lib/planeacion/validador-plan'

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

/** un plan con la meta escrita de una sola forma (sin el encabezado «Meta prudente…» que ayudaba de más) */
const conMeta = (meta: string) => PLAN_DE_PRACTICA.replace('**Meta prudente a 90 días:**\n- Pedidos rastreables por semana: 15 (desde 2)', meta)

describe('reserva 1 de CC3 · la meta con cifra por semana vale en cualquier orden (y en tabla)', () => {
  it.each([
    'meta: 15 pedidos por semana',
    'Meta: 15 pedidos por semana.',
    'Meta: 15 pedidos semanales',
    'Meta semanal: 15 pedidos',
    'Objetivo: 15 pedidos a la semana',
    'Pedidos rastreables por semana: 15 (meta prudente)',
    '- 15 pedidos cada semana\n\nEsa es la meta del trimestre.',
    'Meta del trimestre:\n- Pedidos: 15/semana',
    '| Semana | Meta |\n|---|---|\n| 1 | 2 pedidos |\n| 2 | 4 pedidos |',
    '| Week | Target |\n|---|---|\n| 1 | 2 orders |',
  ])('«%s» pasa F2', (meta) => {
    expect(metaPorSemana(conMeta(meta))).toBe(true)
    expect(validarFormaDelPlan(conMeta(meta)).hallazgos.map((h) => h.donde)).not.toContain('metas')
  })
  it.each([
    'Meta: muchos pedidos por semana (a definir)',
    'Meta: 15 pedidos al mes',
    'Pedidos por semana: los que se pueda',
    '| Semana | Meta |\n|---|---|\n| 1 | a definir |',
    'Se publica 3 veces por semana.', // cifra por semana sin ser META (frecuencia de publicación)
  ])('«%s» NO pasa F2', (meta) => {
    expect(metaPorSemana(conMeta(meta))).toBe(false)
    expect(validarFormaDelPlan(conMeta(meta)).hallazgos.map((h) => h.donde)).toContain('metas')
  })
})

describe('reserva 2 de CC3 · un plan en INGLÉS correcto pasa (el idioma lo fija el manual del cliente)', () => {
  const WEEKS = [
    '| Week | Period | Theme | Format |', '|---|---|---|---|',
    '| Week 1 | Nov 3-9 | Fix the base | Audit |', '| Week 2 | Nov 10-16 | Complete the base | Setup |', '| Week 3 | Nov 17-23 | Launch | Reel + ad |',
    '| Week 4 | Nov 24-30 | Review #1 | Post |', '| Week 5 | Dec 1-7 | Second venue | Carousel |', '| Week 6 | Dec 8-14 | Community | Repost |',
    '| Week 7 | Dec 15-21 | Review #2 | Report |', '| Week 8 | Dec 22-28 | Season | Content |', '| Week 9 | Dec 29 - Jan 4 | Season 2 | Paid |',
    '| Week 10 | Jan 5-11 | Review #3 | Content |', '| Week 11 | Jan 12-18 | Season close | Party |', '| Week 12 | Jan 19-25 | Close + proposal | Report |',
  ].join('\n')
  const filler = Array.from({ length: 8 }, (_, i) => `Paragraph ${i + 1} of the practice plan: the agency produces creative variants, tests and optimizes every week with the data the business shares.`).join('\n')
  const PLAN_EN = [
    '# 90-DAY CAMPAIGN PLAN · PRACTICE COFFEE SHOP', '',
    '## 1 · THE NUMBER', 'Goal: 15 orders per week (from 2).', 'Map reviews: 50.', '',
    '## 3 · CHANNELS', 'Instagram is the main channel; Facebook mirrors the feed. TikTok is out of scope.', '',
    '## 7 · BUDGET', '| Line | Prudent | Ambitious |', '|---|---|---|', '| Monthly spend | $300 | $800 |', '| Cost per order | $5.00 | $4.00 |', '',
    '## 12-WEEK CALENDAR', WEEKS, '', '## ASSUMPTIONS', filler,
  ].join('\n')
  it('calendario «| Week 3 | Oct 14-20 |» + «Goal: 15 orders per week» → ok', () => {
    expect(semanasFechadas(PLAN_EN)).toBe(12)
    expect(metaPorSemana(PLAN_EN)).toBe(true)
    expect(canalesNombrados(PLAN_EN)).toEqual(expect.arrayContaining(['instagram', 'facebook']))
    expect(validarFormaDelPlan(PLAN_EN)).toEqual({ ok: true, hallazgos: [], correccion: null })
  })
  it('las variantes inglesas también: «Week 3 · Oct 14-20» en línea · «Phase 2 · days 31-60» · «weekly target: 15» · «15 orders a week … goal»', () => {
    const enLinea = PLAN_EN.replace(WEEKS, Array.from({ length: 12 }, (_, i) => `Week ${i + 1} · Nov ${i + 1}-${i + 7}: theme of the week.`).join('\n'))
    expect(semanasFechadas(enLinea)).toBe(12)
    const fases = PLAN_EN.replace(WEEKS, 'Phase 1 · days 1-30: introduce. Phase 2 · days 31 to 60: convert. Phase 3 (days 61-90): retain.')
    expect(fasesConDias(fases)).toBe(3)
    expect(validarFormaDelPlan(fases).ok).toBe(true)
    expect(metaPorSemana(PLAN_EN.replace('Goal: 15 orders per week (from 2).', 'Weekly target: 15 orders.'))).toBe(true)
    expect(metaPorSemana(PLAN_EN.replace('Goal: 15 orders per week (from 2).', '15 orders a week is the goal.'))).toBe(true)
    expect(metaPorSemana(PLAN_EN.replace('Goal: 15 orders per week (from 2).', 'Goal: as many orders as possible per week.'))).toBe(false)
  })
  it('un plan en inglés roto se rechaza igual (sin período con mes · sin goal)', () => {
    const roto = PLAN_EN.replace(WEEKS, '| Week | Theme |\n|---|---|\n' + Array.from({ length: 12 }, (_, i) => `| Week ${i + 1} | theme |`).join('\n')).replace('Goal: 15 orders per week (from 2).', 'Goal: grow.')
    expect(validarFormaDelPlan(roto).hallazgos.map((h) => h.donde)).toEqual(['calendario', 'metas'])
  })
})

describe('reserva 3 de CC3 · los controles que no se probaban', () => {
  it('F1 · números sueltos NO son semanas fechadas: «| 3 | 10 pedidos | 5 de promo |» ×12 → 0 (solo cuenta un mes conocido, una fecha ISO o «días N–M»)', () => {
    const tabla = '| Sem. | Pedidos | Promo |\n|---|---|---|\n' + Array.from({ length: 12 }, (_, i) => `| ${i + 1} | ${10 + i} pedidos | 5 de promo |`).join('\n')
    expect(semanasFechadas(tabla)).toBe(0)
    expect(validarFormaDelPlan(PLAN_DE_PRACTICA.replace(SEMANAS, tabla)).hallazgos.map((h) => h.donde)).toEqual(['calendario'])
    // y las formas válidas de período sí cuentan, en los dos idiomas
    for (const p of ['14-20 oct', '28 oct - 3 nov', 'Oct 14-20', '3 de noviembre', 'del 1 al 7 de dic', '2026-10-14', 'días 1–7', 'days 1-7', 'Sept 1-7']) {
      expect(semanasFechadas(`| Sem. | Período |\n|---|---|\n| 1 | ${p} |`), p).toBe(1)
    }
    for (const p of ['5 de promo', '10 pedidos', '14-20', '3 de la tarde', 'marca 3']) {
      expect(semanasFechadas(`| Sem. | Período |\n|---|---|\n| 1 | ${p} |`), p).toBe(0)
    }
  })
  it('V14 · la fila de encabezados no cuenta como semana · V13 · un canal incrustado en otra palabra no cuenta · V08 · «,777»/«,775» no son centinela y «1.234,77» sí', () => {
    expect(semanasFechadas('| Sem. | Período |\n|---|---|\n| 1 | 3-9 nov |')).toBe(1)
    expect(semanasFechadas('| 1 | 3-9 nov |\n|---|---|\n| 2 | 10-16 nov |')).toBe(1) // la primera fila es la cabecera aunque traiga un período
    expect(canalesNombrados('una foto instagramable y un tiktoker; nada de facebooks')).toEqual([])
    expect(canalesNombrados('Instagram, luego Meta Ads y búsqueda en Google Maps')).toEqual(['instagram', 'google maps', 'búsqueda', 'busqueda', 'meta ads', 'ads'])
    expect(cifrasCentinela('costo $1,777 · tope $12,775 · ratio 0,7')).toEqual([])
    const dos = cifrasCentinela('## Costos\ncosto $1.234,77 y $3,77\n')
    expect(dos.map((c) => c.donde)).toEqual(['Costos', 'Costos'])
    expect(dos[0].cifra).toBe('$1.234,77')
    expect(dos[1].cifra).toContain('$3,77')
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
  it('R04 · un texto de más de 400.000 caracteres → 413 (no se valida)', async () => {
    const r = await pedir({ texto: 'x'.repeat(400_001), ...FIRMA })
    expect(r.status).toBe(413)
  })
  it('`semanas` del pedido manda sobre las 12 por omisión', async () => {
    const ocho = PLAN_DE_PRACTICA.replace(SEMANAS, SEMANAS.split('\n').slice(0, 10).join('\n'))
    expect(((await (await pedir({ texto: ocho, ...FIRMA })).json()) as { ok: boolean }).ok).toBe(false)
    expect(((await (await pedir({ texto: ocho, semanas: 8, ...FIRMA })).json()) as { ok: boolean }).ok).toBe(true)
  })
})
