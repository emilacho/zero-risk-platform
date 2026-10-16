/** El vigilante DENTRO del sistema (14-oct): cada condición apaga el flujo y avisa; todo bien = silencio. US$ 0 · sin red (bases y salidas simuladas). */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apagarFlujoDelPortero, avisarAAlertas } from '../avisos'
import { ESPERA_DEL_REINTENTO_MS, esSoloNoPudeComprobar, lineaDeAlerta, problemasDelCierre, rutaVigilar, VEREDICTOS_QUE_NO_ENTREGAN, type DepsDelVigilante } from '../vigilante'
import { crearBaseFalsa } from './base-falsa'
import { POST } from '../../../app/api/brain/alimentar/vigilar/route'

const C = '99999999-9999-4999-8999-999999999999'
const WF = 'ogfq56oIEoHufFPM'
const MIERCOLES = new Date('2026-10-14T13:00:00Z')
const LUNES = new Date('2026-10-19T13:00:00Z')
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const CIERRE_BUENO = { fin: 'hecho', clientes: [{ cliente: C, errores: [], puente: { quedan: 0, vueltas: 0, falla: null }, alimentar: 'hecha', plan_fallo: null }] }
const ficha = (id: string, o: Record<string, unknown> = {}) => ({ id, client_id: C, ref: `portero:sitio:${id}`, clase: 'texto', titulo: 't', contenido: `texto ${id}`, fecha_fuente: null, observado_en: '2026-10-14T09:00:00Z', creado_en: '2026-10-14T09:00:00Z', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null, huella: `h-${id}`, ...o })
const trozo = (id: string) => ({ client_id: C, source_table: 'cerebro_fichas', source_id: id })

/** una base sana: un cliente con alta, rastro «hecha» hoy, 2 fichas con su trozo, sin gasto */
function sana(extra: Record<string, unknown[]> = {}) {
  return {
    clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
    client_brand_books: [{ id: 'mb', client_id: C }],
    client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-14', estado: 'hecha', resumen: { escrituras: { fichas: 2 } }, gasto_modelo_usd: 0.01 }],
    cerebro_fichas: [ficha('a'), ficha('b')],
    client_brain_chunks: [trozo('a'), trozo('b')],
    cerebro_unidades_vistas: [{ client_id: C, ficha_id: 'a', veredicto: 'suma' }, { client_id: C, ficha_id: 'b', veredicto: 'suma' }],
    costs: [], agent_invocations: [], apify_raw: [],
    ...extra,
  }
}
function montar(tablas: Record<string, unknown[]>, o: { apagarOk?: boolean; avisarOk?: boolean; fallaEn?: string } = {}) {
  const base = crearBaseFalsa(tablas as never, { fallaEn: o.fallaEn })
  const apagados: string[] = [], avisos: string[] = []
  const deps = (ahora = MIERCOLES): DepsDelVigilante => ({
    db: base.db, interruptores: ON, ahora, esperar: async () => {},
    apagar: async (w) => { apagados.push(w); return { ok: o.apagarOk !== false, detalle: o.apagarOk === false ? 'n8n no respondió' : 'flujo desactivado' } },
    avisar: async (t) => { avisos.push(t); return { ok: o.avisarOk !== false, detalle: o.avisarOk === false ? 'Slack rechazó' : 'entregado' } },
  })
  return { base, apagados, avisos, deps }
}
const REAL = { dry_run: false, workflow_id: WF, workflow_execution_id: 'ex-1' }
const rastroEscrito = (b: ReturnType<typeof crearBaseFalsa>) => b.escrituras.filter((e) => e.tabla === 'cerebro_portero_corridas' && e.op === 'update')

describe('todo bien = silencio', () => {
  it('no apaga, no avisa, y deja el rastro del vigilante en la fila de hoy', async () => {
    const m = montar(sana())
    const r = await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(m.apagados).toEqual([]); expect(m.avisos).toEqual([])
    const e = rastroEscrito(m.base)
    expect(e).toHaveLength(1)
    expect(e[0].fila).toMatchObject({ resumen: { escrituras: { fichas: 2 }, vigilante: { ok: true, problemas: [], workflow_execution_id: 'ex-1' } } })
  })
  it('dry_run: evalúa y NO escribe, NO apaga y NO avisa (aunque haya problemas)', async () => {
    const m = montar(sana())
    const r = await rutaVigilar(m.deps(), { dry_run: true, cierre: { fin: 'con_errores', clientes: [] } })
    expect(r.status).toBe(200); expect(r.body.ok).toBe(false)
    expect(m.base.escrituras).toEqual([]); expect(m.apagados).toEqual([]); expect(m.avisos).toEqual([])
  })
})

