/**
 * UN ENCARGO FALLIDO QUE YA GASTÓ SE REHACE SOLO CUANDO SU CAUSA YA ESTÁ ARREGLADA (GO de Lenovo 11-nov 16:46 Zúrich · decisión de Emilio 16:43 · respuestas 16:58 · NACE APAGADO).
 * Emilio: «debe salir un mejor output… no se trata de yo mandarlo a corregir». Hoy el reintento (#1027) solo reabre los fallidos SIN gasto; los que gastaron quedaban muertos para siempre.
 *
 * Reparto (regla de Emilio · «juzgar = agente; verificar exacto = código»):
 *   · JUZGA el agente (la mesa de revisión de fallidos de la oficina, la dirige jefe-marketing): con la CAUSA que guardó el fallido (#1045) y los ARREGLOS PUBLICADOS después del fallo,
 *     decide por cada fallido `reabrir · <arreglo>` o `dejar · por qué`. Sin listas ni frases fijas.
 *   · VERIFICA EXACTO el código: que el arreglo citado esté en la lista que se le pasó (por su clave, no por texto) y sea POSTERIOR al fallo; que el fallido siga siendo la última versión
 *     de su pieza, siga `fallido`, no haya agotado sus 3 versiones y su fecha no haya pasado; y que quepa en el tope de la campaña (la MISMA decisión del freno, `decidirTopeDelParte`).
 *   · REABRE por la vía que ya existe (`reabrir_causa_corregida` de la oficina, la de «rehacer»), UNA sola vez por fallido.
 *
 * Guardarraíles (nota de CC7 «lo que miraré», 11-nov):
 *   1. la fuente puede no traer todos los arreglos (un cambio hecho en vivo sin entrega no aparece): por eso «dejar» NUNCA es definitivo; si después se publican arreglos nuevos,
 *      el fallido se vuelve a juzgar (hasta MAX_JUICIOS veces);
 *   2. el arreglo citado se verifica por su clave exacta en la lista de ESA mesa;
 *   3. la anotación en la libreta va ANTES de abrir la mesa (pagar); la mesa es idempotente por su versión (el mismo brief_id), así que dos pasadas a la vez no pagan dos veces;
 *   4. el tope se mira ANTES de pagar (la mesa cuenta como una pieza más, primera en el orden) y otra vez antes de reabrir;
 *   5. apagado = cero lecturas de la fuente y cero llamadas al agente;
 *   6. fuente ilegible o respuesta ilegible: no se reabre y NO cuenta como «dejar»; se reintenta en la próxima pasada, con tope de mesas por fallido.
 *   Fallidos SIN causa guardada (los de antes de #1045): se saltan y quedan anotados «sin causa guardada», sin pagar al agente (respuesta de Lenovo 16:58, punto 2).
 *
 * La libreta vive en `cadena_config.rehacer_fallidos_libreta`. Interruptor: `cadena_config.rehacer_fallidos_corregidos === true` (cualquier otra cosa = apagado).
 */
import type { Almacen, Campana } from './almacen'
import { hoyEnZona } from './campanas'
import { decidirTopeDelParte, type SobreDeProducir } from './autoproducir'

export const INTERRUPTOR_DE_FALLIDOS = 'rehacer_fallidos_corregidos'
export const CLAVE_DE_LA_LIBRETA_DE_FALLIDOS = 'rehacer_fallidos_libreta'
/** veces que el agente puede juzgar un mismo fallido (un «dejar» se vuelve a juzgar si llegan arreglos nuevos) */
export const MAX_JUICIOS = 3
/** mesas abiertas por fallido sin respuesta legible (corte, plazo, texto ilegible): pasado esto, queda agotado y se avisa una vez */
export const MAX_MESAS_POR_FALLIDO = 3
/** tope de versiones por pieza de la oficina (`reapertura.ts`): una pieza en su 3.ª versión no se reabre */
export const MAX_VERSIONES_DE_LA_PIEZA = 3
/** cuánto espera la cadena a la mesa antes de dar el intento por perdido: el plazo de la mesa (30 min) más la holgura */
export const PLAZO_DE_LA_MESA_DE_FALLIDOS_MIN = 60
/** la familia de la mesa en la oficina (su tope sale de su plantilla cuando está activa) */
export const FAMILIA_DE_LA_MESA_DE_FALLIDOS = 'fallidos_mesa'
/** cuánto texto de cada arreglo y de cada causa entra al marco */
const LARGO_DEL_ARREGLO = 1500
const LARGO_DE_LA_CAUSA = 1000
const MAX_ARREGLOS_EN_EL_MARCO = 40

// ───────────────────────── datos

