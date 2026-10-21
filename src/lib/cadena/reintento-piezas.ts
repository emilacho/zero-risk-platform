/**
 * EL REINTENTO SISTÉMICO DE PIEZAS (CC#2 · 21-oct · firma de Emilio 16:36: «reintento automático de piezas que fallaron, sistémico, y aviso en #oficina-creativa si una sigue fallando»).
 * Hallazgo de la tercera prueba: el sobre `producir` de un brief se acepta UNA vez (llave `parte:brief:producir`); si la oficina lo rechaza (409 `plantilla_inactiva`, un corte, un paso que murió) o la pieza nunca llega a
 * encargo, NADA vuelve a pedirla: re-emitirlo da «duplicado». Este módulo cierra ese hueco para cualquier cliente:
 *   · mira los partes de las campañas ACTIVAS con `autoproducir`; por cada brief cuya familia la oficina SÍ abriría hoy y que no tiene encargo, pasado un plazo re-emite el sobre con una llave NUEVA de intento
 *     (`parte:brief:producir:r<n>`), a lo sumo 3 veces, espaciadas (15 · 45 · 120 min), y tras el 3.º sin fruto avisa UNA vez en el hilo de #oficina-creativa (nunca por mensaje directo);
 *   · NACE APAGADO: solo corre con `cadena_config.reintento_piezas === true` (el booleano; cualquier otra cosa = apagado). Lo enciende el papel de orden de disparo, no este código;
 *   · NUNCA llama a un modelo ni despacha: solo deja sobres en la sala (como `autoproducir`), y la sala + la oficina deciden. Respeta el freno de gasto §150 (cliente al techo ⇒ no sale nada y NO se gasta un intento);
 *   · CAP explícito (canon de loops): `MAX_REINTENTOS` por brief, también cuando la sala rechaza el sobre (un rechazo consume el intento: nunca hay reintento indefinido); el aviso sale una sola vez;
 *   · IDEMPOTENTE: la libreta de intentos vive en `cadena_config.reintentos_piezas`; la llave de cada intento es determinista, así que repetir la pasada no duplica (la sala contesta «duplicado»);
 *   · «en seco» (`ejecutar: false`) calcula el plan completo SIN emitir, SIN anotar la libreta y SIN avisar: así se revisa a US$ 0 qué pasaría.
 * Alcance: solo briefs con encargo AUSENTE. Un encargo que existe (cualquier estado) ya tiene dueño: el vigía de la oficina lo reanuda o lo cierra.
 */
import { decidirPuerta, TARGET_STEP_PRODUCIR, type ConfigDeOficina } from '../oficina/sobre'
import { llaveDeReintento, sobresDeProducir, type BriefDeParte, type ResultadoDeEmision, type SobreDeProducir } from './autoproducir'

export const MAX_REINTENTOS = 3
/** minutos de espera ANTES de la etapa n (n = intentos ya hechos): 0 → desde que se creó el parte · 1 y 2 → desde el intento anterior · 3 → plazo final antes de dar la pieza por perdida */
export const ESPERAS_MIN: readonly number[] = [15, 45, 120, 60]
/** un parte más viejo que esto ya no se reintenta (su fecha de publicación pasó) */
export const DIAS_MAXIMOS_DE_UN_PARTE = 14
export const CLAVE_INTERRUPTOR = 'reintento_piezas'
export const CLAVE_LIBRETA = 'reintentos_piezas'

export interface ParteParaReintento { id: string; creado_en: string; valido: boolean; briefs: BriefDeParte[] }
export interface CampanaParaReintento { id: string; client_id: string; sala_ref: Record<string, unknown> | null }
export interface AnotacionDeIntentos { n: number; ultimo_en: string; avisado?: true }
export type Libreta = Record<string, AnotacionDeIntentos>

