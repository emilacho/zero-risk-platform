/**
 * PROCESAR EL APRENDIZAJE DEL DUEÑO (etapas 2-4, DENTRO del cerebro): desmenuza las notas crudas nuevas (`dato_del_dueno` con `acumula`), las guarda como fichas
 * `aprendizaje_del_dueno` con su huella semántica, y consolida (juntar parecidas, choques, promoción a general, pérdida de peso por desuso). NADA se borra: lo que sobra se retira con motivo.
 *  · Una llamada al modelo por nota cruda (centavos); cada una se registra en el libro de invocaciones (`registrar`) con el flujo del portero.
 *  · Idempotente: la nota cruda queda marcada (`desmenuzada_en`) y cada ficha tiene `ref` único; repetir la pasada no duplica ni vuelve a pagar.
 *  · `dry_run` (por omisión) solo cuenta: no llama al modelo ni escribe.
 */
import { createHash, randomUUID } from 'node:crypto'
import { normalizar } from '../../manual/texto'
import type { Db } from '../alimentar'
import { leerTodas } from '../paginar'
import { esCanalDelManual } from '../dueno'
import { costoDeLaLlamada, MODELO, type PeticionAlModelo, type RespuestaDelModelo, type ResultadoDeRegistro } from '../../cerebro/portero/razonar'
import { consolidar, type Nota, type Operacion } from './consolidar'
import {
  CATALOGO_DE_ARRANQUE, CLASE_DEL_APRENDIZAJE, ESPACIO_GENERAL, PARAMETROS_POR_OMISION, espacioDeAlcance, espacioDeCliente, rubroNormal,
  type Alcance, type Catalogo, type Direccion, type ParametrosDeAprendizaje,
} from './datos'
import { leerIdeas, promptDeDesmenuzar, type Idea } from './desmenuzar'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const obj = (v: unknown): Fila => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Fila) : {})
const huella16 = (s: string): string => createHash('sha256').update(normalizar(s)).digest('hex').slice(0, 16)

export type Embeber = (textos: string[]) => Promise<{ ok: true; embeddings: number[][]; modelo: string } | { ok: false; detalle: string }>
export interface DepsDeProcesar {
  db: Db
  llamarModelo?: (p: PeticionAlModelo) => Promise<RespuestaDelModelo>
  registrar?: (fila: Record<string, unknown>) => Promise<ResultadoDeRegistro>
  embeber?: Embeber
  ahora?: () => Date
  nuevoId?: () => string
  parametros?: ParametrosDeAprendizaje
  workflowId: string
  ejecucionId: string
  /** una llamada que costaría más que esto no se hace (dato) */
  topePorNotaUsd?: number
}
export interface PedidoDeProcesar { dry_run?: boolean; client_id?: string; solo?: 'desmenuzar' | 'consolidar' }
export interface InformeDeProcesar {
  dry_run: boolean
  notas_crudas_pendientes: number
  desmenuzadas: number
  sin_ideas: number
  ilegibles: number
  fichas_nuevas: number
  atributos_propuestos: string[]
  operaciones: Record<string, number>
  huellas_escritas: number
  huellas_pendientes: number
  costo_usd: number
  modelos_llamados: number
  errores: string[]
}

export async function leerCatalogo(db: Db): Promise<Catalogo> {
  try {
    const r = await db.from('cerebro_aprendizaje_catalogo').select('tipo, valor, activo').eq('activo', true).limit(500)
    const f = lista(r.data)
    const destinatarios = f.filter((x) => x.tipo === 'destinatario').map((x) => txt(x.valor)).filter(Boolean)
    const atributos = f.filter((x) => x.tipo === 'atributo').map((x) => txt(x.valor)).filter(Boolean)
    if (r.error || !destinatarios.length || !atributos.length) return CATALOGO_DE_ARRANQUE
    return { destinatarios, atributos }
  } catch { return CATALOGO_DE_ARRANQUE }
}

