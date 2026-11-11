/**
 * Colaterales 2d · la guarda de PIEZAS POR PUBLICAR · regla (A) con las 4 condiciones de CC6 + líneas 2 y 5 de CC6/CC7.
 * Fixtures sacados de los registros reales del 11-nov 01:20Z (solo lectura): Seguridad Industrial (carrusel BRF-0002 aprobado sin fecha y otro con cambios
 * pedidos) y Náufrago (7 mesas de la cadena cerradas, sin bandeja). La base falsa devuelve SOLO las columnas del select y aplica cada filtro.
 */
import { describe, it, expect } from 'vitest'
import { clasificarPieza, notaDeLaGuarda, piezasPorPublicar, MARGEN_DE_PUBLICACION_MS, type BandejaLeida } from '../piezas-por-publicar'

const SEG = '31dc6aaf-0000-4000-8000-00000000seg1'
const NAU = '28de888e-0000-4000-8000-00000000nau1'
const CAMP_A = 'camp-a-0000-0000-0000-000000000001'
const CAMP_B = 'camp-b-0000-0000-0000-000000000002'
const AHORA = new Date('2026-11-11T12:00:00Z')

type Fila = Record<string, unknown>
function base(tablas: Record<string, Fila[]>, o: { fallar?: string } = {}) {
  const pedidos: { tabla: string; cols: string[]; en: [string, unknown[]][] }[] = []
  return {
    pedidos,
    from(tabla: string) {
      const filtros: ((f: Fila) => boolean)[] = []
      let cols: string[] = []
      const api: Record<string, unknown> = {
        select: (c: string) => { cols = c.split(',').map((x) => x.trim()); pedidos.push({ tabla, cols, en: [] }); return api },
        eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return api },
        is: (k: string, v: unknown) => { filtros.push((f) => (f[k] ?? null) === v); return api },
        in: (k: string, vs: unknown[]) => { pedidos[pedidos.length - 1].en.push([k, vs]); filtros.push((f) => vs.includes(f[k])); return api },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          if (o.fallar === tabla) return Promise.resolve({ data: null, error: { message: 'statement timeout' } }).then(res, rej)
          // como la base real: SOLO las columnas pedidas
          const data = (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f))).map((f) => Object.fromEntries(cols.map((c) => [c, f[c]])))
          return Promise.resolve({ data, error: null }).then(res, rej)
        },
      }
      return api
    },
  }
}
const enc = (x: Partial<Fila> & { id: string }): Fila => ({ client_id: SEG, parte_id: null, brief_id: 'BRF-X', familia: 'carrusel_mesa', estado: 'cerrado', hitl_queue_id: null, dry_run: false, prueba: false, archivada_en: null, ...x })
const band = (x: Partial<Fila> & { id: string }): Fila => ({ status: 'pending', expires_at: null, archivada_en: null, ...x })

// ── registros reales (11-nov) ──
const REAL = {
  oficina_encargos: [
    enc({ id: '48776d13', brief_id: 'BRF-0002', estado: 'aprobada', hitl_queue_id: 'aa677fad', parte_id: 'parte-seg-1' }),
    enc({ id: 'c6f3322e', brief_id: 'BRF-0002', estado: 'cerrado', hitl_queue_id: '5db4c541', parte_id: 'parte-seg-1' }),
    enc({ id: '8adbfb3d', brief_id: 'BRF-0002', estado: 'cerrado', hitl_queue_id: '353067d1', parte_id: 'parte-seg-1' }),
    enc({ id: 'fcaabccf', brief_id: 'BRF-0004', familia: 'post_img', estado: 'fallido' }),
    enc({ id: 'fc4c0537', brief_id: 'BRF-0001', estado: 'cerrado', dry_run: true }),
    enc({ id: 'd0794d06', client_id: NAU, brief_id: 'con-28de888eb3f2-v4', familia: 'concepto_mesa', estado: 'cerrado', parte_id: CAMP_A }),
    enc({ id: 'b5b2fab9', client_id: NAU, brief_id: 'brf-28de888eb3f2-v4', familia: 'brief_mesa', estado: 'cerrado', parte_id: CAMP_A }),
  ],
  hitl_queue: [
    band({ id: 'aa677fad', status: 'approved', expires_at: null }),
    band({ id: '5db4c541', status: 'edited' }),
    band({ id: '353067d1', status: 'rejected' }),
  ],
  client_historical_outputs: [{ id: 'parte-seg-1', provenance_tag: { campana_id: CAMP_A } }],
}

