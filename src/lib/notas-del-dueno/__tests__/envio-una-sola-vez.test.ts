/**
 * Una nota se envía al cerebro UNA sola vez aunque varias peticiones de Slack la recojan a la vez (prueba viva del 29-oct: 1 comentario → 3 fichas). US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { enviarNotaAlCerebro, reintentarPendientes } from '../adaptadores'

const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const HITL = '22222222-2222-4222-8222-222222222222'
const nota = { id: '66666666-6666-4666-8666-000000000001', client_id: CLIENTE, alcance: 'cliente' as const, tipo: 'comentario' as const, comentario: 'la 4 muy genérica', hitl_id: HITL, output_id: null, pieza_titulo: 'T', pieza_version: null, pieza_familia: null, origen: 'slack' as const, autor: 'U1', clave_unica: 'k1' }
const ctx = { ts: '1.1', canal_slack: 'C1', respondido_en: '2026-10-29T18:00:00.000Z' }
const env = { baseUrl: 'https://t.test', internalKey: 'k', alCerebro: true }

function mundo() {
  const db = new DbFalsa().semilla('notas_del_dueno', [{ ...nota, creada_en: '2026-10-29T18:00:00.000Z' }]).semilla('notas_del_dueno_envios', [{ nota_id: nota.id, estado: 'pendiente', intentos: 0, proximo_intento: null, ts: ctx.ts, canal_slack: ctx.canal_slack, respondido_en: ctx.respondido_en, actualizada_en: '2026-10-29T18:00:00.000Z' }])
  let llamadas = 0
  const f = (async () => { llamadas++; await new Promise((r) => setTimeout(r, 15)); return new Response(JSON.stringify({ ok: true }), { status: 200 }) }) as unknown as typeof fetch
  return { db, f, llamadas: () => llamadas }
}

describe('un envío a la vez por nota', () => {
  it('cuatro recogidas simultáneas de la misma nota pendiente → UNA sola llamada a la puerta', async () => {
    const m = mundo()
    const r = await Promise.all([1, 2, 3, 4].map(() => enviarNotaAlCerebro(m.db as never, env, m.f, nota, ctx)))
    expect(m.llamadas()).toBe(1)
    expect(r.filter((x) => x === 'enviada')).toHaveLength(1)
    expect(m.db.tablas['notas_del_dueno_envios'][0]).toMatchObject({ estado: 'enviada', intentos: 1 })
  })
  it('el reintentador y un envío nuevo a la vez tampoco duplican', async () => {
    const m = mundo()
    await Promise.all([reintentarPendientes(m.db as never, env, m.f), reintentarPendientes(m.db as never, env, m.f), enviarNotaAlCerebro(m.db as never, env, m.f, nota, ctx)])
    expect(m.llamadas()).toBe(1)
  })
  it('una nota ya enviada no se vuelve a enviar; y una reservada (en curso) espera su turno sin gastar intentos', async () => {
    const m = mundo()
    await enviarNotaAlCerebro(m.db as never, env, m.f, nota, ctx)
    expect(await enviarNotaAlCerebro(m.db as never, env, m.f, nota, ctx)).toBe('enviada')
    expect(m.llamadas()).toBe(1)
    const k = mundo()
    k.db.tablas['notas_del_dueno_envios'][0].proximo_intento = new Date(Date.now() + 120_000).toISOString()
    expect(await enviarNotaAlCerebro(k.db as never, env, k.f, nota, ctx)).toBe('pendiente')
    expect(k.llamadas()).toBe(0)
    expect(k.db.tablas['notas_del_dueno_envios'][0].intentos).toBe(0)
  })
  it('si el proceso murió a medias, pasado el arriendo la nota se vuelve a enviar', async () => {
    const m = mundo()
    m.db.tablas['notas_del_dueno_envios'][0].proximo_intento = new Date(Date.now() - 1000).toISOString()
    expect(await enviarNotaAlCerebro(m.db as never, env, m.f, nota, ctx)).toBe('enviada')
    expect(m.llamadas()).toBe(1)
  })
})
