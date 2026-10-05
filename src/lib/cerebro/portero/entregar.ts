/**
 * ENTREGAR · el contenido completo de lo pedido por referencia o por número. SIN modelo: el sistema COPIA el texto.
 *
 * Cada cosa trae su etiqueta (estado, fecha, vencido y su aviso), su tamaño declarado y, si se cortó, el corte declarado.
 * Lo que no cabe en el tope NO se entrega a medias: pasa a `lo_demas` con «no_cabe», en el orden pedido.
 * `sin_material` ≠ `error_de_lectura`: una referencia que la PROPIA lista emitió y no se puede leer es un error, no «no hay».
 */
import type { Consulta } from '../consulta'
import { leerContenidos } from '../contenido'
import { construirListaCorta } from '../lista-corta'
import { MOTIVO_NO_CABE } from '../conversacion'
import type { Ficha } from '../tipos'
import { numerarLista } from './lista-numerada'

/** lo que se entrega por llamada: 70.000 «tokens» (decisión 4 del diseño) */
export const TOPE_DE_ENTREGA_EN_UNIDADES = 70_000

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const invalida = (errores: string[], status = 400, error = 'entrada_invalida') => ({ status, cuerpo: { error, code: 'E-INPUT-INVALID', errores } as Record<string, unknown> })

/**
 * Lo que debe viajar JUNTO a una cosa con versiones: qué versión es, si es la vigente (y, si no, cuál lo es) y la última decisión del dueño sobre ella
 * (`null` = no la hay: se dice). Una línea de decisión trae qué decidió, sobre qué cosa y sobre cuál versión. Lo que no tiene versiones no trae nada de esto.
 */
function versionYDecision(f: Ficha, porRef: Map<string, Ficha>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  if (f.version !== undefined) {
    salida.version = f.version
    salida.vigente = f.vigente === true
    salida.decision_del_dueno = f.decision_del_dueno ?? null
    if (f.reemplazada === true) {
      salida.reemplazada = true
      if (f.ref_de_la_vigente) {
        salida.ref_de_la_vigente = f.ref_de_la_vigente
        const v = porRef.get(f.ref_de_la_vigente)
        salida.aviso = [f.aviso, `NO es la versión vigente: la vigente es ${f.ref_de_la_vigente}${v?.version !== undefined ? ` (versión ${v.version})` : ''}`].filter(Boolean).join(' · ')
      }
    }
  }
  if (f.decision) salida.decision = f.decision
  if (f.de_la_cosa) { salida.de_la_cosa = f.de_la_cosa; salida.version_decidida = f.version_decidida ?? null }
  return salida
}

