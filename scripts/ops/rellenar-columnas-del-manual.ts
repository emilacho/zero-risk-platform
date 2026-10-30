/**
 * E1 · RELLENAR LAS COLUMNAS DE LOS MANUALES VIEJOS (30-oct). Solo AGREGA: copia la última versión como `max+1` con las columnas que estaban vacías ya traducidas
 * desde el borrador, por la MISMA definición que usa el alta (`columnasDelBorrador`). Ninguna fila se edita ni se borra.
 *   npx tsx scripts/ops/rellenar-columnas-del-manual.ts --cliente=<uuid> [--cliente=<uuid> …] [--aplicar] [--empujar]
 * Sin --aplicar: en seco, no escribe nada; dice qué columnas llenaría, qué trozos del cerebro hay por versión (condición 1 del Cerebro) y qué se declara hueco.
 * Reglas (condiciones del Cerebro, 30-oct):
 *   · solo llena columnas VACÍAS (jamás pisa algo escrito; un campo `fuente:'dueno'` ya viene escrito en su columna y por eso no se toca);
 *   · el eslogan sale solo de la opción con cita propia limpia; si no hay, la columna queda vacía y se declara hueco (no se indexa basura);
 *   · agrega `completitud` al contenido; el sello `human_validated` no cambia;
 *   · --empujar manda la fila nueva al cerebro por la puerta única (/api/brain/reembed-source-row); sin eso solo queda en la tabla.
 * US$ 0 (sin modelo). Solo para clientes que se nombran; ningún barrido.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sanitizeProseFields } from '../../src/lib/brand-book-caveat-extractor'
import { columnasDelBorrador, evaluarCompletitud, fugasDeLasColumnas } from '../../src/lib/manual/campos-del-manual'

const t = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => process.env[k] ?? (t.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const args = process.argv.slice(2)
const clientes = args.filter((a) => a.startsWith('--cliente=')).map((a) => a.slice(10))
const aplicar = args.includes('--aplicar')
const empujar = args.includes('--empujar')

const vacio = (v: unknown): boolean => v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
const objeto = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') { try { const x = JSON.parse(v); return x && typeof x === 'object' ? (x as Record<string, unknown>) : {} } catch { return {} } }
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

async function main() {
  if (clientes.length === 0 || clientes.some((c) => !/^[0-9a-f-]{36}$/.test(c))) throw new Error('faltan --cliente=<uuid> (uno o varios)')
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const informe: unknown[] = []
  for (const cliente of clientes) {
    const { data: filas, error } = await db.from('client_brand_books').select('*').eq('client_id', cliente).order('version', { ascending: false })
    if (error) throw new Error(`no pude leer los manuales de ${cliente}: ${error.message}`)
    const todas = (filas ?? []) as Record<string, unknown>[]
    if (todas.length === 0) { informe.push({ cliente, resultado: 'sin manual' }); continue }
    const vigente = todas[0]
    const contenido = objeto(vigente.content_text)
    const borrador = objeto(contenido.brand_book_draft)
    const prosa = sanitizeProseFields(borrador).cleaned
    const calculadas = columnasDelBorrador(borrador, prosa) as unknown as Record<string, unknown>

    const llena: Record<string, unknown> = {}
    const yaEstaban: string[] = []
    const huecos: string[] = []
    for (const [col, val] of Object.entries(calculadas)) {
      if (!vacio(vigente[col])) { yaEstaban.push(col); continue }
      if (vacio(val)) { huecos.push(col); continue }
      llena[col] = val
    }
    const completitud = evaluarCompletitud(borrador, {})
    const fugas = fugasDeLasColumnas(borrador, prosa)

    // condición 1 del Cerebro: ¿cuántos trozos hay por versión? (si las viejas siguen vivas el cerebro las sumaría)
    const ids = todas.map((f) => String(f.id))
    const { data: trozos } = await db.from('client_brain_chunks').select('source_id').eq('client_id', cliente).eq('source_table', 'client_brand_books').in('source_id', ids)
    const porVersion: Record<string, number> = {}
    for (const f of todas) porVersion[`v${f.version}`] = ((trozos ?? []) as { source_id: string }[]).filter((x) => x.source_id === String(f.id)).length

    const r: Record<string, unknown> = {
      cliente, version_vigente: vigente.version, human_validated: vigente.human_validated,
      columnas_que_llenaria: Object.keys(llena), ya_estaban: yaEstaban, huecos_declarados: huecos,
      fugas_declaradas: Object.keys(fugas), completo: completitud.completo, huecos_del_manual: completitud.huecos.map((h) => h.clave),
      trozos_del_cerebro_por_version: porVersion,
    }
    if (Object.keys(llena).length === 0) { informe.push({ ...r, resultado: 'nada que llenar (no se agrega versión)' }); continue }
    if (!aplicar) { informe.push({ ...r, resultado: 'seco · no escribió' }); continue }

    const nueva = Number(vigente.version) + 1
    const fila: Record<string, unknown> = { ...vigente, ...llena, version: nueva }
    for (const k of ['id', 'created_at', 'updated_at']) delete fila[k]
    fila.content_text = JSON.stringify({ ...contenido, completitud })
    fila.auto_generated_from = 'relleno_de_columnas'
    fila.provenance_tag = { ...objeto(vigente.provenance_tag), relleno_de_columnas: { desde_version: vigente.version, columnas: Object.keys(llena), en: new Date().toISOString() } }
    const ins = await db.from('client_brand_books').insert(fila).select('id, version').single()
    if (ins.error) { informe.push({ ...r, resultado: `NO escribió: ${ins.error.message}` }); process.exitCode = 1; continue }
    const nuevoId = String((ins.data as Record<string, unknown>).id)
    // lectura de vuelta: lo escrito es lo que se quería escribir
    const { data: leida } = await db.from('client_brand_books').select('*').eq('id', nuevoId).single()
    const leidaOk = Object.keys(llena).every((c) => JSON.stringify((leida as Record<string, unknown>)?.[c]) === JSON.stringify(llena[c]))
    let empuje: unknown = 'no pedido'
    if (empujar) {
      const base = (g('ZERO_RISK_API_URL') ?? g('NEXT_PUBLIC_BASE_URL') ?? 'https://zero-risk-platform.vercel.app').replace(/\/$/, '')
      const res = await fetch(`${base}/api/brain/reembed-source-row`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': g('INTERNAL_API_KEY') ?? '' }, body: JSON.stringify({ source_table: 'client_brand_books', source_id: nuevoId, client_id: cliente }) })
      empuje = { status: res.status, cuerpo: (await res.text()).slice(0, 200) }
    }
    informe.push({ ...r, resultado: 'ESCRIBIÓ', version_nueva: nueva, id_nuevo: nuevoId, lectura_de_vuelta_ok: leidaOk, empuje })
    if (!leidaOk) process.exitCode = 1
  }
  console.log(JSON.stringify({ modo: aplicar ? 'APLICA' : 'seco', informe }, null, 1))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
