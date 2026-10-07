/**
 * Los lectores de cada fuente de un cliente (pasos 1 y 2 del tramo 1) · SOLO LECTURA.
 *
 * Cada lector hace UNA lectura filtrada por el cliente y devuelve líneas (`Ficha`) y el estado de lectura de su fuente.
 * Origen, estado, fecha y vigencia se DERIVAN al leer; no se escribe nada en ninguna parte.
 * Un error de lectura queda como `error_de_lectura`: jamás como «sin material».
 */
import type { Consulta, Fila, PeticionDeLectura } from './consulta'
import { extraerCatalogo, type ItemCatalogo } from './datos-estructurados'
import { type ClaseDePlazo, type Plazos, vigenciaDe } from './plazos'
import { resumirTexto } from './resumen'
import { type DecisionAtada, type DecisionDelDueno, type Estado, type EstadoDeFuente, type Ficha, type NombreDeFuente, type Origen, pesoDeTexto } from './tipos'
import { derivarVersiones } from './versiones'

export interface Contexto { consulta: Consulta; cliente: string; ahora: Date; plazos: Plazos }
export interface Salida {
  fuentes: Partial<Record<NombreDeFuente, EstadoDeFuente>>
  lineas: Ficha[]
  /** lecturas hechas y fallidas (para decidir si la lista es «parcial» o «error») */
  lecturas: number
  fallidas: number
}

/** más productos o servicios que esto ⇒ una línea por familia con su cantidad (el detalle se pide por número) */
export const UMBRAL_PARA_AGRUPAR_CATALOGO = 30

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const iso = (v: unknown): string | null => {
  if (typeof v !== 'string' && !(v instanceof Date)) return null
  const t = new Date(v as string).getTime()
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
const objeto = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const recorte = (t: string, n = 160): string => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)

type Base = Omit<Ficha, 'vigente_hasta' | 'vencido' | 'aviso' | 'peso_estimado' | 'fecha_fuente'> & { peso?: number; fecha: string | null; plazo: ClaseDePlazo }

/** completa una línea con la vigencia derivada (fecha + plazo de su clase) y su peso */
function linea(ctx: Contexto, b: Base): Ficha {
  const { peso, fecha, plazo, ...resto } = b
  const v = vigenciaDe(fecha, ctx.plazos[plazo], ctx.ahora)
  const aviso = v.aviso ? (resto as { aviso?: string }).aviso ? `${v.aviso} · ${(resto as { aviso?: string }).aviso}` : v.aviso : (resto as { aviso?: string }).aviso
  const salida: Ficha = { ...resto, fecha_fuente: fecha, vigente_hasta: v.vigente_hasta, vencido: v.vencido, peso_estimado: peso ?? pesoDeTexto(`${b.titulo} ${b.que_es}`) }
  if (aviso) salida.aviso = aviso
  return salida
}

const estadoDeFuente = (lineas: number, detalle?: string): EstadoDeFuente => (lineas > 0 ? { estado: 'ok', n: lineas } : { estado: 'sin_material', n: 0, ...(detalle ? { detalle } : {}) })

async function leer(ctx: Contexto, p: PeticionDeLectura): Promise<{ filas: Fila[]; error: string | null }> {
  return ctx.consulta(p)
}

function fallo(fuentes: NombreDeFuente[], error: string): Salida {
  return { fuentes: Object.fromEntries(fuentes.map((f) => [f, { estado: 'error_de_lectura', n: 0, detalle: error }])), lineas: [], lecturas: 1, fallidas: 1 }
}
const exito = (fuentes: Partial<Record<NombreDeFuente, EstadoDeFuente>>, lineas: Ficha[]): Salida => ({ fuentes, lineas, lecturas: 1, fallidas: 0 })

const porRol = (rol: unknown): { origen: Origen; estado: Estado; propio: boolean } =>
  rol === 'competidor' ? { origen: 'tercero', estado: 'de_tercero', propio: false } : { origen: 'su_fuente', estado: 'visto_en_su_fuente', propio: true }

/** Estado de un documento producido que pasa por aprobación */
const estadoDeTrabajo = (status: unknown): Estado => (status === 'approved' || status === 'published' ? 'aprobado' : status === 'rejected' ? 'rechazado' : 'borrador sin aprobar')

// ── ficha del cliente (+ lo que dedujo el descubrimiento) ─────────────────────────────
export async function leerFichaDelCliente(ctx: Contexto): Promise<{ salida: Salida; existe: boolean }> {
  const r = await leer(ctx, { tabla: 'clients', columnas: ['id', 'name', 'website_url', 'status', 'config', 'created_at'], donde: { id: ctx.cliente }, limite: 1 })
  if (r.error) return { salida: fallo(['ficha_del_cliente'], r.error), existe: false }
  const c = r.filas[0]
  if (!c) return { salida: exito({ ficha_del_cliente: { estado: 'sin_material', n: 0, detalle: 'cliente_inexistente' } }, []), existe: false }
  const lineas: Ficha[] = [
    linea(ctx, {
      ref: `clients:${ctx.cliente}`, estante: 'E2', clase: 'ficha_del_cliente', titulo: texto(c.name) ?? 'Cliente',
      que_es: `Ficha del cliente · sitio ${texto(c.website_url) ?? 'sin declarar'} · estado ${texto(c.status) ?? 'sin declarar'}`,
      origen: 'dueno', estado: 'dicho_por_dueno', fecha: iso(c.created_at), plazo: 'sin_plazo',
    }),
  ]
  for (const [clave, valor] of Object.entries(objeto(c.config))) {
    if (objeto(valor).source !== 'auto_discovery_agent') continue
    lineas.push(linea(ctx, {
      ref: `clients:${ctx.cliente}#config:${clave}`, estante: 'E2', clase: 'dato_inferido', titulo: `Dato deducido: ${clave}`,
      que_es: `Lo dedujo el descubrimiento automático (no lo dijo el dueño): ${recorte(JSON.stringify(valor), 200)}`,
      origen: 'producido', estado: 'inferido', fecha: iso(c.created_at), plazo: 'sin_plazo',
    }))
  }
  return { salida: exito({ ficha_del_cliente: estadoDeFuente(lineas.length) }, lineas), existe: true }
}

