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

/** 19-nov · «lo real es el set» (precisión de Emilio 16:34) · sin foto real la imagen se genera igual con el estilo del manual, y la pieza lo dice: nunca frena */
export const avisoDeImagenGenerada = (cual: string): string => `${cual} salió generada con el estilo del manual: el cliente no tiene una foto real de esto`

/** 19-nov · «lo real es el set» · cuántas fotos viajan con la base en un pedido (la edición admite 16 en total) */
export const MAX_OTRAS_FOTOS = 15

/**
 * 19-nov · «lo real es el set» (GO Lenovo + ADENDA 1: nadie arma un juego aparte) · las OTRAS fotos que viajan con la base de UNA imagen. Pura.
 * Las elige el agente que crea: las que nombró para esta imagen; si para esta no nombró ninguna, hereda las que nombró en las demás imágenes de la pieza
 * (bases y otras, en su orden). Sirve cualquier foto propia con dirección (el lugar, el personaje, el producto), no solo las candidatas del protagonista.
 * Nunca repite la base ni una foto ya puesta; tope `MAX_OTRAS_FOTOS`. `no_aptas`: las que nombró para ESTA imagen y no se pueden usar (sin dirección o no existen).
 * Sin fotos nombradas en toda la pieza → [] (cero fotos: se genera igual, sin frenar).
 */
export function otrasFotosDeLaImagen(propias: FotoConUrl[], base: FotoDeReferencia | null, deEstaImagen: Array<string | null | undefined>, deLaPieza: Array<string | null | undefined>): { otras: FotoDeReferencia[]; no_aptas: string[] } {
  const propiasDeEsta = deEstaImagen.filter((x): x is string => typeof x === 'string' && !!x.trim())
  const lista = propiasDeEsta.length ? propiasDeEsta : deLaPieza.filter((x): x is string => typeof x === 'string' && !!x.trim())
  const otras: FotoDeReferencia[] = []
  const no_aptas: string[] = []
  for (const id of lista) {
    if (id === base?.id || otras.some((o) => o.id === id)) continue
    const url = propias.find((f) => f.id === id)?.url
    if (typeof url !== 'string' || !url.trim()) { if (propiasDeEsta.length && !no_aptas.includes(id)) no_aptas.push(id); continue }
    if (otras.length < MAX_OTRAS_FOTOS) otras.push({ id, url })
  }
  return { otras, no_aptas }
}

/** la n-ésima foto de referencia (rota sobre las aptas) */
export function fotoDeReferencia(aptas: FotoDeReferencia[], n: number): FotoDeReferencia | null {
  return aptas.length ? aptas[n % aptas.length] : null
}

/**
 * una foto por imagen (cruce mejora 3 ↔ mejora 4): la que pidió el ingeniero de prompts para esa imagen, si es apta (puede repetirse si él la pide para dos);
 * las demás rotan sobre las aptas que nadie pidió (si se acabaron, sobre todas), para que dos imágenes no caigan en la misma foto por accidente.
 * Sin pedidos es exactamente la rotación de siempre. `no_aptas`: los pedidos que no se pudieron respetar (cercana, sin dirección o ya usada como foto real).
 */
export function fotosPorImagen(aptas: FotoDeReferencia[], pedidas: Array<string | null | undefined>): { fotos: Array<FotoDeReferencia | null>; no_aptas: Array<{ i: number; id: string }> } {
  const no_aptas: Array<{ i: number; id: string }> = []
  const respetadas = pedidas.map((id, i) => {
    if (!id) return null
    const f = aptas.find((x) => x.id === id) ?? null
    if (!f) no_aptas.push({ i, id })
    return f
  })
  const tomadas = new Set(respetadas.filter((f): f is FotoDeReferencia => !!f).map((f) => f.id))
  const libres = aptas.filter((f) => !tomadas.has(f.id))
  const ronda = libres.length ? libres : aptas
  let n = 0
  return { fotos: respetadas.map((f) => f ?? fotoDeReferencia(ronda, n++)), no_aptas }
}
