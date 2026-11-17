/**
 * 17-nov · propuestas en imagen · tramo 2b · 🟡 CC6 #1128: el borrador respeta el tope de su paso (cotiza antes de pedir), cada png en SU lámina (`n`) y el máximo
 * de imágenes generadas por propuesta. Directo sobre `correrBorradorDeImagen`, en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { correrBorradorDeImagen, costoEstimadoPorImagenDelBorrador, topeDelBorradorDeImagen, FUNCION_BORRADOR_IMAGEN } from '../mesa/borrador-imagen'
import type { Encargo } from '../puertos'
import type { Plantilla } from '../tipos'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { CLIENTE, crearMemoria } from './memoria'

const plantilla = (tope: number, limites: Record<string, unknown> = {}): Plantilla => ({
  ...CARRUSEL_MESA,
  limites: { ...CARRUSEL_MESA.limites, imagenes_generadas_max: 8, ...limites } as Plantilla['limites'],
  pasos: [{ clave: 'borrador_imagen', tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_IMAGEN, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: 'borrador_imagen', tope_usd: tope }],
})
const enc = (propuestas: unknown[]): Encargo => ({
  id: 'enc-1', client_id: CLIENTE, brief_id: 'B', dry_run: true,
  estado_del_motor: { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, fichas: [], artefactos: {
    encargo: { version: 1, datos: { F: { fotos: [], marca: { fonts: { family: 'Inter' } }, slug: 'x' }, plataforma: 'instagram' } },
    propuestas_imagen: { version: 1, datos: { ronda: 1, clase: 'carrusel', avisos: [], citas: '', propuestas } },
  } },
} as unknown as Encargo)
/** una propuesta de carrusel con `g` láminas de imagen generada (refs r1..rg) y `s` sin imagen después */
const carrusel = (id: string, g: number, s = 0) => {
  const roles = [...Array.from({ length: g }, (_, i) => `r${i + 1}`), ...Array.from({ length: s }, (_, i) => `s${i + 1}`)]
  return {
    id, nombre: id, texto: '', laminas: roles.map((rol, i) => ({ n: i + 1, rol })),
    artefactos: {
      visual_direction: { imagenes: roles.map((rol) => (rol.startsWith('r') ? { ref: rol, modo: 'generada' } : { ref: rol, modo: 'ninguna' })) },
      prompts_validos: { por_ref: Object.fromEntries(roles.filter((r) => r.startsWith('r')).map((r) => [r, { prompts: [{ prompt: `${id}-${r}` }] }])) },
      laminas: { laminas: roles.map((rol) => ({ rol, headline: `${id} ${rol}` })) },
    },
  }
}
const pedidas = (M: ReturnType<typeof crearMemoria>) => (M.llamadas.imagenCalidades as Array<{ prompt: string }>).map((x) => x.prompt)

describe('🟡 CC6 #1128 · el borrador respeta el tope de su paso', () => {
  it('🔴 cotiza ANTES de pedir: con 0,1 de tope y 0,02 por imagen entran 5; las que no caben NO se piden, quedan ausentes con su error', async () => {
    const M = crearMemoria()
    const r = await correrBorradorDeImagen(M.P, enc([carrusel('P1', 4), carrusel('P2', 4), carrusel('P3', 4)]), plantilla(0.1), 'carrusel')
    // POR TURNOS: la 1.ª de cada propuesta, luego la 2.ª… hasta llenar el tope (5 × 0,02 = 0,1)
    expect(pedidas(M)).toEqual(['P1-r1', 'P2-r1', 'P3-r1', 'P1-r2', 'P2-r2'])
    expect(r.artefacto.tope_usd).toBe(0.1)
    const p3 = r.artefacto.propuestas[2]
    expect(p3.laminas.map((l) => !!l.imagen_url)).toEqual([true, false, false, false])
    expect(p3.errores).toEqual([
      '«r2» no cabe en el tope del borrador (US$ 0.1: comprometido 0.1 + 0.02 por imagen): sin imagen en el borrador',
      '«r3» no cabe en el tope del borrador (US$ 0.1: comprometido 0.1 + 0.02 por imagen): sin imagen en el borrador',
      '«r4» no cabe en el tope del borrador (US$ 0.1: comprometido 0.1 + 0.02 por imagen): sin imagen en el borrador',
    ])
    expect(r.gastos).toHaveLength(5)
  })
  it('🔴 la calidad cambiada por dato encarece la cotización: con `high` (0,25) y 0,3 de tope entra UNA sola imagen', async () => {
    const M = crearMemoria()
    await correrBorradorDeImagen(M.P, enc([carrusel('P1', 2), carrusel('P2', 2)]), plantilla(0.3, { imagen_borrador: { quality: 'high' } }), 'carrusel')
    expect(pedidas(M)).toEqual(['P1-r1'])
  })
  it('🔴 lo cobrado de verdad pesa si pasa lo cotizado (el seco cobra 0 y aun así frena)', async () => {
    const M = crearMemoria()
    const base = M.P.imagen
    M.P.imagen = async (p) => { const g = await base(p); return g.ok ? { ...g, costo_usd: 0.05 } : g }
    const r = await correrBorradorDeImagen(M.P, enc([carrusel('P1', 3), carrusel('P2', 3)]), plantilla(0.1), 'carrusel')
    // 0,05 + 0,05 = 0,1: la 3.ª ya no cabe (0,1 + 0,02 > 0,1)
    expect(pedidas(M)).toEqual(['P1-r1', 'P2-r1'])
    expect(r.artefacto.costo_usd).toBe(0.1)
  })
  it('sin paso o sin tope en la plantilla: no se pide NINGUNA imagen (nunca gasta sin tope); las láminas igual se dibujan', async () => {
    const M = crearMemoria()
    const pl = { ...plantilla(0), pasos: [] }
    expect(topeDelBorradorDeImagen(pl)).toBe(0)
    const r = await correrBorradorDeImagen(M.P, enc([carrusel('P1', 1, 1)]), pl, 'carrusel')
    expect(pedidas(M)).toEqual([])
    expect(r.artefacto.propuestas[0].laminas.every((l) => l.png_url)).toBe(true)
  })
  it('costoEstimadoPorImagenDelBorrador: dato > 0 manda; si no, la cifra de su calidad; calidad desconocida → la mayor', () => {
    expect(costoEstimadoPorImagenDelBorrador({})).toBe(0.02)
    expect(costoEstimadoPorImagenDelBorrador({ imagen_borrador: { quality: 'medium' } })).toBe(0.07)
    expect(costoEstimadoPorImagenDelBorrador({ imagen_borrador: { quality: 'ultra' } })).toBe(0.25)
    expect(costoEstimadoPorImagenDelBorrador({ imagen_borrador: { costo_por_imagen_usd: 0.03 } })).toBe(0.03)
    expect(costoEstimadoPorImagenDelBorrador({ imagen_borrador: { costo_por_imagen_usd: -1 } })).toBe(0.02)
  })
})

