/**
 * 02-nov · «PEDIR CAMBIOS AL MANUAL» · el flujo aparte `zero-risk/manual-cambios`. US$ 0, sin red: se ejecuta el CÓDIGO REAL de sus nodos con el emulador y un HTTP simulado.
 * Fija: la llave y el sobre se validan ANTES de gastar; un pedido repetido/ajeno/ya resuelto se DETIENE sin gastar; se marca en_reescritura con la ejecución; la entrada del manual
 * parte del manual vigente (sin repetir el descubrimiento) y lleva `reescritura`; el cierre deja aplicado o fallido (también si el flujo del manual falla o no se pudo armar) y nunca en_reescritura.
 */
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
// @ts-expect-error módulo .mjs sin tipos
import { construirManualCambios, MANUAL_ID } from '../scripts/ops/oficina-marketing/construir-manual-cambios.mjs'

const flujo = construirManualCambios()
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SOBRE = { client_id: U(1), manual_base_id: U(2), manual_cambio_id: U(3), cambios_del_dueno: 'Que la voz sea más cálida', seccion: 'Cómo habla', campos_validados: ['mission'], campos_liberados: ['voice_description'], tope_reescritura_usd: 4 }
const LLAVE = { 'x-sala-dispatch-key': 'llave-sala' }
const entrada = (body: any, headers: any = LLAVE) => ({ headers, body })
const DRAFT = { positioning: 'Cocina de mar', mission: 'Que comer bien sea fácil', voice_description: 'Formal' }

type Llamada = { m: string; url: string; cuerpo: any }
function sb(o: { pedido?: any; manual?: any; ficha?: any; relee?: any } = {}) {
  const llamadas: Llamada[] = []
  const http = async (url: string, _h: any, cuerpo: any) => {
    const m = cuerpo ? 'PATCH' : 'GET'
    llamadas.push({ m, url, cuerpo })
    if (m === 'PATCH') return { statusCode: 204, body: '' }
    if (url.includes('plan_cambios') && url.includes('documento')) return { statusCode: 200, body: o.pedido === undefined ? [{ id: SOBRE.manual_cambio_id, client_id: SOBRE.client_id, documento: 'manual', estado: 'pendiente', manual_nuevo_id: null }] : o.pedido }
    if (url.includes('client_brand_books')) return { statusCode: 200, body: o.manual === undefined ? [{ id: SOBRE.manual_base_id, client_id: SOBRE.client_id, version: 4, content_text: JSON.stringify({ brand_book_draft: DRAFT }) }] : o.manual }
    if (url.includes('clients')) return { statusCode: 200, body: o.ficha === undefined ? [{ id: SOBRE.client_id, name: 'Náufrago', industry: 'restaurante', website_url: 'https://naufrago.ec' }] : o.ficha }
    if (url.includes('plan_cambios')) return { statusCode: 200, body: o.relee === undefined ? [{ id: SOBRE.manual_cambio_id, estado: 'en_reescritura', manual_nuevo_id: U(9) }] : o.relee }
    return { statusCode: 404, body: [] }
  }
  return { llamadas, http }
}
const hasta = ['④ Llamar al flujo del manual']
const correr = (e: any, o = {}) => { const s = sb(o); return recorrer(flujo, '⓪ Llave · Webhook · manual-cambios', e, { http: s.http, hasta }).then((r) => ({ r, ...s })) }

describe('⓪ la llave y el sobre, antes de gastar', () => {
  it('sin llave de despacho, o con una distinta, se DETIENE', async () => {
    await expect(correr(entrada(SOBRE, {}))).rejects.toThrow(/FLUJO_PROCEDENCIA_INVALIDA/)
    await expect(correr(entrada(SOBRE, { 'x-sala-dispatch-key': 'otra' }))).rejects.toThrow(/FLUJO_PROCEDENCIA_INVALIDA/)
  })
  it('sin la llave en el entorno del motor el flujo queda cerrado (falla cerrado)', async () => {
    await expect(recorrer(flujo, '⓪ Llave · Webhook · manual-cambios', entrada(SOBRE), { env: { SALA_DISPATCH_KEY: '' }, http: sb().http, hasta })).rejects.toThrow(/FLUJO_CERRADO/)
  })
  it('sobre inválido: ids que no son uuid, pedido corto o largo, listas mal formadas, sección larga, tope absurdo', async () => {
    for (const malo of [{ client_id: 'x' }, { manual_base_id: null }, { manual_cambio_id: 5 }, { cambios_del_dueno: 'no' }, { cambios_del_dueno: 'y'.repeat(2001) }, { campos_validados: 'mission' }, { campos_liberados: [1] }, { seccion: 's'.repeat(81) }, { tope_reescritura_usd: 0 }, { tope_reescritura_usd: 21 }, { tope_reescritura_usd: '5' }]) {
      const s = sb()
      await expect(recorrer(flujo, '⓪ Llave · Webhook · manual-cambios', entrada({ ...SOBRE, ...malo }), { http: s.http, hasta })).rejects.toThrow(/MANUAL_CAMBIOS_/)
      expect(s.llamadas.length).toBe(0) // ni una lectura: se paró antes de tocar nada
    }
  })
  it('el tope por omisión es 5 y la sección vacía es «general»', async () => {
    const { r } = await correr(entrada({ ...SOBRE, tope_reescritura_usd: undefined, seccion: '' }))
    const sobre = r.historial['⓪ Llave · Webhook · manual-cambios'][0].sobre
    expect(sobre.tope_reescritura_usd).toBe(5)
    expect(sobre.seccion).toBeNull()
  })
})

