/**
 * 19-nov · #1195 · la pieza vieja de una fila que volvió al brief se archiva sola (decisión A de Lenovo 01:16Z · 🔴 de CC7 · cuidados de CC3) · CC1 · US$ 0, sin red.
 * Una base falsa mínima (select · eq · in · is · update · select tras update) que aplica los filtros como Postgres: la escritura condicional se mide de verdad.
 */
import { describe, expect, it } from 'vitest'
import { archivarPiezasDeFilas, type Db } from '../archivar-piezas-de-filas'
import { FAMILIAS_QUE_NO_SON_PIEZAS } from '../piezas-por-publicar'

type Fila = Record<string, unknown>
const AHORA = new Date('2026-11-19T01:30:00Z')
const HORA = AHORA.toISOString()
const MOTIVO = 'reemplazada: la idea «C1-I16» se retiró del banco'
const MESA = [...FAMILIAS_QUE_NO_SON_PIEZAS][0]

function base(t: { encargos: Fila[]; bandeja: Fila[] }, o: { falla?: Partial<Record<string, string>>; antesDeEscribir?: (tabla: string, t2: typeof t) => void; lanza?: boolean } = {}) {
  const tablas: Record<string, Fila[]> = { oficina_encargos: t.encargos, hitl_queue: t.bandeja }
  const escrituras: Array<{ tabla: string; patch: Fila; ids: string[] }> = []
  const leer = (f: Fila, col: string): unknown => {
    const [alias, camino] = col.includes(':') ? col.split(':') : [col, col]
    void alias
    return camino.split('->').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Fila)[k.trim()] : undefined), f)
  }
  const db: Db = {
    from(tabla: string) {
      if (o.lanza) throw new Error('sin conexión')
      const filtros: Array<(f: Fila) => boolean> = []
      let cols: string | null = null
      let patch: Fila | null = null
      let devolver = false
      const q = {
        select(c?: string) { if (patch) devolver = true; else cols = c ?? '*'; return q },
        eq(c: string, v: unknown) { filtros.push((f) => f[c] === v); return q },
        in(c: string, v: unknown[]) { filtros.push((f) => v.includes(f[c])); return q },
        is(c: string, v: unknown) { filtros.push((f) => (f[c] ?? null) === v); return q },
        update(p: Fila) { patch = p; return q },
        then(res: (r: { data: unknown; error: { message: string } | null }) => unknown, rej?: (e: unknown) => unknown) {
          const fallo = o.falla?.[`${patch ? 'update' : 'select'}:${tabla}`]
          if (fallo) return Promise.resolve({ data: null, error: { message: fallo } }).then(res, rej)
          if (patch) {
            o.antesDeEscribir?.(tabla, t)
            const hits = tablas[tabla].filter((f) => filtros.every((p) => p(f)))
            for (const f of hits) Object.assign(f, patch)
            escrituras.push({ tabla, patch, ids: hits.map((f) => String(f.id)) })
            return Promise.resolve({ data: devolver ? hits.map((f) => ({ id: f.id })) : null, error: null }).then(res, rej)
          }
          const hits = tablas[tabla].filter((f) => filtros.every((p) => p(f)))
          const data = hits.map((f) => (cols === '*' || !cols ? { ...f } : Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c.includes(':') ? c.split(':')[0] : c, leer(f, c)]))))
          return Promise.resolve({ data, error: null }).then(res, rej)
        },
      }
      return q as never
    },
  }
  return { db, escrituras, t }
}
const encargo = (id: string, fila: string, hitl: string | null, extra: Fila = {}): Fila => ({ id, parte_id: 'parte-1', familia: 'imagen', estado: 'cerrado', hitl_queue_id: hitl, dry_run: false, prueba: false, archivada_en: null, archivo_motivo: null, sala_ref: { fila: { id: fila, fecha: '2026-11-19' } }, ...extra })
const pieza = (id: string, status: string, extra: Fila = {}): Fila => ({ id, status, archivada_en: null, archivo_motivo: null, ...extra })
const P = { parte_ids: ['parte-1'], fila_ids: ['fila-a'], motivo: MOTIVO }