describe('cada condición apaga el flujo y avisa', () => {
  const casos: Array<[string, (t: ReturnType<typeof sana>) => Record<string, unknown[]>, unknown, RegExp, { fallaEn?: string }?]> = [
    ['el cierre no dice «hecho»', (t) => t, { ...CIERRE_BUENO, fin: 'con_errores' }, /cierre de la corrida dice «con_errores»/],
    ['el cierre trae errores del cliente', (t) => t, { fin: 'hecho', clientes: [{ ...CIERRE_BUENO.clientes[0], errores: ['rastro: boom'] }] }, /errores en la corrida: rastro: boom/],
    ['el plan del día falló', (t) => t, { fin: 'hecho', clientes: [{ ...CIERRE_BUENO.clientes[0], plan_fallo: 'sin plan' }] }, /el plan del día falló: sin plan/],
    ['el puente del cierre dejó pendientes', (t) => t, { fin: 'hecho', clientes: [{ ...CIERRE_BUENO.clientes[0], puente: { quedan: 3 } }] }, /el puente dejó 3 pendiente/],
    ['el puente del cierre falló', (t) => t, { fin: 'hecho', clientes: [{ ...CIERRE_BUENO.clientes[0], puente: { quedan: 0, falla: 'ingest-source 502' } }] }, /el puente falló: ingest-source 502/],
    ['alimentar terminó con errores', (t) => t, { fin: 'hecho', clientes: [{ ...CIERRE_BUENO.clientes[0], alimentar: 'con_errores' }] }, /alimentar terminó «con_errores»/],
    ['no hay salida de cierre', (t) => t, undefined, /no entregó la salida del cierre/],
    ['no hay rastro de hoy', (t) => ({ ...t, cerebro_portero_corridas: [] }), CIERRE_BUENO, /no hay rastro de la corrida de hoy/],
    ['el rastro de hoy no está hecha', (t) => ({ ...t, cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-14', estado: 'con_errores', resumen: {} }] }), CIERRE_BUENO, /rastro de hoy dice «con_errores»/],
    ['el gasto del día pasa de US$ 3,00', (t) => ({ ...t, costs: [{ service: 'apify:instagram', amount_usd: 3.4, created_at: '2026-10-14T10:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C }) }] }), CIERRE_BUENO, /gasto del día US\$ 3\.\d\d > 3\.00/],
    ['nació una ficha viva de una unidad AJENA', (t) => ({ ...t, cerebro_fichas: [...t.cerebro_fichas, ficha('x')], client_brain_chunks: [...t.client_brain_chunks, trozo('x')], cerebro_unidades_vistas: [...t.cerebro_unidades_vistas, { client_id: C, ficha_id: 'x', veredicto: 'ajeno' }] }), CIERRE_BUENO, /1 ficha\(s\) viva\(s\) nacieron de una unidad que el filtro no confirmó/],
    ['nació una ficha viva de una unidad SIN CONFIRMAR', (t) => ({ ...t, cerebro_fichas: [...t.cerebro_fichas, ficha('x')], client_brain_chunks: [...t.client_brain_chunks, trozo('x')], cerebro_unidades_vistas: [...t.cerebro_unidades_vistas, { client_id: C, ficha_id: 'x', veredicto: 'sin_confirmar' }] }), CIERRE_BUENO, /no confirmó como propia/],
    ['una ficha viva no tiene trozo en el índice', (t) => ({ ...t, cerebro_fichas: [...t.cerebro_fichas, ficha('x')] }), CIERRE_BUENO, /1 trozo\(s\) por escribir o sacar/],
    ['hay fichas vivas repetidas', (t) => ({ ...t, cerebro_fichas: [...t.cerebro_fichas, ficha('c', { huella: 'h-a' })] }), CIERRE_BUENO, /repetida|por escribir o sacar/],
    ['no se pudo leer el gasto (ante la duda, apagado)', (t) => t, CIERRE_BUENO, /no pude comprobar el gasto del día/, { fallaEn: 'costs' }],
  ]
  for (const [nombre, preparar, cierre, esperado, o] of casos) {
    it(nombre, async () => {
      const m = montar(preparar(sana()), o)
      const r = await rutaVigilar(m.deps(), { ...REAL, cierre })
      expect(r.status).toBe(200)
      expect(r.body.ok).toBe(false)
      expect(m.apagados).toEqual([])
      expect(m.avisos).toHaveLength(1)
      expect(m.avisos[0]).toMatch(/Portero del cerebro · PAUSADO solo para/)
      expect(m.avisos[0]).toMatch(esperado)
      expect(m.avisos[0]).not.toMatch(/\n/) // una línea
    })
  }
  it('la ficha viva de una unidad `suma` (confirmada) NO dispara nada; una ficha RETIRADA de una unidad ajena tampoco', async () => {
    const t = sana()
    t.cerebro_fichas.push(ficha('r', { retirada_en: '2026-10-14T11:00:00Z' }))
    t.cerebro_unidades_vistas.push({ client_id: C, ficha_id: 'r', veredicto: 'ajeno' })
    const m = montar(t)
    const r = await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })
    expect(r.body.ok).toBe(true)
    expect(m.apagados).toEqual([])
  })
  it('una unidad vista otra vez queda `repetida` y apunta a la ficha viva que la representa: eso es lo NORMAL y no dispara nada (122 de 169 en el cliente de prueba)', async () => {
    const t = sana()
    t.cerebro_unidades_vistas.push({ client_id: C, ficha_id: 'a', veredicto: 'repetida' }, { client_id: C, ficha_id: 'b', veredicto: 'repetida' })
    const m = montar(t)
    expect((await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })).body.ok).toBe(true)
    expect(m.apagados).toEqual([])
  })
  it('una ficha de AYER de una unidad ajena no es de esta corrida: no dispara (solo se miran las nacidas hoy)', async () => {
    const t = sana()
    t.cerebro_fichas.push(ficha('v', { creado_en: '2026-10-13T09:00:00Z' }))
    t.client_brain_chunks.push(trozo('v'))
    t.cerebro_unidades_vistas.push({ client_id: C, ficha_id: 'v', veredicto: 'ajeno' })
    const m = montar(t)
    expect((await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })).body.ok).toBe(true)
  })
  it('sin clientes activos que revisar ⇒ problema (no un silencio engañoso)', async () => {
    const m = montar(sana({ clients: [] }))
    const r = await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })
    expect(r.body.ok).toBe(false)
    expect(m.avisos[0]).toMatch(/no hay clientes activos que revisar/)
  })
  it('un cierre del que falta el cliente (el flujo no lo atendió) ⇒ problema', async () => {
    const m = montar(sana())
    await rutaVigilar(m.deps(), { ...REAL, cierre: { fin: 'hecho', clientes: [] } })
    expect(m.avisos[0]).toMatch(/el cierre no trae a este cliente/)
  })
  it('los veredictos que no entregan son exactamente los tres', () => {
    expect([...VEREDICTOS_QUE_NO_ENTREGAN].sort()).toEqual(['ajeno', 'ruido', 'sin_confirmar'])
  })
})