describe('LA regla · clasificarPieza (condiciones 2 y 3 de CC6)', () => {
  const b = (x: Partial<BandejaLeida>): BandejaLeida => ({ id: 'h', status: 'approved', expires_at: null, archivada_en: null, ...x })
  const e = { estado: 'cerrado', hitl_queue_id: 'h' }
  const iso = (ms: number) => new Date(AHORA.getTime() + ms).toISOString()
  it('aprobada con fecha futura FRENA', () => expect(clasificarPieza(e, b({ expires_at: iso(3600e3) }), AHORA)).toEqual({ frena: true, motivo: 'aprobada_fecha_futura' }))
  it('aprobada HOY (hace 1 h) todavía FRENA (lado seguro: +24 h)', () => expect(clasificarPieza(e, b({ expires_at: iso(-3600e3) }), AHORA).frena).toBe(true))
  it('aprobada justo en el borde (+24 h exactas) ya no frena; 1 ms antes sí', () => {
    expect(clasificarPieza(e, b({ expires_at: iso(-MARGEN_DE_PUBLICACION_MS) }), AHORA).frena).toBe(false)
    expect(clasificarPieza(e, b({ expires_at: iso(-MARGEN_DE_PUBLICACION_MS + 1) }), AHORA).frena).toBe(true)
  })
  it('aprobada con fecha pasada (+24 h) NO frena y se declara SUPUESTA con su fecha', () => {
    const f = iso(-3 * 864e5)
    expect(clasificarPieza(e, b({ expires_at: f }), AHORA)).toEqual({ frena: false, motivo: 'se_asume_publicada', publicada_en: f })
  })
  it('aprobada SIN fecha frena · fecha ilegible frena', () => {
    expect(clasificarPieza(e, b({ expires_at: null }), AHORA)).toEqual({ frena: true, motivo: 'aprobada_sin_fecha' })
    expect(clasificarPieza(e, b({ expires_at: 'mañana' }), AHORA)).toEqual({ frena: true, motivo: 'fecha_ilegible' })
  })
  it.each(['pending', 'edited'])('%s frena sin importar la fecha (aun pasada)', (status) => expect(clasificarPieza(e, b({ status, expires_at: iso(-30 * 864e5) }), AHORA)).toEqual({ frena: true, motivo: 'espera_al_dueno' }))
  it.each(['rejected', 'expired'])('%s no frena (descartada)', (status) => expect(clasificarPieza(e, b({ status }), AHORA)).toEqual({ frena: false, motivo: 'descartada' }))
  it('bandeja archivada no frena, aunque esté pendiente', () => expect(clasificarPieza(e, b({ status: 'pending', archivada_en: '2026-11-01T00:00:00Z' }), AHORA)).toEqual({ frena: false, motivo: 'archivada' }))
  it('estado de bandeja desconocido FRENA', () => expect(clasificarPieza(e, b({ status: 'raro' }), AHORA)).toEqual({ frena: true, motivo: 'estado_desconocido' }))
  it('encargo producido SIN bandeja FRENA (no es «descartado»)', () => {
    for (const estado of ['cerrado', 'aprobada', 'abierto', 'en_paso', 'otro']) expect(clasificarPieza({ estado, hitl_queue_id: null }, undefined, AHORA)).toEqual({ frena: true, motivo: 'sin_bandeja' })
  })
  it('fallido o cerrado por tope SIN bandeja no frena (nunca produjo)', () => {
    for (const estado of ['fallido', 'cerrado_por_tope']) expect(clasificarPieza({ estado, hitl_queue_id: null }, undefined, AHORA)).toEqual({ frena: false, motivo: 'nunca_produjo' })
  })
  it('con vínculo a la bandeja pero la fila no aparece: FRENA', () => expect(clasificarPieza(e, undefined, AHORA)).toEqual({ frena: true, motivo: 'bandeja_no_encontrada' }))
})

