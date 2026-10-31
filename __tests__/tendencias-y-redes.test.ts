/**
 * «TENDENCIAS Y REDES» (31-oct · CC-CEREBRO) · US$ 0, sin red: los actores y la base son falsos.
 * Embudo global → país → competencia → directa, de lo más gustado a lo menos · bodega viral del mundo aparte · lectura por separado.
 */
import { describe, it, expect } from 'vitest'
import { ACTORES, competidoresDeLaFicha, correrConsultas, ejecutarEnApify, guardarTendencias, ordenDelEmbudo, piezaDe, planDeLaBodega, planDeTendencias, yaSeMiroHoy, TOPE_POR_CORRIDA_USD, type Consulta1, type Ejecutar } from '../src/lib/portero-alimenta/tendencias'
import { bodegaDelMundo, tendenciasDelCliente, terminosDelModelo, terminosPorCodigo } from '../src/lib/portero-alimenta/tendencias-del-cliente'
import { listarTendencias } from '../src/lib/cerebro/portero/tendencias-lectura'
import { esPedidoDeTendencias, pideLaBodega, rutaPedido, type DepsDePedido } from '../src/lib/portero-alimenta/pedidos'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES } from '../src/lib/portero-alimenta/__tests__/diez-clientes.fixtures'
import { tablasDe } from '../src/lib/portero-alimenta/__tests__/diez-clientes.tablas'
import { AHORA, ON } from '../src/lib/portero-alimenta/__tests__/fixtures-despertar'

type Fila = Record<string, unknown>
const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const CTX = { nivel: 'global' as const, origen: 'referencia' as const, consulta: '#ceviche', pais: null }
const ahora = new Date('2026-10-31T15:00:00Z')

describe('A · cada actor se lee con su forma real', () => {
  it('TikTok: vistas, me gusta, compartidos, comentarios, autor y fecha en segundos', () => {
    const p = piezaDe('tiktok', { id: '7001', title: 'ceviche fácil', views: 900, likes: 120, comments: 7, shares: 3, channel: { username: 'chef' }, uploadedAt: 1761900000, postPage: 'https://www.tiktok.com/@chef/video/7001', video: { cover: 'https://cdn/c.jpg' } }, CTX)
    expect(p).toMatchObject({ post_ref: '7001', red: 'tiktok', tipo: 'video', vistas: 900, me_gusta: 120, compartidos: 3, comentarios: 7, autor: 'chef', url: 'https://www.tiktok.com/@chef/video/7001', media_url: 'https://cdn/c.jpg', nivel: 'global', origen: 'referencia' })
    expect(p?.publicado_en).toBe(new Date(1761900000 * 1000).toISOString())
  })
  it('Instagram: video o imagen según el tipo; X: vistas, me gusta, retuits y respuestas; LinkedIn: reacciones', () => {
    expect(piezaDe('instagram', { shortCode: 'AB', type: 'Video', likesCount: 50, commentsCount: 4, videoViewCount: 800, ownerUsername: 'u', timestamp: '2026-10-20T10:00:00.000Z', displayUrl: 'https://i/x.jpg' }, CTX)).toMatchObject({ post_ref: 'AB', tipo: 'video', vistas: 800, me_gusta: 50, comentarios: 4, autor: 'u' })
    expect(piezaDe('instagram', { shortCode: 'CD', type: 'Image', likesCount: 3 }, CTX)).toMatchObject({ tipo: 'imagen', vistas: null })
    expect(piezaDe('x', { id: '55', url: 'https://x.com/a/status/55', text: 'hola', likeCount: 300, retweetCount: 20, replyCount: 5, viewCount: 9000, createdAt: 'Fri Oct 30 10:00:00 +0000 2026', author: { userName: 'a' }, media: ['https://m/1.jpg'] }, CTX)).toMatchObject({ red: 'x', vistas: 9000, me_gusta: 300, compartidos: 20, comentarios: 5, autor: 'a', media_url: 'https://m/1.jpg' })
    expect(piezaDe('linkedin', { activity_urn: 'urn:li:activity:1', post_url: 'https://linkedin.com/posts/1', text: 'b2b', posted_at: { timestamp: 1761900000000 }, stats: { total_reactions: 80, comments: 6, reposts: 2 }, author: { name: 'Empresa' } }, CTX)).toMatchObject({ red: 'linkedin', me_gusta: 80, comentarios: 6, compartidos: 2, vistas: null, autor: 'Empresa' })
  })
  it('🔴 lo que no trae queda en null (no se inventa) y una fila sin identificador se descarta', () => {
    const p = piezaDe('tiktok', { id: '9' }, CTX)
    expect(p).toMatchObject({ vistas: null, me_gusta: null, compartidos: null, comentarios: null, autor: null, publicado_en: null, url: null })
    expect(piezaDe('tiktok', {}, CTX)).toBeNull()
    expect(piezaDe('x', null, CTX)).toBeNull()
    expect(piezaDe('instagram', { likesCount: 1 }, CTX)).toBeNull()
    expect(piezaDe('linkedin', { text: 'sin id' }, CTX)).toBeNull()
    expect(piezaDe('tiktok', { id: '1', views: -5, likes: 'abc' }, CTX)).toMatchObject({ vistas: null, me_gusta: null })
  })
  it('cada red de la lista tiene su actor elegido y la razón', () => {
    expect(Object.keys(ACTORES).sort()).toEqual(['instagram', 'linkedin', 'tiktok', 'x'])
    for (const a of Object.values(ACTORES)) expect(a.actor).toMatch(/~/), expect(a.por_que.length).toBeGreaterThan(10)
  })
})

