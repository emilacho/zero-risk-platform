import { describe, it, expect } from 'vitest'
import { esPostDeImagen, fechaLimiteDelBrief, parsearBrief, prohibePersonas, proporcionDelBrief, protagonistasDelBrief, seccionDelBrief } from '../brief'
import { PARTE_REAL } from './memoria'

describe('leer un brief de la parte (texto real del cliente piloto, extracto)', () => {
  const b = parsearBrief(PARTE_REAL, 'BRF-0003')!
  it('encuentra la sección exacta, sin invadir la del brief vecino', () => {
    const s = seccionDelBrief(PARTE_REAL, 'BRF-0003')!
    expect(s.startsWith('### BRF-0003 · Instagram · imagen')).toBe(true)
    expect(s).not.toMatch(/BRF-0005/)
    expect(seccionDelBrief(PARTE_REAL, 'BRF-0099')).toBeNull()
  })
  it('saca red, formato y los campos de una línea', () => {
    expect(b).toMatchObject({ id: 'BRF-0003', red: 'Instagram', formato: 'imagen' })
    expect(b.que_es).toMatch(/Post de imagen fija/); expect(b.protagonista).toMatch(/^El Ceviche/); expect(b.llamado).toMatch(/Pedí al WhatsApp/)
  })
  it('saca las LISTAS como dato (vocabulario obligatorio, prohibido, negativos)', () => {
    expect(b.vocabulario_obligatorio).toEqual(['leche de tigre', 'Olón', 'marisco fresco', 'ceviche', 'directo a tu puerta', 'delivery'])
    expect(b.prohibido).toContain('premium'); expect(b.prohibido).toHaveLength(10)
    expect(b.negativos).toHaveLength(3)
  })
  it('lo que el brief no trae queda vacío (nada se inventa)', () => {
    expect(b.visual_obligatorio).toEqual([]); expect(b.visual_prohibido).toEqual([])
  })
  it('un brief de configuración no es un post de imagen; el de imagen sí', () => {
    expect(esPostDeImagen(parsearBrief(PARTE_REAL, 'BRF-0001')!)).toBe(false)
    expect(esPostDeImagen(b)).toBe(true)
  })
  it('proporción: la primera que menciona LÍMITES; por omisión 1:1', () => {
    expect(proporcionDelBrief(b)).toBe('1:1')
    expect(proporcionDelBrief({ limites: 'vertical 4:5 o 1:1' })).toBe('4:5')
    expect(proporcionDelBrief({ limites: 'sin dato' })).toBe('1:1')
    expect(proporcionDelBrief({ limites: 'sin dato' }, '4:5')).toBe('4:5')
  })
  it('el protagonista es lo que el brief nombra SIN negar («No el encebollado» no cuenta)', () => {
    expect(protagonistasDelBrief(b, ['Ceviches', 'Encebollados', 'Chifle'])).toEqual(['Ceviches'])
    expect(protagonistasDelBrief({ protagonista: 'El Encebollado ($5.50). UNO. No el ceviche, no el combo.' }, ['Ceviches', 'Encebollados'])).toEqual(['Encebollados'])
  })
  it('detecta que el brief prohíbe personas ("No aparecen personas…")', () => {
    expect(prohibePersonas(b)).toBe(true)
    expect(prohibePersonas({ visual: 'Personas disfrutando el plato', negativos: [], visual_prohibido: [] })).toBe(false)
  })
  it('«antes del 14 de octubre de 2026» ⇒ 2026-10-14 a las 00:00; sin fecha completa ⇒ null', () => {
    expect(fechaLimiteDelBrief(b.aprueba)).toEqual({ fecha: '2026-10-14', hora: '00:00' })
    expect(fechaLimiteDelBrief('antes del Día 7')).toBeNull()
    expect(fechaLimiteDelBrief('el 31 de febrerito de 2026')).toBeNull()
  })
})
