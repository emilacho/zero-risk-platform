/**
 * Reabrir un encargo `fallido` que se puede recuperar (21-oct · orden de Lenovo, punto 2): la causa se arregló en el sistema (identidad visual, plantilla, pre-vuelo…) y el brief
 * no debe quedar trabado para siempre por el intento viejo. Se abre la VERSIÓN SIGUIENTE; la fila vieja no se toca. Pura: la usan el almacén real, el de pruebas y el reintento.
 *
 * Recuperable = cerró `fallido` sin gastar nada Y en el PRIMER paso (`pasos_ejecutados = 0`: murió en el pre-vuelo del paso `abrir`: identidad visual, plantilla, carpeta). La causa no queda guardada, así que se lee de la forma del fallo:
 * un freno de gasto (§150) corta la llamada a un agente, que es de un paso posterior ⇒ `pasos_ejecutados ≥ 1` ⇒ NO se reabre solo. Gastó, cierre por tope, vivo o terminado bien: tampoco.
 * Tope de versiones por brief: al llegar a la última no se abre otra (sin bucle) y se avisa UNA vez en el hilo.
 */
export const MAX_VERSIONES_POR_BRIEF = 3

export interface RastroDeEncargo { estado: string; gasto_usd: number; version_encargo: number; pasos_ejecutados: number }

export const esFallidoRecuperable = (e: RastroDeEncargo): boolean => e.estado === 'fallido' && Number(e.gasto_usd) === 0 && Number(e.pasos_ejecutados) === 0

/** ¿el encargo `fallido` cuenta como «ya llegó» para que el reintento NO vuelva a pedir el brief? Solo si no se puede reabrir (gastó, o ya se agotaron las versiones). */
export const bloqueaElReintento = (e: RastroDeEncargo): boolean => !(esFallidoRecuperable(e) && e.version_encargo < MAX_VERSIONES_POR_BRIEF)

/** la causa corregida que declara quien reabre: una frase de verdad (10–300 caracteres), no un «sí» */
export const causaValida = (c: unknown): c is string => typeof c === 'string' && c.trim().length >= 10 && c.trim().length <= 300

/**
 * lo que hace `crearEncargo` cuando ya hay encargos del brief: `ultimo` es el de mayor versión.
 * Con una CAUSA CORREGIDA declarada (`reabrir_causa_corregida` del sobre) también se reabre un encargo que YA GASTÓ y cerró `fallido` o `cerrado_por_tope`: es la vía para las piezas que murieron por una causa que ya se arregló.
 * El TOPE DE VERSIONES no se toca (3 por brief): la causa declarada no da una cuarta. Un encargo vivo o ya entregado jamás se reabre.
 */
export function decidirReapertura(ultimo: RastroDeEncargo, causa?: unknown): { accion: 'reabrir'; version: number; por_causa?: string } | { accion: 'devolver' } {
  if (!bloqueaElReintento(ultimo)) return { accion: 'reabrir', version: ultimo.version_encargo + 1 }
  if (causaValida(causa) && (ultimo.estado === 'fallido' || ultimo.estado === 'cerrado_por_tope') && ultimo.version_encargo < MAX_VERSIONES_POR_BRIEF) return { accion: 'reabrir', version: ultimo.version_encargo + 1, por_causa: causa.trim() }
  return { accion: 'devolver' }
}

/** el aviso único: el encargo que cierra `fallido` siendo la última versión permitida (cada encargo cierra una sola vez) */
export const agotaLasVersiones = (e: { version_encargo: number }): boolean => e.version_encargo >= MAX_VERSIONES_POR_BRIEF
