// @ts-nocheck · pruebas de los constructores de n8n: tipan mal a propósito los nodos de código (CI 04-nov)
/**
 * 02-nov · recolector de métricas de Google Maps (CC#2 · cola punto 3). Ejecuta el CÓDIGO REAL de los nodos con una base y un destino falsos.
 * Garantías: nace APAGADO, en ENSAYO y SIN negocio elegido (nada se registra hasta que el dueño lo fije) · US$ 0 · solo el negocio elegido (nunca uno de nombre parecido) ·
 * lo no medido se OMITE (nunca 0) · una lectura por día · fallo del destino = ERROR.
 */
import { describe, expect, it } from 'vitest'
import { construir, N, LEER_Y_MAPEAR, RESUMEN } from '../scripts/ops/oficina-marketing/construir-metricas-maps.mjs'

const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor as new (...a: string[]) => (...a: any[]) => Promise<any>
const C1 = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const PLACE = 'ChIJ3asaJgArLJAR4P0azPMVwBc'
const lugar = (o: any = {}) => ({ title: 'Naufrago', placeId: PLACE, totalScore: 4.9, reviewsCount: 28, url: 'https://maps.example/naufrago', ...o })
const ajeno = { title: 'Naufragos Bar', placeId: 'ChIJbSF3pQttLZARSS6h-LzrRiM', totalScore: 4.4, reviewsCount: 18 }
const fila = (id: number, created_at: string, respuesta: any[]) => ({ id, created_at, respuesta })

async function leer(filas: any[], params: any, ids = C1) {
  const pedidos: string[] = []
  const ctx = { helpers: { httpRequest: async (o: any) => { pedidos.push(o.url); return filas } } }
  const f = new AsyncFunction('$', '$env', LEER_Y_MAPEAR)
  const salida = await f.call(ctx, () => ({ first: () => ({ json: params }) }), { SUPABASE_SERVICE_ROLE_KEY: 'k' })
  return { salida: salida.map((s: any) => s.json), pedidos, ids }
}
const P = (o: any = {}) => ({ dry_run: true, dias_atras: 1, lugares: { [C1]: PLACE }, ...o })

describe('recolector de Google Maps · estructura', () => {
  const f = construir()
  it('nace apagado, sin gasto, en ensayo y SIN negocio elegido', () => {
    expect(f.active).toBe(false)
    expect(JSON.stringify(f)).not.toMatch(/api\.apify|run-sdk|anthropic|openai/i)
    const p = f.nodes.find((n: any) => n.name === N.parametros).parameters.jsCode
    expect(p).toContain('dry_run: true'); expect(p).toContain('lugares: {}')
  })
  it('conexiones íntegras y destino = el endpoint de métricas con la llave interna', () => {
    const nombres = new Set(f.nodes.map((n: any) => n.name))
    for (const [de, c] of Object.entries<any>(f.connections)) { expect(nombres.has(de)).toBe(true); for (const g of c.main) for (const x of g) expect(nombres.has(x.node)).toBe(true) }
    const h = f.nodes.find((n: any) => n.name === N.registrar)
    expect(h.parameters.url).toContain('/api/metricas/registrar'); expect(JSON.stringify(h.parameters.headerParameters)).toContain('INTERNAL_API_KEY')
  })
})

