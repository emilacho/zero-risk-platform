/**
 * EL NODO VISUAL, DENTRO DEL CIMIENTO, ANTES DEL PROMOTE · pruebas a costo cero · CC#1 · 2026-09-26
 * · §144 Emilio · diseño v3 (`zr-vault/docs/DISENO-2026-09-26-el-piso-visual-del-manual-de-marca.md`).
 *
 * Datos: los fixtures son la captura REAL del 26-sep de `raw/evidencia/2026-09-26-NODO-VISUAL/`
 * (config.apify.own_handles, la fila del sitio con su `_visual`, y las 8 filas de instagram_scraper
 * — 5 propias, 3 de competidores — mezcladas bajo el mismo `apify_function`, sin ningún rótulo que
 * las distinga). La respuesta del modelo para la prueba de parseo es la Corrida A real de
 * `raw/tasks/2026-09-26-RESULTADO-CC2-el-estilo-visual-se-deriva-cada-vez.md`.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'ssLtwYPt7zxuvnM2')
const {
  normalizarHandle,
  esInstagramPropio,
  clasificarPosts,
  elegirFotos,
  armarMuestra,
  armarPedido,
  parseRespuesta,
  derivarPisoVisual,
  MAX_FOTOS_A_MIRAR,
} = require(join(DIR, 'piso-visual-logica.js'))

const EVIDENCIA = 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/evidencia/2026-09-26-NODO-VISUAL'
const cargar = (f: string) => JSON.parse(readFileSync(join(EVIDENCIA, f), 'utf8'))

const ownHandle = cargar('fixture-ficha-config.json').apify.own_handles.instagram // "@naufrago.ec"
const filaSitio = cargar('fixture-fila-sitio.json')
const filasInstagram: Array<{ created_at: string; params: unknown; respuesta: unknown[] }> = cargar('fixture-filas-instagram-mezcladas.json')
const filaPropia = filasInstagram.find((f) => esInstagramPropio(f.params, ownHandle).propio)!
const filaCompetidor = filasInstagram.find((f) => !esInstagramPropio(f.params, ownHandle).propio)!

const RESPUESTA_CORRIDA_A_REAL = `## Estilo visual — NAUFRAGO

**1) Paleta**
Domina el naranja-ámbar intenso del caldo/leche de tigre como color ancla. Lo acompañan verdes vivos (lima, cilantro, palta) y amarillos cálidos (chifles). El morado y el teal del logo aparecen reforzados por el mural del local, no son accidentales. Base neutra: madera clara o blanco.

**2) Luz**
Natural, suave, diurna.

**5) Reglas para una foto nueva**
Debe:
1. Tener al menos un elemento de color cálido fuerte.
` // (recortada a propósito: sólo hace falta que NO haya bloque JSON, para probar el camino "no legible")

describe('normalizarHandle · esInstagramPropio · R6 (nunca mirar al competidor)', () => {
  it('normaliza @handle, URL con y sin www, con y sin barra final', () => {
    expect(normalizarHandle('@naufrago.ec')).toBe('naufrago.ec')
    expect(normalizarHandle('https://www.instagram.com/naufrago.ec/')).toBe('naufrago.ec')
    expect(normalizarHandle('https://instagram.com/naufrago.ec')).toBe('naufrago.ec')
    expect(normalizarHandle('naufrago.ec')).toBe('naufrago.ec')
  })

  it('MEDIDO 26-sep · de las 8 filas reales de instagram_scraper de este cliente, identifica exactamente las propias y descarta las de competidores', () => {
    const marcas = filasInstagram.map((f) => ({ propio: esInstagramPropio(f.params, ownHandle).propio, params: f.params }))
    const propias = marcas.filter((m) => m.propio)
    const competidoras = marcas.filter((m) => !m.propio)
    expect(propias.length).toBe(5)
    expect(competidoras.length).toBe(3)
    for (const c of competidoras) {
      const s = JSON.stringify(c.params).toLowerCase()
      expect(s).toMatch(/lacasadelencebollado|encebolladocdl|pezazulecuador/)
    }
  })

  it('cubre las tres formas de params (directUrls, usernames, startUrls) para la propia', () => {
    expect(esInstagramPropio({ directUrls: ['https://www.instagram.com/naufrago.ec'] }, ownHandle).propio).toBe(true)
    expect(esInstagramPropio({ usernames: ['naufrago.ec'] }, ownHandle).propio).toBe(true)
    expect(esInstagramPropio({ startUrls: [{ url: 'https://instagram.com/naufrago.ec' }] }, ownHandle).propio).toBe(true)
    expect(esInstagramPropio({ usernames: ['pezazulecuador'] }, ownHandle).propio).toBe(false)
  })

  it('sin own_handle declarado, o sin params legibles ⇒ NO propio, con motivo (nunca se asume)', () => {
    const r1 = esInstagramPropio({ usernames: ['naufrago.ec'] }, null)
    expect(r1.propio).toBe(false)
    expect(r1.motivo).toMatch(/no declara/)
    const r2 = esInstagramPropio({}, ownHandle)
    expect(r2.propio).toBe(false)
    expect(r2.motivo).toMatch(/directUrls/)
  })
})

describe('clasificarPosts · elegirFotos · MEDIDO 26-sep con la fila propia real (12 posts)', () => {
  const post0 = (filaPropia.respuesta as Array<Record<string, unknown>>)[0]
  const clasif = clasificarPosts(post0.latestPosts)

  it('12 posts totales · 2 sin video (foto) · 10 con video · coincide con lo medido por CC#2 el 26-sep', () => {
    expect(clasif.total).toBe(12)
    expect(clasif.foto.length).toBe(2)
    expect(clasif.video.length).toBe(10)
  })

  it('las dos fotos elegidas son exactamente las que CC#2 verificó a ojo (DPti3m8jQJt · DAvtICqvjC-)', () => {
    const elegidas = elegirFotos(clasif.foto, MAX_FOTOS_A_MIRAR)
    const ids = elegidas.map((p: Record<string, unknown>) => p.shortCode).sort()
    expect(ids).toEqual(['DAvtICqvjC-', 'DPti3m8jQJt'].sort())
    expect(elegidas.length).toBeLessThanOrEqual(MAX_FOTOS_A_MIRAR)
  })
})

describe('armarMuestra · R3/R4 · SIEMPRE por código, nunca por el modelo', () => {
  it('declara los números reales y lo no observado, incluso si el modelo no lo pediría', () => {
    const clasif = { total: 12, foto: new Array(2), video: new Array(10), fecha_mas_vieja: '2026-09-01T00:00:00Z', fecha_mas_nueva: '2026-09-20T00:00:00Z' }
    const m = armarMuestra(clasif, new Array(2), true)
    expect(m.piezas_totales_en_el_feed).toBe(12)
    expect(m.fotos_totales).toBe(2)
    expect(m.videos_totales).toBe(10)
    expect(m.fotos_miradas).toBe(2)
    expect(m.no_observado.some((s: string) => /10 publicaciones de video/.test(s))).toBe(true)
    expect(m.no_observado.some((s: string) => /competidores excluido/.test(s))).toBe(true)
    expect(m.no_observado.some((s: string) => /no se encontró una foto de perfil/.test(s))).toBe(false)
  })
  it('sin logo, lo declara · con fotos sin mirar por el tope, también', () => {
    const clasif = { total: 5, foto: new Array(5), video: [], fecha_mas_vieja: null, fecha_mas_nueva: null }
    const m = armarMuestra(clasif, new Array(2), false)
    expect(m.no_observado.some((s: string) => /no se encontró una foto de perfil/.test(s))).toBe(true)
    expect(m.no_observado.some((s: string) => /3 fotos disponibles no se miraron/.test(s))).toBe(true)
  })
})

describe('armarPedido · las imágenes primero, la capa gráfica como texto, nunca como imagen', () => {
  it('arma el pedido con las fotos elegidas y el logo primero, y una lista exacta de colores/tipografías', () => {
    const fotos = [{ displayUrl: 'https://cdn/x.jpg', timestamp: '2026-09-20T10:00:00Z' }]
    const { task, images } = armarPedido({ colores: ['#1a0828', '#663772'], tipografias: ['Caveat'] }, fotos, 'https://cdn/logo.jpg')
    expect(images[0]).toEqual({ url: 'https://cdn/logo.jpg', label: 'foto de perfil / logo de la marca' })
    expect(images[1].url).toBe('https://cdn/x.jpg')
    expect(task).toContain('#1a0828')
    expect(task).toContain('Caveat')
    expect(task).toContain('capa_grafica')
    expect(task).not.toMatch(/data:image|base64,/) // el texto nunca lleva la imagen adentro
  })
  it('sin logo ni colores/tipografías declaradas, lo dice en el pedido en vez de omitirlo en silencio', () => {
    const { task, images } = armarPedido({ colores: [], tipografias: [] }, [], null)
    expect(images).toEqual([])
    expect(task).toContain('no declara colores')
    expect(task).toContain('No hay foto de perfil disponible')
  })
})

describe('parseRespuesta · nunca inventa si no hay JSON legible', () => {
  it('la respuesta real de CC#2 (Corrida A completa) sí trae capa_producto/reglas si el modelo respeta el formato JSON pedido', () => {
    const conJson = '{"capa_grafica":{"paleta":[],"tipografias":[]},"capa_producto":{"luz":"natural"},"reglas":{"debe":["x"],"no_debe":["y"]}}'
    expect(parseRespuesta(conJson).legible).toBe(true)
  })
  it('una respuesta en prosa (como la Corrida A real, sin el formato JSON que este pedido exige) ⇒ no legible, con motivo', () => {
    const r = parseRespuesta(RESPUESTA_CORRIDA_A_REAL)
    expect(r.legible).toBe(false)
    expect(r.motivo).toMatch(/sin bloque JSON/)
  })
  it('JSON con llaves rotas, o sin las dos claves esenciales, tampoco se acepta', () => {
    expect(parseRespuesta('{"capa_grafica":{}, "capa_producto": {}').legible).toBe(false)
    expect(parseRespuesta('{"capa_grafica":{}}').legible).toBe(false)
    expect(parseRespuesta('').legible).toBe(false)
  })
})

describe('derivarPisoVisual · compone todo, con los tres ROJOS del diseño (§7)', () => {
  const post0Propio = (filaPropia.respuesta as Array<Record<string, unknown>>)[0]
  const siteVisual = filaSitio.respuesta[0]._visual

  it('ROJO · con material real (logo + 2 fotos) y una respuesta legible del modelo, sin client_id ⇒ arma las dos capas + reglas + muestra', async () => {
    const respuestaModelo = JSON.stringify({
      capa_grafica: { paleta: [{ color: siteVisual.colores[0], rol: 'principal' }], tipografias: [{ nombre: siteVisual.tipografias[0], rol: 'titulos' }] },
      capa_producto: { luz: 'natural, suave' },
      reglas: { debe: ['a', 'b', 'c'], no_debe: ['d', 'e'] },
    })
    const invocar = async () => ({ response: respuestaModelo, brain_hit: false })
    const v = await derivarPisoVisual({ ownInstagramHandle: ownHandle, filaSitio, filaInstagram: filaPropia }, invocar)
    expect(v.legible).toBe(true)
    expect(v.brain_hit).toBe(false)
    expect(v.error).toBeNull()
    expect(v.capa_grafica.logo_url).toBe(post0Propio.profilePicUrlHD)
    expect(v.capa_grafica.paleta).toEqual([{ color: siteVisual.colores[0], rol: 'principal' }])
    expect(v.muestra.fotos_totales).toBe(2)
    expect(v.capa_producto).toEqual({ luz: 'natural, suave' })
    expect(v.reglas.debe).toHaveLength(3)
  })

  it('ROJO R5 · si el recibo delata brain_hit:true, la corrida SE DESCARTA (no se guardan capa_producto ni reglas)', async () => {
    const invocar = async () => ({ response: '{"capa_producto":{},"reglas":{}}', brain_hit: true })
    const v = await derivarPisoVisual({ ownInstagramHandle: ownHandle, filaSitio, filaInstagram: filaPropia }, invocar)
    expect(v.brain_hit).toBe(true)
    expect(v.legible).toBe(false)
    expect(v.capa_producto).toBeNull()
    expect(v.reglas).toBeNull()
    expect(v.error).toMatch(/CEREBRO_ENCENDIDO/)
  })

  it('ROJO R6 · si la única fila de Instagram encontrada es de un COMPETIDOR, no se mira: capa_producto queda vacía y declarada, nunca la del competidor', async () => {
    let llamado = false
    const invocar = async () => { llamado = true; return { response: '{}', brain_hit: false } }
    const v = await derivarPisoVisual({ ownInstagramHandle: ownHandle, filaSitio, filaInstagram: filaCompetidor }, invocar)
    expect(v.error).toMatch(/INSTAGRAM_NO_ES_PROPIO/)
    // sin logo propio y sin fotos propias (la fila del competidor se descarta entera) ⇒ no se llama al modelo
    expect(llamado).toBe(false)
    expect(v.capa_producto).toBeNull()
    expect(v.reglas).toBeNull()
    expect(v.nota).toMatch(/R7/)
  })

  it('ROJO · cliente sin fotos propias ni logo (negocio nuevo) ⇒ capa del producto vacía y declarada, NO inventada · cero llamadas al modelo', async () => {
    let llamado = false
    const invocar = async () => { llamado = true; return { response: '{}', brain_hit: false } }
    const v = await derivarPisoVisual({ ownInstagramHandle: ownHandle, filaSitio: null, filaInstagram: null }, invocar)
    expect(llamado).toBe(false)
    expect(v.capa_producto).toBeNull()
    expect(v.reglas).toBeNull()
    expect(v.muestra.fotos_totales).toBe(0)
    expect(v.nota).toMatch(/sin material visual propio/)
  })

  it('una respuesta no legible (sin JSON) ⇒ capa_producto y reglas quedan ausentes, la muestra SÍ queda (es de código)', async () => {
    const invocar = async () => ({ response: RESPUESTA_CORRIDA_A_REAL, brain_hit: false })
    const v = await derivarPisoVisual({ ownInstagramHandle: ownHandle, filaSitio, filaInstagram: filaPropia }, invocar)
    expect(v.legible).toBe(false)
    expect(v.capa_producto).toBeNull()
    expect(v.reglas).toBeNull()
    expect(v.muestra.fotos_totales).toBe(2) // la muestra no depende de que el modelo haya contestado bien
  })

  it('el modelo no puede colar un color/tipografía que el sitio no declaró (no inventar la capa gráfica)', async () => {
    const invocar = async () => ({
      response: JSON.stringify({ capa_grafica: { paleta: [{ color: '#ff00ff', rol: 'principal' }], tipografias: [{ nombre: 'Comic Sans', rol: 'titulos' }] }, capa_producto: {}, reglas: {} }),
      brain_hit: false,
    })
    const v = await derivarPisoVisual({ ownInstagramHandle: ownHandle, filaSitio, filaInstagram: filaPropia }, invocar)
    expect(v.capa_grafica.paleta).toEqual([])
    expect(v.capa_grafica.tipografias).toEqual([])
  })
})
