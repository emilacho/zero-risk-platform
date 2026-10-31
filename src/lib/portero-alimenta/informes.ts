/**
 * LA PUERTA DE INFORMES DE LA MESA DE ANÁLISIS (31-oct · encargo «voz del público y resumen siempre», punto 4) · US$ 0, sin modelo.
 * `POST /api/brain/alimentar/informe` es la ÚNICA vía por la que la mesa escribe un informe en el cerebro (no `client_historical_outputs`, no `client_voc_library`).
 *  · Clase `informe_de_analisis`, con `tipo` libre que define la mesa (p. ej. voz_del_publico, competencia). UNA sola vigente por cliente y tipo:
 *    al llegar uno nuevo el anterior se RETIRA con fecha y motivo (mecanismo `version_de` / `retirada_en`; nada se borra).
 *  · Cada informe guarda autor (mesa y agente), `fecha_de_corte`, las citas a las fichas usadas y el origen «síntesis de oficina»:
 *    es lo OBSERVADO por la mesa, nunca propio ni declarado por el dueño, y no verifica el manual (origen `tercero` + propiedad `ajena`).
 *  · Las citas se verifican: cada una debe ser una ficha de ESE cliente; una cita inexistente rechaza el informe entero.
 *  · Privacidad: correos, teléfonos y @usuarios de terceros se omiten del texto antes de guardar.
 *  · Un informe con corte MÁS VIEJO que el vigente no lo reemplaza: queda archivado con su fecha.
 *  · `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. Detrás de `PORTERO_INFORMES` (apagado por omisión).
 */
