/**
 * LOS ADAPTADORES REALES de los puertos de las notas del dueño: la base (Supabase) y Slack. Todo recibe sus dependencias por parámetro (base, `fetch`, llaves) para probarse sin red.
 * Un fallo de Slack nunca se lanza. Un error de lectura de la base NUNCA se lee como «vacío».
 */
import { BLOQUE_DEL_MOTIVO, CALLBACK_DEL_RECHAZO, CAMPO_DEL_MOTIVO } from './interpretar'
import { mensajeDeLaPieza, type PiezaParaSlack } from './mensaje-pieza'
import type { Nota, NotaNueva, PiezaDeBandeja, PuertosDeNotas, ResultadoDeNota } from './tipos'

type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
type Fetch = typeof fetch
const DUPLICADO = '23505'

export interface EntornoDeNotas {
  /** dirección de la plataforma (para llamar a `PATCH /api/hitl/[id]`) */
  baseUrl: string
  internalKey: string
  slackToken?: string
  /** a dónde llega la pieza: un canal (`C…`/`G…`) o el id de una persona (`U…`, mensaje directo). Lo decide Emilio */
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

/** las notas de un cliente (las suyas y las generales), de la más nueva a la más vieja; un error de lectura se lanza */
export async function leerNotas(db: Db, client_id: string, limite = 50): Promise<Nota[]> {
  const r = await db.from('notas_del_dueno').select('*').or(`client_id.eq.${client_id},alcance.eq.general`).order('creada_en', { ascending: false }).limit(limite)
  if (r.error) throw new Error(`notas_del_dueno: ${r.error.message}`)
  return ((r.data ?? []) as Fila[]).map(aNota)
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
  }
}

/**
 * Llevar la pieza a Slack: publica el mensaje con botones en el destino de Emilio y guarda canal + ts en `hitl_queue.metadata.slack` (así se sabe de qué pieza es un hilo).
 * Nunca lanza: un fallo se devuelve como `{ ok: false }`; la pieza ya está en la bandeja y el tablero sigue siendo la otra vía. Para un mensaje directo se abre la conversación primero.
 */
export async function enviarPiezaASlack(db: Db, env: EntornoDeNotas, p: PiezaParaSlack, f: Fetch = fetch): Promise<{ ok: true; canal: string; ts: string } | { ok: false; error: string }> {
  if (!env.slackToken) return { ok: false, error: 'sin_token' }
  if (!env.destino) return { ok: false, error: 'sin_destino' }
  try {
    const llamar = async (metodo: string, cuerpo: Fila) => (await (await f(`https://slack.com/api/${metodo}`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify(cuerpo) })).json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string; channel?: string | { id?: string } }
    let canal = env.destino
    if (/^U[A-Z0-9]+$/.test(canal)) {
      const c = await llamar('conversations.open', { users: canal })
      const id = typeof c.channel === 'string' ? c.channel : c.channel?.id
      if (!c.ok || !id) return { ok: false, error: `conversations.open: ${c.error ?? 'sin canal'}` }
      canal = id
    }
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
