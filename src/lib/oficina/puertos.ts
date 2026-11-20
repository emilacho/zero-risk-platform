/**
 * PUERTOS DEL ORQUESTADOR · todo lo que toca el mundo (base, modelos, imágenes, bandeja, Slack) entra por aquí, así el orquestador se prueba con modelo simulado y sin red.
 * Los adaptadores reales (Supabase, imágenes, bandeja, Slack, revisor externo) viven aparte y NO se encienden: la oficina nace apagada.
 */
import type { LecturaDeHechos } from './hechos-del-negocio'
import type { FuentesDelCliente } from './chequeos'
import type { FotoEtiquetada } from './fotos'
import type { PropiosDelCliente } from './reglas-de-imagen'
import type { CambiosDelDueno } from './cambios-del-dueno'
import type { ConfigDeOficina } from './sobre'
import type { Estado, Ficha, Plantilla } from './tipos'
import type { FilaDeFormato } from './entrega'
import type { Plano } from './video/guion'
import type { SalidaDeRevision } from '../jefatura/revision/contrato'
import type { SobreDeRevisionDePieza } from './paso-jefatura'
import type { NotaVista } from '../notas-del-dueno/autorevision'
import type { NotaLeida, PuertoMesa } from './mesa/tipos'
import type { PerfilParaLectores } from '../perfil-del-publico/lectores'
import type { FormatosPorRed } from '../cadena/tipos'
import type { HechoDelNegocioPorOferta } from '../cadena/ficha-de-oferta'

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
  /** 10-nov · perfil del público T2: el informe vigente del cliente (contexto, no mandato); ausente = no se pidió (fixtures viejos) */
  perfil_del_publico?: PerfilParaLectores
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
  /** 19-nov · VARIAS CAMPAÑAS · de qué campaña es el encargo (null = sin saberlo: los viejos, o un sobre sin campaña ni fila) */
  campana_id?: string | null
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
export interface NuevoEncargo { /** 30-oct · RE-REVISIÓN: encargo nuevo que arranca en los chequeos con los materiales de la última versión cerrada (ver `re-revision.ts`); versión siguiente, sin mesa, sin rondas */ re_revision?: { desde_encargo: string; desde_hitl: string; pedido_por: string }; /** 29-oct · el dueño pidió cambios sobre una pieza cerrada: versión siguiente, fuera del tope de 3 versiones */ cambios_del_dueno?: CambiosDelDueno; /** la causa de un fallo ya corregida: permite reabrir un encargo `fallido` aunque ya haya gastado (tope de versiones intacto) */ reabrir_causa?: string; /** 19-nov · VARIAS CAMPAÑAS · de qué campaña es el encargo (null = sin saberlo: los viejos, o un sobre sin campaña ni fila) */ campana_id?: string | null; client_id: string; parte_id: string; brief_id: string; tipo_de_grupo: string; familia: string; tope_usd: number; dry_run: boolean; prueba: boolean; sala_ref: Record<string, unknown> | null; estado_del_motor: Estado }

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
  gastos?: Array<{ concepto: 'modelo' | 'revisor_externo' | 'imagen' | 'portero' | 'video'; ref_tabla: string | null; ref_id: string | null; cost_usd: number; base: 'usage' | 'estimado' }>
  usos_de_fotos?: Array<{ foto_id: string; rol: string | null }>
}

