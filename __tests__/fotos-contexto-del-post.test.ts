/**
 * CADA FOTO SE GUARDA CON TODO SU CONTEXTO · pruebas a costo cero con los datos REALES de Náufrago · CC#1 · 2026-10-03
 * (encargo Lenovo «cada foto viaja con todo su contexto» puntos 1 y 3 · diagnóstico CC#2 `que-plato-muestra-cada-foto`).
 *
 * Qué prueba (cada prueba tiene que estar ROJA contra el estado de ANTES y VERDE después):
 *   ① el Servicio de Apify guarda por foto: texto del post · fecha · enlace del post · posición en el carrusel · medio REAL (imagen/video/reel) · huella · y NO sube la repetida (portada = hijo 1)
 *   ② las 16 filas viejas se completan desde `apify_raw` (sin raspar) · idempotente
 *   ③ qué producto muestra cada foto: del TEXTO del post, con su procedencia · sin lista fija de platos
 *   ④ la pasada de visión queda diseñada y APAGADA (sin red · sin gasto)
 * Agnóstico: la lógica no nombra clientes ni platos.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const FX = join(process.cwd(), '__tests__', 'fixtures', 'fotos-contexto')
const RASPADO = JSON.parse(readFileSync(join(FX, 'raspado-instagram-propio.json'), 'utf8'))
const FILAS16: Record<string, unknown>[] = JSON.parse(readFileSync(join(FX, 'client-social-images-16-filas.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let F: any = null
try { F = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js')) } catch { /* estado de ANTES: el módulo no existe */ }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const servicio: any = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'construir-contexto-fotos.mjs')).href).catch(() => null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const completar: any = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'completar-contexto-fotos.mjs')).href).catch(() => null)

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; refsAll?: Record<string, unknown[]>; helpers?: Record<string, unknown>; env?: Record<string, string> }
async function correr(codigo: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => (j && typeof j === 'object' && 'json' in (j as object) ? (j as object) : { json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => {
    if (ctx.refsAll && n in ctx.refsAll) { const l = ctx.refsAll[n] as { json: unknown }[]; return { first: () => l[0], all: () => l } }
    if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] }
  }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo).call({ helpers: ctx.helpers }, $input, $, ctx.env ?? { SUPABASE_SERVICE_ROLE_KEY: 'k' }, (items[0] as { json: unknown })?.json, { id: 'WF' }, { id: '1', resumeUrl: 'https://x' })
}
const bytesDe = (post_id: string) => readFileSync(join(FX, post_id + '.jpg'))
const perfil = { username: 'naufrago.ec', profilePicUrlHD: 'https://example.invalid/logo-hd.jpg', latestPosts: RASPADO.latestPosts }
const codigoServicio = (k: string) => (servicio ? servicio.codigoDeNodo(k) : '')

async function listaDeFotos() {
  const out = await correr(codigoServicio('lista'), {
    refs: { 'Validar el cuerpo contra el esquema': { apify_function: 'instagram_scraper', dry_run: false, client_id: CID } },
    refsAll: { 'Merge · apify data ready': [{ json: perfil }] },
    helpers: { httpRequest: async () => [{ config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }] },
  })
  return out.map((o: { json: Record<string, unknown> }) => o.json)
}

