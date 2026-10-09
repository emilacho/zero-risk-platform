/**
 * PUERTOS DEL ORQUESTADOR · todo lo que toca el mundo (base, modelos, imágenes, bandeja, Slack) entra por aquí, así el orquestador se prueba con modelo simulado y sin red.
 * Los adaptadores reales (Supabase, imágenes, bandeja, Slack, revisor externo) viven aparte y NO se encienden: la oficina nace apagada.
 */
import type { FuentesDelCliente } from './chequeos'
import type { FotoEtiquetada } from './fotos'
import type { PropiosDelCliente } from './reglas-de-imagen'
import type { ConfigDeOficina } from './sobre'
import type { Estado, Ficha, Plantilla } from './tipos'
import type { FilaDeFormato } from './entrega'

/** lo que el cliente tiene (manual, fotos, datos propios), leído UNA vez al abrir y guardado en el encargo */
export interface FuentesCompletas {
  cliente_nombre: string
  manual_texto: string
  plan_texto: string | null
  fuentes: FuentesDelCliente
  propios: PropiosDelCliente
  fotos: FotoEtiquetada[]
  /** fotos ya usadas: id → ISO */
  usos: Record<string, string>
  /** vocabulario de productos del cliente (lo que muestran sus fotos), para saber qué protagoniza un brief */
  vocabulario_de_productos: string[]
  zona: string | null
}

export interface Encargo {
  id: string
  client_id: string
  parte_id: string
  brief_id: string
  tipo_de_grupo: string
  familia: string
  version_encargo: number
  estado: 'abierto' | 'en_paso' | 'cerrado' | 'cerrado_por_tope' | 'fallido'
  estado_del_motor: Estado
  con_desacuerdo: boolean
  imagen_generada: boolean
  tope_usd: number
  gasto_usd: number
  dry_run: boolean
  prueba: boolean
  sala_ref: Record<string, unknown> | null
  salida_output_id: string | null
  hitl_queue_id: string | null
}
export interface NuevoEncargo { client_id: string; parte_id: string; brief_id: string; tipo_de_grupo: string; familia: string; tope_usd: number; dry_run: boolean; prueba: boolean; sala_ref: Record<string, unknown> | null; estado_del_motor: Estado }

export interface TurnoRegistrado {
  n: number; paso: string; tipo: string; agente: string | null
  estado: 'pendiente' | 'corriendo' | 'hecho' | 'fallo' | 'muerto'
  dispatch_key: string | null; workflow_execution_id?: string | null
  cost_usd: number; tokens_in?: number | null; tokens_out?: number | null; error?: string | null
}
export interface Cambios {
  encargo_id: string
  estado_del_motor: Estado
  gasto_usd: number
  estado?: Encargo['estado']
  con_desacuerdo?: boolean
  imagen_generada?: boolean
  salida_output_id?: string | null
  hitl_queue_id?: string | null
  turno?: TurnoRegistrado
  artefacto?: { tipo: string; version: number; contenido: Record<string, unknown>; sha256: string; autor: string | null }
  fichas?: Ficha[]
  gastos?: Array<{ concepto: 'modelo' | 'revisor_externo' | 'imagen' | 'portero'; ref_tabla: string | null; ref_id: string | null; cost_usd: number; base: 'usage' | 'estimado' }>
  usos_de_fotos?: Array<{ foto_id: string; rol: string | null }>
}

export interface Almacen {
  leerConfig(): Promise<ConfigDeOficina>
  /** la plantilla de una familia y si está activa */
  leerPlantilla(familia: string): Promise<{ plantilla: Plantilla; activo: boolean } | null>
  leerFormato(red: string, formato: string): Promise<FilaDeFormato | null>
  crearEncargo(n: NuevoEncargo): Promise<{ ok: true; encargo: Encargo; nuevo: boolean } | { ok: false; error: string }>
  leerEncargo(id: string): Promise<Encargo | null>
  /** el turno que está esperando respuesta (estado corriendo), si hay uno */
  turnoAbierto(encargoId: string): Promise<TurnoRegistrado | null>
  guardar(c: Cambios): Promise<void>
}

export type ResultadoImagen = { ok: true; url: string; generation_id: string; costo_usd: number } | { ok: false; error: string }
export type ResultadoRevisor = { ok: true; texto: string; costo_usd: number; modelo: string } | { ok: false; error: string }

export interface Puertos {
  almacen: Almacen
  ahora(): Date
  fuentes(clientId: string): Promise<FuentesCompletas | { error: string }>
  parte(parteId: string, clientId: string): Promise<{ texto: string } | null>
  /** genera UNA imagen (1024×1024, calidad explícita); en dry_run NO llama al proveedor */
  imagen(p: { prompt: string; client_id: string; encargo_id: string; dry_run: boolean }): Promise<ResultadoImagen>
  /** el revisor ciego (otro proveedor); en dry_run NO llama al proveedor */
  revisor(p: { pedido: Record<string, unknown>; dry_run: boolean; imagen_url?: string | null }): Promise<ResultadoRevisor>
  descargar(url: string): Promise<Buffer | null>
  guardarArchivos(ruta: string, archivos: Array<{ nombre: string; bytes: Buffer; tipo: string }>): Promise<{ ok: true; urls: Record<string, string> } | { ok: false; error: string }>
  /** salida `draft` en client_historical_outputs; NO se llama en dry_run */
  salida(p: { client_id: string; titulo: string; contenido: Record<string, unknown>; metadata: Record<string, unknown> }): Promise<{ ok: true; output_id: string } | { ok: false; error: string }>
  /** fila de la bandeja con `output_id` y `expires_at`; NO se llama en dry_run */
  bandeja(p: { client_id: string; output_id: string; titulo: string; vista_previa: string; metadata: Record<string, unknown>; expires_at: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  /** hilo de #oficina-creativa o aviso a #alertas; NUNCA lanza (un fallo de Slack no frena un encargo) */
  avisar(p: { canal: 'hilo' | 'alertas'; encargo_id: string; texto: string; dry_run: boolean }): Promise<void>
}
