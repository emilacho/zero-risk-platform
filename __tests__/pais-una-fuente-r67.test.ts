/** Ronda 67 · D1 · la tabla de países de #495 (código y zona) y la del detector de trato (país → trato) no se apartan: cada país del trato está aquí con su código, y los dos normalizan igual. */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { PAISES, codigoDePais, zonaDelPais } from '../src/lib/pais/pais-del-cliente'

const require = createRequire(import.meta.url)
const trato = require('../src/lib/trato/trato-logica.js') as { POR_PAIS: Record<string, string>; CODIGO_PAIS: Record<string, string>; ALIAS_PAIS: Record<string, string>; paisNormal: (s: unknown) => string }

describe('una sola lista de países', () => {
  it('cada país del trato está en PAISES con el mismo código de dos letras', () => {
    for (const nombre of Object.keys(trato.POR_PAIS)) {
      const iso = Object.entries(trato.CODIGO_PAIS).find(([, n]) => n === nombre)?.[0]
      expect(iso, nombre).toBeDefined()
      expect(codigoDePais(nombre), nombre).toBe(iso!.toUpperCase())
    }
  })
  it('cada código de dos letras del trato apunta a un país de PAISES, y cada alias del trato es un nombre de PAISES', () => {
    for (const [iso, nombre] of Object.entries(trato.CODIGO_PAIS)) { expect(PAISES.some((p) => p.iso2 === iso.toUpperCase() && p.nombres.includes(nombre)), iso).toBe(true) }
    for (const alias of Object.keys(trato.ALIAS_PAIS)) expect(codigoDePais(alias), alias).not.toBeNull()
  })
  it('los dos normalizan igual: «Ecuador.», «EC», tildes y alias dan el mismo país', () => {
    for (const v of ['Ecuador.', 'EC', ' ecuador ', 'República Dominicana', 'Rep. Dominicana', 'Costa Rica', 'ESPAÑA', 'Spain']) {
      const clave = trato.paisNormal(v)
      expect(codigoDePais(v), v).toBe(codigoDePais(clave))
      expect(codigoDePais(v), v).not.toBeNull()
    }
    expect(zonaDelPais('Ecuador.')).toBe('America/Guayaquil')
    expect(codigoDePais('Francia')).toBeNull()
  })
})
