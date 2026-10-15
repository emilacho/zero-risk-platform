/** La alarma de «no corrió» (15-oct): silencio cuando la corrida de hoy existe y está hecha; UNA línea cuando no; sin repetir cada día. US$ 0 · sin red. */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from './base-falsa'
import { avisarAAlertas, estadoDelFlujoDelPortero } from '../avisos'
import { DIAS_EN_QUE_SE_AVISA, rutaNoCorrio, type DepsDeNoCorrio, type EstadoDelFlujo } from '../no-corrio'
import { GET, POST } from '../../../app/api/brain/alimentar/no-corrio/route'

const C = '99999999-9999-4999-8999-999999999999'
const WF = 'ogfq56oIEoHufFPM'
const HOY = new Date('2026-10-15T14:00:00Z')
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const fila = (dia: string, estado: string, resumen: Record<string, unknown> = {}) => ({ id: `r-${dia}`, client_id: C, dia, estado, resumen })

function montar(corridas: unknown[], o: { flujo?: EstadoDelFlujo; avisarOk?: boolean; fallaEn?: string; interruptores?: typeof ON } = {}) {
  const base = crearBaseFalsa({
    clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
    client_brand_books: [{ id: 'mb', client_id: C }],
    client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    cerebro_portero_corridas: corridas,
  } as never, { fallaEn: o.fallaEn })
  const avisos: string[] = []
  let lecturasDelFlujo = 0
  const deps: DepsDeNoCorrio = {
    db: base.db, interruptores: o.interruptores ?? ON, ahora: HOY, workflowId: WF,
    estadoDelFlujo: async () => { lecturasDelFlujo++; return o.flujo ?? { ok: true, activo: true } },
    avisar: async (t) => { avisos.push(t); return { ok: o.avisarOk !== false, detalle: o.avisarOk === false ? 'Slack rechazó' : 'entregado' } },
  }
  return { base, avisos, deps, lecturas: () => lecturasDelFlujo }
}
const REAL = { dry_run: false }

describe('corrió bien = silencio', () => {
  it('la corrida de hoy existe y está hecha ⇒ ningún aviso ni lectura del flujo', async () => {
    const m = montar([fila('2026-10-15', 'hecha')])
    const r = await rutaNoCorrio(m.deps, REAL)
    expect(r.status).toBe(200); expect(r.body.ok).toBe(true)
    expect(m.avisos).toEqual([]); expect(m.lecturas()).toBe(0)
    expect(r.body.clientes).toMatchObject([{ veredicto: 'corrio' }])
  })
})

describe('no corrió ⇒ UNA línea a #alertas', () => {
  it('no hay corrida de hoy y ayer sí hubo (primer día sin corrida) ⇒ avisa, con el estado del flujo', async () => {
    const m = montar([fila('2026-10-14', 'hecha')])
    const r = await rutaNoCorrio(m.deps, REAL)
    expect(r.status).toBe(200); expect(r.body.ok).toBe(false)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/Cliente Zeta: hoy no hay corrida \(1 día\(s\) sin corrida; el flujo está activo pero no dejó rastro: no disparó o murió a medias\)/)
    expect(m.avisos[0]).toContain(WF)
  })
  it('el flujo está inactivo por otra razón (nadie lo apagó el vigilante) ⇒ avisa y lo dice', async () => {
    const m = montar([fila('2026-10-14', 'hecha')], { flujo: { ok: true, activo: false } })
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos[0]).toMatch(/el flujo está INACTIVO/)
  })
  it('n8n no responde ⇒ avisa igual y dice que no pudo leer el flujo (no esconde el hueco)', async () => {
    const m = montar([fila('2026-10-14', 'hecha')], { flujo: { ok: false, detalle: 'n8n respondió 502' } })
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/no pude leer el estado del flujo/)
  })
  it('hoy existe pero NO está hecha y el vigilante no avisó ⇒ avisa', async () => {
    const m = montar([fila('2026-10-15', 'parcial')])
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/quedó «parcial» y nadie avisó/)
  })
  it('nunca ha corrido (sin ningún rastro) ⇒ avisa', async () => {
    const m = montar([])
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/nunca ha corrido/)
  })
  it('si Slack rechaza el aviso ⇒ 502 (no se da por avisado)', async () => {
    const m = montar([fila('2026-10-14', 'hecha')], { avisarOk: false })
    const r = await rutaNoCorrio(m.deps, REAL)
    expect(r.status).toBe(502)
    expect(r.body.aviso).toMatchObject({ ok: false })
  })
  it('la base no responde ⇒ avisa que no pudo comprobar (el silencio por error no es silencio)', async () => {
    const m = montar([], { fallaEn: 'cerebro_portero_corridas' })
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/no pude comprobar el rastro/)
  })
  it('la lista de clientes no se puede leer ⇒ avisa', async () => {
    const m = montar([fila('2026-10-15', 'hecha')], { fallaEn: 'clients' })
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/no pude comprobar si corrió hoy/)
  })
})

