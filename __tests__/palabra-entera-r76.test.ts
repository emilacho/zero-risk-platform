/** r76 · coincidencia por PALABRA ENTERA (reparo A.4-1 de CC#3): una función compartida; casos trampa de rubros que NO deben caer en un paquete ajeno. */
import { describe, expect, it } from 'vitest'
import { claveNormal, clavesQueCoinciden, coincideAlguna, coincideClave } from '../src/lib/texto/clave-de-rubro'
import { PAQUETES_DE_FABRICA, industriaCoincide, lexicoDeLaIndustria } from '../src/lib/cadena/lexico-por-rubro'
import { BATERIA_DE_RUBROS } from '../src/lib/rubros-de-prueba/baterias'
import { hallarAfirmaciones } from '../src/lib/cadena/afirmaciones'
import { mismoTelefono } from '../src/lib/oficina/texto'
import { formasDeOtroRegistro } from '../src/lib/cadena/registro'
import { importesEnTexto } from '../src/lib/moneda/por-pais'

const paquetesDe = (industria: string): string[] => Object.entries(PAQUETES_DE_FABRICA).filter(([, p]) => industriaCoincide(industria, p.industria)).map(([k]) => k)

describe('coincideClave · palabra entera, raíz solo con asterisco', () => {
  it.each([
    ['barbería', 'bar', false], ['tienda de barrio', 'bar', false], ['bar y restaurante', 'bar', true], ['bares de tapas', 'bar', true],
    ['autoescuela (carnet de conducir)', 'carne', false], ['carnes y embutidos', 'carne', true],
    ['productora audiovisual', 'producto', false], ['venta de productos del campo', 'producto', true],
    ['academia online de modalidad virtual', 'moda', false], ['tienda de moda', 'moda', true],
    ['consultoría de comercio exterior', 'comercio electronico', false],
    ['apicultura y miel', 'api', false], ['API pública', 'api', true],
    ['unas cabañas familiares', 'uñas', false], ['salón de uñas', 'uñas', true], ['cabañas familiares', 'cabañ*', true], ['cabaña', 'cabañ*', true],
    ['Café de altura', 'cafe', true], ['cafetería', 'cafe', false], ['cafetería', 'cafeter*', true], ['peluquería canina', 'peluquer*', true],
    ['agencia de viajes', 'agencia de viajes', true], ['agencia de viajes y turismo', 'agencia de viajes', true], ['mi agencia de seguros', 'agencia de viajes', false],
  ])('«%s» vs «%s» → %s', (texto, clave, esperado) => { expect(coincideClave(texto, clave)).toBe(esperado) })

  it('la ñ no es la n; sin tildes y sin mayúsculas; vacío no coincide con nada', () => {
    expect(claveNormal('Cabañas')).not.toBe(claveNormal('Cabanas'))
    expect(coincideClave('CAFÉ', 'cafe')).toBe(true)
    expect(coincideClave('texto', '')).toBe(false); expect(coincideClave('', 'bar')).toBe(false); expect(coincideClave(null, 'bar')).toBe(false)
    expect(coincideClave('x', '*')).toBe(false)
  })
  it('el plural simple cuenta; una raíz con asterisco solo vale al comienzo de palabra', () => {
    expect(coincideClave('tiendas online', 'tienda')).toBe(true); expect(coincideClave('exportadores', 'exportador')).toBe(true)
    expect(coincideClave('lavandería', 'ander*')).toBe(false)
    expect(coincideClave('abogados penalistas', 'abogad*')).toBe(true)
  })
  it('coincideAlguna / clavesQueCoinciden', () => {
    expect(coincideAlguna('barbería', ['bar', 'barber*'])).toBe(true)
    expect(clavesQueCoinciden('barbería', ['bar', 'barber*', 'peluquer*'])).toEqual(['barber*'])
    expect(coincideAlguna('lo que sea', [])).toBe(false)
  })
})

