/**
 * 17-nov · EL PUERTO «BANCO» DEL RECEPTOR DE CORRECCIONES (asignado por Lenovo · `RESPUESTA-LENOVO-a-CC3-CC1-receptor-de-correcciones` · contrato de CC3 en su PROPUESTA).
 * Firma de Emilio (cambio 4): la jefatura DEVUELVE la corrección al creador; el creador la toma entera, a medias o no la toma, con motivo. Sin persona en el medio.
 * Lo que la jefatura marca como REGLA DURA firmada (D1 · oferta cerrada o que aún no existe en su fecha · D2 · dato vencido o aún no vigente · D3 · precios) se toma sí o sí.
 *
 *  · El creador de una idea del banco es la MESA DE LA GRAN IDEA: decide en su mesa chica («corrección del banco», E2) y entrega un bloque JSON que lee `leerRespuestaDelBanco`.
 *  · `verificarRespuestaDelBanco`: el CÓDIGO verifica antes de escribir: la idea sigue igual (`idea_sello` = su `linea` al armar la corrección), los campos son editables y no vacíos,
 *    la explicación está donde es obligatoria, y una regla dura no se rechaza. Lo que no cumple NO se escribe y vuelve como `no_dicha` (nunca se inventa una decisión).
 *  · `aplicarCorreccionDelBanco`: escribe el banco con el MISMO núcleo del tablero (`editarEnElBanco` / `retirarDelBanco`: historial, sello del concepto, reasignación de filas sin brief).
 *    Es la ÚNICA otra puerta al banco además del tablero; quién la llama y con qué autorización lo decide la ruta (E2). Aquí no hay red ni modelo: US$ 0.
 *  · La idempotencia por `correccion_id` y lo que se rehace después (briefs de las filas) son del receptor de CC3.
 */
import type { Almacen } from './almacen'
import { CAMPOS_EDITABLES, editarEnElBanco, leerCambios, retirarDelBanco, type CampoEditable, type Reasignada } from './banco-de-ideas'
import { avisoDeLaVuelta } from './correcciones'
import type { IdeaDelBanco } from './conceptos'

/** las reglas duras firmadas que alcanzan a una idea del banco (hechos de la oferta, cambio 4): con ellas `no_tomada` no vale */
export const REGLAS_DURAS_DEL_BANCO = ['D1', 'D2', 'D3'] as const
export const LARGO_MAXIMO_DE_EXPLICACION = 600
export const IDEA_CAMBIADA = 'la idea ya cambió; corrección vieja'
export const IDEA_FUERA_DEL_BANCO = 'la idea ya no está en el banco'
export const quienCorrige = (correccionId: string): string => `mesa de la gran idea (corrección ${correccionId})`

/** lo que entrega el receptor de CC3: una corrección por llamada */
export interface CorreccionAlBanco {
  correccion_id: string
  campana_id: string
  idea_id: string
  /** la `linea` de la idea tal como estaba al armar la corrección: si cambió, la corrección es vieja */
  idea_sello: string
  filas_afectadas: string[]
  motivo: string
  linea_de_la_ficha: string | null
  regla: string | null
}

export type RespuestaDelBanco =
  | { respuesta: 'tomada'; explicacion: string | null; accion: 'editar'; cambios: Partial<Record<CampoEditable, string>> }
  | { respuesta: 'tomada'; explicacion: string | null; accion: 'retirar'; reasignadas?: Reasignada[] }
  | { respuesta: 'tomada_en_parte'; explicacion: string; accion: 'editar' | 'retirar'; cambios?: Partial<Record<CampoEditable, string>>; reasignadas?: Reasignada[] }
  | { respuesta: 'no_tomada'; explicacion: string }
  | { respuesta: 'no_dicha'; motivo?: string }

const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const noDicha = (motivo: string): RespuestaDelBanco => ({ respuesta: 'no_dicha', motivo })
export const esReglaDura = (regla: string | null | undefined): boolean => !!regla && (REGLAS_DURAS_DEL_BANCO as readonly string[]).includes(regla.trim().toUpperCase())

