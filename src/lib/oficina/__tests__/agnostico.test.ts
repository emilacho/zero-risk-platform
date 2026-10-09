import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { POST_IMG } from '../plantillas/post-img'

/** el código de producción de la oficina (todo menos las pruebas) no nombra a ningún cliente, ciudad ni producto de un cliente */
const PROHIBIDOS = ['naufrago', 'náufrago', 'guayaquil', 'olón', 'olon', 'ceviche', 'encebollado', 'rukut', 'ecuador', 'perez', 'pérez']

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === '__tests__') return []
    const p = path.join(dir, d.name)
    return d.isDirectory() ? archivos(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('agnóstico: nada de producción nombra a un cliente', () => {
  const raiz = path.join(__dirname, '..')
  for (const f of archivos(raiz)) {
    it(path.relative(raiz, f), () => {
      const src = fs.readFileSync(f, 'utf8').toLowerCase()
      const encontrados = PROHIBIDOS.filter((x) => src.includes(x))
      expect(encontrados).toEqual([])
    })
  }
  it('las indicaciones de la plantilla tampoco', () => {
    const todo = JSON.stringify(POST_IMG.indicaciones).toLowerCase()
    expect(PROHIBIDOS.filter((x) => todo.includes(x))).toEqual([])
  })
})
