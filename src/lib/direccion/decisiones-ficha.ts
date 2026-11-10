/**
 * 09-nov · T0 de la ficha única de decisión (`raw/tasks/2026-11-09-GO-LENOVO-a-CC1-CC4-CC6-construir-ficha-de-decision.md`,
 * diseño `raw/evidencia/2026-11-09-ficha-de-decision/DISENO.md`, partes 2 y 4). Solo lectura, US$ 0.
 *
 * Cada decisión de `GET /api/direccion/decisiones` trae además `ficha`, armada desde sus campos de hoy (que siguen: ningún lector se rompe).
 * El traductor REFLEJA lo que hoy se ofrece; no agrega verbos nuevos. Lo que hoy se decide en otro panel queda sin acciones y con `donde_se_hace`.
 * Una ficha que no pasa `problemasDeLaFicha` no viaja: viene `ficha: null` con sus problemas. Se rechaza entera, nunca se recorta.
 */
import type { Decision } from './decisiones'
import { DEPARTAMENTOS, DEPARTAMENTO_DE_LA_OFICINA, type ClaveDeDepartamento } from '../nombres-del-sistema'

/** el vocabulario fijo: 5 verbos, siempre los mismos */
export const VERBOS = ['aprobar', 'pedir_cambios', 'responder', 'asumir', 'descartar'] as const
export type Verbo = (typeof VERBOS)[number]
/** las pantallas dueñas de lo que no cabe en la ficha (ADENDA 2 de Emilio). El texto del enlace lo pone el tablero, no la oficina */
export const PANTALLAS = ['plan', 'piezas', 'gran_idea', 'manual'] as const
export type Pantalla = (typeof PANTALLAS)[number]
/**
 * los NOMBRES de las puertas (nunca una dirección). La lista que manda vive en el servidor del tablero, con su validación y con si gasta (regla 4):
 * esta copia solo sirve para que la plataforma no mande un nombre que no existe.
 * `dueno-preguntas` es la ruta de la oficina de preguntas (`/api/dueno/preguntas`): en el tablero hoy la llama `decisiones-contestar`; en T1 entra a su lista.
 */
export const DESTINOS = ['firmar-tablero', 'recalcular-tablero', 'plan-aprobar', 'plan-cambios', 'revision-resolver', 'dueno-preguntas'] as const
export type Destino = (typeof DESTINOS)[number]
export const MAX_ACCIONES = 3

export interface Accion {
  verbo: Verbo
  /** una sola por ficha: el botón ámbar */
  principal?: true
  pide?: { que: 'texto' | 'motivo'; obligatorio: boolean }
  /** la oficina solo puede agregar una nota; si gasta y su tope son de la puerta */
  nota_de_gasto?: string
  destino: Destino
}
export interface CortoYLargo { corto?: string; largo: string }
export interface CifraDeLaFicha { clave: string; nombre: string; valor: number; unidad: string | null; nota?: string; editable?: true }
export interface FichaDeDecision {
  version: 1
  id: string
  cuenta: { client_id: string; nombre: string | null } | null
  /** nombre oficial completo; `corto` cuando el completo no cabe (de `nombres-del-sistema`) */
  departamento: { oficina: string; nombre: string; corto?: string; agente?: string }
  que_se_decide: string
  decisivo?: CortoYLargo[]
  uso?: CortoYLargo
  desbloquea?: CortoYLargo
  /** 09-nov · v7 (CC4): qué trabajo está parado por esto, para el rótulo «DETIENE EL PLAN». Sin el campo: no detiene nada o no se sabe */
  detiene?: { que: string }
  propuesta?: { cifras?: CifraDeLaFicha[]; supuesto?: string; al_cambiar?: string; al_editar?: { destino: Destino; vista_previa?: Destino } }
  /** sin `vence` ni `sin_limite` = no se sabe (guion rojo). «Sin fecha límite» solo con `sin_limite: true`, que la oficina declara (cuidado 1 de CC6) */
  /** `version_del_documento` (10-nov): la versión de lo que se decide, para mostrar a la derecha de la fecha; nunca en el título */
  espera: { desde: string | null; vence?: string; sin_limite?: true; al_vencer?: string; version_del_documento?: number }
  /** SOLO INFORMATIVO: nunca decide si se pide confirmación ni el tope (son de la puerta). Un costo en 0 no autoriza nada */
  costo?: { usd?: number; nota: string }
  origen: { fuente: string; ref: string }
  acciones: Accion[]
  donde_se_hace?: { pantalla: Pantalla }
}

