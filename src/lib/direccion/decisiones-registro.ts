/**
 * LO QUE TU OFICINA ENSEÑA DE CADA DECISIÓN (04-nov · pedido de CC5, encargo de Lenovo a CC3). SOLO LECTURA: nada se guarda aparte.
 * El registro NO es una tabla nueva: se deduce de las filas que el sistema ya escribe y nunca borra. Así no puede contradecirlas ni quedarse sin escribir.
 * Enlaza: pregunta (`dueno_preguntas`, en la plataforma desde el 06-nov) → pausa (`buzon_respuestas` del encargo, en `finanzas_artefactos`) → espera (`esperas_del_dueno`) → corrida (`plan_corridas`).
 * Lo que no se sabe no se inventa: sin enlace, el registro termina en lo último que sí consta.
 * Las preguntas las lee `decisiones.ts`; aquí no se nombra ninguna tabla del cerebro. Las fichas no se leen: el texto de la respuesta queda en el cerebro (dominio de Cerebro).
 */
import { MARGEN_PARA_ARRANCAR_MIN, MAX_INTENTOS_DE_DESPERTAR, SILENCIO_TRAS_RESPONDER_MIN } from '../finanzas/conversa/pausa'
import { temaDe } from '../finanzas/conversa/buzon'
import { PLAN_DE_MARKETING } from '../nombres-del-sistema'
import { esObjeto, leer, sinSecretos, texto, type Db, type Fila, type Fuente } from './comun'

export type AccionDeDecision = 'aceptar' | 'editar' | 'responder' | 'asumir' | 'descartar'
export type EstadoDelPaso = 'pregunto' | 'respondiste' | 'asumiste' | 'firmaste' | 'descartaste' | 'guardado' | 'espera' | 'retomado' | 'terminado' | 'fallo'
export interface PasoDelRegistro { cuando: string | null; quien: 'oficina' | 'tu' | 'sistema'; estado: EstadoDelPaso; texto: string; cita?: string }
export type ResultadoDeContestada = 'guardada' | 'descartada' | 'firmada' | 'espera' | 'retomada' | 'terminada' | 'fallo'
export interface Contestada {
  id: string
  tipo: 'pregunta_al_dueno' | 'firma_de_finanzas'
  fuente: string
  client_id: string | null
  cliente: string | null
  titulo: string
  resuelta_en: string | null
  resultado: ResultadoDeContestada
  /** por qué falló, si falló */
  motivo: string | null
  registro: PasoDelRegistro[]
}

/** cuánto hacia atrás se muestra: los mismos 7 días de la antena */
export const DIAS_DEL_REGISTRO = 7
export const TOPE_DEL_REGISTRO = 50
const TOPE_DE_ARTEFACTOS = TOPE_DEL_REGISTRO * 4
const TOPE_DE_CITA = 300

export const PARA_QUE_DE_LA_PAUSA = `La oficina financiera lo necesita para pasarle sus cuentas al redactor del ${PLAN_DE_MARKETING}.`
/** 09-nov · «Uso» y «Desbloquea» de la pausa en dos o tres palabras, escritos por la oficina junto al largo (sea 1 o varias las que faltan). 10-nov · el plan con su nombre oficial */
export const PARA_QUE_CORTO_DE_LA_PAUSA = `Cuentas del ${PLAN_DE_MARKETING}`
export const DESTRABA_CORTO_DE_LA_PAUSA = `Sigue el ${PLAN_DE_MARKETING}`
export const TITULO_NO_VOLVIO = 'Contestaste, pero el plan no volvió a arrancar'
/** solo con preguntas por contestar: sin ellas el plan puede estar en el margen o esperando otra cosa, y eso no se promete */
export function destrabaDeLaPausa(faltan: number): string {
  return faltan === 1
    ? `El ${PLAN_DE_MARKETING} sigue apenas contestes.`
    : `El ${PLAN_DE_MARKETING} sigue cuando contestes las ${faltan} preguntas, o unos ${SILENCIO_TRAS_RESPONDER_MIN} minutos después de tu última respuesta.`
}