/** un encargo REAL de la oficina de un parte de la campaña, con lo que hace falta para juzgarlo */
export interface EncargoDeLaCampana {
  id: string
  parte_id: string
  brief_id: string | null
  tipo_de_grupo: string
  familia: string | null
  estado: string
  gasto_usd: number
  version_encargo: number
  /** `estado_del_motor.fallo` (#1045) tal como está guardado; ausente en los fallidos de antes */
  fallo: unknown
  /** `sala_ref.fila` · { id, fecha, hora } de la fila del calendario, si la trae */
  fila: unknown
  creado_en: string
}
/** un arreglo publicado (la fuente: las entregas fusionadas a main del repositorio de la plataforma · decisión Lenovo 11-nov 17:15) */
export interface ArregloPublicado { id: string; publicado_en: string; mensaje: string }
export type LecturaDeArreglos = { ok: true; arreglos: ArregloPublicado[] } | { ok: false; motivo: string }

export interface CausaGuardada { motivo: string; en: string }
/** el lector de la causa guardada · formato, no juicio: hace falta un motivo con texto y una fecha legible */
export function causaGuardada(x: unknown): CausaGuardada | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const motivo = typeof o.motivo === 'string' ? o.motivo.trim() : ''
  const en = typeof o.en === 'string' && Number.isFinite(Date.parse(o.en)) ? new Date(Date.parse(o.en)).toISOString() : null
  return motivo && en ? { motivo, en } : null
}
export interface FilaDelEncargo { id: string | null; fecha: string | null; hora: string | null }
export function filaDelEncargo(x: unknown): FilaDelEncargo {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
  const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const fecha = t(o.fecha)
  return { id: t(o.id), fecha: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null, hora: t(o.hora) }
}

// ───────────────────────── libreta

