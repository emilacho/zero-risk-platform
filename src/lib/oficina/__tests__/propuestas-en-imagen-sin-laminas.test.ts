/**
 * 17-nov · 🟡 CC6 a #1125 · sabotaje v5: una propuesta que se TRADUCE bien pero no trae láminas no se presenta (se descarta con su título y se avisa).
 * El traductor de hoy nunca devuelve «ok» sin láminas (lo comprobé con kit y carrusel vacíos: siempre `ok: false`), así que la guarda es defensiva: se prueba
 * simulando esa respuesta del traductor, para que un cambio futuro del traductor no deje pasar una propuesta vacía a la tarjeta sin aviso.
 */
import { describe, expect, it, vi } from 'vitest'

const vacia = vi.hoisted(() => ({ titulo: '' }))
vi.mock('../mesa/traductor', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mesa/traductor')>()
  return {
    ...real,
    // la propuesta cuyo texto trae el título marcado se «traduce bien» pero sin estructura ni copy (lo que un traductor futuro podría devolver)
    traducirPieza: (md: string, tipo: Parameters<typeof real.traducirPieza>[1], o: Parameters<typeof real.traducirPieza>[2]) =>
      vacia.titulo && md.includes(vacia.titulo) ? { ok: true, avisos: [], imagenes: [], estructura: [], copy_kit: [], laminas: [] } : real.traducirPieza(md, tipo, o),
  }
})

import { traducirPropuestasDeImagen } from '../mesa/propuestas-imagen'

const propuesta = (n: number, titulo: string) => [`# Propuesta ${n} · ${titulo}`, `## Lámina 1 · ${titulo}`, `Título: ${titulo}`, 'Imagen: ninguna'].join('\n')

describe('v5 · una propuesta sin láminas no se presenta', () => {
  it('🔴 la traducción sale «bien» pero vacía: se descarta con su título, el «quedan» lo dice y las otras siguen', () => {
    vacia.titulo = 'Lámina vacía de prueba'
    const md = [propuesta(1, 'La buena'), [`# Propuesta 2 · La vacía`, `## Lámina 1 · x`, `Título: ${vacia.titulo}`].join('\n'), propuesta(3, 'La otra buena')].join('\n')
    const r = traducirPropuestasDeImagen(md, 'kit', { objetivo: 3, traduccion: { refsDelKit: ['e01'], tipoPorRef: { e01: 'historia' } } })
    vacia.titulo = ''
    if (!r.ok) throw new Error(r.motivo)
    expect(r.resultado.propuestas.map((p) => p.nombre)).toEqual(['La buena', 'La otra buena'])
    expect(r.resultado.avisos).toContain('«Propuesta 2 · La vacía» se descartó: no trae láminas que se puedan leer')
    expect(r.resultado.avisos.some((a) => /quedan 2/.test(a) && /La vacía/.test(a))).toBe(true)
  })
})
