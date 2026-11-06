/**
 * Rutas de dirección (01-nov): decisiones · riesgos · corridas. US$ 0, sin red (fetch falso). Lo que el encargo exige: sin escrituras, sin secretos, nada inventado.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { ejecucionBase, ID_DE_EJECUCION, leerCorrida, leerCorridas, ramaDe } from '../src/lib/direccion/corridas'
import { esDePractica, estaCompleto, leer, sinSecretos, type Contexto, type Fuente } from '../src/lib/direccion/comun'
import { leerDecisiones, ordenarPorUrgencia } from '../src/lib/direccion/decisiones'
import { leerRiesgos } from '../src/lib/direccion/riesgos'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const AHORA = new Date('2026-11-01T15:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const P1 = '11111111-1111-4111-8111-111111111111'
const CLIENTES = [{ id: C1, name: 'Uno', industry: 'restaurante', status: 'onboarding' }, { id: C2, name: 'Dos', industry: 'software', status: 'active' }, { id: CP, name: 'zz prueba', industry: 'x', status: 'onboarding' }, { id: CB, name: 'Baja', industry: 'x', status: 'churned' }]
const base = () => new DbFalsa().semilla('clients', CLIENTES)
/** una base que revienta si alguien intenta escribir */
const soloLectura = (db: DbFalsa): DbFalsa => {
  const from = db.from.bind(db)
  db.from = ((t: string) => { const q = from(t) as unknown as Record<string, unknown>; for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { throw new Error(`ESCRITURA en ${t}`) }; return q }) as unknown as typeof db.from
  return db
}
const ctx = (db: DbFalsa, extra: Partial<Contexto> = {}): Contexto => ({ db: soloLectura(db), ahora: () => AHORA, env: {}, ...extra })

describe('Pedir cambios sin versión nueva (01-nov · adenda 5)', () => {
  const NOW = '2026-11-01T14:00:00Z'
  const VIEJO = '2026-10-01T14:00:00Z'
  const pedido = (id: string, estado: string, actualizado_en: string, despertar_detalle: string | null = null, client_id = C1) => ({ id, client_id, estado, despertar_detalle, actualizado_en, despertado: true })
  const plan = (id: string, created_at: string, tag: Record<string, unknown> = {}) => ({ id, client_id: C1, output_type: 'campaign_plan_90d', provenance_tag: tag, created_at })
  const ids = (r: { riesgos: Array<{ id: string }> }) => r.riesgos.map((x) => x.id)
  it('🔴 sin cambios reales: lo dice claro, con su motivo', async () => {
    const r = await leerRiesgos(ctx(base().semilla('plan_cambios', [pedido('c1', 'fallido', NOW, 'sin cambios reales: el redactor devolvió el mismo plan')])))
    const x = r.riesgos.find((y) => y.id === 'cambios-sin-version:c1')
    expect(x?.titulo).toMatch(/mismo texto/)
    expect(x?.detalle).toMatch(/sin cambios reales/)
  })
  it('🔴 otra falla no se presenta como «mismo texto»', async () => {
    const r = await leerRiesgos(ctx(base().semilla('plan_cambios', [pedido('c1', 'fallido', NOW, 'se agotó el tope')])))
    expect(r.riesgos.find((y) => y.id === 'cambios-sin-version:c1')?.titulo).not.toMatch(/mismo texto/)
  })
  it('🔴 si después salió bien, ya no es un riesgo; otro cliente no lo tapa', async () => {
    const r = await leerRiesgos(ctx(base().semilla('plan_cambios', [pedido('c1', 'fallido', '2026-11-01T10:00:00Z', 'x'), pedido('c2', 'aplicado', NOW), pedido('c3', 'fallido', '2026-11-01T09:00:00Z', 'y', C2)])))
    expect(ids(r)).not.toContain('cambios-sin-version:c1')
    expect(ids(r)).toContain('cambios-sin-version:c3')
  })
  it('🔴 un pedido que salió bien no es un riesgo', async () => {
    const r = await leerRiesgos(ctx(base().semilla('plan_cambios', [pedido('c1', 'aplicado', NOW, 'HTTP 200')])))
    expect(ids(r).filter((x) => x.startsWith('cambios-sin-version'))).toEqual([])
  })
  it('🔴 el detalle pasa por el limpiador de secretos', async () => {
    const llave = 'sk-ant-api03-' + 'x'.repeat(40)
    const r = await leerRiesgos(ctx(base().semilla('plan_cambios', [pedido('c1', 'fallido', NOW, `se cayó con la llave ${llave}`)])))
    const x = r.riesgos.find((y) => y.id === 'cambios-sin-version:c1')
    expect(x?.detalle).not.toContain(llave)
    expect(x?.detalle).toContain('[oculto]')
  })
  it('🔴 la marca de comparación exige exactamente true', async () => {
    for (const marca of ['true', 'false', 1, false]) {
      const r = await leerRiesgos(ctx(base().semilla('client_historical_outputs', [plan('p1', NOW, { comparacion_fallo: marca })])))
      expect(ids(r), String(marca)).not.toContain('plan-sin-comparar:p1')
    }
  })
  it('🔴 otro tipo de documento con la marca no cuenta', async () => {
    const r = await leerRiesgos(ctx(base().semilla('client_historical_outputs', [{ ...plan('p1', NOW, { comparacion_fallo: true }), output_type: 'otro_documento' }])))
    expect(ids(r)).not.toContain('plan-sin-comparar:p1')
  })
  it('🔴 una falla de hace más de una semana no aparece', async () => {
    const r = await leerRiesgos(ctx(base().semilla('plan_cambios', [pedido('c1', 'fallido', VIEJO, 'x')])))
    expect(ids(r)).not.toContain('cambios-sin-version:c1')
  })
  it('🔴 un plan que no se pudo comparar se dice, solo si es lo más nuevo del cliente', async () => {
    const con = await leerRiesgos(ctx(base().semilla('client_historical_outputs', [plan('p1', NOW, { comparacion_fallo: true })])))
    expect(ids(con)).toContain('plan-sin-comparar:p1')
    const tapado = await leerRiesgos(ctx(base().semilla('client_historical_outputs', [plan('p1', '2026-11-01T10:00:00Z', { comparacion_fallo: true }), plan('p2', NOW)])))
    expect(ids(tapado)).not.toContain('plan-sin-comparar:p1')
    const normal = await leerRiesgos(ctx(base().semilla('client_historical_outputs', [plan('p1', NOW, {})])))
    expect(ids(normal)).not.toContain('plan-sin-comparar:p1')
  })
})

