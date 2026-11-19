/**
 * LA HOJA DE PRODUCCIÓN · por código (31-oct · diseño «nuevo orden de la cadena» v5 §6 · plan v2 T1).
 * Reemplaza al redactor del parte (`campaign-brief-agent` por lote): el parte de trabajo lo ESCRIBE código a partir de lo que ya existe —
 * el brief creativo de la campaña (contrato `brief_creativo.v1`) · el concepto con su banco de ideas (`concepto.v1`) · las filas fechadas del calendario (cada una con su `idea_ref`).
 * Escribe EXACTAMENTE el formato que ya lee la oficina (`src/lib/oficina/brief.ts` · `parsearBrief` / `elementosDelKit` / `proporcionDelBrief` / `planDeOrigen`):
 *   `### <fila_id> · <Red> · <formato>` + `- CAMPO: valor` + listas `- CAMPO:` con `  - elemento`.
 * El identificador de cada brief es el `fila_id` (no hay numeración aparte). Las filas de la familia `kit_historias` de un lote van en UN brief de kit (port de `scripts/worker-staging/cadena/kit-de-historias.js`).
 * Puro: sin red, sin base, sin modelo, sin cliente. Lo que falta se DECLARA en la hoja («sin idea del banco»), nunca se inventa.
 */
import type { ConceptoDeLaFila, DatoDeterminado, Fila, FormatosPorRed } from './tipos'
import { PROPORCION_POR_FORMATO, proporcionDe, proporcionDeLaTabla } from './proporciones'
import type { BriefCreativoLeido } from './brief-creativo'
import { comoSeVeSinPartes, decisionDeLaParte, ideaDelBanco, PARTES_DE_COMO_SE_VE, type CapituloDelConcepto, type ConceptoLeido, type IdeaDelBanco } from './conceptos'
import { comoSeCompraParaLaRed, datosSinFuente, fichaDeLaOferta, fichaEnLineas, fichasConHechos, ofertaCerradaOInexistenteEn, type DatoDeFicha, type FichaDeOferta, type HechoDelNegocioPorOferta } from './ficha-de-oferta'

export const FAMILIA_DEL_KIT = 'kit_historias'
/** el id de un brief del parte (mismo criterio que `autoproducir.ts` RE_BRIEF) */
export const RE_ID_DE_BRIEF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/
// 11-nov · regla #17: la proporción sale de `cadena_formatos_por_red.proporcion`; la lista por formato es el ÚNICO respaldo y vive en `proporciones.ts` (la usa también el brazo de video)
export { PROPORCION_POR_FORMATO, proporcionDe }
/** T8 · los formatos que filma el brazo de video (lo mismo que lee `esVideo` en la oficina: reel · short · video · tiktok); la hoja lo declara en LÍMITES para que la mesa sepa que escribe un guion */
export const esFormatoDeVideo = (formato: string): boolean => /\b(reel|short|video|tiktok)\b/i.test(formato)
export const NOTA_DE_VIDEO_EN_LIMITES = 'video corto de 8 a 15 s que filma el brazo de video a partir del guion de la mesa (sin rostro ni voz de persona real identificable salvo permiso registrado)'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export type FilaDeHoja = Pick<Fila, 'id' | 'fecha' | 'hora' | 'red' | 'formato' | 'pilar' | 'tema' | 'datos'> & {
  /** la fase del plan a la que pertenece (columna `fase` de `cadena_calendario_filas`) */
  fase?: string | null
  /** la idea del banco que la fila realiza (`C<fase>-I<nn>`); sin idea ⇒ la hoja lo declara */
  idea_ref?: string | null
  /** 16-nov · Sprint 1 · Mejora 2 · el concepto de ESTA pieza (columna `concepto`); sin concepto ⇒ la hoja lo arma del banco y lo avisa */
  concepto?: ConceptoDeLaFila | null
  /** 17-nov · Sprint 4 · A · la oferta que vende la pieza (la clave que trae la fila; hoy la columna `sede`) · sin oferta ⇒ la hoja lo declara */
  oferta?: string | null
}
export interface InsumosDeLaHoja {
  client_name: string
  plan_id: string
  manual_version: number | string
  manual_id: string
  /** fecha de hoy AAAA-MM-DD (el encabezado) */
  hoy: string
  lote_key: string
  brief: BriefCreativoLeido
  brief_id: string
  concepto: ConceptoLeido
  concepto_id: string
  filas: FilaDeHoja[]
  /** `cadena_formatos_por_red` (de ahí sale la `familia` de cada brief y qué filas van al kit) */
  formatos: FormatosPorRed
  /** ensayo en seco: la hoja lo dice en su encabezado y en la procedencia */
  seco?: boolean
  proporciones?: Readonly<Record<string, string>>
  /** 17-nov · Sprint 4 · A · las fichas de hechos por oferta (la orden de trabajo de cada pieza); sin fichas ⇒ cada pieza lo declara, nada se bloquea */
  fichas?: ReadonlyArray<FichaDeOferta> | null
  /**
   * 18-nov · RESPUESTA-LENOVO-a-CC3-CC7 (#1147) · los hechos del negocio leídos EN VIVO del cerebro al armar la hoja: el estado de la oferta en la fecha de la fila
   * (abierta · cerrada · aún no existe) sale de aquí y, si choca con la foto de la ficha (la del inicio de la campaña), MANDA el cerebro.
   * `undefined` = el almacén no los sabe leer (vale la ficha, como hoy) · `null` = no se pudieron leer (vale la ficha y se avisa).
   */
  hechos?: ReadonlyArray<HechoDelNegocioPorOferta> | null
}
export interface BriefDeLaHoja { brief_id: string; fila_id: string | null; fila_ids: string[]; familia: string | null; red: string; formato: string; idea_ref: string | null }
export interface ProcedenciaDeLaHoja {
  hoja: true
  contrato: 'hoja.v1'
  lote_key: string
  fila_ids: string[]
  familias_por_brief: Array<{ brief_id: string; fila_id: string | null; familia: string | null }>
  kit: { brief_id: string; fila_ids: string[]; elementos: string[] } | null
  brief_creativo_id: string
  concepto_id: string
  seco: boolean
  valido: boolean
}
export interface HojaEscrita { texto_md: string; briefs: BriefDeLaHoja[]; provenance: ProcedenciaDeLaHoja; avisos: string[] }

