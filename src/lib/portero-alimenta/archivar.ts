/**
 * ARCHIVAR · de las decisiones del juez a LO QUE SE ESCRIBE (con fecha y fuente). PURO: devuelve operaciones; quien llama las ejecuta (o no, en `dry_run`).
 *   · NADA SE BORRA: `reemplaza` = la ficha vieja queda con `retirada_en` + `motivo_retirada` + `reemplazada_por`; sigue en la historia y el portero que atiende no la entrega;
 *   · cada unidad deja una fila en `cerebro_unidades_vistas` (también lo que fue `nada`, ruido o ajeno): así no se vuelve a pagar ni a juzgar;
 *   · lo que el modelo no pudo decidir (`duda`) y lo `sin_confirmar` se archiva `incierta` y NO se entrega;
 *   · el texto de la ficha lo copia el sistema desde la unidad (el modelo nunca transcribe);
 *   · nace como evidencia SIN SELLO (`untrusted`) con enlace a la fila cruda de `apify_raw`.
 */
import { randomUUID } from 'node:crypto'
import { PLAZOS_EN_DIAS } from '../cerebro/plazos'
import { puenteDeFicha } from './puente'
import type { Unidad } from './unidades'
import type { DecisionDelJuez, ItemParaJuzgar } from './juez'
import type { EstadoDeFiltro } from './filtro'

export type Origen = 'dueno' | 'su_fuente' | 'plataforma' | 'tercero'
export interface FichaNueva {
  id: string
  client_id: string
  ref: string
  clase: string
  titulo: string
  que_es: string
  contenido: string
  origen: Origen
  fecha_fuente: string | null
  observado_en: string
  reconfirmado_en: string
  plazo: string | null
  vigente_hasta: string | null
  version_de: string | null
  propiedad: 'propia' | 'ajena' | 'incierta'
  porque: string
  juzgado_por: 'modelo' | 'sistema' | 'regla'
  fuente_url: string | null
  atributo: string | null
  decision: 'suma' | 'reemplaza' | 'duda'
  razon_de_decision: string | null
  huella: string
  provenance_tag: Record<string, unknown>
  /** si esta ficha se entrega al portero que atiende (`false` = incierta: se guarda marcada, no se entrega) */
  entregable: boolean
}
export interface RetiroDeFicha { id: string; reemplazada_por: string; motivo_retirada: string }
export interface UnidadVista { client_id: string; fuente: string; unidad_ref: string; huella: string; veredicto: string; ficha_id: string | null; ultima_vez: string }
export interface SeccionDelPuente { section_label: string; text: string }
export interface PuenteDeIndice { source_table: 'cerebro_fichas'; source_id: string; client_id: string; sections: SeccionDelPuente[]; metadata: Record<string, unknown>; source: string }
export interface PlanDeArchivo {
  fichas: FichaNueva[]
  retiros: RetiroDeFicha[]
  vistas: UnidadVista[]
  puente: PuenteDeIndice[]
  /** fichas viejas cuyo trozo del índice debe salir (la ficha queda; el índice nunca miente) */
  sacar_del_indice: string[]
  resumen: { suma: number; reemplaza: number; nada: number; duda: number; ajenas: number; ruido: number; repetidas: number; sin_confirmar: number }
}

const PLAZO_POR_CLASE: Record<string, string> = { precio: 'precio_oferta_horario', horario: 'precio_oferta_horario', texto: 'catalogo_y_direccion' }
const diasDe = (plazo: string | null): number | null => (plazo ? ((PLAZOS_EN_DIAS as Record<string, number | null>)[plazo] ?? null) : null)
const DIA = 86_400_000

function origenDe(u: Unidad): Origen {
  if (u.autoria === 'tercero') return 'tercero'
  return u.fuente === 'reparto' ? 'plataforma' : 'su_fuente'
}
function plazoDe(u: Unidad): string | null {
  if (u.fuente === 'metrica') return u.atributo?.startsWith('metrica:mapas') ? 'ficha_mapas_propia' : 'perfil_propio'
  if (u.fuente === 'mapas') return u.atributo === 'mapas:horario' ? 'precio_oferta_horario' : 'ficha_mapas_propia'
  if (u.fuente === 'instagram') return u.clase_dato === 'atributo' ? 'perfil_propio' : 'publicacion_propia'
  if (u.fuente === 'publicaciones_facebook') return 'publicacion_propia'
  if (u.clase_de_linea && PLAZO_POR_CLASE[u.clase_de_linea]) return PLAZO_POR_CLASE[u.clase_de_linea]
  return u.autoria === 'propia' ? 'catalogo_y_direccion' : null
}

export interface EntradaDeArchivo {
  client_id: string
  /** lo que pasó el filtro, en el mismo orden que `decisiones` */
  items: Array<{ unidad: Unidad; item: ItemParaJuzgar }>
  decisiones: DecisionDelJuez[]
  /** lo que el filtro dejó fuera (ajeno / ruido / repetida) y lo `sin_confirmar` ya resuelto aparte */
  descartadas: Array<{ unidad: Unidad; estado: Exclude<EstadoDeFiltro, 'propio' | 'sin_confirmar'>; motivo: string }>
  sin_confirmar: Unidad[]
  ahora: Date
  puente_al_indice: boolean
  nuevoId?: () => string
}

