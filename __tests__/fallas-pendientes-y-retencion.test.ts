/**
 * «FALLAS PENDIENTES Y RETENCIÓN» (01-nov · CC-CEREBRO) · US$ 0, sin red: la base, el almacén y el servicio de voz son falsos.
 * (1a) cada paso largo es su propia llamada y «hecha» solo al terminar · (1b) el rastro del día no choca · (2b) transcripción · (2c) etiquetado de la bodega · (3) retención de 90 días.
 */
import { describe, it, expect } from 'vitest'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { alimentarCliente } from '../src/lib/portero-alimenta/alimentar'
import { cerrarPaso, MAX_INTENTOS_DE_UN_PASO, PLAZO_DE_UN_PASO_MS, reclamarPaso, siguientePaso, type Db } from '../src/lib/portero-alimenta/pasos-diarios'
import { correrUnPaso, correrElSiguientePaso } from '../src/lib/portero-alimenta/redes-ruta'
import { costoDeWhisper, SIN_AUDIO_LEGIBLE, SIN_VOZ, textoDeVoz, transcribirVideos, TOPE_DE_TRANSCRIPCION_POR_CORRIDA_USD } from '../src/lib/portero-alimenta/transcripcion-de-videos'
import { DIAS_DE_UN_VIDEO_EN_LA_BODEGA, retenerLaBodega } from '../src/lib/portero-alimenta/retencion-de-la-bodega'
import { crearEscritor } from '../src/lib/cerebro/portero/etiqueta-escritura'
import { etiquetarPendientes } from '../src/lib/cerebro/portero/fotos-pendientes'
import { CLAVE_DE_LA_BODEGA } from '../src/lib/cerebro/portero/clave-de-la-bodega'

type Fila = Record<string, unknown>
const ahora = new Date('2026-11-01T15:00:00Z')
const DIA = '2026-11-01'
const CID = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'

/** una base mínima CON clave única (client_id, dia, paso), como la tabla real */
function basePasos(inicial: Fila[] = []) {
  const filas: Fila[] = inicial.map((f, i) => ({ id: `p${i}`, ...f }))
  let n = 100
  const db: Db = {
    from() {
      const filtros: Array<[string, unknown]> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Fila = {}
      let devolver = false
      const q: Record<string, unknown> = {}
      const quien = () => filas.filter((f) => filtros.every(([c, v]) => f[c] === v))
      const ejecutar = () => {
        if (op === 'insert') {
          if (filas.some((f) => f.client_id === payload.client_id && f.dia === payload.dia && f.paso === payload.paso)) return { data: null, error: { message: 'duplicate key value violates unique constraint "cerebro_pasos_diarios_client_id_dia_paso_key"' } }
          const nueva = { id: `p${++n}`, ...payload }; filas.push(nueva); return { data: devolver ? [{ id: nueva.id }] : null, error: null }
        }
        if (op === 'update') { const x = quien(); x.forEach((f) => Object.assign(f, payload)); return { data: devolver ? x.map((f) => ({ id: f.id })) : null, error: null } }
        return { data: quien().map((f) => ({ ...f })), error: null }
      }
      q.select = () => { devolver = true; return q }
      q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
      q.limit = () => q
      q.insert = (f: Fila) => { op = 'insert'; payload = f; return q }
      q.update = (f: Fila) => { op = 'update'; payload = f; return q }
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej)
      return q
    },
  }
  return { db, filas }
}
const minutos = (m: number) => new Date(ahora.getTime() + m * 60_000)

