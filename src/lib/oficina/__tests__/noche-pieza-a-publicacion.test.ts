/**
 * PARTE E DEL ENCARGO DE NOCHE (CC#3 · 19-oct): una pieza de prueba recorre OFICINA → REVISIÓN (jefatura) → BANDEJA ÚNICA → «aprobado» → PUBLICACIÓN EN ENSAYO. US$ 0: sin modelo, sin red, sin base real.
 * Qué es real aquí: el orquestador de la oficina y su plantilla con el paso `jefatura`; la jefatura REAL (en memoria); las puertas REALES de «salida» y «bandeja» de la oficina (`crearPuertos`) escribiendo
 * en una base falsa; la ruta REAL `PATCH /api/hitl/[id]` (la que aprueba) y `publicarAprobado` (el ensayo). Qué es simulado: los empleados (guion), la imagen, el revisor GPT y la base.
 * Nada se publica: el ensayo solo ARMA la solicitud a Meta y no llama a nadie (la prueba falla si sale una sola llamada de red).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import { almacenEnMemoria, correr as correrJefatura, puertosDePrueba } from '../../../../__tests__/_helpers/jefatura-revision'
import { aprobacionLegada, listarAprobaciones } from '../../hitl/bandeja'
import { crearPuertos } from '../adaptadores'
import { abrirEncargo } from '../orquestador'
import { POST_IMG_CON_JEFATURA } from '../plantillas/con-jefatura'
import type { AperturaDeJefatura } from '../puertos'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, PARTE, PIEZA_OK, correr, crearMemoria, direccionGenerada, observacion, REGLAS_CEVICHE, type Guion, type Memoria } from './memoria'

// ───────────────────────────────────────────────────────── una base falsa con la forma de PostgREST (lo justo para las puertas reales y para el PATCH)
type Fila = Record<string, any>
const leer = (f: Fila, col: string) => { if (col.includes('->>')) { const [a, b] = col.split('->>'); return f[a] && typeof f[a] === 'object' ? f[a][b] : undefined } return f[col] }
class Q {
  private op: 'select' | 'insert' | 'update' = 'select'
  private filtros: Array<(f: Fila) => boolean> = []
  private cambios: Fila = {}
  private nuevo: Fila[] = []
  private tope: number | null = null
  private uno: 'single' | 'maybe' | null = null
  constructor(private db: BaseFalsa, private t: string) {}
  select(_c?: string) { return this }
  insert(p: Fila | Fila[]) { this.op = 'insert'; this.nuevo = ([] as Fila[]).concat(p); return this }
  update(p: Fila) { this.op = 'update'; this.cambios = p; return this }
  eq(c: string, v: unknown) { this.filtros.push((f) => leer(f, c) === v); return this }
  order() { return this }
  limit(n: number) { this.tope = n; return this }
  single() { this.uno = 'single'; return this }
  maybeSingle() { this.uno = 'maybe'; return this }
  then<T>(res: (v: any) => T) { return Promise.resolve(this.ejecutar()).then(res) }
  private ejecutar(): any {
    const filas = (this.db.tablas[this.t] ??= [])
    if (this.op === 'insert') {
      const hechas = this.nuevo.map((n) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...n }))
      filas.push(...hechas)
      return this.uno ? { data: hechas[0], error: null } : { data: hechas, error: null }
    }
    if (this.op === 'update') {
      const tocadas = filas.filter((f) => this.filtros.every((g) => g(f)))
      for (const f of tocadas) Object.assign(f, this.cambios)
      return this.uno ? (tocadas.length ? { data: tocadas[0], error: null } : { data: null, error: { message: 'no rows' } }) : { data: tocadas, error: null }
    }
    let data = filas.filter((f) => this.filtros.every((g) => g(f)))
    if (this.tope !== null) data = data.slice(0, this.tope)
    if (this.uno) return data.length ? { data: data[0], error: null } : this.uno === 'single' ? { data: null, error: { message: 'no rows' } } : { data: null, error: null }
    return { data, error: null }
  }
}
class BaseFalsa {
  tablas: Record<string, Fila[]> = {}
  from(t: string) { return new Q(this, t) }
}

let db = new BaseFalsa()
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => db }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))
import { PATCH } from '../../../app/api/hitl/[id]/route'

// ───────────────────────────────────────────────────────── el recorrido
const j = (x: unknown) => JSON.stringify(x)
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const sobreEncargo = (brief_id: string) => ({ parte_id: PARTE, brief_id, dry_run: false, familia: 'post_img' })
/** cómo contestan los empleados de una pieza «limpia»: el material, la dirección visual, los prompts, la mirada a la imagen y el texto */
const GUION: Guion = {
  paquete: () => ({ texto: 'material del portero: fotos etiquetadas, sedes, manual vigente' }), direccion_visual: () => ({ texto: direccionGenerada(REGLAS_CEVICHE) }), prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }), texto: () => ({ texto: PIEZA_OK }), reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }), reimagen_mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
}

