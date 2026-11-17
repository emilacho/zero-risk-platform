/**
 * Sprint 3 · T5 · subtítulos palabra por palabra y montaje al ritmo (CC4 · GO Lenovo 17-nov 11:54) · US$ 0, sin red.
 *  · leer la transcripción: fuera símbolos y lo que cae después de la voz; >20 % de ruido = falló (no se inventan subtítulos);
 *  · agrupar: corte al final de frase, en pausas ≥150 ms y al máximo de la energía; nunca dos grupos a la vez; nunca en el 0 exacto;
 *  · la plantilla del video: un tramo por palabra con la que suena resaltada, escapado, antes del cierre, sin guion;
 *  · el ritmo: cortes al golpe más cercano solo con tempo claro, dentro del clip y del mínimo; el total se conserva.
 */
import { describe, expect, it } from 'vitest'
import { agruparPalabras, energiaDe, FRACCION_MAXIMA_DE_SIMBOLOS, leerPalabras, PALABRAS_POR_GRUPO, PAUSA_QUE_CORTA_S, ENTRADA_MINIMA_S } from '../video/subtitulos'
import { montarAlRitmo, MINIMO_POR_OMISION_S, TOLERANCIA_POR_OMISION_S } from '../video/ritmo'
import { htmlDeVideo, tramosDeSubtitulos, type GrupoDeSubtitulo, type PedidoDeVideoCompuesto } from '../../../../packages/carousel-engine/src/video-html'
import { disenoDeAnuncio } from '../composicion'
import type { MarcaParaRender } from '../puertos'
import { estadoDeAnalisis, iniciarAnalisis } from '../../render-html/cliente'

const MARCA: MarcaParaRender = { colors: { primary: '#3D2466', secondary: '#2d1135', accent: '#51d4b4' }, fonts: { family: 'Inter', headline_family: 'Inter' }, brand_handle: 'Marca' }
const w = (texto: string, desde: number, hasta: number) => ({ text: texto, start: desde, end: hasta })