export interface PuertosDeReintento {
  ahora(): Date
  /** `cadena_config.reintento_piezas === true` */
  interruptor(): Promise<boolean>
  /** `cadena_config.estado_cadena === 'encendida'` */
  cadenaEncendida(): Promise<boolean>
  /** campañas `activa`, con `autoproducir === true` y NO de ensayo en seco */
  campanas(): Promise<CampanaParaReintento[]>
  partes(campana: CampanaParaReintento): Promise<ParteParaReintento[]>
  /** ids de brief que YA tienen un encargo real (dry_run falso) de este parte */
  briefsConEncargo(parteId: string): Promise<Set<string>>
  configOficina(): Promise<ConfigDeOficina>
  plantillaActiva(familia: string): Promise<boolean>
  /** fila_id → fecha y hora del calendario (la última versión de la campaña) */
  cuando(campanaId: string): Promise<ReadonlyMap<string, { fecha: string; hora: string | null }>>
  frenoDeGasto(clientId: string): Promise<{ bloqueado: boolean; motivo?: string }>
  emitirSobre(sobre: SobreDeProducir): Promise<ResultadoDeEmision>
  leerLibreta(): Promise<Libreta>
  escribirLibreta(l: Libreta): Promise<void>
  /** hilo de #oficina-creativa · NUNCA lanza */
  avisar(texto: string): Promise<void>
}

export type AccionDeReintento = 'llego' | 'sin_sala' | 'espera' | 'reintentar' | 'freno' | 'agotado' | 'ya_avisado'
export interface LineaDelPlan { parte_id: string; brief_id: string; fila_id: string | null; familia: string | null; accion: AccionDeReintento; intentos: number; faltan_min?: number; detalle?: string }
export interface ResultadoDelReintento {
  accion: 'apagado' | 'cadena_apagada' | 'vigilado' | 'en_seco'
  interruptor: boolean
  emitidos: number; duplicados: number; rechazados: number; avisados: number
  plan: LineaDelPlan[]
}

const minutosEntre = (a: string, b: Date): number => (b.getTime() - Date.parse(a)) / 60_000
const clave = (parteId: string, briefId: string): string => `${parteId}:${briefId}`

export function textoDelAviso(l: { fila_id: string | null; familia: string | null; parte_id: string; brief_id: string; intentos: number }): string {
  return `⚠️ No se pudo producir la pieza de la fila ${l.fila_id ?? 'sin fila'} (${l.familia ?? 'sin familia'}) después de ${l.intentos} reintento(s) automático(s). No se publica nada; el equipo técnico la revisa y, si hace falta, te pide una decisión. *(técnico · parte ${l.parte_id} · brief ${l.brief_id})*`
}

