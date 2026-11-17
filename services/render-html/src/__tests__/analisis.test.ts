/**
 * Sprint 3 · T5 · el análisis del sonido (CC4) · reglas puras: qué se acepta, con qué motor se transcribe (nunca el que cobra), cómo se leen los golpes
 * y cuándo el tempo es claro. Sin red, sin whisper, sin hyperframes instalados. Corre en el CI de la raíz.
 */
import { describe, expect, it } from 'vitest'
import { argumentosDeGolpes, confianzaDelTempo, GOLPES_MINIMOS_PARA_TEMPO, leerGolpes, leerTranscripcion, MODELO_DE_WHISPER, opcionesDeTranscripcion, validarPedidoDeAnalisis, VARIACION_MAXIMA_PARA_TEMPO_CLARO } from '../analisis'
import { hostsPermitidos } from '../logica'

const HOSTS = hostsPermitidos('abc.supabase.co')
const URL_OK = 'https://abc.supabase.co/storage/v1/object/public/oficina/x/unido.mp4'

describe('T5 · el pedido de análisis', () => {
  it('acepta voz, música o las dos; el idioma por omisión es español', () => {
    expect(validarPedidoDeAnalisis({ voz: { nombre: 'unido.mp4', url: URL_OK } }, HOSTS)).toEqual({ ok: true, valor: { voz: { nombre: 'unido.mp4', url: URL_OK }, musica: null, idioma: 'es' } })
    expect(validarPedidoDeAnalisis({ musica: { nombre: 'pista.mp3', url: URL_OK }, idioma: 'PT' }, HOSTS)).toMatchObject({ ok: true, valor: { voz: null, idioma: 'pt' } })
  })
  it('sin nada que analizar, con nombres iguales, idioma raro o archivo con ruta: no', () => {
    expect(validarPedidoDeAnalisis({}, HOSTS)).toMatchObject({ ok: false, error: expect.stringContaining('falta qué analizar') })
    expect(validarPedidoDeAnalisis({ voz: { nombre: 'a.mp4', url: URL_OK }, musica: { nombre: 'A.MP4', url: URL_OK } }, HOSTS)).toMatchObject({ ok: false })
    expect(validarPedidoDeAnalisis({ voz: { nombre: 'a.mp4', url: URL_OK }, idioma: 'es-EC' }, HOSTS)).toMatchObject({ ok: false, error: expect.stringContaining('idioma') })
    expect(validarPedidoDeAnalisis({ voz: { nombre: '../a.mp4', url: URL_OK } }, HOSTS)).toMatchObject({ ok: false })
    expect(validarPedidoDeAnalisis({ voz: { nombre: 'index.html', url: URL_OK } }, HOSTS)).toMatchObject({ ok: false })
  })
  it('solo baja de los hosts de la lista y por https (igual que el render)', () => {
    expect(validarPedidoDeAnalisis({ voz: { nombre: 'a.mp4', url: 'https://otro.com/a.mp4' } }, HOSTS)).toMatchObject({ ok: false, error: expect.stringContaining('no permitida') })
    expect(validarPedidoDeAnalisis({ musica: { nombre: 'a.mp3', url: 'http://abc.supabase.co/a.mp3' } }, HOSTS)).toMatchObject({ ok: false })
  })
})

describe('T5 · la transcripción', () => {
  it('motor whisper SIEMPRE (el de HeyGen cobra), modelo multilingüe fijo (nunca «.en», que traduce), sin instalar nada al correr', () => {
    const o = opcionesDeTranscripcion('/t/unido.mp4', '/t', 'es')
    expect(o).toMatchObject({ input: '/t/unido.mp4', dir: '/t', engine: 'whisper', model: 'small', language: 'es', installRuntime: false })
    expect(MODELO_DE_WHISPER).not.toMatch(/\.en$/)
    expect(o.timeoutMs).toBeGreaterThan(0)
  })
  it('lee la lista de palabras venga como lista, como {words} o como {segments:[{words}]}; si no, null', () => {
    const w = [{ text: 'hola', start: 0.2, end: 0.5 }]
    expect(leerTranscripcion(JSON.stringify(w))).toEqual(w)
    expect(leerTranscripcion(JSON.stringify({ words: w }))).toEqual(w)
    expect(leerTranscripcion(JSON.stringify({ segments: [{ words: w }, { text: 'sin palabras' }, { words: w }] }))).toEqual([...w, ...w])
    expect(leerTranscripcion('no es json')).toBeNull()
    expect(leerTranscripcion(JSON.stringify({ otra: 1 }))).toBeNull()
  })
})

describe('T5 · los golpes de la música', () => {
  it('se piden por JSON sobre el archivo', () => {
    expect(argumentosDeGolpes('pista.mp3')).toEqual(['beats', 'pista.mp3', '--json'])
  })
  it('lee golpes y tempo aunque el CLI imprima algo antes; ordena, sin repetidos ni negativos', () => {
    expect(leerGolpes('aviso\n{"ok":true,"file":"p.mp3","count":3,"bpm":120,"beatTimes":[1,0.5,1,-2,"x",1.5]}\n')).toEqual({ golpes: [0.5, 1, 1.5], bpm: 120 })
    expect(leerGolpes('{"ok":true,"bpm":null,"beatTimes":[]}')).toEqual({ golpes: [], bpm: null })
  })
  it('lo que no se entiende o no es ok: null', () => {
    expect(leerGolpes('nada')).toBeNull()
    expect(leerGolpes('{"ok":false,"error":"x"}')).toBeNull()
    expect(leerGolpes('{roto')).toBeNull()
  })
  const parejos = (n: number, paso: number) => Array.from({ length: n }, (_, i) => +(0.5 + i * paso).toFixed(3))
  it('tempo claro con 8 golpes o más y variación ≤ 10 %; menos de 8 = incierto; irregulares = bajo', () => {
    expect(GOLPES_MINIMOS_PARA_TEMPO).toBe(8)
    expect(VARIACION_MAXIMA_PARA_TEMPO_CLARO).toBe(0.1)
    expect(confianzaDelTempo(parejos(8, 0.5))).toBe('high')
    expect(confianzaDelTempo(parejos(7, 0.5))).toBe('uncertain')
    expect(confianzaDelTempo([0.5, 1, 1.9, 2.1, 3.5, 3.6, 5, 5.2])).toBe('low')
    expect(confianzaDelTempo([1, 1, 1, 1, 1, 1, 1, 1])).toBe('uncertain')
  })
  it('el borde del 10 %: intervalos 0,45/0,55 alternados (variación justo 10 %) es claro; 0,449/0,551 ya no', () => {
    const alterna = (a: number, b: number) => { const g = [1]; for (let i = 0; i < 10; i++) g.push(+(g[i] + (i % 2 ? b : a)).toFixed(3)); return g }
    expect(confianzaDelTempo(alterna(0.45, 0.55))).toBe('high')
    expect(confianzaDelTempo(alterna(0.449, 0.551))).toBe('low')
  })
})