// ───────────────────────────────────────── 1a · pasos
describe('1a · cada paso es su propia llamada y «hecha» solo al terminar', () => {
  it('el primero se reclama; una segunda llamada a la vez NO lo corre (queda en curso)', async () => {
    const { db } = basePasos()
    const a = await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora })
    expect(a).toMatchObject({ ok: true, intento: 1 })
    expect(await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: minutos(1) })).toMatchObject({ ok: false, motivo: 'en_curso' })
  })
  it('🔴 un paso cortado (en curso pasado el plazo) se retoma; el rastro NO dice «hecha» hasta que cierra', async () => {
    const { db, filas } = basePasos()
    const a = await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'bodega', ahora })
    expect(filas[0].estado).toBe('en_curso') // la llamada murió aquí: sigue en curso, nunca "hecha"
    const b = await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'bodega', ahora: new Date(ahora.getTime() + PLAZO_DE_UN_PASO_MS + 1000) })
    expect(b).toMatchObject({ ok: true, intento: 2 })
    expect((b as { id: string }).id).toBe((a as { id: string }).id)
  })
  it('🔴 tras 3 intentos se abandona: no hay reintento infinito', async () => {
    const { db, filas } = basePasos()
    let t = ahora
    for (let i = 1; i <= MAX_INTENTOS_DE_UN_PASO; i++) {
      const r = await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: t })
      expect(r).toMatchObject({ ok: true, intento: i })
      t = new Date(t.getTime() + PLAZO_DE_UN_PASO_MS + 1000)
    }
    expect(await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: t })).toMatchObject({ ok: false, motivo: 'abandonada' })
    expect(filas[0].estado).toBe('abandonada')
  })
  it('cerrar: sin errores = hecha; con errores = con_errores; una hecha no se vuelve a correr', async () => {
    const { db, filas } = basePasos()
    const r = (await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora })) as { id: string }
    await cerrarPaso(db, { id: r.id, ahora, errores: [], resumen: { x: 1 }, gastoUsd: 0.1234567 })
    expect(filas[0]).toMatchObject({ estado: 'hecha', gasto_usd: 0.123457 })
    expect(await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: minutos(30) })).toMatchObject({ ok: false, motivo: 'ya_hecha' })
    const { db: db2, filas: f2 } = basePasos()
    const r2 = (await reclamarPaso(db2, { clientId: CID, dia: DIA, paso: 'bodega', ahora })) as { id: string }
    await cerrarPaso(db2, { id: r2.id, ahora, errores: ['algo'], resumen: {}, gastoUsd: 0 })
    expect(f2[0].estado).toBe('con_errores')
    expect(await reclamarPaso(db2, { clientId: CID, dia: DIA, paso: 'bodega', ahora: minutos(30) })).toMatchObject({ ok: false, motivo: 'ya_hecha' })
  })
  it('el siguiente pendiente: orden de clientes y de pasos; salta lo hecho, lo abandonado y lo que corre ahora', async () => {
    const { db } = basePasos([
      { client_id: 'A', dia: DIA, paso: 'cuentas_y_comentarios', estado: 'hecha', iniciado_en: ahora.toISOString() },
      { client_id: 'A', dia: DIA, paso: 'tendencias', estado: 'en_curso', iniciado_en: ahora.toISOString() },
      { client_id: 'A', dia: DIA, paso: 'bodega', estado: 'abandonada', iniciado_en: ahora.toISOString() },
    ])
    const s = await siguientePaso(db, { clientes: ['A', 'B'], dia: DIA, ahora: minutos(1) })
    expect(s).toMatchObject({ ok: true, siguiente: { clientId: 'A', paso: 'transcripcion' } })
    // y uno en curso ATASCADO vuelve a ser pendiente
    const t = await siguientePaso(db, { clientes: ['A'], dia: DIA, ahora: new Date(ahora.getTime() + PLAZO_DE_UN_PASO_MS + 1000) })
    expect(t).toMatchObject({ ok: true, siguiente: { clientId: 'A', paso: 'tendencias' } })
    // otro día: todo vuelve a empezar
    expect(await siguientePaso(db, { clientes: ['A'], dia: '2026-11-02', ahora })).toMatchObject({ ok: true, siguiente: { clientId: 'A', paso: 'cuentas_y_comentarios' }, pendientes: 4 })
  })
  it('🔴 dos llamadas que retoman el MISMO paso atascado a la vez: gana una sola', async () => {
    const { db, filas } = basePasos([{ client_id: CID, dia: DIA, paso: 'tendencias', estado: 'en_curso', intentos: 1, iniciado_en: ahora.toISOString() }])
    const tarde = new Date(ahora.getTime() + PLAZO_DE_UN_PASO_MS + 1000)
    const [a, b] = await Promise.all([reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde }), reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde })])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(filas[0].intentos).toBe(2)
  })
  it('un paso abandonado no se retoma ni vuelve a ser pendiente aunque pase el plazo', async () => {
    const hecha = (paso: string) => ({ client_id: CID, dia: DIA, paso, estado: 'hecha', intentos: 1, iniciado_en: ahora.toISOString() })
    const { db } = basePasos([hecha('cuentas_y_comentarios'), hecha('bodega'), hecha('transcripcion'), { client_id: CID, dia: DIA, paso: 'tendencias', estado: 'abandonada', intentos: 1, iniciado_en: ahora.toISOString() }])
    const tarde = new Date(ahora.getTime() + PLAZO_DE_UN_PASO_MS * 3)
    expect(await reclamarPaso(db, { clientId: CID, dia: DIA, paso: 'tendencias', ahora: tarde })).toMatchObject({ ok: false, motivo: 'abandonada' })
    const s = await siguientePaso(db, { clientes: [CID], dia: DIA, ahora: tarde })
    expect(s).toMatchObject({ ok: true, siguiente: null, pendientes: 0 })
  })
  it('el cron sin pendientes responde «no hay pendientes» y no corre nada', async () => {
    const { db, filas } = basePasos(['cuentas_y_comentarios', 'tendencias', 'bodega', 'transcripcion'].map((paso) => ({ client_id: CID, dia: DIA, paso, estado: 'hecha', intentos: 1, iniciado_en: ahora.toISOString() })))
    const r = await correrElSiguientePaso({ db: db as never, ahora, env: { PORTERO_TENDENCIAS: 'on', PORTERO_FUENTES_NUEVAS: 'off' }, clientes: [CID] }, { workflowId: 'w', ejecucionId: 'e' })
    expect(r).toMatchObject({ ok: true, estado: 'no_hay_pendientes', pendientes: 0 })
    expect(filas).toHaveLength(4)
  })
  it('apagado (PORTERO_TENDENCIAS) no reclama ni escribe; en seco tampoco', async () => {
    const { db, filas } = basePasos()
    const apagado = await correrUnPaso({ db: db as never, ahora, env: {} }, { clientId: CID, paso: 'tendencias', workflowId: 'w', ejecucionId: 'e', dry_run: false })
    expect(apagado).toMatchObject({ ok: true, estado: 'apagado' })
    const seco = await correrUnPaso({ db: db as never, ahora, env: { PORTERO_TENDENCIAS: 'on' } }, { clientId: CID, paso: 'tendencias', workflowId: 'w', ejecucionId: 'e', dry_run: true })
    expect(seco).toMatchObject({ ok: true, estado: 'seco' })
    expect(filas).toHaveLength(0)
    expect(await correrElSiguientePaso({ db: db as never, ahora, env: {} }, { workflowId: 'w', ejecucionId: 'e' })).toMatchObject({ estado: 'apagado' })
  })
  it('un paso corrido de verdad queda hecha con su gasto; un cliente inexistente queda con_errores (no «hecha»)', async () => {
    const { db, filas } = basePasos()
    const tablas = crearBaseFalsa({ clients: [], client_sedes: [] }).db
    const mixta: Db = { from: (t: string) => (t === 'cerebro_pasos_diarios' ? db.from(t) : tablas.from(t)) }
    const r = await correrUnPaso({ db: mixta, ahora, env: { PORTERO_TENDENCIAS: 'on' } }, { clientId: 'no-existe', paso: 'tendencias', workflowId: 'w', ejecucionId: 'e', dry_run: false })
    expect(r).toMatchObject({ estado: 'con_errores', rastro_cerrado: true })
    expect(filas[0].estado).toBe('con_errores')
  })
  it('el cron corre UN paso por llamada y las llamadas siguientes siguen con el próximo', async () => {
    const { db, filas } = basePasos()
    const tablas = crearBaseFalsa({ clients: [{ id: CID, name: 'N', config: {} }], client_sedes: [], client_videos: [] }).db
    const mixta: Db = { from: (t: string) => (t === 'cerebro_pasos_diarios' ? db.from(t) : tablas.from(t)) }
    const traer = async () => new Response('[]', { status: 200 })
    const d = { db: mixta, ahora, env: { PORTERO_TENDENCIAS: 'on', NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, fetch: traer, clientes: [CID] }
    const r1 = await correrElSiguientePaso(d, { workflowId: 'w', ejecucionId: 'e1' })
    expect(r1).toMatchObject({ estado: 'hecha', paso: 'cuentas_y_comentarios' })
    const r2 = await correrElSiguientePaso(d, { workflowId: 'w', ejecucionId: 'e2' })
    expect(r2).toMatchObject({ paso: 'tendencias' })
    expect(filas.map((f) => f.paso)).toEqual(['cuentas_y_comentarios', 'tendencias'])
  })
})

