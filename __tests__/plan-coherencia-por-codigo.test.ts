/**
 * Puntos 4 y 5 del encargo «errores del plan», firma de Emilio (01-nov): fechas y presupuesto por código. Con otro cliente además del caso real. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { controlarFechas, controlarPresupuesto, pautaDeclarada, rangoDelPlan, semanasDelPlan, TOLERANCIA_DE_IMPORTES } from '../src/lib/planeacion/coherencia-del-plan'
import { abrirRevision, avisosDelPlan, elegirVersionDelPlan } from '../src/lib/jefatura/revision/orquestador'
import { puertosDePrueba, sobre, correr } from './_helpers/jefatura-revision'

const HOY = new Date('2026-11-10T15:00:00Z')
const tabla = (n: number, ini: string, fin: string) => `| ${n} | ${ini} - ${fin} | algo |`
const que = (h: Array<{ estado: string; que: string }>, re: RegExp) => h.filter((x) => re.test(x.que))

describe('🔴 fechas', () => {
  it('una semana antes de la fecha en que el plan puede arrancar se marca; la de hoy o después, no', () => {
    const f = controlarFechas(`Plan de 7 días · 16 de noviembre de 2026 – 22 de noviembre de 2026\n${tabla(1, '9', '15 nov')}\n${tabla(2, '10', '16 nov')}\n`, HOY)
    expect(que(f, /semana 1 empieza el 2026-11-09/)).toHaveLength(1)
    expect(que(f, /semana 2 empieza/)).toHaveLength(0)
  })
  it('el caso real: dice 90 días y su rango tiene 84', () => {
    const f = controlarFechas('PLAN DE 90 DÍAS · 16 de noviembre de 2026 – 7 de febrero de 2027', HOY)
    expect(que(f, /dice 90 días, y su rango .* tiene 84/)).toHaveLength(1)
  })
  it('una diferencia de un día no se marca (contar o no el último): la tolerancia es declarada', () => {
    expect(que(controlarFechas('Plan de 84 días · 16 de noviembre de 2026 – 7 de febrero de 2027', HOY), /dice 84/)).toHaveLength(0)
    expect(que(controlarFechas('Plan de 85 días · 16 de noviembre de 2026 – 7 de febrero de 2027', HOY), /dice 85/)).toHaveLength(0)
  })
  it('2 o 3 días de diferencia sí se marcan (F3 de CC3): la tolerancia es de 1 día', () => {
    expect(que(controlarFechas('Plan de 86 días · 16 de noviembre de 2026 – 7 de febrero de 2027', HOY), /dice 86/)).toHaveLength(1)
    expect(que(controlarFechas('Plan de 87 días · 16 de noviembre de 2026 – 7 de febrero de 2027', HOY), /dice 87/)).toHaveLength(1)
  })
  it('la ficha dice cuál es su fecha de referencia y que puede cambiar', () => {
    expect(que(controlarFechas('Plan · 2 de noviembre de 2026 – 24 de enero de 2027', HOY), /se abrió esta revisión; si se aprueba después/)).toHaveLength(1)
  })
  it('arrancar antes de hoy se marca', () => {
    expect(que(controlarFechas('Plan · 2 de noviembre de 2026 – 24 de enero de 2027', HOY), /dice arrancar el 2026-11-02/)).toHaveLength(1)
  })
  it('el rango frente a la última semana', () => {
    const f = controlarFechas(`Campaña · 16 de noviembre de 2026 – 30 de enero de 2027\n${tabla(10, '18', '24 ene')}`, HOY)
    expect(que(f, /rango termina el 2027-01-30, y la semana 10 termina el 2027-01-24/)).toHaveLength(1)
  })
  it('🔴 sin fechas legibles lo dice: nunca pasa en silencio', () => {
    expect(controlarFechas('Un plan sin una sola fecha', HOY)).toEqual([expect.objectContaining({ estado: 'no_pude_comprobar' })])
    expect(que(controlarFechas(tabla(1, '16', '22 nov'), HOY), /rango total/)[0].estado).toBe('no_pude_comprobar')
    expect(que(controlarFechas('Plan · 16 de noviembre de 2026 – 22 de noviembre de 2026', HOY), /semanas fechadas/)[0].estado).toBe('no_pude_comprobar')
  })
  it('un rango que cruza el año, y en inglés', () => {
    const s = semanasDelPlan('| 8 | 28 dic - 3 ene | x |\nWeek 9 · 4-10 Jan', HOY.getTime())
    expect(new Date(s[0].desde).toISOString().slice(0, 10)).toBe('2026-12-28')
    expect(new Date(s[0].hasta).toISOString().slice(0, 10)).toBe('2027-01-03')
    expect(new Date(s[1].hasta).toISOString().slice(0, 10)).toBe('2027-01-10')
    expect(rangoDelPlan('Nov 16 no') ).toBeNull()
  })
})

describe('🔴 presupuesto', () => {
  const T = (filas: string[], col = 'Pauta') => ['| Mes | ' + col + ' |', '|---|---|', ...filas].join('\n')
  it('lee lo declarado', () => {
    expect(pautaDeclarada('Presupuesto de pauta: 200 por semana')).toBe(200)
    expect(pautaDeclarada('Presupuesto de pauta: $150/semana')).toBe(150)
    expect(pautaDeclarada('sin ese dato')).toBeNull()
  })
  it('🔴 una cifra por encima de lo declarado se marca, también con la pauta nombrada justo antes; por debajo o igual, no', () => {
    expect(que(controlarPresupuesto('Pauta en Meta: $300/semana en las de pico', 200), /\$300 por semana/)).toHaveLength(1)
    expect(que(controlarPresupuesto('### Pauta\n\n$300/semana en pico', 200), /\$300 por semana/)).toHaveLength(1)
    expect(controlarPresupuesto('Pauta: $150/semana. Otra: pauta $200/semana', 200)).toEqual([])
    expect(controlarPresupuesto('Producción de video: $300/semana', 200).filter((x) => x.estado === 'no_cuadra')).toEqual([])
  })
  it('la tolerancia es del 1 %, declarada', () => {
    expect(TOLERANCIA_DE_IMPORTES).toBe(0.01)
    expect(controlarPresupuesto('Pauta: $202/semana', 200)).toEqual([])
    expect(controlarPresupuesto('Pauta: $203/semana', 200).filter((x) => x.estado === 'no_cuadra')).toHaveLength(1)
  })
  it('🔴 una cifra distinta en una sola tabla se detecta: la suma frente a su total', () => {
    const f = controlarPresupuesto(T(['| Ene | $100 |', '| Feb | $120 |', '| **Total** | $200 |']), 200)
    expect(que(f, /suman \$220, y su total dice \$200/)).toHaveLength(1)
    expect(que(controlarPresupuesto(T(['| Ene | $100 |', '| Feb | $100 |', '| Total | $200 |']), 200), /suman/)).toHaveLength(0)
  })
  it('🔴 la producción como renglón de la pauta se detecta', () => {
    expect(que(controlarPresupuesto(T(['| Producción de video | $300 |', '| Meta | $200 |']), 200), /producción no es pauta/)).toHaveLength(1)
  })
  it('🔴 lo que no pudo leer lo dice, con su estado', () => {
    expect(controlarPresupuesto('Sin cifras', 200)).toEqual([expect.objectContaining({ estado: 'no_pude_comprobar', que: expect.stringMatching(/no pude leer cifras de pauta/) })])
    expect(controlarPresupuesto('Pauta: $200/semana', null)).toEqual([expect.objectContaining({ estado: 'no_pude_comprobar', que: expect.stringMatching(/no encontré la pauta semanal declarada/) })])
  })
})

describe('🔴 son avisos: el plan llega completo y decide Emilio', () => {
  const PLAN = 'PLAN DE 90 DÍAS · 16 de noviembre de 2099 – 7 de febrero de 2100\nOpción ambiciosa · Pauta: $300/semana'
  const CTX = [{ titulo: 'Ficha', texto: 'Presupuesto de pauta: 200 por semana', funcion: 'x' }]
  const elegir = async (texto: string) => {
    const { P } = puertosDePrueba()
    const notas: Array<Record<string, unknown>> = []
    P.anotarPalabraDelDueno = async (x) => { notas.push(x as never) }
    const c = await correr(P, sobre('plan', { texto, payload: { contexto: CTX }, simulacion: { fichas: 'ninguna', gpt: 'vacio' } }))
    const id = String(c.aperturas[0].cuerpo.revision_id)
    const rev = await P.almacen.leerRevision(id)
    const leer = P.almacen.leerRevision.bind(P.almacen)
    P.almacen.leerRevision = async (x) => { const f = await leer(x); return f ? { ...f, dry_run: false, estado_del_motor: f.estado_del_motor } : f }
    return { P, id, rev, notas, e: await elegirVersionDelPlan(P, id, { evaluaciones: [{ etiqueta: 'A', marcas: 0, largo: texto.length }], idDeA: 'A-id', existentes: [] }) }
  }
  it('lo que no cuadra es aviso; lo no comprobado lo dice', () => {
    const a = avisosDelPlan('PLAN DE 90 DÍAS · 16 de noviembre de 2026 – 7 de febrero de 2027', 'Presupuesto de pauta: 200 por semana', [], HOY)
    expect(a.find((x) => /dice 90/.test(x))).toMatch(/^Aviso: /)
    expect(a.find((x) => /no pude leer cifras/.test(x))).toMatch(/^Sin comprobar: /)
  })
  it('🔴 lo no comprobado, solo, no abre una nota; junto a un aviso, sí va', async () => {
    const { notas, e } = await elegir('Un plan sin fechas ni cifras')
    expect((e.cuerpo.palabra_del_dueno as { avisos: string[] }).avisos.some((x) => x.startsWith('Sin comprobar'))).toBe(true)
    expect(notas).toEqual([])
  })
  it('🔴 un plan con $300 no deja ficha ni vuelve al redactor', async () => {
    const { rev } = await elegir(PLAN)
    expect(rev!.estado_del_motor.fichas.filter((f) => /dice 90 días|\$300 por semana/.test(f.que ?? ''))).toEqual([])
  })
  it('🔴 un plan con $300 llega entero, adoptado, y el aviso queda a la vista de Emilio', async () => {
    const { e, notas } = await elegir(PLAN)
    expect(e.cuerpo.adoptada).toBe('A')
    expect(e.cuerpo.resultado).not.toBe('con_desacuerdo')
    expect((e.cuerpo.palabra_del_dueno as { avisos: string[] }).avisos.some((x) => /\$300 por semana/.test(x))).toBe(true)
    expect(notas).toHaveLength(1)
    expect(notas[0]).toMatchObject({ titulo: expect.stringMatching(/avisos antes de aprobar/) })
    expect(notas[0].detalle).toMatch(/Aviso: .*\$300 por semana/)
  })
  it('otro tipo de artefacto no pasa por este control', async () => {
    const { P } = puertosDePrueba()
    const r = await abrirRevision(P, sobre('pieza'))
    const rev = await P.almacen.leerRevision(String(r.cuerpo.revision_id))
    expect(rev!.estado_del_motor.fichas.filter((f) => f.contra_que === 'control por código del plan')).toEqual([])
  })
})