// ── manual de marca: todas las versiones, vigente = la de mayor número ─────────────────
export async function leerManual(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'client_brand_books', columnas: ['id', 'version', 'human_validated', 'created_at', 'content_text'], donde: { client_id: ctx.cliente }, orden: { columna: 'version', descendente: true } })
  if (r.error) return fallo(['manual'], r.error)
  const filas = r.filas
  const maxima = filas.reduce((m, f) => Math.max(m, Number(f.version) || 0), 0)
  const lineas = filas.map((f) => {
    const version = Number(f.version) || 0
    const vigente = version === maxima
    const cuerpo = texto(f.content_text) ?? ''
    return linea(ctx, {
      ref: `client_brand_books:${f.id}`, estante: 'E1', clase: 'manual', titulo: `Manual de marca · versión ${version}`,
      que_es: 'Manual de marca (voz, valores, posicionamiento, vocabulario y palabras prohibidas)',
      origen: 'producido', estado: f.human_validated === true ? 'aprobado' : 'borrador sin aprobar',
      fecha: iso(f.created_at), plazo: 'sin_plazo', version, vigente, reemplazada: !vigente, versiones_anteriores: vigente ? filas.length - 1 : 0,
      peso: pesoDeTexto(cuerpo), ...(vigente ? { contenido: cuerpo } : {}),
    })
  })
  return exito({ manual: estadoDeFuente(lineas.length) }, lineas)
}

// ── perfil de cliente ideal ───────────────────────────────────────────────────────────
export async function leerPerfilDeClienteIdeal(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'client_icp_documents', columnas: ['id', 'audience_segment', 'created_at', 'content_text'], donde: { client_id: ctx.cliente } })
  if (r.error) return fallo(['perfil_cliente_ideal'], r.error)
  const lineas = r.filas.map((f) => linea(ctx, {
    ref: `client_icp_documents:${f.id}`, estante: 'E1', clase: 'perfil_cliente_ideal', titulo: `Perfil de cliente ideal · ${texto(f.audience_segment) ?? 'segmento'}`,
    que_es: 'Segmento de cliente ideal (sintetizado por el descubrimiento)', origen: 'producido', estado: 'borrador sin aprobar',
    fecha: iso(f.created_at), plazo: 'sin_plazo', peso: pesoDeTexto(texto(f.content_text)),
  }))
  return exito({ perfil_cliente_ideal: estadoDeFuente(lineas.length) }, lineas)
}

// ── competencia (análisis sobre terceros) ─────────────────────────────────────────────
export async function leerCompetencia(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'client_competitive_landscape', columnas: ['id', 'competitor_name', 'last_analyzed_at', 'created_at', 'content_text'], donde: { client_id: ctx.cliente } })
  if (r.error) return fallo(['competencia'], r.error)
  const lineas = r.filas.map((f) => {
    // una fila cuyo nombre empieza con «_» es un resumen interno de la tabla, no un competidor
    const resumen = (texto(f.competitor_name) ?? '').startsWith('_')
    return linea(ctx, {
    ref: `client_competitive_landscape:${f.id}`, estante: 'E5', clase: resumen ? 'resumen_de_competencia' : 'competidor', titulo: resumen ? 'Resumen del panorama competitivo' : `Competidor · ${texto(f.competitor_name) ?? 'sin nombre'}`,
    que_es: resumen ? 'Resumen del panorama competitivo (sintetizado por el descubrimiento)' : 'Análisis de un competidor (sintetizado por el descubrimiento, sobre material de terceros)', origen: 'tercero', estado: 'borrador sin aprobar', sobre_terceros: true,
    fecha: iso(f.last_analyzed_at) ?? iso(f.created_at), plazo: 'sitio_competencia', peso: pesoDeTexto(texto(f.content_text)),
    })
  })
  return exito({ competencia: estadoDeFuente(lineas.length) }, lineas)
}

