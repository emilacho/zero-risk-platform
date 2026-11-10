/**
 * COLATERALES · tramo 2b · el ALMACÉN del historial (tablas de 202611101600, aún SIN aplicar en producción).
 * Recibe el cliente de base por parámetro (así se prueba con una base falsa). Nadie lo llama todavía (lo usa 2c/2d).
 *   · una edición = un trabajo (línea 4 de CC7): `crearEdicion` choca por `llave` (23505) y devuelve la existente; `tomarEdicion` pasa
 *     recibida → en_curso con un update CONDICIONAL: si otro ya la tomó, devuelve false («ya en curso»), nunca corre dos veces;
 *   · cada cambio de estado es condicional al estado de origen: nadie pisa un estado que cambió entre la lectura y la escritura;
 *   · un retoque se rehace como máximo UNA vez (línea 1 de CC6): la segunda falla lo deja `rechazado`, sin freno;
 *   · un error de la base se LANZA (nunca se lee como «vacío»). Sin delete: nada se borra.
 * Agnóstico: ningún dato de un cliente.
 */
import type { Documento } from '../cadena/dependencias-de-documentos'
import type { Pedazo } from './red'

export type Db = { from(tabla: string): any }
const DUPLICADO = '23505'

export type EstadoDeEdicion = 'recibida' | 'en_curso' | 'lista' | 'sin_colaterales' | 'sin_motor' | 'de_fondo' | 'fallida'
export type EstadoDeRetoque = 'ya_coincide' | 'descartado' | 'propuesto' | 'aprobado' | 'rechazado' | 'pendiente' | 'aplicado' | 'deshecho'

/** a dónde puede ir cada estado (lo que no está aquí, no se escribe) */
export const PASOS_DE_EDICION: Readonly<Record<EstadoDeEdicion, readonly EstadoDeEdicion[]>> = {
  recibida: ['en_curso', 'sin_motor'],
  en_curso: ['lista', 'sin_colaterales', 'de_fondo', 'fallida'],
  lista: [], sin_colaterales: [], sin_motor: [], de_fondo: [], fallida: [],
}
export const PASOS_DE_RETOQUE: Readonly<Record<EstadoDeRetoque, readonly EstadoDeRetoque[]>> = {
  ya_coincide: [], descartado: [],
  propuesto: ['aprobado', 'rechazado', 'propuesto'], // propuesto → propuesto = rehecho (una vez)
  aprobado: ['aplicado', 'pendiente'],
  pendiente: ['aplicado', 'rechazado'],
  aplicado: ['deshecho'],
  rechazado: [], deshecho: [],
}

export interface NuevaEdicion {
  client_id: string
  documento: Documento
  documento_ref: string
  version_base: string
  seccion: string
  antes: string
  despues: string
  llave: string
  workflow_execution_id?: string | null
}
export interface Edicion extends NuevaEdicion {
  id: string
  estado: EstadoDeEdicion
  version_nueva: string | null
  gravedad: 'fondo' | 'normal' | null
  nota: string | null
}

export interface NuevoRetoque {
  pedazo: Pedazo
  documento_ref: string
  version_base: string
  afecta: boolean
  razon: string
  antes: string | null
  despues: string | null
  porque: string | null
  estado: Extract<EstadoDeRetoque, 'ya_coincide' | 'descartado' | 'propuesto'>
}

