/**
 * GET /api/direccion/decisiones · TODO lo que espera la firma del dueño, unificado y ordenado por urgencia: lo que vence primero arriba; lo que no vence, por antigüedad.
 * Fuentes: compuerta del plan (si la tabla existe) · bandeja (`hitl_queue` pending, todos sus tipos: ninguno se esconde) · preguntas al dueño · preguntas y firmas de finanzas.
 * Se omiten clientes de práctica y dados de baja, y lo dice (`omitidas`).
 */
import { TOPE_REESCRITURA_USD } from '../oficina/tablero/plan'
import { esObjeto, estaCompleto, leer, leerClientes, sinSecretos, texto, type Contexto, type Fila, type Fuente } from './comun'

export type TipoDecision = 'plan' | 'gran_idea' | 'pieza' | 'revision' | 'pregunta_al_dueno' | 'pregunta_de_finanzas' | 'firma_de_finanzas'
export interface Decision {
  id: string
  tipo: TipoDecision
  /** el tipo tal como está en la fuente */
  subtipo: string
  fuente: string
  client_id: string | null
  cliente: string | null
  titulo: string
  desde: string | null
  vence: string | null
  vencida: boolean
  prioridad: string | null
  /** dónde se decide: pantalla del panel y/o acción del tablero. null = hoy no se decide desde el panel */
  decidir: { ruta: string | null; accion: string | null }
  /** lo que cuesta decidir, si se sabe. null = no gasta o no se conoce: lo aclara `costo_nota` */
  costo_usd: number | null
  costo_nota: string | null
}

const TOPE = 200
const TIPOS_HITL: Record<string, { tipo: TipoDecision; ruta: string | null; accion: string | null }> = {
  content_piece_review: { tipo: 'pieza', ruta: '/piezas', accion: null },
  concepto_review: { tipo: 'gran_idea', ruta: '/piezas', accion: null },
  plan_con_pendientes: { tipo: 'plan', ruta: '/nuevo', accion: 'plan-aprobar' },
  confirm_competitor_list: { tipo: 'revision', ruta: null, accion: 'revision-resolver' },
  editor_escalation: { tipo: 'revision', ruta: null, accion: 'revision-resolver' },
}
export const SIN_FUENTE_DECISIONES = [
  { que: 'gastos por aprobar', motivo: 'ninguna tabla guarda un gasto a la espera de aprobación: hoy los gastos se confirman en el momento de cada acción' },
  { que: 'recados de la sala al dueño', motivo: 'el destino «dueño» de los recados está apagado: los recados van a herramientas y agentes' },
]
const COSTO_PLAN = `aprobar no gasta por sí mismo pero arranca el PDF y el brief; pedir cambios gasta hasta US$ ${TOPE_REESCRITURA_USD}`

