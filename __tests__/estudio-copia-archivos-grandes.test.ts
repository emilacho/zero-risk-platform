/**
 * EL ESTUDIO · copia de archivos grandes (GO-LENOVO 10-nov 14:55Z) · pruebas en seco (US$ 0).
 * Tope de copia 20 → 50 MB (código y almacén) y el rescate diario de lo que quedó solo en el proveedor.
 * Base falsa que RECHAZA columnas que la migración no crea; dos clientes de práctica; proveedor simulado por dirección.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { rescatarArchivos, sinAvisosDeCopia, TOPE_DEL_ARCHIVO_BYTES, TOPE_POR_PASADA, type Deps } from '@/lib/estudio/servicio'

const CLIENTE = 'a0000000-0000-4000-8000-0000000000e1'
const OTRO = 'b0000000-0000-4000-8000-0000000000e2'
const MB = 1048576
const A = 'https://almacen.test/oficina-creativos/'
const QUEDA = 'queda solo en el proveedor (vence en días): '

const raiz = join(__dirname, '..')
const migracion = readFileSync(join(raiz, 'supabase', 'migrations', '202611052100_estudio_piezas.sql'), 'utf8')
const cuerpoTabla = migracion.slice(migracion.indexOf('create table'), migracion.indexOf(');', migracion.indexOf('create table')))
const COLUMNAS = new Set([...cuerpoTabla.matchAll(/^\s{2}([a-z_]+)\s/gm)].map((m) => m[1]))
for (const m of readFileSync(join(raiz, 'supabase', 'migrations', '202611092300_estudio_papelera.sql'), 'utf8').matchAll(/add column if not exists ([a-z_]+)/g)) COLUMNAS.add(m[1])

type Fila = Record<string, unknown>
function baseFalsa(op: { subirFalla?: boolean; antesDeEscribir?: (t: Fila[]) => void } = {}) {
  const t: Fila[] = []
  const subidas: Array<{ ruta: string; bytes: number; tipo: string }> = []
  const escrituras: Fila[] = []
  const validar = (cs: string[]) => { for (const c of cs) if (!COLUMNAS.has(c)) throw new Error(`columna inexistente estudio_piezas.${c}`) }
  const db = {
    from(tabla: string) {
      if (tabla !== 'estudio_piezas') throw new Error(`tabla no esperada ${tabla}`)
      const filtros: Array<(f: Fila) => boolean> = []
      let cols: string[] = []
      let cambios: Fila | null = null
      let lim = 1e9
      const q = {
        select(s: string) { cols = s.split(',').map((x) => x.trim()).filter(Boolean); validar(cols); return q },
        eq(c: string, v: unknown) { validar([c]); filtros.push((f) => f[c] === v); return q },
        is(c: string, v: null) { validar([c]); filtros.push((f) => (f[c] ?? null) === v); return q },
        // like de Postgres: solo la forma %texto%
        like(c: string, v: string) { validar([c]); if (!/^%[^%_]+%$/.test(v)) throw new Error(`like sin simular: ${v}`); filtros.push((f) => typeof f[c] === 'string' && (f[c] as string).includes(v.slice(1, -1))); return q },
        order(c: string) { validar([c]); return q },
        limit(k: number) { lim = k; return q },
        update(row: Fila) { validar(Object.keys(row)); cambios = row; return q },
        then(ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) {
          const coincide = (f: Fila) => filtros.every((x) => x(f))
          let data: Fila[]
          if (cambios) { op.antesDeEscribir?.(t); data = t.filter(coincide); data.forEach((f) => Object.assign(f, cambios)); if (data.length) escrituras.push(cambios) }
          else data = t.filter(coincide).slice(0, lim)
          const proy = (f: Fila) => Object.fromEntries(cols.map((c) => [c, structuredClone(f[c] ?? null)]))
          return Promise.resolve({ data: cols.length ? data.map(proy) : data, error: null }).then(ok, ko)
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
  return { db, t, subidas, escrituras }
}

/** el proveedor: dirección → tamaño real (bytes) o código de error */
function proveedor(archivos: Record<string, number | 'no_esta'>) {
  const llamadas: string[] = []
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input)
    llamadas.push(url)
    const a = archivos[url]
    if (a === undefined) throw new Error(`llamada no esperada: ${url}`)
    if (a === 'no_esta') return new Response('not found', { status: 404 })
    return new Response(Buffer.alloc(a, 7), { status: 200, headers: { 'content-length': String(a) } })
  }) as typeof fetch
  return { f, llamadas }
}

