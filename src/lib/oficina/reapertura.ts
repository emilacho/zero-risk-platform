/**
 * Reabrir un encargo `fallido` que se puede recuperar (21-oct · orden de Lenovo, punto 2): la causa se arregló en el sistema (identidad visual, plantilla, pre-vuelo…) y el brief
 * no debe quedar trabado para siempre por el intento viejo. Se abre la VERSIÓN SIGUIENTE; la fila vieja no se toca. Pura: la usan el almacén real, el de pruebas y el reintento.
 *
 * Recuperable = cerró `fallido` sin gastar nada Y en el PRIMER paso (`pasos_ejecutados = 0`: murió en el pre-vuelo del paso `abrir`: identidad visual, plantilla, carpeta). La causa no queda guardada, así que se lee de la forma del fallo:
 * un freno de gasto (§150) corta la llamada a un agente, que es de un paso posterior ⇒ `pasos_ejecutados ≥ 1` ⇒ NO se reabre solo. Gastó, cierre por tope, vivo o terminado bien: tampoco.
 * Tope de versiones por brief: al llegar a la última no se abre otra (sin bucle) y se avisa UNA vez en el hilo.
 *
 * 11-nov · REGLA (b) de Lenovo (20:10 Zúrich): una versión CORTADA POR CAUSA NUESTRA (marcada al cerrar por quien detectó la caída · `causa-del-fallo.ts`) NO cuenta entre las 3.
 * El número de versión sigue subiendo (v4, v5…: las filas no chocan); lo que cambia es CUÁNTOS INTENTOS cuentan, y eso lo calcula UN SOLO lugar: `intentosQueCuentan`.
 * Techo: como máximo `MAX_VERSIONES_CORTADAS` cortadas no cuentan; desde la siguiente, una cortada cuenta como un intento normal (sin bucle si la caída se repite).
 * Las filas sin marca (todas las de antes del 11-nov) cuentan exactamente como antes.
 */
import { esVersionCortadaPorNosotros } from './causa-del-fallo'

export const MAX_VERSIONES_POR_BRIEF = 3
/** regla (b) · techo de Lenovo: a lo más 3 versiones cortadas por causa nuestra no cuentan; la 4.ª cortada ya cuenta */
export const MAX_VERSIONES_CORTADAS = 3

export interface RastroDeEncargo { estado: string; gasto_usd: number; version_encargo: number; pasos_ejecutados: number; /** regla (b) · cerró fallido con la marca de corte nuestro */ cortada: boolean }

/** el rastro de una fila de `oficina_encargos` (o de un `Encargo`): el ÚNICO lugar que lee la forma de la fila para el tope */
export function rastroDe(f: { estado?: unknown; gasto_usd?: unknown; version_encargo?: unknown; estado_del_motor?: unknown }): RastroDeEncargo {
  const motor = f.estado_del_motor && typeof f.estado_del_motor === 'object' ? (f.estado_del_motor as { pasos_ejecutados?: unknown }) : null
  return { estado: String(f.estado), gasto_usd: Number(f.gasto_usd ?? 0), version_encargo: Number(f.version_encargo ?? 1), pasos_ejecutados: Number(motor?.pasos_ejecutados ?? 0), cortada: esVersionCortadaPorNosotros(f.estado, f.estado_del_motor) }
}

/**
 * EL ÚNICO CONTEO del tope (regla b): cuántos intentos de la pieza cuentan hasta `e` (incluida). `hermanos` = las versiones REALES del mismo brief y grupo (puede traer a `e`; se cuenta una vez por número).
 * = el número de versión de `e` menos las cortadas por causa nuestra hasta ella (a lo más `MAX_VERSIONES_CORTADAS`). Sin marcas ⇒ igual al número de versión (como antes del 11-nov).
 */
