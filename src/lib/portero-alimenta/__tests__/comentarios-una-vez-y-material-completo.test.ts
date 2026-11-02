/**
 * 02-nov · firma de Emilio: (1) los comentarios de una publicación se piden UNA vez al día; (2) la consulta entrega TODO lo que haya (por páginas, con el corte declarado).
 * US$ 0 · base falsa · sin red ni modelo · los diez clientes.
 */
import { describe, expect, it } from 'vitest'
import { FUNCION_DE_COMENTARIOS_DE_INSTAGRAM, sinComentariosYaLeidosHoy, type FilaDeComentariosLeidos } from '../cobertura'
import { LIMITE_MAXIMO, PAGINA_DE_TODO_MAXIMA, PAGINA_DE_TODO_POR_OMISION, rutaConsultar } from '../consultar'
import type { AccionDelPortero } from '../plan'
import { armarMaterial } from '../../planeacion/mesa-de-analisis'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA } from './fixtures-despertar'

const URL = (c: string) => `https://www.instagram.com/p/${c}/`
const accion = (codigos: string[], usd = 0.06): AccionDelPortero => ({
  fuente: 'comentarios', funcion: FUNCION_DE_COMENTARIOS_DE_INSTAGRAM, params: { directUrls: codigos.map(URL), resultsLimit: 50, includeNestedComments: false },
  metadata: { target_kind: 'own', llamado_por: 'ogfq56oIEoHufFPM' }, usd_max: usd, medido: true, objetivo: codigos.map(URL).join(' '),
})
const otra: AccionDelPortero = { fuente: 'sitio', funcion: 'website_content_scraper', params: { startUrls: [{ url: 'https://x.test' }] }, metadata: { target_kind: 'own', llamado_por: 'x' }, usd_max: 0.05, medido: true, objetivo: 'https://x.test' }
const HOY = new Date('2026-11-02T12:30:00Z')
const fila = (codigos: string[], o: Partial<FilaDeComentariosLeidos> = {}): FilaDeComentariosLeidos => ({ apify_function: FUNCION_DE_COMENTARIOS_DE_INSTAGRAM, params: { directUrls: codigos.map(URL) }, filas: 125, created_at: '2026-11-02T12:34:00Z', ...o })

describe('comentarios una vez al día', () => {
  it('lo ya leído hoy no se vuelve a pedir: la acción sale del plan y queda declarada', () => {
    const r = sinComentariosYaLeidosHoy({ hacer: [otra, accion(['A', 'B', 'C'])] }, [fila(['A', 'B', 'C'])], HOY)
    expect(r.hacer).toEqual([otra])
    expect(r.saltadas).toHaveLength(1); expect(r.saltadas[0].usd_max).toBeCloseTo(0.06, 6); expect(r.saltadas[0].objetivo).toContain('/p/A/')
  })
  it('publicación por publicación: si queda una sin leer, se pide solo esa y el máximo baja en proporción', () => {
    const r = sinComentariosYaLeidosHoy({ hacer: [accion(['A', 'B', 'C'], 0.09)] }, [fila(['A', 'B'])], HOY)
    expect(r.hacer).toHaveLength(1)
    expect(r.hacer[0].params).toMatchObject({ directUrls: [URL('C')], resultsLimit: 50 })
    expect(r.hacer[0].objetivo).toBe(URL('C')); expect(r.hacer[0].usd_max).toBeCloseTo(0.03, 6)
    expect(r.saltadas[0].usd_max).toBeCloseTo(0.06, 6)
  })
  it('la dirección se compara normalizada (sin https, www ni barra final)', () => {
    const r = sinComentariosYaLeidosHoy({ hacer: [accion(['A'])] }, [fila(['A'], { params: { directUrls: ['http://instagram.com/p/A'] } })], HOY)
    expect(r.hacer).toHaveLength(0)
  })
  it('lo de AYER (otro día UTC) se vuelve a pedir; medianoche cuenta como día nuevo', () => {
    expect(sinComentariosYaLeidosHoy({ hacer: [accion(['A'])] }, [fila(['A'], { created_at: '2026-11-01T23:59:59Z' })], HOY).hacer).toHaveLength(1)
    expect(sinComentariosYaLeidosHoy({ hacer: [accion(['A'])] }, [fila(['A'], { created_at: '2026-11-02T00:00:00Z' })], HOY).hacer).toHaveLength(0)
  })
  it('una llamada que no trajo nada (filas 0 o ausente) NO cuenta como leída: se puede reintentar', () => {
    expect(sinComentariosYaLeidosHoy({ hacer: [accion(['A'])] }, [fila(['A'], { filas: 0 })], HOY).hacer).toHaveLength(1)
    expect(sinComentariosYaLeidosHoy({ hacer: [accion(['A'])] }, [fila(['A'], { filas: null })], HOY).hacer).toHaveLength(1)
  })
  it('solo cuenta la misma función: lo leído por otro actor no tapa los comentarios', () => {
    expect(sinComentariosYaLeidosHoy({ hacer: [accion(['A'])] }, [fila(['A'], { apify_function: 'instagram_scraper' })], HOY).hacer).toHaveLength(1)
  })
  it('sin lecturas de hoy el plan queda igual (misma referencia de acciones) y las acciones que no son comentarios no se tocan', () => {
    const a = accion(['A', 'B'])
    const r = sinComentariosYaLeidosHoy({ hacer: [otra, a] }, [], HOY)
    expect(r.hacer).toEqual([otra, a]); expect(r.saltadas).toEqual([])
  })
  it('una acción de comentarios sin direcciones se deja pasar (no se inventa nada)', () => {
    const rota = { ...accion(['A']), params: {} }
    expect(sinComentariosYaLeidosHoy({ hacer: [rota] }, [fila(['A'])], HOY).hacer).toEqual([rota])
  })
})

