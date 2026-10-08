/**
 * RECADOS DE LA SALA · PASO 1 · la PUERTA `POST /api/sala/recados` (abrir · cerrar · leer). Base simulada, US$ 0, nada de n8n ni de modelo.
 * Diseño: raw/tasks/2026-10-08-DISENO-CC3-recados-de-la-sala.md §2.1–§2.3. Escritas antes del código.
 *  · idempotente por clave: nunca dos recados abiertos iguales (un cliente + una clave) y la carrera la resuelve la base;
 *  · un destino que no opera (por configurar / no existe / apagado) cierra el recado como «no conseguido» EN EL ACTO (sin esperar, sin bucles, sin spam);
 *  · tope de recados abiertos por cliente; aislamiento por cliente; los de prueba no se mezclan con los reales;
 *  · cerrar es idempotente y definitivo; leer no escribe; la llave `x-sala-dispatch-key` o nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE, procesarRecado, type Almacen, type Destino, type FilaNueva, type Recado } from '../src/lib/sala-recados/puerta'

vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => (globalThis as Record<string, unknown>).__almacenDeLaRuta }))
const AHORA = new Date('2026-10-08T12:00:00.000Z')
const C1 = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const C2 = 'e388a370-910f-4ee7-9a48-4a79393b8cb4'
const DESTINOS: Destino[] = [
  { destino: 'apify', tipo: 'herramienta', flujo_que_reparte: null, plazo_minutos: 30, estado_del_brazo: 'opera', activo: true },
  { destino: 'imagen', tipo: 'herramienta', flujo_que_reparte: null, plazo_minutos: 15, estado_del_brazo: 'opera', activo: true },
  { destino: 'video', tipo: 'herramienta', flujo_que_reparte: null, plazo_minutos: 60, estado_del_brazo: 'por_configurar', activo: true },
  { destino: 'loyverse', tipo: 'herramienta', flujo_que_reparte: null, plazo_minutos: 15, estado_del_brazo: 'no_existe', activo: true },
  { destino: 'dueno', tipo: 'persona', flujo_que_reparte: null, plazo_minutos: 60, estado_del_brazo: 'opera', activo: false },
]

/** una base en memoria que respeta el índice único parcial (cliente, clave, prueba) mientras esté abierto/repartido */
class Memoria implements Almacen {
  filas: Recado[] = []
  escrituras = 0
  falla: 'leer' | 'insertar' | 'cerrar' | null = null
  carrera = false
  private n = 0
  async listarDestinos() { return DESTINOS }
  async leerDestino(d: string) { if (this.falla === 'leer') throw new Error('base caída'); return DESTINOS.find((x) => x.destino === d) ?? null }
  async buscarAbierto(c: string, k: string, p: boolean) { return this.filas.find((f) => f.client_id === c && f.clave_de_agrupacion === k && f.prueba === p && (f.estado === 'abierto' || f.estado === 'repartido')) ?? null }
  async buscarNoConseguidoReciente(c: string, k: string, p: boolean, desde: string) { return this.filas.find((f) => f.client_id === c && f.clave_de_agrupacion === k && f.prueba === p && f.estado === 'no_conseguido' && (f.creado_en ?? '') >= desde) ?? null }
  async contarAbiertos(c: string, p: boolean) { return this.filas.filter((f) => f.client_id === c && f.prueba === p && (f.estado === 'abierto' || f.estado === 'repartido')).length }
  async abiertosDe(c: string, p: boolean) { return this.filas.filter((f) => f.client_id === c && f.prueba === p && (f.estado === 'abierto' || f.estado === 'repartido')) }
  async leerPorId(id: number) { return this.filas.find((f) => f.id === id) ?? null }
  async insertar(fila: FilaNueva) {
    if (this.falla === 'insertar') throw new Error('base caída')
    if (this.carrera) { this.carrera = false; this.filas.push({ ...(fila as unknown as Recado), id: ++this.n, ficha_ids: null, avisado_en: null, retomado_en: null, cerrado_en: null, estado: 'abierto', creado_en: AHORA.toISOString() }); return { ok: false as const, duplicado: true, detalle: 'duplicate key' } }
    if (fila.estado !== 'no_conseguido' && this.filas.some((f) => f.client_id === fila.client_id && f.clave_de_agrupacion === fila.clave_de_agrupacion && f.prueba === fila.prueba && (f.estado === 'abierto' || f.estado === 'repartido'))) return { ok: false as const, duplicado: true, detalle: 'duplicate key' }
    this.escrituras++
    const r: Recado = { ...(fila as unknown as Recado), id: ++this.n, ficha_ids: null, avisado_en: null, retomado_en: null, creado_en: AHORA.toISOString() }
    this.filas.push(r)
    return { ok: true as const, recado: r }
  }
  async cerrar(id: number, patch: Partial<Recado>) {
    if (this.falla === 'cerrar') throw new Error('base caída')
    const f = this.filas.find((x) => x.id === id)
    if (!f || (f.estado !== 'abierto' && f.estado !== 'repartido')) return null
    this.escrituras++
    Object.assign(f, patch)
    return f
  }
}

