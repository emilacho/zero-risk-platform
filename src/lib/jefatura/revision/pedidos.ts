/**
 * LO QUE SE LE PIDE A CADA EMPLEADO DE LA JEFATURA (diseño v4 §2, §5.1, §9.4) · puro.
 *  · `jefe-marketing` (fondo): UNA línea de contexto del tipo («Estás revisando {tipo} contra {documentos}»), sin reglas ni criterios nuevos (F8 «no frenar lo creativo»); el formato lo hace cumplir el código.
 *  · el que produce (corrección / decisión): sus fichas, por `id`, y la indicación corta. En el PLAN: el pedido original + el plan vigente + SOLO las fichas que bloquean + tres líneas.
 *  · GPT (ciego): la pregunta D3 + lo revisado completo + el contexto. 🔴 CIEGO POR CONSTRUCCIÓN: `armarPedidoCiego` solo recibe el texto, las imágenes, el contexto y los huecos; no hay por dónde entren las fichas ni el hilo.
 *  · 🔴 REGLA DURA (aviso 5.2 y certificación de CC#3 §4): NINGÚN pedido lleva `extra.workflow_execution_id` hacia un agente de `EDITOR_WHITELIST` sin la cabecera `x-skip-editor-middleware: 1`
 *    (si lo hiciera, resucitan los 3 revisores de julio: 3 llamadas de pago por texto y reescritura con `[REVISION]`). Los ids de ejecución van arriba del cuerpo; en `extra` solo las 4 claves de la lista.
 * Todo texto interno va en TUTEO (firma 11-oct); el registro de las piezas lo deciden su manual o su país, nunca estas instrucciones.
 */
import { requiresEditorReview } from '../../editor-routing'
import { armarPedidoAlRevisor, preguntaAlRevisor, type ContextoDelRevisor, type Estado, type HuecosDeLaPregunta, type PedidoAlRevisor } from '../../revision-comun'
import type { PayloadDeRevision, Simulacion, TipoDeRevision } from './contrato'
import { MARCA_DE_FIN_DE_RESOLUCION, MARCA_DE_INICIO_DE_RESOLUCION } from './formatos'
import type { Dueno, PoliticaDeRevision } from './politicas'

/** el mismo valor que `CABECERA_SALTAR_EDITOR` de la cadena (una prueba lo vigila) */
export const CABECERA_SALTAR_EDITOR = 'x-skip-editor-middleware'
export const CLAVES_PERMITIDAS_EN_EXTRA = ['indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id', 'dispatch_key'] as const
export const WORKFLOW_HINT = 'jefatura · turno'

export interface PedidoDeAgente {
  agent_name: string
  task: string
  images: Array<{ url: string }>
  esquema: string
  extra: { indicacion_jefatura: string; paso_de_la_jefatura: string; revision_id: string; dispatch_key: string }
  max_budget_usd: number
  thinking_mode: 'disabled'
  dry_run: boolean
  client_id: string
  workflow_hint: string
  /** cada turno es una corrida nueva: sin esto el corredor devolvería la primera respuesta guardada (guarda G2) */
  force_restart: true
  /** el turno vuelve por su callback (un redactor de plan tarda minutos: no se espera en la ruta de 300 s) */
  callback_mode: 'runner'
  /** cabeceras que el flujo DEBE poner en la llamada al corredor */
  headers_requeridos: Record<string, string>
  /** solo con `dry_run = true`: las ramas que fuerza la simulación (los flujos del seco la leen) */
  simulacion?: Simulacion
  /** `true` en el pedido que repite un paso por formato roto (el seco lo usa para romper solo el primer intento) */
  reintento_formato?: true
}

export interface DatosDelPedido {
  agente: string
  task: string
  esquema: string
  imagenes?: string[]
  indicacion: string
  paso: string
  revision_id: string
  dispatch_key: string
  max_budget_usd: number
  dry_run: boolean
  client_id: string
  /** lo que un llamador intentara meter en `extra`: se rechaza lo que no esté en la lista */
  extra_ajeno?: Record<string, unknown>
  simulacion?: Simulacion
  reintento_formato?: boolean
}

