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

/** la llave de configuración: `cadena_config.metodos` = `{ <método>: true | false | '<texto que reemplaza al de omisión>' }` · una llave por método */
export const CLAVE_DE_METODOS = 'metodos'
/** los métodos firmados (31-oct 20:01Z calendario + gancho · 20:29Z brief, mercado, pieza, fichas_por_red, plan) · `autocontrol` (content-humanizer) espera la verificación de CC#3 */
export type ClaveDeMetodo = 'calendario' | 'gancho' | 'brief' | 'mercado' | 'pieza' | 'fichas_por_red' | 'plan'
type ConfigDeMetodos = Partial<Record<ClaveDeMetodo, unknown>>

/** el texto del método a usar: el de omisión (encendido), `null` si está apagado (`false`), o el texto de reemplazo si la configuración trae uno; si la configuración no se puede leer, el de omisión */
export function metodoSegunConfig(config: unknown, cual: ClaveDeMetodo, porOmision: string): string | null {
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

// ───────────────────────────────────────────────────────── FIRMA 2 (31-oct 20:29Z · `FIRMA-EMILIO-metodos-para-nuestros-agentes`) · cinco métodos más, GUÍA y no formato

/** procedencia fijada del segundo repositorio (MIT) · `marketing-plan` solo como lista de control del plan */
export const METODOS_ORIGEN_COREY = {
  repositorio: 'coreyhaines31/marketingskills',
  commit: '88c79f6528a9347420e57ceb1fff9a60de651768',
  fecha: '2026-10-30T23:28:36Z',
  licencia: 'MIT',
  rutas: { plan: 'skills/marketing-plan/SKILL.md' },
} as const
/** rutas de los cuatro métodos de aaron de la firma 2 (mismo commit que `METODOS_ORIGEN`) */
export const RUTAS_FIRMA_2 = {
  brief: 'launch/assemble/message-house-builder/SKILL.md',
  mercado: 'narrative/trace/audience-belief-mapper/SKILL.md',
  pieza: 'social/craft/social-creative-builder/SKILL.md',
  fichas_por_red: 'social/explore/platform-norm-profiler/SKILL.md',
} as const
/** `content-humanizer` (alirezarezvani/claude-skills · MIT): firmado como AUTOCONTROL del creador, pero NO se construye hasta que CC#3 verifique (US$ 0, sin su script Python, en cualquier idioma) */
export const AUTOCONTROL_PENDIENTE = {
  metodo: 'content-humanizer',
  repositorio: 'alirezarezvani/claude-skills',
  ruta: 'marketing-skill/skills/content-humanizer/SKILL.md',
  estado: 'pendiente de verificación de CC#3 antes de construir (firma 20:29Z, punto 7)',
} as const

/** la regla común de la firma 2: el agente razona con el método; no rellena casillas; el formato de salida lo fija el pedido, nunca el método */
export const GUIA_NO_FORMATO = 'Esta capa es GUÍA, no formato obligatorio: razona con ella y úsala donde sume; no rellenes casillas ni cambies el formato de salida que fija el pedido.'

const cabecera = (nombre: string, origen: { repositorio: string; commit: string; licencia: string }) =>
  `# MÉTODO (capa local · ${nombre} · ${origen.repositorio} @ ${origen.commit.slice(0, 7)} · ${origen.licencia})`

/** brief · `campaign-brief-agent` + `message-house-builder`: la casa del mensaje (techo + tres pilares con prueba) detrás del brief creativo de una campaña */
export const METODO_BRIEF_POR_OMISION: string = [
  cabecera('message-house-builder', METODOS_ORIGEN),
  GUIA_NO_FORMATO,
  lineas([
    'La casa del mensaje: un TECHO (el mensaje único del brief, en una frase que el público entienda sin contexto) sostenido por TRES PILARES de valor, cada uno rastreable al plan o al manual (cita de dónde sale). Dos mensajes = ninguno; cuatro pilares = tres y uno que sobra.',
    'Cada pilar lleva su PRUEBA: un hecho del material del cliente (dato con referencia), un hecho del plan, o «[sin fuente]». Nunca presentes como hecho lo que no tenga referencia; nunca inventes una comparación ni una cifra para llenar un pilar: va a «Faltantes».',
    'Números antes que adjetivos, pero solo números con referencia; si no hay número, deja el adjetivo fuera y declara el hueco.',
    'La prueba de la silla vacía: lee el brief como el público que el plan describe; cada frase que a esa persona no le importa, sobra.',
    'Ángulos por red, no copia: el objetivo por red del brief es un ÁNGULO (qué pilar lidera y qué acción pide) para que la pieza de cada red diga lo mismo con otra forma. Lo que el anuncio, la página y la oferta prometan tiene que ser lo mismo.',
    'Las palabras prohibidas del manual y las muletillas vacías («único», «el mejor», «revolucionario», «de calidad») no sostienen un pilar: si un pilar solo se sostiene con ellas, no es un pilar.',
    'No adjudicas promesas: lo comparativo o lo que afirma un resultado sin referencia queda marcado «[sin fuente]» en «Faltantes»; la jefatura y el humano deciden, no tú.',
  ]),
].join('\n')

/**
 * mercado · `market_research_analyst` + `audience-belief-mapper`: del «informe de tendencias» a las creencias, objeciones y fuerzas de cambio del público, CON fuente y fecha.
 * Ojo con el contrato del brazo: una señal cuenta SOLO si su línea de lista trae fuente Y fecha (`esSenal`); lo inferido no es señal y se declara aparte.
 */
export const METODO_MERCADO_POR_OMISION: string = [
  cabecera('audience-belief-mapper', METODOS_ORIGEN),
  GUIA_NO_FORMATO,
  lineas([
    'Ancla al público que el plan describe (un segmento con dolor, alcance y capacidad de pago), nunca «todos»: una señal sobre «la gente en general» no sirve al plan.',
    'Qué buscar, además de la tendencia: (1) CREENCIAS y modelos mentales que ese público ya tiene sobre el problema, las alternativas y la categoría; (2) OBJECIONES que se repiten, con cuántas fuentes las mencionan y un reencuadre candidato (un ángulo, no una promesa); (3) las CUATRO FUERZAS del cambio: empuje (qué duele del statu quo), atracción (qué atrae de lo nuevo), ansiedad (qué asusta de cambiar), hábito (qué lo retiene donde está).',
    'Cada creencia, objeción o fuerza que presentes como señal va en UNA línea de lista con su fuente (nombre y dónde se puede ver) y su fecha, como pide el pedido; sin fuente y fecha no es señal: es inferencia, y la declaras como tal fuera de la lista.',
    'Conserva las palabras literales del público cuando la fuente las trae (cómo nombran el problema, cómo objetan): esas frases valen más que tu paráfrasis.',
    'Lo comparativo o lo que afirme un hecho del producto o de un competidor sin fuente queda marcado «[sin fuente]»; registras quién lo dice, nunca si es verdad.',
    'Si para una fuerza u objeción no hay evidencia, escribe «sin dato» y qué habría que mirar; no estimes.',
  ]),
].join('\n')

/** pieza · `content-creator` + `social-creative-builder`: una idea → piezas nativas por red; nunca la misma copia en dos redes */
export const METODO_PIEZA_POR_OMISION: string = [
  cabecera('social-creative-builder', METODOS_ORIGEN),
  GUIA_NO_FORMATO,
  lineas([
    'Una idea, N piezas NATIVAS: cada red recibe su forma (hilo o texto corto, tono profesional o conversacional, pie con o sin enlace) según la FICHA DE LA RED si la hay; nunca pegues el mismo texto en dos redes.',
    'Elige el gancho por red de una taxonomía con nombre (pregunta · a contracorriente · cifra · historia · brecha de curiosidad · prueba · punto de vista) y cumple lo que el gancho promete: una brecha de curiosidad que el cuerpo no cierra es un defecto, no un estilo.',
    'El enlace va donde la ficha de la red diga (en el texto o en el primer comentario); si no hay ficha o está vencida, dilo y no inventes la norma.',
    'Carrusel: roles de lámina (gancho · contenido · cierre con la llamada), presupuesto de texto por lámina ≈ 70 % del máximo de la red (supuesto de partida: deja margen al dibujo), zona segura del texto y UNA línea de texto alternativo por lámina.',
    'Lista negativa: nada de mecánicas de cebo («dale like», «etiqueta a», «comparte para ganar»; una pregunta genuina sí vale), nada de desajuste gancho/cuerpo, nada de etiquetas de relleno (cada hashtag se gana su lugar según la ficha).',
    'Promesas y datos solo con referencia; lo que no la tenga va a pendientes, no a la pieza. El aviso de contenido pagado o sintético va donde la red lo exige.',
  ]),
].join('\n')

/** fichas por red · `marketing_instagram_curator` + `platform-norm-profiler`: la ficha de cada red es DATO fechado que caduca */
export const METODO_FICHAS_POR_RED_POR_OMISION: string = [
  cabecera('platform-norm-profiler', METODOS_ORIGEN),
  GUIA_NO_FORMATO,
  lineas([
    'Una FICHA por red, como dato: límites de caracteres, corte visible («ver más»), normas de etiquetas, formatos y proporciones, dónde va el enlace y el primer comentario, etiquetas de divulgación (pagado, sintético) y énfasis conocidos del algoritmo.',
    'Cada fila lleva su tipo: DOCUMENTADA (fuente oficial de la red, con dónde se lee y fecha de lectura) o FOLCLORE (fuente nombrada, no oficial). El folclore nunca es regla: es supuesto de partida.',
    'Cada fila y cada ficha llevan fecha de verificación y fecha de revisión (90 días por omisión; menos para lo que cambia rápido). Una ficha pasada su fecha de revisión está VENCIDA: se marca y no se confía hasta re-verificarla.',
    'No inventes una norma que no puedas citar; si no hay fuente, la fila va como «sin dato» y la pieza se hace con lo conservador.',
    'Lo que la ficha diga manda sobre el folclore de la red («mejor hora», «largo ideal») y sobre lo que recuerdes de memoria.',
  ]),
].join('\n')

/**
 * plan · `jefe-marketing` + `marketing-plan` (Corey) SOLO como LISTA DE CONTROL: superficies que un plan de 90 días no puede omitir y señales de plan genérico.
 * Adaptado a una agencia agnóstica de rubro (el original es de software): las etapas se nombran en lenguaje de cualquier negocio.
 * Es dato (`cadena_config.planeacion.lista_de_control` · migración 202610312006, en copia hasta T9); aquí vive el texto por omisión.
 */
export const LISTA_DE_CONTROL_DEL_PLAN: string = [
  cabecera('marketing-plan (lista de control)', METODOS_ORIGEN_COREY),
  'Lista de control, no formato: revisa que tu plan cubra cada superficie o diga explícitamente por qué no aplica a este negocio. No agregues secciones por cumplir.',
  lineas([
    'Resumen ejecutivo que se sostenga solo: las 3 apuestas grandes, las prioridades de 90 días y el resultado esperado, legible en un minuto.',
    'Marco estratégico: en qué categoría compite el negocio, quién es exactamente el público (no «todos») y las reglas de voz del manual que ninguna sección puede romper.',
    'Estado actual: equipo real, presupuesto real, lo que ya se hizo (reconocido, no ignorado), lo que está en marcha y lo que está trabado.',
    'Cómo nos conocen (adquisición): canales actuales, planeados y descartados con motivo; movimientos de 90 días.',
    'Primera experiencia (activación): qué pasa la primera vez que alguien llega, compra o entra; qué lo convierte.',
    'Vuelven (retención): qué hace que el cliente repita; qué evita que se vaya; cómo se recupera al que se fue.',
    'Recomiendan (referidos): qué mecanismo concreto hace que un cliente traiga a otro.',
    'Ingresos: precios, paquetes, ventas adicionales; el número que el plan persigue y la meta por semana que lo mide.',
    'Hoja de ruta de 90 días por semanas con fechas: desbloquear (semanas 1–2) · cimientos (3–4) · velocidad (5–8) · acumular (9–12); cada movimiento con un responsable, no solo una acción.',
    'Más allá de los 90 días: qué cambia después y qué lo desbloquea (presupuesto, temporada, equipo).',
    'Herramientas y canales que ejecutan cada movimiento (los que el negocio tiene, no los que no tiene).',
    'Lo que NO se hace y por qué: las ideas descartadas con su motivo valen tanto como las elegidas.',
    'Medición y decisiones abiertas: el indicador principal, los indicadores adelantados, quién decide qué, y las decisiones incómodas nombradas (no escondidas).',
    'Señales de plan genérico (evítalas): tácticas sin secuencia · recomendar lo que el equipo no puede ejecutar · presupuesto que no existe · frases vacías («construir comunidad», «mejorar el SEO») sin movimiento concreto · ignorar la voz del manual · relleno con ideas que el negocio no necesita · no reconocer lo que ya se hizo.',
    'Denso, no inflado: si una sección no tiene nada que decir, dilo en una línea. Nombra la pregunta abierta antes que adivinar.',
  ]),
].join('\n')

/** el texto por omisión de cada método (una llave por método) */
export const METODOS_POR_OMISION: Record<ClaveDeMetodo, string> = {
  calendario: METODO_CALENDARIO_POR_OMISION,
  gancho: METODO_GANCHO_POR_OMISION,
  brief: METODO_BRIEF_POR_OMISION,
  mercado: METODO_MERCADO_POR_OMISION,
  pieza: METODO_PIEZA_POR_OMISION,
  fichas_por_red: METODO_FICHAS_POR_RED_POR_OMISION,
  plan: LISTA_DE_CONTROL_DEL_PLAN,
}
/** qué método lleva cada empleado (una dimensión por agente · F5): quien redacta piezas no recibe el método de calendario, y viceversa */
export const METODO_POR_AGENTE: Readonly<Record<string, ClaveDeMetodo>> = {
  'social-media-strategist': 'calendario',
  [AGENTE_GANCHO_DE_VIDEO]: 'gancho',
  'campaign-brief-agent': 'brief',
  market_research_analyst: 'mercado',
  'content-creator': 'pieza',
  marketing_instagram_curator: 'fichas_por_red',
  'jefe-marketing': 'plan',
}

/** el método `cual` para esta corrida (lee `cadena_config.metodos`; cualquier fallo de lectura = el de omisión, encendido) */
export async function metodoDe(al: Pick<Almacen, 'leerConfig'>, cual: ClaveDeMetodo): Promise<string | null> {
  let config: unknown = null
  try { config = await al.leerConfig(CLAVE_DE_METODOS) } catch { config = null }
  return metodoSegunConfig(config, cual, METODOS_POR_OMISION[cual])
}
/** el método del empleado `agente` según la configuración ya leída (`null` = ese empleado no tiene método, o está apagado) · para quien arma la tarea de un asiento de la oficina */
export function metodoDeAsiento(agente: string, config: unknown): string | null {
  const cual = METODO_POR_AGENTE[agente]
  return cual ? metodoSegunConfig(config, cual, METODOS_POR_OMISION[cual]) : null
}

// ───────────────────────────────────────────────────────── fichas por red como DATO (`cadena_config.fichas_por_red`) · caducan

export interface FilaDeFicha { dato: string; valor: string; tipo: 'documentada' | 'folclore' | 'sin_dato'; fuente: string; verificada_en: string }
export interface FichaDeRed { red: string; verificada_en: string; revisar_antes_de: string; filas: FilaDeFicha[] }
export const CLAVE_DE_FICHAS_POR_RED = 'fichas_por_red'
/** el plazo de revisión por omisión del método (supuesto de partida, en días) */
export const DIAS_DE_REVISION_DE_FICHA = 90
const TIPOS_DE_FILA = ['documentada', 'folclore', 'sin_dato']

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s))

