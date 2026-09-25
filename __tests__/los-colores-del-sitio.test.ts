/**
 * CABLE ② · COLORES Y TIPOGRAFÍA DEL SITIO · pruebas a costo cero · CC#1 · 2026-09-25 · §144 Emilio.
 *
 * ROJO 2 del encargo (estático): un sitio CON colores declarados ⇒ aparecen; un sitio SIN colores ⇒ vacío,
 * NUNCA un color inventado. Y el espejo: el nodo del Servicio embebe el extractor letra por letra, el
 * constructor inserta el nodo una sola vez y no toca el cuerpo que se le manda al raspador.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { completarVisualesDesdeLaFicha } from '@/lib/manual-visuales-desde-la-ficha'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
const { extraer, hojasDeEstilo } = require(join(DIR, 'extraer-colores-y-tipografia.js'))

const CON_COLORES = `<!doctype html><html><head>
<link rel="stylesheet" href="/estilos.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display&display=swap">
<link rel="stylesheet" href="https://cdn.ajena.com/x.css">
<style>:root{--primario:#0A6B8A;--acento:#f4b400;--texto:#000000;--fondo:#FFF} h1{font-family:'Playfair Display',serif;color:#0a6b8a} p{font-family:Inter, "Helvetica Neue", Arial, sans-serif}</style>
</head><body style="background:rgb(10,107,138);color:#fff"><h1>Hola</h1><p style="color:#f4b400">texto</p></body></html>`
const SIN_COLORES = `<!doctype html><html><head><title>Página sin estilos</title></head><body><h1>Hola</h1><p>Texto plano sin color ni fuente declarada.</p></body></html>`

describe('extraer · sólo lo declarado · vacío no se rellena', () => {
  it('ROJO 2 · sitio CON colores y fuentes declarados ⇒ aparecen, ordenados por frecuencia, sin blanco ni negro', () => {
    const r = extraer(CON_COLORES, ['.btn{background:#0a6b8a;font-family:"Playfair Display"} .x{color:#123456}'])
    expect(r.colores[0]).toBe('#0a6b8a') // 4 menciones (hex ×3 + rgb) · el rgb se normaliza al mismo hex
    expect(r.colores).toContain('#f4b400')
    expect(r.colores).toContain('#123456')
    expect(r.colores).not.toContain('#000000')
    expect(r.colores).not.toContain('#ffffff')
    expect(r.tipografias.slice(0, 2).sort()).toEqual(['Inter', 'Playfair Display'])
    expect(r.tipografias).not.toContain('sans-serif')
    expect(r.tipografias).not.toContain('Arial')
    expect(r.detalle.textos_leidos).toBe(2)
  })
  it('ROJO 2 · sitio SIN colores ni fuentes ⇒ [] y [] · nada inventado · y se declara la regla', () => {
    const r = extraer(SIN_COLORES, [])
    expect(r.colores).toEqual([])
    expect(r.tipografias).toEqual([])
    expect(r.detalle.menciones_de_color).toBe(0)
    expect(r.detalle.regla).toMatch(/vacío = no se encontró/)
  })
  it('tope: 6 colores y 4 tipografías · hex de 3 dígitos se expande', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => `.c${i}{color:#${(i + 1).toString(16).padStart(6, '1')}}`).join('')
    const r = extraer(`<style>${muchos} .f{font-family:A} .g{font-family:B} .h{font-family:C} .i{font-family:D} .j{font-family:E}</style>`, [])
    expect(r.colores).toHaveLength(6)
    expect(r.tipografias).toHaveLength(4)
    expect(extraer('<p style="color:#abc">x</p>', []).colores).toEqual(['#aabbcc'])
  })
  it('hojasDeEstilo · sólo el mismo origen y Google Fonts · resueltas contra la página', () => {
    const h = hojasDeEstilo(CON_COLORES, 'https://ejemplo.ec/')
    expect(h).toEqual(['https://ejemplo.ec/estilos.css', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display&display=swap'])
    expect(hojasDeEstilo(CON_COLORES, 'no-es-url')).toEqual([])
  })
})

describe('el constructor del Servicio · una sola vez · sin tocar el cuerpo del raspador', () => {
  const flujoBase = () => ({
    name: 'Servicio de prueba',
    settings: { executionOrder: 'v1', timezone: 'x' },
    nodes: [
      { name: 'Armar el cuerpo del raspador', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], parameters: { jsCode: 'const CONSTRUCTORES = {}' } },
      { name: 'apify-web', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, position: [0, 0], parameters: { jsonBody: '={{ JSON.stringify($json.cuerpo) }}' } },
      { name: 'Rearmar con el id de la página', type: 'n8n-nodes-base.code', typeVersion: 2, position: [60, 900], parameters: { jsCode: 'return []' } },
      { name: 'Merge · apify data ready', type: 'n8n-nodes-base.merge', typeVersion: 3, position: [300, 0], parameters: { mode: 'append' } },
      { name: 'transform-sections', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], parameters: { jsCode: 'return [{ json: {\n    source_id: x,\n    apify_data_count: data.length,\n    apify_run_id: null,\n  } }]' } },
      { name: 'final-response-ok', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], parameters: { jsCode: 'return [{ json: {\n    guardado_en: x,\n    materia_prima: ctx.materia_prima === true,\n    cost: 0,\n  } }]' } },
    ],
    connections: {
      'apify-web': { main: [[{ node: 'Rearmar con el id de la página', type: 'main', index: 0 }]] },
      'Rearmar con el id de la página': { main: [[{ node: 'Merge · apify data ready', type: 'main', index: 1 }]] },
      'Merge · apify data ready': { main: [[{ node: 'transform-sections', type: 'main', index: 0 }]] },
    },
  })

  it('inserta el nodo entre Rearmar y Merge (entrada 1) · transform y final devuelven visual · nada más cambia', async () => {
    const { construir, NODO, codigoDelNodo } = await import('../scripts/worker-staging/3lyknrP3PoS2KzUf/construir-cable-colores.mjs')
    const antes = flujoBase()
    const despues = construir(antes)
    expect(despues.nodes).toHaveLength(antes.nodes.length + 1)
    const nodo = despues.nodes.find((n: { name: string }) => n.name === NODO)
    expect(nodo.type).toBe('n8n-nodes-base.code')
    expect(nodo.onError).toBe('continueRegularOutput')
    expect(despues.connections['Rearmar con el id de la página']).toEqual({ main: [[{ node: NODO, type: 'main', index: 0 }]] })
    expect(despues.connections[NODO]).toEqual({ main: [[{ node: 'Merge · apify data ready', type: 'main', index: 1 }]] })
    expect(despues.connections['apify-web']).toEqual(antes.connections['apify-web'])
    const tr = despues.nodes.find((n: { name: string }) => n.name === 'transform-sections').parameters.jsCode
    expect(tr).toContain("visual: (items[0] && items[0]._visual) || null,")
    const fi = despues.nodes.find((n: { name: string }) => n.name === 'final-response-ok').parameters.jsCode
    expect(fi).toContain('visual: ctx.visual || null,')
    // el cuerpo que se le manda al raspador NO se toca (saveHtml sigue apagado)
    expect(despues.nodes.find((n: { name: string }) => n.name === 'Armar el cuerpo del raspador').parameters.jsCode).toBe('const CONSTRUCTORES = {}')
    expect(despues.nodes.find((n: { name: string }) => n.name === 'apify-web').parameters).toEqual(antes.nodes[1].parameters)
    expect(despues.settings).toEqual({ executionOrder: 'v1', timezone: 'x' })
    // espejo: el nodo embebe el extractor letra por letra (sin el module.exports de Node) + el cuerpo del nodo
    const extractor = readFileSync(join(DIR, 'extraer-colores-y-tipografia.js'), 'utf8')
    const cuerpo = readFileSync(join(DIR, 'nodo-colores-y-tipografia.js'), 'utf8')
    expect(nodo.parameters.jsCode).toBe(codigoDelNodo())
    expect(nodo.parameters.jsCode).toContain(extractor.split('\nif (typeof module')[0])
    expect(nodo.parameters.jsCode).toContain(cuerpo)
    expect(nodo.parameters.jsCode).not.toContain('module.exports')
    // sólo actúa para el sitio propio y escribe la ficha sólo si estaba vacía
    expect(nodo.parameters.jsCode).toContain("fn === 'website_content_scraper'")
    expect(nodo.parameters.jsCode).toContain('vacio(f.brand_colors)')
  })

  it('no construye dos veces', async () => {
    const { construir } = await import('../scripts/worker-staging/3lyknrP3PoS2KzUf/construir-cable-colores.mjs')
    const una = construir(flujoBase())
    expect(() => construir(una)).toThrow(/ya existe/)
  })
})

describe('el manual toma colores y tipografías de la ficha sólo si no los trae', () => {
  it('sin nada en la ficha ⇒ la fila queda igual (sin las claves · valor por defecto de la base)', () => {
    const { row, origen } = completarVisualesDesdeLaFicha({ client_id: 'x', version: 3 }, { voice_description: 'v' }, { brand_colors: null, brand_fonts: [] })
    expect(row).toEqual({ client_id: 'x', version: 3 })
    expect(origen).toEqual({ primary_colors: null, typography: null })
  })
  it('con la ficha llena y el manual vacío ⇒ copia de la ficha · con el manual lleno ⇒ manda el manual', () => {
    const a = completarVisualesDesdeLaFicha({}, {}, { brand_colors: ['#0a6b8a'], brand_fonts: ['Inter'] })
    expect(a.row).toEqual({ primary_colors: ['#0a6b8a'], typography: ['Inter'] })
    expect(a.origen).toEqual({ primary_colors: 'ficha', typography: 'ficha' })
    const b = completarVisualesDesdeLaFicha({}, { primary_colors: ['#123456'], typography: [] }, { brand_colors: ['#0a6b8a'], brand_fonts: ['Inter'] })
    expect(b.row).toEqual({ primary_colors: ['#123456'], typography: ['Inter'] })
    expect(b.origen).toEqual({ primary_colors: 'manual', typography: 'ficha' })
    expect(completarVisualesDesdeLaFicha({}, {}, null).row).toEqual({})
  })
})
