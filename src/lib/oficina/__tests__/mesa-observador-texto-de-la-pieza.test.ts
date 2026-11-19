/**
 * 19-nov · G8 (1), 🟡 m6 de la certificación de CC7 (#1221): el juez de la imagen recibe el texto de TODAS las láminas de la pieza por el camino real
 * (`observarImagenes` → `PEDIDO_DEL_OBSERVADOR` → el revisor), no solo por la función pura. Es el caso del carrusel largo que motivó G8:
 * si una lámina no llega, el juez ve su texto en la imagen como «ajeno» y la rechaza. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { observarImagenes } from '../mesa/observar'

const art = (datos: unknown) => ({ version: 1, version_consumida: 0, datos })
const LAMINAS = Array.from({ length: 12 }, (_, i) => ({ orden: i + 1, rol: i === 0 ? 'hook' : 'cuerpo', headline: `Titular de la lámina ${i + 1}: el casco certificado protege en obra`, cuerpo: `Cuerpo de la lámina ${i + 1}, con su dato propio número ${100 + i}.` }))

const correr = async (extra: Record<string, unknown> = {}) => {
  const pedidos: string[] = []
  const P = { revisor: async (p: { texto: string }) => { pedidos.push(p.texto); return { ok: true, texto: 'TEXTO_VISIBLE: ninguno\nMARCAS: ninguna\nPERSONAS: 0\nTEXTO_AJENO: no\nDATO_SIN_VERIFICAR: no', costo_usd: 0 } } }
  const enc = {
    id: 'e', client_id: 'c', dry_run: false,
    estado_del_motor: { artefactos: {
      encargo: art({ F: { cliente_nombre: 'Zero Risk Seguridad Industrial', marca: { brand_handle: '@zerorisk.ec' } } }),
      imagenes: art({ ultimo_intento: 1, items: [{ indice: 0, ref: 'hook', url: 'https://x.test/a.png', prompt: 'un obrero con casco amarillo en una obra al amanecer', intento: 1 }] }),
      copy_carrusel: art({ texto_base: 'El casco que sí protege.', pie_de_foto: 'Pie final del carrusel con el llamado a la acción', hashtags: ['#seguridad'] }),
      laminas: art({ laminas: LAMINAS }),
      ...extra,
    } },
  }
  await observarImagenes(P as never, enc as never, {} as never)
  return pedidos
}

describe('el juez de la imagen recibe el texto de cada lámina (camino real)', () => {
  it('las 12 láminas, su titular y su cuerpo, el pie, la arroba y el pedido de la imagen llegan al revisor', async () => {
    const [pedido] = await correr()
    expect(pedido).toBeDefined()
    for (const l of LAMINAS) {
      expect(pedido).toContain(l.headline)
      expect(pedido).toContain(l.cuerpo)
    }
    expect(pedido).toContain('Pie final del carrusel con el llamado a la acción')
    expect(pedido).toContain('@zerorisk.ec')
    expect(pedido).toContain('La imagen se pidió así: un obrero con casco amarillo en una obra al amanecer')
  })
  it('el texto de la pieza va en su línea, después del pedido (lo que el juez compara contra la imagen)', async () => {
    const [pedido] = await correr()
    const linea = pedido.split('\n').find((x) => x.startsWith('Texto de la pieza: '))!
    expect(linea).toContain('Titular de la lámina 12: el casco certificado protege en obra')
    expect(linea).toContain('Cuerpo de la lámina 12, con su dato propio número 111.')
  })
})
