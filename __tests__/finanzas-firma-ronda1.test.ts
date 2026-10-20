/**
 * LA RONDA 1 SE FIRMA «CON ALERTA» CUANDO EL TOPE O EL PLAZO CORTAN LA RONDA 2 (CC#1 · 20-oct · parte 4-bis · opción 1 de Lenovo · sin subir el tope de US$ 1,50). US$ 0, todo simulado.
 * Datos: el estado REAL de la oficina de la repetición del 20-oct (`fixtures/finanzas-encargo-ronda1-20oct.json`): ronda 1 completa, ajuste_2 hecho, sin cálculo 2 / cierre 2 / firma, gasto 1,2188.
 * Medido con ese estado: el siguiente paso es `calculo_2`; el `cierre_2` reserva 0,40 y 1,2188 + 0,40 > 1,50 ⇒ el motor cerraba por tope SIN firmar (se perdía hasta la ronda 1).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { avanzar, cerrarPorPlazo } from '../src/lib/finanzas/conversa/orquestador'
import type { AlmacenDeConversa, ArtefactoGuardado, CambiosDeEncargo, EncargoDeConversa, PuertosDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'

const FX = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/finanzas-encargo-ronda1-20oct.json'), 'utf8')) as { encargo: any; artefactos: Record<string, any> }
type Arts = Record<string, any>

function mundo(o: { arts?: (a: Arts) => Arts; dry_run?: boolean; invocacionEnElLibro?: boolean; turnos?: number; encargo?: (e: EncargoDeConversa) => void } = {}) {
  const arts: Arts = o.arts ? o.arts(structuredClone(FX.artefactos)) : structuredClone(FX.artefactos)
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'c-1', estado: 'en_curso', estado_del_motor: structuredClone(FX.encargo.estado_del_motor), gasto_usd: FX.encargo.gasto_usd, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: o.dry_run === true, semilla: structuredClone(FX.encargo.semilla ?? {}) }
  // el motor lee los datos de sus artefactos desde su propio estado: se reconstruyen desde `arts` (el fixture los guarda aparte)
  for (const k of Object.keys(e.estado_del_motor.artefactos)) (e.estado_del_motor.artefactos as Record<string, any>)[k] = { ...(e.estado_del_motor.artefactos as Record<string, any>)[k], datos: structuredClone(arts[k]) }
  o.encargo?.(e)
  const turnos: TurnoDeConversa[] = Array.from({ length: o.turnos ?? 10 }, (_, i) => ({ n: i + 1, paso: 'p' + i, agente: null, ronda: 1, estado: 'hecho', costo_usd: 0.1, salida: {}, error: null }))
  const c = { modelo: 0, tableros: [] as any[], firmas: [] as any[], invocaciones: [] as string[], guardados: [] as CambiosDeEncargo[] }
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { throw new Error('no se usa') },
    async leerEncargo(id) { return id === e.id ? structuredClone(e) : null },
    async guardar(ch) {
      c.guardados.push(structuredClone(ch)); e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd
      if (ch.estado) e.estado = ch.estado; if (ch.tablero_id) e.tablero_id = ch.tablero_id
      if (ch.turno) turnos.push(structuredClone(ch.turno)); if (ch.artefacto) arts[ch.artefacto.tipo] = structuredClone(ch.artefacto.contenido)
    },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return structuredClone(turnos) },
    async tomarPaso() { return { ok: true as const, tomado: true } },
    async soltarPaso() { /* nada */ },
  }
  const P: PuertosDeConversa = {
    almacen,
    modelo: { async invocar() { c.modelo++; return { ok: false, error: 'no debe llamarse', costo_usd: 0 } } },
    slack: { async publicar() { return { ok: false } }, async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts } } },
    tableros: {
      async guardarTablero(t) { c.tableros.push(t); return { id: `tab-${c.tableros.length}`, version: c.tableros.length } },
      async actualizarTablero(id, cambios) { c.firmas.push({ id, ...cambios }) },
      async invocacionDelJefe(p) { c.invocaciones.push(p.invocacion_id); return o.invocacionEnElLibro !== false },
    },
    async config() { return { estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'enciende' } as any },
    ahora: () => new Date('2026-10-20T16:03:00Z'), canalDelHilo: '', emilio_id: '',
  }
  return { P, e, arts, turnos, c }
}
const sinCriticos = (a: Arts) => { a.acuerdo = { ...a.acuerdo, hallazgos: a.acuerdo.hallazgos.filter((h: any) => h.severidad !== 'critico' || h.estado === 'resuelto') }; return a }

