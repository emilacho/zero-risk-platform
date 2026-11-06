/**
 * ASUMIR UNA PREGUNTA DEL DUEÑO (06-nov · encargo firmado por Emilio · contrato de CEREBRO a CC1: opción (a), estado propio).
 *
 * Una oficina que le pregunta algo al dueño puede dejar, junto con la pregunta, el SUPUESTO con el que seguiría si él no contesta
 * (`supuesto`: texto, y si es una cifra, su nombre corto, valor y unidad). El dueño puede ASUMIRLO con un toque: no contesta, elige ese supuesto.
 *
 *  · ASUMIR NO ES RESPONDER. Lo asumido NUNCA se lee como «dicho por el dueño» ni como dato del dueño (la misma atribución falsa que corrigió #930):
 *    se guarda como ficha de clase `supuesto_aceptado_por_el_dueno`, origen `plataforma` (lo propuso una oficina), y cada lector lo rotula
 *    «supuesto aceptado por el dueño», con su texto, quién lo propuso y cuándo lo aceptó.
 *  · La pregunta queda cerrada como `asumida` (igual que responder o descartar: la lectura de pendientes ya no la trae), con el supuesto EXACTO que traía,
 *    quién lo asumió y cuándo. Repetir el evento no duplica nada (la ficha tiene referencia fija por pregunta).
 *  · Sin supuesto no se puede asumir: error claro y la pregunta sigue abierta. Una pregunta ya respondida, descartada o vencida no se asume.
 *  · Regla general: cualquier cliente, cualquier oficina que pregunte. US$ 0, sin modelo.
 */
import { randomUUID } from 'node:crypto'
import { CLASE_DEL_SUPUESTO_ACEPTADO } from '../cerebro/tipos'
import type { Db } from './alimentar'
import { claveDeAlcance, datosDeSede } from './sedes-fuentes'
import type { Respuesta } from './rutas'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const objeto = (v: unknown): Fila => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fila) : {})
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export { CLASE_DEL_SUPUESTO_ACEPTADO }
export const ESTADO_ASUMIDA = 'asumida'
/** cómo lo lee cualquier oficina: nunca «dicho por el dueño» */
export const ATRIBUCION_DEL_SUPUESTO = 'supuesto aceptado por el dueño (no es dato del dueño: lo propuso una oficina y el dueño eligió usarlo sin responder)'
export const MAX_SUPUESTO = 300
export const MAX_NOMBRE_DEL_SUPUESTO = 80
export const MAX_UNIDAD = 30
export const refDelSupuesto = (preguntaId: string): string => `supuesto:${preguntaId}`

/** el supuesto que trae una pregunta: un texto, y si es una cifra, su nombre corto, valor y unidad (para que el dueño vea qué acepta) */
export interface SupuestoDeLaPregunta { texto: string; nombre?: string; valor?: number; unidad?: string }

/** valida el `supuesto` de una pregunta. undefined/null = la pregunta no trae supuesto (válido: no se podrá asumir) */
export function supuestoDeLaEntrada(v: unknown): { ok: true; supuesto: SupuestoDeLaPregunta | null } | { ok: false; detalle: string } {
  if (v === undefined || v === null) return { ok: true, supuesto: null }
  const forma = `\`supuesto\` es un texto (hasta ${MAX_SUPUESTO} caracteres) o { texto, nombre?, valor?, unidad? }`
  // un número, una lista o cualquier otra cosa que no sea texto u objeto queda sin `texto` y no pasa
  const o: Fila = typeof v === 'string' ? { texto: v } : objeto(v)
  const texto = txt(o.texto)
  if (!texto || texto.length > MAX_SUPUESTO) return { ok: false, detalle: forma }
  const s: SupuestoDeLaPregunta = { texto }
  if (o.nombre !== undefined) { const n = txt(o.nombre); if (!n || n.length > MAX_NOMBRE_DEL_SUPUESTO) return { ok: false, detalle: `\`supuesto.nombre\` es un nombre corto (hasta ${MAX_NOMBRE_DEL_SUPUESTO} caracteres)` }; s.nombre = n }
  if (o.valor !== undefined) { if (typeof o.valor !== 'number' || !Number.isFinite(o.valor)) return { ok: false, detalle: '`supuesto.valor` debe ser un número' }; s.valor = o.valor }
  if (o.unidad !== undefined) { const u = txt(o.unidad); if (!u || u.length > MAX_UNIDAD) return { ok: false, detalle: `\`supuesto.unidad\` es un texto corto (hasta ${MAX_UNIDAD} caracteres)` }; s.unidad = u }
  return { ok: true, supuesto: s }
}

