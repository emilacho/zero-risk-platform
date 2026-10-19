/**
 * F8 · EL ORQUESTADOR FINANCIERO (CC#1 · 14-oct) · diseño v2 rev. 9 §6b. Un SEGUNDO orquestador sobre el motor puro de la oficina (precedente: `orquestador-laminas.ts`); NO toca el de creativos ni sus tablas.
 * `avanzar()` ejecuta UN paso y lo persiste (la conversación vive en la base; Slack es el espejo legible). Nunca bloquea al plan: sin acuerdo → «sin_acuerdo» y marca; un formato roto → «sin supuestos del agente».
 * Nace APAGADO: con `finanzas_config.conversa = 'apagado'` → 409 antes de leer, llamar al modelo o escribir.
 */
import { registrarPaso, siguientePaso, type ResultadoDePaso } from '../../oficina/motor'
import type { Estado, Paso, Plantilla } from '../../oficina/tipos'
import { estadoInicial } from '../../oficina/tipos'
import { calcular } from '../calculadora'
import { decidirFirma, estaAbierto, huellaDe, numerosDelBloque, resueltosSinEstado } from '../firma'
import { separarComprobado } from '../confirmado-por-dueno'
import { lineaBaseSemanal } from '../linea-base'
import { leerRespuesta } from '../preguntas'
import type { Bloque } from '../tipos'
import { entradaDesdeLaConversa } from './entrada'
import { extraerJson, respuestaDeEquilibrioValida, sanearProcedencia, validarAcuerdo, validarConsulta, validarPlanteo, validarProcedencia, type AcuerdoV1, type ConsultaV1, type PlanteoV1 } from './esquemas'
import { CANALES_VALIDOS, especialistasQueHablan } from './omision'
import { AGENTES, PLANTILLA_FINANCIERA, reservaDelCierre2 } from './plantilla'
import { ESTADOS_TERMINALES, type EncargoDeConversa, type FirmaDeTope, type PuertosDeConversa, type Semilla, type TurnoDeConversa } from './puertos'
import { sha256 } from './util'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
const MAX_TAREA = 60_000

// ───────────────────────────────────────────────────────── la puerta
export async function abrirConversacion(P: PuertosDeConversa, cuerpo: unknown): Promise<Respuesta> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] } }
  const c = cuerpo as Record<string, unknown>
  let cfg
  try { cfg = await P.config() } catch (e) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  // APAGADA = 409 antes de todo (la oficina y la conversación tienen cada una su interruptor)
  if (cfg.estado === 'apagada' || cfg.conversa === 'apagado') return { status: 409, cuerpo: { error: 'conversa_apagada' } }
  if (typeof c.dry_run !== 'boolean') return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`dry_run` es obligatorio y debe ser booleano'] } }
  if (typeof c.client_id !== 'string' || !c.client_id.trim()) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`client_id` es obligatorio'] } }
  if ((cfg.estado === 'ensayo' || cfg.conversa === 'ensayo') && !cfg.clientes_ensayo.includes(c.client_id)) return { status: 409, cuerpo: { error: 'cliente_fuera_de_ensayo' } }
  if (typeof c.semilla !== 'object' || c.semilla === null || Array.isArray(c.semilla)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`semilla` es obligatoria y debe ser un objeto'] } }
  if (JSON.stringify(c.semilla).length > 40_000) return { status: 413, cuerpo: { error: 'semilla_demasiado_grande', maximo: 40_000 } }
  // plan v3 · V4: `semilla.datos` se VALIDA (antes pasaba cualquier cosa): forma inválida ⇒ 400 con la lista de errores
  const datosCrudos = (c.semilla as Record<string, unknown>).datos
  if (datosCrudos !== undefined) {
    const v = validarProcedencia(datosCrudos)
    if (!v.ok) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: v.errores } }
  }
  const r = await P.almacen.crearEncargo({ client_id: c.client_id.trim(), dry_run: c.dry_run, semilla: c.semilla as Semilla })
  if (!r.ok) return { status: 500, cuerpo: { error: 'no_se_pudo_abrir', sin_bloque: true, detalle: r.error } }
  return { status: 200, cuerpo: { encargo_id: r.encargo.id, nuevo: r.nuevo, estado: r.encargo.estado, pasos_ejecutados: r.encargo.estado_del_motor.pasos_ejecutados } }
}