export function planDeArchivo(e: EntradaDeArchivo): PlanDeArchivo {
  const id = e.nuevoId ?? randomUUID
  const iso = e.ahora.toISOString()
  const plan: PlanDeArchivo = { fichas: [], retiros: [], vistas: [], puente: [], sacar_del_indice: [], resumen: { suma: 0, reemplaza: 0, nada: 0, duda: 0, ajenas: 0, ruido: 0, repetidas: 0, sin_confirmar: 0 } }
  const vista = (u: Unidad, veredicto: string, ficha_id: string | null) => plan.vistas.push({ client_id: e.client_id, fuente: u.fuente, unidad_ref: u.unidad_ref, huella: u.huella, veredicto, ficha_id, ultima_vez: iso })

  e.items.forEach(({ unidad: u, item }, i) => {
    const d = e.decisiones[i]
    if (!d) return
    if (d.decision === 'nada') { plan.resumen.nada++; vista(u, 'nada', null); return }
    const nueva = id()
    const entregable = d.decision !== 'duda'
    const plazo = plazoDe(u)
    const dias = diasDe(plazo)
    const ficha: FichaNueva = {
      id: nueva, client_id: e.client_id,
      ref: `portero:${u.fuente}:${u.huella.slice(0, 16)}`,
      clase: u.atributo ? u.atributo.split(':')[0] : u.fuente, titulo: `${u.fuente} · ${u.atributo ?? u.unidad_ref}`.slice(0, 120), que_es: u.texto.slice(0, 200),
      contenido: u.texto, origen: origenDe(u), fecha_fuente: u.fecha_fuente, observado_en: u.observado_en, reconfirmado_en: u.observado_en,
      plazo, vigente_hasta: dias === null ? null : new Date(new Date(u.observado_en).getTime() + dias * DIA).toISOString(),
      version_de: d.decision === 'reemplaza' ? d.reemplaza_ficha : null,
      propiedad: !entregable ? 'incierta' : u.autoria === 'propia' ? 'propia' : 'ajena',
      porque: d.razon || (d.degradada_por ?? ''), juzgado_por: d.decidido_por === 'modelo' ? 'modelo' : 'sistema',
      fuente_url: u.url ?? (u.ref.startsWith('http') ? u.ref : null), atributo: u.atributo, decision: d.decision === 'duda' ? 'duda' : d.decision === 'reemplaza' ? 'reemplaza' : 'suma',
      razon_de_decision: d.cita, huella: u.huella,
      provenance_tag: { type: 'evidence', source: 'apify_scrape', trust_level: 'untrusted', ingress_route: '/api/brain/alimentar/procesar', respaldo_en: { tabla: 'apify_raw', id: u.apify_raw_id }, ...(u.metrica ? { metrica: u.metrica } : {}), ...(d.degradada_por ? { degradada_por: d.degradada_por } : {}) },
      entregable,
    }
    plan.fichas.push(ficha)
    vista(u, d.decision, nueva)
    plan.resumen[d.decision === 'duda' ? 'duda' : d.decision]++
    if (d.decision === 'reemplaza' && d.reemplaza_ficha) {
      plan.retiros.push({ id: d.reemplaza_ficha, reemplazada_por: nueva, motivo_retirada: `reemplazada por ${nueva} el ${iso.slice(0, 10)}` })
      plan.sacar_del_indice.push(d.reemplaza_ficha)
    }
    if (e.puente_al_indice && entregable) {
      // NO es un empuje a nadie: es la misma biblioteca de consulta (el índice) al día; las oficinas BUSCAN cuando lo necesitan (constructor compartido con la reconciliación).
      plan.puente.push(puenteDeFicha({ ...ficha, descartada: false, retirada_en: null }))
    }
    void item
  })

  for (const u of e.sin_confirmar) {
    plan.resumen.sin_confirmar++
    const nueva = id()
    plan.fichas.push({
      id: nueva, client_id: e.client_id, ref: `portero:${u.fuente}:${u.huella.slice(0, 16)}`, clase: u.fuente, titulo: `${u.fuente} · sin confirmar`, que_es: u.texto.slice(0, 200), contenido: u.texto,
      origen: 'tercero', fecha_fuente: u.fecha_fuente, observado_en: u.observado_en, reconfirmado_en: u.observado_en, plazo: null, vigente_hasta: null, version_de: null,
      propiedad: 'incierta', porque: 'nombra al cliente pero sin una segunda señal propia (posible homónimo)', juzgado_por: 'regla', fuente_url: u.url ?? null, atributo: null, decision: 'duda', razon_de_decision: null,
      huella: u.huella, provenance_tag: { type: 'evidence', source: 'apify_scrape', trust_level: 'untrusted', ingress_route: '/api/brain/alimentar/procesar', respaldo_en: { tabla: 'apify_raw', id: u.apify_raw_id } }, entregable: false,
    })
    vista(u, 'sin_confirmar', nueva)
  }
  for (const x of e.descartadas) {
    if (x.estado === 'ajeno') plan.resumen.ajenas++
    else if (x.estado === 'ruido') plan.resumen.ruido++
    else plan.resumen.repetidas++
    // lo repetido solo renueva «última vez»; lo ajeno y el ruido quedan vistos (no se vuelven a pagar ni a juzgar)
    vista(x.unidad, x.estado, null)
  }
  return plan
}
