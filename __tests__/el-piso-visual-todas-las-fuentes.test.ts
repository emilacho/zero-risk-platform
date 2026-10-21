/**
 * ENCARGO manual visual con todas las fuentes · T3 · `[BB] Piso visual` trabaja con TODO lo real y propio, con procedencia.
 * Los 4 casos en seco del encargo: solo Instagram (df7e47cc), solo web, web + Instagram (Náufrago) y sin nada. A costo cero: el modelo se simula; el código del nodo es el real.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { identidadVisualDelCliente } from '../src/lib/oficina/identidad-visual'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'ssLtwYPt7zxuvnM2')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = require(join(DIR, 'piso-visual-logica.js'))
const { derivarPisoVisualTodasLasFuentes: derivar, elegirMaterialPropio, declaradosDelCliente, armarPedidoTodasLasFuentes, paraElManual, MAX_FOTOS_A_MIRAR } = L

type Copia = { post_id: string; tipo: string; url: string | null; estado: string; causa?: string | null; handle: string; medio?: string | null; posted_at?: string | null; owner_role?: string }
const logo = (handle: string, extra: Partial<Copia> = {}): Copia => ({ post_id: 'logo-hd', tipo: 'logo_hd', url: `https://copia.test/${handle}/logo.jpg`, estado: 'ok', handle, medio: 'logo', owner_role: 'propio', ...extra })
const foto = (handle: string, n: number, extra: Partial<Copia> = {}): Copia => ({ post_id: `${handle}-p${n}`, tipo: 'post_image', url: `https://copia.test/${handle}/p${n}.jpg`, estado: 'ok', handle, medio: 'imagen', posted_at: `2026-10-${String(20 - n).padStart(2, '0')}T10:00:00Z`, owner_role: 'propio', ...extra })
const soloIG = (n = 10): Copia[] => [logo('zeroriskgye'), ...Array.from({ length: n }, (_, i) => foto('zeroriskgye', i + 1))]
const sitio = (colores: string[], tipografias: string[] = []) => ({ respuesta: [{ _visual: { colores, tipografias } }] })
const modelo = (cuerpo: unknown, brain_hit = false) => { const llamadas: Array<{ task: string; images: Array<{ url: string }> }> = []; return { llamadas, invocar: async (p: { task: string; images: Array<{ url: string }> }) => { llamadas.push(p); return { response: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), brain_hit } } } }
const PRODUCTO = { capa_producto: { luz: 'natural' }, reglas: { debe: ['a', 'b', 'c'], no_debe: ['d', 'e'] } }

describe('caso 1 · SOLO INSTAGRAM (df7e47cc: sin sitio, sin colores declarados)', () => {
  it('🔴 lo observado en el logo y las fotos entra como PROPUESTA con su procedencia; el estado es completo y el manual recibe sus columnas', async () => {
    const m = modelo({ capa_grafica: { paleta: [], tipografias: [], colores_observados: [{ color: '#C8102E', rol: 'principal', donde: 'logo' }, { color: '#1a1a1a', rol: 'secundario', donde: 'foto 2' }], tipografias_observadas: [{ nombre: 'Bebas Neue', rol: 'titulos', donde: 'logo' }] }, ...PRODUCTO })
    const v = await derivar({ filaSitio: null, ficha: { brand_colors: null, brand_fonts: null }, copias: soloIG() }, m.invocar)
    expect(v.estado).toBe('completo'); expect(v.motivo).toBeNull(); expect(v.version).toBe(2)
    expect(v.capa_grafica.paleta).toEqual([
      { color: '#c8102e', rol: 'principal', procedencia: 'observado en logo', estado: 'propuesta' },
      { color: '#1a1a1a', rol: 'secundario', procedencia: 'observado en foto 2', estado: 'propuesta' },
    ])
    expect(v.capa_grafica.tipografias).toEqual([{ nombre: 'Bebas Neue', rol: 'titulos', procedencia: 'observado en logo', estado: 'propuesta' }])
    expect(v.capa_grafica.logo_url).toBe('https://copia.test/zeroriskgye/logo.jpg')
    expect(v.capa_grafica.logo_procedencia).toContain('zeroriskgye')
    expect(v.para_el_manual.primary_colors[0]).toEqual({ hex: '#c8102e', rol: 'principal', procedencia: 'observado en logo', estado: 'propuesta' })
    expect(v.para_el_manual.typography[0]).toMatchObject({ family: 'Bebas Neue', estado: 'propuesta' })
    expect(v.capa_producto).toEqual({ luz: 'natural' })
  })
  it('el pedido pide colores y tipografías observados SOLO porque el cliente no declara, y va en tuteo', async () => {
    const m = modelo({ capa_grafica: {}, ...PRODUCTO })
    await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, m.invocar)
    const t = m.llamadas[0].task
    expect(t).toContain('colores_observados'); expect(t).toContain('tipografias_observadas'); expect(t).toContain('PROPUESTA')
    expect(t).toMatch(/Eres un director de arte/); expect(t).not.toMatch(/\bSos\b|Respondé|Describí|Vas a mirar fotos reales del negocio y vas a|vos\b/)
    expect(m.llamadas[0].images.length).toBe(1 + MAX_FOTOS_A_MIRAR) // logo + 6 fotos
    expect(m.llamadas[0].images.every((i) => i.url.startsWith('https://copia.test/'))).toBe(true) // nuestras copias
  })
  it('lo observado se limita: hex válidos, sin repetidos, máximo 5; lo que no es un color no entra', async () => {
    const obs = ['#111111', '#111111', 'rojo', '#12345', '#222222', '#333333', '#444444', '#555555', '#666666'].map((c) => ({ color: c, rol: 'acento', donde: 'logo' }))
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, modelo({ capa_grafica: { colores_observados: obs }, ...PRODUCTO }).invocar)
    expect(v.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#111111', '#222222', '#333333', '#444444', '#555555'])
  })
  it('si el modelo no ve colores, el estado es parcial y lo dice (nunca «bueno»)', async () => {
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, modelo({ capa_grafica: { colores_observados: [] }, ...PRODUCTO }).invocar)
    expect(v.estado).toBe('parcial'); expect(v.motivo).toContain('sin colores')
  })
})

describe('caso 2 · SOLO WEB (sitio con hoja de estilo, sin redes)', () => {
  it('lo declarado entra SIN llamar al modelo (no hay material para mirar): parcial, con motivo claro y procedencia «sitio»', async () => {
    const m = modelo({})
    const v = await derivar({ filaSitio: sitio(['#1A0828', '#51D4B4'], ['Inter']), ficha: null, copias: [] }, m.invocar)
    expect(m.llamadas).toHaveLength(0)
    expect(v.estado).toBe('parcial'); expect(v.motivo).toContain('sin logo ni fotos propias')
    expect(v.capa_grafica.paleta).toEqual([
      { color: '#1a0828', rol: null, procedencia: 'sitio:hoja_de_estilo', estado: 'declarado' },
      { color: '#51d4b4', rol: null, procedencia: 'sitio:hoja_de_estilo', estado: 'declarado' },
    ])
    expect(v.para_el_manual.primary_colors.map((c: { hex: string }) => c.hex)).toEqual(['#1a0828', '#51d4b4'])
    expect(v.para_el_manual.typography[0]).toMatchObject({ family: 'Inter', estado: 'declarado' })
  })
})

describe('caso 3 · WEB + INSTAGRAM (Náufrago: el camino con sitio da lo mismo o mejor)', () => {
  const declarados = sitio(['#1a0828', '#663772', '#51d4b4'], ['Caveat', 'Inter'])
  it('lo declarado manda: el pedido NO pide colores observados y el modelo solo asigna roles a lo declarado', async () => {
    const m = modelo({ capa_grafica: { paleta: [{ color: '#1a0828', rol: 'principal' }, { color: '#51d4b4', rol: 'acento' }], tipografias: [{ nombre: 'Caveat', rol: 'titulos' }] }, ...PRODUCTO })
    const v = await derivar({ filaSitio: declarados, ficha: null, copias: soloIG(4) }, m.invocar)
    expect(m.llamadas[0].task).not.toContain('colores_observados'); expect(m.llamadas[0].task).not.toContain('tipografias_observadas')
    expect(v.estado).toBe('completo')
    expect(v.capa_grafica.paleta.map((p: { color: string; rol: string | null; estado: string }) => [p.color, p.rol, p.estado])).toEqual([['#1a0828', 'principal', 'declarado'], ['#663772', null, 'declarado'], ['#51d4b4', 'acento', 'declarado']])
    expect(v.capa_grafica.tipografias.map((t: { nombre: string; rol: string | null }) => [t.nombre, t.rol])).toEqual([['Caveat', 'titulos'], ['Inter', null]])
  })
  it('🔴 un color o tipografía que el modelo cuele y el cliente NO declaró no entra (ni como propuesta cuando hay declarados)', async () => {
    const v = await derivar({ filaSitio: declarados, ficha: null, copias: soloIG(4) }, modelo({ capa_grafica: { paleta: [{ color: '#ff0000', rol: 'principal' }], colores_observados: [{ color: '#00ff00', rol: 'acento', donde: 'logo' }], tipografias: [{ nombre: 'Comic Sans', rol: 'cuerpo' }], tipografias_observadas: [{ nombre: 'Papyrus', donde: 'logo' }] }, ...PRODUCTO }).invocar)
    expect(v.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#1a0828', '#663772', '#51d4b4'])
    expect(v.capa_grafica.tipografias.map((t: { nombre: string }) => t.nombre)).toEqual(['Caveat', 'Inter'])
    expect(v.capa_grafica.paleta.every((p: { estado: string }) => p.estado === 'declarado')).toBe(true)
  })
  it('la ficha también declara: sus colores entran (sin repetir los del sitio) con procedencia «ficha»', () => {
    const d = declaradosDelCliente(declarados, { brand_colors: ['#51D4B4', '#ffffff'], brand_fonts: ['Inter', 'Lobster'] })
    expect(d.colores).toEqual([{ valor: '#1a0828', procedencia: 'sitio:hoja_de_estilo' }, { valor: '#663772', procedencia: 'sitio:hoja_de_estilo' }, { valor: '#51d4b4', procedencia: 'sitio:hoja_de_estilo' }, { valor: '#ffffff', procedencia: 'ficha' }])
    expect(d.tipografias.map((t: { valor: string; procedencia: string }) => [t.valor, t.procedencia])).toEqual([['Caveat', 'sitio:hoja_de_estilo'], ['Inter', 'sitio:hoja_de_estilo'], ['Lobster', 'ficha']])
  })
  it('colores de la ficha en objeto ({hex}) o inválidos: se leen los válidos', () => {
    const d = declaradosDelCliente(null, { brand_colors: [{ hex: '#ABCDEF' }, 'azul', '#12', { color: '#123456' }], brand_fonts: [{ family: 'Poppins' }, '', { name: 'Lato' }] })
    expect(d.colores.map((c: { valor: string }) => c.valor)).toEqual(['#abcdef', '#123456'])
    expect(d.tipografias.map((t: { valor: string }) => t.valor)).toEqual(['Poppins', 'Lato'])
  })
})

describe('caso 4 · SIN NADA', () => {
  it('🔴 visual AUSENTE con motivo explícito, cero llamadas al modelo, y la compuerta puede leerlo', async () => {
    const m = modelo({})
    const v = await derivar({ filaSitio: null, ficha: null, copias: [] }, m.invocar)
    expect(m.llamadas).toHaveLength(0)
    expect(v.estado).toBe('ausente'); expect(v.motivo).toMatch(/visual ausente/); expect(v.nota).toMatch(/sin material visual propio/)
    expect(v.para_el_manual).toEqual({ primary_colors: [], typography: [] })
    expect(v.capa_grafica.paleta).toEqual([])
  })
})

describe('el material: solo lo PROPIO, de cualquier cuenta, sin videos ni competidores', () => {
  it('🔴 una copia que NO está «ok» pero trae URL no se envía al modelo (la URL remota de Instagram que el modelo no puede abrir)', async () => {
    const m = modelo({ capa_grafica: {}, ...PRODUCTO })
    const copias = [logo('zeroriskgye', { estado: 'no_bajo', url: 'https://instagram.fake/logo.jpg' }), foto('zeroriskgye', 1, { estado: 'no_bajo', url: 'https://instagram.fake/p1.jpg' }), foto('zeroriskgye', 2)]
    await derivar({ filaSitio: null, ficha: null, copias }, m.invocar)
    expect(m.llamadas[0].images.map((i) => i.url)).toEqual(['https://copia.test/zeroriskgye/p2.jpg'])
    expect(elegirMaterialPropio(copias, 6).logo).toBeNull()
  })
  it('🔴 el tope de tipografías observadas es 3', async () => {
    const obs = ['Bebas Neue', 'Lobster', 'Poppins', 'Anton', 'Oswald'].map((nombre) => ({ nombre, rol: 'titulos', donde: 'logo' }))
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, modelo({ capa_grafica: { tipografias_observadas: obs }, ...PRODUCTO }).invocar)
    expect(v.capa_grafica.tipografias.map((t: { nombre: string }) => t.nombre)).toEqual(['Bebas Neue', 'Lobster', 'Poppins'])
  })
  it('🔴 el modelo devuelve el color del rol en MAYÚSCULAS y el rol igual se asigna al color declarado', async () => {
    const v = await derivar({ filaSitio: sitio(['#1a0828', '#51d4b4']), ficha: null, copias: soloIG(2) }, modelo({ capa_grafica: { paleta: [{ color: '#1A0828', rol: 'principal' }, { color: '#51D4B4', rol: 'acento' }] }, ...PRODUCTO }).invocar)
    expect(v.capa_grafica.paleta.map((p: { color: string; rol: string | null }) => [p.color, p.rol])).toEqual([['#1a0828', 'principal'], ['#51d4b4', 'acento']])
  })
  it('excluye competidores, copias que no se bajaron, sin URL y videos; el logo hd gana', () => {
    const copias: Copia[] = [
      foto('rival', 1, { owner_role: 'competidor' }), foto('zeroriskgye', 1), foto('zeroriskgye', 2, { estado: 'no_bajo', url: null, causa: '403' }), foto('zeroriskgye', 3, { medio: 'video' }),
      { ...logo('zeroriskgye'), post_id: 'logo-pequeno', tipo: 'logo', url: 'https://copia.test/chico.jpg' }, logo('zeroriskgye'),
    ]
    const m = elegirMaterialPropio(copias, 6)
    expect(m.logo.url).toBe('https://copia.test/zeroriskgye/logo.jpg')
    expect(m.fotos.map((f: Copia) => f.post_id)).toEqual(['zeroriskgye-p1'])
    expect(m.fotos_disponibles).toBe(1)
  })
  it('una copia marcada «ok» pero sin URL no cuenta (no hay nada que mirar)', () => {
    const m = elegirMaterialPropio([foto('zeroriskgye', 1, { url: null }), foto('zeroriskgye', 2), logo('zeroriskgye', { url: null })], 6)
    expect(m.fotos.map((f: Copia) => f.post_id)).toEqual(['zeroriskgye-p2'])
    expect(m.logo).toBeNull()
  })
  it('reparte el cupo entre las cuentas propias (una por cuenta en cada vuelta), las más recientes primero', () => {
    const copias = [...Array.from({ length: 5 }, (_, i) => foto('instagram_a', i + 1)), ...Array.from({ length: 5 }, (_, i) => foto('facebook_b', i + 1))]
    const m = elegirMaterialPropio(copias, 4)
    expect(m.fotos.map((f: Copia) => f.post_id)).toEqual(['instagram_a-p1', 'facebook_b-p1', 'instagram_a-p2', 'facebook_b-p2'])
    expect(m.cuentas).toEqual(['instagram_a', 'facebook_b'])
  })
  it('el tope se respeta y la muestra declara lo que no se miró', async () => {
    const v = await derivar({ filaSitio: sitio(['#111111']), ficha: null, copias: soloIG(10) }, modelo({ capa_grafica: {}, ...PRODUCTO }).invocar)
    expect(v.muestra.fotos_miradas).toBe(6); expect(v.muestra.fotos_disponibles).toBe(10); expect(v.muestra.con_logo).toBe(true)
    expect(v.muestra.no_observado.join(' | ')).toMatch(/4 fotos propias disponibles no se miraron/)
    expect(v.muestra.no_observado.join(' | ')).toMatch(/competidores excluido/)
  })
})

describe('fallos: nunca calla un hueco ni pierde lo declarado', () => {
  it('R5: si el recibo delata brain_hit:true, se descarta lo del modelo pero lo DECLARADO queda; estado parcial', async () => {
    const v = await derivar({ filaSitio: sitio(['#1a0828']), ficha: null, copias: soloIG(2) }, modelo({ capa_grafica: { colores_observados: [{ color: '#ff0000' }] }, ...PRODUCTO }, true).invocar)
    expect(v.brain_hit).toBe(true); expect(v.error).toMatch(/R5/)
    expect(v.capa_producto).toBeNull(); expect(v.reglas).toBeNull()
    expect(v.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#1a0828'])
    expect(v.estado).toBe('parcial')
  })
  it('respuesta no legible: lo declarado queda, error declarado, parcial', async () => {
    const v = await derivar({ filaSitio: sitio(['#1a0828']), ficha: null, copias: soloIG(2) }, modelo('prosa sin JSON').invocar)
    expect(v.legible).toBe(false); expect(v.error).toMatch(/RESPUESTA_NO_LEGIBLE/); expect(v.estado).toBe('parcial'); expect(v.motivo).toMatch(/no entregó la capa del producto/)
  })
  it('respuesta no legible y sin nada declarado: ausente, con el motivo', async () => {
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG(2) }, modelo('prosa sin JSON').invocar)
    expect(v.estado).toBe('ausente'); expect(v.motivo).toMatch(/visual ausente/)
  })
})

describe('lo que recibe el manual', () => {
  it('paraElManual: colores como {hex, rol, procedencia, estado} y tipografías como {family, …}', () => {
    expect(paraElManual({ paleta: [{ color: '#111111', rol: 'principal', procedencia: 'sitio:hoja_de_estilo', estado: 'declarado' }], tipografias: [{ nombre: 'Inter', rol: null, procedencia: 'ficha', estado: 'declarado' }] }))
      .toEqual({ primary_colors: [{ hex: '#111111', rol: 'principal', procedencia: 'sitio:hoja_de_estilo', estado: 'declarado' }], typography: [{ family: 'Inter', rol: null, procedencia: 'ficha', estado: 'declarado' }] })
  })
  it('lo que escribe el piso (objetos {hex, rol…} y {family, rol…}) lo lee la oficina de láminas: prueba de comportamiento, no de texto', () => {
    const escrito = paraElManual({ paleta: [{ color: '#222222', rol: 'secundario', procedencia: 'logo', estado: 'propuesta' }, { color: '#111111', rol: 'principal', procedencia: 'logo, foto 1', estado: 'propuesta' }], tipografias: [{ nombre: 'Inter', rol: 'cuerpo', procedencia: 'logo', estado: 'propuesta' }, { nombre: 'Caveat', rol: 'titulos', procedencia: 'logo', estado: 'propuesta' }] })
    const m = identidadVisualDelCliente({ primary_colors: escrito.primary_colors, typography: escrito.typography }, {}, [])
    expect(m.marca?.colors).toMatchObject({ primary: '#111111', secondary: '#222222' })
    expect(m.marca?.fonts).toMatchObject({ family: 'Inter', headline_family: 'Caveat' })
    expect(m.procedencia).toMatchObject({ colores: 'manual', tipografias: 'manual' })
  })
  it('y el bloque visual v2 completo (sin columnas) también lo lee la oficina: colores, tipografía y logo del bloque', async () => {
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, modelo({ capa_grafica: { colores_observados: [{ color: '#c8102e', rol: 'principal', donde: 'logo' }], tipografias_observadas: [{ nombre: 'Bebas Neue', rol: 'titulos', donde: 'logo' }] }, ...PRODUCTO }).invocar)
    const r = identidadVisualDelCliente({ primary_colors: [], typography: {}, content_text: JSON.stringify({ brand_book_draft: { visual: v } }) }, {}, [])
    expect(r.marca?.colors.primary).toBe('#c8102e'); expect(r.marca?.fonts.family).toBe('Bebas Neue'); expect(r.marca?.logo_url).toBe('https://copia.test/zeroriskgye/logo.jpg')
    expect(r.procedencia).toMatchObject({ colores: 'bloque_visual', tipografias: 'bloque_visual', logo: 'bloque_visual' })
  })
  it('el pedido pide solo lo que falta (con colores declarados no pide colores; sí tipografías si no hay)', () => {
    const p = armarPedidoTodasLasFuentes({ colores: [{ valor: '#111111', procedencia: 'ficha' }], tipografias: [] }, { logo: null, fotos: [], fotos_disponibles: 0, cuentas: [] })
    expect(p.pide_colores).toBe(false); expect(p.pide_tipografias).toBe(true)
    expect(p.task).not.toContain('colores_observados'); expect(p.task).toContain('tipografias_observadas'); expect(p.task).toContain('No hay logo disponible')
  })
})

// ── el nodo REAL (lógica + pegamento) con la base y el modelo simulados ──────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const constructor_: any = await import(pathToFileURL(join(DIR, 'construir-nodo-visual.mjs')).href)
async function correrNodo(o: { ficha?: Record<string, unknown>; sitio?: unknown; copias?: Copia[]; draft?: Record<string, unknown>; modelo?: unknown; falla?: string }) {
  const pedidos: Array<{ url: string; body?: Record<string, unknown> }> = []
  const helpers = {
    httpRequest: async (p: { url: string; body?: Record<string, unknown> }) => {
      pedidos.push({ url: p.url, body: p.body })
      if (o.falla && p.url.includes(o.falla)) throw new Error('base caída')
      if (p.url.includes('/rest/v1/clients?')) return [o.ficha ?? { config: {}, brand_colors: null, brand_fonts: null }]
      if (p.url.includes('apify_raw')) return o.sitio ? [o.sitio] : []
      if (p.url.includes('client_social_images')) return o.copias ?? []
      if (p.url.includes('/api/agents/run-sdk')) return { body: { response: JSON.stringify(o.modelo ?? { capa_grafica: {}, ...PRODUCTO }) } }
      throw new Error('url inesperada ' + p.url)
    },
  }
  const j = { fidelity: 'PASS', cycle: 2, brand_book_draft: o.draft ?? { positioning: 'x' } }
  const $ = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no ejecutado ' + n); return { first: () => ({ json: { client_id: 'cid-1' } }) } }
  const salida = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', constructor_.codigoDelNodo())
    .call({ helpers }, {}, $, { SUPABASE_SERVICE_ROLE_KEY: 'k', INTERNAL_API_KEY: 'i' }, j, { id: 'WF' }, { id: 'EX1' })
  return { json: salida[0].json, pedidos }
}

describe('el nodo real del cimiento: lógica + pegamento', () => {
  it('lee las copias propias de TODAS las cuentas (sin filtrar por el Instagram de la ficha) y la ficha con sus colores', async () => {
    const r = await correrNodo({ copias: soloIG(3) })
    const c = r.pedidos.find((p) => p.url.includes('client_social_images'))!
    expect(c.url).toContain('owner_role=eq.propio'); expect(c.url).not.toContain('handle=eq.')
    expect(r.pedidos.find((p) => p.url.includes('/rest/v1/clients?'))!.url).toContain('brand_colors,brand_fonts')
  })
  it('🔴 df7e47cc: el borrador sale con el bloque visual v2 y con primary_colors/typography coherentes (propuestas con procedencia)', async () => {
    const r = await correrNodo({ copias: soloIG(3), modelo: { capa_grafica: { colores_observados: [{ color: '#c8102e', rol: 'principal', donde: 'logo' }] }, ...PRODUCTO } })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.version).toBe(2); expect(d.visual.estado).toBe('completo')
    expect(d.primary_colors).toEqual([{ hex: '#c8102e', rol: 'principal', procedencia: 'observado en logo', estado: 'propuesta' }])
    expect(d.positioning).toBe('x') // el resto del borrador viaja intacto
    expect(r.json.fidelity).toBe('PASS'); expect(r.json.cycle).toBe(2)
  })
  it('nunca pisa lo que el borrador ya traía en primary_colors / typography', async () => {
    const r = await correrNodo({ copias: soloIG(3), draft: { primary_colors: ['#123456'], typography: ['Lato'] }, modelo: { capa_grafica: { colores_observados: [{ color: '#c8102e', donde: 'logo' }], tipografias_observadas: [{ nombre: 'Bebas Neue', donde: 'logo' }] }, ...PRODUCTO } })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.primary_colors).toEqual(['#123456']); expect(d.typography).toEqual(['Lato'])
    expect(d.visual.capa_grafica.paleta[0].color).toBe('#c8102e') // el bloque visual sí lleva lo suyo, con procedencia
  })
  it('solo web: sin copias no llama al modelo y deja lo declarado en el manual (parcial)', async () => {
    const r = await correrNodo({ sitio: sitio(['#1A0828'], ['Inter']), copias: [] })
    expect(r.pedidos.some((p) => p.url.includes('/api/agents/run-sdk'))).toBe(false)
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.estado).toBe('parcial'); expect(d.primary_colors[0]).toMatchObject({ hex: '#1a0828', estado: 'declarado' }); expect(d.typography[0]).toMatchObject({ family: 'Inter' })
  })
  it('los colores y tipografías de la ficha llegan al piso por el nodo (declarados, procedencia «ficha»)', async () => {
    const r = await correrNodo({ ficha: { config: {}, brand_colors: ['#0A0A0A'], brand_fonts: ['Lato'] }, copias: [] })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.capa_grafica.paleta).toEqual([{ color: '#0a0a0a', rol: null, procedencia: 'ficha', estado: 'declarado' }])
    expect(d.typography[0]).toMatchObject({ family: 'Lato', procedencia: 'ficha' })
  })
  it('sin nada: visual ausente + motivo, y no se escriben columnas vacías', async () => {
    const r = await correrNodo({ copias: [] })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.estado).toBe('ausente'); expect(d.visual.motivo).toMatch(/visual ausente/)
    expect('primary_colors' in d).toBe(false); expect('typography' in d).toBe(false)
  })
  it('R5: el cuerpo hacia run-sdk no manda client_id (ninguna prueba de percepción lleva cliente)', async () => {
    const r = await correrNodo({ copias: soloIG(2) })
    const llamada = r.pedidos.find((p) => p.url.includes('/api/agents/run-sdk'))!
    expect(Object.keys(llamada.body!)).not.toContain('client_id'); expect(llamada.body!.images_mode).toBe('base64')
  })
  it('🔴 si la base falla, el nodo NO para la corrida y deja un hueco DECLARADO (estado ausente + motivo), no un vacío callado', async () => {
    const r = await correrNodo({ copias: soloIG(2), falla: 'client_social_images' })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.estado).toBe('ausente'); expect(d.visual.motivo).toMatch(/el piso visual falló: base caída/); expect(d.visual.error).toMatch(/base caída/)
    expect(d.positioning).toBe('x')
  })
})

describe('la compuerta declara el hueco visual (no pasa como «bueno»)', () => {
  it('visual completo: no agrega nada a _field_meta', async () => {
    const r = await correrNodo({ copias: soloIG(3), modelo: { capa_grafica: { colores_observados: [{ color: '#c8102e', donde: 'logo' }] }, ...PRODUCTO }, draft: { positioning: 'x', _field_meta: { positioning: { estado: 'firme' } } } })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.estado).toBe('completo'); expect(d._field_meta).toEqual({ positioning: { estado: 'firme' } })
  })
  it('🔴 visual parcial → _field_meta.visual = provisional con el motivo; el resto de _field_meta se conserva', async () => {
    const r = await correrNodo({ sitio: sitio(['#1a0828']), copias: [], draft: { _field_meta: { positioning: { estado: 'firme' } } } })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d.visual.estado).toBe('parcial')
    expect(d._field_meta.visual).toEqual({ estado: 'provisional', motivo: d.visual.motivo }); expect(d._field_meta.positioning).toEqual({ estado: 'firme' })
  })
  it('🔴 visual ausente → _field_meta.visual = ausente (cae en campos_ausentes de Promote prep)', async () => {
    const r = await correrNodo({ copias: [] })
    const d = r.json.brand_book_draft as Record<string, any>
    expect(d._field_meta.visual.estado).toBe('ausente'); expect(d._field_meta.visual.motivo).toMatch(/visual ausente/)
  })
  it('si el piso falló por la base, también se declara ausente', async () => {
    const r = await correrNodo({ copias: soloIG(2), falla: 'client_social_images' })
    expect((r.json.brand_book_draft as Record<string, any>)._field_meta.visual.estado).toBe('ausente')
  })
  it('Promote prep ya arma campos_provisionales / campos_ausentes desde _field_meta (así llega al canon)', () => {
    const promote = readFileSync(join(DIR, 'cimiento-ANTES-piso-todas-las-fuentes-2026-10-21.json'), 'utf8')
    expect(promote).toContain('campos_provisionales: Object.keys(draft._field_meta || {})'); expect(promote).toContain('campos_ausentes: Object.keys(draft._field_meta || {})')
  })
})

describe('lo observado: solo nombres de tipografía reales y procedencias limpias (caso real df7e47cc, 21-oct)', () => {
  const { nombreDeTipografiaObservada, procedenciaDeLoObservado } = L
  it.each([
    ['Bebas Neue', 'Bebas Neue'], ['Open Sans', 'Open Sans'], ['Montserrat-Bold', 'Montserrat-Bold'], ['Alfa Slab One', 'Alfa Slab One'], ['  Lato  ', 'Lato'],
    ['Impact o condensed sans-serif bold', null], ['no reconocida con claridad', null], ['No se puede identificar', null], ['desconocida', null], ['Helvetica, Arial', null],
    ['Arial/Helvetica', null], ['similar a Impact', null], ['tipo condensed', null], ['genérica sans', null], ['N/A', null], ['Ninguna', null], ['', null], [null, null],
    ['Aaaaaaaaaaaa Bbbbbbbbbbbbb Cccccccccccc Dddddddddddd', null], ['Roboto 700 (bold) italic!', null],
  ])('nombre %j → %j', (entrada, esperado) => { expect(nombreDeTipografiaObservada(entrada)).toBe(esperado) })
  it.each([
    ['logo, foto 1, foto 2, foto 3, foto 4, foto 5', 'observado en logo, foto 1, foto 2, foto 3'],
    ['foto 1 (VENTA, RECARGA Y MANTENIMIENTO DE EXTINTORES zeroriskventas@gmail.com 0988941234)', 'observado en foto 1'],
    ['Logo', 'observado en logo'], ['foto1 y foto 1 y foto 2', 'observado en foto 1, foto 2'], ['el cartel de la entrada', 'observado en el material propio'], [undefined, 'observado en el material propio'],
  ])('procedencia %j → %j', (donde, esperado) => { expect(procedenciaDeLoObservado(donde)).toBe(esperado) })
  it('🔴 el caso real: el modelo propone una tipografía descrita y otra «no reconocida» → NINGUNA entra; los colores traen procedencia corta', async () => {
    const m = modelo({ capa_grafica: { colores_observados: [{ color: '#ff5a1a', rol: 'principal', donde: 'logo, foto 1, foto 2, foto 3, foto 4, foto 5, foto 6' }], tipografias_observadas: [{ nombre: 'Impact o condensed sans-serif bold', rol: 'titulos', donde: 'foto 1 (VENTA, RECARGA)' }, { nombre: 'no reconocida con claridad', rol: 'cuerpo', donde: 'foto 1 (zeroriskventas@gmail.com, 098894)' }] }, ...PRODUCTO })
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, m.invocar)
    expect(v.capa_grafica.tipografias).toEqual([])
    expect(v.para_el_manual.typography).toEqual([])
    expect(v.capa_grafica.paleta[0].procedencia).toBe('observado en logo, foto 1, foto 2, foto 3')
  })
  it('una tipografía observada real entra con procedencia corta; la basura se descarta sin tapar a la buena', async () => {
    const v = await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, modelo({ capa_grafica: { colores_observados: [{ color: '#111111', donde: 'logo' }], tipografias_observadas: [{ nombre: 'no reconocida', donde: 'logo' }, { nombre: 'Bebas Neue', rol: 'titulos', donde: 'logo (BEBAS, tel 099)' }] }, ...PRODUCTO }).invocar)
    expect(v.capa_grafica.tipografias).toEqual([{ nombre: 'Bebas Neue', rol: 'titulos', procedencia: 'observado en logo', estado: 'propuesta' }])
  })
})

describe('actualizar el nodo ya instalado (ajuste de tipografía y procedencia)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = await import(pathToFileURL(join(DIR, 'construir-piso-todas-las-fuentes.mjs')).href)
  const ANTES2 = JSON.parse(readFileSync(join(DIR, 'cimiento-ANTES-piso-tipografia-procedencia-2026-10-21.json'), 'utf8'))
  it('el vivo de ANTES ya trabaja con todas las fuentes pero NO tiene el filtro nuevo; el actualizado sí, y solo cambia ese nodo', () => {
    const nodo = (w: { nodes: Array<{ name: string; parameters: { jsCode: string } }> }) => w.nodes.find((n) => n.name === B.NODO)!.parameters.jsCode
    expect(nodo(ANTES2)).toContain('derivarPisoVisualTodasLasFuentes('); expect(nodo(ANTES2)).not.toContain('nombreDeTipografiaObservada')
    const nuevo = B.actualizarPisoTodasLasFuentes(ANTES2)
    expect(nodo(nuevo)).toContain('nombreDeTipografiaObservada'); expect(nodo(nuevo)).toContain('procedenciaDeLoObservado')
    expect(nuevo.nodes.filter((n: { name: string }, i: number) => JSON.stringify(n) !== JSON.stringify(ANTES2.nodes[i])).map((n: { name: string }) => n.name)).toEqual([B.NODO])
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(ANTES2.connections))
  })
  it('se niega a actualizar dos veces, y a «aplicar» sobre un nodo que ya trabaja con todas las fuentes', () => {
    expect(() => B.actualizarPisoTodasLasFuentes(B.actualizarPisoTodasLasFuentes(ANTES2))).toThrow(/ya tiene este código/)
    expect(() => B.aplicarPisoTodasLasFuentes(ANTES2)).toThrow(/ya trabaja con todas las fuentes/)
  })
})

describe('marca ajena vista en foto (corrección de Emilio 21-oct 20:55)', () => {
  const ajena = (donde: string, descripcion = 'logo de un proveedor') => ({ donde, descripcion })
  const corre = (cuerpo: object, copias = soloIG(4)) => derivar({ filaSitio: null, ficha: null, copias }, modelo({ capa_grafica: {}, ...PRODUCTO, ...cuerpo }).invocar)
  it('🔴 foto propia con logo ajeno: el color del logo ajeno NO entra a la paleta y queda declarado «marca ajena vista en foto»; el del logo propio sí', async () => {
    const v = await corre({ marcas_ajenas_vistas: [ajena('foto 2')], capa_grafica: { colores_observados: [{ color: '#ff5a1a', rol: 'principal', donde: 'logo' }, { color: '#00ff00', rol: 'acento', donde: 'foto 2' }] } })
    expect(v.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#ff5a1a'])
    expect(v.marcas_ajenas).toEqual([{ donde: 'foto 2', descripcion: 'logo de un proveedor' }])
    expect(v.descartados_por_marca_ajena).toEqual([{ tipo: 'color', valor: '#00ff00', donde: 'foto 2' }])
    expect(v.muestra.no_observado).toContain('marca ajena vista en foto 2: logo de un proveedor')
  })
  it('un color visto en el LOGO propio se conserva aunque también aparezca en una foto con marca ajena', async () => {
    const v = await corre({ marcas_ajenas_vistas: [ajena('foto 2')], capa_grafica: { colores_observados: [{ color: '#ff5a1a', donde: 'logo, foto 2' }] } })
    expect(v.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#ff5a1a'])
    expect(v.descartados_por_marca_ajena).toEqual([])
  })
  it('un color de una foto SIN marca ajena se conserva (las fotos propias siguen sirviendo)', async () => {
    const v = await corre({ marcas_ajenas_vistas: [ajena('foto 2')], capa_grafica: { colores_observados: [{ color: '#123456', donde: 'foto 1' }] } })
    expect(v.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#123456'])
  })
  it('un color con varias fotos donde UNA es de la marca ajena se descarta (no se puede atribuir a la marca)', async () => {
    const v = await corre({ marcas_ajenas_vistas: [ajena('foto 3')], capa_grafica: { colores_observados: [{ color: '#123456', donde: 'foto 1, foto 3' }] } })
    expect(v.capa_grafica.paleta).toEqual([]); expect(v.descartados_por_marca_ajena[0]).toMatchObject({ valor: '#123456' })
  })
  it('si hay marca ajena declarada, un color sin «donde» claro tampoco entra; sin marca ajena, sí entra', async () => {
    const con = await corre({ marcas_ajenas_vistas: [ajena('foto 2')], capa_grafica: { colores_observados: [{ color: '#123456', donde: 'el cartel' }] } })
    expect(con.capa_grafica.paleta).toEqual([])
    const sin = await corre({ marcas_ajenas_vistas: [], capa_grafica: { colores_observados: [{ color: '#123456', donde: 'el cartel' }] } })
    expect(sin.capa_grafica.paleta.map((p: { color: string }) => p.color)).toEqual(['#123456']); expect(sin.marcas_ajenas).toEqual([])
  })
  it('lo mismo con las tipografías: la letra de una foto con marca ajena no entra; la del logo propio sí', async () => {
    const v = await corre({ marcas_ajenas_vistas: [ajena('foto 1')], capa_grafica: { tipografias_observadas: [{ nombre: 'Lobster', donde: 'foto 1' }, { nombre: 'Bebas Neue', donde: 'logo' }] } })
    expect(v.capa_grafica.tipografias.map((t: { nombre: string }) => t.nombre)).toEqual(['Bebas Neue'])
    expect(v.descartados_por_marca_ajena).toEqual([{ tipo: 'tipografia', valor: 'Lobster', donde: 'foto 1' }])
  })
  it('la declaración se lee dentro de capa_grafica también; se limita a 6, con descripción ≤120 y sin entradas rotas', async () => {
    const largas = Array.from({ length: 8 }, (_, i) => ajena('foto ' + (i + 1), 'x'.repeat(200)))
    const v = await corre({ marcas_ajenas_vistas: undefined, capa_grafica: { marcas_ajenas_vistas: [...largas, null, 'texto'], colores_observados: [] } })
    expect(v.marcas_ajenas).toHaveLength(6); expect(v.marcas_ajenas[0].descripcion).toHaveLength(120)
  })
  it('el pedido al modelo pide separar las marcas de terceros y que la paleta salga del logo propio', async () => {
    const m = modelo({ capa_grafica: {}, ...PRODUCTO })
    await derivar({ filaSitio: null, ficha: null, copias: soloIG() }, m.invocar)
    const t = m.llamadas[0].task
    expect(t).toContain('marcas_ajenas_vistas'); expect(t).toMatch(/TERCEROS/); expect(t).toMatch(/colaboradores, competidores, proveedores/); expect(t).toMatch(/sale sobre todo del LOGO propio/)
  })
  it('numerosDeFoto lee «foto1», «foto 2», sin repetir', () => { expect(L.numerosDeFoto('Logo, foto1, foto 2, FOTO 2')).toEqual([1, 2]); expect(L.numerosDeFoto(undefined)).toEqual([]) })
})
