/**
 * M2 · LA REVISIÓN DEL MANUAL con base y sin modelo: leer lo ya raspado, preparar S0/S1/S3, recomprobar (S5/S7) y armar el borrador.
 *
 * Recibe la base por parámetro (`Db`, la misma forma de PostgREST que usa la oficina) para probarse con una base falsa. NO llama a ningún modelo, NO raspa, NO escribe nada:
 * la escritura del borrador está en `borrador.ts` y la promoción en `promover.ts`. Agnóstico: no nombra clientes, ciudades ni rubros.
 *
 *  · lo PROPIO se decide por los parámetros de la llamada y la ficha del cliente (`esFilaPropia`): sin rótulo propio explícito, una fuente es ajena.
 *  · lo humano = campos de la ficha/alta; lo síntesis = documentos de ICP (y solo sirven para detectar dudas y para marcar `solo_sintesis`).
 *  · la «foto» de lo vigente (versión + huella + fecha) va en el informe: ninguna fila de `client_brand_books` se edita.
 */
import crypto from 'node:crypto'
import { evaluarHechos, type InformeDeHechos } from './hechos'
import { detectarDudas, type Duda } from './dudas'
import { aplicarEslogan, frasesPropias, type FrasesPropias } from './frases-propias'
import { recomprobar, type Recomprobacion } from './firmes'
import { fuenteDeSintesis, fuenteHumana, fuentesDeRaspado, ordenarMateria, type FilaDeRaspado, type Materia, type Propios } from './materia'
import { evidenciaParaElJuez, type Fuente } from './procedencia'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>

/** campos de la ficha que cuentan como dato humano del alta (lista cerrada; no se vuelca la ficha entera) */
export const CAMPOS_HUMANOS_DE_LA_FICHA = ['name', 'website_url', 'country', 'city', 'location', 'address', 'phone', 'whatsapp']
export const TOPE_DE_FILAS_DE_RASPADO = 2000

export interface Insumos {
  client_id: string
  client_name: string
  version_vigente: number | null
  /** el borrador del manual vigente (`brand_book_draft`), sin tocar */
  manual: Record<string, unknown>
  fuentes: Fuente[]
  dudas: Duda[]
  propios: Propios
  filas_leidas: number
  foto: { version: number | null; huella: string | null; creado_en: string | null }
}
export type ResultadoDeInsumos = { ok: true; insumos: Insumos } | { ok: false; status: number; error: string; detalle: string }

const huellaDe = (t: string) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16)
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const texto = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x))

/** el borrador que guarda `client_brand_books.content_text` (JSON con `brand_book_draft`); un texto ilegible o sin borrador → null (no se inventa) */
export function borradorDeContentText(contentText: unknown): Record<string, unknown> | null {
  if (typeof contentText !== 'string' || !contentText.trim()) return null
  try {
    const p = JSON.parse(contentText) as Record<string, unknown>
    const d = p.brand_book_draft
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null
  } catch { return null }
}

