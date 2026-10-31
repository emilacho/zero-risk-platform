/**
 * MÉTODOS COMO CAPA LOCAL (FIRMA de Emilio · 31-oct 20:01Z · `FIRMA-EMILIO-calendario-y-gancho`) · CC#1 · certifica CC#3.
 *
 * Dos métodos de `aaron-he-zhu/aaron-marketing-skills` (Apache-2.0) traídos como CAPA LOCAL de un agente nuestro: se pegan a la TAREA del agente,
 * NUNCA a su identidad (`identity_content` no se toca · protocolo 2026-05-16). Son dato en el sentido del canon: se apagan o se reemplazan por
 * `cadena_config.metodos` sin publicar, y aquí vive el texto por omisión con su procedencia fijada a un commit.
 *
 *   1 · CALENDARIO · `social-media-strategist` + método `social-calendar-builder`: cómo poner las ideas del banco de la gran idea, capítulo por capítulo,
 *       en los huecos que dicen la fase y la red (reparto por pilares · mezcla héroe/centro/ayuda · dar antes que pedir · huecos recurrentes = patrón ·
 *       profundidad de cola = lo que el equipo sostiene · reciclado solo con datos re-verificados · momentos = fechas verificadas · orden de publicación).
 *   2 · GANCHO DE VIDEO CORTO · UNA sola voz = `marketing_short_video_editing_coach` + método `short-video-scripter`: puerta de retención (0–2 s gancho ·
 *       2–5 s confirmación · 5–15 s entrega · bucle o llamada), 2–3 ganchos de familias con nombre, texto en pantalla para verlo sin sonido, línea de aviso
 *       de contenido sintético por omisión, ninguna promesa sin referencia. TikTok Strategist y el especialista de video aportan la estrategia de su red; no escriben el gancho.
 *
 * Lo que se QUITÓ de los métodos originales (dependencias de su repositorio, que aquí no existen ni deben existir): memoria por carpetas (`memory/`),
 * registro de canales (`channel-registry`, `registry-events`), el marco «ECHO» y su auditor (`social-quality-auditor`, veredicto SHIP), `trend-spotter`,
 * paquetes con hash/versión, recibos de publicación humana, y toda automatización de publicación. Aquí nada publica: el calendario planifica y la pieza va a la bandeja.
 * Idioma: los métodos NO fijan idioma ni trato; la regla de registro e idioma del cliente la ponen las indicaciones (`reglaDeRegistro` + `reglaDeIdioma`), como siempre.
 * Las cifras y proporciones de los métodos son SUPUESTOS DE PARTIDA (el original las llama «Estimated»), nunca reglas puntuadas ni promesas al cliente.
 */
import type { Almacen, ContextoDelCliente } from './almacen'
import type { IdeaDelBanco } from './conceptos'
import { reglaDeIdioma, reglaDeRegistro } from './registro'

/** procedencia fijada (condición (a) de CC#3: las skills cambian rápido; se adopta un commit y se re-lee a mano si se quiere subir) */
export const METODOS_ORIGEN = {
  repositorio: 'aaron-he-zhu/aaron-marketing-skills',
  commit: '6391e62ddbba2a096b52605c93529e733d018b3b',
  fecha: '2026-10-31T16:42:01Z',
  licencia: 'Apache-2.0',
  version_de_las_skills: '20.2.0',
  rutas: { calendario: 'social/craft/social-calendar-builder/SKILL.md', gancho: 'social/craft/short-video-scripter/SKILL.md' },
} as const

/** la única voz del gancho de video corto (FIRMA punto 2) */
export const AGENTE_GANCHO_DE_VIDEO = 'marketing_short_video_editing_coach'
/** las familias de gancho con nombre del método (el agente elige 2–3 y dice cuál usa) */
export const FAMILIAS_DE_GANCHO = ['llamado al público', 'brecha de curiosidad', 'resultado primero', 'lo que está en juego', 'afirmación a contracorriente', 'antes y después'] as const
/** las cuatro puertas de retención, en orden */
export const PUERTAS_DE_RETENCION = ['0-2s', '2-5s', '5-15s', 'cierre'] as const

