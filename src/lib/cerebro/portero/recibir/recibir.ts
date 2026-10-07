/**
 * RECIBIR · el portero archiva material nuevo de UN cliente (paso 7 del cerebro). US$ 0 mientras el modelo sea simulado.
 *
 * De principio a fin: (1) puertas (`workflow_id` + `workflow_execution_id`, entrada válida) → (2) se guarda el ORIGINAL entero primero →
 * (3) código antes del modelo: cortar en segmentos, firmar, filtro de seguridad POR segmento, herencia por ficha completa →
 * (4) el modelo (una llamada por trozo, sin reintentos, 25 s, topes de gasto, REGISTRADA) devuelve solo NÚMEROS de segmento →
 * (5) el sistema copia el texto original y guarda las firmas → (6) cobertura: lo olvidado se archiva «sin clasificar» →
 * (7) todo o nada por ingreso. Los archivos llegan en base64 (nunca se bajan por dirección) y los bytes no se guardan: solo el tamaño.
 * Este módulo no sabe cómo se llama al modelo, ni cómo se registra, ni cómo se escribe: lo recibe (así se prueba con todo simulado).
 */
import type { Consulta, Fila } from '../../consulta'
import { leerArchivo as leerArchivoReal } from '../../archivos/leer'
import type { LecturaDeArchivo } from '../../archivos/tipos'
import { leerSitio } from '../../lectores'
import { PLAZOS_EN_DIAS } from '../../plazos'
import { type Etiqueta, type FamiliaDeProductos, MAXIMO_DE_LINEAS_DE_PRODUCTO, armarMensajeDeMirada, leerFamiliasDePrueba, lineaDeFamilia, mirarImagen, peorCasoDeMirar, vocabularioDelCatalogo } from '../etiquetar'
import { estimarTokens } from '../medida'
import type { PeticionConImagen } from '../modelo'
import { clienteDePrueba, etiquetaValida } from '../../cliente-de-prueba'
import { CLIENTE_DE_PRUEBA, MODELO, PRECIO_POR_MILLON, RAZONAMIENTO, TIEMPO_MAXIMO_MS, costoDeLaLlamada, type PeticionAlModelo, type RespuestaDelModelo, type ResultadoDeRegistro } from '../razonar'
import { planearHerencia } from './herencia'
import { INSTRUCCION_DE_RECIBIR, armarMensajeDeRecibir } from './instruccion'
import { type Segmento, cortarEnSegmentos, firmaDe } from './segmentos'
import { type Filtro, filtrarSegmentos } from './seguridad'
import { traducir } from './traducir'
import { type Almacen, type Cambios, type FichaViva, type FilaDeFicha, type FilaDeIngreso, ORIGENES, type EstadoDeIngreso, type OrigenDeIngreso } from './tipos'

/** una pasada cabe en 16.000 «tokens» de entrada (instrucción + mensaje); sus 2.000 de salida son el máximo de una pasada */
export const TOPE_DE_ENTRADA_POR_PASADA = 16_000
export const MAX_TOKENS_DE_RECIBIR = 2000
export const TOPE_DE_GASTO_POR_LLAMADA_USD = 0.08
export const TOPE_DE_GASTO_POR_INGRESO_USD = 0.4
/** llamadas al modelo por ingreso (las pasadas normales MÁS los reintentos por una respuesta cortada); con 25 s cada una el ingreso cabe en los 300 s de la ruta */
export const MAXIMO_DE_LLAMADAS_POR_INGRESO = 12
/** una pasada no lleva más de 24 segmentos: la salida esperada (≈ 45 «tokens» por segmento) queda bajo el tope de salida de 2.000 */
export const MAX_SEGMENTOS_POR_PASADA = 24
/** cuántas veces se puede dividir un trozo cuya respuesta se cortó (24 → 12 → 6 → 3 → 1) */
export const PROFUNDIDAD_MAXIMA_DE_DIVISION = 4
/** pasado este tiempo desde la primera llamada no se lanzan más pasadas (lo pendiente queda «sin clasificar») */
export const TIEMPO_TOTAL_MAXIMO_MS = 240_000
export const UMBRAL_DE_PARCIAL = 0.2
export const MAXIMO_DE_CARACTERES_DE_MATERIAL = 400_000
/** el tipo oficial de un Word mide 71 caracteres y el de una hoja 65: se pasa ENTERO al lector (recortarlo lo hacía rechazar) */
export const MAXIMO_DE_CARACTERES_DE_TIPO = 200
export const FILAS_MAXIMAS_POR_LECTURA = 1000
export const MAXIMO_DE_INGRESOS_DE_UNA_FUENTE = 200
export const MOTIVO_DE_RETIRADA_ENTERA = 'ya no está en su fuente'

export interface DepsDeRecibir {
  consulta: Consulta
  almacen: Almacen
  llamarModelo: (p: PeticionAlModelo) => Promise<RespuestaDelModelo>
  /** la llamada con visión (la misma que usa `etiquetar`): una por imagen que llega en base64 */
  llamarModeloConImagen: (p: PeticionConImagen) => Promise<RespuestaDelModelo>
  registrar: (fila: Record<string, unknown>) => Promise<ResultadoDeRegistro>
  leerArchivo?: (entrada: unknown) => Promise<LecturaDeArchivo>
  filtro?: Filtro
  ahora?: () => Date
  /** milisegundos (por defecto `Date.now`): solo para medir el tiempo total de las pasadas */
  reloj?: () => number
  nuevoId?: () => string
  topeDeGastoPorLlamadaUsd?: number
  topeDeGastoPorIngresoUsd?: number
  topeDeEntradaTokens?: number
}

