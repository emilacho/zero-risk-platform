/**
 * LOS CUADROS DEL VIDEO · un cuadro del medio de cada plano del guion (ffmpeg), para que un agente mire el video antes de la bandeja (ver `mirada.ts`).
 * Reusa el ffmpeg y el ejecutor de los videos del cerebro (solo se importan; ese módulo no cambia). Nunca lanza: lo que no pudo vuelve como `causa`.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ejecutarReal, rutaDeFfmpeg, type Ejecutar } from '../../portero-alimenta/videos-del-cerebro'
import type { Plano } from './guion'
import { instantesPorPlano } from './mirada'

export interface CuadroSacado { plano: number; segundo: number; bytes: Buffer }

/** duración leída de la salida de `ffmpeg -i` (null si no aparece) */
export function duracionDeLaSalida(salida: string): number | null {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(salida)
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null
}

export async function sacarCuadros(a: { bytes: Buffer; planos: Plano[]; ffmpeg?: string | null; ejecutar?: Ejecutar }): Promise<{ duracion_s: number | null; cuadros: CuadroSacado[]; causa?: string }> {
  const ff = a.ffmpeg === undefined ? rutaDeFfmpeg() : a.ffmpeg
  if (!ff) return { duracion_s: null, cuadros: [], causa: 'ffmpeg no está disponible en este servidor' }
  const correr = a.ejecutar ?? ejecutarReal
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'ov-'))
    const entrada = join(dir, 'v.mp4')
    await writeFile(entrada, a.bytes)
    const duracion = duracionDeLaSalida((await correr(ff, ['-hide_banner', '-i', entrada], 20_000)).salida)
    const instantes = instantesPorPlano(a.planos, duracion)
    if (!instantes.length) return { duracion_s: duracion, cuadros: [], causa: 'el guion no trae planos con segundos válidos' }
    const cuadros: CuadroSacado[] = []
    for (const { plano, segundo } of instantes) {
      const salida = join(dir, `p${plano}.jpg`)
      const r = await correr(ff, ['-v', 'error', '-ss', String(segundo), '-i', entrada, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', '-y', salida], 30_000)
      if (!r.ok) continue
      try { const b = await readFile(salida); if (b.length > 1000 && b.subarray(0, 3).toString('hex') === 'ffd8ff') cuadros.push({ plano, segundo, bytes: b }) } catch { /* ese instante no dio imagen */ }
    }
    return { duracion_s: duracion, cuadros, ...(cuadros.length ? {} : { causa: 'ffmpeg no sacó ningún cuadro del video' }) }
  } catch (e) {
    return { duracion_s: null, cuadros: [], causa: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
