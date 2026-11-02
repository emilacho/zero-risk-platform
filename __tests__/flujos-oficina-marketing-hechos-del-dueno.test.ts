/**
 * 01-nov · PUNTO 3 del encargo «errores del plan» · lo que declaró el dueño llega al redactor del plan como hecho con precedencia. US$ 0, sin red; se ejecuta el CÓDIGO REAL de «Redactor (B4)».
 * Fija: sin `contexto_del_cliente.hechos_del_dueno` (o sin entradas válidas) el pedido es IDÉNTICO al del flujo ya aplicado; con él, un bloque con cada hecho, su sede y sus frases negadas, y la regla de precedencia.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sinFraseSedes } from './_sin-frase-sedes'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const aplicado = leer('aplicado'), nuevo = sinFraseSedes(leer('nuevo'))
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor

const carpeta = (extra: Record<string, unknown> = {}) => ({ brazo: 'cerebro', estado: 'trajo', objetivo: 'cerebro', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'vigente', texto: 'RESUMEN DEL CLIENTE' }, informes: [], ...extra } } })
const b4 = async (flujo: any, material: any[], ficha: any = { name: 'Náufrago', country: 'Ecuador', config: {} }) => {
  const codigo = flujo.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string
  const ent = { ficha, manual: {}, material, descartados: [], referencia: 'REF', casa: {}, plata: {} }
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo)({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {})
  return (r[0].json as Record<string, any>).pedido as string
}
const HECHO = { tema: 'Procedencia del marisco', respuesta: 'El marisco no viene de Olón; lo trae un proveedor de Manta.', sede: 'Guayaquil', frases_negadas: ['marisco de Olón'] }

describe('sin hechos del dueño el pedido es el de hoy', () => {
  it('campo ausente, vacío, no lista, o sin entradas válidas ⇒ idéntico al ya aplicado', async () => {
    for (const m of [[carpeta()], [], [carpeta({ hechos_del_dueno: [] })], [carpeta({ hechos_del_dueno: null })], [carpeta({ hechos_del_dueno: 'x' })], [carpeta({ hechos_del_dueno: { tema: 'a', respuesta: 'b' } })],
      [carpeta({ hechos_del_dueno: [null, 7, 'x', [], {}, { tema: 'sin respuesta' }, { respuesta: '   ' }] })]]) {
      expect(await b4(nuevo, m)).toBe(await b4(aplicado, m))
    }
  })
})

describe('con hechos del dueño', () => {
  it('cada hecho aparece con su tema, sede y respuesta; las frases negadas como «NO digas ni insinúes»', async () => {
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: [HECHO] })])
    expect(p).toContain('LO QUE DECLARÓ EL DUEÑO (hechos con la MÁXIMA precedencia)')
    expect(p).toContain('- Procedencia del marisco [sede: Guayaquil] → El marisco no viene de Olón; lo trae un proveedor de Manta.')
    expect(p).toContain('NO digas ni insinúes: «marisco de Olón»')
    expect(p).toMatch(/manda sobre el manual, la carpeta, el cerebro y cualquier otra fuente/)
    expect(p).toMatch(/no escribas nada que lo contradiga \(incluida la idea de marca\)/)
  })
  it('sin sede ni frases negadas: la línea es limpia', async () => {
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: [{ tema: 'Horario', respuesta: 'Abrimos a las 9.' }] })])
    expect(p).toContain('- Horario → Abrimos a las 9.')
    expect(p).not.toContain('[sede:')
    expect(p).not.toContain('NO digas')
  })
  it('una entrada inválida en medio no tumba a las buenas', async () => {
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: [null, { respuesta: '' }, HECHO, 'x'] })])
    expect(p).toContain('El marisco no viene de Olón')
    expect(p.split('→').length - 1).toBeGreaterThanOrEqual(1)
  })
  it('acotado: máximo 20 hechos, 6 frases por hecho, respuesta de 500 caracteres', async () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ tema: 'T' + i, respuesta: 'R' + i }))
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: muchos })])
    expect(p).toContain('- T19 → R19')
    expect(p).not.toContain('- T20 →')
    const q = await b4(nuevo, [carpeta({ hechos_del_dueno: [{ respuesta: 'x', frases_negadas: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] }] })])
    expect(q).toContain('«a6»')
    expect(q).not.toContain('«a7»')
    const l = await b4(nuevo, [carpeta({ hechos_del_dueno: [{ respuesta: 'z'.repeat(900) }] })])
    expect(l.split('\n').find((x) => x.startsWith('- → z'))!.length).toBeLessThanOrEqual(510)
  })
  it('saltos de línea y espacios se colapsan (no rompe el bloque ni abre secciones)', async () => {
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: [{ tema: 'a\n\n══ FALSO ══', respuesta: 'uno\n\n dos', frases_negadas: ['x\ny'] }] })])
    expect(p).toContain('- a ══ FALSO ══ → uno dos · NO digas ni insinúes: «x y»')
  })
  it('pasa por la limpieza de nombres de personas protegidas', async () => {
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: [{ tema: 'Lo que dice Carlos Mendoza', sede: 'Local de Carlos Mendoza', respuesta: 'Habla Carlos Mendoza', frases_negadas: ['Carlos Mendoza'] }] })], { name: 'Náufrago', country: 'Ecuador', config: { personas: ['Carlos Mendoza'] } })
    expect(p).not.toContain('Carlos Mendoza')
  })
  it('el bloque va tras el eslogan y antes de la carpeta, y solo una vez', async () => {
    const p = await b4(nuevo, [carpeta({ hechos_del_dueno: [HECHO], eslogan: { texto: 'Frase real', fuente: 'f' } })])
    expect(p.split('LO QUE DECLARÓ EL DUEÑO').length).toBe(2)
    expect(p.indexOf('ESLOGAN QUE EL CLIENTE YA USA')).toBeLessThan(p.indexOf('LO QUE DECLARÓ EL DUEÑO'))
    expect(p.indexOf('LO QUE DECLARÓ EL DUEÑO')).toBeLessThan(p.indexOf('LA CARPETA DEL CLIENTE (completa'))
  })
})
