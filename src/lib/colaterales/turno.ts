/**
 * COLATERALES · tramo 2d · parte 3 · el TURNO del servidor, la ENTREGA de la secretaria y el BARRIDO (CC1 · certifican CC7 y CC6).
 * Diseño: raw/tasks/2026-11-11-DISENO-CC1-...-colaterales-2d-flujo-una-edicion.md (+ ADENDA 1) · líneas de CC7 (5) y de CC6 (3).
 *
 * TURNO (no gasta): toma la edición (recibida → en_curso, condicional: la misma edición dos veces = UNA corrida) y, desde ahí, TODA salida
 * deja la edición en su estado FINAL (línea 3 de CC7): R2 sin filas → sin_motor · guarda de piezas → sin_motor · nada para el agente →
 * sin_colaterales · tope → fallida · error al leer → sin_motor (falla cerrado). Si queda trabajo, devuelve el PEDIDO de la secretaria
 * con su llave de despacho fija (`colaterales:<id>:secretaria`, para `una_sola_vez` de run-sdk) y el SELLO de los pedazos enviados.
 * SECO: calcula lo mismo y NO escribe nada (ni la toma): devuelve lo que habría hecho.
 * ENTREGAR: gravedad primero (🔴 → de_fondo y nadie más se llama) · los pedazos se recalculan y deben dar el MISMO sello (si un documento
 * cambió entretanto → fallida) · la salida se verifica entera (motor 2a) · lo verificado queda `propuesto`; lo descartado con su razón.
 * La jefatura (parte 4) se abre después: aquí nada se aplica.
 * BARRER: una edición `en_curso` más vieja que el plazo pasa a `fallida` (condicional). Nada se aplica.
 * El turno NO lee el manual del cliente (ni `human_validated` ni `gate_outcome`): el registro lo juzga la jefatura contra el manual.
 * Agnóstico: ninguna palabra, regla ni dato de un cliente.
 */
import { createHash } from 'node:crypto'
import { afectados, type Documento } from '../cadena/dependencias-de-documentos'
import { INSTRUCCION_DE_GRAVEDAD, gravedadVerificada, type VeredictoDeGravedad } from './gravedad'
import { notaSinColaterales, puedeLanzarMotor, separarYaCoincide, verificarSalida, type SalidaDelAgente } from './motor'
import { red, type Pedazo } from './red'
import type { almacenDeColaterales, Edicion, NuevoRetoque } from './almacen'
import { notaDeLaGuarda, type ResultadoDeLaGuarda } from '../oficina/piezas-por-publicar'

type Almacen = ReturnType<typeof almacenDeColaterales>

/** la secretaria (RESPUESTA Lenovo 10-nov: no tiene papel en la jefatura) */
export const AGENTE_SECRETARIA = 'content-creator'
/** tope de la llamada a la secretaria · la reserva del freno es tope × 1,3 */
export const TOPE_DE_LA_LLAMADA_USD = 0.35
export const FACTOR_DE_RESERVA = 1.3
/** tope de «Editar» por edición (CRITERIOS v2: hasta US$ 0,50) */
export const TOPE_POR_EDICION_USD = 0.5
/** tope diario de colaterales por cliente (decisión pendiente de Lenovo; mientras tanto, este) */
export const TOPE_DIARIO_DEL_CLIENTE_USD = 2
/** una edición `en_curso` más vieja que esto la cierra el barrido (ADENDA 1) */
export const PLAZO_DEL_BARRIDO_MS = 2 * 60 * 60 * 1000
/** los documentos que viven en UNA campaña (su referencia es la campaña); manual y plan son del cliente */
export const DOCUMENTOS_DE_CAMPANA: ReadonlySet<Documento> = new Set<Documento>(['estrategia', 'brief', 'gran_idea', 'calendario'])

export const llaveDeLaSecretaria = (edicion_id: string): string => `colaterales:${edicion_id}:secretaria`

