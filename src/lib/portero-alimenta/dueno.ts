/**
 * LA PUERTA DEL DUEÑO EN EL CEREBRO · agnóstica (cualquier cliente, cualquier oficina, cualquier canal: hoy MD de Slack; mañana WhatsApp, correo o formulario).
 * Una oficina que recibe la respuesta del dueño la registra aquí: queda como ficha «confirmada por el dueño» (origen `dueno`, con la cita literal, el canal y la fecha) y
 * ninguna otra oficina vuelve a preguntar lo mismo (lectura de lo ya respondido + registro de preguntas pendientes para que dos oficinas no pregunten a la vez).
 *
 *  · NO hay lista fija de temas: el tema es texto libre; «es el mismo tema» se decide por las palabras significativas (código); si sigue vigente lo decide el agente que lee (se le da la fecha).
 *  · Una respuesta nueva al MISMO tema (y la misma sede) reemplaza a la anterior: la vieja queda retirada con su motivo y su fecha (nada se borra).
 *  · EXCEPCIÓN (21-oct): con `acumula: true` la respuesta es una NOTA que se suma: nunca retira a otra del mismo tema (comentarios de una pieza, avisos sueltos). Solo se deduplica la idéntica (huella del texto + `mensaje_ref`).
 *  · Precedencia máxima: el origen `dueno` va primero donde el cerebro ordena por origen, y el resumen vivo la muestra aparte; lo medido o supuesto no se mezcla con ella (cada ficha conserva su cita).
 *  · Privacidad: se guarda lo que dijo el dueño; correos, teléfonos y @usuarios de terceros se omiten.
 *  · `dry_run` obligatorio; con false exige workflow_id y workflow_execution_id. Detrás de `PORTERO_DUENO` (apagado por omisión). US$ 0: no llama a ningún modelo.
 */
import { createHash, randomUUID } from 'node:crypto'
import { normalizar } from '../manual/texto'
import type { Db } from './alimentar'
import { leerTodas } from './paginar'
import { claveDeAlcance, datosDeSede, sedesDeFicha } from './sedes-fuentes'
import { CAMPO_DEL_ESTADO, estadoDeApertura, esTemaDeEstadoDeSede, sedeQueNombra, textoDeEstado, type EstadoDeSede } from '../sedes/por-abrir'
import { reconciliarYEnviar, validar, type DepsDeRutas, type Respuesta } from './rutas'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

export const MAX_RESPUESTA = 2000
export const MAX_PREGUNTA = 600
export const MAX_TEMA = 80
/** una pregunta pendiente deja de bloquear a otra oficina pasadas estas horas (el dueño puede no haber contestado) */
export const HORAS_DE_UNA_PREGUNTA_PENDIENTE = 72
export const CLASE_DEL_DUENO = 'dato_del_dueno'
export const PREFIJO_DE_ATRIBUTO = 'dueno:'
/** parecido mínimo entre dos temas (palabras significativas compartidas / palabras del menor) para tratarlos como el mismo */
export const PARECIDO_MINIMO = 0.67

/** palabras que no distinguen un tema (conectores del español: dato de idioma, no de temas) */
const CONECTORES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'por', 'para', 'con', 'sin', 'que', 'cual', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'es', 'son', 'su', 'sus', 'se', 'lo', 'le', 'mi', 'tu'])
const singular = (t: string): string => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)
export const palabrasDelTema = (tema: string): string[] => [...new Set(normalizar(tema).replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter((t) => t && !CONECTORES.has(t)).map(singular))].sort()
export const temaNormal = (tema: string): string => palabrasDelTema(tema).join('-').slice(0, 80)
/** ¿dos temas son el mismo? (palabras significativas compartidas sobre las del más corto) */
export function esElMismoTema(a: string, b: string): boolean {
  const pa = palabrasDelTema(a), pb = palabrasDelTema(b)
  if (!pa.length || !pb.length) return false
  const comunes = pa.filter((p) => pb.includes(p)).length
  return comunes / Math.min(pa.length, pb.length) >= PARECIDO_MINIMO
}

/** quita lo que identifica a terceros: correos, teléfonos y @usuarios (el dueño habla de su negocio, no entrega datos ajenos) */
export function sinDatosPersonales(t: string): { texto: string; redactado: boolean } {
  let redactado = false
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, () => { redactado = true; return '[correo omitido]' })
  t = t.replace(/(?<![\w@])@[\w.]{2,}/g, () => { redactado = true; return '[usuario omitido]' })
  t = t.replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => { if (m.replace(/\D/g, '').length < 7) return m; redactado = true; return '[teléfono omitido]' })
  return { texto: t.replace(/\s+/g, ' ').trim(), redactado }
}

