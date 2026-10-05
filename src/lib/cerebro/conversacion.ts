/**
 * EL FORMATO DE LA CONVERSACIÓN · paso 3 del tramo 1 · qué pide el agente y qué responde el portero.
 *
 * Sin modelo y SIN tabla de «piso por clase»: el portero elige RAZONANDO sobre la lista corta completa (tramo 2).
 * Lo único fijo es lo mínimo: el manual de marca vigente y las correcciones del aprobador.
 * Este módulo solo define el contrato, lo valida y arma el RESPALDO sin modelo (lo fijo + la lista completa como índice).
 */
import type { Estado, EstadoDeLectura, Estante, Ficha, ListaCorta, NombreDeFuente, Origen } from './tipos'
import { NOMBRES_DE_FUENTE } from './tipos'

/** La ronda 1 la hace el proceso; el agente puede preguntar hasta 3 veces más. */
export const MAX_RONDAS = 4

/** Cuando algo no cabe en el tope de lo entregado. Es el único motivo con nombre fijo; los demás los escribe el portero. */
export const MOTIVO_NO_CABE = 'no_cabe'

/**
 * Por qué el portero no entregó algo: texto LIBRE (el portero razona; el código no tiene una lista de motivos por tipo de trabajo).
 * Dos reglas: no puede estar vacío ni ser larguísimo, y «vencido» NUNCA es un motivo (lo vencido se entrega con su aviso).
 */
export function esMotivoValido(motivo: unknown): boolean {
  if (typeof motivo !== 'string') return false
  const m = motivo.trim()
  return m.length > 0 && m.length <= 120 && !/venc/i.test(m)
}

export interface Pedido {
  cliente: string
  voy_a_producir: { output?: string; material?: string; canal?: string; formato?: string; objetivo?: string }
  necesito: string
  ya_tengo: string[]
  /** clases o fuentes de material que el proceso YA entrega por su cuenta: no se vuelven a listar */
  ya_trae: string[]
  /** si el pedido quiere que el portero pueda pedir fotos para VER (por defecto sí) */
  pixeles: boolean
  ronda: number
}

export type ResultadoDePedido = { ok: true; pedido: Pedido } | { ok: false; errores: string[] }

const CAMPOS_DE_PRODUCCION = ['output', 'material', 'canal', 'formato', 'objetivo'] as const
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function validarPedido(x: unknown): ResultadoDePedido {
  if (!esObjeto(x)) return { ok: false, errores: ['el pedido debe ser un objeto'] }
  const errores: string[] = []
  const cliente = typeof x.cliente === 'string' ? x.cliente.trim() : ''
  if (!cliente) errores.push('falta `cliente`')
  const ronda = x.ronda === undefined ? 1 : x.ronda
  if (typeof ronda !== 'number' || !Number.isInteger(ronda) || ronda < 1 || ronda > MAX_RONDAS) errores.push(`\`ronda\` debe ser un entero entre 1 y ${MAX_RONDAS}`)
  const yaTengo = x.ya_tengo === undefined ? [] : x.ya_tengo
  if (!Array.isArray(yaTengo) || yaTengo.some((r) => typeof r !== 'string')) errores.push('`ya_tengo` debe ser una lista de textos')
  const yaTrae = x.ya_trae === undefined ? [] : x.ya_trae
  if (!Array.isArray(yaTrae) || yaTrae.some((r) => typeof r !== 'string')) errores.push('`ya_trae` debe ser una lista de textos')
  const pixeles = x.pixeles === undefined ? true : x.pixeles
  if (typeof pixeles !== 'boolean') errores.push('`pixeles` debe ser verdadero o falso')
  const vp = x.voy_a_producir === undefined ? {} : x.voy_a_producir
  if (!esObjeto(vp)) errores.push('`voy_a_producir` debe ser un objeto')
  const produccion: Pedido['voy_a_producir'] = {}
  if (esObjeto(vp)) for (const c of CAMPOS_DE_PRODUCCION) { const v = vp[c]; if (typeof v === 'string' && v.trim()) produccion[c] = v.trim() }
  const necesito = typeof x.necesito === 'string' ? x.necesito.trim() : ''
  if (!necesito && Object.keys(produccion).length === 0) errores.push('el pedido no dice qué se va a producir: falta `necesito` o algún campo de `voy_a_producir`')
  if (errores.length) return { ok: false, errores }
  return { ok: true, pedido: { cliente, voy_a_producir: produccion, necesito, ya_tengo: yaTengo as string[], ya_trae: (yaTrae as string[]).map((r) => r.trim()).filter(Boolean), pixeles: pixeles as boolean, ronda: ronda as number } }
}