describe('① la guardia del pedido (clave única)', () => {
  it('pedido nuevo: se marca en_reescritura con el id de esta ejecución y se sigue', async () => {
    const { r, llamadas } = await correr(entrada(SOBRE))
    expect(r.ultimo).toBe('④ Llamar al flujo del manual'.replace('④ Llamar al flujo del manual', r.ultimo)) // llegó hasta el llamado
    const p = llamadas.find((l) => l.m === 'PATCH')!
    expect(p.url).toContain('plan_cambios?id=eq.' + SOBRE.manual_cambio_id)
    expect(p.cuerpo).toMatchObject({ estado: 'en_reescritura', workflow_execution_id: 'ex-1' })
  })
  it('un pedido que ya tiene versión nueva, que ya terminó o que ya corre NO gasta ni cambia nada', async () => {
    for (const fila of [{ estado: 'pendiente', manual_nuevo_id: U(9) }, { estado: 'en_reescritura', manual_nuevo_id: U(9) }, { estado: 'aplicado' }, { estado: 'cancelado' }, { estado: 'en_reescritura' }]) {
      const { r, llamadas } = await correr(entrada(SOBRE), { pedido: [{ id: SOBRE.manual_cambio_id, client_id: SOBRE.client_id, documento: 'manual', manual_nuevo_id: null, ...fila }] })
      expect(r.vacio).toBe(true)
      expect(llamadas.filter((l) => l.m === 'PATCH').length).toBe(0)
      expect(llamadas.some((l) => l.url.includes('client_brand_books'))).toBe(false) // ni siquiera lee el manual
    }
  })
  it('con force_restart un pedido que quedó en_reescritura se retoma', async () => {
    const { llamadas } = await correr(entrada({ ...SOBRE, force_restart: true }), { pedido: [{ id: SOBRE.manual_cambio_id, client_id: SOBRE.client_id, documento: 'manual', estado: 'en_reescritura', manual_nuevo_id: null }] })
    expect(llamadas.some((l) => l.m === 'PATCH')).toBe(true)
  })
  it('pedido inexistente, de un plan o de otro cliente: se DETIENE antes de gastar', async () => {
    await expect(correr(entrada(SOBRE), { pedido: [] })).rejects.toThrow(/PEDIDO_INEXISTENTE/)
    await expect(correr(entrada(SOBRE), { pedido: [{ id: 'x', client_id: SOBRE.client_id, documento: 'plan', estado: 'pendiente' }] })).rejects.toThrow(/PEDIDO_AJENO/)
    await expect(correr(entrada(SOBRE), { pedido: [{ id: 'x', client_id: U(77), documento: 'manual', estado: 'pendiente' }] })).rejects.toThrow(/PEDIDO_AJENO/)
  })
})

describe('③ la entrada del manual en modo reescritura', () => {
  it('parte del manual vigente y de la ficha, sin repetir el descubrimiento, y lleva el sobre completo', async () => {
    const { r } = await correr(entrada(SOBRE))
    const e = r.historial['③ Armar la entrada del manual'][0]
    expect(e).toMatchObject({ client_id: SOBRE.client_id, client_name: 'Náufrago', industry: 'restaurante', website: 'https://naufrago.ec', dry_run: false })
    expect(e.discovery_package.discovery_summary).toContain('no se repitió el descubrimiento')
    expect(e.discovery_package.discovery_summary).toContain('versión 4')
    expect(e.reescritura).toEqual({ manual_base_id: SOBRE.manual_base_id, manual_cambio_id: SOBRE.manual_cambio_id, cambios_del_dueno: SOBRE.cambios_del_dueno, seccion: 'Cómo habla', campos_validados: ['mission'], campos_liberados: ['voice_description'], tope_reescritura_usd: 4, manual_vigente: DRAFT })
  })
  it('lee el contenido tanto si viene como texto como si viene ya como objeto, con o sin el envoltorio brand_book_draft', async () => {
    for (const ct of [JSON.stringify({ brand_book_draft: DRAFT }), { brand_book_draft: DRAFT }, JSON.stringify(DRAFT), DRAFT]) {
      const { r } = await correr(entrada(SOBRE), { manual: [{ id: SOBRE.manual_base_id, client_id: SOBRE.client_id, version: 1, content_text: ct }] })
      expect(r.historial['③ Armar la entrada del manual'][0].reescritura.manual_vigente).toEqual(DRAFT)
    }
  })
  it('lo que no se puede armar NO lanza: va al cierre con su motivo (manual ajeno, vacío, ilegible, sin ficha)', async () => {
    const casos: Array<[any, RegExp]> = [
      [{ manual: [] }, /SIN_MANUAL_BASE/],
      [{ manual: [{ id: 'm', client_id: U(77), content_text: '{}' }] }, /MANUAL_AJENO/],
      [{ manual: [{ id: 'm', client_id: SOBRE.client_id, content_text: '{}' }] }, /MANUAL_VACIO/],
      [{ manual: [{ id: 'm', client_id: SOBRE.client_id, content_text: 'no es json' }] }, /MANUAL_VACIO/],
      [{ ficha: [] }, /SIN_FICHA/],
    ]
    for (const [o, re] of casos) {
      const { r } = await correr(entrada(SOBRE), o)
      expect(r.pasos).toContain('⑤ Releer el pedido') // va directo al cierre
      expect(r.pasos).not.toContain('④ Llamar al flujo del manual') // y NO llama al manual (no gasta)
      expect(r.historial['③ Armar la entrada del manual'][0].fallo).toMatch(re)
    }
  })
  it('sin ficha de industria, no inventa: usa «unknown»', async () => {
    const { r } = await correr(entrada(SOBRE), { ficha: [{ id: SOBRE.client_id, name: 'X', industry: null }] })
    expect(r.historial['③ Armar la entrada del manual'][0].industry).toBe('unknown')
  })
})