// ── sitio (resumido) y catálogo de productos o servicios ──────────────────────────────
function lineaDeCatalogo(ctx: Contexto, pagina: string, items: Array<ItemCatalogo & { n: number }>, fecha: string | null, agrupar: boolean): Ficha[] {
  if (!agrupar) {
    return items.map((it) => linea(ctx, {
      ref: `${pagina}#producto:${it.n}`, estante: 'E2', clase: 'catalogo_item', titulo: it.nombre,
      que_es: [it.tipo, it.descripcion, it.precio !== null ? `${it.precio} ${it.moneda ?? ''}`.trim() : 'sin precio declarado'].filter(Boolean).join(' · '),
      origen: 'su_fuente', estado: 'visto_en_su_fuente', fecha, plazo: it.precio !== null ? 'precio_oferta_horario' : 'catalogo_y_direccion',
      datos: { precio: it.precio, moneda: it.moneda, familia: it.familia },
    }))
  }
  const porFamilia = new Map<string, ItemCatalogo[]>()
  for (const it of items) porFamilia.set(it.familia ?? 'Sin familia', [...(porFamilia.get(it.familia ?? 'Sin familia') ?? []), it])
  return [...porFamilia.entries()].map(([familia, lista]) => {
    const precios = lista.map((i) => i.precio).filter((p): p is number => p !== null)
    const moneda = lista.find((i) => i.moneda)?.moneda ?? ''
    return linea(ctx, {
      ref: `${pagina}#familia:${familia}`, estante: 'E2', clase: 'catalogo_familia', titulo: familia,
      que_es: `${lista.length} productos o servicios${precios.length ? ` · precios de ${Math.min(...precios)} a ${Math.max(...precios)} ${moneda}`.trimEnd() : ''}`,
      origen: 'su_fuente', estado: 'visto_en_su_fuente', fecha, plazo: precios.length ? 'precio_oferta_horario' : 'catalogo_y_direccion',
      cantidad: lista.length, datos: { precio: precios.length ? Math.min(...precios) : null, moneda: moneda || null, familia },
    })
  })
}

export async function leerSitio(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'client_web_pages', columnas: ['id', 'url', 'title', 'owner_role', 'crawled_at', 'content_text'], donde: { client_id: ctx.cliente } })
  if (r.error) return fallo(['sitio', 'productos'], r.error)
  const lineas: Ficha[] = []
  const items: Array<ItemCatalogo & { n: number; pagina: string; fecha: string | null }> = []
  let paginasPropias = 0
  for (const f of r.filas) {
    const rol = porRol(f.owner_role)
    const cuerpo = texto(f.content_text) ?? ''
    const ref = `client_web_pages:${f.id}`
    const fecha = iso(f.crawled_at)
    const res = resumirTexto(cuerpo)
    lineas.push(linea(ctx, {
      ref, estante: rol.propio ? 'E2' : 'E5', clase: 'sitio', titulo: texto(f.title) ?? texto(f.url) ?? 'Página',
      que_es: `Página ${texto(f.url) ?? ''} · ${res.caracteres_originales} caracteres leídos, ${res.caracteres_resumidos} en el resumen`.trim(),
      resumen: res.resumen, origen: rol.origen, estado: rol.estado, fecha, plazo: rol.propio ? 'catalogo_y_direccion' : 'sitio_competencia', peso: pesoDeTexto(res.resumen),
    }))
    if (!rol.propio) continue
    paginasPropias++
    extraerCatalogo(cuerpo).items.forEach((it, i) => items.push({ ...it, n: i + 1, pagina: ref, fecha }))
  }
  const sitio = lineas.length
  const agrupar = items.length > UMBRAL_PARA_AGRUPAR_CATALOGO
  const lineasCatalogo: Ficha[] = []
  if (agrupar) {
    const porPagina = new Map<string, typeof items>()
    for (const it of items) porPagina.set(it.pagina, [...(porPagina.get(it.pagina) ?? []), it])
    for (const [pagina, lista] of porPagina) lineasCatalogo.push(...lineaDeCatalogo(ctx, pagina, lista, lista[0].fecha, true))
  } else {
    const porPagina = new Map<string, typeof items>()
    for (const it of items) porPagina.set(it.pagina, [...(porPagina.get(it.pagina) ?? []), it])
    for (const [pagina, lista] of porPagina) lineasCatalogo.push(...lineaDeCatalogo(ctx, pagina, lista, lista[0].fecha, false))
  }
  const detalleProductos = paginasPropias === 0 ? 'sin_pagina_propia' : 'sin_datos_estructurados'
  return exito({ sitio: estadoDeFuente(sitio), productos: estadoDeFuente(lineasCatalogo.length, detalleProductos) }, [...lineas, ...lineasCatalogo])
}

