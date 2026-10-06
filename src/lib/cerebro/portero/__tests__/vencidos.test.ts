/**
 * La ruta `vencidos` · «qué vence o venció de este cliente en N días» · solo lectura · reloj simulado.
 * Pruebas escritas ANTES del código. `sin_material` ≠ `error_de_lectura`; misma autenticación que las rutas del portero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { A, AHORA, NO_EXISTE, crearBaseFalsa, tablasDeLaBase, type Tablas } from '../../__tests__/casos'
import { armarVencidos, DIAS_POR_DEFECTO, MAXIMO_DE_DIAS } from '../vencidos'

const DIA = 86_400_000
const dia = (n: number, desde = AHORA): string => new Date(desde.getTime() - n * DIA).toISOString()
type Cuerpo = Record<string, any>
const vencidos = async (cuerpo: unknown, t: Tablas = tablasDeLaBase(), fallan: string[] = [], ahora = AHORA) => {
  const b = crearBaseFalsa(t, fallan)
  const r = await armarVencidos(b.consulta, cuerpo, { ahora })
  return { ...r, c: r.cuerpo as Cuerpo, llamadas: b.llamadas }
}
const refs = (xs: Array<{ ref: string }>) => xs.map((x) => x.ref)

describe('lo que ya venció', () => {
  it('lista lo vencido de A con su fecha de vencimiento, su última verificación y los días de atraso, lo más atrasado primero', async () => {
    const r = await vencidos({ cliente: A })
    expect(r.status).toBe(200)
    expect(r.c.estado).toBe('ok')
    expect(r.c.dias).toBe(DIAS_POR_DEFECTO)
    expect(refs(r.c.vencidas)).toEqual(expect.arrayContaining(['client_web_pages:wp-a1', 'client_sede_datos:dat-3', 'client_sede_datos:dat-4']))
    const dat3 = r.c.vencidas.find((x: Cuerpo) => x.ref === 'client_sede_datos:dat-3')
    expect(dat3).toMatchObject({ clase: 'dato_de_sede', estante: 'E2' })
    expect(dat3.dias_de_atraso).toBe(8) // horario: plazo 7, verificado hace 15 días
    expect(dat3.vigente_hasta).toBe(new Date(AHORA.getTime() - 8 * DIA).toISOString())
    expect(dat3.ultima_verificacion).toBe(new Date(AHORA.getTime() - 15 * DIA).toISOString())
    const atrasos = r.c.vencidas.map((x: Cuerpo) => x.dias_de_atraso)
    expect([...atrasos].sort((a, b) => b - a)).toEqual(atrasos)
  })
  it('lo que no tiene plazo (manual, perfil, sedes) y las versiones reemplazadas NO aparecen; las fotos propias tampoco (no vencen)', async () => {
    const r = await vencidos({ cliente: A })
    const todo = [...refs(r.c.vencidas), ...refs(r.c.por_vencer)]
    expect(todo.some((x) => x.startsWith('client_brand_books:'))).toBe(false)
    expect(todo.some((x) => x.startsWith('client_icp_documents:'))).toBe(false)
    expect(todo.some((x) => x.startsWith('client_sedes:'))).toBe(false)
    expect(todo.some((x) => x.startsWith('client_social_images:im-1') || x === 'client_social_images:im-2' || x === 'client_social_images:im-4')).toBe(false)
    expect(todo).not.toContain('client_sede_datos:dat-1') // observación vieja reemplazada por la nueva (no es una línea)
  })
  it('lo que sale en `vencidas` son exactamente las líneas con `vencido` de la lista corta (no se inventa ni se pierde ninguna)', async () => {
    const { construirListaCorta } = await import('../../lista-corta')
    const lista = await construirListaCorta(crearBaseFalsa(tablasDeLaBase()).consulta, A, { ahora: AHORA })
    const esperadas = lista.lineas.filter((f) => f.vencido && f.reemplazada !== true).map((f) => f.ref).sort()
    const r = await vencidos({ cliente: A })
    expect(refs(r.c.vencidas).sort()).toEqual(esperadas)
  })
})

describe('lo que vence en los próximos N días', () => {
  const t = (): Tablas => ({
    clients: [{ id: A, name: 'A', website_url: 'https://a.example', status: 'active', config: {} }],
    client_sede_datos: [
      { id: 'h-1', client_id: A, sede_id: null, campo: 'horario', valor_texto: 'lunes a viernes', fuente: 'sitio', alcance: 'cuenta', observado_en: dia(5) }, // plazo 7 → vence en 2 días
      { id: 'd-1', client_id: A, sede_id: null, campo: 'direccion', valor_texto: 'Calle uno', fuente: 'sitio', alcance: 'cuenta', observado_en: dia(25) }, // plazo 30 → vence en 5 días
      { id: 'd-2', client_id: A, sede_id: null, campo: 'telefono', valor_texto: '000', fuente: 'sitio', alcance: 'cuenta', observado_en: dia(10) }, // vence en 20 días
      { id: 'd-3', client_id: A, sede_id: null, campo: 'canal', valor_texto: 'x', fuente: 'sitio', alcance: 'cuenta', observado_en: dia(40) }, // ya venció hace 10 días
    ],
    client_historical_outputs: [
      { id: 'plan-1', client_id: A, output_type: 'campaign_plan_90d', title: 'Plan', status: 'approved', created_at: dia(34), content_text: 'plan', provenance_tag: {}, hitl_verdict: null, human_edits: null }, // vence en 56 días
    ],
  })
  it('con 7 días: el horario (2) y la dirección (5) por vencer; el teléfono (20) y el plan (56) no; lo ya vencido aparte', async () => {
    const r = await vencidos({ cliente: A, dias: 7 }, t())
    expect(r.c.por_vencer.map((x: Cuerpo) => [x.ref, x.dias_que_faltan])).toEqual([['client_sede_datos:h-1', 2], ['client_sede_datos:d-1', 5]])
    expect(refs(r.c.vencidas)).toEqual(['client_sede_datos:d-3'])
    expect(r.c.vencidas[0].dias_de_atraso).toBe(10)
  })
  it('con 3 días solo el horario; con 21 también el teléfono; con 60 también el plan', async () => {
    expect(refs((await vencidos({ cliente: A, dias: 3 }, t())).c.por_vencer)).toEqual(['client_sede_datos:h-1'])
    expect(refs((await vencidos({ cliente: A, dias: 21 }, t())).c.por_vencer)).toEqual(['client_sede_datos:h-1', 'client_sede_datos:d-1', 'client_sede_datos:d-2'])
    const p = await vencidos({ cliente: A, dias: 60 }, t())
    expect(p.c.por_vencer.map((x: Cuerpo) => [x.ref, x.dias_que_faltan]).pop()).toEqual(['client_historical_outputs:plan-1', 56])
  })
  it('el borde: lo que vence EXACTAMENTE dentro de N días entra; un segundo después no', async () => {
    const justo: Tablas = { clients: t().clients, client_sede_datos: [{ id: 'j', client_id: A, sede_id: null, campo: 'horario', valor_texto: 'x', fuente: 'sitio', alcance: 'cuenta', observado_en: dia(0) }] } // vence en 7 días justos
    expect(refs((await vencidos({ cliente: A, dias: 7 }, justo)).c.por_vencer)).toEqual(['client_sede_datos:j'])
    expect(refs((await vencidos({ cliente: A, dias: 6 }, justo)).c.por_vencer)).toEqual([])
  })
  it('RELOJ SIMULADO: el mismo dato cambia de «por vencer» a «vencido» solo moviendo la hora', async () => {
    const hoy = await vencidos({ cliente: A, dias: 7 }, t())
    expect(refs(hoy.c.por_vencer)).toContain('client_sede_datos:h-1')
    expect(refs(hoy.c.vencidas)).not.toContain('client_sede_datos:h-1')
    const tres = new Date(AHORA.getTime() + 3 * DIA)
    const luego = await vencidos({ cliente: A, dias: 7 }, t(), [], tres)
    expect(refs(luego.c.vencidas)).toContain('client_sede_datos:h-1')
    expect(luego.c.vencidas.find((x: Cuerpo) => x.ref === 'client_sede_datos:h-1').dias_de_atraso).toBe(1)
    expect(refs(luego.c.por_vencer)).not.toContain('client_sede_datos:h-1')
    expect(luego.c.ahora).toBe(tres.toISOString())
  })
})

describe('lo reemplazado no cuenta y los días se cuentan completos', () => {
  const plan = (id: string, status: string, creado: number) => ({ id, client_id: A, output_type: 'campaign_plan_90d', title: `Plan ${id}`, status, created_at: dia(creado), content_text: 'plan', provenance_tag: {}, hitl_verdict: null, human_edits: null })
  it('un plan VIEJO ya reemplazado por el vigente no sale como vencido (solo el vigente cuenta)', async () => {
    const t: Tablas = { clients: [{ id: A, name: 'A', website_url: 'https://a.example', status: 'active', config: {} }], client_historical_outputs: [plan('viejo', 'draft', 200), plan('vigente', 'approved', 100)] }
    const r = await vencidos({ cliente: A, dias: 7 }, t)
    expect(refs(r.c.vencidas)).toEqual(['client_historical_outputs:vigente']) // el viejo venció hace 110 días pero está reemplazado
    expect(r.c.vencidas[0].dias_de_atraso).toBe(10)
  })
  it('los días de atraso y los que faltan son días ENTEROS: el atraso se redondea hacia abajo y lo que falta hacia arriba', async () => {
    const medio = (horas: number): Tablas => ({ clients: [{ id: A, name: 'A', website_url: 'https://a.example', status: 'active', config: {} }], client_sede_datos: [{ id: 'm', client_id: A, sede_id: null, campo: 'horario', valor_texto: 'x', fuente: 'sitio', alcance: 'cuenta', observado_en: new Date(AHORA.getTime() - horas * 3_600_000).toISOString() }] })
    const atraso = await vencidos({ cliente: A }, medio(15 * 24 + 12)) // vencido hace 8 días y medio
    expect(atraso.c.vencidas[0].dias_de_atraso).toBe(8)
    const falta = await vencidos({ cliente: A, dias: 7 }, medio(24 + 12)) // vence en 5 días y medio
    expect(falta.c.por_vencer[0].dias_que_faltan).toBe(6)
  })
})

describe('sin_material ≠ error_de_lectura (nunca se lee un fallo como «no vence nada»)', () => {
  const soloCliente = (): Tablas => ({ clients: [{ id: A, name: 'A', website_url: 'https://a.example', status: 'active', config: {} }] })
  it('un cliente que existe pero no tiene nada que pueda vencer: `sin_material`, con listas vacías', async () => {
    const r = await vencidos({ cliente: A }, soloCliente())
    expect(r.status).toBe(200)
    expect(r.c).toMatchObject({ estado: 'sin_material', vencidas: [], por_vencer: [] })
  })
  it('un cliente con material y nada por vencer en la ventana: `ok` con listas vacías (≠ sin_material)', async () => {
    const t: Tablas = { ...soloCliente(), client_sede_datos: [{ id: 'x', client_id: A, sede_id: null, campo: 'direccion', valor_texto: 'x', fuente: 'sitio', alcance: 'cuenta', observado_en: dia(1) }] }
    const r = await vencidos({ cliente: A, dias: 3 }, t)
    expect(r.c).toMatchObject({ estado: 'ok', vencidas: [], por_vencer: [] })
  })
  it('un cliente que no existe lo dice así (no es una lista vacía)', async () => {
    const r = await vencidos({ cliente: NO_EXISTE })
    expect(r.c).toMatchObject({ estado: 'cliente_inexistente', vencidas: [], por_vencer: [] })
  })
  it('una lectura que falla → `parcial` con la fuente nombrada, y lo que sí se leyó SALE; jamás `sin_material`', async () => {
    const r = await vencidos({ cliente: A }, tablasDeLaBase(), ['client_sede_datos'])
    expect(r.c.estado).toBe('parcial')
    expect(r.c.lecturas.datos_de_sede).toBe('error_de_lectura')
    expect(refs(r.c.vencidas)).toContain('client_web_pages:wp-a1')
    expect(refs(r.c.vencidas).some((x) => x.startsWith('client_sede_datos:'))).toBe(false)
  })
  it('un cliente sin nada que pueda vencer y con una lectura caída es `parcial`, no `sin_material`', async () => {
    const r = await vencidos({ cliente: A }, soloCliente(), ['client_sede_datos'])
    expect(r.c.estado).toBe('parcial')
  })
  it('si fallan todas: `error_de_lectura`', async () => {
    const r = await vencidos({ cliente: A }, tablasDeLaBase(), Object.keys(tablasDeLaBase()))
    expect(r.c).toMatchObject({ estado: 'error_de_lectura', vencidas: [], por_vencer: [] })
  })
})

describe('solo lectura, con el filtro del cliente, sin cruzar clientes', () => {
  it('cada lectura lleva el filtro del cliente y no hay ninguna escritura', async () => {
    const r = await vencidos({ cliente: A })
    expect(r.llamadas.length).toBeGreaterThan(5)
    for (const p of r.llamadas) expect(p.tabla === 'clients' ? p.donde.id : p.donde.client_id).toBe(A)
  })
  it('lo vencido de Z no aparece en la respuesta de A', async () => {
    const r = await vencidos({ cliente: A })
    for (const x of [...r.c.vencidas, ...r.c.por_vencer]) expect(x.ref).not.toMatch(/-z\b|:dat-z|:wp-z1/)
  })
})

describe('entrada', () => {
  it('sin cliente → 400; dias fuera de 1..365 o no entero → 400; dias como texto numérico (viene de la dirección) se acepta', async () => {
    expect((await vencidos({})).status).toBe(400)
    expect((await vencidos(null)).status).toBe(400)
    for (const dias of [0, -1, 366, 1.5, 'x', NaN, null]) expect((await vencidos({ cliente: A, dias })).status, String(dias)).toBe(400)
    expect(MAXIMO_DE_DIAS).toBe(365)
    expect((await vencidos({ cliente: A, dias: '14' })).c.dias).toBe(14)
    expect((await vencidos({ cliente: A, dias: 365 })).status).toBe(200)
    expect((await vencidos({ cliente: A })).c.dias).toBe(7)
  })
})

describe('la ruta: misma autenticación que las del portero y nada sale a la red sin llave', () => {
  const llave = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { vi.unstubAllGlobals(); if (llave === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = llave })
  const ruta = async () => import('../../../../app/api/brain/portero/vencidos/route')
  const pedir = (metodo: 'GET' | 'POST', cuerpo: unknown, k?: string): Request => metodo === 'GET'
    ? new Request(`https://x.example/api/brain/portero/vencidos?cliente=${A}&dias=7`, { headers: k ? { 'x-api-key': k } : {} })
    : new Request('https://x.example/api/brain/portero/vencidos', { method: 'POST', headers: { 'content-type': 'application/json', ...(k ? { 'x-api-key': k } : {}) }, body: JSON.stringify(cuerpo) })

  it.each(['GET', 'POST'] as const)('%s: sin llave → 401 y llave mala → 401, sin tocar la base', async (m) => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const r = await ruta()
    expect((await r[m](pedir(m, { cliente: A }))).status).toBe(401)
    expect((await r[m](pedir(m, { cliente: A }, 'otra'))).status).toBe(401)
    expect(f).not.toHaveBeenCalled()
  })
  it('sin la variable del servidor → 401 (igual que las otras rutas)', async () => {
    delete process.env.INTERNAL_API_KEY
    expect((await (await ruta()).GET(pedir('GET', {}, 'x'))).status).toBe(401)
  })
  it.each(['GET', 'POST'] as const)('%s con llave pero sin cliente → 400 y sin tocar la base', async (m) => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const r = await ruta()
    const peticion = m === 'GET' ? new Request('https://x.example/api/brain/portero/vencidos?dias=7', { headers: { 'x-api-key': 'llave-de-prueba' } }) : pedir('POST', { dias: 7 }, 'llave-de-prueba')
    expect((await r[m](peticion)).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
  it('GET y POST leen con el filtro del cliente y SOLO con el verbo GET hacia la base (la lectura es la de siempre)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://base.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave-servicio'
    const visto: Array<{ url: string; metodo: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => { visto.push({ url: String(u), metodo: String(i?.method) }); return new Response('[]', { status: 200 }) }))
    const r = await ruta()
    for (const m of ['GET', 'POST'] as const) {
      const res = await r[m](pedir(m, { cliente: A, dias: 7 }, 'llave-de-prueba'))
      expect(res.status).toBe(200)
      expect((await res.json()).estado).toBe('cliente_inexistente') // la base simulada devuelve []: no existe
    }
    expect(visto.length).toBeGreaterThan(0)
    for (const v of visto) { expect(v.metodo).toBe('GET'); expect(v.url).toMatch(/^https:\/\/base\.example\/rest\/v1\//) }
  })
})