describe('A · el plan del embudo', () => {
  const terminos = { global: ['ceviche', 'seafood'], pais: ['cevichecostero', 'mariscos'], competencia: ['cevicheolon'] }
  const comp = competidoresDeLaFicha({ apify: { competitor_list: [{ name: 'Rival', handles: { tiktok: '@rival.ec', linkedin: 'rival-sa', x: 'https://x.com/rival' } }, { name: '', handles: {} }, { name: 'Sin redes' }] } })
  it('los competidores nombrados de la ficha se leen; los sin nombre no', () => {
    expect(comp.map((c) => c.name)).toEqual(['Rival', 'Sin redes'])
    expect(comp[0].handles).toMatchObject({ tiktok: '@rival.ec', linkedin: 'rival-sa' })
    expect(competidoresDeLaFicha(null)).toEqual([])
    expect(competidoresDeLaFicha({ apify: { competitor_list: 'no' } })).toEqual([])
  })
  it('van los cuatro niveles en orden y la competencia directa es de origen «competidor»', () => {
    const plan = planDeTendencias({ terminos, pais: 'EC', competidores: comp, b2b: false })
    const niveles = plan.map((q) => q.nivel)
    expect([...new Set(niveles)]).toEqual(['global', 'pais', 'competencia', 'directa'])
    expect(niveles).toEqual([...niveles].sort((a, b) => ['global', 'pais', 'competencia', 'directa'].indexOf(a) - ['global', 'pais', 'competencia', 'directa'].indexOf(b)))
    expect(plan.filter((q) => q.nivel !== 'directa').every((q) => q.origen === 'referencia')).toBe(true)
    expect(plan.filter((q) => q.nivel === 'directa').every((q) => q.origen === 'competidor')).toBe(true)
    expect(plan.find((q) => q.nivel === 'directa' && q.red === 'tiktok')?.input).toMatchObject({ startUrls: ['https://www.tiktok.com/@rival.ec'] })
    expect(plan.find((q) => q.nivel === 'directa' && q.red === 'x')?.input).toMatchObject({ searchTerms: ['from:rival'] })
    expect(plan.find((q) => q.nivel === 'pais')?.pais).toBe('EC')
    expect(plan.find((q) => q.nivel === 'global')?.pais).toBeNull()
  })
  it('🔴 LinkedIn solo si el negocio es B2B', () => {
    expect(planDeTendencias({ terminos, pais: 'EC', competidores: comp, b2b: false }).some((q) => q.red === 'linkedin')).toBe(false)
    const b2b = planDeTendencias({ terminos, pais: 'EC', competidores: comp, b2b: true }).filter((q) => q.red === 'linkedin')
    expect(b2b).toHaveLength(1)
    expect(b2b[0]).toMatchObject({ nivel: 'directa', input: { company_name: 'rival-sa' } })
  })
  it('un hashtag se limpia de espacios y tildes; los repetidos no se piden dos veces', () => {
    const plan = planDeTendencias({ terminos: { global: ['Ceviche Rápido', 'ceviche rapido'], pais: ['x'], competencia: ['y'] }, pais: null, competidores: [], b2b: false })
    const tk = plan.filter((q) => q.nivel === 'global' && q.red === 'tiktok')
    expect(tk).toHaveLength(1)
    expect(tk[0].input).toMatchObject({ startUrls: ['https://www.tiktok.com/tag/cevicherapido'] })
    expect(plan.some((q) => q.nivel === 'pais' && q.red !== 'x')).toBe(false)
  })
  it('la bodega no es de nadie: nivel «mundo», sin cliente, con una consulta por país', () => {
    const b = planDeLaBodega({ paises: ['EC', 'MX'] })
    expect(b.every((q) => q.nivel === 'mundo' && q.origen === 'referencia')).toBe(true)
    expect(new Set(b.map((q) => q.red))).toEqual(new Set(['tiktok', 'instagram', 'x']))
    expect(b.filter((q) => q.pais).map((q) => q.pais)).toEqual(['EC', 'MX'])
  })
})

