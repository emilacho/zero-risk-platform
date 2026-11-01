/**
 * TRANSCRIPCIÓN DE LOS VIDEOS GUARDADOS (01-nov · encargo «fallas pendientes y retención», punto 2b).
 * Los videos de Instagram traían su transcripción; los de TikTok, de las tendencias y de la bodega no. Aquí el archivo guardado se transcribe (Whisper) y el texto se escribe en
 * `client_videos.transcripcion` SOLO si estaba vacía. Sin voz = marca «[sin voz]» (así no se vuelve a pagar). El gasto se registra en la libreta del portero (log-invocation).
 * Topes: archivo ≤ 24 MB (límite del servicio), video ≤ 10 min, `max` por corrida y un tope de gasto por corrida. Un video que falla no frena a los demás ni se lee como «sin voz».
 */
import { crearRegistrador } from '../cerebro/portero/registro'

export const MAX_TRANSCRIPCIONES_POR_CORRIDA = 6
export const BYTES_MAXIMOS_PARA_TRANSCRIBIR = 24 * 1024 * 1024
export const DURACION_MAXIMA_PARA_TRANSCRIBIR_S = 600
/** Whisper cobra US$ 0,006 por minuto de audio */
export const USD_POR_MINUTO_DE_WHISPER = 0.006
export const TOPE_DE_TRANSCRIPCION_POR_CORRIDA_USD = 0.1
export const SIN_VOZ = '[sin voz]'
const BUCKET = 'client-videos'

type Traer = (u: string, i?: RequestInit) => Promise<Response>
export interface InformeDeTranscripcion { pendientes: number; transcritos: number; sin_voz: number; omitidos: Array<{ post_id: string; causa: string }>; fallidos: Array<{ post_id: string; causa: string }>; costo_usd: number; omitidos_por_tope: number }

export const costoDeWhisper = (duracionS: number | null): number => Math.round(((duracionS && duracionS > 0 ? duracionS : 60) / 60) * USD_POR_MINUTO_DE_WHISPER * 1e6) / 1e6

/** Whisper devuelve texto vacío o frases sueltas de relleno cuando no hay voz: menos de 3 palabras = sin voz */
export function textoDeVoz(t: string): string {
  const limpio = t.replace(/\s+/g, ' ').trim()
  return limpio.split(' ').filter(Boolean).length >= 3 ? limpio.slice(0, 20000) : ''
}