// ───────────────────────────────────────────────────────── el pedido de cada agente
const REGLAS_COMUNES = [
  'Esta tarea NO es un brief de campaña ni un documento: es una respuesta corta y estructurada dentro de una conversación de oficina.',
  'Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin bloques de código), en español, y tutea.',
  'Todo el contexto necesario va en este mensaje: no consultes el Client Brain, no busques en la web ni uses herramientas.',
  'No inventes cifras: todo número que no sea un dato del contexto va como supuesto, con rango {min, max, base} y dicho como supuesto (EXCEPTO en el planteo y el ajuste, donde `meta_por_semana` es UN solo número, sin rango: el rango lo ponen los especialistas en sus `supuestos`).',
]
/** lo que cada especialista debe devolver (el esquema ESCRITO, no «el mismo de arriba»: un agente que no lo ve devuelve otra forma y falla el formato) */
const ESQUEMA_DE_CONSULTA = 'Esquema consulta_financiera.v1 (devuelve EXACTAMENTE estas claves): {"agente": "<tu nombre>", "resumen": "<texto corto>", "supuestos": {"ticket"?: {min,max,base?}, "margen"?: {min,max,base?}, "costo_entrega"?: {...}, "periodos"?: {...}, "tasa_cierre"?: {...}, "costo_por_resultado"?: {...}, "costo_por_resultado_alterno"?: {...}} (puede ir vacío {} pero la clave `supuestos` SIEMPRE va), "minimo_diario_por_conjunto"?: numero, "preguntas_a_otros": [{"a": "fpa|redes|busqueda|medicion|plan", "pregunta": "..."}] (MÁXIMO 3; puede ir []), "alertas": ["..."] (puede ir [])}.'
/** la FORMA exacta del planteo, con un ejemplo literal: el intento 3 devolvió el planteo envuelto en `{planteo:{…}}`, con `meta_por_semana` y `evento` como objetos */
const FORMA_DEL_PLANTEO = 'FORMA OBLIGATORIA: devuelve el objeto PLANO (sin envolverlo en otra clave): `meta_por_semana` es UN NÚMERO (no un objeto ni un rango); `evento` es un TEXTO de hasta 60 caracteres (una etiqueta corta como «mensaje», no una descripción); `canales` es una lista de {canal, peso} con claves de la lista. Ejemplo exacto de forma: {"meta_por_semana": 20, "zonas": ["zona_a"], "dias_y_horarios": {"dias_activos_por_semana": 5, "horario": "09:00-17:00"}, "evento": "mensaje", "canales": [{"canal": "meta_ig", "peso": 0.6, "activo": true}, {"canal": "base_propia", "peso": 0.4}], "produccion": {"fraccion": 0.2}, "marca": 0.1, "no_se": ["lo que no sabes"]}. Aquí NO escribes un brief creativo ni un documento: solo este objeto.'
const LISTA_DE_CANALES = `Las claves de canal válidas son EXACTAMENTE: ${CANALES_VALIDOS.join(', ')} (meta_ig = redes de Meta con pauta; busqueda_pagada = anuncios de búsqueda; busqueda_local = búsqueda local gratuita; base_propia = su propia lista de clientes). NO inventes otras claves ni nombres de plataforma como clave: una clave que no figure aquí se rechaza.`
const POR_PASO: Record<string, string> = {
  planteo: FORMA_DEL_PLANTEO + ' ' + 'Eres el que escribe el plan. PROPÓN: meta por semana (prudente y, si quieres, ambiciosa), zonas, días y horarios de atención, el evento que se paga, los canales (cada uno con su peso entre 0 y 1; marca activo:false y su condición si el plan lo difiere; ' + LISTA_DE_CANALES + '), la producción (fraccion o monto) y la marca (fracción de Meta+IG). Di en `no_se` lo que no sabes y en `dado_por_verificado` lo que diste por verificado. NO fijes montos de pauta, costos ni techos: eso lo calcula finanzas. Esquema planteo.v1: {meta_por_semana, meta_ambiciosa_por_semana?, zonas[], dias_y_horarios:{dias_activos_por_semana, horario?}, evento, canales[{canal, peso, piso_diario?, activo?, condicion?}], produccion?:{fraccion?|monto?}, marca?, horizonte_dias?, ciclo_dias?, no_se[], dado_por_verificado?[]}.',
  fpa: 'Eres el analista de presupuesto. Da, con rango y como supuesto: ticket, margen, costo de entrega (si aplica), períodos (recompra/permanencia, si aplica) y tasa de cierre (resultado → venta). Pide a otro especialista lo que te falta (máximo 3). Esquema consulta_financiera.v1: {agente, resumen, supuestos:{ticket?, margen?, costo_entrega?, periodos?, tasa_cierre?, costo_por_resultado?}, minimo_diario_por_conjunto?, preguntas_a_otros[{a, pregunta}], alertas[]} con cada rango {min, max, base?}.',
  redes: 'Eres el especialista en redes. Da, con rango y como supuesto: costo por resultado del evento (y del evento alterno si el presupuesto no alcanza), el mínimo diario por conjunto, estructura de campañas y aprendizaje. ' + ESQUEMA_DE_CONSULTA,
  busqueda: 'Eres el especialista en búsqueda. Di si conviene ACTIVAR la búsqueda pagada o diferirla, su mínimo y la señal de activación; recuerda que la búsqueda local gratuita va primero. ' + ESQUEMA_DE_CONSULTA,
  medicion: 'Eres el especialista en medición. Di qué cuenta como resultado según el evento, cómo se enlaza con la venta sin tocar el destino, la hoja mínima y los umbrales. ' + ESQUEMA_DE_CONSULTA,
  ajuste: FORMA_DEL_PLANTEO + ' ' + 'Lee las respuestas de los especialistas, AJUSTA tu planteo (meta, fases, reparto) y contesta lo que te piden. Devuelve el planteo FIJADO con el mismo esquema planteo.v1. ' + LISTA_DE_CANALES + ' No fijes montos de pauta. Si el contexto trae `equilibrio` con `cubre: false`, la meta NO paga el plan: DEBES agregar `equilibrio_respuesta: { decision: "subo_la_meta" | "mantengo_la_meta", motivo }` (si subes la meta, sube `meta_por_semana` y di de dónde sale: es un supuesto; si la mantienes, di por qué). La meta de equilibrio la calculó el código: no la recalcules.',
  cierre: 'Eres el jefe de finanzas. Resuelve los conflictos y emite la SALIDA: sale, sale_ajustada o sale_con_alerta (nunca «no sale»: lo financiero no bloquea). Lista los hallazgos con severidad (critico, alto, medio, bajo) y a quién aluden (fpa, redes, busqueda, medicion, plan). Cada hallazgo lleva su ESTADO: «abierto» (sigue pendiente) o «resuelto» (tú mismo lo resolviste en este cierre); un crítico resuelto no bloquea la firma, y escribir «RESUELTO» en el texto sin el campo estado NO cuenta (el código lo toma como abierto y lo avisa). Si una cifra que manda está «sin base», solo puedes emitir sale_con_alerta. Esquema acuerdo.v1: {salida, hallazgos[{severidad, que, alude?, estado}], conflictos_resueltos[], dato_que_no_bloquea?, preguntas_a_emilio[{clave, texto, recomendacion, supuesto_si_no_responde}]}.',
}
export function pedidoDelAgente(paso: Paso, contexto: Record<string, unknown>): string {
  const base = paso.clave.replace(/_2$/, '')
  const instruccion = POR_PASO[base] ?? POR_PASO.ajuste
  const ronda2 = paso.ronda === 2 ? '\nEs la RONDA 2 (la última): contesta SOLO lo que el jefe te alude en `acuerdo.hallazgos`.' : ''
  const ctx = JSON.stringify(contexto)
  const tarea = `${REGLAS_COMUNES.join('\n')}\n\n${instruccion}${ronda2}\n\nCONTEXTO (JSON):\n${ctx}`
  return tarea.length > MAX_TAREA ? tarea.slice(0, MAX_TAREA) : tarea
}

