import type { FaltanCitas } from './libro'
/**
 * LA MESA · oficina creativa fluida (28-oct, firma de Emilio). Diseño: raw/tasks/2026-10-28-PROPUESTA-CC1-oficina-creativa-fluida + REVISION-CC3 (7 condiciones).
 * Una pieza la hace un EQUIPO sobre un tablero compartido (el libro de aportes). El código ORQUESTA (turnos, gasto, quién aportó); no dicta campos, largos ni orden.
 * Este archivo: solo tipos y las cotas duras. Sin base, sin red, sin modelo.
 */

/** las familias de la mesa: nombre de la familia → tipo de pieza. Conviven con las v1 (`carrusel_ig_v1`, `kit_historias`); un encargo termina con la que lo abrió. */
/** 31-oct · nuevo orden de la cadena: `brief_mesa` (el brief creativo de la campaña) y `concepto_mesa` (la gran idea, capítulos y banco) son mesas de la CADENA: sin imágenes, sin traductor, sin jefatura propia; la entrega va a la cadena, no a la bandeja */
/** 10-nov · `reubicacion_mesa` (GO de Lenovo 18:14Z · camino A): las filas del calendario que quedaron atrás sin producir; la dirige jefe-marketing, sin miembros ni portero; entrega a la cadena */
/** 11-nov · `fallidos_mesa` (GO de Lenovo 16:46 Zúrich): revisa los encargos fallidos que ya gastaron contra los arreglos publicados después; la dirige jefe-marketing, sin miembros ni portero; entrega a la cadena */
/** 17-nov · `banco_mesa` (GO de Lenovo · cambio 4): la mesa de la gran idea responde, como creadora, a UNA corrección de la jefatura sobre una idea del banco; la dirige creative-director-mesa, sin miembros ni portero; entrega a la cadena */
/** T8 · 31-oct · `video_mesa` (parte 2 del brazo de video, sobre la hoja): la mesa escribe el GUION y el brazo lo filma */
/** 17-nov · `post_mesa` («creativos en cada paso», tramo B): la foto con su mesa corta; la cola mecánica es la de la sala 1 (`post_img`) */
export const FAMILIAS_MESA = { carrusel_mesa: 'carrusel', kit_mesa: 'kit', post_mesa: 'post', brief_mesa: 'brief', concepto_mesa: 'concepto', video_mesa: 'video', reubicacion_mesa: 'reubicacion', fallidos_mesa: 'fallidos', banco_mesa: 'banco' } as const
export type FamiliaMesa = keyof typeof FAMILIAS_MESA
export type TipoDePieza = (typeof FAMILIAS_MESA)[FamiliaMesa]
export const esFamiliaMesa = (f: string): f is FamiliaMesa => Object.prototype.hasOwnProperty.call(FAMILIAS_MESA, f)
/** la plantilla v1 cuyas funciones de código (abrir, armar, dibujar, empaquetar) reutiliza la mesa (el video no tiene v1: sus funciones son propias, `orquestador-video.ts`) */
export const FAMILIA_V1_DE: Record<Exclude<TipoDePieza, 'brief' | 'concepto' | 'reubicacion' | 'fallidos' | 'banco'>, string> = { carrusel: 'carrusel_ig_v1', kit: 'kit_historias', video: 'video_mesa', post: 'post_img' }
/** las mesas que entrega la CADENA (no hay pieza: ni imágenes, ni traductor, ni jefatura propia, ni bandeja) */
export const TIPOS_DE_LA_CADENA = ['brief', 'concepto', 'reubicacion', 'fallidos', 'banco'] as const
export const esDeLaCadena = (tipo: string): tipo is (typeof TIPOS_DE_LA_CADENA)[number] => (TIPOS_DE_LA_CADENA as readonly string[]).includes(tipo)

