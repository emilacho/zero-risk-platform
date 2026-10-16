/**
 * GUARDA PERMANENTE · ninguna llamada a una ruta del portero pasa de su presupuesto de tiempo, aunque el cliente lleve MESES de datos (16-oct · ④ pasó de 120 s → 504 → el flujo se apagó).
 * Los diez clientes de prueba, cada uno con un historial grande (cientos de páginas ya vistas, cientos de fichas sin trozo en el índice). La base falsa y el índice falso «tardan»
 * (4 ms por consulta ≈ 130 ms reales; 50 ms por trozo ≈ 1,6 s reales; escala 1/32): se mide el tiempo de pared y se convierte a tiempo real.
 *   · alimentar (leer + escribir fichas y vistas) cabe en el presupuesto de la ruta;
 *   · el puente respeta la hora límite que recibe, dice cuánto QUEDA y varias pasadas lo drenan hasta 0 sin duplicar nada;
 *   · todas las rutas del portero declaran un tope de la plataforma que cubre lo que el flujo espera.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { agenteDelRoster, puenteAlIndice } from '../entorno'
import { auditarCitasDelResumen } from '../auditoria'
import { reconciliarYEnviar } from '../rutas'
import { enTandas, PRESUPUESTO_DE_RUTA_MS, PRESUPUESTO_DEL_PUENTE_PROPIO_MS } from '../tandas'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const ESCALA = 32
let CONSULTA_MS = 4
const TROZO_MS = 50
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** envuelve la base falsa: cada consulta tarda CONSULTA_MS (como el viaje a la base real, a escala) */
function conLatencia(db: { from(t: string): any }) {
  return {
    from(tabla: string) {
      const q = db.from(tabla)
      const entonces = q.then.bind(q)
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => dormir(CONSULTA_MS).then(() => entonces(res, rej))
      return q
    },
  }
}

/** meses de historia: cientos de páginas del sitio ya vistas y cientos de fichas vivas que todavía no tienen trozo en el índice */
function conHistorial(c: ClienteSintetico): T {
  const t = tablasDe(c)
  const hace = new Date(AHORA.getTime() - 3_600_000).toISOString()
  const paginas = Array.from({ length: 300 }, (_v, i) => ({ url: `${c.web ?? 'https://sitio.example'}/pagina-${i}`, text: `Pagina ${i} de ${c.nombre}: novedad ${i} con detalle numero ${i * 7 + 3} para quien visite el negocio esta semana.` }))
  t.apify_raw.push({ id: `${c.id}-hist`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: hace, params: {}, metadata: { llamado_por: 'LyVoKcrypS5uLyuu' }, respuesta: paginas })
  // y meses de publicaciones propias en Instagram (para los clientes sin sitio)
  if (c.ig) t.apify_raw.push({ id: `${c.id}-hist-ig`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: hace, params: {}, respuesta: [{ username: c.ig, biography: c.bio, followersCount: 1200, postsCount: 340, latestPosts: Array.from({ length: 300 }, (_v, i) => ({ shortCode: `H${i}`, caption: `Publicacion ${i} de ${c.nombre}: mensaje distinto numero ${i * 11 + 5} para quienes nos siguen esta semana`, ownerUsername: c.ig, type: 'Image' })) }] })
  for (let i = 0; i < 400; i++) t.cerebro_fichas.push({ id: `f-${c.id}-${i}`, client_id: c.id, ref: `portero:sitio:hist-${i}`, clase: 'hecho', titulo: `Hecho ${i}`, contenido: `Contenido distinto numero ${i} de ${c.nombre}`, propiedad: 'propia', origen: 'cliente', descartada: false, retirada_en: null, huella: `h-${c.id}-${i}`, creado_en: hace, observado_en: hace, atributo: null })
  return t
}