export interface Almacen {
  leerConfig(): Promise<ConfigDeOficina>
  /** la plantilla de una familia y si está activa */
  /** 19-nov · G5b · `cruda` = la plantilla tal como está en la base (con los topes por segundo sin calcular): con ella `plantillaDe` calcula los de la duración de cada encargo */
  leerPlantilla(familia: string): Promise<{ plantilla: Plantilla; activo: boolean; cruda?: Plantilla } | null>
  leerFormato(red: string, formato: string): Promise<FilaDeFormato | null>
  crearEncargo(n: NuevoEncargo): Promise<{ ok: true; encargo: Encargo; nuevo: boolean } | { ok: false; error: string }>
  leerEncargo(id: string): Promise<Encargo | null>
  /** el turno que está esperando respuesta (estado corriendo), si hay uno */
  turnoAbierto(encargoId: string): Promise<TurnoRegistrado | null>
  /** EL ACUSE del flujo (28-oct · traspaso perdido): el flujo que recibe un turno lo TOMA una sola vez (atómico: solo si sigue `corriendo` y sin dueño). Dos despertares del mismo turno no pagan dos veces */
  acusarTurno(encargoId: string, n: number, ejecucion: string): Promise<'tomado' | 'ya_tomado' | 'no_abierto'>
  guardar(c: Cambios): Promise<void>
  /**
   * 10-nov · LA COPIA DE UN TURNO TAMBIÉN SE PAGA: una respuesta repetida (otro flujo corrió el mismo turno: el vigía lo re-entregó) trae su propia llamada al modelo. Se anota en `oficina_gastos`
   * (una vez por ejecución: la misma ejecución reenviada no suma dos veces) y se suma al gasto del encargo, para que el tope vea lo gastado de verdad. `ya_estaba` = esa ejecución ya estaba anotada.
   */
  anotarGastoDeCopia?(c: { encargo_id: string; gasto: NonNullable<Cambios['gastos']>[number] }): Promise<'anotado' | 'ya_estaba'>
  /** 11-nov · regla (b) · las versiones REALES del mismo brief y grupo, para contar los intentos al cerrar fallido (`reapertura.ts · intentosQueCuentan`) */
  hermanosDe?(enc: Encargo): Promise<import('./reapertura').RastroDeEncargo[]>
}

/** `referencia` (sprint 1 · mejora 3): si se pidió editar sobre una foto del cliente, si se usó y, si no, por qué (la imagen se generó igual) */
export type ResultadoImagen = { ok: true; url: string; generation_id: string; costo_usd: number; referencia?: { usada: boolean; motivo?: string; /** 18-nov · las otras fotos que sí viajaron, y las que no (con su motivo) */ otras_usadas?: string[]; otras_omitidas?: Array<{ url: string; motivo: string }> } } | { ok: false; error: string }
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

/**
 * 18-nov · EL ÍNDICE DEL CEREBRO para la mesa (contrato con CC-CEREBRO): el índice de la pieza (`POST /api/brain/portero/indice`, una vez al abrir)
 * y la entrega por número (`POST /api/brain/portero/entregar`, cuando un empleado usa `pedir_fichas`). Sin modelo, US$ 0.
 */
export interface PuertoDelIndice {
  indice(p: import('./mesa/indice-del-cerebro').PedidoDelIndice): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string; http?: number }>
  entregar(p: import('./mesa/indice-del-cerebro').PedidoDeFichas): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string; http?: number }>
}

/** 31-oct · las mesas de brief y de concepto entregan su tablero a la cadena (o dicen que no pudieron): la fila de `cadena_brief_creativo` / `cadena_conceptos` la cierra la propia cadena (contrato: raw/tasks/2026-10-31-CONTRATO-CC2-puertos-de-las-mesas-brief-y-concepto-para-CC1). Primera entrega que cierra gana. */
export type EntregaALaCadena = { ok: true; estado?: string; ya_cerrada?: boolean; /** el sobre con el que la puerta de la cadena vuelve a entrar (si el próximo paso no es de una persona): la oficina lo deja pasar tal cual, no lo lee */ siguiente?: { sobre: object } } | { ok: false; error?: string }
export interface PuertoDeLaCadena {
  entregarBrief(p: { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }): Promise<EntregaALaCadena>
  entregarConcepto(p: { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null; brief_devuelto?: string | null }): Promise<EntregaALaCadena>
  /** 10-nov · la mesa de reubicación (filas que quedaron atrás sin producir) entrega la decisión del agente; la cadena la VERIFICA por código antes de aplicarla. Opcional: sin él, la entrega no llega y lo dice */
  entregarReubicacion?(p: { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }): Promise<EntregaALaCadena>
  /** 11-nov · la mesa de revisión de fallidos entrega sus veredictos; la cadena los VERIFICA por código antes de reabrir. Opcional: sin él, la entrega no llega y lo dice */
  entregarFallidos?(p: { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }): Promise<EntregaALaCadena>
  /** 17-nov · la mesa de la gran idea responde, como creadora, a una corrección de la jefatura sobre una idea del banco; la cadena la VERIFICA por código antes de escribir. Opcional */
  entregarBanco?(p: { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }): Promise<EntregaALaCadena>
  /** 17-nov · eslabón 1 de #1150 · el receptor de correcciones (en proceso, sin `autorizarLlamada`): la misma respuesta que la ruta (`201` · `200 ya_estaba` · `200 va_a: 'pieza'` · `400` · `500`); nunca lanza */
  devolverCorreccion?(cuerpo: Record<string, unknown>): Promise<RespuestaDeLaCadena>
  /** 17-nov · eslabón 3 de #1150 · las correcciones de un encargo, cada una con `para_la_pieza`; nunca lanza */
  correccionesDelEncargo?(encargoId: string): Promise<RespuestaDeLaCadena>
}
export interface RespuestaDeLaCadena { status: number; cuerpo: Record<string, unknown> }