// ───────────────────────────────────────────────────────── funciones de código
type Arts = Record<string, Record<string, unknown>>
const planteoVigente = (a: Arts) => (a.planteo_fijado_2 ?? a.planteo_fijado ?? a.planteo ?? a.expediente?.planteo_inicial) as unknown as PlanteoV1 | undefined

function abrirFinanciera(e: EncargoDeConversa): ResultadoDePaso {
  const s = e.semilla
  const datos = sanearProcedencia(s.datos ?? [], s.corrida_es_de_ensayo === true)
  const planteoInicial: Partial<PlanteoV1> = {
    zonas: s.zonas ?? [], dias_y_horarios: { dias_activos_por_semana: s.dias_activos_por_semana ?? 7 }, evento: s.evento ?? 'mensaje', canales: [], no_se: ['planteo inicial derivado por código de la ficha (supuesto)'],
  }
  return {
    costo_usd: 0,
    artefacto: {
      cliente: e.client_id, rubro: s.rubro ?? null, pais: s.pais ?? null, moneda: s.moneda ?? null, fecha: s.fecha ?? null,
      ficha_resumen: s.ficha_resumen ?? null, manual_resumen: s.manual_resumen ?? null, brazos_resumen: s.brazos_resumen ?? null, derivado: s.derivado ?? null,
      datos, linea_base_por_semana: typeof s.linea_base_por_semana === 'number' && s.linea_base_por_semana > 0 ? s.linea_base_por_semana : null, referencias: s.referencias ?? [], evento_alterno: s.evento_alterno ?? {}, pisos: s.pisos ?? {},
      corrida_es_de_ensayo: s.corrida_es_de_ensayo === true, planteo_inicial: planteoInicial, notas_del_dueno: [], datos_del_dueno: [],
    },
  }
}

function consultaDe(a: Arts, k: string): ConsultaV1 | null {
  const c = a[k]
  return c && !c.sin_supuestos_del_agente ? (c as unknown as ConsultaV1) : null
}

type EntradaDelMomento =
  | { ok: true; entrada: Parameters<typeof calcular>[0]; alertas: string[]; planteo: PlanteoV1 }
  | { ok: false; motivo: string; errores: string[] }
/** la entrada de la calculadora con lo que hay en este momento (la MISMA para el cálculo y para el equilibrio que ve el ajuste) */
function entradaDelMomento(a: Arts, ronda: 1 | 2): EntradaDelMomento {
  const sano = (k: string) => (a[k] && !a[k].sin_supuestos_del_agente ? a[k] : undefined)
  const planteo = ronda === 2 ? (sano('planteo_fijado_2') ?? sano('planteo_fijado') ?? sano('planteo')) : (sano('planteo_fijado') ?? sano('planteo'))
  const exp = a.expediente ?? {}
  const consultas = ronda === 2
    ? { fpa: consultaDe(a, 'consulta_fpa_2') ?? consultaDe(a, 'consulta_fpa'), redes: consultaDe(a, 'consulta_redes_2') ?? consultaDe(a, 'consulta_redes'), busqueda: consultaDe(a, 'consulta_busqueda_2') ?? consultaDe(a, 'consulta_busqueda'), medicion: consultaDe(a, 'consulta_medicion_2') ?? consultaDe(a, 'consulta_medicion') }
    : { fpa: consultaDe(a, 'consulta_fpa'), redes: consultaDe(a, 'consulta_redes'), busqueda: consultaDe(a, 'consulta_busqueda'), medicion: consultaDe(a, 'consulta_medicion') }
  if (!planteo) return { ok: false, motivo: 'sin_planteo', errores: [] }
  const quien = especialistasQueHablan((planteo as unknown as PlanteoV1).canales ?? [])
  if (quien.sin_pauta) return { ok: false, motivo: 'sin_pauta', errores: [] }
  const ent = entradaDesdeLaConversa({ planteo: planteo as unknown as PlanteoV1, consultas, expediente: { referencias: (exp.referencias as never) ?? [], evento_alterno: (exp.evento_alterno as never) ?? {}, pisos: (exp.pisos as never) ?? {}, fecha: (exp.fecha as string) ?? undefined, datos: Array.isArray(exp.datos) ? (exp.datos as never) : [], linea_base_por_semana: typeof exp.linea_base_por_semana === 'number' ? exp.linea_base_por_semana : null } })
  if (!ent.ok) return { ok: false, motivo: 'sin_base', errores: ent.errores }
  // el planteo se conservó sin responder al equilibrio: el bloque lo DICE (alerta), no lo oculta
  const sinResp = (planteo as { equilibrio_sin_respuesta?: unknown }).equilibrio_sin_respuesta === true
  return { ok: true, entrada: ent.entrada, alertas: sinResp ? [...ent.alertas, 'equilibrio_sin_respuesta: la meta no cubre el equilibrio y el ajuste no lo respondió; el planteo se conservó sin esa decisión'] : ent.alertas, planteo: planteo as unknown as PlanteoV1 }
}

function calcularBloque(e: EncargoDeConversa, a: Arts, ronda: 1 | 2): ResultadoDePaso {
  const previo = (a.bloque ?? null) as { huella?: string } | null
  const sinBloque = (motivo: string, errores: string[] = []): ResultadoDePaso => ({ costo_usd: 0, artefacto: { hay_bloque: false, cambio: ronda === 2 && !!previo?.huella, motivo, errores, huella: null } })
  const m = entradaDelMomento(a, ronda)
  if (!m.ok) return sinBloque(m.motivo, m.errores)
  const planteo = m.planteo
  const r = calcular(m.entrada)
  if (!r.ok) return sinBloque('entrada_invalida', r.errores)
  const huella = huellaDe(r)
  return { costo_usd: 0, artefacto: { hay_bloque: true, bloque: r as unknown as Record<string, unknown>, entrada: m.entrada as unknown as Record<string, unknown>, alertas_de_entrada: [...m.alertas, ...(Array.isArray((planteo as { dado_por_verificado?: unknown }).dado_por_verificado) && ((planteo as { dado_por_verificado: unknown[] }).dado_por_verificado).length ? ['el plan dio por verificado algo que el código no comprueba: la confianza no sube y la salida solo puede ser «con alerta»'] : [])], huella, cambio: ronda === 2 ? huella !== previo?.huella : false } }
}

