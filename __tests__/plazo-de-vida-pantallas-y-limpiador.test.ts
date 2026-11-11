/**
 * 11-nov · #21 · la regla única de vida en las PANTALLAS (corridas y riesgos), el LIMPIADOR de incidentes y el brazo de video, leídos por la base falsa
 * (que proyecta columnas: si una lectura deja de pedir `running_at`/`updated_at`, el latido se pierde y estas pruebas lo ven). US$ 0, sin red.
 * Dos clientes de rubros distintos: Náufrago (restaurante) y el B2B industrial.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { correrCicloDeIncidentes } from '../src/lib/incidentes/ciclo-de-vida'
import { leerCorrida, leerCorridas } from '../src/lib/direccion/corridas'
import { leerRiesgos } from '../src/lib/direccion/riesgos'
import { MINUTOS_PARA_ESPERAR_AL_BRAZO, sondearVideos } from '../src/lib/oficina/orquestador-video'
import type { Contexto } from '../src/lib/direccion/comun'

const AHORA = new Date('2026-11-11T14:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const NAU = '7c2a1d4e-0000-4000-8000-00000000a001', B2B = 'df7e47cc-0000-4000-8000-00000000b002'
const ctx = (db: DbFalsa): Contexto => ({ db, ahora: () => AHORA, env: {} })
/** un despacho que corre desde hace `h` horas: `late` = latió hace 1 min; si no, su updated_at es el de cuando pasó a running (nunca latió) */
const corriendo = (k: string, cliente: string, h: number, late: boolean, exec = '9001') => ({ id: k, dispatch_key: k, agent_name: 'jefe-marketing', workflow_execution_id: exec, client_id: cliente, status: 'running', created_at: hace(h), running_at: hace(h - 0.01), updated_at: late ? hace(1 / 60) : hace(h - 0.01) })

describe('el limpiador de incidentes lee el latido', () => {
  it('🔴 un despacho de 30 h que sigue latiendo NO se cierra; uno de 30 h sin latido sí (Náufrago late, B2B no)', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [corriendo('nau-late', NAU, 30, true), corriendo('b2b-muerto', B2B, 30, false)])
    const r = await correrCicloDeIncidentes(ctx(db), { ejecutar: true })
    expect(r.cierres.map((c) => c.id)).toEqual(['b2b-muerto'])
    expect(db.tablas['agent_dispatches'].map((d) => d.status)).toEqual(['running', 'sin_cierre'])
  })
})

describe('riesgos lee el latido y el arranque', () => {
  it('🔴 un despacho de 2 h que late no es «atascado»; uno de 2 h que nunca latió sí', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [corriendo('nau-late', NAU, 2, true), corriendo('b2b-quieto', B2B, 2, false)])
    const ids = (await leerRiesgos(ctx(db))).riesgos.map((x) => x.id).filter((x) => x.startsWith('despacho:'))
    expect(ids).toEqual(['despacho:b2b-quieto'])
  })
  it('🔴 un despacho que esperó en fila y recién pasó a running no cuenta como «latiendo»: su arranque es running_at, no created_at', async () => {
    // creado hace 2 h, pasó a running hace 1 min y todavía no latió (updated_at = running_at): sin leer running_at parecería un latido
    const d = { ...corriendo('b2b-recien', B2B, 2, false), running_at: hace(1 / 60), updated_at: hace(1 / 60) }
    const ids = (await leerRiesgos(ctx(new DbFalsa().semilla('agent_dispatches', [d])))).riesgos.map((x) => x.id)
    expect(ids).toContain('despacho:b2b-recien')
  })
})

describe('el panel de corridas lee el latido', () => {
  it('🔴 lista: una corrida de 2 h con su despacho latiendo está «en_curso»; una igual sin latido, «atascada»', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [corriendo('nau-late', NAU, 2, true, '9001'), corriendo('b2b-quieto', B2B, 2, false, '9002')])
    const c = await leerCorridas(ctx(db))
    const estado = (e: string) => c.corridas.find((x) => x.workflow_execution_id === e)?.estado
    expect([estado('9001'), estado('9002')]).toEqual(['en_curso', 'atascada'])
  })
  it('🔴 detalle: el paso de un despacho que late sale «running», el que no late sale «atascado» (también en una rama)', async () => {
    const db = new DbFalsa().semilla('agent_dispatches', [corriendo('nau-late', NAU, 2, true, '9001'), corriendo('nau-rama-late', NAU, 2, true, '9001:2'), corriendo('nau-rama-quieta', NAU, 2, false, '9001:3')])
    const r = await leerCorrida(ctx(db), '9001')
    const pasos = JSON.stringify(r.cuerpo)
    const estadoDe = (k: string) => (pasos.match(new RegExp(`"estado":"(\\w+)","error":[^}]*"despacho":"${k}"`)) ?? [])[1]
    expect([estadoDe('nau-late'), estadoDe('nau-rama-late'), estadoDe('nau-rama-quieta')]).toEqual(['running', 'running', 'atascado'])
  })
})

describe('el brazo de video nunca espera menos que hoy', () => {
  it('🔴 con un techo medido menor que 45 min, un video de 20 min sin terminar sigue esperando (no se da por vencido)', async () => {
    let recibio = 0
    const enc = { id: 'e1', estado: 'esperando', client_id: B2B, brief_id: 'BRF-1', sala_ref: null, estado_del_motor: { artefactos: { pedido_video: { datos: { envio: { request_id: 'r1' } } } } } }
    const P = {
      almacen: { leerEncargo: async () => enc, registrarPaso: async () => { recibio++ } },
      video: { estado: async () => ({ ok: true, terminal: false, status: 'IN_PROGRESS' }) },
    } as never
    const inicio = new Date(AHORA.getTime() - 20 * 60_000).toISOString()
    const r = await sondearVideos(P, [{ encargo_id: 'e1', n: 3, paso: 'video', inicio }], AHORA, 10)
    expect(r).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(recibio).toBe(0)
    expect(MINUTOS_PARA_ESPERAR_AL_BRAZO).toBe(45)
  })
})
