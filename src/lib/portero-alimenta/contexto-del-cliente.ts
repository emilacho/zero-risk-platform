/**
 * EL ADJUNTO ÚNICO `contexto_del_cliente` (31-oct · encargo «voz del público y resumen siempre», puntos 2 y 5) · US$ 0, solo lectura, sin modelo.
 * Toda respuesta del portero a una oficina sobre un cliente (el pedido libre y la consulta) lleva, como campo PROPIO y aparte de los resultados:
 *   { resumen_vivo: { estado: 'vigente' | 'sin_resumen_vivo', … }, informes: [ …los informes de análisis vigentes, uno por tipo… ] }
 * El resumen vivo va ENTERO y NO resume a los informes (van lado a lado). Si no hay resumen vivo lo dice (`sin_resumen_vivo`): no se inventa.
 * Cada informe lleva su `fecha_de_corte` y la marca `hay_material_nuevo_desde_el_corte` (¿entró alguna ficha nueva al cerebro después del corte?).
 * Si la lectura falla NO se disfraza de «vacío»: el campo trae `estado: 'no_se_pudo_leer'` y el motivo.
 */
import { CLASE_DEL_DUENO } from './dueno'
import { CLASE_DEL_SUPUESTO_ACEPTADO, supuestoDeLaFicha, type SupuestoAceptado } from './supuestos-del-dueno'
import { esloganDelCliente, REGLA_DEL_ESLOGAN } from '../manual/campos-del-manual'
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const objeto = (v: unknown): Fila => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fila) : {})

export const CLASE_DEL_RESUMEN_VIVO = 'resumen_vivo'
export const CLASE_DEL_INFORME = 'informe_de_analisis'
export const PREFIJO_DE_ATRIBUTO_DEL_INFORME = 'informe:'
export const ORIGEN_DEL_INFORME = 'sintesis_de_oficina'
/** a partir de aquí la marca «hay material nuevo» deja de contar y dice «N o más» */
export const TOPE_DE_FICHAS_NUEVAS = 500
/** clases que NO son material nuevo del cliente: lo derivado (resumen, informes) y lo que escribe el dueño aparte */
const NO_ES_MATERIAL = new Set([CLASE_DEL_RESUMEN_VIVO, CLASE_DEL_INFORME])

export interface ResumenVivoAdjunto {
  estado: 'vigente' | 'sin_resumen_vivo' | 'no_se_pudo_leer'
  ficha_id?: string
  actualizado_en?: string | null
  texto?: string
  sedes?: Array<{ clave: string; ficha_id: string; texto: string }>
  detalle?: string
}
export interface InformeAdjunto {
  ficha_id: string
  tipo: string
  texto: string
  autor: { mesa: string | null; agente: string | null }
  fecha_de_corte: string | null
  registrado_en: string | null
  citas: string[]
  origen: typeof ORIGEN_DEL_INFORME
  hay_material_nuevo_desde_el_corte: boolean
  fichas_nuevas_desde_el_corte: number | string
}
/** 01-nov · firma de Emilio: lo que el dueño declaró. Es un hecho con la máxima precedencia */
export interface HechoDelDueno { tema: string; respuesta: string; sede: string | null; frases_negadas: string[] }

export interface ContextoDelCliente {
  hechos_del_dueno?: HechoDelDueno[]
  /** 06-nov · lo que el dueño ASUMIÓ (supuestos que propuso una oficina): aparte de sus hechos, nunca como dato del dueño */
  supuestos_aceptados_por_el_dueno?: SupuestoAceptado[]
  /** 01-nov · el eslogan que el cliente ya usa, con su fuente y la regla de uso; ausente si no se conoce */
  eslogan?: { texto: string; fuente: string; regla: string }
  resumen_vivo: ResumenVivoAdjunto
  informes: InformeAdjunto[]
  informes_estado?: 'ok' | 'no_se_pudo_leer'
  informes_detalle?: string
}

const esVigente = (f: Fila, ahora: Date) => !f.retirada_en && f.descartada !== true && (!f.vigente_hasta || Date.parse(String(f.vigente_hasta)) >= ahora.getTime())
const ms = (v: unknown): number => { const t = Date.parse(txt(v)); return Number.isFinite(t) ? t : 0 }
const masNueva = (a: Fila, b: Fila) => ms(b.observado_en) - ms(a.observado_en)

/** lee el resumen vivo entero y los informes vigentes de UN cliente */
export async function adjuntoDelCliente(db: Db, clientId: string, ahora: Date = new Date()): Promise<ContextoDelCliente> {
  const eslogan = await esloganVigente(db, clientId)
  const c = await contextoSinEslogan(db, clientId, ahora)
  return eslogan ? { eslogan, ...c } : c
}

