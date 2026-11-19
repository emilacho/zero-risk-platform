/**
 * LA TANDA B · UN SOLO AUTOR (GO de Lenovo 18-nov · firma de Emilio 16:37 Zúrich · «constrúyela ya, apagada» 19-nov 13:58Z).
 * Diseño: raw/tasks/2026-11-18-GO-LENOVO-a-CC2-CC7-prueba-mesa-actual-vs-un-autor.md (CC2, ~14:00Z).
 *
 * La misma mesa, otra forma de trabajar: la dirección es el AUTOR. Lee todo, saca unos 20 conceptos, elige los que va a desarrollar y escribe
 * las propuestas completas; los especialistas pasan a REVISORES (objeciones atadas a un plano) y el autor corrige UNA vuelta.
 *
 * Se enciende con un DATO de la plantilla (`limites.modo_de_la_mesa: "un_autor"`), congelado al abrir la mesa. Sin el dato, la mesa de siempre.
 * Este archivo es puro: sin base, sin red, sin modelo. El planificador decide los turnos (`siguienteDelAutor`); aquí van las tareas y lo que el código mide.
 */
import { criticoDe, especialistasPertinentes } from './directorio'
import type { Aporte, EstadoMesa } from './tipos'

export const MODO_UN_AUTOR = 'un_autor' as const
export type ModoDeLaMesa = typeof MODO_UN_AUTOR

/** el modo que declara la plantilla (dato); cualquier otro valor, o ninguno, es la mesa de siempre */
export const modoDeLaPlantilla = (limites: { [k: string]: unknown }): ModoDeLaMesa | null => (limites.modo_de_la_mesa === MODO_UN_AUTOR ? MODO_UN_AUTOR : null)
export const esDeUnAutor = (est: Pick<EstadoMesa, 'modo'>): boolean => est.modo === MODO_UN_AUTOR

/** quién revisa: los especialistas pertinentes de la mesa y, si la mesa tiene crítico, también él (en este modo no hay ronda de crítica aparte) */
export function revisoresDe(est: EstadoMesa, hayImagenGenerada: boolean): string[] {
  const miembros = especialistasPertinentes(est.directorio_congelado, est.tipo, hayImagenGenerada, est.condiciones ?? [])
  const critico = criticoDe(est.directorio_congelado, est.tipo)?.agente
  return critico && !miembros.includes(critico) ? [...miembros, critico] : miembros
}

/** el revisor no tiene objeciones: su revisión empieza con esta frase */
export const SIN_OBJECIONES = 'Sin objeciones'
export const sinObjeciones = (texto: string): boolean => texto.trim().toLowerCase().startsWith(SIN_OBJECIONES.toLowerCase())

/** los planos que existen en las propuestas: `# Propuesta K` y, debajo, `## Plano N` (con una sola propuesta, la K es 1) */
export function planosDeLasPropuestas(texto: string): Set<string> {
  const planos = new Set<string>()
  let k = 1
  for (const linea of texto.split(/\r?\n/)) {
    const p = /^#\s+Propuesta\s+(\d+)/i.exec(linea)
    if (p) { k = Number(p[1]); continue }
    const n = /^##\s+Plano\s+(\d+)/i.exec(linea)
    if (n) planos.add(`${k}.${n[1]}`)
  }
  return planos
}

/** una objeción: una línea que empieza (con o sin viñeta) por «Propuesta K» */
const LINEA_DE_OBJECION = /^\s*(?:[-*•]\s*)?Propuesta\s+(\d+)\b(.*)$/i

export interface Objecion { revisor: string; aporte: string; linea: string; propuesta: number; plano: number | null }

/** las objeciones de las revisiones posteriores a las propuestas, con el plano que nombran (o null si no nombran ninguno) */
export function objecionesDelLibro(libro: Aporte[]): Objecion[] {
  const propuestas = libro.find((a) => a.tipo === 'integra')
  if (!propuestas) return []
  const salida: Objecion[] = []
  for (const a of libro) {
    if (a.tipo !== 'aporta' || a.n <= propuestas.n || sinObjeciones(a.texto)) continue
    for (const linea of a.texto.split(/\r?\n/)) {
      const m = LINEA_DE_OBJECION.exec(linea)
      if (!m) continue
      const pl = /Plano\s+(\d+)/i.exec(m[2])
      salida.push({ revisor: a.de, aporte: `A${a.n}`, linea: linea.trim(), propuesta: Number(m[1]), plano: pl ? Number(pl[1]) : null })
    }
  }
  return salida
}

/** lo que el código mide (sin frenar): cuántas objeciones hay y cuáles no nombran un plano que exista en las propuestas */
export function objecionesSinPlano(libro: Aporte[]): { total: number; sin_plano: Objecion[] } {
  const propuestas = libro.find((a) => a.tipo === 'integra')
  const existen = planosDeLasPropuestas(propuestas?.texto ?? '')
  const todas = objecionesDelLibro(libro)
  return { total: todas.length, sin_plano: todas.filter((o) => o.plano === null || !existen.has(`${o.propuesta}.${o.plano}`)) }
}

