/**
 * F8 · LOS PUERTOS de la conversación (CC#1 · 14-oct): todo lo que toca el mundo entra por aquí, así el orquestador se prueba con modelo y Slack SIMULADOS (US$ 0, 0 envíos).
 * Los adaptadores reales (base, `run-sdk`, Slack) viven aparte y NO se encienden: la conversación nace apagada (`finanzas_config.conversa = 'apagado'` → 409).
 */
import type { Estado } from '../../oficina/tipos'
import type { LecturaDeHilo } from '../hilo-slack'
import type { ConfigDeFinanzas, PuertosDeTablero } from '../ruta'
import type { DatoConProcedencia } from './esquemas'

export type EstadoDeEncargo = 'abierto' | 'en_curso' | 'cerrado' | 'sin_acuerdo' | 'cierre_por_tope' | 'fallido'
export const ESTADOS_TERMINALES: readonly EstadoDeEncargo[] = ['cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido']

/** lo que el plan (o quien despierta la conversación) entrega al abrir: SOLO datos del cliente y del expediente; ningún nombre concreto vive en el código */
export interface Semilla {
  rubro?: string | null
  pais?: string | null
  moneda?: string | null
  /** días y horarios de la ficha; zonas de la ficha */
  dias_activos_por_semana?: number
  zonas?: string[]
  evento?: string
  /** resúmenes ya acotados (el pedido de cada agente NO lleva el expediente entero) */
  ficha_resumen?: string
  manual_resumen?: string
  brazos_resumen?: string
  derivado?: unknown
  /** datos con su procedencia: un dato de ensayo NUNCA entra como medido */
  datos?: DatoConProcedencia[]
  referencias?: Array<{ canal: string; evento: string; min: number; max: number; base?: number; tipo: 'dato' | 'supuesto'; fuente: string; fecha?: string }>
  evento_alterno?: Record<string, string | null>
  pisos?: Record<string, number | null | undefined>
  /** la corrida que armó el expediente fue de ENSAYO (`dry_run` declarado): ningún dato «medido» de ella vale como medido */
  corrida_es_de_ensayo?: boolean
  fecha?: string
}

export interface EncargoDeConversa {
  id: string
  client_id: string
  estado: EstadoDeEncargo
  estado_del_motor: Estado
  gasto_usd: number
  slack_canal: string | null
  slack_ts: string | null
  leido_hasta: string | null
  tablero_id: string | null
  dry_run: boolean
  semilla: Semilla
}

export interface TurnoDeConversa {
  n: number
  paso: string
  agente: string | null
  ronda: number
  estado: 'hecho' | 'fallo'
  costo_usd: number
  salida: unknown
  error?: string | null
}

export interface ArtefactoGuardado { tipo: string; version: number; contenido: Record<string, unknown>; sha256: string }

export interface CambiosDeEncargo {
  encargo_id: string
  estado_del_motor: Estado
  gasto_usd: number
  estado?: EstadoDeEncargo
  slack_canal?: string | null
  slack_ts?: string | null
  leido_hasta?: string | null
  tablero_id?: string | null
  turno?: TurnoDeConversa
  artefacto?: ArtefactoGuardado
}

export interface AlmacenDeConversa {
  /** crea el encargo del cliente; si ya hay uno ABIERTO del mismo cliente devuelve ese (`nuevo: false`): una sola conversación por cliente */
  crearEncargo(n: { client_id: string; dry_run: boolean; semilla: Semilla }): Promise<{ ok: true; encargo: EncargoDeConversa; nuevo: boolean } | { ok: false; error: string }>
  leerEncargo(id: string): Promise<EncargoDeConversa | null>
  guardar(c: CambiosDeEncargo): Promise<void>
  /** los artefactos vigentes del encargo (por tipo) */
  artefactos(encargo_id: string): Promise<Record<string, Record<string, unknown>>>
  turnos(encargo_id: string): Promise<TurnoDeConversa[]>
}

export type RespuestaDeModelo = { ok: true; salida: unknown; costo_usd: number } | { ok: false; error: string; costo_usd: number }
export interface PedidoAlModelo {
  agente: string
  tarea: string
  encargo_id: string
  client_id: string
  paso: string
  tope_usd: number
  dry_run: boolean
}
export interface ModeloPuerto { invocar(p: PedidoAlModelo): Promise<RespuestaDeModelo> }

export interface SlackPuerto {
  /** NUNCA lanza: un fallo de Slack no frena la conversación */
  publicar(p: { canal: string; thread_ts: string | null; texto: string }): Promise<{ ok: boolean; ts?: string }>
  leer(p: { canal: string; thread_ts: string; desde_ts: string | null }): Promise<LecturaDeHilo>
}

export interface PuertosDeConversa {
  almacen: AlmacenDeConversa
  modelo: ModeloPuerto
  slack: SlackPuerto
  tableros: Pick<PuertosDeTablero, 'guardarTablero' | 'actualizarTablero' | 'invocacionDelJefe'>
  config(): Promise<ConfigDeFinanzas>
  ahora(): Date
  /** canal privado de la oficina (id): nunca se crea desde aquí */
  canalDelHilo: string
  /** el usuario de Emilio, el único que cuenta como respuesta o nota del dueño */
  emilio_id: string
}
