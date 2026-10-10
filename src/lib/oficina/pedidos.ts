/**
 * LO QUE SE LE PIDE A CADA EMPLEADO · el texto de la tarea de cada paso de agente, armado por código con referencias a los artefactos (no con el hilo entero).
 * Agnóstico: ninguna frase nombra a un cliente. El formato de la respuesta lo hace cumplir `salida.ts`; aquí solo se explica el contrato en palabras.
 */
import type { BriefLeido } from './brief'
import type { ContextoDelRevisor, ResumenDelEncargo } from './ciego'
import type { Estado, Ficha } from './tipos'
import type { FuentesCompletas } from './puertos'
import type { ReglasDeImagen } from './reglas-de-imagen'

export const AVISO_DEL_CEREBRO = 'Este cliente tiene un cerebro (almacén de conocimiento) que se actualiza a diario; lo esencial va abajo. Si necesitas algo que no está, dilo en el campo `necesito` de tu respuesta (máximo 3) y la sala se lo pide; lo que no se consiga se declara, no se inventa.'

const recorta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}\n[… recortado: ${t.length - n} caracteres más en el manual]` : t)
const lista = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (ninguno)')

export const CONTRATOS_EN_TEXTO: Record<string, string> = {
  'visual_direction.v1': '{"resumen": "…", "paleta": ["…"], "estilo": "…", "decision": {"modo": "real|generada|ninguna", "foto_id": "(solo si modo=real)", "motivo": "…"}, "reglas_de_imagen": {"obligatorio": [{"id": "o1", "texto": "…", "claves": ["palabras que debe cubrir un prompt"], "cita": "copia LITERAL del brief"}], "prohibido": [{"id": "p1", "texto": "…", "claves": ["palabras que no debe nombrar"], "cita": "copia LITERAL del brief"}]}, "necesito": []}',
  'prompts.v1': '{"prompts": [{"prompt": "…", "idea_en_una_linea": "…"}, {"prompt": "…", "idea_en_una_linea": "…"}]}  (2 o 3 prompts; no escribas tamaño ni parámetros: los fija la sala)',
  'observacion_imagen.v1': '{"imagenes": [{"indice": 0, "reglas": [{"id": "o1", "presente": true, "evidencia": "…"}], "texto_en_imagen": ["…"], "marcas": ["…"], "personas": 0, "producto": "…", "elementos_visibles": ["…"]}], "preferencia": [0]}  (presente = true | false | "no_se_ve"; describes, no apruebas)',
  'pieza_post.v1': '{"pie_de_foto": "…", "hashtags": ["…"], "llamado": "…", "nota_para_quien_publica": "…", "necesito": []}',
  'fichas.v1': '{"fichas": [{"que": "…", "donde": "texto|hashtags|imagen", "contra_que": "…", "gravedad": "bloquea|sugerencia", "propuesta": "…"}]}',
  'resolucion_solo.v1': '{"respuestas": [{"id": "…", "estado": "tomada|no_tomada", "razon": "…"}]}',
  'resolucion.v1': '{"respuestas": [{"id": "…", "estado": "tomada|no_tomada", "razon": "…"}], "pieza": {"pie_de_foto": "…", "hashtags": ["…"], "llamado": "…", "nota_para_quien_publica": "…"}}  (pieza solo si cambias algo)',
}

export interface ContextoDePedido {
  fuentes: FuentesCompletas
  brief: BriefLeido
  proporcion: string
  estado: Estado
  reglas: ReglasDeImagen
  /** las imágenes que el curador debe mirar ahora (índice estable + dirección) */
  imagenesAMirar: Array<{ indice: number; url: string }>
  /** datos de un artefacto (o undefined) */
  art: (nombre: string) => Record<string, unknown> | undefined
}

const seccionDeFichas = (fs: Ficha[]) => (fs.length ? fs.map((f) => `- [${f.id}] (${f.gravedad}) en ${f.donde}: ${f.que ?? ''} · contra: ${f.contra_que ?? ''} · propuesta: ${f.propuesta ?? ''}`).join('\n') : '- (ninguna)')
const pieza = (a: Record<string, unknown> | undefined) => (a ? `Pie de foto:\n${String(a.pie_de_foto ?? '')}\nHashtags: ${((a.hashtags as string[]) ?? []).join(' ')}\nLlamado: ${String(a.llamado ?? '')}` : '(todavía no hay pieza)')

export function describirReglas(r: ReglasDeImagen): string {
  return `OBLIGATORIO (debe verse / cubrirse):\n${lista(r.obligatorio.map((x) => `[${x.id}] ${x.texto}`))}\nPROHIBIDO (no debe verse / nombrarse):\n${lista(r.prohibido.map((x) => `[${x.id}] ${x.texto}`))}`
}

/** la tarea de un paso de agente; las imágenes (URL) que se le muestran van aparte */
export function construirTarea(clave: string, c: ContextoDePedido, extra?: { fichas?: Ficha[]; errorDeFormato?: string }): { task: string; images: string[]; esquema: string } {
  const F = c.fuentes
  const base = `${AVISO_DEL_CEREBRO}\n\n## Manual de marca del cliente\n${recorta(F.manual_texto, 12000)}\n\n## El brief de este entregable (guía, no regla al pie de la letra)\n${c.brief.texto}\n${c.fuentes.plan_texto ? `\n## Plan de trabajo del cliente (contexto)\n${recorta(c.fuentes.plan_texto, 8000)}\n` : ''}`
  const datosVerificados = `## Datos verificados del cliente (solo estos; no inventes otros)\nTeléfonos: ${F.propios.telefonos.join(', ') || '(no se pudieron leer)'}\nUsuarios: ${F.propios.handles.join(', ') || '(no se pudieron leer)'}\nPrecios de la carta: ${F.fuentes.precios.join(', ') || '(no hay carta guardada)'}`
  let task = '', esquema = '', images: string[] = []
  const finalizar = (t: string) => ({ task: extra?.errorDeFormato ? `${t}\n\n## Corrección de formato\n${extra.errorDeFormato}` : t, images, esquema })
  switch (clave) {
    case 'direccion_visual': {
      esquema = 'visual_direction.v1'
      const cand = (c.art('candidatas_foto')?.candidatas as Array<{ id: string; motivo_de_aceptacion: string; requiere_mirar: boolean }> | undefined) ?? []
      const desc = (c.art('candidatas_foto')?.descartadas as Array<{ id: string; motivos: string[] }> | undefined) ?? []
      images = cand.slice(0, 3).map((x) => F.fotos.find((f) => f.id === x.id)?.url ?? '').filter(Boolean)
      task = `${base}\n## Fotos reales candidatas del cliente (la sala ya descartó con motivo las que no sirven)\n${cand.length ? cand.map((x) => `- ${x.id}: ${x.motivo_de_aceptacion}${x.requiere_mirar ? ' (etiqueta de confianza media: se mirará)' : ''}`).join('\n') : '- (ninguna sirve para este brief)'}\nDescartadas: ${desc.length} (con motivo escrito).\n\n## Tu trabajo\nEres el director visual del encargo. Decide si se usa una foto real candidata (modo real, con su foto_id), una imagen generada (modo generada) o ninguna. Además entrega las reglas de imagen del brief: qué DEBE verse y qué NO debe verse. Como el brief es texto, cada regla lleva en \`cita\` la copia LITERAL de la frase del brief de la que sale (la sala comprueba que la cita existe; una regla sin cita válida se descarta).\nProporción pedida: ${c.proporcion}.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    case 'prompts': {
      esquema = 'prompts.v1'
      const vd = c.art('visual_direction') ?? {}
      task = `${base}\n## Dirección visual del curador\n${String(vd.resumen ?? '')}\nEstilo: ${String(vd.estilo ?? '')}\n\n## Reglas de imagen (el código comprobará cada prompt ANTES de generar)\n${describirReglas(c.reglas)}\n\n## Tu trabajo\nPropones 2 o 3 prompts de imagen distintos, en lenguaje natural (sujeto, entorno, luz, cámara, estilo). Cada prompt debe cubrir TODO lo obligatorio y no nombrar nada de lo prohibido sin negarlo. No escribas tamaño, proporción ni parámetros: los fija la sala. No nombres marcas, fotógrafos ni personas reales.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    case 'mirar': {
      esquema = 'observacion_imagen.v1'
      const imgs = c.imagenesAMirar
      images = imgs.map((i) => i.url)
      task = `${base}\n## Imágenes que te muestro, en orden\n${imgs.map((i, k) => `- imagen ${k + 1}: índice ${i.indice}`).join('\n') || '- (ninguna)'}\n\n## Reglas contra las que describes\n${describirReglas(c.reglas)}\n\n## Tu trabajo\nDESCRIBES; no apruebas ni rechazas (decide el código). Para cada imagen y cada regla indica si está presente (true), ausente (false) o no se ve ("no_se_ve"), con la evidencia. Lista además el texto visible, las marcas, cuántas personas y los elementos visibles. En \`preferencia\` ordena los índices de mejor a peor.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    case 'texto': {
      esquema = 'pieza_post.v1'
      const vd = c.art('visual_direction') ?? {}
      task = `${base}\n${datosVerificados}\n\n## Material del portero\n${String(c.art('material_portero')?.texto ?? '(sin texto adicional)')}\n\n## Dirección visual\n${String(vd.resumen ?? '')}\n\n## Tu trabajo\nEres el ÚNICO autor del texto de la pieza (pie de foto y hashtags en campos aparte). El brief manda el mensaje, el protagonista, la sintaxis y el llamado a la acción.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    case 'revision_jefe': {
      esquema = 'fichas.v1'
      const fin = c.art('imagen_final') ?? {}
      images = fin.url ? [String(fin.url)] : []
      task = `${base}\n${datosVerificados}\n\n## La pieza\n${pieza(c.art('pieza_post'))}\n\n## Chequeos duros ya hechos por el código (abiertos)\n${seccionDeFichas(c.estado.fichas.filter((f) => f.origen === 'chequeo' && f.estado === 'abierta'))}\n\n## Tu trabajo\nRevisas UNA vez los errores de fondo contra el manual, el plan y el brief. La imagen también es parte de la pieza. No reescribes: señalas y propones.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    case 'corrige':
    case 'decide': {
      esquema = 'resolucion.v1'
      task = `${base}\n## La pieza actual\n${pieza(c.art('pieza_post'))}\n\n## ${clave === 'corrige' ? 'Hallazgos que te tocan (del jefe de marketing)' : 'Opinión libre del revisor externo (no es una lista de errores ni una orden: es una mirada distinta a la tuya)'}\n${seccionDeFichas(extra?.fichas ?? [])}\n\n## Tu trabajo\nResponde ítem por ítem: «tomada» (y corriges la pieza) o «no_tomada» con una línea de razón. Tú decides qué tomas y qué no. Si cambias algo, devuelve la pieza completa nueva en \`pieza\`. No hay otra vuelta.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    case 'decide_imagen': {
      esquema = 'resolucion_solo.v1'
      const fin = c.art('imagen_final') ?? {}
      images = fin.url ? [String(fin.url)] : []
      task = `${base}\n## Tu dirección visual\n${String(c.art('visual_direction')?.resumen ?? '')}\n\n## La pieza completa (texto e imagen que ves)\n${pieza(c.art('pieza_post'))}\n\n## Opinión libre del revisor externo sobre ESTA pieza (no es una lista de errores ni una orden: es una mirada distinta a la tuya)\n${seccionDeFichas(extra?.fichas ?? [])}\n\n## Tu trabajo\nResponde sobre TU parte (la imagen y la dirección visual): «tomada» si aceptas que la imagen debería cambiar, o «no_tomada» con una línea de razón. Tú decides. La imagen NO se vuelve a generar en esta ronda: una persona decide si se rehace. No hay otra vuelta.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_EN_TEXTO[esquema]}`
      return finalizar(task)
    }
    default:
      return finalizar(`${base}\n(paso sin plantilla de tarea: ${clave})`)
  }
}