describe('piezasPorPublicar · con los registros reales de los 2 clientes', () => {
  it('Seguridad Industrial (documento del cliente): las 2 piezas del 30-oct frenan; la rechazada, la fallida y el ensayo no', async () => {
    const r = await piezasPorPublicar(base(REAL), { client_id: SEG, campana_id: null }, AHORA)
    expect(r.frenan.map((x) => [x.encargo_id, x.motivo]).sort()).toEqual([['48776d13', 'aprobada_sin_fecha'], ['c6f3322e', 'espera_al_dueno']])
    expect(r.se_asumen_publicadas).toEqual([])
  })
  it('Náufrago: sus mesas de la cadena NO son piezas · 0 frenan', async () => {
    expect(await piezasPorPublicar(base(REAL), { client_id: NAU, campana_id: null }, AHORA)).toEqual({ frenan: [], se_asumen_publicadas: [] })
    expect(await piezasPorPublicar(base(REAL), { client_id: NAU, campana_id: CAMP_A }, AHORA)).toEqual({ frenan: [], se_asumen_publicadas: [] })
  })
  it('una mesa de la cadena con fila «pendiente» igual no cuenta (las 3 familias de mesa)', async () => {
    for (const familia of ['brief_mesa', 'concepto_mesa', 'reubicacion_mesa']) {
      const t = { oficina_encargos: [enc({ id: 'm1', client_id: NAU, familia, hitl_queue_id: 'hm' })], hitl_queue: [band({ id: 'hm' })], client_historical_outputs: [] }
      expect((await piezasPorPublicar(base(t), { client_id: NAU, campana_id: null }, AHORA)).frenan).toEqual([])
    }
  })
})

describe('línea 2 de CC6 · la campaña sale del PARTE', () => {
  const dosCampanas = {
    oficina_encargos: [enc({ id: 'pA', hitl_queue_id: 'hA', parte_id: 'parte-a' }), enc({ id: 'pB', hitl_queue_id: 'hB', parte_id: 'parte-b' })],
    hitl_queue: [band({ id: 'hA' }), band({ id: 'hB' })],
    client_historical_outputs: [{ id: 'parte-a', provenance_tag: { campana_id: CAMP_A } }, { id: 'parte-b', provenance_tag: { campana_id: CAMP_B } }],
  }
  it('una pieza viva en la campaña B NO frena la edición del brief de la A, y SÍ frena la del manual', async () => {
    expect((await piezasPorPublicar(base(dosCampanas), { client_id: SEG, campana_id: CAMP_A }, AHORA)).frenan.map((x) => x.encargo_id)).toEqual(['pA'])
    expect((await piezasPorPublicar(base(dosCampanas), { client_id: SEG, campana_id: CAMP_B }, AHORA)).frenan.map((x) => x.encargo_id)).toEqual(['pB'])
    expect((await piezasPorPublicar(base(dosCampanas), { client_id: SEG, campana_id: null }, AHORA)).frenan.map((x) => x.encargo_id).sort()).toEqual(['pA', 'pB'])
  })
  it('un parte que no se ubica en ninguna campaña cuenta como de ESTA (frena), nunca como de otra', async () => {
    for (const parte_id of ['parte-perdido', null, '']) {
      const t = { ...dosCampanas, oficina_encargos: [enc({ id: 'pX', hitl_queue_id: 'hA', parte_id })] }
      const r = await piezasPorPublicar(base(t), { client_id: SEG, campana_id: CAMP_B }, AHORA)
      expect(r.frenan).toEqual([{ encargo_id: 'pX', brief_id: 'BRF-X', motivo: 'espera_al_dueno', parte_sin_campana: true }])
    }
  })
  it('un parte cuyo registro no trae campaña también frena', async () => {
    const t = { ...dosCampanas, oficina_encargos: [enc({ id: 'pY', hitl_queue_id: 'hA', parte_id: 'parte-c' })], client_historical_outputs: [{ id: 'parte-c', provenance_tag: {} }] }
    expect((await piezasPorPublicar(base(t), { client_id: SEG, campana_id: CAMP_B }, AHORA)).frenan.map((x) => x.encargo_id)).toEqual(['pY'])
  })
  it('el encargo cuyo parte ES la campaña cuenta como de ella', async () => {
    const t = { ...dosCampanas, oficina_encargos: [enc({ id: 'pZ', hitl_queue_id: 'hA', parte_id: CAMP_A })], client_historical_outputs: [] }
    expect((await piezasPorPublicar(base(t), { client_id: SEG, campana_id: CAMP_A }, AHORA)).frenan.map((x) => x.encargo_id)).toEqual(['pZ'])
  })
})