const datosDe = (f: Fila): Fila => obj(obj(f.provenance_tag).datos)

/** la ficha viva del aprendizaje → nota de trabajo (o null si le falta lo esencial) */
export function notaDeFicha(f: Fila): Nota | null {
  const d = datosDe(f)
  const alcance = txt(f.alcance) as Alcance
  if (!['cliente', 'industria', 'formato', 'general'].includes(alcance)) return null
  const destinatario = txt(d.destinatario), atributo = txt(d.atributo)
  if (!destinatario || !atributo) return null
  return {
    id: String(f.id), espacio: txt(f.client_id), alcance, industria: txt(d.industria) || null, destinatario, atributo, sobre: txt(d.sobre) || atributo, idea: txt(f.que_es) || txt(d.idea),
    direccion: d.direccion === 'evitar' ? 'evitar' : 'hacer', formato: txt(d.formato) || null, peso: Number.isFinite(Number(d.peso)) ? Number(d.peso) : 1,
    creada: txt(f.observado_en) || txt(f.creado_en), ultima_vez_usada: txt(d.ultima_vez_usada) || null, peso_al: txt(d.peso_al) || null,
    choca_con: Array.isArray(d.choca_con) ? (d.choca_con as unknown[]).map(String) : [],
  }
}

interface Cruda { id: string; client_id: string; respuesta: string; respondido_en: string; canal: string; tema: string; mensaje_ref: string | null; intentos: number }

/** una nota que otra pasada (la puerta del dueño o el cron) está desmenuzando ahora mismo no se toma: se espera ese plazo y, si la otra pasada murió, se retoma */
const PLAZO_DE_RESERVA_MS = 10 * 60_000

function crudaDeFicha(f: Fila, desde: string, ahora: Date = new Date()): Cruda | null {
  const d = datosDe(f)
  if (d.acumula !== true || d.desmenuzada_en) return null
  if (esCanalDelManual(txt(d.canal))) return null // lo que el dueño escribe en el manual son hechos de marca, no preferencias de estilo: nunca se desmenuza
  const reservada = txt(d.desmenuzando_desde)
  if (reservada && ahora.getTime() - Date.parse(reservada) < PLAZO_DE_RESERVA_MS) return null
  const cuando = txt(d.respondido_en) || txt(f.observado_en)
  if (!cuando || cuando.slice(0, 10) < desde) return null
  const respuesta = txt(d.respuesta)
  if (!respuesta) return null
  return { id: String(f.id), client_id: txt(f.client_id), respuesta, respondido_en: cuando, canal: txt(d.canal), tema: txt(d.tema), mensaje_ref: txt(d.mensaje_ref) || null, intentos: Number(d.intentos_desmenuzar) || 0 }
}

async function actualizarDatos(db: Db, fichaId: string, parche: Fila): Promise<string | null> {
  const r = await db.from('cerebro_fichas').select('provenance_tag').eq('id', fichaId).limit(1)
  if (r.error) return `leer ${fichaId}: ${r.error.message}`
  const pt = obj(lista(r.data)[0]?.provenance_tag)
  const w = await db.from('cerebro_fichas').update({ provenance_tag: { ...pt, datos: { ...obj(pt.datos), ...parche } } }).eq('id', fichaId)
  return w.error ? `escribir ${fichaId}: ${w.error.message}` : null
}

