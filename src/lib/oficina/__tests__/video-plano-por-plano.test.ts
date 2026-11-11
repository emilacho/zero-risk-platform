/**
 * 11-nov · GO Lenovo 16:43 (Emilio, camino B) · el video de varios planos se pide PLANO POR PLANO: cada plano con su foto propia (imagen a video) o desde su texto,
 * con la duración del guion (mínimo 4 s por plano; si pide menos, se genera de 4 y se corta al unir). Un cliente con fotos y uno sin fotos.
 */
import { describe, expect, it } from 'vitest'
import { armarPedidoDePlano, cuerpoParaHiggsfield, rutaDelModelo, DURACION_MIN_PLANO_S, DURACION_MAX_PLANO_S, MODELO_APROBADO, REGLAS_DEL_PEDIDO } from '../../video/parametros'
import { pedidosPorPlano, promptDelPlano, segundosDelVideoUnido, segundosGenerados } from '../video/planos'
import type { Plano } from '../video/guion'
import type { FotoEtiquetada } from '../fotos'

const brief = { formato: 'reel', red: 'Instagram' }
const U = (x: string) => `https://almacen.example/fotos/${x}.jpg`
const fotosConFotos: FotoEtiquetada[] = [
  { id: '9f71b0e9-aaaa-4bbb-8ccc-000000000001', url: U('fachada'), origen: 'propia' },
  { id: '6275c0ba-aaaa-4bbb-8ccc-000000000002', url: U('olla'), origen: 'propia' },
  { id: 'c0355f3d-aaaa-4bbb-8ccc-000000000003', url: U('bowl'), origen: 'propia' },
  { id: 'competencia-1', url: U('ajena'), origen: 'competencia' },
]
// el guion de W47 (12 s, 4 planos; el cierre dura 2 s)
const planosW47: Plano[] = [
  { n: 1, desde: 0, hasta: 3, se_ve: 'Fachada de Olón al amanecer', foto_id: '9f71b0e9-aaaa-4bbb-8ccc-000000000001' },
  { n: 2, desde: 3, hasta: 7, se_ve: 'Olla hirviendo con mano enguantada', movimiento: 'cenital lento', foto_id: '6275c0ba-aaaa-4bbb-8ccc-000000000002' },
  { n: 3, desde: 7, hasta: 10, se_ve: 'Cenital del bowl recién servido', foto_id: 'c0355f3d-aaaa-4bbb-8ccc-000000000003' },
  { n: 4, desde: 10, hasta: 12, se_ve: 'Pergamino sobre púrpura', texto_en_pantalla: 'vine buscando oro. encontré encebollado.', foto_id: 'no-existe-0000' },
]
const guion = { planos: planosW47, audio: 'olas y guitarra suave' }

describe('un pedido por plano (cliente con fotos)', () => {
  const r = pedidosPorPlano({ guion, brief, fotos: fotosConFotos, clave: 'enc:brief:v1', relacion: '9:16' })
  if (!r.ok) throw new Error(r.errores.join(' · '))
  const ps = r.pedidos

  it('sale un pedido por plano, en el orden del guion, con su clave propia', () => {
    expect(ps.map((p) => p.n)).toEqual([1, 2, 3, 4])
    expect(ps.map((p) => p.clave)).toEqual(['enc:brief:v1:p1', 'enc:brief:v1:p2', 'enc:brief:v1:p3', 'enc:brief:v1:p4'])
  })
  it('cada plano lleva SOLO su foto propia', () => {
    expect(ps.map((p) => p.fotos)).toEqual([[U('fachada')], [U('olla')], [U('bowl')], []])
  })
  it('un plano que cita una foto inexistente sale desde su texto y lo declara', () => {
    expect(ps[3].fotos).toEqual([])
    expect(ps[3].foto_no_hallada).toBe('no-existe-0000')
    expect(ps.slice(0, 3).map((p) => p.foto_no_hallada)).toEqual([null, null, null])
  })
  it('la duración es la del plano; menos de 4 s se pide de 4 y se corta al unir', () => {
    expect(ps.map((p) => p.segundos)).toEqual([4, 4, 4, 4])
    expect(ps.map((p) => p.cortar_a_s)).toEqual([3, 4, 3, 2])
    expect(segundosGenerados(ps)).toBe(16)
    expect(segundosDelVideoUnido(ps)).toBe(12)
  })
  it('el texto de cada plano habla SOLO de ese plano (más la cámara, el texto literal y el audio)', () => {
    expect(ps[1].prompt).toContain('Olla hirviendo')
    expect(ps[1].prompt).toContain('Cámara: cenital lento.')
    expect(ps[1].prompt).not.toContain('Fachada')
    expect(ps[3].prompt).toContain('«vine buscando oro. encontré encebollado.»')
    expect(ps.every((p) => p.prompt.includes('olas y guitarra suave'))).toBe(true)
  })
  it('una foto de la competencia nunca entra, aunque el guion la cite', () => {
    const r2 = pedidosPorPlano({ guion: { planos: [{ n: 1, desde: 0, hasta: 5, se_ve: 'algo', foto_id: 'competencia-1' }], audio: '' }, brief, fotos: fotosConFotos, clave: 'k' })
    expect(r2.ok && r2.pedidos[0].fotos).toEqual([])
    expect(r2.ok && r2.pedidos[0].foto_no_hallada).toBe('competencia-1')
  })
  it('acepta otro buscador de fotos (el de nombre corto)', () => {
    const r2 = pedidosPorPlano({ guion: { planos: [{ n: 1, desde: 0, hasta: 5, se_ve: 'algo', foto_id: '9f71b0e9' }], audio: '' }, brief, fotos: fotosConFotos, clave: 'k', buscarFoto: (id) => (id === '9f71b0e9' ? U('fachada') : null) })
    expect(r2.ok && r2.pedidos[0].fotos).toEqual([U('fachada')])
  })
})

