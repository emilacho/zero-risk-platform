/**
 * MÉTRICAS DE REDES (02-nov · encargo firmado por Emilio: dejar todo listo para que solo haya que conectar).
 * Contrato: raw/tasks/2026-11-02-CONTRATO-CC1-metricas-de-redes.md. Nulo es «sin dato», nunca cero: lo que no se midió no se escribe.
 * Tablas propias; no toca el cerebro ni el portero. Lo ya raspado lo pasa aquí el flujo de CC2, por `registrar`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIA = /^\d{4}-\d{2}-\d{2}$/
const RED = /^[a-z][a-z0-9_]{1,30}$/

/** las redes del canon: si no tienen dato, se declaran; YouTube siempre cuenta */
export const REDES_DEL_CANON = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const
export const MAX_MEJORES_PIEZAS = 8
const MAX_DIAS = 90
const DIAS_POR_OMISION = 30

type Fila = Record<string, unknown>
interface Lectura { data: unknown; error: { message: string } | null }
/** la parte de PostgREST que se usa aquí */
interface Consulta extends PromiseLike<Lectura> {
  select(c?: string): Consulta
  eq(c: string, v: unknown): Consulta
  in(c: string, v: unknown[]): Consulta
  gte(c: string, v: unknown): Consulta
  order(c: string, o?: { ascending?: boolean }): Consulta
  upsert(p: Fila, o?: { onConflict?: string }): Consulta
  update(p: Fila): Consulta
  single(): Consulta
  maybeSingle(): Consulta
}
export type Db = { from(tabla: string): Consulta }
export interface Respuesta { status: number; body: Record<string, unknown> }

const mal = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const esObjeto = (v: unknown): v is Fila => !!v && typeof v === 'object' && !Array.isArray(v)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
/** un número medido; negativo (Instagram da -1 cuando oculta los me gusta), texto o ausente es «sin dato» */
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const sinArroba = (v: string): string => v.trim().replace(/^@/, '').toLowerCase()
const soloMedido = (o: Fila): Fila => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined))
const filasDe = (r: Lectura): Fila[] => (r.data as Fila[] | null) ?? []

/* ───────── escribir ───────── */

const MEDIDAS_DE_CUENTA = ['seguidores', 'siguiendo', 'publicaciones', 'alcance', 'vistas', 'interaccion', 'visitas', 'puntaje', 'resenas'] as const
const MEDIDAS_DE_POST = ['alcance', 'vistas', 'me_gusta', 'comentarios', 'guardados', 'compartidos', 'clics'] as const
const medidas = (o: Fila, nombres: readonly string[]): Fila => Object.fromEntries(nombres.map((n) => [n, numero(o[n])]))

/** es propia si el autor es la cuenta; sin autor no se sabe, y no suma */
export function esPropia(autor: string | null, handle: string | null): boolean | null {
  if (!autor || !handle) return null
  return sinArroba(autor) === sinArroba(handle)
}