export interface CosaEntregada {
  ref: string
  estante: Estante
  clase: string
  titulo: string
  /** el texto lo COPIA el sistema (el modelo nunca transcribe material) */
  texto: string
  origen: Origen
  estado: Estado
  fecha_fuente: string | null
  vigente_hasta: string | null
  vencido: boolean
  aviso?: string
  enlace?: string | null
  producto?: string[] | null
  sede?: string | null
}

export interface LineaDeIndice { ref: string; estante: Estante; clase: string; titulo: string; estado: Estado; fecha_fuente: string | null; vencido: boolean; vigente?: boolean }
export interface CosaQuitada { ref: string; motivo: string }

export interface Respuesta {
  modo: 'conversado' | 'respaldo'
  ronda: number
  material: CosaEntregada[]
  por_que_te_sirve: string[]
  lo_que_no_te_di: CosaQuitada[]
  indice: LineaDeIndice[]
  faltantes: string[]
  /** estado de lectura de cada fuente: «sin_material» (no hay) y «error_de_lectura» (falló leer) NUNCA se mezclan */
  lectura: Record<NombreDeFuente, EstadoDeLectura>
  errores_de_lectura: NombreDeFuente[]
  estado_de_la_lista: ListaCorta['estado']
}

/** Lo único que el sistema entrega siempre: el manual de marca vigente y las correcciones y decisiones del aprobador. */
export function loFijo(lista: ListaCorta): Ficha[] {
  return lista.lineas.filter((f) => (f.clase === 'manual' && f.vigente === true) || f.estante === 'E7')
}

const entrega = (f: Ficha): CosaEntregada => ({
  ref: f.ref, estante: f.estante, clase: f.clase, titulo: f.titulo, texto: f.contenido ?? f.resumen ?? f.que_es, origen: f.origen, estado: f.estado,
  fecha_fuente: f.fecha_fuente, vigente_hasta: f.vigente_hasta, vencido: f.vencido, ...(f.aviso ? { aviso: f.aviso } : {}),
  ...(f.enlace !== undefined ? { enlace: f.enlace } : {}), ...(f.producto !== undefined ? { producto: f.producto } : {}), ...(f.sede !== undefined ? { sede: f.sede } : {}),
})
const indice = (f: Ficha): LineaDeIndice => ({
  ref: f.ref, estante: f.estante, clase: f.clase, titulo: f.titulo, estado: f.estado, fecha_fuente: f.fecha_fuente, vencido: f.vencido,
  ...(f.vigente !== undefined ? { vigente: f.vigente } : {}),
})

/**
 * El RESPALDO: lo arma esta biblioteca, sin modelo y sin depender de ningún flujo. Se usa cuando el portero falla, tarda o no está publicado.
 * Entrega lo fijo, pone TODO lo demás en el índice y no quita nada.
 */
export function respuestaDeRespaldo(lista: ListaCorta, pedido: Pick<Pedido, 'ronda'> | { ronda?: number }): Respuesta {
  const fijo = loFijo(lista)
  const fijas = new Set(fijo.map((f) => f.ref))
  const lectura = Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, lista.fuentes[k].estado])) as Record<NombreDeFuente, EstadoDeLectura>
  const errores = NOMBRES_DE_FUENTE.filter((k) => lectura[k] === 'error_de_lectura')
  const faltantes: string[] = []
  // un hueco del cliente se dice como faltante; un fallo de lectura NO es un faltante: es un fallo
  if (lectura.manual === 'sin_material') faltantes.push('manual de marca vigente')
  return {
    modo: 'respaldo', ronda: pedido.ronda ?? 1, material: fijo.map(entrega),
    por_que_te_sirve: ['Respaldo sin modelo: se entrega lo fijo (manual vigente y correcciones del aprobador) y la lista completa de lo demás para pedirlo por su número.'],
    lo_que_no_te_di: [], indice: lista.lineas.filter((f) => !fijas.has(f.ref)).map(indice), faltantes, lectura, errores_de_lectura: errores, estado_de_la_lista: lista.estado,
  }
}