// ── sedes y sus datos (se acumulan observaciones: queda la última de cada sede, campo y fuente) ──
export async function leerSedes(ctx: Contexto): Promise<Salida> {
  const [s, d] = await Promise.all([
    leer(ctx, { tabla: 'client_sedes', columnas: ['id', 'clave', 'ciudad', 'created_at', 'updated_at'], donde: { client_id: ctx.cliente } }),
    leer(ctx, { tabla: 'client_sede_datos', columnas: ['id', 'sede_id', 'campo', 'valor_texto', 'fuente', 'alcance', 'observado_en'], donde: { client_id: ctx.cliente } }),
  ])
  const fuentes: Partial<Record<NombreDeFuente, EstadoDeFuente>> = {}
  const lineas: Ficha[] = []
  let fallidas = 0
  const clavePorSede = new Map<string, string>()
  if (s.error) { fuentes.sedes = { estado: 'error_de_lectura', n: 0, detalle: s.error }; fallidas++ } else {
    for (const f of s.filas) clavePorSede.set(String(f.id), texto(f.clave) ?? String(f.id))
    const ls = s.filas.map((f) => linea(ctx, {
      ref: `client_sedes:${f.id}`, estante: 'E2', clase: 'sede', titulo: `Sede ${texto(f.clave) ?? ''}`.trim(), que_es: `Sede · ciudad ${texto(f.ciudad) ?? 'sin declarar'}`,
      origen: 'su_fuente', estado: 'visto_en_su_fuente', fecha: iso(f.updated_at) ?? iso(f.created_at), plazo: 'sin_plazo', sede: texto(f.clave),
    }))
    lineas.push(...ls); fuentes.sedes = estadoDeFuente(ls.length)
  }
  if (d.error) { fuentes.datos_de_sede = { estado: 'error_de_lectura', n: 0, detalle: d.error }; fallidas++ } else {
    const grupos = new Map<string, Fila[]>()
    for (const f of d.filas) {
      const k = [f.sede_id ?? '', f.campo, f.fuente].join('|')
      grupos.set(k, [...(grupos.get(k) ?? []), f])
    }
    const ld: Ficha[] = []
    for (const grupo of grupos.values()) {
      const orden = [...grupo].sort((a, b) => (String(iso(a.observado_en)) < String(iso(b.observado_en)) ? 1 : -1))
      const f = orden[0]
      const campo = texto(f.campo) ?? 'dato'
      const fuente = texto(f.fuente) ?? 'desconocida'
      const sede = f.sede_id ? clavePorSede.get(String(f.sede_id)) ?? null : null
      const plazo: ClaseDePlazo = campo === 'horario' ? 'precio_oferta_horario' : fuente === 'mapas' ? 'ficha_mapas_propia' : 'catalogo_y_direccion'
      ld.push(linea(ctx, {
        ref: `client_sede_datos:${f.id}`, estante: 'E2', clase: 'dato_de_sede', titulo: `${campo} · ${sede ?? 'cuenta'} · ${fuente}`, que_es: texto(f.valor_texto) ?? '',
        origen: fuente === 'dueno' ? 'dueno' : 'su_fuente', estado: fuente === 'dueno' ? 'dicho_por_dueno' : 'visto_en_su_fuente',
        fecha: iso(f.observado_en), plazo, sede, observaciones_anteriores: orden.length - 1,
      }))
    }
    lineas.push(...ld); fuentes.datos_de_sede = estadoDeFuente(ld.length)
  }
  return { fuentes, lineas, lecturas: 2, fallidas }
}

// ── fotos, portadas de video y logotipos ──────────────────────────────────────────────
export async function leerFotos(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'client_social_images', columnas: ['id', 'owner_role', 'post_id', 'tipo', 'medio', 'estado', 'url', 'caption', 'posted_at', 'post_url', 'producto', 'producto_fuente', 'created_at'], donde: { client_id: ctx.cliente } })
  if (r.error) return fallo(['fotos'], r.error)
  const claves: string[] = []
  const lineas = r.filas.map((f) => {
    const rol = porRol(f.owner_role)
    const medio = texto(f.medio)
    const esLogo = medio === 'logo' || String(f.tipo ?? '').startsWith('logo')
    const esVideo = medio === 'reel' || medio === 'video'
    const clase = esLogo ? 'logo' : esVideo ? 'portada_de_video' : 'foto'
    // una foto, una portada o un logo PROPIOS son archivos: no vencen (su clase propia). Lo de un competidor sigue siendo un anuncio y vence
    const plazo: ClaseDePlazo = !rol.propio ? 'anuncio_competencia' : 'archivo_propio'
    const producto = Array.isArray(f.producto) ? (f.producto as unknown[]).filter((p): p is string => typeof p === 'string') : null
    const publicado = iso(f.posted_at)
    const leyenda = texto(f.caption)
    const nombre = esLogo ? 'Logotipo' : esVideo ? 'Portada de video' : 'Foto'
    // la línea que lee el portero DISTINGUE cada foto: clase · fecha · producto (o, sin producto, el comienzo de su texto)
    const distintivo = producto && producto.length ? producto.join(' / ') : leyenda ? recorte(leyenda, 40) : 'sin producto ni texto'
    claves.push(String(f.post_id ?? f.id).slice(0, 12))
    return linea(ctx, {
      ref: `client_social_images:${f.id}`, estante: rol.propio ? 'E3' : 'E5', clase,
      titulo: `${nombre} · ${(publicado ?? iso(f.created_at) ?? 'sin fecha').slice(0, 10)} · ${distintivo}`,
      que_es: `${publicado ? `publicada el ${publicado.slice(0, 10)} · ` : ''}texto de la publicación: ${leyenda ? `«${recorte(leyenda)}»` : 'sin texto'} · producto: ${producto && producto.length ? producto.join(', ') : 'no declarado'}`,
      // la vigencia es de la ÚLTIMA VERIFICACIÓN (cuando se capturó), no de la fecha en que se publicó
      origen: rol.origen, estado: rol.estado, fecha: iso(f.created_at) ?? publicado, plazo,
      // el video no se guarda: el enlace es el de la publicación (la dirección del archivo caduca)
      enlace: esVideo ? texto(f.post_url) : texto(f.url) ?? texto(f.post_url),
      producto, publicado_en: publicado, producto_fuente: texto(f.producto_fuente),
      ...(f.estado === 'no_bajo' ? { aviso: 'archivo no descargado' } : {}),
    })
  })
  // dos fotos jamás salen con la misma línea: si dos coinciden en título y texto, se añade lo que las separa (su publicación)
  const veces = new Map<string, number>()
  for (const l of lineas) veces.set(JSON.stringify([l.titulo, l.que_es]), (veces.get(JSON.stringify([l.titulo, l.que_es])) ?? 0) + 1)
  lineas.forEach((l, i) => { if ((veces.get(JSON.stringify([l.titulo, l.que_es])) ?? 0) > 1) l.titulo = `${l.titulo} · ${claves[i]}` })
  return exito({ fotos: estadoDeFuente(lineas.length) }, lineas)
}