/** del manual vigente; nunca lanza: sin este dato la carpeta viaja igual */
async function esloganVigente(db: Db, clientId: string): Promise<ContextoDelCliente['eslogan'] | null> {
  try {
    const r = await db.from('client_brand_books').select('tagline, content_text, version').eq('client_id', clientId)
    const fila = r.error ? null : lista(r.data).reduce<Fila | null>((m, f) => (!m || Number(f.version) > Number(m.version) ? f : m), null)
    if (!fila) return null
    let borrador: Fila = {}
    try { borrador = (JSON.parse(txt(fila.content_text)) as { brand_book_draft?: Fila }).brand_book_draft ?? {} } catch { /* contenido ilegible: queda la columna */ }
    const e = esloganDelCliente({ ...borrador, ...(txt(fila.tagline) ? { tagline: fila.tagline } : {}) })
    return e ? { ...e, regla: REGLA_DEL_ESLOGAN } : null
  } catch {
    return null
  }
}

/** de lo que guardó la puerta del dueño; sin tema o sin respuesta no es un hecho que se pueda citar */
function hechoDeLaFicha(f: Fila): HechoDelDueno | null {
  const tag = (f.provenance_tag ?? {}) as { datos?: { tema?: unknown; respuesta?: unknown; frases_negadas?: unknown } }
  const tema = txt(tag.datos?.tema); const respuesta = txt(tag.datos?.respuesta)
  if (!tema || !respuesta) return null
  const n = tag.datos?.frases_negadas
  return { tema, respuesta, sede: txt(f.sede) || null, frases_negadas: Array.isArray(n) ? n.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [] }
}

async function contextoSinEslogan(db: Db, clientId: string, ahora: Date): Promise<ContextoDelCliente> {
  const q = await db.from('cerebro_fichas').select('id, clase, atributo, titulo, contenido, que_es, observado_en, fecha_fuente, creado_en, vigente_hasta, retirada_en, descartada, sede, provenance_tag').eq('client_id', clientId).in('clase', [CLASE_DEL_RESUMEN_VIVO, CLASE_DEL_INFORME, CLASE_DEL_DUENO, CLASE_DEL_SUPUESTO_ACEPTADO]).is('retirada_en', null).limit(500)
  if (q.error) {
    const detalle = `cerebro_fichas: ${String(q.error.message ?? q.error).slice(0, 160)}`
    return { resumen_vivo: { estado: 'no_se_pudo_leer', detalle }, informes: [], informes_estado: 'no_se_pudo_leer', informes_detalle: detalle }
  }
  const filas = lista(q.data).filter((f) => esVigente(f, ahora))
  const hechos = filas.filter((f) => txt(f.clase) === CLASE_DEL_DUENO).map(hechoDeLaFicha).filter((h): h is HechoDelDueno => !!h)
  const supuestos = filas.filter((f) => txt(f.clase) === CLASE_DEL_SUPUESTO_ACEPTADO).map(supuestoDeLaFicha).filter((s): s is SupuestoAceptado => !!s)
  const conHechos = <T extends object>(c: T): T & { hechos_del_dueno?: HechoDelDueno[]; supuestos_aceptados_por_el_dueno?: SupuestoAceptado[] } => ({ ...(hechos.length ? { hechos_del_dueno: hechos } : {}), ...(supuestos.length ? { supuestos_aceptados_por_el_dueno: supuestos } : {}), ...c })

  // ── el resumen vivo: el del cliente (el más nuevo si hubiera dos por una carrera) y los de cada sede
  const resumenes = filas.filter((f) => txt(f.clase) === CLASE_DEL_RESUMEN_VIVO).sort(masNueva)
  const delCliente = resumenes.find((f) => txt(f.atributo) === 'resumen:cliente')
  const sedes = new Map<string, Fila>()
  for (const f of resumenes) { const m = /^resumen:sede:(.+)$/.exec(txt(f.atributo)); if (m && !sedes.has(m[1])) sedes.set(m[1], f) }
  const resumen_vivo: ResumenVivoAdjunto = delCliente
    ? { estado: 'vigente', ficha_id: String(delCliente.id), actualizado_en: txt(delCliente.observado_en) || null, texto: txt(delCliente.contenido) || txt(delCliente.que_es), ...(sedes.size ? { sedes: [...sedes].map(([clave, f]) => ({ clave, ficha_id: String(f.id), texto: txt(f.contenido) || txt(f.que_es) })) } : {}) }
    : { estado: 'sin_resumen_vivo' }

  // ── los informes: uno vigente por tipo (si por una carrera hubiera dos, el de corte más nuevo)
  const porTipo = new Map<string, Fila>()
  for (const f of filas.filter((x) => txt(x.clase) === CLASE_DEL_INFORME)) {
    const tipo = tipoDeLaFicha(f)
    const actual = porTipo.get(tipo)
    if (!actual || ms(corteDe(f)) > ms(corteDe(actual))) porTipo.set(tipo, f)
  }
  if (!porTipo.size) return conHechos({ resumen_vivo, informes: [], informes_estado: 'ok' as const })

  // ¿entró algo al cerebro después del corte? una sola lectura desde el corte más viejo; se cuenta por informe
  const corteMasViejo = [...porTipo.values()].map(corteDe).filter((c) => ms(c) > 0).sort((a, b) => ms(a) - ms(b))[0] ?? ''
  let nuevas: Fila[] = []
  let detalle: string | undefined
  if (corteMasViejo) {
    const n = await db.from('cerebro_fichas').select('id, clase, creado_en, descartada, retirada_en').eq('client_id', clientId).gte('creado_en', corteMasViejo).limit(TOPE_DE_FICHAS_NUEVAS + 1)
    if (n.error) detalle = `cerebro_fichas (material nuevo): ${String(n.error.message ?? n.error).slice(0, 160)}`
    else nuevas = lista(n.data).filter((f) => f.descartada !== true && !NO_ES_MATERIAL.has(txt(f.clase)))
  }
  const informes = [...porTipo.entries()].map(([tipo, f]): InformeAdjunto => {
    const corte = corteDe(f)
    const cuantas = ms(corte) > 0 ? nuevas.filter((x) => ms(x.creado_en) > ms(corte)).length : 0
    const d = objeto(objeto(f.provenance_tag).datos)
    return {
      ficha_id: String(f.id), tipo, texto: txt(f.contenido) || txt(f.que_es),
      autor: { mesa: txt(d.mesa) || null, agente: txt(d.agente) || null },
      fecha_de_corte: corte || null, registrado_en: txt(f.creado_en) || null,
      citas: Array.isArray(d.citas) ? d.citas.map(String) : [], origen: ORIGEN_DEL_INFORME,
      // sin poder leer lo nuevo NO se afirma que no haya: se marca como «sí hay que mirar»
      hay_material_nuevo_desde_el_corte: detalle ? true : cuantas > 0,
      fichas_nuevas_desde_el_corte: detalle ? 'no_se_pudo_leer' : cuantas > TOPE_DE_FICHAS_NUEVAS ? `${TOPE_DE_FICHAS_NUEVAS}+` : cuantas,
    }
  }).sort((a, b) => a.tipo.localeCompare(b.tipo))
  return conHechos({ resumen_vivo, informes, informes_estado: detalle ? 'no_se_pudo_leer' : 'ok', ...(detalle ? { informes_detalle: detalle } : {}) })
}