/** plan v3 · V7 · lo que el ajuste DEBE ver: la meta de equilibrio calculada por código con los supuestos que ya hay (o null si todavía no hay con qué) */
export function equilibrioParaElAjuste(a: Arts, ronda: 1 | 2): { cubre: boolean | null; meta_actual: number; meta_de_equilibrio_semana: number | null; meta_sugerida_semana: number | null; es: string; motivo: string | null } | null {
  const m = entradaDelMomento(a, ronda)
  if (!m.ok) return null
  const r = calcular(m.entrada)
  if (!r.ok) return null
  const q = r.equilibrio
  return { cubre: q.cubre, meta_actual: q.meta_actual, meta_de_equilibrio_semana: q.meta_de_equilibrio_semana, meta_sugerida_semana: q.meta_sugerida_semana, es: 'SUPUESTO calculado por código con los supuestos de los especialistas; no es un dato', motivo: q.motivo }
}

// ───────────────────────────────────────────────────────── el hilo
function textoDelTurno(paso: Paso, n: number, salida: Record<string, unknown> | null, degradado: string | null): string {
  const quien = paso.tipo === 'agente' ? paso.quien : 'oficina'
  const cab = `*${quien}* · turno ${n} · ronda ${paso.ronda ?? 1}`
  if (degradado) return `${cab}\n⚠️ sin supuestos del agente (${degradado}); la conversación sigue con los supuestos del código.`
  if (!salida) return `${cab}\n(sin contenido)`
  const s = salida as Record<string, any>
  switch (paso.clave.replace(/_2$/, '')) {
    case 'planteo': case 'ajuste': return `${cab}\nMeta ${s.meta_por_semana}/sem · evento ${s.evento} · ${s.zonas?.length ?? 0} zona(s) · ${s.canales?.length ?? 0} canal(es). No sé: ${(s.no_se ?? []).join('; ') || '—'}${s.equilibrio_sin_respuesta ? ' ⚠️ no respondió al equilibrio: el planteo se conserva y el plan lo dice' : ''}`
    case 'calculo': return `${cab}\n${s.hay_bloque ? `Bloque calculado (huella ${String(s.huella).slice(0, 8)}…).` : `Sin bloque: ${s.motivo}.`}`
    case 'cierre': return `${cab}\nSalida: ${s.salida} · ${(s.hallazgos ?? []).length} hallazgo(s).${s.dato_que_no_bloquea ? ' ' + s.dato_que_no_bloquea : ''}`
    case 'firma': return `${cab}\nTablero ${s.estado}${s.sin_acuerdo ? ' (sin acuerdo: sale con supuesto y marca)' : ''}.`
    default: return `${cab}\n${s.resumen ?? '(sin resumen)'}`
  }
}
async function publicar(P: PuertosDeConversa, e: EncargoDeConversa, texto: string): Promise<Partial<Pick<EncargoDeConversa, 'slack_canal' | 'slack_ts'>>> {
  // en seco NO se publica nada (como el puerto `avisar` de la oficina creativa); con el canal sin configurar tampoco
  if (e.dry_run) return {}
  if (!(e.slack_canal ?? P.canalDelHilo)?.trim()) return {}
  try {
    let ts = e.slack_ts
    let nuevo: Partial<Pick<EncargoDeConversa, 'slack_canal' | 'slack_ts'>> = {}
    if (!ts) {
      const raiz = await P.slack.publicar({ canal: P.canalDelHilo, thread_ts: null, texto: `🧵 Cliente ${e.client_id} · bloque financiero` })
      if (!raiz.ok || !raiz.ts) return {}
      ts = raiz.ts
      nuevo = { slack_canal: P.canalDelHilo, slack_ts: ts }
    }
    await P.slack.publicar({ canal: e.slack_canal ?? P.canalDelHilo, thread_ts: ts, texto })
    return nuevo
  } catch { return {} }
}

/** lo que Emilio escribió en el hilo desde la última lectura: respuestas numeradas a las preguntas abiertas y notas (NUNCA dato confirmado) */
async function recogerDelHilo(P: PuertosDeConversa, e: EncargoDeConversa, claves: string[]): Promise<{ notas: Array<{ ts: string; texto: string }>; respuestas: Array<{ clave: string; valor: unknown; literal: string; ts: string }>; leido_hasta: string | null; sin_acceso?: string }> {
  if (e.dry_run || !e.slack_ts || !e.slack_canal) return { notas: [], respuestas: [], leido_hasta: e.leido_hasta }
  const r = await P.slack.leer({ canal: e.slack_canal, thread_ts: e.slack_ts, desde_ts: e.leido_hasta }).catch(() => ({ ok: false as const, mensajes: [], leido_hasta: e.leido_hasta, sin_acceso: 'red' }))
  if (!r.ok) return { notas: [], respuestas: [], leido_hasta: e.leido_hasta, sin_acceso: r.sin_acceso }
  const notas: Array<{ ts: string; texto: string }> = [], respuestas: Array<{ clave: string; valor: unknown; literal: string; ts: string }> = []
  for (const m of r.mensajes) {
    const lect = leerRespuesta(m.texto, claves)
    let fueRespuesta = false
    for (const l of lect) if (l.tipo === 'respuesta') { respuestas.push({ clave: l.clave, valor: l.valor, literal: l.literal, ts: m.ts }); fueRespuesta = true }
    if (!fueRespuesta) notas.push({ ts: m.ts, texto: m.texto })
  }
  return { notas, respuestas, leido_hasta: r.leido_hasta }
}