describe('A · correr las consultas: orden, topes y fallos declarados', () => {
  const q = (red: Consulta1['red'], nivel: Consulta1['nivel'], etiqueta: string): Consulta1 => ({ red, nivel, origen: 'referencia', etiqueta, input: { k: etiqueta } })
  const ok = (items: unknown[], costo = 0.01): Ejecutar => async () => ({ items, costo_usd: costo })
  it('cuenta por red y nivel, suma el gasto real y no repite la misma pieza', async () => {
    const plan = [q('tiktok', 'global', '#a'), q('tiktok', 'pais', '#b')]
    const r = await correrConsultas({ plan, ejecutar: ok([{ id: '1', likes: 5 }, { id: '2', likes: 9 }]), topeDelDiaUsd: 1 })
    expect(r).toMatchObject({ consultas: 2, piezas: 2, por_red: { tiktok: 2 }, por_nivel: { global: 2 }, gasto_usd: 0.02 })
    expect(r.declarado.join(' ')).toMatch(/pinterest/i)
  })
  it('🔴 una consulta que falla o no trae nada se declara con su causa y no tumba las demás', async () => {
    const ejecutar: Ejecutar = async (_a, input) => { if (input.k === '#mala') throw new Error('HTTP 403 sin acceso'); if (input.k === '#vacia') return { items: [], costo_usd: 0 }; return { items: [{ id: 'z' }], costo_usd: 0 } }
    const r = await correrConsultas({ plan: [q('tiktok', 'global', '#mala'), q('tiktok', 'global', '#vacia'), q('tiktok', 'global', '#buena')], ejecutar, topeDelDiaUsd: 1 })
    expect(r.piezas).toBe(1)
    expect(r.fallidas.map((f) => [f.consulta, f.causa])).toEqual([['#mala', 'HTTP 403 sin acceso'], ['#vacia', 'el actor no devolvió publicaciones']])
  })
  it('🔴 el tope del día frena: lo que ya se gastó cuenta y lo no corrido se cuenta como omitido', async () => {
    const plan = Array.from({ length: 12 }, (_, i) => q('x', 'global', `t${i}`))
    let llamadas = 0
    const r = await correrConsultas({ plan, ejecutar: async (_a, _i, tope) => { llamadas++; return { items: [{ id: `i${llamadas}` }], costo_usd: tope } }, topeDelDiaUsd: 0.5, paralelo: 4 })
    expect(r.gasto_usd).toBeLessThanOrEqual(0.5 + 1e-9)
    expect(r.omitidas_por_tope).toBeGreaterThan(0)
    expect(llamadas + r.omitidas_por_tope).toBe(12)
    const previo = await correrConsultas({ plan, ejecutar: ok([{ id: 'p' }]), topeDelDiaUsd: 0.5, gastoPrevioUsd: 0.5 })
    expect(previo).toMatchObject({ consultas: 0, omitidas_por_tope: 12 })
  })
  it('cada corrida lleva su tope de gasto, nunca más de US$ 0,10', async () => {
    const topes: number[] = []
    await correrConsultas({ plan: [q('x', 'global', 'a'), q('x', 'global', 'b')], ejecutar: async (_a, _i, m) => { topes.push(m); return { items: [], costo_usd: 0 } }, topeDelDiaUsd: 5 })
    expect(Math.max(...topes)).toBeLessThanOrEqual(TOPE_POR_CORRIDA_USD)
    const chico: number[] = []
    await correrConsultas({ plan: [q('x', 'global', 'a'), q('x', 'global', 'b')], ejecutar: async (_a, _i, m) => { chico.push(m); return { items: [], costo_usd: 0 } }, topeDelDiaUsd: 0.04 })
    expect(Math.max(...chico)).toBeLessThanOrEqual(0.02 + 1e-9)
  })
  it('cada red llama a SU actor', async () => {
    const vistos: string[] = []
    await correrConsultas({ plan: [q('tiktok', 'global', 'a'), q('x', 'global', 'b')], ejecutar: async (a) => { vistos.push(a); return { items: [], costo_usd: 0 } }, topeDelDiaUsd: 1 })
    expect(vistos.sort()).toEqual([ACTORES.tiktok.actor, ACTORES.x.actor].sort())
  })
})