export interface PreguntadoPor { oficina: string; agente: string }
export interface EntradaDeDueno {
  evento: 'respuesta' | 'pregunta'
  client_id: string
  sede_clave: string | null
  pregunta: string
  respuesta: string
  tema: string
  canal: string
  mensaje_ref: string | null
  respondido_en: string
  preguntado_por: PreguntadoPor
  pregunta_id: string | null
  forzar: boolean
  /** nota que se suma: no reemplaza a otras del mismo tema */
  acumula: boolean
}
function normalizar_(cuerpo: Record<string, unknown>): Respuesta | EntradaDeDueno {
  const evento = cuerpo.evento === 'pregunta' ? 'pregunta' : 'respuesta'
  const pp = (cuerpo.preguntado_por && typeof cuerpo.preguntado_por === 'object' ? cuerpo.preguntado_por : {}) as Record<string, unknown>
  const oficina = txt(pp.oficina), agente = txt(pp.agente)
  if (!oficina || !agente) return err(400, 'entrada_invalida', '`preguntado_por` necesita `oficina` y `agente`: se registra quién preguntó')
  const tema = txt(cuerpo.tema)
  if (!tema || tema.length > MAX_TEMA || !palabrasDelTema(tema).length) return err(400, 'entrada_invalida', `\`tema\` es obligatorio (texto libre, hasta ${MAX_TEMA} caracteres)`)
  const pregunta = txt(cuerpo.pregunta)
  if (!pregunta || pregunta.length > MAX_PREGUNTA) return err(400, 'entrada_invalida', `\`pregunta\` es obligatoria (hasta ${MAX_PREGUNTA} caracteres)`)
  const canal = txt(cuerpo.canal)
  if (!canal || canal.length > 60) return err(400, 'entrada_invalida', '`canal` es obligatorio (p. ej. «MD de Slack», «chat con Lenovo»)')
  const respuesta = txt(cuerpo.respuesta)
  if (evento === 'respuesta' && (!respuesta || respuesta.length > MAX_RESPUESTA)) return err(400, 'entrada_invalida', `\`respuesta\` es obligatoria (hasta ${MAX_RESPUESTA} caracteres)`)
  const cuando = txt(cuerpo.respondido_en)
  if (evento === 'respuesta' && (!cuando || Number.isNaN(Date.parse(cuando)))) return err(400, 'entrada_invalida', '`respondido_en` debe ser una fecha ISO')
  return {
    evento, client_id: String(cuerpo.client_id), sede_clave: txt(cuerpo.sede_clave) || null, pregunta, respuesta, tema, canal, mensaje_ref: txt(cuerpo.mensaje_ref) || null,
    respondido_en: cuando ? new Date(cuando).toISOString() : '', preguntado_por: { oficina, agente }, pregunta_id: txt(cuerpo.pregunta_id) || null, forzar: cuerpo.forzar === true, acumula: cuerpo.acumula === true,
  }
}

export interface DepsDeDueno extends DepsDeRutas {
  /** PORTERO_DUENO */
  activo: boolean
  nuevoId?: () => string
}

const huella16 = (s: string): string => createHash('sha256').update(normalizar(s)).digest('hex').slice(0, 16)
const diasEntre = (desde: string, hasta: Date): number => Math.max(0, Math.round((hasta.getTime() - Date.parse(desde)) / 86_400_000))

/** lo que se le muestra a una oficina de una respuesta del dueño (nunca el modelo decide aquí si vale: se da la fecha) */
export function descripcionDeRespuesta(f: Fila, ahora: Date): Record<string, unknown> {
  const pt = (f.provenance_tag && typeof f.provenance_tag === 'object' ? f.provenance_tag : {}) as Fila
  const d = (pt.datos && typeof pt.datos === 'object' ? pt.datos : {}) as Fila
  const cuando = txt(d.respondido_en) || txt(f.observado_en)
  return {
    ficha_id: String(f.id), tema: txt(d.tema), pregunta: txt(d.pregunta), respuesta: txt(d.respuesta), canal: txt(d.canal), respondido_en: cuando, ...(d.acumula === true ? { acumula: true } : {}),
    hace_dias: cuando ? diasEntre(cuando, ahora) : null, sede: txt(f.sede) || null, confirmado_por_el_dueno: true, mensaje_ref: txt(d.mensaje_ref) || null,
    nota: 'el agente decide por razonamiento si la respuesta sigue vigente; aquí solo está lo que dijo el dueño y cuándo',
  }
}

