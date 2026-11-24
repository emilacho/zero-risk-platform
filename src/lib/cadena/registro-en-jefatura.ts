/**
 * 10-nov · TRAMO 2 DEL REVISOR DE REGISTRO (GO de Lenovo 17:33Z) · la cadena manda el brief creativo y la gran idea al revisor de registro de la jefatura (#991) ANTES de cerrarlos.
 *
 *   · APAGADO (la jefatura no retiene `registro` para este cliente · el cliente sin registro fijado · el almacén sin el puerto): todo byte a byte como hoy, el registro de
 *     «Tono» (brief) y de «Cómo suena» (gran idea) sigue BLOQUEANDO como siempre;
 *   · RETIENE: el documento se lee con el registro como AVISO (los demás chequeos bloquean igual). Si nada más bloquea, se guarda tal cual (brief en `borrador`, concepto en
 *     `abierta`), se abre la espera `revision_jefatura` con objeto `registro:<doc>:v<n>` y se abre UNA revisión de registro. El revisor revisa siempre, haya pistas o no;
 *   · VUELTA (`aplicarVueltaDeRegistro`, en mesas.ts): el texto corregido se vuelve a leer con TODOS los chequeos (línea 2 de CC7). Si alguno se rompe, se queda la versión anterior
 *     con aviso. Las citas no se corrigen (línea 1 de CC7): el revisor las deja intactas y el chequeo de citas (#984) corre otra vez sobre la versión corregida;
 *   · NO ABRE / ERROR / VENCE: la cadena sigue con las pistas como aviso. Nunca queda de rehén de la jefatura (firma A de J7).
 *
 * 🔴 Agnóstico: ninguna rama por cliente, rubro ni país. El registro sale de la ficha del cliente (manual > ficha > país), nunca de una regla fija.
 * 🔴 La cadena no importa `jefatura/`: el sobre se arma con la forma de su contrato (`EntradaDeRegistro`).
 */
import type { Almacen, Campana, ContextoDelCliente, EntradaDeRegistro, EsperaFila, ResultadoDeAbrirRegistro } from './almacen'
import { AGENTE_POR_PASO } from './constantes'
import { abrirEsperaDe } from './nucleo'
import { formasDeOtroRegistro } from './registro'
import { retencionDe, TIPO_DE_ESPERA } from './revision-jefatura'
import type { Fila } from './tipos'

/** tramo 3 (10-nov · GO de Lenovo 22:20Z): el calendario es el tercer documento; su «versión» es la TANDA (una revisión por tanda) */
export type DocDeRegistro = 'brief' | 'concepto' | 'calendario'
export const NOMBRE_DEL_DOCUMENTO: Record<DocDeRegistro, string> = { brief: 'el brief creativo', concepto: 'la gran idea', calendario: 'el calendario' }
/** quién corrige: el brief lo escribe `campaign-brief-agent`; el calendario, su agente de siempre (`AGENTE_POR_PASO.calendario`); la gran idea, la política por omisión de la jefatura (sin productor en el sobre) */
const PRODUCTOR_DEL_DOCUMENTO: Record<DocDeRegistro, string | null> = { brief: 'campaign-brief-agent', concepto: null, calendario: AGENTE_POR_PASO.calendario }
/** el número del documento: `v` de versión (brief, gran idea) · `t` de tanda (calendario) */
const LETRA: Record<DocDeRegistro, 'v' | 't'> = { brief: 'v', concepto: 'v', calendario: 't' }

/**
 * 24-nov · LA RONDA DE LA REVISIÓN (arreglo A · GO de Lenovo 18:30Z) · una versión del brief o de la gran idea REABIERTA (retomar donde se cayó, #1279) se entrega otra vez
 * con texto nuevo, pero su primera revisión de registro ya existe: la espera (`dedup_key`) y la revisión de la jefatura (`artifact_id + version`) chocaban y devolvían
 * las VIEJAS, ya cerradas; la vuelta no hallaba espera viva y la versión quedaba `abierta` hasta vencer y rehacerse la mesa entera.
 * Cada revisión nueva de la MISMA versión lleva su ronda en las DOS llaves: la 1.ª, sin marca (byte a byte con hoy); la 2.ª, `:r2`; y así. El calendario no lleva ronda.
 */