const OFICINAS: Record<string, string> = { financiera: 'La oficina financiera', finanzas: 'La oficina financiera', planeacion: 'La oficina de planeación', creativa: 'La oficina creativa', jefatura: 'La jefatura', marketing: 'El departamento de marketing', cerebro: 'El cerebro del cliente', portero: 'El cerebro del cliente', alta: 'La oficina de altas', onboarding: 'La oficina de altas' }
const nombreDeOficina = (o: string | null): string => (o ? OFICINAS[o.toLowerCase()] ?? `La oficina ${o.replace(/[-_]+/g, ' ')}` : 'Una oficina')

export { MAX_INTENTOS_DE_DESPERTAR }
export const encargoDeLaEspera = (clave: unknown): string | null => { const c = texto(clave); return c?.startsWith('finanzas:') ? c.slice('finanzas:'.length) : null }
export const temaNormal = (t: unknown): string => temaDe(String(t ?? '')).toLowerCase()
const claveDeTema = (client: unknown, tema: unknown): string => `${String(client)}|${temaNormal(tema)}`

/** las preguntas de cada encargo en pausa: la última versión de su `buzon_respuestas`. Lo que no se lea queda sin enlace: nunca se adivina */
export async function leerPreguntasDeEncargos(db: Db, fuentes: Fuente[], encargos: string[]): Promise<Map<string, { id: string | null; tema: string }[]>> {
  const salida = new Map<string, { id: string | null; tema: string }[]>()
  if (!encargos.length) return salida
  const filas = await leer(fuentes, 'finanzas_artefactos', db.from('finanzas_artefactos').select('encargo_id, version, contenido').eq('tipo', 'buzon_respuestas').in('encargo_id', encargos).order('version', { ascending: false }).limit(TOPE_DE_ARTEFACTOS), TOPE_DE_ARTEFACTOS)
  for (const f of filas) {
    const e = String(f.encargo_id)
    if (salida.has(e) || !esObjeto(f.contenido) || !Array.isArray(f.contenido.preguntas)) continue
    salida.set(e, (f.contenido.preguntas as unknown[]).filter(esObjeto).map((p) => ({ id: texto(p.pregunta_id), tema: String(p.clave ?? '') })))
  }
  return salida
}

const fechaDe = (v: unknown): number | null => { const t = Date.parse(String(v ?? '')); return Number.isNaN(t) ? null : t }
const creadaEn = (e: Fila): number => fechaDe(e.creado_en) ?? 0
const deMasNuevaAMasVieja = (a: Fila, b: Fila): number => creadaEn(b) - creadaEn(a) || String(b.id).localeCompare(String(a.id))
/** ¿la pausa seguía escuchando a esta hora? Soltada o reemplazada, ya no usa lo que llegue. Sin fecha de cierre no se afirma que sí */
const seguiaAbierta = (e: Fila, hora: number): boolean => e.estado === 'esperando' || hora <= (fechaDe(e.soltada_en) ?? fechaDe(e.actualizado_en) ?? -1)

/**
 * 05-nov · corrección de CC7. La pausa que usó esta respuesta, o ninguna: el mismo resultado en cualquier orden.
 * Una respuesta solo pertenece a una pausa abierta a esa hora; el tema no basta, porque se repite entre pausas y con preguntas sueltas.
 * Por id puede ser anterior a la pausa: se pregunta justo antes de guardarla, y «ya tenía las respuestas» la suelta enseguida.
 */
export function esperaDeLaRespuesta(respondidaEn: unknown, porId: Fila[], porTema: Fila[]): Fila | null {
  const hora = fechaDe(respondidaEn)
  if (hora === null) return null
  const enCurso = (e: Fila) => creadaEn(e) <= hora && seguiaAbierta(e, hora)
  const conId = [...porId].sort(deMasNuevaAMasVieja)
  return conId.find(enCurso) ?? [...conId].reverse().find((e) => creadaEn(e) > hora) ?? [...porTema].sort(deMasNuevaAMasVieja).find(enCurso) ?? null
}

/**
 * ¿esta espera ya agotó sus intentos sin que el plan vuelva? Antes de eso el vigía sigue reintentando: no es asunto del dueño todavía.
 * 05-nov · corrección de CC7 sobre #917: «recibió el pedido» no es «arrancó». Con `despertado` true y su corrida aún en pausa pasado el margen, el plan sigue parado.
 */
