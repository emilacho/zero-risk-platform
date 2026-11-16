/**
 * SPRINT 2 · S2-2 · LA BIBLIOTECA DE PLANOS Y LOS RITMOS DEL VIDEO (GO Lenovo 16-nov, firma de Emilio 21:55). Puro: sin base, sin red, sin modelo.
 *
 * Es DATO (`oficina_fichas_de_plano`, `oficina_ritmos_de_video`, sembradas por migración): una ficha por técnica de plano (qué hace, para qué rol de la historia,
 * ejes de material / forma / cámara / intensidad, duración, efecto y trampas) y una guía de ritmo por duración (cuántos planos, cuándo el gancho, cuándo el producto).
 * La mesa de video la recibe como CONTEXTO para elegir, nunca como lista cerrada: puede proponer otra técnica si la nombra y dice por qué.
 * Agnóstica: una ficha sin rubros sirve a todos; con rubros, solo a los clientes de esas familias (`familiasDelRubro`, la misma clasificación de las fuentes públicas).
 * Los ritmos AVISAN (`avisosDeRitmo`, para la hoja de planos de S2-1): nunca rechazan ni cortan un guion.
 */
import { familiasDelRubro } from '../../fuentes-publicas/plan'

export const ROLES_DEL_PLANO = ['captar', 'situar', 'informar', 'prueba', 'giro', 'conclusion', 'llamado', 'ambiente'] as const
export type RolDelPlano = (typeof ROLES_DEL_PLANO)[number]

export interface FichaDePlano {
  id: string
  nombre: string
  que_hace: string
  roles: string[]
  material: string
  forma: string
  camara: string
  intensidad: string
  segundos_min: number
  segundos_max: number
  efecto: string
  trampas: string[]
  rubros: string[]
  orden: number
}
export interface RitmoDeVideo {
  id: string
  nombre: string
  segundos_min: number
  segundos_max: number
  /** null = cualquier red con video */
  red: string | null
  planos_min: number
  planos_max: number
  gancho_hasta_s: number | null
  producto_antes_de_s: number | null
  notas: string[]
  rubros: string[]
}
export interface BibliotecaDeVideo { fichas: FichaDePlano[]; ritmos: RitmoDeVideo[] }
/** lo que trae el puerto: las filas activas tal cual y el rubro del cliente (texto libre de `clients.industry`) */
export interface LecturaDeLaBiblioteca { fichas: unknown[]; ritmos: unknown[]; industria: string | null }

type Fila = Record<string, unknown>
const texto = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const textos = (x: unknown): string[] => (Array.isArray(x) ? x.map(texto).filter(Boolean) : [])
const numero = (x: unknown): number | null => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(n) ? n : null }
const activa = (f: Fila) => f.activo !== false

/** las fichas legibles (sin id o sin nombre no entra; lo demás se tolera vacío), en su orden */
export function leerFichas(filas: unknown): FichaDePlano[] {
  if (!Array.isArray(filas)) return []
  return filas.filter((f): f is Fila => !!f && typeof f === 'object').filter(activa).flatMap((f) => {
    const id = texto(f.id), nombre = texto(f.nombre)
    if (!id || !nombre) return []
    const smin = numero(f.segundos_min) ?? 0, smax = numero(f.segundos_max) ?? smin
    return [{ id, nombre, que_hace: texto(f.que_hace), roles: textos(f.roles), material: texto(f.material), forma: texto(f.forma), camara: texto(f.camara), intensidad: texto(f.intensidad), segundos_min: smin, segundos_max: Math.max(smin, smax), efecto: texto(f.efecto), trampas: textos(f.trampas), rubros: textos(f.rubros), orden: numero(f.orden) ?? 0 }]
  }).sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
}

/** los ritmos legibles (sin rango de segundos o de planos no entra) */
export function leerRitmos(filas: unknown): RitmoDeVideo[] {
  if (!Array.isArray(filas)) return []
  return filas.filter((f): f is Fila => !!f && typeof f === 'object').filter(activa).flatMap((f) => {
    const id = texto(f.id), smin = numero(f.segundos_min), smax = numero(f.segundos_max), pmin = numero(f.planos_min), pmax = numero(f.planos_max)
    if (!id || smin == null || smax == null || pmin == null || pmax == null || smax < smin || pmax < pmin) return []
    return [{ id, nombre: texto(f.nombre) || id, segundos_min: smin, segundos_max: smax, red: texto(f.red) || null, planos_min: pmin, planos_max: pmax, gancho_hasta_s: numero(f.gancho_hasta_s), producto_antes_de_s: numero(f.producto_antes_de_s), notas: textos(f.notas), rubros: textos(f.rubros) }]
  }).sort((a, b) => a.segundos_min - b.segundos_min || (a.red ? 1 : 0) - (b.red ? 1 : 0))
}

/** lo que vale para ESTE cliente: lo general (sin rubros) más lo de sus familias. Sin rubro reconocido, solo lo general */
export function bibliotecaDelCliente(l: LecturaDeLaBiblioteca): BibliotecaDeVideo & { familias: string[] } {
  const familias = familiasDelRubro(l.industria).filter((f) => f !== 'general') as string[]
  const sirve = (r: string[]) => !r.length || r.some((x) => familias.includes(x))
  return { fichas: leerFichas(l.fichas).filter((f) => sirve(f.rubros)), ritmos: leerRitmos(l.ritmos).filter((r) => sirve(r.rubros)), familias }
}

