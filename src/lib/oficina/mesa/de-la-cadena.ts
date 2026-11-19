/**
 * LAS MESAS DE LA CADENA (31-oct · nuevo orden, T2) · `brief_mesa` (el brief creativo de la campaña: UN miembro + el portero) y `concepto_mesa` (la gran idea, los capítulos y el banco: el equipo creativo, dos rondas).
 * Es la misma mesa del 28-oct (tablero, turnos, directorio vivo, libro de aportes, cotas, tope); lo que cambia: el encargo no nace de un brief de la sala sino de una campaña de la cadena
 * (`parte_id` = la campaña, `brief_id` = `brf-<campaña>-v<n>` / `con-<campaña>-v<n>`), no hay imágenes ni traductor ni jefatura propia, y la entrega NO va a la bandeja: va a la cadena por su puerto.
 * Heredan el molde de la mesa de ideas del calendario (rama congelada `7f4503f`, certificada por CC3). Aquí nada habla con un modelo.
 */
import { datos } from '../ayudas'
import type { Respuesta } from '../orquestador'
import type { FotoEtiquetada } from '../fotos'
import type { Cambios, Encargo, Puertos } from '../puertos'
import { estadoInicial, type Estado } from '../tipos'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'
import { esCritica } from './critica'
import { claveDeTexto, leerConcepto, leerIdea, type InsumosDelBanco } from '../../cadena/conceptos'

export type TipoDeMesaDeLaCadena = 'brief' | 'concepto' | 'reubicacion' | 'fallidos' | 'banco'
export const FAMILIA_DE: Record<TipoDeMesaDeLaCadena, string> = { brief: 'brief_mesa', concepto: 'concepto_mesa', reubicacion: 'reubicacion_mesa', fallidos: 'fallidos_mesa', banco: 'banco_mesa' }
export const ARTEFACTO_MARCO = 'marco_cadena'
export const esDeLaCadenaLaFamilia = (familia: string): boolean => Object.values(FAMILIA_DE).includes(familia)
const PREFIJO_DEL_ID: Record<TipoDeMesaDeLaCadena, string> = { brief: 'brf', concepto: 'con', reubicacion: 'reu', fallidos: 'fal', banco: 'bco' }
const TOPE_POR_OMISION_USD: Record<TipoDeMesaDeLaCadena, number> = { brief: 1.6, concepto: 5, reubicacion: 3, fallidos: 2, banco: 1.5 }

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** lo que la cadena le pasa a la oficina para abrir una mesa de la campaña */
export interface SobreDeLaCadena { tipo_de_mesa: TipoDeMesaDeLaCadena; client_id: string; campana_id: string; version: number; marco_texto: string; dry_run: boolean; /** 19-nov · G4 (CC5): el plan entero que manda la cadena (la mesa del brief); sin él, el de las fuentes */ plan_texto?: string; /** 17-nov · solo BAJA el tope de la plantilla (el reintento de una corrección del banco va dentro del MISMO tope: lo que queda) */ tope_usd?: number; /** condiciones del directorio que la estrategia activa (`si_instagram`, `si_video`…): las calcula la CADENA del plan de canales, no la oficina */ condiciones: string[]; /** 18-nov · relleno del banco: solo la mesa de concepto; sin esto la mesa entrega el banco como esté (como antes) */ insumos_del_banco?: InsumosDelBanco }

/** lo que viaja dentro del encargo (artefacto `marco_cadena`): el contexto de la cadena + lo que el cliente tiene (manual, plan, fotos) leído UNA vez al abrir */
export interface MarcoDeLaCadena {
  tipo_de_mesa: TipoDeMesaDeLaCadena
  campana_id: string; version: number
  cliente_nombre: string; manual_texto: string; plan_texto: string | null
  marco_texto: string
  condiciones: string[]
  fotos: FotoEtiquetada[]
  /** 18-nov · relleno del banco (solo concepto): fases con semanas y redes con huecos, para contar el banco con la misma lectura de la cadena */
  insumos_del_banco?: InsumosDelBanco
}
export const marcoDe = (e: Estado): MarcoDeLaCadena | null => (datos(e, ARTEFACTO_MARCO) as unknown as MarcoDeLaCadena | undefined) ?? null