describe('A · el orden del embudo', () => {
  const f = (nivel: string, me_gusta: number | null, vistas: number | null = null) => ({ nivel, me_gusta, vistas })
  it('primero el nivel (global → país → competencia → directa), dentro de cada uno de más gustado a menos; sin dato al final; empate por vistas', () => {
    const o = ordenDelEmbudo([f('directa', 999), f('global', 1), f('competencia', 50), f('global', 100), f('pais', null), f('pais', 7), f('global', 100, 5), f('global', 100, 50)])
    expect(o.map((x) => [x.nivel, x.me_gusta, x.vistas])).toEqual([['global', 100, 50], ['global', 100, 5], ['global', 100, null], ['global', 1, null], ['pais', 7, null], ['pais', null, null], ['competencia', 50, null], ['directa', 999, null]])
  })
  it('la bodega («mundo») se ordena solo por lo gustado', () => {
    expect(ordenDelEmbudo([f('mundo', 1), f('mundo', 9)]).map((x) => x.me_gusta)).toEqual([9, 1])
  })
})

describe('A · guardar, una vez por día, sin borrar', () => {
  const pieza = piezaDe('tiktok', { id: '1', likes: 4 }, CTX)!
  it('un POST con la clave única por cliente, red, pieza y día; duplicados se ignoran; la bodega va con cliente nulo', async () => {
    const vistos: Array<{ url: string; init?: RequestInit }> = []
    const r = await guardarTendencias({ clientId: CID, piezas: [pieza], urlDeLaBase: 'https://b.co/', llave: 'k', ahora, fetchImpl: async (url, init) => { vistos.push({ url, init }); return new Response('', { status: 201 }) } })
    expect(r).toEqual({ guardadas: 1 })
    expect(vistos[0].url).toBe('https://b.co/rest/v1/cerebro_tendencias?on_conflict=client_id,red,post_ref,observado_dia')
    expect((vistos[0].init?.headers as Record<string, string>).Prefer).toContain('ignore-duplicates')
    const fila = JSON.parse(String(vistos[0].init?.body))[0]
    expect(fila).toMatchObject({ client_id: CID, subcategoria: 'tendencia', observado_dia: '2026-10-31', nivel: 'global', origen: 'referencia' })
    const b = await guardarTendencias({ clientId: null, piezas: [pieza], urlDeLaBase: 'https://b.co', llave: 'k', ahora, fetchImpl: async (_u, init) => { expect(JSON.parse(String(init?.body))[0].client_id).toBeNull(); return new Response('', { status: 201 }) } })
    expect(b.guardadas).toBe(1)
  })
  it('🔴 si la base rechaza, lo dice (0 guardadas + el error); sin llave o sin piezas no llama', async () => {
    expect(await guardarTendencias({ clientId: CID, piezas: [pieza], urlDeLaBase: 'https://b.co', llave: 'k', ahora, fetchImpl: async () => new Response('', { status: 403 }) })).toEqual({ guardadas: 0, error: 'la tabla de tendencias respondió HTTP 403' })
    expect((await guardarTendencias({ clientId: CID, piezas: [pieza], urlDeLaBase: '', llave: '', ahora })).error).toMatch(/no está configurada/)
    expect(await guardarTendencias({ clientId: CID, piezas: [], urlDeLaBase: 'x', llave: 'k', ahora })).toEqual({ guardadas: 0 })
  })
  it('«ya se miró hoy»: sí / no / null si la base falla; cliente nulo = bodega', async () => {
    const urls: string[] = []
    const con = (cuerpo: unknown, status = 200) => async (u: string) => { urls.push(u); return new Response(JSON.stringify(cuerpo), { status }) }
    expect(await yaSeMiroHoy({ clientId: CID, urlDeLaBase: 'https://b.co', llave: 'k', ahora, fetchImpl: con([{ id: 1 }]) })).toBe(true)
    expect(await yaSeMiroHoy({ clientId: null, urlDeLaBase: 'https://b.co', llave: 'k', ahora, fetchImpl: con([]) })).toBe(false)
    expect(await yaSeMiroHoy({ clientId: CID, urlDeLaBase: 'https://b.co', llave: 'k', ahora, fetchImpl: con({}, 500) })).toBeNull()
    expect(urls[0]).toContain(`client_id=eq.${CID}`)
    expect(urls[0]).toContain('observado_dia=eq.2026-10-31')
    expect(urls[1]).toContain('client_id=is.null')
  })
})

