/**
 * LA JEFATURA COMO OFICINA PROPIA · el CONTRATO de entrada y de salida de UNA revisión (diseño v4 §2). Puro: sin red ni base.
 * El sobre de julio (`contract.ts`: PASS | REJECT | ESCALATE, scores) NO sirve para esto y queda intacto para el cimiento; este vive aparte.
 * Reglas de la puerta: `client_id` y `journey_id` los pone el flujo llamador EN LA RAÍZ (uno dentro de `payload` no se lee); `dry_run` es OBLIGATORIO y booleano (ausente = 400);
 * `simulacion` solo existe con `dry_run = true`.
 */
import type { ContextoDelRevisor, HuecosDeLaPregunta } from '../../revision-comun'

/** a dónde puede entregar un webhook de la jefatura: SOLO nuestro n8n o nuestro Vercel (la misma lista que aplican los flujos de J4 al entregar) */
export const VERCEL_DE_LA_PLATAFORMA = 'https://zero-risk-platform.vercel.app/'
export const N8N_POR_OMISION = 'https://n8n-production-72be.up.railway.app/webhook'
export function destinoDeWebhookPermitido(url: string, env: Record<string, string | undefined> = process.env): boolean {
  const base = ((env.N8N_WEBHOOK_BASE ?? '').trim() || N8N_POR_OMISION).replace(/\/+$/, '') + '/'
  return typeof url === 'string' && (url.startsWith(base) || url.startsWith(VERCEL_DE_LA_PLATAFORMA))
}

export const TIPOS_DE_REVISION = ['plan', 'estrategia', 'calendario', 'brief', 'pieza', 'manual'] as const
export type TipoDeRevision = (typeof TIPOS_DE_REVISION)[number]

export const RESULTADOS = ['limpia', 'con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope', 'fallida'] as const
export type Resultado = (typeof RESULTADOS)[number]

export interface Productor { donde: string; agente: string }
export interface ChequeosPrevios { pasaron: boolean; necesita_humano: boolean; marcas: string[] }
/** `webhook` (destino = la dirección), `sala_ref` (destino = el `_sala_correlation_id` de la sala) o `ninguno` (la ruta ya guardó todo; p. ej. las pruebas) */
export interface DevolverA { tipo: 'webhook' | 'sala_ref' | 'ninguno'; destino: string }

/** ramas que se fuerzan en el seco (§13.3); solo con `dry_run = true` */
export interface Simulacion {
  fichas?: 'ninguna' | 'sugerencia' | 'bloquea'
  toma?: 'todo' | 'nada' | 'algo'
  gpt?: 'ok' | 'vacio' | 'sin_hallazgos' | 'falla_red' | 'falla_401'
  /** `formato_roto` rompe SOLO el primer intento (el reintento sale bien); `formato_roto_siempre` rompe los dos */
  productor?: 'ok' | 'formato_roto' | 'formato_roto_siempre' | 'muerto'
  tope?: 'normal' | 'exceso'
  reentrega?: 'ninguna'
  version_nueva?: 'mejora' | 'empeora' | 'demasiado_corta'
  jefatura?: 'a_tiempo' | 'tardia'
  /** a qué `donde` apuntan las fichas simuladas del jefe */
  donde?: string
  /** largo del plan A simulado (lo usan los flujos para fabricar B y C) */
  largo_a?: number
}

