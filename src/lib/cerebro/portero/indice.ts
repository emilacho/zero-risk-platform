/**
 * INDICE · lo fijo + la lista numerada + el estado de cada lectura + el respaldo ya armado. SIN modelo.
 * Es lo que el flujo llama siempre (cuesta US$ 0): si el portero falla, el respaldo que devuelve esta ruta es lo que se usa.
 * `sin_material` ≠ `error_de_lectura`: cada fuente dice cuál es; un cliente inexistente se dice como tal.
 */
import type { Consulta } from '../consulta'
import { respuestaDeRespaldo } from '../conversacion'
import { construirListaCorta } from '../lista-corta'
import { NOMBRES_DE_FUENTE } from '../tipos'
import { leerContenidos } from '../contenido'
import type { Ficha } from '../tipos'
import { numerarLista } from './lista-numerada'
import { datosDeLaFicha, dejarRastro, filaDeRastro, leerPieza, lineaConDatos, type Registrar, vaEnLaBase, vieneConPieza } from './segun-la-pieza'

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export async function armarIndice(consulta: Consulta, cuerpo: unknown, opciones: { ahora?: Date; registrar?: Registrar; reloj?: () => number } = {}): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  if (!esObjeto(cuerpo)) return { status: 400, cuerpo: { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores: ['el cuerpo debe ser un objeto'] } }
  // encargo 9 + adenda 1 · pedido de una pieza: el índice completo, la base completa y el rastro (sin casillas, nada se filtra por sede)
  if (vieneConPieza(cuerpo)) return indiceDeLaPieza(consulta, cuerpo, opciones)
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

/** sin tope: la pieza recibe el original completo («nada se recorta», firma de Emilio 18-nov) */
export const SIN_CORTE = Number.MAX_SAFE_INTEGER

const lineaDeLista = (numero: number, f: Ficha) => ({
  numero, ref: f.ref, estante: f.estante, clase: f.clase, titulo: f.titulo, que_es: f.que_es, producto: f.producto ?? null, estado: f.estado, fecha_fuente: f.fecha_fuente,
  vigente_hasta: f.vigente_hasta, vencido: f.vencido, ...(f.aviso ? { aviso: f.aviso } : {}), ...(f.version !== undefined ? { version: f.version, vigente: f.vigente } : {}), peso_estimado: f.peso_estimado,
})

async function indiceDeLaPieza(consulta: Consulta, cuerpo: Record<string, unknown>, opciones: { ahora?: Date; registrar?: Registrar; reloj?: () => number }): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const reloj = opciones.reloj ?? Date.now
  const t0 = reloj()
  const errores: string[] = []
  const cliente = typeof cuerpo.cliente === 'string' ? cuerpo.cliente.trim() : ''
  if (!cliente) errores.push('falta `cliente`')
  const yaTrae = cuerpo.ya_trae === undefined ? [] : cuerpo.ya_trae
  if (!Array.isArray(yaTrae) || yaTrae.some((x) => typeof x !== 'string')) errores.push('`ya_trae` debe ser una lista de textos')
  const p = leerPieza(cuerpo)
  if (!p.ok) errores.push(...p.errores)
  if (errores.length || !p.ok) return { status: 400, cuerpo: { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores } }
  const pieza = p.pieza

  const lista = await construirListaCorta(consulta, cliente, { ahora: opciones.ahora })
  const lecturas = Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, lista.fuentes[k].estado]))
  const detalles = Object.fromEntries(NOMBRES_DE_FUENTE.filter((k) => lista.fuentes[k].detalle).map((k) => [k, lista.fuentes[k].detalle]))
  const numerada = numerarLista(lista, { ya_trae: yaTrae as string[] })
  const respaldo = respuestaDeRespaldo(lista, { ronda: 1 })

  // la base COMPLETA: lo fijo + los hechos del negocio + lo que escribió el dueño + el resumen vivo de TODAS las sedes, cada texto entero (sin corte)
  const enLaBase: Array<{ numero: number | null; ficha: Ficha }> = [
    ...numerada.fijo.map((ficha) => ({ numero: null, ficha })),
    ...numerada.lineas.filter((l) => vaEnLaBase(l.ficha)).map((l) => ({ numero: l.numero, ficha: l.ficha })),
  ]
  const contenidos = await leerContenidos(consulta, cliente, enLaBase.map((x) => x.ficha.ref), { maximoCaracteres: SIN_CORTE })
  const base = enLaBase.map((x, i) => {
    const c = contenidos[i]
    return {
      numero: x.numero, ref: x.ficha.ref, estante: x.ficha.estante, clase: x.ficha.clase, titulo: x.ficha.titulo, ...datosDeLaFicha(x.ficha),
      fijo: x.numero === null, estado: x.ficha.estado, vigente_hasta: x.ficha.vigente_hasta, vencido: x.ficha.vencido,
      ...(x.ficha.aviso ? { aviso: x.ficha.aviso } : {}),
      estado_de_lectura: c.estado, texto: c.texto ?? x.ficha.contenido ?? x.ficha.resumen ?? x.ficha.que_es, caracteres: c.caracteres_totales,
      ...(c.detalle ? { detalle_de_lectura: c.detalle } : {}),
    }
  })

  const rastro = await dejarRastro(opciones.registrar, filaDeRastro({ cliente, pieza, ruta: 'indice', entregadas: base.map((b) => b.ref), noConstan: [], ms: reloj() - t0 }))
  return {
    status: 200,
    cuerpo: {
      estado: lista.estado, lecturas, detalles_de_lectura: detalles, generada_en: lista.generada_en,
      pieza: { encargo_id: pieza.encargo_id, fila: pieza.fila, turno: pieza.turno },
      base_completa: base,
      fijo: respaldo.material,
      // el índice COMPLETO, en su orden y con sus números de siempre: nada se filtra, ordena ni marca; la sede, la fecha y la fuente van como dato
      lista: numerada.lineas.map((l) => ({ ...lineaDeLista(l.numero, l.ficha), ...datosDeLaFicha(l.ficha) })),
      lista_texto: numerada.lineas.map(lineaConDatos).join('\n'), huella: numerada.huella, ya_trae_desconocido: numerada.ya_trae_desconocido,
      consulta_id: rastro.consulta_id, rastro,
    },
  }
}