// ───────────────────────────────────────── 1b · el rastro del día
describe('1b · el rastro del día no choca con la clave única', () => {
  it('🔴 si otra corrida escribió el rastro entre la lectura y la escritura, se actualiza ese renglón (no queda «duplicate key»)', async () => {
    const tablas: Record<string, Fila[]> = { clients: [{ id: CID, name: 'Náufrago', config: {} }], client_sedes: [], apify_raw: [], cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [] }
    const b = crearBaseFalsa(tablas as never)
    let choques = 0
    const db = {
      from(t: string) {
        const q = b.db.from(t) as Record<string, unknown>
        if (t !== 'cerebro_portero_corridas') return q
        const insertar = q.insert as (f: Fila) => unknown
        q.insert = (f: Fila) => {
          if (choques++ === 0) {
            // la otra corrida ya lo escribió
            tablas.cerebro_portero_corridas.push({ id: 'ayer', client_id: f.client_id, dia: '2026-10-31', estado: 'hecha', resumen: { de: 'ayer' } })
            tablas.cerebro_portero_corridas.push({ id: 'otra', client_id: f.client_id, dia: f.dia, estado: 'hecha', resumen: { de: 'otra' } })
            return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint "cerebro_portero_corridas_una_por_dia"' } })
          }
          return insertar(f)
        }
        return q
      },
    }
    const r = await alimentarCliente({ db, client_id: CID, dry_run: false, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora, workflow_id: 'w', workflow_execution_id: 'e' })
    expect(r.errores).toEqual([])
    expect(r.estado).toBe('hecha')
    expect(tablas.cerebro_portero_corridas).toHaveLength(2)
    // se actualizó el de HOY y el de ayer quedó intacto
    expect((tablas.cerebro_portero_corridas.find((f) => f.id === 'otra')!.resumen as Fila).ultima_corrida_en).toBe(ahora.toISOString())
    expect(tablas.cerebro_portero_corridas.find((f) => f.id === 'ayer')!.resumen).toEqual({ de: 'ayer' })
  })
  it('otro error del rastro NO se disfraza de choque: se dice', async () => {
    const b = crearBaseFalsa({ clients: [{ id: CID, name: 'N', config: {} }], client_sedes: [], apify_raw: [], cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [] } as never)
    const db = { from(t: string) { const q = b.db.from(t) as Record<string, unknown>; if (t === 'cerebro_portero_corridas') q.insert = () => Promise.resolve({ data: null, error: { message: 'permission denied' } }); return q } }
    const r = await alimentarCliente({ db, client_id: CID, dry_run: false, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora, workflow_id: 'w', workflow_execution_id: 'e' })
    expect(r.estado).toBe('con_errores')
    expect(r.errores.join(' ')).toMatch(/rastro: permission denied/)
  })
  it('procesar ya NO corre las redes dentro de la misma llamada (cada una es su paso)', async () => {
    const b = crearBaseFalsa({ clients: [{ id: CID, name: 'N', config: {} }], client_sedes: [], apify_raw: [], cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [] } as never)
    let llamadas = 0
    const r = await alimentarCliente({ db: b.db, client_id: CID, dry_run: false, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora, workflow_id: 'w', workflow_execution_id: 'e', env: { PORTERO_TENDENCIAS: 'on', APIFY_API_TOKEN: 't' }, fetch: (async () => { llamadas++; return new Response('[]') }) as never })
    expect(r.tendencias).toBeUndefined()
    expect(r.cuentas_de_redes).toBeUndefined()
    expect(r.comentarios_de_redes).toBeUndefined()
    expect(llamadas).toBe(0)
  })
})

