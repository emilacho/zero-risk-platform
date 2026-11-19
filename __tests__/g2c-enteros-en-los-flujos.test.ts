/**
 * 19-nov · G2c (+ el redactor de G4) «nada se recorta» (CC5): en los 2 flujos n8n, lo que escribió el dueño y lo que recibe el redactor del plan llegan ENTEROS.
 * Se ejecuta el CÓDIGO REAL de los nodos, del vivo (`vivo/`, bajado 19-nov) y del nuevo (`nuevo/`, = vivo + `reemplazos.cjs`). US$ 0, sin red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { TOPE_DEL_TEXTO_DEL_DUENO, TOPE_REAL_DEL_PEDIDO } from '@/lib/limites-de-tamano'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/g2c-enteros')
type Nodo = { name: string; parameters: Record<string, unknown> & { jsCode?: string } } & Record<string, unknown>
type Flujo = { nodes: Nodo[]; connections: unknown } & Record<string, unknown>
const leer = (c: string, id: string): Flujo => JSON.parse(fs.readFileSync(path.join(DIR, c, `${id}.json`), 'utf8'))
const { REEMPLAZOS } = createRequire(import.meta.url)(path.join(DIR, 'reemplazos.cjs')) as { REEMPLAZOS: Record<string, [string, string, string, string, number | null][]> }
const MANUAL = 'ssLtwYPt7zxuvnM2', PLAN = 'X9F0zp6LQ2xGEYVS'
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const codigo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!.parameters.jsCode as string

describe('G2c · los flujos nuevos salen del vivo con solo lo declarado', () => {
  it.each([MANUAL, PLAN])('%s · deshacer los reemplazos devuelve el vivo EXACTO (nada más cambió) y cada nodo tocado compila', (id) => {
    const vivo = leer('vivo', id), nuevo = leer('nuevo', id)
    const deshecho = JSON.parse(JSON.stringify(nuevo)) as Flujo
    let tocados = 0
    deshecho.nodes.forEach((n, i) => {
      if (JSON.stringify(n) === JSON.stringify(vivo.nodes[i])) return
      tocados++
      if (n.parameters.jsCode) expect(() => new Function(`return (async function(){${n.parameters.jsCode}\n})`), n.name).not.toThrow()
      for (const [, campo, a, b] of [...REEMPLAZOS[id]].reverse()) if (typeof n.parameters[campo] === 'string') n.parameters[campo] = (n.parameters[campo] as string).split(b).join(a)
    })
    expect(tocados).toBe(id === MANUAL ? 10 + 1 : 3)
    expect(deshecho).toEqual(vivo)
  })
  it('🔴 ningún valor viejo queda en el nuevo', () => {
    // solo los nodos: `activeVersion` es la copia que trae la lectura de n8n y no se sube al aplicar
    const m = JSON.stringify(leer('nuevo', MANUAL).nodes), p = JSON.stringify(leer('nuevo', PLAN).nodes)
    expect(m).not.toContain('trim().slice(0, 20000)')
    expect(m).not.toContain("trim(), 20000)")
    expect(m).not.toContain('PRESUPUESTO_TAREA = 15500')
    for (const viejo of ['limite=30', 'lista.slice(0, 30)', 'corta(x.respuesta, 600)', 'usado + n <= 6000', 'filas.length < 20', 'una(h.respuesta, 500)', 'slice(0, 2500)', 'material_citado).slice(0, 800)', 'i.citas.slice(0, 20)', '_V3_MAX_CONTENIDO = 1200']) expect(p, viejo).not.toContain(viejo)
  })
  it('los números nuevos son los de la plataforma: el tope único del texto del dueño y el techo real del pedido menos su margen', () => {
    expect(TOPE_DEL_TEXTO_DEL_DUENO).toBe(100_000)
    expect(TOPE_REAL_DEL_PEDIDO - 10_000).toBe(1_490_000)
  })
})

// ── el manual: «Pedir cambios» ──
const LARGO = 'INICIO-DEL-PEDIDO ' + 'quiero que la voz sea más cálida y cercana. '.repeat(1200) + ' FIN-DEL-PEDIDO' // ~53 000
const VDD = { client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', reescritura: { manual_cambio_id: 'mc1', cambios_del_dueno: LARGO, seccion: 'Cómo habla', campos_validados: [], campos_liberados: ['tono_por_canal', 'reglas_de_escritura', 'valores', 'nunca_hace', 'historia_y_origen', 'direccion_de_fotografia', 'uso_del_logo', 'jerarquia_tipografica'], manual_vigente: { voice_description: 'cálida' } } }
const BORRADOR = { voice_description: 'BORRADOR-VOZ ' + 'x'.repeat(30000) + ' FIN-BORRADOR' }
async function preparar(f: Flujo, nodo: string) {
  const $json = { brand_book_draft: BORRADOR, _grounding_refs: { evidencia: 'E' } }
  const $ = () => ({ first: () => ({ json: VDD }), all: () => [{ json: VDD }] })
  const r = await new AsyncFunction('$', '$json', '$env', '$execution', '$input', codigo(f, nodo)).call({ helpers: { httpRequest: async () => ({ fotos: [] }) } }, $, $json, {}, { id: '9' }, { first: () => ({ json: $json }), all: () => [{ json: $json }] })
  return (r as { json: Record<string, unknown> }[]).filter((x) => x.json._eq_body).map((x) => ({ paso: String(x.json._eq_paso), cuerpo: JSON.stringify(x.json._eq_body) }))
}

describe('G2c · el manual: lo que pidió el dueño llega entero a cada empleado del equipo', () => {
  it.each([
    ['[BB] Equipo · aportes de los dueños · preparar', 2, true],
    ['[BB] Equipo · mesa creativa · preparar', 1, true],
    ['[BB] Equipo · logo y tipografía · preparar', 1, false], // este empleado no recibe el borrador (diseño)
  ] as const)('🔴 %s · el pedido de ~53 000 llega entero (con su final) y el borrador del manual no se cae', async (nodo, pedidos, conBorrador) => {
    const nuevo = await preparar(leer('nuevo', MANUAL), nodo)
    expect(nuevo).toHaveLength(pedidos)
    for (const p of nuevo) {
      expect(p.cuerpo, p.paso).toContain('FIN-DEL-PEDIDO')
      if (conBorrador) expect(p.cuerpo, p.paso).toContain('FIN-BORRADOR')
    }
    // el vivo lo cortaba: así se ve que la prueba mide lo que dice
    for (const p of await preparar(leer('vivo', MANUAL), nodo)) expect(p.cuerpo, p.paso).not.toContain('FIN-DEL-PEDIDO')
  })
  it('🔴 el juez de datos duros recibe el borrador entero (el presupuesto de 15 500 lo cortaba)', async () => {
    const [n] = await preparar(leer('nuevo', MANUAL), '[BB] Equipo · el juez anota datos duros sin fuente · preparar')
    expect(n.cuerpo).toContain('FIN-BORRADOR')
    const [v] = await preparar(leer('vivo', MANUAL), '[BB] Equipo · el juez anota datos duros sin fuente · preparar')
    expect(v.cuerpo).not.toContain('FIN-BORRADOR')
  })
})

// ── la planeación ──
const PAQUETE = { ficha: { name: 'Cafetería Prueba', country: 'Ecuador' }, manual: {}, material: [], descartados: [], referencia: 'REF', casa: {}, plata: {}, hechos_del_dueno: [] }
async function unir(f: Flujo, body: Record<string, unknown>) {
  const $ = (n: string) => { if (n !== 'Unir el público ideal al paquete') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: PAQUETE }) } }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo(f, 'Unir el texto libre del dueño al paquete'))({ first: () => ({ json: { statusCode: 200, body } }) }, $, {}, {})
  return r[0].json as { texto_libre_del_dueno: { tema: string; respuesta: string }[]; texto_libre_estado: string; texto_libre_recortado_por_la_lectura?: boolean }
}
const respuestas = (n: number, largo: number) => Array.from({ length: n }, (_, i) => ({ tema: 'Tema ' + i, respuesta: 'R' + i + ' ' + 'a'.repeat(largo) + ' FIN-' + i, hace_dias: i, confirmado_por_el_dueno: true }))

describe('G2c · la planeación: lo que el negocio respondió con sus palabras, entero', () => {
  it('🔴 la lectura pide hasta 100 respuestas (lo que da la ruta), no 30', () => {
    const url = (f: Flujo) => String(f.nodes.find((x) => x.name === 'Lo que dijo el dueño · texto libre')!.parameters.url)
    expect(url(leer('nuevo', PLAN))).toContain('&limite=100')
    expect(url(leer('vivo', PLAN))).toContain('&limite=30')
  })
  it('🔴 45 respuestas de 5 000 caracteres llegan las 45, cada una entera', async () => {
    const x = await unir(leer('nuevo', PLAN), { ok: true, respuestas: respuestas(45, 5000) })
    expect(x.texto_libre_del_dueno).toHaveLength(45)
    x.texto_libre_del_dueno.forEach((it, i) => expect(it.respuesta.endsWith('FIN-' + i)).toBe(true))
    const v = await unir(leer('vivo', PLAN), { ok: true, respuestas: respuestas(45, 5000) })
    expect(v.texto_libre_del_dueno.length).toBeLessThan(45)
  })
  it('🔴 si la ruta avisa que recortó (más de 100), el paquete lo declara; si no, no', async () => {
    expect((await unir(leer('nuevo', PLAN), { ok: true, recortado: true, respuestas: respuestas(2, 10) })).texto_libre_recortado_por_la_lectura).toBe(true)
    expect((await unir(leer('nuevo', PLAN), { ok: true, recortado: false, respuestas: respuestas(2, 10) })).texto_libre_recortado_por_la_lectura).toBe(false)
  })
})

const carpeta = (extra: Record<string, unknown> = {}) => ({ brazo: 'cerebro', estado: 'trajo', objetivo: 'cerebro', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'vigente', texto: 'RESUMEN DEL CLIENTE' }, informes: [], ...extra } } })
async function redactor(f: Flujo, material: unknown[]) {
  const ent = { ficha: { name: 'Náufrago', country: 'Ecuador', config: {} }, manual: {}, material, descartados: [], referencia: 'REF', casa: {}, plata: {} }
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo(f, 'Redactor (B4)'))({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {})
  return String(r[0].json.pedido)
}

describe('G2c · el redactor del plan: lo que declaró el dueño, entero', () => {
  it('🔴 30 hechos de 3 000 caracteres con 8 frases negadas: llegan todos, enteros, con todas sus frases', async () => {
    const hechos = Array.from({ length: 30 }, (_, i) => ({ tema: 'Tema largo ' + i + ' ' + 't'.repeat(200), respuesta: 'Respuesta ' + i + ' ' + 'r'.repeat(3000) + ' FIN-HECHO-' + i, sede: 'Sede ' + 'S'.repeat(100), frases_negadas: Array.from({ length: 8 }, (_, k) => 'negada-' + i + '-' + k + ' ' + 'n'.repeat(150)) }))
    const p = await redactor(leer('nuevo', PLAN), [carpeta({ hechos_del_dueno: hechos })])
    for (let i = 0; i < 30; i++) {
      expect(p, 'hecho ' + i).toContain('FIN-HECHO-' + i)
      expect(p).toContain('negada-' + i + '-7 ' + 'n'.repeat(150))
    }
    expect(p).toContain('t'.repeat(200))
    expect(p).toContain('S'.repeat(100))
    const v = await redactor(leer('vivo', PLAN), [carpeta({ hechos_del_dueno: hechos })])
    expect(v).not.toContain('FIN-HECHO-0')
  })
})

describe('G4 · el redactor del plan recibe los brazos enteros', () => {
  it('🔴 un brazo que no es análisis llega entero (antes 2 500)', async () => {
    const brazo = { brazo: 'competencia', estado: 'trajo', objetivo: 'competencia', datos: { resumen: 'INICIO-BRAZO ' + 'c'.repeat(9000) + ' FIN-BRAZO' } }
    expect(await redactor(leer('nuevo', PLAN), [carpeta(), brazo])).toContain('FIN-BRAZO')
    expect(await redactor(leer('vivo', PLAN), [carpeta(), brazo])).not.toContain('FIN-BRAZO')
  })
  it('🔴 las citas de un informe llegan todas y enteras (antes 20 × 120)', async () => {
    const citas = Array.from({ length: 25 }, (_, i) => 'cita-' + i + ' ' + 'q'.repeat(300) + ' FIN-CITA-' + i)
    const informes = [{ tipo: 'mercado', texto: 'INFORME', citas }]
    const p = await redactor(leer('nuevo', PLAN), [carpeta({ informes })])
    for (let i = 0; i < 25; i++) expect(p).toContain('FIN-CITA-' + i)
    const v = await redactor(leer('vivo', PLAN), [carpeta({ informes })])
    expect(v).not.toContain('FIN-CITA-0')
  })
})
