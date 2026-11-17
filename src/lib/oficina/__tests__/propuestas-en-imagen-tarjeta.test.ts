/**
 * 17-nov · propuestas también en IMAGEN · tramo 1 · lo que manda la plataforma a la tarjeta (contrato CC5 v1 §2). Pura. US$ 0.
 * Con `propuestas_imagen` (y `borrador_imagen` si existe): `familia: 'imagen'`, `clase`, cada lámina como un plano, el texto de la publicación; sin inventar nada.
 * El video no cambia: con `propuestas_video` sale lo de siempre, sin `familia`.
 */
import { describe, expect, it } from 'vitest'
import { propuestasDeLaDecision, TITULO_PROPUESTAS_IMAGEN, DESTRABA_PROPUESTAS_IMAGEN } from '../../direccion/decisiones-propuestas'
import { laminasDeLaTraduccion, traducirPropuestasDeImagen } from '../mesa/propuestas-imagen'
import type { Traduccion } from '../mesa/traductor'

const ENC = { id: 'enc-1', brief_id: 'F1-S1-ig-r1' }
const PASOS = [{ clave: 'aprobar_propuestas', tipo: 'codigo', funcion: 'aprobar_propuestas', vuelve_a: { paso: 'mesa', max: 2 } }]
const POST = (n: number, nombre: string, imagen = 'foto:f-01') => [
  `# Propuesta ${n} · ${nombre}`,
  'Concepto: el plato de cerca · Por qué: el plato vende solo',
  '## Pieza', 'Sobre-título: Hoy en la casa', `Título: ${nombre}`, 'Llamado: Escríbenos', 'Qué se ve: el plato sobre la mesa de madera', `Imagen: ${imagen}`,
  '## Pie', 'Hoy te esperamos.',
  '## Etiquetas', '#platodeldia',
].join('\n')
const propuestasImagen = () => {
  const r = traducirPropuestasDeImagen([POST(1, 'El plato de hoy'), POST(2, 'La olla', 'generar: la olla humeando'), POST(3, 'La mesa')].join('\n'), 'post', { objetivo: 3, ronda: 1 })
  if (!r.ok) throw new Error(r.motivo)
  return r.resultado
}
const motor = (artefactos: Record<string, unknown>, vueltas: Record<string, number> = {}) => ({ artefactos: Object.fromEntries(Object.entries(artefactos).map(([k, v]) => [k, { version: 1, datos: v }])), vueltas })

