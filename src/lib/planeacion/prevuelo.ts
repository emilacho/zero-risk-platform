/**
 * PLAN v3 · V8 · EL PRE-VUELO (diseño §5.1 rev. 2, §13.1 cupo, §15.2/§16/§17.1 espera por «cerebro listo»; aviso 15-oct: 45 min + `completando` + `huecos[]`).
 * Se llama en el primer disparo y en CADA re-disparo (cada 5 min) con el MISMO `corrida`: cada llamada dura segundos y contesta UNA cosa:
 *   correr · esperar · correr_con_lo_del_alta · ya_en_marcha · terminada · no_corre (con motivo y, si aplica, qué arreglar).
 *
 * 🔴 `dry_run` AUSENTE = REAL (la sala no lo manda): solo `true` es ensayo; un valor no booleano se rechaza.
 * 🔴 FALLA CERRADO (N6): un error de lectura NUNCA es «cliente sin manual», «sin gasto» ni «cerebro listo». Cada guarda dice por qué no corre.
 * 🔴 SIN «CEREBRO LISTO» NO HAY NI UNA LLAMADA A APIFY: `relleno_permitido` solo es true con la señal en `listo:true` leída en ESTA llamada. Vencidos los 45 min corre con lo del alta,
 *    lo declara y el relleno sigue en false (nunca Apify en lugar del cerebro). Una señal que no se pudo leer en toda la espera es `señal_ausente`, distinta de `vencido`.
 * 🔴 EL RELOJ vive en la base (`plan_corridas.espera_desde`, insert-once): un reinicio nunca lo reinicia; la lectura del 45:00 exacto SÍ cuenta (se lee la señal ANTES de vencer).
 * 🔴 UN SOLO PLAN: el re-disparo avanza con compare-and-set; dos re-disparos simultáneos ⇒ gana uno, el otro recibe `otro_re_disparo_gano` y no hace nada.
 * 🔴 CUPO (§13.1): `techo (spend_cap_usd de la ficha si lo trae, si no el genérico) − gastado 24 h` debe cubrir la suma de topes del plan; si no, no corre y dice «sube la ficha a X»
 *    (desde el 30-oct subir la ficha del cliente sí arregla la falta de cupo: su tope manda).
 * PURO: todo lo de afuera entra por puertos (se prueba con reloj simulado, sin red, sin gasto). NADIE lo llama todavía.
 */
import { abrir, correr, reintentar, CADA_REINTENTO_S, ESPERA_MAXIMA_MIN, type PuertoDeCorridas } from './corridas'
import type { CatalogoSnapshot } from './dato-v1/catalogo'
import type { LecturaDeCatalogo } from './catalogo/leer'

export interface FichaDelCliente {
  existe: boolean
  /** hay una versión vigente del manual */
  manual_vigente: boolean
  manual_version: number | null
  moneda_declarada: string | null
  pais: string | null
}
export type LecturaDeFicha = ({ ok: true } & FichaDelCliente) | { ok: false; error: string }
export interface CupoDelCliente {
  /** el techo EFECTIVO de 24 h: el `spend_cap_usd` de la ficha si lo trae, si no el genérico/arranque */
  cap_usd: number
  generico_usd: number
  /** `spend_cap_usd` de la ficha, o null si no tiene */
  override_usd: number | null
  gastado_24h_usd: number
}
export type LecturaDeCupo = ({ ok: true } & CupoDelCliente) | { ok: false; error: string }
export interface SenalDeListo {
  listo: boolean
  completando: boolean
  motivo: string
  desde: string | null
  huecos: Array<{ fuente: string; funcion: string; objetivo: string }>
}
export type LecturaDeSenal = { ok: true; senal: SenalDeListo } | { ok: false; error: string }

export interface PuertosDePrevuelo {
  ahora(): Date
  corridas: PuertoDeCorridas
  catalogo(): Promise<LecturaDeCatalogo>
  ficha(client_id: string): Promise<LecturaDeFicha>
  cupo(client_id: string): Promise<LecturaDeCupo>
  senal(client_id: string): Promise<LecturaDeSenal>
}

export type MotivoDeNoCorre =
  | 'entrada_invalida' | 'dry_run_no_booleano' | 'catalogo_no_aplicado' | 'catalogo_incompleto' | 'lectura_fallida'
  | 'cliente_inexistente' | 'sin_manual_vigente' | 'sin_moneda' | 'falta_cupo' | 'techo_generico_insuficiente'
  | 'corrida_activa' | 'dry_run_distinto' | 'otro_re_disparo_gano' | 'corrida_no_viva'