export type EstadoDelFallido = 'pendiente' | 'en_mesa' | 'reabierto' | 'dejado' | 'sin_causa' | 'agotado' | 'ya_no_aplica'
export interface AnotacionDeFallido {
  campana_id: string
  estado: EstadoDelFallido
  /** veredictos legibles recibidos (`reabrir` o `dejar`) */
  juicios: number
  /** mesas abiertas para este fallido (con o sin respuesta legible) */
  mesas: number
  /** la fecha del arreglo más nuevo que el agente ya vio en su último veredicto: un «dejar» solo se vuelve a juzgar con arreglos POSTERIORES */
  visto_hasta: string | null
  /** el arreglo con que se reabrió (su id en la fuente) */
  arreglo_id?: string | null
  motivo: string | null
  actualizado_en: string
}
export type EstadoDeMesa = 'abierta' | 'fallida' | 'cerrada'
export interface MesaDeFallidos {
  version: number
  encargo_id: string | null
  estado: EstadoDeMesa
  abierta_en: string
  /** F1, F2… → id del encargo fallido */
  fallidos: Record<string, string>
  /** A1, A2… → el arreglo que se le mostró */
  arreglos: Record<string, { id: string; publicado_en: string }>
  motivo: string | null
  resumen: string | null
  avisado: boolean
}
export interface LibretaDeFallidos {
  fallidos: Record<string, AnotacionDeFallido>
  campanas: Record<string, { ultima_version: number; mesas: Record<string, MesaDeFallidos> }>
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export async function leerLibretaDeFallidos(al: Pick<Almacen, 'leerConfig'>): Promise<LibretaDeFallidos> {
  const x = await al.leerConfig(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS)
  if (!esObjeto(x)) return { fallidos: {}, campanas: {} }
  const c = structuredClone(x) as Partial<LibretaDeFallidos>
  return { fallidos: esObjeto(c.fallidos) ? c.fallidos : {}, campanas: esObjeto(c.campanas) ? c.campanas : {} }
}
export const fallidosEncendido = async (al: Pick<Almacen, 'leerConfig'>): Promise<boolean> => (await al.leerConfig(INTERRUPTOR_DE_FALLIDOS)) === true
const masMin = (iso: string, m: number): string => new Date(Date.parse(iso) + m * 60_000).toISOString()

// ───────────────────────── quién se puede juzgar (exacto)

/** la llave de una pieza de la oficina: sus versiones comparten parte, brief y tipo */
const llaveDePieza = (e: Pick<EncargoDeLaCampana, 'parte_id' | 'brief_id' | 'tipo_de_grupo'>): string => `${e.parte_id}|${e.brief_id ?? ''}|${e.tipo_de_grupo}`
/** ¿es el encargo la versión más nueva de su pieza? */
export function esLaUltimaVersion(e: EncargoDeLaCampana, todos: EncargoDeLaCampana[]): boolean {
  const k = llaveDePieza(e)
  return !todos.some((o) => o.id !== e.id && llaveDePieza(o) === k && o.version_encargo > e.version_encargo)
}
export type MotivoDeNoAplica = 'no_es_fallido' | 'no_gasto' | 'hay_version_mas_nueva' | 'agoto_sus_versiones' | 'su_fecha_paso' | 'la_campana_termino' | 'sin_brief'
/**
 * El filtro EXACTO de un fallido que podría rehacerse. Devuelve null si aplica, o el motivo por el que no.
 * La fecha: la de su fila del calendario (en la zona del cliente); si la fila no trae fecha, vale mientras la campaña no haya terminado.
 */
export function porQueNoAplica(e: EncargoDeLaCampana, todos: EncargoDeLaCampana[], hoy: string, finDeLaCampana: string): MotivoDeNoAplica | null {
  if (e.estado !== 'fallido') return 'no_es_fallido'
  if (!(Number(e.gasto_usd) > 0)) return 'no_gasto'
  if (!e.brief_id) return 'sin_brief'
  if (!esLaUltimaVersion(e, todos)) return 'hay_version_mas_nueva'
  if (e.version_encargo >= MAX_VERSIONES_DE_LA_PIEZA) return 'agoto_sus_versiones'
  const f = filaDelEncargo(e.fila)
  if (f.fecha) { if (f.fecha < hoy) return 'su_fecha_paso' }
  else if (finDeLaCampana < hoy) return 'la_campana_termino'
  return null
}
/** los arreglos que el agente todavía no vio para este fallido: publicados DESPUÉS del fallo y después de lo que ya vio en su último veredicto */
export function arreglosNuevosPara(causa: CausaGuardada, a: AnotacionDeFallido | undefined, arreglos: ArregloPublicado[]): ArregloPublicado[] {
  const desde = a?.visto_hasta && a.visto_hasta > causa.en ? a.visto_hasta : causa.en
  return arreglos.filter((x) => x.publicado_en > desde)
}

// ───────────────────────── el marco y el lector (formato, no juicio)

const recorta = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n)} […recortado]` : t)
const unaLinea = (t: string): string => t.replace(/\s+/g, ' ').trim()

export interface FallidoEnLaMesa { clave: string; encargo: EncargoDeLaCampana; causa: CausaGuardada }
export function marcoDeFallidos(cliente: string, fallidos: FallidoEnLaMesa[], arreglos: Array<{ clave: string; a: ArregloPublicado }>): string {
  const filas = fallidos.map(({ clave, encargo: e, causa }) => {
    const f = filaDelEncargo(e.fila)
    const cuando = f.fecha ? `${f.fecha}${f.hora ? ` ${f.hora}` : ''}` : 'sin fecha en el calendario'
    return `- ${clave} · pieza ${e.brief_id} (${e.familia ?? e.tipo_de_grupo}, versión ${e.version_encargo}) · sale ${cuando} · falló el ${causa.en} después de gastar US$ ${Number(e.gasto_usd).toFixed(2)}\n  Causa guardada: «${recorta(unaLinea(causa.motivo), LARGO_DE_LA_CAUSA)}»`
  })
  const lista = arreglos.map(({ clave, a }) => `- ${clave} · publicado ${a.publicado_en}\n${recorta(a.mensaje.trim(), LARGO_DEL_ARREGLO).split(/\r?\n/).map((l) => `  ${l}`).join('\n')}`)
  return [
    `# Piezas de ${cliente} que fallaron después de gastar`,
    'Cada pieza de abajo falló y guardó su causa. Debajo están los cambios que se publicaron en la plataforma DESPUÉS de esos fallos.',
    'Decide, pieza por pieza, si alguno de esos cambios corrige la causa de su fallo. Si la corrige, la pieza se rehace una sola vez; si no, queda como está hasta que se publique otro cambio.',
    'Juzga por lo que dice la causa y lo que hace cada cambio. No hay respuesta por defecto: un cambio de otra parte del sistema no corrige esta causa aunque se parezca en palabras.',
    '',
    '## Las piezas',
    ...filas,
    '',
    '## Los cambios publicados después de los fallos',
    ...(lista.length ? lista : ['(ninguno)']),
    '',
    '## Cómo responder',
    'Una línea por pieza, con su clave:',
    '<F…> · reabrir · <A…> · por qué ese cambio corrige esta causa',
    '<F…> · dejar · por qué ninguno de estos cambios la corrige',
    'El código verifica después que el cambio que nombras esté en esta lista y sea posterior al fallo de esa pieza, que la pieza siga sin rehacerse, que su fecha no haya pasado y que quepa en el tope de la campaña. Lo que no cumpla no se rehace.',
  ].join('\n')
}

export type VeredictoDeFallido = { clave: string; accion: 'reabrir'; arreglo: string; razon: string } | { clave: string; accion: 'dejar'; razon: string }
/**
 * Lee la respuesta: `F1 · reabrir · A2 · razón` o `F1 · dejar · razón`. Viñeta opcional; la clave, la acción y el arreglo pueden venir entre `comillas` o en **negrita**.
 * Una línea sin esa forma no es un veredicto. Si una pieza aparece dos veces, vale la primera.
 */