/** el id del encargo: cabe en las 40 posiciones que admite el nombre de un brief y es distinto por campaña, mesa y versión */
export const briefIdDeLaCadena = (tipo: TipoDeMesaDeLaCadena, campanaId: string, version: number): string => `${PREFIJO_DEL_ID[tipo]}-${campanaId.replace(/-/g, '').slice(0, 12)}-v${version}`

export function validarSobreDeLaCadena(x: unknown): { ok: true; sobre: SobreDeLaCadena } | { ok: false; errores: string[] } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, errores: ['el cuerpo debe ser un objeto'] }
  const b = x as Record<string, unknown>
  const errores: string[] = []
  if (b.tipo_de_mesa !== 'brief' && b.tipo_de_mesa !== 'concepto' && b.tipo_de_mesa !== 'reubicacion' && b.tipo_de_mesa !== 'fallidos' && b.tipo_de_mesa !== 'banco') errores.push('`tipo_de_mesa` debe ser «brief», «concepto», «reubicacion», «fallidos» o «banco»')
  if (typeof b.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser verdadero o falso (ausente = no se gasta nada)')
  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) errores.push('`client_id` debe ser un uuid')
  if (typeof b.campana_id !== 'string' || !UUID.test(b.campana_id)) errores.push('`campana_id` debe ser un uuid')
  if (!Number.isInteger(b.version) || (b.version as number) < 1) errores.push('`version` debe ser un entero positivo')
  if (typeof b.marco_texto !== 'string' || b.marco_texto.trim().length < 20) errores.push('`marco_texto` falta (el marco de la mesa)')
  if (b.condiciones !== undefined && (!Array.isArray(b.condiciones) || b.condiciones.some((c) => typeof c !== 'string' || !/^si_[a-z0-9_]{1,30}$/.test(c)))) errores.push('`condiciones` debe ser una lista de claves `si_…`')
  if (b.plan_texto !== undefined && b.plan_texto !== null && typeof b.plan_texto !== 'string') errores.push('`plan_texto` debe ser texto')
  if (b.tope_usd !== undefined && (typeof b.tope_usd !== 'number' || !Number.isFinite(b.tope_usd) || b.tope_usd <= 0)) errores.push('`tope_usd` debe ser un número positivo')
  const ib = insumosDelBancoDelSobre(b.insumos_del_banco, b.tipo_de_mesa)
  if (typeof ib === 'string') errores.push(ib)
  if (errores.length) return { ok: false, errores }
  return { ok: true, sobre: { ...(typeof b.plan_texto === 'string' && b.plan_texto.trim() ? { plan_texto: b.plan_texto } : {}), ...(typeof b.tope_usd === 'number' ? { tope_usd: b.tope_usd } : {}), ...(ib && typeof ib === 'object' ? { insumos_del_banco: ib } : {}), condiciones: ((b.condiciones as string[] | undefined) ?? []).slice(0, 20), tipo_de_mesa: b.tipo_de_mesa as TipoDeMesaDeLaCadena, client_id: b.client_id as string, campana_id: b.campana_id as string, version: b.version as number, marco_texto: (b.marco_texto as string).slice(0, TOPE_REAL_DEL_PEDIDO), dry_run: b.dry_run as boolean } }
}

/**
 * 18-nov · relleno del banco: los insumos del banco que trae el sobre (solo en la mesa de concepto). Ausente ⇒ null (la mesa entrega como antes).
 * Mal formados ⇒ el error (texto). Se copian solo los campos conocidos y con tope de tamaño: el sobre viene de fuera.
 */
function insumosDelBancoDelSobre(x: unknown, tipo: unknown): InsumosDelBanco | null | string {
  if (x === undefined || x === null) return null
  const mal = '`insumos_del_banco` debe ser { fases: [{ clave, semanas }], redes: [{ red, huecos_por_semana }] } y solo va en la mesa de concepto'
  if (tipo !== 'concepto' || typeof x !== 'object' || Array.isArray(x)) return mal
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.fases) || !Array.isArray(o.redes) || o.fases.length > 20 || o.redes.length > 20) return mal
  const fases: InsumosDelBanco['fases'] = []
  for (const f of o.fases as unknown[]) {
    const g = f as Record<string, unknown> | null
    if (!g || typeof g.clave !== 'string' || !/^[A-Za-z0-9_]{1,40}$/.test(g.clave) || typeof g.semanas !== 'number' || !Number.isFinite(g.semanas) || g.semanas < 0 || g.semanas > 60) return mal
    fases.push({ clave: g.clave, semanas: g.semanas })
  }
  const redes: InsumosDelBanco['redes'] = []
  for (const r0 of o.redes as unknown[]) {
    const g = r0 as Record<string, unknown> | null
    if (!g || typeof g.red !== 'string' || !g.red.trim() || g.red.length > 40 || typeof g.huecos_por_semana !== 'number' || !Number.isFinite(g.huecos_por_semana) || g.huecos_por_semana < 0 || g.huecos_por_semana > 30) return mal
    redes.push({ red: g.red, huecos_por_semana: g.huecos_por_semana })
  }
  return { fases, redes }
}

