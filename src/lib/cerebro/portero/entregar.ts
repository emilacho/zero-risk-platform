/**
 * ENTREGAR · el contenido completo de lo pedido por referencia o por número. SIN modelo: el sistema COPIA el texto.
 *
 * Cada cosa trae su etiqueta (estado, fecha, vencido y su aviso), su tamaño declarado y, si se cortó, el corte declarado.
 * SIN TOPE (encargo 9 · firma de Emilio 18-nov «nada se recorta»): todo lo pedido se entrega; `lo_demas` queda vacío por compatibilidad.
 * Pedido de una PIEZA (trae `pieza`): el original completo, sin corte, «no consta» por número y rastro en `cerebro_consultas`.
 * `sin_material` ≠ `error_de_lectura`: una referencia que la PROPIA lista emitió y no se puede leer es un error, no «no hay».
 */
import type { Consulta } from '../consulta'
import { leerContenidos } from '../contenido'
import { construirListaCorta } from '../lista-corta'
import type { Ficha } from '../tipos'
import { numerarLista } from './lista-numerada'
import { SIN_CORTE } from './indice'
import { dejarRastro, deLaPieza, filaDeRastro, leerPieza, type Registrar, vieneConPieza } from './segun-la-pieza'


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
      } else if (f.ref_de_la_ultima_version) {
        // 05-nov · la más nueva TAMPOCO está vigente: nunca se la nombra como «la vigente»
        salida.ref_de_la_ultima_version = f.ref_de_la_ultima_version
        salida.sin_version_vigente = true
        const v = porRef.get(f.ref_de_la_ultima_version)
        salida.aviso = [f.aviso, `NO es la versión vigente: la última versión es ${f.ref_de_la_ultima_version}${v?.version !== undefined ? ` (versión ${v.version})` : ''} y tampoco está vigente (${f.ultima_version_no_vigente ?? 'no está vigente'}) · sin versión vigente`].filter(Boolean).join(' · ')
      }
    }
  }
  if (f.decision) salida.decision = f.decision
  if (f.de_la_cosa) { salida.de_la_cosa = f.de_la_cosa; salida.version_decidida = f.version_decidida ?? null }
  return salida
}

export async function entregarContenido(consulta: Consulta, cuerpo: unknown, opciones: { ahora?: Date; registrar?: Registrar; reloj?: () => number } = {}): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  if (!esObjeto(cuerpo)) return invalida(['el cuerpo debe ser un objeto'])
  if (vieneConPieza(cuerpo)) return entregarALaPieza(consulta, cuerpo, opciones)
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
  let entregado = 0
  const material: Array<Record<string, unknown>> = []
  const estados: string[] = []
  for (const c of lecturas) {
    const f = porRef.get(c.ref)
    // una referencia que la PROPIA lista emitió y no se puede leer es un error del lector, no «no hay material»
    const ilegible = c.estado === 'sin_material' && !!f
    const estadoDeLectura = ilegible ? 'error_de_lectura' : c.estado
    estados.push(estadoDeLectura)
    if (estadoDeLectura === 'ok') entregado += c.peso_estimado
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
  return { status: 200, cuerpo: { estado, material, lo_demas: [], numeros_invalidos: invalidos, total_entregado: entregado, tope_de_entrega: null, huella: numerada.huella } }
}

const MOTIVO_NO_EXISTE = 'ese número no está en la lista del índice (no existe o fue retirado)'
const MOTIVO_LISTA_VIEJA = 'la lista cambió desde que se vio: pide de nuevo el índice'
const MOTIVO_SIN_TEXTO = 'la ficha no existe o no tiene texto'