describe('A · la llamada real a Apify (con una Apify falsa)', () => {
  it('lanza con tope de gasto, espera, lee el conjunto de datos y devuelve el gasto medido', async () => {
    const urls: string[] = []
    const traer = async (u: string, i?: RequestInit) => {
      urls.push(`${i?.method ?? 'GET'} ${u.replace(/token=[^&]+/, 'token=T')}`)
      if (u.includes('/runs?')) return new Response(JSON.stringify({ data: { id: 'r1', status: 'RUNNING' } }), { status: 201 })
      if (u.includes('/actor-runs/r1')) return new Response(JSON.stringify({ data: { id: 'r1', status: 'SUCCEEDED', defaultDatasetId: 'd1', usageTotalUsd: 0.0123 } }))
      return new Response(JSON.stringify([{ id: 'a' }, { id: 'b' }]))
    }
    const r = await ejecutarEnApify({ token: 'T', fetchImpl: traer })('apidojo~tiktok-scraper', { maxItems: 3 }, 0.08)
    expect(r).toEqual({ items: [{ id: 'a' }, { id: 'b' }], costo_usd: 0.0123 })
    expect(urls[0]).toContain('maxTotalChargeUsd=0.08')
  })
  it('🔴 si Apify rechaza o la corrida se pasa de tiempo, falla con causa (y la cancela)', async () => {
    await expect(ejecutarEnApify({ token: 'T', fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'sin saldo' } }), { status: 402 }) })('a~b', {}, 0.1)).rejects.toThrow(/402 sin saldo/)
    const llamadas: string[] = []
    const lento = async (u: string, i?: RequestInit) => { llamadas.push(`${i?.method ?? 'GET'} ${u}`); return u.includes('/runs?') || u.includes('/actor-runs/r1?') ? new Response(JSON.stringify({ data: { id: 'r1', status: 'RUNNING' } })) : new Response('{}') }
    await expect(ejecutarEnApify({ token: 'T', fetchImpl: lento, esperaMs: 0 })('a~b', {}, 0.1)).rejects.toThrow(/tiempo/)
    expect(llamadas.some((l) => l.startsWith('POST') && l.includes('/abort'))).toBe(true)
  })
})

