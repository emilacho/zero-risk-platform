/**
 * EL ANÁLISIS DEL SONIDO · Sprint 3 · T5 (CC4 · GO Lenovo 17-nov 11:54 · US$ 0).
 *
 * Antes de dibujar los subtítulos y de montar al ritmo, el servicio escucha el archivo:
 *  · PALABRAS: la transcripción LOCAL de hyperframes con whisper.cpp (versión y modelo fijos, horneados en la imagen: nada se baja ni se instala
 *    al correr). El motor es SIEMPRE `whisper`: el de HeyGen cobra y queda fuera. El idioma es DATO del pedido (el de la pieza), nunca «.en»
 *    (los modelos «.en» traducen al inglés lo que no es inglés).
 *  · GOLPES: `hyperframes beats` sobre la pista de música (local, gratis). La confianza del tempo la medimos aquí: golpes parejos = tempo claro.
 * Aquí van las reglas puras (se prueban en el CI de la raíz); `analizar` es lo único que toca disco y procesos.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { NOMBRE_DE_ARCHIVO, urlPermitida, LIMITES, type Validado } from './logica'
import { bajarArchivo } from './bajada'

/** el modelo de whisper horneado en la imagen (Dockerfile): multilingüe, nunca «.en» */
export const MODELO_DE_WHISPER = 'small'
/** idiomas: código ISO 639-1 de dos letras (es, en, pt…); el pedido lo trae de la pieza */
export const IDIOMA = /^[a-z]{2}$/
/** el análisis de un archivo largo se corta aquí (el servicio no se queda pegado) */
export const ANALISIS_MAX_MS = 8 * 60 * 1000

export interface PedidoDeAnalisis {
  /** el archivo cuya VOZ se transcribe (el video unido o la locución) · null = sin palabras */
  voz: { nombre: string; url: string } | null
  /** la pista de MÚSICA cuyos golpes se miden · null = sin golpes */
  musica: { nombre: string; url: string } | null
  idioma: string
}

const archivo = (v: unknown, hosts: Set<string>, que: string): Validado<{ nombre: string; url: string } | null> => {
  if (v === undefined || v === null) return { ok: true, valor: null }
  const o = v as Record<string, unknown>
  const nombre = typeof o?.nombre === 'string' ? o.nombre : ''
  const url = typeof o?.url === 'string' ? o.url : ''
  if (!NOMBRE_DE_ARCHIVO.test(nombre)) return { ok: false, error: `nombre de archivo no válido para ${que}: «${nombre.slice(0, 90)}»` }
  if (!urlPermitida(url, hosts)) return { ok: false, error: `dirección no permitida para ${que} (solo https a los dominios de la lista)` }
  return { ok: true, valor: { nombre, url } }
}

export function validarPedidoDeAnalisis(b: unknown, hosts: Set<string>): Validado<PedidoDeAnalisis> {
  const o = (b ?? {}) as Record<string, unknown>
  const voz = archivo(o.voz, hosts, 'la voz')
  if (!voz.ok) return voz
  const musica = archivo(o.musica, hosts, 'la música')
  if (!musica.ok) return musica
  if (!voz.valor && !musica.valor) return { ok: false, error: 'falta qué analizar: `voz`, `musica` o los dos' }
  if (voz.valor && musica.valor && voz.valor.nombre.toLowerCase() === musica.valor.nombre.toLowerCase()) return { ok: false, error: 'la voz y la música no pueden llamarse igual' }
  const idioma = o.idioma === undefined ? 'es' : String(o.idioma).toLowerCase()
  if (!IDIOMA.test(idioma)) return { ok: false, error: 'idioma debe ser un código de dos letras (es, en, pt…)' }
  return { ok: true, valor: { voz: voz.valor, musica: musica.valor, idioma } }
}