async function respuestasVigentes(db: Db, clientId: string): Promise<{ ok: true; filas: Fila[] } | { ok: false; detalle: string }> {
  const q = await leerTodas(() => db.from('cerebro_fichas').select('id, ref, atributo, sede, clase, observado_en, provenance_tag, retirada_en, descartada').eq('client_id', clientId).eq('clase', CLASE_DEL_DUENO).is('retirada_en', null).order('id', { ascending: true }))
  if (q.error) return { ok: false, detalle: `cerebro_fichas: ${q.error.message}` }
  return { ok: true, filas: q.data.filter((f) => f.descartada !== true) }
}
const temaDe = (f: Fila): string => { const pt = (f.provenance_tag && typeof f.provenance_tag === 'object' ? f.provenance_tag : {}) as Fila; const d = (pt.datos && typeof pt.datos === 'object' ? pt.datos : {}) as Fila; return txt(d.tema) }
/** la sede de una respuesta: la de su columna o su rastro; null = vale para todas */
const sedeDe = (f: Fila): string => claveDeAlcance(sedesDeFicha(f.provenance_tag) ?? (txt(f.sede) ? txt(f.sede).split(',') : null))

async function sedesDelCliente(db: Db, clientId: string): Promise<{ ok: true; claves: string[]; sedes: Array<{ id: string; clave: string; ciudad: string | null }> } | { ok: false; detalle: string }> {
  const q = await db.from('client_sedes').select('id, clave, ciudad').eq('client_id', clientId)
  if (q.error) return { ok: false, detalle: `client_sedes: ${q.error.message}` }
  const sedes = lista(q.data).map((s) => ({ id: txt(s.id), clave: txt(s.clave), ciudad: txt(s.ciudad) || null })).filter((s) => s.clave)
  return { ok: true, claves: sedes.map((s) => s.clave), sedes }
}

/**
 * Lo que el dueño dijo del ESTADO de una sede («por abrir», «ya abrió», «cerrada») es también un dato de esa sede. Solo si el tema habla del estado de una sede y se sabe de cuál:
 * la que dice `sede_clave`, la única sede del cliente, o la única que nombra la respuesta (por clave o ciudad). Si no se sabe de cuál, no se adivina: queda solo como ficha del dueño.
 */
export function estadoDeSedeDichoPorElDueno(n: { tema: string; sede_clave: string | null }, respuesta: string, sedes: Array<{ id: string; clave: string; ciudad: string | null }>): { sede: { id: string; clave: string }; estado: EstadoDeSede } | null {
  if (!esTemaDeEstadoDeSede(n.tema)) return null
  const estado = estadoDeApertura(respuesta)
  if (!estado) return null
  const clave = n.sede_clave ?? (sedes.length === 1 ? sedes[0].clave : sedeQueNombra(respuesta, sedes))
  const sede = sedes.find((s) => s.clave === clave)
  return sede ? { sede: { id: sede.id, clave: sede.clave }, estado } : null
}