// ───────────────────────────────────────────────────────── avanzar UN paso
/** el tope propio de un encargo nunca pasa de aquí, salvo con una firma registrada en la semilla (la plantilla sigue en 1,50) */
export const TOPE_MAXIMO_POR_ENCARGO_USD = 3
/** la firma que habilita un tope por encima del techo: bien formada = quién, cuándo, valor numérico y ruta del papel, todo presente */
export function firmaDeTopeValida(f: FirmaDeTope | undefined): f is FirmaDeTope {
  return !!f && typeof f === 'object' && [f.quien, f.cuando, f.papel].every((x) => typeof x === 'string' && x.trim() !== '') && typeof f.valor === 'number' && Number.isFinite(f.valor)
}
/** el tope total de la prueba es válido si los tres números son finitos y no negativos y el límite es positivo */
export function topeDePruebaValido(t: Semilla['tope_de_prueba']): t is NonNullable<Semilla['tope_de_prueba']> {
  return !!t && typeof t === 'object' && [t.limite_usd, t.base_usd, t.encargo_base_usd].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && t.limite_usd > 0
}
/** la plantilla de ESTE encargo: igual a la financiera, con el tope propio de la semilla si es un número válido (solo sube, con techo; por encima del techo solo hasta el valor de una firma registrada) */
export function plantillaDelEncargo(e: EncargoDeConversa, turnos?: TurnoDeConversa[]): Plantilla {
  const sem = e.semilla as Semilla | undefined
  const t = sem?.tope_encargo_usd
  // la reserva del cierre de la ronda 2 sale de lo que COSTÓ el cierre de la ronda 1 de este encargo (si ya se hizo)
  const cierre1 = (turnos ?? []).filter((x) => x.paso === 'cierre' && x.estado === 'hecho' && x.costo_usd > 0).at(-1)?.costo_usd
  const base: Plantilla = cierre1 === undefined ? PLANTILLA_FINANCIERA : { ...PLANTILLA_FINANCIERA, pasos: PLANTILLA_FINANCIERA.pasos.map((p) => (p.clave === 'cierre_2' ? { ...p, tope_usd: reservaDelCierre2(cierre1) } : p)) }
  const prueba = topeDePruebaValido(sem?.tope_de_prueba) ? { ...sem.tope_de_prueba } : undefined
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= base.limites.tope_encargo_usd) return prueba ? { ...base, limites: { ...base.limites, prueba } } : base
  const techo = firmaDeTopeValida(sem?.firma_tope) ? Math.max(TOPE_MAXIMO_POR_ENCARGO_USD, sem.firma_tope.valor) : TOPE_MAXIMO_POR_ENCARGO_USD
  return { ...base, limites: { ...base.limites, tope_encargo_usd: Math.min(t, techo), ...(prueba ? { prueba } : {}) } }
}
/** las respuestas del dueño entregadas como dato en la semilla: solo las bien formadas (clave y literal de texto), hasta 20 */
export function respuestasDeLaSemilla(s: Semilla | undefined): Array<{ clave: string; valor: unknown; literal: string }> {
  const r = s?.respuestas_del_dueno
  if (!Array.isArray(r)) return []
  return r.filter((x) => x && typeof x.clave === 'string' && x.clave.trim() !== '' && typeof x.literal === 'string' && x.literal.trim() !== '' && x.valor !== undefined).slice(0, 20).map((x) => ({ clave: x.clave, valor: x.valor, literal: x.literal }))
}

/** vencimiento del candado de «paso en vuelo»: pasado esto un paso muerto no deja el encargo atascado */
export const TTL_DEL_CANDADO_S = 900
/** margen para reintentar el formato dentro de la misma llamada */
export const LIMITE_PARA_REINTENTAR_MS = 150_000

/** `leer` un encargo. Una configuración ILEGIBLE es 503 (reintentable), nunca «conversa_apagada» (intento 4: una lectura fallida bajo carga cortó el bucle como si estuviera apagado). */
export async function leerConversacion(P: PuertosDeConversa, encargo_id: string): Promise<Respuesta> {
  let cfg
  try { cfg = await P.config() } catch (e) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  if (!cfg || cfg.estado === 'apagada' || cfg.conversa === 'apagado') return { status: 409, cuerpo: { error: 'conversa_apagada' } }
  const e = await P.almacen.leerEncargo(encargo_id)
  return e ? { status: 200, cuerpo: { encargo_id: e.id, estado: e.estado, gasto_usd: e.gasto_usd, turnos: await P.almacen.turnos(e.id) } } : { status: 404, cuerpo: { error: 'encargo_inexistente' } }
}

export async function avanzar(P: PuertosDeConversa, encargo_id: string): Promise<Respuesta> {
  let cfg
  try { cfg = await P.config() } catch (e) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  if (cfg.estado === 'apagada' || cfg.conversa === 'apagado') return { status: 409, cuerpo: { error: 'conversa_apagada' } }
  const e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  if ((ESTADOS_TERMINALES as readonly string[]).includes(e.estado)) return { status: 200, cuerpo: { encargo_id: e.id, estado: e.estado, terminado: true, gasto_usd: e.gasto_usd } }
  // CANDADO (arreglo del intento 4): una sola llamada por encargo a la vez; el turno de un agente dura minutos y una repetida pagaba dos veces
  const candado = P.almacen.tomarPaso ? await P.almacen.tomarPaso(e.id, P.ahora(), TTL_DEL_CANDADO_S) : null
  if (candado && candado.ok && !candado.tomado) return { status: 409, cuerpo: { error: 'paso_en_vuelo', detalle: 'otra llamada está ejecutando un paso de este encargo: léelo con «leer» antes de repetir' } }
  // si el candado MISMO no se puede tomar (columna sin migrar, base con error), el paso sigue SIN candado: no peor que antes del arreglo; el tope cobrado y el margen de reintento siguen activos
  try { return await ejecutarUnPaso(P, e) } finally { if (candado && candado.ok && candado.tomado) await P.almacen.soltarPaso?.(e.id).catch(() => undefined) }
}

