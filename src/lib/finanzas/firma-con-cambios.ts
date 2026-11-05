/**
 * FIRMAR CON CIFRAS CAMBIADAS (05-nov · encargo de Lenovo, boceto 2 aprobado por Emilio). Puro: sin base y sin modelo, US$ 0.
 * El dueño cambia UNA cifra de entrada; el código recalcula todo lo que depende de ella con la misma `calcular` de la oficina. Nunca se edita un número a mano: las demás salen del cálculo.
 *   · meta de ventas por semana: entra directo.
 *   · presupuesto total al mes: se busca la meta que ese dinero paga. El costo por resultado no depende de nosotros: con menos dinero, menos ventas.
 * Meta y presupuesto están atados: cambiar los dos a la vez no tiene una sola respuesta, así que se rechaza.
 */
import { calcular, confianzaDe } from './calculadora'
import { huellaDe, numerosDelBloque, type FilaDeNumero } from './firma'
import type { Bloque, Entrada } from './tipos'

export const CIFRAS_EDITABLES = ['meta_por_semana', 'total_mes'] as const
export type CifraEditable = (typeof CIFRAS_EDITABLES)[number]
export const esEditable = (clave: unknown): clave is CifraEditable => (CIFRAS_EDITABLES as readonly unknown[]).includes(clave)

export interface CambioDeCifra { clave: string; propuesto: number; firmado: number }
export const FUENTE_DEL_DUENO = 'cambiada por el dueño al firmar'
export const FUENTE_DESPEJADA = 'despejada del presupuesto que firmó el dueño'

export type ErrorDeCambios = 'sin_cambios' | 'cifra_no_editable' | 'valor_invalido' | 'cifras_cambiaron' | 'una_cifra_a_la_vez' | 'no_se_puede_recalcular' | 'presupuesto_no_cuadra'
export type Recalculo =
  | { ok: true; entrada: Entrada; bloque: Bloque; huella: string; numeros: FilaDeNumero[]; cambios: CambioDeCifra[]; meta_por_semana: number; total_mes: number }
  | { ok: false; error: ErrorDeCambios; detalle: string; alcanzable?: number }

/** un centavo: las cifras guardadas van redondeadas a dos decimales */
const TOLERANCIA = 0.005
const VUELTAS_DE_BUSQUEDA = 80
const DOBLES_MAXIMOS = 40
const META_MINIMA = 1e-6
const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const igual = (a: number, b: number) => Math.abs(a - b) < TOLERANCIA
const totalDe = (b: Bloque): number | null => { const v = b.cifras.total_mes?.valor; return finito(v) ? v : null }
const CLAVES_DE_CONTROL = ['total_mes', 'pauta_diaria', 'costo_por_venta', 'meta_por_semana'] as const

/** ¿la entrada guardada da lo que el tablero dice? Si no (otra versión de la fórmula, entrada incompleta), recalcular daría otras cifras sin que nadie las haya cambiado */
export function entradaReproduceElTablero(entrada: Entrada, bloque: Bloque): boolean {
  const r = calcular(entrada)
  if (!r.ok) return false
  return CLAVES_DE_CONTROL.every((k) => {
    const a = r.cifras[k]?.valor ?? null, b = bloque.cifras[k]?.valor ?? null
    return a === null || b === null ? a === b : igual(a, b)
  })
}

const conMeta = (entrada: Entrada, meta: number): Entrada => ({ ...entrada, meta_por_semana: meta })

