/**
 * 01-nov · control de cifras del plan (orden Lenovo 12:36Z, tramo 1). US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «¿Llegó la vuelta?» del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Fija: una cifra con unidad que no está en el pedido del redactor y no lleva rótulo se AVISA; nunca marca el plan ni lo vuelve «con pendientes»;
 * lo respaldado (en cualquier formato de miles/decimales), lo rotulado, los años, teléfonos y fechas no avisan.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const ENV = { SALA_DISPATCH_KEY: 'k-sala', SUPABASE_URL: 'https://supa.test' }
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })
const PEDIDO = 'Ventas de octubre: 4.540 US$, 409 unidades, 31,5% del ingreso. Reseñas: 589. Llamar al +593 99 774 4288. Desde 2024.'

const correr = (plan: string, pedido: string = PEDIDO) => {
  const c = { body: { response: plan } }
  return recorrer(nuevo, '¿Llegó la vuelta?', c, {
    previos: {
      'Webhook · planeacion': [web({ client_id: CLIENTE, dry_run: false })],
      'Redactor · elegir': [{ redactor_elegido: 'jefe-marketing' }],
      'Redactor (B4)': [{ pedido, contexto_chequeo: null }],
      'Vuelta · completar': [c],
    },
    env: ENV,
    hasta: ['⑤ ¿Modo seco?'],
  })
}

describe('control de cifras', () => {
  it('cifras respaldadas (con otro formato), años, teléfono y fecha: sin aviso', async () => {
    const r = await correr('Vendió 4,540 US$ en octubre, 409 unidades, 31.5% del ingreso, 589 reseñas. Escribe al +593 99 774 4288. Desde 2024; el 12 oct fue el cierre.\n')
    expect(r.item.avisos_de_cifras).toMatchObject({ hay_aviso: false })
    expect(r.item.registro_interno.cifras_sin_respaldo).toBeNull()
  })
  it('años, teléfonos y números chicos sin unidad que NO están en el pedido tampoco avisan; el separador de miles no confunde 4.540 con 4,54', async () => {
    const r = await correr('Escríbenos al +593 98 111 2233.\nLa renovación vence en 2099.\nSon 12 cosas por hacer.\n')
    expect(r.item.avisos_de_cifras.hay_aviso).toBe(false)
    const m = await correr('Vendió 4,54 US$ en octubre.\n')
    expect(m.item.avisos_de_cifras.hay_aviso).toBe(true)
  })
  it('🔴 una cifra inventada con unidad se avisa y la línea queda registrada', async () => {
    const r = await correr('Las visitas subieron a 18.742 y hubo 3.915 tickets.\nLa tasa real es 7,3%.\n')
    const a = r.item.avisos_de_cifras
    expect(a.hay_aviso).toBe(true)
    expect(a.sin_respaldo.map((x: any) => x.cifra)).toEqual(expect.arrayContaining(['18.742', '3.915', '7,3']))
    expect(r.item.registro_interno.cifras_sin_respaldo.length).toBeGreaterThanOrEqual(3)
  })
  it('una cifra rotulada como supuesto/meta/escenario no avisa', async () => {
    const r = await correr('Meta: llegar a 1.500 seguidores. Escenario B: 5.900 US$ al mes (supuesto).\n')
    expect(r.item.avisos_de_cifras.hay_aviso).toBe(false)
  })
  it('NUNCA marca ni cambia el estado del plan: el chequeo es idéntico con y sin la cifra inventada', async () => {
    const con = await correr('Las visitas subieron a 18.742.\n')
    const sin = await correr('Las visitas subieron.\n')
    expect(con.item.avisos_de_cifras.hay_aviso).toBe(true)
    expect(sin.item.avisos_de_cifras.hay_aviso).toBe(false)
    expect(con.item.chequeo_del_plan).toEqual(sin.item.chequeo_del_plan)
    expect(con.item.estado_del_plan).toBe(sin.item.estado_del_plan)
  })
  it('un fallo al leer el pedido no tumba el plan', async () => {
    const c = { body: { response: 'Hola 18.742 visitas.\n' } }
    const r = await recorrer(nuevo, '¿Llegó la vuelta?', c, {
      previos: { 'Webhook · planeacion': [web({ client_id: CLIENTE, dry_run: false })], 'Redactor · elegir': [{ redactor_elegido: 'jefe-marketing' }], 'Vuelta · completar': [c] },
      env: ENV, hasta: ['⑤ ¿Modo seco?'],
    })
    expect(r.item).toMatchObject({ llego_la_vuelta: true })
    expect(r.item.avisos_de_cifras).toBeNull()
  })
  it('sin vuelta no hay control', async () => {
    const r = await recorrer(nuevo, '¿Llegó la vuelta?', {}, {
      previos: { 'Webhook · planeacion': [web({ client_id: CLIENTE, dry_run: false })], 'Redactor · elegir': [{ redactor_elegido: 'jefe-marketing' }], 'Redactor (B4)': [{ pedido: PEDIDO }], 'Vuelta · completar': [{}] },
      env: ENV, hasta: ['⑤ ¿Modo seco?'],
    })
    expect(r.item.avisos_de_cifras).toBeNull()
  })
})