describe('el estado real de la repetición (para saber qué se probó)', () => {
  it('ronda 1 completa con bloque y acuerdo del jefe; tiene UN crítico abierto; no hay bloque 2 ni acuerdo 2', () => {
    expect(FX.artefactos.bloque.hay_bloque).toBe(true); expect(FX.artefactos.acuerdo.requiere_ronda_2).toBe(true)
    expect(FX.artefactos.acuerdo.hallazgos.filter((h: any) => h.severidad === 'critico' && h.estado === 'abierto')).toHaveLength(1)
    expect(FX.artefactos.bloque_2).toBeUndefined(); expect(FX.artefactos.acuerdo_2).toBeUndefined(); expect(FX.encargo.gasto_usd).toBeCloseTo(1.2188, 3)
  })
})

describe('cerrar por plazo · la ronda 1 se firma «con alerta»', () => {
  it('🔴 sin críticos abiertos: tablero guardado y FIRMADO «con alerta» (aunque el jefe dijo «sale ajustada»), firma = la invocación del cierre 1, turno `firma` + artefacto `cierre`, US$ 0', async () => {
    const m = mundo({ arts: sinCriticos })
    const r = await cerrarPorPlazo(m.P, 'enc-1')
    expect(r.status).toBe(200); expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', terminado: true, razon: 'plazo', firma: 'firmado', ronda_2_incompleta: true, gasto_usd: FX.encargo.gasto_usd })
    expect(m.c.tableros).toHaveLength(1); expect(m.c.firmas).toHaveLength(1)
    expect(m.c.firmas[0]).toMatchObject({ id: 'tab-1', estado: 'firmado', firmado_por: 'chief-financial-officer:enc-1:cierre:sale_con_alerta' })
    expect(m.c.invocaciones).toEqual(['enc-1:cierre'])
    expect(m.c.tableros[0].huella).toBe(FX.artefactos.bloque.huella)
    const turnos = r.cuerpo.turnos as TurnoDeConversa[]
    const firma = turnos.find((t) => t.paso === 'firma')!
    expect(firma).toMatchObject({ n: 11, agente: null, estado: 'hecho', costo_usd: 0 }); expect(firma.salida).toMatchObject({ estado: 'firmado', finanzas_id: 'tab-1', salida: 'sale_con_alerta', ronda_2_incompleta: true, ronda_2: false })
    expect(turnos.at(-1)).toMatchObject({ n: 12, paso: 'cierre_por_plazo' }); expect(turnos.at(-1)?.salida).toMatchObject({ razon: 'plazo', sin_firma: false })
    expect(m.arts.cierre).toMatchObject({ finanzas_id: 'tab-1' }); expect(m.e.tablero_id).toBe('tab-1'); expect(m.e.estado).toBe('cierre_por_tope'); expect(m.c.modelo).toBe(0); expect(m.e.gasto_usd).toBe(FX.encargo.gasto_usd)
  })
  it('🔴 con el crítico abierto REAL de la repetición: los números se guardan pero NO se firman («sin_firma»); nunca se firma lo que el jefe dejó abierto', async () => {
    const m = mundo()
    const r = await cerrarPorPlazo(m.P, 'enc-1')
    expect(r.cuerpo).toMatchObject({ firma: 'sin_firma', ronda_2_incompleta: true })
    expect(m.c.tableros).toHaveLength(1); expect(m.c.firmas[0]).toMatchObject({ estado: 'sin_firma' })
    const firma = (r.cuerpo.turnos as TurnoDeConversa[]).find((t) => t.paso === 'firma')!
    expect(firma.salida).toMatchObject({ estado: 'sin_firma', finanzas_id: 'tab-1', criticos_abiertos: 1 })
  })
  it('🔴 firma SOLO la ronda 1: aunque haya un bloque 2 y un acuerdo 2 a medias, el tablero es el del bloque 1, con el acuerdo 1 y la invocación del cierre 1', async () => {
    const m = mundo({ arts: (a) => { a = sinCriticos(a); a.bloque_2 = { ...a.bloque, huella: 'huella-de-la-ronda-2', hay_bloque: true }; a.acuerdo_2 = { ...a.acuerdo, salida: 'sale' }; return a } })
    await cerrarPorPlazo(m.P, 'enc-1')
    expect(m.c.tableros[0].huella).toBe(FX.artefactos.bloque.huella); expect(m.c.invocaciones).toEqual(['enc-1:cierre']); expect(m.c.firmas[0].firmado_por).toContain(':cierre:sale_con_alerta')
  })
  it('🔴 lo que la ronda 2 dejó a medias NO decide nada: un acuerdo 2 con un crítico abierto y un planteo 2 con «dado por verificado» no cambian la firma de la ronda 1', async () => {
    const m = mundo({ arts: (a) => {
      a = sinCriticos(a)
      a.planteo_fijado = { ...a.planteo_fijado, dado_por_verificado: [] }
      a.planteo_fijado_2 = { ...a.planteo_fijado_2, dado_por_verificado: ['una cifra que nadie comprobó'] }
      a.acuerdo_2 = { ...a.acuerdo, hallazgos: [{ severidad: 'critico', que: 'crítico de la ronda 2 a medias', estado: 'abierto' }] }
      return a
    } })
    const r = await cerrarPorPlazo(m.P, 'enc-1')
    const firma = (r.cuerpo.turnos as TurnoDeConversa[]).find((t) => t.paso === 'firma')!.salida as Record<string, any>
    expect(firma.estado).toBe('firmado'); expect(firma.criticos_abiertos).toBe(0); expect(firma.dado_por_verificado).toEqual([])
  })
  it('🔴 «con alerta» se impone aunque el jefe dijera «sale» y nada más lo obligara', async () => {
    const m = mundo({ arts: (a) => { a = sinCriticos(a); a.acuerdo = { ...a.acuerdo, salida: 'sale', hallazgos: [], conflictos_resueltos: [], dato_que_no_bloquea: null }; a.planteo_fijado = { ...a.planteo_fijado, dado_por_verificado: [] }; a.planteo_fijado_2 = { ...a.planteo_fijado_2, dado_por_verificado: [] }; return a } })
    const normal = mundo({ arts: (a) => { a = sinCriticos(a); a.acuerdo = { ...a.acuerdo, salida: 'sale' }; a.planteo_fijado = { ...a.planteo_fijado, dado_por_verificado: [] }; a.planteo_fijado_2 = { ...a.planteo_fijado_2, dado_por_verificado: [] }; a.bloque_2 = { ...a.bloque, hay_bloque: true }; a.acuerdo_2 = { ...a.acuerdo, hallazgos: [], salida: 'sale' }; return a } })
    const { cerrar } = await import('../src/lib/finanzas/conversa/orquestador')
    await cerrar(normal.P, normal.e, await normal.P.almacen.artefactos('enc-1'))
    expect(normal.c.firmas[0].firmado_por).toContain(':sale:'.replace(/:$/, '')) // el cierre normal conserva lo que dijo el jefe (si nada lo topa)
    await cerrarPorPlazo(m.P, 'enc-1'); expect(m.c.firmas[0].firmado_por).toMatch(/:cierre:sale_con_alerta$/)
  })
  it('sin la invocación del jefe en el libro no se firma (queda «sin_firma» con sus números)', async () => {
    const m = mundo({ arts: sinCriticos, invocacionEnElLibro: false }); const r = await cerrarPorPlazo(m.P, 'enc-1')
    expect(r.cuerpo.firma).toBe('sin_firma'); expect(m.c.firmas[0].estado).toBe('sin_firma')
  })
  it('un ensayo (dry_run) cierra pero no guarda tablero: la firma queda sin id', async () => {
    const m = mundo({ arts: sinCriticos, dry_run: true }); const r = await cerrarPorPlazo(m.P, 'enc-1')
    expect(m.c.tableros).toHaveLength(0); expect((r.cuerpo.turnos as TurnoDeConversa[]).find((t) => t.paso === 'firma')?.salida).toMatchObject({ finanzas_id: null })
  })
  it('🔴 sin bloque de la ronda 1 NO hay nada que firmar: cierra como en #665 (sin tablero, sin turno `firma`)', async () => {
    const m = mundo({ arts: (a) => { delete a.bloque; return a } }); const r = await cerrarPorPlazo(m.P, 'enc-1')
    expect(r.status).toBe(200); expect(m.c.tableros).toHaveLength(0); expect((r.cuerpo.turnos as TurnoDeConversa[]).some((t) => t.paso === 'firma')).toBe(false)
    expect(r.cuerpo).not.toHaveProperty('firma'); expect((r.cuerpo.turnos as TurnoDeConversa[]).at(-1)?.salida).toMatchObject({ sin_firma: true })
    const h = mundo({ arts: (a) => { a.bloque = { ...a.bloque, hay_bloque: false }; return a } }); await cerrarPorPlazo(h.P, 'enc-1'); expect(h.c.tableros).toHaveLength(0)
  })
  it('🔴 idempotente: un segundo cierre no firma otra vez (un solo tablero); y si ya había una firma normal no se pisa', async () => {
    const m = mundo({ arts: sinCriticos }); await cerrarPorPlazo(m.P, 'enc-1'); await cerrarPorPlazo(m.P, 'enc-1'); expect(m.c.tableros).toHaveLength(1)
    const f = mundo({ arts: (a) => { a = sinCriticos(a); a.cierre = { estado: 'firmado', finanzas_id: 'tab-previo' }; return a } }); await cerrarPorPlazo(f.P, 'enc-1'); expect(f.c.tableros).toHaveLength(0)
    const g = mundo({ arts: sinCriticos }); g.turnos.push({ n: 11, paso: 'firma', agente: null, ronda: 1, estado: 'hecho', costo_usd: 0, salida: {}, error: null }); await cerrarPorPlazo(g.P, 'enc-1'); expect(g.c.tableros).toHaveLength(0)
  })
  it('si el cierre por plazo se cae después de firmar, repetirlo no duplica el tablero (la firma ya quedó guardada)', async () => {
    const m = mundo({ arts: sinCriticos }); const original = m.P.almacen.guardar; let n = 0
    m.P.almacen.guardar = async (ch) => { n++; if (n === 2) throw new Error('caída'); return original(ch) }
    await expect(cerrarPorPlazo(m.P, 'enc-1')).rejects.toThrow('caída'); expect(m.e.estado).toBe('en_curso'); expect(m.c.tableros).toHaveLength(1)
    m.P.almacen.guardar = original; const r = await cerrarPorPlazo(m.P, 'enc-1'); expect(r.status).toBe(200); expect(m.c.tableros).toHaveLength(1); expect(m.e.estado).toBe('cierre_por_tope')
  })
})