describe('archivarPiezasDeFilas · la pieza vieja que espera a Emilio se archiva; lo que él ya decidió, nunca', () => {
  it('🔴 la pieza PENDIENTE de la fila se archiva, en la bandeja y en su encargo, con el motivo y la hora; nada se borra ni cambia de estado', async () => {
    const { db, t } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', 'pending')] })
    expect(await archivarPiezasDeFilas(db, P, AHORA)).toEqual({ ok: true, archivadas: [{ fila_id: 'fila-a', hitl_id: 'h1', encargo_ids: ['e1'] }], ya_archivadas: [], no_archivadas: [] })
    expect(t.bandeja[0]).toMatchObject({ status: 'pending', archivada_en: HORA, archivo_motivo: MOTIVO })
    expect(t.encargos[0]).toMatchObject({ estado: 'cerrado', archivada_en: HORA, archivo_motivo: MOTIVO })
  })
  for (const status of ['approved', 'rejected', 'edited', 'expired']) {
    it(`🔴 «${status}» = Emilio ya la decidió: NO se toca y se declara`, async () => {
      const { db, t, escrituras } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', status)] })
      expect(await archivarPiezasDeFilas(db, P, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: [], no_archivadas: [{ fila_id: 'fila-a', hitl_id: 'h1', encargo_id: 'e1', motivo: 'decidida_por_emilio', estado: status }] })
      expect(escrituras).toEqual([])
      expect(t.bandeja[0].archivada_en).toBeNull()
    })
  }
  it('🔴 si Emilio decide en el MISMO instante (entre la lectura y la escritura), gana él: la escritura condicional no toca nada y se declara', async () => {
    const { db, t } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', 'pending')] }, { antesDeEscribir: (tabla, x) => { if (tabla === 'hitl_queue') x.bandeja[0].status = 'approved' } })
    expect(await archivarPiezasDeFilas(db, P, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: [], no_archivadas: [{ fila_id: 'fila-a', hitl_id: 'h1', encargo_id: 'e1', motivo: 'emilio_decidio_al_mismo_tiempo' }] })
    expect(t.bandeja[0]).toMatchObject({ status: 'approved', archivada_en: null })
    expect(t.encargos[0].archivada_en).toBeNull()
  })
  it('🔴 solo las filas pedidas y solo los partes de ESTA campaña; ni mesas, ni ensayos, ni pruebas', async () => {
    const { db, t } = base({
      encargos: [
        encargo('e1', 'fila-a', 'h1'),
        encargo('e2', 'fila-b', 'h2'),
        encargo('e3', 'fila-a', 'h3', { parte_id: 'parte-de-otra-campana' }),
        encargo('e4', 'fila-a', 'h4', { familia: MESA }),
        encargo('e5', 'fila-a', 'h5', { dry_run: true }),
        encargo('e6', 'fila-a', 'h6', { prueba: true }),
      ],
      bandeja: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id) => pieza(id, 'pending')),
    })
    const r = await archivarPiezasDeFilas(db, P, AHORA)
    expect(r).toMatchObject({ ok: true, archivadas: [{ hitl_id: 'h1' }] })
    expect(t.bandeja.filter((b) => b.archivada_en).map((b) => b.id)).toEqual(['h1'])
  })
  it('🟢 un encargo todavía sin pieza se declara («sin_pieza_todavia»); el que falló sin bandeja nunca produjo: ni se toca ni se dice', async () => {
    const { db, escrituras } = base({ encargos: [encargo('e1', 'fila-a', null, { estado: 'en_proceso' }), encargo('e2', 'fila-a', null, { estado: 'fallido' })], bandeja: [] })
    expect(await archivarPiezasDeFilas(db, P, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: [], no_archivadas: [{ fila_id: 'fila-a', hitl_id: null, encargo_id: 'e1', motivo: 'sin_pieza_todavia', estado: 'en_proceso' }] })
    expect(escrituras).toEqual([])
  })
  it('🔴 la pieza que no se encuentra en la bandeja NO se archiva y se dice', async () => {
    const { db, escrituras } = base({ encargos: [encargo('e1', 'fila-a', 'h-perdida')], bandeja: [] })
    expect(await archivarPiezasDeFilas(db, P, AHORA)).toMatchObject({ ok: true, archivadas: [], no_archivadas: [{ hitl_id: 'h-perdida', motivo: 'bandeja_no_encontrada' }] })
    expect(escrituras).toEqual([])
  })
  it('🔴 repetir no cambia nada: lo archivado se cuenta como ya archivado (y un encargo que quedó sin marca por un corte se completa con la MISMA hora)', async () => {
    const antes = '2026-11-19T01:00:00Z'
    const { db, t } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', 'pending', { archivada_en: antes, archivo_motivo: MOTIVO })] })
    expect(await archivarPiezasDeFilas(db, P, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: ['h1'], no_archivadas: [] })
    expect(t.bandeja[0].archivada_en).toBe(antes)
    expect(t.encargos[0]).toMatchObject({ archivada_en: antes, archivo_motivo: MOTIVO })
  })
  it('🔴 varios encargos de la misma pieza (rondas de cambios) se archivan juntos; dos piezas de la misma fila, las dos', async () => {
    const { db, t } = base({ encargos: [encargo('e1', 'fila-a', 'h1'), encargo('e1b', 'fila-a', 'h1'), encargo('e2', 'fila-a', 'h2')], bandeja: [pieza('h1', 'pending'), pieza('h2', 'pending')] })
    const r = await archivarPiezasDeFilas(db, P, AHORA)
    expect(r).toMatchObject({ ok: true, archivadas: [{ hitl_id: 'h1', encargo_ids: ['e1', 'e1b'] }, { hitl_id: 'h2', encargo_ids: ['e2'] }] })
    expect(t.encargos.every((e) => e.archivada_en === HORA)).toBe(true)
  })
  for (const [que, falla] of [['leer los encargos', 'select:oficina_encargos'], ['leer la bandeja', 'select:hitl_queue'], ['archivar la pieza', 'update:hitl_queue']] as const) {
    it(`🔴 si no se puede ${que}, no se da nada por archivado y se dice (ok: false)`, async () => {
      const { db, t } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', 'pending')] }, { falla: { [falla]: 'caída' } })
      const r = await archivarPiezasDeFilas(db, P, AHORA)
      expect(r.ok).toBe(false)
      expect((r as { motivo: string }).motivo).toContain('caída')
      expect(t.bandeja[0].archivada_en).toBeNull()
    })
  }
  it('🔴 si la pieza quedó archivada pero no su encargo, se dice cuál (y repetir lo completa)', async () => {
    const { db, t } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', 'pending')] }, { falla: { 'update:oficina_encargos': 'caída' } })
    const r = await archivarPiezasDeFilas(db, P, AHORA)
    expect(r).toEqual({ ok: false, motivo: 'la pieza h1 quedó archivada, pero no su encargo: caída' })
    expect(t.bandeja[0].archivada_en).toBe(HORA)
    const otra = base({ encargos: t.encargos, bandeja: t.bandeja })
    expect(await archivarPiezasDeFilas(otra.db, P, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: ['h1'], no_archivadas: [] })
    expect(t.encargos[0].archivada_en).toBe(HORA)
  })
  it('🟢 nunca lanza: si la base no contesta, ok: false', async () => {
    const { db } = base({ encargos: [], bandeja: [] }, { lanza: true })
    expect(await archivarPiezasDeFilas(db, P, AHORA)).toEqual({ ok: false, motivo: 'la oficina no contestó: sin conexión' })
  })
  it('🟢 sin filas o sin partes no lee nada; sin motivo no escribe', async () => {
    const { db, escrituras } = base({ encargos: [encargo('e1', 'fila-a', 'h1')], bandeja: [pieza('h1', 'pending')] })
    expect(await archivarPiezasDeFilas(db, { ...P, fila_ids: [] }, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: [], no_archivadas: [] })
    expect(await archivarPiezasDeFilas(db, { ...P, parte_ids: [] }, AHORA)).toEqual({ ok: true, archivadas: [], ya_archivadas: [], no_archivadas: [] })
    expect(await archivarPiezasDeFilas(db, { ...P, motivo: '  ' }, AHORA)).toEqual({ ok: false, motivo: 'falta el motivo del archivo' })
    expect(escrituras).toEqual([])
  })
})