/** el ÚLTIMO bloque JSON del texto de la mesa (```json … ``` o un objeto suelto al final); lo que no se lee es `no_dicha`, nunca una decisión inventada */
export function leerRespuestaDelBanco(salida: string | null | undefined): RespuestaDelBanco {
  const t = salida ?? ''
  const bloques = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  const crudo = bloques.length ? bloques[bloques.length - 1] : t.indexOf('{') >= 0 && t.lastIndexOf('}') > t.indexOf('{') ? t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1) : ''
  let o: Record<string, unknown> | null = null
  try { const v = JSON.parse(crudo.trim()); o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null } catch { o = null }
  if (!o) return noDicha('la mesa no dejó su respuesta en un bloque JSON legible')
  const respuesta = texto(o.respuesta)
  const explicacion = texto(o.explicacion)
  if (respuesta === 'no_tomada') return explicacion ? { respuesta, explicacion } : noDicha('«no_tomada» sin explicación')
  if (respuesta !== 'tomada' && respuesta !== 'tomada_en_parte') return noDicha(`respuesta desconocida: «${String(o.respuesta ?? '')}»`)
  const accion = texto(o.accion)
  if (accion !== 'editar' && accion !== 'retirar') return noDicha(`acción desconocida: «${String(o.accion ?? '')}»`)
  if (respuesta === 'tomada_en_parte' && !explicacion) return noDicha('«tomada_en_parte» sin explicación')
  if (accion === 'retirar') return respuesta === 'tomada' ? { respuesta, explicacion, accion } : { respuesta, explicacion: explicacion!, accion }
  const c = o.cambios && typeof o.cambios === 'object' && !Array.isArray(o.cambios) ? (o.cambios as Record<string, unknown>) : null
  if (!c) return noDicha('«editar» sin cambios')
  const cambios: Partial<Record<CampoEditable, string>> = {}
  for (const [k, v] of Object.entries(c)) cambios[k as CampoEditable] = typeof v === 'string' ? v : String(v ?? '')
  return respuesta === 'tomada' ? { respuesta, explicacion, accion, cambios } : { respuesta, explicacion: explicacion!, accion, cambios }
}

/** el código decide si la respuesta se puede escribir; si no, la baja a `no_tomada` (idea vieja o fuera del banco) o `no_dicha` (respuesta inválida), sin escribir nada */
export function verificarRespuestaDelBanco(c: CorreccionAlBanco, idea: IdeaDelBanco | null, r: RespuestaDelBanco): RespuestaDelBanco {
  if (!idea) return { respuesta: 'no_tomada', explicacion: IDEA_FUERA_DEL_BANCO }
  if (idea.linea !== c.idea_sello) return { respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA }
  if (r.respuesta === 'no_dicha') return r
  if (r.respuesta === 'no_tomada') {
    if (esReglaDura(c.regla)) return noDicha(`la corrección cita la regla dura ${c.regla}: se toma sí o sí (firma de Emilio); la mesa la rechazó («${r.explicacion.slice(0, 200)}»)`)
    return { respuesta: 'no_tomada', explicacion: r.explicacion.slice(0, LARGO_MAXIMO_DE_EXPLICACION) }
  }
  if (r.respuesta === 'tomada_en_parte' && !texto(r.explicacion)) return noDicha('«tomada_en_parte» sin explicación')
  const explicacion = r.explicacion ? r.explicacion.slice(0, LARGO_MAXIMO_DE_EXPLICACION) : null
  if (r.accion === 'retirar') return r.respuesta === 'tomada' ? { respuesta: 'tomada', explicacion, accion: 'retirar' } : { respuesta: 'tomada_en_parte', explicacion: explicacion!, accion: 'retirar' }
  const lc = leerCambios([{ idea_id: c.idea_id, campos: r.cambios ?? {} }])
  if (!lc.ok) return noDicha(`los cambios de la mesa no se pueden escribir: ${String(lc.r.cuerpo.detalle ?? lc.r.cuerpo.code ?? 'inválidos')}`)
  const cambios = lc.cambios[0].campos
  if (!CAMPOS_EDITABLES.some((k) => cambios[k] !== undefined && cambios[k] !== idea[k])) return noDicha('«editar» sin ningún cambio real sobre la idea')
  return r.respuesta === 'tomada' ? { respuesta: 'tomada', explicacion, accion: 'editar', cambios } : { respuesta: 'tomada_en_parte', explicacion: explicacion!, accion: 'editar', cambios }
}

