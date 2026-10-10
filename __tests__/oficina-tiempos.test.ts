/**
 * OFICINA · los TIEMPOS de las rutas y de los flujos. Con las salas 2 y 3 un solo golpe a /api/oficina/turnos puede encadenar varios pasos de código
 * (dibujar las láminas, el revisor externo con imágenes, empaquetar y guardar la entrega): la ruta necesita más margen que el que alcanzaba para un post,
 * y el flujo de n8n que la llama NO puede cortar antes que la ruta (si corta, el paso queda «corriendo» y el vigía lo da por muerto).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirPuerta, construirTurno, construirVigia } from '../scripts/worker-staging/oficina/construir-oficina.mjs'

const duracion = (ruta: string): number => {
  const m = /export const maxDuration = (\d+)/.exec(fs.readFileSync(path.join(process.cwd(), `src/app/api/oficina/${ruta}/route.ts`), 'utf8'))
  return m ? Number(m[1]) : 0
}
type Nodo = { name: string; type: string; parameters: { url?: string; options?: { timeout?: number } } }
const nodos = (f: unknown): Nodo[] => (f as { nodes: Nodo[] }).nodes
const timeoutDe = (f: unknown, fragmento: string): number => nodos(f).find((n) => n.type === 'n8n-nodes-base.httpRequest' && String(n.parameters.url).includes(fragmento))?.parameters.options?.timeout ?? 0

describe('los tiempos de la oficina', () => {
  it('turnos y vigía tienen hasta 300 s; abrir un encargo, 120 s', () => {
    expect(duracion('turnos')).toBe(300); expect(duracion('vigia')).toBe(300); expect(duracion('encargos')).toBe(120)
  })
  it('el flujo de turnos NO corta antes que la ruta: registrar y re-armar esperan al menos lo que la ruta puede tardar', () => {
    const f = construirTurno()
    const ts = nodos(f).filter((n) => n.type === 'n8n-nodes-base.httpRequest' && String(n.parameters.url).includes('/api/oficina/turnos')).map((n) => n.parameters.options?.timeout ?? 0)
    expect(ts.length).toBeGreaterThan(0)
    for (const t of ts) expect(t).toBeGreaterThanOrEqual(duracion('turnos') * 1000)
    expect(timeoutDe(construirPuerta(), '/api/oficina/encargos')).toBeGreaterThanOrEqual(duracion('encargos') * 1000)
  })
  it('el flujo del vigía espera a la ruta del vigía y a la de turnos al re-armar', () => {
    const f = construirVigia()
    expect(timeoutDe(f, '/api/oficina/vigia')).toBeGreaterThanOrEqual(60000)
    for (const n of nodos(f).filter((x) => String(x.parameters.url ?? '').includes('/api/oficina/turnos'))) expect(n.parameters.options?.timeout ?? 0).toBeGreaterThanOrEqual(duracion('turnos') * 1000)
  })
})