/** conecta el puerto de la oficina con la jefatura REAL en memoria (la revisión corre completa y cierra dentro de la llamada) */
function conLaJefatura(M: Memoria, o: { estado?: 'apagada' | 'ensayo' } = {}) {
  const mem = almacenEnMemoria({ config: { estado: o.estado ?? 'ensayo', tipos_activos: ['pieza'], clientes_ensayo: [CLIENTE] }, activas: ['pieza'] })
  const { P: PJ } = puertosDePrueba({ almacen: mem, revisor: () => ({ ok: true, texto: '', costo_usd: 0.1, modelo: 'revisor-simulado' }) })
  const sobres: Array<Record<string, unknown>> = []
  const salidas: SalidaDeRevision[] = []
  const responder = (t: { paso: string }) => (t.paso === 'revision_fondo' ? { texto: FICHAS_VACIAS } : t.paso.startsWith('decision:') ? { texto: j({ respuestas: [] }) } : undefined)
  M.P.jefatura = async (sobre): Promise<AperturaDeJefatura> => {
    sobres.push(sobre as never)
    const c = await correrJefatura(PJ, { ...sobre, payload: { ...sobre.payload, devolver_a: { tipo: 'webhook', destino: 'https://zero-risk-platform.vercel.app/api/jefatura/oficina-vuelta' } } } as never, responder as never)
    if (c.final.status === 409) return { estado: 'no_abre', motivo: String(c.final.cuerpo.motivo ?? c.final.cuerpo.error) }
    if (c.final.cuerpo.accion === 'cerrado') { salidas.push(c.final.cuerpo.salida as SalidaDeRevision); return { estado: 'cerrada', salida: c.final.cuerpo.salida as SalidaDeRevision } }
    return { estado: 'error', motivo: JSON.stringify(c.final.cuerpo).slice(0, 200) }
  }
  return { mem, sobres, salidas }
}

