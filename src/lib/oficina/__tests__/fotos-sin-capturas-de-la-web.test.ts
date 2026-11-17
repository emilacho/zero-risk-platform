/**
 * 17-nov · Sprint 4 · D · las capturas de la web no son fotos propias (regla del cerebro `esCapturaDeLaWeb`, #1135) y la oferta de cada foto se ve en el pedido de la mesa.
 * La base falsa PROYECTA las columnas pedidas: si la lectura no pide `clase`/`tipo`, la regla no puede ver la captura y la prueba cae. US$ 0.
 * Las fotos de la lista salen de las fotos de práctica de la oficina (etiquetas reales), así esta prueba no nombra las columnas de etiqueta del cerebro.
 */
import { describe, expect, it } from 'vitest'
import { idsDeFotosPropias } from '../fotos-propias-datos'
import { LISTA_DE_FOTOS } from '../mesa/pedidos'
import { FOTOS } from './memoria'
import { ROTULO_CAPTURA_WEB, referenciasDeEstilo, separarFotosYCapturas } from '../material'
import { reglasDeInvencion } from '../prompts-sin-invencion'

type Fila = Record<string, unknown>
const FILAS: Fila[] = [
  { id: 'propia', client_id: 'k', estado: 'ok', owner_role: 'propio', clase: 'foto', tipo: 'post' },
  { id: 'sin-clase', client_id: 'k', estado: 'ok', owner_role: 'propio' },
  { id: 'cap-clase', client_id: 'k', estado: 'ok', owner_role: 'propio', clase: 'captura_web', tipo: 'post' },
  { id: 'cap-tipo', client_id: 'k', estado: 'ok', owner_role: 'propio', clase: 'foto', tipo: 'web_captura' },
]
function base() {
  return {
    from() {
      let cols: string[] = []
      const filtros: Array<[string, unknown]> = []
      const q = {
        select: (c: string) => { cols = c.split(',').map((x) => x.trim()); return q },
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
        limit: async () => ({ data: FILAS.filter((f) => filtros.every(([c, v]) => f[c] === v)).map((f) => Object.fromEntries(cols.filter((c) => c in f).map((c) => [c, f[c]]))), error: null }),
      }
      return q
    },
  } as never
}

describe('fotos propias sin capturas de la web', () => {
  it('🔴 la captura (por clase o por el tipo del raspado) no cuenta como foto propia; las demás sí', async () => {
    expect(await idsDeFotosPropias(base(), 'k')).toEqual(['propia', 'sin-clase'])
  })
})

describe('la oferta de cada foto en el pedido de la mesa', () => {
  const [f1, f2, f3] = FOTOS.slice(0, 3)
  it('🔴 con oferta, la línea de la foto dice « · oferta: <clave>»; es lo ÚNICO que cambia', () => {
    const con = LISTA_DE_FOTOS([{ ...f1, origen: 'propia', oferta: 'olon' }])
    const sin = LISTA_DE_FOTOS([{ ...f1, origen: 'propia' }])
    expect(con).toContain(' · oferta: olon')
    expect(con.replace(' · oferta: olon', '')).toBe(sin)
  })
  it('🔴 sin oferta, o con una vacía, no se dice nada (no se inventa)', () => {
    expect(LISTA_DE_FOTOS([{ ...f2, origen: 'propia' }, { ...f3, origen: 'propia', oferta: '  ' }])).not.toMatch(/oferta:/)
  })
})

describe('las capturas siguen como referencia de estilo, marcadas (GO Lenovo sobre #1137)', () => {
  const [f1, f2] = FOTOS.slice(0, 2)
  it('🔴 separarFotosYCapturas: fuera de las propias; en las referencias con `captura_web`; la propia pasa a «referencia»', () => {
    const r = separarFotosYCapturas([
      { ...f1, owner_role: 'propio', clase: 'foto' },
      { ...f2, id: 'cap-propia', owner_role: 'propio', clase: 'captura_web' },
      { ...f2, id: 'cap-comp', owner_role: 'competidor', tipo: 'web_captura' },
      { ...f2, id: 'ref-normal', owner_role: 'competidor' },
    ])
    expect(r.propias.map((x) => x.id)).toEqual([f1.id])
    expect(r.referencias.map((x) => [x.id, x.origen, x.captura_web ?? false])).toEqual([['ref-normal', 'competencia', false], ['cap-propia', 'referencia', true], ['cap-comp', 'competencia', true]])
  })
  it('🔴 la referencia de estilo dice «captura de la web · referencia, no se publica»; las demás, como siempre', () => {
    const t = referenciasDeEstilo([{ ...f1, origen: 'competencia', captura_web: true }, { ...f2, origen: 'competencia' }])
    expect(t[0].startsWith(`captura de la web · ${ROTULO_CAPTURA_WEB}: `)).toBe(true)
    expect(ROTULO_CAPTURA_WEB).toBe('referencia, no se publica')
    expect(t[1].startsWith('competencia: ')).toBe(true)
  })
})

describe('la captura del propio cliente no alimenta «no copiar» (observación CC6 a #1139)', () => {
  const [f1] = FOTOS.slice(0, 1)
  const LIM = { generar_cuando_no_hay_foto: true }
  it('🔴 la propia queda marcada `del_cliente`; la de la competencia no', () => {
    const r = separarFotosYCapturas([
      { ...f1, id: 'cap-propia', owner_role: 'propio', clase: 'captura_web' },
      { ...f1, id: 'cap-comp', owner_role: 'competidor', clase: 'captura_web' },
    ])
    expect(r.referencias.map((x) => [x.id, x.del_cliente ?? false])).toEqual([['cap-propia', true], ['cap-comp', false]])
  })
  it('🔴 su usuario y su web NO entran a «no copiar»; los de la competencia sí, como siempre', () => {
    const r = separarFotosYCapturas([
      { ...f1, id: 'cap-propia', owner_role: 'propio', clase: 'captura_web', handle: '@naufragocliente', url: 'https://naufrago-propio.test/menu' },
      { ...f1, id: 'cap-comp', owner_role: 'competidor', clase: 'captura_web', handle: '@rivalcomp', url: 'https://rival-comp.test/x' },
    ])
    const copiar = reglasDeInvencion(LIM, r.referencias)!.copiar
    expect(copiar).toContain('rivalcomp')
    expect(copiar).toContain('rival-comp.test')
    expect(copiar.some((c) => c.includes('naufragocliente') || c.includes('naufrago-propio'))).toBe(false)
  })
  it('🔴 solo salta la marcada: `del_cliente: false` sigue en «no copiar»', () => {
    expect(reglasDeInvencion(LIM, [{ handle: '@otrorival', del_cliente: false }])!.copiar).toContain('otrorival')
  })
})
