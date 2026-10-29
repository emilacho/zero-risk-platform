/**
 * LOS ADAPTADORES REALES de los puertos de las notas del dueño: la base (Supabase) y Slack. Todo recibe sus dependencias por parámetro (base, `fetch`, llaves) para probarse sin red.
 * Un fallo de Slack nunca se lanza. Un error de lectura de la base NUNCA se lee como «vacío».
 */
import { registrarEventoDeEmilio } from '@/lib/oficina/eventos-de-emilio/registrar'
import { BLOQUE_DEL_MOTIVO, CALLBACK_DEL_RECHAZO, CAMPO_DEL_MOTIVO } from './interpretar'
import { mensajeDeLaPieza, type PiezaParaSlack } from './mensaje-pieza'
import { seleccionarNotas, unirVistas, vistasDelCerebro, type NotaVista } from './autorevision'
import { cuerpoParaLaPuerta, enviarALaPuerta, leerDeLaPuerta } from './puerta-del-dueno'
import type { EstadoDeEnvio, Nota, NotaNueva, PiezaDeBandeja, PuertosDeNotas, ResultadoDeNota } from './tipos'

type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
type Fetch = typeof fetch
const DUPLICADO = '23505'

export interface EntornoDeNotas {
  /** dirección de la plataforma (para llamar a `PATCH /api/hitl/[id]`) */
  baseUrl: string
  internalKey: string
  slackToken?: string
  /**
   * `NOTAS_AL_CEREBRO=1`: ENCIENDE el empuje a la puerta del dueño. Apagado (por omisión) las notas se encolan como pendientes y NADA se envía: la puerta aún no atiende `acumula` (Lenovo anterior: «hasta que CC-CEREBRO avise que está
   * publicado, no se enciende el empuje»). Al encenderlo, la siguiente vuelta sube todo lo encolado, de la más vieja a la más nueva.
   */
  alCerebro?: boolean
  /** el reloj (solo para pruebas) */
  ahora?: () => Date
  /** a dónde avisa cuando una nota se descarta (por omisión `#alertas`) */
  canalAlertas?: string
  /** a dónde llega la pieza: el canal de la oficina que la produjo (`C…`/`G…`). Regla firmada (13:07): cada oficina habla con Emilio por SU canal; nada de mensajes directos */
  destino?: string
}

const esObjeto = (x: unknown): x is Fila => x !== null && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

function aPieza(f: Fila): PiezaDeBandeja {
  const meta = esObjeto(f.metadata) ? f.metadata : {}
  const s = esObjeto(meta.slack) ? meta.slack : null
  return {
    hitl_id: String(f.id), client_id: String(f.client_id), type: String(f.type ?? ''), status: String(f.status ?? ''), output_id: texto(f.output_id),
    titulo: texto(f.title) ?? 'Pieza', familia: texto(meta.familia) ?? texto(meta.tipo_de_grupo), version: texto(meta.version) ?? texto(meta.version_encargo),
    slack: s && texto(s.canal) && texto(s.ts) ? { canal: String(s.canal), ts: String(s.ts) } : null,
  }
}
const aNota = (f: Fila): Nota => ({
  id: String(f.id), client_id: String(f.client_id), alcance: f.alcance as Nota['alcance'], tipo: f.tipo as Nota['tipo'], comentario: texto(f.comentario), hitl_id: texto(f.hitl_id), output_id: texto(f.output_id),
  pieza_titulo: texto(f.pieza_titulo), pieza_version: texto(f.pieza_version), pieza_familia: texto(f.pieza_familia), origen: f.origen as Nota['origen'], autor: String(f.autor), clave_unica: String(f.clave_unica), creada_en: String(f.creada_en),
})

export const MAX_GENERALES = 15
/** las notas «general:» (valen para todos los clientes), de la más nueva a la más vieja; un error de lectura se LANZA (nunca se lee como «no hay») */
export async function leerGenerales(db: Db, limite = MAX_GENERALES): Promise<Nota[]> {
  const r = await db.from('notas_del_dueno').select('*').eq('alcance', 'general').order('creada_en', { ascending: false }).limit(limite)
  if (r.error) throw new Error(`notas_del_dueno: ${r.error.message}`)
  return ((r.data ?? []) as Fila[]).map(aNota)
}

