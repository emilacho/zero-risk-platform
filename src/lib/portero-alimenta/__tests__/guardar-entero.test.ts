/**
 * ENCARGO 11 · paso 2a · guardar sin recortes (19-nov · «nada se recorta», dale de Emilio). US$ 0, base falsa, sin red.
 *  1 · UNIDADES: reseñas, comentarios, publicaciones, menciones, transcripciones y artículos se guardan con su texto ENTERO (antes 800 / 1500 / 2500 / 4000);
 *  2 · PUENTE: el índice recibe la ficha ENTERA; hasta 7000 va en un trozo (igual que hoy), si pasa va en trozos PAREJOS y seguidos, todos con la misma ficha;
 *  3 · ENTREGA AL ÍNDICE: si el filtro rechaza CUALQUIER trozo de una ficha, la ficha es un hueco entero y los trozos que entraron salen (nunca media ficha).
 */
import { describe, expect, it } from 'vitest'
import { normalizar } from '../../manual/texto'
import { unidadesDeRaspados, type FilaCruda } from '../unidades'
import { puenteAlIndice } from '../entorno'
import { puenteDeFicha, seccionesDeLaFicha, trozosParejos, type FichaParaPuente } from '../puente'
import { CASOS, montar, tablas } from './fixtures-despertar'

type T = Record<string, Array<Record<string, unknown>>>
const c = CASOS[0]
const FRASE = 'El encebollado llegó caliente y la atención fue muy buena, volveremos con la familia. '
const largo = (n: number) => { const k = Math.floor(n / FRASE.length); return FRASE.repeat(k) + 'x'.repeat(n - k * FRASE.length) }
const fila = (apify_function: string, respuesta: unknown, extra: Partial<FilaCruda> = {}): FilaCruda => ({ id: `raw-${apify_function}`, apify_function, ensayo: false, created_at: '2026-11-19T08:00:00Z', respuesta, ...extra }) as FilaCruda
const uno = (f: FilaCruda, fuente: string) => {
  const us = unidadesDeRaspados([f], { propios: { sitio: 'https://naufrago.example', handles: ['naufrago.ec'] } }).filter((u) => u.fuente === fuente)
  expect(us, `una unidad de ${fuente}`).toHaveLength(1)
  return us[0]
}

describe('unidades: el texto se guarda ENTERO', () => {
  it.each([
    ['comentarios de Instagram (antes 800)', fila('instagram_post_comments_scraper', [{ id: 'c1', text: largo(2400), timestamp: '2026-11-18' }]), 'comentarios', 2400],
    ['comentarios de TikTok (antes 800)', fila('comentarios_tiktok', [{ id: 'c2', text: largo(1900), timestamp: '2026-11-18' }]), 'comentarios', 1900],
    ['publicaciones de Facebook (antes 1500)', fila('publicaciones_facebook', [{ postId: 'p1', text: largo(5200), time: '2026-11-18' }]), 'publicaciones_facebook', 5200],
    ['transcripción de un video (antes 2500)', fila('videos_youtube', [{ id: 'v1', transcript: largo(9100), timestamp: '2026-11-18' }]), 'videos', 9100],
    ['mención en redes (antes 1500)', fila('menciones_en_redes', [{ id: 'm1', caption: largo(3300), timestamp: '2026-11-18' }]), 'mencion', 3300],
  ])('🔴 %s', (_n, f, fuente, n) => {
    const u = uno(f, fuente)
    expect(u.texto).toBe(normalizar(largo(n)))
    expect(u.texto.length).toBeGreaterThan(n * 0.9)
  })
  it('🔴 los comentarios que ya trae un video propio se guardan enteros (antes 800)', () => {
    const f = fila('videos_instagram', [{ id: 'v2', caption: 'video propio del local con su descripción', ownerUsername: 'naufrago.ec', timestamp: '2026-11-18', latestComments: [{ id: 'lc1', text: largo(2000), timestamp: '2026-11-18' }] }])
    const cs = unidadesDeRaspados([f], { propios: { handles: ['naufrago.ec'] } }).filter((u) => u.fuente === 'comentarios')
    expect(cs).toHaveLength(1)
    expect(cs[0].texto).toBe(normalizar(largo(2000)))
  })
  it('🔴 un artículo se guarda entero (antes 4000) y su huella es la del texto entero', () => {
    const texto = largo(9500)
    const us = unidadesDeRaspados([fila('website_content_scraper', [{ url: 'https://diario.example/nota', text: texto }], { metadata: { llamado_por: 'ogfq56oIEoHufFPM#articulo' } } as never)], { propios: { sitio: 'https://naufrago.example', handles: [] } }).filter((u) => u.fuente === 'articulo')
    expect(us).toHaveLength(1)
    expect(us[0].texto).toBe(normalizar(texto))
    const otra = unidadesDeRaspados([fila('website_content_scraper', [{ url: 'https://diario.example/nota', text: largo(4000) + 'OTRO FINAL distinto del primero, con más texto aquí' }], { metadata: { llamado_por: 'ogfq56oIEoHufFPM#articulo' } } as never)], { propios: { sitio: 'https://naufrago.example', handles: [] } }).filter((u) => u.fuente === 'articulo')
    expect(otra[0].huella, 'dos artículos que solo difieren después del carácter 4000 ya no comparten huella').not.toBe(us[0].huella)
  })
  it('lo corto sigue igual', () => {
    expect(uno(fila('instagram_post_comments_scraper', [{ id: 'c3', text: 'Muy rico todo, gracias', timestamp: '2026-11-18' }]), 'comentarios').texto).toBe(normalizar('Muy rico todo, gracias'))
  })
})