let m: Memoria
const abrir = (extra: Record<string, unknown> = {}) => procesarRecado(m, { accion: 'abrir', client_id: C1, clave_de_agrupacion: 'horario-sede-gye', que_falta: 'horario de la sede de Guayaquil', destino: 'apify', ...extra }, AHORA)
beforeEach(() => { m = new Memoria() })

describe('abrir', () => {
  it('abre un recado: 201, número, estado abierto y plazo EN MINUTOS según el destino', async () => {
    const r = await abrir({ bloquea: true, razon_del_destino: 'está en el sitio', para_el_trabajo: { flujo: 'pieza', workflow_execution_id: 'x1' }, pedido_original: { brief: 'BRF-0006' } })
    expect(r.status).toBe(201)
    expect(r.cuerpo).toMatchObject({ numero: 1, estado: 'abierto', plazo_en: '2026-10-08T12:30:00.000Z', ya_abierto: false })
    expect(m.filas[0]).toMatchObject({ client_id: C1, clave_de_agrupacion: 'horario-sede-gye', destino: 'apify', bloquea: true, prueba: false, estado: 'abierto', pedido_original: { brief: 'BRF-0006' } })
  })
  it('es IDEMPOTENTE por clave: el mismo faltante dos veces devuelve el MISMO número y no escribe otra fila', async () => {
    const a = await abrir()
    const b = await abrir({ que_falta: 'otra redacción del mismo faltante' })
    expect(b.status).toBe(200)
    expect(b.cuerpo).toMatchObject({ numero: (a.cuerpo as { numero: number }).numero, ya_abierto: true, estado: 'abierto' })
    expect(m.filas).toHaveLength(1)
    expect(m.escrituras).toBe(1)
  })
  it('claves distintas o clientes distintos son recados distintos (aislamiento por cliente)', async () => {
    await abrir()
    await abrir({ clave_de_agrupacion: 'telefono' })
    await abrir({ client_id: C2 })
    expect(m.filas.map((f) => [f.client_id, f.clave_de_agrupacion])).toEqual([[C1, 'horario-sede-gye'], [C1, 'telefono'], [C2, 'horario-sede-gye']])
    expect((await procesarRecado(m, { accion: 'leer', client_id: C2 }, AHORA)).cuerpo).toMatchObject({ recados: [{ numero: 3 }] })
  })
  it('los recados de PRUEBA no se mezclan con los reales: misma clave, uno de cada, y ni se ven entre sí', async () => {
    await abrir()
    const p = await abrir({ prueba: true })
    expect(p.status).toBe(201)
    expect(m.filas).toHaveLength(2)
    expect(((await procesarRecado(m, { accion: 'leer', client_id: C1 }, AHORA)).cuerpo as { recados: unknown[] }).recados).toHaveLength(1)
    expect(((await procesarRecado(m, { accion: 'leer', client_id: C1, prueba: true }, AHORA)).cuerpo as { recados: unknown[] }).recados).toHaveLength(1)
    await abrir({ prueba: true, clave_de_agrupacion: 'solo-de-prueba' })
    const claves = async (prueba: boolean) => ((await procesarRecado(m, { accion: 'leer', client_id: C1, prueba }, AHORA)).cuerpo as { recados: Array<{ clave_de_agrupacion: string }> }).recados.map((x) => x.clave_de_agrupacion)
    expect(await claves(false)).toEqual(['horario-sede-gye'])
    expect((await claves(true)).sort()).toEqual(['horario-sede-gye', 'solo-de-prueba'])
  })
  it('la carrera la resuelve la base: si otro escribió el mismo recado entre la lectura y la escritura, se devuelve el que ganó (sin duplicar)', async () => {
    m.carrera = true
    const r = await abrir()
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ numero: 1, ya_abierto: true })
    expect(m.filas).toHaveLength(1)
  })
  it.each([['video', 'por_configurar'], ['loyverse', 'no_existe'], ['dueno', 'apagado']])('un destino que NO opera (%s: %s) cierra el recado como «no_conseguido» EN EL ACTO, con motivo, sin plazo y sin esperar', async (destino) => {
    const r = await abrir({ destino })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ estado: 'no_conseguido', motivo: 'brazo_no_disponible' })
    expect(m.filas[0]).toMatchObject({ estado: 'no_conseguido', plazo_en: null })
    expect(m.filas[0].cerrado_en).toBe(AHORA.toISOString())
  })
  it('el mismo faltante contra un destino que no opera NO se vuelve a registrar cada vez: dentro de la hora devuelve el mismo número (sin spam, sin bucle)', async () => {
    const a = await abrir({ destino: 'video' })
    const b = await abrir({ destino: 'video' })
    expect((b.cuerpo as { numero: number }).numero).toBe((a.cuerpo as { numero: number }).numero)
    expect(b.cuerpo).toMatchObject({ ya_registrado: true, estado: 'no_conseguido' })
    expect(m.filas).toHaveLength(1)
  })
  it('un destino que no existe → 400 y no se escribe nada', async () => {
    const r = await abrir({ destino: 'inventado' })
    expect(r.status).toBe(400)
    expect(r.cuerpo).toMatchObject({ error: 'destino_desconocido' })
    expect(m.filas).toHaveLength(0)
  })
  it('no hay destino «emilio»: nada va a Emilio', async () => {
    const r = await abrir({ destino: 'emilio' })
    expect(r.status).toBe(400)
    expect(m.filas).toHaveLength(0)
  })
  it(`tope de recados abiertos por cliente (${MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE}): el siguiente → 409 sin escribir; los de otro cliente no cuentan; cerrar uno libera lugar`, async () => {
    for (let i = 0; i < MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE; i++) expect((await abrir({ clave_de_agrupacion: 'k' + i })).status).toBe(201)
    const de_mas = await abrir({ clave_de_agrupacion: 'una-mas' })
    expect(de_mas.status).toBe(409)
    expect(de_mas.cuerpo).toMatchObject({ error: 'tope_de_recados_abiertos' })
    expect(m.filas).toHaveLength(MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE)
    expect((await abrir({ client_id: C2, clave_de_agrupacion: 'una-mas' })).status).toBe(201)
    await procesarRecado(m, { accion: 'cerrar', numero: 1, resultado: 'cumplido' }, AHORA)
    expect((await abrir({ clave_de_agrupacion: 'una-mas' })).status).toBe(201)
  })
  it('el mismo recado abierto se devuelve aunque el cliente esté AL tope (idempotente primero, tope después)', async () => {
    for (let i = 0; i < MAXIMO_DE_RECADOS_ABIERTOS_POR_CLIENTE; i++) await abrir({ clave_de_agrupacion: 'k' + i })
    const r = await abrir({ clave_de_agrupacion: 'k3' })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ya_abierto: true })
  })
  it.each([
    ['sin cliente', { client_id: undefined }], ['cliente vacío', { client_id: '' }], ['cliente muy largo', { client_id: 'x'.repeat(101) }],
    ['sin clave', { clave_de_agrupacion: undefined }], ['clave muy larga', { clave_de_agrupacion: 'x'.repeat(201) }],
    ['sin qué falta', { que_falta: undefined }], ['qué falta vacío', { que_falta: '   ' }], ['qué falta enorme', { que_falta: 'x'.repeat(2001) }],
    ['bloquea no booleano', { bloquea: 'si' }], ['prueba no booleana', { prueba: 1 }],
    ['para_el_trabajo no objeto', { para_el_trabajo: 'x' }], ['pedido_original lista', { pedido_original: [1] }], ['razón enorme', { razon_del_destino: 'x'.repeat(1001) }],
  ])('entrada inválida (%s) → 400 y no se escribe nada', async (_n, extra) => {
    const r = await abrir(extra as Record<string, unknown>)
    expect(r.status).toBe(400)
    expect(r.cuerpo).toMatchObject({ error: 'entrada_invalida' })
    expect(m.filas).toHaveLength(0)
  })
  it('si la base falla → 500 limpio y nada a medias', async () => {
    m.falla = 'insertar'
    const r = await abrir()
    expect(r.status).toBe(500)
    expect(r.cuerpo).toMatchObject({ error: 'almacen_error' })
    m.falla = 'leer'
    expect((await abrir({ clave_de_agrupacion: 'otra' })).status).toBe(500)
    expect(m.filas).toHaveLength(0)
  })
})