interface FichaNueva { fila: Fila; texto: string; espacio: string; destinatario: string; formato: string | null }
function fichaDeIdea(i: Idea, o: { cruda: Cruda; espacio: string; rubro: string | null; ingreso: string; id: string; ahora: Date }): FichaNueva {
  const ref = `aprendizaje:${huella16(`${o.espacio}|${i.destinatario}|${i.atributo}|${i.direccion}|${i.idea}|${o.cruda.id}`)}`
  const contenido = `${i.direccion === 'hacer' ? 'Hacer' : 'Evitar'} (${i.destinatario} · ${i.atributo}): ${i.idea}. Lo dijo el dueño (${o.cruda.canal || 'canal sin nombre'}, ${o.cruda.respondido_en.slice(0, 10)}): «${i.cita}»`
  const alcance = i.alcance
  return {
    espacio: o.espacio, destinatario: i.destinatario, formato: i.formato, texto: `${i.destinatario} · ${i.atributo} · ${i.direccion === 'hacer' ? 'hacer' : 'evitar'}: ${i.idea}`,
    fila: {
      id: o.id, client_id: o.espacio, ingreso_id: o.ingreso, ref, clase: CLASE_DEL_APRENDIZAJE, titulo: `Aprendizaje · ${i.destinatario} · ${i.atributo}`.slice(0, 160), que_es: i.idea, contenido, origen: 'dueno',
      fecha_fuente: o.cruda.respondido_en, reconfirmado_en: o.cruda.respondido_en, plazo: null, vigente_hasta: null, version_de: null, huella: huella16(contenido), propiedad: 'propia',
      porque: `nota del dueño desmenuzada (${alcance})`, juzgado_por: 'modelo', observado_en: o.cruda.respondido_en, atributo: `aprendizaje:${i.destinatario}:${i.atributo}`, sede: null,
      decision: 'suma', razon_de_decision: 'idea destilada de un comentario del dueño', alcance, descartada: false, retirada_en: null, motivo_retirada: null,
      provenance_tag: {
        type: 'evidence', source: 'dueno', trust_level: 'untrusted', confirmado_por: 'dueno', canal: o.cruda.canal, ingress_route: '/api/brain/alimentar/aprendizaje',
        datos: {
          respaldo_en: o.cruda.id, cliente_origen: o.cruda.client_id, industria: o.rubro, mensaje_ref: o.cruda.mensaje_ref, respondido_en: o.cruda.respondido_en, tema: o.cruda.tema,
          idea: i.idea, sobre: i.sobre, atributo: i.atributo, destinatario: i.destinatario, direccion: i.direccion, alcance, formato: i.formato, cita: i.cita,
          peso: 1, peso_al: o.ahora.toISOString(), choca_con: [], ultima_vez_usada: null, usos: 0, respaldos_en: [o.cruda.id],
        },
      },
    },
  }
}