/** arma el pedido de UN turno; falla si alguien intenta colar algo en `extra` */
export function armarPedidoDeAgente(a: DatosDelPedido): PedidoDeAgente {
  for (const k of Object.keys(a.extra_ajeno ?? {})) throw new Error(`la jefatura no admite «${k}» en extra (solo ${CLAVES_PERMITIDAS_EN_EXTRA.join(', ')}; los ids de ejecución van arriba del cuerpo)`)
  return {
    agent_name: a.agente, task: a.task, images: (a.imagenes ?? []).map((url) => ({ url })), esquema: a.esquema,
    extra: { indicacion_jefatura: a.indicacion, paso_de_la_jefatura: a.paso, revision_id: a.revision_id, dispatch_key: a.dispatch_key },
    max_budget_usd: a.max_budget_usd, thinking_mode: 'disabled', dry_run: a.dry_run, client_id: a.client_id, workflow_hint: WORKFLOW_HINT,
    force_restart: true, callback_mode: 'runner',
    // la cabecera va SIEMPRE: es inocua para un agente fuera de la lista y obligatoria para los de la lista (`content-creator`, `social-media-strategist`)
    headers_requeridos: { [CABECERA_SALTAR_EDITOR]: '1' },
    ...(a.dry_run && a.simulacion ? { simulacion: a.simulacion } : {}),
    ...(a.reintento_formato ? { reintento_formato: true as const } : {}),
  }
}

/** auditoría de un pedido (lo usan las pruebas y la ruta antes de entregarlo): devuelve los errores, vacío si está bien */
export function auditarPedidoDeAgente(p: unknown): string[] {
  const e: string[] = []
  if (typeof p !== 'object' || p === null) return ['el pedido no es un objeto']
  const o = p as Record<string, unknown>
  const extra = (typeof o.extra === 'object' && o.extra !== null ? o.extra : {}) as Record<string, unknown>
  for (const k of Object.keys(extra)) if (!(CLAVES_PERMITIDAS_EN_EXTRA as readonly string[]).includes(k)) e.push(`extra.${k} no está permitido`)
  if ('workflow_execution_id' in extra) e.push('extra.workflow_execution_id hacia un agente de la lista del editor resucita a los 3 revisores de julio')
  const h = (typeof o.headers_requeridos === 'object' && o.headers_requeridos !== null ? o.headers_requeridos : {}) as Record<string, unknown>
  const slug = String(o.agent_name ?? '')
  if (requiresEditorReview(slug) && h[CABECERA_SALTAR_EDITOR] !== '1') e.push(`«${slug}» está en la lista del editor y el pedido no lleva la cabecera ${CABECERA_SALTAR_EDITOR}: 1`)
  if (o.force_restart !== true) e.push('falta force_restart: true (cada turno es una corrida nueva)')
  if (typeof o.dry_run !== 'boolean') e.push('falta dry_run booleano')
  return e
}

// ───────────────────────── textos
const TITULO_DE: Record<TipoDeRevision, string> = { plan: 'el plan de 90 días', estrategia: 'la estrategia', calendario: 'el calendario', brief: 'el parte de briefs', pieza: 'la pieza', manual: 'el manual' }
export const tituloDeLoRevisado = (t: TipoDeRevision): string => TITULO_DE[t]

const unir = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
const minuscula = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s)
/** «{documentos}» → los títulos de la política, en minúscula inicial */
export const documentosDeLaLinea = (p: PoliticaDeRevision): string => unir(p.contra_que.map((d) => minuscula(d.titulo)))

const bloqueDeContexto = (docs: ContextoDelRevisor[]): string => {
  const con = docs.filter((d) => d.texto.trim())
  return con.length ? `## Documentos\n${con.map((d) => `### ${d.titulo}${d.funcion ? ` — ${d.funcion}` : ''}\n${d.texto.trim()}`).join('\n\n')}` : ''
}

const FORMATO_DE_FICHAS = 'Devuelve solo el JSON {"fichas":[{"que":"…","donde":"…","contra_que":"…","gravedad":"bloquea|sugerencia","propuesta":"…"}]}. Si no hay nada que señalar, {"fichas":[]}.'

