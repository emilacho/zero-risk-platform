/**
 * Sprint 3 · T5 tramo 3 · el armado PURO del video compuesto (`video/composicion-del-video.ts`): los segundos de cada texto salen de los cortes
 * reales, el remate va una sola vez (en el cierre), sin marca no hay cierre, sin diseño no se compone, y los subtítulos van solo si llegan.
 * El pedido se pasa por `htmlDeVideo` de verdad (la plantilla de CC2), para que lo armado sea un documento que la plantilla acepta.
 */
import { describe, expect, it } from 'vitest'
import { armarVideoCompuesto, medidasDelVideo, type EntradaDelVideoCompuesto } from '../video/composicion-del-video'
import { disenoDeAnuncio } from '../composicion'
import { traducirGuion, leerSubtitulos } from '../video/guion'
import { convencionDelGuion } from '../mesa/pedidos'
import { parametrosDelVideo } from '../video/propuestas'
import { htmlDeVideo, capasDeTexto, SEGUNDOS_DE_CIERRE } from '../../../../packages/carousel-engine/src/video-html'

const diseno = disenoDeAnuncio({ colors: { primary: '#1d4ed8' }, fonts: { family: 'Inter' } }, 'semilla')
const LOGO = 'data:image/png;base64,iVBORw0KGgo='
const base = (o: Partial<EntradaDelVideoCompuesto> = {}): EntradaDelVideoCompuesto => ({
  planos: [
    { n: 1, texto_en_pantalla: 'Abre el sábado', rol: 'gancho' },
    { n: 2, texto_en_pantalla: '', rol: 'desarrollo' },
    { n: 3, texto_en_pantalla: 'Reserva hoy', rol: 'llamado' },
  ],
  clips: [{ n: 1, cortar_a_s: 4 }, { n: 2, cortar_a_s: 3.5 }, { n: 3, cortar_a_s: 4 }],
  relacion: '9:16', resolucion: '720p', nombre_del_video: 'video-unido-1.mp4',
  logo: LOGO, firma: '@marca', diseno, subtitulos: null,
  ...o,
})

describe('medidas del video (lado corto = resolución, como el unidor)', () => {
  it('9:16 a 720p → 720×1280 · 16:9 a 1080p → 1920×1080 · 1:1 → cuadrado · lo raro cae a 9:16', () => {
    expect(medidasDelVideo('9:16', '720p')).toEqual({ ancho: 720, alto: 1280 })
    expect(medidasDelVideo('16:9', '1080p')).toEqual({ ancho: 1920, alto: 1080 })
    expect(medidasDelVideo('1:1', '480p')).toEqual({ ancho: 480, alto: 480 })
    expect(medidasDelVideo('4:5', '720p')).toEqual({ ancho: 720, alto: 900 })
    expect(medidasDelVideo('raro', 'raro')).toEqual({ ancho: 720, alto: 1280 })
  })
})

