/**
 * LA MESA DE CREATIVOS DEL CALENDARIO (31-oct · diseño DISENO-CC1-mesa-de-creativos-calendario v2, revisado por CC#3).
 * El paso calendario pasa de UNA llamada (el estratega solo) a dos tramos: (A) una mesa de ideas donde el equipo creativo propone tema, gancho e idea para cada hueco de la tanda y
 * (B) la llamada de siempre, donde el estratega ORDENA esas ideas en el calendario que la cadena ya espera. Este archivo es la parte pura de la cadena: la palanca, el marco que lee la mesa,
 * el plazo y qué ideas salieron junto con una fila. Nada aquí habla con un modelo ni sabe de un cliente.
 * Nace APAGADO: sin `cadena_config.mesa_de_creativos` (o sin el cliente en su lista) la cadena es la de siempre, byte a byte.
 */
import type { Almacen, ContextoDelCliente, MesaDeCalendario } from './almacen'
import type { Estrategia, Fila } from './tipos'

/** la mesa es el equipo trabajando, no una llamada: tiene su propio plazo (el vigía de las corridas no la toca) */
export const PLAZO_DE_LA_MESA_MIN = 45
export const CONTRATO_CON_MESA = 'calendario_tanda.v2'
export const CONTRATO_SIN_MESA = 'calendario_tanda.v1'
/** el tablero que se pega a la tarea no puede crecer sin cota */
const MAX_IDEAS_CHARS = 14_000

/** ¿la palanca está encendida para este cliente? `cadena_config.mesa_de_creativos = { clientes: [client_id…] }`; cualquier otra forma = apagada */
export async function mesaEncendida(al: Almacen, clientId: string): Promise<boolean> {
  const v = await al.leerConfig('mesa_de_creativos')
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const c = (v as { clientes?: unknown }).clientes
  return Array.isArray(c) && c.includes(clientId)
}

export const plazoDeLaMesa = (ahora: string): string => new Date(new Date(ahora).getTime() + PLAZO_DE_LA_MESA_MIN * 60_000).toISOString()

export interface PedidoDeMarco {
  ctx: ContextoDelCliente
  estrategia: Estrategia
  tanda: number
  semanas: number[]
  /** el esqueleto de la tanda (los huecos con su fecha), de `expandirPatron` */
  esqueleto: Fila[]
  filasPrevias: Fila[]
  fechasEspeciales: Array<{ fecha: string; nombre: string }>
}

const NOMBRE_DEL_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/**
 * Lo que lee la mesa: los HUECOS de la tanda (semana · día · red · formato · pilar · sede · hora, con su fecha), el plan en lo que importa a las ideas, las sedes, lo ya usado y las fechas especiales.
 * Pura. Sin datos con valor (precios, horarios): las ideas no los llevan; el estratega los pone con su referencia en el tramo B.
 */
export function marcoDeLaTanda(p: PedidoDeMarco): string {
  const e = p.estrategia
  const huecos = p.esqueleto.map((f) => `- ${f.id} · semana ${f.semana} · ${NOMBRE_DEL_DIA[f.dia_semana] ?? `día ${f.dia_semana}`} ${f.fecha} ${f.hora} · ${f.red} · ${f.formato} · pilar ${f.pilar}${f.sede ? ` · sede ${f.sede}` : ''}${f.pieza_fija ? ` · PIEZA FIJA ${f.pieza_fija}: ${f.tema ?? ''}` : ''}`)
  return [
    `# Tanda ${p.tanda} del calendario (semanas ${p.semanas.join(', ')})`,
    'Tu trabajo es IDEAR el qué de cada hueco: tema, gancho e idea visual. No escribas fechas ni datos con valor (precios, horarios, cifras): eso lo ordena después quien arma el calendario, con su fuente.',
    '',
    '## Huecos de la tanda (cada uno necesita UNA idea elegida)',
    huecos.length ? huecos.join('\n') : '(la tanda no tiene huecos)',
    '',
    '## Estrategia vigente',
    JSON.stringify({ canales: e.canales, pilares: e.pilares, fases: e.fases, hitos: e.hitos, alertas: e.alertas }),
    '',
    '## Sedes',
    p.ctx.sedes.length ? p.ctx.sedes.map((s) => `- ${s.clave}${s.nombre ? ` (${s.nombre})` : ''}`).join('\n') : '(sin sedes)',
    '',
    '## Fechas especiales de la tanda',
    p.fechasEspeciales.length ? p.fechasEspeciales.map((f) => `- ${f.fecha}: ${f.nombre}`).join('\n') : '(ninguna)',
    '',
    '## Temas ya usados (no los repitas)',
    p.filasPrevias.length ? p.filasPrevias.slice(-24).map((f) => `- ${f.id}: ${f.tema ?? ''}`).join('\n') : '(es la primera tanda)',
    '',
    '## Plan de marketing',
    p.ctx.planTexto,
  ].join('\n')
}

