/**
 * 20-nov · EL SEGUNDO DOCTOR CREATIVO EN LA PROPUESTA (PLAN v4 de CC4 · (A) de Emilio 12:21 Zúrich · respuestas de LENOVO 11:27Z · 🟢 CC7 y 🟢 condicionado CC6).
 * GPT opina sobre las PROPUESTAS como le llegan a Emilio, ANTES de producir: así su opinión nunca pide un segundo render.
 *  · post / carrusel / historias: entre `borrador_imagen` y `aprobar_propuestas` (ve el texto de cada propuesta y sus imágenes borrador);
 *  · video: entre `imagenes_clave` (borrador) y `borrador_video` (ve concepto, guion y storyboard; su vuelta rehace solo las imágenes clave, tope US$ 3).
 * Lo que dice llega al creativo de la mesa SIN firma ni peso (vuelta propia, máximo 1, si cabe); el creativo decide y contesta en una línea; luego aprueba Emilio.
 * Una sola vez: si el paso vuelve a pasar (tras la vuelta, tras las observaciones de Emilio o por un reintento) NO llama a GPT (`ya_opino`): lee lo que contestó el creativo.
 * Lo que es dato equivocado (`datos`) nunca llega al creativo: es diagnóstico para la corrida (CC7).
 */
import { armarPedidoAlRevisor, PREGUNTA_AL_REVISOR, type ContextoDelRevisor } from '../revision-comun'
import { bloqueParaElCreativo, huella, leerInformeCreativo, PEDIDO_CREATIVO, resumenDelDoctor, type InformeCreativo } from '../jefatura/revision/segundo-doctor'
import { datos } from './ayudas'
import { ARTEFACTO_BORRADOR_IMAGEN, FUNCION_BORRADOR_IMAGEN, type BorradoresDeImagen } from './mesa/borrador-imagen'
import { ARTEFACTO_PROPUESTAS_IMAGEN, type PropuestasDeImagen } from './mesa/propuestas-imagen'
import { cabeLaVuelta, quedaVueltaDelPaso } from './orquestador-video'
import { FUNCION_DEL_BRIEF, FUNCION_DEL_MANUAL, FUNCION_DEL_PLAN } from './pedidos'
import { contextoDeLaFicha, fichaDeLaHoja, leerRespuestas, type Enviada, type RespuestaDelCreador } from './sentido-contra-la-ficha'
import { costoDeVolver } from './topes-por-duracion'
import type { Cambios, Encargo, Puertos } from './puertos'
import type { ResultadoDePaso } from './motor'
import type { ImagenesClave } from './video/imagen-clave'
import type { PropuestasDelVideo } from './video/propuestas'
import type { Estado, Paso, Plantilla } from './tipos'

export const FUNCION_SEGUNDA_MIRADA = 'segunda_mirada'
export const ARTEFACTO_SEGUNDA_MIRADA = 'segunda_mirada'
/** lo mismo que reserva hoy el paso de GPT en la jefatura (`TOPES_POR_OMISION.segunda_mirada`) */
export const TOPE_DE_LA_SEGUNDA_MIRADA_USD = 0.5
/** el mismo techo de imágenes que ya usa la revisión del video (12 por pedido) */
export const MAX_IMAGENES_DE_LA_SEGUNDA_MIRADA = 12

/** el paso (DATO): su vuelta a la mesa es PROPIA (el contador es por clave: no gasta la de `aprobar_propuestas` ni la de la `jefatura`) */
export const pasoDeLaSegundaMirada = (): Paso => ({
  clave: FUNCION_SEGUNDA_MIRADA, tipo: 'codigo', quien: 'sala', funcion: FUNCION_SEGUNDA_MIRADA, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: ARTEFACTO_SEGUNDA_MIRADA,
  tope_usd: TOPE_DE_LA_SEGUNDA_MIRADA_USD,
  vuelve_a: { paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: ARTEFACTO_SEGUNDA_MIRADA, campo: 'vuelve_a_la_mesa', igual: true } },
})

/** dónde entra: después de `borrador_imagen` (imagen) o del PRIMER `imagenes_clave` (video, antes de `borrador_video`) · pura (no toca la de entrada) */
export function conSegundaMirada(pl: Plantilla): Plantilla {
  if (pl.pasos.some((p) => p.funcion === FUNCION_SEGUNDA_MIRADA)) throw new Error(`la plantilla ${pl.tipo} ya tiene la segunda mirada`)
  const pasos = structuredClone(pl.pasos)
  let i = pasos.findIndex((p) => p.funcion === FUNCION_BORRADOR_IMAGEN)
  if (i < 0) {
    i = pasos.findIndex((p) => p.funcion === 'imagenes_clave')
    if (i < 0 || pasos[i + 1]?.funcion !== 'borrador_video') throw new Error(`la plantilla ${pl.tipo} no tiene borrador_imagen ni imagenes_clave → borrador_video: no se sabe dónde va la segunda mirada`)
  }
  pasos.splice(i + 1, 0, pasoDeLaSegundaMirada())
  return { ...structuredClone(pl), pasos }
}

