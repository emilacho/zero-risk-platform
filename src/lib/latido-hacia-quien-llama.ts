/**
 * El LATIDO de la plataforma hacia quien llama · 02-nov · corte de Náufrago (ejecución 212902).
 * El corredor ya late hacia Vercel (`services/agent-runner/src/lib/latido.ts`), pero la ruta lee ese latido y hacia n8n no manda nada hasta el final: una llamada de 340 s
 * en silencio se cortó 2 s antes de que Vercel contestara 200, y el empleado se cobró igual. Las otras llamadas de 300 s o más del mes iban por encargo con aviso.
 *
 * Es OPCIONAL: quien no lo pide recibe exactamente lo de siempre. El salto de línea es inofensivo porque `JSON.parse` ignora los espacios delante del valor.
 * El código HTTP se decide con el primer byte: lo que contesta antes del primer latido (rechazos, validación) conserva su código real; lo que tarda más se compromete en 200,
 * y su código verdadero viaja dentro del cuerpo en `estado_http`.
 */
export const CABECERA_DEL_LATIDO = 'x-zr-latido'
export const LATIDO_MS = 20_000

export const pideLatido = (request: Request): boolean => request.headers.get(CABECERA_DEL_LATIDO) === '1'

const conEstado = (texto: string, status: number): string => {
  if (status < 400) return texto
  try {
    const j = JSON.parse(texto) as unknown
    if (typeof j === 'object' && j !== null && !Array.isArray(j)) return JSON.stringify({ ...j, estado_http: status })
  } catch { /* no era JSON: se envuelve abajo */ }
  return JSON.stringify({ success: false, error: texto, estado_http: status })
}

export interface OpcionesDelLatido {
  intervaloMs?: number
  /** para que el trabajo pagado termine aunque quien llamó se vaya */
  mantenerVivo?: (p: Promise<unknown>) => void
}

export async function responderConLatido(trabajo: () => Promise<Response>, op: OpcionesDelLatido = {}): Promise<Response> {
  const intervaloMs = op.intervaloMs ?? LATIDO_MS
  const enCurso = trabajo()
  const seguro = enCurso.then(() => undefined, () => undefined)
  op.mantenerVivo?.(seguro)

  let espera: ReturnType<typeof setTimeout> | undefined
  const tardo = await Promise.race([
    seguro.then(() => false),
    new Promise<boolean>((r) => { espera = setTimeout(() => r(true), intervaloMs) }),
  ])
  clearTimeout(espera)
  if (!tardo) return enCurso

  const texto = new TextEncoder()
  let reloj: ReturnType<typeof setInterval> | undefined
  const cuerpo = new ReadableStream<Uint8Array>({
    start(canal) {
      const escribir = (t: string): boolean => {
        try { canal.enqueue(texto.encode(t)); return true } catch { return false }
      }
      escribir('\n')
      reloj = setInterval(() => { if (!escribir('\n')) clearInterval(reloj) }, intervaloMs)
      void enCurso
        .then(async (r) => conEstado(await r.text(), r.status))
        .catch((e: unknown) => JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e), estado_http: 500 }))
        .then((final) => {
          clearInterval(reloj)
          escribir(final)
          try { canal.close() } catch { /* quien llamó ya se fue */ }
        })
    },
    cancel() { clearInterval(reloj) },
  })
  return new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } })
}
