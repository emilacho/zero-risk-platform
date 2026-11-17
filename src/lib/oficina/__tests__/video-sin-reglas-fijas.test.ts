/**
 * DECISIÓN de Emilio 17-nov 09:08 («apruebo todo, que se corrija; un sistema agnóstico tiene que tener la libertad de trabajar como tal»):
 * el video ya no lleva las reglas fijas «sin voces / sin narración / sin rostros». Voz, diálogo, locución, rostros y personajes generados los decide la mesa.
 * Queda solo lo que es ley o términos del proveedor: la cara o la voz de una persona real identificable, solo con su permiso registrado; marcas ajenas no.
 */
import { describe, it, expect } from 'vitest'
import { REGLAS_DEL_PEDIDO, cuerpoParaHiggsfield, armarPedido } from '../../video/parametros'
import { NOTA_DE_VIDEO_EN_LIMITES } from '../../cadena/hoja'
import { convencionDelGuion } from '../mesa/pedidos'
import { ROTULO_DEL_VIDEO_GENERADO } from '../orquestador-video'
import { guionLegible, traducirGuion } from '../video/guion'

const VIEJAS = /sin voz|sin voces|sin diálogo|sin narraci|solo música|de espaldas|sin rostros|sólo manos|solo manos/i

describe('DECISIÓN Emilio 17-nov · el video sin reglas fijas de voz ni de rostros', () => {
  it('el pedido al modelo ya no prohíbe voces ni rostros; lleva solo la regla de ley y la de texto/marcas', () => {
    const r = REGLAS_DEL_PEDIDO.join(' ')
    expect(r).not.toMatch(VIEJAS)
    expect(r).toContain('Ni la cara ni la voz de una persona real identificable, salvo que el cliente tenga registrado su permiso')
    expect(r).toContain('las personas, voces y locuciones generadas sí, si el guion las pide')
    expect(r).toContain('sin logotipos ni marcas que no sean las del cliente')
    const p = armarPedido({ prompt: 'Una cocinera explica la receta mirando a cámara.', formato: 'reel' })
    if (!p.ok) throw new Error(p.errores.join('; '))
    expect(String(cuerpoParaHiggsfield(p.pedido).prompt)).not.toMatch(VIEJAS)
  })
  it('la nota de LÍMITES de la hoja ya no dice «sin voces ni narración»; solo la regla de ley', () => {
    expect(NOTA_DE_VIDEO_EN_LIMITES).not.toMatch(VIEJAS)
    expect(NOTA_DE_VIDEO_EN_LIMITES).toContain('sin rostro ni voz de persona real identificable salvo permiso registrado')
  })
  it('el guion que pide la mesa deja el audio libre (voz, diálogo o locución) con 1 y con 3 propuestas', () => {
    for (const v of [{ segundos_min: 8, segundos_max: 15, propuestas: 1 }, { segundos_min: 8, segundos_max: 15, propuestas: 3 }]) {
      const c = convencionDelGuion(v)
      expect(c).not.toMatch(VIEJAS)
      expect(c).toContain('<lo que suena: música, ambiente, voz, diálogo o locución, lo que pida la pieza>')
    }
  })
  it('el rótulo de la entrega dice que el video y su audio son generados, sin afirmar «sin voces»', () => {
    expect(ROTULO_DEL_VIDEO_GENERADO).not.toMatch(VIEJAS)
    expect(ROTULO_DEL_VIDEO_GENERADO).toContain('su audio también es generado')
  })
  it('🔴 CC6 17-nov · el guion sin audio ya no dice «sin voz» (ni «por regla»): ni el aviso ni lo que leen la jefatura y la hoja de entrega', () => {
    const legible = guionLegible({ planos: [{ n: 1, desde_s: 0, hasta_s: 8, que_se_ve: 'la cocinera sirve el plato', camara: 'fija', foto: null }] as never, audio: '', segundos: 8 })
    expect(legible).toContain('Audio: (a criterio del modelo: música o ambiente)')
    expect(legible).not.toMatch(VIEJAS)
    const t = traducirGuion(['## Plano 1 · 0–8 s', 'Qué se ve: la cocinera sirve el plato', 'Cámara: fija'].join('\n'))
    const avisos = (t as { avisos?: string[] }).avisos ?? []
    expect(avisos.some((a) => a.includes('el guion no dice nada del audio'))).toBe(true)
    expect(avisos.join(' ')).not.toMatch(/sin voz|por regla/i)
  })
})
