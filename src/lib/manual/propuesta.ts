/**
 * LO QUE FALTA, LO PROPONEN LOS AGENTES (ronda 75 · punto 3 del encargo de fuentes públicas). PURO, sin base y sin modelo.
 * Un campo del manual que quedó vacío (o «PENDIENTE») no se deja así ni se rellena como si fuera un hecho: un agente lo PROPONE, y la propuesta lleva siempre el rótulo
 * «propuesta del agente — <razón>» (como el eslogan). Solo se llena lo que está vacío: nunca se pisa lo que ya tiene contenido, y el resto del manual queda letra por letra igual.
 * El que lo ejecuta es un flujo de n8n (los agentes solo se invocan por flujos): `preparar` arma los pedidos, el flujo llama al agente, `aplicar` lee la respuesta y fusiona.
 */
import { evaluarHechos, type InformeDeHechos } from './hechos'
import type { Fuente } from './procedencia'
import { ordenarMateria } from './materia'

export const ROTULO_DE_PROPUESTA = 'propuesta del agente'
export type TipoDeCampo = 'texto' | 'lista'
export interface CampoProponible { tipo: TipoDeCampo; agente: string; que: string }

/** los campos que se pueden proponer (lista cerrada) · el agente es el que ya es dueño de ese campo en el cimiento */
export const CAMPOS_PROPONIBLES: Record<string, CampoProponible> = {
  mision: { tipo: 'texto', agente: 'jefe-client-success', que: 'qué hace el negocio y para quién · 1-2 frases, solo con lo que la evidencia sostiene' },
  proposito: { tipo: 'texto', agente: 'jefe-client-success', que: 'el «por qué» del negocio · aspiracional · 1 frase, sin inventar hechos' },
  positioning: { tipo: 'texto', agente: 'brand-strategist', que: 'cómo se posiciona frente a su alternativa más cercana · solo desde la evidencia' },
  voice_description: { tipo: 'texto', agente: 'editor-en-jefe', que: 'cómo suena la marca, observado en sus propios textos' },
  customer_angle: { tipo: 'texto', agente: 'jefe-client-success', que: 'el recorrido del cliente con el negocio' },
  retention_notes: { tipo: 'texto', agente: 'jefe-client-success', que: 'cómo se fideliza a quien ya compró' },
  personalidad: { tipo: 'lista', agente: 'editor-en-jefe', que: '3 a 6 rasgos de la voz observada en la evidencia' },
  tagline_opciones: { tipo: 'lista', agente: 'editor-en-jefe', que: '2 o 3 lemas posibles · es una elección, no un hecho' },
  mensajes_clave: { tipo: 'lista', agente: 'editor-en-jefe', que: '3 a 5 mensajes desde lo que le importa al cliente' },
  propuestas_de_valor: { tipo: 'lista', agente: 'jefe-client-success', que: '3 a 5 diferenciadores reales respecto de la alternativa' },
}

