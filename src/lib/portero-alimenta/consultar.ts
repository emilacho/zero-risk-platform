/**
 * LECTURA INSTANTÁNEA DEL CEREBRO · «qué sabe el cerebro de X sobre este cliente» (21-oct · firma de Emilio: «todas las oficinas pueden ir a pedir info al cerebro … que la gestión sea inmediata»).
 * GET /api/brain/consultar?client_id=&oficina=&agente=&que=<texto libre o atributo/clase>&atributo=&clase=&sede_clave=&limite=
 *  · SIN modelo y SIN Apify: US$ 0, una lectura de las fichas vigentes del cliente (≈ 1–2 s). Sin lista fija de temas: por atributo/clase (exacto o por prefijo) y por palabras.
 *  · Cada resultado trae su PROCEDENCIA (origen, fuente, quién la confirmó), su fecha y si está VENCIDA (se devuelve igual, rotulada: la oficina decide). Si no hay nada: `sin_dato: true` (no inventa).
 *  · Registra quién consultó (oficina, agente) en `cerebro_consultas`, sin gasto. Si ese registro falla se dice (`registrada: false`) y la consulta igual responde.
 *  · Orden que propone el cerebro a cualquier oficina: 1) esta lectura; 2) si no alcanza, el pedido (`/alimentar/pedido`), que AVISA cuando está (`avisar_a`).
 * Solo lectura: nunca escribe fichas.
 */
import type { Db } from './alimentar'
import { candidatasPorPalabras, fichasPorAtributo, type FichaCandidata } from './pedidos'
import { leerTodas } from './paginar'
import { nivelDeFicha, ordenarPorEmbudo } from './embudo'
import { adjuntoDelCliente } from './contexto-del-cliente'
import type { Respuesta } from './rutas'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const objeto = (v: unknown): Fila => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Fila) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const LIMITE_POR_OMISION = 10
export const LIMITE_MAXIMO = 50
export const LARGO_DEL_CONTENIDO = 700
/** 02-nov · «material completo»: con `todo` se entrega TODO lo que haya, por páginas de este tamaño (`desde` + `siguiente_desde`); el corte siempre se DECLARA */
export const PAGINA_DE_TODO_POR_OMISION = 300
export const PAGINA_DE_TODO_MAXIMA = 500

export interface DepsDeConsultar { db: Db; ahora?: Date; reloj?: () => number }
export interface ParametrosDeConsulta { client_id?: string | null; oficina?: string | null; agente?: string | null; que?: string | null; atributo?: string | null; clase?: string | null; sede_clave?: string | null; limite?: number | string | null
  /** 02-nov · true/«1»: sin tope chico; entrega todo lo que haya (por páginas) */
  todo?: boolean | string | null
  /** 02-nov · desde qué posición seguir (páginas de `todo`) */
  desde?: number | string | null
  /** 02-nov · true/«1»: el contenido entero, sin el recorte de ${LARGO_DEL_CONTENIDO} caracteres */
  contenido_completo?: boolean | string | null }
const esSi = (v: unknown): boolean => v === true || ['1', 'true', 'si', 'sí'].includes(String(v ?? '').trim().toLowerCase())

/** las sedes de una ficha: su columna `sede` (claves separadas por coma) o, si no, las de su rastro; vacío = vale para todas */
function sedesDe(f: Fila): string[] {
  const col = txt(f.sede)
  if (col) return col.split(',').map((s) => s.trim()).filter(Boolean)
  const d = objeto(objeto(f.provenance_tag).datos)
  return Array.isArray(d.sedes) ? (d.sedes as unknown[]).map((s) => txt(s)).filter(Boolean) : []
}

function procedenciaDe(f: Fila): Fila {
  const pt = objeto(f.provenance_tag)
  const d = objeto(pt.datos)
  const sel = (o: Fila, ks: string[]): Fila => Object.fromEntries(ks.filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '').map((k) => [k, o[k]]))
  return { origen: txt(f.origen) || null, propiedad: txt(f.propiedad) || null, porque: txt(f.porque) || null, ...sel(pt, ['source', 'trust_level', 'confirmado_por', 'canal', 'ingress_route']), ...sel(d, ['canal', 'respondido_en', 'mensaje_ref', 'apify_function', 'url', 'fuente']) }
}