/** `jefe-marketing`: la línea de contexto del tipo y nada más (sin reglas ni criterios nuevos) */
export function tareaDeRevisionDeFondo(a: { politica: PoliticaDeRevision; payload: PayloadDeRevision; tipo: TipoDeRevision; texto: string; duenos: Dueno[] }): { task: string; indicacion: string; esquema: string } {
  const linea = (a.politica.indicacion_fondo ?? `Estás revisando ${tituloDeLoRevisado(a.tipo)} contra {documentos}.`).replace('{documentos}', documentosDeLaLinea(a.politica))
  const dondes = a.duenos.flatMap((d) => (d.comodin ? [] : d.dondes))
  const donde = dondes.length ? `En «donde» pon la parte a la que se refiere: ${unir(dondes.map((d) => `«${d}»`))}.` : 'En «donde» pon la sección o el pasaje al que se refiere.'
  const partes = [linea, `## Lo que revisas (${tituloDeLoRevisado(a.tipo)})\n${a.texto.trim()}`, bloqueDeContexto(a.payload.contexto ?? []), `${FORMATO_DE_FICHAS} ${donde}`]
  return { task: partes.filter(Boolean).join('\n\n'), indicacion: linea, esquema: 'fichas.v1' }
}

export interface FichaParaElDueno { id: string; que?: string; donde: string; contra_que?: string; propuesta?: string; gravedad?: string; texto_de_la_opinion?: string }

/** el formato de la oficina: `- [id] (gravedad) en donde: qué` (los flujos de n8n leen los ids con una expresión regular sobre `- [id] (bloquea|sugerencia)`) */
export const lineaDeFicha = (f: FichaParaElDueno): string => `- [${f.id}] (${f.gravedad ?? 'bloquea'}) en ${f.donde}: ${f.que ?? ''}${f.contra_que ? ` · contra: ${f.contra_que}` : ''}${f.propuesta ? ` · propuesta: ${f.propuesta}` : ''}`

/** las tres líneas del plan (aviso 6 / diseño §5.1 paso 4): pedir la versión nueva sin cambiar lo que no tocan las fichas */
export const TRES_LINEAS_DEL_PLAN = [
  'Escribe la versión nueva COMPLETA del plan.',
  'Cambia solo lo que dicen las fichas; conserva el resto, las ocho secciones y las declaraciones de datos faltantes.',
  'No inventes cifras: lo que no tenga fuente se declara como hueco.',
] as const

/** el literal EXACTO del estado y un ejemplo válido (J6 ter: el modelo contestó «tomado»; el contrato exige «tomada» | «no_tomada» aunque quien responda sea masculino) */
export const REGLA_DEL_ESTADO = 'El campo "estado" vale EXACTAMENTE "tomada" o "no_tomada": minúsculas, con guion bajo, SIEMPRE en femenino (se refiere a la ficha), aunque tú seas masculino; no uses "tomado", "no tomada", "aceptada" ni otra forma. Ejemplo válido: {"respuestas":[{"id":"<id de una ficha>","estado":"tomada","razon":"…"},{"id":"<id de otra ficha>","estado":"no_tomada","razon":"…"}]}'

const FORMATO_DEL_PLAN = (decision: boolean): string =>
  `Formato: el plan completo en texto plano${decision ? ' (solo si tomas algo; si no tomas nada, no escribas el plan)' : ' (solo si tomas alguna ficha; si no tomas ninguna, no escribas el plan)'} y, AL FINAL, el bloque de resolución exacto:\n${MARCA_DE_INICIO_DE_RESOLUCION}\n{"respuestas":[{"id":"…","estado":"tomada|no_tomada","razon":"…"}]}\n${MARCA_DE_FIN_DE_RESOLUCION}\n${REGLA_DEL_ESTADO}`

/** corrección: el dueño recibe SUS fichas que bloquean; en el plan, además, el pedido original y el plan actual */
export function tareaDeCorreccion(a: { politica: PoliticaDeRevision; payload: PayloadDeRevision; tipo: TipoDeRevision; dueno: Dueno; esquema: string; texto: string; objeto?: unknown; fichas: FichaParaElDueno[]; version_actual: 'A' | 'B' }): { task: string; indicacion: string; esquema: string } {
  const fichas = `## Fichas que te tocan (solo las que bloquean)\n${a.fichas.map(lineaDeFicha).join('\n')}`
  const indicacion = a.tipo === 'plan' ? TRES_LINEAS_DEL_PLAN.join(' ') : `Respondes ítem por ítem: tomada o no tomada, con la razón. Si tomas algo, corriges solo eso.`
  if (a.esquema === 'plan_texto_y_resolucion.v1') {
    const partes = [(a.payload.pedido_del_plan ?? '').trim(), `## El plan actual (${a.version_actual})\n${a.texto.trim()}`, fichas, TRES_LINEAS_DEL_PLAN.join('\n'), FORMATO_DEL_PLAN(false)]
    return { task: partes.filter(Boolean).join('\n\n'), indicacion, esquema: a.esquema }
  }
  const objeto = a.objeto !== undefined ? `## Lo actual (${tituloDeLoRevisado(a.tipo)})\n${JSON.stringify(a.objeto)}` : `## Lo actual (${tituloDeLoRevisado(a.tipo)})\n${a.texto.trim()}`
  const formato = a.esquema === 'resolucion_objeto.v1' ? 'Devuelve solo el JSON {"respuestas":[{"id","estado":"tomada|no_tomada","razon"}],"objeto":{…el objeto COMPLETO corregido, solo si tomaste algo…}}.'
    : a.esquema === 'resolucion_parcial.v1' ? 'Devuelve solo el JSON {"respuestas":[…],"filas":[{"fila_id":"…", …solo las filas que cambias…}]}.'
    : a.esquema === 'resolucion_solo.v1' ? 'Devuelve solo el JSON {"respuestas":[{"id","estado":"tomada|no_tomada","razon"}]}. No entregas la pieza.'
    : 'Devuelve solo el JSON {"respuestas":[{"id","estado":"tomada|no_tomada","razon"}],"pieza":{"pie_de_foto":"…","hashtags":[…]}} (la pieza solo si tomaste algo).'
  return { task: [objeto, fichas, formato, REGLA_DEL_ESTADO].join('\n\n'), indicacion, esquema: a.esquema }
}

