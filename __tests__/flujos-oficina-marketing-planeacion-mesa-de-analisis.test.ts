/**
 * 01-nov · FIRMA de Emilio (08:42Z) · ORDEN de CC1 a CC2 · la planeación con la MESA DE ANÁLISIS y la CARPETA del cliente. US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «⓪ Llave», «elegir brazos», la firma de la rama nueva, la junta y «Redactor (B4)» del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Lo que fija: sin `con_analisis` el flujo pide LO MISMO que hoy; con él salen 5 pedidos (uno por tipo) a la rama nueva, que entra como 5.ª entrada de la junta;
 * un valor raro se rechaza antes de gastar; el redactor ve la carpeta ENTERA (sin el recorte de 2.500), fuera de `datos`, y el informe del análisis con tope de 6.000.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = leer('nuevo')
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala' }
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })
const WEBHOOK = (body: Record<string, unknown>) => ({ 'Webhook · planeacion': [web(body)] })
const FICHA = { id: CLIENTE, name: 'Cafetería Prueba', industry: 'restaurante', website_url: 'https://cafeteria-prueba.example', country: 'Ecuador', config: {} }
const TIPOS = ['mercado', 'competencia', 'voz_del_publico', 'escucha_x', 'retencion']

const elegir = (flujo: any, body: Record<string, unknown>, ficha: Record<string, unknown> = FICHA) =>
  recorrer(flujo, 'elegir brazos', ficha, { previos: WEBHOOK(body), hasta: ['V9 · ¿relleno permitido para Apify?'], env: ENV, http: async () => { throw new Error('elegir brazos no llama a nadie') } })
const delAnalisis = (r: any): any[] => (r.item?.pedidos ?? []).filter((p: any) => p.brazo === 'analisis')

describe('el cableado de la rama nueva', () => {
  it('«Mesa de análisis» sale de «elegir brazos», pasa por su firma y entra por la 5.ª entrada de la junta', () => {
    expect(nuevo.connections['elegir brazos'].main[0].map((c: any) => c.node)).toContain('Mesa de análisis')
    expect(nuevo.connections['Mesa de análisis'].main[0]).toEqual([{ node: 'firma de la rama · analisis', type: 'main', index: 0 }])
    expect(nuevo.connections['firma de la rama · analisis'].main[0]).toEqual([{ node: 'Junta · esperar los 3 brazos', type: 'main', index: 4 }])
    expect(nuevo.nodes.find((n: any) => n.name === 'Junta · esperar los 3 brazos').parameters.numberInputs).toBe(5)
    const entradas = Object.entries(nuevo.connections).flatMap(([de, c]: any) => (c.main ?? []).flat().filter((x: any) => x.node === 'Junta · esperar los 3 brazos').map((x: any) => x.index))
    expect(entradas.sort()).toEqual([0, 1, 2, 3, 4])
  })
  it('«Mesa de análisis» es hermana de «Brazo · mercado» (misma forma; otra puerta y otro nombre de brazo)', () => {
    const a = nuevo.nodes.find((n: any) => n.name === 'Brazo · mercado'), b = nuevo.nodes.find((n: any) => n.name === 'Mesa de análisis')
    expect(b.parameters.url).toContain('/api/planeacion/mesa-de-analisis')
    expect(b.parameters.jsonBody).toContain('pedidos: ($json.pedidos || []).filter(p => p.brazo === "analisis")')
    expect(b.parameters.jsonBody).toContain('dry_run: $("Webhook · planeacion").first().json.body.dry_run')
    expect(b.parameters.options).toEqual(a.parameters.options)
    expect(b.parameters.headerParameters).toEqual(a.parameters.headerParameters)
    expect(b.onError).toBe(a.onError)
    for (const n of ['Mesa de análisis', 'firma de la rama · analisis']) expect(JSON.stringify(nuevo.nodes.find((x: any) => x.name === n))).not.toMatch(/mercado/i)
  })
})

describe('«⓪ Llave» · con_analisis', () => {
  const llave = (body: Record<string, unknown>) => recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web(body), { env: ENV, hasta: ['V9 · ¿pide el pre-vuelo?'] })
  it('true, false, null o ausente pasan', async () => {
    for (const v of [true, false, null, undefined]) expect((await llave({ client_id: CLIENTE, con_analisis: v })).ultimo).toBe('V9 · ¿pide el pre-vuelo?')
  })
  it('🔴 cualquier otro valor DETIENE antes de gastar (un «true» entre comillas no enciende un gasto)', async () => {
    for (const raro of ['true', 'si', 1, 0, [], {}]) await expect(llave({ client_id: CLIENTE, con_analisis: raro })).rejects.toThrow(/PLANEACION_CON_ANALISIS_INVALIDO/)
  })
})

describe('«elegir brazos» · los pedidos de la mesa', () => {
  it('sin con_analisis: exactamente los pedidos de hoy (ninguno a la rama nueva)', async () => {
    const hoy = await elegir(vivo, { client_id: CLIENTE }), ahora = await elegir(nuevo, { client_id: CLIENTE })
    expect(delAnalisis(ahora)).toHaveLength(0)
    expect(ahora.item.pedidos).toEqual(hoy.item.pedidos)
    expect(ahora.item.descartados).toEqual(hoy.item.descartados)
  })
  it('con con_analisis: true salen 5 pedidos, uno por tipo, al final y con orden seguido; los demás son los de hoy', async () => {
    const hoy = await elegir(vivo, { client_id: CLIENTE }), con = await elegir(nuevo, { client_id: CLIENTE, con_analisis: true })
    const a = delAnalisis(con)
    expect(a.map((p) => p.params.tipo)).toEqual(TIPOS)
    expect(new Set(a.map((p) => p.objetivo)).size).toBe(5)
    const resto = con.item.pedidos.filter((p: any) => p.brazo !== 'analisis')
    expect(resto).toEqual(hoy.item.pedidos)
    expect(con.item.pedidos.map((p: any) => p.orden)).toEqual(con.item.pedidos.map((_: any, i: number) => i + 1))
  })
  it('con_analisis y con_mercado juntos: conviven (el alias de mercado sigue vivo)', async () => {
    const con = await elegir(nuevo, { client_id: CLIENTE, con_analisis: true, con_mercado: true })
    expect(con.item.pedidos.filter((p: any) => p.brazo === 'mercado')).toHaveLength(1)
    expect(delAnalisis(con)).toHaveLength(5)
  })
  it('false o null no piden nada', async () => {
    for (const v of [false, null]) expect(delAnalisis(await elegir(nuevo, { client_id: CLIENTE, con_analisis: v }))).toHaveLength(0)
  })
})

describe('la firma de la rama y la junta', () => {
  const pedidos = TIPOS.map((t) => ({ brazo: 'analisis', objetivo: 'informe ' + t, params: { tipo: t } }))
  const firmar = (entrada: any, ps: any[] = pedidos) => {
    const f = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', nuevo.nodes.find((n: any) => n.name === 'firma de la rama · analisis').parameters.jsCode)
    return f({ all: () => [{ json: entrada }] }, () => ({ first: () => ({ json: { pedidos: ps } }) }), {}, {}, {})
  }
  it('cada respuesta de la puerta queda firmada como «analisis» con su objetivo', async () => {
    const respuestas = TIPOS.map((t) => ({ brazo: 'analisis', objetivo: 'informe ' + t, estado: 'trajo', datos: { tipo: t, informe: '[PROPUESTA: no es dato del cliente] x' }, fuente: 'mesa' }))
    const out = await firmar({ respuestas })
    expect(out.map((o: any) => o.json.objetivo)).toEqual(TIPOS.map((t) => 'informe ' + t))
    expect(out.every((o: any) => o.json.brazo === 'analisis')).toBe(true)
  })
  it('sin pedido a «analisis» la firma no produce ningún ítem (ni en éxito ni en error)', async () => {
    const otros = [{ brazo: 'apify', objetivo: 'sitio_propio' }]
    expect(await firmar({ respuestas: [] }, otros)).toEqual([])
    expect(await firmar({ error: { message: 'x' } }, otros)).toEqual([])
  })
  it('con pedido y un fallo de red, cada hueco queda firmado como «analisis» (no «desconocido»)', async () => {
    const out = await firmar({ error: { message: 'ECONNRESET' } })
    expect(out).toHaveLength(5)
    expect(out.every((o: any) => o.json.brazo === 'analisis' && o.json.error)).toBe(true)
  })
  it('la junta cuenta el brazo «analisis» como pedido y como contestado', async () => {
    const junta = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', nuevo.nodes.find((n: any) => n.name === '[PLANEACIÓN] Junta de brazos').parameters.jsCode)
    const items = [
      { json: { brazo: 'apify', objetivo: 'sitio_propio', estado: 'sin_dato', datos: {}, fuente: 'a', motivo: 'se miró y no hay' } },
      { json: { brazo: 'analisis', objetivo: 'informe competencia', estado: 'trajo', datos: { tipo: 'competencia', informe: '[PROPUESTA: no es dato del cliente] x', es_dato_del_cliente: false }, fuente: 'mesa' } },
    ]
    const ps = [{ brazo: 'apify', objetivo: 'sitio_propio' }, { brazo: 'analisis', objetivo: 'informe competencia' }]
    const dolar = (n: string) => ({ first: () => ({ json: n === 'elegir brazos' ? { pedidos: ps, descartados: [] } : {} }), last: () => ({ json: {} }), all: () => [] })
    const out = await junta({ all: () => items, first: () => items[0] }, dolar, {}, { id: 'wf' }, { id: 'ex' })
    const texto = JSON.stringify(out[0].json)
    expect(texto).toContain('informe competencia')
    expect(texto).toMatch(/"brazos_pedidos":2/)
    expect(texto).toMatch(/"brazos_que_contestaron":2/)
  })
})

// ── «Redactor (B4)» ────────────────────────────────────────────────────────
const LARGO = 'Hallazgo largo. '.repeat(400) // ~6.400 caracteres: más del doble del recorte de 2.500
const CARPETA = {
  resumen_vivo: { estado: 'vigente', actualizado_en: '2026-10-30T10:00:00Z', texto: 'RESUMEN-VIVO-ENTERO: vende ceviche y arroz marinero.' },
  informes: [{ ficha_id: 'f1', tipo: 'voz_del_publico', texto: 'INFORME-A ' + LARGO + ' FIN-INFORME-A', autor: { mesa: 'analisis', agente: 'feedback-synthesizer' }, fecha_de_corte: '2026-10-30T00:00:00Z', citas: ['ficha-1', 'ficha-2'], origen: 'sintesis_de_oficina', hay_material_nuevo_desde_el_corte: true, fichas_nuevas_desde_el_corte: 3 }],
  informes_estado: 'ok',
}
const cerebro = (datos: any, estado = 'trajo') => ({ brazo: 'cerebro', objetivo: 'cerebro_cliente', estado, datos, fuente: 'cerebro', medido_en: '2026-11-01T00:00:00Z' })
const conCarpeta = (c: any, extra: any = {}) => cerebro({ contexto_del_cliente: c, carpeta: { resumen_vivo: c.resumen_vivo, informes: c.informes, informes_estado: c.informes_estado }, ...extra })
const ENT = (material: any[]) => ({ ficha: { name: 'Cafetería Prueba', country: 'Ecuador' }, manual: {}, material, descartados: [], referencia: 'REF', casa: {}, plata: {} })
const b4 = async (flujo: any, material: any[]) => {
  const codigo = flujo.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo)({ first: () => ({ json: ENT(material) }), all: () => [{ json: ENT(material) }] }, $, {}, {})
  return r[0].json as Record<string, any>
}

describe('«Redactor (B4)» · la carpeta entera', () => {
  it('sin carpeta en el material: el pedido es EXACTAMENTE el de hoy', async () => {
    const m = [cerebro({ fragmentos: [{ texto: 'FRAGMENTO' }], cantidad: 1 }), { brazo: 'apify', objetivo: 'sitio_propio', estado: 'trajo', datos: { x: 1 }, fuente: 'a', medido_en: 'x' }]
    expect((await b4(nuevo, m)).pedido).toBe((await b4(vivo, m)).pedido)
  })
  it('con carpeta vigente: el informe de >2.500 caracteres llega ENTERO, en su sección, con corte, autor, citas y aviso de material nuevo', async () => {
    const p = (await b4(nuevo, [conCarpeta(CARPETA)])).pedido as string
    expect(p).toContain('LA CARPETA DEL CLIENTE')
    expect(p).toContain('RESUMEN-VIVO-ENTERO')
    expect(p).toContain('FIN-INFORME-A') // el final del informe: con el recorte de 2.500 no estaría
    expect(p).toMatch(/INFORME «voz_del_publico» · analisis \/ feedback-synthesizer · corte 2026-10-30/)
    expect(p).toContain('ficha-1 | ficha-2')
    expect(p).toMatch(/entró material nuevo al cerebro después de este corte \(3\)/)
  })
  it('🔴 la carpeta no se duplica dentro de «datos» (ni la copia de una línea) y el material citado viaja como ids', async () => {
    const p = (await b4(nuevo, [conCarpeta(CARPETA, { material_citado: { ids: ['11111111-aaaa'], detalle: 'por cita' } })])).pedido as string
    expect(p.split('RESUMEN-VIVO-ENTERO').length).toBe(2)
    expect(p).toContain('va entera en LA CARPETA DEL CLIENTE')
    expect(p).toContain('11111111-aaaa')
  })
  it('carpeta ilegible: se DECLARA y lo demás del cerebro se conserva', async () => {
    const ilegible = { resumen_vivo: { estado: 'no_se_pudo_leer', detalle: 'lectura del cerebro: timeout' }, informes: [], informes_estado: 'no_se_pudo_leer', informes_detalle: 'timeout' }
    const p = (await b4(nuevo, [conCarpeta(ilegible, { fragmentos: [{ texto: 'FRAGMENTO-CONSERVADO' }] })])).pedido as string
    expect(p).toContain('LA CARPETA NO SE PUDO LEER')
    expect(p).toContain('FRAGMENTO-CONSERVADO')
  })
  it('carpeta vacía (sin resumen vivo y sin informes): lo dice y no inventa', async () => {
    const vacia = { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], informes_estado: 'ok', marca_extra: 'MARCA-EN-DATOS' }
    const p = (await b4(nuevo, [conCarpeta(vacia, { fragmentos: [{ texto: 'FRAGMENTO-CONSERVADO' }] })])).pedido as string
    expect(p).toContain('NO hay resumen vivo')
    expect(p).toContain('No hay informes de análisis vigentes')
    expect(p).not.toContain('MARCA-EN-DATOS') // la carpeta no se vuelca dentro de «datos»
    expect(p).toContain('FRAGMENTO-CONSERVADO')
  })
  it('solo informes (sin resumen vivo) también cuenta como vigente', async () => {
    const p = (await b4(nuevo, [conCarpeta({ ...CARPETA, resumen_vivo: { estado: 'sin_resumen_vivo' } }, { fragmentos: [{ texto: 'FRAGMENTO-REEMPLAZADO' }] })])).pedido as string
    expect(p).toContain('FIN-INFORME-A')
    expect(p).not.toContain('FRAGMENTO-REEMPLAZADO')
  })
  it('solo se lee la carpeta del brazo de cerebro: la que traiga otro brazo se ignora', async () => {
    const otro = { brazo: 'apify', objetivo: 'sitio_propio', estado: 'trajo', datos: { contexto_del_cliente: CARPETA }, fuente: 'x', medido_en: 'x' }
    expect((await b4(nuevo, [otro])).pedido).not.toContain('LA CARPETA DEL CLIENTE (completa')
  })
})

describe('«Redactor (B4)» · el informe de la mesa de análisis', () => {
  const informe = (n: number) => ({ brazo: 'analisis', objetivo: 'informe competencia', estado: 'trajo', datos: { tipo: 'competencia', informe: '[PROPUESTA: no es dato del cliente] ' + 'x'.repeat(n) + ' FIN-ANALISIS', es_dato_del_cliente: false }, fuente: 'mesa', medido_en: 'x' })
  it('un informe de ~4.000 caracteres llega entero (tope 6.000), no cortado a 2.500', async () => {
    expect((await b4(nuevo, [informe(4000)])).pedido).toContain('FIN-ANALISIS')
  })
  it('el tope de 6.000 se respeta: uno de 8.000 se corta', async () => {
    expect((await b4(nuevo, [informe(8000)])).pedido).not.toContain('FIN-ANALISIS')
  })
  it('los demás brazos siguen con su recorte de 2.500', async () => {
    const otro = { ...informe(4000), brazo: 'mercado' }
    expect((await b4(nuevo, [otro])).pedido).not.toContain('FIN-ANALISIS')
  })
})