// ───────────────────────────────────────────────────────── utilidades
const limpio = (s: unknown): string => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
/** una línea de campo nunca puede abrir otro campo: sin saltos de línea */
const campo = (nombre: string, valor: unknown): string => `- ${nombre}: ${limpio(valor)}`
const listaDe = (nombre: string, items: ReadonlyArray<unknown>): string[] => [`- ${nombre}:`, ...items.map(limpio).filter(Boolean).map((x) => `  - ${x}`)]
const mayuscula = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
export const esFechaReal = (s: string): boolean => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s }
export const esHoraReal = (h: string): boolean => { const m = /^(\d{2}):(\d{2})/.exec(h); return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59 }
/** «12 de noviembre de 2026» (lo que lee `fechaLimiteDelBrief`); una fecha ilegible se escribe tal cual (se declara, no se corrige) */
export function fechaEnLetras(fecha: string): string {
  if (!esFechaReal(fecha)) return fecha || '(fecha vacía)'
  const [a, m, d] = fecha.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}
export function familiaDe(formatos: FormatosPorRed, red: string, formato: string): string | null {
  const f = (formatos[red] ?? formatos[red.toLowerCase()] ?? []).find((x) => x.formato.toLowerCase() === formato.toLowerCase())
  return f?.familia ?? null
}
const datosEnTexto = (datos: ReadonlyArray<DatoDeterminado>): string => datos.map((d) => `${limpio(d.dato)}: ${limpio(d.valor).replace(/;/g, ',')}${d.ref ? ` (${limpio(d.ref)})` : ''}`).join('; ')