export function noVolvio(e: Fila, corrida: Fila | null, ahora: number): boolean {
  if (e.estado !== 'soltada' || Number(e.despertar_intentos ?? 0) < MAX_INTENTOS_DE_DESPERTAR) return false
  if (e.despertado === false) return true
  if (e.despertado !== true || corrida?.estado !== 'en_pausa') return false
  // el último intento escribe `actualizado_en` (`finanzas/conversa/esperas-supabase.ts`)
  const desde = fechaDe(e.actualizado_en)
  return desde !== null && ahora - desde >= MARGEN_PARA_ARRANCAR_MIN * 60_000
}
export const motivoDeNoVolver = (e: Fila): string => e.despertado === true ? 'El plan recibió el pedido, pero no arrancó: sigue en pausa.' : sinSecretos(e.despertar_detalle, TOPE_DE_CITA) ?? 'El plan no pudo volver a arrancar.'
/** los estados en que consta que un plan arrancó. `fallida` no: también cierra corridas que nunca salieron de la espera */
export const ESTADOS_DE_PLAN_QUE_CORRIO = ['corriendo', 'en_pausa', 'hecha'] as const
/** 05-nov · corrección de CC7: la pausa ya no detiene nada si después corrió otro plan del cliente, o si su propia corrida terminó */
export function yaLoSuperoOtroPlan(e: Fila, corridas: Fila[]): boolean {
  const desde = fechaDe(e.soltada_en) ?? fechaDe(e.creado_en)
  return corridas.some((c) => {
    if (String(c.client_id) !== String(e.client_id)) return false
    if (c.corrida === e.corrida) return c.estado === 'hecha'
    const inicio = fechaDe(c.espera_desde)
    return desde !== null && inicio !== null && inicio > desde && (ESTADOS_DE_PLAN_QUE_CORRIO as readonly unknown[]).includes(c.estado)
  })
}

/** qué le pasó al plan después de la respuesta. Los pasos son los que constan en la espera y en la corrida */
export function pasosDelPlan(espera: Fila | null, corrida: Fila | null, ahora: number): { pasos: PasoDelRegistro[]; resultado: ResultadoDeContestada | null; motivo: string | null } {
  if (!espera) return { pasos: [], resultado: null, motivo: null }
  const cuando = texto(espera.soltada_en) ?? texto(espera.actualizado_en)
  if (espera.estado === 'esperando') return { pasos: [{ cuando: null, quien: 'sistema', estado: 'espera', texto: 'El plan sigue en pausa: faltan respuestas o está corriendo el margen' }], resultado: 'espera', motivo: null }
  if (espera.estado === 'reemplazada') {
    const motivo = 'Otro plan reemplazó a este antes de usar tu respuesta.'
    return { pasos: [{ cuando, quien: 'sistema', estado: 'fallo', texto: motivo }], resultado: 'fallo', motivo }
  }
  if (noVolvio(espera, corrida, ahora)) {
    const motivo = motivoDeNoVolver(espera)
    return { pasos: [{ cuando, quien: 'sistema', estado: 'fallo', texto: TITULO_NO_VOLVIO, cita: motivo }], resultado: 'fallo', motivo }
  }
  if (espera.despertado !== true) return { pasos: [{ cuando, quien: 'sistema', estado: 'espera', texto: 'El plan todavía no vuelve a arrancar: el sistema lo sigue intentando' }], resultado: 'espera', motivo: null }
  // recibió el pedido y no arrancó todavía: el vigía lo revisa (#917)
  if (corrida?.estado === 'en_pausa') return { pasos: [{ cuando, quien: 'sistema', estado: 'espera', texto: 'El plan recibió tu respuesta, pero todavía no arranca: el sistema lo sigue intentando' }], resultado: 'espera', motivo: null }
  // sin ver su corrida solo consta que recibió el pedido
  const pasos: PasoDelRegistro[] = [{ cuando, quien: 'sistema', estado: 'retomado', texto: corrida ? 'El plan volvió a arrancar con tu respuesta' : 'El plan recibió tu respuesta; no consta todavía que haya arrancado' }]
  if (corrida?.estado === 'hecha') return { pasos: [...pasos, { cuando: texto(corrida.actualizado_en), quien: 'sistema', estado: 'terminado', texto: 'El plan terminó' }], resultado: 'terminada', motivo: null }
  if (corrida?.estado === 'fallida' || corrida?.estado === 'vencida') {
    const motivo = sinSecretos(corrida.motivo, TOPE_DE_CITA) ?? 'El plan no terminó.'
    return { pasos: [...pasos, { cuando: texto(corrida.actualizado_en), quien: 'sistema', estado: 'fallo', texto: 'El plan no terminó', cita: motivo }], resultado: 'fallo', motivo }
  }
  return { pasos, resultado: 'retomada', motivo: null }
}

