/**
 * EL JUICIO DE RELEVANCIA DE LO AJENO · encargo 4 de Cerebro (18-nov, firma de Emilio).
 *
 * Un empleado (Haiku 4.5) mira cada foto o video AJENO de un cliente (papel competidor, mercado o referencia; la fase B ya dijo de dónde viene)
 * y dice si SIRVE al rubro y a la oferta de ESE cliente: «sirve», «no_sirve» o «dudoso», con una frase de motivo.
 *  · Escribe SOLO sus columnas (`relevancia_juicio`, `relevancia_juicio_motivo`, `relevancia_juzgada_en`, `relevancia_juicio_modelo`). Nunca borra ni cambia el papel, la vía, el nivel ni el motivo exacto.
 *  · Lo dudoso queda MARCADO «dudoso» con su motivo: no va a revisión de una persona (regla de Emilio: ninguna persona sin su firma). La oficina lo ve aparte.
 *  · La bodega del mundo (sin cliente) no se juzga.
 *  · Tandas de 20 piezas por llamada, imagen reducida (≤512 px) y texto ≤500 caracteres.
 *  · Corre SOLO dentro de un proceso operativo (workflow_id + workflow_execution_id), con su interruptor `PORTERO_RELEVANCIA=on` (APAGADO por omisión) y tope de llamadas.
 *  · Cada llamada tiene su tope de gasto ANTES de salir (estimado) y DESPUÉS (real): si la real pasa el tope, la pasada se detiene y lo dice.
 * Todo lo de afuera (base, bajada de la foto, modelo, registro) se inyecta: en las pruebas son dobles.
 */
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MODELO_DE_RELEVANCIA = 'claude-haiku-4-5'
/** US$ por millón de tokens de Haiku 4.5 (tabla oficial de precios de Anthropic, la misma de la cotización) */
export const PRECIO_DE_RELEVANCIA = { entrada: 1, salida: 5 } as const
export const PIEZAS_POR_TANDA = 20
export const MAXIMO_DE_TEXTO = 500
export const MAX_TOKENS_DE_RESPUESTA = 1500
export const TIEMPO_MAXIMO_DE_LLAMADA_MS = 60_000
/** la cotización: ≈ US$ 0,016 por tanda; la firma de Emilio pide parar si el real pasa en más de 50 % lo estimado → US$ 0,024 por llamada */
export const COSTO_ESTIMADO_POR_TANDA_USD = 0.016
export const TOPE_DE_GASTO_POR_LLAMADA_USD = 0.024
/** tokens que se cuentan por imagen reducida (≤512×512 px ≈ 350) más el rótulo, con margen */
export const TOKENS_POR_IMAGEN = 450
/** en la corrida diaria: tandas por cliente y día (entran ≈ 8 piezas por día en el cliente más grande; 2 tandas = 40) */
export const TANDAS_POR_CLIENTE_Y_DIA = 2
/** una pasada pedida a mano (la primera por cliente, o la prueba de 40) nunca pide más de esto en una sola vez */
export const TANDAS_MAXIMAS_POR_PEDIDO = 50
export const TABLAS_A_JUZGAR = ['client_social_images', 'client_videos'] as const
export type TablaAJuzgar = (typeof TABLAS_A_JUZGAR)[number]
export type Juicio = 'sirve' | 'no_sirve' | 'dudoso'
export const JUICIOS: readonly Juicio[] = ['sirve', 'no_sirve', 'dudoso']

export const COLUMNAS_A_JUZGAR: Record<TablaAJuzgar, string> = {
  client_social_images: 'id, client_id, papel, via, via_detalle, nivel, relevancia_motivo, tipo, caption, url, handle, que_muestra',
  client_videos: 'id, client_id, papel, via, via_detalle, nivel, relevancia_motivo, tipo, caption, transcripcion, handle',
}