async function ejecutarUnPaso(P: PuertosDeConversa, e0: EncargoDeConversa): Promise<Respuesta> {
  let e = e0
  // TOPE SOBRE LO COBRADO (arreglo del intento 4): el gasto del motor solo suma turnos GUARDADOS; lo cobrado y perdido (502, corte) también cuenta
  const cobrado = P.almacen.cobrado ? await P.almacen.cobrado(e.id).catch(() => null) : null
  if (cobrado !== null && cobrado > e.estado_del_motor.gasto_usd) e = { ...e, gasto_usd: Math.max(e.gasto_usd, cobrado), estado_del_motor: { ...e.estado_del_motor, gasto_usd: cobrado } }
  const arts = await P.almacen.artefactos(e.id)
  const turnosPrevios = await P.almacen.turnos(e.id).catch(() => [] as TurnoDeConversa[])
  const plantilla = plantillaDelEncargo(e, turnosPrevios)
  const sig = siguientePaso(e.estado_del_motor, plantilla)

  // fin o tope: se cierra con lo que hay (nunca bloquea al plan)
  if (sig.accion === 'fin' || sig.accion === 'cierre_por_tope') {
    const estado = sig.accion === 'cierre_por_tope' ? 'cierre_por_tope' : (arts.cierre?.sin_acuerdo ? 'sin_acuerdo' : 'cerrado')
    await P.almacen.guardar({ encargo_id: e.id, estado_del_motor: e.estado_del_motor, gasto_usd: e.gasto_usd, estado })
    return { status: 200, cuerpo: { encargo_id: e.id, estado, terminado: true, gasto_usd: e.gasto_usd, ...(sig.accion === 'cierre_por_tope' ? { razon: sig.razon, detalle: sig.detalle } : {}) } }
  }

  const paso = sig.paso
  const n = e.estado_del_motor.pasos_ejecutados + 1
  let resultado: ResultadoDePaso
  let degradado: string | null = null
  let error: string | null = null
  let slackNuevo: Partial<Pick<EncargoDeConversa, 'slack_canal' | 'slack_ts'>> = {}
  let leido_hasta = e.leido_hasta
  let tablero_id = e.tablero_id
  let estadoFinal: 'cerrado' | 'sin_acuerdo' | undefined

  if (paso.tipo === 'codigo') {
    switch (paso.funcion) {
      case 'abrir_financiera': resultado = abrirFinanciera(e); break
      case 'calcular_bloque': resultado = calcularBloque(e, arts, 1); break
      case 'calcular_bloque_2': resultado = calcularBloque(e, arts, 2); break
      case 'cierre_financiero': {
        const c = await cerrar(P, e, arts)
        resultado = { costo_usd: 0, artefacto: c.artefacto }
        tablero_id = c.tablero_id ?? tablero_id
        estadoFinal = c.sin_acuerdo ? 'sin_acuerdo' : 'cerrado'
        break
      }
      default: return { status: 500, cuerpo: { error: 'funcion_no_registrada', funcion: paso.funcion } }
    }
  } else {
    // 1 · lo que Emilio escribió en el hilo (notas y respuestas) entra al contexto, marcado como suyo
    const abiertas: string[] = ((arts.acuerdo?.preguntas_a_emilio as Array<{ clave: string }> | undefined) ?? []).map((p) => p.clave)
    const hilo = await recogerDelHilo(P, e, abiertas)
    leido_hasta = hilo.leido_hasta
    // 2 · el contexto del agente: solo los artefactos que su paso declara
    const contexto: Record<string, unknown> = {}
    for (const nombre of paso.entrada) if (arts[nombre]) contexto[nombre] = arts[nombre]
    const dadas = respuestasDeLaSemilla(e.semilla)
    if (hilo.notas.length || hilo.respuestas.length || dadas.length) contexto.del_dueno_en_el_hilo = { notas: hilo.notas.map((x) => ({ ...x, marca: 'nota del dueño: no es un dato confirmado' })), respuestas: [...dadas.map((x) => ({ ...x, marca: 'respuesta del dueño: dato confirmado por él' })), ...hilo.respuestas.map((x) => ({ ...x, marca: 'respuesta numerada del dueño, con su fecha' }))] }
    // plan v3 · V7: el ajuste ve la meta de equilibrio (la calcula el código con lo que ya dijeron los especialistas) y, si la meta no la cubre, DEBE responderla
    const esAjuste = paso.clave.replace(/_2$/, '') === 'ajuste'
    const equilibrio = esAjuste ? equilibrioParaElAjuste(arts, paso.clave === 'ajuste_2' ? 2 : 1) : null
    if (equilibrio) contexto.equilibrio = equilibrio
    const exigeEquilibrio = equilibrio?.cubre === false
    const tarea = pedidoDelAgente(paso, contexto)
    let costo = 0
    const intentos = 1 + (paso.salida?.reintento_formato ?? 0)
    let valor: Record<string, unknown> | null = null
    let ultimoError = ''
    // plan v3 · V7 (observación de CC#3): el último planteo VÁLIDO al que solo le faltó responder el equilibrio
    let sinRespuestaAlEquilibrio: Record<string, unknown> | null = null
    const inicioDelPaso = P.ahora().getTime()
    for (let i = 0; i < intentos && !valor; i++) {
      // NO se reintenta el formato si la llamada ya consumió el margen: pasar de ~300 s pierde el turno entero y se cobra dos veces (intento 4)
      if (i > 0 && P.ahora().getTime() - inicioDelPaso > LIMITE_PARA_REINTENTAR_MS) { ultimoError = `tiempo_agotado_para_reintentar: la primera respuesta tardó más de ${Math.round(LIMITE_PARA_REINTENTAR_MS / 1000)} s; ${ultimoError}`; break }
      const r = await P.modelo.invocar({ agente: paso.quien, tarea: i === 0 ? tarea : `${tarea}\n\nTu respuesta anterior no cumplió el formato (${ultimoError}). Devuelve SOLO el objeto JSON.`, encargo_id: e.id, client_id: e.client_id, paso: paso.clave, tope_usd: paso.tope_usd, dry_run: e.dry_run })
      costo += r.costo_usd
      if (!r.ok) { ultimoError = r.error; error = r.error; break }
      const j = extraerJson(r.salida)
      if (!j.ok) { ultimoError = j.error; continue }
      const v = validar(paso, j.valor)
      if (v.ok && exigeEquilibrio && !respuestaDeEquilibrioValida(v.valor)) { ultimoError = 'la meta no cubre el equilibrio: falta equilibrio_respuesta { decision, motivo }'; sinRespuestaAlEquilibrio = v.valor }
      else if (v.ok) valor = v.valor
      else ultimoError = v.errores.join('; ')
    }
    // agotado el reintento SIN responder el equilibrio: se CONSERVA el planteo (válido) y se marca; descartarlo tiraría el trabajo del paso (la meta, los canales, el reparto)
    if (!valor && sinRespuestaAlEquilibrio) { valor = { ...sinRespuestaAlEquilibrio, equilibrio_sin_respuesta: true }; error = null }
    if (valor) resultado = { costo_usd: costo, artefacto: derivar(paso, valor) }
    else {
      degradado = ultimoError || 'sin respuesta'
      resultado = { costo_usd: costo, artefacto: { sin_supuestos_del_agente: true, motivo: degradado, agente: paso.quien, ...(paso.clave === 'planteo' ? { habla: { fpa: true, redes: false, busqueda: false, medicion: false, sin_pauta: true } } : {}), ...(paso.clave === 'cierre' || paso.clave === 'cierre_2' ? { salida: 'sale_con_alerta', hallazgos: [], conflictos_resueltos: [], preguntas_a_emilio: [], requiere_ronda_2: false, alude: {} } : {}) } }
    }
  }

  // persistir el paso y el estado del motor (un turno = una fila; nada se pierde aunque la llamada siguiente falle)
  const nuevoEstado: Estado = registrarPaso(e.estado_del_motor, plantilla, sig.indice, resultado)
  const art = resultado.artefacto ?? {}
  const salidaParaHilo = degradado ? null : art
  const texto = textoDelTurno(paso, n, salidaParaHilo as Record<string, unknown> | null, degradado)
  slackNuevo = await publicar(P, e, texto)
  await P.almacen.guardar({
    encargo_id: e.id, estado_del_motor: nuevoEstado, gasto_usd: nuevoEstado.gasto_usd,
    estado: estadoFinal ?? 'en_curso', ...slackNuevo, leido_hasta, tablero_id,
    turno: { n, paso: paso.clave, agente: paso.tipo === 'agente' ? paso.quien : null, ronda: paso.ronda ?? 1, estado: degradado ? 'fallo' : 'hecho', costo_usd: resultado.costo_usd, salida: art, error: error ?? (degradado ? degradado : null) },
    artefacto: { tipo: paso.salida_artefacto, version: (nuevoEstado.artefactos[paso.salida_artefacto]?.version ?? 1), contenido: art, sha256: sha256(art) },
  })
  return { status: 200, cuerpo: { encargo_id: e.id, paso: paso.clave, turno: n, ronda: paso.ronda ?? 1, costo_usd: resultado.costo_usd, gasto_usd: nuevoEstado.gasto_usd, estado: estadoFinal ?? 'en_curso', degradado: degradado !== null, terminado: estadoFinal !== undefined } }
}