describe('decisiones', () => {
  it('unifica todas las fuentes y ordena: lo que vence primero arriba, después lo más viejo', async () => {
    const db = base()
      .semilla('hitl_queue', [
        { id: 'h1', status: 'pending', type: 'content_piece_review', client_id: C1, title: 'Pieza', created_at: '2026-10-28T00:00:00Z', expires_at: '2026-11-03T00:00:00Z', priority: 'high' },
        { id: 'h2', status: 'pending', type: 'concepto_review', client_id: C2, title: 'Gran idea', created_at: '2026-10-29T00:00:00Z', expires_at: '2026-11-02T00:00:00Z' },
        { id: 'h3', status: 'pending', type: 'tipo_nuevo', client_id: C1, title: 'Algo nuevo', created_at: '2026-10-20T00:00:00Z' },
        { id: 'h4', status: 'approved', type: 'content_piece_review', client_id: C1, title: 'Ya resuelta', created_at: '2026-10-20T00:00:00Z' },
      ])
      .semilla('dueno_preguntas', [{ id: 'p1', client_id: C1, tema: 'tema', pregunta: '¿Cuántas sedes?', estado: 'pendiente', creado_en: '2026-10-25T00:00:00Z' }, { id: 'p2', client_id: C1, tema: 't', pregunta: 'x', estado: 'respondida', creado_en: '2026-10-01T00:00:00Z' }])
      .semilla('finanzas_preguntas', [{ id: 'f1', client_id: C2, clave: 'margen', texto: '¿Tu margen?', estado: 'enviada', creado_en: '2026-10-26T00:00:00Z' }, { id: 'f2', client_id: C2, clave: 'b', texto: 'sin mandar', estado: 'borrador', creado_en: '2026-10-01T00:00:00Z' }])
      .semilla('finanzas_tableros', [{ id: 't1', client_id: C2, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: '2026-10-27T00:00:00Z' }, { id: 't2', client_id: C2, version: 1, estado: 'sin_firma', vigente: true, dry_run: true, creado_en: '2026-10-01T00:00:00Z' }, { id: 't3', client_id: C2, version: 1, estado: 'sin_firma', vigente: false, dry_run: false, creado_en: '2026-10-01T00:00:00Z' }])
      .semilla('plan_aprobaciones', [{ id: 'a1', client_id: C1, plan_id: P1, version: 3, estado: 'pendiente', creado_en: '2026-10-30T00:00:00Z' }, { id: 'a2', client_id: C1, plan_id: 'otro', estado: 'aprobado', creado_en: '2026-10-01T00:00:00Z' }])
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.map((d) => d.id)).toEqual(['h2', 'h1', 'h3', 'p1', 'f1', 't1', P1])
    expect(r.decisiones.map((d) => d.tipo)).toEqual(['gran_idea', 'pieza', 'revision', 'pregunta_al_dueno', 'pregunta_de_finanzas', 'firma_de_finanzas', 'plan'])
    expect(r.total).toBe(7); expect(r.completo).toBe(true)
    const plan = r.decisiones[6]
    expect(plan).toMatchObject({ cliente: 'Uno', vence: null, vencida: false, decidir: { ruta: '/nuevo', accion: 'plan-aprobar' }, costo_usd: null })
    expect(plan.titulo_interno).toContain('versión 3'); expect(plan.titulo).not.toContain('versión 3'); expect(plan.costo_nota).toContain('US$ 8')
    expect(r.decisiones[0]).toMatchObject({ cliente: 'Dos', desde: '2026-10-29T00:00:00Z', vence: '2026-11-02T00:00:00Z', vencida: false })
    expect(r.decisiones[1].prioridad).toBe('high')
    expect(r.sin_fuente.map((s) => s.que)).toContain('gastos por aprobar')
  })
  it('lo vencido se marca y va primero', async () => {
    const r = await leerDecisiones(ctx(base().semilla('hitl_queue', [{ id: 'a', status: 'pending', type: 'x', client_id: C1, expires_at: '2026-12-01T00:00:00Z' }, { id: 'b', status: 'pending', type: 'x', client_id: C1, expires_at: '2026-10-31T00:00:00Z' }])))
    expect(r.decisiones.map((d) => [d.id, d.vencida])).toEqual([['b', true], ['a', false]])
  })
  it('un plan con compuerta y con nota en la bandeja se pide UNA vez; sin compuerta, la nota de la bandeja es la decisión', async () => {
    const nota = { id: 'n1', status: 'pending', type: 'plan_con_pendientes', client_id: C1, output_id: P1, title: 'Plan con pendientes', created_at: '2026-10-30T00:00:00Z' }
    const con = await leerDecisiones(ctx(base().semilla('hitl_queue', [nota]).semilla('plan_aprobaciones', [{ id: 'a1', client_id: C1, plan_id: P1, version: 1, estado: 'pendiente' }])))
    expect(con.decisiones.map((d) => d.id)).toEqual([P1])
    const sin = await leerDecisiones(ctx(base().semilla('hitl_queue', [nota])))
    expect(sin.decisiones).toHaveLength(1); expect(sin.decisiones[0]).toMatchObject({ id: 'n1', tipo: 'plan', subtipo: 'plan_con_pendientes' })
  })
  it('🔴 solo lo vigente pide firma: la lista esconde lo reemplazado aunque el reloj no haya pasado, y lo DICE (01-nov · firma de Emilio)', async () => {
    const planes = [{ id: 'viejo', client_id: C1, output_type: 'campaign_plan_90d', status: 'draft', provenance_tag: {}, created_at: '2026-10-30T00:00:00Z' }, { id: 'nuevo', client_id: C1, output_type: 'campaign_plan_90d', status: 'draft', provenance_tag: { vigente: true }, created_at: '2026-11-01T00:00:00Z' }]
    const bandeja = [
      { id: 'h-viejo', status: 'pending', type: 'plan_con_pendientes', client_id: C1, output_id: 'viejo', title: 'Plan viejo', created_at: '2026-10-30T01:00:00Z' },
      { id: 'h-kit', status: 'pending', type: 'content_piece_review', client_id: C1, title: 'Kit viejo', created_at: '2026-10-31T00:00:00Z' },
      { id: 'h-vivo', status: 'pending', type: 'plan_con_pendientes', client_id: C1, output_id: 'nuevo', title: 'Plan vigente', created_at: '2026-11-01T01:00:00Z' },
    ]
    const r = await leerDecisiones(ctx(base().semilla('client_historical_outputs', planes).semilla('hitl_queue', bandeja)))
    expect(r.decisiones.map((d) => d.id)).toEqual(['h-vivo'])
    expect(r.omitidas.reemplazadas).toBe(2)
  })
  it('🔴 si los planes no se pueden leer, la lista muestra todo: ante la duda, la decisión sigue a la vista', async () => {
    const db = base().semilla('hitl_queue', [{ id: 'h-viejo', status: 'pending', type: 'plan_con_pendientes', client_id: C1, output_id: 'viejo', title: 'Plan viejo', created_at: '2026-10-30T01:00:00Z' }])
    const de = db.from.bind(db)
    db.from = ((t: string) => { if (t === 'client_historical_outputs') throw new Error('caída'); return de(t) }) as never
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.map((d) => d.id)).toEqual(['h-viejo'])
    expect(r.omitidas.reemplazadas).toBe(0)
  })
  it('omite clientes de práctica y de baja y los ensayos, y lo DICE', async () => {
    const r = await leerDecisiones(ctx(base().semilla('hitl_queue', [{ id: '1', status: 'pending', type: 'x', client_id: CP }, { id: '2', status: 'pending', type: 'x', client_id: CB }, { id: '3', status: 'pending', type: 'x', client_id: C1, payload: { dry_run: true } }, { id: '4', status: 'pending', type: 'x', client_id: C1, metadata: { dry_run: true } }, { id: '5', status: 'pending', type: 'x', client_id: C1 }])))
    expect(r.decisiones.map((d) => d.id)).toEqual(['5'])
    expect(r.omitidas).toEqual({ clientes_de_practica: 1, clientes_de_baja: 1, ensayos: 2, reemplazadas: 0, esperan_el_manual: 0, planes_ya_superados: 0 })
  })
  it('🔴 una fuente que falla NO se lee como «no hay nada»: completo=false y su motivo; una tabla que todavía no existe no rompe', async () => {
    const db = base(); db.fallar['hitl_queue'] = 'se cayó'
    const r = await leerDecisiones(ctx(db))
    expect(r.completo).toBe(false)
    expect(r.fuentes.find((f) => f.fuente === 'hitl_queue')).toMatchObject({ estado: 'error', detalle: 'se cayó' })
    const fuentes: Fuente[] = []
    expect(await leer(fuentes, 'plan_aprobaciones', Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'Could not find' } }))).toEqual([])
    expect(fuentes[0]).toEqual({ fuente: 'plan_aprobaciones', estado: 'no_existe', filas: 0 })
    expect(estaCompleto(fuentes)).toBe(true)
  })
  it('llegar al tope se declara truncado y deja de estar completo', async () => {
    const f: Fuente[] = []
    await leer(f, 't', Promise.resolve({ data: [{}, {}], error: null }), 2)
    expect(f[0].truncado).toBe(true); expect(estaCompleto(f)).toBe(false)
  })
  it('ordenarPorUrgencia y la regla de práctica', () => {
    expect(ordenarPorUrgencia({ vence: null, desde: 'a' }, { vence: 'z', desde: 'z' })).toBe(1)
    expect(ordenarPorUrgencia({ vence: 'b', desde: 'a' }, { vence: 'a', desde: 'z' })).toBe(1)
    expect(ordenarPorUrgencia({ vence: null, desde: 'a' }, { vence: null, desde: 'b' })).toBe(-1)
    expect(esDePractica({ rubro: 'Prueba', nombre: 'x' })).toBe(true); expect(esDePractica({ nombre: 'ZZ algo' })).toBe(true); expect(esDePractica({ nombre: 'Práctica 3' })).toBe(true)
    expect(esDePractica({ rubro: 'restaurante', nombre: 'Pruebas Andinas SA' })).toBe(false)
  })
})