export const tipoDeLaFicha = (f: Fila): string => {
  const a = txt(f.atributo)
  return a.startsWith(PREFIJO_DE_ATRIBUTO_DEL_INFORME) ? a.slice(PREFIJO_DE_ATRIBUTO_DEL_INFORME.length) : txt(objeto(objeto(f.provenance_tag).datos).tipo) || 'sin_tipo'
}
/** la fecha de corte vive en `fecha_fuente` (la fecha del material en que se apoya el informe) */
const corteDe = (f: Fila): string => txt(f.fecha_fuente)

/**
 * (01-nov · mesa de análisis) el resumen vivo cita sus fichas con el id corto `[ficha:xxxxxxxx · fecha]`: esto los lleva al id completo, solo de ESTE cliente.
 * Un prefijo que casa con dos fichas no identifica a ninguna y no se cuenta. Si la lectura falla devuelve [] : el informe se juzga solo por las fichas de la consulta, como antes.
 */
export async function idsCitadosEnElTexto(db: Db, clientId: string, texto: string): Promise<string[]> {
  const cortos = new Set([...texto.matchAll(/\[ficha:([0-9a-f]{8})/gi)].map((m) => m[1].toLowerCase()))
  if (!cortos.size) return []
  try {
    const r = await db.from('cerebro_fichas').select('id').eq('client_id', clientId)
    if (r.error) return []
    const porCorto = new Map<string, string[]>()
    for (const f of (r.data as Fila[] | null) ?? []) { const id = txt(f.id).toLowerCase(); const k = id.slice(0, 8); if (cortos.has(k)) porCorto.set(k, [...(porCorto.get(k) ?? []), id]) }
    return [...porCorto.values()].filter((v) => v.length === 1).map((v) => v[0])
  } catch { return [] }
}