// ── trabajos hechos (plan, partes, piezas) con su versión derivada · y las decisiones que traen ──
/**
 * Los ÚNICOS tipos que hoy derivan versión, y por qué clave (medido en las filas reales):
 *   · plan   (`campaign_plan_90d`)   → el tipo (hay uno por cliente)
 *   · parte  (`campaign_brief_pack`) → tipo + `provenance_tag.plan_id`
 *   · pieza  (`campaign_piece`)      → tipo + `provenance_tag.brief_id` + `provenance_tag.parte_id`
 * Todo lo demás —un tipo sin clave, o con la clave INCOMPLETA— NO se agrupa por tipo: cada fila es su propia cosa
 * (tres correos distintos son tres cosas vigentes, no tres versiones de una). Devuelve null cuando no se sabe de qué cosa es.
 */
const CLAVE_DE_VERSION: Record<string, (f: Fila) => string | null> = {
  campaign_plan_90d: (f) => `plan|${f.output_type}`,
  campaign_brief_pack: (f) => {
    const plan = texto(objeto(f.provenance_tag).plan_id)
    return plan ? `parte|${f.output_type}|${plan}` : null
  },
  campaign_piece: (f) => {
    const pt = objeto(f.provenance_tag)
    const brief = texto(pt.brief_id), parte = texto(pt.parte_id)
    return brief && parte ? `pieza|${f.output_type}|${brief}|${parte}` : null
  },
}

/** Una fila de prueba lleva una marca `prueba_<algo>: true` en su `provenance_tag` (por ejemplo `prueba_t2`). */
const esDePrueba = (pt: Record<string, unknown>): boolean => Object.entries(pt).some(([k, v]) => k.startsWith('prueba_') && v === true)

/** Las PARTES guardan la validez en `valido` y las PIEZAS en `valida` (medido en las filas reales): vale si ninguna de las dos dice false. */
const esValido = (pt: Record<string, unknown>): boolean => pt.valido !== false && pt.valida !== false

/** Las decisiones del dueño que cuentan: las resueltas en la cola (aprobó · rechazó · pidió un cambio). Pendiente, en revisión o vencida NO es una decisión. */
const DECISION_DE_LA_COLA: Record<string, DecisionDelDueno> = { approved: 'aprobada', rejected: 'rechazada', edited: 'cambio_pedido' }

/** lo que dijo la decisión de la cola, en texto: lo decidido y las notas (nada se inventa) */
function detalleDeLaCola(f: Fila): string | null {
  const dec = objeto(f.decision)
  const t = [Object.keys(dec).length ? JSON.stringify(dec) : null, texto(f.resolution_notes)].filter(Boolean).join(' · ')
  return t ? recorte(t, 600) : null
}

/** El veredicto guardado EN la pieza, leído solo si se sabe leer: «aprobada» · «rechazada»; sin veredicto claro, los cambios del aprobador son un cambio pedido. */
function decisionDelVeredicto(veredicto: string | null, cambios: string | null): DecisionDelDueno | undefined {
  const v = (veredicto ?? '').toLowerCase()
  if (/^(aprob|approv)/.test(v)) return 'aprobada'
  if (/(rechaz|reject)/.test(v)) return 'rechazada'
  return cambios && !veredicto ? 'cambio_pedido' : undefined
}

const DECISIONES_NO_LEIDAS = 'las decisiones del dueño no se pudieron leer · la versión vigente puede no reflejar su aprobación'