describe('alimentar con meses de historia cabe en el presupuesto de la ruta (los diez clientes)', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais})`, async () => {
      // el cálculo (CPU) se mide aparte, sin latencia: solo la espera de la base se escala a tiempo real
      const correr = async (latenciaMs: number) => {
        CONSULTA_MS = latenciaMs
        const t = conHistorial(c)
        const base = crearBaseFalsa(t as never)
        const t0 = Date.now()
        const res = await alimentarCliente({ db: conLatencia(base.db), client_id: c.id, dry_run: false, interruptores: { ...ON, resumen_vivo: true }, ahora: AHORA, workflow_id: 'wf', workflow_execution_id: 'ex' })
        return { res, ms: Date.now() - t0 }
      }
      const sinEspera = await correr(0)
      const conEspera = await correr(4)
      CONSULTA_MS = 4
      const r = conEspera.res
      const realEquivalenteMs = sinEspera.ms + Math.max(0, conEspera.ms - sinEspera.ms) * ESCALA
      expect(r.errores).toEqual([])
      expect(r.unidades).toBeGreaterThan(100) // el historial se leyó de verdad: la prueba no es vacía
      expect(r.escrituras.vistas).toBeGreaterThan(100)
      // escribir el archivo usa a lo sumo un tercio del presupuesto de la ruta (el resto es del modelo, los brazos y el puente); una por una daba ~70 s
      expect(realEquivalenteMs).toBeLessThan(PRESUPUESTO_DE_RUTA_MS / 3)
    }, 60_000)
  }
})

describe('el puente respeta la hora límite, dice cuánto queda y se drena por pasadas', () => {
  for (const c of DIEZ_CLIENTES.slice(0, 4)) {
    it(`${c.nombre}: cada pasada ≤ presupuesto; varias pasadas llegan a quedan = 0 sin duplicar`, async () => {
      const t = conHistorial(c)
      const base = crearBaseFalsa(t as never)
      const db = conLatencia(base.db)
      const escritos: string[] = []
      const puente = puenteAlIndice({
        origen: 'https://x.example', llaveInterna: 'k', db: db as never,
        fetchImpl: async (_u, i) => { await dormir(TROZO_MS); const b = JSON.parse(String(i?.body)); escritos.push(b.source_id); (t.client_brain_chunks ??= []).push({ client_id: b.client_id, source_table: 'cerebro_fichas', source_id: b.source_id }); return { ok: true, status: 200 } as Response },
      })
      const deps = { db, interruptores: { ...ON, puente_al_indice: true }, puente } as never
      let quedan = Infinity
      const presupuesto = PRESUPUESTO_DEL_PUENTE_PROPIO_MS / ESCALA
      for (let pasada = 0; pasada < 30 && quedan > 0; pasada++) {
        const t0 = Date.now()
        const x = await reconciliarYEnviar(deps, c.id, false, presupuesto)
        expect((Date.now() - t0) * ESCALA).toBeLessThan(PRESUPUESTO_DEL_PUENTE_PROPIO_MS + 5_000) // la hora límite + el último trozo que ya estaba en vuelo
        expect(x.errores).toEqual([])
        quedan = Number(x.puente.quedan)
      }
      expect(quedan).toBe(0)
      expect(new Set(escritos).size).toBe(escritos.length) // nada escrito dos veces
      expect(escritos.length).toBe(400)
    }, 60_000)
  }

  it('con poco presupuesto la pasada se detiene a tiempo y lo que no cupo queda como pendiente', async () => {
    const c = DIEZ_CLIENTES[0]
    const t = conHistorial(c)
    const db = conLatencia(crearBaseFalsa(t as never).db)
    let escritos = 0
    const puente = puenteAlIndice({ origen: 'https://x.example', llaveInterna: 'k', db: db as never, fetchImpl: async () => { await dormir(TROZO_MS); escritos++; return { ok: true, status: 200 } as Response } })
    const x = await reconciliarYEnviar({ db, interruptores: { ...ON, puente_al_indice: true }, puente } as never, c.id, false, 2 * TROZO_MS)
    expect(escritos).toBeGreaterThan(0)
    expect(escritos).toBeLessThan(15) // sin hora límite habría escrito el lote entero (40)
    expect(Number(x.puente.quedan)).toBeGreaterThanOrEqual(400 - escritos)
  })

  it('sin presupuesto (0) el puente no escribe nada y deja todo como pendiente', async () => {
    const c = DIEZ_CLIENTES[0]
    const t = conHistorial(c)
    let llamadas = 0
    const deps = { db: crearBaseFalsa(t as never).db, interruptores: { ...ON, puente_al_indice: true }, puente: async () => { llamadas++; return { escritos: 0, sacados: 0, errores: [] } } } as never
    const x = await reconciliarYEnviar(deps, c.id, false, 0)
    expect(llamadas).toBe(0)
    expect(Number(x.puente.quedan)).toBeGreaterThanOrEqual(400)
  })

  it('con la hora límite ya vencida no arranca ningún trozo', async () => {
    let arrancados = 0
    const n = await enTandas([1, 2, 3, 4, 5], 3, async () => { arrancados++ }, Date.now() - 1)
    expect(n).toBe(0); expect(arrancados).toBe(0)
  })

  it('enTandas nunca corre más de k a la vez y los corre todos', async () => {
    let vivos = 0, maximo = 0, hechos = 0
    await enTandas(Array.from({ length: 30 }, (_v, i) => i), 4, async () => { vivos++; maximo = Math.max(maximo, vivos); await dormir(2); vivos--; hechos++ })
    expect(maximo).toBeLessThanOrEqual(4); expect(hechos).toBe(30)
  })
})

describe('todas las rutas del portero declaran un tope de la plataforma que cubre lo que el flujo espera', () => {
  const DIR = path.resolve(__dirname, '../../../app/api/brain/alimentar')
  const rutas = fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  for (const r of rutas) {
    it(`/${r}`, () => {
      const f = path.join(DIR, r, 'route.ts')
      if (!fs.existsSync(f)) return
      const m = /export const maxDuration = (\d+)/.exec(fs.readFileSync(f, 'utf8'))
      expect(m, `${r}: debe declarar maxDuration`).not.toBeNull()
      const seg = Number(m![1])
      expect(seg).toBeLessThanOrEqual(800)
      // las que llama el nodo ④ (procesar) o el ④ bis (puente) tienen que aguantar su presupuesto + margen
      if (r === 'procesar') expect(seg).toBeGreaterThanOrEqual(PRESUPUESTO_DE_RUTA_MS / 1000 + 30)
      if (r === 'puente') expect(seg).toBeGreaterThanOrEqual(PRESUPUESTO_DEL_PUENTE_PROPIO_MS / 1000 + 20)
    })
  }
})

describe('el pulido del resumen no puede comerse el presupuesto de la ruta', () => {
  it('si el agente no contesta en su plazo, se corta y lanza (el resumen queda armado por código)', async () => {
    const llamar = agenteDelRoster({
      origen: 'https://x.example', llaveInterna: 'k', workflowId: 'wf', ejecucionId: 'ex', clientId: 'c', agente: 'reporting_agent', topeUsd: 0.03, plazoMs: 60,
      fetchImpl: (_u, i) => new Promise<Response>((_res, rej) => { i?.signal?.addEventListener('abort', () => rej(new Error('abortado'))) }),
    })
    const t0 = Date.now()
    await expect(llamar('tarea')).rejects.toThrow()
    expect(Date.now() - t0).toBeLessThan(2000)
  })
})

describe('las citas del resumen se comprueban contra TODAS las fichas (la base entrega 1.000 por consulta)', () => {
  it('con 1.500 fichas, una cita a la ficha 1.400 existe', async () => {
    const fichas = Array.from({ length: 1500 }, (_v, i) => ({ id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, client_id: 'c1', clase: 'hecho', contenido: 'x', retirada_en: null, descartada: false }))
    fichas.push({ id: 'aaaaaaaa-0000-4000-8000-000000000000', client_id: 'c1', clase: 'resumen_vivo', contenido: 'Dato [ficha:00001400 · 2026-10-16] y otro [ficha:00000001 · 2026-10-16]', retirada_en: null, descartada: false })
    const base = crearBaseFalsa({ cerebro_fichas: fichas } as never, { topeDeFilas: 1000 })
    const r = await auditarCitasDelResumen(base.db, 'c1')
    expect(r).toMatchObject({ ok: true, problema: null })
  })
})

describe('el resumen vivo nunca cita una ficha que no existe (16-oct · el vigilante pausó a Náufrago por citas de ZONA)', () => {
  const resumen = (citas: string[]) => ({ id: 'aaaaaaaa-0000-4000-8000-000000000000', client_id: 'c1', clase: 'resumen_vivo', contenido: citas.map((c) => `- dato [ficha:${c} · 2026-10-16]`).join(' | '), retirada_en: null, descartada: false })
  it('una cita a una ficha de zona (feriados y temporadas) existe', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: [{ id: '6a9f94b0-aaaa-4000-8000-000000000000', client_id: 'zona:ec', clase: 'contexto_feriado', contenido: 'Dia de Difuntos', retirada_en: null }, resumen(['6a9f94b0'])] } as never)
    expect(await auditarCitasDelResumen(base.db, 'c1')).toMatchObject({ ok: true, revisadas: 1, problema: null })
  })
  it('una cita a una ficha que no está ni en el cliente ni en una zona SÍ se marca', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: [resumen(['deadbeef'])] } as never)
    const r = await auditarCitasDelResumen(base.db, 'c1')
    expect(r).toMatchObject({ ok: true })
    expect((r as { problema: string | null }).problema).toMatch(/deadbeef/)
  })
  it('una ficha de zona de OTRO cliente no es del cliente pero la zona es compartida: tampoco rompe (los diez clientes)', async () => {
    for (const c of DIEZ_CLIENTES) {
      const base = crearBaseFalsa({ cerebro_fichas: [{ id: '12345678-aaaa-4000-8000-000000000000', client_id: `zona:${c.iso}`, clase: 'contexto_feriado', contenido: 'x', retirada_en: null }, { ...resumen(['12345678']), client_id: c.id }] } as never)
      expect(await auditarCitasDelResumen(base.db, c.id), c.nombre).toMatchObject({ ok: true, problema: null })
    }
  })
  it('el resumen real de un cliente de los diez (con su contexto de zona) pasa la comprobación', async () => {
    const c = DIEZ_CLIENTES.find((x) => x.iso === 'ec') ?? DIEZ_CLIENTES[0]
    const t = tablasDe(c)
    const r = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: { ...ON, resumen_vivo: true }, ahora: AHORA, workflow_id: 'wf', workflow_execution_id: 'ex' })
    expect(r.errores).toEqual([])
    const base = crearBaseFalsa(t as never)
    expect(await auditarCitasDelResumen(base.db, c.id)).toMatchObject({ ok: true, problema: null })
  })
})
