/**
 * ENCARGO 16 · 21-nov · LA ESCRITURA de «Cómo se produce con IA»: una versión NUEVA del manual que SOLO agrega
 * `brand_book_draft.produccion_con_ia`, sin tocar ninguna otra sección ni lo que Emilio ya aprobó.
 *
 * 🔴 de CC6 en #1275 (23-nov): esto es una EDICIÓN de una sección, no un manual nuevo. La versión nueva se construye
 * COPIANDO la fila vigente (`copiaSinIdentidad`, el mismo patrón de la edición del dueño): `provenance_tag` se conserva
 * ENTERO (quién validó, cómo y cuándo; la edición del dueño; todo lo demás) y solo se le SUMA la marca de esta sección;
 * `gate_nota`, `brand_values`, `human_validated` y cada columna del vigente viajan tal cual. Solo cambian
 * `content_text.brand_book_draft.produccion_con_ia`, `version` y `auto_generated_from`.
 *
 * Vive en `src/lib/manual/` porque el cerebro SOLO LEE por construcción (su guarda lo exige); la LECTURA que arma el
 * pedido está en `src/lib/cerebro/manual-produccion-con-ia.ts`. Nada se recorta: un texto fuera de los topes se
 * RECHAZA con su campo, su largo y el tope.
 */
import { randomUUID } from 'node:crypto'
import { copiaSinIdentidad } from './edicion-del-dueno'
import { borradorDeContentText, type Db } from './revision'

type Fila = Record<string, unknown>
export const MIN_DEL_TEXTO = 200
export const TOPE_DEL_TEXTO = 20_000
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const objeto = (v: unknown): Fila => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fila) : {})

export type ResultadoDeEscribir =
  | { ok: true; dry_run: boolean; version: number | null; id: string | null; solo_cambia: 'produccion_con_ia' }
  | { ok: false; status: number; error: string; detalle: string }

/**
 * Guarda la sección como versión NUEVA del manual: la fila vigente copiada entera + `produccion_con_ia`, nada más cambia.
 * Como en la promoción: si la versión vigente cambió desde `version_base`, no se pisa nada y se declara.
 */
export async function escribirProduccionConIa(db: Db, e: { client_id: string; texto: string; version_base: number; dry_run: boolean; workflow_id?: string; workflow_execution_id?: string; ahora?: Date; nuevoId?: () => string }): Promise<ResultadoDeEscribir> {
  const texto = txt(e.texto)
  if (!texto || texto.length < MIN_DEL_TEXTO) return { ok: false, status: 400, error: 'texto_invalido', detalle: `\`texto\` tiene ${texto.length} caracteres y el mínimo es ${MIN_DEL_TEXTO}: una sección vacía no es una sección` }
  if (texto.length > TOPE_DEL_TEXTO) return { ok: false, status: 400, error: 'texto_demasiado_largo', detalle: `\`texto\` tiene ${texto.length} caracteres y el tope es ${TOPE_DEL_TEXTO}; nada se recorta: se rechaza` }

  const prev = await db.from('client_brand_books').select('*').eq('client_id', e.client_id).order('version', { ascending: false }).limit(1)
  if (prev.error) return { ok: false, status: 502, error: 'lectura_fallida', detalle: `client_brand_books: ${prev.error.message}` }
  const anterior = lista(prev.data)[0]
  if (!anterior) return { ok: false, status: 409, error: 'sin_manual', detalle: 'el cliente no tiene manual que ampliar' }
  const vigente = Number(anterior.version) || 0
  if (vigente !== e.version_base) return { ok: false, status: 409, error: 'version_vigente_cambio', detalle: `se preparó sobre la versión ${e.version_base} y la vigente ya es la ${vigente}; nada se pisa: vuelve a preparar` }
  const draft = borradorDeContentText(anterior.content_text)
  if (!draft) return { ok: false, status: 409, error: 'manual_ilegible', detalle: 'el manual vigente no trae `brand_book_draft` legible' }

  if (e.dry_run) return { ok: true, dry_run: true, version: null, id: null, solo_cambia: 'produccion_con_ia' }

  const ahora = (e.ahora ?? new Date()).toISOString()
  // la copia exacta del vigente (firma, validación, gate, columnas: TODO); solo cambia lo de abajo
  const nueva = copiaSinIdentidad(anterior)
  let contenido: Fila = {}
  try { contenido = objeto(JSON.parse(String(anterior.content_text))) } catch { /* ya validado por borradorDeContentText */ }
  nueva.content_text = JSON.stringify({ ...contenido, brand_book_draft: { ...draft, produccion_con_ia: texto } })
  nueva.version = vigente + 1
  nueva.auto_generated_from = 'manual_produccion_con_ia'
  // `provenance_tag` ENTERO + la marca de la sección: no se quita NADA (validado_por/en/via, editado_por_dueno, manual_cambio_id…)
  nueva.provenance_tag = { ...objeto(anterior.provenance_tag), seccion_produccion_con_ia: { escrita_por: 'agente por flujo', workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null, en: ahora } }

  const id = (e.nuevoId ?? randomUUID)()
  const ins = await db.from('client_brand_books').insert({ id, ...nueva })
  if (ins.error) {
    const choque = String((ins.error as Fila).code ?? '') === '23505' || /duplicate|unique/i.test(ins.error.message ?? '')
    if (choque) return { ok: false, status: 409, error: 'version_vigente_cambio', detalle: `otra escritura tomó la versión ${vigente + 1} al mismo tiempo; nada se pisa` }
    return { ok: false, status: 502, error: 'insercion_fallida', detalle: ins.error.message }
  }
  return { ok: true, dry_run: false, version: vigente + 1, id, solo_cambia: 'produccion_con_ia' }
}
