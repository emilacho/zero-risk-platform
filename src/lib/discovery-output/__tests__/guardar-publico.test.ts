// 19-nov · juntar públicos en el alta · entrega 1 (CC1 · certifica CC6) · la función única de los dos caminos de escritura de `client_icp_documents`
import { describe, it, expect, vi } from 'vitest'
import { guardarPublico, leerDecision, type Db } from '../guardar-publico'

const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const OTRO = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'

type Fila = Record<string, unknown> & { id: string }
function base(o: { filas?: Fila[]; fallaLeer?: string; fallaEscribir?: string; lanza?: boolean } = {}) {
  const filas: Fila[] = [...(o.filas ?? [])]
  const escrituras: Array<{ modo: 'insert' | 'upsert'; fila: Record<string, unknown>; onConflict?: string }> = []
  let n = 0
  const db: Db = {
    from(tabla: string) {
      expect(tabla).toBe('client_icp_documents')
      const filtros: Array<[string, unknown]> = []
      let escribir: (() => Lectura) | null = null
      type Lectura = { data: unknown; error: { message: string } | null }
      const leer = (): Lectura => {
        if (o.lanza) throw new Error('conexión cortada')
        if (o.fallaLeer) return { data: null, error: { message: o.fallaLeer } }
        return { data: filas.find((f) => filtros.every(([c, v]) => f[c] === v)) ?? null, error: null }
      }
      const fin = (): Lectura => (escribir ? escribir() : leer())
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
        insert: (fila: Record<string, unknown>) => {
          escribir = () => {
            if (o.lanza) throw new Error('conexión cortada')
            if (o.fallaEscribir) return { data: null, error: { message: o.fallaEscribir } }
            const nueva = { ...fila, id: `nuevo-${++n}` }
            filas.push(nueva); escrituras.push({ modo: 'insert', fila }); return { data: { id: nueva.id }, error: null }
          }
          return q
        },
        upsert: (fila: Record<string, unknown>, op: { onConflict: string }) => {
          escribir = () => {
            if (o.lanza) throw new Error('conexión cortada')
            if (o.fallaEscribir) return { data: null, error: { message: o.fallaEscribir } }
            escrituras.push({ modo: 'upsert', fila, onConflict: op.onConflict })
            const ya = filas.find((f) => f.client_id === fila.client_id && f.audience_segment === fila.audience_segment)
            if (ya) { Object.assign(ya, fila); return { data: { id: ya.id }, error: null } }
            const nueva = { ...fila, id: `nuevo-${++n}` }; filas.push(nueva); return { data: { id: nueva.id }, error: null }
          }
          return q
        },
        maybeSingle: () => Promise.resolve().then(fin),
        single: () => Promise.resolve().then(fin),
        then: (r: (x: Lectura) => unknown, j?: (e: unknown) => unknown) => Promise.resolve().then(fin).then(r, j),
      }
      return q as never
    },
  }
  return { db, filas, escrituras }
}
const vigente = (id: string, nombre: string, client_id = CLIENTE): Fila => ({ id, client_id, audience_segment: nombre, fusionado_en: null })
const publico = (nombre: string) => ({ audience_segment: nombre, segment_priority: 1, geography: 'Olón' })
const MARCAS = ['fusionado_en', 'segmento_de', 'posible_duplicado_de', 'fusion_porque']
// entrega 2 · las marcas viajan SIEMPRE (null cuando no aplican): un público que vuelve no hereda una marca vieja
const SIN_MARCAS = { fusionado_en: null, segmento_de: null, posible_duplicado_de: null, fusion_porque: null }

describe('leerDecision · solo lo exacto, nada se adivina', () => {
  it('lee las 4 formas', () => {
    expect(leerDecision({ nuevo: true, porque: 'nadie se le parece' })).toEqual({ tipo: 'nuevo', porque: 'nadie se le parece' })
    expect(leerDecision({ nuevo: true })).toEqual({ tipo: 'nuevo', porque: null })
    expect(leerDecision({ mismo_que: P1, porque: 'mismo nombre y lugar' })).toEqual({ tipo: 'mismo_que', id: P1, porque: 'mismo nombre y lugar' })
    expect(leerDecision({ dentro_de: P1.toUpperCase(), porque: 'zona norte está en Guayaquil' })).toEqual({ tipo: 'dentro_de', id: P1, porque: 'zona norte está en Guayaquil' })
    expect(leerDecision({ posible_duplicado_de: ` ${P2} `, porque: 'no sé' })).toEqual({ tipo: 'posible_duplicado_de', id: P2, porque: 'no sé' })
  })
  it('lo que no cuadra exacto → null', () => {
    for (const x of [null, undefined, 'mismo', [], {}, { nuevo: false }, { mismo_que: 'p1', porque: 'x' }, { mismo_que: P1 }, { mismo_que: P1, porque: '  ' },
      { mismo_que: P1, dentro_de: P2, porque: 'x' }, { nuevo: true, mismo_que: P1, porque: 'x' }, { dentro_de: 7, porque: 'x' }]) expect(leerDecision(x)).toBeNull()
  })
})

