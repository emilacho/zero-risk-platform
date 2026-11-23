/**
 * Encargo 7 (21-nov) · la lectura «por carpeta» del vault: capa → red → tipo con conteos, RAW, vistas y el contenido paginado.
 * US$ 0 · sin red (la consulta es un molde con tablas en memoria que respeta donde/orden/límite como la real).
 */
import { describe, expect, it } from 'vitest'
import type { Consulta, Fila } from '../../consulta'
import { DIAS_DE_RECIEN_LLEGADO, FUERA_DE_LA_LECTURA, leerCarpetas, POR_PAGINA_MAXIMO, TENDENCIAS_A_LEER } from '../carpetas'

const C = 'cli-1'
// fechas relativas al reloj real: «recién llegado» son los últimos 7 días medidos al correr la prueba
const HOY = new Date().toISOString()
const AYER = new Date(Date.now() - 24 * 3_600_000).toISOString()
const VIEJA = new Date(Date.now() - 51 * 24 * 3_600_000).toISOString()
const DIA_HOY = HOY.match(/^\d{4}-\d{2}-\d{2}/)![0]
const DIA_AYER = AYER.match(/^\d{4}-\d{2}-\d{2}/)![0]

/** consulta falsa: eq y null como la real, orden por una columna, límite; un error simulado por tabla */
const consultaCon = (tablas: Record<string, Fila[]>, fallaEn: string | null = null): Consulta => async (p) => {
  if (p.tabla === fallaEn) return { filas: [], error: `falla simulada en ${p.tabla}` }
  let filas = (tablas[p.tabla] ?? []).filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v)))
  if (p.orden) { const { columna, descendente } = p.orden; filas = [...filas].sort((a, b) => (String(a[columna]) < String(b[columna]) ? -1 : 1) * (descendente ? -1 : 1)) }
  if (typeof p.limite === 'number') filas = filas.filter((_x, i) => i < p.limite!)
  return { filas, error: null }
}

