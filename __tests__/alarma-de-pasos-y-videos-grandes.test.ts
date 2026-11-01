/**
 * «ALARMA DE PASOS ABANDONADOS Y VIDEOS GRANDES» (01-nov · CC-CEREBRO) · US$ 0, sin red: la base, Slack, el servicio de voz y ffmpeg son falsos.
 * (1) un paso que queda «abandonado» avisa UNA vez a #alertas · (2) los videos de más de 24 MB se transcriben partiendo el audio y uniendo el texto en orden.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { MAX_INTENTOS_DE_UN_PASO, PLAZO_DE_UN_PASO_MS, reabrirPaso, reclamarPaso, textoDelAvisoDePasoAbandonado, type Db, type PasoAbandonado } from '../src/lib/portero-alimenta/pasos-diarios'
import { correrUnPaso } from '../src/lib/portero-alimenta/redes-ruta'
import { avisarPorIncidente } from '../src/lib/portero-alimenta/alertas'
import { BYTES_MAXIMOS_PARA_TRANSCRIBIR, DURACION_MAXIMA_DE_UN_VIDEO_GRANDE_S, partirAudio, SIN_AUDIO_LEGIBLE, transcribirVideos } from '../src/lib/portero-alimenta/transcripcion-de-videos'

type Fila = Record<string, unknown>
const ahora = new Date('2026-11-02T15:00:00Z')
const DIA = '2026-11-02'
const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'

function basePasos(inicial: Fila[] = []) {
  const filas: Fila[] = inicial.map((f, i) => ({ id: `p${i}`, ...f }))
  let n = 100
  const db: Db = {
    from() {
      const filtros: Array<[string, unknown]> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Fila = {}
      let devolver = false
      const q: Record<string, unknown> = {}
      const quien = () => filas.filter((f) => filtros.every(([c, v]) => f[c] === v))
      const ejecutar = () => {
        if (op === 'insert') {
          if (filas.some((f) => f.client_id === payload.client_id && f.dia === payload.dia && f.paso === payload.paso)) return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
          const nueva = { id: `p${++n}`, ...payload }; filas.push(nueva); return { data: devolver ? [{ id: nueva.id }] : null, error: null }
        }
        if (op === 'update') { const x = quien(); x.forEach((f) => Object.assign(f, payload)); return { data: devolver ? x.map((f) => ({ id: f.id })) : null, error: null } }
        return { data: quien().map((f) => ({ ...f })), error: null }
      }
      q.select = () => { devolver = true; return q }
      q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
      q.limit = () => q
      q.insert = (f: Fila) => { op = 'insert'; payload = f; return q }
      q.update = (f: Fila) => { op = 'update'; payload = f; return q }
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej)
      return q
    },
  }
  return { db, filas }
}
const atascado = (extra: Fila = {}): Fila => ({ client_id: CID, dia: DIA, paso: 'tendencias', estado: 'en_curso', intentos: MAX_INTENTOS_DE_UN_PASO, iniciado_en: ahora.toISOString(), workflow_execution_id: 'ex-1', ...extra })
const tarde = new Date(ahora.getTime() + PLAZO_DE_UN_PASO_MS + 1000)

// ───────────────────────────────────────── 1 · la alarma
describe('1 · un paso abandonado avisa UNA vez', () => {
  it('al pasar a «abandonada» llama al aviso una sola vez con cliente, paso, día e intentos', async () => {
    const { db, filas } = basePasos([atascado()])
    const avisos: PasoAbandonado[] = []
    const r = await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar: async (p) => { avisos.push(p) } })
    expect(r).toMatchObject({ ok: false, motivo: 'abandonada' })
    expect(filas[0].estado).toBe('abandonada')
    expect(avisos).toEqual([{ clientId: CID, dia: DIA, paso: 'tendencias', intentos: 3, iniciadoEn: ahora.toISOString(), ultimoError: null, ejecucionId: 'ex-1' }])
  })
  it('🔴 la 2.ª llamada (ya abandonada) NO avisa de nuevo', async () => {
    const { db } = basePasos([atascado()])
    let n = 0
    const alAbandonar = async () => { n++ }
    await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar })
    await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: new Date(tarde.getTime() + PLAZO_DE_UN_PASO_MS), alAbandonar })
    await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: new Date(tarde.getTime() + 3 * PLAZO_DE_UN_PASO_MS), alAbandonar })
    expect(n).toBe(1)
  })
  it('🔴 dos llamadas a la vez sobre el mismo paso atascado: un solo aviso', async () => {
    const { db } = basePasos([atascado()])
    let n = 0
    const alAbandonar = async () => { n++ }
    await Promise.all([reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar }), reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar })])
    expect(n).toBe(1)
  })
  it('si todo va bien (un paso nuevo, o retomado con intentos de sobra) hay silencio', async () => {
    const { db } = basePasos([atascado({ intentos: 1 })])
    let n = 0
    const alAbandonar = async () => { n++ }
    expect(await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar })).toMatchObject({ ok: true, intento: 2 })
    expect(await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'bodega', ahora, alAbandonar })).toMatchObject({ ok: true })
    expect(n).toBe(0)
  })
  it('un aviso que falla (Slack caído) no rompe el reclamo ni deja el paso a medias', async () => {
    const { db, filas } = basePasos([atascado()])
    const r = await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar: async () => { throw new Error('slack caído') } })
    expect(r).toMatchObject({ ok: false, motivo: 'abandonada' })
    expect(filas[0].estado).toBe('abandonada')
  })
  it('el último error sale de lo que dejó el paso, si dejó algo', async () => {
    const { db } = basePasos([atascado({ resumen: { errores: ['uno', 'tiempo agotado en Apify'] } })])
    const avisos: PasoAbandonado[] = []
    await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde, alAbandonar: async (p) => { avisos.push(p) } })
    expect(avisos[0].ultimoError).toBe('tiempo agotado en Apify')
  })
  it('el texto dice cliente, paso, día, intentos, último error y cómo reintentar', () => {
    const t = textoDelAvisoDePasoAbandonado({ clientId: CID, dia: DIA, paso: 'bodega', intentos: 3, iniciadoEn: null, ultimoError: null, ejecucionId: null })
    expect(t).toContain(CID); expect(t).toContain('bodega'); expect(t).toContain(DIA); expect(t).toContain('3 intentos')
    expect(t).toMatch(/se cortó antes de cerrar/)
    expect(t).toContain('Para reintentar: POST /api/brain/alimentar/redes')
    expect(t).toContain('"reintentar":true')
    expect(textoDelAvisoDePasoAbandonado({ clientId: CID, dia: DIA, paso: 'bodega', intentos: 3, iniciadoEn: null, ultimoError: 'HTTP 500', ejecucionId: null })).toContain('HTTP 500')
  })
  it('🔴 de punta a punta con la huella real: el mismo incidente repetido NO publica un segundo mensaje en #alertas', async () => {
    const mensajes: Array<{ text: string; thread_ts?: string }> = []
    const alertas: Fila[] = []
    const dbAlertas = {
      from() {
        const filtros: Array<[string, unknown]> = []
        let op = 'select'; let payload: Fila = {}
        const q: Record<string, unknown> = {}
        const ejecutar = () => {
          if (op === 'insert') { alertas.push({ id: `a${alertas.length}`, ...payload }); return { data: null, error: null } }
          if (op === 'update') { alertas.filter((f) => filtros.every(([c, v]) => f[c] === v)).forEach((f) => Object.assign(f, payload)); return { data: null, error: null } }
          return { data: alertas.filter((f) => filtros.every(([c, v]) => f[c] === v)), error: null }
        }
        q.select = () => q; q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }; q.is = (c: string, v: unknown) => { filtros.push([c, v]); return q }
        q.gte = () => q; q.order = () => q; q.limit = () => q; q.in = () => q
        q.insert = (f: Fila) => { op = 'insert'; payload = f; return q }; q.update = (f: Fila) => { op = 'update'; payload = f; return q }
        q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej)
        return q
      },
    }
    const slack = async (_u: string, i?: RequestInit) => { const b = JSON.parse(String(i?.body)); mensajes.push(b); return new Response(JSON.stringify({ ok: true, ts: `${mensajes.length}.0` }), { status: 200 }) }
    const avisar = avisarPorIncidente({ db: dbAlertas as never, token: 'x', fetchImpl: slack, ahora: () => ahora })
    const p: PasoAbandonado = { clientId: CID, dia: DIA, paso: 'tendencias', intentos: 3, iniciadoEn: null, ultimoError: null, ejecucionId: null }
    const clave = `paso-abandonado:${CID}:${DIA}:tendencias`
    await avisar(textoDelAvisoDePasoAbandonado(p), clave)
    await avisar(textoDelAvisoDePasoAbandonado(p), clave)
    expect(mensajes.filter((m) => !m.thread_ts)).toHaveLength(1)
    expect(mensajes[0].text).toContain('Paso abandonado')
  })
})

describe('reintentar un paso abandonado', () => {
  it('reabre SOLO uno abandonado de hoy; uno hecho o en curso no se toca', async () => {
    const { db, filas } = basePasos([atascado({ estado: 'abandonada' }), { client_id: CID, dia: DIA, paso: 'bodega', estado: 'hecha', intentos: 1, iniciado_en: ahora.toISOString() }])
    expect(await reabrirPaso(db, { clientId: CID, dia: DIA, paso: 'bodega' })).toEqual({ ok: true, reabierto: false })
    expect(filas[1].estado).toBe('hecha')
    expect(await reabrirPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias' })).toEqual({ ok: true, reabierto: true })
    expect(filas[0]).toMatchObject({ estado: 'en_curso', intentos: 1 })
  })
  it('con `reintentar` el paso abandonado se vuelve a correr (intento 2, cierra) y no avisa otra vez', async () => {
    const { db, filas } = basePasos([atascado({ estado: 'abandonada' })])
    const vacia = crearBaseFalsa({ clients: [], client_sedes: [] }).db
    const mixta: Db = { from: (t: string) => (t === 'cerebro_pasos_diarios' ? db.from(t) : vacia.from(t)) }
    let avisos = 0
    const r = await correrUnPaso({ db: mixta, ahora, env: { PORTERO_TENDENCIAS: 'on' }, alAbandonar: async () => { avisos++ } }, { clientId: CID, paso: 'tendencias', workflowId: 'w', ejecucionId: 'e', dry_run: false, reintentar: true })
    expect(r).toMatchObject({ estado: 'con_errores', intento: 2, rastro_cerrado: true })
    expect(filas[0].estado).toBe('con_errores')
    expect(avisos).toBe(0)
  })
  it('correrUnPaso pasa el aviso: un paso atascado en su 3.er intento avisa una vez al reclamarlo', async () => {
    const { db } = basePasos([atascado({ iniciado_en: '2026-11-02T00:00:00Z' })])
    let avisos = 0
    const r = await correrUnPaso({ db: db as never, ahora, env: { PORTERO_TENDENCIAS: 'on' }, alAbandonar: async () => { avisos++ } }, { clientId: CID, paso: 'tendencias', workflowId: 'w', ejecucionId: 'e', dry_run: false })
    expect(r).toMatchObject({ estado: 'no_se_reclamo', motivo: 'abandonada' })
    expect(avisos).toBe(1)
  })
  it('la ruta usa UNA clave por cliente, día y paso y entrega `reintentar`', () => {
    const t = readFileSync('src/app/api/brain/alimentar/redes/route.ts', 'utf8')
    expect(t).toContain('`paso-abandonado:${p.clientId}:${p.dia}:${p.paso}`')
    expect(t).toContain('reintentar: b.reintentar === true')
    expect(t).toContain('avisarPorIncidente')
  })
  it('sin `reintentar` un abandonado sigue sin correr', async () => {
    const { db } = basePasos([atascado({ estado: 'abandonada', iniciado_en: '2026-11-02T00:00:00Z' })])
    const r = await correrUnPaso({ db: db as never, ahora, env: { PORTERO_TENDENCIAS: 'on' } }, { clientId: CID, paso: 'tendencias', workflowId: 'w', ejecucionId: 'e', dry_run: false })
    expect(r).toMatchObject({ estado: 'no_se_reclamo', motivo: 'abandonada' })
  })
})

// ───────────────────────────────────────── 2 · videos grandes
interface Video { id: string; post_id: string; path: string; bytes: number | null; duracion_s: number | null; transcripcion?: string | null }
const GRANDE = BYTES_MAXIMOS_PARA_TRANSCRIBIR + 1_000_000
/** ffmpeg falso: escribe `n` trozos con el contenido pedido en la carpeta de salida (el patrón es el último argumento) */
const ffmpegFalso = (trozos: string[], ok = true) => async (_cmd: string, args: string[]) => {
  const patron = args[args.length - 1]
  const dir = dirname(patron)
  for (let i = 0; i < trozos.length; i++) await writeFile(join(dir, `a${String(i).padStart(3, '0')}.mp3`), Buffer.from(trozos[i]))
  return { ok, salida: ok ? '' : 'error' }
}
function almacen(videos: Video[], voz: (cuerpo: string, n: number) => Response | string) {
  const parches: Array<{ url: string; cuerpo: Fila }> = []
  const envios: Array<{ nombre: string; tipo: string; bytes: number }> = []
  let n = 0
  const traer = async (u: string, i?: RequestInit): Promise<Response> => {
    const metodo = i?.method ?? 'GET'
    if (u.includes('/rest/v1/client_videos') && metodo === 'GET') return new Response(JSON.stringify(videos), { status: 200 })
    if (u.includes('/storage/v1/object/client-videos/')) return new Response(new Uint8Array(GRANDE), { status: 200 })
    if (u.includes('api.openai.com')) {
      const f = (i?.body as FormData).get('file') as File
      envios.push({ nombre: f.name, tipo: f.type, bytes: f.size })
      const x = voz(f.name, n++)
      return x instanceof Response ? x : new Response(JSON.stringify({ text: x }), { status: 200 })
    }
    if (metodo === 'PATCH') { parches.push({ url: u, cuerpo: JSON.parse(String(i?.body)) }); return new Response(null, { status: 204 }) }
    return new Response('?', { status: 404 })
  }
  return { traer, parches, envios }
}
const BASE = { urlDeLaBase: 'https://x.supabase.co', llave: 'k', openaiKey: 'o' }
const grande = (extra: Partial<Video> = {}): Video => ({ id: 'idG', post_id: 'De5fs8LR-84', path: 'ccc/propio/h/p.mp4', bytes: GRANDE, duracion_s: 1500, ...extra })

