/**
 * APRENDER DE EMILIO · ETAPA 1 · el evento crudo e inmutable.
 * Todo lo que Emilio hace sobre una pieza (dashboard y Slack) se guarda TAL CUAL en `eventos_de_emilio`: decisión, comentario literal, láminas marcadas, foto del contexto.
 * No interpreta nada (eso son las etapas 2 a 5 del RAG). Nunca lanza ni frena la decisión de Emilio: si no puede guardar, lo dice en el resultado.
 * La jefatura y la segunda mirada GPT no importan este módulo (el segundo cerebro es del productor).
 */
import crypto from 'node:crypto'

export const TIPO_PIEZA = 'content_piece_review'
export const ESPECIALIDADES = ['texto', 'diseno', 'imagen', 'direccion'] as const
export type Especialidad = (typeof ESPECIALIDADES)[number]
export type CanalDeEmilio = 'dashboard' | 'slack'
export type AccionDeEmilio = 'aprobar' | 'rechazar' | 'pedir_cambios' | 'editar' | 'comentar' | 'abrir_rechazo'

export interface EventoDeEmilio {
  canal: CanalDeEmilio
  accion: AccionDeEmilio
  autor: string
  hitl_id: string
  comentario?: string | null
  laminas?: number[]
  especialidades?: string[]
  /** lo que la ruta respondió (estado HTTP, ronda, etc.) */
  resultado?: Record<string, unknown>
  /** el cuerpo como llegó (sin llaves ni secretos) */
  crudo?: Record<string, unknown>
  /** para Slack: canal + ts del mensaje (clave exacta); sin él, la clave usa el minuto */
  slack?: { canal: string; ts: string } | null
  ahora?: Date
}

type Fila = Record<string, unknown>
/** lo mínimo del cliente de base de datos que se usa (supabase-js lo cumple) */
export interface DbDeEventos { from(tabla: string): any }

const DECISION: Record<AccionDeEmilio, string> = { aprobar: 'aprobada', rechazar: 'rechazada', pedir_cambios: 'cambios_pedidos', editar: 'editada', comentar: 'comentario', abrir_rechazo: 'clic_rechazar' }
const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null)

/** el canal sale de quién decide: Slack firma como `slack:<usuario>`; el resto es el dashboard */
export const canalDelRevisor = (reviewer: unknown): CanalDeEmilio => (typeof reviewer === 'string' && reviewer.startsWith('slack:') ? 'slack' : 'dashboard')

