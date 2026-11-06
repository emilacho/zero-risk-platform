/**
 * LAS PREGUNTAS AL DUEÑO · en la plataforma (CC1 · 06-nov · firma de Emilio vía Lenovo · ADR-021 D6 · diseño de Cerebro).
 * Una pregunta pendiente NO es canon del cliente: es estado del trabajo y vive en `dueno_preguntas`, una sola lista para todas las oficinas.
 * Al cerebro solo entra lo que sí es canon: la RESPUESTA del dueño o el supuesto que el dueño ASUME, por su puerta (`POST /api/brain/alimentar/dueno`).
 *
 *  · `preguntar`: antes de escribirle al dueño. Si el cerebro ya tiene la respuesta, no se pregunta («ya_respondida»); si otra oficina espera lo mismo en las últimas 72 h,
 *    tampoco («ya_preguntada»); si es la misma oficina, «repetida» con su id. Es la misma regla que tenía el evento `pregunta` del cerebro, ahora aquí.
 *  · `responder` / `asumir`: (1) se lee la fila pendiente, (2) el cerebro guarda la ficha y devuelve su ref, (3) la fila se cierra SOLO si sigue pendiente, contando filas:
 *    si cambiaron 0 (otro la cerró antes) → 409, nunca «ok». Si el cerebro falla → 502 y la fila sigue pendiente (reintentar es seguro: el cerebro deduplica por `pregunta_id`).
 *  · `descartar`: solo la fila (estado `descartada`, motivo, quién y cuándo). Al cerebro no entra nada.
 *  · Una respuesta del dueño SIN pregunta pendiente igual va al cerebro: es su palabra.
 * La plataforma NUNCA nombra tablas del cerebro: habla con él por HTTP (`PuertoDelCerebro`). US$ 0: no llama a ningún modelo.
 */
import { randomUUID } from 'node:crypto'
import { esElMismoTema, palabrasDelTema, temaNormal } from '../portero-alimenta/dueno'

export const TABLA = 'dueno_preguntas'
/** una pregunta pendiente deja de bloquear a otra oficina pasadas estas horas (el dueño puede no haber contestado) */
export const HORAS_DE_UNA_PREGUNTA_PENDIENTE = 72
export const MAX_TEMA = 80
export const MAX_PREGUNTA = 600
export const MAX_RESPUESTA = 2000
export const MAX_MOTIVO = 300
export const TOPE_DE_LECTURA = 500

type Fila = Record<string, unknown>
type Db = { from(tabla: string): any }
export interface Respuesta { status: number; body: Record<string, unknown> }

export interface PuertoDelCerebro {
  /** lo que el dueño ya dijo de un tema (solo lee) */
  respuestas(p: { client_id: string; tema: string; sede_clave: string | null }): Promise<{ ok: true; respuestas: Fila[] } | { ok: false; error: string }>
  /** guarda la respuesta o el supuesto aceptado como ficha y devuelve su ref */
  guardar(evento: 'respuesta' | 'asumir', cuerpo: Fila): Promise<{ ok: true; ficha_id: string | null } | { ok: false; status: number; error: string }>
}
export interface Deps { db: Db; cerebro: PuertoDelCerebro; ahora?: Date; nuevoId?: () => string }

const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { ok: false, error, detalle } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ACCIONES = ['preguntar', 'responder', 'asumir', 'descartar'] as const
export type Accion = (typeof ACCIONES)[number]

interface Comun { client_id: string; workflow_id: string; workflow_execution_id: string; oficina: string; agente: string }

