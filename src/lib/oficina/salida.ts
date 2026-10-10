/**
 * CONTRATO DE FORMATO · «ninguna regla se confía al modelo» (Emilio, 09-oct): el formato de la salida de un agente lo hace cumplir el CÓDIGO.
 *  1. se limpia el envoltorio (cercas ```json, prosa antes del primer `{` o después del último `}`);
 *  2. se IGNORA cualquier tamaño o parámetro que escriba el agente (lo pone la sala): el campo se descarta y se anota;
 *  3. se valida contra el esquema; si no cumple, UN reintento con el error literal; si vuelve a fallar: FALLA VISIBLE (nunca se rellena ni se adivina).
 * Pura: sin red ni modelo. Esquemas escritos a mano (sin dependencias).
 */
import type { Ficha } from './tipos'

export type Esq =
  | { t: 'str'; min?: number; max?: number }
  | { t: 'num'; min?: number; max?: number }
  | { t: 'bool' }
  | { t: 'enum'; v: Array<string | number | boolean> }
  | { t: 'arr'; de: Esq; min?: number; max?: number }
  | { t: 'obj'; props: Record<string, Esq>; req?: string[]; extra?: boolean; ignorar?: string[] }

const str = (min = 1, max = 4000): Esq => ({ t: 'str', min, max })
const regla: Esq = { t: 'obj', props: { id: str(1, 60), texto: str(1, 400), claves: { t: 'arr', de: str(1, 80), max: 12 }, cita: str(1, 600) }, req: ['id', 'texto'] }
const necesito: Esq = { t: 'arr', max: 3, de: { t: 'obj', props: { que: str(1, 300), para_que: str(1, 300), bloquea: { t: 'bool' } }, req: ['que'] } }
const IGNORAR_TAMANO = ['tamaño', 'tamano', 'size', 'aspect_ratio', 'relacion_de_aspecto', 'ar']
/** salas 2-3: la plataforma y el tamaño los pone la sala (una sola plataforma por encargo); y nadie le pregunta nada al cliente: `open_questions` se descarta y se anota */
const IGNORAR_LAMINAS = [...IGNORAR_TAMANO, 'platform', 'plataforma', 'platforms_requested', 'dimensiones', 'open_questions', 'preguntas']

/** roles de lámina (contrato del diseñador de carruseles) */
export const ROLES_DE_LAMINA = ['hook', 'problem', 'reframe', 'proof', 'social-proof', 'benefit', 'objection', 'cta', 'cierre'] as const
/** topes DUROS del formato de una lámina (contrato del diseñador); los límites finos por red viven en `limites` de la plantilla */
export const LIMITES_DE_LAMINA = { eyebrow: 24, headline: 90, body: 220, cta: 32 } as const

const lamina: Esq = {
  t: 'obj', req: ['rol', 'headline'], ignorar: IGNORAR_LAMINAS,
  props: { orden: { t: 'num', min: 1, max: 30 }, rol: { t: 'enum', v: [...ROLES_DE_LAMINA] }, eyebrow: str(0, LIMITES_DE_LAMINA.eyebrow), headline: str(1, LIMITES_DE_LAMINA.headline), body: str(0, LIMITES_DE_LAMINA.body), cta: str(0, LIMITES_DE_LAMINA.cta) },
}
const copiaCarrusel: Esq = { t: 'obj', req: ['texto_base', 'pie_de_foto', 'hashtags'], ignorar: IGNORAR_LAMINAS, props: { texto_base: str(1, 5000), pie_de_foto: str(1, 3000), hashtags: { t: 'arr', de: str(1, 80), max: 40 }, llamado: str(0, 300), nota_para_quien_publica: str(0, 600), necesito } }
/** un elemento de texto del kit: SOLO texto (lo escribe `content-creator`, único autor) */
const elementoDeCopyKit: Esq = {
  t: 'obj', req: ['ref', 'headline'], ignorar: IGNORAR_LAMINAS,
  props: { ref: str(1, 60), eyebrow: str(0, LIMITES_DE_LAMINA.eyebrow), headline: str(1, LIMITES_DE_LAMINA.headline), body: str(0, LIMITES_DE_LAMINA.body), cta: str(0, LIMITES_DE_LAMINA.cta), acompanamiento: str(0, 1500), hashtags: { t: 'arr', de: str(1, 80), max: 40 } },
}
/** un elemento de ESTRUCTURA del kit: sin ningún campo de texto de imagen (extra: false ⇒ cualquier clave de más falla el formato) */
const elementoDeEstructura: Esq = {
  t: 'obj', req: ['ref', 'rol', 'beat', 'mood'],
  props: { ref: str(1, 60), rol: str(1, 60), beat: str(1, 200), foto_slot: str(0, 80), mood: str(1, 120), sugerencia_interactiva: str(0, 160) },
}
const respuestas: Esq = { t: 'arr', max: 12, de: { t: 'obj', req: ['id', 'estado', 'razon'], props: { id: str(1, 80), estado: { t: 'enum', v: ['tomada', 'no_tomada'] }, razon: str(1, 600) } } }