/** POST · registra una respuesta del dueño o una pregunta que se le hizo */
export async function rutaDueno(deps: DepsDeDueno, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo)
  if ('status' in v) return v
  const n = normalizar_(v.cuerpo)
  if ('status' in n) return n
  if (!deps.activo) return { status: 200, body: { apagado: true, detalle: 'PORTERO_DUENO está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const id = deps.nuevoId ?? randomUUID
  const dia = ahora.toISOString().slice(0, 10)

  const cl = await deps.db.from('clients').select('id').eq('id', n.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  if (!lista(cl.data).length) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const sedes = await sedesDelCliente(deps.db, n.client_id)
  if (!sedes.ok) return err(502, 'lectura_fallida', sedes.detalle)
  if (n.sede_clave && !sedes.claves.includes(n.sede_clave)) return err(400, 'sede_inexistente', `«${n.sede_clave}» no es una sede del cliente (${sedes.claves.join(', ') || 'no tiene sedes'})`)
  const sedeClave = n.sede_clave && sedes.claves.length >= 2 ? n.sede_clave : null // un cliente de una sola sede: todo es de esa sede
  const alcance = claveDeAlcance(sedeClave ? [sedeClave] : null)

  const vig = await respuestasVigentes(deps.db, n.client_id)
  if (!vig.ok) return err(502, 'lectura_fallida', vig.detalle)
  const delMismoTema = vig.filas.filter((f) => sedeDe(f) === alcance && esElMismoTema(temaDe(f), n.tema))
  const hace = new Date(ahora.getTime() - HORAS_DE_UNA_PREGUNTA_PENDIENTE * 3_600_000).toISOString()
  const pe = await deps.db.from('cerebro_dueno_preguntas').select('*').eq('client_id', n.client_id).eq('estado', 'pendiente').gte('creado_en', hace).limit(200)
  if (pe.error) return err(502, 'lectura_fallida', `cerebro_dueno_preguntas: ${pe.error.message}`)
  const pendientes = lista(pe.data).filter((p) => (txt(p.sede_clave) || '') === (sedeClave ?? '') && esElMismoTema(txt(p.tema), n.tema))

  // ── una PREGUNTA: antes de registrarla, ¿ya se respondió o ya la hizo otra oficina?
  if (n.evento === 'pregunta') {
    if (!n.forzar && delMismoTema.length) return { status: 200, body: { ok: true, registrada: false, ya_respondida: true, respuestas: delMismoTema.map((f) => descripcionDeRespuesta(f, ahora)), nota: 'no preguntes: ya respondió. Si por razonamiento ya no vale, repite con `forzar: true`' } }
    const esMia = (p: Fila) => txt(p.preguntado_por_oficina) === n.preguntado_por.oficina && txt(p.preguntado_por_agente) === n.preguntado_por.agente
    const otra = pendientes.find((p) => !esMia(p))
    if (!n.forzar && otra) return { status: 200, body: { ok: true, registrada: false, ya_preguntada: true, pendiente: { pregunta_id: String(otra.id), oficina: txt(otra.preguntado_por_oficina), agente: txt(otra.preguntado_por_agente), canal: txt(otra.canal), desde: txt(otra.creado_en) }, nota: 'otra oficina ya le preguntó esto al dueño y espera su respuesta: espera esa respuesta (se te dirá por la lectura)' } }
    const propia = pendientes.find(esMia)
    if (propia && !n.forzar) return { status: 200, body: { ok: true, registrada: false, repetida: true, pregunta_id: String(propia.id), nota: 'tu misma pregunta sigue pendiente' } }
    const pid = id()
    if (!v.dry_run) {
      const w = await deps.db.from('cerebro_dueno_preguntas').insert({ id: pid, client_id: n.client_id, sede_clave: sedeClave, tema: n.tema, tema_norm: temaNormal(n.tema), pregunta: n.pregunta, canal: n.canal, preguntado_por_oficina: n.preguntado_por.oficina, preguntado_por_agente: n.preguntado_por.agente, estado: 'pendiente', workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id })
      if (w.error) return err(502, 'registro_fallido', `cerebro_dueno_preguntas: ${w.error.message}`)
    }
    return { status: 200, body: { ok: true, registrada: !v.dry_run, pregunta_id: pid, dry_run: v.dry_run, ...(v.dry_run ? { nota: 'dry_run: no se registró nada' } : {}) } }
  }

  // ── una RESPUESTA
  const limpia = sinDatosPersonales(n.respuesta)
  const preguntaLimpia = sinDatosPersonales(n.pregunta).texto
  const ref = `dueno:${temaNormal(n.tema)}:${alcance || 'todas'}:${huella16(`${limpia.texto}|${n.mensaje_ref ?? n.respondido_en}`)}`
  const igual = await deps.db.from('cerebro_fichas').select('id').eq('client_id', n.client_id).eq('ref', ref).limit(1)
  if (igual.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${igual.error.message}`)
  if (lista(igual.data).length) return { status: 200, body: { ok: true, repetida: true, ficha_id: String(lista(igual.data)[0].id), nota: 'esta misma respuesta ya estaba guardada' } }

  const vieja = n.acumula ? null : delMismoTema.sort((a, b) => (txt(b.observado_en) < txt(a.observado_en) ? -1 : 1))[0] ?? null
  // una respuesta MÁS VIEJA que la vigente no la reemplaza (llegó tarde): se guarda archivada con su fecha
  const llegoTarde = !!vieja && txt(vieja.observado_en) > n.respondido_en
  const fichaId = id()
  const estadoDeSede = estadoDeSedeDichoPorElDueno({ tema: n.tema, sede_clave: n.sede_clave }, limpia.texto, sedes.sedes)
  const plan = { ficha_id: fichaId, tema: n.tema, sede: sedeClave, ...(n.acumula ? { acumula: true } : {}), ...(estadoDeSede ? { estado_de_sede: { sede: estadoDeSede.sede.clave, estado: estadoDeSede.estado } } : {}), reemplaza: vieja && !llegoTarde ? String(vieja.id) : null, llego_tarde: llegoTarde, datos_personales_omitidos: limpia.redactado }
  if (v.dry_run) return { status: 200, body: { ok: true, dry_run: true, ...plan, nota: 'dry_run: no se guardó nada' } }

  const ing = id()
  const wi = await deps.db.from('cerebro_ingresos').insert({ id: ing, client_id: n.client_id, origen: 'dueno', fuente_ref: `dueno:${n.canal}`.slice(0, 120), es_completa: false, huella: `${dia}:dueno:${huella16(ref)}`, material: null, estado: 'fichado', workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id })
  if (wi.error) return err(502, 'registro_fallido', `cerebro_ingresos: ${wi.error.message}`)
  const cuando = n.respondido_en
  const contenido = `Confirmado por el dueño (${n.canal}, ${cuando.slice(0, 10)}). Pregunta: «${preguntaLimpia}». Respuesta del dueño: «${limpia.texto}»`
  const fila = {
    id: fichaId, client_id: n.client_id, ingreso_id: ing, ref, clase: CLASE_DEL_DUENO, titulo: `Dueño · ${n.tema}${sedeClave ? ` · sede ${sedeClave}` : ''}`.slice(0, 160), que_es: limpia.texto.slice(0, 200), contenido, origen: 'dueno',
    fecha_fuente: cuando, reconfirmado_en: cuando, plazo: null, vigente_hasta: null, version_de: vieja && !llegoTarde ? String(vieja.id) : null, huella: huella16(contenido),
    propiedad: 'propia', porque: `respuesta del dueño por ${n.canal}`, juzgado_por: 'regla', observado_en: cuando, atributo: `${PREFIJO_DE_ATRIBUTO}${temaNormal(n.tema)}`, sede: alcance || null,
    decision: vieja && !llegoTarde ? 'reemplaza' : 'suma', razon_de_decision: vieja && !llegoTarde ? 'una respuesta nueva del dueño al mismo tema reemplaza a la anterior' : n.acumula ? 'nota que se suma (acumula): no reemplaza a otras del mismo tema' : llegoTarde ? 'llegó más tarde que otra más nueva: queda archivada' : 'primera respuesta del dueño a este tema',
    alcance: 'cliente', descartada: false, retirada_en: llegoTarde ? ahora.toISOString() : null, motivo_retirada: llegoTarde ? 'una respuesta más nueva del dueño al mismo tema ya estaba guardada' : null,
    provenance_tag: {
      type: 'evidence', source: 'dueno', trust_level: 'untrusted', confirmado_por: 'dueno', canal: n.canal, ingress_route: '/api/brain/alimentar/dueno',
      datos: { tema: n.tema, tema_norm: temaNormal(n.tema), pregunta: preguntaLimpia, respuesta: limpia.texto, canal: n.canal, mensaje_ref: n.mensaje_ref, respondido_en: cuando, preguntado_por: n.preguntado_por, ...(n.acumula ? { acumula: true } : {}), ...(limpia.redactado ? { datos_personales_omitidos: true } : {}), ...datosDeSede(sedeClave ? [sedeClave] : null) },
    },
  }
  const wf = await deps.db.from('cerebro_fichas').insert(fila)
  if (wf.error) return err(502, 'registro_fallido', `cerebro_fichas: ${wf.error.message}`)
  const errores: string[] = []
  if (vieja && !llegoTarde) {
    const u = await deps.db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: `reemplazada por ${fichaId} el ${dia} (nueva respuesta del dueño al mismo tema)`, reemplazada_por: fichaId }).eq('id', String(vieja.id)).eq('client_id', n.client_id)
    if (u.error) errores.push(`retiro de la respuesta anterior: ${u.error.message}`)
  }
  // el estado de la sede, también como dato de la sede (fila nueva; las anteriores no se borran): origen dueño, con su cita
  if (estadoDeSede) {
    const cita = `cerebro_fichas:${fichaId} · ${n.canal} · ${cuando.slice(0, 10)} · «${limpia.texto.slice(0, 200)}»`
    const ws = await deps.db.from('client_sede_datos').insert({ client_id: n.client_id, sede_id: estadoDeSede.sede.id, campo: CAMPO_DEL_ESTADO, valor_texto: textoDeEstado(estadoDeSede.estado), valor_norm: { estado: estadoDeSede.estado }, fuente: 'dueno', fuente_ref: cita.slice(0, 500), alcance: 'sede', observado_en: cuando })
    if (ws.error) errores.push(`estado de la sede: ${ws.error.message}`)
  }
  // las preguntas pendientes de ese tema quedan respondidas
  for (const p of n.pregunta_id ? lista(pe.data).filter((x) => String(x.id) === n.pregunta_id) : pendientes) {
    const u = await deps.db.from('cerebro_dueno_preguntas').update({ estado: 'respondida', respondida_en: cuando, ficha_id: fichaId }).eq('id', String(p.id))
    if (u.error) errores.push(`pregunta pendiente ${String(p.id)}: ${u.error.message}`)
  }
  // al índice donde ya buscan las oficinas (si falla, la pasada diaria lo repara)
  let puente: Record<string, unknown> | null = null
  try { if (deps.puente) puente = (await reconciliarYEnviar(deps, n.client_id, false)).puente } catch { /* la reconciliación diaria lo repara */ }
  return { status: errores.length ? 502 : 200, body: { ok: errores.length === 0, ...plan, guardada: true, canal: n.canal, respondido_en: cuando, errores, ...(puente ? { puente } : {}) } }
}

/** GET · ¿ya se respondió? (y qué hay pendiente). Sin `tema`: lo último que dijo el dueño. El agente decide si sigue vigente. */
export async function rutaLeerDueno(deps: { db: Db; ahora?: Date }, params: { client_id: string; tema?: string | null; sede_clave?: string | null; canal?: string | null; limite?: number | string | null }): Promise<Respuesta> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.client_id)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const ahora = deps.ahora ?? new Date()
  const vig = await respuestasVigentes(deps.db, params.client_id)
  if (!vig.ok) return err(502, 'lectura_fallida', vig.detalle)
  const tema = txt(params.tema)
  const sede = txt(params.sede_clave)
  const orden = (a: Fila, b: Fila) => (txt(b.observado_en) < txt(a.observado_en) ? -1 : 1)
  const deLaSede = vig.filas.filter((f) => !sede || sedeDe(f) === sede || sedeDe(f) === '')
  const canal = normalizar(txt(params.canal))
  const canalDe = (f: Fila): string => { const pt = (f.provenance_tag && typeof f.provenance_tag === 'object' ? f.provenance_tag : {}) as Fila; const d = (pt.datos && typeof pt.datos === 'object' ? pt.datos : {}) as Fila; return normalizar(txt(d.canal)) }
  const delCanal = canal ? deLaSede.filter((f) => canalDe(f) === canal) : deLaSede
  const halladas = (tema ? delCanal.filter((f) => esElMismoTema(temaDe(f), tema)) : delCanal).sort(orden)
  // `limite`: por omisión 20 (sin tema) o 5 (con tema); máximo 100. `total` dice cuántas hay, para saber si se recortó.
  const pedido = Number(params.limite)
  const limite = Number.isFinite(pedido) && pedido >= 1 ? Math.min(100, Math.floor(pedido)) : tema ? 5 : 20
  const hace = new Date(ahora.getTime() - HORAS_DE_UNA_PREGUNTA_PENDIENTE * 3_600_000).toISOString()
  const pe = await deps.db.from('cerebro_dueno_preguntas').select('*').eq('client_id', params.client_id).eq('estado', 'pendiente').gte('creado_en', hace).limit(200)
  if (pe.error) return err(502, 'lectura_fallida', `cerebro_dueno_preguntas: ${pe.error.message}`)
  const pend = lista(pe.data).filter((p) => !tema || esElMismoTema(txt(p.tema), tema)).map((p) => ({ pregunta_id: String(p.id), tema: txt(p.tema), oficina: txt(p.preguntado_por_oficina), agente: txt(p.preguntado_por_agente), canal: txt(p.canal), desde: txt(p.creado_en) }))
  return { status: 200, body: { ok: true, client_id: params.client_id, tema: tema || null, respondida: tema ? halladas.length > 0 : null, respuestas: halladas.slice(0, limite).map((f) => descripcionDeRespuesta(f, ahora)), total: halladas.length, recortado: halladas.length > limite, ...(canal ? { canal: txt(params.canal) } : {}), pendientes: pend, modelos_llamados: 0 } }
}
