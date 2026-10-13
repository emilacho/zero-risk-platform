/**
 * PUERTOS DE LA JEFATURA (oficina propia) · todo lo que toca el mundo (base, GPT, Slack) entra por aquí, así el orquestador se prueba con modelo simulado y sin red (diseño v4 §1, molde de la `oficina`).
 * Los adaptadores reales (Supabase, revisor, Slack) viven aparte (J3) y NO se encienden: la jefatura nace apagada.
 */
import type { Estado, Ficha, ResultadoDelRevisor } from '../../revision-comun'
import type { DevolverA, Marcas, PayloadDeRevision, Productor, Resultado, TipoDeRevision } from './contrato'
import type { PoliticaDeRevision } from './politicas'

export interface ConfigDeJefatura { estado: 'apagada' | 'ensayo' | 'encendida'; tipos_activos: string[]; clientes_ensayo: string[] }
/** sin config legible, apagada (falla CERRADO) */
export const CONFIG_APAGADA: ConfigDeJefatura = { estado: 'apagada', tipos_activos: [], clientes_ensayo: [] }

export type EstadoDeRevision = 'abierta' | 'en_paso' | 'cerrada' | 'cerrada_por_tope' | 'fallida'
export const ESTADOS_TERMINALES: readonly EstadoDeRevision[] = ['cerrada', 'cerrada_por_tope', 'fallida']

export interface Revision {
  id: string
  client_id: string
  artifact_type: TipoDeRevision
  artifact_id: string
  version: number
  journey_id: string | null
  estado: EstadoDeRevision
  resultado: Resultado | null
  marcas: Marcas
  estado_del_motor: Estado
  productores: Productor[]
  entrada: PayloadDeRevision
  devolver_a: DevolverA | null
  /** la política con la que se abrió (M1 `policy_snapshot`): una revisión no cambia de reglas a mitad de camino */
  policy: PoliticaDeRevision
  tope_usd: number
  gasto_usd: number
  dry_run: boolean
  prueba: boolean
}

export interface NuevaRevision {
  client_id: string; artifact_type: TipoDeRevision; artifact_id: string; version: number; journey_id: string | null
  productores: Productor[]; entrada: PayloadDeRevision; devolver_a: DevolverA | null; policy: PoliticaDeRevision
  tope_usd: number; dry_run: boolean; prueba: boolean; estado_del_motor: Estado
}

export interface PasoRegistrado {
  n: number
  paso: string
  intento: number
  tipo: 'codigo' | 'agente' | 'externo'
  agente: string | null
  estado: 'pendiente' | 'corriendo' | 'hecho' | 'fallo' | 'muerto'
  dispatch_key: string | null
  workflow_execution_id?: string | null
  concepto: 'modelo' | 'revisor_externo' | 'portero'
  base: 'usage' | 'estimado'
  cost_usd: number
  tokens_in?: number | null
  tokens_out?: number | null
  error?: string | null
  /** la traza M1 (`metadata.jefatura`): role, review_id, nominal_agent, effective_model, contra_que_ref… */
  traza?: Record<string, unknown>
}

export interface CambiosDeRevision {
  revision_id: string
  estado_del_motor: Estado
  gasto_usd: number
  estado?: EstadoDeRevision
  resultado?: Resultado
  marcas?: Marcas
  paso?: PasoRegistrado
  fichas?: Ficha[]
}

export type LecturaDePolitica = { ok: true; politica: PoliticaDeRevision; activa: boolean } | { ok: false; error: string; existe: boolean }

export interface Almacen {
  leerConfig(): Promise<ConfigDeJefatura>
  /** la política del tipo (ya validada) y si su renglón está activo */
  leerPolitica(tipo: TipoDeRevision): Promise<LecturaDePolitica>
  crearRevision(n: NuevaRevision): Promise<{ ok: true; revision: Revision; nuevo: boolean } | { ok: false; error: string }>
  leerRevision(id: string): Promise<Revision | null>
  /** el paso que espera respuesta (estado corriendo), si hay uno */
  pasoAbierto(revisionId: string): Promise<PasoRegistrado | null>
  /** pasos en «corriendo» desde antes de `iso` (para el vigía) */
  pasosCorriendoAntesDe(iso: string): Promise<Array<{ revision_id: string; n: number; paso: string }>>
  guardar(c: CambiosDeRevision): Promise<void>
}

export interface Puertos {
  almacen: Almacen
  ahora(): Date
  /** el revisor ciego (otro proveedor); en `dry_run` el orquestador NO lo llama (usa la simulación) */
  revisor(p: { texto: string; imagenes_urls: string[]; dry_run: boolean }): Promise<ResultadoDelRevisor>
  /** UN aviso agregado a #alertas por revisión; NUNCA lanza (un fallo de Slack no frena una revisión) */
  avisar(p: { canal: 'alertas'; revision_id: string; texto: string; dry_run: boolean }): Promise<void>
}