describe('cerrar', () => {
  beforeEach(async () => { await abrir() })
  it('cumplido: queda cerrado con la hora y las fichas que se archivaron; devuelve si el trabajo estaba pausado', async () => {
    await abrir({ clave_de_agrupacion: 'pausa', bloquea: true })
    const r = await procesarRecado(m, { accion: 'cerrar', numero: 2, resultado: 'cumplido', ficha_ids: ['f1', 'f2'] }, AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ numero: 2, estado: 'cumplido', bloquea: true, ya_cerrado: false })
    expect(m.filas[1]).toMatchObject({ estado: 'cumplido', cerrado_en: AHORA.toISOString(), ficha_ids: ['f1', 'f2'] })
  })
  it('no_conseguido con motivo', async () => {
    const r = await procesarRecado(m, { accion: 'cerrar', numero: 1, resultado: 'no_conseguido', motivo: 'el brazo falló' }, AHORA)
    expect(r.cuerpo).toMatchObject({ estado: 'no_conseguido' })
    expect(m.filas[0]).toMatchObject({ estado: 'no_conseguido', motivo_de_cierre: 'el brazo falló' })
  })
  it('es IDEMPOTENTE y definitivo: cerrar otra vez no cambia nada (aunque pidan otro resultado) y lo dice', async () => {
    await procesarRecado(m, { accion: 'cerrar', numero: 1, resultado: 'cumplido' }, AHORA)
    const escrituras = m.escrituras
    const otra = await procesarRecado(m, { accion: 'cerrar', numero: 1, resultado: 'no_conseguido' }, new Date('2026-10-08T13:00:00Z'))
    expect(otra.status).toBe(200)
    expect(otra.cuerpo).toMatchObject({ estado: 'cumplido', ya_cerrado: true })
    expect(m.escrituras).toBe(escrituras)
    expect(m.filas[0].cerrado_en).toBe(AHORA.toISOString())
  })
  it('un recado que ya se cerró como «no conseguido» al abrirse (brazo que no opera) no se puede «cumplir» después', async () => {
    await abrir({ clave_de_agrupacion: 'v', destino: 'video' })
    const r = await procesarRecado(m, { accion: 'cerrar', numero: 2, resultado: 'cumplido' }, AHORA)
    expect(r.cuerpo).toMatchObject({ estado: 'no_conseguido', ya_cerrado: true })
  })
  it('un número que no existe → 404; entrada inválida → 400', async () => {
    expect((await procesarRecado(m, { accion: 'cerrar', numero: 99, resultado: 'cumplido' }, AHORA)).status).toBe(404)
    for (const mal of [{ numero: 'uno' }, { numero: 0 }, { numero: 1.5 }, { numero: 1, resultado: 'quizas' }, { numero: 1, resultado: 'cumplido', ficha_ids: 'x' }, { numero: 1, resultado: 'cumplido', ficha_ids: Array(201).fill('f') }, { numero: 1, resultado: 'no_conseguido', motivo: 'x'.repeat(1001) }]) {
      const r = await procesarRecado(m, { accion: 'cerrar', resultado: 'cumplido', ...mal }, AHORA)
      expect(r.status, JSON.stringify(mal)).toBe(400)
    }
    expect(m.filas[0].estado).toBe('abierto')
  })
  it('si la base falla al cerrar → 500 y sigue abierto', async () => {
    m.falla = 'cerrar'
    expect((await procesarRecado(m, { accion: 'cerrar', numero: 1, resultado: 'cumplido' }, AHORA)).status).toBe(500)
    m.falla = null
    expect(m.filas[0].estado).toBe('abierto')
  })
})