function ok<T>(r: { data: T; error: { message: string; code?: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

const aEdicion = (f: Record<string, unknown>): Edicion => ({
  id: String(f.id), client_id: String(f.client_id), documento: f.documento as Documento, documento_ref: String(f.documento_ref), version_base: String(f.version_base),
  seccion: String(f.seccion), antes: String(f.antes), despues: String(f.despues), llave: String(f.llave), workflow_execution_id: (f.workflow_execution_id as string | null) ?? null,
  estado: f.estado as EstadoDeEdicion, version_nueva: (f.version_nueva as string | null) ?? null, gravedad: (f.gravedad as Edicion['gravedad']) ?? null, nota: (f.nota as string | null) ?? null,
})

export class PasoNoPermitido extends Error {}

export function almacenDeColaterales(db: Db) {
  const ahora = () => new Date().toISOString()
  const almacen = {
    /** crea la edición; si la llave ya existe devuelve la existente con `nueva: false` (un reenvío no abre otro trabajo) */
    async crearEdicion(n: NuevaEdicion): Promise<{ edicion: Edicion; nueva: boolean }> {
      const r = await db.from('colaterales_ediciones').insert({ ...n, workflow_execution_id: n.workflow_execution_id ?? null, estado: 'recibida' }).select('*').single()
      if (!r.error) return { edicion: aEdicion(r.data), nueva: true }
      if (r.error.code !== DUPLICADO) throw new Error(`crear la edición: ${r.error.message}`)
      const ya = ok(await db.from('colaterales_ediciones').select('*').eq('llave', n.llave).maybeSingle(), 'leer la edición por llave') as Record<string, unknown> | null
      if (!ya) throw new Error(`crear la edición: la llave ${n.llave} chocó pero no se encuentra`)
      return { edicion: aEdicion(ya), nueva: false }
    },

    /** cambia el estado SOLO si sigue en `de` · devuelve false si otro lo cambió antes (p. ej. recibida → en_curso ya tomada = «ya en curso») */
    async pasarEdicion(id: string, de: EstadoDeEdicion, a: EstadoDeEdicion, campos: Partial<Pick<Edicion, 'version_nueva' | 'gravedad' | 'nota' | 'workflow_execution_id'>> & { gravedad_motivo?: string } = {}): Promise<boolean> {
      if (!PASOS_DE_EDICION[de].includes(a)) throw new PasoNoPermitido(`edición ${de} → ${a}`)
      const d = ok(await db.from('colaterales_ediciones').update({ ...campos, estado: a, updated_at: ahora() }).eq('id', id).eq('estado', de).select('id'), `pasar la edición a ${a}`) as unknown[] | null
      return (d?.length ?? 0) === 1
    },

    /** guarda los pedazos revisados de una edición (ya_coincide, descartado con su razón, propuesto) */
    async guardarRetoques(edicion_id: string, retoques: NuevoRetoque[]): Promise<number> {
      if (!retoques.length) return 0
      const filas = retoques.map((t) => ({
        edicion_id, documento: t.pedazo.documento, documento_ref: t.documento_ref, version_base: t.version_base,
        pedazo_id: t.pedazo.id, pedazo_inicio: t.pedazo.inicio, pedazo_ruta: t.pedazo.ruta, pedazo_texto: t.pedazo.texto, seccion: t.pedazo.seccion,
        afecta: t.afecta, razon: t.razon, antes: t.antes, despues: t.despues, porque: t.porque, estado: t.estado,
      }))
      const d = ok(await db.from('colaterales_retoques').insert(filas).select('id'), 'guardar los retoques') as unknown[] | null
      if ((d?.length ?? 0) !== filas.length) throw new Error(`guardar los retoques: se pidieron ${filas.length} y se guardaron ${d?.length ?? 0}`)
      return filas.length
    },

    /** cambia un retoque SOLO si sigue en `de` · propuesto → propuesto es el rehecho y solo se permite con rehechos = 0 */
    async pasarRetoque(id: string, de: EstadoDeRetoque, a: EstadoDeRetoque, campos: { despues?: string; porque?: string; motivo?: string; version_resultante?: string; revision_id?: string } = {}): Promise<boolean> {
      if (!PASOS_DE_RETOQUE[de].includes(a)) throw new PasoNoPermitido(`retoque ${de} → ${a}`)
      let q = db.from('colaterales_retoques').update({ ...campos, estado: a, ...(de === 'propuesto' && a === 'propuesto' ? { rehechos: 1 } : {}), updated_at: ahora() }).eq('id', id).eq('estado', de)
      if (de === 'propuesto' && a === 'propuesto') q = q.eq('rehechos', 0)
      const d = ok(await q.select('id'), `pasar el retoque a ${a}`) as unknown[] | null
      return (d?.length ?? 0) === 1
    },

    /**
     * Línea 1 de CC6: un retoque frenado por la jefatura se rehace UNA vez. Si ya se rehízo, queda `rechazado` con su motivo
     * y el documento de abajo sigue como estaba (no activa freno). Devuelve qué pasó.
     */
    async frenadoPorJefatura(id: string, rehechos: number, motivo: string): Promise<'rehacer' | 'rechazado' | 'ya_cambio'> {
      if (rehechos >= 1) return (await almacen.pasarRetoque(id, 'propuesto', 'rechazado', { motivo })) ? 'rechazado' : 'ya_cambio'
      return 'rehacer'
    },

    async retoquesDe(edicion_id: string): Promise<Record<string, unknown>[]> {
      return (ok(await db.from('colaterales_retoques').select('*').eq('edicion_id', edicion_id).order('pedazo_inicio', { ascending: true }), 'leer los retoques') as Record<string, unknown>[] | null) ?? []
    },
  }
  return almacen
}