/** lee TODO lo que S0/S1/S3 necesitan. Un error de lectura se devuelve (nunca se lee como «vacío»). */
export async function leerInsumos(db: Db, clientId: string, opciones: { sinManualPrevio?: boolean } = {}): Promise<ResultadoDeInsumos> {
  const falla = (que: string, m: string): ResultadoDeInsumos => ({ ok: false, status: 502, error: 'lectura_fallida', detalle: `${que}: ${m}` })
  const cl = await db.from('clients').select('*').eq('id', clientId).limit(1)
  if (cl.error) return falla('clients', cl.error.message)
  const cliente = lista(cl.data)[0]
  if (!cliente) return { ok: false, status: 404, error: 'cliente_inexistente', detalle: 'no existe la ficha del cliente' }

  const mb = await db.from('client_brand_books').select('id, version, content_text, created_at').eq('client_id', clientId).order('version', { ascending: false }).limit(1)
  if (mb.error) return falla('client_brand_books', mb.error.message)
  const vigente = lista(mb.data)[0]
  // r62 · el alta chequea el manual ANTES de guardarlo: aún no hay versión vigente (solo con esta opción; sin ella, igual que siempre)
  if (!vigente && !opciones.sinManualPrevio) return { ok: false, status: 409, error: 'sin_manual', detalle: 'el cliente no tiene manual que revisar (la revisión corrige el que existe; un manual de cero lo escribe el alta)' }
  const manual = vigente ? borradorDeContentText(vigente.content_text) : {}
  if (!manual) return { ok: false, status: 409, error: 'manual_ilegible', detalle: 'el manual vigente no trae `brand_book_draft` legible; no se adivina' }

  const rr = await db.from('apify_raw').select('id, apify_function, params, respuesta, ensayo').eq('client_id', clientId).eq('ensayo', false).order('created_at', { ascending: true }).limit(TOPE_DE_FILAS_DE_RASPADO)
  if (rr.error) return falla('apify_raw', rr.error.message)
  const filas = lista(rr.data).filter((f) => f.ensayo !== true) as unknown as FilaDeRaspado[]

  const ic = await db.from('client_icp_documents').select('id, audience_segment, objections, decision_criteria, key_messages_for_segment, content_text').eq('client_id', clientId)
  if (ic.error) return falla('client_icp_documents', ic.error.message)
  const icps = lista(ic.data)

  const config = (cliente.config ?? {}) as { apify?: { own_handles?: Record<string, unknown> } }
  const handles = Object.values(config.apify?.own_handles ?? {}).map(texto).filter(Boolean)
  const propios: Propios = { sitio: (cliente.website_url as string | null) ?? null, handles }
  // coherencia con M1-a: «propio» es igualdad exacta del usuario; sin usuarios declarados en la ficha, TODO el Instagram raspado caería como «de terceros» y lo que solo respalda esa cuenta saldría del manual en silencio
  if (handles.length === 0 && filas.some((f) => f.apify_function === 'instagram_scraper')) {
    return { ok: false, status: 409, error: 'sin_usuarios_propios', detalle: 'hay Instagram raspado pero la ficha no declara la cuenta propia (config.apify.own_handles); sin ella no se distingue lo del cliente de lo de terceros' }
  }

  const humanas: Fuente[] = CAMPOS_HUMANOS_DE_LA_FICHA.filter((c) => texto(cliente[c]).trim()).map((c) => fuenteHumana(`ficha:${c}`, `ficha del cliente · ${c}`, `${c}: ${texto(cliente[c]).trim()}`, 'ficha'))
  const sintesis: Fuente[] = icps.map((d, i) => fuenteDeSintesis(`icp${i}`, 'documento de perfil de cliente ideal', JSON.stringify({ segmento: d.audience_segment, criterios: d.decision_criteria, mensajes: d.key_messages_for_segment, objeciones: d.objections })))
  const dudas = detectarDudas(icps.map((d, i) => ({ origen: `perfil de cliente ideal ${i + 1} · objeciones`, texto: texto(d.objections) })))

  const version = Number(vigente?.version) || null
  return {
    ok: true,
    insumos: {
      client_id: clientId, client_name: texto(cliente.name) || 'cliente', version_vigente: version, manual,
      fuentes: [...fuentesDeRaspado(filas, propios), ...humanas, ...sintesis], dudas, propios, filas_leidas: filas.length,
      foto: { version, huella: huellaDe(texto(vigente?.content_text)), creado_en: (vigente?.created_at as string | null) ?? null },
    },
  }
}

// ───────────────────────── S0 · S1 · S3 (todo código, US$ 0)
/** la tarea del juez admite 14.000 caracteres (el corredor acepta 16.000): campos + instrucción + evidencia deben caber, y la evidencia es lo que cede */
export const TOPE_DE_EVIDENCIA_DEL_JUEZ = 10_000
export interface Preparacion {
  /** el manual vigente tal cual (para el autor del ciclo) */
  manual_vigente: Record<string, unknown>
  foto: Insumos['foto']
  filas_leidas: number
  materia: Pick<Materia, 'texto' | 'recortes' | 'total_original' | 'total_leido'>
  frases: FrasesPropias
  informe: InformeDeHechos
  /** true ⇒ el manual vigente no trae hallazgos de hecho y el eslogan ya está: no se hace nada */
  sin_hallazgos: boolean
  evidencia_del_juez: { texto: string; fuentes_usadas: string[]; excluidas: Array<{ id: string; tipo: string }>; recortada: boolean }
}
export function prepararRevision(ins: Insumos): Preparacion {
  const materia = ordenarMateria(ins.fuentes)
  const frases = frasesPropias(ins.fuentes)
  const informe = evaluarHechos({ manual: ins.manual, fuentes: ins.fuentes, dudas: ins.dudas })
  const taglineYa = typeof ins.manual.tagline === 'string' && ins.manual.tagline.trim() !== ''
  const sin_hallazgos = informe.sin_respaldo.length === 0 && (taglineYa || !frases.eslogan)
  const ev = evidenciaParaElJuez(ins.fuentes, TOPE_DE_EVIDENCIA_DEL_JUEZ)
  return {
    manual_vigente: ins.manual, foto: ins.foto, filas_leidas: ins.filas_leidas,
    materia: { texto: materia.texto, recortes: materia.recortes, total_original: materia.total_original, total_leido: materia.total_leido },
    frases, informe, sin_hallazgos,
    evidencia_del_juez: { texto: ev.texto, fuentes_usadas: ev.fuentes_usadas, excluidas: ev.excluidas, recortada: ev.recortada },
  }
}