const salida = (status: number, cuerpo: Record<string, unknown>) => ({ status, cuerpo })
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textoLimpio = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const iso = (v: unknown): string | null => { if (typeof v !== 'string' || !v) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString() }

const TIPOS_DE_ARCHIVO_SIN_TEXTO = new Set(['imagen'])
/** firma de una ficha de archivo (empieza con «arch-»: nunca se confunde con la de un segmento de texto) */
export const firmaDeArchivo = (a: { tipo: string; nombre: string; enlace: string | null; bytes: number | null }): string => `arch-${firmaDe(`${a.tipo}|${a.nombre}|${a.enlace ?? ''}|${a.bytes ?? ''}`)}`

interface Entrada {
  cliente: string
  origen: OrigenDeIngreso
  fuenteRef: string | null
  esCompleta: boolean
  texto: string | null
  fechaFuente: string | null
  prueba: boolean
  /** solo en modo prueba: la etiqueta de un cliente de prueba aparte (`prueba-portero-<etiqueta>`); sin ella, el de siempre */
  etiquetaDeCliente: string | undefined
  /** solo en modo prueba: el catálogo con que se valida «qué producto se ve» en una imagen */
  productosDePrueba: string[]
  /** solo en modo prueba: las familias del catálogo de prueba (como en `etiquetar`) */
  familiasDePrueba: FamiliaDeProductos[]
  archivo: { nombre: string; tipo: string | null; enlace: string | null; fecha: string | null; bytes: number | null; texto: string | null; base64: string | null } | null
}

function validar(b: unknown): { ok: true; entrada: Entrada } | { ok: false; errores: string[] } {
  if (!esObjeto(b)) return { ok: false, errores: ['el pedido debe ser un objeto'] }
  const errores: string[] = []
  const cliente = typeof b.cliente === 'string' ? b.cliente.trim() : ''
  if (!cliente || cliente.length > 64 || /\s/.test(cliente)) errores.push('falta `cliente` (un texto sin espacios, de hasta 64 caracteres)')
  if (typeof b.origen !== 'string' || !(ORIGENES as readonly string[]).includes(b.origen)) errores.push(`\`origen\` debe ser uno de: ${ORIGENES.join(', ')}`)
  if (b.fuente_ref !== undefined && b.fuente_ref !== null && (typeof b.fuente_ref !== 'string' || b.fuente_ref.length > 300)) errores.push('`fuente_ref` debe ser un texto de hasta 300 caracteres')
  if (b.es_completa !== undefined && typeof b.es_completa !== 'boolean') errores.push('`es_completa` debe ser verdadero o falso')
  if (b.prueba !== undefined && typeof b.prueba !== 'boolean') errores.push('`prueba` debe ser verdadero o falso')
  if (b.fecha_fuente !== undefined && b.fecha_fuente !== null && iso(b.fecha_fuente) === null) errores.push('`fecha_fuente` no es una fecha legible')
  let productosDePrueba: string[] = []
  if (b.cliente_de_prueba !== undefined) {
    if (b.prueba !== true) errores.push('`cliente_de_prueba` solo se acepta con `prueba: true`')
    else if (!etiquetaValida(b.cliente_de_prueba)) errores.push('`cliente_de_prueba` debe ser un texto de 1 a 32 letras, números o guion bajo')
  }
  if (b.productos_de_prueba !== undefined) {
    const pp = b.productos_de_prueba
    if (b.prueba !== true) errores.push('`productos_de_prueba` solo se acepta con `prueba: true`')
    else if (!Array.isArray(pp) || pp.some((x) => typeof x !== 'string' || x.length > 200) || pp.length > MAXIMO_DE_LINEAS_DE_PRODUCTO) errores.push(`\`productos_de_prueba\` debe ser una lista de hasta ${MAXIMO_DE_LINEAS_DE_PRODUCTO} textos de hasta 200 caracteres`)
    else productosDePrueba = pp as string[]
  }
  let familiasDePrueba: FamiliaDeProductos[] = []
  if (b.familias_de_prueba !== undefined) {
    if (b.prueba !== true) errores.push('`familias_de_prueba` solo se acepta con `prueba: true`')
    else {
      const leidas = leerFamiliasDePrueba(b.familias_de_prueba)
      if (!leidas.ok) errores.push(leidas.error)
      else familiasDePrueba = leidas.familias
    }
  }
  if (b.texto !== undefined && b.texto !== null && typeof b.texto !== 'string') errores.push('`texto` debe ser un texto')
  if (typeof b.texto === 'string' && b.texto.length > MAXIMO_DE_CARACTERES_DE_MATERIAL) errores.push(`\`texto\` pasa de ${MAXIMO_DE_CARACTERES_DE_MATERIAL} caracteres`)
  let archivo: Entrada['archivo'] = null
  if (b.archivo !== undefined && b.archivo !== null) {
    if (!esObjeto(b.archivo)) errores.push('`archivo` debe ser un objeto')
    else {
      const a = b.archivo
      const nombre = typeof a.nombre === 'string' ? a.nombre.replace(/[\u0000-\u001f\u007f\\/]/g, '').slice(0, 200) : ''
      if (!nombre) errores.push('`archivo.nombre` es obligatorio')
      if (a.tamano !== undefined && a.tamano !== null && !(typeof a.tamano === 'number' && Number.isFinite(a.tamano) && a.tamano >= 0)) errores.push('`archivo.tamano` debe ser un número de bytes')
      if (a.fecha !== undefined && a.fecha !== null && iso(a.fecha) === null) errores.push('`archivo.fecha` no es una fecha legible')
      if (a.base64 !== undefined && a.base64 !== null && typeof a.base64 !== 'string') errores.push('`archivo.base64` debe ser un texto')
      archivo = { nombre, tipo: textoLimpio(a.tipo, MAXIMO_DE_CARACTERES_DE_TIPO), enlace: textoLimpio(a.enlace, 1000), fecha: iso(a.fecha), bytes: typeof a.tamano === 'number' ? Math.floor(a.tamano) : null, texto: typeof a.texto === 'string' && a.texto.trim() ? a.texto : null, base64: typeof a.base64 === 'string' && a.base64 ? a.base64 : null }
    }
  }
  const texto = typeof b.texto === 'string' && b.texto.trim() ? b.texto : null
  if (!texto && !archivo) errores.push('falta el material: `texto` o `archivo`')
  if (errores.length) return { ok: false, errores }
  return { ok: true, entrada: { cliente, origen: b.origen as OrigenDeIngreso, fuenteRef: typeof b.fuente_ref === 'string' && b.fuente_ref ? b.fuente_ref : null, esCompleta: b.es_completa === true, texto, fechaFuente: iso(b.fecha_fuente), prueba: b.prueba === true, etiquetaDeCliente: typeof b.cliente_de_prueba === 'string' ? b.cliente_de_prueba : undefined, productosDePrueba, familiasDePrueba, archivo } }
}

