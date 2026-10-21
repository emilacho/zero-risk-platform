/**
 * Reabrir un encargo `fallido` que se puede recuperar (21-oct · orden de Lenovo, punto 2): la causa se arregló en el sistema (identidad visual, plantilla, pre-vuelo…) y el brief
 * no debe quedar trabado para siempre por el intento viejo. Se abre la VERSIÓN SIGUIENTE; la fila vieja no se toca. Pura: la usan el almacén real, el de pruebas y el reintento.
 *
 * Recuperable = cerró `fallido` sin haber gastado nada (nada se pierde al reabrir). Un fallido que gastó, un cierre por tope y un encargo vivo o terminado bien NO se reabren solos.
 * Tope de versiones por brief: al llegar a la última no se abre otra (sin bucle) y se avisa UNA vez en el hilo.
 */
export const MAX_VERSIONES_POR_BRIEF = 3

export interface RastroDeEncargo { estado: string; gasto_usd: number; version_encargo: number }

export const esFallidoRecuperable = (e: RastroDeEncargo): boolean => e.estado === 'fallido' && Number(e.gasto_usd) === 0

/** ¿el encargo `fallido` cuenta como «ya llegó» para que el reintento NO vuelva a pedir el brief? Solo si no se puede reabrir (gastó, o ya se agotaron las versiones). */
export const bloqueaElReintento = (e: RastroDeEncargo): boolean => !(esFallidoRecuperable(e) && e.version_encargo < MAX_VERSIONES_POR_BRIEF)

/** lo que hace `crearEncargo` cuando ya hay encargos del brief: `ultimo` es el de mayor versión */
export function decidirReapertura(ultimo: RastroDeEncargo): { accion: 'reabrir'; version: number } | { accion: 'devolver' } {
  return !bloqueaElReintento(ultimo) ? { accion: 'reabrir', version: ultimo.version_encargo + 1 } : { accion: 'devolver' }
}

/** el aviso único: el encargo que cierra `fallido` siendo la última versión permitida (cada encargo cierra una sola vez) */
export const agotaLasVersiones = (e: { version_encargo: number }): boolean => e.version_encargo >= MAX_VERSIONES_POR_BRIEF