// ───────────────────────────────────────────────────────── el kit (port de kit-de-historias.js)
/** «historia» o «estado» (el estado es el formato de WhatsApp) */
export const kitDestino = (f: Pick<FilaDeHoja, 'formato' | 'red'>): 'historia' | 'estado' => (f.formato.toLowerCase() === 'estado' || f.red.toLowerCase() === 'whatsapp' ? 'estado' : 'historia')
/** las filas del lote que van al kit (por el dato `familia`), ordenadas por fecha, hora e id */
export function filasDelKit(filas: ReadonlyArray<FilaDeHoja>, formatos: FormatosPorRed): FilaDeHoja[] {
  return filas.filter((f) => f.id && familiaDe(formatos, f.red, f.formato) === FAMILIA_DEL_KIT).slice().sort((a, b) => {
    const ka = `${a.fecha ?? ''} ${a.hora ?? ''} ${a.id}`, kb = `${b.fecha ?? ''} ${b.hora ?? ''} ${b.id}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}
/** UNA línea de elemento a partir de UNA fila · `AAAA-MM-DD HH:MM | historia|estado | tema | pilar | dato: valor; …` · fecha u hora ilegibles van tal cual (la sala las rechaza visible) */
export function lineaDeElemento(f: FilaDeHoja): string {
  const fecha = limpio(f.fecha).replace(/\|/g, '/') || '(fecha vacía)'
  const hora = f.hora ? limpio(f.hora) : ''
  const cuando = hora ? `${fecha} ${esHoraReal(hora) ? hora.slice(0, 5) : hora}` : fecha
  const datos = (f.datos ?? []).map((d) => `${limpio(d.dato).replace(/\|/g, '/')}: ${limpio(d.valor).replace(/\|/g, '/').replace(/;/g, ',')}`).join('; ')
  const t = (s: unknown) => limpio(s).replace(/\|/g, '/')
  return `${cuando} | ${kitDestino(f)} | ${t(f.tema)} | ${t(f.pilar)}${datos ? ` | ${datos}` : ''}`
}
/** 17-nov · un elemento del kit cuya idea del banco declara más de 1 cuadro (lo declara quien escribe el banco: `cuadros: N`; la cadena solo compara números) */
export interface CuadrosDeLaIdea { fila_id: string; cuando: string; idea: string; cuadros: number }
export function cuadrosDeMasEnElKit(filas: readonly FilaDeHoja[], concepto: Pick<ConceptoLeido, 'banco'>): CuadrosDeLaIdea[] {
  const out: CuadrosDeLaIdea[] = []
  for (const f of filas) {
    const idea = ideaDelBanco(concepto, f.idea_ref)
    if (idea?.cuadros && idea.cuadros > 1) out.push({ fila_id: f.id, cuando: [limpio(f.fecha), f.hora ? limpio(f.hora).slice(0, 5) : ''].filter(Boolean).join(' '), idea: idea.id, cuadros: idea.cuadros })
  }
  return out
}
/** el id del brief de kit del lote: `kit-<lote_key>` saneado al criterio de RE_ID_DE_BRIEF */
export const idDelKit = (loteKey: string): string => `kit-${loteKey.replace(/[^A-Za-z0-9_.-]+/g, '-')}`.slice(0, 40)

// ───────────────────────────────────────────────────────── un brief de la hoja
/** 16-nov · Sprint 1 · Mejora 2 · la línea VISUAL dice de dónde viene: es el estilo de la campaña, no la escena de la pieza */
export const PREFIJO_VISUAL_DE_CAMPANA = 'de la campaña (referencia de estilo; la escena de esta pieza la decide la mesa): '
function mensajeDe(idea: IdeaDelBanco | null, f: Pick<FilaDeHoja, 'tema'>, avisos: string[], id: string): string {
  if (idea?.mensaje) return idea.mensaje
  avisos.push(`${id}: sin idea del banco (${f.tema ? `tema «${limpio(f.tema)}»` : 'sin tema'}) · el mensaje sale del tema y se declara`)
  return `${limpio(f.tema) || '(sin tema)'} · sin idea del banco`
}
/**
 * 16-nov · Sprint 1 · Mejora 2 · el concepto de la pieza: el de la fila o, si no lo trae, el de la idea del banco. Nunca bloquea.
 * Sin concepto propio NO se suma a los avisos de la hoja: esos avisos son hallazgos del parte (bajan `chequeos_ok`) y hoy ninguna fila lo trae.
 * Lo que falta queda DECLARADO en el texto del brief.
 * GO Lenovo 16-nov 22:04 · solo lo ESTRATÉGICO manda (idea, objetivo, mensaje, público, llamado, fotos disponibles); lo creativo de una fila v3 queda como SUGERENCIA.
 */
function conceptoDeLaPieza(f: FilaDeHoja, idea: IdeaDelBanco | null): { idea: string; objetivo: string; mensaje: string; publico: string; llamado: string; fotos: string[]; sugerencias: string[] } {
  const k = f.concepto ?? {}
  // 17-nov · Sprint 4 · F · la pieza nace de la idea: con idea del banco, la idea y el mensaje son los de los creativos. La idea y el mensaje que
  // una fila vieja (`calendario_tanda.v4`) escribió NO llegan a la hoja (ADENDA 1 del DISEÑO · NOTA CC6 punto 5); su llamado queda solo como respaldo
  // (paso 3 del orden del llamado) y lo creativo de una fila v3 sigue como sugerencia
  if (idea) {
    const fotos = fotosDeLaPieza(k, idea)
    const sugerencias = [k.que_se_ve ? `qué se ve: ${limpio(k.que_se_ve)}` : '', k.emocion ? `emoción: ${limpio(k.emocion)}` : '', k.foto ? `foto: ${limpio(k.foto)}` : ''].filter((x) => x && !/:\s*$/.test(x))
    return { idea: '', objetivo: limpio(k.objetivo), mensaje: limpio(idea.mensaje), publico: limpio(k.publico), llamado: limpio(k.llamado), fotos, sugerencias }
  }
  // sin idea del banco (fila sin `idea_ref`): lo que trae la fila es lo único que hay; lo creativo de una fila v3 entra solo como SUGERENCIA
  const fotos = fotosDeLaPieza(k, null)
  const sugerencias = [k.que_se_ve ? `qué se ve: ${limpio(k.que_se_ve)}` : '', k.emocion ? `emoción: ${limpio(k.emocion)}` : '', k.foto ? `foto: ${limpio(k.foto)}` : ''].filter((x) => x && !/:\s*$/.test(x))
  return { idea: limpio(k.idea), objetivo: limpio(k.objetivo), mensaje: limpio(k.mensaje), publico: limpio(k.publico), llamado: limpio(k.llamado), fotos, sugerencias }
}
/** GO Lenovo 16-nov 22:04 · las fotos son MATERIAL disponible (la mesa elige): las de la fila, la vieja «foto» de v3 y la que cita la idea del banco, sin repetir */
function fotosDeLaPieza(k: ConceptoDeLaFila, idea: IdeaDelBanco | null): string[] {
  const fotos: string[] = []
  for (const x of [...(k.fotos_disponibles ?? []), k.foto ?? '', idea?.foto && idea.foto !== 'ninguna' ? idea.foto : ''].map(limpio).filter(Boolean)) {
    const clave = (s: string) => s.replace(/^foto:\s*/i, '').toLowerCase()
    if (!fotos.some((y) => clave(y) === clave(x))) fotos.push(x)
  }
  return fotos
}
/**
 * 17-nov · Sprint 4 · F · la idea del banco TAL COMO LA CREARON los creativos de la gran idea (qué cuenta, mensaje, gancho, protagonista y la foto que citaron).
 * Es la idea de la pieza: la mesa la materializa. Antes (17-nov, «quitar rejas») llegaba solo como sugerencia reemplazable.
 */
export const ideaTalCual = (idea: Pick<IdeaDelBanco, 'id' | 'idea' | 'mensaje' | 'gancho' | 'protagonista' | 'foto' | 'serie'>): string =>
  [`${idea.id}${idea.serie && !/^ninguna$/i.test(limpio(idea.serie)) ? ` · serie ${limpio(idea.serie)}` : ''}`, limpio(idea.idea), idea.mensaje ? `mensaje: ${limpio(idea.mensaje)}` : '', idea.gancho ? `gancho: ${limpio(idea.gancho)}` : '', idea.protagonista ? `protagonista: ${limpio(idea.protagonista)}` : '', idea.foto ? `foto que citaron: ${limpio(idea.foto)}` : ''].filter(Boolean).join(' · ')
/** 17-nov · la descripción de la idea del banco, como sugerencia que la mesa puede mejorar (nunca como orden) */
export const sugerenciaDelBanco = (idea: Pick<IdeaDelBanco, 'id' | 'idea'>): string => `cómo la imaginó el banco (${idea.id}): ${limpio(idea.idea)} · la mesa puede mejorarla o reemplazarla diciendo por qué`
/** 17-nov · GO «quitar rejas» C3 · cuántas versiones de la pieza: ningún dato lo fija (antes «1» fijo), lo decide la mesa */
export const VARIANTES_SIN_DATO = 'las que decida la mesa de la pieza (ningún dato del brief ni de la tabla de formatos las fija)'
/** GO Lenovo 16-nov 22:04 · quién decide el cómo (lo lee la mesa y quien revise: el brief dice QUÉ y POR QUÉ) */
// 17-nov · Sprint 4 · F · la pieza nace de la idea: la mesa MATERIALIZA la idea del banco (no la reemplaza); el cómo final es suyo
export const QUIEN_DECIDE_EL_COMO = 'la mesa de creativos materializa la IDEA DEL BANCO (la crearon los creativos de la gran idea): decide la escena final, el gancho final, la composición, la emoción y qué foto usar dentro de esa idea, con los hechos de la ficha de la oferta cuando la hay; lo de SUGERENCIAS es contexto'
/** 17-nov · el campo de la hoja con lo decidido (lista); lo lee `parsearBrief` como `lo_decidido` */
export const CAMPO_LO_DECIDIDO = 'LO DECIDIDO'
/** lo LIBRE de cada pieza: lo que decide su mesa, dentro de lo FIJO */
export const LIBRE_DE_LA_PIEZA = 'LIBRE · la escena, el gancho, la composición, la emoción y qué foto usar, dentro de lo FIJO · PORQUÉ: la mesa de esta pieza es su única instancia creativa'
/**
 * lo que la gran idea decidió para toda la campaña, como decisiones: «FIJO · <parte>: <qué> · PORQUÉ: <por qué>», la idea elegida del banco y lo LIBRE.
 * 17-nov · SIEMPRE trae FIJO (la idea: id, mensaje, protagonista; o el mensaje si la fila no tiene idea) y LIBRE; los FIJO de «cómo se ve» solo si la gran idea trae sus partes. Puro.
 */
export function loDecidido(c: Pick<ConceptoLeido, 'gran_idea' | 'como_se_ve_partes'>, idea: Pick<IdeaDelBanco, 'id' | 'mensaje' | 'protagonista'> | null, cap: Pick<CapituloDelConcepto, 'clave'> | null, mensajeSinIdea = ''): string[] {
  const partes = c.como_se_ve_partes ?? {}
  const porDefecto = c.gran_idea ? `lo decidió la gran idea «${c.gran_idea.nombre}» para toda la campaña` : 'lo decidió la gran idea para toda la campaña'
  const out: string[] = []
  for (const { clave, etiqueta } of PARTES_DE_COMO_SE_VE) {
    const v = partes[clave]
    if (!v) continue
    const d = decisionDeLaParte(v)
    out.push(`FIJO · ${etiqueta}: ${limpio(d.que)} · PORQUÉ: ${limpio(d.porque ?? porDefecto)}`)
  }
  // 17-nov · la idea es el QUÉ y el QUIÉN (id, mensaje, protagonista); su descripción visual es una SUGERENCIA (`sugerenciaDelBanco`), no lo fijo
  if (idea) out.push(`FIJO · idea de esta pieza: ${idea.id}${idea.mensaje ? ` · mensaje: ${limpio(idea.mensaje)}` : ''}${idea.protagonista ? ` · protagonista: ${limpio(idea.protagonista)}` : ''} · PORQUÉ: la crearon los creativos de la gran idea${cap ? ` en el capítulo ${cap.clave}` : ''}; el calendario solo le puso fecha, red y formato`)
  else if (limpio(mensajeSinIdea)) out.push(`FIJO · mensaje de esta pieza: ${limpio(mensajeSinIdea)} · PORQUÉ: lo fija la fila del calendario (no tiene idea del banco)`)
  out.push(LIBRE_DE_LA_PIEZA)
  return out
}
/** el campo de la hoja con la ficha de hechos de la oferta (lista); lo lee la mesa como texto */
export const CAMPO_FICHA = 'FICHA DE LA OFERTA'
/**
 * 17-nov · Sprint 4 · A · la ficha de la oferta de la pieza, como lista de datos con fuente.
 * Sin fichas cargadas se DECLARA (🟡 2 de CC6 a #1131: nunca en silencio); con fichas pero sin la de esta oferta, se declara y se avisa.
 */
export const SIN_FICHAS = 'sin fichas de hechos todavía · declarado'
/**
 * 17-nov · cambio 4 · D1 (regla dura firmada por Emilio) · PEDIDO-CC4-a-CC3: la oficina lee la hoja tal cual y las líneas de la ficha no traen el tipo del hecho.
 * Solo cuando la ficha dice, POR CÓDIGO, que la oferta está cerrada o aún no existe en la fecha de la fila. Sin dato no se escribe nada (las hojas de hoy no cambian).
 * El nombre lo lee la oficina como `CAMPO_CIERRE_DE_LA_HOJA` (`src/lib/oficina/sentido-contra-la-ficha.ts`): cambiarlo en los dos lados.
 */
export const CAMPO_OFERTA_CERRADA = 'OFERTA CERRADA EN SU FECHA'
/**
 * ¿la oferta de la fila está cerrada o aún no existe en su fecha? Con los hechos VIVOS del cerebro, decide el cerebro (el que sabe el hecho); sin ellos, la foto de la ficha.
 * Un choque (la foto dice una cosa y el cerebro de hoy otra) se AVISA: nunca en silencio.
 */
function cierreDeLaFila(ins: InsumosDeLaHoja, ficha: FichaDeOferta | null, f: FilaDeHoja, id: string, avisos: string[]): DatoDeFicha | null {
  const deLaFoto = ofertaCerradaOInexistenteEn(ficha, f.fecha)
  if (ins.hechos === undefined) return deLaFoto
  if (ins.hechos === null) {
    if (f.oferta) avisos.push(`${id}: los hechos del negocio no se pudieron leer en vivo · el estado de «${limpio(f.oferta)}» sale de la ficha del inicio de la campaña`)
    return deLaFoto
  }
  if (!f.oferta) return null
  const vivo = ofertaCerradaOInexistenteEn(fichasConHechos([{ clave: f.oferta }], ins.hechos)[0], f.fecha)
  if (!!vivo !== !!deLaFoto && ficha) avisos.push(`${id}: el cerebro de hoy dice que «${limpio(f.oferta)}» está ${vivo ? 'CERRADA o aún no existe' : 'ABIERTA'} el ${f.fecha}; la ficha del inicio decía lo contrario · manda el cerebro`)
  return vivo
}
const lineaDelCierre = (d: DatoDeFicha | null): string[] => (d ? [campo(CAMPO_OFERTA_CERRADA, `${limpio(d.valor)} (fuente: ${limpio(d.fuente)})`)] : [])
function fichaDeLaPieza(ins: InsumosDeLaHoja, f: FilaDeHoja, id: string, avisos: string[]): string[] {
  // sin ficha también se mira el cierre vivo: un cierre que el cerebro registró después no se pierde por falta de foto
  if (!ins.fichas?.length) return [campo(CAMPO_FICHA, SIN_FICHAS), ...lineaDelCierre(cierreDeLaFila(ins, null, f, id, avisos))]
  const ficha = fichaDeLaOferta(ins.fichas, f.oferta)
  if (!ficha) {
    avisos.push(`${id}: ${f.oferta ? `la oferta «${limpio(f.oferta)}» no tiene ficha de hechos` : 'la fila no dice su oferta'} · la mesa trabaja sin ficha`)
    return [campo(CAMPO_FICHA, f.oferta ? `sin ficha para «${limpio(f.oferta)}» · declarado` : 'sin oferta, sin ficha · declarado'), ...lineaDelCierre(cierreDeLaFila(ins, null, f, id, avisos))]
  }
  const sinFuente = datosSinFuente(ficha)
  if (sinFuente) avisos.push(`${id}: la ficha de «${limpio(ficha.clave)}» trae ${sinFuente} ${sinFuente === 1 ? 'dato' : 'datos'} sin fuente · no ${sinFuente === 1 ? 'entra' : 'entran'} en la hoja`)
  return [...listaDe(CAMPO_FICHA, fichaEnLineas(ficha, f.fecha)), ...lineaDelCierre(cierreDeLaFila(ins, ficha, f, id, avisos))]
}
/**
 * 17-nov · Sprint 4 · el llamado a la acción con su orden de respaldo (DISEÑO CC3 · borde b con CC5 · 🟢 CC6): escribirlo es trabajo creativo (la mesa);
 * el HECHO de cómo se compra sale de la ficha. Cada paso dice de dónde viene; el último lo DECLARA (nunca vacío en silencio):
 *   1. la ficha, «cómo se compra» de ESA red · 2. la ficha, sin red · 3. el llamado de una fila vieja del calendario · 4. el llamado por red de un brief viejo · 5. declarado.
 */
export const SIN_LLAMADO = 'sin llamado: la mesa lo escribe con los hechos de la oferta'
export function llamadoDeLaPieza(ins: Pick<InsumosDeLaHoja, 'fichas'>, f: Pick<FilaDeHoja, 'oferta' | 'fecha'>, red: string, llamadoDeLaFila?: string | null, llamadoDelBrief?: string | null): string {
  const dato = comoSeCompraParaLaRed(fichaDeLaOferta(ins.fichas, f.oferta), red, f.fecha)
  if (dato) return `${limpio(dato.valor)} (de la ficha de la oferta · fuente: ${limpio(dato.fuente)}${dato.red ? ` · ${limpio(dato.red)}` : ''}) · la mesa escribe el llamado con este dato`
  if (limpio(llamadoDeLaFila)) return limpio(llamadoDeLaFila)
  if (limpio(llamadoDelBrief)) return limpio(llamadoDelBrief)
  return SIN_LLAMADO
}
function lineasDelBrief(ins: InsumosDeLaHoja, cab: { id: string; red: string; formato: string }, f: FilaDeHoja, idea: IdeaDelBanco | null, extra: { fila_ids?: string[]; elementos?: string[]; cuadros?: CuadrosDeLaIdea[] }, avisos: string[]): string[] {
  const b = ins.brief
  const c = ins.concepto
  const cap = c.capitulos.find((x) => (f.fase && x.clave === f.fase) || (idea && x.clave === idea.capitulo)) ?? null
  const porRed = b.por_red.find((x) => x.red === cab.red.toLowerCase()) ?? null
  const { proporcion, por_omision, ilegible } = proporcionDeLaTabla(ins.formatos, cab.red, cab.formato, ins.proporciones)
  if (ilegible) avisos.push(`${cab.id}: la proporción «${ilegible}» de ${cab.red.toLowerCase()} · ${cab.formato} en cadena_formatos_por_red no se puede leer · se usa ${proporcion}, la de por omisión del formato`)
  const esKit = cab.formato === 'kit'
  const pz = conceptoDeLaPieza(f, idea)
  const mensajeDeLaPieza = pz.mensaje || mensajeDe(idea, f, avisos, cab.id)
  const cuando = `aprobar antes de publicar · publica el ${fechaEnLetras(f.fecha)}${f.hora ? ` a las ${limpio(f.hora).slice(0, 5)}` : ''}`
  const L: string[] = [
    `### ${cab.id} · ${mayuscula(cab.red)} · ${cab.formato}`,
    campo('QUÉ ES', `${esKit ? `Kit semanal de historias y estados (${extra.elementos?.length ?? 0} ${extra.elementos?.length === 1 ? 'elemento' : 'elementos'})` : `${cab.formato} para ${mayuscula(cab.red)}`}${mensajeDeLaPieza ? ` · mensaje: ${mensajeDeLaPieza}` : ''}`),
    campo('DE QUÉ PARTE DEL PLAN SALE', b.de_que_parte_del_plan),
    campo('GRAN IDEA', c.gran_idea ? `${c.gran_idea.nombre} · ${c.gran_idea.frase}` : '(sin gran idea)'),
    campo('CAPÍTULO DE LA FASE', cap ? `${cap.clave} · ${cap.nombre} · ${cap.que_cuenta}` : f.fase ? `${f.fase} · (sin capítulo en el concepto)` : '(sin fase)'),
    // 17-nov · Sprint 4 · F · la idea tal como la crearon los creativos (antes: solo el id y la descripción como sugerencia)
    campo('IDEA DEL BANCO', idea ? ideaTalCual(idea) : 'ninguna · declarado'),
    // 17-nov · Sprint 4 · A · qué oferta vende la pieza y sus hechos (la orden de trabajo); sin ficha se declara, nada se bloquea
    campo('OFERTA', f.oferta ? limpio(f.oferta) : 'sin oferta en la fila · declarado'),
    ...fichaDeLaPieza(ins, f, cab.id, avisos),
    campo('BRIEF DE CAMPAÑA', ins.brief_id),
    campo('MENSAJE DE CAMPAÑA', b.mensaje),
    campo('OBJETIVO', pz.objetivo || porRed?.objetivo || b.objetivo),
    campo('PÚBLICO', pz.publico || b.publico || '(el brief no nombra al público)'),
    campo('PROTAGONISTA', idea?.protagonista || limpio(f.tema) || '(sin protagonista declarado)'),
    // GO Lenovo 16-nov 22:04 · el brief es ESTRATÉGICO (qué y por qué); el cómo lo decide la mesa
    // 17-nov · solo la idea PROPIA de la fila; sin ella la propone la mesa (no se rellena con la descripción del banco: esa va a SUGERENCIAS)
    ...(pz.idea ? [campo('IDEA DE LA PIEZA', pz.idea)] : []),
    campo('MENSAJE (uno)', mensajeDeLaPieza),
    ...(pz.fotos.length ? listaDe('FOTOS DISPONIBLES', pz.fotos.map((x) => `${x} (material; la mesa decide si la usa)`)) : [campo('FOTOS DISPONIBLES', 'ninguna citada (la mesa ve las fotos aptas del cliente)')]),
    campo('QUIÉN DECIDE EL CÓMO', QUIEN_DECIDE_EL_COMO),
    ...(pz.sugerencias.length ? listaDe('SUGERENCIAS', pz.sugerencias) : []),
    // FIRMA 01-nov «hoja sin reja»: el gancho de la hoja es SUGERIDO; el final lo escribe la mesa de piezas (video: el coach con el método scripter)
    campo('GANCHO SUGERIDO', idea?.gancho ?? ''),
    campo('LÍMITES', `proporción ${proporcion} (${por_omision ? `por omisión del formato ${cab.formato}` : `dato de la tabla de formatos para ${cab.red.toLowerCase()} · ${cab.formato}`})${esFormatoDeVideo(cab.formato) ? ` · ${NOTA_DE_VIDEO_EN_LIMITES}` : ''} · ${b.obligatorios.no_se_dice.length ? `no se dice: ${b.obligatorios.no_se_dice.join(', ')}` : 'sin «no se dice» en el brief'}${idea?.foto ? ` · foto citada: ${idea.foto}` : ''}`),
    ...listaDe('VOCABULARIO DE LA MARCA', b.obligatorios.vocabulario),
    ...listaDe('PROHIBIDO', b.obligatorios.prohibido),
    campo('SINTAXIS', b.tono),
    // la línea VISUAL es del concepto de la CAMPAÑA: referencia de estilo, no las tomas de esta pieza (esas las decide la mesa)
    campo('VISUAL', (() => { const v = [c.como_se_ve_partes ? comoSeVeSinPartes(c.como_se_ve) : c.como_se_ve, cap?.como_se_ve, idea?.foto && idea.foto !== 'ninguna' ? `foto ${idea.foto}` : ''].filter(Boolean).join(' · '); return v ? `${PREFIJO_VISUAL_DE_CAMPANA}${v}` : '(el concepto no dice cómo se ve)' })()),
    campo('LLAMADO A LA ACCIÓN', llamadoDeLaPieza(ins, f, cab.red, pz.llamado, porRed?.llamado)),
    // 17-nov · GO «quitar rejas» C3: ya no «1» fijo · ningún dato (brief, tabla de formatos) fija cuántas versiones: decide la mesa de la pieza
    campo('VARIANTES', VARIANTES_SIN_DATO),
    // 17-nov (GO Lenovo · auditoría `07-hojas-piezas.md`): lo prohibido ya va UNA vez en PROHIBIDO; NEGATIVOS lleva solo «lo que no se dice»
    ...listaDe('NEGATIVOS', b.obligatorios.no_se_dice),
    campo('APRUEBA Y PARA CUÁNDO', cuando),
  ]
  // 17-nov · puntos 2 y 3 de «creativos en cada paso» · lo que la gran idea DECIDIÓ llega como decisión (FIJO / LIBRE / PORQUÉ), no como texto para copiar.
  // Solo si la gran idea trae las partes de «cómo se ve»: una gran idea vieja escribe la hoja EXACTA de antes
  const decidido = loDecidido(c, idea, cap, mensajeDeLaPieza)
  if (decidido.length) L.splice(L.findIndex((x) => x.startsWith('- VISUAL:')) + 1, 0, ...listaDe(CAMPO_LO_DECIDIDO, decidido))
  if (f.datos?.length && !esKit) L.push(campo('DATOS DEL CALENDARIO', datosEnTexto(f.datos)))
  // 19-nov · G5b (A′ · CC1 03:47Z) · la duración de una pieza de video la razona quien escribe la IDEA del banco («duración: N s · porqué»; el campo lo suma CC1 en
  //   `conceptos.ts`). La hoja la copia tal cual; sin ella no escribe nada y la oficina abre con la de por omisión Y lo avisa (`oficina/video/duracion-de-la-pieza.ts`)
  const duracionDeLaIdea = (idea as { duracion?: unknown } | null)?.duracion
  if (esFormatoDeVideo(cab.formato) && !esKit && typeof duracionDeLaIdea === 'string' && limpio(duracionDeLaIdea)) L.push(campo('DURACIÓN', limpio(duracionDeLaIdea)))
  if (extra.fila_ids) L.push(campo('FILAS', extra.fila_ids.join(', ')))
  if (extra.elementos) L.push(...listaDe('ELEMENTOS', extra.elementos))
  if (extra.cuadros?.length) L.push(...listaDe('CUADROS QUE PIDE LA IDEA', extra.cuadros.map((x) => `${x.cuando} (${x.fila_id}): ${x.cuadros} cuadros · idea ${x.idea}`)))
  return L
}

// ───────────────────────────────────────────────────────── la hoja
export function escribirHoja(ins: InsumosDeLaHoja): HojaEscrita {
  const avisos: string[] = []
  const briefs: BriefDeLaHoja[] = []
  const L: string[] = []
  const p = (s: string) => L.push(s)
  const filas = ins.filas.filter((f) => {
    if (RE_ID_DE_BRIEF.test(f.id)) return true
    avisos.push(`fila «${f.id}» con id inválido como brief · se omite de la hoja`)
    return false
  })
  const kitFilas = filasDelKit(filas, ins.formatos)
  const idsKit = new Set(kitFilas.map((f) => f.id))
  const sueltas = filas.filter((f) => !idsKit.has(f.id)).slice().sort((a, b) => `${a.fecha} ${a.hora ?? ''} ${a.id}`.localeCompare(`${b.fecha} ${b.hora ?? ''} ${b.id}`))

  p(`# PARTE DE TRABAJO · ${limpio(ins.client_name)} · ${ins.hoy}`)
  p(`Plan de origen: ${ins.plan_id} · Manual: versión ${ins.manual_version} (${ins.manual_id}) · Concepto: ${ins.concepto_id} · Brief creativo: ${ins.brief_id} · Lote: ${ins.lote_key}${ins.seco ? ' · ⚠️ MODO SECO (no es un parte real)' : ''}`)
  p('Hoja escrita por código (hoja.v1): cada brief sale de una fila del calendario y de su idea del banco; lo que falta está declarado, no inventado.')
  p('')
  const total = sueltas.length + (kitFilas.length ? 1 : 0)
  p(`## Entregables (${total})`)

  for (const f of sueltas) {
    const idea = ideaDelBanco(ins.concepto, f.idea_ref)
    if (f.idea_ref && !idea) avisos.push(`${f.id}: la idea «${f.idea_ref}» no está en el banco del concepto`)
    const familia = familiaDe(ins.formatos, f.red, f.formato)
    if (!familia) avisos.push(`${f.id}: ${f.red} · ${f.formato} sin familia en cadena_formatos_por_red · el sobre saldrá sin sala`)
    p('')
    L.push(...lineasDelBrief(ins, { id: f.id, red: f.red, formato: f.formato }, f, idea, {}, avisos))
    briefs.push({ brief_id: f.id, fila_id: f.id, fila_ids: [f.id], familia, red: f.red, formato: f.formato, idea_ref: idea?.id ?? null })
  }

  let kit: ProcedenciaDeLaHoja['kit'] = null
  if (kitFilas.length) {
    const id = idDelKit(ins.lote_key)
    const elementos = kitFilas.map(lineaDeElemento)
    // 17-nov · DIAGNÓSTICO de la historia pobre (e) · una idea del banco que declara más de 1 cuadro en un elemento del kit: se AVISA (no bloquea) y la mesa lo recibe dicho
    const masDeUnCuadro = cuadrosDeMasEnElKit(kitFilas, ins.concepto)
    for (const x of masDeUnCuadro) avisos.push(`${id}: la idea ${x.idea} pide ${x.cuadros} cuadros y el kit la cuenta como 1 elemento (${x.fila_id}) · la mesa lo recibe en «CUADROS QUE PIDE LA IDEA»`)
    const conIdea = kitFilas.map((f) => ({ f, idea: ideaDelBanco(ins.concepto, f.idea_ref) })).find((x) => x.idea) ?? { f: kitFilas[0], idea: null }
    const primera = kitFilas.find((f) => f.red.toLowerCase() !== 'whatsapp') ?? kitFilas[0]
    p('')
    L.push(...lineasDelBrief(ins, { id, red: primera.red, formato: 'kit' }, conIdea.f, conIdea.idea, { fila_ids: kitFilas.map((f) => f.id), elementos, ...(masDeUnCuadro.length ? { cuadros: masDeUnCuadro } : {}) }, avisos))
    briefs.push({ brief_id: id, fila_id: null, fila_ids: kitFilas.map((f) => f.id), familia: FAMILIA_DEL_KIT, red: primera.red, formato: 'kit', idea_ref: conIdea.idea?.id ?? null })
    kit = { brief_id: id, fila_ids: kitFilas.map((f) => f.id), elementos }
  }

  p('')
  p('## Faltantes del brief creativo (declarados, no rellenados)')
  ins.brief.faltantes.forEach((x) => p(`- ${x.campo} — ${x.que_falta}`))
  if (!ins.brief.faltantes.length) p('(ninguno declarado)')
  p('')
  p('## Contradicciones plan ↔ manual (declaradas, no obedecidas)')
  ins.brief.contradicciones.forEach((x) => p(`- ${x}`))
  if (!ins.brief.contradicciones.length) p('(ninguna declarada)')
  p('')
  p('## Avisos de la hoja')
  avisos.forEach((a) => p(`- ${a}`))
  if (!avisos.length) p('(ninguno)')

  return {
    texto_md: L.join('\n'),
    briefs,
    provenance: {
      hoja: true, contrato: 'hoja.v1', lote_key: ins.lote_key, fila_ids: filas.map((f) => f.id),
      familias_por_brief: briefs.map((b) => ({ brief_id: b.brief_id, fila_id: b.fila_id, familia: b.familia })),
      kit, brief_creativo_id: ins.brief_id, concepto_id: ins.concepto_id, seco: ins.seco === true, valido: total > 0,
    },
    avisos,
  }
}
