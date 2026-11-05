/**
 * 05-nov (GO de Lenovo, «informes disponibles») · los informes REALES de la corrida 210273 del 01-nov, tal como los escribieron los analistas (traza de Braintrust).
 *   · retención: citó las fichas que leyó en el resumen vivo; ese día la consulta no le trajo fichas y sus citas no contaban. Esto fija el arreglo: las fichas del resumen cuentan.
 *   · escucha de X: «sin dato» honesto, porque el cerebro no tiene nada de X. No es una falla y no se archiva.
 *   · y un solo informe de mercado por corrida: el paso 0 se apaga solo si la mesa corre para ese cliente.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ANALISTAS, armarMaterial, crearCuentaDeLaMesa, cuerpoDelInforme, LIMITE_DE_LA_PUERTA_MS, leerInforme } from '../src/lib/planeacion/mesa-de-analisis'
import { validarFormaDelPlan } from '../src/lib/planeacion/validador-plan'
import { CODIGO_INFORMES_QUE_NO_LLEGARON, construirPlanInformesQueNoLlegaron } from '../scripts/ops/oficina-marketing/plan-informes-que-no-llegaron.mjs'
import { brazoAnalisis } from '../src/lib/planeacion/brazos'
import { conUnSoloMercado, pedirPlanDelManual, sobreDelPlan } from '../src/lib/manual/pedir-plan'
import { esPasoFueraDelCorteDelPlan } from '../src/lib/run-sdk-spend-gate'

const RETENCION = readFileSync('__tests__/fixtures/mesa-de-analisis/informe-retencion-210273.md', 'utf8')
const ESCUCHA_X = readFileSync('__tests__/fixtures/mesa-de-analisis/informe-escucha-x-210273.md', 'utf8')
const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const cortosDe = (t: string) => [...new Set([...t.matchAll(/ficha:([0-9a-f]{8})/g)].map((m) => m[1]))]
const completo = (c: string) => `${c}-0000-4000-8000-000000000000`
const cuerpo = (tipo: 'retencion' | 'escucha_x', informe: ReturnType<typeof leerInforme>) => cuerpoDelInforme({ client_id: C, analista: ANALISTAS[tipo], informe, fecha_de_corte: '2026-11-01T16:32:00Z', workflow_id: 'w', workflow_execution_id: 'e' })

describe('retención: se pagaba y no se archivaba', () => {
  const sinFichas = (ids: string[] | undefined) => armarMaterial({ resumen_vivo: 'RESUMEN VIVO', fichas: [], ids_del_resumen: ids })

  it('🔴 la causa: sin fichas de la consulta y sin contar las del resumen, sus 7 hallazgos no se sostienen y no hay qué archivar', () => {
    const leido = leerInforme(RETENCION, ANALISTAS.retencion, sinFichas(undefined).ids)
    expect(leido).toMatchObject({ hallazgos: 0, lineas_sin_sosten: 7, citas: [] })
    expect(cuerpo('retencion', leido)).toBeNull()
  })
  it('🔴 el arreglo: las fichas que cita el resumen vivo cuentan, y el mismo informe se archiva', () => {
    const leido = leerInforme(RETENCION, ANALISTAS.retencion, sinFichas(cortosDe(RETENCION).map(completo)).ids)
    expect(leido).toMatchObject({ hallazgos: 7, lineas_sin_sosten: 0, declara_sin_dato: false })
    expect(cuerpo('retencion', leido)?.citas).toHaveLength(cortosDe(RETENCION).length)
  })
  it('🔴 hoy además le llegan las métricas, las reseñas y las horas de más gente', () => {
    expect(ANALISTAS.retencion.clases).toBe('horas_de_mas_gente,metrica,resenas')
  })
})

describe('escucha de X: «sin dato» honesto, no una falla', () => {
  it('🔴 no cuenta sus viñetas de «qué habría que mirar» como hallazgos y no se archiva', () => {
    const leido = leerInforme(ESCUCHA_X, ANALISTAS.escucha_x, ['036f1bcd-7b99-4e1a-99a8-f8d7e6953e0b'])
    expect(leido).toMatchObject({ hallazgos: 0, declara_sin_dato: true })
    expect(cuerpo('escucha_x', leido)).toBeNull()
  })
  it('🔴 la mesa lo dice como falta de material, no como que no se miró', async () => {
    const archivar = vi.fn()
    const pedido = brazoAnalisis({
      objetivo: 'informe de escucha_x', fuente: 'prueba', tipo: 'escucha_x', agente: ANALISTAS.escucha_x.agente, rotulo: 'r', dry_run: false, esperados: { min: 3, max: 8 },
      pedir: async () => ({ ok: true, salida: ESCUCHA_X, costo_usd: 0.13 }),
      leer: (s: string) => leerInforme(s, ANALISTAS.escucha_x, []), archivar,
    } as never)
    const r = (await pedido) as unknown as Record<string, unknown>
    expect(r.estado).toBe('sin_dato')
    expect(String(r.motivo)).toMatch(/sin material de X todavía.*no es una falla/)
    expect(archivar).not.toHaveBeenCalled()
  })
})

describe('un solo informe de mercado por corrida', () => {
  const sobre = sobreDelPlan({ client_id: C, manual_id: 'm1' })
  const encendida = async () => ({ encendida: true, clientes: [C] })
  const mercado = (s: Record<string, unknown>) => (s.payload as Record<string, unknown>).con_mercado

  it('🔴 con la mesa encendida para este cliente, el paso 0 no se pide: lo trae el analista de la mesa', async () => {
    expect(mercado(await conUnSoloMercado(sobre, encendida))).toBe(false)
  })
  it('🔴 no pierde nada del resto del pedido: solo agrega la orden', async () => {
    const salio = await conUnSoloMercado(sobre, encendida)
    expect(salio).toEqual({ ...sobre, payload: { ...(sobre.payload as object), con_mercado: false } })
  })
  it('🔴 mira la palanca de la mesa y no otra', async () => {
    const leer = vi.fn(async (clave: string) => (clave === 'mesa_de_analisis' ? { encendida: true, clientes: [C] } : undefined))
    expect(mercado(await conUnSoloMercado(sobre, leer))).toBe(false)
    expect(leer).toHaveBeenCalledWith('mesa_de_analisis')
  })
  it('🔴 con la mesa apagada, o encendida para otro cliente, el paso 0 sigue: ningún cliente se queda sin informe de mercado', async () => {
    for (const config of [undefined, null, { encendida: false, clientes: [C] }, { encendida: true, clientes: ['otro'] }]) {
      expect(mercado(await conUnSoloMercado(sobre, async () => config)), JSON.stringify(config)).toBeUndefined()
    }
  })
  it('🔴 si la palanca no se puede leer, el paso 0 sigue', async () => {
    const errorDeConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mercado(await conUnSoloMercado(sobre, async () => { throw new Error('base caída') }))).toBeUndefined()
    expect(errorDeConsola).toHaveBeenCalled()
    errorDeConsola.mockRestore()
  })
  it('🔴 si la base no contesta, no se queda colgado: el paso 0 sigue', async () => {
    vi.useFakeTimers()
    const errorDeConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = conUnSoloMercado(sobre, () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(5000)
    expect(mercado(await p)).toBeUndefined()
    errorDeConsola.mockRestore()
    vi.useRealTimers()
  })
  it('🔴 lo que pide quien dispara manda, y sin análisis ni se lee la palanca', async () => {
    const leer = vi.fn(encendida)
    const conPedido = (p: Record<string, unknown>) => ({ ...sobre, payload: { ...(sobre.payload as object), ...p } })
    expect(mercado(await conUnSoloMercado(conPedido({ con_mercado: true }), leer))).toBe(true)
    expect(mercado(await conUnSoloMercado(conPedido({ con_analisis: false }), leer))).toBeUndefined()
    expect(leer).not.toHaveBeenCalled()
  })
  it('🔴 el sobre que de verdad sale a la sala lo lleva, con la misma clave', async () => {
    const f = vi.fn(async (_u: string, _i: { body: string }) => new Response(JSON.stringify({ ok: true, kind: 'accepted', event_id: 'e1' }), { status: 200 }))
    await pedirPlanDelManual({ client_id: C, manual_id: 'm1' }, { url: 'https://x', llave: 'k', fetchImpl: f as never, leerConfig: encendida })
    const salio = JSON.parse(f.mock.calls[0][1].body) as Record<string, unknown>
    expect(mercado(salio)).toBe(false)
    expect(salio.idempotency_key).toBe(sobre.idempotency_key)
  })
})

describe('el corte de US$ 15 distingue el rótulo exacto', () => {
  it('🔴 «analisis» a secas o sin guion no queda fuera del corte', () => {
    expect(esPasoFueraDelCorteDelPlan('analisis-retencion')).toBe(true)
    for (const p of ['analisis', 'analisisfoo', 'redactor', null]) expect(esPasoFueraDelCorteDelPlan(p), String(p)).toBe(false)
  })
})

describe('el brazo: qué pasa con el segundo intento', () => {
  const INFORME = '- hallazgo uno\n- hallazgo dos\n- hallazgo tres'
  const leer = (s: string) => ({ informe: s, citas: ['a'], citas_ajenas: 0, hallazgos: s.includes('hallazgo') ? 3 : 0, lineas_sin_sosten: 0, declara_sin_dato: false, recortado: false })
  const correr = (a: Record<string, unknown>) => brazoAnalisis({ objetivo: 'o', fuente: 'f', tipo: 'mercado', agente: 'a', rotulo: 'r', dry_run: false, esperados: { min: 1, max: 8 }, leer, archivar: async () => ({ ok: true, detalle: 'd' }), ...a } as never) as unknown as Promise<Record<string, unknown>>

  it('🔴 un corte de tiempo es una falla y se reintenta, no una caída', async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new Error('se agotó el tiempo dado')).mockResolvedValueOnce({ ok: true, salida: INFORME, costo_usd: 0.2 })
    const r = await correr({ pedir, segundoIntento: () => ({ ok: true }) })
    expect(pedir.mock.calls.map((c) => c[0])).toEqual([1, 2])
    expect(r.estado).toBe('trajo')
  })
  it('🔴 sin permiso no se llama otra vez, y dice por qué', async () => {
    const pedir = vi.fn().mockResolvedValue({ ok: false, error: 'x', costo_usd: 0 })
    const r = await correr({ pedir, segundoIntento: () => ({ ok: false, motivo: 'no queda cupo en el tope de la mesa' }) })
    expect(pedir).toHaveBeenCalledTimes(1)
    expect(r.estado).toBe('sin_respuesta')
    expect(String(r.motivo)).toMatch(/^no hubo informe: el analista falló y no se pudo reintentar · no queda cupo/)
  })
  it('🔴 nunca más de 2 llamadas', async () => {
    const pedir = vi.fn().mockResolvedValue({ ok: false, error: 'x', costo_usd: 0 })
    await correr({ pedir, segundoIntento: () => ({ ok: true }) })
    expect(pedir).toHaveBeenCalledTimes(2)
  })
})

describe('la cuenta del reintento: tiempo y tope firmado', () => {
  const cinco = [1, 1, 1, 1, 1]
  it('🔴 con los 5 topes comprometidos y nadie terminado, no cabe', () => {
    expect(crearCuentaDeLaMesa(cinco, () => 0).pedirReintento(1)).toMatchObject({ ok: false, motivo: expect.stringMatching(/cupo/) })
  })
  it('🔴 lo que el que falló no gastó vuelve al cupo y alcanza para repetirlo', () => {
    const c = crearCuentaDeLaMesa(cinco, () => 0)
    c.liquidar(1, 0)
    expect(c.pedirReintento(1)).toEqual({ ok: true, tope: 1 })
  })
  it('🔴 el reintento queda comprometido: dos no caben en el cupo de uno', () => {
    const c = crearCuentaDeLaMesa(cinco, () => 0)
    c.liquidar(1, 0)
    c.pedirReintento(1)
    expect(c.pedirReintento(1).ok).toBe(false)
  })
  it('🔴 nunca da más que el tope del analista ni más de lo que queda', () => {
    const c = crearCuentaDeLaMesa(cinco, () => 0)
    for (let i = 0; i < 5; i++) c.liquidar(1, 0.2)
    expect(c.pedirReintento(1)).toEqual({ ok: true, tope: 1 })
    const d = crearCuentaDeLaMesa(cinco, () => 0)
    d.liquidar(1, 0.3)
    const dado = d.pedirReintento(1)
    expect(dado.ok).toBe(true)
    expect(dado.ok && dado.tope).toBeCloseTo(0.7)
  })
  it('🔴 con menos cupo que lo que cuesta un analista, no se reintenta para cortarlo a medias', () => {
    const c = crearCuentaDeLaMesa(cinco, () => 0)
    c.liquidar(1, 0.6)
    expect(c.pedirReintento(1).ok).toBe(false)
  })
  it('🔴 sin tiempo en la puerta no se reintenta', () => {
    let reloj = 0
    const c = crearCuentaDeLaMesa(cinco, () => reloj)
    c.liquidar(1, 0)
    reloj = LIMITE_DE_LA_PUERTA_MS - 199_000
    expect(c.pedirReintento(1)).toMatchObject({ ok: false, motivo: expect.stringMatching(/tiempo/) })
    reloj = LIMITE_DE_LA_PUERTA_MS - 200_000
    expect(c.pedirReintento(1).ok).toBe(true)
    expect(c.hayTiempoParaLlamar()).toBe(true)
    reloj += 1
    expect(c.hayTiempoParaLlamar()).toBe(false)
  })
  it('🔴 un costo que no es número no devuelve cupo', () => {
    const c = crearCuentaDeLaMesa(cinco, () => 0)
    c.liquidar(1, Number.NaN)
    expect(c.pedirReintento(1).ok).toBe(false)
  })
  it('🔴 la puerta termina antes de que la plataforma la corte', () => {
    expect(LIMITE_DE_LA_PUERTA_MS).toBeLessThan(800_000)
  })
})

describe('el plan declara lo que no llegó', () => {
  const correr = (items: Array<Record<string, unknown>> | 'sin_rama', o: { body?: Record<string, unknown>; guardado?: unknown } = {}): string => {
    const dolar = (nombre: string) => {
      if (nombre === 'firma de la rama · analisis') return { all: () => { if (items === 'sin_rama') throw new Error('sin ejecutar'); return items.map((json) => ({ json })) } }
      if (nombre === 'Webhook · planeacion') return { first: () => ({ json: { body: o.body ?? {} } }) }
      if (nombre === 'Reanudar · poner el material guardado') return { first: () => { if (o.guardado === undefined) throw new Error('sin ejecutar'); return { json: { material: o.guardado } } } }
      throw new Error('nodo inesperado: ' + nombre)
    }
    return new Function('$', CODIGO_INFORMES_QUE_NO_LLEGARON + ' return bloqueInformesQueNoLlegaron;')(dolar)
  }
  const FALLO = 'no hubo informe: el analista falló en los 2 intentos · 1.º: el analista no contestó · run_sdk_500 · 2.º: el analista no contestó · run_sdk_500'

  it('🔴 lo dice con el informe y la razón, sin detalles técnicos', () => {
    const b = correr([{ estado: 'sin_respuesta', objetivo: 'informe de mercado', motivo: FALLO }])
    expect(b).toMatch(/## Informes de análisis que no llegaron/)
    expect(b).toMatch(/- informe de mercado — no hubo informe: el analista falló en los 2 intentos/)
    expect(b).not.toMatch(/run_sdk|run sdk|1\.º/)
  })
  it('🔴 si la mesa entera se cayó, declara cada informe', () => {
    const b = correr([{ brazo: 'analisis', objetivo: 'informe de mercado', error: 'tiempo' }, { brazo: 'analisis', objetivo: 'informe de retención', error: 'tiempo' }])
    expect(b.match(/la mesa de análisis no contestó/g)).toHaveLength(2)
  })
  it('🔴 lo que no es una falta no se declara: traer, «sin dato», mesa apagada, ensayo', () => {
    expect(correr([
      { estado: 'trajo', objetivo: 'a' },
      { estado: 'sin_dato', objetivo: 'b', motivo: 'sin material de X todavía' },
      { estado: 'sin_respuesta', objetivo: 'c', motivo: 'la mesa está apagada: no hay config · NO se preguntó' },
      { estado: 'sin_respuesta', objetivo: 'd', motivo: 'la mesa está encendida pero este cliente no está' },
      { estado: 'sin_respuesta', objetivo: 'e', motivo: 'NO SE MIRÓ DE VERDAD · fue un ensayo (dry-run)' },
    ])).toBe('')
  })
  it('🔴 reparo de CC6: mesa apagada y paso 0 quitado: no hubo ninguno de los dos, y se declara en llano', () => {
    const apagada = { estado: 'sin_respuesta', objetivo: 'informe de mercado', motivo: 'la mesa está apagada (`cadena_config.mesa_de_analisis.encendida` no es true)' }
    const b = correr([apagada], { body: { con_mercado: false } })
    expect(b).toMatch(/- informe de mercado — la mesa de análisis estaba apagada cuando le tocó correr/)
    expect(b).not.toMatch(/cadena_config/)
    expect(correr([apagada], { body: {} })).toBe('')
    expect(correr([apagada], { body: { con_mercado: true } })).toBe('')
  })
  it('🔴 un ensayo no se declara ni con el paso 0 quitado', () => {
    expect(correr([{ estado: 'sin_respuesta', objetivo: 'e', motivo: 'NO SE MIRÓ DE VERDAD · fue un ensayo (dry-run)' }], { body: { con_mercado: false } })).toBe('')
  })
  it('🔴 reparo de CC6: al volver de una pausa la mesa no corre, y lo que faltó se lee de lo guardado', () => {
    const guardado = [
      { brazo: 'analisis', estado: 'sin_respuesta', objetivo: 'informe de mercado', motivo: FALLO },
      { brazo: 'analisis', estado: 'trajo', objetivo: 'informe de retención' },
      { brazo: 'apify', estado: 'sin_respuesta', objetivo: 'otra cosa', motivo: 'no contestó' },
    ]
    const b = correr('sin_rama', { guardado })
    expect(b).toMatch(/- informe de mercado — no hubo informe/)
    expect(b).not.toMatch(/retención|otra cosa/)
    expect(correr([], { guardado })).toMatch(/- informe de mercado/)
  })
  it('🔴 lo guardado no pisa lo que sí corrió', () => {
    expect(correr([{ estado: 'trajo', objetivo: 'a' }], { guardado: [{ brazo: 'analisis', estado: 'sin_respuesta', objetivo: 'viejo', motivo: 'x' }] })).toBe('')
  })
  it('🔴 lo guardado sin forma no tumba el plan', () => {
    expect(correr('sin_rama', { guardado: 'raro' })).toBe('')
  })
  it('🔴 otro motivo de no contestar sí se declara: por omisión se dice', () => {
    expect(correr([{ estado: 'sin_respuesta', objetivo: 'x', motivo: 'el tope de la mesa no alcanza para este pedido' }])).toMatch(/- x — no se pudo preparar este informe/)
  })
  it('🔴 reparo de CC7: un motivo técnico no llega al cliente, y la falta se declara igual', () => {
    for (const motivo of ['no existe la ficha del cliente 0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 'el analista «market-research-agent» no está instalado (no hay fila en agents)', 'falta `dry_run` explícito (true o false)']) {
      const b = correr([{ estado: 'sin_respuesta', objetivo: 'informe de mercado', motivo }])
      expect(b).toMatch(/- informe de mercado — no se pudo preparar este informe/)
      expect(b).not.toMatch(/0a2ffbd4|market-research|agents|dry/)
    }
  })
  it('🔴 reparo de CC7: el título no le habla al cliente de quién lo escribió', () => {
    const b = correr([{ estado: 'sin_respuesta', objetivo: 'x', motivo: FALLO }])
    expect(b.split('\n')[1]).toBe('## Informes de análisis que no llegaron')
  })
  it('🔴 si nadie pidió análisis no hay sección y no se cae', () => {
    expect(correr('sin_rama')).toBe('')
    expect(correr([])).toBe('')
  })
  it('🔴 la sección no daña la forma de un plan real', () => {
    const plan = readFileSync('__tests__/fixtures/chequeos-del-plan/plan-r3-7554b590.md', 'utf8')
    const con = plan.trimEnd() + '\n' + correr([{ estado: 'sin_respuesta', objetivo: 'informe de mercado', motivo: FALLO }])
    expect(validarFormaDelPlan(con).hallazgos).toEqual(validarFormaDelPlan(plan).hallazgos)
  })
  it('🔴 el cambio entra en el flujo real, compila y solo toca ese nodo', () => {
    const antes = JSON.parse(readFileSync('scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-paso0-siempre-2026-11-04.json', 'utf8'))
    const a = antes.workflow || antes
    const f = structuredClone(a)
    construirPlanInformesQueNoLlegaron(f)
    type N = { name: string; parameters: { jsCode: string } }
    const cambiados = (f.nodes as N[]).filter((n, i) => JSON.stringify(n) !== JSON.stringify(a.nodes[i]))
    expect(cambiados.map((n) => n.name)).toEqual(['¿Llegó la vuelta?', 'JEF · plan · el plan de guardado'])
    for (const n of cambiados) expect(() => new Function('$', '$input', '$execution', '$runIndex', '$workflow', '$json', '$now', 'require', n.parameters.jsCode)).not.toThrow()
    expect(cambiados[0].parameters.jsCode).toContain("+ '\\n' + bloqueInformesQueNoLlegaron : textoDelRedactor")
    expect(cambiados[0].parameters.jsCode).toContain("bloque_informes_que_no_llegaron: llego ? bloqueInformesQueNoLlegaron : ''")
  })

  describe('reparo de CC7: la versión corregida también la lleva', () => {
    const SECCION = '\n## Informes de análisis que no llegaron\n- informe de mercado — no hubo informe: el analista falló en los 2 intentos\n'
    const crudo = JSON.parse(readFileSync('scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-paso0-siempre-2026-11-04.json', 'utf8'))
    const f = structuredClone(crudo.workflow || crudo)
    construirPlanInformesQueNoLlegaron(f)
    const codigoDe = (nombre: string): string => (f.nodes as Array<{ name: string; parameters: { jsCode: string } }>).find((n) => n.name === nombre)!.parameters.jsCode
    type Salida = Array<{ json: Record<string, any> }>
    const correrNodo = (nombre: string, nodos: Record<string, unknown>, entrada: unknown = {}): Salida => {
      const dolar = (n: string) => {
        if (!(n in nodos)) throw new Error('sin ejecutar: ' + n)
        return { first: () => ({ json: nodos[n] }), last: () => ({ json: nodos[n] }), all: () => [{ json: nodos[n] }] }
      }
      return new Function('$', '$input', codigoDe(nombre))(dolar, { first: () => ({ json: entrada }) })
    }
    const version = (texto: string) => ({ texto, caracteres: texto.length, estado_del_plan: 'sin_marcas', con_pendientes: false, pendientes: null, chequeo_del_plan: null })
    const guardado = (procesadas: Record<string, unknown>, textos: unknown, vuelta: unknown = { bloque_informes_que_no_llegaron: SECCION }) => {
      const nodos: Record<string, unknown> = {
        'JEF · plan · evaluar': { jef: { revision_id: 'r1' }, id_de_a: 'a1', client_id: 'c1', procesadas },
        'JEF · plan · armar la elección': { tags: {} },
      }
      if (vuelta !== null) nodos['¿Llegó la vuelta?'] = vuelta
      return correrNodo('JEF · plan · el plan de guardado', nodos, { body: { adoptada: 'B', plan_de_guardado: { guardar: [{ etiqueta: 'B', version: 2, version_de: 'A' }] }, textos_a_guardar: textos } })[0].json
    }
    const veces = (t: string) => t.split('## Informes de análisis que no llegaron').length - 1

    it('🔴 el modelo la borró: vuelve a estar, una vez, y la longitud se actualiza', () => {
      const j = guardado({ B: version('# Plan\n\n## Mes 1\nHacer algo.\n') }, { B: '# Plan\n## QUÉ CAMBIÓ\n- x\n\n## Mes 1\nHacer algo.\n' })
      expect(j.procesadas.B.texto).toBe('# Plan\n\n## Mes 1\nHacer algo.\n' + SECCION)
      expect(j.procesadas.B.caracteres).toBe(j.procesadas.B.texto.length)
      expect(j.textos_a_guardar.B).toBe('# Plan\n## QUÉ CAMBIÓ\n- x\n\n## Mes 1\nHacer algo.\n' + SECCION)
    })
    it('🔴 el modelo la conservó: no se duplica', () => {
      const j = guardado({ B: version('# Plan\n' + SECCION) }, {})
      expect(veces(j.procesadas.B.texto)).toBe(1)
      expect(j.procesadas.B.texto).toBe('# Plan\n' + SECCION)
    })
    it('🔴 el modelo la reescribió o la movió: queda la del sistema al final, y lo que seguía no se pierde', () => {
      const j = guardado({ B: version('# Plan\n\n## INFORMES DE ANÁLISIS QUE NO LLEGARON (corregido)\n- todo salió bien, en realidad\n\n## Mes 1\nHacer algo.\n') }, {})
      expect(j.procesadas.B.texto).not.toMatch(/todo salió bien/)
      expect(j.procesadas.B.texto).toContain('## Mes 1\nHacer algo.')
      expect(veces(j.procesadas.B.texto)).toBe(1)
      expect(j.procesadas.B.texto.endsWith(SECCION)).toBe(true)
    })
    it('🔴 también si el modelo la dejó en negrita y dos veces', () => {
      const j = guardado({ B: version('# Plan\n\n**Informes de análisis que no llegaron**\n- a\n\n---\n\n## Mes 1\nB\n\n### Informes de análisis que no llegaron\n- c\n') }, {})
      expect(j.procesadas.B.texto).not.toMatch(/\*\*Informes|### Informes|- a\n|- c\n/)
      expect(j.procesadas.B.texto).toContain('## Mes 1\nB')
      expect(veces(j.procesadas.B.texto)).toBe(1)
    })
    it('🔴 un separador cierra la sección: lo que sigue sin título no se pierde', () => {
      const j = guardado({ B: version('# Plan\n\n## Informes de análisis que no llegaron\n- a\n\n---\n\nTexto que sigue sin título.\n') }, {})
      expect(j.procesadas.B.texto).toContain('---\n\nTexto que sigue sin título.')
      expect(j.procesadas.B.texto).not.toMatch(/- a\n/)
    })
    it('🔴 B y C la llevan las dos', () => {
      const j = guardado({ B: version('# B\n'), C: version('# C\n') }, { B: '# B q\n', C: '# C q\n' })
      for (const k of ['B', 'C']) { expect(veces(j.procesadas[k].texto)).toBe(1); expect(veces(j.textos_a_guardar[k])).toBe(1) }
    })
    it('🔴 si nada faltó, todo queda letra por letra, aunque el plan hable de eso', () => {
      const p = version('# Plan\n\n## Informes de análisis que no llegaron\n- nota del redactor\n')
      const j = guardado({ B: p }, { B: 'T' }, { bloque_informes_que_no_llegaron: '' })
      expect(j.procesadas.B).toEqual(p)
      expect(j.textos_a_guardar).toEqual({ B: 'T' })
    })
    it('🔴 sin la vuelta legible no se cae y no toca nada', () => {
      const p = version('# Plan\n')
      const j = guardado({ B: p }, { B: 'T' }, null)
      expect(j.procesadas.B).toEqual(p)
      expect(j.textos_a_guardar).toEqual({ B: 'T' })
    })
    it('🔴 de ahí sale lo que se guarda y lo que sigue: fila, PDF y brief', () => {
      const est = guardado({ B: version('# Plan corregido\n') }, {})
      const fila = { id: 'a1', provenance_tag: {} }
      const armado = correrNodo('JEF · plan · armar B', { 'JEF · plan · el plan de guardado': est, 'Guardar el plan': { body: [fila] }, 'Redactor · elegir': { redactor_elegido: 'x' } })[0].json
      expect(armado.fila_base.content.endsWith(SECCION)).toBe(true)
      expect(armado.fila_base.content_text).toBe(armado.fila_base.content)
      const vigente = correrNodo('Plan vigente', { 'Guardar el plan': { body: [fila] }, 'JEF · plan · el plan de guardado': est, 'JEF · plan · guardar B': { statusCode: 201, body: [{ id: 'b1' }] }, '¿Llegó la vuelta?': { client_id: 'c1', client_name: 'Z' } })[0].json
      expect(vigente.jef_vigente.etiqueta).toBe('B')
      expect(vigente.jef_vigente.texto.endsWith(SECCION)).toBe(true)
      expect(vigente.jef_vigente.caracteres).toBe(vigente.jef_vigente.texto.length)
    })
  })
})