export async function procesarAprendizaje(deps: DepsDeProcesar, pedido: PedidoDeProcesar = {}): Promise<InformeDeProcesar> {
  const p = deps.parametros ?? PARAMETROS_POR_OMISION
  const ahora = (deps.ahora ?? (() => new Date()))()
  const id = deps.nuevoId ?? randomUUID
  const dry = pedido.dry_run !== false
  const inf: InformeDeProcesar = { dry_run: dry, notas_crudas_pendientes: 0, desmenuzadas: 0, sin_ideas: 0, ilegibles: 0, fichas_nuevas: 0, atributos_propuestos: [], operaciones: {}, huellas_escritas: 0, huellas_pendientes: 0, costo_usd: 0, modelos_llamados: 0, errores: [] }
  const catalogo = await leerCatalogo(deps.db)

  // ── 2 · desmenuzar
  if (pedido.solo !== 'consolidar') {
    let q = deps.db.from('cerebro_fichas').select('id, client_id, observado_en, provenance_tag').eq('clase', 'dato_del_dueno').is('retirada_en', null).eq('descartada', false)
    if (pedido.client_id) q = q.eq('client_id', pedido.client_id)
    const r = await leerTodas(() => q.order('id', { ascending: true }))
    if (r.error) inf.errores.push(`crudas: ${r.error.message}`)
    const pendientes = r.data.map((f) => crudaDeFicha(f, p.desde, ahora)).filter((c): c is Cruda => !!c).sort((a, b) => a.respondido_en.localeCompare(b.respondido_en))
    inf.notas_crudas_pendientes = pendientes.length
    if (!dry) for (const c of pendientes.slice(0, p.notas_por_pasada)) {
      if (!deps.llamarModelo || !deps.registrar) { inf.errores.push('sin modelo: no se desmenuza'); break }
      const cl = await deps.db.from('clients').select('id, industry').eq('id', c.client_id).limit(1)
      const rubroCrudo = txt(lista(cl.data)[0]?.industry) || null
      const rubro = rubroCrudo ? rubroNormal(rubroCrudo) : null
      // se reserva la nota ANTES de pagar el modelo: dos pasadas a la vez (la puerta y el cron) no la desmenuzan dos veces
      const reservaErr = await actualizarDatos(deps.db, c.id, { desmenuzando_desde: ahora.toISOString() })
      if (reservaErr) { inf.errores.push(reservaErr); continue }
      const vigentes = await ideasVigentesDelCliente(deps.db, c.client_id, p.vigentes_a_comparar)
      const { system, texto } = promptDeDesmenuzar({ comentario: c.respuesta, rubro: rubroCrudo, formato: null, catalogo, vigentes: vigentes.map(resumenDeNota) })
      const t0 = Date.now()
      let resp: RespuestaDelModelo | null = null, fallo: string | null = null
      try { resp = await deps.llamarModelo({ model: MODELO, max_tokens: 1500, thinking: { type: 'between_tools' }, system, messages: [{ role: 'user', content: texto }], timeoutMs: 40_000 }) } catch (e) { fallo = e instanceof Error ? e.message : String(e) }
      const usage = resp?.usage ?? { input_tokens: 0, output_tokens: 0 }
      const costo = costoDeLaLlamada(usage)
      inf.modelos_llamados++; inf.costo_usd = Math.round((inf.costo_usd + costo) * 1e6) / 1e6
      const reg = await deps.registrar({
        workflow_id: deps.workflowId, workflow_execution_id: deps.ejecucionId, agent_name: 'desmenuzador-del-dueno', agent_id: 'desmenuzador-del-dueno', session_id: deps.ejecucionId,
        model: MODELO, cost_usd: costo, duration_ms: Date.now() - t0, tokens_input: usage.input_tokens, tokens_output: usage.output_tokens, num_turns: 1, status: fallo ? 'failed' : 'completed',
        ...(fallo ? { error_message: fallo.slice(0, 300) } : {}), client_id: c.client_id, command: 'portero.aprendizaje.desmenuzar', response_text: (resp?.texto ?? '').slice(0, 2000), metadata: { nota_cruda: c.id },
      }).catch((e: unknown): ResultadoDeRegistro => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) }))
      if (!reg.ok) inf.errores.push(`llamada sin registro (${c.id}): ${reg.detalle ?? ''}`)
      if (fallo || !resp) { inf.errores.push(`modelo (${c.id}): ${fallo}`); await marcarIntento(deps.db, c, inf); continue }
      const lei = leerIdeas(resp.texto, { comentario: c.respuesta, catalogo, rubro, marcas: p.marcas_de_alcance, vigentes: vigentes.length })
      if (lei.ilegible) { inf.ilegibles++; await marcarIntento(deps.db, c, inf); continue }
      // última comprobación antes de escribir: si otra pasada ya la desmenuzó mientras el modelo pensaba, no se duplican las ideas
      const otra = await deps.db.from('cerebro_fichas').select('provenance_tag').eq('id', c.id).limit(1)
      if (txt(datosDe(lista(otra.data)[0] ?? {}).desmenuzada_en)) { inf.errores.push(`nota ${c.id}: otra pasada ya la desmenuzó; se descartó esta lectura`); continue }
      const nuevas: FichaNueva[] = []
      for (const i of lei.ideas) {
        if (i.atributo_propuesto && !inf.atributos_propuestos.includes(i.atributo)) {
          inf.atributos_propuestos.push(i.atributo)
          await deps.db.from('cerebro_aprendizaje_catalogo').upsert({ tipo: 'atributo', valor: i.atributo, ayuda: 'propuesto por el desmenuzador a partir de un comentario del dueño', activo: true }, { onConflict: 'tipo,valor', ignoreDuplicates: true })
        }
        const espacio = espacioDeAlcance(i.alcance, { client_id: c.client_id, rubro })
        const ing = id()
        const wi = await deps.db.from('cerebro_ingresos').insert({ id: ing, client_id: espacio, origen: 'dueno', fuente_ref: `aprendizaje:${c.id}`.slice(0, 120), es_completa: false, huella: `${ahora.toISOString().slice(0, 10)}:aprendizaje:${huella16(`${c.id}|${espacio}|${i.idea}`)}`, material: null, estado: 'fichado', workflow_id: deps.workflowId, workflow_execution_id: deps.ejecucionId })
        if (wi.error) { inf.errores.push(`ingreso (${c.id}): ${wi.error.message}`); continue }
        const nueva = fichaDeIdea(i, { cruda: c, espacio, rubro, ingreso: ing, id: id(), ahora })
        const ya = await deps.db.from('cerebro_fichas').select('id').eq('client_id', espacio).eq('ref', String(nueva.fila.ref)).limit(1)
        if (lista(ya.data).length) continue
        const wf = await deps.db.from('cerebro_fichas').insert(nueva.fila)
        if (wf.error) { inf.errores.push(`ficha (${c.id}): ${wf.error.message}`); continue }
        nuevas.push(nueva); inf.fichas_nuevas++
        // una idea que contradice a otra vigente del cliente: en el mismo espacio gana la más nueva (la vieja se retira con motivo); si no, se anota el choque y la consulta entrega solo la ganadora
        for (const n of i.contradice) {
          const vieja = vigentes[n - 1]
          if (!vieja) continue
          const fresca: Nota = { id: String(nueva.fila.id), espacio, alcance: i.alcance, industria: rubro, destinatario: i.destinatario, atributo: i.atributo, sobre: i.sobre, idea: i.idea, direccion: i.direccion, formato: i.formato, peso: 1, creada: c.respondido_en, ultima_vez_usada: null, peso_al: null, choca_con: [vieja.id] }
          // el modelo ya dijo que se contradicen: en el mismo espacio gana la más nueva (el «formato» que el modelo pone a una idea no la hace más específica que la que la sigue), salvo que sean de formatos distintos
          const distintoFormato = !!fresca.formato && !!vieja.formato && fresca.formato !== vieja.formato
          if (vieja.espacio === espacio && !distintoFormato && Date.parse(fresca.creada) >= Date.parse(vieja.creada)) {
            await retirar(deps, vieja.id, `choca con ${fresca.id} (el dueño pidió lo contrario después): gana la más nueva`, fresca.id, ahora, inf)
            inf.operaciones.retirar_por_choque = (inf.operaciones.retirar_por_choque ?? 0) + 1
          } else {
            const e1 = await actualizarDatos(deps.db, vieja.id, { choca_con: [...new Set([...vieja.choca_con, fresca.id])] })
            const e2 = await actualizarDatos(deps.db, fresca.id, { choca_con: [...new Set([...fresca.choca_con, vieja.id])] })
            for (const e of [e1, e2]) if (e) inf.errores.push(e)
            inf.operaciones.anotar_choque = (inf.operaciones.anotar_choque ?? 0) + 1
          }
        }
      }
      await escribirHuellas(deps, nuevas, inf)
      const e = await actualizarDatos(deps.db, c.id, { desmenuzando_desde: null, desmenuzada_en: ahora.toISOString(), ideas: lei.ideas.length, ...(lei.descartadas.length ? { ideas_descartadas: lei.descartadas.length } : {}) })
      if (e) inf.errores.push(e)
      if (lei.ideas.length) inf.desmenuzadas++; else inf.sin_ideas++
    }
  }

  // ── 4 · consolidar + reparar huellas pendientes
  if (pedido.solo !== 'desmenuzar') {
    const vivas = await leerTodas(() => deps.db.from('cerebro_fichas').select('id, client_id, que_es, observado_en, creado_en, alcance, provenance_tag').eq('clase', CLASE_DEL_APRENDIZAJE).is('retirada_en', null).eq('descartada', false).order('id', { ascending: true }))
    if (vivas.error) inf.errores.push(`fichas vivas: ${vivas.error.message}`)
    else {
      const porId = new Map(vivas.data.map((f) => [String(f.id), f]))
      const notas = vivas.data.map(notaDeFicha).filter((n): n is Nota => !!n)
      const ops = consolidar(notas, ahora, p)
      for (const o of ops) inf.operaciones[o.tipo] = (inf.operaciones[o.tipo] ?? 0) + 1
      if (!dry) for (const o of ops) await aplicar(deps, o, porId, ahora, inf)
      await repararHuellas(deps, vivas.data.map((f) => String(f.id)), porId, dry, inf)
    }
  }
  return inf
}

