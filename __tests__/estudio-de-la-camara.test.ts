/**
 * EL ESTUDIO DE LA CÁMARA · pruebas en seco (US$ 0): proveedores simulados y una base falsa que RECHAZA columnas que la migración no crea.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archivoDe3D, armarPedido, cotizarSinRed, type Pedido } from '@/lib/estudio/catalogo'
import { esDeLaCola } from '@/lib/estudio/fal'
import { avanzar, crear, listar, cotizar, type Deps } from '@/lib/estudio/servicio'

const CLIENTE = 'a0000000-0000-4000-8000-0000000000e1'
const OTRO = 'b0000000-0000-4000-8000-0000000000e2'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])
const GLB = Buffer.from('glTF____modelo-de-prueba')

// columnas reales: las que crea la migración (y las de `costs` en producción, leídas 05-nov)
const migracion = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '202611052100_estudio_piezas.sql'), 'utf8')
const cuerpoTabla = migracion.slice(migracion.indexOf('create table'), migracion.indexOf(');', migracion.indexOf('create table')))
const COLUMNAS_PIEZAS = new Set([...cuerpoTabla.matchAll(/^\s{2}([a-z_]+)\s/gm)].map((m) => m[1]))
const COLUMNAS: Record<string, Set<string>> = {
  estudio_piezas: COLUMNAS_PIEZAS,
  costs: new Set(['id', 'category', 'service', 'amount_usd', 'campaign_id', 'description', 'date', 'created_at', 'amount_usd_exact']),
  clients: new Set(['id']),
}

type Fila = Record<string, unknown>
function baseFalsa(clientes = [CLIENTE, OTRO]) {
  const t: Record<string, Fila[]> = { estudio_piezas: [], costs: [], clients: clientes.map((id) => ({ id })) }
  const subidas: Array<{ ruta: string; bytes: number; tipo: string }> = []
  let n = 0
  const validar = (tabla: string, cols: string[]) => { for (const c of cols) if (!COLUMNAS[tabla]?.has(c)) throw new Error(`columna inexistente ${tabla}.${c}`) }
  const colsDe = (tabla: string, s: string) => { const cs = s.split(',').map((x) => x.trim()).filter(Boolean); validar(tabla, cs); return cs }
  const proy = (f: Fila, cs: string[]) => Object.fromEntries(cs.map((c) => [c, f[c] ?? null]))
  const db = {
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = []
      let modo: 'select' | 'update' | 'insert' = 'select'
      let cols: string[] = []
      let cambios: Fila = {}
      let nuevas: Fila[] = []
      let lim = 1e9
      let error: { message: string } | null = null
      const q = {
        select(s: string) { cols = colsDe(tabla, s); return q },
        eq(c: string, v: unknown) { validar(tabla, [c]); filtros.push([c, v]); return q },
        order(c: string) { validar(tabla, [c]); return q },
        limit(k: number) { lim = k; return q },
        insert(row: Fila) {
          modo = 'insert'; validar(tabla, Object.keys(row))
          if (tabla === 'estudio_piezas' && t.estudio_piezas.some((f) => f.clave === row.clave)) error = { message: 'duplicate key value violates unique constraint "estudio_piezas_clave"' }
          else { nuevas = [{ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, creado_en: new Date().toISOString(), aviso: null, error: null, ...row }]; t[tabla].push(...nuevas) }
          return q
        },
        update(row: Fila) { modo = 'update'; validar(tabla, Object.keys(row)); cambios = row; return q },
        then(ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) {
          const coincide = (f: Fila) => filtros.every(([c, v]) => f[c] === v)
          let data: Fila[] = []
          if (error) return Promise.resolve({ data: null, error }).then(ok, ko)
          if (modo === 'insert') data = nuevas
          else if (modo === 'update') { data = t[tabla].filter(coincide); data.forEach((f) => Object.assign(f, cambios)) }
          else data = t[tabla].filter(coincide).slice(0, lim)
          return Promise.resolve({ data: cols.length ? data.map((f) => proy(f, cols)) : data, error: null }).then(ok, ko)
        },
      }
      return q
    },
    storage: {
      from(b: string) {
        return {
          upload: async (ruta: string, bytes: Buffer, o: { contentType: string }) => { subidas.push({ ruta, bytes: bytes.length, tipo: o.contentType }); return { error: null } },
          getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://almacen.test/${b}/${ruta}` } }),
        }
      },
    },
  }
  return { db, t, subidas }
}

interface Llamada { url: string; init?: RequestInit }
function proveedores(op: { falEstado?: string[]; falError?: boolean; hfEstado?: string[] } = {}) {
  const llamadas: Llamada[] = []
  const falEstados = [...(op.falEstado ?? ['IN_PROGRESS', 'COMPLETED'])]
  const hfEstados = [...(op.hfEstado ?? ['in_progress', 'completed'])]
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    llamadas.push({ url, init })
    if (url.startsWith('https://api.openai.com/v1/images/')) return json({ data: [{ b64_json: PNG.toString('base64') }], usage: { input_tokens: 20, output_tokens: 439, input_tokens_details: { text_tokens: 20, image_tokens: 0 } } })
    if (url === 'https://queue.fal.run/tripo3d/h3.1/image-to-3d') return json({ request_id: 'fal-1', status_url: 'https://queue.fal.run/tripo3d/h3.1/requests/fal-1/status', response_url: 'https://queue.fal.run/tripo3d/h3.1/requests/fal-1' })
    if (url.endsWith('/requests/fal-1/status')) {
      const s = falEstados.shift() ?? 'COMPLETED'
      return json(s === 'COMPLETED' && op.falError ? { status: s, error: 'mesh failed', error_type: 'runtime' } : { status: s })
    }
    if (url === 'https://queue.fal.run/tripo3d/h3.1/requests/fal-1') return json({ model_mesh: { url: 'https://v3.fal.media/files/x/modelo.glb', content_type: 'model/gltf-binary', file_name: 'modelo.glb' }, model_urls: { glb: { url: 'https://v3.fal.media/files/x/modelo.glb', file_name: 'modelo.glb' } } })
    if (url === 'https://v3.fal.media/files/x/modelo.glb') return new Response(GLB, { status: 200 })
    if (url.startsWith('https://api.higgsfield.ai/estimate/')) return json({ type: 'description', pricing_description: 'Each 1,000 video tokens costs $0.01 at 480p or 720p and $0.02 at 1080p.' })
    if (url.startsWith('https://api.higgsfield.ai/bytedance/')) return json({ request_id: 'hf-1', status: 'queued', status_url: 'https://api.higgsfield.ai/requests/hf-1/status' })
    if (url === 'https://api.higgsfield.ai/requests/hf-1/status') { const s = hfEstados.shift() ?? 'completed'; return json({ status: s, ...(s === 'completed' ? { video: { url: 'https://cdn.higgsfield.ai/v/hf-1.mp4' } } : {}) }) }
    if (url === 'https://cdn.higgsfield.ai/v/hf-1.mp4') return new Response(Buffer.from('mp4'), { status: 200 })
    if (url.startsWith('https://almacen.test/')) return new Response(PNG, { status: 200 })
    throw new Error(`llamada no esperada: ${url}`)
  }) as typeof fetch
  return { f, llamadas }
}

function deps(base = baseFalsa(), p = proveedores()): Deps & { base: typeof base; p: typeof p } {
  return { db: base.db as never, fetch: p.f, llaves: { openai: 'sk-prueba', higgsfield: 'id:secreto', fal: 'fal-prueba' }, bucket: 'oficina-creativos', modeloDeImagen: 'gpt-image-2.5-flare', ahora: () => Date.parse('2026-11-05T20:00:00Z'), base, p }
}

const pedido = (e: Record<string, unknown>): Pedido => {
  const a = armarPedido({ client_id: CLIENTE, clave: 'clic-0000001', ...e }, 'gpt-image-2.5-flare')
  if (!a.ok) throw new Error(a.errores.join('; '))
  return a.pedido
}

describe('catálogo y pedido', () => {
  it('sin cliente o sin clave no hay pedido', () => {
    const a = armarPedido({ tipo: 'imagen', prompt: 'una ola' }, 'm')
    expect(a.ok).toBe(false)
    if (!a.ok) { expect(a.errores.join(' ')).toMatch(/client_id/); expect(a.errores.join(' ')).toMatch(/clave/) }
  })
  it('3D con foto no exige texto; imagen sí', () => {
    expect(armarPedido({ client_id: CLIENTE, clave: 'clic-0000001', tipo: '3d', foto_pieza_id: CLIENTE }, 'm').ok).toBe(true)
    expect(armarPedido({ client_id: CLIENTE, clave: 'clic-0000001', tipo: 'imagen' }, 'm').ok).toBe(false)
  })
  it('rechaza modelos, formatos y segundos fuera del catálogo', () => {
    expect(armarPedido({ client_id: CLIENTE, clave: 'clic-0000001', tipo: '3d', prompt: 'taza', modelo: 'otro' }, 'm').ok).toBe(false)
    expect(armarPedido({ client_id: CLIENTE, clave: 'clic-0000001', tipo: 'imagen', prompt: 'taza', formato: '4:5' }, 'm').ok).toBe(false)
    expect(armarPedido({ client_id: CLIENTE, clave: 'clic-0000001', tipo: 'video', prompt: 'ola', segundos: 30 }, 'm').ok).toBe(false)
  })
  it('cotiza imagen y 3D con la lista publicada', () => {
    expect(cotizarSinRed(pedido({ tipo: 'imagen', prompt: 'una ola' }))!.total_usd).toBe(0.0138)
    expect(cotizarSinRed(pedido({ tipo: 'imagen', prompt: 'una ola', formato: '9:16' }))!.total_usd).toBe(0.0207)
    expect(cotizarSinRed(pedido({ tipo: '3d', prompt: 'una taza' }))!.total_usd).toBe(0.3138)
    expect(cotizarSinRed(pedido({ tipo: '3d', calidad: 'alta', foto_pieza_id: CLIENTE }))!.total_usd).toBe(0.4)
  })
  it('encuentra el archivo 3D con el nombre de cada modelo, prefiriendo GLB', () => {
    expect(archivoDe3D({ model_mesh: { url: 'https://x/a.fbx' }, model_urls: { glb: { url: 'https://x/a.glb' } } })!.url).toBe('https://x/a.glb')
    expect(archivoDe3D({ model_glb: { url: 'https://x/b.obj', content_type: 'model/obj' } })!.tipo).toBe('model/obj')
    expect(archivoDe3D({})).toBeNull()
  })
  it('la llave solo viaja a la cola de fal', () => {
    expect(esDeLaCola('https://queue.fal.run/x/requests/1')).toBe(true)
    expect(esDeLaCola('https://queue.fal.run.ataque.com/x')).toBe(false)
    expect(esDeLaCola('https://ataque.com/?https://queue.fal.run/')).toBe(false)
  })
})

describe('imagen', () => {
  it('crea, guarda en la carpeta del cliente y anota el costo real una vez', async () => {
    const d = deps()
    const r = await crear(d, pedido({ tipo: 'imagen', prompt: 'ceviche al atardecer' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.pieza.estado).toBe('lista')
    expect(r.valor.pieza.archivo_url).toMatch(new RegExp(`^https://almacen.test/oficina-creativos/estudio/${CLIENTE}/`))
    expect(d.base.t.costs).toHaveLength(1)
    const c = d.base.t.costs[0]
    expect(c.service).toBe('estudio:openai')
    expect(c.category).toBe('api_call')
    expect(c.amount_usd_exact).toBe(0.01327) // 20 × 5 + 439 × 30 por millón
    expect(JSON.parse(String(c.description))).toMatchObject({ pieza_id: r.valor.pieza.id, client_id: CLIENTE })
    expect(Number(r.valor.pieza.costo_usd)).toBe(0.01327)
    // el doble clic: misma clave, misma pieza, sin otra llamada ni otro cobro
    const antes = d.p.llamadas.length
    const r2 = await crear(d, pedido({ tipo: 'imagen', prompt: 'ceviche al atardecer' }))
    expect(r2.ok && r2.valor.ya_existia).toBe(true)
    expect(d.p.llamadas.length).toBe(antes)
    expect(d.base.t.costs).toHaveLength(1)
  })
  it('con foto subida usa la edición de OpenAI y guarda la foto de partida', async () => {
    const d = deps()
    const r = await crear(d, pedido({ tipo: 'imagen', prompt: 'misma escena de noche', foto_b64: PNG.toString('base64') }))
    expect(r.ok && r.valor.pieza.estado).toBe('lista')
    expect(d.p.llamadas.some((l) => l.url === 'https://api.openai.com/v1/images/edits')).toBe(true)
    expect(d.base.subidas.some((s) => s.ruta.startsWith(`estudio/${CLIENTE}/partidas/`))).toBe(true)
  })
  it('una foto que no es imagen se rechaza sin gastar', async () => {
    const d = deps()
    const r = await crear(d, pedido({ tipo: 'imagen', prompt: 'x y z', foto_b64: Buffer.from('hola, no soy una imagen').toString('base64') }))
    expect(r.ok).toBe(false)
    expect(d.p.llamadas).toHaveLength(0)
  })
  it('sin cliente que exista no se crea ni se gasta', async () => {
    const d = deps(baseFalsa([]))
    const r = await crear(d, pedido({ tipo: 'imagen', prompt: 'una ola' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
    expect(d.p.llamadas).toHaveLength(0)
  })
  it('la imagen de partida de otro cliente no se usa', async () => {
    const d = deps()
    const ajena = await crear(d, { ...pedido({ tipo: 'imagen', prompt: 'ajena' }), client_id: OTRO, clave: 'clic-ajena-01' })
    expect(ajena.ok).toBe(true)
    if (!ajena.ok) return
    const r = await crear(d, pedido({ tipo: '3d', foto_pieza_id: ajena.valor.pieza.id, clave: 'clic-0000002' }))
    expect(r.ok).toBe(false)
    expect(d.p.llamadas.filter((l) => l.url.includes('fal.run'))).toHaveLength(0)
  })
})

describe('3D', () => {
  it('sin foto: imagen primero, conversión después; al terminar guarda el GLB y anota fal una sola vez', async () => {
    const d = deps()
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'termo naranja' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = r.valor.pieza
    expect(p.estado).toBe('creando')
    expect(p.paso).toBe('3d')
    const img = d.p.llamadas.find((l) => l.url.includes('/images/generations'))!
    expect(JSON.parse(String(img.init!.body)).prompt).toMatch(/Un solo objeto/)
    const envio = d.p.llamadas.find((l) => l.url === 'https://queue.fal.run/tripo3d/h3.1/image-to-3d')!
    expect((envio.init!.headers as Record<string, string>)['X-Fal-No-Retry']).toBe('1')
    expect(JSON.parse(String(envio.init!.body))).toMatchObject({ image_url: p.foto_partida_url, texture_quality: 'standard' })
    expect(d.base.t.costs.map((c) => c.service)).toEqual(['estudio:openai'])
    // la pantalla pregunta: primero sigue en curso
    const a1 = await avanzar(d, p.id)
    expect(a1.ok && a1.valor.estado).toBe('creando')
    const a2 = await avanzar(d, p.id)
    expect(a2.ok).toBe(true)
    if (!a2.ok) return
    expect(a2.valor.estado).toBe('lista')
    expect(a2.valor.archivo_tipo).toBe('glb')
    expect(a2.valor.archivo_url).toBe(`https://almacen.test/oficina-creativos/estudio/${CLIENTE}/${p.id}.glb`)
    expect(d.base.subidas.find((s) => s.ruta.endsWith('.glb'))!.tipo).toBe('model/gltf-binary')
    expect(Number(a2.valor.costo_usd)).toBeCloseTo(0.01327 + 0.3, 6)
    // la miniatura no queda en una dirección de fal que vence
    expect(a2.valor.miniatura_url).toBe(p.foto_partida_url)
    expect(d.base.t.costs.map((c) => c.service)).toEqual(['estudio:openai', 'estudio:fal'])
    // otra pregunta después de cerrar: no anota de nuevo
    await avanzar(d, p.id)
    expect(d.base.t.costs).toHaveLength(2)
  })
  it('si fal falla queda fallida, con lo gastado en la imagen y sin cobro de fal', async () => {
    const d = deps(baseFalsa(), proveedores({ falEstado: ['COMPLETED'], falError: true }))
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'termo naranja' }))
    if (!r.ok) throw new Error('no creó')
    const a = await avanzar(d, r.valor.pieza.id)
    expect(a.ok && a.valor.estado).toBe('fallida')
    expect(a.ok && Number(a.valor.costo_usd)).toBe(0.01327)
    expect(d.base.t.costs.map((c) => c.service)).toEqual(['estudio:openai'])
  })
  it('una dirección de estado que no es de fal no recibe la llave', async () => {
    const d = deps()
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'termo naranja' }))
    if (!r.ok) throw new Error('no creó')
    d.base.t.estudio_piezas[0].proveedor_status_url = 'https://ataque.com/robar'
    await avanzar(d, r.valor.pieza.id)
    expect(d.p.llamadas.some((l) => l.url.startsWith('https://ataque.com'))).toBe(false)
  })
})

describe('video', () => {
  it('se cotiza con la estimación del proveedor, se encarga con clave idempotente y al terminar se copia', async () => {
    const d = deps()
    const p = pedido({ tipo: 'video', prompt: 'ola en la orilla', segundos: 5, resolucion: '720p', formato: '9:16' })
    const c = await cotizar(d, p)
    expect(c.ok).toBe(true)
    // 720×1280×5×24/1024 = 108.000 tokens × 0,01 por mil = 1,08 (menos el descuento vigente del proveedor)
    if (c.ok) expect(c.valor.total_usd).toBeCloseTo(0.756, 3)
    const r = await crear(d, p)
    if (!r.ok) throw new Error('no creó')
    const env = d.p.llamadas.find((l) => l.url === 'https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video')!
    expect((env.init!.headers as Record<string, string>)['Idempotency-Key']).toBe('estudio-clic-0000001')
    expect((await avanzar(d, r.valor.pieza.id)).ok).toBe(true)
    const fin = await avanzar(d, r.valor.pieza.id)
    expect(fin.ok && fin.valor.estado).toBe('lista')
    expect(fin.ok && fin.valor.archivo_url).toMatch(/\.mp4$/)
    expect(d.base.t.costs.map((x) => x.service)).toEqual(['estudio:higgsfield'])
  })
})

describe('galería', () => {
  it('lista solo las piezas del cliente', async () => {
    const d = deps()
    await crear(d, pedido({ tipo: 'imagen', prompt: 'una' }))
    await crear(d, { ...pedido({ tipo: 'imagen', prompt: 'otra' }), client_id: OTRO, clave: 'clic-otro-001' })
    const l = await listar(d, CLIENTE, null)
    expect(l.ok && l.valor.map((x) => x.client_id)).toEqual([CLIENTE])
  })
})