export interface Decision {
  decision: 'correr' | 'esperar' | 'correr_con_lo_del_alta' | 'ya_en_marcha' | 'terminada' | 'no_corre'
  motivo: string
  detalle?: string
  /** SOLO con `listo:true` leído en esta llamada: es lo único que autoriza salir a Apify a buscar lo que falta */
  relleno_permitido: boolean
  dry_run: boolean
  /** lo que el cerebro todavía no tiene (de `huecos[]`), ya traducido a TIPOS del catálogo; vacío si no declaró */
  huecos_tipos: string[]
  /** `funcion` de un hueco que ninguna fila del catálogo sabe traducir (se declara, no se pierde) */
  huecos_sin_tipo: string[]
  reintentar_en_s?: number
  espera_desde?: string
  vence_en?: string
  intentos?: number
  minutos_esperados?: number
  /** lo que el plan DEBE decir al entregar */
  declara: string[]
  sube_la_ficha_a?: number
  corrida?: string
}

const UUIDISH = /^[A-Za-z0-9_-]{8,64}$/
const r2 = (x: number) => Math.round(x * 100) / 100
const base = (dry: boolean): Decision => ({ decision: 'no_corre', motivo: '', relleno_permitido: false, dry_run: dry, huecos_tipos: [], huecos_sin_tipo: [], declara: [] })
const noCorre = (dry: boolean, motivo: MotivoDeNoCorre, detalle?: string, extra: Partial<Decision> = {}): Decision => ({ ...base(dry), decision: 'no_corre', motivo, ...(detalle ? { detalle } : {}), ...extra })

/** la suma de topes por tramo del catálogo (recolección + oficina + redacción + jefatura): lo que el plan puede gastar como máximo, SIN el cupo de la ficha */
export function sumaDeTopes(snap: CatalogoSnapshot): number {
  return r2(['recoleccion', 'oficina', 'redaccion', 'jefatura'].reduce((a, t) => a + (snap.tope(t) ?? 0), 0))
}

/** lo que `huecos[]` dice (por `funcion`) traducido a los tipos del catálogo que esa fuente provee */
export function huecosATipos(huecos: SenalDeListo['huecos'], snap: CatalogoSnapshot): { tipos: string[]; sin_tipo: string[] } {
  const tipos = new Set<string>()
  const sin: string[] = []
  for (const h of huecos) {
    const fuentes = snap.filas.fuentes.filter((f) => f.funcion === h.funcion || f.fuente_id === h.fuente)
    const cubre = fuentes.flatMap((f) => f.provee ?? [])
    if (!cubre.length) { sin.push(h.funcion || h.fuente || 'desconocido'); continue }
    for (const t of cubre) tipos.add(t)
  }
  return { tipos: [...tipos], sin_tipo: sin }
}

export interface ReglasDePrevuelo {
  /** ¿la señal, leída en esta llamada, autoriza el relleno de Apify? (la mutación del seco rompe ESTA regla) */
  autorizaRelleno(s: SenalDeListo | null): boolean
}
export const REGLAS_DE_PREVUELO: ReglasDePrevuelo = { autorizaRelleno: (s) => s !== null && s.listo === true }

