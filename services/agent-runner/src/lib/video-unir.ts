/**
 * EL UNIDOR DE VIDEO · 11-nov · GO Lenovo 16:43 (camino B) + OK 16:58 (ffmpeg del sistema en este contenedor, ruta interna con la llave interna).
 * Dos trabajos, genéricos para cualquier cliente y cualquier cantidad de planos:
 *  · ENCUADRAR una foto propia a la proporción de la red (recorte centrado): imagen a video no admite proporción y el clip sale con la forma de la foto.
 *  · UNIR los clips en el orden del guion, cada uno cortado a lo que dura su plano, en un solo mp4. Regla premium de Emilio: que suene como UNA pieza —
 *    el sonido de cada plano se funde con el siguiente (0,4 s, el sonido entra un poco antes que la imagen, como en un montaje), el volumen se empareja
 *    para todo el reel y el final se apaga suave.
 * Lo que entra (fotos y clips) se baja SOLO de nuestro almacén (el anfitrión de SUPABASE_URL, https): son archivos que no escribimos nosotros.
 * Las funciones `argumentosDe…` son puras (se prueban sin ffmpeg); `correr` es lo único que toca disco y procesos.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const MAX_CLIPS = 30
export const MAX_BYTES_POR_ARCHIVO = 60 * 1024 * 1024
export const MAX_SEGUNDOS_POR_CLIP = 30
/** cuánto se funden los sonidos de dos planos seguidos */
export const FUNDIDO_DE_AUDIO_S = 0.4
/** el apagado del sonido al final del reel */
export const APAGADO_FINAL_S = 0.5
export const FPS = 30
/** volumen parejo para redes (-14 LUFS integrados, techo -1,5 dB) */
export const VOLUMEN = 'loudnorm=I=-14:TP=-1.5:LRA=11'
export const SEGUNDOS_DE_FFMPEG = 300

const RELACION = /^(\d{1,2}):(\d{1,2})$/

/** el ancho × alto de salida: el lado corto es `corto` (par), el largo sale de la relación (par) */
export function medidas(relacion: string, corto: number): { ancho: number; alto: number } | null {
  const m = RELACION.exec(relacion)
  if (!m || !Number.isInteger(corto) || corto < 240 || corto > 2160) return null
  const a = Number(m[1]), b = Number(m[2])
  if (!(a > 0 && b > 0)) return null
  const par = (x: number) => Math.round(x / 2) * 2
  return a >= b ? { ancho: par((corto * a) / b), alto: par(corto) } : { ancho: par(corto), alto: par((corto * b) / a) }
}

/** ¿se puede bajar de aquí? solo https al anfitrión de nuestro almacén (sin usuario/clave en la dirección, sin otro puerto) */
export function direccionPermitida(url: unknown, anfitrionDelAlmacen: string | null): string | null {
  if (!anfitrionDelAlmacen) return 'el servicio no sabe cuál es el almacén (falta SUPABASE_URL)'
  if (typeof url !== 'string' || url.length > 2000) return 'dirección inválida'
  let u: URL
  try { u = new URL(url) } catch { return 'dirección inválida' }
  if (u.protocol !== 'https:') return 'solo https'
  if (u.username || u.password) return 'la dirección no puede llevar usuario ni clave'
  if (u.port && u.port !== '443') return 'puerto no permitido'
  if (u.hostname.toLowerCase() !== anfitrionDelAlmacen.toLowerCase()) return `solo se baja de nuestro almacén (${anfitrionDelAlmacen})`
  return null
}

export interface ClipParaUnir { url: string; /** lo que dura el plano en el guion: el clip se corta a esto */ segundos: number }

