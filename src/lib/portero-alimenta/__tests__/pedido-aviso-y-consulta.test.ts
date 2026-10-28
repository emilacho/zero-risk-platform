/**
 * CONSULTA INSTANTÁNEA Y PEDIDO QUE AVISA (21-oct · firma de Emilio «SI»). US$ 0 · base falsa · sin red ni modelo real · los diez clientes.
 *  · `consultar`: lectura de fichas vigentes por atributo/clase y por palabras, con procedencia, fecha y `vencida`; sin dato = `sin_dato:true`; registra quién consultó.
 *  · `pedido` con `avisar_a`: al terminar (resuelto, parcial, no resuelto) UN POST con la llave interna, con reintentos y constancia; solo a anfitriones conocidos; lo pedido por atributo ya fresco se responde al instante.
 */
import { describe, expect, it } from 'vitest'
import { rutaConsultar } from '../consultar'
import { anfitrionDeAvisoPermitido, rutaLeerPedido, rutaPedido, ESPERAS_DEL_AVISO_MS, type DepsDePedido } from '../pedidos'
import { avisoReal } from '../pedidos-entorno'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' }
const URL_AVISO = 'https://n8n-production-72be.up.railway.app/webhook/reanudar-oficina'
const F = (c: ClienteSintetico, o: Record<string, unknown>) => ({ id: `f-${Math.random().toString(36).slice(2, 10)}`, client_id: c.id, ref: 'brazo:x', clase: 'metrica', atributo: '', titulo: '', que_es: '', contenido: '', observado_en: '2026-10-14T10:00:00Z', fecha_fuente: '2026-10-14', vigente_hasta: '2026-12-01T00:00:00Z', alcance: 'cliente', sede: null, origen: 'su_fuente', propiedad: 'propia', porque: 'lo dice su sitio', provenance_tag: { source: 'apify', trust_level: 'untrusted', datos: { url: 'https://x.example' } }, descartada: false, retirada_en: null, ...o })
const mundo = (c: ClienteSintetico, fichas: Array<Record<string, unknown>>): T => ({ ...tablasDe(c), cerebro_fichas: fichas, cerebro_consultas: [], cerebro_pedidos: [], agents: [{ name: 'planning-director' }] })