export async function leerTrabajosHechos(ctx: Contexto): Promise<Salida> {
  const [r, cola] = await Promise.all([
    leer(ctx, { tabla: 'client_historical_outputs', columnas: ['id', 'output_type', 'title', 'status', 'created_at', 'updated_at', 'content_text', 'provenance_tag', 'hitl_verdict', 'human_edits'], donde: { client_id: ctx.cliente } }),
    // la decisión del dueño vive en la cola de revisión: sin leerla no se sabe cuál versión está aprobada
    leer(ctx, { tabla: 'hitl_queue', columnas: ['id', 'type', 'status', 'output_id', 'decision', 'resolution_notes', 'resolved_at', 'created_at'], donde: { client_id: ctx.cliente } }),
  ])
  if (r.error) return fallo(['trabajos_hechos', 'decisiones_del_aprobador'], r.error)
  // P1 · una fila marcada como PRUEBA (`provenance_tag.prueba_*`) no existe para la lista ni cuenta como versión
  const filas = r.filas.filter((f) => !esDePrueba(objeto(f.provenance_tag)))

  // la ÚLTIMA decisión de la cola sobre cada pieza (sin importar el orden en que lleguen las filas)
  const ultimaPorPieza = new Map<string, { decision: DecisionDelDueno; fecha: string | null; id: string; detalle: string | null }>()
  if (!cola.error) {
    for (const f of cola.filas) {
      const decision = DECISION_DE_LA_COLA[String(f.status)]
      const salida = f.output_id === null || f.output_id === undefined ? '' : String(f.output_id)
      if (!decision || !salida) continue
      const fecha = iso(f.resolved_at) ?? iso(f.created_at)
      const previa = ultimaPorPieza.get(salida)
      if (!previa || String(fecha ?? '') > String(previa.fecha ?? '') || (fecha === previa.fecha && String(f.id) > previa.id)) ultimaPorPieza.set(salida, { decision, fecha, id: String(f.id), detalle: detalleDeLaCola(f) })
    }
  }

  const versiones = derivarVersiones(filas.map((f) => {
    const d = ultimaPorPieza.get(String(f.id))
    const aprobadaPorEstado = f.status === 'approved' || f.status === 'published'
    return {
      id: String(f.id),
      clave: CLAVE_DE_VERSION[String(f.output_type)]?.(f) ?? `propia|${f.id}`,
      creado: iso(f.created_at) ?? '',
      // lo que dijo el dueño en la cola manda sobre el estado de la fila: aprobó → aprobada · rechazó o pidió un cambio → ya no lo está
      aprobada: d ? d.decision === 'aprobada' : aprobadaPorEstado,
      valida: esValido(objeto(f.provenance_tag)),
    }
  }))
  const lineas: Ficha[] = []
  const decisiones: Ficha[] = []
  for (const f of filas) {
    const v = versiones.get(String(f.id))
    const tipo = String(f.output_type)
    const pt = objeto(f.provenance_tag)
    const valida = esValido(pt)
    const ref = `client_historical_outputs:${f.id}`
    const esPlan = tipo === 'campaign_plan_90d'
    const esParte = tipo === 'campaign_brief_pack'
    const veredicto = texto(f.hitl_verdict), cambios = texto(f.human_edits)
    const deLaCola = ultimaPorPieza.get(String(f.id))
    const delVeredicto = decisionDelVeredicto(veredicto, cambios)
    const decisionAtada: DecisionAtada | undefined = deLaCola
      ? { decision: deLaCola.decision, version: v?.version ?? null, ref_de_la_decision: `hitl_queue:${deLaCola.id}`, fecha: deLaCola.fecha, detalle: deLaCola.detalle }
      : delVeredicto
        ? { decision: delVeredicto, version: v?.version ?? null, ref_de_la_decision: `${ref}#decision`, fecha: iso(f.updated_at) ?? iso(f.created_at), detalle: cambios ? recorte(cambios, 600) : null }
        : undefined
    const estado: Estado = deLaCola ? (deLaCola.decision === 'aprobada' ? 'aprobado' : deLaCola.decision === 'rechazada' ? 'rechazado' : 'borrador sin aprobar') : estadoDeTrabajo(f.status)
    const avisos = [
      !valida ? `${esParte ? 'PARTE NO VÁLIDO' : tipo === 'campaign_piece' ? 'PIEZA NO VÁLIDA' : 'NO VÁLIDO'} · ${texto(pt.motivo_invalido) ?? 'sin motivo declarado'}` : null,
      cola.error ? DECISIONES_NO_LEIDAS : null,
    ].filter(Boolean) as string[]
    lineas.push(linea(ctx, {
      ref, estante: esPlan || esParte ? 'E1' : 'E6', clase: esPlan ? 'plan' : esParte ? 'parte_de_trabajo' : tipo === 'campaign_piece' ? 'pieza' : 'trabajo_hecho',
      titulo: texto(f.title) ?? tipo, que_es: `${tipo} · ${texto(f.status) ?? 'sin estado'}`, origen: 'producido', estado,
      fecha: iso(f.created_at), plazo: esPlan ? 'plan' : 'sin_plazo', peso: pesoDeTexto(texto(f.content_text)),
      version: v?.version, vigente: v?.vigente, reemplazada: v?.reemplazada, versiones_anteriores: v?.versiones_anteriores, valida,
      ...(v?.reemplazada && v.vigente_id ? { ref_de_la_vigente: `client_historical_outputs:${v.vigente_id}` } : {}),
      ...(decisionAtada ? { decision_del_dueno: decisionAtada } : {}),
      ...(avisos.length ? { aviso: avisos.join(' · ') } : {}),
    }))
    if (veredicto || cambios) {
      const contenido = [veredicto && `Veredicto: ${veredicto}`, cambios && `Cambios del aprobador: ${cambios}`].filter(Boolean).join(' · ')
      decisiones.push(linea(ctx, {
        ref: `${ref}#decision`, estante: 'E7', clase: 'decision_del_aprobador', titulo: `Decisión sobre ${texto(f.title) ?? tipo}`, que_es: recorte(contenido, 300), contenido,
        origen: 'dueno', estado: 'dicho_por_dueno', fecha: iso(f.updated_at) ?? iso(f.created_at), plazo: 'sin_plazo', peso: pesoDeTexto(contenido),
        ...(delVeredicto ? { decision: delVeredicto } : {}), de_la_cosa: ref, version_decidida: v?.version ?? null,
      }))
    }
  }
  const estadoTrabajos: EstadoDeFuente = cola.error ? { estado: 'error_de_lectura', n: lineas.length, detalle: `la cola de revisión no se pudo leer: ${cola.error}` } : estadoDeFuente(lineas.length)
  return { fuentes: { trabajos_hechos: estadoTrabajos, decisiones_del_aprobador: estadoDeFuente(decisiones.length) }, lineas: [...lineas, ...decisiones], lecturas: 2, fallidas: cola.error ? 1 : 0 }
}