describe('sinSecretos', () => {
  it.each([
    ['fallo con sk-ant-api03-ABCDEFGHIJKLMN', 'ABCDEFGHIJKLMN'],
    ['Authorization: Bearer abcdefghijklmnop', 'abcdefghijklmnop'],
    ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firmafirma', 'eyJhbGciOiJIUzI1NiJ9'],
    ['{"api_key":"valor-secreto-1"}', 'valor-secreto-1'],
    ['url?token=valor-secreto-2&x=1', 'valor-secreto-2'],
    ['signature=abc123def', 'abc123def'],
    ['postgres://user:clave123@host/db', 'clave123'],
  ])('%s → sin el valor', (entrada, valor) => { expect(sinSecretos(entrada)).not.toContain(valor) })
  it('corta el largo, deja pasar lo normal y lo vacío es null', () => {
    expect(sinSecretos('x'.repeat(600))).toHaveLength(501); expect(sinSecretos('el redactor tardó 800 s')).toBe('el redactor tardó 800 s'); expect(sinSecretos('  ')).toBeNull(); expect(sinSecretos(null)).toBeNull()
  })
})

describe('riesgos', () => {
  const externos = (usado: number) => vi.fn(async (u: string | URL | Request) => {
    const url = String(u)
    if (url.includes('/executions')) return new Response(JSON.stringify({ data: [{ id: 1, workflowId: 'wfA', startedAt: '2026-11-01T14:00:00Z' }, { id: 2, workflowId: 'wfA', startedAt: '2026-11-01T14:30:00Z' }, { id: 3, workflowId: 'wfV', startedAt: '2026-10-20T14:00:00Z' }] }), { status: 200 })
    if (url.endsWith('/users/me')) return new Response(JSON.stringify({ data: { plan: { id: 'STARTER', monthlyUsageCreditsUsd: 100 } } }), { status: 200 })
    return new Response(JSON.stringify({ data: { current: { monthlyUsageUsd: usado }, monthlyUsageCycle: { startAt: '2026-10-20T00:00:00Z', endAt: '2026-11-20T00:00:00Z' } } }), { status: 200 })
  })
  const ENV = { N8N_BASE_URL: 'https://n8n.test/', N8N_API_KEY: 'llave-n8n', APIFY_API_TOKEN: 'llave-apify' }
  it('junta incidentes, fallas, pausas e interruptores con su gravedad; lo más grave arriba', async () => {
    const db = base()
      .semilla('cerebro_alertas', [{ clave: `pausa:${C1}`, titulo: '🟠 Pausado', ultimo_detalle: 'detalle', abierto_en: '2026-10-30T00:00:00Z' }, { clave: 'x', titulo: '🔴 Grave', abierto_en: '2026-10-31T00:00:00Z' }, { clave: 'y', titulo: '🟡 Leve', abierto_en: '2026-10-31T00:00:00Z' }, { clave: 'z', titulo: 'cerrada', abierto_en: '2026-10-31T00:00:00Z', cerrado_en: '2026-10-31T01:00:00Z' }])
      .semilla('agent_dispatch_reconciliations', [{ dispatch_key: 'dispatch:w:a:1', agente: 'a', cliente: C2, clasificacion: 'termino_y_no_entrego', severidad: 'alta', que: 'terminó y no entregó', primera_vez: '2026-10-29T00:00:00Z' }, { dispatch_key: 'r', clasificacion: 'c', severidad: 'info', resuelta_el: '2026-10-29T00:00:00Z' }])
      .semilla('agent_dispatches', [
        { dispatch_key: 'dispatch:w:a:1', agent_name: 'a', status: 'running', created_at: '2026-10-01T00:00:00Z' },
        { dispatch_key: 'viejo', agent_name: 'v', status: 'running', created_at: '2026-10-01T00:00:00Z', client_id: C1 },
        { dispatch_key: 'reciente', agent_name: 'r', status: 'running', created_at: '2026-11-01T14:50:00Z' },
        { dispatch_key: 'err', agent_name: 'e', status: 'error', created_at: '2026-10-30T00:00:00Z' },
        { dispatch_key: 'errviejo', agent_name: 'e', status: 'error', created_at: '2026-09-01T00:00:00Z' },
        { dispatch_key: 'ok', agent_name: 'o', status: 'completed', created_at: '2026-10-30T00:00:00Z' },
      ])
      .semilla('cerebro_portero_pausas', [{ id: 'pp', client_id: C1, motivo: 'ficha repetida', desde: '2026-10-29T00:00:00Z' }, { id: 'pl', client_id: C1, motivo: 'levantada', levantada_en: '2026-10-30T00:00:00Z' }])
      .semilla('cadena_campanas', [{ id: 'k1', client_id: C1, estado: 'pausada', estado_motivo: 'm', actualizada_en: '2026-10-28T00:00:00Z' }, { id: 'k2', client_id: C2, estado: 'necesita_humano', actualizada_en: '2026-10-28T00:00:00Z' }, { id: 'k3', client_id: C2, estado: 'pausada', seco: true }, { id: 'k4', client_id: C2, estado: 'activa' }])
      .semilla('oficina_config', [{ id: 1, estado: 'apagada' }]).semilla('finanzas_config', [{ id: 1, estado: 'encendida' }]).semilla('jefatura_config', [{ id: 1, estado: 'encendida' }]).semilla('cadena_config', [{ clave: 'estado_cadena', valor: 'apagada' }])
      .semilla('uptime_incidents', [{ id: 'u1', monitor_name: 'Web', created_at: '2026-10-31T00:00:00Z' }, { id: 'u2', monitor_name: 'Vieja', created_at: '2026-10-01T00:00:00Z' }])
      .semilla('error_events', [{ id: 'e1', severity: 'P0', title: 'Se rompió', source: 'sentry', created_at: '2026-10-31T00:00:00Z' }, { id: 'e2', severity: 'P2', title: 'Menor', source: 'probe', created_at: '2026-10-31T00:00:00Z' }])
      .semilla('agent_invocations', [{ id: 'i1', agent_name: 'x', status: 'failed', error_message: 'clave sk-ant-api03-ABCDEFGHIJKLMN mal', started_at: '2026-10-31T00:00:00Z', client_id: C1 }, { id: 'i2', agent_name: 'x', status: 'completed', started_at: '2026-10-31T00:00:00Z' }])
    const r = await leerRiesgos(ctx(db))
    const g = (id: string) => r.riesgos.find((x) => x.id === id)
    expect(g(`alerta:pausa:${C1}:2026-10-30T00:00:00Z`)).toMatchObject({ gravedad: 2, categoria: 'incidente', client_id: C1, cliente: 'Uno' })
    expect(g('alerta:x:2026-10-31T00:00:00Z')?.gravedad).toBe(3); expect(g('alerta:y:2026-10-31T00:00:00Z')?.gravedad).toBe(1)
    expect(r.riesgos.filter((x) => x.titulo === 'cerrada')).toHaveLength(0)
    expect(g('reconciliacion:dispatch:w:a:1')).toMatchObject({ gravedad: 3, cliente: 'Dos', titulo: 'terminó y no entregó' })
    expect(g('reconciliacion:r')).toBeUndefined()
    expect(g('despacho:dispatch:w:a:1')).toBeUndefined() // ya contado por su reconciliación
    expect(g('despacho:viejo')?.titulo).toContain('atascado'); expect(g('despacho:reciente')).toBeUndefined()
    expect(g('despacho:err')?.titulo).toContain('error'); expect(g('despacho:errviejo')).toBeUndefined(); expect(g('despacho:ok')).toBeUndefined()
    expect(g('pausa:pp')).toMatchObject({ gravedad: 2, detalle: 'ficha repetida' }); expect(g('pausa:pl')).toBeUndefined()
    expect(g('campana:k1')?.gravedad).toBe(1); expect(g('campana:k2')?.gravedad).toBe(2); expect(g('campana:k3')).toBeUndefined(); expect(g('campana:k4')).toBeUndefined()
    expect(g('interruptor:creativa')?.titulo).toContain('apagada'); expect(g('interruptor:financiera')).toBeUndefined(); expect(g('interruptor:planeacion')?.titulo).toContain('apagada')
    expect(g('caida:u1')?.detalle).toContain('no se sabe si sigue'); expect(g('caida:u2')).toBeUndefined()
    expect(g('error:e1')?.gravedad).toBe(3); expect(g('error:e2')?.gravedad).toBe(2)
    expect(g('invocacion:i1')?.detalle).toContain('[oculto]'); expect(JSON.stringify(r)).not.toContain('ABCDEFGHIJKLMN'); expect(g('invocacion:i2')).toBeUndefined()
    const gr = r.riesgos.map((x) => x.gravedad)
    expect(gr).toEqual([...gr].sort((a, b) => b - a))
    expect(r.por_gravedad[3]).toBe(gr.filter((x) => x === 3).length)
    expect(r.sin_fuente.map((s) => s.que)).toContain('credenciales por vencer')
  })
  it('n8n y Apify: fallas de 24 h agrupadas por flujo; sin credencial se declara, no se inventa; el saldo se muestra aunque no sea riesgo', async () => {
    const r = await leerRiesgos(ctx(base(), { env: ENV, fetchImpl: externos(10) as unknown as typeof fetch }))
    expect(r.riesgos.find((x) => x.id === 'n8n:wfA')).toMatchObject({ gravedad: 2, categoria: 'falla', desde: '2026-11-01T14:30:00Z' })
    expect(r.riesgos.find((x) => x.id === 'n8n:wfA')?.titulo).toContain('2 ejecuciones')
    expect(r.riesgos.find((x) => x.id === 'n8n:wfV')).toBeUndefined()
    expect(r.saldos).toEqual([{ proveedor: 'Apify', plan: 'STARTER', usado_usd: 10, credito_usd: 100, pct: 10, ciclo_hasta: '2026-11-20T00:00:00Z' }])
    expect(r.riesgos.find((x) => x.id === 'saldo:apify')).toBeUndefined()
    const sin = await leerRiesgos(ctx(base()))
    expect(sin.saldos).toEqual([]); expect(sin.completo).toBe(false)
    expect(sin.fuentes.filter((f) => f.estado === 'sin_credencial').map((f) => f.fuente).sort()).toEqual(['apify', 'n8n'])
  })
  it.each([[74, null], [75, 2], [90, 2], [91, 3]])('Apify al %s %% → gravedad %s', async (usado, gravedad) => {
    const r = await leerRiesgos(ctx(base(), { env: ENV, fetchImpl: externos(usado) as unknown as typeof fetch }))
    expect(r.riesgos.find((x) => x.id === 'saldo:apify')?.gravedad ?? null).toBe(gravedad)
  })
  it('una llave rechazada ES un riesgo de credencial, gravedad 3; y ningún secreto sale en la respuesta', async () => {
    const f = vi.fn(async () => new Response('', { status: 401 }))
    const r = await leerRiesgos(ctx(base(), { env: ENV, fetchImpl: f as unknown as typeof fetch }))
    expect(r.riesgos.find((x) => x.id === 'credencial:n8n')).toMatchObject({ gravedad: 3, categoria: 'credencial' })
    expect(r.riesgos.find((x) => x.id === 'credencial:apify')).toMatchObject({ gravedad: 3, categoria: 'credencial' })
    const t = JSON.stringify(r); expect(t).not.toContain('llave-n8n'); expect(t).not.toContain('llave-apify')
    const caido = await leerRiesgos(ctx(base(), { env: ENV, fetchImpl: vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch }))
    expect(caido.riesgos.find((x) => x.id === 'credencial:n8n')).toBeUndefined()
    expect(caido.fuentes.find((x) => x.fuente === 'n8n')).toMatchObject({ estado: 'error', detalle: 'n8n respondió HTTP 503' })
  })
  it('topes por cliente con el criterio del freno: aviso al 80 %, grave al 100 %; prácticas y bajas no cuentan', async () => {
    const cfg = { config: { spend_cap_usd: 10 } }
    const db = new DbFalsa().semilla('clients', [{ ...CLIENTES[0], ...cfg }, { ...CLIENTES[1], ...cfg }, { ...CLIENTES[2], ...cfg }])
      .semilla('agent_invocations', [{ id: '1', client_id: C1, cost_usd: 8, status: 'completed', started_at: '2026-11-01T10:00:00Z' }, { id: '2', client_id: C2, cost_usd: 10, status: 'completed', started_at: '2026-11-01T10:00:00Z' }, { id: '3', client_id: C2, cost_usd: 99, status: 'completed', started_at: '2026-10-20T10:00:00Z' }, { id: '4', client_id: CP, cost_usd: 99, status: 'completed', started_at: '2026-11-01T10:00:00Z' }])
    const r = await leerRiesgos(ctx(db))
    expect(r.topes.map((t) => [t.cliente, t.gastado_24h_usd, t.techo_usd, t.pct])).toEqual([['Uno', 8, 10, 80], ['Dos', 10, 10, 100]])
    expect(r.riesgos.find((x) => x.id === `tope:${C1}`)?.gravedad).toBe(2)
    expect(r.riesgos.find((x) => x.id === `tope:${C2}`)?.gravedad).toBe(3)
    expect(r.riesgos.find((x) => x.id === `tope:${CP}`)).toBeUndefined()
  })
  it('vigilante de costos: rebasado, cerca, con error y ciego', async () => {
    const m = (x: Record<string, unknown>) => base().semilla('cost_monitor_runs', [{ ran_at: '2026-11-01T14:30:00Z', aggregate_24h_usd: 1, threshold_daily_aggregate_usd: 100, is_breach: false, ...x }])
    const id = async (x: Record<string, unknown>) => (await leerRiesgos(ctx(m(x)))).riesgos.filter((r) => /tope:agregado|vigilante/.test(r.id)).map((r) => `${r.id}:${r.gravedad}`)
    expect(await id({})).toEqual([])
    expect(await id({ aggregate_24h_usd: 80 })).toEqual(['tope:agregado:2'])
    expect(await id({ is_breach: true })).toEqual(['tope:agregado:3'])
    expect(await id({ error_message: 'falló' })).toEqual(['vigilante:error:2'])
    expect(await id({ ran_at: '2026-11-01T10:00:00Z' })).toEqual(['vigilante:ciego:2'])
  })
  it('ciclo del plan: pedido sin despertar o atascado, y plan aprobado cuya fase no arrancó', async () => {
    const db = base().semilla('plan_cambios', [{ id: 'c1', client_id: C1, estado: 'pendiente', despertado: false, despertar_detalle: 'HTTP 503', actualizado_en: '2026-11-01T14:59:00Z' }, { id: 'c2', client_id: C1, estado: 'en_reescritura', despertado: true, actualizado_en: '2026-11-01T13:00:00Z' }, { id: 'c3', client_id: C1, estado: 'en_reescritura', despertado: true, actualizado_en: '2026-11-01T14:50:00Z' }])
      .semilla('plan_aprobaciones', [{ id: 'a1', client_id: C1, estado: 'aprobado', despertado: false, actualizado_en: '2026-11-01T14:00:00Z' }, { id: 'a2', client_id: C1, estado: 'aprobado', despertado: true }])
    const r = await leerRiesgos(ctx(db))
    const ids = r.riesgos.map((x) => x.id)
    expect(ids).toContain('cambios:c1'); expect(ids).toContain('cambios:c2'); expect(ids).not.toContain('cambios:c3')
    expect(r.riesgos.find((x) => x.id === 'compuerta:a1')?.gravedad).toBe(3); expect(ids).not.toContain('compuerta:a2')
  })
  it('omite prácticas y bajas y lo dice', async () => {
    const r = await leerRiesgos(ctx(base().semilla('cerebro_portero_pausas', [{ id: '1', client_id: CP, motivo: 'm' }, { id: '2', client_id: CB, motivo: 'm' }])))
    expect(r.riesgos).toEqual([]); expect(r.omitidos).toEqual({ clientes_de_practica: 1, clientes_de_baja: 1 })
  })
})