export type EstadoDeLaMesaParaElCalendario =
  /** palanca apagada o corrección sin ideas: la tarea de siempre */
  | { accion: 'sin_mesa' }
  /** hay que abrir la mesa (fila nueva, plazo de 45 min) */
  | { accion: 'abrir_mesa' }
  /** el equipo trabaja y su plazo no ha vencido */
  | { accion: 'esperar_mesa'; plazo_en: string }
  /** ordenar con las ideas, o sin ellas si la mesa falló / venció / cerró vacía */
  | { accion: 'ordenar'; ideas: string | null; motivo: string | null }

/** ¿qué sigue para esta tanda según la fila de la mesa? Pura: la decisión de preparar (los efectos los hace el llamador) */
export function siguienteDeLaMesa(m: MesaDeCalendario | null, ahora: string): EstadoDeLaMesaParaElCalendario {
  if (!m) return { accion: 'abrir_mesa' }
  if (m.estado === 'lista') {
    const t = (m.texto ?? '').trim()
    return t ? { accion: 'ordenar', ideas: t.slice(0, MAX_IDEAS_CHARS), motivo: null } : { accion: 'ordenar', ideas: null, motivo: 'la mesa cerró sin ideas' }
  }
  if (m.estado === 'sin_mesa') return { accion: 'ordenar', ideas: null, motivo: m.motivo ?? 'sin_mesa' }
  // abierta
  return new Date(m.plazo_en).getTime() > new Date(ahora).getTime() ? { accion: 'esperar_mesa', plazo_en: m.plazo_en } : { accion: 'ordenar', ideas: null, motivo: 'la mesa venció su plazo' }
}

/** el id de la fila del calendario (`s<semana>-d<día>-<slot>`) que corresponde a una pieza del objeto que entregó el estratega */
export const idDePieza = (p: { semana: number; dia_semana: number; slot: string }): string => `s${p.semana}-d${p.dia_semana}-${p.slot}`

/**
 * R9 · las ideas cuya fila SALIÓ por dato declarado sin fuente (V14/V22): quedan registradas para medir si la mesa produce ideas con datos sin fuente.
 * `salen` son los ids de fila que salieron; `chequeoDe` dice por qué salió cada una.
 */
export function ideasQueSacaronFilas(piezas: Array<{ semana: number; dia_semana: number; slot: string; idea_de_mesa?: string }>, salen: string[], chequeoDe: (filaId: string) => string | null): MesaDeCalendario['ideas_que_sacaron_filas'] {
  const out: MesaDeCalendario['ideas_que_sacaron_filas'] = []
  for (const p of piezas) {
    const idea = (p.idea_de_mesa ?? '').trim()
    if (!idea) continue
    const id = idDePieza(p)
    if (salen.includes(id)) out.push({ idea, chequeo: chequeoDe(id) ?? 'dato_sin_fuente', fila_id: id })
  }
  return out
}

/** cuántas piezas traen idea de la mesa: una MÉTRICA de la prueba, nunca una regla (citar no prueba que se usó bien) */
export const proporcionConIdea = (piezas: Array<{ idea_de_mesa?: string }>): { piezas: number; con_idea: number } => ({ piezas: piezas.length, con_idea: piezas.filter((p) => (p.idea_de_mesa ?? '').trim() !== '').length })

export type ResultadoDeEntrega = { ok: true; estado: 'lista' | 'sin_mesa'; ya_cerrada: boolean } | { ok: false; error: string }

/**
 * La mesa de la oficina entrega su tablero a la cadena (o dice que no pudo). La PRIMERA entrega que cierra gana; una entrega repetida es inocua.
 * Un tablero con texto → `lista`; sin texto → `sin_mesa` (el calendario se ordena igual, sin ideas) y el motivo queda dicho.
 */
export async function entregarIdeasDeLaMesa(al: Almacen, p: { campana_id: string; tanda: number; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }): Promise<ResultadoDeEntrega> {
  const m = await al.mesaDeCalendario(p.campana_id, p.tanda, p.version)
  if (!m) return { ok: false, error: 'no existe la mesa de esa tanda' }
  if (m.estado !== 'abierta') return { ok: true, estado: m.estado, ya_cerrada: true }
  const texto = (p.texto ?? '').trim()
  const estado = texto ? 'lista' : 'sin_mesa'
  const cerro = await al.cerrarMesaDeCalendario(m.id, { estado, texto: texto || null, costo_usd: Math.max(0, Math.round(p.costo_usd * 10000) / 10000), motivo: texto ? p.motivo : p.motivo ?? 'la mesa cerró sin ideas', encargo_id: p.encargo_id })
  return cerro ? { ok: true, estado, ya_cerrada: false } : { ok: true, estado: (await al.mesaDeCalendario(p.campana_id, p.tanda, p.version))?.estado === 'lista' ? 'lista' : 'sin_mesa', ya_cerrada: true }
}
