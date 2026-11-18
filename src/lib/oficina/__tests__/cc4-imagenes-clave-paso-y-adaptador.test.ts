/**
 * 18-nov · GO Lenovo «los creativos ven las fotos» · parte de CC4 · el camino REAL: el paso `imagenes_clave` (con la memoria que cobra) y el adaptador que
 * llama a `/api/images/generate`. Que la imagen clave de un plano lleve las fotos de sus personajes no sirve si el paso no se las pasa al puerto o si el
 * adaptador no las manda. US$ 0 · sin red (fetch falso).
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos, type Entorno } from '../adaptadores'
import { ejecutarCodigoV } from '../orquestador-video'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import type { Estado } from '../tipos'
import { PASO_IMAGENES_CLAVE, type ImagenesClave, type PlanoDeLaHoja } from '../video/imagen-clave'
import type { PersonajeDeLaHoja } from '../video/guion'
import { DbFalsa } from './dbfalsa'
import { FOTOS, crearMemoria } from './memoria'

const PASO = VIDEO_MESA.pasos.find((p) => p.clave === PASO_IMAGENES_CLAVE)!
const [PLATO, PERSONAJE_1, PERSONAJE_2] = FOTOS

function encargoConPersonaje(personajes: PersonajeDeLaHoja[], planos: PlanoDeLaHoja[]) {
  return {
    id: 'enc-1', client_id: 'cli-1', familia: 'video_mesa', dry_run: false,
    estado_del_motor: {
      ultimo: 1, pasos_ejecutados: 4, gasto_usd: 1, vueltas: {}, fichas: [],
      artefactos: {
        encargo: { version: 1, version_consumida: 1, datos: { brief: { texto: 'FILA', red: 'instagram' }, proporcion: '9:16', F: { fotos: FOTOS } } },
        propuestas_video: { version: 1, version_consumida: 0, datos: { ronda: 1, propuestas: [{ id: 'P3', nombre: 'P3', concepto: '', segundos: 5, red: 'instagram', objetivo: '', por_que: '', texto: '', guion: { planos, segundos: 5, personajes } }], citas: '', avisos: [] } },
      },
    } as unknown as Estado,
  }
}

describe('el paso imagenes_clave pasa al generador las fotos de los personajes del plano', () => {
  it('🔑 el plano con el personaje: base = la foto del plano, detrás las del personaje; el prompt dice cuál es cuál; la imagen guarda qué fotos viajaron', async () => {
    const M = crearMemoria({})
    const personajes = [{ id: 'el-personaje', nombre: 'El personaje', descripcion: 'el de la marca', fotos_ids: [PERSONAJE_1.id, PERSONAJE_2.id] }]
    const planos = [{ n: 1, desde: 0, hasta: 3, se_ve: 'el personaje mira el plato', producto: true, foto_id: PLATO.id, personajes: ['el-personaje'] }]
    const s = await ejecutarCodigoV(M.P, encargoConPersonaje(personajes, planos) as never, VIDEO_MESA, PASO)
    expect(M.llamadas.imagenFotos).toEqual([PLATO.id])
    expect(M.llamadas.imagenOtras).toEqual([[PERSONAJE_1.id, PERSONAJE_2.id]])
    expect(M.llamadas.imagenCalidades[0].prompt).toContain('Image 2 is the reference of the real character «El personaje»')
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a.propuestas![0].planos[0]).toMatchObject({ foto_referencia_id: PLATO.id, otras_referencias_ids: [PERSONAJE_1.id, PERSONAJE_2.id] })
    expect((s.res.fichas ?? []).map((f) => f.id)).toEqual([])
  })
  it('el personaje sin foto ni marca: se pide igual (nunca frena), el prompt lo dibuja nuevo y queda una sugerencia en palabras', async () => {
    const M = crearMemoria({})
    const s = await ejecutarCodigoV(M.P, encargoConPersonaje([{ id: 'x', nombre: 'El pirata', fotos_ids: [] }], [{ n: 1, desde: 0, hasta: 3, se_ve: 'el pirata', personajes: ['x'] }]) as never, VIDEO_MESA, PASO)
    expect(M.llamadas.imagen).toBe(1)
    expect(M.llamadas.imagenOtras).toEqual([[]])
    expect(M.llamadas.imagenCalidades[0].prompt).toContain('do not present it as an existing character of the brand')
    const f = (s.res.fichas ?? []).find((x) => x.id.includes('personaje-sin-foto-1'))
    expect(f?.que).toContain('«El pirata» sin foto ni marca de creación nueva')
  })
})

// 18-nov · 🟡 de CC7 a #1179 (m22, m23)
describe('cuando una foto no viaja y en el cuadro de cierre', () => {
  const personajes = [{ id: 'el-personaje', nombre: 'El personaje', descripcion: 'el de la marca', fotos_ids: [PERSONAJE_1.id, PERSONAJE_2.id] }]
  it('🔴 m22 · la ruta dice que una de las otras fotos no viajó: queda la sugerencia «salió sin 1 de sus fotos» nombrándola, y la imagen guarda solo la que sí', async () => {
    const M = crearMemoria({})
    const imagen = M.P.imagen
    M.P.imagen = async (p) => {
      const r = await imagen(p)
      return r.ok && p.otras_fotos?.length ? { ...r, referencia: { usada: true, otras_usadas: [p.otras_fotos[0].url], otras_omitidas: [{ url: p.otras_fotos[1].url, motivo: 'la foto vino vacía' }] } } : r
    }
    const planos = [{ n: 1, desde: 0, hasta: 3, se_ve: 'el personaje mira el plato', producto: true, foto_id: PLATO.id, personajes: ['el-personaje'] }]
    const s = await ejecutarCodigoV(M.P, encargoConPersonaje(personajes, planos) as never, VIDEO_MESA, PASO)
    const f = (s.res.fichas ?? []).find((x) => x.id.includes('otras-fotos-1'))
    expect(f?.que).toContain('salió sin 1 de sus fotos de referencia')
    expect(f?.que).toContain(PERSONAJE_2.id)
    expect(f?.gravedad).toBe('sugerencia')
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a.propuestas![0].planos[0]).toMatchObject({ otras_referencias_ids: [PERSONAJE_1.id] })
  })
  it('🔴 m23 · el plano largo pide su cuadro de cierre con la MISMA base y las mismas otras fotos que su arranque', async () => {
    const M = crearMemoria({})
    const planos = [{ n: 1, desde: 0, hasta: 6, se_ve: 'el personaje mira el plato', movimiento: 'la cámara se acerca', estado_final: 'el plato en primer plano', producto: true, foto_id: PLATO.id, personajes: ['el-personaje'] }]
    await ejecutarCodigoV(M.P, encargoConPersonaje(personajes, planos) as never, VIDEO_MESA, PASO)
    expect(M.llamadas.imagen).toBe(2)
    expect(M.llamadas.imagenFotos).toEqual([PLATO.id, PLATO.id])
    expect(M.llamadas.imagenOtras).toEqual([[PERSONAJE_1.id, PERSONAJE_2.id], [PERSONAJE_1.id, PERSONAJE_2.id]])
  })
})

describe('el adaptador manda las otras fotos a la ruta y lee lo que la ruta dice de ellas', () => {
  const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k', openaiKey: 'sk', revisorModelo: 'm', revisorPrecioEntrada: 1, revisorPrecioSalida: 1, slackToken: 'x', bucket: 'b' }
  const cuerpos: Array<Record<string, unknown>> = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/api/images/generate')) {
      cuerpos.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ image_url: 'https://bucket.test/1.png', generation_id: 'g1', cost_usd: 0.01, referencia: { usada: true, otras_usadas: ['https://fotos.test/a.jpg'], otras_omitidas: [{ url: 'https://fotos.test/b.jpg', motivo: 'la foto vino vacía' }] } }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  it('con base: `reference_image_url` + `reference_image_urls` en orden; vuelven las usadas y las omitidas con su motivo', async () => {
    const P = crearPuertos(new DbFalsa(), ENV, f)
    const r = await P.imagen({ prompt: 'p', client_id: 'c', encargo_id: 'e', dry_run: false, foto: { id: 'base', url: 'https://fotos.test/base.jpg' }, otras_fotos: [{ id: 'a', url: 'https://fotos.test/a.jpg' }, { id: 'b', url: 'https://fotos.test/b.jpg' }] })
    expect(cuerpos.at(-1)).toMatchObject({ reference_image_url: 'https://fotos.test/base.jpg', reference_image_urls: ['https://fotos.test/a.jpg', 'https://fotos.test/b.jpg'] })
    expect(r).toMatchObject({ ok: true, referencia: { usada: true, otras_usadas: ['https://fotos.test/a.jpg'], otras_omitidas: [{ url: 'https://fotos.test/b.jpg', motivo: 'la foto vino vacía' }] } })
  })
  it('sin base no manda otras (la ruta las necesita detrás de una base)', async () => {
    const P = crearPuertos(new DbFalsa(), ENV, f)
    await P.imagen({ prompt: 'p', client_id: 'c', encargo_id: 'e', dry_run: false, foto: null, otras_fotos: [{ id: 'a', url: 'https://fotos.test/a.jpg' }] })
    expect(cuerpos.at(-1)).not.toHaveProperty('reference_image_urls')
    expect(cuerpos.at(-1)).not.toHaveProperty('reference_image_url')
  })
})