export const MAXIMO_DE_RONDAS_DE_REGISTRO = 9
const marcaDeRonda = (doc: DocDeRegistro, ronda: number): string => (doc !== 'calendario' && ronda > 1 ? `:r${ronda}` : '')
/** el objeto de la espera (`cadena_esperas.objeto_id`): distinto del de J7 (`estrategia:vN` · `calendario:tN`) */
export const objetoDeRegistro = (doc: DocDeRegistro, version: number, ronda = 1): string => `registro:${doc}:${LETRA[doc]}${version}${marcaDeRonda(doc, ronda)}`
/** la ronda solo aparece desde la 2.ª: la 1.ª se lee igual que antes (sin el campo) */
const conRonda = (r: string | undefined): { ronda?: number } => (r ? { ronda: Number(r) } : {})
export function leerObjetoDeRegistro(objeto: string): { doc: DocDeRegistro; version: number; ronda?: number } | null {
  const m = /^registro:(?:(brief|concepto):v(\d+)(?::r([2-9]))?|(calendario):t(\d+))$/.exec(objeto)
  return m ? { doc: (m[1] ?? m[4]) as DocDeRegistro, version: Number(m[2] ?? m[5]), ...conRonda(m[3]) } : null
}
/** el `artifact_id` de la revisión: reversible (la vuelta encuentra la campaña, el documento, la versión y la ronda sin leer nada más) */
export const artifactIdDeRegistro = (doc: DocDeRegistro, campanaId: string, version: number, ronda = 1): string => `registro:${doc}:${campanaId}:${LETRA[doc]}${version}${marcaDeRonda(doc, ronda)}`
export function leerArtifactIdDeRegistro(id: string): { doc: DocDeRegistro; campana_id: string; version: number; ronda?: number } | null {
  const m = /^registro:(?:(brief|concepto):([0-9a-zA-Z-]+):v(\d+)(?::r([2-9]))?|(calendario):([0-9a-zA-Z-]+):t(\d+))$/.exec(id)
  return m ? { doc: (m[1] ?? m[5]) as DocDeRegistro, campana_id: (m[2] ?? m[6]) as string, version: Number(m[3] ?? m[7]), ...conRonda(m[4]) } : null
}

// ───────────────────────────────────────────────────────── tramo 3 · el calendario como documento (una línea por fila)
/** las filas de la tanda que llevan un tema que se publica: ni esquemas, ni las que salieron sin fuente, ni temas vacíos */
export const filasConTema = (filas: Fila[]): Fila[] => filas.filter((f) => f.estado !== 'esquema' && f.estado !== 'descartada_sin_fuente' && f.estado !== 'descartada_por_bloqueo' && !!f.tema?.trim())
/** la cabecera FIJA de cada fila en el documento (la arma el código; el revisor solo juzga lo que va después) */
export const cabeceraDeFila = (f: Pick<Fila, 'id' | 'fecha' | 'red' | 'formato'>): string => `- [${f.id} · ${f.fecha} · ${f.red}/${f.formato}] `
/** el calendario de la tanda como texto: una línea por fila, en el orden de las filas, con su tema tal cual */
export const textoDelCalendario = (filas: Fila[]): string => filasConTema(filas).map((f) => `${cabeceraDeFila(f)}${f.tema}`).join('\n')

/**
 * El tema de cada fila en el texto que volvió: lo que va entre su cabecera y la cabecera de la fila siguiente. EXACTO: cada cabecera tiene que estar UNA vez, en su orden y al
 * empezar una línea. Si una sola falla, la vuelta entera no se puede leer (null) y el calendario se queda con sus temas: nunca se adivina a qué fila va un pedazo de texto.
 */
