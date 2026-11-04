/**
 * 04-nov · los turnos de la oficina y de la jefatura dicen de qué trabajo son: el flujo los pasa tal cual a la llamada.
 * El encargo de la oficina es la pieza; lo que no tiene id firmado (cadenas, otros tipos de revisión) queda «sin dato».
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pedidoDeAgente } from '@/lib/oficina/mesa/pedidos'
import { pedidoDe } from '@/lib/oficina/orquestador'
import { armarPedidoDeAgente } from '@/lib/jefatura/revision/pedidos'

const LEE = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const mesa = { agente: 'a', task: 't', encargo_id: 'enc-1', client_id: 'c', dry_run: true, paso: 'p', reserva_usd: 1 }
const jefatura = { agente: 'a', task: 't', esquema: 'e', indicacion: 'i', paso: 'p', revision_id: 'r', dispatch_key: 'd', max_budget_usd: 1, dry_run: true, client_id: 'c' }

describe('oficina', () => {
  it('🔴 el pedido de un paso de agente lleva la pieza', () => {
    const p = pedidoDe({ id: 'enc-1', client_id: 'c', dry_run: true } as never, { indicaciones: {} } as never, { clave: 'x', tipo: 'agente', tope_usd: 1 } as never, 'a', { task: 't', images: [], esquema: 'e' }, {} as never)
    expect(p).toMatchObject({ trabajo_tipo: 'pieza', trabajo_id: 'enc-1' })
  })
  it('🔴 la mesa de una pieza la lleva; la de una cadena, no', () => {
    expect(pedidoDeAgente({ ...mesa, es_pieza: true })).toMatchObject({ trabajo_tipo: 'pieza', trabajo_id: 'enc-1' })
    for (const p of [pedidoDeAgente({ ...mesa, es_pieza: false }), pedidoDeAgente(mesa)]) {
      expect(p).not.toHaveProperty('trabajo_tipo')
      expect(p).not.toHaveProperty('trabajo_id')
    }
  })
  it('🔴 el turno de la mesa decide por el tipo del encargo', () => {
    expect(LEE('src/lib/oficina/mesa/orquestador.ts')).toContain('es_pieza: !esDeLaCadena(est.tipo)')
  })
})

describe('jefatura', () => {
  it('🔴 con trabajo lo lleva; sin él, no agrega llaves', () => {
    expect(armarPedidoDeAgente({ ...jefatura, trabajo: { trabajo_tipo: 'pieza', trabajo_id: 'enc-1' } })).toMatchObject({ trabajo_tipo: 'pieza', trabajo_id: 'enc-1' })
    expect(armarPedidoDeAgente(jefatura)).not.toHaveProperty('trabajo_tipo')
  })
  it('🔴 la revisión de una pieza declara su `artifact_id`', () => {
    expect(LEE('src/lib/jefatura/revision/orquestador.ts')).toContain("rev.artifact_type === 'pieza' ? { trabajo_tipo: 'pieza', trabajo_id: rev.artifact_id }")
  })
})
