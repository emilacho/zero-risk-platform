/**
 * LA PUERTA CREA LA FICHA POR NOMBRE (CC#1 · 19-oct): máx. 3 fichas nuevas por día, id asignado por la base, nombre repetido = la misma ficha, carreras deshechas. US$ 0, todo simulado.
 */
import { describe, expect, it } from 'vitest'
import { slugify } from '../src/lib/discovery-output/ensure-client'
import { fichaPorNombre, inicioDelDiaUtc, MAX_FICHAS_NUEVAS_POR_DIA, ORIGEN_PUERTA, validarPedido, type FichaNueva, type PuertosDeFicha } from '../src/lib/alta/ficha-por-nombre'
import { puertosDeFicha } from '../src/lib/alta/almacen-supabase'

interface Fila { id: string; name: string; slug: string; created_at: string; origen: string | null }
function mundo(opts: { ahora?: string; filas?: Fila[]; carrera?: (m: ReturnType<typeof mundo>) => void; falla?: 'buscar' | 'crear' | 'contar' | 'borrar' } = {}) {
  const filas: Fila[] = opts.filas ? [...opts.filas] : []
  const ahora = new Date(opts.ahora ?? '2026-10-19T22:30:00Z')
  let n = 0
  const m = {
    filas, creadas: [] as FichaNueva[], borradas: [] as string[],
    P: {
      ahora: () => ahora,
      async buscarPorSlug(slug) { if (opts.falla === 'buscar') throw new Error('base caída'); const f = filas.find((x) => x.slug === slug); return f ? { id: f.id, name: f.name } : null },
      async crear(f) {
        if (opts.falla === 'crear') throw new Error('base caída')
        if (filas.some((x) => x.slug === f.slug)) { const e = new Error('duplicate') as Error & { code?: string }; e.code = 'duplicado'; throw e }
        const id = `id-${++n}`
        filas.push({ id, name: f.name, slug: f.slug, created_at: ahora.toISOString(), origen: f.config.creado_por })
        m.creadas.push(f)
        opts.carrera?.(m)
        return { id }
      },
      async creadasPorLaPuerta(desde) {
        if (opts.falla === 'contar') throw new Error('base caída')
        return filas.filter((f) => f.origen === ORIGEN_PUERTA && f.created_at >= desde).sort((a, b) => (a.created_at + a.id < b.created_at + b.id ? -1 : 1)).map((f) => ({ id: f.id, created_at: f.created_at }))
      },
      async borrar(id) { if (opts.falla === 'borrar') throw new Error('base caída'); m.borradas.push(id); const i = filas.findIndex((f) => f.id === id); if (i >= 0) filas.splice(i, 1) },
    } satisfies PuertosDeFicha,
  }
  return m
}
const hoy = (id: string, extra: Partial<Fila> = {}): Fila => ({ id, name: id, slug: id, created_at: '2026-10-19T08:00:00.000Z', origen: ORIGEN_PUERTA, ...extra })

describe('validar el pedido', () => {
  it('solo el nombre es obligatorio y tiene que ser razonable', () => {
    expect(validarPedido({ client_name: 'GoEuropeAdventure' })).toEqual({ ok: true, nombre: 'GoEuropeAdventure' })
    expect(validarPedido({ name: ' Café Olón ', industry: 'café', country: 'EC' })).toEqual({ ok: true, nombre: 'Café Olón', industry: 'café', country: 'EC' })
    for (const malo of [null, [], 'x', {}, { client_name: '' }, { client_name: '   ' }, { client_name: 'a' }, { client_name: '!!!' }, { client_name: 'x'.repeat(121) }, { client_name: 7 }]) expect(validarPedido(malo).ok).toBe(false)
  })
  it('la web, si viene, tiene que ser https', () => {
    expect(validarPedido({ client_name: 'Uno', website_url: 'http://uno.com' }).ok).toBe(false)
    expect(validarPedido({ client_name: 'Uno', website_url: 'no es una dirección' }).ok).toBe(false)
    expect(validarPedido({ client_name: 'Uno', website_url: 'https://uno.com' })).toMatchObject({ ok: true, website_url: 'https://uno.com' })
  })
})

