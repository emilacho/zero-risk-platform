/**
 * P2 (16-oct) · PAUSAR SOLO AL CLIENTE CON PROBLEMA. US$ 0 · base falsa. Antes un problema de UN cliente apagaba el flujo de TODOS (pasó el 15-oct y el 16-oct).
 * Ahora: el cliente con problema se pausa (dato), el flujo sigue para los demás, el aviso lo nombra, y se reanuda por dato. El flujo entero solo se apaga si el problema no es de un cliente
 * o es común a varios (algo del sistema).
 */
import { describe, expect, it } from 'vitest'
import { clientesActivos } from '../clientes'
import { rutaPausasAbiertas, rutaReanudar } from '../pausas'
import { PAUSAS_COMUNES_PARA_APAGAR, lineaDePausa, rutaVigilar, type DepsDelVigilante } from '../vigilante'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = 'ogfq56oIEoHufFPM'
const REAL = { dry_run: false, workflow_id: WF, workflow_execution_id: 'ex-1' }
const dia = AHORA.toISOString().slice(0, 10)
const juntos = (n = 10): T => {
  const out: T = {}
  for (const c of DIEZ_CLIENTES.slice(0, n)) for (const [k, v] of Object.entries(tablasDe(c))) (out[k] ??= []).push(...v)
  // todos corrieron hoy y están sanos
  for (const c of DIEZ_CLIENTES.slice(0, n)) (out.cerebro_portero_corridas ??= []).push({ id: `r-${c.id}`, client_id: c.id, dia, estado: 'hecha', resumen: {} })
  out.cerebro_pausas = []
  out.cerebro_portero_pausas = []
  return out
}
const cierreDe = (ids: string[], malos: string[] = []) => ({ fin: malos.length ? 'con_errores' : 'hecho', clientes: ids.map((id) => ({ cliente: id, errores: malos.includes(id) ? ['boom'] : [], puente: { quedan: 0, vueltas: 0, falla: null }, alimentar: 'hecha', plan_fallo: null })) })
function montar(t: T, o: { apagarOk?: boolean } = {}) {
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  const apagados: string[] = [], avisos: string[] = []
  const deps: DepsDelVigilante = {
    db: base.db, interruptores: ON, ahora: AHORA, esperar: async () => {},
    apagar: async (w) => { apagados.push(w); return { ok: o.apagarOk !== false, detalle: 'flujo desactivado' } },
    avisar: async (x) => { avisos.push(x); return { ok: true, detalle: 'entregado' } },
  }
  return { base, deps, apagados, avisos }
}
// la ejecución de UN cliente (el flujo corre una por cliente y llama al vigilante con su client_id)
const vigilarA = (m: ReturnType<typeof montar>, id: string, malos: string[] = []) => rutaVigilar(m.deps, { ...REAL, client_id: id, cierre: cierreDe(DIEZ_CLIENTES.map((c) => c.id), malos) })

