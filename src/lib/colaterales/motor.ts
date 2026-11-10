/**
 * MOTOR DE COLATERALES · tramo 2a · lo EXACTO que verifica el código alrededor del agente (CC1 · certifica CC7 · CRITERIOS v2 + adendas 1-4 + PLAN tramo 2).
 *
 * Regla de Emilio (13:13Z): juzgar = agente; verificar lo exacto = código. Aquí NO se juzga nada (ni gravedad, ni registro, ni estilo):
 *   1 · `yaCoincide`      R1 · si el «después» ya está literal en el pedazo (y el «antes» no), se resuelve sin agente y NUNCA crea pendiente.
 *   2 · `verificarSalida` la salida del agente: ids 100 %, razón también en lo descartado (nota 3 CC7), «antes» literal DENTRO de su pedazo,
 *                         solo aguas abajo, «no aparece» comprobado con búsqueda. El REGISTRO del «después» lo juzga la jefatura contra el
 *                         manual de ESE cliente (CORRECCIÓN Lenovo 13:16Z), no una lista del código.
 *   3 · `aplicarEnPedazo` el retoque se escribe en la POSICIÓN exacta de su pedazo (o en su ruta JSON); si ahí ya no está el texto, no se pisa.
 *   4 · `puedeLanzarMotor` R2 · todos los dependientes con fila de la jefatura ACTIVA, leído EN ESE INSTANTE (al guardar y otra vez al aplicar).
 * Agnóstico y puro: sin red ni base, sin ninguna palabra de un cliente. Nadie lo llama todavía (2a).
 */
import { afectados, puedeProponer, type Documento } from '../cadena/dependencias-de-documentos'
import { normalizar, type Edicion, type Pedazo } from './red'

// ── 1 · «ya coincide» (R1) ─────────────────────────────────────────────────────────────────────────────
export function yaCoincide(p: Pick<Pedazo, 'texto'>, e: Pick<Edicion, 'antes' | 'despues'>): boolean {
  return p.texto.includes(e.despues) && !p.texto.includes(e.antes)
}

/** separa los candidatos: los que el código ya resuelve («ya coincide») y los que van al agente. Si no queda ninguno, NO se llama al agente. */
export function separarYaCoincide(candidatos: Pedazo[], e: Edicion): { ya_coinciden: Pedazo[]; al_agente: Pedazo[] } {
  const ya_coinciden = candidatos.filter((p) => yaCoincide(p, e))
  return { ya_coinciden, al_agente: candidatos.filter((p) => !ya_coinciden.includes(p)) }
}

// ── 2 · verificar la salida del agente ─────────────────────────────────────────────────────────────────
export interface SalidaDelAgente {
  revisados: { id: string; afecta: boolean; razon: string }[]
  colaterales: { id: string; documento: string; antes: string; despues: string; porque: string }[]
  no_aparece: { documento: string; termino: string }[]
}
export type MotivoDeRechazo = 'id_desconocido' | 'documento_distinto_al_pedazo' | 'aguas_arriba' | 'antes_no_literal_en_su_pedazo' | 'antes_igual_a_despues' | 'no_marcado_como_afecta'
export interface Retoque {
  pedazo: Pedazo
  antes: string
  despues: string
  porque: string
}
export interface Verificacion {
  /** ids de candidatos que el agente no devolvió · si hay alguno, la salida NO se acepta entera */
  faltan: string[]
  /** pedazos descartados sin razón (nota 3 CC7) · si hay alguno, la salida NO se acepta entera */
  sin_razon: string[]
  /** «no aparece» que SÍ aparece (se comprobó con búsqueda) · si hay alguno, la salida NO se acepta entera */
  no_aparece_falsos: { documento: string; termino: string }[]
  aceptados: Retoque[]
  rechazados: { id: string; motivo: MotivoDeRechazo }[]
  /** razón por pedazo descartado, para el historial */
  descartados: { pedazo: Pedazo; razon: string }[]
  /** true solo si no falta nada, no hay «no aparece» falso y todo descartado trae razón */
  completa: boolean
}

export function verificarSalida(e: Edicion, candidatos: Pedazo[], textos: Partial<Record<Documento, string>>, s: SalidaDelAgente): Verificacion {
  const porId = new Map(candidatos.map((p) => [p.id, p]))
  const revisados = new Map(s.revisados.map((r) => [r.id, r]))
  const faltan = candidatos.filter((p) => !revisados.has(p.id)).map((p) => p.id)
  const sin_razon = s.revisados.filter((r) => !r.afecta && porId.has(r.id) && !(r.razon ?? '').trim()).map((r) => r.id)
  const no_aparece_falsos = s.no_aparece.filter((x) => normalizar(textos[x.documento as Documento] ?? '').includes(normalizar(x.termino)))
  const aceptados: Retoque[] = []
  const rechazados: Verificacion['rechazados'] = []
  for (const c of s.colaterales) {
    const p = porId.get(c.id)
    if (!p) { rechazados.push({ id: c.id, motivo: 'id_desconocido' }); continue }
    if (c.documento !== p.documento) { rechazados.push({ id: c.id, motivo: 'documento_distinto_al_pedazo' }); continue }
    if (!puedeProponer(e.documento, p.documento)) { rechazados.push({ id: c.id, motivo: 'aguas_arriba' }); continue }
    if (!revisados.get(c.id)?.afecta) { rechazados.push({ id: c.id, motivo: 'no_marcado_como_afecta' }); continue }
    if (!c.antes || !p.texto.includes(c.antes)) { rechazados.push({ id: c.id, motivo: 'antes_no_literal_en_su_pedazo' }); continue }
    if (c.antes === c.despues) { rechazados.push({ id: c.id, motivo: 'antes_igual_a_despues' }); continue }
    aceptados.push({ pedazo: p, antes: c.antes, despues: c.despues, porque: c.porque })
  }
  const descartados = candidatos.filter((p) => revisados.has(p.id) && !revisados.get(p.id)!.afecta).map((p) => ({ pedazo: p, razon: revisados.get(p.id)!.razon }))
  return { faltan, sin_razon, no_aparece_falsos, aceptados, rechazados, descartados, completa: !faltan.length && !sin_razon.length && !no_aparece_falsos.length }
}