export interface ResultadoDeLaCorreccion {
  /** lo que se guarda en `cadena_correcciones` (CC3): la respuesta tal como quedó DESPUÉS de verificar y escribir */
  respuesta: RespuestaDelBanco
  /** la versión de la gran idea que se escribió (o se habría escrito) */
  version: number | null
  /** la idea después de escribir (editar) o la retirada; null si no se escribió */
  idea: IdeaDelBanco | null
  reasignadas: Reasignada[]
  con_brief_sin_tocar: string[]
}

/** la versión aprobada vigente de la gran idea (la misma regla que el calendario y el tablero), la idea en su banco, el banco entero y su historial */
async function ideaVigente(al: Almacen, campanaId: string, ideaId: string): Promise<{ version: number | null; idea: IdeaDelBanco | null; banco: IdeaDelBanco[]; historial: Array<Record<string, unknown>> }> {
  const todos = await al.conceptosDe(campanaId)
  const aprobado = [...todos].reverse().find((x) => x.aprobacion === 'aprobado' && x.leido)
  if (!aprobado) return { version: null, idea: null, banco: [], historial: [] }
  const leido = aprobado.leido as Record<string, unknown>
  const banco = (Array.isArray(leido.banco) ? leido.banco : []) as IdeaDelBanco[]
  const historial = (Array.isArray(leido.historial_del_banco) ? leido.historial_del_banco : []) as Array<Record<string, unknown>>
  return { version: aprobado.version, idea: banco.find((i) => i.id === ideaId) ?? null, banco, historial }
}

/** verifica y escribe; nunca lanza por una respuesta mala: la baja de valor y lo dice */
export async function aplicarCorreccionDelBanco(al: Almacen, c: CorreccionAlBanco, r: RespuestaDelBanco, ahora: string): Promise<ResultadoDeLaCorreccion> {
  const v = await ideaVigente(al, c.campana_id, c.idea_id)
  const vacio = { version: v.version, idea: null, reasignadas: [], con_brief_sin_tocar: [] }
  const final = verificarRespuestaDelBanco(c, v.idea, r)
  if (final.respuesta !== 'tomada' && final.respuesta !== 'tomada_en_parte') return { ...vacio, respuesta: final }
  const ctx = { campana_id: c.campana_id, version: v.version!, autor: quienCorrige(c.correccion_id) }
  const w = final.accion === 'editar'
    ? await editarEnElBanco(al, ctx, [{ idea_id: c.idea_id, campos: final.cambios ?? {} }], ahora, { [c.idea_id]: c.idea_sello })
    // 19-nov · CC3 00:59Z: la vuelta al brief va ANTES de la idea nueva, con la marca del receptor (su conteo por estado + marca no cambia); la pieza vieja la archiva el receptor
    : await retirarDelBanco(al, ctx, c.idea_id, ahora, c.idea_sello, { avisoDeLaVuelta: avisoDeLaVuelta(c.correccion_id) })
  // otra edición (el tablero) cambió la idea entre la lectura y la escritura: la corrección es vieja, no se pisa
  if (w.status === 409 && w.cuerpo.code === 'E-IDEA-CAMBIADA') return { ...vacio, respuesta: { respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA }, reasignadas: Array.isArray(w.cuerpo.reasignadas) ? (w.cuerpo.reasignadas as Reasignada[]) : [] }
  if (w.status !== 200) return { ...vacio, respuesta: noDicha(`no se pudo escribir el banco: ${String(w.cuerpo.code ?? w.status)} · ${String(w.cuerpo.detalle ?? '')}`.slice(0, LARGO_MAXIMO_DE_EXPLICACION)) }
  const ideas = Array.isArray(w.cuerpo.ideas) ? (w.cuerpo.ideas as IdeaDelBanco[]) : []
  const reasignadas = Array.isArray(w.cuerpo.reasignadas) ? (w.cuerpo.reasignadas as Reasignada[]) : []
  const con_brief_sin_tocar = Array.isArray(w.cuerpo.con_brief_sin_tocar) ? (w.cuerpo.con_brief_sin_tocar as string[]) : []
  const respuesta: RespuestaDelBanco = final.accion === 'retirar' ? { ...final, reasignadas } : final
  return { respuesta, version: v.version, idea: ideas[0] ?? null, reasignadas, con_brief_sin_tocar }
}