export interface PayloadDeRevision {
  /** el artefacto tal cual salió del productor */
  texto: string
  imagenes?: string[]
  /** un dueño por parte; si falta se usan los de la política */
  productores?: Productor[]
  chequeos_previos?: ChequeosPrevios
  /** los documentos de la lista `contra_que` YA LEÍDOS por el llamador (manual, plan, brief…); el revisor ciego los recibe como contexto */
  contexto?: ContextoDelRevisor[]
  contexto_ref?: Record<string, unknown>
  devolver_a: DevolverA
  /** marcas de pasos anteriores de la cadena (regla 10); viajan como dato, NO entran en el prompt de nadie */
  marcas_heredadas?: string[]
  /** lo que le queda al encargo padre (pieza) */
  tope_restante_usd?: number
  dry_run: boolean
  simulacion?: Simulacion
  /** plan: el pedido que armó «Redactor (B4)» (datos reunidos, hechos del dueño, registro, referencia del producto), para pedir la versión nueva sin recolectar de nuevo */
  pedido_del_plan?: string
  /** pieza: la familia (post_img, carrusel, kit_historias) */
  familia?: string
  huecos?: HuecosDeLaPregunta
  /** si el artefacto ES producto de una revisión, el id de esa revisión: una versión producida por la jefatura NUNCA abre otra (guarda G3) */
  generado_por_jefatura?: string | null
  /** versión del artefacto que se revisa (por omisión 1) */
  version?: number
}

export interface EntradaDeRevision {
  artifact_type: TipoDeRevision
  artifact_id: string
  client_id: string
  journey_id: string | null
  payload: PayloadDeRevision
}

/** `ficha_sin_dueno` solo aparece (en true) cuando una ficha bloqueante del jefe no tiene a quién corregirla; ausente = no pasó (la forma de siempre no cambia) */
export interface Marcas { con_desacuerdo: boolean; sin_segunda_mirada: boolean; ficha_sin_dueno?: boolean }

export interface RespuestaDeFicha { ficha_id: string; origen: string; donde: string; estado: string; razon: string | null }

/** lo que sale al cerrar, hacia `devolver_a` */
export interface SalidaDeRevision {
  revision_id: string
  artifact_type: TipoDeRevision
  artifact_id: string
  resultado: Resultado
  marcas: Marcas
  artefacto_final: Record<string, unknown>
  /** plan: las versiones producidas (A, B, C) con su texto; la planeación elige la mejor aceptable con `elegir_version` */
  versiones: Array<{ etiqueta: 'A' | 'B' | 'C'; paso: string; texto: string; largo: number }>
  respuestas: RespuestaDeFicha[]
  opinion_externa: { texto: string; modelo: string | null } | null
  imagen_por_rehacer: boolean
  desacuerdos: string[]
  costo_usd: number
  pasos: number
  trace_id: string
  devolver_a: DevolverA | null
  simulado: boolean
}

export type ResultadoDeValidar =
  | { ok: true; entrada: EntradaDeRevision; ignorados: string[] }
  | { ok: false; codigo: 'entrada_invalida' | 'dry_run_obligatorio'; errores: string[] }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const lista = (v: unknown): v is unknown[] => Array.isArray(v)