describe('crear la ficha', () => {
  it('un nombre nuevo crea la ficha (201), con el id que asigna la base y marcada con su origen', async () => {
    const m = mundo()
    const r = await fichaPorNombre(m.P, { client_name: 'Café Olón', industry: 'cafetería' })
    expect(r).toMatchObject({ ok: true, status: 201, creado: true, client_id: 'id-1', slug: slugify('Café Olón') })
    expect(m.creadas[0]).toMatchObject({ name: 'Café Olón', slug: 'cafe-olon', industry: 'cafetería', config: { creado_por: ORIGEN_PUERTA } })
  })
  it('el client_id que traiga quien llama se IGNORA (lo asigna la base)', async () => {
    const m = mundo()
    const r = await fichaPorNombre(m.P, { client_name: 'Uno', client_id: '00000000-0000-4000-8000-000000000001' })
    expect(r.ok && r.client_id).toBe('id-1')
  })
  it('el mismo nombre (aunque cambie mayúsculas o acentos) devuelve la ficha existente y NO cuenta contra el tope', async () => {
    const m = mundo({ filas: [hoy('a'), hoy('b'), hoy('c'), { id: 'viejo', name: 'Café Olón', slug: 'cafe-olon', created_at: '2026-01-01T00:00:00.000Z', origen: null }] })
    const r = await fichaPorNombre(m.P, { client_name: 'CAFE olon' })
    expect(r).toMatchObject({ ok: true, status: 200, creado: false, client_id: 'viejo' })
    expect(m.creadas).toHaveLength(0)
  })
})

describe('una ficha archivada', () => {
  it('entra como la misma ficha (cliente que vuelve) pero la respuesta lo DICE', async () => {
    const m = mundo({ filas: [{ id: 'vieja', name: 'Cafe', slug: 'cafe', created_at: '2026-01-01T00:00:00.000Z', origen: null }] })
    m.P.buscarPorSlug = async () => ({ id: 'vieja', name: 'Cafe', archivada: true })
    expect(await fichaPorNombre(m.P, { client_name: 'Cafe' })).toMatchObject({ ok: true, status: 200, creado: false, client_id: 'vieja', archivada: true })
    m.P.buscarPorSlug = async () => ({ id: 'vieja', name: 'Cafe', archivada: false })
    expect(await fichaPorNombre(m.P, { client_name: 'Cafe' })).not.toHaveProperty('archivada')
  })
})

describe('el tope de 3 fichas nuevas por día', () => {
  it('la 3.ª entra y la 4.ª se rechaza con 429 SIN crear nada', async () => {
    const m = mundo()
    for (const nombre of ['Uno', 'Dos', 'Tres']) expect((await fichaPorNombre(m.P, { client_name: nombre })).ok).toBe(true)
    const r = await fichaPorNombre(m.P, { client_name: 'Cuatro' })
    expect(r).toMatchObject({ ok: false, status: 429, error: 'tope_de_fichas_nuevas', maximo: MAX_FICHAS_NUEVAS_POR_DIA })
    expect(m.filas.filter((f) => f.origen === ORIGEN_PUERTA)).toHaveLength(3)
    expect(m.borradas).toEqual([])
  })
  it('el tope es POR DÍA UTC: ayer no cuenta y mañana vuelve a empezar', async () => {
    const ayer = [1, 2, 3].map((i) => hoy('ayer' + i, { created_at: '2026-10-18T23:59:59.000Z' }))
    const m = mundo({ filas: ayer })
    expect((await fichaPorNombre(m.P, { client_name: 'Nuevo' })).ok).toBe(true)
    expect(inicioDelDiaUtc(new Date('2026-10-19T22:30:00Z'))).toBe('2026-10-19T00:00:00.000Z')
  })
  it('las fichas que NO vienen de esta puerta (alta a mano, otros caminos) no cuentan', async () => {
    const m = mundo({ filas: [1, 2, 3, 4].map((i) => hoy('x' + i, { origen: null })) })
    expect((await fichaPorNombre(m.P, { client_name: 'Nuevo' })).ok).toBe(true)
  })
  it('exactamente en el borde: con 2 hechas hoy entra la 3.ª; con 3 ya no', async () => {
    expect((await fichaPorNombre(mundo({ filas: [hoy('a'), hoy('b')] }).P, { client_name: 'Tercera' })).ok).toBe(true)
    expect((await fichaPorNombre(mundo({ filas: [hoy('a'), hoy('b'), hoy('c')] }).P, { client_name: 'Cuarta' })).ok).toBe(false)
  })
})