function deps(b: ReturnType<typeof baseFalsa>, p: ReturnType<typeof proveedor>, bucket: string | null = 'oficina-creativos'): Deps {
  return { db: b.db as never, fetch: p.f, llaves: { openai: '', higgsfield: '', fal: '' }, bucket, modeloDeImagen: 'x', ahora: () => Date.parse('2026-11-11T03:40:00Z') }
}

const ANIM = 'd8f2194d-db5a-406b-81f2-b7869d864736'
const GLB_FAL = 'https://v3b.fal.media/files/b/0ab1eb27/FcuL5ycaLpEeeFOagMvR-_animation.glb'
/** la pieza de Emilio tal como quedó (10-nov): FBX en nuestro almacén, GLB de 23.8 MB solo en fal */
function animacionDeEmilio(cliente = CLIENTE, extra: Fila = {}): Fila {
  return {
    id: ANIM, client_id: cliente, tipo: 'animacion', estado: 'lista', paso: null, prompt: 'saludo', modelo: 'meshy-animar', creado_en: '2026-11-10T14:30:00Z',
    archivo_url: GLB_FAL, archivo_tipo: 'glb', miniatura_url: `${A}estudio/${cliente}/partida.png`, foto_partida_url: `${A}estudio/${cliente}/partida.png`,
    parametros: { origen_pieza_id: '0f08cedb-f3b8-4df9-a18b-1f3a9c13b99a', movimientos: [28], archivos: [{ action_id: 28, nombre: 'Big_Wave_Hello', glb: GLB_FAL, fbx: `${A}estudio/${cliente}/${ANIM}-28.fbx` }] },
    aviso: `${QUEDA}archivo_muy_grande · 23.8 MB`, error: null, costo_usd: 0.32, costo_estimado_usd: 0.32, terminado_en: '2026-11-10T14:40:00Z', en_papelera_desde: null, ...extra,
  }
}

describe('el tope de copia sube a 50 MB (código y almacén)', () => {
  it('el código copia hasta 50 MB y la migración pone el almacén en lo mismo, solo si estaba en 20 MB; la reversa vuelve a 20 MB', () => {
    expect(TOPE_DEL_ARCHIVO_BYTES).toBe(52428800)
    const mig = readFileSync(join(raiz, 'supabase', 'migrations', '202611101700_estudio_almacen_50_mb.sql'), 'utf8')
    const rev = readFileSync(join(raiz, 'supabase', 'reversas', '202611101700_estudio_almacen_50_mb_REVERSA.sql'), 'utf8')
    const sql = (s: string) => s.split('\n').filter((l) => !l.startsWith('--')).join('\n').replace(/\s+/g, ' ').trim()
    expect(sql(mig)).toBe(`begin; update storage.buckets set file_size_limit = ${TOPE_DEL_ARCHIVO_BYTES} where id = 'oficina-creativos' and file_size_limit = 20971520; commit;`)
    expect(sql(rev)).toBe(`begin; update storage.buckets set file_size_limit = 20971520 where id = 'oficina-creativos' and file_size_limit = ${TOPE_DEL_ARCHIVO_BYTES}; commit;`)
  })
})

describe('sinAvisosDeCopia', () => {
  it('quita los «queda solo en el proveedor» con su detalle y conserva los demás avisos', () => {
    expect(sinAvisosDeCopia(`${QUEDA}archivo_muy_grande · 24.0 MB · ${QUEDA}archivo_muy_grande · 31.3 MB`)).toBeNull()
    expect(sinAvisosDeCopia(`foto recortada · ${QUEDA}descarga_fallida · el proveedor respondió 500 · el costo no entró al libro: x`)).toBe('foto recortada · el costo no entró al libro: x')
    // sin detalle (subida fallida): no se come el aviso siguiente
    expect(sinAvisosDeCopia(`${QUEDA}almacén lleno · el proveedor no devolvió: Saludo`)).toBe('el proveedor no devolvió: Saludo')
    expect(sinAvisosDeCopia(null)).toBeNull()
  })
})

