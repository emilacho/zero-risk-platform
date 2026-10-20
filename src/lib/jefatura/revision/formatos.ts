/**
 * EL FORMATO DE LO QUE DEVUELVEN LOS EMPLEADOS DE LA JEFATURA (diseño v4 §13.5 condición 1) · «ninguna regla se confía al modelo»: lo hace cumplir el CÓDIGO. Puro.
 *  · `fichas.v1`, `resolucion.v1`, `resolucion_solo.v1` y `opinion_libre.v1` son los de la `oficina` (se usan tal cual, vía `revision-comun`);
 *  · NUEVOS: `resolucion_objeto.v1` (estrategia: el objeto entero), `resolucion_parcial.v1` (calendario: filas) y `plan_texto_y_resolucion.v1`.
 * 🔴 EL PLAN NO VA DENTRO DE UN JSON: un markdown de 25–34 mil caracteres dentro de un JSON es justamente el caso frágil ya medido («sin razonamiento el brief cabe en una respuesta, pero el JSON se rompe»),
 * y los esquemas de texto de la oficina topan en 20.000 caracteres. El plan sale como TEXTO PLANO y la resolución en un BLOQUE APARTE, delimitado, al final:
 *
 *     …el plan completo, texto plano…
 *     <<<RESOLUCION>>>
 *     {"respuestas":[{"id":"…","estado":"tomada","razon":"…"}]}
 *     <<<FIN_RESOLUCION>>>
 *
 * En la CORRECCIÓN y en la DECISIÓN el plan va completo SOLO si se tomó algo; si no se tomó nada, solo el bloque (el orquestador exige la coherencia: «tomada» ⇒ texto; texto ⇒ algo tomado). El tope de caracteres es 40.000 (≥ 34.000, el plan más largo medido).
 * Lo que este módulo NO puede probar: que el modelo real respete el formato con un plan real. Eso exige UNA llamada real (≈ US$ 1) que queda «con aviso y dale de Emilio» y NO se corre en la construcción.
 */
import { descartarIgnorados, ESQUEMAS, limpiarSalida, normalizarEnumerados, procesarSalida, validar, type Esq, type ResultadoDeSalida } from '../../revision-comun'

export const MARCA_DE_INICIO_DE_RESOLUCION = '<<<RESOLUCION>>>'
export const MARCA_DE_FIN_DE_RESOLUCION = '<<<FIN_RESOLUCION>>>'
/** tope del texto de un plan (≥ el máximo medido, 33.588 caracteres) */
export const TOPE_DE_CARACTERES_DEL_PLAN = 40_000
/** un «plan» más corto que esto es un resumen o un recorte, no el plan (el medido más corto tiene ≈ 24.800) */
export const MINIMO_DE_CARACTERES_DEL_PLAN = 1_000

const str = (min = 1, max = 4000): Esq => ({ t: 'str', min, max })
const respuestas: Esq = { t: 'arr', max: 12, de: { t: 'obj', req: ['id', 'estado', 'razon'], props: { id: str(1, 80), estado: { t: 'enum', v: ['tomada', 'no_tomada'] }, razon: str(1, 600) } } }

/** esquemas JSON propios de la jefatura (los de la oficina viven en `ESQUEMAS` y no se modifican) */
export const ESQUEMAS_DE_REVISION: Record<string, Esq> = {
  'resolucion_objeto.v1': { t: 'obj', req: ['respuestas'], props: { respuestas, objeto: { t: 'obj', props: {}, extra: true } } },
  'resolucion_parcial.v1': { t: 'obj', req: ['respuestas'], props: { respuestas, filas: { t: 'arr', max: 200, de: { t: 'obj', req: ['fila_id'], props: { fila_id: str(1, 80) }, extra: true } } } },
  /** solo el BLOQUE de resolución del plan (el texto va fuera): interno, nunca se le pide a un agente como esquema */
  'bloque_de_resolucion': { t: 'obj', req: ['respuestas'], props: { respuestas } },
}
export const ESQUEMAS_DE_TEXTO = ['plan_texto_y_resolucion.v1'] as const

// ───────────────────────── los límites de longitud: el agente los RECIBE y, si se pasa en un texto de apoyo, se RECORTA con marca (20-oct · tercera prueba · `razon` > 600 tumbó la revisión del plan)
/**
 * Campos de TEXTO LIBRE de apoyo cuyo recorte no cambia una decisión ni daña un entregable: la razón de una respuesta y el texto de una ficha. NUNCA se recorta un id, un enum ni lo que
 * se guarda como entregable (el plan, el objeto, las filas, la pieza): esos, si se pasan, devuelven la respuesta para rehacerla como siempre.
 */