// ───────────────────────────────────────── 2b · transcripción
interface Video { id: string; post_id: string; path: string; bytes: number | null; duracion_s: number | null; transcripcion?: string | null }
function almacenFalso(videos: Video[], voz: (v: Video) => string | Response) {
  const parches: Array<{ id: string; url: string; cuerpo: Fila }> = []
  const urls: string[] = []
  let whisper = 0
  const traer = async (u: string, i?: RequestInit): Promise<Response> => {
    urls.push(`${i?.method ?? 'GET'} ${u}`)
    if (u.includes('/rest/v1/client_videos') && (i?.method ?? 'GET') === 'GET') return new Response(JSON.stringify(videos.filter((v) => v.transcripcion == null)), { status: 200 })
    if (u.includes('/storage/v1/object/client-videos/')) return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 200 })
    if (u.includes('api.openai.com/v1/audio/transcriptions')) {
      whisper++
      const v = videos[whisper - 1]
      const x = voz(v)
      return x instanceof Response ? x : new Response(JSON.stringify({ text: x }), { status: 200 })
    }
    if (u.includes('/rest/v1/client_videos') && i?.method === 'PATCH') { parches.push({ id: /id=eq\.([^&]+)/.exec(u)?.[1] ?? '', url: u, cuerpo: JSON.parse(String(i.body)) }); return new Response(null, { status: 204 }) }
    if (u.includes('/api/agents/log-invocation')) return new Response('{}', { status: 200 })
    return new Response('?', { status: 404 })
  }
  return { traer, parches, urls, whisperLlamadas: () => whisper }
}
const BASE = { urlDeLaBase: 'https://x.supabase.co', llave: 'k', openaiKey: 'o' }
describe('2b · transcripción de los videos guardados', () => {
  const v = (n: number, extra: Partial<Video> = {}): Video => ({ id: `id${n}`, post_id: `p${n}`, path: `bodega/referencia/h/p${n}.mp4`, bytes: 1_000_000, duracion_s: 30, ...extra })
  it('escribe el texto de la voz; sin voz deja «[sin voz]» (así no se paga dos veces)', async () => {
    const a = almacenFalso([v(1), v(2)], (x) => (x.id === 'id1' ? 'Hola a todos, hoy les muestro cómo apagar un fuego' : 'mm'))
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer })
    expect(r).toMatchObject({ pendientes: 2, transcritos: 1, sin_voz: 1, fallidos: [] })
    expect(a.parches.map((p) => p.cuerpo.transcripcion)).toEqual(['Hola a todos, hoy les muestro cómo apagar un fuego', SIN_VOZ])
  })
  it('🔴 nunca pisa una transcripción que otro paso ya puso (el parche exige que siga vacía)', async () => {
    const a = almacenFalso([v(1)], () => 'una frase con varias palabras claras')
    await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer })
    expect(a.parches[0].url).toContain('transcripcion=is.null')
  })
  it('🔴 la bodega lee solo `client_id is null`; un cliente, solo el suyo', async () => {
    const a = almacenFalso([v(1)], () => 'una frase con varias palabras claras')
    await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer })
    expect(a.urls[0]).toContain('client_id=is.null')
    const b = almacenFalso([v(1)], () => 'una frase con varias palabras claras')
    await transcribirVideos({ clientId: CID, ...BASE, fetchImpl: b.traer })
    expect(b.urls[0]).toContain(`client_id=eq.${CID}`)
    expect(b.urls[0]).toContain('archivo_borrado_en=is.null')
  })
  it('omite lo que no se puede transcribir (más de 10 min si es chico; más de 30 min si es grande) sin llamar al servicio', async () => {
    const a = almacenFalso([v(1, { bytes: 30_000_000, duracion_s: 2000 }), v(2, { duracion_s: 700 })], () => 'no debería llamarse')
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer })
    expect(r.omitidos.map((o) => o.post_id)).toEqual(['p1', 'p2'])
    expect(a.whisperLlamadas()).toBe(0)
  })
  it('🔴 un fallo del servicio se DICE y no se escribe como «sin voz»', async () => {
    const a = almacenFalso([v(1)], () => new Response('cuota agotada', { status: 429 }))
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer })
    expect(r.fallidos[0].causa).toMatch(/429/)
    expect(a.parches).toHaveLength(0)
    expect(r.sin_voz).toBe(0)
  })
  it('un archivo cuyo audio el servicio no puede leer (400) se MARCA y se dice: no se reintenta cada día ni se disfraza de «sin voz»', async () => {
    const a = almacenFalso([v(1)], () => new Response('{"error":{"message":"The audio file could not be decoded or its format is not supported"}}', { status: 400 }))
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer })
    expect(a.parches.map((p) => p.cuerpo.transcripcion)).toEqual([SIN_AUDIO_LEGIBLE])
    expect(r.omitidos[0].causa).toMatch(/no pudo leer el audio/)
    expect(r).toMatchObject({ transcritos: 0, sin_voz: 0, fallidos: [], costo_usd: 0 })
  })
  it('tope por corrida (cantidad y dinero) y costo exacto por minuto', async () => {
    expect(costoDeWhisper(60)).toBe(0.006)
    expect(costoDeWhisper(30)).toBe(0.003)
    const muchos = Array.from({ length: 10 }, (_, i) => v(i + 1))
    const a = almacenFalso(muchos, () => 'una frase con varias palabras claras')
    const r = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: a.traer, max: 3 })
    expect(r.transcritos).toBe(3)
    const largos = Array.from({ length: 30 }, (_, i) => v(i + 1, { duracion_s: 600 }))
    const b = almacenFalso(largos, () => 'una frase con varias palabras claras')
    const r2 = await transcribirVideos({ clientId: null, ...BASE, fetchImpl: b.traer, max: 30 })
    expect(r2.costo_usd).toBeLessThanOrEqual(TOPE_DE_TRANSCRIPCION_POR_CORRIDA_USD)
    expect(r2.omitidos_por_tope).toBeGreaterThan(0)
  })
  it('registra el gasto en la libreta (una fila por video) y sin llave de voz no hace nada', async () => {
    const a = almacenFalso([v(1)], () => 'una frase con varias palabras claras')
    await transcribirVideos({ clientId: CID, ...BASE, fetchImpl: a.traer, registro: { origen: 'https://app', llaveInterna: 'i', workflowId: 'w', ejecucionId: 'e' } })
    expect(a.urls.filter((u) => u.includes('log-invocation'))).toHaveLength(1)
    const b = almacenFalso([v(1)], () => 'x')
    const r = await transcribirVideos({ clientId: null, urlDeLaBase: BASE.urlDeLaBase, llave: 'k', openaiKey: '', fetchImpl: b.traer })
    expect(r.fallidos[0].causa).toMatch(/llave/)
    expect(b.parches).toHaveLength(0)
  })
  it('textoDeVoz: menos de 3 palabras = sin voz', () => {
    expect(textoDeVoz('Thank you.')).toBe('')
    expect(textoDeVoz('  hola   a todos  ')).toBe('hola a todos')
  })
})

