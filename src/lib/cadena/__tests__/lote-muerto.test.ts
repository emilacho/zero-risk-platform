/**
 * LOTE MUERTO (GO Lenovo 2026-11-10 18:14Z · traba de piezas, arreglo 2) · sin base, sin red, sin modelo (US$ 0).
 * Caso real: el lote 2026-W46 de Náufrago (campaña 28de888e) se mandó a las 14:33Z, la parte murió en la guarda del manual y la sala contestó «duplicado» cada 30 min.
 * Segundo cliente: Zero Risk Seguridad Industrial (otro rubro); su campaña y sus filas son CONSTRUIDAS (no tiene campaña real).
 * La sala de la prueba guarda la entrada con la MISMA llave que la de verdad (`buildIdempotencyKey` sobre la llave del sobre): una llave vista = «duplicado», una nueva = un viaje.
 * Corrección 10-nov (CC7 + CC6): el conteo es por LLAVE de lote (campaña · semana · versión · huella), no por cliente + semana.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildIdempotencyKey } from '@/lib/sala-event-log/idempotency'
import { filasLotes } from '../datos'
import {
  claveDelAviso, decidirLote, enviosDesdeElRegistro, HORAS_PARA_DARLO_POR_MUERTO, llaveDeEnvio, llavesDelRegistro, MAX_REINTENTOS_DE_LOTE, OPERACION_DE_ENTRADA,
} from '../lote-muerto'
import type { Almacen, Campana } from '../almacen'
import type { Fila } from '../tipos'

const NAUFRAGO = { campana: '28de888e-b3f2-4aca-86b3-2c7f7bf6685a', client: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' } // real
const NAUFRAGO_SECO = { campana: '5eC00000-0000-4000-8000-0000000005ec'.toLowerCase(), client: NAUFRAGO.client } // construida: campaña en seco del mismo cliente
const NAUFRAGO_PAUSADA = { campana: '9a050000-0000-4000-8000-000000000a05', client: NAUFRAGO.client } // construida: campaña anterior del mismo cliente
const SEGURIDAD = { campana: '5e9a0000-0000-4000-8000-00000000c0de', client: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5' } // client_id real · campaña construida
type C = typeof NAUFRAGO
const ENVIO_REAL = '2026-11-10T14:33:31.096Z'
const HOY = '2026-11-10'
const wf = { workflow_id: 'wf-vigia', workflow_execution_id: 'ex-1' }
const horas = (base: string, h: number) => new Date(Date.parse(base) + h * 3600_000).toISOString()
const REGISTRO_REAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '__fixtures__', 'registro-sala-lotes-reales.json'), 'utf8')) as { filas: Array<{ client_id: string; lote: string; llave_del_sobre: string; operation_type: string; idempotency_key: string; created_at: string }> }

function escena(opciones: { sinPuertos?: boolean; enviosFallan?: boolean; avisoFalla?: number } = {}) {
  /** el registro de la sala: la entrada de cada viaje con la llave que deriva la sala */
  const registro: Array<{ client_id: string; idempotency_key: string; created_at: string }> = []
  const avisos: Array<{ clave: string; accion: string }> = []
  const buzon = new Set<string>()
  let fallosDeAviso = opciones.avisoFalla ?? 0
  const version: Record<string, number> = {}
  const seco = new Set([NAUFRAGO_SECO.campana])
  const campana = (c: C): Campana => ({ id: c.campana, client_id: c.client, estado: 'activa', seco: seco.has(c.campana) } as unknown as Campana)
  const fila = (id: string, c: C, fecha: string): Fila => ({ id, campana_id: c.campana, fecha, red: 'instagram', formato: 'foto', estado: 'validada' } as unknown as Fila)
  const filas: Fila[] = [
    fila('n-12-a', NAUFRAGO, '2026-11-12'), fila('n-13-a', NAUFRAGO, '2026-11-13'), fila('n-15-a', NAUFRAGO, '2026-11-15'),
    fila('ns-12-a', NAUFRAGO_SECO, '2026-11-12'), fila('np-12-a', NAUFRAGO_PAUSADA, '2026-11-12'),
    fila('s-12-a', SEGURIDAD, '2026-11-12'), fila('s-14-a', SEGURIDAD, '2026-11-14'),
  ]
  const todas = [NAUFRAGO, NAUFRAGO_SECO, NAUFRAGO_PAUSADA, SEGURIDAD]
  const al = {
    campana: async (id: string) => todas.map(campana).find((c) => c.id === id) ?? null,
    leerConfig: async (k: string) => (k === 'flujos' ? ['wf-vigia'] : k === 'arranque_por_evento' ? true : undefined),
    journeyExiste: async () => false,
    formatos: async () => ({}),
    ultimaVersionDeCalendario: async (campanaId: string) => version[campanaId] ?? 1,
    filas: async (campanaId: string) => filas.filter((f) => (f as unknown as { campana_id: string }).campana_id === campanaId),
    ...(opciones.sinPuertos ? {} : {
      // la MISMA cuenta que el almacén real: llaves exactas + `enviosDesdeElRegistro`
      enviosDeLote: async (clientId: string, lote: string, llave: string) => {
        if (opciones.enviosFallan) throw new Error('sala_event_log caída')
        const llaves = llavesDelRegistro(clientId, lote, llave)
        return enviosDesdeElRegistro(llaves, registro.filter((r) => r.client_id === clientId && llaves.includes(r.idempotency_key)))
      },
      avisarLoteMuerto: async (a: { clave: string }) => {
        if (fallosDeAviso > 0) { fallosDeAviso--; return { ok: false as const, error: 'buzón caído' } }
        const accion = buzon.has(a.clave) ? 'repetida' : 'abrio'
        buzon.add(a.clave); avisos.push({ clave: a.clave, accion })
        return { ok: true as const, accion }
      },
    }),
  } as unknown as Almacen
  /** lo que hace el vigía con la respuesta: manda cada sobre; la sala deduplica por su llave derivada */
  const mandar = (c: C, lotes: Array<{ lote: string; idempotency_key: string }>, en: string) => {
    for (const l of lotes) {
      const k = buildIdempotencyKey({ operation_type: OPERACION_DE_ENTRADA, client_id: c.client, logical_period: l.lote, input_hash: l.idempotency_key })
      if (!registro.some((r) => r.idempotency_key === k)) registro.push({ client_id: c.client, idempotency_key: k, created_at: en })
    }
  }
  const pasada = async (c: C, ahora: string) => {
    const r = await filasLotes(al, { ...wf, campana_id: c.campana, hoy: HOY }, ahora)
    const lotes = r.cuerpo.lotes as Array<{ lote: string; idempotency_key: string; fila_ids: string[] }>
    mandar(c, lotes, ahora)
    return { r, lotes }
  }
  const viajes = (c: C) => registro.filter((r) => r.client_id === c.client).length
  return { registro, avisos, filas, version, pasada, viajes }
}