export function intentosQueCuentan(e: RastroDeEncargo, hermanos: readonly RastroDeEncargo[]): number {
  const porVersion = new Map<number, RastroDeEncargo>()
  for (const h of hermanos) if (h.version_encargo <= e.version_encargo) porVersion.set(h.version_encargo, h)
  porVersion.set(e.version_encargo, e)
  const cortadas = [...porVersion.values()].filter((h) => h.cortada).length
  return e.version_encargo - Math.min(cortadas, MAX_VERSIONES_CORTADAS)
}

/** ¿quedan intentos después de `e`? */
const quedanIntentos = (e: RastroDeEncargo, hermanos: readonly RastroDeEncargo[]): boolean => intentosQueCuentan(e, hermanos) < MAX_VERSIONES_POR_BRIEF

export const esFallidoRecuperable = (e: RastroDeEncargo): boolean => e.estado === 'fallido' && Number(e.gasto_usd) === 0 && Number(e.pasos_ejecutados) === 0

/** ¿el encargo `fallido` cuenta como «ya llegó» para que el reintento NO vuelva a pedir el brief? Solo si no se puede reabrir (gastó, o ya se agotaron los intentos). */
export const bloqueaElReintento = (e: RastroDeEncargo, hermanos: readonly RastroDeEncargo[]): boolean => !(esFallidoRecuperable(e) && quedanIntentos(e, hermanos))

/** la causa corregida que declara quien reabre: que haya texto (hasta 300 caracteres) · GO Lenovo 11-nov: un número fijo de letras no deja escribir «más luz» */
export const causaValida = (c: unknown): c is string => typeof c === 'string' && c.trim().length >= 1 && c.trim().length <= 300

/**
 * lo que hace `crearEncargo` cuando ya hay encargos del brief: `ultimo` es el de mayor versión; `hermanos`, las versiones reales del brief (para el conteo de la regla b).
 * Con una CAUSA CORREGIDA declarada (`reabrir_causa_corregida` del sobre) también se reabre un encargo que YA GASTÓ y cerró `fallido` o `cerrado_por_tope`: es la vía para las piezas que murieron por una causa que ya se arregló.
 * El TOPE DE INTENTOS no se toca (3 por brief): la causa declarada no da un cuarto. Un encargo vivo o ya entregado jamás se reabre. Nada se reabre SOLO por ser una cortada.
 */
export function decidirReapertura(ultimo: RastroDeEncargo, hermanos: readonly RastroDeEncargo[], causa?: unknown): { accion: 'reabrir'; version: number; por_causa?: string } | { accion: 'devolver' } {
  if (!bloqueaElReintento(ultimo, hermanos)) return { accion: 'reabrir', version: ultimo.version_encargo + 1 }
  if (causaValida(causa) && (ultimo.estado === 'fallido' || ultimo.estado === 'cerrado_por_tope') && quedanIntentos(ultimo, hermanos)) return { accion: 'reabrir', version: ultimo.version_encargo + 1, por_causa: causa.trim() }
  return { accion: 'devolver' }
}

/** el aviso único: el encargo que cierra `fallido` agotando los intentos que cuentan (cada encargo cierra una sola vez) */
export const agotaLasVersiones = (e: RastroDeEncargo, hermanos: readonly RastroDeEncargo[]): boolean => !quedanIntentos(e, hermanos)

/** regla (b) · el aviso único del TECHO: esta cortada es la `MAX_VERSIONES_CORTADAS`-ésima de la pieza (desde la siguiente, una cortada ya cuenta) */
export function alcanzaElTechoDeCortadas(e: RastroDeEncargo, hermanos: readonly RastroDeEncargo[]): boolean {
  if (!e.cortada) return false
  const porVersion = new Map<number, boolean>()
  for (const h of hermanos) if (h.version_encargo <= e.version_encargo) porVersion.set(h.version_encargo, h.cortada)
  porVersion.set(e.version_encargo, true)
  return [...porVersion.values()].filter(Boolean).length === MAX_VERSIONES_CORTADAS
}