describe('un cliente con problema se pausa; el flujo sigue para los demás', () => {
  it('el cliente 7 falla: queda pausado y nombrado; el flujo NO se apaga; los otros nueve siguen activos', async () => {
    const t = juntos()
    const m = montar(t)
    const malo = DIEZ_CLIENTES[6]
    const r = await vigilarA(m, malo.id, [malo.id])
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(false)
    expect(m.apagados).toEqual([])
    expect(r.body.pausados).toEqual([{ client_id: malo.id, nombre: malo.nombre, ya_estaba: false }])
    expect(t.cerebro_portero_pausas).toHaveLength(1)
    expect(t.cerebro_portero_pausas[0]).toMatchObject({ client_id: malo.id, workflow_id: WF })
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toContain(`PAUSADO solo para ${malo.nombre}`)
    expect(m.avisos[0]).toMatch(/los demás clientes siguen/)
    expect(m.avisos[0]).not.toMatch(/APAGADO/)
    // el flujo de mañana: la lista de clientes activos ya no lo trae, con su motivo; los otros nueve sí
    const act = await clientesActivos(crearBaseFalsa(t as never).db)
    expect(act.ok).toBe(true)
    if (!act.ok) return
    expect(act.datos.clientes).toHaveLength(9)
    expect(act.datos.clientes.some((c) => c.client_id === malo.id)).toBe(false)
    expect(act.datos.excluidos).toEqual([{ client_id: malo.id, motivos: [expect.stringMatching(/^pausado por el vigilante \(desde 2026-10-15T15:00Z: /)] }])
  })
  it('los demás clientes, vigilados después, no tienen problema (el flujo siguió)', async () => {
    const t = juntos()
    const m = montar(t)
    await vigilarA(m, DIEZ_CLIENTES[6].id, [DIEZ_CLIENTES[6].id])
    for (const c of DIEZ_CLIENTES.filter((x) => x.id !== DIEZ_CLIENTES[6].id)) {
      const r = await vigilarA(m, c.id)
      expect(r.body.ok, c.nombre).toBe(true)
    }
    expect(m.apagados).toEqual([])
    expect(m.avisos).toHaveLength(1)
  })
  it('un cliente ya pausado no se duplica ni avisa otra vez', async () => {
    const t = juntos()
    const m = montar(t)
    const malo = DIEZ_CLIENTES[2]
    await vigilarA(m, malo.id, [malo.id])
    const otra = await vigilarA(m, malo.id, [malo.id])
    expect(t.cerebro_portero_pausas).toHaveLength(1)
    expect(otra.body.pausados).toEqual([expect.objectContaining({ ya_estaba: true })])
    expect(m.avisos).toHaveLength(1)
  })
  it('un problema que no es de un cliente (ninguno activo) sí apaga el flujo, como antes', async () => {
    const t = juntos()
    t.clients = []
    const m = montar(t)
    const r = await rutaVigilar(m.deps, { ...REAL, cierre: cierreDe([]) })
    expect(m.apagados).toEqual([WF])
    expect(r.body.apagado).toMatchObject({ ok: true })
    expect(m.avisos[0]).toMatch(/APAGADO/)
  })
  it('un problema COMÚN a varios clientes (misma causa en tres) es del sistema: se apaga el flujo y el aviso es uno', async () => {
    const t = juntos()
    const m = montar(t)
    const malos = DIEZ_CLIENTES.slice(0, PAUSAS_COMUNES_PARA_APAGAR)
    for (let i = 0; i < malos.length; i++) {
      const r = await vigilarA(m, malos[i].id, [malos[i].id])
      if (i < PAUSAS_COMUNES_PARA_APAGAR - 1) expect(r.body.apagado).toBeUndefined()
      else expect(r.body.apagado).toMatchObject({ ok: true })
    }
    expect(m.apagados).toEqual([WF])
    expect(m.avisos).toHaveLength(PAUSAS_COMUNES_PARA_APAGAR)
    expect(m.avisos[PAUSAS_COMUNES_PARA_APAGAR - 1]).toMatch(/APAGADO/)
  })
  it('problemas distintos (cada cliente el suyo) NO se vuelven «del sistema»', async () => {
    const t = juntos()
    const m = montar(t)
    // gasto distinto por cliente = causas distintas; el texto del problema incluye la cifra
    t.cerebro_portero_pausas.push(
      { id: 'a', client_id: DIEZ_CLIENTES[0].id, motivo: 'gasto del día US$ 11.00 > 10.00', desde: AHORA.toISOString(), levantada_en: null },
      { id: 'b', client_id: DIEZ_CLIENTES[1].id, motivo: 'no hay rastro de la corrida de hoy', desde: AHORA.toISOString(), levantada_en: null },
      { id: 'c', client_id: DIEZ_CLIENTES[3].id, motivo: 'el puente falló: ingest-source 502', desde: AHORA.toISOString(), levantada_en: null },
    )
    const r = await vigilarA(m, DIEZ_CLIENTES[6].id, [DIEZ_CLIENTES[6].id])
    expect(r.body.apagado).toBeUndefined()
    expect(m.apagados).toEqual([])
  })
  it('la misma causa con cifras distintas («el puente dejó 3 / 5 / 7 pendientes») cuenta como la misma: es del sistema', async () => {
    const t = juntos()
    const m = montar(t)
    const hace = AHORA.toISOString()
    t.cerebro_portero_pausas.push(
      { id: 'a', client_id: DIEZ_CLIENTES[0].id, motivo: 'el puente dejó 3 pendiente(s)', desde: hace, levantada_en: null },
      { id: 'b', client_id: DIEZ_CLIENTES[1].id, motivo: 'el puente dejó 5 pendiente(s)', desde: hace, levantada_en: null },
    )
    const malo = DIEZ_CLIENTES[6]
    const cierre = { fin: 'hecho', clientes: DIEZ_CLIENTES.map((c) => ({ cliente: c.id, errores: [], puente: { quedan: c.id === malo.id ? 7 : 0, vueltas: 1, falla: null }, alimentar: 'hecha', plan_fallo: null })) }
    const r = await rutaVigilar(m.deps, { ...REAL, client_id: malo.id, cierre })
    expect(r.body.apagado).toMatchObject({ ok: true })
    expect(m.apagados).toEqual([WF])
  })
  it('si no se puede registrar la pausa se DICE y se apaga el flujo (ante la duda, seguridad)', async () => {
    const t = juntos()
    const base = crearBaseFalsa(t as never, { fallaEn: 'cerebro_portero_pausas', saltar: 0 } as never)
    const apagados: string[] = [], avisos: string[] = []
    const deps: DepsDelVigilante = { db: base.db, interruptores: ON, ahora: AHORA, esperar: async () => {}, apagar: async (w) => { apagados.push(w); return { ok: true, detalle: 'ok' } }, avisar: async (x) => { avisos.push(x); return { ok: true, detalle: 'ok' } } }
    const malo = DIEZ_CLIENTES[4]
    const r = await rutaVigilar(deps, { ...REAL, client_id: malo.id, cierre: cierreDe(DIEZ_CLIENTES.map((c) => c.id), [malo.id]) })
    expect(r.body.apagado).toBeDefined()
    expect(JSON.stringify(r.body.clientes)).toMatch(/registrar la pausa/)
    expect(avisos[0]).toMatch(/APAGADO/)
  })
  it('dry_run no pausa nada', async () => {
    const t = juntos()
    const m = montar(t)
    const malo = DIEZ_CLIENTES[1]
    await rutaVigilar(m.deps, { dry_run: true, client_id: malo.id, cierre: cierreDe(DIEZ_CLIENTES.map((c) => c.id), [malo.id]) })
    expect(t.cerebro_portero_pausas).toHaveLength(0)
    expect(m.avisos).toEqual([])
  })
  it('la línea del aviso nombra a cada cliente y dice cómo se reanuda', () => {
    const l = lineaDePausa([{ client_id: 'x', nombre: 'Cliente Uno', problemas: ['a'], gasto_usd: 0 }, { client_id: 'y', nombre: 'Cliente Dos', problemas: ['b'], gasto_usd: 0 }], WF, 2)
    expect(l).toMatch(/PAUSADO solo para Cliente Uno, Cliente Dos: a \(\+1 cliente\(s\) más\) · falló 2 veces · los demás clientes siguen/)
    expect(l).toContain('/api/brain/alimentar/reanudar')
    expect(l).not.toMatch(/\n/)
  })
})

describe('reanudar es un dato, no un clic en n8n', () => {
  it('reanudar levanta la pausa con su motivo y quién; el cliente vuelve a la lista; la historia se conserva', async () => {
    const t = juntos()
    const m = montar(t)
    const malo = DIEZ_CLIENTES[7]
    await vigilarA(m, malo.id, [malo.id])
    const lista = await rutaPausasAbiertas({ db: m.base.db as never })
    expect(lista.body.pausados).toEqual([expect.objectContaining({ client_id: malo.id })])
    expect((await rutaReanudar({ db: m.base.db as never, ahora: AHORA }, { client_id: malo.id, ...REAL, motivo: 'se arregló el puente', por: 'empleado técnico' })).body).toMatchObject({ ok: true, reanudado: true })
    expect(t.cerebro_portero_pausas).toHaveLength(1)
    expect(t.cerebro_portero_pausas[0]).toMatchObject({ levantada_por: 'empleado técnico', motivo_de_levantarla: 'se arregló el puente' })
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeTruthy()
    const act = await clientesActivos(crearBaseFalsa(t as never).db)
    expect(act.ok && act.datos.clientes).toHaveLength(10)
    expect((await rutaReanudar({ db: m.base.db as never }, { client_id: malo.id, ...REAL, motivo: 'x', por: 'y' })).body).toMatchObject({ ya_activo: true })
    // y si vuelve a fallar, se pausa de nuevo (nueva fila)
    await vigilarA(m, malo.id, [malo.id])
    expect(t.cerebro_portero_pausas).toHaveLength(2)
  })
  it('exige motivo y quién; dry_run no levanta', async () => {
    const t = juntos()
    const m = montar(t)
    const malo = DIEZ_CLIENTES[0]
    await vigilarA(m, malo.id, [malo.id])
    expect((await rutaReanudar({ db: m.base.db as never }, { client_id: malo.id, ...REAL, motivo: '', por: 'x' })).status).toBe(400)
    expect((await rutaReanudar({ db: m.base.db as never }, { client_id: malo.id, ...REAL, dry_run: true, motivo: 'x', por: 'y' })).body).toMatchObject({ dry_run: true })
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeUndefined()
  })
})

describe('antes de aplicar la migración nada se rompe', () => {
  it('sin la tabla de pausas, la lista de clientes activos sigue funcionando (sin pausas); cualquier otro error se dice', async () => {
    const t = juntos()
    const sinTabla = { from: (n: string) => { const q = crearBaseFalsa(t as never).db.from(n); if (n === 'cerebro_portero_pausas') return { select: () => ({ is: () => ({ limit: async () => ({ data: null, error: { message: "Could not find the table 'public.cerebro_portero_pausas' in the schema cache" } }) }) }) }; return q } }
    const act = await clientesActivos(sinTabla as never)
    expect(act.ok && act.datos.clientes).toHaveLength(10)
    const otroError = { from: (n: string) => { const q = crearBaseFalsa(t as never).db.from(n); if (n === 'cerebro_portero_pausas') return { select: () => ({ is: () => ({ limit: async () => ({ data: null, error: { message: 'timeout' } }) }) }) }; return q } }
    expect(await clientesActivos(otroError as never)).toMatchObject({ ok: false })
  })
})
