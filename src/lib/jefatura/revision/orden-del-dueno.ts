/**
 * LA PALABRA DEL DUEÑO MANDA (01-nov · firma de Emilio «mi palabra manda»). Puro, sin base y sin modelo.
 * El significado de «condiciona» no se decide con texto: lo juzga un agente que no escribió el plan. Lo que se fuerza por código es el resultado:
 *  · las órdenes salen de lo que el dueño escribió, partidas por código: el agente no puede inventarlas ni omitirlas;
 *  · una fila que falta, sin cita literal o ilegible cuenta como «no cumple»; sin verificación, ninguna versión cumple;
 *  · la versión que no cumple no se adopta; si ninguna cumple, va a la persona.
 */
import { citaAparece, normalizar } from '../../cadena/texto'

/** no escribe el plan, no decide sobre el revisor externo y su oficio es contrastar afirmaciones con evidencia */
export const VERIFICADOR_DE_ORDENES = 'market_research_analyst'
export const CLAVE_DE_VERIFICACION = 'verificar_ordenes'
export const ESQUEMA_DE_VERIFICACION = 'verificacion_de_ordenes.v1'
/** una cita más corta se encuentra en cualquier plan: no comprueba nada */
export const MINIMO_DE_CARACTERES_DE_CITA = 15
const MINIMO_DE_CARACTERES_DE_ORDEN = 12

/** lista cerrada: fuera de esto, ninguna orden se escala. Escalar no quita ni cambia la orden: solo avisa a la persona */
export const CATEGORIAS_DE_SALVAGUARDA = ['ilegal', 'dano_a_personas'] as const
export type CategoriaDeSalvaguarda = (typeof CATEGORIAS_DE_SALVAGUARDA)[number]

/** cada frase de lo que escribió el dueño es una orden o un hecho; el agente responde por cada una */
export function partirOrdenes(texto: string | null | undefined): string[] {
  return String(texto ?? '')
    .split(/\r?\n+|(?<=[.;!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => normalizar(x).length >= MINIMO_DE_CARACTERES_DE_ORDEN)
}

export interface FilaDeVerificacion { version: string; orden: number; estado: 'cumple' | 'no_cumple' | 'no_aplica'; cita?: string; motivo?: string; salvaguarda?: string }
export interface VersionDelPlan { etiqueta: string; texto: string }
export interface OrdenSinCumplir { orden: string; motivo: string }
export interface VeredictoDeVersion { cumple: boolean; sin_cumplir: OrdenSinCumplir[] }
export interface VeredictoDeOrdenes {
  por_version: Record<string, VeredictoDeVersion>
  /** lo que el agente tomó como contexto y no como orden: queda a la vista, por si se equivocó */
  sin_aplicar: Array<{ orden: string; motivo: string }>
  salvaguardas: Array<{ orden: string; categoria: CategoriaDeSalvaguarda; motivo: string }>
}

/** `filas` null = la verificación no ocurrió o no se pudo leer: ninguna versión cumple */
export function evaluarOrdenes(ordenes: string[], filas: FilaDeVerificacion[] | null, versiones: VersionDelPlan[]): VeredictoDeOrdenes {
  const sin_aplicar = new Map<string, string>()
  const salvaguardas: VeredictoDeOrdenes['salvaguardas'] = []
  const por_version: Record<string, VeredictoDeVersion> = {}
  for (const v of versiones) {
    const sin_cumplir: OrdenSinCumplir[] = []
    let algunaCumple = false
    ordenes.forEach((orden, i) => {
      const suyas = (filas ?? []).filter((f) => f.version === v.etiqueta && f.orden === i + 1)
      if (!suyas.length) return void sin_cumplir.push({ orden, motivo: filas ? 'el verificador no respondió por esta orden' : 'no se pudo verificar' })
      for (const f of suyas) {
        if (CATEGORIAS_DE_SALVAGUARDA.includes(f.salvaguarda as CategoriaDeSalvaguarda) && !salvaguardas.some((x) => x.orden === orden)) salvaguardas.push({ orden, categoria: f.salvaguarda as CategoriaDeSalvaguarda, motivo: String(f.motivo ?? '') })
      }
      const mala = suyas.find((f) => f.estado !== 'cumple' && f.estado !== 'no_aplica') ?? suyas.find((f) => f.estado === 'no_aplica' && !String(f.motivo ?? '').trim())
      if (mala) return void sin_cumplir.push({ orden, motivo: String(mala.motivo ?? '').trim() || 'el verificador dijo que no se cumple' })
      if (suyas.every((f) => f.estado === 'no_aplica')) return void sin_aplicar.set(orden, String(suyas[0].motivo).trim())
      const sinCita = suyas.find((f) => normalizar(f.cita ?? '').length < MINIMO_DE_CARACTERES_DE_CITA || !citaAparece(v.texto, f.cita))
      if (sinCita) return void sin_cumplir.push({ orden, motivo: 'la cita del verificador no aparece en esta versión' })
      algunaCumple = true
    })
    // todo «no aplica» sería la forma de no verificar nada
    if (ordenes.length && !algunaCumple && !sin_cumplir.length) sin_cumplir.push({ orden: ordenes[0], motivo: 'el verificador no encontró ninguna orden que comprobar' })
    por_version[v.etiqueta] = { cumple: sin_cumplir.length === 0, sin_cumplir }
  }
  return { por_version, sin_aplicar: [...sin_aplicar].map(([orden, motivo]) => ({ orden, motivo })), salvaguardas }
}

export function tareaDeVerificacionDeOrdenes(a: { ordenes: string[]; versiones: VersionDelPlan[] }): { task: string; indicacion: string; esquema: string } {
  const indicacion = 'Comprueba si cada frase del dueño se respeta en cada versión del plan. No corriges el plan ni opinas sobre él.'
  const task = [
    indicacion,
    `## Lo que escribió el dueño, frase por frase\n${a.ordenes.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
    ...a.versiones.map((v) => `## Versión ${v.etiqueta} del plan\n${v.texto.trim()}`),
    [
      '## Cómo responder',
      'Una fila por cada frase y por cada versión, sin omitir ninguna.',
      '- «cumple»: el plan hace lo que la frase ordena o respeta lo que declara. Copia en `cita` la frase del plan que lo demuestra, literal y de esa versión.',
      '- «no_cumple»: el plan lo omite, lo niega, lo aplaza o le pone una condición que el dueño no puso. Si el dueño dijo «ahora» y el plan dice «cuando esté lista la operación», no cumple. Explica por qué en `motivo`.',
      '- «no_aplica»: la frase no ordena ni declara nada sobre el plan. Explica por qué en `motivo`. Si dudas, no la uses.',
      `Tu opinión sobre si la orden es buena idea no cuenta. Solo si cumplirla sería ilegal o dañaría a personas, agrega \`salvaguarda\` con uno de estos valores: ${CATEGORIAS_DE_SALVAGUARDA.join(', ')}. Que sea difícil, cara, arriesgada o prematura no entra.`,
      'Devuelve solo el JSON {"filas":[{"version":"A","orden":1,"estado":"cumple|no_cumple|no_aplica","cita":"…","motivo":"…"}]}.',
    ].join('\n'),
  ].join('\n\n')
  return { task, indicacion, esquema: ESQUEMA_DE_VERIFICACION }
}
