/**
 * RECADOS DE LA SALA · PASO 1 · la lógica de la puerta `POST /api/sala/recados` (abrir · cerrar · leer). Diseño: raw/tasks/2026-10-08-DISENO-CC3-recados-de-la-sala.md.
 * Sin base ni red: recibe un `Almacen` (así se prueba con una base en memoria). Nadie la llama todavía (la migración no está aplicada).
 *
 * Lo que garantiza, por construcción:
 *  · IDEMPOTENTE por clave: un cliente + una clave = a lo más UN recado abierto (la base lo impone con un índice único parcial; aquí se resuelve la carrera);
 *  · un destino que NO opera (por configurar, no existe, apagado) cierra el recado como «no_conseguido» EN EL ACTO: no se espera, no se repite dentro de la hora, no abre cadenas;
 *  · tope de recados abiertos por cliente; los de prueba (`prueba: true`) viven aparte de los reales;
 *  · cerrar es definitivo e idempotente; leer no escribe.
 * No hay destino «emilio»: nada va a Emilio. Esta puerta no emite sobres a la sala todavía (el reparto y la retoma son los pasos 3 y 4 del diseño).
 */

export const MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE = 10
/** un faltante contra un brazo que no opera no se vuelve a registrar dentro de este tiempo (anti-spam, anti-bucle) */
export const MINUTOS_SIN_REPETIR_UN_NO_CONSEGUIDO = 60

export type EstadoDeRecado = 'abierto' | 'repartido' | 'cumplido' | 'no_conseguido'
export interface Destino { destino: string; tipo: 'herramienta' | 'agente' | 'persona'; flujo_que_reparte: string | null; plazo_minutos: number; estado_del_brazo: 'opera' | 'por_configurar' | 'no_existe'; activo: boolean }
export interface Recado {
  id: number; client_id: string; clave_de_agrupacion: string; que_falta: string; para_el_trabajo: Record<string, unknown>; bloquea: boolean; pedido_original: Record<string, unknown> | null
  destino: string; razon_del_destino: string | null; estado: EstadoDeRecado; plazo_en: string | null; avisado_en: string | null; retomado_en: string | null
  creado_en: string | null; cerrado_en: string | null; ficha_ids: string[] | null; motivo_de_cierre?: string | null; prueba: boolean
}
export type FilaNueva = Pick<Recado, 'client_id' | 'clave_de_agrupacion' | 'que_falta' | 'para_el_trabajo' | 'bloquea' | 'pedido_original' | 'destino' | 'razon_del_destino' | 'estado' | 'plazo_en' | 'prueba'> & { cerrado_en?: string | null; motivo_de_cierre?: string | null }

export interface Almacen {
  leerDestino(destino: string): Promise<Destino | null>
  buscarAbierto(clientId: string, clave: string, prueba: boolean): Promise<Recado | null>
  buscarNoConseguidoReciente(clientId: string, clave: string, prueba: boolean, desdeIso: string): Promise<Recado | null>
  contarAbiertos(clientId: string, prueba: boolean): Promise<number>
  abiertosDe(clientId: string, prueba: boolean): Promise<Recado[]>
  leerPorId(id: number): Promise<Recado | null>
  insertar(fila: FilaNueva): Promise<{ ok: true; recado: Recado } | { ok: false; duplicado: boolean; detalle: string }>
  /** cierra SOLO si sigue abierto o repartido (condicional en la base); devuelve el recado ya cerrado, o null si ya no estaba abierto */
  cerrar(id: number, patch: Partial<Recado>): Promise<Recado | null>
}

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const invalida = (errores: string[]): Respuesta => r(400, { error: 'entrada_invalida', errores })
const texto = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null)

const publico = (x: Recado) => ({ numero: x.id, client_id: x.client_id, clave_de_agrupacion: x.clave_de_agrupacion, que_falta: x.que_falta, destino: x.destino, estado: x.estado, bloquea: x.bloquea, plazo_en: x.plazo_en, creado_en: x.creado_en, cerrado_en: x.cerrado_en, ficha_ids: x.ficha_ids, prueba: x.prueba })

