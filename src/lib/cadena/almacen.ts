/**
 * ALMACÉN DE LA CADENA · la interfaz de lo que las rutas necesitan de la base (diseño v2 §3.7, §10).
 *
 * Las rutas y los manejadores (`manejadores/*.ts`) hablan SOLO con esta interfaz: la prueba usa un almacén en memoria y la ruta real,
 * `almacen-supabase.ts` (el único archivo, con las rutas, que nombra las tablas `cadena_*`). Nada de esto se usa hasta que alguien aplique la migración y encienda.
 */
import type { FormatosPorRed, Estrategia, Fila, Hallazgo, Referencia, SedeInfo } from './tipos'
import type { PlazoCfg } from './esperas'
import type { FechaEspecialVerificada } from './validador-calendario'

export type EstadoCampana = 'abierta' | 'estrategia' | 'calendario' | 'activa' | 'pausada' | 'necesita_humano' | 'cerrada' | 'reemplazada'

export interface Campana {
  id: string
  client_id: string
  plan_id: string
  fecha_inicio: string
  fecha_inicio_origen: 'regla' | 'alta' | 'emilio'
  fecha_fin: string
  zona_horaria: string
  pais: string | null
  sedes: string[]
  estado: EstadoCampana
  estado_motivo: string | null
  presupuesto_planificacion_usd: number
  ventana_parte_dias: number
  sustituir_video_por: 'ninguna' | 'carrusel' | 'foto'
  autoproducir: boolean
  sala_ref: Record<string, unknown>
  reemplaza_a: string | null
  seco: boolean
}

export interface EstrategiaGuardada {
  campana_id: string
  version: number
  estado: 'borrador' | 'validada' | 'aprobada' | 'descartada'
  contenido: Estrategia
  agente: string | null
  modelo: string | null
  costo_usd: number | null
  workflow_execution_id: string | null
  seco: boolean
}

export type EstadoCorrida = 'en_curso' | 'ok' | 'fallida' | 'vencida' | 'cerrada_por_tope'
export interface Corrida {
  id: number
  campana_id: string
  paso: string
  clave_idempotencia: string
  intento: number
  workflow_id: string
  workflow_execution_id: string
  modelo: string | null
  costo_usd: number | null
  estado: EstadoCorrida
  plazo_en: string | null
  error: string | null
  revision_editor: 'saltada_por_diseno' | 'conservada' | null
  salida_estructurada: boolean
  esquema_hash: string | null
  seco: boolean
}

export interface EsperaFila {
  id: number
  campana_id: string
  objeto_tipo: string
  objeto_id: string
  motivo: string | null
  desde: string
  recordatorio_en: string | null
  alerta_en: string | null
  vence_en: string
  estado: 'viva' | 'resuelta' | 'vencida' | 'cancelada'
  rung_enviado: number
  dedup_key: string
  accion_al_vencer: string
  seco: boolean
}

/** Lo que el flujo necesita saber del cliente para validar: lo arma el almacén real desde la base; el validador no lee la base. */
export interface ContextoDelCliente {
  clientId: string
  nombreDelNegocio: string
  pais: string | null
  zonaHoraria: string
  planTexto: string
  manualTexto: string
  forbiddenWords: string[]
  sedes: SedeInfo[]
  referencias: Referencia[]
  /** la fecha en que se guardó el plan (para la fecha de inicio por regla) */
  fechaDelPlan: string
}

export interface FechaCobertura { pais: string; tipo: string; ambito_clave: string; anio: number; estado: 'verificada' | 'sin_fuente' | 'en_curso'; intentos: number }

export interface Almacen {
  // configuración y datos de ajuste
  leerConfig(clave: string): Promise<unknown>
  escribirConfig(clave: string, valor: unknown): Promise<void>
  plazos(): Promise<PlazoCfg[]>
  formatos(): Promise<FormatosPorRed>
  // contexto del cliente (lecturas)
  cargarContexto(clientId: string, planId: string): Promise<ContextoDelCliente | null>
  /** el plan existe, es de este cliente y es del tipo plan de 90 días; sin `planId` devuelve el último del cliente */
  resolverPlan(clientId: string, planId: string | null): Promise<{ plan_id: string; fecha: string } | null>
  /** el viaje de la sala existe para este cliente (condición de `workflow_id` válido) */
  journeyExiste(journeyId: string, clientId: string): Promise<boolean>
  // campañas
  campana(id: string): Promise<Campana | null>
  campanaPorPlan(clientId: string, planId: string, seco: boolean): Promise<Campana | null>
  campanaViva(clientId: string, seco: boolean): Promise<Campana | null>
  insertarCampana(c: Omit<Campana, 'id'>): Promise<Campana>
  actualizarCampana(id: string, patch: Partial<Campana>): Promise<Campana>
  campanasEnEspera(): Promise<Campana[]>
  campanasActivas(): Promise<Campana[]>
  // estrategias
  ultimaEstrategia(campanaId: string): Promise<EstrategiaGuardada | null>
  insertarEstrategia(e: EstrategiaGuardada): Promise<void>
  // filas
  filas(campanaId: string, calendarioVersion?: number): Promise<Fila[]>
  guardarFilas(campanaId: string, calendarioVersion: number, estrategiaVersion: number, filas: Fila[], seco: boolean): Promise<void>
  cambiarEstadoDeFilas(campanaId: string, calendarioVersion: number, ids: string[], estado: Fila['estado']): Promise<void>
  ultimaVersionDeCalendario(campanaId: string): Promise<number>
  // validaciones
  guardarValidaciones(campanaId: string, objeto: 'estrategia' | 'calendario' | 'brief', version: number, tanda: number | null, intento: 1 | 2, hallazgos: Hallazgo[], seco: boolean): Promise<void>
  // corridas (guardarraíles 1–5)
  corridaPorClave(campanaId: string, paso: string, clave: string, intento: number): Promise<Corrida | null>
  /** idempotente: si ya existe devuelve la existente con `creada: false` */
  abrirCorrida(c: Omit<Corrida, 'id'>): Promise<{ corrida: Corrida; creada: boolean }>
  cerrarCorrida(id: number, patch: Partial<Corrida>): Promise<void>
  corridasDeCampana(campanaId: string): Promise<Corrida[]>
  corridasEnCurso(): Promise<Corrida[]>
  // esperas
  /** idempotente por `dedup_key` */
  abrirEspera(e: Omit<EsperaFila, 'id'>): Promise<{ espera: EsperaFila; creada: boolean }>
  esperasVivas(): Promise<EsperaFila[]>
  actualizarEspera(id: number, patch: Partial<EsperaFila>): Promise<void>
  /** estado del brazo ejecutor en la sala (lo lee el almacén de recados de la sala): el de `video` está por_configurar hasta que alguien lo construya */
  estadoDelBrazo(destino: string): Promise<'opera' | 'por_configurar' | 'no_existe' | null>
  // fechas especiales
  coberturaDe(pais: string, tipo: string, ambitoClave: string, anio: number): Promise<FechaCobertura | null>
  guardarCobertura(c: FechaCobertura): Promise<void>
  fechasEspeciales(pais: string, tipos: string[], desde: string, hasta: string): Promise<FechaEspecialVerificada[]>
  guardarFechaEspecial(f: { pais: string; tipo: string; ambito: string; anio: number; fecha: string; nombre: string; alcance: string; fuente_url: string; cita_literal: string; pagina_hash: string; doble_fuente: boolean; estado: 'verificada' | 'pendiente' }): Promise<void>
}