const lineas = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')

/** el método de calendario por omisión (capa local de `social-calendar-builder`, sin sus dependencias) · texto para la tarea del agente */
export const METODO_CALENDARIO_POR_OMISION: string = [
  `# MÉTODO (capa local · social-calendar-builder · ${METODOS_ORIGEN.repositorio} @ ${METODOS_ORIGEN.commit.slice(0, 7)} · ${METODOS_ORIGEN.licencia})`,
  'Así se colocan las ideas del banco en el calendario. Es método de colocación, no de redacción: aquí no se escribe la pieza ni el guion.',
  lineas([
    'Hueco por hueco: cada slot del patrón semanal de cada semana es un hueco de una RED en una FASE. Elige para él una idea del BANCO DEL CAPÍTULO de esa fase cuya red coincida y cuyo formato quepa en los formatos permitidos; cita su id en `idea_de_mesa`.',
    'Reparto por pilares: la suma de piezas de la tanda respeta los porcentajes de los pilares de la ESTRATEGIA (±1 pieza). No inventes un pilar.',
    'Mezcla héroe / centro / ayuda (supuesto de partida, no regla): en cada tanda, pocas piezas HÉROE (la gran idea en grande: abrir o cerrar un capítulo), la mayoría CENTRO (las series y lo que el capítulo cuenta), y varias de AYUDA (lo útil para quien ya sigue: cómo, cuándo, dónde). Las de ayuda son las que mejor admiten datos con referencia.',
    'Dar antes que pedir (supuesto de partida ≈ 3 a 1): por cada pieza que PIDE algo (compra, reserva, visita, mensaje) hay al menos tres que DAN (muestran, cuentan, enseñan). Una pieza que pide va al final de una secuencia, nunca abre un capítulo.',
    'Orden dentro del capítulo: abre → desarrolla → cierra. Una idea con `serie:` sale en el orden de su serie y en las redes que la serie declara; una serie no se corta a la mitad de la tanda si cabe entera.',
    'Profundidad de cola = lo que el equipo sostiene: no planifiques más piezas que las del patrón. Si un hueco no tiene idea que le sirva, OMÍTELO en `ajustes_al_patron` con su motivo; un hueco vacío declarado vale más que un relleno.',
    'Nada se repite: una idea del banco se usa UNA vez por campaña. Un tema de una tanda anterior puede volver solo como pieza de ayuda y con sus datos re-verificados (misma `ref` vigente o nueva); nunca el mismo tema literal.',
    'Momentos: los únicos «momentos» que puedes planificar son las FECHAS ESPECIALES verificadas por el código. No inventes tendencias ni fechas; si no hay fechas, no hay huecos de momento.',
    'Orden de publicación: el original sale antes que su réplica (una hora después en la otra red); una pieza que depende de otra sale después de ella. Lo dicen las reglas: aquí solo se recuerda al colocar.',
    'Las proporciones de este método (héroe/centro/ayuda, dar/pedir) son supuestos de partida que el negocio calibrará con sus propios datos: no las escribas en ninguna pieza ni las presentes como promesa.',
  ]),
].join('\n')

/** la llave de configuración: `cadena_config.metodos` = `{ calendario: true | false | '<texto que reemplaza al de omisión>', gancho: idem }` */
export const CLAVE_DE_METODOS = 'metodos'
type ConfigDeMetodos = Partial<Record<'calendario' | 'gancho', unknown>>

/** el texto del método a usar: el de omisión (encendido), `null` si está apagado (`false`), o el texto de reemplazo si la configuración trae uno; si la configuración no se puede leer, el de omisión */
export function metodoSegunConfig(config: unknown, cual: 'calendario' | 'gancho', porOmision: string): string | null {
  const c = config && typeof config === 'object' ? (config as ConfigDeMetodos)[cual] : undefined
  if (c === false) return null
  if (typeof c === 'string' && c.trim()) return c.trim()
  return porOmision
}

