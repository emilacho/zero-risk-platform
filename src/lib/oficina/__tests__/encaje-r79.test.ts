/**
 * r79 · D6 · el acabado encaja la imagen a la proporción del formato por código: sin deformar, sin cortar contenido. PNG sintéticos, US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { codificarPng, decodificarPng, encajarAProporcion, encajarPixeles, type Rgba } from '../encaje'
import { leerMedidas, chequeosDeEntrega, manifiesto, type FilaDeFormato } from '../entrega'

function imagen(w: number, h: number, fondo: [number, number, number], bloques: Array<{ x: number; y: number; w: number; h: number; c: [number, number, number] }> = []): Rgba {
  const d = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) { d[i * 4] = fondo[0]; d[i * 4 + 1] = fondo[1]; d[i * 4 + 2] = fondo[2]; d[i * 4 + 3] = 255 }
  for (const b of bloques) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const i = (y * w + x) * 4; d[i] = b.c[0]; d[i + 1] = b.c[1]; d[i + 2] = b.c[2] }
  return { ancho: w, alto: h, datos: d }
}
const px = (r: Rgba, x: number, y: number) => Array.from(r.datos.subarray((y * r.ancho + x) * 4, (y * r.ancho + x) * 4 + 3))
/** una trama de rayas de alto contraste (energía de bordes alta en toda la imagen) */
function rayas(w: number, h: number): Rgba {
  const d = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = ((x >> 2) + (y >> 2)) % 2 ? 230 : 25; const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 }
  return { ancho: w, alto: h, datos: d }
}

describe('PNG propio · ida y vuelta', () => {
  it('codifica y decodifica sin perder un píxel; las medidas se leen del encabezado', () => {
    const a = imagen(37, 23, [10, 200, 90], [{ x: 3, y: 4, w: 9, h: 7, c: [250, 0, 0] }])
    const b = codificarPng(a)
    expect(leerMedidas(b)).toEqual({ ancho: 37, alto: 23, tipo: 'png' })
    const c = decodificarPng(b)!
    expect(c.ancho).toBe(37); expect(Array.from(c.datos)).toEqual(Array.from(a.datos))
  })
  it('lo que no es PNG de 8 bits se declara no soportado y los bytes quedan intactos', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
    const r = encajarAProporcion(jpg, { ancho: 1080, alto: 1350 })
    expect(r.modo).toBe('no_soportada'); expect(r.bytes).toBe(jpg)
  })
})

describe('1024×1024 → 1080×1350 (4:5)', () => {
  it('márgenes laterales vacíos y el contenido al centro: RECORTA, sale exacto y el contenido no se deforma', () => {
    const img = imagen(1024, 1024, [255, 255, 255], [{ x: 300, y: 400, w: 400, h: 200, c: [0, 0, 0] }]) // bloque 2:1
    const r = encajarPixeles(img, 1080, 1350)
    expect(r.modo).toBe('recortada'); expect(r.img.ancho).toBe(1080); expect(r.img.alto).toBe(1350)
    // el bloque conserva su proporción 2:1 (medida en el resultado)
    let x0 = 9999, x1 = -1, y0 = 9999, y1 = -1
    for (let y = 0; y < 1350; y++) for (let x = 0; x < 1080; x++) if (px(r.img, x, y)[0] < 100) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const ancho = x1 - x0 + 1, alto = y1 - y0 + 1
    expect(ancho / alto).toBeGreaterThan(1.95); expect(ancho / alto).toBeLessThan(2.05)
  })
  it('contenido en los bordes laterales (texto pegado al borde): NO recorta, ENCAJA entera con franjas arriba y abajo', () => {
    const img = imagen(1024, 1024, [20, 40, 160], [{ x: 0, y: 480, w: 1024, h: 60, c: [255, 255, 255] }, { x: 0, y: 300, w: 80, h: 400, c: [255, 220, 0] }, { x: 944, y: 300, w: 80, h: 400, c: [255, 0, 0] }])
    const r = encajarPixeles(img, 1080, 1350)
    expect(r.modo).toBe('encajada'); expect(r.img.ancho).toBe(1080); expect(r.img.alto).toBe(1350)
    // la imagen entera cabe a lo ancho (1080) en 1080×1080 centrada: franja de (1350-1080)/2 = 135 arriba y abajo con el color del borde
    expect(px(r.img, 540, 10)).toEqual([20, 40, 160]); expect(px(r.img, 540, 1340)).toEqual([20, 40, 160])
    // los dos bloques de los bordes siguen enteros dentro del lienzo (x=0 amarillo, x=1079 rojo)
    expect(px(r.img, 2, 675)).toEqual([255, 220, 0]); expect(px(r.img, 1077, 675)).toEqual([255, 0, 0])
  })
  it('una foto con detalle en todo el cuadro (rayas): tampoco corta, encaja', () => {
    expect(encajarPixeles(rayas(256, 256), 216, 270).modo).toBe('encajada')
  })
  it('vertical a cuadrado (la imagen es más alta que el formato): recorta franjas vacías o encaja con franjas a los lados', () => {
    const vacia = imagen(800, 1000, [240, 240, 240], [{ x: 100, y: 400, w: 600, h: 200, c: [0, 0, 0] }])
    expect(encajarPixeles(vacia, 1080, 1080).modo).toBe('recortada')
    const llena = rayas(400, 500)
    const r = encajarPixeles(llena, 1080, 1080)
    expect(r.modo).toBe('encajada'); expect(r.img.ancho).toBe(1080); expect(r.img.alto).toBe(1080)
  })
  it('ya tiene la proporción: solo se reescala al tamaño exacto, sin franjas', () => {
    const r = encajarPixeles(imagen(864, 1080, [1, 2, 3]), 1080, 1350)
    expect(r.modo).toBe('ya_correcta'); expect(r.img.ancho).toBe(1080); expect(r.img.alto).toBe(1350)
    expect(px(r.img, 0, 0)).toEqual([1, 2, 3])
  })
})

