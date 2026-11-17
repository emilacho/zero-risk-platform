/**
 * GO Lenovo 17-nov «quitar rejas» (Emilio 09:08: «apruebo todo, que se corrija; sistema agnóstico con libertad») · tramo 1 de CC1, filas 1–3 de la auditoría:
 * libre salvo LEY (persona real identificable solo con permiso; marcas de terceros), DATO del cliente o FIRMA de Emilio.
 */
import { describe, it, expect } from 'vitest'
import { convencionDelGuion } from '../mesa/pedidos'
import { seccionDeImagenSinFoto } from '../prompts-sin-invencion'
import { tareaDelIngeniero } from '../mesa/prompts'

describe('rejas · tramo 1 de CC1', () => {
  it('🔴 fila 1 · abierta la puerta del texto en la imagen, la guarda sigue: SOLO el texto de la pieza, nada inventado; sin dato, sin texto; nunca un logo generado', () => {
    const t = tareaDelIngeniero([{ ref: 'hook', descripcion: 'un plato servido' }])
    expect(t).toContain('Si lo piden, la imagen lleva SOLO texto de la pieza (nada inventado).')
    expect(t).toContain('Si no lo dicen, sin texto')
    expect(t).toContain('Nunca un logo generado ni marcas de otro negocio.')
  })
  it('fila 3 · el guion ya no prohíbe la foto propia en los planos de ambiente: la mesa decide en qué plano va cada foto', () => {
    for (const propuestas of [1, 3]) {
      const c = convencionDelGuion({ segundos_min: 8, segundos_max: 15, propuestas })
      expect(c).not.toMatch(/los planos de ambiente no la llevan/)
      expect(c).toContain('en qué plano va cada una lo decides tú, también en los de ambiente')
    }
  })
  it('fila 1 · la imagen sin foto ya no prohíbe todo texto legible: solo lo inventado (el texto de la pieza vale si el manual o el brief lo piden)', () => {
    const s = seccionDeImagenSinFoto({ fotos: [], vocabulario_de_productos: [] })
    expect(s).not.toMatch(/eslóganes, rótulos ni texto legible/)
    expect(s).toContain('no pidas logotipos ni texto inventado (si el manual o el brief piden texto dentro de la imagen, solo el texto de la pieza)')
  })
})
