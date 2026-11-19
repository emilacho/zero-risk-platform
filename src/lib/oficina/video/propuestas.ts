/**
 * LAS PROPUESTAS DEL VIDEO · 16-nov · Sprint 2 · S2-1 (CC1) · decisión de Emilio 21:29 + adendas 21:35 y 21:42: el dueño aprueba PROPUESTAS antes de producir, no piezas ya hechas.
 * La mesa presenta UNA sola vez N propuestas completas (concepto, duración, red, objetivo y su hoja de planos), con su storyboard en borrador; el dueño elige una
 * o deja observaciones (la mesa corrige y vuelve a presentar). Con la elección, la elegida pasa a ser el `guion` y todo lo que sigue corre solo.
 *  · N, la duración y la parada son DATO de la plantilla (`limites.video`): sin `propuestas` (o con 1) la mesa escribe un solo guion, como hasta hoy.
 *  · El traductor sigue tolerante: menos propuestas de las pedidas se AVISA y se presentan las que hay; una propuesta que no se entiende se descarta con aviso.
 * Puro: sin base, sin red, sin modelo.
 */
import type { Estado, Plantilla } from '../tipos'
import { VIDEO_POR_OMISION, type ParametrosDelVideo } from '../mesa/pedidos'
import { limpiarTexto, separarTitulosPegados, traeCamposDeLaPieza } from '../mesa/traductor'
import { traducirGuion, type TraduccionDeGuion } from './guion'
import { TECHO_DE_LA_PIEZA_S } from './techo-de-la-pieza'

export interface PropuestaDeVideo {
  /** «P1», «P2»…: el orden en que la mesa las escribió (la tarjeta del dueño las nombra así) */
  id: string
  nombre: string
  concepto: string
  /** la duración que declaró la propuesta (la del guion manda si no coinciden: se avisa) */
  segundos: number
  red: string
  objetivo: string
  por_que: string
  guion: TraduccionDeGuion
  /** el texto de ESTA propuesta tal como lo escribió la mesa (título, cabecera y hoja): al aprobarse pasa a ser el texto del guion */
  texto: string
}

export interface PropuestasDelVideo {
  /** 1 = la primera presentación; sube con cada vuelta por observaciones del dueño */
  ronda: number
  propuestas: PropuestaDeVideo[]
  /** las citas de la integración (`# Citas`), comunes a todas */
  citas: string
  avisos: string[]
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** la duración y las propuestas que dice la plantilla (`limites.video.segundos_min/max/propuestas`); lo que falte o no tenga sentido, lo de siempre */
export function parametrosDelVideo(pl: Pick<Plantilla, 'limites'>): ParametrosDelVideo {
  const v = (pl.limites?.video ?? {}) as Record<string, unknown>
  const ent = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : null)
  // 19-nov · G5b · 🟡 de CC6 (#1201): el mínimo tampoco pasa del techo (si no, el máximo quedaba por debajo del mínimo)
  const min = Math.min(TECHO_DE_LA_PIEZA_S, ent(v.segundos_min) ?? VIDEO_POR_OMISION.segundos_min)
  // 19-nov · G5 · nunca más que el techo de la pieza (lo que aguanta la cadena), aunque la base diga otra cosa
  const max = Math.min(TECHO_DE_LA_PIEZA_S, Math.max(min, ent(v.segundos_max) ?? VIDEO_POR_OMISION.segundos_max))
  return { segundos_min: min, segundos_max: max, propuestas: ent(v.propuestas) ?? VIDEO_POR_OMISION.propuestas, ...(v.componer === true ? { componer: true } : {}) }
}

const esTituloDePropuesta = (l: string) => /^\s{0,3}#{1,3}\s*(propuesta|opci[oó]n|camino)\s*\d*\b/i.test(l)
const esTituloDeCitas = (l: string) => /^\s{0,3}#{1,3}\s*citas\b/i.test(l)