describe('r81 · la imagen generada simulada del seco es un PNG de verdad', () => {
  it('descargar(dry) devuelve un 1024×1024 que se decodifica y se encaja a 1080×1350 (así el seco ejerce D6); las láminas simuladas siguen siendo solo encabezado', async () => {
    const { crearPuertos, PREFIJO_DRY } = await import('../adaptadores')
    const { DbFalsa } = await import('./dbfalsa')
    const P = crearPuertos(new DbFalsa(), { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('', { status: 404 })) as typeof fetch)
    const gen = (await P.descargar(`${PREFIJO_DRY}dry-abc123.png`))!
    expect(leerMedidas(gen)).toMatchObject({ ancho: 1024, alto: 1024, tipo: 'png' })
    expect(decodificarPng(gen)).not.toBeNull()
    const r = encajarAProporcion(gen, { ancho: 1080, alto: 1350 })
    expect(['recortada', 'encajada']).toContain(r.modo); expect(leerMedidas(r.bytes)).toMatchObject({ ancho: 1080, alto: 1350 })
    const lamina = (await P.descargar(`${PREFIJO_DRY}lamina-1-1080x1350.png`))!
    expect(leerMedidas(lamina)).toMatchObject({ ancho: 1080, alto: 1350 }); expect(decodificarPng(lamina)).toBeNull()
  })
})

describe('el chequeo de entrega ya no bloquea por la proporción', () => {
  const fila4x5: FilaDeFormato = { red: 'instagram', formato: 'foto_4x5', ancho: 1080, alto: 1350, tipos_archivo: ['png', 'jpg'], peso_max_mb: 30, n_min: 1, n_max: 1, texto_max: 2200, hashtags_max: 30, verificado: true }
  it('antes: 1024×1024 contra 4:5 → bloquea · después de encajar: sin ficha de proporción', () => {
    const original = codificarPng(imagen(1024, 1024, [255, 255, 255], [{ x: 300, y: 400, w: 400, h: 200, c: [0, 0, 0] }]))
    const medir = (b: Buffer) => chequeosDeEntrega([{ nombre: 'a.png', bytes: b }], fila4x5, { pie_de_foto: 'x', hashtags: [] }, manifiesto([{ nombre: 'a.png', bytes: b }], {})).filter((f) => f.gravedad === 'bloquea')
    expect(medir(original).some((f) => /proporción/.test(f.que ?? ''))).toBe(true)
    const arreglada = encajarAProporcion(original, { ancho: 1080, alto: 1350 })
    expect(['recortada', 'encajada']).toContain(arreglada.modo)
    expect(leerMedidas(arreglada.bytes)).toMatchObject({ ancho: 1080, alto: 1350 })
    expect(medir(arreglada.bytes).filter((f) => /proporción/.test(f.que ?? ''))).toHaveLength(0)
  })
})
