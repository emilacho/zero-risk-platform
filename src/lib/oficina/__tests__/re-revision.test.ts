/**
 * RE-REVISAR una pieza cerrada (30-oct). US$ 0, sin red. Una pieza de la mesa se juega entera en ensayo, se vuelve «real y cerrada», y se re-revisa:
 * el encargo nuevo NO pasa por la mesa, arranca en los chequeos con los materiales de la original, abre UNA revisión de la jefatura con el tope vigente, y al volver cierra y llega a la bandeja.
 * Sin rondas de «Pedir cambios», sin notas del dueño, original intacta, techo de US$ 3, un solo intento vivo a la vez.
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { DbFalsa } from './dbfalsa'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import { recibirJefatura } from '../orquestador'
import type { AperturaDeJefatura, Puertos } from '../puertos'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { estadoParaReRevisar, reRevisar, TOPE_DE_UNA_RE_REVISION_USD } from '../re-revision'
import { estadoInicial, type Estado } from '../tipos'
import type { Memoria } from './memoria'
import { jugar, montar } from './mesa-arnes'

const HITL = '22222222-2222-4222-8222-222222222222'

/** una base mínima que contesta lo que `reRevisar` lee: la fila de la bandeja y el encargo por su `hitl_queue_id` */
function dbDe(M: Memoria, hitl: Record<string, unknown>) {
  return {
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = []
      const filas = (): Array<Record<string, unknown>> => (tabla === 'hitl_queue' ? (filtros.every(([, v]) => String(v) === HITL) ? [hitl] : []) : [...M.encargos.values()].map((e) => e as unknown as Record<string, unknown>).filter((e) => filtros.every(([c, v]) => e[c] === v)))
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        limit: async () => ({ data: filas(), error: null }),
        then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
      }
      return q
    },
  }
}

async function cerrada(opc: { jefatura?: boolean } = {}) {
  const { M, a, id } = await montar()
  await jugar(M, id, a)
  const enc = M.encargos.get(id)!
  expect(enc.estado).toBe('cerrado')
  ;(enc as { dry_run: boolean }).dry_run = false // la pieza «real»
  ;(enc as { hitl_queue_id: string | null }).hitl_queue_id = HITL
  const sobres: unknown[] = []
  if (opc.jefatura !== false) M.P.jefatura = async (s): Promise<AperturaDeJefatura> => { sobres.push(s); return { estado: 'esperando', revision_id: 'rev-nueva' } }
  const db = dbDe(M, { id: HITL, status: 'pending', type: 'content_piece_review', client_id: enc.client_id })
  return { M, id, enc, db, sobres }
}
const salida = (id: string, o: Record<string, unknown> = {}): SalidaDeRevision => ({
  revision_id: 'rev-nueva', artifact_type: 'pieza', artifact_id: id, resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false,
  desacuerdos: [], costo_usd: 0.9, pasos: 4, trace_id: 'jefatura:rev-nueva', devolver_a: null, simulado: false, ...o,
} as unknown as SalidaDeRevision)

describe('re-revisar · el estado de arranque', () => {
  const previo: Estado = { ...estadoInicial(), ultimo: 14, pasos_ejecutados: 22, gasto_usd: 1.69, artefactos: {
    mesa: { version: 17, datos: { x: 1 } }, copy_carrusel: { version: 2, datos: { texto_base: 't' } }, render: { version: 2, datos: {} }, chequeos: { version: 2, datos: { fichas: 1 } },
    respuesta_imagen: { version: 1, datos: {} }, fichas_externas: { version: 1, datos: {} }, entrega: { version: 1, datos: {} }, cierre: { version: 1, datos: {} },
  } as never, vueltas: { x: 1 }, fichas: [{ id: 'f' } as never] }
  it('arranca justo antes de los chequeos, con los materiales de la original y sin su gasto, sus vueltas, sus fichas ni lo que produjeron la revisión y el cierre', () => {
    const r = estadoParaReRevisar(CARRUSEL_MESA, previo)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(CARRUSEL_MESA.pasos[r.indiceDeArranque].clave).toBe('chequeos')
    expect(CARRUSEL_MESA.pasos[r.estado.ultimo + 1].clave).toBe('chequeos')
    expect(Object.keys(r.estado.artefactos).sort()).toEqual(['copy_carrusel', 'mesa', 'render'])
    expect(r.estado).toMatchObject({ gasto_usd: 0, vueltas: {}, fichas: [] })
    expect(previo.artefactos['copy_carrusel']).toBeDefined() // la original no se muta
    expect(previo.gasto_usd).toBe(1.69)
  })
  it('sin materiales que revisar, o sin paso de jefatura, no se puede', () => {
    expect(estadoParaReRevisar(CARRUSEL_MESA, estadoInicial())).toMatchObject({ ok: false })
    expect(estadoParaReRevisar({ pasos: CARRUSEL_MESA.pasos.filter((p) => p.tipo !== 'jefatura') }, previo)).toMatchObject({ ok: false })
  })
})

