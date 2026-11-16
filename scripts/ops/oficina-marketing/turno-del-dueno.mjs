/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · el flujo «Oficina · un turno» (`bTbWL9lUvQCfStAz`) reconoce la espera del DUEÑO.
 * La oficina contesta `esperar_dueno` cuando el video presenta sus propuestas y queda parado hasta que el dueño apruebe una o pida cambios (tarjeta «Propuestas»).
 * Sin esto, el nodo «③ ¿Y ahora?» lo leería como una respuesta desconocida y DETENDRÍA la ejecución con error (falsa alarma).
 * Qué cambia (y SOLO esto): «③ ¿Y ahora?» suma una línea, igual a la de `esperar_jefatura`: la ejecución termina sin error y sin ítems (nada se despierta;
 * la decisión del dueño reanuda por `POST /api/tablero/propuestas-*`, que despierta al flujo si hace falta).
 * Idempotente: sobre un flujo ya cambiado no hace nada (devuelve 0). Si el vivo cambió y no aparece el fragmento exacto, se detiene.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

export const NODO = '③ ¿Y ahora?'
const ANCLA = "if (status === 200 && b.accion === 'esperar_jefatura') return []"
export const LINEA = "// 16-nov · Sprint 2 · 200 `esperar_dueno` → el video espera la decisión del DUEÑO sobre sus propuestas: termina sin error y sin ítems (la tarjeta «Propuestas» reanuda; las propuestas no vencen)\nif (status === 200 && b.accion === 'esperar_dueno') return []"

/** devuelve cuántos nodos cambió (0 si ya estaba hecho) */
export function construirTurnoDelDueno(f) {
  if (nodo(f, NODO).parameters.jsCode.includes("b.accion === 'esperar_dueno'")) return 0
  cambiarCodigo(f, NODO, ANCLA, ANCLA + '\n' + LINEA)
  return 1
}