export function leerVeredictos(texto: string | null | undefined): VeredictoDeFallido[] {
  const out: VeredictoDeFallido[] = []
  const vistas = new Set<string>()
  const limpio = (x: string) => x.replace(/^[`*_]+|[`*_]+$/g, '').trim()
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const m = /^\s*(?:[-*•+]|\d{1,3}[.)])?\s*(.+)$/.exec(linea)
    if (!m) continue
    const partes = m[1].split(/\s+·\s+/).map((x) => x.trim())
    if (partes.length < 3) continue
    const clave = limpio(partes[0]).toUpperCase()
    const accion = limpio(partes[1]).toLowerCase()
    if (!/^F\d{1,3}$/.test(clave) || vistas.has(clave)) continue
    let v: VeredictoDeFallido | null = null
    if (accion === 'reabrir' && partes.length >= 4 && /^A\d{1,3}$/i.test(limpio(partes[2]))) v = { clave, accion, arreglo: limpio(partes[2]).toUpperCase(), razon: partes.slice(3).join(' · ').trim() }
    else if (accion === 'dejar') v = { clave, accion, razon: partes.slice(2).join(' · ').trim() }
    if (!v) continue
    vistas.add(clave)
    out.push(v)
  }
  return out
}
/** la causa corregida que viaja a la oficina (`reabrir_causa_corregida`, 1 a 300 caracteres) */
export function causaCorregida(a: ArregloPublicado | { id: string; publicado_en: string; mensaje?: string }, razon: string): string {
  const titulo = unaLinea(String(a.mensaje ?? '').split(/\r?\n/)[0] ?? '') || a.id
  return unaLinea(`Causa corregida por «${titulo}» (publicado ${a.publicado_en.slice(0, 16)}Z): ${razon || 'sin razón escrita'}`).slice(0, 300)
}

// ───────────────────────── el tope (la MISMA decisión del freno)

/** un sobre «de mentira» con lo que el freno necesita de una pieza: su brief, su familia y su fecha */
const sobreDelTope = (parte_id: string, brief_id: string, familia: string | null, fecha: string | null, hora: string | null, client_id: string): SobreDeProducir => ({
  source: 'brief/parte-listo', intent: 'producir', idempotency_key: `${parte_id}:${brief_id}:rehacer`, logical_period: `parte:${parte_id}`, tenant_id: client_id, client_id,
  payload: { parte_id, brief_id, dry_run: false, ...(familia ? { familia } : {}), ...(fecha ? { fecha } : {}), ...(hora ? { hora } : {}) },
})
/**
 * ¿Qué fallidos caben en el tope de la campaña? La mesa cuenta PRIMERO (es lo que se paga ya); después cada fallido con el tope de su familia, en el orden del calendario y guardando
 * el lugar de lo que viene, igual que el freno. Lanza si el gasto o el calendario no se pueden leer (un error no es «cabe»).
 */
export async function caben(al: Pick<Almacen, 'leerGastoDeCampana' | 'formatos' | 'configDeLaOficina' | 'filas' | 'ultimaVersionDeCalendario'>, c: Campana, fallidos: EncargoDeLaCampana[], conMesa: boolean, ahora: string): Promise<{ mesa: boolean; sueltan: Set<string> }> {
  const v = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
  const filas = await al.filas(c.id, v)
  const cuando = new Map(filas.map((f) => [f.id, { fecha: f.fecha, hora: f.hora ?? null }]))
  const sueltan = new Set<string>()
  const enCamino: Array<{ parte_id: string; brief_id: string; familia: string | null }> = []
  let mesa = !conMesa
  const hoy = hoyEnZona(ahora, c.zona_horaria)
  if (conMesa) {
    // la mesa es un encargo de la campaña (parte = la campaña): va antes que cualquier fila, con la fecha de hoy
    const d = await decidirTopeDelParte(al, c, c.id, [sobreDelTope(c.id, 'fal-mesa', FAMILIA_DE_LA_MESA_DE_FALLIDOS, hoy, '00:00', c.client_id)], filas, cuando, { ahora: new Date(ahora) })
    mesa = d.tipo === 'cabe'
    if (!mesa) return { mesa, sueltan }
    enCamino.push({ parte_id: c.id, brief_id: 'fal-mesa', familia: FAMILIA_DE_LA_MESA_DE_FALLIDOS })
  }
  const porParte = new Map<string, EncargoDeLaCampana[]>()
  for (const e of fallidos) porParte.set(e.parte_id, [...(porParte.get(e.parte_id) ?? []), e])
  for (const [parte, es] of porParte) {
    const sobres = es.map((e) => { const f = filaDelEncargo(e.fila); return sobreDelTope(parte, e.brief_id as string, e.familia, f.fecha, f.hora, c.client_id) })
    const d = await decidirTopeDelParte(al, c, parte, sobres, filas, cuando, { cuestan: new Set(es.map((e) => e.brief_id as string)), enCamino, ahora: new Date(ahora) })
    const s = new Set(d.tipo === 'cabe' || d.tipo === 'corta' ? d.sueltan : [])
    for (const e of es) if (s.has(e.brief_id as string)) { sueltan.add(e.id); enCamino.push({ parte_id: parte, brief_id: e.brief_id as string, familia: e.familia }) }
  }
  return { mesa, sueltan }
}

// ───────────────────────── el reloj: abre la mesa