export const ESQUEMAS: Record<string, Esq> = {
  'direccion_imagenes.v1': {
    t: 'obj', req: ['resumen', 'imagenes', 'reglas_de_imagen'], ignorar: IGNORAR_LAMINAS,
    props: {
      resumen: str(1, 1500), paleta: { t: 'arr', de: str(1, 40), max: 8 }, estilo: str(1, 600),
      imagenes: { t: 'arr', max: 30, de: { t: 'obj', req: ['ref', 'modo', 'motivo'], props: { ref: str(1, 60), modo: { t: 'enum', v: ['real', 'generada', 'ninguna'] }, foto_id: str(1, 80), motivo: str(1, 600) } } },
      reglas_de_imagen: { t: 'obj', req: ['obligatorio', 'prohibido'], props: { obligatorio: { t: 'arr', de: regla, max: 20 }, prohibido: { t: 'arr', de: regla, max: 20 } } },
      necesito,
    },
  },
  'prompts_por_ref.v1': {
    t: 'obj', req: ['imagenes'], ignorar: IGNORAR_LAMINAS,
    props: { imagenes: { t: 'arr', min: 1, max: 8, de: { t: 'obj', req: ['ref', 'prompts'], ignorar: IGNORAR_LAMINAS, props: { ref: str(1, 60), prompts: { t: 'arr', min: 2, max: 3, de: { t: 'obj', req: ['prompt', 'idea_en_una_linea'], ignorar: IGNORAR_LAMINAS, props: { prompt: str(20, 2500), idea_en_una_linea: str(1, 240) } } } } } } },
  },
  'copy_base.v1': copiaCarrusel,
  'laminas.v1': { t: 'obj', req: ['laminas'], ignorar: IGNORAR_LAMINAS, props: { laminas: { t: 'arr', min: 1, max: 10, de: lamina }, necesito } },
  'estructura.v1': { t: 'obj', req: ['elementos'], props: { elementos: { t: 'arr', min: 1, max: 30, de: elementoDeEstructura } } },
  'copy_kit.v1': { t: 'obj', req: ['elementos'], ignorar: IGNORAR_LAMINAS, props: { elementos: { t: 'arr', min: 1, max: 30, de: elementoDeCopyKit }, necesito } },
  'resolucion_copy_base.v1': { t: 'obj', req: ['respuestas'], ignorar: IGNORAR_LAMINAS, props: { respuestas, copia: copiaCarrusel } },
  'resolucion_laminas.v1': { t: 'obj', req: ['respuestas'], ignorar: IGNORAR_LAMINAS, props: { respuestas, laminas: { t: 'arr', min: 1, max: 10, de: lamina } } },
  'resolucion_copy_kit.v1': { t: 'obj', req: ['respuestas'], ignorar: IGNORAR_LAMINAS, props: { respuestas, elementos: { t: 'arr', min: 1, max: 30, de: elementoDeCopyKit } } },
  'resolucion_estructura.v1': { t: 'obj', req: ['respuestas'], props: { respuestas, elementos: { t: 'arr', min: 1, max: 30, de: elementoDeEstructura } } },
  'visual_direction.v1': {
    t: 'obj', req: ['resumen', 'decision', 'reglas_de_imagen'], ignorar: IGNORAR_TAMANO,
    props: {
      resumen: str(1, 1500), paleta: { t: 'arr', de: str(1, 40), max: 8 }, estilo: str(1, 600),
      decision: { t: 'obj', req: ['modo', 'motivo'], props: { modo: { t: 'enum', v: ['real', 'generada', 'ninguna'] }, foto_id: str(1, 80), motivo: str(1, 600) } },
      reglas_de_imagen: { t: 'obj', req: ['obligatorio', 'prohibido'], props: { obligatorio: { t: 'arr', de: regla, max: 20 }, prohibido: { t: 'arr', de: regla, max: 20 } } },
      necesito,
    },
  },
  'prompts.v1': {
    t: 'obj', req: ['prompts'], ignorar: IGNORAR_TAMANO,
    props: { prompts: { t: 'arr', min: 2, max: 3, de: { t: 'obj', req: ['prompt', 'idea_en_una_linea'], ignorar: IGNORAR_TAMANO, props: { prompt: str(20, 2500), idea_en_una_linea: str(1, 240) } } } },
  },
  'observacion_imagen.v1': {
    t: 'obj', req: ['imagenes', 'preferencia'],
    props: {
      imagenes: {
        t: 'arr', min: 1, max: 6,
        de: {
          t: 'obj', req: ['indice', 'reglas', 'texto_en_imagen', 'marcas', 'personas'],
          props: {
            indice: { t: 'num', min: 0, max: 20 },
            reglas: { t: 'arr', max: 40, de: { t: 'obj', req: ['id', 'presente'], props: { id: str(1, 60), presente: { t: 'enum', v: [true, false, 'no_se_ve'] }, evidencia: str(0, 400) } } },
            texto_en_imagen: { t: 'arr', de: str(0, 200), max: 30 }, marcas: { t: 'arr', de: str(0, 120), max: 20 },
            personas: { t: 'num', min: 0, max: 50 }, producto: str(0, 200), elementos_visibles: { t: 'arr', de: str(0, 120), max: 40 },
          },
        },
      },
      preferencia: { t: 'arr', de: { t: 'num', min: 0, max: 20 }, max: 6 },
    },
  },
  'pieza_post.v1': {
    t: 'obj', req: ['pie_de_foto', 'hashtags'], ignorar: IGNORAR_TAMANO,
    props: { pie_de_foto: str(1, 3000), hashtags: { t: 'arr', de: str(1, 80), max: 40 }, llamado: str(0, 300), nota_para_quien_publica: str(0, 600), necesito },
  },
  'fichas.v1': {
    t: 'obj', req: ['fichas'],
    props: { fichas: { t: 'arr', max: 12, de: { t: 'obj', req: ['que', 'donde', 'contra_que', 'gravedad', 'propuesta'], props: { que: str(1, 500), donde: str(1, 200), contra_que: str(1, 400), gravedad: { t: 'enum', v: ['bloquea', 'sugerencia'] }, propuesta: str(1, 600) } } } },
  },
  'resolucion.v1': {
    t: 'obj', req: ['respuestas'], ignorar: IGNORAR_TAMANO,
    props: {
      pieza: { t: 'obj', req: ['pie_de_foto', 'hashtags'], props: { pie_de_foto: str(1, 3000), hashtags: { t: 'arr', de: str(1, 80), max: 40 }, llamado: str(0, 300), nota_para_quien_publica: str(0, 600) } },
      respuestas: { t: 'arr', max: 12, de: { t: 'obj', req: ['id', 'estado', 'razon'], props: { id: str(1, 80), estado: { t: 'enum', v: ['tomada', 'no_tomada'] }, razon: str(1, 600) } } },
    },
  },
}

