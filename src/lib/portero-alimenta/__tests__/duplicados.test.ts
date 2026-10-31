/** PR de duplicados (14-oct): la misma línea en varias páginas es UNA unidad; el índice no repite; el puente va por pasadas de ≤ 40; lo viejo sin lector está retirado. US$ 0. */
import { describe, expect, it } from 'vitest'
import { MAX_TROZOS_A_ESCRIBIR_POR_PASADA, MAX_TROZOS_A_SACAR_POR_PASADA, reconciliarPuente, sinRepetidas, type FichaParaPuente } from '../puente'
import { rutaClientes, rutaPuente } from '../rutas'
import { unidadesDeRaspados } from '../unidades'
import { crearBaseFalsa } from './base-falsa'
import { POST as correrPOST } from '../../../app/api/brain/diario/correr/route'
import { POST as planPOST } from '../../../app/api/brain/diario/plan/route'

const C = '99999999-9999-4999-8999-999999999999'
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const f = (id: string, o: Partial<FichaParaPuente> = {}): FichaParaPuente => ({ id, client_id: C, ref: `portero:sitio:${id}`, clase: 'texto', titulo: 't', contenido: `texto ${id}`, fecha_fuente: null, observado_en: '2026-10-15T10:00:00Z', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null, huella: `h-${id}`, ...o })

describe('la misma línea en varias páginas es UNA unidad', () => {
  const pagina = (url: string, texto: string) => ({ url, text: texto })
  it('sitio: 4 páginas con el mismo menú y pie dan una unidad por línea; las líneas propias de cada página siguen', () => {
    const comun = 'Ceviche y encebollado con el marisco más fresco\nHorario de lunes a domingo de 8 a 4'
    const us = unidadesDeRaspados([{ id: 'w', apify_function: 'website_content_scraper', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: [
      pagina('https://x.example/', `${comun}\nBienvenidos a la home`), pagina('https://x.example/faq', `${comun}\nPreguntas frecuentes del local`), pagina('https://x.example/privacidad', `${comun}\nPolítica de privacidad del sitio`), pagina('https://x.example/mi-cuenta', comun),
    ] }], { propios: { sitio: 'https://x.example', handles: [] } })
    const lineas = us.map((u) => u.unidad_ref)
    expect(new Set(lineas).size).toBe(lineas.length) // ninguna repetida
    expect(lineas.filter((l) => /ceviche y encebollado/.test(l))).toHaveLength(1)
    expect(lineas.filter((l) => /horario de lunes a domingo/.test(l))).toHaveLength(1)
    expect(lineas).toEqual(expect.arrayContaining(['bienvenidos a la home', 'preguntas frecuentes del local', 'politica de privacidad del sitio']))
  })
  it('otras fuentes no se mezclan: la misma publicación de dos cuentas distintas son dos unidades', () => {
    const ig = (u: string) => ({ username: u, biography: '', latestPosts: [{ shortCode: 'AAA', caption: 'una publicación igual en dos cuentas distintas', ownerUsername: u }] })
    const us = unidadesDeRaspados([{ id: 'i', apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: [ig('cuenta_a'), ig('cuenta_b')] }], { propios: { handles: ['cuenta_a', 'cuenta_b'] } })
    expect(us.filter((u) => u.unidad_ref === 'AAA')).toHaveLength(2)
  })
})

