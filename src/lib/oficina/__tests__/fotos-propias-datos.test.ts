/**
 * 10-nov · 🟡 de CC7 a #968 (pedido 3): la regla de las fotos PROPIAS que recibe el lector de la gran idea no tenía prueba.
 * Si contara las de competidores o las que no están «ok», en el cliente piloto serían cientos de fotos ajenas aceptadas como propias.
 * La base falsa APLICA los filtros que recibe (tabla, `client_id`, `estado`): quitar un filtro cambia lo que vuelve.
 */
import { describe, expect, it } from 'vitest'
import { idsDeFotosPropias } from '../fotos-propias-datos'

type Fila = Record<string, unknown>
const FILAS: Fila[] = [
  { id: 'p-ok', client_id: 'k', estado: 'ok', owner_role: 'propio' },
  { id: 'comp-ok', client_id: 'k', estado: 'ok', owner_role: 'competidor' },
  { id: 'ref-ok', client_id: 'k', estado: 'ok', owner_role: 'referencia' },
  { id: 'p-pendiente', client_id: 'k', estado: 'pendiente', owner_role: 'propio' },
  { id: 'otro-cliente', client_id: 'z', estado: 'ok', owner_role: 'propio' },
]

/** base falsa que filtra de verdad; con `falla`, la lectura devuelve error o revienta */
function base(o: { falla?: 'error' | 'lanza' } = {}) {
  const tablas: string[] = []
  const db = {
    from(t: string) {
      tablas.push(t)
      const filtros: Array<[string, unknown]> = []
      const q = {
        select: (cols: string) => { if (!cols.includes('owner_role')) throw new Error('sin owner_role no se sabe el origen'); return q },
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
        limit: async () => {
          if (o.falla === 'lanza') throw new Error('la base no responde')
          if (o.falla === 'error') return { data: null, error: { message: 'permiso denegado' } }
          return { data: FILAS.filter((f) => t === 'client_social_images' && filtros.every(([c, v]) => f[c] === v)), error: null }
        },
      }
      return q
    },
  }
  return { db: db as never, tablas }
}

describe('fotos propias · la misma regla que la oficina', () => {
  it('🔴 vuelve solo la propia «ok» del cliente: ni competidor, ni referencia, ni una no «ok», ni otro cliente', async () => {
    const b = base()
    expect(await idsDeFotosPropias(b.db, 'k')).toEqual(['p-ok'])
    expect(b.tablas).toEqual(['client_social_images'])
  })
  it('🔴 si la lectura falla (error o excepción) devuelve [] y la entrega no se pierde', async () => {
    expect(await idsDeFotosPropias(base({ falla: 'error' }).db, 'k')).toEqual([])
    expect(await idsDeFotosPropias(base({ falla: 'lanza' }).db, 'k')).toEqual([])
  })
})