describe('la tarjeta de propuestas en imagen (contrato §2)', () => {
  it('🔴 familia imagen + clase; cada lámina es un plano con desde/hasta/dice/producto null, texto en pantalla unido, foto propia marcada; sin borrador, sin imágenes', () => {
    const d = propuestasDeLaDecision(ENC, motor({ propuestas_imagen: propuestasImagen() }), PASOS)!
    expect(d).toMatchObject({ encargo_id: 'enc-1', brief_id: 'F1-S1-ig-r1', ronda: 1, quedan_vueltas: 2, familia: 'imagen', clase: 'post_img' })
    expect(d.lista.map((p) => [p.id, p.nombre, p.segundos, p.video_url])).toEqual([['P1', 'El plato de hoy', null, null], ['P2', 'La olla', null, null], ['P3', 'La mesa', null, null]])
    expect(d.lista[0].planos).toEqual([{ n: 1, desde: null, hasta: null, foto_propia: true, rol: 'pieza', dice: null, se_ve: 'el plato sobre la mesa de madera', texto_en_pantalla: 'Hoy en la casa\nEl plato de hoy\nEscríbenos', producto: null, imagen_url: null, imagenes: [] }])
    expect(d.lista[1].planos[0].foto_propia).toBe(false)
    expect(d.lista[0].texto_de_la_publicacion).toEqual({ texto_base: null, pie_de_foto: 'Hoy te esperamos.', hashtags: ['#platodeldia'], llamado: 'Escríbenos' })
    expect(d.lista[0]).toMatchObject({ concepto: 'el plato de cerca', por_que: 'el plato vende solo', costo: { borrador_usd: null, final_usd: null } })
  })
  it('🔴 con borrador_imagen: png_url manda; sin png, imagen_url; el costo del borrador por propuesta', () => {
    const bi = { propuestas: [
      { id: 'P1', costo_usd: 0.02, laminas: [{ n: 1, png_url: 'https://x/p1.png', imagen_url: 'https://x/p1.jpg' }] },
      { id: 'P2', laminas: [{ n: 1, imagen_url: 'https://x/p2.jpg' }] },
    ] }
    const d = propuestasDeLaDecision(ENC, motor({ propuestas_imagen: propuestasImagen(), borrador_imagen: bi }), PASOS)!
    expect(d.lista[0].planos[0]).toMatchObject({ imagen_url: 'https://x/p1.png', imagenes: ['https://x/p1.png'] })
    expect(d.lista[1].planos[0]).toMatchObject({ imagen_url: 'https://x/p2.jpg', imagenes: ['https://x/p2.jpg'] })
    expect(d.lista[2].planos[0]).toMatchObject({ imagen_url: null, imagenes: [] })
    expect(d.lista.map((p) => p.costo?.borrador_usd ?? null)).toEqual([0.02, null, null])
  })
  it('🔴 v6 · con 2 láminas, CADA una muestra SU borrador (se busca por n, nunca el de la primera para todas)', () => {
    const r = traducirPropuestasDeImagen(['# Propuesta 1 · Dos láminas', '## Lámina 1 · hook', 'Título: uno', 'Imagen: generar: el plato', '## Lámina 2 · cta', 'Título: dos', 'Llamado: Escríbenos', 'Imagen: foto:f-01', '# Propuesta 2 · Otra', '## Lámina 1 · hook', 'Título: tres', 'Imagen: ninguna', '## Lámina 2 · cta', 'Título: cuatro', 'Imagen: ninguna'].join('\n'), 'carrusel', { objetivo: 2 })
    if (!r.ok) throw new Error(r.motivo)
    // el borrador viene en OTRO orden que las láminas: el de la 2 primero
    const bi = { propuestas: [{ id: 'P1', laminas: [{ n: 2, png_url: 'https://x/p1-l2.png' }, { n: 1, png_url: 'https://x/p1-l1.png' }] }] }
    const d = propuestasDeLaDecision(ENC, motor({ propuestas_imagen: r.resultado, borrador_imagen: bi }), PASOS)!
    expect(d.lista[0].planos.map((p) => [p.n, p.imagen_url])).toEqual([[1, 'https://x/p1-l1.png'], [2, 'https://x/p1-l2.png']])
  })
  it('🔴 «Qué se ve» sin imagen: la lámina «ninguna» con dirección visual la muestra (se_ve presente, foto ausente)', () => {
    // la forma que deja el traductor con el arreglo de CC3 (#1126): «ninguna» conserva su concepto
    const tr = { ok: true, avisos: [], imagenes: [{ ref: 'hook', modo: 'ninguna', concepto: { que_se_ve: 'la mesa vacía al amanecer' } }], laminas: [{ rol: 'hook', headline: 'uno' }] } as unknown as Traduccion
    expect(laminasDeLaTraduccion('carrusel', tr)).toEqual([{ n: 1, rol: 'hook', headline: 'uno', se_ve: 'la mesa vacía al amanecer' }])
    // sin concepto, ausente (nada se inventa)
    const sin = { ...tr, imagenes: [{ ref: 'hook', modo: 'ninguna' }] } as unknown as Traduccion
    expect(laminasDeLaTraduccion('carrusel', sin)[0].se_ve).toBeUndefined()
  })
  it('una url que no es http no pasa (nada se inventa ni se muestra roto)', () => {
    const bi = { propuestas: [{ id: 'P1', laminas: [{ n: 1, png_url: 'oficina/p1.png' }] }] }
    expect(propuestasDeLaDecision(ENC, motor({ propuestas_imagen: propuestasImagen(), borrador_imagen: bi }), PASOS)!.lista[0].planos[0].imagenes).toEqual([])
  })
  it('las vueltas con la MISMA regla del motor: gastadas → 0; sin paso de aprobación en la plantilla → 0', () => {
    expect(propuestasDeLaDecision(ENC, motor({ propuestas_imagen: propuestasImagen() }, { aprobar_propuestas: 2 }), PASOS)!.quedan_vueltas).toBe(0)
    expect(propuestasDeLaDecision(ENC, motor({ propuestas_imagen: propuestasImagen() }), null)!.quedan_vueltas).toBe(0)
  })
  it('🔴 el video no cambia: con propuestas_video no sale familia ni clase', () => {
    const pv = { ronda: 1, avisos: [], propuestas: [{ id: 'P1', nombre: 'El vapor', segundos: 12, guion: { segundos: 12, planos: [{ n: 1, desde: 0, hasta: 3, se_ve: 'vapor' }] } }] }
    const d = propuestasDeLaDecision(ENC, motor({ propuestas_video: pv, propuestas_imagen: propuestasImagen() }), PASOS)!
    expect(d.familia).toBeUndefined()
    expect(d.clase).toBeUndefined()
    expect(d.lista[0].planos[0]).toMatchObject({ desde: 0, hasta: 3 })
  })
  it('sin propuestas de ninguna clase: null (no hay tarjeta)', () => {
    expect(propuestasDeLaDecision(ENC, motor({}), PASOS)).toBeNull()
  })
  it('los textos de la decisión de imagen son los del contrato', () => {
    expect(TITULO_PROPUESTAS_IMAGEN).toBe('Propuestas de la pieza: elige una')
    expect(DESTRABA_PROPUESTAS_IMAGEN).toBe('Al aprobar se fabrica la propuesta elegida en calidad final dentro del tope del encargo. Si pides cambios, la mesa corrige y vuelve a presentar.')
  })
})
