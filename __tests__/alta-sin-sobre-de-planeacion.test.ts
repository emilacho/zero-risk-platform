/**
 * 03-nov · FIRMA DE EMILIO 14:46Z · el alta ya no pide el plan (se pide al aprobar el manual). US$ 0, sin red.
 * Fija: el constructor quita SOLO el sobre y su GUARDA, deja la segunda fase como final, falla en voz alta si la forma no es la esperada,
 * y el alta publicada (foto) es lo que da el constructor sobre la foto de ANTES.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FINAL_REAL, GUARDA, SOBRE, quitarSobre } from '../scripts/ops/alta-sin-sobre-de-planeacion.mjs'

const DIR = join(__dirname, '..', 'scripts', 'worker-staging', 'LyVoKcrypS5uLyuu')
const leer = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8'))
const antes = leer('alta-ANTES-corte-del-plan-2026-11-03.json')
const despues = quitarSobre(antes)
const nombres = (w: any) => w.nodes.map((n: any) => n.name)

describe('el constructor del corte', () => {
  it('quita exactamente dos nodos: el sobre y su GUARDA', () => {
    expect(nombres(antes).filter((n: string) => !nombres(despues).includes(n)).sort()).toEqual([GUARDA, SOBRE].sort())
    expect(nombres(despues).length).toBe(nombres(antes).length - 2)
  })
  it('no toca ningún otro nodo (parámetros idénticos) ni las demás conexiones', () => {
    const m = new Map(antes.nodes.map((n: any) => [n.name, JSON.stringify(n)]))
    for (const n of despues.nodes) expect(JSON.stringify(n)).toBe(m.get(n.name))
    const sin = (c: any) => { const o = JSON.parse(JSON.stringify(c)); delete o[SOBRE]; delete o[GUARDA]; delete o[FINAL_REAL]; return o }
    expect(sin(despues.connections)).toEqual(sin(antes.connections))
  })
  it('«Llamar · Segunda Fase del alta» queda y ya no apunta a nadie', () => {
    expect(nombres(despues)).toContain(FINAL_REAL)
    expect(JSON.stringify(despues.connections[FINAL_REAL] ?? {})).not.toContain(SOBRE)
  })
  it('🔴 falla en voz alta si ya está cortada o si el sobre cuelga de otro nodo (no adivina)', () => {
    expect(() => quitarSobre(despues)).toThrow(/ya está cortada|no trae/)
    const raro = JSON.parse(JSON.stringify(antes))
    raro.connections['Nodo ajeno'] = { main: [[{ node: SOBRE, type: 'main', index: 0 }]] }
    expect(() => quitarSobre(raro)).toThrow(/SOLO/)
  })
  it('la foto publicada del alta tiene los mismos nodos y conexiones que el constructor sobre la de antes', () => {
    const ultima = leer('alta-VIVO-2026-11-03.json')
    const norm = (w: any) => JSON.stringify({ n: w.nodes.map((x: any) => [x.name, JSON.stringify(x.parameters ?? {}), !!x.disabled]).sort(), c: w.connections })
    expect(norm(ultima)).toBe(norm(despues))
  })
})
