/**
 * ENCARGO 16 · 21-nov · «CÓMO SE PRODUCE CON IA» SE ESCRIBE (la sección del manual firmada el 18-nov; el lado que la lee ya está en main).
 *
 * El mismo camino del manual, en pequeño: ① `preparar` (AQUÍ: el cerebro SOLO LEE) arma el pedido del agente con lo que entrega el cerebro ENTERO
 * (fotos propias con su etiqueta, oferta y fecha; hechos del negocio; referencias que sirven) y la VOZ del manual vigente;
 * ② un agente POR FLUJO (run-sdk, nunca guion directo) escribe la sección en PROSA; ③ `escribir` (en `src/lib/manual/produccion-con-ia.ts`: el cerebro no escribe por construcción) la guarda como versión nueva del manual que SOLO agrega la sección. La sección queda visible y editable en el dashboard como cualquier otra (está en el catálogo).
 *
 * Reglas firmadas: prosa, sin marcas tipo «siempre de foto real / se crea / libre» y sin lista de prohibidos; en el idioma
 * y trato que define el manual del cliente. Un cliente sin fotos propias la recibe igual, con lo que haya, y lo dice.
 * Si el cerebro falla, el paso del agente se detiene «esperando al cerebro» (ADENDA 1 del encargo 15, ya en el corredor).
 * Nada se recorta: un texto fuera de los topes se RECHAZA con su campo, su largo y el tope.
 */
import { borradorDeContentText, type Db } from '../manual/revision'
import { rolEfectivo } from '../portero-alimenta/embudo'
import { idsDeFotosRepetidas } from './portero/fotos-pendientes'

type Fila = Record<string, unknown>
export const FOTOS_EN_EL_PEDIDO = 60
export const REFERENCIAS_EN_EL_PEDIDO = 20
export const HECHOS_EN_EL_PEDIDO = 40
/** clases de fichas que son hechos del negocio para esta sección (del dueño y datos duros; nada de síntesis) */
export const CLASES_DE_HECHOS = ['dato_del_dueno', 'aprendizaje_del_dueno', 'precio', 'horario'] as const

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const cabeza = (v: unknown, n: number): string => { const s = txt(v); return s.length > n ? `${s.match(new RegExp(`^[\\s\\S]{0,${n}}`))?.[0] ?? s}…` : s }
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

export interface InsumosDeLaSeccion {
  client_id: string
  client_name: string
  version_base: number
  /** el pedido completo para el agente (la tarea de run-sdk) */
  task: string
  fotos_propias: number
  con_oferta: number
  hechos: number
  referencias: number
  sin_fotos_propias: boolean
  ya_existe: boolean
}
export type ResultadoDePreparar = { ok: true; insumos: InsumosDeLaSeccion } | { ok: false; status: number; error: string; detalle: string }

const lineaDeFoto = (f: Fila): string => {
  const partes = [
    txt(f.que_muestra) ? `muestra: ${cabeza(f.que_muestra, 160)}` : '',
    lista(f.producto_visto).length ? `producto: ${lista(f.producto_visto).map((x) => txt(x)).filter(Boolean).join(', ')}` : '',
    txt(f.tipo_de_toma) ? `toma: ${txt(f.tipo_de_toma)}` : '',
    txt(f.formato) ? `formato: ${txt(f.formato)}` : '',
    f.con_personas === true ? 'con personas' : f.con_personas === false ? 'sin personas' : '',
    txt(f.oferta) ? `oferta: ${cabeza(f.oferta, 80)}` : '',
    txt(f.fecha_origen) || txt(f.posted_at) ? `fecha: ${(txt(f.fecha_origen) || txt(f.posted_at)).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''}` : '',
    txt(f.texto_visible) ? `texto visible: ${cabeza(f.texto_visible, 80)}` : '',
  ].filter(Boolean)
  return `- ${partes.join(' · ') || 'foto propia sin etiqueta todavía'}`
}

/** el pedido del agente, puro: con los mismos insumos sale el mismo texto */
export function armarPedidoDeLaSeccion(a: { nombre: string; voz: string; reglas: string[]; fotos: Fila[]; hechos: Fila[]; referencias: Fila[] }): string {
  const sinFotos = a.fotos.length === 0
  const partes: string[] = []
  partes.push(`Escribe la sección «Cómo se produce con IA» del manual de marca de ${a.nombre}.`)
  partes.push('')
  partes.push('FORMA (firmada por el dueño de la agencia, no negociable):')
  partes.push('- PROSA corrida, de 3 a 6 párrafos. Sin encabezados, sin listas, sin tablas.')
  partes.push('- Sin marcas tipo «siempre de foto real / se crea / libre» y sin lista de prohibidos.')
  partes.push('- En el MISMO idioma y trato que muestra la voz del manual (abajo). Si la voz tutea, tutea.')
  partes.push('- Responde SOLO con la prosa de la sección: nada antes ni después.')
  partes.push('')
  partes.push('QUÉ CUENTA la sección, para quien produzca piezas con IA para este cliente:')
  partes.push('- el registro visual del negocio y su PORQUÉ: luz, escenarios, estilo de toma, qué transmite;')
  partes.push('- qué es REAL y sale de sus fotos (productos, lugares, personas) y por eso no se inventa;')
  partes.push('- qué SÍ se puede crear o recrear con IA sin traicionar ese registro (fondos, composiciones, escenas), guiando al generador de imágenes con el estilo del cliente.')
  partes.push('')
  partes.push(`VOZ DEL MANUAL (el trato y el idioma salen de aquí):\n${cabeza(a.voz, 1200) || 'sin voz escrita todavía: usa un español neutro y cercano'}`)
  if (a.reglas.length) partes.push(`\nREGLAS DE ESCRITURA DEL MANUAL:\n${a.reglas.map((r) => `- ${cabeza(r, 200)}`).join('\n')}`)
  partes.push('')
  if (sinFotos) {
    partes.push('FOTOS PROPIAS: este cliente AÚN NO tiene fotos propias en el cerebro. Escribe la sección igual con lo que hay, y dilo en la primera frase (sin dramatizar: es un punto de partida).')
  } else {
    partes.push(`FOTOS PROPIAS DEL CLIENTE (${a.fotos.length}; lo real sale de aquí):`)
    partes.push(...a.fotos.map(lineaDeFoto))
  }
  if (a.hechos.length) {
    partes.push('')
    partes.push(`HECHOS DEL NEGOCIO (lo declarado por el dueño y los datos duros):`)
    partes.push(...a.hechos.map((h) => `- ${cabeza(h.titulo, 120)}: ${cabeza(h.contenido, 240)}`))
  }
  if (a.referencias.length) {
    partes.push('')
    partes.push(`REFERENCIAS QUE SIRVEN (material ajeno que entró como referencia; inspira, no es del cliente):`)
    partes.push(...a.referencias.map((r) => `- ${cabeza(r.que_muestra, 140) || cabeza(r.caption, 140) || 'referencia sin etiqueta'}`))
  }
  return partes.join('\n')
}