export async function entregarContenido(consulta: Consulta, cuerpo: unknown, opciones: { ahora?: Date; topeDeEntrega?: number } = {}): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  if (!esObjeto(cuerpo)) return invalida(['el cuerpo debe ser un objeto'])
  const errores: string[] = []
  const cliente = typeof cuerpo.cliente === 'string' ? cuerpo.cliente.trim() : ''
  if (!cliente) errores.push('falta `cliente`')
  const refs = cuerpo.refs === undefined ? [] : cuerpo.refs
  if (!Array.isArray(refs) || refs.some((x) => typeof x !== 'string')) errores.push('`refs` debe ser una lista de textos')
  const numeros = cuerpo.numeros === undefined ? [] : cuerpo.numeros
  if (!Array.isArray(numeros)) errores.push('`numeros` debe ser una lista')
  const yaTrae = cuerpo.ya_trae === undefined ? [] : cuerpo.ya_trae
  if (!Array.isArray(yaTrae) || yaTrae.some((x) => typeof x !== 'string')) errores.push('`ya_trae` debe ser una lista de textos')
  if (errores.length) return invalida(errores)
  if ((refs as unknown[]).length === 0 && (numeros as unknown[]).length === 0) return invalida(['no se pidió nada: falta `refs` o `numeros`'], 400, 'falta_que_entregar')
  if ((numeros as unknown[]).length > 0 && typeof cuerpo.huella !== 'string') return invalida(['pedir por número exige `huella` (la que devolvió `indice`)'], 400, 'falta_huella')
  const maximo = typeof cuerpo.maximo_caracteres === 'number' && cuerpo.maximo_caracteres > 0 ? Math.floor(cuerpo.maximo_caracteres) : undefined

  const lista = await construirListaCorta(consulta, cliente, { ahora: opciones.ahora })
  if (lista.estado === 'cliente_inexistente' || lista.estado === 'error_de_lectura') return { status: 200, cuerpo: { estado: lista.estado, material: [], lo_demas: [], numeros_invalidos: [] } }
  const numerada = numerarLista(lista, { ya_trae: yaTrae as string[] })
  if ((numeros as unknown[]).length > 0 && cuerpo.huella !== numerada.huella) {
    return { status: 409, cuerpo: { error: 'la_lista_cambio', code: 'E-LISTA-CAMBIO', detail: 'la lista cambió desde que se vio: pide de nuevo `indice`', huella_actual: numerada.huella } }
  }
  const porNumero = new Map(numerada.lineas.map((l) => [l.numero, l.ficha.ref]))
  const invalidos: unknown[] = []
  const pedidas: string[] = []
  for (const n of numeros as unknown[]) {
    const ref = typeof n === 'number' && Number.isInteger(n) ? porNumero.get(n) : undefined
    if (ref) pedidas.push(ref); else invalidos.push(n)
  }
  for (const r of refs as string[]) pedidas.push(r)
  const unicas = [...new Set(pedidas)]
  if (unicas.length === 0) return { status: 200, cuerpo: { estado: 'numeros_invalidos', material: [], lo_demas: [], numeros_invalidos: invalidos } }

  const porRef = new Map(lista.lineas.map((f) => [f.ref, f]))
  const lecturas = await leerContenidos(consulta, cliente, unicas, maximo ? { maximoCaracteres: maximo } : {})
  const tope = opciones.topeDeEntrega ?? TOPE_DE_ENTREGA_EN_UNIDADES
  let entregado = 0
  let lleno = false
  const material: Array<Record<string, unknown>> = []
  const loDemas: Array<{ ref: string; motivo: string; peso_estimado: number }> = []
  const estados: string[] = []
  for (const c of lecturas) {
    const f = porRef.get(c.ref)
    // una referencia que la PROPIA lista emitió y no se puede leer es un error del lector, no «no hay material»
    const ilegible = c.estado === 'sin_material' && !!f
    const estadoDeLectura = ilegible ? 'error_de_lectura' : c.estado
    estados.push(estadoDeLectura)
    if (estadoDeLectura === 'ok') {
      if (lleno || entregado + c.peso_estimado > tope) { lleno = true; loDemas.push({ ref: c.ref, motivo: MOTIVO_NO_CABE, peso_estimado: c.peso_estimado }); continue }
      entregado += c.peso_estimado
    }
    material.push({
      ref: c.ref, numero: numerada.lineas.find((l) => l.ficha.ref === c.ref)?.numero ?? null, estado_de_lectura: estadoDeLectura, texto: c.texto,
      caracteres_totales: c.caracteres_totales, caracteres_entregados: c.caracteres_entregados, cortado: c.cortado, ...(c.aviso_de_corte ? { aviso_de_corte: c.aviso_de_corte } : {}),
      peso_estimado: c.peso_estimado,
      ...(ilegible ? { detalle: `emitida por la lista y no se pudo leer (${c.detalle ?? 'sin detalle'})` } : c.detalle ? { detalle: c.detalle } : {}),
      ...(f ? { titulo: f.titulo, estante: f.estante, clase: f.clase, estado: f.estado, fecha_fuente: f.fecha_fuente, vigente_hasta: f.vigente_hasta, vencido: f.vencido, ...(f.aviso ? { aviso: f.aviso } : {}), enlace: f.enlace ?? null, producto: f.producto ?? null, sede: f.sede ?? null, ...versionYDecision(f, porRef) } : {}),
    })
  }
  const hayOk = estados.includes('ok'), hayError = estados.includes('error_de_lectura')
  const estado = hayOk ? (hayError ? 'parcial' : 'ok') : hayError ? 'error_de_lectura' : 'sin_material'
  return { status: 200, cuerpo: { estado, material, lo_demas: loDemas, numeros_invalidos: invalidos, total_entregado: entregado, tope_de_entrega: tope, huella: numerada.huella } }
}