/** las opciones de la transcripción: motor whisper SIEMPRE (el de HeyGen cobra), modelo multilingüe fijo, sin instalar nada al correr */
export function opcionesDeTranscripcion(entrada: string, carpeta: string, idioma: string): { input: string; dir: string; engine: 'whisper'; model: string; language: string; installRuntime: false; timeoutMs: number } {
  return { input: entrada, dir: carpeta, engine: 'whisper', model: MODELO_DE_WHISPER, language: idioma, installRuntime: false, timeoutMs: ANALISIS_MAX_MS }
}

/** los argumentos de `hyperframes beats` sobre un archivo: el resultado por JSON */
export const argumentosDeGolpes = (archivoDeMusica: string): string[] => ['beats', archivoDeMusica, '--json']

/** de lo que imprime `beats --json`: los golpes (segundos, en orden, positivos) y el tempo · null si no se entiende */
export function leerGolpes(salida: string): { golpes: number[]; bpm: number | null } | null {
  // el JSON es lo que va de la primera «{» a la última «}» (por si el CLI imprime algo antes o después)
  const a = salida.indexOf('{'), z = salida.lastIndexOf('}')
  if (a < 0 || z < a) return null
  let j: Record<string, unknown>
  try { j = JSON.parse(salida.slice(a, z + 1)) as Record<string, unknown> } catch { return null }
  if (!j || j.ok !== true) return null
  const t = Array.isArray(j.beatTimes) ? j.beatTimes : []
  const golpes = [...new Set(t.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0))].sort((a, b) => a - b)
  return { golpes, bpm: typeof j.bpm === 'number' && Number.isFinite(j.bpm) ? j.bpm : null }
}

/** golpes mínimos para hablar de tempo */
export const GOLPES_MINIMOS_PARA_TEMPO = 8
/** variación máxima entre golpes (desvío / promedio) para llamar «claro» al tempo */
export const VARIACION_MAXIMA_PARA_TEMPO_CLARO = 0.1

/**
 * la confianza del tempo, medida por nosotros: con música tranquila el detector inventa un metrónomo irregular. Golpes parejos (variación de los
 * intervalos ≤ 10 %) y al menos 8 = `high`; menos golpes = `uncertain`; irregulares = `low`. Solo con `high` se mueven los cortes (ritmo.ts).
 */
export function confianzaDelTempo(golpes: number[]): 'high' | 'low' | 'uncertain' {
  if (golpes.length < GOLPES_MINIMOS_PARA_TEMPO) return 'uncertain'
  const intervalos = golpes.slice(1).map((g, i) => g - golpes[i])
  const media = intervalos.reduce((s, x) => s + x, 0) / intervalos.length
  if (!(media > 0)) return 'uncertain'
  const desvio = Math.sqrt(intervalos.reduce((s, x) => s + (x - media) ** 2, 0) / intervalos.length)
  // redondeado a la diezmilésima: el borde (justo 10 %) no depende del redondeo de los decimales
  return Math.round((desvio / media) * 1e4) / 1e4 <= VARIACION_MAXIMA_PARA_TEMPO_CLARO ? 'high' : 'low'
}

/** de `transcript.json`: la lista de palabras (lo que venga; la limpieza la hace la plataforma con sus reglas) */
export function leerTranscripcion(texto: string): unknown[] | null {
  let j: unknown
  try { j = JSON.parse(texto) } catch { return null }
  if (Array.isArray(j)) return j
  const o = j as Record<string, unknown>
  if (Array.isArray(o?.words)) return o.words as unknown[]
  if (Array.isArray(o?.segments)) return (o.segments as Array<Record<string, unknown>>).flatMap((s) => (Array.isArray(s?.words) ? (s.words as unknown[]) : []))
  return null
}

export interface ResultadoDelAnalisis {
  palabras: unknown[] | null
  /** el segundo en que empieza la voz (lo da el transcriptor) */
  inicio_de_voz: number | null
  motor: string | null
  golpes: number[] | null
  bpm: number | null
  confianza: 'high' | 'low' | 'uncertain' | null
  /** lo que no se pudo (una parte puede fallar sin tumbar la otra) */
  avisos: string[]
}