/** las cotas del bucle (guardarraíles de bucle coherente): nada de la mesa es indefinido */
export const COTAS = {
  /** turnos de agente por encargo */
  MAX_TURNOS: 24,
  /** idas y vueltas por pareja (A→B, B→A cuentan una cada una): pasado esto, decide la dirección creativa con lo que hay */
  MAX_IDAS_VUELTAS_POR_PAREJA: 4,
  /** un pedido nacido de otro pedido: profundidad máxima */
  MAX_PROFUNDIDAD: 2,
  /** techo absoluto = tope de la pieza × esto (condición 6): «cierra con lo que hay» no puede seguir gastando */
  TECHO_SOBRE_TOPE: 1.2,
  /** lo que se reserva por turno de agente (US$) */
  RESERVA_POR_TURNO_USD: 0.6,
  /**
   * lo que viene DESPUÉS de la mesa: imagen + observador (≈ 0,2) y la REVISIÓN de la jefatura, que tiene su propio tope (US$ 1,50 por revisión desde el 29-oct, P5 del encargo de correcciones) más un margen.
   * La mesa lo reserva antes de seguir conversando (bloqueante 2 de CC#3): así la jefatura nunca se queda sin dinero dentro del tope de la pieza y no termina «incompleta por tope».
   */
  RESERVA_DE_LO_QUE_SIGUE_CON_IMAGEN_USD: 2.0,
  RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD: 1.7,
  /** el VIDEO (parte 2 · 31-oct): lo que viene después de la mesa es el brazo (hasta US$ 5 por video, con descuento ≈ 2,6) más la revisión de la jefatura (1,5): la mesa lo reserva antes de seguir conversando */
  RESERVA_DE_LO_QUE_SIGUE_VIDEO_USD: 6.5,
  /** el traductor de la pieza pregunta al autor como máximo UNA vez (condición 7) */
  MAX_PREGUNTAS_DEL_TRADUCTOR: 1,
  /** cuántas veces se le devuelve la integración al director por citas que faltan */
  MAX_DEVOLUCIONES_POR_CITAS: 1,
  /** un turno muerto se reanuda como máximo esto */
  REINTENTOS_DE_TURNO: 3,
} as const

/**
 * 18-nov · T7d (encargo de Lenovo, arreglo 1 · regla de Emilio: los límites técnicos al máximo sin preguntar). En la mesa de la GRAN IDEA (`concepto`) los conteos no son el freno.
 * El director anotó 6 pedidos, el máximo por agente, y en su última integración el sistema le contestó con el tope. El freno de esa mesa es el DINERO: el tope de la pieza (10),
 * la reserva por turno y el techo ×1,2 (`cotaAgotada` y `siguienteDeLaMesa`). Por eso los conteos suben a un valor que el dinero alcanza antes:
 *  · 12 pedidos por agente: uno a cada especialista del equipo de la gran idea;
 *  · profundidad 4: igual a las idas y vueltas por pareja (más profundidad no se puede usar);
 *  · 48 turnos: con lo que reserva cada turno (0,60) y el tope de 10, el dinero corta mucho antes.
 * Las demás mesas siguen con `COTAS`.
 */
export const COTAS_DE_LA_GRAN_IDEA = { MAX_PEDIDOS_POR_AGENTE: 12, MAX_PROFUNDIDAD: 4, MAX_TURNOS: 48 } as const
export const profundidadMaximaDe = (tipo: TipoDePieza | undefined): number => (tipo === 'concepto' ? COTAS_DE_LA_GRAN_IDEA.MAX_PROFUNDIDAD : COTAS.MAX_PROFUNDIDAD)
export const turnosMaximosDe = (tipo: TipoDePieza | undefined): number => (tipo === 'concepto' ? COTAS_DE_LA_GRAN_IDEA.MAX_TURNOS : COTAS.MAX_TURNOS)

/** los 6 equipos del departamento de marketing (MAPA 01-nov · firma 01-nov 00:11Z) · claves estables de `oficina_equipos` (las mismas que usa el tablero) */
export const CLAVES_DE_EQUIPO = ['direccion', 'estrategia', 'creativo', 'web', 'medios', 'relaciones'] as const
export type ClaveDeEquipo = (typeof CLAVES_DE_EQUIPO)[number]
export const esClaveDeEquipo = (x: unknown): x is ClaveDeEquipo => typeof x === 'string' && (CLAVES_DE_EQUIPO as readonly string[]).includes(x)