export interface DocumentoLeido { texto: string; ref: string; version: string }
export interface PuertosDelTurno {
  almacen: Almacen
  /** las filas ACTIVAS de la jefatura, leídas en este instante (nunca se guarda un permiso) */
  filasActivas(): Promise<ReadonlySet<string>>
  /** la guarda de la oficina (#1020) · lanza si no puede leer */
  piezasPorPublicar(client_id: string, campana_id: string | null): Promise<ResultadoDeLaGuarda>
  /** la versión vigente de cada documento de aguas abajo (los que no tienen lector no vienen) */
  documentos(e: Edicion, docs: Documento[]): Promise<Partial<Record<Documento, DocumentoLeido>>>
  /** 11-nov · línea de CC6 (1022 🟡): la campaña de un documento de campaña es DE ESTE cliente · lanza si no puede leer */
  campanaDelCliente(client_id: string, campana_id: string): Promise<boolean>
  /**
   * El gasto de colaterales del cliente HOY (UTC), sin la edición que pregunta · línea de CC7 (1022 🟡): `recibos` = recibos con fecha de hoy
   * (por la fecha del recibo, no de la creación de la edición) · `en_vuelo` = ediciones del cliente tomadas (en_curso) SIN recibo todavía:
   * cada una cuenta su reserva (la vuelta de la secretaria es asíncrona: entre el pedido y su recibo hay una ventana). Lanza si no puede leer.
   */
  gastoDelDia(client_id: string, sin_edicion: string): Promise<{ recibos: number; en_vuelo: number }>
}

export type ResultadoDelTurno =
  | { accion: 'ya_corrida'; estado: string }
  | { accion: 'sin_motor'; nota: string }
  | { accion: 'sin_colaterales'; nota: string | null; ya_coinciden: number }
  | { accion: 'fallida'; motivo: string }
  | { accion: 'pedir'; agente: string; pedido: string; tope_usd: number; dispatch_key: string; sello: string; candidatos: string[]; nota: string | null }

// ── el pedido ──────────────────────────────────────────────────────────────────────────────────────────
/** el pedido de la secretaria (forma del ensayo 3: solo los pedazos candidatos, cada uno con su documento y su sección) */
export function pedidoDeLaSecretaria(e: Pick<Edicion, 'documento' | 'seccion' | 'antes' | 'despues'>, candidatos: Pedazo[]): string {
  const destinos = [...new Set(candidatos.map((p) => p.documento))]
  return [
    'Revisas los colaterales de una edición en los documentos de marketing de un cliente. NO uses herramientas. Responde solo con el objeto JSON pedido.',
    '',
    `EDICIÓN: en «${e.documento}», sección «${e.seccion}», el dueño cambió`,
    `ANTES: «${e.antes}»`,
    `DESPUÉS: «${e.despues}»`,
    `Solo puedes proponer cambios en: ${destinos.join(', ')}.`,
    '',
    `0. «gravedad»: ${INSTRUCCION_DE_GRAVEDAD}`,
    'Abajo van TODOS los pedazos de esos documentos que comparten palabras con la edición, cada uno con su documento y su sección.',
    '1. «revisados»: decide UNO POR UNO si cada pedazo queda desalineado por la edición (afecta true/false), con una razón corta también cuando no afecta. Devuelve TODOS los ids.',
    '2. «colaterales»: por cada pedazo que afecta, su id, su documento, el fragmento EXACTO copiado letra por letra («antes», lo más corto posible), su retoque MÍNIMO («despues»: cambia solo lo necesario, mismo estilo y registro del documento) y el porqué en una línea. Si el pedazo ya dice lo mismo que el DESPUÉS, NO lo toques.',
    '3. «no_aparece»: si afirmas que un documento NO menciona algo relacionado con la edición, decláralo (documento + término exacto). Se comprobará.',
    'No inventes efectos.',
    'Forma: {"gravedad":{"de_fondo":false,"razon":"..."},"revisados":[{"id":"C1","afecta":true,"razon":"..."}],"colaterales":[{"id":"C1","documento":"...","antes":"...","despues":"...","porque":"..."}],"no_aparece":[]}',
    '',
    'PEDAZOS:',
    ...candidatos.map((p) => `[${p.id}] (${p.documento} · ${p.seccion}) ${p.texto}`),
  ].join('\n')
}

