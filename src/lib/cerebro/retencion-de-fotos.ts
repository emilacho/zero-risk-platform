/**
 * RETENCIÓN DE LAS FOTOS (política, sin columna · firma de Emilio 28-oct): lo de un tercero se guarda 90 días desde que se copió; lo propio, mientras el cliente esté activo.
 * `competidor` = 90 (política original, 29-sep) y `referencia` = 90 (28-oct: «igual que competidor»). Es una POLÍTICA DECLARADA: hoy ningún proceso borra por ella (el lector solo trata lo ajeno como anuncio que vence).
 */
export const RETENCION_DE_FOTOS_AJENAS_DIAS = 90
/** días de retención de una foto según su dueño; `null` = sin plazo (propia) o dueño desconocido */
export function diasDeRetencionDeUnaFoto(dueno: string): number | null {
  if (dueno === 'competidor' || dueno === 'referencia') return RETENCION_DE_FOTOS_AJENAS_DIAS
  return null
}
