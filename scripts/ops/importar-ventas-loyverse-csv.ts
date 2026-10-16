/**
 * Importa el historial de ventas de Náufrago desde los CSV que Emilio exporta del Back Office de Loyverse a `raw/entrada/loyverse/` · UNA vez, idempotente.
 * No usa la API para el historial (el plan solo deja leer 31 días); la usa SOLO para validar los días que se solapan (lectura, US$ 0). Sin modelo.
 *   npx tsx scripts/ops/importar-ventas-loyverse-csv.ts                       → en seco: lee los archivos, valida y muestra qué escribiría
 *   npx tsx scripts/ops/importar-ventas-loyverse-csv.ts --escribir            → escribe las fichas y mueve los CSV a procesados/
 *   opciones: --dir=<carpeta> · --exportado=AAAA-MM-DD (por omisión, la fecha de cada archivo) · --sin-api (no valida contra la API)
 * Solo se leen las columnas de la lista blanca del importador: nombres, teléfonos y correos de clientes nunca se leen ni se guardan.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { archivarFichasDeBrazos } from '../../src/lib/portero-alimenta/brazos/archivo'
import { fichasDeItemsDeRango, importarExportaciones, leerArchivo, type ArchivoLeido } from '../../src/lib/portero-alimenta/brazos/exportacion-loyverse'
import { desfaseDelCliente } from '../../src/lib/portero-alimenta/zona-horaria'
import { fichasDeVentas, leerVentasDeLoyverse, mesLocalDe, resumirVentas, type MetaDelMapaDeItems } from '../../src/lib/portero-alimenta/brazos/propios'

const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const H = { Authorization: 'Bearer ' + g('VERCEL_TOKEN') }
const api = async (p: string) => (await fetch('https://api.vercel.com' + p, { headers: H })).json() as Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const CLIENTE = arg('cliente') ?? ''

async function main() {
  if (!/^[0-9a-f-]{36}$/.test(CLIENTE)) throw new Error('falta --cliente=<uuid>')
  const escribir = process.argv.includes('--escribir')
  const dir = arg('dir') ?? 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/entrada/loyverse'
  const ahora = new Date()
  const nombres = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.csv$/i.test(n) && fs.statSync(path.join(dir, n)).isFile()).sort() : []
  if (!nombres.length) { console.log(JSON.stringify({ modo: escribir ? 'ESCRIBE' : 'seco', dir, archivos: 0, nota: 'no hay archivos .csv en la carpeta: nada que importar' })); return }
  const leidos: ArchivoLeido[] = nombres.map((n) => {
    const p = path.join(dir, n)
    const exportado = arg('exportado') ?? fs.statSync(p).mtime.toISOString().slice(0, 10)
    return leerArchivo({ nombre: n, texto: fs.readFileSync(p, 'utf8'), exportado_en: exportado })
  })
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const c = await db.from('clients').select('id, country, config').eq('id', CLIENTE).limit(1)
  const ficha = (c.data ?? [])[0] as { country?: string; config?: Record<string, any> } | undefined // eslint-disable-line @typescript-eslint/no-explicit-any
  const cfg = ficha?.config ?? {}
  // la hora local es la del CLIENTE (su zona declarada o la de su país), no la de un país fijo
  const dh = desfaseDelCliente(ficha as never, ahora).horas
  const mapa = (cfg.apify?.loyverse_mapa_de_items ?? {}) as Record<string, string>
  const meta = (cfg.apify?.loyverse_mapa_de_items_meta ?? null) as MetaDelMapaDeItems | null
  // meses cerrados que ya están archivados (por cualquier vía): no se reescriben
  const q = await db.from('cerebro_fichas').select('atributo, provenance_tag').eq('client_id', CLIENTE).is('retirada_en', null).like('atributo', 'metrica:loyverse:ingreso:%').limit(300)
  if (q.error) throw new Error(`no pude leer lo ya archivado: ${q.error.message}`)
  const ya = new Set<string>()
  for (const f of (q.data ?? []) as Array<{ atributo: string; provenance_tag?: { datos?: { en_curso?: boolean; tienda?: string | null } } }>) {
    const m = f.atributo.match(/^metrica:loyverse:ingreso:(\d{4}-\d{2})$/)
    if (m && f.provenance_tag?.datos?.en_curso === false) ya.add(m[1])
  }
  // la API, solo para validar los días en común (lectura de los últimos 30 días)
  let diasApi: Array<{ f: string; ingreso: number; tickets: number; reembolsos: number; anuladas: number }> | undefined
  if (!process.argv.includes('--sin-api')) {
    const ps = (await api('/v9/projects?limit=100')).projects
    const O = ps.find((p: { name: string }) => p.name === 'client-sites-template')
    const qs = '?teamId=' + O.accountId
    const lo = (await api(`/v9/projects/${O.id}/env${qs}`)).envs
    const e = lo.find((x: { key: string }) => x.key === 'LOYVERSE_TOKEN')
    const token: string = (await api(`/v1/projects/${O.id}/env/${e.id}${qs}`)).value
    const v = await leerVentasDeLoyverse({ token, ahora, desde: new Date(ahora.getTime() - 30 * 86_400_000), fetch: async (url, init) => { const x = await fetch(url, { headers: init?.headers }); return { ok: x.ok, status: x.status, json: () => x.json() as Promise<unknown> } } })
    if (v.ok) diasApi = resumirVentas(v.recibos, { periodo: 'validacion', desfaseHoras: dh }).por_fecha
    else console.error('validación: ' + v.error.split(token).join('***'))
  }
  const r = importarExportaciones(leidos, { ahora, mesEnCurso: mesLocalDe(ahora, dh), desfaseHoras: dh, diasApi, mesesYaArchivados: ya })
  const exportado = leidos.map((l) => l.exportado_en).sort().slice(-1)[0]
  const fichas = [
    ...r.meses.flatMap((m) => fichasDeVentas({ client_id: CLIENTE, meses: [m], ahora, desfaseHoras: dh, mapaDeItems: mapa, mapaMeta: meta, exportacion: { fecha: leidos.find((l) => m.archivos.includes(l.nombre))?.exportado_en ?? exportado } })),
    ...fichasDeItemsDeRango({ client_id: CLIENTE, rangos: r.items_de_rango, exportado_en: exportado, mapaDeItems: mapa, mapaMeta: meta }),
  ]
  const salida: Record<string, unknown> = {
    modo: escribir ? 'ESCRIBE' : 'seco', dir, archivos: r.archivos, validacion_contra_la_api: r.validacion ? { columna_de_ingreso: r.validacion.columna, motivo: r.validacion.motivo, dias_comparados: r.validacion.dias_comparados, coinciden: r.validacion.coinciden, difieren: r.validacion.difieren.slice(0, 10) } : null,
    meses: r.meses.map((m) => ({ periodo: m.periodo, ingreso: m.resumen.ingreso, tickets: m.sinTickets ? 'no trae' : m.resumen.tickets, reembolsos: m.resumen.reembolsos, items: m.resumen.por_item.length, archivos: m.archivos })),
    items_de_rango: r.items_de_rango.map((x) => `${x.desde}_${x.hasta}`), fichas: fichas.length, declarado: r.declarado,
  }
  if (escribir) {
    const a = await archivarFichasDeBrazos({ db: db as never, fichas, ahora, dry_run: false, workflow_id: `importar-csv-loyverse-${ahora.toISOString().slice(0, 10)}` })
    salida.archivo = { escritas: a.escritas, iguales: a.iguales, retiradas: a.retiradas, errores: a.errores }
    if (!a.errores.length) {
      // los reconocidos se mueven a procesados/ (no se borran); los que no se reconocieron quedan donde están
      fs.mkdirSync(path.join(dir, 'procesados'), { recursive: true })
      const movidos: string[] = []
      for (const l of leidos) if (l.tipo !== 'desconocido') { fs.renameSync(path.join(dir, l.nombre), path.join(dir, 'procesados', l.nombre)); movidos.push(l.nombre) }
      salida.movidos_a_procesados = movidos
    }
  }
  console.log(JSON.stringify(salida, null, 1))
}
main().catch((err) => { console.error(String(err?.message ?? err).slice(0, 300)); process.exit(1) })
