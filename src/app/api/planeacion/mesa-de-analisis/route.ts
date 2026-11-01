/**
 * POST /api/planeacion/mesa-de-analisis · la puerta de la MESA DE ANÁLISIS (equipo Estrategia · paso 0 del plan).
 * FIRMA de Emilio 01-nov 08:42Z («sí a todo») · DISEÑO-CC1-mesa-de-analisis-dentro-de-estrategia + ADENDA 1.
 *
 * Generaliza `/api/planeacion/brazo/mercado` (F4): el sobre trae UN pedido por analista (`params.tipo` ∈ mercado · competencia ·
 * voz_del_publico · escucha_x · retencion) y cada uno contesta el contrato §4.2 (`brazo: 'analisis'`). Los informes vuelven al
 * plan en la respuesta (fuente propia del redactor, tope 6.000) y, en corrida real, se archivan en el cerebro por la puerta del
 * portero (`POST /api/brain/alimentar/informe`, detrás de `PORTERO_INFORMES`): archivar o no NUNCA tumba el informe.
 *
 * Lo que esta puerta decide, y por qué:
 *   · exige `dry_run` explícito y la firma REAL de la corrida (workflow_id + execution id): el analista solo se invoca vía flujo;
 *   · PALANCA APAGADA POR OMISIÓN (`cadena_config.mesa_de_analisis` = { encendida, clientes[] }): en corrida real, sin palanca para
 *     ESTE cliente no se llama a nadie (US$ 0). En ensayo se lee el material y se declara «no se miró» (también US$ 0);
 *   · un analista que no existe o está inactivo en `agents` se declara (`sin_respuesta`), no se adivina;
 *   · material = resumen vivo ENTERO + fichas del portero sobre el tema (`rutaConsultar`, se registra quién consultó, US$ 0),
 *     recortadas a 6.000 con el recorte dicho; una consulta por analista;
 *   · topes: US$ 1 por analista (≤ 2) y US$ 5 por mesa (FIRMA 01-nov): el pedido que no cabe no se hace;
 *   · idioma y trato del manual del cliente (`params.idioma` · `params.trato` si el flujo los trae); nada de aquí los fija.
 * Del cerebro solo se LEE por sus funciones públicas (CC-CEREBRO); se ESCRIBE únicamente por su puerta HTTP, como cualquier oficina.
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { baseDeRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { CLAVE_DE_METODOS, METODOS_POR_OMISION, metodoSegunConfig } from '@/lib/cadena/metodos'
import { brazoAnalisis, type ArchivadoDelInforme } from '@/lib/planeacion/brazos'
import {
  ANALISTAS, armarMaterial, CLAVE_DE_LA_PALANCA, cuerpoDelInforme, esTipoDeAnalisis, HALLAZGOS_ESPERADOS, leerInforme, leerPalanca,
  MESA, repartirTopes, rotuloDe, tareaDeAnalisis, TIPOS_DE_ANALISIS, TOPE_DE_LA_MESA_USD, type Analista, type FichaDelCliente, type FichaDelMaterial, type TipoDeAnalisis,
} from '@/lib/planeacion/mesa-de-analisis'
import {
  conLimite, CUPO_EN_VUELO, enParalelo, extraDe, firmaDeLaCorrida, leerSobre, pedidoInvalido, responderLista, seRompio, sobreInvalido, type PedidoPuerta,
} from '@/lib/planeacion/puertas'
import { sinRespuesta, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { adjuntoDelCliente } from '@/lib/portero-alimenta/contexto-del-cliente'
import { rutaConsultar } from '@/lib/portero-alimenta/consultar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const FUENTE = 'mesa de análisis · un analista por tipo vía /api/agents/run-sdk · PROPUESTA, no dato del cliente'
export const PASO_DE_ANALISIS = (tipo: TipoDeAnalisis): string => `analisis-${tipo}`

const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const db = () => getSupabaseAdmin()

async function fichaDe(p: PedidoPuerta): Promise<{ ok: true; ficha: FichaDelCliente } | { ok: false; motivo: string }> {
  try {
    const { data, error } = await db().from('clients').select('name, industry, market, country').eq('id', p.client_id).limit(1)
    if (error) throw new Error(error.message)
    const f = (Array.isArray(data) ? data[0] : null) as { name?: unknown; industry?: unknown; market?: unknown; country?: unknown } | null
    if (!f) return { ok: false, motivo: `no existe la ficha del cliente ${String(p.client_id)}` }
    return { ok: true, ficha: { nombre: texto(f.name), rubro: texto(p.params?.rubro) ?? texto(f.industry), plaza: texto(p.params?.plaza) ?? texto(f.market), pais: texto(f.country) } }
  } catch (e) {
    return { ok: false, motivo: 'no se pudo leer la ficha del cliente · ' + (e instanceof Error ? e.message : String(e)) }
  }
}

/** ¿el analista existe y está activo? (si no, se dice: run-sdk contestaría 404 y el libro quedaría sucio) */
async function analistaInstalado(agente: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const { data, error } = await db().from('agents').select('name, is_active').eq('name', agente).limit(1)
    if (error) throw new Error(error.message)
    const f = (Array.isArray(data) ? data[0] : null) as { is_active?: unknown } | null
    if (!f) return { ok: false, motivo: `el analista «${agente}» no está instalado (no hay fila en agents) · NO se preguntó` }
    if (f.is_active !== true) return { ok: false, motivo: `el analista «${agente}» está inactivo · NO se preguntó` }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: 'no se pudo leer el registro de agentes · ' + (e instanceof Error ? e.message : String(e)) }
  }
}