function comun(c: Fila): Respuesta | Comun {
  const client_id = txt(c.client_id)
  if (!UUID.test(client_id)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const workflow_id = txt(c.workflow_id), workflow_execution_id = txt(c.workflow_execution_id)
  if (!workflow_id || !workflow_execution_id) return err(403, 'workflow_requerido', 'hacen falta `workflow_id` y `workflow_execution_id`: queda registrado desde dónde se preguntó o decidió')
  const pp = (c.preguntado_por && typeof c.preguntado_por === 'object' ? c.preguntado_por : {}) as Fila
  return { client_id, workflow_id, workflow_execution_id, oficina: txt(pp.oficina) || txt(c.oficina), agente: txt(pp.agente) || txt(c.agente) }
}

async function sedeValida(db: Db, client_id: string, pedida: string): Promise<{ ok: true; sede: string | null } | Respuesta> {
  if (!pedida) return { ok: true, sede: null }
  const q = await db.from('client_sedes').select('clave').eq('client_id', client_id)
  if (q.error) return err(502, 'lectura_fallida', `client_sedes: ${q.error.message}`)
  const claves = lista(q.data).map((s) => txt(s.clave)).filter(Boolean)
  if (!claves.includes(pedida)) return err(400, 'sede_inexistente', `«${pedida}» no es una sede del cliente (${claves.join(', ') || 'no tiene sedes'})`)
  return { ok: true, sede: claves.length >= 2 ? pedida : null } // un cliente de una sola sede: todo es de esa sede
}

async function pendientesRecientes(deps: Deps, client_id: string): Promise<{ ok: true; filas: Fila[] } | Respuesta> {
  const hace = new Date((deps.ahora ?? new Date()).getTime() - HORAS_DE_UNA_PREGUNTA_PENDIENTE * 3_600_000).toISOString()
  const r = await deps.db.from(TABLA).select('*').eq('client_id', client_id).eq('estado', 'pendiente').gte('creado_en', hace).limit(TOPE_DE_LECTURA + 1)
  if (r.error) return err(502, 'lectura_fallida', `${TABLA}: ${r.error.message}`)
  const filas = lista(r.data)
  if (filas.length > TOPE_DE_LECTURA) return err(502, 'lectura_recortada', `${TABLA}: más de ${TOPE_DE_LECTURA} pendientes; no se recorta en silencio`)
  return { ok: true, filas }
}

export async function preguntar(deps: Deps, c: Fila): Promise<Respuesta> {
  const k = comun(c)
  if ('status' in k) return k
  if (!k.oficina || !k.agente) return err(400, 'entrada_invalida', '`preguntado_por` necesita `oficina` y `agente`: se registra quién preguntó')
  const tema = txt(c.tema), pregunta = txt(c.pregunta), canal = txt(c.canal), supuesto = txt(c.supuesto)
  if (!tema || tema.length > MAX_TEMA || !palabrasDelTema(tema).length) return err(400, 'entrada_invalida', `\`tema\` es obligatorio (texto libre, hasta ${MAX_TEMA} caracteres)`)
  if (!pregunta || pregunta.length > MAX_PREGUNTA) return err(400, 'entrada_invalida', `\`pregunta\` es obligatoria (hasta ${MAX_PREGUNTA} caracteres)`)
  if (!canal || canal.length > 60) return err(400, 'entrada_invalida', '`canal` es obligatorio (p. ej. «Tu oficina › Decisiones»)')
  if (supuesto.length > MAX_RESPUESTA) return err(400, 'entrada_invalida', `\`supuesto\` hasta ${MAX_RESPUESTA} caracteres`)
  const forzar = c.forzar === true
  const s = await sedeValida(deps.db, k.client_id, txt(c.sede_clave))
  if ('status' in s) return s
  if (!forzar) {
    const ya = await deps.cerebro.respuestas({ client_id: k.client_id, tema, sede_clave: s.sede })
    // sin poder leer al cerebro NO se pregunta a ciegas: el que llama sigue con supuestos y lo avisa
    if (!ya.ok) return err(502, 'cerebro_no_leido', `no pude leer lo que el dueño ya dijo: ${ya.error}`)
    if (ya.respuestas.length) return { status: 200, body: { ok: true, registrada: false, ya_respondida: true, respuestas: ya.respuestas, nota: 'no preguntes: ya respondió. Si por razonamiento ya no vale, repite con `forzar: true`' } }
  }
  const pe = await pendientesRecientes(deps, k.client_id)
  if ('status' in pe) return pe
  const mismas = pe.filas.filter((p) => (txt(p.sede_clave) || null) === s.sede && esElMismoTema(txt(p.tema), tema))
  const esMia = (p: Fila) => txt(p.oficina) === k.oficina && txt(p.agente) === k.agente
  const otra = mismas.find((p) => !esMia(p))
  if (!forzar && otra) return { status: 200, body: { ok: true, registrada: false, ya_preguntada: true, pendiente: { pregunta_id: String(otra.id), oficina: txt(otra.oficina), agente: txt(otra.agente), canal: txt(otra.canal), desde: txt(otra.creado_en) }, nota: 'otra oficina ya le preguntó esto al dueño y espera su respuesta' } }
  const propia = mismas.find(esMia)
  if (!forzar && propia) return { status: 200, body: { ok: true, registrada: false, repetida: true, pregunta_id: String(propia.id), nota: 'tu misma pregunta sigue pendiente' } }
  const id = (deps.nuevoId ?? randomUUID)()
  const w = await deps.db.from(TABLA).insert({ id, client_id: k.client_id, sede_clave: s.sede, tema, tema_norm: temaNormal(tema), pregunta, supuesto: supuesto || null, canal, oficina: k.oficina, agente: k.agente, estado: 'pendiente', workflow_id: k.workflow_id, workflow_execution_id: k.workflow_execution_id })
  if (w.error) return err(502, 'registro_fallido', `${TABLA}: ${w.error.message}`)
  return { status: 200, body: { ok: true, registrada: true, pregunta_id: id } }
}

/** cierra UNA fila solo si sigue pendiente y cuenta cuántas cambiaron */
async function cerrar(deps: Deps, id: string, cambios: Fila): Promise<{ ok: true; cambiadas: number } | Respuesta> {
  const u = await deps.db.from(TABLA).update({ ...cambios, actualizado_en: (deps.ahora ?? new Date()).toISOString() }).eq('id', id).eq('estado', 'pendiente').select('id')
  if (u.error) return err(502, 'cierre_fallido', `${TABLA}: ${u.error.message}`)
  return { ok: true, cambiadas: lista(u.data).length }
}

async function unaPendiente(deps: Deps, client_id: string, id: string): Promise<{ ok: true; fila: Fila } | Respuesta> {
  if (!UUID.test(id)) return err(400, 'entrada_invalida', '`pregunta_id` debe ser un uuid')
  const r = await deps.db.from(TABLA).select('*').eq('id', id).eq('client_id', client_id).limit(1)
  if (r.error) return err(502, 'lectura_fallida', `${TABLA}: ${r.error.message}`)
  const f = lista(r.data)[0]
  if (!f) return err(404, 'pregunta_inexistente', 'esa pregunta no existe para este cliente')
  if (txt(f.estado) !== 'pendiente') return { status: 409, body: { ...err(409, 'ya_cerrada', `la pregunta ya está «${txt(f.estado)}»`).body, guardada_en_cerebro: false, estado: txt(f.estado) } }
  return { ok: true, fila: f }
}

export async function responder(deps: Deps, c: Fila): Promise<Respuesta> {
  const k = comun(c)
  if ('status' in k) return k
  const respuesta = txt(c.respuesta), quien = txt(c.decidido_por) || txt(c.quien)
  if (!respuesta || respuesta.length > MAX_RESPUESTA) return err(400, 'entrada_invalida', `\`respuesta\` es obligatoria (hasta ${MAX_RESPUESTA} caracteres)`)
  if (!quien) return err(400, 'entrada_invalida', '`decidido_por` es obligatorio: queda quién contestó')
  const cuandoTxt = txt(c.respondido_en) || txt(c.decidido_en)
  if (cuandoTxt && Number.isNaN(Date.parse(cuandoTxt))) return err(400, 'entrada_invalida', '`respondido_en` debe ser una fecha ISO')
  const cuando = cuandoTxt ? new Date(cuandoTxt).toISOString() : (deps.ahora ?? new Date()).toISOString()
  // ¿qué pregunta cierra? la nombrada; si no, las pendientes recientes del mismo tema (como hacía la puerta del cerebro)
  let filas: Fila[]
  let tema = txt(c.tema), pregunta = txt(c.pregunta), sede: string | null = null
  if (txt(c.pregunta_id)) {
    const u = await unaPendiente(deps, k.client_id, txt(c.pregunta_id))
    if ('status' in u) return u
    filas = [u.fila]
    tema = txt(u.fila.tema); pregunta = txt(u.fila.pregunta); sede = txt(u.fila.sede_clave) || null
  } else {
    if (!tema || tema.length > MAX_TEMA || !palabrasDelTema(tema).length) return err(400, 'entrada_invalida', '`responder` necesita `pregunta_id` o `tema`')
    const s = await sedeValida(deps.db, k.client_id, txt(c.sede_clave))
    if ('status' in s) return s
    sede = s.sede
    const pe = await pendientesRecientes(deps, k.client_id)
    if ('status' in pe) return pe
    filas = pe.filas.filter((p) => (txt(p.sede_clave) || null) === sede && esElMismoTema(txt(p.tema), tema))
    if (!pregunta) pregunta = txt(filas[0]?.pregunta)
  }
  if (!pregunta) return err(400, 'entrada_invalida', '`pregunta` es obligatoria cuando no hay una pregunta pendiente: una respuesta sin su pregunta no se entiende')
  const primera = filas[0]
  const g = await deps.cerebro.guardar('respuesta', {
    client_id: k.client_id, workflow_id: k.workflow_id, workflow_execution_id: k.workflow_execution_id,
    pregunta_id: primera ? String(primera.id) : null, oficina: txt(primera?.oficina) || k.oficina || null, agente: txt(primera?.agente) || k.agente || null,
    tema, sede_clave: sede, pregunta, respuesta, decidido_por: quien, decidido_en: cuando, respondido_en: cuando,
    canal: txt(c.canal) || txt(primera?.canal) || 'Tu oficina › Decisiones', mensaje_ref: txt(c.mensaje_ref) || null,
  })
  if (!g.ok) return err(502, 'cerebro_no_guardo', `el cerebro no guardó la respuesta (${g.status}: ${g.error}); la pregunta sigue pendiente`)
  let cerradas = 0
  for (const f of filas) {
    const r = await cerrar(deps, String(f.id), { estado: 'respondida', respuesta, decidido_por: quien, decidido_en: cuando, ficha_ref: g.ficha_id })
    if ('status' in r) return r
    cerradas += r.cambiadas
  }
  // `guardada_en_cerebro` es la señal fija para quien llama (el tablero no debe leer el texto del detalle): lo del dueño YA está en el cerebro, no se repite
  if (filas.length && cerradas === 0) return { status: 409, body: { ...err(409, 'ya_cerrada', 'la respuesta quedó en el cerebro, pero otro cerró la pregunta antes: no se marcó «respondida» aquí').body, guardada_en_cerebro: true, ficha_ref: g.ficha_id } }
  return { status: 200, body: { ok: true, guardada: true, ficha_ref: g.ficha_id, preguntas_cerradas: cerradas } }
}

export async function asumir(deps: Deps, c: Fila): Promise<Respuesta> {
  const k = comun(c)
  if ('status' in k) return k
  const quien = txt(c.decidido_por) || txt(c.quien)
  if (!quien) return err(400, 'entrada_invalida', '`decidido_por` es obligatorio: queda quién aceptó el supuesto')
  const u = await unaPendiente(deps, k.client_id, txt(c.pregunta_id))
  if ('status' in u) return u
  const f = u.fila
  const supuesto = txt(f.supuesto)
  // el supuesto es el que propuso la oficina: el dueño lo acepta tal cual; nunca se inventa uno
  if (!supuesto) return err(422, 'sin_supuesto', 'esta pregunta no trae un supuesto propuesto: no hay nada que asumir; contéstala o descártala')
  const cuando = (deps.ahora ?? new Date()).toISOString()
  const g = await deps.cerebro.guardar('asumir', {
    client_id: k.client_id, workflow_id: k.workflow_id, workflow_execution_id: k.workflow_execution_id,
    pregunta_id: String(f.id), oficina: txt(f.oficina), agente: txt(f.agente), tema: txt(f.tema), sede_clave: txt(f.sede_clave) || null,
    pregunta: txt(f.pregunta), supuesto, decidido_por: quien, decidido_en: cuando, canal: txt(c.canal) || 'Tu oficina › Decisiones',
  })
  if (!g.ok) return err(502, 'cerebro_no_guardo', `el cerebro no guardó el supuesto (${g.status}: ${g.error}); la pregunta sigue pendiente`)
  const r = await cerrar(deps, String(f.id), { estado: 'asumida', decidido_por: quien, decidido_en: cuando, ficha_ref: g.ficha_id })
  if ('status' in r) return r
  if (r.cambiadas === 0) return { status: 409, body: { ...err(409, 'ya_cerrada', 'el supuesto quedó en el cerebro, pero otro cerró la pregunta antes: no se marcó «asumida» aquí').body, guardada_en_cerebro: true, ficha_ref: g.ficha_id } }
  return { status: 200, body: { ok: true, asumida: true, ficha_ref: g.ficha_id, supuesto } }
}

export async function descartar(deps: Deps, c: Fila): Promise<Respuesta> {
  const k = comun(c)
  if ('status' in k) return k
  const motivo = txt(c.motivo), quien = txt(c.decidido_por) || txt(c.quien)
  if (!motivo || motivo.length > MAX_MOTIVO) return err(400, 'entrada_invalida', `\`motivo\` es obligatorio (hasta ${MAX_MOTIVO} caracteres)`)
  if (!quien) return err(400, 'entrada_invalida', '`decidido_por` es obligatorio: queda quién descartó')
  const u = await unaPendiente(deps, k.client_id, txt(c.pregunta_id))
  if ('status' in u) return u
  // el dueño la descarta → «descartada»; la cierra el sistema (otra respuesta ya la cubrió) → «obsoleta». Decisiones y la compuerta los distinguen.
  const estado = c.por_el_sistema === true ? 'obsoleta' : 'descartada'
  const r = await cerrar(deps, String(u.fila.id), { estado, motivo, decidido_por: quien, decidido_en: (deps.ahora ?? new Date()).toISOString() })
  if ('status' in r) return r
  if (r.cambiadas === 0) return err(409, 'ya_cerrada', 'otro cerró la pregunta antes')
  return { status: 200, body: { ok: true, descartada: true, estado, nota: 'cerrada con motivo; al cerebro no entra nada' } }
}

/** POST /api/dueno/preguntas · `{ accion, ... }` */
export async function rutaPreguntas(deps: Deps, cuerpo: unknown): Promise<Respuesta> {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  const c = cuerpo as Fila
  switch (c.accion) {
    case 'preguntar': return preguntar(deps, c)
    case 'responder': return responder(deps, c)
    case 'asumir': return asumir(deps, c)
    case 'descartar': return descartar(deps, c)
    default: return err(400, 'accion_invalida', `\`accion\` debe ser una de: ${ACCIONES.join(', ')}`)
  }
}

/** GET /api/dueno/preguntas?client_id=…&tema=… · las pendientes de las últimas 72 h (lo que antes daba el GET del cerebro en `pendientes`) */
export async function rutaPendientes(deps: Pick<Deps, 'db' | 'ahora'>, params: { client_id: string; tema?: string | null }): Promise<Respuesta> {
  if (!UUID.test(params.client_id)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const pe = await pendientesRecientes(deps as Deps, params.client_id)
  if ('status' in pe) return pe
  const tema = txt(params.tema)
  const pendientes = pe.filas.filter((p) => !tema || esElMismoTema(txt(p.tema), tema))
    .map((p) => ({ pregunta_id: String(p.id), tema: txt(p.tema), pregunta: txt(p.pregunta), supuesto: txt(p.supuesto) || null, oficina: txt(p.oficina), agente: txt(p.agente), canal: txt(p.canal), desde: txt(p.creado_en) }))
  return { status: 200, body: { ok: true, client_id: params.client_id, tema: tema || null, pendientes } }
}
