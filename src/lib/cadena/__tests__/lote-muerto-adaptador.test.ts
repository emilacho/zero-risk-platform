/**
 * LOTE MUERTO · la lectura REAL de la base (`almacenDeSupabase().enviosDeLote`) · pedido de CC6 (ADENDA 1) y CC7 (ADENDA 2) en #1010 · US$ 0, sin red.
 * Base falsa que APLICA los filtros y GUARDA la consulta. Las filas de la sala parten de las REALES de Náufrago (`registro-sala-lotes-reales.json`, 10-nov);
 * las de reintento (`:r1`, `:r2`) y las ajenas son CONSTRUIDAS con la misma llave que deriva la sala.
 * ADENDA 3 de CC7: las filas de cada sobre se leen del `payload.envelope_payload.fila_ids` REAL (misma forma que la base, 10-nov).
 * ADENDA 2 de CC6 (20fc63e): la base falsa devuelve SOLO las columnas que pide el `select` (como la de verdad): si la lectura deja de pedir `payload`, las filas llegan sin sobre.
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
  let columnas: string[] | null = null
  consultas.push({ tabla, filtros })
  const q: any = {
    select: (c: string) => { columnas = c === '*' ? null : c.split(',').map((x) => x.trim()); return q },
    order: () => q, limit: () => q,
    eq: (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q },
    in: (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      const filas = (tabla === 'sala_event_log' ? filasDeLaSala : []).filter((r) => filtros.every(([op, c, v]) => (op === 'eq' ? r[c] === v : (v as unknown[]).includes(r[c]))))
        .map((r) => (columnas ? Object.fromEntries(columnas.map((c) => [c, r[c]])) : r))
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
import { baseDelLote, LLAVES_DE_REINTENTO, llavesDelRegistro, OPERACION_DE_ENTRADA } from '../lote-muerto'

const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '__fixtures__', 'registro-sala-lotes-reales.json'), 'utf8')).filas as Array<{ client_id: string; lote: string; llave_del_sobre: string; idempotency_key: string; created_at: string; fila_ids: string[] }>
const [W46, W47] = REAL
const llaveDeLaSala = (client: string, lote: string, sobre: string) => buildIdempotencyKey({ operation_type: OPERACION_DE_ENTRADA, client_id: client, logical_period: lote, input_hash: sobre })
const leer = (hoy: string[] = W46.fila_ids) => almacenDeSupabase().enviosDeLote!(W46.client_id, W46.lote, W46.llave_del_sobre, hoy)
const sobre = (fila_ids: string[]) => ({ envelope_payload: { lote: '2026-W46', modo: 'real', dry_run: false, fila_ids } })

beforeEach(() => { consultas.length = 0; filasDeLaSala = REAL.map((f) => ({ client_id: f.client_id, idempotency_key: f.idempotency_key, created_at: f.created_at, payload: sobre(f.fila_ids) })) })

describe('enviosDeLote · lo que pide a la base', () => {
  it(`filtra por el cliente y por las ${LLAVES_DE_REINTENTO + 1} llaves del lote, EN ORDEN (original con su huella, y r1..r${LLAVES_DE_REINTENTO} por la base del lote)`, async () => {
    await leer()
    const q = consultas.find((c) => c.tabla === 'sala_event_log')!
    expect(q.filtros).toContainEqual(['eq', 'client_id', W46.client_id])
    const llaves = q.filtros.find(([op, c]) => op === 'in' && c === 'idempotency_key')![2]
    const base = baseDelLote(W46.llave_del_sobre)
    expect(llaves).toHaveLength(LLAVES_DE_REINTENTO + 1)
    expect((llaves as string[]).slice(0, 4)).toEqual([
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
    expect(await leer()).toEqual({ envios: 1, reintentos: 0, ultimo: 0, libre: 1, ultimo_en: W46.created_at })
  })
  it('con filas de :r1 y :r2 (construidas): 3 envíos, el último el de r2', async () => {
    const base = baseDelLote(W46.llave_del_sobre)
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${base}:r2`), created_at: '2026-11-10T18:40:00Z', payload: sobre(W46.fila_ids) })
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${base}:r1`), created_at: '2026-11-10T16:40:00Z', payload: sobre(W46.fila_ids) })
    expect(await leer()).toEqual({ envios: 3, reintentos: 2, ultimo: 2, libre: 3, ultimo_en: '2026-11-10T18:40:00Z' })
  })
  it('con otra huella (el día siguiente) los reintentos se siguen encontrando: el original de hoy no está, pero r1 sí → 2 envíos', async () => {
    const base = baseDelLote(W46.llave_del_sobre)
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${base}:r1`), created_at: '2026-11-10T16:40:00Z', payload: sobre(W46.fila_ids) })
    const otraHuella = `${base}:deadbeef`
    expect(await almacenDeSupabase().enviosDeLote!(W46.client_id, W46.lote, otraHuella, W46.fila_ids)).toEqual({ envios: 1, reintentos: 1, ultimo: 1, libre: 2, ultimo_en: '2026-11-10T16:40:00Z' })
  })
  it('no cuenta la entrada de OTRO lote (W47 real) ni la de otro cliente con la misma llave (construida)', async () => {
    filasDeLaSala.push({ client_id: 'otro-cliente', idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${baseDelLote(W46.llave_del_sobre)}:r3`), created_at: '2026-11-10T20:00:00Z' })
    expect(await leer()).toEqual({ envios: 1, reintentos: 0, ultimo: 0, libre: 1, ultimo_en: W46.created_at })
    expect(await almacenDeSupabase().enviosDeLote!(W47.client_id, W47.lote, W47.llave_del_sobre, W47.fila_ids)).toEqual({ envios: 1, reintentos: 0, ultimo: 0, libre: 1, ultimo_en: W47.created_at })
  })
})

describe('enviosDeLote · ADENDA 3 de CC7 · las filas de cada sobre (del payload real)', () => {
  it('ADENDA 2 de CC6 · la base falsa devuelve solo lo pedido, y la lectura pide el `payload` (sin él, el caso de CC7 vuelve en silencio)', async () => {
    await leer()
    const q = consultas.find((c) => c.tabla === 'sala_event_log')!
    expect(q).toBeDefined()
    // el caso de CC7 con la lectura real: el r1 de ayer salió entero y hoy hay otras filas → no cuenta (si el payload no llegara, contaría)
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${baseDelLote(W46.llave_del_sobre)}:r1`), created_at: '2026-11-10T16:40:00Z', payload: sobre(W46.fila_ids) })
    expect(await leer(['s1-d1-lun_nueva'])).toEqual({ envios: 0, reintentos: 0, ultimo: 0, libre: 2, ultimo_en: null })
  })
  it('borde (nota de CC7) · ids de fila que no son texto se descartan: no hacen contar un envío', async () => {
    filasDeLaSala.length = 0
    filasDeLaSala.push({ client_id: W46.client_id, idempotency_key: W46.idempotency_key, created_at: W46.created_at, payload: { envelope_payload: { fila_ids: [123, null, { id: 'x' }] } } })
    expect(await leer(['123', 'x'])).toEqual({ envios: 0, reintentos: 0, ultimo: 0, libre: 1, ultimo_en: null })
  })
  const r1 = (payload: unknown) => ({ client_id: W46.client_id, idempotency_key: llaveDeLaSala(W46.client_id, W46.lote, `${baseDelLote(W46.llave_del_sobre)}:r1`), created_at: '2026-11-10T16:40:00Z', payload })
  it('un r1 cuyas filas ya salieron TODAS (construidas) no cuenta, pero ocupa su número: el próximo libre es r2', async () => {
    filasDeLaSala.push(r1(sobre(['ya-salio-1', 'ya-salio-2'])))
    expect(await leer()).toEqual({ envios: 1, reintentos: 0, ultimo: 0, libre: 2, ultimo_en: W46.created_at })
  })
  it('con las filas de HOY distintas de las del original real: ni el original cuenta → 0 envíos (sale como original)', async () => {
    expect(await leer(['s1-d1-lun_nueva'])).toEqual({ envios: 0, reintentos: 0, ultimo: 0, libre: 1, ultimo_en: null })
  })
  it('una sola fila del sobre real que siga en el lote de hoy basta para que cuente', async () => {
    expect((await leer([W46.fila_ids[5], 'otra'])).envios).toBe(1)
  })
  it('un sobre sin filas legibles (payload sin fila_ids, o nulo) SÍ cuenta', async () => {
    filasDeLaSala.push(r1({ envelope_payload: { lote: '2026-W46' } }))
    expect(await leer(['nada-que-ver'])).toEqual({ envios: 1, reintentos: 1, ultimo: 1, libre: 2, ultimo_en: '2026-11-10T16:40:00Z' })
    filasDeLaSala.pop(); filasDeLaSala.push(r1(null))
    expect((await leer(['nada-que-ver'])).envios).toBe(1)
  })
})