/** la misma observación de imágenes, para piezas con VARIAS imágenes (carrusel, kit): hasta 12 en vez de 6 */
function conMaxImagenes(esq: Esq, n: number): Esq {
  const o = esq as Extract<Esq, { t: 'obj' }>
  const imgs = o.props.imagenes as Extract<Esq, { t: 'arr' }>
  const pref = o.props.preferencia as Extract<Esq, { t: 'arr' }>
  // el índice de una imagen puede ser alto: las fotos reales que el curador mira numeran desde 1000 para no chocar con las generadas
  const item = imgs.de as Extract<Esq, { t: 'obj' }>
  const ancho = (x: Esq): Esq => ({ ...(x as Extract<Esq, { t: 'num' }>), max: 2000 })
  return { ...o, props: { ...o.props, imagenes: { ...imgs, max: n, de: { ...item, props: { ...item.props, indice: ancho(item.props.indice) } } }, preferencia: { ...pref, max: n, de: ancho(pref.de) } } }
}
ESQUEMAS['observacion_imagenes.v1'] = conMaxImagenes(ESQUEMAS['observacion_imagen.v1'], 12)
/** la opinión del revisor externo es TEXTO LIBRE (sin campos, sin rúbrica): lo único que se exige es que haya texto */
ESQUEMAS['opinion_libre.v1'] = { t: 'str', min: 1, max: 20000 }

/** quita el envoltorio: cercas ``` (con o sin «json») y prosa fuera de las llaves */
export function limpiarSalida(texto: string): { ok: true; json: string; envoltorio: boolean } | { ok: false; error: string } {
  if (typeof texto !== 'string' || !texto.trim()) return { ok: false, error: 'salida_vacia' }
  let t = texto.trim()
  let envoltorio = false
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (cerca) { t = cerca[1].trim(); envoltorio = true }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b < a) return { ok: false, error: 'sin_objeto_json' }
  if (a > 0 || b < t.length - 1) envoltorio = true
  return { ok: true, json: t.slice(a, b + 1), envoltorio }
}