// ───────────────────────────────────────────────────────── E2 · la mesa «corrección del banco» (GO de Lenovo · nace APAGADA · tope US$ 1,50 por corrección)
/** el interruptor (`cadena_config`): solo `true` enciende. Apagado = `no_dicha` «mesa apagada» al instante, sin modelo y sin escribir nada */
export const INTERRUPTOR_DEL_BANCO = 'corregir_el_banco'
/**
 * 17-nov (observación de CC6 al certificar #1149): UNA entrada por corrección, cada una en su clave de `cadena_config`, escrita SOLO si nadie la cambió desde que se leyó
 * (escritura condicional por su `actualizado_en`). Dos correcciones nunca se pisan; el reloj y la entrega de la oficina sobre la misma corrección tampoco.
 * El índice `banco_encargo:<encargo>` → `correccion_id` se escribe UNA vez (solo si no existe): la entrega de la oficina encuentra su corrección sin una libreta compartida.
 */
export const PREFIJO_DE_LA_CORRECCION = 'banco_correccion:'
export const PREFIJO_DEL_ENCARGO = 'banco_encargo:'
/** un turno de dirección más un reintento, los dos DENTRO de este tope. El reintento SOLO abre cuando ya se sabe lo que costó el anterior: el peor caso es este tope */
export const TOPE_DE_LA_CORRECCION_USD = 1.5
/** debajo de esto no vale la pena abrir otra mesa (un turno de dirección cuesta más) */
export const MINIMO_PARA_REINTENTAR_USD = 0.2
export const MAX_INTENTOS_DEL_BANCO = 2
/** cuánto espera la cadena a la mesa antes de darla por perdida: el plazo de la mesa (30 min) más la holgura. Una mesa perdida NO se reintenta (su costo no se conoce) */
export const PLAZO_DE_LA_MESA_DEL_BANCO_MIN = 60
export const MESA_APAGADA = 'mesa apagada: la corrección del banco no está encendida'
export const SIN_ESCRITURA_CONDICIONAL = 'la cadena no tiene escritura condicional en este entorno: no se abre la mesa del banco'

/** lo que la cadena le pide al almacén para abrir la mesa de la oficina (adaptador real en `almacen-supabase.ts`, el mismo de la reubicación) */
export interface SobreDelBanco { tipo_de_mesa: 'banco'; client_id: string; campana_id: string; version: number; dry_run: boolean; marco_texto: string; condiciones: string[]; tope_usd: number }
export type ResultadoDeAbrirMesaDelBanco = { estado: 'abierta'; encargo_id: string } | { estado: 'no_abre' | 'error'; motivo: string }

export interface CorreccionEnLaLibreta {
  correccion: CorreccionAlBanco
  /** la versión del sobre del intento vigente: única por corrección e intento (`versionDeLaMesa`) */
  version: number | null
  intentos: number
  /** `abriendo` = el intento quedó reservado antes de abrir la mesa (si algo se corta, el intento ya cuenta) */
  estado: 'abriendo' | 'abierta' | 'fallida' | 'respondida'
  encargo_id: string | null
  abierta_en: string
  /** lo que costaron las mesas que YA entregaron */
  gasto_usd: number
  motivo: string | null
  resultado: ResultadoDeLaCorreccion | null
}

/** lo que ve el receptor (CC3): sigue en curso (vuelve a llamar en el próximo tic) o ya tiene la respuesta final para guardar en `cadena_correcciones` */
export type EstadoDeLaCorreccionDelBanco = { estado: 'en_curso'; encargo_id: string | null; intentos: number } | { estado: 'respondida'; resultado: ResultadoDeLaCorreccion }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const centavos = (x: number) => Math.round(x * 10000) / 10000
const sinEscribir = (respuesta: RespuestaDelBanco, version: number | null = null): ResultadoDeLaCorreccion => ({ respuesta, version, idea: null, reasignadas: [], con_brief_sin_tocar: [] })
export const bancoEncendido = async (al: Pick<Almacen, 'leerConfig'>): Promise<boolean> => (await al.leerConfig(INTERRUPTOR_DEL_BANCO)) === true

/** la versión del sobre: distinta por corrección e intento sin un contador compartido (la oficina nombra el encargo `bco-<campaña>-v<versión>` y es idempotente por ese nombre) */
export function versionDeLaMesa(correccionId: string, intento: number): number {
  let h = 2166136261
  for (const ch of correccionId) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0 }
  return (h % 100_000_000) * 10 + intento
}