describe('guardarPublico · los dos caminos, sin decisión = como hoy', () => {
  it('🟢 descubrimiento (upsert por client_id,audience_segment) sin decisión: entra vigente, sin marcas ni aviso', async () => {
    const { db, escrituras } = base()
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero en Olón'), modo: 'upsert' })
    expect(r).toEqual({ ok: true, id: 'nuevo-1', vigente: true, aplicada: { tipo: 'nuevo', porque: null }, aviso: null })
    expect(escrituras).toEqual([{ modo: 'upsert', onConflict: 'client_id,audience_segment', fila: { ...publico('Turista playero en Olón'), client_id: CLIENTE, ...SIN_MARCAS } }])
    expect(escrituras[0].fila).toMatchObject(SIN_MARCAS)
  })
  it('🟢 analizador de marca (insert) sin decisión: el mismo resultado por el otro camino', async () => {
    const { db, escrituras } = base()
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Residente zona norte'), modo: 'insert' })
    expect(r).toMatchObject({ ok: true, vigente: true, aviso: null })
    expect(escrituras.map((e) => e.modo)).toEqual(['insert'])
  })
  it('🟢 el client_id de la llamada manda sobre el de la fila', async () => {
    const { db, escrituras } = base()
    await guardarPublico(db, { client_id: CLIENTE, fila: { ...publico('x'), client_id: OTRO }, modo: 'insert' })
    expect(escrituras[0].fila.client_id).toBe(CLIENTE)
  })
})