const require = createRequire(import.meta.url)

function correrCli(carpeta: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const cli = join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs')
  return new Promise((ok, mal) => {
    const hijo = spawn(process.execPath, [cli, ...args], { cwd: carpeta, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let salida = '', err = ''
    hijo.stdout.on('data', (d: Buffer) => { salida = (salida + d.toString('utf8')).slice(-4_000_000) })
    hijo.stderr.on('data', (d: Buffer) => { err = (err + d.toString('utf8')).slice(-4000) })
    const reloj = setTimeout(() => { hijo.kill('SIGKILL'); mal(new Error(`el análisis pasó de ${ANALISIS_MAX_MS / 60000} min y se cortó`)) }, ANALISIS_MAX_MS)
    hijo.on('error', (e) => { clearTimeout(reloj); mal(e) })
    hijo.on('close', (codigo) => { clearTimeout(reloj); codigo === 0 ? ok(salida) : mal(new Error(`hyperframes terminó con código ${codigo}: ${err.replace(/\s+/g, ' ').trim().slice(-800)}`)) })
  })
}

/** escucha los archivos: palabras y/o golpes. Devuelve el resultado como JSON (la fila guarda bytes). La carpeta se borra siempre */
export async function analizar(p: PedidoDeAnalisis, id: string, env: NodeJS.ProcessEnv): Promise<Buffer> {
  const carpeta = join(tmpdir(), 'render-html-analisis', id)
  await mkdir(carpeta, { recursive: true })
  const r: ResultadoDelAnalisis = { palabras: null, inicio_de_voz: null, motor: null, golpes: null, bpm: null, confianza: null, avisos: [] }
  try {
    if (p.voz) {
      try {
        const entrada = join(carpeta, p.voz.nombre)
        await writeFile(entrada, await bajarArchivo(p.voz.url, fetch, LIMITES.archivo_max_bytes))
        const { transcribe } = (await import('hyperframes/api')) as unknown as { transcribe: (o: ReturnType<typeof opcionesDeTranscripcion>) => Promise<{ kind: string; engine?: string; transcriptPath?: string; speechOnsetSeconds?: number | null }> }
        const t = await transcribe(opcionesDeTranscripcion(entrada, carpeta, p.idioma))
        if (t.kind !== 'transcribed' || !t.transcriptPath) throw new Error('el transcriptor no transcribió')
        r.palabras = leerTranscripcion(await readFile(t.transcriptPath, 'utf8'))
        r.inicio_de_voz = typeof t.speechOnsetSeconds === 'number' ? t.speechOnsetSeconds : null
        r.motor = t.engine ?? null
        if (!r.palabras) r.avisos.push('la transcripción no trae palabras legibles')
      } catch (e) {
        // sin voz el transcriptor dice «no_words»: no es una falla del servicio, es un video sin palabras
        r.avisos.push(`palabras: ${(e instanceof Error ? e.message : String(e)).slice(0, 400)}`)
      }
    }
    if (p.musica) {
      try {
        const entrada = join(carpeta, p.musica.nombre)
        await writeFile(entrada, await bajarArchivo(p.musica.url, fetch, LIMITES.archivo_max_bytes))
        const g = leerGolpes(await correrCli(carpeta, argumentosDeGolpes(p.musica.nombre), env))
        if (!g) throw new Error('no se entendió lo que devolvió el detector de golpes')
        r.golpes = g.golpes
        r.bpm = g.bpm
        r.confianza = confianzaDelTempo(g.golpes)
      } catch (e) {
        r.avisos.push(`golpes: ${(e instanceof Error ? e.message : String(e)).slice(0, 400)}`)
      }
    }
    return Buffer.from(JSON.stringify(r), 'utf8')
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => undefined)
  }
}
