/**
 * 28-nov · GO Lenovo 09:54Z (Emilio aprobó el boceto `raw/evidencia/2026-11-27-boceto-ver-piezas-como-propuestas/`) · EL GUION GRÁFICO DE LA PIEZA TERMINADA.
 * La regla de fotos por escena (segundos ÷ 20 hacia arriba, de 1 a 6), los instantes dentro de cada escena y la pasada de ffmpeg que reusa los cuadros de la mirada.
 * Sin red, sin base y a US$ 0.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sacarCuadros } from '../video/cuadros'
import type { Plano } from '../video/guion'
import { FOTOS_POR_ESCENA_MAX, MAX_FOTOS_DEL_GUION_GRAFICO, SEGUNDOS_POR_FOTO, fotosPorEscena, instantesDelGuionGrafico, nombreDeLaFotoDelGuion } from '../video/guion-grafico'
import { instantesPorPlano } from '../video/mirada'

const escenas = (total: number, k: number): Plano[] => Array.from({ length: k }, (_, i) => ({ n: i + 1, desde: (i * total) / k, hasta: ((i + 1) * total) / k, se_ve: `escena ${i + 1}` }))

describe('la regla: fotos por escena según lo que dura la pieza (cualquier cliente)', () => {
  it.each([
    [15, 1], [20, 1], [21, 2], [30, 2], [40, 2], [41, 3], [45, 3], [60, 3], [61, 4], [80, 4], [90, 5], [100, 5], [101, 6], [120, 6], [600, 6],
  ])('🔴 %i s → %i por escena', (s, n) => expect(fotosPorEscena(s)).toBe(n))
  it('sin duración legible, 1; los números de la regla son los aprobados', () => {
    for (const x of [0, -5, Number.NaN, null, undefined]) expect(fotosPorEscena(x)).toBe(1)
    expect([SEGUNDOS_POR_FOTO, FOTOS_POR_ESCENA_MAX]).toEqual([20, 6])
  })
})

describe('los instantes de cada escena', () => {
  it('🔴 reel de 1 min con 4 escenas: 3 por escena, en orden, dentro de su escena, y son los mismos segundos que mira el agente (se reusan)', () => {
    const planos = escenas(60, 4)
    const i = instantesDelGuionGrafico(planos, 60)
    expect(i).toHaveLength(12)
    for (const p of planos) {
      const suyos = i.filter((x) => x.plano === p.n)
      expect(suyos.map((x) => x.k)).toEqual([1, 2, 3])
      for (const x of suyos) { expect(x.segundo).toBeGreaterThan(p.desde); expect(x.segundo).toBeLessThan(p.hasta) }
      expect([...suyos.map((x) => x.segundo)].sort((a, b) => a - b)).toEqual(suyos.map((x) => x.segundo))
    }
    expect(i.map((x) => [x.plano, x.segundo])).toEqual(instantesPorPlano(planos, 60).map((x) => [x.plano, x.segundo]))
  })
  it('🔴 15 s → el medio de cada escena (el mismo cuadro del medio de la mirada); 30 s → arranque y cierre', () => {
    const p15 = escenas(15, 3)
    expect(instantesDelGuionGrafico(p15, 15).map((x) => x.segundo)).toEqual(instantesPorPlano(p15, 15).filter((x) => x.parte === 'medio').map((x) => x.segundo))
    const p30 = escenas(30, 3)
    expect(instantesDelGuionGrafico(p30, 30).map((x) => x.segundo)).toEqual(instantesPorPlano(p30, 30).filter((x) => x.parte !== 'medio').map((x) => x.segundo))
  })
  it('🔴 90 s → 5 por escena, parejas entre el arranque y el cierre', () => {
    const i = instantesDelGuionGrafico([{ n: 1, desde: 0, hasta: 90, se_ve: 'x' }], 90)
    expect(i.map((x) => x.segundo)).toEqual([0.3, 22.65, 45, 67.35, 89.7])
  })
  it('🔴 la duración MEDIDA manda (no la del guion) y nada cae después del final del video', () => {
    const planos = escenas(60, 2)
    // el guion dice 60 s pero el video mide 20: 1 por escena, y la segunda escena queda dentro del video
    const i = instantesDelGuionGrafico(planos, 20)
    expect(i.map((x) => x.plano)).toEqual([1, 2])
    expect(Math.max(...i.map((x) => x.segundo))).toBeLessThanOrEqual(19.9)
    // dos instantes que el final del video junta en el mismo segundo quedan en UNA foto (no se repite)
    const juntos = instantesDelGuionGrafico([{ n: 1, desde: 0, hasta: 25, se_ve: 'a' }, { n: 2, desde: 50, hasta: 60, se_ve: 'b' }], 30).filter((x) => x.plano === 2)
    expect(juntos).toEqual([{ plano: 2, segundo: 29.9, k: 1 }])
    // sin medida, el final del guion
    expect(instantesDelGuionGrafico(planos, null).filter((x) => x.plano === 1)).toHaveLength(3)
  })
  it('una escena de menos de 1 s lleva 1; las escenas ilegibles no cuentan; con muchas escenas se reparte el tope (mínimo 1 por escena)', () => {
    expect(instantesDelGuionGrafico([{ n: 1, desde: 0, hasta: 0.6, se_ve: 'a' }, { n: 2, desde: 0.6, hasta: 60, se_ve: 'b' }], 60).filter((x) => x.plano === 1)).toHaveLength(1)
    expect(instantesDelGuionGrafico([{ n: 1, desde: 3, hasta: 3, se_ve: 'a' }, { n: 2, desde: Number.NaN, hasta: 5, se_ve: 'b' }], 10)).toEqual([])
    const muchas = instantesDelGuionGrafico(escenas(120, 30), 120)
    expect(muchas.length).toBeLessThanOrEqual(MAX_FOTOS_DEL_GUION_GRAFICO)
    expect(new Set(muchas.map((x) => x.plano)).size).toBe(30)
    expect(instantesDelGuionGrafico(escenas(600, 100), 600)).toHaveLength(100)
  })
  it('el archivo de cada foto es único por escena y lugar', () => {
    expect(nombreDeLaFotoDelGuion({ plano: 3, k: 2 })).toBe('guion-plano-3-2.jpg')
  })
})

describe('ffmpeg: las fotos del guion gráfico salen del video terminado, sin pedir dos veces el mismo cuadro', () => {
  const jpeg = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(2000, 1)])
  const correrCon = (duracion: string, basura: RegExp | null = null) => {
    const llamadas: string[][] = []
    const ejecutar = async (_c: string, args: string[]) => {
      llamadas.push(args)
      if (args.includes('-f')) return { ok: true, salida: '' }
      if (args.includes('-hide_banner')) return { ok: true, salida: `  Duration: ${duracion}, start: 0.000000` }
      const salida = args[args.length - 1]
      fs.writeFileSync(salida, basura && basura.test(salida) ? Buffer.alloc(2000, 7) : jpeg)
      return { ok: true, salida: '' }
    }
    return { llamadas, ejecutar }
  }
  const cortes = (l: string[][]) => l.filter((a) => a.includes('-ss')).map((a) => a[a.indexOf('-ss') + 1])
  it('🔴 1 min: las 3 fotos de cada escena son los cuadros de la mirada → CERO pasadas extra; los cuadros de la mirada no cambian', async () => {
    const planos = escenas(60, 4)
    const { llamadas, ejecutar } = correrCon('00:01:00.00')
    const r = await sacarCuadros({ bytes: Buffer.from('mp4'), planos, ffmpeg: 'ffmpeg', ejecutar })
    expect(cortes(llamadas)).toHaveLength(12)
    expect(r.cuadros).toHaveLength(12)
    expect(r.guion_grafico?.map((x) => [x.plano, x.k, x.de_la_mirada])).toEqual(planos.flatMap((p) => [[p.n, 1, 'inicio'], [p.n, 2, 'medio'], [p.n, 3, 'final']]))
  })
  it('🔴 90 s: solo los instantes que la mirada no pidió van a ffmpeg (2 por escena); lo que no es JPEG se descarta', async () => {
    const planos = escenas(90, 2)
    const { llamadas, ejecutar } = correrCon('00:01:30.00', /guion-plano-2-2/)
    const r = await sacarCuadros({ bytes: Buffer.from('mp4'), planos, ffmpeg: 'ffmpeg', ejecutar })
    const extra = llamadas.filter((a) => a.some((x) => /guion-plano-/.test(x)))
    expect(extra.map((a) => a[a.length - 1].split(/[\\/]/).pop())).toEqual(['guion-plano-1-2.jpg', 'guion-plano-1-4.jpg', 'guion-plano-2-2.jpg', 'guion-plano-2-4.jpg'])
    expect(r.guion_grafico?.map((x) => `${x.plano}-${x.k}`)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-3', '2-4', '2-5'])
    expect(r.cuadros).toHaveLength(6)
  })
  it('🔴 un cuadro de la mirada que no salió NO se vuelve a pedir: esa foto falta (no se inventa)', async () => {
    const planos = escenas(15, 2)
    const { llamadas, ejecutar } = correrCon('00:00:15.00', /plano-2-medio/)
    const r = await sacarCuadros({ bytes: Buffer.from('mp4'), planos, ffmpeg: 'ffmpeg', ejecutar })
    expect(cortes(llamadas)).toHaveLength(6)
    expect(r.guion_grafico?.map((x) => x.plano)).toEqual([1])
  })
  it('sin ffmpeg, nada (la pieza se ve como hoy)', async () => {
    expect((await sacarCuadros({ bytes: Buffer.from('x'), planos: escenas(60, 2), ffmpeg: null })).guion_grafico).toBeUndefined()
  })
})