describe('un pedido por plano (cliente sin fotos)', () => {
  const r = pedidosPorPlano({ guion, brief, fotos: [], clave: 'enc:brief:v1' })
  it('todos los planos salen desde su texto, sin frenar nada', () => {
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pedidos.map((p) => p.fotos)).toEqual([[], [], [], []])
    expect(r.pedidos.map((p) => rutaDelModelo({ modelo: MODELO_APROBADO, fotos: p.fotos, plano: true }))).toEqual(Array(4).fill(`${MODELO_APROBADO}/text-to-video`))
  })
})

describe('límites de un plano', () => {
  it('un plano largo hasta 30 s se pide entero; más de 30 s no se puede pedir', () => {
    const ok = pedidosPorPlano({ guion: { planos: [{ n: 1, desde: 0, hasta: 30, se_ve: 'largo' }], audio: '' }, brief, fotos: [], clave: 'k' })
    expect(ok.ok && ok.pedidos[0].segundos).toBe(30)
    const no = pedidosPorPlano({ guion: { planos: [{ n: 1, desde: 0, hasta: 31, se_ve: 'muy largo' }], audio: '' }, brief, fotos: [], clave: 'k' })
    expect(no.ok).toBe(false)
  })
  it('un guion sin planos no arma pedidos', () => {
    expect(pedidosPorPlano({ guion: { planos: [], audio: '' }, brief, fotos: [], clave: 'k' }).ok).toBe(false)
  })
  it('armarPedidoDePlano admite de 4 a 30 s enteros y como mucho una foto', () => {
    const base = { prompt: 'una toma de prueba', formato: 'reel' }
    expect(armarPedidoDePlano({ ...base, segundos: DURACION_MIN_PLANO_S }).ok).toBe(true)
    expect(armarPedidoDePlano({ ...base, segundos: DURACION_MAX_PLANO_S }).ok).toBe(true)
    expect(armarPedidoDePlano({ ...base, segundos: DURACION_MIN_PLANO_S - 1 }).ok).toBe(false)
    expect(armarPedidoDePlano({ ...base, segundos: DURACION_MAX_PLANO_S + 1 }).ok).toBe(false)
    expect(armarPedidoDePlano({ ...base, segundos: 4.5 }).ok).toBe(false)
    expect(armarPedidoDePlano({ ...base, fotos: [U('a'), U('b')] }).ok).toBe(false)
    expect(armarPedidoDePlano({ ...base, fotos: ['http://inseguro/x.jpg'] }).ok).toBe(false)
    const v = armarPedidoDePlano({ ...base, segundos: 6 })
    expect(v.ok && v.pedido.segundos).toBe(6)
  })
})

describe('el cuerpo que va al proveedor', () => {
  const ped = { prompt: 'Olla hirviendo', formato: 'reel', segundos: 4, resolucion: '720p', relacion: '9:16', modelo: MODELO_APROBADO, audio: true, fotos: [U('olla')] }
  it('un plano con foto va por imagen a video, con image_url y SIN aspect_ratio', () => {
    expect(rutaDelModelo({ ...ped, plano: true })).toBe(`${MODELO_APROBADO}/image-to-video`)
    const c = cuerpoParaHiggsfield({ ...ped, plano: true })
    expect(c.image_url).toBe(U('olla'))
    expect('aspect_ratio' in c).toBe(false)
    expect('image_urls' in c).toBe(false)
    expect(c.duration).toBe(4)
    expect(String(c.prompt)).toContain(REGLAS_DEL_PEDIDO[0])
  })
  it('un plano sin foto va por texto a video con su proporción', () => {
    const c = cuerpoParaHiggsfield({ ...ped, fotos: [], plano: true })
    expect(rutaDelModelo({ ...ped, fotos: [], plano: true })).toBe(`${MODELO_APROBADO}/text-to-video`)
    expect(c.aspect_ratio).toBe('9:16')
    expect('image_url' in c).toBe(false)
  })
  it('el video de una sola toma (camino A) sigue igual: referencia con image_urls y aspect_ratio', () => {
    expect(rutaDelModelo(ped)).toBe(`${MODELO_APROBADO}/reference-to-video`)
    const c = cuerpoParaHiggsfield(ped)
    expect(c.image_urls).toEqual([U('olla')])
    expect(c.aspect_ratio).toBe('9:16')
    expect('image_url' in c).toBe(false)
  })
})

describe('el texto de un plano', () => {
  it('sin audio en el guion, pide música o ambiente', () => {
    expect(promptDelPlano({ n: 1, desde: 0, hasta: 4, se_ve: 'algo' }, '')).toContain('música o sonido ambiente')
  })
})