describe('armarVideoCompuesto', () => {
  it('🔴 los segundos de cada texto salen de los CORTES REALES, en el orden de los clips; el plano sin texto no pone capa', () => {
    const a = armarVideoCompuesto(base({ planos: [{ n: 1, texto_en_pantalla: 'Uno' }, { n: 2, texto_en_pantalla: 'Dos' }, { n: 3, texto_en_pantalla: '' }] }))
    if (!a.ok) throw new Error(a.motivo)
    expect(a.pedido.segundos).toBe(11.5)
    expect(a.pedido.textos).toEqual([{ desde: 0, hasta: 4, texto: 'Uno' }, { desde: 4, hasta: 7.5, texto: 'Dos' }])
  })
  it('🔴 el remate (último plano «llamado» o «conclusión») va UNA vez: en el cierre, con el logo; no encima del plano', () => {
    const a = armarVideoCompuesto(base())
    if (!a.ok) throw new Error(a.motivo)
    expect(a.pedido.textos.map((t) => t.texto)).toEqual(['Abre el sábado'])
    expect(a.pedido.cierre).toEqual({ titular: 'Reserva hoy', desde: 11.5 - SEGUNDOS_DE_CIERRE })
    expect(a.pedido.logo).toBe(LOGO)
    expect(a.pedido.firma).toBeNull()
    expect(a).toMatchObject({ textos: 1, con_cierre: true, avisos: [] })
  })
  it('el último plano que NO es remate deja su texto en el plano y el cierre va solo con la marca', () => {
    const a = armarVideoCompuesto(base({ planos: [{ n: 1, texto_en_pantalla: 'A' }, { n: 2 }, { n: 3, texto_en_pantalla: 'Final', rol: 'giro' }] }))
    if (!a.ok) throw new Error(a.motivo)
    expect(a.pedido.textos.map((t) => t.texto)).toEqual(['A', 'Final'])
    expect(a.pedido.cierre).toEqual({ desde: 11.5 - SEGUNDOS_DE_CIERRE })
  })
  it('sin logo, la firma de la marca · sin logo NI firma, no hay cierre (y el remate queda en su plano) + aviso', () => {
    const f = armarVideoCompuesto(base({ logo: null }))
    if (!f.ok) throw new Error(f.motivo)
    expect(f.pedido).toMatchObject({ logo: null, firma: '@marca' })
    const n = armarVideoCompuesto(base({ logo: null, firma: '  ' }))
    if (!n.ok) throw new Error(n.motivo)
    expect(n.pedido.cierre).toBeNull()
    expect(n.pedido.textos.map((t) => t.texto)).toEqual(['Abre el sábado', 'Reserva hoy'])
    expect(n.avisos).toEqual([expect.stringMatching(/sin cierre de marca/)])
  })
  it('🔴 sin diseño de la marca NO se compone (el video unido sale como está) · nombre de video inválido o sin clips, tampoco', () => {
    expect(armarVideoCompuesto(base({ diseno: null }))).toMatchObject({ ok: false, motivo: expect.stringMatching(/identidad visual/) })
    expect(armarVideoCompuesto(base({ nombre_del_video: '../x.mp4' }))).toMatchObject({ ok: false })
    expect(armarVideoCompuesto(base({ clips: [{ n: 1, cortar_a_s: 0 }] }))).toMatchObject({ ok: false })
  })
  it('🔴 los subtítulos van solo si llegan con grupos; vacío o null = el pedido no los trae', () => {
    const g = [{ desde: 0.1, hasta: 1, palabras: [{ texto: 'hola', desde: 0.1, hasta: 1 }] }]
    const con = armarVideoCompuesto(base({ subtitulos: g }))
    const vacio = armarVideoCompuesto(base({ subtitulos: [] }))
    const sin = armarVideoCompuesto(base())
    if (!con.ok || !vacio.ok || !sin.ok) throw new Error('debía armar')
    expect(con.pedido.subtitulos).toEqual(g)
    expect('subtitulos' in vacio.pedido).toBe(false)
    expect('subtitulos' in sin.pedido).toBe(false)
  })
  it('el pedido es un documento que la plantilla de CC2 acepta: el texto se escapa y las capas caen antes del cierre', () => {
    const a = armarVideoCompuesto(base({ planos: [{ n: 1, texto_en_pantalla: '<b>2x1</b>' }, { n: 2 }, { n: 3, texto_en_pantalla: 'Reserva hoy', rol: 'llamado' }] }))
    if (!a.ok) throw new Error(a.motivo)
    const html = htmlDeVideo(a.pedido, [])
    expect(html).toContain('&lt;b&gt;2x1&lt;/b&gt;')
    expect(html).not.toContain('<b>2x1</b>')
    expect(html).toContain('Reserva hoy')
    expect(capasDeTexto(a.pedido).every((c) => c.hasta <= a.pedido.segundos)).toBe(true)
  })
})

