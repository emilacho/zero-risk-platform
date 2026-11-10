/**
 * GET /api/direccion/decisiones · TODO lo que espera la firma del dueño, unificado y ordenado por urgencia: lo que vence primero arriba; lo que no vence, por antigüedad.
 * Fuentes: compuerta del plan (si la tabla existe) · bandeja (`hitl_queue` pending, todos sus tipos: ninguno se esconde) · preguntas al dueño · preguntas y firmas de finanzas.
 * Se omiten clientes de práctica y dados de baja, y lo dice (`omitidas`).
 */
import { planEsperaAlManual } from '../manual/manual-primero'
import { TOPE_REESCRITURA_USD } from '../oficina/tablero/plan'
import { barrerTexto } from '../../../scripts/ops/barrer-voseo.mjs'
import { esObjeto, estaCompleto, leer, leerClientes, sinSecretos, texto, type Contexto, type Fila, type Fuente } from './comun'
import { AL_EDITAR_LA_FIRMA, DESTRABA_CORTO_DE_LA_FIRMA, DESTRABA_DE_LA_FIRMA, PARA_QUE_CORTO_DE_LA_FIRMA, cifrasDelBloque, leerLoQueSeFirma, paraQueDeLaFirma, sePuedeEditar, type CifraDeFirma, type LoQueSeFirma } from './decisiones-firma'
import { leerPlanesVigentes, motivoDeReemplazo } from './decisiones-reemplazadas'
import { DESTRABA_CAMPANA_DETENIDA, DESTRABA_CORTO_CAMPANA_DETENIDA, PARA_QUE_CAMPANA_DETENIDA, PARA_QUE_CORTO_CAMPANA_DETENIDA, TITULO_CAMPANA_DETENIDA, leerCampanasDetenidas, type CampanaDetenida } from './decisiones-campanas'
import { conFicha, type FichaDeDecision } from './decisiones-ficha'
import { alertaDe, claveDeAlerta, contadoresDeAlertas, leerRevisadas, type AlertaDeDecision } from './decisiones-alerta'
import { DIAS_DEL_REGISTRO, ESTADOS_DE_PLAN_QUE_CORRIO, MAX_INTENTOS_DE_DESPERTAR, DESTRABA_CORTO_DE_LA_PAUSA, PARA_QUE_CORTO_DE_LA_PAUSA, PARA_QUE_DE_LA_PAUSA, TITULO_NO_VOLVIO, TOPE_DEL_REGISTRO, destrabaDeLaPausa, encargoDeLaEspera, leerContestadas, loDescartoElDueno, leerPreguntasDeEncargos, motivoDeNoVolver, noVolvio, temaNormal, yaLoSuperoOtroPlan, type AccionDeDecision, type LecturaDelRegistro } from './decisiones-registro'