/**
 * LO QUE LEE LA AUTO-REVISIÓN DEL PRODUCTOR: lo último que dijo el dueño de ESTE cliente, tomado del CEREBRO (única fuente de verdad), más las notas «general:» del registro.
 * La tabla del registro ya NO es la fuente de las notas del cliente. Si el cerebro falla se sigue con las generales y el motivo viaja en `error`; si lo que falla es el registro de las generales, igual: nada frena a la pieza.
 */
export async function leerNotasParaElProductor(db: Db, env: { baseUrl: string; internalKey: string }, f: Fetch, client_id: string): Promise<{ notas: NotaVista[]; error?: string }> {
  const errores: string[] = []
  let delCerebro: NotaVista[] = []
  // dos lecturas: (1) lo del canal creativo con tope propio (cuando la puerta lo atienda; hoy lo ignora) y (2) lo último que dijo el dueño en general (pauta, sedes, buzón…); sin repetir
  const [creativo, general] = await Promise.all([leerDeLaPuerta(env, f, client_id, { canal: '#oficina-creativa', limite: 20 }), leerDeLaPuerta(env, f, client_id)])
  if (creativo.ok || general.ok) {
    const vistas = new Set<string>()
    const juntas = [...(creativo.ok ? creativo.respuestas : []), ...(general.ok ? general.respuestas : [])].filter((x) => (vistas.has(x.ficha_id) ? false : (vistas.add(x.ficha_id), true)))
    delCerebro = vistasDelCerebro(juntas)
  }
  if (!creativo.ok && !general.ok) errores.push(`cerebro: ${general.error}`)
  else if (!general.ok) errores.push(`cerebro (lectura general): ${general.error}`)
  let generales: NotaVista[] = []
  try { generales = seleccionarNotas(await leerGenerales(db)) } catch (e) { errores.push(`generales: ${e instanceof Error ? e.message : String(e)}`) }
  return { notas: unirVistas(delCerebro, generales), ...(errores.length ? { error: errores.join(' · ') } : {}) }
}

