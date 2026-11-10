/**
 * COLATERALES · tramo 2c · APLICAR y DESHACER los retoques aprobados (CC1 · certifica CC7 · PLAN tramo 2 + adenda 1).
 *
 * Lo que el código garantiza al escribir en un documento de abajo:
 *   · línea 3 de CC7 / H1 · la fila de la jefatura del destino se lee EN ESTE INSTANTE; si se apagó, el retoque queda `pendiente`;
 *   · línea 2 de CC7 · la versión vigente del destino debe ser la `version_base` del retoque; si alguien escribió después, `pendiente`
 *     (nunca se pisa lo tocado después). La escritura misma es condicional (`escribirSiSigue`): una carrera también deja `pendiente`;
 *   · el retoque va a SU pedazo (posición o ruta, motor 2a); si el pedazo ya no está igual, `pendiente`;
 *   · una versión NUEVA por documento y por edición (nunca se reescribe una versión);
 *   · deshacer = otra versión nueva con el texto de la base, y solo si nadie escribió encima de lo aplicado. Nada se borra.
 * Solo se aplican retoques `aprobado` (la jefatura ya juzgó el registro contra el manual de ese cliente, en 2d).
 * Los escritores reales de cada tabla se enchufan por el puerto `EscritorDeDocumento`. Agnóstico: ningún dato de un cliente.
 */
import type { Documento } from '../cadena/dependencias-de-documentos'
import { aplicarEnDocumento, puedeAplicarEn, type Retoque } from './motor'
import type { almacenDeColaterales } from './almacen'

export interface Vigente { texto: string; version: string }
export interface EscritorDeDocumento {
  /** la versión vigente del documento (null si no existe) */
  leerVigente(ref: string): Promise<Vigente | null>
  /** el texto de una versión concreta (para deshacer) */
  leerVersion(ref: string, version: string): Promise<string | null>
  /** escribe una versión NUEVA solo si la vigente sigue siendo `base` · devuelve la versión nueva, o null si otra se adelantó */
  escribirSiSigue(ref: string, base: string, texto: string, motivo: string): Promise<string | null>
}
export type Escritores = Partial<Record<Documento, EscritorDeDocumento>>
type Almacen = ReturnType<typeof almacenDeColaterales>

export type MotivoDePendiente = 'fila_inactiva' | 'sin_escritor' | 'documento_no_existe' | 'version_cambiada' | 'pedazo_no_encontrado'

interface FilaDeRetoque {
  id: string; estado: string; documento: Documento; documento_ref: string; version_base: string; version_resultante: string | null
  pedazo: Retoque['pedazo']; antes: string; despues: string; porque: string
}
const deFila = (f: Record<string, unknown>): FilaDeRetoque => ({
  id: String(f.id), estado: String(f.estado), documento: f.documento as Documento, documento_ref: String(f.documento_ref), version_base: String(f.version_base),
  version_resultante: (f.version_resultante as string | null) ?? null,
  pedazo: { id: String(f.pedazo_id), documento: f.documento as Documento, seccion: String(f.seccion), texto: String(f.pedazo_texto), inicio: Number(f.pedazo_inicio), ruta: (f.pedazo_ruta as string | null) ?? null },
  antes: String(f.antes ?? ''), despues: String(f.despues ?? ''), porque: String(f.porque ?? ''),
})

function agrupar<T>(xs: T[], llave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(llave(x), [...(m.get(llave(x)) ?? []), x])
  return m
}

export interface ResultadoDeAplicar {
  aplicados: { id: string; documento: Documento; version: string }[]
  pendientes: { id: string; motivo: MotivoDePendiente }[]
  /** retoques que cambiaron de estado entre la lectura y la escritura (otro proceso): no se tocaron */
  ya_cambiaron: string[]
}

/**
 * Aplica los retoques `aprobado` de una edición. `leerFilasActivas` se llama UNA vez, al empezar a aplicar (no se reutiliza el permiso del guardado).
 */
