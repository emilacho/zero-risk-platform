/**
 * 17-nov · propuestas también en IMAGEN · tramo 2b · EL BORRADOR DE CADA PROPUESTA (contrato CC5 v1 §1b · decisiones Lenovo: N=3, 2 vueltas, parada única).
 * Antes de la parada del dueño, cada propuesta trae lo que se ve de verdad, a calidad de borrador:
 *  · la imagen de cada lámina: la foto propia tal cual (su url) o la generada en BAJA con el primer prompt válido de ESA propuesta (el mismo generador que el final,
 *    con la misma foto de referencia apta si el ingeniero la nombró); la calidad es DATO de la plantilla (`limites.imagen_borrador`, `low` por omisión);
 *  · las láminas dibujadas con su texto (carrusel y kit: el render de siempre); la foto con mesa no se dibuja en el borrador (su acabado es otro paso): queda `imagen_url`.
 *  · Solo en la fase de propuestas: sin propuestas de imagen, o con la propuesta ya aprobada (parada única), el paso pasa de largo SIN GASTAR.
 *  · 🟡 CC6 #1128 · respeta el TOPE DE SU PASO, como el borrador del video: antes de cada imagen se cotiza (lo ya cobrado + lo que costaría esa) y lo que no cabe NO
 *    se llama; queda ausente con su error y sale en el aviso. Las imágenes se piden POR TURNOS entre propuestas (la 1.ª de cada una, luego la 2.ª…): si el tope
 *    alcanza para pocas, cada propuesta tiene la suya antes de que otra tenga dos.
 *  · No frena el encargo: lo que no salió queda ausente (nada se inventa), con su error, y un aviso UNO por lote en #alertas; lo cobrado va al gasto igual.
 *  · La tarjeta (CC5) lee `borrador_imagen.propuestas[i].laminas[j]` por `n` (`direccion/decisiones-propuestas.ts`).
 */
import { datos } from '../ayudas'
import { avisoDeFotoQueNoSirve, fotoPorId } from '../id-de-foto'
import { fotosDeReferencia, fotosPorImagen, otrasFotosDeLaImagen, type FotoDeReferencia } from '../foto-de-referencia'
import { armarLaminasDeCarrusel, armarLaminasDeKit, type ElementoDeCopyKit, type ElementoDeEstructura, type ImagenDeRef, type Lamina } from '../laminas'
import type { Cambios, Encargo, FuentesCompletas, Puertos } from '../puertos'
import type { Estado, Plantilla } from '../tipos'
import { propuestaDeImagenAprobada } from '../video/aprobacion'
import { ARTEFACTO_PROPUESTAS_IMAGEN, type PropuestaDeImagen, type PropuestasDeImagen } from './propuestas-imagen'

/** la función del paso de código y su artefacto (el nombre lo lee la fila de la dirección: no cambiarlo sin avisar a CC5) */
export const FUNCION_BORRADOR_IMAGEN = 'borrador_imagen'
export const ARTEFACTO_BORRADOR_IMAGEN = 'borrador_imagen'
export const CALIDAD_DEL_BORRADOR_DE_IMAGEN_POR_OMISION = 'low'
/**
 * 🟡 CC6 #1128 · lo que se cotiza por imagen ANTES de pedirla (lado seguro: por encima de lo medido).
 *  · `low`: 0,02 · medido por CC6 en prd (`agent_image_generations`, 30 días): «low» con foto de referencia, promedio 0,0161, máximo 0,0183.
 *  · `medium` / `high` / otra: sin medición propia todavía → la cifra alta de la lista del proveedor redondeada hacia arriba (0,07 / 0,25); otra calidad, la mayor.
 *  · La plantilla la puede fijar con `limites.imagen_borrador.costo_por_imagen_usd` (DATO, cuando haya medición).
 */
export const COSTO_ESTIMADO_POR_IMAGEN_DEL_BORRADOR_USD: Record<string, number> = { low: 0.02, medium: 0.07, high: 0.25 }
const COSTO_ESTIMADO_DESCONOCIDO_USD = 0.25

export interface LaminaDelBorrador { n: number; png_url?: string; imagen_url?: string }
export interface BorradorDeImagenDeLaPropuesta { id: string; costo_usd: number; laminas: LaminaDelBorrador[]; errores?: string[] }
export interface BorradoresDeImagen { fase: 'borrador'; ronda: number; calidad: string; propuestas: BorradorDeImagenDeLaPropuesta[]; costo_usd: number; tope_usd?: number; omitido?: string; simulado?: boolean }