/** las ideas vivas del cliente (las más pesadas primero): contra ellas se compara cada idea nueva */
async function ideasVigentesDelCliente(db: Db, clientId: string, maximo: number): Promise<Nota[]> {
  const r = await db.from('cerebro_fichas').select('id, client_id, que_es, observado_en, creado_en, alcance, provenance_tag').eq('client_id', espacioDeCliente(clientId)).eq('clase', CLASE_DEL_APRENDIZAJE).is('retirada_en', null).eq('descartada', false).limit(500)
  if (r.error) return []
  return lista(r.data).map(notaDeFicha).filter((n): n is Nota => !!n).sort((a, b) => b.peso - a.peso || b.creada.localeCompare(a.creada)).slice(0, Math.max(0, maximo))
}
const resumenDeNota = (n: Nota): string => `${n.direccion === 'hacer' ? 'Hacer' : 'Evitar'} (${n.destinatario} · ${n.atributo}): ${n.idea}`

async function marcarIntento(db: Db, c: Cruda, inf: InformeDeProcesar): Promise<void> {
  const n = c.intentos + 1
  // tras 3 intentos fallidos se da por vista (no se paga sin fin por un comentario que no se deja leer); queda dicho en la nota
  const e = await actualizarDatos(db, c.id, n >= 3 ? { intentos_desmenuzar: n, desmenuzando_desde: null, desmenuzada_en: new Date().toISOString(), ideas: 0, motivo: 'tres intentos sin respuesta legible' } : { intentos_desmenuzar: n, desmenuzando_desde: null })
  if (e) inf.errores.push(e)
}