/** con cambios, el registro dice qué propuso la oficina y qué firmaste */
function textoDeLaFirma(f: unknown): { texto: string; cita?: string } {
  const cambios = esObjeto(f) && Array.isArray(f.cambios) ? (f.cambios as unknown[]).filter(esObjeto) : []
  if (!cambios.length) return { texto: 'Firmaste' }
  const meta = esObjeto(f) && typeof f.meta_por_semana === 'number' && cambios.some((c) => c.clave === 'total_mes') ? ` · la meta de ventas por semana queda en ${Math.round(f.meta_por_semana * 100) / 100}` : ''
  return { texto: 'Firmaste con cambios', cita: cambios.map((c) => `${NOMBRE_DE_CIFRA[String(c.clave)] ?? 'Una cifra'}: la oficina propuso ${String(c.propuesto)}, firmaste ${String(c.firmado)}`).join(' · ') + meta }
}
const NOMBRE_DE_CIFRA: Record<string, string> = { meta_por_semana: 'Meta de ventas por semana', total_mes: 'Presupuesto total al mes' }

export interface LecturaDelRegistro { contestadas: Contestada[]; fuentes: Fuente[]; completo: boolean }
type ClienteVisto = { nombre?: string | null; practica?: boolean; de_baja?: boolean }

/** lo contestado en los últimos días. Una falla aquí nunca toca la lista de pendientes: tiene sus propias `fuentes` */
export async function leerContestadas(db: Db, hora: string, clientes: Map<string, ClienteVisto>, preguntas: { respondidas: Fila[]; descartadas: Fila[]; fuentes: Fuente[] }): Promise<LecturaDelRegistro> {
  const { respondidas, descartadas } = preguntas
  const fuentes: Fuente[] = [...preguntas.fuentes]
  const desde = new Date(Date.parse(hora) - DIAS_DEL_REGISTRO * 86_400_000).toISOString()
  const [firmas, esperas] = await Promise.all([
    leer(fuentes, 'finanzas_tableros', db.from('finanzas_tableros').select('id, client_id, version, creado_en, firmado_en, firma_con_cambios').eq('estado', 'firmado').eq('dry_run', false).gte('firmado_en', desde).order('firmado_en', { ascending: false }).limit(TOPE_DEL_REGISTRO), TOPE_DEL_REGISTRO),
    // sin pedir el `sobre` entero: lleva el material del plan y pesa cientos de KB. Sin ventana de fechas: una pausa vieja puede seguir abierta y recibir la respuesta de hoy
    leer(fuentes, 'esperas_del_dueno', db.from('esperas_del_dueno').select('id, client_id, clave, estado, creado_en, soltada_en, despertado, despertar_intentos, despertar_detalle, actualizado_en, corrida:sobre->>corrida').eq('tipo', 'finanzas').order('creado_en', { ascending: false }).limit(TOPE_DEL_REGISTRO), TOPE_DEL_REGISTRO),
  ])
  const delEncargo = await leerPreguntasDeEncargos(db, fuentes, esperas.map((e) => encargoDeLaEspera(e.clave)).filter((x): x is string => !!x))
  const corridas = [...new Set(esperas.map((e) => texto(e.corrida)).filter((x): x is string => !!x))]
  const filasDeCorrida = corridas.length ? await leer(fuentes, 'plan_corridas', db.from('plan_corridas').select('client_id, corrida, estado, motivo, actualizado_en').in('corrida', corridas).limit(TOPE_DEL_REGISTRO), TOPE_DEL_REGISTRO) : []
  const corridaDe = (e: Fila) => filasDeCorrida.find((c) => String(c.client_id) === String(e.client_id) && c.corrida === e.corrida) ?? null
  const esperasPorPregunta = new Map<string, Fila[]>(), esperasPorTema = new Map<string, Fila[]>()
  const anotar = (m: Map<string, Fila[]>, k: string, e: Fila) => m.set(k, [...(m.get(k) ?? []), e])
  for (const e of esperas) for (const q of delEncargo.get(encargoDeLaEspera(e.clave) ?? '') ?? []) {
    if (q.id) anotar(esperasPorPregunta, q.id, e)
    anotar(esperasPorTema, claveDeTema(e.client_id, q.tema), e)
  }

  const contestadas: Contestada[] = []
  const vivo = (c: unknown) => { const x = clientes.get(String(c)); return !x?.practica && !x?.de_baja }
  const nombre = (c: unknown) => clientes.get(String(c))?.nombre ?? null
  const pregunto = (p: Fila): PasoDelRegistro => ({ cuando: texto(p.creado_en), quien: 'oficina', estado: 'pregunto', texto: `${nombreDeOficina(texto(p.oficina))} preguntó` })
  for (const p of respondidas) {
    if (!vivo(p.client_id)) continue
    const cuando = texto(p.decidido_en), ficha = texto(p.ficha_ref), asumida = p.estado === 'asumida'
    const espera = esperaDeLaRespuesta(p.decidido_en, esperasPorPregunta.get(String(p.id)) ?? [], esperasPorTema.get(claveDeTema(p.client_id, p.tema)) ?? [])
    const plan = pasosDelPlan(espera, espera ? corridaDe(espera) : null, Date.parse(hora))
    contestadas.push({
      id: String(p.id), tipo: 'pregunta_al_dueno', fuente: 'dueno_preguntas', client_id: texto(p.client_id), cliente: nombre(p.client_id), titulo: sinSecretos(p.pregunta, 300) ?? String(p.tema ?? 'Pregunta'), resuelta_en: cuando, resultado: plan.resultado ?? 'guardada', motivo: plan.motivo,
      registro: [pregunto(p), { cuando, quien: 'tu', estado: asumida ? 'asumiste' : 'respondiste', texto: asumida ? 'Aceptaste el supuesto de la oficina' : 'Respondiste' }, ...(ficha ? [{ cuando, quien: 'sistema' as const, estado: 'guardado' as const, texto: 'Quedó guardada en el cerebro del cliente' }] : []), ...plan.pasos],
    })
  }
  for (const p of descartadas) {
    if (!vivo(p.client_id)) continue
    const cuando = texto(p.decidido_en), motivo = sinSecretos(p.motivo, TOPE_DE_CITA), tuya = p.estado === 'descartada' || loDescartoElDueno(motivo)
    contestadas.push({
      id: String(p.id), tipo: 'pregunta_al_dueno', fuente: 'dueno_preguntas', client_id: texto(p.client_id), cliente: nombre(p.client_id), titulo: sinSecretos(p.pregunta, 300) ?? String(p.tema ?? 'Pregunta'), resuelta_en: cuando, resultado: 'descartada', motivo: null,
      registro: [pregunto(p), { cuando, quien: tuya ? 'tu' : 'sistema', estado: 'descartaste', texto: tuya ? 'La descartaste' : 'Se archivó', ...(motivo ? { cita: motivo } : {}) }],
    })
  }
  for (const t of firmas) {
    if (!vivo(t.client_id)) continue
    const cuando = texto(t.firmado_en)
    contestadas.push({
      id: String(t.id), tipo: 'firma_de_finanzas', fuente: 'finanzas_tableros', client_id: texto(t.client_id), cliente: nombre(t.client_id), titulo: `Tablero financiero, versión ${Number(t.version) || 1}`, resuelta_en: cuando, resultado: 'firmada', motivo: null,
      registro: [{ cuando: texto(t.creado_en), quien: 'oficina', estado: 'pregunto', texto: 'La oficina financiera pidió tu firma' }, { cuando, quien: 'tu', estado: 'firmaste', ...textoDeLaFirma(t.firma_con_cambios) }],
    })
  }
  contestadas.sort((a, b) => String(b.resuelta_en ?? '').localeCompare(String(a.resuelta_en ?? '')))
  const recortada = contestadas.length > TOPE_DEL_REGISTRO
  return { contestadas: contestadas.slice(0, TOPE_DEL_REGISTRO), fuentes, completo: !recortada && fuentes.every((f) => (f.estado === 'ok' || f.estado === 'no_existe') && !f.truncado) }
}

/** Tu oficina escribe «Emilio la descartó en Tu oficina…». Lo demás es archivo del sistema («el dueño ya contestó…», «las preguntas dejaron Slack…») */
export const loDescartoElDueno = (motivo: unknown): boolean => typeof motivo === 'string' && /^Emilio\b/.test(motivo)
