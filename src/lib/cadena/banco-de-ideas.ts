/**
 * 17-nov · BANCO DE IDEAS editable desde el tablero (GO Lenovo · Emilio aprobó el boceto 06:28 · ADENDA 06:33 «Retirar») · US$ 0: no reescribe ni gasta.
 * Contrato con CC5 (`RESPUESTA-CC5-a-CC1-banco-de-ideas-contrato`) + las 4 medidas de CC6 (`NOTA-CC6-a-CC1-CC5-banco-de-ideas-lo-que-voy-a-medir`):
 *  - SOLO el tablero (`workflow_id: 'tablero'`, acción humana) y SOLO sobre la versión APROBADA vigente (la que lee el calendario): si la pantalla vio otra, 409;
 *  - `editar` va en tanda (todo o nada, una sola escritura); `linea` se rehace desde los campos y se refleja en `texto_md`
 *    (la «versión anterior» que recibe la mesa si Emilio pide otra sale del texto, `resumenDeLaVersionAnterior`);
 *  - `retirar` SACA la idea de `banco` a `ideas_retiradas` (ningún lector del banco cambia) y reasigna, sin avisar a Emilio, las filas SIN brief que la citan:
 *    otra idea del mismo capítulo (misma red y formato si hay; si no, misma red; si no, cualquiera), la menos usada; las filas con brief conservan su idea;
 *  - cada cambio deja su entrada en `historial_del_banco` (antes · después · quién · cuándo) en la MISMA escritura del concepto;
 *  - la escritura es condicional al sello leído (`actualizada_en`): dos «Pedir los cambios» casi juntos no se pisan (el segundo relee y vuelve a aplicar).
 */
import type { Almacen, ConceptoGuardado } from './almacen'
import { autorizarLlamada, cadena, err, WORKFLOW_DEL_TABLERO, type Respuesta } from './autorizar'
import { leerIdea, type IdeaDelBanco } from './conceptos'
import type { Fila } from './tipos'

export const CAMPOS_EDITABLES = ['idea', 'mensaje', 'gancho', 'protagonista'] as const
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]
export const LARGO_MAXIMO_DE_CAMPO = 2000
export const MAXIMO_DE_CAMBIOS_POR_TANDA = 200
export const INTENTOS_DE_ESCRITURA = 3
/** las filas que todavía no tienen brief: se reasignan al retirar; las de brief en adelante conservan su idea (cuidado 3 de CC6 · propuesta CC1, decisión final de Lenovo/Emilio) */
export const ESTADOS_SIN_BRIEF: readonly Fila['estado'][] = ['esquema', 'propuesta', 'validada', 'en_investigacion', 'lista_para_brief']
export const ESTADOS_CON_BRIEF: readonly Fila['estado'][] = ['briefeada', 'en_oficina', 'aprobada', 'espera_video']
/**
 * 19-nov · firma de Emilio (23:25 Zúrich, vía Lenovo 22:30Z): al retirar una idea, las filas CON BRIEF todavía sin aprobar también reciben otra idea del mismo
 * capítulo y su brief se rehace. `aprobada` y `espera_video` no se tocan aquí (la aprobada vuelve solo con regla dura, y eso lo decide el receptor de CC3).
 * La VUELTA al brief (`→ lista_para_brief`) va SIEMPRE antes de la idea nueva, con la marca de quien la pide: desde el tablero, la de este núcleo; por una corrección,
 * la del receptor de CC3 (`avisoDeLaVuelta(llave)`, para que su conteo por estado + marca siga igual · CC3 19-nov 00:59Z: un corte nunca deja brief viejo + idea nueva).
 * 19-nov · decisión A de Lenovo (01:16Z, 🔴 de CC7): la pieza vieja de una fila que volvió al brief se ARCHIVA sola (`archivarPiezasViejas`, una sola función para las dos
 * puertas): solo la que espera a Emilio, nunca una que él ya decidió; lo que no se puede leer no se archiva y se dice.
 */