describe('si el aviso o el apagado fallan, se DICE (502) y no se da por hecho', () => {
  it('cliente pausado pero Slack rechaza ⇒ 502 con el motivo (la pausa quedó registrada)', async () => {
    const m = montar(sana({ cerebro_portero_corridas: [] }), { avisarOk: false })
    const r = await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(502)
    expect(r.body.pausados).toHaveLength(1)
    expect(r.body.aviso).toMatchObject({ ok: false, detalle: 'Slack rechazó' })
  })
  it('un problema que NO es de un cliente (ninguno activo) apaga el flujo; si no se pudo apagar ⇒ la línea lo dice («apágalo a mano») y 502', async () => {
    const m = montar(sana({ clients: [] }), { apagarOk: false })
    const r = await rutaVigilar(m.deps(), { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(502)
    expect(m.avisos[0]).toMatch(/no se pudo apagar: apágalo a mano/)
  })
  it('sin forma de apagar ni de avisar (deps ausentes) ⇒ 502, nunca un «todo bien» falso', async () => {
    const base = crearBaseFalsa(sana({ cerebro_portero_corridas: [] }) as never)
    const r = await rutaVigilar({ db: base.db, interruptores: ON, ahora: MIERCOLES }, { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(502); expect(r.body.ok).toBe(false)
  })
})

describe('sin resumen semanal: ningún mensaje de rutina, ni siquiera el lunes', () => {
  it('lunes con todo bien = silencio total (0 avisos) y sin marca de resumen', async () => {
    const t = sana({ cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-19', estado: 'hecha', resumen: { escrituras: { fichas: 4 } } }] })
    t.cerebro_fichas = [ficha('a', { creado_en: '2026-10-19T09:00:00Z' }), ficha('b', { creado_en: '2026-10-19T09:00:00Z' })]
    const m = montar(t)
    const r = await rutaVigilar(m.deps(LUNES), { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(200); expect(r.body.ok).toBe(true)
    expect(m.avisos).toEqual([]); expect(m.apagados).toEqual([])
    expect(r.body.semanal).toBeUndefined()
    expect(JSON.stringify(rastroEscrito(m.base).map((e) => e.fila))).not.toContain('semanal')
  })
  it('un lunes con problemas manda la alerta (y solo esa)', async () => {
    const t = sana({ cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-19', estado: 'con_errores', resumen: {} }] })
    const m = montar(t)
    await rutaVigilar(m.deps(LUNES), { ...REAL, cierre: CIERRE_BUENO })
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/PAUSADO solo para/)
  })
  it('el código ya no exporta el resumen ni lo menciona', () => {
    const src = readFileSync(new URL('../vigilante.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/resumenSemanal|semanal_enviado/)
  })
})

describe('reintento: SOLO ante «no pude comprobar»', () => {
  const montarR = (tablas: Record<string, unknown[]>, o: { fallaEn?: string; fallaVeces?: number; apagarOk?: boolean; avisarOk?: boolean } = {}) => {
    const base = crearBaseFalsa(tablas as never, { fallaEn: o.fallaEn, fallaVeces: o.fallaVeces })
    const apagados: string[] = [], avisos: string[] = [], esperas: number[] = []
    const deps: DepsDelVigilante = {
      db: base.db, interruptores: ON, ahora: MIERCOLES,
      apagar: async (w) => { apagados.push(w); return { ok: o.apagarOk !== false, detalle: 'flujo desactivado' } },
      avisar: async (t) => { avisos.push(t); return { ok: o.avisarOk !== false, detalle: 'entregado' } },
      esperar: async (ms) => { esperas.push(ms) },
    }
    return { base, apagados, avisos, esperas, deps }
  }
  it('la lectura falla una vez y la segunda pasa ⇒ SILENCIO (no apaga, no avisa), con la espera hecha y el rastro con intentos:2', async () => {
    const m = montarR(sana(), { fallaEn: 'costs', fallaVeces: 1 })
    const r = await rutaVigilar(m.deps, { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(200); expect(r.body.ok).toBe(true); expect(r.body.intentos).toBe(2)
    expect(m.esperas).toEqual([ESPERA_DEL_REINTENTO_MS])
    expect(m.apagados).toEqual([]); expect(m.avisos).toEqual([])
    expect(JSON.stringify(rastroEscrito(m.base).map((e) => e.fila))).toContain('"intentos":2')
  })
  it('la lectura falla las dos veces ⇒ apaga y avisa, y la línea dice «falló 2 veces»', async () => {
    const m = montarR(sana(), { fallaEn: 'costs' })
    const r = await rutaVigilar(m.deps, { ...REAL, cierre: CIERRE_BUENO })
    expect(r.status).toBe(200); expect(r.body.ok).toBe(false); expect(r.body.intentos).toBe(2)
    expect(m.esperas).toHaveLength(1)
    expect(m.apagados).toEqual([])
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/falló 2 veces/)
    expect(m.avisos[0]).toMatch(/no pude comprobar/)
  })
  it('la lista de clientes falla una vez y luego responde ⇒ silencio', async () => {
    const m = montarR(sana(), { fallaEn: 'clients', fallaVeces: 1 })
    const r = await rutaVigilar(m.deps, { ...REAL, client_id: C, cierre: CIERRE_BUENO })
    expect(r.body.ok).toBe(true); expect(m.avisos).toEqual([]); expect(m.apagados).toEqual([])
  })
  it('un problema REAL (condiciones 1-5) NO se reintenta: apaga y avisa al primer fallo, sin espera', async () => {
    const casos: Array<[string, Record<string, unknown[]>, unknown]> = [
      ['cierre con errores', sana(), { ...CIERRE_BUENO, clientes: [{ ...CIERRE_BUENO.clientes[0], errores: ['boom'] }] }],
      ['sin rastro de hoy', sana({ cerebro_portero_corridas: [] }), CIERRE_BUENO],
      ['ficha ajena viva', sana({ cerebro_unidades_vistas: [{ client_id: C, ficha_id: 'a', veredicto: 'ajeno' }, { client_id: C, ficha_id: 'b', veredicto: 'suma' }] }), CIERRE_BUENO],
      ['puente con pendientes', sana(), { ...CIERRE_BUENO, clientes: [{ ...CIERRE_BUENO.clientes[0], puente: { quedan: 3, vueltas: 1, falla: null } }] }],
    ]
    for (const [nombre, tablas, cierre] of casos) {
      const m = montarR(tablas)
      const r = await rutaVigilar(m.deps, { ...REAL, cierre })
      expect(r.body.intentos, nombre).toBe(1)
      expect(m.esperas, nombre).toEqual([])
      expect(m.apagados, nombre).toEqual([])
      expect(m.avisos, nombre).toHaveLength(1)
      expect(m.avisos[0], nombre).not.toMatch(/falló 2 veces/)
    }
  })
  it('un problema real MEZCLADO con una lectura fallida tampoco se reintenta (solo se reintenta lo puramente «no pude comprobar»)', async () => {
    const m = montarR(sana({ cerebro_portero_corridas: [] }), { fallaEn: 'costs' })
    const r = await rutaVigilar(m.deps, { ...REAL, cierre: CIERRE_BUENO })
    expect(r.body.intentos).toBe(1); expect(m.esperas).toEqual([]); expect(m.apagados).toEqual([])
  })
  it('dry_run no espera ni reintenta', async () => {
    const m = montarR(sana(), { fallaEn: 'costs' })
    const r = await rutaVigilar(m.deps, { dry_run: true, cierre: CIERRE_BUENO })
    expect(m.esperas).toEqual([]); expect(r.body.intentos).toBe(1)
  })
  it('esSoloNoPudeComprobar: vacío no cuenta; mezcla no cuenta; solo «no pude comprobar» sí', () => {
    const r = (problemas: string[]) => ({ client_id: 'x', nombre: null, problemas, gasto_usd: null })
    expect(esSoloNoPudeComprobar([])).toBe(false)
    expect(esSoloNoPudeComprobar([r([])])).toBe(false)
    expect(esSoloNoPudeComprobar([r(['no pude comprobar el gasto del día: x'])])).toBe(true)
    expect(esSoloNoPudeComprobar([r(['no pude comprobar el gasto: x', 'gasto del día US$ 2.00 > 1.00'])])).toBe(false)
  })
})

describe('entrada, interruptor y la ruta', () => {
  it('dry_run obligatorio (400); sin workflow (403); apagado no lee', async () => {
    const m = montar(sana())
    expect((await rutaVigilar(m.deps(), { cierre: CIERRE_BUENO })).status).toBe(400)
    expect((await rutaVigilar(m.deps(), { dry_run: false, cierre: CIERRE_BUENO })).status).toBe(403)
    const off = crearBaseFalsa(sana() as never)
    const r = await rutaVigilar({ db: off.db, interruptores: { ...ON, alimentar: false }, ahora: MIERCOLES }, { ...REAL, cierre: CIERRE_BUENO })
    expect(r.body.apagado).toBe(true); expect(off.lecturas).toEqual([])
  })
  it('la ruta pide la llave interna (401 sin ella)', async () => {
    const r = await POST(new Request('http://x/api/brain/alimentar/vigilar', { method: 'POST', body: '{}' }))
    expect(r.status).toBe(401)
  })
  it('problemasDelCierre: cliente ausente del cierre y línea de alerta con el nombre', () => {
    expect(problemasDelCierre({ fin: 'hecho', clientes: [] }, C)).toEqual(['el cierre no trae a este cliente'])
    expect(lineaDeAlerta([{ client_id: C, nombre: 'Cliente Zeta', problemas: ['uno', 'dos'], gasto_usd: 0 }], true, WF)).toBe(`🔴 Portero del cerebro APAGADO · Cliente Zeta: uno (+1 más) · revisar y volver a activar el flujo ${WF} en n8n`)
  })
})

describe('las dos salidas reales (con red simulada)', () => {
  const resp = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })
  it('Slack: ok solo si confirma ok:true; manda al canal de alertas; sin token no manda', async () => {
    const vistos: Array<{ u: string; i?: RequestInit }> = []
    const bien = avisarAAlertas({ token: 'T', fetchImpl: async (u, i) => { vistos.push({ u, i }); return resp({ ok: true }) } })
    expect(await bien('hola')).toMatchObject({ ok: true })
    expect(JSON.parse(String(vistos[0].i?.body))).toEqual({ channel: 'C0B7XUUEBHA', text: 'hola' })
    expect((vistos[0].i?.headers as Record<string, string>).Authorization).toBe('Bearer T')
    expect(await avisarAAlertas({ token: 'T', fetchImpl: async () => resp({ ok: false, error: 'channel_not_found' }) })('x')).toMatchObject({ ok: false, detalle: expect.stringContaining('channel_not_found') })
    const old = process.env.SLACK_BOT_TOKEN; delete process.env.SLACK_BOT_TOKEN
    expect(await avisarAAlertas({ fetchImpl: async () => resp({ ok: true }) })('x')).toMatchObject({ ok: false })
    if (old) process.env.SLACK_BOT_TOKEN = old
  })
  it('n8n: apaga solo un flujo del portero y verifica que quedó inactivo', async () => {
    const llamadas: string[] = []
    const mk = (nombre: string, active: boolean, tras: boolean) => apagarFlujoDelPortero({ base: 'https://n8n.example', llave: 'K', fetchImpl: async (u, i) => {
      llamadas.push(`${i?.method ?? 'GET'} ${u.replace('https://n8n.example/api/v1', '')}`)
      if (!i?.method || i.method === 'GET') return resp({ name: nombre, active })
      return resp({ active: tras })
    } })
    expect(await mk('Cerebro · mantenimiento diario del portero', true, false)(WF)).toMatchObject({ ok: true, detalle: 'flujo desactivado' })
    expect(llamadas).toEqual([`GET /workflows/${WF}`, `POST /workflows/${WF}/deactivate`])
    llamadas.length = 0
    expect(await mk('Otro flujo cualquiera', true, false)(WF)).toMatchObject({ ok: false })
    expect(llamadas).toEqual([`GET /workflows/${WF}`]) // no se desactivó
    llamadas.length = 0
    expect(await mk('portero', false, false)(WF)).toMatchObject({ ok: true, detalle: 'ya estaba inactivo' })
    expect(llamadas).toEqual([`GET /workflows/${WF}`])
    expect(await mk('portero', true, true)(WF)).toMatchObject({ ok: false, detalle: 'n8n no confirmó el flujo inactivo' })
    expect(await mk('portero', true, false)('../../x')).toMatchObject({ ok: false, detalle: 'workflow_id inválido' })
  })
})

describe('el flujo trae el vigilante al final y nada más cambia', () => {
  const dir = new URL('../../../../scripts/worker-staging/ogfq56oIEoHufFPM/', import.meta.url)
  const leer = (n: string) => JSON.parse(readFileSync(new URL(n, dir), 'utf8')) as { nodes: Array<{ name: string; parameters: Record<string, unknown>; onError?: string }>; connections: Record<string, unknown>; active?: boolean }
  it('«⑥ Vigilar» cuelga de «⑤ Cierre», llama a la ruta con la llave interna y NO traga errores; el resto del flujo es idéntico', async () => {
    const { conVigilante, NODO } = await import('../../../../scripts/worker-staging/ogfq56oIEoHufFPM/construir-vigilante.mjs')
    const antes = leer('ogfq56oIEoHufFPM-ANTES-vigilante-2026-10-14.json')
    const despues = leer('ogfq56oIEoHufFPM-ARREGLADO-vigilante-2026-10-14.json')
    expect(conVigilante(antes)).toEqual(despues)
    const n = despues.nodes.find((x) => x.name === NODO)!
    expect(String(n.parameters.url)).toBe('https://zero-risk-platform.vercel.app/api/brain/alimentar/vigilar')
    expect(JSON.stringify(n.parameters)).toContain('$env.INTERNAL_API_KEY')
    expect(JSON.stringify(n.parameters.jsonBody)).toContain('cierre: $json')
    expect(n.onError).toBeUndefined()
    expect(despues.connections['⑤ Cierre']).toEqual({ main: [[{ node: NODO, type: 'main', index: 0 }]] })
    const A = new Map(antes.nodes.map((x) => [x.name, JSON.stringify(x)]))
    expect(despues.nodes.filter((x) => x.name !== NODO).every((x) => A.get(x.name) === JSON.stringify(x))).toBe(true)
    expect(despues.nodes).toHaveLength(antes.nodes.length + 1)
    expect(() => conVigilante(despues)).toThrow(/ya está/)
  })
})