const F = (c: ClienteSintetico, i: number, o: Record<string, unknown> = {}) => ({
  id: `f-${String(i).padStart(4, '0')}`, client_id: c.id, ref: `portero:${i}`, clase: 'comentarios', atributo: '', titulo: `comentario ${i}`, que_es: '', contenido: `opinión número ${i} ${'x'.repeat(900)}`,
  observado_en: '2026-10-14T10:00:00Z', fecha_fuente: '2026-10-13', vigente_hasta: '2026-12-01T00:00:00Z', alcance: 'cliente', origen: 'tercero', ...o,
})
const mundo = (c: ClienteSintetico, fichas: Array<Record<string, unknown>>): T => ({ ...tablasDe(c), cerebro_fichas: fichas, cerebro_consultas: [], cerebro_pedidos: [], agents: [] })

describe('consultar · el corte nunca es mudo y «todo» entrega todo', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): 120 opiniones → por omisión 10 con aviso; todo=1 las entrega por páginas, completas y con su fecha real`, async () => {
      const fichas = Array.from({ length: 120 }, (_, i) => F(c, i))
      const db = crearBaseFalsa(mundo(c, fichas) as never).db as never
      const q = (p: Record<string, unknown>) => rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'mesa', agente: 'a', clase: 'comentarios', ...p })
      const corta = (await q({})).body as Record<string, unknown>
      expect(corta).toMatchObject({ total_encontradas: 120, entregadas: 10, cortada: true, siguiente_desde: 10 })
      expect(String(corta.aviso_de_corte)).toMatch(/hay 120 fichas y van 10/)
      const maxima = (await q({ limite: 5000 })).body as Record<string, unknown>
      expect(maxima).toMatchObject({ entregadas: LIMITE_MAXIMO, total_encontradas: 120, cortada: true })
      // todo: una página de 300 trae las 120, sin aviso de corte, con el contenido ENTERO (> 700) y la fecha de la fuente
      const todo = (await q({ todo: true, contenido_completo: true })).body as { resultados: Array<{ contenido: string; fecha_de_la_fuente: string }> } & Record<string, unknown>
      expect(todo).toMatchObject({ total_encontradas: 120, entregadas: 120, cortada: false, siguiente_desde: null })
      expect(todo.aviso_de_corte).toBeUndefined()
      expect(todo.resultados[0].contenido.length).toBeGreaterThan(900); expect(todo.resultados[0].fecha_de_la_fuente).toBe('2026-10-13')
      // sin contenido_completo el texto se recorta como siempre
      const recortado = (await q({ todo: '1' })).body as { resultados: Array<{ contenido: string }> }
      expect(recortado.resultados[0].contenido.length).toBeLessThanOrEqual(701)
    })
  }
  it('por páginas: limite=50 con todo, desde=0/50/100 recorren las 120 sin repetir ni perder ninguna y la última dice que no hay más', async () => {
    const c = DIEZ_CLIENTES[0]
    const db = crearBaseFalsa(mundo(c, Array.from({ length: 120 }, (_, i) => F(c, i))) as never).db as never
    const vistos: string[] = []
    let desde: number | null = 0
    let paginas = 0
    while (desde !== null && paginas < 10) {
      const b = (await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'mesa', agente: 'a', clase: 'comentarios', todo: true, limite: 50, desde })).body as { resultados: Array<{ ficha_id: string }>; siguiente_desde: number | null; entregadas: number; total_encontradas: number; desde: number }
      expect(b.total_encontradas).toBe(120); expect(b.desde).toBe(desde)
      vistos.push(...b.resultados.map((r) => r.ficha_id)); desde = b.siguiente_desde; paginas++
    }
    expect(paginas).toBe(3); expect(vistos).toHaveLength(120); expect(new Set(vistos).size).toBe(120)
  })
  it('la página de todo tiene tope propio (500) y un valor roto vuelve a la de omisión (300)', async () => {
    const c = DIEZ_CLIENTES[1]
    const db = crearBaseFalsa(mundo(c, Array.from({ length: 700 }, (_, i) => F(c, i, { contenido: `op ${i}` }))) as never).db as never
    const n = async (limite?: unknown) => ((await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'comentarios', todo: true, limite: limite as never })).body as { entregadas: number }).entregadas
    expect(await n(99999)).toBe(PAGINA_DE_TODO_MAXIMA); expect(await n('mucho')).toBe(PAGINA_DE_TODO_POR_OMISION); expect(await n(7)).toBe(7)
  })
  it('varias clases separadas por coma: opiniones = comentarios + reseñas + menciones en una consulta; las demás clases no entran', async () => {
    const c = DIEZ_CLIENTES[2]
    const t = mundo(c, [F(c, 1), F(c, 2, { clase: 'resenas' }), F(c, 3, { clase: 'mencion' }), F(c, 4, { clase: 'precio' }), F(c, 5, { clase: 'resenas', retirada_en: '2026-10-10T00:00:00Z' })])
    const r = (await rutaConsultar({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'comentarios, resenas ,mencion', todo: true })).body as { resultados: Array<{ clase: string }>; total_encontradas: number }
    expect(r.resultados.map((x) => x.clase).sort()).toEqual(['comentarios', 'mencion', 'resenas']); expect(r.total_encontradas).toBe(3)
  })
  it('por palabras no se corta en silencio: con muchas coincidencias el total es el real, no el doble del límite', async () => {
    const c = DIEZ_CLIENTES[3]
    const t = mundo(c, Array.from({ length: 80 }, (_, i) => F(c, i, { clase: 'otra', contenido: `el encebollado ${i} es el mejor` })))
    const r = (await rutaConsultar({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', que: 'encebollado' })).body as Record<string, unknown>
    expect(r).toMatchObject({ total_encontradas: 80, entregadas: 10, cortada: true })
  })
  it('sin nada: total 0, no cortada, sin_dato', async () => {
    const c = DIEZ_CLIENTES[4]
    const r = (await rutaConsultar({ db: crearBaseFalsa(mundo(c, []) as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'comentarios', todo: true })).body as Record<string, unknown>
    expect(r).toMatchObject({ sin_dato: true, total_encontradas: 0, entregadas: 0, cortada: false, siguiente_desde: null })
  })
})

describe('el material de la mesa declara lo que falta', () => {
  const f = (i: number) => ({ ficha_id: `id-${i}`, clase: 'comentarios', fecha: '2026-10-13T00:00:00Z', contenido: `opinión ${i}` })
  it('si llegaron todas, no hay aviso de faltantes y se informa el total', () => {
    const m = armarMaterial({ resumen_vivo: null, fichas: [f(1), f(2)], encontradas: 2 })
    expect(m.texto).not.toMatch(/faltan/); expect(m.encontradas).toBe(2); expect(m.fichas).toBe(2)
  })
  it('si el cerebro tenía más de las que llegaron, el material lo dice con los números', () => {
    const m = armarMaterial({ resumen_vivo: null, fichas: [f(1), f(2)], encontradas: 62 })
    expect(m.texto).toMatch(/llegaron 2 de 62 fichas del tema: faltan 60/)
  })
  it('sin el dato de total (consultas viejas) el material es el de siempre', () => {
    const m = armarMaterial({ resumen_vivo: null, fichas: [f(1)] })
    expect(m.texto).not.toMatch(/llegaron/); expect(m.encontradas).toBeUndefined()
  })
})

// ── la ruta del plan del día (rutaDescubrir) con la base falsa: una corrida repetida el mismo día ──
import { rutaDescubrir } from '../rutas'
import { CASOS, ON, montar, tablas } from './fixtures-despertar'

describe('el plan del día no repite los comentarios (rutaDescubrir)', () => {
  const plan = async (t: ReturnType<typeof tablas>, ahora: Date) => {
    const m = montar(t)
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora }, { client_id: t.clients[0].id as string, dry_run: true })
    return d.body as { plan: { hacer: Array<{ funcion: string; params: { directUrls?: string[] }; usd_max: number }>; costo_maximo_del_plan_usd: number }; comentarios_saltados_hoy: Array<{ objetivo: string; usd_max: number }> }
  }
  const leida = (id: string, o: Record<string, unknown> = {}) => ({ id: 'raw-coment', client_id: id, apify_function: FUNCION_DE_COMENTARIOS_DE_INSTAGRAM, ensayo: false, filas: 125, params: { directUrls: [URL('P1')] }, created_at: '2026-10-15T09:00:00Z', respuesta: [], ...o })
  for (const c of CASOS) {
    it(`${c.nombre}: primera corrida del día pide los comentarios; la repetida (o el reintento) los salta; con la lectura de ayer o sin datos, se piden`, async () => {
      const primera = await plan(tablas(c), AHORA)
      expect(primera.plan.hacer.map((a) => a.funcion)).toContain(FUNCION_DE_COMENTARIOS_DE_INSTAGRAM)
      expect(primera.comentarios_saltados_hoy).toEqual([])
      const t2 = tablas(c); t2.apify_raw.push(leida(c.id))
      const repetida = await plan(t2, AHORA)
      expect(repetida.plan.hacer.map((a) => a.funcion)).not.toContain(FUNCION_DE_COMENTARIOS_DE_INSTAGRAM)
      expect(repetida.comentarios_saltados_hoy).toHaveLength(1)
      expect(repetida.plan.costo_maximo_del_plan_usd).toBeLessThan(primera.plan.costo_maximo_del_plan_usd)
      const t3 = tablas(c); t3.apify_raw.push(leida(c.id, { created_at: '2026-10-14T23:00:00Z' }))
      expect((await plan(t3, AHORA)).plan.hacer.map((a) => a.funcion)).toContain(FUNCION_DE_COMENTARIOS_DE_INSTAGRAM)
      const t4 = tablas(c); t4.apify_raw.push(leida(c.id, { filas: 0 }))
      expect((await plan(t4, AHORA)).plan.hacer.map((a) => a.funcion)).toContain(FUNCION_DE_COMENTARIOS_DE_INSTAGRAM)
      const t5 = tablas(c); t5.apify_raw.push(leida(c.id, { ensayo: true }))
      expect((await plan(t5, AHORA)).plan.hacer.map((a) => a.funcion)).toContain(FUNCION_DE_COMENTARIOS_DE_INSTAGRAM)
    })
  }
  it('lo leído de OTRO cliente el mismo día no tapa los comentarios de este', async () => {
    const c = CASOS[0]
    const t = tablas(c); t.apify_raw.push(leida(CASOS[1].id))
    expect((await plan(t, AHORA)).plan.hacer.map((a) => a.funcion)).toContain(FUNCION_DE_COMENTARIOS_DE_INSTAGRAM)
  })
})