// ───────────────────────── S5 · S7 (puerta final) + eslogan por código
export interface ResultadoDeCierre extends Recomprobacion {
  /** M1-b: el eslogan que el código propuso, literal, con sus fuentes y la advertencia visible cuando solo hay UNA */
  eslogan: { aplicado: boolean; motivo?: string; una_sola_fuente?: boolean; literal?: string; fuentes?: Array<{ rotulo: string; canal: string; rol: string }>; advertencia?: string | null }
  /** los hechos CON respaldo (o declarados por el cliente, o con duda) tal como los vio la puerta ANTES de cerrar: lo que la bandeja puede mostrar con su cita. Nunca incluye lo retirado. */
  hechos_visibles: InformeDeHechos['hechos']
}
/** lo que devolvió el autor pasa por la puerta: re-evalúa, retira lo que no tiene cita (queda SOLO en `retirados`), y el código escribe el eslogan si `tagline` está vacío */
export function cerrarRevision(ins: Insumos, despues: Record<string, unknown>, opciones: { sinEslogan?: boolean } = {}): ResultadoDeCierre {
  const r = recomprobar(ins.manual, despues, { fuentes: ins.fuentes, dudas: ins.dudas })
  const fp = frasesPropias(ins.fuentes)
  // r62 · el chequeo del alta SACA lo sin fuente pero NO escribe el eslogan por código (firma: eso es M2/M3)
  const e: { manual: Record<string, unknown>; aplicado: boolean; motivo?: 'sin_eslogan' | 'tagline_ocupado'; una_sola_fuente?: boolean } = opciones.sinEslogan ? { manual: r.manual, aplicado: false } : aplicarEslogan(r.manual, fp)
  const previo = evaluarHechos({ manual: despues, fuentes: ins.fuentes, dudas: ins.dudas })
  const solo = e.aplicado && e.una_sola_fuente === true
  const detalle = e.aplicado && fp.eslogan
    ? { una_sola_fuente: solo, literal: fp.eslogan.literal, fuentes: fp.eslogan.fuentes.map((u) => ({ rotulo: u.rotulo, canal: u.canal, rol: u.rol })), advertencia: solo ? 'UNA SOLA FUENTE: el eslogan sale de un único lugar (no se repite en otro); confírmalo antes de firmar' : null }
    : {}
  return { ...r, hechos_visibles: previo.hechos.filter((h) => h.estado === 'verificado' || h.estado === 'afirmacion_del_cliente' || h.estado === 'con_duda'), manual: e.manual, eslogan: { aplicado: e.aplicado, ...(e.motivo ? { motivo: e.motivo } : {}), ...(e.una_sola_fuente ? { una_sola_fuente: true } : {}), ...detalle } }
}

/** diferencias por campo entre lo vigente y lo nuevo (solo campos de texto cuyo contenido cambió) */
export function diferenciasPorCampo(antes: Record<string, unknown>, despues: Record<string, unknown>): Array<{ campo: string; antes: string; despues: string }> {
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((c) => !c.startsWith('_'))
  const out: Array<{ campo: string; antes: string; despues: string }> = []
  for (const c of campos) {
    const a = texto(antes[c]), d = texto(despues[c])
    if (a !== d) out.push({ campo: c, antes: a, despues: d })
  }
  return out
}
