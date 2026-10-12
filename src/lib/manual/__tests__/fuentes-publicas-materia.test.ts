/** Fuentes públicas · cómo las lee el manual: reseñas (voz del público, citables), textos y videos de las redes del propio cliente (transcripción). Clientes inventados; sin modelo. */
import { describe, expect, it } from 'vitest'
import { evaluarHechos } from '../hechos'
import { fuentesDeRaspado, esFilaPropia, textosDeResenas, FUNCIONES_DE_FUENTES_PUBLICAS, type FilaDeRaspado } from '../materia'

const PROPIOS = { sitio: 'https://negocio.example', handles: ['negocio_demo'] }
const fila = (id: string, apify_function: string, respuesta: unknown[]): FilaDeRaspado => ({ id, apify_function, respuesta, ensayo: false })
const RESENAS = fila('r1', 'resenas_google_maps', [
  { name: 'Persona Privada', stars: 5, text: 'La atención fue rápida y muy amable, volvería sin dudar.' },
  { name: 'Otra Persona', stars: 2, text: 'Tardaron mucho en entregar el pedido.' },
])
const VIDEOS = fila('v1', 'videos_instagram', [{ caption: 'Pie del reel', transcript: 'Todo lo hacemos al momento y con producto del día.' }])
const FB = fila('f1', 'publicaciones_facebook', [{ text: 'Esta semana abrimos también los domingos', videoTranscript: 'bienvenidos a nuestra casa' }])

describe('cómo se clasifican', () => {
  it('toda función de fuentes públicas es del propio cliente (el plan solo pide su dirección/usuario)', () => {
    for (const f of ['resenas_google_maps', 'resenas_tripadvisor', 'publicaciones_facebook', 'videos_tiktok']) { expect(FUNCIONES_DE_FUENTES_PUBLICAS.test(f)).toBe(true); expect(esFilaPropia({ apify_function: f, params: {} }, PROPIOS)).toBe(true) }
    expect(esFilaPropia({ apify_function: 'google_maps_scraper', params: {} }, PROPIOS)).toBe(false)
  })
  it('reseñas = voz de TERCEROS (el público), canal «resenas», sin el nombre de quien opinó; videos y publicaciones = lo propio', () => {
    const f = fuentesDeRaspado([RESENAS, VIDEOS, FB], PROPIOS)
    const res = f.find((x) => x.canal === 'resenas')!
    expect(res.tipo).toBe('tercero'); expect(res.texto).toContain('atención fue rápida'); expect(res.texto).not.toMatch(/Persona Privada|Otra Persona/)
    const vid = f.find((x) => x.canal === 'instagram' && x.rol === 'cuerpo')!
    expect(vid.tipo).toBe('primaria_propia'); expect(vid.texto).toContain('producto del día'); expect(vid.rotulo).toMatch(/videos \(lo que se dice\)/)
    const fb = f.find((x) => x.canal === 'facebook')!
    expect(fb.tipo).toBe('primaria_propia'); expect(fb.texto).toContain('abrimos también los domingos'); expect(fb.texto).toContain('bienvenidos')
  })
  it('un ensayo NUNCA entra, y las tiendas de apps con reseñas anidadas se leen', () => {
    expect(fuentesDeRaspado([{ ...RESENAS, ensayo: true }], PROPIOS)).toEqual([])
    expect(textosDeResenas({ appName: 'a', reviews: [{ reviewText: 'Me sirve mucho' }, { reviewText: 'Se cierra solo' }] })).toEqual(['Me sirve mucho', 'Se cierra solo'])
    expect(textosDeResenas({ liked: 'La vista', disliked: 'El ruido' })).toEqual(['lo que gustó: La vista · lo que no: El ruido'])
  })
})

describe('el chequeo de hechos con las fuentes nuevas', () => {
  const fuentes = fuentesDeRaspado([RESENAS, VIDEOS], PROPIOS)
  const evalua = (positioning: string) => evaluarHechos({ manual: { positioning }, fuentes })
  it('«los clientes dicen: «…»» con una frase que SÍ está en una reseña → verificado (cita de una reseña pública)', () => {
    const r = evalua('Según sus reseñas, los clientes dicen: «La atención fue rápida y muy amable, volvería sin dudar».')
    const h = r.hechos.find((x) => x.marcas.includes('cita'))
    expect(h?.estado).toBe('verificado'); expect(h?.motivo).toMatch(/reseña pública/); expect(r.sin_respaldo).toEqual([])
  })
  it('una «reseña» inventada NO se verifica: sale sin cita', () => {
    const r = evalua('Los clientes dicen: «Es el mejor lugar de toda la región, sin discusión alguna».')
    expect(r.hechos.find((x) => x.marcas.includes('cita'))?.estado).toBe('sin_cita')
  })
  it('una cita sin atribución («los clientes dicen») NO se esconde tras la reseña: sigue siendo texto del manual', () => {
    const r = evalua('Es «un lugar con gente muy amable y atención rápida» según el manual.')
    expect(r.hechos.some((x) => x.estado === 'verificado' && /reseñas públicas/.test(x.fuente?.rotulo ?? ''))).toBe(false)
  })
  it('una reseña NO respalda una afirmación de certeza del cliente sobre sí mismo (solo la cita literal)', () => {
    const r = evalua('Somos el mejor restaurante certificado del país.')
    expect(r.hechos.every((x) => !/reseñas públicas/.test(x.fuente?.rotulo ?? ''))).toBe(true)
  })
  it('lo que se dice en un video propio cuenta como fuente propia (la certeza queda «afirmación del cliente»)', () => {
    const f2 = fuentesDeRaspado([fila('v2', 'videos_instagram', [{ transcript: 'Somos el mejor lugar certificado de la zona, siempre garantizado.' }])], PROPIOS)
    const r = evaluarHechos({ manual: { positioning: 'Somos el mejor lugar certificado de la zona, siempre garantizado.' }, fuentes: f2 })
    expect(r.hechos.some((x) => x.estado === 'afirmacion_del_cliente')).toBe(true)
  })
})
