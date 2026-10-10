/** El código de la revisión del manual es AGNÓSTICO: ni un cliente, ni una ciudad, ni un rubro en ninguna lista, regla ni texto. Solo los datos de PRUEBA nombran al piloto. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = 'src/lib/manual'
const archivos = [...fs.readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => path.join(DIR, f)), 'src/lib/revisor-gpt.ts']
const PROHIBIDAS = ['naufrago', 'náufrago', 'olon', 'olón', 'guayaquil', 'ecuador', 'ceviche', 'encebollado', 'marisco', 'restaurante', 'ghost kitchen', 'peniche', 'goeurope', 'surf', 'seguridad industrial', 'zero risk']

describe('agnóstico', () => {
  it('ningún archivo de la librería nombra a un cliente, una ciudad o un rubro (ni en las listas de datos)', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(12)
    for (const f of archivos) {
      const t = fs.readFileSync(f, 'utf8').toLowerCase()
      for (const p of PROHIBIDAS) expect(t.includes(p), `${f} nombra «${p}»`).toBe(false)
    }
  })
  it('la lista de palabras de certeza es un DATO por idioma: raíces o palabras, sin lógica de ningún cliente', () => {
    const t = fs.readFileSync(path.join(DIR, 'palabras-de-certeza.es.ts'), 'utf8')
    expect(t).toMatch(/export const PALABRAS_DE_CERTEZA_ES/)
    expect(t).not.toMatch(/client_id|cliente_/)
  })
})
