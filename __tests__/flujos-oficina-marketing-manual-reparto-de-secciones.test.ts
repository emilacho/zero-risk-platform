/**
 * 02-nov · EQUIPO DEL MANUAL · (c1) REPARTO DE SECCIONES (SEÑAL-LENOVO 13:27Z · firma de Emilio 01-nov).
 * US$ 0, sin red: se ejecuta el CÓDIGO REAL de «[BB] Fan-out prep» y «[BB] Consolidador» con la evidencia real de la ejecución 146544.
 * Fija: brand-strategist recibe la estrategia (visión, misión, propósito, propuestas de valor) además de lo suyo; jefe-client-success conserva sus dos campos gateados y recibe productos y sedes;
 * la voz y la evidencia no cambian; todas las tareas caben bajo el techo; el Consolidador rotula cada campo con quien lo escribe y NO toma misión/propósito/propuestas de la lente equivocada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
import { REEMPLAZOS_CONSOLIDADOR, REEMPLAZOS_FAN_OUT } from '../scripts/ops/oficina-marketing/reparto-de-secciones-manual.mjs'
import { REVISION } from '../scripts/ops/oficina-marketing/voz-content-creator-manual.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nuevo = leer('nuevo')
const codigo = (f: any, n: string): string => f.nodes.find((x: any) => x.name === n).parameters.jsCode
const EV44 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts/worker-staging/ssLtwYPt7zxuvnM2/evidencia-146544-e109.json'), 'utf8')) as { nodos: Record<string, any>; todos: Record<string, any[]> }

const FANOUT = '[BB] Fan-out prep'
const CONS = '[BB] Consolidador'
const LENTES = ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']
const deshacer = (c: string, pares: string[][]) => pares.reduce((t, [viejo, nuevoT]) => { if (t.split(nuevoT).length !== 2) throw new Error('el reemplazo no está una sola vez'); return t.replace(nuevoT, () => viejo) }, c)
const previoFan = deshacer(codigo(nuevo, FANOUT), REEMPLAZOS_FAN_OUT)
const previoCons = deshacer(codigo(nuevo, CONS), REEMPLAZOS_CONSOLIDADOR)

function correr(code: string, ctx: { nodos: Record<string, any>; todos: Record<string, any[]>; json: any }) {
  const $ = (n: string) => {
    if (!(n in ctx.nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: ctx.nodos[n] }), all: () => (ctx.todos[n] ?? [ctx.nodos[n]]).map((j) => ({ json: j })), item: { json: ctx.nodos[n] } }
  }
  return new Function('$', '$json', '$execution', code)($, ctx.json, { id: '999001' }) as Array<{ json: any }>
}
const materia = (extra: Record<string, unknown> = {}) => ({ idioma: 'español de Ecuador', sitio_estado: 'trajo', sitio_texto: 'x'.repeat(3500), sitio_caracteres_total: 16006, instagram_propio: 'y'.repeat(1000), instagram_estado: 'trajo', ...extra })
const ctxFan = (m: Record<string, unknown> | null) => {
  const nodos = JSON.parse(JSON.stringify(EV44.nodos)); const todos = JSON.parse(JSON.stringify(EV44.todos))
  if (m) { nodos['Confirm barato · competitor list'].discovery_package.materia_cliente = m; todos['Confirm barato · competitor list'][0].discovery_package.materia_cliente = m }
  return { nodos, todos, json: nodos['[BB] Load ICP (canon)'] }
}
const CASOS = [materia(), materia({ estado_frase_propia: 'hallado', frase_propia: 'Cuando tengas esa hambre de... Náufrago te espera!' }), materia({ estado_frase_propia: 'hallado', frase_propia: 'palabra '.repeat(400) }), null]

describe('reparto de secciones · lo que recibe cada lente (código real de Fan-out prep)', () => {
  it('brand-strategist recibe la estrategia: visión, misión, propósito y propuestas de valor, con su insumo de mercado y la regla de campos nuevos', () => {
    const [o] = correr(codigo(nuevo, FANOUT), ctxFan(CASOS[0]))
    const t = o.json.tasks['brand-strategist'] as string
    for (const k of ['positioning', 'icp', 'vision (', 'mision (', 'proposito (', 'propuestas_de_valor[]', 'competidores y el resumen del descubrimiento', 'agrega `_meta`']) expect(t, k).toContain(k)
    expect(t).not.toMatch(/customer_angle|retention_notes|productos\[\]|sedes\[\]/)
  })
  it('jefe-client-success conserva sus dos campos gateados y recibe productos y sedes; ya no recibe la estrategia', () => {
    const [o] = correr(codigo(nuevo, FANOUT), ctxFan(CASOS[0]))
    const t = o.json.tasks['jefe-client-success'] as string
    for (const k of ['customer_angle', 'retention_notes', 'productos[]', 'sedes[]', 'agrega `_meta`']) expect(t, k).toContain(k)
    expect(t).not.toMatch(/\bmision \(|\bproposito \(|propuestas_de_valor|\bvision \(/)
  })
  it('la voz no se toca: la tarea del escritor de la voz es IDÉNTICA a la de antes de (c) en los cuatro casos', () => {
    for (const m of CASOS) {
      const [antes] = correr(previoFan, ctxFan(m)); const [ahora] = correr(codigo(nuevo, FANOUT), ctxFan(m))
      expect(ahora.json.tasks['editor-en-jefe']).toBe(antes.json.tasks['editor-en-jefe'])
    }
  })
  it('las tres lentes reciben la MISMA evidencia, y es la misma que recibían antes (la evidencia que cede no cambia)', () => {
    for (const m of CASOS) {
      const [antes] = correr(previoFan, ctxFan(m)); const [ahora] = correr(codigo(nuevo, FANOUT), ctxFan(m))
      const ev = (t: string) => { const d = t.slice(t.indexOf('EVIDENCIA:\n') + 11); return d.slice(0, d.indexOf('\n') < 0 ? undefined : d.indexOf('\n')) }   // el JSON de la evidencia va en una sola línea
      for (const l of LENTES) expect(ev(ahora.json.tasks[l]), l).toBe(ev(ahora.json.tasks['editor-en-jefe']))
      expect(ev(ahora.json.tasks['editor-en-jefe'])).toBe(ev(antes.json.tasks['editor-en-jefe']))
      expect(ahora.json._corte.evidencia_omitida).toEqual(antes.json._corte.evidencia_omitida)
    }
  })
  it('todas las tareas caben (techo de 16.000), ninguna lente se recorta, y el margen declarado no es negativo', () => {
    for (const m of CASOS) {
      const [o] = correr(codigo(nuevo, FANOUT), ctxFan(m))
      expect(o.json._corte.lentes_recortadas).toEqual([])
      for (const l of LENTES) { expect(o.json.tasks[l].length, l).toBeLessThanOrEqual(16000); expect(o.json._corte.margen_por_lente[l]).toBeGreaterThanOrEqual(0) }
    }
  })
  it('la sección de brand-strategist empieza igual que hoy (lo suyo va primero): positioning + icp', () => {
    const [a] = correr(previoFan, ctxFan(CASOS[0])); const [b] = correr(codigo(nuevo, FANOUT), ctxFan(CASOS[0]))
    const cola = (t: string) => t.slice(t.indexOf('TU SECCIÓN'))
    expect(cola(b.json.tasks['brand-strategist']).startsWith(cola(a.json.tasks['brand-strategist']).replace(/\.$/, ''))).toBe(true)
    expect(b.json.tasks['brand-strategist'].startsWith(a.json.tasks['brand-strategist'].slice(0, a.json.tasks['brand-strategist'].indexOf('TU SECCIÓN')))).toBe(true)
  })
})

describe('reparto de secciones · el borrador (código real del Consolidador)', () => {
  const lente = (s: Record<string, unknown>) => ({ body: { brand_section: s } })
  const consolidar = async (flujo: any, st: Record<string, unknown>, cs: Record<string, unknown>, ed: Record<string, unknown> = {}) => {
    const r = await recorrer(flujo, CONS, { cycle: 0 }, {
      previos: {
        'Validate Deal Data': [{ client_id: 'c-1' }],
        'Lente · editor-en-jefe': [lente(ed)], 'Lente · brand-strategist': [lente(st)], 'Lente · jefe-client-success': [lente(cs)],
        'Confirm barato · competitor list': [{ discovery_package: { discovery_summary: 'x' } }],
        '[BB] Fan-out prep': [{ _grounding_refs: {} }],
      },
      hasta: [REVISION.pedido],
    })
    return r.item.brand_book_draft
  }
  const ST = { positioning: 'pos', icp_summary: 'icp', vision: 'ser la mesa de la costa', mision: 'servir ceviche a las familias', proposito: 'que se coma bien sin pagar de más', propuestas_de_valor: ['fresco del día', 'sin intermediarios'], _field_meta: { vision: { fuente: 'sitio', confianza: 0.6 }, mision: { fuente: 'sitio', confianza: 0.8 } } }
  const CS = { customer_angle: 'ángulo', retention_notes: 'retención', productos: ['Ceviche mixto', 'Encebollado'], sedes: ['Olón · frente al mar'], _field_meta: { productos: { fuente: 'carta', confianza: 0.9 } } }

  it('la estrategia sale de brand-strategist y productos y sedes de jefe-client-success, cada campo rotulado con quien lo escribió', async () => {
    const b = await consolidar(nuevo, ST, CS)
    expect(b.vision).toBe(ST.vision); expect(b.mision).toBe(ST.mision); expect(b.proposito).toBe(ST.proposito); expect(b.propuestas_de_valor).toEqual(ST.propuestas_de_valor)
    expect(b.productos).toEqual(CS.productos); expect(b.sedes).toEqual(CS.sedes)
    for (const k of ['vision', 'mision', 'proposito', 'propuestas_de_valor']) expect(b._field_meta[k].lente, k).toBe('brand-strategist')
    for (const k of ['productos', 'sedes']) expect(b._field_meta[k].lente, k).toBe('jefe-client-success')
    expect(b._field_meta.vision).toMatchObject({ estado: 'provisional', provisional: true, gateado: false, fuente: 'sitio', confianza: 0.6 })
    expect(b._field_meta.productos).toMatchObject({ estado: 'provisional', fuente: 'carta', confianza: 0.9 })
  })
  it('lo que no emitió quien corresponde queda AUSENTE (no se toma de la otra lente): misión que manda jefe-client-success se ignora', async () => {
    const b = await consolidar(nuevo, { positioning: 'pos', icp_summary: 'icp' }, { ...CS, mision: 'misión vieja de la lente equivocada', proposito: 'x', propuestas_de_valor: ['y'] })
    expect(b.mision).toBe(''); expect(b.proposito).toBe(''); expect(b.propuestas_de_valor).toEqual([]); expect(b.vision).toBe('')
    for (const k of ['vision', 'mision', 'proposito', 'propuestas_de_valor']) expect(b._field_meta[k].estado, k).toBe('ausente')
    const sin = await consolidar(nuevo, ST, { customer_angle: 'a', retention_notes: 'r' })
    expect(sin.productos).toEqual([]); expect(sin.sedes).toEqual([])
    expect(sin._field_meta.productos.estado).toBe('ausente'); expect(sin._field_meta.sedes.estado).toBe('ausente')
  })
  it('los campos gateados y la voz no se mueven: positioning/icp de brand-strategist, customer_angle/retention de jefe-client-success, y el resto del borrador igual que antes de (c)', async () => {
    const ed = { voice_description: 'voz', forbidden_words: ['barato'], personalidad: ['cálida'], tagline_opciones: ['t'], mensajes_clave: ['m'] }
    const ahora = await consolidar(nuevo, ST, CS, ed)
    const antes = await consolidar({ ...nuevo, nodes: nuevo.nodes.map((n: any) => (n.name === CONS ? { ...n, parameters: { ...n.parameters, jsCode: previoCons } } : n)) }, ST, CS, ed)
    expect(ahora.positioning).toBe('pos'); expect(ahora.customer_angle).toBe('ángulo'); expect(ahora.retention_notes).toBe('retención')
    const quitar = (d: any) => { const c = JSON.parse(JSON.stringify(d)); for (const k of ['vision', 'mision', 'proposito', 'propuestas_de_valor', 'productos', 'sedes']) { delete c[k]; delete c._field_meta[k] } return c }
    expect(quitar(ahora)).toEqual(quitar(antes))
  })
  it('la lista de lo que cambió en el Consolidador es exactamente las seis claves (visión, misión, propósito, propuestas, productos, sedes)', async () => {
    const ahora = await consolidar(nuevo, ST, CS)
    const antes = await consolidar({ ...nuevo, nodes: nuevo.nodes.map((n: any) => (n.name === CONS ? { ...n, parameters: { ...n.parameters, jsCode: previoCons } } : n)) }, ST, CS)
    const nuevas = Object.keys(ahora).filter((k) => !(k in antes)).sort()
    expect(nuevas).toEqual(['productos', 'sedes', 'vision'])
    expect(Object.keys(ahora._field_meta).filter((k) => !(k in antes._field_meta)).sort()).toEqual(['productos', 'sedes', 'vision'])
  })
})