export const CAMPOS_RECORTABLES: readonly string[] = ['razon', 'que', 'donde', 'contra_que', 'propuesta']
/** una razón corta que cabe holgada bajo el máximo (el agente la recibe como pedido) */
export const RAZON_RECOMENDADA = 400

const marcaDeRecorte = (dichos: number, conservados: number): string => ` […recortado: se escribieron ${dichos} caracteres; se conservan los primeros ${conservados}]`

/**
 * Recorta (con marca visible) los textos de apoyo que pasan su máximo. Devuelve una copia; anota cada recorte en `hechos`. Lo que no es un campo recortable no se toca (el validador lo rechazará).
 * Nunca cambia el sentido de una decisión: `id` y `estado` no se recortan jamás.
 */
export function recortarTextosLargos(esq: Esq, valor: unknown, hechos: string[], ruta = '$'): unknown {
  if (esq.t === 'arr' && Array.isArray(valor)) return valor.map((x, i) => recortarTextosLargos(esq.de, x, hechos, `${ruta}[${i}]`))
  if (esq.t === 'obj' && valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
    const o = valor as Record<string, unknown>
    const salida: Record<string, unknown> = { ...o }
    for (const [k, sub] of Object.entries(esq.props ?? {})) {
      if (!(k in o)) continue
      const v = o[k]
      if (sub.t === 'str' && typeof v === 'string' && sub.max !== undefined && v.length > sub.max && CAMPOS_RECORTABLES.includes(k)) {
        // el largo de la marca depende de los dígitos del corte: se calcula con el máximo (cota superior) y se escribe con el corte real; el total nunca pasa de `max`
        const corte0 = Math.max(0, sub.max - marcaDeRecorte(v.length, sub.max).length)
        // no partir un emoji (par sustituto UTF-16): una mitad suelta la rechaza `jsonb` y se perdería justo la decisión que se quiere salvar (certificación de CC#2)
        const ultimo = corte0 > 0 ? v.charCodeAt(corte0 - 1) : 0
        const corte = ultimo >= 0xd800 && ultimo <= 0xdbff ? corte0 - 1 : corte0
        salida[k] = corte > 0 ? v.slice(0, corte) + marcaDeRecorte(v.length, corte) : v.slice(0, sub.max)
        hechos.push(`recortado ${ruta}.${k}: ${v.length} → ${(salida[k] as string).length} caracteres (máx. ${sub.max})`)
      } else if (sub.t === 'arr' || sub.t === 'obj') salida[k] = recortarTextosLargos(sub, v, hechos, `${ruta}.${k}`)
    }
    return salida
  }
  return valor
}

/** los máximos de un esquema, tal como están escritos en él (nombre del campo → máximo): nada a mano, para que lo dicho al agente no se desalinee del validador */
function maximosDe(esq: Esq, nombre: string, out: Map<string, string>): void {
  if (esq.t === 'str' && esq.max !== undefined) out.set(`${nombre}|c`, `${nombre}: máximo ${esq.max} caracteres`)
  else if (esq.t === 'arr') {
    if (esq.max !== undefined) out.set(`${nombre}|e`, `${nombre}: máximo ${esq.max} elementos`)
    maximosDe(esq.de, esq.de.t === 'str' ? `cada elemento de ${nombre}` : nombre, out)
  } else if (esq.t === 'obj') for (const [k, sub] of Object.entries(esq.props ?? {})) maximosDe(sub, k, out)
}

/**
 * El párrafo de LÍMITES que va en el pedido de cada paso: sale del propio esquema que valida la respuesta (si un máximo cambia, cambia el pedido). Sin esquema conocido, vacío.
 * El plan va en texto plano (entre 1.000 y 40.000 caracteres) y solo su bloque de resolución tiene máximos de campo.
 */