describe('corridas', () => {
  const inv = (x: Record<string, unknown>) => ({ id: 'i', agent_name: 'a', model: 'm', workflow_id: 'wf', workflow_execution_id: '100', client_id: C1, started_at: '2026-11-01T10:00:00Z', ended_at: '2026-11-01T10:01:00Z', duration_ms: 60000, cost_usd: 1, tokens_input: 10, tokens_output: 20, tokens_cache_read: 30, tokens_cache_creation: 40, num_turns: 2, status: 'completed', error_message: null, system_prompt: 'PROMPT-SECRETO', input_summary: 'ENTRADA-SECRETA', output_summary: 'SALIDA-SECRETA', metadata: { algo: 'META-SECRETA' }, ...x })
  const des = (x: Record<string, unknown>) => ({ dispatch_key: 'dispatch:wf:a:100', workflow_id: 'wf', workflow_execution_id: '100', agent_name: 'a', client_id: C1, status: 'completed', created_at: '2026-11-01T09:59:00Z', completed_at: '2026-11-01T10:01:00Z', metadata: {}, ...x })
  it('🔴 el mantenimiento y lo del dueño no se agrupan: cada identificador es su corrida; las ramas de n8n siguen juntas', () => {
    const a = 'vercel-cron:etiquetar-pendientes:2026-11-01T14:52', b = 'vercel-cron:etiquetar-pendientes:2026-11-01T14:56', d = 'dueno:aprendizaje:abc-1'
    for (const x of [a, b, d]) { expect(ejecucionBase(x)).toBe(x); expect(ramaDe(x)).toBeNull(); expect(ID_DE_EJECUCION.test(x)).toBe(true) }
    expect(ejecucionBase('205994:ajuste')).toBe('205994')
    expect(ramaDe('205994:ajuste')).toBe('ajuste')
    expect(ID_DE_EJECUCION.test('a b')).toBe(false)
  })
  it('🔴 la lista separa las corridas de mantenimiento y dice todos los clientes de cada una', async () => {
    const fila = (id: string, workflow_execution_id: string, client_id: string | null) => ({ id, workflow_id: 'wf', workflow_execution_id, client_id, agent_name: 'x', status: 'ok', cost_usd: 0, started_at: '2026-11-01T14:00:00Z', ended_at: '2026-11-01T14:01:00Z' })
    const a = 'vercel-cron:etiquetar-pendientes:2026-11-01T14:52', b = 'vercel-cron:etiquetar-pendientes:2026-11-01T14:56'
    const r = await leerCorridas(ctx(base().semilla('agent_invocations', [fila('1', a, C1), fila('2', a, C2), fila('3', b, C1), fila('4', a, null)])))
    const porId = new Map(r.corridas.map((c) => [c.workflow_execution_id, c]))
    expect([...porId.keys()].sort()).toEqual([a, b])
    expect(porId.get(a)).toMatchObject({ pasos: 3 })
    expect([...porId.get(a)!.clientes].sort()).toEqual([C1, C2].sort())
    expect([...porId.get(a)!.clientes_nombres].sort()).toEqual(['Dos', 'Uno'])
    expect(porId.get(b)).toMatchObject({ clientes: [C1], pasos: 1 })
  })
  it('🔴 los identificadores largos tienen tope, también con esos prefijos', () => {
    expect(ID_DE_EJECUCION.test('vercel-cron:a:b:c:d:e')).toBe(true)
    expect(ID_DE_EJECUCION.test('vercel-cron:a:b:c:d:e:f')).toBe(false)
  })
  it('🔴 un cliente repetido sale una sola vez, y client_id sigue siendo el primero para quien ya lo lee', async () => {
    const fila = (id: string, client_id: string, started_at: string) => ({ id, workflow_id: 'wf', workflow_execution_id: 'vercel-cron:x:1', client_id, agent_name: 'x', status: 'ok', cost_usd: 0, started_at, ended_at: started_at })
    const r = await leerCorridas(ctx(base().semilla('agent_invocations', [fila('1', C2, '2026-11-01T14:03:00Z'), fila('2', C2, '2026-11-01T14:02:00Z'), fila('3', C1, '2026-11-01T14:01:00Z')])))
    expect(r.corridas[0].clientes).toEqual([C2, C1])
    expect(r.corridas[0].client_id).toBe(C2)
    expect(r.corridas[0].cliente).toBe('Dos')
  })
  it('🔴 el detalle de una corrida de mantenimiento trae solo la suya', async () => {
    const fila = (id: string, workflow_execution_id: string) => ({ id, workflow_id: 'wf', workflow_execution_id, client_id: C1, agent_name: 'x', status: 'ok', cost_usd: 0, started_at: '2026-11-01T14:00:00Z', ended_at: '2026-11-01T14:01:00Z' })
    const a = 'vercel-cron:etiquetar-pendientes:2026-11-01T14:52', b = 'vercel-cron:etiquetar-pendientes:2026-11-01T14:56'
    const r = await leerCorrida(ctx(base().semilla('agent_invocations', [fila('1', a), fila('2', b)])), a)
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.cuerpo)).toContain('"1"')
    expect(JSON.stringify(r.cuerpo)).not.toContain('14:56')
  })
  it('ejecucionBase y ramaDe', () => { expect(ejecucionBase('1:analisis-voz')).toBe('1'); expect(ramaDe('1:analisis-voz')).toBe('analisis-voz'); expect(ramaDe('1')).toBeNull() })
  it('lista: las ramas son la MISMA corrida; suma costo y tokens; el flujo no se toma de un id de despacho; lo fuera de la ventana no entra', async () => {
    const db = base().semilla('agent_invocations', [
      inv({ id: '1', workflow_id: '11111111-1111-4111-8111-111111111111' }),
      inv({ id: '2', workflow_execution_id: '100:analisis-voz', cost_usd: 0.5, started_at: '2026-11-01T09:00:00Z', ended_at: '2026-11-01T11:00:00Z' }),
      inv({ id: '3', workflow_execution_id: '200', workflow_id: 'wf2', client_id: C2, started_at: '2026-11-01T12:00:00Z' }),
      inv({ id: '4', workflow_execution_id: '300', started_at: '2026-09-01T12:00:00Z' }),
      inv({ id: '5', workflow_execution_id: null, started_at: '2026-11-01T12:00:00Z' }),
    ])
    const r = await leerCorridas(ctx(db))
    expect(r.corridas.map((c) => c.workflow_execution_id)).toEqual(['200', '100'])
    expect(r.corridas[1]).toMatchObject({ workflow_id: 'wf', cliente: 'Uno', costo_usd: 1.5, tokens: 200, pasos: 2, ramas: ['analisis-voz'], estado: 'completa', inicio: '2026-11-01T09:00:00Z', fin: '2026-11-01T11:00:00Z', duracion_ms: 7_200_000 })
    expect(r.filas_sin_ejecucion).toBe(1); expect(r.completo).toBe(true)
    const t = JSON.stringify(r); for (const s of ['PROMPT-SECRETO', 'ENTRADA-SECRETA', 'SALIDA-SECRETA', 'META-SECRETA']) expect(t).not.toContain(s)
  })
  it('estado: fallida · en curso · atascada · completa', async () => {
    const db = base().semilla('agent_invocations', [inv({ id: '1', workflow_execution_id: 'f', error_message: 'x' })])
      .semilla('agent_dispatches', [des({ workflow_execution_id: 'e', status: 'error', dispatch_key: 'e' }), des({ workflow_execution_id: 'c', status: 'running', created_at: '2026-11-01T14:50:00Z', dispatch_key: 'c', completed_at: null }), des({ workflow_execution_id: 'a', status: 'running', created_at: '2026-11-01T10:00:00Z', dispatch_key: 'a', completed_at: null }), des({ workflow_execution_id: 'o', dispatch_key: 'o' })])
    const r = await leerCorridas(ctx(db))
    const e = Object.fromEntries(r.corridas.map((c) => [c.workflow_execution_id, c]))
    expect(e.f.estado).toBe('fallida'); expect(e.f.fallos).toBe(1); expect(e.e.estado).toBe('fallida'); expect(e.c.estado).toBe('en_curso'); expect(e.a.estado).toBe('atascada'); expect(e.o.estado).toBe('completa')
    expect(e.c).toMatchObject({ fin: null, duracion_ms: null }); expect(e.a.fin).toBeNull()
  })
  it('un despacho «running» cuyo empleado sí terminó no deja la corrida atascada; otro empleado de la misma corrida sin terminar sí', async () => {
    const db = base().semilla('agent_invocations', [inv({ id: '1', workflow_execution_id: 'h', agent_name: 'a', started_at: '2026-11-01T10:00:00Z' }), inv({ id: '2', workflow_execution_id: 's', agent_name: 'a', started_at: '2026-11-01T10:00:00Z' })])
      .semilla('agent_dispatches', [des({ workflow_execution_id: 'h', agent_name: 'a', status: 'running', dispatch_key: 'h1', created_at: '2026-11-01T10:00:00Z', completed_at: null }), des({ workflow_execution_id: 's', agent_name: 'otro', status: 'running', dispatch_key: 's1', created_at: '2026-11-01T10:00:00Z', completed_at: null })])
    const e = Object.fromEntries((await leerCorridas(ctx(db))).corridas.map((c) => [c.workflow_execution_id, c.estado]))
    expect(e).toEqual({ h: 'completa', s: 'atascada' })
  })
  it('filtros y límites: cliente, flujo, dias 1-30, limite 1-200', async () => {
    const db = base().semilla('agent_invocations', [inv({ id: '1', workflow_execution_id: 'x' }), inv({ id: '2', workflow_execution_id: 'y', client_id: C2, workflow_id: 'otro' })])
    expect((await leerCorridas(ctx(db), { client_id: C2 })).corridas.map((c) => c.workflow_execution_id)).toEqual(['y'])
    expect((await leerCorridas(ctx(db), { workflow_id: 'otro' })).corridas.map((c) => c.workflow_execution_id)).toEqual(['y'])
    const r = await leerCorridas(ctx(db), { limite: 1, dias: 999 }); expect(r.corridas).toHaveLength(1); expect(r.total).toBe(2); expect(r.dias).toBe(30); expect(r.limite).toBe(1)
    const m = await leerCorridas(ctx(db), { limite: 0, dias: -3 }); expect(m.limite).toBe(1); expect(m.dias).toBe(1)
    expect((await leerCorridas(ctx(db), { dias: Number('nada') })).dias).toBe(7)
  })
  it('árbol: ramas ordenadas (la principal primero), pasos con agente, tiempo, costo, tokens, estado y error; el despacho se une a su paso; un despacho sin invocación SALE como paso', async () => {
    const db = base().semilla('agent_invocations', [
      inv({ id: 'p2', agent_name: 'jefe', started_at: '2026-11-01T10:30:00Z' }), inv({ id: 'p1', agent_name: 'a', started_at: '2026-11-01T10:00:00Z' }),
      inv({ id: 'v', agent_name: 'voz', workflow_execution_id: '100:analisis-voz', cost_usd: 0.25, status: 'failed', error_message: 'Bearer abcdefghijklmnop' }),
      inv({ id: 'otra', workflow_execution_id: '1000' }),
    ]).semilla('agent_dispatches', [des({}), des({ dispatch_key: 'sin', agent_name: 'mudo', status: 'running', running_at: '2026-11-01T10:40:00Z', created_at: '2026-11-01T10:40:00Z', completed_at: null, metadata: {} }), des({ dispatch_key: 'mal', agent_name: 'roto', status: 'error', metadata: { error: 'token=abc123 no sirve' } })])
    const r = await leerCorrida(ctx(db), '100:analisis-voz')
    expect(r.status).toBe(200)
    const arbol = r.cuerpo.arbol as Array<{ rama: string | null; costo_usd: number; pasos: Array<Record<string, unknown>> }>
    expect(arbol.map((a) => a.rama)).toEqual([null, 'analisis-voz'])
    expect(arbol[0].pasos.map((p) => p.id)).toEqual(['mal', 'p1', 'p2', 'sin'])
    expect(arbol[0].pasos[1]).toMatchObject({ origen: 'invocacion', agente: 'a', modelo: 'm', duracion_ms: 60000, costo_usd: 1, tokens: { entrada: 10, salida: 20, cache_lectura: 30, cache_escritura: 40 }, tokens_total: 100, turnos: 2, estado: 'completed', error: null, despacho: 'dispatch:wf:a:100' })
    expect(arbol[0].pasos[3]).toMatchObject({ origen: 'despacho', agente: 'mudo', estado: 'atascado', costo_usd: 0 })
    expect(arbol[0].pasos[0]).toMatchObject({ origen: 'despacho', estado: 'error', error: 'token=[oculto] no sirve' })
    expect(arbol[1].pasos[0]).toMatchObject({ id: 'v', estado: 'failed', error: 'Bearer [oculto]' })
    expect(r.cuerpo.corrida).toMatchObject({ workflow_execution_id: '100', costo_usd: 2.25, estado: 'fallida', cliente: 'Uno' })
    expect((r.cuerpo.braintrust as { enlace: unknown }).enlace).toBeNull()
    const t = JSON.stringify(r); for (const s of ['PROMPT-SECRETO', 'ENTRADA-SECRETA', 'SALIDA-SECRETA', 'META-SECRETA', 'abcdefghijklmnop', 'abc123']) expect(t).not.toContain(s)
    expect(t).not.toContain('"otra"')
  })
  it('id malo → 400 (sin consultar con comodines); inexistente → 404; con la base caída NO dice «no existe»: 502', async () => {
    for (const malo of ['a%25', 'a b', 'a:b:c', '', "x'y", 'a*']) expect((await leerCorrida(ctx(base()), malo)).status).toBe(400)
    expect((await leerCorrida(ctx(base()), '999')).status).toBe(404)
    const db = base(); db.fallar['agent_invocations'] = 'caída'
    const r = await leerCorrida(ctx(db), '999')
    expect(r.status).toBe(502); expect(r.cuerpo.error).toBe('fuentes_no_disponibles')
  })
})

