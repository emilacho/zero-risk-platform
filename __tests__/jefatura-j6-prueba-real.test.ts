/**
 * JEFATURA · J6 · LA PRUEBA REAL CHICA (CC#1 · 14-oct) · el guion se prueba con un transporte de MENTIRA: US$ 0, sin red, sin base, sin n8n.
 * Se prueba lo que protege el dinero y el orden: sin «dale» no corre, sin `--aplicar` no escribe nada, el tope de cada revisión y el total (corte duro), que APAGA siempre al final (también si algo revienta),
 * que se niega a empezar si algo no está como se espera, y que el sobre que manda es una entrada VÁLIDA de la ruta real.
 */
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { validarEntrada } from '@/lib/jefatura/revision/contrato'
import { avisoParaEmilio, CLIENTES_REALES, compararContadores, correrLaPruebaReal, esExitosa, debeParar, evidenciaDeUnaRevision, pasosDeLaPrueba, sobreReal, TOPES, topeDeLaSiguiente } from '../scripts/ops/jefatura-prueba-real/nucleo.mjs'

type Json = Record<string, any>
const UUID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10'
const cont = (o: Json = {}) => ({ agent_invocations_total: 100, agent_invocations_de_los_clientes_de_practica: 0, agent_invocations_costo_usd_de_los_clientes_de_practica: 0, agent_invocations_workflow_id_nulo: 0, hitl_queue_total: 4, hitl_queue_editor_escalation: 0, client_historical_outputs_total: 7, ...o })

const pasosOk = (costos = { fondo: 0.06, gpt: 0.05 }) => [
  { n: 1, paso: 'revision_fondo', tipo: 'agente', agente: 'jefe-marketing', estado: 'hecho', cost_usd: costos.fondo },
  { n: 2, paso: 'segunda_mirada', tipo: 'externo', agente: 'GPT', estado: 'hecho', cost_usd: costos.gpt },
]
const evidenciaOk = (revision_id: string, o: Json = {}) => ({
  rev: { id: revision_id, estado: 'cerrada', resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, gasto_usd: 0.11, ...(o.rev ?? {}) },
  pasos: o.pasos ?? pasosOk(), fichas: o.fichas ?? [], invocaciones: o.invocaciones ?? [{ agent_name: 'jefe-marketing', cost_usd: 0.06, workflow_id: 'wf', origen: 'jefatura' }, { agent_name: 'gpt', cost_usd: 0.05, workflow_id: 'wf', origen: 'jefatura' }],
})

interface Opc { despertarStatus?: number; enVuelo?: number; cfg?: Json | null; turno?: Json | null; vigia?: Json | null; lecturas?: Json[][]; evidencia?: (id: string) => Json; ponerConfigFalla?: boolean; activarFalla?: boolean; aperturas?: Json[]; contadoresDespues?: Json }
function transporte(o: Opc = {}) {
  const llamadas: Array<{ t: string; a?: any }> = []
  let reloj = 1_700_000_000_000
  let k = 0
  const aperturas = o.aperturas ?? [{ status: 200, body: { accion: 'esperar', revision_id: '11111111-1111-4111-8111-111111111111', turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } } }, { status: 200, body: { accion: 'esperar', revision_id: '22222222-2222-4222-8222-222222222222', turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } } }]
  const lecturas = o.lecturas ?? [[{ estado: 'en_paso', gasto_usd: 0.02 }, { estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.11 }], [{ estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.12 }]]
  const lecIdx: Record<string, number> = {}
  const T = {
    llamadas,
    enVuelo: async () => (llamadas.push({ t: 'enVuelo' }), o.enVuelo ?? 0),
    leerConfig: async () => (llamadas.push({ t: 'leerConfig' }), o.cfg === undefined ? { estado: 'apagada', tipos_activos: [], clientes_ensayo: [] } : o.cfg),
    ponerConfig: async (c: Json) => { llamadas.push({ t: 'ponerConfig', a: c }); if (o.ponerConfigFalla && c.estado === 'apagada') throw new Error('PATCH 500') },
    flujos: async () => (llamadas.push({ t: 'flujos' }), { turno: o.turno === undefined ? { id: 'WFT', active: false } : o.turno, vigia: o.vigia === undefined ? { id: 'WFV', active: false } : o.vigia }),
    activar: async (id: string, on: boolean) => { llamadas.push({ t: 'activar', a: { id, on } }); if (o.activarFalla && !on) throw new Error('flujo 500') },
    llamar: async (ruta: string, cuerpo: Json) => {
      llamadas.push({ t: 'llamar:' + ruta, a: cuerpo })
      if (cuerpo.accion === 'leer') { const id = cuerpo.revision_id; const i = id.startsWith('1') ? 0 : 1; const j = lecIdx[id] ?? 0; lecIdx[id] = j + 1; const l = lecturas[i] ?? lecturas[0]; return { status: 200, body: { revision_id: id, ...l[Math.min(j, l.length - 1)] } } }
      return aperturas[k++] ?? { status: 500, body: {} }
    },
    despertar: async (c: Json) => (llamadas.push({ t: 'despertar', a: c }), { status: o.despertarStatus ?? 200 }),
    evidencia: async (id: string) => (llamadas.push({ t: 'evidencia', a: id }), (o.evidencia ?? evidenciaOk)(id)),
    contadores: async () => (llamadas.push({ t: 'contadores' }), llamadas.filter((x) => x.t === 'contadores').length === 1 ? cont() : cont({ agent_invocations_total: 104, agent_invocations_de_los_clientes_de_practica: 4, agent_invocations_costo_usd_de_los_clientes_de_practica: 0.23, ...(o.contadoresDespues ?? {}) })),
    ahora: () => reloj,
    dormir: async (ms: number) => { reloj += ms },
  }
  return T
}
const escribe = (t: string) => ['ponerConfig', 'activar', 'despertar'].includes(t) || t.startsWith('llamar:')
const base = { corrida: 'c1', confirmacion: true, aplicar: true }

