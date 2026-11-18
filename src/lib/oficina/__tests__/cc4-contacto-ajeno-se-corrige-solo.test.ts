/**
 * 18-nov · GO Lenovo 13:52Z «lo exacto se autocorrige» · un teléfono o un @ que no es del cliente se reemplaza por el del cliente (el primero de su lista), sin modelo.
 * Ante la duda no se toca: sin datos del cliente leídos, un correo, una fecha o una cifra. Y el chequeo de siempre ya no lo encuentra (la pieza no queda frenada por eso). US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { chequeosDePost, type FuentesDelCliente } from '../chequeos'
import { corregirContactoAjeno, corregirContactoDeLaPieza, declaracionDeContacto } from '../contacto-ajeno'
import { datosDeContacto } from '../texto'

const F: FuentesDelCliente = { palabras_prohibidas: [], telefonos: ['0997 744 288', '+593 2 245 6789'], handles: ['@la_marca', 'otra.cuenta'], precios: [], competidores: [], registro: 'tuteo' }

describe('el teléfono ajeno', () => {
  it('🔑 se reemplaza por el PRIMERO del cliente y lo dice; el del cliente (escrito de otra forma) no se toca', () => {
    const r = corregirContactoAjeno('Escríbenos al 0988 111 222 o al +593 997 744 288.', F)
    expect(r.texto).toBe('Escríbenos al 0997 744 288 o al +593 997 744 288.')
    expect(r.cambios).toEqual([{ de: '0988 111 222', a: '0997 744 288', que: 'telefono' }])
    expect(declaracionDeContacto(r.cambios)).toEqual(['se corrigió solo: el teléfono 0988 111 222 → 0997 744 288 (el del cliente)'])
  })
  it('una fecha, un rango o una cifra con miles no son teléfonos: no se tocan', () => {
    const t = 'Del 2026-11-20 al 21/11/2026, de 10-11-12, por 1.250.000 de vistas.'
    expect(corregirContactoAjeno(t, F)).toEqual({ texto: t, cambios: [] })
  })
  it('🔴 cifras DENTRO de un id, una dirección o una palabra no son un teléfono: no se tocan (el id de una foto en el guion se rompía)', () => {
    const t = 'Foto: foto:062ec4fa-aaaa-4aaa-8aaa-000000000099 · ver https://fotos.test/123456789.jpg · ref=0988111222 · lote A0988111222 · #0988111222'
    expect(corregirContactoAjeno(t, F)).toEqual({ texto: t, cambios: [] })
    // solo cifras y una barra (un código o una ruta, sin letras): tampoco
    expect(corregirContactoAjeno('el lote 2026/0988111222 llegó', F).cambios).toEqual([])
    // un teléfono con su signo y separadores sigue siendo teléfono, y uno seguido de coma o punto también
    expect(corregirContactoAjeno('al +57-300-123-4567, o al (02) 2999 888.', F).cambios).toHaveLength(2)
  })
  it('un @ después de una barra (una dirección) no es un usuario', () => {
    const t = 'https://red.social/@otra_marca'
    expect(corregirContactoAjeno(t, F)).toEqual({ texto: t, cambios: [] })
  })
  it('ante la duda no se toca: sin teléfonos del cliente, o marcados como no verificables', () => {
    const t = 'Llama al 0988 111 222'
    expect(corregirContactoAjeno(t, { ...F, telefonos: [] }).cambios).toEqual([])
    expect(corregirContactoAjeno(t, { ...F, telefonos_verificables: false }).cambios).toEqual([])
  })
})

describe('el @ ajeno', () => {
  it('🔑 se reemplaza por el primer usuario del cliente; el punto final queda; los del cliente (con o sin @) no se tocan', () => {
    const r = corregirContactoAjeno('Síguenos en @otra_marca. También @la_marca y @otra.cuenta', F)
    expect(r.texto).toBe('Síguenos en @la_marca. También @la_marca y @otra.cuenta')
    expect(r.cambios).toEqual([{ de: '@otra_marca', a: '@la_marca', que: 'usuario' }])
  })
  it('un correo no es un usuario: «ventas@dominio.com» no se toca', () => {
    const t = 'Escribe a ventas@dominio.com'
    expect(corregirContactoAjeno(t, F)).toEqual({ texto: t, cambios: [] })
  })
  it('ante la duda no se toca: sin usuarios del cliente, o no verificables', () => {
    expect(corregirContactoAjeno('@otra_marca', { ...F, handles: [] }).cambios).toEqual([])
    expect(corregirContactoAjeno('@otra_marca', { ...F, handles_verificables: false }).cambios).toEqual([])
  })
})

describe('la pieza: solo lo que se publica, y el chequeo de siempre ya no lo encuentra', () => {
  it('🔑 pie y llamado corregidos; los demás campos iguales; el chequeo de datos sale limpio', () => {
    const pz = { pie_de_foto: 'Pide al 0988 111 222 · @otra_marca', llamado: 'Llama al 0988 111 222', hashtags: ['#x'], nota_para_quien_publica: 'el 0988 111 222 es de la competencia' }
    const r = corregirContactoDeLaPieza(pz, F)
    expect(r.pieza).toEqual({ ...pz, pie_de_foto: 'Pide al 0997 744 288 · @la_marca', llamado: 'Llama al 0997 744 288' })
    expect(r.declarado).toHaveLength(2)
    const antes = chequeosDePost({ pieza: pz, fuentes: F, limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false } }).filter((f) => /no es del cliente/.test(f.que ?? ''))
    const despues = chequeosDePost({ pieza: r.pieza, fuentes: F, limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false } }).filter((f) => /no es del cliente/.test(f.que ?? ''))
    expect(antes.length).toBeGreaterThan(0)
    expect(despues).toEqual([])
  })
  it('sin nada ajeno, la pieza es la MISMA (no se crea una versión nueva)', () => {
    const pz = { pie_de_foto: 'Pide al 0997 744 288', llamado: 'ya' }
    const r = corregirContactoDeLaPieza(pz, F)
    expect(r.pieza).toBe(pz)
    expect(r.declarado).toEqual([])
  })
  it('lee lo mismo que el chequeo: cada teléfono y usuario que `datosDeContacto` ve como ajeno, se corrige', () => {
    const t = 'Llama al (02) 2999 888, al +57 300 123 4567 o escribe a @cuenta_x y @otra_cuenta_y'
    const r = corregirContactoAjeno(t, F)
    const queda = datosDeContacto(r.texto)
    expect(queda.telefonos.every((x) => ['997744288', '22456789'].some((p) => p.endsWith(x) || x.endsWith(p)))).toBe(true)
    expect(queda.handles.every((h) => h === '@la_marca')).toBe(true)
    expect(r.cambios).toHaveLength(4)
  })
})