// ── 3 · aplicar en la posición del pedazo ──────────────────────────────────────────────────────────────
export class PedazoNoEncontrado extends Error {}

function porRuta(obj: unknown, ruta: string): { padre: Record<string | number, unknown>; llave: string | number } | null {
  const partes = ruta.match(/[^.[\]]+/g) ?? []
  let actual: unknown = obj
  for (let i = 0; i < partes.length - 1; i++) {
    const k = /^\d+$/.test(partes[i]) ? Number(partes[i]) : partes[i]
    actual = (actual as Record<string | number, unknown>)?.[k]
    if (actual === undefined || actual === null || typeof actual !== 'object') return null
  }
  const ult = partes.at(-1)
  if (ult === undefined) return null
  return { padre: actual as Record<string | number, unknown>, llave: /^\d+$/.test(ult) ? Number(ult) : ult }
}

/**
 * Escribe UN retoque en su pedazo y devuelve el documento nuevo.
 * Markdown: comprueba que en `inicio` esté EXACTAMENTE el texto del pedazo y reemplaza el «antes» solo dentro de esa porción.
 * JSON: va por la ruta de la llave y comprueba que el valor sea el texto del pedazo.
 * Si el pedazo ya no está igual (alguien lo tocó), lanza `PedazoNoEncontrado`: el llamador lo deja `pendiente` (nunca se pisa lo tocado después).
 */
export function aplicarEnPedazo(textoDelDocumento: string, r: Retoque): string {
  const p = r.pedazo
  if (p.ruta !== null) {
    const doc = JSON.parse(textoDelDocumento)
    const lugar = porRuta(doc, p.ruta)
    const valor = lugar ? lugar.padre[lugar.llave] : undefined
    if (!lugar || typeof valor !== 'string' || valor !== p.texto || !valor.includes(r.antes)) throw new PedazoNoEncontrado(p.ruta)
    lugar.padre[lugar.llave] = valor.replace(r.antes, r.despues)
    return JSON.stringify(doc)
  }
  const trozo = p.inicio >= 0 ? textoDelDocumento.slice(p.inicio, p.inicio + p.texto.length) : ''
  if (trozo !== p.texto || !trozo.includes(r.antes)) throw new PedazoNoEncontrado(`${p.id} en ${p.inicio}`)
  return textoDelDocumento.slice(0, p.inicio) + trozo.replace(r.antes, r.despues) + textoDelDocumento.slice(p.inicio + p.texto.length)
}

/**
 * Aplica varios retoques del MISMO documento (una versión nueva por documento y por edición · §3).
 * Se aplican de atrás hacia adelante por posición, para que un retoque no corra el desfase de otro; los que no encuentran su pedazo vuelven en `sin_aplicar`.
 * Dos retoques sobre el MISMO pedazo: el segundo ya no lo encuentra igual y queda sin aplicar (no se mezclan en silencio).
 */
export function aplicarEnDocumento(texto: string, retoques: Retoque[]): { texto: string; aplicados: Retoque[]; sin_aplicar: Retoque[] } {
  const aplicados: Retoque[] = []
  const sin_aplicar: Retoque[] = []
  let actual = texto
  for (const r of [...retoques].sort((a, b) => b.pedazo.inicio - a.pedazo.inicio)) {
    try {
      actual = aplicarEnPedazo(actual, r)
      aplicados.push(r)
    } catch (err) {
      if (err instanceof PedazoNoEncontrado) sin_aplicar.push(r)
      else throw err
    }
  }
  return { texto: actual, aplicados, sin_aplicar }
}

// ── 4 · encendido (R2) ─────────────────────────────────────────────────────────────────────────────────
/**
 * ¿se puede lanzar el motor por una edición en `doc`? Solo si TODOS los documentos que dependen de él tienen su fila de la jefatura ACTIVA.
 * `filasActivas` se lee de la base EN ESTE INSTANTE (al guardar, y otra vez al aplicar): nunca se guarda un permiso.
 * Si no se cumple, «Editar» guarda como hoy, sin motor, y deja la nota «no se revisaron colaterales: falta la fila de X» (adenda 4).
 */
export function puedeLanzarMotor(doc: Documento, filasActivas: ReadonlySet<string>): { ok: boolean; faltan: Documento[] } {
  const faltan = afectados(doc).filter((d) => !filasActivas.has(d))
  return { ok: faltan.length === 0, faltan }
}

/** ¿se puede APLICAR un retoque en `destino` ahora? (H1 + línea 3 CC7: la política se vuelve a leer al aplicar; si se apagó, queda pendiente) */
export function puedeAplicarEn(destino: Documento, filasActivas: ReadonlySet<string>): boolean {
  return filasActivas.has(destino)
}

/** nota del historial cuando R2 no se cumple (adenda 4) */
export const notaSinColaterales = (faltan: readonly Documento[]): string => `no se revisaron colaterales: falta la fila activa de ${faltan.join(', ')}`