export function temasDeLaVuelta(texto: string, filas: Fila[]): Map<string, string> | null {
  // 🟡 de CC7: los saltos de Windows se normalizan antes de buscar cabeceras, y cada tema sale sin espacios ni saltos en los extremos (un salto final no es una corrección)
  texto = texto.replace(/\r\n?/g, '\n')
  const fs = filasConTema(filas)
  const pos: number[] = []
  for (const f of fs) {
    const cab = cabeceraDeFila(f)
    const i = texto.indexOf(cab)
    if (i < 0 || texto.indexOf(cab, i + 1) >= 0) return null
    if (i !== 0 && texto[i - 1] !== '\n') return null
    if (pos.length && i <= pos[pos.length - 1]) return null
    pos.push(i)
  }
  if (fs.length && pos[0] !== 0) return null
  const out = new Map<string, string>()
  fs.forEach((f, k) => {
    const desde = pos[k] + cabeceraDeFila(f).length
    const hasta = k + 1 < fs.length ? pos[k + 1] - 1 : texto.length
    out.set(f.id, texto.slice(desde, hasta).trim())
  })
  return out
}

export type RegistroFijado = 'tu' | 'vos' | 'usted'
export const registroFijado = (ctx: Pick<ContextoDelCliente, 'registro'> | null | undefined): RegistroFijado | null => (ctx?.registro === 'tu' || ctx?.registro === 'vos' || ctx?.registro === 'usted' ? ctx.registro : null)

/** las formas de otro registro que ve el detector barato en TODO el texto: son pistas para el revisor y, si la revisión no corre, el aviso que queda */
export const pistasDeRegistro = (registro: RegistroFijado, texto: string): string[] => [...new Set(formasDeOtroRegistro(registro, texto))]
export const avisoDePistas = (pistas: string[], motivo: string): string[] => (pistas.length ? [`registro sin revisar (${motivo}): el detector ve formas de otro registro: ${pistas.slice(0, 8).join(' · ')}`] : [])

export interface SobreDeRegistroPedido {
  doc: DocDeRegistro
  campana: Pick<Campana, 'id' | 'client_id' | 'seco'>
  version: number
  texto: string
  registro: RegistroFijado
  /** de dónde salió el registro (manual · ficha · país), si se sabe */
  fuente?: string
  /** los documentos de los que el texto puede citar (plan, manual y, para la gran idea, el brief validado): el revisor comprueba sus citas contra ellos */
  origenes: Array<{ titulo: string; texto: string }>
  /** 24-nov · la ronda de la revisión de ESTA versión (1 si se omite): la pone `abrirRegistro` */
  ronda?: number
}

export function sobreDeRegistro(p: SobreDeRegistroPedido): EntradaDeRegistro {
  const agente = PRODUCTOR_DEL_DOCUMENTO[p.doc]
  return {
    artifact_type: 'registro', artifact_id: artifactIdDeRegistro(p.doc, p.campana.id, p.version, p.ronda ?? 1), client_id: p.campana.client_id, journey_id: null,
    payload: {
      texto: p.texto, dry_run: p.campana.seco, version: p.version, documento: NOMBRE_DEL_DOCUMENTO[p.doc],
      registro: { trato: p.registro, ...(p.fuente ? { fuente: p.fuente } : {}) },
      pistas_de_registro: pistasDeRegistro(p.registro, p.texto),
      documentos_de_origen: p.origenes.filter((d) => d.texto.trim()),
      // sin clase de trabajo: la base solo admite pedido · alta · plan · pieza (`agent_invocations_trabajo_check`); «plan» sumaría al corte del plan. Sumar «campaña» es otra pieza
      ...(agente ? { productores: [{ donde: '*', agente }] } : {}),
    },
  }
}

/** ¿se manda este documento al revisor? Solo si el registro está fijado, la jefatura retiene `registro` para este cliente y el almacén sabe abrirla */
export async function seRevisaElRegistro(al: Almacen, campana: Pick<Campana, 'client_id'>, ctx: Pick<ContextoDelCliente, 'registro'> | null | undefined): Promise<boolean> {
  if (!registroFijado(ctx) || typeof al.abrirRevisionDeRegistro !== 'function') return false
  return (await retencionDe(al, 'registro', campana.client_id)).retener
}

/** la espera viva de la revisión de registro de esta versión: de CUALQUIER ronda, o (con `ronda`) solo de esa · una vuelta vieja nunca cierra la ronda nueva */
const esDeRegistro = (e: EsperaFila, campanaId: string, doc: DocDeRegistro, version: number, ronda?: number): boolean => {
  if (e.campana_id !== campanaId || e.objeto_tipo !== TIPO_DE_ESPERA) return false
  const o = leerObjetoDeRegistro(e.objeto_id)
  return !!o && o.doc === doc && o.version === version && (ronda === undefined || (o.ronda ?? 1) === ronda)
}
export const esperaDeRegistroViva = async (al: Almacen, campanaId: string, doc: DocDeRegistro, version: number, ronda?: number): Promise<EsperaFila | null> =>
  (await al.esperasVivas()).find((e) => esDeRegistro(e, campanaId, doc, version, ronda)) ?? null

