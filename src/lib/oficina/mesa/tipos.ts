/**
 * LA MESA · oficina creativa fluida (28-oct, firma de Emilio). Diseño: raw/tasks/2026-10-28-PROPUESTA-CC1-oficina-creativa-fluida + REVISION-CC3 (7 condiciones).
 * Una pieza la hace un EQUIPO sobre un tablero compartido (el libro de aportes). El código ORQUESTA (turnos, gasto, quién aportó); no dicta campos, largos ni orden.
 * Este archivo: solo tipos y las cotas duras. Sin base, sin red, sin modelo.
 */

/** las familias de la mesa: nombre de la familia → tipo de pieza. Conviven con las v1 (`carrusel_ig_v1`, `kit_historias`); un encargo termina con la que lo abrió. */
export const FAMILIAS_MESA = { carrusel_mesa: 'carrusel', kit_mesa: 'kit' } as const
export type FamiliaMesa = keyof typeof FAMILIAS_MESA
export type TipoDePieza = (typeof FAMILIAS_MESA)[FamiliaMesa]
export const esFamiliaMesa = (f: string): f is FamiliaMesa => Object.prototype.hasOwnProperty.call(FAMILIAS_MESA, f)
/** la plantilla v1 cuyas funciones de código (abrir, armar, dibujar, empaquetar) reutiliza la mesa */
export const FAMILIA_V1_DE: Record<TipoDePieza, string> = { carrusel: 'carrusel_ig_v1', kit: 'kit_historias' }

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
  /** el traductor de la pieza pregunta al autor como máximo UNA vez (condición 7) */
  MAX_PREGUNTAS_DEL_TRADUCTOR: 1,
  /** cuántas veces se le devuelve la integración al director por citas que faltan */
  MAX_DEVOLUCIONES_POR_CITAS: 1,
  /** un turno muerto se reanuda como máximo esto */
  REINTENTOS_DE_TURNO: 3,
} as const

/** una tarjeta del directorio vivo (una fila de `oficina_directorio`) */
export interface Tarjeta {
  agente: string
  /** 'direccion' = quien abre, convoca e integra · 'miembro' = especialista · 'portero' = trae material del cerebro (no es turno de agente) */
  rol: 'direccion' | 'miembro' | 'portero'
  especialidad: string
  sabe_hacer: string[]
  necesita: string[]
  entrega: string[]
  /** tipos de pieza donde su aporte es OBLIGATORIO: `carrusel`, `kit`, o `carrusel:si_imagen_generada` (solo si alguna imagen se genera) */
  pertinente_en: string[]
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
  libro(encargoId: string): Promise<Aporte[]>
  aportar(a: NuevoAporte): Promise<{ ok: true; aporte: Aporte } | { ok: false; error: string }>
}

/** lo que la mesa guarda en el artefacto `mesa` del encargo */
export interface EstadoMesa {
  tipo: TipoDePieza
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
  /** el turno que está esperando respuesta */
  turno_abierto: { n: number; agente: string; tipo: 'dirigir' | 'aportar' | 'responder' | 'integrar' | 'devolver_citas' | 'traducir'; responde_a: string | null } | null
}

/** lo que decide el planificador */
export type Accion =
  | { accion: 'turno'; agente: string; tipo: 'dirigir' | 'aportar' | 'responder' | 'integrar' | 'devolver_citas'; responde_a: string | null; motivo: string }
  | { accion: 'material'; pedido_id: string; que: string; para_que: string; de: string }
  | { accion: 'traducir' }
  | { accion: 'cierre_por_tope'; razon: 'techo_de_gasto' }
  | { accion: 'seguir_a_dibujar'; motivo: string }
