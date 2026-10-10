/**
 * LO QUE SE LE PIDE A CADA EMPLEADO EN LAS SALAS 2 (carrusel) Y 3 (historias y estados) · el texto de la tarea de cada paso, armado por código con referencias a los artefactos.
 * Agnóstico: ninguna frase nombra a un cliente. El formato de la respuesta lo hace cumplir `salida.ts`; aquí solo se explica el contrato en palabras.
 */
import type { ElementoDelKit } from './brief'
import { AVISO_DEL_CEREBRO, describirReglas, type ContextoDePedido } from './pedidos'
import type { ContextoDelRevisor } from './ciego'
import { ROLES_DE_LAMINA, LIMITES_DE_LAMINA } from './salida'
import type { Ficha, Limites } from './tipos'

export interface ContextoLaminas extends ContextoDePedido {
  familia: 'carrusel' | 'kit'
  limites: Limites
  elementos: ElementoDelKit[]
  plataforma: string
  /** refs válidos de una imagen: roles de lámina (carrusel) o elementos del kit */
  refsValidos: string[]
  refsGeneradas: string[]
  /** urls de las láminas dibujadas (PNG) */
  png: string[]
}

const recorta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}\n[… recortado: ${t.length - n} caracteres más en el manual]` : t)
const lista = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (ninguno)')
const arr = (a: unknown): unknown[] => (Array.isArray(a) ? a : [])
const s = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

export const CONTRATOS_LAMINAS: Record<string, string> = {
  'direccion_imagenes.v1': '{"resumen": "…", "paleta": ["…"], "estilo": "…", "imagenes": [{"ref": "<ref de la lista>", "modo": "real|generada|ninguna", "foto_id": "(solo si modo=real)", "motivo": "…"}], "reglas_de_imagen": {"obligatorio": [{"id": "o1", "texto": "…", "claves": ["…"], "cita": "copia LITERAL del brief"}], "prohibido": [{"id": "p1", "texto": "…", "claves": ["…"], "cita": "copia LITERAL del brief"}]}, "necesito": []}',
  'prompts_por_ref.v1': '{"imagenes": [{"ref": "<ref a generar>", "prompts": [{"prompt": "…", "idea_en_una_linea": "…"}, {"prompt": "…", "idea_en_una_linea": "…"}]}]}  (2 o 3 prompts por imagen; no escribas tamaño ni parámetros: los fija la sala)',
  'observacion_imagenes.v1': '{"imagenes": [{"indice": 0, "reglas": [{"id": "o1", "presente": true, "evidencia": "…"}], "texto_en_imagen": ["…"], "marcas": ["…"], "personas": 0, "producto": "…", "elementos_visibles": ["…"]}], "preferencia": [0]}  (presente = true | false | "no_se_ve"; describes, no apruebas)',
  'copy_base.v1': '{"texto_base": "TODO el texto que irá en las láminas, una idea por línea", "pie_de_foto": "…", "hashtags": ["…"], "llamado": "…", "nota_para_quien_publica": "…", "necesito": []}',
  'laminas.v1': `{"laminas": [{"rol": "${ROLES_DE_LAMINA.join('|')}", "eyebrow": "(≤ ${LIMITES_DE_LAMINA.eyebrow})", "headline": "(≤ ${LIMITES_DE_LAMINA.headline})", "body": "(≤ ${LIMITES_DE_LAMINA.body})", "cta": "(≤ ${LIMITES_DE_LAMINA.cta}; en una sola lámina)"}], "necesito": []}`,
  'estructura.v1': '{"elementos": [{"ref": "e01", "rol": "…", "beat": "…", "foto_slot": "<ref de la imagen>", "mood": "…", "sugerencia_interactiva": "(opcional)"}]}  (SIN ningún campo de texto de imagen)',
  'copy_kit.v1': `{"elementos": [{"ref": "e01", "eyebrow": "(≤ ${LIMITES_DE_LAMINA.eyebrow})", "headline": "…", "body": "…", "cta": "…", "acompanamiento": "texto de acompañamiento (pie o texto del estado)", "hashtags": ["…"]}], "necesito": []}`,
  'resolucion_copy_base.v1': '{"respuestas": [{"id": "…", "estado": "tomada|no_tomada", "razon": "…"}], "copia": {"texto_base": "…", "pie_de_foto": "…", "hashtags": ["…"], "llamado": "…", "nota_para_quien_publica": "…"}}  (copia solo si cambias algo; completa)',
  'resolucion_laminas.v1': '{"respuestas": [{"id": "…", "estado": "tomada|no_tomada", "razon": "…"}], "laminas": [{"rol": "…", "headline": "…", "body": "…", "cta": "…"}]}  (laminas solo si cambias algo; la lista completa)',
  'resolucion_copy_kit.v1': '{"respuestas": [{"id": "…", "estado": "tomada|no_tomada", "razon": "…"}], "elementos": [{"ref": "e01", "headline": "…"}]}  (solo los elementos que cambias)',
  'resolucion_estructura.v1': '{"respuestas": [{"id": "…", "estado": "tomada|no_tomada", "razon": "…"}], "elementos": [{"ref": "e01", "rol": "…", "beat": "…", "mood": "…"}]}  (solo los elementos que cambias; sin texto de imagen)',
}

const seccionDeFichas = (fs: Ficha[]) => (fs.length ? fs.map((f) => `- [${f.id}] (${f.gravedad}) en ${f.donde}: ${f.que ?? ''} · contra: ${f.contra_que ?? ''} · propuesta: ${f.propuesta ?? ''}`).join('\n') : '- (ninguna)')

/** la pieza como texto (para el jefe, el revisor ciego y las correcciones) */
export function describirPieza(c: Pick<ContextoDePedido, 'art'> & { familia: 'carrusel' | 'kit'; elementos?: ElementoDelKit[] }): string {
  if (c.familia === 'carrusel') {
    const cp = c.art('copy_carrusel')
    const ls = arr(c.art('laminas')?.laminas) as Array<Record<string, unknown>>
    if (!cp) return '(todavía no hay pieza)'
    return `Texto base:\n${s(cp.texto_base)}\n\nPie de foto:\n${s(cp.pie_de_foto)}\nHashtags: ${arr(cp.hashtags).join(' ')}\nLlamado: ${s(cp.llamado)}\n\nLáminas:\n${ls.length ? ls.map((l, i) => `${i + 1}. [${s(l.rol)}] ${[l.eyebrow, l.headline, l.body, l.cta].filter(Boolean).map(s).join(' · ')}`).join('\n') : '(sin láminas todavía)'}`
  }
  const ck = arr(c.art('copy_kit')?.elementos) as Array<Record<string, unknown>>
  const es = arr(c.art('estructura')?.elementos) as Array<Record<string, unknown>>
  if (!ck.length) return '(todavía no hay pieza)'
  const el = new Map((c.elementos ?? []).map((e) => [e.ref, e] as const))
  return ck.map((x) => {
    const e = el.get(s(x.ref)), est = es.find((y) => y.ref === x.ref)
    return `${s(x.ref)} (${e ? `${e.destino}${e.fecha ? ` · ${e.fecha}${e.hora ? ' ' + e.hora : ''}` : ''}` : 'sin calendario'})${est ? ` [${s(est.rol)} · ${s(est.beat)} · ${s(est.mood)}]` : ''}: ${[x.eyebrow, x.headline, x.body, x.cta].filter(Boolean).map(s).join(' · ')}\n   acompañamiento: ${s(x.acompanamiento)} ${arr(x.hashtags).join(' ')}`
  }).join('\n')
}

/** hasta 3 láminas de muestra: la primera, una intermedia y la última */
export function laminasDeMuestra(png: string[], n = 3): string[] {
  if (png.length <= n) return png
  return [png[0], png[Math.floor(png.length / 2)], png[png.length - 1]].slice(0, n)
}

const describirElementos = (els: ElementoDelKit[]) => els.map((e) => `- ${e.ref}: ${e.destino}${e.fecha ? ` · ${e.fecha}${e.hora ? ' ' + e.hora : ''}` : ' · sin fecha'} · tema «${e.tema}» · pilar «${e.pilar}»${e.datos.length ? ` · datos: ${e.datos.join('; ')}` : ''}`).join('\n')

export function construirTareaLaminas(clave: string, c: ContextoLaminas, extra?: { fichas?: Ficha[]; errorDeFormato?: string }): { task: string; images: string[]; esquema: string } {
  const F = c.fuentes
  const kit = c.familia === 'kit'
  const base = `${AVISO_DEL_CEREBRO}\n\n## Manual de marca del cliente\n${recorta(F.manual_texto, 12000)}\n\n## El brief de este entregable (guía, no regla al pie de la letra)\n${c.brief.texto}\n${c.fuentes.plan_texto ? `\n## Plan de trabajo del cliente (contexto)\n${recorta(c.fuentes.plan_texto, 8000)}\n` : ''}`
  const datosVerificados = `## Datos verificados del cliente (solo estos; no inventes otros)\nTeléfonos: ${F.propios.telefonos.join(', ') || '(no se pudieron leer)'}\nUsuarios: ${F.propios.handles.join(', ') || '(no se pudieron leer)'}\nPrecios de la carta: ${F.fuentes.precios.join(', ') || '(no hay carta guardada)'}`
  const refs = kit ? `Elementos del kit (cada uno es una lámina fija 9:16):\n${describirElementos(c.elementos)}` : `Roles de lámina posibles (el ref de una imagen es un rol): ${ROLES_DE_LAMINA.join(', ')}`
  const pieza = describirPieza(c)
  let esquema = '', images: string[] = []
  const fin = (task: string) => ({ task: extra?.errorDeFormato ? `${task}\n\n## Corrección de formato\n${extra.errorDeFormato}` : task, images, esquema })
  const fichas = seccionDeFichas(extra?.fichas ?? [])
  switch (clave) {
    case 'direccion_visual': {
      esquema = 'direccion_imagenes.v1'
      const cand = (c.art('candidatas_foto')?.candidatas as Array<{ id: string; motivo_de_aceptacion: string; requiere_mirar: boolean }> | undefined) ?? []
      const desc = (c.art('candidatas_foto')?.descartadas as Array<{ id: string }> | undefined) ?? []
      images = cand.slice(0, 3).map((x) => F.fotos.find((f) => f.id === x.id)?.url ?? '').filter(Boolean)
      return fin(`${base}\n## ${refs}\n\n## Fotos reales candidatas del cliente (la sala ya descartó con motivo las que no sirven${kit ? ' y las que repetirían una foto usada hace poco' : ''})\n${cand.length ? cand.map((x) => `- ${x.id}: ${x.motivo_de_aceptacion}${x.requiere_mirar ? ' (etiqueta de confianza media: se mirará)' : ''}`).join('\n') : '- (ninguna sirve para este brief)'}\nDescartadas: ${desc.length} (con motivo escrito).\n\n## Tu trabajo\nEres el director visual del encargo. Para CADA imagen que la pieza necesite decide, con su ref, si se usa una foto real candidata (modo real, con su foto_id), una imagen generada (modo generada) o ninguna (la lámina sale sobre el fondo de la marca). No todas las láminas necesitan imagen; máximo ${c.limites.imagenes_generadas_max ?? 2} imágenes generadas en total. ${kit ? 'Entrega UNA sola dirección visual para toda la semana: paleta, motivo y ritmo. ' : ''}Entrega además las reglas de imagen del brief: qué DEBE verse y qué NO debe verse. Como el brief es texto, cada regla lleva en \`cita\` la copia LITERAL de la frase del brief de la que sale (la sala comprueba que la cita existe; una regla sin cita válida se descarta).\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'narrativa': {
      esquema = 'estructura.v1'
      const vd = c.art('visual_direction') ?? {}
      return fin(`${base}\n## ${refs}\n\n## Dirección visual del curador\n${s(vd.resumen)}\nEstilo: ${s(vd.estilo)}\n\n## Tu trabajo\nPones la ESTRUCTURA narrativa de la semana: para cada elemento, su rol en el arco, el beat, qué imagen va (foto_slot = el ref de la imagen) y el mood. NO escribes ningún texto que aparezca en una imagen ni en un acompañamiento: ese texto lo escribe otro empleado. El arco y el ritmo los deciden el manual y el brief. Solo piezas fijas 9:16.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'prompts': {
      esquema = 'prompts_por_ref.v1'
      const vd = c.art('visual_direction') ?? {}
      return fin(`${base}\n## Dirección visual del curador\n${s(vd.resumen)}\nEstilo: ${s(vd.estilo)}\n\n## Imágenes que hay que GENERAR (ref → para qué)\n${lista(arr(vd.imagenes).filter((i) => c.refsGeneradas.includes(s((i as Record<string, unknown>).ref))).map((i) => `${s((i as Record<string, unknown>).ref)}: ${s((i as Record<string, unknown>).motivo)}`))}\n\n## Reglas de imagen (el código comprobará cada prompt ANTES de generar)\n${describirReglas(c.reglas)}\n\n## Tu trabajo\nPara CADA imagen a generar propones 2 o 3 prompts distintos, en lenguaje natural (sujeto, entorno, luz, cámara, estilo). Cada prompt debe cubrir TODO lo obligatorio y no nombrar nada de lo prohibido sin negarlo. No escribas tamaño, proporción ni parámetros: los fija la sala. No nombres marcas, fotógrafos ni personas reales.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'mirar': {
      esquema = 'observacion_imagenes.v1'
      images = c.imagenesAMirar.map((i) => i.url)
      return fin(`${base}\n## Imágenes que te muestro, en orden\n${c.imagenesAMirar.map((i, k) => `- imagen ${k + 1}: índice ${i.indice}`).join('\n') || '- (ninguna)'}\n\n## Reglas contra las que describes\n${describirReglas(c.reglas)}\n\n## Tu trabajo\nDESCRIBES; no apruebas ni rechazas (decide el código). Para cada imagen y cada regla indica si está presente (true), ausente (false) o no se ve ("no_se_ve"), con la evidencia. Lista además el texto visible, las marcas, cuántas personas y los elementos visibles. En \`preferencia\` ordena los índices de mejor a peor.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'texto': {
      if (kit) {
        esquema = 'copy_kit.v1'
        return fin(`${base}\n${datosVerificados}\n\n## Material del portero\n${s(c.art('material_portero')?.texto) || '(sin texto adicional)'}\n\n## ${refs}\n\n## Estructura de la semana (la puso otro empleado; sin texto)\n${JSON.stringify(c.art('estructura')?.elementos ?? [], null, 0)}\n\n## Tu trabajo\nEres el ÚNICO autor del texto. Para CADA elemento (por su ref) escribes el titular (≤ ${c.limites.headline_historia ?? 60} caracteres), el texto breve (≤ ${c.limites.body_historia ?? 140}), el llamado si hace falta, el acompañamiento (el pie o el texto del estado) y los hashtags. Una historia se lee en segundos. El destino (historia o estado) cambia el acompañamiento, no la imagen. No inventes precios, horarios ni cifras: usa los datos de cada elemento y los verificados.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
      }
      esquema = 'copy_base.v1'
      return fin(`${base}\n${datosVerificados}\n\n## Material del portero\n${s(c.art('material_portero')?.texto) || '(sin texto adicional)'}\n\n## Dirección visual\n${s(c.art('visual_direction')?.resumen)}\n\n## Tu trabajo\nEres el ÚNICO autor del texto del carrusel. Escribes el texto base (TODO lo que irá escrito en las láminas, una idea por línea), el pie de foto y los hashtags en campos aparte. El diseñador recortará las láminas LITERALMENTE de tu texto base: no habrá más texto que el tuyo. El brief manda el mensaje, el protagonista, la sintaxis y el llamado a la acción. Entre ${c.limites.laminas_min ?? 5} y ${c.limites.laminas_max ?? 10} ideas.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'laminas': {
      esquema = 'laminas.v1'
      return fin(`${base}\n## Texto del autor (de aquí recortas; no escribes texto nuevo)\n${pieza}\n\n## Imágenes ya decididas por rol\n${JSON.stringify(Object.keys((c.art('imagenes_elegidas')?.por_ref ?? {}) as object))}\n\n## Tu trabajo\nArmas UNA plataforma (${c.plataforma}; el tamaño lo pone la sala) con entre ${c.limites.laminas_min ?? 5} y ${c.limites.laminas_max ?? 10} láminas. Cada titular, texto o llamado de una lámina debe ser un trozo EXACTO del texto del autor. Un solo llamado a la acción, en una sola lámina. Los roles posibles: ${ROLES_DE_LAMINA.join(', ')}. Lo que no puedas resolver va en \`necesito\`; no preguntas al cliente.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'revision_jefe': {
      esquema = 'fichas.v1'
      images = laminasDeMuestra(c.png)
      const donde = kit ? 'texto|hashtags|estructura|imagen' : 'texto|hashtags|laminas|imagen'
      return fin(`${base}\n${datosVerificados}\n\n## La pieza\n${pieza}\n\n## Chequeos duros ya hechos por el código (abiertos)\n${seccionDeFichas(c.estado.fichas.filter((f) => f.origen === 'chequeo' && f.estado === 'abierta'))}\n\n## Tu trabajo\nRevisas UNA vez los errores de fondo contra el manual, el plan y el brief, mirando también las láminas dibujadas. Para cada hallazgo, \`donde\` debe ser uno de: ${donde}. No reescribes: señalas y propones.\n\n## Formato de tu respuesta\nSolo este JSON:\n${'{"fichas": [{"que": "…", "donde": "' + donde + '", "contra_que": "…", "gravedad": "bloquea|sugerencia", "propuesta": "…"}]}'}`)
    }
    case 'corrige_texto':
    case 'decide_texto': {
      esquema = kit ? 'resolucion_copy_kit.v1' : 'resolucion_copy_base.v1'
      return fin(`${base}\n## La pieza actual\n${pieza}\n\n## ${clave === 'corrige_texto' ? 'Hallazgos que te tocan (del jefe de marketing)' : 'Opinión libre del revisor externo (no es una lista de errores ni una orden: es una mirada distinta a la tuya)'}\n${fichas}\n\n## Tu trabajo\nResponde ítem por ítem: «tomada» (y corriges el texto) o «no_tomada» con una línea de razón. Tú decides qué tomas y qué no. ${kit ? 'Si cambias algo, devuelve en `elementos` solo los elementos que cambian (por su ref), completos.' : 'Si cambias algo, devuelve la `copia` completa nueva (el diseñador volverá a recortar las láminas de tu texto).'} No hay otra vuelta.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'ajusta_laminas':
    case 'ajusta_laminas_2':
    case 'corrige_laminas':
    case 'decide_laminas': {
      esquema = 'resolucion_laminas.v1'
      return fin(`${base}\n## Texto del autor (la versión vigente; de aquí recortas)\n${pieza}\n\n## Hallazgos de láminas que te tocan\n${fichas}\n\n## Tu trabajo\n${clave.startsWith('ajusta') ? 'El autor cambió su texto: vuelve a recortar las láminas de ESTE texto (cada titular, texto o llamado debe ser un trozo exacto) y atiende de paso los hallazgos de arriba. Devuelve la lista completa en `laminas`.' : 'Responde ítem por ítem: «tomada» (y corriges las láminas) o «no_tomada» con una línea de razón. No escribes texto nuevo: recortas del texto del autor.'} Un solo llamado a la acción. No hay otra vuelta.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    case 'corrige_estructura':
    case 'decide_estructura': {
      esquema = 'resolucion_estructura.v1'
      return fin(`${base}\n## La estructura actual y el texto\n${pieza}\n\n## Hallazgos de estructura que te tocan\n${fichas}\n\n## Tu trabajo\nResponde ítem por ítem: «tomada» (y corriges la estructura) o «no_tomada» con una línea de razón. Devuelve en \`elementos\` solo los elementos que cambias, SIN ningún texto de imagen. No hay otra vuelta.\n\n## Formato de tu respuesta\nSolo este JSON:\n${CONTRATOS_LAMINAS[esquema]}`)
    }
    default:
      return fin(`${base}\n(paso sin plantilla de tarea: ${clave})`)
  }
}

/** lo que el revisor externo recibe de una pieza de láminas: la pieza, hasta 4 láminas dibujadas y el cerebro del cliente que lee la sala. Nada del hilo ni de las fichas: esta función no los recibe. */
export function contextoDelRevisorLaminas(c: ContextoLaminas): { pieza: string; imagenes: string[]; contexto: ContextoDelRevisor[] } {
  return {
    pieza: describirPieza(c),
    imagenes: laminasDeMuestra(c.png, 4),
    contexto: [
      { titulo: 'Manual de marca del cliente', texto: recorta(c.fuentes.manual_texto, 12000) },
      { titulo: 'Plan de trabajo del cliente', texto: c.fuentes.plan_texto ? recorta(c.fuentes.plan_texto, 12000) : '' },
      { titulo: 'El brief de este entregable', texto: c.brief.texto },
      { titulo: 'Lo que reunió el portero', texto: s(c.art('material_portero')?.texto) },
    ],
  }
}