/** el tipo de un archivo con enlace se guarda con su barra (`audio/mpeg`), sin caracteres raros */
const resumenDeTipo = (t: string | null): string => {
  const x = (t ?? '').toLowerCase().trim()
  if (x.startsWith('image/') || x === 'imagen') return 'imagen'
  return x.replace(/[^a-z0-9_+./-]/g, '').slice(0, 120) || 'archivo'
}

export async function recibir(deps: DepsDeRecibir, body: unknown): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const ahora = deps.ahora ?? (() => new Date())
  const nuevoId = deps.nuevoId ?? (() => crypto.randomUUID())
  const leerArchivo = deps.leerArchivo ?? leerArchivoReal
  const valido = validar(body)
  if (!valido.ok) return salida(400, { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores: valido.errores })
  const e = valido.entrada
  const b = body as Record<string, unknown>
  const workflowId = typeof b.workflow_id === 'string' && b.workflow_id ? b.workflow_id : null
  const ejecucionId = typeof b.workflow_execution_id === 'string' && b.workflow_execution_id ? b.workflow_execution_id : null
  if (!workflowId || !ejecucionId) {
    const faltan = [!workflowId && 'workflow_id', !ejecucionId && 'workflow_execution_id'].filter(Boolean)
    return salida(403, { error: 'workflow_id_required', code: 'E-WF-ID-REQUIRED', detail: `el portero solo archiva desde un flujo · falta(n): ${faltan.join(', ')}` })
  }
  // una prueba NUNCA usa un cliente real: todo lleva el texto de prueba y la marca (el borrado por la marca deja 0 filas)
  const cliente = e.prueba ? (clienteDePrueba(e.etiquetaDeCliente) as string) : e.cliente
  const marca = e.prueba ? { prueba: true } : {}
  const ahoraD = ahora()
  const ahoraIso = ahoraD.toISOString()
  const topeLlamada = deps.topeDeGastoPorLlamadaUsd ?? TOPE_DE_GASTO_POR_LLAMADA_USD
  const topeIngreso = deps.topeDeGastoPorIngresoUsd ?? TOPE_DE_GASTO_POR_INGRESO_USD
  const topeEntrada = deps.topeDeEntradaTokens ?? TOPE_DE_ENTRADA_POR_PASADA

  // ── 1 · el material: texto, o archivo leído (los bytes se leen y se sueltan: nunca se guardan)
  let material: string | null = e.texto
  let lectura: LecturaDeArchivo | null = null
  let fichaDeArchivo: { tipo: string; nombre: string; enlace: string | null; bytes: number | null; fecha: string | null } | null = null
  let imagenParaMirar: { tipo: string; base64: string } | null = null
  let fallaDeLectura: { estado: string; motivo: string } | null = null
  if (e.archivo) {
    if (e.archivo.base64) {
      lectura = await leerArchivo({ nombre: e.archivo.nombre, tipo: e.archivo.tipo ?? undefined, base64: e.archivo.base64 })
      if (lectura.estado !== 'ok') fallaDeLectura = { estado: lectura.estado, motivo: lectura.motivo ?? lectura.estado }
      else if (lectura.tipo && TIPOS_DE_ARCHIVO_SIN_TEXTO.has(lectura.tipo)) {
        fichaDeArchivo = { tipo: lectura.tipo, nombre: e.archivo.nombre, enlace: e.archivo.enlace, bytes: lectura.bytes, fecha: e.archivo.fecha }
        imagenParaMirar = { tipo: lectura.mime ?? 'image/png', base64: e.archivo.base64 }
      }
      else material = [lectura.texto, e.texto].filter((x): x is string => !!x && x.trim() !== '').join('\n\n') || null
    } else {
      // sin bytes (video, audio, 3D, cualquier cosa con enlace): ficha con su enlace; nunca se baja nada
      fichaDeArchivo = { tipo: resumenDeTipo(e.archivo.tipo), nombre: e.archivo.nombre, enlace: e.archivo.enlace, bytes: e.archivo.bytes, fecha: e.archivo.fecha }
      material = [e.archivo.texto, e.texto].filter((x): x is string => !!x && x.trim() !== '').join('\n\n') || null
    }
  }
  const fechaFuente = e.fechaFuente ?? e.archivo?.fecha ?? null

  // ── 2 · el ORIGINAL primero
  const ingresoId = nuevoId()
  const ingreso: FilaDeIngreso = {
    id: ingresoId, client_id: cliente, origen: e.origen, fuente_ref: e.fuenteRef, es_completa: e.esCompleta,
    huella: lectura?.huella ? lectura.huella.slice(0, 24) : firmaDe(material ?? `${e.archivo?.nombre ?? ''}|${e.archivo?.enlace ?? ''}`),
    material, archivo_nombre: e.archivo?.nombre ?? null, archivo_tipo: lectura?.tipo ?? (e.archivo ? resumenDeTipo(e.archivo.tipo) : null),
    archivo_enlace: e.archivo?.enlace ?? null, archivo_bytes: lectura ? lectura.bytes : e.archivo?.bytes ?? null,
    segmentos_n: null, segmentos_bloqueados: null, estado: 'recibido', cobertura: null, motivo: null, workflow_id: workflowId, workflow_execution_id: ejecucionId, prueba: e.prueba,
  }
  const guardado = await deps.almacen.crearIngreso(ingreso)
  if (!guardado.ok) return salida(502, { error: 'original_no_guardado', code: 'E-ORIGINAL-NOT-SAVED', detail: guardado.detalle ?? 'no se pudo guardar el original', ...marca })

  // ── respuesta común
  const registros: ResultadoDeRegistro[] = []
  let gasto = 0, entrada = 0, salidaTokens = 0, duracionTotal = 0, pasadas = 0, gastoSinRegistrar = 0
  const contadores = { total: 0, apartados: 0, heredados: 0, alModelo: 0, residuales: 0 }
  const resultado = (estado: EstadoDeIngreso, extra: Record<string, unknown> = {}) => {
    const fallidos = registros.filter((r) => !r.ok)
    if (fallidos.length > 0) console.error(`[portero.recibir] LLAMADA_SIN_REGISTRO workflow_id=${workflowId} workflow_execution_id=${ejecucionId} costo_usd=${gastoSinRegistrar} llamadas=${registros.length} fallidas=${fallidos.length}`)
    return salida(200, {
      estado, ingreso_id: ingresoId, llamo_al_modelo: pasadas > 0, costo_usd: gasto, tokens: { entrada, salida: salidaTokens }, duracion_ms: duracionTotal, pasadas,
      segmentos: { total: contadores.total, apartados: contadores.apartados, heredados: contadores.heredados, al_modelo: contadores.alModelo, residuales: contadores.residuales },
      registro: fallidos.length === 0 ? { ok: true } : { ok: false, detalle: fallidos.map((r) => r.detalle).filter(Boolean).join(' · ') || 'el registro falló' },
      ...(fallidos.length > 0 ? { alerta: 'llamada_sin_registro', registro_fallido: true, gasto_sin_registrar_usd: gastoSinRegistrar } : {}),
      ...marca, ...extra,
    })
  }
  const cerrar = async (estado: EstadoDeIngreso, motivo: string | null, extra: Record<string, unknown> = {}, final: { cobertura?: number | null; segmentos_n?: number | null; segmentos_bloqueados?: FilaDeIngreso['segmentos_bloqueados'] } = {}) => {
    const r = await deps.almacen.cerrarIngreso(ingresoId, { estado, motivo, ...final })
    return resultado(estado, { motivo, ...(r.ok ? {} : { alerta_de_cierre: r.detalle ?? 'no se pudo marcar el ingreso' }), fichas: { archivadas: 0, heredadas: 0, retiradas: 0, descartadas: 0, residuales: 0 }, cobertura: final.cobertura ?? null, notas: [], ...extra })
  }

  // ── 3 · el lector de archivos no pudo
  if (fallaDeLectura) return cerrar('fallido', `archivo_${fallaDeLectura.estado}: ${fallaDeLectura.motivo}`)

  // ── 4 · cortar, firmar y filtrar POR segmento
  const segmentos = material ? cortarEnSegmentos(material) : []
  contadores.total = segmentos.length
  const { limpios, apartados } = await filtrarSegmentos(segmentos, { filtro: deps.filtro })
  contadores.apartados = apartados.length
  if (segmentos.length > 0 && limpios.length === 0 && !fichaDeArchivo) {
    return cerrar('bloqueado_por_seguridad', 'todos los segmentos fueron apartados por el filtro de seguridad', {}, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados })
  }

  // ── 5 · las fichas vivas de la misma fuente (un error o un recorte NO se lee como «no hay»)
  const vivas: FichaViva[] = []
  if (e.fuenteRef) {
    const leidas = await leerVivas(deps.consulta, cliente, e.fuenteRef, e.prueba, ingresoId)
    if (!leidas.ok) return cerrar('fallido', leidas.motivo, {}, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
    vivas.push(...leidas.vivas)
  }
  const firmaArchivo = fichaDeArchivo ? firmaDeArchivo(fichaDeArchivo) : null
  const vivasDeTexto = vivas.filter((f) => !f.firmas.some((x) => x.startsWith('arch-')))
  const plan = planearHerencia({ limpios, vivas: vivasDeTexto, esCompleta: e.esCompleta })
  const archivoHeredado = firmaArchivo ? vivas.find((f) => f.firmas.length === 1 && f.firmas[0] === firmaArchivo) ?? null : null
  contadores.heredados = limpios.length - plan.paraModelo.length
  contadores.alModelo = plan.paraModelo.length

  // ── 6 · el modelo: una llamada por trozo, sin reintentos, con topes; TODO falla junto
  const nuevoRegistro = async (ll: { costo: number; duracion: number; usage: { input_tokens: number; output_tokens: number }; fallo: { motivo: string; status: 'failed' | 'timeout'; mensaje: string } | null; stop: string | null }, pasada: number, caida: string | null, extraDeMetadata: Record<string, unknown> = {}) => {
    let registro: ResultadoDeRegistro
    try {
      registro = await deps.registrar({
        workflow_id: workflowId, workflow_execution_id: ejecucionId, agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: ejecucionId,
        model: MODELO, cost_usd: ll.costo, duration_ms: ll.duracion, tokens_input: ll.usage.input_tokens, tokens_output: ll.usage.output_tokens, num_turns: 1,
        status: ll.fallo ? ll.fallo.status : 'completed', ...(ll.fallo ? { error_message: ll.fallo.mensaje } : {}),
        client_id: e.prueba ? CLIENTE_DE_PRUEBA : e.cliente, command: e.prueba ? 'portero.recibir.prueba' : 'portero.recibir', response_text: caida ? `caída: ${caida}` : 'ok',
        metadata: { pasada, ingreso_id: ingresoId, fuente_ref: e.fuenteRef, stop_reason: ll.stop, motivo_de_caida: caida, segmentos_al_modelo: plan.paraModelo.length, ...extraDeMetadata, ...(e.prueba ? { prueba: true, cliente_de_prueba: e.cliente, ...(e.etiquetaDeCliente ? { etiqueta_de_cliente: e.etiquetaDeCliente } : {}) } : {}) },
      })
    } catch (err) { registro = { ok: false, detalle: err instanceof Error ? err.message : String(err) } }
    registros.push(registro)
    if (!registro.ok) gastoSinRegistrar += ll.costo
  }

  // ── 6a · la IMAGEN (si llegó una y no es la misma de antes): UNA llamada con visión, mismas garantías y topes; «qué muestra» va a la ficha, jamás a la tabla de fotos
  let miradaDeLaImagen: Etiqueta | null = null
  const notasDeLaImagen: string[] = []
  if (imagenParaMirar && fichaDeArchivo && !archivoHeredado) {
    let nombresDeProducto: string[] = [...e.familiasDePrueba.map((f) => f.nombre), ...e.productosDePrueba]
    let lineasDeProducto: string[] = [...e.familiasDePrueba.map(lineaDeFamilia), ...e.productosDePrueba]
    let nombresDeFamilia: string[] = e.familiasDePrueba.map((f) => f.nombre)
    if (!e.prueba) {
      const sitio = await leerSitio({ consulta: deps.consulta, cliente: e.cliente, ahora: ahoraD, plazos: PLAZOS_EN_DIAS })
      if (sitio.fallidas > 0) return cerrar('fallido', 'error_de_lectura_de_productos: no se pudo leer el catálogo del cliente para validar lo que se ve en la imagen', {}, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
      const vocabulario = vocabularioDelCatalogo(sitio.lineas)
      nombresDeProducto = vocabulario.nombres
      lineasDeProducto = vocabulario.lineas
      nombresDeFamilia = vocabulario.familias
    }
    // la leyenda es SOLO el texto que ya pasó el filtro (un segmento apartado nunca llega al modelo de visión)
    const mensajeDeImagen = armarMensajeDeMirada(limpios.map((s) => s.texto).join('\n\n').slice(0, 1500), lineasDeProducto)
    const peorDeImagen = peorCasoDeMirar(mensajeDeImagen)
    if (peorDeImagen > topeLlamada || peorDeImagen > topeIngreso) {
      return cerrar('fallido', `tope_de_gasto: el peor caso de mirar la imagen (US$ ${peorDeImagen.toFixed(4)}) pasa del tope`, { costo_maximo_calculado_usd: peorDeImagen }, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
    }
    const mirada = await mirarImagen(deps.llamarModeloConImagen, imagenParaMirar, mensajeDeImagen, nombresDeProducto, nombresDeFamilia)
    pasadas++; gasto += mirada.costo; entrada += mirada.usage.input_tokens; salidaTokens += mirada.usage.output_tokens; duracionTotal += mirada.duracion
    await nuevoRegistro({ costo: mirada.costo, duracion: mirada.duracion, usage: mirada.usage, fallo: mirada.fallo, stop: mirada.respuesta?.stop_reason ?? null }, pasadas, mirada.caida, { paso: 'imagen', imagen_bytes: fichaDeArchivo.bytes })
    if (mirada.caida || !mirada.etiqueta) {
      return cerrar('fallido', `${mirada.caida ?? 'json_roto'}: ${mirada.fallo?.mensaje ?? 'la respuesta del modelo al mirar la imagen no se pudo leer'}`, {}, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
    }
    miradaDeLaImagen = mirada.etiqueta
    for (const d of mirada.descartados) notasDeLaImagen.push(`imagen: el producto «${d}» no está en el catálogo del cliente y se descartó`)
  }

  const trozos = partirEnTrozos(plan.paraModelo, (segs) => estimarTokens(INSTRUCCION_DE_RECIBIR.length + armarMensajeDeRecibir({ origen: e.origen, fuenteRef: e.fuenteRef, fechaFuente, segmentos: segs, afectadas: plan.afectadas }).length), topeEntrada)
  const respuestas: Array<{ texto: string; cortada?: boolean }> = []
  let motivoParcial: string | null = null
  let divisiones = 0
  // una COLA de trozos: si la respuesta de uno se corta por el tope de salida, ese trozo se divide en dos y se reintenta solo ese trozo (acotado); nunca se tira el ingreso por un corte
  const cola: Array<{ segs: Segmento[]; prof: number }> = trozos.map((segs) => ({ segs, prof: 0 }))
  const reloj = deps.reloj ?? (() => Date.now())
  const inicioDeLasPasadas = reloj()
  while (cola.length > 0) {
    const trozo = cola.shift() as { segs: Segmento[]; prof: number }
    const mensaje = armarMensajeDeRecibir({ origen: e.origen, fuenteRef: e.fuenteRef, fechaFuente, segmentos: trozo.segs, afectadas: plan.afectadas })
    const peor = costoDeLaLlamada({ input_tokens: estimarTokens(INSTRUCCION_DE_RECIBIR.length + mensaje.length), output_tokens: MAX_TOKENS_DE_RECIBIR })
    if (pasadas >= MAXIMO_DE_LLAMADAS_POR_INGRESO) { motivoParcial = `tope_de_pasadas: más de ${MAXIMO_DE_LLAMADAS_POR_INGRESO} llamadas`; break }
    if (reloj() - inicioDeLasPasadas > TIEMPO_TOTAL_MAXIMO_MS) { motivoParcial = `tiempo: pasaron ${TIEMPO_TOTAL_MAXIMO_MS / 1000} s desde la primera llamada`; break }
    if (gasto > 0 && gasto + peor > topeIngreso) { motivoParcial = `tope_de_gasto_del_ingreso: US$ ${topeIngreso}`; break }
    if (peor > topeLlamada || (pasadas === 0 && peor > topeIngreso)) {
      if (pasadas === 0) return cerrar('fallido', `tope_de_gasto: el peor caso de la llamada (US$ ${peor.toFixed(4)}) pasa del tope`, { costo_maximo_calculado_usd: peor }, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
      motivoParcial = `tope_de_gasto_del_ingreso: la llamada ${pasadas + 1} pasa del tope por llamada`; break
    }
    const inicio = Date.now()
    let respuesta: RespuestaDelModelo | null = null
    let fallo: { motivo: string; status: 'failed' | 'timeout'; mensaje: string } | null = null
    try {
      respuesta = await deps.llamarModelo({ model: MODELO, max_tokens: MAX_TOKENS_DE_RECIBIR, thinking: RAZONAMIENTO, system: INSTRUCCION_DE_RECIBIR, messages: [{ role: 'user', content: mensaje }], timeoutMs: TIEMPO_MAXIMO_MS })
    } catch (err) {
      const nombre = err instanceof Error ? err.name : ''
      const t = err instanceof Error ? err.message : String(err)
      fallo = nombre === 'SinLlave' ? { motivo: 'sin_llave', status: 'failed', mensaje: t } : nombre === 'AbortError' ? { motivo: 'tiempo', status: 'timeout', mensaje: `pasó de ${TIEMPO_MAXIMO_MS} ms` } : { motivo: 'error_del_modelo', status: 'failed', mensaje: t.slice(0, 300) }
    }
    const usage = respuesta?.usage ?? { input_tokens: 0, output_tokens: 0 }
    const costo = respuesta ? costoDeLaLlamada(usage) : 0
    const duracion = Date.now() - inicio
    pasadas++; gasto += costo; entrada += usage.input_tokens; salidaTokens += usage.output_tokens; duracionTotal += duracion
    const cortada = respuesta?.stop_reason === 'max_tokens'
    if (fallo) { await nuevoRegistro({ costo, duracion, usage, fallo, stop: null }, pasadas, fallo.motivo); return cerrar('fallido', `${fallo.motivo}: ${fallo.mensaje}`, {}, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null }) }
    const sePuedeDividir = cortada && trozo.segs.length > 1 && trozo.prof < PROFUNDIDAD_MAXIMA_DE_DIVISION
    await nuevoRegistro({ costo, duracion, usage, fallo: null, stop: respuesta?.stop_reason ?? null }, pasadas, cortada ? 'salida_cortada' : null, cortada ? { dividido: sePuedeDividir, segmentos_del_trozo: trozo.segs.length } : {})
    if (sePuedeDividir) {
      // la respuesta cortada NO se usa: el trozo se parte en dos mitades y se reintentan, en orden, antes que lo que sigue
      const mitad = Math.ceil(trozo.segs.length / 2)
      cola.unshift({ segs: trozo.segs.slice(0, mitad), prof: trozo.prof + 1 }, { segs: trozo.segs.slice(mitad), prof: trozo.prof + 1 })
      divisiones++
      continue
    }
    // sin cortar (o un trozo que ya no se puede dividir: entonces `traducir` lo declara `salida_cortada` y el ingreso falla como siempre)
    respuestas.push({ texto: (respuesta as RespuestaDelModelo).texto, cortada })
  }

  // ── 7 · traducir números → fichas con el texto copiado (todo segmento acaba en algún lado)
  const ctx = { cliente, ingresoId, origen: e.origen, fechaFuente, ahora: ahoraD, prueba: e.prueba, paraModelo: plan.paraModelo, afectadas: plan.afectadas, nuevoId }
  const t = traducir(respuestas, ctx)
  if (!t.ok) {
    const ultima = respuestas[respuestas.length - 1]
    return cerrar('fallido', `${t.caida}: la respuesta del modelo no se pudo leer${ultima?.cortada ? ' (se cortó por el tope de salida)' : ''}`, {}, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
  }
  contadores.residuales = t.segmentosResiduales

  const fichas: FilaDeFicha[] = [...t.fichas]
  if (fichaDeArchivo && !archivoHeredado) fichas.push(filaDeArchivo({ cliente, ingresoId, origen: e.origen, ahoraIso, prueba: e.prueba, id: nuevoId(), a: fichaDeArchivo, mirada: miradaDeLaImagen, firma: firmaArchivo as string, propiedad: e.origen === 'dueno' || e.origen === 'su_fuente' ? 'propia' : 'incierta' }))
  const retiradas = [...plan.sinFirmas.map((f) => ({ id: f.id, motivo: MOTIVO_DE_RETIRADA_ENTERA })), ...t.retiradas]
  const heredadas = [...plan.heredadas.map((f) => f.id), ...(archivoHeredado ? [archivoHeredado.id] : [])]
  const cobertura = plan.paraModelo.length === 0 ? 1 : Math.round(((plan.paraModelo.length - t.segmentosResiduales) / plan.paraModelo.length) * 10_000) / 10_000
  const parcial = motivoParcial !== null || (plan.paraModelo.length > 0 && t.segmentosResiduales / plan.paraModelo.length > UMBRAL_DE_PARCIAL)
  const estado: EstadoDeIngreso = parcial ? 'parcial' : 'fichado'
  const motivoFinal = motivoParcial ?? (parcial ? `cobertura baja: ${t.segmentosResiduales} de ${plan.paraModelo.length} segmentos quedaron sin clasificar` : null)
  const cambios: Cambios = {
    ingreso_id: ingresoId, client_id: cliente, prueba: e.prueba, fichas, heredadas, reconfirmado_en: ahoraIso, retiradas, retirada_en: ahoraIso,
    final: { estado, cobertura, motivo: motivoFinal, segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null },
  }

  // ── 8 · todo o nada por ingreso
  const escrito = await deps.almacen.aplicar(cambios)
  if (!escrito.ok) {
    const r = await cerrar('fallido', `escritura: ${escrito.detalle ?? 'no se pudo escribir'}`, { alerta: 'escritura_fallida', ...(escrito.compensado === false ? { compensado: false } : {}) }, { segmentos_n: segmentos.length, segmentos_bloqueados: apartados.length ? apartados : null })
    return r
  }
  const filasDeModelo = fichas.filter((f) => !f.descartada)
  return resultado(estado, {
    ...(motivoFinal ? { motivo: motivoFinal } : {}),
    fichas: { archivadas: filasDeModelo.length, heredadas: heredadas.length, retiradas: retiradas.length, descartadas: fichas.filter((f) => f.descartada).length, residuales: fichas.filter((f) => f.residual).length },
    cobertura, notas: [...t.notas, ...notasDeLaImagen], ...(divisiones > 0 ? { divisiones } : {}),
  })
}

/** las fichas vivas (no retiradas, no descartadas, no reemplazadas) de las entregas anteriores de esta misma fuente, del mismo cliente y del mismo modo (real o prueba) */
async function leerVivas(consulta: Consulta, cliente: string, fuenteRef: string, prueba: boolean, ingresoActual: string): Promise<{ ok: true; vivas: FichaViva[] } | { ok: false; motivo: string }> {
  const ing = await consulta({ tabla: 'cerebro_ingresos', columnas: ['id'], donde: { client_id: cliente, fuente_ref: fuenteRef, prueba }, limite: FILAS_MAXIMAS_POR_LECTURA })
  if (ing.error) return { ok: false, motivo: `lectura_de_fichas_fallo: ${ing.error}` }
  const ids = ing.filas.map((f: Fila) => String(f.id)).filter((id) => id !== ingresoActual)
  // el tope de entregas (200) es menor que el de la base (1.000): una lectura recortada por la base lo pasa siempre
  if (ids.length > MAXIMO_DE_INGRESOS_DE_UNA_FUENTE) return { ok: false, motivo: `lectura_de_fichas_recortada: la fuente tiene demasiadas entregas anteriores para leerlas completas (tope ${MAXIMO_DE_INGRESOS_DE_UNA_FUENTE})` }
  const todas: Fila[] = []
  for (const id of ids) {
    const r = await consulta({ tabla: 'cerebro_fichas', columnas: ['id', 'ref', 'titulo', 'que_es', 'firmas', 'retirada_en', 'descartada', 'version_de', 'ingreso_id'], donde: { ingreso_id: id, client_id: cliente, prueba }, limite: FILAS_MAXIMAS_POR_LECTURA })
    if (r.error) return { ok: false, motivo: `lectura_de_fichas_fallo: ${r.error}` }
    if (r.filas.length >= FILAS_MAXIMAS_POR_LECTURA) return { ok: false, motivo: `lectura_de_fichas_recortada: una entrega anterior tiene ${FILAS_MAXIMAS_POR_LECTURA} fichas o más y la lectura se corta ahí` }
    todas.push(...r.filas)
  }
  const reemplazadas = new Set(todas.map((f) => f.version_de).filter((v) => v !== null && v !== undefined).map(String))
  const vivas = todas
    .filter((f) => !f.retirada_en && f.descartada !== true && !reemplazadas.has(String(f.id)) && Array.isArray(f.firmas) && f.firmas.length > 0)
    .map((f): FichaViva => ({ id: String(f.id), ref: String(f.ref ?? `ficha:${String(f.id)}`), titulo: String(f.titulo ?? ''), que_es: String(f.que_es ?? ''), firmas: (f.firmas as unknown[]).map(String) }))
  return { ok: true, vivas }
}

/** corta los segmentos en trozos que caben en una llamada (al menos un segmento por trozo; un segmento ya mide ≤ 600 caracteres) */
function partirEnTrozos(segmentos: Segmento[], medir: (s: Segmento[]) => number, tope: number, maximoDeSegmentos: number = MAX_SEGMENTOS_POR_PASADA): Segmento[][] {
  const trozos: Segmento[][] = []
  let actual: Segmento[] = []
  for (const s of segmentos) {
    if (actual.length > 0 && (actual.length >= maximoDeSegmentos || medir([...actual, s]) > tope)) { trozos.push(actual); actual = [] }
    actual.push(s)
  }
  if (actual.length > 0) trozos.push(actual)
  return trozos
}

function filaDeArchivo(a: { cliente: string; ingresoId: string; origen: OrigenDeIngreso; ahoraIso: string; prueba: boolean; id: string; firma: string; propiedad: 'propia' | 'incierta'; mirada: Etiqueta | null; a: { tipo: string; nombre: string; enlace: string | null; bytes: number | null; fecha: string | null } }): FilaDeFicha {
  const d = a.a
  const m = a.mirada
  return {
    id: a.id, client_id: a.cliente, ingreso_id: a.ingresoId, ref: `ficha:${a.id}`, clase: m ? 'foto' : 'archivo', titulo: d.nombre.slice(0, 200),
    que_es: m ? `Foto: ${m.que_muestra}`.slice(0, 400) : `Archivo ${d.tipo} «${d.nombre.slice(0, 120)}»`,
    // un archivo que no se mira (video, audio, 3D) NO lleva texto; una imagen mirada lleva el texto que se lee en ella
    contenido: m && m.texto_visible ? m.texto_visible : null, archivo_nombre: d.nombre, archivo_tipo: d.tipo, archivo_enlace: d.enlace, archivo_bytes: d.bytes, firmas: [a.firma], origen: a.origen, fecha_fuente: d.fecha,
    reconfirmado_en: a.ahoraIso, plazo: 'archivo_propio', vigente_hasta: null, version_de: null, huella: a.firma.slice(5), producto: m ? m.producto_visto : [], sede: null, propiedad: a.propiedad, porque: null,
    descartada: false, motivo_descarte: null, juzgado_por: m ? 'modelo' : 'regla', residual: false,
    provenance_tag: { source: 'cerebro_recibir', trust_level: a.origen === 'dueno' ? 'tenant_trusted' : 'untrusted', ingress_route: 'cerebro/portero/recibir', ingress_id: a.ingresoId, received_at: a.ahoraIso, ...(m ? { etiqueta: { confianza: m.confianza, modelo: MODELO } } : {}) }, prueba: a.prueba,
  }
}

export { PRECIO_POR_MILLON }