// ── decisiones resueltas en la cola de revisión humana ────────────────────────────────
export async function leerDecisionesDeLaCola(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'hitl_queue', columnas: ['id', 'type', 'status', 'output_id', 'decision', 'resolution_notes', 'resolved_at', 'created_at'], donde: { client_id: ctx.cliente } })
  if (r.error) return fallo(['decisiones_del_aprobador'], r.error)
  const lineas = r.filas.filter((f) => DECISION_DE_LA_COLA[String(f.status)]).map((f) => {
    const dec = objeto(f.decision)
    const contenido = [`${texto(f.type) ?? 'revisión'} · ${f.status}`, Object.keys(dec).length ? JSON.stringify(dec) : null, texto(f.resolution_notes)].filter(Boolean).join(' · ')
    const salida = f.output_id === null || f.output_id === undefined || String(f.output_id) === '' ? null : String(f.output_id)
    return linea(ctx, {
      ref: `hitl_queue:${f.id}`, estante: 'E7', clase: 'decision_del_aprobador', titulo: `Decisión · ${texto(f.type) ?? 'revisión'} · ${f.status}`, que_es: recorte(contenido, 300), contenido,
      origen: 'dueno', estado: 'dicho_por_dueno', fecha: iso(f.resolved_at) ?? iso(f.created_at), plazo: 'sin_plazo', peso: pesoDeTexto(contenido),
      decision: DECISION_DE_LA_COLA[String(f.status)], ...(salida ? { de_la_cosa: `client_historical_outputs:${salida}` } : {}),
    })
  })
  return exito({ decisiones_del_aprobador: estadoDeFuente(lineas.length) }, lineas)
}

// ── trozos del cerebro de fuentes que ningún lector lista ─────────────────────────────
/** fuentes que la lista YA cubre con sus propias líneas: sus trozos no se duplican */
const FUENTES_CUBIERTAS = new Set(['client_brand_books', 'client_icp_documents', 'client_competitive_landscape', 'client_web_pages', 'client_historical_outputs'])

export async function leerTrozosSinLector(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, { tabla: 'client_brain_chunks', columnas: ['id', 'source_table', 'source_id', 'section_label', 'chunk_text', 'created_at'], donde: { client_id: ctx.cliente } })
  if (r.error) return fallo(['trozos_sin_lector'], r.error)
  const lineas = r.filas.filter((f) => !FUENTES_CUBIERTAS.has(String(f.source_table))).map((f) => linea(ctx, {
    ref: `client_brain_chunks:${f.id}`, estante: 'E1', clase: 'trozo', titulo: `${texto(f.source_table) ?? 'fuente'} · ${texto(f.section_label) ?? 'sección'}`,
    que_es: recorte(texto(f.chunk_text) ?? ''), origen: 'producido', estado: 'inferido', fecha: iso(f.created_at), plazo: 'sin_plazo', peso: pesoDeTexto(texto(f.chunk_text)),
  }))
  return exito({ trozos_sin_lector: estadoDeFuente(lineas.length) }, lineas)
}

// ── fichas del cerebro (`cerebro_fichas`) · la fuente nueva del paso 3 ───────────────────────────────
const ORIGEN_DE_LA_FICHA: Record<string, { origen: Origen; estado: Estado }> = {
  dueno: { origen: 'dueno', estado: 'dicho_por_dueno' },
  su_fuente: { origen: 'su_fuente', estado: 'visto_en_su_fuente' },
  plataforma: { origen: 'plataforma', estado: 'medido' },
  tercero: { origen: 'tercero', estado: 'de_tercero' },
}
const DIA_EN_MS = 86_400_000

/**
 * Lo VIGENTE de `cerebro_fichas`, con el mismo formato de línea y de referencia que las demás fuentes (`cerebro_fichas:<id>`).
 *  · quien lo afirmó sale del ORIGEN de la ficha; propiedad ajena = sobre terceros; propiedad incierta = `propiedad_incierta`;
 *  · vigencia: la fecha EXPLÍCITA del material si la hay; si no, el plazo (de la lista de plazos) contado desde la última reconfirmación; un plazo que no está en la lista = sin plazo;
 *  · versiones: la ficha que reemplaza a otra (`version_de`) manda; la vieja queda marcada como reemplazada y apunta a la vigente;
 *  · lo RETIRADO se muestra con su marca y su motivo (no se oculta ni vence); lo DESCARTADO y lo de PRUEBA no existen para la lista.
 */
