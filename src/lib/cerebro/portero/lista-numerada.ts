/**
 * LA LISTA QUE VE EL PORTERO · una línea por cosa, numerada, en el formato «D» del diseño del tramo 2.
 *
 * No incluye lo FIJO (el manual vigente y las correcciones del aprobador ya se entregan siempre), ni lo REEMPLAZADO
 * (la versión vigente dice cuántas anteriores tiene), ni lo que el proceso YA entrega por su cuenta (`ya_trae`).
 * Es lectura pura: no decide nada por tipo de trabajo ni por rubro; el portero razona sobre ESTA lista completa.
 */
import { createHash } from 'node:crypto'
import { loFijo } from '../conversacion'
import { type DecisionDelDueno, type Ficha, type ListaCorta, NOMBRES_DE_FUENTE, type NombreDeFuente } from '../tipos'

/** a qué fuente pertenece cada clase de línea (para que `ya_trae` pueda nombrar una fuente entera o una clase) */
export const FUENTE_DE_CLASE: Record<string, NombreDeFuente> = {
  ficha_del_cliente: 'ficha_del_cliente', dato_inferido: 'ficha_del_cliente',
  manual: 'manual', perfil_cliente_ideal: 'perfil_cliente_ideal',
  competidor: 'competencia', resumen_de_competencia: 'competencia',
  sitio: 'sitio', catalogo_item: 'productos', catalogo_familia: 'productos',
  sede: 'sedes', dato_de_sede: 'datos_de_sede',
  foto: 'fotos', portada_de_video: 'fotos', logo: 'fotos',
  plan: 'trabajos_hechos', parte_de_trabajo: 'trabajos_hechos', pieza: 'trabajos_hechos', trabajo_hecho: 'trabajos_hechos',
  decision_del_aprobador: 'decisiones_del_aprobador', trozo: 'trozos_sin_lector',
}

/** a qué fuente pertenece una línea: las fichas del cerebro tienen clase LIBRE, así que se reconocen por su referencia */
export const fuenteDeLaLinea = (f: Ficha): string => (f.ref.startsWith('cerebro_fichas:') ? 'fichas' : FUENTE_DE_CLASE[f.clase] ?? '')

export interface LineaNumerada { numero: number; ficha: Ficha }
export interface ListaNumerada {
  lineas: LineaNumerada[]
  /** una línea de texto por cosa, lista para el modelo */
  texto: string
  /** identifica ESTA lista: si cambia algo, cambia; sirve para que un número no signifique otra cosa más tarde */
  huella: string
  /** lo que se entrega siempre y por eso no se lista */
  fijo: Ficha[]
  /** nombres de `ya_trae` que no son ni una fuente ni una clase conocida: se REPORTAN, no se ignoran en silencio */
  ya_trae_desconocido: string[]
}

const una = (t: string): string => t.replace(/\s+/g, ' ').trim()
const recorte = (t: string, n: number): string => (t.length > n ? t.slice(0, n) + '…' : t)
const dia = (iso: string | null): string => (iso ? iso.slice(0, 10) : 'sin fecha')

const NOMBRE_DE_DECISION: Record<DecisionDelDueno, string> = { aprobada: 'aprobada', rechazada: 'rechazada', cambio_pedido: 'cambio pedido' }

/** `#n estante clase · título · qué es (100) [· producto] · estado · fecha · vigencia [· versión] · peso N` */
export function lineaParaElModelo(n: number, f: Ficha): string {
  const partes = [`${f.estante} ${f.clase}`, una(f.titulo), recorte(una(f.que_es), 100)]
  if (f.producto && f.producto.length) partes.push(`producto: ${f.producto.map(una).join(', ')}`)
  if (f.que_muestra) partes.push(`muestra: ${recorte(una(f.que_muestra), 100)}`)
  partes.push(f.estado, dia(f.fecha_fuente))
  partes.push(f.vencido ? `VENCIDO desde ${dia(f.vigente_hasta)}` : f.vigente_hasta ? `vigente hasta ${dia(f.vigente_hasta)}` : 'sin plazo')
  if (f.version !== undefined) partes.push(`v${f.version}${f.vigente ? ' vigente' : ''}`)
  if (f.versiones_anteriores && f.versiones_anteriores > 0) partes.push(`+${f.versiones_anteriores} versiones anteriores`)
  // la decisión del dueño viaja SIEMPRE junto a la cosa y a su versión
  if (f.decision_del_dueno) partes.push(`decisión del dueño: ${NOMBRE_DE_DECISION[f.decision_del_dueno.decision]}${f.decision_del_dueno.version !== null ? ` (v${f.decision_del_dueno.version})` : ''}`)
  if (f.decision && f.de_la_cosa) partes.push(`${NOMBRE_DE_DECISION[f.decision]} sobre ${f.version_decidida != null ? `la v${f.version_decidida} de ` : ''}${f.de_la_cosa}`)
  partes.push(`peso ${f.peso_estimado}`)
  return `#${n} ${partes.join(' · ')}`
}

export function numerarLista(lista: ListaCorta, opciones: { ya_trae?: string[] } = {}): ListaNumerada {
  const conocidos = new Set<string>([...NOMBRES_DE_FUENTE, ...Object.keys(FUENTE_DE_CLASE)])
  const pedidos = (opciones.ya_trae ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean)
  const desconocidos = [...new Set(pedidos.filter((x) => !conocidos.has(x)))]
  const quitar = new Set(pedidos)
  const fijo = loFijo(lista)
  const fijas = new Set(fijo.map((f) => f.ref))
  const visibles = lista.lineas.filter((f) => !fijas.has(f.ref) && f.reemplazada !== true && !quitar.has(f.clase) && !quitar.has(fuenteDeLaLinea(f)))
  const lineas = visibles.map((ficha, i) => ({ numero: i + 1, ficha }))
  const huella = createHash('sha256').update(JSON.stringify(lineas.map((l) => [l.ficha.ref, l.ficha.peso_estimado, l.ficha.vencido]))).digest('hex').slice(0, 16)
  return { lineas, texto: lineas.map((l) => lineaParaElModelo(l.numero, l.ficha)).join('\n'), huella, fijo, ya_trae_desconocido: desconocidos }
}
