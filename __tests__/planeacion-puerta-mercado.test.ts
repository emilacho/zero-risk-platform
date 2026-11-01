/**
 * LA PUERTA DEL INFORME DE MERCADO · F4 (31-oct) · paso 0 del plan · CC#1 · certifica CC#3.
 *
 * Lo que se prueba: que exista y conteste el contrato §4.2 como `mercado`; que SIN rubro, SIN firma,
 * SIN `dry_run` explícito o EN ENSAYO no se llame al agente (US$ 0) y el hueco diga por qué; que con
 * señales vuelva `trajo` ROTULADO como propuesta (nunca dato del cliente) y con el pedido al corredor
 * firmado, con tope y con el agente correcto; que «sin dato» sea información (`sin_dato`) y que un
 * informe sin señales, un agente caído o un 403 del corredor sean HUECO, no «no hay».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validarRespuesta, BRAZOS, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'
import { ROTULO_INFORME_DE_MERCADO, brazoMercado, contarSenales, esSenal, lineasQueNoCuentan } from '@/lib/planeacion/brazos'
import { traducir } from '@/lib/planeacion/vocabulario'
import { METODO_MERCADO_POR_OMISION } from '@/lib/cadena/metodos'

const supabaseMock = { from: vi.fn() }
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supabaseMock }))
vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'ok' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }),
}))

import { POST as mercado, tareaDeMercado } from '@/app/api/planeacion/brazo/mercado/route'

const pedir = (cuerpo: unknown, llave = 'ok') =>
  mercado(new Request('http://x/api/planeacion/brazo/mercado', {
    method: 'POST', headers: { 'x-api-key': llave, 'content-type': 'application/json' },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  }))
type Leida = RespuestaBrazo & { datos: Record<string, any> }
const leer = async (r: Response) => {
  const sobre = (await r.json()) as { respuestas: Leida[]; resumen: Record<string, any> }
  return { status: r.status, json: sobre.respuestas[0], sobre }
}

const ficha = (fila: Record<string, unknown> | null, error: { message: string } | null = null) => {
  const q: Record<string, any> = {}
  for (const m of ['select', 'eq']) q[m] = vi.fn(() => q)
  q.maybeSingle = vi.fn(async () => ({ data: fila, error }))
  supabaseMock.from.mockReturnValue(q)
  return q
}

const PEDIDO = { client_id: 'c', objetivo: 'informe_mercado', workflow_id: 'PLAN3ac10nWf', workflow_execution_id: '127323', dry_run: false, proposito: 'contexto del plan de 90 días' }

const INFORME_OK = [
  '- Señal: crece la demanda de desayunos tempranos · fuente: INEC, encuesta de hábitos 2026 (inec.gob.ec) · fecha: 2026-03 · confianza: media (muestra nacional, no por ciudad) · oportunidad: franja 6-8 am · faltó: dato por barrio',
  '- Señal: los pedidos por app suben en la plaza · fuente: informe anual de la app X (app-x.com/informe) · fecha: 2026-01 · confianza: alta · oportunidad: menú para delivery · faltó: ticket promedio',
  '- Señal: feriado largo en noviembre · fuente: calendario oficial · fecha: 2026-11 · confianza: alta · oportunidad: promoción de feriado · faltó: afluencia esperada',
  '- Señal: sin dato sobre turismo interno en la plaza · habría que mirar el boletín del ministerio',
].join('\n')

const corredor = (respuesta: unknown, status = 200) => {
  const espia = vi.fn(async () => new Response(JSON.stringify(respuesta), { status }))
  vi.stubGlobal('fetch', espia)
  return espia
}
const cuerpoAlCorredor = (espia: any) => JSON.parse(espia.mock.calls[0][1].body)

beforeEach(() => {
  vi.restoreAllMocks()
  supabaseMock.from.mockReset()
  process.env.INTERNAL_API_KEY = 'ok'
  process.env.FINANZAS_RUN_SDK_BASE = 'https://plataforma.test'
  ficha({ name: 'Negocio', industry: 'restaurante', market: 'Guayaquil', country: 'EC' })
})

describe('🔴 EL ROJO · la puerta del informe de mercado EXISTE y contesta el contrato', () => {
  it('`mercado` es un brazo del contrato · y el objetivo `informe_mercado` lo nombra desde la puerta de raspado', () => {
    expect(BRAZOS).toContain('mercado')
    const t = traducir('informe_mercado')
    expect(t.ok).toBe(false)
    if (!t.ok) expect(t.motivo).toMatch(/es del brazo mercado/)
  })

  it('existe, es POST, contesta 200 con las claves de §4.2 y `brazo: mercado`', async () => {
    corredor({ output: INFORME_OK, cost_usd: 0.42 })
    const { status, json } = await leer(await pedir(PEDIDO))
    expect(status).toBe(200)
    for (const k of ['brazo', 'objetivo', 'estado', 'datos', 'fuente', 'medido_en']) expect(json).toHaveProperty(k)
    expect(json.brazo).toBe('mercado')
    expect(validarRespuesta(json)).toEqual([])
  })
})

describe('🔴 con señales ⇒ trajo · ROTULADO como propuesta · y el pedido al corredor va firmado, con tope y al agente correcto', () => {
  it('el informe vuelve rotulado, cuenta sus señales y declara que NO es dato del cliente', async () => {
    corredor({ output: INFORME_OK, cost_usd: 0.42 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('trajo')
    expect(String(json.datos.informe).startsWith(ROTULO_INFORME_DE_MERCADO)).toBe(true)
    // reserva 4 de CC3: 3 señales con fuente Y fecha; la cuarta línea («sin dato …») es información, no señal, y se declara en el aviso
    expect(json.datos.senales).toBe(3)
    expect(json.datos.es_dato_del_cliente).toBe(false)
    expect(json.datos.dimension).toBe('tendencia y oportunidad')
    expect(json.datos.costo_usd).toBe(0.42)
    expect(json.datos.aviso).toBe('1 línea(s) sin fuente o sin fecha (o «sin dato») no cuentan como señal')
    expect(json.fuente).toMatch(/PROPUESTA/)
    expect(json.fuente).toMatch(/rubro «restaurante»/)
    expect(json.proposito).toBe(PEDIDO.proposito)
  })

  it('🔴 el corredor recibe al agente de mercado, la firma REAL del flujo, `dry_run` false y el tope por omisión (US$ 1)', async () => {
    const espia = corredor({ output: INFORME_OK, cost_usd: 0.1 })
    await pedir(PEDIDO)
    expect(espia).toHaveBeenCalledTimes(1)
    expect(String((espia.mock.calls[0] as any)[0])).toBe('https://plataforma.test/api/agents/run-sdk')
    const b = cuerpoAlCorredor(espia)
    expect(b.agent).toBe('market_research_analyst')
    expect(b.client_id).toBe('c')
    expect(b.workflow_id).toBe('PLAN3ac10nWf')
    expect(b.workflow_execution_id).toBe('127323:informe-mercado')
    expect(b.dry_run).toBe(false)
    expect(b.force_restart).toBe(true)
    expect(b.max_budget_usd).toBe(1)
    // el pedido: rubro y plaza de la ficha, solo tendencia y oportunidad, sin cifras del cliente, idioma del manual
    expect(b.task).toMatch(/«restaurante» en Guayaquil/)
    expect(b.task).toMatch(/NO analices competidores/)
    expect(b.task).toMatch(/NO escribas cifras del cliente/)
    expect(b.task).toMatch(/sin dato/)
    expect(b.task).toContain(ROTULO_INFORME_DE_MERCADO)
    expect(b.task).toMatch(/Idioma: el del manual del cliente/)
    expect(b.task).not.toMatch(/Ecuador|tuteo/)
  })

  it('el tope del pedido viaja al corredor si es válido (0 < x ≤ 5) · si no, el de omisión', async () => {
    const e1 = corredor({ output: INFORME_OK, cost_usd: 0 })
    await pedir({ ...PEDIDO, tope_usd: 0.8 })
    expect(cuerpoAlCorredor(e1).max_budget_usd).toBe(0.8)
    const e2 = corredor({ output: INFORME_OK, cost_usd: 0 })
    await pedir({ ...PEDIDO, tope_usd: 50 })
    expect(cuerpoAlCorredor(e2).max_budget_usd).toBe(1)
  })

  it('rubro y plaza del pedido mandan sobre la ficha · y entonces la ficha NO se lee', async () => {
    const espia = corredor({ output: INFORME_OK, cost_usd: 0 })
    await pedir({ ...PEDIDO, params: { rubro: 'gimnasio', plaza: 'Quito', idioma: 'inglés' } })
    expect(supabaseMock.from).not.toHaveBeenCalledWith('clients') // (desde la firma 2 sí se lee `cadena_config` por el método; la ficha, no)
    const b = cuerpoAlCorredor(espia)
    expect(b.task).toMatch(/«gimnasio» en Quito/)
    expect(b.task).toMatch(/Idioma: inglés/)
  })

  it('fuera de 3–5 señales ⇒ trajo igual, con aviso', async () => {
    corredor({ output: '- una sola señal · fuente: x · fecha: 2026 · confianza: baja · oportunidad: y · faltó: z', cost_usd: 0.1 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('trajo')
    expect(String(json.datos.aviso)).toMatch(/trajo 1 señal/)
  })

  it('si el agente ya puso el rótulo, no se duplica', async () => {
    corredor({ output: `${ROTULO_INFORME_DE_MERCADO}\n${INFORME_OK}`, cost_usd: 0.1 })
    const { json } = await leer(await pedir(PEDIDO))
    expect((String(json.datos.informe).match(/PROPUESTA: no es dato del cliente/g) ?? []).length).toBe(1)
  })
})

describe('🔴 NO se llama al agente (US$ 0) · y el hueco dice por qué', () => {
  const casos: ReadonlyArray<[string, Record<string, unknown>, RegExp]> = [
    ['sin workflow_id', { workflow_id: undefined }, /firma de la corrida[\s\S]*workflow_id/],
    ['sin workflow_execution_id', { workflow_execution_id: undefined }, /firma de la corrida[\s\S]*workflow_execution_id/],
    ['sin dry_run explícito', { dry_run: undefined }, /el ensayo se decide, no se asume/],
    ['sin client_id', { client_id: undefined }, /falta client_id/],
  ]
  for (const [etq, quitar, esperado] of casos) {
    it(etq + ' ⇒ sin_respuesta · y el corredor NO recibe nada', async () => {
      const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
      const { status, json } = await leer(await pedir({ ...PEDIDO, ...quitar }))
      expect(status).toBe(200)
      expect(json.estado).toBe('sin_respuesta')
      expect(json.motivo).toMatch(esperado)
      expect(json.motivo).not.toMatch(/fui, mir/i)
      expect(espia).not.toHaveBeenCalled()
      expect(validarRespuesta(json)).toEqual([])
    })
  }

  it('🔴 EN ENSAYO (`dry_run: true`) ⇒ sin_respuesta declarado · el agente NO se llama · nada se gasta', async () => {
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { json } = await leer(await pedir({ ...PEDIDO, dry_run: true }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/fue un ensayo/)
    expect(json.motivo).toMatch(/no se llamó ni se gastó/)
    expect(json.datos).toEqual({})
    expect(espia).not.toHaveBeenCalled()
  })

  it('🔴 sin rubro en la ficha ⇒ sin_respuesta «falta industry en la ficha» · NO se preguntó', async () => {
    ficha({ name: 'Negocio', industry: null, market: 'Guayaquil', country: 'EC' })
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/falta industry en la ficha/)
    expect(json.motivo).toMatch(/NO se consultó/)
    expect(espia).not.toHaveBeenCalled()
  })

  it('la ficha no existe o no se pudo leer ⇒ sin_respuesta con el motivo · no «sin rubro»', async () => {
    ficha(null, { message: 'permission denied' })
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no se pudo leer la ficha[\s\S]*permission denied/)
    expect(espia).not.toHaveBeenCalled()
  })

  it('sin llave ⇒ sin_respuesta · 200', async () => {
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { status, json } = await leer(await pedir(PEDIDO, 'mala'))
    expect(status).toBe(200)
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/x-api-key/)
    expect(espia).not.toHaveBeenCalled()
  })

  it('sin credencial interna para llamar al corredor ⇒ sin_respuesta «no contestó · modelo_no_configurado»', async () => {
    delete process.env.INTERNAL_API_KEY
    // la puerta de entrada está simulada (acepta «ok»); lo que falta es la llave de SALIDA hacia run-sdk
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/modelo_no_configurado/)
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('🔴 lo que el agente contesta · información vs hueco', () => {
  it('«sin dato» sin señales ⇒ sin_dato · fui, miré y no hay · el analista NO estimó', async () => {
    corredor({ output: 'Sin dato: no encontré fuentes públicas de tendencia para esta categoría en esta plaza. Habría que mirar el boletín sectorial.', cost_usd: 0.05 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_dato')
    expect(json.motivo).toMatch(/fui, miré y no hay/)
    expect(json.motivo).toMatch(/no estimó/)
  })

  it('un informe sin líneas de lista ni «sin dato» ⇒ sin_respuesta · no se usa', async () => {
    corredor({ output: 'El mercado va bien y crecerá mucho el año próximo.', cost_usd: 0.3 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no trae señales legibles/)
    expect(json.motivo).not.toMatch(/fui, mir/i)
  })

  it('el agente devolvió vacío ⇒ sin_respuesta', async () => {
    corredor({ output: '   ', cost_usd: 0.3 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/devolvió vacío/)
  })

  it('🔴 el corredor rechaza (403 · sin flujo) ⇒ sin_respuesta con el código · nunca «no hay»', async () => {
    corredor({ error: 'workflow_id requerido' }, 403)
    const { status, json } = await leer(await pedir(PEDIDO))
    expect(status).toBe(200)
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/run_sdk_403/)
    expect(json.motivo).not.toMatch(/fui, mir/i)
  })

  it('el corredor caído ⇒ sin_respuesta · nunca 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const { status, json } = await leer(await pedir(PEDIDO))
    expect(status).toBe(200)
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/ECONNREFUSED/)
  })

  it('el techo de tiempo se CUMPLE', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* nunca contesta */ })))
    const { json } = await leer(await pedir({ ...PEDIDO, limite_ms: 60 }))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/se agotó el tiempo dado · 60 ms/)
    expect(json.limite_ms).toBe(60)
  })
})