describe('④ el llamado y ⑤ el cierre', () => {
  it('llama al flujo del manual por su id, con onError continuar (un fallo del sub-flujo igual llega al cierre)', () => {
    const n = flujo.nodes.find((x: any) => x.name === '④ Llamar al flujo del manual')
    expect(n.parameters.workflowId.value).toBe(MANUAL_ID)
    expect(n.onError).toBe('continueRegularOutput')
    expect(flujo.connections['④ Llamar al flujo del manual'].main[0][0].node).toBe('⑤ Releer el pedido')
    expect(flujo.connections['③ ¿Se pudo armar?'].main[1][0].node).toBe('⑤ Releer el pedido') // lo no armable también cierra
  })
  const cerrar = async (relee: any, armado: any = { client_id: SOBRE.client_id }) => {
    const s = sb({ relee })
    const r = await recorrer(flujo, '⑤ Releer el pedido', {}, {
      http: s.http,
      previos: { '⓪ Llave · Webhook · manual-cambios': [{ sobre: SOBRE }], '③ Armar la entrada del manual': [armado] },
    })
    return { r, ...s }
  }
  it('con versión nueva ligada: aplicado', async () => {
    const { llamadas } = await cerrar([{ id: SOBRE.manual_cambio_id, estado: 'en_reescritura', manual_nuevo_id: U(9) }])
    const p = llamadas.find((l) => l.m === 'PATCH')!
    expect(p.cuerpo.estado).toBe('aplicado')
    expect(p.url).toContain(SOBRE.manual_cambio_id)
  })
  it('sin versión nueva: fallido con el motivo, nunca en_reescritura', async () => {
    const { llamadas } = await cerrar([{ id: SOBRE.manual_cambio_id, estado: 'en_reescritura', manual_nuevo_id: null }])
    const p = llamadas.find((l) => l.m === 'PATCH')!
    expect(p.cuerpo.estado).toBe('fallido')
    expect(p.cuerpo.despertar_detalle).toContain('sin dejar una versión nueva')
  })
  it('si no se pudo armar, el motivo del armado es el que queda escrito', async () => {
    const { llamadas } = await cerrar([{ id: SOBRE.manual_cambio_id, estado: 'en_reescritura', manual_nuevo_id: null }], { fallo: 'MANUAL_CAMBIOS_SIN_FICHA · no se pudo leer la ficha del cliente' })
    const p = llamadas.find((l) => l.m === 'PATCH')!
    expect(p.cuerpo).toMatchObject({ estado: 'fallido' })
    expect(p.cuerpo.despertar_detalle).toContain('SIN_FICHA')
  })
  it('si no se puede releer el pedido, queda fallido y lo dice (no se asume éxito)', async () => {
    const { llamadas } = await cerrar([])
    const p = llamadas.find((l) => l.m === 'PATCH')!
    expect(p.cuerpo.estado).toBe('fallido')
    expect(p.cuerpo.despertar_detalle).toContain('no se pudo releer')
  })
})

describe('alcance del flujo', () => {
  it('nace en un archivo propio, con un solo webhook, sin nodos de IA ni de publicación, y el flujo del alta no se modifica por este constructor', () => {
    expect(flujo.nodes.filter((n: any) => n.type.endsWith('.webhook')).length).toBe(1)
    expect(flujo.nodes.some((n: any) => /run-sdk|apify|slack|publish/i.test(JSON.stringify(n.parameters)))).toBe(false)
    expect(flujo.settings.executionOrder).toBe('v1')
  })
})