export interface PerfilDelCliente { client_id: string; nombre: string; rubro: string; mercado: string; pais: string; ofertas: string[] }
export interface Pieza { tabla: TablaAJuzgar; id: string; client_id: string; papel: string; via: string; nivel: string; motivo: string; texto: string; url: string | null }
export interface JuicioDeUnaPieza { tabla: TablaAJuzgar; id: string; juicio: Juicio; motivo: string }
export interface RespuestaDelModelo { texto: string; stop_reason?: string | null; usage: { input_tokens: number; output_tokens: number } }
export interface PeticionDeRelevancia { model: string; max_tokens: number; system: string; partes: Array<{ rotulo: string; imagen?: { tipo: string; base64: string } }>; texto: string; timeoutMs: number }
export type Bajada = { ok: true; base64: string; tipo: string; bytes: number } | { ok: false; motivo: string; detalle?: string }

export interface DepsDeRelevancia {
  db: Db
  llamarModelo: (p: PeticionDeRelevancia) => Promise<RespuestaDelModelo>
  /** baja la foto YA reducida; si falla, la pieza se juzga solo por su texto (y lo dice) */
  bajarFoto: (url: string) => Promise<Bajada>
  registrar: (fila: Record<string, unknown>) => Promise<{ ok: boolean; detalle?: string }>
  ahora?: () => Date
}

export interface PedidoDeRelevancia {
  clientes: string[]
  dry_run: boolean
  workflow_id?: string
  workflow_execution_id?: string
  /** tandas por cliente (por omisión las de la corrida diaria) */
  tandas_por_cliente?: number
  /** solo estas piezas (la prueba de 40): ids de cualquiera de las dos tablas */
  ids?: string[]
  /** false = llama al modelo pero NO escribe (la prueba de 40 contra lo juzgado a mano) */
  escribir?: boolean
  /** plazo total (ms): pasado, no se empieza otra tanda */
  plazoMs?: number
}

export interface ResultadoDeRelevancia {
  estado: 'ok' | 'apagado' | 'sin_proceso' | 'detenido_por_costo' | 'error'
  dry_run: boolean
  escribio: boolean
  por_juzgar: Record<string, number>
  juzgadas: number
  por_juicio: Record<Juicio, number>
  sin_respuesta: number
  sin_imagen: number
  llamadas: number
  costo_usd: number
  fallas: string[]
  juicios?: JuicioDeUnaPieza[]
  detalle?: string
}

/** el interruptor general: APAGADO salvo `PORTERO_RELEVANCIA=on`. Sin él no hay ninguna llamada real (ni pedida a mano ni diaria) */
export const relevanciaEncendida = (env: Record<string, string | undefined> = process.env): boolean => String(env.PORTERO_RELEVANCIA ?? '').trim().toLowerCase() === 'on'
/** la corrida DIARIA pide además `PORTERO_RELEVANCIA_DIARIA=on`: así la prueba de 40 y la primera pasada pueden correr sin encender la diaria */
export const relevanciaDiariaEncendida = (env: Record<string, string | undefined> = process.env): boolean => relevanciaEncendida(env) && String(env.PORTERO_RELEVANCIA_DIARIA ?? '').trim().toLowerCase() === 'on'

export const costoDeRelevancia = (u: { input_tokens: number; output_tokens: number }): number =>
  Math.round(((u.input_tokens * PRECIO_DE_RELEVANCIA.entrada + u.output_tokens * PRECIO_DE_RELEVANCIA.salida) / 1_000_000) * 1e6) / 1e6