describe('las carreras', () => {
  it('dos llamadas que pasaron el conteo a la vez: la que quedó más allá del tope se DESHACE (se borra su ficha) y devuelve 429', async () => {
    // mientras esta llamada crea su ficha, otras 3 de la puerta se le adelantan en el orden de llegada
    const m = mundo({
      filas: [hoy('a'), hoy('b')],
      carrera: (mm) => { if (mm.filas.length === 3) { mm.filas.push(hoy('c', { created_at: '2026-10-19T08:00:01.000Z' }), hoy('d', { created_at: '2026-10-19T08:00:02.000Z' })) } },
    })
    // la ficha propia se creó a las 22:30, después de a y b (08:00) y de las dos colgadas: posición 4 ⇒ se deshace
    const r = await fichaPorNombre(m.P, { client_name: 'Tarde' })
    expect(r).toMatchObject({ ok: false, status: 429 })
    expect(m.borradas).toEqual(['id-1'])
    expect(m.filas.find((f) => f.name === 'Tarde')).toBeUndefined()
  })
  it('si la lectura posterior no ve la ficha propia y ya hay 3 de la puerta hoy, se deshace igual (no se asume que cabe)', async () => {
    const m = mundo({ filas: [hoy('a'), hoy('b')] })
    let llamadas = 0
    const original = m.P.creadasPorLaPuerta
    m.P.creadasPorLaPuerta = async (desde) => { llamadas++; return llamadas === 1 ? original(desde) : [hoy('a'), hoy('b'), hoy('c')].map((f) => ({ id: f.id, created_at: f.created_at })) }
    const r = await fichaPorNombre(m.P, { client_name: 'Invisible' })
    expect(r).toMatchObject({ ok: false, status: 429 })
    expect(m.borradas).toHaveLength(1)
  })
  it('si la lectura posterior no ve la ficha propia pero hay lugar (menos de 3), se acepta', async () => {
    const m = mundo({ filas: [hoy('a')] })
    let llamadas = 0
    const original = m.P.creadasPorLaPuerta
    m.P.creadasPorLaPuerta = async (desde) => { llamadas++; return llamadas === 1 ? original(desde) : [hoy('a')].map((f) => ({ id: f.id, created_at: f.created_at })) }
    expect(await fichaPorNombre(m.P, { client_name: 'Invisible' })).toMatchObject({ ok: true, status: 201 })
    expect(m.borradas).toEqual([])
  })
  it('si la ficha propia queda DENTRO del tope no se borra nada', async () => {
    const m = mundo({ filas: [hoy('a')], carrera: (mm) => { mm.filas.push(hoy('z', { created_at: '2026-10-19T23:00:00.000Z' })) } })
    const r = await fichaPorNombre(m.P, { client_name: 'Dentro' })
    expect(r).toMatchObject({ ok: true, status: 201 })
    expect(m.borradas).toEqual([])
  })
  it('mismo nombre en paralelo: el slug es único, la perdedora devuelve la ficha de la ganadora (200, creado:false)', async () => {
    const m = mundo()
    const original = m.P.crear
    m.P.crear = async (f) => { m.filas.push({ id: 'ganadora', name: f.name, slug: f.slug, created_at: '2026-10-19T08:00:00.000Z', origen: ORIGEN_PUERTA }); return original(f) }
    const r = await fichaPorNombre(m.P, { client_name: 'Mismo' })
    expect(r).toMatchObject({ ok: true, status: 200, creado: false, client_id: 'ganadora' })
  })
})

describe('si la base falla, se dice (no se inventa un éxito)', () => {
  for (const falla of ['buscar', 'crear', 'contar', 'borrar'] as const) {
    it(`falla al ${falla}`, async () => {
      const filas = falla === 'borrar' ? [hoy('a'), hoy('b'), hoy('c')] : []
      const m = mundo({ falla, filas, carrera: falla === 'borrar' ? (mm) => { mm.filas.unshift(hoy('o', { created_at: '2026-10-19T00:00:01.000Z' })) } : undefined })
      if (falla === 'borrar') {
        // 3 fichas hoy ya ocupan el tope ⇒ se rechaza antes de crear (no llega a borrar); para ejercer el borrado forzamos 2 + una colgada en medio de la creación
        const m2 = mundo({ falla, filas: [hoy('a'), hoy('b')], carrera: (mm) => { mm.filas.unshift(hoy('o', { created_at: '2026-10-19T00:00:01.000Z' })) } })
        await expect(fichaPorNombre(m2.P, { client_name: 'Nueva' })).rejects.toThrow('base caída')
      } else {
        await expect(fichaPorNombre(m.P, { client_name: 'Nueva' })).rejects.toThrow('base caída')
      }
    })
  }
})

