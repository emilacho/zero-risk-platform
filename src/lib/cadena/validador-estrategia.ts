/**
 * Validador de la ESTRATEGIA · código puro, sin modelo (diseño v2 §5 del v1 + cambios del v2).
 * S01 esquema · S02 citas literales · S03 canales vs excluidos · S04 revisiones vs plan · S05 frecuencia del plan ·
 * S06 pares red-formato · S07 pendientes con salida · S08 fechas que importan sin cita ni motivo.
 */
import { citaAparece, numerosEn } from './texto'
import type { Estrategia, FormatosPorRed, Hallazgo, Severidad } from './tipos'

export interface InsumosEstrategia {
  planTexto: string
  formatos: FormatosPorRed
  /** duración de la campaña en días (90 por defecto: lo fija el plan) */
  diasCampana?: number
}

const REQUERIDAS = ['canales', 'excluidos', 'pilares', 'fases', 'hitos', 'dependencias', 'fechas_que_importan', 'patron_semanal', 'piezas_fijas', 'pendientes', 'alertas'] as const
const ORIGENES = ['plan', 'estrategia', 'alta']

function h(chequeo: string, severidad: Severidad, donde: string, que: string, contra: string, propuesta: string): Hallazgo {
  return { chequeo, severidad, fila_id: null, alcance: 'tanda', ficha: { que, donde, contra_que: contra, gravedad: severidad, propuesta } }
}

/** Forma del objeto (lo que el JSON Schema no puede garantizar entero). Devuelve los problemas; vacío = válido. */
export function problemasDeEsquema(x: unknown): string[] {
  const p: string[] = []
  if (!x || typeof x !== 'object' || Array.isArray(x)) return ['la estrategia no es un objeto']
  const o = x as Record<string, unknown>
  for (const k of REQUERIDAS) if (!Array.isArray(o[k])) p.push(`falta la lista «${k}»`)
  if (p.length) return p
  const e = o as unknown as Estrategia
  e.canales.forEach((c, i) => {
    if (!c || typeof c.red !== 'string' || !c.red) p.push(`canales[${i}].red`)
    if (!['principal', 'replica', 'no'].includes(c?.rol)) p.push(`canales[${i}].rol «${String(c?.rol)}»`)
    for (const k of ['feed_semana', 'historias_semana', 'anuncios_semana'] as const) if (!Number.isInteger(c?.frecuencia?.[k]) || c.frecuencia[k] < 0) p.push(`canales[${i}].frecuencia.${k}`)
    if (!Array.isArray(c?.formatos)) p.push(`canales[${i}].formatos`)
  })
  e.pilares.forEach((q, i) => { if (!q?.clave || !Number.isInteger(q?.pct) || q.pct < 0) p.push(`pilares[${i}]`) })
  e.fases.forEach((f, i) => { if (!f?.clave || !Number.isInteger(f?.dia_desde) || !Number.isInteger(f?.dia_hasta)) p.push(`fases[${i}]`) })
  e.hitos.forEach((x2, i) => { if (!x2?.clave || !Number.isInteger(x2?.dia) || !['revision', 'lanzamiento', 'corte'].includes(x2?.tipo)) p.push(`hitos[${i}]`) })
  e.fechas_que_importan.forEach((f, i) => { if (!f?.tipo || !f?.ambito || !ORIGENES.includes(f?.origen)) p.push(`fechas_que_importan[${i}] (origen ∈ plan|estrategia|alta)`) })
  e.patron_semanal.forEach((s, i) => {
    if (!s?.slot || !s?.red || !s?.formato || !s?.pilar) p.push(`patron_semanal[${i}]`)
    if (!Number.isInteger(s?.dia_semana) || s.dia_semana < 1 || s.dia_semana > 7) p.push(`patron_semanal[${i}].dia_semana`)
  })
  e.pendientes.forEach((q, i) => { if (!q?.clave || !['portero', 'sistema'].includes(q?.pedir_a)) p.push(`pendientes[${i}].pedir_a (portero|sistema)`) })
  return p
}