describe('① el Servicio de Apify guarda CADA foto con todo su contexto', () => {
  it('🔴 «Fotos · lista» entrega por foto: texto · fecha · enlace del post · posición · medio REAL (antes: sólo tipo y código)', async () => {
    const l = await listaDeFotos()
    expect(l).toHaveLength(15) // logo + 12 portadas + 2 hijas del carrusel
    const por = (id: string) => l.find((x: { post_id: string }) => x.post_id === id)
    const p = por('DPti3m8jQJt')
    expect(p).toMatchObject({ posicion: 'portada', medio: 'imagen', post_url: 'https://www.instagram.com/p/DPti3m8jQJt/' })
    expect(String(p.caption)).toMatch(/mejor encebollado de la zona/)
    expect(String(p.posted_at)).toMatch(/^2025-10-12/)
    expect(por('DPti3m8jQJt-c1')).toMatchObject({ posicion: 'hijo-1', medio: 'imagen' })
    expect(por('DPti3m8jQJt-c2')).toMatchObject({ posicion: 'hijo-2', medio: 'video' }) // el hijo 2 es un VIDEO: la foto es su cuadro
    expect(por('DYuzda8ROK5')).toMatchObject({ posicion: 'unica', medio: 'reel' }) // un reel NO es una imagen
    expect(por('DAvtICqvjC-')).toMatchObject({ posicion: 'unica', medio: 'imagen' })
    expect(por('logo-hd')).toMatchObject({ medio: 'logo' })
    // todo post trae su texto y su fecha (si el post los tiene) en TODAS sus fotos
    expect(l.filter((x: { post_id: string }) => x.post_id.startsWith('DPti3m8jQJt')).every((x: { caption: string; posted_at: string }) => /encebollado/.test(x.caption) && /^2025-10-12/.test(x.posted_at))).toBe(true)
  })

  it('🔴 «Fotos · revisar» NO sube la repetida: la portada de un carrusel ES su hijo 1 (misma huella) · se DECLARA, no se calla', async () => {
    const metas = [{ post_id: 'DPti3m8jQJt', posicion: 'portada' }, { post_id: 'DPti3m8jQJt-c1', posicion: 'hijo-1' }, { post_id: 'DPti3m8jQJt-c2', posicion: 'hijo-2' }]
      .map((m) => ({ client_id: CID, owner_role: 'propio', handle: 'naufrago.ec', tipo: 'post_sidecar', src: 'https://example.invalid/' + m.post_id + '.jpg', caption: 'texto', posted_at: '2025-10-12T00:00:00.000Z', post_url: 'https://www.instagram.com/p/DPti3m8jQJt/', medio: 'imagen', ...m }))
    const out = await correr(codigoServicio('revisar'), {
      input: metas.map(() => ({ json: {}, binary: { data: { mimeType: 'image/jpeg' } } })),
      refsAll: { 'Fotos · lista': metas.map((m) => ({ json: m })) },
      helpers: { getBinaryDataBuffer: async (i: number) => bytesDe(metas[i].post_id), httpRequest: async () => ({ statusCode: 200 }) },
    })
    const ids = out.map((o: { json: { post_id: string } }) => o.json.post_id)
    expect(ids).toEqual(['DPti3m8jQJt', 'DPti3m8jQJt-c2']) // el hijo 1 repetido NO se sube
    for (const o of out) expect(o.json.hash_archivo).toMatch(/^[0-9a-f]{64}$/)
    expect(out[0].json.hash_archivo).toBe(createHash('sha256').update(bytesDe('DPti3m8jQJt')).digest('hex')) // la huella pura = la de crypto
    expect(out[0].json._duplicadas).toEqual([expect.objectContaining({ post_id: 'DPti3m8jQJt-c1', igual_a: 'DPti3m8jQJt' })])
    expect(out[0].json.hash_archivo).not.toBe(out[1].json.hash_archivo) // y el hijo 2 (otra imagen) SÍ se queda
  })

  it('🔴 «Fotos · anotar» escribe en la tabla el contexto de cada foto (texto · fecha · enlace · posición · medio · huella) y cuenta la repetida', async () => {
    const metas = [{ post_id: 'DPti3m8jQJt', posicion: 'portada' }, { post_id: 'DPti3m8jQJt-c2', posicion: 'hijo-2', medio: 'video' }].map((m, i) => {
      const b = bytesDe(m.post_id)
      return { client_id: CID, owner_role: 'propio', handle: 'naufrago.ec', tipo: 'post_sidecar', caption: 'Cerrando el feriado… encebollado', posted_at: '2025-10-12T00:00:00.000Z', post_url: 'https://www.instagram.com/p/DPti3m8jQJt/', medio: 'imagen', ...m, path: 'p/' + m.post_id + '.jpg', bytes: b.length, magic: b.slice(0, 4).toString('hex'), hash_archivo: 'h' + i, _total: 3, _fallas: [], _duplicadas: [{ post_id: 'DPti3m8jQJt-c1', igual_a: 'DPti3m8jQJt', hash: 'h0' }] }
    })
    let escrito: Record<string, unknown>[] = []
    const out = await correr(codigoServicio('anotar'), {
      input: metas.map(() => ({ json: { statusCode: 200 } })),
      refsAll: { 'Fotos · revisar': metas.map((m) => ({ json: m })) },
      helpers: {
        httpRequest: async (o: { method?: string; url: string; body?: Record<string, unknown>[] }) => {
          if (o.method === 'POST') { escrito = o.body ?? []; return { statusCode: 201, body: '' } }
          const id = metas.find((m) => o.url.includes(m.path))!
          return { statusCode: 200, body: bytesDe(id.post_id) }
        },
      },
    })
    expect(escrito).toHaveLength(2)
    expect(escrito[0]).toMatchObject({ post_id: 'DPti3m8jQJt', estado: 'ok', posicion: 'portada', medio: 'imagen', post_url: 'https://www.instagram.com/p/DPti3m8jQJt/', hash_archivo: 'h0' })
    expect(String(escrito[0].caption)).toMatch(/encebollado/)
    expect(String(escrito[0].posted_at)).toMatch(/^2025-10-12/)
    expect(escrito[1]).toMatchObject({ post_id: 'DPti3m8jQJt-c2', medio: 'video', posicion: 'hijo-2' })
    expect(out[0].json).toMatchObject({ copia_fotos: 'ok', fotos: 2, duplicadas_no_subidas: 1 })
  })

  it('el constructor SÓLO cambia el código de 3 nodos del Servicio (no agrega nodos, no toca conexiones) y falla si falta la cadena de copia', () => {
    const flujo = { name: 'x', settings: {}, connections: { a: 1 }, nodes: [{ name: 'Fotos · lista', parameters: { jsCode: 'viejo', otro: 1 } }, { name: 'Fotos · revisar', parameters: { jsCode: 'viejo' } }, { name: 'Fotos · anotar', parameters: { jsCode: 'viejo' } }, { name: 'Otro nodo', parameters: { jsCode: 'intacto' } }] }
    const nuevo = servicio.aplicarContexto(flujo)
    expect(nuevo.nodes).toHaveLength(4)
    expect(nuevo.connections).toEqual(flujo.connections)
    expect(nuevo.nodes[3]).toEqual(flujo.nodes[3])
    expect(nuevo.nodes[0].parameters.otro).toBe(1)
    expect(nuevo.nodes[0].parameters.jsCode).toMatch(/contextoDePost/)
    expect(flujo.nodes[0].parameters.jsCode).toBe('viejo') // no muta la entrada
    expect(() => servicio.aplicarContexto({ ...flujo, nodes: [flujo.nodes[3]] })).toThrow(/no está instalada/)
  })
})