function validar(paso: Paso, v: unknown): { ok: true; valor: Record<string, unknown> } | { ok: false; errores: string[] } {
  const esquema = paso.salida?.esquema
  const r = esquema === 'planteo.v1' ? validarPlanteo(v) : esquema === 'acuerdo.v1' ? validarAcuerdo(v) : validarConsulta(v)
  return r.ok ? { ok: true, valor: r.valor as unknown as Record<string, unknown> } : { ok: false, errores: r.errores }
}

/** campos que el CÓDIGO añade al artefacto (nunca los pone el agente): quién habla, a quién se alude, si hay ronda 2 */
export function derivar(paso: Paso, v: Record<string, unknown>): Record<string, unknown> {
  if (paso.clave === 'planteo') {
    const p = v as unknown as PlanteoV1
    return { ...v, habla: especialistasQueHablan(p.canales ?? []) }
  }
  if (paso.clave === 'cierre' || paso.clave === 'cierre_2') {
    const a = v as unknown as AcuerdoV1
    // un crítico que el jefe marcó `resuelto` no pide ronda 2, no alude a nadie y no bloquea la firma
    const todosCriticos = a.hallazgos.filter((h) => h.severidad === 'critico')
    const criticos = todosCriticos.filter(estaAbierto)
    const alude = { fpa: false, redes: false, busqueda: false, medicion: false } as Record<string, boolean>
    for (const h of criticos) if (h.alude && h.alude !== 'plan') alude[h.alude] = true
    return { ...v, criticos: criticos.length, criticos_resueltos: todosCriticos.length - criticos.length, alude, requiere_ronda_2: paso.clave === 'cierre' && criticos.length > 0 }
  }
  return v
}