/** la URL de la foto reducida (≤512 px) en el almacén: el servicio de imágenes de la base la achica; fuera del almacén no hay foto */
export function urlReducida(url: string, urlDeLaBase: string): string | null {
  const base = urlDeLaBase.replace(/\/$/, '')
  const prefijo = `${base}/storage/v1/object/public/`
  if (!base || !url.startsWith(prefijo)) return null
  const ruta = url.slice(prefijo.length).split(/[?#]/)[0]
  if (!ruta || ruta.includes('..')) return null
  return `${base}/storage/v1/render/image/public/${ruta}?width=512&height=512&resize=contain&quality=60`
}

/** lo que el empleado necesita saber del cliente: rubro, mercado, país y sus ofertas (de las fichas de precio vivas). Sin cliente legible → null */
export async function leerPerfil(db: Db, clientId: string): Promise<PerfilDelCliente | null> {
  const [c, p] = await Promise.all([
    db.from('clients').select('id, name, industry, market, country').eq('id', clientId).limit(1),
    db.from('cerebro_fichas').select('titulo').eq('client_id', clientId).eq('clase', 'precio').is('retirada_en', null).limit(200),
  ])
  if (c.error || p.error) return null
  const cli = ((c.data ?? []) as Fila[])[0]
  if (!cli) return null
  const ofertas = new Set<string>()
  for (const f of (p.data ?? []) as Fila[]) {
    const m = /precio:(?:producto\s+)?(.+?)(?:\s+·\s+sede\b.*)?$/i.exec(txt(f.titulo))
    const o = m ? m[1].trim() : ''
    if (o.length >= 3 && o.length <= 60 && !/mejor (precio )?del mercado/i.test(o)) ofertas.add(o)
    if (ofertas.size >= 15) break
  }
  return { client_id: clientId, nombre: txt(cli.name), rubro: txt(cli.industry), mercado: txt(cli.market), pais: txt(cli.country), ofertas: [...ofertas] }
}

export function aPieza(tabla: TablaAJuzgar, f: Fila): Pieza {
  const partes = [txt(f.caption), tabla === 'client_social_images' ? txt(f.que_muestra) : txt(f.transcripcion)].filter(Boolean)
  return {
    tabla, id: txt(f.id), client_id: txt(f.client_id), papel: txt(f.papel), via: txt(f.via), nivel: txt(f.nivel), motivo: txt(f.relevancia_motivo),
    texto: partes.join(' · ').replace(/\s+/g, ' ').slice(0, MAXIMO_DE_TEXTO),
    url: tabla === 'client_social_images' ? txt(f.url) || null : null,
  }
}

/** las piezas por juzgar de un cliente: ajenas (papel no propio), clasificadas por la fase B y sin juicio. Primero las «sin motivo», luego el mercado, luego el resto */
export async function piezasPorJuzgar(db: Db, clientId: string, tabla: TablaAJuzgar, limite: number, ids?: string[]): Promise<{ ok: true; piezas: Pieza[] } | { ok: false; detalle: string }> {
  let q = db.from(tabla).select(COLUMNAS_A_JUZGAR[tabla]).eq('client_id', clientId).not('papel', 'is', null).neq('papel', 'propio').is('relevancia_juicio', null)
  if (ids) q = q.in('id', ids)
  const r = await q.order('sin_motivo', { ascending: false }).order('id').limit(Math.max(limite * 3, limite))
  if (r.error) return { ok: false, detalle: `${tabla}: ${String(r.error.message ?? r.error).slice(0, 160)}` }
  const rango = (p: Pieza) => (!p.motivo ? 0 : p.papel === 'mercado' ? 1 : 2)
  const piezas = ((r.data ?? []) as Fila[]).map((f) => aPieza(tabla, f)).filter((p) => p.client_id === clientId && p.papel && p.papel !== 'propio')
  return { ok: true, piezas: piezas.sort((a, b) => rango(a) - rango(b)).slice(0, limite) }
}

export const INSTRUCCION_DE_RELEVANCIA = `Eres el empleado que ORDENA el material ajeno que entra al cerebro de UN cliente (fotos y videos de competidores, del mercado y de referencias).
Para cada pieza numerada decides si SIRVE a este cliente para entender su rubro, su competencia o a su público, mirando su imagen (si viene) y su texto:
- "sirve": es del rubro del cliente o de su oferta (mismo tipo de negocio, productos parecidos, su público, su ciudad o país), o es una referencia útil de cómo se comunica su rubro.
- "no_sirve": es de otro rubro, otro país sin relación, contenido que no tiene que ver (novelas, memes ajenos, política, otra industria).
- "dudoso": no alcanza la información para decidir, o tiene partes de las dos.
No inventes: si la pieza no trae imagen ni texto suficiente, es "dudoso". El motivo es UNA frase corta (máx. 200 caracteres) que dice qué viste.
Responde SOLO un arreglo JSON, una entrada por pieza: [{"n":1,"juicio":"sirve","motivo":"..."}, ...]`

export function armarTexto(perfil: PerfilDelCliente, piezas: Pieza[]): string {
  const cli = [
    `CLIENTE: ${perfil.nombre}`,
    `RUBRO: ${perfil.rubro || 'sin dato'}`,
    `MERCADO: ${perfil.mercado || 'sin dato'} · PAÍS: ${perfil.pais || 'sin dato'}`,
    `OFERTAS: ${perfil.ofertas.length ? perfil.ofertas.join(', ') : 'sin dato'}`,
  ].join('\n')
  return `${cli}\n\nJuzga las ${piezas.length} piezas de arriba (n = 1..${piezas.length}). Responde solo el arreglo JSON.`
}

export function rotuloDePieza(p: Pieza, n: number, conImagen: boolean): string {
  return `PIEZA ${n} · ${p.tabla === 'client_videos' ? 'video' : 'foto'} · papel ${p.papel} · entró por ${p.via || 'sin registro'} · nivel ${p.nivel || '-'}${conImagen ? '' : ' · SIN IMAGEN'}\nTEXTO: ${p.texto || '(sin texto)'}`
}

/** lee la respuesta: solo juicios válidos con motivo, una vez por pieza; lo que falta queda SIN juicio (se vuelve a intentar otro día), nunca se inventa */
export function leerJuicios(texto: string | null, piezas: Pieza[]): JuicioDeUnaPieza[] {
  if (!texto) return []
  const ini = texto.indexOf('['), fin = texto.lastIndexOf(']')
  if (ini < 0 || fin <= ini) return []
  let arr: unknown
  try { arr = JSON.parse(texto.slice(ini, fin + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const vistos = new Set<number>()
  const out: JuicioDeUnaPieza[] = []
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue
    const o = x as Fila
    const n = Number(o.n)
    if (!Number.isInteger(n) || n < 1 || n > piezas.length || vistos.has(n)) continue
    const juicio = txt(o.juicio) as Juicio
    if (!JUICIOS.includes(juicio)) continue
    const motivo = txt(o.motivo).replace(/\s+/g, ' ').slice(0, 300)
    if (!motivo) continue
    vistos.add(n)
    out.push({ tabla: piezas[n - 1].tabla, id: piezas[n - 1].id, juicio, motivo })
  }
  return out
}

/** estimado de la entrada ANTES de llamar: instrucción + texto ≈ 1 token por 3,5 caracteres; cada imagen ≈ TOKENS_POR_IMAGEN */
export function costoEstimado(p: PeticionDeRelevancia): number {
  const caracteres = p.system.length + p.texto.length + p.partes.reduce((s, x) => s + x.rotulo.length, 0)
  const entrada = Math.ceil(caracteres / 3.5) + p.partes.filter((x) => x.imagen).length * TOKENS_POR_IMAGEN
  return costoDeRelevancia({ input_tokens: entrada, output_tokens: p.max_tokens })
}

async function escribirJuicios(db: Db, juicios: JuicioDeUnaPieza[], clientId: string, cuando: string): Promise<{ escritos: number; falla?: string }> {
  let escritos = 0
  for (const j of juicios) {
    // solo si sigue sin juicio y es del cliente (idempotente: otra corrida que llegó antes gana)
    const w = await db.from(j.tabla).update({ relevancia_juicio: j.juicio, relevancia_juicio_motivo: j.motivo, relevancia_juzgada_en: cuando, relevancia_juicio_modelo: MODELO_DE_RELEVANCIA })
      .eq('id', j.id).eq('client_id', clientId).is('relevancia_juicio', null)
    if (w.error) return { escritos, falla: `${j.tabla}: ${String(w.error.message ?? w.error).slice(0, 160)}` }
    escritos++
  }
  return { escritos }
}

/**
 * Juzga lo ajeno de los clientes pedidos. Sin proceso operativo (workflow_id + workflow_execution_id) o con el interruptor apagado: solo CUENTA (no llama al modelo).
 * `dry_run` también solo cuenta. Con `escribir: false` llama al modelo y devuelve los juicios sin escribirlos (la prueba de 40).
 */
export async function juzgarRelevancia(deps: DepsDeRelevancia, p: PedidoDeRelevancia, env: Record<string, string | undefined> = process.env): Promise<ResultadoDeRelevancia> {
  const ahora = deps.ahora ?? (() => new Date())
  const inicio = ahora().getTime()
  const escribir = p.escribir !== false
  const out: ResultadoDeRelevancia = { estado: 'ok', dry_run: true, escribio: false, por_juzgar: {}, juzgadas: 0, por_juicio: { sirve: 0, no_sirve: 0, dudoso: 0 }, sin_respuesta: 0, sin_imagen: 0, llamadas: 0, costo_usd: 0, fallas: [], ...(escribir ? {} : { juicios: [] }) }
  const wf = txt(p.workflow_id), ex = txt(p.workflow_execution_id)
  const clientes = [...new Set(p.clientes.filter((c) => UUID.test(c)))]
  const tandas = Math.max(0, Math.min(TANDAS_MAXIMAS_POR_PEDIDO, Math.floor(p.tandas_por_cliente ?? TANDAS_POR_CLIENTE_Y_DIA)))
  const ids = p.ids?.filter((x) => UUID.test(x))
  const real = !p.dry_run && !!wf && !!ex && relevanciaEncendida(env)
  out.dry_run = !real
  if (!p.dry_run && !(wf && ex)) out.estado = 'sin_proceso'
  else if (!p.dry_run && !relevanciaEncendida(env)) out.estado = 'apagado'

  for (const clientId of clientes) {
    // las piezas de las dos tablas, hasta las tandas pedidas
    const piezas: Pieza[] = []
    for (const tabla of TABLAS_A_JUZGAR) {
      const r = await piezasPorJuzgar(deps.db, clientId, tabla, tandas * PIEZAS_POR_TANDA, ids)
      if (!r.ok) { out.fallas.push(r.detalle); continue }
      out.por_juzgar[`${clientId.slice(0, 6)}:${tabla}`] = r.piezas.length
      piezas.push(...r.piezas)
    }
    if (!real || !piezas.length) continue
    const perfil = await leerPerfil(deps.db, clientId)
    if (!perfil) { out.fallas.push(`${clientId.slice(0, 6)}: no se pudo leer el perfil del cliente`); continue }
    const lista = piezas.slice(0, tandas * PIEZAS_POR_TANDA)
    for (let i = 0; i < lista.length; i += PIEZAS_POR_TANDA) {
      if (p.plazoMs && ahora().getTime() - inicio > p.plazoMs) { out.fallas.push('plazo agotado: no se empezaron más tandas'); return out }
      const tanda = lista.slice(i, i + PIEZAS_POR_TANDA)
      const partes: PeticionDeRelevancia['partes'] = []
      for (const [k, pz] of tanda.entries()) {
        const b = pz.url ? await deps.bajarFoto(pz.url) : null
        const imagen = b && b.ok ? { tipo: b.tipo, base64: b.base64 } : undefined
        if (!imagen) out.sin_imagen++
        partes.push({ rotulo: rotuloDePieza(pz, k + 1, !!imagen), ...(imagen ? { imagen } : {}) })
      }
      const peticion: PeticionDeRelevancia = { model: MODELO_DE_RELEVANCIA, max_tokens: MAX_TOKENS_DE_RESPUESTA, system: INSTRUCCION_DE_RELEVANCIA, partes, texto: armarTexto(perfil, tanda), timeoutMs: TIEMPO_MAXIMO_DE_LLAMADA_MS }
      const estimado = costoEstimado(peticion)
      if (estimado > TOPE_DE_GASTO_POR_LLAMADA_USD) { out.estado = 'detenido_por_costo'; out.detalle = `la tanda costaría ≈ US$ ${estimado} (> ${TOPE_DE_GASTO_POR_LLAMADA_USD}): no se llamó`; return out }
      const t0 = ahora().getTime()
      let resp: RespuestaDelModelo | null = null, falla: string | null = null
      try { resp = await deps.llamarModelo(peticion) } catch (e) { falla = e instanceof Error ? e.message.slice(0, 200) : String(e) }
      out.llamadas++
      const costo = resp ? costoDeRelevancia(resp.usage) : 0
      out.costo_usd = Math.round((out.costo_usd + costo) * 1e6) / 1e6
      const juicios = resp ? leerJuicios(resp.texto, tanda) : []
      out.sin_respuesta += tanda.length - juicios.length
      let escritos = 0
      if (escribir && juicios.length) {
        const w = await escribirJuicios(deps.db, juicios, clientId, ahora().toISOString())
        escritos = w.escritos
        if (w.falla) out.fallas.push(w.falla)
        if (escritos) out.escribio = true
      }
      for (const j of juicios) out.por_juicio[j.juicio]++
      out.juzgadas += juicios.length
      if (!escribir) out.juicios!.push(...juicios)
      if (falla) out.fallas.push(`llamada al modelo: ${falla}`)
      const reg = await deps.registrar({
        workflow_id: wf, workflow_execution_id: ex, agent_name: 'juez-de-relevancia', agent_id: 'juez-de-relevancia', session_id: ex,
        model: MODELO_DE_RELEVANCIA, cost_usd: costo, duration_ms: ahora().getTime() - t0, tokens_input: resp?.usage.input_tokens ?? 0, tokens_output: resp?.usage.output_tokens ?? 0, num_turns: 1,
        status: falla ? 'failed' : 'completed', ...(falla ? { error_message: falla } : {}),
        client_id: clientId, command: escribir ? 'portero.relevancia' : 'portero.relevancia.prueba',
        response_text: (resp?.texto ?? '').slice(0, 2000),
        metadata: { piezas: tanda.length, juicios: juicios.length, escritos, estimado_usd: estimado, stop_reason: resp?.stop_reason ?? null, escribir },
      }).catch((e) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) }))
      if (!reg.ok) out.fallas.push(`llamada sin registro: ${reg.detalle ?? ''}`)
      // el real pasó el tope (la firma: más de 50 % sobre lo estimado) → se detiene y lo dice
      if (costo > TOPE_DE_GASTO_POR_LLAMADA_USD) { out.estado = 'detenido_por_costo'; out.detalle = `la tanda costó US$ ${costo} (> ${TOPE_DE_GASTO_POR_LLAMADA_USD}, más de 50 % sobre lo estimado de ${COSTO_ESTIMADO_POR_TANDA_USD}): se detiene`; return out }
    }
  }
  return out
}

/** el paso de cada corrida (al cierre del vigilante): los clientes que revisó, con el tope diario. Real solo con dry_run:false + flujo + ejecución + interruptor */
export async function relevanciaDeLaCorridaDelVigilante(deps: DepsDeRelevancia, cuerpo: unknown, body: Fila, env: Record<string, string | undefined> = process.env): Promise<ResultadoDeRelevancia | null> {
  if (!relevanciaDiariaEncendida(env)) return null
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Fila
  const revisados = Array.isArray(body.clientes) ? (body.clientes as Fila[]) : []
  const clientes = [...new Set(revisados.map((x) => String(x?.client_id ?? '')).filter((x) => UUID.test(x)))]
  if (!clientes.length) return null
  return juzgarRelevancia(deps, { clientes, dry_run: c.dry_run !== false, workflow_id: txt(c.workflow_id), workflow_execution_id: txt(c.workflow_execution_id), tandas_por_cliente: TANDAS_POR_CLIENTE_Y_DIA, plazoMs: 120_000 }, env)
}
