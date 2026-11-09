/**
 * 09-nov · «Uso» y «Desbloquea» cortos (`2026-11-09-RESPUESTA-LENOVO-a-CC4-CC6-CC1-290-uso-y-desbloquea-cortos.md`, punto 2): la plataforma manda `para_que_corto` y `destraba_corto`,
 * de una o dos palabras, escritos por la oficina que crea la decisión junto a su texto largo. Nunca un corte automático; sin largo no hay corto. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { DESTRABA_CORTO_DE_LA_PAUSA, PARA_QUE_CORTO_DE_LA_PAUSA } from '../src/lib/direccion/decisiones-registro'
import { DESTRABA_CORTO_DE_LA_FIRMA, PARA_QUE_CORTO_DE_LA_FIRMA } from '../src/lib/direccion/decisiones-firma'
import { DESTRABA_CORTO_CAMPANA_DETENIDA, PARA_QUE_CORTO_CAMPANA_DETENIDA } from '../src/lib/direccion/decisiones-campanas'

const AHORA = new Date('2026-11-04T20:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ENC = '99999999-9999-4999-8999-999999999999'
const CLIENTES = [{ id: C1, name: 'Uno', industry: 'restaurante', status: 'active' }, { id: C2, name: 'Dos', industry: 'software', status: 'active' }, { id: CP, name: 'zz prueba', industry: 'x', status: 'onboarding' }]
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString()
const base = () => new DbFalsa().semilla('clients', CLIENTES)
const ctx = (db: DbFalsa): Contexto => {
  const from = db.from.bind(db)
  db.from = ((t: string) => { const q = from(t) as unknown as Record<string, unknown>; for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { throw new Error(`ESCRITURA en ${t}`) }; return q }) as unknown as typeof db.from
  return { db, ahora: () => AHORA, env: {} }
}
const pregunta = (x: Record<string, unknown> = {}) => ({ id: 'p1', client_id: C1, tema: 'cupo diario', tema_norm: 'cupo', pregunta: '¿Cuántas mesas?', estado: 'pendiente', canal: 'x', oficina: 'financiera', agente: 'jefe-financiero', creado_en: hace(1), ...x })
const espera = (x: Record<string, unknown> = {}) => ({ id: 'e1', client_id: C1, tipo: 'finanzas', clave: `finanzas:${ENC}`, estado: 'esperando', despertado: null, despertar_intentos: 0, creado_en: hace(1), sobre: { corrida: 'corr-1', material: 'pesado' }, ...x })
const buzon = (preguntas: Record<string, unknown>[], version = 1, encargo_id = ENC) => ({ encargo_id, tipo: 'buzon_respuestas', version, contenido: { preguntas } })
const CAMP = { id: '28de888e', client_id: C1, estado: 'necesita_humano', estado_motivo: 'la estrategia sigue con bloqueos', seco: false, archivada_en: null, actualizada_en: hace(1) }
const ESPERA_C = { campana_id: '28de888e', objeto_tipo: 'necesita_humano', estado: 'viva', seco: false, vence_en: '2026-11-13T11:23:08Z', accion_al_vencer: 'pausada', desde: hace(1) }

const CORTOS = { PARA_QUE_CORTO_DE_LA_FIRMA, DESTRABA_CORTO_DE_LA_FIRMA, PARA_QUE_CORTO_DE_LA_PAUSA, DESTRABA_CORTO_DE_LA_PAUSA, PARA_QUE_CORTO_CAMPANA_DETENIDA, DESTRABA_CORTO_CAMPANA_DETENIDA }
/** una o dos palabras (hasta 3 con un artículo: «Cuentas del plan»), cortas para el frente, sin puntos suspensivos ni punto final */
const esCorto = (t: string) => { const w = t.trim().split(/\s+/); return w.length >= 1 && w.length <= 3 && t.length <= 24 && !/[.…:;]$/.test(t) && t === t.trim() }