/**
 * 10-nov · el departamento con su nombre OFICIAL (Emilio 09-nov 23:29Z), leído de la constante única `nombres-del-sistema`: nunca escrito aquí.
 * Lo de la bandeja, el plan y la campaña es del Departamento de Marketing; la firma y las preguntas de finanzas, del de Finanzas.
 * Una oficina que todavía no tiene departamento oficial (jefatura, cerebro, altas) muestra su propio nombre hasta que Emilio lo nombre.
 */
const POR_FUENTE: Record<string, ClaveDeDepartamento> = {
  hitl_queue: 'marketing', plan_aprobaciones: 'marketing', cadena_campanas: 'marketing',
  // lo de finanzas (firma, pausa, «no volvió», canal viejo) ya lo resuelve el tipo, arriba: aquí no hace falta (CC7, sabotaje 4)
}
const SIN_DEPARTAMENTO_OFICIAL: Record<string, string> = { jefatura: 'Jefatura', cerebro: 'El cerebro del cliente', portero: 'El cerebro del cliente', alta: 'Altas', onboarding: 'Altas' }
const clave = (o: string) => o.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/^oficina[\s_-]+(de[\s_-]+)?/, '').trim()
const mayuscula = (t: string) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1)
const oficial = (k: ClaveDeDepartamento) => ({ oficina: DEPARTAMENTOS[k].oficina, nombre: DEPARTAMENTOS[k].nombre, corto: DEPARTAMENTOS[k].corto })
export function departamentoDeLaFicha(d: Pick<Decision, 'tipo' | 'fuente' | 'pregunta_de'>): FichaDeDecision['departamento'] {
  const agente = d.pregunta_de?.agente ? { agente: d.pregunta_de.agente } : {}
  if (d.tipo === 'firma_de_finanzas' || d.tipo === 'pregunta_de_finanzas') return { ...oficial('finanzas'), ...agente }
  if (d.pregunta_de) {
    const k = clave(d.pregunta_de.oficina), primera = k.split(/[\s_-]+/)[0] ?? ''
    const dep = DEPARTAMENTO_DE_LA_OFICINA[k] ?? DEPARTAMENTO_DE_LA_OFICINA[primera]
    if (dep) return { ...oficial(dep), ...agente }
    return { oficina: k || d.pregunta_de.oficina, nombre: SIN_DEPARTAMENTO_OFICIAL[k] ?? SIN_DEPARTAMENTO_OFICIAL[primera] ?? mayuscula(d.pregunta_de.oficina.replace(/[-_]+/g, ' ')), ...agente }
  }
  const dep = POR_FUENTE[d.fuente]
  // una pregunta sin oficina conocida: no se le inventa departamento
  return dep ? oficial(dep) : { oficina: 'sin_oficina', nombre: 'Sin departamento' }
}

/** la pantalla dueña de lo que hoy se decide en otro panel (la ruta de hoy, traducida a la lista cerrada) */
function pantallaDe(d: Pick<Decision, 'tipo' | 'decidir'>): Pantalla | null {
  if (d.tipo === 'gran_idea') return 'gran_idea'
  if (d.tipo === 'pieza') return 'piezas'
  if (d.tipo === 'plan') return 'plan'
  if (d.decidir.ruta === '/piezas') return 'piezas'
  // 10-nov · tramo de la ficha: toda revisión que no es pieza (lista de competidores, revisión del editor, plan con pendientes, otras) se decide en «Otras revisiones» de Piezas
  if (d.tipo === 'revision') return 'piezas'
  return null
}

