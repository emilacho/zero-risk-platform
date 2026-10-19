/**
 * EL PÚBLICO IDEAL ENTRA A LA PLANEACIÓN (CC#1 · noche 19-oct): la planeación lo lee DIRECTO de `client_icp_documents` y se lo pasa al redactor, rotulado como NO confirmado.
 * Se ejecuta el MISMO texto que se pega en n8n (`bloque-publico-ideal-2026-10-19.js`) y se vigila la forma del flujo ARREGLADO. US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const textoFuncion = fs.readFileSync(path.join(D, 'bloque-publico-ideal-2026-10-19.js'), 'utf8')
const bloque = new Function(textoFuncion + '\nreturn bloqueDelPublicoIdeal')() as (f: unknown, l?: (t: string) => string) => string[]
const flujo = JSON.parse(fs.readFileSync(path.join(D, 'planeacion-ARREGLADO-icp-2026-10-19.json'), 'utf8'))
const cont = flujo.nodes ? flujo : (Object.values(flujo).find((v) => v && typeof v === 'object' && (v as { nodes?: unknown }).nodes) as typeof flujo)
const nodos: Array<{ name: string; type: string; parameters: Record<string, any> }> = cont.nodes
const conex: Record<string, { main: Array<Array<{ node: string }>> }> = cont.connections
const nodo = (n: string) => nodos.find((x) => x.name === n)!

const FILA = { audience_segment: 'Familias de la zona', segment_priority: 1, goals: ['comer rico sin esperar', 'precio justo'], pain_points: 'colas largas', objections: null, preferred_channels: ['instagram', 'whatsapp'], key_messages_for_segment: { plato: 'del día', tono: 'cercano' }, buying_process: '', geography: ['Olón'], content_preferences: 'fotos reales' }

describe('el bloque del público ideal', () => {
  it('sin filas, o sin segmento nombrado, no dice nada', () => {
    expect(bloque([])).toEqual([])
    expect(bloque(undefined)).toEqual([])
    expect(bloque(null)).toEqual([])
    expect(bloque([{ goals: 'algo' }, null, 7, { audience_segment: '   ' }])).toEqual([])
  })
  it('rotula lo que viene como NO confirmado por el dueño y avisa que lo confirmado manda', () => {
    const L = bloque([FILA]).join('\n')
    expect(L).toMatch(/NO confirmado por el dueño/)
    expect(L).toMatch(/vale lo confirmado/)
    expect(L).toMatch(/NO lo escribas como un dato confirmado/)
  })
  it('ordena lo que la fila trae: listas, objetos y vacíos se aplanan sin inventar', () => {
    const l = bloque([FILA]).find((x) => x.startsWith('- '))!
    expect(l).toContain('Familias de la zona')
    expect(l).toContain('Quieren: comer rico sin esperar, precio justo')
    expect(l).toContain('Dolores: colas largas')
    expect(l).toContain('Canales donde están: instagram, whatsapp')
    expect(l).toContain('Mensajes que les sirven: plato: del día; tono: cercano')
    expect(l).toContain('Dónde: Olón')
    expect(l).not.toContain('Objeciones') // null: no se menciona
    expect(l).not.toContain('Cómo deciden') // '': no se menciona
  })
  it('máximo 6 segmentos, cada campo corto y el total acotado', () => {
    const muchas = Array.from({ length: 9 }, (_, i) => ({ audience_segment: 'Segmento ' + i, goals: 'x'.repeat(500) }))
    const lineas = bloque(muchas).filter((x) => x.startsWith('- '))
    expect(lineas.length).toBeLessThanOrEqual(6)
    for (const l of lineas) expect(l.length).toBeLessThan(500)
    expect(lineas.join('').length).toBeLessThanOrEqual(2400)
    const enormes = Array.from({ length: 6 }, (_, i) => ({ audience_segment: 'S' + i, goals: 'a'.repeat(240), pain_points: 'b'.repeat(240), objections: 'c'.repeat(240), preferred_channels: 'd'.repeat(240) }))
    expect(bloque(enormes).filter((x) => x.startsWith('- ')).join('').length).toBeLessThanOrEqual(2400)
  })
  it('pasa cada línea por la limpieza de nombres de personas del redactor', () => {
    const l = bloque([{ audience_segment: 'Clientes de Juan Pérez', goals: 'ver a Juan Pérez' }], (t) => t.split('Juan Pérez').join('[persona]')).find((x) => x.startsWith('- '))!
    expect(l).not.toContain('Juan')
    expect(l).toContain('[persona]')
  })
  it('es agnóstico: ningún cliente, ciudad ni rubro escritos en el texto', () => {
    expect(textoFuncion).not.toMatch(/naufrago|náufrago|guayaquil|olón|ceviche|restaurante/i)
  })
})

describe('el flujo ARREGLADO', () => {
  it('lee el ICP del cliente de ESTE pedido (solo lectura, fullResponse, tope de 6) y lo une al paquete antes del pre-vuelo del dato v1', () => {
    const leer = nodo('Público ideal (ICP)')
    expect(leer.parameters.method).toBe('GET')
    expect(leer.parameters.url).toContain('/rest/v1/client_icp_documents')
    expect(leer.parameters.url).toContain("client_id=eq.{{ $('Webhook · planeacion').first().json.body.client_id }}")
    expect(leer.parameters.url).toContain('limit=6')
    expect(leer.parameters.options.response.response).toEqual({ fullResponse: true, neverError: true })
    expect(conex['Unir lo del dueño al paquete'].main[0].map((x) => x.node)).toEqual(['Público ideal (ICP)'])
    expect(conex['Público ideal (ICP)'].main[0].map((x) => x.node)).toEqual(['Unir el público ideal al paquete'])
    expect(conex['Unir el público ideal al paquete'].main[0].map((x) => x.node)).toEqual(['PV3 · ¿pide el dato v1?'])
  })
  it('el redactor lleva la función y la llama justo después de «lo que sabe el negocio»', () => {
    const c = nodo('Redactor (B4)').parameters.jsCode as string
    expect(c).toContain('function bloqueDelPublicoIdeal(filas, limpiar)')
    const a = c.indexOf('...bloqueDelDueno(')
    const b = c.indexOf('...bloqueDelPublicoIdeal(Array.isArray(ent.icp) ? ent.icp : [], limpio),')
    const z = c.indexOf('SECCIONES QUE NO PUEDES OMITIR')
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(z).toBeGreaterThan(b)
    expect(c.split('function bloqueDelPublicoIdeal(').length - 1).toBe(1)
  })
  it('«Unir el público ideal» deja el paquete igual y declara si leyó, estaba vacío o no pudo leer', () => {
    const codigo = nodo('Unir el público ideal al paquete').parameters.jsCode as string
    const correr = (respuesta: unknown) => {
      const base = { ficha: { id: 'c1' }, hechos_del_dueno: ['h'] }
      const f = new Function('$input', '$', codigo)
      return (f({ first: () => ({ json: respuesta }) }, () => ({ first: () => ({ json: base }) })) as Array<{ json: Record<string, any> }>)[0].json
    }
    expect(correr({ statusCode: 200, body: [{ audience_segment: 'A' }] })).toMatchObject({ ficha: { id: 'c1' }, hechos_del_dueno: ['h'], icp_estado: 'leido', icp: [{ audience_segment: 'A' }] })
    expect(correr({ statusCode: 200, body: [] })).toMatchObject({ icp_estado: 'vacio', icp: [] })
    for (const mala of [{ statusCode: 500, body: { message: 'x' } }, { statusCode: 200, body: 'no es lista' }, { body: [] }, {}]) expect(correr(mala)).toMatchObject({ icp_estado: 'sin_lectura', icp: [] })
  })
  it('lo demás del flujo no cambió: mismos nodos que antes + los 2 nuevos', () => {
    const antes = JSON.parse(fs.readFileSync(path.join(D, 'planeacion-ANTES-icp-2026-10-19.json'), 'utf8'))
    const ca = antes.nodes ? antes : (Object.values(antes).find((v) => v && typeof v === 'object' && (v as { nodes?: unknown }).nodes) as typeof antes)
    const nombresAntes = new Set<string>(ca.nodes.map((n: { name: string }) => n.name))
    const nuevos = nodos.filter((n) => !nombresAntes.has(n.name)).map((n) => n.name).sort()
    expect(nuevos).toEqual(['Público ideal (ICP)', 'Unir el público ideal al paquete'].sort())
    for (const n of ca.nodes as Array<{ name: string; parameters: unknown }>) {
      if (n.name === 'Redactor (B4)') continue
      expect(JSON.stringify(nodo(n.name).parameters)).toBe(JSON.stringify(n.parameters))
    }
  })
})
