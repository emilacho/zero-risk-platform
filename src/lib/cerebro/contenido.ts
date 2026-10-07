/**
 * EL CONTENIDO COMPLETO POR REFERENCIA · «dame el contenido de la línea R» · H6 del contraste del tramo 2.
 *
 * UN lector para todas las fuentes de la lista corta: el mismo código, una tabla de «dónde vive el texto de cada fuente» y cuatro
 * sufijos para lo que sale de DENTRO de una fila (`#producto:N`, `#familia:F`, `#decision`, `#config:clave`). No hay una regla por
 * tipo de output: lo que cambia es la tabla de donde se lee.
 *
 * Solo lectura. Siempre con el filtro del cliente (la fila de otro cliente no existe para este lector).
 * `sin_material` (no hay) y `error_de_lectura` (falló leer) NUNCA se mezclan. Si el texto es muy grande se DECLARA el corte
 * (`cortado`, `aviso_de_corte`) y se puede pedir el resto con `desde`: nada se oculta.
 */
import type { Consulta, Fila } from './consulta'
import { extraerCatalogo, type ItemCatalogo } from './datos-estructurados'
import { type EstadoDeLectura, pesoDeTexto } from './tipos'

/** ≈ 21.000 «tokens»: cabe de sobra una página o un plan reales (medidos: 26.761 y 23.945 caracteres) */
export const MAXIMO_DE_CARACTERES_POR_DEFECTO = 60_000

export interface Contenido {
  ref: string
  estado: EstadoDeLectura
  texto: string | null
  caracteres_totales: number
  caracteres_entregados: number
  cortado: boolean
  aviso_de_corte?: string
  peso_estimado: number
  detalle?: string
}

export interface OpcionesDeContenido { maximoCaracteres?: number; desde?: number }

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const fecha = (v: unknown): string => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString().slice(0, 10) : 'sin fecha')
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const objeto = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

interface Leible { columnas: string[]; texto: (f: Fila) => string | null }

/** dónde vive el texto de cada fuente de la lista corta */
const LEIBLES: Record<string, Leible> = {
  client_brand_books: { columnas: ['id', 'content_text'], texto: (f) => cadena(f.content_text) },
  client_icp_documents: { columnas: ['id', 'content_text'], texto: (f) => cadena(f.content_text) },
  client_competitive_landscape: { columnas: ['id', 'content_text'], texto: (f) => cadena(f.content_text) },
  client_web_pages: { columnas: ['id', 'content_text'], texto: (f) => cadena(f.content_text) },
  client_historical_outputs: { columnas: ['id', 'content_text'], texto: (f) => cadena(f.content_text) },
  client_brain_chunks: { columnas: ['id', 'chunk_text'], texto: (f) => cadena(f.chunk_text) },
  client_social_images: {
    columnas: ['id', 'caption', 'producto', 'posted_at', 'post_url', 'url', 'medio', 'tipo'],
    texto: (f) => [
      `Tipo: ${cadena(f.medio) ?? cadena(f.tipo) ?? 'imagen'}`,
      `Texto de la publicación: ${cadena(f.caption) ?? '(sin texto)'}`,
      `Producto: ${lista(f.producto).join(', ') || 'no declarado'}`,
      `Publicada el ${fecha(f.posted_at)}`,
      `Enlace de la publicación: ${cadena(f.post_url) ?? 'sin enlace'}`,
      `Archivo: ${cadena(f.url) ?? 'sin archivo'}`,
    ].join('\n'),
  },
  client_sede_datos: { columnas: ['id', 'campo', 'valor_texto', 'fuente', 'observado_en'], texto: (f) => (cadena(f.valor_texto) ? `${cadena(f.campo) ?? 'dato'} · ${cadena(f.fuente) ?? 'fuente desconocida'} · observado ${fecha(f.observado_en)}: ${f.valor_texto}` : null) },
  client_sedes: { columnas: ['id', 'clave', 'ciudad'], texto: (f) => `Sede ${cadena(f.clave) ?? ''} · ciudad ${cadena(f.ciudad) ?? 'sin declarar'}`.trim() },
  // la ficha del cerebro: su texto completo copiado; si es un archivo sin texto, su descripción (nombre, tipo, tamaño y enlace); nunca queda sin lectura
  cerebro_fichas: {
    columnas: ['id', 'titulo', 'que_es', 'contenido', 'archivo_nombre', 'archivo_tipo', 'archivo_enlace', 'archivo_bytes'],
    texto: (f) => cadena(f.contenido)
      ?? (cadena(f.archivo_nombre) || cadena(f.archivo_enlace)
        ? [`Archivo: ${cadena(f.archivo_nombre) ?? 'sin nombre'}`, `Tipo: ${cadena(f.archivo_tipo) ?? 'sin tipo'}`, `Tamaño: ${f.archivo_bytes ?? 'sin dato'} bytes`, `Enlace: ${cadena(f.archivo_enlace) ?? 'sin enlace'}`, ...(cadena(f.que_es) ? [`Qué es: ${f.que_es}`] : [])].join('\n')
        : [cadena(f.titulo), cadena(f.que_es)].filter(Boolean).join('\n') || null),
  },
  hitl_queue: {
    columnas: ['id', 'type', 'status', 'decision', 'resolution_notes'],
    texto: (f) => [`${cadena(f.type) ?? 'revisión'} · ${cadena(f.status) ?? ''}`.trim(), Object.keys(objeto(f.decision)).length ? JSON.stringify(f.decision) : null, cadena(f.resolution_notes)].filter(Boolean).join('\n'),
  },
  clients: { columnas: ['id', 'name', 'website_url', 'status'], texto: (f) => [`Nombre: ${cadena(f.name) ?? ''}`, `Sitio: ${cadena(f.website_url) ?? 'sin declarar'}`, `Estado: ${cadena(f.status) ?? 'sin declarar'}`].join('\n') },
}

