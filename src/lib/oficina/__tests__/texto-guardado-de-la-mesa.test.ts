// 11-nov (#1014 · relectura) · el texto que una mesa de la cadena dejó en su encargo, leído sin llamar al agente. Base simulada: US$ 0, sin red.
import { describe, expect, it } from 'vitest'
import { textoGuardadoDeLaMesa } from '../mesa/de-la-cadena'

const base = (r: { data: unknown; error: unknown } | 'lanza') => {
  const vistas: Array<[string, ...unknown[]]> = []
  const q: any = {}
  for (const m of ['select', 'eq']) q[m] = (...a: unknown[]) => { vistas.push([m, ...a]); return q }
  q.maybeSingle = async () => { if (r === 'lanza') throw new Error('caída'); return r }
  return { vistas, db: { from: (t: string) => { vistas.push(['from', t]); return q } } }
}
const conTexto = (t: unknown) => ({ data: { estado_del_motor: { artefactos: { mesa: { datos: { pieza_texto: t } } } } }, error: null })

describe('textoGuardadoDeLaMesa', () => {
  it('🔴 sale de `estado_del_motor.artefactos.mesa.datos.pieza_texto` del encargo pedido por su id', async () => {
    const b = base(conTexto('f1 · reubicar · 2026-12-07 · r'))
    expect(await textoGuardadoDeLaMesa(b.db, 'enc-9')).toEqual({ ok: true, texto: 'f1 · reubicar · 2026-12-07 · r' })
    expect(b.vistas).toContainEqual(['from', 'oficina_encargos'])
    expect(b.vistas).toContainEqual(['select', 'estado_del_motor'])
    expect(b.vistas).toContainEqual(['eq', 'id', 'enc-9'])
  })
  it.each([
    ['sin encargo', { data: null, error: null }],
    ['sin artefacto', { data: { estado_del_motor: {} }, error: null }],
    ['texto en blanco', conTexto('   ')],
    ['texto que no es texto', conTexto(42)],
  ])('🔴 %s ⇒ no hay texto (ok, null)', async (_n, r) => {
    expect(await textoGuardadoDeLaMesa(base(r).db, 'enc-9')).toEqual({ ok: true, texto: null })
  })
  // 🟡 CC7 punto 4 · un error de la base NO es «no hay texto»: la relectura tiene que poder volver a probar
  it('🔴 error de la base ⇒ ok: false con su motivo (aunque traiga datos)', async () => {
    expect(await textoGuardadoDeLaMesa(base({ data: conTexto('f1 · reubicar').data, error: { message: 'tiempo agotado' } }).db, 'enc-9')).toEqual({ ok: false, motivo: 'tiempo agotado' })
  })
  it('🔴 si la base lanza, ok: false (nunca lanza)', async () => {
    expect(await textoGuardadoDeLaMesa(base('lanza').db, 'enc-9')).toEqual({ ok: false, motivo: 'caída' })
  })
})