describe('guardarPublico · la decisión del agente, verificada', () => {
  it('🔴 mismo_que un vigente del cliente: entra ABSORBIDO (fusionado_en + porque) y NO vigente', async () => {
    const { db, escrituras } = base({ filas: [vigente(P1, 'Turistas y visitantes de playa en Olón')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero en Olón'), decision: { mismo_que: P1, porque: 'mismo público con otro nombre' }, modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, vigente: false, aplicada: { tipo: 'mismo_que', id: P1 }, aviso: null })
    expect(escrituras[0].fila).toMatchObject({ fusionado_en: P1, fusion_porque: 'mismo público con otro nombre' })
    expect(escrituras[0].fila).toMatchObject({ segmento_de: null, posible_duplicado_de: null })
  })
  it('🔴 dentro_de: segmento del general, sigue vigente', async () => {
    const { db, escrituras } = base({ filas: [vigente(P1, 'Residentes urbanos de Guayaquil')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Residente zona norte Guayaquil'), decision: { dentro_de: P1, porque: 'zona norte está dentro de Guayaquil' }, modo: 'insert' })
    expect(r).toMatchObject({ ok: true, vigente: true, aplicada: { tipo: 'dentro_de', id: P1 } })
    expect(escrituras[0].fila).toMatchObject({ segmento_de: P1, fusion_porque: 'zona norte está dentro de Guayaquil' })
    expect(escrituras[0].fila).toMatchObject({ fusionado_en: null, posible_duplicado_de: null })
  })
  it('🔴 posible_duplicado_de: los dos vigentes, marcado', async () => {
    const { db, escrituras } = base({ filas: [vigente(P1, 'A')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), decision: { posible_duplicado_de: P1, porque: 'en duda' }, modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, vigente: true })
    expect(escrituras[0].fila).toMatchObject({ posible_duplicado_de: P1, fusion_porque: 'en duda' })
  })
  for (const [caso, filas, esperado] of [
    ['no existe', [], `el público ${P1} no existe`],
    ['es de otro cliente', [vigente(P1, 'A', OTRO)], `el público ${P1} es de otro cliente`],
    ['ya no está vigente', [{ ...vigente(P1, 'A'), fusionado_en: P3 }], `el público ${P1} ya no está vigente`],
  ] as const) {
    it(`🔴 si el destino ${caso}: entra como nuevo, SIN marcas, y se dice`, async () => {
      const { db, escrituras } = base({ filas: [...filas] })
      const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), decision: { mismo_que: P1, porque: 'p' }, modo: 'upsert' })
      expect(r).toMatchObject({ ok: true, vigente: true, aplicada: { tipo: 'nuevo', porque: 'p' }, aviso: `${esperado}; entró como nuevo (decía mismo_que)` })
      expect(escrituras[0].fila).toMatchObject(SIN_MARCAS)
    })
  }
  it('🔴 si no se puede leer el destino: entra como nuevo y se dice (no se marca a ciegas)', async () => {
    const { db, escrituras } = base({ fallaLeer: 'tabla caída' })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), decision: { dentro_de: P1, porque: 'p' }, modo: 'insert' })
    expect(r).toMatchObject({ ok: true, vigente: true, aplicada: { tipo: 'nuevo' }, aviso: `no se pudo leer el público ${P1}: tabla caída; entró como nuevo (decía dentro_de)` })
    expect(escrituras[0].fila).toMatchObject(SIN_MARCAS)
  })
  it('🟢 la decisión ilegible no frena: entra como nuevo y se dice', async () => {
    const { db, escrituras } = base()
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), decision: { mismo_que: 'no-es-un-id', porque: 'p' }, modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, vigente: true, aplicada: { tipo: 'nuevo' }, aviso: 'la decisión de fusión no se pudo leer; entró como nuevo' })
    expect(escrituras[0].fila).toMatchObject(SIN_MARCAS)
  })
  it('🟢 por el upsert, «mismo_que» la fila del MISMO nombre = la misma fila: se refresca sin marcarse contra sí misma', async () => {
    const { db, escrituras, filas } = base({ filas: [vigente(P1, 'Turista playero en Olón')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero en Olón'), decision: { mismo_que: P1, porque: 'es el mismo' }, modo: 'upsert' })
    expect(r).toEqual({ ok: true, id: P1, vigente: true, aplicada: { tipo: 'nuevo', porque: 'es el mismo' }, aviso: null })
    expect(escrituras[0].fila).toMatchObject(SIN_MARCAS)
    expect(filas).toHaveLength(1)
  })
  it('🟢 la decisión explícita «nuevo» no lee nada y entra vigente', async () => {
    const { db, escrituras } = base()
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), decision: { nuevo: true, porque: 'nadie se parece' }, modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, vigente: true, aplicada: { tipo: 'nuevo', porque: 'nadie se parece' }, aviso: null })
    expect(escrituras).toHaveLength(1)
  })
})

describe('guardarPublico · nunca lanza', () => {
  it('error al escribir → ok:false con el nombre y el motivo', async () => {
    const { db } = base({ fallaEscribir: 'duplicate key' })
    expect(await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), modo: 'insert' })).toEqual({ ok: false, motivo: 'no se pudo guardar el público «B»: duplicate key' })
  })
  it('la base que lanza → ok:false', async () => {
    const { db } = base({ lanza: true })
    expect(await guardarPublico(db, { client_id: CLIENTE, fila: publico('B'), modo: 'upsert' })).toEqual({ ok: false, motivo: 'no se pudo guardar el público «B»: conexión cortada' })
  })
})

describe('el descubrimiento usa la función única · un absorbido no se indexa en el cerebro', () => {
  it('persistDiscoveryToBrain: el público vigente se indexa; el ABSORBIDO no; el aviso de fusión queda en errors', async () => {
    vi.resetModules()
    const indexados: string[] = []
    vi.doMock('@/lib/brain/persist-chunks', () => ({ persistChunks: async (_s: unknown, a: { sourceId: string }) => { indexados.push(a.sourceId); return { ok: true, chunks_upserted: 1 } } }))
    const { persistDiscoveryToBrain } = await import('../persist-brain')
    const { db } = base({ filas: [vigente(P1, 'Turistas y visitantes de playa en Olón')] })
    const out = await persistDiscoveryToBrain({
      supabase: db as never,
      enabled: true,
      discovery: { client_id: CLIENTE, own_handles: {}, competitors: [], icp: [
        { audience_segment: 'Turista playero en Olón', pain_points: ['sol'], fusion: { mismo_que: P1, porque: 'mismo público' } },
        { audience_segment: 'Residente zona norte', pain_points: ['tráfico'] },
        { audience_segment: 'Otro', pain_points: ['x'], fusion: { dentro_de: P2, porque: 'p' } },
      ] } as never,
    })
    expect(indexados).toEqual(['nuevo-2', 'nuevo-3'])
    expect(out.icp_document_rows).toBe(3)
    expect(out.errors).toContain(`icp_fusion_Otro: el público ${P2} no existe; entró como nuevo (decía dentro_de)`)
    vi.doUnmock('@/lib/brain/persist-chunks')
  })
})