export interface SobreDeFallidos { tipo_de_mesa: 'fallidos'; client_id: string; campana_id: string; version: number; dry_run: boolean; marco_texto: string; condiciones: string[] }
export type ResultadoDeAbrirMesaDeFallidos = { estado: 'abierta'; encargo_id: string } | { estado: 'no_abre' | 'error'; motivo: string }

const anotacion = (campana_id: string, ahora: string, previa?: AnotacionDeFallido): AnotacionDeFallido =>
  previa ?? { campana_id, estado: 'pendiente', juicios: 0, mesas: 0, visto_hasta: null, motivo: null, actualizado_en: ahora }

/** el reloj: por cada campaña activa (no de ensayo), abre UNA mesa con los fallidos que se pueden juzgar. Nunca lanza hacia el reloj por una campaña. */
export async function abrirRevisionesDeFallidos(al: Almacen, ahora: string): Promise<{ aplicado: string[]; lineas: Array<{ campana_id: string; texto: string }> }> {
  const aplicado: string[] = []
  const lineas: Array<{ campana_id: string; texto: string }> = []
  if (!(await fallidosEncendido(al))) return { aplicado, lineas }
  if (!al.encargosDeLaCampana || !al.arreglosPublicados || !al.abrirMesaDeFallidos) {
    lineas.push({ campana_id: 'sistema', texto: 'fallidos: la cadena no puede revisar fallidos en este entorno (faltan sus puertos).' })
    return { aplicado, lineas }
  }
  const libreta = await leerLibretaDeFallidos(al)
  let cambio = false
  let fuente: LecturaDeArreglos | null = null
  for (const c of await al.campanasActivas()) {
    if (c.seco === true) continue
    try {
      const lc = libreta.campanas[c.id] ?? { ultima_version: 0, mesas: {} }
      const vence = (m: MesaDeFallidos) => Date.parse(ahora) > Date.parse(masMin(m.abierta_en, PLAZO_DE_LA_MESA_DE_FALLIDOS_MIN))
      // una mesa abierta y en plazo: se espera · una vencida: se da por perdida y sus fallidos vuelven a pendiente
      const abiertas = Object.values(lc.mesas).filter((m) => m.estado === 'abierta')
      if (abiertas.some((m) => !vence(m))) continue
      for (const m of abiertas) {
        lc.mesas[String(m.version)] = { ...m, estado: 'fallida', motivo: 'la mesa no devolvió un veredicto a tiempo' }
        for (const id of Object.values(m.fallidos)) { const a = libreta.fallidos[id]; if (a?.estado === 'en_mesa') libreta.fallidos[id] = { ...a, estado: 'pendiente', motivo: 'la mesa no devolvió un veredicto a tiempo', actualizado_en: ahora } }
        libreta.campanas[c.id] = lc
        cambio = true
      }
      const todos = await al.encargosDeLaCampana(c.id)
      const hoy = hoyEnZona(ahora, c.zona_horaria)
      const candidatos: Array<{ e: EncargoDeLaCampana; causa: CausaGuardada }> = []
      for (const e of todos) {
        if (e.estado !== 'fallido' || !(Number(e.gasto_usd) > 0)) continue
        const previa = libreta.fallidos[e.id]
        if (previa && (previa.estado === 'reabierto' || previa.estado === 'agotado' || previa.estado === 'ya_no_aplica' || previa.estado === 'sin_causa' || previa.estado === 'en_mesa')) continue
        const no = porQueNoAplica(e, todos, hoy, c.fecha_fin)
        if (no) {
          // solo se anota lo que ya se había empezado a mirar (un fallido viejo que nunca aplicó no llena la libreta)
          if (previa) { libreta.fallidos[e.id] = { ...previa, estado: 'ya_no_aplica', motivo: no, actualizado_en: ahora }; cambio = true }
          continue
        }
        const causa = causaGuardada(e.fallo)
        if (!causa) {
          libreta.fallidos[e.id] = { ...anotacion(c.id, ahora, previa), estado: 'sin_causa', motivo: 'sin causa guardada (falló antes de que la oficina guardara la causa): no se juzga', actualizado_en: ahora }
          cambio = true
          lineas.push({ campana_id: c.id, texto: `fallidos: la pieza ${e.brief_id} falló después de gastar US$ ${Number(e.gasto_usd).toFixed(2)} y no guardó su causa; no se rehace sola.` })
          continue
        }
        if (previa && previa.mesas >= MAX_MESAS_POR_FALLIDO) {
          libreta.fallidos[e.id] = { ...previa, estado: 'agotado', motivo: `${previa.mesas} mesas sin un veredicto legible`, actualizado_en: ahora }
          cambio = true
          lineas.push({ campana_id: c.id, texto: `fallidos: la pieza ${e.brief_id} quedó sin veredicto tras ${previa.mesas} mesas (${previa.motivo ?? 'sin respuesta legible'}); no se reintenta sola.` })
          continue
        }
        if (previa && previa.juicios >= MAX_JUICIOS) {
          libreta.fallidos[e.id] = { ...previa, estado: 'agotado', motivo: `${previa.juicios} veredictos y ninguno la rehízo`, actualizado_en: ahora }
          cambio = true
          continue
        }
        candidatos.push({ e, causa })
      }
      if (!candidatos.length) continue
      // la fuente se lee UNA vez por pasada, y solo si hay a quién juzgar
      if (!fuente) {
        const desde = candidatos.map((x) => x.causa.en).sort()[0]!
        fuente = await al.arreglosPublicados(desde)
      }
      if (!fuente.ok) { lineas.push({ campana_id: 'sistema', texto: `fallidos: no se pudo leer la lista de arreglos publicados (${fuente.motivo.slice(0, 160)}); se reintenta en la próxima pasada.` }); continue }
      const arreglos = [...fuente.arreglos].sort((a, b) => (a.publicado_en < b.publicado_en ? -1 : 1))
      const conNuevos = candidatos.filter((x) => arreglosNuevosPara(x.causa, libreta.fallidos[x.e.id], arreglos).length > 0)
      if (!conNuevos.length) continue
      // el tope ANTES de pagar: la mesa primero, después los fallidos en el orden del calendario
      const t = await caben(al, c, conNuevos.map((x) => x.e), true, ahora)
      if (!t.mesa) { lineas.push({ campana_id: c.id, texto: `fallidos: hay ${conNuevos.length} pieza(s) fallida(s) para revisar, pero la mesa no cabe en el tope de la campaña; no se abre.` }); continue }
      const entran = conNuevos.filter((x) => t.sueltan.has(x.e.id))
      if (!entran.length) { lineas.push({ campana_id: c.id, texto: `fallidos: hay ${conNuevos.length} pieza(s) fallida(s) para revisar, pero ninguna cabe en el tope de la campaña si se rehace; no se abre la mesa.` }); continue }
      const vistos = new Set<string>()
      const mostrados: ArregloPublicado[] = []
      for (const x of entran) for (const a of arreglosNuevosPara(x.causa, libreta.fallidos[x.e.id], arreglos)) if (!vistos.has(a.id)) { vistos.add(a.id); mostrados.push(a) }
      const enElMarco = mostrados.slice(-MAX_ARREGLOS_EN_EL_MARCO)
      const claves = enElMarco.map((a, i) => ({ clave: `A${i + 1}`, a }))
      const enMesa = entran.map((x, i) => ({ clave: `F${i + 1}`, encargo: x.e, causa: x.causa }))
      const ctx = await al.cargarContexto(c.client_id, c.plan_id)
      const v = lc.ultima_version + 1
      const mesa: MesaDeFallidos = {
        version: v, encargo_id: null, estado: 'abierta', abierta_en: ahora, motivo: null, resumen: null, avisado: false,
        fallidos: Object.fromEntries(enMesa.map((x) => [x.clave, x.encargo.id])),
        arreglos: Object.fromEntries(claves.map((x) => [x.clave, { id: x.a.id, publicado_en: x.a.publicado_en }])),
      }
      // 🟡 CC7 punto 3 · la anotación va ANTES de pagar: la libreta queda con la mesa y sus fallidos «en mesa»; la mesa es idempotente por su versión
      lc.ultima_version = v
      lc.mesas[String(v)] = mesa
      libreta.campanas[c.id] = lc
      for (const x of enMesa) { const p = anotacion(c.id, ahora, libreta.fallidos[x.encargo.id]); libreta.fallidos[x.encargo.id] = { ...p, estado: 'en_mesa', mesas: p.mesas + 1, actualizado_en: ahora } }
      await al.escribirConfig(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS, libreta)
      cambio = false
      const r = await al.abrirMesaDeFallidos({ tipo_de_mesa: 'fallidos', client_id: c.client_id, campana_id: c.id, version: v, dry_run: false, marco_texto: marcoDeFallidos(ctx?.nombreDelNegocio || 'el cliente', enMesa, claves), condiciones: [] })
      if (r.estado === 'abierta') {
        lc.mesas[String(v)] = { ...mesa, encargo_id: r.encargo_id }
        aplicado.push(`fallidos: mesa abierta en ${c.id} (${enMesa.length} pieza(s), ${claves.length} arreglo(s))`)
      } else {
        lc.mesas[String(v)] = { ...mesa, estado: 'fallida', motivo: `la mesa no abrió: ${r.motivo}` }
        for (const x of enMesa) { const a = libreta.fallidos[x.encargo.id]!; libreta.fallidos[x.encargo.id] = { ...a, estado: 'pendiente', motivo: `la mesa no abrió: ${r.motivo}`.slice(0, 300), actualizado_en: ahora } }
        aplicado.push(`fallidos: la mesa no abrió en ${c.id}: ${r.motivo}`)
      }
      libreta.campanas[c.id] = lc
      cambio = true
    } catch (e) {
      lineas.push({ campana_id: c.id, texto: `fallidos: no se pudo revisar la campaña (${String((e as Error)?.message ?? e).slice(0, 160)})` })
    }
  }
  if (cambio) await al.escribirConfig(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS, libreta)
  return { aplicado, lineas }
}