export const ESTADOS_CON_BRIEF_QUE_CAMBIAN: readonly Fila['estado'][] = ['briefeada', 'en_oficina']
export const ESTADOS_QUE_CAMBIAN_DE_IDEA: readonly Fila['estado'][] = [...ESTADOS_SIN_BRIEF, ...ESTADOS_CON_BRIEF_QUE_CAMBIAN]
export const PREFIJO_AVISO_DE_REASIGNACION = 'idea reasignada: '
export const avisoDeLaVueltaPorElTablero = (ideaId: string) => `la idea «${ideaId}» se retiró del banco desde el tablero: el brief se rehace con la idea nueva y la pieza vieja queda reemplazada`
/** el motivo que queda escrito en la pieza archivada y en su encargo (el texto lo fijó Lenovo 01:16Z) */
export const motivoDePiezaVieja = (ideaId: string, accion: 'retirar' | 'editar' = 'retirar') => `reemplazada: la idea «${ideaId}» se ${accion === 'retirar' ? 'retiró del' : 'corrigió en el'} banco`

/** lo que pasó con las piezas viejas: `error` = no se pudo leer o escribir, NADA se dio por archivado (se dice, no se calla) */
export interface PiezasViejas { archivadas: string[]; ya_archivadas: string[]; no_archivadas: Array<{ fila_id: string; hitl_id: string | null; motivo: string; estado?: string }>; error?: string; alarma?: 'enviada' | 'no_salio' }
/**
 * LA función de las dos puertas (tablero y receptor): archiva la pieza pendiente de cada fila. Quien llama elige las filas POR ESTADO (`lista_para_brief` con su marca),
 * así repetir no duplica ni se salta nada (la oficina cuenta lo ya archivado como `ya_archivadas`). Nunca lanza.
 */
