/**
 * 19-nov · G5 · el video más largo de 15 s (GO Lenovo 03:26Z · Emilio: «¿y si un cliente pide miniseries?»). Puras, en seco, US$ 0.
 * La pieza puede durar hasta el techo de la cadena (`TECHO_DE_LA_PIEZA_S` = 120 s, el render de la composición); un video de 120 s en 8 planos de 15 s
 * pasa el traductor, los pedidos por plano, el unidor, el render y los topes; uno de 121 s lo rechaza la plantilla.
 */
import { describe, expect, it } from 'vitest'
import { TECHO_DE_LA_PIEZA_S } from '../video/techo-de-la-pieza'
import { LIMITES as LIMITES_DEL_RENDER, validarPedidoVideo } from '../../../../services/render-html/src/logica'
import { MAX_CLIPS, MAX_SEGUNDOS_POR_CLIP, validarUnir } from '../../../../services/agent-runner/src/lib/video-unir'
import { traducirGuion } from '../video/guion'
import { parametrosDelVideo } from '../video/propuestas'
import { pedidosPorPlano, segundosDelVideoUnido } from '../video/planos'
import { validarPlantilla } from '../plantilla'
import { aplicarTopesPorDuracion } from '../topes-por-duracion'
import { VIDEO_MESA_POR_SEGUNDO } from '../plantillas/video-mesa'
import { TOPE_MAXIMO_DEL_SOBRE_USD } from '../sobre'
import { fichaPorOmision } from '../../video/parametros'
import type { Plantilla } from '../tipos'

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const conLargo = (s: number, resolucion?: string): Plantilla => {
  const p = copia(VIDEO_MESA_POR_SEGUNDO)
  const v = p.limites.video as Record<string, unknown>
  v.segundos_max = s
  if (resolucion) v.resolucion = resolucion
  return p
}
const tope = (p: Plantilla) => aplicarTopesPorDuracion(p)

/** el guion de una pieza de 120 s en 8 planos de 15 s (cada uno, un clip dentro de la ficha del modelo) */
const guionLargo = (planos: number, seg: number) => [
  ...Array.from({ length: planos }, (_, i) => [
    `## Plano ${i + 1} · ${i * seg}–${(i + 1) * seg} s`,
    'Rol: situar',
    `Dice: el capítulo ${i + 1} de la miniserie`,
    `Se ve: la escena ${i + 1} en el local`,
    'Movimiento: fija',
    'Foto: ninguna',
    `Prompt de imagen: scene ${i + 1}, warm light`,
    `Prompt de video: slow push in, scene ${i + 1}`,
  ].join('\n')),
  '## Audio', 'guitarra suave y voz del dueño',
  '## Pie', 'La historia completa, en 2 minutos.',
  '## Etiquetas', '#miniserie #historia',
].join('\n\n')

describe('G5 · el techo de la pieza es lo que aguanta la cadena, leído de cada tramo', () => {
  it('🔴 es el máximo del render de la composición (el tramo más bajo) y cabe en el unidor', () => {
    expect(TECHO_DE_LA_PIEZA_S).toBe(LIMITES_DEL_RENDER.segundos_max)
    expect(TECHO_DE_LA_PIEZA_S).toBeLessThanOrEqual(MAX_CLIPS * MAX_SEGUNDOS_POR_CLIP)
    expect(TECHO_DE_LA_PIEZA_S).toBeGreaterThan(15)
  })
})