describe('el rescate diario de lo que quedó en el proveedor', () => {
  it('la animación de Emilio: copia el GLB de 23.8 MB a su carpeta, cambia las dos direcciones y quita el aviso', async () => {
    const b = baseFalsa(); b.t.push(animacionDeEmilio())
    const p = proveedor({ [GLB_FAL]: Math.round(23.8 * MB) })
    const r = await rescatarArchivos(deps(b, p), { dry_run: false })
    expect(r.ok && r.valor).toMatchObject({ revisadas: 1, copiadas: [ANIM], archivos: 1, siguen: [], fallas: [] })
    expect(p.llamadas).toEqual([GLB_FAL]) // una sola bajada aunque sea principal y clip
    expect(b.subidas).toEqual([{ ruta: `estudio/${CLIENTE}/${ANIM}-28.glb`, bytes: Math.round(23.8 * MB), tipo: 'model/gltf-binary' }])
    const f = b.t[0]
    const nuevo = `${A}estudio/${CLIENTE}/${ANIM}-28.glb`
    expect(f.archivo_url).toBe(nuevo)
    expect((f.parametros as { archivos: Fila[] }).archivos).toEqual([{ action_id: 28, nombre: 'Big_Wave_Hello', glb: nuevo, fbx: `${A}estudio/${CLIENTE}/${ANIM}-28.fbx` }])
    expect((f.parametros as Fila).movimientos).toEqual([28])
    expect(f.aviso).toBeNull()
    // lo demás de la pieza no se toca (estado, costo)
    expect([f.estado, f.costo_usd, f.terminado_en]).toEqual(['lista', 0.32, '2026-11-10T14:40:00Z'])
  })
  it('GLB y FBX afuera (24.0 y 31.3 MB): copia los dos', async () => {
    const ID = 'fc6b8c42-a577-4819-8fb5-77ee0e068a1f'
    const glb = 'https://v3b.fal.media/files/b/0ab1cd5f/D_animation.glb', fbx = 'https://v3b.fal.media/files/b/0ab1cd5f/q_animation.fbx'
    const b = baseFalsa(); b.t.push(animacionDeEmilio(CLIENTE, { id: ID, archivo_url: glb, parametros: { archivos: [{ action_id: 591, nombre: 'Hip_Hop_Dance', glb, fbx }] }, aviso: `${QUEDA}archivo_muy_grande · 24.0 MB · ${QUEDA}archivo_muy_grande · 31.3 MB` }))
    const r = await rescatarArchivos(deps(b, proveedor({ [glb]: 24 * MB, [fbx]: Math.round(31.3 * MB) })), { dry_run: false })
    expect(r.ok && r.valor).toMatchObject({ copiadas: [ID], archivos: 2 })
    expect(b.subidas.map((s) => s.ruta).sort()).toEqual([`estudio/${CLIENTE}/${ID}-591.fbx`, `estudio/${CLIENTE}/${ID}-591.glb`])
    expect(b.t[0].aviso).toBeNull()
    expect(b.t[0].archivo_url).toBe(`${A}estudio/${CLIENTE}/${ID}-591.glb`)
  })
  it('un 3D de 50.3 MB sigue siendo más grande que el tope: la fila queda igual y se informa', async () => {
    const ID = '8c4d9297-1b08-4ef2-95a7-91a3e67b112e', url = 'https://v3b.fal.media/files/b/0ab14d5a/x_model.glb'
    const b = baseFalsa(); b.t.push(animacionDeEmilio(OTRO, { id: ID, tipo: '3d', modelo: 'meshy-6', archivo_url: url, parametros: {}, aviso: `${QUEDA}archivo_muy_grande · 50.3 MB` }))
    const antes = structuredClone(b.t[0])
    const r = await rescatarArchivos(deps(b, proveedor({ [url]: Math.round(50.3 * MB) })), { dry_run: false })
    expect(r.ok && r.valor).toMatchObject({ copiadas: [], siguen: [{ id: ID, aviso: `${QUEDA}archivo_muy_grande · 50.3 MB` }] })
    expect(b.t[0]).toEqual(antes)
    expect(b.subidas).toHaveLength(0)
  })
  it('un 3D de exactamente 50 MB entra; su ruta es la de siempre, en la carpeta de SU cliente', async () => {
    const ID = 'e0000000-0000-4000-8000-0000000000f1', url = 'https://v3b.fal.media/files/z/m.glb'
    const b = baseFalsa(); b.t.push(animacionDeEmilio(OTRO, { id: ID, tipo: '3d', archivo_url: url, parametros: {}, aviso: `${QUEDA}archivo_muy_grande · 45.0 MB` }))
    const r = await rescatarArchivos(deps(b, proveedor({ [url]: 50 * MB })), { dry_run: false })
    expect(r.ok && r.valor.copiadas).toEqual([ID])
    expect(b.subidas[0].ruta).toBe(`estudio/${OTRO}/${ID}.glb`)
    expect(b.t[0].archivo_url).toBe(`${A}estudio/${OTRO}/${ID}.glb`)
  })
  it('una imagen rescatada también arregla su miniatura si era la misma dirección', async () => {
    const ID = 'e0000000-0000-4000-8000-0000000000f2', url = 'https://v3b.fal.media/files/nb/salida.png'
    const b = baseFalsa(); b.t.push(animacionDeEmilio(CLIENTE, { id: ID, tipo: 'imagen', archivo_tipo: 'image', archivo_url: url, miniatura_url: url, parametros: { referencias: [] }, aviso: `${QUEDA}almacén lleno` }))
    await rescatarArchivos(deps(b, proveedor({ [url]: 1000 })), { dry_run: false })
    expect([b.t[0].archivo_url, b.t[0].miniatura_url]).toEqual([`${A}estudio/${CLIENTE}/${ID}.png`, `${A}estudio/${CLIENTE}/${ID}.png`])
    expect(b.subidas[0].tipo).toBe('image/png')
  })
  it('el proveedor ya lo borró: la fila queda igual', async () => {
    const b = baseFalsa(); b.t.push(animacionDeEmilio())
    const antes = structuredClone(b.t[0])
    const r = await rescatarArchivos(deps(b, proveedor({ [GLB_FAL]: 'no_esta' })), { dry_run: false })
    expect(r.ok && r.valor.siguen[0].aviso).toBe(`${QUEDA}descarga_fallida · el proveedor respondió 404`)
    expect(b.t[0]).toEqual(antes)
  })
  it('de dos archivos se copia uno: cambia ese, el aviso queda solo con el que falta', async () => {
    const glb = 'https://v3b.fal.media/a.glb', fbx = 'https://v3b.fal.media/a.fbx'
    const b = baseFalsa(); b.t.push(animacionDeEmilio(CLIENTE, { archivo_url: glb, parametros: { archivos: [{ action_id: 28, nombre: 'x', glb, fbx }] }, aviso: `${QUEDA}archivo_muy_grande · 24.0 MB · ${QUEDA}archivo_muy_grande · 60.0 MB · el proveedor no devolvió: Saludo` }))
    const r = await rescatarArchivos(deps(b, proveedor({ [glb]: 24 * MB, [fbx]: 60 * MB })), { dry_run: false })
    expect(r.ok && r.valor).toMatchObject({ copiadas: [], archivos: 1, siguen: [{ id: ANIM }] })
    const c = (b.t[0].parametros as { archivos: Fila[] }).archivos[0]
    expect([b.t[0].archivo_url, c.glb, c.fbx]).toEqual([`${A}estudio/${CLIENTE}/${ANIM}-28.glb`, `${A}estudio/${CLIENTE}/${ANIM}-28.glb`, fbx])
    expect(b.t[0].aviso).toBe(`el proveedor no devolvió: Saludo · ${QUEDA}archivo_muy_grande · 60.0 MB`)
  })
  it('el almacén falla al subir: la fila queda igual', async () => {
    const b = baseFalsa({ subirFalla: true }); b.t.push(animacionDeEmilio())
    const antes = structuredClone(b.t[0])
    const r = await rescatarArchivos(deps(b, proveedor({ [GLB_FAL]: 24 * MB })), { dry_run: false })
    expect(r.ok && r.valor.siguen).toHaveLength(1)
    expect(b.t[0]).toEqual(antes)
  })
  it('si alguien cambió la pieza durante la copia, no la pisa', async () => {
    const b = baseFalsa({ antesDeEscribir: (t) => { t[0].aviso = 'otro aviso puesto mientras tanto' } }); b.t.push(animacionDeEmilio())
    const r = await rescatarArchivos(deps(b, proveedor({ [GLB_FAL]: 24 * MB })), { dry_run: false })
    expect(r.ok && r.valor.fallas).toEqual([{ id: ANIM, error: 'la pieza cambió durante la copia: queda para la próxima pasada' }])
    expect(b.t[0].archivo_url).toBe(GLB_FAL)
    expect(b.escrituras).toHaveLength(0)
  })
  it('en seco solo cuenta: no baja, no sube, no escribe', async () => {
    const b = baseFalsa(); b.t.push(animacionDeEmilio())
    const p = proveedor({})
    const r = await rescatarArchivos(deps(b, p), { dry_run: true })
    expect(r.ok && r.valor).toMatchObject({ revisadas: 1, copiadas: [ANIM], archivos: 1, dry_run: true })
    expect([p.llamadas.length, b.subidas.length, b.escrituras.length]).toEqual([0, 0, 0])
  })
  it('no toca piezas sin ese aviso ni piezas que no están listas; dos clientes no se mezclan', async () => {
    const b = baseFalsa()
    b.t.push(animacionDeEmilio(CLIENTE, { id: 'e0000000-0000-4000-8000-0000000000a1', aviso: null }))
    b.t.push(animacionDeEmilio(CLIENTE, { id: 'e0000000-0000-4000-8000-0000000000a2', estado: 'creando' }))
    b.t.push(animacionDeEmilio(CLIENTE, { id: 'e0000000-0000-4000-8000-0000000000a3', aviso: 'el costo no entró al libro: x' }))
    const otra = 'https://v3b.fal.media/otra.glb'
    b.t.push(animacionDeEmilio(OTRO, { id: 'e0000000-0000-4000-8000-0000000000a4', archivo_url: otra, parametros: { archivos: [{ action_id: 30, nombre: 'y', glb: otra, fbx: null }] } }))
    const p = proveedor({ [otra]: 1000 })
    const r = await rescatarArchivos(deps(b, p), { dry_run: false })
    expect(r.ok && r.valor).toMatchObject({ revisadas: 1, copiadas: ['e0000000-0000-4000-8000-0000000000a4'] })
    expect(p.llamadas).toEqual([otra])
    expect(b.subidas.map((s) => s.ruta)).toEqual([`estudio/${OTRO}/e0000000-0000-4000-8000-0000000000a4-30.glb`])
    expect(((b.t[3].parametros as { archivos: Fila[] }).archivos[0]).fbx).toBeNull()
  })
  it('una dirección rara (no https) no se baja; un tipo sin ruta conocida se informa y no se toca', async () => {
    const b = baseFalsa()
    b.t.push(animacionDeEmilio(CLIENTE, { id: 'e0000000-0000-4000-8000-0000000000b1', tipo: '3d', archivo_tipo: 'raro', archivo_url: 'https://v3b.fal.media/m.bin', parametros: {} }))
    b.t.push(animacionDeEmilio(CLIENTE, { id: 'e0000000-0000-4000-8000-0000000000b2', tipo: '3d', archivo_url: 'http://169.254.169.254/x.glb', parametros: {} }))
    const p = proveedor({})
    const r = await rescatarArchivos(deps(b, p), { dry_run: false })
    expect(r.ok && r.valor.siguen.map((s) => s.id)).toEqual(['e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b2'])
    expect(r.ok && r.valor.siguen[1]).toEqual({ id: 'e0000000-0000-4000-8000-0000000000b2', aviso: 'ningún archivo del proveedor que se pueda bajar' })
    expect(p.llamadas).toHaveLength(0)
    expect(b.escrituras).toHaveLength(0)
    // en seco tampoco cuenta como copiable
    const s = await rescatarArchivos(deps(b, p), { dry_run: true })
    expect(s.ok && [s.valor.copiadas, s.valor.archivos]).toEqual([[], 0])
  })
  it('sin almacén configurado no hace nada; una pasada revisa como mucho el tope', async () => {
    const b = baseFalsa(); b.t.push(animacionDeEmilio())
    const r = await rescatarArchivos(deps(b, proveedor({}), null), { dry_run: false })
    expect(!r.ok && r.error).toBe('almacen_no_configurado')
    const muchas = baseFalsa()
    for (let i = 0; i < TOPE_POR_PASADA + 5; i++) muchas.t.push(animacionDeEmilio(CLIENTE, { id: `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}` }))
    const s = await rescatarArchivos(deps(muchas, proveedor({})), { dry_run: true })
    expect(s.ok && s.valor.revisadas).toBe(TOPE_POR_PASADA)
  })
})

