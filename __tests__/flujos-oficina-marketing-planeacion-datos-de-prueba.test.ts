/**
 * 01-nov · datos de prueba por cliente, lado del flujo (orden Lenovo 12:36Z, tramo 1, ítem 4). US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «elegir brazos» y «Redactor (B4)» del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Fija: sin la convención en la ficha, los params de PostHog y el pedido son EXACTAMENTE los de hoy; con ella, la puerta recibe la convención y la carpeta se rotula
 * («pruebas del dueño, no clientes») sin escribir las cuentas internas. Nada se escribe en la ficha del cliente.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = leer('nuevo')
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala' }
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })
const FICHA = (config: any) => ({ id: CLIENTE, name: 'Cafetería Prueba', industry: 'restaurante', website_url: 'https://cafeteria-prueba.example', country: 'Ecuador', config })
const PRUEBA = { distinct_ids: ['dueno-1', 'agencia-qa'], rangos: [{ desde: '2026-10-02', hasta: '2026-10-03', nota: 'ensayo de cobro' }], evento_bandera: 'es_prueba', nota: 'pruebas del dueño en octubre' }

const elegir = (flujo: any, ficha: Record<string, unknown>) =>
  recorrer(flujo, 'elegir brazos', ficha, { previos: { 'Webhook · planeacion': [web({ client_id: CLIENTE })] }, hasta: ['V9 · ¿relleno permitido para Apify?'], env: ENV, http: async () => { throw new Error('elegir brazos no llama a nadie') } })
const analitica = (r: any) => (r.item.pedidos as any[]).find((p) => p.objetivo === 'analitica_propia')

describe('«elegir brazos» · la convención viaja a la puerta de PostHog', () => {
  it('sin la convención (config vacío, ausente, o no objeto): los params son EXACTAMENTE los de hoy', async () => {
    const hoy = analitica(await elegir(vivo, FICHA({})))
    for (const c of [{}, { otra: 1 }, { datos_de_prueba: null }, { datos_de_prueba: 'x' }, { datos_de_prueba: [1] }]) {
      expect(analitica(await elegir(nuevo, FICHA(c)))).toEqual(hoy)
    }
    expect(hoy.params.datos_de_prueba).toBeUndefined()
  })
  it('con la convención: la lleva tal cual en params.datos_de_prueba (la puerta valida) y el resto no cambia', async () => {
    const hoy = analitica(await elegir(vivo, FICHA({})))
    const p = analitica(await elegir(nuevo, FICHA({ datos_de_prueba: PRUEBA })))
    expect(p.params.datos_de_prueba).toEqual(PRUEBA)
    const { datos_de_prueba, ...resto } = p.params
    expect(resto).toEqual(hoy.params)
  })
  it('solo la analítica propia la recibe (ningún otro pedido lleva la convención)', async () => {
    const r = await elegir(nuevo, FICHA({ datos_de_prueba: PRUEBA }))
    const otros = (r.item.pedidos as any[]).filter((p) => p.objetivo !== 'analitica_propia')
    expect(otros.length).toBeGreaterThan(0)
    for (const o of otros) expect(JSON.stringify(o.params)).not.toContain('datos_de_prueba')
  })
})

const b4 = async (flujo: any, ficha: any) => {
  const codigo = flujo.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string
  const ent = { ficha, manual: {}, material: [], descartados: [], referencia: 'REF', casa: {}, plata: {} }
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo)({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {})
  return r[0].json as Record<string, any>
}
const FB4 = (config: any) => ({ name: 'Cafetería Prueba', country: 'Ecuador', config })

describe('«Redactor (B4)» · la carpeta se rotula', () => {
  it('sin la convención: el pedido es EXACTAMENTE el de hoy', async () => {
    const hoy = (await b4(vivo, FB4({}))).pedido
    for (const c of [{}, { datos_de_prueba: null }, { datos_de_prueba: [] }, { datos_de_prueba: {} }, { datos_de_prueba: { distinct_ids: [], rangos: [{ desde: 'ayer', hasta: 'hoy' }] } }]) {
      expect((await b4(nuevo, FB4(c))).pedido).toBe(hoy)
    }
  })
  it('con la convención: bloque «NO SON CLIENTES», ventana con fechas y nota, y la regla de lectura', async () => {
    const p = (await b4(nuevo, FB4({ datos_de_prueba: PRUEBA }))).pedido as string
    expect(p).toContain('PRUEBAS DEL DUEÑO Y DE LA AGENCIA · NO SON CLIENTES')
    expect(p).toMatch(/NO es demanda ni son clientes/)
    expect(p).toContain('del 2026-10-02 al 2026-10-03 (el último día no entra) · ensayo de cobro')
    expect(p).toContain('posible prueba del dueño')
    expect(p).toContain('Nota del negocio: pruebas del dueño en octubre')
    expect(p).toMatch(/YA las deja fuera antes de contar \(2 cuenta\(s\) interna\(s\) y los eventos marcados como prueba\)/)
  })
  it('🔴 las cuentas internas NO se escriben en el pedido', async () => {
    const p = (await b4(nuevo, FB4({ datos_de_prueba: PRUEBA }))).pedido as string
    expect(p).not.toContain('dueno-1')
    expect(p).not.toContain('agencia-qa')
  })
  it('solo con cuentas (sin ventanas ni nota): igual rotula, sin inventar fechas', async () => {
    const p = (await b4(nuevo, FB4({ datos_de_prueba: { distinct_ids: ['x1'] } }))).pedido as string
    expect(p).toContain('NO SON CLIENTES')
    expect(p).not.toContain('Ventana de pruebas')
    expect(p).toContain('1 cuenta(s) interna(s)')
  })
  it('una ventana mal escrita no aparece (no se inventan fechas)', async () => {
    const p = (await b4(nuevo, FB4({ datos_de_prueba: { nota: 'n', rangos: [{ desde: 'ayer', hasta: 'hoy' }, { desde: '2026-10-02', hasta: '2026-10-03' }] } }))).pedido as string
    expect(p).not.toContain('ayer')
    expect(p.split('Ventana de pruebas').length).toBe(2)
  })
  it('la nota pasa por la limpieza de nombres de personas', async () => {
    const o = await b4(nuevo, { name: 'Cafetería Prueba', country: 'Ecuador', config: { datos_de_prueba: { nota: 'las hizo Carlos Mendoza (propietario)' }, personas: ['Carlos Mendoza'] } })
    expect(o.pedido as string).not.toContain('Carlos Mendoza')
    const v = await b4(nuevo, { name: 'Cafetería Prueba', country: 'Ecuador', config: { datos_de_prueba: { rangos: [{ desde: '2026-10-02', hasta: '2026-10-03', nota: 'cobro de Carlos Mendoza (propietario)' }] }, personas: ['Carlos Mendoza'] } })
    expect(v.pedido as string).toContain('Ventana de pruebas')
    expect(v.pedido as string).not.toContain('Carlos Mendoza')
  })
})
