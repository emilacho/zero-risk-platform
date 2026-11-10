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
import { abrirEsperaDe } from './nucleo'
import { formasDeOtroRegistro } from './registro'
import { retencionDe, TIPO_DE_ESPERA } from './revision-jefatura'

export type DocDeRegistro = 'brief' | 'concepto'
export const NOMBRE_DEL_DOCUMENTO: Record<DocDeRegistro, string> = { brief: 'el brief creativo', concepto: 'la gran idea' }
/** quién corrige: el brief lo escribe `campaign-brief-agent`; la gran idea, la política por omisión de la jefatura (sin productor en el sobre) */
const PRODUCTOR_DEL_DOCUMENTO: Record<DocDeRegistro, string | null> = { brief: 'campaign-brief-agent', concepto: null }

/** el objeto de la espera (`cadena_esperas.objeto_id`): distinto del de J7 (`estrategia:vN` · `calendario:tN`) */
export const objetoDeRegistro = (doc: DocDeRegistro, version: number): string => `registro:${doc}:v${version}`
export function leerObjetoDeRegistro(objeto: string): { doc: DocDeRegistro; version: number } | null {
  const m = /^registro:(brief|concepto):v(\d+)$/.exec(objeto)
  return m ? { doc: m[1] as DocDeRegistro, version: Number(m[2]) } : null
}
/** el `artifact_id` de la revisión: reversible (la vuelta encuentra la campaña, el documento y la versión sin leer nada más) */
export const artifactIdDeRegistro = (doc: DocDeRegistro, campanaId: string, version: number): string => `registro:${doc}:${campanaId}:v${version}`
export function leerArtifactIdDeRegistro(id: string): { doc: DocDeRegistro; campana_id: string; version: number } | null {
  const m = /^registro:(brief|concepto):([0-9a-zA-Z-]+):v(\d+)$/.exec(id)
  return m ? { doc: m[1] as DocDeRegistro, campana_id: m[2], version: Number(m[3]) } : null
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
}

export function sobreDeRegistro(p: SobreDeRegistroPedido): EntradaDeRegistro {
  const agente = PRODUCTOR_DEL_DOCUMENTO[p.doc]
  return {
    artifact_type: 'registro', artifact_id: artifactIdDeRegistro(p.doc, p.campana.id, p.version), client_id: p.campana.client_id, journey_id: null,
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

export const esperaDeRegistroViva = async (al: Almacen, campanaId: string, doc: DocDeRegistro, version: number): Promise<EsperaFila | null> =>
  (await al.esperasVivas()).find((e) => e.campana_id === campanaId && e.objeto_tipo === TIPO_DE_ESPERA && e.objeto_id === objetoDeRegistro(doc, version)) ?? null

/**
 * Abre la espera y la revisión. Nunca lanza: un puerto que falla vuelve como `error`. La espera la resuelve SIEMPRE el cierre del documento (`no_abre` · `error` · `cerrada` ·
 * la vuelta · el reloj): un solo lugar resuelve, así no queda una espera viva sobre un documento cerrado ni uno cerrado dos veces.
 */
export async function abrirRegistro(al: Almacen, p: SobreDeRegistroPedido & { campana: Campana }, ahora: string): Promise<{ r: ResultadoDeAbrirRegistro; vence_en: string }> {
  const espera = await abrirEsperaDe(al, p.campana, TIPO_DE_ESPERA, objetoDeRegistro(p.doc, p.version), `la jefatura revisa el registro de ${NOMBRE_DEL_DOCUMENTO[p.doc]} v${p.version} antes de cerrarlo`, ahora)
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
