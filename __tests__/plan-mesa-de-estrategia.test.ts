/**
 * 04-nov · la mesa de estrategia del plan (GO de Lenovo 18:07Z): marketing decide una vez, y queda un acta.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { mensajeDeCorte } from '../services/agent-runner/src/lib/tope-por-corrida'
import { almacenDeConversa, almacenDeMesa } from '../src/lib/finanzas/conversa/almacen-supabase'
import { mesaEncendida } from '../src/lib/planeacion/mesa/interruptor'
import { sumaDeTopes } from '../src/lib/planeacion/prevuelo'
import type { AlmacenDeConversa, EncargoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { actaParaElRedactor, validarActa, validarAporte } from '../src/lib/planeacion/mesa/acta'
import { claveDelTurno, ESPERAS_DEL_TURNO_MS, INTENTOS_DEL_TURNO, abrirMesa, avanzarMesa, devolverALaMesa, leerMesa, pedidoDelTurno, type PuertosDeMesa } from '../src/lib/planeacion/mesa/orquestador'
import { INSTRUCCION_POR_PASO, INTEGRANTES, PASO_CONSOLIDA, PLANTILLA_MESA, quienHablaEnLaMesa, TOPE_DE_LA_MESA_USD } from '../src/lib/planeacion/mesa/plantilla'

const ACTA = { numero: { meta: 40, por_que: 'x' }, servicio: 's', audiencia: 'a', oferta: 'o', canales: [{ canal: 'whatsapp', peso: 0.9, razon: 'r' }, { canal: 'meta_ig', peso: 0.1, razon: 'r' }], camino: 'c', prueba: 'p', no_se_hace: [{ que: 'TikTok', por_que: 'no' }], no_se: [] }
const PLANTEO = { objetivo: 'o', tesis: 't', canales: [{ canal: 'whatsapp', peso: 0.9, razon: 'r' }], negocio_local: false, no_se: [] }
const APORTE = { resumen: 'r', recomendaciones: [{ que: 'q', razon: 'r' }], costo_por_resultado: { min: 1, max: 2 }, alertas: [] }

function mundo(o: { encendida?: boolean; responder?: (agente: string, paso: string) => unknown } = {}) {
  const encargos = new Map<string, EncargoDeConversa>()
  const arts: Record<string, Record<string, Record<string, unknown>>> = {}
  const turnos: Array<{ encargo: string; paso: string; agente: string | null; estado: string; salida: unknown }> = []
  const llamadas: Array<{ agente: string; paso: string; tarea: string; tope_usd: number }> = []
  let id = 0
  const almacen: PuertosDeMesa['almacen'] = {
    async crearEncargo(n) { const e: EncargoDeConversa = { id: 'm' + ++id, client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: n.dry_run, semilla: n.semilla }; encargos.set(e.id, e); arts[e.id] = {}; return { ok: true, encargo: e, nuevo: true } },
    async encargoDeLaCorrida(c, corrida) { return [...encargos.values()].find((e) => e.client_id === c && e.semilla.corrida === corrida) ?? null },
    async leerEncargo(i) { const e = encargos.get(i); return e ? structuredClone(e) : null },
    async guardar(c) { const e = encargos.get(c.encargo_id)!; e.estado_del_motor = c.estado_del_motor; e.gasto_usd = c.gasto_usd; if (c.estado) e.estado = c.estado; if (c.turno) turnos.push({ encargo: c.encargo_id, paso: c.turno.paso, agente: c.turno.agente, estado: c.turno.estado, salida: c.turno.salida }); if (c.artefacto) arts[c.encargo_id][c.artefacto.tipo] = c.artefacto.contenido },
    async artefactos(i) { return structuredClone(arts[i] ?? {}) },
    async turnos() { return [] },
  }
  const P: PuertosDeMesa = {
    almacen, ahora: () => new Date('2026-11-04T18:00:00Z'), encendida: async () => o.encendida !== false,
    modelo: { async invocar(p: { agente: string; paso: string; tarea: string; tope_usd: number }) { llamadas.push(p); const r = o.responder ? o.responder(p.agente, p.paso) : undefined; const s = r !== undefined ? r : p.paso === PASO_CONSOLIDA ? ACTA : p.paso === 'mesa-estrategia-jefe-marketing' ? PLANTEO : APORTE; return { ok: true, salida: typeof s === 'string' ? s : JSON.stringify(s), costo_usd: 0.1 } } } as never,
  }
  return { P, encargos, arts, turnos, llamadas }
}
const abrir = (P: PuertosDeMesa, x: Record<string, unknown> = {}) => abrirMesa(P, { client_id: 'c', dry_run: false, trabajo_id: 'cor-1', semilla: { manual_completo: { voz: 'cercana' }, datos: [] }, ...x })
const hastaElFin = async (P: PuertosDeMesa, id: string) => { for (let i = 0; i < 20; i++) { const r = await avanzarMesa(P, id); if (r.cuerpo.terminado) return r } throw new Error('no terminó') }

describe('apagada', () => {
  it('🔴 nada corre: ni leer, ni llamar, ni escribir', async () => {
    const m = mundo({ encendida: false })
    for (const r of [await abrir(m.P), await avanzarMesa(m.P, 'x'), await leerMesa(m.P, 'x'), await devolverALaMesa(m.P, 'x', { motivo: 'm' })]) expect(r).toMatchObject({ status: 409, cuerpo: { error: 'mesa_apagada' } })
    expect(m.encargos.size).toBe(0)
    expect(m.llamadas).toEqual([])
  })
  it('🔴 no poder leer el interruptor no es «apagada»', async () => {
    const m = mundo(); m.P.encendida = async () => { throw new Error('caída') }
    expect((await abrir(m.P)).status).toBe(503)
  })
})

describe('la reunión', () => {
  it('🔴 corre de punta a punta, en orden, y termina con el acta', async () => {
    const m = mundo()
    const a = await abrir(m.P)
    const r = await hastaElFin(m.P, a.cuerpo.encargo_id as string)
    expect(r.cuerpo).toMatchObject({ estado: 'cerrado', terminado: true })
    expect((r.cuerpo.acta as { canales: unknown[] }).canales).toHaveLength(2)
    expect(m.llamadas.map((l) => l.paso)).toEqual(['mesa-estrategia-jefe-marketing', 'mesa-estrategia-redes', 'mesa-estrategia-medicion', 'mesa-estrategia-crecimiento', PASO_CONSOLIDA])
    expect(m.llamadas[0].agente).toBe(INTEGRANTES.jefe)
    expect(m.llamadas[4].agente).toBe(INTEGRANTES.jefe)
  })
  it('🔴 todos leen el manual; un aporte no lee a los otros; la reunión los lee todos', async () => {
    const m = mundo()
    await hastaElFin(m.P, (await abrir(m.P)).cuerpo.encargo_id as string)
    expect(m.llamadas[1].tarea).toContain('cercana')
    expect(m.llamadas[2].tarea).not.toContain('aporte_redes')
    expect(m.llamadas[4].tarea).toContain('aporte_redes')
    expect(m.llamadas[4].tarea).toContain('aporte_crecimiento')
  })
  it('🔴 quién más habla lo decide el código, sin nombrar clientes', () => {
    expect(quienHablaEnLaMesa([{ canal: 'whatsapp' }], false)).toEqual({ busqueda: false, seo: false, organico: false })
    expect(quienHablaEnLaMesa([{ canal: 'busqueda_pagada' }], false).busqueda).toBe(true)
    expect(quienHablaEnLaMesa([{ canal: 'busqueda_local' }], false).seo).toBe(true)
    expect(quienHablaEnLaMesa([], true).seo).toBe(true)
    expect(quienHablaEnLaMesa([{ canal: 'redes_organicas' }], false).organico).toBe(true)
  })
  it('🔴 un negocio local también escucha al de SEO; búsqueda solo si la proponen', async () => {
    const m = mundo({ responder: (_a, p) => (p === 'mesa-estrategia-jefe-marketing' ? { ...PLANTEO, negocio_local: true } : undefined) })
    await hastaElFin(m.P, (await abrir(m.P)).cuerpo.encargo_id as string)
    expect(m.llamadas.map((l) => l.paso)).toContain('mesa-estrategia-seo')
    expect(m.llamadas.map((l) => l.paso)).not.toContain('mesa-estrategia-busqueda')
  })
  it('🔴 un aporte que falla se declara y la reunión sigue, sin inventarlo', async () => {
    const m = mundo({ responder: (a) => (a === INTEGRANTES.crecimiento ? 'no es json' : undefined) })
    const r = await hastaElFin(m.P, (await abrir(m.P)).cuerpo.encargo_id as string)
    expect(r.cuerpo).toMatchObject({ estado: 'cerrado', faltan: ['crecimiento'] })
    expect(r.cuerpo.aportes).not.toHaveProperty('crecimiento')
  })
  it('🔴 un aporte con costo mal formado queda sin costo y lo dice', () => {
    const a = validarAporte({ ...APORTE, costo_por_resultado: { min: 5, max: 1 } }, 'x')
    expect(a.ok && a.valor.costo_por_resultado).toBeUndefined()
    expect(a.ok && a.avisos.length).toBe(1)
  })
  it('🔴 sin acta válida la mesa termina sin acuerdo y no entrega nada', async () => {
    const m = mundo({ responder: (_a, p) => (p === PASO_CONSOLIDA ? { ...ACTA, canales: [] } : undefined) })
    const r = await hastaElFin(m.P, (await abrir(m.P)).cuerpo.encargo_id as string)
    expect(r.cuerpo).toMatchObject({ estado: 'sin_acuerdo', acta: null })
  })
  it('🔴 no pasa del tope de la mesa', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await avanzarMesa(m.P, id)
    m.encargos.get(id)!.estado_del_motor.gasto_usd = TOPE_DE_LA_MESA_USD - 0.1
    const r = await avanzarMesa(m.P, id)
    expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', terminado: true })
    expect(m.llamadas).toEqual([])
  })
})

describe('una mesa por corrida', () => {
  it('🔴 abrir dos veces, también ya cerrada, devuelve la misma y no paga otra', async () => {
    const m = mundo()
    const a = await abrir(m.P)
    await hastaElFin(m.P, a.cuerpo.encargo_id as string)
    const n = m.llamadas.length
    const b = await abrir(m.P)
    expect(b.cuerpo).toMatchObject({ encargo_id: a.cuerpo.encargo_id, nuevo: false, terminado: true, estado: 'cerrado' })
    expect((b.cuerpo.acta as { numero: unknown }).numero).toEqual(ACTA.numero)
    await avanzarMesa(m.P, a.cuerpo.encargo_id as string)
    expect(m.llamadas).toHaveLength(n)
  })
  it('🔴 otra corrida abre otra mesa', async () => {
    const m = mundo()
    const a = await abrir(m.P), b = await abrir(m.P, { trabajo_id: 'cor-2' })
    expect(a.cuerpo.encargo_id).not.toBe(b.cuerpo.encargo_id)
  })
  it('🔴 pide corrida: sin ella podría cobrar dos veces', async () => {
    expect((await abrirMesa(mundo().P, { client_id: 'c', dry_run: false, semilla: {} })).status).toBe(400)
  })
})

describe('finanzas la devuelve', () => {
  it('🔴 vuelve a consolidar con el motivo, con el mismo paso, y entrega el acta nueva', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await hastaElFin(m.P, id)
    expect((await devolverALaMesa(m.P, id, { motivo: 'no alcanza', cifra: 900 })).cuerpo).toMatchObject({ devuelta: true, estado: 'en_curso' })
    const n = m.llamadas.length
    await hastaElFin(m.P, id)
    expect(m.llamadas.slice(n).map((l) => l.paso)).toEqual([PASO_CONSOLIDA])
    expect(m.llamadas[n].tarea).toContain('no alcanza')
  })
  it('🔴 una sola vez', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await hastaElFin(m.P, id)
    await devolverALaMesa(m.P, id, { motivo: 'm' })
    await hastaElFin(m.P, id)
    expect((await devolverALaMesa(m.P, id, { motivo: 'm' })).cuerpo).toMatchObject({ error: 'ya_se_devolvio' })
  })
  it('🔴 pide motivo y una mesa cerrada', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    expect((await devolverALaMesa(m.P, id, {})).status).toBe(400)
    expect((await devolverALaMesa(m.P, id, { motivo: 'm' })).cuerpo).toMatchObject({ error: 'mesa_sin_cerrar' })
  })
})

describe('el acta', () => {
  it('🔴 acepta 90 % en un canal: el peso es de marketing', () => { expect(validarActa(ACTA).ok).toBe(true) })
  it('🔴 exige lo que usan los demás', () => {
    for (const k of ['numero', 'servicio', 'audiencia', 'oferta', 'canales', 'camino', 'prueba', 'no_se_hace']) {
      const { [k as keyof typeof ACTA]: _f, ...resto } = ACTA
      expect(validarActa(resto).ok, k).toBe(false)
    }
  })
  it('🔴 los pesos activos suman 1; un canal diferido no cuenta', () => {
    expect(validarActa({ ...ACTA, canales: [{ canal: 'a', peso: 0.5, razon: 'r' }] }).ok).toBe(false)
    expect(validarActa({ ...ACTA, canales: [{ canal: 'a', peso: 1, razon: 'r' }, { canal: 'b', peso: 0.3, razon: 'r', activo: false }] }).ok).toBe(true)
  })
  it('🔴 el redactor recibe cada canal con su razón, lo que no se hace y la orden de no decidir', () => {
    const v = validarActa(ACTA)
    const t = v.ok ? actaParaElRedactor(v.valor) : ''
    expect(t).toContain('whatsapp: 90 %')
    expect(t).toContain('TikTok')
    expect(t).toContain('no vuelvas a decidir')
  })
})

describe('los pasos y los topes', () => {
  it('🔴 el que consolida se llama como lo espera la escena', () => { expect(PASO_CONSOLIDA).toBe('mesa-estrategia-consolida') })
  it('🔴 el tope de la mesa es de US$ 4 y cubre solo la mesa', () => {
    expect(PLANTILLA_MESA.limites.tope_encargo_usd).toBe(4)
    expect(PLANTILLA_MESA.pasos.find((p) => p.clave === PASO_CONSOLIDA)?.tope_usd).toBe(1)
    // los turnos completos caben, con holgura para que un reintento de formato no corte antes del acta
    const suma = PLANTILLA_MESA.pasos.reduce((a, p) => a + p.tope_usd, 0)
    expect(suma).toBeLessThanOrEqual(4)
    expect(fs.readFileSync('src/lib/planeacion/mesa/plantilla.ts', 'utf8')).toContain('SOLO esta mesa')
  })
})

describe('la migración', () => {
  const sql = fs.readFileSync('supabase/migrations/202611041900_mesa_de_estrategia.sql', 'utf8')
  it('🔴 nace apagada y con permisos para el rol del servidor', () => {
    expect(sql).toContain('mesa_de_estrategia boolean not null default false')
    expect(sql).toContain('grant select, insert, update, delete on public.%I to service_role')
    expect(sql).toContain('enable row level security')
  })
  it('🔴 con reversa', () => { expect(fs.existsSync('supabase/reversas/202611041900_mesa_de_estrategia_REVERSA.sql')).toBe(true) })
})

describe('el almacén es el de la oficina, con sus tablas', () => {
  const baseQueAnota = (filas: unknown[]) => {
    const tocadas: string[] = []
    const cadena = (): unknown => new Proxy(function () {}, {
      get: (_o, k) => (k === 'then' ? (res: (v: unknown) => void) => res({ data: filas, error: null }) : k === 'single' ? () => Promise.resolve({ data: { id: 'nuevo', estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, semilla: {} }, error: null }) : cadena()),
      apply: () => cadena(),
    })
    return { tocadas, db: { from: (t: string) => { tocadas.push(t); return cadena() } } as never }
  }
  const vieja = { id: 'v', client_id: 'c', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 0, semilla: { corrida: 'cor-vieja' } }
  it('🔴 la mesa no toca corridas ni esperas de otro: solo sus tablas', async () => {
    const b = baseQueAnota([vieja])
    await almacenDeMesa(b.db).crearEncargo({ client_id: 'c', dry_run: false, semilla: { corrida: 'cor-nueva' } })
    expect([...new Set(b.tocadas)]).toEqual(['estrategia_encargos'])
  })
  it('🔴 finanzas sigue como estaba: cierra lo que pausó', async () => {
    const b = baseQueAnota([vieja])
    await almacenDeConversa(b.db).crearEncargo({ client_id: 'c', dry_run: false, semilla: { corrida: 'cor-nueva' } })
    expect(new Set(b.tocadas)).toEqual(new Set(['finanzas_encargos', 'esperas_del_dueno', 'plan_corridas']))
  })
})

describe('el interruptor', () => {
  const con = (r: unknown) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => r }) }) }) }) as never
  it('🔴 solo true enciende; sin la columna, apagada; otro error lanza', async () => {
    expect(await mesaEncendida(con({ data: { mesa_de_estrategia: true }, error: null }))).toBe(true)
    expect(await mesaEncendida(con({ data: { mesa_de_estrategia: false }, error: null }))).toBe(false)
    expect(await mesaEncendida(con({ data: null, error: null }))).toBe(false)
    expect(await mesaEncendida(con({ data: null, error: { code: '42703', message: 'no existe' } }))).toBe(false)
    await expect(mesaEncendida(con({ data: null, error: { code: '500', message: 'caída' } }))).rejects.toThrow('caída')
  })
  it('🔴 el tope de la mesa solo pesa en el cupo si está encendida', () => {
    const snap = { tope: (t: string) => ({ mesa: 3, recoleccion: 1, oficina: 5, redaccion: 0.4, jefatura: 0.5 } as Record<string, number>)[t] } as never
    expect(sumaDeTopes(snap)).toBe(6.9)
    // con la mesa cuenta también la segunda pasada de finanzas: 3 + 5 × 2 + 0,4 + 0,5 + 1
    expect(sumaDeTopes(snap, true)).toBe(14.9)
  })
})

describe('el plan contra el acta (P21)', () => {
  const codigo = fs.readFileSync('scripts/ops/oficina-marketing/plan-contra-el-acta.js', 'utf8')
  const chequeo = new Function(codigo + '\nreturn _planContraElActa')() as (t: string, c: unknown) => string[]
  // las filas salen de un plan real (corrida 217045)
  const FILAS = '| Meta/Instagram (pauta + marca) | $480 (60%) | $1.130 (60%) | Es el único canal con píxel activo |\n| Búsqueda local (Google Maps y Google Ads local) | $200 (25%) | $471 (25%) | Olón tiene competidor a 100 m |\n'
  const acta = (x: Record<string, unknown> = {}) => ({ acta: { canales: [{ canal: 'meta_ig', peso: 0.6 }, { canal: 'busqueda_local', peso: 0.4 }], no_se_hace: [], ...x } })
  it('🔴 sin acta calla: con la mesa apagada el chequeo no existe', () => { expect(chequeo(FILAS, {})).toEqual([]); expect(chequeo(FILAS, null)).toEqual([]) })
  it('🔴 un canal del plan que no está activo en el acta se marca', () => {
    expect(chequeo(FILAS, acta({ canales: [{ canal: 'meta_ig', peso: 1 }] })).join()).toMatch(/Búsqueda local.*no está activo/)
    expect(chequeo(FILAS, acta({ canales: [{ canal: 'meta_ig', peso: 1 }, { canal: 'mapas', peso: 0.2, activo: false }] })).join()).toMatch(/no está activo/)
  })
  it('🔴 el peso se compara con tolerancia de 5 puntos', () => {
    expect(chequeo(FILAS, acta({ canales: [{ canal: 'meta_ig', peso: 0.9 }, { canal: 'busqueda_local', peso: 0.25 }] })).join()).toMatch(/da 60 %.*acordó 90 %/)
    expect(chequeo(FILAS, acta({ canales: [{ canal: 'meta_ig', peso: 0.65 }, { canal: 'busqueda_local', peso: 0.25 }] }))).toEqual([])
    expect(chequeo(FILAS, acta({ canales: [{ canal: 'meta_ig', peso: 0.66 }, { canal: 'busqueda_local', peso: 0.25 }] }))).toHaveLength(1)
  })
  it('🔴 dos filas del mismo canal se suman', () => {
    expect(chequeo('| Instagram | $100 (30%) |\n| Facebook | $100 (30%) |\n', acta({ canales: [{ canal: 'meta_ig', peso: 0.6 }] }))).toEqual([])
  })
  it('🔴 un porcentaje dentro de una frase no es un reparto', () => {
    expect(chequeo('| Instagram | sube 30% en visitas |\n- El sitio cierra el 0,3% en Google\n', acta({ canales: [{ canal: 'whatsapp', peso: 1 }] }))).toEqual([])
  })
  it('🔴 lo que no se hace, como acción, se marca', () => {
    const a = acta({ no_se_hace: [{ que: 'TikTok', por_que: 'x' }, { que: 'abrir sucursal nueva', por_que: 'x' }] })
    expect(chequeo('- Publicar tres videos en TikTok', a).join()).toMatch(/TikTok.*está en lo que no se hace/)
    expect(chequeo('1. Abrir una sucursal nueva en la costa', a).join()).toMatch(/abrir sucursal nueva/)
  })
  it('🔴 decir que no se hace, o nombrarlo en su sección, no se marca', () => {
    const a = acta({ no_se_hace: [{ que: 'TikTok', por_que: 'x' }] })
    expect(chequeo('- No usaremos TikTok todavía', a)).toEqual([])
    expect(chequeo('## Lo que NO vamos a hacer todavía y por qué\n- TikTok: falta medición\n## Medición\n- Mido el sitio', a)).toEqual([])
    expect(chequeo('En TikTok se ve a la competencia.', a)).toEqual([])
  })
  it('🔴 después de esa sección, vuelve a contar', () => {
    const a = acta({ no_se_hace: [{ que: 'TikTok', por_que: 'x' }] })
    expect(chequeo('## Lo que NO vamos a hacer\n- TikTok\n## Hoja de ruta\n- Publicar en TikTok', a)).toHaveLength(1)
  })
  it('🔴 compila junto al chequeo real, sin chocar nombres', () => {
    const coh = fs.readFileSync('scripts/ops/oficina-marketing/chequeos-de-coherencia.js', 'utf8')
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    expect(() => new AsyncFunction(coh + codigo)).not.toThrow()
  })
})

describe('hallazgos de CC3 sobre #903', () => {
  it.each([['Google Ads', 'busqueda'], ['google_ads', 'busqueda'], ['Búsqueda paga', 'busqueda'], ['busqueda_pagada', 'busqueda'], ['google_search', 'busqueda'], ['SEM', 'busqueda'], ['PPC', 'busqueda'], ['Búsqueda local', 'seo'], ['Google Maps', 'seo'], ['SEO', 'seo'], ['Instagram orgánico', 'organico'], ['TikTok orgánico', 'organico'], ['instagram_organico', 'organico'], ['Contenido en redes', 'organico']] as const)('🔴 «%s» hace hablar a %s', (canal, quien) => {
    expect(quienHablaEnLaMesa([{ canal }], false)[quien]).toBe(true)
  })
  it.each(['WhatsApp', 'Instagram pagado', 'Museo local', 'Semana de ofertas'])('🔴 «%s» no llama a búsqueda, SEO ni orgánico', (canal) => {
    expect(quienHablaEnLaMesa([{ canal }], false)).toEqual({ busqueda: false, seo: false, organico: false })
  })
  it('🔴 la instrucción no da una lista cerrada, y el canal sin especialista se declara', () => {
    expect(INSTRUCCION_POR_PASO.planteo_mesa).toContain('en tus palabras')
    expect(INSTRUCCION_POR_PASO.acta).toContain('no tuvo especialista')
  })
  it('🔴 el tope mira lo cobrado, no solo lo guardado', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await avanzarMesa(m.P, id)
    m.P.almacen.cobrado = async () => TOPE_DE_LA_MESA_USD - 0.05
    expect((await avanzarMesa(m.P, id)).cuerpo).toMatchObject({ estado: 'cierre_por_tope', terminado: true })
    expect(m.llamadas).toEqual([])
  })
  it('🔴 no reintenta pasado el margen: cobraría dos veces', async () => {
    const m = mundo({ responder: () => 'no es json' })
    let ms = 0
    m.P.ahora = () => new Date(ms)
    const invocar = m.P.modelo.invocar
    m.P.modelo.invocar = async (x) => { ms += 200_000; return invocar(x) }
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await avanzarMesa(m.P, id)
    await avanzarMesa(m.P, id)
    expect(m.llamadas).toHaveLength(1)
  })
  it('🔴 dentro del margen sí reintenta el formato', async () => {
    const m = mundo({ responder: () => 'no es json' })
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await avanzarMesa(m.P, id)
    await avanzarMesa(m.P, id)
    expect(m.llamadas).toHaveLength(2)
  })
  it('🔴 con un paso en vuelo no corre el mismo turno dos veces', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    m.P.almacen.tomarPaso = async () => ({ ok: true as const, tomado: false })
    expect(await avanzarMesa(m.P, id)).toMatchObject({ status: 409, cuerpo: { error: 'paso_en_vuelo' } })
    expect(m.turnos).toEqual([])
  })
  it('🔴 suelta el paso al terminar, también si falla', async () => {
    const m = mundo()
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    let soltado = 0
    m.P.almacen.tomarPaso = async () => ({ ok: true as const, tomado: true })
    m.P.almacen.soltarPaso = async () => { soltado++ }
    await avanzarMesa(m.P, id)
    expect(soltado).toBe(1)
    m.P.modelo.invocar = async () => { throw new Error('caída') }
    await expect(avanzarMesa(m.P, id)).rejects.toThrow('caída')
    expect(soltado).toBe(2)
  })
  it('🔴 un pedido demasiado grande lo declara, sin pasar del límite', () => {
    const paso = PLANTILLA_MESA.pasos[1]
    const r = pedidoDelTurno(paso, { expediente: { texto: 'x'.repeat(700_000) } })
    expect(r.length).toBeLessThanOrEqual(600_000)
    expect(r).toMatch(/AVISO: este pedido se recortó; faltan \d+ caracteres/)
    expect(pedidoDelTurno(paso, { expediente: { texto: 'x' } })).not.toContain('AVISO')
  })
})

describe('P21 · hallazgo de CC2: el título natural de la sección', () => {
  const codigo = fs.readFileSync('scripts/ops/oficina-marketing/plan-contra-el-acta.js', 'utf8')
  const chequeo = new Function(codigo + '\nreturn _planContraElActa')() as (t: string, c: unknown) => string[]
  const ctx = { acta: { canales: [{ canal: 'meta_ig', peso: 1 }], no_se_hace: [{ que: 'TikTok', por_que: 'x' }] } }
  it.each(['Lo que no hacemos', 'Lo que NO hacemos', 'Lo que no hagamos'])('🔴 bajo «%s» no marca', (titulo) => { expect(chequeo('## ' + titulo + '\n- TikTok cada semana', ctx)).toEqual([]) })
  it('🔴 la misma viñeta fuera de esa sección sí marca', () => { expect(chequeo('## Hoja de ruta\n- TikTok cada semana', ctx)).toHaveLength(1) })
})

describe('lo que la mesa le entrega a finanzas', () => {
  it('🔴 el acta lleva el costo de cada especialista y quién no aportó', async () => {
    const m = mundo({ responder: (a) => (a === INTEGRANTES.crecimiento ? 'no es json' : undefined) })
    const r = await hastaElFin(m.P, (await abrir(m.P)).cuerpo.encargo_id as string)
    const acta = r.cuerpo.acta as { costos_de_la_mesa: Record<string, unknown>; aportes_que_faltan: string[] }
    expect(acta.costos_de_la_mesa).toMatchObject({ redes: { min: 1, max: 2 }, medicion: { min: 1, max: 2 } })
    expect(acta.aportes_que_faltan).toEqual(['crecimiento'])
    expect(validarActa(acta).ok).toBe(true)
  })
  it('🔴 un aporte sin costo no aparece con costo inventado', async () => {
    const { costo_por_resultado: _c, ...sin } = APORTE
    const m = mundo({ responder: (a, p) => (p !== PASO_CONSOLIDA && p !== 'mesa-estrategia-jefe-marketing' && a === INTEGRANTES.redes ? sin : undefined) })
    const r = await hastaElFin(m.P, (await abrir(m.P)).cuerpo.encargo_id as string)
    expect((r.cuerpo.acta as { costos_de_la_mesa: Record<string, unknown> }).costos_de_la_mesa).not.toHaveProperty('redes')
  })
})

describe('un turno cortado no se pierde', () => {
  const montar = async (fallas: Array<string | { error: string; fallo: string } | null>, paso = PASO_CONSOLIDA) => {
    const m = mundo()
    const original = m.P.modelo.invocar.bind(m.P.modelo)
    const pedidos: Array<Record<string, unknown>> = []
    let i = 0
    m.P.modelo = { async invocar(p) {
      if (p.paso !== paso) return original(p)
      pedidos.push(p as never)
      const f = fallas[i++]
      if (f && typeof f === 'object') return { ok: false, error: f.error, fallo_del_empleado: f.fallo, costo_usd: 0 }
      return f ? { ok: false, error: f, costo_usd: 0 } : original(p)
    } }
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    return { ...m, id, pedidos, hastaPaso: async () => { for (let k = 0; k < 20; k++) { const e = await m.P.almacen.leerEncargo(id); const sig = e!.estado_del_motor.ultimo; const clave = PLANTILLA_MESA.pasos[sig + 1]?.clave; if (clave === paso) return; await avanzarMesa(m.P, id) } throw new Error('no llegó') } }
  }
  it('🔴 lo que midió CC6: un solo 502 en el acta ya no pierde la reunión', async () => {
    const m = await montar(['run_sdk_502', null])
    await m.hastaPaso()
    const r = await avanzarMesa(m.P, m.id)
    expect(r).toMatchObject({ status: 503, cuerpo: { error: 'turno_cortado', paso: PASO_CONSOLIDA, intento: 1 } })
    expect(m.turnos.filter((t) => t.paso === PASO_CONSOLIDA)).toHaveLength(0)
    expect((await hastaElFin(m.P, m.id)).cuerpo).toMatchObject({ estado: 'cerrado' })
    expect(m.pedidos).toHaveLength(2)
  })
  it('al terminar, el turno no deja su marca', async () => {
    const m = await montar(['run_sdk_502', null]); await m.hastaPaso()
    await avanzarMesa(m.P, m.id)
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).toHaveProperty('turno_en_curso')
    await avanzarMesa(m.P, m.id)
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).not.toHaveProperty('turno_en_curso')
  })
  it('la marca de OTRO paso no vale: este turno arranca desde cero y con su cuenta en cero', async () => {
    const m = await montar(['run_sdk_502', 'run_sdk_502', null]); await m.hastaPaso()
    const e = (await m.P.almacen.leerEncargo(m.id))!
    await m.P.almacen.guardar({ encargo_id: m.id, estado_del_motor: { ...e.estado_del_motor, turno_en_curso: { paso: 'otro_paso', intentos: 2 } } as never, gasto_usd: e.gasto_usd, estado: 'en_curso' })
    expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 503, cuerpo: { intento: 1 } })
    expect(m.pedidos[0]).toMatchObject({ reanudar: false })
  })
  it('lo cobrado en el último intento cuenta para el tope', async () => {
    const m = mundo()
    const original = m.P.modelo.invocar.bind(m.P.modelo)
    m.P.modelo = { async invocar(p) { return p.paso === PASO_CONSOLIDA ? { ok: false, error: 'run_sdk_502', costo_usd: 0.2 } : original(p) } }
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    for (let k = 0; k < 20; k++) { const e = await m.P.almacen.leerEncargo(id); if (PLANTILLA_MESA.pasos[e!.estado_del_motor.ultimo + 1]?.clave === PASO_CONSOLIDA) break; await avanzarMesa(m.P, id) }
    const antes = (await m.P.almacen.leerEncargo(id))!.gasto_usd
    await avanzarMesa(m.P, id); await avanzarMesa(m.P, id)
    expect((await m.P.almacen.leerEncargo(id))!.gasto_usd).toBeCloseTo(antes)
    await avanzarMesa(m.P, id)
    expect((await m.P.almacen.leerEncargo(id))!.gasto_usd).toBeCloseTo(antes + 0.2)
  })
  it('la red y el cuerpo cortado cuentan como pasajeros', async () => {
    for (const f of ['red:fetch failed', 'red:cuerpo_cortado', 'run_sdk_500', 'run_sdk_504']) {
      const m = await montar([f, null]); await m.hastaPaso()
      expect((await avanzarMesa(m.P, m.id)).status).toBe(503)
    }
  })
  it('un 4xx no es pasajero: no se repite, como hasta hoy', async () => {
    for (const f of ['run_sdk_429', 'run_sdk_400', 'modelo_no_configurado', 'sin_workflow_id', 'respuesta_sin_texto']) {
      const m = await montar([f, null]); await m.hastaPaso()
      expect((await avanzarMesa(m.P, m.id))).toMatchObject({ status: 200, cuerpo: { degradado: true } })
      expect(m.pedidos).toHaveLength(1)
    }
  })
  it('el primer intento es fresco y el siguiente recoge; misma clave', async () => {
    const m = await montar(['run_sdk_502', null]); await m.hastaPaso()
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect(m.pedidos.map((p) => p.reanudar)).toEqual([false, true])
    expect(m.pedidos.map((p) => p.clave_de_turno)).toEqual([claveDelTurno(m.id, PASO_CONSOLIDA), claveDelTurno(m.id, PASO_CONSOLIDA)])
  })
  it('recogió mal formato: el reintento de formato es fresco, no vuelve a recoger lo mismo', async () => {
    const m = mundo({ responder: (_a, p) => (p === PASO_CONSOLIDA ? (malo++ === 0 ? 'no es json' : ACTA) : undefined) })
    let malo = 0
    const vistos: Array<boolean | undefined> = []
    const o = m.P.modelo.invocar.bind(m.P.modelo); let primera = true
    m.P.modelo = { async invocar(p) { if (p.paso !== PASO_CONSOLIDA) return o(p); vistos.push(p.reanudar); if (primera) { primera = false; return { ok: false, error: 'run_sdk_502', costo_usd: 0 } } return o(p) } }
    const id = (await abrir(m.P)).cuerpo.encargo_id as string
    await hastaElFin(m.P, id)
    expect(vistos).toEqual([false, true, false])
  })
  it('🔴 se acaba: tras ' + INTENTOS_DEL_TURNO + ' intentos el acta termina sin acuerdo, sin intentar más', async () => {
    const m = await montar(['run_sdk_502', 'run_sdk_502', 'run_sdk_502', null]); await m.hastaPaso()
    expect((await avanzarMesa(m.P, m.id)).status).toBe(503)
    expect((await avanzarMesa(m.P, m.id)).status).toBe(503)
    expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 200, cuerpo: { degradado: true } })
    expect((await hastaElFin(m.P, m.id)).cuerpo).toMatchObject({ estado: 'sin_acuerdo' })
    expect(m.pedidos).toHaveLength(INTENTOS_DEL_TURNO)
  })
  it('un aporte que se agota se declara y la reunión sigue, como hasta hoy', async () => {
    const paso = PLANTILLA_MESA.pasos.find((p) => p.clave.startsWith('mesa-estrategia-') && p.clave !== PASO_CONSOLIDA && p.clave !== 'mesa-estrategia-jefe-marketing')!.clave
    const m = await montar(['red:x', 'red:x', 'red:x'], paso); await m.hastaPaso()
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect((await avanzarMesa(m.P, m.id)).cuerpo).toMatchObject({ degradado: true })
    expect((await hastaElFin(m.P, m.id)).cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it('🔴 no se paga dos veces lo que sigue trabajando: en vuelo espera, sin llamar', async () => {
    const m = await montar(['red:cuerpo_cortado', null]); await m.hastaPaso()
    await avanzarMesa(m.P, m.id)
    const preguntas: string[] = []
    m.P.turnoEnVuelo = async (c) => { preguntas.push(c); return true }
    expect(await avanzarMesa(m.P, m.id)).toEqual({ status: 409, cuerpo: { error: 'paso_en_vuelo' } })
    expect(m.pedidos).toHaveLength(1)
    expect(preguntas).toEqual([claveDelTurno(m.id, PASO_CONSOLIDA)])
    // esperar no gasta intentos
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).toMatchObject({ turno_en_curso: { intentos: 1 } })
  })
  it('si ya no sigue, o no se sabe, recoge', async () => {
    for (const r of [async () => false, async () => null, async () => { throw new Error('caída') }]) {
      const m = await montar(['red:x', null]); await m.hastaPaso()
      await avanzarMesa(m.P, m.id)
      m.P.turnoEnVuelo = r as never
      expect((await avanzarMesa(m.P, m.id)).status).toBe(200)
      expect(m.pedidos[1].reanudar).toBe(true)
    }
  })
  it('sin marca no se pregunta: el primer intento no espera a nadie', async () => {
    const m = await montar([null]); await m.hastaPaso()
    m.P.turnoEnVuelo = async () => { throw new Error('no debía preguntar') }
    expect((await avanzarMesa(m.P, m.id)).status).toBe(200)
    expect(m.pedidos[0].reanudar).toBe(false)
  })
  it('la marca es de ese turno: terminado se borra y el siguiente es fresco', async () => {
    const m = await montar(['run_sdk_502', null]); await m.hastaPaso()
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).not.toHaveProperty('turno_en_curso')
  })
  it('🔴 la función murió a medias: la marca ya estaba guardada antes de llamar', async () => {
    const m = await montar([null]); await m.hastaPaso()
    const o = m.P.modelo.invocar
    m.P.modelo = { invocar: async () => { throw new Error('la función murió') } }
    await expect(avanzarMesa(m.P, m.id)).rejects.toThrow()
    m.P.modelo = { invocar: o }
    await avanzarMesa(m.P, m.id)
    expect(m.pedidos[0].reanudar).toBe(true)
  })
  it('una devolución vuelve a consolidar en fresco: no recoge el acta anterior', async () => {
    const m = await montar([null, null]); await hastaElFin(m.P, m.id)
    await devolverALaMesa(m.P, m.id, { motivo: 'no cuadra' })
    await hastaElFin(m.P, m.id)
    expect(m.pedidos.map((p) => p.reanudar)).toEqual([false, false])
  })
  // CC6 y CC7, 05-nov: el corredor deja su punto de control «en curso» cuando el empleado falla; esa fila no significa que siga trabajando
  // #927 · un fallo declarado se repite solo si es PASAJERO: aquí, el proveedor saturado tal como lo escribe el corredor
  const FALLA = { error: 'run_sdk_500', fallo: 'el empleado FALLÓ · API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}} · gastado ≈ US$ 0.0000 · lo escrito hasta ahí es PARCIAL y no se da por respuesta' }
  const SIEMPRE_EN_VUELO = async () => true
  const pasoDeAporte = () => PLANTILLA_MESA.pasos.find((p) => p.clave.startsWith('mesa-estrategia-') && p.clave !== PASO_CONSOLIDA && p.clave !== 'mesa-estrategia-jefe-marketing')!.clave
  it('🔴 el empleado que falló con la fila en curso no se espera en vuelo: se repite (tras su espera), sin reinicio forzado', async () => {
    const m = await montar([FALLA, null]); await m.hastaPaso()
    m.P.turnoEnVuelo = SIEMPRE_EN_VUELO
    expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 503, cuerpo: { error: 'turno_cortado', intento: 1, detalle: `run_sdk_500 · ${FALLA.fallo}`, falla: 'pasajera' } })
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).toMatchObject({ turno_en_curso: { paso: PASO_CONSOLIDA, intentos: 1, termino: true } })
    expect((await avanzarMesa(m.P, m.id)).status).toBe(200)
    expect(m.pedidos).toHaveLength(2)
    // CC7, 05-nov · sin reinicio: si la ruta reventó después de un éxito, se recoge; si falló, la fila sigue «en curso» y el corredor lo corre
    expect(m.pedidos[1].reanudar).toBe(true)
    expect(m.arts[m.id].acta).toBeTruthy()
  })
  it('🔴 un acta que falla siempre termina en tres intentos, sin acuerdo y sin esperar', async () => {
    const m = await montar([FALLA, FALLA, FALLA]); await m.hastaPaso()
    m.P.turnoEnVuelo = SIEMPRE_EN_VUELO
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect((await avanzarMesa(m.P, m.id)).cuerpo).toMatchObject({ degradado: true })
    expect(m.pedidos).toHaveLength(3)
    expect((await hastaElFin(m.P, m.id)).cuerpo).toMatchObject({ estado: 'sin_acuerdo' })
  })
  it('🔴 un aporte que falla siempre se declara y la reunión entrega su acta', async () => {
    const m = await montar([FALLA, FALLA, FALLA], pasoDeAporte()); await m.hastaPaso()
    m.P.turnoEnVuelo = SIEMPRE_EN_VUELO
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect((await avanzarMesa(m.P, m.id)).cuerpo).toMatchObject({ degradado: true })
    m.P.turnoEnVuelo = undefined
    // CC7, 05-nov · el último intento se declara: lo que no llegó se dice
    const quien = pasoDeAporte().slice('mesa-estrategia-'.length)
    expect((await hastaElFin(m.P, m.id)).cuerpo).toMatchObject({ estado: 'cerrado', faltan: [quien] })
  })
  for (const [nombre, fallo] of [['no llega (502 del camino)', 'run_sdk_502'], ['se corta la red', 'red:x']] as const) {
    it(`🔴 un aporte que ${nombre} tres veces también se declara`, async () => {
      const m = await montar([fallo, fallo, fallo], pasoDeAporte()); await m.hastaPaso()
      await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
      expect((await avanzarMesa(m.P, m.id)).cuerpo).toMatchObject({ degradado: true })
      const quien = pasoDeAporte().slice('mesa-estrategia-'.length)
      expect(m.arts[m.id]['aporte_' + quien]).toMatchObject({ sin_aporte: true })
      expect((await hastaElFin(m.P, m.id)).cuerpo).toMatchObject({ faltan: [quien] })
    })
  }
  it('🔴 un planteo que falla siempre se declara como «sin planteo», no como vacío', async () => {
    const m = await montar([FALLA, FALLA, FALLA], 'mesa-estrategia-jefe-marketing'); await m.hastaPaso()
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect((await avanzarMesa(m.P, m.id)).cuerpo).toMatchObject({ degradado: true })
    expect(m.arts[m.id].planteo).toMatchObject({ sin_planteo: true })
  })
  it('🔴 un corte por tope no se repite: con el mismo tope se paga otra vez y termina igual', async () => {
    const m = await montar([{ error: 'run_sdk_500', fallo: mensajeDeCorte(0.4, 0.41) }], pasoDeAporte()); await m.hastaPaso()
    m.P.turnoEnVuelo = SIEMPRE_EN_VUELO
    expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 200, cuerpo: { degradado: true } })
    expect(m.pedidos).toHaveLength(1)
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).not.toHaveProperty('turno_en_curso')
  })
  it('un corte de conexión tras un fallo del empleado vuelve a preguntar si sigue en vuelo', async () => {
    const m = await montar([FALLA, 'red:x', null]); await m.hastaPaso()
    const preguntas: string[] = []
    m.P.turnoEnVuelo = async (c) => { preguntas.push(c); return false }
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect(preguntas).toHaveLength(0)
    await avanzarMesa(m.P, m.id)
    expect(preguntas).toHaveLength(1)
    expect(m.pedidos.map((p) => p.reanudar)).toEqual([false, true, true])
  })
  it('un fallo y luego un corte: el tercer intento pregunta con la hora del fallo, que sobrevive al corte (CC6)', async () => {
    const m = await montar([FALLA, 'red:x', null]); await m.hastaPaso()
    const vistas: Array<string | undefined> = []
    m.P.turnoEnVuelo = async (_c, _cl, desde) => { vistas.push(desde); return false }
    await avanzarMesa(m.P, m.id)
    const fallo_en = ((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor as unknown as { turno_en_curso: { fallo_en?: string } }).turno_en_curso.fallo_en
    expect(typeof fallo_en).toBe('string')
    await avanzarMesa(m.P, m.id)
    expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).toMatchObject({ turno_en_curso: { intentos: 2, fallo_en } })
    expect((await avanzarMesa(m.P, m.id)).status).toBe(200)
    expect(vistas).toEqual([fallo_en])
  })
  it('sin fallo previo se pregunta sin hora: un corte solo sigue esperando lo que trabaja', async () => {
    const m = await montar(['red:x', null]); await m.hastaPaso()
    const vistas: Array<string | undefined> = []
    m.P.turnoEnVuelo = async (_c, _cl, desde) => { vistas.push(desde); return false }
    await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
    expect(vistas).toEqual([undefined])
  })
  it('🔴 la devolución con un corte antes de entrar no recoge el acta anterior: tiene su propia clave', async () => {
    const m = await montar([null, 'run_sdk_502', null]); await hastaElFin(m.P, m.id)
    await devolverALaMesa(m.P, m.id, { motivo: 'no cuadra' })
    await avanzarMesa(m.P, m.id)
    const preguntas: string[] = []
    m.P.turnoEnVuelo = async (c) => { preguntas.push(c); return false }
    await avanzarMesa(m.P, m.id)
    expect(m.pedidos.map((p) => p.reanudar)).toEqual([false, false, true])
    const claves = m.pedidos.map((p) => p.clave_de_turno)
    expect(claves[0]).toBe(claveDelTurno(m.id, PASO_CONSOLIDA))
    expect(claves[1]).toBe(claveDelTurno(m.id, PASO_CONSOLIDA + ':devolucion-1'))
    expect(claves[2]).toBe(claves[1])
    expect(preguntas).toEqual([claves[1]])
  })
  it('la clave no se cruza entre encargos ni entre pasos', () => {
    expect(claveDelTurno('a', 'x')).not.toBe(claveDelTurno('b', 'x'))
    expect(claveDelTurno('a', 'x')).not.toBe(claveDelTurno('a', 'y'))
  })
})

// #927 · decisión de Lenovo 10-nov 16:08Z: permanente no se repite y se declara al momento; pasajero hasta 3 con espera creciente (guardarraíl 2).
// Los textos son los que el corredor y run-sdk escribieron de verdad en el libro de llamadas (lectura de producción 10-nov, ids recortados).
const REALES_PERMANENTES = {
  'saldo agotado': { error: 'run_sdk_500', fallo: 'el modelo respondió 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_x"}' },
  'llave mala (proveedor)': { error: 'run_sdk_500', fallo: 'el modelo respondió 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_x"}' },
  'llave mala (corredor)': { error: 'run_sdk_500', fallo: 'el empleado FALLÓ · Invalid API key · Fix external API key · gastado ≈ US$ 0.0000 · lo escrito hasta ahí es PARCIAL y no se da por respuesta' },
  'modelo no soportado': { error: 'run_sdk_500', fallo: "el empleado FALLÓ · API Error: 400 Claude Code 2.1 does not support this model; version 2.2 or newer is required. Run 'claude update' · gastado ≈ US$ 0.0000 · lo escrito hasta ahí es PARCIAL y no se da por respuesta" },
  'sin clase reconocida': { error: 'run_sdk_500', fallo: 'el proveedor del modelo devolvió un error' },
} as const
const PASAJERAS = {
  'proveedor saturado (529)': { error: 'run_sdk_500', fallo: 'el empleado FALLÓ · API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}} · gastado ≈ US$ 0.0000' },
  'límite de ritmo (429)': { error: 'run_sdk_500', fallo: 'el modelo respondió 429: {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}' },
  'error del proveedor (500)': { error: 'run_sdk_500', fallo: 'el modelo respondió 500: {"type":"error","error":{"type":"api_error","message":"Internal server error"}}' },
} as const

describe('#927 · la falla se separa por clase', () => {
  type Falla = { error: string; fallo?: string } | null
  const montarEn = async (client_id: string, fallas: Falla[], paso = PASO_CONSOLIDA) => {
    const m = mundo()
    const original = m.P.modelo.invocar.bind(m.P.modelo)
    const pedidos: Array<Record<string, unknown>> = []
    const esperas: number[] = []
    let reloj = new Date('2026-11-04T18:00:00Z').getTime()
    m.P.ahora = () => new Date(reloj)
    m.P.esperar = async (ms) => { esperas.push(ms); reloj += ms }
    let i = 0
    m.P.modelo = { async invocar(p) {
      if (p.paso !== paso) return original(p)
      pedidos.push(p as never)
      const f = fallas[i++]
      return f ? { ok: false, error: f.error, ...(f.fallo !== undefined ? { fallo_del_empleado: f.fallo } : {}), costo_usd: 0 } : original(p)
    } }
    const id = (await abrir(m.P, { client_id })).cuerpo.encargo_id as string
    for (let k = 0; k < 20; k++) { const e = await m.P.almacen.leerEncargo(id); if (PLANTILLA_MESA.pasos[e!.estado_del_motor.ultimo + 1]?.clave === paso) break; await avanzarMesa(m.P, id) }
    return { ...m, id, pedidos, esperas, adelantar: (ms: number) => { reloj += ms } }
  }
  // dos clientes de rubros distintos: la clase de la falla no depende del cliente
  for (const cliente of ['cliente-restaurante', 'cliente-clinica']) {
    for (const [nombre, f] of Object.entries(REALES_PERMANENTES)) {
      it(`${cliente} · 🔴 ${nombre}: es PERMANENTE · no se repite, no se espera y se declara en la primera falla`, async () => {
        const m = await montarEn(cliente, [f, null])
        const r = await avanzarMesa(m.P, m.id)
        expect(r).toMatchObject({ status: 200, cuerpo: { degradado: true, falla: 'permanente' } })
        expect(m.pedidos).toHaveLength(1)
        expect(m.esperas).toEqual([])
        expect((await m.P.almacen.leerEncargo(m.id))!.estado_del_motor).not.toHaveProperty('turno_en_curso')
        expect(m.arts[m.id].acta).toMatchObject({ sin_acta: true })
      })
    }
    for (const [nombre, f] of Object.entries(PASAJERAS)) {
      it(`${cliente} · ${nombre}: es PASAJERA · vuelve a pedirse, con la espera de su primera falla`, async () => {
        const m = await montarEn(cliente, [f, null])
        expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 503, cuerpo: { error: 'turno_cortado', falla: 'pasajera', intento: 1, repetir_en_s: ESPERAS_DEL_TURNO_MS[0] / 1000 } })
        expect((await avanzarMesa(m.P, m.id)).status).toBe(200)
        expect(m.pedidos).toHaveLength(2)
        expect(m.esperas).toEqual([ESPERAS_DEL_TURNO_MS[0]])
      })
    }
    it(`${cliente} · 🔴 la espera CRECE: 10 s tras la primera falla, 30 s tras la segunda; la tercera se declara sin esperar más`, async () => {
      const f = PASAJERAS['proveedor saturado (529)']
      const m = await montarEn(cliente, [f, f, f])
      await avanzarMesa(m.P, m.id); await avanzarMesa(m.P, m.id)
      expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 200, cuerpo: { degradado: true, falla: 'pasajera' } })
      expect(m.esperas).toEqual([10_000, 30_000])
      expect(m.pedidos).toHaveLength(INTENTOS_DEL_TURNO)
    })
    it(`${cliente} · la espera se cuenta desde la falla: si quien vuelve a pedir ya esperó, no se espera dos veces`, async () => {
      const m = await montarEn(cliente, [PASAJERAS['límite de ritmo (429)'], null])
      await avanzarMesa(m.P, m.id)
      m.adelantar(4_000)
      await avanzarMesa(m.P, m.id)
      expect(m.esperas).toEqual([6_000])
      const m2 = await montarEn(cliente, [PASAJERAS['límite de ritmo (429)'], null])
      await avanzarMesa(m2.P, m2.id)
      m2.adelantar(60_000)
      await avanzarMesa(m2.P, m2.id)
      expect(m2.esperas).toEqual([])
    })
    it(`${cliente} · un corte sin fallo declarado (la red, un 502 del camino) sigue siendo pasajero y también espera`, async () => {
      for (const f of [{ error: 'red:fetch failed' }, { error: 'run_sdk_502' }]) {
        const m = await montarEn(cliente, [f, null])
        expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 503, cuerpo: { falla: 'pasajera' } })
        await avanzarMesa(m.P, m.id)
        expect(m.esperas).toEqual([ESPERAS_DEL_TURNO_MS[0]])
      }
    })
    it(`${cliente} · 🔴 con el tope ya agotado no se repite ni se espera: se declara como «tope»`, async () => {
      const m = await montarEn(cliente, [{ error: 'run_sdk_500', fallo: mensajeDeCorte(0.4, 0.41) }, null])
      expect(await avanzarMesa(m.P, m.id)).toMatchObject({ status: 200, cuerpo: { degradado: true, falla: 'tope' } })
      expect(m.pedidos).toHaveLength(1)
      expect(m.esperas).toEqual([])
    })
  }
})
