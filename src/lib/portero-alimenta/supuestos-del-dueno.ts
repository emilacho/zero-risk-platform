/**
 * EL SUPUESTO QUE EL DUEÑO ASUME (06-nov · encargo y ADENDA 1 firmados por Emilio · ADR-021 D6: el cerebro guarda canon del cliente, no preguntas).
 *
 * Las PREGUNTAS al dueño viven en la plataforma (`dueno_preguntas`, de CC1), no en el cerebro. Cuando el dueño ASUME el supuesto que traía una pregunta,
 * la plataforma llama a la puerta del dueño con `evento:"asumir"` y manda lo necesario para entenderlo: la pregunta (su id en la plataforma y su texto),
 * la oficina que la hizo, el supuesto, quién decidió y cuándo. El cerebro guarda UNA ficha y devuelve su id; la plataforma la anota en su fila.
 *
 *  · ASUMIR NO ES RESPONDER. Lo asumido NUNCA se lee como «dicho por el dueño» ni como dato del dueño (la misma atribución falsa que corrigió #930):
 *    ficha de clase `supuesto_aceptado_por_el_dueno`, origen `plataforma` (lo propuso una oficina), confianza `untrusted`; cada lector la rotula
 *    «supuesto aceptado por el dueño», con su texto, quién lo propuso y cuándo se aceptó.
 *  · Mismo `pregunta_id` → misma ficha (referencia fija): reintentar es seguro y devuelve `repetida` con el mismo `ficha_id`.
 *  · Sin supuesto no se puede asumir: error claro y no se escribe nada. Si después el dueño RESPONDE el mismo tema, su respuesta retira este supuesto (la palabra del dueño manda).
 *  · Regla general: cualquier cliente, cualquier oficina. US$ 0, sin modelo.
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
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export { CLASE_DEL_SUPUESTO_ACEPTADO }
/** cómo lo lee cualquier oficina: nunca «dicho por el dueño» */
export const ATRIBUCION_DEL_SUPUESTO = 'supuesto aceptado por el dueño (no es dato del dueño: lo propuso una oficina y el dueño eligió usarlo sin responder)'
export const MAX_SUPUESTO = 300
export const MAX_NOMBRE_DEL_SUPUESTO = 80
export const MAX_UNIDAD = 30
export const MAX_CORTO = 80
export const refDelSupuesto = (preguntaId: string): string => `supuesto:${preguntaId}`

/** el supuesto que trae una pregunta: un texto, y si es una cifra, su nombre corto, valor y unidad (para que el dueño vea qué acepta) */
export interface SupuestoDeLaPregunta { texto: string; nombre?: string; valor?: number; unidad?: string }

/** valida un `supuesto`. undefined/null = no hay supuesto */
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

/** el supuesto guardado (lo que haya); null si no trae uno usable */
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

/**
 * EVENTO `asumir` · lo manda la plataforma: `pregunta_id` (uuid de `dueno_preguntas`), `oficina`, `agente`, `tema`, `pregunta` (el texto), `supuesto`,
 * `decidido_por` (por omisión «dueno»), `decidido_en` (ISO), `canal` y `sede_clave` opcionales. Responde `{ ok, ficha_id }` o, si ya estaba, `{ ok, repetida, ficha_id }`.
 */