export function validar(esq: Esq, v: unknown, ruta = '$'): string[] {
  switch (esq.t) {
    case 'str':
      if (typeof v !== 'string') return [`${ruta}: debe ser texto`]
      if (esq.min !== undefined && v.trim().length < esq.min) return [`${ruta}: texto demasiado corto (mín. ${esq.min})`]
      if (esq.max !== undefined && v.length > esq.max) return [`${ruta}: texto demasiado largo (máx. ${esq.max})`]
      return []
    case 'num':
      if (typeof v !== 'number' || !Number.isFinite(v)) return [`${ruta}: debe ser número`]
      if (esq.min !== undefined && v < esq.min) return [`${ruta}: menor que ${esq.min}`]
      if (esq.max !== undefined && v > esq.max) return [`${ruta}: mayor que ${esq.max}`]
      return []
    case 'bool': return typeof v === 'boolean' ? [] : [`${ruta}: debe ser verdadero o falso`]
    case 'enum': return esq.v.includes(v as never) ? [] : [`${ruta}: valor «${String(v)}» fuera de ${JSON.stringify(esq.v)}`]
    case 'arr': {
      if (!Array.isArray(v)) return [`${ruta}: debe ser una lista`]
      const e: string[] = []
      if (esq.min !== undefined && v.length < esq.min) e.push(`${ruta}: faltan elementos (mín. ${esq.min})`)
      if (esq.max !== undefined && v.length > esq.max) e.push(`${ruta}: sobran elementos (máx. ${esq.max})`)
      v.forEach((x, i) => e.push(...validar(esq.de, x, `${ruta}[${i}]`)))
      return e
    }
    case 'obj': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return [`${ruta}: debe ser un objeto`]
      const o = v as Record<string, unknown>
      const e: string[] = []
      for (const k of esq.req ?? []) if (o[k] === undefined) e.push(`${ruta}.${k}: falta`)
      for (const [k, x] of Object.entries(o)) {
        const sub = esq.props[k]
        if (!sub) { if (!esq.extra) e.push(`${ruta}.${k}: campo no permitido`); continue }
        e.push(...validar(sub, x, `${ruta}.${k}`))
      }
      return e
    }
  }
}

/** quita (recursivamente) los campos «ignorar» de cada objeto cuyo esquema los declare; devuelve lo quitado */
export function descartarIgnorados(esq: Esq, v: unknown, ruta = '$', quitados: string[] = []): unknown {
  if (esq.t === 'arr' && Array.isArray(v)) return v.map((x, i) => descartarIgnorados(esq.de, x, `${ruta}[${i}]`, quitados))
  if (esq.t === 'obj' && v && typeof v === 'object' && !Array.isArray(v)) {
    const sale: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (esq.ignorar?.includes(k)) { quitados.push(`${ruta}.${k}`); continue }
      sale[k] = esq.props[k] ? descartarIgnorados(esq.props[k], x, `${ruta}.${k}`, quitados) : x
    }
    return sale
  }
  return v
}

export type ResultadoDeSalida =
  | { ok: true; valor: Record<string, unknown>; descartados: string[]; envoltorio_limpiado: boolean }
  | { ok: false; accion: 'reintentar'; mensaje_de_error: string }
  | { ok: false; accion: 'falla_visible'; errores: string[]; ficha: Pick<Ficha, 'origen' | 'donde' | 'gravedad' | 'que'> }

/** `intento` = cuántos intentos de formato ya se hicieron (0 en el primero). Un reintento como máximo cuando `reintento_formato` = 1. */
export function procesarSalida(texto: string, esquemaId: string, intento: number, reintento_formato: number): ResultadoDeSalida {
  const esq = ESQUEMAS[esquemaId]
  if (!esq) return { ok: false, accion: 'falla_visible', errores: [`esquema «${esquemaId}» no registrado`], ficha: { origen: 'chequeo', donde: 'formato', gravedad: 'bloquea', que: `esquema «${esquemaId}» no registrado` } }
  const fallo = (errores: string[]): ResultadoDeSalida =>
    intento < reintento_formato
      ? { ok: false, accion: 'reintentar', mensaje_de_error: `Tu respuesta no cumple el formato. Errores: ${errores.slice(0, 8).join(' · ')}. Devuelve solo el JSON del contrato.` }
      : { ok: false, accion: 'falla_visible', errores, ficha: { origen: 'chequeo', donde: 'formato', gravedad: 'bloquea', que: `la salida del agente no cumple el formato «${esquemaId}» tras ${intento + 1} intento(s): ${errores.slice(0, 3).join(' · ')}` } }
  const l = limpiarSalida(texto)
  if (!l.ok) return fallo([l.error])
  let crudo: unknown
  try { crudo = JSON.parse(l.json) } catch (e) { return fallo([`json_invalido: ${e instanceof Error ? e.message : String(e)}`]) }
  const descartados: string[] = []
  const limpio = descartarIgnorados(esq, crudo, '$', descartados)
  const errores = validar(esq, limpio)
  if (errores.length) return fallo(errores)
  return { ok: true, valor: limpio as Record<string, unknown>, descartados, envoltorio_limpiado: l.envoltorio }
}
