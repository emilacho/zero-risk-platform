/**
 * Relevo 61 (ejecutado en la ronda 63) · EL BRIEF Y LA PIEZA ENTRAN A LA SALA POR LAS DOS PUERTAS, EN PASARELA (sin encender nada). Todo en seco: sin n8n, sin base, sin modelo (US$ 0).
 *   ① mapa: BRIEF → puerta de la cadena · PIEZAS → puerta de la oficina · alias para el cable de vuelta (la parte original y la pieza simple siguen rotuladas BRIEF/PIEZAS)
 *   ② las puertas existen con ESE camino de webhook y reenvían (pasarela) a lo de siempre con la misma llave de despacho
 *   ③ filas de la sala (migración): acompañan al mapa y se revierten solas
 *   ④ la familia de la oficina por fila: dato de `cadena_formatos_por_red`, la copia de la parte la deja por brief
 *   ⑤ lo que NO se tocó
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JOURNEY_WORKFLOW_MAP, getJourneyWorkflowTarget, journeyTypeOfWorkflow } from '../src/lib/sala-journey-dispatch/journey-workflow-map'
import { familiaDeFila } from '../src/lib/cadena/familia'
import { filasListar } from '../src/lib/cadena'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion } from '../src/lib/cadena/__fixtures__/clientes'
import type { FormatosPorRed } from '../src/lib/cadena/tipos'
import { construirCodigo, construirFlujo } from '../scripts/worker-staging/cadena/construir-r63.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any>; active?: boolean }
const RAIZ = process.cwd()
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const flujo = (p: string) => JSON.parse(leer(p)) as Flujo
const PUERTA_CADENA = flujo('scripts/worker-staging/cadena/puerta-ANTES-r63.json')
const PUERTA_OFICINA = flujo('scripts/worker-staging/oficina/puerta-flujo-ANTES-r63.json')
const COPIA_ANTES = flujo('scripts/worker-staging/cadena/parte-por-filas-ANTES-r63.json')
const COPIA = flujo('scripts/worker-staging/cadena/parte-por-filas-ARREGLADA-r63.json')
const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x }
const sinComentarios = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('① el mapa de la sala', () => {
  it('BRIEF entra por la puerta de la cadena · PIEZAS por la de la oficina · la llave de despacho sigue obligatoria y el sufijo de idempotencia no cambia', () => {
    expect(getJourneyWorkflowTarget('BRIEF')).toMatchObject({ workflow_id: 'pBAp5Cx7R39U585i', webhook_path: 'zero-risk/cadena', idempotency_suffix: 'brief-worker-dispatch', dispatch_key_required: true, phase_boundaries: ['journey_completed'] })
    expect(getJourneyWorkflowTarget('PIEZAS')).toMatchObject({ workflow_id: 'PzZ3b6cY6DYmIaOQ', webhook_path: 'zero-risk/oficina', idempotency_suffix: 'pieza-worker-dispatch', dispatch_key_required: true, phase_boundaries: ['journey_completed'] })
  })
  it('el cable de vuelta de la puerta Y el de la parte original / la pieza simple se rotulan con su viaje real (nunca ONBOARD por omisión)', () => {
    expect(journeyTypeOfWorkflow('pBAp5Cx7R39U585i')).toBe('BRIEF')
    expect(journeyTypeOfWorkflow('PQdIgbuFexuBsoh8')).toBe('BRIEF')
    expect(journeyTypeOfWorkflow('BNXqlaX1oHSfZIpF')).toBe('BRIEF')
    expect(journeyTypeOfWorkflow('PzZ3b6cY6DYmIaOQ')).toBe('PIEZAS')
    expect(journeyTypeOfWorkflow('lVCLzxQCKNkd3uS0')).toBe('PIEZAS')
  })
  it('rojo del alias: sin él, el cable de la parte original (modo pasarela) caería en el valor por omisión', () => {
    // el mismo cálculo SIN la rama de alias (lo que habría pasado con solo cambiar el workflow_id)
    const sinAlias = (id: string) => Object.entries(JOURNEY_WORKFLOW_MAP).find(([, t]) => t && t.workflow_id === id)?.[0]
    expect(sinAlias('PQdIgbuFexuBsoh8')).toBeUndefined()
    expect(sinAlias('lVCLzxQCKNkd3uS0')).toBeUndefined()
  })
  it('lo que no está en el mapa sigue sin viaje · y los demás destinos no cambiaron', () => {
    expect(journeyTypeOfWorkflow('no-existe')).toBeUndefined()
    expect(journeyTypeOfWorkflow(null)).toBeUndefined()
    expect(journeyTypeOfWorkflow('LyVoKcrypS5uLyuu')).toBe('ONBOARD')
    expect(journeyTypeOfWorkflow('X9F0zp6LQ2xGEYVS')).toBe('PRODUCE')
    expect(JOURNEY_WORKFLOW_MAP.ONBOARD).toMatchObject({ workflow_id: 'LyVoKcrypS5uLyuu', webhook_path: 'zero-risk/deal-won-onboarding' })
    expect(JOURNEY_WORKFLOW_MAP.PRODUCE).toMatchObject({ workflow_id: 'X9F0zp6LQ2xGEYVS', webhook_path: 'zero-risk/planeacion' })
    for (const j of ['ACQUIRE', 'ALWAYS_ON', 'REVIEW', 'GROWTH'] as const) expect(JOURNEY_WORKFLOW_MAP[j]).toBeUndefined()
  })
})

describe('② las puertas: el camino del webhook coincide con el mapa y la pasarela reenvía a lo de siempre', () => {
  const webhook = (f: Flujo) => f.nodes.find((n) => n.type.endsWith('.webhook'))!.parameters
  it('la puerta de la cadena escucha en zero-risk/cadena y la de la oficina en zero-risk/oficina (lo que dice el mapa)', () => {
    expect(webhook(PUERTA_CADENA).path).toBe(getJourneyWorkflowTarget('BRIEF')!.webhook_path)
    expect(webhook(PUERTA_OFICINA).path).toBe(getJourneyWorkflowTarget('PIEZAS')!.webhook_path)
    expect(webhook(PUERTA_CADENA).responseMode).toBe('onReceived')   // igual que los obreros de hoy: la sala ve 200 al recibir
    expect(webhook(PUERTA_OFICINA).responseMode).toBe('onReceived')
  })
  it('la pasarela de la cadena reenvía el cuerpo SIN tocarlo a la parte original, con la misma llave de despacho', () => {
    const p = nodo(PUERTA_CADENA, 'Pasarela · reenviar a la parte').parameters
    expect(String(p.url)).toContain('/webhook/zero-risk/brief')
    expect(p.jsonBody).toBe('={{ $json.cuerpo_original }}')
    expect(JSON.stringify(p.headerParameters)).toContain('x-sala-dispatch-key')
    expect(String(nodo(PUERTA_CADENA, 'Pasarela · ¿salió?').parameters.jsCode)).toContain('PUERTA_PASARELA_FALLO')   // un fallo NO se traga el sobre
  })
  it('la pasarela de la oficina reenvía el cuerpo intacto a la pieza simple, con la misma llave', () => {
    const p = nodo(PUERTA_OFICINA, 'Pasarela · pieza simple').parameters
    expect(String(p.url)).toContain('/zero-risk/pieza')
    expect(String(p.jsonBody)).toContain('cuerpo_original')
    expect(JSON.stringify(p.headerParameters)).toContain('x-sala-dispatch-key')
  })
  it('el cable de cada puerta lleva el id de la PUERTA, que el mapa reconoce como su viaje', () => {
    expect(String(nodo(COPIA_ANTES, '④ Chequeos').parameters.jsCode)).toContain("worker_id: 'pBAp5Cx7R39U585i'")
    expect(journeyTypeOfWorkflow('pBAp5Cx7R39U585i')).toBe('BRIEF')
    expect(String(nodo(PUERTA_OFICINA, '① ¿Qué pasó?').parameters.jsCode)).toContain('worker_id: $workflow.id')   // = PzZ3b6cY6DYmIaOQ cuando corre
    expect(journeyTypeOfWorkflow('PzZ3b6cY6DYmIaOQ')).toBe('PIEZAS')
  })
  it('los respaldos de las dos puertas son los flujos APAGADOS de hoy (la activación es un paso aparte, con respaldo)', () => {
    expect(PUERTA_CADENA.active).toBe(false)
    expect(PUERTA_OFICINA.active).toBe(false)
  })
})

describe('③ las filas de la sala acompañan al mapa', () => {
  const sql = sinComentarios(leer('supabase/migrations/202610110200_cadena_oficina_cableado_sala.sql'))
  const enteros = leer('supabase/migrations/202610110200_cadena_oficina_cableado_sala.sql')
  it('I2 + I3a: la fuente cadena/vigia (solo «briefear») y su regla hacia la puerta de la cadena · idempotentes', () => {
    expect(sql).toMatch(/INSERT INTO public\.ingress_sources[\s\S]*'cadena\/vigia', 'A', 'internal_key', NULL, ARRAY\['briefear'\]/)
    expect(sql).toMatch(/ON CONFLICT \(source\) DO NOTHING/)
    expect(sql).toMatch(/'cadena\/vigia', 'briefear', 'BRIEF', 'pBAp5Cx7R39U585i'/)
    expect(sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM public\.routing_rules WHERE source = 'cadena\/vigia' AND intent = 'briefear'\)/)
  })
  it('I3b + O3: las reglas viejas apuntan a las puertas · solo si todavía apuntan a lo original (no pisan otro destino)', () => {
    expect(sql).toMatch(/SET worker_workflow_id = 'pBAp5Cx7R39U585i'[\s\S]*WHERE source = 'planeacion\/plan-listo' AND intent = 'briefear' AND worker_workflow_id = 'PQdIgbuFexuBsoh8'/)
    expect(sql).toMatch(/SET worker_workflow_id = 'PzZ3b6cY6DYmIaOQ'[\s\S]*WHERE source = 'brief\/parte-listo' AND intent = 'producir' AND worker_workflow_id = 'lVCLzxQCKNkd3uS0'/)
  })
  it('los ids de la migración son EXACTAMENTE los del mapa (si no, el consumidor marca drift)', () => {
    expect(sql).toContain(getJourneyWorkflowTarget('BRIEF')!.workflow_id)
    expect(sql).toContain(getJourneyWorkflowTarget('PIEZAS')!.workflow_id)
    for (const orig of [...getJourneyWorkflowTarget('BRIEF')!.alias_workflow_ids!.slice(0, 1), ...getJourneyWorkflowTarget('PIEZAS')!.alias_workflow_ids!]) expect(enteros).toContain(orig)
  })
  it('no enciende nada: no toca cadena_config ni oficina_config · y trae la reversa de cada línea', () => {
    expect(sql).not.toMatch(/cadena_config|oficina_config|estado_cadena|familias_activas|clientes_ensayo/)
    for (const r of ["SET active = false WHERE source = 'cadena/vigia';", "worker_workflow_id = 'PQdIgbuFexuBsoh8' WHERE source = 'planeacion/plan-listo'", "worker_workflow_id = 'lVCLzxQCKNkd3uS0' WHERE source = 'brief/parte-listo'"]) expect(enteros).toContain(r)
    expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bkind\b/i)   // la columna es journey_type
  })
})

// ───────── la familia por fila
const migracionFamilia = leer('supabase/migrations/202610110100_cadena_formatos_familia.sql')
/** los formatos de la siembra real + las familias de la migración nueva (así la prueba y la tabla no se separan) */
function formatosConFamilia(): FormatosPorRed {
  const out = formatosDeLaMigracion()
  const reglas = [...sinComentarios(migracionFamilia).matchAll(/SET familia = '(\w+)'\s+WHERE familia IS NULL AND formato (?:= '(\w+)'|IN \(([^)]*)\))/g)]
  for (const m of reglas) {
    const lista = m[2] ? [m[2]] : (m[3] ?? '').split(',').map((x) => x.trim().replace(/'/g, ''))
    for (const fs of Object.values(out)) for (const f of fs) if (lista.includes(f.formato) && !f.familia) f.familia = m[1]
  }
  return out
}

describe('④ la familia de la oficina por fila (por dato, agnóstica)', () => {
  const F = formatosConFamilia()
  it('la migración: columna opcional, idempotente, solo tres familias con sala · el resto queda sin familia', () => {
    const sql = sinComentarios(migracionFamilia)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS familia text/)
    expect((sql.match(/UPDATE public\.cadena_formatos_por_red SET familia/g) ?? []).length).toBe(3)
    expect((sql.match(/WHERE familia IS NULL/g) ?? []).length).toBe(3)   // nunca pisa lo ya escrito
    expect(sql).not.toMatch(/\bDELETE\b|\bDROP TABLE\b|\bTRUNCATE\b/i)
    const conFamilia = new Set(Object.values(F).flat().filter((f) => f.familia).map((f) => f.familia))
    expect([...conFamilia].sort()).toEqual(['carrusel_ig_v1', 'kit_historias', 'post_img'])
  })
  it('post con foto → post_img · carrusel → carrusel_ig_v1 · historia/estado → kit_historias · lo que no tiene sala → null', () => {
    const f = (red: string, formato: string) => familiaDeFila({ red, formato }, F)
    expect(f('instagram', 'foto')).toBe('post_img')
    expect(f('facebook', 'foto')).toBe('post_img')
    expect(f('linkedin', 'foto')).toBe('post_img')
    expect(f('instagram', 'carrusel')).toBe('carrusel_ig_v1')
    expect(f('instagram', 'historia')).toBe('kit_historias')
    expect(f('whatsapp', 'estado')).toBe('kit_historias')
    for (const [red, formato] of [['instagram', 'reel'], ['tiktok', 'video'], ['youtube', 'short'], ['linkedin', 'texto'], ['instagram', 'anuncio_imagen'], ['instagram', 'anuncio_carrusel']]) expect(f(red, formato)).toBeNull()
  })
  it('red o formato desconocidos, formatos sin la columna o con una familia mal escrita → null (nunca inventa)', () => {
    expect(familiaDeFila({ red: 'mastodon', formato: 'foto' }, F)).toBeNull()
    expect(familiaDeFila({ red: 'instagram', formato: 'hologramas' }, F)).toBeNull()
    expect(familiaDeFila({ red: 'instagram', formato: 'foto' }, formatosDeLaMigracion())).toBeNull()      // la tabla vieja, sin la columna
    expect(familiaDeFila({ red: 'x', formato: 'y' }, { x: [{ formato: 'y', produccion: 'opera', lead_dias: 1, max_por_dia: null, familia: 'Post Img!' }] })).toBeNull()
    expect(familiaDeFila({ red: 'x', formato: 'y' }, {})).toBeNull()
  })
  it('agnóstica: el código no nombra rubros ni clientes; la familia viene del dato', () => {
    const codigo = leer('src/lib/cadena/familia.ts').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//')).join('\n')
    expect(codigo).not.toMatch(/post_img|carrusel_ig_v1|kit_historias|ceviche|restaurante|Náufrago/i)
  })
  it('/api/cadena/filas · listar: cada fila trae su `familia` (de la tabla) · lo demás de la respuesta no cambia', async () => {
    const A = clienteA()
    class Almacen extends AlmacenMemoria { async formatos() { return formatosConFamilia() } }
    const al = new Almacen({ contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta' }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }] })
    const filas = [
      { id: 'f1', red: 'instagram', formato: 'foto' }, { id: 'f2', red: 'instagram', formato: 'carrusel' }, { id: 'f3', red: 'instagram', formato: 'reel' },
    ] as unknown as Awaited<ReturnType<AlmacenMemoria['filas']>>
    ;(al as unknown as { filas: () => Promise<unknown> }).filas = async () => filas
    ;(al as unknown as { campana: () => Promise<unknown> }).campana = async () => ({ id: 'c1', client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: '2026-10-12', fecha_fin: '2026-12-20', estado: 'activa', seco: true })
    ;(al as unknown as { autorizar: unknown }).autorizar = undefined
    const r = await filasListar(al, { campana_id: 'c1', workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
    expect(r.status).toBe(200)
    const out = (r.cuerpo as { filas: Array<{ id: string; familia: string | null }>; total: number }).filas
    expect(out.map((f) => [f.id, f.familia])).toEqual([['f1', 'post_img'], ['f2', 'carrusel_ig_v1'], ['f3', null]])
    expect((r.cuerpo as { total: number }).total).toBe(3)
  })
})

describe('④ la copia de la parte «por filas» deja la familia por brief', () => {
  const corre = (flujoCopia: Flujo, c: Record<string, unknown>) => {
    const codigo = String(nodo(flujoCopia, '④ Chequeos').parameters.jsCode)
    const out = new Function('$input', '$workflow', '$execution', '$', codigo)({ first: () => ({ json: c }) }, { id: 'BNXqlaX1oHSfZIpF' }, { id: '999' }, () => ({ first: () => ({ json: {} }), all: () => [] })) as Array<{ json: any }>
    return out[0].json
  }
  const parte = (ents: Array<Record<string, unknown>>) => JSON.stringify({ entregables: ents, pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [], dependencias: [] })
  const base = (ents: Array<Record<string, unknown>>, filas: Array<Record<string, unknown>>) => ({
    client_id: '96864e88-79bc-47ff-8f8e-5bf88610ec7d', llego_la_vuelta: true, texto: parte(ents), fila_ids: filas.map((f) => f.id), filas_lote: filas, dry_run: true,
    plan_id: 'p1', campana_id: 'c1', lote: 'l1', lote_key: 'k1', plan_texto: 'plan', forbidden_words: [], required_terminology: [],
  })
  it('rojo: la copia de hoy no deja familia alguna', () => {
    const j = corre(COPIA_ANTES, base([{ id: 'B1', fila_id: 'f1' }], [{ id: 'f1', familia: 'post_img' }]))
    expect(j.fila_parte.provenance_tag.familias_por_brief).toBeUndefined()
  })
  it('verde: cada brief lleva la familia de SU fila (la que dejó /api/cadena/filas) · null si la fila no tiene sala', () => {
    const j = corre(COPIA, base([{ id: 'B1', fila_id: 'f1' }, { id: 'B2', fila_id: 'f2' }, { id: 'B3', fila_id: 'f3' }], [{ id: 'f1', familia: 'post_img' }, { id: 'f2', familia: 'carrusel_ig_v1' }, { id: 'f3', familia: null }]))
    expect(j.fila_parte.provenance_tag.familias_por_brief).toEqual([
      { brief_id: 'B1', fila_id: 'f1', familia: 'post_img' }, { brief_id: 'B2', fila_id: 'f2', familia: 'carrusel_ig_v1' }, { brief_id: 'B3', fila_id: 'f3', familia: null },
    ])
  })
  it('una fila sin el campo `familia` (tabla vieja) o un lote vacío → null / lista vacía · nunca rompe', () => {
    expect(corre(COPIA, base([{ id: 'B1', fila_id: 'f1' }], [{ id: 'f1' }])).fila_parte.provenance_tag.familias_por_brief).toEqual([{ brief_id: 'B1', fila_id: 'f1', familia: null }])
    const ilegible = { ...base([], []), texto: 'esto no es un parte' }
    expect(corre(COPIA, ilegible).fila_parte.provenance_tag.familias_por_brief).toEqual([])
  })
  it('lo demás del nodo no cambia: la copia difiere SOLO en «④ Chequeos» · sigue inactiva · y este flujo NO emite ningún sobre de producción', () => {
    const a = new Map(COPIA_ANTES.nodes.map((n) => [n.name, JSON.stringify(n.parameters)])), b = new Map(COPIA.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
    expect(b.size).toBe(a.size)
    expect([...a.keys()].filter((k) => a.get(k) !== b.get(k))).toEqual(['④ Chequeos'])
    expect(COPIA.connections).toEqual(COPIA_ANTES.connections)
    expect(COPIA.active).toBe(false)
    expect(JSON.stringify(COPIA)).not.toMatch(/api\/sala\/intake|parte-listo/)
  })
  it('no se puede construir dos veces', () => {
    expect(() => construirCodigo(String(nodo(COPIA, '④ Chequeos').parameters.jsCode))).toThrow(/ya trae r63/)
    expect(() => construirFlujo(COPIA)).toThrow(/ya trae r63/)
  })
})

describe('⑤ nada más cambió', () => {
  it('la pasarela no arregla el 401 de la parte original: el nodo BRIEF viejo queda como está (lo dice el mapa)', () => {
    const mapa = leer('src/lib/sala-journey-dispatch/journey-workflow-map.ts')
    expect(mapa).toMatch(/devuelve 401 en su nodo BRIEF/)
    expect(mapa).toMatch(/NO se arregla en el recorrido viejo/)
  })
  it('el interruptor de la cadena y el de la oficina siguen en sus migraciones de origen como «apagada»: este relevo no los toca', () => {
    const cadena = leer('supabase/migrations/202610090200_cadena_tablas.sql')
    expect(cadena).toMatch(/estado_cadena[^\n]*apagada/)
    for (const m of ['202610110100_cadena_formatos_familia.sql', '202610110200_cadena_oficina_cableado_sala.sql']) expect(sinComentarios(leer('supabase/migrations/' + m))).not.toMatch(/estado_cadena|oficina_config|activo\s*=\s*true/)
  })
})