/** una tarjeta del directorio vivo (una fila de `oficina_directorio`) */
export interface Tarjeta {
  agente: string
  /** 'direccion' = quien abre, convoca e integra · 'miembro' = especialista · 'portero' = trae material del cerebro (no es turno de agente) */
  rol: 'direccion' | 'miembro' | 'portero'
  especialidad: string
  sabe_hacer: string[]
  necesita: string[]
  entrega: string[]
  /** tipos de pieza donde su aporte es OBLIGATORIO: `carrusel`, `kit`, `video`, o `carrusel:si_imagen_generada` (solo si alguna imagen se genera) */
  pertinente_en: string[]
  /** T6 (31-oct): la indicación obligatoria de este agente en la mesa (dato de la fila): va con el pedido de cada turno, NUNCA dentro de su identidad. Ausente = sin indicación */
  indicacion?: string[]
  /** 01-nov · el equipo del departamento al que pertenece (agrupación, no mesa: las mesas son sesiones) · null = proveedor fuera del departamento (el portero) · ausente = fila leída sin la columna */
  equipo?: ClaveDeEquipo | null
  activo: boolean
  version: number
}

export type TipoDeAporte = 'dirige' | 'pide' | 'devuelve' | 'aporta' | 'responde' | 'integra' | 'material' | 'nota'
export const TIPOS_DE_APORTE: readonly TipoDeAporte[] = ['dirige', 'pide', 'devuelve', 'aporta', 'responde', 'integra', 'material', 'nota']

/** una fila del libro de aportes (solo se agrega, nunca se edita) */
export interface Aporte {
  id: string
  encargo_id: string
  n: number
  de: string
  /** a quién va (pedido/devolución/respuesta); null = al tablero */
  para: string | null
  tipo: TipoDeAporte
  texto: string
  /** ids de aportes que cita (la integración cita lo que usó y lo que descartó) */
  refs: string[]
  /** el pedido (o devolución) al que contesta */
  responde_a: string | null
  profundidad: number
  costo_usd: number
  workflow_execution_id: string | null
  creado_en: string
}
export type NuevoAporte = Omit<Aporte, 'id' | 'n' | 'creado_en'>

export interface PuertoMesa {
  /** las tarjetas ACTIVAS del directorio (vivo: agregar un agente es insertar una fila) */
  directorio(): Promise<Tarjeta[]>
  /** T6: lectura de una llave de `cadena_config` (`metodos`, `fichas_por_red`) · opcional: sin puerto o con error, el turno sigue sin método (leer un método nunca frena una pieza) */
  configDeLaCadena?(clave: string): Promise<unknown>
  /** Sprint 2 · S2-2: la biblioteca de planos y los ritmos del video (filas activas) y el rubro del cliente · opcional: sin puerto o con error, el turno sigue sin la sección */
  bibliotecaDeVideo?(clientId: string): Promise<{ fichas: unknown[]; ritmos: unknown[]; industria: string | null }>
  /** Sprint 2 · S2-6: los reels de afuera del cliente (competencia y referencia) con su tendencia y sus momentos etiquetados, en crudo · opcional: sin puerto o con error, el turno sigue sin la sección */
  referenciasDeVideo?(clientId: string): Promise<{ videos: unknown[]; tendencias: unknown[]; capturas: unknown[] }>
  libro(encargoId: string): Promise<Aporte[]>
  aportar(a: NuevoAporte): Promise<{ ok: true; aporte: Aporte } | { ok: false; error: string }>
}

/** una nota del aprendizaje del dueño tal como la entrega el cerebro (`GET /api/brain/consultar?clase=aprendizaje_del_dueno`), reducida a lo que el especialista lee */
export interface NotaLeida { id: string; nota: string; direccion: string; alcance: string }
/** lo que se leyó del cerebro para un turno: las notas (puede no haber), a quién iban dirigidas y, si algo falló o el cerebro avisó, el motivo (la lectura nunca frena el turno) */
export interface LecturaDeNotas { notas: NotaLeida[]; destinatario: string | null; aviso?: string }