const linea = (it: ItemCatalogo): string =>
  `${it.nombre}${it.descripcion ? ` — ${it.descripcion}` : ''} · ${it.precio !== null ? `${it.precio} ${it.moneda ?? ''}`.trim() : 'sin precio declarado'}${it.familia ? ` · familia ${it.familia}` : ''}`

/** lo que sale de DENTRO de una fila: el sufijo dice cuál parte, y de qué tabla */
const SUFIJOS: Record<string, { tabla: string; columnas: string[]; texto: (f: Fila, argumento: string) => string | null }> = {
  producto: {
    tabla: 'client_web_pages', columnas: ['id', 'content_text'],
    texto: (f, n) => {
      const it = extraerCatalogo(String(f.content_text ?? '')).items[Number(n) - 1]
      return it ? [`Nombre: ${it.nombre}`, `Tipo: ${it.tipo}`, `Descripción: ${it.descripcion ?? 'sin descripción'}`, `Precio: ${it.precio !== null ? `${it.precio} ${it.moneda ?? ''}`.trim() : 'sin precio declarado'}`, `Familia: ${it.familia ?? 'sin familia'}`].join('\n') : null
    },
  },
  familia: {
    tabla: 'client_web_pages', columnas: ['id', 'content_text'],
    texto: (f, nombre) => {
      const items = extraerCatalogo(String(f.content_text ?? '')).items.filter((i) => (i.familia ?? 'Sin familia') === nombre)
      return items.length ? [`Familia ${nombre} · ${items.length} productos o servicios`, ...items.map((i) => `- ${linea(i)}`)].join('\n') : null
    },
  },
  decision: {
    tabla: 'client_historical_outputs', columnas: ['id', 'title', 'hitl_verdict', 'human_edits'],
    texto: (f) => [cadena(f.hitl_verdict) && `Veredicto: ${f.hitl_verdict}`, cadena(f.human_edits) && `Cambios del aprobador: ${f.human_edits}`].filter(Boolean).join('\n') || null,
  },
  config: {
    tabla: 'clients', columnas: ['id', 'config'],
    texto: (f, clave) => (clave in objeto(f.config) ? JSON.stringify(objeto(f.config)[clave], null, 2) : null),
  },
}

const sinMaterial = (ref: string, detalle: string): Contenido => ({ ref, estado: 'sin_material', texto: null, caracteres_totales: 0, caracteres_entregados: 0, cortado: false, peso_estimado: 0, detalle })

export async function leerContenido(consulta: Consulta, cliente: string, ref: string, opciones: OpcionesDeContenido = {}): Promise<Contenido> {
  const m = /^([a-z_]+):([^#\s]+)(?:#([a-z_]+):?(.*))?$/.exec(ref)
  if (!m) return sinMaterial(ref, 'referencia_desconocida')
  const [, tabla, id, sufijo, argumento] = m
  const suf = sufijo ? SUFIJOS[sufijo] : undefined
  if (sufijo && (!suf || suf.tabla !== tabla)) return sinMaterial(ref, 'referencia_desconocida')
  const leible: Leible | undefined = suf ? { columnas: suf.columnas, texto: (f) => suf.texto(f, argumento) } : LEIBLES[tabla]
  if (!leible) return sinMaterial(ref, 'referencia_desconocida')
  // la ficha de un cliente solo se lee para ese cliente: la de otro no existe para este lector
  if (tabla === 'clients' && id !== cliente) return sinMaterial(ref, 'no_existe')
  const r = await consulta({ tabla, columnas: leible.columnas, donde: tabla === 'clients' ? { id: cliente } : { client_id: cliente, id }, limite: 1 })
  if (r.error) return { ref, estado: 'error_de_lectura', texto: null, caracteres_totales: 0, caracteres_entregados: 0, cortado: false, peso_estimado: 0, detalle: r.error }
  const f = r.filas[0]
  if (!f) return sinMaterial(ref, 'no_existe')
  const completo = leible.texto(f)
  if (!completo) return sinMaterial(ref, 'sin_texto')
  const maximo = Math.max(1, opciones.maximoCaracteres ?? MAXIMO_DE_CARACTERES_POR_DEFECTO)
  const desde = Math.max(0, opciones.desde ?? 0)
  if (desde >= completo.length) return { ...sinMaterial(ref, 'desde_fuera_de_rango'), caracteres_totales: completo.length }
  const texto = completo.slice(desde, desde + maximo)
  const cortado = desde + texto.length < completo.length
  return {
    ref, estado: 'ok', texto, caracteres_totales: completo.length, caracteres_entregados: texto.length, cortado, peso_estimado: pesoDeTexto(texto),
    ...(cortado ? { aviso_de_corte: `CORTADO: se entregan ${texto.length} de ${completo.length} caracteres (desde el ${desde}); el resto se pide con desde=${desde + texto.length}` } : {}),
  }
}

/** varias referencias a la vez: cada una en su orden; un fallo no esconde a las demás */
export async function leerContenidos(consulta: Consulta, cliente: string, refs: string[], opciones: OpcionesDeContenido = {}): Promise<Contenido[]> {
  return Promise.all(refs.map((r) => leerContenido(consulta, cliente, r, opciones)))
}