/** el supuesto guardado en una fila (lo que haya en la columna); null si no trae uno usable */
export function supuestoGuardado(v: unknown): SupuestoDeLaPregunta | null {
  const r = supuestoDeLaEntrada(v)
  return r.ok ? r.supuesto : null
}

/** una línea legible: «Gastos fijos al mes: 1200 USD · se asume lo del mes pasado» */
export function textoDelSupuesto(s: SupuestoDeLaPregunta): string {
  const cifra = s.valor !== undefined ? `${s.nombre ? `${s.nombre}: ` : ''}${s.valor}${s.unidad ? ` ${s.unidad}` : ''}` : s.nombre ?? ''
  return cifra && cifra !== s.texto ? `${cifra} · ${s.texto}` : s.texto
}

export interface DepsDeAsumir { db: Db; activo: boolean; ahora?: Date; nuevoId?: () => string }

/** EVENTO `asumir` · `pregunta_id` obligatorio. Quién: el dueño (`asumido_por`, por omisión «dueno»). Con `dry_run: true` solo dice qué haría. */
export async function asumirPregunta(deps: DepsDeAsumir, v: { dry_run: boolean; cuerpo: Record<string, unknown>; workflow_id: string; workflow_execution_id: string }): Promise<Respuesta> {
  const c = v.cuerpo
  const clientId = txt(c.client_id), preguntaId = txt(c.pregunta_id)
  if (!UUID.test(preguntaId)) return err(400, 'entrada_invalida', '`asumir` necesita `pregunta_id` (el uuid de la pregunta)')
  const asumidoPor = txt(c.asumido_por) || 'dueno'
  if (asumidoPor.length > 80) return err(400, 'entrada_invalida', '`asumido_por` es un nombre corto (hasta 80 caracteres)')
  if (!deps.activo) return { status: 200, body: { apagado: true, detalle: 'PORTERO_DUENO está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const id = deps.nuevoId ?? randomUUID

  const pe = await deps.db.from('cerebro_dueno_preguntas').select('*').eq('id', preguntaId).eq('client_id', clientId).limit(1)
  if (pe.error) return err(502, 'lectura_fallida', `cerebro_dueno_preguntas: ${pe.error.message}`)
  const p = lista(pe.data)[0]
  if (!p) return err(404, 'pregunta_inexistente', 'no hay una pregunta con ese id para este cliente')
  const estado = txt(p.estado)
  // repetir no duplica: ya asumida → se devuelve lo que se guardó
  if (estado === ESTADO_ASUMIDA) return { status: 200, body: { ok: true, repetida: true, pregunta_id: preguntaId, ficha_id: txt(p.ficha_id) || null, supuesto: p.supuesto_asumido ?? p.supuesto ?? null, asumida_en: txt(p.asumida_en) || null, nota: 'esta pregunta ya estaba asumida: no se guardó nada nuevo' } }
  if (estado !== 'pendiente') return err(409, 'pregunta_cerrada', `la pregunta ya está «${estado}»: solo se asume una pregunta pendiente`)
  const supuesto = supuestoGuardado(p.supuesto)
  if (!supuesto) return err(422, 'sin_supuesto', 'la pregunta no trae supuesto: no se puede asumir lo que la oficina no propuso. Respóndela o descártala; la pregunta sigue abierta')

  const ref = refDelSupuesto(preguntaId)
  const sede = txt(p.sede_clave) || null
  const alcance = claveDeAlcance(sede ? [sede] : null)
  const cuando = ahora.toISOString()
  const tema = txt(p.tema), pregunta = txt(p.pregunta)
  const propuestoPor = { oficina: txt(p.preguntado_por_oficina), agente: txt(p.preguntado_por_agente) }
  const plan = { pregunta_id: preguntaId, tema, supuesto, asumido_por: asumidoPor, asumida_en: cuando, atribucion: ATRIBUCION_DEL_SUPUESTO }
  if (v.dry_run) return { status: 200, body: { ok: true, dry_run: true, ...plan, nota: 'dry_run: no se guardó nada' } }

  // la ficha tiene referencia fija por pregunta: si un intento anterior la escribió y no alcanzó a cerrar la pregunta, se reusa (no se duplica)
  const ya = await deps.db.from('cerebro_fichas').select('id').eq('client_id', clientId).eq('ref', ref).limit(1)
  if (ya.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${ya.error.message}`)
  let fichaId = txt(lista(ya.data)[0]?.id)
  if (!fichaId) {
    fichaId = id()
    const ing = id()
    const wi = await deps.db.from('cerebro_ingresos').insert({ id: ing, client_id: clientId, origen: 'plataforma', fuente_ref: `dueno:asumir:${preguntaId}`, es_completa: false, huella: `${cuando.slice(0, 10)}:asumir:${preguntaId}`, material: null, estado: 'fichado', workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id })
    if (wi.error) return err(502, 'registro_fallido', `cerebro_ingresos: ${wi.error.message}`)
    const linea = textoDelSupuesto(supuesto)
    const contenido = `Supuesto aceptado por el dueño (${cuando.slice(0, 10)}). NO es dato del dueño: lo propuso la oficina ${propuestoPor.oficina || 'sin nombre'} y el dueño eligió usarlo sin responder. Pregunta: «${pregunta}». Supuesto: «${linea}»`
    const fila = {
      id: fichaId, client_id: clientId, ingreso_id: ing, ref, clase: CLASE_DEL_SUPUESTO_ACEPTADO,
      titulo: `Supuesto aceptado por el dueño · ${tema}${sede ? ` · sede ${sede}` : ''}`.slice(0, 160), que_es: `Supuesto aceptado por el dueño (no lo dijo él): ${linea}`.replace(/\s+/g, ' ').slice(0, 200), contenido, origen: 'plataforma',
      fecha_fuente: cuando, reconfirmado_en: cuando, plazo: null, vigente_hasta: null, version_de: null,
      propiedad: 'propia', porque: `supuesto propuesto por ${propuestoPor.oficina || 'una oficina'} y aceptado por el dueño`, juzgado_por: 'regla', observado_en: cuando, atributo: `supuesto:${txt(p.tema_norm) || tema}`.slice(0, 160), sede: alcance || null,
      decision: 'suma', razon_de_decision: 'el dueño asumió el supuesto de una pregunta en vez de responderla', alcance: 'cliente', descartada: false, retirada_en: null,
      provenance_tag: {
        type: 'evidence', source: 'oficina', trust_level: 'untrusted', aceptado_por: 'dueno', atribucion: ATRIBUCION_DEL_SUPUESTO, ingress_route: '/api/brain/alimentar/dueno',
        datos: { evento: 'asumir', pregunta_id: preguntaId, tema, pregunta, supuesto, propuesto_por: propuestoPor, asumido_por: asumidoPor, asumida_en: cuando, canal: txt(p.canal) || null, ...datosDeSede(sede ? [sede] : null) },
      },
    }
    const wf = await deps.db.from('cerebro_fichas').insert(fila)
    if (wf.error) return err(502, 'registro_fallido', `cerebro_fichas: ${wf.error.message}`)
  }
  // se cierra solo si sigue pendiente (dos toques a la vez: el segundo no reescribe)
  const u = await deps.db.from('cerebro_dueno_preguntas').update({ estado: ESTADO_ASUMIDA, asumida_en: cuando, asumida_por: asumidoPor, supuesto_asumido: supuesto, ficha_id: fichaId }).eq('id', preguntaId).eq('estado', 'pendiente')
  if (u.error) return { status: 502, body: { ok: false, ...plan, ficha_id: fichaId, errores: [`cerebro_dueno_preguntas: ${u.error.message}`], nota: 'la ficha del supuesto quedó guardada pero la pregunta no se cerró: repetir el evento la cierra sin duplicar' } }
  return { status: 200, body: { ok: true, asumida: true, ...plan, ficha_id: fichaId, nota: 'pregunta cerrada como «asumida»; se lee como supuesto aceptado por el dueño, nunca como dato del dueño' } }
}

/** cómo viaja un supuesto asumido a quien lo lea (contexto del cliente, lectura de la puerta) */
export interface SupuestoAceptado {
  pregunta_id: string | null
  tema: string
  pregunta: string
  supuesto: SupuestoDeLaPregunta
  texto: string
  propuesto_por: { oficina: string | null; agente: string | null }
  aceptado_en: string | null
  sede: string | null
  ficha_id: string | null
  atribucion: typeof ATRIBUCION_DEL_SUPUESTO
}

/** de la ficha que guardó `asumir` */
export function supuestoDeLaFicha(f: Fila): SupuestoAceptado | null {
  const d = objeto(objeto(f.provenance_tag).datos)
  const s = supuestoGuardado(d.supuesto)
  if (!s) return null
  const pp = objeto(d.propuesto_por)
  return { pregunta_id: txt(d.pregunta_id) || null, tema: txt(d.tema), pregunta: txt(d.pregunta), supuesto: s, texto: textoDelSupuesto(s), propuesto_por: { oficina: txt(pp.oficina) || null, agente: txt(pp.agente) || null }, aceptado_en: txt(d.asumida_en) || null, sede: txt(f.sede) || null, ficha_id: txt(f.id) || null, atribucion: ATRIBUCION_DEL_SUPUESTO }
}

/** de la fila de la pregunta (lectura directa de la tabla de preguntas) */
export function supuestoDeLaPregunta(p: Fila): SupuestoAceptado | null {
  const s = supuestoGuardado(p.supuesto_asumido ?? p.supuesto)
  if (!s) return null
  return { pregunta_id: txt(p.id) || null, tema: txt(p.tema), pregunta: txt(p.pregunta), supuesto: s, texto: textoDelSupuesto(s), propuesto_por: { oficina: txt(p.preguntado_por_oficina) || null, agente: txt(p.preguntado_por_agente) || null }, aceptado_en: txt(p.asumida_en) || null, sede: txt(p.sede_clave) || null, ficha_id: txt(p.ficha_id) || null, atribucion: ATRIBUCION_DEL_SUPUESTO }
}

/**
 * LOS SUPUESTOS ELEGIDOS POR EL DUEÑO DE UN ENCARGO (para la lista del redactor que arma CC1). Solo los asumidos (nunca respuestas ni supuestos propios del sistema).
 * Filtro: `encargo` = el `workflow_execution_id` con que se registraron las preguntas, y/o `pregunta_ids` (las de la compuerta). Sin filtro: todos los del cliente.
 */
export async function supuestosElegidos(db: Db, clientId: string, filtro: { encargo?: string | null; pregunta_ids?: string[] }): Promise<{ ok: true; supuestos: SupuestoAceptado[] } | { ok: false; detalle: string }> {
  let q = db.from('cerebro_dueno_preguntas').select('*').eq('client_id', clientId).eq('estado', ESTADO_ASUMIDA)
  if (filtro.encargo) q = q.eq('workflow_execution_id', filtro.encargo)
  if (filtro.pregunta_ids && filtro.pregunta_ids.length) q = q.in('id', filtro.pregunta_ids)
  const r = await q.limit(500)
  if (r.error) return { ok: false, detalle: `cerebro_dueno_preguntas: ${r.error.message}` }
  const supuestos = lista(r.data).map(supuestoDeLaPregunta).filter((s): s is SupuestoAceptado => !!s).sort((a, b) => (txt(a.aceptado_en) < txt(b.aceptado_en) ? -1 : 1))
  return { ok: true, supuestos }
}