describe('A · los términos y el trabajo de un cliente', () => {
  it('el modelo propone términos válidos; basura, nombres muy cortos o una lista vacía caen al código', () => {
    expect(terminosDelModelo('ok {"global":["ceviche","seafood"],"pais":["mariscos"],"competencia":["ceviche olon"]}')).toEqual({ global: ['ceviche', 'seafood'], pais: ['mariscos'], competencia: ['ceviche olon'] })
    expect(terminosDelModelo('sin json')).toBeNull()
    expect(terminosDelModelo('{"global":["ab"],"pais":["mariscos"],"competencia":["x y z"]}')).toBeNull()
    expect(terminosDelModelo('{"global":')).toBeNull()
  })
  it('por código: palabras largas del rubro y la ciudad pegada', () => {
    expect(terminosPorCodigo('Restaurante de mariscos costero', 'Olón')).toEqual({ global: ['restaurante', 'mariscos'], pais: ['restaurante', 'mariscos'], competencia: ['restauranteolon', 'mariscosolon'] })
    expect(terminosPorCodigo('', '')).toEqual({ global: [], pais: [], competencia: [] })
  })
  const base = (extra: Fila = {}) => ({ cliente: { name: 'Náufrago', industry: 'restaurante de mariscos', country: 'EC', config: { apify: { competitor_list: [{ name: 'R', handles: { tiktok: 'rival' } }] } } }, clientId: CID, ciudades: ['Olón'], urlDeLaBase: 'https://b.co', llave: 'k', token: 'T', ahora, fetchImpl: async (u: string) => new Response(u.includes('select=id') ? '[]' : '', { status: 200 }), ...extra })
  it('corrida completa: pide términos al modelo, corre el embudo, guarda y suma el costo del modelo', async () => {
    let guardado: Fila[] = []
    const r = await tendenciasDelCliente({ ...(base({ fetchImpl: async (u: string, i?: RequestInit) => { if (i?.method === 'POST') { guardado = JSON.parse(String(i.body)); return new Response('', { status: 201 }) } return new Response('[]') } }) as Fila), llamarModelo: async () => ({ texto: '{"global":["ceviche","seafood"],"pais":["mariscos","cevichecostero"],"competencia":["cevicheolon"]}', costo_usd: 0.002 }), ejecutar: async () => ({ items: [{ id: `i${Math.random()}`, likes: 3 }], costo_usd: 0.01 }) } as never)
    expect(r).toMatchObject({ estado: 'corrida', terminos: { fuente: 'modelo' }, costo_modelo_usd: 0.002 })
    expect(r.guardadas).toBeGreaterThan(0)
    expect(guardado.some((x) => x.nivel === 'directa' && x.origen === 'competidor')).toBe(true)
    expect(guardado.every((x) => x.client_id === CID)).toBe(true)
  })
  it('sin modelo (o con modelo roto) usa el código; ya miradas hoy no gasta nada; sin llave de Apify o sin base lo dice', async () => {
    const roto = await tendenciasDelCliente({ ...base(), llamarModelo: async () => { throw new Error('caído') }, ejecutar: async () => ({ items: [], costo_usd: 0 }) } as never)
    expect(roto.terminos?.fuente).toBe('codigo')
    let llamado = false
    const ya = await tendenciasDelCliente({ ...base({ fetchImpl: async () => new Response('[{"id":1}]') }), ejecutar: async () => { llamado = true; return { items: [], costo_usd: 0 } } } as never)
    expect(ya.estado).toBe('ya_miradas_hoy')
    expect(llamado).toBe(false)
    expect((await tendenciasDelCliente({ ...base({ token: '' }) } as never)).estado).toBe('sin_token')
    expect((await tendenciasDelCliente({ ...base({ llave: '' }) } as never)).estado).toBe('sin_base')
    expect((await tendenciasDelCliente({ ...base({ fetchImpl: async () => new Response('', { status: 500 }) }) } as never)).estado).toBe('sin_base')
  })
  it('🔴 jamás tumba la corrida: un error inesperado vuelve como estado «error»', async () => {
    const r = await tendenciasDelCliente({ ...base({ fetchImpl: async () => { throw new Error('red caída') } }) } as never)
    expect(r).toMatchObject({ estado: 'error' })
    expect(r.detalle).toMatch(/red caída/)
  })
  it('LinkedIn solo se pide si la ficha dice B2B', async () => {
    const redes = async (cliente: Fila) => { const v: string[] = []; await tendenciasDelCliente({ ...(base({ cliente }) as Fila), ejecutar: async (a: string) => { v.push(a); return { items: [], costo_usd: 0 } } } as never); return v }
    const comp = { apify: { competitor_list: [{ name: 'R', handles: { linkedin: 'rival-sa' } }] } }
    expect(await redes({ name: 'ZR', industry: 'seguridad industrial B2B', country: 'EC', config: comp })).toContain(ACTORES.linkedin.actor)
    expect(await redes({ name: 'N', industry: 'restaurante', country: 'EC', config: comp })).not.toContain(ACTORES.linkedin.actor)
  })
  it('la bodega: una vez por día, con cliente nulo, y sin gastar si ya se miró', async () => {
    let cuerpo: Fila[] = []
    const r = await bodegaDelMundo({ paises: ['EC'], urlDeLaBase: 'https://b.co', llave: 'k', token: 'T', ahora, fetchImpl: async (_u: string, i?: RequestInit) => { if (i?.method === 'POST') { cuerpo = JSON.parse(String(i.body)); return new Response('', { status: 201 }) } return new Response('[]') }, ejecutar: async () => ({ items: [{ id: `m${Math.random()}`, likes: 2 }], costo_usd: 0.01 }) })
    expect(r.estado).toBe('corrida')
    expect(cuerpo.length).toBeGreaterThan(0)
    expect(cuerpo.every((x) => x.client_id === null && x.nivel === 'mundo')).toBe(true)
    let llamado = false
    const urlsB: string[] = []
    const ya = await bodegaDelMundo({ paises: [], urlDeLaBase: 'https://b.co', llave: 'k', token: 'T', ahora, fetchImpl: async (u: string) => { urlsB.push(u); return new Response('[{"id":1}]') }, ejecutar: async () => { llamado = true; return { items: [], costo_usd: 0 } } })
    expect(ya.estado).toBe('ya_miradas_hoy')
    expect(urlsB[0]).toContain('client_id=is.null')
    expect(llamado).toBe(false)
  })
})