export async function leerFichas(ctx: Contexto): Promise<Salida> {
  const r = await leer(ctx, {
    tabla: 'cerebro_fichas',
    columnas: ['id', 'clase', 'titulo', 'que_es', 'contenido', 'archivo_nombre', 'archivo_tipo', 'archivo_enlace', 'archivo_bytes', 'origen', 'fecha_fuente', 'reconfirmado_en', 'plazo', 'vigente_hasta', 'version_de', 'retirada_en', 'motivo_retirada', 'producto', 'sede', 'propiedad', 'residual', 'creado_en', 'prueba', 'descartada'],
    donde: { client_id: ctx.cliente },
  })
  if (r.error) return fallo(['fichas'], r.error)
  const filas = r.filas.filter((f) => f.prueba !== true && f.descartada !== true).sort((a, b) => (String(iso(a.creado_en)) < String(iso(b.creado_en)) ? -1 : 1))
  const porId = new Map(filas.map((f) => [String(f.id), f]))
  const hijoDe = new Map<string, string>()
  for (const f of filas) if (f.version_de !== null && f.version_de !== undefined && porId.has(String(f.version_de))) hijoDe.set(String(f.version_de), String(f.id))
  const profundidad = (id: string): number => {
    let n = 1
    const visto = new Set([id])
    for (let padre = porId.get(id)?.version_de; padre !== null && padre !== undefined && porId.has(String(padre)) && !visto.has(String(padre)); padre = porId.get(String(padre))?.version_de) { visto.add(String(padre)); n++ }
    return n
  }
  const hoja = (id: string): string => {
    const visto = new Set([id])
    let actual = id
    while (hijoDe.has(actual) && !visto.has(hijoDe.get(actual) as string)) { actual = hijoDe.get(actual) as string; visto.add(actual) }
    return actual
  }
  const t0 = ctx.ahora.getTime()
  const lineas = filas.map((f): Ficha => {
    const id = String(f.id)
    const mapa = ORIGEN_DE_LA_FICHA[String(f.origen)] ?? ORIGEN_DE_LA_FICHA.su_fuente
    const contenido = texto(f.contenido)
    const archivo = texto(f.archivo_nombre) ? ` · archivo ${texto(f.archivo_tipo) ?? 'sin tipo'} «${texto(f.archivo_nombre)}»${typeof f.archivo_bytes === 'number' || (typeof f.archivo_bytes === 'string' && f.archivo_bytes) ? ` (${f.archivo_bytes} bytes)` : ''}` : ''
    const base = iso(f.reconfirmado_en) ?? iso(f.fecha_fuente) ?? iso(f.creado_en)
    const plazoClase: ClaseDePlazo = typeof f.plazo === 'string' && Object.prototype.hasOwnProperty.call(ctx.plazos, f.plazo) ? (f.plazo as ClaseDePlazo) : 'sin_plazo'
    const explicita = iso(f.vigente_hasta)
    const retirada = iso(f.retirada_en)
    const avisos: string[] = []
    let vig: { vigente_hasta: string | null; vencido: boolean }
    if (retirada) {
      vig = { vigente_hasta: null, vencido: false }
      avisos.push(`RETIRADA desde ${retirada.slice(0, 10)}${texto(f.motivo_retirada) ? ` · ${texto(f.motivo_retirada)}` : ''}`)
    } else if (explicita) {
      const vencido = new Date(explicita).getTime() < t0
      vig = { vigente_hasta: explicita, vencido }
      if (vencido) avisos.push(`VENCIDO desde ${explicita.slice(0, 10)} · fecha del propio material · verifícalo antes de afirmarlo`)
    } else {
      const v = vigenciaDe(base, ctx.plazos[plazoClase], ctx.ahora)
      vig = { vigente_hasta: v.vigente_hasta, vencido: v.vencido }
      if (v.aviso) avisos.push(v.aviso)
    }
    if (f.residual === true) avisos.push('SIN CLASIFICAR · archivado tal cual, sin juicio sobre qué es')
    const reemplazada = hijoDe.has(id)
    const producto = Array.isArray(f.producto) ? (f.producto as unknown[]).filter((p): p is string => typeof p === 'string') : null
    const salida: Ficha = {
      ref: `cerebro_fichas:${id}`, estante: 'E8', clase: texto(f.clase) ?? 'ficha', titulo: texto(f.titulo) ?? texto(f.clase) ?? 'Ficha',
      que_es: `${recorte(texto(f.que_es) ?? texto(f.titulo) ?? 'ficha del cerebro', 200)}${archivo}`,
      origen: mapa.origen, estado: f.propiedad === 'incierta' ? 'propiedad_incierta' : mapa.estado, fecha_fuente: iso(f.fecha_fuente) ?? iso(f.creado_en),
      vigente_hasta: vig.vigente_hasta, vencido: vig.vencido, peso_estimado: pesoDeTexto(contenido ?? `${texto(f.titulo) ?? ''} ${texto(f.que_es) ?? ''}${archivo}`),
      version: profundidad(id), vigente: !reemplazada, reemplazada, versiones_anteriores: reemplazada ? 0 : profundidad(id) - 1,
    }
    if (reemplazada) salida.ref_de_la_vigente = `cerebro_fichas:${hoja(id)}`
    if (avisos.length) salida.aviso = avisos.join(' · ')
    if (f.propiedad === 'ajena') salida.sobre_terceros = true
    if (producto && producto.length) salida.producto = producto
    if (texto(f.sede)) salida.sede = texto(f.sede)
    if (texto(f.archivo_enlace)) salida.enlace = texto(f.archivo_enlace)
    return salida
  })
  return exito({ fichas: estadoDeFuente(lineas.length) }, lineas)
}