// ───────────────────────── lo que ve GPT: las propuestas como le llegan a Emilio
export interface MaterialDeLaPropuesta { revisado: string; imagenes: string[]; contexto: ContextoDelRevisor[] }

interface BaseDelEncargo { brief?: { texto?: string }; F?: { manual_texto?: string; plan_texto?: string | null } }

export function materialDeLaPropuesta(e: Estado): MaterialDeLaPropuesta {
  const b = (datos(e, 'encargo') ?? {}) as BaseDelEncargo
  const briefTexto = String(b.brief?.texto ?? '')
  const ficha = contextoDeLaFicha(fichaDeLaHoja(briefTexto))
  const contexto: ContextoDelRevisor[] = [
    { titulo: 'Manual de marca del cliente', funcion: FUNCION_DEL_MANUAL, texto: String(b.F?.manual_texto ?? '') },
    { titulo: 'Plan de trabajo del cliente', funcion: FUNCION_DEL_PLAN, texto: String(b.F?.plan_texto ?? '') },
    { titulo: 'El brief de este entregable', funcion: FUNCION_DEL_BRIEF, texto: briefTexto },
    ...(ficha ? [ficha] : []),
  ].filter((c) => c.texto.trim())
  const imagenes: string[] = []
  const partes: string[] = []
  const agregar = (url: string | undefined, rotulo: string): string => {
    if (!url || imagenes.length >= MAX_IMAGENES_DE_LA_SEGUNDA_MIRADA) return ''
    imagenes.push(url)
    return `(imagen ${imagenes.length}: ${rotulo})`
  }
  const pi = datos(e, ARTEFACTO_PROPUESTAS_IMAGEN) as unknown as PropuestasDeImagen | undefined
  if (pi?.propuestas?.length) {
    const br = datos(e, ARTEFACTO_BORRADOR_IMAGEN) as unknown as BorradoresDeImagen | undefined
    for (const p of pi.propuestas) {
      const suyas = br?.propuestas?.find((x) => x.id === p.id)?.laminas ?? []
      const rotulos = suyas.map((l) => agregar(l.png_url ?? l.imagen_url, `propuesta ${p.id}, lámina ${l.n}`)).filter(Boolean)
      partes.push(`### Propuesta ${p.id} · ${p.nombre}\n${p.texto.trim()}${rotulos.length ? `\n${rotulos.join(' ')}` : ''}`)
    }
  }
  const pv = datos(e, 'propuestas_video') as unknown as PropuestasDelVideo | undefined
  if (pv?.propuestas?.length) {
    const ik = datos(e, 'imagenes_clave') as unknown as ImagenesClave | undefined
    for (const p of pv.propuestas) {
      const planos = ik?.propuestas?.find((x) => x.id === p.id)?.planos ?? []
      const rotulos = planos.map((pl) => agregar(pl.url, `propuesta ${p.id}, plano ${pl.n}`)).filter(Boolean)
      partes.push(`### Propuesta ${p.id} · ${p.nombre}\n${p.texto.trim()}${rotulos.length ? `\n${rotulos.join(' ')}` : ''}`)
    }
  }
  return { revisado: partes.join('\n\n'), imagenes, contexto }
}

// ───────────────────────── el paso
interface LoGuardado { opino?: boolean; informe?: InformeCreativo; enviadas?: Enviada[]; version_a?: string }

/** lo que contestó el creativo a las [O…] (sus líneas «RESPUESTA A LA JEFATURA O<n>: …», que la mesa guardó al cerrar) */
const respuestasDelCreativo = (e: Estado, enviadas: Enviada[]): RespuestaDelCreador[] => {
  const lineas = datos(e, 'mesa')?.respuestas_a_la_jefatura
  return enviadas.length ? leerRespuestas(enviadas, Array.isArray(lineas) ? lineas.filter((l): l is string => typeof l === 'string') : []) : []
}

/** ¿cabe la vuelta? la cuenta del costo de REHACER (mesa + borradores hasta este paso) y del margen de pasos (CC7 3 · CC6 10 y 11): la decide el paso, no el freno */
export function cabeLaVueltaDeLaSegundaMirada(pl: Plantilla, paso: Paso, e: Estado, costoDeEsta: number): { cabe: boolean; motivo?: string } {
  if (!quedaVueltaDelPaso(paso, e)) return { cabe: false, motivo: 'sin_vuelta' }
  const iMesa = pl.pasos.findIndex((x) => x.clave === 'mesa')
  if (!(iMesa >= 0 && e.pasos_ejecutados + (pl.pasos.length - iMesa) < pl.pasos.length + pl.limites.margen)) return { cabe: false, motivo: 'tope_de_pasos' }
  if (!cabeLaVuelta(pl, { ...e, gasto_usd: e.gasto_usd + costoDeEsta }, costoDeVolver(pl, paso))) return { cabe: false, motivo: 'tope' }
  return { cabe: true }
}

