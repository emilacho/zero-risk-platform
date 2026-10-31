/**
 * LA REGLA ÚNICA «¿es del cliente?» (31-oct · CC#3). Los MISMOS casos (`fixtures/regla-propio-casos.json`) los corre también la base:
 * `node scripts/ops/verificar-regla-propio-en-base.mjs` (SELECT, sin tocar nada). Si cambias un caso, corre los dos.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseDeFicha, conservaElRotulo, esPaginaDelClienteConPrueba, hostDe, usuarioDe, veredictoDePagina } from '../src/lib/propio/regla-propio'

type Caso = { n: string; web: string | null; cfg: unknown; url: string; v: 'si' | 'no' | 'sin_base' }
const CASOS: Caso[] = JSON.parse(readFileSync(join(process.cwd(), '__tests__', 'fixtures', 'regla-propio-casos.json'), 'utf8'))

describe('la regla única · casos compartidos con la base', () => {
  it('hay casos de sobra y de los tres veredictos', () => {
    expect(CASOS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(CASOS.map((c) => c.v))).toEqual(new Set(['si', 'no', 'sin_base']))
  })
  for (const c of CASOS) {
    it(c.n, () => {
      expect(veredictoDePagina(baseDeFicha({ website_url: c.web, config: c.cfg }), c.url)).toBe(c.v)
    })
  }
})

describe('lo que hace cada consumidor con el veredicto', () => {
  const nau = baseDeFicha({ website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } })
  const vacia = baseDeFicha({ website_url: null, config: {} })
  it('la base conserva el rótulo salvo que se pruebe que NO es del cliente', () => {
    expect(conservaElRotulo(nau, 'https://www.cnn.com/x')).toBe(false)
    expect(conservaElRotulo(nau, 'https://www.naufrago.ec')).toBe(true)
    expect(conservaElRotulo(vacia, 'https://www.cnn.com/x')).toBe(true) // sin con qué comparar
  })
  it('las sedes exigen PRUEBA: sin base nada cuenta', () => {
    expect(esPaginaDelClienteConPrueba(vacia, 'https://www.naufrago.ec')).toBe(false)
    expect(esPaginaDelClienteConPrueba(nau, 'https://www.naufrago.ec')).toBe(true)
    expect(esPaginaDelClienteConPrueba(nau, 'https://www.pixnoy.com/ja/profile/naufrago.ec/')).toBe(false)
  })
})

describe('las piezas', () => {
  it('hostDe y usuarioDe', () => {
    expect(hostDe('https://u:p@WWW.Ejemplo.com:8080/a?b#c')).toBe('ejemplo.com')
    expect(hostDe('sin protocolo')).toBe('')
    expect(usuarioDe('https://www.linkedin.com/in/ana-perez/')).toBe('ana-perez')
    expect(usuarioDe('https://www.youtube.com/@canal')).toBe('canal')
    expect(usuarioDe('https://www.instagram.com/p/XYZ/')).toBe('p')
    expect(usuarioDe('https://www.cnn.com/x')).toBeNull()
  })
  it('baseDeFicha junta las cuentas de las dos listas y la red que sea el sitio', () => {
    const b = baseDeFicha({ website_url: 'https://www.instagram.com/zeroriskgye/', config: { own_social_handles: { facebook: 'zrfb' }, apify: { own_handles: { instagram: '@zeroriskgye', x: 5 } } } })
    expect(b.cuentas).toEqual(expect.arrayContaining([{ red: 'facebook', usuario: 'zrfb' }, { red: 'instagram', usuario: 'zeroriskgye' }]))
    expect(b.cuentas.some((c) => (c.usuario as unknown) === 5)).toBe(false)
  })
})