describe('el índice no repite lo que ya está', () => {
  it('sinRepetidas: de varias fichas vivas con la misma (fuente, huella) queda la más antigua; sin huella no se tocan; fuentes distintas no se mezclan', () => {
    const r = sinRepetidas([
      f('b', { huella: 'X', observado_en: '2026-10-15T12:00:00Z' }), f('a', { huella: 'X', observado_en: '2026-10-15T09:00:00Z' }), f('c', { huella: 'X', observado_en: '2026-10-15T09:00:00Z' }),
      f('d', { huella: 'X', ref: 'portero:resenas:d' }), f('e', { huella: null }), f('g', { huella: null }),
    ])
    expect(r.unicas.map((x) => x.id).sort()).toEqual(['a', 'd', 'e', 'g'])
    expect(r.repetidas.map((x) => x.id).sort()).toEqual(['b', 'c'])
  })
  it('reconciliarPuente: la repetida no se escribe y, si ya tenía trozo, SALE; el representante queda', () => {
    const fichas = [f('a', { huella: 'X', observado_en: '2026-10-15T09:00:00Z' }), f('b', { huella: 'X', observado_en: '2026-10-15T10:00:00Z' }), f('c', { huella: 'Y' })]
    const r = reconciliarPuente(fichas, ['b'])
    expect(r.escribir.map((p) => p.source_id).sort()).toEqual(['a', 'c'])
    expect(r.sacar).toEqual(['b'])
    expect(r.duplicadas).toBe(1)
    expect(r.ya_buscables).toBe(0)
  })
  it('idempotente con repetidas: aplicado el resultado, la segunda pasada no tiene nada', () => {
    const fichas = [f('a', { huella: 'X', observado_en: '2026-10-15T09:00:00Z' }), f('b', { huella: 'X', observado_en: '2026-10-15T10:00:00Z' }), f('c', { huella: 'Y' })]
    const chunks = new Set(['b'])
    const r1 = reconciliarPuente(fichas, chunks)
    r1.escribir.forEach((p) => chunks.add(p.source_id)); r1.sacar.forEach((s) => chunks.delete(s))
    const r2 = reconciliarPuente(fichas, chunks)
    expect(r2.escribir).toEqual([]); expect(r2.sacar).toEqual([])
    expect([...chunks].sort()).toEqual(['a', 'c'])
  })
})

