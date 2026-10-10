/**
 * La revisión del manual aplicada a UN cliente · PURO (sin red ni base). Lo llaman las rutas `/api/manual/materia` y `/api/manual/hechos`,
 * que a su vez llama el alta (n8n) para dejar de recortar la materia por la cabeza y para chequear hechos por código.
 * No duplica nada de M1: solo une `fuentesDeRaspado` · `ordenarMateria` · `frasesPropias` · `evaluarHechos`.
 */
import { detectarDudas } from './dudas'
import { frasesPropias, type FrasesPropias } from './frases-propias'
import { evaluarHechos, type EstadoDeHecho } from './hechos'
import { fuenteDeSintesis, fuentesDeRaspado, ordenarMateria, type FilaDeRaspado, type Materia, type NombreDeBloque, type Propios } from './materia'
import type { Fuente } from './procedencia'

const dirigido = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** la ficha del cliente → lo que es SUYO (sitio y usuarios de sus redes). Sin ficha de redes, solo el sitio. */
export function propiosDeFicha(c: { website_url?: string | null; config?: unknown }): Propios {
  const own = dirigido(dirigido(dirigido(c.config).apify).own_handles)
  const handles = Object.values(own).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim().replace(/^https?:\/\/[^/]+\//, '').replace(/^@/, '').replace(/\/.*$/, ''))
  return { sitio: c.website_url ?? null, handles }
}

export interface MateriaDelCliente {
  estado: 'trajo' | 'sin_dato'
  texto: string
  bloques: Array<{ bloque: NombreDeBloque; leidos: number; total: number; recortado: boolean }>
  recortes: Materia['recortes']
  total_original: number
  total_leido: number
  eslogan: FrasesPropias['eslogan']
  estado_eslogan: FrasesPropias['estado_eslogan']
  frases_repetidas: FrasesPropias['repetidas']
  fuentes_propias_leidas: number
}

/** R2 + R1: la materia ordenada por código y recortada por bloque (con aviso), y la frase propia literal */
export function materiaDelCliente(filas: FilaDeRaspado[], propios: Propios, topes: Partial<Record<NombreDeBloque, number>> = {}): MateriaDelCliente {
  const fuentes = fuentesDeRaspado(filas, propios)
  const m = ordenarMateria(fuentes, topes)
  const fp = frasesPropias(fuentes)
  return {
    estado: m.bloques.length ? 'trajo' : 'sin_dato',
    texto: m.texto,
    bloques: m.bloques.map((b) => ({ bloque: b.bloque, leidos: b.leidos, total: b.total, recortado: b.recortado })),
    recortes: m.recortes,
    total_original: m.total_original,
    total_leido: m.total_leido,
    eslogan: fp.eslogan,
    estado_eslogan: fp.estado_eslogan,
    frases_repetidas: fp.repetidas,
    fuentes_propias_leidas: fp.fuentes_propias_leidas,
  }
}

export interface SintesisDeAgente { id: string; rotulo: string; texto: string }

export interface ChequeoDelManual {
  estado: 'revisado'
  total_hechos: number
  resumen: Record<EstadoDeHecho, number>
  sin_respaldo: Array<{ campo: string; frase: string; clausula: string; marcas: string[]; estado: EstadoDeHecho; motivo: string | null }>
  fuentes_propias_leidas: number
}

/** R3–R5 y R7: toda afirmación de hecho del manual con su cita; lo que solo se apoya en una síntesis de agente no cuenta; la duda del modelo viaja */
export function chequeoDelManual(entrada: { manual: Record<string, unknown>; filas: FilaDeRaspado[]; propios: Propios; sintesis?: SintesisDeAgente[]; tope?: number }): ChequeoDelManual {
  const sintesis = entrada.sintesis ?? []
  const fuentes: Fuente[] = [...fuentesDeRaspado(entrada.filas, entrada.propios), ...sintesis.map((s) => fuenteDeSintesis(s.id, s.rotulo, s.texto))]
  const dudas = detectarDudas(sintesis.map((s) => ({ origen: s.rotulo, texto: s.texto })))
  const informe = evaluarHechos({ manual: entrada.manual, fuentes, dudas })
  const tope = entrada.tope ?? 60
  return {
    estado: 'revisado',
    total_hechos: informe.hechos.length,
    resumen: informe.resumen,
    sin_respaldo: informe.sin_respaldo.slice(0, tope).map((h) => ({ campo: h.campo, frase: h.frase.slice(0, 300), clausula: h.clausula.slice(0, 200), marcas: h.marcas, estado: h.estado, motivo: h.motivo })),
    fuentes_propias_leidas: fuentes.filter((f) => f.tipo === 'primaria_propia').length,
  }
}