/** la calidad del borrador (DATO): `limites.imagen_borrador.quality` (y `size` si lo dice); mal escrita o ausente → `low` (nunca frena) */
export function calidadDelBorradorDeImagen(limites: Record<string, unknown> | null | undefined): { quality: string; size?: string } {
  const v = limites?.imagen_borrador as { quality?: unknown; size?: unknown } | undefined
  const q = typeof v?.quality === 'string' && v.quality.trim() ? v.quality.trim() : CALIDAD_DEL_BORRADOR_DE_IMAGEN_POR_OMISION
  const s = typeof v?.size === 'string' && /^\d+x\d+$/.test(v.size.trim()) ? v.size.trim() : undefined
  return s ? { quality: q, size: s } : { quality: q }
}

/** lo que se cotiza por imagen del borrador: el DATO de la plantilla si es un número > 0; si no, la cifra de su calidad (desconocida → la mayor) · pura */
export function costoEstimadoPorImagenDelBorrador(limites: Record<string, unknown> | null | undefined): number {
  const v = (limites?.imagen_borrador as { costo_por_imagen_usd?: unknown } | undefined)?.costo_por_imagen_usd
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return COSTO_ESTIMADO_POR_IMAGEN_DEL_BORRADOR_USD[calidadDelBorradorDeImagen(limites).quality] ?? COSTO_ESTIMADO_DESCONOCIDO_USD
}

/** el tope del paso del borrador en la plantilla (sin paso o sin tope válido: 0 → no se genera nada; nunca gasta sin tope) · pura */
export function topeDelBorradorDeImagen(pl: Pick<Plantilla, 'pasos'>): number {
  const t = Number(pl.pasos.find((p) => p.funcion === FUNCION_BORRADOR_IMAGEN)?.tope_usd)
  return Number.isFinite(t) && t > 0 ? t : 0
}

interface ImagenDecidida { ref: string; modo: 'real' | 'generada' | 'ninguna'; foto_id?: string }
type PorRef = Record<string, { prompts?: Array<{ prompt: string; foto_de_referencia?: string; otras_fotos_de_referencia?: string[] }> }>
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const esHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u)
const r4 = (n: number) => Math.round(n * 1e4) / 1e4

/** por qué el paso pasa de largo sin gastar (null = hay que hacer el borrador) */
export function borradorDeImagenOmitido(e: Estado): string | null {
  if (!datos(e, ARTEFACTO_PROPUESTAS_IMAGEN)) return 'sin propuestas de imagen'
  if (propuestaDeImagenAprobada(e)) return 'la propuesta ya está aprobada (parada única)'
  return null
}

/** las láminas de una propuesta con la imagen de cada una: n (el de la tarjeta) → la ref de su imagen */
function refsPorLamina(p: PropuestaDeImagen): Array<{ n: number; ref: string }> {
  const est = arr<ElementoDeEstructura>(p.artefactos?.estructura?.elementos)
  return p.laminas.map((l) => ({ n: l.n, ref: est.find((x) => x.ref === l.rol)?.foto_slot || l.rol }))
}

/** lo que una propuesta va a pedir al generador (en su orden) y lo que ya se sabe de ella antes de gastar */
interface PlanDeLaPropuesta { p: PropuestaDeImagen; porRef: Record<string, ImagenDeRef>; errores: string[]; costo: number; pedidos: Array<{ ref: string; prompt: string; foto: FotoDeReferencia | null; otras_fotos: FotoDeReferencia[] }> }