async function escribirHuellas(deps: DepsDeProcesar, nuevas: FichaNueva[], inf: InformeDeProcesar): Promise<void> {
  if (!nuevas.length) return
  if (!deps.embeber) { inf.huellas_pendientes += nuevas.length; return }
  const e = await deps.embeber(nuevas.map((n) => n.texto)).catch((x: unknown) => ({ ok: false as const, detalle: x instanceof Error ? x.message : String(x) }))
  if (!e.ok || e.embeddings.length !== nuevas.length) { inf.huellas_pendientes += nuevas.length; inf.errores.push(`huellas: ${e.ok ? 'cantidad distinta' : e.detalle}`); return }
  for (let k = 0; k < nuevas.length; k++) {
    const n = nuevas[k]
    const w = await deps.db.from('cerebro_aprendizaje_indice').upsert({ ficha_id: String(n.fila.id), espacio: n.espacio, destinatario: n.destinatario, formato: n.formato, texto: n.texto, embedding: JSON.stringify(e.embeddings[k]), modelo: e.modelo }, { onConflict: 'ficha_id' })
    if (w.error) { inf.huellas_pendientes++; inf.errores.push(`huella ${String(n.fila.id)}: ${w.error.message}`) } else inf.huellas_escritas++
  }
}

/** las fichas vivas que no tienen huella (falló el modelo de huellas) se reparan en la pasada siguiente */
async function repararHuellas(deps: DepsDeProcesar, vivas: string[], porId: Map<string, Fila>, dry: boolean, inf: InformeDeProcesar): Promise<void> {
  if (!vivas.length) return
  const ix = await leerTodas(() => deps.db.from('cerebro_aprendizaje_indice').select('ficha_id').order('ficha_id', { ascending: true }))
  if (ix.error) { inf.errores.push(`índice: ${ix.error.message}`); return }
  const tiene = new Set(ix.data.map((r) => String(r.ficha_id)))
  const faltan = vivas.filter((x) => !tiene.has(x))
  inf.huellas_pendientes += faltan.length
  if (dry || !faltan.length) return
  const pend: FichaNueva[] = faltan.slice(0, 40).map((fid) => {
    const f = porId.get(fid) as Fila, d = datosDe(f)
    return { fila: { id: fid }, espacio: txt(f.client_id), destinatario: txt(d.destinatario), formato: txt(d.formato) || null, texto: `${txt(d.destinatario)} · ${txt(d.atributo)} · ${d.direccion === 'evitar' ? 'evitar' : 'hacer'}: ${txt(f.que_es)}` }
  })
  const antes = inf.huellas_pendientes
  inf.huellas_pendientes = antes - pend.length
  await escribirHuellas(deps, pend, inf)
}

