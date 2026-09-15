/**
 * Zero Risk · el LATIDO del corredor.
 *
 * ── EL PROBLEMA, MEDIDO (E23 · CC#3 · 14-sep) ───────────────────────────────
 * El corredor vive detrás del borde público de Railway. Su regla, textual de la
 * documentación de la plataforma y NO configurable:
 *
 *     «HTTP requests can run for up to 15 minutes IF DATA KEEPS TRANSFERRING»
 *     «Requests are closed after 5 minutes WITH NO DATA TRANSFERRED»
 *
 * Hoy el corredor manda UN solo paquete, al final. ⇒ cinco minutos de silencio
 * ⇒ el borde cierra el pedido y el que llamó recibe un 502. Medido tres veces
 * con el mismo reloj: 301,7 s · 302,3 s · 302-303 s. Y el trabajo NO se
 * cancela: el empleado sigue, termina y SE COBRA (US$ 0,562083 el 14-sep, con
 * el plan entero perdido para el flujo que lo pidió).
 *
 * ── LO QUE HACE ESTA PIEZA ──────────────────────────────────────────────────
 * Escribe un byte inofensivo cada tantos segundos mientras el empleado trabaja.
 * Con eso el pedido deja de estar en silencio y el borde da los 15 minutos.
 * El plan más largo que medimos tardó 9 m 34 s: entra con holgura.
 *
 * ── POR QUÉ UN ESPACIO Y NO OTRA COSA ───────────────────────────────────────
 * El cuerpo sigue siendo JSON válido: `JSON.parse` ignora los espacios y saltos
 * de línea DELANTE del valor. ⇒ ningún llamador cambia una línea de código.
 * (Probado en `__tests__/latido.test.ts` contra los 44 llamadores que leen el
 * cuerpo con `.json()`.)
 *
 * ── LO QUE CUESTA, DICHO ────────────────────────────────────────────────────
 * 🔴 El código HTTP se decide ANTES del primer byte. Con el latido encendido, la
 * respuesta se compromete en 200 al arrancar el empleado, así que un fallo
 * POSTERIOR ya no puede viajar como 500: viaja como 200 con `success:false`.
 * Medido que eso NO rompe nada: el proxy de Vercel re-deriva el código DESDE EL
 * CUERPO (`if (!result.success) return NextResponse.json(…, { status: 500 })`),
 * así que los 43 llamadores que pasan por Vercel siguen viendo su 500. El único
 * llamador directo es el nodo de prueba de humo, que es terminal.
 *
 * Sin dependencias a propósito: así la prueba corre en la integración, que NO
 * instala las dependencias de este servicio (lección de CC#2 · 15-sep).
 */

/** Lo mínimo que el latido necesita de una respuesta HTTP. */
export interface DestinoDelLatido {
  write(chunk: string): boolean
  readonly writableEnded: boolean
}

export interface Latido {
  /** Deja de latir. Idempotente · llamarlo dos veces no hace nada raro. */
  detener(): void
  /** Cuántos latidos se escribieron. Para poder afirmarlo, no suponerlo. */
  latidos(): number
  /** true mientras siga latiendo. */
  vivo(): boolean
}

/** El byte inofensivo. Un salto de línea es legible en los registros. */
export const BYTE_DEL_LATIDO = '\n'

/**
 * Cada cuánto late, por defecto. El borde cierra a los 5 minutos sin datos:
 * 20 segundos deja QUINCE latidos de margen antes de ese corte. Un plan de
 * 9 m 34 s escribe ~28 bytes en total.
 */
export const LATIDO_MS_POR_DEFECTO = 20_000

/**
 * Lee el intervalo del entorno. `0` (o cualquier cosa que no sea un número
 * positivo) APAGA el latido y devuelve la conducta de siempre.
 *
 * Existe para poder apagarlo SIN volver a desplegar: este servicio es el único
 * que usan los 44 llamadores, y un despliegue reinicia el contenedor y mata lo
 * que esté corriendo.
 */
export function intervaloDelLatido(
  env: Record<string, string | undefined>,
  porDefecto: number = LATIDO_MS_POR_DEFECTO,
): number {
  const crudo = env.AGENT_RUNNER_HEARTBEAT_MS
  if (crudo === undefined || crudo === '') return porDefecto
  const n = Number(crudo)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

/**
 * Empieza a latir sobre `destino` cada `intervaloMs`. Nunca lanza: si el
 * destino ya se cerró o la escritura falla, deja de latir en silencio — un
 * latido roto NO puede tumbar una corrida que ya se está pagando.
 *
 * `programar` / `cancelar` se inyectan para poder probarlo con relojes falsos.
 */
export function abrirLatido(
  destino: DestinoDelLatido,
  intervaloMs: number,
  programar: (fn: () => void, ms: number) => unknown = setInterval,
  cancelar: (id: unknown) => void = (id) => clearInterval(id as ReturnType<typeof setInterval>),
): Latido {
  let n = 0
  let id: unknown = null
  let activo = true

  const detener = (): void => {
    if (!activo) return
    activo = false
    if (id !== null) {
      cancelar(id)
      id = null
    }
  }

  if (intervaloMs > 0) {
    id = programar(() => {
      if (!activo) return
      if (destino.writableEnded) {
        detener()
        return
      }
      try {
        destino.write(BYTE_DEL_LATIDO)
        n += 1
      } catch {
        // el que llamó se fue, o el caño se cerró · no es asunto del latido
        detener()
      }
    }, intervaloMs)
  } else {
    activo = false
  }

  return { detener, latidos: () => n, vivo: () => activo }
}
