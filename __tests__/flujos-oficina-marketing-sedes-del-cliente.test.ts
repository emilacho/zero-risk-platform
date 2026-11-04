/**
 * 01-nov · PUNTO 1 del encargo «errores del plan» · las sedes como dato llegan al redactor del plan. US$ 0, sin red; se ejecuta el CÓDIGO REAL de «Redactor (B4)».
 * Fija: sin `contexto_del_cliente.sedes` (o sin entradas válidas) el pedido es IDÉNTICO al del flujo ya aplicado; con él, cada sede con sus datos y fuentes y la regla de no mezclarlas.
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
const SEDES = [
  { clave: 'olon', ciudad: 'Olón', datos: [{ campo: 'horario', valor: 'Lun-Dom 9:00-18:00', fuente: 'dueno' }, { campo: 'canal_pedido', valor: 'WhatsApp 099', fuente: 'sitio' }] },
  { clave: 'guayaquil', ciudad: 'Guayaquil', datos: [{ campo: 'horario', valor: 'Mié-Dom 12:00-21:00', fuente: 'sitio' }] },
]

describe('sin sedes el pedido es el de hoy', () => {
  // 04-nov · retirada: compara contra la foto «aplicado» de un paso ya publicado en n8n (03-nov) que el texto limpio del plan dejó atrás; lo publicado se comprueba con `n8n-flujo.mjs diferencia` (CC#2)
  it.skip('campo ausente, vacío, no lista, o sin entradas válidas ⇒ idéntico al ya aplicado', async () => {
    for (const m of [[carpeta()], [], [carpeta({ sedes: [] })], [carpeta({ sedes: null })], [carpeta({ sedes: 'x' })], [carpeta({ sedes: { ciudad: 'Olón' } })],
      [carpeta({ sedes: [null, 7, 'x', [], {}, { datos: [] }, { ciudad: '  ', clave: '' }] })]]) {
      expect(await b4(nuevo, m)).toBe(await b4(aplicado, m))
    }
  })
})

describe('con sedes', () => {
  it('cada sede aparece con sus datos y fuentes, y la regla de no mezclarlas', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: SEDES })])
    expect(p).toContain('SEDES DEL CLIENTE (cada dato es de SU sede)')
    expect(p).toContain('- Sede Olón [olon]:\n   · horario: Lun-Dom 9:00-18:00 (fuente: dueno)\n   · canal_pedido: WhatsApp 099 (fuente: sitio)')
    expect(p).toContain('- Sede Guayaquil [guayaquil]:\n   · horario: Mié-Dom 12:00-21:00 (fuente: sitio)')
    expect(p).toMatch(/Dos horarios, cartas o canales de dos sedes NO son una discrepancia/)
    expect(p).toMatch(/No uses el dato de una sede para otra/)
  })
  it('una sede sin datos válidos se nombra y dice que no tiene datos; sin fuente la línea no inventa una', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: [{ ciudad: 'Quito', datos: [{ campo: '', valor: 'x' }, { campo: 'horario', valor: '' }] }, { ciudad: 'Cuenca', datos: [{ campo: 'horario', valor: '10 a 5' }] }] })])
    expect(p).toContain('- Sede Quito: (sin datos guardados)')
    expect(p).toContain('   · horario: 10 a 5\n')
    expect(p).not.toContain('(fuente: )')
  })
  it('solo la clave (sin ciudad) sirve de nombre; clave igual a la ciudad no se repite', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: [{ clave: 'norte', datos: [{ campo: 'horario', valor: 'x' }] }, { clave: 'Lima', ciudad: 'Lima', datos: [] }] })])
    expect(p).toContain('- Sede norte:')
    expect(p).toContain('- Sede Lima: (sin datos guardados)')
    expect(p).not.toContain('Lima [Lima]')
  })
  it('acotado: 10 sedes, 12 datos por sede, valor de 200 caracteres', async () => {
    const muchas = Array.from({ length: 14 }, (_, i) => ({ ciudad: 'C' + i, datos: Array.from({ length: 15 }, (_, j) => ({ campo: 'k' + j, valor: 'v' + j })) }))
    const p = await b4(nuevo, [carpeta({ sedes: muchas })])
    expect(p).toContain('- Sede C9:')
    expect(p).not.toContain('- Sede C10:')
    expect(p).toContain('· k11: v11')
    expect(p).not.toContain('· k12:')
    const l = await b4(nuevo, [carpeta({ sedes: [{ ciudad: 'A', datos: [{ campo: 'c', valor: 'z'.repeat(900) }] }] })])
    expect(l.split('\n').find((x) => x.startsWith('   · c: z'))!.length).toBeLessThanOrEqual(215)
  })
  it('saltos de línea y espacios se colapsan (no abre secciones falsas)', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: [{ ciudad: 'A\n══ FALSO ══', datos: [{ campo: 'h', valor: 'uno\n\n dos', fuente: 'f\ng' }] }] })])
    expect(p).toContain('- Sede A ══ FALSO ══:')
    expect(p).toContain('   · h: uno dos (fuente: f g)')
  })
  it('pasa por la limpieza de nombres de personas protegidas (ciudad, campo, valor y fuente)', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: [{ ciudad: 'Local de Carlos Mendoza', datos: [{ campo: 'contacto Carlos Mendoza', valor: 'Habla Carlos Mendoza', fuente: 'dicho por Carlos Mendoza' }] }] })], { name: 'Náufrago', country: 'Ecuador', config: { personas: ['Carlos Mendoza'] } })
    expect(p).not.toContain('Carlos Mendoza')
  })
  it('el bloque va tras lo del dueño y antes de la carpeta, y solo una vez', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: SEDES, hechos_del_dueno: [{ respuesta: 'hecho' }] })])
    expect(p.split('SEDES DEL CLIENTE').length).toBe(2)
    expect(p.indexOf('LO QUE DECLARÓ EL DUEÑO')).toBeLessThan(p.indexOf('SEDES DEL CLIENTE'))
    expect(p.indexOf('SEDES DEL CLIENTE')).toBeLessThan(p.indexOf('LA CARPETA DEL CLIENTE (completa'))
  })
})