const foto = (id: string, extra: Fila = {}): Fila => ({ id, client_id: C, estado: 'ok', owner_role: 'propio', papel: 'propio', via: 'cuenta_propia', nivel: 'propio', tipo: 'post_image', post_url: 'https://www.instagram.com/p/' + id, url: null, caption: 'ceviche ' + id, posted_at: AYER, created_at: AYER, duplicado_de: null, hash_archivo: null, sin_motivo: null, que_muestra: null, red: null, ...extra })
const TABLAS = (): Record<string, Fila[]> => ({
  client_social_images: [
    foto('f1'),
    foto('f2', { owner_role: 'competidor', papel: 'competidor', nivel: 'directa', tipo: 'maps_foto', post_url: null, url: 'https://lh5.googleusercontent.com/x.jpg', posted_at: VIEJA, created_at: VIEJA }),
    foto('f3', { duplicado_de: 'f1' }),
    foto('f4', { papel: 'mercado', via: 'hashtag', nivel: 'competencia', sin_motivo: true }),
    foto('f5', { papel: 'referencia', via: 'tendencia', nivel: 'global', tipo: 'video_captura', post_url: 'https://www.tiktok.com/@a/video/9', posted_at: VIEJA, created_at: VIEJA }),
  ],
  client_videos: [
    { id: 'v1', client_id: C, owner_role: 'propio', papel: 'propio', via: 'cuenta_propia', nivel: 'propio', tipo: 'reel', post_url: 'https://www.instagram.com/reel/v1/', fuente_url: null, caption: 'reel propio', posted_at: HOY, created_at: HOY, sin_motivo: null, red: null },
  ],
  cerebro_tendencias: [
    { id: 't-vigente', client_id: C, nivel: 'pais', red: 'tiktok', consulta: '#ceviche', tipo: 'video', autor: null, texto: 'tendencia de hoy', url: 'https://www.tiktok.com/@b/video/1', publicado_en: AYER, observado_en: HOY, observado_dia: DIA_HOY },
    { id: 't-vieja', client_id: C, nivel: 'pais', red: 'tiktok', consulta: '#ceviche', tipo: 'video', autor: null, texto: 'la misma, ayer', url: null, publicado_en: AYER, observado_en: AYER, observado_dia: DIA_AYER },
  ],
  cerebro_comentarios_competencia: [
    { id: 'c1', client_id: C, red: 'tiktok', cuenta: 'rival', texto: 'se ve rico', capa: null, nivel: 'competencia', fecha_comentario: AYER, post_url: 'https://www.tiktok.com/@rival/video/2', observado_en: AYER },
  ],
  cerebro_fichas: [
    { id: 'fi1', client_id: C, clase: 'metrica', alcance: 'cliente', red: null, titulo: 'ventas de ayer', fuente_url: null, fecha_fuente: AYER, observado_en: AYER, creado_en: AYER, vigente_hasta: null, descartada: false, retirada_en: null },
    { id: 'fi2', client_id: C, clase: 'sitio', alcance: 'cliente', red: null, titulo: 'la página de inicio', fuente_url: 'https://naufrago.ec/', fecha_fuente: VIEJA, observado_en: VIEJA, creado_en: VIEJA, vigente_hasta: null, descartada: false, retirada_en: null },
    { id: 'fi-retirada', client_id: C, clase: 'sitio', alcance: 'cliente', red: null, titulo: 'x', fuente_url: null, fecha_fuente: VIEJA, observado_en: VIEJA, creado_en: VIEJA, vigente_hasta: null, descartada: false, retirada_en: VIEJA },
    { id: 'fi-descartada', client_id: C, clase: 'sitio', alcance: 'cliente', red: null, titulo: 'x', fuente_url: null, fecha_fuente: VIEJA, observado_en: VIEJA, creado_en: VIEJA, vigente_hasta: null, descartada: true, retirada_en: null },
    { id: 'fi-vencida', client_id: C, clase: 'precio', alcance: 'cliente', red: null, titulo: 'promo vieja', fuente_url: null, fecha_fuente: VIEJA, observado_en: VIEJA, creado_en: VIEJA, vigente_hasta: '2026-10-15T00:00:00Z', descartada: false, retirada_en: null },
    { id: 'fi-competidor', client_id: C, clase: 'competidor_anuncios_google', alcance: 'competidor', red: null, titulo: 'anuncio del rival', fuente_url: null, fecha_fuente: AYER, observado_en: AYER, creado_en: AYER, vigente_hasta: null, descartada: false, retirada_en: null },
  ],
})

const arbolDe = async (tablas = TABLAS()) => {
  const r = await leerCarpetas(consultaCon(tablas), { cliente: C })
  if (!r.ok || !('arbol' in r)) throw new Error('no vino el árbol')
  return r
}
const carpeta = (r: Awaited<ReturnType<typeof arbolDe>>, capa: string, red: string, tipo: string) =>
  r.arbol.find((x) => x.capa === capa)?.redes.find((x) => x.red === red)?.tipos.find((x) => x.tipo === tipo)

