/**
 * EL ESTUDIO DE LA CÁMARA · pruebas en seco (US$ 0): proveedores simulados y una base falsa que RECHAZA columnas que la migración no crea.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archivoDe3D, armarAnimacion, AVISO_SIN_CAUSA, demasiadoDetalle, motivoDeAnimacion, noEsHumanoide, textoDelProveedor, armarPedido, cotizarAnimacion, cotizarSinRed, MOVIMIENTOS_COMUNES, type Pedido } from '@/lib/estudio/catalogo'
import { BIBLIOTECA_DE_MOVIMIENTOS } from '@/lib/estudio/movimientos'
import { esDeLaCola } from '@/lib/estudio/fal'
import { avanzar, cotizarLaAnimacion, crear, crearAnimacion, listar, cotizar, movimientoExiste, type Deps } from '@/lib/estudio/servicio'

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
function baseFalsa(clientes = [CLIENTE, OTRO], op: { subirFalla?: boolean } = {}) {
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
          upload: async (ruta: string, bytes: Buffer, o: { contentType: string }) => { if (op.subirFalla) return { error: { message: 'almacén lleno' } }; subidas.push({ ruta, bytes: bytes.length, tipo: o.contentType }); return { error: null } },
          getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://almacen.test/${b}/${ruta}` } }),
        }
      },
    },
  }
  return { db, t, subidas }
}

interface Llamada { url: string; init?: RequestInit }
const ERROR_DE_TRIANGULOS = "The input model has 1,456,114 triangles which exceeds the 380,000 triangle limit for rigging (a quad face counts as two triangles). Please use the Remesh API (POST /openapi/v1/remesh) with a target_polycount of 300000 or less (150000 or less with topology quad) before rigging."

function proveedores(op: { falEstado?: string[]; falError?: boolean; falSinArchivo?: boolean; hfEstado?: string[]; animar?: 'ok' | 'no_humanoide' | 'envio_no_humanoide' | 'sin_clips' | 'falta_uno' | 'uno_sin_archivo' | 'demasiado_detalle' | 'envio_demasiado_detalle' | 'envio_raro' } = {}) {
  const llamadas: Llamada[] = []
  const ANIM = 'https://queue.fal.run/fal-ai/meshy/requests/anim-1'
  let pedidosDeAnimacion: number[] = []
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
    if (url === 'https://queue.fal.run/tripo3d/h3.1/requests/fal-1' && op.falSinArchivo) return json({ seed: 7 })
    if (url === 'https://queue.fal.run/tripo3d/h3.1/requests/fal-1') return json({ rendered_image: { url: 'https://v3.fal.media/files/x/vista.webp' }, model_mesh: { url: 'https://v3.fal.media/files/x/modelo.glb', content_type: 'model/gltf-binary', file_name: 'modelo.glb' }, model_urls: { glb: { url: 'https://v3.fal.media/files/x/modelo.glb', file_name: 'modelo.glb' } } })
    if (url === 'https://v3.fal.media/files/x/modelo.glb') return new Response(GLB, { status: 200 })
    // animar (fal-ai/meshy/rigging/multi-animation)
    if (url === 'https://queue.fal.run/fal-ai/meshy/rigging/multi-animation') {
      if (op.animar === 'envio_demasiado_detalle') return json({ detail: [{ loc: ['body', 'model_url'], msg: ERROR_DE_TRIANGULOS, type: 'value_error' }] }, 422)
      if (op.animar === 'envio_raro') return json({ detail: 'Auto rigging failed' }, 422)
      if (op.animar === 'envio_no_humanoide') return json({ detail: 'Rigging requires a humanoid character with clearly defined limbs' }, 422)
      pedidosDeAnimacion = (JSON.parse(String(init!.body)) as { animation_action_ids: number[] }).animation_action_ids
      return json({ request_id: 'anim-1', status_url: `${ANIM}/status`, response_url: ANIM })
    }
    if (url === `${ANIM}/status` && op.animar === 'demasiado_detalle') return json({ status: 'COMPLETED', error: ERROR_DE_TRIANGULOS, error_type: 'runtime' })
    if (url === `${ANIM}/status`) return json(op.animar === 'no_humanoide' ? { status: 'COMPLETED', error: 'Model is not a humanoid, rigging failed', error_type: 'runtime' } : { status: 'COMPLETED' })
    if (url === ANIM) {
      const ids = op.animar === 'falta_uno' ? pedidosDeAnimacion.slice(1) : op.animar === 'sin_clips' ? [] : pedidosDeAnimacion
      return json({ rig_task_id: 'r1', rigged_character_glb: { url: 'https://v3.fal.media/files/a/rig.glb' }, animations: ids.map((id, i) => (op.animar === 'uno_sin_archivo' && i === 0 ? { action_id: id } : { action_id: id, animation_glb: { url: `https://v3.fal.media/files/a/${id}.glb` }, animation_fbx: { url: `https://v3.fal.media/files/a/${id}.fbx` } })) })
    }
    if (url.startsWith('https://v3.fal.media/files/a/')) return new Response(GLB, { status: 200 })
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
  it('el doble clic con foto no la vuelve a subir ni a cotizar', async () => {
    const d = deps()
    const p = pedido({ tipo: 'imagen', prompt: 'misma escena de noche', foto_b64: PNG.toString('base64') })
    await crear(d, p)
    const subidas = d.base.subidas.length, llamadas = d.p.llamadas.length
    const r = await crear(d, p)
    expect(r.ok && r.valor.ya_existia).toBe(true)
    expect(d.base.subidas.length).toBe(subidas)
    expect(d.p.llamadas.length).toBe(llamadas)
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
  it('dos preguntas a la vez cierran una sola vez y anotan fal una sola vez', async () => {
    const d = deps(baseFalsa(), proveedores({ falEstado: ['COMPLETED', 'COMPLETED'] }))
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'termo naranja' }))
    if (!r.ok) throw new Error('no creó')
    const [a, b] = await Promise.all([avanzar(d, r.valor.pieza.id), avanzar(d, r.valor.pieza.id)])
    expect(a.ok && a.valor.estado).toBe('lista')
    expect(b.ok && b.valor.estado).toBe('lista')
    expect(d.base.t.costs.filter((c) => c.service === 'estudio:fal')).toHaveLength(1)
  })
  it('si fal falla queda fallida, con lo gastado en la imagen y sin cobro de fal', async () => {
    const d = deps(baseFalsa(), proveedores({ falEstado: ['COMPLETED'], falError: true }))
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'termo naranja' }))
    if (!r.ok) throw new Error('no creó')
    const a = await avanzar(d, r.valor.pieza.id)
    expect(a.ok && a.valor.estado).toBe('fallida')
    expect(a.ok && Number(a.valor.costo_usd)).toBe(0.01327)
    expect(d.base.t.costs.map((c) => c.service)).toEqual(['estudio:openai'])
    // un 3D que falla no habla de animar: su motivo es el del proveedor
    expect(a.ok && a.valor.error).toBe('fal · runtime · mesh failed')
  })
  it('si fal termina sin archivo, la pieza y el libro dicen la misma cifra (CC7 · 933)', async () => {
    const d = deps(baseFalsa(), proveedores({ falEstado: ['COMPLETED', 'COMPLETED'], falSinArchivo: true }))
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'termo naranja' }))
    if (!r.ok) throw new Error('no creó')
    const [a, b] = await Promise.all([avanzar(d, r.valor.pieza.id), avanzar(d, r.valor.pieza.id)])
    expect(a.ok && a.valor.estado).toBe('fallida')
    expect(b.ok && b.valor.estado).toBe('fallida')
    const libro = d.base.t.costs.reduce((s, c) => s + Number(c.amount_usd_exact), 0)
    expect(d.base.t.costs.map((c) => c.service).sort()).toEqual(['estudio:fal', 'estudio:openai'])
    expect(+libro.toFixed(6)).toBe(Number(d.base.t.estudio_piezas[0].costo_usd))
  })
  it('una imagen cobrada que no se pudo guardar: la pieza dice lo mismo que el libro (CC7 · 933)', async () => {
    const d = deps(baseFalsa([CLIENTE, OTRO], { subirFalla: true }))
    const r = await crear(d, pedido({ tipo: 'imagen', prompt: 'vaso en la playa', formato: '9:16' }))
    expect(r.ok && r.valor.pieza.estado).toBe('fallida')
    expect(d.base.t.costs).toHaveLength(1)
    expect(Number(d.base.t.estudio_piezas[0].costo_usd)).toBe(Number(d.base.t.costs[0].amount_usd_exact))
    expect(Number(d.base.t.estudio_piezas[0].costo_usd)).not.toBe(Number(d.base.t.estudio_piezas[0].costo_estimado_usd))
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

describe('animar un modelo 3D (GO 06-nov)', () => {
  // un modelo 3D listo del cliente, hecho por el camino normal
  async function modeloListo(op: Parameters<typeof proveedores>[0] = {}) {
    const d = deps(baseFalsa(), proveedores({ falEstado: ['COMPLETED'], ...op }))
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'figura de un surfista' }))
    if (!r.ok) throw new Error('no creó')
    const a = await avanzar(d, r.valor.pieza.id)
    if (!a.ok || a.valor.estado !== 'lista') throw new Error('el modelo no quedó listo')
    return { d, modelo: a.valor }
  }
  const animacion = (e: Record<string, unknown>) => {
    const a = armarAnimacion({ client_id: CLIENTE, clave: 'animar-0000001', ...e }, movimientoExiste)
    if (!a.ok) throw new Error(a.errores.join('; '))
    return a.pedido
  }
  const librosDeFal = (d: ReturnType<typeof deps>) => d.base.t.costs.filter((c) => c.service === 'estudio:fal').length

  it('el costo es esqueleto 0,20 + 0,12 por movimiento, a la vista antes de crear', async () => {
    expect(cotizarAnimacion(1).total_usd).toBe(0.32)
    expect(cotizarAnimacion(3).total_usd).toBe(0.56)
    const { d, modelo } = await modeloListo()
    const c = await cotizarLaAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0, 28] }))
    expect(c.ok && c.valor.total_usd).toBe(0.44)
  })
  it('el pedido exige cliente, clave, modelo y de 1 a 10 movimientos que existan en la biblioteca', () => {
    expect(BIBLIOTECA_DE_MOVIMIENTOS).toHaveLength(656)
    for (const m of MOVIMIENTOS_COMUNES) expect(movimientoExiste(m.id)).toBe(true)
    expect(MOVIMIENTOS_COMUNES.map((m) => m.nombre)).toEqual(['Quieto', 'Caminar', 'Correr', 'Saludar', 'Bailar'])
    const base = { client_id: CLIENTE, clave: 'animar-0000001', origen_pieza_id: CLIENTE }
    expect(armarAnimacion({ ...base, movimientos: [] }, movimientoExiste).ok).toBe(false)
    expect(armarAnimacion({ ...base, movimientos: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, movimientoExiste).ok).toBe(false)
    expect(armarAnimacion({ ...base, movimientos: [697] }, movimientoExiste).ok).toBe(false)
    expect(armarAnimacion({ ...base, movimientos: [2] }, movimientoExiste).ok).toBe(movimientoExiste(2))
    expect(armarAnimacion({ ...base, clave: 'x', movimientos: [0] }, movimientoExiste).ok).toBe(false)
    const a = armarAnimacion({ ...base, movimientos: [28, 28, 0] }, movimientoExiste)
    expect(a.ok && a.pedido.movimientos).toEqual([28, 0])
  })
  it('crea una pieza nueva ligada al modelo; al terminar guarda GLB y FBX de cada movimiento y anota lo cobrado una vez', async () => {
    const { d, modelo } = await modeloListo({ animar: 'ok' })
    const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [30, 28] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.valor.pieza.modelo).toBe('meshy-animar')
    expect(r.valor.pieza.tipo).toBe('3d')
    expect(r.valor.pieza.parametros.origen_pieza_id).toBe(modelo.id)
    const envio = d.p.llamadas.find((l) => l.url === 'https://queue.fal.run/fal-ai/meshy/rigging/multi-animation')!
    expect(JSON.parse(String(envio.init!.body))).toEqual({ model_url: modelo.archivo_url, height_meters: 1.7, animation_action_ids: [30, 28], enable_safety_checker: true })
    expect((envio.init!.headers as Record<string, string>)['X-Fal-No-Retry']).toBe('1')
    const [a, b] = await Promise.all([avanzar(d, r.valor.pieza.id), avanzar(d, r.valor.pieza.id)])
    expect(a.ok && a.valor.estado).toBe('lista')
    expect(b.ok && b.valor.estado).toBe('lista')
    const fin = d.base.t.estudio_piezas.find((p) => p.id === r.valor.pieza.id)!
    const archivos = (fin.parametros as { archivos: Array<{ action_id: number; nombre: string; glb: string; fbx: string }> }).archivos
    expect(archivos.map((x) => [x.action_id, x.nombre])).toEqual([[30, 'Casual_Walk'], [28, 'Big_Wave_Hello']])
    for (const x of archivos) { expect(x.glb).toMatch(/^https:\/\/almacen\.test\/oficina-creativos\/estudio\/.+\.glb$/); expect(x.fbx).toMatch(/\.fbx$/) }
    expect(fin.archivo_url).toBe(archivos[0].glb)
    expect(fin.archivo_tipo).toBe('glb')
    expect(Number(fin.costo_usd)).toBe(0.44)
    expect(librosDeFal(d)).toBe(2) // el modelo original + la animación, una sola vez
    const fila = d.base.t.costs.filter((c) => c.service === 'estudio:fal').at(-1)!
    expect(Number(fila.amount_usd_exact)).toBe(0.44)
    expect(JSON.parse(String(fila.description))).toMatchObject({ pieza_id: r.valor.pieza.id, client_id: CLIENTE, parte: 'animación' })
  })
  it('si el modelo no es una figura humana, se dice claro y no se cobra (al enviar o al terminar)', async () => {
    for (const caso of ['no_humanoide', 'envio_no_humanoide'] as const) {
      const { d, modelo } = await modeloListo({ animar: caso })
      const antes = librosDeFal(d)
      const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0] }))
      if (!r.ok) throw new Error(r.error)
      const fin = caso === 'no_humanoide' ? await avanzar(d, r.valor.pieza.id) : { ok: true as const, valor: r.valor.pieza }
      expect(fin.ok && fin.valor.estado).toBe('fallida')
      // los tres avisos de Animar dicen lo mismo del cobro (menor CC7 #947)
      expect(fin.ok && fin.valor.error).toMatch(/^Este modelo no parece una figura humana con brazos y piernas definidos, así que no se puede animar\. No se registró ningún cobro\. \(/)
      expect(fin.ok && Number(fin.valor.costo_usd)).toBe(0)
      expect(librosDeFal(d)).toBe(antes)
    }
  })
  it('fal termina sin ningún movimiento: la pieza y el libro dicen la misma cifra; si falta uno, se avisa', async () => {
    const s = await modeloListo({ animar: 'sin_clips' })
    const r = await crearAnimacion(s.d, animacion({ origen_pieza_id: s.modelo.id, movimientos: [0] }))
    if (!r.ok) throw new Error(r.error)
    const f = await avanzar(s.d, r.valor.pieza.id)
    expect(f.ok && f.valor.estado).toBe('fallida')
    expect(f.ok && Number(f.valor.costo_usd)).toBe(0.32)
    expect(Number(s.d.base.t.costs.at(-1)!.amount_usd_exact)).toBe(0.32)
    const u = await modeloListo({ animar: 'falta_uno' })
    const r2 = await crearAnimacion(u.d, animacion({ origen_pieza_id: u.modelo.id, movimientos: [0, 28] }))
    if (!r2.ok) throw new Error(r2.error)
    const g = await avanzar(u.d, r2.valor.pieza.id)
    expect(g.ok && g.valor.estado).toBe('lista')
    expect(g.ok && g.valor.aviso).toMatch(/no devolvió: Idle/)
  })
  it('solo se anima un modelo 3D listo del mismo cliente, y nunca una animación', async () => {
    const { d, modelo } = await modeloListo({ animar: 'ok' })
    const ajeno = await crearAnimacion(d, { ...animacion({ origen_pieza_id: modelo.id, movimientos: [0] }), client_id: OTRO })
    expect(!ajeno.ok && ajeno.status).toBe(404)
    const img = await crear(d, { ...pedido({ tipo: 'imagen', prompt: 'una ola' }), clave: 'clic-imagen-01' })
    if (!img.ok) throw new Error('no creó')
    const deImagen = await crearAnimacion(d, animacion({ origen_pieza_id: img.valor.pieza.id, movimientos: [0] }))
    expect(!deImagen.ok && deImagen.error).toBe('modelo_no_animable')
    const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0] }))
    if (!r.ok) throw new Error(r.error)
    await avanzar(d, r.valor.pieza.id)
    const deAnimacion = await crearAnimacion(d, animacion({ origen_pieza_id: r.valor.pieza.id, movimientos: [0], clave: 'animar-0000002' }))
    expect(!deAnimacion.ok && deAnimacion.detalle).toMatch(/ya es una animación/)
    expect(d.p.llamadas.filter((l) => l.url.endsWith('/multi-animation'))).toHaveLength(1)
  })
  it('el doble clic no cobra dos veces', async () => {
    const { d, modelo } = await modeloListo({ animar: 'ok' })
    const p = animacion({ origen_pieza_id: modelo.id, movimientos: [0] })
    const [a, b] = await Promise.all([crearAnimacion(d, p), crearAnimacion(d, p)])
    expect(a.ok && b.ok).toBe(true)
    expect(d.p.llamadas.filter((l) => l.url.endsWith('/multi-animation'))).toHaveLength(1)
    expect(d.base.t.estudio_piezas.filter((x) => x.modelo === 'meshy-animar')).toHaveLength(1)
  })
  it('demasiados triángulos (el error real de producción, 06-nov): se dice «demasiado detalle» con las cifras, no «no es figura humana», y no se cobra — al enviar o al terminar', async () => {
    for (const caso of ['envio_demasiado_detalle', 'demasiado_detalle'] as const) {
      const { d, modelo } = await modeloListo({ animar: caso })
      const antes = librosDeFal(d)
      const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0] }))
      if (!r.ok) throw new Error(r.error)
      const fin = caso === 'demasiado_detalle' ? await avanzar(d, r.valor.pieza.id) : { ok: true as const, valor: r.valor.pieza }
      expect(fin.ok && fin.valor.estado).toBe('fallida')
      expect(fin.ok && fin.valor.error).toMatch(/^Este modelo tiene demasiado detalle para ponerle esqueleto \(1\.456\.114 triángulos; el proveedor acepta hasta 380\.000\), así que no se puede animar tal cual\. No se registró ningún cobro\./)
      expect(fin.ok && fin.valor.error).not.toMatch(/figura humana/)
      expect(fin.ok && Number(fin.valor.costo_usd)).toBe(0)
      expect(librosDeFal(d)).toBe(antes)
    }
  })
  it('un rechazo que no se reconoce se dice en simple, sin inventar causa, con el texto del proveedor', async () => {
    const { d, modelo } = await modeloListo({ animar: 'envio_raro' })
    const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.valor.pieza.estado).toBe('fallida')
    expect(r.valor.pieza.error).toBe(`${AVISO_SIN_CAUSA} (fal 422 · Auto rigging failed)`)
  })
  it('el texto del proveedor se muestra sin el JSON alrededor, aunque venga cortado como en producción', () => {
    // así quedó guardado el 06-nov en la pieza cff64986 (cortado al final)
    const cortado = 'fal 422 · {"detail":[{"loc":["body"],"msg":"The input model has 1,456,114 triangles which exceeds the 380,000 triangle limit for rigging (a quad face counts as two triangles). Please use the Remesh API (POST /openapi/v1/remesh) with a target_polycount of 300000 or less (150000 or less with topology quad) befo'
    expect(textoDelProveedor(cortado)).toBe('fal 422 · The input model has 1,456,114 triangles which exceeds the 380,000 triangle limit for rigging (a quad face counts as two triangles). Please use the Remesh API (POST /openapi/v1/remesh) with a target_polycount of 300000 or less (150000 or less with topology quad) befo')
    expect(motivoDeAnimacion(cortado)).toMatch(/^Este modelo tiene demasiado detalle para ponerle esqueleto \(1\.456\.114 triángulos; el proveedor acepta hasta 380\.000\).*\(fal 422 · The input model has/)
    expect(textoDelProveedor('fal 422 · {"detail":"Auto rigging failed"}')).toBe('fal 422 · Auto rigging failed')
    expect(textoDelProveedor('fal · timeout')).toBe('fal · timeout')
    expect(textoDelProveedor('fal 500 · {"error":"x"}')).toBe('fal 500 · {"error":"x"}')
  })
  it('el motivo de un fallo al animar: cifras exactas, respaldo sin cifras, humano, y causa desconocida', () => {
    expect(demasiadoDetalle(ERROR_DE_TRIANGULOS)).toEqual({ tiene: 1456114, tope: 380000 })
    expect(demasiadoDetalle('timeout')).toBeNull()
    expect(motivoDeAnimacion('exceeds the polycount')).toMatch(/^Este modelo tiene demasiado detalle para ponerle esqueleto, así que no se puede animar tal cual\. No se registró ningún cobro\. \(exceeds the polycount\)$/)
    expect(motivoDeAnimacion('Model is not a humanoid')).toMatch(/^Este modelo no parece una figura humana/)
    // si el texto nombra las dos cosas, manda el detalle: es lo que se puede arreglar
    expect(motivoDeAnimacion('Rigging requires a humanoid; 500,000 triangles which exceeds the 380,000 triangle limit')).toMatch(/^Este modelo tiene demasiado detalle/)
    expect(motivoDeAnimacion('timeout')).toBe(`${AVISO_SIN_CAUSA} (timeout)`)
    expect(AVISO_SIN_CAUSA).toBe('No se pudo animar este modelo; el proveedor no dio una causa que reconozcamos. No se registró ningún cobro.')
  })
  it('lo que dice «no es figura humana» se reconoce por palabra entera; un error cualquiera no', () => {
    for (const t of ['Model is not a humanoid', 'Rigging requires a humanoid character with clearly defined limbs', 'no limbs detected', 'biped not found']) expect(noEsHumanoide(t)).toBe(true)
    // «rigging», «skeleton» o «pose» no prueban que no sea humano: el error de demasiados triángulos también dice «rigging» (06-nov)
    for (const t of ['timeout', 'Internal Server Error', 'invalid origin header', 'purpose not allowed', 'trigger failed', 'exposed url', 'Auto rigging failed', 'could not rig the mesh', 'Skeleton generation failed', 'pose estimation error', ERROR_DE_TRIANGULOS]) expect(noEsHumanoide(t)).toBe(false)
  })
  it('un modelo 3D que todavía se está creando no se anima', async () => {
    const d = deps(baseFalsa(), proveedores({ falEstado: ['IN_PROGRESS'], animar: 'ok' }))
    const r = await crear(d, pedido({ tipo: '3d', prompt: 'figura de un surfista' }))
    if (!r.ok) throw new Error('no creó')
    const fila = d.base.t.estudio_piezas.find((p) => p.id === r.valor.pieza.id)!
    // aunque ya tuviera archivo, sigue «creando»: no se anima
    Object.assign(fila, { archivo_url: 'https://almacen.test/oficina-creativos/estudio/x.glb', archivo_tipo: 'glb' })
    const a = await crearAnimacion(d, animacion({ origen_pieza_id: r.valor.pieza.id, movimientos: [0] }))
    expect(!a.ok && a.error).toBe('modelo_no_animable')
    expect(d.p.llamadas.filter((l) => l.url.endsWith('/multi-animation'))).toHaveLength(0)
  })
  it('repetir el mismo clic más tarde devuelve la misma pieza, sin otro envío', async () => {
    const { d, modelo } = await modeloListo({ animar: 'ok' })
    const p = animacion({ origen_pieza_id: modelo.id, movimientos: [0] })
    const a = await crearAnimacion(d, p)
    const b = await crearAnimacion(d, p)
    expect(a.ok && a.valor.ya_existia).toBe(false)
    expect(b.ok && b.valor.ya_existia).toBe(true)
    expect(b.ok && a.ok && b.valor.pieza.id).toBe(a.ok ? a.valor.pieza.id : null)
    expect(d.p.llamadas.filter((l) => l.url.endsWith('/multi-animation'))).toHaveLength(1)
    // lo ya pedido se devuelve antes de mirar llaves o modelo: aunque falte la llave, no da error
    const c = await crearAnimacion({ ...d, llaves: { ...d.llaves, fal: '' } }, p)
    expect(c.ok && c.valor.ya_existia).toBe(true)
  })
  it('fal sin movimientos y dos preguntas a la vez: el libro se anota una sola vez', async () => {
    const { d, modelo } = await modeloListo({ animar: 'sin_clips' })
    const antes = librosDeFal(d)
    const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0] }))
    if (!r.ok) throw new Error(r.error)
    const [x, y] = await Promise.all([avanzar(d, r.valor.pieza.id), avanzar(d, r.valor.pieza.id)])
    expect(x.ok && x.valor.estado).toBe('fallida')
    expect(y.ok && y.valor.estado).toBe('fallida')
    expect(librosDeFal(d)).toBe(antes + 1)
  })
  it('un movimiento tiene que ser un número de verdad: `true`, vacío o texto no cuentan (CC7 #935)', () => {
    const base = { client_id: CLIENTE, clave: 'animar-0000001', origen_pieza_id: CLIENTE }
    expect(armarAnimacion({ ...base, movimientos: [true] }, movimientoExiste).ok).toBe(false)
    expect(armarAnimacion({ ...base, movimientos: [''] }, movimientoExiste).ok).toBe(false)
    expect(armarAnimacion({ ...base, movimientos: ['28a'] }, movimientoExiste).ok).toBe(false)
    expect(armarAnimacion({ ...base, movimientos: [null] }, movimientoExiste).ok).toBe(false)
    const a = armarAnimacion({ ...base, movimientos: ['28', 0] }, movimientoExiste)
    expect(a.ok && a.pedido.movimientos).toEqual([28, 0])
  })
  it('un modelo cuyo archivo no está en una dirección pública no se anima ni se envía (CC7 #935)', async () => {
    const { d, modelo } = await modeloListo({ animar: 'ok' })
    const fila = d.base.t.estudio_piezas.find((p) => p.id === modelo.id)!
    Object.assign(fila, { archivo_url: 'http://127.0.0.1/estudio/modelo.glb' })
    const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0] }))
    expect(!r.ok && r.error).toBe('modelo_no_animable')
    expect(!r.ok && r.detalle).toMatch(/no es público/)
    expect(d.p.llamadas.filter((l) => l.url.endsWith('/multi-animation'))).toHaveLength(0)
  })
  it('un movimiento que llega sin archivo no cuenta: el aviso lo nombra como faltante (CC7 #935)', async () => {
    const { d, modelo } = await modeloListo({ animar: 'uno_sin_archivo' })
    const r = await crearAnimacion(d, animacion({ origen_pieza_id: modelo.id, movimientos: [0, 28] }))
    if (!r.ok) throw new Error(r.error)
    const g = await avanzar(d, r.valor.pieza.id)
    expect(g.ok && g.valor.estado).toBe('lista')
    expect(g.ok && g.valor.aviso).toMatch(/no devolvió: Idle/)
    const fin = d.base.t.estudio_piezas.find((p) => p.id === r.valor.pieza.id)!
    expect((fin.parametros as { archivos: Array<{ action_id: number }> }).archivos.map((x) => x.action_id)).toEqual([28])
  })
  it('la ruta exige la llave interna y el catálogo trae precio, comunes y biblioteca', () => {
    const ruta = readFileSync(join(__dirname, '..', 'src', 'app', 'api', 'estudio', 'animar', 'route.ts'), 'utf8')
    expect(ruta).toContain('checkInternalKey(request)')
    expect(ruta).toContain('export const maxDuration = 800')
    const cat = readFileSync(join(__dirname, '..', 'src', 'app', 'api', 'estudio', 'catalogo', 'route.ts'), 'utf8')
    expect(cat).toContain('animar: { precio: ANIMAR.precio, maximo: ANIMAR.maximo, comunes: MOVIMIENTOS_COMUNES, biblioteca: BIBLIOTECA_DE_MOVIMIENTOS }')
  })
})