export async function prevuelo(
  e: { client_id: unknown; corrida: unknown; dry_run?: unknown; espera_max_min?: number },
  P: PuertosDePrevuelo,
  reglas: ReglasDePrevuelo = REGLAS_DE_PREVUELO,
): Promise<Decision> {
  // 1 · entrada · `dry_run` ausente = REAL
  if (typeof e.client_id !== 'string' || !UUIDISH.test(e.client_id)) return noCorre(false, 'entrada_invalida', '`client_id` es obligatorio')
  if (typeof e.corrida !== 'string' || !e.corrida.trim() || e.corrida.length > 120) return noCorre(false, 'entrada_invalida', '`corrida` es obligatoria (texto de hasta 120 caracteres)')
  if (e.dry_run !== undefined && typeof e.dry_run !== 'boolean') return noCorre(false, 'dry_run_no_booleano', '`dry_run` solo puede ser true o false (ausente = real)')
  const dry = e.dry_run === true
  const client_id = e.client_id
  const corrida = e.corrida
  const espera = e.espera_max_min ?? ESPERA_MAXIMA_MIN

  // 2 · el catálogo (falla cerrado)
  const cat = await P.catalogo()
  if (!cat.ok) return noCorre(dry, cat.causa === 'catalogo_no_aplicado' ? 'catalogo_no_aplicado' : cat.causa === 'catalogo_incompleto' ? 'catalogo_incompleto' : 'lectura_fallida', cat.detalle)
  const snap = cat.snapshot

  // 3 · ficha previa (E79), manual vigente, moneda (U5/G3)
  const f = await P.ficha(client_id)
  if (!f.ok) return noCorre(dry, 'lectura_fallida', `ficha: ${f.error}`)
  if (!f.existe) return noCorre(dry, 'cliente_inexistente', 'no existe la ficha del cliente (la guarda E79 la exige antes del trato)')
  // 🔴 SOLO el ensayo (`dry_run === true` exacto) puede seguir sin manual: no escribe el plan ni gasta, y la guarda ① del flujo pone un manual SIMULADO en memoria (nunca en la base). Lo real exige el manual como siempre.
  const ensayoSinManual = dry && !f.manual_vigente
  if (!f.manual_vigente && !ensayoSinManual) return noCorre(dry, 'sin_manual_vigente', 'el cliente no tiene manual vigente: sin él el plan no se escribe')
  const paisMoneda = snap.monedaDePais(f.pais)
  if (!f.moneda_declarada && !paisMoneda) return noCorre(dry, 'sin_moneda', 'sin moneda declarada ni fila de país en el catálogo: la oficina no calcula dinero (la aclara la agencia)')

  // 4 · el cupo (solo si va a gastar: un ensayo no gasta)
  if (!dry) {
    const c = await P.cupo(client_id)
    if (!c.ok) return noCorre(dry, 'lectura_fallida', `cupo: ${c.error}`)
    const necesita = sumaDeTopes(snap)
    const libre = r2(c.cap_usd - c.gastado_24h_usd)
    if (libre + 1e-9 < necesita) {
      const sube = Math.ceil((c.gastado_24h_usd + necesita + 0.5) * 2) / 2
      return noCorre(dry, 'falta_cupo', `falta cupo: libre ${libre} < ${necesita} (techo ${c.cap_usd}, gastado 24 h ${c.gastado_24h_usd})`, { sube_la_ficha_a: sube })
    }
  }

  // 5 · la corrida (una activa por cliente; el reloj nace aquí y no se reinicia)
  const ab = await abrir(P.corridas, { client_id, corrida, dry_run: dry }, { espera_max_min: espera })
  if (ab.status === 400) return noCorre(dry, 'entrada_invalida', ab.errores.join('; '))
  if (ab.status === 409) {
    if (ab.error === 'corrida_activa') return noCorre(dry, 'corrida_activa', `el cliente ya tiene la corrida «${ab.corrida_activa}» ${ab.estado} desde ${ab.desde}`, { corrida: ab.corrida_activa })
    return noCorre(dry, 'dry_run_distinto', 'un re-disparo real no continúa una corrida de ensayo (ni al revés)')
  }
  if (ab.accion === 'terminada') return { ...base(dry), decision: 'terminada', motivo: `la corrida ya terminó (${ab.fila.estado})`, corrida, espera_desde: ab.fila.espera_desde, vence_en: ab.fila.vence_en, intentos: ab.fila.intentos }
  const fila = ab.fila
  const comun = { corrida, espera_desde: fila.espera_desde, vence_en: fila.vence_en, intentos: fila.intentos }
  if (fila.estado === 'corriendo') return { ...base(dry), decision: 'ya_en_marcha', motivo: 'la corrida ya está corriendo: este re-disparo no hace nada (un solo plan)', ...comun }

  // 6 · la señal «cerebro listo» (se lee ANTES de vencer: la lectura del 45:00 cuenta)
  const ahora = P.ahora()
  const minutos = Math.round(((ahora.getTime() - Date.parse(fila.espera_desde)) / 60_000) * 10) / 10
  const arrancar = async (motivo: string, extra: Partial<Decision>): Promise<Decision> => {
    const r = await correr(P.corridas, { client_id, corrida, motivo: motivo.slice(0, 200) })
    if (r.status !== 200) return noCorre(dry, 'corrida_no_viva', `no se pudo arrancar la corrida (${'estado' in r ? String(r.estado) : r.error})`, comun)
    if (r.accion === 'perdiste_la_carrera') return noCorre(dry, 'otro_re_disparo_gano', 'otro re-disparo arrancó la corrida primero: este no hace nada', comun)
    return { ...base(dry), ...comun, minutos_esperados: minutos, ...extra }
  }

  // ensayo sin manual: no hay cerebro que esperar (un cliente sin manual no tiene cerebro listo) y el ensayo no llama a Apify: corre ya, declarado, sin relleno
  if (ensayoSinManual) {
    return arrancar('ensayo sin manual vigente', {
      decision: 'correr', motivo: 'ensayo (dry_run): el cliente no tiene manual vigente; la guarda ① del flujo usa un manual simulado y nada se escribe', relleno_permitido: false,
      declara: ['ENSAYO sin manual vigente: el manual es simulado en memoria, no se espera al cerebro, no se llama a Apify y no se escribe el plan.'],
    })
  }
  const lec = await P.senal(client_id)
  const vencido = ahora.getTime() - Date.parse(fila.espera_desde) >= espera * 60_000

  if (lec.ok) {
    const s = lec.senal
    if (s.listo) {
      const h = huecosATipos(s.huecos, snap)
      const declara = s.huecos.length ? [`el cerebro estaba listo pero sin: ${s.huecos.map((x) => x.objetivo || x.funcion).join('; ')}`] : []
      return arrancar(s.motivo || 'cerebro listo', { decision: 'correr', motivo: s.motivo || 'cerebro listo', relleno_permitido: reglas.autorizaRelleno(s), huecos_tipos: h.tipos, huecos_sin_tipo: h.sin_tipo, declara })
    }
    if (!vencido) return esperarMas(P, client_id, dry, comun, minutos, s.completando ? `el cerebro sigue completando lo que el alta no trajo (${s.motivo})` : s.motivo || 'el cerebro todavía no está listo', s.completando, reglas.autorizaRelleno(s))
    // vencido: corre con lo del alta, lo DECLARA y NO rellena con Apify
    return arrancar('cerebro no listo a tiempo', {
      decision: 'correr_con_lo_del_alta', motivo: `vencido: sin «cerebro listo» a los ${espera} min`, relleno_permitido: reglas.autorizaRelleno(s),
      declara: [`el cerebro no estaba listo a los ${espera} min: el plan sale con lo que trajo el alta y lo declara (faltan reseñas, comentarios y menciones). No se rellenó con Apify.`],
    })
  }
  // la señal no se pudo leer: NO es «listo» ni «no listo»
  if (!vencido) return esperarMas(P, client_id, dry, comun, minutos, `la señal no se pudo leer (${lec.error}): se reintenta`, false, reglas.autorizaRelleno(null))
  return arrancar('señal ausente', {
    decision: 'correr_con_lo_del_alta', motivo: 'señal_ausente: en toda la espera no hubo una lectura válida de «cerebro listo»', relleno_permitido: reglas.autorizaRelleno(null),
    declara: [`no se pudo leer si el cerebro estaba listo (${lec.error}): el plan sale con lo que trajo el alta. No se rellenó con Apify.`],
  })
}

/** un re-disparo que espera: avanza `intentos` con compare-and-set (gana UNO); el que pierde NO hace nada */
async function esperarMas(P: PuertosDePrevuelo, client_id: string, dry: boolean, comun: Pick<Decision, 'corrida' | 'espera_desde' | 'vence_en' | 'intentos'>, minutos: number, motivo: string, completando: boolean, relleno: boolean): Promise<Decision> {
  const r = await reintentar(P.corridas, { client_id, corrida: comun.corrida as string, intentos_esperado: comun.intentos as number })
  if (r.status === 409) return noCorre(dry, 'corrida_no_viva', 'la corrida ya no está viva', comun)
  if (r.status === 400) return noCorre(dry, 'entrada_invalida', r.errores.join('; '), comun)
  if (r.accion === 'perdiste_la_carrera') return noCorre(dry, 'otro_re_disparo_gano', 'otro re-disparo avanzó la espera primero: este no hace nada', comun)
  return { ...base(dry), ...comun, intentos: r.fila.intentos, decision: 'esperar', relleno_permitido: relleno, motivo, reintentar_en_s: CADA_REINTENTO_S, minutos_esperados: minutos, declara: completando ? ['el despertar del alta sigue completando lo que el alta no trajo'] : [] }
}