function planDeLaPropuesta(e: Estado, p: PropuestaDeImagen, fotos: FuentesCompletas['fotos'], maxRefs: number): PlanDeLaPropuesta {
  const errores: string[] = []
  const porRef: Record<string, ImagenDeRef> = {}
  const imagenes = arr<ImagenDecidida>(p.artefactos?.visual_direction?.imagenes)
  const prompts = (p.artefactos?.prompts_validos?.por_ref ?? {}) as PorRef
  // la foto propia: tal cual
  for (const i of imagenes) {
    if (i.modo !== 'real' || !i.foto_id) continue
    // 26-nov · el id acortado por el equipo se resuelve con la regla de toda la oficina (`id-de-foto.ts`); el error dice la causa real, no siempre «no tiene url»
    const f = fotoPorId(fotos, i.foto_id)
    if (f && esHttp(f.url)) porRef[i.ref] = { origen: 'real', url: f.url, foto_id: f.id }
    else errores.push(avisoDeFotoQueNoSirve(i.foto_id, i.ref, fotos))
  }
  // la generada: con el primer prompt válido de ESTA propuesta y la foto de referencia apta que nombró el ingeniero (como el final), hasta el máximo de la plantilla
  const generadas = imagenes.filter((i) => i.modo === 'generada')
  for (const i of generadas) if (!prompts[i.ref]?.prompts?.length) errores.push(`«${i.ref}» no tiene prompt válido: sin imagen en el borrador`)
  const conPrompt = generadas.filter((i) => prompts[i.ref]?.prompts?.length)
  const pendientes = conPrompt.slice(0, maxRefs)
  for (const i of conPrompt.slice(maxRefs)) errores.push(`«${i.ref}» pasa el tope de imágenes generadas (${maxRefs}): sin imagen en el borrador`)
  const usadas = imagenes.filter((i) => i.modo === 'real' && i.foto_id).map((i) => i.foto_id!)
  const aptas = fotosDeReferencia(fotos, arr<{ id: string; cercana?: boolean }>(datos(e, 'candidatas_foto')?.candidatas), { excluir: usadas })
  const porImagen = fotosPorImagen(aptas, pendientes.map((i) => prompts[i.ref].prompts![0].foto_de_referencia))
  // 19-nov · «lo real es el set» · las otras fotos que nombró el ingeniero viajan con la base; una imagen sin nombradas hereda las de la propuesta (sin base no hay edición: se genera con el manual)
  const primero = (i: ImagenDecidida) => prompts[i.ref].prompts![0]
  const deLaPieza = pendientes.flatMap((i) => [primero(i).foto_de_referencia, ...(primero(i).otras_fotos_de_referencia ?? [])])
  const pedidos = pendientes.map((i, j) => {
    const foto = porImagen.fotos[j]
    const o = otrasFotosDeLaImagen(fotos, foto, [primero(i).foto_de_referencia, ...(primero(i).otras_fotos_de_referencia ?? [])], deLaPieza)
    for (const id of o.no_aptas) errores.push(`el ingeniero nombró la foto «${id}» para «${i.ref}» y no se puede usar (no existe o no tiene dirección): la imagen sale sin ella`)
    return { ref: i.ref, prompt: primero(i).prompt, foto, otras_fotos: foto ? o.otras : [] }
  })
  return { p, porRef, errores, costo: 0, pedidos }
}

/**
 * Corre el borrador de TODAS las propuestas (lo que cuesta solo se llama aquí). Devuelve el artefacto, el gasto por imagen y si hubo imagen generada.
 * `familia`: 'carrusel' | 'kit' dibujan láminas; 'post' no.
 */
