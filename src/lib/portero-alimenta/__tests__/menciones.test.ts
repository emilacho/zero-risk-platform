/** Menciones de terceros (14-oct): publicaciones de OTRAS cuentas que etiquetan o mencionan al negocio. Casos tomados de la corrida real del ensayo (US$ 0,048 por 23 publicaciones). US$ 0. */
import { describe, expect, it } from 'vitest'
import { filtrarUnidad, senalesDe, type ContextoDelCliente } from '../filtro'
import { descubrir } from '../plan'
import { COSTO_MAXIMO_POR_FUNCION } from '../gasto'
import { unidadesDeRaspados } from '../unidades'
import { palabrasDelRubro } from '../alimentar'

const ctx: ContextoDelCliente = { nombre: 'Náufrago', ubicacion: ['Olón', 'Guayaquil'], handles: ['naufrago.ec'], dominios: ['naufrago.ec'], telefonos: [], rubro: palabrasDelRubro('restaurante de mariscos costero') }
const fila = (items: unknown[]) => ({ id: 'men1', apify_function: 'menciones_en_redes', ensayo: false, created_at: '2026-10-14T18:44:00Z', respuesta: items })
const post = (o: Record<string, unknown>) => ({ id: String(Math.random()).slice(2, 12), shortCode: 'S' + String(Math.random()).slice(2, 7), type: 'Image', ownerUsername: 'otra_cuenta', url: 'https://www.instagram.com/p/X/', timestamp: '2026-10-12T10:00:00Z', ...o })
const evaluar = (items: unknown[]) => unidadesDeRaspados([fila(items)], { propios: { handles: ['naufrago.ec'] } }).map((u) => ({ u, v: filtrarUnidad(u, ctx, new Set()) }))

describe('menciones: de la publicación a la unidad', () => {
  it('lleva el pie y las cuentas etiquetadas/mencionadas; es de un tercero, acumula y trae su fecha y dirección', () => {
    const [x] = unidadesDeRaspados([fila([post({ caption: 'Always Cocolon', taggedUsers: ['whospeco', 'naufrago.ec'], mentions: [] })])], { propios: { handles: [] } })
    expect(x).toMatchObject({ fuente: 'mencion', autoria: 'tercero', clase_dato: 'acumula', fecha_fuente: '2026-10-12T10:00:00Z', url: 'https://www.instagram.com/p/X/' })
    expect(x.texto).toBe('always cocolon etiquetado whospeco naufrago ec')
    expect(x.de_ficha_propia).toBeUndefined()
  })
  it('acepta cuentas como texto o como objeto, sin «@», sin repetir', () => {
    const [x] = unidadesDeRaspados([fila([post({ caption: 'Una comida muy rica', taggedUsers: [{ username: 'naufrago.ec' }, { id: 7 }, '@naufrago.ec'], mentions: [{ username: 'amigo' }] })])], { propios: { handles: [] } })
    expect(x.texto).toBe('una comida muy rica etiquetado naufrago ec amigo')
  })
})

describe('menciones: el filtro anti-homónimos las clasifica', () => {
  it('etiqueta a la cuenta propia ⇒ propio, aunque el pie no diga nada (cuenta = identidad)', () => {
    const r = evaluar([post({ caption: 'Always Cocolon', taggedUsers: ['whospeco', 'naufrago.ec'] })])
    expect(r[0].v.estado).toBe('propio')
  })
  it('la cuenta propia en el pie con @ ⇒ propio', () => {
    const r = evaluar([post({ caption: 'El verdadero combo quita chuchaqui en @naufrago.ec ¿Cuál es tu favorito?', taggedUsers: ['naufrago.ec'] })])
    expect(r[0].v.estado).toBe('propio')
  })
  it('publicación que NO etiqueta ni nombra al cliente ⇒ ajeno (no entra)', () => {
    const r = evaluar([post({ caption: 'One of our guest of the season testimonial', taggedUsers: ['thosevaguedays', 'gringoaguirre'] })])
    expect(r[0].v.estado).toBe('ajeno')
  })
  it('nombra «naufrago» sin etiquetar y sin identidad ⇒ sin_confirmar (podría ser un naufragio o un homónimo)', () => {
    const r = evaluar([post({ caption: 'Olón #naufrago #ceviche #playa', taggedUsers: [] }), post({ caption: 'El náufrago fue rescatado en Guayaquil', taggedUsers: [] })])
    expect(r.map((x) => x.v.estado)).toEqual(['sin_confirmar', 'sin_confirmar'])
  })
  it('el nombre de la cuenta sin punto no se toma por la cuenta: «náufrago» con acento no es @naufrago', () => {
    const c2: ContextoDelCliente = { ...ctx, handles: ['naufrago'], dominios: [] }
    expect(senalesDe('Un náufrago llegó a la playa de Olón', c2).identidad).toEqual([])
  })
  it('un pie corto sin sustancia no cuenta como ruido de texto: lo decide la cuenta etiquetada', () => {
    const r = evaluar([post({ caption: '', taggedUsers: ['naufrago.ec'] })])
    expect(r).toHaveLength(1)
    expect(r[0].v.estado).toBe('propio')
  })
  it('la cuenta con punto no se confunde con el nombre pegado: «naufragoec» ≠ «naufrago ec»; y una cuenta parecida no confirma', () => {
    const r = evaluar([post({ caption: 'Rico todo en el naufragoec', taggedUsers: [] }), post({ caption: 'Gracias por la comida', taggedUsers: ['naufrago.ecuador'] })])
    expect(r.map((x) => x.v.estado)).not.toContain('propio')
  })
})

describe('menciones: el interruptor y el costo', () => {
  const base = { cliente: { id: 'C', name: 'Náufrago', website_url: 'https://naufrago.example', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }, ciudad: 'Olón', publicaciones_propias: [] as string[], gastado_hoy_usd: 0 }
  it('apagado: no se pide; encendido: una corrida con la cuenta propia y tope de 30 publicaciones, de un tercero', () => {
    expect(descubrir({ ...base, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false } }).hacer.some((a) => a.funcion === 'menciones_en_redes')).toBe(false)
    const m = descubrir({ ...base, interruptores: { alimentar: true, proponer_busquedas: false, menciones: true, puente_al_indice: false } }).hacer.find((a) => a.funcion === 'menciones_en_redes')!
    expect(m.params).toEqual({ username: ['naufrago.ec'], resultsLimit: 30 })
    expect(m.metadata.target_kind).toBe('third_party')
    expect(m.usd_max).toBeCloseTo(0.14, 6)
  })
  it('costo MEDIDO: 23 publicaciones = US$ 0,048 (US$ 0,0027 por publicación); el techo declarado cubre 50', () => {
    expect(COSTO_MAXIMO_POR_FUNCION.menciones_en_redes).toEqual({ usd: 0.14, medido: true })
    expect(0.0027 * 50).toBeLessThanOrEqual(0.14)
    expect(0.0027 * 23).toBeCloseTo(0.0621, 4)
  })
})