describe('el puente va por pasadas (sin 504)', () => {
  const tablas = (n: number) => ({
    cerebro_fichas: Array.from({ length: n }, (_, i) => ({ id: `F${String(i).padStart(3, '0')}`, client_id: C, ref: `portero:sitio:${i}`, clase: 'texto', titulo: 't', contenido: `texto ${i}`, propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null, huella: `h${i}`, observado_en: '2026-10-15T10:00:00Z' })),
    client_brain_chunks: [] as Array<Record<string, unknown>>,
  })
  it('203 pendientes se envían de 40 en 40: 6 pasadas, cada una dice cuánto QUEDA, y la última deja 0', async () => {
    const t = tablas(203)
    const base = crearBaseFalsa(t as never)
    const tamanos: number[] = []
    const puente = async (p: { escribir: Array<{ source_id: string }>; sacar: string[] }) => { tamanos.push(p.escribir.length); for (const x of p.escribir) t.client_brain_chunks.push({ client_id: C, source_table: 'cerebro_fichas', source_id: x.source_id }); return { escritos: p.escribir.length, sacados: 0, errores: [] as string[] } }
    const quedan: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = await rutaPuente({ db: base.db, interruptores: ON, puente }, { client_id: C, dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' })
      expect(r.status).toBe(200)
      quedan.push((r.body.puente as { quedan: number }).quedan)
      if (quedan[quedan.length - 1] === 0) break
    }
    expect(MAX_TROZOS_A_ESCRIBIR_POR_PASADA).toBe(40)
    expect(tamanos).toEqual([40, 40, 40, 40, 40, 3])
    expect(quedan).toEqual([163, 123, 83, 43, 3, 0])
    expect(t.client_brain_chunks).toHaveLength(203)
  })
  it('los trozos a sacar también van por pasadas (tope 200)', async () => {
    const t = { cerebro_fichas: [] as unknown[], client_brain_chunks: Array.from({ length: 450 }, (_, i) => ({ client_id: C, source_table: 'cerebro_fichas', source_id: `X${i}` })) }
    const base = crearBaseFalsa(t as never)
    let sacados = 0
    const r = await rutaPuente({ db: base.db, interruptores: ON, puente: async (p) => { sacados = p.sacar.length; return { escritos: 0, sacados: p.sacar.length, errores: [] } } }, { client_id: C, dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' })
    expect(MAX_TROZOS_A_SACAR_POR_PASADA).toBe(200)
    expect(sacados).toBe(200)
    expect((r.body.puente as { quedan: number }).quedan).toBe(250)
  })
  it('en seco solo cuenta (no llama al puente); apagado no lee; sin dry_run 400; falla de lectura se dice (502)', async () => {
    const t = tablas(5)
    const base = crearBaseFalsa(t as never)
    let llamado = false
    const s = await rutaPuente({ db: base.db, interruptores: ON, puente: async () => { llamado = true; return { escritos: 0, sacados: 0, errores: [] } } }, { client_id: C, dry_run: true })
    expect(llamado).toBe(false)
    expect(s.body.puente).toMatchObject({ pendientes: 5, quedan: 5, esta_pasada: { escribir: 5, sacar: 0 } })
    const apagado = crearBaseFalsa(t as never)
    expect((await rutaPuente({ db: apagado.db, interruptores: { ...ON, puente_al_indice: false } }, { client_id: C, dry_run: true })).body.apagado).toBe(true)
    expect(apagado.lecturas).toEqual([])
    expect((await rutaPuente({ db: base.db, interruptores: ON }, { client_id: C })).status).toBe(400)
    const caida = crearBaseFalsa(t as never, { fallaEn: 'client_brain_chunks' })
    const e = await rutaPuente({ db: caida.db, interruptores: ON }, { client_id: C, dry_run: true })
    expect(e.status).toBe(502)
    expect(e.body.puente).toMatchObject({ lectura_fallida: true })
  })
  it('una falla del envío se DICE y lo que falló sigue en «quedan» (se reintenta en la pasada siguiente)', async () => {
    const t = tablas(3)
    const base = crearBaseFalsa(t as never)
    const r = await rutaPuente({ db: base.db, interruptores: ON, puente: async () => ({ escritos: 1, sacados: 0, errores: ['ingest-source respondió 502'] }) }, { client_id: C, dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' })
    expect(r.status).toBe(502)
    expect(r.body.ok).toBe(false)
    expect((r.body.puente as { quedan: number }).quedan).toBe(2)
  })
})

describe('los clientes que atiende el portero salen de la ruta nueva', () => {
  const t = () => ({
    clients: [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Con alta', status: 'onboarding', archived_at: null, config: {} },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Sin plan', status: 'onboarding', archived_at: null, config: {} },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Archivado', status: 'churned', archived_at: '2026-10-01T00:00:00Z', config: {} },
      { id: '44444444-4444-4444-8444-444444444444', name: 'cliente de práctica', status: 'onboarding', archived_at: null, config: { es_de_prueba: true } },
    ],
    client_brand_books: [{ client_id: '11111111-1111-4111-8111-111111111111' }, { client_id: '22222222-2222-4222-8222-222222222222' }, { client_id: '33333333-3333-4333-8333-333333333333' }],
    client_historical_outputs: [
      { client_id: '11111111-1111-4111-8111-111111111111', output_type: 'campaign_plan_90d', provenance_tag: {} },
      { client_id: '33333333-3333-4333-8333-333333333333', output_type: 'campaign_plan_90d', provenance_tag: { prueba_x: true } },
    ],
  })
  it('lista solo las altas realizadas y dice por qué se excluye cada otra', async () => {
    const base = crearBaseFalsa(t() as never)
    const r = await rutaClientes({ db: base.db, interruptores: ON }, { dry_run: true })
    expect((r.body.clientes as Array<{ client_id: string }>).map((c) => c.client_id)).toEqual(['11111111-1111-4111-8111-111111111111'])
    const ex = r.body.excluidos as Array<{ client_id: string; motivos: string[] }>
    expect(ex.find((x) => x.client_id.startsWith('2222'))!.motivos).toEqual(['sin plan de 90 días'])
    expect(ex.find((x) => x.client_id.startsWith('3333'))!.motivos).toEqual(expect.arrayContaining(['archivado', 'dado de baja (churned)', 'sin plan de 90 días']))
    expect(ex.find((x) => x.client_id.startsWith('4444'))!.motivos).toEqual(expect.arrayContaining(['cliente de prueba', 'sin manual de marca']))
    expect(base.escrituras).toEqual([])
  })
  it('client_id limita el alcance; apagado no lee; dry_run obligatorio; error de lectura se dice', async () => {
    const base = crearBaseFalsa(t() as never)
    const solo = await rutaClientes({ db: base.db, interruptores: ON }, { dry_run: true, client_id: '22222222-2222-4222-8222-222222222222' })
    expect(solo.body.clientes).toEqual([])
    expect((solo.body.excluidos as unknown[]).length).toBe(1)
    const ap = crearBaseFalsa(t() as never)
    expect((await rutaClientes({ db: ap.db, interruptores: { ...ON, alimentar: false } }, { dry_run: true })).body.apagado).toBe(true)
    expect(ap.lecturas).toEqual([])
    expect((await rutaClientes({ db: base.db, interruptores: ON }, {})).status).toBe(400)
    expect((await rutaClientes({ db: crearBaseFalsa(t() as never, { fallaEn: 'clients' }).db, interruptores: ON }, { dry_run: true })).status).toBe(502)
  })
})

describe('lo viejo sin lector está RETIRADO', () => {
  const pedir = (conLlave: boolean) => new Request('https://x.test/api/brain/diario/x', { method: 'POST', headers: { 'content-type': 'application/json', ...(conLlave ? { 'x-api-key': 'k-prueba' } : {}) }, body: JSON.stringify({ client_id: C, dry_run: true }) })
  it('/api/brain/diario/{plan,correr} contestan 401 sin llave y 410 con ella (nunca ejecutan nada)', async () => {
    const g = process.env.INTERNAL_API_KEY
    process.env.INTERNAL_API_KEY = 'k-prueba'
    try {
      for (const POST of [planPOST, correrPOST]) {
        expect((await POST(pedir(false))).status).toBe(401)
        const r = await POST(pedir(true))
        expect(r.status).toBe(410)
        expect((await r.json()).error).toBe('retirada')
      }
    } finally { if (g === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = g }
  })
})

describe('documentos y videos enlazados por el sitio propio (31-oct · «guardar todo»)', () => {
  const fila = (extra: Record<string, unknown>) => ({ id: 'w', apify_function: 'website_content_scraper', ensayo: false, created_at: '2026-10-31T08:00:00Z', respuesta: [{ url: 'https://x.example/carta', text: 'Carta del día', ...extra }] })
  it('cada PDF y cada video enlazado es una unidad del sitio con su texto y su enlace; el mismo enlace en dos páginas es una sola', () => {
    const enl = { documentos: [{ url: 'https://x.example/menu%20verano.pdf', texto: 'Menú de verano' }, { url: 'https://x.example/otro.pdf', texto: '' }], videos: [{ url: 'https://youtu.be/abc', texto: 'Cómo se prepara' }] }
    const us = unidadesDeRaspados([{ ...fila({ _enlaces: enl }), respuesta: [{ url: 'https://x.example/carta', text: 'Carta del día', _enlaces: enl }, { url: 'https://x.example/otra', text: 'Otra página del local', _enlaces: enl }] }], { propios: { sitio: 'https://x.example', handles: [] } })
    const e = us.filter((u) => u.unidad_ref.startsWith('enlace:'))
    expect(e.map((u) => u.texto).sort()).toEqual(['Documento enlazado: Menú de verano · https://x.example/menu%20verano.pdf', 'Documento enlazado: otro.pdf · https://x.example/otro.pdf', 'Video enlazado: Cómo se prepara · https://youtu.be/abc'].sort())
    expect(e.every((u) => u.fuente === 'sitio' && u.autoria === 'propia' && u.clase_dato === 'acumula')).toBe(true)
  })
  it('🔴 los enlaces de una página que NO es del cliente no entran; sin `_enlaces` o con basura no rompe', () => {
    const ajeno = unidadesDeRaspados([{ ...fila({ _enlaces: { documentos: [{ url: 'https://x.example/a.pdf', texto: 'a' }] } }), respuesta: [{ url: 'https://tercero.com/x', text: 'Texto de un tercero largo', _enlaces: { documentos: [{ url: 'https://tercero.com/a.pdf', texto: 'a' }] } }] }], { propios: { sitio: 'https://x.example', handles: [] } })
    expect(ajeno.filter((u) => u.unidad_ref.startsWith('enlace:'))).toHaveLength(0)
    expect(() => unidadesDeRaspados([fila({ _enlaces: { documentos: [null, 'x', { url: 'javascript:1' }, { url: 5 }], videos: 'no' } }), fila({})], { propios: { sitio: 'https://x.example', handles: [] } })).not.toThrow()
  })
})