// ───────────────────────────────────────────────────────── cierre: tablero + firma (un acto de CÓDIGO)
export async function cerrar(P: PuertosDeConversa, e: EncargoDeConversa, a: Arts): Promise<{ artefacto: Record<string, unknown>; tablero_id: string | null; sin_acuerdo: boolean }> {
  const b2 = a.bloque_2 as Record<string, any> | undefined
  const b1 = a.bloque as Record<string, any> | undefined
  const bloqueArt = b2?.hay_bloque ? b2 : b1
  const acuerdo = (a.acuerdo_2 ?? a.acuerdo) as (Record<string, any> & Partial<AcuerdoV1>) | undefined
  const huboRonda2 = !!(a.acuerdo?.requiere_ronda_2)
  if (!bloqueArt?.hay_bloque) {
    return { artefacto: { estado: 'sin_bloque', motivo: bloqueArt?.motivo ?? 'sin_bloque', finanzas_id: null, sin_acuerdo: true, salida: null, huella: null, errores: bloqueArt?.errores ?? [] }, tablero_id: null, sin_acuerdo: true }
  }
  const bloque = bloqueArt.bloque as Bloque
  const hallazgos = (acuerdo?.hallazgos ?? []) as AcuerdoV1['hallazgos']
  // sin salida del jefe (falló su turno): «sale con alerta», nunca «sale»
  let salida: AcuerdoV1['salida'] = (acuerdo?.salida as AcuerdoV1['salida']) ?? 'sale_con_alerta'
  // tope (R14): con una cifra que manda «sin base» solo se admite «sale con alerta»
  const topada = bloque.confianza?.manda_sin_base === true && salida !== 'sale_con_alerta'
  if (topada) salida = 'sale_con_alerta'
  // lo que el plan «dio por verificado» no lo comprueba el código: la salida solo puede ser «con alerta» y la confianza no sube (el hilo enseñó que es el defecto de fondo)
  const planteoVigente = (a.planteo_fijado_2 ?? a.planteo_fijado ?? a.planteo) as { dado_por_verificado?: unknown } | undefined
  const dadoPorVerificado = Array.isArray(planteoVigente?.dado_por_verificado) ? (planteoVigente!.dado_por_verificado as unknown[]).filter((x) => typeof x === 'string' && x.trim()).map(String) : []
  // lo que el dueño confirmó (con respuesta real suya que lo respalde) SÍ está comprobado; solo el resto queda «sin comprobar»
  // y lo MEDIDO que viene del cerebro (expediente.datos) o de la ficha (moneda, país) también: el código lo tiene con su procedencia. Lo derivado y las decisiones del plan siguen sin comprobar.
  const datosDelExpediente = Array.isArray((a.expediente as { datos?: unknown } | undefined)?.datos) ? ((a.expediente as { datos: unknown[] }).datos as never[]) : []
  const baseDelCodigo = lineaBaseSemanal({ datos: datosDelExpediente, dada: e.semilla?.linea_base_por_semana })
  const { confirmado_por_el_dueno: confirmadoPorElDueno, medido_del_cerebro: medidoDelCerebro, sin_comprobar: sinComprobar } = separarComprobado(dadoPorVerificado, respuestasDeLaSemilla(e.semilla), datosDelExpediente, { moneda: e.semilla?.moneda, pais: e.semilla?.pais }, baseDelCodigo?.por_semana ?? null)
  const verificadoSinComprobar = sinComprobar.length > 0
  if (verificadoSinComprobar && salida !== 'sale_con_alerta') salida = 'sale_con_alerta'
  const decision = decidirFirma({ hallazgos: hallazgos.map((h) => ({ severidad: h.severidad, que: h.que, estado: h.estado })), correcciones_hechas: huboRonda2 ? 1 : 0 })
  const sinEstado = resueltosSinEstado(hallazgos)
  let sinAcuerdo = !acuerdo || acuerdo.sin_supuestos_del_agente === true || decision.estado !== 'firmado'
  let estado: 'firmado' | 'sin_firma' = decision.estado === 'firmado' && !sinAcuerdo ? 'firmado' : 'sin_firma'
  let finanzas_id: string | null = null
  // la invocación que firma es la de este encargo y este paso (el adaptador del modelo la nombra `${encargo}:${paso}`); debe EXISTIR en el libro
  const invocacion_id = `${e.id}:${a.acuerdo_2 ? 'cierre_2' : 'cierre'}`
  let invocacion_verificada: boolean | null = null
  if (!e.dry_run) {
    if (estado === 'firmado') {
      invocacion_verificada = await P.tableros.invocacionDelJefe({ invocacion_id, client_id: e.client_id }).catch(() => false)
      // sin una invocación real del jefe en el libro no se firma: queda «sin firma» y el plan sigue
      if (!invocacion_verificada) { estado = 'sin_firma'; sinAcuerdo = true }
    }
    const g = await P.tableros.guardarTablero({ client_id: e.client_id, entrada: bloqueArt.entrada, bloque, huella: bloqueArt.huella, numeros: numerosDelBloque(bloque), workflow_execution_id: `conversa:${e.id}` })
    finanzas_id = g.id
    await P.tableros.actualizarTablero(g.id, { estado, firmado_por: `chief-financial-officer:${invocacion_id}:${salida}`, firmado_en: P.ahora().toISOString() })
  }
  return {
    artefacto: { estado, finanzas_id, salida, tope_aplicado: topada || verificadoSinComprobar, dado_por_verificado: dadoPorVerificado, confirmado_por_el_dueno: confirmadoPorElDueno, medido_del_cerebro: medidoDelCerebro, dado_por_verificado_sin_comprobar: sinComprobar, criticos_abiertos: decision.criticos, criticos_resueltos: decision.criticos_resueltos, alerta_hallazgos_sin_estado: sinEstado.length ? `${sinEstado.length} hallazgo(s) dicen «resuelto» en el texto pero no traen estado: se cuentan como abiertos (${sinEstado.slice(0, 3).join(' | ')})` : null, alerta_verificado: verificadoSinComprobar ? `el plan dio por verificado: ${sinComprobar.slice(0, 5).join('; ')} (el código no lo comprueba: confianza no sube, sale con alerta)` : null, confianza: bloque.confianza?.nivel ?? null, huella: bloqueArt.huella, sin_acuerdo: sinAcuerdo, criticos: decision.criticos, ronda_2: huboRonda2, invocacion_verificada, preguntas_candidatas: acuerdo?.preguntas_a_emilio ?? [], dato_que_no_bloquea: acuerdo?.dato_que_no_bloquea ?? null, escribio: !e.dry_run },
    tablero_id: finanzas_id, sin_acuerdo: sinAcuerdo,
  }
}

export { AGENTES, estadoInicial }
export const planteoActual = planteoVigente