export function limitesDelFormato(esquemaId: string): string {
  const esq = esquemaId === 'plan_texto_y_resolucion.v1' ? ESQUEMAS_DE_REVISION['bloque_de_resolucion'] : (ESQUEMAS_DE_REVISION[esquemaId] ?? ESQUEMAS[esquemaId])
  if (!esq || esq.t === 'str') return ''
  const m = new Map<string, string>()
  maximosDe(esq, 'raíz', m)
  const lista = [...m.values()].filter((x) => !x.startsWith('raíz'))
  if (!lista.length) return ''
  const delPlan = esquemaId === 'plan_texto_y_resolucion.v1' ? ` El texto del plan va entre ${MINIMO_DE_CARACTERES_DEL_PLAN.toLocaleString('es-EC')} y ${TOPE_DE_CARACTERES_DEL_PLAN.toLocaleString('es-EC')} caracteres.` : ''
  return `LÍMITES DEL FORMATO (los hace cumplir el sistema): ${lista.join(' · ')}.${delPlan}${m.has('razon|c') ? ` Escribe cada razón en UNA frase corta (máximo ${RAZON_RECOMENDADA} caracteres).` : ''} Si "razon", "que", "donde", "contra_que" o "propuesta" se pasan de su máximo, el sistema los RECORTA y lo marca; cualquier otro límite roto devuelve tu respuesta para rehacerla.`
}

export const esquemaConocido = (id: string): boolean => id in ESQUEMAS || id in ESQUEMAS_DE_REVISION || (ESQUEMAS_DE_TEXTO as readonly string[]).includes(id)

export type RespuestaDeFichaDeCorreccion = { id: string; estado: 'tomada' | 'no_tomada'; razon: string }

export type TextoYResolucion =
  | { ok: true; texto: string | null; respuestas: RespuestaDeFichaDeCorreccion[]; envoltorio_limpiado: boolean; normalizados: string[] }
  | { ok: false; errores: string[] }

/**
 * Separa el texto plano del plan y su bloque de resolución. `texto` es null cuando no hay texto (solo el bloque: «no tomé nada»).
 * Falla visible (nunca rellena): sin bloque, bloque sin cerrar, JSON roto o texto que no es un plan.
 */
export function separarTextoYResolucion(salida: string, o: { exigirTexto: boolean }): TextoYResolucion {
  if (typeof salida !== 'string' || salida.trim() === '') return { ok: false, errores: ['salida_vacia'] }
  const i = salida.lastIndexOf(MARCA_DE_INICIO_DE_RESOLUCION)
  if (i < 0) return { ok: false, errores: [`falta el bloque ${MARCA_DE_INICIO_DE_RESOLUCION} … ${MARCA_DE_FIN_DE_RESOLUCION} con la resolución por ficha`] }
  const j = salida.indexOf(MARCA_DE_FIN_DE_RESOLUCION, i + MARCA_DE_INICIO_DE_RESOLUCION.length)
  if (j < 0) return { ok: false, errores: [`el bloque de resolución no se cierra con ${MARCA_DE_FIN_DE_RESOLUCION}`] }
  if (salida.slice(j + MARCA_DE_FIN_DE_RESOLUCION.length).trim() !== '') return { ok: false, errores: ['hay texto después del bloque de resolución (el bloque va al final)'] }
  let texto = salida.slice(0, i).trim()
  let envoltorio = false
  // una cerca ``` que envuelva TODO el plan se quita (no cambia el contenido)
  const cerca = /^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/i.exec(texto)
  if (cerca) { texto = cerca[1].trim(); envoltorio = true }
  const bloque = salida.slice(i + MARCA_DE_INICIO_DE_RESOLUCION.length, j)
  const l = limpiarSalida(bloque)
  if (!l.ok) return { ok: false, errores: [`resolución: ${l.error}`] }
  let crudo: unknown
  try { crudo = JSON.parse(l.json) } catch (e) { return { ok: false, errores: [`resolución: json_invalido: ${e instanceof Error ? e.message : String(e)}`] } }
  const esq = ESQUEMAS_DE_REVISION['bloque_de_resolucion']
  const normalizados: string[] = []
  crudo = normalizarEnumerados(esq, descartarIgnorados(esq, crudo), '$', normalizados)
  crudo = recortarTextosLargos(esq, crudo, normalizados) // un texto de apoyo largo se recorta con marca: nunca se pierde una decisión válida por longitud
  const errores = validar(esq, crudo)
  if (errores.length) return { ok: false, errores: errores.map((e) => `resolución ${e}`) }
  if (texto === '') {
    if (o.exigirTexto) return { ok: false, errores: ['falta el plan: la corrección entrega el plan completo antes del bloque de resolución'] }
    return { ok: true, texto: null, respuestas: (crudo as { respuestas: RespuestaDeFichaDeCorreccion[] }).respuestas, envoltorio_limpiado: envoltorio, normalizados }
  }
  if (texto.length < MINIMO_DE_CARACTERES_DEL_PLAN) return { ok: false, errores: [`el texto del plan es demasiado corto (${texto.length} caracteres; mínimo ${MINIMO_DE_CARACTERES_DEL_PLAN}): se entrega el plan COMPLETO, no un resumen`] }
  if (texto.length > TOPE_DE_CARACTERES_DEL_PLAN) return { ok: false, errores: [`el texto del plan pasa el tope (${texto.length} > ${TOPE_DE_CARACTERES_DEL_PLAN} caracteres)`] }
  return { ok: true, texto, respuestas: (crudo as { respuestas: RespuestaDeFichaDeCorreccion[] }).respuestas, envoltorio_limpiado: envoltorio, normalizados }
}

