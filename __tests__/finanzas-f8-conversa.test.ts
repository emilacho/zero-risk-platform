/**
 * OFICINA FINANCIERA · F8 «la oficina conversa» (CC#1 · 14-oct) · todo SIMULADO: modelo guionado, Slack falso, base en memoria. US$ 0, 0 envíos.
 * Caso de oro (hilo de la prueba): planteo → especialistas → ajuste → cálculo → jefe → firma. Más: omisión por canal (R11), tope US$ 1,50, 2 rondas máximo,
 * Slack caído, formato roto (reintento y degradado), apagado = 409, una conversación abierta por cliente, procedencia de ensayo, el contrato del pedido corto.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { armarPedidoRunSdk, esWorkflowIdValido, modeloRunSdk } from '../src/lib/finanzas/conversa/modelo-run-sdk'
import { abrirConversacion, avanzar, pedidoDelAgente } from '../src/lib/finanzas/conversa/orquestador'
import { especialistasQueHablan } from '../src/lib/finanzas/conversa/omision'
import { AGENTES, PLANTILLA_FINANCIERA, validarPlantillaFinanciera } from '../src/lib/finanzas/conversa/plantilla'
import { extraerJson, sanearProcedencia, validarAcuerdo, validarConsulta, validarPlanteo } from '../src/lib/finanzas/conversa/esquemas'
import type { AlmacenDeConversa, CambiosDeEncargo, EncargoDeConversa, PedidoAlModelo, PuertosDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import type { ConfigDeFinanzas } from '../src/lib/finanzas/ruta'

const CLIENTE = 'cliente-prueba'
const rango = (min: number, max: number, base?: number) => ({ min, max, ...(base !== undefined ? { base } : {}) })
const PLANTEO = { meta_por_semana: 14, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 1 }], produccion: { fraccion: 0.2 }, no_se: ['la tasa de cierre real'] }
const FPA = { agente: 'finance-fpa-analyst', resumen: 'supuestos de negocio', supuestos: { ticket: rango(10, 14, 12), margen: rango(0.5, 0.6, 0.55), tasa_cierre: rango(0.25, 0.35, 0.3) }, preguntas_a_otros: [], alertas: [] }
const REDES = { agente: 'paid_media_paid_social_strategist', resumen: 'costos de redes', supuestos: { costo_por_resultado: rango(0.4, 1.2, 0.8) }, preguntas_a_otros: [], alertas: [] }
const BUSQ = { agente: 'paid_media_ppc_strategist', resumen: 'búsqueda diferida', supuestos: {}, preguntas_a_otros: [], alertas: [] }
const MEDI = { agente: 'tracking-specialist', resumen: 'qué cuenta como resultado', supuestos: {}, preguntas_a_otros: [], alertas: [] }
const ACUERDO_OK = { salida: 'sale', hallazgos: [], conflictos_resueltos: [], preguntas_a_emilio: [] }

type Guion = Record<string, unknown[] | ((p: PedidoAlModelo, n: number) => unknown)>
function mundo(opts: { conversa?: ConfigDeFinanzas['conversa']; estado?: ConfigDeFinanzas['estado']; guion?: Guion; slackCaido?: boolean; costoPorLlamada?: number; invocacionEnElLibro?: boolean; canal?: string } = {}) {
  const encargos = new Map<string, EncargoDeConversa>()
  const turnos: TurnoDeConversa[] = []
  const arts: Record<string, Record<string, unknown>> = {}
  const c = { llamadas: [] as PedidoAlModelo[], publicados: [] as string[], lecturas: 0, tableros: 0, firmas: 0, invocaciones: [] as string[] }
  const guion: Guion = { 'campaign-brief-agent': [PLANTEO, PLANTEO], 'finance-fpa-analyst': [FPA, FPA], paid_media_paid_social_strategist: [REDES, REDES], 'paid_media_ppc_strategist': [BUSQ], 'tracking-specialist': [MEDI, MEDI], 'chief-financial-officer': [ACUERDO_OK, ACUERDO_OK], ...(opts.guion ?? {}) }
  const cuenta: Record<string, number> = {}
  let seq = 0
  const almacen: AlmacenDeConversa = {
    async crearEncargo(n) {
      const abierto = [...encargos.values()].find((e) => e.client_id === n.client_id && (e.estado === 'abierto' || e.estado === 'en_curso'))
      if (abierto) return { ok: true, encargo: structuredClone(abierto), nuevo: false }
      const e: EncargoDeConversa = { id: `enc-${++seq}`, client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: n.dry_run, semilla: n.semilla }
      encargos.set(e.id, e)
      return { ok: true, encargo: structuredClone(e), nuevo: true }
    },
    async leerEncargo(id) { const e = encargos.get(id); return e ? structuredClone(e) : null },
    async guardar(ch: CambiosDeEncargo) {
      const e = encargos.get(ch.encargo_id)!
      e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd
      for (const k of ['estado', 'slack_canal', 'slack_ts', 'leido_hasta', 'tablero_id'] as const) if (ch[k] !== undefined) (e as any)[k] = ch[k]
      if (ch.turno) turnos.push(structuredClone(ch.turno))
      if (ch.artefacto) arts[ch.artefacto.tipo] = structuredClone(ch.artefacto.contenido)
    },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return structuredClone(turnos) },
  }
  const P: PuertosDeConversa = {
    almacen,
    modelo: {
      async invocar(p) {
        c.llamadas.push(p)
        const g = guion[p.agente]
        const k = (cuenta[p.agente] = (cuenta[p.agente] ?? 0) + 1)
        const v = typeof g === 'function' ? g(p, k) : (g ?? [])[Math.min(k - 1, (g ?? []).length - 1)]
        if (v === undefined) return { ok: false, error: 'sin_guion', costo_usd: 0 }
        return { ok: true, salida: typeof v === 'string' ? v : JSON.stringify(v), costo_usd: opts.costoPorLlamada ?? 0.1 }
      },
    },
    slack: {
      async publicar(p) { if (opts.slackCaido) return { ok: false }; c.publicados.push(p.texto); return { ok: true, ts: '1700000000.000100' } },
      async leer(p) { c.lecturas++; return { ok: true, mensajes: [], leido_hasta: p.desde_ts } },
    },
    tableros: {
      async guardarTablero() { c.tableros++; return { id: `tab-${c.tableros}`, version: c.tableros } },
      async actualizarTablero() { c.firmas++ },
      async invocacionDelJefe(p) { c.invocaciones.push(p.invocacion_id); return opts.invocacionEnElLibro !== false },
    },
    async config() { return { estado: opts.estado ?? 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: opts.conversa ?? 'enciende' } },
    ahora: () => new Date('2026-10-14T12:00:00Z'),
    canalDelHilo: opts.canal ?? 'C-PRIVADO',
    emilio_id: 'U-EMILIO',
  }
  return { P, c, encargos, turnos, arts }
}
async function abrir(m: ReturnType<typeof mundo>, extra: Record<string, unknown> = {}) {
  const r = await abrirConversacion(m.P, { client_id: CLIENTE, dry_run: false, semilla: { evento: 'mensaje', dias_activos_por_semana: 7 }, ...extra })
  return r
}
async function correrTodo(m: ReturnType<typeof mundo>, id: string, max = 30) {
  const pasos: string[] = []
  for (let i = 0; i < max; i++) {
    const r = await avanzar(m.P, id)
    if (r.status !== 200) return { r, pasos }
    if (typeof r.cuerpo.paso === 'string') pasos.push(r.cuerpo.paso)
    if (r.cuerpo.terminado) return { r, pasos }
  }
  throw new Error('no terminó')
}

describe('F8 · apagada', () => {
  it('con `conversa` apagado, abrir y avanzar devuelven 409 sin tocar nada', async () => {
    const m = mundo({ conversa: 'apagado' })
    expect((await abrir(m)).status).toBe(409)
    expect((await avanzar(m.P, 'x')).status).toBe(409)
    expect(m.encargos.size).toBe(0)
    expect(m.c.llamadas).toHaveLength(0)
  })
  it('con la oficina apagada también (aunque `conversa` esté encendido)', async () => {
    const m = mundo({ estado: 'apagada' })
    expect((await abrir(m)).status).toBe(409)
  })
  it('en ensayo solo entran los clientes de la lista', async () => {
    const m = mundo({ conversa: 'ensayo' })
    expect((await abrir(m)).status).toBe(409)
  })
  it('exige dry_run booleano, client_id y semilla', async () => {
    const m = mundo()
    expect((await abrirConversacion(m.P, { client_id: CLIENTE, semilla: {} })).status).toBe(400)
    expect((await abrirConversacion(m.P, { client_id: '', dry_run: false, semilla: {} })).status).toBe(400)
    expect((await abrirConversacion(m.P, { client_id: CLIENTE, dry_run: false })).status).toBe(400)
    expect((await abrirConversacion(m.P, 'x')).status).toBe(400)
  })
  it('una semilla enorme se rechaza con 413', async () => {
    const m = mundo()
    expect((await abrirConversacion(m.P, { client_id: CLIENTE, dry_run: false, semilla: { ficha_resumen: 'x'.repeat(41_000) } })).status).toBe(413)
  })
})

describe('F8 · caso de oro (agentes simulados)', () => {
  it('planteo → especialistas → ajuste → cálculo → jefe → firma, sin ronda 2', async () => {
    const m = mundo()
    const a = await abrir(m)
    const id = String(a.cuerpo.encargo_id)
    const { r, pasos } = await correrTodo(m, id)
    expect(r.cuerpo.estado).toBe('cerrado')
    expect(pasos).toEqual(['abrir', 'planteo', 'fpa', 'redes', 'medicion', 'ajuste', 'calculo', 'cierre', 'firma'])
    // la búsqueda pagada no figura en el plan → no se llamó
    expect(m.c.llamadas.map((l) => l.agente)).toEqual(['campaign-brief-agent', 'finance-fpa-analyst', 'paid_media_paid_social_strategist', 'tracking-specialist', 'campaign-brief-agent', 'chief-financial-officer'])
    expect(m.c.tableros).toBe(1)
    expect(m.c.firmas).toBe(1)
    expect(m.arts.cierre.estado).toBe('firmado')
    expect(m.arts.cierre.salida).toBe('sale')
    expect(m.encargos.get(id)!.gasto_usd).toBeLessThanOrEqual(1.5)
  })
  it('el hilo recibe un turno por paso y la raíz una sola vez', async () => {
    const m = mundo()
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    expect(m.c.publicados.filter((t) => t.startsWith('🧵'))).toHaveLength(1)
    expect(m.c.publicados.length).toBe(9 + 1)
  })
  it('en seco no publica ni guarda tablero', async () => {
    const m = mundo()
    const id = String((await abrir(m, { dry_run: true })).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(r.cuerpo.estado).toBe('cerrado')
    expect(m.c.publicados).toHaveLength(0)
    expect(m.c.tableros).toBe(0)
    expect(m.arts.cierre.escribio).toBe(false)
  })
  it('una sola conversación abierta por cliente: abrir dos veces devuelve la misma', async () => {
    const m = mundo()
    const a = await abrir(m), b = await abrir(m)
    expect(b.cuerpo.encargo_id).toBe(a.cuerpo.encargo_id)
    expect(b.cuerpo.nuevo).toBe(false)
  })
  it('un encargo terminado no vuelve a correr', async () => {
    const m = mundo()
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    const n = m.c.llamadas.length
    const r = await avanzar(m.P, id)
    expect(r.cuerpo.terminado).toBe(true)
    expect(m.c.llamadas.length).toBe(n)
  })
  it('un encargo inexistente es 404', async () => {
    expect((await avanzar(mundo().P, 'nada')).status).toBe(404)
  })
})

describe('F8 · omisión por canal (R11)', () => {
  it('sin pauta solo habla FP&A; no hay bloque y el plan sigue', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [{ ...PLANTEO, canales: [{ canal: 'base_propia', peso: 1 }] }] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r, pasos } = await correrTodo(m, id)
    expect(pasos).not.toContain('redes')
    expect(pasos).not.toContain('medicion')
    expect(pasos).not.toContain('cierre')
    expect(m.arts.bloque.motivo).toBe('sin_pauta')
    expect(m.c.tableros).toBe(0)
    expect(r.cuerpo.estado).toBe('sin_acuerdo')
  })
  it('especialistasQueHablan: función pura del catálogo', () => {
    expect(especialistasQueHablan([{ canal: 'meta_ig' }])).toMatchObject({ redes: true, busqueda: false, medicion: true, sin_pauta: false })
    expect(especialistasQueHablan([{ canal: 'meta_ig' }, { canal: 'busqueda_pagada', activo: false }]).busqueda).toBe(true)
    expect(especialistasQueHablan([{ canal: 'busqueda_local' }]).busqueda).toBe(false)
    expect(especialistasQueHablan([]).sin_pauta).toBe(true)
  })
})

describe('F8 · tope, rondas y formato', () => {
  it('el tope del encargo (US$ 1,50) corta: cierra por tope con lo que hay, nunca bloquea', async () => {
    const m = mundo({ costoPorLlamada: 0.7 })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(['cierre_por_tope', 'cerrado', 'sin_acuerdo']).toContain(r.cuerpo.estado)
    expect(m.encargos.get(id)!.gasto_usd).toBeLessThanOrEqual(1.5 + 0.7)
    expect(m.c.llamadas.length).toBeLessThan(6)
  })
  it('un crítico del jefe abre la ronda 2 (solo el aludido) y NUNCA hay tercera', async () => {
    const critico = { salida: 'sale_con_alerta', hallazgos: [{ severidad: 'critico', que: 'el costo por resultado no cuadra', alude: 'redes' }], conflictos_resueltos: [], preguntas_a_emilio: [] }
    const m = mundo({ guion: { 'chief-financial-officer': [critico, critico, critico], paid_media_paid_social_strategist: [REDES, { ...REDES, supuestos: { costo_por_resultado: rango(0.6, 1.6, 1.1) } }] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r, pasos } = await correrTodo(m, id)
    expect(pasos).toContain('redes_2')
    expect(pasos).not.toContain('fpa_2')
    expect(pasos.filter((p) => p.startsWith('cierre'))).toEqual(['cierre', 'cierre_2'])
    expect(m.c.llamadas.filter((l) => l.agente === 'chief-financial-officer')).toHaveLength(2)
    // una sola corrección: con críticos tras ella, sin firma (el plan sigue)
    expect(m.arts.cierre.estado).toBe('sin_firma')
    expect(r.cuerpo.estado).toBe('sin_acuerdo')
  })
  it('si la ronda 2 no cambia la huella, no hay segundo cierre', async () => {
    const critico = { salida: 'sale_con_alerta', hallazgos: [{ severidad: 'critico', que: 'revisar', alude: 'redes' }], conflictos_resueltos: [], preguntas_a_emilio: [] }
    const m = mundo({ guion: { 'chief-financial-officer': [critico] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { pasos } = await correrTodo(m, id)
    expect(pasos).not.toContain('cierre_2')
  })
  it('formato roto: un reintento; si sigue roto el turno queda «sin supuestos del agente» y la conversación sigue', async () => {
    const m = mundo({ guion: { 'finance-fpa-analyst': ['esto no es json', 'tampoco'] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(m.c.llamadas.filter((l) => l.agente === 'finance-fpa-analyst')).toHaveLength(2)
    expect(m.turnos.find((t) => t.paso === 'fpa')!.estado).toBe('fallo')
    expect(m.arts.consulta_fpa.sin_supuestos_del_agente).toBe(true)
    expect(['cerrado', 'sin_acuerdo']).toContain(r.cuerpo.estado)
  })
  it('el reintento de formato recupera si la segunda respuesta es válida', async () => {
    const m = mundo({ guion: { 'finance-fpa-analyst': ['basura', FPA] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    expect(m.turnos.find((t) => t.paso === 'fpa')!.estado).toBe('hecho')
  })
  it('si el jefe no contesta bien, la salida es «con alerta», sin firma, y el plan sigue', async () => {
    const m = mundo({ guion: { 'chief-financial-officer': ['no es json', 'tampoco'] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(m.arts.cierre.salida).toBe('sale_con_alerta')
    expect(m.arts.cierre.estado).toBe('sin_firma')
    expect(m.arts.cierre.sin_acuerdo).toBe(true)
    expect(r.cuerpo.estado).toBe('sin_acuerdo')
  })
  it('una cifra que manda «sin base» topa la salida: el jefe dice «sale» y sale «con alerta»', async () => {
    const m = mundo()
    const id = String((await abrir(m)).cuerpo.encargo_id)
    for (let i = 0; i < 30; i++) {
      const r = await avanzar(m.P, id)
      if (r.cuerpo.paso === 'cierre') break
    }
    // entre el cierre del jefe y la firma, el bloque guardado declara una cifra que manda sin base
    ;(m.arts.bloque.bloque as any).confianza = { ...(m.arts.bloque.bloque as any).confianza, manda_sin_base: true, nivel: 'sin_base' }
    await correrTodo(m, id)
    expect(m.arts.acuerdo.salida).toBe('sale')
    expect(m.arts.cierre.salida).toBe('sale_con_alerta')
    expect(m.arts.cierre.tope_aplicado).toBe(true)
  })
  it('sin costo por resultado (ni de redes ni de la tabla) NO se inventa uno: sin bloque con motivo «sin_base»', async () => {
    const m = mundo({ guion: { paid_media_paid_social_strategist: [{ ...REDES, supuestos: {} }] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    expect(m.arts.bloque.hay_bloque).toBe(false)
    expect(m.arts.bloque.motivo).toBe('sin_base')
    expect(m.c.tableros).toBe(0)
  })
  it('la firma exige una invocación REAL del jefe en el libro: sin ella, «sin firma» y el plan sigue', async () => {
    const m = mundo({ invocacionEnElLibro: false })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(m.c.invocaciones).toEqual([id + ':cierre'])
    expect(m.arts.cierre.estado).toBe('sin_firma')
    expect(m.arts.cierre.invocacion_verificada).toBe(false)
    expect(r.cuerpo.estado).toBe('sin_acuerdo')
  })
  it('con la invocación en el libro firma y deja el id del turno del jefe', async () => {
    const m = mundo()
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    expect(m.c.invocaciones).toEqual([id + ':cierre'])
    expect(m.arts.cierre.invocacion_verificada).toBe(true)
    expect(m.arts.cierre.estado).toBe('firmado')
  })
  it('el modelo caído (sin guion) no tumba la conversación', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(m.arts.bloque.hay_bloque).toBe(false)
    expect(m.arts.bloque.motivo).toBe('sin_planteo')
    expect(r.status).toBe(200)
  })
  it('un planteo con montos de pauta se rechaza (solo lo calcula finanzas)', () => {
    expect(validarPlanteo({ ...PLANTEO, presupuesto: 500 }).ok).toBe(false)
    expect(validarPlanteo({ ...PLANTEO, costo_por_resultado: 1 }).ok).toBe(false)
    expect(validarPlanteo(PLANTEO).ok).toBe(true)
  })
  it('un jefe que dice «no sale» no es una salida válida', () => {
    expect(validarAcuerdo({ ...ACUERDO_OK, salida: 'no_sale' }).ok).toBe(false)
  })
})

describe('F8 · Slack', () => {
  it('Slack caído no frena la conversación', async () => {
    const m = mundo({ slackCaido: true })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(r.cuerpo.estado).toBe('cerrado')
    expect(m.encargos.get(id)!.slack_ts).toBeNull()
  })
  it('lo que Emilio escribe en el hilo entra como nota, nunca como dato confirmado', async () => {
    const m = mundo()
    m.P.slack.leer = async (p) => ({ ok: true, mensajes: [{ ts: '1700000001.000200', texto: 'el ticket real es 20' }], leido_hasta: '1700000001.000200' })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    const conNota = m.c.llamadas.find((l) => l.tarea.includes('nota del dueño: no es un dato confirmado'))
    expect(conNota).toBeTruthy()
    expect(m.encargos.get(id)!.leido_hasta).toBe('1700000001.000200')
  })
})

describe('ronda 3 de CC#3 · menores de F8', () => {
  it('el tope del turno viaja al corredor (max_budget_usd) y respeta el rango de run-sdk', () => {
    const base = { agente: 'a', tarea: 't', encargo_id: 'e', client_id: 'c', paso: 'p', dry_run: true }
    expect(armarPedidoRunSdk({ ...base, tope_usd: 0.25 }, 'wf-real').max_budget_usd).toBe(0.25)
    expect(armarPedidoRunSdk({ ...base, tope_usd: 0 }, 'wf-real').max_budget_usd).toBeUndefined()
    expect(armarPedidoRunSdk({ ...base, tope_usd: 99 }, 'wf-real').max_budget_usd).toBeUndefined()
  })
  it('con el canal del hilo vacío NO publica nada (ni la raíz ni los turnos)', async () => {
    const m = mundo({ canal: '' })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    const { r } = await correrTodo(m, id)
    expect(m.c.publicados).toHaveLength(0)
    expect(r.cuerpo.estado).toBe('cerrado')
  })
  it('«dado por verificado» no se comprueba: alerta, la confianza no sube y la salida solo es «con alerta»', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [{ ...PLANTEO, dado_por_verificado: ['ficha del mapa', 'Instagram'] }] } })
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    expect(m.arts.acuerdo.salida).toBe('sale')
    expect(m.arts.cierre.salida).toBe('sale_con_alerta')
    expect(m.arts.cierre.tope_aplicado).toBe(true)
    expect(String(m.arts.cierre.alerta_verificado)).toContain('ficha del mapa')
    expect((m.arts.bloque.alertas_de_entrada as string[]).join(' ')).toContain('dio por verificado')
  })
  it('sin «dado por verificado» no hay alerta de verificación', async () => {
    const m = mundo()
    const id = String((await abrir(m)).cuerpo.encargo_id)
    await correrTodo(m, id)
    expect(m.arts.cierre.alerta_verificado).toBeNull()
  })
})

describe('F8 · el pedido corto y la procedencia', () => {
  const paso = PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === 'planteo')!
  it('el pedido del proponente anula sus costumbres: JSON, español, sin herramientas, no es un brief, sin montos', () => {
    const t = pedidoDelAgente(paso, { expediente: { rubro: 'x' } })
    expect(t).toMatch(/NO es un brief/)
    expect(t).toMatch(/SOLO con un objeto JSON/)
    expect(t).toMatch(/español/)
    expect(t).toMatch(/no consultes el Client Brain/)
    expect(t).toMatch(/NO fijes montos de pauta/)
  })
  it('cabe en el contrato de run-sdk y viaja con workflow_id y ejecución propios', () => {
    const p = armarPedidoRunSdk({ agente: AGENTES.proponente, tarea: 'x'.repeat(130_000), encargo_id: 'enc-1', client_id: CLIENTE, paso: 'planteo', tope_usd: 0.15, dry_run: true }, 'AbC123xyz')
    expect(p.task.length).toBeLessThanOrEqual(120_000)
    expect(p.workflow_id).toBe('AbC123xyz')
    expect(p.workflow_execution_id).toBe('enc-1:planteo')
    expect(p.dry_run).toBe(true)
    expect(p.force_restart).toBe(true)
  })
  it('SIMULADO: la identidad de campaign-brief-agent admite la tarea corta (JSON) porque el pedido la declara explícitamente', async () => {
    const vistos: any[] = []
    const modelo = modeloRunSdk({ base: 'https://simulado.invalid', llave: 'k', workflow_id: 'AbC123xyz', fetch: (async (_u: string, init: any) => { vistos.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ output: JSON.stringify(PLANTEO), cost_usd: 0.07 }) } }) as any })
    const r = await modelo.invocar({ agente: AGENTES.proponente, tarea: pedidoDelAgente(paso, {}), encargo_id: 'enc-1', client_id: CLIENTE, paso: 'planteo', tope_usd: 0.15, dry_run: true })
    expect(r.ok).toBe(true)
    expect(vistos[0].agent).toBe('campaign-brief-agent')
    const j = extraerJson((r as any).salida)
    expect(j.ok && validarPlanteo(j.valor).ok).toBe(true)
  })
  it('sin base o sin llave, el adaptador NO llama a la red', async () => {
    let llamado = false
    const f = (async () => { llamado = true; return {} }) as any
    expect((await modeloRunSdk({ base: undefined, llave: 'k', fetch: f, workflow_id: 'wf' }).invocar({ agente: 'a', tarea: 't', encargo_id: 'e', client_id: 'c', paso: 'p', tope_usd: 1, dry_run: true })).ok).toBe(false)
    expect((await modeloRunSdk({ base: 'https://x.invalid', llave: undefined, fetch: f, workflow_id: 'wf' }).invocar({ agente: 'a', tarea: 't', encargo_id: 'e', client_id: 'c', paso: 'p', tope_usd: 1, dry_run: true })).ok).toBe(false)
    expect(llamado).toBe(false)
  })
  it('sin workflow_id real (o con uno mal formado) el adaptador NO llama a la red y lo dice; el literal «finanzas-conversa» ya no existe', async () => {
    let llamado = false
    const f = (async () => { llamado = true; return {} }) as any
    const pedido = { agente: 'a', tarea: 't', encargo_id: 'e', client_id: 'c', paso: 'p', tope_usd: 1, dry_run: true }
    for (const w of [undefined, '', 'con espacio', 'x'.repeat(101), 'a/b', '<script>']) {
      const r = await modeloRunSdk({ base: 'https://x.invalid', llave: 'k', fetch: f, workflow_id: w as any }).invocar(pedido)
      expect(r.ok, String(w)).toBe(false)
      expect((r as any).error).toBe('sin_workflow_id')
    }
    expect(llamado).toBe(false)
    expect(esWorkflowIdValido('AbC_123-xyz')).toBe(true)
    expect(esWorkflowIdValido(42)).toBe(false)
    expect(fs.readFileSync(path.join(__dirname, '..', 'src/lib/finanzas/conversa/modelo-run-sdk.ts'), 'utf8')).not.toMatch(/['"]finanzas-conversa['"]/)
  })
  it('un dato de ensayo nunca entra como medido', () => {
    const d = [{ clave: 'a', valor: 1, procedencia: 'de_ensayo' as const, fuente: 'f' }, { clave: 'b', valor: 2, procedencia: 'medido' as const, fuente: 'g' }]
    expect(sanearProcedencia(d, false)[0].procedencia).toBe('supuesto')
    expect(sanearProcedencia(d, true)[1].procedencia).toBe('supuesto')
    expect(sanearProcedencia(d, false)[1].procedencia).toBe('medido')
  })
  it('la plantilla es válida y respeta tope, rondas y agentes', () => {
    expect(validarPlantillaFinanciera()).toEqual([])
    expect(validarPlantillaFinanciera({ ...PLANTILLA_FINANCIERA, limites: { ...PLANTILLA_FINANCIERA.limites, tope_encargo_usd: 2 } }).length).toBeGreaterThan(0)
    expect(validarPlantillaFinanciera({ ...PLANTILLA_FINANCIERA, limites: { ...PLANTILLA_FINANCIERA.limites, max_rondas: 3 } }).length).toBeGreaterThan(0)
    expect(validarPlantillaFinanciera({ ...PLANTILLA_FINANCIERA, pasos: PLANTILLA_FINANCIERA.pasos.map((p) => (p.clave === 'fpa' ? { ...p, quien: 'otro-agente' } : p)) }).length).toBeGreaterThan(0)
  })
  it('la consulta valida rangos y recorta a 3 preguntas (arreglo del intento 2: ya no tira el turno)', () => {
    const r4 = validarConsulta({ ...FPA, preguntas_a_otros: [1, 2, 3, 4].map((i) => ({ a: 'redes', pregunta: `p${i}` })) })
    expect(r4.ok).toBe(true)
    if (r4.ok) expect(r4.valor.preguntas_a_otros).toHaveLength(3)
    expect(validarConsulta({ ...FPA, supuestos: { ticket: rango(5, 1) } }).ok).toBe(false)
    expect(validarConsulta(FPA).ok).toBe(true)
  })
})

describe('F8 · plan v3 V7 · el ajuste debe responder el equilibrio cuando la meta no lo cubre', () => {
  // una meta de 1 por semana con producción fija de 600/mes no paga el plan: el equilibrio está bastante arriba
  const BAJO = { ...PLANTEO, meta_por_semana: 1, produccion: { monto: 600 } }
  const SIN_RESPUESTA = { ...BAJO }
  const CON_RESPUESTA = { ...BAJO, meta_por_semana: 60, equilibrio_respuesta: { decision: 'subo_la_meta', motivo: 'la meta sube porque con 1 por semana el plan no se paga' } }
  const tareasDelAjuste = (m: ReturnType<typeof mundo>) => m.c.llamadas.filter((l) => l.paso === 'ajuste')
  it('el ajuste ve el equilibrio calculado por código y el pedido declara la obligación', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [BAJO, CON_RESPUESTA] } })
    const r = await abrir(m)
    await correrTodo(m, (r.cuerpo as any).encargo_id)
    const aj = tareasDelAjuste(m)
    expect(aj.length).toBeGreaterThan(0)
    expect(aj[0].tarea).toMatch(/"equilibrio":\{"cubre":false/)
    expect(aj[0].tarea).toMatch(/equilibrio_respuesta/)
  })
  it('una respuesta SIN equilibrio_respuesta se reintenta y, con ella, se acepta y queda en el planteo fijado', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [BAJO, SIN_RESPUESTA, CON_RESPUESTA] } })
    const r = await abrir(m)
    await correrTodo(m, (r.cuerpo as any).encargo_id)
    expect(tareasDelAjuste(m).length).toBe(2)
    expect(tareasDelAjuste(m)[1].tarea).toMatch(/falta equilibrio_respuesta/)
    expect((m.arts.planteo_fijado as any).equilibrio_respuesta?.decision).toBe('subo_la_meta')
  })
  it('si nunca la trae, el planteo (válido) se CONSERVA con `equilibrio_sin_respuesta` y la alerta; la conversación SIGUE: nunca bloquea ni tira el trabajo del paso', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [BAJO, SIN_RESPUESTA, SIN_RESPUESTA] } })
    const r = await abrir(m)
    const fin = await correrTodo(m, (r.cuerpo as any).encargo_id)
    expect(fin.r.status).toBe(200)
    const fijado = m.arts.planteo_fijado as any
    expect(fijado.sin_supuestos_del_agente).toBeUndefined()
    expect(fijado.equilibrio_sin_respuesta).toBe(true)
    expect(fijado.meta_por_semana).toBe(1) // lo que decidió el paso se conserva
    expect(fijado.canales).toEqual(BAJO.canales)
    expect((m.arts.bloque as any).alertas_de_entrada.join(' ')).toMatch(/equilibrio_sin_respuesta/)
    expect(fin.r.cuerpo.terminado).toBe(true)
  })
  it('🔴 31-oct · una respuesta al equilibrio MAL FORMADA (decisión inventada) ya no tira el turno entero: el planteo bueno se conserva marcado (antes: fallo, US$ 0,29 perdidos)', async () => {
    const MAL = { ...BAJO, equilibrio_respuesta: { decision: 'quizas', motivo: 'no sé' } }
    const m = mundo({ guion: { 'campaign-brief-agent': [BAJO, MAL, MAL] } })
    const r = await abrir(m)
    const fin = await correrTodo(m, (r.cuerpo as any).encargo_id)
    expect(fin.r.status).toBe(200)
    const fijado = m.arts.planteo_fijado as any
    expect(fijado.sin_supuestos_del_agente).toBeUndefined()
    expect(fijado.equilibrio_sin_respuesta).toBe(true)
    expect(fijado.equilibrio_respuesta).toBeUndefined()
    expect(fijado.meta_por_semana).toBe(1)
  })
  it('🔴 31-oct · decisión con mayúsculas/espacios («Mantengo la meta») y motivo de más de 400 caracteres: se normalizan y se aceptan al PRIMER intento', async () => {
    const LARGA = { ...BAJO, equilibrio_respuesta: { decision: ' Mantengo la meta ', motivo: 'porque '.repeat(80) } }
    const m = mundo({ guion: { 'campaign-brief-agent': [BAJO, LARGA] } })
    const r = await abrir(m)
    await correrTodo(m, (r.cuerpo as any).encargo_id)
    expect(tareasDelAjuste(m).length).toBe(1)
    const fijado = m.arts.planteo_fijado as any
    expect(fijado.equilibrio_respuesta.decision).toBe('mantengo_la_meta')
    expect(fijado.equilibrio_respuesta.motivo.length).toBeLessThanOrEqual(400)
    expect(fijado.equilibrio_sin_respuesta).toBeUndefined()
  })
  it('control · si SÍ responde, no queda la marca', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [BAJO, CON_RESPUESTA] } })
    const r = await abrir(m)
    await correrTodo(m, (r.cuerpo as any).encargo_id)
    expect((m.arts.planteo_fijado as any).equilibrio_sin_respuesta).toBeUndefined()
  })
  it('control · con una meta que SÍ cubre el equilibrio no se exige nada', async () => {
    const m = mundo({ guion: { 'campaign-brief-agent': [{ ...BAJO, meta_por_semana: 500 }, { ...BAJO, meta_por_semana: 500 }] } })
    const r = await abrir(m)
    await correrTodo(m, (r.cuerpo as any).encargo_id)
    expect(tareasDelAjuste(m).length).toBe(1)
    expect((m.arts.planteo_fijado as any).sin_supuestos_del_agente).toBeUndefined()
  })
})
