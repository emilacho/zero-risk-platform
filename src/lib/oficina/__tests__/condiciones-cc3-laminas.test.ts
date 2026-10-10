/** Condiciones de CC#3 · #469 H3/H4: lo que sus mutaciones dejaron vivo (foto_slot, cifras, límites exactos, clasificadores de formato). */
import { describe, it, expect } from 'vitest'
import { armarLaminasDeKit, cifrasFueraDeFuentes, problemasDeContrato, problemasDeHistoria, problemasDeKit } from '../laminas'
import { LIMITES_DE_LAMINA } from '../salida'
import { esCarrusel, esKitDeHistorias, esPostDeImagen, type BriefLeido } from '../brief'

const brief = (o: Partial<BriefLeido>) => ({ id: 'BRF-9', red: '', formato: '', que_es: '', protagonista: '', mensaje: '', limites: '', vocabulario_obligatorio: [], ...o }) as BriefLeido
const L = (o: Record<string, unknown> = {}) => ({ rol: 'hook', headline: 'Hola', ...o }) as never
const E = (ref: string, foto_slot?: string) => ({ ref, rol: 'r', beat: 'b', mood: 'm', ...(foto_slot ? { foto_slot } : {}) })

describe('foto_slot decide qué imagen lleva cada elemento del kit', () => {
  const img = (url: string) => ({ origen: 'real' as const, url })
  const copia = [{ ref: 'e01', headline: 'Uno' }, { ref: 'e02', headline: 'Dos' }]
  it('con foto_slot usa la imagen de ESE slot; sin él, la de su propio ref; slot sin imagen cae a su ref', () => {
    const imgs = { e01: img('https://x/1.png'), e02: img('https://x/2.png') }
    expect(armarLaminasDeKit([E('e01', 'e02'), E('e02')], copia, imgs).slides.map((s) => s.background_image_url)).toEqual(['https://x/2.png', 'https://x/2.png'])
    expect(armarLaminasDeKit([E('e01'), E('e02', 'e99')], copia, imgs).slides.map((s) => s.background_image_url)).toEqual(['https://x/1.png', 'https://x/2.png'])
    expect(armarLaminasDeKit([E('e01'), E('e02')], copia, { e01: img('https://x/1.png') }).slides.map((s) => s.background_image_url)).toEqual(['https://x/1.png', null])
  })
})

describe('cifras: el porcentaje inventado bloquea, la cifra suelta avisa; se valida por PRESENCIA', () => {
  it('porcentaje vs cifra', () => {
    expect(cifrasFueraDeFuentes(['Ahorra 35% hoy'], ['precio 12'])).toEqual([{ cifra: '35%', porcentaje: true }])
    expect(cifrasFueraDeFuentes(['Más de 45 platos'], ['precio 12'])).toEqual([{ cifra: '45', porcentaje: false }])
    expect(cifrasFueraDeFuentes(['Ahorra 35% hoy'], ['descuento del 35% en octubre'])).toEqual([])
    expect(cifrasFueraDeFuentes(['Ahorra 25% hoy'], ['son 25 mesas'])).toEqual([])
  })
  it('LÍMITE DECLARADO: un «30» de otra cosa en las fuentes deja pasar «30 años»', () => {
    expect(cifrasFueraDeFuentes(['Llevamos 30 años'], ['El menú cuesta 30 dólares'])).toEqual([])
    expect(cifrasFueraDeFuentes(['Llevamos 31 años'], ['El menú cuesta 30 dólares'])).toEqual([{ cifra: '31', porcentaje: false }])
  })
})

describe('límites exactos del contrato de lámina', () => {
  const cant = { laminas_min: 3, laminas_max: 5 }
  const n = (k: number) => Array.from({ length: k }, () => L())
  it('cantidad: 2 y 6 fallan; 3 y 5 pasan', () => {
    expect(problemasDeContrato(n(2), cant).length).toBe(1)
    expect(problemasDeContrato(n(3), cant)).toEqual([])
    expect(problemasDeContrato(n(5), cant)).toEqual([])
    expect(problemasDeContrato(n(6), cant).length).toBe(1)
  })
  it('caracteres: el tope exacto pasa, uno más falla', () => {
    for (const c of ['eyebrow', 'headline', 'body', 'cta'] as const) {
      const tope = LIMITES_DE_LAMINA[c]
      const resto = n(3).slice(1)
      expect(problemasDeContrato([L({ [c]: 'a'.repeat(tope) }), ...resto], cant), c).toEqual([])
      expect(problemasDeContrato([L({ [c]: 'a'.repeat(tope + 1) }), ...resto], cant).length, c).toBe(1)
    }
  })
  it('un solo llamado a la acción; rol conocido', () => {
    expect(problemasDeContrato([L({ cta: 'Ya' }), L({ cta: 'Ya' }), L()], cant).length).toBe(1)
    expect(problemasDeContrato([L({ cta: 'Ya' }), L({ cta: '  ' }), L()], cant)).toEqual([])
    expect(problemasDeContrato([L({ rol: 'inventado' }), L(), L()], cant).length).toBe(1)
  })
  it('historias: tope exacto de titular y de texto', () => {
    const lim = { headline_historia: 40, body_historia: 100 }
    expect(problemasDeHistoria([{ ref: 'e01', headline: 'a'.repeat(40), body: 'b'.repeat(100) }], lim)).toEqual([])
    expect(problemasDeHistoria([{ ref: 'e01', headline: 'a'.repeat(41) }], lim).length).toBe(1)
    expect(problemasDeHistoria([{ ref: 'e01', headline: 'a', body: 'b'.repeat(101) }], lim).length).toBe(1)
  })
  it('kit: elemento sin lámina y dos en el mismo día, hora y destino', () => {
    const els = [{ ref: 'e01', fecha: '2026-10-12', hora: '09:00', destino: 'historia' }, { ref: 'e02', fecha: '2026-10-12', hora: '09:00', destino: 'historia' }, { ref: 'e03', fecha: '2026-10-12', hora: '09:00', destino: 'estado' }]
    expect(problemasDeKit(els, ['e01', 'e02', 'e03']).length).toBe(1)
    expect(problemasDeKit(els, ['e01', 'e02']).length).toBe(2)
  })
})

describe('clasificadores de formato', () => {
  it('carrusel / kit / post de imagen', () => {
    expect([esCarrusel(brief({ formato: 'Instagram · carrusel' })), esKitDeHistorias(brief({ formato: 'Instagram · carrusel' }))]).toEqual([true, false])
    expect(esCarrusel(brief({ formato: 'Instagram', que_es: 'un carousel de 6' }))).toBe(true)
    expect(esCarrusel(brief({ formato: 'Instagram · imagen' }))).toBe(false)
    expect(esKitDeHistorias(brief({ formato: 'Kit semanal de historias' }))).toBe(true)
    expect(esKitDeHistorias(brief({ formato: 'Historias', elementos: ['x'] }))).toBe(true)
    expect(esKitDeHistorias(brief({ formato: 'Historias', elementos: [] }))).toBe(false)
    expect(esKitDeHistorias(brief({ formato: 'Estado' }))).toBe(false)
    expect(esPostDeImagen(brief({ formato: 'Instagram · imagen' }))).toBe(true)
    expect(esPostDeImagen(brief({ formato: 'Instagram', que_es: 'imagen fija' }))).toBe(true)
    expect(esPostDeImagen(brief({ formato: 'Instagram · carrusel' }))).toBe(false)
  })
})