describe('la llave del registro (contra las filas REALES de la sala)', () => {
  it.each(REGISTRO_REAL.filas)('la entrada real del $lote se encuentra con la llave del sobre', (f) => {
    expect(f.operation_type).toBe(OPERACION_DE_ENTRADA)
    const llaves = llavesDelRegistro(f.client_id, f.lote, f.llave_del_sobre)
    expect(llaves[0]).toBe(f.idempotency_key)
    expect(enviosDesdeElRegistro(llaves, [f])).toEqual({ envios: 1, ultimo_en: f.created_at })
  })
  it('la entrada de un lote no cuenta para otro lote, otra versión ni otra campaña del mismo cliente', () => {
    const [w46, w47] = REGISTRO_REAL.filas
    expect(enviosDesdeElRegistro(llavesDelRegistro(w47.client_id, w47.lote, w47.llave_del_sobre), [w46]).envios).toBe(0)
    expect(enviosDesdeElRegistro(llavesDelRegistro(w46.client_id, w46.lote, w46.llave_del_sobre.replace(':2026-W46:1:', ':2026-W46:2:')), [w46]).envios).toBe(0)
    expect(enviosDesdeElRegistro(llavesDelRegistro(w46.client_id, w46.lote, w46.llave_del_sobre.replace(NAUFRAGO.campana, NAUFRAGO_PAUSADA.campana)), [w46]).envios).toBe(0)
  })
  it('cuenta por el ÚLTIMO reintento encontrado, aunque las filas lleguen desordenadas', () => {
    const ll = llavesDelRegistro(NAUFRAGO.client, '2026-W46', 'k')
    expect(enviosDesdeElRegistro(ll, [{ idempotency_key: ll[2], created_at: 'b' }, { idempotency_key: ll[0], created_at: 'a' }, { idempotency_key: 'otra', created_at: 'z' }])).toEqual({ envios: 3, ultimo_en: 'b' })
  })
})