/** el método de calendario para esta corrida (lee `cadena_config.metodos`; cualquier fallo de lectura = el de omisión, encendido) */
export async function metodoDeCalendario(al: Pick<Almacen, 'leerConfig'>): Promise<string | null> {
  let config: unknown = null
  try { config = await al.leerConfig(CLAVE_DE_METODOS) } catch { config = null }
  return metodoSegunConfig(config, 'calendario', METODO_CALENDARIO_POR_OMISION)
}

// ───────────────────────────────────────────────────────── gancho de video corto (T8 lo cablea sobre la hoja; aquí vive la tarea y su contrato)

export interface PedidoDeGanchoDeVideo {
  ctx: Pick<ContextoDelCliente, 'registro' | 'idioma'>
  /** la idea del banco que la pieza realiza (su mensaje y su gancho de concepto son el punto de partida, no el resultado) */
  idea: Pick<IdeaDelBanco, 'id' | 'red' | 'formato' | 'idea' | 'mensaje' | 'gancho' | 'protagonista'>
  /** la red y el formato de la pieza (p. ej. instagram · reel) */
  red: string
  formato: string
  /** qué debe lograr el video */
  objetivo: 'seguir' | 'guardar' | 'clic' | 'ver_completo'
  /** duración objetivo en segundos (el método repite la puerta de entrega si es más largo) */
  duracion_s: number
  /** la gran idea aprobada, en una línea (nombre · frase) */
  gran_idea: string
  /** el brief creativo (mensaje, tono, obligatorios) tal como lo dejó la mesa */
  brief: string
  /** referencias que puede citar en `ref` (id → texto); sin referencias no escribe datos */
  referencias: Array<{ id: string; texto: string }>
  /** ¿el video usará medios sintéticos realistas (avatar, voz clonada, generación fotorrealista)? decide el aviso por omisión */
  medios_sinteticos: boolean
  /** la estrategia de la red (lo que aportan TikTok Strategist / el especialista de video), si la hay: contexto, no autoría */
  estrategia_de_red?: string
  /** el método (capa local) · null = sin método (solo las reglas) */
  metodo?: string | null
}

/** el método del gancho por omisión (capa local de `short-video-scripter`, sin sus dependencias) */
export const METODO_GANCHO_POR_OMISION: string = [
  `# MÉTODO (capa local · short-video-scripter · ${METODOS_ORIGEN.repositorio} @ ${METODOS_ORIGEN.commit.slice(0, 7)} · ${METODOS_ORIGEN.licencia})`,
  'Tú eres la ÚNICA voz del gancho de este video. Escribes la especificación para grabar y montar; no renderizas, no publicas, no haces el calendario.',
  lineas([
    `Ganchos: escribe 2 o 3 opciones de gancho de 0–2 s, cada una de una FAMILIA con nombre (${FAMILIAS_DE_GANCHO.join(' · ')}) y di cuál eliges y por qué. Cada gancho debe sobrevivir sin sonido: su primer cuadro de texto en pantalla lo lleva.`,
    'Puerta de retención, en este orden y con tiempos: 0–2 s GANCHO (frena el pulgar) · 2–5 s CONFIRMACIÓN (prueba visual o hablada de que la promesa del gancho es real: es el tramo que casi todos se saltan) · 5–15 s ENTREGA (cumple en pasos, una idea por tramo; si el video es más largo, repite tramos de entrega) · CIERRE: bucle (el último cuadro alimenta al primero) o UNA llamada a la acción acorde al objetivo.',
    'Cada tramo lleva: ventana de tiempo, línea hablada, texto en pantalla y palabras clave del plano. Escribe para verlo SIN sonido: texto en pantalla en cada tramo y dentro de la zona segura de la red.',
    'El mensaje de la pieza es el de SU idea del banco; el gancho del concepto es un punto de partida que puedes mejorar, no una obligación literal.',
    'Aviso de contenido sintético: si el video usa medios sintéticos realistas (avatar, voz clonada, generación fotorrealista), incluye la línea de aviso por omisión; si lo omites, di el motivo (estilizado, no realista). Si no hay medios sintéticos, di que no aplica.',
    'Ninguna promesa ni dato sin referencia: precio, horario, «el más…», «gratis», salud, origen. Lo que no tenga `ref` va a `pendientes`, no al guion.',
    'Las frases hechas de la red («esto cambió mi vida», «nadie te lo dice») son folclore: evítalas; el gancho sale del protagonista y de la idea, no de una plantilla.',
    'Formato: vertical 9:16; la duración objetivo la da el pedido. No afirmes «duración ideal» ni «mejor hora»: no son reglas.',
  ]),
].join('\n')