export async function asumirSupuesto(deps: DepsDeAsumir, v: { dry_run: boolean; cuerpo: Record<string, unknown>; workflow_id: string; workflow_execution_id: string }): Promise<Respuesta> {
  const c = v.cuerpo
  const clientId = txt(c.client_id), preguntaId = txt(c.pregunta_id)
  if (!UUID.test(preguntaId)) return err(400, 'entrada_invalida', '`asumir` necesita `pregunta_id` (el uuid de la pregunta en la plataforma)')
  const pp = objeto(c.preguntado_por)
  const oficina = txt(c.oficina) || txt(pp.oficina), agente = txt(c.agente) || txt(pp.agente)
  if (!oficina || !agente || oficina.length > MAX_CORTO || agente.length > MAX_CORTO) return err(400, 'entrada_invalida', '`oficina` y `agente` son obligatorios: se registra quién propuso el supuesto')
  const tema = txt(c.tema), pregunta = txt(c.pregunta)
  if (!tema || tema.length > MAX_CORTO) return err(400, 'entrada_invalida', `\`tema\` es obligatorio (hasta ${MAX_CORTO} caracteres)`)
  if (!pregunta || pregunta.length > 600) return err(400, 'entrada_invalida', '`pregunta` es obligatoria (el texto; un supuesto sin su pregunta no se entiende)')
  const sup = supuestoDeLaEntrada(c.supuesto)
  if (!sup.ok) return err(400, 'entrada_invalida', sup.detalle)
  if (!sup.supuesto) return err(422, 'sin_supuesto', 'no se puede asumir sin `supuesto`: no se asume lo que la oficina no propuso. No se guardó nada')
  const supuesto = sup.supuesto
  const decididoPor = txt(c.decidido_por) || txt(c.asumido_por) || 'dueno'
  if (decididoPor.length > MAX_CORTO) return err(400, 'entrada_invalida', `\`decidido_por\` es un nombre corto (hasta ${MAX_CORTO} caracteres)`)
  const ahora = deps.ahora ?? new Date()
  const decididoEn = txt(c.decidido_en)
  if (decididoEn && Number.isNaN(Date.parse(decididoEn))) return err(400, 'entrada_invalida', '`decidido_en` debe ser una fecha ISO')
  const cuando = decididoEn ? new Date(decididoEn).toISOString() : ahora.toISOString()
  const sede = txt(c.sede_clave) || null
  const canal = txt(c.canal).slice(0, 60) || null
  if (!deps.activo) return { status: 200, body: { apagado: true, detalle: 'PORTERO_DUENO está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const id = deps.nuevoId ?? randomUUID

  const cl = await deps.db.from('clients').select('id').eq('id', clientId).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  if (!lista(cl.data).length) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')

  const ref = refDelSupuesto(preguntaId)
  // mismo pregunta_id → misma ficha: reintentar es seguro (la plataforma reintenta si no le llegó la respuesta)
  const ya = await deps.db.from('cerebro_fichas').select('id').eq('client_id', clientId).eq('ref', ref).limit(1)
  if (ya.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${ya.error.message}`)
  const previa = txt(lista(ya.data)[0]?.id)
  if (previa) return { status: 200, body: { ok: true, repetida: true, ficha_id: previa, pregunta_id: preguntaId, nota: 'este supuesto ya estaba guardado para esa pregunta: no se guardó nada nuevo' } }

  const alcance = claveDeAlcance(sede ? [sede] : null)
  const propuestoPor = { oficina, agente }
  const plan = { pregunta_id: preguntaId, tema, supuesto, decidido_por: decididoPor, decidido_en: cuando, atribucion: ATRIBUCION_DEL_SUPUESTO }
  if (v.dry_run) return { status: 200, body: { ok: true, dry_run: true, ...plan, nota: 'dry_run: no se guardó nada' } }

  const fichaId = id()
  const ing = id()
  const wi = await deps.db.from('cerebro_ingresos').insert({ id: ing, client_id: clientId, origen: 'plataforma', fuente_ref: `dueno:asumir:${preguntaId}`, es_completa: false, huella: `${cuando.slice(0, 10)}:asumir:${preguntaId}`, material: null, estado: 'fichado', workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id })
  if (wi.error) return err(502, 'registro_fallido', `cerebro_ingresos: ${wi.error.message}`)
  const linea = textoDelSupuesto(supuesto)
  const contenido = `Supuesto aceptado por el dueño (${cuando.slice(0, 10)}). NO es dato del dueño: lo propuso la oficina ${oficina} y el dueño eligió usarlo sin responder. Pregunta: «${pregunta}». Supuesto: «${linea}»`
  const fila = {
    id: fichaId, client_id: clientId, ingreso_id: ing, ref, clase: CLASE_DEL_SUPUESTO_ACEPTADO,
    titulo: `Supuesto aceptado por el dueño · ${tema}${sede ? ` · sede ${sede}` : ''}`.slice(0, 160), que_es: `Supuesto aceptado por el dueño (no lo dijo él): ${linea}`.replace(/\s+/g, ' ').slice(0, 200), contenido, origen: 'plataforma',
    fecha_fuente: cuando, reconfirmado_en: cuando, plazo: null, vigente_hasta: null, version_de: null,
    propiedad: 'propia', porque: `supuesto propuesto por ${oficina} y aceptado por el dueño`, juzgado_por: 'regla', observado_en: cuando, atributo: `supuesto:${tema}`.slice(0, 160), sede: alcance || null,
    decision: 'suma', razon_de_decision: 'el dueño asumió el supuesto de una pregunta en vez de responderla', alcance: 'cliente', descartada: false, retirada_en: null,
    provenance_tag: {
      type: 'evidence', source: 'oficina', trust_level: 'untrusted', aceptado_por: 'dueno', atribucion: ATRIBUCION_DEL_SUPUESTO, ingress_route: '/api/brain/alimentar/dueno',
      datos: { evento: 'asumir', pregunta_id: preguntaId, tema, pregunta, supuesto, propuesto_por: propuestoPor, asumido_por: decididoPor, asumida_en: cuando, canal, ...datosDeSede(sede ? [sede] : null) },
    },
  }
  const wf = await deps.db.from('cerebro_fichas').insert(fila)
  if (wf.error) return err(502, 'registro_fallido', `cerebro_fichas: ${wf.error.message}`)
  return { status: 200, body: { ok: true, ficha_id: fichaId, ...plan, nota: 'guardado como supuesto aceptado por el dueño, nunca como dato del dueño' } }
}

/** cómo viaja un supuesto asumido a quien lo lea (contexto del cliente) */
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