async function retirar(deps: DepsDeProcesar, fichaId: string, motivo: string, reemplazadaPor: string | null, ahora: Date, inf: InformeDeProcesar): Promise<void> {
  const u = await deps.db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: motivo.slice(0, 300), ...(reemplazadaPor ? { reemplazada_por: reemplazadaPor } : {}) }).eq('id', fichaId)
  if (u.error) inf.errores.push(`retirar ${fichaId}: ${u.error.message}`)
  await deps.db.from('cerebro_aprendizaje_indice').delete().eq('ficha_id', fichaId) // la huella es un derivado: la ficha retirada queda, su huella no busca
}

async function aplicar(deps: DepsDeProcesar, o: Operacion, porId: Map<string, Fila>, ahora: Date, inf: InformeDeProcesar): Promise<void> {
  const nuevoId = deps.nuevoId ?? randomUUID
  const err = (e: string | null) => { if (e) inf.errores.push(e) }
  if (o.tipo === 'decaer') return err(await actualizarDatos(deps.db, o.id, { peso: o.peso, peso_al: ahora.toISOString() }))
  if (o.tipo === 'juntar') {
    const sobrevive = porId.get(o.sobrevive), d = sobrevive ? datosDe(sobrevive) : {}
    const respaldos = new Set<string>(Array.isArray(d.respaldos_en) ? (d.respaldos_en as unknown[]).map(String) : [])
    for (const r of o.retira) for (const x of (Array.isArray(datosDe(porId.get(r) ?? {}).respaldos_en) ? (datosDe(porId.get(r) as Fila).respaldos_en as unknown[]) : [])) respaldos.add(String(x))
    err(await actualizarDatos(deps.db, o.sobrevive, { peso: o.peso, peso_al: ahora.toISOString(), respaldos_en: [...respaldos], juntadas: ((Number(d.juntadas) || 0) + o.retira.length) }))
    for (const r of o.retira) await retirar(deps, r, o.motivo, o.sobrevive, ahora, inf)
    return
  }
  if (o.tipo === 'retirar_por_choque') return retirar(deps, o.id, o.motivo, o.gana, ahora, inf)
  if (o.tipo === 'anotar_choque') {
    for (const [a, b] of [[o.ids[0], o.ids[1]], [o.ids[1], o.ids[0]]]) {
      const previo = Array.isArray(datosDe(porId.get(a) ?? {}).choca_con) ? (datosDe(porId.get(a) as Fila).choca_con as unknown[]).map(String) : []
      if (!previo.includes(b)) err(await actualizarDatos(deps.db, a, { choca_con: [...previo, b] }))
    }
    return
  }
  // promover a general: ficha nueva con la redacción de la más pesada del grupo; las de origen quedan de respaldo
  const modelo = porId.get(o.modelo)
  if (!modelo) return
  const d = datosDe(modelo)
  const ing = nuevoId()
  const wi = await deps.db.from('cerebro_ingresos').insert({ id: ing, client_id: ESPACIO_GENERAL, origen: 'dueno', fuente_ref: `aprendizaje:promocion:${o.modelo}`.slice(0, 120), es_completa: false, huella: `${ahora.toISOString().slice(0, 10)}:aprendizaje:${huella16(`general|${o.de.join(',')}`)}`, material: null, estado: 'fichado', workflow_id: deps.workflowId, workflow_execution_id: deps.ejecucionId })
  if (wi.error) return err(`ingreso de la promoción: ${wi.error.message}`)
  const idea = txt(modelo.que_es)
  const fid = nuevoId()
  const contenido = `${d.direccion === 'evitar' ? 'Evitar' : 'Hacer'} (${txt(d.destinatario)} · ${txt(d.atributo)}): ${idea}. Se repitió en ${o.industrias.length} rubros (${o.industrias.join(', ')}); el dueño lo dijo ${o.de.length} veces.`
  const fila = {
    id: fid, client_id: ESPACIO_GENERAL, ingreso_id: ing, ref: `aprendizaje:${huella16(`general|${txt(d.destinatario)}|${txt(d.atributo)}|${txt(d.direccion)}|${txt(d.sobre)}|${txt(d.formato)}`)}`, clase: CLASE_DEL_APRENDIZAJE,
    titulo: `Aprendizaje · ${txt(d.destinatario)} · ${txt(d.atributo)} · general`.slice(0, 160), que_es: idea, contenido, origen: 'dueno', fecha_fuente: ahora.toISOString(), reconfirmado_en: ahora.toISOString(), plazo: null, vigente_hasta: null, version_de: null,
    huella: huella16(contenido), propiedad: 'propia', porque: `idea repetida en ${o.industrias.length} rubros`, juzgado_por: 'regla', observado_en: ahora.toISOString(), atributo: txt(modelo.atributo) || `aprendizaje:${txt(d.destinatario)}:${txt(d.atributo)}`, sede: null,
    decision: 'suma', razon_de_decision: 'promovida a general: la misma indicación en varios rubros', alcance: 'general', descartada: false, retirada_en: null, motivo_retirada: null,
    provenance_tag: {
      type: 'evidence', source: 'dueno', trust_level: 'untrusted', confirmado_por: 'dueno', canal: txt(obj(modelo.provenance_tag).canal), ingress_route: '/api/brain/alimentar/aprendizaje',
      datos: { ...d, alcance: 'general', industria: null, cliente_origen: null, peso: o.peso, peso_al: ahora.toISOString(), choca_con: [], ultima_vez_usada: null, usos: 0, promovida_de: o.de, industrias: o.industrias, respaldos_en: o.de },
    },
  }
  const ya = await deps.db.from('cerebro_fichas').select('id').eq('client_id', ESPACIO_GENERAL).eq('ref', fila.ref).is('retirada_en', null).limit(1)
  if (lista(ya.data).length) return
  const wf = await deps.db.from('cerebro_fichas').insert(fila)
  if (wf.error) return err(`promoción: ${wf.error.message}`)
  inf.fichas_nuevas++
  await escribirHuellas(deps, [{ fila, espacio: ESPACIO_GENERAL, destinatario: txt(d.destinatario), formato: txt(d.formato) || null, texto: `${txt(d.destinatario)} · ${txt(d.atributo)} · ${d.direccion === 'evitar' ? 'evitar' : 'hacer'}: ${idea}` }], inf)
}

export type { Direccion }
