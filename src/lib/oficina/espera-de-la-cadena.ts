/**
 * ESLABONES 1 y 3 de #1150 · la oficina devuelve sus correcciones al receptor de la cadena (CC3) y lee `para_la_pieza` antes de soltar la pieza.
 * DISENO-CC4 eslabones 1 y 3 + RESPUESTA-CC7 (6 medidas + lectores) + CC3 21:23Z (campaña por el parte) · 21:34Z (puerto en proceso).
 *  · la pieza con correcciones a la cadena NO llega a la bandeja hasta que TODAS digan `sigue`;
 *  · el orden, si hay varias: frenada > reemplazada > esperando > sigue;
 *  · el encargo que espera queda `cerrado` con `resultado_para_la_sala: esperando_a_la_cadena` y este artefacto en `pendiente: true` (no cuenta como corrida viva);
 *    el vigía lo vuelve a mirar (US$ 0, sin turnos); resuelto, `pendiente: false` y nunca se vuelve a correr;
 *  · una alarma por incidente (receptor caído · 6 h esperando · parte sin campaña): la marca de «ya avisé» se GUARDA aquí;
 *  · en ensayo (dry_run) no se llama al receptor: lo de la cadena queda declarado como observación;
 *  · cada devolución se manda UNA vez (su llave); la que falló se reintenta en la vuelta siguiente.
 */
import { datos } from './ayudas'
import { datosDeLaJefatura } from './paso-jefatura'
import type { Encargo, Puertos } from './puertos'
import type { Devolucion } from './sentido-contra-la-ficha'
import type { Estado } from './tipos'

export const ARTEFACTO_ESPERA_DE_LA_CADENA = 'espera_de_la_cadena'
export const RESULTADO_ESPERANDO_A_LA_CADENA = 'esperando_a_la_cadena'
export const RESULTADO_REEMPLAZADA = 'reemplazada'
/** pasado este plazo esperando, sale UNA alarma (y sigue esperando: nunca se suelta sola) */
export const HORAS_PARA_AVISAR_LA_ESPERA = 6

export type ParaLaPieza = 'esperando' | 'frenada' | 'reemplazada' | 'sigue'
const ORDEN: ParaLaPieza[] = ['frenada', 'reemplazada', 'esperando', 'sigue']
/** lo más grave de la lista manda; sin correcciones leídas, se espera (nunca se suelta por falta de dato) */
export function veredictoDe(lista: ReadonlyArray<ParaLaPieza>): ParaLaPieza {
  if (!lista.length) return 'esperando'
  return ORDEN.find((v) => lista.includes(v)) ?? 'esperando'
}

export interface CorreccionLeida { llave: string; destino: string; para_la_pieza: ParaLaPieza; respuesta: string | null; explicacion: string | null }
export interface EsperaDeLaCadena {
  pendiente: boolean
  desde: string
  ultima_mirada: string
  /** las devoluciones del encargo (se guardan la primera vez: el vigía no depende de la jefatura) */
  devoluciones: Devolucion[]
  /** llaves que el receptor ya recibió (201 · ya_estaba) o que no eran de la cadena (va_a pieza): no se vuelven a mandar */
  enviadas: string[]
  /** llaves que el receptor dijo que son de la pieza (no se guardan allá): quedan como observación */
  a_la_pieza: string[]
  /** llaves que el receptor contestó `ya_estaba`: si no aparecen en la lectura de ESTE encargo, la corrección es de OTRO encargo de la misma fila (CERTIFICACION-CC7 punto 3) */
  ya_estaban?: string[]
  correcciones: CorreccionLeida[]
  veredicto: ParaLaPieza
  /** la marca de «ya avisé», una por incidente */
  avisos: { receptor_caido?: string; seis_horas?: string; sin_campana?: string; sin_devoluciones?: string; de_otro_encargo?: string }
}

export interface ResultadoDeLaCadena {
  veredicto: ParaLaPieza
  espera: EsperaDeLaCadena
  /** lo que la bandeja declara cuando la pieza sigue (explicación de cada corrección que dijo `sigue` · lo que no era de la cadena) */
  observaciones: string[]
  /** las alarmas que hay que mandar AHORA (ya decididas: una por incidente) */
  alarmas: Array<{ canal: 'alertas' | 'hilo'; texto: string }>
  simulado: boolean
}

const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)
const esPara = (x: unknown): x is ParaLaPieza => typeof x === 'string' && (ORDEN as string[]).includes(x)
/** la regla dura citada en el motivo (D1 · D2 · D3): el receptor la quiere en `regla` */
export const reglaDelMotivo = (motivo: string): string | null => /^\s*(D\d{1,2})\b/i.exec(motivo)?.[1].toUpperCase() ?? null