/**
 * Abre una mesa de la cadena. Idempotente por (campaña, brief_id): un sobre repetido devuelve el encargo que ya existe. La plantilla debe estar ACTIVA.
 * Devuelve lo que devuelve `avanzar`: el primer turno (el marco de la dirección) para que el flujo `oficina · turno` lo corra.
 */
export async function abrirMesaDeLaCadena(P: Puertos, s: SobreDeLaCadena, avanzar: (P: Puertos, id: string) => Promise<Respuesta>): Promise<Respuesta> {
  const familia = FAMILIA_DE[s.tipo_de_mesa]
  const pl = await P.almacen.leerPlantilla(familia)
  if (!pl) return r(404, { error: 'plantilla_desconocida', familia })
  if (!pl.activo) return r(409, { error: 'plantilla_inactiva', familia })
  if (!P.mesa) return r(409, { error: 'mesa_sin_puerto', detalle: 'la mesa no tiene su puerto (libro y directorio) configurado' })
  const fu = await P.fuentes(s.client_id)
  if ('error' in fu) return r(409, { error: 'sin_fuentes', detalle: fu.error })
  // 19-nov · h2 de CC6: un plan en blanco del sobre no pisa el de las fuentes
  const marco: MarcoDeLaCadena = { tipo_de_mesa: s.tipo_de_mesa, campana_id: s.campana_id, version: s.version, cliente_nombre: fu.cliente_nombre, manual_texto: fu.manual_texto, plan_texto: s.plan_texto?.trim() ? s.plan_texto : fu.plan_texto, marco_texto: s.marco_texto, condiciones: s.condiciones, fotos: fu.fotos, ...(s.insumos_del_banco ? { insumos_del_banco: s.insumos_del_banco } : {}) }
  const e0: Estado = estadoInicial()
  const estado: Estado = { ...e0, artefactos: { ...e0.artefactos, [ARTEFACTO_MARCO]: { version: 1, version_consumida: 0, datos: marco as unknown as Record<string, unknown> } } }
  const topeDeLaPlantilla = pl.plantilla.limites.tope_encargo_usd ?? TOPE_POR_OMISION_USD[s.tipo_de_mesa]
  const tope = s.tope_usd !== undefined ? Math.min(topeDeLaPlantilla, s.tope_usd) : topeDeLaPlantilla
  const c = await P.almacen.crearEncargo({
    client_id: s.client_id, parte_id: s.campana_id, brief_id: briefIdDeLaCadena(s.tipo_de_mesa, s.campana_id, s.version), tipo_de_grupo: pl.plantilla.tipo, familia,
    tope_usd: tope, dry_run: s.dry_run, prueba: false, sala_ref: { origen: 'cadena', tipo_de_mesa: s.tipo_de_mesa, campana_id: s.campana_id, version: s.version }, estado_del_motor: estado,
  })
  if (!c.ok) return r(500, { error: 'almacen_error', detalle: c.error })
  if (!c.nuevo) return r(200, { accion: 'ya_existia', encargo_id: c.encargo.id, estado: c.encargo.estado })
  const sal = await avanzar(P, c.encargo.id)
  return r(sal.status, { ...sal.cuerpo, encargo_id: c.encargo.id })
}