// ───────────────────────────────────────── 2c · etiquetado de la bodega
describe('2c · el etiquetado de las capturas de la bodega (sin cliente)', () => {
  it('lee las fotos con `client_id is null` y las etiqueta con la clave «bodega»', async () => {
    const lecturas: Array<Record<string, unknown>> = []
    const consulta = async (p: { tabla: string; donde: Record<string, unknown> }) => { lecturas.push(p.donde); return { filas: [{ id: 'f1', owner_role: 'referencia', estado: 'ok', etiquetada_en: null, duplicado_de: null, hash_archivo: 'h1', created_at: '2026-11-01T00:00:00Z' }], error: null } }
    const pedidas: Array<{ cliente: string; foto_id: string }> = []
    const r = await etiquetarPendientes({ consulta: consulta as never, etiquetarFoto: async (a) => { pedidas.push(a); return { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 } } }, { clientes: [CLAVE_DE_LA_BODEGA], dry_run: false, tope_por_cliente: 5 })
    expect(lecturas[0]).toMatchObject({ client_id: null, estado: 'ok' })
    expect(pedidas).toEqual([{ cliente: 'bodega', foto_id: 'f1' }])
    expect(r.etiquetadas).toBe(1)
  })
  it('🔴 el escritor de etiquetas actualiza `client_id is null` para la bodega y `client_id = X` para un cliente (nunca uno sin el otro)', async () => {
    const urls: string[] = []
    const escribir = crearEscritor({ urlDeLaBase: 'https://x.supabase.co', llave: 'k', fetchImpl: async (u) => { urls.push(u); return new Response(null, { status: 204 }) } })
    const valores = { que_muestra: 'un extintor', producto_visto: [], etiquetada_en: ahora.toISOString(), etiqueta_modelo: 'm', texto_visible: '', etiqueta_confianza: 'alta' as const }
    expect((await escribir({ foto_id: 'f1', cliente: 'bodega', valores })).ok).toBe(true)
    expect((await escribir({ foto_id: 'f2', cliente: CID, valores })).ok).toBe(true)
    expect(urls[0]).toContain('id=eq.f1&client_id=is.null')
    expect(urls[1]).toContain(`id=eq.f2&client_id=eq.${CID}`)
  })
})