export async function transcribirVideos(a: {
  /** null = la bodega (videos sin cliente) */
  clientId: string | null
  urlDeLaBase: string; llave: string; openaiKey: string
  fetchImpl?: Traer
  max?: number
  /** el registro del gasto (log-invocation); ausente = no se registra (pruebas) */
  registro?: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string }
  /** solo cuenta lo pendiente */
  soloContar?: boolean
}): Promise<InformeDeTranscripcion> {
  const inf: InformeDeTranscripcion = { pendientes: 0, transcritos: 0, sin_voz: 0, omitidos: [], fallidos: [], costo_usd: 0, omitidos_por_tope: 0 }
  if (!a.llave || !a.urlDeLaBase) { inf.fallidos.push({ post_id: '-', causa: 'la base no está configurada' }); return inf }
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const base = a.urlDeLaBase.replace(/\/$/, '')
  const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
  const filtroDeCliente = a.clientId ? `client_id=eq.${encodeURIComponent(a.clientId)}` : 'client_id=is.null'
  const r = await traer(`${base}/rest/v1/client_videos?${filtroDeCliente}&estado=eq.ok&transcripcion=is.null&path=not.is.null&archivo_borrado_en=is.null&select=id,post_id,path,bytes,duracion_s&order=created_at.desc&limit=500`, { headers: auth })
  if (!r.ok) { inf.fallidos.push({ post_id: '-', causa: `la lista de videos respondió ${r.status}` }); return inf }
  const filas = (await r.json()) as Array<{ id: string; post_id: string; path: string; bytes: number | null; duracion_s: number | null }>
  inf.pendientes = filas.length
  if (a.soloContar || !filas.length) return inf
  if (!a.openaiKey) { inf.fallidos.push({ post_id: '-', causa: 'falta la llave del servicio de voz' }); return inf }
  const registrar = a.registro ? crearRegistrador({ origen: a.registro.origen, llaveInterna: a.registro.llaveInterna, fetchImpl: a.fetchImpl }) : null
  let hechos = 0
  for (const v of filas) {
    if (hechos >= (a.max ?? MAX_TRANSCRIPCIONES_POR_CORRIDA)) break
    if ((v.bytes ?? 0) > BYTES_MAXIMOS_PARA_TRANSCRIBIR) { inf.omitidos.push({ post_id: v.post_id, causa: 'archivo de más de 24 MB' }); continue }
    if ((v.duracion_s ?? 0) > DURACION_MAXIMA_PARA_TRANSCRIBIR_S) { inf.omitidos.push({ post_id: v.post_id, causa: 'video de más de 10 minutos' }); continue }
    const costo = costoDeWhisper(v.duracion_s)
    if (inf.costo_usd + costo > TOPE_DE_TRANSCRIPCION_POR_CORRIDA_USD) { inf.omitidos_por_tope++; continue }
    hechos++
    try {
      const f = await traer(`${base}/storage/v1/object/${BUCKET}/${v.path.split('/').map(encodeURIComponent).join('/')}`, { headers: auth })
      if (!f.ok) { inf.fallidos.push({ post_id: v.post_id, causa: `el archivo respondió ${f.status}` }); continue }
      const bytes = Buffer.from(await f.arrayBuffer())
      if (bytes.length > BYTES_MAXIMOS_PARA_TRANSCRIBIR) { inf.omitidos.push({ post_id: v.post_id, causa: 'archivo de más de 24 MB' }); continue }
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), 'video.mp4')
      form.append('model', 'whisper-1')
      form.append('response_format', 'json')
      const inicio = Date.now()
      const w = await traer('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${a.openaiKey}` }, body: form })
      if (!w.ok) { inf.fallidos.push({ post_id: v.post_id, causa: `el servicio de voz respondió ${w.status}: ${(await w.text()).slice(0, 80)}` }); continue }
      const texto = textoDeVoz(String(((await w.json()) as { text?: unknown }).text ?? ''))
      inf.costo_usd = Math.round((inf.costo_usd + costo) * 1e6) / 1e6
      // "transcripcion is null" en el filtro: nunca pisa una transcripción que otro paso ya puso
      const p = await traer(`${base}/rest/v1/client_videos?id=eq.${v.id}&transcripcion=is.null`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ transcripcion: texto || SIN_VOZ }) })
      if (!p.ok) { inf.fallidos.push({ post_id: v.post_id, causa: `no se pudo escribir (${p.status})` }); continue }
      if (texto) inf.transcritos++; else inf.sin_voz++
      if (registrar && a.registro) {
        await registrar({
          workflow_id: a.registro.workflowId, workflow_execution_id: `${a.registro.ejecucionId}:voz:${v.post_id}`.slice(0, 200), agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: a.registro.ejecucionId,
          model: 'whisper-1', cost_usd: costo, duration_ms: Date.now() - inicio, tokens_input: 0, tokens_output: 0, num_turns: 1, status: 'completed',
          ...(a.clientId ? { client_id: a.clientId } : {}), command: 'portero.transcribir_video', response_text: (texto || SIN_VOZ).slice(0, 500), metadata: { video_id: v.id, duracion_s: v.duracion_s },
        })
      }
    } catch (e) { inf.fallidos.push({ post_id: v.post_id, causa: (e instanceof Error ? e.message : String(e)).slice(0, 100) }) }
  }
  return inf
}