describe('② las 16 filas viejas se completan desde `apify_raw` · sin raspar · idempotente', () => {
  const huellas = () => {
    const h: Record<string, string> = {}
    for (const f of FILAS16) {
      const id = String(f.id), p = String(f.post_id)
      h[id] = ['DPti3m8jQJt', 'DPti3m8jQJt-c1', 'DPti3m8jQJt-c2'].includes(p) ? createHash('sha256').update(bytesDe(p)).digest('hex') : 'huella-' + id
    }
    return h
  }
  const plan = () => completar.planificar({ filas: FILAS16, raspados: [{ id: 'r1', created_at: RASPADO.created_at, respuesta: [perfil] }], huellas: huellas() })
  const parcheDe = (p: { cambios: { post_id: string; parche: Record<string, unknown> }[] }, post: string) => p.cambios.find((c) => c.post_id === post)!.parche

  it('🔴 cada fila de contenido recibe texto · fecha · enlace · posición · medio · huella · sin llamar a nadie', () => {
    const p = plan()
    for (const post of ['DYuzda8ROK5', 'DWfKKLpDF4U', 'DPti3m8jQJt', 'DPti3m8jQJt-c2', 'DAvtICqvjC-', 'C_LmHq4OHXU']) {
      expect(parcheDe(p, post), post).toMatchObject({ caption: expect.any(String), post_url: expect.stringMatching(/^https:\/\/www\.instagram\.com\//), posicion: expect.any(String), medio: expect.any(String), hash_archivo: expect.stringMatching(/^[0-9a-f]{64}$|^huella-/) })
    }
    expect(parcheDe(p, 'DYuzda8ROK5')).toMatchObject({ medio: 'reel', posicion: 'unica' })
    expect(parcheDe(p, 'DPti3m8jQJt-c2')).toMatchObject({ medio: 'video', posicion: 'hijo-2' })
    expect(p.sin_raspado).toEqual([]) // las 14 de contenido se encontraron en el raspado
  })
  it('🔴 la portada y el hijo 1 del carrusel son la MISMA imagen: la hija queda marcada `duplicado_de` y NO se borra ninguna fila', () => {
    const p = plan()
    const portada = FILAS16.find((f) => f.post_id === 'DPti3m8jQJt')!
    expect(p.duplicadas).toEqual([expect.objectContaining({ post_id: 'DPti3m8jQJt-c1', de: portada.id })])
    expect(parcheDe(p, 'DPti3m8jQJt-c1').duplicado_de).toBe(portada.id)
    expect(parcheDe(p, 'DPti3m8jQJt').duplicado_de).toBeUndefined()
    expect((p.cambios as { parche: Record<string, unknown> }[]).every((c) => !('estado' in c.parche) && !('url' in c.parche))).toBe(true) // sólo agrega contexto
  })
  it('🔴 el plan NO guarda un producto adivinado: depende del brief (la misma foto es «el producto» para uno y «otro plato» para otro) · se decide al USAR la foto, con su procedencia', () => {
    const p = plan()
    for (const c of p.cambios) expect(Object.keys(c.parche).filter((k) => k.startsWith('producto')), c.post_id).toEqual([])
  })
  it('idempotente: aplicar el plan y volver a planificar da 0 cambios', () => {
    const p1 = plan()
    const aplicadas = FILAS16.map((f) => ({ ...f, ...(p1.cambios.find((x: { id: string }) => x.id === f.id)?.parche ?? {}) }))
    const p2 = completar.planificar({ filas: aplicadas, raspados: [{ id: 'r1', created_at: RASPADO.created_at, respuesta: [perfil] }], huellas: huellas() })
    expect(p2.cambios).toEqual([])
  })
  it('los dos logos sólo reciben medio «logo» (no tienen publicación ni texto)', () => {
    const p = plan()
    for (const post of ['logo', 'logo-hd']) {
      const k = p.cambios.find((c: { post_id: string }) => c.post_id === post)
      expect(k.parche).toMatchObject({ medio: 'logo', posicion: 'unica' })
      expect(k.parche.caption).toBeUndefined()
    }
  })
})

describe('③ qué producto muestra cada foto · del texto, contra el brief, con procedencia · AGNÓSTICO', () => {
  const BRF6 = JSON.parse(readFileSync(join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor', 'fixtures', 'brf-0006.json'), 'utf8'))
  const excluirNaufrago = () => F.excluirDe({ nombre: 'Náufrago', handles: ['naufrago.ec'], ciudades: ['Olón', 'Guayaquil'], market: 'Guayaquil · Guayas', country: 'Ecuador' })
  it('🔴 con el brief REAL (el ceviche): su producto es lo que protagonista y vocabulario dicen a la vez; las alternativas son lo que el propio brief niega', () => {
    const ex = excluirNaufrago()
    const prod = F.productoDelBrief(BRF6, ex)
    expect(prod).toEqual({ nombre: 'ceviche', raices: ['cevich'] })
    expect(F.alternativasDelBrief(BRF6, ex, prod).map((e: { nombre: string }) => e.nombre)).toEqual(['encebollado', 'combo']) // «historia» y «comunidad» son abstractos: no cuentan
  })
  it('🔴 las 14 fotos REALES de contenido frente al brief del ceviche: SOLO la del ceviche es «ES el producto»', () => {
    const ex = excluirNaufrago()
    const prod = F.productoDelBrief(BRF6, ex)
    const filas = FILAS16.map((f) => ({ ...f, ...(completar.planificar({ filas: FILAS16, raspados: [{ id: 'r1', created_at: RASPADO.created_at, respuesta: [perfil] }], huellas: {} }).cambios.find((c: { id: unknown }) => c.id === f.id)?.parche ?? {}) }))
    const c = F.clasificarFotos(filas, { producto: prod, catalogo: F.catalogoDelBrief(BRF6, prod, { config: {} }, ex), excluir: ex })
    const rol = (post: string) => c.fotos.find((f: { post_id: string }) => f.post_id === post).rol
    expect(rol('DAvtICqvjC-')).toBe('producto_del_brief')
    for (const post of ['DPti3m8jQJt', 'DSHyjPzEa3C', 'DBCCBtGx0wr', 'C_LmHq4OHXU', 'DFygehmi4HJ', 'DBHKJZkR4zK']) expect(rol(post), post).toBe('otro_producto')
    expect(rol('DWfKKLpDF4U')).toBe('otro_producto') // «el verdadero combo…»: el brief niega «el combo»
    expect(rol('DAjARyZxg8N')).toBe('varios_productos') // el texto nombra ceviche Y encebollado
    for (const post of ['DYuzda8ROK5', 'DVjed5GiRrl', 'DT1H9PDjH78']) expect(rol(post), post).toBe('no_identificado')
    expect(c.de_referencia).toHaveLength(1)
    expect(c.sin_foto_del_producto).toBe(false)
  })
  it('la misma foto cambia de rol con OTRO brief: el producto no es de la foto, es de la pareja foto ↔ brief', () => {
    const brief = { ...BRF6, protagonista: 'El encebollado de la casa. UNO. No el ceviche.', vocabulario_obligatorio: ['encebollado'] }
    const ex = excluirNaufrago()
    const prod = F.productoDelBrief(brief, ex)
    const c = F.clasificarFotos([{ id: 'a', url: 'u', post_id: 'A', caption: 'Rukutu: el toque perfecto para acompañar un delicioso ceviche' }, { id: 'b', url: 'u2', post_id: 'B', caption: 'El mejor encebollado de la zona' }], { producto: prod, catalogo: F.catalogoDelBrief(brief, prod, { config: {} }, ex), excluir: ex })
    expect(c.fotos.map((f: { post_id: string; rol: string }) => [f.post_id, f.rol])).toEqual([['B', 'producto_del_brief'], ['A', 'otro_producto']])
  })
  it('el catálogo que el DUEÑO declara en la ficha (config.productos) completa lo que el brief no niega', () => {
    const brief = { protagonista: 'La pizza de la casa', vocabulario_obligatorio: ['pizza'] }
    const prod = F.productoDelBrief(brief, [])
    const cat = F.catalogoDelBrief(brief, prod, { config: { productos: ['pizza', 'helado de lúcuma', 'lasaña'] } }, [])
    expect(cat.map((e: { nombre: string }) => e.nombre)).toEqual(['helado lucuma', 'lasana']) // «pizza» ya es el producto del brief
    const c = F.clasificarFotos([{ id: 'a', url: 'u', post_id: 'A', caption: 'Nuestra lasaña recién hecha' }], { producto: prod, catalogo: cat, excluir: [] })
    expect(c.fotos[0].rol).toBe('otro_producto')
  })
  it('un brief cuyo protagonista y vocabulario no comparten un término NO nombra un producto (null) · sin vocabulario: la primera palabra significativa', () => {
    expect(F.productoDelBrief({ protagonista: 'La hamburguesa doble', vocabulario_obligatorio: ['delivery'] }, [])).toBeNull()
    expect(F.productoDelBrief({ protagonista: 'La hamburguesa doble' }, [])).toEqual({ nombre: 'hamburguesa', raices: ['hambur'] })
    expect(F.productoDelBrief({ protagonista: 'El horario y la ciudad' }, [])).toBeNull()
  })
  it('el cuerpo del texto manda sobre la cola de #etiquetas · las etiquetas sólo hablan si el cuerpo no nombra nada', () => {
    const cat = [{ nombre: 'pizza', raices: ['pizza'] }, { nombre: 'focaccia', raices: ['focacc'] }]
    expect(F.productoDeTexto('La focaccia del día #pizza #foodie', cat).producto).toEqual(['focaccia'])
    expect(F.productoDeTexto('Mira lo que hicimos hoy #pizza', cat)).toMatchObject({ producto: ['pizza'], via: 'etiqueta' })
  })

  const sinLista = () => F.catalogoDeProtagonistas(['La pizza de masa madre', 'El helado de lúcuma. UNO.'], [])
  it('otro cliente, otros productos: la misma regla sin una sola palabra de Náufrago', () => {
    const c = sinLista()
    expect(F.productoDeTexto('Nuestra nueva PIZZA recién salida del horno 🍕', c)).toMatchObject({ fuente: 'caption', producto: [expect.stringMatching(/pizza/i)] })
    expect(F.productoDeTexto('Postre del día: helados de lúcuma', c).producto[0]).toMatch(/helado/i)
    expect(F.productoDeTexto('Gracias por venir este domingo', c)).toEqual({ producto: [], fuente: 'desconocido', evidencia: [] })
  })
  it('la negación del protagonista NO lo vuelve producto: «No el encebollado, no el combo» ⇒ el producto es otro', () => {
    const e = F.entradaDeProtagonista('El ceviche con su origen en Olón. UNO. No el encebollado, no el combo.', F.excluirDe({ ciudades: ['Olón'] }))
    expect(e.raices).toEqual(['cevich'])
  })
  it('la marca y las ciudades NO pueden ser un producto (se excluyen) y los nombres de usuario tampoco', () => {
    const ex = F.excluirDe({ nombre: 'Náufrago', handles: ['naufrago.ec'], ciudades: ['Olón'], market: 'Guayaquil · Guayas', country: 'Ecuador' })
    expect(F.entradaDeProtagonista('Náufrago en Olón', ex)).toBeNull() // no nombra ningún producto
  })
  it('el texto de otro idioma y las etiquetas (#) cuentan; las @menciones no', () => {
    const c = sinLista()
    expect(F.productoDeTexto('#pizza #foodie', c).producto).toHaveLength(1)
    expect(F.productoDeTexto('foto con @pizzeria_amiga', c).producto).toHaveLength(0)
  })
  it('la combinación de fuentes: el dueño GANA · texto y visión de acuerdo ⇒ caption · chocan ⇒ conflicto (NO se usa) · sólo uno habla ⇒ ése', () => {
    const a = { producto: ['ceviche'] }, b = { producto: ['encebollado'] }
    expect(F.combinarFuentes(a, b, b)).toMatchObject({ fuente: 'dueno', producto: ['encebollado'] })
    expect(F.combinarFuentes(a, a, null).fuente).toBe('caption')
    expect(F.combinarFuentes(a, b, null)).toEqual({ producto: [], fuente: 'conflicto' })
    expect(F.combinarFuentes(null, b, null).fuente).toBe('vision')
    expect(F.combinarFuentes(a, null, null).fuente).toBe('caption')
    expect(F.combinarFuentes(null, null, null).fuente).toBe('desconocido')
  })
})

describe('④ la pasada de VISIÓN: diseñada y APAGADA (sin red · sin gasto)', () => {
  it('🔴 sin autorización NO prepara ningún pedido · y ni con «go_emilio» se enciende sola (el interruptor está en el código y requiere cambio revisado)', () => {
    const filas = [{ id: 'a', url: 'https://x/a.jpg', producto: [], producto_fuente: 'desconocido' }, { id: 'b', url: 'https://x/b.jpg', producto: ['pizza'], producto_fuente: 'caption' }, { id: 'c', url: 'https://x/c.jpg', duplicado_de: 'a' }]
    const sin = F.planDeVision(filas, [], null)
    expect(sin).toMatchObject({ estado: 'apagada', pedidos: [], pendientes: 1 })
    expect(F.planDeVision(filas, [], { go_emilio: true }).pedidos).toEqual([])
    expect(F.planDeVision(filas, [], { go_emilio: true }).estado).toBe('apagada')
  })
  it('el módulo no contiene red: ni fetch, ni httpRequest, ni require, ni claves de proveedor', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'), 'utf8')
    expect(src).not.toMatch(/\bfetch\s*\(|httpRequest|\brequire\s*\(|api[_-]?key|anthropic|openai|XMLHttpRequest/i)
  })
  it('AGNÓSTICO: ni la lógica de fotos ni la del trato ni los nodos nombran a un cliente, un plato o una ciudad', () => {
    const arch = [
      ['src', 'lib', 'fotos', 'fotos-contexto-logica.js'], ['src', 'lib', 'trato', 'trato-logica.js'],
      ['scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'fotos-lista.js'], ['scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'fotos-revisar.js'], ['scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'fotos-anotar.js'],
      ['scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'completar-contexto-fotos.mjs'], ['scripts', 'worker-staging', 'pieza-el-productor', 'n3-guarda-fotos.js'], ['scripts', 'worker-staging', 'pieza-el-productor', 'n5-armar-cuerpo.js'],
    ]
    for (const a of arch) expect(readFileSync(join(process.cwd(), ...a), 'utf8'), a.join('/')).not.toMatch(/Náufrago|naufrago|Olón|Guayaquil|encebollado|ceviche/i)
  })
})

describe('la migración (SIN aplicar) es aditiva y recarga el catálogo', () => {
  const sql = () => readFileSync(join(process.cwd(), 'supabase', 'migrations', '202610030100_client_social_images_contexto.sql'), 'utf8')
  it('sólo AGREGA columnas con valor por defecto · no borra ni cambia nada existente', () => {
    const s = sql()
    for (const c of ['caption', 'posted_at', 'post_url', 'posicion', 'medio', 'hash_archivo', 'duplicado_de', 'producto', 'producto_fuente', 'producto_evidencia', 'contexto_completado_en']) expect(s, c).toMatch(new RegExp('ADD COLUMN IF NOT EXISTS ' + c + '\\b'))
    expect(s.replace(/--[^\n]*/g, '')).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|ALTER COLUMN|RENAME/i)
    expect(s).toMatch(/producto_fuente\s+text\s+NOT NULL DEFAULT 'desconocido'/)
  })
  it('valida los valores (medio · posición · procedencia del producto) y deja la «fuente» con «dueño» ganando', () => {
    const s = sql()
    expect(s).toMatch(/medio IN \('imagen','video','reel','logo'\)/)
    expect(s).toMatch(/posicion IN \('unica','portada'\)/)
    expect(s).toMatch(/producto_fuente IN \('caption','vision','dueno','conflicto','desconocido'\)/)
  })
  it('🔴 termina con NOTIFY pgrst (sin él PostgREST contesta 404 a las columnas nuevas · medido 03-oct)', () => {
    expect(sql().trim()).toMatch(/NOTIFY pgrst, 'reload schema';$/)
  })
})