/** valida el pedido de unir · devuelve los errores (vacío = válido) */
export function validarUnir(b: { clips?: unknown; relacion?: unknown; corto?: unknown }, anfitrion: string | null): { ok: true; clips: ClipParaUnir[]; ancho: number; alto: number } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const clips = Array.isArray(b.clips) ? b.clips : null
  if (!clips || !clips.length || clips.length > MAX_CLIPS) errores.push(`\`clips\` es una lista de 1 a ${MAX_CLIPS}`)
  const med = medidas(typeof b.relacion === 'string' ? b.relacion : '', typeof b.corto === 'number' ? b.corto : 720)
  if (!med) errores.push('`relacion` es «a:b» y `corto` un entero de 240 a 2160')
  const salida: ClipParaUnir[] = []
  for (const [i, c] of (clips ?? []).entries()) {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const mal = direccionPermitida(o.url, anfitrion)
    if (mal) errores.push(`clip ${i + 1}: ${mal}`)
    const s = Number(o.segundos)
    if (!Number.isFinite(s) || s < 1 || s > MAX_SEGUNDOS_POR_CLIP) errores.push(`clip ${i + 1}: \`segundos\` de 1 a ${MAX_SEGUNDOS_POR_CLIP}`)
    if (!mal && Number.isFinite(s)) salida.push({ url: String(o.url), segundos: s })
  }
  if (errores.length || !med) return { ok: false, errores }
  return { ok: true, clips: salida, ...med }
}

/**
 * los argumentos de ffmpeg para unir · `conAudio[i]` dice si el clip i trae sonido (si no, se pone silencio de su largo).
 * Imagen: cada clip se corta a su plano, se lleva a ancho × alto (llena y recorta al centro), 30 cuadros, y se encadenan con corte limpio.
 * Sonido: cada plano (salvo el último) se toma con 0,4 s de cola y se funde con el siguiente: el total vuelve a ser la suma de los planos, en sincronía.
 */
export function argumentosDeUnir(entradas: string[], clips: ClipParaUnir[], conAudio: boolean[], ancho: number, alto: number, salida: string): string[] {
  const n = clips.length
  const D = FUNDIDO_DE_AUDIO_S
  const total = clips.reduce((s, c) => s + c.segundos, 0)
  const args: string[] = ['-hide_banner', '-nostdin', '-y']
  for (const e of entradas) args.push('-i', e)
  const f: string[] = []
  let extra = n
  const fuenteDeAudio: string[] = []
  for (let i = 0; i < n; i++) {
    const largo = i < n - 1 ? clips[i].segundos + D : clips[i].segundos
    if (conAudio[i]) fuenteDeAudio.push(`[${i}:a]`)
    else { args.push('-f', 'lavfi', '-t', String(largo), '-i', 'anullsrc=r=48000:cl=stereo'); fuenteDeAudio.push(`[${extra++}:a]`) }
    f.push(`[${i}:v]trim=duration=${clips[i].segundos},setpts=PTS-STARTPTS,scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${FPS},format=yuv420p[v${i}]`)
    f.push(`${fuenteDeAudio[i]}aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${largo},asetpts=PTS-STARTPTS,apad=whole_dur=${largo}[a${i}]`)
  }
  f.push(`${Array.from({ length: n }, (_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[v]`)
  let actual = '[a0]'
  for (let i = 1; i < n; i++) { f.push(`${actual}[a${i}]acrossfade=d=${D}:c1=tri:c2=tri[x${i}]`); actual = `[x${i}]` }
  const apagado = Math.min(APAGADO_FINAL_S, total / 2)
  f.push(`${actual}afade=t=out:st=${Math.max(0, +(total - apagado).toFixed(3))}:d=${apagado},${VOLUMEN},atrim=duration=${total}[a]`)
  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(total), '-movflags', '+faststart', '-threads', '2', salida)
  return args
}

/** los argumentos para encuadrar una foto a ancho × alto (llena y recorta al centro) en un jpg de calidad alta */
export function argumentosDeEncuadrar(entrada: string, ancho: number, alto: number, salida: string): string[] {
  return ['-hide_banner', '-nostdin', '-y', '-i', entrada, '-frames:v', '1', '-vf', `scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1`, '-q:v', '2', salida]
}

