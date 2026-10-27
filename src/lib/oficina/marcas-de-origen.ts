/**
 * DE DÓNDE VIENE CADA IMAGEN (criterio de Emilio 27-oct · «con marca de origen visible en la bandeja»): quien aprueba ve, por imagen, si es una foto propia del cliente, material cercano (una foto propia que no muestra
 * exactamente lo pedido), una imagen generada o una lámina tipográfica de marca. Pura: sale de la dirección visual y de las candidatas que ya guarda el encargo. Solo se muestra con la plantilla que lo pide
 * (`generar_cuando_no_hay_foto` o `material_activo`): apagado, la bandeja queda exactamente como estaba.
 */
import { datos } from './ayudas'
import type { Estado, Limites } from './tipos'

export type OrigenDeImagen = 'foto_propia' | 'foto_cercana' | 'generada' | 'tipografica' | 'sin_imagen'
export const ROTULO_DE_ORIGEN: Record<OrigenDeImagen, string> = { foto_propia: 'foto propia del cliente', foto_cercana: 'material cercano (foto propia que no muestra exactamente lo pedido)', generada: 'imagen generada con IA', tipografica: 'lámina tipográfica de marca', sin_imagen: 'sin imagen' }

export const marcaDeOrigenActiva = (l: Limites | Record<string, unknown> | undefined): boolean => !!l && ((l as Record<string, unknown>).generar_cuando_no_hay_foto === true || (l as Record<string, unknown>).material_activo === true)

export function origenesDeImagenes(e: Estado, limites?: Record<string, unknown>): { por_imagen: Array<{ ref: string; origen: OrigenDeImagen; foto_id?: string }>; resumen: string } | null {
  const vd = datos(e, 'visual_direction')
  if (!vd) return null
  const sinImagen = new Set<string>(Array.isArray(limites?.roles_sin_imagen) ? (limites!.roles_sin_imagen as unknown[]).map(String) : ['cta', 'cierre'])
  const cercanas = new Set<string>(((datos(e, 'candidatas_foto')?.candidatas ?? []) as Array<{ id: string; cercana?: boolean }>).filter((c) => c.cercana).map((c) => c.id))
  const imgs = Array.isArray(vd.imagenes) ? (vd.imagenes as Array<{ ref: string; modo: string; foto_id?: string }>) : [{ ref: 'imagen', modo: String((vd.decision as { modo?: string } | undefined)?.modo ?? 'ninguna'), foto_id: (vd.decision as { foto_id?: string } | undefined)?.foto_id }]
  const por_imagen = imgs.map((i) => {
    const origen: OrigenDeImagen = i.modo === 'real' ? (i.foto_id && cercanas.has(i.foto_id) ? 'foto_cercana' : 'foto_propia') : i.modo === 'generada' ? 'generada' : sinImagen.has(i.ref) ? 'tipografica' : 'sin_imagen'
    return { ref: i.ref, origen, ...(i.foto_id ? { foto_id: i.foto_id } : {}) }
  })
  const cuenta = (o: OrigenDeImagen) => por_imagen.filter((x) => x.origen === o).length
  const partes = (['foto_propia', 'foto_cercana', 'generada', 'tipografica', 'sin_imagen'] as OrigenDeImagen[]).filter((o) => cuenta(o) > 0).map((o) => `${cuenta(o)} ${ROTULO_DE_ORIGEN[o]}`)
  return { por_imagen, resumen: partes.join(' · ') }
}
