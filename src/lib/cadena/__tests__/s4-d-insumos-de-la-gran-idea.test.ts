/**
 * 17-nov · Sprint 4 · D · los insumos de la gran idea (DISENO-CC1 sprint4-D + ADENDAS 3 y 4 · GO Lenovo):
 *  · el pedido lleva el bloque `# FICHAS DE LAS OFERTAS` de CC3 tal cual; sin fichas lo DICE
 *  · salen las dos órdenes («mínimo = huecos del patrón × semanas» y «sin datos con valor»)
 *  · «# SEDES» → «# OFERTAS» (agnóstico)
 *  · el plan no entra (solo por el brief)
 * US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { marcoDelConcepto } from '../mesas'
import { TITULO_DEL_BLOQUE, fichasEnTexto, type FichaDeOferta } from '../ficha-de-oferta'
import { contextoDe, clienteA, clienteB } from '../__fixtures__/clientes'

const A = clienteA()
const ctx = contextoDe(A)
const base = { ctx, estrategia: A.estrategia, briefTexto: '## Mensaje\nEL-BRIEF', version: 1, nota: null, hoy: '2026-11-17' }
const FICHA: FichaDeOferta = {
  clave: 'olon', nombre: 'Náufrago Olón',
  que_es: { valor: 'restaurante frente al mar', fuente: 'manual §2' },
  oferta_y_precio: [{ valor: 'menú del día US$ 8', fuente: 'dueño 15-nov', vigente_hasta: '2026-12-31' }],
}

describe('D · la gran idea lee las fichas de las ofertas', () => {
  it('🔴 con fichas: el bloque de CC3 entra TAL CUAL (mismo texto que `fichasEnTexto`), con los hechos y su fuente', () => {
    const m = marcoDelConcepto({ ...base, fichas: [FICHA] })
    expect(m).toContain(fichasEnTexto([FICHA], '2026-11-17'))
    expect(m).toContain('menú del día US$ 8')
    expect(m).toContain('dueño 15-nov')
  })
  it('🔴 sin fichas: el bloque está y lo DICE (nunca falta en silencio)', () => {
    for (const fichas of [undefined, null, []]) {
      const m = marcoDelConcepto({ ...base, fichas })
      expect(m).toContain(TITULO_DEL_BLOQUE)
      expect(m).toContain(fichasEnTexto(null, '2026-11-17'))
      expect(m).toMatch(/sin fichas de hechos todavía/)
    }
  })
  it('el bloque de fichas va UNA vez', () => {
    expect(marcoDelConcepto({ ...base, fichas: [FICHA] }).split(TITULO_DEL_BLOQUE).length - 1).toBe(1)
  })
})

describe('D · las órdenes que salen y el nombre agnóstico', () => {
  const m = marcoDelConcepto(base)
  it('🔴 sin «mínimo por red = huecos del patrón × semanas» ni «sin datos con valor»', () => {
    expect(m).not.toMatch(/huecos del patrón semanal × semanas/)
    expect(m).not.toMatch(/Banco parcial/)
    expect(m).not.toMatch(/sin datos con valor/)
    // lo que se queda de esa línea
    expect(m).toContain('Cada idea trae mensaje y gancho propios y distintos; ids únicos.')
    expect(m).toContain('Sin cifras con decimales inventadas, sin claims propios que no se puedan probar.')
  })
  it('🔴 «# OFERTAS», nunca «# SEDES»', () => {
    expect(m).toContain('# OFERTAS')
    expect(m).not.toMatch(/^# SEDES/m)
    const sinSedes = marcoDelConcepto({ ...base, ctx: { ...ctx, sedes: [] } })
    expect(sinSedes).toContain('# OFERTAS\n(sin ofertas registradas)')
  })
  it('el plan no entra (llega solo por el brief)', () => {
    expect(m).toContain('EL-BRIEF')
    expect(m).not.toMatch(/^# PLAN/m)
  })
})

describe('D · tres clientes de rubros distintos (restaurante con local · tienda en línea sin local · servicio profesional)', () => {
  const restaurante = { ...base, ctx: contextoDe(clienteA()), fichas: [{ clave: 'centro', nombre: 'Café Brisa Centro', que_es: { valor: 'cafetería de desayunos', fuente: 'manual:carta' } }] as FichaDeOferta[] }
  const tienda = {
    ...base, ctx: { ...contextoDe(clienteA()), sedes: [] },
    fichas: [
      { clave: 'coleccion-invierno', que_es: { valor: 'colección de abrigos ligeros', fuente: 'manual:productos' }, como_se_compra: [{ valor: 'en la tienda web', fuente: 'plan:canales' }] },
      { clave: 'envio-gratis', que_es: { valor: 'envío sin costo en compras mayores a $40', fuente: 'plan:promos', vigente_hasta: '2026-11-15' } },
    ] as FichaDeOferta[],
  }
  const servicio = { ...base, ctx: contextoDe(clienteB()), estrategia: clienteB().estrategia, fichas: [{ clave: 'unica', nombre: 'Clínica Altozano', que_es: { valor: 'consulta dermatológica', fuente: 'manual:servicios' }, obligatorios_legales: [{ valor: 'no reemplaza un diagnóstico', fuente: 'manual:legal' }] }] as FichaDeOferta[] }

  it.each([['restaurante', restaurante], ['tienda en línea', tienda], ['servicio profesional', servicio]] as const)('%s: el pedido trae SUS fichas tal cual, «# OFERTAS», y ninguna orden quitada', (_, c) => {
    const m = marcoDelConcepto(c)
    expect(m).toContain(fichasEnTexto(c.fichas, c.hoy))
    expect(m).toContain('# OFERTAS')
    expect(m).not.toMatch(/^# SEDES/m)
    expect(m).not.toMatch(/huecos del patrón semanal|sin datos con valor/)
  })
  it('🔴 los hechos de un cliente no aparecen en el pedido de otro', () => {
    const [r, t, s] = [restaurante, tienda, servicio].map((c) => marcoDelConcepto(c))
    expect(t).toContain('envío sin costo en compras mayores a $40')
    expect(r).not.toContain('envío sin costo'); expect(s).not.toContain('envío sin costo')
    expect(s).toContain('no reemplaza un diagnóstico')
    expect(r).not.toContain('no reemplaza un diagnóstico'); expect(t).not.toContain('no reemplaza un diagnóstico')
  })
  it('🔴 la tienda sin local: «(sin ofertas registradas)» en OFERTAS pero sus fichas sí entran (lo que vende no depende de tener local); el dato vencido se marca', () => {
    const t = marcoDelConcepto(tienda)
    expect(t).toContain('# OFERTAS\n(sin ofertas registradas)')
    expect(t).toContain('## coleccion-invierno')
    expect(t).toMatch(/VENCIDO/)
  })
})