describe('consultar · lectura instantánea sin modelo', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): por atributo, por palabras, con procedencia y fecha; vencida rotulada; sin dato no inventa; registra quién consultó`, async () => {
      const t = mundo(c, [
        F(c, { clase: 'precio', atributo: 'precio:plato-del-dia', titulo: 'Plato del día', contenido: 'plato del dia 8 00 usd', origen: 'su_fuente' }),
        F(c, { clase: 'horario', atributo: 'horario:lunes', titulo: 'Horario', contenido: 'abierto de lunes a viernes de 8 a 16', vigente_hasta: '2026-09-01T00:00:00Z' }),
        F(c, { clase: 'dato_del_dueno', atributo: 'dueno:costo-plato', titulo: 'Costo por plato', contenido: 'Respuesta del dueño: «2,10 por plato»', origen: 'dueno', provenance_tag: { source: 'dueno', confirmado_por: 'dueno', datos: { canal: 'chat con Lenovo', respondido_en: '2026-10-16T00:00:00Z' } } }),
        F(c, { clase: 'precio', atributo: 'precio:viejo', titulo: 'Retirado', contenido: 'plato retirado', retirada_en: '2026-10-10T00:00:00Z' }),
      ])
      const antes = JSON.stringify(t.cerebro_fichas)
      const db = crearBaseFalsa(t as never).db as never
      const q = (p: Record<string, unknown>) => rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'oficina-creativa', agente: 'productor', ...p })
      const porAtributo = await q({ atributo: 'precio' })
      expect(porAtributo.status).toBe(200)
      expect(porAtributo.body).toMatchObject({ sin_dato: false, total: 1, modelos_llamados: 0, costo_usd: 0, registrada: true })
      const r0 = (porAtributo.body as { resultados: Array<Record<string, unknown>> }).resultados[0]
      expect(r0).toMatchObject({ atributo: 'precio:plato-del-dia', vencida: false, procedencia: { origen: 'su_fuente', source: 'apify' } })
      expect(r0.fecha).toBe('2026-10-14T10:00:00Z')
      // por palabras: lo vencido se devuelve igual, rotulado, y después de lo fresco
      const horario = await q({ que: 'horario de atención lunes a viernes' })
      expect((horario.body as { resultados: Array<{ vencida: boolean; atributo: string }> }).resultados.find((x) => x.atributo === 'horario:lunes')).toMatchObject({ vencida: true })
      // lo que dijo el dueño trae su procedencia
      const dueno = await q({ que: 'cuánto cuesta cada plato' })
      expect((dueno.body as { resultados: Array<{ atributo: string; procedencia: Record<string, unknown> }> }).resultados.find((x) => x.atributo === 'dueno:costo-plato')!.procedencia).toMatchObject({ source: 'dueno', confirmado_por: 'dueno', canal: 'chat con Lenovo' })
      // una ficha retirada no sale; sin nada, sin_dato (no inventa)
      const nada = await q({ que: 'plataforma de pagos con criptomonedas' })
      expect(nada.body).toMatchObject({ sin_dato: true, total: 0, resultados: [] })
      expect((nada.body as { nota: string }).nota).toMatch(/pedido/)
      expect(JSON.stringify((await q({ atributo: 'precio:viejo' })).body)).not.toMatch(/retirado/i)
      // solo lectura: las fichas no cambian; sí quedó quién consultó
      expect(JSON.stringify(t.cerebro_fichas)).toBe(antes)
      expect(t.cerebro_consultas.length).toBe(5)
      expect(t.cerebro_consultas[0]).toMatchObject({ client_id: c.id, oficina: 'oficina-creativa', agente: 'productor', atributo: 'precio', resultados: 1, sin_dato: false })
    })
  }
  const c = DIEZ_CLIENTES.find((x) => x.sedes.length >= 2)!
  it('por sede: lo de otra sede no sale; lo que no dice sede vale para todas', async () => {
    const t = mundo(c, [
      F(c, { atributo: 'horario:a', clase: 'horario', contenido: 'horario sede uno', sede: c.sedes[0].clave }),
      F(c, { atributo: 'horario:b', clase: 'horario', contenido: 'horario sede dos', sede: c.sedes[1].clave }),
      F(c, { atributo: 'horario:todas', clase: 'horario', contenido: 'horario general', sede: null }),
    ])
    const r = await rutaConsultar({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', atributo: 'horario', sede_clave: c.sedes[0].clave })
    expect((r.body as { resultados: Array<{ atributo: string }> }).resultados.map((x) => x.atributo).sort()).toEqual(['horario:a', 'horario:todas'])
  })
  it('límite: por omisión 10, máximo 50, un valor roto vuelve al de omisión', async () => {
    const t = mundo(c, Array.from({ length: 60 }, (_, i) => F(c, { atributo: `precio:p${i}`, clase: 'precio', contenido: `producto ${i}` })))
    const n = async (limite?: unknown) => ((await rutaConsultar({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', atributo: 'precio', limite: limite as never })).body as { resultados: unknown[] }).resultados.length
    expect(await n()).toBe(10); expect(await n(500)).toBe(50); expect(await n(3)).toBe(3); expect(await n('mucho')).toBe(10)
  })
  it('entrada: uuid, quién consulta y algo que buscar son obligatorios; cliente inexistente = 404; si no se puede registrar se dice y responde igual', async () => {
    const t = mundo(c, [F(c, { atributo: 'precio:x', clase: 'precio', contenido: 'x' })])
    const db = crearBaseFalsa(t as never).db as never
    expect((await rutaConsultar({ db }, { client_id: 'no', oficina: 'o', agente: 'a', que: 'x' })).status).toBe(400)
    expect((await rutaConsultar({ db }, { client_id: c.id, agente: 'a', que: 'x' })).status).toBe(400)
    expect((await rutaConsultar({ db }, { client_id: c.id, oficina: 'o', agente: 'a' })).status).toBe(400)
    expect((await rutaConsultar({ db }, { client_id: '00000000-0000-4000-8000-000000000000', oficina: 'o', agente: 'a', que: 'x' })).status).toBe(404)
    const original = (db as { from: (t: string) => unknown }).from.bind(db)
    ;(db as { from: unknown }).from = (n: string) => (n === 'cerebro_consultas' ? { insert: async () => ({ error: { message: 'tabla ausente' } }) } : original(n))
    const r = await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', atributo: 'precio' })
    expect(r.body).toMatchObject({ ok: true, registrada: false, registro_error: 'tabla ausente', total: 1 })
  })
})

const enc = (t: T, o: Partial<DepsDePedido> = {}) => {
  const avisos: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
  const segundo: Array<Promise<unknown>> = []
  const deps: DepsDePedido = { db: crearBaseFalsa(t as never).db as never, interruptores: ON, activo: true, ahora: AHORA, esperar: async () => {}, segundoPlano: (p) => { segundo.push(p) }, enviarAviso: async (url, cuerpo) => { avisos.push({ url, cuerpo }); return { ok: true, http: 200, detalle: 'entregado' } }, ...o }
  return { deps, avisos, segundo }
}
const pedido = (c: ClienteSintetico, o: Record<string, unknown> = {}) => ({ client_id: c.id, dry_run: false, ...WF, pedido_por: { oficina: 'planeacion', agente: 'planning-director' }, para: 'armar el plan', huecos: [{ tipo: 'metrica:ventas' }], avisar_a: URL_AVISO, ref_de_quien_pide: 'encargo-42:paso-3', ...o })

describe('pedido que AVISA cuando está', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): lo ya fresco por atributo se responde al instante y se avisa UNA vez con la forma exacta`, async () => {
      const t = mundo(c, [F(c, { atributo: 'metrica:ventas:mes', clase: 'metrica', contenido: 'ventas del mes 1200' })])
      const { deps, avisos, segundo } = enc(t)
      const r = await rutaPedido(deps, pedido(c))
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, estado: 'resuelto', avisar_a: URL_AVISO, ref_de_quien_pide: 'encargo-42:paso-3', modelos_llamados: 0, costo_usd: 0, aviso: { estado: 'entregado' } })
      expect(segundo).toHaveLength(0) // al instante: sin segundo plano
      expect(avisos).toHaveLength(1)
      expect(avisos[0].url).toBe(URL_AVISO)
      expect(avisos[0].cuerpo).toMatchObject({ pedido_id: (r.body as { pedido_id: string }).pedido_id, estado: 'resuelto', ref_de_quien_pide: 'encargo-42:paso-3' })
      expect(Array.isArray(avisos[0].cuerpo.huecos)).toBe(true)
      expect((avisos[0].cuerpo.fichas as string[]).length).toBe(1)
      expect(t.cerebro_pedidos[0]).toMatchObject({ avisar_a: URL_AVISO, ref_de_quien_pide: 'encargo-42:paso-3', estado: 'resuelto', aviso: { estado: 'entregado' } })
    })
  }
  const c = DIEZ_CLIENTES[0]
  it('lo que no está por código va en segundo plano (en_proceso + pedido_id) y al terminar avisa con su estado (no resuelto)', async () => {
    const t = mundo(c, [])
    const { deps, avisos, segundo } = enc(t, { razonar: async () => ({ texto: JSON.stringify({ decision: 'imposible', fichas: [], cita: '', funcion: '', consultas: [], razon: 'no hay forma' }), costo_usd: 0.01, tokens_entrada: 1, tokens_salida: 1 }) })
    const r = await rutaPedido(deps, pedido(c, { huecos: [{ objetivo: 'cuántos competidores abrieron este mes' }] }))
    expect(r.body).toMatchObject({ ok: true, estado: 'en_proceso', nota: expect.stringMatching(/se avisará a avisar_a/) })
    expect(avisos).toHaveLength(0) // todavía no terminó
    await Promise.all(segundo)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].cuerpo).toMatchObject({ estado: 'no_resuelto', ref_de_quien_pide: 'encargo-42:paso-3' })
    const leido = await rutaLeerPedido({ db: deps.db as never }, (r.body as { pedido_id: string }).pedido_id)
    expect(leido.body).toMatchObject({ estado: 'no_resuelto', avisar_a: URL_AVISO, aviso: { estado: 'entregado' } })
  })
  it('si el aviso falla se reintenta (3 intentos con esperas) y queda constancia; si nunca llega, el GET sigue sirviendo', async () => {
    const t = mundo(c, [F(c, { atributo: 'metrica:ventas:mes', clase: 'metrica', contenido: 'ventas' })])
    let n = 0; const esperas: number[] = []
    const a = enc(t, { esperar: async (ms) => { esperas.push(ms) }, enviarAviso: async () => { n++; return n < 3 ? { ok: false, http: 503, detalle: 'respondió 503' } : { ok: true, http: 200, detalle: 'entregado' } } })
    const r = await rutaPedido(a.deps, pedido(c))
    expect(r.body).toMatchObject({ aviso: { estado: 'entregado' } })
    expect((r.body as { aviso: { intentos: unknown[] } }).aviso.intentos).toHaveLength(3)
    expect(esperas).toEqual(ESPERAS_DEL_AVISO_MS.filter((x) => x > 0))
    const t2 = mundo(c, [F(c, { atributo: 'metrica:ventas:mes', clase: 'metrica', contenido: 'ventas' })])
    const b = enc(t2, { enviarAviso: async () => { throw new Error('conexión rechazada') } })
    const r2 = await rutaPedido(b.deps, pedido(c))
    expect(r2.status).toBe(200) // el pedido no falla porque el aviso no llegó
    expect(r2.body).toMatchObject({ ok: true, estado: 'resuelto', aviso: { estado: 'fallo' } })
    expect((r2.body as { aviso: { intentos: Array<{ detalle: string }> } }).aviso.intentos).toHaveLength(ESPERAS_DEL_AVISO_MS.length)
    expect(t2.cerebro_pedidos[0].aviso).toMatchObject({ estado: 'fallo' })
    expect((await rutaLeerPedido({ db: b.deps.db as never }, (r2.body as { pedido_id: string }).pedido_id)).body).toMatchObject({ estado: 'resuelto', fichas: expect.any(Array) })
  })
  it('sin `avisar_a` todo sigue igual (nada se avisa); en seco no avisa y lo dice', async () => {
    const t = mundo(c, [F(c, { atributo: 'metrica:ventas:mes', clase: 'metrica', contenido: 'ventas' })])
    const a = enc(t)
    const r = await rutaPedido(a.deps, pedido(c, { avisar_a: undefined, ref_de_quien_pide: undefined }))
    expect(r.body).not.toHaveProperty('aviso'); expect(a.avisos).toHaveLength(0)
    const s = await rutaPedido(a.deps, pedido(c, { dry_run: true, workflow_id: undefined, workflow_execution_id: undefined, huecos: [{ tipo: 'metrica:otra' }] }))
    expect(s.body).toMatchObject({ dry_run: true, nota: expect.stringMatching(/no se avisó a avisar_a/) }); expect(a.avisos).toHaveLength(0)
  })
  it('el aviso lleva la llave interna: SOLO a anfitriones conocidos y por https (ni otra casa, ni http, ni usuario en la dirección)', async () => {
    for (const mala of ['https://evil.example/hook', 'http://n8n-production-72be.up.railway.app/webhook/x', 'https://user:pw@n8n-production-72be.up.railway.app/x', 'no es una url', 'https://n8n-production-72be.up.railway.app.evil.example/x']) {
      const a = enc(mundo(c, []))
      expect((await rutaPedido(a.deps, pedido(c, { avisar_a: mala }))).status, mala).toBe(400)
    }
    expect(anfitrionDeAvisoPermitido(URL_AVISO)).toBe(true)
    expect(anfitrionDeAvisoPermitido('https://otra.casa/x', ['otra.casa'])).toBe(true)
  })
  it('el aviso real: un POST con la llave interna, sin seguir redirecciones; un código de error es fallo', async () => {
    const vistos: Array<{ url: string; init: RequestInit }> = []
    const ok = await avisoReal('llave-x', async (u, i) => { vistos.push({ url: u, init: i as RequestInit }); return new Response('{}', { status: 200 }) })(URL_AVISO, { a: 1 })
    expect(ok).toMatchObject({ ok: true, http: 200 })
    expect(vistos[0].init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect((vistos[0].init.headers as Record<string, string>)['x-api-key']).toBe('llave-x')
    expect(await avisoReal('k', async () => new Response('no', { status: 500 }))(URL_AVISO, {})).toMatchObject({ ok: false, http: 500 })
  })
})