/**
 * todo lo que hoy marca `detiene: true` detiene el plan (la compuerta, la pausa, sus preguntas, «no volvió» y la campaña: v7 «DETIENE EL PLAN»).
 * Cuando una oficina detenga otra cosa, escribe su propio «qué» (T3)
 */
export const QUE_SE_DETIENE = 'el plan'
/**
 * las fuentes que declaran que no vencen: el tablero financiero no tiene plazo, se reemplaza solo con una versión nueva (v7: «Sin fecha límite»).
 * Las demás sin `vence` quedan como «no se sabe»: la compuerta del plan la cierra un reloj y la bandeja trae su propio vencimiento
 */
const NO_VENCEN = new Set(['finanzas_tableros'])

const largo = (l?: string | null, c?: string | null): CortoYLargo | undefined => (l ? { largo: l, ...(c ? { corto: c } : {}) } : undefined)

/** las acciones de hoy, traducidas al vocabulario fijo. Solo lo que la plataforma ya declara en `permite`; nada nuevo */
function accionesDe(d: Decision): Accion[] {
  const p = d.permite
  if (!p) return []
  if (d.tipo === 'firma_de_finanzas') return p.includes('aceptar') ? [{ verbo: 'aprobar', principal: true, destino: 'firmar-tablero' }] : []
  if (d.tipo === 'pregunta_al_dueno') {
    const a: Accion[] = []
    if (p.includes('descartar')) a.push({ verbo: 'descartar', pide: { que: 'motivo', obligatorio: false }, destino: 'dueno-preguntas' })
    if (p.includes('asumir') && d.supuesto) a.push({ verbo: 'asumir', destino: 'dueno-preguntas' })
    if (p.includes('responder')) a.push({ verbo: 'responder', principal: true, pide: { que: 'texto', obligatorio: true }, destino: 'dueno-preguntas' })
    return a
  }
  return []
}

/** arma la ficha de una decisión de hoy. Pura: no lee nada */
export function fichaDe(d: Decision): FichaDeDecision {
  // una cifra se toca solo si la oficina lo permite Y la cifra lo dice: sin las dos, la cifra se muestra sin poder cambiarse
  const puedeEditar = !!d.permite?.includes('editar')
  const cifras = d.cifras?.map((c): CifraDeLaFicha => ({ clave: c.clave, nombre: c.nombre, valor: c.valor, unidad: c.unidad, ...(c.nota ? { nota: c.nota } : {}), ...(c.editable && puedeEditar ? { editable: true as const } : {}) }))
  const editable = !!cifras?.some((c) => c.editable)
  const propuesta: NonNullable<FichaDeDecision['propuesta']> = {
    ...(cifras?.length ? { cifras } : {}),
    ...(d.supuesto ? { supuesto: d.supuesto } : {}),
    ...(editable && d.al_editar ? { al_cambiar: d.al_editar } : {}),
    ...(editable ? { al_editar: { destino: 'firmar-tablero' as const, vista_previa: 'recalcular-tablero' as const } } : {}),
  }
  const al_vencer = d.campana?.espera?.al_vencer_texto ?? null
  const pantalla = pantallaDe(d)
  const acciones = accionesDe(d)
  return {
    version: 1,
    id: d.id,
    cuenta: d.client_id ? { client_id: d.client_id, nombre: d.cliente } : null,
    departamento: departamentoDeLaFicha(d),
    que_se_decide: d.titulo,
    ...(d.criticos?.length ? { decisivo: d.criticos.map((c) => ({ largo: c })) } : {}),
    ...(largo(d.para_que, d.para_que_corto) ? { uso: largo(d.para_que, d.para_que_corto) } : {}),
    ...(largo(d.destraba, d.destraba_corto) ? { desbloquea: largo(d.destraba, d.destraba_corto) } : {}),
    ...(d.detiene === true ? { detiene: { que: QUE_SE_DETIENE } } : {}),
    ...(Object.keys(propuesta).length ? { propuesta } : {}),
    espera: { desde: d.desde, ...(d.vence ? { vence: d.vence } : !d.vence && NO_VENCEN.has(d.fuente) ? { sin_limite: true as const } : {}), ...(al_vencer ? { al_vencer } : {}), ...(d.version_del_documento ? { version_del_documento: d.version_del_documento } : {}) },
    ...(d.costo_nota || d.costo_usd !== null ? { costo: { ...(d.costo_usd !== null ? { usd: d.costo_usd } : {}), nota: d.costo_nota ?? '' } } : {}),
    origen: { fuente: d.fuente, ref: d.id },
    acciones,
    // lo que no cabe aquí lleva a su pantalla, tenga o no verbos en la ficha (ADENDA 2: el plan con Aprobar y «Se edita en: Plan →»)
    ...(pantalla ? { donde_se_hace: { pantalla } } : {}),
  }
}