describe('las rutas', () => {
  const previo = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
  afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })
  const pet = (u: string, llave: string | null = 'k-int') => new Request(`https://t.test${u}`, llave ? { headers: { 'x-api-key': llave } } : {})
  it('sin llave o con llave mala → 401 en las cuatro; con llave responden; y solo exponen GET', async () => {
    mocks.db = base().semilla('agent_invocations', [{ id: '1', agent_name: 'a', workflow_execution_id: '100', started_at: new Date().toISOString(), status: 'completed' }])
    const a = await import('@/app/api/direccion/decisiones/route')
    const b = await import('@/app/api/direccion/riesgos/route')
    const c = await import('@/app/api/direccion/corridas/route')
    const d = await import('@/app/api/direccion/corridas/[id]/route')
    const llamadas = (l: string | null) => [a.GET(pet('/api/direccion/decisiones', l)), b.GET(pet('/api/direccion/riesgos', l)), c.GET(pet('/api/direccion/corridas?dias=3&limite=5', l)), d.GET(pet('/api/direccion/corridas/100', l), { params: { id: '100' } })]
    for (const l of [null, 'mala']) for (const r of await Promise.all(llamadas(l))) expect(r.status).toBe(401)
    const r = await Promise.all(llamadas('k-int'))
    expect(r.map((x) => x.status)).toEqual([200, 200, 200, 200])
    expect((await r[2].json()).limite).toBe(5)
    for (const m of [a, b, c, d]) expect(Object.keys(m).filter((k) => /^(POST|PUT|PATCH|DELETE)$/.test(k))).toEqual([])
  })
  it('una base que revienta da 500 sin filtrar el motivo', async () => {
    mocks.db = { from() { throw new Error('postgres://user:clave@host') } }
    const { GET } = await import('@/app/api/direccion/corridas/route')
    const r = await GET(pet('/api/direccion/corridas'))
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('clave@')
  })
})

describe('el código', () => {
  const raiz = join(__dirname, '..', 'src')
  const archivos = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === '__tests__' ? [] : archivos(p)) : [p] })
  const fuentes = [...archivos(join(raiz, 'lib', 'direccion')), ...archivos(join(raiz, 'app', 'api', 'direccion'))]
  it('no contiene escrituras ni nombra a un cliente, y no pide columnas de secretos ni de prompts', () => {
    expect(fuentes.length).toBeGreaterThanOrEqual(8)
    for (const f of fuentes) {
      const t = readFileSync(f, 'utf8')
      expect(t, f).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
      expect(t, f).not.toMatch(/n[aá]ufrago|peniche/i)
      expect(t, f).not.toMatch(/valor_cifrado|cerebro_credenciales|system_prompt|input_summary|output_summary/)
      expect(t, f).not.toMatch(/select\('\*'\)/)
    }
  })
})