describe('los cortos que escribe cada oficina', () => {
  it('🔴 cada uno es de una o dos palabras, sin cortes ni puntos', () => {
    for (const [k, v] of Object.entries(CORTOS)) expect(esCorto(v), k).toBe(true)
  })
  it('🔴 la firma: «Validar cifras» y «Solo constancia», con o sin críticos abiertos', async () => {
    const d = (await leerDecisiones(ctx(base().semilla('finanzas_tableros', [{ id: 't', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1) }])))).decisiones[0]
    expect(d).toMatchObject({ para_que_corto: 'Validar cifras', destraba_corto: 'Solo constancia' })
    expect(d.para_que).toMatch(/no dejó firmado/) // el largo sigue igual
  })
  it('🔴 el plan por aprobar: «PDF y brief»; no tiene «para qué», así que tampoco su corto', async () => {
    const r = await leerDecisiones(ctx(base().semilla('plan_aprobaciones', [{ id: 'a', client_id: C1, plan_id: 'plan-1', version: 1, estado: 'pendiente', creado_en: hace(1) }])))
    const d = r.decisiones.find((x) => x.id === 'plan-1')!
    expect(d.destraba_corto).toBe('PDF y brief'); expect(d).not.toHaveProperty('para_que_corto')
  })
  it('🔴 la pregunta de la pausa y la tarjeta de la pausa: «Cuentas del plan» y «El plan»', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [espera()]).semilla('dueno_preguntas', [pregunta()]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    for (const d of r.decisiones) expect(d, d.id).toMatchObject({ para_que_corto: 'Cuentas del plan', destraba_corto: 'El plan' })
    expect(r.decisiones).toHaveLength(2)
  })
  it('🔴 una pregunta sin pausa no trae cortos (no hay largo que acompañar)', async () => {
    const d = (await leerDecisiones(ctx(base().semilla('dueno_preguntas', [pregunta()])))).decisiones[0]
    expect(d).not.toHaveProperty('para_que_corto'); expect(d).not.toHaveProperty('destraba_corto')
  })
  it('🔴 sin preguntas por contestar la pausa no promete qué se destraba: tampoco su corto', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [espera()]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    const t = r.decisiones.find((x) => x.subtipo === 'plan_en_pausa')!
    expect(t).not.toHaveProperty('destraba'); expect(t).not.toHaveProperty('destraba_corto'); expect(t.para_que_corto).toBe('Cuentas del plan')
  })
  it('🔴 la campaña detenida: «Seguir la campaña» y «Rearmar la campaña»', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cadena_campanas', [CAMP]).semilla('cadena_esperas', [ESPERA_C])))
    const d = r.decisiones.find((x) => x.subtipo === 'campana_necesita_humano')
    expect(d).toBeDefined()
    expect(d).toMatchObject({ para_que_corto: 'Seguir la campaña', destraba_corto: 'Rearmar la campaña' })
  })
  it('🔴 en toda la lista: hay corto si y solo si hay largo', async () => {
    const db = base().semilla('esperas_del_dueno', [espera()]).semilla('dueno_preguntas', [pregunta(), pregunta({ id: 'p9', tema: 'color del logo', tema_norm: 'color' })]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])
      .semilla('finanzas_tableros', [{ id: 't', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1) }])
      .semilla('plan_aprobaciones', [{ id: 'a', client_id: C1, plan_id: 'plan-1', version: 1, estado: 'pendiente', creado_en: hace(1) }])
      .semilla('cadena_campanas', [CAMP]).semilla('cadena_esperas', [ESPERA_C])
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.length).toBeGreaterThanOrEqual(6)
    for (const d of r.decisiones) {
      expect(!!d.para_que_corto, `${d.id} para_que`).toBe(!!d.para_que); expect(!!d.destraba_corto, `${d.id} destraba`).toBe(!!d.destraba)
      for (const c of [d.para_que_corto, d.destraba_corto]) if (c) expect(esCorto(c), `${d.id} «${c}»`).toBe(true)
    }
  })
})
