/**
 * Punto 6 del encargo «errores del plan», firma de Emilio (01-nov): el plan decía «v3» siendo la 2, y su lista omitía lo que pidió el dueño. Versión real y lista completa, por código. Con un cliente que no es el piloto. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { armarQueCambio, ponerQueCambio } from '../src/lib/jefatura/revision/plan'
import { cicloDelPlanDeLaBase } from '../src/lib/jefatura/revision/adaptadores'
import { correr, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { elegirVersionDelPlan } from '../src/lib/jefatura/revision/orquestador'

const PEDIDO = 'Quiero que la campaña hable de la nueva clínica en Cuenca desde la semana 1'
const FICHAS = [
  { origen: 'jefe', estado: 'tomada', donde: 'Presupuesto', razon: 'Cuadré la tabla', que: 'no cuadra' },
  { origen: 'jefe', estado: 'no_tomada', donde: 'Semana 2', razon: 'No aplica', que: 'otra' },
  { origen: 'externa', estado: 'tomada', donde: 'general', razon: 'Se tomaron dos ideas', que: 'x' },
]

describe('la lista', () => {
  it('🔴 lleva la versión real y lo que pidió el dueño, tal cual, más lo tomado de los revisores', () => {
    const t = armarQueCambio({ ciclo: { version: 2, pedido_del_dueno: PEDIDO }, fichas: FICHAS })
    expect(t).toMatch(/^## QUÉ CAMBIÓ EN ESTA VERSIÓN \(v2\)/)
    expect(t).toContain(PEDIDO)
    expect(t).toContain('Cuadré la tabla')
    expect(t).toContain('Se tomaron dos ideas')
  })
  it('lo no tomado no figura; lo que no se pudo leer se dice; sin versión no se inventa una', () => {
    const t = armarQueCambio({ ciclo: { version: null, pedido_del_dueno: null, aviso: 'No se pudo leer X' }, fichas: FICHAS })
    expect(t).not.toContain('No aplica')
    expect(t).toContain('No se pudo leer X')
    expect(t).toMatch(/^## QUÉ CAMBIÓ EN ESTA VERSIÓN\n/)
  })
  it('sin nada que decir lo dice', () => {
    expect(armarQueCambio({ ciclo: { version: 1, pedido_del_dueno: null }, fichas: [] })).toContain('Sin cambios registrados')
  })
})

describe('🔴 ponerla en el plan', () => {
  const PLAN = '# PLAN DE 90 DÍAS · X\n**Cuenca · fechas**\n\n---\n\n## QUÉ CAMBIÓ EN ESTA VERSIÓN (v3)\n\n1. Algo del modelo\n2. Otra cosa\n\n---\n\n## Resumen ejecutivo\n\nTres apuestas.\n'
  const S = '## QUÉ CAMBIÓ EN ESTA VERSIÓN (v2)\n\n- real'
  it('reemplaza la del modelo y deja el resto igual, letra por letra', () => {
    const t = ponerQueCambio(PLAN, S)
    expect(t).toBe('# PLAN DE 90 DÍAS · X\n**Cuenca · fechas**\n\n---\n\n' + S + '\n\n---\n\n## Resumen ejecutivo\n\nTres apuestas.\n')
    expect(t).not.toMatch(/v3|Algo del modelo/)
  })
  it('hasta el siguiente título si no hay separador; también sin tilde y al final del texto', () => {
    expect(ponerQueCambio('# T\n\n## Que cambio\n- a\n## Otra\nb', S)).toBe('# T\n\n' + S + '\n## Otra\nb')
    expect(ponerQueCambio('# T\n\n### QUÉ CAMBIÓ\n- a', S)).toBe('# T\n\n' + S)
  })
  it('si el modelo no la escribió, va tras el título; sin título, al principio', () => {
    expect(ponerQueCambio('# T\nsub\n\nCuerpo', S)).toBe('# T\nsub\n\n' + S + '\n\n\nCuerpo')
    expect(ponerQueCambio('Cuerpo', S)).toBe(S + '\n\nCuerpo')
  })
  it('no confunde otra sección que nombra cambios', () => {
    expect(ponerQueCambio('# T\n\n## Qué cambia en la semana 3\nz', S)).toContain('## Qué cambia en la semana 3')
  })
})

describe('leer el ciclo de la base', () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', K = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  it('🔴 de un «Pedir cambios»: la versión del sistema y el texto del dueño', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [{ id: A, provenance_tag: { version: 2, plan_cambio_id: K } }]).semilla('plan_cambios', [{ id: K, texto: PEDIDO }])
    expect(await cicloDelPlanDeLaBase(db as never, A)).toEqual({ version: 2, pedido_del_dueno: PEDIDO })
  })
  it('una primera corrida no tiene pedido; un pedido que no se lee, se dice', async () => {
    const uno = new DbFalsa().semilla('client_historical_outputs', [{ id: A, provenance_tag: { version: 1 } }])
    expect(await cicloDelPlanDeLaBase(uno as never, A)).toEqual({ version: 1, pedido_del_dueno: null })
    const sin = new DbFalsa().semilla('client_historical_outputs', [{ id: A, provenance_tag: { version: 2, plan_cambio_id: K } }]).semilla('plan_cambios', [])
    expect((await cicloDelPlanDeLaBase(sin as never, A)).aviso).toMatch(/No se pudo leer lo que pidió el dueño/)
  })
  it('una base caída no lanza', async () => {
    expect((await cicloDelPlanDeLaBase({ from() { throw new Error('x') } } as never, A)).aviso).toMatch(/No se pudo leer/)
  })
})

describe('🔴 de punta a punta: al elegir la versión del plan', () => {
  const ev = [{ etiqueta: 'A' as const, marcas: 2, largo: 30000 }, { etiqueta: 'B' as const, marcas: 1, largo: 30500 }, { etiqueta: 'C' as const, marcas: 1, largo: 31000 }]
  const cerrada = async () => {
    const { P } = puertosDePrueba()
    P.cicloDelPlan = async () => ({ version: 2, pedido_del_dueno: PEDIDO })
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'algo' } }))
    return { P, id: String(c.aperturas[0].cuerpo.revision_id) }
  }
  it('cada versión a guardar sale con la lista real, con la orden del dueño y la versión del sistema', async () => {
    const { P, id } = await cerrada()
    const r = await elegirVersionDelPlan(P, id, { evaluaciones: ev, idDeA: 'A-id', existentes: [] })
    const textos = r.cuerpo.textos_a_guardar as Record<string, string>
    expect(Object.keys(textos).sort()).toEqual(['B', 'C'])
    for (const k of ['B', 'C']) {
      expect(textos[k]).toContain('QUÉ CAMBIÓ EN ESTA VERSIÓN (v2)')
      expect(textos[k]).toContain(PEDIDO)
    }
  })
  it('la versión B no atribuye lo que la revisión externa todavía no dijo', async () => {
    const { P, id } = await cerrada()
    const rev = await P.almacen.leerRevision(id)
    const fichas = rev!.estado_del_motor.fichas as unknown as Array<Record<string, unknown>>
    fichas.push({ id: 'ext-1', origen: 'externa', estado: 'tomada', donde: 'general', razon: 'SOLO EN LA C', que: 'x' })
    await P.almacen.guardar({ revision_id: id, estado_del_motor: rev!.estado_del_motor, gasto_usd: rev!.gasto_usd })
    const textos = (await elegirVersionDelPlan(P, id, { evaluaciones: ev, idDeA: 'A-id', existentes: [] })).cuerpo.textos_a_guardar as Record<string, string>
    expect(textos.B).not.toContain('SOLO EN LA C')
    expect(textos.C).toContain('SOLO EN LA C')
  })
  it('sin nada que guardar, no entrega textos', async () => {
    const { P, id } = await cerrada()
    const r = await elegirVersionDelPlan(P, id, { evaluaciones: [{ etiqueta: 'A', marcas: 0, largo: 30000 }, { etiqueta: 'B', marcas: 5, largo: 30000 }, { etiqueta: 'C', marcas: 5, largo: 30000 }], idDeA: 'A-id', existentes: [] })
    expect(r.cuerpo).not.toHaveProperty('textos_a_guardar')
  })
})
