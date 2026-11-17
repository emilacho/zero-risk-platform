/**
 * 17-nov · GO Lenovo «quitar rejas» · parte CC3, tramo 2 en la cadena: C1 (trato del país; sin país, el del manual declarado) y C3 (VARIANTES ya no «1» fijo).
 * Una prueba por regla quitada: si vuelve, cae. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { registroDelCliente, reglaDeRegistro } from '../registro'
import { VARIANTES_SIN_DATO } from '../hoja'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('C1 · el trato: manual > ficha > país; sin nada de eso, el de los ejemplos del manual y declarado', () => {
  it('un país con trato conocido manda cuando el manual y la ficha callan', () => {
    expect(registroDelCliente(null, { country: 'Ecuador' }).registro).toBe('tu')
    expect(registroDelCliente(null, { country: 'Argentina' }).registro).toBe('vos')
  })
  it('un país SIN trato en la tabla (Brasil): sin dato, sin inventar; la indicación ya no pide «evitar la segunda persona»', () => {
    const r = registroDelCliente(null, { country: 'Brasil' })
    expect(r.registro).toBe('sin_dato')
    const regla = reglaDeRegistro(r.registro)
    expect(regla).not.toMatch(/segunda persona/)
    expect(regla).toMatch(/escribe con el trato que usen los ejemplos del manual y declara que el trato no está definido/)
    expect(regla).toMatch(/nada se bloquea por el trato/)
  })
  it('un trato fijado sigue siendo LEY del cliente (no se toca)', () => {
    expect(reglaDeRegistro('tu')).toBe('Escribe en tuteo (tú). Nada de voseo.')
  })
})

describe('C3 · VARIANTES: ningún dato las fija, ya no «1» fijo', () => {
  it('la hoja escribe que las decide la mesa, no un número inventado', () => {
    expect(VARIANTES_SIN_DATO).not.toMatch(/^\d+$/)
    expect(VARIANTES_SIN_DATO).toMatch(/las que decida la mesa de la pieza/)
    const fuente = readFileSync(join(__dirname, '..', 'hoja.ts'), 'utf8')
    expect(fuente).not.toMatch(/campo\('VARIANTES', '\d+'\)/)
    expect(fuente).toMatch(/campo\('VARIANTES', VARIANTES_SIN_DATO\)/)
  })
})
