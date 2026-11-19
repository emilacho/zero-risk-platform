/**
 * EL CEREBRO ENTREGA A LA PIEZA, SIN CASILLAS (encargo 9 + ADENDA 1 · corrección de Emilio 18-nov 19:19 Zúrich: «el modelo razona sobre documentos completos»).
 * Contrato con CC2 al pie de `PROPUESTA-CC2-a-CC-CEREBRO-el-lado-de-la-mesa-indice-y-entrega.md` (el de después de la adenda):
 *  · la pieza manda su HOJA completa (brief + plan) como texto: va al rastro; no se usa para filtrar ni ordenar nada;
 *  · ya NO hay casillas de sede, oferta, tema, canal ni para_que: si llegan, se rechaza (una casilla vieja no se cuela en silencio);
 *  · el índice es el COMPLETO del cliente (mismos números y huella) y la base es COMPLETA; la sede, la fecha y la fuente de cada ficha van como DATO;
 *  · rastro en `cerebro_consultas` (agente, encargo, fila, turno, hoja, fichas entregadas, números que no constan).
 */
import type { Ficha } from '../tipos'
import { lineaParaElModelo, type LineaNumerada } from './lista-numerada'

export interface Pieza {
  encargo_id: string
  fila: string | null
  turno: string | null
  agente: string
  hoja: string
}

/** las casillas que la adenda sacó del contrato: si llegan, el pedido se rechaza y se dice por qué */
export const CASILLAS_QUE_YA_NO_VAN = ['sede', 'oferta', 'tema', 'canal', 'para_que'] as const
export const MOTIVO_SIN_CASILLAS = 'sin casillas: la pieza manda su hoja completa en `pieza.hoja` (adenda 1 al encargo 9)'

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** ¿el pedido viene de una pieza? (trae `pieza`). Sin `pieza`, las rutas responden como antes */
export const vieneConPieza = (cuerpo: Record<string, unknown>): boolean => cuerpo.pieza !== undefined

export function leerPieza(cuerpo: Record<string, unknown>): { ok: true; pieza: Pieza } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const p = cuerpo.pieza
  if (!esObjeto(p)) return { ok: false, errores: ['`pieza` debe ser un objeto { encargo_id, fila, hoja }'] }
  for (const k of CASILLAS_QUE_YA_NO_VAN) if (cuerpo[k] !== undefined || p[k] !== undefined) errores.push(`\`${k}\` ya no va: ${MOTIVO_SIN_CASILLAS}`)
  const encargo = txt(p.encargo_id)
  if (!encargo) errores.push('falta `pieza.encargo_id`')
  if (p.fila !== undefined && p.fila !== null && typeof p.fila !== 'string') errores.push('`pieza.fila` debe ser texto')
  // la hoja se guarda TAL CUAL (completa, sin recortar ni limpiar): solo se exige que exista
  if (typeof p.hoja !== 'string' || !p.hoja.trim()) errores.push('falta `pieza.hoja` (el texto completo de la hoja de la pieza: brief + plan)')
  const agente = txt(cuerpo.agente)
  if (!agente) errores.push('falta `agente` (quién pide: va al rastro)')
  if (cuerpo.turno !== undefined && cuerpo.turno !== null && typeof cuerpo.turno !== 'string') errores.push('`turno` debe ser texto')
  if (errores.length) return { ok: false, errores }
  return { ok: true, pieza: { encargo_id: encargo as string, fila: txt(p.fila), turno: txt(cuerpo.turno), agente: agente as string, hoja: p.hoja as string } }
}

/** de dónde salió una ficha, como dato (no como juicio) */
export const fuenteDe = (f: Ficha): string => f.origen

/** la sede, la fecha y la fuente de una ficha como DATO, igual en la lista, en la base y en la entrega */
export const datosDeLaFicha = (f: Ficha) => ({ sede: txt(f.sede) ?? null, fecha_fuente: f.fecha_fuente, fuente: fuenteDe(f) })

/** la línea del índice para el empleado: la de siempre más su sede y su fuente como dato (nada se marca ni se reordena) */
export const lineaConDatos = (l: LineaNumerada): string => {
  const s = txt(l.ficha.sede)
  return `${lineaParaElModelo(l.numero, l.ficha)}${s ? ` · sede ${s}` : ''} · fuente ${fuenteDe(l.ficha)}`
}

/** lo que va en la base completa, además de lo fijo: los hechos del negocio (E2), lo que el dueño escribió en el manual y el resumen vivo de TODAS las sedes */
export const CLASES_DE_LA_BASE = ['dato_del_dueno', 'resumen_vivo'] as const
export const vaEnLaBase = (f: Ficha): boolean => f.estante === 'E2' || (CLASES_DE_LA_BASE as readonly string[]).includes(f.clase)

/** la fila del rastro en `cerebro_consultas` (columnas de hoy + las de la migración 202611181800) */
export function filaDeRastro(o: { cliente: string; pieza: Pieza; ruta: 'indice' | 'entregar'; entregadas: string[]; noConstan: unknown[]; ms: number }): Record<string, unknown> {
  return {
    client_id: o.cliente, oficina: 'mesa', agente: o.pieza.agente, que: null, atributo: null, sede_clave: null,
    resultados: o.entregadas.length, sin_dato: o.entregadas.length === 0, ms: Math.max(0, Math.round(o.ms)),
    ruta: o.ruta, encargo_id: o.pieza.encargo_id, fila: o.pieza.fila, turno: o.pieza.turno, hoja: o.pieza.hoja,
    fichas_entregadas: o.entregadas, numeros_no_consta: o.noConstan,
  }
}

export type Registrar = (fila: Record<string, unknown>) => Promise<{ id?: string | null; error?: string | null }>
/** escribe el rastro y nunca rompe la respuesta: si falla, la respuesta lo DICE (`rastro.registrado: false` + el error) */
export async function dejarRastro(registrar: Registrar | undefined, fila: Record<string, unknown>): Promise<{ registrado: boolean; consulta_id: string | null; error?: string }> {
  if (!registrar) return { registrado: false, consulta_id: null, error: 'la ruta no recibió dónde escribir el rastro' }
  try {
    const r = await registrar(fila)
    return r.error ? { registrado: false, consulta_id: null, error: r.error } : { registrado: true, consulta_id: r.id ?? null }
  } catch (e) { return { registrado: false, consulta_id: null, error: e instanceof Error ? e.message : String(e) } }
}
