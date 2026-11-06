/**
 * LO QUE YA SE GUARDÓ APLANADO (encargo 05-nov «informes con formato», punto 2) · US$ 0, sin modelo.
 * Hasta el 05-nov la puerta de informes y la del dueño guardaban el texto en UNA línea. Este guion, por cliente:
 *  · INFORMES (`informe_de_analisis`): busca el original en la traza de Braintrust (salida del analista, ventana de 30 min antes de la ficha).
 *    Solo lo recupera si el original, pasado por la puerta de hoy y puesto en una línea, es IGUAL letra por letra a lo guardado. Nada se inventa.
 *    Se cambia solo `contenido`; `que_es`, `huella` y `ref` quedan (no dependen de los saltos). El rastro: `provenance_tag.datos.formato`.
 *  · RESPUESTAS DEL DUEÑO (`dato_del_dueno`) sin saltos y guardadas antes de `--antes-de`: el original no se guardó en ninguna parte
 *    (o el manual ya cambió desde esa versión). No se toca el texto: se marca `provenance_tag.datos.formato = { estado: 'posiblemente_aplanado', motivo }`.
 *    Las del manual cuyo original sí está y nunca tuvo saltos no se marcan: no perdieron nada.
 *  · COMENTARIOS de redes: no hay columna para marcar; solo se cuentan (ver el informe del encargo).
 *   --antes-de=<ISO> (obligatorio)  [--escribir]   (sin --escribir: en seco, no guarda nada)
 * Secretos por el entorno (doppler run -p zero-risk -c prd --): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRAINTRUST_API_KEY.
 */
import { createHash } from 'node:crypto'
import { sinDatosPersonales, unaLinea } from '../../src/lib/portero-alimenta/dueno'

const BRAINTRUST = 'https://api-eu.braintrust.dev/v1/project_logs/9a1f2db0-41d0-444d-97ce-665c29cbf174/fetch'
const POR = 'CC-CEREBRO · encargo 05-nov «informes con formato»'
type Fila = Record<string, unknown>
const arg = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const huella = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const objeto = (x: unknown): Fila => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Fila) : {})
const recortar = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)
const comoTexto = (v: unknown): string | null => {
  if (Array.isArray(v)) { const t = v.map((x) => String(x).trim()).filter(Boolean); return t.length ? t.join('\n') : null }
  if (typeof v === 'string') return v.trim() || null
  return null
}