describe('recolector de Google Maps · lectura y mapeo', () => {
  it('SIN negocio elegido no lee ni registra nada (la elección es del dueño)', async () => {
    for (const lugares of [{}, undefined, null, [], { [C1]: '' }, { 'no-es-uuid': PLACE }]) {
      const { salida, pedidos } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [lugar()])], { dry_run: true, dias_atras: 1, lugares })
      expect(salida[0].sin_envio).toBe(true); expect(pedidos).toHaveLength(0)
    }
  })
  it('arma el cuerpo del contrato con el negocio elegido: puntaje decimal, reseñas, fuente publico, dia de Ecuador y dry_run', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [ajeno, lugar()])], P())
    expect(salida).toHaveLength(1)
    expect(salida[0].cuerpo).toMatchObject({ client_id: C1, red: 'google_maps', fuente: 'publico', dia: '2026-11-02', dry_run: true, publicaciones: [] })
    expect(salida[0].cuerpo.cuenta).toMatchObject({ cuenta_externa: PLACE, handle: 'Naufrago', puntaje: 4.9, resenas: 28 })
  })
  it('NUNCA toma un negocio de nombre parecido: si el elegido no está en la lectura, no se registra nada', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [ajeno, { ...lugar(), placeId: 'otro' }])], P())
    expect(salida[0].sin_envio).toBe(true); expect(JSON.stringify(salida[0].omitidos)).toContain(PLACE)
  })
  it('lo no medido se omite, nunca 0 (puntaje null o fuera de 0–5, reseñas negativas)', async () => {
    for (const malo of [{ totalScore: null, reviewsCount: null }, { totalScore: 7, reviewsCount: -1 }, { totalScore: 'x', reviewsCount: '28' }]) {
      const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [lugar(malo)])], P())
      expect('puntaje' in salida[0].cuerpo.cuenta).toBe(false); expect('resenas' in salida[0].cuerpo.cuenta).toBe(false)
    }
    const { salida } = await leer([fila(1, '2026-11-02T14:00:00.000Z', [lugar({ totalScore: 0, reviewsCount: 0 })])], P())
    expect(salida[0].cuerpo.cuenta).toMatchObject({ puntaje: 0, resenas: 0 })    // un cero MEDIDO sí se guarda
  })
  it('una lectura por día: la última que trae el negocio; si la más nueva no lo trae, se mira la anterior del mismo día', async () => {
    const { salida } = await leer([
      fila(3, '2026-11-02T16:00:00.000Z', [ajeno]),                                  // la más nueva no trae el negocio
      fila(2, '2026-11-02T12:00:00.000Z', [lugar({ totalScore: 4.8 })]),
      fila(1, '2026-11-02T08:00:00.000Z', [lugar({ totalScore: 4.1 })]),
      fila(0, '2026-11-01T20:00:00.000Z', [lugar({ totalScore: 4.0 })]),
    ], P({ dias_atras: 5 }))
    expect(salida.map((s: any) => [s.dia, s.cuerpo.cuenta.puntaje])).toEqual([['2026-11-02', 4.8], ['2026-11-01', 4.0]])
  })
  it('el día es el de Ecuador: una lectura a las 03:00 UTC cae en el día anterior', async () => {
    const { salida } = await leer([fila(1, '2026-11-02T03:00:00.000Z', [lugar()])], P())
    expect(salida[0].dia).toBe('2026-11-01')
  })
  it('solo lee ensayo=false de own_google_maps_profile del cliente elegido y respeta el tope de 60 días', async () => {
    const { pedidos } = await leer([], P({ dias_atras: 9999 }))
    const q = decodeURIComponent(pedidos[0])
    expect(q).toContain('apify_function=eq.own_google_maps_profile'); expect(q).toContain('ensayo=eq.false'); expect(q).toContain('client_id=eq.' + C1)
    expect(Date.now() - Date.parse(/created_at=gte\.([^&]+)/.exec(q)![1])).toBeLessThanOrEqual(60 * 86400000 + 60000)
  })
  it('solo un dry_run:false explícito quita el ensayo', async () => {
    const real = await leer([fila(1, '2026-11-02T14:00:00.000Z', [lugar()])], P({ dry_run: false }))
    expect('dry_run' in real.salida[0].cuerpo).toBe(false)
    for (const raro of [undefined, 'false', 0, null]) expect((await leer([fila(1, '2026-11-02T14:00:00.000Z', [lugar()])], P({ dry_run: raro }))).salida[0].cuerpo.dry_run).toBe(true)
  })
})

describe('recolector de Google Maps · cierre', () => {
  const correr = (entradas: any[], previos: any[]) => new AsyncFunction('$', '$input', RESUMEN)(() => ({ all: () => previos.map((json) => ({ json })) }), { all: () => entradas.map((json) => ({ json })) })
  const previo = { cliente: C1, dia: '2026-11-02', publicaciones_n: 0, dry_run: true, omitidos: [] }
  it('registrado → ok; rechazo → ERROR con el nombre de Maps; nada que enviar → ok y lo dice', async () => {
    expect((await correr([{ statusCode: 200, body: {} }], [previo]))[0].json).toMatchObject({ ok: true, enviados: 1 })
    await expect(correr([{ statusCode: 500, body: {} }], [previo])).rejects.toThrow(/METRICAS_MAPS_FALLO/)
    expect((await correr([{ sin_envio: true, dry_run: true, motivo: 'x', omitidos: [] }], []))[0].json).toMatchObject({ ok: true, enviados: 0 })
  })
})