// ───────────────────────── lo que toca disco y procesos

/** uno a la vez: el contenedor también corre agentes */
let cola: Promise<unknown> = Promise.resolve()
export function enFila<T>(trabajo: () => Promise<T>): Promise<T> {
  const p = cola.then(trabajo, trabajo)
  cola = p.catch(() => undefined)
  return p
}

export function ejecutar(bin: string, args: string[], segundos = SEGUNDOS_DE_FFMPEG): Promise<{ codigo: number | null; err: string; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    let out = ''
    p.stdout.on('data', (d) => { out = (out + d).slice(-4000) })
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000) })
    const t = setTimeout(() => p.kill('SIGKILL'), segundos * 1000)
    p.on('error', (e) => { clearTimeout(t); resolve({ codigo: -1, err: String(e.message), out }) })
    p.on('close', (codigo) => { clearTimeout(t); resolve({ codigo, err, out }) })
  })
}

/** baja un archivo de nuestro almacén con tope de tamaño */
export async function bajar(url: string, f: typeof fetch = fetch): Promise<Buffer> {
  const r = await f(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`no se pudo bajar (${r.status})`)
  const largo = Number(r.headers.get('content-length') ?? 0)
  if (largo > MAX_BYTES_POR_ARCHIVO) throw new Error(`el archivo pesa más de ${MAX_BYTES_POR_ARCHIVO / 1048576} MB`)
  const bytes = Buffer.from(await r.arrayBuffer())
  if (!bytes.length) throw new Error('archivo vacío')
  if (bytes.length > MAX_BYTES_POR_ARCHIVO) throw new Error(`el archivo pesa más de ${MAX_BYTES_POR_ARCHIVO / 1048576} MB`)
  return bytes
}

/** ¿el clip trae sonido? (ffprobe) */
async function tieneAudio(ruta: string): Promise<boolean> {
  const r = await ejecutar('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', ruta], 30)
  return r.codigo === 0 && r.out.trim().length > 0
}

async function enCarpeta<T>(trabajo: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'unir-'))
  try { return await trabajo(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

export async function unir(clips: ClipParaUnir[], ancho: number, alto: number, f: typeof fetch = fetch): Promise<Buffer> {
  return enFila(() => enCarpeta(async (dir) => {
    const entradas: string[] = []
    for (const [i, c] of clips.entries()) { const ruta = join(dir, `c${i}.mp4`); await writeFile(ruta, await bajar(c.url, f)); entradas.push(ruta) }
    const conAudio: boolean[] = []
    for (const e of entradas) conAudio.push(await tieneAudio(e))
    const salida = join(dir, 'unido.mp4')
    const r = await ejecutar('ffmpeg', argumentosDeUnir(entradas, clips, conAudio, ancho, alto, salida))
    if (r.codigo !== 0) throw new Error(`ffmpeg no pudo unir (${r.codigo}): ${r.err.slice(-600)}`)
    return readFile(salida)
  }))
}

export async function encuadrar(url: string, ancho: number, alto: number, f: typeof fetch = fetch): Promise<Buffer> {
  return enFila(() => enCarpeta(async (dir) => {
    const entrada = join(dir, 'foto')
    await writeFile(entrada, await bajar(url, f))
    const salida = join(dir, 'encuadrada.jpg')
    const r = await ejecutar('ffmpeg', argumentosDeEncuadrar(entrada, ancho, alto, salida), 60)
    if (r.codigo !== 0) throw new Error(`ffmpeg no pudo encuadrar (${r.codigo}): ${r.err.slice(-600)}`)
    return readFile(salida)
  }))
}

/** el anfitrión de nuestro almacén, de SUPABASE_URL */
export function anfitrionDelAlmacen(env: NodeJS.ProcessEnv = process.env): string | null {
  try { return new URL(String(env.SUPABASE_URL ?? '')).hostname || null } catch { return null }
}