describe('la lista · una respuesta por pedido, en orden', () => {
  it('dos pedidos (uno en ensayo, otro sin rubro) ⇒ dos huecos distintos · y ninguno llama al agente', async () => {
    ficha({ name: 'N', industry: null, market: null, country: null })
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { sobre } = await leer(await pedir({ ...PEDIDO, pedidos: [{ objetivo: 'a', dry_run: true, params: { rubro: 'cafetería' } }, { objetivo: 'b', params: { rubro: '' } }] }))
    expect(sobre.respuestas.map((x) => x.objetivo)).toEqual(['a', 'b'])
    expect(sobre.respuestas[0].motivo).toMatch(/ensayo/)
    expect(sobre.respuestas[1].motivo).toMatch(/falta industry en la ficha/)
    expect(sobre.resumen.sin_respuesta).toBe(2)
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('el envoltorio solo · sin red', () => {
  it('reserva 4 de CC3 · una señal vale solo con fuente Y fecha en su línea, de cualquier marcador de lista; «sin dato», sin fuente o sin fecha no cuentan', () => {
    const con = (m: string) => `${m} sube la demanda · fuente: boletín del sector (sector.org) · fecha: 2026-03 · oportunidad: x`
    expect(contarSenales(['- a', '* b', '• c', '1. d', '2) e', 'texto suelto', '-sin espacio'].join('\n'))).toBe(0)
    expect(contarSenales([con('-'), con('*'), con('•'), con('1.'), con('2)'), 'texto suelto ' + con(''), '-' + con('').trimStart()].join('\n'))).toBe(5)
    expect(esSenal('- tendencia fuerte en la plaza · fuente: informe anual (x.com) · 2025')).toBe(true)
    expect(esSenal('- tendencia fuerte en la plaza · fuente: informe anual (x.com)')).toBe(false) // sin fecha
    expect(esSenal('- tendencia fuerte en la plaza · 2026-01 · confianza: alta')).toBe(false) // sin fuente
    expect(esSenal('- sin dato sobre turismo interno · fuente: ninguna · 2026')).toBe(false) // «sin dato» es información, no señal
    expect(lineasQueNoCuentan(INFORME_OK)).toBe(1)
  })
  it('reserva 4 de CC3 · un informe cuyas líneas de lista no traen fuente y fecha ⇒ sin_respuesta (son estimaciones, no señales) · y lo dice', async () => {
    const r = await brazoMercado({ objetivo: 'o', fuente: 'f', rubro: 'restaurante', dry_run: false, pedir: async () => ({ ok: true, salida: '- crece el delivery en la plaza\n- la gente desayuna más temprano', costo_usd: 0.1 }) })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/2 línea\(s\) de lista pero ninguna con fuente Y fecha/)
  })
  it('M13 · la ficha del cliente NO existe (sin error de la base) ⇒ sin_respuesta «no existe la ficha» · no se llama al agente', async () => {
    ficha(null)
    const espia = corredor({ output: INFORME_OK, cost_usd: 1 })
    const { json } = await leer(await pedir(PEDIDO))
    expect(json.estado).toBe('sin_respuesta')
    expect(json.motivo).toMatch(/no existe la ficha del cliente c/)
    expect(espia).not.toHaveBeenCalled()
  })
  it('brazoMercado con rubro vacío NO llama a `pedir`', async () => {
    const pedirFn = vi.fn()
    const r = await brazoMercado({ objetivo: 'o', fuente: 'f', rubro: '  ', dry_run: false, pedir: pedirFn })
    expect(r.estado).toBe('sin_respuesta')
    expect(r.motivo).toMatch(/falta industry en la ficha/)
    expect(pedirFn).not.toHaveBeenCalled()
  })
  it('tareaDeMercado sin plaza ni país lo DECLARA en vez de inventar', () => {
    const t = tareaDeMercado({ ficha: { nombre: null, rubro: 'x', plaza: null, pais: null }, idioma: null })
    expect(t).toMatch(/sin dato en la ficha: dilo/)
    expect(t).toMatch(/idioma oficial de su país/)
  })

  // FIRMA 2 de Emilio (31-oct 20:29Z · punto 2): `market_research_analyst` + `audience-belief-mapper` como capa local, después de las reglas (que mandan) y antes del propósito
  it('🔴 con método la tarea lo trae DESPUÉS de las reglas y ANTES del propósito; sin método (apagado) es la de hoy byte a byte', () => {
    const base = { ficha: { nombre: null, rubro: 'x', plaza: 'Quito', pais: 'EC' }, idioma: null, proposito: 'el plan' }
    const hoy = tareaDeMercado(base)
    expect(tareaDeMercado({ ...base, metodo: null })).toBe(hoy)
    const con = tareaDeMercado({ ...base, metodo: METODO_MERCADO_POR_OMISION })
    expect(con).toContain('# MÉTODO (capa local · audience-belief-mapper')
    expect(con.indexOf('Respeta el trato')).toBeLessThan(con.indexOf('# MÉTODO'))
    expect(con.indexOf('# MÉTODO')).toBeLessThan(con.indexOf('Para qué sirve en el plan'))
    // el método no fija idioma ni trato y no rompe el contrato de la señal (fuente + fecha en la línea de lista)
    expect(METODO_MERCADO_POR_OMISION).toMatch(/UNA línea de lista con su fuente .* y su fecha/)
    expect(METODO_MERCADO_POR_OMISION).not.toMatch(/\b(tuteo|voseo|en español|in english)\b/i)
  })
  // FIRMA 5 de Emilio (31-oct 21:09Z): la identidad fija otro idioma para los informes internos; el pedido lo corrige SIEMPRE (con o sin método), sin tocar la identidad
  it('🔴 el pedido dice que la regla de idioma del manual manda sobre la de la identidad, con y sin método, y antes del método', () => {
    const base = { ficha: { nombre: null, rubro: 'x', plaza: 'Quito', pais: 'EC' }, idioma: 'español' }
    const FRASE = 'Esta regla manda sobre cualquier regla de tu identidad que fije otro idioma para los informes.'
    const sin = tareaDeMercado(base)
    expect(sin).toContain(`- Idioma: español. Respeta el trato (tú, vos, usted u otro) que fije el manual del cliente; no lo cambies. ${FRASE}`)
    const con = tareaDeMercado({ ...base, metodo: METODO_MERCADO_POR_OMISION })
    expect(con).toContain(FRASE)
    expect(con.indexOf(FRASE)).toBeLessThan(con.indexOf('# MÉTODO'))
    expect(con).toContain('# MÉTODO (capa local · product-trend-researcher (proceso, sin producto)')
  })
  it('🔴 la puerta lee `cadena_config.metodos.mercado` por el almacén de la cadena: sin fila va el de omisión; `false` lo apaga; si la lectura falla va el de omisión', async () => {
    const qFicha = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { name: 'N', industry: 'restaurante', market: 'Guayaquil', country: 'EC' }, error: null })) }
    qFicha.select.mockReturnValue(qFicha); qFicha.eq.mockReturnValue(qFicha)
    const qConfig = (valor: unknown, error: { message: string } | null = null) => {
      const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: valor === undefined ? null : { valor }, error })) }
      q.select.mockReturnValue(q); q.eq.mockReturnValue(q)
      return q
    }
    const conConfig = (q: unknown) => supabaseMock.from.mockImplementation((t: string) => (t === 'cadena_config' ? q : qFicha))

    conConfig(qConfig(undefined))
    const e1 = corredor({ output: INFORME_OK, cost_usd: 0 })
    await pedir(PEDIDO)
    expect(cuerpoAlCorredor(e1).task).toContain('# MÉTODO (capa local · audience-belief-mapper')

    conConfig(qConfig({ mercado: false }))
    const e2 = corredor({ output: INFORME_OK, cost_usd: 0 })
    await pedir(PEDIDO)
    expect(cuerpoAlCorredor(e2).task).not.toContain('# MÉTODO')

    conConfig(qConfig({ mercado: 'mi método propio' }))
    const e3 = corredor({ output: INFORME_OK, cost_usd: 0 })
    await pedir(PEDIDO)
    expect(cuerpoAlCorredor(e3).task).toContain('\nmi método propio\n')

    conConfig(qConfig(undefined, { message: 'base caída' }))
    const e4 = corredor({ output: INFORME_OK, cost_usd: 0 })
    const r4 = await leer(await pedir(PEDIDO))
    expect(r4.json.estado).toBe('trajo')
    expect(cuerpoAlCorredor(e4).task).toContain('# MÉTODO (capa local · audience-belief-mapper')
  })
})