/** el ritmo que aplica a un video de `segundos` en `red`: el de esa red si lo hay; si no, el de cualquier red. Entre varios, el de rubro antes que el general */
export function ritmoPara(segundos: number, red: string | null | undefined, ritmos: RitmoDeVideo[]): RitmoDeVideo | null {
  const red_ = (red ?? '').toLowerCase().trim()
  // la duración se redondea al segundo (los rangos son de segundos enteros: 8,5 s cae en el de 9 a 15)
  const sg = Math.round(segundos)
  const cubre = ritmos.filter((r) => sg >= r.segundos_min && sg <= r.segundos_max)
  const deLaRed = cubre.filter((r) => r.red && red_ && r.red.toLowerCase() === red_)
  const pool = deLaRed.length ? deLaRed : cubre.filter((r) => !r.red)
  return [...pool].sort((a, b) => (b.rubros.length ? 1 : 0) - (a.rubros.length ? 1 : 0))[0] ?? null
}

const s = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} s`

/**
 * los AVISOS de ritmo de un guion (para la hoja de planos · S2-1): cuántos planos, cuándo entra el producto, planos más largos que la duración. Nunca rechaza.
 * `planos[].segundos` es la duración de cada plano; `producto: true` si el producto del cliente está en cuadro en ese plano.
 */
export function avisosDeRitmo(v: { segundos: number; red?: string | null; planos: Array<{ segundos: number; producto?: boolean }> }, ritmos: RitmoDeVideo[]): string[] {
  const r = ritmoPara(v.segundos, v.red, ritmos)
  if (!r) return []
  const avisos: string[] = []
  const n = v.planos.length
  if (n < r.planos_min || n > r.planos_max) avisos.push(`${s(v.segundos)} con ${n} ${n === 1 ? 'plano' : 'planos'}: la guía de ritmo «${r.nombre}» sugiere de ${r.planos_min} a ${r.planos_max}`)
  if (r.producto_antes_de_s != null && v.planos.length) {
    let t = 0, entra: number | null = null
    for (const p of v.planos) { if (p.producto && entra == null) entra = t; t += Math.max(0, Number(p.segundos) || 0) }
    if (entra == null) avisos.push(`el producto no aparece en ningún plano: la guía de ritmo «${r.nombre}» sugiere mostrarlo antes de ${s(r.producto_antes_de_s)}`)
    else if (entra >= r.producto_antes_de_s) avisos.push(`el producto entra a los ${s(entra)}: la guía de ritmo «${r.nombre}» sugiere mostrarlo antes de ${s(r.producto_antes_de_s)}`)
  }
  return avisos
}

const rango = (a: number, b: number) => (a === b ? s(a) : `${Number.isInteger(a) ? a : a.toFixed(1)}–${s(b)}`)

/** la sección que recibe cada turno de la mesa de video: guía para elegir, no lista cerrada (vacía si no hay nada legible) */
export function seccionDeLaBiblioteca(b: BibliotecaDeVideo & { familias?: string[] }): string {
  if (!b.fichas.length && !b.ritmos.length) return ''
  const partes = ['## Biblioteca de planos y ritmos de la oficina (guía para elegir, no lista cerrada)',
    'Úsala para decidir qué plano cumple cada rol de la historia y cuánto dura. No es un menú obligatorio: si otra técnica sirve mejor, úsala, nómbrala y di por qué. Cada técnica es protagonista una sola vez en el video.']
  if (b.ritmos.length) {
    partes.push('', '### Ritmo según la duración')
    for (const r of b.ritmos) {
      const extra = [r.gancho_hasta_s != null ? `gancho dentro de los primeros ${s(r.gancho_hasta_s)}` : '', r.producto_antes_de_s != null ? `el producto en cuadro antes de ${s(r.producto_antes_de_s)}` : '', ...r.notas].filter(Boolean)
      partes.push(`- **${rango(r.segundos_min, r.segundos_max)}${r.red ? ` · ${r.red}` : ''}** · de ${r.planos_min} a ${r.planos_max} planos${extra.length ? ' · ' + extra.join(' · ') : ''}`)
    }
  }
  if (b.fichas.length) {
    partes.push('', '### Fichas de plano (id · qué hace · para qué rol · ejes · duración · efecto · trampas)')
    for (const f of b.fichas) {
      const ejes = [f.material && `material ${f.material}`, f.forma && `forma ${f.forma}`, f.camara && `cámara: ${f.camara}`, f.intensidad && `intensidad ${f.intensidad}`].filter(Boolean).join(' · ')
      partes.push(`- **${f.id}** · ${f.nombre}: ${f.que_hace}${f.roles.length ? ` · rol: ${f.roles.join(', ')}` : ''}${ejes ? ` · ${ejes}` : ''} · ${rango(f.segundos_min, f.segundos_max)}${f.efecto ? ` · efecto: ${f.efecto}` : ''}${f.trampas.length ? ` · ojo: ${f.trampas.join('; ')}` : ''}`)
    }
  }
  return partes.join('\n')
}