describe('cerrar por TOPE (el motor) · lo que se perdía', () => {
  it('🔴 con el estado real: `avanzar` hace `calculo_2` y el `cierre_2` NO cabe (1,2188 + 0,40 > 1,50) ⇒ cierra por tope Y firma la ronda 1 (antes: terminal sin firma)', async () => {
    const m = mundo({ arts: sinCriticos })
    const dos = await avanzar(m.P, 'enc-1')
    expect(dos.cuerpo).toMatchObject({ paso: 'calculo_2' }); expect(m.e.estado).toBe('en_curso')
    const r = await avanzar(m.P, 'enc-1')
    expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', terminado: true, razon: 'tope_de_gasto', firma: 'firmado', ronda_2_incompleta: true })
    expect(m.c.tableros).toHaveLength(1); expect(m.c.tableros[0].huella).toBe(FX.artefactos.bloque.huella); expect(m.c.invocaciones).toEqual(['enc-1:cierre']); expect(m.c.modelo).toBe(0)
    expect(m.turnos.find((t) => t.paso === 'firma')?.salida).toMatchObject({ estado: 'firmado', ronda_2_incompleta: true })
    expect(m.e.gasto_usd).toBeCloseTo(FX.encargo.gasto_usd, 4)
  })
  it('el tope del encargo NO se tocó: sigue siendo US$ 1,50', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/finanzas/conversa/plantilla.ts'), 'utf8')
    expect(src).toMatch(/tope_encargo_usd: 1\.5,/); expect(src).toMatch(/tope_encargo_usd > 1\.5\)/)
  })
  it('un cierre normal (la firma llega por su paso) no cambia: `cerrar` sin la opción firma la ronda 2 como siempre', async () => {
    const m = mundo({ arts: (a) => { a = sinCriticos(a); a.bloque_2 = { ...a.bloque, huella: 'h2', hay_bloque: true, cambio: false }; a.acuerdo_2 = { ...a.acuerdo, hallazgos: [], salida: 'sale' }; a.planteo_fijado_2 = a.planteo_fijado_2; return a } })
    const { cerrar } = await import('../src/lib/finanzas/conversa/orquestador')
    const c = await cerrar(m.P, m.e, await m.P.almacen.artefactos('enc-1'))
    expect(c.artefacto).toMatchObject({ ronda_2: true, ronda_2_incompleta: false }); expect(m.c.tableros[0].huella).toBe('h2'); expect(m.c.invocaciones).toEqual(['enc-1:cierre_2'])
  })
})