const ESTADOS: readonly string[] = ['dicho_por_dueno', 'visto_en_su_fuente', 'medido', 'de_tercero', 'inferido', 'borrador sin aprobar', 'aprobado', 'rechazado', 'propiedad_incierta']
const LECTURAS: readonly string[] = ['ok', 'sin_material', 'error_de_lectura']

export function validarRespuesta(x: unknown): { ok: true } | { ok: false; errores: string[] } {
  const errores: string[] = []
  if (!esObjeto(x)) return { ok: false, errores: ['la respuesta debe ser un objeto'] }
  if (x.modo !== 'conversado' && x.modo !== 'respaldo') errores.push('`modo` debe ser «conversado» o «respaldo»')
  if (!Array.isArray(x.material)) errores.push('`material` debe ser una lista')
  else x.material.forEach((m, i) => {
    if (!esObjeto(m)) { errores.push(`material[${i}] debe ser un objeto`); return }
    if (typeof m.ref !== 'string' || !m.ref) errores.push(`material[${i}] sin \`ref\``)
    if (typeof m.estado !== 'string' || !ESTADOS.includes(m.estado)) errores.push(`material[${i}] sin \`estado\` válido (quién lo afirmó)`)
    if (!Object.prototype.hasOwnProperty.call(m, 'fecha_fuente')) errores.push(`material[${i}] sin \`fecha_fuente\` (puede ser null, pero tiene que declararse)`)
    if (typeof m.vencido !== 'boolean') errores.push(`material[${i}] sin \`vencido\``)
    if (typeof m.texto !== 'string') errores.push(`material[${i}] sin \`texto\``)
  })
  if (!Array.isArray(x.lo_que_no_te_di)) errores.push('`lo_que_no_te_di` debe ser una lista')
  else x.lo_que_no_te_di.forEach((q, i) => {
    if (!esObjeto(q) || typeof q.ref !== 'string' || !esMotivoValido(q.motivo)) errores.push(`lo_que_no_te_di[${i}] con un motivo que no vale (vacío, larguísimo o «vencido»): ${esObjeto(q) ? String(q.motivo) : '?'}`)
  })
  if (!Array.isArray(x.indice)) errores.push('`indice` debe ser una lista')
  if (!Array.isArray(x.faltantes) || x.faltantes.some((f) => typeof f !== 'string')) errores.push('`faltantes` debe ser una lista de textos')
  if (!esObjeto(x.lectura) || Object.values(x.lectura).some((v) => typeof v !== 'string' || !LECTURAS.includes(v))) errores.push('`lectura` debe mapear cada fuente a ok · sin_material · error_de_lectura')
  if (!Array.isArray(x.errores_de_lectura)) errores.push('`errores_de_lectura` debe ser una lista')
  return errores.length ? { ok: false, errores } : { ok: true }
}

/**
 * EL ÍNDICE NUNCA MIENTE: toda cosa VIGENTE de la lista tiene que estar entregada, en el índice o quitada con motivo.
 * Devuelve las que faltan (lista vacía = no miente). Una versión reemplazada puede no aparecer.
 */
export function verificarIndiceNoMiente(lista: ListaCorta, respuesta: Pick<Respuesta, 'material' | 'indice' | 'lo_que_no_te_di'>): string[] {
  const declaradas = new Set<string>([...respuesta.material.map((m) => m.ref), ...respuesta.indice.map((i) => i.ref), ...respuesta.lo_que_no_te_di.map((q) => q.ref)])
  return lista.lineas.filter((f) => f.vigente !== false && !declaradas.has(f.ref)).map((f) => f.ref)
}
