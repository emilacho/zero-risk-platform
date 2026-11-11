/**
 * 11-nov · el unidor de video (camino B · OK Lenovo 16:58) · lo puro (medidas, qué se deja bajar, argumentos de ffmpeg) y, donde haya ffmpeg, una unión REAL
 * de clips sintéticos (imagen de prueba + tono), medida con el mismo ffmpeg: duración = suma de los planos, medidas de la red, un solo sonido continuo.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APAGADO_FINAL_S, FUNDIDO_DE_AUDIO_S, MAX_CLIPS, argumentosDeEncuadrar, argumentosDeUnir, binarioDeFfmpeg, direccionPermitida, leerInforme, medidas, validarUnir, ejecutar, anfitrionDelAlmacen } from '../video-unir.js'

const ALMACEN = 'abcd.supabase.co'
const clip = (n: number, s: number) => ({ url: `https://${ALMACEN}/storage/v1/object/public/oficina/videos/c${n}.mp4`, segundos: s })

describe('medidas de salida', () => {
  it('lado corto = el pedido, el largo sale de la relación (pares)', () => {
    expect(medidas('9:16', 720)).toEqual({ ancho: 720, alto: 1280 })
    expect(medidas('9:16', 1080)).toEqual({ ancho: 1080, alto: 1920 })
    expect(medidas('16:9', 720)).toEqual({ ancho: 1280, alto: 720 })
    expect(medidas('1:1', 1080)).toEqual({ ancho: 1080, alto: 1080 })
    expect(medidas('4:5', 1080)).toEqual({ ancho: 1080, alto: 1350 })
  })
  it('relación o lado corto inválidos → null', () => {
    expect(medidas('vertical', 720)).toBeNull()
    expect(medidas('0:16', 720)).toBeNull()
    expect(medidas('9:16', 100)).toBeNull()
    expect(medidas('9:16', 4000)).toBeNull()
    expect(medidas('9:16', 720.5)).toBeNull()
  })
})

describe('solo se baja de nuestro almacén', () => {
  it('https al anfitrión del almacén: sí', () => { expect(direccionPermitida(clip(1, 3).url, ALMACEN)).toBeNull() })
  it('otro anfitrión, http, usuario en la dirección, otro puerto, basura: no', () => {
    expect(direccionPermitida('https://evil.example/x.mp4', ALMACEN)).toMatch(/almacén/)
    expect(direccionPermitida(`https://${ALMACEN}.evil.example/x.mp4`, ALMACEN)).toMatch(/almacén/)
    expect(direccionPermitida(`http://${ALMACEN}/x.mp4`, ALMACEN)).toMatch(/https/)
    expect(direccionPermitida(`https://u:p@${ALMACEN}/x.mp4`, ALMACEN)).toMatch(/usuario/)
    expect(direccionPermitida(`https://${ALMACEN}:8443/x.mp4`, ALMACEN)).toMatch(/puerto/)
    expect(direccionPermitida('file:///etc/passwd', ALMACEN)).not.toBeNull()
    expect(direccionPermitida(42, ALMACEN)).not.toBeNull()
  })
  it('sin almacén configurado no se baja nada', () => { expect(direccionPermitida(clip(1, 3).url, null)).toMatch(/SUPABASE_URL/) })
  it('el anfitrión sale de SUPABASE_URL', () => {
    expect(anfitrionDelAlmacen({ SUPABASE_URL: `https://${ALMACEN}` } as NodeJS.ProcessEnv)).toBe(ALMACEN)
    expect(anfitrionDelAlmacen({} as NodeJS.ProcessEnv)).toBeNull()
  })
})

describe('validar el pedido de unir', () => {
  it('válido: clips en orden con sus segundos, medidas de la red', () => {
    const v = validarUnir({ clips: [clip(1, 3), clip(2, 4)], relacion: '9:16', corto: 720 }, ALMACEN)
    expect(v.ok && v.clips.map((c) => c.segundos)).toEqual([3, 4])
    expect(v.ok && [v.ancho, v.alto]).toEqual([720, 1280])
  })
  it('sin clips, demasiados, segundos fuera de rango o un clip de afuera: no', () => {
    expect(validarUnir({ clips: [], relacion: '9:16' }, ALMACEN).ok).toBe(false)
    expect(validarUnir({ clips: Array.from({ length: MAX_CLIPS + 1 }, (_, i) => clip(i, 2)), relacion: '9:16' }, ALMACEN).ok).toBe(false)
    expect(validarUnir({ clips: [clip(1, 0.5)], relacion: '9:16' }, ALMACEN).ok).toBe(false)
    expect(validarUnir({ clips: [clip(1, 31)], relacion: '9:16' }, ALMACEN).ok).toBe(false)
    expect(validarUnir({ clips: [clip(1, 3), { url: 'https://evil.example/x.mp4', segundos: 3 }], relacion: '9:16' }, ALMACEN).ok).toBe(false)
    expect(validarUnir({ clips: [clip(1, 3)], relacion: 'raro' }, ALMACEN).ok).toBe(false)
  })
})

describe('argumentos de unir', () => {
  const clips = [clip(1, 3), clip(2, 4), clip(3, 3), clip(4, 2)]
  const a = argumentosDeUnir(['a', 'b', 'c', 'd'], clips, [true, true, false, true], 720, 1280, 'out.mp4')
  const grafo = a[a.indexOf('-filter_complex') + 1]
  it('cada clip se corta a lo que dura su plano y se lleva a las medidas de la red', () => {
    expect(grafo).toContain('[0:v]trim=duration=3,')
    expect(grafo).toContain('[1:v]trim=duration=4,')
    expect(grafo).toContain('[3:v]trim=duration=2,')
    expect(grafo).toContain('scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280')
    expect(grafo).toContain('concat=n=4:v=1:a=0[v]')
  })
  it('el sonido de cada plano (salvo el último) lleva la cola del fundido y se funde con el siguiente', () => {
    expect(grafo).toContain(`atrim=duration=${3 + FUNDIDO_DE_AUDIO_S},`)
    expect(grafo).toContain(`atrim=duration=2,asetpts`) // el último, sin cola
    expect(grafo.match(/acrossfade=d=/g)?.length).toBe(3)
  })
  it('un clip sin sonido recibe silencio de su largo (el reel nunca se queda mudo a medias)', () => {
    const i = a.indexOf('anullsrc=r=48000:cl=stereo')
    expect(i).toBeGreaterThan(0)
    expect(a[i - 3]).toBe('-t')
    expect(a[i - 2]).toBe(String(3 + FUNDIDO_DE_AUDIO_S))
    expect(grafo).toContain('[4:a]aformat') // la entrada extra (la 5.ª) ocupa el lugar del plano 3
    expect(grafo).not.toContain('[2:a]')
  })
  it('volumen parejo, apagado final y duración total = suma de los planos', () => {
    expect(grafo).toContain(`afade=t=out:st=${12 - APAGADO_FINAL_S}:d=${APAGADO_FINAL_S}`)
    expect(grafo).toContain('loudnorm=')
    expect(a[a.indexOf('-t', a.indexOf('-filter_complex')) + 1]).toBe('12')
    expect(a).toContain('+faststart')
    expect(a[a.length - 1]).toBe('out.mp4')
  })
  it('un solo plano: sin fundidos', () => {
    const b = argumentosDeUnir(['a'], [clip(1, 5)], [true], 720, 1280, 'o.mp4')
    expect(b[b.indexOf('-filter_complex') + 1]).not.toContain('acrossfade')
  })
  it('encuadrar: llena y recorta al centro, un solo cuadro', () => {
    const e = argumentosDeEncuadrar('in', 1080, 1920, 'o.jpg')
    expect(e.join(' ')).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920')
    expect(e).toContain('-frames:v')
  })
})


describe('lo que ffmpeg dice de un archivo (sin ffprobe)', () => {
  const informe = [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'unido.mp4':",
    '  Duration: 00:00:12.02, start: 0.000000, bitrate: 512 kb/s',
    '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 720x1280 [SAR 1:1 DAR 9:16], 400 kb/s, 30 fps',
    '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s',
  ].join('\n')
  it('lee sonido, medidas y duración', () => {
    expect(leerInforme(informe)).toEqual({ audio: true, ancho: 720, alto: 1280, segundos: 12.02 })
  })
  it('un clip sin pista de sonido', () => {
    expect(leerInforme(informe.split('\n').slice(0, 3).join('\n')).audio).toBe(false)
  })
  it('el ejecutable es el del sistema salvo FFMPEG_BIN', () => {
    expect(binarioDeFfmpeg({} as NodeJS.ProcessEnv)).toBe('ffmpeg')
    expect(binarioDeFfmpeg({ FFMPEG_BIN: '/opt/ff/ffmpeg' } as NodeJS.ProcessEnv)).toBe('/opt/ff/ffmpeg')
  })
})

// ── unión REAL con ffmpeg: el del sistema (el contenedor de Railway lo trae) o el empaquetado en las dependencias del repo (`@ffmpeg-installer/ffmpeg`, el que ya usa el portero) ──
function hallarFfmpeg(): string | null {
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg'
  try {
    const ruta = (createRequire(join(process.cwd(), 'package.json'))('@ffmpeg-installer/ffmpeg') as { path?: string }).path
    if (!ruta) return null
    if (spawnSync(ruta, ['-version']).status !== 0) { try { chmodSync(ruta, 0o755) } catch { /* sin permiso: se mide abajo */ } }
    return spawnSync(ruta, ['-version']).status === 0 ? ruta : null
  } catch { return null }
}
const FF = hallarFfmpeg()
// en CI se EXIGE (la prueba real no se salta en silencio)
describe.runIf(process.env.EXIGIR_FFMPEG === '1' && !FF)('ffmpeg exigido', () => { it('CI tiene ffmpeg (el empaquetado en las dependencias)', () => { expect(FF).not.toBeNull() }) })
describe.skipIf(!FF)('unión real con ffmpeg (clips sintéticos)', () => {
  it('4 planos (uno sin sonido, uno horizontal) → un mp4 9:16 de 12 s con un solo sonido', async () => {
    const ff = FF as string
    const dir = mkdtempSync(join(tmpdir(), 'unir-test-'))
    try {
      const hacer = (n: string, s: number, tam: string, sonido: boolean) => {
        const args = ['-hide_banner', '-y', '-f', 'lavfi', '-i', `testsrc=size=${tam}:rate=24:duration=${s}`, ...(sonido ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${s}`] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(sonido ? ['-c:a', 'aac'] : []), '-shortest', join(dir, n)]
        const r = spawnSync(ff, args)
        expect(r.status, String(r.stderr).slice(-400)).toBe(0)
        return join(dir, n)
      }
      const entradas = [hacer('a.mp4', 4, '720x1280', true), hacer('b.mp4', 4, '720x1280', true), hacer('c.mp4', 4, '1280x720', false), hacer('d.mp4', 4, '720x1280', true)]
      // lo que el unidor detecta de cada clip, con el mismo ffmpeg
      const conAudio = entradas.map((e) => leerInforme(String(spawnSync(ff, ['-hide_banner', '-i', e]).stderr)).audio)
      expect(conAudio).toEqual([true, true, false, true])
      const clips = [clip(1, 3), clip(2, 4), clip(3, 3), clip(4, 2)]
      const salida = join(dir, 'unido.mp4')
      const r = await ejecutar(ff, argumentosDeUnir(entradas, clips, conAudio, 720, 1280, salida), 120)
      expect(r.codigo, r.err).toBe(0)
      const inf = leerInforme(String(spawnSync(ff, ['-hide_banner', '-i', salida]).stderr))
      expect([inf.ancho, inf.alto]).toEqual([720, 1280])
      expect(inf.audio).toBe(true)
      expect(Math.abs((inf.segundos ?? 0) - 12)).toBeLessThan(0.15)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 120_000)
})