describe('🔴 el árbol: capa → red → tipo, con los conteos y sin inventar carpetas vacías', () => {
  it('cada pieza cae en su carpeta; las copias y lo sin motivo van a RAW, no al árbol', async () => {
    const r = await arbolDe()
    expect(carpeta(r, 'propio', 'instagram', 'publicacion')).toMatchObject({ total: 1, rotulo: 'Publicaciones' })
    expect(carpeta(r, 'propio', 'instagram', 'reel')).toMatchObject({ total: 1, nuevas_7_dias: 1 })
    expect(carpeta(r, 'competencia', 'maps', 'foto')).toMatchObject({ total: 1, nuevas_7_dias: 0 })
    expect(carpeta(r, 'mundo', 'tiktok', 'foto')).toMatchObject({ total: 1 }) // la captura del video de tendencia global
    expect(carpeta(r, 'pais', 'tiktok', 'tendencia')).toMatchObject({ total: 1 })
    expect(carpeta(r, 'competencia', 'tiktok', 'comentario')).toMatchObject({ total: 1 })
    expect(r.raw).toEqual({ raw_duplicado: 1, raw_sin_clasificar: 1 })
    expect(r.arbol.find((x) => x.capa === 'propio')?.total).toBe(4) // f1 + v1 + fi1 + fi2
  })
  it('las fichas: la vigente entra con su red deducida; la retirada, la descartada y la vencida no cuentan', async () => {
    const r = await arbolDe()
    expect(carpeta(r, 'propio', 'ventas', 'ficha')).toMatchObject({ total: 1 })
    expect(carpeta(r, 'propio', 'sitio', 'pagina')).toMatchObject({ total: 1 })
    expect(carpeta(r, 'competencia', 'anuncios_google', 'anuncio')).toMatchObject({ total: 1 })
    // el árbol entero: f1 f2 f5 v1 t-vigente c1 fi1 fi2 fi-competidor (la t-vieja, la retirada, la descartada y la vencida NO)
    const todas = r.arbol.flatMap((c) => c.redes.flatMap((x) => x.tipos.map((t) => t.total))).reduce((a, b) => a + b, 0)
    expect(todas).toBe(9)
  })
  it('la columna `red` ya rellenada le gana a la deducción', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('f1', { red: 'facebook' })]
    const r = await arbolDe(t)
    expect(carpeta(r, 'propio', 'facebook', 'publicacion')).toMatchObject({ total: 1 })
    expect(carpeta(r, 'propio', 'instagram', 'publicacion')).toBeUndefined()
  })
  it('una pieza sin señal de red cae en «Datos sin red» (no_consta), no se inventa', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('f1', { post_url: null, url: null })]
    const r = await arbolDe(t)
    expect(r.arbol.find((x) => x.capa === 'propio')?.redes.find((x) => x.red === 'no_consta')).toMatchObject({ rotulo: 'Datos sin red' })
  })
  it('de las tendencias solo cuenta el último día observado (nunca la tabla entera: lección del 🟡 1 de #1153)', async () => {
    const r = await arbolDe()
    expect(carpeta(r, 'pais', 'tiktok', 'tendencia')?.total).toBe(1)
    expect(TENDENCIAS_A_LEER).toBeLessThanOrEqual(500)
  })
  it('de dos días observados gana el MÁS NUEVO, aunque la tabla llegue con el viejo primero (pedido c3 de CC6 en #1271)', async () => {
    const tendencia = (id: string, dia: string, obs: string): Fila => ({ id, client_id: C, nivel: 'pais', red: 'tiktok', consulta: '#ceviche', tipo: 'video', autor: null, texto: id, url: null, publicado_en: obs, observado_en: obs, observado_dia: dia })
    const t = TABLAS()
    t.cerebro_tendencias = [tendencia('t-de-ayer', DIA_AYER, AYER), tendencia('t-hoy-1', DIA_HOY, HOY), tendencia('t-hoy-2', DIA_HOY, HOY)]
    const r = await arbolDe(t)
    expect(carpeta(r, 'pais', 'tiktok', 'tendencia')?.total).toBe(2)
    const abierta = await leerCarpetas(consultaCon(t), { cliente: C, capa: 'pais', red: 'tiktok', tipo: 'tendencia' })
    if (!abierta.ok || !('piezas' in abierta)) throw new Error('no vinieron piezas')
    expect(abierta.piezas.map((x) => x.id).sort()).toEqual(['t-hoy-1', 't-hoy-2'])
  })
  it('dos filas con el MISMO archivo (`hash_archivo`, sin `duplicado_de`) son UNA foto: la copia va a RAW «Duplicado» (pedido c9)', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('ha', { hash_archivo: 'sha-igual' }), foto('hb', { hash_archivo: 'sha-igual' })]
    t.client_videos = []; t.cerebro_tendencias = []; t.cerebro_comentarios_competencia = []; t.cerebro_fichas = []
    const r = await arbolDe(t)
    expect(carpeta(r, 'propio', 'instagram', 'publicacion')?.total).toBe(1)
    expect(r.raw.raw_duplicado).toBe(1)
    const copia = await leerCarpetas(consultaCon(t), { cliente: C, raw: 'raw_duplicado' })
    if (!copia.ok || !('piezas' in copia)) throw new Error('no vinieron piezas')
    expect(copia.piezas.map((x) => x.id)).toEqual(['hb']) // a igual origen gana la primera por id: «ha» queda en el árbol
  })
  it('una foto sin `estado: ok` (fallida o pendiente) no entra ni al árbol ni a RAW (pedido c15)', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('f1'), foto('f-fallida', { estado: 'fallida' }), foto('f-pendiente', { estado: 'pendiente' })]
    const r = await arbolDe(t)
    expect(carpeta(r, 'propio', 'instagram', 'publicacion')?.total).toBe(1)
    expect(r.raw).toEqual({ raw_duplicado: 0, raw_sin_clasificar: 0 })
  })
  it('la portada es la pieza más nueva CON enlace, y `recien_llegado` cuenta los últimos 7 días', async () => {
    const r = await arbolDe()
    expect(carpeta(r, 'propio', 'instagram', 'reel')?.portada).toMatchObject({ url: 'https://www.instagram.com/reel/v1/' })
    expect(carpeta(r, 'propio', 'ventas', 'ficha')?.portada).toBeNull() // la ficha de ventas no tiene enlace: sin url no hay portada
    expect(r.vistas.recien_llegado).toBe(6) // f1, v1, t-vigente, c1, fi1, fi-competidor
    expect(DIAS_DE_RECIEN_LLEGADO).toBe(7)
    expect(r.fuera).toEqual([...FUERA_DE_LA_LECTURA])
  })
  it('la bodega del mundo (bodega=1): sin cliente, SIN FICHAS aunque existan fichas sin cliente (pedido c14), y lo viral cae en «mundo»', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('b1', { client_id: null, owner_role: 'referencia', papel: 'referencia', nivel: 'mundo', tipo: 'video_captura', post_url: 'https://www.tiktok.com/@v/video/3' })]
    t.client_videos = []
    t.cerebro_tendencias = [{ id: 'tb', client_id: null, nivel: 'mundo', red: 'x', consulta: '#viral', tipo: 'video', autor: null, texto: 'viral', url: null, publicado_en: AYER, observado_en: HOY, observado_dia: DIA_HOY }]
    t.cerebro_comentarios_competencia = []
    // en lo vivo HAY fichas con client_id nulo (la bodega y las generales): la bodega del vault no debe mostrarlas
    t.cerebro_fichas = [{ id: 'fi-general', client_id: null, clase: 'metrica', alcance: 'general', red: null, titulo: 'ficha sin cliente', fuente_url: null, fecha_fuente: AYER, observado_en: AYER, creado_en: AYER, vigente_hasta: null, descartada: false, retirada_en: null }]
    const r = await leerCarpetas(consultaCon(t), { cliente: null, bodega: true })
    expect(r.ok && 'arbol' in r && r.alcance).toBe('bodega')
    if (!r.ok || !('arbol' in r)) return
    expect(r.arbol.map((x) => x.capa)).toEqual(['mundo'])
    expect(r.arbol[0].total).toBe(2)
    expect(r.piezas_contadas).toBe(2) // la ficha general NO cuenta: la bodega no lee `cerebro_fichas`
  })
})

