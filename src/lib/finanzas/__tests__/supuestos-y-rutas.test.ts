/** El módulo financiero de punta a punta, sin modelo: datos del negocio → pedido al agente → supuestos validados → calculadora → bloque guardado y leído. 3 rubros × 3 monedas. */
import { describe, expect, it } from 'vitest'
import type { Db } from '../../manual/revision'
import { rutaAplicarFinanzas, rutaBloqueFinanciero, rutaPrepararFinanzas } from '../rutas'
import { armarPedidoFinanciero, datosDelNegocio, faltantesDe, leerSupuestos, preciosDelSitio } from '../supuestos'

const CID = '33333333-3333-4333-8333-333333333333'
interface Caso { rubro: string; ficha: Record<string, unknown>; precios: string[]; moneda: string; ticketEsperado: number | null }
const jsonLd = (precios: string[], cur: string) => JSON.stringify({ '@type': 'Menu', hasMenuItem: precios.map((p, i) => ({ '@type': 'MenuItem', name: 'Item ' + i, offers: { '@type': 'Offer', price: p, priceCurrency: cur } })) })
const CASOS: Caso[] = [
  { rubro: 'comida', ficha: { id: CID, name: 'Negocio Uno', industry: 'restaurante familiar', country: 'Ecuador', config: {} }, precios: ['3.50', '4.00', '6.00', '4.50'], moneda: 'USD', ticketEsperado: 4.25 },
  { rubro: 'clinica', ficha: { id: CID, name: 'Negocio Dos', industry: 'clínica dental', country: 'Colombia', config: { finanzas: { margen: { valor: 0.55, fuente: 'lo declara la clínica' } } } }, precios: [], moneda: 'COP', ticketEsperado: null },
  { rubro: 'servicio_b2b', ficha: { id: CID, name: 'Negocio Tres', industry: 'consultoría', country: 'España', config: {} }, precios: ['1800', '2400', '900'], moneda: 'EUR', ticketEsperado: 1800 },
]
const RESPUESTA = (campos: string[], cur: string) => JSON.stringify({ supuestos: Object.fromEntries(campos.map((c) => [c, c === 'margen' ? { valor: 0.5, min: 0.4, max: 0.6, fuente: 'margen típico del sector (referencia pública del sector, 2025)' } : c === 'recompra' ? { valor: 1, min: 0.5, max: 2, fuente: 'frecuencia típica de recompra del rubro (rango del sector)' } : c === 'meta_clientes_nuevos' ? { valor: 120, min: 80, max: 160, fuente: 'propuesta a confirmar por el dueño, según su operación' } : c === 'ticket' ? { valor: 50, min: 30, max: 80, fuente: `ticket típico del rubro en ${cur} (rango de mercado)` } : { valor: 4, min: 2, max: 9, fuente: `costo de pauta por cliente del rubro en ${cur} (rango de mercado)` }])), notas: 'lo más incierto: la recompra' })

function base(caso: Caso) {
  const tablas: Record<string, any[]> = {
    clients: [caso.ficha],
    apify_raw: caso.precios.length ? [{ id: 'r1', apify_function: 'website_content_scraper', respuesta: [{ url: 'https://x.example', jsonLd: jsonLd(caso.precios, caso.moneda) }], ensayo: false }] : [],
    client_historical_outputs: [],
  }
  const escrituras: any[] = []
  const db = { from: (t: string) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, insert: (f: any) => { escrituras.push({ t, f }); tablas[t].unshift({ ...f, id: 'b' + escrituras.length, created_at: new Date().toISOString() }); return q }, then: (ok: (v: unknown) => unknown) => ok({ data: tablas[t] ?? [], error: null }) }; return q } } as unknown as Db
  return { db, escrituras, tablas }
}

