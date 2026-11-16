/**
 * COMPOSICIÓN CON LA MARCA (Sprint 1 · Mejora 5 · CC3 · 16-nov) · US$ 0, sin red (el dibujo real usa Inter del CDN y se salta si no responde).
 *  · el diseño sale del manual y de la semilla de la pieza: estable, y varía entre piezas (4 disposiciones × 2 juegos de color);
 *  · el texto sobre la imagen es el del autor; el botón cae al llamado o a la web, nunca a una palabra inventada; lo que falta se avisa;
 *  · la entrega compone la foto (sin rejas: sin marca, sin puerto o con un fallo, la foto sale como siempre y queda dicho);
 *  · el texto sobre la imagen pasa por los mismos chequeos que el pie y lo ve quien revisa.
 */
import { describe, expect, it, type TestContext } from 'vitest'
import crypto from 'node:crypto'
import { CONTRASTE_MINIMO_CON_LA_FRANJA, comoDataUri, contraste, disenoDeAnuncio, dominioDe, numeroDe, textoEnImagenDe, textoEnImagenParaChequear, textoSobre, VARIANTES } from '../composicion'
import { arbolDeAnuncio, renderAnuncio, tamanoDeTitular, VARIANTES_DE_ANUNCIO, type PedidoDeAnuncio } from '../../../../packages/carousel-engine/src/anuncio'
import type { FontEntry } from '../../../../packages/carousel-engine/src'
import type { MarcaParaRender } from '../puertos'
import { avanzar, abrirEncargo } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { procesarSalida } from '../salida'
import { CONTRATOS_EN_TEXTO, contextoDelRevisor } from '../pedidos'
import { BUENOS_PROMPTS, CLIENTE, PARTE, FICHAS_VACIAS, crearMemoria, correr, direccionGenerada, observacion, type Guion, type Memoria } from './memoria'

const MARCA: MarcaParaRender = { colors: { primary: '#1a0828', secondary: '#2d1135', accent: '#51d4b4' }, fonts: { family: 'Inter', headline_family: 'Caveat' }, brand_handle: '@marca.ec' }
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')

describe('el diseño de la pieza', () => {
  it('es estable para la misma semilla y usa los colores y tipografías del manual', () => {
    const a = disenoDeAnuncio(MARCA, 'BRF-0003'); const b = disenoDeAnuncio(MARCA, 'BRF-0003')
    expect(a).toEqual(b)
    expect(a.tipografia).toEqual({ cuerpo: 'Inter', titular: 'Caveat' })
    for (const c of [a.etiqueta.fondo, a.boton.fondo, a.franja.fondo]) expect(['#1a0828', '#2d1135', '#51d4b4']).toContain(c)
  })
  it('varía entre piezas: con 60 briefs salen las 4 disposiciones y los 2 juegos de color', () => {
    const ds = Array.from({ length: 60 }, (_, i) => disenoDeAnuncio(MARCA, `BRF-${String(i).padStart(4, '0')}`))
    expect(new Set(ds.map((d) => d.variante))).toEqual(new Set(VARIANTES))
    expect(new Set(ds.filter((d) => d.variante !== 'franja').map((d) => d.boton.fondo))).toEqual(new Set(['#1a0828', '#51d4b4']))
  })
  it('el texto de cada elemento es el que más contrasta con su fondo', () => {
    expect(textoSobre('#1a0828')).toBe('#ffffff'); expect(textoSobre('#51d4b4')).toBe('#111111'); expect(textoSobre('#ffffff')).toBe('#111111'); expect(textoSobre('#000')).toBe('#ffffff')
    for (let i = 0; i < 40; i++) {
      const d = disenoDeAnuncio(MARCA, `s${i}`)
      for (const x of [d.etiqueta, d.boton, d.franja]) expect(contraste(x.fondo, x.texto)).toBeGreaterThanOrEqual(contraste(x.fondo, x.texto === '#ffffff' ? '#111111' : '#ffffff'))
    }
  })
  it('en la franja, la etiqueta y el botón no se confunden con el fondo (toman el color que más contrasta)', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `f${i}`).filter((s) => disenoDeAnuncio(MARCA, s).variante === 'franja')
    expect(seeds.length).toBeGreaterThan(10)
    for (const s of seeds) { const d = disenoDeAnuncio(MARCA, s); expect(contraste(d.etiqueta.fondo, d.franja.fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_CON_LA_FRANJA); expect(contraste(d.boton.fondo, d.franja.fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_CON_LA_FRANJA) }
  })
  it('una marca de un solo color o con colores mal escritos no rompe; sin tipografía de títulos usa la del cuerpo', () => {
    const d = disenoDeAnuncio({ colors: { primary: '#abc', secondary: 'rojo', accent: '' }, fonts: { family: '' } }, 'x')
    expect(d.boton.fondo).toBe('#aabbcc'); expect(d.etiqueta.fondo).toBe('#aabbcc'); expect(d.tipografia).toEqual({ cuerpo: 'Inter', titular: 'Inter' })
  })
  it('las variantes son las mismas del motor y en el mismo orden; la semilla da un número estable', () => {
    expect([...VARIANTES]).toEqual([...VARIANTES_DE_ANUNCIO])
    expect(numeroDe('abc')).toBe(numeroDe('abc')); expect(numeroDe('abc')).not.toBe(numeroDe('abd'))
  })
})