describe('leer', () => {
  it('lista los abiertos del cliente (número, clave, qué falta, destino, estado, plazo, bloquea) sin escribir nada', async () => {
    await abrir()
    await abrir({ clave_de_agrupacion: 'logo', que_falta: 'el logo', destino: 'imagen', bloquea: true })
    await abrir({ clave_de_agrupacion: 'v', destino: 'video' }) // no_conseguido: no es «abierto»
    const antes = m.escrituras
    const r = await procesarRecado(m, { accion: 'leer', client_id: C1 }, AHORA)
    expect(r.status).toBe(200)
    expect((r.cuerpo as { recados: Array<Record<string, unknown>> }).recados.map((x) => [x.numero, x.clave_de_agrupacion, x.destino, x.estado, x.bloquea])).toEqual([[1, 'horario-sede-gye', 'apify', 'abierto', false], [2, 'logo', 'imagen', 'abierto', true]])
    expect(m.escrituras).toBe(antes)
  })
  it('leer UN número devuelve ese recado (también si ya se cerró); inexistente → 404; sin cliente ni número → 400', async () => {
    await abrir({ destino: 'video' })
    expect((await procesarRecado(m, { accion: 'leer', numero: 1 }, AHORA)).cuerpo).toMatchObject({ recado: { numero: 1, estado: 'no_conseguido' } })
    expect((await procesarRecado(m, { accion: 'leer', numero: 7 }, AHORA)).status).toBe(404)
    expect((await procesarRecado(m, { accion: 'leer' }, AHORA)).status).toBe(400)
  })
})