/** encargo 9 · la entrega a una pieza: por número con la huella, el original COMPLETO (sin corte), «no consta» por número, y el rastro */
async function entregarALaPieza(consulta: Consulta, cuerpo: Record<string, unknown>, opciones: { ahora?: Date; registrar?: Registrar; reloj?: () => number }): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const reloj = opciones.reloj ?? Date.now
  const t0 = reloj()
  const errores: string[] = []
  const cliente = typeof cuerpo.cliente === 'string' ? cuerpo.cliente.trim() : ''
  if (!cliente) errores.push('falta `cliente`')
  const numeros = cuerpo.numeros
  if (!Array.isArray(numeros) || numeros.length === 0) errores.push('falta `numeros` (lista de los números del índice)')
  if (typeof cuerpo.huella !== 'string' || !cuerpo.huella) errores.push('falta `huella` (la que devolvió el índice)')
  const p = leerPieza(cuerpo)
  if (!p.ok) errores.push(...p.errores)
  if (errores.length || !p.ok) return invalida(errores)
  const pieza = p.pieza

  const lista = await construirListaCorta(consulta, cliente, { ahora: opciones.ahora })
  if (lista.estado === 'cliente_inexistente' || lista.estado === 'error_de_lectura') return { status: 200, cuerpo: { estado: lista.estado, material: [], no_consta: [], consulta_id: null } }
  const numerada = numerarLista(lista)
  const noConsta: Array<{ numero: unknown; estado: 'no_consta'; motivo: string }> = []
  const material: Array<Record<string, unknown>> = []
  const fin = async (extra: Record<string, unknown> = {}) => {
    const rastro = await dejarRastro(opciones.registrar, filaDeRastro({ cliente, pieza, ruta: 'entregar', entregadas: material.filter((m) => m.estado_de_lectura === 'ok').map((m) => String(m.ref)), noConstan: noConsta.map((n) => n.numero), ms: reloj() - t0 }))
    const hayOk = material.some((m) => m.estado_de_lectura === 'ok'), hayError = material.some((m) => m.estado_de_lectura === 'error_de_lectura')
    const estado = hayOk ? (noConsta.length || hayError ? 'parcial' : 'ok') : hayError ? 'error_de_lectura' : 'no_consta'
    return { status: 200, cuerpo: { estado, material, no_consta: noConsta, huella: numerada.huella, ...extra, consulta_id: rastro.consulta_id, rastro } }
  }
  // la huella no coincide: el número puede apuntar a otra cosa, así que NADA se entrega por número
  if (cuerpo.huella !== numerada.huella) {
    for (const n of numeros as unknown[]) noConsta.push({ numero: n, estado: 'no_consta', motivo: MOTIVO_LISTA_VIEJA })
    return fin({ huella_actual: numerada.huella })
  }
  const porNumero = new Map(numerada.lineas.map((l) => [l.numero, l.ficha]))
  const pedidas: Array<{ numero: number; ficha: Ficha }> = []
  for (const n of [...new Set(numeros as unknown[])]) {
    const f = typeof n === 'number' && Number.isInteger(n) ? porNumero.get(n) : undefined
    if (f) pedidas.push({ numero: n as number, ficha: f }); else noConsta.push({ numero: n, estado: 'no_consta', motivo: MOTIVO_NO_EXISTE })
  }
  const porRef = new Map(lista.lineas.map((f) => [f.ref, f]))
  const lecturas = await leerContenidos(consulta, cliente, pedidas.map((x) => x.ficha.ref), { maximoCaracteres: SIN_CORTE })
  lecturas.forEach((c, i) => {
    const { numero, ficha: f } = pedidas[i]
    if (c.estado === 'error_de_lectura') { material.push({ numero, ref: f.ref, estado_de_lectura: 'error_de_lectura', texto: null, detalle: c.detalle ?? null, sede: f.sede ?? null }); return }
    if (c.estado !== 'ok') { noConsta.push({ numero, estado: 'no_consta', motivo: `${MOTIVO_SIN_TEXTO} (${c.detalle ?? 'sin detalle'})` }); return }
    const d = deLaPieza(f, pieza.sede)
    material.push({
      numero, ref: f.ref, estado_de_lectura: 'ok', texto: c.texto, caracteres: c.caracteres_totales,
      titulo: f.titulo, estante: f.estante, clase: f.clase, estado: f.estado, fecha_fuente: f.fecha_fuente, vigente_hasta: f.vigente_hasta, vencido: f.vencido,
      ...(f.aviso ? { aviso: f.aviso } : {}), enlace: f.enlace ?? null, producto: f.producto ?? null,
      sede: f.sede ?? null, de_la_pieza: d.de_la_pieza, ...(d.marca ? { marca: d.marca } : {}), ...versionYDecision(f, porRef),
    })
  })
  return fin()
}
