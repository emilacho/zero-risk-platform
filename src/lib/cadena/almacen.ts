/**
 * ALMACÉN DE LA CADENA · la interfaz de lo que las rutas necesitan de la base (diseño v2 §3.7, §10).
 *
 * Las rutas y los manejadores (`manejadores/*.ts`) hablan SOLO con esta interfaz: la prueba usa un almacén en memoria y la ruta real,
 * `almacen-supabase.ts` (el único archivo, con las rutas, que nombra las tablas `cadena_*`). Nada de esto se usa hasta que alguien aplique la migración y encienda.
 */
import type { FormatosPorRed, Estrategia, Ficha, Fila, Hallazgo, Referencia, SedeInfo } from './tipos'
import type { PlazoCfg } from './esperas'
import type { FechaEspecialVerificada } from './validador-calendario'
import type { LlaveDeFecha } from './indicaciones'
import type { ParteGuardada, ResultadoDeEmision, SobreDeProducir } from './autoproducir'
import type { SobreDeLote } from './arranque'
import type { SobreDePlan } from './campanas'
import type { SobreDeTanda } from './mesas'
import type { AvisoDelTope, LecturaDeGasto } from './tope-de-campana'
import type { PerfilParaLectores } from '../perfil-del-publico/lectores'

export type EstadoCampana = 'abierta' | 'estrategia' | 'calendario' | 'activa' | 'pausada' | 'necesita_humano' | 'cerrada' | 'reemplazada'