/** especialidades válidas, sin repetir; lo desconocido se descarta (la clasificación fina es de la etapa 2) */
export function especialidadesValidas(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.map((x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')).filter((x): x is Especialidad => (ESPECIALIDADES as readonly string[]).includes(x)))]
}

export function claveDelEvento(e: Pick<EventoDeEmilio, 'canal' | 'accion' | 'hitl_id' | 'autor' | 'comentario' | 'laminas' | 'slack' | 'ahora'>): string {
  if (e.slack?.canal && e.slack.ts) return `${e.canal}:${e.accion}:${e.hitl_id}:${e.slack.canal}:${e.slack.ts}`
  const minuto = (e.ahora ?? new Date()).toISOString().slice(0, 16)
  const huella = crypto.createHash('sha256').update(JSON.stringify([e.autor, e.comentario ?? '', [...(e.laminas ?? [])].sort((a, b) => a - b)])).digest('hex').slice(0, 16)
  return `${e.canal}:${e.accion}:${e.hitl_id}:${huella}:${minuto}`
}

/** la FOTO del contexto en el momento del evento: cliente, industria, formato y quién escribió cada parte. Mejor esfuerzo: un hueco no impide guardar el evento. */
export async function fotoDelContexto(db: DbDeEventos, hitl_id: string): Promise<{ fila: Fila | null; contexto: Fila; faltas: string[] }> {
  const faltas: string[] = []
  const contexto: Fila = {}
  let fila: Fila | null = null
  try {
    const h = await db.from('hitl_queue').select('id,client_id,type,status,output_id,title,metadata').eq('id', hitl_id).maybeSingle()
    if (h.error) faltas.push(`hitl_queue: ${h.error.message}`)
    fila = (h.data as Fila | null) ?? null
  } catch (e) { faltas.push(`hitl_queue: ${e instanceof Error ? e.message : String(e)}`) }
  if (!fila) return { fila, contexto, faltas }
  const meta = esObjeto(fila.metadata) ? fila.metadata : {}
  contexto.tipo_de_bandeja = fila.type ?? null
  contexto.estado_de_la_pieza = fila.status ?? null
  for (const k of ['familia', 'red', 'formato', 'brief_id', 'imagen_generada', 'origen_de_imagenes_resumen', 'con_desacuerdo']) if (meta[k] !== undefined) contexto[k] = meta[k]
  if (fila.client_id) {
    try {
      const c = await db.from('clients').select('name,industry').eq('id', fila.client_id).maybeSingle()
      if (c.error) faltas.push(`clients: ${c.error.message}`)
      else if (c.data) { contexto.cliente = (c.data as Fila).name ?? null; contexto.industria = (c.data as Fila).industry ?? null }
    } catch (e) { faltas.push(`clients: ${e instanceof Error ? e.message : String(e)}`) }
  }
  try {
    const en = await db.from('oficina_encargos').select('id,brief_id,familia,version_encargo,estado,estado_del_motor,gasto_usd').eq('hitl_queue_id', hitl_id).limit(1)
    if (en.error) faltas.push(`oficina_encargos: ${en.error.message}`)
    const enc = ((en.data as Fila[] | null) ?? [])[0]
    if (enc) {
      contexto.encargo = { id: enc.id, brief_id: enc.brief_id, familia: enc.familia, version: enc.version_encargo, estado: enc.estado, gasto_usd: enc.gasto_usd }
      const tu = await db.from('oficina_turnos').select('paso,agente').eq('encargo_id', enc.id).order('n', { ascending: true }).limit(200)
      if (tu.error) faltas.push(`oficina_turnos: ${tu.error.message}`)
      else {
        const autores: Record<string, string[]> = {}
        for (const t of (tu.data as Fila[] | null) ?? []) {
          const a = texto(t.agente); const p = texto(t.paso)
          if (!a || !p) continue
          const lista = (autores[p] ??= [])
          if (!lista.includes(a)) lista.push(a)
        }
        contexto.autores_por_paso = autores
      }
    }
  } catch (e) { faltas.push(`oficina: ${e instanceof Error ? e.message : String(e)}`) }
  return { fila, contexto, faltas }
}

/** la nota tal como quedó en `notas_del_dueno` (lo que el empuje al cerebro necesita) */
export interface NotaEspejada {
  id: string; client_id: string; alcance: 'cliente'; tipo: 'aprobada' | 'rechazada' | 'editada' | 'comentario'; comentario: string | null; hitl_id: string; output_id: string | null
  pieza_titulo: string | null; pieza_version: string | null; pieza_familia: string | null; origen: 'tablero'; autor: string; clave_unica: string
}
/** sube la nota a la puerta del dueño del cerebro (con su cola de reintentos); nunca lanza */
export type EmpujeAlCerebro = (nota: NotaEspejada, ctx: { ts: string; canal_slack: string; respondido_en: string }) => Promise<unknown>

export type ResultadoDelEvento = { ok: true; id: string | null; repetido: boolean; /** el empuje al cerebro en curso (si hubo): quien llama lo deja correr con `waitUntil` */ empuje?: Promise<void> } | { ok: false; error: string }

/**
 * Guarda UN evento. Idempotente por `clave_unica` (el mismo clic o el mismo mensaje repetido no duplica). Solo piezas de la bandeja (`content_piece_review`).
 * Además, si `espejo` está encendido y el canal es el dashboard, deja la misma decisión en `notas_del_dueno` (origen «tablero»).
 */
export async function registrarEventoDeEmilio(db: DbDeEventos, e: EventoDeEmilio, opciones: { espejo?: boolean; alCerebro?: EmpujeAlCerebro } = {}): Promise<ResultadoDelEvento> {
  try {
    const foto = await fotoDelContexto(db, e.hitl_id)
    if (!foto.fila) return { ok: false, error: 'pieza_sin_fila' }
    if (foto.fila.type !== TIPO_PIEZA) return { ok: false, error: 'no_es_una_pieza' }
    const enc = esObjeto(foto.contexto.encargo) ? foto.contexto.encargo : {}
    const laminas = [...new Set((e.laminas ?? []).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b)
    const fila = {
      ocurrio_en: (e.ahora ?? new Date()).toISOString(), canal: e.canal, accion: e.accion, autor: e.autor,
      client_id: foto.fila.client_id ?? null, hitl_id: e.hitl_id, output_id: foto.fila.output_id ?? null, encargo_id: (enc.id as string | undefined) ?? null,
      brief_id: (enc.brief_id as string | undefined) ?? null, familia: (enc.familia as string | undefined) ?? (texto(foto.contexto.familia) ?? null), pieza_titulo: texto(foto.fila.title),
      laminas, especialidades: especialidadesValidas(e.especialidades), comentario: e.comentario ?? null, decision: DECISION[e.accion],
      resultado: e.resultado ?? {}, contexto: { ...foto.contexto, ...(foto.faltas.length ? { huecos: foto.faltas } : {}) }, crudo: e.crudo ?? {},
      clave_unica: claveDelEvento(e),
    }
    const ins = await db.from('eventos_de_emilio').insert(fila).select('id').single()
    let id: string | null = null
    let repetido = false
    if (!ins.error) id = String((ins.data as Fila).id)
    else if (ins.error.code === '23505') repetido = true
    else return { ok: false, error: ins.error.message }
    let empuje: Promise<void> | undefined
    if (opciones.espejo && e.canal === 'dashboard' && !repetido) {
      const nota = await espejoEnNotas(db, e, fila)
      // Sube al cerebro todo lo que traiga TEXTO de Emilio (comentario, motivo de rechazo, cambios pedidos, una aprobación con palabras). Aprobar sin texto no es un hecho del cliente.
      if (nota && opciones.alCerebro && nota.comentario) {
        empuje = Promise.resolve(opciones.alCerebro(nota, { ts: id ?? String(fila.clave_unica), canal_slack: 'dashboard', respondido_en: String(fila.ocurrio_en) })).then(() => undefined, () => undefined)
      }
    }
    return { ok: true, id, repetido, ...(empuje ? { empuje } : {}) }
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
}

const TIPO_DE_NOTA: Partial<Record<AccionDeEmilio, string>> = { aprobar: 'aprobada', rechazar: 'rechazada', pedir_cambios: 'editada', editar: 'editada', comentar: 'comentario' }

/** la misma decisión en `notas_del_dueno` (el registro que ya existía). Un fallo aquí no afecta al evento crudo. */
async function espejoEnNotas(db: DbDeEventos, e: EventoDeEmilio, fila: Fila): Promise<NotaEspejada | null> {
  const tipo = TIPO_DE_NOTA[e.accion] as NotaEspejada['tipo'] | undefined
  if (!tipo || !fila.client_id) return null
  const coment = typeof e.comentario === 'string' ? e.comentario.trim().slice(0, 2000) : ''
  const laminas = (fila.laminas as number[]).length ? ` [láminas: ${(fila.laminas as number[]).join(', ')}]` : ''
  const comentario = coment ? `${coment}${laminas}`.slice(0, 2000) : null
  if (tipo === 'comentario' && !comentario) return null
  const nueva = {
    client_id: fila.client_id as string, alcance: 'cliente' as const, tipo, comentario, hitl_id: e.hitl_id, output_id: (fila.output_id as string | null) ?? null, pieza_titulo: (fila.pieza_titulo as string | null) ?? null,
    pieza_version: null, pieza_familia: (fila.familia as string | null) ?? null, origen: 'tablero' as const, autor: e.autor, clave_unica: `evento:${fila.clave_unica as string}`,
  }
  try {
    const ins = await db.from('notas_del_dueno').insert(nueva).select('id').single()
    if (ins.error || !ins.data) return null
    return { id: String((ins.data as Fila).id), ...nueva }
  } catch { return null /* el evento crudo ya quedó; el espejo se puede rehacer desde él */ }
}

/** `NOTAS_DEL_DUENO=1` enciende también el espejo en `notas_del_dueno` */
export const espejoEncendido = (): boolean => process.env.NOTAS_DEL_DUENO === '1'