describe('la regla exacta', () => {
  const K = { idempotency_key: 'camp:2026-W46:1:abcd1234' }
  it('sin envío previo → sano, con la llave de siempre', () => expect(decidirLote(K, { envios: 0, ultimo_en: null }, '2026-11-10T20:00:00Z')).toEqual({ tipo: 'sano', llave: K.idempotency_key }))
  it('envío más nuevo que el plazo → sano, con la llave de su último envío', () => {
    expect(decidirLote(K, { envios: 1, ultimo_en: ENVIO_REAL }, horas(ENVIO_REAL, HORAS_PARA_DARLO_POR_MUERTO - 0.01))).toEqual({ tipo: 'sano', llave: K.idempotency_key })
    expect(decidirLote(K, { envios: 2, ultimo_en: ENVIO_REAL }, horas(ENVIO_REAL, 1))).toEqual({ tipo: 'sano', llave: `${K.idempotency_key}:r1` })
  })
  it('justo en el plazo → reintento 1 con llave nueva y determinista', () => expect(decidirLote(K, { envios: 1, ultimo_en: ENVIO_REAL }, horas(ENVIO_REAL, HORAS_PARA_DARLO_POR_MUERTO))).toEqual({ tipo: 'reintentar', intento: 1, llave: `${K.idempotency_key}:r1` }))
  it(`tras ${MAX_REINTENTOS_DE_LOTE} reintentos → agotado`, () => expect(decidirLote(K, { envios: MAX_REINTENTOS_DE_LOTE + 1, ultimo_en: ENVIO_REAL }, horas(ENVIO_REAL, 5))).toEqual({ tipo: 'agotado', envios: MAX_REINTENTOS_DE_LOTE + 1 }))
  it('fecha ilegible → no adivina (se comporta como hoy)', () => expect(decidirLote(K, { envios: 1, ultimo_en: 'ayer' }, '2026-11-10T20:00:00Z').tipo).toBe('sano'))
  it('las llaves de envío', () => { expect(llaveDeEnvio('x', 0)).toBe('x'); expect(llaveDeEnvio('x', 2)).toBe('x:r2') })
})

describe.each([['Náufrago (restaurante · caso real)', NAUFRAGO], ['Seguridad industrial (B2B · campaña construida)', SEGURIDAD]])('%s', (_n, C) => {
  it('el lote muerto se reintenta solo, avisa UNA vez y para en el tope', async () => {
    const e = escena()
    const primera = await e.pasada(C, ENVIO_REAL)
    const base = primera.lotes[0].idempotency_key
    expect(base).not.toMatch(/:r\d$/)
    for (const h of [0.5, 1, 1.5]) expect((await e.pasada(C, horas(ENVIO_REAL, h))).lotes[0].idempotency_key).toBe(base)
    expect(e.avisos).toEqual([])
    const r1 = await e.pasada(C, horas(ENVIO_REAL, 2))
    expect(r1.lotes[0].idempotency_key).toBe(`${base}:r1`)
    expect(r1.r.cuerpo.lotes_muertos).toEqual([expect.objectContaining({ lote: '2026-W46', accion: 'reintento', intento: 1 })])
    expect((await e.pasada(C, horas(ENVIO_REAL, 2.5))).lotes[0].idempotency_key).toBe(`${base}:r1`)
    await e.pasada(C, horas(ENVIO_REAL, 4)); await e.pasada(C, horas(ENVIO_REAL, 6))
    expect(e.viajes(C)).toBe(4)
    const fin = await e.pasada(C, horas(ENVIO_REAL, 8))
    expect(fin.lotes.find((l) => l.lote === '2026-W46')).toBeUndefined()
    expect(fin.r.cuerpo.lotes_muertos).toEqual([expect.objectContaining({ lote: '2026-W46', accion: 'agotado' })])
    expect(e.viajes(C)).toBe(4)
    // un solo incidente por lote: abrió una vez (el único mensaje a Slack); los reintentos y el agotado solo suman repeticiones
    expect(e.avisos[0]).toEqual({ clave: claveDelAviso(base), accion: 'abrio' })
    expect(e.avisos.slice(1).every((a) => a.accion === 'repetida' && a.clave === claveDelAviso(base))).toBe(true)
  })

  it('sabotaje · un lote SANO (su parte salió: filas marcadas) no se reintenta ni avisa', async () => {
    const e = escena()
    await e.pasada(C, ENVIO_REAL)
    for (const f of e.filas) (f as unknown as { estado: string }).estado = 'en_brief'
    const r = await e.pasada(C, horas(ENVIO_REAL, 5))
    expect(r.lotes).toEqual([])
    expect(r.r.cuerpo).not.toHaveProperty('lotes_muertos')
    expect(e.avisos).toEqual([])
  })

  it('sabotaje · un lote recién mandado (menos del plazo) sale con la misma llave y sin aviso', async () => {
    const e = escena()
    const a = await e.pasada(C, ENVIO_REAL)
    const b = await e.pasada(C, horas(ENVIO_REAL, HORAS_PARA_DARLO_POR_MUERTO - 0.1))
    expect(b.lotes[0].idempotency_key).toBe(a.lotes[0].idempotency_key)
    expect(e.avisos).toEqual([])
  })

  it('una VERSIÓN NUEVA del calendario después de «agotado» sale (y abre su propio aviso si también muere)', async () => {
    const e = escena()
    const v1 = (await e.pasada(C, ENVIO_REAL)).lotes[0].idempotency_key
    for (const h of [2, 4, 6]) await e.pasada(C, horas(ENVIO_REAL, h))
    expect((await e.pasada(C, horas(ENVIO_REAL, 8))).lotes).toEqual([])
    e.version[C.campana] = 2 // la persona corrigió: nace la versión 2
    const v2 = await e.pasada(C, horas(ENVIO_REAL, 9))
    expect(v2.lotes).toHaveLength(1)
    expect(v2.lotes[0].idempotency_key).toMatch(/:2026-W46:2:[0-9a-f]{8}$/)
    expect(v2.r.cuerpo).not.toHaveProperty('lotes_muertos')
    await e.pasada(C, horas(ENVIO_REAL, 11))
    expect(e.avisos.filter((a) => a.accion === 'abrio').map((a) => a.clave)).toEqual([claveDelAviso(v1), claveDelAviso(v2.lotes[0].idempotency_key)])
  })
})

