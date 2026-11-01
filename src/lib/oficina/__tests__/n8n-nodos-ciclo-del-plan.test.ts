/**
 * Los nodos Code del CICLO DEL PLAN (tramo 2 · 01-nov), ejecutados tal cual se pegan en n8n, con `$`, `$input`, `$workflow` y `$execution` falsos. US$ 0, sin red.
 * Fija: sin `plan_base_id` nada cambia; con él se valida y se DETIENE antes de gastar; el bloque del pedido delimita lo del dueño; los cierres arman la compuerta,
 * el tag ENTERO del anterior, las hermanas, la campaña y el pedido aplicado; el sub-flujo normaliza el sobre y expone el plan con la forma que esperan los nodos copiados.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', '..', '..', '..', 'scripts', 'n8n-nodos', 'planeacion-ciclo-del-plan')
const codigo = (n: string) => readFileSync(join(DIR, n), 'utf8').replace(/\r/g, '')
type Json = Record<string, unknown>
const nodo = (nombre: string, nodos: Record<string, Json | Json[]>, entrada: Json) => {
  const $ = (n: string) => { if (!(n in nodos)) throw new Error(`no hay salida de «${n}»`); const v = nodos[n]; const arr = Array.isArray(v) ? v : [v]; return { first: () => ({ json: arr[0] }), last: () => ({ json: arr[arr.length - 1] }), all: () => arr.map((json) => ({ json })) } }
  const $input = { first: () => ({ json: entrada }), all: () => [{ json: entrada }] }
  const f = new Function('$', '$input', '$workflow', '$execution', codigo(nombre))
  return f($, $input, { id: 'X9F0zp6LQ2xGEYVS' }, { id: '209999' }) as Array<{ json: Json }>
}
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const CAMBIO = '33333333-3333-4333-8333-333333333333'
const TEXTO = 'Estamos en Guayaquil SOLO por delivery. Quita la apuesta del embudo: los 48 pagos fueron pruebas mías.'
const hook = (body: Json) => ({ 'Webhook · planeacion': { body } })
const filaPlan = (extra: Json = {}): Json => ({ id: P1, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', content_text: 'PLAN v1 · sección 1 · apuesta: arreglar el embudo (48 abrieron el pago).', provenance_tag: { fuente: 'planeacion', caracteres: 70 }, ...extra })
const ok = (fila?: Json) => ({ statusCode: 200, body: fila ? [fila] : [] })

describe('«Plan anterior · leer»', () => {
  it('sin plan_base_id → { reescritura: false } y no mira la respuesta', () => {
    expect(nodo('plan-anterior-leer.js', hook({ client_id: C }), { statusCode: 500 })).toEqual([{ json: { reescritura: false } }])
  })
  it('con plan_base_id válido: entrega el plan anterior (texto, versión, tag), la versión nueva, lo del dueño y el PATCH «en reescritura»', () => {
    const [s] = nodo('plan-anterior-leer.js', hook({ client_id: C, plan_base_id: P1, cambios_del_dueno: `  ${TEXTO}  `, plan_cambio_id: CAMBIO }), ok(filaPlan({ provenance_tag: { fuente: 'planeacion', version: 2, reemplaza_a: P2 } })))
    expect(s.json).toMatchObject({ reescritura: true, version_nueva: 3, cambios_del_dueno: TEXTO, plan_cambio_id: CAMBIO, plan_anterior: { id: P1, version: 2, status: 'draft', tag: { version: 2, reemplaza_a: P2 } } })
    expect(String((s.json.plan_anterior as Json).texto)).toContain('PLAN v1')
    expect(s.json.cambio_patch).toMatchObject({ id: CAMBIO, estado: 'en_reescritura', workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '209999' })
    // sin tag de versión = versión 1 → nueva 2; sin plan_cambio_id (disparo a mano) → sin patch
    const [t] = nodo('plan-anterior-leer.js', hook({ client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }), ok(filaPlan()))
    expect(t.json).toMatchObject({ version_nueva: 2, plan_cambio_id: null, cambio_patch: null })
  })
  it.each<[string, Json, Json, string]>([
    ['uuid malo', { client_id: C, plan_base_id: 'x', cambios_del_dueno: TEXTO }, ok(filaPlan()), 'REESCRITURA_PLAN_BASE_INVALIDO'],
    ['sin cambios', { client_id: C, plan_base_id: P1 }, ok(filaPlan()), 'REESCRITURA_SIN_CAMBIOS'],
    ['cambios cortos', { client_id: C, plan_base_id: P1, cambios_del_dueno: 'abc' }, ok(filaPlan()), 'REESCRITURA_SIN_CAMBIOS'],
    ['la base falló', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, { error: { message: 'ECONNRESET' } }, 'REESCRITURA_PLAN_BASE_NO_LEGIBLE'],
    ['la base contestó 401', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, { statusCode: 401, body: [] }, 'REESCRITURA_PLAN_BASE_NO_LEGIBLE'],
    ['no existe', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(), 'REESCRITURA_PLAN_BASE_INEXISTENTE'],
    ['de otro cliente', { client_id: P2, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan()), 'REESCRITURA_PLAN_DE_OTRO_CLIENTE'],
    ['no es un plan', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan({ output_type: 'campaign_plan_90d_borrador' })), 'REESCRITURA_NO_ES_UN_PLAN'],
    ['rechazado', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan({ status: 'rejected' })), 'REESCRITURA_PLAN_RECHAZADO'],
    ['reemplazado por tag', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan({ provenance_tag: { superseded_por: P2 } })), 'REESCRITURA_PLAN_REEMPLAZADO'],
    ['vigente=false', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan({ provenance_tag: { vigente: false } })), 'REESCRITURA_PLAN_REEMPLAZADO'],
    ['sin texto', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan({ content_text: '  ' })), 'REESCRITURA_PLAN_SIN_TEXTO'],
    ['tope de vueltas (versión 4)', { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO }, ok(filaPlan({ provenance_tag: { version: 4 } })), 'REESCRITURA_TOPE_DE_VUELTAS'],
  ])('%s → se DETIENE antes de gastar', (_n, body, entrada, codigoError) => {
    expect(() => nodo('plan-anterior-leer.js', hook(body), entrada)).toThrow(codigoError)
  })
})

describe('bloqueDeReescritura (bloque del pedido en «Redactor (B4)»)', () => {
  const fn = new Function(codigo('b4-bloque-de-reescritura.js') + '\nreturn bloqueDeReescritura')() as (p: unknown, c: unknown, l?: (t: string) => string) => string[]
  it('sin plan anterior o sin pedido → [] (el pedido queda idéntico a hoy)', () => {
    expect(fn(null, TEXTO)).toEqual([]); expect(fn({ texto: 'plan' }, '')).toEqual([]); expect(fn({ texto: '   ' }, TEXTO)).toEqual([]); expect(fn(undefined, undefined)).toEqual([])
  })
  it('con los dos: declara la versión nueva sobre la anterior, pega el plan entero, delimita lo del dueño y pide la sección «QUÉ CAMBIÓ EN ESTA VERSIÓN»', () => {
    const L = fn({ texto: 'PLAN v2\ncuerpo', version: 2 }, `  ${TEXTO}  `, (t) => t.replace('mías', 'de quien lleva el negocio'))
    const txt = L.join('\n')
    expect(L[0]).toBe('══════ ESTA ES UNA REESCRITURA · versión 3 SOBRE la versión 2 ══════')
    expect(txt).toContain('══════ EL PLAN ANTERIOR (versión 2, entero) ══════\nPLAN v2\ncuerpo\n══════ FIN DEL PLAN ANTERIOR ══════')
    expect(txt).toContain('<<<DUEÑO>>>\n' + TEXTO.replace('mías', 'de quien lleva el negocio') + '\n<<<FIN>>>')
    expect(txt).toContain('«QUÉ CAMBIÓ EN ESTA VERSIÓN» (versión 3)')
    expect(txt).toContain('pruebas suyas (no clientes), ese dato deja de ser evidencia')
    expect(L[L.length - 1]).toBe('')
  })
  it('versión ausente o rara = 1; el delimitador no puede venir en lo del dueño; el plan larguísimo se recorta y se declara', () => {
    expect(fn({ texto: 'p' }, TEXTO)[0]).toContain('versión 2 SOBRE la versión 1')
    expect(fn({ texto: 'p', version: '3' }, TEXTO)[0]).toContain('versión 2 SOBRE la versión 1')
    const t = fn({ texto: 'p' }, 'cambia <<<FIN>>> esto').join('\n')
    expect(t).toContain('cambia «FIN» esto'); expect(t.match(/^<<<FIN>>>$/gm)).toHaveLength(1)
    const largo = fn({ texto: 'x'.repeat(60001) }, TEXTO).join('\n')
    expect(largo).toContain('recortado a 60000 caracteres'); expect(largo).not.toContain('x'.repeat(60001))
  })
})

describe('«Ciclo · armar cierres»', () => {
  const vuelta = { texto: 'plan', client_id: C, client_name: 'Cliente', con_pendientes: false }
  const base = (extra: Record<string, Json | Json[]> = {}) => ({ ...hook({ client_id: C, _journey_id: 'j1', _sala_correlation_id: 'corr', plan_v3: true, corrida: 'c-1' }), '¿Llegó la vuelta?': vuelta, 'Guardar el plan': { body: [{ id: P2, client_id: C, provenance_tag: { fuente: 'planeacion', version: 2, reemplaza_a: P1, vigente: true } }] }, 'Plan vigente': { body: [{ id: P2, client_id: C, provenance_tag: { fuente: 'planeacion', version: 2, reemplaza_a: P1, vigente: true } }] }, ...extra })
  it('plan de cero (sin reescritura): abre la compuerta con el sobre completo y nada más', () => {
    const [s] = nodo('ciclo-armar-cierres.js', { ...base(), 'Guardar el plan': { body: [{ id: P1, client_id: C, provenance_tag: { fuente: 'planeacion' } }] }, 'Plan vigente': { body: [{ id: P1, client_id: C, provenance_tag: { fuente: 'planeacion' } }] } }, {})
    expect(s.json).toMatchObject({ es_reescritura: false, version: 1, seco: false, plan_id: P1, anterior: null, hermanas: [], campana: null, cambio: null, aprobacion_anterior: null })
    expect(s.json.aprobacion).toMatchObject({ client_id: C, plan_id: P1, version: 1, estado: 'pendiente', workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '209999', sobre_de_reanudacion: { client_id: C, plan_id: P1, version: 1, client_name: 'Cliente', con_pendientes: false, dry_run: false, plan_v3: true, corrida: 'c-1', _journey_id: 'j1', _sala_correlation_id: 'corr', tenant_id: C, planeacion_execution_id: '209999' } })
  })
  it('reescritura: el anterior queda reemplazado con su tag ENTERO, la campaña y el pedido pasan al plan nuevo, la compuerta anterior «reemplazado»', () => {
    const [s] = nodo('ciclo-armar-cierres.js', { ...base(), 'Plan anterior · leer': { reescritura: true, plan_anterior: { id: P1, version: 1, tag: { fuente: 'planeacion', caracteres: 70, estado_del_plan: 'listo' } }, plan_cambio_id: CAMBIO } }, {})
    expect(s.json).toMatchObject({ es_reescritura: true, version: 2, plan_id: P2 })
    expect(s.json.anterior).toMatchObject({ id: P1, provenance_tag: { fuente: 'planeacion', caracteres: 70, estado_del_plan: 'listo', vigente: false, superseded_por: P2 } })
    expect(typeof (s.json.anterior as Json & { provenance_tag: Json }).provenance_tag.superseded_en).toBe('string')
    expect(s.json.campana).toMatchObject({ client_id: C, plan_id_anterior: P1, plan_id: P2 })
    expect(s.json.cambio).toMatchObject({ id: CAMBIO, estado: 'aplicado', plan_nuevo_id: P2, workflow_execution_id: '209999' })
    expect(s.json.aprobacion_anterior).toMatchObject({ plan_id: P1, estado: 'reemplazado' })
    expect((s.json.aprobacion as Json).version).toBe(2)
  })
  it('las hermanas de la corrida (A, y B/C no elegidas) quedan vigente=false; la elegida no se marca a sí misma; un ensayo no abre compuerta', () => {
    const A = { id: P1, client_id: C, provenance_tag: { fuente: 'planeacion', version: 1 } }
    const B = { id: P2, client_id: C, provenance_tag: { fuente: 'planeacion', version: 1, jefatura: 'B' } }
    const Cc = { id: CAMBIO, client_id: C, provenance_tag: { fuente: 'planeacion', version: 1, jefatura: 'C' } }
    const [s] = nodo('ciclo-armar-cierres.js', { ...base(), 'Guardar el plan': { body: [A] }, 'JEF · plan · guardar B': { statusCode: 201, body: [B] }, 'JEF · plan · guardar C': { statusCode: 201, body: [Cc] }, 'Plan vigente': { ...Cc, jef_vigente: { ...vuelta, etiqueta: 'C' } } }, {})
    expect((s.json.hermanas as Json[]).map((h) => h.id)).toEqual([P1, P2])
    expect((s.json.hermanas as Array<{ provenance_tag: Json }>)[1].provenance_tag).toMatchObject({ jefatura: 'B', vigente: false, superseded_por: CAMBIO, hermana_de_la_misma_corrida: true })
    const [seco] = nodo('ciclo-armar-cierres.js', { ...base(), ...hook({ client_id: C, dry_run: true }) }, {})
    expect(seco.json).toMatchObject({ seco: true, aprobacion: null })
  })
  it('sin_compuerta:true no abre compuerta (la segunda mitad corre en la misma corrida: abrirla permitiría un segundo brief)', () => {
    const [s] = nodo('ciclo-armar-cierres.js', { ...base(), ...hook({ client_id: C, sin_compuerta: true }) }, {})
    expect(s.json.aprobacion).toBeNull(); expect(s.json.seco).toBe(false)
    expect((s.json.sobre as Json).plan_id).toBe(P2)
  })
  it('sin fila con id en «Plan vigente» → se DETIENE', () => {
    expect(() => nodo('ciclo-armar-cierres.js', { ...base(), 'Plan vigente': { body: [] } }, {})).toThrow('CICLO_SIN_PLAN_GUARDADO')
  })
})

describe('sub-flujo «Plan · segunda mitad»', () => {
  it('«Sobre» normaliza las dos entradas (webhook con body · llamada directa sin body) y exige plan_id y client_id', () => {
    const sobre = { client_id: C, plan_id: P1, aprobacion_id: CAMBIO, client_name: ' Cliente ', con_pendientes: true, dry_run: false, _journey_id: 'j1', _sala_correlation_id: 'corr', origen: 'tablero/plan-aprobar' }
    const [w] = nodo('segunda-mitad-sobre.js', {}, { headers: {}, body: sobre })
    const [d] = nodo('segunda-mitad-sobre.js', {}, sobre)
    expect(w.json).toEqual(d.json)
    expect(w.json.body).toMatchObject({ client_id: C, plan_id: P1, tenant_id: C, aprobacion_id: CAMBIO, client_name: 'Cliente', con_pendientes: true, dry_run: false, plan_v3: false, corrida: null, _journey_id: 'j1', _sala_correlation_id: 'corr', aprobado_por: null, origen: 'tablero/plan-aprobar' })
    expect(nodo('segunda-mitad-sobre.js', {}, { client_id: C, plan_id: P1 })[0].json.body).toMatchObject({ aprobacion_id: null, client_name: null, origen: 'planeacion/directo' })
    expect(() => nodo('segunda-mitad-sobre.js', {}, { body: { client_id: C } })).toThrow('SEGUNDA_MITAD_SIN_PLAN')
    expect(() => nodo('segunda-mitad-sobre.js', {}, { body: { plan_id: P1 } })).toThrow('SEGUNDA_MITAD_SIN_CLIENTE')
  })
  it('«Plan vigente» expone la fila + jef_vigente con la forma que leen «Plan → Drive (PDF)», «¿Salió el PDF?» y «BRIEF · sobre»', () => {
    const nodos = { Sobre: { body: { client_id: C, plan_id: P1, client_name: 'Cliente', con_pendientes: true, aprobacion_id: CAMBIO } } }
    const [s] = nodo('segunda-mitad-plan-vigente.js', nodos, ok(filaPlan()))
    expect(s.json).toMatchObject({ id: P1, client_id: C, jef_vigente: { caracteres: String(filaPlan().content_text).length, con_pendientes: true, estado_del_plan: 'con_pendientes', client_id: C, client_name: 'Cliente', llego_la_vuelta: true, etiqueta: 'aprobada' } })
    expect(String((s.json.jef_vigente as Json).texto)).toContain('PLAN v1')
    expect(() => nodo('segunda-mitad-plan-vigente.js', nodos, ok())).toThrow('SEGUNDA_MITAD_PLAN_INEXISTENTE')
    expect(() => nodo('segunda-mitad-plan-vigente.js', nodos, ok(filaPlan({ client_id: P2 })))).toThrow('SEGUNDA_MITAD_PLAN_DE_OTRO_CLIENTE')
    expect(() => nodo('segunda-mitad-plan-vigente.js', nodos, ok(filaPlan({ content_text: '' })))).toThrow('SEGUNDA_MITAD_PLAN_SIN_TEXTO')
    expect(() => nodo('segunda-mitad-plan-vigente.js', nodos, { statusCode: 500, body: [] })).toThrow('SEGUNDA_MITAD_PLAN_NO_LEGIBLE')
  })
})