export async function archivarPiezasViejas(al: Almacen, campanaId: string, filaIds: readonly string[], motivo: string, ahora: string): Promise<PiezasViejas> {
  const vacio: PiezasViejas = { archivadas: [], ya_archivadas: [], no_archivadas: [] }
  const ids = [...new Set(filaIds)]
  if (!ids.length) return vacio
  let error: string
  if (!al.archivarPiezasDeFilas) error = 'esta cadena no tiene cómo archivar piezas'
  else {
    try {
      const r = await al.archivarPiezasDeFilas(campanaId, ids, motivo, ahora)
      if (r.ok) return { archivadas: r.archivadas.map((a) => a.hitl_id), ya_archivadas: r.ya_archivadas, no_archivadas: r.no_archivadas.map((n) => ({ fila_id: n.fila_id, hitl_id: n.hitl_id, motivo: n.motivo, ...(n.estado ? { estado: n.estado } : {}) })) }
      error = r.motivo
    } catch (e) {
      error = `la oficina no contestó: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300)
    }
  }
  // 🟡 CC3 01:31Z · «se dice» de verdad: UNA alarma en #alertas por incidente (después de esto la corrección se cierra y nadie vuelve a mirar); el campo queda igual
  return { ...vacio, error, alarma: await alarmaDePiezaVieja(al, campanaId, ids, motivo, error) }
}
export const textoDeAlarmaDePiezaVieja = (campanaId: string, filaIds: readonly string[], motivo: string, error: string) =>
  `⚠️ Pieza vieja sin archivar · campaña ${campanaId} · la(s) fila(s) ${filaIds.join(', ')} volvieron al brief (${motivo}), pero su pieza vieja puede seguir esperando en la bandeja: no la apruebes; archívala a mano. Motivo: ${error}.`
async function alarmaDePiezaVieja(al: Almacen, campanaId: string, filaIds: readonly string[], motivo: string, error: string): Promise<'enviada' | 'no_salio'> {
  try { return (await al.avisarAlarma(textoDeAlarmaDePiezaVieja(campanaId, filaIds, motivo, error))).ok ? 'enviada' : 'no_salio' } catch { return 'no_salio' }
}

export interface Reasignada { fila_id: string; idea_vieja: string; idea_nueva: string | null }
export interface EntradaDelHistorial {
  accion: 'editar' | 'retirar'
  idea_id: string
  version: number
  antes: Record<string, unknown>
  /** null al retirar */
  despues: Record<string, unknown> | null
  quien: string
  cuando: string
  reasignadas?: Reasignada[]
  con_brief_sin_tocar?: string[]
  /** 19-nov · las filas con brief (sin aprobar) que recibieron otra idea */
  con_brief_reasignadas?: string[]
  /** 19-nov · decisión A de Lenovo · lo que pasó con las piezas viejas de las filas que volvieron al brief desde el tablero */
  piezas_viejas?: PiezasViejas
}
type IdeaRetirada = IdeaDelBanco & { retirada_en: string; retirada_por: string }

const fallo = (status: number, code: string, detalle: string, extra: Record<string, unknown> = {}): Respuesta => err(status, code, detalle, { ok: false, ...extra })

/** la línea de una idea, como la escribe la mesa: `- C1-I23 · red · formato · idea · mensaje: … · gancho: … · protagonista: … · serie: S1 · foto:<id>|ninguna` */
export function lineaDeIdea(i: Pick<IdeaDelBanco, 'id' | 'red' | 'formato' | 'idea' | 'mensaje' | 'gancho' | 'protagonista' | 'serie' | 'foto' | 'cuadros'>): string {
  return [`- ${i.id}`, i.red, i.formato, i.idea, `mensaje: ${i.mensaje}`, `gancho: ${i.gancho}`, `protagonista: ${i.protagonista}`, ...(i.serie ? [`serie: ${i.serie}`] : []), ...(i.cuadros ? [`cuadros: ${i.cuadros}`] : []), `foto:${i.foto ?? 'ninguna'}`].join(' · ')
}

/** la línea se vuelve a leer igual: si un campo trae algo que el lector tomaría por otra etiqueta (« · gancho: …»), la edición se rechaza en vez de guardar una línea que se lee distinto */
export function lineaSeLeeIgual(i: IdeaDelBanco, linea: string): boolean {
  const r = leerIdea(linea)
  return !!r && r.id === i.id && r.red === i.red && r.formato === i.formato && r.idea === i.idea && r.mensaje === i.mensaje && r.gancho === i.gancho && r.protagonista === i.protagonista && (r.serie ?? null) === (i.serie ?? null) && (r.cuadros ?? null) === (i.cuadros ?? null) && (r.foto ?? null) === (i.foto ?? null)
}

/** el texto de la mesa con la idea `id` cambiada por `nueva` (o quitada si `null`) en TODAS sus apariciones; respeta el fin de línea del texto */
export function textoConIdea(md: string, id: string, nueva: string | null): { md: string; cambiadas: number } {
  const crlf = md.includes('\r\n')
  let cambiadas = 0
  const salida: string[] = []
  for (const l of md.split('\n')) {
    const limpia = l.endsWith('\r') ? l.slice(0, -1) : l
    if (leerIdea(limpia)?.id !== id) { salida.push(l); continue }
    cambiadas++
    if (nueva !== null) salida.push(crlf ? `${nueva}\r` : nueva)
  }
  return { md: salida.join('\n'), cambiadas }
}

/** la idea que reemplaza a la retirada en una fila: mismo capítulo; primero misma red y formato, luego misma red, luego cualquiera; desempata la menos usada y luego el id */
export function ideaDeReemplazo(banco: IdeaDelBanco[], retirada: IdeaDelBanco, usos: Map<string, number>): IdeaDelBanco | null {
  const rango = (i: IdeaDelBanco) => (i.red === retirada.red && i.formato === retirada.formato ? 0 : i.red === retirada.red ? 1 : 2)
  const candidatas = banco.filter((i) => i.id !== retirada.id && i.capitulo !== null && i.capitulo === retirada.capitulo)
  candidatas.sort((a, b) => rango(a) - rango(b) || (usos.get(a.id) ?? 0) - (usos.get(b.id) ?? 0) || a.id.localeCompare(b.id))
  return candidatas[0] ?? null
}

/** cómo se nombra cada campo en los mensajes que lee Emilio (sin códigos: el tablero muestra `detalle` tal cual) */
const NOMBRE_DE_CAMPO: Record<string, string> = { idea: 'la idea', mensaje: 'el mensaje', gancho: 'el gancho', protagonista: 'el protagonista' }
const limpiarCampo = (x: unknown): string | null => (typeof x === 'string' ? x.replace(/\s*[\r\n]+\s*/g, ' ').trim() : null)

/** a qué versión de la gran idea y en nombre de quién se escribe el banco (la puerta del tablero o el puerto de correcciones lo arman) */
export interface ContextoDelBanco { campana_id: string; version: number; autor: string }
type Contexto = ContextoDelBanco
async function prepararLlamada(al: Almacen, cuerpo: Record<string, unknown>): Promise<{ ok: true; ctx: Contexto } | { ok: false; r: Respuesta }> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return { ok: false, r: fallo(400, 'E-CAMPOS', 'falta campana_id') }
  const campana = await al.campana(id)
  if (!campana) return { ok: false, r: fallo(404, 'E-CAMPANA', 'campaña inexistente') }
  // medida de CC6: SOLO el tablero, con su sesión; ningún flujo ni viaje de la sala edita el banco
  if (cuerpo.workflow_id !== WORKFLOW_DEL_TABLERO) return { ok: false, r: fallo(403, 'E-SOLO-TABLERO', 'el banco de ideas solo se edita desde el tablero') }
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id, { humano: true })
  if (noAut) return { ok: false, r: { status: noAut.status, cuerpo: { ok: false, ...noAut.cuerpo } } }
  if (!Number.isInteger(cuerpo.version)) return { ok: false, r: fallo(400, 'E-VERSION', 'falta version: la versión de la gran idea que vio la pantalla') }
  return { ok: true, ctx: { campana_id: id, version: cuerpo.version as number, autor: cadena(cuerpo.autor) ?? 'emilio' } }
}

/** la versión aprobada vigente (la misma regla que el calendario: la ÚLTIMA aprobada con lectura) y su sello; 409 si la pantalla vio otra */
async function leerVigente(al: Almacen, ctx: Contexto): Promise<{ ok: true; c: ConceptoGuardado; sello: string; leido: Record<string, unknown>; banco: IdeaDelBanco[]; retiradas: IdeaRetirada[]; historial: EntradaDelHistorial[] } | { ok: false; r: Respuesta }> {
  const todos = await al.conceptosDe(ctx.campana_id)
  const aprobado = [...todos].reverse().find((c) => c.aprobacion === 'aprobado' && c.leido)
  if (!aprobado) return { ok: false, r: fallo(409, 'E-SIN-GRAN-IDEA-APROBADA', 'la campaña no tiene una gran idea aprobada: no hay banco que editar') }
  if (aprobado.version !== ctx.version) return { ok: false, r: fallo(409, 'E-VERSION-NO-VIGENTE', `la pantalla mostraba la versión ${ctx.version} de la gran idea, pero la vigente es la ${aprobado.version}: vuelve a abrir la gran idea`, { version_vigente: aprobado.version }) }
  const s = await al.conceptoConSello(ctx.campana_id, ctx.version)
  if (!s || s.concepto.aprobacion !== 'aprobado' || !s.concepto.leido) return { ok: false, r: fallo(409, 'E-VERSION-NO-VIGENTE', `la versión ${ctx.version} de la gran idea dejó de estar aprobada: vuelve a abrir la gran idea`) }
  const leido = structuredClone(s.concepto.leido) as Record<string, unknown>
  const banco = (Array.isArray(leido.banco) ? leido.banco : []) as IdeaDelBanco[]
  const retiradas = (Array.isArray(leido.ideas_retiradas) ? leido.ideas_retiradas : []) as IdeaRetirada[]
  const historial = (Array.isArray(leido.historial_del_banco) ? leido.historial_del_banco : []) as EntradaDelHistorial[]
  return { ok: true, c: s.concepto, sello: s.sello, leido, banco, retiradas, historial }
}

// ───────────────────────────────────────────────────────── editar (en tanda · todo o nada)
export interface CambioPedido { idea_id: string; campos: Partial<Record<CampoEditable, string>> }
export function leerCambios(x: unknown): { ok: true; cambios: CambioPedido[] } | { ok: false; r: Respuesta } {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, r: fallo(400, 'E-CAMBIOS', 'faltan los cambios: una lista de { idea_id, campos }') }
  if (x.length > MAXIMO_DE_CAMBIOS_POR_TANDA) return { ok: false, r: fallo(400, 'E-CAMBIOS', `demasiados cambios en una tanda (máximo ${MAXIMO_DE_CAMBIOS_POR_TANDA})`) }
  const vistos = new Set<string>()
  const cambios: CambioPedido[] = []
  for (const c of x) {
    const o = c && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : null
    const idea_id = o ? cadena(o.idea_id) : null
    const campos = o?.campos && typeof o.campos === 'object' && !Array.isArray(o.campos) ? (o.campos as Record<string, unknown>) : null
    if (!idea_id || !campos) return { ok: false, r: fallo(400, 'E-CAMBIOS', 'cada cambio necesita idea_id y campos') }
    if (vistos.has(idea_id)) return { ok: false, r: fallo(400, 'E-IDEA-REPETIDA', 'una misma idea viene dos veces en los cambios: junta sus campos en un solo cambio', { idea_id }) }
    vistos.add(idea_id)
    const limpios: Partial<Record<CampoEditable, string>> = {}
    for (const [k, v] of Object.entries(campos)) {
      if (!(CAMPOS_EDITABLES as readonly string[]).includes(k)) return { ok: false, r: fallo(400, 'E-CAMPO-NO-EDITABLE', `ese dato de la idea no se edita desde aquí (solo la idea, el mensaje, el gancho y el protagonista)`, { idea_id, campo: k }) }
      const t = limpiarCampo(v)
      if (!t) return { ok: false, r: fallo(400, 'E-CAMPO-VACIO', `${NOMBRE_DE_CAMPO[k] ?? k} de una idea no puede quedar vacío`, { idea_id, campo: k }) }
      if (t.length > LARGO_MAXIMO_DE_CAMPO) return { ok: false, r: fallo(400, 'E-CAMPO-LARGO', `${NOMBRE_DE_CAMPO[k] ?? k} de una idea pasa de ${LARGO_MAXIMO_DE_CAMPO} caracteres`, { idea_id, campo: k }) }
      limpios[k as CampoEditable] = t
    }
    if (!Object.keys(limpios).length) return { ok: false, r: fallo(400, 'E-CAMBIOS', 'un cambio no trae ningún campo editado', { idea_id }) }
    cambios.push({ idea_id, campos: limpios })
  }
  return { ok: true, cambios }
}

export async function bancoEditar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const p = await prepararLlamada(al, cuerpo)
  if (!p.ok) return p.r
  const lc = leerCambios(cuerpo.cambios)
  if (!lc.ok) return lc.r
  return editarEnElBanco(al, p.ctx, lc.cambios, ahora)
}

/** 17-nov · el NÚCLEO de editar (sin la puerta): lo usan el tablero y, con su propia puerta, el puerto de correcciones de la jefatura (`banco-correcciones.ts`) */
/** `esperadas` (solo el puerto de correcciones): la `linea` que cada idea debe tener AL ESCRIBIR; si otra edición la cambió en medio → 409 E-IDEA-CAMBIADA, sin pisar. El tablero no la pasa */
export async function editarEnElBanco(al: Almacen, ctx: ContextoDelBanco, cambios: readonly CambioPedido[], ahora: string, esperadas?: Readonly<Record<string, string>>): Promise<Respuesta> {
  const p = { ctx }
  const lc = { cambios }
  for (let intento = 1; intento <= INTENTOS_DE_ESCRITURA; intento++) {
    const v = await leerVigente(al, p.ctx)
    if (!v.ok) return v.r
    let md = v.c.texto_md ?? ''
    const ideas: IdeaDelBanco[] = []
    const nuevas: EntradaDelHistorial[] = []
    for (const cambio of lc.cambios) {
      const k = v.banco.findIndex((i) => i.id === cambio.idea_id)
      if (k < 0) {
        if (v.retiradas.some((i) => i.id === cambio.idea_id)) return fallo(409, 'E-IDEA-RETIRADA', 'esa idea ya se retiró del banco: no se edita', { idea_id: cambio.idea_id })
        return fallo(404, 'E-IDEA-NO-EXISTE', 'esa idea ya no está en el banco de la gran idea: vuelve a abrirla', { idea_id: cambio.idea_id })
      }
      const actual = v.banco[k]
      if (esperadas && esperadas[cambio.idea_id] !== undefined && esperadas[cambio.idea_id] !== actual.linea) return fallo(409, 'E-IDEA-CAMBIADA', 'la idea cambió desde que se armó la corrección: no se pisa', { idea_id: cambio.idea_id })
      const distintos = CAMPOS_EDITABLES.filter((c) => cambio.campos[c] !== undefined && cambio.campos[c] !== actual[c])
      if (!distintos.length) continue
      const sinLinea: IdeaDelBanco = { ...actual, ...cambio.campos }
      const linea = lineaDeIdea(sinLinea)
      const nueva: IdeaDelBanco = { ...sinLinea, linea }
      if (!lineaSeLeeIgual(nueva, linea)) return fallo(400, 'E-CAMPO-INVALIDO', 'un texto trae « · » seguido de «mensaje:», «gancho:» u otra etiqueta y la idea se leería distinta: quita ese « · »', { idea_id: cambio.idea_id })
      v.banco[k] = nueva
      md = textoConIdea(md, cambio.idea_id, linea).md
      ideas.push(nueva)
      const antes: Record<string, unknown> = {}, despues: Record<string, unknown> = {}
      for (const c of distintos) { antes[c] = actual[c]; despues[c] = nueva[c] }
      antes.linea = actual.linea; despues.linea = linea
      nuevas.push({ accion: 'editar', idea_id: cambio.idea_id, version: p.ctx.version, antes, despues, quien: p.ctx.autor, cuando: ahora })
    }
    if (!nuevas.length) return { status: 200, cuerpo: { ok: true, version: p.ctx.version, ideas: [], historial: [], sin_cambios: true } }
    const leido = { ...v.leido, banco: v.banco, historial_del_banco: [...v.historial, ...nuevas] }
    if (await al.actualizarConceptoSiSello(p.ctx.campana_id, p.ctx.version, v.sello, { leido, texto_md: v.c.texto_md === null ? null : md })) {
      return { status: 200, cuerpo: { ok: true, version: p.ctx.version, ideas, historial: nuevas } }
    }
  }
  return fallo(409, 'E-CONCURRENTE', 'otra edición del banco se guardó al mismo tiempo y no se pudo aplicar la tuya: vuelve a abrir la gran idea')
}

// ───────────────────────────────────────────────────────── retirar (con reasignación de las filas sin brief)
export async function bancoRetirar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const p = await prepararLlamada(al, cuerpo)
  if (!p.ok) return p.r
  const ideaId = cadena(cuerpo.idea_id)
  if (!ideaId) return fallo(400, 'E-CAMPOS', 'falta idea_id')
  // desde el tablero no hay receptor: este mismo núcleo devuelve al brief las filas con brief (sin aprobar) que cambian de idea
  return retirarDelBanco(al, p.ctx, ideaId, ahora, undefined, { avisoDeLaVuelta: avisoDeLaVueltaPorElTablero(ideaId), archivarPiezas: true })
}

/** 17-nov · el NÚCLEO de retirar (sin la puerta): reasigna las filas sin brief y saca la idea; lo usan el tablero y el puerto de correcciones */
/** `esperada` (solo el puerto de correcciones): la `linea` que la idea debe tener antes de tocar filas Y en cada intento de escritura; si cambió → 409 E-IDEA-CAMBIADA */
/** `o.avisoDeLaVuelta`: antes de la idea nueva, la fila con brief vuelve a `lista_para_brief` con ESA marca (el tablero, la suya; la corrección, la del receptor). Sin él no vuelve. */
/** `o.archivarPiezas` (solo el tablero): archiva la pieza vieja de las filas que volvieron con esa marca, ANTES de escribir el concepto (repetir el retiro la completa). Por una corrección la archiva el receptor. */
export async function retirarDelBanco(al: Almacen, ctx: ContextoDelBanco, ideaId: string, ahora: string, esperada?: string, o: { avisoDeLaVuelta?: string; archivarPiezas?: boolean } = {}): Promise<Respuesta> {
  const p = { ctx }
  const v0 = await leerVigente(al, p.ctx)
  if (!v0.ok) return v0.r
  const enBanco = v0.banco.find((i) => i.id === ideaId) ?? null
  const yaRetirada = v0.retiradas.find((i) => i.id === ideaId) ?? null
  const retirada: IdeaDelBanco | null = enBanco ?? yaRetirada
  if (!retirada) return fallo(404, 'E-IDEA-NO-EXISTE', 'esa idea ya no está en el banco de la gran idea: vuelve a abrirla', { idea_id: ideaId })
  if (esperada !== undefined && enBanco?.linea !== esperada) return fallo(409, 'E-IDEA-CAMBIADA', 'la idea cambió desde que se armó la corrección: no se pisa', { idea_id: ideaId })

  // 1) las filas primero: si algo se corta después, las filas ya apuntan a ideas vivas y repetir el retiro termina de sacar la idea
  const calVersion = await al.ultimaVersionDeCalendario(p.ctx.campana_id)
  const filas = calVersion ? await al.filas(p.ctx.campana_id, calVersion) : []
  const citan = filas.filter((f) => f.idea_ref === ideaId).sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || a.id.localeCompare(b.id))
  // 🔴 condición de CC3 (19-nov 00:21Z): si un retiro anterior se cortó DESPUÉS de reasignar y ANTES del historial, las filas con brief ya no citan la idea;
  // se recuperan por el aviso de reasignación de ESTA idea, así la repetición las vuelve a listar y el receptor las devuelve al brief
  const marcaDeEstaIdea = `${PREFIJO_AVISO_DE_REASIGNACION}la idea «${ideaId}» se retiró del banco`
  const yaReasignadasConBrief = filas.filter((f) => f.idea_ref !== ideaId && ESTADOS_CON_BRIEF.includes(f.estado) && f.avisos.some((a) => a.startsWith(marcaDeEstaIdea))).map((f) => f.id)
  // las que ESTE retiro ya devolvió al brief (con su marca) en un intento anterior cortado: siguen siendo «con brief» para el receptor (cuenta por estado + marca)
  const marcaDeLaVuelta = o.avisoDeLaVuelta
  const yaDevueltas = marcaDeLaVuelta ? filas.filter((f) => f.estado === 'lista_para_brief' && f.avisos.includes(marcaDeLaVuelta)) : []
  const con_brief_sin_tocar = [...new Set([...citan.filter((f) => ESTADOS_CON_BRIEF.includes(f.estado)).map((f) => f.id), ...yaReasignadasConBrief, ...yaDevueltas.map((f) => f.id)])]
  const usos = new Map<string, number>()
  for (const f of filas) if (f.idea_ref) usos.set(f.idea_ref, (usos.get(f.idea_ref) ?? 0) + 1)
  const banco = v0.banco.filter((i) => i.id !== ideaId)
  const reasignadas: Reasignada[] = []
  const con_brief_reasignadas: string[] = [...new Set([...yaReasignadasConBrief, ...yaDevueltas.filter((f) => f.idea_ref !== ideaId).map((f) => f.id)])]
  for (const f of citan.filter((x) => ESTADOS_QUE_CAMBIAN_DE_IDEA.includes(x.estado))) {
    const conBrief = ESTADOS_CON_BRIEF_QUE_CAMBIAN.includes(f.estado)
    // desde el tablero: PRIMERO la vuelta al brief y DESPUÉS la idea. Si se corta en el medio, la fila ya está sin brief y repetir el retiro la reasigna como a las demás
    // si la vuelta no se pudo escribir (la fila cambió de estado entre medio), NO se le cambia la idea: una fila con brief viejo e idea nueva no debe existir
    if (conBrief && o.avisoDeLaVuelta && calVersion && !(await al.reubicarFila(p.ctx.campana_id, calVersion, f.id, { estado: 'lista_para_brief' }, o.avisoDeLaVuelta, ESTADOS_CON_BRIEF_QUE_CAMBIAN))) continue
    const nueva = ideaDeReemplazo(banco, retirada, usos)
    const aviso = nueva
      ? `${PREFIJO_AVISO_DE_REASIGNACION}la idea «${ideaId}» se retiró del banco; la fila realiza ahora «${nueva.id}» (mismo capítulo)`
      : `${PREFIJO_AVISO_DE_REASIGNACION}la idea «${ideaId}» se retiró del banco y su capítulo no tiene otra: la fila queda sin idea`
    if (await al.reasignarIdeaDeFila(p.ctx.campana_id, calVersion, f.id, ideaId, nueva?.id ?? null, aviso, ESTADOS_QUE_CAMBIAN_DE_IDEA)) {
      reasignadas.push({ fila_id: f.id, idea_vieja: ideaId, idea_nueva: nueva?.id ?? null })
      if (conBrief || yaDevueltas.some((x) => x.id === f.id)) con_brief_reasignadas.push(f.id)
      if (nueva) usos.set(nueva.id, (usos.get(nueva.id) ?? 0) + 1)
    }
  }

  // 1b) decisión A de Lenovo · desde el tablero, la pieza vieja de cada fila que volvió (POR ESTADO: `lista_para_brief` con la marca de este retiro) se archiva ANTES del concepto
  let piezas_viejas: PiezasViejas | undefined
  if (o.archivarPiezas && o.avisoDeLaVuelta && calVersion) {
    const marca = o.avisoDeLaVuelta
    const volvieron = (await al.filas(p.ctx.campana_id, calVersion)).filter((f) => f.estado === 'lista_para_brief' && f.avisos.includes(marca)).map((f) => f.id)
    if (volvieron.length) piezas_viejas = await archivarPiezasViejas(al, p.ctx.campana_id, volvieron, motivoDePiezaVieja(ideaId), ahora)
  }

  // 2) el concepto: sacar la idea a `ideas_retiradas` + su entrada de historial, en una sola escritura condicional
  for (let intento = 1; intento <= INTENTOS_DE_ESCRITURA; intento++) {
    const v = intento === 1 ? v0 : await leerVigente(al, p.ctx)
    if (!v.ok) return v.r
    const k = v.banco.findIndex((i) => i.id === ideaId)
    if (k < 0 && !reasignadas.length) return fallo(409, 'E-IDEA-RETIRADA', 'esa idea ya se retiró del banco', { idea_id: ideaId, ...(piezas_viejas ? { piezas_viejas } : {}) })
    if (esperada !== undefined && (k < 0 || v.banco[k].linea !== esperada)) return fallo(409, 'E-IDEA-CAMBIADA', 'la idea cambió desde que se armó la corrección: no se pisa', { idea_id: ideaId, reasignadas })
    const entrada: EntradaDelHistorial = { accion: 'retirar', idea_id: ideaId, version: p.ctx.version, antes: { ...retirada }, despues: null, quien: p.ctx.autor, cuando: ahora, reasignadas, con_brief_sin_tocar, con_brief_reasignadas, ...(piezas_viejas ? { piezas_viejas } : {}) }
    const leido: Record<string, unknown> = { ...v.leido, historial_del_banco: [...v.historial, entrada] }
    let md = v.c.texto_md
    if (k >= 0) {
      const idea = v.banco[k]
      leido.banco = v.banco.filter((_, j) => j !== k)
      leido.ideas_retiradas = [...v.retiradas, { ...idea, retirada_en: ahora, retirada_por: p.ctx.autor }]
      if (md !== null) md = textoConIdea(md, ideaId, null).md
    }
    if (await al.actualizarConceptoSiSello(p.ctx.campana_id, p.ctx.version, v.sello, { leido, texto_md: md })) {
      return { status: 200, cuerpo: { ok: true, version: p.ctx.version, ideas: [retirada], historial: [entrada], reasignadas, con_brief_sin_tocar, con_brief_reasignadas, ...(piezas_viejas ? { piezas_viejas } : {}), ...(k < 0 ? { ya_retirada: true } : {}) } }
    }
  }
  return fallo(409, 'E-CONCURRENTE', 'otra edición del banco se guardó al mismo tiempo y no se pudo retirar la idea: vuelve a abrir la gran idea', { reasignadas })
}