/** el material del analista: el resumen vivo entero + las fichas del tema que entrega el portero (una consulta por analista; registra quién consultó) */
async function materialDe(clientId: string, a: Analista) {
  const base = db() as unknown as Db
  const ctx = await adjuntoDelCliente(base, clientId)
  const resumen = ctx.resumen_vivo.estado === 'vigente'
    ? [ctx.resumen_vivo.texto ?? '', ...(ctx.resumen_vivo.sedes ?? []).map((s) => `[sede ${s.clave}] ${s.texto}`)].filter(Boolean).join('\n')
    : null
  const r = await rutaConsultar({ db: base }, { client_id: clientId, oficina: MESA, agente: a.agente, que: a.que, limite: 50 })
  const cuerpo = r.body as { resultados?: unknown[]; error?: string; detalle?: string }
  if (r.status !== 200) throw new Error(`el portero no contestó la consulta (${r.status} ${cuerpo.error ?? ''}) · ${cuerpo.detalle ?? ''}`.trim())
  const fichas: FichaDelMaterial[] = (cuerpo.resultados ?? []).map((x) => {
    const f = x as Record<string, unknown>
    return { ficha_id: String(f.ficha_id), clase: texto(f.clase), fecha: texto(f.fecha_de_la_fuente) ?? texto(f.fecha), contenido: String(f.contenido ?? '') }
  })
  return { material: armarMaterial({ resumen_vivo: resumen, fichas }), fecha_de_corte: new Date().toISOString() }
}

/** el método del analista según `cadena_config.metodos.<tipo>` · `mercado` tiene uno de omisión (F4); los demás solo si la configuración trae texto */
async function metodoDe(tipo: TipoDeAnalisis): Promise<string | null> {
  let config: unknown = null
  try { config = await almacenDeSupabase().leerConfig(CLAVE_DE_METODOS) } catch { config = null }
  if (tipo === 'mercado') return metodoSegunConfig(config, 'mercado', METODOS_POR_OMISION.mercado)
  const c = config && typeof config === 'object' ? (config as Record<string, unknown>)[tipo] : undefined
  return typeof c === 'string' && c.trim() ? c.trim() : null
}

async function palancaDe(clientId: string) {
  let config: unknown = null
  try { config = await almacenDeSupabase().leerConfig(CLAVE_DE_LA_PALANCA) } catch { config = null }
  return leerPalanca(config, clientId)
}

/** archiva el informe en el cerebro como cualquier oficina: por la puerta HTTP del portero, con la llave interna · su resultado viaja, no tumba */
function archivador(a: { client_id: string; analista: Analista; fecha_de_corte: string; workflow_id: string; workflow_execution_id: string }) {
  return async (informe: Parameters<typeof cuerpoDelInforme>[0]['informe']): Promise<ArchivadoDelInforme> => {
    const cuerpo = cuerpoDelInforme({ ...a, informe })
    if (!cuerpo) return { ok: false, detalle: 'no se archivó: el informe no cita fichas del cerebro (el portero exige al menos una)' }
    const llave = process.env.INTERNAL_API_KEY
    if (!llave) return { ok: false, detalle: 'no se archivó: falta la llave interna en el servidor' }
    const r = await fetch(`${baseDeRunSdk(process.env).replace(/\/+$/, '')}/api/brain/alimentar/informe`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': llave }, body: JSON.stringify(cuerpo),
    })
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
    if (!r.ok) return { ok: false, detalle: `el portero no archivó (${r.status}) · ${String(j?.error ?? '')} ${String(j?.detalle ?? '')}`.trim().slice(0, 300) }
    return { ok: true, detalle: `archivado por el portero (${r.status})`, ficha_id: typeof j?.ficha_id === 'string' ? j.ficha_id : null }
  }
}