// 19-nov · 🟡 de CC6 (#1208): 4 caminos reales que ningún sabotaje hacía caer
describe('🟡 CC6 · los 4 caminos sin prueba', () => {
  it('m13 · la entrada del descubrimiento entrega `fusion` tal cual al segmento (si no, la decisión nunca llega)', async () => {
    const { validateDiscoveryShape } = await import('../parse')
    const fusion = { mismo_que: P1, porque: 'mismo público' }
    const r = validateDiscoveryShape({ client_id: CLIENTE, own_handles: {}, competitors: [], icp: [{ audience_segment: 'A', fusion }, { audience_segment: 'B' }] }, CLIENTE)
    expect(r.kind).toBe('ok')
    const icp = (r as unknown as { value: { icp: Array<Record<string, unknown>> } }).value.icp
    expect(icp[0].fusion).toEqual(fusion)
    expect(icp[1]).not.toHaveProperty('fusion')
    const uno = validateDiscoveryShape({ client_id: CLIENTE, own_handles: {}, competitors: [], icp: { audience_segment: 'C', fusion: { nuevo: true } } }, CLIENTE)
    expect((uno as unknown as { value: { icp: Record<string, unknown> } }).value.icp.fusion).toEqual({ nuevo: true })
  })

  it('m17 · un público que no se guarda deja `icp_<nombre>: …` en errors y no se indexa', async () => {
    vi.resetModules()
    const indexados: string[] = []
    vi.doMock('@/lib/brain/persist-chunks', () => ({ persistChunks: async (_s: unknown, a: { sourceId: string }) => { indexados.push(a.sourceId); return { ok: true, chunks_upserted: 1 } } }))
    const { persistDiscoveryToBrain } = await import('../persist-brain')
    const { db } = base({ fallaEscribir: 'duplicate key' })
    const out = await persistDiscoveryToBrain({ supabase: db as never, enabled: true, discovery: { client_id: CLIENTE, own_handles: {}, competitors: [], icp: [{ audience_segment: 'Perdido', pain_points: ['x'] }] } as never })
    expect(out.errors).toContain('icp_Perdido: no se pudo guardar el público «Perdido»: duplicate key')
    expect(out.icp_document_rows).toBe(0)
    expect(indexados).toEqual([])
    vi.doUnmock('@/lib/brain/persist-chunks')
  })

  it('m9 · el analizador de marca cuenta solo los públicos que se guardaron', async () => {
    const { BrandAnalyzer } = await import('@/lib/brand-analyzer')
    let n = 0
    const db = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => (++n === 2 ? { data: null, error: { message: 'caída' } } : { data: { id: `id-${n}` }, error: null }) }) }),
      }),
    }
    const seg = (nombre: string) => ({ audience_segment: nombre, segment_priority: 1, job_titles: [], company_size: null, industries: [], geography: null, goals: [], pain_points: [], jobs_to_be_done: [], objections: [], preferred_channels: [], buying_process: null, recommended_tone: '', messaging_angle: '' })
    const a = new BrandAnalyzer(db as never)
    expect(await a.writeICPsToDB(CLIENTE, { segments: [seg('A'), seg('B'), seg('C')] })).toBe(2)
  })

  for (const data of [null, {}, { id: 7 }]) {
    it(`m10 · si la base no devuelve el id (${JSON.stringify(data)}), el público NO se da por guardado`, async () => {
      const db = { from: () => ({ upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data, error: null }) }) }), insert: () => ({ select: () => ({ single: async () => ({ data, error: null }) }) }) }) }
      for (const modo of ['upsert', 'insert'] as const) {
        expect(await guardarPublico(db as never, { client_id: CLIENTE, fila: publico('B'), modo })).toEqual({ ok: false, motivo: 'no se pudo guardar el público «B»: la base no devolvió el id' })
      }
    })
  }
})

