/**
 * 01-nov · la puerta POST /api/planeacion/mesa-de-analisis con sus candados · US$ 0 · sin red (base falsa, corredor y portero simulados con `fetch` anotado).
 *   · sin `dry_run` explícito o sin firma: no se llama a nadie;
 *   · en ensayo: se lee el material (el portero registra la consulta) y se declara «no se miró»: cero llamadas;
 *   · en real con la palanca apagada (por omisión): cero llamadas; con palanca pero analista no instalado: cero llamadas;
 *   · en real, encendida para ESTE cliente: UNA llamada al corredor con el tope y la firma, el informe vuelve con sus citas del material
 *     y se archiva por la puerta del portero (su resultado viaja en `datos.archivado`);
 *   · el tope de la mesa (US$ 5) deja fuera al sexto pedido (los 5 de la corrida caben); un tipo desconocido es pedido inválido.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseFalsa } from '../../portero-alimenta/__tests__/base-falsa'

const C = '11111111-1111-4111-8111-111111111111'
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LLAVE = 'llave-interna-456'
let base: ReturnType<typeof crearBaseFalsa>
let configs: Record<string, unknown> = {}
const llamadas: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
let respuestaDelCorredor: () => Response

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => base.db }))
vi.mock('@/lib/cadena/almacen-supabase', () => ({ almacenDeSupabase: () => ({ leerConfig: async (k: string) => configs[k] }) }))

import { POST } from '../../../app/api/planeacion/mesa-de-analisis/route'

const ficha = (id: string, o: Record<string, unknown>) => ({
  id, client_id: C, ref: 'brazo:x', clase: 'resenas', atributo: '', titulo: '', que_es: '', contenido: '', observado_en: '2026-10-30T10:00:00Z', fecha_fuente: '2026-10-30', creado_en: '2026-10-30T10:00:00Z',
  reconfirmado_en: null, vigente_hasta: null, alcance: null, sede: null, origen: 'apify', propiedad: null, porque: null, provenance_tag: {}, retirada_en: null, descartada: false, ...o,
})

beforeEach(() => {
  llamadas.length = 0
  configs = {}
  respuestaDelCorredor = () => new Response(JSON.stringify({ output: `- Repiten «lento» en las reseñas [${F1}] · riesgo · faltó horario\n- Preguntan precios sin respuesta [${F2}]\n- Elogian el lugar [${F1}]`, cost_usd: 0.42 }), { status: 200 })
  base = crearBaseFalsa({
    clients: [{ id: C, name: 'Cliente Zeta', industry: 'cafetería', market: 'Cuenca', country: 'Ecuador', status: 'active' }],
    agents: [{ name: 'competitive-intelligence-agent', is_active: true }, { name: 'market_research_analyst', is_active: true }, { name: 'growth-hacker', is_active: true }],
    cerebro_fichas: [
      ficha('rv', { clase: 'resumen_vivo', atributo: 'resumen:cliente', contenido: 'RESUMEN '.repeat(600) }),
      ficha(F1, { clase: 'comentarios', atributo: 'comentarios:ig', titulo: 'Comentarios', contenido: 'competidor Rival publica anuncios de combos; comentarios dicen lento' }),
      ficha(F2, { clase: 'competidor_anuncios', atributo: 'competidor:rival', titulo: 'Rival', contenido: 'el competidor rival anuncia 2x1 los jueves' }),
    ],
    cerebro_consultas: [],
  } as never)
  vi.stubEnv('INTERNAL_API_KEY', LLAVE)
  vi.stubEnv('FINANZAS_RUN_SDK_BASE', 'http://corredor.prueba')
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    llamadas.push({ url: String(url), cuerpo })
    if (String(url).endsWith('/api/agents/run-sdk')) return respuestaDelCorredor()
    if (String(url).endsWith('/api/brain/alimentar/informe')) return new Response(JSON.stringify({ ok: true, ficha_id: 'informe-1' }), { status: 200 })
    return new Response('{}', { status: 404 })
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const URL_ = 'http://x/api/planeacion/mesa-de-analisis'
const sobre = (o: Record<string, unknown>) => new Request(URL_, { method: 'POST', headers: { 'x-api-key': LLAVE, 'content-type': 'application/json' }, body: JSON.stringify(o) })
const firma = { workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '424242' }
const pedido = (tipo: string, o: Record<string, unknown> = {}) => ({ objetivo: `informe de ${tipo}`, params: { tipo, idioma: 'español', trato: 'tú' }, ...o })
const respuestas = async (r: Response) => ((await r.json()) as { respuestas: Array<Record<string, unknown>>; resumen: unknown }).respuestas

describe('la puerta de la mesa de análisis · candados antes de gastar', () => {
  it('sin llave: un solo renglón sin_respuesta; sin `dry_run`: no se preguntó; sin firma: pedido inválido · cero llamadas', async () => {
    const sinLlave = await respuestas(await POST(new Request(URL_, { method: 'POST', body: JSON.stringify({ client_id: C, pedidos: [pedido('competencia')] }) })))
    expect(sinLlave).toHaveLength(1); expect(sinLlave[0]).toMatchObject({ brazo: 'analisis', estado: 'sin_respuesta' })
    const sinSeco = await respuestas(await POST(sobre({ client_id: C, ...firma, pedidos: [pedido('competencia')] })))
    expect(sinSeco[0]).toMatchObject({ estado: 'sin_respuesta' }); expect(String(sinSeco[0].motivo)).toMatch(/falta `dry_run` explícito/)
    const sinFirma = await respuestas(await POST(sobre({ client_id: C, dry_run: false, pedidos: [pedido('competencia')] })))
    expect(String(sinFirma[0].motivo)).toMatch(/falta la firma de la corrida/)
    expect(llamadas).toEqual([])
  })
  it('sin llave interna y con un sobre por lo demás VÁLIDO (palanca encendida, ensayo): la puerta rechaza la llamada antes de leer nada', async () => {
    configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
    const sobreValidoSinLlave = { client_id: C, dry_run: true, ...firma, pedidos: [pedido('competencia')] }
    const rs = await respuestas(await POST(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sobreValidoSinLlave) })))
    expect(rs).toHaveLength(1)
    expect(rs[0]).toMatchObject({ brazo: 'analisis', estado: 'sin_respuesta' })
    expect(String(rs[0].motivo)).toMatch(/la puerta rechazó la llamada/)
    expect(base.escrituras).toEqual([])
    expect(llamadas).toEqual([])
    // el mismo sobre CON llave sí lee el material (prueba de que lo único que faltaba era la llave)
    const conLlave = await respuestas(await POST(sobre(sobreValidoSinLlave)))
    expect(String(conLlave[0].fuente)).toMatch(/material: 2 ficha\(s\)/)
  })
  it('en ensayo lee el material (el portero registra la consulta) y declara que NO se miró: cero llamadas, US$ 0', async () => {
    const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: true, ...firma, pedidos: [pedido('competencia')] })))
    expect(rs[0]).toMatchObject({ brazo: 'analisis', estado: 'sin_respuesta' })
    expect(String(rs[0].motivo)).toMatch(/fue un ensayo \(dry-run\).*no se llamó, no se gastó ni se archivó/)
    expect(String(rs[0].fuente)).toMatch(/material: 2 ficha\(s\) \+ resumen vivo · tope US\$ 1\.00/)
    expect(base.escrituras.filter((e) => e.tabla === 'cerebro_consultas')).toHaveLength(1)
    expect(llamadas).toEqual([])
  })
  it('en corrida real con la palanca apagada (por omisión) no llama a nadie; encendida para OTRO cliente tampoco', async () => {
    const r1 = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
    expect(String(r1[0].motivo)).toMatch(/apagada por omisión.*NO se preguntó · US\$ 0/)
    configs = { mesa_de_analisis: { encendida: true, clientes: ['otro'] } }
    const r2 = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
    expect(String(r2[0].motivo)).toMatch(/este cliente no está en/)
    expect(llamadas).toEqual([])
    expect(base.escrituras.filter((e) => e.tabla === 'cerebro_consultas')).toHaveLength(0)
  })
  it('un analista que no está instalado se declara y no se llama; un tipo desconocido es pedido inválido', async () => {
    configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
    const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('voz_del_publico'), pedido('creativos')] })))
    expect(String(rs[0].motivo)).toMatch(/«feedback-synthesizer» no está instalado/)
    expect(String(rs[1].motivo)).toMatch(/falta `params.tipo` o no es uno de/)
    expect(llamadas).toEqual([])
  })
})

describe('la puerta de la mesa de análisis · corrida real encendida', () => {
  beforeEach(() => { configs = { mesa_de_analisis: { encendida: true, clientes: [C] } } })
  it('UNA llamada al corredor con agente, firma, paso y tope; el informe vuelve con sus citas y se archiva por la puerta del portero', async () => {
    const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia', { proposito: 'saber el hueco' })] })))
    expect(rs[0]).toMatchObject({ brazo: 'analisis', estado: 'trajo' })
    const d = rs[0].datos as Record<string, unknown>
    expect(d).toMatchObject({ tipo: 'competencia', agente: 'competitive-intelligence-agent', es_dato_del_cliente: false, hallazgos: 3, costo_usd: 0.42, archivado: { ok: true, ficha_id: 'informe-1' } })
    expect([...(d.citas as string[])].sort()).toEqual([F1, F2])
    expect(String(d.informe).startsWith('[informe de análisis · competencia · PROPUESTA: no es dato del cliente]')).toBe(true)
    expect(llamadas.map((l) => l.url)).toEqual(['http://corredor.prueba/api/agents/run-sdk', 'http://corredor.prueba/api/brain/alimentar/informe'])
    expect(llamadas[0].cuerpo).toMatchObject({ agent: 'competitive-intelligence-agent', client_id: C, workflow_id: firma.workflow_id, workflow_execution_id: '424242:analisis-competencia', dry_run: false, force_restart: true, max_budget_usd: 1 })
    const tarea = String(llamadas[0].cuerpo.task)
    expect(tarea).toMatch(/Idioma: español\. Trato: tú\./); expect(tarea).toContain(`[${F1}]`); expect(tarea).toContain('RESUMEN RESUMEN'); expect(tarea).toContain('Para qué sirve en el plan: saber el hueco')
    // «vos» aparece como VALOR del trato («tú, vos, usted u otro»): el voseo se busca por conjugación
    expect(tarea).not.toMatch(/\b(sabés|tenés|podés|decí|escribí)\b/)
    expect(llamadas[1].cuerpo).toMatchObject({ client_id: C, tipo: 'competencia', dry_run: false, pedido_por: { oficina: 'mesa_de_analisis', agente: 'competitive-intelligence-agent' }, workflow_id: firma.workflow_id, workflow_execution_id: '424242' })
    expect([...(llamadas[1].cuerpo.citas as string[])].sort()).toEqual([F1, F2])
  })
  it('si el portero no archiva (palanca PORTERO_INFORMES apagada), el informe igual vuelve y el motivo viaja en `archivado`', async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) })
      if (String(url).endsWith('/api/agents/run-sdk')) return respuestaDelCorredor()
      return new Response(JSON.stringify({ error: 'portero_apagado', detalle: 'PORTERO_INFORMES no está en on' }), { status: 403 })
    })
    const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
    expect(rs[0].estado).toBe('trajo')
    expect((rs[0].datos as Record<string, unknown>).archivado).toMatchObject({ ok: false, detalle: expect.stringMatching(/no archivó \(403\) · portero_apagado/) })
  })
  it('🔴 la puerta apagada contesta 200 sin guardar: eso no se reporta como archivado', async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      if (String(url).endsWith('/api/agents/run-sdk')) return respuestaDelCorredor()
      return new Response(JSON.stringify({ apagado: true, detalle: 'PORTERO_INFORMES está apagado: no se leyó ni se escribió nada' }), { status: 200 })
    })
    configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
    const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
    expect((rs[0].datos as Record<string, unknown>).archivado).toMatchObject({ ok: false, detalle: expect.stringMatching(/su puerta está apagada/) })
  })
  it('un informe sin hallazgos sostenidos no se usa; «sin dato» declarado es sin_dato; nada se archiva en esos casos', async () => {
    respuestaDelCorredor = () => new Response(JSON.stringify({ output: '- esto lo estimo sin cita', cost_usd: 0.1 }), { status: 200 })
    const r1 = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
    expect(r1[0].estado).toBe('sin_respuesta'); expect(String(r1[0].motivo)).toMatch(/1 línea\(s\) de lista pero ninguna sostenida/)
    respuestaDelCorredor = () => new Response(JSON.stringify({ output: 'sin dato: el cerebro no trae anuncios de competidores; habría que raspar Meta Ads', cost_usd: 0.05 }), { status: 200 })
    const r2 = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
    expect(r2[0].estado).toBe('sin_dato'); expect(String(r2[0].motivo)).toMatch(/declaró «sin dato»/)
    expect(llamadas.filter((l) => l.url.endsWith('/informe'))).toEqual([])
  })
  it('el tope de la mesa (US$ 5) deja entrar los 5 pedidos de la corrida y deja fuera al sexto sin llamarlo; los demás reciben su tope', async () => {
    const tipos = ['competencia', 'mercado', 'retencion', 'competencia', 'retencion', 'mercado']
    const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: tipos.map((t) => pedido(t)) })))
    expect(rs).toHaveLength(6)
    expect(String(rs[5].motivo)).toMatch(/el tope de la mesa \(US\$ 5 por sobre\) no alcanza/)
    expect(rs.slice(0, 5).every((r) => !/tope de la mesa/.test(String(r.motivo ?? '')))).toBe(true)
    const primeras = llamadas.filter((l) => l.url.endsWith('/run-sdk') && !String(l.cuerpo.paso).endsWith('-reintento'))
    expect(primeras).toHaveLength(5)
    expect(primeras.every((l) => l.cuerpo.max_budget_usd === 1)).toBe(true)
  })
  describe('05-nov · el analista que falla se reintenta una vez, y si vuelve a fallar se dice', () => {
    const SIRVE = () => new Response(JSON.stringify({ output: `- Repiten «lento» [${F1}]\n- Preguntan precios [${F2}]\n- Elogian el local [${F1}]`, cost_usd: 0.2 }), { status: 200 })
    const ROTO = () => new Response(JSON.stringify({ error: 'se cayó' }), { status: 500 })
    const corredor = () => llamadas.filter((l) => l.url.endsWith('/run-sdk'))
    const corrida = async (tipos: string[] = ['competencia']) => {
      configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
      return respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: tipos.map((t) => pedido(t)) })))
    }

    it('🔴 falla una vez y el segundo intento sirve: hay informe, se archiva una vez, y el reintento lleva su rótulo', async () => {
      const cola = [ROTO, SIRVE]
      respuestaDelCorredor = () => (cola.shift() as () => Response)()
      const rs = await corrida()
      expect(rs[0].estado).toBe('trajo')
      expect(corredor().map((l) => l.cuerpo.paso)).toEqual(['analisis-competencia', 'analisis-competencia-reintento'])
      expect(corredor().map((l) => l.cuerpo.workflow_execution_id)).toEqual(['424242:analisis-competencia', '424242:analisis-competencia-reintento'])
      expect(llamadas.filter((l) => l.url.endsWith('/informe'))).toHaveLength(1)
    })
    it('🔴 el costo que informa suma los dos intentos', async () => {
      const cola = [() => new Response(JSON.stringify({ output: '- estimo sin cita', cost_usd: 0.1 }), { status: 200 }), SIRVE]
      respuestaDelCorredor = () => (cola.shift() as () => Response)()
      const rs = await corrida()
      expect((rs[0].datos as Record<string, unknown>).costo_usd).toBeCloseTo(0.3)
    })
    it('🔴 falla dos veces: una sola repetición, sin informe, sin archivar, y dice por qué los dos intentos', async () => {
      respuestaDelCorredor = ROTO
      const rs = await corrida()
      expect(corredor()).toHaveLength(2)
      expect(rs[0].estado).toBe('sin_respuesta')
      expect(String(rs[0].motivo)).toMatch(/^no hubo informe: el analista falló en los 2 intentos · 1\.º: .*run_sdk_500.* · 2\.º: .*run_sdk_500/)
      expect(llamadas.filter((l) => l.url.endsWith('/informe'))).toEqual([])
    })
    it('🔴 un informe sin nada sostenido también es una falla y se reintenta', async () => {
      respuestaDelCorredor = () => new Response(JSON.stringify({ output: '- esto lo estimo sin cita', cost_usd: 0.1 }), { status: 200 })
      await corrida()
      expect(corredor()).toHaveLength(2)
    })
    it('🔴 vale igual para cualquier analista: el reintento no distingue el tipo', async () => {
      respuestaDelCorredor = ROTO
      const rs = await corrida(['competencia', 'mercado', 'retencion'])
      for (const r of rs) expect(String(r.motivo)).toMatch(/^no hubo informe/)
      expect(corredor()).toHaveLength(6)
    })
    it('🔴 «sin dato» declarado NO es una falla: no se reintenta', async () => {
      respuestaDelCorredor = () => new Response(JSON.stringify({ output: 'sin dato: el cerebro no trae eso', cost_usd: 0.05 }), { status: 200 })
      const rs = await corrida()
      expect(rs[0].estado).toBe('sin_dato')
      expect(corredor()).toHaveLength(1)
    })
    it('🔴 la mesa apagada no gasta ni reintenta', async () => {
      configs = {}
      const rs = await respuestas(await POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] })))
      expect(rs[0].estado).toBe('sin_respuesta')
      expect(corredor()).toEqual([])
    })
    it('🔴 un analista colgado se corta antes de que la plataforma mate la puerta, y lo dice', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
          llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
          return new Promise<Response>(() => {})
        })
        configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
        const salida = POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia')] }))
        await vi.advanceTimersByTimeAsync(780_000)
        const rs = await respuestas(await salida)
        expect(String(rs[0].motivo)).toMatch(/^no hubo informe: el analista falló y no se pudo reintentar · no queda tiempo/)
        expect(corredor()).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })
    it('🔴 reparo de CC6: si 4 se cuelgan, el quinto no entra, y la puerta contesta antes de que la maten', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
          llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
          return new Promise<Response>(() => {})
        })
        configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
        const salida = POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: ['competencia', 'competencia', 'competencia', 'competencia', 'competencia'].map((t) => pedido(t)) }))
        await vi.advanceTimersByTimeAsync(780_000)
        const rs = await respuestas(await salida)
        expect(corredor()).toHaveLength(4)
        expect(rs).toHaveLength(5)
        for (const r of rs) expect(String(r.motivo)).toMatch(/^no hubo informe/)
        expect(String(rs[4].motivo)).toMatch(/no quedó tiempo en la puerta para llamarlo/)
      } finally {
        vi.useRealTimers()
      }
    })
    it('🔴 reparo de CC6: el reintento se paga con lo que queda, no con el tope entero', async () => {
      let n = 0
      vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
        if (String(url).endsWith('/api/brain/alimentar/informe')) return new Response(JSON.stringify({ ok: true, ficha_id: 'x' }), { status: 200 })
        n += 1
        if (n <= 4) return new Response(JSON.stringify({ output: `- Uno [${F1}]\n- Dos [${F2}]\n- Tres [${F1}]`, cost_usd: 0.95 }), { status: 200 })
        if (n === 5) { await new Promise((listo) => setTimeout(listo, 30)); return new Response(JSON.stringify({ output: '- estimo sin cita', cost_usd: 0.6 }), { status: 200 }) }
        return new Response(JSON.stringify({ output: `- Uno [${F1}]\n- Dos [${F2}]\n- Tres [${F1}]`, cost_usd: 0.3 }), { status: 200 })
      })
      await corrida(['competencia', 'competencia', 'competencia', 'competencia', 'competencia'])
      expect(corredor()).toHaveLength(6)
      expect(Number(corredor()[5].cuerpo.max_budget_usd)).toBeCloseTo(0.6)
    })
    it('🔴 el límite que trae el pedido manda si es menor', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
          llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
          return new Promise<Response>(() => {})
        })
        configs = { mesa_de_analisis: { encendida: true, clientes: [C] } }
        const salida = POST(sobre({ client_id: C, dry_run: false, ...firma, pedidos: [pedido('competencia', { limite_ms: 1000 })] }))
        await vi.advanceTimersByTimeAsync(2000)
        const rs = await respuestas(await salida)
        expect(String(rs[0].motivo)).toMatch(/1000 ms.*1000 ms/)
      } finally {
        vi.useRealTimers()
      }
    })
    it('🔴 el reintento recibe el tope del analista, sin pasar del tope firmado', async () => {
      respuestaDelCorredor = ROTO
      await corrida()
      expect(corredor().map((l) => l.cuerpo.max_budget_usd)).toEqual([1, 1])
    })
  })
})