async function atender(p: PedidoPuerta, tope: number): Promise<RespuestaBrazo> {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)
  if (!p.client_id) return pedidoInvalido('analisis', FUENTE, p, 'falta client_id')
  const tipo = p.params?.tipo
  if (!esTipoDeAnalisis(tipo)) return pedidoInvalido('analisis', FUENTE, p, `falta \`params.tipo\` o no es uno de: ${TIPOS_DE_ANALISIS.join(', ')}`)
  const analista = ANALISTAS[tipo]
  const fuente = `${FUENTE} · ${tipo} (${analista.agente})`
  // 🔴 el ensayo se DECIDE, no se asume: asumir `false` sería gastar sin que nadie lo pidiera
  if (typeof p.dry_run !== 'boolean') {
    return sinRespuesta({ brazo: 'analisis', objetivo, fuente, ...extra, motivo: 'falta `dry_run` explícito (true o false) · el ensayo se decide, no se asume · NO se preguntó' })
  }
  // 🔴 el analista SOLO se invoca vía flujo · sin firma no hay llamada ni gasto
  const firma = firmaDeLaCorrida(p)
  if (!firma.ok) return pedidoInvalido('analisis', FUENTE, p, firma.motivo)
  if (tope <= 0) return sinRespuesta({ brazo: 'analisis', objetivo, fuente, ...extra, motivo: `el tope de la mesa (US$ ${TOPE_DE_LA_MESA_USD} por sobre) no alcanza para este pedido · NO se preguntó` })

  try {
    // la palanca solo se exige para GASTAR: en ensayo se lee el material a US$ 0 y se declara que no se miró
    if (!p.dry_run) {
      const palanca = await palancaDe(p.client_id)
      if (!palanca.encendida) return sinRespuesta({ brazo: 'analisis', objetivo, fuente, ...extra, motivo: palanca.motivo + ' · NO se preguntó · US$ 0' })
    }
    const instalado = await analistaInstalado(analista.agente)
    if (!instalado.ok) return sinRespuesta({ brazo: 'analisis', objetivo, fuente, ...extra, motivo: instalado.motivo })
    const ficha = await fichaDe(p)
    if (!ficha.ok) return pedidoInvalido('analisis', FUENTE, p, ficha.motivo)

    const { material, fecha_de_corte } = await materialDe(p.client_id, analista)
    const tarea = tareaDeAnalisis({
      analista, ficha: ficha.ficha, material, idioma: texto(p.params?.idioma), trato: texto(p.params?.trato), metodo: await metodoDe(tipo),
      ...(p.proposito ? { proposito: p.proposito } : {}),
    })
    const modelo = modeloRunSdk({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY, fetch: globalThis.fetch, workflow_id: firma.workflow_id })
    const fuenteCompleta = `${fuente} · rubro «${ficha.ficha.rubro ?? 'sin dato'}» · plaza «${ficha.ficha.plaza ?? ficha.ficha.pais ?? 'sin dato'}» · material: ${material.fichas} ficha(s)${material.con_resumen_vivo ? ' + resumen vivo' : ''}${material.recortado ? ' (recortado)' : ''} · tope US$ ${tope.toFixed(2)}`
    const clientId = p.client_id

    return await brazoAnalisis({
      objetivo, fuente: fuenteCompleta, ...extra,
      tipo, agente: analista.agente, rotulo: rotuloDe(tipo), dry_run: p.dry_run, esperados: HALLAZGOS_ESPERADOS,
      pedir: () => conLimite(p.limite_ms, () => modelo.invocar({
        agente: analista.agente, tarea, encargo_id: firma.workflow_execution_id, client_id: clientId, paso: PASO_DE_ANALISIS(tipo), tope_usd: tope, dry_run: p.dry_run as boolean,
      })),
      leer: (salida) => leerInforme(salida, analista, material.ids),
      archivar: archivador({ client_id: clientId, analista, fecha_de_corte, workflow_id: firma.workflow_id, workflow_execution_id: firma.workflow_execution_id }),
    })
  } catch (e) {
    return seRompio('analisis', FUENTE, p, e)
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) return sobreInvalido('analisis', FUENTE, 'la puerta rechazó la llamada · ' + auth.reason)
  const leido = await leerSobre(req)
  if (!leido.ok) return sobreInvalido('analisis', FUENTE, leido.motivo)
  // el tope de la mesa se reparte ANTES de atender: el pedido que no cabe no se hace (sin carrera entre pedidos en vuelo)
  const topes = repartirTopes(leido.sobre.pedidos.map((l) => ({ tipo: l.ok && esTipoDeAnalisis(l.pedido.params?.tipo) ? l.pedido.params?.tipo as TipoDeAnalisis : null, ...(l.ok && typeof l.pedido.tope_usd === 'number' ? { tope_usd: l.pedido.tope_usd } : {}) })))
  const rs = await enParalelo(leido.sobre.pedidos, CUPO_EN_VUELO, async (l) => {
    const i = leido.sobre.pedidos.indexOf(l)
    return l.ok ? atender(l.pedido, topes[i] ?? 0) : pedidoInvalido('analisis', FUENTE, l.pedido, l.motivo)
  })
  return responderLista(rs)
}
