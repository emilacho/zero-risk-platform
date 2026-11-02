/**
 * 02-nov · una fila de `client_sede_datos` retirada (no era del cliente) NO la lee nadie.
 * Prueba permanente: cualquier lectura nueva de la tabla debe ignorar las retiradas o declararse aquí con su motivo.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { leerSedes, type Contexto } from '../../cerebro/lectores'
import { PLAZOS_EN_DIAS } from '../../cerebro/plazos'

const RAIZ = join(__dirname, '..', '..', '..')
function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== '__tests__' && n !== 'node_modules') archivos(p, acc) } else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) acc.push(p)
  }
  return acc
}

/** lecturas que NO necesitan el filtro, con el motivo: solo leen lo que dijo el dueño (nunca se retira) o son escrituras */
const EXENTAS: Record<string, string> = {
  'manual/propuesta-rutas.ts': 'lee solo fuente = dueno; el retiro solo alcanza a fuente = sitio',
}

describe('toda lectura de client_sede_datos ignora las filas retiradas', () => {
  const lecturas: Array<{ archivo: string; sentencia: string }> = []
  for (const f of archivos(RAIZ)) {
    const t = readFileSync(f, 'utf8')
    let i = -1
    while ((i = t.indexOf("from('client_sede_datos')", i + 1)) !== -1) {
      const resto = t.slice(i, i + 700)
      const j = resto.indexOf('.select(')
      const k = resto.search(/\.(insert|update)\(/)
      if (j !== -1 && (k === -1 || j < k)) lecturas.push({ archivo: f.slice(RAIZ.length + 1).replace(/\\/g, '/'), sentencia: resto.split('\n')[0].slice(0, 400) })
    }
  }
  it('hay lecturas que vigilar (la prueba no es vacía)', () => { expect(lecturas.length).toBeGreaterThanOrEqual(6) })
  for (const l of lecturas) {
    it(`${l.archivo}`, () => {
      if (EXENTAS[l.archivo.replace(/^lib\//, '')]) return
      expect(l.sentencia, 'esta lectura debe agregar .is(\'retirada_en\', null)').toMatch(/retirada_en/)
    })
  }
  it('los lectores genéricos del cerebro (lista corta y texto completo) piden la columna retirada_en', () => {
    for (const f of ['lib/cerebro/lectores.ts', 'lib/cerebro/contenido.ts']) {
      const t = readFileSync(join(RAIZ, f), 'utf8')
      const i = t.indexOf("client_sede_datos")
      expect(t.slice(i, i + 400), f).toMatch(/retirada_en/)
    }
  })
})

describe('la lista corta del cerebro no trae las filas retiradas', () => {
  const sedes = [{ id: 's1', clave: 'guayaquil', ciudad: 'Guayaquil', created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' }]
  const datos = [
    { id: 'propia', sede_id: 's1', campo: 'horario', valor_texto: 'jueves a lunes 08:00-16:00', fuente: 'sitio', alcance: 'sede', observado_en: '2026-10-30T00:00:00Z', reconfirmado_en: null, retirada_en: null },
    { id: 'ajena', sede_id: 's1', campo: 'direccion', valor_texto: 'Bamboo Plaza, Km 9.8, Vía a la Costa', fuente: 'sitio', alcance: 'sede', observado_en: '2026-10-30T00:00:00Z', reconfirmado_en: null, retirada_en: '2026-11-02T14:00:00Z' },
  ]
  const ctx = (): Contexto => ({
    cliente: 'c1', ahora: new Date('2026-11-02T14:00:00Z'), plazos: PLAZOS_EN_DIAS,
    consulta: async (p: { tabla: string }) => ({ filas: (p.tabla === 'client_sedes' ? sedes : p.tabla === 'client_sede_datos' ? datos : []) as never, error: null }),
  })
  it('lo vigente sale; lo retirado no', async () => {
    const s = await leerSedes(ctx())
    const txt = JSON.stringify(s.lineas)
    expect(txt).toMatch(/jueves a lunes/)
    expect(txt).not.toMatch(/Bamboo Plaza/)
  })
})

describe('el texto completo de un dato de sede retirado no se entrega', () => {
  const fila = (retirada_en: string | null) => ({ id: 'd1', client_id: 'c1', campo: 'direccion', valor_texto: 'Bamboo Plaza, Km 9.8', fuente: 'sitio', observado_en: '2026-10-30T00:00:00Z', reconfirmado_en: null, retirada_en })
  it('vigente: se lee; retirado: sin texto', async () => {
    const { leerContenido } = await import('../../cerebro/contenido')
    const vigente = await leerContenido((async () => ({ filas: [fila(null)] as never, error: null })) as never, 'c1', 'client_sede_datos:d1')
    expect(vigente.texto).toMatch(/Bamboo Plaza/)
    const retirado = await leerContenido((async () => ({ filas: [fila('2026-11-02T14:00:00Z')] as never, error: null })) as never, 'c1', 'client_sede_datos:d1')
    expect(retirado.texto).toBeNull()
    expect(retirado.estado).toBe('sin_material')
  })
})