/** el método del gancho para esta corrida (misma lectura que el de calendario) */
export async function metodoDeGancho(al: Pick<Almacen, 'leerConfig'>): Promise<string | null> {
  let config: unknown = null
  try { config = await al.leerConfig(CLAVE_DE_METODOS) } catch { config = null }
  return metodoSegunConfig(config, 'gancho', METODO_GANCHO_POR_OMISION)
}

/** la tarea del gancho de video corto para `marketing_short_video_editing_coach` (salida: `gancho_video.v1`) */
export function tareaDeGanchoDeVideo(p: PedidoDeGanchoDeVideo): string {
  const idioma = reglaDeIdioma(p.ctx.idioma)
  const objetivo = { seguir: 'que sigan la cuenta', guardar: 'que guarden el video', clic: 'que toquen el enlace o escriban', ver_completo: 'que lo vean completo' }[p.objetivo]
  return [
    '# Qué te pido',
    `Escribe el GANCHO y la puerta de retención de un video corto vertical de ${p.formato} para ${p.red}, de unos ${p.duracion_s} segundos, cuyo objetivo es ${objetivo}. Devuelve SOLO el objeto que pide el formato de salida.`,
    '',
    '# Reglas',
    lineas([
      'Respondes SOLO con el objeto que pide el formato de salida. No escribas nada fuera de él.',
      reglaDeRegistro(p.ctx.registro),
      ...(idioma ? [idioma] : []),
      'No inventes datos. Todo dato concreto (precio, medida, horario, dirección, cantidad, reseña) necesita una referencia (`ref`) a un id de la lista de REFERENCIAS; si no hay referencia, no lo escribas: déjalo como pendiente.',
      'No cites reseñas ni testimonios de personas. No nombres personas.',
      'Una sola voz: el gancho es tuyo. Si recibes estrategia de la red, úsala como contexto; no copies ganchos de ahí.',
    ]),
    ...(p.metodo ? ['', p.metodo] : []),
    '',
    `# GRAN IDEA\n${p.gran_idea}`,
    '',
    `# LA IDEA QUE REALIZA ESTA PIEZA\n- ${p.idea.id} · ${p.idea.red} · ${p.idea.formato} · ${p.idea.idea} · mensaje: ${p.idea.mensaje} · gancho de concepto: ${p.idea.gancho} · protagonista: ${p.idea.protagonista}`,
    '',
    `# BRIEF CREATIVO\n${p.brief}`,
    '',
    `# MEDIOS SINTÉTICOS\n${p.medios_sinteticos ? 'SÍ: el video usará medios sintéticos realistas.' : 'NO: el video se graba con medios reales.'}`,
    ...(p.estrategia_de_red ? ['', `# ESTRATEGIA DE LA RED (contexto · no es tuya la autoría del gancho)\n${p.estrategia_de_red}`] : []),
    '',
    `# REFERENCIAS (ids que puedes citar en \`ref\`)\n${p.referencias.length ? p.referencias.map((r) => `- ${r.id}: ${r.texto.replace(/\s+/g, ' ').slice(0, 280)}`).join('\n') : '(no hay referencias: no escribas datos concretos)'}`,
  ].join('\n')
}