/** decisión: el dueño ve la opinión de GPT (que NO vio el hilo) y decide qué toma, con razón */
export function tareaDeDecision(a: { politica: PoliticaDeRevision; payload: PayloadDeRevision; tipo: TipoDeRevision; dueno: Dueno; esquema: string; texto: string; fichas: FichaParaElDueno[]; opinion: string; version_actual: 'A' | 'B' }): { task: string; indicacion: string; esquema: string } {
  const ids = `## Tus ítems (uno por parte que hiciste)\n${a.fichas.map((f) => `- [${f.id}] (sugerencia) en ${f.donde}`).join('\n')}`
  const opinion = `## La opinión de un revisor externo (leyó ${tituloDeLoRevisado(a.tipo)} sin conocer el hilo de la revisión)\n${a.opinion.trim()}`
  if (a.esquema === 'plan_texto_y_resolucion.v1') {
    const indicacion = 'Decide qué tomas de esta opinión. Si no tomas nada, responde solo la resolución, sin texto del plan. Si tomas algo, escribe UNA versión final completa del plan con eso; es la última, no habrá otra revisión.'
    const partes = [(a.payload.pedido_del_plan ?? '').trim(), `## El plan vigente (${a.version_actual})\n${a.texto.trim()}`, opinion, ids, indicacion, FORMATO_DEL_PLAN(true)]
    return { task: partes.filter(Boolean).join('\n\n'), indicacion, esquema: a.esquema }
  }
  const indicacion = 'Decide qué tomas de la opinión, ítem por ítem, con la razón. Una corrección como máximo en este paso.'
  const formato = a.esquema === 'resolucion_solo.v1' ? 'Devuelve solo el JSON {"respuestas":[{"id","estado":"tomada|no_tomada","razon"}]}.' : 'Devuelve solo el JSON {"respuestas":[…]} y, solo si tomaste algo, la parte corregida según el contrato de tu paso.'
  return { task: [`## Lo vigente (${tituloDeLoRevisado(a.tipo)})\n${a.texto.trim()}`, opinion, ids, indicacion, formato, REGLA_DEL_ESTADO].join('\n\n'), indicacion, esquema: a.esquema }
}

/** el pedido del revisor ciego: la pregunta (D3) → lo revisado completo → el contexto. NADA del hilo ni de las fichas puede entrar (no hay por dónde). */
export function armarPedidoCiego(a: { tipo: TipoDeRevision; texto: string; imagenes?: string[]; contexto: ContextoDelRevisor[]; huecos?: HuecosDeLaPregunta; huecos_de_la_politica?: { que_es?: string; uso?: string } | null }): PedidoAlRevisor {
  const h: HuecosDeLaPregunta = { ...(a.huecos_de_la_politica ?? {}), ...(a.huecos ?? {}) }
  return armarPedidoAlRevisor({ pregunta: preguntaAlRevisor(h), titulo_de_lo_revisado: tituloDeLoRevisado(a.tipo).replace(/^./, (c) => c.toUpperCase()), revisado: a.texto, contexto: a.contexto, imagenes: a.imagenes })
}

/** helper de tipos para quien arme el estado */
export type { Estado }
