/**
 * ENCARGO 16 · 21-nov · LA ESCRITURA de «Cómo se produce con IA»: una versión NUEVA del manual que SOLO agrega
 * `brand_book_draft.produccion_con_ia`, sin tocar ninguna otra sección ni lo que Emilio ya aprobó (la firma y el estado
 * de validación del vigente se conservan tal cual). Vive en `src/lib/manual/` porque el cerebro SOLO LEE por
 * construcción (su guarda lo exige); la LECTURA que arma el pedido está en `src/lib/cerebro/manual-produccion-con-ia.ts`.
 * Nada se recorta: un texto fuera de los topes se RECHAZA con su campo, su largo y el tope.
 */
import { randomUUID } from 'node:crypto'
import { buildBrandBookRow } from '../../app/api/brand-book/[clientId]/route'
import { conservarPalabrasDuras } from './palabras-con-intencion'
import { borradorDeContentText, type Db } from './revision'

type Fila = Record<string, unknown>
export const MIN_DEL_TEXTO = 200
export const TOPE_DEL_TEXTO = 20_000
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

export type ResultadoDeEscribir =
  | { ok: true; dry_run: boolean; version: number | null; id: string | null; solo_cambia: 'produccion_con_ia' }
  | { ok: false; status: number; error: string; detalle: string }

/**
 * Guarda la sección como versión NUEVA del manual: el mismo borrador vigente + `produccion_con_ia`, nada más cambia.
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
  const manualNuevo: Fila = { ...draft, produccion_con_ia: texto }
  // el JSON previo del manual conserva su firma (approved_by/at del vigente); la nota dice qué cambió
  let firmaPrevia: Fila = {}
  try { firmaPrevia = JSON.parse(String(anterior.content_text)) as Fila } catch { /* ya validado por borradorDeContentText */ }
  const base = buildBrandBookRow(e.client_id, manualNuevo, {
    approved_by: firmaPrevia.approved_by ?? 'manual_vigente',
    approved_at: firmaPrevia.approved_at ?? ahora,
    fidelity_passed: firmaPrevia.fidelity_passed === true,
    fidelity_scores: firmaPrevia.fidelity_scores ?? null,
    fidelity_threshold: firmaPrevia.fidelity_threshold ?? null,
    gate_outcome: firmaPrevia.gate_outcome ?? null,
    gate_nota: 'solo se agregó la sección «Cómo se produce con IA» (encargo 16); el resto del manual es el vigente, sin cambios',
  }, vigente + 1)
  const row: Fila = {
    ...base,
    // lo aprobado no cambia de estado por esta sección: se conserva lo del vigente
    human_validated: anterior.human_validated === true,
    auto_generated_from: 'manual_produccion_con_ia',
    provenance_tag: { type: 'evidence', source: 'manual_produccion_con_ia', trust_level: 'tenant_trusted', escrita_por: 'agente por flujo', workflow_id: e.workflow_id ?? null, workflow_execution_id: e.workflow_execution_id ?? null, en: ahora },
  }
  if (anterior.tagline != null && row.tagline == null) row.tagline = anterior.tagline
  for (const c of ['primary_colors', 'typography', 'imagery_style', 'logo_usage_notes']) if (row[c] == null && anterior[c] != null) row[c] = anterior[c]
  Object.assign(row, conservarPalabrasDuras(anterior, row))

  const id = (e.nuevoId ?? randomUUID)()
  const ins = await db.from('client_brand_books').insert({ id, ...row })
  if (ins.error) {
    const choque = String((ins.error as Fila).code ?? '') === '23505' || /duplicate|unique/i.test(ins.error.message ?? '')
    if (choque) return { ok: false, status: 409, error: 'version_vigente_cambio', detalle: `otra escritura tomó la versión ${vigente + 1} al mismo tiempo; nada se pisa` }
    return { ok: false, status: 502, error: 'insercion_fallida', detalle: ins.error.message }
  }
  return { ok: true, dry_run: false, version: vigente + 1, id, solo_cambia: 'produccion_con_ia' }
}
