/**
 * LAS PREGUNTAS AL DUEÑO SALEN UNA POR UNA (31-oct · CC#2 · «todo aprobado» de Emilio · ADENDA 1 del encargo de sedes y buzón). US$ 0 · Slack, cerebro y base SIMULADOS.
 * Caso real: en la planeación de Náufrago (30-oct) el jefe de finanzas dejó 5 preguntas; la recomendación de la 3.ª decía «tablero» y el filtro de lenguaje rechazó LAS TRES en silencio
 * (0 mensajes, 0 registros, 0 alarmas). Y el presupuesto de pauta, que el plan declaraba «no sé», nunca fue una pregunta.
 * Aquí: las 5 preguntas REALES (fixture) + el «no sé» real. Se prueba que (1) la jerga se cambia por lo llano en vez de rechazar, (2) lo que no se arregla se rechaza SOLO esa y HABLA
 * (rastro + #alertas, una vez), (3) el presupuesto va primero y no se duplica, (4) el orden es por impacto con tope 3.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { PREGUNTA_DE_PRESUPUESTO, preguntarAlDueno, prepararPreguntas, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { jergaEn, limpiarJerga, limpiarPregunta } from '../src/lib/finanzas/preguntas'
import { slackMdPuerto } from '../src/lib/buzon-dueno/slack-md'
import { avisarAAlertas } from '../src/lib/buzon-dueno/alertas'
import type { CerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'
import type { AlmacenDeConversa, EncargoDeConversa } from '../src/lib/finanzas/conversa/puertos'

const REALES = JSON.parse(readFileSync(join(process.cwd(), '__tests__', 'fixtures', 'finanzas-preguntas-cfo-naufrago-30oct.json'), 'utf8')) as Array<{ clave: string; texto: string; recomendacion: string; supuesto_si_no_responde: string }>
const NO_SE_REAL = ['presupuesto semanal de pauta disponible', 'si tienen Meta Business Manager y pixel de conversion instalado', 'tamano real de la base propia']
const MD = 'D123ABC'

function slackFalso() {
  const llamadas: Array<{ metodo: string; cuerpo?: any }> = []
  const f = (async (url: string, init?: any) => {
    const metodo = new URL(url).pathname.replace('/api/', '')
    llamadas.push({ metodo, cuerpo: init?.body ? JSON.parse(init.body) : undefined })
    const json = (j: unknown) => ({ status: 200, json: async () => j })
    if (metodo === 'chat.postMessage') return json({ ok: true, ts: '1700000000.000100', channel: MD })
    return json({ ok: true, messages: [], has_more: false })
  }) as unknown as typeof fetch
  return { f, llamadas }
}
function mundo(preguntas: unknown[], o: { noSe?: string[]; semilla?: EncargoDeConversa['semilla'] } = {}) {
  const e: EncargoDeConversa = { id: 'enc-12345678', client_id: 'cliente-prueba', estado: 'cierre_por_tope', estado_del_motor: estadoInicial(), gasto_usd: 1.4, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: o.semilla ?? {} }
  const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: preguntas }, ...(o.noSe ? { planteo: { no_se: o.noSe } } : {}) }
  const guardados: any[] = []
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: e, nuevo: false } },
    async leerEncargo() { return structuredClone(e) },
    async guardar() { throw new Error('el buzón no debe tocar el motor') },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return [] },
    async guardarBuzon(c) {
      guardados.push(c)
      if (c.slack_ts !== undefined) e.slack_ts = c.slack_ts
      if (c.slack_canal !== undefined) e.slack_canal = c.slack_canal
      if (c.artefacto) arts[c.artefacto.tipo] = c.artefacto.contenido as Record<string, unknown>
    },
  }
  return { e, almacen, arts, guardados }
}
const cerebro = () => {
  const registradas: any[] = []
  const c: CerebroDelDueno = { async registrarPregunta(p) { registradas.push(p); return { ok: true, estado: 'registrada', pregunta_id: 'pid' } }, async registrarRespuesta() { return { ok: true } } }
  return { c, registradas }
}
function puertos(almacen: AlmacenDeConversa, s: ReturnType<typeof slackFalso>, c: CerebroDelDueno) {
  const alertas: string[] = []
  const P: PuertosDelBuzon = { almacen, slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: 'U_DUENO', fetch: s.f }), cerebro: c, modo: 'envia', ahora: () => new Date(1_700_000_000_000), avisar: async (t) => { alertas.push(t) } }
  return { P, alertas }
}
const q = (clave: string, extra: Record<string, unknown> = {}) => ({ clave, texto: `¿Pregunta ${clave}?`, recomendacion: 'Responde la cifra', supuesto_si_no_responde: 'se supone cero', ...extra })

describe('la jerga se cambia por lo llano en vez de rechazar todo', () => {
  it('limpiarJerga: «tablero» → «cuadro de cifras», respeta mayúscula inicial y no toca palabras más largas', () => {
    expect(limpiarJerga('Revisa el tablero.').texto).toBe('Revisa el cuadro de cifras.')
    expect(limpiarJerga('Tablero listo').texto).toBe('Cuadro de cifras listo')
    expect(limpiarJerga('los tableros y la apicultura').cambiado).toBe(false)
  })
  it('limpiarPregunta solo cambia si así queda SIN errores; lo que no tiene equivalente (nombres internos) se conserva y se rechazará', () => {
    const buena = { clave: 'a', texto: '¿Cuánto?', recomendacion: 'Mira el tablero', supuesto_si_no_responde: 'cero' }
    expect(limpiarPregunta(buena)).toMatchObject({ cambiada: true, q: { recomendacion: 'Mira el cuadro de cifras' } })
    const interna = { clave: 'a', texto: '¿Cuánto en finanzas_tableros?', recomendacion: 'x', supuesto_si_no_responde: 'cero' }
    expect(limpiarPregunta(interna)).toMatchObject({ cambiada: false, q: interna })
  })
  it('🔴 las 5 preguntas REALES de Náufrago: ninguna se rechaza; la 3.ª sale con «cuadro de cifras»; sin jerga en ninguna', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: REALES } })
    expect(r.rechazadas).toEqual([])
    expect(r.limpiadas).toEqual(['ghost_kitchen_estado'])
    const todas = [...r.aprobadas, ...REALES.slice(3).map((x) => x)]
    for (const p of r.aprobadas) for (const campo of [p.texto, p.recomendacion, p.supuesto_si_no_responde]) expect(jergaEn(campo), p.clave).toEqual([])
    expect(r.aprobadas.find((p) => p.clave === 'ghost_kitchen_estado')!.recomendacion).toContain('cuadro de cifras')
    expect(todas.length).toBeGreaterThan(0)
  })
})

describe('el presupuesto va primero, una vez', () => {
  it('🔴 el «no sé el presupuesto» del plan real + las 5 del jefe: primero el presupuesto, luego las 2 primeras del jefe; 3 salen y 3 quedan fuera del tope', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: REALES }, planteo: { no_se: NO_SE_REAL } })
    expect(r.presupuesto_agregado).toBe(true)
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['presupuesto_semanal_pauta', 'linea_base_visitas', 'pixel_y_bm_verificacion'])
    expect(r.sobrantes).toEqual(['ghost_kitchen_estado', 'mix_turistas_habituales', 'tesoro_naufrago_y_base_propia'])
    expect(r.aprobadas[0]).toEqual(PREGUNTA_DE_PRESUPUESTO)
  })
  it('sin «no sé» del presupuesto en el plan no se agrega nada', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: REALES }, planteo: { no_se: ['temporada alta'] } })
    expect(r.presupuesto_agregado).toBe(false)
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['linea_base_visitas', 'pixel_y_bm_verificacion', 'ghost_kitchen_estado'])
  })
  it('si el jefe ya preguntó el presupuesto no se duplica: se SUBE al primer lugar', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: [q('a'), q('b'), { ...q('c'), texto: '¿Cuál es tu presupuesto semanal?' }] }, planteo: { no_se: NO_SE_REAL } })
    expect(r.presupuesto_agregado).toBe(false)
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['c', 'a', 'b'])
  })
  it('si el dueño ya dio el presupuesto (semilla) no se vuelve a preguntar', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: [q('a')] }, planteo: { no_se: NO_SE_REAL } }, { respuestas_del_dueno: [{ clave: 'presupuesto_semanal_pauta', valor: 50, literal: '50' }] })
    expect(r.presupuesto_agregado).toBe(false)
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['a'])
  })
  it('sin preguntas del jefe pero con el «no sé» del presupuesto: sale solo el presupuesto', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: [] }, planteo: { no_se: NO_SE_REAL } })
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['presupuesto_semanal_pauta'])
  })
})

describe('el orden es por impacto, con tope 3', () => {
  it('alto antes que medio antes que bajo; sin impacto = medio; a igual impacto, el orden del jefe', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: [q('baja1', { impacto: 'bajo' }), q('sin1'), q('alta1', { impacto: 'alto' }), q('sin2'), q('alta2', { impacto: 'alto' })] } })
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['alta1', 'alta2', 'sin1'])
    expect(r.sobrantes).toEqual(['sin2', 'baja1'])
  })
  it('un impacto inventado se ignora (cuenta como medio)', () => {
    const r = prepararPreguntas({ acuerdo: { preguntas_a_emilio: [q('a', { impacto: 'urgentisimo' }), q('b', { impacto: 'alto' })] } })
    expect(r.aprobadas.map((p) => p.clave)).toEqual(['b', 'a'])
  })
})

describe('PREGUNTAR de punta a punta', () => {
  it('🔴 las 5 reales + el «no sé»: SALE un mensaje (antes: nada), presupuesto primero, sin «tablero», cerebro con las 3', async () => {
    const m = mundo(REALES, { noSe: NO_SE_REAL }), s = slackFalso(), c = cerebro(), { P, alertas } = puertos(m.almacen, s, cerebro().c)
    const cc = cerebro(); P.cerebro = cc.c
    const r = await preguntarAlDueno(P, 'enc-12345678')
    expect(r.cuerpo).toMatchObject({ enviado: true, preguntas: 3, presupuesto_agregado: true, claves: ['presupuesto_semanal_pauta', 'linea_base_visitas', 'pixel_y_bm_verificacion'] })
    const texto: string = s.llamadas.find((l) => l.metodo === 'chat.postMessage')!.cuerpo.text
    expect(texto.indexOf('anuncios pagados')).toBeGreaterThan(-1)
    expect(texto.indexOf('anuncios pagados')).toBeLessThan(texto.indexOf('Loyverse'))
    expect(texto).not.toMatch(/tablero/i)
    expect(cc.registradas.map((x) => x.tema)).toHaveLength(3)
    expect(alertas).toEqual([]) // nada que declarar: todo salió
    expect(c.registradas).toEqual([])
  })
  it('🔴 la 3.ª con «tablero» (caso real) y SIN presupuesto: salen las 3, la limpia incluida, y lo dice (`limpiadas`)', async () => {
    const m = mundo(REALES), s = slackFalso(), cc = cerebro(), { P, alertas } = puertos(m.almacen, s, cc.c)
    const r = await preguntarAlDueno(P, 'enc-12345678')
    expect(r.cuerpo).toMatchObject({ enviado: true, preguntas: 3, limpiadas: ['ghost_kitchen_estado'] })
    const texto: string = s.llamadas.find((l) => l.metodo === 'chat.postMessage')!.cuerpo.text
    expect(texto).toContain('cuadro de cifras'); expect(texto).not.toMatch(/tablero/i)
    expect(alertas).toEqual([])
  })
  it('🔴 una pregunta que NO se puede arreglar se rechaza SOLA: las demás salen, queda el rastro y UNA alarma a #alertas', async () => {
    const mala = q('interna', { texto: '¿Qué dice finanzas_tableros hoy?' })
    const m = mundo([mala, q('buena1'), q('buena2')]), s = slackFalso(), cc = cerebro(), { P, alertas } = puertos(m.almacen, s, cc.c)
    const r = await preguntarAlDueno(P, 'enc-12345678')
    expect(r.cuerpo).toMatchObject({ enviado: true, preguntas: 2, claves: ['buena1', 'buena2'] })
    expect((r.cuerpo as any).rechazadas).toEqual([{ clave: 'interna', errores: [expect.stringContaining('finanzas_')] }])
    expect(cc.registradas).toHaveLength(2)
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatch(/interna/); expect(alertas[0]).toMatch(/Las demás sí salieron/)
    const rastro = m.guardados.find((g) => g.artefacto?.tipo === 'buzon_rechazo')
    expect(rastro?.artefacto.contenido.rechazadas[0].clave).toBe('interna')
    expect(rastro?.slack_ts).toBeUndefined() // el rastro del rechazo NO cuenta como «mensaje enviado» (los topes miran buzon_respuestas)
  })
  it('si TODAS se rechazan: no sale nada, no se registra nada en el cerebro, motivo de siempre + la alarma (antes: silencio)', async () => {
    const m = mundo([q('a', { texto: '¿Qué dice dry_run?' }), q('b', { recomendacion: 'mira client_id' })]), s = slackFalso(), cc = cerebro(), { P, alertas } = puertos(m.almacen, s, cc.c)
    const r = await preguntarAlDueno(P, 'enc-12345678')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'pregunta_mal_formada' })
    expect(s.llamadas).toEqual([]); expect(cc.registradas).toEqual([])
    expect(alertas).toHaveLength(1); expect(alertas[0]).toMatch(/No salió ninguna/)
  })
  it('la misma lista de rechazos NO se avisa dos veces (una alarma por incidente)', async () => {
    const m = mundo([q('a', { texto: '¿Qué dice dry_run?' })]), s = slackFalso(), cc = cerebro(), { P, alertas } = puertos(m.almacen, s, cc.c)
    await preguntarAlDueno(P, 'enc-12345678'); await preguntarAlDueno(P, 'enc-12345678')
    expect(alertas).toHaveLength(1)
  })
  it('sin preguntas y sin «no sé» del presupuesto: `sin_preguntas`, sin alarma', async () => {
    const m = mundo([]), { P, alertas } = puertos(m.almacen, slackFalso(), cerebro().c)
    expect((await preguntarAlDueno(P, 'enc-12345678')).cuerpo).toMatchObject({ enviado: false, motivo: 'sin_preguntas' }); expect(alertas).toEqual([])
  })
  it('un fallo de la alarma o del rastro nunca frena el envío', async () => {
    const m = mundo([q('interna', { texto: 'mira dry_run' }), q('buena')]), s = slackFalso(), cc = cerebro(), { P } = puertos(m.almacen, s, cc.c)
    P.avisar = async () => { throw new Error('slack caído') }
    m.almacen.guardarBuzon = async (c) => { if (c.artefacto?.tipo === 'buzon_rechazo') throw new Error('base caída'); if (c.slack_ts !== undefined) m.e.slack_ts = c.slack_ts; if (c.slack_canal !== undefined) m.e.slack_canal = c.slack_canal }
    expect((await preguntarAlDueno(P, 'enc-12345678')).cuerpo).toMatchObject({ enviado: true, preguntas: 1 })
  })
})

describe('el aviso a #alertas', () => {
  it('manda UNA línea al canal de alertas con la llave en la cabecera (nunca en el cuerpo) y no lanza si Slack cae', async () => {
    const vistas: any[] = []
    const ok = avisarAAlertas({ token: 'xoxb-secreto', fetch: (async (u: string, init: any) => { vistas.push({ u, init }); return { status: 200 } }) as any })
    await ok('hola')
    expect(vistas).toHaveLength(1)
    expect(JSON.parse(vistas[0].init.body)).toEqual({ channel: 'C0B7XUUEBHA', text: 'hola' })
    expect(vistas[0].init.body).not.toContain('xoxb-secreto'); expect(vistas[0].init.headers.authorization).toBe('Bearer xoxb-secreto')
    await expect(avisarAAlertas({ token: 'x', fetch: (async () => { throw new Error('red') }) as any })('x')).resolves.toBeUndefined()
    const sin = avisarAAlertas({ token: '', fetch: (async () => { vistas.push('no') }) as any }); await sin('x'); expect(vistas).toHaveLength(1)
  })
})