export function validarEstrategia(x: unknown, ins: InsumosEstrategia): Hallazgo[] {
  const out: Hallazgo[] = []
  const malos = problemasDeEsquema(x)
  if (malos.length) {
    out.push(h('S01', 'bloquea', 'estrategia', `esquema inválido: ${malos.slice(0, 6).join('; ')}`, 'contrato estrategia.v1', 'devolver el objeto completo con todas las listas'))
    return out
  }
  const e = x as Estrategia
  const dias = ins.diasCampana ?? 90

  // S01 · pct suma 100; fases dentro de la campaña
  const suma = e.pilares.reduce((s, q) => s + q.pct, 0)
  if (suma !== 100) out.push(h('S01', 'bloquea', 'pilares', `los pilares suman ${suma} y deben sumar 100`, 'pilares[].pct', 'ajustar los porcentajes a 100'))
  for (const f of e.fases) {
    if (f.dia_desde < 1 || f.dia_hasta > dias || f.dia_desde > f.dia_hasta) out.push(h('S01', 'bloquea', `fase ${f.clave}`, `la fase ocupa los días ${f.dia_desde}–${f.dia_hasta}, fuera de 1–${dias}`, `campaña de ${dias} días`, 'poner la fase dentro de la campaña'))
  }

  // S02 · toda cita_plan aparece literal en el plan
  const citas: { donde: string; cita: string | undefined }[] = [
    ...e.excluidos.map((x2) => ({ donde: `excluido ${x2.red}`, cita: x2.cita_plan })),
    ...e.fases.map((x2) => ({ donde: `fase ${x2.clave}`, cita: x2.cita_plan })),
    ...e.hitos.map((x2) => ({ donde: `hito ${x2.clave}`, cita: x2.cita_plan })),
    ...e.dependencias.map((x2) => ({ donde: `dependencia ${x2.antes}→${x2.despues}`, cita: x2.cita_plan })),
    ...e.fechas_que_importan.filter((x2) => x2.origen === 'plan').map((x2) => ({ donde: `fecha que importa ${x2.tipo}`, cita: x2.cita_plan })),
  ]
  for (const c of citas) {
    if (!citaAparece(ins.planTexto, c.cita)) {
      out.push(h('S02', 'bloquea', c.donde, `la cita «${String(c.cita ?? '').slice(0, 80)}» no aparece literal en el plan`, 'texto del plan', 'citar una frase que exista en el plan o quitar la regla; no inventar reglas del plan'))
    }
  }

  // S03 · canales vs excluidos
  const excluidas = new Set(e.excluidos.map((x2) => x2.red))
  for (const c of e.canales) {
    if (c.rol !== 'no' && excluidas.has(c.red)) out.push(h('S03', 'bloquea', `canal ${c.red}`, `la red ${c.red} está en «excluidos» pero se usa con rol ${c.rol}`, 'excluidos del plan', 'quitarla de los canales o de los excluidos'))
  }
  for (const x2 of e.excluidos) if (!x2.cita_plan) out.push(h('S03', 'bloquea', `excluido ${x2.red}`, 'una red excluida sin cita del plan', 'plan', 'citar la frase del plan que la excluye'))

  // S04 · hitos de revisión: el día del hito sale de la cita del plan
  for (const x2 of e.hitos.filter((y) => y.tipo === 'revision')) {
    const nums = numerosEn(x2.cita_plan ?? '')
    if (nums.length && !nums.includes(x2.dia)) {
      out.push(h('S04', 'bloquea', `hito ${x2.clave}`, `el hito de revisión cae en el día ${x2.dia} pero la cita del plan dice ${nums.join(' / ')}`, 'días del plan', 'usar el día que fija el plan'))
    }
  }

  // S05 · frecuencia: ¿sale del plan o es propuesta?
  const numerosPlan = new Set(numerosEn(ins.planTexto))
  for (const c of e.canales.filter((y) => y.rol !== 'no')) {
    if (c.frecuencia.feed_semana > 0 && !numerosPlan.has(c.frecuencia.feed_semana)) {
      out.push(h('S05', 'aviso', `canal ${c.red}`, `la frecuencia de ${c.frecuencia.feed_semana} publicaciones por semana no aparece en el plan: es propuesta de la estrategia`, 'plan', 'marcarla como propuesta al presentar'))
    }
  }

  // S06 · el patrón solo usa pares red-formato permitidos
  for (const s of e.patron_semanal) {
    const ok = (ins.formatos[s.red] ?? []).some((f) => f.formato === s.formato)
    if (!ok) out.push(h('S06', 'bloquea', `slot ${s.slot}`, `el par ${s.red} + ${s.formato} no existe en los formatos permitidos`, 'cadena_formatos_por_red', 'usar un formato que esa red admita'))
  }

  // S07 · pendientes con salida
  for (const q of e.pendientes) if (!q.desbloquea?.length) out.push(h('S07', 'aviso', `pendiente ${q.clave}`, 'un pendiente que no dice qué desbloquea', 'contrato', 'indicar las claves o slots que desbloquea'))

  // S08 · fechas que importan: cada tipo con cita del plan o un motivo concreto; la lista vacía es lo normal
  for (const f of e.fechas_que_importan) {
    const sinMotivo = !f.motivo || f.motivo.trim().length < 12
    if (f.origen === 'estrategia' && sinMotivo && !f.cita_plan) {
      out.push(h('S08', 'aviso', `fecha que importa ${f.tipo}`, 'un tipo de fecha declarado por la estrategia sin cita del plan ni motivo concreto', 'regla: no se inventan tipos «por si acaso»', 'dar el motivo o quitarlo'))
    }
  }
  return out
}

export function hayBloqueo(hs: Hallazgo[]): boolean {
  return hs.some((x) => x.severidad === 'bloquea')
}