describe('los datos del negocio: lo que ya dio es DATO con fuente y el agente no lo toca', () => {
  it('los precios del propio sitio dan el ticket como DATO (mediana, con su rango); con menos de 3 precios no', () => {
    expect(preciosDelSitio([{ apify_function: 'website_content_scraper', respuesta: [{ jsonLd: jsonLd(['3.50', '4.00', '6.00', '4.50'], 'USD') }], ensayo: false }])).toMatchObject({ n: 4, min: 3.5, mediana: 4.25, max: 6 })
    expect(preciosDelSitio([{ apify_function: 'website_content_scraper', respuesta: [{ jsonLd: jsonLd(['3.50'], 'USD') }], ensayo: true }])).toBeNull()
    const d = datosDelNegocio({ ficha: { industry: 'x', country: 'y', config: {} }, moneda: { codigo: 'USD', fuente: 'declarada' }, filas: [{ apify_function: 'website_content_scraper', respuesta: [{ jsonLd: jsonLd(['3.50', '4.00'], 'USD') }], ensayo: false }] })
    expect(d.fijos.ticket).toBeUndefined(); expect(faltantesDe(d)).toContain('ticket')
  })
  it('lo que la ficha declara (config.finanzas) entra como dato, con su fuente', () => {
    const d = datosDelNegocio({ ficha: { config: { finanzas: { margen: { valor: 0.4, fuente: 'lo declara el dueño' }, recompra: 2 } } }, moneda: { codigo: 'USD', fuente: 'x' }, filas: [] })
    expect(d.fijos.margen).toMatchObject({ valor: 0.4, origen: 'dato', fuente: 'lo declara el dueño' }); expect(d.fijos.recompra).toMatchObject({ valor: 2, origen: 'dato' })
    expect(faltantesDe(d)).toEqual(['ticket', 'costo_pauta_por_cliente', 'meta_clientes_nuevos'])
  })
  it('el pedido al agente dice lo fijado, lo que pone él, las reglas (fuente o rango, nunca vacío) y pide solo JSON', () => {
    const d = datosDelNegocio({ ficha: { industry: 'rubro de prueba', country: 'País', config: {} }, moneda: { codigo: 'COP', fuente: 'por omisión del país' }, filas: [] })
    const { campos, task } = armarPedidoFinanciero(d)
    expect(campos).toHaveLength(5); expect(task).toMatch(/NUNCA dejes un campo vacío/); expect(task).toMatch(/TÚ PONES ESTOS 5/); expect(task).toMatch(/rango AMPLIO/); expect(task).toMatch(/Responde SOLO un objeto JSON/); expect(task).toContain('COP')
  })
})

describe('leer lo que contestó el agente: valida cada supuesto', () => {
  const campos = ['ticket', 'margen', 'recompra', 'costo_pauta_por_cliente', 'meta_clientes_nuevos'] as const
  it('una respuesta buena (con texto alrededor): 5 supuestos, todos de origen «supuesto» y con su fuente', () => {
    const r = leerSupuestos('Claro:\n' + RESPUESTA([...campos], 'USD') + '\nlisto', campos)
    expect(r.ok).toBe(true); expect(Object.keys(r.supuestos)).toHaveLength(5); expect(Object.values(r.supuestos).every((d) => d!.origen === 'supuesto' && d!.fuente.length > 8)).toBe(true); expect(r.notas).toMatch(/recompra/)
  })
  it.each([
    ['sin fuente', { margen: { valor: 0.5, min: 0.4, max: 0.6, fuente: '' } }, /fuente/],
    ['margen mayor que 1', { margen: { valor: 55, fuente: 'margen típico del sector (porcentaje mal escrito)' } }, /fuera de lo razonable/],
    ['rango al revés', { margen: { valor: 0.5, min: 0.7, max: 0.4, fuente: 'rango de mercado del sector' } }, /mínimo es mayor/],
    ['valor que no es número', { margen: { valor: 'medio', fuente: 'rango de mercado del sector' } }, /no es un número/],
  ])('rechaza: %s', (_n, bloque, re) => {
    const r = leerSupuestos(JSON.stringify({ supuestos: bloque }), ['margen'])
    expect(r.ok).toBe(false); expect(JSON.stringify(r.rechazados)).toMatch(re); expect(r.supuestos.margen).toBeUndefined()
  })
  it('un campo que no se le pidió (o que ya es dato del negocio) NO se toma; un campo que falta se dice; una respuesta sin JSON también', () => {
    const r = leerSupuestos(RESPUESTA(['ticket', 'margen'], 'USD'), ['margen'])
    expect(r.supuestos.ticket).toBeUndefined(); expect(JSON.stringify(r.rechazados)).toMatch(/no se le pidió ese campo/)
    expect(leerSupuestos('no pude', ['margen']).rechazados[0].motivo).toMatch(/JSON legible/)
    expect(leerSupuestos(JSON.stringify({ supuestos: {} }), ['margen']).rechazados[0].motivo).toMatch(/no lo puso/)
  })
})