async function main() {
  const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const B = process.env.BRAINTRUST_API_KEY || ''
  const antesDe = arg('antes-de') ?? ''
  if (!U || !K || !B) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o BRAINTRUST_API_KEY en el entorno')
  if (Number.isNaN(Date.parse(antesDe))) throw new Error('falta --antes-de=<ISO>: la hora en que se publicó la puerta que ya no aplana')
  const escribir = process.argv.includes('--escribir')
  const h = { apikey: K, Authorization: `Bearer ${K}` }
  const get = async (p: string): Promise<Fila[]> => { const r = await fetch(`${U}/rest/v1/${p}`, { headers: h }); const j = await r.json(); if (!r.ok || !Array.isArray(j)) throw new Error(`${p.split('?')[0]}: HTTP ${r.status}`); return j as Fila[] }
  const patch = async (id: string, clientId: string, cambio: Fila): Promise<boolean> => {
    const r = await fetch(`${U}/rest/v1/cerebro_fichas?id=eq.${id}&client_id=eq.${clientId}`, { method: 'PATCH', headers: { ...h, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(cambio) })
    const j = await r.json().catch(() => null)
    return r.ok && Array.isArray(j) && j.length === 1
  }
  const nombres = Object.fromEntries((await get('clients?select=id,name')).map((c) => [String(c.id), String(c.name)]))
  const informe: Record<string, Fila> = {}
  const cuenta = (cliente: string, clave: string) => { const c = (informe[nombres[cliente] ?? cliente] ??= {}); c[clave] = Number(c[clave] ?? 0) + 1 }

  // ── INFORMES: el original en Braintrust
  const informes = (await get('cerebro_fichas?select=id,client_id,contenido,creado_en,provenance_tag&clase=eq.informe_de_analisis&limit=1000'))
    .filter((f) => !String(f.contenido ?? '').includes('\n') && Date.parse(String(f.creado_en)) < Date.parse(antesDe))
  const spans: Array<{ id: string; created: string; texto: string }> = []
  if (informes.length) {
    const desde = new Date(Math.min(...informes.map((f) => Date.parse(String(f.creado_en)))) - 30 * 60_000).toISOString()
    let cursor: string | undefined
    for (let p = 0; p < 200; p++) {
      const r = await fetch(BRAINTRUST, { method: 'POST', headers: { Authorization: `Bearer ${B}`, 'content-type': 'application/json' }, body: JSON.stringify({ limit: 200, ...(cursor ? { cursor } : {}) }) })
      if (!r.ok) throw new Error(`braintrust: HTTP ${r.status}`)
      const j = (await r.json()) as { events?: Fila[]; cursor?: string }
      const ev = j.events ?? []
      for (const e of ev) {
        if (objeto(e.span_attributes).name !== 'Claude Agent') continue
        const partes = objeto(e.output).content
        const texto = Array.isArray(partes) ? partes.map((c) => String(objeto(c).text ?? '')).join('') : ''
        if (texto) spans.push({ id: String(e.id), created: String(e.created), texto })
      }
      if (!j.cursor || !ev.length || String(ev[ev.length - 1].created ?? '') < desde) break
      cursor = j.cursor
    }
  }
  const salida: Fila[] = []
  for (const f of informes) {
    const t0 = Date.parse(String(f.creado_en))
    const cand = spans.filter((s) => Date.parse(s.created) <= t0 && Date.parse(s.created) >= t0 - 30 * 60_000)
    const casa = cand.map((s) => ({ s, limpio: sinDatosPersonales(s.texto.trim()).texto })).find((x) => unaLinea(x.limpio) === f.contenido)
    const cliente = String(f.client_id)
    if (!casa) { cuenta(cliente, 'informes_sin_original'); salida.push({ ficha: f.id, informe: 'sin original que case exacto: queda como está' }); continue }
    if (!casa.limpio.includes('\n')) { cuenta(cliente, 'informes_sin_saltos_en_el_original'); continue }
    const pt = objeto(f.provenance_tag), d = objeto(pt.datos)
    const formato = { estado: 'recuperado', fuente: `braintrust:${casa.s.id}`, recuperado_en: new Date().toISOString(), por: POR, saltos: (casa.limpio.match(/\n/g) ?? []).length, huella_del_aplanado: huella(String(f.contenido)) }
    const ok = escribir ? await patch(String(f.id), cliente, { contenido: casa.limpio, provenance_tag: { ...pt, datos: { ...d, formato } } }) : true
    cuenta(cliente, ok ? (escribir ? 'informes_recuperados' : 'informes_recuperables') : 'informes_que_no_se_pudieron_escribir')
    salida.push({ ficha: f.id, informe: ok ? (escribir ? 'recuperado' : 'recuperable') : 'NO SE ESCRIBIÓ', span: casa.s.id, saltos: formato.saltos })
    if (!ok) process.exitCode = 1
  }

  // ── RESPUESTAS DEL DUEÑO: se marcan las que pudieron perder sus saltos y no tienen original
  const libros: Record<string, Fila[]> = {}
  const duenos = (await get('cerebro_fichas?select=id,client_id,contenido,creado_en,provenance_tag&clase=eq.dato_del_dueno&limit=2000'))
    .filter((f) => !String(f.contenido ?? '').includes('\n') && Date.parse(String(f.creado_en)) < Date.parse(antesDe) && !objeto(objeto(f.provenance_tag).datos).formato)
  for (const f of duenos) {
    const cliente = String(f.client_id)
    const pt = objeto(f.provenance_tag), d = objeto(pt.datos)
    const m = /^manual:([0-9a-f-]{36}):v(\d+):(.+)$/.exec(String(d.mensaje_ref ?? ''))
    let motivo = `la puerta del dueño guardaba el texto en una línea hasta ${antesDe.slice(0, 10)} y el original (${String(pt.canal ?? 'canal desconocido')}) no se guardó en ninguna parte`
    if (m) {
      libros[m[1]] ??= await get(`client_brand_books?select=version,content_text&client_id=eq.${m[1]}`)
      let borrador: Fila = {}
      try { borrador = objeto(objeto(JSON.parse(String(libros[m[1]].find((b) => Number(b.version) === Number(m[2]))?.content_text ?? '{}'))).brand_book_draft) } catch { /* ilegible */ }
      const texto = [m[3], m[3].replace(/_/g, '-'), String(objeto(d.manual).campo ?? '')].filter(Boolean).map((k) => comoTexto(borrador[k])).find((v) => v !== null) ?? null
      const t = texto === null ? null : recortar(texto, 2000)
      if (t !== null && unaLinea(sinDatosPersonales(t).texto) === d.respuesta && !t.includes('\n')) { cuenta(cliente, 'dueno_sin_saltos_en_el_original'); continue }
      motivo = t === null
        ? `la puerta del dueño guardaba el texto en una línea hasta ${antesDe.slice(0, 10)} y el campo ya no está en la versión ${m[2]} del manual`
        : `la puerta del dueño guardaba el texto en una línea hasta ${antesDe.slice(0, 10)} y la versión ${m[2]} del manual no permite reconstruirlo letra por letra`
    }
    const formato = { estado: 'posiblemente_aplanado', motivo, marcado_en: new Date().toISOString(), por: POR }
    const ok = escribir ? await patch(String(f.id), cliente, { provenance_tag: { ...pt, datos: { ...d, formato } } }) : true
    cuenta(cliente, ok ? 'dueno_marcadas_posiblemente_aplanadas' : 'dueno_que_no_se_pudieron_marcar')
    if (!ok) process.exitCode = 1
  }

  // ── COMENTARIOS: solo se cuentan (la tabla no tiene dónde marcar)
  const comentarios: Fila[] = []
  for (let o = 0; ; o += 1000) { const r = await get(`cerebro_comentarios_competencia?select=client_id,texto&order=id&offset=${o}&limit=1000`); comentarios.push(...r); if (r.length < 1000) break }
  for (const c of comentarios) cuenta(String(c.client_id), String(c.texto ?? '').includes('\n') ? 'comentarios_con_saltos' : 'comentarios_de_una_linea')

  console.log(JSON.stringify({ modo: escribir ? 'ESCRIBE' : 'seco', antes_de: antesDe, por_cliente: informe, informes: salida }, null, 1))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
