/**
 * PUERTOS DEL ORQUESTADOR · todo lo que toca el mundo (base, modelos, imágenes, bandeja, Slack) entra por aquí, así el orquestador se prueba con modelo simulado y sin red.
 * Los adaptadores reales (Supabase, imágenes, bandeja, Slack, revisor externo) viven aparte y NO se encienden: la oficina nace apagada.
 */
import type { FuentesDelCliente } from './chequeos'
import type { FotoEtiquetada } from './fotos'
import type { PropiosDelCliente } from './reglas-de-imagen'
import type { CambiosDelDueno } from './cambios-del-dueno'
import type { ConfigDeOficina } from './sobre'
import type { Estado, Ficha, Plantilla } from './tipos'
import type { FilaDeFormato } from './entrega'
import type { SalidaDeRevision } from '../jefatura/revision/contrato'
import type { SobreDeRevisionDePieza } from './paso-jefatura'
import type { NotaVista } from '../notas-del-dueno/autorevision'
import type { NotaLeida, PuertoMesa } from './mesa/tipos'

/** lo que el cliente tiene (manual, fotos, datos propios), leído UNA vez al abrir y guardado en el encargo */
export interface FuentesCompletas {
  cliente_nombre: string
  manual_texto: string
  plan_texto: string | null
  fuentes: FuentesDelCliente
  propios: PropiosDelCliente
  fotos: FotoEtiquetada[]
  /** fotos de la COMPETENCIA y de referencia (con su origen): NUNCA candidatas; solo estilo, en texto */
  referencias?: FotoEtiquetada[]
  /** fotos ya usadas: id → ISO */
  usos: Record<string, string>
  /** vocabulario de productos del cliente (lo que muestran sus fotos), para saber qué protagoniza un brief */
  vocabulario_de_productos: string[]
  zona: string | null
  /** identidad visual para dibujar láminas (colores, tipografías, logo, usuario); null = el manual no la trae (las salas de láminas fallan visibles, no inventan una) */
  marca?: MarcaParaRender | null
  /** slug del cliente (carpeta del bucket del brazo) */
  slug?: string | null
}

export interface MarcaParaRender {
  logo_url?: string | null
  colors: { primary: string; secondary?: string; accent?: string }
  fonts: { family: string; headline_family?: string }
  brand_handle?: string
}

export interface Encargo {
  id: string
  client_id: string
  parte_id: string
  brief_id: string
  tipo_de_grupo: string
  familia: string
  version_encargo: number
  estado: 'abierto' | 'en_paso' | 'cerrado' | 'cerrado_por_tope' | 'fallido' | 'aprobada'
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
export interface NuevoEncargo { /** 30-oct · RE-REVISIÓN: encargo nuevo que arranca en los chequeos con los materiales de la última versión cerrada (ver `re-revision.ts`); versión siguiente, sin mesa, sin rondas */ re_revision?: { desde_encargo: string; desde_hitl: string; pedido_por: string }; /** 29-oct · el dueño pidió cambios sobre una pieza cerrada: versión siguiente, fuera del tope de 3 versiones */ cambios_del_dueno?: CambiosDelDueno; /** la causa de un fallo ya corregida: permite reabrir un encargo `fallido` aunque ya haya gastado (tope de versiones intacto) */ reabrir_causa?: string; client_id: string; parte_id: string; brief_id: string; tipo_de_grupo: string; familia: string; tope_usd: number; dry_run: boolean; prueba: boolean; sala_ref: Record<string, unknown> | null; estado_del_motor: Estado }

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
  /** EL ACUSE del flujo (28-oct · traspaso perdido): el flujo que recibe un turno lo TOMA una sola vez (atómico: solo si sigue `corriendo` y sin dueño). Dos despertares del mismo turno no pagan dos veces */
  acusarTurno(encargoId: string, n: number, ejecucion: string): Promise<'tomado' | 'ya_tomado' | 'no_abierto'>
  guardar(c: Cambios): Promise<void>
}

export type ResultadoImagen = { ok: true; url: string; generation_id: string; costo_usd: number } | { ok: false; error: string }
/** un intento al revisor GPT y el resultado: viven en el módulo común `src/lib/revisor-gpt.ts` (los comparte la revisión del manual) */
export type { IntentoDelRevisor } from '../revisor-gpt'
export type ResultadoRevisor = import('../revisor-gpt').ResultadoDelRevisor
export type ResultadoRender = { ok: true; urls: string[]; ancho: number; alto: number; fonts_usadas: string[]; fonts_faltantes: string[]; timings_ms: number[] } | { ok: false; error: string }
/** lo que se le manda al brazo que dibuja láminas (subconjunto de su contrato; el tamaño lo fija la plataforma) */
export interface PedidoDeRender {
  client_id: string; encargo_id: string; plataforma: string; marca: MarcaParaRender; slug: string
  slides: Array<{ headline: string; body?: string; cta?: string; eyebrow?: string; background_image_url?: string | null; pie?: string | null; ocultar_indicador?: boolean }>
  /** la oficina siempre manda `oficina/{encargo_id}`: dos piezas del mismo día no se pisan */
  subcarpeta: string
  dry_run: boolean
}

/** J8a · lo que pasó al abrir la revisión de la pieza en la jefatura */
export type AperturaDeJefatura =
  /** la revisión cerró dentro de la propia llamada (p. ej. en seco, o ya existía y ya estaba cerrada) */
  | { estado: 'cerrada'; salida: SalidaDeRevision }
  /** abierta: los turnos de agente los corre el flujo `jefatura · turno`; al cerrar, la jefatura entrega a `/api/jefatura/oficina-vuelta` y el encargo sigue */
  | { estado: 'esperando'; revision_id: string }
  /** la jefatura no abre (apagada, tipo no activo, fuera del ensayo, sin presupuesto…): 409 de su puerta */
  | { estado: 'no_abre'; motivo: string }
  | { estado: 'error'; motivo: string }

