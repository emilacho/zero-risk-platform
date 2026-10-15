/**
 * PLAN v3 · V13 · EL ESTADO DE LA CORRIDA DEL PLAN (`plan_corridas`) · diseño §17.1 (S2) + el menor de CC#3. Puro: el almacén y el reloj entran por puertos. NADIE lo llama todavía.
 *
 *   · Se crea en el PRIMER pre-vuelo (`abrir`): `espera_desde` se escribe UNA vez (insert-once) y `vence_en = espera_desde + espera máxima`. Un reinicio nunca reinicia el reloj.
 *   · UNA corrida activa por cliente (índice único parcial en la base). Otra `corrida` con una activa ⇒ 409 `corrida_activa` (sin plan, sin gasto).
 *   · El re-disparo con la MISMA `corrida` es una continuación legítima: avanza con compare-and-set sobre `intentos`; dos re-disparos simultáneos con el mismo `n` ⇒ gana uno.
 *   · `barrer` (estilo vigía): lo que pasó su `vence_en` sin cierre libera al cliente — `esperando` ⇒ `vencida` (declarado, no es falla), `corriendo` ⇒ `fallida`. Idempotente.
 *   · El plan NUNCA se dispara desde aquí: este módulo solo lleva el estado.
 */

export const ESTADOS_VIVOS = ['esperando', 'corriendo'] as const
export const ESTADOS_TERMINALES = ['hecha', 'vencida', 'fallida'] as const
export type EstadoDeCorrida = (typeof ESTADOS_VIVOS)[number] | (typeof ESTADOS_TERMINALES)[number]

/** espera máxima del «cerebro listo»: 45 min (AVISO-LENOVO 15-oct: el despertar completo tarda más que los 30 del §16; 10 lecturas cada 5 min). Reanudable; vencida ⇒ corre con lo del alta y lo declara, nunca Apify en su lugar. Fila del catálogo cuando exista (V1); este valor es el de omisión. */
export const ESPERA_MAXIMA_MIN = 45
/** techo de una corrida en marcha: el plan mide ≈ 80 min en el peor caso (§10.3) + holgura; pasado esto el barrido la da por fallida y libera al cliente */
export const TECHO_DE_CORRIDA_MIN = 100
export const CADA_REINTENTO_S = 300
/** gracia del barrido sobre una espera: el re-disparo de la ÚLTIMA lectura (a `vence_en`) llega con retraso; el barrido no toca una `esperando` hasta `vence_en + gracia` (≥ 2 re-disparos), así la
 * última lectura corre y el plan sale «con lo del alta, declarado» (§16) en vez de encontrar la fila ya `vencida`. Solo afecta a `esperando`; `corriendo` ya tiene su techo. */
export const GRACIA_DEL_BARRIDO_MIN = 10

export interface FilaDeCorrida {
  id: string
  client_id: string
  corrida: string
  estado: EstadoDeCorrida
  espera_desde: string
  vence_en: string
  intentos: number
  motivo: string | null
  dry_run: boolean
  actualizado_en: string
}

export interface PuertoDeCorridas {
  ahora(): Date
  /** `INSERT … ON CONFLICT (client_id, corrida) DO NOTHING`: devuelve la fila que quedó (la nueva o la que ya estaba) y si la creó ESTA llamada. Si choca con el índice de «una activa por cliente» ⇒ `{ choque: true }`. */
  insertarUnaVez(f: Omit<FilaDeCorrida, 'id' | 'actualizado_en'>): Promise<{ creada: boolean; fila: FilaDeCorrida } | { choque: true }>
  leer(client_id: string, corrida: string): Promise<FilaDeCorrida | null>
  activaDe(client_id: string): Promise<FilaDeCorrida | null>
  /** `UPDATE … WHERE client_id AND corrida AND intentos = :n AND estado IN (vivos)`: 0 filas ⇒ `null` (perdió la carrera o ya no está viva) */
  avanzarSi(client_id: string, corrida: string, intentosEsperado: number, cambios: Partial<Pick<FilaDeCorrida, 'estado' | 'intentos' | 'vence_en' | 'motivo'>>): Promise<FilaDeCorrida | null>
  vivasVencidas(ahoraIso: string): Promise<FilaDeCorrida[]>
}

const minutos = (d: Date, m: number): string => new Date(d.getTime() + m * 60_000).toISOString()

