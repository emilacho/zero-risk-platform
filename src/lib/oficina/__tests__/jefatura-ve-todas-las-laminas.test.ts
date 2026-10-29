/**
 * La jefatura y los jefes ven TODAS las láminas de la pieza (30-oct). En la pieza real 8adbfb3d el revisor dijo haber visto solo las láminas 1, 4 y 6:
 * el pedido mandaba portada, mitad y última. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { construirTareaLaminas, contextoDelRevisorLaminas, laminasParaRevisar, type ContextoLaminas } from '../pedidos-laminas'
import { armarPedidoAlRevisor } from '../ciego'

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://x.test/lamina-${i + 1}.png`)

const ctx = (n: number): ContextoLaminas => ({
  brief: { id: 'BRF-9', texto: 'brief', red: 'facebook', formato: 'carrusel' },
  fuentes: { manual_texto: 'manual', plan_texto: '', propios: { telefonos: [], handles: [] }, fuentes: { precios: [] } },
  estado: { fichas: [] },
  art: (k: string) => (k === 'laminas' ? { laminas: [] } : undefined),
  limites: {},
  elementos: [],
  plataforma: 'facebook',
  familia: 'carrusel_mesa',
  refsValidos: [],
  refsGeneradas: [],
  sinFoto: false,
  png: urls(n),
}) as unknown as ContextoLaminas

describe('el revisor externo de la jefatura recibe TODAS las láminas', () => {
  for (const n of [1, 3, 4, 5, 6, 8, 10]) {
    it(`pieza de ${n} láminas → ${n} imágenes, en orden, sin nota de «solo se adjuntan»`, () => {
      const r = contextoDelRevisorLaminas(ctx(n))
      expect(r.imagenes).toEqual(urls(n))
      expect(r.nota_pieza).toBeUndefined()
    })
  }
  it('el pedido que llega al revisor lleva las 6 imágenes (el caso real)', () => {
    const r = contextoDelRevisorLaminas(ctx(6))
    const p = armarPedidoAlRevisor({ pieza: r.pieza, contexto: r.contexto, imagenes: r.imagenes, encargo: r.encargo, nota_pieza: r.nota_pieza })
    expect(p.imagenes).toEqual(urls(6))
    expect(p.texto).not.toMatch(/solo se adjuntan/)
  })
})

describe('el jefe que revisa y el curador que decide también ven todas', () => {
  it('revision_jefe (jefe de marketing)', () => {
    expect(construirTareaLaminas('revision_jefe', ctx(6)).images).toEqual(urls(6))
  })
  it('decisión del curador sobre las imágenes', () => {
    const t = construirTareaLaminas('decide_imagen', ctx(6), { fichas: [] })
    expect(t.images).toEqual(urls(6))
  })
  it('laminasParaRevisar devuelve una copia completa', () => {
    const a = urls(7)
    const b = laminasParaRevisar(a)
    expect(b).toEqual(a)
    expect(b).not.toBe(a)
  })
})
