/**
 * LA CONSULTA POR ESPECIALISTA (etapa 5) · `GET /api/brain/consultar?client_id&clase=aprendizaje_del_dueno&destinatario=…&formato=…&tarea=<texto>&limite=10`
 * Junta cliente + su industria + general, por parecido semántico con la tarea; entrega 5-10 notas ordenadas especificidad → peso → fecha, cada una con su procedencia, y marca `ultima_vez_usada`.
 *  · si dos notas se contradicen (mismo tema, dirección contraria) entrega solo la ganadora (más específica, luego más nueva) y dice cuáles descartó;
 *  · sin modelo de huellas cae a parecido por palabras y lo DICE (`modo_de_busqueda`); sin nada: `sin_dato` (no inventa);
 *  · la jefatura y la segunda mirada GPT NO pueden leerla (`consultantes_excluidos`); US$ 0 (solo la huella de la tarea, ~US$ 0,00002).
 */
import type { Db } from '../alimentar'
import type { Respuesta } from '../rutas'
import { palabrasDelTema } from '../dueno'
import { gana, mismoTema, sealcanzan, type Nota } from './consolidar'
import { esConsultanteExcluido, espaciosDeLectura, ESPECIFICIDAD, parametrosDelEntorno, rubroNormal, slugNormal, type ParametrosDeAprendizaje } from './datos'
import { notaDeFicha } from './procesar'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const obj = (v: unknown): Fila => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Fila) : {})
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

export interface DepsDeConsultarAprendizaje {
  db: Db
  /** huella de la tarea; ausente o fallida = búsqueda por palabras */
  embeberTarea?: (texto: string) => Promise<{ ok: true; embedding: number[] } | { ok: false; detalle: string }>
  ahora?: () => Date
  parametros?: ParametrosDeAprendizaje
}
export interface ParametrosDeConsultaAprendizaje { client_id?: string | null; oficina?: string | null; agente?: string | null; destinatario?: string | null; formato?: string | null; tarea?: string | null; limite?: number | string | null; marcar_uso?: boolean }

const parecidoPorPalabras = (tarea: string, texto: string): number => {
  const a = palabrasDelTema(tarea), b = palabrasDelTema(texto)
  if (!a.length || !b.length) return 0
  return b.filter((x) => a.includes(x)).length / Math.min(a.length, b.length)
}