describe('D · la lectura: tendencias del cliente y bodega, por separado', () => {
  const t = (id: string, o: Fila = {}): Fila => ({ id, client_id: CID, nivel: 'global', red: 'tiktok', origen: 'referencia', subcategoria: 'tendencia', consulta: '#a', tipo: 'video', autor: 'a', texto: 'x', url: 'https://u/' + id, media_url: null, vistas: 10, me_gusta: 5, compartidos: 1, comentarios: 2, publicado_en: null, observado_en: '2026-10-31T10:00:00Z', observado_dia: '2026-10-31', pais: null, video_id: null, ...o })
  const filas: Fila[] = [t('g1', { me_gusta: 5 }), t('g2', { me_gusta: 50 }), t('d1', { nivel: 'directa', origen: 'competidor', me_gusta: 900 }), t('p1', { nivel: 'pais', red: 'x', me_gusta: 1 }), t('viejo', { observado_dia: '2026-10-30', me_gusta: 9999 }), t('m1', { client_id: null, nivel: 'mundo', me_gusta: 777 }), t('m2', { client_id: null, nivel: 'mundo', me_gusta: 8 }), t('otro', { client_id: 'otro-cliente', me_gusta: 12345 })]
  const consultaDe = (tabla: Fila[]) => async (p: { tabla: string; donde: Record<string, unknown> }) => ({ filas: p.tabla === 'cerebro_tendencias' ? tabla.filter((x) => Object.entries(p.donde).every(([k, v]) => x[k] === v)) : [], error: null })
  it('el cliente: solo lo suyo, solo lo vigente, en orden de embudo y de más gustado a menos', async () => {
    const r = await listarTendencias(consultaDe(filas) as never, { cliente: CID })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ alcance: 'cliente', dia_vigente: '2026-10-31', total: 4, dias_con_historial: 2, modelos_llamados: 0, costo_usd: 0, por_nivel: { global: 2, pais: 1, directa: 1 } })
    expect(r.tendencias.map((x) => x.tendencia_id)).toEqual(['g2', 'g1', 'p1', 'd1'])
    expect(r.tendencias.find((x) => x.tendencia_id === 'd1')).toMatchObject({ origen: 'competidor', subcategoria: 'tendencia', video_descargado: false })
  })
  it('la bodega: sin cliente, nada del cliente se cuela y viceversa', async () => {
    const b = await listarTendencias(consultaDe(filas) as never, { cliente: null, bodega: true })
    if (!b.ok) throw new Error('debía leer')
    expect(b).toMatchObject({ alcance: 'bodega', cliente: null, total: 2 })
    expect(b.tendencias.map((x) => x.tendencia_id)).toEqual(['m1', 'm2'])
    const c = await listarTendencias(consultaDe(filas) as never, { cliente: CID })
    if (!c.ok) throw new Error('debía leer')
    expect(c.tendencias.some((x) => x.tendencia_id.startsWith('m'))).toBe(false)
    expect(c.tendencias.some((x) => x.tendencia_id === 'otro')).toBe(false)
  })
  it('el historial no se borra: con `historial` salen también los días anteriores, lo más reciente primero; filtros por nivel y red', async () => {
    const h = await listarTendencias(consultaDe(filas) as never, { cliente: CID, historial: true })
    if (!h.ok) throw new Error('debía leer')
    expect(h.total).toBe(5)
    expect(h.tendencias[h.tendencias.length - 1].tendencia_id).toBe('viejo')
    const n = await listarTendencias(consultaDe(filas) as never, { cliente: CID, nivel: 'directa' })
    if (n.ok) expect(n.tendencias.map((x) => x.tendencia_id)).toEqual(['d1'])
    const rd = await listarTendencias(consultaDe(filas) as never, { cliente: CID, red: 'x' })
    if (rd.ok) expect(rd.tendencias.map((x) => x.tendencia_id)).toEqual(['p1'])
    const l = await listarTendencias(consultaDe(filas) as never, { cliente: CID, limite: 2 })
    if (l.ok) expect(l).toMatchObject({ total: 4, devueltas: 2 })
  })
  it('🔴 entrada inválida se rechaza; un error de la base NO se lee como vacío; sin nada guardado lo dice', async () => {
    expect(await listarTendencias(consultaDe(filas) as never, { cliente: null })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarTendencias(consultaDe(filas) as never, { cliente: CID, red: 'myspace' })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarTendencias(consultaDe(filas) as never, { cliente: CID, nivel: 'luna' })).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect(await listarTendencias((async () => ({ filas: [], error: 'caída' })) as never, { cliente: CID })).toMatchObject({ ok: false, error: 'error_de_lectura' })
    expect(await listarTendencias(consultaDe([]) as never, { cliente: CID })).toMatchObject({ ok: true, total: 0, dia_vigente: null })
  })
  it('el pedido libre distingue «tendencias» de «bodega» y los sirve por separado', async () => {
    expect(esPedidoDeTendencias({ tipo: 'tendencias' })).toBe(true)
    expect(esPedidoDeTendencias({ objetivo: 'lo que está en tendencia en el rubro' })).toBe(true)
    expect(esPedidoDeTendencias({ objetivo: 'tendencias del rubro' })).toBe(true)
    expect(esPedidoDeTendencias({ tipo: 'bodega' })).toBe(true)
    expect(esPedidoDeTendencias({ objetivo: 'el menú con precios' })).toBe(false)
    expect(pideLaBodega({ tipo: 'bodega' })).toBe(true)
    expect(pideLaBodega({ objetivo: 'los virales del mundo' })).toBe(true)
    expect(pideLaBodega({ tipo: 'tendencias' })).toBe(false)
    const c = DIEZ_CLIENTES[0]
    const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
    const mk = (tabla: Fila[]): DepsDePedido => ({ db: crearBaseFalsa(tablasDe(c) as never).db, interruptores: { ...ON, resumen_vivo: false, resumen_pulido: false }, activo: true, ahora: AHORA, nuevoId: () => '11111111-2222-4333-8444-555555555555', esperar: async () => {}, tendencias: { listar: (id, o) => listarTendencias(consultaDe(tabla.map((x) => (x.client_id === CID ? { ...x, client_id: id } : x))) as never, { cliente: id, bodega: o.bodega }) } })
    const pedir = (tabla: Fila[], hueco: Fila) => rutaPedido(mk(tabla), { client_id: c.id, dry_run: true, ...WF, pedido_por: { oficina: 'oficina-creativa', agente: 'creative-director' }, para: 'crear una pieza', huecos: [hueco] } as never)
    type H = { estado: string; nada_usable?: boolean; tendencias?: Array<{ tendencia_id: string }>; tendencias_resumen?: { alcance: string; total: number } }
    const rr = await pedir(filas, { tipo: 'tendencias', objetivo: 'tendencias del rubro' }); if (!rr.body.huecos) throw new Error(JSON.stringify(rr.body).slice(0, 400))
    const a = rr.body.huecos as H[]
    expect(a[0]).toMatchObject({ estado: 'ya_esta', tendencias_resumen: { alcance: 'cliente', total: 4 } })
    expect(a[0].tendencias?.map((x) => x.tendencia_id)).toEqual(['g2', 'g1', 'p1', 'd1'])
    const b = (await pedir(filas, { tipo: 'bodega', objetivo: 'bodega viral del mundo' })).body.huecos as H[]
    expect(b[0]).toMatchObject({ estado: 'ya_esta', tendencias_resumen: { alcance: 'bodega', total: 2 } })
    expect(b[0].tendencias?.map((x) => x.tendencia_id)).toEqual(['m1', 'm2'])
    const vacio = (await pedir([], { tipo: 'tendencias', objetivo: 'tendencias' })).body.huecos as H[]
    expect(vacio[0]).toMatchObject({ estado: 'no_resuelto', nada_usable: true })
  })
})