export type ResultadoDeAbrir =
  | { status: 200; accion: 'abierta' | 'continua'; fila: FilaDeCorrida; vencida: boolean; reintentar_en_s: number }
  | { status: 200; accion: 'terminada'; fila: FilaDeCorrida }
  | { status: 409; error: 'corrida_activa'; corrida_activa: string; estado: EstadoDeCorrida; desde: string }
  | { status: 409; error: 'dry_run_distinto'; corrida: string; dry_run_de_la_corrida: boolean; dry_run_pedido: boolean }
  | { status: 400; error: 'entrada_invalida'; errores: string[] }

export function validarEntrada(e: { client_id?: unknown; corrida?: unknown; dry_run?: unknown }, exigirDryRun = true): string[] {
  const m: string[] = []
  if (typeof e.client_id !== 'string' || !e.client_id.trim()) m.push('`client_id` es obligatorio')
  if (typeof e.corrida !== 'string' || !e.corrida.trim() || e.corrida.length > 120) m.push('`corrida` es obligatoria (texto de hasta 120 caracteres)')
  if (exigirDryRun && typeof e.dry_run !== 'boolean') m.push('`dry_run` es obligatorio y debe ser booleano')
  return m
}

/** el primer pre-vuelo y todo re-disparo: crea la fila (una vez) o continúa la que ya existe; nunca reinicia el reloj */
export async function abrir(P: PuertoDeCorridas, e: { client_id: string; corrida: string; dry_run: boolean }, o: { espera_max_min?: number } = {}): Promise<ResultadoDeAbrir> {
  const errores = validarEntrada(e)
  if (errores.length) return { status: 400, error: 'entrada_invalida', errores }
  const ahora = P.ahora()
  const espera = o.espera_max_min ?? ESPERA_MAXIMA_MIN
  const previa = await P.leer(e.client_id, e.corrida)
  if (previa) return continuarSiCoincide(previa, e, ahora, espera)
  const activa = await P.activaDe(e.client_id)
  if (activa) return { status: 409, error: 'corrida_activa', corrida_activa: activa.corrida, estado: activa.estado, desde: activa.espera_desde }
  const r = await P.insertarUnaVez({ client_id: e.client_id, corrida: e.corrida, estado: 'esperando', espera_desde: ahora.toISOString(), vence_en: minutos(ahora, espera), intentos: 0, motivo: null, dry_run: e.dry_run })
  if ('choque' in r) {
    // otra corrida ganó el cupo entre la lectura y el insert
    const a = await P.activaDe(e.client_id)
    return { status: 409, error: 'corrida_activa', corrida_activa: a?.corrida ?? 'desconocida', estado: a?.estado ?? 'esperando', desde: a?.espera_desde ?? ahora.toISOString() }
  }
  if (!r.creada) return continuarSiCoincide(r.fila, e, ahora, espera)
  return { status: 200, accion: 'abierta', fila: r.fila, vencida: false, reintentar_en_s: CADA_REINTENTO_S }
}

/** un re-disparo real no continúa una corrida creada en seco (ni al revés): `dry_run` distinto ⇒ 409, sin tocar la fila */
function continuarSiCoincide(f: FilaDeCorrida, e: { dry_run: boolean }, ahora: Date, espera: number): ResultadoDeAbrir {
  if (f.dry_run !== e.dry_run) return { status: 409, error: 'dry_run_distinto', corrida: f.corrida, dry_run_de_la_corrida: f.dry_run, dry_run_pedido: e.dry_run }
  return continuar(f, ahora, espera)
}

function continuar(f: FilaDeCorrida, ahora: Date, espera: number): ResultadoDeAbrir {
  if ((ESTADOS_TERMINALES as readonly string[]).includes(f.estado)) return { status: 200, accion: 'terminada', fila: f }
  // el vencimiento se mide desde el PRIMER pre-vuelo, nunca desde esta ejecución
  const vencida = ahora.getTime() - new Date(f.espera_desde).getTime() >= espera * 60_000
  return { status: 200, accion: 'continua', fila: f, vencida, reintentar_en_s: CADA_REINTENTO_S }
}

export type ResultadoDeAvance = { status: 200; accion: 'avanzada'; fila: FilaDeCorrida } | { status: 200; accion: 'perdiste_la_carrera' } | { status: 409; error: 'corrida_no_viva'; estado: EstadoDeCorrida | null } | { status: 400; error: 'entrada_invalida'; errores: string[] }

