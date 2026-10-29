/**
 * DESMENUZAR · de un comentario crudo del dueño a ideas sueltas (etapa 2). El modelo propone; el código VERIFICA (nada de lo que el modelo diga entra sin pasar estas guardas):
 *   · cada idea trae la `cita` literal del comentario que la respalda — si no está en el comentario, se descarta la cita y se usa el comentario entero (no se inventa un respaldo);
 *   · el alcance por omisión es CLIENTE: sube a industria/formato/general solo si el dueño lo dijo (el modelo lo declara con `evidencia_de_alcance`, y se comprueba que esa frase está en el comentario);
 *   · atributo y destinatario salen del catálogo (dato ampliable): un atributo que no está se ACEPTA y se anota como propuesto (nada de rejas); un destinatario que no está cae a «direccion».
 * PURO: sin red ni base.
 */
import { normalizar } from '../../manual/texto'
import { ALCANCES, slugNormal, type Alcance, type Catalogo, type Direccion } from './datos'

export interface Idea {
  idea: string
  /** tema corto de lo que habla la idea («emojis», «fondo blanco»): con él se sabe que dos notas hablan de lo mismo */
  sobre: string
  atributo: string
  destinatario: string
  direccion: Direccion
  alcance: Alcance
  formato: string | null
  cita: string
  atributo_propuesto: boolean
}
export const MAX_IDEAS_POR_NOTA = 8
export const MAX_COMENTARIO = 2000

export function promptDeDesmenuzar(o: { comentario: string; rubro: string | null; formato: string | null; catalogo: Catalogo }): { system: string; texto: string } {
  const system = [
    'Eres el desmenuzador de los comentarios del dueño de un negocio sobre piezas de marketing. Separas el comentario en IDEAS SUELTAS que sirvan a quien produzca la próxima pieza.',
    'Responde SOLO un objeto JSON: {"ideas":[{"idea":"…","sobre":"…","atributo":"…","destinatario":"…","direccion":"hacer|evitar","alcance":"cliente|industria|formato|general","evidencia_de_alcance":"…","formato":"…","cita":"…"}]}.',
    'Reglas: (1) una idea = una indicación accionable; no inventes nada que el dueño no dijo. (2) "cita" = la frase LITERAL del comentario que la respalda. (3) "sobre" = 1 a 3 palabras del tema (p. ej. emojis, fondo blanco, precio). (4) "direccion": hacer si pide algo, evitar si lo rechaza.',
    '(5) "alcance" es "cliente" SALVO que el dueño diga expresamente que vale para todo un rubro (industria), para un tipo de pieza (formato) o para todos sus negocios / siempre (general); en ese caso copia en "evidencia_de_alcance" la frase literal que lo dice. Ante la duda, "cliente".',
    `(6) "destinatario" ∈ ${o.catalogo.destinatarios.join(' | ')} (a quién le sirve: texto = quien escribe, diseno = quien diseña, imagen = quien produce la foto, direccion = criterio general de la mesa).`,
    `(7) "atributo" ∈ ${o.catalogo.atributos.join(' | ')}; si ninguno encaja, escribe uno nuevo corto en minúsculas sin tildes. (8) Si el comentario no contiene ninguna indicación (solo un saludo o un "ok"), devuelve {"ideas":[]}. Máximo ${MAX_IDEAS_POR_NOTA} ideas.`,
  ].join('\n')
  const texto = `Rubro del negocio: ${o.rubro ?? 'no se sabe'}\nFormato de la pieza comentada: ${o.formato ?? 'no se sabe'}\nComentario del dueño (literal):\n«${o.comentario.slice(0, MAX_COMENTARIO)}»`
  return { system, texto }
}

const slug = slugNormal
const limpio = (s: unknown, max: number): string => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const contiene = (todo: string, frase: string): boolean => { const f = normalizar(frase).replace(/\s+/g, ' ').trim(); return f.length >= 4 && normalizar(todo).replace(/\s+/g, ' ').includes(f) }

/** lee la respuesta del modelo (JSON, con o sin cercas) y aplica las guardas; devuelve las ideas válidas y por qué se descartó cada resto */
export function leerIdeas(textoDelModelo: string, o: { comentario: string; catalogo: Catalogo; rubro?: string | null }): { ideas: Idea[]; descartadas: string[]; ilegible: boolean } {
  const m = /\{[\s\S]*\}/.exec(textoDelModelo)
  let j: unknown
  try { j = m ? JSON.parse(m[0]) : null } catch { j = null }
  const crudas = j && typeof j === 'object' && Array.isArray((j as { ideas?: unknown }).ideas) ? ((j as { ideas: unknown[] }).ideas) : null
  if (!crudas) return { ideas: [], descartadas: [], ilegible: true }
  const ideas: Idea[] = [], descartadas: string[] = []
  for (const c of crudas.slice(0, MAX_IDEAS_POR_NOTA)) {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const texto = limpio(x.idea, 280)
    if (texto.length < 6) { descartadas.push('idea vacía o demasiado corta'); continue }
    const direccion: Direccion = x.direccion === 'evitar' ? 'evitar' : 'hacer'
    const atributo = slug(x.atributo) || 'otro'
    const destinatario = o.catalogo.destinatarios.includes(slug(x.destinatario)) ? slug(x.destinatario) : 'direccion'
    let alcance: Alcance = (ALCANCES as string[]).includes(String(x.alcance)) ? (x.alcance as Alcance) : 'cliente'
    // subir de alcance exige la frase del dueño que lo dice, y que esa frase esté de verdad en su comentario
    if (alcance !== 'cliente' && !contiene(o.comentario, limpio(x.evidencia_de_alcance, 200))) alcance = 'cliente'
    const formato = slug(x.formato) || null
    if (alcance === 'formato' && !formato) alcance = 'cliente'
    if (alcance === 'industria' && !o.rubro) alcance = 'cliente'
    const citaDicha = limpio(x.cita, 300)
    const cita = contiene(o.comentario, citaDicha) ? citaDicha : limpio(o.comentario, 300)
    ideas.push({ idea: texto, sobre: limpio(x.sobre, 60) || atributo, atributo, destinatario, direccion, alcance, formato: alcance === 'formato' || formato ? formato : null, cita, atributo_propuesto: !o.catalogo.atributos.includes(atributo) })
  }
  return { ideas, descartadas, ilegible: false }
}