export async function aplicarAprobados(d: { almacen: Almacen; escritores: Escritores; leerFilasActivas: () => Promise<ReadonlySet<string>> }, edicion_id: string): Promise<ResultadoDeAplicar> {
  const r: ResultadoDeAplicar = { aplicados: [], pendientes: [], ya_cambiaron: [] }
  const aprobados = (await d.almacen.retoquesDe(edicion_id)).map(deFila).filter((t) => t.estado === 'aprobado')
  if (!aprobados.length) return r
  const activas = await d.leerFilasActivas()
  const aPendiente = async (ts: FilaDeRetoque[], motivo: MotivoDePendiente) => {
    for (const t of ts) {
      if (await d.almacen.pasarRetoque(t.id, 'aprobado', 'pendiente', { motivo })) r.pendientes.push({ id: t.id, motivo })
      else r.ya_cambiaron.push(t.id)
    }
  }
  for (const grupo of agrupar(aprobados, (t) => `${t.documento}\u0000${t.documento_ref}\u0000${t.version_base}`).values()) {
    const { documento, documento_ref, version_base } = grupo[0]
    if (!puedeAplicarEn(documento, activas)) { await aPendiente(grupo, 'fila_inactiva'); continue }
    const esc = d.escritores[documento]
    if (!esc) { await aPendiente(grupo, 'sin_escritor'); continue }
    const vig = await esc.leerVigente(documento_ref)
    if (!vig) { await aPendiente(grupo, 'documento_no_existe'); continue }
    if (vig.version !== version_base) { await aPendiente(grupo, 'version_cambiada'); continue }
    const porRetoque = new Map(grupo.map((t) => [t.pedazo.id, t]))
    const hecho = aplicarEnDocumento(vig.texto, grupo.map((t) => ({ pedazo: t.pedazo, antes: t.antes, despues: t.despues, porque: t.porque })))
    await aPendiente(hecho.sin_aplicar.map((x) => porRetoque.get(x.pedazo.id)!), 'pedazo_no_encontrado')
    if (!hecho.aplicados.length) continue
    const aplicadas = hecho.aplicados.map((x) => porRetoque.get(x.pedazo.id)!)
    const nueva = await esc.escribirSiSigue(documento_ref, version_base, hecho.texto, `colaterales · edición ${edicion_id} · ${aplicadas.map((t) => t.pedazo.id).join(', ')}`)
    if (nueva === null) { await aPendiente(aplicadas, 'version_cambiada'); continue }
    for (const t of aplicadas) {
      if (await d.almacen.pasarRetoque(t.id, 'aprobado', 'aplicado', { version_resultante: nueva })) r.aplicados.push({ id: t.id, documento, version: nueva })
      else r.ya_cambiaron.push(t.id)
    }
  }
  return r
}

export interface ResultadoDeDeshacer {
  deshechos: { id: string; documento: Documento; version: string }[]
  /** no se deshizo porque alguien escribió encima de lo aplicado (o el documento ya no está): se avisa, no se pisa */
  no_deshechos: { id: string; motivo: 'version_posterior' | 'sin_escritor' | 'documento_no_existe' | 'base_no_legible' }[]
  ya_cambiaron: string[]
}

/** Deshace los retoques `aplicado` de una edición: escribe una versión nueva con el texto de la base, solo si lo aplicado sigue siendo lo vigente. */
export async function deshacerEdicion(d: { almacen: Almacen; escritores: Escritores }, edicion_id: string): Promise<ResultadoDeDeshacer> {
  const r: ResultadoDeDeshacer = { deshechos: [], no_deshechos: [], ya_cambiaron: [] }
  const aplicados = (await d.almacen.retoquesDe(edicion_id)).map(deFila).filter((t) => t.estado === 'aplicado' && t.version_resultante)
  for (const grupo of agrupar(aplicados, (t) => `${t.documento}\u0000${t.documento_ref}\u0000${t.version_resultante}`).values()) {
    const { documento, documento_ref, version_base, version_resultante } = grupo[0]
    const no = (motivo: ResultadoDeDeshacer['no_deshechos'][number]['motivo']) => grupo.forEach((t) => r.no_deshechos.push({ id: t.id, motivo }))
    const esc = d.escritores[documento]
    if (!esc) { no('sin_escritor'); continue }
    const vig = await esc.leerVigente(documento_ref)
    if (!vig) { no('documento_no_existe'); continue }
    if (vig.version !== version_resultante) { no('version_posterior'); continue }
    const base = await esc.leerVersion(documento_ref, version_base)
    if (base === null) { no('base_no_legible'); continue }
    const nueva = await esc.escribirSiSigue(documento_ref, version_resultante!, base, `colaterales · deshacer edición ${edicion_id}`)
    if (nueva === null) { no('version_posterior'); continue }
    for (const t of grupo) {
      if (await d.almacen.pasarRetoque(t.id, 'aplicado', 'deshecho', { motivo: `deshecho en la versión ${nueva}` })) r.deshechos.push({ id: t.id, documento, version: nueva })
      else r.ya_cambiaron.push(t.id)
    }
  }
  return r
}