type Leida = { e: CorreccionEnLaLibreta | null; sello: string | null }
async function leerEntrada(al: Almacen, id: string): Promise<Leida> {
  const x = await al.leerConfigConSello!(PREFIJO_DE_LA_CORRECCION + id)
  return x && esObjeto(x.valor) ? { e: structuredClone(x.valor) as unknown as CorreccionEnLaLibreta, sello: x.sello } : { e: null, sello: x?.sello ?? null }
}
/** escribe la entrada SOLO si sigue como se leyó; false = otro la cambió (quien llama no decide nada y vuelve en el próximo tic) */
const guardarSiSigue = (al: Almacen, l: Leida, e: CorreccionEnLaLibreta): Promise<boolean> => al.escribirConfigSiSello!(PREFIJO_DE_LA_CORRECCION + e.correccion.correccion_id, e, l.sello)

/** una corrección que no se puede ni leer: la decide el código, sin mesa */
export function problemaDeLaCorreccion(c: unknown): string | null {
  if (!esObjeto(c)) return 'la corrección no es un objeto'
  for (const k of ['correccion_id', 'idea_id', 'idea_sello', 'motivo'] as const) if (typeof c[k] !== 'string' || !(c[k] as string).trim()) return `a la corrección le falta \`${k}\``
  if (typeof c.campana_id !== 'string' || !UUID.test(c.campana_id)) return '`campana_id` debe ser un uuid'
  if (!Array.isArray(c.filas_afectadas) || c.filas_afectadas.some((f) => typeof f !== 'string')) return '`filas_afectadas` debe ser una lista de ids'
  if (c.linea_de_la_ficha !== null && typeof c.linea_de_la_ficha !== 'string') return '`linea_de_la_ficha` debe ser texto o null'
  if (c.regla !== null && typeof c.regla !== 'string') return '`regla` debe ser texto o null'
  return null
}

const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
/** el marco de la mesa: la idea tal como está, sus filas, la corrección (motivo, línea de la ficha, regla dura), las otras ideas de su capítulo y la forma exacta de responder. No nombra el cerebro */
export function marcoDelBanco(o: { cliente: string; correccion: CorreccionAlBanco; idea: IdeaDelBanco; banco: readonly IdeaDelBanco[]; filas: ReadonlyArray<{ id: string; fecha: string | null; red: string; formato: string; estado: string }>; anterior: string | null }): string {
  const { correccion: c, idea } = o
  const hermanas = o.banco.filter((i) => i.id !== idea.id && i.capitulo !== null && i.capitulo === idea.capitulo).slice(0, 30)
  const dura = esReglaDura(c.regla)
  return [
    `# Corrección de la jefatura sobre una idea del banco · ${o.cliente}`,
    '',
    '## La idea (tal como está hoy en el banco)',
    corta(idea.linea, 1500),
    '',
    '## Las filas del calendario que la usan',
    ...(o.filas.length ? o.filas.slice(0, 40).map((f) => `- ${f.id} · ${f.fecha ?? 'sin fecha'} · ${f.red} · ${f.formato} · ${f.estado}`) : ['(ninguna fila la usa todavía)']),
    '',
    '## Lo que encontró la jefatura',
    `- Motivo: ${corta(c.motivo, 1500)}`,
    `- Línea de la ficha que la contradice: ${c.linea_de_la_ficha ? corta(c.linea_de_la_ficha, 1500) : '(no cita una línea de la ficha)'}`,
    dura
      ? `- **Regla dura ${c.regla!.trim().toUpperCase()}: se toma sí o sí.** «no_tomada» no vale: corrige la idea o retírala.`
      : '- No cita una regla dura: puedes tomarla entera, en parte o no tomarla, siempre con tu razón.',
    '',
    '## Las otras ideas de su capítulo (para no repetirlas)',
    ...(hermanas.length ? hermanas.map((i) => corta(i.linea, 400)) : ['(no hay otras ideas en su capítulo)']),
    '',
    ...(o.anterior ? ['## Tu respuesta anterior no valió', corta(o.anterior, 800), ''] : []),
    '## Cómo responder',
    'Al final, UN bloque ```json con una de estas formas (solo cuenta el último bloque):',
    '- `{"respuesta":"tomada","accion":"editar","cambios":{"mensaje":"…"},"explicacion":"…"}`',
    '- `{"respuesta":"tomada","accion":"retirar","explicacion":"…"}` (las filas que aún no tienen brief pasan a otra idea del mismo capítulo; las elige el código)',
    '- `{"respuesta":"tomada_en_parte","accion":"editar","cambios":{"gancho":"…"},"explicacion":"qué no tomas y por qué"}`',
    `- \`{"respuesta":"no_tomada","explicacion":"por qué"}\`${dura ? ' — NO vale en esta corrección (regla dura)' : ''}`,
    `Solo puedes cambiar: ${CAMPOS_EDITABLES.join(', ')}. Un texto no puede llevar « · » seguido de una etiqueta («mensaje:», «gancho:»…).`,
  ].join('\n')
}