/** «Concepto: …», «Duración: 12 s · Red: instagram · Objetivo: …» (en una línea o en varias) */
export function cabecera(lineas: string[]): Record<'concepto' | 'duracion' | 'red' | 'objetivo' | 'por_que', string> {
  const r = { concepto: '', duracion: '', red: '', objetivo: '', por_que: '' }
  const claves: Array<[RegExp, keyof typeof r]> = [[/^(concepto|idea)$/, 'concepto'], [/^(duracion|dura)$/, 'duracion'], [/^(red|plataforma)$/, 'red'], [/^objetivo$/, 'objetivo'], [/^(por que|porque|razon)$/, 'por_que']]
  for (const raw of lineas) {
    if (/^\s{0,3}#/.test(raw)) break // el primer plano: se acabó la cabecera
    for (const trozo of raw.replace(/^\s*[-*•]\s+/, '').split(/\s+·\s+/)) {
      const m = /^\*{0,2}([^:*\n]{2,20}?)\*{0,2}\s*:\s*(.+)$/.exec(trozo.trim())
      const k = m ? claves.find(([re]) => re.test(sinTildes(m[1]).trim()))?.[1] : undefined
      if (m && k && !r[k]) r[k] = limpiarTexto(m[2])
    }
  }
  return r
}

/**
 * La integración de la mesa → las propuestas. `objetivo` = cuántas pidió la plantilla. Si la dirección no escribió títulos de propuesta, el texto entero es UNA
 * propuesta (con aviso si se pedían más). Una propuesta cuyo guion no se entiende se descarta con su motivo; si ninguna se entiende, `ok: false`.
 */
/** un bloque de la integración: el título de la propuesta y sus líneas */
export interface BloqueDePropuesta { titulo: string; lineas: string[] }

/**
 * 17-nov · el corte por propuesta, UNO para video y para imagen (propuestas también en imagen · contrato CC5 v1): parte la integración de la mesa en bloques
 * «# Propuesta N · …» (títulos pegados cortados con el molde de CC3), aparta las citas y AVISA lo que no puede presentar (texto con estructura antes del primer título;
 * sin títulos separados → el texto entero es UNA propuesta, con aviso si se pedían más). Puro.
 */
export function partirEnPropuestas(md: string, objetivo: number): { bloques: BloqueDePropuesta[]; citas: string; avisos: string[] } {
  // 17-nov · REAPERTURA del reel 2ed549cc (arreglo (b) de CC6): un título pegado a mitad de línea («…con sus citas.# Propuesta 1 · …») se corta a su propia línea con el
  // MISMO molde del traductor del kit (CC3 · #1120), sin otra copia; antes la Propuesta 1 entera se tiraba en silencio
  const lineas = separarTitulosPegados(String(md ?? '')).split('\n')
  const avisos: string[] = []
  const bloques: BloqueDePropuesta[] = []
  const citas: string[] = []
  let cur: BloqueDePropuesta | null = null
  let enCitas = false
  for (const l of lineas) {
    if (esTituloDePropuesta(l)) { cur = { titulo: l.replace(/^\s*#+\s*/, '').trim(), lineas: [] }; bloques.push(cur); enCitas = false; continue }
    if (esTituloDeCitas(l) && (bloques.length > 1 || /^\s{0,3}#\s/.test(l))) { enCitas = true; continue }
    if (enCitas) citas.push(l)
    else if (cur) cur.lineas.push(l)
  }
  // (c) lo que hay ANTES del primer título de propuesta no tiene propuesta: si trae estructura de la pieza (un título o campos), se avisa con cuántas líneas; la narración del agente no
  const primera = lineas.findIndex(esTituloDePropuesta)
  if (primera > 0) {
    const antes = lineas.slice(0, primera).join('\n').trim()
    if (antes && (/^\s{0,3}#{1,4}\s+\S/m.test(antes) || traeCamposDeLaPieza(antes))) avisos.push(`texto antes de la primera propuesta: ${antes.split('\n').filter((l) => l.trim()).length} línea(s) con estructura de la pieza y sin título de propuesta, no se presentan («${limpiarTexto(antes).slice(0, 80)}…»)`)
  }
  if (!bloques.length) {
    bloques.push({ titulo: 'Propuesta 1', lineas })
    if (objetivo > 1) avisos.push(`la mesa no escribió propuestas separadas («# Propuesta 1 · …»): se presenta el texto entero como una sola propuesta (se pedían ${objetivo})`)
  }
  return { bloques, citas: citas.join('\n').trim(), avisos }
}

/** (c) «quedan N» dice CUÁLES faltan y por qué (descartadas por su contenido, con su título, y/o la mesa escribió menos títulos); y si sobran, que se presentan todas. Puro */
export function avisosDeCuantasQuedan(objetivo: number, bloques: number, quedan: number, descartadas: string[], porQue: string): string[] {
  const avisos: string[] = []
  if (bloques > 1 && quedan < objetivo) {
    const por = [
      ...(descartadas.length ? [`se descartó ${descartadas.map((x) => `«${x}»`).join(', ')} ${porQue}`] : []),
      ...(bloques < objetivo ? [`la mesa escribió ${bloques} título(s) de propuesta`] : []),
    ]
    avisos.push(`se pidieron ${objetivo} propuestas y quedan ${quedan}${por.length ? ` (${por.join('; ')})` : ''}: se presentan las que hay`)
  }
  if (quedan > objetivo) avisos.push(`la mesa escribió ${quedan} propuestas (se pidieron ${objetivo}): se presentan todas`)
  return avisos
}

/** el nombre de la propuesta: su título sin «Propuesta N ·» */
export const nombreDeLaPropuesta = (titulo: string, id: string): string => limpiarTexto(titulo.replace(/^(propuesta|opci[oó]n|camino)\s*\d*\s*[·:–—-]?\s*/i, '')) || id

/**
 * La integración de la mesa → las propuestas. `objetivo` = cuántas pidió la plantilla. Si la dirección no escribió títulos de propuesta, el texto entero es UNA
 * propuesta (con aviso si se pedían más). Una propuesta cuyo guion no se entiende se descarta con su motivo; si ninguna se entiende, `ok: false`.
 */
export function traducirPropuestas(md: string, o: { objetivo: number; segundosMin?: number; segundosMax?: number; ronda?: number }): { ok: true; resultado: PropuestasDelVideo } | { ok: false; motivo: string; avisos: string[] } {
  const { bloques, citas, avisos } = partirEnPropuestas(md, o.objetivo)
  const propuestas: PropuestaDeVideo[] = []
  const descartadas: string[] = []
  for (const b of bloques) {
    const g = traducirGuion(b.lineas.join('\n'), { maxPreguntas: 0, ...(o.segundosMin ? { segundosMin: o.segundosMin } : {}), ...(o.segundosMax ? { segundosMax: o.segundosMax } : {}) })
    const id = `P${propuestas.length + 1}`
    if (!g.ok) { avisos.push(`«${b.titulo}» se descartó: ${g.motivo ?? 'no se pudo traducir su guion'}`); descartadas.push(b.titulo); continue }
    const c = cabecera(b.lineas)
    const nombre = nombreDeLaPropuesta(b.titulo, id)
    const declarados = /(\d+)\s*s\b/i.exec(c.duracion)
    if (declarados && Number(declarados[1]) !== g.segundos) g.avisos.push(`la propuesta dice ${declarados[1]} s y su guion dura ${g.segundos} s: vale el guion`)
    propuestas.push({ id, nombre, concepto: c.concepto, segundos: g.segundos, red: c.red, objetivo: c.objetivo, por_que: c.por_que, guion: g, texto: [`# ${b.titulo}`, ...b.lineas].join('\n').trim() })
  }
  if (!propuestas.length) return { ok: false, motivo: 'ninguna propuesta trae un guion que se entienda', avisos }
  avisos.push(...avisosDeCuantasQuedan(o.objetivo, bloques.length, propuestas.length, descartadas, 'por su guion'))
  return { ok: true, resultado: { ronda: o.ronda ?? 1, propuestas, citas, avisos } }
}

/** el artefacto de la aprobación del dueño (lo escribe el paso `aprobar_propuestas` cuando llega la respuesta) */
export interface AprobacionDePropuestas {
  estado: 'esperando' | 'aprobada' | 'observaciones'
  /** la propuesta elegida (solo `aprobada`) */
  propuesta_id?: string
  /** lo que el dueño pidió cambiar (solo `observaciones`; vuelve a la mesa) */
  observaciones?: string
  ronda: number
}

/**
 * La fase de la producción, UNA sola verdad para todos los pasos (las imágenes clave de CC2 en borrador o en final, el clip de CC3):
 *  · `propuesta` = hay propuestas y todavía no hay una aprobada (todo lo que se fabrique es borrador);
 *  · `final` = hay una aprobada, o el encargo no tiene propuestas (lo de hoy).
 */
export function faseDeLaProduccion(e: Pick<Estado, 'artefactos'>): 'propuesta' | 'final' {
  // 17-nov · también las propuestas de IMAGEN (contrato CC5 v1): la misma verdad para el borrador y la final de kit, carrusel y foto
  if (!e.artefactos?.propuestas_video && !e.artefactos?.propuestas_imagen) return 'final'
  const a = e.artefactos.aprobacion_propuestas?.datos as Partial<AprobacionDePropuestas> | undefined
  return a?.estado === 'aprobada' ? 'final' : 'propuesta'
}
