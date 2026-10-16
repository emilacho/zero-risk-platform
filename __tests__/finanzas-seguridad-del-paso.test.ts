/**
 * Arreglo de seguridad del intento 4 de la oficina financiera (CC#2 · relevo · 16-oct). US$ 0, sin red ni modelo: todo simulado.
 * Causa medida: el jefe tardó 115–260 s por llamada; con el reintento de formato un paso pasaba de 300 s (502), NO se guardaba y se cobraba igual; el bucle repetía la llamada (pagaba otra vez),
 * el tope del encargo solo contaba turnos guardados y una configuración ilegible se leía como «apagada».
 * Cinco defensas: (1) candado de paso en vuelo · (2) tope sobre lo cobrado · (3) no reintentar el formato pasado el margen · (4) config ilegible ⇒ 503 · (5) tiempos del flujo y de la ruta.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { almacenDeConversa } from '../src/lib/finanzas/conversa/almacen-supabase'
import { avanzar, leerConversacion, LIMITE_PARA_REINTENTAR_MS, TTL_DEL_CANDADO_S } from '../src/lib/finanzas/conversa/orquestador'
import type { AlmacenDeConversa, CambiosDeEncargo, EncargoDeConversa, PedidoAlModelo, PuertosDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import type { ConfigDeFinanzas } from '../src/lib/finanzas/ruta'
import { TIMEOUT_MS } from '../scripts/worker-staging/finanzas-conversa/construir-conversa.mjs'

const CLIENTE = 'cliente-prueba'
const PLANTEO = { meta_por_semana: 14, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 1 }], no_se: [] }
const CONFIG_OK: ConfigDeFinanzas = { estado: 'ensayo', clientes_ensayo: [CLIENTE], preguntas_slack: 'apagado', conversa: 'ensayo' }

function mundo(opts: { cobrado?: number | null; configRota?: boolean; sinCandado?: boolean; modelo?: (p: PedidoAlModelo, n: number) => Promise<{ ok: true; salida: string; costo_usd: number } | { ok: false; error: string; costo_usd: number }> } = {}) {
  const encargos = new Map<string, EncargoDeConversa & { en_vuelo: string | null }>()
  const turnos: TurnoDeConversa[] = []
  const c = { llamadas: 0, tomas: 0, sueltas: 0 }
  let reloj = 1_700_000_000_000
  const almacen: AlmacenDeConversa = {
    async crearEncargo(n) {
      const e = { id: 'enc-1', client_id: n.client_id, estado: 'abierto' as const, estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: n.semilla, en_vuelo: null }
      encargos.set(e.id, e)
      return { ok: true, encargo: structuredClone(e), nuevo: true }
    },
    async leerEncargo(id) { const e = encargos.get(id); return e ? structuredClone(e) : null },
    async guardar(ch: CambiosDeEncargo) {
      const e = encargos.get(ch.encargo_id)!
      e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd
      if (ch.estado !== undefined) e.estado = ch.estado
      if (ch.turno) turnos.push(structuredClone(ch.turno))
    },
    async artefactos() { return {} },
    async turnos() { return structuredClone(turnos) },
    ...(opts.sinCandado ? {} : {
      async tomarPaso(id: string, ahora: Date, ttl_s: number) {
        const e = encargos.get(id)!
        const vence = e.en_vuelo ? new Date(e.en_vuelo).getTime() + ttl_s * 1000 : 0
        if (e.en_vuelo && vence > ahora.getTime()) return { ok: true as const, tomado: false }
        e.en_vuelo = ahora.toISOString(); c.tomas++
        return { ok: true as const, tomado: true }
      },
      async soltarPaso(id: string) { encargos.get(id)!.en_vuelo = null; c.sueltas++ },
    }),
    ...(opts.cobrado !== undefined ? { async cobrado() { return opts.cobrado ?? null } } : {}),
  }
  const P: PuertosDeConversa = {
    almacen,
    modelo: { async invocar(p) { c.llamadas++; return opts.modelo ? opts.modelo(p, c.llamadas) : { ok: true, salida: JSON.stringify(PLANTEO), costo_usd: 0.1 } } },
    slack: { async publicar() { return { ok: false } }, async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts, sin_acceso: 'no_configurado' } } },
    tableros: {} as PuertosDeConversa['tableros'],
    config: async () => { if (opts.configRota) throw new Error('boom'); return CONFIG_OK },
    ahora: () => new Date(reloj),
    canalDelHilo: '', emilio_id: '',
  }
  return { P, c, encargos, turnos, avanzaReloj: (ms: number) => { reloj += ms } }
}
const abrirYHacerElPrimerPaso = async (m: ReturnType<typeof mundo>) => {
  const a = await m.P.almacen.crearEncargo({ client_id: CLIENTE, dry_run: false, semilla: {} })
  if (!a.ok) throw new Error('no abrió')
  const r = await avanzar(m.P, a.encargo.id) // «abrir» (código)
  expect(r.status).toBe(200)
  return a.encargo.id
}

describe('1 · candado de paso en vuelo', () => {
  it('dos llamadas simultáneas: la segunda recibe 409 paso_en_vuelo y el modelo se llama UNA vez', async () => {
    let soltar: (v: unknown) => void = () => undefined
    const espera = new Promise((r) => { soltar = r })
    const m = mundo({ modelo: async () => { await espera; return { ok: true, salida: JSON.stringify(PLANTEO), costo_usd: 0.1 } } })
    const id = await abrirYHacerElPrimerPaso(m)
    const A = avanzar(m.P, id)
    await Promise.resolve(); await new Promise((r) => setTimeout(r, 5))
    const B = await avanzar(m.P, id)
    expect(B.status).toBe(409)
    expect(B.cuerpo.error).toBe('paso_en_vuelo')
    soltar(null)
    const a = await A
    expect(a.status).toBe(200)
    expect(m.c.llamadas).toBe(1)
  })
  it('el candado se SUELTA al terminar el paso, y también si el paso revienta', async () => {
    const m = mundo()
    const id = await abrirYHacerElPrimerPaso(m)
    await avanzar(m.P, id)
    expect(m.encargos.get(id)!.en_vuelo).toBeNull()
    const roto = mundo({ modelo: async () => { throw new Error('el corredor cayó') } })
    const id2 = await abrirYHacerElPrimerPaso(roto)
    await expect(avanzar(roto.P, id2)).rejects.toThrow('el corredor cayó')
    expect(roto.encargos.get(id2)!.en_vuelo).toBeNull()
    expect(roto.c.sueltas).toBeGreaterThan(0)
  })
  it('un candado VENCIDO (paso muerto) no atasca el encargo', async () => {
    const m = mundo()
    const id = await abrirYHacerElPrimerPaso(m)
    m.encargos.get(id)!.en_vuelo = new Date(1_700_000_000_000 - (TTL_DEL_CANDADO_S + 5) * 1000).toISOString()
    const r = await avanzar(m.P, id)
    expect(r.status).toBe(200)
  })
  it('sin candado en el almacén (migración sin aplicar) el paso sigue: no se rompe el despliegue', async () => {
    const m = mundo({ sinCandado: true })
    const id = await abrirYHacerElPrimerPaso(m)
    expect((await avanzar(m.P, id)).status).toBe(200)
  })
})

describe('2 · el tope cuenta lo COBRADO, no solo lo guardado', () => {
  it('con US$ 1,60 cobrados (y 0,00 guardados) el encargo cierra por tope SIN llamar al modelo', async () => {
    const m = mundo({ cobrado: 1.6 })
    const id = await abrirYHacerElPrimerPaso(m)
    const r = await avanzar(m.P, id)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', terminado: true })
    expect(m.c.llamadas).toBe(0)
  })
  it('con poco cobrado el paso corre y el gasto guardado es el COBRADO más el del paso', async () => {
    const m = mundo({ cobrado: 0.4 })
    const id = await abrirYHacerElPrimerPaso(m)
    const r = await avanzar(m.P, id)
    expect(r.status).toBe(200)
    expect(m.c.llamadas).toBe(1)
    expect(Number(r.cuerpo.gasto_usd)).toBeCloseTo(0.5, 4)
  })
  it('si no se puede leer lo cobrado (null) se sigue con lo guardado (no se frena por una lectura caída)', async () => {
    const m = mundo({ cobrado: null })
    const id = await abrirYHacerElPrimerPaso(m)
    expect((await avanzar(m.P, id)).status).toBe(200)
  })
})

describe('3 · no se reintenta el formato pasado el margen', () => {
  it('la primera respuesta tarda más de 150 s y viene rota: UNA sola llamada y el turno queda degradado con su motivo', async () => {
    let m!: ReturnType<typeof mundo>
    m = mundo({ modelo: async (_p, n) => { m.avanzaReloj(LIMITE_PARA_REINTENTAR_MS + 50_000); return n === 1 ? { ok: true, salida: 'esto no es JSON', costo_usd: 0.2 } : { ok: true, salida: JSON.stringify(PLANTEO), costo_usd: 0.1 } } })
    const id = await abrirYHacerElPrimerPaso(m)
    const r = await avanzar(m.P, id)
    expect(r.status).toBe(200)
    expect(m.c.llamadas).toBe(1)
    expect(m.turnos.at(-1)).toMatchObject({ estado: 'fallo' })
    expect(String(m.turnos.at(-1)!.error)).toMatch(/tiempo_agotado_para_reintentar/)
    expect(Number(r.cuerpo.costo_usd)).toBeCloseTo(0.2, 4)
  })
  it('si la primera respuesta fue RÁPIDA y vino rota, el reintento de formato sigue funcionando (2 llamadas)', async () => {
    const m = mundo({ modelo: async (_p, n) => (n === 1 ? { ok: true, salida: 'no es JSON', costo_usd: 0.05 } : { ok: true, salida: JSON.stringify(PLANTEO), costo_usd: 0.1 }) })
    const id = await abrirYHacerElPrimerPaso(m)
    await avanzar(m.P, id)
    expect(m.c.llamadas).toBe(2)
    expect(m.turnos.at(-1)).toMatchObject({ estado: 'hecho' })
  })
})

describe('4 · una configuración ilegible es 503, no «apagada»', () => {
  it('leer con la config caída → 503 config_ilegible (antes: 409 conversa_apagada)', async () => {
    const m = mundo({ configRota: true })
    const r = await leerConversacion(m.P, 'enc-1')
    expect(r.status).toBe(503)
    expect(r.cuerpo.error).toBe('config_ilegible')
  })
  it('apagada de verdad sigue siendo 409 y encendida lee el encargo', async () => {
    const m = mundo()
    const id = await abrirYHacerElPrimerPaso(m)
    expect((await leerConversacion(m.P, id)).status).toBe(200)
    const apagada = { ...m.P, config: async () => ({ ...CONFIG_OK, conversa: 'apagado' as const }) }
    const r = await leerConversacion(apagada, id)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('conversa_apagada')
    expect((await leerConversacion(m.P, 'no-existe')).status).toBe(404)
  })
  it('avanzar con la config caída ya era 503 y sigue siéndolo', async () => {
    const m = mundo({ configRota: true })
    expect((await avanzar(m.P, 'enc-1')).status).toBe(503)
  })
})

describe('5 · tiempos del flujo y de la ruta; almacén real', () => {
  it('el nodo «FIN · un paso» espera ≥ 600 s y el JSON del flujo lo trae', () => {
    expect(TIMEOUT_MS).toBeGreaterThanOrEqual(600_000)
    const flujo = JSON.parse(fs.readFileSync('scripts/worker-staging/finanzas-conversa/NUEVO-finanzas-conversa-2026-10-14.json', 'utf8').replace(/^﻿/, ''))
    const h = flujo.nodes.find((n: { type: string }) => n.type === 'n8n-nodes-base.httpRequest')
    expect(h.parameters.options.timeout).toBe(TIMEOUT_MS)
  })
  it('la ruta declara maxDuration ≥ 800 y usa leerConversacion (sin el null → apagada)', () => {
    const t = fs.readFileSync('src/app/api/finanzas/conversa/route.ts', 'utf8')
    expect(t).toMatch(/maxDuration = 800/)
    expect(t).toMatch(/leerConversacion\(P, c\.encargo_id\)/)
    expect(t).not.toMatch(/P\.config\(\)\.catch\(\(\) => null\)/)
  })
  it('tomarPaso real: UPDATE condicional por id con vencimiento; sin la columna devuelve sin_columna', async () => {
    const llamadas: string[] = []
    const db = (resultado: { data: unknown; error: { message: string; code?: string } | null }) => ({
      from: () => ({ update: (v: unknown) => ({ eq: (c: string, id: string) => ({ or: (f: string) => { llamadas.push(`${c}=${id} ${f} ${JSON.stringify(v)}`); return { select: async () => resultado } } }) }) }),
    })
    const ahora = new Date('2026-10-16T02:00:00Z')
    const libre = await almacenDeConversa(db({ data: [{ id: 'x' }], error: null }) as never).tomarPaso!('x', ahora, 900)
    expect(libre).toEqual({ ok: true, tomado: true })
    expect(llamadas[0]).toContain('en_vuelo_desde.is.null,en_vuelo_desde.lt.2026-10-16T01:45:00.000Z')
    const ocupado = await almacenDeConversa(db({ data: [], error: null }) as never).tomarPaso!('x', ahora, 900)
    expect(ocupado).toEqual({ ok: true, tomado: false })
    const sinColumna = await almacenDeConversa(db({ data: null, error: { message: 'column finanzas_encargos.en_vuelo_desde does not exist', code: '42703' } }) as never).tomarPaso!('x', ahora, 900)
    expect(sinColumna).toMatchObject({ ok: false, sin_columna: true })
  })
  it('cobrado real: suma las filas de `<encargo>:<paso>` del libro', async () => {
    const filtros: string[] = []
    const db = { from: () => ({ select: () => ({ like: async (c: string, p: string) => { filtros.push(`${c} ${p}`); return { data: [{ cost_usd: 0.2381 }, { cost_usd: '0.1489' }, { cost_usd: null }], error: null } } }) }) }
    const v = await almacenDeConversa(db as never).cobrado!('enc-9')
    expect(filtros[0]).toBe('workflow_execution_id enc-9:%')
    expect(v).toBeCloseTo(0.387, 6)
  })
})