export type TipoDecision = 'plan' | 'gran_idea' | 'pieza' | 'revision' | 'pregunta_al_dueno' | 'pregunta_de_finanzas' | 'firma_de_finanzas'
export interface Decision {
  id: string
  tipo: TipoDecision
  /** el tipo tal como está en la fuente */
  subtipo: string
  fuente: string
  client_id: string | null
  cliente: string | null
  /** lo que lee el dueño: lenguaje claro, en tuteo y sin códigos */
  titulo: string
  /** el título como lo guardó la fuente, con sus códigos */
  titulo_interno: string
  desde: string | null
  vence: string | null
  vencida: boolean
  prioridad: string | null
  /** dónde se decide: pantalla del panel y/o acción del tablero. null = hoy no se decide desde el panel */
  decidir: { ruta: string | null; accion: string | null }
  /** lo que cuesta decidir, si se sabe. null = no gasta o no se conoce: lo aclara `costo_nota` */
  costo_usd: number | null
  costo_nota: string | null
  /** 04-nov · pedido de CC5. Opcionales: lo que no se sabe no viene, nunca se inventa */
  /** lo que el tablero puede ofrecer aquí. [] = esta tarjeta solo avisa. Sin el campo: se decide en su panel */
  permite?: AccionDeDecision[]
  pregunta_de?: { oficina: string; agente: string | null }
  /** 06-nov · el supuesto que propuso la oficina: con él, el dueño puede «asumir» */
  supuesto?: string
  para_que?: string
  destraba?: string
  /** 09-nov · los mismos en una o dos palabras, para el frente de la tarjeta. Solo vienen junto a su largo, y los escribe la oficina que crea la decisión (nunca un corte). Sin ellos, el tablero muestra la primera frase */
  para_que_corto?: string
  destraba_corto?: string
  /** true = un trabajo está parado por esto. false = consta que no. Sin el campo: no se pudo saber */
  detiene?: boolean
  /** el dueño ya contestó y el plan no volvió a arrancar: por eso esta decisión volvió a la lista */
  volvio?: { motivo: string }
  /** 05-nov · firma: qué se firma. Sin cifras legibles no viene, y el tablero no ofrece firmar */
  cifras?: CifraDeFirma[]
  /** los hallazgos críticos que siguen abiertos, en palabras de la oficina */
  criticos?: string[]
  /** qué pasa si cambia una cifra. Solo viene si se puede editar */
  al_editar?: string
  /** 09-nov · C · la campaña detenida: su motivo (interno), su espera y qué pasa al vencer */
  campana?: CampanaDetenida
  /** 09-nov · T0 de la ficha única: la misma decisión en el contrato `FichaDeDecision` v1 (al lado de los campos de hoy, que siguen). null = llegó mal armada: lo dice `ficha_problemas` */
  ficha?: FichaDeDecision | null
  ficha_problemas?: string[]
  /** 10-nov · la decisión como alerta: Nueva o Revisada (la marca «✓ Revisar» de Emilio, en `alertas_vistas`). `estado: null` = no se pudo leer */
  alerta?: AlertaDeDecision
}

const TOPE = 200
const TIPOS_HITL: Record<string, { tipo: TipoDecision; ruta: string | null; accion: string | null }> = {
  content_piece_review: { tipo: 'pieza', ruta: '/piezas', accion: null },
  concepto_review: { tipo: 'gran_idea', ruta: '/piezas', accion: null },
  plan_con_pendientes: { tipo: 'plan', ruta: '/nuevo', accion: 'plan-aprobar' },
  palabra_del_dueno: { tipo: 'plan', ruta: '/nuevo', accion: null },
  confirm_competitor_list: { tipo: 'revision', ruta: null, accion: 'revision-resolver' },
  editor_escalation: { tipo: 'revision', ruta: null, accion: 'revision-resolver' },
}
/** 03-nov · la revisión que no trae ruta propia va al panel de su documento (`hitl_queue.documento`, calculada en la base) */
const RUTA_POR_DOCUMENTO: Record<string, string> = { manual: '/nuevo', plan: '/nuevo', pieza: '/piezas' }
export const SIN_FUENTE_DECISIONES = [
  { que: 'gastos por aprobar', motivo: 'ninguna tabla guarda un gasto a la espera de aprobación: hoy los gastos se confirman en el momento de cada acción' },
  { que: 'recados de la sala al dueño', motivo: 'el destino «dueño» de los recados está apagado: los recados van a herramientas y agentes' },
]
const COSTO_PLAN = `aprobar no gasta por sí mismo pero arranca el PDF y el brief; pedir cambios gasta hasta US$ ${TOPE_REESCRITURA_USD}`

const uuidDelPlan = (f: Fila): string | null => texto(f.output_id) ?? (esObjeto(f.payload) ? texto(f.payload.plan_id) : null)
const esEnsayo = (f: Fila): boolean => (esObjeto(f.payload) && f.payload.dry_run === true) || (esObjeto(f.metadata) && f.metadata.dry_run === true)

/**
 * 01-nov · firma de Emilio: el título que llega al dueño va en lenguaje claro y en tuteo. Quita códigos (P3, BRF-0001, versión 2, v2) y rótulos internos; el dato los conserva en `titulo_interno`.
 * El tuteo se corrige al leer porque hay preguntas guardadas de antes del arreglo en origen.
 */
