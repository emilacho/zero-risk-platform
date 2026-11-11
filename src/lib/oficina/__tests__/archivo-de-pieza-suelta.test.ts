/**
 * 11-nov · archivar UNA pieza suelta (GO Lenovo 04:03Z · opción 2 de CC1 · líneas de CC6: ids explícitos, razón, se deshace exacto, seco por omisión).
 * Dos clientes de rubros distintos con la forma REAL de sus filas: el B2B industrial (una pieza APROBADA sin fecha de fila que frena para siempre,
 * como la del carrusel del 30-oct) y Náufrago (una pieza que espera al dueño). Base falsa. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from './dbfalsa'
import { archivarPieza, desarchivarPieza, type Db } from '../archivo-de-campana'
import { clasificarPieza } from '../piezas-por-publicar'

const B2B = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const NAU = '7c2a1d4e-5b6f-4a8b-9c0d-1e2f3a4b5c6d'
const HA = 'aa677fad-678e-40a5-89b5-9c4f2c369b7d'
const HN = '5a5a5a5a-1111-4222-8333-444444444444'
const HOTRA = '6b6b6b6b-1111-4222-8333-444444444444'
const EA = '48776d13-fb07-47c1-ac0e-c1c39456c7a7'
const EN = '9d9d9d9d-1111-4222-8333-444444444444'
const AHORA = new Date('2026-11-11T05:00:00Z')
const RAZON = 'decisión del dueño 11-nov: fuera de uso'
const d = (x: DbFalsa) => x as unknown as Db
const fila = (x: DbFalsa, t: string, id: string) => (x.tablas[t] ?? []).find((f) => f.id === id)

const base = () => new DbFalsa()
  .semilla('hitl_queue', [
    // la aprobada del B2B: sin fecha en su fila de calendario → la regla (A) la cuenta para siempre
    { id: HA, client_id: B2B, type: 'content_piece_review', status: 'approved', created_at: '2026-10-30T12:09:36Z', archivada_en: null, archivo_motivo: null, metadata: { oficina_encargo_id: EA } },
    { id: HN, client_id: NAU, type: 'content_piece_review', status: 'edited', created_at: '2026-11-09T10:00:00Z', archivada_en: null, archivo_motivo: null, metadata: {} },
    { id: HOTRA, client_id: B2B, type: 'content_piece_review', status: 'pending', created_at: '2026-10-30T10:00:00Z', archivada_en: null, archivo_motivo: null, metadata: {} },
    { id: 'plan-1', client_id: NAU, type: 'plan_con_pendientes', status: 'pending', created_at: '2026-11-09T10:00:00Z', metadata: {} },
  ])
  .semilla('oficina_encargos', [
    { id: EA, client_id: B2B, estado: 'aprobada', hitl_queue_id: HA, archivada_en: null, archivo_motivo: null, sala_ref: { fila: {} } },
    { id: EN, client_id: NAU, estado: 'en_revision', hitl_queue_id: HN, archivada_en: null, archivo_motivo: null, sala_ref: { fila: { fecha: '2026-11-20' } } },
  ])

describe('archivar una pieza suelta', () => {
  it('🔴 sin dry_run:false no escribe nada y dice qué haría (B2B aprobada y Náufrago esperando)', async () => {
    for (const [h, estado, encargos] of [[HA, 'approved', [EA]], [HN, 'edited', [EN]]] as const) {
      const x = base()
      const antes = JSON.stringify(x.tablas)
      const r = await archivarPieza(d(x), { hitl_id: h, motivo: RAZON }, AHORA)
      expect(r.body).toMatchObject({ ok: true, dry_run: true, hitl_id: h, estado, encargos })
      expect(JSON.stringify(x.tablas)).toBe(antes)
    }
  })

  it('🔴 B2B: archiva la APROBADA por su id, con la razón; su estado no cambia; la regla (A) deja de contarla; nada más se toca', async () => {
    const x = base()
    const sinTocar = JSON.stringify([fila(x, 'hitl_queue', HOTRA), fila(x, 'hitl_queue', HN), fila(x, 'oficina_encargos', EN)])
    const r = await archivarPieza(d(x), { hitl_id: HA, motivo: RAZON, dry_run: false }, AHORA)
    expect(r).toMatchObject({ status: 200, body: { ok: true, dry_run: false, archivada_en: AHORA.toISOString(), archivo_motivo: RAZON } })
    expect(fila(x, 'hitl_queue', HA)).toMatchObject({ status: 'approved', archivada_en: AHORA.toISOString(), archivo_motivo: RAZON })
    expect(fila(x, 'oficina_encargos', EA)).toMatchObject({ estado: 'aprobada', archivada_en: AHORA.toISOString(), archivo_motivo: RAZON })
    expect(JSON.stringify([fila(x, 'hitl_queue', HOTRA), fila(x, 'hitl_queue', HN), fila(x, 'oficina_encargos', EN)])).toBe(sinTocar)
    // antes frenaba («aprobada_sin_fecha»); ahora no
    const e = fila(x, 'oficina_encargos', EA) as { estado: string; hitl_queue_id: string; sala_ref: unknown }
    expect(clasificarPieza(e, { id: HA, status: 'approved', archivada_en: null }, AHORA)).toMatchObject({ frena: true, motivo: 'aprobada_sin_fecha' })
    expect(clasificarPieza(e, fila(x, 'hitl_queue', HA) as never, AHORA)).toEqual({ frena: false, motivo: 'archivada' })
  })

  it('🔴 Náufrago: el encargo se halla por su bandeja aunque la metadata no lo nombre', async () => {
    const x = base()
    await archivarPieza(d(x), { hitl_id: HN, motivo: RAZON, dry_run: false }, AHORA)
    expect(fila(x, 'oficina_encargos', EN)).toMatchObject({ estado: 'en_revision', archivo_motivo: RAZON })
    expect(fila(x, 'hitl_queue', HN)).toMatchObject({ status: 'edited', archivo_motivo: RAZON })
  })

  it('🔴 repetir no cambia nada (ni la hora ni la razón)', async () => {
    const x = base()
    await archivarPieza(d(x), { hitl_id: HA, motivo: RAZON, dry_run: false }, AHORA)
    const antes = JSON.stringify(x.tablas)
    const r = await archivarPieza(d(x), { hitl_id: HA, motivo: 'otra razón', dry_run: false }, new Date('2026-11-12T00:00:00Z'))
    expect(r.body).toMatchObject({ ya_archivada: true, archivada_en: AHORA.toISOString(), archivo_motivo: RAZON })
    expect(JSON.stringify(x.tablas)).toBe(antes)
  })

  it.each([
    ['sin razón', { hitl_id: HA, dry_run: false }, 400],
    ['razón en blanco', { hitl_id: HA, motivo: '   ', dry_run: false }, 400],
    ['sin id', { motivo: RAZON, dry_run: false }, 400],
    ['id que no es uuid', { hitl_id: 'aa677fad', motivo: RAZON, dry_run: false }, 400],
    ['id que no existe', { hitl_id: '00000000-0000-4000-8000-000000000000', motivo: RAZON, dry_run: false }, 404],
  ])('🔴 %s → %s y no toca nada', async (_n, cuerpo, status) => {
    const x = base()
    const antes = JSON.stringify(x.tablas)
    expect((await archivarPieza(d(x), cuerpo, AHORA)).status).toBe(status)
    expect(JSON.stringify(x.tablas)).toBe(antes)
  })

  it('🔴 una fila de la bandeja que no es pieza (un plan) no se archiva por aquí', async () => {
    const x = base()
    x.semilla('hitl_queue', [{ id: 'abcdefab-1111-4222-8333-444444444444', client_id: NAU, type: 'plan_con_pendientes', status: 'pending', archivada_en: null, archivo_motivo: null, metadata: {} }])
    const antes = JSON.stringify(x.tablas)
    expect(await archivarPieza(d(x), { hitl_id: 'abcdefab-1111-4222-8333-444444444444', motivo: RAZON, dry_run: false }, AHORA)).toMatchObject({ status: 409, body: { error: 'no_es_pieza' } })
    expect(JSON.stringify(x.tablas)).toBe(antes)
  })
})

describe('desarchivar una pieza suelta', () => {
  it('🔴 deja la pieza y su encargo EXACTAMENTE como estaban (B2B y Náufrago)', async () => {
    for (const h of [HA, HN]) {
      const x = base()
      const antes = JSON.stringify(x.tablas)
      await archivarPieza(d(x), { hitl_id: h, motivo: RAZON, dry_run: false }, AHORA)
      expect(await desarchivarPieza(d(x), { hitl_id: h })).toMatchObject({ status: 200, body: { ok: true } })
      expect(JSON.stringify(x.tablas)).toBe(antes)
    }
  })

  it('🔴 no destapa lo que archivó OTRO archivo (otra hora): un encargo archivado antes con su campaña sigue archivado', async () => {
    const x = base()
    const viejo = '2026-11-01T00:00:00.000Z'
    x.tablas.oficina_encargos = (x.tablas.oficina_encargos ?? []).map((e) => (e.id === EA ? { ...e, archivada_en: viejo, archivo_motivo: 'archivada · campaña anterior' } : e))
    await archivarPieza(d(x), { hitl_id: HA, motivo: RAZON, dry_run: false }, AHORA)
    expect(fila(x, 'oficina_encargos', EA)).toMatchObject({ archivada_en: viejo, archivo_motivo: 'archivada · campaña anterior' })
    await desarchivarPieza(d(x), { hitl_id: HA })
    expect(fila(x, 'hitl_queue', HA)).toMatchObject({ archivada_en: null, archivo_motivo: null, status: 'approved' })
    expect(fila(x, 'oficina_encargos', EA)).toMatchObject({ archivada_en: viejo, archivo_motivo: 'archivada · campaña anterior' })
  })

  it('🔴 una pieza sin archivar → 409; sin id → 400', async () => {
    expect((await desarchivarPieza(d(base()), { hitl_id: HA })).status).toBe(409)
    expect((await desarchivarPieza(d(base()), {})).status).toBe(400)
  })
})
