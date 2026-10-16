/**
 * LAS COLUMNAS QUE EL PORTERO PIDE EXISTEN (16-oct · lección de la corrida de las 00:05 UTC): la auditoría de calidad pedía la columna `entregable`, que NO existe
 * (es una decisión del código, no una columna): la base devolvió un error, el vigilante lo leyó como «no pude comprobar» y APAGÓ el flujo. La base falsa de las pruebas
 * no valida columnas y todo salía verde. Esta guarda lee cada `select` de `cerebro_fichas` del portero y exige que cada nombre sea una columna real.
 * US$ 0 · sin base ni red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** las columnas de `cerebro_fichas` en producción (leídas el 16-oct con `select *`); si una migración agrega una, se agrega aquí */
export const COLUMNAS_DE_CEREBRO_FICHAS = new Set([
  'id', 'client_id', 'ingreso_id', 'ref', 'clase', 'titulo', 'que_es', 'contenido', 'archivo_nombre', 'archivo_tipo', 'archivo_enlace', 'archivo_bytes', 'firmas', 'origen', 'fecha_fuente',
  'reconfirmado_en', 'plazo', 'vigente_hasta', 'version_de', 'retirada_en', 'motivo_retirada', 'huella', 'producto', 'sede', 'propiedad', 'porque', 'descartada', 'motivo_descarte',
  'juzgado_por', 'residual', 'creado_en', 'provenance_tag', 'prueba', 'fuente_url', 'observado_en', 'atributo', 'decision', 'razon_de_decision', 'reemplazada_por', 'alcance',
])

const RAIZ = path.resolve(__dirname, '..')
const archivos = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__tests__' ? [] : archivos(path.join(d, e.name))) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []))

/** los nombres de columna que un texto de código pide a `cerebro_fichas` por `select('…')` o por la constante `campos` */
export function columnasPedidas(codigo: string): string[] {
  const out: string[] = []
  for (const m of codigo.matchAll(/\.from\('cerebro_fichas'\)\s*\.select\('([^']+)'\)/g)) out.push(...m[1].split(',').map((c) => c.trim()))
  for (const m of codigo.matchAll(/const campos = '([^']+)'/g)) out.push(...m[1].split(',').map((c) => c.trim()))
  return out.filter((c) => c && c !== '*')
}

describe('las columnas que el portero pide a cerebro_fichas existen', () => {
  it('ningún select del código del portero nombra una columna que no existe', () => {
    const malas: string[] = []
    for (const a of archivos(RAIZ)) {
      for (const c of columnasPedidas(fs.readFileSync(a, 'utf8'))) if (!COLUMNAS_DE_CEREBRO_FICHAS.has(c)) malas.push(`${path.relative(RAIZ, a)} · ${c}`)
    }
    expect(malas).toEqual([])
  })
  it('la guarda se activa: pedir `entregable` (el caso real) se detecta', () => {
    const roto = "const q = await db.from('cerebro_fichas').select('id, contenido, descartada, retirada_en, entregable').eq('client_id', c)"
    expect(columnasPedidas(roto).filter((c) => !COLUMNAS_DE_CEREBRO_FICHAS.has(c))).toEqual(['entregable'])
    expect(columnasPedidas("const campos = 'id, titulo, tiene_ojos'").filter((c) => !COLUMNAS_DE_CEREBRO_FICHAS.has(c))).toEqual(['tiene_ojos'])
  })
  it('encuentra los select reales (la guarda no queda vacía)', () => {
    const todas = archivos(RAIZ).flatMap((a) => columnasPedidas(fs.readFileSync(a, 'utf8')))
    expect(todas.length).toBeGreaterThan(30)
    expect(todas).toEqual(expect.arrayContaining(['provenance_tag', 'retirada_en', 'descartada']))
  })
})