/** lo que el brazo de video contesta al enviar: en dry_run el puerto NO sale a la red y devuelve `simulado` */
export type EnvioDeVideo =
  | { ok: true; request_id: string; status: string; costo_estimado_usd: number; costo_lista_usd?: number; descuento_pct?: number; simulado: boolean }
  | { ok: false; error: string; http?: number; descripcion?: string }
/** lo que el brazo contesta al preguntar por un pedido (`GET /api/video/generate?request_id=`) */
export type EstadoDelBrazo =
  | { ok: true; simulado: true }
  | { ok: true; simulado?: false; terminal: false; status: string }
  | { ok: true; simulado?: false; terminal: true; status: 'completed'; video_url: string; url_proveedor: string | null; costo_usd: number; expires_at: string | null; copia: 'bucket' | 'solo_proveedor'; aviso: string | null }
  | { ok: true; simulado?: false; terminal: true; status: string; error: string | null }
  | { ok: false; error: string }
/** EL BRAZO DE VIDEO (parte 2 · 31-oct): enviar un pedido y leer su estado. Opcional: sin él la familia `video_mesa` falla visible al llegar al paso `video` */
/** 11-nov · la cotización GRATIS del brazo (estima y compara con el tope; no envía nada al proveedor). Si falla, trae la descripción de precios que devolvió el proveedor */
export type CotizacionDeVideo =
  | { ok: true; costo_estimado_usd: number; costo_lista_usd?: number; ruta?: string }
  | { ok: false; error: string; descripcion?: string; http?: number }
export interface PuertoDeVideo {
  enviar(p: { pedido: import('./video/pedido').PedidoDeVideoDeLaOficina; client_id: string; encargo_id: string; dry_run: boolean; tope_usd: number; workflow_id: string; workflow_execution_id: string }): Promise<EnvioDeVideo>
  /** 11-nov · GO Lenovo 02:52Z · «cotizar primero»: la sala de video lo llama al ABRIR (antes de la mesa). Sin este método, un encargo real de video no abre (no se puede cotizar) */
  cotizar?(p: { pedido: import('./video/pedido').PedidoDeVideoDeLaOficina; client_id: string; encargo_id: string; tope_usd: number; workflow_id: string; workflow_execution_id: string }): Promise<CotizacionDeVideo>
  estado(request_id: string): Promise<EstadoDelBrazo>
  /** 17-nov · Sprint 3 · T1 · el catálogo de modelos de la configuración del brazo (el MISMO que valida la ruta). Gratis; sin el método, o si falla, el del código */
  catalogo?(): Promise<import('../video/parametros').CatalogoDeModelos>
  /** 11-nov · camino B · el unidor (Railway · ffmpeg): recorta una foto propia al centro a la proporción de la red (imagen a video no admite proporción) */
  encuadrar?(p: { url: string; relacion: string }): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }>
  /** 11-nov · camino B · une los clips en orden, cada uno cortado a `segundos`, con el sonido fundido entre planos */
  unir?(p: { clips: Array<{ url: string; segundos: number }>; relacion: string; resolucion: string }): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }>
  /**
   * 17-nov · S2-4 tramo 3 · «lo pagado se reutiliza»: los clips del cliente que el libro ya tiene TERMINADOS y COBRADOS con esa huella, con su copia en nuestro almacén
   * todavía ahí. Gratis (lee el libro). Nunca lanza: si no puede leer, devuelve [] y el clip se paga como siempre. Sin este método no se reutiliza nada.
   */
  buscarPagados?(p: { client_id: string; huellas: string[] }): Promise<Array<{ huella: string; request_id: string; video_url: string; costo_usd: number }>>
}