describe('el texto que va sobre la imagen', () => {
  it('es el del autor, sin espacios de más', () => {
    const r = textoEnImagenDe({ texto_en_imagen: { etiqueta: ' Delivery ', titular: 'El oro  que nunca buscaste', bajada: 'Recién hecho', boton: 'Pide ya' }, llamado: 'otro' }, 'https://www.ejemplo.com')
    expect(r.texto).toEqual({ etiqueta: 'Delivery', titular: 'El oro que nunca buscaste', bajada: 'Recién hecho', boton: 'Pide ya' }); expect(r.avisos).toEqual([])
  })
  it('sin botón: el llamado si cabe; si no cabe o no hay, la web; nunca una palabra inventada', () => {
    expect(textoEnImagenDe({ texto_en_imagen: { titular: 't' }, llamado: 'Pídelo por WhatsApp' }, 'https://www.ejemplo.com').texto.boton).toBe('Pídelo por WhatsApp')
    expect(textoEnImagenDe({ texto_en_imagen: { titular: 't' }, llamado: 'x'.repeat(41) }, 'https://www.ejemplo.com/menu').texto.boton).toBe('ejemplo.com')
    expect(textoEnImagenDe({ texto_en_imagen: { titular: 't' } }, null).texto.boton).toBeUndefined()
  })
  it('sin titular y con textos largos: se dibuja igual y se avisa (no bloquea)', () => {
    const r = textoEnImagenDe({ pie_de_foto: 'p' }, 'ejemplo.com')
    expect(r.texto).toEqual({ boton: 'ejemplo.com' }); expect(r.avisos.join()).toContain('titular')
    const l = textoEnImagenDe({ texto_en_imagen: { titular: 'x'.repeat(71), etiqueta: 'e'.repeat(41) } }, null)
    expect(l.texto.titular).toHaveLength(71); expect(l.avisos.filter((a) => a.includes('caben'))).toHaveLength(2)
  })
  it('para chequear, se junta en una línea por elemento', () => {
    expect(textoEnImagenParaChequear({ texto_en_imagen: { titular: 'A', boton: 'B' } })).toBe('A\nB')
    expect(textoEnImagenParaChequear({})).toBe(''); expect(textoEnImagenParaChequear(undefined)).toBe('')
  })
  it('el dominio de la web', () => {
    expect(dominioDe('https://www.ejemplo.com/x?y=1')).toBe('ejemplo.com'); expect(dominioDe('ejemplo.ec')).toBe('ejemplo.ec'); expect(dominioDe('')).toBeNull(); expect(dominioDe('http://')).toBeNull()
  })
  it('el contrato del autor admite `texto_en_imagen` (y la corrección también); un texto largo no se rechaza en el contrato', () => {
    const ok = procesarSalida(JSON.stringify({ pie_de_foto: 'p', hashtags: [], texto_en_imagen: { titular: 'x'.repeat(200), boton: 'b' } }), 'pieza_post.v1', 1, 1)
    expect(ok.ok).toBe(true); if (ok.ok) expect((ok.valor as Record<string, any>).texto_en_imagen).toEqual({ titular: 'x'.repeat(200), boton: 'b' })
    const corr = procesarSalida(JSON.stringify({ respuestas: [], pieza: { pie_de_foto: 'p', hashtags: [], texto_en_imagen: { titular: 't' } } }), 'resolucion.v1', 1, 1)
    expect(corr.ok).toBe(true); if (corr.ok) expect((corr.valor as Record<string, any>).pieza.texto_en_imagen).toEqual({ titular: 't' })
    expect(CONTRATOS_EN_TEXTO['pieza_post.v1']).toContain('texto_en_imagen'); expect(CONTRATOS_EN_TEXTO['pieza_post.v1']).toContain('nunca el generador')
  })
})