describe('abrir una carpeta: las piezas paginadas, lo más nuevo primero', () => {
  it('🔴 pagina y dice cuántas hay; la página 2 sigue a la 1 sin repetir ni saltar', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('a', { posted_at: '2026-11-19T00:00:00Z' }), foto('b', { posted_at: '2026-11-20T00:00:00Z' }), foto('c', { posted_at: '2026-11-21T00:00:00Z' })]
    const p1 = await leerCarpetas(consultaCon(t), { cliente: C, capa: 'propio', red: 'instagram', tipo: 'publicacion', por_pagina: 2 })
    const p2 = await leerCarpetas(consultaCon(t), { cliente: C, capa: 'propio', red: 'instagram', tipo: 'publicacion', por_pagina: 2, pagina: 2 })
    if (!p1.ok || !('piezas' in p1) || !p2.ok || !('piezas' in p2)) throw new Error('no vinieron piezas')
    expect(p1).toMatchObject({ total: 3, paginas: 2, pagina: 1 })
    expect(p1.piezas.map((x) => x.id)).toEqual(['c', 'b'])
    expect(p2.piezas.map((x) => x.id)).toEqual(['a'])
    expect(p1.piezas[0]).toMatchObject({ fuente: 'foto', capa: 'propio', red: 'instagram', tipo: 'publicacion', etiquetas: { papel: 'propio', via: 'cuenta_propia' } })
  })
  it('abrir una carpeta NO mezcla piezas de RAW: la copia de su misma capa·red·tipo no sale (pedido c19)', async () => {
    // f3 (duplicado de f1) comparte carpeta propio·instagram·publicacion con f1, pero vive en RAW «Duplicado»
    const r = await leerCarpetas(consultaCon(TABLAS()), { cliente: C, capa: 'propio', red: 'instagram', tipo: 'publicacion' })
    if (!r.ok || !('piezas' in r)) throw new Error('no vinieron piezas')
    expect(r.total).toBe(1)
    expect(r.piezas.map((x) => x.id)).toEqual(['f1'])
  })
  it('`por_pagina` tiene techo (pedido c20): 1000 se recorta al máximo', async () => {
    const r = await leerCarpetas(consultaCon(TABLAS()), { cliente: C, capa: 'propio', por_pagina: 1000 })
    expect(r.ok && 'por_pagina' in r && r.por_pagina).toBe(POR_PAGINA_MAXIMO)
    expect(POR_PAGINA_MAXIMO).toBe(100)
  })
  it('la carpeta RAW también se abre (lo duplicado y lo sin clasificar se pueden mirar y devolver)', async () => {
    const r = await leerCarpetas(consultaCon(TABLAS()), { cliente: C, raw: 'raw_duplicado' })
    if (!r.ok || !('piezas' in r)) throw new Error('no vinieron piezas')
    expect(r.total).toBe(1)
    expect(r.piezas[0]).toMatchObject({ id: 'f3', raw: 'raw_duplicado' })
  })
  it('sin filtro de tipo trae toda la capa·red; con red no_consta trae lo sin red', async () => {
    const t = TABLAS()
    t.client_social_images = [foto('f1'), foto('sinred', { post_url: null, url: null })]
    const capaEntera = await leerCarpetas(consultaCon(t), { cliente: C, capa: 'propio', red: 'instagram' })
    expect(capaEntera.ok && 'total' in capaEntera && capaEntera.total).toBe(2) // f1 + v1 (reel instagram)
    const sinRed = await leerCarpetas(consultaCon(t), { cliente: C, capa: 'propio', red: 'no_consta' })
    if (!sinRed.ok || !('piezas' in sinRed)) return
    expect(sinRed.piezas.map((x) => x.id)).toEqual(['sinred'])
  })
})

describe('las entradas malas y las lecturas caídas', () => {
  it('sin cliente (y sin bodega) → entrada_invalida; capa, red, tipo o raw desconocidos → entrada_invalida', async () => {
    for (const p of [{ cliente: '' }, { cliente: C, capa: 'otra' }, { cliente: C, capa: 'propio', red: 'telegram' }, { cliente: C, capa: 'propio', tipo: 'meme' }, { cliente: C, raw: 'raw_otro' }]) {
      const r = await leerCarpetas(consultaCon(TABLAS()), p as never)
      expect(r.ok, JSON.stringify(p)).toBe(false)
      if (!r.ok) expect(r.error).toBe('entrada_invalida')
    }
  })
  it('una lectura que falla es un error con su tabla, no un árbol a medias', async () => {
    for (const tabla of ['client_social_images', 'client_videos', 'cerebro_tendencias', 'cerebro_comentarios_competencia', 'cerebro_fichas']) {
      const r = await leerCarpetas(consultaCon(TABLAS(), tabla), { cliente: C })
      expect(r.ok, tabla).toBe(false)
      if (!r.ok) { expect(r.error).toBe('error_de_lectura'); expect(r.detalle).toContain(tabla) }
    }
  })
})
