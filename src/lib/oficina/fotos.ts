/**
 * ELEGIR LA FOTO REAL · paso `elegir_foto` · función pura `candidatasFoto` sobre las ETIQUETAS ya existentes de `client_social_images` (no sobre la imagen).
 * Descarta con motivo escrito a la foto que cumpla alguna regla; lo que queda lo ve el curador (que elige o dice «ninguna sirve»). Diseño: sala 1 §6.1.
 * Vocabulario real de la columna (comprobado el 09-oct): tipo_de_toma ∈ producto · personas · ambiente · texto_afiche · formato ∈ cuadrado · vertical · confianza ∈ alta · media.
 */
import { contienePalabra } from './texto'
import { datosAjenos, type PropiosDelCliente } from './reglas-de-imagen'

export interface FotoEtiquetada {
  id: string
  /** dirección de la copia de la foto en nuestro bucket (la que ve el curador y la que se entrega) */
  url?: string | null
  estado?: string | null
  que_muestra?: string | null
  producto_visto?: string[] | null
  texto_visible?: string | null
  con_personas?: boolean | null
  tipo_de_toma?: string | null
  formato?: string | null
  etiqueta_confianza?: 'alta' | 'media' | 'baja' | null
}
export interface PedidoDeFoto {
  /** lo que protagoniza el brief (p. ej. el producto); si está vacío no se filtra por producto */
  protagonista: string | string[]
  prohibe_personas: boolean
  /** proporción pedida por el brief: '1:1' · '4:5' */
  proporcion: string
  /** días de uso previo por foto (id → ISO), para no repetir */
  usos?: Record<string, string>
  reuso_dias?: number
  ahora?: Date
  /** si es true, una foto usada dentro de la ventana se descarta; si es false solo se marca */
  excluir_reusadas?: boolean
}
export interface Candidata { id: string; motivo_de_aceptacion: string; requiere_mirar: boolean; reusada: boolean }
export interface Descartada { id: string; motivos: string[] }

/** qué `formato` de foto NO se puede recortar a cada proporción sin perder el protagonista (dato; hoy el vocabulario real solo trae cuadrado y vertical) */
export const FORMATOS_IMPOSIBLES: Record<string, string[]> = { '1:1': ['panoramica', 'horizontal'], '4:5': ['panoramica', 'horizontal'] }
const TOMAS_NO_SIRVEN = ['logo', 'texto_afiche']

/** la confianza de la etiqueta de una foto (el ÚNICO sitio que lee esa columna fuera de la selección) */
export const confianzaDeLaFoto = (fotos: FotoEtiquetada[], id: string | undefined): FotoEtiquetada['etiqueta_confianza'] | undefined => fotos.find((x) => x.id === id)?.etiqueta_confianza

export function candidatasFoto(fotos: FotoEtiquetada[], pedido: PedidoDeFoto, propios: PropiosDelCliente): { candidatas: Candidata[]; descartadas: Descartada[] } {
  const candidatas: Candidata[] = []
  const descartadas: Descartada[] = []
  const ahora = pedido.ahora ?? new Date()
  const protas = (Array.isArray(pedido.protagonista) ? pedido.protagonista : [pedido.protagonista]).map((x) => x.trim()).filter(Boolean)
  for (const f of fotos) {
    const m: string[] = []
    if (f.estado && f.estado !== 'ok') m.push(`estado «${f.estado}»`)
    if (!f.tipo_de_toma || !f.etiqueta_confianza) m.push('sin etiquetar')
    if (protas.length && !(f.producto_visto ?? []).some((p) => protas.some((x) => contienePalabra(p, x) || contienePalabra(x, p)))) {
      m.push(`el protagonista del brief («${protas.join(' / ')}») no está en lo que muestra la foto`)
    }
    if (f.texto_visible && f.texto_visible.trim()) {
      const aj = datosAjenos([f.texto_visible], propios)
      if (aj.length) m.push(`texto visible con ${aj.join(', ')} que no son del cliente`)
      for (const marca of propios.marcas_ajenas) if (marca && contienePalabra(f.texto_visible, marca)) m.push(`texto visible con la marca ajena «${marca}»`)
    }
    if (pedido.prohibe_personas && f.con_personas === true) m.push('trae personas y el brief o el manual las prohíben')
    if (f.tipo_de_toma && TOMAS_NO_SIRVEN.includes(f.tipo_de_toma)) m.push(`tipo de toma «${f.tipo_de_toma}» no sirve como imagen de la pieza`)
    if (f.formato && (FORMATOS_IMPOSIBLES[pedido.proporcion] ?? []).includes(f.formato)) m.push(`el formato «${f.formato}» no se recorta a ${pedido.proporcion} sin perder el protagonista`)
    let reusada = false
    const uso = pedido.usos?.[f.id]
    if (uso) {
      const dias = (ahora.getTime() - new Date(uso).getTime()) / 86_400_000
      if (dias >= 0 && dias < (pedido.reuso_dias ?? 14)) {
        reusada = true
        if (pedido.excluir_reusadas) m.push(`usada hace ${Math.floor(dias)} día(s), dentro de la ventana de ${pedido.reuso_dias ?? 14}`)
      }
    }
    if (m.length) descartadas.push({ id: f.id, motivos: m })
    else candidatas.push({ id: f.id, motivo_de_aceptacion: `muestra «${(f.producto_visto ?? []).join(', ') || 'sin producto'}» · toma ${f.tipo_de_toma} · ${f.formato ?? 'formato sin dato'}`, requiere_mirar: f.etiqueta_confianza !== 'alta', reusada })
  }
  return { candidatas, descartadas }
}
