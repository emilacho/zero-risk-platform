/**
 * 18-nov · GO Lenovo «los creativos ven las fotos» (firma de Emilio 14:16) · parte de CC4: imágenes clave y video.
 * El caso real (ingeniería inversa del reel de Olón, CC7): en la Propuesta 3, plano 2, el generador recibió SOLO palabras («a generated skeleton character…»)
 * aunque la foto del personaje estaba en el material (`8abc6e54`, el esqueleto del sitio; `3b215a19`, el mural del local). Salió un esqueleto inventado.
 * Ahora la imagen clave de cada plano lleva su foto, las otras que nombra y las de sus personajes, y el prompt dice qué es cada una. Sin foto ni marca de
 * «creación nueva», el prompt pide un diseño nuevo, no uno «real». El formato es el de CC2 (PLAN-CC2 punto 3). Agnóstico. US$ 0 · sin red.
 */
import { describe, expect, it } from 'vitest'
import { traducirGuion } from '../video/guion'
import { MAX_FOTOS_POR_IMAGEN as MAX_IMG, cuerpoDeEdicion, promptDeEdicionConVarias } from '../../imagen-sobre-foto'
import { fotosDelPlano, pedidosDeImagenClave, type PlanoDeLaHoja } from '../video/imagen-clave'

const URL = (id: string) => `https://x.supabase.co/storage/v1/object/public/fotos/${id}.jpg`
const PROPIAS = ['a7512c1c', '8abc6e54', '3b215a19', 'f00dcafe'].map((id) => ({ id, url: URL(id) }))

/** la Propuesta 3 de Olón, escrita con el formato nuevo de la mesa */
const P3 = [
  '## Personajes',
  '- El Náufrago: esqueleto con ropa surfer hawaiana y sombrero, personaje de la marca · Fotos: foto:8abc6e54, foto:3b215a19',
  '- La gaviota: ave que roba un chifle · creación nueva · basada en foto:f00dcafe',
  '## Plano 1 · 0–2 s', 'Rol: captar', 'Se ve: la sombra del sombrero sobre la mesa', 'Foto: ninguna',
  '## Plano 2 · 2–5 s', 'Rol: giro', 'Se ve: el Náufrago mira el bowl de encebollado', 'Producto: sí',
  'Foto: foto:a7512c1c · es el encebollado real', 'Personajes: El Náufrago',
  'Prompt de imagen: Medium shot of the skeleton character beside a bowl of encebollado on a coastal terrace',
  '## Plano 3 · 5–8 s', 'Rol: ambiente', 'Se ve: la gaviota se lleva un chifle', 'Personajes: La gaviota',
  '## Plano 4 · 8–12 s', 'Rol: conclusión', 'Se ve: el bowl y el mar', 'Foto: foto:a7512c1c, foto:f00dcafe · el plato y la terraza', 'Personajes: El Pirata',
  '## Personaje · El Pirata', 'Descripción: un pirata con parche',
].join('\n')

const hoja = () => {
  const g = traducirGuion(P3)
  expect(g.ok).toBe(true)
  return g
}

describe('1 · la hoja: varias fotos por plano y personajes «creación nueva» (formato de CC2)', () => {
  it('«Foto: foto:a, foto:b · por qué» → la 1.ª es la del plano y las demás viajan detrás; «por qué» no se lee como foto', () => {
    const g = hoja()
    expect(g.planos[1]).toMatchObject({ foto_id: 'a7512c1c', personajes: ['el-naufrago'] })
    expect(g.planos[1].fotos_extra).toBeUndefined()
    expect(g.planos[3]).toMatchObject({ foto_id: 'a7512c1c', fotos_extra: ['f00dcafe'] })
    expect(g.planos[0].foto_id).toBeUndefined()
  })
  it('el personaje real trae sus fotos; el de «creación nueva» lleva la marca, su base de estilo y la descripción sin la marca', () => {
    const g = hoja()
    expect(g.personajes?.find((x) => x.id === 'el-naufrago')).toMatchObject({ fotos_ids: ['8abc6e54', '3b215a19'] })
    expect(g.personajes?.find((x) => x.id === 'el-naufrago')?.creacion_nueva).toBeUndefined()
    const gav = g.personajes?.find((x) => x.id === 'la-gaviota')
    expect(gav).toMatchObject({ creacion_nueva: true, fotos_ids: ['f00dcafe'] })
    expect(gav?.descripcion).toBe('ave que roba un chifle')
  })
})