import { createHash, randomUUID } from 'node:crypto'
import { normalizar } from '../manual/texto'
import type { Db } from './alimentar'
import { sinDatosPersonales } from './dueno'
import { validar, type Respuesta } from './rutas'
import { CLASE_DEL_INFORME, ORIGEN_DEL_INFORME, PREFIJO_DE_ATRIBUTO_DEL_INFORME, tipoDeLaFicha } from './contexto-del-cliente'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string, extra: Fila = {}): Respuesta => ({ status, body: { error, detalle, ...extra } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_TEXTO_DEL_INFORME = 30_000
export const MIN_TEXTO_DEL_INFORME = 40
export const MAX_CITAS = 200
export const MAX_TIPO = 40
/** un corte en el futuro es un error de reloj o un informe inventado; se tolera un día de desfase */
export const TOLERANCIA_DEL_CORTE_MS = 86_400_000
const TIPO_VALIDO = /^[a-z][a-z0-9_]{1,39}$/

export interface DepsDeInforme {
  db: Db
  /** PORTERO_INFORMES */
  activo: boolean
  ahora?: Date
  nuevoId?: () => string
}
export interface EntradaDeInforme {
  client_id: string
  tipo: string
  texto: string
  citas: string[]
  fecha_de_corte: string
  mesa: string
  agente: string
}

const huella16 = (s: string): string => createHash('sha256').update(normalizar(s)).digest('hex').slice(0, 16)
/** «Voz del público» → voz_del_publico */
export const tipoNormalizado = (t: string): string => normalizar(t).trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

function normalizarEntrada(cuerpo: Fila, ahora: Date): Respuesta | EntradaDeInforme {
  const pp = (cuerpo.pedido_por && typeof cuerpo.pedido_por === 'object' ? cuerpo.pedido_por : {}) as Fila
  const mesa = txt(pp.oficina), agente = txt(pp.agente)
  if (!mesa || !agente) return err(400, 'entrada_invalida', '`pedido_por` necesita `oficina` (la mesa) y `agente`: se registra quién firma el informe')
  const tipo = tipoNormalizado(txt(cuerpo.tipo))
  if (!TIPO_VALIDO.test(tipo)) return err(400, 'entrada_invalida', `\`tipo\` es obligatorio (texto corto que define la mesa, p. ej. voz_del_publico; letras, números y guion bajo, hasta ${MAX_TIPO})`)
  const texto = txt(cuerpo.texto)
  if (texto.length < MIN_TEXTO_DEL_INFORME) return err(400, 'entrada_invalida', `\`texto\` es obligatorio (al menos ${MIN_TEXTO_DEL_INFORME} caracteres): un informe no es una frase`)
  if (texto.length > MAX_TEXTO_DEL_INFORME) return err(400, 'entrada_invalida', `\`texto\` pasa de ${MAX_TEXTO_DEL_INFORME} caracteres: resume o divide en dos tipos`)
  if (!Array.isArray(cuerpo.citas) || !cuerpo.citas.length) return err(400, 'citas_obligatorias', '`citas` debe ser una lista con al menos una ficha del cerebro en que se apoya el informe (ids de ficha)')
  if (cuerpo.citas.length > MAX_CITAS) return err(400, 'entrada_invalida', `\`citas\` admite hasta ${MAX_CITAS} fichas`)
  const citas = [...new Set(cuerpo.citas.map((c) => txt(c)))]
  const mala = citas.find((c) => !UUID.test(c))
  if (mala !== undefined) return err(400, 'entrada_invalida', `cada cita debe ser el id (uuid) de una ficha del cerebro; «${mala.slice(0, 40)}» no lo es`)
  const corte = txt(cuerpo.fecha_de_corte)
  if (!corte || Number.isNaN(Date.parse(corte))) return err(400, 'entrada_invalida', '`fecha_de_corte` debe ser una fecha ISO: hasta qué fecha llega el material que usó el informe')
  if (Date.parse(corte) > ahora.getTime() + TOLERANCIA_DEL_CORTE_MS) return err(400, 'entrada_invalida', '`fecha_de_corte` está en el futuro')
  return { client_id: String(cuerpo.client_id), tipo, texto, citas, fecha_de_corte: new Date(corte).toISOString(), mesa, agente }
}

/** ¿existen todas las citas, y son de este cliente? (de a 100 ids por lectura) */
async function citasInexistentes(db: Db, clientId: string, citas: string[]): Promise<{ ok: true; faltan: string[] } | { ok: false; detalle: string }> {
  const existen = new Set<string>()
  for (let i = 0; i < citas.length; i += 100) {
    const trozo = citas.slice(i, i + 100)
    const q = await db.from('cerebro_fichas').select('id').eq('client_id', clientId).in('id', trozo).limit(trozo.length + 1)
    if (q.error) return { ok: false, detalle: `cerebro_fichas: ${String(q.error.message ?? q.error).slice(0, 160)}` }
    for (const f of lista(q.data)) existen.add(String(f.id))
  }
  return { ok: true, faltan: citas.filter((c) => !existen.has(c)) }
}

export async function rutaInforme(deps: DepsDeInforme, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo)
  if ('status' in v) return v
  const ahora = deps.ahora ?? new Date()
  const n = normalizarEntrada(v.cuerpo, ahora)
  if ('status' in n) return n
  if (!deps.activo) return { status: 200, body: { apagado: true, detalle: 'PORTERO_INFORMES está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const id = deps.nuevoId ?? randomUUID

  const cl = await deps.db.from('clients').select('id').eq('id', n.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  if (!lista(cl.data).length) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')

  const cit = await citasInexistentes(deps.db, n.client_id, n.citas)
  if (!cit.ok) return err(502, 'lectura_fallida', cit.detalle)
  if (cit.faltan.length) return err(422, 'citas_inexistentes', 'estas citas no son fichas de este cliente en el cerebro: el informe no se guarda', { faltan: cit.faltan.slice(0, 20), faltan_total: cit.faltan.length })

  const limpia = sinDatosPersonales(n.texto)
  const atributo = `${PREFIJO_DE_ATRIBUTO_DEL_INFORME}${n.tipo}`
  const ref = `informe:${n.tipo}:${huella16(`${limpia.texto}|${n.fecha_de_corte}`)}`
  const igual = await deps.db.from('cerebro_fichas').select('id').eq('client_id', n.client_id).eq('ref', ref).limit(1)
  if (igual.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${igual.error.message}`)
  if (lista(igual.data).length) return { status: 200, body: { ok: true, repetido: true, ficha_id: String(lista(igual.data)[0].id), nota: 'este mismo informe (mismo texto y mismo corte) ya estaba guardado' } }

  const vig = await deps.db.from('cerebro_fichas').select('id, atributo, fecha_fuente, observado_en, provenance_tag').eq('client_id', n.client_id).eq('clase', CLASE_DEL_INFORME).is('retirada_en', null).limit(500)
  if (vig.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${vig.error.message}`)
  const delMismoTipo = lista(vig.data).filter((f) => tipoDeLaFicha(f) === n.tipo)
  const vigente = [...delMismoTipo].sort((a, b) => Date.parse(txt(b.fecha_fuente)) - Date.parse(txt(a.fecha_fuente)))[0] ?? null
  const llegoTarde = !!vigente && Date.parse(txt(vigente.fecha_fuente)) > Date.parse(n.fecha_de_corte)
  const fichaId = id()
  const plan = { ficha_id: fichaId, tipo: n.tipo, fecha_de_corte: n.fecha_de_corte, citas_verificadas: n.citas.length, reemplaza: vigente && !llegoTarde ? String(vigente.id) : null, llego_tarde: llegoTarde, datos_personales_omitidos: limpia.redactado }
  if (v.dry_run) return { status: 200, body: { ok: true, dry_run: true, ...plan, nota: 'dry_run: no se guardó nada' } }

  const dia = ahora.toISOString().slice(0, 10)
  const ing = id()
  const wi = await deps.db.from('cerebro_ingresos').insert({ id: ing, client_id: n.client_id, origen: 'tercero', fuente_ref: `informe:${n.mesa}`.slice(0, 120), es_completa: false, huella: `${dia}:informe:${huella16(ref)}`, material: null, estado: 'fichado', workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id })
  if (wi.error) return err(502, 'registro_fallido', `cerebro_ingresos: ${wi.error.message}`)
  const fila = {
    id: fichaId, client_id: n.client_id, ingreso_id: ing, ref, clase: CLASE_DEL_INFORME, titulo: `Informe · ${n.tipo} · corte ${n.fecha_de_corte.slice(0, 10)}`.slice(0, 160), que_es: limpia.texto.slice(0, 200), contenido: limpia.texto,
    origen: 'tercero', fecha_fuente: n.fecha_de_corte, reconfirmado_en: ahora.toISOString(), plazo: null, vigente_hasta: null, version_de: vigente && !llegoTarde ? String(vigente.id) : null, huella: huella16(limpia.texto),
    propiedad: 'ajena', porque: `síntesis de oficina (${n.mesa} · ${n.agente}): observado, no declarado por el dueño`, juzgado_por: 'regla', observado_en: ahora.toISOString(), atributo, sede: null,
    decision: vigente && !llegoTarde ? 'reemplaza' : 'suma',
    razon_de_decision: vigente && !llegoTarde ? `el informe nuevo de tipo ${n.tipo} (corte ${n.fecha_de_corte.slice(0, 10)}) reemplaza al anterior` : llegoTarde ? 'llegó con un corte más viejo que el vigente: queda archivado' : 'primer informe de este tipo para el cliente',
    alcance: 'cliente', descartada: false, retirada_en: llegoTarde ? ahora.toISOString() : null, motivo_retirada: llegoTarde ? `ya hay un informe ${n.tipo} con corte más nuevo (${txt(vigente?.fecha_fuente).slice(0, 10)})` : null,
    provenance_tag: {
      type: 'evidence', source: ORIGEN_DEL_INFORME, trust_level: 'untrusted', canal: 'mesa_de_analisis', ingress_route: '/api/brain/alimentar/informe',
      datos: { tipo: n.tipo, mesa: n.mesa, agente: n.agente, fecha_de_corte: n.fecha_de_corte, citas: n.citas, ...(limpia.redactado ? { datos_personales_omitidos: true } : {}) },
    },
  }
  const wf = await deps.db.from('cerebro_fichas').insert(fila)
  if (wf.error) return err(502, 'registro_fallido', `cerebro_fichas: ${wf.error.message}`)
  const errores: string[] = []
  if (vigente && !llegoTarde) {
    const retirar = [vigente, ...delMismoTipo.filter((f) => String(f.id) !== String(vigente.id))]
    for (const vieja of retirar) {
      const u = await deps.db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: `reemplazado por ${fichaId} el ${dia} — informe nuevo del mismo tipo, corte ${n.fecha_de_corte.slice(0, 10)}`, reemplazada_por: fichaId }).eq('id', String(vieja.id)).eq('client_id', n.client_id)
      if (u.error) errores.push(`retiro del informe anterior ${String(vieja.id)}: ${u.error.message}`)
    }
  }
  return { status: 200, body: { ok: true, guardado: true, ...plan, ...(errores.length ? { avisos: errores } : {}), modelos_llamados: 0, costo_usd: 0 } }
}
