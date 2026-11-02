/**
 * Equipo del manual (02-nov · firma de Emilio): el redactor de la voz es `content-creator`, y los campos que ya define
 * `lib/manual/campos-del-manual.ts` se le muestran al empleado en la herramienta. Sin esto, su entrega se rechaza entera (MCP -32602).
 */
import { readFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CAMPOS } from '../../../../../src/lib/manual/campos-del-manual'
import { EMIT_BRAND_SECTION_TOOL } from '../forced-emit-messages'

vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }))

const servidor = readFileSync(pathResolve(__dirname, '../mcp/brand-section-server.js'), 'utf8')
const propiedades = EMIT_BRAND_SECTION_TOOL.input_schema.properties as Record<string, { enum?: readonly string[] }>
const NUEVOS = ['vision', 'valores', 'nunca_hace', 'productos', 'sedes']

describe('la herramienta de las secciones del manual', () => {
  it('🔴 content-creator entra por los dos caminos, y las dos listas son iguales', () => {
    expect(propiedades.lens.enum).toContain('content-creator')
    const delServidor = servidor.match(/\.enum\(\[([^\]]*)\]\)\s*\.describe\('Qué lente eres/)?.[1]
    expect(delServidor).toBe(propiedades.lens.enum!.map((x) => `'${x}'`).join(', '))
  })

  it.each(NUEVOS)('🔴 %s se declara en el servidor y en el camino forzado', (campo) => {
    expect(servidor).toMatch(new RegExp(`^  ${campo}: PROV\\(`, 'm'))
    expect(propiedades).toHaveProperty(campo)
  })

  it.each(NUEVOS)('🔴 %s es opcional en el servidor: una entrega sin él no se rechaza', (campo) => {
    expect(servidor).toMatch(new RegExp(`^  ${campo}: PROV\\([^\\n]*\\n\\s*\\.optional\\(\\)`, 'm'))
    expect(EMIT_BRAND_SECTION_TOOL.input_schema.required).not.toContain(campo)
  })

  it('🔴 lo que se declara existe en la definición única del manual', () => {
    const claves = new Set(CAMPOS.map((c) => c.clave))
    expect(NUEVOS.filter((c) => !claves.has(c))).toEqual([])
  })
})