describe('2 · videos de más de 24 MB: se parte el audio y se une el texto en orden', () => {
  it('🔴 manda un trozo de audio por vez, cada uno bajo el límite, y une el texto EN ORDEN', async () => {
    const a = almacen([grande()], (nombre) => ({ 'trozo0.mp3': 'primero hola a todos', 'trozo1.mp3': 'segundo seguimos con el tema', 'trozo2.mp3': 'tercero y nos despedimos' }[nombre] ?? 'x'))
    const r = await transcribirVideos({ clientId: CID, ...BASE, fetchImpl: a.traer, ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso(['a', 'b', 'c']) })
    expect(r).toMatchObject({ transcritos: 1, fallidos: [], omitidos: [] })
    expect(a.envios.map((e) => e.nombre)).toEqual(['trozo0.mp3', 'trozo1.mp3', 'trozo2.mp3'])
    expect(a.envios.every((e) => e.tipo === 'audio/mpeg' && e.bytes < BYTES_MAXIMOS_PARA_TRANSCRIBIR)).toBe(true)
    expect(a.parches).toHaveLength(1)
    expect(a.parches[0].cuerpo.transcripcion).toBe('primero hola a todos segundo seguimos con el tema tercero y nos despedimos')
    expect(a.parches[0].url).toContain('transcripcion=is.null')
  })
  it('el costo es por la duración real del video (25 min = US$ 0,15)', async () => {
    const a = almacen([grande()], () => 'una frase con varias palabras claras')
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso(['a']) })
    expect(r.costo_usd).toBe(0.15)
  })
  it('un video de más de 30 min se omite sin gastar', async () => {
    const a = almacen([grande({ duracion_s: DURACION_MAXIMA_DE_UN_VIDEO_GRANDE_S + 1 })], () => 'x')
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso(['a']) })
    expect(r.omitidos[0].causa).toMatch(/30 minutos/)
    expect(a.envios).toHaveLength(0)
  })
  it('🔴 si un trozo falla NO se escribe un texto a medias: el video entero se dice como fallido', async () => {
    const a = almacen([grande()], (_n, i) => (i === 1 ? new Response('cuota', { status: 429 }) : 'una frase con varias palabras claras'))
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso(['a', 'b', 'c']) })
    expect(r.fallidos[0].causa).toMatch(/429/)
    expect(a.parches).toHaveLength(0)
    expect(r.costo_usd).toBe(0)
    expect(a.envios).toHaveLength(2) // se detiene en el trozo que falló: no sigue pagando los demás
  })
  it('🔴 ffmpeg corta cada 10 min y un trozo que aún pasa el límite se rechaza', async () => {
    const vistos: string[][] = []
    const ok = await partirAudio({ bytes: Buffer.from('x'), ffmpeg: 'ffmpeg', ejecutar: async (c, args) => { vistos.push(args); return ffmpegFalso(['a'])(c, args) } })
    expect(ok.ok).toBe(true)
    expect(vistos[0][vistos[0].indexOf('-segment_time') + 1]).toBe('600')
    const enorme = await partirAudio({ bytes: Buffer.from('x'), ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso(['x'.repeat(BYTES_MAXIMOS_PARA_TRANSCRIBIR + 1)]) })
    expect(enorme).toEqual({ ok: false, causa: 'un trozo de audio sigue pasando el límite' })
  })
  it('sin ffmpeg, o si ffmpeg falla, se DICE y no se marca ni se escribe nada', async () => {
    const a = almacen([grande()], () => 'x')
    const sin = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, ffmpeg: null })
    expect(sin.fallidos[0].causa).toMatch(/ffmpeg no está disponible/)
    const mal = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, ffmpeg: 'ffmpeg', ejecutar: async () => ({ ok: false, salida: 'boom' }) })
    expect(mal.fallidos[0].causa).toMatch(/no se pudo partir el audio/)
    expect(a.parches).toHaveLength(0)
  })
  it('un video grande sin audio se dice, no se lee como «sin voz»', async () => {
    const r = await partirAudio({ bytes: Buffer.from('x'), ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso([], true) })
    expect(r).toEqual({ ok: false, causa: 'el video no tiene audio' })
  })
  it('audio que el servicio no decodifica (400) en un video grande: se marca y no se reintenta', async () => {
    const a = almacen([grande()], () => new Response('{"error":{"message":"The audio file could not be decoded"}}', { status: 400 }))
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, ffmpeg: 'ffmpeg', ejecutar: ffmpegFalso(['a']) })
    expect(a.parches.map((p) => p.cuerpo.transcripcion)).toEqual([SIN_AUDIO_LEGIBLE])
    expect(r.omitidos).toHaveLength(1)
  })
  it('un video chico sigue yendo entero, sin partir (ffmpeg no se toca)', async () => {
    let llamado = false
    const a = almacen([grande({ bytes: 1_000_000, duracion_s: 30 })], () => 'una frase con varias palabras claras')
    // el almacén falso devuelve GRANDE bytes al bajar; aquí se prueba solo la decisión por el tamaño del archivo bajado
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: async (u, i) => (u.includes('/storage/') ? new Response(new Uint8Array(1000), { status: 200 }) : a.traer(u, i)), ffmpeg: 'ffmpeg', ejecutar: async () => { llamado = true; return { ok: true, salida: '' } } })
    expect(llamado).toBe(false)
    expect(r.transcritos).toBe(1)
  })
})
