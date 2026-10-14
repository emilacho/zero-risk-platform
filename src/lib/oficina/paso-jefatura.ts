/**
 * EL PASO `jefatura` DE LA OFICINA (J8a · diseño v4 §11.1 y §13.2) · puro: sin red ni base.
 * Reemplaza, en las tres plantillas de pieza, al jefe (`revision_jefe`), a las correcciones (`corrige*`, `ajusta_laminas*`), al revisor externo (`revisor_externo`) y a las decisiones (`decide*`, `decide_imagen`):
 * la oficina entrega la pieza ya chequeada por código a UNA revisión de la jefatura (tipo `pieza`) y, cuando la revisión cierra, aplica lo que volvió.
 *  · `sobreDeLaRevision` arma lo que se le manda (la entrada de `POST /api/jefatura/revisiones`, sin `devolver_a`, que lo pone el adaptador);
 *  · `aplicarSalidaDeJefatura` traduce la salida de la revisión al estado del encargo con el MISMO vocabulario de siempre (fichas `jefe` que bloquean y siguen sin tomarse ⇒ desacuerdo, opinión `externa` como OPINIÓN,
 *    `fichas_externas.sin_revision` ⇒ «sin segunda mirada», `respuesta_imagen` ⇒ la re-imagen que la oficina ya sabe hacer), así `cerrar`, la bandeja y las plantillas de después no cambian;
 *  · una revisión `fallida` o `incompleta_por_tope`, o que no pudo abrirse, NUNCA pierde la pieza: sigue a la bandeja marcada «revisión incompleta» / «sin revisar».
 */
import type { PayloadDeRevision, Productor, SalidaDeRevision } from '../jefatura/revision/contrato'
import { datos, fichaNueva } from './ayudas'
import type { ContextoDelRevisor } from './ciego'
import type { Encargo } from './puertos'
import type { ResultadoDePaso } from './motor'
import type { Estado, Ficha, Plantilla } from './tipos'

/** la clave del paso en las plantillas, y el artefacto que deja (el que ya leían `cerrar` y la re-imagen) */
export const CLAVE_DEL_PASO_JEFATURA = 'jefatura'
export const ARTEFACTO_DE_LA_JEFATURA = 'respuesta_imagen'
export type FamiliaDePieza = 'post_img' | 'carrusel' | 'kit'

export const familiaDePieza = (pl: Pick<Plantilla, 'familia'>): FamiliaDePieza => (pl.familia === 'carrusel_ig_v1' ? 'carrusel' : pl.familia === 'kit_historias' ? 'kit' : 'post_img')

/**
 * Quién corrige cada parte de la pieza (reparo 2 de CC#3: la fila `pieza` de la política solo declara texto e imagen; el carrusel y el kit llevan además a quien dibuja o estructura).
 * 🔴 Límite honesto (J2): la jefatura todavía solo ENTREGA texto corregido (`resolucion.v1`): quien dibuja las láminas o estructura el kit RESPONDE a sus hallazgos (tomada / no tomada, con razón) pero la jefatura no
 * recibe láminas ni estructura nuevas. Lo que esa respuesta cambie se aplica a mano desde la bandeja. Ver el informe: «pregunta para Emilio».
 */
export function productoresDeLaPieza(familia: FamiliaDePieza): Productor[] {
  const base: Productor[] = [{ donde: 'texto', agente: 'content-creator' }, { donde: 'hashtags', agente: 'content-creator' }, { donde: 'imagen', agente: 'marketing_instagram_curator' }]
  if (familia === 'carrusel') return [...base, { donde: 'laminas', agente: 'carousel-designer' }]
  if (familia === 'kit') return [...base, { donde: 'estructura', agente: 'design-visual-storyteller' }]
  return base
}

/** lo que el encargo sabe de sí para la revisión: la pieza, sus imágenes y los documentos (los mismos que veía el revisor externo) */
export interface MaterialDeLaRevision { pieza: string; imagenes: string[]; contexto: ContextoDelRevisor[] }

export interface SobreDeRevisionDePieza {
  artifact_type: 'pieza'
  artifact_id: string
  client_id: string
  journey_id: string | null
  payload: Omit<PayloadDeRevision, 'devolver_a'>
}

/** las marcas de los chequeos duros que siguen abiertas: viajan como DATO (regla 10), no entran en el pedido de nadie */
const marcasHeredadas = (e: Estado): string[] => e.fichas.filter((f) => f.origen === 'chequeo' && f.estado === 'abierta').map((f) => `${f.donde}: ${f.que ?? ''}`.trim())

