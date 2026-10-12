/**
 * Ronda 75 · BATERÍA DE RUBROS Y REGISTROS (H11) · las sondas de la auditoría agnóstica de CC#3 quedan como pruebas permanentes para todos.
 * Rubros: alimentos · bienes (tienda) · clínica · software · servicios · gimnasio · enseñanza. Países/registros: tuteo (Ecuador · Colombia · México · España) y voseo (Argentina · Uruguay) y usted (Costa Rica) y sin dato.
 * Lo que NO debe marcarse no se marca; lo que sí, se marca solo en el rubro que lo vende.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hallarAfirmaciones } from '../src/lib/cadena/afirmaciones'
import { lexicoDelCliente, lexicoDeLaIndustria, PAQUETES_DE_FABRICA, paquetesDesdeConfig } from '../src/lib/cadena/lexico-por-rubro'
import { formasDeOtroRegistro, reglaDeRegistro, registroDelCliente } from '../src/lib/cadena/registro'
import { tareaDeCalendario, tareaDeEstrategia } from '../src/lib/cadena/indicaciones'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'
import { chequeosDePost, type ContextoDeChequeo } from '../src/lib/oficina/chequeos'
import { digitosDeTelefono } from '../src/lib/oficina/texto'
import { codigoDeMoneda, importesEnTexto, monedaDelCliente, MONEDA_POR_PAIS, numeroDeImporte } from '../src/lib/moneda/por-pais'

const flags = (tema: string, industria: string | null, conocidos: string[] = []) => hallarAfirmaciones(tema, conocidos, { lexico: lexicoDelCliente(industria, null) }).map((h) => h.subtipo)

describe('H3 · el léxico base es ESTRUCTURAL y los paquetes se cargan por la industria de la ficha', () => {
  const SIN_ALERTA: Array<[string, string, string]> = [
    ['tienda de moda', 'Colección fresca de temporada para tu armario', 'adjetivo figurado en un rubro que no vende frescura'],
    ['consultoría para empresas', 'Una propuesta fresca y moderna para tu empresa', 'sin paquete'],
    ['servicios profesionales', 'Servicio disponible hoy mismo para tu consulta', 'sin paquete'],
    ['software', 'Software hecho a mano para tu equipo', 'sin paquete'],
    ['clínica de salud', 'Nuestros pacientes vienen de Quito', 'sujeto: personas'],
    ['gimnasio', 'Clase de yoga al aire libre', 'nada que respaldar'],
    ['fisioterapia', 'Una sesión de fisioterapia cada semana', 'nada que respaldar'],
    ['enseñanza', 'Explicamos qué es una auditoría y por qué conviene hacerla', 'texto explicativo'],
    ['agencia de viajes', 'Los viajeros llegan de todo el país', 'personas'],
  ]
  it.each(SIN_ALERTA)('[%s] «%s» NO se marca (%s)', (industria, tema) => { expect(flags(tema, industria)).toEqual([]) })
  it('la base marca lo estructural en CUALQUIER rubro: cifras, dinero, medidas, %, certificación, garantía, superlativos', () => {
    for (const [tema, tipo] of [['Cursos certificados por Cambridge', 'certificacion'], ['Garantizado por escrito', 'garantia'], ['Somos la mejor opción', 'superlativo'], ['Más de 500 usuarios activos', 'cantidad'], ['Ahorra 30 %', 'porcentaje'], ['Desde 2015 contigo', 'historia'], ['Cuesta € 40', 'dinero'], ['Plan por S/ 30 al mes', 'dinero'], ['Paga COP 45.000', 'dinero'], ['Pesa 500 g', 'medida']] as const) {
      for (const industria of ['software', 'tienda de moda', 'restaurante de comida', null]) expect(hallarAfirmaciones(tema, [], { lexico: lexicoDelCliente(industria, null) }).map((h) => h.subtipo), `${industria} · ${tema}`).toContain(tipo)
    }
  })
  it('frescura, origen, porción, composición e historia de receta SOLO se marcan donde el rubro las vende', () => {
    const alimentos = 'restaurante de comida', bienes = 'tienda de productos'
    expect(flags('El pescado llega el mismo día', alimentos)).toContain('frescura'); expect(flags('El pescado llega el mismo día', 'software')).toEqual([])
    expect(flags('Dos platos alcanzan para cuatro', alimentos)).toContain('porcion'); expect(flags('Dos platos alcanzan para cuatro', bienes)).toEqual([])
    expect(flags('Producto hecho a mano', bienes)).toContain('composicion'); expect(flags('Producto hecho a mano', 'clínica de salud')).toEqual([])
    expect(flags('Recién llegados a la tienda', bienes)).toContain('frescura')
    expect(flags('Camarón y pescado de Olón', alimentos, ['Olón'])).toContain('origen_lugar'); expect(flags('Camarón y pescado de Olón', 'consultoría')).toEqual([])
    expect(flags('Receta de la abuela', alimentos)).toContain('historia')
  })
  it('aun en el rubro que SÍ vende frescura: el ambiente, el adjetivo figurado y las personas como sujeto no se marcan', () => {
    for (const t of ['Ambiente fresco en la terraza', 'Una mirada fresca a tu marca', 'Propuesta fresca y moderna', 'Nuestros pacientes vienen de Quito', 'Los clientes llegan de Lima y Bogotá', 'Reseña de Ana', 'Guía de la ciudad para el fin de semana'])
      expect(flags(t, 'restaurante de comida', ['Quito']), t).toEqual([])
  })
  it('la configuración manda: un paquete de `cadena_config` reemplaza al de fábrica y puede agregar un rubro nuevo sin publicar', () => {
    const cfg = { paquetes: { cosecha: { industria: ['vivero'], lexico: { patrones: [{ subtipo: 'frescura', re: '\\bcosecha del dia\\b' }] } }, alimentos: { industria: ['comida'], lexico: { patrones: [] } } } }
    expect(Object.keys(paquetesDesdeConfig(cfg))).toEqual(['cosecha', 'alimentos'])
    expect(hallarAfirmaciones('Cosecha del día', [], { lexico: lexicoDelCliente('vivero de plantas', cfg) }).map((h) => h.subtipo)).toContain('frescura')
    expect(hallarAfirmaciones('El pescado llega el mismo día', [], { lexico: lexicoDelCliente('restaurante de comida', cfg) }).map((h) => h.subtipo)).toEqual([])
    expect(paquetesDesdeConfig(null)).toEqual({}); expect(paquetesDesdeConfig({ paquetes: { x: { industria: 'no es lista' } } })).toEqual({})
  })
  it('los paquetes de fábrica y la base no nombran un cliente, un lugar ni una marca', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/cadena/lexico-por-rubro.ts'), 'utf8') + readFileSync(join(process.cwd(), 'src/lib/cadena/registro.ts'), 'utf8') + readFileSync(join(process.cwd(), 'src/lib/moneda/por-pais.ts'), 'utf8')
    expect(src).not.toMatch(/n[aá]ufrago|ol[oó]n\b|guayaquil|santa elena|p[eé]rez|peniche|cuenca|monta[ñn]ita/i)
    expect(Object.keys(PAQUETES_DE_FABRICA)).toEqual(['alimentos', 'bienes']); expect(lexicoDeLaIndustria(null).patrones).toBeUndefined()
  })
})

describe('H2 · el registro del cliente entra a la cadena (3 registros + sin dato)', () => {
  const c = clienteA()
  const ficha = (country: string, extra: Record<string, unknown> = {}) => ({ country, config: extra })
  it.each([
    ['Ecuador', 'tu'], ['Colombia', 'tu'], ['México', 'tu'], ['España', 'tu'], ['Argentina', 'vos'], ['Uruguay', 'vos'], ['Costa Rica', 'usted'], ['País inventado', 'sin_dato'],
  ])('el país %s sin manual que lo diga ⇒ %s', (pais, esperado) => { expect(registroDelCliente({}, ficha(pais)).registro).toBe(esperado) })
  it('el manual manda sobre el país, y un manual en conflicto no elige', () => {
    expect(registroDelCliente({ tone_guidelines: { trato: 'vos' } }, ficha('Ecuador'))).toMatchObject({ registro: 'vos', fuente: 'manual' })
    expect(registroDelCliente({}, ficha('Argentina', { trato: 'tuteo' })).registro).toBe('tu')
    expect(registroDelCliente({ voice_description: 'Tutea al cliente; también usa vos en historias' }, ficha('Ecuador')).registro).toBe('sin_dato')
  })
  it('las indicaciones llevan el registro del cliente (y NO el «tuteo» fijo del proyecto)', () => {
    for (const [reg, debe, noDebe] of [['tu', /tuteo \(tú\)\. Nada de voseo/, /voseo \(vos\)/], ['vos', /voseo \(vos\)\. Nada de tuteo/, /Escribe en tuteo/], ['usted', /usted\. Nada de tuteo ni de voseo/, /Escribe en tuteo/], ['sin_dato', /no está fijado/, /Escribe en tuteo/]] as const) {
      const ctx = { ...contextoDe(c), registro: reg }
      const e = tareaDeEstrategia({ ctx, formatosPermitidos: {}, version: 1 })
      expect(e).toMatch(debe); expect(e).not.toMatch(noDebe)
      expect(reglaDeRegistro(reg)).toMatch(debe)
      const cal = tareaDeCalendario({ ctx, estrategia: c.estrategia, tanda: 1, semanas: [1], filasPrevias: [] } as never)
      expect(cal).toMatch(debe)
    }
  })
  it('V15: se bloquean las formas de OTRO registro solo si el registro está fijado', () => {
    expect(formasDeOtroRegistro('tu', 'Vení y probá el café').length).toBeGreaterThan(0)
    expect(formasDeOtroRegistro('tu', 'Ven y prueba el café; tú decides')).toEqual([])
    expect(formasDeOtroRegistro('vos', 'Vení y probá el café; decime qué pensás')).toEqual([])
    expect(formasDeOtroRegistro('vos', 'Ven y prueba el café; tú decides').length).toBeGreaterThan(0)
    expect(formasDeOtroRegistro('usted', 'Ven y prueba el café').length).toBeGreaterThan(0)
    expect(formasDeOtroRegistro('sin_dato', 'Vení y probá el café; ven y prueba')).toEqual([]); expect(formasDeOtroRegistro(undefined, 'Vení')).toEqual([])
  })
})

describe('H5 · la moneda y el teléfono del cliente (no los del primer cliente)', () => {
  const base = (moneda: string | null, precios: string[], telefonos: string[], pie: string): ContextoDeChequeo => ({
    pieza: { pie_de_foto: pie, hashtags: [] }, limites: { pie_de_foto_max: 2200, hashtags_max: 10, limites_verificados: true },
    fuentes: { palabras_prohibidas: [], telefonos, handles: [], precios, competidores: [], moneda, registro: 'tuteo', telefonos_verificables: telefonos.length > 0 },
  })
  const dice = (c: ContextoDeChequeo) => chequeosDePost(c).map((f) => `${f.gravedad}:${f.que}`)
  it('pesos colombianos: «COP 45.000» y «$ 45.000» coinciden con la lista (45000); otro precio o otra moneda bloquean', () => {
    expect(dice(base('COP', ['45000.00'], [], 'Combo por COP 45.000 hoy'))).toEqual([])
    expect(dice(base('COP', ['45000.00'], [], 'Combo por $ 45.000'))).toEqual([])
    expect(dice(base('COP', ['45000.00'], [], 'Combo por 45.000 COP'))).toEqual([])
    expect(dice(base('COP', ['45000.00'], [], 'Combo por COP 50.000')).join('|')).toMatch(/bloquea:precio COP 50\.000 que no está en la lista de precios publicada/)
    expect(dice(base('COP', ['45000.00'], [], 'Combo por US$ 10')).join('|')).toMatch(/bloquea:precio US\$ 10 en otra moneda \(la del cliente es COP\)/)
  })
  it('soles, euros, pesos mexicanos y dólares', () => {
    expect(dice(base('PEN', ['30.00'], [], 'Plan por S/ 30'))).toEqual([]); expect(dice(base('PEN', ['30.00'], [], 'Plan por S/ 35')).join('|')).toMatch(/bloquea/)
    expect(dice(base('EUR', ['12.50'], [], 'Menú por 12,50 €'))).toEqual([]); expect(dice(base('EUR', ['12.50'], [], 'Menú por €12.50'))).toEqual([])
    expect(dice(base('MXN', ['99.00'], [], 'Oferta de $99'))).toEqual([]); expect(dice(base('MXN', ['99.00'], [], 'Oferta de $120')).join('|')).toMatch(/bloquea/)
    expect(dice(base('USD', ['7.00'], [], 'Ceviche a US$ 7'))).toEqual([]); expect(dice(base('USD', ['7.00'], [], 'Ceviche a $7,00'))).toEqual([])
  })
  it('sin lista de precios es sugerencia; sin moneda declarada un «$» se compara solo por el importe y una moneda explícita no se juzga', () => {
    expect(dice(base('USD', [], [], 'Ceviche a $7')).join('|')).toMatch(/^sugerencia:precio \$7 sin lista de precios publicada/)
    expect(dice(base(null, ['7.00'], [], 'Ceviche a $7'))).toEqual([]); expect(dice(base(null, ['7.00'], [], 'Ceviche a €7'))).toEqual([])
  })
  it('teléfono de cualquier país: el mismo número con y sin prefijo es el mismo; otro número bloquea', () => {
    for (const [propio, escrito] of [['+57 300 123 4567', '300 123 4567'], ['300 123 4567', '+57 300 123 4567'], ['+593 997 744 288', '0997 744 288'], ['0997 744 288', '+593 997 744 288'], ['+34 612 345 678', '612 345 678'], ['+52 55 1234 5678', '55 1234 5678']])
      expect(dice(base('COP', ['1.00'], [propio], `Escríbenos al ${escrito}`)).filter((x) => /teléfono/.test(x)), `${propio} ~ ${escrito}`).toEqual([])
    expect(dice(base('COP', ['1.00'], ['+57 300 123 4567'], 'Escríbenos al +57 311 999 8888')).join('|')).toMatch(/bloquea:teléfono/)
    expect(digitosDeTelefono('+57 (300) 123-4567')).toBe('001234567'); expect(digitosDeTelefono('012345')).toBe('12345')
  })
  it('importes: separadores de miles y decimales en los dos estilos', () => {
    for (const [s, n] of [['45.000', 45000], ['1,250.50', 1250.5], ['1.250,50', 1250.5], ['12,50', 12.5], ['3.5', 3.5], ['7', 7], ['1.000.000', 1000000]] as const) expect(numeroDeImporte(s), s).toBe(n)
    expect(importesEnTexto('desde COP 45.000 o $ 30 y 12 EUR').map((x) => [x.valor, x.moneda, x.ambigua])).toEqual([[45000, 'COP', false], [30, null, true], [12, 'EUR', false]])
  })
  it('la moneda sale de la ficha y, si no, del país; y es LA MISMA tabla que usa el flujo de planeación', () => {
    expect(monedaDelCliente({ country: 'Colombia' }).codigo).toBe('COP'); expect(monedaDelCliente({ country: 'México', config: { currency: 'usd' } })).toMatchObject({ codigo: 'USD', fuente: 'declarada en la ficha o el manual' })
    expect(monedaDelCliente({ country: 'Nowhere' }).codigo).toBeNull(); expect(codigoDeMoneda('dólares')).toBe('USD')
    const modulo = readFileSync(join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS/plan-primer-nivel.js'), 'utf8')
    const deFlujo = new Function(modulo + '\nreturn MONEDA_POR_PAIS')() as Record<string, string>
    expect(deFlujo).toEqual(MONEDA_POR_PAIS)
  })
})