/** el portero del cerebro: el PEDIDO (`POST /api/brain/alimentar/pedido`) y la lectura de su resultado (`GET …/pedido?id=`) */
export interface PuertoDelCerebro {
  /** la ruta de vuelta a la que el portero avisa (`avisar_a`): nuestra propia casa */
  avisarA: string
  pedir(p: import('./material').PedidoAlPortero): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string; http?: number }>
  leerPedido(id: string): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string; http?: number }>
}

export interface Puertos {
  almacen: Almacen
  /** MATERIAL · el portero. Opcional: sin él (o con `material_activo` apagado) la oficina funciona exactamente como antes */
  cerebro?: PuertoDelCerebro
  /** LA MESA · el directorio vivo y el libro de aportes. Opcional: sin él las familias `*_mesa` no abren (fallan visibles) y las v1 funcionan igual */
  mesa?: PuertoMesa
  /** CHEQUEO GRATIS de la puerta del portero (n8n `zero-risk/portero`): manda un cuerpo vacío con las dos llaves y espera el rechazo de VALIDACIÓN del portero (no llama al modelo, no cuesta). Opcional: sin él no se comprueba */
  chequearPortero?(): Promise<{ ok: true } | { ok: false; detalle: string }>
  /**
   * LA MESA LEE LO QUE EL DUEÑO HA DICHO (opcional): `consultar` pide al cerebro las notas que le tocan a un agente (`GET /api/brain/consultar?clase=aprendizaje_del_dueno`); `registrar` anota en `autorevisiones_del_productor`
   * qué notas leyó y qué cambió. Sin este puerto la mesa trabaja como siempre; ninguno de los dos frena nunca un turno. La jefatura y la segunda mirada GPT no usan este puerto.
   */
  aprendizaje?: {
    consultar(p: { client_id: string; agente: string; destinatario: string | null; formato: string; tarea: string; dry_run: boolean }): Promise<{ ok: true; notas: NotaLeida[]; aviso?: string } | { ok: false; error: string }>
    registrar(r: { client_id: string; encargo_id: string; agente: string; paso: string; notas_vistas: string[]; choco: boolean; cambios: unknown[]; costo_usd: number; clave_unica: string }): Promise<void>
  }
  ahora(): Date
  fuentes(clientId: string): Promise<FuentesCompletas | { error: string }>
  parte(parteId: string, clientId: string): Promise<{ texto: string } | null>
  /** el plan de trabajo del que sale la parte (su texto), o null si no se puede leer; solo lectura */
  plan(planId: string, clientId: string): Promise<string | null>
  /** genera UNA imagen (1024×1024, calidad explícita); en dry_run NO llama al proveedor */
  imagen(p: { prompt: string; client_id: string; encargo_id: string; dry_run: boolean }): Promise<ResultadoImagen>
  /** J8a · abre UNA revisión de la pieza en la jefatura (misma función que la ruta `/api/jefatura/revisiones`, con `devolver_a` = la ruta de vuelta de la oficina). Opcional: sin él, el paso `jefatura` deja la pieza «sin revisar» */
  jefatura?(sobre: SobreDeRevisionDePieza): Promise<AperturaDeJefatura>
  /** el revisor ciego (otro proveedor); en dry_run NO llama al proveedor */
  revisor(p: { texto: string; imagenes_urls: string[]; dry_run: boolean; /** para anotar el gasto en el libro de invocaciones (condición 5): sin ellos no se anota */ client_id?: string; ref_id?: string; n?: number }): Promise<ResultadoRevisor>
  /** el brazo que dibuja láminas (PNG); en dry_run NO llama al brazo ni escribe en el bucket */
  renderLaminas(p: PedidoDeRender): Promise<ResultadoRender>
  descargar(url: string): Promise<Buffer | null>
  guardarArchivos(ruta: string, archivos: Array<{ nombre: string; bytes: Buffer; tipo: string }>): Promise<{ ok: true; urls: Record<string, string> } | { ok: false; error: string }>
  /** salida `draft` en client_historical_outputs; NO se llama en dry_run */
  salida(p: { client_id: string; titulo: string; contenido: Record<string, unknown>; metadata: Record<string, unknown> }): Promise<{ ok: true; output_id: string } | { ok: false; error: string }>
  /** fila de la bandeja con `output_id` y `expires_at`; NO se llama en dry_run */
  bandeja(p: { client_id: string; output_id: string; titulo: string; vista_previa: string; metadata: Record<string, unknown>; expires_at: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  /** hilo de #oficina-creativa o aviso a #alertas; NUNCA lanza (un fallo de Slack no frena un encargo) */
  avisar(p: { canal: 'hilo' | 'alertas'; encargo_id: string; texto: string; dry_run: boolean }): Promise<void>
  /**
   * EL SEGUNDO CEREBRO del productor (opcional): sin este puerto no hay notas y las auto-revisiones se saltan. `leer` devuelve las notas del dueño que el agente puede ver (ya elegidas por el código);
   * `registrar` anota cada auto-revisión (qué notas vio, si algo chocó, qué cambió, cuánto costó). Ninguno de los dos frena nunca un encargo.
   */
  notas?: {
    /** lo que el dueño dijo (del cerebro del cliente + las notas «general:»); si algo falló trae `error` y lo que sí se pudo leer */
    leer(clientId: string): Promise<{ notas: NotaVista[]; error?: string }>
    registrar(r: { client_id: string; encargo_id: string; agente: string; paso: string; notas_vistas: string[]; choco: boolean; cambios: unknown[]; costo_usd: number; clave_unica: string }): Promise<void>
  }
}
