/**
 * Validación de una PLANTILLA de sala (dato) contra el vocabulario cerrado del motor. Una plantilla con un tipo de paso, una condición, una función, un validador o un
 * esquema fuera de las listas NO SE PUEDE ACTIVAR (la siembra y la prueba la rechazan). Pura.
 */
import { TIPOS_DE_CONDICION, TIPOS_DE_PASO, type Condicion, type Plantilla } from './tipos'

/** funciones de código registradas (lista CERRADA; se amplía con cada sala, por PR) */
export const FUNCIONES_REGISTRADAS = [
  'abrir', 'elegir_foto', 'chequear_prompts', 'imagen', 'elegir_version', 'acabado_imagen', 'chequeos', 'empaquetar_entrega', 'cierre',
  // piezas de varias láminas: varias imágenes por pieza (una por «ref»), láminas armadas y dibujadas por código
  'abrir_laminas', 'asignar_fotos', 'chequear_prompts_ref', 'imagen_ref', 'elegir_version_ref', 'armar_laminas', 'render_laminas', 'chequeos_laminas', 'empaquetar_entrega_laminas',
] as const
/** funciones de código que SÍ gastan (un proveedor de imágenes, no un modelo de texto): su tope puede ser mayor que 0 */
export const FUNCIONES_CON_GASTO = ['imagen', 'imagen_ref'] as const
/** validadores de código sobre la salida de un agente */
export const VALIDADORES_REGISTRADOS = ['citas_existen', 'chequear_prompts', 'decide_imagen', 'texto_laminas_en_copy', 'contrato_de_lamina', 'sin_texto_en_estructura', 'refs_validos'] as const
/** esquemas de salida registrados (ver salida.ts) */
export const ESQUEMAS_REGISTRADOS = [
  'visual_direction.v1', 'prompts.v1', 'observacion_imagen.v1', 'pieza_post.v1', 'fichas.v1', 'resolucion.v1',
  'direccion_imagenes.v1', 'prompts_por_ref.v1', 'observacion_imagenes.v1', 'opinion_libre.v1', 'copy_base.v1', 'laminas.v1', 'estructura.v1', 'copy_kit.v1',
  'resolucion_copy_base.v1', 'resolucion_laminas.v1', 'resolucion_copy_kit.v1', 'resolucion_estructura.v1', 'resolucion_solo.v1',
] as const
/** quién puede hacer cumplir una regla de indicación */
export const APLICADORES_DE_CODIGO = [
  'salida', 'chequeos', 'chequear_prompts', 'decide_imagen', 'citas_existen', 'motor',
  'texto_laminas_en_copy', 'contrato_de_lamina', 'sin_texto_en_estructura', 'refs_validos', 'chequeos_laminas',
] as const
/** `quien` que no es un agente concreto: lo resuelve la sala por la ficha (dueño del `donde`) */
export const QUIEN_DINAMICO = 'dueno_del_donde'

const MAX_PASOS = 40
const en = (lista: readonly string[], v: string) => lista.includes(v)

function erroresDeCondicion(c: Condicion | undefined, donde: string, artefactos: Set<string>): string[] {
  if (!c || typeof c !== 'object') return [`${donde}: falta la condición`]
  if (!en(TIPOS_DE_CONDICION, c.tipo)) return [`${donde}: condición «${(c as { tipo?: string }).tipo}» fuera del vocabulario`]
  const e: string[] = []
  if (c.tipo === 'si_artefacto') {
    if (!c.artefacto || !c.campo) e.push(`${donde}: si_artefacto pide artefacto y campo`)
    else if (!artefactos.has(c.artefacto)) e.push(`${donde}: el artefacto «${c.artefacto}» no lo produce ningún paso`)
  }
  if (c.tipo === 'si_cambio') {
    const lista = Array.isArray(c.artefacto) ? c.artefacto : c.artefacto ? [c.artefacto] : []
    if (!lista.length) e.push(`${donde}: si_cambio pide artefacto`)
    for (const n of lista) if (!artefactos.has(n)) e.push(`${donde}: el artefacto «${n}» no lo produce ningún paso`)
  }
  if (c.tipo === 'cualquiera') {
    if (!Array.isArray(c.de) || c.de.length < 2) e.push(`${donde}: cualquiera pide al menos dos condiciones`)
    else c.de.forEach((x, i) => e.push(...erroresDeCondicion(x, `${donde} (cualquiera #${i + 1})`, artefactos)))
  }
  return e
}