/** una pieza de prueba que recorre la oficina con la jefatura y deja su salida y su fila en la base falsa por las puertas REALES */
async function producirPieza(o: { jefatura?: 'apagada' | 'ensayo' } = {}) {
  const M = crearMemoria({ plantilla: POST_IMG_CON_JEFATURA })
  const real = crearPuertos(db as never, { baseUrl: 'https://plataforma.test', internalKey: 'llave-de-prueba' }, (async () => { throw new Error('sin red en la prueba') }) as never)
  M.P.salida = real.salida
  M.P.bandeja = real.bandeja
  const J = conLaJefatura(M, { estado: o.jefatura })
  const a = await abrirEncargo(M.P, { cuerpo: sobreEncargo('BRF-0003'), client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  expect(a.status).toBe(200)
  const id = String(a.cuerpo.encargo_id)
  const r = await correr(M, id, GUION)
  return { M, J, id, r }
}
const aprobar = async (id: string, cuerpo: Record<string, unknown> = { status: 'approved', reviewer: 'emilio', decision: 'approved' }) =>
  PATCH(new Request(`http://x/api/hitl/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }), { params: { id } })

let red: { mockRestore(): void }
const llamadasDeRed = () => (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length
beforeEach(() => { db = new BaseFalsa(); red = vi.spyOn(globalThis, 'fetch').mockImplementation((async () => { throw new Error('sin red en la prueba') }) as never) as never })
afterEach(() => { red.mockRestore() })

describe('🔴 una pieza de prueba: oficina → revisión → bandeja → aprobado → publicación en ensayo (US$ 0)', () => {
  it('el recorrido completo: la jefatura revisa, la pieza llega a la bandeja única, se aprueba y arma el ensayo de publicación (sin llamar a nadie)', async () => {
    const { M, J, id, r } = await producirPieza()
    // ① oficina: cerró el encargo y pasó por la jefatura
    expect(r.ultima.cuerpo.accion).toBe('cerrado')
    expect(J.sobres).toHaveLength(1)
    expect(J.salidas).toHaveLength(1)
    expect(M.encargos.get(id)!.estado).toBe('cerrado')
    // ② bandeja única: UNA fila, la de la pieza, ligada a su salida, con el origen de la oficina
    const cola = db.tablas.hitl_queue
    expect(cola).toHaveLength(1)
    const salida = db.tablas.client_historical_outputs[0]
    expect(cola[0]).toMatchObject({ type: 'content_piece_review', status: 'pending', client_id: CLIENTE, output_id: salida.id, metadata: { origen: 'oficina' } })
    // ③ la lista de la bandeja (la que lee el tablero) la muestra, con la forma de aprobación de siempre
    const lista = (await listarAprobaciones(db as never, { estado: 'pending' })).filas.map(aprobacionLegada)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ item_id: cola[0].id, approval_type: 'content_piece_review', status: 'pending' })
    // ④ aprobada por Emilio: la ruta que aprueba arma el ensayo
    const res = await aprobar(String(cola[0].id))
    const cuerpo = await res.json()
    expect(res.status).toBe(200)
    expect(cuerpo.publicacion).toMatchObject({ ok: true, ya_estaba: false })
    expect(cuerpo.publicacion.ensayo).toMatchObject({ modo: 'ensayo', real: false, origen: 'pieza_de_oficina', output_id: salida.id, client_id: CLIENTE })
    expect(cuerpo.publicacion.ensayo.piezas).toHaveLength(1)
    expect(cuerpo.publicacion.ensayo.piezas[0]).toMatchObject({ canal: 'instagram', armada: true })
    // ⑤ la fila quedó aprobada y guarda el ensayo
    expect(db.tablas.hitl_queue[0]).toMatchObject({ status: 'approved', reviewer: 'emilio' })
    expect((db.tablas.hitl_queue[0].metadata as Fila).publicacion_ensayo).toMatchObject({ modo: 'ensayo', real: false })
  })

  it('🔴 US$ 0 y nada sale: ni una llamada de red, ni imagen real, ni revisor real, ni render real', async () => {
    const { M } = await producirPieza()
    await aprobar(String(db.tablas.hitl_queue[0].id))
    expect(llamadasDeRed()).toBe(0) // ni las puertas reales de la oficina ni la ruta que aprueba ni el ensayo salen a la red (el fetch global lanza si lo llaman)
    expect(M.llamadas.bandeja.length + db.tablas.hitl_queue.length).toBeGreaterThan(0)
  })

  it('aprobar dos veces no arma dos ensayos: la segunda devuelve el que ya estaba', async () => {
    await producirPieza()
    const id = String(db.tablas.hitl_queue[0].id)
    const primero = await (await aprobar(id)).json()
    const segundo = await (await aprobar(id)).json()
    expect(primero.publicacion.ya_estaba).toBe(false)
    expect(segundo.publicacion).toMatchObject({ ok: true, ya_estaba: true })
    expect(segundo.publicacion.ensayo.hora).toBe(primero.publicacion.ensayo.hora)
  })

  it('rechazar no arma ningún ensayo', async () => {
    await producirPieza()
    const res = await aprobar(String(db.tablas.hitl_queue[0].id), { status: 'rejected', reviewer: 'emilio', decision: 'rejected', frase_del_aprobador: 'no va con la marca' })
    const cuerpo = await res.json()
    expect(cuerpo.publicacion).toBeUndefined()
    expect(db.tablas.hitl_queue[0]).toMatchObject({ status: 'rejected' })
    expect((db.tablas.hitl_queue[0].metadata as Fila).publicacion_ensayo).toBeUndefined()
  })

  it('🔴 el candado de la jefatura: apagada, la revisión no abre, la pieza NO se pierde y llega a la bandeja MARCADA (sin revisar); aprobarla arma el ensayo igual', async () => {
    const { J, r } = await producirPieza({ jefatura: 'apagada' })
    expect(r.ultima.cuerpo.accion).toBe('cerrado')
    expect(J.salidas).toHaveLength(0)
    const fila = db.tablas.hitl_queue[0]
    expect(fila).toMatchObject({ type: 'content_piece_review', status: 'pending' })
    expect(JSON.stringify(fila.metadata)).toMatch(/sin revisar|revisión/i) // la marca viaja con la pieza: quien aprueba sabe que nadie la revisó
    const cuerpo = await (await aprobar(String(fila.id))).json()
    expect(cuerpo.publicacion.ensayo).toMatchObject({ origen: 'pieza_de_oficina', real: false })
  })
})

describe('el contrato con el tablero de Emilio (zero-risk-dashboard): el cuerpo exacto que manda al aprobar o rechazar', () => {
  it('🔴 `{ status, reviewer, decision en TEXTO, frase_del_aprobador? }` lo acepta la ruta; un objeto en `decision` da 400 (así no se vuelve a desacoplar en silencio)', async () => {
    await producirPieza()
    const id = String(db.tablas.hitl_queue[0].id)
    const malo = await aprobar(id, { status: 'approved', reviewer: 'emilio', decision: { decision: 'approved', por: 'emilio' } })
    expect(malo.status).toBe(400)
    expect(db.tablas.hitl_queue[0].status).toBe('pending') // un cuerpo mal formado no toca la fila
    const bueno = await aprobar(id, { status: 'approved', reviewer: 'emilio', decision: 'approved' })
    expect(bueno.status).toBe(200)
  })
  it('rechazar con el motivo como frase: la ruta lo acepta con el cuerpo del tablero', async () => {
    await producirPieza()
    const res = await aprobar(String(db.tablas.hitl_queue[0].id), { status: 'rejected', reviewer: 'emilio', decision: 'rejected', frase_del_aprobador: 'no va con la marca' })
    expect(res.status).toBe(200)
    expect(db.tablas.hitl_queue[0]).toMatchObject({ status: 'rejected', reviewer: 'emilio' })
  })
})
