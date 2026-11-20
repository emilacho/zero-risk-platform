/**
 * 20-nov · «Crear Campaña» · entrega 3: la revisión de la PIEZA recibe el brief del dueño de la campaña del encargo (el mismo documento que leyeron
 * la estrategia, el brief creativo y la gran idea), para no marcar como inventado lo que pidió el dueño. Sin campaña o sin puerto, nada cambia. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { jugar, montar } from './mesa-arnes'

type Sobre = { payload: { contexto: Array<{ titulo: string; texto: string }> } }
const TITULO = 'El brief del dueño de esta campaña'

async function correr(o: { campana?: string; puerto?: 'ok' | 'nada' | 'falla' | 'sin' }) {
  const { M, a, id } = await montar()
  if (o.campana) M.encargos.get(id)!.campana_id = o.campana
  const pedidos: string[] = []
  if (o.puerto && o.puerto !== 'sin') {
    M.P.briefDelDuenoParaRevisar = async (c: string) => {
      pedidos.push(c)
      if (o.puerto === 'falla') throw new Error('sin conexión')
      return o.puerto === 'ok' ? { titulo: TITULO, funcion: 'lo que el dueño pidió', texto: `brief de ${c}` } : null
    }
  }
  const sobres: Sobre[] = []
  M.P.jefatura = (async (s: never) => { sobres.push(s); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
  await jugar(M, id, a)
  return { pedidos, contexto: sobres[0].payload.contexto }
}

describe('la revisión de la pieza recibe el brief del dueño de SU campaña', () => {
  it('con campaña y puerto: llega el documento, pedido por la campaña del encargo', async () => {
    const r = await correr({ campana: 'camp-dueno-1', puerto: 'ok' })
    expect(r.pedidos).toEqual(['camp-dueno-1'])
    expect(r.contexto.find((c) => c.titulo === TITULO)?.texto).toBe('brief de camp-dueno-1')
  })
  it('sin pedido del dueño, sin campaña o sin puerto: no se agrega nada (el contexto queda como hoy)', async () => {
    const hoy = (await correr({ campana: 'camp-x', puerto: 'sin' })).contexto
    for (const caso of [{ campana: 'camp-x', puerto: 'nada' as const }, { puerto: 'ok' as const }]) {
      const r = await correr(caso)
      expect(r.contexto.some((c) => c.titulo === TITULO)).toBe(false)
      expect(r.contexto.map((c) => c.titulo)).toEqual(hoy.map((c) => c.titulo))
      if (!caso.campana) expect(r.pedidos).toEqual([])
    }
  })
  it('si el puerto falla, la revisión sigue y el motivo viaja dicho', async () => {
    const r = await correr({ campana: 'camp-dueno-1', puerto: 'falla' })
    expect(r.contexto.find((c) => c.titulo === TITULO)?.texto).toContain('(no se pudo leer: sin conexión.')
  })
})