export async function correrSegundaMirada(P: Pick<Puertos, 'revisor'>, enc: Encargo, pl: Plantilla, paso: Paso): Promise<{ res: ResultadoDePaso; gastos: NonNullable<Cambios['gastos']> }> {
  const e = enc.estado_del_motor
  const antes = datos(e, ARTEFACTO_SEGUNDA_MIRADA) as LoGuardado | undefined
  const m = materialDeLaPropuesta(e)
  // UNA sola vez (CC7 4): se decide por lo ya guardado en el encargo, no por la memoria del paso
  if (antes?.opino) {
    const enviadas = antes.enviadas ?? []
    return { res: { costo_usd: 0, artefacto: { ...antes, ya_opino: true, vuelve_a_la_mesa: false, aviso_a_la_mesa: undefined, respuestas_del_creativo: respuestasDelCreativo(e, enviadas), version_despues: m.revisado } }, gastos: [] }
  }
  // en ensayo NUNCA se llama al proveedor (CC7 4): queda dicho y la pieza sigue
  if (enc.dry_run) return { res: { costo_usd: 0, artefacto: { opino: true, simulado: true, sin_revision: true, motivo: 'ensayo: no se llama a GPT', version_a: m.revisado, imagenes: m.imagenes, vuelve_a_la_mesa: false } }, gastos: [] }
  if (!m.revisado.trim()) return { res: { costo_usd: 0, artefacto: { opino: true, sin_revision: true, motivo: 'no hay propuestas que mirar', vuelve_a_la_mesa: false } }, gastos: [] }
  const pedido0 = armarPedidoAlRevisor({ pregunta: PREGUNTA_AL_REVISOR, titulo_de_lo_revisado: 'Las propuestas (como le llegan al dueño, antes de producir)', revisado: m.revisado, contexto: m.contexto, imagenes: m.imagenes })
  const texto = `${pedido0.texto}\n\n${PEDIDO_CREATIVO}`
  const rv = await P.revisor({ texto, imagenes_urls: pedido0.imagenes, dry_run: false, client_id: enc.client_id, ref_id: enc.id, n: e.pasos_ejecutados })
  // si GPT falla, la pieza sigue (CC6 12): se guarda el motivo, sin vuelta
  if (!rv.ok) {
    const costo = rv.costo_usd ?? 0
    return { res: { costo_usd: costo, artefacto: { opino: true, sin_revision: true, motivo: rv.error, intentos: rv.intentos ?? [], version_a: m.revisado, vuelve_a_la_mesa: false } }, gastos: costo > 0 ? [{ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: costo, base: 'usage' }] : [] }
  }
  const gastos: NonNullable<Cambios['gastos']> = [{ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: rv.costo_usd, base: 'usage' }]
  const efectivo = rv.modelo_efectivo ?? null
  const informe = leerInformeCreativo(rv.texto, { contexto: m.contexto, version_a: m.revisado, imagenes: pedido0.imagenes })
  const obs = informe.observaciones
  const c = obs.length ? cabeLaVueltaDeLaSegundaMirada(pl, paso, e, rv.costo_usd) : { cabe: false }
  const vuelve = obs.length > 0 && c.cabe
  const enviadas: Enviada[] = vuelve ? obs.map((o) => ({ id: o.id, texto: o.que, dura: false })) : []
  return {
    res: {
      costo_usd: rv.costo_usd,
      artefacto: {
        opino: true, opinion: rv.texto, modelo: rv.modelo, modelo_efectivo: efectivo, intentos: rv.intentos ?? [], informe, resumen: resumenDelDoctor(informe, efectivo),
        huellas: m.contexto.map((x) => ({ titulo: x.titulo, sha256: huella(x.texto) })), version_a: m.revisado, imagenes: pedido0.imagenes,
        enviadas, vuelve_a_la_mesa: vuelve, ...(vuelve ? { aviso_a_la_mesa: bloqueParaElCreativo(obs).join('\n') } : {}),
        ...(obs.length && !vuelve ? { sin_vuelta: c.motivo ?? 'sin_vuelta' } : {}),
      },
    },
    gastos,
  }
}

/** ¿ya opinó el segundo doctor en la propuesta? (la `jefatura` del render no lo vuelve a llamar) */
export const segundaMiradaYaDada = (e: Estado): boolean => (datos(e, ARTEFACTO_SEGUNDA_MIRADA) as LoGuardado | undefined)?.opino === true
