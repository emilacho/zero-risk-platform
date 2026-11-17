/**
 * 17-nov · GO Lenovo «quitar rejas» · A·12 de CC3: la ruta vieja `/api/agents/generate-content` se retiró.
 * Fijaba el cliente («empresa de seguridad industrial en Ecuador»), el tono, 60 caracteres, 150 palabras, 5-8 hashtags, CTA siempre y 3 variantes.
 * Antes de retirarla (lectura dirigida 17-nov): 0 de 130 flujos de n8n la nombran, 0 llamadas en los tableros, y su propio rastro
 * (`agents_log` action=generate_content y `content` generated_by=content_creator_agent) tiene 0 filas en toda su historia.
 * Si vuelve, esta prueba cae: el copy pasa por la cadena y la oficina, con el manual, el brief y la tabla de formatos como dato. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '../../..')

describe('A·12 · la ruta vieja de copy no existe', () => {
  it('ni la ruta ni su esquema de entrada', () => {
    expect(fs.existsSync(path.join(RAIZ, 'src/app/api/agents/generate-content'))).toBe(false)
    expect(fs.existsSync(path.join(RAIZ, 'src/lib/contracts/inputs/agents-generate-content.json'))).toBe(false)
  })
  it('ninguna ruta de la API vuelve a fijar el cliente de la agencia ni sus límites de copy', () => {
    const rutas: string[] = []
    const recorrer = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) recorrer(p); else if (e.name === 'route.ts') rutas.push(p) } }
    recorrer(path.join(RAIZ, 'src/app/api'))
    expect(rutas.length).toBeGreaterThan(10)
    for (const r of rutas) expect(fs.readFileSync(r, 'utf8'), r).not.toMatch(/una empresa de seguridad industrial en Ecuador/)
  })
})
