// 01-nov · firma de Emilio: lo creativo avisa y no frena. Cada regla con su pareja de veracidad o de forma, que sigue bloqueando.
import { describe, expect, it } from 'vitest'
import { normalizarPilares, validarTodo, type Hallazgo, type InsumosCalendario, type TandaAgente } from '../index'
import { clienteA, filasDe, formatosDeLaMigracion, tandaBuena } from '../__fixtures__/clientes'
import { lexicoDeLaIndustria } from '../lexico-por-rubro'

const FORMATOS = formatosDeLaMigracion()
const c = clienteA()
const bueno = tandaBuena(c)
const insumos = (t: TandaAgente, extra: Partial<InsumosCalendario> = {}): InsumosCalendario => ({
  campana: c.campana, estrategia: c.estrategia, planTexto: c.planTexto, formatos: FORMATOS, sedes: c.sedes, referencias: c.referencias,
  clientId: c.clientId, ahora: c.ahora, filas: filasDe(c, t, FORMATOS), forbiddenWords: c.forbiddenWords, conocidos: c.conocidos, registro: 'tu', lexico: lexicoDeLaIndustria('restaurante de comida'), ...extra,
})
const de = (hs: Hallazgo[], chequeo: string, sev: string, re?: RegExp) => hs.filter((h) => h.chequeo === chequeo && h.severidad === sev && (!re || re.test(h.ficha.que)))

describe('V05 canal', () => {
  const red = c.estrategia.canales[0].red
  const sinCanal = { ...c.estrategia, canales: c.estrategia.canales.filter((x) => x.red !== red), excluidos: c.estrategia.excluidos.filter((x) => x.red !== red) }
  it('🔴 una red que no es canal de la estrategia avisa y no frena', () => {
    const hs = validarTodo(insumos(bueno, { estrategia: sinCanal }))
    expect(de(hs, 'V05', 'aviso', /no es un canal/).length).toBeGreaterThan(0)
    expect(de(hs, 'V05', 'bloquea', /no es un canal/)).toEqual([])
  })
  it('🔴 la pareja: una red excluida por el plan sigue bloqueando', () => {
    const excluida = { ...sinCanal, excluidos: [...sinCanal.excluidos, { red, cita_plan: 'x' }] }
    expect(de(validarTodo(insumos(bueno, { estrategia: excluida as typeof c.estrategia })), 'V05', 'bloquea', /excluida/).length).toBeGreaterThan(0)
  })
})

describe('V07 feriado', () => {
  const base = insumos(bueno)
  const primera = base.filas[0]
  const conFeriado = (f: Partial<typeof primera>) => base.filas.map((x, i) => (i === 0 ? { ...x, tema: 'Abrimos por el feriado', ...f } : x))
  const fechas = [{ id: 'f1', fecha: primera.fecha, nombre: 'Feriado', tipo: 'feriados', ambito: 'nacional', alcance: 'nacional' as const, estado: 'verificada' as const }]
  it('🔴 un feriado verificado con local abierto avisa y no frena', () => {
    const hs = validarTodo({ ...base, fechasEspeciales: fechas, filas: conFeriado({ requiere_abierto: true, datos: [{ dato: 'fecha_especial', valor: 'Feriado', ref: 'fecha:f1' } as (typeof primera)['datos'][number]] }) })
    expect(de(hs, 'V07', 'aviso', /exige local abierto/)).toHaveLength(1)
    expect(de(hs, 'V07', 'bloquea')).toEqual([])
  })
  it('🔴 la pareja: el feriado sin fuente sigue bloqueando', () => {
    // 11-nov (reglas rígidas #5): la fila declara la fecha que cita; sin esa fecha verificada, bloquea
    const declarada = { datos: [{ dato: 'fecha_especial', valor: 'Feriado', ref: 'fecha:f1' } as (typeof primera)['datos'][number]] }
    expect(de(validarTodo({ ...base, fechasEspeciales: [], filas: conFeriado(declarada) }), 'V07', 'bloquea', /sin fuente/)).toHaveLength(1)
  })
})

describe('V09 pilares', () => {
  const base = insumos(bueno)
  const vivas = base.filas.filter((f) => f.pilar)
  const p = c.estrategia.pilares[0]
  const real = (vivas.filter((f) => f.pilar === p.clave).length / vivas.length) * 100
  const conMeta = (pct: number) => ({ ...c.estrategia, pilares: c.estrategia.pilares.map((x) => (x.clave === p.clave ? { ...x, pct } : x)) })
  const delPilar = (hs: Hallazgo[]) => hs.filter((h) => h.chequeo === 'V09' && h.ficha.que.includes(`pilar ${p.clave} pesa`))
  it('🔴 un pilar desconocido avisa y no frena', () => {
    const hs = validarTodo({ ...base, filas: base.filas.map((f, i) => (i === 0 ? { ...f, pilar: 'pilar-que-no-existe' } : f)) })
    expect(de(hs, 'V09', 'aviso', /no existe en la estrategia/)).toHaveLength(1)
    expect(de(hs, 'V09', 'bloquea')).toEqual([])
  })
  it('🔴 el umbral es 5 puntos: a 7 avisa, a 3 calla, y a 40 sigue siendo aviso', () => {
    const siete = delPilar(validarTodo({ ...base, estrategia: conMeta(real + 7) }))
    expect(siete).toHaveLength(1)
    expect(siete[0].severidad).toBe('aviso')
    expect(delPilar(validarTodo({ ...base, estrategia: conMeta(real + 3) }))).toEqual([])
    expect(delPilar(validarTodo({ ...base, estrategia: conMeta(real + 40) }))[0].severidad).toBe('aviso')
  })
})

describe('normalizarPilares', () => {
  const con = (pcts: unknown[]) => ({ otro: 'se queda', pilares: pcts.map((pct, i) => ({ clave: `p${i}`, pct })) })
  const pcts = (x: unknown) => (x as { pilares: Array<{ pct: unknown }> }).pilares.map((p) => p.pct)
  it('🔴 reparte en proporción, conserva lo demás y avisa S01', () => {
    const r = normalizarPilares(con([45, 45]))
    expect(pcts(r.estrategia)).toEqual([50, 50])
    expect((r.estrategia as { otro: string }).otro).toBe('se queda')
    expect(r.aviso).toMatchObject({ chequeo: 'S01', severidad: 'aviso' })
    expect(r.aviso!.ficha.que).toContain('sumaban 90')
  })
  it.each([[[33, 33, 33]], [[1, 1, 1]], [[10, 20, 40]], [[70, 70, 70, 70, 70, 70]]])('🔴 el redondeo suma exactamente 100: %j', (x) => {
    expect((pcts(normalizarPilares(con(x)).estrategia) as number[]).reduce((s, n) => s + n, 0)).toBe(100)
  })
  it('🔴 lo que ya suma 100 no se toca ni avisa', () => {
    const e = con([60, 40])
    const r = normalizarPilares(e)
    expect(r.estrategia).toBe(e)
    expect(r.aviso).toBeNull()
  })
  it.each([[[0, 0]], [['mucho', 50]], [[50, null]], [[-10, 50]], [[Number.NaN, 50]], [[]]])('🔴 sin base válida no adivina: %j', (x) => {
    const e = con(x)
    const r = normalizarPilares(e)
    expect(r.estrategia).toBe(e)
    expect(r.aviso).toBeNull()
  })
  it('🔴 sin lista de pilares tampoco adivina', () => {
    expect(normalizarPilares({ nada: 1 }).aviso).toBeNull()
    expect(normalizarPilares(null).aviso).toBeNull()
  })
})
