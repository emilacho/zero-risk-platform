/**
 * LOTE MUERTO · la lectura REAL de la base (`almacenDeSupabase().enviosDeLote`) · pedido de CC6 (ADENDA 1) y CC7 (ADENDA 2) en #1010 · US$ 0, sin red.
 * Base falsa que APLICA los filtros y GUARDA la consulta. Las filas de la sala parten de las REALES de Náufrago (`registro-sala-lotes-reales.json`, 10-nov);
 * las de reintento (`:r1`, `:r2`) y las ajenas son CONSTRUIDAS con la misma llave que deriva la sala.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildIdempotencyKey } from '@/lib/sala-event-log/idempotency'

type Fila = Record<string, any>
let filasDeLaSala: Fila[] = []
const consultas: Array<{ tabla: string; filtros: Array<[string, string, unknown]> }> = []
function consulta(tabla: string) {
  const filtros: Array<[string, string, unknown]> = []
  consultas.push({ tabla, filtros })
  const q: any = {
    select: () => q, order: () => q, limit: () => q,
    eq: (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q },
    in: (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      const filas = (tabla === 'sala_event_log' ? filasDeLaSala : []).filter((r) => filtros.every(([op, c, v]) => (op === 'eq' ? r[c] === v : (v as unknown[]).includes(r[c]))))
      return Promise.resolve({ data: filas, error: null }).then(ok, ko)
    },
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../almacen-supabase'
import { baseDelLote, llavesDelRegistro, OPERACION_DE_ENTRADA } from '../lote-muerto'

const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '__fixtures__', 'registro-sala-lotes-reales.json'), 'utf8')).filas as Array<{ client_id: string; lote: string; llave_del_sobre: string; idempotency_key: string; created_at: string }>
const [W46, W47] = REAL
const llaveDeLaSala = (client: string, lote: string, sobre: string) => buildIdempotencyKey({ operation_type: OPERACION_DE_ENTRADA, client_id: client, logical_period: lote, input_hash: sobre })
const leer = () => almacenDeSupabase().enviosDeLote!(W46.client_id, W46.lote, W46.llave_del_sobre)

beforeEach(() => { consultas.length = 0; filasDeLaSala = REAL.map((f) => ({ client_id: f.client_id, idempotency_key: f.idempotency_key, created_at: f.created_at })) })

describe('enviosDeLote · lo que pide a la base', () => {
  it('filtra por el cliente y por las 4 llaves del lote, EN ORDEN (original con su huella, y r1..r3 por la base del lote)', async () => {
    await leer()
    const q = consultas.find((c) => c.tabla === 'sala_event_log')!
    expect(q.filtros).toContainEqual(['eq', 'client_id', W46.client_id])
    const llaves = q.filtros.find(([op, c]) => op === 'in' && c === 'idempotency_key')![2]
    const base = baseDelLote(W46.llave_del_sobre)
    expect(llaves).toEqual([
      W46.idempotency_key, // la entrada REAL de W46
      llaveDeLaSala(W46.client_id, W46.lote, `${base}:r1`),
      llaveDeLaSala(W46.client_id, W46.lote, `${base}:r2`),
      llaveDeLaSala(W46.client_id, W46.lote, `${base}:r3`),
    ])
    expect(llaves).toEqual(llavesDelRegistro(W46.client_id, W46.lote, W46.llave_del_sobre))
  })
})

describe('enviosDeLote · lo que cuenta (con las filas reales + reintentos construidos)', () => {
  it('hoy (solo el original real): 1 envío, a su hora', async () => {
    expect(await leer()).toEqual({ envios: 1, ultimo_en: W46.created_at })
  })
  it('con filas de :r1 y :r2 (construidas): 3 envíos, el último el de r2', async () => {
    const base = baseDelLote(W46.llave_del_sobre)
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${base}:r2`), created_at: '2026-11-10T18:40:00Z' })
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${base}:r1`), created_at: '2026-11-10T16:40:00Z' })
    expect(await leer()).toEqual({ envios: 3, ultimo_en: '2026-11-10T18:40:00Z' })
  })
  it('con otra huella (el día siguiente) los reintentos se siguen encontrando: el original de hoy no está, pero r1 sí → 2 envíos', async () => {
    const base = baseDelLote(W46.llave_del_sobre)
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${base}:r1`), created_at: '2026-11-10T16:40:00Z' })
    const otraHuella = `${base}:deadbeef`
    expect(await almacenDeSupabase().enviosDeLote!(W46.client_id, W46.lote, otraHuella)).toEqual({ envios: 2, ultimo_en: '2026-11-10T16:40:00Z' })
  })
  it('no cuenta la entrada de OTRO lote (W47 real) ni la de otro cliente con la misma llave (construida)', async () => {
    filasDeLaSala.push({ client_id: 'otro-cliente', idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${baseDelLote(W46.llave_del_sobre)}:r3`), created_at: '2026-11-10T20:00:00Z' })
    expect(await leer()).toEqual({ envios: 1, ultimo_en: W46.created_at })
    expect(await almacenDeSupabase().enviosDeLote!(W47.client_id, W47.lote, W47.llave_del_sobre)).toEqual({ envios: 1, ultimo_en: W47.created_at })
  })
})