describe('lo que no cambia y lo que no se mezcla', () => {
  it('una campaña EN SECO del mismo cliente no le cuenta envíos a la real', async () => {
    const e = escena()
    for (const h of [0, 2, 4, 6, 8]) await e.pasada(NAUFRAGO_SECO, horas(ENVIO_REAL, h)) // el seco manda su lote cada pasada (sus filas nunca se marcan)
    const real = await e.pasada(NAUFRAGO, horas(ENVIO_REAL, 9))
    expect(real.lotes[0].idempotency_key).toBe(`${NAUFRAGO.campana}:2026-W46:1:${real.lotes[0].idempotency_key.split(':').pop()}`)
    expect(real.r.cuerpo).not.toHaveProperty('lotes_muertos')
    expect(e.avisos).toEqual([])
  })
  it('una campaña ANTERIOR del mismo cliente con envíos en esa semana no le hereda envíos a la nueva', async () => {
    const e = escena()
    for (const h of [0, 2, 4, 6]) await e.pasada(NAUFRAGO_PAUSADA, horas(ENVIO_REAL, h))
    const nueva = await e.pasada(NAUFRAGO, horas(ENVIO_REAL, 9))
    expect(nueva.lotes[0].idempotency_key).not.toMatch(/:r\d$/)
    expect(nueva.r.cuerpo).not.toHaveProperty('lotes_muertos')
    expect(e.avisos.every((a) => a.clave.includes(NAUFRAGO_PAUSADA.campana))).toBe(true)
  })
  it('campaña en seco: nunca se reintenta', async () => {
    const e = escena()
    const a = await e.pasada(NAUFRAGO_SECO, ENVIO_REAL)
    const b = await e.pasada(NAUFRAGO_SECO, horas(ENVIO_REAL, 9))
    expect(b.lotes).toEqual(a.lotes); expect(e.avisos).toEqual([])
  })
  it('agotado con un aviso que NUNCA se abrió (el buzón falló en los 3 reintentos): el agotado lo abre', async () => {
    const e = escena({ avisoFalla: 3 })
    for (const h of [0, 2, 4, 6]) await e.pasada(NAUFRAGO, horas(ENVIO_REAL, h))
    expect(e.avisos).toEqual([])
    const fin = await e.pasada(NAUFRAGO, horas(ENVIO_REAL, 8))
    expect(fin.r.cuerpo.lotes_muertos).toEqual([expect.objectContaining({ accion: 'agotado', aviso: { ok: true, accion: 'abrio' } })])
    expect(e.avisos).toHaveLength(1)
  })
  it('sin los puertos nuevos: la respuesta es la de siempre', async () => {
    const e = escena({ sinPuertos: true })
    const a = await e.pasada(NAUFRAGO, ENVIO_REAL)
    const b = await e.pasada(NAUFRAGO, horas(ENVIO_REAL, 9))
    expect(b.r.cuerpo).toEqual(a.r.cuerpo)
  })
  it('si no se pueden leer los envíos, LANZA (un error no es «cero envíos»)', async () => {
    const e = escena({ enviosFallan: true })
    await expect(e.pasada(NAUFRAGO, ENVIO_REAL)).rejects.toThrow(/caída/)
  })
  it('los dos clientes no se mezclan: el reintento de uno no toca al otro', async () => {
    const e = escena()
    await e.pasada(NAUFRAGO, ENVIO_REAL); await e.pasada(SEGURIDAD, horas(ENVIO_REAL, 1.5))
    await e.pasada(NAUFRAGO, horas(ENVIO_REAL, 2)); await e.pasada(SEGURIDAD, horas(ENVIO_REAL, 2))
    expect(e.viajes(NAUFRAGO)).toBe(2)
    expect(e.viajes(SEGURIDAD)).toBe(1)
    expect(e.avisos.map((a) => a.clave)).toEqual([expect.stringContaining(NAUFRAGO.campana)])
  })
})