/** un re-disparo: `intentos_esperado` = lo que leyó; compare-and-set, gana UNO */
export async function reintentar(P: PuertoDeCorridas, e: { client_id: string; corrida: string; intentos_esperado: number }): Promise<ResultadoDeAvance> {
  const errores = validarEntrada(e, false)
  if (!Number.isInteger(e.intentos_esperado) || e.intentos_esperado < 0) errores.push('`intentos_esperado` es un entero ≥ 0')
  if (errores.length) return { status: 400, error: 'entrada_invalida', errores }
  const f = await P.leer(e.client_id, e.corrida)
  if (!f || !(ESTADOS_VIVOS as readonly string[]).includes(f.estado)) return { status: 409, error: 'corrida_no_viva', estado: f?.estado ?? null }
  const n = await P.avanzarSi(e.client_id, e.corrida, e.intentos_esperado, { intentos: e.intentos_esperado + 1 })
  return n ? { status: 200, accion: 'avanzada', fila: n } : { status: 200, accion: 'perdiste_la_carrera' }
}

/** «empieza a correr»: sale de la espera (lista o vencida) con el techo de una corrida en marcha; solo desde `esperando` */
export async function correr(P: PuertoDeCorridas, e: { client_id: string; corrida: string; motivo?: string }, o: { techo_min?: number } = {}): Promise<ResultadoDeAvance> {
  const errores = validarEntrada(e, false)
  if (errores.length) return { status: 400, error: 'entrada_invalida', errores }
  const f = await P.leer(e.client_id, e.corrida)
  if (!f || f.estado !== 'esperando') return { status: 409, error: 'corrida_no_viva', estado: f?.estado ?? null }
  const n = await P.avanzarSi(e.client_id, e.corrida, f.intentos, { estado: 'corriendo', vence_en: minutos(P.ahora(), o.techo_min ?? TECHO_DE_CORRIDA_MIN), ...(e.motivo ? { motivo: e.motivo.slice(0, 300) } : {}) })
  return n ? { status: 200, accion: 'avanzada', fila: n } : { status: 200, accion: 'perdiste_la_carrera' }
}

/** cierre: `hecha` o `fallida` (con motivo); libera al cliente. Solo desde un estado vivo. */
export async function cerrar(P: PuertoDeCorridas, e: { client_id: string; corrida: string; estado: 'hecha' | 'fallida'; motivo?: string }): Promise<ResultadoDeAvance> {
  const errores = validarEntrada(e, false)
  if (e.estado !== 'hecha' && e.estado !== 'fallida') errores.push('`estado` debe ser «hecha» o «fallida»')
  if (errores.length) return { status: 400, error: 'entrada_invalida', errores }
  const f = await P.leer(e.client_id, e.corrida)
  if (!f || !(ESTADOS_VIVOS as readonly string[]).includes(f.estado)) return { status: 409, error: 'corrida_no_viva', estado: f?.estado ?? null }
  const n = await P.avanzarSi(e.client_id, e.corrida, f.intentos, { estado: e.estado, ...(e.motivo ? { motivo: e.motivo.slice(0, 300) } : {}) })
  return n ? { status: 200, accion: 'avanzada', fila: n } : { status: 200, accion: 'perdiste_la_carrera' }
}

export interface ResultadoDelBarrido { vencidas: string[]; falladas: string[]; saltadas: string[] }

/** lo que el barrido puede liberar AHORA: `corriendo` pasado su `vence_en`; `esperando` solo pasado `vence_en + gracia` (la última lectura todavía puede llegar) */
export async function vencibles(P: PuertoDeCorridas): Promise<FilaDeCorrida[]> {
  const ahora = P.ahora().getTime()
  const filas = await P.vivasVencidas(new Date(ahora).toISOString())
  return filas.filter((f) => f.estado !== 'esperando' || Date.parse(f.vence_en) + GRACIA_DEL_BARRIDO_MIN * 60_000 <= ahora)
}

/** el barrido: libera lo vivo que pasó su `vence_en`. Idempotente: una fila ya terminal no entra; el compare-and-set protege contra un avance justo antes. */
export async function barrer(P: PuertoDeCorridas): Promise<ResultadoDelBarrido> {
  const ahora = P.ahora()
  const r: ResultadoDelBarrido = { vencidas: [], falladas: [], saltadas: [] }
  void ahora
  for (const f of await vencibles(P)) {
    const destino: EstadoDeCorrida = f.estado === 'esperando' ? 'vencida' : 'fallida'
    const motivo = f.estado === 'esperando' ? 'espera vencida sin re-disparo: se declara y se libera al cliente' : 'sin cierre antes de su plazo (vence_en): se da por fallida y se libera al cliente'
    const n = await P.avanzarSi(f.client_id, f.corrida, f.intentos, { estado: destino, motivo })
    if (!n) r.saltadas.push(f.id)
    else (destino === 'vencida' ? r.vencidas : r.falladas).push(f.id)
  }
  return r
}
