/**
 * LA HOJA DE PRODUCCIÓN · por código (31-oct · diseño «nuevo orden de la cadena» v5 §6 · plan v2 T1).
 * Reemplaza al redactor del parte (`campaign-brief-agent` por lote): el parte de trabajo lo ESCRIBE código a partir de lo que ya existe —
 * el brief creativo de la campaña (contrato `brief_creativo.v1`) · el concepto con su banco de ideas (`concepto.v1`) · las filas fechadas del calendario (cada una con su `idea_ref`).
 * Escribe EXACTAMENTE el formato que ya lee la oficina (`src/lib/oficina/brief.ts` · `parsearBrief` / `elementosDelKit` / `proporcionDelBrief` / `planDeOrigen`):
 *   `### <fila_id> · <Red> · <formato>` + `- CAMPO: valor` + listas `- CAMPO:` con `  - elemento`.
 * El identificador de cada brief es el `fila_id` (no hay numeración aparte). Las filas de la familia `kit_historias` de un lote van en UN brief de kit (port de `scripts/worker-staging/cadena/kit-de-historias.js`).
 * Puro: sin red, sin base, sin modelo, sin cliente. Lo que falta se DECLARA en la hoja («sin idea del banco»), nunca se inventa.
 */
import type { DatoDeterminado, Fila, FormatosPorRed } from './tipos'
import type { BriefCreativoLeido } from './brief-creativo'
import { ideaDelBanco, type ConceptoLeido, type IdeaDelBanco } from './conceptos'