/** lee el cerebro entero para la sección y arma el pedido. Un error de lectura se devuelve (nunca «vacío»). */
export async function prepararProduccionConIa(db: Db, clientId: string, o: { reescribir?: boolean } = {}): Promise<ResultadoDePreparar> {
  const falla = (que: string, m: string): ResultadoDePreparar => ({ ok: false, status: 502, error: 'lectura_fallida', detalle: `${que}: ${m}` })
  const cl = await db.from('clients').select('id, name').eq('id', clientId).limit(1)
  if (cl.error) return falla('clients', cl.error.message)
  const cliente = lista(cl.data)[0]
  if (!cliente) return { ok: false, status: 404, error: 'cliente_inexistente', detalle: 'no existe la ficha del cliente' }

  const mb = await db.from('client_brand_books').select('id, version, content_text').eq('client_id', clientId).order('version', { ascending: false }).limit(1)
  if (mb.error) return falla('client_brand_books', mb.error.message)
  const vigente = lista(mb.data)[0]
  if (!vigente) return { ok: false, status: 409, error: 'sin_manual', detalle: 'el cliente no tiene manual: esta sección nace con el manual, no antes que él' }
  const draft = borradorDeContentText(vigente.content_text)
  if (!draft) return { ok: false, status: 409, error: 'manual_ilegible', detalle: 'el manual vigente no trae `brand_book_draft` legible; no se adivina' }
  const ya_existe = txt(draft.produccion_con_ia) !== ''
  if (ya_existe && o.reescribir !== true) return { ok: false, status: 409, error: 'ya_existe', detalle: 'el manual vigente ya trae «Cómo se produce con IA»; para reescribirla, pide `reescribir: true`' }

  const fo = await db.from('client_social_images').select('id, owner_role, papel, estado, tipo, que_muestra, producto_visto, texto_visible, tipo_de_toma, formato, con_personas, oferta, fecha_origen, posted_at, created_at, caption, duplicado_de, hash_archivo, etiquetada_en').eq('client_id', clientId).eq('estado', 'ok').order('posted_at', { ascending: false }).limit(1000)
  if (fo.error) return falla('client_social_images', fo.error.message)
  const filas = lista(fo.data)
  const repetidas = idsDeFotosRepetidas(filas)
  const limpias = filas.filter((f) => !txt(f.duplicado_de) && !repetidas.has(String(f.id)))
  const propias = limpias.filter((f) => rolEfectivo(f) === 'propio').filter((_f, i) => i < FOTOS_EN_EL_PEDIDO)
  const referencias = limpias.filter((f) => rolEfectivo(f) === 'referencia' && (txt(f.que_muestra) || txt(f.caption))).filter((_f, i) => i < REFERENCIAS_EN_EL_PEDIDO)

  const fi = await db.from('cerebro_fichas').select('id, clase, titulo, contenido, vigente_hasta, descartada').eq('client_id', clientId).is('retirada_en', null).in('clase', [...CLASES_DE_HECHOS]).limit(500)
  if (fi.error) return falla('cerebro_fichas', fi.error.message)
  const ahora = Date.now()
  const hechos = lista(fi.data)
    .filter((f) => f.descartada !== true && (!txt(f.vigente_hasta) || Date.parse(txt(f.vigente_hasta)) >= ahora))
    .filter((_f, i) => i < HECHOS_EN_EL_PEDIDO)

  const reglas = Array.isArray(draft.reglas_de_escritura) ? (draft.reglas_de_escritura as unknown[]).map((x) => txt(x)).filter(Boolean) : []
  const task = armarPedidoDeLaSeccion({ nombre: txt(cliente.name) || 'el cliente', voz: txt(draft.voice_description), reglas, fotos: propias, hechos, referencias })
  return {
    ok: true,
    insumos: {
      client_id: clientId, client_name: txt(cliente.name) || 'cliente', version_base: Number(vigente.version) || 0, task,
      fotos_propias: propias.length, con_oferta: propias.filter((f) => txt(f.oferta)).length, hechos: hechos.length, referencias: referencias.length,
      sin_fotos_propias: propias.length === 0, ya_existe,
    },
  }
}
