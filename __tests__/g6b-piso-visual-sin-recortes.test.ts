/**
 * 19-nov · G6b · el piso visual del manual sin recortes (firma de Emilio «nada se recorta», 18-nov · GO de Lenovo 04:30Z).
 * El flujo nuevo sale del VIVO con solo los reemplazos declarados (`scripts/worker-staging/g6b-piso-visual/reemplazos.cjs`).
 * La conducta se prueba sobre la lógica pura del nodo NUEVO (sin red, US$ 0): fotos 20 (19 con logo), lo declarado entero, el plazo al máximo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MAX_IMAGENES } from '@/lib/imagenes-del-pedido'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/g6b-piso-visual')
const ID = 'ssLtwYPt7zxuvnM2'
type Nodo = { name: string; parameters?: { jsCode?: string } & Record<string, unknown> } & Record<string, unknown>
type Flujo = { nodes: Nodo[] } & Record<string, unknown>
const leer = (c: string): Flujo => JSON.parse(fs.readFileSync(path.join(DIR, c, `${ID}.json`), 'utf8'))
const { construir, NODO } = createRequire(import.meta.url)(path.join(DIR, 'reemplazos.cjs')) as { construir: (w: Flujo) => { w: Flujo }; NODO: string }
const codigo = (f: Flujo) => String(f.nodes.find((n) => n.name === NODO)!.parameters!.jsCode)

type Logica = {
  elegirMaterialPropio: (copias: unknown[], tope: number) => { logo: unknown; fotos: unknown[]; fotos_disponibles: number }
  derivarPisoVisualTodasLasFuentes: (ctx: unknown, invocar: (p: { task: string; images: unknown[] }) => Promise<{ response: string; brain_hit: boolean }>) => Promise<Record<string, any>>
  MAX_FOTOS_A_MIRAR: number
}
/** la lógica pura del nodo (lo que va ANTES del cuerpo, que llama a la base y al modelo) */
const logica = (f: Flujo): Logica => {
  const src = codigo(f).split('// ═══ CUERPO DEL NODO')[0]
  return new Function(`${src}\nreturn { elegirMaterialPropio, derivarPisoVisualTodasLasFuentes, MAX_FOTOS_A_MIRAR }`)() as Logica
}
const copias = (n: number, logo: boolean) => [
  ...(logo ? [{ post_id: 'logo-hd', tipo: 'logo_hd', url: 'https://x/logo.jpg', estado: 'ok', handle: 'propia', owner_role: 'propio' }] : []),
  ...Array.from({ length: n }, (_, i) => ({ post_id: `p${i}`, tipo: 'post', url: `https://x/${i}.jpg`, estado: 'ok', handle: 'propia', medio: 'imagen', posted_at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, owner_role: 'propio' })),
]

describe('G6b · el flujo nuevo', () => {
  it('se reconstruye igual desde el vivo (solo los reemplazos declarados)', () => {
    expect(construir(leer('vivo')).w).toEqual(leer('nuevo'))
  })
  it('fuera del nodo del piso visual, el flujo nuevo es IGUAL al vivo', () => {
    const sin = (f: Flujo) => ({ ...f, nodes: f.nodes.map((n) => (n.name === NODO ? { ...n, parameters: { ...n.parameters, jsCode: undefined } } : n)) })
    expect(sin(leer('nuevo'))).toEqual(sin(leer('vivo')))
  })
  it('el código nuevo compila y no le queda ningún recorte (solo la fecha a 10: AAAA-MM-DD)', () => {
    const c = codigo(leer('nuevo'))
    expect(() => new Function(`return (async function(){${c}\n})`)).not.toThrow()
    const cortes = c.match(/\.slice\(0, \d+\)|\.substring\(0, \d+\)/g) ?? []
    expect(cortes.every((x) => x === '.slice(0, 10)')).toBe(true)
    expect(codigo(leer('vivo')).match(/\.slice\(0, (6|4|20|120|250|300)\)/g)?.length).toBeGreaterThan(0)
  })
})