/** el título de la sección que la mesa de CONCEPTO agrega al tablero con las líneas de idea de los aportes de los miembros */
export const TITULO_IDEAS_DE_LOS_APORTES = '## Banco de ideas · líneas de los aportes del equipo'
/** una línea de idea del banco (`- C<x>-I<nn> · …`), aunque venga envuelta en `código` o en **negrita** como la escriben los miembros */
const RE_LINEA_DE_IDEA_EN_APORTE = /^\s*(?:[-*•]|\d+[.)])\s+[`*]*C[A-Za-z0-9_]+-I\d{2,}[`*]*\s*·/
/** la línea tal como la lee la cadena: viñeta «- », sin el envoltorio de código ni de negrita alrededor del id y al final */
export function lineaDeIdeaLimpia(linea: string): string {
  const m = /^\s*(?:[-*•]|\d+[.)])\s+[`*]*(C[A-Za-z0-9_]+-I\d{2,})[`*]*\s*·\s*(.*)$/.exec(linea)
  if (!m) return linea.trim()
  return `- ${m[1]} · ${m[2].replace(/[`*]+\s*$/, '').trim()}`
}

/**
 * 09-nov (GO de Lenovo · falso rojo de una gran idea real, encargo 577c6038): en la mesa de CONCEPTO el banco de ideas lo escriben los MIEMBROS en sus aportes; la integración de la
 * dirección solo cita los ids. Antes viajaba solo la integración y la cadena (`leerConcepto`, que lee el banco «de todo el texto: integración + aportes») no encontraba
 * ninguna idea con mensaje y gancho → `sin_concepto`. Ahora, detrás de la integración, va una sección con las LÍNEAS DE IDEA de los aportes (solo esas líneas: el resto de
 * los aportes no entra, para que sus títulos no se confundan con las secciones del concepto).
 *  · Qué aportes: los de los miembros (no la dirección) tipo `aporta`/`responde`. Si la integración cita aportes (`A23`), van primero los citados, en el orden en que los
 *    cita; después el resto, del más nuevo al más viejo. Cuando dos miembros usaron el mismo id, la PRIMERA línea conserva el id (así manda la elección de la
 *    dirección) y, desde el 18-nov, las otras se renumeran dentro de su capítulo en vez de perderse como «id duplicado».
 *  · Sin integración, o en la mesa del brief, nada cambia.
 */
export function ideasDeLosAportes(libro: Array<{ n?: number; de: string; tipo: string; texto: string }>, integracion: string): string[] {
  const dir = [...libro].reverse().find((a) => a.tipo === 'integra')?.de ?? null
  // Sprint 4 · E · la crítica cita ideas para confrontarlas, no las propone: sus líneas no entran al banco
  const aportes = libro.filter((a) => (a.tipo === 'aporta' || a.tipo === 'responde') && a.de !== dir && a.texto.trim() && !esCritica(a.texto))
  const citados: number[] = []
  for (const m of integracion.matchAll(/\bA(\d{1,4})\b/g)) { const n = Number(m[1]); if (!citados.includes(n)) citados.push(n) }
  const orden = [
    ...citados.map((n) => aportes.find((a) => a.n === n)).filter((a): a is (typeof aportes)[number] => !!a),
    ...[...aportes].reverse().filter((a) => a.n === undefined || !citados.includes(a.n)),
    // 18-nov · relleno del banco: lo que la dirección escribió para completar las cuotas va AL FINAL (nunca le quita el id a una idea del equipo; si choca, se renumera)
    ...libro.filter((a) => a.tipo === 'aporta' && a.de === dir && esRellenoDelBanco(a.texto)),
  ]
  // 18-nov · ids únicos (corrección de CC1 · GO Lenovo 13:08Z, dentro de la (b)): cada miembro numera desde C1-I01, así que dos aportes chocan con ideas DISTINTAS
  // y la cadena botaba la segunda como «id duplicado» (T7d, concepto 5: 39 de 71). Ahora la segunda se RENUMERA dentro de su capítulo. Lo que no cambia:
  //  · la primera línea con ese id (la integración, luego los citados en orden) conserva el id: lo que la dirección cita sigue apuntando a la misma idea;
  //  · la misma idea repetida (mismo texto) no se renumera: es una sola;
  //  · una línea SIN mensaje o sin red no ocupa el id (el lector la descarta igual · reserva 1 de CC3): la dirección suele escribir «- C1-I01 · usé A23» solo para citar;
  //  · un id que la dirección puso en «Ideas que salen» no se renumera: no se sabe a cuál de las dos se refería, así que sale como antes;
  //  · el número nuevo es mayor que cualquier id de ese capítulo en TODO el libro, para no caer sobre un id que alguien ya escribió o citó.
  const esIdea = (linea: string): boolean => { const i = leerIdea(linea); return !!i && !!i.mensaje.trim() && !!i.red }
  const ocupados = new Map<string, string>()
  for (const l of integracion.replace(/\r/g, '').split('\n')) {
    if (!esIdea(l)) continue
    const p = partesDeLinea(lineaDeIdeaLimpia(l))
    if (p && !ocupados.has(p.id)) ocupados.set(p.id, claveDeTexto(p.resto))
  }
  const salen = idsQueSalen(integracion)
  const ultimo = new Map<string, number>()
  // la base del número nuevo NO cuenta el relleno de la dirección: así el id que recibe una idea del equipo no cambia después de rellenar
  // (la dirección vio ese id en «ya están»). La unicidad no depende de esto: cada línea se compara contra los ids ya ocupados.
  for (const t of [integracion, ...libro.filter((a) => !(a.tipo === 'aporta' && a.de === dir && esRellenoDelBanco(a.texto))).map((a) => a.texto)]) {
    for (const m of t.matchAll(/\bC([A-Za-z0-9_]+)-I(\d{2,})\b/g)) ultimo.set(m[1], Math.max(ultimo.get(m[1]) ?? 0, Number(m[2])))
  }
  const vistas = new Set<string>()
  const out: string[] = []
  for (const a of orden) {
    for (const l of a.texto.replace(/\r/g, '').split('\n')) {
      if (!RE_LINEA_DE_IDEA_EN_APORTE.test(l)) continue
      let limpia = lineaDeIdeaLimpia(l)
      if (vistas.has(limpia)) continue
      vistas.add(limpia)
      const p = esIdea(limpia) ? partesDeLinea(limpia) : null
      if (p && !salen.has(p.id)) {
        const clave = claveDeTexto(p.resto)
        const previa = ocupados.get(p.id)
        if (previa === undefined) ocupados.set(p.id, clave)
        else if (previa !== clave) {
          const cap = /^C([A-Za-z0-9_]+)-I\d{2,}$/.exec(p.id)?.[1] ?? ''
          // el número nuevo sube mientras caiga sobre un id ya ocupado (el relleno no entra a la base · hueco hallado por CC7 en #1189)
          let n = (ultimo.get(cap) ?? 0) + 1
          const idDe = (k: number): string => `C${cap}-I${String(k).padStart(2, '0')}`
          while (ocupados.has(idDe(n))) n++
          ultimo.set(cap, n)
          const nuevo = idDe(n)
          ocupados.set(nuevo, clave)
          limpia = `- ${nuevo} · ${p.resto}`
          vistas.add(limpia)
        }
      }
      out.push(limpia)
    }
  }
  return out
}
/** los ids que la integración lista en «## Ideas que salen» (`- C1-I04: motivo`) */
function idsQueSalen(integracion: string): Set<string> {
  const out = new Set<string>()
  let dentro = false
  for (const l of integracion.replace(/\r/g, '').split('\n')) {
    if (/^#{1,3}\s/.test(l)) dentro = /^#{1,3}\s*Ideas que salen/i.test(l)
    if (!dentro) continue
    for (const m of l.matchAll(/\bC[A-Za-z0-9_]+-I\d{2,}\b/g)) out.add(m[0])
  }
  return out
}
/** el id y el resto de una línea ya limpia (`- C1-I01 · …`) */
function partesDeLinea(limpia: string): { id: string; resto: string } | null {
  const m = /^- (C[A-Za-z0-9_]+-I\d{2,}) · (.*)$/.exec(limpia)
  return m ? { id: m[1], resto: m[2] } : null
}

/**
 * 18-nov · T7d (encargo de Lenovo, arreglo 2): la integración de la gran idea abrió con la charla del director («Voy a leer el tablero completo…», «El sistema indica que ya se alcanzó
 * el límite…») y eso fue lo primero que se leyó en la bandeja. Regla exacta: lo que va ANTES de la primera sección `## ` no se entrega. Sin ninguna sección, el texto queda igual.
 */