/** POST /api/metricas/registrar: idempotente; repetir el día actualiza y lo no medido no pisa lo que ya estaba */
export async function registrarMetricas(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  if (!esObjeto(cuerpo)) return mal(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  const { client_id, red, fuente, dia, cuenta, publicaciones, dry_run } = cuerpo
  if (typeof client_id !== 'string' || !UUID.test(client_id)) return mal(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  if (typeof red !== 'string' || !RED.test(red)) return mal(400, 'entrada_invalida', '`red` debe ser un nombre en minúsculas')
  if (fuente !== 'publico' && fuente !== 'api') return mal(400, 'entrada_invalida', '`fuente` debe ser publico o api')
  if (typeof dia !== 'string' || !DIA.test(dia)) return mal(400, 'entrada_invalida', '`dia` debe ser AAAA-MM-DD')
  if (!esObjeto(cuenta) || !texto(cuenta.cuenta_externa)) return mal(400, 'entrada_invalida', 'falta `cuenta.cuenta_externa`')
  if (publicaciones !== undefined && !Array.isArray(publicaciones)) return mal(400, 'entrada_invalida', '`publicaciones` debe ser una lista')

  const posts = ((publicaciones ?? []) as unknown[]).filter(esObjeto)
  const validos = posts.filter((p) => texto(p.post_externo))
  const descartadas = ((publicaciones ?? []) as unknown[]).length - validos.length
  if (dry_run === true) return { status: 200, body: { ok: true, dry_run: true, publicaciones: validos.length, descartadas } }

  const hora = ahora.toISOString()
  const handle = texto(cuenta.handle)
  const c = await db.from('metricas_cuentas').upsert(
    { client_id, red, cuenta_externa: texto(cuenta.cuenta_externa), actualizado_en: hora, ...soloMedido({ handle, url: texto(cuenta.url), acceso: fuente === 'api' ? 'api' : null }) },
    { onConflict: 'client_id,red,cuenta_externa' },
  ).select('id').single()
  if (c.error) return mal(500, 'metricas_error', c.error.message)
  const cuenta_id = (c.data as Fila).id

  const mc = await db.from('metricas_cuenta_mediciones').upsert(
    { cuenta_id, dia, fuente, medido_en: hora, ...soloMedido({ ...medidas(cuenta, MEDIDAS_DE_CUENTA), extra: esObjeto(cuenta.extra) ? cuenta.extra : null }) },
    { onConflict: 'cuenta_id,dia,fuente' },
  )
  if (mc.error) return mal(500, 'metricas_error', mc.error.message)

  let escritas = 0
  for (const p of validos) {
    const autor = texto(p.autor)
    const f = await db.from('metricas_publicaciones').upsert(
      { client_id, cuenta_id, red, post_externo: texto(p.post_externo), actualizado_en: hora, ...soloMedido({ url: texto(p.url), tipo: texto(p.tipo), publicado_en: texto(p.publicado_en), autor, es_propia: esPropia(autor, handle) }) },
      { onConflict: 'client_id,red,post_externo' },
    ).select('id').single()
    if (f.error) return mal(500, 'metricas_error', f.error.message)
    const mp = await db.from('metricas_publicacion_mediciones').upsert(
      { publicacion_id: (f.data as Fila).id, dia, fuente, medido_en: hora, ...soloMedido({ ...medidas(p, MEDIDAS_DE_POST), extra: esObjeto(p.extra) ? p.extra : null }) },
      { onConflict: 'publicacion_id,dia,fuente' },
    )
    if (mp.error) return mal(500, 'metricas_error', mp.error.message)
    escritas++
  }
  return { status: 200, body: { ok: true, cuenta_id, publicaciones: escritas, descartadas } }
}

/* ───────── vincular con la pieza ───────── */

/** POST /api/metricas/vincular: esta medición es de esta pieza. No adivina: alguien lo dice, y solo si son del mismo cliente */
export async function vincularPieza(db: Db, cuerpo: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  if (!esObjeto(cuerpo) || typeof cuerpo.publicacion_id !== 'string' || !UUID.test(cuerpo.publicacion_id) || typeof cuerpo.hitl_id !== 'string' || !UUID.test(cuerpo.hitl_id)) return mal(400, 'entrada_invalida', 'faltan `publicacion_id` o `hitl_id`')
  const p = await db.from('metricas_publicaciones').select('id, client_id').eq('id', cuerpo.publicacion_id).maybeSingle()
  if (p.error) return mal(500, 'metricas_error', p.error.message)
  if (!p.data) return mal(404, 'sin_publicacion', 'no existe esa publicación')
  const h = await db.from('hitl_queue').select('id, client_id, metadata').eq('id', cuerpo.hitl_id).maybeSingle()
  if (h.error) return mal(500, 'metricas_error', h.error.message)
  if (!h.data) return mal(404, 'sin_pieza', 'no existe esa pieza')
  if ((h.data as Fila).client_id !== (p.data as Fila).client_id) return mal(409, 'otro_cliente', 'la pieza y la publicación son de clientes distintos')
  const metadata = esObjeto((h.data as Fila).metadata) ? (h.data as Fila).metadata as Fila : {}
  let agentes: unknown[] = []
  if (typeof metadata.jefatura_revision_id === 'string') {
    const rv = await db.from('jefatura_revisiones').select('productores').eq('id', metadata.jefatura_revision_id).maybeSingle()
    if (rv.error) return mal(500, 'metricas_error', rv.error.message)
    const productores = esObjeto(rv.data) ? rv.data.productores : null
    if (Array.isArray(productores)) agentes = productores
  }
  const u = await db.from('metricas_publicaciones').update({ hitl_id: cuerpo.hitl_id, ...soloMedido({ oficina_encargo_id: texto(metadata.oficina_encargo_id) }), agentes, actualizado_en: ahora.toISOString() }).eq('id', cuerpo.publicacion_id)
  if (u.error) return mal(500, 'metricas_error', u.error.message)
  return { status: 200, body: { ok: true, publicacion_id: cuerpo.publicacion_id, hitl_id: cuerpo.hitl_id, agentes } }
}

/* ───────── leer ───────── */

const INTERACCION = ['me_gusta', 'comentarios', 'guardados', 'compartidos'] as const
/** la suma de lo que exista; sin ningún dato es nulo, no cero */
export function interaccionDe(m: Fila): number | null {
  const vals = INTERACCION.map((k) => numero(m[k])).filter((v): v is number => v !== null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}
const sumar = (vals: Array<number | null>): number | null => {
  const hay = vals.filter((v): v is number => v !== null)
  return hay.length ? hay.reduce((a, b) => a + b, 0) : null
}

/** GET /api/metricas/resumen: general, por red y las mejores piezas. Una red sin dato se declara; no cuenta como cero */
export async function leerResumen(db: Db, clientId: unknown, diasPedidos: unknown, ahora: Date = new Date()): Promise<Respuesta> {
  if (typeof clientId !== 'string' || !UUID.test(clientId)) return mal(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const n = Number(diasPedidos)
  const dias = Number.isInteger(n) && n > 0 ? Math.min(n, MAX_DIAS) : DIAS_POR_OMISION
  const desde = new Date(ahora.getTime() - dias * 86_400_000).toISOString().slice(0, 10)

  const c = await db.from('metricas_cuentas').select('id, red, handle, acceso').eq('client_id', clientId).eq('activo', true)
  if (c.error) return mal(500, 'metricas_error', c.error.message)
  const cuentas = filasDe(c)
  const ids = cuentas.map((x) => x.id)
  let mediciones: Fila[] = []
  if (ids.length) {
    const m = await db.from('metricas_cuenta_mediciones').select('cuenta_id, dia, fuente, seguidores, medido_en').in('cuenta_id', ids).gte('dia', desde).order('dia', { ascending: true })
    if (m.error) return mal(500, 'metricas_error', m.error.message)
    mediciones = filasDe(m)
  }
  const por_red = cuentas.map((cu) => {
    // el mismo día, manda el acceso oficial sobre lo raspado
    const delDia = new Map<string, Fila>()
    for (const f of mediciones.filter((x) => x.cuenta_id === cu.id)) {
      const ya = delDia.get(String(f.dia))
      if (!ya || f.fuente === 'api' || ya.fuente !== 'api') delDia.set(String(f.dia), f)
    }
    const serie = [...delDia.values()].map((f) => ({ dia: f.dia, seguidores: numero(f.seguidores) }))
    const conDato = serie.filter((s) => s.seguidores !== null)
    const ultimo = conDato.at(-1)?.seguidores ?? null
    const primero = conDato[0]?.seguidores ?? null
    const fin = [...delDia.values()].at(-1)
    return { red: cu.red, handle: cu.handle ?? null, acceso: cu.acceso, seguidores: ultimo, crecimiento_seguidores: ultimo !== null && primero !== null ? ultimo - primero : null, serie, actualizado_en: fin?.medido_en ?? null }
  })

  const p = await db.from('metricas_publicaciones').select('id, red, url, tipo, publicado_en, hitl_id, oficina_encargo_id, agentes').eq('client_id', clientId).eq('es_propia', true)
  if (p.error) return mal(500, 'metricas_error', p.error.message)
  const propias = filasDe(p)
  let ultimas: Fila[] = []
  if (propias.length) {
    const u = await db.from('metricas_publicacion_ultima').select('*').in('publicacion_id', propias.map((x) => x.id)).gte('dia', desde)
    if (u.error) return mal(500, 'metricas_error', u.error.message)
    ultimas = filasDe(u)
  }
  const piezas = propias.flatMap((x) => {
    const m = ultimas.find((u) => u.publicacion_id === x.id)
    if (!m) return []
    return [{
      red: x.red, url: x.url ?? null, tipo: x.tipo ?? null, publicado_en: x.publicado_en ?? null,
      me_gusta: numero(m.me_gusta), comentarios: numero(m.comentarios), vistas: numero(m.vistas), alcance: numero(m.alcance), guardados: numero(m.guardados), compartidos: numero(m.compartidos), clics: numero(m.clics),
      interaccion: interaccionDe(m),
      // al llegar el acceso oficial suma más cosas: sin esto, la curva daría un salto falso
      interaccion_incluye: INTERACCION.filter((k) => numero(m[k]) !== null),
      pieza: x.hitl_id ? { hitl_id: x.hitl_id, oficina_encargo_id: x.oficina_encargo_id ?? null } : null,
      agentes: Array.isArray(x.agentes) ? x.agentes : [],
    }]
  })
  const mejores_piezas = piezas.filter((x) => x.interaccion !== null).sort((a, b) => (b.interaccion as number) - (a.interaccion as number)).slice(0, MAX_MEJORES_PIEZAS)

  const conDato = por_red.filter((r) => r.serie.length > 0).map((r) => String(r.red))
  const conocidas = [...new Set([...REDES_DEL_CANON, ...cuentas.map((x) => String(x.red))])]
  return {
    status: 200,
    body: {
      general: {
        seguidores: sumar(por_red.map((r) => r.seguidores)),
        crecimiento_seguidores: sumar(por_red.map((r) => r.crecimiento_seguidores)),
        interaccion: sumar(piezas.map((x) => x.interaccion)),
        vistas: sumar(piezas.map((x) => x.vistas)),
        redes_con_dato: new Set(conDato).size,
        redes_sin_dato: conocidas.filter((r) => !conDato.includes(r)),
      },
      por_red,
      mejores_piezas,
      dias,
    },
  }
}