export const FAMILIA_DEL_KIT = 'kit_historias'
/** el id de un brief del parte (mismo criterio que `autoproducir.ts` RE_BRIEF) */
export const RE_ID_DE_BRIEF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/
/** proporción por omisión según el formato (se declara en LÍMITES como «por omisión del formato») */
export const PROPORCION_POR_FORMATO: Readonly<Record<string, string>> = { imagen: '4:5', carrusel: '4:5', historia: '9:16', estado: '9:16', reel: '9:16', video: '9:16', kit: '9:16' }
const PROPORCION_POR_OMISION = '1:1'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export type FilaDeHoja = Pick<Fila, 'id' | 'fecha' | 'hora' | 'red' | 'formato' | 'pilar' | 'tema' | 'datos'> & {
  /** la fase del plan a la que pertenece (columna `fase` de `cadena_calendario_filas`) */
  fase?: string | null
  /** la idea del banco que la fila realiza (`C<fase>-I<nn>`); sin idea ⇒ la hoja lo declara */
  idea_ref?: string | null
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
export function proporcionDe(formato: string, proporciones: Readonly<Record<string, string>> = PROPORCION_POR_FORMATO): { proporcion: string; por_omision: boolean } {
  const p = proporciones[formato.toLowerCase()]
  return p ? { proporcion: p, por_omision: true } : { proporcion: PROPORCION_POR_OMISION, por_omision: true }
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
/** el id del brief de kit del lote: `kit-<lote_key>` saneado al criterio de RE_ID_DE_BRIEF */
export const idDelKit = (loteKey: string): string => `kit-${loteKey.replace(/[^A-Za-z0-9_.-]+/g, '-')}`.slice(0, 40)

// ───────────────────────────────────────────────────────── un brief de la hoja
function mensajeDe(idea: IdeaDelBanco | null, f: Pick<FilaDeHoja, 'tema'>, avisos: string[], id: string): string {
  if (idea?.mensaje) return idea.mensaje
  avisos.push(`${id}: sin idea del banco (${f.tema ? `tema «${limpio(f.tema)}»` : 'sin tema'}) · el mensaje sale del tema y se declara`)
  return `${limpio(f.tema) || '(sin tema)'} · sin idea del banco`
}
function lineasDelBrief(ins: InsumosDeLaHoja, cab: { id: string; red: string; formato: string }, f: FilaDeHoja, idea: IdeaDelBanco | null, extra: { fila_ids?: string[]; elementos?: string[] }, avisos: string[]): string[] {
  const b = ins.brief
  const c = ins.concepto
  const cap = c.capitulos.find((x) => (f.fase && x.clave === f.fase) || (idea && x.clave === idea.capitulo)) ?? null
  const porRed = b.por_red.find((x) => x.red === cab.red.toLowerCase()) ?? null
  const { proporcion } = proporcionDe(cab.formato, ins.proporciones)
  const esKit = cab.formato === 'kit'
  const cuando = `aprobar antes de publicar · publica el ${fechaEnLetras(f.fecha)}${f.hora ? ` a las ${limpio(f.hora).slice(0, 5)}` : ''}`
  const L: string[] = [
    `### ${cab.id} · ${mayuscula(cab.red)} · ${cab.formato}`,
    campo('QUÉ ES', esKit ? `Kit semanal de historias y estados (${extra.elementos?.length ?? 0} ${extra.elementos?.length === 1 ? 'elemento' : 'elementos'}) · ${idea?.idea ?? f.tema ?? ''}` : `${cab.formato} para ${mayuscula(cab.red)} · ${idea?.idea ?? limpio(f.tema) ?? ''}`),
    campo('DE QUÉ PARTE DEL PLAN SALE', b.de_que_parte_del_plan),
    campo('GRAN IDEA', c.gran_idea ? `${c.gran_idea.nombre} · ${c.gran_idea.frase}` : '(sin gran idea)'),
    campo('CAPÍTULO DE LA FASE', cap ? `${cap.clave} · ${cap.nombre} · ${cap.que_cuenta}` : f.fase ? `${f.fase} · (sin capítulo en el concepto)` : '(sin fase)'),
    campo('IDEA DEL BANCO', idea ? `${idea.id} · ${idea.idea}${idea.serie ? ` · serie ${idea.serie}` : ''}` : 'ninguna · declarado'),
    campo('BRIEF DE CAMPAÑA', ins.brief_id),
    campo('MENSAJE DE CAMPAÑA', b.mensaje),
    campo('OBJETIVO', porRed?.objetivo || b.objetivo),
    campo('PROTAGONISTA', idea?.protagonista || limpio(f.tema) || '(sin protagonista declarado)'),
    campo('MENSAJE (uno)', mensajeDe(idea, f, avisos, cab.id)),
    campo('GANCHO', idea?.gancho ?? ''),
    campo('LÍMITES', `proporción ${proporcion} (por omisión del formato ${cab.formato}) · ${b.obligatorios.no_se_dice.length ? `no se dice: ${b.obligatorios.no_se_dice.join(', ')}` : 'sin «no se dice» en el brief'}${idea?.foto ? ` · foto citada: ${idea.foto}` : ''}`),
    ...listaDe('VOCABULARIO OBLIGATORIO', b.obligatorios.vocabulario),
    ...listaDe('PROHIBIDO', b.obligatorios.prohibido),
    campo('SINTAXIS', b.tono),
    campo('VISUAL', [c.como_se_ve, cap?.como_se_ve, idea?.foto && idea.foto !== 'ninguna' ? `foto ${idea.foto}` : ''].filter(Boolean).join(' · ') || '(el concepto no dice cómo se ve)'),
    campo('LLAMADO A LA ACCIÓN', porRed?.llamado ?? ''),
    campo('VARIANTES', '1'),
    ...listaDe('NEGATIVOS', [...b.obligatorios.no_se_dice, ...b.obligatorios.prohibido]),
    campo('APRUEBA Y PARA CUÁNDO', cuando),
  ]
  if (f.datos?.length && !esKit) L.push(campo('DATOS DEL CALENDARIO', datosEnTexto(f.datos)))
  if (extra.fila_ids) L.push(campo('FILAS', extra.fila_ids.join(', ')))
  if (extra.elementos) L.push(...listaDe('ELEMENTOS', extra.elementos))
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
    const conIdea = kitFilas.map((f) => ({ f, idea: ideaDelBanco(ins.concepto, f.idea_ref) })).find((x) => x.idea) ?? { f: kitFilas[0], idea: null }
    const primera = kitFilas.find((f) => f.red.toLowerCase() !== 'whatsapp') ?? kitFilas[0]
    p('')
    L.push(...lineasDelBrief(ins, { id, red: primera.red, formato: 'kit' }, conIdea.f, conIdea.idea, { fila_ids: kitFilas.map((f) => f.id), elementos }, avisos))
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