describe('J6 · sin «dale» y sin --aplicar no se mueve nada', () => {
  it('sin --aplicar solo devuelve lo que haría y NO llama a nada (ni a leer)', async () => {
    const T = transporte()
    const r = await correrLaPruebaReal({ T, aplicar: false, confirmacion: true, corrida: 'c1' })
    expect(r.impreso).toBe(true); expect(r.escrituras).toBe(0); expect(T.llamadas).toEqual([])
    expect(r.pasos).toEqual(pasosDeLaPrueba())
  })
  it('con --aplicar pero SIN la confirmación del «dale» de Emilio se niega ANTES de tocar nada', async () => {
    const T = transporte()
    await expect(correrLaPruebaReal({ T, aplicar: true, confirmacion: false, corrida: 'c1' })).rejects.toThrow(/«dale» de Emilio/)
    expect(T.llamadas).toEqual([])
  })
  for (const c of ['true', 1, 'sí', undefined, null]) {
    it(`la confirmación solo vale si es exactamente \`true\` (no ${JSON.stringify(c)})`, async () => {
      const T = transporte()
      await expect(correrLaPruebaReal({ T, aplicar: true, confirmacion: c as never, corrida: 'c1' })).rejects.toThrow(/«dale»/)
      expect(T.llamadas).toEqual([])
    })
  }
  it('el guion por la línea de comandos: `plan` y `aviso` se imprimen sin red; `correr --aplicar` sin la fecha del «dale» sale con error 3 y NO toca nada', () => {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x', N8N_API_KEY: 'x', INTERNAL_API_KEY: 'x', N8N_BASE_URL: 'http://127.0.0.1:9', APP_URL: 'http://127.0.0.1:9' }
    const plan = spawnSync(process.execPath, ['scripts/ops/jefatura-prueba-real.mjs', 'plan'], { encoding: 'utf8', env })
    expect(plan.status).toBe(0); expect(plan.stdout).toContain('Ahora no se ha tocado nada')
    const aviso = spawnSync(process.execPath, ['scripts/ops/jefatura-prueba-real.mjs', 'aviso'], { encoding: 'utf8', env })
    expect(aviso.status).toBe(0); expect(aviso.stdout).toContain('Aviso previo a tu «dale»')
    const sinDale = spawnSync(process.execPath, ['scripts/ops/jefatura-prueba-real.mjs', 'correr', '--aplicar'], { encoding: 'utf8', env })
    expect(sinDale.status).toBe(3); expect(sinDale.stderr).toContain('--dale-de-emilio')
    const solo = spawnSync(process.execPath, ['scripts/ops/jefatura-prueba-real.mjs', 'correr'], { encoding: 'utf8', env })
    expect(solo.stdout).toContain('sin --aplicar: no se escribió ni se llamó a nada')
  })
})

