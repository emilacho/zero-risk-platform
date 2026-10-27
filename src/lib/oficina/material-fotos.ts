/**
 * LAS FOTOS DEL ENCARGO · UNA sola implementación de «qué fotos propias sirven para esta pieza» para las tres familias (post, carrusel, kit). La usan `asignar_fotos`, `elegir_foto`
 * y la medición del MATERIAL (¿hay suficientes antes de que decida el curador?). Pura.
 */
import { datos } from './ayudas'
import { prohibePersonas, protagonistasDelBrief, type BriefLeido } from './brief'
import { candidatasFoto } from './fotos'
import { fotosMinimas, limitesDeMaterial } from './material'
import type { FuentesCompletas } from './puertos'
import type { ElementoDelKit } from './brief'
import type { Estado, Plantilla } from './tipos'

interface BaseDelEncargo { brief: BriefLeido; proporcion: string; F: FuentesCompletas; familia?: string; elementos?: ElementoDelKit[] }

export function candidatasDelEncargo(e: Estado, pl: Plantilla, ahora: Date, o: { permitirCercanas?: boolean; relajarReuso?: boolean } = {}) {
  const b = datos(e, 'encargo') as unknown as BaseDelEncargo
  const kit = b.familia === 'kit'
  const vocab = b.F.vocabulario_de_productos
  const protas = kit ? protagonistasDelBrief({ protagonista: (b.elementos ?? []).map((x) => `${x.tema}. ${x.datos.join(' ')}`).join('. ') }, vocab) : protagonistasDelBrief(b.brief, vocab)
  const prohibe = prohibePersonas(b.brief)
  const pedido = { protagonista: protas, prohibe_personas: prohibe, proporcion: b.proporcion, usos: b.F.usos, reuso_dias: Number(pl.limites.reuso_dias ?? 14), ahora, ...(o.permitirCercanas ? { permitir_cercanas: true } : {}) }
  let cf = candidatasFoto(b.F.fotos, { ...pedido, excluir_reusadas: true }, b.F.propios)
  let reusoPermitido = false
  if (cf.candidatas.length === 0 && (o.relajarReuso ?? pl.familia !== 'post_img')) {
    // «una foto sola que sirve no se bloquea»: si no hay otra, se permite repetir (con aviso)
    const laxa = candidatasFoto(b.F.fotos, { ...pedido, excluir_reusadas: false }, b.F.propios)
    if (laxa.candidatas.length) { cf = laxa; reusoPermitido = true }
  }
  return { cf, protas, prohibe, reusoPermitido }
}

/** ¿cuántas fotos propias aptas hay (estrictas: del protagonista) frente a las que hacen falta? */
export function medirFotos(e: Estado, pl: Plantilla, ahora: Date): { aptas: number; minimo: number; protas: string[]; cercanas: number } {
  const b = datos(e, 'encargo') as unknown as BaseDelEncargo
  const lim = limitesDeMaterial(pl.limites)
  const familia = pl.familia === 'carrusel_ig_v1' ? 'carrusel' : pl.familia === 'kit_historias' ? 'kit' : 'post_img'
  const estricta = candidatasDelEncargo(e, pl, ahora)
  const conCercanas = candidatasDelEncargo(e, pl, ahora, { permitirCercanas: true })
  return { aptas: estricta.cf.candidatas.length, minimo: fotosMinimas(familia, (b.elementos ?? []).length, lim), protas: estricta.protas, cercanas: conCercanas.cf.candidatas.length - estricta.cf.candidatas.length }
}