export function sinCharlaAntesDeLaPrimeraSeccion(texto: string): string {
  const m = /^##\s/m.exec(texto)
  return m && m.index > 0 ? texto.slice(m.index).trim() : texto
}

/** el tablero integrado de la mesa (lo último que escribió la dirección), o lo que el equipo alcanzó a escribir si no hubo integración.
 *  `conIdeasDeLosAportes` (solo la mesa de concepto): agrega detrás de la integración las líneas de idea de los aportes (ver `ideasDeLosAportes`)
 *  y quita la charla de la dirección antes de su primera sección (`sinCharlaAntesDeLaPrimeraSeccion`). */
export function textoParaLaCadena(libro: Array<{ n?: number; de: string; tipo: string; texto: string }>, piezaTexto: string | null | undefined, conIdeasDeLosAportes = false): string {
  const ult = [...libro].reverse().find((a) => a.tipo === 'integra' && a.texto.trim())
  if (ult) {
    const integracion = conIdeasDeLosAportes ? sinCharlaAntesDeLaPrimeraSeccion(ult.texto.trim()) : ult.texto.trim()
    const ideas = conIdeasDeLosAportes ? ideasDeLosAportes(libro, integracion) : []
    return ideas.length ? `${integracion}\n\n${TITULO_IDEAS_DE_LOS_APORTES}\n\n${ideas.join('\n')}` : integracion
  }
  if (piezaTexto?.trim()) return piezaTexto.trim()
  // sin integración, lo que el equipo escribió (la crítica no: confronta, no propone; sus citas de ideas no deben leerse como ideas)
  return libro.filter((a) => ['dirige', 'aporta', 'responde'].includes(a.tipo) && a.texto.trim() && !esCritica(a.texto)).map((a) => `[${a.de}] ${a.texto.trim()}`).join('\n\n')
}
/**
 * 18-nov · RELLENO DEL BANCO (la (b) de Lenovo, 09:59Z y 13:08Z · reparto con CC2 20:56Z). Las cuotas del plan piden huecos × semanas ideas por red y capítulo
 * (`banco_parcial` de la cadena); en T7d el banco quedó en 70 de 120 aun con ids únicos. Después de integrar, la dirección tiene UN turno por capítulo con faltantes
 * para escribir solo las que faltan. Lo escribe como `aporta` con la cabecera «## Relleno del banco · <capítulo>»:
 *  · no es un «aporte nuevo» que obligue a integrar otra vez (la integración no cambia; las líneas viajan en «Banco de ideas · líneas de los aportes»);
 *  · un capítulo con su relleno escrito no vuelve a pedirse, aunque no haya alcanzado (sin bucle);
 *  · la cuenta es la de la cadena: `leerConcepto` sobre el mismo texto que se le entrega, con las fases y redes del sobre. Sin insumos en el sobre ⇒ no hay relleno (como antes).
 */
