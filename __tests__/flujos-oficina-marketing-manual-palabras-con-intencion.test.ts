/**
 * 01-nov · EQUIPO DEL MANUAL · parte 1 · el flujo del manual (`ssLtwYPt7zxuvnM2`) lleva las palabras «prohibidas» con su INTENCIÓN (contrato de CC1).
 * US$ 0, sin red; se ejecuta el CÓDIGO REAL del Consolidador. Lo que fija: sin la clave nueva todo idéntico a hoy; con ella se une, se sanea
 * (`legal` sin cita, `del_dueno` sin cita y fecha ⇒ `estilo`), se deduplica y lo que no estaba en `forbidden_words` se AGREGA (solo agrega).
 * Solo cambian dos nodos: «[BB] Fan-out prep» y «[BB] Consolidador». «[BB] Promote prep» no cambia y ya manda el borrador entero.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nuevo = leer('nuevo')
const vivo = leer('vivo')
const codigo = (f: any, n: string): string => f.nodes.find((x: any) => x.name === n).parameters.jsCode

const lente = (s: Record<string, unknown>) => ({ body: { brand_section: s } })
const consolidar = async (flujo: any, ed: Record<string, unknown>, st: Record<string, unknown> = {}, cs: Record<string, unknown> = {}) => {
  const r = await recorrer(flujo, '[BB] Consolidador', { cycle: 0 }, {
    previos: {
      'Validate Deal Data': [{ client_id: 'c-1' }],
      'Lente · editor-en-jefe': [lente(ed)],
      'Lente · brand-strategist': [lente(st)],
      'Lente · jefe-client-success': [lente(cs)],
      'Confirm barato · competitor list': [{ discovery_package: { discovery_summary: 'x' } }],
      '[BB] Fan-out prep': [{ _grounding_refs: {} }],
    },
    hasta: ['[BB] Uso · ¿usó lo disponible?'],
  })
  return r.item.brand_book_draft
}

describe('palabras con intención · alcance', () => {
  it('esta parte cambia «[BB] Fan-out prep» y «[BB] Consolidador» (el archivo acumula la parte 2, que toca solo al juez, y «pedir cambios al manual», que toca Validate Deal Data y Promote prep)', () => {
    const v = new Map(vivo.nodes.map((n: any) => [n.name, JSON.stringify(n)]))
    expect(nuevo.nodes.length).toBe(vivo.nodes.length)
    expect(nuevo.nodes.filter((n: any) => v.get(n.name) !== JSON.stringify(n)).map((n: any) => n.name).sort()).toEqual(['Validate Deal Data', '[BB] Consolidador', '[BB] Fan-out prep', '[BB] Judge · run-sdk', '[BB] Promote prep'])
    expect(codigo(nuevo, '[BB] Promote prep')).toContain('Object.assign({}, draft')
  })
  it('la sección del editor pide la lista, con «estilo» por defecto, «legal» solo con cita y nunca «del_dueno»', () => {
    const c = codigo(nuevo, '[BB] Fan-out prep')
    expect(c).toContain('palabras_con_intencion[]')
    expect(c).toContain('NUNCA marques "del_dueno"')
    expect(c).toContain('superlativos')
  })
})

describe('palabras con intención · consolidador (código real)', () => {
  it('sin la clave nueva en ninguna lente, forbidden_words idéntico a hoy y lista vacía', async () => {
    const ed = { forbidden_words: ['barato', 'Lujo'], required_terminology: ['ceviche'] }
    const st = { forbidden_words: ['LUJO', 'el mejor'] }
    const hoy = await consolidar(vivo, ed, st)
    const ya = await consolidar(nuevo, ed, st)
    expect(ya.forbidden_words).toEqual(hoy.forbidden_words)
    expect(ya.forbidden_words).toEqual(['barato', 'Lujo', 'el mejor'])
    expect(ya.palabras_con_intencion).toEqual([])
    expect(hoy.palabras_con_intencion).toBeUndefined()
  })
  it('une las lentes: estilo por defecto y legal con cita se conservan', async () => {
    const b = await consolidar(
      nuevo,
      { forbidden_words: ['barato'], palabras_con_intencion: [{ texto: 'barato', intencion: 'estilo', porque: 'el precio no es la marca' }] },
      { palabras_con_intencion: [{ texto: 'cura', intencion: 'legal', fuente: { cita: 'Art. 5 de la norma', origen: 'web del cliente' }, porque: 'no es un producto médico' }] },
    )
    expect(b.palabras_con_intencion).toEqual([
      { texto: 'barato', intencion: 'estilo', porque: 'el precio no es la marca' },
      { texto: 'cura', intencion: 'legal', porque: 'no es un producto médico', fuente: { cita: 'Art. 5 de la norma', origen: 'web del cliente' } },
    ])
  })
  it('legal sin cita ⇒ estilo; CUALQUIER del_dueno de una lente ⇒ estilo (aun con cita y fecha: lo del dueño entra solo por su puerta); intención rara ⇒ estilo', async () => {
    const b = await consolidar(nuevo, {
      palabras_con_intencion: [
        { texto: 'a', intencion: 'legal', porque: 'p' },
        { texto: 'b', intencion: 'del_dueno', fuente: { cita: 'lo dijo' }, porque: 'p' },
        { texto: 'c', intencion: 'del_dueno', fuente: { cita: 'lo dijo', fecha: '2026-10-01' }, porque: 'p' },
        { texto: 'd', intencion: 'bloqueo_total', porque: 'p' },
      ],
    })
    expect(b.palabras_con_intencion.map((x: any) => [x.texto, x.intencion])).toEqual([['a', 'estilo'], ['b', 'estilo'], ['c', 'estilo'], ['d', 'estilo']])
    expect(b.palabras_con_intencion[0].fuente).toBeUndefined()
    expect(b.palabras_con_intencion[2].fuente).toBeUndefined() // el estilo no arrastra una cita ajena
  })
  it('dos lentes nombran la misma palabra: una sola entrada, y gana la legal con cita', async () => {
    const b = await consolidar(
      nuevo,
      { palabras_con_intencion: [{ texto: 'Cura', intencion: 'estilo', porque: 'x' }] },
      { palabras_con_intencion: [{ texto: 'cura', intencion: 'legal', fuente: { cita: 'norma' }, porque: 'y' }] },
    )
    expect(b.palabras_con_intencion).toHaveLength(1)
    expect(b.palabras_con_intencion[0]).toMatchObject({ texto: 'cura', intencion: 'legal' })
  })
  it('una palabra con intención que no estaba en forbidden_words se AGREGA ahí; las que ya estaban no se duplican', async () => {
    const b = await consolidar(nuevo, {
      forbidden_words: ['barato'],
      palabras_con_intencion: [{ texto: 'BARATO', porque: 'p' }, { texto: 'gratis', porque: 'p' }],
    })
    expect(b.forbidden_words).toEqual(['barato', 'gratis'])
  })
  it('basura en la lista no tumba nada: textos, nulos, vacíos y listas que no son listas se ignoran', async () => {
    const b = await consolidar(nuevo, { palabras_con_intencion: ['solo texto', null, 3, [], { texto: '  ' }, { porque: 'sin texto' }, { texto: 'ok' }] }, { palabras_con_intencion: 'no es lista' })
    expect(b.palabras_con_intencion).toEqual([{ texto: 'ok', intencion: 'estilo', porque: '' }])
  })
})