/** la corrección que ya se escribió (su entrada en el historial del banco, a nombre de la mesa y de ESTA corrección): se reconoce en vez de leerla como «corrección vieja» */
function yaEscritaPorEstaCorreccion(historial: ReadonlyArray<Record<string, unknown>>, c: CorreccionAlBanco, version: number | null): ResultadoDeLaCorreccion | null {
  const h = [...historial].reverse().find((x) => x.quien === quienCorrige(c.correccion_id) && x.idea_id === c.idea_id)
  if (!h) return null
  const explicacion = 'ya escrita por esta corrección (recuperada del historial del banco)'
  const reasignadas = Array.isArray(h.reasignadas) ? (h.reasignadas as Reasignada[]) : []
  if (h.accion === 'retirar') return { respuesta: { respuesta: 'tomada', explicacion, accion: 'retirar', reasignadas }, version, idea: null, reasignadas, con_brief_sin_tocar: Array.isArray(h.con_brief_sin_tocar) ? (h.con_brief_sin_tocar as string[]) : [] }
  const despues = esObjeto(h.despues) ? h.despues : {}
  const cambios: Partial<Record<CampoEditable, string>> = {}
  for (const k of CAMPOS_EDITABLES) if (typeof despues[k] === 'string') cambios[k] = despues[k] as string
  return { respuesta: { respuesta: 'tomada', explicacion, accion: 'editar', cambios }, version, idea: null, reasignadas: [], con_brief_sin_tocar: [] }
}

/**
 * EL TIC del receptor (CC3 lo llama en cada vuelta del reloj, con la misma corrección, hasta que vuelve `respondida`). Idempotente por `correccion_id`. Nunca lanza.
 *  · Apagado → `no_dicha` «mesa apagada» al instante (sin modelo, sin escribir).
 *  · Lo que se decide sin mesa (gratis): corrección ilegible, idea fuera del banco, idea cambiada, ya escrita por esta misma corrección.
 *  · Si no: RESERVA el intento (escritura condicional), abre la mesa con el tope que queda y anota el encargo. Una mesa que vence NO se reintenta (su costo no se conoce):
 *    queda `no_dicha`. Tras MAX_INTENTOS_DEL_BANCO, o sin tope para otro turno, `no_dicha` con el motivo.
 */