export async function reintentarPiezas(P: PuertosDeReintento, o: { ejecutar: boolean }): Promise<ResultadoDelReintento> {
  const vacio = (accion: ResultadoDelReintento['accion'], interruptor: boolean): ResultadoDelReintento => ({ accion, interruptor, emitidos: 0, duplicados: 0, rechazados: 0, avisados: 0, plan: [] })
  const interruptor = await P.interruptor()
  if (o.ejecutar && !interruptor) return vacio('apagado', false)
  if (o.ejecutar && !(await P.cadenaEncendida())) return vacio('cadena_apagada', interruptor)

  const ahora = P.ahora()
  const config = await P.configOficina()
  const libreta = await P.leerLibreta()
  const res = vacio(o.ejecutar ? 'vigilado' : 'en_seco', interruptor)
  let cambio = false
  const activas = new Map<string, boolean>()
  const plantillaActiva = async (f: string): Promise<boolean> => { if (!activas.has(f)) activas.set(f, await P.plantillaActiva(f)); return activas.get(f)! }

  for (const c of await P.campanas()) {
    const freno = o.ejecutar ? await P.frenoDeGasto(c.client_id) : { bloqueado: false as const, motivo: undefined }
    let cuando: ReadonlyMap<string, { fecha: string; hora: string | null }> | null = null
    for (const parte of await P.partes(c)) {
      if (!parte.valido || minutosEntre(parte.creado_en, ahora) > DIAS_MAXIMOS_DE_UN_PARTE * 1440) continue
      const conEncargo = await P.briefsConEncargo(parte.id)
      for (const b of parte.briefs) {
        const briefId = b.brief_id?.trim()
        if (!briefId) continue
        const base = { parte_id: parte.id, brief_id: briefId, fila_id: b.fila_id, familia: b.familia }
        if (conEncargo.has(briefId)) { res.plan.push({ ...base, accion: 'llego', intentos: libreta[clave(parte.id, briefId)]?.n ?? 0 }); continue }
        // ¿la oficina abriría este brief HOY? (la misma decisión de la puerta) y con la plantilla activa; si no, no es un fallo recuperable: es otra vía (pasarela)
        const dec = b.familia ? decidirPuerta({ parte_id: parte.id, brief_id: briefId, dry_run: false, familia: b.familia }, config, TARGET_STEP_PRODUCIR, c.client_id) : null
        if (!dec || dec.accion !== 'abrir' || !(await plantillaActiva(dec.familia))) { res.plan.push({ ...base, accion: 'sin_sala', intentos: 0 }); continue }

        const nota = libreta[clave(parte.id, briefId)]
        const n = nota?.n ?? 0
        const desde = n === 0 ? parte.creado_en : nota!.ultimo_en
        const espera = ESPERAS_MIN[Math.min(n, ESPERAS_MIN.length - 1)]
        const faltan = Math.max(0, Math.ceil(espera - minutosEntre(desde, ahora)))
        if (faltan > 0) { res.plan.push({ ...base, accion: 'espera', intentos: n, faltan_min: faltan }); continue }

        if (n >= MAX_REINTENTOS) {
          if (nota?.avisado) { res.plan.push({ ...base, accion: 'ya_avisado', intentos: n }); continue }
          res.plan.push({ ...base, accion: 'agotado', intentos: n })
          if (o.ejecutar) {
            await P.avisar(textoDelAviso({ ...base, intentos: n }))
            libreta[clave(parte.id, briefId)] = { ...nota!, avisado: true }
            cambio = true; res.avisados++
          }
          continue
        }
        if (freno.bloqueado) { res.plan.push({ ...base, accion: 'freno', intentos: n, detalle: freno.motivo }); continue }

        res.plan.push({ ...base, accion: 'reintentar', intentos: n })
        if (!o.ejecutar) continue
        cuando ??= await P.cuando(c.id)
        const corr = typeof c.sala_ref?._sala_correlation_id === 'string' ? (c.sala_ref._sala_correlation_id as string) : null
        const { sobres } = sobresDeProducir({ id: parte.id, client_id: c.client_id, valido: true, briefs: [{ ...b, brief_id: briefId }] }, { dry_run: false, correlation_id: corr, desde_worker: 'cadena-reintento-de-piezas', cuando })
        if (!sobres.length) continue
        const sobre: SobreDeProducir = { ...sobres[0], idempotency_key: llaveDeReintento(parte.id, briefId, n + 1) }
        let e: ResultadoDeEmision
        try { e = await P.emitirSobre(sobre) } catch (x) { e = { resultado: 'rechazado', detalle: x instanceof Error ? x.message : String(x) } }
        // el intento SE GASTA aunque la sala lo rechace: así el tope de 3 vale siempre (nunca un reintento sin fin)
        libreta[clave(parte.id, briefId)] = { n: n + 1, ultimo_en: ahora.toISOString(), ...(nota?.avisado ? { avisado: true as const } : {}) }
        cambio = true
        if (e.resultado === 'aceptado') res.emitidos++; else if (e.resultado === 'duplicado') res.duplicados++; else res.rechazados++
      }
    }
  }
  if (o.ejecutar && cambio) await P.escribirLibreta(libreta)
  return res
}