/** el sello de lo que se le mandó: los pedazos (id, documento, posición, texto) y la versión de cada documento */
export function selloDe(candidatos: Pedazo[], docs: Partial<Record<Documento, DocumentoLeido>>): string {
  const versiones = Object.entries(docs).map(([d, x]) => [d, x?.ref, x?.version]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const pedazos = candidatos.map((p) => [p.id, p.documento, p.seccion, p.inicio, p.ruta, p.texto])
  return createHash('sha256').update(JSON.stringify({ versiones, pedazos })).digest('hex').slice(0, 32)
}

const textosDe = (docs: Partial<Record<Documento, DocumentoLeido>>): Partial<Record<Documento, string>> =>
  Object.fromEntries(Object.entries(docs).map(([d, x]) => [d, x!.texto])) as Partial<Record<Documento, string>>

/** los pedazos de aguas abajo, separados en «ya coincide» (código) y los que van al agente · más los documentos sin lector */
async function pedazosDe(P: PuertosDelTurno, e: Edicion) {
  const docs = afectados(e.documento)
  const leidos = await P.documentos(e, docs)
  const sin_lector = docs.filter((d) => !leidos[d])
  const { candidatos } = red({ documento: e.documento, seccion: e.seccion, antes: e.antes, despues: e.despues }, textosDe(leidos))
  return { leidos, sin_lector, candidatos, ...separarYaCoincide(candidatos, e) }
}

const nuevoRetoque = (p: Pedazo, d: DocumentoLeido, x: Pick<NuevoRetoque, 'afecta' | 'razon' | 'antes' | 'despues' | 'porque' | 'estado'>): NuevoRetoque => ({ pedazo: p, documento_ref: d.ref, version_base: d.version, ...x })
const unirNotas = (...n: (string | null | undefined)[]): string | null => (n.filter(Boolean).length ? n.filter(Boolean).join(' · ') : null)

// ── el turno ───────────────────────────────────────────────────────────────────────────────────────────
export async function turno(P: PuertosDelTurno, p: { edicion_id: string; seco: boolean; workflow_execution_id: string | null }): Promise<ResultadoDelTurno> {
  const e = await P.almacen.edicion(p.edicion_id)
  if (!e) return { accion: 'fallida', motivo: 'edicion_no_existe' }
  if (e.estado !== 'recibida') return { accion: 'ya_corrida', estado: e.estado }
  // en seco nada se escribe: la «toma» se da por hecha y cada salida solo se informa
  if (!p.seco && !(await P.almacen.pasarEdicion(e.id, 'recibida', 'en_curso', p.workflow_execution_id ? { workflow_execution_id: p.workflow_execution_id } : {}))) {
    return { accion: 'ya_corrida', estado: 'en_curso' }
  }
  const cerrar = async (a: 'sin_motor' | 'sin_colaterales' | 'fallida', nota: string): Promise<void> => {
    if (p.seco) return
    if (!(await P.almacen.pasarEdicion(e.id, 'en_curso', a, { nota }))) throw new Error(`la edición ${e.id} cambió de estado antes de cerrarse como ${a}`)
  }
  try {
    // R2 · en este instante
    const r2 = puedeLanzarMotor(e.documento, await P.filasActivas())
    if (!r2.ok) { const nota = notaSinColaterales(r2.faltan); await cerrar('sin_motor', nota); return { accion: 'sin_motor', nota } }
    // la campaña del documento editado es de ESTE cliente (si no, ni la guarda ni los lectores miran la de otro)
    if (DOCUMENTOS_DE_CAMPANA.has(e.documento)) {
      let propia: boolean
      try { propia = await P.campanaDelCliente(e.client_id, e.documento_ref) } catch (x) {
        const nota = `no se pudo comprobar de quién es la campaña (frena): ${x instanceof Error ? x.message : String(x)}`
        await cerrar('sin_motor', nota); return { accion: 'sin_motor', nota }
      }
      if (!propia) { const nota = `la campaña ${e.documento_ref} no existe o no es de este cliente (frena)`; await cerrar('sin_motor', nota); return { accion: 'sin_motor', nota } }
    }
    // guarda mínima · solo si alguna pieza depende del documento
    let notaDeSuposicion: string | null = null
    if (afectados(e.documento).includes('pieza')) {
      let g: ResultadoDeLaGuarda
      try { g = await P.piezasPorPublicar(e.client_id, DOCUMENTOS_DE_CAMPANA.has(e.documento) ? e.documento_ref : null) } catch (x) {
        const nota = `no se pudo leer si hay piezas por publicar (frena): ${x instanceof Error ? x.message : String(x)}`
        await cerrar('sin_motor', nota); return { accion: 'sin_motor', nota }
      }
      if (g.frenan.length) { const nota = notaDeLaGuarda(g) as string; await cerrar('sin_motor', nota); return { accion: 'sin_motor', nota } }
      notaDeSuposicion = notaDeLaGuarda(g)
    }
    // red de palabras + R1
    const x = await pedazosDe(P, e)
    const notaSinLector = x.sin_lector.length ? `sin lector todavía: ${x.sin_lector.join(', ')} (no se revisaron)` : null
    if (!p.seco && x.ya_coinciden.length) {
      await P.almacen.guardarRetoques(e.id, x.ya_coinciden.map((pz) => nuevoRetoque(pz, x.leidos[pz.documento]!, { afecta: false, razon: 'ya coincide con el después', antes: null, despues: null, porque: null, estado: 'ya_coincide' })))
    }
    if (!x.al_agente.length) {
      const nota = unirNotas(notaDeSuposicion, notaSinLector, 'nada para el agente')
      await cerrar('sin_colaterales', nota as string)
      return { accion: 'sin_colaterales', nota, ya_coinciden: x.ya_coinciden.length }
    }
    // topes · sin reintento: un tope cierra la edición
    const reserva = TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA
    if (reserva > TOPE_POR_EDICION_USD) { await cerrar('fallida', 'tope: la reserva supera el tope por edición'); return { accion: 'fallida', motivo: 'tope_por_edicion' } }
    const g = await P.gastoDelDia(e.client_id, e.id)
    const hoy = g.recibos + g.en_vuelo * reserva
    if (hoy + reserva > TOPE_DIARIO_DEL_CLIENTE_USD) { await cerrar('fallida', `tope diario del cliente: recibos ${g.recibos.toFixed(2)} + ${g.en_vuelo} en vuelo × ${reserva.toFixed(2)} + esta reserva ${reserva.toFixed(2)} > ${TOPE_DIARIO_DEL_CLIENTE_USD}`); return { accion: 'fallida', motivo: 'tope_diario' } }
    return {
      accion: 'pedir', agente: AGENTE_SECRETARIA, pedido: pedidoDeLaSecretaria(e, x.al_agente), tope_usd: TOPE_DE_LA_LLAMADA_USD,
      dispatch_key: llaveDeLaSecretaria(e.id), sello: selloDe(x.al_agente, x.leidos), candidatos: x.al_agente.map((pz) => pz.id), nota: unirNotas(notaDeSuposicion, notaSinLector),
    }
  } catch (err) {
    // falla cerrado: un error al leer deja la edición en un estado FINAL (nunca colgada en en_curso)
    const nota = `error en el turno (frena): ${err instanceof Error ? err.message : String(err)}`
    if (!p.seco) await P.almacen.pasarEdicion(e.id, 'en_curso', 'sin_motor', { nota }).catch(() => false)
    return { accion: 'sin_motor', nota }
  }
}

// ── la entrega de la secretaria ────────────────────────────────────────────────────────────────────────
export type ResultadoDeEntregar =
  | { accion: 'ya_cerrada'; estado: string }
  | { accion: 'de_fondo'; motivo: string }
  | { accion: 'fallida'; motivo: string }
  | { accion: 'sin_colaterales'; descartados: number }
  | { accion: 'propuestos'; propuestos: number; descartados: number; rechazados: { id: string; motivo: string }[]; documentos: Documento[] }

/** la salida del agente, leída sin confiar en su forma (cualquier cosa rara = null) */
export function leerSalida(v: unknown): (SalidaDelAgente & { gravedad: VeredictoDeGravedad | null }) | null {
  const o = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  if (!o(v)) return null
  const lista = (x: unknown): Record<string, unknown>[] | null => (Array.isArray(x) && x.every(o) ? (x as Record<string, unknown>[]) : null)
  const rev = lista(v.revisados), col = lista(v.colaterales), na = lista(v.no_aparece ?? [])
  if (!rev || !col || !na) return null
  const s = (x: unknown) => (typeof x === 'string' ? x : '')
  const g = o(v.gravedad) && typeof v.gravedad.de_fondo === 'boolean' ? { de_fondo: v.gravedad.de_fondo, razon: s(v.gravedad.razon) } : null
  return {
    gravedad: g,
    revisados: rev.map((r) => ({ id: s(r.id), afecta: r.afecta === true, razon: s(r.razon) })),
    colaterales: col.map((c) => ({ id: s(c.id), documento: s(c.documento), antes: s(c.antes), despues: s(c.despues), porque: s(c.porque) })),
    no_aparece: na.map((n) => ({ documento: s(n.documento), termino: s(n.termino) })),
  }
}

export async function entregar(P: PuertosDelTurno, p: { edicion_id: string; sello: string; salida: unknown }): Promise<ResultadoDeEntregar> {
  const e = await P.almacen.edicion(p.edicion_id)
  if (!e) return { accion: 'fallida', motivo: 'edicion_no_existe' }
  if (e.estado !== 'en_curso') return { accion: 'ya_cerrada', estado: e.estado }
  const fallar = async (motivo: string, nota: string): Promise<ResultadoDeEntregar> => {
    const ok = await P.almacen.pasarEdicion(e.id, 'en_curso', 'fallida', { nota })
    return ok ? { accion: 'fallida', motivo } : { accion: 'ya_cerrada', estado: 'cambió' }
  }
  const s = leerSalida(p.salida)
  if (!s) return fallar('salida_ilegible', 'la salida de la secretaria no tiene la forma pedida (no se le vuelve a pedir)')
  // 1 · gravedad PRIMERO: un 🔴 no abre revisiones ni propone nada (H4)
  const g = gravedadVerificada(s.gravedad, e.antes, e.despues)
  if (g.gravedad === 'fondo') {
    const ok = await P.almacen.pasarEdicion(e.id, 'en_curso', 'de_fondo', { gravedad: 'fondo', gravedad_motivo: g.motivo, nota: 'de fondo: va por «Pedir cambios», no por «Editar»' })
    return ok ? { accion: 'de_fondo', motivo: g.motivo } : { accion: 'ya_cerrada', estado: 'cambió' }
  }
  // 2 · los mismos pedazos que se mandaron (si un documento cambió entretanto, no se sigue)
  const x = await pedazosDe(P, e)
  if (selloDe(x.al_agente, x.leidos) !== p.sello) return fallar('documentos_cambiaron', 'un documento de aguas abajo cambió entre el pedido y la entrega')
  // 3 · la salida entera, verificada por el código
  const v = verificarSalida(e, x.al_agente, textosDe(x.leidos), s)
  if (!v.completa) return fallar('salida_incompleta', `salida incompleta: faltan ${v.faltan.join(', ') || '-'} · sin razón ${v.sin_razon.join(', ') || '-'} · «no aparece» falsos ${v.no_aparece_falsos.length}`)
  const retoques: NuevoRetoque[] = [
    ...v.descartados.map((d) => nuevoRetoque(d.pedazo, x.leidos[d.pedazo.documento]!, { afecta: false, razon: d.razon, antes: null, despues: null, porque: null, estado: 'descartado' })),
    ...v.aceptados.map((r) => nuevoRetoque(r.pedazo, x.leidos[r.pedazo.documento]!, { afecta: true, razon: r.porque || 'afecta', antes: r.antes, despues: r.despues, porque: r.porque, estado: 'propuesto' })),
  ]
  await P.almacen.guardarRetoques(e.id, retoques)
  if (!v.aceptados.length) {
    const ok = await P.almacen.pasarEdicion(e.id, 'en_curso', 'sin_colaterales', { gravedad: 'normal', gravedad_motivo: g.motivo, nota: unirNotas('la secretaria no encontró nada que retocar', v.rechazados.length ? `rechazados por el código: ${v.rechazados.map((r) => `${r.id} ${r.motivo}`).join(', ')}` : null) })
    return ok ? { accion: 'sin_colaterales', descartados: v.descartados.length } : { accion: 'ya_cerrada', estado: 'cambió' }
  }
  // quedan `propuesto` y la edición sigue en_curso: la jefatura los juzga (parte 4) · si nunca vuelve, el barrido la cierra
  return { accion: 'propuestos', propuestos: v.aceptados.length, descartados: v.descartados.length, rechazados: v.rechazados, documentos: [...new Set(v.aceptados.map((r) => r.pedazo.documento))] }
}

// ── el barrido ─────────────────────────────────────────────────────────────────────────────────────────
export async function barrer(P: Pick<PuertosDelTurno, 'almacen'>, ahora: Date): Promise<{ cerradas: string[] }> {
  const limite = new Date(ahora.getTime() - PLAZO_DEL_BARRIDO_MS).toISOString()
  const colgadas = await P.almacen.edicionesEnCursoAntesDe(limite)
  const cerradas: string[] = []
  for (const id of colgadas) {
    if (!(await P.almacen.pasarEdicion(id, 'en_curso', 'fallida', { nota: 'el barrido la cerró: más de 2 h en curso sin terminar (nada se aplicó)' }))) continue
    // lo que esperaba juicio (o ya aprobado sin aplicar) va a una persona: `pendiente` nunca se aplica solo
    for (const de of ['propuesto', 'aprobado'] as const) await P.almacen.pasarRetoquesDeEdicion(id, de, 'pendiente', 'la edición se cerró sin terminar: lo decide una persona')
    cerradas.push(id)
  }
  return { cerradas }
}