/** lo que la mesa guarda en el artefacto `mesa` del encargo */
export interface EstadoMesa {
  tipo: TipoDePieza
  /** condiciones del directorio que la CADENA declara al abrir una mesa suya (p. ej. `si_instagram`, `si_video`): una tarjeta con `<tipo>:<condición>` solo es pertinente si la condición está aquí */
  condiciones?: string[]
  /** congelada al abrir (REVISION-CC3: un cambio de pertinencia no mueve la meta de una pieza en vuelo) */
  directorio_congelado: Tarjeta[]
  direccion: string
  /** turnos de agente hechos */
  turnos: number
  /** cuántas veces integró la dirección y cuántas veces se le devolvió por citas */
  integraciones: number
  devoluciones_por_citas: number
  /** cuántos aportes había en el libro cuando la dirección integró por última vez */
  libro_visto: number
  /** el traductor ya hizo su pregunta (máx. 1) */
  preguntas_del_traductor: number
  /** ids de aportes ya contestados por una pregunta del traductor, etc. — marcas libres */
  marcas: Record<string, number | string | boolean>
  /** fase del cierre: la pieza se traduce, se dibuja, se evidencia, va a la jefatura */
  fase: 'trabajando' | 'traducida' | 'dibujada' | 'jefatura' | 'cerrada'
  /** «cierra con lo que hay»: se agotó un tope; la dirección entrega ya */
  cierre_forzado: string | null
  /** la pieza completa que entregó la dirección (texto libre) */
  pieza_texto: string | null
  /** el tablero (aportes, citas y lo que el código comprobó) que viaja a la jefatura para que juzgue si cada aporte fue real; lo escribe `cerrarLaMesa` */
  tablero_para_la_jefatura?: string
  /** cambio 4 · firma de Emilio · las líneas «RESPUESTA A LA JEFATURA S<n>: …» con que la dirección respondió las correcciones de la vuelta (fuera de la pieza) */
  respuestas_a_la_jefatura?: string[]
  /** el turno que está esperando respuesta */
  /** Sprint 2 · S2-1 · solo video: la duración y las propuestas que dice la plantilla, congeladas al abrir (un cambio de la plantilla no mueve la meta de una pieza en vuelo) */
  video?: import('./pedidos').ParametrosDelVideo
  /** 17-nov · propuestas también en IMAGEN · solo kit, carrusel y foto: cuántas propuestas presenta la mesa (`limites.propuestas`), congelado al abrir; ausente = una pieza, como hoy */
  imagen?: { propuestas: number }
  /** 19-nov · la tanda B (`un-autor.ts`): la mesa trabaja con UN autor y revisores (dato `limites.modo_de_la_mesa`), congelado al abrir; ausente = la mesa de siempre */
  modo?: import('./un-autor').ModoDeLaMesa
  /** 17-nov · GO Lenovo (encendido de imagen) · lo que costaron los turnos de agente de esta mesa, en todas sus pasadas (la cota de la mesa se mide contra esto) */
  gasto_de_los_turnos_usd?: number
  turno_abierto: { n: number; agente: string; tipo: 'dirigir' | 'aportar' | 'responder' | 'integrar' | 'devolver_citas' | 'rellenar_banco' | 'redactar_prompts' | 'criticar' | 'traducir'; responde_a: string | null; /** lo que el cerebro entregó a este agente al abrirse el turno (se consulta UNA vez: la reentrega del turno muestra lo mismo) */ notas_del_dueno?: LecturaDeNotas; /** 18-nov · `devolver_citas`: lo que el código comprobó que falta (el director escribe solo esas líneas) */ faltan_citas?: FaltanCitas } | null
}

/** lo que decide el planificador */
export type Accion =
  | { accion: 'turno'; agente: string; tipo: 'dirigir' | 'aportar' | 'responder' | 'integrar' | 'devolver_citas' | 'rellenar_banco' | 'redactar_prompts' | 'criticar'; responde_a: string | null; motivo: string; faltan_citas?: FaltanCitas }
  | { accion: 'material'; pedido_id: string; que: string; para_que: string; de: string }
  | { accion: 'traducir' }
  | { accion: 'cierre_por_tope'; razon: 'techo_de_gasto' }
  | { accion: 'seguir_a_dibujar'; motivo: string }