describe('el cron diario de la papelera corre el rescate después del vaciado', () => {
  it('GET: vacía y después rescata, con el mismo modo; si el rescate falla, el vaciado queda hecho', async () => {
    vi.resetModules()
    const orden: string[] = []
    let rescateFalla = false
    vi.doMock('@/lib/estudio/deps', () => ({ depsReales: () => ({ marca: 'deps' }) }))
    vi.doMock('@/lib/estudio/servicio', () => ({
      vaciarPapelera: async (d: unknown, o: { dry_run: boolean }) => { orden.push(`vaciar:${o.dry_run}:${(d as { marca: string }).marca}`); return { ok: true, valor: { borradas: [] } } },
      rescatarArchivos: async (d: unknown, o: { dry_run: boolean }) => { orden.push(`rescatar:${o.dry_run}:${(d as { marca: string }).marca}`); if (rescateFalla) throw new Error('boom'); return { ok: true, valor: { copiadas: ['x'] } } },
    }))
    process.env.CRON_SECRET = 'secreto-de-prueba'
    const { GET } = await import('@/app/api/estudio/papelera/vaciar/route')
    const req = () => new Request('https://x.test/api/estudio/papelera/vaciar', { headers: { authorization: 'Bearer secreto-de-prueba' } })
    const r = await GET(req())
    expect(orden).toEqual(['vaciar:false:deps', 'rescatar:false:deps'])
    expect(await r.json()).toEqual({ ok: true, borradas: [], rescate: { copiadas: ['x'] } })
    rescateFalla = true
    const r2 = await GET(req())
    expect(r2.status).toBe(200)
    expect(await r2.json()).toEqual({ ok: true, borradas: [], rescate: { error: 'rescate_fallido', detalle: 'boom' } })
    const sinLlave = await GET(new Request('https://x.test/api/estudio/papelera/vaciar'))
    expect(sinLlave.status).toBe(401)
    vi.doUnmock('@/lib/estudio/deps'); vi.doUnmock('@/lib/estudio/servicio')
  })
  it('la ruta a mano /api/estudio/rescatar: solo con la llave interna y en seco salvo dry_run=false', async () => {
    vi.resetModules()
    const modos: boolean[] = []
    vi.doMock('@/lib/estudio/deps', () => ({ depsReales: () => ({}) }))
    vi.doMock('@/lib/estudio/servicio', () => ({ rescatarArchivos: async (_d: unknown, o: { dry_run: boolean }) => { modos.push(o.dry_run); return { ok: true, valor: { copiadas: [] } } } }))
    process.env.INTERNAL_API_KEY = 'llave-de-prueba'
    const { POST } = await import('@/app/api/estudio/rescatar/route')
    const req = (cuerpo?: string, llave = 'llave-de-prueba') => new Request('https://x.test/api/estudio/rescatar', { method: 'POST', headers: { 'x-api-key': llave }, ...(cuerpo ? { body: cuerpo } : {}) })
    expect((await POST(req(undefined, 'otra'))).status).toBe(401)
    expect(modos).toEqual([])
    await POST(req())
    await POST(req('{"dry_run":"false"}'))
    await POST(req('{"dry_run":false}'))
    expect(modos).toEqual([true, true, false])
    vi.doUnmock('@/lib/estudio/deps'); vi.doUnmock('@/lib/estudio/servicio')
  })
})
