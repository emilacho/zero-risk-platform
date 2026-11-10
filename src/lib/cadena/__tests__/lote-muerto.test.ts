/**
 * LOTE MUERTO (GO Lenovo 2026-11-10 18:14Z · traba de piezas, arreglo 2) · sin base, sin red, sin modelo (US$ 0).
 * Caso real: el lote 2026-W46 de Náufrago (campaña 28de888e) se mandó a las 14:33:33Z (1 viaje en la sala, `correlation_id` 20cbf3e8), la parte murió en la guarda del
 * manual y la sala contestó «duplicado» cada 30 min. Segundo cliente: Zero Risk Seguridad Industrial (otro rubro); su campaña y sus filas son CONSTRUIDAS (no tiene campaña real).
 * La sala de la prueba es un libro en memoria que hace lo mismo que la de verdad: una llave ya vista = «duplicado» (no suma envío); una llave nueva = un viaje nuevo.
 */
import { describe, expect, it } from 'vitest'
import { filasLotes } from '../datos'
import { decidirLote, llaveDeEnvio, claveDelAviso, HORAS_PARA_DARLO_POR_MUERTO, MAX_REINTENTOS_DE_LOTE } from '../lote-muerto'
import type { Almacen, Campana } from '../almacen'
import type { Fila } from '../tipos'