/** la meta cuyo presupuesto total es `objetivo`. El presupuesto no baja al subir la meta: búsqueda por mitades */
function metaParaElPresupuesto(entrada: Entrada, objetivo: number): { ok: true; meta: number } | { ok: false; error: 'presupuesto_no_cuadra'; detalle: string; alcanzable?: number } {
  const total = (meta: number): number | null => { const r = calcular(conMeta(entrada, meta)); return r.ok ? totalDe(r) : null }
  let lo = META_MINIMA, hi = Math.max(entrada.meta_por_semana, 1)
  for (let i = 0; i < DOBLES_MAXIMOS && (total(hi) ?? Infinity) < objetivo; i++) hi *= 2
  if ((total(hi) ?? Infinity) < objetivo) return { ok: false, error: 'presupuesto_no_cuadra', detalle: 'ninguna meta llega a ese presupuesto' }
  for (let i = 0; i < VUELTAS_DE_BUSQUEDA; i++) {
    const m = (lo + hi) / 2
    if ((total(m) ?? Infinity) < objetivo) lo = m; else hi = m
  }
  const final = total(hi)
  // un salto del reparto (un canal que entra con su mínimo) puede dejar cifras a las que no se llega: se dice, no se firma otra
  if (final === null || !igual(final, objetivo)) return { ok: false, error: 'presupuesto_no_cuadra', detalle: `con ese dinero el reparto no cuadra: la cifra alcanzable más cercana es ${final}`, ...(final === null ? {} : { alcanzable: final }) }
  return { ok: true, meta: hi }
}

/** recalcula el tablero con el cambio del dueño. No escribe nada: sirve para mostrarlo antes de firmar y para firmar */
export function recalcularConCambios(entrada: Entrada, bloque: Bloque, pedidos: CambioDeCifra[]): Recalculo {
  for (const c of pedidos) {
    if (!esEditable(c.clave)) return { ok: false, error: 'cifra_no_editable', detalle: `«${String(c.clave)}» no se puede cambiar: sale del cálculo` }
    if (!finito(c.firmado) || c.firmado <= 0 || !finito(c.propuesto)) return { ok: false, error: 'valor_invalido', detalle: `«${c.clave}» debe ser un número mayor que 0` }
    const actual = bloque.cifras[c.clave]?.valor
    // lo que vio el dueño ya no es lo que hay: firmaría otra cosa
    if (!finito(actual) || !igual(actual, c.propuesto)) return { ok: false, error: 'cifras_cambiaron', detalle: `«${c.clave}» ya no vale lo que viste` }
  }
  const cambios = pedidos.filter((c) => !igual(c.propuesto, c.firmado))
  if (!cambios.length) return { ok: false, error: 'sin_cambios', detalle: 'ninguna cifra cambió' }
  if (new Set(cambios.map((c) => c.clave)).size !== cambios.length || cambios.length > 1) return { ok: false, error: 'una_cifra_a_la_vez', detalle: 'la meta y el presupuesto están atados: cambia una y se recalcula la otra' }
  if (!entradaReproduceElTablero(entrada, bloque)) return { ok: false, error: 'no_se_puede_recalcular', detalle: 'la entrada guardada ya no da las cifras de este tablero: lo que depende de ese cambio no se puede calcular con certeza' }

  const cambio = cambios[0]
  let meta = cambio.firmado
  if (cambio.clave === 'total_mes') {
    const m = metaParaElPresupuesto(entrada, cambio.firmado)
    if (!m.ok) return m
    meta = m.meta
  }
  const nueva = conMeta(entrada, meta)
  const r = calcular(nueva)
  if (!r.ok) return { ok: false, error: 'no_se_puede_recalcular', detalle: r.errores.join('; ') }
  const cifras = { ...r.cifras }
  if (cambio.clave === 'meta_por_semana') cifras.meta_por_semana = { ...cifras.meta_por_semana, fuente: FUENTE_DEL_DUENO }
  else {
    cifras.total_mes = { ...cifras.total_mes, fuente: FUENTE_DEL_DUENO }
    cifras.meta_por_semana = { ...cifras.meta_por_semana, tipo: 'supuesto', fuente: FUENTE_DESPEJADA }
  }
  const final: Bloque = { ...r, cifras, confianza: confianzaDe(cifras) }
  return { ok: true, entrada: nueva, bloque: final, huella: huellaDe(final), numeros: numerosDelBloque(final), cambios, meta_por_semana: meta, total_mes: totalDe(final) as number }
}
