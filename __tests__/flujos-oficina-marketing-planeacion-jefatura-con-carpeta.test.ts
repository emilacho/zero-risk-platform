/**
 * LA JEFATURA REVISA CON LA MISMA CARPETA QUE EL REDACTOR (encargo de Emilio 01-nov, punto 1): «JEF · armar» del flujo de planeación suma al `contexto`
 * el resumen vivo, los informes de la mesa de análisis y las páginas del sitio, ENTEROS; y si faltan, lo declara. Corre el código REAL del nodo con el emulador.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
import { BLOQUE_CARPETA_DE_LA_JEFATURA } from '../scripts/ops/oficina-marketing/jefatura-contexto.mjs'

const flujo = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/ops/oficina-marketing/nuevo/X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const UUID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'

const carpeta = (extra: Record<string, unknown> = {}) => ({
  brazo: 'cerebro', objetivo: 'cerebro_del_cliente', estado: 'trajo',
  datos: { contexto_del_cliente: { resumen_vivo: { estado: 'vigente', texto: 'Olón abre de jueves a lunes. Hay canal de pedidos en el sitio, con cobro.' }, informes: [{ titulo: 'Retención', texto: 'Informe largo de la mesa.' }, { titulo: 'Sin texto', texto: '   ' }], ...extra } },
})
const sitio = (texto = 'Encebollado 6,50') => ({ brazo: 'apify', objetivo: 'sitio_propio', estado: 'trajo', fuente: 'https://ejemplo.test/menu', datos: { menu: texto } })

function previos(paquete: any | null, nodoDelPaquete = 'FIN · devolver el paquete') {
  return {
    '¿Llegó la vuelta?': [{ llego_la_vuelta: true, texto: 'EL PLAN', client_id: UUID, chequeo_del_plan: { marcas: [] } }],
    'Guardar el plan': [{ id: 'plan-1', provenance_tag: { origen: 'x' } }],
    'Webhook · planeacion': [{ body: { dry_run: true } }],
    '① Cargar el manual de marca': [{ id: 'm1', content_text: 'MANUAL DE MARCA' }],
    'Ficha del cliente': [{ name: 'Cliente' }],
    'Unir lo del dueño al paquete': [{ hechos_del_dueno: [{ hecho: 'Olón abre' }] }],
    'Redactor (B4)': [{ pedido: 'EL PEDIDO' }],
    ...(paquete ? { [nodoDelPaquete]: [paquete] } : {}),
  } as Record<string, any[]>
}
const armar = async (p: Record<string, any[]>) => (await recorrer(flujo, 'JEF · armar', {}, { previos: p, hasta: ['JEF · ¿se abre?'] })).historial['JEF · armar'][0]
const docs = (r: any) => r.sobre.payload.contexto as Array<{ titulo: string; texto: string; funcion?: string }>
const doc = (r: any, titulo: string) => docs(r).find((d) => d.titulo === titulo)

describe('jefatura con carpeta · el contexto del revisor', () => {
  it('con carpeta vigente y sitio: suma resumen vivo, informes y páginas, además del manual, la ficha y lo del dueño', async () => {
    const r = await armar(previos({ material: [carpeta(), sitio()] }))
    expect(r.abrir).toBe(true)
    expect(docs(r).map((d) => d.titulo)).toEqual(['Manual de marca vigente', 'Ficha del cliente', 'Lo que dijo el dueño', 'Carpeta del cliente · resumen vivo', 'Carpeta del cliente · informes de la mesa de análisis', 'Páginas del sitio del cliente'])
    expect(doc(r, 'Carpeta del cliente · resumen vivo')!.texto).toContain('Olón abre de jueves a lunes')
    expect(doc(r, 'Carpeta del cliente · informes de la mesa de análisis')!.texto).toBe('### Retención\nInforme largo de la mesa.')
    expect(doc(r, 'Páginas del sitio del cliente')!.texto).toContain('Encebollado 6,50')
    expect(doc(r, 'Páginas del sitio del cliente')!.texto).toContain('https://ejemplo.test/menu')
  })
  it('NO recorta: un resumen y un sitio de 150.000 caracteres entran enteros', async () => {
    const grande = 'x'.repeat(150_000)
    const r = await armar(previos({ material: [carpeta({ resumen_vivo: { estado: 'vigente', texto: grande } }), sitio(grande)] }))
    expect(doc(r, 'Carpeta del cliente · resumen vivo')!.texto.length).toBe(150_000)
    expect(doc(r, 'Páginas del sitio del cliente')!.texto.length).toBeGreaterThan(150_000)
  })
  it('el resumen vivo puede venir por sedes', async () => {
    const r = await armar(previos({ material: [carpeta({ resumen_vivo: { estado: 'vigente', sedes: [{ texto: 'Sede Olón' }, { texto: '' }, { texto: 'Sede Guayaquil' }] } }), sitio()] }))
    expect(doc(r, 'Carpeta del cliente · resumen vivo')!.texto).toBe('Sede Olón\n\nSede Guayaquil')
  })
  it('sin carpeta ni sitio lo DECLARA en lugar de callar', async () => {
    const r = await armar(previos({ material: [] }))
    expect(doc(r, 'Carpeta del cliente')!.texto).toMatch(/^SIN CARPETA VIGENTE/)
    expect(doc(r, 'Páginas del sitio del cliente')!.texto).toMatch(/^SIN PÁGINAS DEL SITIO/)
    expect(doc(r, 'Carpeta del cliente · resumen vivo')).toBeUndefined()
  })
  it('si el paquete no se puede leer en ningún nodo, también lo declara y la revisión sigue abriendo', async () => {
    const r = await armar(previos(null))
    expect(r.abrir).toBe(true)
    expect(doc(r, 'Carpeta del cliente')!.texto).toMatch(/^SIN CARPETA VIGENTE/)
  })
  it('lee el paquete de cualquiera de los dos nodos que alimentan al redactor', async () => {
    const r = await armar(previos({ material: [carpeta(), sitio()] }, 'FIN · ¿trae finanzas_id?'))
    expect(doc(r, 'Carpeta del cliente · resumen vivo')).toBeDefined()
  })
  it('una página solo cuenta si TRAJO datos y es del sitio: lo de otros brazos o sin dato no entra como «sitio»', async () => {
    const r = await armar(previos({ material: [carpeta(), { ...sitio(), estado: 'sin_dato' }, { brazo: 'apify', objetivo: 'redes_sociales', estado: 'trajo', datos: { a: 1 } }, { brazo: 'cerebro', objetivo: 'sitio_web', estado: 'trajo', datos: { b: 2 } }] }))
    expect(doc(r, 'Páginas del sitio del cliente')!.texto).toMatch(/^SIN PÁGINAS DEL SITIO/)
  })
  it('no cambia el resto del sobre: tipo, plan, versión y revisión de A', async () => {
    const r = await armar(previos({ material: [carpeta(), sitio()] }))
    expect(r.sobre.artifact_type).toBe('plan')
    expect(r.sobre.artifact_id).toBe('plan-1')
    expect(r.sobre.payload.texto).toBe('EL PLAN')
    expect(r.sobre.payload.generado_por_jefatura).toBeNull()
    expect(r.sobre.payload.pedido_del_plan).toBe('EL PEDIDO')
  })
})

describe('jefatura con carpeta · el archivo', () => {
  it('el nodo del flujo trae el bloque de la fuente, una sola vez, antes de las marcas', () => {
    const c: string = flujo.nodes.find((n: any) => n.name === 'JEF · armar').parameters.jsCode
    expect(c.split(BLOQUE_CARPETA_DE_LA_JEFATURA).length - 1).toBe(1)
    expect(c.indexOf(BLOQUE_CARPETA_DE_LA_JEFATURA)).toBeLessThan(c.indexOf('const marcas = '))
  })
  it('no pone ningún tope de tamaño propio al contexto', () => {
    expect(BLOQUE_CARPETA_DE_LA_JEFATURA).not.toMatch(/\.slice\(0,|substring|substr\(|\.length\s*>\s*\d{3,}/)
  })
})