const NAUFRAGO = { campana: '28de888e-b3f2-4aca-86b3-2c7f7bf6685a', client: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312' } // real
const SEGURIDAD = { campana: '5e9a0000-0000-4000-8000-00000000c0de', client: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5' } // client_id real · campaña construida
const ENVIO_REAL = '2026-11-10T14:33:33.000Z'
const HOY = '2026-11-10'
const wf = { workflow_id: 'wf-vigia', workflow_execution_id: 'ex-1' }
const horas = (base: string, h: number) => new Date(Date.parse(base) + h * 3600_000).toISOString()

type Viaje = { llave: string; en: string }
function escena(opciones: { seco?: boolean; sinPuertos?: boolean; enviosFallan?: boolean } = {}) {
  const sala = new Map<string, Viaje[]>() // client|lote → viajes
  const avisos: Array<{ clave: string; accion: string }> = []
  const buzon = new Set<string>()
  const campana = (c: typeof NAUFRAGO): Campana => ({ id: c.campana, client_id: c.client, estado: 'activa', seco: opciones.seco === true } as unknown as Campana)
  const fila = (id: string, c: typeof NAUFRAGO, fecha: string, estado: Fila['estado'] = 'validada'): Fila => ({ id, campana_id: c.campana, fecha, red: 'instagram', formato: 'foto', estado } as unknown as Fila)
  const filas: Fila[] = [
    fila('n-12-a', NAUFRAGO, '2026-11-12'), fila('n-13-a', NAUFRAGO, '2026-11-13'), fila('n-15-a', NAUFRAGO, '2026-11-15'),
    fila('s-12-a', SEGURIDAD, '2026-11-12'), fila('s-14-a', SEGURIDAD, '2026-11-14'),
  ]
  const al = {
    campana: async (id: string) => [campana(NAUFRAGO), campana(SEGURIDAD)].find((c) => c.id === id) ?? null,
    leerConfig: async (k: string) => (k === 'flujos' ? ['wf-vigia'] : k === 'arranque_por_evento' ? true : undefined),
    journeyExiste: async () => false,
    formatos: async () => ({}),
    ultimaVersionDeCalendario: async () => 1,
    filas: async (campanaId: string) => filas.filter((f) => (f as unknown as { campana_id: string }).campana_id === campanaId),
    ...(opciones.sinPuertos ? {} : {
      enviosDeLote: async (clientId: string, lote: string) => {
        if (opciones.enviosFallan) throw new Error('sala_event_log caída')
        const v = sala.get(`${clientId}|${lote}`) ?? []
        return { envios: v.length, ultimo_en: v.length ? v[v.length - 1].en : null }
      },
      avisarLoteMuerto: async (a: { clave: string }) => {
        const accion = buzon.has(a.clave) ? 'repetida' : 'abrio'
        buzon.add(a.clave); avisos.push({ clave: a.clave, accion })
        return { ok: true as const, accion }
      },
    }),
  } as unknown as Almacen
  /** lo que hace el vigía con la respuesta: manda cada sobre a la sala (llave vista = duplicado) */
  const mandar = (c: typeof NAUFRAGO, lotes: Array<{ lote: string; idempotency_key: string }>, en: string) => {
    for (const l of lotes) {
      const k = `${c.client}|${l.lote}`, v = sala.get(k) ?? []
      if (!v.some((x) => x.llave === l.idempotency_key)) sala.set(k, [...v, { llave: l.idempotency_key, en }])
    }
  }
  const pasada = async (c: typeof NAUFRAGO, ahora: string) => {
    const r = await filasLotes(al, { ...wf, campana_id: c.campana, hoy: HOY }, ahora)
    const lotes = r.cuerpo.lotes as Array<{ lote: string; idempotency_key: string; fila_ids: string[] }>
    mandar(c, lotes, ahora)
    return { r, lotes }
  }
  return { sala, avisos, filas, pasada, mandar, al }
}

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
    const primera = await e.pasada(C, ENVIO_REAL) // el envío original
    const base = primera.lotes[0].idempotency_key
    expect(base).not.toMatch(/:r\d$/)
    // las pasadas de cada 30 min dentro del plazo: misma llave (la sala dice duplicado), sin aviso
    for (const h of [0.5, 1, 1.5]) expect((await e.pasada(C, horas(ENVIO_REAL, h))).lotes[0].idempotency_key).toBe(base)
    expect(e.avisos).toEqual([])
    // pasado el plazo: reintento 1, con aviso que ABRE el incidente
    const r1 = await e.pasada(C, horas(ENVIO_REAL, 2))
    expect(r1.lotes[0].idempotency_key).toBe(`${base}:r1`)
    expect(r1.r.cuerpo.lotes_muertos).toEqual([expect.objectContaining({ lote: '2026-W46', accion: 'reintento', intento: 1 })])
    // la pasada siguiente: el reintento es nuevo, nada más
    expect((await e.pasada(C, horas(ENVIO_REAL, 2.5))).lotes[0].idempotency_key).toBe(`${base}:r1`)
    // r2 y r3, cada uno tras su plazo
    await e.pasada(C, horas(ENVIO_REAL, 4)); await e.pasada(C, horas(ENVIO_REAL, 6))
    expect(e.sala.get(`${C.client}|2026-W46`)?.map((v) => v.llave)).toEqual([base, `${base}:r1`, `${base}:r2`, `${base}:r3`])
    // agotado: deja de mandarse y no vuelve a avisar
    const fin = await e.pasada(C, horas(ENVIO_REAL, 8))
    expect(fin.lotes.find((l) => l.lote === '2026-W46')).toBeUndefined()
    expect(fin.r.cuerpo.lotes_muertos).toEqual([expect.objectContaining({ lote: '2026-W46', accion: 'agotado' })])
    await e.pasada(C, horas(ENVIO_REAL, 12))
    // un solo incidente por lote: abrió una vez (el único mensaje a Slack); los demás reintentos solo suman repeticiones
    expect(e.avisos.map((a) => a.accion)).toEqual(['abrio', 'repetida', 'repetida'])
    expect(new Set(e.avisos.map((a) => a.clave))).toEqual(new Set([claveDelAviso(C.campana, '2026-W46')]))
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
})

describe('lo que no cambia', () => {
  it('campaña en seco: nunca se reintenta (sus filas no se marcan a propósito)', async () => {
    const e = escena({ seco: true })
    const a = await e.pasada(NAUFRAGO, ENVIO_REAL)
    const b = await e.pasada(NAUFRAGO, horas(ENVIO_REAL, 9))
    expect(b.lotes).toEqual(a.lotes); expect(e.avisos).toEqual([])
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
    expect(e.sala.get(`${NAUFRAGO.client}|2026-W46`)?.length).toBe(2)
    expect(e.sala.get(`${SEGURIDAD.client}|2026-W46`)?.length).toBe(1)
    expect(e.avisos.map((a) => a.clave)).toEqual([claveDelAviso(NAUFRAGO.campana, '2026-W46')])
  })
})