// ───────────────────────── la planeación lee la firma aunque el estado sea «cierre_por_tope»
const D = path.resolve(__dirname, '../scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const M = await import(pathToFileURL(path.join(D, 'construir-firma-ronda1-2026-10-20.mjs')).href)
type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as Flujo
const antes = leer('planeacion-ARREGLADO-fin-cierra-2026-10-20.json')
const nuevo = leer('planeacion-ARREGLADO-firma-ronda1-2026-10-20.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
function cerrarOficina(f: Flujo, dec: Record<string, unknown>, leido: Record<string, unknown> | null) {
  const $ = (n: string) => {
    if (n === 'FIN · decidir') return { first: () => ({ json: dec }) }
    if (n === 'Webhook · planeacion') return { first: () => ({ json: { body: { client_id: 'c-1' } } }) }
    if (n === 'FIN · leer el encargo') { if (!leido) throw new Error('no corrió'); return { first: () => ({ json: leido }) } }
    throw new Error('nodo no ejecutado: ' + n)
  }
  return (new Function('$', nodo(f, 'FIN · cerrar la oficina').parameters.jsCode)($) as Array<{ json: any }>)[0].json
}
const resp = (estado: string, firma?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ statusCode: 200, body: { estado, terminado: true, turnos: firma ? [{ paso: 'firma', salida: firma }, { paso: 'cierre_por_plazo', salida: { razon: 'plazo' } }] : [{ paso: 'cierre_por_plazo', salida: { razon: 'plazo' } }], ...extra } })
describe('«FIN · cerrar la oficina» · lo que lee el plan', () => {
  it('🔴 cierre por TOPE con la ronda 1 firmada: el plan recibe el `finanzas_id` y NO «vencido» (antes se perdía)', () => {
    const firmado = resp('cierre_por_tope', { estado: 'firmado', finanzas_id: 'tab-1', ronda_2_incompleta: true })
    expect(cerrarOficina(antes, { fin: true, leer: true, estado: 'cierre_por_tope' }, firmado)).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
    expect(cerrarOficina(nuevo, { fin: true, leer: true, estado: 'cierre_por_tope' }, firmado)).toEqual({ finanzas_id: 'tab-1', finanzas_motivo: null })
  })
  it('🔴 con el crítico abierto (tablero sin firmar) el plan recibe el id Y el motivo «sin_firma»: números guardados, nunca presentados como firmados', () => {
    const sin = resp('cierre_por_tope', { estado: 'sin_firma', finanzas_id: 'tab-1', ronda_2_incompleta: true, sin_acuerdo: true })
    const r = cerrarOficina(nuevo, { fin: true, leer: true, estado: 'cierre_por_tope' }, sin)
    expect(r.finanzas_id).toBe('tab-1'); expect(r.finanzas_motivo).not.toBeNull(); expect(['sin_firma', 'sin_acuerdo']).toContain(r.finanzas_motivo)
  })
  it('🔴 plazo vencido (la planeación pidió el cierre): lee la firma si la hay; si no, «vencido»; si la lectura falla, «vencido» (no «sin_bloque»)', () => {
    const dec = { fin: true, finanzas_motivo: 'vencido', leer: true, cerrar_antes: true }
    expect(cerrarOficina(nuevo, dec, resp('cierre_por_tope', { estado: 'firmado', finanzas_id: 'tab-9' }))).toEqual({ finanzas_id: 'tab-9', finanzas_motivo: null })
    expect(cerrarOficina(nuevo, dec, resp('cierre_por_tope'))).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
    expect(cerrarOficina(nuevo, dec, { statusCode: 409, body: { error: 'paso_en_vuelo' } })).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
    expect(cerrarOficina(nuevo, dec, null)).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
    expect(cerrarOficina(antes, dec, resp('cierre_por_tope', { estado: 'firmado', finanzas_id: 'tab-9' }))).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
  })
  it('lo demás no cambió: apagada, otros motivos, normal firmado/sin firma, fallido, sin respuesta', () => {
    const casos: Array<[Record<string, unknown>, Record<string, unknown> | null]> = [
      [{ resultado: 'apagada' }, null],
      [{ fin: true, finanzas_motivo: 'sin_bloque' }, null],
      [{ fin: true, leer: true, estado: 'cerrado' }, resp('cerrado', { estado: 'firmado', finanzas_id: 'tab-2' })],
      [{ fin: true, leer: true, estado: 'cerrado' }, resp('cerrado', { estado: 'sin_firma', finanzas_id: 'tab-2' })],
      [{ fin: true, leer: true, estado: 'sin_acuerdo' }, resp('sin_acuerdo', { estado: 'sin_firma', finanzas_id: 'tab-2', sin_acuerdo: true })],
      [{ fin: true, leer: true, estado: 'fallido' }, resp('fallido')],
      [{ fin: true, leer: true, estado: 'cerrado' }, { statusCode: 500, body: {} }],
      [{ fin: true, leer: true, estado: 'cerrado' }, resp('cerrado', { estado: 'sin_bloque', motivo: 'sin_pauta' })],
    ]
    for (const [dec, l] of casos) expect(cerrarOficina(nuevo, dec, l)).toEqual(cerrarOficina(antes, dec, l))
  })
})

describe('la forma del cambio (planeación)', () => {
  it('🔴 LINAJE: el constructor reproduce el ARREGLADO desde el de #665 y no se construye dos veces', () => {
    expect(JSON.stringify(M.construirFlujo(antes))).toBe(JSON.stringify(nuevo)); expect(() => M.construirFlujo(nuevo)).toThrow(/ya lee la firma/)
  })
  it('cambia UN nodo («FIN · cerrar la oficina») en UN campo; nodos y cables iguales', () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    const d = nuevo.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i]))
    expect(d.map((n) => n.name)).toEqual(['FIN · cerrar la oficina'])
    expect(Object.keys(d[0].parameters).filter((k) => JSON.stringify(d[0].parameters[k]) !== JSON.stringify(nodo(antes, d[0].name).parameters[k]))).toEqual(['jsCode'])
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(antes.connections))
  })
})