describe('trozos parejos para el índice', () => {
  it.each([1, 6999, 7000, 7001, 14000, 14001, 50_123])('largo %i: juntos dan el original, ninguno pasa de 7000, parejos (ningún trozo diminuto)', (n) => {
    const t = largo(n)
    const tr = trozosParejos(t)
    expect(tr.join('')).toBe(t)
    expect(tr.every((x) => x.length <= 7000)).toBe(true)
    expect(tr.length).toBe(Math.ceil(n / 7000))
    const tam = tr.map((x) => x.length)
    expect(Math.max(...tam) - Math.min(...tam)).toBeLessThan(tr.length)
    // la ruta de ingreso descarta una sección de menos de 10 caracteres: con trozos parejos el más chico pasa de 3000
    expect(Math.min(...tam)).toBeGreaterThan(n > 7000 ? 3000 : 0)
  })
  it('una ficha de hasta 7000 va en un solo trozo, con la etiqueta de siempre y sin número', () => {
    expect(seccionesDeLaFicha('resenas', 'hola')).toEqual([{ section_label: 'resenas', text: 'hola' }])
  })
  it('una ficha larga va en varios trozos numerados, con su número en la etiqueta y en metadata', () => {
    const s = seccionesDeLaFicha('resumen_vivo', largo(15000))
    expect(s.map((x) => x.section_label)).toEqual(['resumen_vivo · trozo 1 de 3', 'resumen_vivo · trozo 2 de 3', 'resumen_vivo · trozo 3 de 3'])
    expect(s.map((x) => x.metadata)).toEqual([{ trozo: 1, trozos: 3 }, { trozo: 2, trozos: 3 }, { trozo: 3, trozos: 3 }])
  })
})

const ficha = (id: string, contenido: string): FichaParaPuente => ({
  id, client_id: c.id, ref: `portero:resumen_vivo:${id}`, clase: 'resumen_vivo', titulo: 'Resumen vivo', contenido, fecha_fuente: null, observado_en: '2026-11-19', creado_en: '2026-11-19T08:00:00Z',
  propiedad: 'propia', origen: 'cliente', descartada: false, retirada_en: null, prueba: false, huella: `h-${id}`, atributo: null,
})

describe('el puente manda la ficha ENTERA al índice', () => {
  it('🔴 una ficha de 11 107 caracteres (la del resumen vivo real) llega entera: nada se pierde', () => {
    const contenido = largo(11107)
    const p = puenteDeFicha(ficha('rv', contenido))
    expect(p.sections).toHaveLength(2)
    const junto = p.sections.map((s) => s.text).join('')
    expect(junto).toContain(contenido)
    expect(p.sections.every((s) => s.text.length <= 7000)).toBe(true)
    expect(p.source_id).toBe('rv')
  })
  it('una ficha corta va igual que hoy (un trozo, etiqueta de la clase)', () => {
    const p = puenteDeFicha(ficha('co', 'Resumen corto del local'))
    expect(p.sections).toHaveLength(1)
    expect(p.sections[0].section_label).toBe('resumen_vivo')
    expect(p.sections[0]).not.toHaveProperty('metadata')
  })
})