const uuidDelPlan = (f: Fila): string | null => texto(f.output_id) ?? (esObjeto(f.payload) ? texto(f.payload.plan_id) : null)
const esEnsayo = (f: Fila): boolean => (esObjeto(f.payload) && f.payload.dry_run === true) || (esObjeto(f.metadata) && f.metadata.dry_run === true)

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
  const [compuertas, bandeja, preguntas, deFinanzas, tableros] = await Promise.all([
    leer(fuentes, 'plan_aprobaciones', db.from('plan_aprobaciones').select('id, client_id, plan_id, version, creado_en').eq('estado', 'pendiente').limit(TOPE), TOPE),
    leer(fuentes, 'hitl_queue', db.from('hitl_queue').select('id, client_id, output_id, type, title, output_preview, priority, payload, metadata, created_at, expires_at').eq('status', 'pending').limit(TOPE), TOPE),
    leer(fuentes, 'cerebro_dueno_preguntas', db.from('cerebro_dueno_preguntas').select('id, client_id, tema, pregunta, creado_en').eq('estado', 'pendiente').limit(TOPE), TOPE),
    leer(fuentes, 'finanzas_preguntas', db.from('finanzas_preguntas').select('id, client_id, clave, texto, creado_en').eq('estado', 'enviada').limit(TOPE), TOPE),
    leer(fuentes, 'finanzas_tableros', db.from('finanzas_tableros').select('id, client_id, version, creado_en').eq('estado', 'sin_firma').eq('vigente', true).eq('dry_run', false).limit(TOPE), TOPE),
  ])
  const crudas: Omit<Decision, 'cliente' | 'vencida'>[] = []
  const planesConCompuerta = new Set(compuertas.map((c) => String(c.plan_id)))
  for (const c of compuertas) {
    crudas.push({ id: String(c.plan_id), tipo: 'plan', subtipo: 'compuerta', fuente: 'plan_aprobaciones', client_id: texto(c.client_id), titulo: `Plan de 90 días, versión ${Number(c.version) || 1}: espera tu decisión`, desde: texto(c.creado_en), vence: null, prioridad: null, decidir: { ruta: '/nuevo', accion: 'plan-aprobar' }, costo_usd: null, costo_nota: COSTO_PLAN })
  }
  let ensayos = 0
  for (const h of bandeja) {
    if (esEnsayo(h)) { ensayos++; continue }
    const subtipo = String(h.type ?? 'sin_tipo')
    const plan = uuidDelPlan(h)
    // el mismo plan no se pide dos veces: `plan-aprobar` resuelve también su nota de la bandeja
    if (subtipo === 'plan_con_pendientes' && plan && planesConCompuerta.has(plan)) continue
    const m = TIPOS_HITL[subtipo] ?? { tipo: 'revision' as const, ruta: null, accion: null }
    crudas.push({ id: String(h.id), tipo: m.tipo, subtipo, fuente: 'hitl_queue', client_id: texto(h.client_id), titulo: sinSecretos(h.title ?? h.output_preview, 300) ?? `Revisión pendiente (${subtipo})`, desde: texto(h.created_at), vence: texto(h.expires_at), prioridad: texto(h.priority), decidir: { ruta: m.ruta, accion: m.accion }, costo_usd: null, costo_nota: m.tipo === 'plan' ? 'aprobar no gasta por sí mismo' : null })
  }
  for (const p of preguntas) crudas.push({ id: String(p.id), tipo: 'pregunta_al_dueno', subtipo: String(p.tema ?? 'pregunta'), fuente: 'cerebro_dueno_preguntas', client_id: texto(p.client_id), titulo: sinSecretos(p.pregunta, 300) ?? String(p.tema ?? 'Pregunta al dueño'), desde: texto(p.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null })
  for (const p of deFinanzas) crudas.push({ id: String(p.id), tipo: 'pregunta_de_finanzas', subtipo: String(p.clave ?? 'pregunta'), fuente: 'finanzas_preguntas', client_id: texto(p.client_id), titulo: sinSecretos(p.texto, 300) ?? 'Pregunta de la oficina financiera', desde: texto(p.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null })
  for (const t of tableros) crudas.push({ id: String(t.id), tipo: 'firma_de_finanzas', subtipo: 'tablero_sin_firma', fuente: 'finanzas_tableros', client_id: texto(t.client_id), titulo: `Tablero financiero, versión ${Number(t.version) || 1}: espera tu firma`, desde: texto(t.creado_en), vence: null, prioridad: null, decidir: { ruta: null, accion: 'firmar-tablero' }, costo_usd: null, costo_nota: null })

  const omitidas = { clientes_de_practica: 0, clientes_de_baja: 0, ensayos }
  const decisiones: Decision[] = []
  for (const d of crudas) {
    const c = d.client_id ? clientes.get(d.client_id) : undefined
    if (c?.practica) { omitidas.clientes_de_practica++; continue }
    if (c?.de_baja) { omitidas.clientes_de_baja++; continue }
    decisiones.push({ ...d, cliente: c?.nombre ?? null, vencida: !!d.vence && d.vence < hora })
  }
  decisiones.sort(ordenarPorUrgencia)
  return { ok: true, generado_en: hora, completo: estaCompleto(fuentes), total: decisiones.length, decisiones, omitidas, fuentes, sin_fuente: SIN_FUENTE_DECISIONES }
}