describe('T5 · leer la transcripción', () => {
  it('acepta text/start/end y texto/desde/hasta; ordena; descarta símbolos, sin tiempo y fuera del video', () => {
    const r = leerPalabras([w('mundo', 0.5, 0.9), { texto: 'Hola', desde: 0.1, hasta: 0.4 }, w('♪', 1, 1.2), { text: 'sin', start: null, end: 1 }, w('tarde', 30, 31)], { segundos: 12 })
    expect(r).toEqual({ ok: true, palabras: [{ texto: 'Hola', desde: 0.1, hasta: 0.4 }, { texto: 'mundo', desde: 0.5, hasta: 0.9 }], descartadas: 3 })
  })
  it('el final nunca antes del inicio ni pasado el video; con fin de voz, fuera lo que empieza después (Whisper inventa sobre el silencio)', () => {
    const r = leerPalabras([w('a', 1, 0.5), w('b', 11.5, 14), w('Gracias.', 9.2, 9.8)], { segundos: 12, finDeVoz: 9 })
    expect(r).toEqual({ ok: true, palabras: [{ texto: 'a', desde: 1, hasta: 1 }], descartadas: 2 })
    // la que empieza justo cuando termina la voz también se descarta
    expect(leerPalabras([w('a', 1, 2), w('x', 9, 9.5)], { segundos: 12, finDeVoz: 9 })).toMatchObject({ ok: true, palabras: [{ texto: 'a' }], descartadas: 1 })
    const sinFin = leerPalabras([w('b', 11.5, 14)], { segundos: 12 })
    expect(sinFin).toMatchObject({ ok: true, palabras: [{ texto: 'b', desde: 11.5, hasta: 12 }] })
  })
  it('más del 20 % de símbolos = la transcripción falló; justo el 20 % todavía vale', () => {
    expect(FRACCION_MAXIMA_DE_SIMBOLOS).toBe(0.2)
    const cuatro = [w('a', 0, 0.2), w('b', 0.3, 0.5), w('c', 0.6, 0.8), w('d', 0.9, 1)]
    expect(leerPalabras([...cuatro, w('♪', 2, 3)], { segundos: 5 })).toMatchObject({ ok: true })
    const r = leerPalabras([...cuatro.slice(0, 3), w('�', 2, 3), w('♪♪', 3, 4)], { segundos: 5 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('2 de 5')
  })
  it('vacío o sin lista = no hay subtítulos, con motivo (nunca se inventan)', () => {
    expect(leerPalabras(null, { segundos: 5 })).toMatchObject({ ok: false })
    expect(leerPalabras([], { segundos: 5 })).toMatchObject({ ok: false })
    expect(leerPalabras([w('a', 6, 7)], { segundos: 5 })).toMatchObject({ ok: false })
  })
})

describe('T5 · agrupar', () => {
  const corrido = (n: number, paso = 0.3) => Array.from({ length: n }, (_, i) => ({ texto: `p${i}`, desde: 1 + i * paso, hasta: 1 + i * paso + 0.25 }))
  it('el máximo depende de la energía: 3 alta, 5 conversación, 6 calma', () => {
    expect(PALABRAS_POR_GRUPO).toEqual({ alta: { min: 2, max: 3 }, conversacion: { min: 3, max: 5 }, calma: { min: 4, max: 6 } })
    expect(agruparPalabras(corrido(7), 'alta').map((g) => g.palabras.length)).toEqual([3, 3, 1])
    expect(agruparPalabras(corrido(7), 'conversacion').map((g) => g.palabras.length)).toEqual([5, 2])
    expect(agruparPalabras(corrido(7), 'calma').map((g) => g.palabras.length)).toEqual([6, 1])
    expect(agruparPalabras(corrido(7)).map((g) => g.palabras.length)).toEqual([5, 2])
  })
  it('corta al final de frase y en una pausa de 150 ms o más (149 ms no corta)', () => {
    expect(PAUSA_QUE_CORTA_S).toBe(0.15)
    const ps = [{ texto: 'Hola.', desde: 1, hasta: 1.2 }, { texto: 'Ven', desde: 1.25, hasta: 1.4 }, { texto: 'ya', desde: 1.549, hasta: 1.7 }, { texto: 'hoy', desde: 1.85, hasta: 2 }, { texto: 'justo', desde: 2.15, hasta: 2.3 }]
    expect(agruparPalabras(ps).map((g) => g.palabras.map((x) => x.texto))).toEqual([['Hola.'], ['Ven', 'ya'], ['hoy'], ['justo']])
    expect(agruparPalabras([{ texto: '¿Vienes?»', desde: 1, hasta: 1.2 }, { texto: 'sí', desde: 1.21, hasta: 1.3 }]).length).toBe(2)
  })
  it('ningún grupo abre antes de 0,1 s ni antes de que cierre el anterior', () => {
    expect(ENTRADA_MINIMA_S).toBe(0.1)
    const g = agruparPalabras([{ texto: 'a.', desde: 0, hasta: 0.5 }, { texto: 'b', desde: 0.4, hasta: 0.9 }])
    expect(g.map((x) => [x.desde, x.hasta])).toEqual([[0.1, 0.5], [0.5, 0.9]])
  })
  it('las palabras repetidas conservan su tiempo (se emparejan por posición)', () => {
    const g = agruparPalabras([{ texto: 'sí', desde: 1, hasta: 1.1 }, { texto: 'sí', desde: 1.12, hasta: 1.2 }])
    expect(g[0].palabras.map((x) => x.desde)).toEqual([1, 1.12])
  })
  it('la energía como dato: lo desconocido queda en conversación', () => {
    expect(energiaDe('alta')).toBe('alta')
    expect(energiaDe('calma')).toBe('calma')
    expect(energiaDe('rapida')).toBe('conversacion')
    expect(energiaDe(undefined)).toBe('conversacion')
  })
})

describe('T5 · la plantilla del video con subtítulos', () => {
  const grupos: GrupoDeSubtitulo[] = [
    { desde: 0.5, hasta: 2, palabras: [{ texto: 'Pide', desde: 0.5, hasta: 0.9 }, { texto: '<b>hoy</b>', desde: 1, hasta: 1.5 }] },
    { desde: 1.8, hasta: 3, palabras: [{ texto: 'tu', desde: 2.1, hasta: 2.4 }, { texto: 'plato', desde: 2.5, hasta: 3 }] },
    { desde: 9, hasta: 11, palabras: [{ texto: 'tarde', desde: 9, hasta: 11 }] },
  ]
  const ped = (o: Partial<PedidoDeVideoCompuesto> = {}): PedidoDeVideoCompuesto => ({
    ancho: 1080, alto: 1920, segundos: 12, video: 'base.mp4', logo: null, firma: 'Marca', diseno: disenoDeAnuncio(MARCA, 'BRF-T5'),
    textos: [], cierre: { desde: 9.5, etiqueta: null, titular: 'Pide ya', bajada: null, boton: null }, subtitulos: grupos, ...o,
  })
  it('un tramo por palabra (del inicio de una al de la siguiente), sin pisar el grupo anterior y recortado antes del cierre', () => {
    expect(tramosDeSubtitulos(ped()).map((t) => [t.desde, t.hasta, t.resaltada, t.palabras.join(' ')])).toEqual([
      [0.5, 1, 0, 'Pide <b>hoy</b>'],
      [1, 2, 1, 'Pide <b>hoy</b>'],
      [2, 2.5, 0, 'tu plato'],
      [2.5, 3, 1, 'tu plato'],
      [9, 9.5, 0, 'tarde'],
    ])
  })
  it('sin cierre los subtítulos llegan al final del video; sin subtítulos no hay tramos', () => {
    expect(tramosDeSubtitulos(ped({ cierre: null })).at(-1)).toMatchObject({ desde: 9, hasta: 11 })
    expect(tramosDeSubtitulos(ped({ subtitulos: undefined }))).toEqual([])
  })
  it('el documento: cada tramo es una capa en sus segundos con la palabra resaltada, escapada, sin guion ni red', () => {
    const h = htmlDeVideo(ped(), [])
    expect(h).toContain('<div id="sub-1" class="clip sub" data-start="0.5" data-duration="0.5" data-track-index="3"')
    expect(h).toContain('<span class="p ya">Pide</span> <span class="p">&lt;b&gt;hoy&lt;/b&gt;</span>')
    expect(h).toContain('<span class="p">Pide</span> <span class="p ya">&lt;b&gt;hoy&lt;/b&gt;</span>')
    expect(h).not.toContain('<b>hoy')
    expect(h).toContain('data-no-timeline')
    expect(h).not.toMatch(/<script|https?:\/\//)
    expect((h.match(/class="clip sub"/g) ?? []).length).toBe(5)
  })
  it('el color del resaltado sale del botón de la marca; en vertical van por encima del texto del plano', () => {
    const d = disenoDeAnuncio(MARCA, 'BRF-T5')
    const h = htmlDeVideo(ped(), [])
    expect(h).toContain(`.sub .ya{background:${d.boton.fondo};color:${d.boton.texto}`)
    expect(h).toContain(`bottom:${Math.round(1920 * 0.34)}px;text-align:center`)
    expect(htmlDeVideo(ped({ ancho: 1920, alto: 1080 }), [])).toContain(`bottom:${Math.round(1080 * 0.08)}px;text-align:center`)
  })
  it('un cierre vacío (sin texto, logo ni firma) no corta los subtítulos', () => {
    const h = htmlDeVideo(ped({ firma: null, cierre: { desde: 9.5, etiqueta: null, titular: null, bajada: null, boton: null } }), [])
    expect(h).toContain('data-start="9" data-duration="2" data-track-index="3"')
    expect(h).not.toContain('id="cierre"')
  })
  it('sin subtítulos el documento es el de siempre (nada nuevo en la página)', () => {
    expect(htmlDeVideo(ped({ subtitulos: undefined }), [])).not.toContain('class="clip sub"')
  })
})

describe('T5 · montaje al ritmo', () => {
  const planos = [
    { n: 1, cortar_a_s: 3, segundos: 5 },
    { n: 2, cortar_a_s: 3, segundos: 5 },
    { n: 3, cortar_a_s: 4, segundos: 5 },
  ]
  const golpes = (bpm: number, hasta: number) => Array.from({ length: Math.floor((hasta * bpm) / 60) }, (_, i) => +((i + 1) * (60 / bpm)).toFixed(3))
  it('con tempo claro cada corte va al golpe más cercano y el total se conserva', () => {
    // 112 bpm = un golpe cada 0,536 s: el corte de 3 s va a 3,214 y el de 6 s a 5,893
    const r = montarAlRitmo(planos, { golpes: golpes(112, 12), confianza: 'high', bpm: 112 })
    expect(r.movido).toBe(true)
    if (!r.movido) return
    expect(r.planos).toEqual([{ n: 1, cortar_a_s: 3.214 }, { n: 2, cortar_a_s: 2.679 }, { n: 3, cortar_a_s: 4.107 }])
    expect(r.cortes_movidos).toBe(2)
    expect(r.total_s).toBe(10)
  })
  it('con tempo dudoso o sin música no se mueve nada (y se dice por qué)', () => {
    expect(montarAlRitmo(planos, { golpes: golpes(110, 12), confianza: 'low' })).toMatchObject({ movido: false, planos: planos.map((p) => ({ n: p.n, cortar_a_s: p.cortar_a_s })) })
    expect(montarAlRitmo(planos, { golpes: golpes(110, 12), confianza: 'uncertain' })).toMatchObject({ movido: false })
    expect(montarAlRitmo(planos, null)).toMatchObject({ movido: false, motivo: expect.stringContaining('sin música') })
    expect(montarAlRitmo([planos[0]], { golpes: [1, 2], confianza: 'high' })).toMatchObject({ movido: false })
    expect(montarAlRitmo(planos, { golpes: [5], confianza: 'high' })).toMatchObject({ movido: false })
  })
  it('un golpe más lejos que la tolerancia no mueve el corte', () => {
    expect(TOLERANCIA_POR_OMISION_S).toBe(0.6)
    expect(montarAlRitmo(planos, { golpes: [2.39, 6.61], confianza: 'high' })).toMatchObject({ movido: false })
    expect(montarAlRitmo(planos, { golpes: [2.41, 6.61], confianza: 'high' })).toMatchObject({ movido: true, planos: [{ n: 1, cortar_a_s: 2.41 }, { n: 2, cortar_a_s: 3.59 }, { n: 3, cortar_a_s: 4 }] })
  })
  it('nunca deja un plano más largo que su clip: el golpe que lo alargaría no se usa', () => {
    const justos = [{ n: 1, cortar_a_s: 3, segundos: 3 }, { n: 2, cortar_a_s: 3, segundos: 5 }]
    expect(montarAlRitmo(justos, { golpes: [3.4], confianza: 'high' })).toMatchObject({ movido: false })
    expect(montarAlRitmo(justos, { golpes: [2.7, 3.4], confianza: 'high' })).toMatchObject({ movido: true, planos: [{ n: 1, cortar_a_s: 2.7 }, { n: 2, cortar_a_s: 3.3 }] })
  })
  it('nunca deja un plano más corto que el mínimo (1 s), tampoco el último', () => {
    expect(MINIMO_POR_OMISION_S).toBe(1)
    const cortos = [{ n: 1, cortar_a_s: 3, segundos: 5 }, { n: 2, cortar_a_s: 1.4, segundos: 5 }]
    // el golpe a 3,5 dejaría el último en 0,9 s
    expect(montarAlRitmo(cortos, { golpes: [3.5], confianza: 'high' })).toMatchObject({ movido: false })
    expect(montarAlRitmo(cortos, { golpes: [3.4], confianza: 'high' })).toMatchObject({ movido: true, planos: [{ n: 1, cortar_a_s: 3.4 }, { n: 2, cortar_a_s: 1 }] })
  })
  it('si el corte anterior se adelantó, el plano siguiente sin golpe cerca no pasa de su clip', () => {
    const ps = [{ n: 1, cortar_a_s: 3, segundos: 5 }, { n: 2, cortar_a_s: 4, segundos: 4.2 }, { n: 3, cortar_a_s: 3, segundos: 5 }]
    const r = montarAlRitmo(ps, { golpes: [2.5], confianza: 'high' })
    expect(r).toMatchObject({ movido: true, planos: [{ n: 1, cortar_a_s: 2.5 }, { n: 2, cortar_a_s: 4.2 }, { n: 3, cortar_a_s: 3.3 }] })
    expect(r.total_s).toBe(10)
  })
  it('el último plano no pasa de su clip (el total se acorta antes que estirar un clip)', () => {
    const ps = [{ n: 1, cortar_a_s: 3, segundos: 5 }, { n: 2, cortar_a_s: 3, segundos: 3 }]
    expect(montarAlRitmo(ps, { golpes: [2.5], confianza: 'high' })).toMatchObject({ movido: true, planos: [{ n: 1, cortar_a_s: 2.5 }, { n: 2, cortar_a_s: 3 }], total_s: 5.5 })
  })
})

describe('T5 · el cliente del análisis', () => {
  const S = { url: 'https://render.test', llave: 'k-1' }
  const jsonR = (codigo: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: codigo, headers: { 'content-type': 'application/json' } })
  const falso = (respuestas: Record<string, () => Response>) => {
    const llamadas: Array<{ url: string; metodo: string; llave: string | null; cuerpo: unknown }> = []
    const f = (async (u: string | URL, o?: RequestInit) => {
      const url = String(u)
      llamadas.push({ url, metodo: o?.method ?? 'GET', llave: new Headers(o?.headers).get('x-render-key'), cuerpo: typeof o?.body === 'string' ? JSON.parse(o.body) : null })
      const k = Object.keys(respuestas).find((x) => url.endsWith(x))
      if (!k) throw new Error('sin red')
      return respuestas[k]()
    }) as unknown as typeof fetch
    return { f, llamadas }
  }
  const id = '0f8b2c1e-0000-4000-8000-0000000000a1'
  it('iniciar: POST /analizar con la llave; solo 202 con id es un trabajo', async () => {
    const { f, llamadas } = falso({ '/analizar': () => jsonR(202, { id, estado: 'en_fila' }) })
    const pedido = { voz: { nombre: 'unido.mp4', url: 'https://x.supabase.co/u.mp4' }, idioma: 'es' }
    expect(await iniciarAnalisis(S, pedido, f)).toEqual({ ok: true, id })
    expect(llamadas[0]).toEqual({ url: 'https://render.test/analizar', metodo: 'POST', llave: 'k-1', cuerpo: pedido })
    expect(await iniciarAnalisis(S, pedido, falso({ '/analizar': () => jsonR(200, { id }) }).f)).toMatchObject({ ok: false, reintentar: false })
    expect(await iniciarAnalisis(S, pedido, falso({ '/analizar': () => jsonR(429, { error: 'llena' }) }).f)).toMatchObject({ ok: false, reintentar: true })
    expect(await iniciarAnalisis(S, pedido, falso({}).f)).toMatchObject({ ok: false, reintentar: true })
  })
  it('estado: listo trae el resultado; lo que no tiene forma queda en null (no se inventa)', async () => {
    const resultado = { palabras: [{ text: 'hola', start: 0.2, end: 0.5 }], inicio_de_voz: 0.2, motor: 'whisper', golpes: [0.5, 'x', 1], bpm: 120, confianza: 'high', avisos: ['a', 3] }
    const { f, llamadas } = falso({ [`/analisis/${id}`]: () => jsonR(200, { id, estado: 'listo', error: null, resultado }) })
    expect(await estadoDeAnalisis(S, id, f)).toEqual({ ok: true, estado: 'listo', error: null, resultado: { ...resultado, golpes: [0.5, 1], avisos: ['a'] } })
    expect(llamadas[0]).toMatchObject({ url: `https://render.test/analisis/${id}`, metodo: 'GET', llave: 'k-1' })
    const raro = { palabras: 'no', inicio_de_voz: 'x', motor: 1, golpes: null, bpm: 'r', confianza: 'alta', avisos: null }
    expect(await estadoDeAnalisis(S, id, falso({ [`/analisis/${id}`]: () => jsonR(200, { estado: 'listo', resultado: raro }) }).f)).toEqual({ ok: true, estado: 'listo', error: null, resultado: { palabras: null, inicio_de_voz: null, motor: null, golpes: null, bpm: null, confianza: null, avisos: [] } })
  })
  it('estado: en fila sin resultado; listo sin resultado o estado raro = error; 404 no se reintenta', async () => {
    expect(await estadoDeAnalisis(S, id, falso({ [`/analisis/${id}`]: () => jsonR(200, { estado: 'rindiendo' }) }).f)).toEqual({ ok: true, estado: 'rindiendo', error: null, resultado: null })
    expect(await estadoDeAnalisis(S, id, falso({ [`/analisis/${id}`]: () => jsonR(200, { estado: 'fallido', error: 'x' }) }).f)).toEqual({ ok: true, estado: 'fallido', error: 'x', resultado: null })
    expect(await estadoDeAnalisis(S, id, falso({ [`/analisis/${id}`]: () => jsonR(200, { estado: 'listo' }) }).f)).toMatchObject({ ok: false, error: 'el análisis terminó sin resultado' })
    expect(await estadoDeAnalisis(S, id, falso({ [`/analisis/${id}`]: () => jsonR(200, { estado: 'raro' }) }).f)).toMatchObject({ ok: false })
    expect(await estadoDeAnalisis(S, id, falso({ [`/analisis/${id}`]: () => jsonR(404, { error: 'no existe' }) }).f)).toEqual({ ok: false, error: 'servicio de render 404: no existe', reintentar: false })
  })
})