describe.each(CASOS)('punto a punto · $rubro ($moneda)', (caso) => {
  it('preparar: el ticket sale de sus precios publicados (dato) o se le pide al agente; la moneda sale del país; el pedido es solo de lo que falta', async () => {
    const { db } = base(caso)
    const r = await rutaPrepararFinanzas(db, { client_id: CID })
    expect(r.status).toBe(200); expect(r.body.moneda).toBe(caso.moneda)
    const faltantes = r.body.faltantes as string[]
    if (caso.ticketEsperado !== null) { expect((r.body.fijos as any).ticket.valor).toBe(caso.ticketEsperado); expect(faltantes).not.toContain('ticket') } else expect(faltantes).toContain('ticket')
    if ((caso.ficha.config as any).finanzas) expect(faltantes).not.toContain('margen')
    expect((r.body.pedido as any).campos).toEqual(faltantes)
  })
  it('aplicar en ensayo: calcula con los datos + los supuestos del agente, SIN guardar; cada cifra dice dato o supuesto', async () => {
    const { db, escrituras } = base(caso)
    const prep = await rutaPrepararFinanzas(db, { client_id: CID })
    const campos = (prep.body.pedido as any).campos as string[]
    const r = await rutaAplicarFinanzas(db, { client_id: CID, dry_run: true, response: RESPUESTA(campos, caso.moneda) })
    expect(r.status).toBe(200); expect(r.body.dry_run).toBe(true); expect(escrituras).toEqual([])
    const salida = r.body.salida as any
    expect(salida.moneda).toBe(caso.moneda); expect(salida.escenarios).toHaveLength(3)
    if (caso.ticketEsperado !== null) { expect(salida.entradas.ticket.origen).toBe('dato'); expect(salida.entradas.ticket.valor).toBe(caso.ticketEsperado) }
    expect(salida.entradas.costo_pauta_por_cliente.origen).toBe('supuesto'); expect(salida.presupuesto_para_la_meta.origen).toBe('supuesto')
    expect(String(r.body.bloque_texto)).toContain(`Moneda: ${caso.moneda}`); expect((r.body.cifras as any[]).length).toBe(5)
  })
  it('lo que el negocio dio manda sobre lo que diga el agente (aunque el agente lo contradiga)', async () => {
    const { db } = base(caso)
    const prep = await rutaPrepararFinanzas(db, { client_id: CID })
    const campos = (prep.body.pedido as any).campos as string[]
    const r = await rutaAplicarFinanzas(db, { client_id: CID, dry_run: true, response: RESPUESTA(['ticket', 'margen', 'recompra', 'costo_pauta_por_cliente', 'meta_clientes_nuevos'], caso.moneda) })
    const salida = r.body.salida as any
    if (caso.ticketEsperado !== null) expect(salida.entradas.ticket.valor).toBe(caso.ticketEsperado)
    if ((caso.ficha.config as any).finanzas) expect(salida.entradas.margen.valor).toBe(0.55)
    expect(campos.length).toBeGreaterThan(0)
  })
  it('aplicar de verdad guarda el bloque UNA vez y la planeación lo lee de vuelta con sus cifras', async () => {
    const { db, escrituras } = base(caso)
    const prep = await rutaPrepararFinanzas(db, { client_id: CID })
    const campos = (prep.body.pedido as any).campos as string[]
    const a = await rutaAplicarFinanzas(db, { client_id: CID, dry_run: false, response: RESPUESTA(campos, caso.moneda) })
    expect(a.body.aplicado).toBe(true); expect(escrituras).toHaveLength(1)
    expect(escrituras[0].f).toMatchObject({ output_type: 'bloque_financiero', producing_agent: 'finance-financial-analyst' })
    const b = await rutaBloqueFinanciero(db, { client_id: CID })
    const bloque = (b.body as any).bloque
    expect(bloque.moneda).toBe(caso.moneda); expect(bloque.cifras).toHaveLength(5); expect(bloque.texto).toContain('BLOQUE FINANCIERO'); expect(bloque.dias).toBe(0)
  })
})

describe('nunca celdas vacías ni números a medias', () => {
  const caso = CASOS[0]
  it('si el agente no contesta o contesta mal, NO se guarda nada y se dice qué falta', async () => {
    const { db, escrituras } = base(caso)
    for (const response of ['no pude', JSON.stringify({ supuestos: { margen: { valor: 0.5, fuente: '' } } })]) {
      const r = await rutaAplicarFinanzas(db, { client_id: CID, dry_run: false, response })
      expect(r.body.aplicado).toBe(false); expect(JSON.stringify(r.body)).toMatch(/faltan|rechazados/)
    }
    expect(escrituras).toEqual([])
  })
  it('sin la moneda del negocio no se calcula', async () => {
    const { db } = base({ ...caso, ficha: { id: CID, name: 'X', industry: 'x', country: 'País inventado', config: {} } })
    const r = await rutaAplicarFinanzas(db, { client_id: CID, dry_run: true, response: RESPUESTA(['ticket'], 'USD') })
    expect(r.body.aplicado).toBe(false); expect(String(r.body.motivo)).toMatch(/moneda/)
  })
  it('dry_run obligatorio; uuid; cliente inexistente; un fallo de lectura del bloque NO se lee como «no hay bloque»', async () => {
    const { db } = base(caso)
    expect((await rutaAplicarFinanzas(db, { client_id: CID, response: '' })).status).toBe(400)
    expect((await rutaPrepararFinanzas(db, { client_id: 'x' })).status).toBe(400)
    const sinCliente = { from: () => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }) }; return q } } as unknown as Db
    expect((await rutaPrepararFinanzas(sinCliente, { client_id: CID })).status).toBe(404)
    const roto = { from: () => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (ok: (v: unknown) => unknown) => ok({ data: null, error: { message: 'la base no contestó' } }) }; return q } } as unknown as Db
    const r = await rutaBloqueFinanciero(roto, { client_id: CID })
    expect(r.status).toBe(502); expect(JSON.stringify(r.body)).toMatch(/la base no contestó/)
  })
  it('sin ningún bloque guardado: bloque null (no es un error)', async () => {
    const { db } = base(caso)
    expect((await rutaBloqueFinanciero(db, { client_id: CID })).body).toMatchObject({ ok: true, bloque: null })
  })
})
