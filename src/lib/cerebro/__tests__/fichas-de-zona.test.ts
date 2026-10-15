/**
 * LAS FICHAS DE ZONA (15-oct · nuevos brazos): feriados y temporada no llevan cliente (`client_id` = `zona:<país>`). El lector las suma a la lista de un cliente SOLO si su ficha
 * dice el país; es la ÚNICA excepción al «cada lectura lleva el filtro del cliente», y esta prueba la acota: ningún otro id, ninguna otra zona, ningún cliente de prueba.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { A, AHORA, B, C, Z, crearBaseFalsa, tablasDeLaBase } from './casos'
import { dias, ficha } from './fichas-casos'

function tablas() {
  const t = tablasDeLaBase()
  t.clients = t.clients.map((c) => (c.id === A ? { ...c, country: 'Ecuador', market: 'Olón, Santa Elena, Ecuador' } : c.id === B ? { ...c, country: 'Colombia' } : c.id === Z ? { ...c, country: 'Narnia' } : c))
  t.cerebro_fichas = [
    ficha('zc-ec', 'zona:ec', { clase: 'contexto_feriado', titulo: 'Feriado · Día de Difuntos', origen: 'tercero', propiedad: 'ajena', fecha_fuente: dias(1) }),
    ficha('zc-co', 'zona:co', { clase: 'contexto_feriado', titulo: 'Feriado · otro país', origen: 'tercero', propiedad: 'ajena' }),
    ficha('fa-1', A, { titulo: 'Ficha propia de A' }),
  ]
  return t
}
const refs = async (cliente: string, t = tablas(), fallan: string[] = []) => {
  const base = crearBaseFalsa(t, fallan)
  const l = await construirListaCorta(base.consulta, cliente, { ahora: AHORA })
  return { l, base, refs: l.lineas.map((x) => x.ref) }
}

describe('fichas de zona', () => {
  it('el cliente con país Ecuador ve las de `zona:ec` (marcadas sobre terceros) y no las de otro país', async () => {
    const { l, refs: r } = await refs(A)
    expect(r).toContain('cerebro_fichas:zc-ec')
    expect(r).not.toContain('cerebro_fichas:zc-co')
    expect(r).toContain('cerebro_fichas:fa-1')
    expect(l.lineas.find((x) => x.ref === 'cerebro_fichas:zc-ec')?.sobre_terceros).toBe(true)
  })
  it('cada cliente ve SOLO la zona de su país; sin país o con un país desconocido no ve ninguna', async () => {
    expect((await refs(B)).refs).toContain('cerebro_fichas:zc-co')
    expect((await refs(B)).refs).not.toContain('cerebro_fichas:zc-ec')
    for (const sin of [C, Z]) {
      const r = (await refs(sin)).refs.filter((x) => x.startsWith('cerebro_fichas:zc-'))
      expect(r).toEqual([])
    }
  })
  it('es la ÚNICA excepción al filtro por cliente: las lecturas de `cerebro_fichas` van a su cliente o a SU zona, nada más', async () => {
    const { base } = await refs(A)
    const ids = base.llamadas.filter((p) => p.tabla === 'cerebro_fichas').map((p) => String(p.donde.client_id))
    expect(ids.sort()).toEqual([A, 'zona:ec'].sort())
    for (const p of base.llamadas.filter((x) => x.tabla !== 'cerebro_fichas')) expect(p.tabla === 'clients' ? p.donde.id : p.donde.client_id).toBe(A)
  })
  it('una ficha de zona marcada de prueba o descartada no sale', async () => {
    const t = tablas()
    t.cerebro_fichas.push(ficha('zc-p', 'zona:ec', { prueba: true }), ficha('zc-d', 'zona:ec', { descartada: true }))
    const r = (await refs(A, t)).refs
    expect(r).not.toContain('cerebro_fichas:zc-p')
    expect(r).not.toContain('cerebro_fichas:zc-d')
  })
  it('un cliente de prueba nunca lee zona', async () => {
    const t = tablas()
    t.cerebro_fichas.push(ficha('pp-1', 'prueba-portero', { prueba: true }))
    const base = crearBaseFalsa(t)
    const l = await construirListaCorta(base.consulta, 'prueba-portero', { ahora: AHORA })
    expect(l.lineas.map((x) => x.ref)).toEqual(['cerebro_fichas:pp-1'])
    expect(base.llamadas.every((p) => p.donde.client_id === 'prueba-portero')).toBe(true)
  })
  it('si falla SOLO la lectura de la zona, la fuente de fichas lo dice (no se lee como «sin contexto»)', async () => {
    const base = crearBaseFalsa(tablas())
    const consulta: typeof base.consulta = async (p) => (p.tabla === 'cerebro_fichas' && String(p.donde.client_id).startsWith('zona:') ? { filas: [], error: 'fallo simulado de la zona' } : base.consulta(p))
    const l = await construirListaCorta(consulta, A, { ahora: AHORA })
    expect(l.fuentes.fichas.estado).toBe('error_de_lectura')
  })
  it('si la lectura de las fichas falla, la fuente lo dice (no se lee como «sin contexto»)', async () => {
    const { l } = await refs(A, tablas(), ['cerebro_fichas'])
    expect(l.fuentes.fichas.estado).toBe('error_de_lectura')
  })
})