describe('paquetes de léxico por rubro · casos trampa', () => {
  it.each([
    ['barbería', []], ['tienda de barrio', ['bienes']], ['autoescuela (carnet de conducir)', []], ['productora audiovisual', []],
    ['academia online de modalidad virtual', []], ['consultoría de comercio exterior', []], ['apicultura y miel', []], ['cabañas familiares', []],
    ['clínica dental', []], ['software de contabilidad', []], ['restaurante de mariscos', ['alimentos']], ['panadería artesanal', ['alimentos', 'bienes']],
    ['Tienda de ropa', ['bienes']], ['Bar y cafetería', ['alimentos']], ['carnes y embutidos', ['alimentos']], ['comercio electrónico', ['bienes']],
  ])('%s → paquetes %j', (industria, esperado) => { expect(paquetesDe(industria).sort()).toEqual([...esperado].sort()) })

  it('una barbería, una autoescuela y una productora NO reciben alertas de frescura u origen', () => {
    for (const industria of ['barbería', 'autoescuela (carnet de conducir)', 'productora audiovisual', 'academia online de modalidad virtual', 'consultoría de comercio exterior']) {
      const lex = lexicoDeLaIndustria(industria)
      const marcas = hallarAfirmaciones('Cortes frescos cada día. Productos de Italia. Traemos todo recién horneado de Loja.', [], { lexico: lex }).map((a) => a.subtipo)
      expect(marcas, industria).not.toContain('frescura'); expect(marcas, industria).not.toContain('origen')
    }
  })
  it('un restaurante sí conserva sus alertas', () => {
    const marcas = hallarAfirmaciones('Pan recién horneado todos los días.', [], { lexico: lexicoDeLaIndustria('restaurante') }).map((a) => a.subtipo)
    expect(marcas).toContain('frescura')
  })
  it('la batería compartida: ningún rubro de prueba cae en un paquete que no es suyo', () => {
    const esperado: Record<string, string[]> = { comida: ['alimentos'], clinica: [], tienda_saas: [], servicio_b2b: [] }
    for (const c of BATERIA_DE_RUBROS) {
      const industria = ({ comida: 'restaurante', clinica: 'clínica odontológica', tienda_saas: 'software como servicio (SaaS)', servicio_b2b: 'consultoría empresarial' } as Record<string, string>)[c.rubro]!
      expect(paquetesDe(industria), c.rubro).toEqual(esperado[c.rubro])
    }
  })
})

describe('la función es la única forma de comparar claves de rubro', () => {
  it('lexico-por-rubro no tiene «contiene» sobre texto de industria', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'src/lib/cadena/lexico-por-rubro.ts'), 'utf8')
    expect(src).toMatch(/coincideAlguna/); expect(src).not.toMatch(/t\.includes\(/)
  })
})

// ───────────────────────── reparos 2, 3 y 4 de CC#3 (A.4)
describe('A.4-2 · teléfonos fijos con y sin prefijo de país', () => {
  it.each([
    ['(02) 2456789', '+593 2 245 6789', true], ['+593 2 245 6789', '02 2456789', true], ['0997 744 288', '+593 997 744 288', true], ['+57 300 123 4567', '300 123 4567', true],
    ['+34 91 123 45 67', '911 234 567', true], ['(02) 2456789', '(02) 2456780', false], ['0997 744 288', '+593 998 744 288', false], ['123456', '123456', false],
  ])('%s ~ %s → %s', (a, b, esperado) => { expect(mismoTelefono(a, b)).toBe(esperado) })
})
describe('A.4-3 · el voseo en un cliente de tuteo se detecta con el detector del trato', () => {
  it('tuteo marca los mismos que usted', () => {
    const t = 'Pedilo ahora, mirá nuestra carta y venite'
    const tu = formasDeOtroRegistro('tu', t).map((x) => x.toLowerCase())
    expect(tu.length).toBeGreaterThanOrEqual(3)
    expect(tu).toEqual(expect.arrayContaining(['pedilo', 'venite']))
    expect(formasDeOtroRegistro('usted', t).length).toBe(tu.length)
  })
  it('tuteo limpio no marca nada; sin dato tampoco', () => {
    expect(formasDeOtroRegistro('tu', 'Pídelo ahora, mira nuestra lista y ven a vernos')).toEqual([])
    expect(formasDeOtroRegistro('sin_dato', 'Pedilo ahora')).toEqual([])
  })
})
describe('A.4-4 · «45.000 pesos» es un precio', () => {
  it('con la palabra de la moneda', () => {
    expect(importesEnTexto('desde 45.000 pesos').map((x) => [x.valor, x.moneda, x.ambigua])).toEqual([[45000, null, true]])
    expect(importesEnTexto('12 dólares y 8 euros y 30 soles').map((x) => [x.valor, x.moneda])).toEqual([[12, 'USD'], [8, 'EUR'], [30, 'PEN']])
    expect(importesEnTexto('un sol por persona solo hoy')).toEqual([])
  })
})
