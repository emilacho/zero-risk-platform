/**
 * 01-nov · FIRMA de Emilio, punto 2 · la planeación recibe la CARPETA del cliente (resumen vivo + informes), no busca por parecido. US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «⓪ Llave», «elegir brazos» y «Redactor (B4)» del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Lo que fija: sin `con_carpeta` el flujo pide y arma LO MISMO que hoy; con ella, el pedido de cerebro no exige nombre ni rubro, y el redactor ve la carpeta ENTERA
 * (sin el recorte de 2.500), fuera de `datos`, con la búsqueda por parecido reemplazada; una carpeta ilegible o vacía se DECLARA y conserva los fragmentos.
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

const elegir = (flujo: any, body: Record<string, unknown>, ficha: Record<string, unknown> = FICHA) =>
  recorrer(flujo, 'elegir brazos', ficha, { previos: WEBHOOK(body), hasta: ['V9 · ¿relleno permitido para Apify?'], env: ENV, http: async () => { throw new Error('elegir brazos no llama a nadie') } })
const pedidosDe = (r: any): any[] => r.item?.pedidos ?? []
const pedidoCerebro = (r: any) => pedidosDe(r).find((p: any) => p.objetivo === 'cerebro_cliente')

describe('«⓪ Llave» · con_carpeta', () => {
  const llave = (body: Record<string, unknown>) => recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web(body), { env: ENV, hasta: ['V9 · ¿pide el pre-vuelo?'] })
  it('true, false, null o ausente pasan', async () => {
    for (const v of [true, false, null, undefined]) expect((await llave({ client_id: CLIENTE, con_carpeta: v })).ultimo).toBe('V9 · ¿pide el pre-vuelo?')
  })
  it('🔴 cualquier otro valor DETIENE antes de gastar', async () => {
    for (const raro of ['true', 'si', 1, 0, [], {}]) await expect(llave({ client_id: CLIENTE, con_carpeta: raro })).rejects.toThrow(/PLANEACION_CON_CARPETA_INVALIDO/)
  })
})

describe('«elegir brazos» · el pedido de cerebro', () => {
  it('sin con_carpeta: el mismo pedido de hoy (la pregunta «nombre · rubro»), sin marca de carpeta', async () => {
    const a = await elegir(vivo, { client_id: CLIENTE }), b = await elegir(nuevo, { client_id: CLIENTE })
    expect(pedidoCerebro(a)).toBeDefined()
    expect(pedidoCerebro(b)).toEqual(pedidoCerebro(a))
    expect(JSON.stringify(pedidoCerebro(b))).not.toContain('con_carpeta')
  })
  it('con con_carpeta: el pedido lleva la marca y conserva la pregunta', async () => {
    const p = pedidoCerebro(await elegir(nuevo, { client_id: CLIENTE, con_carpeta: true }))
    expect(p.params).toMatchObject({ con_carpeta: true, query: 'Cafetería Prueba · restaurante' })
  })
  it('con con_carpeta y SIN nombre ni rubro: el pedido SALE (la carpeta no se busca); sin la marca se descarta como hoy', async () => {
    const f = { ...FICHA, name: '', industry: '' }
    expect(pedidoCerebro(await elegir(nuevo, { client_id: CLIENTE }, f))).toBeUndefined()
    const con = pedidoCerebro(await elegir(nuevo, { client_id: CLIENTE, con_carpeta: true }, f))
    expect(con.params).toEqual({ con_carpeta: true })
  })
})

// ── «Redactor (B4)» ────────────────────────────────────────────────────────
const LARGO = 'Hallazgo largo. '.repeat(400) // ~6.400 caracteres: más del doble del recorte de 2.500
const CARPETA = {
  resumen_vivo: { estado: 'vigente', actualizado_en: '2026-10-30T10:00:00Z', texto: 'RESUMEN-VIVO-ENTERO: vende ceviche y arroz marinero.' },
  informes: [{ ficha_id: 'f1', tipo: 'voz_del_publico', texto: 'INFORME-A ' + LARGO + ' FIN-INFORME-A', autor: { mesa: 'analisis', agente: 'feedback-synthesizer' }, fecha_de_corte: '2026-10-30T00:00:00Z', citas: ['ficha-1', 'ficha-2'], origen: 'sintesis_de_oficina', hay_material_nuevo_desde_el_corte: true, fichas_nuevas_desde_el_corte: 3 }],
  informes_estado: 'ok',
}
const FRAGMENTOS = { fragmentos: [{ seccion: 'x', texto: 'FRAGMENTO-POR-PARECIDO' }], cantidad: 1 }
const cerebro = (datos: any, estado = 'trajo') => ({ brazo: 'cerebro', objetivo: 'cerebro_cliente', estado, datos, fuente: 'cerebro', medido_en: '2026-11-01T00:00:00Z' })
const ENT = (material: any[]) => ({ ficha: { name: 'Cafetería Prueba', country: 'Ecuador' }, manual: {}, material, descartados: [], referencia: 'REF', casa: {}, plata: {} })
const b4 = async (flujo: any, material: any[]) => {
  const codigo = flujo.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo)({ first: () => ({ json: ENT(material) }), all: () => [{ json: ENT(material) }] }, $, {}, {})
  return r[0].json as Record<string, any>
}

describe('«Redactor (B4)» · la carpeta entera', () => {
  it('sin carpeta en el material: el pedido es EXACTAMENTE el de hoy', async () => {
    const m = [cerebro(FRAGMENTOS)]
    expect((await b4(nuevo, m)).pedido).toBe((await b4(vivo, m)).pedido)
  })
  it('con carpeta vigente: el informe de >2.500 caracteres llega ENTERO, en su sección, con corte, autor, citas y aviso de material nuevo', async () => {
    const p = (await b4(nuevo, [cerebro({ ...FRAGMENTOS, contexto_del_cliente: CARPETA })])).pedido as string
    expect(p).toContain('LA CARPETA DEL CLIENTE')
    expect(p).toContain('RESUMEN-VIVO-ENTERO')
    expect(p).toContain('FIN-INFORME-A') // el final del informe: con el recorte de 2.500 no estaría
    expect(p).toMatch(/INFORME «voz_del_publico» · analisis \/ feedback-synthesizer · corte 2026-10-30/)
    expect(p).toContain('ficha-1 | ficha-2')
    expect(p).toMatch(/entró material nuevo al cerebro después de este corte \(3\)/)
  })
  it('🔴 con carpeta vigente la búsqueda por parecido se REEMPLAZA (el fragmento no aparece) y la carpeta no se duplica dentro de «datos»', async () => {
    const p = (await b4(nuevo, [cerebro({ ...FRAGMENTOS, contexto_del_cliente: CARPETA })])).pedido as string
    expect(p).not.toContain('FRAGMENTO-POR-PARECIDO')
    expect(p).toContain('se reemplazó por LA CARPETA DEL CLIENTE')
    expect(p.split('RESUMEN-VIVO-ENTERO').length).toBe(2)
  })
  it('carpeta ilegible: se DECLARA y los fragmentos se conservan', async () => {
    const ilegible = { resumen_vivo: { estado: 'no_se_pudo_leer', detalle: 'cerebro_fichas: timeout' }, informes: [], informes_estado: 'no_se_pudo_leer', informes_detalle: 'timeout' }
    const p = (await b4(nuevo, [cerebro({ ...FRAGMENTOS, contexto_del_cliente: ilegible })])).pedido as string
    expect(p).toContain('LA CARPETA NO SE PUDO LEER')
    expect(p).toContain('FRAGMENTO-POR-PARECIDO')
  })
  it('carpeta vacía (sin resumen vivo y sin informes): lo dice, no inventa, y conserva los fragmentos', async () => {
    const vacia = { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], informes_estado: 'ok', marca_extra: 'MARCA-EN-DATOS' }
    const p = (await b4(nuevo, [cerebro({ ...FRAGMENTOS, contexto_del_cliente: vacia })])).pedido as string
    expect(p).toContain('NO hay resumen vivo')
    expect(p).not.toContain('MARCA-EN-DATOS') // la carpeta no se vuelca dentro de «datos»
    expect(p).toContain('No hay informes de análisis vigentes')
    expect(p).toContain('FRAGMENTO-POR-PARECIDO')
  })
  it('solo informes (sin resumen vivo) también cuenta como vigente: la carpeta reemplaza', async () => {
    const soloInformes = { ...CARPETA, resumen_vivo: { estado: 'sin_resumen_vivo' } }
    const p = (await b4(nuevo, [cerebro({ ...FRAGMENTOS, contexto_del_cliente: soloInformes })])).pedido as string
    expect(p).toContain('FIN-INFORME-A')
    expect(p).not.toContain('FRAGMENTO-POR-PARECIDO')
  })
  it('la carpeta también llega si la búsqueda no halló fragmentos (estado sin_dato)', async () => {
    const p = (await b4(nuevo, [cerebro({ contexto_del_cliente: CARPETA }, 'sin_dato')])).pedido as string
    expect(p).toContain('RESUMEN-VIVO-ENTERO')
  })
  it('solo se lee la carpeta del brazo de cerebro: la que traiga otro brazo se ignora', async () => {
    const otro = { brazo: 'apify', objetivo: 'sitio_propio', estado: 'trajo', datos: { contexto_del_cliente: CARPETA }, fuente: 'x', medido_en: 'x' }
    const p = (await b4(nuevo, [otro])).pedido as string
    expect(p).not.toContain('LA CARPETA DEL CLIENTE (completa')
  })
})