export async function procesarRecado(almacen: Almacen, cuerpo: unknown, ahora: Date): Promise<Respuesta> {
  if (!esObjeto(cuerpo)) return r(400, { error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] })
  try {
    switch (cuerpo.accion) {
      case 'abrir': return await abrir(almacen, cuerpo, ahora)
      case 'cerrar': return await cerrar(almacen, cuerpo, ahora)
      case 'leer': return await leer(almacen, cuerpo)
      default: return r(400, { error: 'accion_desconocida', detalle: '`accion` debe ser abrir, cerrar o leer' })
    }
  } catch (e) {
    return r(500, { error: 'almacen_error', detalle: e instanceof Error ? e.message : String(e) })
  }
}

async function abrir(almacen: Almacen, b: Record<string, unknown>, ahora: Date): Promise<Respuesta> {
  const errores: string[] = []
  const clientId = texto(b.client_id, 1, 100), clave = texto(b.clave_de_agrupacion, 1, 200), queFalta = texto(b.que_falta, 1, 2000), destinoNombre = texto(b.destino, 1, 100)
  if (!clientId) errores.push('`client_id` es un texto de 1 a 100 caracteres')
  if (!clave) errores.push('`clave_de_agrupacion` es un texto de 1 a 200 caracteres')
  if (!queFalta) errores.push('`que_falta` es un texto de 1 a 2000 caracteres')
  if (!destinoNombre) errores.push('`destino` es obligatorio')
  if (b.bloquea !== undefined && typeof b.bloquea !== 'boolean') errores.push('`bloquea` debe ser verdadero o falso')
  if (b.prueba !== undefined && typeof b.prueba !== 'boolean') errores.push('`prueba` debe ser verdadero o falso')
  if (b.para_el_trabajo !== undefined && !esObjeto(b.para_el_trabajo)) errores.push('`para_el_trabajo` debe ser un objeto')
  if (b.pedido_original !== undefined && !esObjeto(b.pedido_original)) errores.push('`pedido_original` debe ser un objeto')
  if (b.razon_del_destino !== undefined && b.razon_del_destino !== null && texto(b.razon_del_destino, 0, 1000) === null && b.razon_del_destino !== '') errores.push('`razon_del_destino` es un texto de hasta 1000 caracteres')
  if (errores.length || !clientId || !clave || !queFalta || !destinoNombre) return invalida(errores)
  const prueba = b.prueba === true
  const razon = typeof b.razon_del_destino === 'string' && b.razon_del_destino.trim() ? b.razon_del_destino.trim() : null

  const destino = await almacen.leerDestino(destinoNombre)
  if (!destino) return r(400, { error: 'destino_desconocido', detalle: `no hay un destino «${destinoNombre}»` })

  // 1 · idempotente: ya hay uno abierto igual → ese número
  const existente = await almacen.buscarAbierto(clientId, clave, prueba)
  if (existente) return r(200, { ...publico(existente), ya_abierto: true })

  const base: Omit<FilaNueva, 'estado' | 'plazo_en'> = { client_id: clientId, clave_de_agrupacion: clave, que_falta: queFalta, para_el_trabajo: (b.para_el_trabajo as Record<string, unknown>) ?? {}, bloquea: b.bloquea === true, pedido_original: (b.pedido_original as Record<string, unknown>) ?? null, destino: destino.destino, razon_del_destino: razon, prueba }

  // 2 · el brazo no opera → «no conseguido» en el acto (sin esperar), sin repetirse dentro de la hora
  if (!destino.activo || destino.estado_del_brazo !== 'opera') {
    const desde = new Date(ahora.getTime() - MINUTOS_SIN_REPETIR_UN_NO_CONSEGUIDO * 60_000).toISOString()
    const reciente = await almacen.buscarNoConseguidoReciente(clientId, clave, prueba, desde)
    if (reciente) return r(200, { ...publico(reciente), ya_registrado: true, motivo: 'brazo_no_disponible' })
    const motivo = `brazo_no_disponible: ${destino.activo ? destino.estado_del_brazo : 'destino apagado'}`
    const ins = await almacen.insertar({ ...base, estado: 'no_conseguido', plazo_en: null, cerrado_en: ahora.toISOString(), motivo_de_cierre: motivo })
    if (!ins.ok) return r(500, { error: 'almacen_error', detalle: ins.detalle })
    return r(200, { ...publico(ins.recado), ya_registrado: false, motivo: 'brazo_no_disponible' })
  }

  // 3 · tope de recados abiertos por cliente
  if ((await almacen.contarAbiertos(clientId, prueba)) >= MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE) {
    return r(409, { error: 'tope_de_recados_abiertos', detalle: `el cliente ya tiene ${MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE} recados abiertos` })
  }

  // 4 · abrir (el plazo en MINUTOS lo manda el destino); la carrera con otro escritor la resuelve el índice único de la base
  const plazo = new Date(ahora.getTime() + destino.plazo_minutos * 60_000).toISOString()
  const ins = await almacen.insertar({ ...base, estado: 'abierto', plazo_en: plazo })
  if (ins.ok) return r(201, { ...publico(ins.recado), ya_abierto: false })
  if (ins.duplicado) {
    const ganador = await almacen.buscarAbierto(clientId, clave, prueba)
    if (ganador) return r(200, { ...publico(ganador), ya_abierto: true })
  }
  return r(500, { error: 'almacen_error', detalle: ins.detalle })
}