describe('G6b · el plazo de la llamada al modelo', () => {
  it('🔴 800 s: el máximo de run-sdk (maxDuration 800; corta a los 790 y su 504 llega al nodo · 🟡 de CC7) · antes 300', () => {
    const ruta = fs.readFileSync(path.join(process.cwd(), 'src/app/api/agents/run-sdk/route.ts'), 'utf8')
    const maxDuration = Number(/export const maxDuration = (\d+)/.exec(ruta)![1])
    const plazo = Number(/run-sdk',\s*\n?\s*(?:\/\/[^\n]*\n\s*)*method: 'POST', json: true, timeout: (\d+)/.exec(codigo(leer('nuevo')))![1])
    expect(plazo).toBe(maxDuration * 1000)
    expect(plazo).toBeGreaterThan(790_000)
    expect(codigo(leer('vivo'))).toContain("method: 'POST', json: true, timeout: 300000,")
  })
})

describe('G6b · las fotos', () => {
  it('🔴 el tope por pedido del nodo es el de run-sdk', () => {
    expect(codigo(leer('nuevo'))).toContain(`var MAX_IMAGENES_POR_PEDIDO = ${MAX_IMAGENES}`)
    expect(logica(leer('nuevo')).MAX_FOTOS_A_MIRAR).toBe(MAX_IMAGENES)
  })
  it('🔴 sin logo mira 20 fotos; con logo, 19 (el logo ocupa una de las 20 imágenes) · antes 6', () => {
    const L = logica(leer('nuevo'))
    expect(L.elegirMaterialPropio(copias(30, false), L.MAX_FOTOS_A_MIRAR).fotos.length).toBe(20)
    expect(L.elegirMaterialPropio(copias(30, true), L.MAX_FOTOS_A_MIRAR).fotos.length).toBe(19)
    expect(L.elegirMaterialPropio(copias(8, true), L.MAX_FOTOS_A_MIRAR).fotos.length).toBe(8)
    const V = logica(leer('vivo'))
    expect(V.elegirMaterialPropio(copias(30, true), V.MAX_FOTOS_A_MIRAR).fotos.length).toBe(6)
  })
  it('🔴 (s5 de CC7) el camino viejo `elegirFotos` también descuenta el logo: nunca pide 21 imágenes', () => {
    const c = codigo(leer('nuevo'))
    expect(c).toContain('var fotosElegidas = elegirFotos(clasif.foto, cupoDeFotos(MAX_FOTOS_A_MIRAR, !!logoOriginal))')
    const cupo = new Function(`${c.split('// ═══ CUERPO DEL NODO')[0]}\nreturn cupoDeFotos`)() as (t: number, l: boolean) => number
    expect(cupo(20, true)).toBe(19)
    expect(cupo(20, false)).toBe(20)
    expect(cupo(50, false)).toBe(MAX_IMAGENES)
  })
})

describe('G6b · de punta a punta en la lógica (modelo falso)', () => {
  const colores = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888']
  const fuentes = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis']
  const ajenas = Array.from({ length: 9 }, (_, i) => ({ donde: `foto ${i + 1}`, descripcion: `marca ajena ${i + 1} ${'d'.repeat(200)} FIN${i + 1}` }))
  const correr = async (f: Flujo) => {
    let imagenes = 0
    const respuesta = { capa_grafica: { colores_observados: [], tipografias_observadas: [], marcas_ajenas_vistas: ajenas }, marcas_ajenas_vistas: ajenas, capa_producto: { x: 1 }, reglas: { y: 1 } }
    const v = await logica(f).derivarPisoVisualTodasLasFuentes(
      { filaSitio: null, ficha: { brand_colors: colores, brand_fonts: fuentes }, copias: copias(30, true) },
      async (p) => { imagenes = p.images.length; return { response: '```json\n' + JSON.stringify(respuesta) + '\n```', brain_hit: false } },
    )
    return { v, imagenes }
  }
  it('🔴 manda 20 imágenes (logo + 19 fotos) y la muestra lo declara', async () => {
    const { v, imagenes } = await correr(leer('nuevo'))
    expect(imagenes).toBe(20)
    expect(v.muestra.fotos_miradas).toBe(19)
  })
  it('🔴 entran TODOS los colores y tipografías declarados (antes 6 y 4)', async () => {
    const { v } = await correr(leer('nuevo'))
    expect(v.capa_grafica.paleta.filter((p: { estado: string }) => p.estado === 'declarado').length).toBe(colores.length)
    expect(v.capa_grafica.tipografias.filter((p: { estado: string }) => p.estado === 'declarado').length).toBe(fuentes.length)
    const viejo = (await correr(leer('vivo'))).v
    expect(viejo.capa_grafica.paleta.length).toBe(6)
  })
  it('🔴 (Lenovo 04:46Z) sin colores ni tipografías declarados, entran TODOS los que propone el modelo, con su porqué (antes 5 y 3)', async () => {
    const obs = Array.from({ length: 9 }, (_, i) => ({ color: `#a0a0${String(i).padStart(2, '0')}`, rol: 'acento', porque: `porque ${i + 1}`, donde: 'logo' }))
    const tipos = Array.from({ length: 5 }, (_, i) => ({ nombre: `Fuente${i + 1}`, rol: 'titulos', porque: `razón ${i + 1}`, donde: 'logo' }))
    const correrSinDeclarar = async (f: Flujo) => {
      let task = ''
      const respuesta = { capa_grafica: { colores_observados: obs, tipografias_observadas: tipos, marcas_ajenas_vistas: [] }, marcas_ajenas_vistas: [], capa_producto: { x: 1 }, reglas: { y: 1 } }
      const v = await logica(f).derivarPisoVisualTodasLasFuentes(
        { filaSitio: null, ficha: { brand_colors: [], brand_fonts: [] }, copias: copias(4, true) },
        async (p) => { task = p.task; return { response: '```json\n' + JSON.stringify(respuesta) + '\n```', brain_hit: false } },
      )
      return { v, task }
    }
    const { v, task } = await correrSinDeclarar(leer('nuevo'))
    expect(v.capa_grafica.paleta.length).toBe(9)
    expect(v.capa_grafica.tipografias.length).toBe(5)
    expect(v.capa_grafica.paleta[8].porque).toBe('porque 9')
    expect(v.para_el_manual.primary_colors[8].porque).toBe('porque 9')
    expect(v.para_el_manual.typography[4].porque).toBe('razón 5')
    expect(task).not.toMatch(/propón hasta|máximo \d/)
    expect(task).toContain('"porque": "<por qué esta marca necesita este color>"')
    expect(task).toContain('"porque": "<por qué esta marca necesita esta tipografía>"')
    const viejo = (await correrSinDeclarar(leer('vivo'))).v
    expect([viejo.capa_grafica.paleta.length, viejo.capa_grafica.tipografias.length]).toEqual([5, 3])
  })
  it('🔴 todas las marcas ajenas vistas, con la descripción entera (antes 6 y 120)', async () => {
    const { v } = await correr(leer('nuevo'))
    expect(v.marcas_ajenas.length, JSON.stringify(v).slice(0, 400)).toBe(ajenas.length)
    expect(v.marcas_ajenas[8].descripcion).toContain('FIN9')
  })
})