const vacio = (v: unknown): boolean => {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === '' || /^PENDIENTE\b/i.test(v.trim())
  if (Array.isArray(v)) return v.length === 0 || v.every(vacio)
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

/** los campos proponibles que están vacíos (o PENDIENTE) en el borrador */
export function camposFaltantes(draft: Record<string, unknown>): string[] {
  return Object.keys(CAMPOS_PROPONIBLES).filter((c) => vacio(draft[c]))
}

export interface Pedido { agente: string; campos: string[]; task: string }

const TOPE_DEL_PEDIDO = 14_000
const resumenDelManual = (draft: Record<string, unknown>, excluir: string[]): string => {
  const partes: string[] = []
  for (const k of ['positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes', 'proposito', 'mision', 'personalidad', 'mensajes_clave', 'propuestas_de_valor', 'tagline_opciones']) {
    if (excluir.includes(k) || vacio(draft[k])) continue
    const t = typeof draft[k] === 'string' ? (draft[k] as string) : JSON.stringify(draft[k])
    partes.push(`- ${k}: ${t.length > 420 ? t.slice(0, 420) + ' ⟨…⟩' : t}`)
  }
  return partes.join('\n')
}

/** un pedido por agente; la evidencia es la materia del cliente ordenada por código (cede antes que las instrucciones) */
export function armarPedidos(entrada: { draft: Record<string, unknown>; fuentes: Fuente[]; campos?: string[]; cliente?: string; /** lo que el DUEÑO corrigió o declaró (una línea por dato): manda sobre todo lo inferido */ delDueno?: string[]; /** campos cuya propuesta ANTERIOR (rotulada «propuesta del agente») se vuelve a proponer porque el dueño la corrigió: solo vale si el campo hoy es una propuesta, nunca un texto del cliente */ reproponer?: string[] }): { pedidos: Pedido[]; faltantes: string[]; rechazados: Array<{ campo: string; motivo: string }> } {
  const faltantes = camposFaltantes(entrada.draft)
  const reproponibles = (entrada.reproponer ?? []).filter((c) => CAMPOS_PROPONIBLES[c] && tieneRotulo(entrada.draft[c]))
  const rechazados: Array<{ campo: string; motivo: string }> = []
  const pedidos0 = (entrada.campos?.length ? entrada.campos : faltantes)
  const aProponer: string[] = []
  for (const c of pedidos0) {
    if (!CAMPOS_PROPONIBLES[c]) { rechazados.push({ campo: c, motivo: 'campo que no se propone (no está en la lista cerrada)' }); continue }
    if (!faltantes.includes(c) && !reproponibles.includes(c)) { rechazados.push({ campo: c, motivo: 'ya tiene contenido: una propuesta nunca lo pisa (solo una propuesta anterior del agente se puede volver a proponer, si se pide expresamente)' }); continue }
    aProponer.push(c)
  }
  const porAgente = new Map<string, string[]>()
  for (const c of aProponer) porAgente.set(CAMPOS_PROPONIBLES[c].agente, [...(porAgente.get(CAMPOS_PROPONIBLES[c].agente) ?? []), c])
  // la evidencia NUEVA (lo que dicen los clientes, lo que se dice en los videos, las publicaciones) tiene su cupo propio: si no, la evidencia de siempre (el sitio) se la come entera
  const esResena = (f: Fuente) => f.canal === 'resenas'
  const esVideo = (f: Fuente) => /videos \(lo que se dice\)/.test(f.rotulo)
  const esPublicacion = (f: Fuente) => f.canal === 'facebook' && /publicaciones/.test(f.rotulo)
  const bloque = (titulo: string, fs: Fuente[], tope: number): string => {
    if (!fs.length) return ''
    const t = fs.map((f) => `(${f.rotulo})\n${f.texto}`).join('\n\n')
    return `### ${titulo}\n${t.length > tope ? t.slice(0, tope) + '\n⟨recortado: había más⟩' : t}\n\n`
  }
  const nuevas = bloque('Lo que dicen los clientes (reseñas públicas)', entrada.fuentes.filter(esResena), 2500) + bloque('Lo que se dice en sus videos', entrada.fuentes.filter(esVideo), 3000) + bloque('Sus publicaciones', entrada.fuentes.filter(esPublicacion), 1200)
  const materia = ordenarMateria(entrada.fuentes.filter((f) => !esResena(f) && !esVideo(f) && !esPublicacion(f)))
  const pedidos: Pedido[] = []
  for (const [agente, campos] of porAgente) {
    const instr = [
      `Completa SOLO estos campos del manual de marca${entrada.cliente ? ' de ' + entrada.cliente : ''}, que quedaron vacíos: ${campos.map((c) => `«${c}»`).join(', ')}.`,
      ...campos.map((c) => `- ${c} (${CAMPOS_PROPONIBLES[c].tipo === 'lista' ? 'lista' : 'texto'}): ${CAMPOS_PROPONIBLES[c].que}.`),
      'Es una PROPUESTA tuya, no un hecho: no escribas cifras, lugares, premios, certificaciones, citas ni comparaciones que la evidencia no sostenga. Si la evidencia no alcanza para un campo, devuélvelo con "texto": "" y explica en "razon" qué falta.',
      'Escribe en el mismo idioma y registro (tuteo, voseo o usted) que el resto del manual. Nada de paréntesis ni corchetes con fuentes dentro del texto.',
      'Responde SOLO un objeto JSON, sin texto antes ni después: {"<campo>": {"texto": "…", "razon": "por qué lo propones, en una frase"}} para los de texto, y {"<campo>": {"items": ["…","…"], "razon": "…"}} para los de lista.',
    ].join('\n')
    const manual = resumenDelManual(entrada.draft, campos)
    // lo que dijo el dueño va PRIMERO y completo (es corto y manda): si el manual o la evidencia lo contradicen, gana el dueño
    const dueno = (entrada.delDueno ?? []).filter((x) => x && x.trim())
    const previas = campos.filter((c) => reproponibles.includes(c)).map((c) => `- ${c}: ${typeof entrada.draft[c] === 'string' ? entrada.draft[c] : JSON.stringify(entrada.draft[c])}`)
    const bloquePrevio = previas.length ? `PROPUESTA ANTERIOR QUE SE DESCARTA (el dueño la corrigió; reescríbela de cero con lo que dijo el dueño, sin repetir lo que lo contradiga):\n${previas.join('\n')}\n\n` : ''
    const bloqueDueno = dueno.length ? `LO QUE DIJO EL DUEÑO (corrección o dato declarado por él: MANDA sobre el manual y sobre cualquier cosa inferida del sitio, las redes o los mapas; si algo los contradice, gana el dueño):\n${dueno.map((x) => '- ' + x).join('\n')}\n\n` : ''
    const fijo = instr.length + bloqueDueno.length + bloquePrevio.length + manual.length + 80
    const evid = (nuevas + materia.texto).slice(0, Math.max(0, TOPE_DEL_PEDIDO - fijo))
    pedidos.push({ agente, campos, task: `${instr}\n\n${bloqueDueno}${bloquePrevio}EL MANUAL HASTA AHORA:\n${manual || '(vacío)'}\n\nEVIDENCIA DEL CLIENTE:\n${evid}`.slice(0, TOPE_DEL_PEDIDO) })
  }
  return { pedidos, faltantes, rechazados }
}

export interface Propuesta { campo: string; valor: string | string[]; razon: string }

/** lector tolerante: busca el primer objeto JSON equilibrado de la respuesta; lo que no se pueda leer NO se inventa */
export function leerRespuesta(texto: unknown, campos: string[]): { propuestas: Propuesta[]; sin_leer: Array<{ campo: string; motivo: string }> } {
  const t = typeof texto === 'string' ? texto : ''
  let obj: Record<string, unknown> | null = null
  const ini = t.indexOf('{')
  if (ini >= 0) {
    for (let fin = t.lastIndexOf('}'); fin > ini; fin = t.lastIndexOf('}', fin - 1)) {
      try { const p = JSON.parse(t.slice(ini, fin + 1)); if (p && typeof p === 'object' && !Array.isArray(p)) { obj = p as Record<string, unknown>; break } } catch { /* probar con un cierre anterior */ }
    }
  }
  const propuestas: Propuesta[] = []
  const sin_leer: Array<{ campo: string; motivo: string }> = []
  for (const c of campos) {
    const e = obj?.[c]
    if (!e || typeof e !== 'object') { sin_leer.push({ campo: c, motivo: obj ? 'el agente no devolvió ese campo' : 'la respuesta no trae un objeto JSON legible' }); continue }
    const o = e as Record<string, unknown>
    const razon = typeof o.razon === 'string' ? o.razon.replace(/\s+/g, ' ').trim() : ''
    if (CAMPOS_PROPONIBLES[c].tipo === 'lista') {
      const items = (Array.isArray(o.items) ? o.items : []).filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
      if (!items.length) sin_leer.push({ campo: c, motivo: razon ? `sin propuesta: ${razon}` : 'sin elementos' })
      else propuestas.push({ campo: c, valor: items, razon })
    } else {
      const texto = typeof o.texto === 'string' ? o.texto.replace(/\s+/g, ' ').trim() : ''
      if (!texto) sin_leer.push({ campo: c, motivo: razon ? `sin propuesta: ${razon}` : 'texto vacío' })
      else propuestas.push({ campo: c, valor: texto, razon })
    }
  }
  return { propuestas, sin_leer }
}

const sinCorchetes = (s: string) => s.replace(/[[\]]/g, '')
const rotular = (valor: string, razon: string): string => `${valor.trim()} [${ROTULO_DE_PROPUESTA}${razon ? ' — ' + sinCorchetes(razon) : ''}]`

export interface ResultadoDeFusion {
  draft: Record<string, unknown>
  aplicadas: string[]
  rechazadas: Array<{ campo: string; motivo: string }>
  /** los campos cuyo contenido cambió entre el borrador de antes y el de ahora (debe ser EXACTAMENTE `aplicadas`) */
  campos_distintos: string[]
  hechos_sin_respaldo: InformeDeHechos['sin_respaldo']
}

const tieneRotulo = (v: unknown): boolean => (Array.isArray(v) ? v.some(tieneRotulo) : typeof v === 'string' && new RegExp(`\\[${ROTULO_DE_PROPUESTA}`, 'i').test(v))

/**
 * Fusiona las propuestas en una COPIA del borrador. Solo llena campos vacíos; cada texto va con su rótulo; la propuesta pasa por el chequeo de hechos (si trae una afirmación
 * de hecho sin respaldo, NO se aplica: una propuesta no es la puerta trasera para colar un hecho). Los demás campos quedan letra por letra iguales.
 */
export function fusionarPropuestas(draft: Record<string, unknown>, propuestas: Propuesta[], fuentes: Fuente[], opciones: { reproponer?: string[] } = {}): ResultadoDeFusion {
  const nuevo: Record<string, unknown> = JSON.parse(JSON.stringify(draft))
  const aplicadas: string[] = []
  const rechazadas: Array<{ campo: string; motivo: string }> = []
  let hechos_sin_respaldo: InformeDeHechos['sin_respaldo'] = []
  for (const p of propuestas) {
    const def = CAMPOS_PROPONIBLES[p.campo]
    if (!def) { rechazadas.push({ campo: p.campo, motivo: 'campo que no se propone' }); continue }
    const reemplazaPropuesta = (opciones.reproponer ?? []).includes(p.campo) && tieneRotulo(draft[p.campo])
    if (!vacio(draft[p.campo]) && !reemplazaPropuesta) { rechazadas.push({ campo: p.campo, motivo: 'ya tiene contenido: una propuesta nunca lo pisa' }); continue }
    // el chequeo de hechos mira el TEXTO propuesto (sin el rótulo): una cifra, un lugar de origen, una cita o una palabra de certeza sin fuente lo frenan
    const lista = Array.isArray(p.valor) ? p.valor : [p.valor]
    const informe = evaluarHechos({ manual: { [p.campo]: Array.isArray(p.valor) ? p.valor : p.valor }, fuentes, excluir: [] })
    if (informe.sin_respaldo.length) { hechos_sin_respaldo = hechos_sin_respaldo.concat(informe.sin_respaldo); rechazadas.push({ campo: p.campo, motivo: `la propuesta afirma ${informe.sin_respaldo.length} hecho(s) sin respaldo: ${informe.sin_respaldo.slice(0, 2).map((h) => '«' + h.clausula.slice(0, 80) + '»').join(' · ')}` }); continue }
    nuevo[p.campo] = def.tipo === 'lista' ? lista.map((x) => rotular(x, p.razon)) : rotular(String(p.valor), p.razon)
    aplicadas.push(p.campo)
    const meta = (nuevo._field_meta && typeof nuevo._field_meta === 'object' ? nuevo._field_meta : {}) as Record<string, unknown>
    meta[p.campo] = { estado: 'propuesta_del_agente', fuente: ROTULO_DE_PROPUESTA, razon: p.razon || null }
    nuevo._field_meta = meta
  }
  if (aplicadas.length) {
    for (const k of ['campos_provisionales', 'campos_ausentes']) if (Array.isArray(nuevo[k])) nuevo[k] = (nuevo[k] as unknown[]).filter((c) => !aplicadas.includes(String(c)))
    nuevo.campos_con_propuesta_del_agente = [...new Set([...(Array.isArray(draft.campos_con_propuesta_del_agente) ? (draft.campos_con_propuesta_del_agente as string[]) : []), ...aplicadas])]
  }
  const claves = [...new Set([...Object.keys(draft), ...Object.keys(nuevo)])].filter((k) => !k.startsWith('_') && !['campos_provisionales', 'campos_ausentes', 'campos_con_propuesta_del_agente'].includes(k))
  const campos_distintos = claves.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(nuevo[k]))
  return { draft: nuevo, aplicadas, rechazadas, campos_distintos, hechos_sin_respaldo }
}

export const campoTienePropuesta = tieneRotulo
