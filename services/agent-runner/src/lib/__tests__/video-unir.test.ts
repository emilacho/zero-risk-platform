/**
 * 11-nov · el unidor de video (camino B · OK Lenovo 16:58) · lo puro (medidas, qué se deja bajar, argumentos de ffmpeg) y, donde haya ffmpeg, una unión REAL
 * de clips sintéticos (imagen de prueba + tono), medida con ffprobe: duración = suma de los planos, medidas de la red, un solo sonido continuo.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APAGADO_FINAL_S, FUNDIDO_DE_AUDIO_S, MAX_CLIPS, argumentosDeEncuadrar, argumentosDeUnir, direccionPermitida, medidas, validarUnir, ejecutar, anfitrionDelAlmacen } from '../video-unir.js'

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

// ── unión REAL donde haya ffmpeg (el contenedor de Railway lo trae; en Windows sin ffmpeg se salta) ──
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
// en CI se EXIGE (la prueba real no se salta en silencio)
describe.runIf(process.env.EXIGIR_FFMPEG === '1' && !hayFfmpeg)('ffmpeg exigido', () => { it('CI instala ffmpeg antes de las pruebas', () => { expect(hayFfmpeg).toBe(true) }) })
describe.skipIf(!hayFfmpeg)('unión real con ffmpeg (clips sintéticos)', () => {
  it('4 planos (uno sin sonido, uno horizontal) → un mp4 9:16 de 12 s con un solo sonido', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'unir-test-'))
    try {
      const hacer = (n: string, s: number, tam: string, sonido: boolean) => {
        const args = ['-hide_banner', '-y', '-f', 'lavfi', '-i', `testsrc=size=${tam}:rate=24:duration=${s}`, ...(sonido ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${s}`] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(sonido ? ['-c:a', 'aac'] : []), '-shortest', join(dir, n)]
        expect(spawnSync('ffmpeg', args).status).toBe(0)
        return join(dir, n)
      }
      const entradas = [hacer('a.mp4', 4, '720x1280', true), hacer('b.mp4', 4, '720x1280', true), hacer('c.mp4', 4, '1280x720', false), hacer('d.mp4', 4, '720x1280', true)]
      const clips = [clip(1, 3), clip(2, 4), clip(3, 3), clip(4, 2)]
      const salida = join(dir, 'unido.mp4')
      const r = await ejecutar('ffmpeg', argumentosDeUnir(entradas, clips, [true, true, false, true], 720, 1280, salida), 120)
      expect(r.codigo, r.err).toBe(0)
      const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', salida])
      const j = JSON.parse(String(p.stdout)) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration: string } }
      const v = j.streams.find((s) => s.codec_type === 'video')
      expect([v?.width, v?.height]).toEqual([720, 1280])
      expect(j.streams.filter((s) => s.codec_type === 'audio').length).toBe(1)
      expect(Math.abs(Number(j.format.duration) - 12)).toBeLessThan(0.15)
      writeFileSync(join(dir, 'ok'), '1')
      expect(readFileSync(join(dir, 'ok'), 'utf8')).toBe('1')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 120_000)
})
