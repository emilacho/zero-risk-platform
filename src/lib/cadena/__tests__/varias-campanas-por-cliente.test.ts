/**
 * 19-nov · VARIAS CAMPAÑAS VIVAS POR CLIENTE · lo esencial para la prueba (firma de Emilio 21:16 Zúrich · GO de Lenovo a CC1 · entrega 1) · CC1.
 * Un plan y un manual por cliente; de ahí salen varias campañas INDEPENDIENTES. La campaña nueva nace con su `llave_de_campana`; sin llave nace del plan, como siempre.
 * Lo que se mide:
 *  · sin llave, todo sigue igual (una por plan, una viva, un plan nuevo reemplaza);
 *  · con llave, nace AL LADO, no reemplaza a nadie y es idempotente por su llave;
 *  · con `campana_id` se retoma ESA campaña (lo que manda el reintento y la reapertura), nunca la del plan por error;
 *  · la base: los dos únicos de siempre solo entre las sin llave, uno nuevo por llave, y una reversa que no borra campañas.
 * Almacén en memoria: US$ 0, sin base, sin red, sin modelo. Cliente sintético.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { abrirCampana } from '../index'
import { leerLlaveDeCampana, LARGO_DE_LLAVE, sobreDeReintento } from '../campanas'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana } from '../almacen'

const A = clienteA()
const ABRE = '2026-10-12T12:00:00Z'
const OTRO = '00000000-0000-4000-8000-0000000000bb'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const almacen = (planes = [{ plan_id: 'plan-1', fecha: '2026-10-08' }]) => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: planes },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }, { journeyId: 'journey-2', clientId: A.clientId }],
})
const abrir = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => abrirCampana(al, { ...wf, client_id: A.clientId, seco: true, ...extra }, ABRE)
const idDe = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.campana as { id: string }).id
const camp = (al: AlmacenMemoria, id: string) => al.campanas.find((c) => c.id === id) as Campana
const vivas = (al: AlmacenMemoria) => al.campanas.filter((c) => c.estado !== 'cerrada' && c.estado !== 'reemplazada')
const foto = (al: AlmacenMemoria) => JSON.stringify(al.campanas)

describe('varias campañas · sin llave, todo sigue igual', () => {
  it('🔴 el mismo sobre dos veces contesta «ya abierta» con la misma campaña, y nace sin llave', async () => {
    const al = almacen()
    const r1 = await abrir(al); const r2 = await abrir(al)
    expect(r1.status).toBe(201)
    expect(r2.cuerpo).toMatchObject({ ya_abierta: true })
    expect(idDe(r2)).toBe(idDe(r1))
    expect(al.campanas).toHaveLength(1)
    expect(camp(al, idDe(r1)).llave_de_campana ?? null).toBeNull()
  })
  it('🔴 un plan NUEVO sin llave sigue reemplazando a la viva sin llave', async () => {
    const al = almacen([{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-10' }])
    const a = idDe(await abrir(al, { plan_id: 'plan-1' }))
    const r = await abrir(al, { plan_id: 'plan-2' })
    expect(r.status).toBe(201)
    expect(r.cuerpo.reemplaza_a).toBe(a)
    expect(camp(al, a).estado).toBe('reemplazada')
  })
})

describe('varias campañas · con llave, nace al lado', () => {
  it('🔴 una campaña con llave sobre el MISMO plan nace viva al lado de la otra, sin reemplazar a nadie', async () => {
    const al = almacen()
    const a = idDe(await abrir(al))
    const antes = structuredClone(camp(al, a))
    const r = await abrir(al, { llave_de_campana: 'prueba-conjunta-2026-11-19' })
    expect(r.status).toBe(201)
    expect(r.cuerpo.reemplaza_a).toBeNull()
    const b = idDe(r)
    expect(b).not.toBe(a)
    expect(camp(al, b)).toMatchObject({ llave_de_campana: 'prueba-conjunta-2026-11-19', plan_id: 'plan-1', estado: 'abierta', reemplaza_a: null })
    expect(camp(al, a)).toEqual(antes) // la de siempre, intacta
    expect(vivas(al)).toHaveLength(2)
  })
  it('🔴 la misma llave dos veces contesta «ya abierta» con la misma campaña (idempotencia por llave)', async () => {
    const al = almacen(); await abrir(al)
    const b1 = await abrir(al, { llave_de_campana: 'k1' }); const b2 = await abrir(al, { llave_de_campana: 'k1' })
    expect(b2.cuerpo).toMatchObject({ ya_abierta: true })
    expect(idDe(b2)).toBe(idDe(b1))
    expect(al.campanas).toHaveLength(2)
  })
  it('🔴 dos llaves distintas son dos campañas más; cada una con su llave', async () => {
    const al = almacen(); await abrir(al)
    const b = idDe(await abrir(al, { llave_de_campana: 'k1' })); const c = idDe(await abrir(al, { llave_de_campana: 'k2' }))
    expect(b).not.toBe(c)
    expect(vivas(al).map((x) => x.llave_de_campana ?? null).sort()).toEqual([null, 'k1', 'k2'].sort())
  })
  it('🔴 con llave nace aunque NO haya campaña del plan, y después el plan abre la suya sin chocar', async () => {
    const al = almacen()
    const b = idDe(await abrir(al, { llave_de_campana: 'k1' }))
    const a = await abrir(al)
    expect(a.status).toBe(201)
    expect(idDe(a)).not.toBe(b)
    expect(a.cuerpo.reemplaza_a).toBeNull() // la de llave no cuenta como «la viva» del plan
    expect(vivas(al)).toHaveLength(2)
  })
  it('🔴 un plan NUEVO sin llave reemplaza solo a la del plan: la campaña con llave sigue viva', async () => {
    const al = almacen([{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-10' }])
    const a = idDe(await abrir(al, { plan_id: 'plan-1' }))
    const b = idDe(await abrir(al, { plan_id: 'plan-1', llave_de_campana: 'k1' }))
    const r = await abrir(al, { plan_id: 'plan-2' })
    expect(r.cuerpo.reemplaza_a).toBe(a)
    expect(camp(al, a).estado).toBe('reemplazada')
    expect(camp(al, b).estado).toBe('abierta')
  })
  it('🔴 carrera con la misma llave: el que pierde contesta «ya abierta» con la ganadora y no revive a nadie', async () => {
    const al = almacen(); const a = idDe(await abrir(al))
    const orig = al.insertarCampana.bind(al)
    let primera = true
    al.insertarCampana = async (c) => {
      if (primera) { primera = false; await orig(c); throw Object.assign(new Error('duplicate key value violates unique constraint "cadena_campanas_una_por_llave"'), { code: '23505' }) }
      return orig(c)
    }
    const r = await abrir(al, { llave_de_campana: 'k1' })
    expect(r.cuerpo).toMatchObject({ ya_abierta: true })
    expect(camp(al, idDe(r)).llave_de_campana).toBe('k1')
    expect(camp(al, a).estado).toBe('abierta')
    expect(al.campanas).toHaveLength(2)
  })
  it('🔴 una llave mal formada no escribe nada (400); vacía o null es «sin llave»', async () => {
    const al = almacen(); await abrir(al)
    const antes = foto(al)
    for (const v of [7, 'con espacio', 'x'.repeat(LARGO_DE_LLAVE + 1), ['k1'], 'ñandú']) {
      const r = await abrir(al, { llave_de_campana: v })
      expect(r.status, JSON.stringify(v)).toBe(400)
      expect(r.cuerpo).toMatchObject({ code: 'E-LLAVE-DE-CAMPANA' })
    }
    expect(foto(al)).toBe(antes)
    for (const v of ['', null]) expect((await abrir(al, { llave_de_campana: v })).cuerpo, String(v)).toMatchObject({ ya_abierta: true })
  })
  it('🔴 la regla de la llave: recorta espacios a los lados y acepta letras, números, «-», «_», «.» y «:»', () => {
    expect(leerLlaveDeCampana(undefined)).toBeNull()
    expect(leerLlaveDeCampana('')).toBeNull()
    expect(leerLlaveDeCampana('  prueba-1  ')).toBe('prueba-1')
    expect(leerLlaveDeCampana('a.b_c:d-1')).toBe('a.b_c:d-1')
    expect(leerLlaveDeCampana('x'.repeat(LARGO_DE_LLAVE))).toBe('x'.repeat(LARGO_DE_LLAVE))
    expect(leerLlaveDeCampana('   ')).toBe(false)
    expect(leerLlaveDeCampana('a b')).toBe(false)
  })
})

describe('varias campañas · con campana_id se retoma ESA campaña', () => {
  it('🔴 el sobre del reintento de la campaña con llave la retoma a ELLA, no a la del plan', async () => {
    const al = almacen()
    const a = idDe(await abrir(al))
    const b = idDe(await abrir(al, { llave_de_campana: 'k1' }))
    const sobre = sobreDeReintento(camp(al, b), '2026-10-12:am')
    expect(sobre.payload.campana_id).toBe(b)
    const r = await abrir(al, { ...sobre.payload, seco: sobre.payload.dry_run })
    expect(r.cuerpo).toMatchObject({ ya_abierta: true })
    expect(idDe(r)).toBe(b)
    expect(idDe(r)).not.toBe(a)
    expect(al.campanas).toHaveLength(2)
  })
  it('🔴 un viaje nuevo de la sala sobre ESA campaña, que sigue armando, le actualiza el viaje (y solo a ella)', async () => {
    const al = almacen()
    const a = idDe(await abrir(al, { sala_ref: { _journey_id: 'journey-1' } }))
    const b = idDe(await abrir(al, { llave_de_campana: 'k1', sala_ref: { _journey_id: 'journey-1' } }))
    await abrir(al, { campana_id: b, sala_ref: { _journey_id: 'journey-2' } })
    expect(camp(al, b).sala_ref._journey_id).toBe('journey-2')
    expect(camp(al, a).sala_ref._journey_id).toBe('journey-1')
  })
  it('🔴 campana_id manda sobre la llave: retoma esa y no abre otra', async () => {
    const al = almacen(); const a = idDe(await abrir(al))
    const r = await abrir(al, { campana_id: a, llave_de_campana: 'k-nueva' })
    expect(idDe(r)).toBe(a)
    expect(al.campanas).toHaveLength(1)
  })
  it('🔴 una campaña que no existe, de otro cliente, de otro plan o de otro modo: 409 y no se escribe nada', async () => {
    const al = almacen([{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-10' }])
    const a = idDe(await abrir(al, { plan_id: 'plan-1' }))
    const b = idDe(await abrir(al, { plan_id: 'plan-1', llave_de_campana: 'k1' }))
    const casos: Array<[string, Record<string, unknown>, (al: AlmacenMemoria) => void]> = [
      ['no existe', { campana_id: 'camp-999' }, () => {}],
      ['otro plan', { campana_id: b, plan_id: 'plan-2' }, () => {}],
      ['otro cliente', { campana_id: b }, (x) => { camp(x, b).client_id = OTRO }],
      ['otro modo', { campana_id: b }, (x) => { camp(x, b).seco = false }],
    ]
    for (const [nombre, extra, preparar] of casos) {
      preparar(al)
      const antes = foto(al)
      const r = await abrir(al, extra)
      expect(r.status, nombre).toBe(409)
      expect(r.cuerpo, nombre).toMatchObject({ code: 'E-CAMPANA-NO-COINCIDE' })
      expect(foto(al), nombre).toBe(antes)
    }
    expect(camp(al, a).estado).toBe('abierta')
  })
  it('🔴 un campana_id que no es texto: 400, sin escribir', async () => {
    const al = almacen(); await abrir(al); const antes = foto(al)
    const r = await abrir(al, { campana_id: 12 })
    expect(r.status).toBe(400)
    expect(foto(al)).toBe(antes)
  })
})

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
describe('varias campañas · la base', () => {
  const M = leer('supabase/migrations/202611192130_cadena_campanas_llave_de_campana.sql')
  const R = leer('supabase/reversas/202611192130_cadena_campanas_llave_de_campana_REVERSA.sql')
  const SUPA = leer('src/lib/cadena/almacen-supabase.ts')
  it('🔴 la migración: columna, los dos únicos de siempre solo entre las sin llave, uno nuevo por llave, con guarda y todo o nada', () => {
    expect(M).toMatch(/^BEGIN;$/m); expect(M).toMatch(/^COMMIT;$/m)
    expect(M).toContain('ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS llave_de_campana text;')
    expect(M).toContain('ALTER TABLE public.cadena_campanas DROP CONSTRAINT IF EXISTS cadena_campanas_un_plan;')
    expect(M).toContain('CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_un_plan ON public.cadena_campanas (client_id, plan_id) WHERE llave_de_campana IS NULL;')
    expect(M).toContain('DROP INDEX IF EXISTS public.cadena_campanas_una_viva_por_cliente;')
    expect(M).toContain("CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_una_viva_por_cliente ON public.cadena_campanas (client_id, seco) WHERE estado NOT IN ('cerrada','reemplazada') AND llave_de_campana IS NULL;")
    expect(M).toContain('CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_una_por_llave ON public.cadena_campanas (client_id, seco, llave_de_campana) WHERE llave_de_campana IS NOT NULL;')
    expect(M).toMatch(/IF n <> 3 THEN RAISE EXCEPTION/)
    expect(M).toMatch(/WHERE llave_de_campana IS NOT NULL\) THEN\s+RAISE EXCEPTION 'llave_de_campana: una campaña que ya existía tiene llave'/)
    expect(M).not.toMatch(/\b(DELETE|TRUNCATE|DROP TABLE|UPDATE)\b/i)
  })
  it('🔴 la reversa: se niega si hay campañas con llave y no borra ninguna; vuelve los dos únicos de siempre', () => {
    expect(R).toMatch(/IF EXISTS \(SELECT 1 FROM public\.cadena_campanas WHERE llave_de_campana IS NOT NULL\) THEN\s+RAISE EXCEPTION/)
    expect(R.indexOf('RAISE EXCEPTION')).toBeLessThan(R.indexOf('DROP INDEX'))
    expect(R).toContain("CREATE UNIQUE INDEX cadena_campanas_una_viva_por_cliente ON public.cadena_campanas (client_id, seco) WHERE estado NOT IN ('cerrada','reemplazada');")
    expect(R).toContain('ALTER TABLE public.cadena_campanas ADD CONSTRAINT cadena_campanas_un_plan UNIQUE (client_id, plan_id);')
    expect(R).not.toMatch(/\b(DELETE|TRUNCATE|DROP TABLE)\b/i)
  })
  it('🔴 el almacén real: «por plan» y «la viva» miran solo las sin llave; «por llave» mira la llave', () => {
    expect(SUPA).toMatch(/async campanaPorPlan\([^)]*\) \{[^\n]*\.eq\('plan_id', planId\)\.eq\('seco', seco\)\.is\('llave_de_campana', null\)\.maybeSingle\(\)/)
    expect(SUPA).toMatch(/async campanaViva\([^)]*\) \{[^\n]*\.eq\('seco', seco\)\.is\('llave_de_campana', null\)\.not\('estado', 'in', '\(cerrada,reemplazada\)'\)/)
    expect(SUPA).toMatch(/async campanaPorLlave\(clientId, llave, seco\) \{[^\n]*\.eq\('client_id', clientId\)\.eq\('llave_de_campana', llave\)\.eq\('seco', seco\)\.maybeSingle\(\)/)
  })
})