export function validarPlantilla(p: Plantilla): string[] {
  const e: string[] = []
  if (!p || typeof p !== 'object') return ['la plantilla no es un objeto']
  if (!p.tipo || !p.familia) e.push('faltan `tipo` o `familia`')
  if (!Array.isArray(p.pasos) || p.pasos.length === 0) return [...e, 'la plantilla no tiene pasos']
  if (p.pasos.length > MAX_PASOS) e.push(`más de ${MAX_PASOS} pasos`)
  const claves = p.pasos.map((x) => x.clave)
  if (new Set(claves).size !== claves.length) e.push('hay claves de paso repetidas')
  const artefactos = new Set(p.pasos.map((x) => x.salida_artefacto).filter(Boolean))
  const lim = p.limites
  if (!lim || !(lim.tope_encargo_usd > 0)) e.push('`limites.tope_encargo_usd` debe ser mayor que 0')
  if (!lim || ![1, 2].includes(lim.max_rondas)) e.push('`limites.max_rondas` debe ser 1 o 2')

  let sumaVueltas = 0
  const rangos: Array<{ de: number; a: number; clave: string }> = []
  p.pasos.forEach((s, i) => {
    const d = `paso «${s.clave}»`
    if (!s.clave || !/^[a-z][a-z0-9_]*$/.test(s.clave)) e.push(`${d}: clave inválida (minúsculas, dígitos y _)`)
    if (!en(TIPOS_DE_PASO, s.tipo)) e.push(`${d}: tipo «${s.tipo}» fuera del vocabulario`)
    if (!(typeof s.tope_usd === 'number' && s.tope_usd >= 0)) e.push(`${d}: tope_usd inválido`)
    if (s.tipo === 'codigo') {
      if (!s.funcion || !en(FUNCIONES_REGISTRADAS, s.funcion)) e.push(`${d}: función «${s.funcion}» no registrada`)
      if (s.tope_usd !== 0 && !en(FUNCIONES_CON_GASTO, s.funcion ?? '')) e.push(`${d}: un paso de código no tiene modelo, su tope debe ser 0`)
    } else if (s.funcion) e.push(`${d}: solo los pasos de código llevan función`)
    if (s.tipo === 'brazo') e.push(`${d}: el tipo «brazo» está reservado y esta plantilla no lo usa`)
    e.push(...erroresDeCondicion(s.condicion, d, artefactos))
    if (s.salida) {
      if (s.tipo !== 'agente' && s.tipo !== 'externo') e.push(`${d}: solo agentes y revisor externo llevan contrato de salida`)
      if (!en(ESQUEMAS_REGISTRADOS, s.salida.esquema)) e.push(`${d}: esquema «${s.salida.esquema}» no registrado`)
      if (![0, 1].includes(s.salida.reintento_formato)) e.push(`${d}: reintento_formato debe ser 0 o 1`)
    } else if (s.tipo === 'agente' || s.tipo === 'externo') e.push(`${d}: todo paso de agente lleva contrato de salida (el formato lo hace cumplir el código)`)
    for (const v of s.valida ?? []) if (!en(VALIDADORES_REGISTRADOS, v)) e.push(`${d}: validador «${v}» no registrado`)
    if (s.ronda !== undefined && (![1, 2].includes(s.ronda) || (lim && s.ronda > lim.max_rondas))) e.push(`${d}: ronda fuera de rango`)
    if (s.vuelve_a) {
      const v = s.vuelve_a
      const t = p.pasos.findIndex((x) => x.clave === v.paso)
      if (t < 0) e.push(`${d}: vuelve_a apunta a «${v.paso}», que no existe`)
      else if (t > i) e.push(`${d}: vuelve_a solo puede volver hacia atrás (o a sí mismo)`)
      else rangos.push({ de: t, a: i, clave: s.clave })
      if (!Number.isInteger(v.max) || v.max < 1 || v.max > 3) e.push(`${d}: vuelve_a.max debe ser 1, 2 o 3`)
      else sumaVueltas += v.max
      e.push(...erroresDeCondicion(v.si, `${d} (vuelve_a.si)`, artefactos))
    }
  })
  // una vuelta no contiene otra, ni cruza una ronda de crítica
  for (let a = 0; a < rangos.length; a++) {
    for (let b = a + 1; b < rangos.length; b++) {
      if (rangos[a].de <= rangos[b].a && rangos[b].de <= rangos[a].a) e.push(`las vueltas de «${rangos[a].clave}» y «${rangos[b].clave}» se solapan o se anidan`)
    }
    for (let k = rangos[a].de; k <= rangos[a].a; k++) {
      if (p.pasos[k]?.ronda !== undefined) e.push(`la vuelta de «${rangos[a].clave}» cruza el paso de crítica «${p.pasos[k].clave}»`)
    }
  }
  if (lim && lim.margen < 3 + sumaVueltas) e.push(`limites.margen (${lim.margen}) debe ser al menos 3 + la suma de las vueltas (${3 + sumaVueltas})`)

  // indicaciones: cada regla con su aplicador
  const agentes = new Set(p.pasos.filter((x) => x.tipo === 'agente' && x.quien !== QUIEN_DINAMICO).map((x) => x.quien))
  for (const a of agentes) if (!p.indicaciones?.[a]?.length) e.push(`el agente «${a}» no tiene indicación`)
  for (const [agente, reglas] of Object.entries(p.indicaciones ?? {})) {
    for (const r of reglas) {
      if (!r.regla?.trim()) e.push(`indicación de «${agente}»: regla vacía`)
      const ok = r.aplica === 'jefe' || r.aplica === 'gpt' || r.aplica === 'guia' || (r.aplica.startsWith('codigo:') && en(APLICADORES_DE_CODIGO, r.aplica.slice(7)))
      if (!ok) e.push(`indicación de «${agente}»: la regla «${r.regla.slice(0, 40)}…» no tiene un aplicador válido («${r.aplica}»)`)
    }
  }
  return e
}