/**
 * 18-nov · Sprint 3 · T5 tramo 3 · EL SERVICIO DE RENDER para el VIDEO COMPUESTO (S2-5 · Railway · US$ 0). Todo es un trabajo en fila:
 * se pide y se consulta en las vueltas del vigía. Nunca lanza: cada llamada devuelve ok o el error en palabras (`reintentar` = 429/5xx/red).
 */
type FalloDelServicio = { ok: false; error: string; reintentar: boolean }
export type EstadoDelTrabajoDeRender = 'en_fila' | 'rindiendo' | 'listo' | 'fallido'
export interface PuertoDeComposicionDeVideo {
  /** pide el análisis del sonido: la voz del video unido (palabras, whisper local) y/o la música (golpes) */
  analizar(p: { voz: { nombre: string; url: string } | null; musica: { nombre: string; url: string } | null; idioma: string }): Promise<{ ok: true; id: string } | FalloDelServicio>
  analisis(id: string): Promise<{ ok: true; estado: EstadoDelTrabajoDeRender; error: string | null; resultado: import('../render-html/cliente').ResultadoDelAnalisis | null } | FalloDelServicio>
  /** pide el render del documento `htmlDeVideo` armado con este pedido (el adaptador carga las fuentes de la marca); `archivos` = de dónde baja el servicio el video unido */
  rendir(p: { pedido: import('../../../packages/carousel-engine/src/video-html').PedidoDeVideoCompuesto; archivos: Array<{ nombre: string; url: string }> }): Promise<{ ok: true; id: string; fonts_faltantes: string[] } | FalloDelServicio>
  render(id: string): Promise<{ ok: true; estado: EstadoDelTrabajoDeRender; error: string | null; segundos_de_render: number | null } | FalloDelServicio>
  bajar(id: string): Promise<{ ok: true; mp4: Buffer } | FalloDelServicio>
}