export function sobreDeLaRevision(enc: Pick<Encargo, 'id' | 'client_id' | 'familia' | 'tope_usd' | 'dry_run' | 'sala_ref'>, pl: Pick<Plantilla, 'familia'>, e: Estado, m: MaterialDeLaRevision): SobreDeRevisionDePieza {
  const familia = familiaDePieza(pl)
  const heredadas = marcasHeredadas(e)
  const journey = enc.sala_ref && typeof enc.sala_ref._journey_id === 'string' && enc.sala_ref._journey_id ? enc.sala_ref._journey_id : null
  const nombreDeLaPieza = familia === 'carrusel' ? 'copy_carrusel' : familia === 'kit' ? 'copy_kit' : 'pieza_post'
  return {
    artifact_type: 'pieza',
    artifact_id: enc.id,
    client_id: enc.client_id,
    journey_id: journey,
    payload: {
      texto: m.pieza,
      ...(m.imagenes.length ? { imagenes: m.imagenes } : {}),
      productores: productoresDeLaPieza(familia),
      familia,
      chequeos_previos: { pasaron: heredadas.length === 0, necesita_humano: false, marcas: heredadas },
      marcas_heredadas: heredadas,
      contexto: m.contexto,
      // lo que le queda al encargo: la jefatura nunca gasta más de lo que el encargo todavía tiene
      tope_restante_usd: Math.max(0, +(enc.tope_usd - e.gasto_usd).toFixed(6)),
      dry_run: enc.dry_run,
      version: e.artefactos[nombreDeLaPieza]?.version ?? 1,
      generado_por_jefatura: null,
    },
  }
}

// ───────────────────────── lo que se hace con lo que vuelve
export interface DatosDeLaJefatura {
  revision_id: string | null
  resultado: string
  marcas: { con_desacuerdo: boolean; sin_segunda_mirada: boolean }
  desacuerdos: string[]
  respuestas: SalidaDeRevision['respuestas']
  costo_usd: number
  simulado: boolean
  /** `fallida` o `incompleta_por_tope`: la pieza sigue a la bandeja marcada «revisión incompleta» */
  incompleta: boolean
  /** la revisión no pudo abrirse (apagada, tipo no activo, sin presupuesto, error): la pieza sigue a la bandeja marcada «sin revisar» */
  sin_revisar: boolean
  motivo?: string
}

export const datosDeLaJefatura = (e: Estado): DatosDeLaJefatura | null => (datos(e, ARTEFACTO_DE_LA_JEFATURA)?.jefatura as DatosDeLaJefatura | undefined) ?? null

/** una línea «donde: qué (…)» → { donde, que } (es el rótulo que arma la jefatura para cada desacuerdo) */
function partirDesacuerdo(linea: string): { donde: string; que: string } {
  const i = linea.indexOf(':')
  return i > 0 && i < 24 ? { donde: linea.slice(0, i).trim(), que: linea.slice(i + 1).trim() } : { donde: 'texto', que: linea.trim() }
}

export interface OpcionesDeAplicacion {
  /** la re-imagen que ya sabe hacer la oficina (post: `decidirReImagen`; láminas: `decisionDeReImagenL`); recibe si el que dirige la imagen tomó la opinión */
  reImagen: (tomada: { razon: string } | null) => Record<string, unknown>
}