describe('los subtítulos los pide la mesa en el guion (sección «## Subtítulos»)', () => {
  const hoja = (extra: string[]) => ['## Plano 1 · 0–4 s', 'Se ve: la puerta del local', '## Plano 2 · 4–8 s', 'Se ve: el mostrador', '## Audio', 'voz en off', ...extra].join('\n')
  it('🔴 sin la sección no van (nunca por defecto) · con «no» tampoco', () => {
    expect(traducirGuion(hoja([]), {}).subtitulos).toBeUndefined()
    expect(traducirGuion(hoja(['## Subtítulos', 'no']), {}).subtitulos).toBeUndefined()
    expect('subtitulos' in traducirGuion(hoja([]), {})).toBe(false)
  })
  it('🔴 «sí» los pide con la energía escrita; sin energía, conversación; con tilde y negritas también', () => {
    expect(traducirGuion(hoja(['## Subtítulos', 'sí · Energía: alta']), {}).subtitulos).toEqual({ energia: 'alta' })
    expect(traducirGuion(hoja(['## Subtitulos', 'si']), {}).subtitulos).toEqual({ energia: 'conversacion' })
    expect(leerSubtitulos(['**Sí** · energía: calma'])).toEqual({ energia: 'calma' })
    expect(leerSubtitulos(['tal vez · energía: alta'])).toBeUndefined()
  })
  it('🔴 (ajuste 5 de CC7) apagado, la hoja que recibe la mesa es la de hoy LETRA POR LETRA; con `componer`, solo se suman las 2 líneas de subtítulos', () => {
    const v = { segundos_min: 6, segundos_max: 15, propuestas: 1 }
    const apagada = convencionDelGuion(v)
    expect(apagada).not.toMatch(/Subt[ií]tulos/)
    expect(apagada).toContain(['## Audio', '<lo que suena: música, ambiente, voz, diálogo o locución, lo que pida la pieza>', '## Pie'].join('\n'))
    expect(convencionDelGuion({ ...v, componer: false })).toBe(apagada)
    const encendida = convencionDelGuion({ ...v, componer: true })
    const lineas = ['## Subtítulos   (opcional: solo si la pieza tiene voz y los quieres; si no, no escribas esta sección)', 'sí · Energía: alta | conversacion | calma · Idioma: <el de la voz, en dos letras: es, en, pt…>']
    expect(encendida).toContain(['<lo que suena: música, ambiente, voz, diálogo o locución, lo que pida la pieza>', ...lineas, '## Pie'].join('\n'))
    expect(encendida.replace(lineas.join('\n') + '\n', '')).toBe(apagada)
    // con varias propuestas, igual
    expect(convencionDelGuion({ ...v, propuestas: 2 })).not.toMatch(/Subt[ií]tulos/)
    expect(convencionDelGuion({ ...v, propuestas: 2, componer: true })).toMatch(/## Subtítulos/)
  })
  it('🔴 la plantilla dice si compone: solo `componer: true` (booleano) lo enciende', () => {
    const pl = (componer: unknown) => ({ limites: { video: { componer } } }) as never
    expect(parametrosDelVideo(pl(true))).toMatchObject({ componer: true })
    for (const x of [false, 'true', 1, undefined]) expect('componer' in parametrosDelVideo(pl(x))).toBe(false)
  })
  it('🔴 (ajuste 6 de CC7) el idioma de la voz lo escribe la mesa · sin él, no se inventa uno (queda vacío y el motor avisa)', () => {
    expect(leerSubtitulos(['sí · Energía: calma · Idioma: en'])).toEqual({ energia: 'calma', idioma: 'en' })
    expect(leerSubtitulos(['si · idioma: PT'])).toEqual({ energia: 'conversacion', idioma: 'pt' })
    expect(leerSubtitulos(['sí · Energía: alta'])).toEqual({ energia: 'alta' })
    expect(leerSubtitulos(['sí · Idioma: <el de la voz, en dos letras: es, en, pt…>'])).toEqual({ energia: 'conversacion' })
  })
})