describe('G5 · la plantilla', () => {
  it('🔴 acepta hasta el techo y rechaza un segundo más', () => {
    // la plantilla suelta trae 2 avisos ajenos a G5 (sin el registro de funciones de la oficina cargado): se compara contra la de 15 s
    const a15 = validarPlantilla(conLargo(15))
    expect(validarPlantilla(conLargo(TECHO_DE_LA_PIEZA_S))).toEqual(a15)
    const a121 = validarPlantilla(conLargo(TECHO_DE_LA_PIEZA_S + 1))
    expect(a121.filter((x) => !a15.includes(x))).toEqual(['`limites.video.segundos_max` (121) pasa del techo de la pieza de video (120 s: lo que aguanta el render de la composición)'])
  })
  it('🔴 aunque la base diga más, la mesa nunca pide más que el techo', () => {
    expect(parametrosDelVideo(conLargo(TECHO_DE_LA_PIEZA_S)).segundos_max).toBe(TECHO_DE_LA_PIEZA_S)
    expect(parametrosDelVideo(conLargo(600)).segundos_max).toBe(TECHO_DE_LA_PIEZA_S)
    expect(parametrosDelVideo(conLargo(15)).segundos_max).toBe(15)
  })
  it('🔴 a 120 s los topes crecen con la pieza y caben en el techo de la base, a 720p y a 1080p', () => {
    for (const r of ['720p', '1080p']) {
      const a15 = tope(conLargo(15, r)), a120 = tope(conLargo(TECHO_DE_LA_PIEZA_S, r))
      expect(a120.errores, r).toEqual([])
      expect(a120.plantilla.limites.tope_encargo_usd, r).toBeGreaterThan(a15.plantilla.limites.tope_encargo_usd)
      expect(a120.plantilla.limites.tope_encargo_usd, r).toBeLessThanOrEqual(TOPE_MAXIMO_DEL_SOBRE_USD)
      const video = a120.plantilla.pasos.find((p) => p.funcion === 'video')!
      expect(video.tope_usd, r).toBeGreaterThan(a15.plantilla.pasos.find((p) => p.funcion === 'video')!.tope_usd * 7)
    }
  })
})

describe('G5 · un video de 120 s en 8 planos de 15 s, en seco, por cada tramo', () => {
  const t = traducirGuion(guionLargo(8, 15), { segundosMin: 8, segundosMax: TECHO_DE_LA_PIEZA_S })
  it('🔴 el traductor lo acepta entero: 8 planos, 120 s', () => {
    expect(t.ok, t.ok ? '' : t.motivo).toBe(true)
    expect(t.planos).toHaveLength(8)
    expect(t.segundos).toBe(120)
  })
  it('🔴 con el techo viejo (15 s) el mismo guion no pasa: el largo venía de la plantilla', () => {
    const viejo = traducirGuion(guionLargo(8, 15), { segundosMin: 8, segundosMax: 15 })
    expect(viejo.ok && viejo.segundos === 120).toBe(false)
  })
  it('🔴 un pedido por plano, cada uno dentro de la ficha del modelo; unido dura 120 s', () => {
    const r = pedidosPorPlano({ guion: { planos: t.planos, audio: t.audio }, brief: { formato: 'reel', red: 'Instagram' }, fotos: [], clave: 'enc:g5:v1', relacion: '9:16' })
    if (!r.ok) throw new Error(r.errores.join(' · '))
    expect(r.pedidos).toHaveLength(8)
    expect(r.pedidos.every((p) => p.segundos <= fichaPorOmision().segundos_max)).toBe(true)
    expect(segundosDelVideoUnido(r.pedidos)).toBe(120)
    // el unidor acepta los 8 clips (bajan de nuestro almacén)
    const u = validarUnir({ clips: r.pedidos.map((p, i) => ({ url: `https://almacen.example/c${i}.mp4`, segundos: p.cortar_a_s })), relacion: '9:16', corto: 720 }, 'almacen.example')
    expect(u.ok, u.ok ? '' : u.errores.join(' · ')).toBe(true)
  })
  it('🔴 el render de la composición acepta 120 s y rechaza 121', () => {
    const HOSTS = new Set(['abc.supabase.co'])
    const video = (segundos: number) => ({ html: '<html><head></head><body></body></html>', ancho: 1080, alto: 1920, segundos, archivos: [{ nombre: 'base.mp4', url: 'https://abc.supabase.co/storage/v1/object/public/oficina/x/base.mp4' }] })
    expect(validarPedidoVideo(video(TECHO_DE_LA_PIEZA_S), HOSTS).ok).toBe(true)
    const no = validarPedidoVideo(video(TECHO_DE_LA_PIEZA_S + 1), HOSTS)
    expect(no.ok).toBe(false)
    expect(no.ok ? '' : no.error).toMatch(/segundos/)
  })
})
