/**
 * Condición C3 de CC#1 a la sala 1: la oficina marca `rejected` + `decision.vencida = true` a la pieza que Emilio no aprobó a tiempo (la bandeja no admite `expired`).
 * Los lectores del cerebro NO pueden contar eso como un rechazo del dueño: nadie rechazó nada.
 */
import { describe, expect, it } from 'vitest'
import type { Consulta, Fila } from '../src/lib/cerebro/consulta'
import { leerDecisionesDeLaCola, leerTrabajosHechos } from '../src/lib/cerebro/lectores'
import { PLAZOS_EN_DIAS } from '../src/lib/cerebro/plazos'

const AHORA = new Date('2026-10-12T12:00:00Z')
const PIEZA = (id: string): Fila => ({ id, output_type: 'campaign_piece', title: `Pieza ${id}`, status: 'draft', created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z', content_text: 'texto', provenance_tag: { brief_id: 'BRF-1', parte_id: 'p1' }, hitl_verdict: null, human_edits: null })
const cola = (extra: Fila): Fila => ({ id: 'q1', type: 'content_piece_review', output_id: 'a', status: 'rejected', decision: {}, resolution_notes: null, resolved_at: '2026-10-11T10:00:00Z', created_at: '2026-10-10T11:00:00Z', ...extra })
const ctx = (filasCola: Fila[]) => {
  const consulta: Consulta = async (p) => ({ filas: p.tabla === 'hitl_queue' ? filasCola : p.tabla === 'client_historical_outputs' ? [PIEZA('a')] : [], error: null })
  return { consulta, cliente: 'c1', ahora: AHORA, plazos: PLAZOS_EN_DIAS }
}
const decisionDe = async (filasCola: Fila[]) => (await leerTrabajosHechos(ctx(filasCola))).lineas.find((l) => l.ref === 'client_historical_outputs:a')?.decision_del_dueno?.decision

describe('una pieza VENCIDA por la oficina no es un rechazo del dueño', () => {
  it('un rechazo de verdad del dueño sigue contando como rechazo', async () => {
    expect(await decisionDe([cola({ decision: { motivo: 'no me gusta' } })])).toBe('rechazada')
  })
  it('la pieza vencida (decision.vencida = true) NO cuenta como decisión del dueño', async () => {
    expect(await decisionDe([cola({ decision: { vencida: true }, resolution_notes: 'no aprobada antes de su fecha; no se publica' })])).toBeUndefined()
  })
  it('y no aparece entre las decisiones del aprobador', async () => {
    const vencida = await leerDecisionesDeLaCola(ctx([cola({ decision: { vencida: true } })]))
    expect(vencida.lineas).toEqual([])
    const real = await leerDecisionesDeLaCola(ctx([cola({ decision: {} })]))
    expect(real.lineas).toHaveLength(1)
  })
  it('si Emilio aprobó después de una vencida (otra fila), manda la aprobación', async () => {
    expect(await decisionDe([cola({ decision: { vencida: true }, resolved_at: '2026-10-11T09:00:00Z' }), cola({ id: 'q2', status: 'approved', decision: {}, resolved_at: '2026-10-11T10:00:00Z' })])).toBe('aprobada')
  })
})