describe('los puertos sobre Supabase (base mínima en memoria)', () => {
  function dbFalsa() {
    const clients: Array<Record<string, any>> = []
    const pedidos = { orden: [] as Array<[string, boolean]> }
    const from = (t: string) => {
      if (t !== 'clients') throw new Error('tabla inesperada ' + t)
      const f: Array<(x: any) => boolean> = []
      let op = 'select'; let fila: any
      const api: any = {
        select: () => api, insert: (x: any) => { op = 'insert'; fila = x; return api }, delete: () => { op = 'delete'; return api },
        eq: (k: string, v: unknown) => { f.push((x) => x[k] === v); return api },
        filter: (k: string, _o: string, v: unknown) => { f.push((x) => (k === 'config->>creado_por' ? x.config?.creado_por : x[k]) === v); return api },
        gte: (k: string, v: string) => { f.push((x) => String(x[k]) >= v); return api },
        order: (k: string, o?: { ascending?: boolean }) => { pedidos.orden.push([k, o?.ascending !== false]); return api },
        maybeSingle: async () => ({ data: clients.find((x) => f.every((p) => p(x))) ?? null, error: null }),
        single: async () => {
          if (clients.some((x) => x.slug === fila.slug)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
          const nuevo = { id: 'u-' + (clients.length + 1), created_at: '2026-10-19T09:00:00.000Z', ...fila }; clients.push(nuevo); return { data: nuevo, error: null }
        },
        then: (res: any) => {
          if (op === 'delete') { for (const x of clients.filter((c) => f.every((p) => p(c)))) clients.splice(clients.indexOf(x), 1); return Promise.resolve({ error: null }).then(res) }
          return Promise.resolve({ data: clients.filter((c) => f.every((p) => p(c))), error: null }).then(res)
        },
      }
      return api
    }
    return { db: { from }, clients, pedidos }
  }
  it('el orden de llegada es created_at ASCENDENTE y luego id ASCENDENTE (de ahi sale quien cabe en el tope cuando hay carrera)', async () => {
    const { db, pedidos } = dbFalsa()
    await puertosDeFicha(db).creadasPorLaPuerta('2026-10-19T00:00:00.000Z')
    expect(pedidos.orden).toEqual([['created_at', true], ['id', true]])
  })
  it('borrar SOLO borra una ficha creada por esta puerta (aunque el id llegue equivocado, una ficha de otro origen se queda)', async () => {
    const { db, clients } = dbFalsa()
    clients.push({ id: 'ajena', slug: 'ajena', created_at: '2026-10-19T09:00:00.000Z', config: {} }, { id: 'mia', slug: 'mia', created_at: '2026-10-19T09:00:00.000Z', config: { creado_por: ORIGEN_PUERTA } })
    const P = puertosDeFicha(db)
    await P.borrar('ajena')
    expect(clients.map((c) => c.id)).toEqual(['ajena', 'mia'])
    await P.borrar('mia')
    expect(clients.map((c) => c.id)).toEqual(['ajena'])
  })
  it('una ficha archivada o en churned se devuelve como archivada (no se esconde)', async () => {
    const { db, clients } = dbFalsa()
    clients.push({ id: 'a', name: 'A', slug: 'a', archived_at: '2026-10-12T00:00:00Z', config: {} }, { id: 'c', name: 'C', slug: 'c', status: 'churned', config: {} }, { id: 'v', name: 'V', slug: 'v', status: 'active', config: {} })
    const P = puertosDeFicha(db)
    expect((await P.buscarPorSlug('a'))?.archivada).toBe(true)
    expect((await P.buscarPorSlug('c'))?.archivada).toBe(true)
    expect((await P.buscarPorSlug('v'))?.archivada).toBe(false)
  })
  it('crea con estado onboarding y su origen; el duplicado de slug sale como código «duplicado»; cuenta solo las de la puerta; borra la propia', async () => {
    const { db, clients } = dbFalsa()
    const P = puertosDeFicha(db)
    const { id } = await P.crear({ name: 'Uno', slug: 'uno', config: { creado_por: ORIGEN_PUERTA, creado_en: 'x' } })
    expect(clients[0]).toMatchObject({ status: 'onboarding', preferred_language: 'es', slug: 'uno', config: { creado_por: ORIGEN_PUERTA } })
    await expect(P.crear({ name: 'Uno', slug: 'uno', config: { creado_por: ORIGEN_PUERTA, creado_en: 'x' } })).rejects.toMatchObject({ code: 'duplicado' })
    clients.push({ id: 'otra', slug: 'otra', created_at: '2026-10-19T10:00:00.000Z', config: {} })
    expect((await P.creadasPorLaPuerta('2026-10-19T00:00:00.000Z')).map((f) => f.id)).toEqual([id])
    expect(await P.buscarPorSlug('uno')).toEqual({ id, name: 'Uno', archivada: false })
    await P.borrar(id)
    expect(await P.buscarPorSlug('uno')).toBeNull()
  })
})
