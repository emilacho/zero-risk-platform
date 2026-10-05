/**
 * VENCIDOS · «qué vence o venció de este cliente en N días». SOLO LECTURA, sin modelo, US$ 0.
 *
 * Sale de la MISMA lista corta que ve el portero (la vigencia es la derivada al leer: fecha de la observación + plazo de su clase), así que lo que
 * esta ruta dice vencido es exactamente lo que la lista marca vencido: no hay una segunda cuenta que pueda contradecirla.
 * Lo que no vence (manual, perfil, sedes, fotos y logos propios) y las versiones reemplazadas no aparecen.
 * `sin_material` (nada que pueda vencer) ≠ `error_de_lectura` (no se pudo mirar): un fallo nunca se lee como «no vence nada».
 */
import type { Consulta } from '../consulta'
import { construirListaCorta } from '../lista-corta'
import { type Ficha, NOMBRES_DE_FUENTE } from '../tipos'

export const DIAS_POR_DEFECTO = 7
export const MAXIMO_DE_DIAS = 365
const DIA_MS = 86_400_000

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const invalida = (errores: string[]) => ({ status: 400, cuerpo: { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores } as Record<string, unknown> })

const base = (f: Ficha) => ({ ref: f.ref, titulo: f.titulo, clase: f.clase, estante: f.estante, vigente_hasta: f.vigente_hasta, ultima_verificacion: f.fecha_fuente })

export async function armarVencidos(consulta: Consulta, entrada: unknown, opciones: { ahora?: Date } = {}): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  if (!esObjeto(entrada)) return invalida(['la entrada debe ser un objeto'])
  const errores: string[] = []
  const cliente = typeof entrada.cliente === 'string' ? entrada.cliente.trim() : ''
  if (!cliente) errores.push('falta `cliente`')
  // `dias` puede venir de la dirección (texto): se acepta un entero escrito como texto
  const crudo = entrada.dias === undefined ? DIAS_POR_DEFECTO : typeof entrada.dias === 'string' && /^\d+$/.test(entrada.dias.trim()) ? Number(entrada.dias.trim()) : entrada.dias
  if (typeof crudo !== 'number' || !Number.isInteger(crudo) || crudo < 1 || crudo > MAXIMO_DE_DIAS) errores.push(`\`dias\` debe ser un entero entre 1 y ${MAXIMO_DE_DIAS}`)
  if (errores.length) return invalida(errores)
  const dias = crudo as number

  const ahora = opciones.ahora ?? new Date()
  const lista = await construirListaCorta(consulta, cliente, { ahora })
  const lecturas = Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, lista.fuentes[k].estado]))
  const detalles = Object.fromEntries(NOMBRES_DE_FUENTE.filter((k) => lista.fuentes[k].detalle).map((k) => [k, lista.fuentes[k].detalle]))
  const comun = { cliente, dias, ahora: ahora.toISOString(), lecturas, ...(Object.keys(detalles).length ? { detalles_de_lectura: detalles } : {}) }
  if (lista.estado === 'cliente_inexistente' || lista.estado === 'error_de_lectura') return { status: 200, cuerpo: { estado: lista.estado, vencidas: [], por_vencer: [], total_con_plazo: 0, ...comun } }

  const t0 = ahora.getTime()
  const vivas = lista.lineas.filter((f) => f.reemplazada !== true)
  const conPlazo = vivas.filter((f) => f.vigente_hasta !== null)
  const vencidas = vivas.filter((f) => f.vencido && f.vigente_hasta)
    .map((f) => ({ ...base(f), dias_de_atraso: Math.floor((t0 - new Date(f.vigente_hasta as string).getTime()) / DIA_MS), ...(f.aviso ? { aviso: f.aviso } : {}) }))
    .sort((a, b) => b.dias_de_atraso - a.dias_de_atraso || (a.ref < b.ref ? -1 : 1))
  const limite = t0 + dias * DIA_MS
  const porVencer = vivas.filter((f) => !f.vencido && f.vigente_hasta && new Date(f.vigente_hasta).getTime() <= limite)
    .map((f) => ({ ...base(f), dias_que_faltan: Math.ceil((new Date(f.vigente_hasta as string).getTime() - t0) / DIA_MS) }))
    .sort((a, b) => a.dias_que_faltan - b.dias_que_faltan || (a.ref < b.ref ? -1 : 1))
  // `parcial` = alguna lectura falló: lo que sí se leyó sale, y el estado lo dice; nunca se confunde con «no hay nada»
  const estado = lista.estado === 'parcial' ? 'parcial' : conPlazo.length === 0 ? 'sin_material' : 'ok'
  return { status: 200, cuerpo: { estado, vencidas, por_vencer: porVencer, total_con_plazo: conPlazo.length, ...comun } }
}
