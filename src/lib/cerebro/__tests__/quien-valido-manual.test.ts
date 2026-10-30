/**
 * «Quién validó el manual» se calcula en UN solo lugar (`validacionDelManual` / `quienValido`, en manual/campos-del-manual.ts) y se lee de la versión VIGENTE.
 * Esta prueba (a) fija que el lector del cerebro usa esa función y respeta la precedencia dueño > jefatura > propuesta, y (b) FALLA si cualquier lector del cerebro
 * (o el estado del manual) vuelve a mirar `human_validated` por su cuenta. US$ 0.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RANGO_DE_VALIDACION, quienValido, validacionDelManual, versionVigente } from '../../manual/campos-del-manual'
import { estadoDelManual } from '../../portero-alimenta/estado-del-manual'
import { leerManual, type Contexto } from '../lectores'
import { PLAZOS_EN_DIAS } from '../plazos'

type Fila = Record<string, unknown>
const v = (id: string, version: number, human_validated: boolean, validado_por?: string): Fila => ({ id, version, human_validated, provenance_tag: validado_por ? { validado_por } : {}, created_at: '2026-10-20T10:00:00Z', content_text: `manual ${version}` })

function ctxCon(filas: Fila[]): Contexto {
  const consulta = async () => ({ filas: [...filas].sort((a, b) => Number(b.version) - Number(a.version)), error: null })
  return { consulta, cliente: 'c1', ahora: new Date('2026-10-30T12:00:00Z'), plazos: PLAZOS_EN_DIAS } as unknown as Contexto
}
const lineaVigente = async (filas: Fila[]) => (await leerManual(ctxCon(filas))).lineas.find((l) => l.vigente)

describe('el lector del manual usa la función única', () => {
  it('lee la versión VIGENTE (la de mayor número), no la primera ni la validada más vieja', async () => {
    const vig = await lineaVigente([v('a', 1, true, 'dueno'), v('c', 3, false), v('b', 2, true, 'jefatura')])
    expect(vig?.ref).toBe('client_brand_books:c')
    expect(vig?.estado).toBe('borrador sin aprobar')
    expect(versionVigente([{ version: 1 }, { version: 3 }, { version: 2 }])).toEqual({ version: 3 })
    expect(versionVigente([])).toBeNull()
  })
  it('cada cual con su rótulo: dueño, jefatura y propuesta', async () => {
    const d = await lineaVigente([v('a', 1, true, 'dueno')])
    const j = await lineaVigente([v('a', 1, true, 'jefatura')])
    const p = await lineaVigente([v('a', 1, false, 'jefatura')]) // `validado_por` sin human_validated NO cuenta
    expect([d?.estado, j?.estado, p?.estado]).toEqual(['aprobado', 'aprobado', 'borrador sin aprobar'])
    expect(d?.que_es).toContain('validado por el dueño')
    expect(j?.que_es).toContain('validado por la jefatura')
    expect(p?.que_es).toContain('sin validar')
  })
  it('un manual firmado antes de esta regla (sin validado_por) cuenta del dueño', async () => {
    expect((await lineaVigente([v('a', 1, true)]))?.que_es).toContain('validado por el dueño')
  })
  it('el lector y el estado del manual dicen lo mismo de la misma fila', async () => {
    for (const fila of [v('a', 2, true, 'dueno'), v('a', 2, true, 'jefatura'), v('a', 2, false)]) {
      const estado = estadoDelManual([fila]).texto
      expect(estado.toLowerCase()).toContain(validacionDelManual(fila).rotulo.replace('propuesta del sistema, sin validar', 'propuesta del sistema, sin validar'))
      expect((await lineaVigente([fila]))?.que_es).toContain(validacionDelManual(fila).rotulo)
    }
  })
})

describe('precedencia dueño > jefatura > propuesta', () => {
  it('el rango ordena los tres', () => {
    expect(RANGO_DE_VALIDACION.dueno).toBeGreaterThan(RANGO_DE_VALIDACION.jefatura)
    expect(RANGO_DE_VALIDACION.jefatura).toBeGreaterThan(RANGO_DE_VALIDACION.propuesta)
    const rango = (f: Fila) => validacionDelManual(f).rango
    expect(rango(v('a', 1, true, 'dueno'))).toBeGreaterThan(rango(v('b', 1, true, 'jefatura')))
    expect(rango(v('b', 1, true, 'jefatura'))).toBeGreaterThan(rango(v('c', 1, false)))
    expect(quienValido({ human_validated: true, provenance_tag: { validado_por: 'dueno' } })).toBe('dueno')
  })
})

describe('GUARDA · ningún lector del cerebro calcula la validación por su cuenta', () => {
  const RAIZ = join(__dirname, '..', '..')
  const archivos = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === '__tests__' ? [] : archivos(p)) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [] })
  // lectura de la marca en el código: `.human_validated`, `human_validated ===`, `human_validated ?`, `human_validated:` con valor calculado
  const CALCULA = /\.human_validated\b|\bhuman_validated\s*(===|!==|==|!=|\?\?|\?)/
  const PERMITIDOS = ['manual/campos-del-manual.ts', 'manual/validar-por-jefatura.ts'] // la definición única y quien la escribe al validar
  const lectores = ['cerebro', 'portero-alimenta'].flatMap((c) => archivos(join(RAIZ, c)))

  it('hay archivos que revisar', () => { expect(lectores.length).toBeGreaterThan(20) })
  it('ningún archivo de src/lib/cerebro ni src/lib/portero-alimenta lee `human_validated` para decidir un estado', () => {
    const malos = lectores.filter((p) => !PERMITIDOS.some((ok) => p.replace(/\\/g, '/').endsWith(ok)) && CALCULA.test(readFileSync(p, 'utf8')))
    expect(malos.map((p) => p.replace(RAIZ, ''))).toEqual([])
  })
  it('la guarda sí detecta el defecto (la prueba no es ciega)', () => {
    expect(CALCULA.test("estado: f.human_validated === true ? 'aprobado' : 'borrador sin aprobar'")).toBe(true)
    expect(CALCULA.test("columnas: ['id', 'version', 'human_validated', 'created_at']")).toBe(false)
  })
})
