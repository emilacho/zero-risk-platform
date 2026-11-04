/**
 * 01-nov · «lo que dijo el dueño» llega al redactor con su TEXTO LIBRE (orden Lenovo 12:36Z, tramo 1, ítem 5). US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «Unir el texto libre del dueño al paquete» y de «Redactor (B4)» del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Fija: apagado / vacío / caído ⇒ el pedido es EXACTAMENTE el de hoy y la corrida no se detiene; con respuestas, bloque de precedencia alta (reciente primero, topes, sin nombres de personas).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sinFraseSedes } from './_sin-frase-sedes'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = sinFraseSedes(leer('nuevo'))
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala', SUPABASE_URL: 'https://supa.test' }
const PAQUETE = { ficha: { name: 'Cafetería Prueba', country: 'Ecuador' }, manual: {}, material: [], descartados: [], referencia: 'REF', casa: {}, plata: {}, hechos_del_dueno: [] }

const unir = (respuesta: any) => recorrer(nuevo, 'Unir el texto libre del dueño al paquete', respuesta, {
  previos: { 'Unir el público ideal al paquete': [PAQUETE] }, env: ENV, hasta: ['PV3 · ¿pide el dato v1?'],
})
const ok = (respuestas: any[]) => ({ statusCode: 200, body: { ok: true, client_id: CLIENTE, respuestas } })
const r = (tema: string, respuesta: string, hace_dias = 3) => ({ tema, respuesta, hace_dias, confirmado_por_el_dueno: true })

const b4 = async (flujo: any, ent: any) => {
  const codigo = flujo.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const res = await new AsyncFunction('$input', '$', '$env', '$json', codigo)({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {})
  return res[0].json as Record<string, any>
}

describe('el cableado', () => {
  it('«Unir el público ideal» → leer texto libre → unir → «PV3 · ¿pide el dato v1?»', () => {
    const s = (n: string) => (nuevo.connections[n]?.main ?? []).map((g: any[]) => g.map((c) => c.node))
    expect(s('Unir el público ideal al paquete')).toEqual([['Lo que dijo el dueño · texto libre']])
    expect(s('Lo que dijo el dueño · texto libre')).toEqual([['Unir el texto libre del dueño al paquete']])
    expect(s('Unir el texto libre del dueño al paquete')).toEqual([['PV3 · ¿pide el dato v1?']])
  })
  it('🔴 la lectura no detiene la corrida si cae, es GET de la ruta del cerebro con la llave interna y pide ESTE cliente', () => {
    const n = nuevo.nodes.find((x: any) => x.name === 'Lo que dijo el dueño · texto libre')
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.alwaysOutputData).toBe(true)
    expect(n.parameters.method).toBe('GET')
    expect(n.parameters.url).toContain('/api/brain/alimentar/dueno?client_id=')
    expect(n.parameters.url).toContain('limite=30')
    expect(JSON.stringify(n.parameters.headerParameters)).toContain('INTERNAL_API_KEY')
    expect(JSON.stringify(n.parameters.headerParameters)).not.toContain('SALA_DISPATCH_KEY')
  })
})

describe('🔴 la rama FIN entrega a «Redactor (B4)» el paquete que SÍ lleva el público ideal y el texto libre', () => {
  for (const nom of ['FIN · devolver el paquete', 'FIN · sobre']) it(`«${nom}» relee del último «Unir…», no del anterior al público ideal`, () => {
    const c = nuevo.nodes.find((x: any) => x.name === nom).parameters.jsCode as string
    expect(c).toContain("$('Unir el texto libre del dueño al paquete')")
    expect(c).not.toContain("$('Unir lo del dueño al paquete')")
  })
  it('el vivo sí releía del paquete sin público ideal (es lo que se corrige)', () => {
    expect(vivo.nodes.find((x: any) => x.name === 'FIN · devolver el paquete').parameters.jsCode).toContain("$('Unir lo del dueño al paquete')")
  })
})

describe('«Unir el texto libre del dueño al paquete»', () => {
  it('con respuestas: las pega (tema, días, cita) y declara «leido»', async () => {
    const x = (await unir(ok([r('horario', 'Abrimos de 8 a 16.', 2)]))).item
    expect(x.texto_libre_estado).toBe('leido')
    expect(x.texto_libre_del_dueno).toEqual([{ tema: 'horario', hace_dias: 2, respuesta: 'Abrimos de 8 a 16.' }])
    expect(x.ficha).toEqual(PAQUETE.ficha) // el resto del paquete pasa intacto
  })
  const SIN: Array<[string, any, string]> = [
    ['ruta apagada', { statusCode: 200, body: { apagado: true, modelos_llamados: 0 } }, 'apagado'],
    ['sin respuestas', ok([]), 'vacio'],
    ['respuestas sin texto', ok([r('x', '   ')]), 'vacio'],
    ['error 502', { statusCode: 502, body: { error: 'lectura_fallida' } }, 'sin_lectura'],
    ['401', { statusCode: 401, body: { error: 'unauthorized' } }, 'sin_lectura'],
    ['cuerpo que no es objeto', { statusCode: 200, body: [1] }, 'sin_lectura'],
    ['la lectura lanzó (item de error de n8n)', { error: { message: 'fetch failed' } }, 'sin_lectura'],
    ['200 sin ok:true', { statusCode: 200, body: { respuestas: [r('a', 'b')] } }, 'sin_lectura'],
  ]
  for (const [caso, entrada, estado] of SIN) it(`${caso} → nada que pegar, estado «${estado}», no detiene`, async () => {
    const x = (await unir(entrada)).item
    expect(x.texto_libre_estado).toBe(estado)
    expect(x.texto_libre_del_dueno).toEqual([])
  })
  it('tope de CANTIDAD: 45 respuestas cortas → 30', async () => {
    const x = (await unir(ok(Array.from({ length: 45 }, (_, i) => r('t' + i, 'ab'))))).item
    expect(x.texto_libre_del_dueno.length).toBe(30)
  })
  it('topes: 30 respuestas, 600 caracteres c/u, 6.000 el bloque', async () => {
    const muchas = Array.from({ length: 45 }, (_, i) => r('t' + i, 'x'.repeat(900)))
    const x = (await unir(ok(muchas))).item
    expect(x.texto_libre_del_dueno.length).toBeLessThanOrEqual(30)
    expect(x.texto_libre_del_dueno[0].respuesta.length).toBeLessThanOrEqual(600)
    const total = x.texto_libre_del_dueno.reduce((a: number, y: any) => a + y.respuesta.length + y.tema.length + 30, 0)
    expect(total).toBeLessThanOrEqual(6000)
    expect(x.texto_libre_del_dueno.length).toBeGreaterThan(5) // no se tira todo por el tope
  })
})

describe('«Redactor (B4)» · el bloque', () => {
  const conTexto = (t: any) => ({ ...PAQUETE, texto_libre_del_dueno: t, texto_libre_estado: t.length ? 'leido' : 'vacio' })
  it('sin texto libre (ausente o vacío): el pedido es EXACTAMENTE el de hoy', async () => {
    const hoy = (await b4(vivo, PAQUETE)).pedido
    expect((await b4(nuevo, PAQUETE)).pedido).toBe(hoy)
    expect((await b4(nuevo, conTexto([]))).pedido).toBe(hoy)
  })
  it('una respuesta en blanco no abre la sección: el pedido sigue igual al de hoy', async () => {
    const hoy = (await b4(vivo, PAQUETE)).pedido
    expect((await b4(nuevo, conTexto([{ tema: 'x', hace_dias: 1, respuesta: '   ' }, { tema: 'y', hace_dias: 1 }]))).pedido).toBe(hoy)
  })
  it('con texto libre: sección de precedencia alta, con tema, antigüedad y cita; sin decir quién', async () => {
    const o = await b4(nuevo, conTexto([{ tema: 'horario', hace_dias: 2, respuesta: 'Abrimos de 8 a 16, lunes a sábado.' }, { tema: 'delivery', hace_dias: 40, respuesta: 'No hacemos envíos.' }]))
    const p = o.pedido as string
    expect(p).toContain('LO QUE EL NEGOCIO RESPONDIÓ CON SUS PALABRAS')
    expect(p).toContain('PRECEDENCIA ALTA')
    expect(p).toContain('- horario (hace 2 días): Abrimos de 8 a 16, lunes a sábado.')
    expect(p).toContain('- delivery (hace 40 días): No hacemos envíos.')
    expect(p).toMatch(/sin decir quién lo dijo/)
    expect(p.indexOf('horario (hace 2')).toBeLessThan(p.indexOf('delivery (hace 40')) // respeta el orden recibido
    expect(o.texto_libre_dueno_usados).toBe(2)
    expect(o.texto_libre_dueno_estado).toBe('leido')
  })
  it('🔴 el nombre de una persona en la respuesta se limpia igual que en los hechos', async () => {
    const o = await b4(nuevo, { ...conTexto([{ tema: 'contacto', hace_dias: 1, respuesta: 'Escribir a Carlos Mendoza (propietario) al correo.' }]), ficha: { name: 'Cafetería Prueba', country: 'Ecuador', config: { personas: ['Carlos Mendoza'] } } })
    expect(o.pedido as string).not.toContain('Carlos Mendoza')
  })
  it('el texto libre va ANTES del público ideal y no duplica los hechos', async () => {
    const o = await b4(nuevo, { ...conTexto([{ tema: 'a', hace_dias: 1, respuesta: 'RESP-UNICA' }]), hechos_del_dueno: ['HECHO-DE-SEDE'] })
    const p = o.pedido as string
    expect(p.split('RESP-UNICA').length).toBe(2)
    expect(p.split('HECHO-DE-SEDE').length).toBe(2)
  })
  it('sin la lectura (estado apagado) lo declara en la salida pero el pedido no cambia', async () => {
    const o = await b4(nuevo, { ...PAQUETE, texto_libre_del_dueno: [], texto_libre_estado: 'apagado' })
    expect(o.texto_libre_dueno_estado).toBe('apagado')
    expect(o.texto_libre_dueno_usados).toBe(0)
    expect(o.pedido).toBe((await b4(vivo, PAQUETE)).pedido)
  })
})