describe('re-revisar una pieza de la mesa cerrada', () => {
  it('solo_estimar no crea nada y dice el techo', async () => {
    const { M, db } = await cerrada()
    const antes = M.encargos.size
    const r = await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'emilio', solo_estimar: true })
    expect(r).toMatchObject({ status: 200, cuerpo: { accion: 'estimado', puede: true, arranca_en: 'chequeos', techo_usd: TOPE_DE_UNA_RE_REVISION_USD } })
    expect(M.encargos.size).toBe(antes)
  })
  it('abre un encargo NUEVO sin pasar por la mesa, abre UNA revisión de la jefatura y deja esperando; la original no se toca', async () => {
    const { M, id, enc, db, sobres } = await cerrada()
    const turnosMesaAntes = M.turnos.get(id)!.size
    const aportesAntes = M.P.mesa ? (await M.P.mesa.libro(id)).length : 0
    const foto = JSON.stringify(enc)
    const r = await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'emilio' })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'esperar_jefatura', desde_encargo: id, techo_usd: TOPE_DE_UNA_RE_REVISION_USD })
    const nid = String(r.cuerpo.encargo_id)
    const nuevo = M.encargos.get(nid)!
    expect(nuevo).toMatchObject({ version_encargo: 2, dry_run: false, familia: 'carrusel_mesa', brief_id: enc.brief_id, tope_usd: TOPE_DE_UNA_RE_REVISION_USD })
    expect(nuevo.sala_ref).toMatchObject({ re_revision: { desde_encargo: id, desde_hitl: HITL, pedido_por: 'emilio' } })
    expect(nuevo.sala_ref).not.toHaveProperty('cambios_del_dueno') // no cuenta como ronda de «Pedir cambios»
    expect([...M.turnos.get(nid)!.values()].filter((t) => t.tipo === 'agente' || t.paso.startsWith('mesa'))).toHaveLength(0) // la mesa no corrió
    expect(sobres).toHaveLength(1)
    expect(sobres[0]).toMatchObject({ artifact_type: 'pieza', artifact_id: nid, payload: { dry_run: false, familia: 'carrusel', tope_restante_usd: TOPE_DE_UNA_RE_REVISION_USD } })
    expect(String((sobres[0] as { payload: { texto: string } }).payload.texto).length).toBeGreaterThan(20) // revisa el texto real de la original
    expect(JSON.stringify(M.encargos.get(id))).toBe(foto) // la original, intacta
    expect(M.turnos.get(id)!.size).toBe(turnosMesaAntes)
    if (M.P.mesa) expect((await M.P.mesa.libro(id)).length).toBe(aportesAntes)
  })
  it('al volver la jefatura el encargo cierra, la pieza llega a la bandeja (una vez) y lo gastado es solo lo de la re-revisión', async () => {
    const { M, id, db } = await cerrada()
    const bandejaAntes = M.llamadas.bandeja.length
    const r = await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'emilio' })
    const nid = String(r.cuerpo.encargo_id)
    const fin = await recibirJefatura(M.P as Puertos, nid, salida(nid))
    expect(fin.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M.llamadas.bandeja.length).toBe(bandejaAntes + 1)
    expect(M.llamadas.bandeja.at(-1)).toBeDefined()
    expect(M.encargos.get(nid)!.gasto_usd).toBeLessThanOrEqual(TOPE_DE_UNA_RE_REVISION_USD)
    expect(M.encargos.get(nid)!.gasto_usd).toBeGreaterThan(0) // lo que gastó la jefatura entra al libro del encargo nuevo
    expect(M.encargos.get(id)!.gasto_usd).toBeLessThan(M.encargos.get(id)!.gasto_usd + 1) // la original conserva el suyo
  })
  it('un solo intento vivo a la vez: con la re-revisión en curso, otra no abre', async () => {
    const { M, db, sobres } = await cerrada()
    const a1 = await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'emilio' })
    expect(a1.status).toBe(200)
    const a2 = await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'emilio' })
    expect(a2.status).toBe(409)
    expect(a2.cuerpo).toMatchObject({ error: 'ya_hay_una_version_mas_nueva', version: 2 })
    expect(sobres).toHaveLength(1)
  })
  it('no se re-revisa un ensayo, una pieza ya decidida, algo que no es pieza, ni un encargo vivo', async () => {
    const { M, enc, db } = await cerrada()
    ;(enc as { dry_run: boolean }).dry_run = true
    expect((await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'e' })).cuerpo).toMatchObject({ error: 'es_un_ensayo' })
    ;(enc as { dry_run: boolean }).dry_run = false
    ;(enc as { estado: string }).estado = 'en_paso'
    expect((await reRevisar(db as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'e' })).cuerpo).toMatchObject({ error: 'encargo_no_cerrado' })
    const decidida = dbDe(M, { id: HITL, status: 'rejected', type: 'content_piece_review', client_id: 'c' })
    expect((await reRevisar(decidida as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'e' })).cuerpo).toMatchObject({ error: 'ya_decidida' })
    const otra = dbDe(M, { id: HITL, status: 'pending', type: 'editor_escalation', client_id: 'c' })
    expect((await reRevisar(otra as never, M.P as Puertos, { hitl_id: HITL, reviewer: 'e' })).cuerpo).toMatchObject({ error: 'no_es_una_pieza_de_la_oficina' })
    expect((await reRevisar(dbDe(M, {}) as never, M.P as Puertos, { hitl_id: '33333333-3333-4333-8333-333333333333', reviewer: 'e' })).status).toBe(404)
  })
})