describe('bytes → data URI', () => {
  it('reconoce png, jpeg, webp y svg; otra cosa o vacío ⇒ null', () => {
    expect(comoDataUri(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]))).toMatch(/^data:image\/png;base64,/)
    expect(comoDataUri(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toMatch(/^data:image\/jpeg;/)
    expect(comoDataUri(Buffer.from('RIFF0000WEBPVP8 '))).toMatch(/^data:image\/webp;/)
    expect(comoDataUri(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="x"></svg>'))).toMatch(/^data:image\/svg\+xml;/)
    expect(comoDataUri(Buffer.from('<html></html>'))).toBeNull(); expect(comoDataUri(null)).toBeNull(); expect(comoDataUri(Buffer.from([1, 2])))
      .toBeNull()
  })
})

// ───────────────────────── el dibujo
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const pedido = (o: Partial<PedidoDeAnuncio> = {}): PedidoDeAnuncio => ({
  ancho: 1080, alto: 1350, foto: PIXEL, logo: null, firma: '@marca.ec', diseno: disenoDeAnuncio(MARCA, 'BRF-0003'),
  texto: { etiqueta: 'Delivery', titular: 'El oro que nunca buscaste', bajada: 'Recién hecho', boton: 'Pide en ejemplo.com' }, ...o,
})
describe('el árbol del anuncio', () => {
  it('lleva la foto, los textos del autor, las tipografías y los colores del diseño', () => {
    const t = JSON.stringify(arbolDeAnuncio(pedido()))
    for (const x of ['Delivery', 'El oro que nunca buscaste', 'Recién hecho', 'Pide en ejemplo.com', '@marca.ec', '"fontFamily":"Caveat"', '"fontFamily":"Inter"', PIXEL]) expect(t).toContain(x)
    const d = disenoDeAnuncio(MARCA, 'BRF-0003'); expect(t).toContain(d.boton.fondo); expect(t).toContain(d.etiqueta.fondo)
  })
  it('lo que el autor no dio no se dibuja; con logo no va la firma; los emojis se quitan del dibujo', () => {
    const t = JSON.stringify(arbolDeAnuncio(pedido({ texto: { titular: 'Solo esto 🦐' }, logo: PIXEL, firma: '@marca.ec' })))
    expect(t).toContain('Solo esto'); expect(t).not.toContain('🦐'); expect(t).not.toContain('Delivery'); expect(t).not.toContain('@marca.ec')
  })
  it('cada variante dibuja un árbol distinto', () => {
    const arboles = VARIANTES_DE_ANUNCIO.map((v) => JSON.stringify(arbolDeAnuncio(pedido({ diseno: { ...disenoDeAnuncio(MARCA, 'x'), variante: v } }))))
    expect(new Set(arboles).size).toBe(4)
  })

  let interCache: FontEntry[] | null | undefined
  async function inter(ctx: TestContext): Promise<FontEntry[]> {
    if (interCache === undefined) {
      try {
        interCache = []
        for (const w of [400, 700] as const) {
          const r = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-${w}-normal.ttf`)
          if (!r.ok) throw new Error(String(r.status))
          interCache.push({ name: 'Inter', data: await r.arrayBuffer(), weight: w, style: 'normal' })
        }
      } catch { interCache = null }
    }
    if (!interCache) { console.warn('[composicion] CDN de Inter sin respuesta: prueba de PNG omitida'); ctx.skip() }
    return interCache as FontEntry[]
  }
  it('en píxeles: un PNG del tamaño del formato; las 4 variantes salen distintas; el mismo pedido sale igual', async (ctx) => {
    const fonts = await inter(ctx)
    const m = { ...MARCA, fonts: { family: 'Inter' } }
    const pngs = await Promise.all(VARIANTES_DE_ANUNCIO.map((v) => renderAnuncio(pedido({ diseno: { ...disenoDeAnuncio(m, 'x'), variante: v } }), { fonts })))
    for (const r of pngs) { expect(r.png.readUInt32BE(16)).toBe(1080); expect(r.png.readUInt32BE(20)).toBe(1350); expect(r.fonts_faltantes).toEqual([]) }
    expect(new Set(pngs.map((r) => sha(r.png))).size).toBe(4)
    const otra = await renderAnuncio(pedido({ diseno: { ...disenoDeAnuncio(m, 'x'), variante: VARIANTES_DE_ANUNCIO[0] } }), { fonts })
    expect(sha(otra.png)).toBe(sha(pngs[0].png))
    const cuadrado = await renderAnuncio(pedido({ ancho: 1080, alto: 1080, diseno: { ...disenoDeAnuncio(m, 'x'), variante: 'franja' } }), { fonts })
    expect(cuadrado.png.readUInt32BE(20)).toBe(1080)
  }, 60000)
})

// ───────────────────────── la entrega compone (orquestador con el banco en memoria)
const PIEZA_CON_TEXTO = JSON.stringify({ pie_de_foto: 'Ceviche recién hecho.', hashtags: ['#ceviche'], llamado: 'Pídelo por WhatsApp', texto_en_imagen: { etiqueta: 'Delivery', titular: 'El oro que nunca buscaste', boton: 'Pide en naufrago.ec' } })
const guion = (texto = PIEZA_CON_TEXTO): Guion => ({
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion([...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))) }),
  texto: () => ({ texto }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  corrige: () => ({ texto: '{"respuestas": []}' }),
  decide: () => ({ texto: '{"respuestas": []}' }),
  decide_imagen: () => ({ texto: '{"respuestas": []}' }),
})
async function correrEntrega(M: Memoria, texto?: string) {
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  await correr(M, id, guion(texto))
  const enc = await M.P.almacen.leerEncargo(id)
  const ent = enc!.estado_del_motor.artefactos['entrega']?.datos as Record<string, any>
  return { enc: enc!, ent, fichas: enc!.estado_del_motor.fichas }
}
const PNG_COMPUESTO = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 4, 0x38, 0, 0, 4, 0x38, 8, 6, 0, 0, 0])])

describe('la entrega compone la foto con la marca', () => {
  it('con marca y puerto: compone UNA vez con la foto, el texto del autor, el diseño del manual y la firma (sin logo); deja dicho cómo salió', async () => {
    const M = crearMemoria()
    const pedidos: PedidoDeAnuncio[] = []
    M.P.componer = async (p) => { pedidos.push(p); return { ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] } }
    const { ent, fichas } = await correrEntrega(M)
    expect(pedidos).toHaveLength(1)
    const p = pedidos[0]
    expect(p.foto).toMatch(/^data:image\/png;base64,/); expect(p.logo).toBeNull(); expect(p.firma).toBe('@naufrago.ec')
    expect(p.texto).toEqual({ etiqueta: 'Delivery', titular: 'El oro que nunca buscaste', boton: 'Pide en naufrago.ec' })
    expect(p.diseno).toEqual(disenoDeAnuncio({ colors: { primary: '#112233', secondary: '#445566' }, fonts: { family: 'Inter' }, brand_handle: '@naufrago.ec' }, 'BRF-0003'))
    expect([p.ancho, p.alto]).toEqual([1024, 1024]) // el tamaño de la foto ya encajada (el banco no trae formato: no se encaja)
    expect(ent.composicion).toMatchObject({ compuesta: true, variante: p.diseno.variante, con_logo: false, texto: p.texto })
    // lo que se entrega ES la imagen compuesta (una sola imagen: la foto sola no viaja aparte)
    const imagenes = (ent.archivos as Array<{ nombre: string; sha256: string; tipo: string | null }>).filter((x) => x.tipo === 'png' || x.tipo === 'jpeg')
    expect(imagenes).toHaveLength(1); expect(imagenes[0].sha256).toBe(sha(PNG_COMPUESTO))
    expect(fichas.some((f) => f.donde === 'imagen' && (f.que ?? '').includes('no trae logo'))).toBe(true)
  })
  it('con logo en el manual: lo baja, lo dibuja y no pone la firma', async () => {
    const M = crearMemoria({ fuentes: { marca: { colors: { primary: '#112233' }, fonts: { family: 'Inter' }, logo_url: 'https://logo.test/l.png', brand_handle: '@x' } } })
    const bajados: string[] = []
    const desc = M.P.descargar; M.P.descargar = async (u) => { bajados.push(u); return desc(u) }
    let p: PedidoDeAnuncio | null = null
    M.P.componer = async (x) => { p = x; return { ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] } }
    const { ent } = await correrEntrega(M)
    expect(bajados).toContain('https://logo.test/l.png'); expect(p!.logo).toMatch(/^data:image\/png/); expect(p!.firma).toBeNull(); expect(ent.composicion.con_logo).toBe(true)
  })
  it('sin titular del autor: compone con el botón (su llamado) y avisa; nunca inventa un titular', async () => {
    const M = crearMemoria(); let p: PedidoDeAnuncio | null = null
    M.P.componer = async (x) => { p = x; return { ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] } }
    const { fichas } = await correrEntrega(M, JSON.stringify({ pie_de_foto: 'Ceviche recién hecho.', hashtags: ['#ceviche'], llamado: 'Pídelo por WhatsApp' }))
    expect(p!.texto).toEqual({ boton: 'Pídelo por WhatsApp' })
    expect(fichas.some((f) => f.donde === 'imagen' && (f.que ?? '').includes('no trae titular') && f.gravedad === 'sugerencia')).toBe(true)
  })
  it('sin rejas: un fallo del dibujo, sin marca o sin puerto ⇒ la foto sale como siempre; los dos primeros lo dicen', async () => {
    const f = crearMemoria(); f.P.componer = async () => ({ ok: false, error: 'satori se cayó' })
    const r1 = await correrEntrega(f)
    expect(r1.ent.composicion).toMatchObject({ compuesta: false, motivo: 'fallo_del_dibujo' }); expect(r1.ent.sin_imagen).toBe(false)
    expect(r1.fichas.some((x) => (x.que ?? '').includes('satori se cayó') && x.gravedad === 'sugerencia')).toBe(true)
    const s = crearMemoria({ fuentes: { marca: null } }); let llamado = 0; s.P.componer = async () => { llamado++; return { ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] } }
    const r2 = await correrEntrega(s)
    expect(llamado).toBe(0); expect(r2.ent.composicion).toMatchObject({ compuesta: false, motivo: 'sin_identidad_visual' }); expect(r2.ent.sin_imagen).toBe(false)
    const n = crearMemoria()
    const r3 = await correrEntrega(n)
    expect(r3.ent.composicion).toBeUndefined(); expect(r3.ent.sin_imagen).toBe(false)
    for (const r of [r1, r2, r3]) expect((r.ent.archivos as Array<{ sha256: string }>).some((x) => x.sha256 === sha(PNG_COMPUESTO))).toBe(false)
    expect(r1.enc.estado).toBe(r3.enc.estado)
  })
  it('las tipografías que no cargaron se avisan', async () => {
    const M = crearMemoria(); M.P.componer = async () => ({ ok: true, png: PNG_COMPUESTO, fonts_faltantes: ['Caveat'] })
    const { fichas } = await correrEntrega(M)
    expect(fichas.some((f) => (f.que ?? '').includes('Caveat'))).toBe(true)
  })
  it('el texto sobre la imagen pasa por los chequeos del pie: un teléfono ajeno escrito ahí se marca', async () => {
    const M = crearMemoria(); M.P.componer = async () => ({ ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] })
    const { fichas } = await correrEntrega(M, JSON.stringify({ pie_de_foto: 'Ceviche recién hecho.', hashtags: ['#ceviche'], texto_en_imagen: { titular: 'Llama al 0991112233' } }))
    expect(fichas.some((f) => f.origen === 'chequeo' && /0991112233|teléfono/i.test(f.que ?? ''))).toBe(true)
    const limpio = crearMemoria(); limpio.P.componer = M.P.componer
    const r = await correrEntrega(limpio, JSON.stringify({ pie_de_foto: 'Ceviche recién hecho.', hashtags: ['#ceviche'], texto_en_imagen: { titular: 'El oro que nunca buscaste' } }))
    expect(r.fichas.some((f) => /teléfono/i.test(f.que ?? ''))).toBe(false)
  })
  it('quien revisa ve el texto que irá sobre la imagen', () => {
    const c = contextoDelRevisor({ fuentes: { manual_texto: '', plan_texto: null } as never, brief: { texto: '', red: 'instagram', formato: 'post', que_es: '', mensaje: '', llamado: '' } as never, proporcion: '1:1', estado: {} as never, reglas: {} as never, imagenesAMirar: [], art: (n: string) => (n === 'pieza_post' ? { pie_de_foto: 'p', hashtags: [], texto_en_imagen: { titular: 'El oro' } } : undefined) } as never)
    expect(c.pieza).toContain('Texto escrito sobre la imagen'); expect(c.pieza).toContain('El oro')
  })
})
void avanzar

// ───────────────────────── ADENDA · los 7 sabotajes que sobrevivieron a CC7 (#16 #17 #18 #26 #28 #31 #32)
describe('ADENDA CC7 · lo que faltaba probar', () => {
  it('#31 #32 · el `componer` de los adaptadores reales existe y dibuja un PNG del tamaño pedido (se salta si el CDN de tipografías no responde)', async (ctx) => {
    let cdn = false
    try { cdn = (await fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-400-normal.ttf')).ok } catch { cdn = false }
    const { crearPuertos } = await import('../adaptadores')
    const { DbFalsa } = await import('./dbfalsa')
    const P = crearPuertos(new DbFalsa(), { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('', { status: 404 })) as typeof fetch)
    expect(typeof P.componer).toBe('function')
    if (!cdn) { console.warn('[composicion] CDN de tipografías sin respuesta: dibujo real omitido'); ctx.skip() }
    const r = await P.componer!(pedido({ ancho: 1080, alto: 1350, diseno: { ...disenoDeAnuncio({ ...MARCA, fonts: { family: 'Inter' } }, 'x'), variante: 'abajo_izquierda' } }))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.png.subarray(1, 4).toString('ascii')).toBe('PNG'); expect(r.png.readUInt32BE(16)).toBe(1080); expect(r.png.readUInt32BE(20)).toBe(1350) }
  }, 60000)
  it('#17 · sin identidad visual, la ficha de aviso LLEGA (no solo el motivo)', async () => {
    const M = crearMemoria({ fuentes: { marca: null } }); M.P.componer = async () => ({ ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] })
    const { fichas } = await correrEntrega(M)
    expect(fichas.some((f) => f.donde === 'imagen' && f.gravedad === 'sugerencia' && (f.que ?? '').includes('no tiene identidad visual'))).toBe(true)
  })
  it('#18 · un logo que no se puede leer: va el nombre y la ficha lo dice', async () => {
    const M = crearMemoria({ fuentes: { marca: { colors: { primary: '#112233' }, fonts: { family: 'Inter' }, logo_url: 'https://logo.test/roto.png', brand_handle: '@x' } } })
    const desc = M.P.descargar; M.P.descargar = async (u) => (u.includes('logo.test') ? Buffer.from('<html>no es una imagen</html>') : desc(u))
    let p: PedidoDeAnuncio | null = null
    M.P.componer = async (x) => { p = x; return { ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] } }
    const { fichas, ent } = await correrEntrega(M)
    expect(p!.logo).toBeNull(); expect(p!.firma).toBe('@x'); expect(ent.composicion.con_logo).toBe(false)
    expect(fichas.some((f) => f.donde === 'imagen' && (f.que ?? '').includes('no se pudo leer el logo'))).toBe(true)
  })
  it('#16 · el texto de la imagen no cuenta contra el tope del pie: un pie justo en el tope + titular no da «pie demasiado largo»; uno pasado sí', async () => {
    const tope = Number((await import('../plantillas/post-img')).POST_IMG.limites.pie_de_foto_max)
    const con = (pie: string) => JSON.stringify({ pie_de_foto: pie, hashtags: ['#ceviche'], texto_en_imagen: { titular: 'El oro que nunca buscaste', boton: 'Pide en naufrago.ec' } })
    const largo = (fs: Array<{ que?: string }>) => fs.some((f) => (f.que ?? '').includes('caracteres, más que el límite'))
    const justo = crearMemoria(); justo.P.componer = async () => ({ ok: true, png: PNG_COMPUESTO, fonts_faltantes: [] })
    expect(largo((await correrEntrega(justo, con('a'.repeat(tope)))).fichas)).toBe(false)
    const pasado = crearMemoria(); pasado.P.componer = justo.P.componer
    expect(largo((await correrEntrega(pasado, con('a'.repeat(tope + 1)))).fichas)).toBe(true)
  })
  it('#26 · el titular largo se achica (y nunca baja del mínimo legible)', () => {
    const util = 1080 - 2 * Math.round(1080 * 0.065)
    expect(tamanoDeTitular('x'.repeat(70), util)).toBeLessThan(tamanoDeTitular('x'.repeat(15), util))
    expect(tamanoDeTitular('x'.repeat(500), util)).toBe(Math.round(util * 0.055))
  })
  it('#28 · la franja lleva el color de la marca (fondo y bloque), no uno fijo', () => {
    const d = { ...disenoDeAnuncio(MARCA, 'x'), variante: 'franja' as const, franja: { fondo: '#123456', texto: '#ffffff' } }
    const t = JSON.stringify(arbolDeAnuncio(pedido({ diseno: d })))
    expect(t.split('"backgroundColor":"#123456"').length - 1).toBeGreaterThanOrEqual(2)
  })
})