/** las devoluciones que el cierre tiene que llevar: las nuevas de la jefatura (más las que ya se guardaron la vez anterior) */
export function devolucionesDelEncargo(e: Estado, previa: EsperaDeLaCadena | null): Devolucion[] {
  const nuevas = (datosDeLaJefatura(e)?.sentido?.devoluciones ?? []) as Devolucion[]
  const porLlave = new Map<string, Devolucion>()
  for (const d of [...(previa?.devoluciones ?? []), ...nuevas]) if (!porLlave.has(d.llave)) porLlave.set(d.llave, d)
  return [...porLlave.values()]
}

export async function consultarLaCadena(P: Puertos, enc: Encargo, e: Estado): Promise<ResultadoDeLaCadena> {
  const previa = (datos(e, ARTEFACTO_ESPERA_DE_LA_CADENA) as EsperaDeLaCadena | undefined) ?? null
  const ahora = P.ahora().toISOString()
  const devs = devolucionesDelEncargo(e, previa)
  const espera: EsperaDeLaCadena = {
    pendiente: true, desde: previa?.desde ?? ahora, ultima_mirada: ahora, devoluciones: devs,
    enviadas: [...(previa?.enviadas ?? [])], a_la_pieza: [...(previa?.a_la_pieza ?? [])], ya_estaban: [...(previa?.ya_estaban ?? [])], correcciones: previa?.correcciones ?? [], veredicto: 'esperando', avisos: { ...(previa?.avisos ?? {}) },
  }
  const alarmas: ResultadoDeLaCadena['alarmas'] = []
  const unaVez = (clave: keyof EsperaDeLaCadena['avisos'], t: string) => {
    alarmas.push({ canal: espera.avisos[clave] ? 'hilo' : 'alertas', texto: t })
    espera.avisos[clave] ??= ahora
  }
  const fin = (veredicto: ParaLaPieza, observaciones: string[] = [], simulado = false): ResultadoDeLaCadena => {
    espera.veredicto = veredicto
    espera.pendiente = veredicto === 'esperando'
    if (veredicto === 'esperando' && Date.parse(ahora) - Date.parse(espera.desde) >= HORAS_PARA_AVISAR_LA_ESPERA * 3600_000 && !espera.avisos.seis_horas) {
      alarmas.push({ canal: 'alertas', texto: `⏳ Esperando a la cadena · ${enc.brief_id}: hace ${HORAS_PARA_AVISAR_LA_ESPERA} h que sus correcciones no tienen respuesta. La pieza no sale hasta que la tengan.` })
      espera.avisos.seis_horas = ahora
    }
    return { veredicto, espera, observaciones, alarmas, simulado }
  }

  // 5 · ensayo: ni un POST al receptor ni una escritura en la cadena; lo de la cadena se declara y la pieza sigue (simulada)
  if (enc.dry_run) return fin('sigue', devs.map((d) => `${d.destino}: (ensayo) no se devolvió a la cadena: ${d.motivo}`), true)

  // hay fichas «en la cadena» pero no se encuentra qué devolver: nunca se suelta por falta de dato · espera y avisa UNA vez
  if (!devs.length) {
    unaVez('sin_devoluciones', `🛑 Pieza sin salir · ${enc.brief_id}: tiene correcciones a la cadena, pero la oficina no encuentra cuáles son. No se publica.`)
    return fin('esperando')
  }
  const cad = P.cadena
  if (!cad?.devolverCorreccion || !cad?.correccionesDelEncargo) {
    unaVez('receptor_caido', `🛑 Sin receptor de la cadena · ${enc.brief_id}: la oficina no tiene cómo devolver sus correcciones. La pieza no sale.`)
    return fin('esperando')
  }
  // la campaña por el PARTE (CC3 21:23Z · como `piezas-por-publicar.ts`): sin campaña no hay a quién corregir → frenada, UNA alarma
  const parte = enc.parte_id ? await P.parte(enc.parte_id, enc.client_id).catch(() => null) : null
  const campana = texto(parte?.campana_id)
  if (!campana) {
    unaVez('sin_campana', `🛑 Pieza frenada · ${enc.brief_id}: su parte no está en ninguna campaña, así que sus correcciones no tienen a quién volver. No se publica.`)
    return fin('frenada')
  }

  // 1 · el llamado: cada devolución UNA vez (6 · la que falló se reintenta en la vuelta siguiente; la llave no la duplica)
  let caido = false
  for (const d of devs) {
    if (espera.enviadas.includes(d.llave)) continue
    const regla = reglaDelMotivo(d.motivo)
    const r = await cad.devolverCorreccion({
      accion: 'recibir', campana_id: campana, fila_id: d.fila_id, destino: d.destino, motivo: d.motivo, linea_de_la_ficha: d.linea_de_la_ficha, encargo_id: enc.id,
      dura: d.dura, llave: d.llave, origen: d.origen, ...(regla ? { regla } : {}), ...(d.campo_de_la_hoja ? { campo_de_la_hoja: d.campo_de_la_hoja } : {}),
    })
    if (r.status === 201) espera.enviadas.push(d.llave)
    else if (r.status === 200 && r.cuerpo?.ya_estaba === true) { espera.enviadas.push(d.llave); espera.ya_estaban!.push(d.llave) }
    else if (r.status === 200 && r.cuerpo?.va_a === 'pieza') { espera.enviadas.push(d.llave); espera.a_la_pieza.push(d.llave) }
    else caido = true
  }
  // 3 · la lectura: `para_la_pieza` de cada corrección de este encargo
  const lectura = await cad.correccionesDelEncargo(enc.id)
  const lista = lectura.status === 200 && Array.isArray(lectura.cuerpo?.correcciones) ? (lectura.cuerpo.correcciones as Array<Record<string, unknown>>) : null
  if (!lista) caido = true
  else espera.correcciones = lista.filter((c) => espera.enviadas.includes(String(c.llave)) && !espera.a_la_pieza.includes(String(c.llave))).map((c) => {
    const para: ParaLaPieza = esPara(c.para_la_pieza) ? c.para_la_pieza : 'esperando'
    // CC6 21:40Z · una DURA que la cadena TOMÓ dejó vieja a la pieza: si aun así llega `sigue` (fila que no se movió, vuelta repetida), la pieza vieja NO sale · espera
    const duraTomada = para === 'sigue' && texto(c.respuesta) === 'tomada' && devs.some((d) => d.llave === String(c.llave) && d.dura)
    return { llave: String(c.llave), destino: String(c.destino ?? ''), para_la_pieza: duraTomada ? 'esperando' : para, respuesta: texto(c.respuesta), explicacion: texto(c.explicacion) }
  })
  if (caido) unaVez('receptor_caido', `🛑 El receptor de la cadena no contestó · ${enc.brief_id}: la pieza no sale; la oficina reintenta en la próxima vuelta del vigía.`)
  // la que se mandó y todavía no aparece en la lectura cuenta como `esperando`
  const deLaCadena = espera.enviadas.filter((l) => !espera.a_la_pieza.includes(l))
  const noLeida = (l: string) => !espera.correcciones.some((c) => c.llave === l)
  // CC7 punto 3 · `ya_estaba` y no está en la lectura de este encargo: la fila ya tiene esa corrección de OTRO encargo y esta regla dura no llegó a ningún creador.
  //   19-nov · nada se frena (caso 4): se vuelve a MANDAR en la vuelta siguiente del vigía. El receptor la cubre si la otra sigue abierta, o abre una nueva para
  //   este encargo si ya se respondió (una dura se toma sí o sí): la pieza espera esa respuesta, con UNA alarma. No se publica mientras tanto.
  const deOtro = lista ? deLaCadena.filter((l) => (espera.ya_estaban ?? []).includes(l) && noLeida(l)) : []
  if (deOtro.length) {
    unaVez('de_otro_encargo', `🔁 Pieza en corrección · ${enc.brief_id}: la fila ya tenía esta corrección de otro encargo (${deOtro.join(', ')}); se vuelve a mandar para que llegue a su creador. No se publica hasta tener la respuesta; la campaña sigue.`)
    espera.enviadas = espera.enviadas.filter((l) => !deOtro.includes(l))
    espera.ya_estaban = (espera.ya_estaban ?? []).filter((l) => !deOtro.includes(l))
  }
  const faltan = deLaCadena.some((l) => noLeida(l)) || devs.some((d) => !espera.enviadas.includes(d.llave))
  const veredicto = veredictoDe([...espera.correcciones.map((c) => c.para_la_pieza), ...(caido || faltan ? ['esperando' as const] : []), ...(deLaCadena.length ? [] : ['sigue' as const])])
  const observaciones = veredicto === 'sigue' ? [
    ...espera.correcciones.map((c) => `${c.destino}: la cadena respondió «${c.respuesta ?? 'sin respuesta'}»${c.explicacion ? ` — ${c.explicacion}` : ''}`),
    ...devs.filter((d) => espera.a_la_pieza.includes(d.llave)).map((d) => `pieza: ${d.motivo} (no era de la cadena)`),
  ] : []
  return fin(veredicto, observaciones)
}