/** el cierre del documento resuelve la espera de su revisión, sea de la ronda que sea (si no, una ronda viva sobreviviría a su documento cerrado) */
export async function resolverEsperasDeRegistro(al: Almacen, campanaId: string, doc: DocDeRegistro, version: number): Promise<void> {
  for (const e of (await al.esperasVivas()).filter((x) => esDeRegistro(x, campanaId, doc, version))) await al.actualizarEspera(e.id, { estado: 'resuelta' })
}

/**
 * Abre la espera y la revisión. Nunca lanza: un puerto que falla vuelve como `error`. La espera la resuelve SIEMPRE el cierre del documento (`no_abre` · `error` · `cerrada` ·
 * la vuelta · el reloj): un solo lugar resuelve, así no queda una espera viva sobre un documento cerrado ni uno cerrado dos veces.
 */
export async function abrirRegistro(al: Almacen, p: SobreDeRegistroPedido & { campana: Campana }, ahora: string): Promise<{ r: ResultadoDeAbrirRegistro; vence_en: string }> {
  const motivo = `la jefatura revisa el registro de ${NOMBRE_DEL_DOCUMENTO[p.doc]} v${p.version} antes de cerrarlo`
  // 24-nov · arreglo A: si la espera de esta ronda ya está CERRADA (la revisión de antes de reabrir la versión), la revisión nueva va en la ronda siguiente, con sus dos llaves.
  //   Una espera VIVA se reusa (entrega repetida mientras la jefatura revisa). El calendario no lleva ronda (su vuelta lee la tanda).
  let ronda = 1
  let espera = await abrirEsperaDe(al, p.campana, TIPO_DE_ESPERA, objetoDeRegistro(p.doc, p.version, ronda), motivo, ahora)
  while (espera.estado !== 'viva' && p.doc !== 'calendario' && ronda < MAXIMO_DE_RONDAS_DE_REGISTRO) {
    ronda++
    espera = await abrirEsperaDe(al, p.campana, TIPO_DE_ESPERA, objetoDeRegistro(p.doc, p.version, ronda), `${motivo} (ronda ${ronda}: la versión se reabrió)`, ahora)
  }
  if (espera.estado !== 'viva' && p.doc !== 'calendario') return { r: { estado: 'no_abre', motivo: `la revisión de registro de ${NOMBRE_DEL_DOCUMENTO[p.doc]} v${p.version} ya no tiene ronda libre (${ronda})` }, vence_en: espera.vence_en }
  p = { ...p, ronda }
  let r: ResultadoDeAbrirRegistro
  try { r = al.abrirRevisionDeRegistro ? await al.abrirRevisionDeRegistro(sobreDeRegistro(p)) : { estado: 'no_abre', motivo: 'el almacén no abre revisiones de registro' } } catch (e) { r = { estado: 'error', motivo: e instanceof Error ? e.message.slice(0, 200) : 'error' } }
  return { r, vence_en: espera.vence_en }
}

/** el texto que vuelve de la revisión: el corregido solo si la jefatura produjo una versión; si no, el original (cierre limpio · fallido · por tope sin versión) */
export function textoDeLaVuelta(salida: Record<string, unknown>, original: string): { texto: string; corregido: boolean } {
  const versiones = Array.isArray(salida.versiones) ? salida.versiones : []
  const final = salida.artefacto_final && typeof salida.artefacto_final === 'object' ? (salida.artefacto_final as Record<string, unknown>).texto : undefined
  return versiones.length && typeof final === 'string' && final.trim() && final !== original ? { texto: final, corregido: true } : { texto: original, corregido: false }
}

export const avisosDeLaSalida = (salida: Record<string, unknown>): string[] => (Array.isArray(salida.avisos) ? salida.avisos.filter((x): x is string => typeof x === 'string') : [])