export const FUNCION_DEL_MANUAL = 'lo vigente: identidad, voz y reglas de la marca (es la norma; manda si hay contradicción)'
export const FUNCION_DEL_PLAN = 'aspiración: lo que el cliente quiere lograr; no es un hecho ya cumplido'
export const FUNCION_DEL_BRIEF = 'el encargo concreto de esta pieza'
export const FUNCION_DEL_PORTERO = 'hechos que reunió el portero del cliente (datos, precios, fotos); pueden estar incompletos'
/** el resumen del encargo sale SOLO del brief; lo que el brief no dice no se inventa */
export const resumenDelEncargo = (b: ContextoDePedido['brief']): ResumenDelEncargo => ({ red: b.red, formato: b.formato, que_es: b.que_es, objetivo: b.mensaje, llamado: b.llamado })

/** lo que el revisor externo recibe de la sala 1: la pieza, su imagen y el cerebro del cliente que lee la sala (manual, plan, brief, lo del portero). Nada del hilo ni de las fichas: esta función no los recibe. */
export function contextoDelRevisor(c: ContextoDePedido): { pieza: string; imagenes: string[]; contexto: ContextoDelRevisor[]; encargo: ResumenDelEncargo } {
  const fin = c.art('imagen_final') ?? {}
  return {
    pieza: pieza(c.art('pieza_post')),
    encargo: resumenDelEncargo(c.brief),
    imagenes: fin.url ? [String(fin.url)] : [],
    contexto: [
      { titulo: 'Manual de marca del cliente', funcion: FUNCION_DEL_MANUAL, texto: recortaManual(c.fuentes.manual_texto) },
      { titulo: 'Plan de trabajo del cliente', funcion: FUNCION_DEL_PLAN, texto: c.fuentes.plan_texto ? recortaManual(c.fuentes.plan_texto) : '' },
      { titulo: 'El brief de este entregable', funcion: FUNCION_DEL_BRIEF, texto: c.brief.texto },
      { titulo: 'Lo que reunió el portero', funcion: FUNCION_DEL_PORTERO, texto: String(c.art('material_portero')?.texto ?? '') },
    ],
  }
}
const recortaManual = (t: string) => recorta(t, 12000)