/** lee `cadena_config.fichas_por_red` (`{ <red>: FichaDeRed }`); lo que no tenga la forma se ignora (una ficha mal escrita no es una ficha) */
export function leerFichasPorRed(config: unknown): FichaDeRed[] {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return []
  const out: FichaDeRed[] = []
  for (const [red, v] of Object.entries(config as Record<string, unknown>)) {
    const f = v as Partial<FichaDeRed> | null
    if (!f || typeof f !== 'object' || !esFecha(f.verificada_en) || !esFecha(f.revisar_antes_de) || !Array.isArray(f.filas)) continue
    const filas = f.filas.filter((x): x is FilaDeFicha => {
      const y = x as Partial<FilaDeFicha> | null
      return !!y && typeof y === 'object' && typeof y.dato === 'string' && typeof y.valor === 'string' && TIPOS_DE_FILA.includes(String(y.tipo))
    })
    out.push({ red: (typeof f.red === 'string' && f.red) || red, verificada_en: f.verificada_en, revisar_antes_de: f.revisar_antes_de, filas })
  }
  return out
}
/** ¿la ficha está vencida hoy? (llegó o pasó su fecha de revisión) */
export const fichaVencida = (f: Pick<FichaDeRed, 'revisar_antes_de'>, hoy: string): boolean => Date.parse(hoy) >= Date.parse(f.revisar_antes_de)
/** la ficha de una red, con su estado · `null` si no hay */
export function fichaDeRed(fichas: FichaDeRed[], red: string, hoy: string): { ficha: FichaDeRed; vencida: boolean } | null {
  const f = fichas.find((x) => x.red.toLowerCase() === red.toLowerCase())
  return f ? { ficha: f, vencida: fichaVencida(f, hoy) } : null
}
/** las fichas en texto para una tarea: cada fila con su tipo y fuente; una ficha vencida se MARCA (el método dice: no se confía); una red sin ficha se declara */
export function fichasEnTexto(fichas: FichaDeRed[], redes: string[], hoy: string): string {
  const out = ['# FICHAS POR RED (dato verificado; el folclore es supuesto de partida)']
  for (const red of redes) {
    const r = fichaDeRed(fichas, red, hoy)
    if (!r) { out.push(`## ${red} · SIN FICHA (no inventes la norma; usa lo conservador y dilo)`); continue }
    out.push(`## ${red} · verificada ${r.ficha.verificada_en.slice(0, 10)} · revisar antes de ${r.ficha.revisar_antes_de.slice(0, 10)}${r.vencida ? ' · VENCIDA: no confiar hasta re-verificar' : ''}`)
    for (const f of r.ficha.filas) {
      const sello = [f.tipo, f.fuente || '', f.verificada_en ? String(f.verificada_en).slice(0, 10) : ''].filter(Boolean).join(' · ')
      out.push(`- ${f.dato}: ${f.valor} [${sello}]`)
    }
  }
  return out.join('\n')
}
