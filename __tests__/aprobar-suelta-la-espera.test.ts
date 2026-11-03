/**
 * 3-nov · ajuste de Emilio, 14:49Z: «pausas que se quitan cuando yo hago las aprobaciones». El alta deja guardado su sobre; aprobar lo suelta una sola vez.
 * Sin red: la sala es un `fetch` falso y la base, la de pruebas.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { guardarEsperaDelManual, soltarEsperaYPedirPlan, type BaseDeEsperas } from '../src/lib/manual/pedir-plan'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const AHORA = new Date('2026-11-03T16:00:00Z')
const SOBRE = { source: 'alta/journey-completed', intent: 'planear', idempotency_key: 'j1:planear', payload: { corrida: 'j1:planear', client_id: C } }
const sala = (cuerpo: Record<string, unknown> = { ok: true, kind: 'accepted', event_id: 'e1' }) => vi.fn(async (_u: string, _i: { body: string }) => ({ ok: true, status: 200, json: async () => cuerpo }))
const entorno = (f: ReturnType<typeof sala>) => ({ url: 'https://x', llave: 'k', fetchImpl: f as never })
const pedido = (manual_id = 'v2') => ({ client_id: C, manual_id, reviewer: 'emilio', ahora: AHORA })
const enviado = (f: ReturnType<typeof sala>, n = 0) => JSON.parse(f.mock.calls[n][1].body) as { idempotency_key: string }
function base(filas: Array<Record<string, unknown>> = [{ id: 'e1', client_id: C, tipo: 'manual', clave: 'j1:planear', sobre: SOBRE, estado: 'esperando', manual_id: null, creado_en: '2026-11-03T10:00:00Z' }]) {
  const db = new DbFalsa()
  db.semilla('esperas_del_dueno', filas)
  return db
}
const fila = (db: DbFalsa, id = 'e1') => db.tablas['esperas_del_dueno'].find((f) => f.id === id)!

describe('aprobar suelta la espera', () => {
  it('🔴 manda el sobre que el alta dejó guardado, con su clave, y la espera queda soltada', async () => {
    const db = base(), f = sala()
    expect(await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))).toMatchObject({ pedido: true, repetido: false })
    expect(f).toHaveBeenCalledTimes(1)
    expect(enviado(f).idempotency_key).toBe('j1:planear')
    expect(fila(db)).toMatchObject({ estado: 'soltada', manual_id: 'v2', soltada_por: 'emilio', despertado: true })
  })

  it('🔴 el doble clic repite el MISMO sobre: la clave hace que sea un solo plan', async () => {
    const db = base(), f = sala()
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    expect(f).toHaveBeenCalledTimes(2)
    expect(enviado(f, 1).idempotency_key).toBe(enviado(f, 0).idempotency_key)
  })

  it('🔴 si la sala falla, queda dicho, y aprobar otra vez reintenta con el mismo sobre', async () => {
    const db = base(), malo = sala({ ok: false, code: 'caida' })
    expect(await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(malo))).toMatchObject({ pedido: false })
    expect(fila(db)).toMatchObject({ estado: 'soltada', despertado: false, despertar_detalle: expect.stringContaining('caida') })
    const bueno = sala()
    expect(await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(bueno))).toMatchObject({ pedido: true })
    expect(enviado(bueno).idempotency_key).toBe('j1:planear')
    expect(fila(db)).toMatchObject({ despertado: true })
  })

  it('🔴 sin espera (el alta ya terminó, como Náufrago) pide el plan por versión del manual', async () => {
    const f = sala()
    expect(await soltarEsperaYPedirPlan(base([]) as BaseDeEsperas, pedido(), entorno(f))).toMatchObject({ pedido: true })
    expect(enviado(f).idempotency_key).toBe('manual:v2:planear')
  })

  it('🔴 un manual nuevo, con la espera ya soltada por otro, pide por su versión y no repite el sobre viejo', async () => {
    const db = base([{ id: 'e1', client_id: C, tipo: 'manual', clave: 'j1:planear', sobre: SOBRE, estado: 'soltada', manual_id: 'v2', creado_en: '2026-11-03T10:00:00Z' }]), f = sala()
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido('v3'), entorno(f))
    expect(enviado(f).idempotency_key).toBe('manual:v3:planear')
    expect(fila(db).manual_id).toBe('v2')
  })

  it('🔴 con dos altas, suelta la más nueva y la vieja ya no la suelta nadie', async () => {
    const vieja = { id: 'e0', client_id: C, tipo: 'manual', clave: 'j0:planear', sobre: { ...SOBRE, idempotency_key: 'j0:planear' }, estado: 'esperando', creado_en: '2026-11-01T10:00:00Z' }
    const nueva = { id: 'e1', client_id: C, tipo: 'manual', clave: 'j1:planear', sobre: SOBRE, estado: 'esperando', creado_en: '2026-11-03T10:00:00Z' }
    const db = base([vieja, nueva]), f = sala()
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    expect(f).toHaveBeenCalledTimes(1)
    expect(enviado(f).idempotency_key).toBe('j1:planear')
    expect(fila(db, 'e0').estado).toBe('reemplazada')
  })

  it('no toca la espera de otro cliente ni la de otro tipo', async () => {
    const db = base([{ id: 'e1', client_id: 'otro', tipo: 'manual', clave: 'a', sobre: SOBRE, estado: 'esperando', creado_en: '2026-11-03T10:00:00Z' }, { id: 'e2', client_id: C, tipo: 'plan', clave: 'b', sobre: SOBRE, estado: 'esperando', creado_en: '2026-11-03T10:00:00Z' }]), f = sala()
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    expect(fila(db, 'e1').estado).toBe('esperando')
    expect(fila(db, 'e2').estado).toBe('esperando')
    expect(enviado(f).idempotency_key).toBe('manual:v2:planear')
  })

  it('🔴 soltar es atómico: si otro clic la soltó entre la lectura y el cambio, no se pisa ni se manda por otro manual', async () => {
    const db = base(), f = sala()
    let llamadas = 0
    const conOtroClic = { from: (t: string) => { if (++llamadas === 2) Object.assign(fila(db), { estado: 'soltada', manual_id: 'v9' }); return db.from(t) } }
    expect(await soltarEsperaYPedirPlan(conOtroClic as BaseDeEsperas, pedido(), entorno(f))).toMatchObject({ pedido: false })
    expect(fila(db).manual_id).toBe('v9')
    expect(f).not.toHaveBeenCalled()
  })

  it('🔴 si no se puede leer la espera NO pide nada: un error no se lee como «no hay espera»', async () => {
    const f = sala()
    const roto = { from: () => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update']) c[m] = () => c; c.then = (ok: (v: unknown) => void) => ok({ data: null, error: { message: 'caída' } }); return c } }
    expect(await soltarEsperaYPedirPlan(roto, pedido(), entorno(f))).toMatchObject({ pedido: false, error: expect.stringContaining('leer') })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('el alta guarda la espera', () => {
  const cuerpo = (extra: Record<string, unknown> = {}) => ({ client_id: C, tipo: 'manual', sobre: { ...SOBRE, client_id: C }, workflow_id: 'LyVoKcrypS5uLyuu', workflow_execution_id: 'x1', ...extra })
  function conManual(fila: Record<string, unknown>) {
    const db = new DbFalsa()
    db.semilla('esperas_del_dueno', [])
    db.semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, provenance_tag: {} }, { id: 'v2', client_id: C, version: 2, ...fila }])
    return db
  }
  const SIN_APROBAR = { human_validated: false, provenance_tag: {} }
  const APROBADO = { human_validated: true, provenance_tag: { validado_por: 'dueno' } }
  const conflicto = (error: Record<string, unknown>) => ({ from: () => ({ insert: () => ({ select: async () => ({ data: null, error }) }) }) })

  it('🔴 queda esperando con el sobre tal cual, y no llama a nadie', async () => {
    const db = conManual(SIN_APROBAR), f = vi.fn()
    vi.stubGlobal('fetch', f)
    const r = await guardarEsperaDelManual(db as BaseDeEsperas, cuerpo())
    vi.unstubAllGlobals()
    expect(r.cuerpo).toMatchObject({ ok: true, kind: 'guardada' })
    expect(db.tablas['esperas_del_dueno'][0]).toMatchObject({ estado: 'esperando', clave: 'j1:planear', tipo: 'manual', workflow_execution_id: 'x1', sobre: { idempotency_key: 'j1:planear' } })
    expect(f).not.toHaveBeenCalled()
  })

  it('🔴 si el dueño ya aprobó, nace soltada y NO manda nada: el botón ya pidió ese plan', async () => {
    const db = conManual(APROBADO), f = vi.fn()
    vi.stubGlobal('fetch', f)
    const r = await guardarEsperaDelManual(db as BaseDeEsperas, cuerpo())
    vi.unstubAllGlobals()
    expect(r.cuerpo).toMatchObject({ ok: true, kind: 'ya_aprobada' })
    expect(db.tablas['esperas_del_dueno'][0]).toMatchObject({ estado: 'soltada', manual_id: 'v2' })
    expect(f).not.toHaveBeenCalled()
  })

  it('🔴 una validación de la jefatura no cuenta como aprobación', async () => {
    const r = await guardarEsperaDelManual(conManual({ human_validated: false, provenance_tag: { validado_por: 'jefatura' } }) as BaseDeEsperas, cuerpo())
    expect(r.cuerpo).toMatchObject({ kind: 'guardada' })
  })

  it('🔴 la misma alta repetida no crea otra espera ni pisa la que hay', async () => {
    expect((await guardarEsperaDelManual(conflicto({ code: '23505', message: 'duplicada' }), cuerpo())).cuerpo).toMatchObject({ ok: true, kind: 'duplicate' })
  })

  it('🔴 si la base falla lo dice: la guarda del alta debe frenar, no creer que quedó guardada', async () => {
    expect(await guardarEsperaDelManual(conflicto({ code: 'x', message: 'caída' }), cuerpo())).toMatchObject({ status: 502, cuerpo: { ok: false, code: 'no_se_pudo_guardar' } })
  })

  it.each([
    ['sin cliente', { client_id: 'no' }],
    ['otro tipo', { tipo: 'plan' }],
    ['sin sobre', { sobre: null }],
    ['sobre sin clave', { sobre: { client_id: C } }],
    ['sobre de otro cliente', { sobre: { idempotency_key: 'a', client_id: 'otro' } }],
  ])('rechaza %s', async (_n, extra) => {
    const db = conManual(SIN_APROBAR)
    expect((await guardarEsperaDelManual(db as BaseDeEsperas, cuerpo(extra))).status).toBe(400)
    expect(db.tablas['esperas_del_dueno']).toHaveLength(0)
  })

  it('🔴 aprobó antes de que el alta guardara y vuelve a tocar el botón: repite el sobre por versión, no el del alta (CC3: salían dos planes)', async () => {
    const db = conManual(APROBADO), f = sala()
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    expect((await guardarEsperaDelManual(db as BaseDeEsperas, cuerpo())).cuerpo).toMatchObject({ kind: 'ya_aprobada' })
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    expect(f).toHaveBeenCalledTimes(2)
    expect(enviado(f, 0).idempotency_key).toBe('manual:v2:planear')
    expect(enviado(f, 1).idempotency_key).toBe('manual:v2:planear')
  })

  it('🔴 de punta a punta: el alta guarda, el botón suelta y sale un solo sobre con la clave del alta', async () => {
    const db = conManual(SIN_APROBAR), f = sala()
    await guardarEsperaDelManual(db as BaseDeEsperas, cuerpo())
    await soltarEsperaYPedirPlan(db as BaseDeEsperas, pedido(), entorno(f))
    expect(f).toHaveBeenCalledTimes(1)
    expect(enviado(f).idempotency_key).toBe('j1:planear')
    expect(db.tablas['esperas_del_dueno'][0].estado).toBe('soltada')
  })
})

describe('la tabla', () => {
  const sql = readFileSync('supabase/migrations/202611031500_esperas_del_dueno.sql', 'utf8')
  it('🔴 sin permisos no la ve nadie, y la clave impide guardar dos veces el mismo sobre', () => {
    expect(sql).toMatch(/grant select, insert, update on public\.esperas_del_dueno to service_role/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/unique \(tipo, clave\)/)
  })
  it('🔴 sin vencimiento: una espera solo sale al soltarse o al reemplazarse', () => {
    expect(sql).toMatch(/check \(estado in \('esperando', 'soltada', 'reemplazada'\)\)/)
    expect(sql).not.toMatch(/vence|expira|expired/i)
  })
})