describe('el sobre', () => {
  it('una acción desconocida o un cuerpo que no es objeto → 400', async () => {
    for (const x of [null, 'x', [1], {}, { accion: 'borrar' }, { accion: 'repartir' }]) expect((await procesarRecado(m, x, AHORA)).status, JSON.stringify(x)).toBe(400)
    // una acción desconocida con datos completos sigue siendo 400 (no se interpreta como otra cosa)
    const r = await procesarRecado(m, { accion: 'repartir', client_id: C1, numero: 1, clave_de_agrupacion: 'k', que_falta: 'x', destino: 'apify' }, AHORA)
    expect(r.status).toBe(400)
    expect(r.cuerpo).toMatchObject({ error: 'accion_desconocida' })
    expect(m.filas).toHaveLength(0)
  })
})

describe('la ruta: la llave `x-sala-dispatch-key` o nada', () => {
  const guardada = process.env.SALA_DISPATCH_KEY
  const almacen = new Memoria()
  ;(globalThis as Record<string, unknown>).__almacenDeLaRuta = almacen
  const post = async (cuerpo: unknown, cabeceras: Record<string, string> = {}) => {
    const { POST } = await import('../src/app/api/sala/recados/route')
    const r = await POST(new Request('http://x/api/sala/recados', { method: 'POST', headers: { 'content-type': 'application/json', ...cabeceras }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))
    return { status: r.status, json: (await r.json()) as Record<string, unknown> }
  }
  const cuerpo = { accion: 'abrir', client_id: C1, clave_de_agrupacion: 'k', que_falta: 'algo', destino: 'apify' }
  beforeEach(() => { process.env.SALA_DISPATCH_KEY = 'llave-de-prueba'; almacen.filas = [] })
  it('sin cabecera → 401, con otra → 401, y no se escribe nada', async () => {
    expect((await post(cuerpo)).status).toBe(401)
    expect((await post(cuerpo, { 'x-sala-dispatch-key': 'otra' })).status).toBe(401)
    expect((await post(cuerpo, { 'x-api-key': 'llave-de-prueba' })).status).toBe(401) // la llave interna NO abre esta puerta
    expect(almacen.filas).toHaveLength(0)
  })
  it('sin la variable de entorno la puerta queda CERRADA (503), aunque la cabecera venga vacía o coincida', async () => {
    delete process.env.SALA_DISPATCH_KEY
    expect((await post(cuerpo, { 'x-sala-dispatch-key': '' })).status).toBe(503)
    expect((await post(cuerpo, { 'x-sala-dispatch-key': 'undefined' })).status).toBe(503)
    expect(almacen.filas).toHaveLength(0)
  })
  it('con la llave correcta abre; JSON roto → 400', async () => {
    const r = await post(cuerpo, { 'x-sala-dispatch-key': 'llave-de-prueba' })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ numero: 1, estado: 'abierto' })
    expect((await post('{roto', { 'x-sala-dispatch-key': 'llave-de-prueba' })).status).toBe(400)
  })
  it('restaura el entorno', () => { if (guardada === undefined) delete process.env.SALA_DISPATCH_KEY; else process.env.SALA_DISPATCH_KEY = guardada })
})