/** la ruta de ingreso, en pequeño: rechaza las secciones que traen la palabra prohibida, escribe las demás en client_brain_chunks */
function indiceFalso(t: T, prohibida: string) {
  const cuerpos: Array<{ source_id: string; sections: Array<{ section_label: string; text: string; metadata?: unknown }> }> = []
  const impl = async (_u: string, i?: RequestInit): Promise<Response> => {
    const b = JSON.parse(String(i?.body)) as { client_id: string; source_id: string; sections: Array<{ section_label: string; text: string; metadata?: unknown }> }
    cuerpos.push(b)
    const malas = b.sections.filter((s) => s.text.includes(prohibida))
    const buenas = b.sections.filter((s) => !s.text.includes(prohibida))
    for (const s of buenas) t.client_brain_chunks.push({ client_id: b.client_id, source_table: 'cerebro_fichas', source_id: b.source_id, section_label: s.section_label, chunk_text: s.text })
    return new Response(JSON.stringify({ ok: true, chunks_upserted: buenas.length, sections_rejected: malas.length, ...(malas.length ? { ingress_filter: { rejected: malas.map(() => ({ reason: 'regex_deny' })) } } : {}) }), { status: 200 })
  }
  return { impl, cuerpos }
}

describe('la entrega al índice: todo o nada por ficha', () => {
  it('🔴 si el filtro rechaza el 2.º trozo, el 1.º sale del índice y la ficha queda marcada como hueco', async () => {
    const t = tablas(c) as T
    t.client_brain_chunks ??= []
    const contenido = largo(7500) + ' PROHIBIDA ' + largo(3000)
    t.cerebro_fichas.push({ ...ficha('m1', contenido) })
    const m = montar(t)
    const idx = indiceFalso(t, 'PROHIBIDA')
    const puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: m.base.db as never, fetchImpl: idx.impl, avisar: async () => undefined })
    const out = await puente({ escribir: [puenteDeFicha(ficha('m1', contenido))], sacar: [], client_id: c.id })
    expect(idx.cuerpos[0].sections).toHaveLength(2)
    expect(out).toMatchObject({ escritos: 0, intentados: 1, errores: [] })
    expect(out.rechazados).toEqual([{ source_id: 'm1', razon: 'regex_deny' }])
    // la base falsa anota el DELETE (no lo aplica): se pide sacar TODOS los trozos de la ficha, por cliente, tabla y ficha
    expect(m.base.escrituras.filter((w) => w.tabla === 'client_brain_chunks' && w.op === 'delete')).toEqual([{ tabla: 'client_brain_chunks', op: 'delete', fila: undefined, filtros: [['client_id', c.id], ['source_table', 'cerebro_fichas'], ['source_id', 'm1']] }])
    expect(t.cerebro_fichas.find((f) => f.id === 'm1')!.indice_rechazo).toBe('regex_deny')
  })
  it('si entran todos los trozos, la ficha queda escrita entera (y lleva el número de cada trozo)', async () => {
    const t = tablas(c) as T
    t.client_brain_chunks ??= []
    const contenido = largo(16000)
    t.cerebro_fichas.push({ ...ficha('m2', contenido) })
    const m = montar(t)
    const idx = indiceFalso(t, 'PROHIBIDA')
    const puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: m.base.db as never, fetchImpl: idx.impl, avisar: async () => undefined })
    const out = await puente({ escribir: [puenteDeFicha(ficha('m2', contenido))], sacar: [], client_id: c.id })
    expect(out).toMatchObject({ escritos: 1, rechazados: [] })
    expect(m.base.escrituras.some((w) => w.tabla === 'client_brain_chunks' && w.op === 'delete'), 'nada se saca si entraron todos').toBe(false)
    const trozos = t.client_brain_chunks.filter((k) => k.source_id === 'm2')
    expect(trozos).toHaveLength(3)
    expect(trozos.map((k) => String(k.chunk_text)).join('')).toContain(contenido)
    expect(idx.cuerpos[0].sections.map((s) => s.metadata)).toEqual([{ trozo: 1, trozos: 3 }, { trozo: 2, trozos: 3 }, { trozo: 3, trozos: 3 }])
  })
})
