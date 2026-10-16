/**
 * PRESUPUESTO DE TIEMPO DE LAS RUTAS DEL PORTERO · (16-oct · ④ pasó de 120 s y la plataforma respondió 504)
 * Una llamada a una ruta del portero NO pasa de ~90 s. Lo que crece con los datos (escrituras una por una, trozos del índice) se hace en paralelo acotado y con un
 * `hasta` (hora límite): lo que no cupo se DICE como pendiente y la siguiente pasada sigue desde ahí (todo es idempotente). PURO salvo la función que recibe.
 */
/** lo que una llamada a una ruta se permite durar en total (la plataforma corta a los 120 s en las rutas viejas; el nodo espera 280 s) */
export const PRESUPUESTO_DE_RUTA_MS = 90_000
/** lo que se le deja al puente DENTRO de la llamada de alimentar (el resto lo drena el nodo ④ bis por pasadas propias) */
export const PRESUPUESTO_DEL_PUENTE_EN_ALIMENTAR_MS = 25_000
/** lo que se le deja a una pasada propia del puente (/puente) */
export const PRESUPUESTO_DEL_PUENTE_PROPIO_MS = 80_000

/** corre `fn` sobre cada elemento con `k` a la vez; con `hasta` (ms epoch) NO arranca elementos nuevos pasada esa hora. Devuelve cuántos arrancó. */
export async function enTandas<T>(items: readonly T[], k: number, fn: (x: T, i: number) => Promise<void>, hasta?: number, ahora: () => number = Date.now): Promise<number> {
  let siguiente = 0, arrancados = 0
  const trabajador = async () => {
    for (;;) {
      if (hasta !== undefined && ahora() >= hasta) return
      const i = siguiente++
      if (i >= items.length) return
      arrancados++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(k, items.length || 1)) }, trabajador))
  return arrancados
}