describe('sin repetir el aviso cada día', () => {
  it('el vigilante apagó el flujo y avisó (ayer) y el flujo sigue inactivo ⇒ silencio: UN aviso por apagado', async () => {
    const m = montar([fila('2026-10-14', 'con_errores', { vigilante: { ok: false, problemas: ['x'] } })], { flujo: { ok: true, activo: false } })
    const r = await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toEqual([])
    expect(r.body.clientes).toMatchObject([{ veredicto: 'ya_avisado' }])
  })
  it('hoy la corrida quedó con_errores y el vigilante ya avisó ⇒ silencio', async () => {
    const m = montar([fila('2026-10-15', 'con_errores', { vigilante: { ok: false, problemas: ['x'] } })])
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toEqual([])
  })
  it('apagado por el vigilante pero alguien reactivó el flujo y aun así no corre ⇒ sigue la regla de la racha (avisa el primer día)', async () => {
    const m = montar([fila('2026-10-14', 'con_errores', { vigilante: { ok: false, problemas: ['x'] } })], { flujo: { ok: true, activo: true } })
    await rutaNoCorrio(m.deps, REAL)
    expect(m.avisos).toHaveLength(1)
  })
  it('racha: se avisa el día 1 y UN recordatorio el día 4; los días 2, 3, 5 y 6 en silencio', async () => {
    const resultado: Record<number, number> = {}
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const ultimo = new Date(HOY.getTime() - n * 86_400_000).toISOString().slice(0, 10)
      const m = montar([fila(ultimo, 'hecha')])
      await rutaNoCorrio(m.deps, REAL)
      resultado[n] = m.avisos.length
    }
    expect(resultado).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0 })
    expect([...DIAS_EN_QUE_SE_AVISA]).toEqual([1, 4])
  })
  it('no escribe NADA en la base (una fila marcadora bloquearía la corrida de hoy con ya_corrio_hoy)', async () => {
    const m = montar([fila('2026-10-14', 'hecha')])
    await rutaNoCorrio(m.deps, REAL)
    expect(m.base.escrituras).toEqual([])
  })
})

describe('entrada y salidas', () => {
  it('dry_run (por omisión) evalúa y NO avisa', async () => {
    const m = montar([fila('2026-10-14', 'hecha')])
    const r = await rutaNoCorrio(m.deps, {})
    expect(r.body.ok).toBe(false); expect(r.body.dry_run).toBe(true)
    expect(m.avisos).toEqual([])
  })
  it('con el portero apagado a propósito (PORTERO_ALIMENTAR off) no revisa ni avisa', async () => {
    const m = montar([], { interruptores: { ...ON, alimentar: false } })
    const r = await rutaNoCorrio(m.deps, REAL)
    expect(r.body.apagado).toBe(true); expect(m.avisos).toEqual([])
  })
  it('varios clientes sin corrida ⇒ UN solo mensaje (con «+1 más»)', async () => {
    const C2 = '88888888-8888-4888-8888-888888888888'
    const base = crearBaseFalsa({
      clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }, { id: C2, name: 'Cliente Beta', status: 'active', archived_at: null, config: {} }],
      client_brand_books: [{ id: 'mb', client_id: C }, { id: 'mb2', client_id: C2 }],
      client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }, { id: 'pl2', client_id: C2, output_type: 'campaign_plan_90d', provenance_tag: {} }],
      cerebro_portero_corridas: [],
    } as never)
    const avisos: string[] = []
    const r = await rutaNoCorrio({ db: base.db, interruptores: ON, ahora: HOY, workflowId: WF, estadoDelFlujo: async () => ({ ok: true, activo: true }), avisar: async (t) => { avisos.push(t); return { ok: true, detalle: 'entregado' } } }, REAL)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain("(+1 más)")
    expect(r.status).toBe(200)
  })
  it('la ruta rechaza sin llave (401) tanto en GET como en POST', async () => {
    const g = await GET(new Request('http://x/api/brain/alimentar/no-corrio'))
    const p = await POST(new Request('http://x/api/brain/alimentar/no-corrio', { method: 'POST', body: '{}' }))
    expect(g.status).toBe(401); expect(p.status).toBe(401)
  })
  it('estadoDelFlujoDelPortero: lee activo / inactivo / error sin cambiar nada', async () => {
    const llamadas: string[] = []
    const con = (body: unknown, status = 200) => estadoDelFlujoDelPortero({ base: 'https://n8n.test', llave: 'k', fetchImpl: async (u, i) => { llamadas.push(`${i?.method ?? 'GET'} ${u}`); return new Response(JSON.stringify(body), { status }) } })
    expect(await con({ active: true })(WF)).toEqual({ ok: true, activo: true })
    expect(await con({ active: false })(WF)).toEqual({ ok: true, activo: false })
    expect(await con({}, 500)(WF)).toMatchObject({ ok: false })
    expect(await con({ active: true }, 500)(WF)).toMatchObject({ ok: false }) // n8n con error aunque el cuerpo diga activo: no se cree
    expect(await con({ nombre: 'x' })(WF)).toMatchObject({ ok: false })
    expect(await estadoDelFlujoDelPortero({ base: '', llave: '' })(WF)).toMatchObject({ ok: false })
    expect(llamadas.every((l) => l.startsWith('GET '))).toBe(true)
  })
  it('avisarAAlertas sigue siendo el canal de alertas', async () => {
    let cuerpo = ''
    const av = avisarAAlertas({ token: 't', fetchImpl: async (_u, i) => { cuerpo = String(i?.body); return new Response(JSON.stringify({ ok: true })) } })
    expect((await av('hola')).ok).toBe(true)
    expect(cuerpo).toContain('C0B7XUUEBHA')
  })
  it('vercel.json programa la alarma a las 14:00 UTC, después de la corrida de las 12:30', async () => {
    const { readFileSync } = await import('node:fs')
    const cfg = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    expect(cfg.crons).toContainEqual({ path: '/api/brain/alimentar/no-corrio', schedule: '0 14 * * *' })
  })
})
