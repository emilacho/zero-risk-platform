/**
 * ADENDA 3 de Emilio (01-nov): una sola fuente para los datos del negocio. Dos clientes, y sus fallos a la vista. US$ 0, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { datosDelNegocio } from '../src/lib/portero-alimenta/contexto-del-cliente'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ficha = (id: string, tema: string, respuesta: string, frases_negadas: string[] = []) => ({ id, client_id: C, clase: 'dato_del_dueno', contenido: 'x', observado_en: '2026-10-16T00:00:00Z', provenance_tag: { datos: { tema, respuesta, frases_negadas } } })
const completa = () => new DbFalsa()
  .semilla('cerebro_fichas', [ficha('a', 'solo lectura · sitio web, sitio', 'no la toca la agencia'), ficha('b', 'origen del producto', 'viene de Loja', ['de origen local'])])
  .semilla('client_brand_books', [{ client_id: C, version: 1, tagline: 'El de siempre', content_text: '{}' }])
  .semilla('client_sedes', [{ id: 's1', client_id: C, clave: 'cuenca', ciudad: 'Cuenca' }, { id: 's2', client_id: C, clave: 'loja', ciudad: 'Loja' }])
  .semilla('client_sede_datos', [{ client_id: C, sede_id: 's1', campo: 'horario', valor_texto: '8 a 17', fuente: 'dueno', observado_en: '2026-10-01' }])
const roto = (tabla: string, db: DbFalsa) => ({ from: (t: string) => {
  if (t !== tabla) return db.from(t)
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte']) q[m] = () => q
  q.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: { message: 'tiempo agotado' } })
  return q
} })

describe('🔴 la fuente', () => {
  it('trae todo lo compartido, ya armado', async () => {
    const d = await datosDelNegocio(completa() as never, C)
    expect(d.eslogan?.texto).toBe('El de siempre')
    expect(d.sedes.map((s) => s.clave)).toEqual(['cuenca', 'loja'])
    expect(d.hechos_del_dueno.map((h) => h.tema)).toContain('origen del producto')
    expect(d.activos_solo_lectura).toEqual(['sitio web, sitio'])
    expect(d.fallos).toEqual([])
  })
  it('🔴 lo que aún no existe se nombra: la carta por sede', async () => {
    expect((await datosDelNegocio(completa() as never, C)).sin_dato).toContain('carta y precios por sede')
  })
  it('un cliente sin nada: listas vacías y ningún fallo', async () => {
    expect(await datosDelNegocio(new DbFalsa().semilla('cerebro_fichas', []) as never, C)).toEqual({ eslogan: null, sedes: [], hechos_del_dueno: [], activos_solo_lectura: [], sin_dato: ['carta y precios por sede'], fallos: [] })
  })
  it.each([['client_sedes', /sedes/], ['client_sede_datos', /datos de sede/], ['client_brand_books', /manual/], ['cerebro_fichas', /fichas/]])('🔴 una lectura caída de %s se dice: nunca parece «no hay datos»', async (tabla, re) => {
    const d = await datosDelNegocio(roto(tabla, completa()) as never, C)
    expect(d.fallos.join(' ')).toMatch(re)
    expect(d.fallos.join(' ')).toMatch(/tiempo agotado/)
  })
  it('una base que lanza se dice, sin tumbar la lectura', async () => {
    const db = completa()
    const d = await datosDelNegocio({ from: (t: string) => { if (t === 'client_sedes') throw new Error('caída'); return db.from(t) } } as never, C)
    expect(d.fallos).toEqual(['sedes: caída'])
    expect(d.eslogan?.texto).toBe('El de siempre')
  })
})

describe('🔴 la ruta', () => {
  const previo = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int' })
  afterEach(() => { if (previo === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previo })
  const pedir = (cuerpo: unknown, llave: string | null = 'k-int') => new Request('https://t.test/api/cliente/datos-del-negocio', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo) })
  it('sin llave 401; un id malo 400; bien 200; con un fallo 502, y aun así trae lo que pudo leer', async () => {
    const { POST } = await import('../src/app/api/cliente/datos-del-negocio/route')
    mocks.db = completa()
    expect((await POST(pedir({ client_id: C }, null))).status).toBe(401)
    expect((await POST(pedir({ client_id: 'x' }))).status).toBe(400)
    const bien = await POST(pedir({ client_id: C }))
    expect(bien.status).toBe(200)
    expect(await bien.json()).toMatchObject({ ok: true, client_id: C, activos_solo_lectura: ['sitio web, sitio'] })
    mocks.db = roto('client_sedes', completa())
    const mal = await POST(pedir({ client_id: C }))
    expect(mal.status).toBe(502)
    expect(await mal.json()).toMatchObject({ ok: false, fallos: [expect.stringMatching(/sedes/)], eslogan: expect.objectContaining({ texto: 'El de siempre' }) })
  })
})