export function tituloParaElDueno(crudo: string): string {
  const enTuteo = String((barrerTexto(crudo, { conPronombre: true }) as { texto?: unknown }).texto ?? crudo)
  const limpio = enTuteo
    .replace(/⚠️\s*REVISIÓN INCOMPLETA\s*·\s*/u, 'Revisión incompleta · ')
    .replace(/(^|·\s*)Aprobación\s*·\s*/u, '$1')
    .replace(/\bBRF-\d+\b/g, '')
    .replace(/,?\s*\bversión\s+\d+\b/giu, '')
    .replace(/\bv\d+\b/g, '')
    .replace(/\bP\d{1,2}[a-z]?\s*·\s*/g, '')
    .replace(/\bP\d{1,2}[a-z]?(?![\p{L}\d])/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/(·\s*){2,}/g, '· ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .replace(/\s+([:,·])/g, (_m, x: string) => (x === '·' ? ' ·' : x))
    .trim()
  return limpio || crudo
}

/** lo que vence primero arriba; después lo que no vence, de más viejo a más nuevo */
export function ordenarPorUrgencia(a: Pick<Decision, 'vence' | 'desde'>, b: Pick<Decision, 'vence' | 'desde'>): number {
  if (a.vence && b.vence) return a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0
  if (a.vence) return -1
  if (b.vence) return 1
  return String(a.desde ?? '9') < String(b.desde ?? '9') ? -1 : String(a.desde ?? '9') > String(b.desde ?? '9') ? 1 : 0
}

export async function leerDecisiones({ db, ahora }: Contexto) {
  const fuentes: Fuente[] = []
  const clientes = await leerClientes(db, fuentes)
  const hora = ahora().toISOString()
  const [compuertas, bandeja, preguntas, deFinanzas, tableros, enPausa, noVolvieron] = await Promise.all([
    leer(fuentes, 'plan_aprobaciones', db.from('plan_aprobaciones').select('id, client_id, plan_id, version, creado_en').eq('estado', 'pendiente').limit(TOPE), TOPE),
    leer(fuentes, 'hitl_queue', db.from('hitl_queue').select('id, client_id, output_id, type, documento, title, output_preview, priority, payload, metadata, created_at, expires_at').eq('status', 'pending').limit(TOPE), TOPE),
    // 06-nov · las preguntas al dueño viven en la plataforma (salieron del cerebro · firma de Emilio vía Lenovo)
    leer(fuentes, 'dueno_preguntas', db.from('dueno_preguntas').select('id, client_id, tema, pregunta, supuesto, creado_en, oficina, agente').eq('estado', 'pendiente').limit(TOPE), TOPE),
    leer(fuentes, 'finanzas_preguntas', db.from('finanzas_preguntas').select('id, client_id, clave, texto, creado_en').eq('estado', 'enviada').limit(TOPE), TOPE),
    leer(fuentes, 'finanzas_tableros', db.from('finanzas_tableros').select('id, client_id, version, creado_en, workflow_execution_id, entrada, bloque').eq('estado', 'sin_firma').eq('vigente', true).eq('dry_run', false).limit(TOPE), TOPE),
    // 04-nov · sin pedir el `sobre`: lleva el material del plan y pesa cientos de KB
    leer(fuentes, 'esperas_del_dueno', db.from('esperas_del_dueno').select('id, client_id, clave, creado_en').eq('tipo', 'finanzas').eq('estado', 'esperando').order('creado_en', { ascending: true }).limit(TOPE), TOPE),
    // 04-nov · el plan que no volvió tras tu respuesta. Pasada la semana ya lo reemplazó otro o lo atendió una persona
    leer(fuentes, 'esperas_del_dueno', db.from('esperas_del_dueno').select('id, client_id, clave, estado, soltada_en, creado_en, actualizado_en, despertado, despertar_intentos, despertar_detalle, corrida:sobre->>corrida').eq('tipo', 'finanzas').eq('estado', 'soltada').gte('despertar_intentos', MAX_INTENTOS_DE_DESPERTAR).gte('creado_en', new Date(Date.parse(hora) - DIAS_DEL_REGISTRO * 86_400_000).toISOString()).limit(TOPE), TOPE),
  ])
  // 04-nov · qué preguntas pertenecen a cada pausa. Si esto no se lee, `detiene` no viene y el tablero usa lo que sabe: no afecta a `completo`, la lista sigue entera
  const delEncargo = await leerPreguntasDeEncargos(db, [], enPausa.map((p) => encargoDeLaEspera(p.clave)).filter((x): x is string => !!x)).catch(() => new Map<string, { id: string | null; tema: string }[]>())
  const pausaDelCliente = new Map(enPausa.map((p) => [String(p.client_id), delEncargo.get(encargoDeLaEspera(p.clave) ?? '') ?? null]))
  const esDeLaPausa = (p: Fila): boolean | null => {
    if (!pausaDelCliente.has(String(p.client_id))) return false
    const qs = pausaDelCliente.get(String(p.client_id))
    return qs ? qs.some((q) => q.id === String(p.id) || temaNormal(q.tema) === temaNormal(p.tema)) : null
  }
  const faltanDe = (client: unknown) => preguntas.filter((p) => String(p.client_id) === String(client) && esDeLaPausa(p) === true).length
  const destrabaDe = (client: unknown) => { const n = faltanDe(client); return n > 0 ? { destraba: destrabaDeLaPausa(n), destraba_corto: DESTRABA_CORTO_DE_LA_PAUSA } : {} }
  const FINANCIERA = { oficina: 'financiera', agente: null }
  const loQueSeFirma = (t: Fila) => {
    const f = firmas.get(String(t.id)), editar = sePuedeEditar(t), cifras = cifrasDelBloque(t.bloque, f?.unidad ?? null, editar)
    return { permite: (editar ? ['aceptar', 'editar'] : ['aceptar']) as AccionDeDecision[], ...(editar ? { al_editar: AL_EDITAR_LA_FIRMA } : {}), para_que: paraQueDeLaFirma(f?.abiertos), para_que_corto: PARA_QUE_CORTO_DE_LA_FIRMA, destraba: DESTRABA_DE_LA_FIRMA, destraba_corto: DESTRABA_CORTO_DE_LA_FIRMA, detiene: false, ...(cifras.length ? { cifras } : {}), ...(f?.criticos.length ? { criticos: f.criticos } : {}) }
  }
  // 05-nov · corrección de Lenovo: qué se firma. Si esto no se lee, un texto que vale en todos los casos: no afecta a `completo`
  const firmas = tableros.length ? await leerLoQueSeFirma(db, tableros) : new Map<string, LoQueSeFirma>()
  // 05-nov · corrección de CC7: la tarjeta no se puede quitar a mano, así que se va sola cuando otro plan corrió. Si esto no se lee, se queda: mejor un aviso de más que uno escondido
  const corridasDeSueltas = noVolvieron.length ? await leer([], 'plan_corridas', db.from('plan_corridas').select('client_id, corrida, estado, espera_desde').in('client_id', [...new Set(noVolvieron.map((e) => String(e.client_id)))]).in('estado', [...ESTADOS_DE_PLAN_QUE_CORRIO]).order('espera_desde', { ascending: false }).limit(TOPE), TOPE) : []
  const sueltas = noVolvieron.filter((e) => noVolvio(e, corridasDeSueltas.find((c) => String(c.client_id) === String(e.client_id) && c.corrida === e.corrida) ?? null, Date.parse(hora)))
  const noVolvieronVigentes = sueltas.filter((e) => !yaLoSuperoOtroPlan(e, corridasDeSueltas))
  const crudas: Omit<Decision, 'cliente' | 'vencida' | 'titulo_interno'>[] = []
  // 01-nov · firma de Emilio: solo lo vigente pide firma. El reloj las cierra; aquí no se muestran aunque el reloj no haya pasado. Si los planes no se leen, se muestra todo.
  const vigentes = await leerPlanesVigentes(db, [...new Set([...bandeja, ...compuertas].map((h) => texto(h.client_id)).filter((c): c is string => !!c))]).catch(() => null)
  let reemplazadas = 0
  const planesConCompuerta = new Set(compuertas.map((c) => String(c.plan_id)))
  for (const c of compuertas) {
    // 05-nov · corrección de Lenovo: un plan que ya superó otro no pide firma. Sin plan vigente conocido se muestra
    const vigente = vigentes?.get(String(c.client_id))
    if (vigente && vigente.id !== String(c.plan_id)) { reemplazadas++; continue }
    crudas.push({ id: String(c.plan_id), tipo: 'plan', subtipo: 'compuerta', fuente: 'plan_aprobaciones', client_id: texto(c.client_id), titulo: `Plan de 90 días, versión ${Number(c.version) || 1}: espera tu decisión`, desde: texto(c.creado_en), vence: null, prioridad: null, decidir: { ruta: '/nuevo', accion: 'plan-aprobar' }, costo_usd: null, costo_nota: COSTO_PLAN, destraba: 'Al aprobar arrancan el PDF y el brief.', destraba_corto: 'PDF y brief', detiene: true })
  }
  let ensayos = 0
  for (const h of bandeja) {
    if (esEnsayo(h)) { ensayos++; continue }
    if (vigentes && motivoDeReemplazo(h, vigentes)) { reemplazadas++; continue }
    const subtipo = String(h.type ?? 'sin_tipo')
    const plan = uuidDelPlan(h)
    // el mismo plan no se pide dos veces: `plan-aprobar` resuelve también su nota de la bandeja
    if (subtipo === 'plan_con_pendientes' && plan && planesConCompuerta.has(plan)) continue
    const m = TIPOS_HITL[subtipo] ?? { tipo: 'revision' as const, ruta: null, accion: null }
    crudas.push({ id: String(h.id), tipo: m.tipo, subtipo, fuente: 'hitl_queue', client_id: texto(h.client_id), titulo: sinSecretos(h.title ?? h.output_preview, 300) ?? `Revisión pendiente (${subtipo})`, desde: texto(h.created_at), vence: texto(h.expires_at), prioridad: texto(h.priority), decidir: { ruta: m.ruta ?? RUTA_POR_DOCUMENTO[String(h.documento)] ?? null, accion: m.accion }, costo_usd: null, costo_nota: m.tipo === 'plan' ? 'aprobar no gasta por sí mismo' : null })
  }
  for (const p of enPausa) crudas.push({ id: String(p.id), tipo: 'pregunta_de_finanzas', subtipo: 'plan_en_pausa', fuente: 'esperas_del_dueno', client_id: texto(p.client_id), titulo: 'El plan está en pausa: la oficina financiera espera tus respuestas, que están en esta lista', desde: texto(p.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null, permite: [], pregunta_de: FINANCIERA, para_que: PARA_QUE_DE_LA_PAUSA, para_que_corto: PARA_QUE_CORTO_DE_LA_PAUSA, ...destrabaDe(p.client_id), detiene: true })
  for (const e of noVolvieronVigentes) crudas.push({ id: String(e.id), tipo: 'pregunta_de_finanzas', subtipo: 'plan_no_volvio', fuente: 'esperas_del_dueno', client_id: texto(e.client_id), titulo: TITULO_NO_VOLVIO, desde: texto(e.soltada_en) ?? texto(e.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null, permite: [], pregunta_de: FINANCIERA, detiene: true, volvio: { motivo: motivoDeNoVolver(e) } })
  for (const p of preguntas) {
    const oficina = texto(p.oficina), dePausa = esDeLaPausa(p), supuesto = texto(p.supuesto)
    crudas.push({
      id: String(p.id), tipo: 'pregunta_al_dueno', subtipo: String(p.tema ?? 'pregunta'), fuente: 'dueno_preguntas', client_id: texto(p.client_id), titulo: sinSecretos(p.pregunta, 300) ?? String(p.tema ?? 'Pregunta al dueño'), desde: texto(p.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null,
      // «asumir» solo si la oficina propuso un supuesto: el dueño acepta ese, nunca uno inventado
      permite: supuesto ? ['responder', 'asumir', 'descartar'] : ['responder', 'descartar'],
      ...(supuesto ? { supuesto } : {}),
      ...(oficina ? { pregunta_de: { oficina, agente: texto(p.agente) } } : {}),
      ...(dePausa === null ? {} : { detiene: dePausa }),
      ...(dePausa ? { para_que: PARA_QUE_DE_LA_PAUSA, para_que_corto: PARA_QUE_CORTO_DE_LA_PAUSA, ...destrabaDe(p.client_id) } : {}),
    })
  }
  for (const p of deFinanzas) crudas.push({ id: String(p.id), tipo: 'pregunta_de_finanzas', subtipo: String(p.clave ?? 'pregunta'), fuente: 'finanzas_preguntas', client_id: texto(p.client_id), titulo: sinSecretos(p.texto, 300) ?? 'Pregunta de la oficina financiera', desde: texto(p.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null, permite: [], pregunta_de: FINANCIERA })
  // 09-nov · C · las campañas que la cadena dejó esperando a una persona. Vencen con su espera: arriba si la espera vence pronto
  for (const { fila: c, campana } of await leerCampanasDetenidas(db, fuentes)) crudas.push({ id: String(c.id), tipo: 'plan', subtipo: 'campana_necesita_humano', fuente: 'cadena_campanas', client_id: texto(c.client_id), titulo: TITULO_CAMPANA_DETENIDA, desde: texto(c.desde) ?? texto(c.actualizada_en), vence: campana.espera?.vence_en ?? null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: 'avisar no gasta; reabrir tampoco, y lo que sigue gasta con sus topes', permite: [], detiene: true, para_que: PARA_QUE_CAMPANA_DETENIDA, para_que_corto: PARA_QUE_CORTO_CAMPANA_DETENIDA, destraba: DESTRABA_CAMPANA_DETENIDA, destraba_corto: DESTRABA_CORTO_CAMPANA_DETENIDA, campana })
  for (const t of tableros) crudas.push({ id: String(t.id), tipo: 'firma_de_finanzas', subtipo: 'tablero_sin_firma', fuente: 'finanzas_tableros', client_id: texto(t.client_id), titulo: `Tablero financiero, versión ${Number(t.version) || 1}: espera tu firma`, desde: texto(t.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: 'firmar-tablero' }, costo_usd: null, costo_nota: null, pregunta_de: FINANCIERA, ...loQueSeFirma(t) })

  const omitidas = { clientes_de_practica: 0, clientes_de_baja: 0, ensayos, reemplazadas, esperan_el_manual: 0, planes_ya_superados: sueltas.length - noVolvieronVigentes.length }
  // 3-nov · firma de Emilio: un plan no pide firma antes de su manual. Si el manual no se puede leer, se muestra: mejor una firma de más que una escondida; la puerta del plan igual la frena
  const clientesConPlan = [...new Set(crudas.filter((d) => d.tipo === 'plan' && d.client_id).map((d) => d.client_id as string))]
  const lecturas = await Promise.all(clientesConPlan.map(async (c) => [c, await planEsperaAlManual(db, c).catch(() => ({ ok: false as const, error: 'lectura' }))] as const))
  const esperanElManual = new Set(lecturas.filter(([, l]) => l.ok && l.espera).map(([c]) => c))
  const decisiones: Decision[] = []
  for (const d of crudas) {
    const c = d.client_id ? clientes.get(d.client_id) : undefined
    if (c?.practica) { omitidas.clientes_de_practica++; continue }
    if (c?.de_baja) { omitidas.clientes_de_baja++; continue }
    if (d.tipo === 'plan' && d.client_id && esperanElManual.has(d.client_id)) { omitidas.esperan_el_manual++; continue }
    decisiones.push(conFicha({ ...d, titulo: tituloParaElDueno(d.titulo), titulo_interno: d.titulo, cliente: c?.nombre ?? null, vencida: !!d.vence && d.vence < hora }))
  }
  decisiones.sort(ordenarPorUrgencia)
  // 10-nov · Nueva o Revisada. Fuentes aparte: si la libreta falla, la lista de pendientes no se entera y el estado sale null
  const fuentesDeAlertas: Fuente[] = []
  const marcas = await leerRevisadas(db, decisiones.map(claveDeAlerta), fuentesDeAlertas).catch(() => null)
  for (const d of decisiones) d.alerta = alertaDe(d, marcas)
  // 04-nov · lo ya contestado y qué hizo el sistema. Tiene sus propias fuentes: si falla, `registro_completo` lo dice y la lista de pendientes no se entera
  const fuentesDePreguntas: Fuente[] = []
  const desde = new Date(Date.parse(hora) - DIAS_DEL_REGISTRO * 86_400_000).toISOString()
  const COLS_RESUELTA = 'id, client_id, tema, pregunta, oficina, estado, creado_en, decidido_en, motivo, ficha_ref'
  const [respondidas, descartadas] = await Promise.all([
    leer(fuentesDePreguntas, 'dueno_preguntas', db.from('dueno_preguntas').select(COLS_RESUELTA).in('estado', ['respondida', 'asumida']).gte('decidido_en', desde).order('decidido_en', { ascending: false }).limit(TOPE_DEL_REGISTRO), TOPE_DEL_REGISTRO),
    leer(fuentesDePreguntas, 'dueno_preguntas', db.from('dueno_preguntas').select(COLS_RESUELTA).in('estado', ['descartada', 'obsoleta']).gte('decidido_en', desde).order('decidido_en', { ascending: false }).limit(TOPE_DEL_REGISTRO), TOPE_DEL_REGISTRO),
  ])
  const registro: LecturaDelRegistro = await leerContestadas(db, hora, clientes, { respondidas, descartadas, fuentes: fuentesDePreguntas }).catch(() => ({ contestadas: [], fuentes: fuentesDePreguntas, completo: false }))
  const contestadas = registro.contestadas.map((c) => ({ ...c, titulo: tituloParaElDueno(c.titulo) }))
  return { ok: true, generado_en: hora, completo: estaCompleto(fuentes), total: decisiones.length, decisiones, omitidas, fuentes, sin_fuente: SIN_FUENTE_DECISIONES, contestadas, registro_completo: registro.completo, fuentes_del_registro: registro.fuentes, alertas_completo: marcas !== null, fuentes_de_alertas: fuentesDeAlertas, contadores: contadoresDeAlertas(decisiones, marcas !== null, contestadas.length, registro.completo) }
}

/**
 * 05-nov · de estos temas, los que el dueño descartó DESPUÉS de abrirse la espera (`desde`): con todos descartados, la pausa del plan se levanta. Una lectura fallida LANZA.
 * Lo archivado antes no responde a esta pregunta, y lo que archivó el sistema no es del dueño: con cualquiera de los dos, el plan seguiría sin que Emilio alcanzara a contestar.
 */
export async function temasDescartadosPorElDueno(db: { from(tabla: string): any }, client_id: string, temas: string[], desde: string): Promise<string[]> {
  if (!temas.length) return []
  if (!Number.isFinite(Date.parse(desde))) throw new Error('no sé desde cuándo espera el plan: no se puede decir qué descartó el dueño')
  const r = await db.from('dueno_preguntas').select('tema,estado,motivo').eq('client_id', client_id).in('estado', ['descartada', 'obsoleta']).in('tema', temas).gte('decidido_en', desde)
  if (r.error) throw new Error(`no pude leer las preguntas descartadas: ${r.error.message}`)
  // «descartada» la cerró el dueño; «obsoleta» solo cuenta si el motivo es suyo (las migradas del cerebro)
  return ((r.data as Array<{ tema: unknown; estado: unknown; motivo: unknown }> | null) ?? []).filter((x) => x.estado === 'descartada' || loDescartoElDueno(x.motivo)).map((x) => String(x.tema))
}