async function cerrar(almacen: Almacen, b: Record<string, unknown>, ahora: Date): Promise<Respuesta> {
  const errores: string[] = []
  const numero = b.numero
  if (typeof numero !== 'number' || !Number.isInteger(numero) || numero < 1) errores.push('`numero` es un entero desde 1')
  if (b.resultado !== 'cumplido' && b.resultado !== 'no_conseguido') errores.push('`resultado` es cumplido o no_conseguido')
  let fichas: string[] | null = null
  if (b.ficha_ids !== undefined && b.ficha_ids !== null) {
    if (!Array.isArray(b.ficha_ids) || b.ficha_ids.length > 200 || b.ficha_ids.some((x) => typeof x !== 'string' || !x || x.length > 100)) errores.push('`ficha_ids` es una lista de hasta 200 textos')
    else fichas = b.ficha_ids as string[]
  }
  if (b.motivo !== undefined && b.motivo !== null && texto(b.motivo, 1, 1000) === null) errores.push('`motivo` es un texto de hasta 1000 caracteres')
  if (errores.length || typeof numero !== 'number') return invalida(errores)

  const actual = await almacen.leerPorId(numero)
  if (!actual) return r(404, { error: 'no_encontrado', detalle: `no hay un recado número ${numero}` })
  if (actual.estado === 'cumplido' || actual.estado === 'no_conseguido') return r(200, { ...publico(actual), ya_cerrado: true })

  const patch: Partial<Recado> = { estado: b.resultado as EstadoDeRecado, cerrado_en: ahora.toISOString() }
  if (fichas) patch.ficha_ids = fichas
  if (typeof b.motivo === 'string' && b.motivo.trim()) patch.motivo_de_cierre = b.motivo.trim()
  const cerrado = await almacen.cerrar(numero, patch)
  if (cerrado) return r(200, { ...publico(cerrado), ya_cerrado: false })
  // otro lo cerró entre la lectura y la escritura: se devuelve lo que quedó
  const ahoraEs = await almacen.leerPorId(numero)
  return ahoraEs ? r(200, { ...publico(ahoraEs), ya_cerrado: true }) : r(404, { error: 'no_encontrado' })
}

async function leer(almacen: Almacen, b: Record<string, unknown>): Promise<Respuesta> {
  if (b.numero !== undefined) {
    if (typeof b.numero !== 'number' || !Number.isInteger(b.numero) || b.numero < 1) return invalida(['`numero` es un entero desde 1'])
    const x = await almacen.leerPorId(b.numero)
    return x ? r(200, { recado: publico(x) }) : r(404, { error: 'no_encontrado', detalle: `no hay un recado número ${b.numero}` })
  }
  const clientId = texto(b.client_id, 1, 100)
  if (!clientId) return invalida(['hace falta `client_id` o `numero`'])
  if (b.prueba !== undefined && typeof b.prueba !== 'boolean') return invalida(['`prueba` debe ser verdadero o falso'])
  const lista = await almacen.abiertosDe(clientId, b.prueba === true)
  return r(200, { recados: lista.map(publico) })
}
