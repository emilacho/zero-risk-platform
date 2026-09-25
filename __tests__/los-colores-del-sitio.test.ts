/**
 * CABLE ② · COLORES Y TIPOGRAFÍA DEL SITIO · pruebas a costo cero · CC#1 · 2026-09-25 · §144 Emilio.
 * v2 (hallazgo de CC#3): las tipografías viven en las hojas de estilo, no en el HTML. El sandbox del nodo
 * Code de n8n no tiene `URL`, así que la v1 leyó 0 hojas y calló. Ahora las direcciones se resuelven a mano,
 * lo que no se puede leer se declara, las «… Fallback» de next/font se excluyen y caben 8 tipografías.
 *
 * ROJO del encargo (estático): un sitio CON colores/fuentes declarados ⇒ aparecen; SIN ⇒ vacío, NUNCA inventado.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { completarVisualesDesdeLaFicha } from '@/lib/manual-visuales-desde-la-ficha'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
const { extraer, hojasDeEstilo, resolverDireccion, VERSION_EXTRACTOR } = require(join(DIR, 'extraer-colores-y-tipografia.js'))

const CON_COLORES = `<!doctype html><html><head>
<link rel="stylesheet" href="/estilos.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display&display=swap">
<link rel="stylesheet" href="https://cdn.ajena.com/x.css"><link rel="preload" as="style" href="/no-es-stylesheet.css">
<style>:root{--primario:#0A6B8A;--acento:#f4b400;--texto:#000000;--fondo:#FFF} h1{font-family:'Playfair Display',serif;color:#0a6b8a} p{font-family:Inter, "Helvetica Neue", Arial, sans-serif}</style>
</head><body style="background:rgb(10,107,138);color:#fff"><h1>Hola</h1><p style="color:#f4b400">texto</p></body></html>`
const SIN_COLORES = `<!doctype html><html><head><title>Página sin estilos</title></head><body><h1>Hola</h1><p>Texto plano sin color ni fuente declarada.</p></body></html>`
// Forma real de las hojas de un sitio Next.js (medido el 25-sep · 2 hojas · 31 @font-face · 7 familias reales + sus «Fallback»)
const HTML_NEXT = `<!doctype html><html><head><link rel="stylesheet" href="/_next/static/css/f58f.css?dpl=abc" data-precedence="next"/><link rel="stylesheet" href="/_next/static/css/da5e.css?dpl=abc" data-precedence="next"/></head><body style="color:#1a0828"><p style="color:rgba(102,55,114,0.9)">x</p></body></html>`
const CSS_NEXT = `@font-face{font-family:'Alfa Slab One';src:url(/a.woff2)}@font-face{font-family:'Alfa Slab One Fallback';src:local("Arial")}@font-face{font-family:'Bebas Neue';src:url(/b.woff2)}@font-face{font-family:'Bebas Neue Fallback'}@font-face{font-family:Caveat}@font-face{font-family:'Caveat Fallback'}
:root{--font-sans:'Inter','Inter Fallback';--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;--default-font-family:var(--font-sans)}
body{font-family:var(--default-font-family),ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}
h1{font-family:'Alfa Slab One','Alfa Slab One Fallback',serif} .marker{font-family:'Permanent Marker','Permanent Marker Fallback',cursive} .hand{font-family:'Homemade Apple','Homemade Apple Fallback',cursive} .disp{font-family:'DM Serif Display','DM Serif Display Fallback',serif} .num{font-family:'Bebas Neue','Bebas Neue Fallback'} .quote{font-family:Caveat,'Caveat Fallback',cursive} .i{font-family:Inter,'Inter Fallback'}`

describe('extraer · sólo lo declarado · vacío no se rellena', () => {
  it('ROJO · sitio CON colores y fuentes declarados ⇒ aparecen, ordenados por frecuencia, sin blanco ni negro', () => {
    const r = extraer(CON_COLORES, ['.btn{background:#0a6b8a;font-family:"Playfair Display"} .x{color:#123456}'])
    expect(r.colores[0]).toBe('#0a6b8a')
    expect(r.colores).toContain('#f4b400')
    expect(r.colores).toContain('#123456')
    expect(r.colores).not.toContain('#000000')
    expect(r.colores).not.toContain('#ffffff')
    expect(r.tipografias.slice(0, 2).sort()).toEqual(['Inter', 'Playfair Display'])
    expect(r.tipografias).not.toContain('sans-serif')
    expect(r.tipografias).not.toContain('Arial')
    expect(r.detalle.textos_leidos).toBe(2)
    expect(r.detalle.version_extractor).toBe(VERSION_EXTRACTOR)
    expect(VERSION_EXTRACTOR).toBe(2)
  })
  it('ROJO · sitio SIN colores ni fuentes ⇒ [] y [] · nada inventado · y se declara la regla', () => {
    const r = extraer(SIN_COLORES, [])
    expect(r.colores).toEqual([])
    expect(r.tipografias).toEqual([])
    expect(r.detalle.menciones_de_color).toBe(0)
    expect(r.detalle.font_face).toBe(0)
    expect(r.detalle.regla).toMatch(/vacío = no se encontró/)
  })
  it('v2 · las tipografías de un sitio Next.js salen de las hojas: 7 familias reales, sin «Fallback», sin genéricas ni sistema', () => {
    const solo = extraer(HTML_NEXT, [])
    expect(solo.tipografias).toEqual([]) // el HTML no declara ninguna: por esto la v1 concluyó «sin tipografías»
    const r = extraer(HTML_NEXT, [CSS_NEXT])
    expect([...r.tipografias].sort()).toEqual(['Alfa Slab One', 'Bebas Neue', 'Caveat', 'DM Serif Display', 'Homemade Apple', 'Inter', 'Permanent Marker'])
    expect(r.tipografias.some((t: string) => / Fallback$/i.test(t))).toBe(false)
    expect(r.tipografias).not.toContain('Menlo')
    expect(r.tipografias).not.toContain('SFMono-Regular')
    expect(r.detalle.font_face).toBe(6)
    expect(r.detalle.tipografias_distintas).toBe(7)
    expect(r.detalle.material_leido_chars).toBe(HTML_NEXT.length + CSS_NEXT.length)
    expect([...r.colores].sort()).toEqual(['#1a0828', '#663772']) // rgba → hex · el rgba cuenta como color
  })
  it('topes: 6 colores y 8 tipografías · hex de 3 dígitos se expande', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => `.c${i}{color:#${(i + 1).toString(16).padStart(6, '1')}}`).join('')
    const fam = ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff', 'Gg', 'Hh', 'Ii', 'Jj'].map((f) => `.${f}{font-family:${f}}`).join('')
    const r = extraer(`<style>${muchos}${fam}</style>`, [])
    expect(r.colores).toHaveLength(6)
    expect(r.tipografias).toHaveLength(8)
    expect(extraer('<p style="color:#abc">x</p>', []).colores).toEqual(['#aabbcc'])
  })
})

describe('hojasDeEstilo · sin `URL` (el sandbox de n8n no la tiene) · sólo el propio dominio y Google Fonts · con motivo', () => {
  it('resuelve absolutas, //host, /raíz y relativas a mano · rechaza otros esquemas y bases ilegibles', () => {
    expect(resolverDireccion('/_next/a.css?x=1', 'https://www.ejemplo.ec')).toBe('https://www.ejemplo.ec/_next/a.css?x=1')
    expect(resolverDireccion('b.css', 'https://h.ec/dir/p.html')).toBe('https://h.ec/dir/b.css')
    expect(resolverDireccion('//cdn.x/c.css', 'https://h.ec/')).toBe('https://cdn.x/c.css')
    expect(resolverDireccion('https://h.ec/d.css', 'https://h.ec/')).toBe('https://h.ec/d.css')
    expect(resolverDireccion('mailto:x', 'https://h.ec/')).toBeNull()
    expect(resolverDireccion('/a', 'no-url')).toBeNull()
  })
  it('encuentra las dos hojas de un sitio Next.js (URL sin barra final · href relativo a la raíz con query)', () => {
    const h = hojasDeEstilo(HTML_NEXT, 'https://www.ejemplo.ec')
    expect(h.hojas).toEqual(['https://www.ejemplo.ec/_next/static/css/f58f.css?dpl=abc', 'https://www.ejemplo.ec/_next/static/css/da5e.css?dpl=abc'])
    expect(h.enlaces_vistos).toBe(2)
    expect(h.motivo).toBeNull()
  })
  it('mismo origen y Google Fonts entran · otro origen y preload se descartan con motivo · base ilegible se declara', () => {
    const h = hojasDeEstilo(CON_COLORES, 'https://ejemplo.ec/')
    expect(h.hojas).toEqual(['https://ejemplo.ec/estilos.css', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display&display=swap'])
    expect(h.descartadas).toEqual(['otro origen: cdn.ajena.com'])
    expect(h.enlaces_vistos).toBe(3)
    const mal = hojasDeEstilo(CON_COLORES, 'no-es-url')
    expect(mal.hojas).toEqual([])
    expect(mal.motivo).toMatch(/no se pudo leer/)
  })
  it('el espejo no depende de `URL` ni de `require`', () => {
    const src = readFileSync(join(DIR, 'extraer-colores-y-tipografia.js'), 'utf8').split('\nif (typeof module')[0]
    expect(src).not.toMatch(/new URL\(/)
    expect(src).not.toMatch(/\brequire\(/)
    expect(readFileSync(join(DIR, 'nodo-colores-y-tipografia.js'), 'utf8')).not.toMatch(/new URL\(/)
  })
})

describe('el constructor del Servicio · una sola vez · sin tocar el cuerpo del raspador · y la actualización a v2', () => {
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
    expect(despues.nodes.find((n: { name: string }) => n.name === 'transform-sections').parameters.jsCode).toContain("visual: (items[0] && items[0]._visual) || null,")
    expect(despues.nodes.find((n: { name: string }) => n.name === 'final-response-ok').parameters.jsCode).toContain('visual: ctx.visual || null,')
    expect(despues.nodes.find((n: { name: string }) => n.name === 'Armar el cuerpo del raspador').parameters.jsCode).toBe('const CONSTRUCTORES = {}')
    expect(despues.nodes.find((n: { name: string }) => n.name === 'apify-web').parameters).toEqual(antes.nodes[1].parameters)
    expect(despues.settings).toEqual({ executionOrder: 'v1', timezone: 'x' })
    const extractor = readFileSync(join(DIR, 'extraer-colores-y-tipografia.js'), 'utf8')
    const cuerpo = readFileSync(join(DIR, 'nodo-colores-y-tipografia.js'), 'utf8')
    expect(nodo.parameters.jsCode).toBe(codigoDelNodo())
    expect(nodo.parameters.jsCode).toContain(extractor.split('\nif (typeof module')[0])
    expect(nodo.parameters.jsCode).toContain(cuerpo)
    expect(nodo.parameters.jsCode).not.toContain('module.exports')
    expect(nodo.parameters.jsCode).toContain("fn === 'website_content_scraper'")
    expect(nodo.parameters.jsCode).toContain('vacio(f.brand_colors)')
  })

  it('no construye dos veces · y actualizar() reemplaza sólo el código del nodo v1 por el v2, una sola vez', async () => {
    const { construir, actualizar, NODO, codigoDelNodo, versionEmbebida } = await import('../scripts/worker-staging/3lyknrP3PoS2KzUf/construir-cable-colores.mjs')
    const v2 = construir(flujoBase())
    expect(() => construir(v2)).toThrow(/ya existe/)
    // simular el flujo publicado con la v1 (sin marca de versión · como quedó 443cf05d)
    const v1 = JSON.parse(JSON.stringify(v2))
    v1.nodes.find((n: { name: string }) => n.name === NODO).parameters.jsCode = '// CABLE ② · v1 sin marca\nvar x = new URL("https://h.ec")\nreturn items'
    expect(versionEmbebida(v1.nodes.find((n: { name: string }) => n.name === NODO).parameters.jsCode)).toBe(1)
    const act = actualizar(v1)
    const nodo = act.nodes.find((n: { name: string }) => n.name === NODO)
    expect(nodo.parameters.jsCode).toBe(codigoDelNodo())
    expect(versionEmbebida(nodo.parameters.jsCode)).toBe(2)
    expect(act.connections).toEqual(v1.connections)
    expect(act.nodes.filter((n: { name: string }) => n.name !== NODO)).toEqual(v1.nodes.filter((n: { name: string }) => n.name !== NODO))
    expect(() => actualizar(act)).toThrow(/no actualizar dos veces/)
    expect(() => actualizar(flujoBase())).toThrow(/no existe/)
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