const esTexto = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
/** las reglas del contrato. [] = la ficha vale. Cualquier problema la rechaza entera */
export function problemasDeLaFicha(f: FichaDeDecision): string[] {
  const p: string[] = []
  if (f.version !== 1) p.push('versión desconocida')
  if (!esTexto(f.id)) p.push('sin id')
  if (!esTexto(f.que_se_decide)) p.push('sin «qué se decide»')
  if (!esTexto(f.departamento?.nombre)) p.push('sin departamento')
  if (!esTexto(f.origen?.fuente) || !esTexto(f.origen?.ref)) p.push('sin origen')
  if (!Array.isArray(f.acciones)) p.push('sin lista de acciones')
  const acciones = Array.isArray(f.acciones) ? f.acciones : []
  if (acciones.length > MAX_ACCIONES) p.push(`${acciones.length} acciones: el tope es ${MAX_ACCIONES}`)
  if (acciones.filter((a) => a.principal).length > 1) p.push('más de una acción principal')
  const verbos = acciones.map((a) => a.verbo)
  if (new Set(verbos).size !== verbos.length) p.push('un verbo repetido')
  for (const a of acciones) {
    if (!(VERBOS as readonly string[]).includes(a.verbo)) p.push(`verbo fuera del vocabulario: ${String(a.verbo)}`)
    if (!(DESTINOS as readonly string[]).includes(a.destino)) p.push(`puerta desconocida: ${String(a.destino)}`)
    if (a.verbo === 'asumir' && !esTexto(f.propuesta?.supuesto)) p.push('«asumir» sin supuesto')
  }
  const cifras = f.propuesta?.cifras ?? []
  if (cifras.some((c) => c.editable) && !f.propuesta?.al_editar) p.push('una cifra editable sin a dónde va el cambio')
  for (const d of [f.propuesta?.al_editar?.destino, f.propuesta?.al_editar?.vista_previa]) if (d !== undefined && !(DESTINOS as readonly string[]).includes(d)) p.push(`puerta desconocida: ${String(d)}`)
  for (const [k, v] of [['uso', f.uso], ['desbloquea', f.desbloquea]] as const) if (v && (!esTexto(v.largo) || (v.corto !== undefined && !esTexto(v.corto)))) p.push(`«${k}» sin texto`)
  if (f.espera?.sin_limite && f.espera.vence) p.push('vence y a la vez «sin fecha límite»')
  if (f.espera?.version_del_documento !== undefined && !(Number.isInteger(f.espera.version_del_documento) && f.espera.version_del_documento > 0)) p.push('versión del documento que no es un número entero positivo')
  if (f.detiene !== undefined && !esTexto(f.detiene?.que)) p.push('«detiene» sin decir qué')
  if (f.donde_se_hace && !(PANTALLAS as readonly string[]).includes(f.donde_se_hace.pantalla)) p.push(`pantalla desconocida: ${String(f.donde_se_hace.pantalla)}`)
  return p
}

/** lo que viaja con cada decisión: la ficha si vale; si no, null y por qué (el tablero muestra «Esta decisión llegó mal armada») */
export function conFicha<T extends Decision>(d: T): T & { ficha: FichaDeDecision | null; ficha_problemas?: string[] } {
  const f = fichaDe(d)
  const problemas = problemasDeLaFicha(f)
  return problemas.length ? { ...d, ficha: null, ficha_problemas: problemas } : { ...d, ficha: f }
}