/** ¿algún revisor dejó objeciones? (si nadie objetó, no hay vuelta de corrección) */
export const hayObjeciones = (libro: Aporte[]): boolean => {
  const propuestas = libro.find((a) => a.tipo === 'integra')
  return !!propuestas && libro.some((a) => a.tipo === 'aporta' && a.n > propuestas.n && !sinObjeciones(a.texto))
}

const SIN_PEDIDOS = 'En esta mesa no hay pedidos a compañeros ni al portero: todo lo que hay del cliente está arriba (manual, brief, plan, perfil del público, fotos y lo que trajo el portero). Léelo entero.'

const GANCHO_DEL_AUTOR = 'En esta mesa el gancho (el Plano 1 de cada propuesta) lo escribes tú: donde la convención dice quién lo propone, eres tú.'

/** las tareas del modo un autor para los turnos que cambian (dirigir, aportar, integrar); los demás turnos son los de siempre */
export function tareaDelAutor(o: { tipo: 'dirigir' | 'aportar' | 'integrar'; agente: string; libro: Aporte[]; propuestas: number; convencion: string }): string {
  const { tipo, agente, libro } = o
  const n = Math.max(1, o.propuestas)
  const lasN = n > 1 ? `las ${n} propuestas` : 'la propuesta'
  if (tipo === 'dirigir') {
    return [
      '## Tu turno · AUTOR: los conceptos',
      `En esta mesa tú eres el AUTOR: escribes ${lasN} y los especialistas del equipo después las revisan. ${SIN_PEDIDOS}`,
      'Escribe `## Conceptos`: unos 20 conceptos cortos, uno por línea (`- <nombre> · <la idea en una frase> · ángulo: <desde dónde la cuentas>`), desde ángulos DISTINTOS entre sí (los ángulos los eliges tú según el plan y el público).',
      `Luego escribe \`## Elegidos\`: los ${n} conceptos que vas a desarrollar y, para cada uno, por qué (qué lo hace fiel al plan y al manual, y distinto de los otros elegidos).`,
      `Todavía no escribas ${lasN}: eso es tu próximo turno.`,
    ].join('\n')
  }
  if (tipo === 'aportar') {
    return [
      `## Tu turno · REVISA ${lasN} del autor (${agente})`,
      `El autor ya escribió ${lasN} (mírala${n > 1 ? 's' : ''} en el tablero). Tú no escribes una propuesta: **revisas desde tu especialidad**. ${SIN_PEDIDOS}`,
      'Cada objeción va en UNA línea atada a un plano: `Propuesta <K> · Plano <N> · <la objeción> · por qué: <el motivo concreto, contra el manual, el plan, el brief o tu especialidad>`. Si la objeción es de la propuesta entera, usa el plano donde se ve el problema.',
      'Objeta solo lo que importa (algo que falla contra el plan, el manual, los datos del cliente o lo que tu especialidad sabe); lo estilístico, en una línea al final que empiece por «Sugerencia:».',
      `Si no tienes objeciones, escribe una sola línea que empiece por «${SIN_OBJECIONES}:» y di por qué. Es una respuesta válida: no objetes por cumplir.`,
    ].join('\n')
  }
  const integras = libro.filter((a) => a.tipo === 'integra').length
  if (integras === 0) {
    return ['## Tu turno · AUTOR: escribe ' + lasN, `Desarrolla los conceptos que elegiste (míralos en el tablero) en ${lasN} completa${n > 1 ? 's' : ''}. ${SIN_PEDIDOS}`, 'Todavía nadie revisó: en «Citas» no hay nada que citar; puedes dejar la sección vacía.', GANCHO_DEL_AUTOR, o.convencion].join('\n')
  }
  const { sin_plano } = objecionesSinPlano(libro)
  return [
    `## Tu turno · AUTOR: corrige ${lasN} (una sola vuelta)`,
    `Los revisores dejaron sus objeciones en el tablero. Reescribe ${lasN} COMPLETA${n > 1 ? 'S' : ''} con lo que decides tomar; es la única vuelta de corrección.`,
    'Tú decides con criterio: no tienes que tomar todo. En «Citas» cita **cada revisión** (A<n>): `A<n> usé: <qué objeción tomaste y qué cambiaste>` o `A<n> descarté: <por qué no la tomaste>`.',
    ...(sin_plano.length ? ['', 'El código encontró estas objeciones que no nombran un plano que exista en tus propuestas (léelas igual; tú decides):', ...sin_plano.map((x) => `- ${x.aporte} (${x.revisor}): ${x.linea}`)] : []),
    '',
    GANCHO_DEL_AUTOR,
    o.convencion,
  ].join('\n')
}