export async function correrBorradorDeImagen(P: Puertos, enc: Encargo, pl: Plantilla, familia: 'carrusel' | 'kit' | 'post'):
  Promise<{ artefacto: BorradoresDeImagen; gastos: NonNullable<Cambios['gastos']>; imagen_generada: boolean }> {
  const e = enc.estado_del_motor
  const calidad = calidadDelBorradorDeImagen(pl.limites)
  const pi = datos(e, ARTEFACTO_PROPUESTAS_IMAGEN) as unknown as PropuestasDeImagen | undefined
  const omitido = borradorDeImagenOmitido(e)
  if (omitido || !pi) return { artefacto: { fase: 'borrador', ronda: pi?.ronda ?? 0, calidad: calidad.quality, propuestas: [], costo_usd: 0, omitido: omitido ?? 'sin propuestas de imagen' }, gastos: [], imagen_generada: false }
  const base = datos(e, 'encargo') as unknown as { F: FuentesCompletas; plataforma?: string }
  const maxRefs = Number(pl.limites.imagenes_generadas_max ?? 2)
  const tope = topeDelBorradorDeImagen(pl)
  const estimado = costoEstimadoPorImagenDelBorrador(pl.limites)
  const gastos: NonNullable<Cambios['gastos']> = []
  let hubo = false
  let cobrado = 0
  // lo comprometido: cada imagen pedida pesa lo MAYOR entre lo que cobró y lo cotizado (lado seguro, y el freno vale también en seco, donde se cobra 0)
  let comprometido = 0
  const planes = pi.propuestas.map((p) => planDeLaPropuesta(e, p, base.F.fotos, maxRefs))
  // POR TURNOS: la 1.ª imagen de cada propuesta, luego la 2.ª…; cada una se cotiza antes (lo cobrado + lo que costaría) y si no cabe en el tope del paso NO se pide
  const vueltas = Math.max(0, ...planes.map((x) => x.pedidos.length))
  for (let k = 0; k < vueltas; k++) {
    for (const plan of planes) {
      const q = plan.pedidos[k]
      if (!q) continue
      if (comprometido + estimado > tope + 1e-9) {
        plan.errores.push(`«${q.ref}» no cabe en el tope del borrador (US$ ${tope}: comprometido ${r4(comprometido)} + ${estimado} por imagen): sin imagen en el borrador`)
        continue
      }
      const g = await P.imagen({ prompt: q.prompt, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run, foto: q.foto, ...(q.otras_fotos.length ? { otras_fotos: q.otras_fotos } : {}), ...calidad })
      // pedida = comprometida, salga o no (un fallo del proveedor puede haber cobrado igual)
      comprometido += Math.max(estimado, g.ok ? g.costo_usd : 0)
      if (!g.ok) { plan.errores.push(`el generador no devolvió la imagen de «${q.ref}»: ${g.error}`); continue }
      plan.porRef[q.ref] = { origen: 'generada', url: g.url, generation_id: g.generation_id }
      plan.costo += g.costo_usd; cobrado += g.costo_usd; hubo = true
      gastos.push({ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: g.generation_id, cost_usd: g.costo_usd, base: 'usage' })
    }
  }
  const propuestas: BorradorDeImagenDeLaPropuesta[] = []
  for (const { p, porRef, errores, costo } of planes) {
    const laminas: LaminaDelBorrador[] = refsPorLamina(p).map(({ n, ref }) => (porRef[ref] ? { n, imagen_url: porRef[ref].url } : { n }))
    // el dibujo con el texto (carrusel y kit): el render de siempre, en la carpeta de esta propuesta y ronda
    if (familia !== 'post') {
      const armado = familia === 'carrusel'
        ? (() => { const r = armarLaminasDeCarrusel(arr<Lamina>(p.artefactos?.laminas?.laminas), porRef); return { slides: r.slides, ns: r.slides.map((_, k) => k + 1) } })()
        : (() => {
          const est = arr<ElementoDeEstructura>(p.artefactos?.estructura?.elementos)
          const r = armarLaminasDeKit(est, arr<ElementoDeCopyKit>(p.artefactos?.copy_kit?.elementos), porRef)
          return { slides: r.slides, ns: r.refs.map((ref) => est.findIndex((x) => x.ref === ref) + 1) }
        })()
      if (!armado.slides.length) errores.push('no hay láminas que dibujar en el borrador')
      else {
        const F = base.F
        const r = await P.renderLaminas({ client_id: enc.client_id, encargo_id: enc.id, plataforma: base.plataforma ?? 'instagram', marca: F.marca!, slug: F.slug!, slides: armado.slides as never, subcarpeta: `oficina/${enc.id}/borrador/${p.id}-r${pi.ronda}`, dry_run: enc.dry_run })
        if (!r.ok) errores.push(`no se pudieron dibujar las láminas del borrador: ${r.error}`)
        else if (r.urls.length !== armado.slides.length) errores.push(`el dibujo devolvió ${r.urls.length} lámina(s) y se pidieron ${armado.slides.length}`)
        else armado.ns.forEach((n, k) => { const l = laminas.find((x) => x.n === n); if (l && esHttp(r.urls[k])) l.png_url = r.urls[k] })
      }
    }
    propuestas.push({ id: p.id, costo_usd: r4(costo), laminas, ...(errores.length ? { errores } : {}) })
  }
  return { artefacto: { fase: 'borrador', ronda: pi.ronda, calidad: calidad.quality, propuestas, costo_usd: r4(cobrado), tope_usd: tope, ...(enc.dry_run ? { simulado: true } : {}) }, gastos, imagen_generada: hubo }
}

/**
 * El aviso de UN lote de borradores incompleto (una vez por lote): cada propuesta a la que le falta algo, con lo que dijo el generador o el dibujo tal cual. null si no falta nada.
 * «Falta» = alguna lámina sin su dibujo (carrusel/kit) o una imagen que debía generarse y no salió. No juzga el motivo: lo copia.
 */
export function avisoDeBorradorDeImagenIncompleto(briefId: string, b: Pick<BorradoresDeImagen, 'propuestas' | 'omitido'>, familia: 'carrusel' | 'kit' | 'post'): string | null {
  if (b.omitido) return null
  const incompletas = b.propuestas.filter((p) => (p.errores?.length ?? 0) > 0 || (familia !== 'post' && p.laminas.some((l) => !l.png_url)))
  if (!incompletas.length) return null
  const cuales = incompletas.map((p) => `${p.id}: ${(p.errores?.length ? p.errores : ['láminas sin dibujo']).join('; ').replace(/\s+/g, ' ').trim().slice(0, 300)}`).join(' · ')
  return `🖼️ Borrador de imagen incompleto · ${briefId}: ${cuales}. Las propuestas siguen a «Propuestas» como están. Si el motivo es saldo del proveedor, hay que recargar ANTES de aprobar.`
}