describe('solo reales, solo del cliente, sin archivados (cada filtro)', () => {
  const t = (x: Partial<Fila>) => ({ oficina_encargos: [enc({ id: 'p', hitl_queue_id: 'h', ...x })], hitl_queue: [band({ id: 'h' })], client_historical_outputs: [] })
  it.each([['de ensayo', { dry_run: true }], ['de prueba', { prueba: true }], ['de otro cliente', { client_id: NAU }], ['archivado', { archivada_en: '2026-11-01T00:00:00Z' }]])('un encargo %s no cuenta', async (_n, x) => {
    expect((await piezasPorPublicar(base(t(x)), { client_id: SEG, campana_id: null }, AHORA)).frenan).toEqual([])
  })
  it('control: el mismo encargo real, del cliente y sin archivar SÍ frena', async () => {
    expect((await piezasPorPublicar(base(t({})), { client_id: SEG, campana_id: null }, AHORA)).frenan).toHaveLength(1)
  })
})

describe('un error al leer se LANZA (quien llama frena), nunca es «cero piezas»', () => {
  it.each(['oficina_encargos', 'client_historical_outputs', 'hitl_queue'])('falla %s', async (tabla) => {
    await expect(piezasPorPublicar(base(REAL, { fallar: tabla }), { client_id: SEG, campana_id: CAMP_A }, AHORA)).rejects.toThrow(/statement timeout/)
  })
})

describe('condición 1 de CC6 · la suposición queda ESCRITA en la nota', () => {
  it('la nota nombra la pieza y la fecha supuesta; y lo que frena con su motivo', async () => {
    const t = {
      oficina_encargos: [enc({ id: 'vieja', brief_id: 'BRF-9', hitl_queue_id: 'h1' }), enc({ id: 'viva', brief_id: 'BRF-8', hitl_queue_id: 'h2' })],
      hitl_queue: [band({ id: 'h1', status: 'approved', expires_at: '2026-11-01T15:00:00Z' }), band({ id: 'h2', status: 'pending' })],
      client_historical_outputs: [],
    }
    const r = await piezasPorPublicar(base(t), { client_id: SEG, campana_id: null }, AHORA)
    expect(r.se_asumen_publicadas).toEqual([{ encargo_id: 'vieja', brief_id: 'BRF-9', publicada_en: '2026-11-01T15:00:00Z' }])
    const nota = notaDeLaGuarda(r) as string
    expect(nota).toContain('se asume publicada por fecha: BRF-9 (2026-11-01T15:00:00Z)')
    expect(nota).toContain('BRF-8 (espera_al_dueno)')
    expect(notaDeLaGuarda({ frenan: [], se_asumen_publicadas: [] })).toBeNull()
  })
})

describe('lecturas acotadas (línea 5 de CC7) · la bandeja archivada leída de la base', () => {
  it('los partes y la bandeja se leen SOLO por los ids de los encargos del alcance (nunca la tabla entera)', async () => {
    const db = base(REAL)
    await piezasPorPublicar(db, { client_id: SEG, campana_id: CAMP_A }, AHORA)
    const partes = db.pedidos.find((x) => x.tabla === 'client_historical_outputs')
    const bandeja = db.pedidos.find((x) => x.tabla === 'hitl_queue')
    expect(partes?.en).toEqual([['id', ['parte-seg-1']]])
    expect(bandeja?.en.map(([k, v]) => [k, [...v].sort()])).toEqual([['id', ['353067d1', '5db4c541', 'aa677fad']]])
  })
  it('una pieza pendiente cuya fila de bandeja está ARCHIVADA no frena (la columna se lee de la base)', async () => {
    const t = { oficina_encargos: [enc({ id: 'p', hitl_queue_id: 'h' })], hitl_queue: [band({ id: 'h', status: 'pending', archivada_en: '2026-11-02T00:00:00Z' })], client_historical_outputs: [] }
    expect((await piezasPorPublicar(base(t), { client_id: SEG, campana_id: null }, AHORA)).frenan).toEqual([])
  })
})