export async function consultarAprendizaje(deps: DepsDeConsultarAprendizaje, q: ParametrosDeConsultaAprendizaje): Promise<Respuesta> {
  const p = deps.parametros ?? parametrosDelEntorno()
  const ahora = (deps.ahora ?? (() => new Date()))()
  const clientId = txt(q.client_id)
  if (!UUID.test(clientId)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const oficina = txt(q.oficina).slice(0, 80) || 'sin_nombre', agente = txt(q.agente).slice(0, 80) || 'sin_nombre'
  if (esConsultanteExcluido(oficina, agente, p)) return err(403, 'consultante_excluido', 'la jefatura y la segunda mirada GPT no leen el aprendizaje del dueño (vara dura / criterio independiente)')
  const tarea = txt(q.tarea).slice(0, 1500)
  if (!tarea) return err(400, 'entrada_invalida', '`tarea` es obligatoria: el texto de lo que se va a producir (se busca por parecido con ella)')
  const destinatario = txt(q.destinatario).toLowerCase() || null, formato = slugNormal(q.formato) || null
  const pedido = Number(q.limite)
  const limite = Number.isFinite(pedido) && pedido >= 1 ? Math.min(p.limite_maximo, Math.floor(pedido)) : p.limite_por_omision

  const cl = await deps.db.from('clients').select('id, industry').eq('id', clientId).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  const cliente = lista(cl.data)[0]
  if (!cliente) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const rubro = rubroNormal(cliente.industry)
  const espacios = espaciosDeLectura(clientId, cliente.industry)

  // 1 · candidatas: del índice por parecido con la tarea (huella) o, sin huella, por palabras
  const parecido = new Map<string, number>()
  let modo: 'huellas' | 'palabras' = 'palabras', motivoDelRespaldo: string | null = null
  if (deps.embeberTarea) {
    const e = await deps.embeberTarea(tarea).catch((x: unknown) => ({ ok: false as const, detalle: x instanceof Error ? x.message : String(x) }))
    if (e.ok) {
      const r = await (deps.db as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc('buscar_aprendizaje_del_dueno', { p_espacios: espacios, p_embedding: JSON.stringify(e.embedding), p_destinatario: destinatario, p_top_k: 40 })
      if (r.error) motivoDelRespaldo = `búsqueda por huellas: ${r.error.message}`
      else { modo = 'huellas'; for (const f of lista(r.data)) parecido.set(String(f.ficha_id), Number(f.similitud) || 0) }
    } else motivoDelRespaldo = `huella de la tarea: ${e.detalle}`
  } else motivoDelRespaldo = 'sin modelo de huellas en este entorno'

  const fi = await deps.db.from('cerebro_fichas').select('id, client_id, que_es, contenido, observado_en, creado_en, alcance, provenance_tag').eq('clase', 'aprendizaje_del_dueno').in('client_id', espacios).is('retirada_en', null).eq('descartada', false).limit(1000)
  if (fi.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${fi.error.message}`)
  let filas = lista(fi.data)
  if (modo === 'palabras') for (const f of filas) parecido.set(String(f.id), parecidoPorPalabras(tarea, `${txt(f.que_es)} ${txt(obj(obj(f.provenance_tag).datos).atributo)}`))
  filas = filas.filter((f) => (parecido.get(String(f.id)) ?? 0) >= (modo === 'huellas' ? p.similitud_minima : 0.34) && (parecido.has(String(f.id))))

  const notas = filas.map((f) => ({ f, n: notaDeFicha(f) })).filter((x): x is { f: Fila; n: Nota } => !!x.n)
    .filter(({ n }) => (!destinatario || n.destinatario === destinatario) && (!formato || !n.formato || n.formato === formato))

  // 2 · choques: si dos notas se contradicen, queda la ganadora
  const fuera = new Map<string, string>()
  for (let i = 0; i < notas.length; i++) for (let j = i + 1; j < notas.length; j++) {
    const a = notas[i].n, b = notas[j].n
    if (fuera.has(a.id) || fuera.has(b.id)) continue
    if (a.destinatario !== b.destinatario || a.atributo !== b.atributo || a.direccion === b.direccion || !(mismoTema(a.sobre, b.sobre, p.parecido_minimo) || mismoTema(a.idea, b.idea, p.parecido_minimo)) || !sealcanzan(a, b)) continue
    const g = gana(a, b)
    fuera.set(g.id === a.id ? b.id : a.id, g.id)
  }
  const validas = notas.filter(({ n }) => !fuera.has(n.id))

  // 3 · orden: especificidad → peso → fecha
  validas.sort((x, y) => (ESPECIFICIDAD[y.n.alcance] + (y.n.formato ? 0.5 : 0)) - (ESPECIFICIDAD[x.n.alcance] + (x.n.formato ? 0.5 : 0)) || y.n.peso - x.n.peso || Date.parse(y.n.creada) - Date.parse(x.n.creada) || x.n.id.localeCompare(y.n.id))
  // una nota menos específica que repite lo que ya dice una más específica elegida no se entrega (el especialista no lee dos veces lo mismo)
  const elegidas: typeof validas = []
  for (const x of validas) {
    if (elegidas.length >= limite) break
    const repetida = elegidas.some(({ n: c }) => c.destinatario === x.n.destinatario && c.atributo === x.n.atributo && c.direccion === x.n.direccion && (mismoTema(c.sobre, x.n.sobre, p.parecido_minimo) || mismoTema(c.idea, x.n.idea, p.parecido_minimo)))
    if (!repetida) elegidas.push(x)
  }

  const notasDeSalida = elegidas.map(({ f, n }) => {
    const d = obj(obj(f.provenance_tag).datos)
    return {
      ficha_id: n.id, nota: n.idea, direccion: n.direccion, destinatario: n.destinatario, atributo: n.atributo, alcance: n.alcance, espacio: n.espacio, formato: n.formato, peso: n.peso, fecha: n.creada,
      parecido_con_la_tarea: Math.round((parecido.get(n.id) ?? 0) * 1000) / 1000, ...(n.choca_con.length ? { choca_con: n.choca_con } : {}),
      procedencia: { origen: 'dueno', canal: txt(obj(f.provenance_tag).canal) || null, respaldo_en: txt(d.respaldo_en) || null, mensaje_ref: txt(d.mensaje_ref) || null, respondido_en: txt(d.respondido_en) || null, cita: txt(d.cita) || null, tema: txt(d.tema) || null },
    }
  })

  // 4 · marca de uso (lo no usado pierde peso al consolidar)
  let marcadas = 0
  if (q.marcar_uso !== false) for (const { f, n } of elegidas) {
    const pt = obj(f.provenance_tag), d = obj(pt.datos)
    const w = await deps.db.from('cerebro_fichas').update({ provenance_tag: { ...pt, datos: { ...d, ultima_vez_usada: ahora.toISOString(), usos: (Number(d.usos) || 0) + 1 } } }).eq('id', n.id)
    if (!w.error) marcadas++
  }
  return {
    status: 200,
    body: {
      ok: true, clase: 'aprendizaje_del_dueno', client_id: clientId, consultado_por: { oficina, agente }, destinatario, formato, rubro: rubro || null, espacios_leidos: espacios,
      sin_dato: notasDeSalida.length === 0, total: notasDeSalida.length, notas: notasDeSalida, modo_de_busqueda: modo, ...(motivoDelRespaldo ? { aviso_de_busqueda: motivoDelRespaldo } : {}),
      descartadas_por_choque: [...fuera].map(([perdio, gano]) => ({ ficha_id: perdio, gano })), marcadas_como_usadas: marcadas, modelos_llamados: 0,
      ...(notasDeSalida.length === 0 ? { nota: 'el cerebro no tiene aprendizaje del dueño que venga al caso: no se inventa; produce con el criterio de la mesa' } : {}),
    },
  }
}
