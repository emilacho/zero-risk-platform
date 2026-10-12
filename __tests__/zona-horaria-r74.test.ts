/** r74 · F5 · la zona horaria sale de la ficha o del país (tabla de datos); sin dato NO es UTC en silencio. Tres clientes de países y rubros distintos. */
import { describe, expect, it } from 'vitest'
import { paisNormal, zonaDelCliente, zonaValida, ZONA_POR_PAIS } from '../src/lib/zona-horaria/por-pais'

describe('zonaDelCliente', () => {
  it.each([
    ['servicio B2B', { country: 'Colombia' }, 'America/Bogota'],
    ['tienda en línea', { country: 'México.' }, 'America/Mexico_City'],
    ['negocio local', { country: 'ES' }, 'Europe/Madrid'],
    ['país con tilde y mayúsculas', { country: 'PERÚ' }, 'America/Lima'],
    ['alias', { country: 'Rep. Dominicana' }, 'America/Santo_Domingo'],
  ])('%s: la zona sale del país y se declara «por_pais»', (_n, ficha, zona) => { expect(zonaDelCliente(ficha)).toEqual({ zona, origen: 'por_pais' }) })
  it('lo declarado en la ficha gana al país; una zona mal escrita no cuenta', () => {
    expect(zonaDelCliente({ timezone: 'America/Bogota', country: 'España' })).toEqual({ zona: 'America/Bogota', origen: 'declarada' })
    expect(zonaDelCliente({ timezone: 'Mi/Zona', country: 'España' })).toEqual({ zona: 'Europe/Madrid', origen: 'por_pais' })
    expect(zonaDelCliente({ timezone: 'UTC', country: 'Francia' }).origen).toBe('por_pais') // «UTC» sin región no es una declaración de zona de negocio
  })
  it('sin país conocido o sin ficha: SIN DATO (no se asume UTC)', () => {
    for (const f of [{}, { country: '' }, { country: 'País inventado' }, { country: null }, { country: 'Estados Unidos' }]) expect(zonaDelCliente(f)).toEqual({ zona: null, origen: 'sin_dato' })
  })
  it('toda zona de la tabla es una zona real y la tabla no tiene claves con tilde o mayúsculas', () => {
    for (const [k, z] of Object.entries(ZONA_POR_PAIS)) { expect(zonaValida(z), k).toBe(true); expect(k).toBe(paisNormal(k)) }
  })
  it('la lógica no nombra clientes ni lugares de un cliente', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'src/lib/zona-horaria/por-pais.ts'), 'utf8')
    // los nombres de zona IANA (America/…, Europe/…) son DATOS de la tabla, no ciudades de un cliente
    expect(src.replace(/\b(?:America|Europe)\/[A-Za-z_\/]+/g, '')).not.toMatch(/n[aá]ufrago|ol[oó]n|guayaquil|santa elena|p[eé]rez|restaurante|marisc/i)
  })
})