export function puertosDeNotas(db: Db, env: EntornoDeNotas, f: Fetch = fetch): PuertosDeNotas {
  const slack = async (metodo: string, cuerpo: Fila): Promise<{ ok?: boolean; ts?: string; error?: string }> => {
    if (!env.slackToken) return { ok: false, error: 'sin_token' }
    try {
      const r = await f(`https://slack.com/api/${metodo}`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify(cuerpo) })
      return (await r.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string }
    } catch { return { ok: false, error: 'red' } }
  }
  return {
    async pieza(hitl_id) {
      const r = await db.from('hitl_queue').select('id,client_id,type,status,output_id,title,metadata').eq('id', hitl_id).maybeSingle()
      if (r.error) throw new Error(`hitl_queue: ${r.error.message}`)
      return r.data ? aPieza(r.data as Fila) : null
    },
    async decidir(hitl_id, d) {
      try {
        const r = await f(`${env.baseUrl}/api/hitl/${hitl_id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json', 'x-api-key': env.internalKey },
          body: JSON.stringify({ status: d.status, reviewer: d.reviewer, decision: { origen: 'slack' }, ...(d.frase ? { frase_del_aprobador: d.frase } : {}) }),
        })
        if (!r.ok) return { ok: false, error: `PATCH /api/hitl respondió ${r.status}` }
        return { ok: true }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },
    async registrarEvento(e) {
      await registrarEventoDeEmilio(db as never, { canal: 'slack', ...e })
    },
    async guardarNota(n: NotaNueva): Promise<ResultadoDeNota> {
      const ins = await db.from('notas_del_dueno').insert(n).select('id').single()
      if (!ins.error) return { ok: true, id: String((ins.data as Fila).id), repetida: false }
      if (ins.error.code === DUPLICADO) {
        const ya = await db.from('notas_del_dueno').select('id').eq('clave_unica', n.clave_unica).maybeSingle()
        if (ya.error || !ya.data) return { ok: false, error: ya.error?.message ?? 'duplicada pero no se encuentra' }
        return { ok: true, id: String((ya.data as Fila).id), repetida: true }
      }
      return { ok: false, error: ins.error.message }
    },
    async hitlDelHilo(canal, ts) {
      const r = await db.from('hitl_queue').select('id').eq('type', 'content_piece_review').eq('metadata->slack->>canal', canal).eq('metadata->slack->>ts', ts).limit(1)
      if (r.error) throw new Error(`hitl_queue: ${r.error.message}`)
      const fila = ((r.data ?? []) as Fila[])[0]
      return fila ? String(fila.id) : null
    },
    async abrirModalDeRechazo(trigger_id, ctx) {
      const r = await slack('views.open', {
        trigger_id,
        view: {
          type: 'modal', callback_id: CALLBACK_DEL_RECHAZO, private_metadata: JSON.stringify({ hitl_id: ctx.hitl_id, canal: ctx.canal, ts: ctx.ts }),
          title: { type: 'plain_text', text: 'Rechazar la pieza' }, submit: { type: 'plain_text', text: 'Rechazar' }, close: { type: 'plain_text', text: 'Cancelar' },
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `*${ctx.titulo.slice(0, 200)}*` } },
            { type: 'input', optional: true, block_id: BLOQUE_DEL_MOTIVO, label: { type: 'plain_text', text: '¿Qué no te gustó? (queda como nota para próximas piezas)' }, element: { type: 'plain_text_input', action_id: CAMPO_DEL_MOTIVO, multiline: true, max_length: 2000 } },
          ],
        },
      })
      return r.ok === true
    },
    async responderEnHilo(canal, ts, texto_) { await slack('chat.postMessage', { channel: canal, thread_ts: ts, text: texto_ }) },
    async enviarAlCerebro(n, ctx) { return enviarNotaAlCerebro(db, env, f, n, ctx) },
  }
}

/**
 * EL ENVÍO AL CEREBRO, con su cola: cada nota que sube tiene una fila en `notas_del_dueno_envios` (pendiente → enviada | rechazada). Si el cerebro no responde queda PENDIENTE y `reintentarPendientes` la sube en la siguiente vuelta.
 * Idempotente: una nota ya enviada no se vuelve a enviar (y la puerta además reconoce la misma respuesta repetida). Nunca lanza.
 */
export async function enviarNotaAlCerebro(db: Db, env: EntornoDeNotas, f: Fetch, n: NotaNueva & { id: string }, ctx: { ts: string; canal_slack: string; respondido_en: string }): Promise<EstadoDeEnvio> {
  try {
    const ins = await db.from('notas_del_dueno_envios').insert({ nota_id: n.id, estado: 'pendiente', intentos: 0, ts: ctx.ts, canal_slack: ctx.canal_slack, respondido_en: ctx.respondido_en })
    if (ins.error) {
      if (ins.error.code !== DUPLICADO) return 'pendiente' // sin fila no hay cola: el clic se puede repetir (todo es idempotente)
      const ya = await db.from('notas_del_dueno_envios').select('estado,proximo_intento').eq('nota_id', n.id).maybeSingle()
      if (ya.error || !ya.data) return 'pendiente'
      const e = (ya.data as Fila).estado
      if (e === 'enviada' || e === 'rechazada') return e
      // un clic o comentario REPETIDO sobre una nota que ya espera su turno no gasta intentos antes de tiempo
      const proximo = (ya.data as Fila).proximo_intento
      if (proximo && Date.parse(String(proximo)) > (env.ahora?.() ?? new Date()).getTime()) return 'pendiente'
    }
    if (!env.alCerebro) return 'pendiente' // encolada; el empuje está apagado
    return await intentarEnvio(db, env, f, n, ctx)
  } catch { return 'pendiente' }
}

/**
 * CANON DE LOOPS (6 guardarraíles): reintentos con TOPE, espera CRECIENTE y cola de descarte. Cuatro intentos en total (1 + 3 reintentos); entre uno y otro esperan 5, 20 y 60 minutos.
 * Al cuarto fallo transitorio la nota pasa a «rechazada» (cola de descarte) con el motivo y se AVISA a #alertas: nada reintenta para siempre ni bloquea a las notas nuevas.
 */
export const MAX_INTENTOS = 4
export const ESPERAS_MIN = [5, 20, 60]

async function avisarDescarte(env: EntornoDeNotas, f: Fetch, n: NotaNueva & { id: string }, intentos: number, motivo: string): Promise<void> {
  if (!env.slackToken) return
  try {
    await f('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify({ channel: env.canalAlertas ?? 'C0B7XUUEBHA', text: `⚠️ Una nota del dueño NO llegó al cerebro tras ${intentos} intentos y se descartó de la cola (cliente ${n.client_id}, pieza ${n.hitl_id ?? 'sin id'}): ${motivo}. Sigue en el registro; hay que mirar la puerta del dueño.` }) })
  } catch { /* un fallo de Slack nunca frena nada */ }
}

async function intentarEnvio(db: Db, env: EntornoDeNotas, f: Fetch, n: NotaNueva & { id: string }, ctx: { ts: string; canal_slack: string; respondido_en: string }): Promise<EstadoDeEnvio> {
  if (!n.comentario || !n.hitl_id) return 'rechazada'
  const r = await enviarALaPuerta({ baseUrl: env.baseUrl, internalKey: env.internalKey }, f, cuerpoParaLaPuerta({ client_id: n.client_id, hitl_id: n.hitl_id, pieza_titulo: n.pieza_titulo, pieza_familia: n.pieza_familia, comentario: n.comentario, ts: ctx.ts, canal_slack: ctx.canal_slack, respondido_en: ctx.respondido_en }))
  const previo = await db.from('notas_del_dueno_envios').select('intentos').eq('nota_id', n.id).maybeSingle()
  const intentos = Number((previo.data as Fila | null)?.intentos ?? 0) + 1
  const reloj = env.ahora?.() ?? new Date()
  const ahora = reloj.toISOString()
  let estado: EstadoDeEnvio = r.ok ? 'enviada' : r.permanente ? 'rechazada' : 'pendiente'
  let ultimo_error: string | null = r.ok ? null : r.error
  let proximo_intento: string | null = null
  if (!r.ok && !r.permanente) {
    if (intentos >= MAX_INTENTOS) {
      estado = 'rechazada'
      ultimo_error = `descartada tras ${intentos} intentos: ${r.error}`
      await avisarDescarte(env, f, n, intentos, r.error)
    } else proximo_intento = new Date(reloj.getTime() + ESPERAS_MIN[Math.min(intentos, ESPERAS_MIN.length) - 1] * 60_000).toISOString()
  }
  await db.from('notas_del_dueno_envios').update({ estado, intentos, ultimo_error, proximo_intento, actualizada_en: ahora, ...(r.ok ? { enviada_en: ahora } : {}) }).eq('nota_id', n.id)
  return estado
}

/** la siguiente vuelta: sube las notas que quedaron pendientes (las más viejas primero, con tope). Nunca lanza. */
export async function reintentarPendientes(db: Db, env: EntornoDeNotas, f: Fetch = fetch, limite = 20): Promise<{ intentadas: number; enviadas: number; siguen: number; rechazadas: number; apagado?: true; error?: string }> {
  const cuenta = { intentadas: 0, enviadas: 0, siguen: 0, rechazadas: 0 }
  if (!env.alCerebro) return { ...cuenta, apagado: true } // el empuje al cerebro está apagado: lo encolado espera
  try {
    // las que llevan menos tiempo sin tocarse primero; las que están esperando su turno (espera creciente) no cuentan, así un grupo atascado no bloquea a las nuevas
    const p = await db.from('notas_del_dueno_envios').select('*').eq('estado', 'pendiente').order('actualizada_en', { ascending: true }).limit(200)
    if (p.error) return { ...cuenta, error: p.error.message }
    const ahoraMs = (env.ahora?.() ?? new Date()).getTime()
    const listas = ((p.data ?? []) as Fila[]).filter((e) => !e.proximo_intento || Date.parse(String(e.proximo_intento)) <= ahoraMs).slice(0, limite)
    for (const e of listas) {
      const nf = await db.from('notas_del_dueno').select('*').eq('id', String(e.nota_id)).maybeSingle()
      if (nf.error || !nf.data) { cuenta.siguen++; continue }
      const nota = aNota(nf.data as Fila)
      cuenta.intentadas++
      const est = await intentarEnvio(db, env, f, { ...nota, id: nota.id }, { ts: String(e.ts), canal_slack: String(e.canal_slack), respondido_en: String(e.respondido_en) })
      if (est === 'enviada') cuenta.enviadas++; else if (est === 'rechazada') cuenta.rechazadas++; else cuenta.siguen++
    }
    return cuenta
  } catch (e) { return { ...cuenta, error: e instanceof Error ? e.message : String(e) } }
}

/**
 * Llevar la pieza a Slack: publica el mensaje con botones en el canal de la oficina y guarda canal + ts en `hitl_queue.metadata.slack` (así se sabe de qué pieza es un hilo).
 * Nunca lanza: un fallo se devuelve como `{ ok: false }`; la pieza ya está en la bandeja y el tablero sigue siendo la otra vía. Nunca por mensaje directo: un destino que no sea un canal (`C…`/`G…`) se rechaza.
 */
export async function enviarPiezaASlack(db: Db, env: EntornoDeNotas, p: PiezaParaSlack, f: Fetch = fetch): Promise<{ ok: true; canal: string; ts: string } | { ok: false; error: string }> {
  if (!env.slackToken) return { ok: false, error: 'sin_token' }
  if (!env.destino) return { ok: false, error: 'sin_destino' }
  if (!/^[CG][A-Z0-9]+$/.test(env.destino)) return { ok: false, error: 'destino_no_es_un_canal: cada oficina habla con el dueño por su canal, nunca por mensaje directo' }
  try {
    const llamar = async (metodo: string, cuerpo: Fila) => (await (await f(`https://slack.com/api/${metodo}`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify(cuerpo) })).json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string; channel?: string | { id?: string } }
    const canal = env.destino
    const m = mensajeDeLaPieza(p)
    const post = await llamar('chat.postMessage', { channel: canal, text: m.text, blocks: m.blocks })
    if (!post.ok || !post.ts) return { ok: false, error: `chat.postMessage: ${post.error ?? 'sin ts'}` }
    const previa = await db.from('hitl_queue').select('metadata').eq('id', p.hitl_id).maybeSingle()
    if (previa.error || !previa.data) return { ok: false, error: `el mensaje salió pero no se pudo guardar su ts: ${previa.error?.message ?? 'pieza inexistente'}` }
    const meta = esObjeto((previa.data as Fila).metadata) ? ((previa.data as Fila).metadata as Fila) : {}
    const up = await db.from('hitl_queue').update({ metadata: { ...meta, slack: { canal, ts: post.ts } } }).eq('id', p.hitl_id)
    if (up.error) return { ok: false, error: `el mensaje salió pero no se pudo guardar su ts: ${up.error.message}` }
    return { ok: true, canal, ts: post.ts }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif)(\?|$)/i
/**
 * La pieza que se manda a Slack, armada desde lo que la oficina acaba de guardar: el nombre del cliente, el texto (pie de foto o texto de la pieza, de la salida guardada) y las imágenes entregadas.
 * Si la salida no se puede leer, se manda la vista previa de la bandeja: la pieza llega igual, solo con menos texto.
 */
export async function piezaParaSlackDeLaBandeja(db: Db, p: { hitl_id: string; client_id: string; output_id: string; titulo: string; vista_previa: string; metadata: Fila }): Promise<PiezaParaSlack> {
  let cliente = 'Cliente'
  let texto: string | null = p.vista_previa || null
  let hashtags: string[] = []
  try {
    const c = await db.from('clients').select('name').eq('id', p.client_id).maybeSingle()
    if (!c.error && c.data && texto_((c.data as Fila).name)) cliente = String((c.data as Fila).name)
    const o = await db.from('client_historical_outputs').select('content_text,content').eq('id', p.output_id).maybeSingle()
    const crudo = !o.error && o.data ? String((o.data as Fila).content_text ?? (o.data as Fila).content ?? '') : ''
    const m = /```json\s*([\s\S]*?)```/.exec(crudo)
    if (m) {
      const j: unknown = JSON.parse(m[1])
      if (esObjeto(j)) {
        const t = [j.pie_de_foto, j.texto, j.copy].find((x) => typeof x === 'string' && x.trim())
        if (typeof t === 'string') texto = t
        if (Array.isArray(j.hashtags)) hashtags = j.hashtags.filter((h): h is string => typeof h === 'string')
      }
    }
  } catch { /* la pieza llega igual con la vista previa */ }
  const enlaces = esObjeto(p.metadata.enlace_entrega) ? Object.values(p.metadata.enlace_entrega as Fila).filter((u): u is string => typeof u === 'string' && EXT_IMAGEN.test(u)) : []
  return { hitl_id: p.hitl_id, cliente, titulo: p.titulo, familia: texto_(p.metadata.familia), texto, hashtags, imagenes: enlaces }
}
const texto_ = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

/** el rastro de una auto-revisión (idempotente por `clave_unica`); un error de la base se lanza: quien llama (el orquestador) lo traga, porque el rastro nunca frena una entrega */
export async function registrarAutorevision(db: Db, r: { client_id: string; encargo_id: string; agente: string; paso: string; notas_vistas: string[]; choco: boolean; cambios: unknown[]; costo_usd: number; clave_unica: string }): Promise<void> {
  const ins = await db.from('autorevisiones_del_productor').insert(r)
  if (ins.error && ins.error.code !== DUPLICADO) throw new Error(`autorevisiones_del_productor: ${ins.error.message}`)
}