export function validarEntrada(cuerpo: unknown): ResultadoDeValidar {
  if (!esObjeto(cuerpo)) return { ok: false, codigo: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }
  const errores: string[] = []
  const ignorados: string[] = []
  if (!(TIPOS_DE_REVISION as readonly string[]).includes(String(cuerpo.artifact_type))) errores.push(`\`artifact_type\` debe ser uno de ${TIPOS_DE_REVISION.join(', ')}`)
  if (!texto(cuerpo.artifact_id)) errores.push('`artifact_id` es obligatorio')
  if (!texto(cuerpo.client_id)) errores.push('`client_id` es obligatorio y lo pone el flujo llamador en la raíz')
  if (cuerpo.journey_id !== undefined && cuerpo.journey_id !== null && !texto(cuerpo.journey_id)) errores.push('`journey_id` debe ser texto o ir vacío')
  const p = cuerpo.payload
  if (!esObjeto(p)) return { ok: false, codigo: 'entrada_invalida', errores: [...errores, '`payload` debe ser un objeto'] }
  // 🔴 `dry_run` OBLIGATORIO y booleano: «ausente = 400» (un valor que parece seco y no lo es pagaría creyendo que no)
  if (typeof p.dry_run !== 'boolean') return { ok: false, codigo: 'dry_run_obligatorio', errores: ['`payload.dry_run` es obligatorio y debe ser verdadero o falso (booleano); ausente = 400', ...errores] }
  if (typeof p.texto !== 'string' || p.texto.trim() === '') errores.push('`payload.texto` es obligatorio (el artefacto tal cual salió del productor)')
  if (!esObjeto(p.devolver_a) || !(p.devolver_a.tipo === 'webhook' || p.devolver_a.tipo === 'sala_ref' || p.devolver_a.tipo === 'ninguno') || (p.devolver_a.tipo !== 'ninguno' && !texto(p.devolver_a.destino))) errores.push('`payload.devolver_a` debe ser { tipo: webhook | sala_ref | ninguno, destino }')
  else if (p.devolver_a.tipo === 'webhook' && !destinoDeWebhookPermitido(String(p.devolver_a.destino))) errores.push('`payload.devolver_a.destino` no es de nuestro n8n ni de nuestro Vercel: no se entrega a un tercero')
  if (p.productores !== undefined) {
    if (!lista(p.productores) || p.productores.length === 0 || !p.productores.every((x) => esObjeto(x) && texto(x.donde) && texto(x.agente))) errores.push('`payload.productores` debe ser una lista de { donde, agente }')
  }
  if (p.chequeos_previos !== undefined) {
    const c = p.chequeos_previos
    if (!esObjeto(c) || typeof c.pasaron !== 'boolean' || typeof c.necesita_humano !== 'boolean' || !lista(c.marcas) || !c.marcas.every((m) => typeof m === 'string')) errores.push('`payload.chequeos_previos` debe ser { pasaron, necesita_humano, marcas[] }')
  }
  if (p.contexto !== undefined && !(lista(p.contexto) && p.contexto.every((x) => esObjeto(x) && texto(x.titulo) && typeof x.texto === 'string'))) errores.push('`payload.contexto` debe ser una lista de { titulo, texto, funcion? }')
  if (p.marcas_heredadas !== undefined && !(lista(p.marcas_heredadas) && p.marcas_heredadas.every((m) => typeof m === 'string'))) errores.push('`payload.marcas_heredadas` debe ser una lista de textos')
  if (p.tope_restante_usd !== undefined && !(typeof p.tope_restante_usd === 'number' && Number.isFinite(p.tope_restante_usd) && p.tope_restante_usd >= 0)) errores.push('`payload.tope_restante_usd` debe ser un número ≥ 0')
  if (p.imagenes !== undefined && !(lista(p.imagenes) && p.imagenes.every((u) => typeof u === 'string'))) errores.push('`payload.imagenes` debe ser una lista de direcciones')
  if (p.version !== undefined && !(Number.isInteger(p.version) && (p.version as number) >= 1)) errores.push('`payload.version` debe ser un entero ≥ 1')
  if (p.generado_por_jefatura !== undefined && p.generado_por_jefatura !== null && !texto(p.generado_por_jefatura)) errores.push('`payload.generado_por_jefatura` debe ser el id de una revisión o ir vacío')
  if (p.simulacion !== undefined) {
    if (p.dry_run !== true) errores.push('`payload.simulacion` solo se admite con dry_run = true')
    else if (!esObjeto(p.simulacion)) errores.push('`payload.simulacion` debe ser un objeto')
  }
  if (cuerpo.dry_run !== undefined) ignorados.push('dry_run en la raíz (solo vale `payload.dry_run`)')
  if (p.client_id !== undefined) ignorados.push('payload.client_id (el cliente lo pone el flujo en la raíz)')
  if (errores.length) return { ok: false, codigo: 'entrada_invalida', errores }
  const entrada: EntradaDeRevision = {
    artifact_type: cuerpo.artifact_type as TipoDeRevision,
    artifact_id: String(cuerpo.artifact_id),
    client_id: String(cuerpo.client_id),
    journey_id: texto(cuerpo.journey_id) ? String(cuerpo.journey_id) : null,
    payload: p as unknown as PayloadDeRevision,
  }
  return { ok: true, entrada, ignorados }
}