export async function abrirCorreccionDelBanco(al: Almacen, c: CorreccionAlBanco, ahora: string): Promise<EstadoDeLaCorreccionDelBanco> {
  const respondida = (resultado: ResultadoDeLaCorreccion): EstadoDeLaCorreccionDelBanco => ({ estado: 'respondida', resultado })
  const enCurso = (e: CorreccionEnLaLibreta | null): EstadoDeLaCorreccionDelBanco => ({ estado: 'en_curso', encargo_id: e?.encargo_id ?? null, intentos: e?.intentos ?? -1 })
  try {
    const mal = problemaDeLaCorreccion(c)
    if (mal) return respondida(sinEscribir(noDicha(mal)))
    if (!(await bancoEncendido(al))) return respondida(sinEscribir(noDicha(MESA_APAGADA)))
    if (!al.leerConfigConSello || !al.escribirConfigSiSello) return respondida(sinEscribir(noDicha(SIN_ESCRITURA_CONDICIONAL)))
    const l = await leerEntrada(al, c.correccion_id)
    const e = l.e
    if (e?.estado === 'respondida' && e.resultado) return respondida(e.resultado)
    const vence = (x: CorreccionEnLaLibreta) => Date.parse(ahora) > Date.parse(x.abierta_en) + PLAZO_DE_LA_MESA_DEL_BANCO_MIN * 60_000
    if ((e?.estado === 'abierta' || e?.estado === 'abriendo') && !vence(e)) return enCurso(e)
    // la corrección guardada manda (un tic posterior no puede cambiarle la idea ni el sello)
    const base: CorreccionEnLaLibreta = e ?? { correccion: c, version: null, intentos: 0, estado: 'fallida', encargo_id: null, abierta_en: ahora, gasto_usd: 0, motivo: null, resultado: null }
    const perdida = e?.estado === 'abierta' || e?.estado === 'abriendo'
    const motivo = perdida ? 'la mesa no devolvió la respuesta a tiempo (no se reintenta: su costo no se conoce)' : e?.motivo ?? null
    const cerrar = async (resultado: ResultadoDeLaCorreccion) => (await guardarSiSigue(al, l, { ...base, estado: 'respondida', motivo, resultado })) ? respondida(resultado) : enCurso(base)
    const v = await ideaVigente(al, base.correccion.campana_id, base.correccion.idea_id)
    const escrita = yaEscritaPorEstaCorreccion(v.historial, base.correccion, v.version)
    if (escrita) return cerrar(escrita)
    const queda = centavos(TOPE_DE_LA_CORRECCION_USD - base.gasto_usd)
    if (perdida || base.intentos >= MAX_INTENTOS_DEL_BANCO || queda < MINIMO_PARA_REINTENTAR_USD) {
      return cerrar(sinEscribir(noDicha(`la mesa no dio una respuesta válida tras ${base.intentos} intento(s) (US$ ${base.gasto_usd.toFixed(2)})${motivo ? `: ${motivo}` : ''}`.slice(0, LARGO_MAXIMO_DE_EXPLICACION)), v.version))
    }
    // gratis: la idea fuera del banco o cambiada no necesita mesa
    const previo = verificarRespuestaDelBanco(base.correccion, v.idea, { respuesta: 'no_dicha' })
    if (previo.respuesta === 'no_tomada') return cerrar(sinEscribir(previo, v.version))
    const cam = await al.campana(base.correccion.campana_id)
    if (!cam) return cerrar(sinEscribir(noDicha('la campaña de la corrección no existe'), v.version))
    if (!al.abrirMesaDelBanco) return cerrar(sinEscribir(noDicha('la cadena no puede abrir la mesa del banco en este entorno'), v.version))
    // 1) reservar el intento ANTES de abrir: si otro tic llegó primero, la escritura condicional falla y no se abre nada
    const intento = base.intentos + 1
    const version = versionDeLaMesa(base.correccion.correccion_id, intento)
    const reservada: CorreccionEnLaLibreta = { ...base, version, intentos: intento, estado: 'abriendo', encargo_id: null, abierta_en: ahora, motivo }
    if (!(await guardarSiSigue(al, l, reservada))) return enCurso(base)
    // 2) abrir la mesa con lo que queda del tope
    const calVersion = await al.ultimaVersionDeCalendario(cam.id)
    const filas = calVersion ? (await al.filas(cam.id, calVersion)).filter((f) => f.idea_ref === base.correccion.idea_id || base.correccion.filas_afectadas.includes(f.id)) : []
    const ctx = await al.cargarContexto(cam.client_id, cam.plan_id)
    const marco = marcoDelBanco({ cliente: ctx?.nombreDelNegocio || 'el cliente', correccion: base.correccion, idea: v.idea!, banco: v.banco, filas: filas.map((f) => ({ id: f.id, fecha: f.fecha, red: f.red, formato: f.formato, estado: f.estado })), anterior: base.intentos > 0 ? motivo : null })
    const r = await al.abrirMesaDelBanco({ tipo_de_mesa: 'banco', client_id: cam.client_id, campana_id: cam.id, version, dry_run: cam.seco === true, marco_texto: marco, condiciones: [], tope_usd: queda })
    // 3) el índice encargo → corrección (una sola vez) y la entrada abierta
    const l2 = await leerEntrada(al, base.correccion.correccion_id)
    if (r.estado !== 'abierta') {
      const fallida: CorreccionEnLaLibreta = { ...reservada, estado: 'fallida', motivo: `la mesa no abrió: ${r.motivo}`.slice(0, LARGO_MAXIMO_DE_EXPLICACION) }
      await guardarSiSigue(al, l2, fallida)
      return enCurso(fallida)
    }
    await al.escribirConfigSiSello(PREFIJO_DEL_ENCARGO + r.encargo_id, base.correccion.correccion_id, null)
    const abierta: CorreccionEnLaLibreta = { ...reservada, estado: 'abierta', encargo_id: r.encargo_id }
    await guardarSiSigue(al, l2, abierta)
    return enCurso(abierta)
  } catch {
    // un error pasajero no decide nada: el receptor vuelve a llamar en el próximo tic
    return { estado: 'en_curso', encargo_id: null, intentos: -1 }
  }
}

