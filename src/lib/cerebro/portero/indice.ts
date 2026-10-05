/**
 * INDICE · lo fijo + la lista numerada + el estado de cada lectura + el respaldo ya armado. SIN modelo.
 * Es lo que el flujo llama siempre (cuesta US$ 0): si el portero falla, el respaldo que devuelve esta ruta es lo que se usa.
 * `sin_material` ≠ `error_de_lectura`: cada fuente dice cuál es; un cliente inexistente se dice como tal.
 */
import type { Consulta } from '../consulta'
import { respuestaDeRespaldo } from '../conversacion'
import { construirListaCorta } from '../lista-corta'
import { NOMBRES_DE_FUENTE } from '../tipos'
import { numerarLista } from './lista-numerada'

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export async function armarIndice(consulta: Consulta, cuerpo: unknown, opciones: { ahora?: Date } = {}): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  if (!esObjeto(cuerpo)) return { status: 400, cuerpo: { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores: ['el cuerpo debe ser un objeto'] } }
  const errores: string[] = []
  const cliente = typeof cuerpo.cliente === 'string' ? cuerpo.cliente.trim() : ''
  if (!cliente) errores.push('falta `cliente`')
  const yaTrae = cuerpo.ya_trae === undefined ? [] : cuerpo.ya_trae
  if (!Array.isArray(yaTrae) || yaTrae.some((x) => typeof x !== 'string')) errores.push('`ya_trae` debe ser una lista de textos')
  if (errores.length) return { status: 400, cuerpo: { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores } }

  const lista = await construirListaCorta(consulta, cliente, { ahora: opciones.ahora })
  const lecturas = Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, lista.fuentes[k].estado]))
  const detalles = Object.fromEntries(NOMBRES_DE_FUENTE.filter((k) => lista.fuentes[k].detalle).map((k) => [k, lista.fuentes[k].detalle]))
  const numerada = numerarLista(lista, { ya_trae: yaTrae as string[] })
  const respaldo = respuestaDeRespaldo(lista, { ronda: 1 })
  return {
    status: 200,
    cuerpo: {
      estado: lista.estado, lecturas, detalles_de_lectura: detalles, generada_en: lista.generada_en,
      fijo: respaldo.material,
      lista: numerada.lineas.map(({ numero, ficha: f }) => ({
        numero, ref: f.ref, estante: f.estante, clase: f.clase, titulo: f.titulo, que_es: f.que_es, producto: f.producto ?? null, estado: f.estado, fecha_fuente: f.fecha_fuente,
        vigente_hasta: f.vigente_hasta, vencido: f.vencido, ...(f.aviso ? { aviso: f.aviso } : {}), ...(f.version !== undefined ? { version: f.version, vigente: f.vigente } : {}), peso_estimado: f.peso_estimado,
      })),
      lista_texto: numerada.texto, huella: numerada.huella, ya_trae_desconocido: numerada.ya_trae_desconocido, respaldo,
    },
  }
}