// ───────────────────────── la vuelta de la mesa

export interface EntregaDeFallidos { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }

/**
 * La vuelta de la mesa (puerto de la cadena, en proceso). Idempotente: solo la entrega de una mesa ABIERTA aplica; cualquier otra contesta `ya_cerrada`.
 * Cada veredicto se verifica por código antes de reabrir; lo ilegible no cuenta como «dejar».
 */
export async function recibirFallidos(al: Almacen, p: EntregaDeFallidos, ahora: string): Promise<{ ok: true; estado?: string; ya_cerrada?: boolean } | { ok: false; error: string }> {
  const libreta = await leerLibretaDeFallidos(al)
  const lc = libreta.campanas[p.campana_id]
  const m = lc?.mesas[String(p.version)]
  if (!lc || !m) return { ok: false, error: `la cadena no tiene una mesa de fallidos con la versión ${p.version} en esa campaña` }
  if (m.estado !== 'abierta') return { ok: true, ya_cerrada: true, estado: m.estado }
  const aPendiente = (motivo: string) => {
    for (const id of Object.values(m.fallidos)) { const a = libreta.fallidos[id]; if (a?.estado === 'en_mesa') libreta.fallidos[id] = { ...a, estado: 'pendiente', motivo: motivo.slice(0, 300), actualizado_en: ahora } }
  }
  const cerrar = async (estado: EstadoDeMesa, cambios: Partial<MesaDeFallidos>) => { lc.mesas[String(p.version)] = { ...m, ...cambios, estado }; await al.escribirConfig(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS, libreta) }
  if (!p.texto || !p.texto.trim()) { aPendiente(p.motivo ?? 'la mesa no produjo un veredicto'); await cerrar('fallida', { motivo: p.motivo ?? 'la mesa no produjo un veredicto' }); return { ok: true, estado: 'fallida' } }
  const leidos = leerVeredictos(p.texto).filter((v) => m.fallidos[v.clave])
  // 🟡 CC7 punto 6 · «no pude leer» NUNCA equivale a «dejar»: sin un veredicto legible sobre una pieza de ESTA mesa, todo vuelve a pendiente
  if (!leidos.length) {
    const motivo = 'el agente respondió pero no se pudo leer ningún veredicto sobre las piezas de esta mesa (no se rehízo nada)'
    aPendiente(motivo)
    await cerrar('fallida', { motivo, resumen: `fallidos: ${motivo}; la mesa se vuelve a intentar sola hasta el tope.`, avisado: false })
    return { ok: true, estado: 'fallida' }
  }
  const c = await al.campana(p.campana_id)
  if (!c) { aPendiente('la campaña ya no existe'); await cerrar('cerrada', { motivo: 'la campaña ya no existe' }); return { ok: true, estado: 'cerrada' } }
  // el estado de HOY de los encargos (pudo cambiar mientras la mesa juzgaba)
  const todos = al.encargosDeLaCampana ? await al.encargosDeLaCampana(c.id) : []
  const porId = new Map(todos.map((e) => [e.id, e]))
  const hoy = hoyEnZona(ahora, c.zona_horaria)
  // los textos de los arreglos de ESTA mesa (para nombrarlos en la causa corregida): desde un instante antes del más viejo; si la fuente falla, se nombra por su id
  const masViejo = Object.values(m.arreglos).map((a) => a.publicado_en).sort()[0]
  const fuente = al.arreglosPublicados && masViejo ? await al.arreglosPublicados(new Date(Date.parse(masViejo) - 1).toISOString()) : { ok: false as const, motivo: 'sin fuente' }
  const mensajes = new Map(fuente.ok ? fuente.arreglos.map((a) => [a.id, a.mensaje]) : [])
  const ultimoVisto = Object.values(m.arreglos).map((a) => a.publicado_en).sort().pop() ?? null
  const reabrir: Array<{ v: Extract<VeredictoDeFallido, { accion: 'reabrir' }>; e: EncargoDeLaCampana; arreglo: { id: string; publicado_en: string } }> = []
  const hechos = { reabiertas: 0, dejadas: 0, rechazadas: 0, sin_veredicto: 0, ya_no_aplica: 0, no_caben: 0 }
  const leidosPorClave = new Map(leidos.map((v) => [v.clave, v]))
  for (const [clave, id] of Object.entries(m.fallidos)) {
    const a = libreta.fallidos[id] ?? anotacion(c.id, ahora)
    const v = leidosPorClave.get(clave)
    if (!v) { libreta.fallidos[id] = { ...a, estado: 'pendiente', motivo: 'el agente no dio un veredicto sobre esta pieza', actualizado_en: ahora }; hechos.sin_veredicto++; continue }
    const e = porId.get(id)
    const causa = e ? causaGuardada(e.fallo) : null
    const no = e ? porQueNoAplica(e, todos, hoy, c.fecha_fin) : 'no_es_fallido'
    if (!e || no || !causa) { libreta.fallidos[id] = { ...a, estado: 'ya_no_aplica', juicios: a.juicios + 1, motivo: no ?? 'sin causa guardada', actualizado_en: ahora }; hechos.ya_no_aplica++; continue }
    if (v.accion === 'dejar') {
      const agotado = a.juicios + 1 >= MAX_JUICIOS
      libreta.fallidos[id] = { ...a, estado: agotado ? 'agotado' : 'dejado', juicios: a.juicios + 1, visto_hasta: ultimoVisto, motivo: (v.razon || 'sin razón escrita').slice(0, 300), actualizado_en: ahora }
      hechos.dejadas++
      continue
    }
    // 🟡 CC7 punto 2 · el arreglo citado tiene que estar en la lista de ESTA mesa y ser posterior al fallo de ESTA pieza
    const arreglo = m.arreglos[v.arreglo]
    if (!arreglo || !(arreglo.publicado_en > causa.en)) {
      const motivo = !arreglo ? `el agente citó ${v.arreglo}, que no está en la lista que se le pasó` : `el agente citó ${v.arreglo}, publicado antes del fallo`
      libreta.fallidos[id] = { ...a, estado: a.juicios + 1 >= MAX_JUICIOS ? 'agotado' : 'pendiente', juicios: a.juicios + 1, motivo, actualizado_en: ahora }
      hechos.rechazadas++
      continue
    }
    reabrir.push({ v, e, arreglo })
  }
  // el tope OTRA VEZ antes de reabrir (pudo cambiar mientras la mesa juzgaba): sin la mesa, que ya se pagó
  const t = reabrir.length ? await caben(al, c, reabrir.map((x) => x.e), false, ahora) : { mesa: true, sueltan: new Set<string>() }
  for (const { v, e, arreglo } of reabrir) {
    const a = libreta.fallidos[e.id] ?? anotacion(c.id, ahora)
    if (!t.sueltan.has(e.id)) { libreta.fallidos[e.id] = { ...a, estado: 'pendiente', juicios: a.juicios + 1, motivo: 'el agente la rehacía, pero no cabe en el tope de la campaña', actualizado_en: ahora }; hechos.no_caben++; continue }
    const causa = causaCorregida({ ...arreglo, mensaje: mensajes.get(arreglo.id) ?? '' }, v.razon)
    // la vía que ya existe (`reabrir_causa_corregida`): abre la versión siguiente; la oficina no reabre una pieza viva, entregada o con sus versiones agotadas
    const r = al.reabrirFallido ? await al.reabrirFallido({ encargo_id: e.id, causa }) : { ok: false as const, motivo: 'la cadena no puede reabrir en este entorno' }
    if (r.ok) { libreta.fallidos[e.id] = { ...a, estado: 'reabierto', juicios: a.juicios + 1, arreglo_id: arreglo.id, visto_hasta: ultimoVisto, motivo: causa, actualizado_en: ahora }; hechos.reabiertas++ }
    else { libreta.fallidos[e.id] = { ...a, estado: 'pendiente', juicios: a.juicios + 1, motivo: `no se pudo reabrir: ${r.motivo}`.slice(0, 300), actualizado_en: ahora }; hechos.rechazadas++ }
  }
  const total = Object.keys(m.fallidos).length
  const resumen = `fallidos: la mesa revisó ${total} pieza(s) que fallaron después de gastar: ${hechos.reabiertas} se rehace(n) porque su causa ya se corrigió, ${hechos.dejadas} se deja(n) como están`
    + `${hechos.rechazadas ? ` · ${hechos.rechazadas} no se rehízo porque el veredicto no cumplía` : ''}${hechos.no_caben ? ` · ${hechos.no_caben} no cabe(n) en el tope` : ''}${hechos.ya_no_aplica ? ` · ${hechos.ya_no_aplica} ya no aplicaba(n)` : ''}${hechos.sin_veredicto ? ` · ${hechos.sin_veredicto} sin veredicto (se vuelve(n) a revisar)` : ''}`
  await cerrar('cerrada', { resumen, motivo: null, avisado: false })
  return { ok: true, estado: 'cerrada' }
}

/** el resumen de cada mesa cerrada (o caída por respuesta ilegible), UNA vez · `marcar` = el reloj de verdad envía */
export async function avisosDeFallidos(al: Almacen, marcar: boolean): Promise<Array<{ campana_id: string; texto: string }>> {
  if (!(await fallidosEncendido(al))) return []
  const libreta = await leerLibretaDeFallidos(al)
  const out: Array<{ campana_id: string; texto: string }> = []
  for (const [campana_id, lc] of Object.entries(libreta.campanas)) {
    for (const m of Object.values(lc.mesas)) {
      if (m.avisado || !m.resumen) continue
      out.push({ campana_id, texto: m.resumen })
      m.avisado = true
    }
  }
  if (out.length && marcar) await al.escribirConfig(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS, libreta)
  return out
}