export interface EntregaDelBanco { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }

/**
 * La vuelta de la mesa (puerto de la cadena, en proceso). SOLO aplica la entrega del intento VIGENTE de una corrección (el índice del encargo lleva a ella; misma campaña,
 * versión y encargo, y la entrada `abierta` o recién `abriendo`); cualquier otra contesta `ya_cerrada` sin escribir. Una respuesta ilegible o un «no_tomada» con regla dura
 * pide UN reintento (dentro del mismo tope); si no queda, se responde lo que hay. La entrada se escribe con escritura condicional.
 */
export async function recibirCorreccionDelBanco(al: Almacen, p: EntregaDelBanco, ahora: string): Promise<{ ok: true; estado?: string; ya_cerrada?: boolean } | { ok: false; error: string }> {
  if (!al.leerConfigConSello || !al.escribirConfigSiSello) return { ok: false, error: SIN_ESCRITURA_CONDICIONAL }
  const ix = await al.leerConfigConSello(PREFIJO_DEL_ENCARGO + p.encargo_id)
  const id = typeof ix?.valor === 'string' ? ix.valor : null
  if (!id) return { ok: true, ya_cerrada: true }
  const l = await leerEntrada(al, id)
  const e = l.e
  if (!e || (e.estado !== 'abierta' && e.estado !== 'abriendo') || e.correccion.campana_id !== p.campana_id || e.version !== p.version || (e.estado === 'abierta' && e.encargo_id !== p.encargo_id)) return { ok: true, ya_cerrada: true }
  const gasto = centavos(e.gasto_usd + (Number.isFinite(p.costo_usd) && p.costo_usd > 0 ? p.costo_usd : 0))
  const r = leerRespuestaDelBanco(p.texto)
  const duraRechazada = r.respuesta === 'no_tomada' && esReglaDura(e.correccion.regla)
  const queda = centavos(TOPE_DE_LA_CORRECCION_USD - gasto)
  if ((r.respuesta === 'no_dicha' || duraRechazada) && e.intentos < MAX_INTENTOS_DEL_BANCO && queda >= MINIMO_PARA_REINTENTAR_USD) {
    const motivo = r.respuesta === 'no_tomada'
      ? `la corrección cita la regla dura ${e.correccion.regla}: «no_tomada» no vale («${r.explicacion.slice(0, 200)}»)`
      : p.texto ? r.respuesta === 'no_dicha' && r.motivo ? r.motivo : 'respuesta ilegible' : `la mesa no entregó texto${p.motivo ? ` (${p.motivo})` : ''}`
    return (await guardarSiSigue(al, l, { ...e, estado: 'fallida', encargo_id: p.encargo_id, gasto_usd: gasto, motivo: motivo.slice(0, LARGO_MAXIMO_DE_EXPLICACION) })) ? { ok: true, estado: 'reintento' } : { ok: true, ya_cerrada: true }
  }
  const resultado = await aplicarCorreccionDelBanco(al, e.correccion, r, ahora)
  // si otra entrega llegó primero, la escritura condicional pierde: el banco ya quedó escrito una sola vez (el sello de la idea lo cuida) y esta contesta ya_cerrada
  return (await guardarSiSigue(al, l, { ...e, estado: 'respondida', encargo_id: p.encargo_id, gasto_usd: gasto, resultado })) ? { ok: true, estado: 'respondida' } : { ok: true, ya_cerrada: true }
}

/** lectura para el receptor y el tablero: la entrada de una corrección (null si nunca se abrió). Nunca escribe */
export async function correccionDelBanco(al: Almacen, correccionId: string): Promise<CorreccionEnLaLibreta | null> {
  if (!al.leerConfigConSello) return null
  return (await leerEntrada(al, correccionId)).e
}