describe('2 · la imagen clave de cada plano lleva sus fotos reales, en orden, y el prompt dice qué es cada una', () => {
  const pedidos = () => {
    const g = hoja()
    return pedidosDeImagenClave({ planos: g.planos as PlanoDeLaHoja[], aptas: PROPIAS, proporcion: '9:16', personajes: g.personajes, propias: PROPIAS }).pedidos
  }
  it('🔑 el caso real · plano 2 de la P3: base = el encebollado, y detrás LAS DOS fotos del Náufrago (antes: el esqueleto salía solo de palabras)', () => {
    const p2 = pedidos().find((x) => x.n === 2)!
    expect(p2.foto?.id).toBe('a7512c1c')
    expect(p2.otras_fotos?.map((f) => f.id)).toEqual(['8abc6e54', '3b215a19'])
    expect(p2.prompt).toContain('Image 1 is the real photo chosen for this shot.')
    expect(p2.prompt).toContain('Image 2 is the reference of the real character «El Náufrago»')
    expect(p2.prompt).toContain('Image 3 is the reference of the real character «El Náufrago»')
    expect(p2.personajes_sin_foto).toBeUndefined()
  })
  it('un plano sin foto propia con un personaje: la foto del personaje pasa a ser la base (la imagen 1)', () => {
    const p3 = pedidos().find((x) => x.n === 3)!
    expect(p3.foto?.id).toBe('f00dcafe')
    expect(p3.otras_fotos).toBeUndefined()
    expect(p3.prompt).toContain('Image 1 is only a STYLE base for «La gaviota», a NEW character created for this piece: not an existing one.')
  })
  it('sin foto ni marca: el prompt pide diseñarlo nuevo y no presentarlo como uno que ya existe; queda anotado', () => {
    const p4 = pedidos().find((x) => x.n === 4)!
    expect(p4.otras_fotos?.map((f) => f.id)).toEqual(['f00dcafe'])
    expect(p4.prompt).toContain('Image 2 is another real element of the client that this shot shows')
    expect(p4.prompt).toContain('«El Pirata» (un pirata con parche): there is no photo of this character, so design it new from this description and do not present it as an existing character of the brand.')
    expect(p4.personajes_sin_foto).toEqual(['El Pirata'])
  })
  it('segunda opinión de GPT: el envoltorio fijo no lleva «premium» (ni otro adjetivo de marca) en ningún prompt', () => {
    for (const p of pedidos()) { expect(p.prompt).not.toMatch(/premium/i); expect(p.prompt_cierre ?? '').not.toMatch(/premium/i) }
    expect(pedidos()[0].prompt).toContain('Photographic and realistic. A pose or moment that can continue in motion.')
  })
  it('el plano de siempre (sin personajes ni extras) no cambia: sin «Reference images», sin otras fotos', () => {
    const p1 = pedidos().find((x) => x.n === 1)!
    expect(p1.prompt).not.toContain('Reference images')
    expect(p1.otras_fotos).toBeUndefined()
    expect(p1.foto).toBeNull()
  })
  it('el cuadro de cierre de un plano largo lleva la misma explicación de las fotos', () => {
    const g = traducirGuion(['## Personajes', '- Ana: la cocinera · Fotos: foto:3b215a19', '## Plano 1 · 0–5 s', 'Se ve: Ana sirve', 'Movimiento: se acerca', 'Personajes: Ana'].join('\n'))
    const [p] = pedidosDeImagenClave({ planos: g.planos as PlanoDeLaHoja[], aptas: PROPIAS, proporcion: '9:16', personajes: g.personajes, propias: PROPIAS }).pedidos
    expect(p.prompt_cierre).toContain('Image 1 is the reference of the real character «Ana»')
  })
})

describe('3 · fotosDelPlano: cada foto una vez, solo propias con dirección, con tope', () => {
  it('una foto repetida (la del plano y la del personaje) va una sola vez; una que no es propia se salta', () => {
    const r = fotosDelPlano({ personajes: ['x'], fotos_extra: ['no-existe', 'a7512c1c'] }, PROPIAS[0], [{ id: 'x', nombre: 'X', fotos_ids: ['a7512c1c', '8abc6e54'] }], PROPIAS)
    expect([r.base?.id, ...r.otras.map((f) => f.id)]).toEqual(['a7512c1c', '8abc6e54'])
    expect(r.sin_foto).toEqual([])
  })
  it('el personaje cuya única foto ya es la del plano no queda como «sin foto»', () => {
    const r = fotosDelPlano({ personajes: ['x'] }, PROPIAS[0], [{ id: 'x', nombre: 'X', fotos_ids: ['a7512c1c'] }], PROPIAS)
    expect(r.sin_foto).toEqual([])
  })
  it(`no pasa de ${MAX_IMG} fotos con la base`, () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ({ id: `foto${String(i).padStart(3, '0')}`, url: URL(`f${i}`) }))
    const r = fotosDelPlano({ fotos_extra: muchas.map((f) => f.id) }, muchas[0], [], muchas)
    expect(1 + r.otras.length).toBe(MAX_IMG)
    expect(MAX_IMG).toBe(16)
  })
})

describe('4 · el envío a la edición: una foto como siempre; varias, todas en orden como image[]', () => {
  const foto = (n: number) => ({ bytes: Buffer.from([0xff, 0xd8, 0xff, n]), tipo: 'image/jpeg' })
  it('una sola: el campo «image» y el prompt de siempre', () => {
    const f = cuerpoDeEdicion({ prompt: 'p', model: 'm', size: '1024x1536', quality: 'low', foto: foto(1) })
    expect(f.getAll('image')).toHaveLength(1)
    expect(f.getAll('image[]')).toHaveLength(0)
    expect(String(f.get('prompt'))).toContain("Use the attached photo of the client's real product as the base of the image.")
  })
  it('varias: «image[]» con la base primero y el prompt que manda conservar cada elemento real', () => {
    const f = cuerpoDeEdicion({ prompt: 'p', model: 'm', size: '1024x1536', quality: 'low', foto: foto(1), otras: [foto(2), foto(3)] })
    const imgs = f.getAll('image[]') as File[]
    expect(imgs.map((x) => x.name)).toEqual(['referencia-1.jpg', 'referencia-2.jpg', 'referencia-3.jpg'])
    expect(f.getAll('image')).toHaveLength(0)
    expect(String(f.get('prompt'))).toBe(promptDeEdicionConVarias('p', 3))
    expect(promptDeEdicionConVarias('p', 3)).toContain('must look exactly as it does in its photo')
  })
  it(`nunca más de ${MAX_IMG} imágenes`, () => {
    const f = cuerpoDeEdicion({ prompt: 'p', model: 'm', size: 's', quality: null, foto: foto(0), otras: Array.from({ length: 40 }, (_, i) => foto(i)) })
    expect(f.getAll('image[]')).toHaveLength(MAX_IMG)
  })
})
