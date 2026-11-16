/**
 * SPRINT 1 · MEJORA 3 · sobre qué foto propia del cliente se edita una imagen generada.
 *
 * Solo sirven las candidatas que muestran el protagonista del brief (las «cercanas» no: editar otro plato inventaría el producto).
 * Primero la que eligió el director visual, si es apta; si no, las candidatas en su orden, rotando para que dos imágenes del mismo
 * encargo no salgan de la misma foto. Sin candidata apta → null y la imagen se genera como siempre. Pura.
 */
export interface FotoDeReferencia { id: string; url: string }

interface FotoConUrl { id: string; url?: string | null }
interface CandidataMin { id: string; cercana?: boolean }

export function fotosDeReferencia(fotos: FotoConUrl[], candidatas: CandidataMin[], o: { preferida?: string | null; excluir?: string[] } = {}): FotoDeReferencia[] {
  const fuera = new Set(o.excluir ?? [])
  const aptas: FotoDeReferencia[] = []
  for (const c of candidatas) {
    if (c.cercana || fuera.has(c.id) || aptas.some((x) => x.id === c.id)) continue
    const url = fotos.find((f) => f.id === c.id)?.url
    if (typeof url === 'string' && url.trim()) aptas.push({ id: c.id, url })
  }
  const k = o.preferida ? aptas.findIndex((x) => x.id === o.preferida) : -1
  if (k > 0) aptas.unshift(...aptas.splice(k, 1))
  return aptas
}

/** la n-ésima foto de referencia (rota sobre las aptas) */
export function fotoDeReferencia(aptas: FotoDeReferencia[], n: number): FotoDeReferencia | null {
  return aptas.length ? aptas[n % aptas.length] : null
}
