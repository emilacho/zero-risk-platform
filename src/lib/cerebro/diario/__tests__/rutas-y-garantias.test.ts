/** Las rutas del diario (guardas, plan, correr) y las GARANTÍAS del código: sin modelo, sin red, sin variables de entorno, escritura solo en las tablas permitidas, agnóstico. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../../../oficina/__tests__/dbfalsa'
import { rutaCorrer, rutaPlan, validar } from '../rutas'

const C = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-10-10T12:00:00Z')
const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const cliente = (db: DbFalsa, extra: Record<string, unknown> = {}) => db.semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: 'https://www.clinicaejemplo.test', config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } }, ...extra }])
const activo = (db: DbFalsa) => db.semilla('client_brand_books', [{ id: 'b', client_id: C }]).semilla('client_historical_outputs', [{ id: 'p', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }])

describe('las guardas (antes de leer o escribir)', () => {
  it('`dry_run` obligatorio y booleano (400); con false exige workflow_id y workflow_execution_id (403); cliente uuid (400); `correr` exige cliente', () => {
    const e = (x: unknown) => (x as { status: number }).status
    expect(e(validar({}, { clienteObligatorio: false }))).toBe(400)
    expect(e(validar({ dry_run: 'true' }, { clienteObligatorio: false }))).toBe(400)
    expect(e(validar({ dry_run: false }, { clienteObligatorio: false }))).toBe(403)
    expect(e(validar({ dry_run: false, workflow_id: 'w' }, { clienteObligatorio: false }))).toBe(403)
    expect(e(validar({ dry_run: true, client_id: 'x' }, { clienteObligatorio: false }))).toBe(400)
    expect(e(validar({ dry_run: true }, { clienteObligatorio: true }))).toBe(400)
    expect(e(validar([], { clienteObligatorio: false }))).toBe(400)
    expect(validar({ dry_run: false, client_id: C, ...WF }, { clienteObligatorio: true })).toMatchObject({ dry_run: false, client_id: C })
  })
  it('sin `dry_run` la base ni se toca', async () => {
    const db = cliente(new DbFalsa()); const spy: string[] = []
    const desde = db.from.bind(db); db.from = ((t: string) => { spy.push(t); return desde(t) }) as never
    expect((await rutaCorrer(db, { client_id: C })).status).toBe(400)
    expect((await rutaPlan(db, {})).status).toBe(400)
    expect(spy).toEqual([])
  })
})

describe('/plan · solo lectura', () => {
  it('excluye con motivo: de prueba, archivados, de baja, sin manual y sin plan de 90 días; incluye al activo con su plan de ampliación', async () => {
    const db = new DbFalsa()
      .semilla('clients', [
        { id: C, name: 'Clínica Ejemplo', config: {} },
        { id: 'prueba-uno', name: 'X', config: {} },
        { id: '22222222-2222-4222-8222-222222222222', name: 'Archivada', archived_at: '2026-01-01', config: {} },
        { id: '33333333-3333-4333-8333-333333333333', name: 'Sin manual', config: {} },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Sin plan', config: {} },
      ])
      .semilla('client_brand_books', [{ id: 'b1', client_id: C }, { id: 'b4', client_id: '44444444-4444-4444-8444-444444444444' }, { id: 'b2', client_id: '22222222-2222-4222-8222-222222222222' }, { id: 'bp', client_id: 'prueba-uno' }])
      .semilla('client_historical_outputs', [{ id: 'p1', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }, { id: 'p2', client_id: '22222222-2222-4222-8222-222222222222', output_type: 'campaign_plan_90d', provenance_tag: {} }, { id: 'pp', client_id: 'prueba-uno', output_type: 'campaign_plan_90d', provenance_tag: {} }])
    const r = await rutaPlan(db, { dry_run: true }, AHORA)
    const b = r.body as { clientes: Array<{ client_id: string; plan: { hacer: Array<{ fuente: string }> } }>; excluidos: Array<{ client_id: string; motivos: string[] }>; modelos_llamados: number }
    expect(b.modelos_llamados).toBe(0)
    expect(b.clientes.map((c) => c.client_id)).toEqual([C])
    expect(b.clientes[0].plan.hacer.map((a) => a.fuente)).toEqual(['mapas'])
    const motivo = (id: string) => b.excluidos.find((x) => x.client_id === id)!.motivos.join(' | ')
    expect(motivo('prueba-uno')).toMatch(/prueba/); expect(motivo('22222222-2222-4222-8222-222222222222')).toMatch(/archivado/)
    expect(motivo('33333333-3333-4333-8333-333333333333')).toMatch(/sin manual/); expect(motivo('44444444-4444-4444-8444-444444444444')).toMatch(/sin plan/)
    expect(db.tablas['cerebro_vigilancia'] ?? []).toEqual([])
  })
  it('un plan de 90 días de PRUEBA no cuenta como alta realizada', async () => {
    const db = cliente(new DbFalsa()).semilla('client_brand_books', [{ id: 'b', client_id: C }]).semilla('client_historical_outputs', [{ id: 'p', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: { prueba_cc1: true } }])
    expect(((await rutaPlan(db, { dry_run: true }, AHORA)).body as { excluidos: unknown[] }).excluidos).toHaveLength(1)
  })
  it('D-4 en el CÓDIGO de la ruta: lo que la mañana ya gastó cuenta (corridas reales de hoy × su máximo) y recorta el plan', async () => {
    // 18 corridas del sitio de hoy × 0,0536 ≈ 0,96 → solo cabe lo de ≤ 0,04
    const filas = Array.from({ length: 18 }, (_, i) => ({ id: `r${i}`, client_id: C, ensayo: false, apify_function: 'website_content_scraper', params: {}, respuesta: [], created_at: `2026-10-10T0${i % 9}:${String(10 + i).padStart(2, '0')}:00Z` }))
    const db = activo(cliente(new DbFalsa())).semilla('apify_raw', filas)
    const b = (await rutaPlan(db, { dry_run: true, client_id: C }, AHORA)).body as { clientes: Array<{ gastado_hoy_usd: number; plan: { hacer: unknown[]; omitidas: Array<{ por_que: string }> } }> }
    expect(b.clientes[0].gastado_hoy_usd).toBeGreaterThan(0.9)
    expect(b.clientes[0].plan.hacer).toEqual([]); expect(b.clientes[0].plan.omitidas[0].por_que).toMatch(/no cabe/)
  })
  it('una lectura que falla se dice (502), no se lee como «sin clientes»', async () => {
    const db = new DbFalsa(); db.fallar['clients'] = 'boom'
    expect((await rutaPlan(db, { dry_run: true }, AHORA)).status).toBe(502)
  })
})

describe('/correr', () => {
  it('con dry_run no escribe nada; sin dry_run escribe y devuelve 0 llamadas a modelos; un cliente que no existe es 404', async () => {
    const db = activo(cliente(new DbFalsa())).semilla('apify_raw', [{ id: 'w1', client_id: C, ensayo: false, apify_function: 'website_content_scraper', params: {}, respuesta: [{ url: 'https://www.clinicaejemplo.test/', text: 'Linea del sitio numero uno' }], created_at: '2026-10-10T08:00:00Z' }])
    const seco = await rutaCorrer(db, { dry_run: true, client_id: C }, AHORA)
    expect(seco.status).toBe(200); expect(seco.body.modelos_llamados).toBe(0); expect(db.tablas['cerebro_vigilancia'] ?? []).toEqual([])
    const real = await rutaCorrer(db, { dry_run: false, client_id: C, ...WF, gasto_ampliacion_usd: 0.2 }, AHORA)
    expect(real.status).toBe(200); expect(real.body.estado).toBe('hecha'); expect(db.tablas['cerebro_vigilancia']).toHaveLength(1)
    expect((real.body.gasto as { ampliacion_usd: number; manana_usd: number }).ampliacion_usd).toBe(0.2)
    expect((await rutaCorrer(new DbFalsa(), { dry_run: true, client_id: C }, AHORA)).status).toBe(404)
  })
})

// ───────────────────────── garantías del código
const DIR = path.resolve(__dirname, '..')
const RAIZ = path.resolve(__dirname, '../../../../..')
const sinComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const fuentes = (): Array<{ nombre: string; texto: string }> => fs.readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => ({ nombre: f, texto: sinComentarios(fs.readFileSync(path.join(DIR, f), 'utf8')) }))
const rutasApp = (): Array<{ nombre: string; texto: string }> => ['plan', 'correr'].map((n) => ({ nombre: n, texto: fs.readFileSync(path.join(RAIZ, `src/app/api/brain/diario/${n}/route.ts`), 'utf8') }))

describe('garantías', () => {
  it('ningún archivo llama a un modelo, a la red ni a una variable de entorno, ni toca el portero que atiende', () => {
    expect(fuentes().length).toBeGreaterThanOrEqual(10)
    for (const { nombre, texto } of fuentes()) {
      expect(texto, nombre).not.toMatch(/\bfetch\s*\(/)
      expect(texto, nombre).not.toMatch(/process\.env/)
      expect(texto, nombre).not.toMatch(/run-sdk|anthropic|openai|agent-runner|llamarRevisorGpt|api\.apify\.com|child_process/i)
      expect(texto, nombre).not.toMatch(/portero\/(recibir|razonar|entregar|etiquetar|indice)/)
      expect(texto, nombre).not.toMatch(/\.delete\(|\.rpc\(|\bDELETE\s+FROM\b/i)
    }
  })
  it('solo escribe (insert / update) en las tablas permitidas: las 3 del diario y `cerebro_fichas` (solo retirar y marcar)', () => {
    const escritas = new Set<string>()
    for (const { texto } of fuentes()) for (const m of texto.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)\s*\.(insert|update)\(/g)) escritas.add(m[1])
    expect([...escritas].sort()).toEqual(['cerebro_diario_corridas', 'cerebro_fichas', 'cerebro_oportunidades', 'cerebro_vigilancia'])
    // lo que se le escribe a `cerebro_fichas` son solo columnas de limpieza
    const t = fuentes().find((f) => f.nombre === 'correr.ts')!.texto
    const campos = [...t.matchAll(/from\('cerebro_fichas'\)\.update\(\{([^}]*)\}\)/g)].flatMap((m) => m[1].split(',').map((x) => x.split(':')[0].trim()))
    expect([...new Set(campos)].sort()).toEqual(['motivo_retirada', 'propiedad', 'retirada_en'])
  })
  it('no escribe nunca en los trozos del cerebro, ni en `costs`, ni en las tablas de la oficina o del manual', () => {
    for (const { nombre, texto } of fuentes()) expect(texto, nombre).not.toMatch(/from\(\s*['"`](client_brain_chunks|costs|client_brand_books|client_historical_outputs|hitl_queue|oficina_[a-z_]+)['"`]\s*\)\s*\.(insert|update|upsert)/)
  })
  it('las dos rutas comprueban la llave interna, son force-dynamic y no importan nada del modelo', () => {
    for (const { nombre, texto } of rutasApp()) {
      expect(texto, nombre).toMatch(/checkInternalKey/); expect(texto, nombre).toMatch(/export const dynamic = 'force-dynamic'/); expect(texto, nombre).toMatch(/export async function POST/)
      expect(texto, nombre).not.toMatch(/run-sdk|anthropic|openai/i)
    }
  })
  it('agnóstico: ningún archivo (menos las pruebas) nombra un cliente, una ciudad o un rubro', () => {
    const PROHIBIDAS = ['naufrago', 'náufrago', 'olon', 'olón', 'guayaquil', 'ecuador', 'ceviche', 'encebollado', 'marisco', 'restaurante', 'ghost kitchen', 'peniche', 'goeurope', 'seguridad industrial']
    for (const { nombre, texto } of fuentes()) for (const p of PROHIBIDAS) expect(texto.toLowerCase().includes(p), `${nombre} nombra «${p}»`).toBe(false)
  })
  it('el paso 4 NO tiene ruta (D-5): no existe `/api/brain/diario/avisar` y nadie escribe `cerebro_avisos`', () => {
    expect(fs.existsSync(path.join(RAIZ, 'src/app/api/brain/diario/avisar'))).toBe(false)
    for (const { nombre, texto } of fuentes()) expect(texto, nombre).not.toMatch(/cerebro_avisos/)
  })
  it('la migración es aditiva (solo CREATE/ALTER ... ENABLE/GRANT; nada de DROP/ALTER de lo existente) y cada tabla nueva lleva RLS, REVOKE y GRANT en la misma migración', () => {
    const sql = sinComentariosSql(fs.readFileSync(path.join(RAIZ, 'supabase/migrations/202610100900_cerebro_diario.sql'), 'utf8'))
    const sinPermisos = sql.replace(/GRANT [^;]*;/g, '')
    expect(sinPermisos).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\b|ALTER TABLE public\.(client_|cerebro_fichas|cerebro_ingresos)/i)
    const tablas = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map((m) => m[1])
    expect(tablas.sort()).toEqual(['cerebro_avisos', 'cerebro_diario_corridas', 'cerebro_oportunidades', 'cerebro_vigilancia'])
    for (const t of tablas) { expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`)); expect(sql).toContain(t) }
    expect(sql).toMatch(/REVOKE ALL ON [^;]*FROM PUBLIC, anon, authenticated/); expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON [^;]*TO service_role/)
    expect(sql).toMatch(/BEGIN;/); expect(sql).toMatch(/COMMIT;/)
    expect(fs.existsSync(path.join(RAIZ, 'supabase/reversas/202610100900_cerebro_diario_REVERSA.sql'))).toBe(true)
  })
})
function sinComentariosSql(t: string): string { return t.replace(/--.*$/gm, '') }
