/**
 * Ronda 66 · «(tú · vos · usted)» devuelto en las 4 cadenas del brief y de la copia por filas. El barrido del voseo la había vuelto «(tú · tú · usted)» (el borde de palabra `\b` no entiende la tilde de «tú»,
 * y la línea que enumera las tres opciones no quedó protegida). En seco, sobre los respaldos de AHORA (los flujos vivos, la copia ya con autoproducir).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BIEN, MAL, corregirEnumeracion } from '../scripts/worker-staging/cadena/construir-enumeracion-ronda66.mjs'
import { barrerFlujo, barrerTexto } from '../scripts/ops/barrer-voseo.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any>; id?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const CASOS = [
  { nombre: 'brief', antes: 'PQdIgbuFexuBsoh8/brief-ANTES-ronda66-2026-10-11.json', despues: 'PQdIgbuFexuBsoh8/brief-ARREGLADO-ronda66-2026-10-11.json', nodos: ['③ Armar el cuerpo del redactor', '④ Chequeos'] },
  { nombre: 'copia por filas', antes: 'cadena/parte-por-filas-ANTES-ronda66-2026-10-11.json', despues: 'cadena/parte-por-filas-ARREGLADA-ronda66-2026-10-11.json', nodos: ['③ Armar el cuerpo del redactor', '④ Chequeos'] },
]
const cuenta = (f: Flujo, s: string) => JSON.stringify(f.nodes.map((n) => n.parameters)).split(s).length - 1

describe('rojo → verde: las 4 cadenas', () => {
  for (const c of CASOS) {
    it(`${c.nombre}: los respaldos de ahora traen «${MAL}» en los dos nodos · los arreglados traen «${BIEN}» y ninguno malo`, () => {
      const a = leer(c.antes), d = leer(c.despues)
      expect(cuenta(a, MAL)).toBe(2)
      expect(cuenta(d, MAL)).toBe(0)
      expect(cuenta(d, BIEN)).toBe(cuenta(a, BIEN) + 2)   // las 2 devueltas + las que ya estaban bien (en comentarios)
      for (const n of c.nodos) {
        expect(String(a.nodes.find((x) => x.name === n)!.parameters.jsCode)).toContain(MAL)
        expect(String(d.nodes.find((x) => x.name === n)!.parameters.jsCode)).toContain("qué trato " + BIEN + " usa esta marca")
      }
    })
    it(`${c.nombre}: es lo ÚNICO que cambia (mismos nodos, mismas conexiones, mismo estado) y se reproduce desde el respaldo`, () => {
      const a = leer(c.antes), d = leer(c.despues)
      expect(JSON.stringify(corregirEnumeracion(a).flujo)).toBe(JSON.stringify(d))
      expect(d.nodes.map((n) => [n.name, n.type, n.id])).toEqual(a.nodes.map((n) => [n.name, n.type, n.id]))
      expect(d.connections).toEqual(a.connections)
      expect(d.active).toBe(a.active)
      // deshacer la corrección da EXACTAMENTE el respaldo
      const cambiados = a.nodes.filter((n) => JSON.stringify(n.parameters) !== JSON.stringify(d.nodes.find((x) => x.name === n.name)!.parameters)).map((n) => n.name)
      expect(cambiados.sort()).toEqual([...c.nodos].sort())   // solo ③ y ④
    })
  }
  it('la copia por filas conserva autoproducir (los dos nodos ⑤c y su conexión) · y sigue inactiva; el brief sigue activo', () => {
    const d = leer(CASOS[1].despues)
    expect(d.nodes.map((n) => n.name)).toEqual(expect.arrayContaining(['⑤c Autoproducir', '⑤c ¿Salió?']))
    expect(JSON.stringify(d.connections['⑤ Marcar las filas del lote'])).toContain('⑤c Autoproducir')
    expect(d.active).toBe(false)
    expect(leer(CASOS[0].despues).active).toBe(true)
  })
  it('el detector de trato sigue intacto en los dos flujos (valores, tabla de países, enumeración)', () => {
    for (const c of CASOS) {
      const t = JSON.stringify(leer(c.despues).nodes.map((n) => n.parameters))
      for (const marca of ["var TRATOS = ['tu', 'vos', 'usted']", "argentina: 'vos'", "if (w === 'vos') add('vos', w)", 'var out = { vos: [], tu: [], usted: [] }']) expect(t, marca).toContain(marca)
    }
  })
})

describe('la herramienta: la enumeración queda PROTEGIDA (no vuelve a pasar)', () => {
  it('barrer el flujo ya arreglado no cambia nada (ni la enumeración ni nada)', () => {
    for (const c of CASOS) expect(barrerFlujo(leer(c.despues)).cambios, c.nombre).toEqual([])
  })
  it('barrer el respaldo de ANTES de este barrido (el que traía «tú · vos · usted») ya NO produce «tú · tú · usted»', () => {
    for (const [carpeta, nombre] of [['PQdIgbuFexuBsoh8', 'brief'], ['cadena', 'parte-por-filas']]) {
      const f = leer(`${carpeta}/${nombre}-ANTES-sin-voseo-2026-10-11.json`)
      expect(JSON.stringify(barrerFlujo(f).flujo)).not.toContain(MAL)
    }
  })
  it('la causa: la marca ya no depende de `\\b` con «tú» (una línea con «tú» y «vos» separados por cualquier cosa queda protegida)', () => {
    const linea = 'Escribe con el trato (tú · vos · usted) que use el manual. Devolvé el JSON.'
    expect(barrerTexto(linea).texto).toBe(linea)
  })
})
