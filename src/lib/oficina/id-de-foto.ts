/**
 * 26-nov · GO Lenovo (imágenes · arreglo de la foto que «no tiene url») · EL ID DE FOTO QUE EL EQUIPO ACORTA.
 * Medido el 26-nov en la base: la dirección de la mesa escribió `foto:bf597cd8` y `foto:febd9334` (los 8 primeros caracteres del uuid), aunque la lista que recibe
 * nombra cada foto con su id entero (`rotuloDeLaFoto`). El borrador buscaba el id EXACTO, no la encontraba y escribía «no tiene url»: la historia llegó «sin dibujar»
 * y la foto llegó a la aprobación sin imagen.
 *
 * UNA regla para toda la oficina (antes vivía solo en el video, `buscarFotoPropia`, que ahora la usa): un id vale si es EXACTO, sin importar mayúsculas ni espacios,
 * o si es el comienzo de UNA sola foto conocida. Si empiezan así varias, es ambiguo: no se adivina. Corrige un dato; no es una verificación nueva. Puro.
 */
export type ResolucionDeFoto = { ok: true; id: string } | { ok: false; motivo: 'ambigua'; cuantas: number } | { ok: false; motivo: 'desconocida' }

export function resolverIdDeFoto(id: string | null | undefined, conocidos: readonly string[]): ResolucionDeFoto {
  const k = String(id ?? '').trim().toLowerCase()
  if (!k) return { ok: false, motivo: 'desconocida' }
  const exacta = conocidos.find((c) => c.toLowerCase() === k)
  if (exacta) return { ok: true, id: exacta }
  const empiezan = conocidos.filter((c) => c.toLowerCase().startsWith(k))
  if (empiezan.length === 1) return { ok: true, id: empiezan[0] }
  return empiezan.length > 1 ? { ok: false, motivo: 'ambigua', cuantas: empiezan.length } : { ok: false, motivo: 'desconocida' }
}

/** el id entero si se resuelve; si no, el mismo id de entrada (quien lo use decide qué hacer con lo no resuelto) */
export const idEnteroDeFoto = (id: string, conocidos: readonly string[]): string => {
  const r = resolverIdDeFoto(id, conocidos)
  return r.ok ? r.id : id
}

/** la foto de la lista que nombra ese id (exacto o comienzo único), o undefined */
export function fotoPorId<T extends { id: string }>(fotos: readonly T[] | null | undefined, id: string | null | undefined): T | undefined {
  const lista = fotos ?? []
  const r = resolverIdDeFoto(id, lista.map((f) => f.id))
  return r.ok ? lista.find((f) => f.id === r.id) : undefined
}

/**
 * el aviso honesto de una foto propia que no se puede dibujar tal cual. «No tiene url» queda SOLO para una foto que existe y no tiene dirección;
 * si el id no se resuelve, dice por qué (ambigua o no está entre las fotos propias).
 */
export function avisoDeFotoQueNoSirve(id: string, donde: string, fotos: ReadonlyArray<{ id: string; url?: string | null }>): string {
  const r = resolverIdDeFoto(id, fotos.map((f) => f.id))
  if (r.ok) return `la foto «${id}» de «${donde}» no tiene url`
  return r.motivo === 'ambigua'
    ? `la foto «${id}» de «${donde}» es ambigua: ${r.cuantas} fotos del cliente empiezan así`
    : `la foto «${id}» de «${donde}» no está entre las fotos propias del cliente`
}

/**
 * 26-nov · GO Lenovo 15:23Z (punto 4) · DE DÓNDE SALIÓ LA FOTO PROPIA, en palabras de la tarjeta de quien aprueba. Con el origen a la vista, aprobar la pieza es el visto
 * de usarla tal cual (sin un visto aparte). Sale del `tipo` de la fila; lo que no se reconoce es «foto propia». Puro.
 */
export const ROTULO_DE_FUENTE = { web: 'imagen de tu web', video: 'cuadro de tu video', propia: 'foto propia' } as const
export function fuenteDeLaFoto(tipo: string | null | undefined): string {
  const t = String(tipo ?? '').trim().toLowerCase()
  if (t === 'web_imagen') return ROTULO_DE_FUENTE.web
  if (t === 'video_captura' || t === 'post_video') return ROTULO_DE_FUENTE.video
  return ROTULO_DE_FUENTE.propia
}
