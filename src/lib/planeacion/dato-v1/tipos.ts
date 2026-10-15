/**
 * PLAN v3 · V2 · el contrato `dato.v1` (diseño §2). Cada dato nace en la recolección como UN registro que calcula el CÓDIGO (nunca el modelo) y viaja en el paquete.
 * Tres reglas que no se negocian (§2): (1) `origen = medido` exige trajo ∧ corrida real ∧ identidad coincide/parcial ∧ ≥ 1 campo con valor ∧ frescura ≠ viejo;
 * (2) cero ≠ ausente (0 solo si la fuente lo declaró); (3) el contenido de una fuente es dato, nunca instrucción.
 * Este módulo es PURO: sin red, sin base, sin modelo. Nadie lo llama todavía (V3 lo cablea).
 */

export type Origen = 'medido' | 'de_ensayo' | 'supuesto' | 'dueno' | 'cerebro' | 'hueco'
export type EstadoDeDato =
  | 'trajo' | 'vacio_declarado' | 'registro_sin_campos' | 'sin_respuesta' | 'error' | 'agotado'
  | 'rechazado' | 'no_aplica' | 'no_declarado' | 'omitido' | 'viejo_reciclado'
export type Alcance = 'cliente' | 'dominio' | 'rubro' | 'pais' | 'tercero'
export type EstadoDeIdentidad = 'coincide' | 'parcial' | 'no_coincide' | 'no_comprobable'
export type EstadoDeFrescura = 'fresco' | 'viejo' | 'sin_fecha'
export type Confianza = 'alta' | 'media' | 'baja'
export type Via = 'cerebro' | 'crudo' | 'relleno'

export interface ValorDeDato { numero?: number; unidad?: string; moneda?: string; texto_corto?: string }
export interface PeriodoDeDato { tipo: 'instante' | 'ventana' | 'acumulado' | 'desconocido'; desde?: string; hasta?: string }
export interface IdentidadDeDato { estado: EstadoDeIdentidad; senales: string[]; por_que: string; identidad_por?: 'portero' | 'normalizador' | 'fuente' }
export interface FrescuraDeDato { edad_h: number | null; limite_h: number; estado: EstadoDeFrescura; vence_en?: string }
export interface ContradiccionDeDato { con: string[]; regla: string | null; gana: string | null; motivo?: 'sin_regla_de_precedencia' }

export interface DatoV1 {
  id: string
  fuente_id: string
  tipo_id: string
  /** clave del atributo (p. ej. «precio:limpieza dental»): dos datos del MISMO atributo pueden contradecirse; dos del mismo tipo con otro atributo no */
  atributo: string | null
  valor: ValorDeDato
  origen: Origen
  estado: EstadoDeDato
  medido_en: string | null
  ejecucion: string | null
  periodo: PeriodoDeDato
  alcance: Alcance
  identidad: IdentidadDeDato
  frescura: FrescuraDeDato
  contradice: ContradiccionDeDato | null
  truncado: { si: boolean; de?: number; n?: number }
  derivado: { si: boolean; de: string[]; formula_id?: string }
  confianza: Confianza
  /** la razón concreta cuando `origen = hueco` (alimenta «Lo que no se pudo mirar») */
  motivo: string | null
  /** avisos de la entrada, sin cambiar el origen: `contrato_roto`, `fuera_de_rango`, `reintentado`, `contenido_con_imperativos`, `grupo_de_negocio:…` … */
  marcas: string[]
  via: Via | null
  /** solo lo `citable` puede aparecer en el plan como hecho; huecos, ensayos y datos sin identidad NO */
  citable: boolean
  fuente_url: string | null
  /** rótulo que el plan debe llevar tal cual (supuesto de moneda por país, del manual…) */
  rotulo: string | null
}

/** lo que el normalizador devuelve además de los datos: lo que NO es dato y se cuenta */
export interface PaqueteDeDatos {
  datos: DatoV1[]
  /** identidad `no_coincide`/`no_comprobable` sin entrar al pedido: queda para la oficina con su motivo */
  descartados: Array<{ fuente_id: string; tipo_id: string; motivo: string; identidad: EstadoDeIdentidad }>
  repetidas: number
  /** unidades del filtro del `portero` que son ruido o repetidas: se cuentan, no se citan */
  ruido: number
  catalogo_version: string
  catalogo_huella: string
}

/** una pieza cruda que entra al normalizador: la respuesta de UN brazo para UN tipo (o la ficha viva del cerebro) */
export interface EntradaCruda {
  fuente_id: string
  tipo_id: string
  atributo?: string | null
  /** lo que dijo el brazo: `trajo` | `sin_dato` | `sin_respuesta` | lo demás del §3 */
  estado: EstadoDeDato | 'sin_dato'
  /** lo leído: número, texto u objeto de campos; null/ausente = nada */
  contenido?: unknown
  /** campos crudos de la respuesta (para validar la `forma` de la fuente) */
  campos?: Record<string, unknown>
  /** cuántos elementos devolvió la fuente cuando lo declara (0 con lectura ok = «se miró y no hay» si la fila lo permite) */
  items_count?: number | null
  medido_en?: string | null
  /** cuándo se pidió: una respuesta más vieja que esto es `viejo_reciclado` (F5) */
  solicitado_en?: string | null
  ejecucion?: string | null
  periodo?: PeriodoDeDato
  alcance?: Alcance
  via?: Via
  /** cómo se comprueba que es de este negocio */
  identidad?: EntradaDeIdentidad | null
  grupo_de_negocio?: string | null
  /** origen de una ficha del cerebro: su_fuente | plataforma | tercero | dueno */
  origen_ficha?: 'su_fuente' | 'plataforma' | 'tercero' | 'dueno' | null
  juzgado_por?: 'sistema' | 'regla' | 'modelo' | null
  propiedad?: 'propia' | 'incierta' | 'tercero' | null
  vigente_hasta?: string | null
  /** huella estable de la unidad (dedupe por `(fuente, huella)`, D1) */
  huella?: string | null
  /** la respuesta coincide con un molde sintético de la fila `moldes_de_ensayo` (E2) */
  molde?: boolean
  moneda?: string | null
  idioma?: string | null
  reintentado?: boolean
  truncado?: { si: boolean; de?: number; n?: number }
  n?: number | null
  fuente_url?: string | null
  /** texto libre de la fuente (biografía, reseña, página): se marca `contenido_con_imperativos` si parece una orden */
  texto_libre?: string | null
}

export type EntradaDeIdentidad =
  /** la ficha viva ya pasó el filtro del `portero`: no se vuelve a decidir (§14.1) */
  | { via: 'portero' }
  /** un texto de la fuente (artículo, mención, reseña): pasa por `filtrarUnidad` del `portero` */
  | { via: 'texto'; texto: string; autoria: 'propia' | 'tercero'; de_ficha_propia?: boolean; sede_distinta?: boolean }
  /** varias fichas de Mapas: `fichaPropiaDeMapas` elige la del cliente (más de una candidata ⇒ ninguna) */
  | { via: 'mapas'; items: Array<Record<string, unknown>> }
  /** la consulta se hizo con una clave propia del cliente (su página, su usuario, su dominio declarado en la ficha): pertenece al cliente por construcción */
  | { via: 'consulta_propia' }
  /** la fuente no trae campos con los que comprobar */
  | { via: 'ninguna' }