export const TITULO_DEL_RELLENO = '## Relleno del banco'
export const esRellenoDelBanco = (texto: string): boolean => /^\s*##\s*Relleno del banco\b/i.test(texto)
/** la clave de la fase que nombra la cabecera del relleno (null si no la trae) */
export function capituloDelRelleno(texto: string): string | null {
  const m = /^\s*##\s*Relleno del banco\s*·\s*([A-Za-z0-9_]+)/i.exec(texto)
  return m ? m[1] : null
}
/** el texto del relleno tal como se anota: SIEMPRE con la cabecera canónica de su capítulo (la escriba o no la dirección), para que no se pida dos veces */
export function conCabeceraDelRelleno(texto: string, capitulo: string): string {
  const cab = `${TITULO_DEL_RELLENO} · ${capitulo}`
  const sin = texto.replace(/^\s*##\s*Relleno del banco\b[^\n]*\n?/i, '').trim()
  return `${cab}\n\n${sin}`
}
export interface RellenoPendiente {
  /** la clave de la fase (el capítulo del banco) */
  capitulo: string
  /** el prefijo de los ids de ese capítulo (`C<prefijo>-I<nn>`) */
  prefijo: string
  /** desde qué número seguir (mayor que cualquier id de ese capítulo en el texto) */
  desde: number
  /** cuántas faltan por red para llegar a la cuota */
  redes: Array<{ red: string; faltan: number; esperadas: number }>
  /** lo que ya está en el banco de ese capítulo (para no repetir): id · red · mensaje */
  ya_estan: Array<{ id: string; red: string; mensaje: string }>
}
/** el primer capítulo que aún no llega a su cuota y no tiene relleno escrito; null si no hay nada que rellenar (o la mesa no es de concepto, o no hay integración) */
export function rellenoPendiente(marco: Pick<MarcoDeLaCadena, 'tipo_de_mesa' | 'insumos_del_banco'> | null, libro: Array<{ n?: number; de: string; tipo: string; texto: string }>): RellenoPendiente | null {
  if (!marco || marco.tipo_de_mesa !== 'concepto' || !marco.insumos_del_banco) return null
  const ult = [...libro].reverse().find((a) => a.tipo === 'integra' && a.texto.trim())
  if (!ult) return null
  const texto = textoParaLaCadena(libro, null, true)
  const ins = marco.insumos_del_banco
  const l = leerConcepto(texto, { fases: ins.fases, redes: ins.redes, prohibidas: [], fotos: [] })
  const rellenos = libro.filter((a) => a.tipo === 'aporta' && a.de === ult.de && esRellenoDelBanco(a.texto))
  // tope duro: nunca más rellenos que fases (aunque una cabecera llegue sin capítulo, la mesa no da vueltas)
  if (rellenos.length >= ins.fases.length) return null
  const hechos = new Set(rellenos.map((a) => claveDeTexto(capituloDelRelleno(a.texto) ?? '')))
  for (const [k, f] of ins.fases.entries()) {
    const redes = l.banco_parcial.filter((b) => b.capitulo === f.clave && b.faltan > 0).map((b) => ({ red: b.red, faltan: b.faltan, esperadas: b.esperadas }))
    if (!redes.length || hechos.has(claveDeTexto(f.clave))) continue
    const ya_estan = l.banco.filter((i) => i.capitulo === f.clave).map((i) => ({ id: i.id, red: i.red, mensaje: i.mensaje }))
    // el prefijo que YA usan las ideas de ese capítulo (los miembros numeran por orden: C1, C2…); sin ideas, el número de orden de la fase (el lector lo casa por orden)
    const prefijo = /^C([A-Za-z0-9_]+)-I\d{2,}$/.exec(ya_estan[0]?.id ?? '')?.[1] ?? String(k + 1)
    let desde = 0
    for (const m of texto.matchAll(new RegExp(`\\bC${prefijo}-I(\\d{2,})\\b`, 'g'))) desde = Math.max(desde, Number(m[1]))
    return { capitulo: f.clave, prefijo, desde: desde + 1, redes, ya_estan }
  }
  return null
}

/** lo que la mesa le entrega a la cadena: la de concepto lleva las ideas de los aportes */
export const textoDeLaMesaParaLaCadena = (enc: Pick<Encargo, 'familia'>, libro: Array<{ n?: number; de: string; tipo: string; texto: string }>, piezaTexto: string | null | undefined): string =>
  textoParaLaCadena(libro, piezaTexto, enc.familia === FAMILIA_DE.concepto)

/**
 * Lo que la dirección escribió en «## Devolución del brief» (solo en la mesa de concepto): si hay texto, el brief se devuelve UNA vez. Devuelve null si no hay sección o está vacía.
 * Se lee en CUALQUIER aporte de la dirección del primer turno (no solo en la integración): la mesa cierra sin gastar más turnos.
 */
export function devolucionDelBrief(texto: string): string | null {
  const m = /^#{1,3}\s*Devoluci[oó]n del brief\s*$/im.exec(texto)
  if (!m) return null
  const resto = texto.slice(m.index + m[0].length)
  const sig = /^#{1,3}\s+\S/m.exec(resto)
  const cuerpo = (sig ? resto.slice(0, sig.index) : resto).trim()
  return cuerpo ? cuerpo.slice(0, 4000) : null
}

/**
 * Cierra el encargo de la cadena y le entrega el tablero por su puerto. NUNCA va a la bandeja ni a la jefatura de la pieza. Si la cadena no recibe la entrega, el encargo cierra igual
 * (el plazo de la mesa en la cadena la deja sin mesa y la campaña sigue con lo que haya): la mesa jamás deja a una campaña colgada.
 */
export async function entregarALaCadena(P: Puertos, enc: Encargo, o: { texto: string | null; motivo: string | null; estado: 'cerrado' | 'cerrado_por_tope' | 'fallido'; brief_devuelto?: string | null }): Promise<Respuesta> {
  const ref = (enc.sala_ref ?? {}) as { tipo_de_mesa?: TipoDeMesaDeLaCadena; campana_id?: string; version?: number }
  let entrega: { ok: boolean; detalle: string; siguiente?: { sobre: object } } = { ok: false, detalle: 'la cadena no tiene su puerto en este entorno' }
  if (P.cadena && ref.campana_id && ref.version && ref.tipo_de_mesa) {
    try {
      const base = { campana_id: ref.campana_id, version: ref.version, encargo_id: enc.id, texto: o.texto, costo_usd: enc.estado_del_motor.gasto_usd, motivo: o.motivo }
      const x = ref.tipo_de_mesa === 'brief' ? await P.cadena.entregarBrief(base)
        : ref.tipo_de_mesa === 'reubicacion' ? (P.cadena.entregarReubicacion ? await P.cadena.entregarReubicacion(base) : { ok: false as const, error: 'la cadena no recibe reubicaciones en este entorno' })
        : ref.tipo_de_mesa === 'fallidos' ? (P.cadena.entregarFallidos ? await P.cadena.entregarFallidos(base) : { ok: false as const, error: 'la cadena no recibe la revisión de fallidos en este entorno' })
        : ref.tipo_de_mesa === 'banco' ? (P.cadena.entregarBanco ? await P.cadena.entregarBanco(base) : { ok: false as const, error: 'la cadena no recibe las correcciones del banco en este entorno' })
        : await P.cadena.entregarConcepto({ ...base, brief_devuelto: o.brief_devuelto ?? null })
      entrega = x.ok ? { ok: true, detalle: x.estado ?? 'recibida', ...(x.siguiente ? { siguiente: x.siguiente } : {}) } : { ok: false, detalle: x.error ?? 'la cadena no recibió la entrega' }
    } catch (e) { entrega = { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
  const cambios: Cambios = { encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.estado_del_motor.gasto_usd, estado: o.estado, con_desacuerdo: o.estado !== 'cerrado' }
  await P.almacen.guardar(cambios)
  if (!entrega.ok) await P.avisar({ canal: "alertas", encargo_id: enc.id, texto: `⚠️ La mesa de la cadena (${enc.brief_id}) cerró pero la cadena no recibió el tablero (${entrega.detalle}); la campaña seguirá con lo que tenga al vencer el plazo de la mesa.`, dry_run: enc.dry_run })
  return r(200, { accion: 'cerrado', estado: o.estado, con_desacuerdo: o.estado !== 'cerrado', motivo: o.motivo, brief_devuelto: o.brief_devuelto ? true : undefined, simulado: enc.dry_run, gasto_usd: enc.estado_del_motor.gasto_usd, resultado_para_la_sala: enc.familia, sala_ref: enc.sala_ref, entrega_a_la_cadena: entrega })
}

/**
 * 11-nov (#1014 · relectura) · el texto que una mesa de la cadena dejó guardado en su encargo (`pieza_texto` del artefacto `mesa`), para releerlo SIN volver a llamar al agente.
 * Vive aquí porque solo la oficina nombra sus tablas; la cadena lo importa en el acto. Nunca lanza.
 * 🟡 CC7 punto 4 · «no hay texto» (`ok: true, texto: null`) NO es lo mismo que «la base no respondió» (`ok: false`): un error pasajero no debe dar la relectura por hecha.
 */
export type TextoGuardado = { ok: true; texto: string | null } | { ok: false; motivo: string }
export async function textoGuardadoDeLaMesa(db: { from: (t: string) => any }, encargoId: string): Promise<TextoGuardado> {
  try {
    const { data, error } = await db.from('oficina_encargos').select('estado_del_motor').eq('id', encargoId).maybeSingle()
    if (error) return { ok: false, motivo: String((error as { message?: unknown }).message ?? 'error de la base') }
    if (!data) return { ok: true, texto: null }
    const t = (data as { estado_del_motor?: { artefactos?: { mesa?: { datos?: { pieza_texto?: unknown } } } } }).estado_del_motor?.artefactos?.mesa?.datos?.pieza_texto
    return { ok: true, texto: typeof t === 'string' && t.trim() ? t : null }
  } catch (e) { return { ok: false, motivo: e instanceof Error ? e.message : String(e) } }
}