describe('🟡 CC6 #1128 · el máximo de imágenes por propuesta', () => {
  it('🔴 una propuesta con más generadas que `imagenes_generadas_max`: las que sobran NO llaman al generador y quedan sin imagen con su error', async () => {
    const M = crearMemoria()
    const r = await correrBorradorDeImagen(M.P, enc([carrusel('P1', 3)]), plantilla(1, { imagenes_generadas_max: 2 }), 'carrusel')
    expect(pedidas(M)).toEqual(['P1-r1', 'P1-r2'])
    expect(r.artefacto.propuestas[0].laminas.map((l) => !!l.imagen_url)).toEqual([true, true, false])
    expect(r.artefacto.propuestas[0].errores).toEqual(['«r3» pasa el tope de imágenes generadas (2): sin imagen en el borrador'])
  })
})

describe('🟡 CC6 #1128 · cada png en SU lámina (lo que lee la tarjeta por `n`)', () => {
  it('🔴 carrusel: el png k del dibujo va a la lámina k (url distinta por lámina)', async () => {
    const M = crearMemoria()
    const r = await correrBorradorDeImagen(M.P, enc([carrusel('P1', 1, 4)]), plantilla(1), 'carrusel')
    const urls = r.artefacto.propuestas[0].laminas.map((l) => l.png_url)
    expect(urls).toEqual([1, 2, 3, 4, 5].map((k) => expect.stringMatching(new RegExp(`/${k}-\\d+x\\d+\\.png$`))))
    expect(new Set(urls).size).toBe(5)
  })
  it('🔴 kit: el png va a la lámina por la POSICIÓN DEL ELEMENTO en la estructura (un elemento sin texto no se dibuja y no corre a los demás)', async () => {
    const M = crearMemoria()
    const kit = {
      id: 'P1', nombre: 'P1', texto: '', laminas: [{ n: 1, rol: 'e01' }, { n: 2, rol: 'e02' }, { n: 3, rol: 'e03' }],
      artefactos: {
        visual_direction: { imagenes: [] }, prompts_validos: { por_ref: {} },
        estructura: { elementos: [{ ref: 'e01', rol: 'a', beat: 'a', mood: 'a' }, { ref: 'e02', rol: 'b', beat: 'b', mood: 'b' }, { ref: 'e03', rol: 'c', beat: 'c', mood: 'c' }] },
        // e02 sin texto del autor: el dibujo trae 2 láminas (e01 y e03)
        copy_kit: { elementos: [{ ref: 'e01', headline: 'uno' }, { ref: 'e03', headline: 'tres' }] },
      },
    }
    const r = await correrBorradorDeImagen(M.P, enc([kit]), plantilla(1), 'kit')
    const l = r.artefacto.propuestas[0].laminas
    expect(l[0].png_url).toMatch(/\/1-\d+x\d+\.png$/)
    expect(l[1].png_url).toBeUndefined()
    expect(l[2].png_url).toMatch(/\/2-\d+x\d+\.png$/)
  })
})