// 19-nov · entrega 2 · condiciones 2 y 3 de CC6 (#1208, 06:15Z)
describe('entrega 2 · un público que vuelve no hereda marcas; «mismo_que» nunca absorbe por UPDATE', () => {
  it('🔴 c3 · un absorbido que vuelve a entrar como nuevo por el upsert queda vigente DE VERDAD (las marcas viejas se borran)', async () => {
    const { db, filas, escrituras } = base({ filas: [{ ...vigente(P2, 'Turista playero'), fusionado_en: P1, fusion_porque: 'viejo' }, vigente(P1, 'Turistas')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero'), modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, id: P2, vigente: true })
    expect(escrituras[0].fila).toMatchObject(SIN_MARCAS)
    expect(filas.find((f) => f.id === P2)).toMatchObject(SIN_MARCAS)
  })
  it('🔴 c3 · un segmento viejo que ahora es «posible_duplicado_de» pierde el segmento_de (no choca con la regla de la base)', async () => {
    const { db, filas } = base({ filas: [{ ...vigente(P2, 'Zona norte'), segmento_de: P3 }, vigente(P1, 'Guayaquil'), vigente(P3, 'Costa')] })
    await guardarPublico(db, { client_id: CLIENTE, fila: publico('Zona norte'), decision: { posible_duplicado_de: P1, porque: 'en duda' }, modo: 'upsert' })
    expect(filas.find((f) => f.id === P2)).toMatchObject({ segmento_de: null, posible_duplicado_de: P1, fusionado_en: null, fusion_porque: 'en duda' })
  })
  it('🔴 c2 · «mismo_que» por el upsert sobre un nombre que YA existe (otra fila): no se absorbe, queda en duda y se dice', async () => {
    const { db, filas, escrituras } = base({ filas: [vigente(P1, 'Turistas de playa'), vigente(P2, 'Turista playero')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero'), decision: { mismo_que: P1, porque: 'mismo público' }, modo: 'upsert' })
    expect(r).toEqual({ ok: true, id: P2, vigente: true, aplicada: { tipo: 'posible_duplicado_de', id: P1, porque: 'mismo público' },
      aviso: `el público «Turista playero» ya existe; no se absorbe al actualizarlo: queda como posible duplicado de ${P1}` })
    expect(escrituras[0].fila).toMatchObject({ fusionado_en: null, posible_duplicado_de: P1, segmento_de: null })
    expect(filas.find((f) => f.id === P2)?.fusionado_en).toBeNull()
  })
  it('🔴 c2 · si no se puede ver si el nombre ya existe: no se absorbe a ciegas (entra como nuevo y se dice)', async () => {
    let n = 0
    const { db: real } = base({ filas: [vigente(P1, 'Turistas de playa')] })
    const db: Db = { from: (t: string) => {
      const q = real.from(t) as unknown as Record<string, unknown>
      if (++n !== 2) return q as never
      const falla = { select: () => falla, eq: () => falla, maybeSingle: async () => ({ data: null, error: { message: 'caída' } }) }
      return falla as never
    } }
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero'), decision: { mismo_que: P1, porque: 'p' }, modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, vigente: true, aplicada: { tipo: 'nuevo' }, aviso: 'no se pudo ver si el público «Turista playero» ya existe: caída; entró como nuevo (decía mismo_que)' })
  })
  it('🟢 c2 · el nombre nuevo (no existe): «mismo_que» sí entra absorbido, por insert del upsert', async () => {
    const { db, filas } = base({ filas: [vigente(P1, 'Turistas de playa')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero'), decision: { mismo_que: P1, porque: 'p' }, modo: 'upsert' })
    expect(r).toMatchObject({ ok: true, vigente: false, aplicada: { tipo: 'mismo_que', id: P1 }, aviso: null })
    expect(filas).toHaveLength(2)
  })
  it('🟢 c2 · el analizador (insert) no busca el nombre: siempre es fila nueva', async () => {
    const { db } = base({ filas: [vigente(P1, 'Turistas de playa'), vigente(P2, 'Turista playero')] })
    const r = await guardarPublico(db, { client_id: CLIENTE, fila: publico('Turista playero'), decision: { mismo_que: P1, porque: 'p' }, modo: 'insert' })
    expect(r).toMatchObject({ ok: true, vigente: false, aplicada: { tipo: 'mismo_que' } })
  })
})
