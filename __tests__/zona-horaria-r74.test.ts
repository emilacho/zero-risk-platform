/** r74/r75 · F5 · la zona horaria sale de la ficha o del país (UNA sola tabla: la de las reservas); sin dato NO es UTC en silencio. Clientes de países y rubros distintos. */
import { describe, expect, it } from 'vitest'
import { zonaDelCliente, zonaValida } from '../src/lib/zona-horaria/por-pais'
import { PAISES, zonaDelPais } from '../src/lib/pais/pais-del-cliente'

describe('zonaDelCliente', () => {
  it.each([
    ['servicio B2B', { country: 'Colombia' }, 'America/Bogota'],
    ['tienda en línea', { country: 'Argentina.' }, 'America/Argentina/Buenos_Aires'],
    ['negocio local', { country: 'EC' }, 'America/Guayaquil'],
    ['país con tilde y mayúsculas', { country: 'PERÚ' }, 'America/Lima'],
    ['alias', { country: 'Rep. Dominicana' }, 'America/Santo_Domingo'],
    ['otro continente', { country: 'Francia' }, 'Europe/Paris'],
  ])('%s: la zona sale del país y se declara «por_pais»', (_n, ficha, zona) => { expect(zonaDelCliente(ficha)).toEqual({ zona, origen: 'por_pais' }) })
  it('lo declarado en la ficha gana al país; una zona mal escrita no cuenta', () => {
    expect(zonaDelCliente({ timezone: 'America/Bogota', country: 'Francia' })).toEqual({ zona: 'America/Bogota', origen: 'declarada' })
    expect(zonaDelCliente({ timezone: 'Mi/Zona', country: 'Francia' })).toEqual({ zona: 'Europe/Paris', origen: 'por_pais' })
    expect(zonaDelCliente({ timezone: 'UTC', country: 'Francia' }).origen).toBe('por_pais')
  })
  it('países con varias zonas y países desconocidos: SIN DATO (no se asume UTC); se precisan en la ficha', () => {
    for (const f of [{}, { country: '' }, { country: 'País inventado' }, { country: null }, { country: 'Estados Unidos' }, { country: 'México' }, { country: 'Chile' }, { country: 'España' }, { country: 'Brasil' }]) expect(zonaDelCliente(f), JSON.stringify(f)).toEqual({ zona: null, origen: 'sin_dato' })
    expect(zonaDelCliente({ country: 'México', timezone: 'America/Mexico_City' })).toEqual({ zona: 'America/Mexico_City', origen: 'declarada' })
  })
  it('UNA sola tabla país → zona (la de las reservas): toda zona es real y la de la cadena es exactamente la de `zonaDelPais`', () => {
    for (const p of PAISES) { if (p.zona) expect(zonaValida(p.zona), p.iso2).toBe(true); expect(zonaDelCliente({ country: p.nombres[0] }).zona, p.iso2).toBe(zonaDelPais(p.nombres[0])) }
  })
  it('la lógica no nombra clientes ni lugares de un cliente', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'src/lib/zona-horaria/por-pais.ts'), 'utf8')
    expect(src).not.toMatch(/n[aá]ufrago|ol[oó]n|guayaquil|santa elena|p[eé]rez|restaurante|marisc/i)
  })
})
