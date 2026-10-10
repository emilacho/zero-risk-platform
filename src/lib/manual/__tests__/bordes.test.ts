/** los bordes que las mutaciones dejaron vivos: tope exacto de la evidencia del juez, varios usuarios propios, datos estructurados anidados */
import { describe, expect, it } from 'vitest'
import { esFilaPropia, evidenciaParaElJuez, resumirEstructurado } from '..'
import { F } from './apoyo'

describe('bordes', () => {
  it('evidencia del juez: lo que cabe justo en el tope entra entero; lo que no, se recorta con aviso solo si sobra espacio útil', () => {
    const a = F('a', 'primaria_propia', 'x'.repeat(100))
    const bloque = `## ${a.rotulo}\n${'x'.repeat(100)}\n\n`
    expect(evidenciaParaElJuez([a], bloque.length).recortada).toBe(false) // cabe exacto
    expect(evidenciaParaElJuez([a], bloque.length - 1).recortada).toBe(true)
    // con poco espacio restante (≤ 200) no se mete un trozo inútil: la fuente se omite, pero se dice que se recortó
    const e = evidenciaParaElJuez([a, F('b', 'primaria_propia', 'y'.repeat(500))], bloque.length + 200)
    expect(e.recortada).toBe(true); expect(e.fuentes_usadas).toEqual(['a'])
    const g = evidenciaParaElJuez([a, F('b', 'primaria_propia', 'y'.repeat(500))], bloque.length + 201)
    expect(g.fuentes_usadas).toEqual(['a', 'b']); expect(g.texto).toMatch(/recortado: se leyeron 201 de/)
  })
  it('esFilaPropia con varios usuarios propios: basta UNO de ellos', () => {
    const propios = { sitio: null, handles: ['uno', 'dos'], otros: ['tres'] }
    expect(esFilaPropia({ apify_function: 'instagram_scraper', params: { usernames: ['dos'] } }, propios)).toBe(true)
    expect(esFilaPropia({ apify_function: 'instagram_scraper', params: { usernames: ['tres'] } }, propios)).toBe(true)
    expect(esFilaPropia({ apify_function: 'instagram_scraper', params: { usernames: ['cuatro'] } }, propios)).toBe(false)
    expect(esFilaPropia({ apify_function: 'instagram_scraper', params: { usernames: ['uno'] } }, { sitio: null, handles: [] })).toBe(false)
    expect(esFilaPropia({ apify_function: 'website_content_scraper', params: { url: 'https://x.test' } }, { sitio: null, handles: [] })).toBe(false)
  })
  it('datos estructurados anidados (@graph), como texto JSON y con objetos dentro de objetos; sin volcar el JSON', () => {
    const r = resumirEstructurado({ '@graph': [{ '@type': 'Org', name: 'Uno', address: 'Calle 9' }, { '@type': 'Place', description: 'Un lugar', telephone: '123' }] })
    expect(r).toContain('Org · name: Uno'); expect(r).toContain('dirección: Calle 9'); expect(r).toContain('Place · description: Un lugar'); expect(r).toContain('Place · telephone: 123')
    expect(resumirEstructurado(JSON.stringify([{ '@type': 'X', name: 'Texto JSON' }]))).toContain('X · name: Texto JSON')
    expect(resumirEstructurado(['no es json', 42, null])).toBe('')
    expect(resumirEstructurado({ a: { b: { c: { d: { '@type': 'Z', name: 'muy hondo' } } } } })).toBe('') // más allá de la profundidad útil no se baja
    expect(resumirEstructurado({ wrapper: { '@type': 'Y', name: 'Dentro' } })).toContain('Y · name: Dentro')
  })
})
