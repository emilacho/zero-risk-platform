/**
 * TOPE DE PRUEBA AUTOMÁTICO (CC#1 · 19-oct): al crear (o reabrir) un encargo el sistema escribe SOLO el `tope_de_prueba` en la semilla; nadie lo carga a mano.
 * limite = la firma registrada (`firma_tope.valor`) o, sin firma válida, el tope del encargo; base = lo cobrado en la oficina financiera a ese cliente; encargo_base = lo cobrado por el encargo.
 * US$ 0: todo simulado.
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { abrirConversacion, avanzar, topeDePruebaAutomatico, topeEfectivoDelEncargo } from '../src/lib/finanzas/conversa/orquestador'
import { almacenDeConversa } from '../src/lib/finanzas/conversa/almacen-supabase'
import type { AlmacenDeConversa, EncargoDeConversa, PedidoAlModelo, PuertosDeConversa, Semilla } from '../src/lib/finanzas/conversa/puertos'
import type { ConfigDeFinanzas } from '../src/lib/finanzas/ruta'

const CLIENTE = 'cliente-prueba'
const PLANTEO = { meta_por_semana: 14, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 1 }], no_se: [] }
const CONFIG_OK: ConfigDeFinanzas = { estado: 'ensayo', clientes_ensayo: [CLIENTE], preguntas_slack: 'apagado', conversa: 'ensayo' }
const FIRMA = { quien: 'Emilio', cuando: '2026-10-19T16:43+02:00', valor: 3.2, papel: '00-meta/FIRMA-EMILIO-2026-10-16-ronda2.md' }

type Libro = { total_usd: number; por_encargo: Record<string, number> } | null
function mundo(opts: { semilla?: Semilla; gasto?: number; libro?: Libro | 'sin_lectura'; guardarFalla?: boolean } = {}) {
  const pedidos: PedidoAlModelo[] = []
  const creados: Array<{ client_id: string; semilla: Semilla }> = []
  const guardados: Semilla[] = []
  const lecturas = { n: 0 }
  const gasto = opts.gasto ?? 0
  const e: EncargoDeConversa = {
    id: 'enc-1', client_id: CLIENTE, estado: 'en_curso', estado_del_motor: { ...estadoInicial(), gasto_usd: gasto }, gasto_usd: gasto, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: opts.semilla ?? {},
  } as unknown as EncargoDeConversa
  const base: AlmacenDeConversa = {
    async crearEncargo(n) { creados.push({ client_id: n.client_id, semilla: structuredClone(n.semilla) }); return { ok: true, encargo: { ...structuredClone(e), semilla: n.semilla }, nuevo: true } },
    async leerEncargo() { return structuredClone(e) },
    async guardar(ch) { e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd; if (ch.estado !== undefined) e.estado = ch.estado },
    async artefactos() { return {} },
    async turnos() { return [] },
    async guardarBuzon(c) { if (opts.guardarFalla) throw new Error('base caída'); if (c.semilla) { guardados.push(structuredClone(c.semilla)); e.semilla = structuredClone(c.semilla) } },
  }
  if (opts.libro !== 'sin_lectura') base.gastoDeLaOficina = async () => { lecturas.n++; return opts.libro === undefined ? { total_usd: 0, por_encargo: {} } : (opts.libro as Libro) }
  const P: PuertosDeConversa = {
    almacen: base,
    modelo: { async invocar(p) { pedidos.push(p); return { ok: true, salida: JSON.stringify(PLANTEO), costo_usd: 0.1 } } },
    slack: { async publicar() { return { ok: false } }, async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts, sin_acceso: 'no_configurado' } } },
    tableros: {} as PuertosDeConversa['tableros'],
    config: async () => CONFIG_OK,
    ahora: () => new Date(1_700_000_000_000),
    canalDelHilo: '', emilio_id: '',
  }
  return { P, pedidos, creados, guardados, lecturas, e }
}
const abrir = (m: ReturnType<typeof mundo>, semilla: Semilla) => abrirConversacion(m.P, { client_id: CLIENTE, dry_run: false, semilla })

describe('la fórmula del tope de prueba · POR PEDIDO', () => {
  it('con firma válida el límite es lo firmado; sin firma, el tope del encargo; mal formada = sin firma', () => {
    // por pedido: la base es lo gastado por el encargo, NO el pasado del cliente (2)
    expect(topeDePruebaAutomatico({ tope_encargo_usd: 3.2, firma_tope: FIRMA }, 2, 0.5)).toEqual({ limite_usd: 3.2, base_usd: 0.5, encargo_base_usd: 0.5 })
    expect(topeDePruebaAutomatico({ firma_tope: FIRMA }, 0, 0).limite_usd).toBe(3.2) // lo firmado manda aunque el tope del encargo sea otro (aquí el de la plantilla, 1,50)
    expect(topeDePruebaAutomatico({ tope_encargo_usd: 2, firma_tope: { ...FIRMA, valor: 2.5 } }, 0, 0).limite_usd).toBe(2.5)
    expect(topeDePruebaAutomatico({}, 0, 0).limite_usd).toBe(1.5) // nunca «sin tope»: el de la plantilla
    expect(topeDePruebaAutomatico({ tope_encargo_usd: 2.5 }, 0, 0).limite_usd).toBe(2.5)
    expect(topeDePruebaAutomatico({ tope_encargo_usd: 9 }, 0, 0).limite_usd).toBe(3) // sin firma, el techo de 3,00
    for (const f of [{ ...FIRMA, quien: '' }, { ...FIRMA, valor: Number.NaN }, { ...FIRMA, papel: ' ' }, null]) {
      expect(topeDePruebaAutomatico({ tope_encargo_usd: 9, firma_tope: f as never }, 0, 0).limite_usd).toBe(3)
    }
  })
  it('el TOTAL del cliente solo con firma_tope_total válida: límite = lo firmado y base = todo lo cobrado al cliente', () => {
    expect(topeDePruebaAutomatico({ firma_tope_total: { ...FIRMA, valor: 5 } }, 4.7519, 3.1456)).toEqual({ limite_usd: 5, base_usd: 4.7519, encargo_base_usd: 3.1456 })
    // mal formada = no hay total: vuelve a por pedido
    for (const f of [{ ...FIRMA, quien: '' }, { ...FIRMA, papel: '' }, { ...FIRMA, valor: Number.POSITIVE_INFINITY }, { ...FIRMA, valor: '5' }, null]) {
      expect(topeDePruebaAutomatico({ firma_tope_total: f as never }, 4.7519, 0)).toEqual({ limite_usd: 1.5, base_usd: 0, encargo_base_usd: 0 })
    }
  })
  it('el caso real: un cliente con 4,7519 cobrados y un encargo NUEVO arranca con holgura = su tope (no negativa)', () => {
    const holgura = (t: ReturnType<typeof topeDePruebaAutomatico>, gastoAhora: number) => t.limite_usd - t.base_usd - Math.max(0, gastoAhora - t.encargo_base_usd)
    expect(holgura(topeDePruebaAutomatico({}, 4.7519, 0), 0)).toBe(1.5)
    expect(holgura(topeDePruebaAutomatico({ tope_encargo_usd: 3.2, firma_tope: FIRMA }, 4.7519, 0), 0)).toBe(3.2)
    expect(holgura(topeDePruebaAutomatico({ tope_encargo_usd: 3.2, firma_tope: FIRMA }, 4.7519, 0), 0.5)).toBeCloseTo(2.7, 9) // y baja con lo que el pedido gasta
  })
  it('lo negativo se vuelve 0 y el tope efectivo del encargo es el de la plantilla si no hay nada', () => {
    expect(topeDePruebaAutomatico({}, -1, -2)).toEqual({ limite_usd: 1.5, base_usd: 0, encargo_base_usd: 0 })
    expect(topeDePruebaAutomatico({ firma_tope_total: FIRMA }, -1, -2)).toEqual({ limite_usd: 3.2, base_usd: 0, encargo_base_usd: 0 })
    expect(topeEfectivoDelEncargo(undefined)).toBe(1.5)
  })
})

describe('al CREAR el encargo', () => {
  it('con firma: el sistema escribe el tope de prueba con lo firmado y lo cobrado al cliente; el resto de la semilla no se toca', async () => {
    const m = mundo({ libro: { total_usd: 2.8314, por_encargo: { otro: 2.8314 } } })
    const semilla: Semilla = { tope_encargo_usd: 3.2, firma_tope: FIRMA, linea_base_por_semana: 7 }
    const r = await abrir(m, semilla)
    expect(r.status).toBe(200)
    expect(m.creados[0].semilla).toEqual({ ...semilla, tope_de_prueba: { limite_usd: 3.2, base_usd: 0, encargo_base_usd: 0 } }) // por pedido: nace con lo suyo (0), no con el pasado del cliente (2,8314)
  })
  it('sin firma: el límite es el tope del encargo', async () => {
    const m = mundo({ libro: { total_usd: 0.4, por_encargo: {} } })
    await abrir(m, { tope_encargo_usd: 2.5 })
    expect(m.creados[0].semilla.tope_de_prueba).toEqual({ limite_usd: 2.5, base_usd: 0, encargo_base_usd: 0 })
    const m2 = mundo()
    await abrir(m2, {})
    expect(m2.creados[0].semilla.tope_de_prueba?.limite_usd).toBe(1.5)
  })
  it('un tope de prueba válido que ya viene se respeta; uno mal formado se reemplaza', async () => {
    const dado = { limite_usd: 4, base_usd: 1, encargo_base_usd: 0 }
    const m = mundo({ libro: { total_usd: 9, por_encargo: {} } })
    await abrir(m, { tope_de_prueba: dado })
    expect(m.creados[0].semilla.tope_de_prueba).toEqual(dado)
    expect(m.lecturas.n).toBe(0)
    const m2 = mundo({ libro: { total_usd: 0.5, por_encargo: {} } })
    await abrir(m2, { tope_de_prueba: { limite_usd: Number.POSITIVE_INFINITY, base_usd: 0, encargo_base_usd: 0 } })
    expect(m2.creados[0].semilla.tope_de_prueba).toEqual({ limite_usd: 1.5, base_usd: 0, encargo_base_usd: 0 })
  })
  it('si el libro no se puede leer, NO se crea el encargo (falla cerrado: la guarda no desaparece en silencio)', async () => {
    const m = mundo({ libro: null })
    const r = await abrir(m, { tope_encargo_usd: 3.2, firma_tope: FIRMA })
    expect(r.status).toBe(503)
    expect(r.cuerpo).toMatchObject({ error: 'libro_ilegible' })
    expect(m.creados).toHaveLength(0)
  })
  it('un almacén sin la lectura del libro no cambia nada (compatibilidad con lo anterior)', async () => {
    const m = mundo({ libro: 'sin_lectura' })
    const semilla: Semilla = { tope_encargo_usd: 2 }
    expect((await abrir(m, semilla)).status).toBe(200)
    expect(m.creados[0].semilla).toEqual(semilla)
  })
})

describe('el TOTAL del cliente, solo con firma explícita', () => {
  const TOTAL = { ...FIRMA, valor: 5, papel: '00-meta/FIRMA-EMILIO-tope-total.md' }
  it('al crear con firma_tope_total: límite = lo firmado, base = todo lo cobrado al cliente', async () => {
    const m = mundo({ libro: { total_usd: 4.7519, por_encargo: { otro: 4.7519 } } })
    await abrir(m, { tope_encargo_usd: 3.2, firma_tope: FIRMA, firma_tope_total: TOTAL })
    expect(m.creados[0].semilla.tope_de_prueba).toEqual({ limite_usd: 5, base_usd: 4.7519, encargo_base_usd: 0 })
  })
  it('un cliente con historia y SIN firma total: el encargo nuevo arranca (no nace frenado)', async () => {
    const m = mundo({ libro: { total_usd: 4.7519, por_encargo: { otro: 4.7519 } } })
    const r = await abrir(m, { tope_encargo_usd: 3.2, firma_tope: FIRMA })
    expect(r.status).toBe(200)
    expect(m.creados[0].semilla.tope_de_prueba).toEqual({ limite_usd: 3.2, base_usd: 0, encargo_base_usd: 0 })
  })
  it('con firma total la holgura SÍ frena a un encargo de un cliente que ya gastó casi todo', async () => {
    const m = mundo({ semilla: { tope_de_prueba: { limite_usd: 5, base_usd: 4.95, encargo_base_usd: 0 } } })
    await avanzar(m.P, 'enc-1')
    const r = await avanzar(m.P, 'enc-1')
    expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', razon: 'tope_de_prueba' })
  })
})

describe('al REABRIR (o un encargo anterior a la regla)', () => {
  it('al avanzar se le pone una vez: base = todo lo cobrado al cliente, encargo_base = lo cobrado por ese encargo; se guarda y no se vuelve a leer', async () => {
    const m = mundo({ semilla: { tope_encargo_usd: 3.2, firma_tope: FIRMA }, gasto: 2.8314, libro: { total_usd: 2.8314, por_encargo: { 'enc-1': 2.8314 } } })
    await avanzar(m.P, 'enc-1')
    expect(m.guardados).toHaveLength(1)
    expect(m.guardados[0].tope_de_prueba).toEqual({ limite_usd: 3.2, base_usd: 2.8314, encargo_base_usd: 2.8314 }) // por pedido: base = lo que ESE encargo ya cobró
    expect(m.guardados[0]).toMatchObject({ tope_encargo_usd: 3.2, firma_tope: FIRMA })
    const lecturas = m.lecturas.n
    await avanzar(m.P, 'enc-1')
    expect(m.lecturas.n).toBe(lecturas) // ya está en la semilla: no se mide otra vez
    expect(m.guardados).toHaveLength(1)
  })
  it('si la base no deja guardarlo, el paso sigue con el valor en memoria (no peor que antes)', async () => {
    const m = mundo({ gasto: 0.2, guardarFalla: true, libro: { total_usd: 0.2, por_encargo: { 'enc-1': 0.2 } } })
    expect((await avanzar(m.P, 'enc-1')).status).toBe(200) // el primer paso es de código (abrir)
    expect((await avanzar(m.P, 'enc-1')).status).toBe(200)
    expect(m.pedidos.length).toBeGreaterThan(0) // el segundo (planteo) llamó al modelo
  })
  it('si el libro no se puede leer, el paso NO corre y no se llama al modelo', async () => {
    const m = mundo({ libro: null })
    const r = await avanzar(m.P, 'enc-1')
    expect(r.status).toBe(503)
    expect(r.cuerpo).toMatchObject({ error: 'libro_ilegible' })
    expect(m.pedidos).toHaveLength(0)
  })
  it('el tope de prueba escrito FRENA: con holgura menor que la reserva, el encargo se cierra por tope de prueba sin llamar al modelo', async () => {
    const m = mundo({ semilla: { tope_encargo_usd: 3, tope_de_prueba: { limite_usd: 1.2, base_usd: 1.1, encargo_base_usd: 0 } } }) // holgura 0,10 < reserva del planteo 0,15
    expect((await avanzar(m.P, 'enc-1')).cuerpo).toMatchObject({ terminado: false }) // el primer paso es de código: sin reserva, no se frena
    const r = await avanzar(m.P, 'enc-1')
    expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', razon: 'tope_de_prueba' })
    expect(m.pedidos).toHaveLength(0)
  })
})

describe('qué cuenta como «oficina financiera» (almacén real sobre una base mínima)', () => {
  it('suma solo el libro de los encargos de ESE cliente; el mantenimiento del portero y otros clientes no entran', async () => {
    const tablas: Record<string, any[]> = {
      finanzas_encargos: [{ id: 'a1', client_id: 'c1' }, { id: 'a2', client_id: 'c1' }, { id: 'b1', client_id: 'c2' }],
      agent_invocations: [
        { workflow_execution_id: 'a1:planteo', cost_usd: 0.5 }, { workflow_execution_id: 'a1:cierre', cost_usd: 0.25 }, { workflow_execution_id: 'a2:planteo', cost_usd: 0.125 },
        { workflow_execution_id: 'b1:planteo', cost_usd: 9 }, { workflow_execution_id: 'portero-del-cerebro:diario', cost_usd: 1.5 }, { workflow_execution_id: null, cost_usd: 3 },
      ],
    }
    const from = (t: string) => {
      const filtros: Array<(f: any) => boolean> = []
      const api: any = {
        select: () => api,
        eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return api },
        like: (k: string, v: string) => { filtros.push((f) => String(f[k] ?? '').startsWith(v.replace(/%$/, ''))); return api },
        then: (res: any, rej: any) => Promise.resolve({ data: tablas[t].filter((f) => filtros.every((fn) => fn(f))), error: null }).then(res, rej),
      }
      return api
    }
    const g = await almacenDeConversa({ from } as never).gastoDeLaOficina!('c1')
    expect(g).toEqual({ total_usd: 0.875, por_encargo: { a1: 0.75, a2: 0.125 } })
  })
  it('un error de la base devuelve null (no cero): el que llama falla cerrado', async () => {
    const from = () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'caída' } }) }) })
    expect(await almacenDeConversa({ from } as never).gastoDeLaOficina!('c1')).toBeNull()
    const from2 = (t: string) => t === 'finanzas_encargos'
      ? { select: () => ({ eq: async () => ({ data: [{ id: 'a1' }], error: null }) }) }
      : { select: () => ({ like: async () => ({ data: [], error: { message: 'caída' } }) }) }
    expect(await almacenDeConversa({ from: from2 } as never).gastoDeLaOficina!('c1')).toBeNull()
  })
})