// ───────────────────────────────────────── 3 · retención
describe('3 · retención de 90 días SOLO en la bodega: se borra el archivo, no el resto', () => {
  function almacen(filas: Array<{ id: string; path: string; bytes: number | null }>, opciones: { borrado?: number } = {}) {
    const llamadas: Array<{ metodo: string; url: string; cuerpo?: Fila }> = []
    const traer = async (u: string, i?: RequestInit): Promise<Response> => {
      const metodo = i?.method ?? 'GET'
      llamadas.push({ metodo, url: u, cuerpo: i?.body ? JSON.parse(String(i.body)) : undefined })
      if (metodo === 'GET') return new Response(JSON.stringify(filas), { status: 200 })
      if (metodo === 'DELETE') return new Response('', { status: opciones.borrado ?? 200 })
      return new Response(null, { status: 204 })
    }
    return { traer, llamadas }
  }
  const e = { urlDeLaBase: 'https://x.supabase.co', llave: 'k', ahora }
  it('el corte son 90 días y la lectura pide SOLO la bodega (client_id is null)', async () => {
    const a = almacen([])
    const r = await retenerLaBodega({ ...e, dry_run: true, fetchImpl: a.traer })
    expect(DIAS_DE_UN_VIDEO_EN_LA_BODEGA).toBe(90)
    expect(r.corte).toBe(new Date(ahora.getTime() - 90 * 86_400_000).toISOString())
    expect(a.llamadas[0].url).toContain('client_id=is.null')
    expect(a.llamadas[0].url).toContain('archivo_borrado_en=is.null')
    expect(a.llamadas[0].url).toContain('created_at=lt.')
  })
  it('en seco cuenta y no borra nada', async () => {
    const a = almacen([{ id: 'v1', path: 'bodega/referencia/h/p1.mp4', bytes: 5 }])
    const r = await retenerLaBodega({ ...e, dry_run: true, fetchImpl: a.traer })
    expect(r.vencidos).toBe(1)
    expect(a.llamadas.filter((c) => c.metodo !== 'GET')).toHaveLength(0)
  })
  it('real: borra el archivo y deja la fila con path vacío y la fecha del borrado (capturas, etiquetas, transcripción y datos no se tocan)', async () => {
    const a = almacen([{ id: 'v1', path: 'bodega/referencia/h/p1.mp4', bytes: 5000 }])
    const r = await retenerLaBodega({ ...e, dry_run: false, fetchImpl: a.traer })
    expect(r).toMatchObject({ borrados: 1, bytes_liberados: 5000, fallidos: [] })
    const d = a.llamadas.find((c) => c.metodo === 'DELETE')!
    expect(d.url).toContain('/storage/v1/object/client-videos/bodega/referencia/h/p1.mp4')
    const p = a.llamadas.find((c) => c.metodo === 'PATCH')!
    expect(p.cuerpo).toEqual({ path: null, archivo_borrado_en: ahora.toISOString() })
    expect(Object.keys(p.cuerpo!).sort()).toEqual(['archivo_borrado_en', 'path'])
    expect(p.url).toContain('id=eq.v1&client_id=is.null')
    expect(a.llamadas.filter((c) => c.metodo === 'DELETE')).toHaveLength(1)
  })
  it('🔴 un archivo que NO es de la bodega jamás se borra (ruta de un cliente)', async () => {
    const a = almacen([{ id: 'v1', path: `${CID}/propio/h/p1.mp4`, bytes: 5 }])
    const r = await retenerLaBodega({ ...e, dry_run: false, fetchImpl: a.traer })
    expect(r.borrados).toBe(0)
    expect(r.fallidos[0].causa).toMatch(/no es de la bodega/)
    expect(a.llamadas.filter((c) => c.metodo !== 'GET')).toHaveLength(0)
  })
  it('un archivo ya ausente (404) igual se anota; un error del almacén NO marca la fila', async () => {
    const ausente = almacen([{ id: 'v1', path: 'bodega/a/b/c.mp4', bytes: 1 }], { borrado: 404 })
    expect((await retenerLaBodega({ ...e, dry_run: false, fetchImpl: ausente.traer })).borrados).toBe(1)
    const roto = almacen([{ id: 'v1', path: 'bodega/a/b/c.mp4', bytes: 1 }], { borrado: 500 })
    const r = await retenerLaBodega({ ...e, dry_run: false, fetchImpl: roto.traer })
    expect(r.borrados).toBe(0)
    expect(r.fallidos[0].causa).toMatch(/500/)
    expect(roto.llamadas.filter((c) => c.metodo === 'PATCH')).toHaveLength(0)
  })
})