export interface Puertos {
  /** 18-nov · T5 tramo 3 · el servicio de render del video compuesto · opcional: sin él (o sin `limites.video.componer`), el video unido sale como hoy */
  componerVideo?: PuertoDeComposicionDeVideo
  /** (01-nov) lo que el revisor de la jefatura debe tener además del manual y el brief: resumen vivo, informes, lo que dijo el dueño y las páginas del sitio */
  carpetaParaRevisar?(clientId: string): Promise<Array<{ titulo: string; funcion?: string; texto: string }>>
  /** 20-nov · «Crear Campaña» (entrega 3): el brief del dueño de la campaña de la pieza, para el revisor · null sin brief del dueño · nunca lanza */
  briefDeLaCampanaParaRevisar?(campanaId: string): Promise<{ titulo: string; funcion?: string; texto: string } | null>
  /** (17-nov · coherencia con los hechos) el bloque de hechos del negocio que define Cerebro. Opcional: sin él (o si falla) la revisión recibe el aviso «no hay bloque» y compara contra el manual y el plan */
  hechosDelNegocio?(clientId: string): Promise<LecturaDeHechos>
  /** (17-nov · cambio 4 · D1) los hechos del cerebro POR OFERTA con su `tipo` (la misma lectura de la cadena · solo lectura). Sin él (o si falla), D1 usa solo el cierre que trae la hoja y lo declara */
  hechosPorOferta?(clientId: string): Promise<HechoDelNegocioPorOferta[] | null>
  almacen: Almacen
  /** LA CADENA (opcional): solo la mesa de creativos del calendario la usa. Sin él esa familia falla visible (y la cadena ordena el calendario sin ideas al vencer el plazo) */
  cadena?: PuertoDeLaCadena
  /** EL BRAZO DE VIDEO · opcional (ver `PuertoDeVideo`) */
  video?: PuertoDeVideo
  /** MATERIAL · el portero. Opcional: sin él (o con `material_activo` apagado) la oficina funciona exactamente como antes */
  cerebro?: PuertoDelCerebro
  /** 18-nov · EL ÍNDICE DEL CEREBRO para la mesa. Opcional: sin él (interruptor `OFICINA_MESA_INDICE` apagado) la mesa abre con el pedido de siempre */
  indice?: PuertoDelIndice
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
  /** LA TABLA DE FORMATOS DE LA CADENA (`cadena_formatos_por_red`, leída por el almacén de la cadena) · opcional: la usa `briefEsDelEncargo` como red; sin ella manda la familia del encargo */
  formatosDeLaCadena?(): Promise<FormatosPorRed>
  ahora(): Date
  fuentes(clientId: string): Promise<FuentesCompletas | { error: string }>
  /** 17-nov · Sprint 3 · T1b · el registro de permisos de persona real del cliente (`oficina_permisos_persona_real`) · gratis. Sin el método o con error: nadie tiene permiso (lo seguro) */
  permisosDePersonaReal?(clientId: string): Promise<import('./video/permisos').PermisoDePersonaReal[] | { error: string }>
  /** `campana_id` = la campaña de la cadena a la que llega el parte (`provenance_tag.campana_id`), si la tiene (eslabón 1 de #1150) */
  parte(parteId: string, clientId: string): Promise<{ texto: string; campana_id?: string | null } | null>
  /** el plan de trabajo del que sale la parte (su texto), o null si no se puede leer; solo lectura */
  plan(planId: string, clientId: string): Promise<string | null>
  /** genera UNA imagen (1024×1024, calidad explícita); con `foto` (una foto PROPIA del cliente, sprint 1 · mejora 3) la edita sobre ella para conservar el producto real; en dry_run NO llama al proveedor */
  /** S2-3 · `size` y `quality` son opcionales (sin ellos, 1024x1024 · medium, como siempre): la imagen clave del video los pide por fase (borrador / final) */
  imagen(p: { prompt: string; client_id: string; encargo_id: string; dry_run: boolean; foto?: import('./foto-de-referencia').FotoDeReferencia | null; /** 18-nov · las otras fotos reales que siguen a `foto` (personajes, productos, lugares), en orden */ otras_fotos?: import('./foto-de-referencia').FotoDeReferencia[]; size?: string; quality?: string; /** 20-nov · punto 3 · la llave de una edición (encargo, imagen, vuelta): viaja como `caller` y queda en el libro del brazo */ llave?: string }): Promise<ResultadoImagen>
  /** 20-nov · punto 3 (CC7 2) · la edición que ya se pidió con esta llave (una fila completada del libro del brazo), para no pagarla dos veces; null si no hay. Opcional */
  imagenYaPedida?(p: { llave: string; client_id: string }): Promise<{ url: string; generation_id: string; costo_usd: number } | null>
  /** J8a · abre UNA revisión de la pieza en la jefatura (misma función que la ruta `/api/jefatura/revisiones`, con `devolver_a` = la ruta de vuelta de la oficina). Opcional: sin él, el paso `jefatura` deja la pieza «sin revisar» */
  jefatura?(sobre: SobreDeRevisionDePieza): Promise<AperturaDeJefatura>
  /** el revisor ciego (otro proveedor); en dry_run NO llama al proveedor */
  revisor(p: { texto: string; imagenes_urls: string[]; dry_run: boolean; /** para anotar el gasto en el libro de invocaciones (condición 5): sin ellos no se anota */ client_id?: string; ref_id?: string; n?: number }): Promise<ResultadoRevisor>
  /** el brazo que dibuja láminas (PNG); en dry_run NO llama al brazo ni escribe en el bucket */
  renderLaminas(p: PedidoDeRender): Promise<ResultadoRender>
  descargar(url: string): Promise<Buffer | null>
  /** Sprint 1 · Mejora 5 · compone la pieza con foto: logo, textos y colores de la marca encima (PNG). Opcional: sin él, la foto sale como siempre */
  componer?(p: import('../../../packages/carousel-engine/src/anuncio').PedidoDeAnuncio): Promise<{ ok: true; png: Buffer; fonts_faltantes: string[]; /** S2-5 · quién dibujó: la plantilla HTML (servicio de render) o el dibujo de siempre */ motor?: 'html' | 'satori'; /** S2-5 · el servicio de render falló y se dibujó con el de siempre */ aviso_motor?: string } | { ok: false; error: string }>
  /** 11-nov · los cuadros de cada plano de un video (ffmpeg · S2-7: inicio, medio y final + señales medidas); opcional: sin él, el video no se mira y queda una ficha que bloquea */
  sacarCuadros?(bytes: Buffer, planos: Plano[]): Promise<{ duracion_s: number | null; cuadros: Array<{ plano: number; segundo: number; parte?: import('./video/mirada').ParteDelPlano; bytes: Buffer }>; senales?: import('./video/mirada').SenalesDelVideo | null; causa?: string }>
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