/**
 * Lo mismo que `procesarSalida` de la oficina pero que además conoce los esquemas de la jefatura. `intento` = cuántos intentos de formato ya se hicieron (0 en el primero);
 * UN reintento como máximo con el error literal; si vuelve a fallar: FALLA VISIBLE (nunca se rellena ni se adivina).
 * En el plan el texto es opcional (si no se tomó nada, solo viene el bloque).
 */
export function procesarSalidaDeRevision(texto: string, esquemaId: string, intento: number, reintento_formato: number): ResultadoDeSalida {
  const fallo = (errores: string[]): ResultadoDeSalida =>
    intento < reintento_formato
      ? { ok: false, accion: 'reintentar', mensaje_de_error: `Tu respuesta no cumple el formato. Errores: ${errores.slice(0, 8).join(' · ')}. ${esquemaId === 'plan_texto_y_resolucion.v1' ? `Devuelve el plan en texto plano y, al final, el bloque ${MARCA_DE_INICIO_DE_RESOLUCION} {json} ${MARCA_DE_FIN_DE_RESOLUCION}.` : 'Devuelve solo el JSON del contrato.'}` }
      : { ok: false, accion: 'falla_visible', errores, ficha: { origen: 'chequeo', donde: 'formato', gravedad: 'bloquea', que: `la salida del empleado no cumple el formato «${esquemaId}» tras ${intento + 1} intento(s): ${errores.slice(0, 3).join(' · ')}` } }
  if (esquemaId === 'plan_texto_y_resolucion.v1') {
    const r = separarTextoYResolucion(texto, { exigirTexto: false })
    if (!r.ok) return fallo(r.errores)
    return { ok: true, valor: { respuestas: r.respuestas, ...(r.texto !== null ? { texto_plan: r.texto } : {}) }, descartados: [], envoltorio_limpiado: r.envoltorio_limpiado, ...(r.normalizados.length ? { normalizados: r.normalizados } : {}) }
  }
  const propio = ESQUEMAS_DE_REVISION[esquemaId]
  if (!propio) {
    // los esquemas de la oficina (fichas, resoluciones…): se recortan los textos de apoyo ANTES de que `procesarSalida` los valide (la oficina no cambia: aquí solo se prepara el texto)
    const esqO = ESQUEMAS[esquemaId]
    const lo = esqO && esqO.t !== 'str' ? limpiarSalida(texto) : null
    if (esqO && lo && lo.ok) {
      try {
        const hechosO: string[] = []
        const recortado = recortarTextosLargos(esqO, JSON.parse(lo.json), hechosO)
        if (hechosO.length) {
          const r = procesarSalida(JSON.stringify(recortado), esquemaId, intento, reintento_formato, { normalizar: true })
          return r.ok ? { ...r, envoltorio_limpiado: lo.envoltorio, normalizados: [...(r.normalizados ?? []), ...hechosO] } : r
        }
      } catch { /* JSON roto: lo dice procesarSalida con su mensaje de siempre */ }
    }
    return procesarSalida(texto, esquemaId, intento, reintento_formato, { normalizar: true })
  }
  const l = limpiarSalida(texto)
  if (!l.ok) return fallo([l.error])
  let crudo: unknown
  try { crudo = JSON.parse(l.json) } catch (e) { return fallo([`json_invalido: ${e instanceof Error ? e.message : String(e)}`]) }
  const descartados: string[] = []
  const normalizados: string[] = []
  let limpio = normalizarEnumerados(propio, descartarIgnorados(propio, crudo, '$', descartados), '$', normalizados)
  limpio = recortarTextosLargos(propio, limpio, normalizados)
  const errores = validar(propio, limpio)
  if (errores.length) return fallo(errores)
  return { ok: true, valor: limpio as Record<string, unknown>, descartados, envoltorio_limpiado: l.envoltorio, ...(normalizados.length ? { normalizados } : {}) }
}