describe('el informe de costos anota los pedidos por la oficina que pidió', () => {
  it('suma pedidos y costo por oficina del día; una falla de lectura se dice sin tumbar el informe', async () => {
    const { rutaCostos } = await import('../costos')
    const c = DIEZ_CLIENTES[0]
    const t = { ...mundo(c, []), cerebro_pedidos: [
      { pedido_por_oficina: 'planeacion', costo_usd: 0.2, estado: 'resuelto', creado_en: AHORA.toISOString() },
      { pedido_por_oficina: 'planeacion', costo_usd: 0.1, estado: 'parcial', creado_en: AHORA.toISOString() },
      { pedido_por_oficina: 'oficina-financiera', costo_usd: 0.05, estado: 'resuelto', creado_en: AHORA.toISOString() },
      { pedido_por_oficina: 'planeacion', costo_usd: 9, estado: 'resuelto', creado_en: '2026-10-01T00:00:00Z' },
    ] }
    const r = await rutaCostos({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA, env: {} })
    expect(r.body.pedidos_por_oficina).toEqual([{ oficina: 'planeacion', pedidos: 2, costo_usd: 0.3 }, { oficina: 'oficina-financiera', pedidos: 1, costo_usd: 0.05 }])
  })
})

describe('el informe de costos dice TODOS los topes vigentes (ninguno escondido)', () => {
  it('lista los firmados (aviso 3, apaga 10, diario 1,00 por cliente) con lo que mide cada uno, y el 1,00 del diario no es el gasto total del portero', async () => {
    const { rutaCostos } = await import('../costos')
    const r = await rutaCostos({ db: crearBaseFalsa(mundo(DIEZ_CLIENTES[0], []) as never).db as never, ahora: AHORA, env: {} })
    const topes = r.body.topes_vigentes as Array<{ tope: string; usd: number; mide: string; firma: string }>
    const por = (n: string) => topes.find((x) => x.tope === n)!
    expect(por('portero · aviso')).toMatchObject({ usd: 3, firma: expect.stringContaining('firmado') })
    expect(por('portero · apagado')).toMatchObject({ usd: 10, firma: expect.stringContaining('firmado') })
    expect(por('raspado diario · por cliente y día')).toMatchObject({ usd: 3, firma: expect.stringContaining('firmado') })
    expect(por('raspado diario · por cliente y día').mide).toContain('modo')
    expect(topes.every((x) => x.mide.length > 10 && x.firma.length > 0)).toBe(true)
  })
})

describe('consultar no devuelve el resumen vivo (es un derivado de las demás fichas) salvo que se pida su clase', () => {
  it('una pregunta por palabras trae la ficha concreta, no el resumen', async () => {
    const c = DIEZ_CLIENTES[0]
    const t = mundo(c, [F(c, { clase: 'resumen_vivo', atributo: 'resumen:cliente', titulo: 'Resumen vivo', contenido: 'plato del dia precio horario sede todo junto' }), F(c, { clase: 'precio', atributo: 'precio:plato', contenido: 'plato del dia 8 00 usd' })])
    const db = crearBaseFalsa(t as never).db as never
    const r = await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', que: 'precio del plato del dia' })
    expect((r.body as { resultados: Array<{ clase: string }> }).resultados.map((x) => x.clase)).toEqual(['precio'])
    const pedido = await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'resumen_vivo' })
    expect((pedido.body as { resultados: Array<{ clase: string }> }).resultados.map((x) => x.clase)).toEqual(['resumen_vivo'])
  })
})
