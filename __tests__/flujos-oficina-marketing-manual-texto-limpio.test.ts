import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const flujo = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/ops/oficina-marketing/nuevo/ssLtwYPt7zxuvnM2.json'), 'utf8'))
const codigo = (n: string) => String(flujo.nodes.find((x: { name: string }) => x.name === n).parameters.jsCode)

describe('03-nov · punto B · el equipo del manual escribe solo el texto presentable al cliente', () => {
  it('las reglas de las tres lentes ya no piden «el cliente dice:» dentro del texto y prohíben segmentos y justificaciones pegadas', () => {
    const c = codigo('[BB] Fan-out prep')
    expect(c).not.toContain('se escribe «el cliente dice: «cita»»')
    expect(c).toMatch(/códigos de segmento \((S1…)\)/)
    expect(c).toMatch(/justificaciones pegadas/)
    expect(c).toContain("razón y fuente en `_field_meta.<campo>`")
  })
  it('la regla de proponer del dueño ya no manda terminar el texto en « [propuesta del agente — razón]»', () => {
    const c = codigo('[BB] Equipo · integración · preparar')
    expect(c).not.toContain('TERMINA en « [propuesta del agente')
    expect(c).toContain('APARTE (para la jefatura, nunca dentro del texto)')
  })
  it('un pedido de cambios pide leer lo que escribió el dueño y rehacer de verdad, sin justificar dentro del texto', () => {
    const c = codigo('[BB] Fan-out prep')
    expect(c).toContain('LEE con cuidado lo que escribió')
    expect(c).toContain('Rehaz lo pedido de verdad')
  })
})