describe('re-revisar · el almacén real (Supabase simulado)', () => {
  const base = { client_id: 'c1', parte_id: '426af72d-12c0-471c-9fda-2a2978db5175', brief_id: 'BRF-0100', tipo_de_grupo: 'carrusel_mesa', familia: 'carrusel_mesa' }
  const REAL = '33333333-3333-4333-8333-333333333333'
  const mundo = (extra: Array<Record<string, unknown>> = []) => new DbFalsa().semilla('oficina_encargos', [
    { ...base, id: '11111111-1111-4111-8111-111111111111', version_encargo: 2, estado: 'cerrado', gasto_usd: 0, dry_run: true, sala_ref: {} },
    { ...base, id: REAL, version_encargo: 3, estado: 'cerrado', gasto_usd: 1.69, dry_run: false, sala_ref: {} },
    ...extra,
  ])
  const nuevo = (desde: string) => ({ ...base, tope_usd: 3, dry_run: false, prueba: false, sala_ref: { _journey_id: null }, estado_del_motor: estadoInicial(), re_revision: { desde_encargo: desde, desde_hitl: HITL, pedido_por: 'emilio' } })
  const almacen = (db: DbFalsa) => crearPuertos(db, { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('{}')) as typeof fetch).almacen
  it('abre la versión siguiente a la mayor (los ensayos no cuentan), fuera del tope de 3, con la marca en sala_ref', async () => {
    const db = mundo()
    const r = await almacen(db).crearEncargo(nuevo(REAL))
    expect(r.ok && r.nuevo).toBe(true)
    expect(db.tablas['oficina_encargos'].find((e) => e.version_encargo === 4)).toMatchObject({ dry_run: false, tope_usd: 3, sala_ref: { re_revision: { desde_encargo: REAL } } })
  })
  it('solo sobre la última versión real y cerrada: otra id, una más nueva o una viva → no abre', async () => {
    expect((await almacen(mundo()).crearEncargo(nuevo('11111111-1111-4111-8111-111111111111'))).ok).toBe(false) // el ensayo no es la pieza
    expect((await almacen(mundo([{ ...base, id: '44444444-4444-4444-8444-444444444444', version_encargo: 4, estado: 'en_paso', gasto_usd: 0, dry_run: false, sala_ref: {} }])).crearEncargo(nuevo(REAL))).ok).toBe(false) // ya hay otra viva
    const cerradaAntes = mundo(); cerradaAntes.tablas['oficina_encargos'][1].estado = 'fallido'
    expect((await almacen(cerradaAntes).crearEncargo(nuevo(REAL))).ok).toBe(false)
  })
})