export function aplicarSalidaDeJefatura(pl: Pick<Plantilla, 'familia'>, e: Estado, salida: SalidaDeRevision, o: OpcionesDeAplicacion): ResultadoDePaso {
  const familia = familiaDePieza(pl)
  const incompleta = salida.resultado === 'fallida' || salida.resultado === 'incompleta_por_tope'
  const respuestas = Array.isArray(salida.respuestas) ? salida.respuestas : []
  // fichas de FONDO que siguen sin tomarse: el mismo desacuerdo de siempre (jefe · bloquea · sin tomar); `cerrar` ya sabe contarlas
  const fichas: Ficha[] = (Array.isArray(salida.desacuerdos) ? salida.desacuerdos : []).map((d, i) => {
    const p = partirDesacuerdo(String(d))
    return { ...fichaNueva(`jefe-${e.pasos_ejecutados}-${i}`, 'jefe', p.donde, 'bloquea', p.que, 'revisión de la jefatura', 'una persona decide'), estado: 'no_tomada' as const, razon: 'la jefatura cerró sin que se tomara' }
  })
  // la opinión libre de GPT llega como OPINIÓN (una ficha `externa` por dueño, nunca bloquea ni cuenta como desacuerdo), con lo que cada dueño decidió
  const externas = respuestas.filter((r) => r.origen === 'externa').sort((a, b) => (a.donde === 'texto' ? -1 : b.donde === 'texto' ? 1 : 0))
  const opinion = salida.opinion_externa
  externas.forEach((r, i) => fichas.push({ ...fichaNueva(i === 0 ? `ext-opinion-${e.pasos_ejecutados}` : `ext-opinion-${e.pasos_ejecutados}-${r.donde}`, 'externa', r.donde, 'sugerencia', opinion?.texto ?? '', 'opinión libre del revisor externo (sin criterios ni reglas)', 'quien hizo la parte decide qué toma y qué no'), estado: r.estado === 'tomada' || r.estado === 'no_tomada' ? r.estado : 'no_tomada', ...(r.razon ? { razon: r.razon } : {}) }))
  const tomadaImagen = respuestas.find((r) => r.origen === 'externa' && r.donde === 'imagen' && r.estado === 'tomada')
  const rehacer = salida.imagen_por_rehacer === true && !incompleta
  const reimagen = rehacer ? o.reImagen({ razon: tomadaImagen?.razon ?? 'quien dirige la imagen tomó la opinión' }) : { re_imagen: false, por_rehacer_humano: false, motivo: null, razon: null }
  const jefatura: DatosDeLaJefatura = {
    revision_id: salida.revision_id ?? null, resultado: salida.resultado, marcas: salida.marcas ?? { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: salida.desacuerdos ?? [], respuestas,
    costo_usd: typeof salida.costo_usd === 'number' ? salida.costo_usd : 0, simulado: salida.simulado === true, incompleta, sin_revisar: false,
  }
  const otros: Record<string, Record<string, unknown>> = {}
  // el texto corregido (solo si la revisión no falló): la oficina lo recibe como una versión nueva de la pieza y vuelve a chequear por código (chequeos_2/3)
  const pieza = (salida.artefacto_final as { pieza?: Record<string, unknown> } | undefined)?.pieza
  if (pieza && typeof pieza === 'object' && salida.resultado !== 'fallida') {
    if (familia === 'post_img') otros['pieza_post'] = { ...(datos(e, 'pieza_post') ?? {}), ...pieza }
    else if (familia === 'carrusel') {
      const solo: Record<string, unknown> = {}
      for (const k of ['pie_de_foto', 'hashtags', 'llamado']) if (pieza[k] !== undefined) solo[k] = pieza[k]
      if (Object.keys(solo).length) otros['copy_carrusel'] = { ...(datos(e, 'copy_carrusel') ?? {}), ...solo }
    }
  }
  if (salida.marcas?.sin_segunda_mirada) otros['fichas_externas'] = { sin_revision: true, motivo: 'el revisor externo no respondió tras los reintentos' }
  else if (opinion?.texto) otros['fichas_externas'] = { opinion: opinion.texto, modelo: opinion.modelo ?? null }
  return { costo_usd: 0, artefacto: { ...reimagen, jefatura }, ...(fichas.length ? { fichas } : {}), ...(Object.keys(otros).length ? { otros_artefactos: otros } : {}) }
}

/** la revisión no pudo abrirse o nunca contestó: la pieza sigue, sin fichas nuevas, marcada «sin revisar» (nunca se pierde y nunca se hace pasar por revisada) */
export function aplicarSinRevisar(motivo: string): ResultadoDePaso {
  const jefatura: DatosDeLaJefatura = { revision_id: null, resultado: 'sin_revisar', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: [], respuestas: [], costo_usd: 0, simulado: false, incompleta: false, sin_revisar: true, motivo }
  return { costo_usd: 0, artefacto: { re_imagen: false, por_rehacer_humano: false, motivo: null, razon: null, jefatura } }
}

// ───────────────────────── la marca en la bandeja
export function prefijoDeLaBandeja(e: Estado): string {
  const j = datosDeLaJefatura(e)
  if (!j) return ''
  return (j.incompleta ? '⚠️ REVISIÓN INCOMPLETA · ' : '') + (j.sin_revisar ? '⚠️ SIN REVISAR · ' : '')
}
export function metadataDeLaJefatura(e: Estado): Record<string, unknown> {
  const j = datosDeLaJefatura(e)
  if (!j) return {}
  return { jefatura_resultado: j.resultado, ...(j.revision_id ? { jefatura_revision_id: j.revision_id } : {}), ...(j.incompleta ? { revision_incompleta: true } : {}), ...(j.sin_revisar ? { sin_revisar: true, motivo_sin_revisar: j.motivo ?? null } : {}) }
}
/** ¿la jefatura dejó la pieza con marca de revisión incompleta o sin revisar? (cuenta como desacuerdo: una persona la mira antes de aprobarla) */
export const revisionIncompleta = (e: Estado): boolean => { const j = datosDeLaJefatura(e); return !!j && (j.incompleta || j.sin_revisar) }