export async function rutaConsultar(deps: DepsDeConsultar, p: ParametrosDeConsulta): Promise<Respuesta> {
  const t0 = (deps.reloj ?? Date.now)()
  const clientId = txt(p.client_id)
  if (!UUID.test(clientId)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const oficina = txt(p.oficina).slice(0, 80), agente = txt(p.agente).slice(0, 80)
  if (!oficina || !agente) return err(400, 'entrada_invalida', '`oficina` y `agente` son obligatorios: se registra quién consulta (no hay lista de autorizados)')
  const que = txt(p.que).slice(0, 400), atributo = txt(p.atributo).slice(0, 160), clase = txt(p.clase).slice(0, 80), sede = txt(p.sede_clave)
  if (!que && !atributo && !clase) return err(400, 'entrada_invalida', 'pasa `que` (texto libre), `atributo` o `clase`: algo que buscar')
  const pedido = Number(p.limite)
  const todo = esSi(p.todo), contenidoCompleto = esSi(p.contenido_completo)
  const limite = todo
    ? (Number.isFinite(pedido) && pedido >= 1 ? Math.min(PAGINA_DE_TODO_MAXIMA, Math.floor(pedido)) : PAGINA_DE_TODO_POR_OMISION)
    : (Number.isFinite(pedido) && pedido >= 1 ? Math.min(LIMITE_MAXIMO, Math.floor(pedido)) : LIMITE_POR_OMISION)
  const dd = Number(p.desde)
  const desde = Number.isFinite(dd) && dd >= 0 ? Math.floor(dd) : 0
  const ahora = deps.ahora ?? new Date()

  const cl = await deps.db.from('clients').select('id').eq('id', clientId).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  if (!lista(cl.data).length) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const fi = await leerTodas(() => deps.db.from('cerebro_fichas').select('id, ref, clase, atributo, titulo, que_es, contenido, observado_en, fecha_fuente, reconfirmado_en, vigente_hasta, alcance, sede, origen, propiedad, porque, provenance_tag, descartada, retirada_en').eq('client_id', clientId).is('retirada_en', null).order('id', { ascending: true }))
  if (fi.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${fi.error.message}`)
  // 31-oct · el resumen vivo y los informes de la mesa NO se mezclan con los resultados: viajan SIEMPRE aparte, en `contexto_del_cliente`
  const contexto = await adjuntoDelCliente(deps.db, clientId, ahora)
  // el resumen vivo es un derivado de las demás fichas (las junta todas en un texto): contestaría a todo y taparía la ficha concreta; solo se entrega si se pide su clase
  let filas = fi.data.filter((f) => f.descartada !== true && (clase === 'resumen_vivo' || txt(f.clase) !== 'resumen_vivo') && (clase === 'informe_de_analisis' || txt(f.clase) !== 'informe_de_analisis') && txt(f.clase) !== 'aprendizaje_del_dueno')
  if (sede) filas = filas.filter((f) => { const s = sedesDe(f); return !s.length || s.includes(sede) })
  const porId = new Map<string, Fila>(filas.map((f) => [String(f.id), f]))
  const cands: FichaCandidata[] = filas.map((f) => ({ id: String(f.id), ref: txt(f.ref), clase: txt(f.clase), atributo: txt(f.atributo), titulo: txt(f.titulo), contenido: txt(f.contenido) || txt(f.que_es), observado_en: f.observado_en ? String(f.observado_en) : null, vigente_hasta: f.vigente_hasta ? String(f.vigente_hasta) : null, alcance: f.alcance ? String(f.alcance) : null }))

  // 1 · por atributo o clase (exacto o por prefijo), sea que vengan como parámetro o que `que` sea una clave; 2 · por palabras
  const elegidas: FichaCandidata[] = []
  const ya = new Set<string>()
  const sumar = (xs: FichaCandidata[]) => { for (const x of xs) if (!ya.has(x.id)) { ya.add(x.id); elegidas.push(x) } }
  // `clase` admite varias separadas por coma (02-nov: la mesa pide opiniones = comentarios, reseñas y menciones en una sola consulta)
  if (atributo || clase) { const clases = clase.split(',').map((x) => x.trim()).filter(Boolean); if (clases.length > 1) { for (const c of clases) sumar(fichasPorAtributo({ tipo: atributo || undefined, fuente: c }, cands)) } else sumar(fichasPorAtributo({ tipo: atributo || undefined, fuente: clase || undefined }, cands)) }
  if (que) {
    sumar(fichasPorAtributo({ tipo: que }, cands))
    sumar(candidatasPorPalabras(que, cands, cands.length))
  }
  const vigente = (f: FichaCandidata) => !f.vigente_hasta || Date.parse(f.vigente_hasta) > ahora.getTime()
  // las frescas primero (se conserva el orden de relevancia dentro de cada grupo)
  const orden = [...elegidas.filter(vigente), ...elegidas.filter((f) => !vigente(f))]
  const porRelevancia = orden.slice(desde, desde + limite)
  // 02-nov · el corte nunca es mudo: cuántas hay, cuántas van y desde dónde seguir
  const totalEncontradas = orden.length
  const siguienteDesde = desde + porRelevancia.length < totalEncontradas ? desde + porRelevancia.length : null
  // 01-nov · el embudo en todo: lo propio primero y luego global → país → competencia → directa; dentro de cada nivel se conserva el orden de relevancia (una ficha no trae cifra de gusto)
  const ordenadas = ordenarPorEmbudo(porRelevancia, (c) => ({ nivel: nivelDeFicha(porId.get(c.id)?.alcance), gusto: null }))
  const resultados = ordenadas.map((c) => {
    const f = porId.get(c.id) as Fila
    const contenido = txt(f.contenido) || txt(f.que_es)
    return {
      ficha_id: c.id, nivel: nivelDeFicha(f.alcance), ref: c.ref, clase: c.clase, atributo: c.atributo || null, titulo: c.titulo || null,
      contenido: !contenidoCompleto && contenido.length > LARGO_DEL_CONTENIDO ? `${contenido.slice(0, LARGO_DEL_CONTENIDO)}…` : contenido,
      procedencia: procedenciaDe(f),
      fecha: f.observado_en ? String(f.observado_en) : null, fecha_de_la_fuente: f.fecha_fuente ? String(f.fecha_fuente) : null, reconfirmado_en: f.reconfirmado_en ? String(f.reconfirmado_en) : null,
      vigente_hasta: c.vigente_hasta, vencida: !vigente(c), sede: sedesDe(f).join(',') || null,
    }
  })

  const ms = Math.max(0, (deps.reloj ?? Date.now)() - t0)
  const w = await deps.db.from('cerebro_consultas').insert({ client_id: clientId, oficina, agente, que: que || null, atributo: atributo || clase || null, sede_clave: sede || null, resultados: resultados.length, sin_dato: resultados.length === 0, ms })
  const registrada = !w.error
  const sinDato = resultados.length === 0
  return {
    status: 200,
    body: {
      ok: true, client_id: clientId, consultado_por: { oficina, agente }, que: que || null, atributo: atributo || null, clase: clase || null, sede_clave: sede || null,
      sin_dato: sinDato, total: ordenadas.length, resultados,
      total_encontradas: totalEncontradas, entregadas: ordenadas.length, desde, cortada: siguienteDesde !== null, siguiente_desde: siguienteDesde,
      ...(siguienteDesde !== null ? { aviso_de_corte: `hay ${totalEncontradas} fichas y van ${desde + ordenadas.length} (de la ${desde + 1} a la ${desde + ordenadas.length}): pide la siguiente página con desde=${siguienteDesde}${todo ? '' : ' (o todo=1 para traer todo por páginas)'}` } : {}), contexto_del_cliente: contexto,
      ...(sinDato ? { nota: 'el cerebro no tiene nada vigente sobre eso: no se inventa. Si lo necesitas, pídelo con POST /api/brain/alimentar/pedido (avisar_a te avisa cuando esté) o sigue declarando «sin dato del cerebro»' } : {}),
      registrada, ...(registrada ? {} : { registro_error: w.error?.message ?? 'sin detalle' }), ms, modelos_llamados: 0, costo_usd: 0,
    },
  }
}