describe('J6 · se niega a empezar si algo no está como se espera (y no enciende nada)', () => {
  for (const [caso, o, re] of [
    ['n8n tiene corridas', { enVuelo: 2 }, /2 ejecución/],
    ['la jefatura no está apagada', { cfg: { estado: 'ensayo', tipos_activos: [], clientes_ensayo: [] } }, /no está apagada/],
    ['la jefatura trae listas', { cfg: { estado: 'apagada', tipos_activos: ['plan'], clientes_ensayo: [] } }, /no está apagada/],
    ['no hay config', { cfg: null }, /no está apagada/],
    ['el flujo turno no existe', { turno: null }, /no existe o ya está activo/],
    ['el flujo turno ya está activo', { turno: { id: 'WFT', active: true } }, /no existe o ya está activo/],
    ['el vigía está activo', { vigia: { id: 'WFV', active: true } }, /vigía/],
  ] as Array<[string, Opc, RegExp]>) {
    it(caso, async () => {
      const T = transporte(o)
      await expect(correrLaPruebaReal({ T, ...base })).rejects.toThrow(re)
      expect(T.llamadas.filter((x) => escribe(x.t))).toEqual([])
    })
  }
})

describe('J6 · la corrida buena', () => {
  it('enciende SOLO pieza y los 2 clientes de práctica, activa SOLO el turno, corre las 2 revisiones en orden y APAGA al final', async () => {
    const T = transporte()
    const r = await correrLaPruebaReal({ T, ...base })
    const orden = T.llamadas.map((x) => x.t)
    const cfgs = T.llamadas.filter((x) => x.t === 'ponerConfig').map((x) => x.a)
    expect(cfgs[0]).toEqual({ estado: 'ensayo', tipos_activos: ['pieza'], clientes_ensayo: CLIENTES_REALES.map((c) => c.id) })
    expect(cfgs[cfgs.length - 1]).toEqual({ estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
    const act = T.llamadas.filter((x) => x.t === 'activar').map((x) => x.a)
    expect(act).toEqual([{ id: 'WFT', on: true }, { id: 'WFT', on: false }])
    expect(orden.indexOf('activar')).toBeLessThan(orden.indexOf('llamar:revisiones'))
    expect(orden.lastIndexOf('activar')).toBeGreaterThan(orden.lastIndexOf('llamar:revisiones'))
    expect(r.apagado).toBe(true); expect(r.revisiones).toHaveLength(2); expect(r.ok).toBe(true)
    expect(r.gasto_total_usd).toBeCloseTo(0.22, 6)
  })
  it('las 2 aperturas son entradas VÁLIDAS de la ruta real: pieza, real (dry_run false), 2 rubros distintos, artefacto único por corrida, tope de la revisión', async () => {
    const T = transporte()
    await correrLaPruebaReal({ T, ...base })
    const aperturas = T.llamadas.filter((x) => x.t === 'llamar:revisiones' && x.a.accion === undefined).map((x) => x.a)
    expect(aperturas).toHaveLength(2)
    for (const s of aperturas) {
      expect(validarEntrada(s).ok).toBe(true)
      expect(s.artifact_type).toBe('pieza'); expect(s.payload.dry_run).toBe(false); expect(s.payload.devolver_a.tipo).toBe('ninguno')
      expect(s.payload.simulacion).toBeUndefined()
      expect(s.client_id.startsWith('prueba-jefatura-real-')).toBe(true)
      expect(s.payload.contexto.length).toBeGreaterThanOrEqual(3)
    }
    expect(new Set(aperturas.map((s) => s.client_id)).size).toBe(2)
    expect(aperturas[0].artifact_id).not.toBe(aperturas[1].artifact_id)
    expect(aperturas[0].artifact_id).toContain('c1')
    expect(aperturas[0].payload.tope_restante_usd).toBe(0.5)
    expect(aperturas[1].payload.tope_restante_usd).toBeCloseTo(0.5, 6)
    // sin imagen: solo el dueño del texto
    expect(aperturas[0].payload.productores).toEqual([{ donde: 'texto', agente: 'content-creator' }])
    expect(aperturas[0].payload.imagenes).toBeUndefined()
  })
  it('con `--imagen` la pieza lleva su foto y el curador de imagen como segundo dueño', () => {
    const s = sobreReal(CLIENTES_REALES[0], { corrida: 'c1', tope_usd: 0.4, imagen: 'https://fotos.test/x.jpg' })
    expect(s.payload.imagenes).toEqual(['https://fotos.test/x.jpg']); expect(s.payload.productores.map((p: Json) => p.donde)).toEqual(['texto', 'imagen'])
    expect(validarEntrada(s).ok).toBe(true)
  })
  it('despierta el flujo con la revisión y el turno que dijo la ruta (y solo cuando la ruta pidió esperar)', async () => {
    const T = transporte()
    await correrLaPruebaReal({ T, ...base })
    const w = T.llamadas.filter((x) => x.t === 'despertar')
    expect(w).toHaveLength(2); expect(w[0].a.revision_id).toBe('11111111-1111-4111-8111-111111111111'); expect(w[0].a.turno.paso).toBe('revision_fondo')
    const T2 = transporte({ aperturas: [{ status: 200, body: { accion: 'cerrado', revision_id: '11111111-1111-4111-8111-111111111111', resultado: 'limpia' } }, { status: 200, body: { accion: 'cerrado', revision_id: '22222222-2222-4222-8222-222222222222', resultado: 'limpia' } }] })
    await correrLaPruebaReal({ T: T2, ...base })
    expect(T2.llamadas.filter((x) => x.t === 'despertar')).toHaveLength(0)
  })
  it('mira el cierre cada 5 s y se corta a los 20 min (corte duro por tiempo): apaga y deja el motivo', async () => {
    const T = transporte({ lecturas: [[{ estado: 'en_paso', gasto_usd: 0.01 }]] })
    const r = await correrLaPruebaReal({ T, ...base })
    expect(r.parada).toMatch(/no cerró en 20 min/)
    expect(r.apagado).toBe(true); expect(r.ok).toBe(false)
    expect(r.revisiones).toHaveLength(1)
    const lecturas = T.llamadas.filter((x) => x.t === 'llamar:revisiones' && x.a.accion === 'leer')
    expect(lecturas.length).toBeGreaterThan(200); expect(lecturas.length).toBeLessThan(260)
  })
})

describe('J6 · corte duro por costo', () => {
  it('el tope de la siguiente revisión es el menor entre 0,50 y lo que queda del total de 0,70; si queda menos de 0,10 NO se abre', () => {
    expect(topeDeLaSiguiente(0)).toEqual({ abrir: true, tope_usd: 0.5 })
    expect(topeDeLaSiguiente(0.25)).toEqual({ abrir: true, tope_usd: 0.45 })
    expect(topeDeLaSiguiente(0.4)).toEqual({ abrir: true, tope_usd: 0.3 })
    expect(topeDeLaSiguiente(0.6)).toMatchObject({ abrir: true, tope_usd: 0.1 })
    expect(topeDeLaSiguiente(0.61)).toMatchObject({ abrir: false })
    expect(topeDeLaSiguiente(0.7)).toMatchObject({ abrir: false })
    expect(topeDeLaSiguiente(0.95)).toMatchObject({ abrir: false })
  })
  it('si la primera revisión se come casi todo el total, la segunda se abre con LO QUE QUEDA (no con 0,50) o no se abre', async () => {
    const T = transporte({ lecturas: [[{ estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.4 }], [{ estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.2 }]], evidencia: (id) => evidenciaOk(id, { rev: { gasto_usd: id.startsWith('1') ? 0.4 : 0.2 }, pasos: pasosOk({ fondo: id.startsWith('1') ? 0.35 : 0.15, gpt: 0.05 }) }) })
    await correrLaPruebaReal({ T, ...base })
    const aperturas = T.llamadas.filter((x) => x.t === 'llamar:revisiones' && x.a.accion === undefined).map((x) => x.a)
    expect(aperturas[1].payload.tope_restante_usd).toBeCloseTo(0.3, 6)
    const T2 = transporte({ lecturas: [[{ estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.4 }]], evidencia: (id) => evidenciaOk(id, { rev: { gasto_usd: 0.4 }, pasos: pasosOk({ fondo: 0.35, gpt: 0.05 }) }) })
    const r2 = await correrLaPruebaReal({ T: T2, ...base, topes: { ...TOPES, total: 0.45 } })
    expect(r2.saltadas).toHaveLength(1); expect(r2.saltadas[0].motivo).toMatch(/no alcanza/)
    expect(T2.llamadas.filter((x) => x.t === 'llamar:revisiones' && x.a.accion === undefined)).toHaveLength(1)
    expect(r2.apagado).toBe(true)
  })
  it('una revisión que se pasa más de un 25 % de su tope PARA toda la prueba (no abre la otra) y apaga', async () => {
    expect(debeParar({ gasto_usd: 0.5 }, 0.4)).toBeNull()
    expect(debeParar({ gasto_usd: 0.5001 }, 0.4)).toMatch(/se corta la prueba/)
    expect(debeParar({}, 0.4)).toBeNull()
    const T = transporte({ lecturas: [[{ estado: 'en_paso', gasto_usd: 0.9 }]] })
    const r = await correrLaPruebaReal({ T, ...base })
    expect(r.parada).toMatch(/se corta la prueba/)
    expect(T.llamadas.filter((x) => x.t === 'llamar:revisiones' && x.a.accion === undefined)).toHaveLength(1)
    expect(r.apagado).toBe(true); expect(r.ok).toBe(false)
  })
  it('si el gasto total pasa el tope de 0,70 el resultado NO es «ok» aunque cada tramo lo sea', async () => {
    const T = transporte({ lecturas: [[{ estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.4 }], [{ estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.4 }]], evidencia: (id) => evidenciaOk(id, { rev: { gasto_usd: 0.4 }, pasos: pasosOk({ fondo: 0.35, gpt: 0.05 }) }), aperturas: undefined })
    const r = await correrLaPruebaReal({ T, ...base, topes: { ...TOPES, total: 0.7 } })
    expect(r.gasto_total_usd).toBeGreaterThan(0.7) // la ruta de mentira se portó mal: el guion lo SUMA y lo marca
    // la segunda se abrió con 0,30 de tope y gastó 0,4: la evidencia lo marca
    const seg = r.revisiones[1]
    expect(seg.tramos.find((t: Json) => t.tramo === 'costo dentro del tope').ok).toBe(false)
    expect(r.ok).toBe(false)
  })
})

describe('J6 · APAGA SIEMPRE', () => {
  it('si la ruta revienta a mitad de camino, igual restaura la configuración y desactiva el flujo (y el error se propaga)', async () => {
    const T = transporte()
    T.llamar = async () => { throw new Error('la ruta se cayó') }
    await expect(correrLaPruebaReal({ T, ...base })).rejects.toThrow(/la ruta se cayó/)
    const cfgs = T.llamadas.filter((x) => x.t === 'ponerConfig').map((x) => x.a)
    expect(cfgs[cfgs.length - 1]).toEqual({ estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
    expect(T.llamadas.filter((x) => x.t === 'activar').map((x) => x.a)).toEqual([{ id: 'WFT', on: true }, { id: 'WFT', on: false }])
  })
  it('si no se puede restaurar la configuración, igual se desactiva el flujo y el error lo dice (hay que apagar a mano)', async () => {
    const T = transporte({ ponerConfigFalla: true })
    let e: any
    try { await correrLaPruebaReal({ T, ...base }) } catch (x) { e = x }
    expect(e.message).toMatch(/NO se pudo apagar todo/); expect(e.message).toMatch(/jefatura_config/)
    expect(e.resultado_parcial.apagado).toBe(false)
    expect(T.llamadas.filter((x) => x.t === 'activar').map((x) => x.a).pop()).toEqual({ id: 'WFT', on: false })
  })
  it('si no se puede desactivar el flujo, igual se restaura la configuración y el error lo dice', async () => {
    const T = transporte({ activarFalla: true })
    let e: any
    try { await correrLaPruebaReal({ T, ...base }) } catch (x) { e = x }
    expect(e.message).toMatch(/flujo turno/)
    const cfgs = T.llamadas.filter((x) => x.t === 'ponerConfig').map((x) => x.a)
    expect(cfgs[cfgs.length - 1]).toEqual({ estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
  })
  it('si la ruta rechaza abrir (409, 400…) no se despierta nada, se anota y se apaga', async () => {
    const T = transporte({ aperturas: [{ status: 409, body: { error: 'jefatura_no_abre', motivo: 'tipo_no_activo' } }, { status: 409, body: { error: 'jefatura_no_abre' } }] })
    const r = await correrLaPruebaReal({ T, ...base })
    expect(T.llamadas.filter((x) => x.t === 'despertar')).toHaveLength(0)
    expect(r.revisiones.every((x: Json) => x.ok === false)).toBe(true); expect(r.ok).toBe(false); expect(r.apagado).toBe(true)
  })
})

describe('J6 · la evidencia por tramo', () => {
  const ev = (o: Json = {}) => evidenciaDeUnaRevision({ rev: { id: 'r1', estado: 'cerrada', resultado: 'limpia', marcas: {}, gasto_usd: 0.11 }, pasos: pasosOk(), fichas: [], invocaciones: [{ agent_name: 'gpt', cost_usd: 0.05, workflow_id: 'w', origen: 'jefatura' }], tope_usd: 0.4, minutos: 7.5, ...o })
  const tramo = (e: Json, nombre: string) => e.tramos.find((t: Json) => t.tramo === nombre)
  it('una revisión completa cumple todos los tramos', () => { const e = ev(); expect(e.ok).toBe(true); expect(e.tramos.map((t: Json) => t.tramo)).toContain('jefe real'); expect(e.saltos_de_agente).toBe(1) })
  it('el jefe sin costo NO cuenta como real (puede ser un simulacro)', () => { expect(tramo(ev({ pasos: pasosOk({ fondo: 0, gpt: 0.05 }) }), 'jefe real').ok).toBe(false) })
  it('fichas que bloquean sin paso de corrección = tramo sin cumplir; con corrección hecha = cumple', () => {
    const f = [{ origen: 'jefe', gravedad: 'bloquea', estado: 'abierta' }]
    expect(tramo(ev({ fichas: f }), 'corrección por el dueño del dónde').ok).toBe(false)
    expect(tramo(ev({ fichas: f, pasos: [...pasosOk(), { n: 3, paso: 'correccion:content-creator', tipo: 'agente', estado: 'hecho', cost_usd: 0.05 }] }), 'corrección por el dueño del dónde').ok).toBe(true)
  })
  it('sin ficha que bloquee la corrección es «informativo» (no se fuerza)', () => { expect(tramo(ev(), 'corrección por el dueño del dónde')).toMatchObject({ ok: true, informativo: true }) })
  it('GPT sin costo NO cumple («la llamada real no se probó») y lo dice', () => {
    const t = tramo(ev({ pasos: [pasosOk()[0], { n: 2, paso: 'segunda_mirada', tipo: 'externo', estado: 'hecho', cost_usd: 0, error: 'OPENAI_API_KEY no configurada' }] }), 'segunda mirada de GPT (ciega, con el portero)')
    expect(t.ok).toBe(false); expect(t.detalle).toMatch(/NO se probó/)
  })
  it('fichas externas sin decisión del dueño = tramo sin cumplir', () => {
    expect(tramo(ev({ fichas: [{ origen: 'externa', gravedad: 'sugerencia' }] }), 'decisión del dueño sobre lo que dijo GPT').ok).toBe(false)
    expect(tramo(ev({ fichas: [{ origen: 'externa', gravedad: 'sugerencia' }], pasos: [...pasosOk(), { n: 3, paso: 'decision:content-creator', tipo: 'agente', estado: 'hecho', cost_usd: 0.05 }] }), 'decisión del dueño sobre lo que dijo GPT').ok).toBe(true)
  })
  it('una revisión que sigue abierta, o con resultado inválido, no cierra', () => {
    expect(tramo(ev({ rev: { id: 'r1', estado: 'en_paso', resultado: null, gasto_usd: 0.1 } }), 'cierre').ok).toBe(false)
    expect(tramo(ev({ rev: { id: 'r1', estado: 'cerrada', resultado: 'inventado', gasto_usd: 0.11 } }), 'cierre').ok).toBe(false)
    for (const r of ['limpia', 'con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope', 'fallida']) expect(tramo(ev({ rev: { id: 'r1', estado: r === 'fallida' ? 'fallida' : r === 'incompleta_por_tope' ? 'cerrada_por_tope' : 'cerrada', resultado: r, gasto_usd: 0.11 } }), 'cierre').ok).toBe(true)
  })
  it('el costo por paso debe sumar el de la revisión y no pasar el tope', () => {
    expect(tramo(ev({ rev: { id: 'r1', estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.5 } }), 'costo dentro del tope').ok).toBe(false)
    expect(tramo(ev({ rev: { id: 'r1', estado: 'cerrada', resultado: 'limpia', gasto_usd: 0.3 } }), 'costo por paso = costo de la revisión').ok).toBe(false)
  })
  it('una llamada de agente sin workflow_id rompe la regla de oro y se marca', () => {
    expect(tramo(ev({ invocaciones: [{ agent_name: 'jefe-marketing', cost_usd: 0.06, workflow_id: null }] }), 'toda llamada de agente con workflow_id').ok).toBe(false)
  })
})

describe('J6 · la llave interna y la acción despertar (condición §10.1: nadie toca la llave de despacho)', () => {
  const src = (f: string) => fs.readFileSync(f, 'utf8')
  const codigo = (s: string) => s.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10))
  it('el guion y el núcleo NO leen ni mandan la llave de despacho ni llaman al webhook de n8n: usan x-api-key y la acción «despertar» de la ruta de turnos', () => {
    for (const f of ['scripts/ops/jefatura-prueba-real.mjs', 'scripts/ops/jefatura-prueba-real/nucleo.mjs']) {
      const c = codigo(src(f))
      expect(c).not.toMatch(/SALA_DISPATCH_KEY|x-sala-dispatch-key|N8N_WEBHOOK_BASE|zero-risk\/jefatura-turno/)
    }
    const cli = codigo(src('scripts/ops/jefatura-prueba-real.mjs'))
    expect(cli).toContain("process.env.INTERNAL_API_KEY"); expect(cli).toContain("'x-api-key': LLAVE"); expect(cli).toContain("accion: 'despertar'")
  })
  it('sin INTERNAL_API_KEY el guion se niega (error 2) aunque exista SALA_DISPATCH_KEY y aunque traiga el «dale»', () => {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x', N8N_API_KEY: 'x', SALA_DISPATCH_KEY: 'x', N8N_BASE_URL: 'http://127.0.0.1:9', APP_URL: 'http://127.0.0.1:9', INTERNAL_API_KEY: '' }
    const r = spawnSync(process.execPath, ['scripts/ops/jefatura-prueba-real.mjs', 'correr', '--aplicar', '--dale-de-emilio', '2026-10-15'], { encoding: 'utf8', env })
    expect(r.status).toBe(2); expect(r.stderr).toContain('INTERNAL_API_KEY')
  })
  it('si la ruta no puede despertar al flujo (409, 502…) se anota, no se sigue esperando en vano y se APAGA', async () => {
    const T = transporte({ despertarStatus: 409 })
    const r = await correrLaPruebaReal({ T, ...base })
    expect(r.revisiones[0].ok).toBe(false); expect(r.revisiones[0].error).toMatch(/no pudo despertar al flujo \(409\)/)
    expect(r.apagado).toBe(true); expect(r.ok).toBe(false)
    expect(T.llamadas.filter((x) => x.t === 'llamar:revisiones' && x.a.accion === 'leer')).toHaveLength(0)
  })
})

describe('J6 · el éxito exige TODO, cada condición por separado (R2 de CC#3)', () => {
  const bueno = () => ({ revisiones: [{ ok: true }, { ok: true }], contadores: { ok: true }, parada: null, apagado: true, gasto_total_usd: 0.5 })
  it('la prueba buena es exitosa', () => { expect(esExitosa(bueno())).toBe(true) })
  for (const [caso, cambia] of [
    ['sin ninguna revisión', (r: Json) => { r.revisiones = [] }],
    ['una revisión con evidencia incompleta', (r: Json) => { r.revisiones[1].ok = false }],
    ['contadores fuera de orden', (r: Json) => { r.contadores.ok = false }],
    ['la prueba se cortó (parada) aunque todo lo demás esté bien', (r: Json) => { r.parada = 'se cortó' }],
    ['no quedó apagado', (r: Json) => { r.apagado = false }],
    ['el gasto total pasó de US$ 0,70', (r: Json) => { r.gasto_total_usd = 0.71 }],
  ] as Array<[string, (r: Json) => void]>) {
    it(`${caso} → NO es exitosa`, () => { const r = bueno(); cambia(r); expect(esExitosa(r)).toBe(false) })
  }
  it('el gasto justo en el tope (0,70) sí vale; un valor que no es número no vale', () => { const r = bueno(); r.gasto_total_usd = 0.7; expect(esExitosa(r)).toBe(true); r.gasto_total_usd = NaN; expect(esExitosa(r)).toBe(false) })
  it('la corrida real usa esa regla: con la parada puesta y TODO lo demás bien, ok es falso', async () => {
    const T = transporte({ lecturas: [[{ estado: 'en_paso', gasto_usd: 0.9 }]], evidencia: (id) => evidenciaOk(id), contadoresDespues: { agent_invocations_costo_usd_de_los_clientes_de_practica: 0.11 } })
    const r = await correrLaPruebaReal({ T, ...base })
    expect(r.parada).toBeTruthy(); expect(r.revisiones[0].ok).toBe(true); expect(r.contadores.ok).toBe(true); expect(r.apagado).toBe(true); expect(r.ok).toBe(false)
  })
})

describe('J6 · los contadores', () => {
  it('lo que debe seguir igual: bandeja, salidas, aprobaciones del editor viejo y llamadas sin workflow', () => {
    expect(compararContadores(cont(), cont({ agent_invocations_total: 104, agent_invocations_costo_usd_de_los_clientes_de_practica: 0.23 }), { gasto_esperado_usd: 0.23 }).ok).toBe(true)
    for (const k of ['hitl_queue_total', 'client_historical_outputs_total', 'hitl_queue_editor_escalation', 'agent_invocations_workflow_id_nulo']) {
      const r = compararContadores(cont(), cont({ [k]: 99 }), { gasto_esperado_usd: 0 })
      expect(r.ok).toBe(false); expect(r.fallos.join(' ')).toContain(k)
    }
  })
  it('el libro no puede subir mucho más de lo que declaran las revisiones, ni bajar', () => {
    expect(compararContadores(cont(), cont({ agent_invocations_costo_usd_de_los_clientes_de_practica: 2 }), { gasto_esperado_usd: 0.2 }).ok).toBe(false)
    expect(compararContadores(cont(), cont({ agent_invocations_total: 90 }), { gasto_esperado_usd: 0 }).ok).toBe(false)
  })
})

describe('J6 · el aviso para Emilio', () => {
  const a = avisoParaEmilio()
  it('trae lo que pide el método (qué corre, cuánto cuesta, cuánto tarda, qué prueba, qué riesgo) y el «dale»', () => {
    for (const k of ['Qué corre', 'Cuánto cuesta', 'Cuánto tarda', 'Qué prueba', 'Riesgo', '«dale»']) expect(a).toContain(k)
  })
  it('dinero con coma, tuteo, sin voseo y sin jerga de código en el texto principal (los identificadores van en la nota técnica)', () => {
    expect(a).toMatch(/US\$ 0,50/); expect(a).toMatch(/US\$ 0,70/); expect(a).not.toMatch(/US\$ \d+\.\d/)
    const principal = a.split('*(técnico')[0]
    expect(principal).not.toMatch(/\b(vos|tenés|sabés|decime|querés)\b/i)
    for (const t of ['dry_run', 'endpoint', 'workflow', 'n8n', 'PR ', 'merge', 'commit', 'tipos_activos', 'env var']) expect(principal).not.toContain(t)
    expect(a).toMatch(/\*\(técnico · J6/)
    expect(a).not.toMatch(/naufrago/i)
  })
  it('con lo medido en el ensayo reemplaza el cálculo del diseño', () => { const m = avisoParaEmilio({ medidas: { costo_por_revision_usd: 0.31 } }); expect(m).toContain('US$ 0,62'); expect(m).toContain('US$ 0,31 por revisión'); expect(m).not.toContain('cálculo del diseño') })
  it('nombra el riesgo de «sin segunda mirada» y que se apaga sola', () => { expect(a).toMatch(/sin segunda mirada/); expect(a).toMatch(/se apaga sola/) })
})

describe('J6 · el guion no toca lo que no debe', () => {
  it('no escribe llaves ni nombra a naufrago.ec y los clientes de la prueba tienen su propio prefijo (no se mezclan con el seco)', async () => {
    const fs = await import('node:fs')
    for (const f of ['scripts/ops/jefatura-prueba-real.mjs', 'scripts/ops/jefatura-prueba-real/nucleo.mjs']) {
      const s = fs.readFileSync(f, 'utf8')
      // (los comentarios dicen «nada de naufrago.ec»; el código no lo nombra)
      expect(s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')).not.toMatch(/naufrago/i); expect(s).not.toMatch(/[0-9a-f]{64}/); expect(s).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
      expect(s).not.toMatch(/jefatura-seco\.mjs/)
    }
    expect(CLIENTES_REALES.every((c: Json) => c.id.startsWith('prueba-jefatura-real-'))).toBe(true)
    expect(UUID.length).toBe(36)
  })
  it('lo único que escribe la CLI en la base es jefatura_config (y borra solo en `limpiar`, con respaldo, de sus 2 clientes)', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('scripts/ops/jefatura-prueba-real.mjs', 'utf8')
    const escritos = [...s.matchAll(/method: '(PATCH|POST|DELETE|PUT)'/g)].length
    expect(escritos).toBeGreaterThan(0)
    expect([...s.matchAll(/\/rest\/v1\/(\w+)/g)].map((m) => m[1]).filter((t) => !['jefatura_config', 'jefatura_fichas', 'jefatura_pasos', 'jefatura_revisiones', 'agent_invocations', 'hitl_queue', 'hitl_pending_approvals', 'client_historical_outputs'].includes(t))).toEqual([])
    expect(s).toContain('respaldo-jefatura-j6.json')
    expect(s).not.toMatch(/DELETE.*agent_invocations/)
  })
})