export interface Campana {
  id: string
  client_id: string
  plan_id: string
  fecha_inicio: string
  fecha_inicio_origen: 'regla' | 'alta' | 'emilio' | 'plan'
  fecha_fin: string
  /** semanas por tanda de ESTA campaña; sin valor vale SEMANAS_DE_TANDA */
  semanas_de_tanda?: number | null
  zona_horaria: string
  pais: string | null
  sedes: string[]
  estado: EstadoCampana
  estado_motivo: string | null
  presupuesto_planificacion_usd: number
  ventana_parte_dias: number
  sustituir_video_por: 'ninguna' | 'carrusel' | 'foto'
  autoproducir: boolean
  /** 10-nov · TOPE DE GASTO de la campaña en US$ (`tope-de-campana.ts`) · sin valor = no sale ninguna pieza real. Lo decide una persona; nace con `tope_gasto_campana_por_omision` */
  tope_gasto_usd?: number | null
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

/** 31-oct (nuevo orden · T1): el brief creativo guardado (`cadena_brief_creativo` · contrato brief_creativo.v1) */
export interface BriefCreativoGuardado {
  campana_id: string
  version: number
  estado: 'borrador' | 'validada' | 'devuelta' | 'descartada'
  texto_md: string | null
  /** lo que leyó `leerBriefCreativo` (BriefCreativoLeido) · null mientras es borrador o si la mesa no entregó */
  leido: Record<string, unknown> | null
  /** los puntos por los que se devolvió (UNA re-petición; luego necesita_humano) */
  devolucion_texto: string | null
  /** por qué no hay texto (la mesa falló, venció o llegó al tope sin nada) */
  motivo: string | null
  costo_usd: number | null
  encargo_id: string | null
  /** red de seguridad (plazo de trabajo + holgura): pasado, el reloj deja el brief `descartada` y la campaña reabre una vez (migración 202610312003 · hueco 1 de CC3) */
  plazo_en?: string | null
  seco: boolean
}
/** 31-oct (nuevo orden · T1): el concepto guardado (`cadena_conceptos` · contrato concepto.v1) */
export interface ConceptoGuardado {
  campana_id: string
  version: number
  estado: 'abierta' | 'lista' | 'sin_mesa' | 'brief_devuelto'
  /** la decisión de Emilio sobre la tarjeta de concepto · null mientras no hay tarjeta */
  aprobacion: 'pendiente' | 'aprobado' | 'cambios' | null
  texto_md: string | null
  /** lo que leyó `leerConcepto` (ConceptoLeido) */
  leido: Record<string, unknown> | null
  /** texto de «## Devolución del brief» cuando la dirección devolvió el brief (la cadena abre brief v2 con ese marco) */
  brief_devuelto: string | null
  motivo: string | null
  costo_usd: number | null
  /** el plazo propio de la mesa (90 min): lo guarda la CADENA, la oficina no barre estas mesas */
  plazo_en: string | null
  encargo_id: string | null
  hitl_id: string | null
  nota_de_emilio: string | null
  /** a qué apunta un «cambios»: al concepto (otra ronda de mesa) o al brief (brief v2) */
  apunta_a: 'concepto' | 'brief' | null
  decidido_en: string | null
  seco: boolean
}
export type ObjetoDeValidacion = 'estrategia' | 'calendario' | 'brief' | 'brief_creativo' | 'concepto'

/** 31-oct (T3): el `type` de la tarjeta «Gran idea» en `hitl_queue` · la bandeja de piezas la muestra aparte y las otras rutas la ignoran o rechazan (`metadata.tipo = 'concepto'`) */
export const TIPO_TARJETA_DE_CONCEPTO = 'concepto_review'
export interface TarjetaDeConcepto { client_id: string; campana_id: string; version: number; titulo: string; vista_previa: string; metadata: Record<string, unknown>; seco: boolean }
export interface DecisionDeEmilio { hitl_id: string; accion: 'aprobar' | 'pedir_cambios'; comentario: string | null; autor: string; ahora: string }

/** lo que la copia por filas HABRÍA escrito en `client_historical_outputs` (la fila del parte), más el lote y cuándo vence el ensayo */
export interface ParteSecoAGuardar {
  client_id: string
  lote: string
  fila: { title: string; content: string; content_text?: string; producing_agent?: string; provenance_tag: Record<string, unknown> }
  vence_en: string
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

/** 10-nov · tramo 2 del revisor de registro · el sobre que la cadena manda a la jefatura (la forma de su contrato; la cadena no importa `jefatura/`) */
export interface EntradaDeRegistro {
  artifact_type: 'registro'
  artifact_id: string
  client_id: string
  journey_id: null
  payload: {
    texto: string
    dry_run: boolean
    version: number
    documento: string
    registro: { trato: 'tu' | 'vos' | 'usted'; fuente?: string }
    pistas_de_registro: string[]
    documentos_de_origen: Array<{ titulo: string; texto: string }>
    productores?: Array<{ donde: string; agente: string }>
  }
}
/** lo que contestó la jefatura al abrir: `esperando` (vuelve por la ruta de vuelta) · `cerrada` (ya cerró: trae su salida) · `no_abre` · `error` */
export type ResultadoDeAbrirRegistro =
  | { estado: 'esperando'; revision_id: string }
  | { estado: 'cerrada'; salida: Record<string, unknown> }
  | { estado: 'no_abre' | 'error'; motivo: string }

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
  /** r75 · H3 · la industria de la ficha (carga los paquetes de léxico por rubro) */
  industria?: string | null
  /** r75 · H2 · el registro del cliente ya resuelto (manual > ficha > país); `sin_dato` = no se bloquea ni se impone nada */
  registro?: 'tu' | 'vos' | 'usted' | 'sin_dato'
  /** 31-oct (T3 · idioma agnóstico): el idioma de la ficha (`clients.idioma`, p. ej. «español», «english», «português»); ausente = el del manual o el oficial del país (no se inventa) */
  idioma?: string | null
  /** r74 · de dónde salió la zona: declarada en la ficha · por el país · por defecto de la casa · sin dato (UTC solo como cálculo, y se pregunta) */
  zonaHorariaOrigen?: 'declarada' | 'por_pais' | 'por_defecto_de_la_casa' | 'sin_dato'
  planTexto: string
  manualTexto: string
  /** 01-nov · el eslogan que el cliente ya usa, con su regla de uso */
  eslogan?: { texto: string; regla: string } | null
  forbiddenWords: string[]
  /** las declaradas: 02-nov, firma de Emilio: se avisan, no bloquean */
  palabrasDuras?: string[]
  sedes: SedeInfo[]
  referencias: Referencia[]
  /** la fecha en que se guardó el plan (para la fecha de inicio por regla) */
  fechaDelPlan: string
}

/** `sin_configurar` (10-nov · B): no hay fuentes oficiales cargadas para ese país y tipo. No es final ni cuenta intento: se vuelve a mirar la configuración cada vez */
export interface FechaCobertura { pais: string; tipo: string; ambito_clave: string; anio: number; estado: 'verificada' | 'sin_fuente' | 'en_curso' | 'sin_configurar'; intentos: number; /** lo pone la base al guardar: ordena las llaves por uso */ investigado_en?: string | null }

/** C · una pregunta al dueño por la ruta de preguntas (`dueno_preguntas`): `ok` también cuando ya estaba preguntada o respondida (no se repite) */
export interface PreguntaAlDueno { client_id: string; tema: string; pregunta: string; canal: string; oficina: string; agente: string; workflow_id: string; workflow_execution_id: string }

export interface Almacen {
  /**
   * J7 · ¿la jefatura abriría una revisión de este tipo para este cliente? (el punto de espera «antes de pasar»). OPCIONAL: un almacén sin ella, o que falla, NO retiene (= hoy).
   * La implementa el almacén real leyendo la config y la política de la jefatura; la lógica de decidir es pura (`revision-jefatura.ts`).
   */
  retencionDeJefatura?(tipo: 'estrategia' | 'calendario' | 'registro', clientId: string): Promise<{ retener: boolean; motivo: string }>
  /**
   * 10-nov · tramo 2 del revisor de registro · abre UNA revisión de registro en la jefatura (la misma función que su ruta, sin pasar por la red) con `devolver_a` = la vuelta de la cadena.
   * OPCIONAL: sin ella, el registro no se revisa y el documento sigue con las pistas como aviso. Nunca lanza: un fallo vuelve como `error`.
   */
  abrirRevisionDeRegistro?(entrada: EntradaDeRegistro): Promise<ResultadoDeAbrirRegistro>
  /**
   * 10-nov · las filas que quedaron atrás · abre la mesa de reubicación de la oficina (la misma función que su ruta, sin pasar por la red) y despierta su primer turno.
   * OPCIONAL: sin ella, la cadena no abre la mesa y lo avisa una vez. Nunca lanza: un fallo vuelve como `error`.
   */
  abrirMesaDeReubicacion?(sobre: import('./reubicar').SobreDeReubicacion): Promise<import('./reubicar').ResultadoDeAbrirMesa>
  /** 11-nov (#1014 · relectura · OPCIONAL): el texto que dejó guardado la mesa de un encargo ya cerrado (sin llamar al agente); null si no hay. Nunca lanza. */
  textoGuardadoDeLaMesa?(encargoId: string): Promise<{ ok: true; texto: string | null } | { ok: false; motivo: string }>
  // configuración y datos de ajuste
  leerConfig(clave: string): Promise<unknown>
  escribirConfig(clave: string, valor: unknown): Promise<void>
  plazos(): Promise<PlazoCfg[]>
  formatos(): Promise<FormatosPorRed>
  // contexto del cliente (lecturas)
  cargarContexto(clientId: string, planId: string): Promise<ContextoDelCliente | null>
  /** 10-nov (GO v3 · punto 2): los ids de las fotos PROPIAS del cliente (las mismas que la oficina puede usar) · opcional: sin él, la lista va vacía */
  fotosPropias?(clientId: string): Promise<string[]>
  /**
   * 10-nov · perfil del público T2: el perfil del público VIGENTE del cliente, leído por la puerta del portero (la cadena no nombra tablas del cerebro).
   * OPCIONAL: un almacén sin él = sin perfil (los marcos quedan como hoy). Un fallo es `no_se_pudo_leer`, nunca «no hay».
   */
  perfilDelPublico?(clientId: string, mesa: 'brief' | 'gran_idea'): Promise<PerfilParaLectores>
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
  /** escritura CONDICIONAL (09-nov · revalidar, caso 2 de CC7): solo si la campaña SIGUE en `estado`; si otro la movió antes, null y no escribe */
  actualizarCampanaSi(id: string, estado: EstadoCampana, patch: Partial<Campana>): Promise<Campana | null>
  campanasEnEspera(): Promise<Campana[]>
  campanasActivas(): Promise<Campana[]>
  /** campañas que todavía arman su estrategia o su calendario (`abierta` · `estrategia` · `calendario`): si una llamada falló quedan ahí y nadie las mira sin el barrido del vigía */
  campanasEnArmado(): Promise<Campana[]>
  // estrategias
  ultimaEstrategia(campanaId: string): Promise<EstrategiaGuardada | null>
  insertarEstrategia(e: EstrategiaGuardada): Promise<void>
  /** colaterales (tramo 2c) · una versión CONCRETA de la estrategia (deshacer vuelve a su base) */
  estrategiaEnVersion(campanaId: string, version: number): Promise<EstrategiaGuardada | null>
  /** colaterales (tramo 2c) · inserta una versión nueva; false si esa (campaña, versión) ya existe (otra se adelantó) · cualquier otro error se lanza */
  insertarEstrategiaSiLibre(e: EstrategiaGuardada): Promise<boolean>
  // 31-oct (nuevo orden · T1) · brief creativo y concepto: UNA fila por (campaña, versión); la primera entrega que cierra gana (único en la base)
  ultimoBriefCreativo(campanaId: string): Promise<BriefCreativoGuardado | null>
  /** 31-oct (T3 · hueco 1 de CC3): todas las versiones del brief de una campaña, de la 1 en adelante */
  briefsDe(campanaId: string): Promise<BriefCreativoGuardado[]>
  /** los briefs abiertos (`borrador`) cuyo plazo propio ya pasó (el vigía los deja `descartada`) */
  briefsVencidos(ahora: string): Promise<BriefCreativoGuardado[]>
  insertarBriefCreativo(b: BriefCreativoGuardado): Promise<void>
  actualizarBriefCreativo(campanaId: string, version: number, patch: Partial<BriefCreativoGuardado>): Promise<void>
  /** escritura CONDICIONAL (09-nov · revalidar): solo si la versión SIGUE en `estado`; true = escribió */
  actualizarBriefCreativoSi(campanaId: string, version: number, estado: BriefCreativoGuardado['estado'], patch: Partial<BriefCreativoGuardado>): Promise<boolean>
  ultimoConcepto(campanaId: string): Promise<ConceptoGuardado | null>
  insertarConcepto(c: ConceptoGuardado): Promise<void>
  actualizarConcepto(campanaId: string, version: number, patch: Partial<ConceptoGuardado>): Promise<void>
  /** escritura CONDICIONAL (09-nov · revalidar la gran idea): solo si la versión SIGUE en `estado`; true = escribió */
  actualizarConceptoSi(campanaId: string, version: number, estado: ConceptoGuardado['estado'], patch: Partial<ConceptoGuardado>): Promise<boolean>
  /** 09-nov (revalidar la gran idea): el libro de la mesa de un encargo de la oficina (`oficina_mesa_aportes`, en orden), para rearmar lo que la mesa entregó · solo lectura */
  libroDeLaMesa(encargoId: string): Promise<Array<{ n: number; de: string; tipo: string; texto: string }>>
  /** los conceptos abiertos cuyo plazo propio ya pasó (el vigía los cierra `sin_mesa`) */
  conceptosVencidos(ahora: string): Promise<ConceptoGuardado[]>
  /** 31-oct (T3): todas las versiones del concepto de una campaña, de la 1 en adelante (para contar vueltas de cambios y reaperturas) */
  conceptosDe(campanaId: string): Promise<ConceptoGuardado[]>
  /** 31-oct (T3): la tarjeta «Gran idea» en la bandeja (`hitl_queue` · `metadata.origen = 'cadena'` · `metadata.tipo = 'concepto'` · sin vencimiento: `vencerBandeja` no la toca); devuelve su id */
  abrirTarjetaDeConcepto(t: TarjetaDeConcepto): Promise<string>
  cerrarTarjetaDeConcepto(hitlId: string, d: { status: 'approved' | 'rejected'; decision: Record<string, unknown> }): Promise<void>
  /** 31-oct (T3): la decisión de Emilio sobre la gran idea queda en `eventos_de_emilio`; NUNCA lanza (el libro no frena la decisión) */
  registrarDecisionDeEmilio(e: DecisionDeEmilio): Promise<void>
  // filas
  filas(campanaId: string, calendarioVersion?: number): Promise<Fila[]>
  guardarFilas(campanaId: string, calendarioVersion: number, estrategiaVersion: number, filas: Fila[], seco: boolean): Promise<void>
  cambiarEstadoDeFilas(campanaId: string, calendarioVersion: number, ids: string[], estado: Fila['estado']): Promise<void>
  /** 10-nov · escritura CONDICIONAL de una fila que quedó atrás: solo si sigue sin producir (`validada` o `lista_para_brief`); suma `aviso` a sus avisos. Devuelve si se aplicó. */
  /** 11-nov (#1014 · relectura): `desde` cambia los estados en que la fila tiene que estar para que se aplique (por omisión, sin producir) */
  reubicarFila(campanaId: string, calendarioVersion: number, filaId: string, patch: Partial<Pick<Fila, 'fecha' | 'semana' | 'dia_semana' | 'estado'>>, aviso: string, desde?: readonly Fila['estado'][]): Promise<boolean>
  ultimaVersionDeCalendario(campanaId: string): Promise<number>
  /**
   * 10-nov · LOTE MUERTO (`lote-muerto.ts`) · OPCIONALES: sin ellos el reloj manda los lotes como siempre.
   * `enviosDeLote` = cuántos envíos lleva ESTA llave de lote (ella y sus reintentos, por la llave exacta del registro de la sala) y cuándo fue el último; solo cuentan los envíos con alguna fila
   * que siga en el lote de hoy (ADENDA 3 de CC7). Si falla, LANZA (un error no es «cero envíos»).
   * `avisarLoteMuerto` = abre (o suma una repetición a) el incidente del buzón C1; nunca lanza: devuelve la acción o el error.
   */
  enviosDeLote?(clientId: string, lote: string, llave: string, filasDeHoy: readonly string[]): Promise<import('./lote-muerto').EnviosDeLote>
  avisarLoteMuerto?(a: { clave: string; client_id: string; titulo: string; detalle: string; workflow_id: string | null; workflow_execution_id: string | null; /** 11-nov · de dónde sale el aviso (sin él: «lote sin parte») */ origen?: string }): Promise<{ ok: true; accion: string } | { ok: false; error: string }>
  // validaciones
  guardarValidaciones(campanaId: string, objeto: ObjetoDeValidacion, version: number, tanda: number | null, intento: 1 | 2, hallazgos: Hallazgo[], seco: boolean): Promise<void>
  /** r74 · los hallazgos que BLOQUEAN del último intento guardado de una tanda del calendario (para pedir la corrección si la llamada de corrección murió) */
  hallazgosQueBloquean(campanaId: string, tanda: number): Promise<Array<{ ficha: Ficha; fila_id: string | null; chequeo?: string }>>
  // corridas (guardarraíles 1–5)
  corridaPorClave(campanaId: string, paso: string, clave: string, intento: number): Promise<Corrida | null>
  /** idempotente: si ya existe devuelve la existente con `creada: false` */
  abrirCorrida(c: Omit<Corrida, 'id'>): Promise<{ corrida: Corrida; creada: boolean }>
  cerrarCorrida(id: number, patch: Partial<Corrida>): Promise<void>
  /** descarta una corrida que ESTA llamada acaba de abrir y perdió una carrera (nunca llamó al modelo: no hay costo que registrar) */
  descartarCorrida(id: number): Promise<void>
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
  /** las públicas (sin cliente) y, si se pasa `clientId`, también las temporadas de ESE cliente; una temporada entra si su tramo toca [desde, hasta] */
  fechasEspeciales(pais: string, tipos: string[], desde: string, hasta: string, clientId?: string): Promise<FechaEspecialVerificada[]>
  /**
   * D · las llaves de fechas que ya existen para el país (coberturas y fechas públicas) y las temporadas del cliente: se le dan al agente para que no invente otra grafía.
   * En orden: la usada más recientemente primero (punto 2 de CC7: si dos grafías son la misma fecha, manda la primera, y la que se usa queda primera la vez siguiente).
   */
  llavesDeFechas(pais: string, clientId: string): Promise<LlaveDeFecha[]>
  /** B · una sola alarma por país y tipo: `true` solo para quien inserta la marca (llave única en la base); el resto, `false` */
  marcarAlarmaDeFecha(pais: string, tipo: string): Promise<boolean>
  /** B · las fuentes aparecieron: la marca abierta se CIERRA con su fecha (queda el historial, no se borra); si la configuración se vuelve a vaciar, sale otra alarma */
  cerrarAlarmaDeFecha(pais: string, tipo: string): Promise<void>
  /** la vía de alertas de hoy (#alertas). Nunca lanza; `ok` solo si Slack confirmó la entrega (🟡 CC7: un aviso que no salió no se da por avisado) */
  avisarAlarma(texto: string): Promise<{ ok: boolean; detalle: string }>
  /** C · le pregunta al dueño por la ruta de preguntas; nunca lanza */
  preguntarAlDueno(p: PreguntaAlDueno): Promise<{ ok: boolean; detalle: string }>
  // autoproducir (r65) · el parte guardado, el freno de gasto y el buzón de la sala
  /** el parte de trabajo guardado (`campaign_brief_pack`) con la familia por brief que dejó la copia por filas; `null` si no existe o no es un parte */
  parteDe(parteId: string): Promise<ParteGuardada | null>
  /**
   * r79 · D3 · el parte de un ensayo en seco, guardado MARCADO como seco (`provenance_tag.seco`) y con otra `lote_key` (`seco:<lote>`) para que NUNCA cuente como «ya hay parte de este plan» de un lote real.
   * Idempotente por (cliente, lote): repetir el ensayo reutiliza el mismo parte. Devuelve su id (uuid), el que la puerta de la oficina sí encuentra. Vence solo (`limpiarPartesSecos`).
   */
  guardarParteSeco(p: ParteSecoAGuardar): Promise<string>
  /** r79 · D3 · borra los partes de ensayo ya vencidos (solo filas marcadas seco); devuelve cuántos */
  limpiarPartesSecos(ahora: string): Promise<number>
  /** el freno de gasto §150 (y el tope por cliente de #487) sobre este cliente: `bloqueado` = ya al techo de las 24 h */
  frenoDeGasto(clientId: string): Promise<{ bloqueado: boolean; motivo?: string }>
  /**
   * 10-nov · TOPE POR CAMPAÑA (`tope-de-campana.ts`) · todo lo que el freno necesita leer de ESTA campaña (planeación, concepto, brief, encargos reales de la campaña
   * y de sus partes reales —incluido `parteActual`—, los partes reales y los topes de las familias activas). Si CUALQUIER lectura falla, LANZA (un error no es «cero gastado»).
   */
  leerGastoDeCampana(campanaId: string, parteActual: string): Promise<LecturaDeGasto>
  /**
   * 11-nov (GO Lenovo 01:10Z) · la config con la que la PUERTA DE LA OFICINA decide si produce (estado · familias_activas · clientes_ensayo, `configDeLaPuerta` de la oficina), la MISMA que lee la oficina.
   * OPCIONAL. A diferencia de la oficina (que sin config se apaga), aquí un fallo LANZA: el freno, si no puede leerla, sigue guardando lugar como hoy (del lado seguro).
   */
  configDeLaOficina?(): Promise<import('@/lib/oficina/sobre').ConfigDeOficina>
  /** 10-nov · el buzón de avisos (C1): abre el incidente o le suma una repetición con la MISMA clave · nunca lanza */
  avisarAlBuzon(a: AvisoDelTope & { origen: string; workflow_id: string | null; workflow_execution_id: string | null }): Promise<{ ok: true; accion: string } | { ok: false; error: string }>
  /** r74 · F4 · llena las sedes y su horario con lo que el sistema YA guardó del cliente (sitio · Instagram · Mapas), con su fuente · US$ 0 · un fallo se declara, no frena */
  recolectarSedes(clientId: string): Promise<{ ok: boolean; sedes: number; error?: string }>
  /** deja UN sobre en la sala (intake) · idempotente por su llave: el repetido vuelve `duplicado` · nunca despacha */
  emitirSobre(sobre: SobreDeProducir | SobreDeLote | SobreDePlan | SobreDeTanda): Promise<ResultadoDeEmision>
  /** `client_id` + `hasta` + `origen: 'cliente'` = una temporada de ese cliente (10-nov · C); sin ellos, una fecha pública verificada en una fuente oficial */
  guardarFechaEspecial(f: { pais: string; tipo: string; ambito: string; anio: number; fecha: string; nombre: string; alcance: string; fuente_url: string; cita_literal: string; pagina_hash: string; doble_fuente: boolean; estado: 'verificada' | 'pendiente'; client_id?: string | null; hasta?: string | null; origen?: 'fuente_oficial' | 'cliente' }): Promise<void>
}
