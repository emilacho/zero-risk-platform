/**
 * 17-nov · CC1 · GO de Lenovo sobre la observación de CC6 a #1140: el dueño nunca recibe dos veces la misma pregunta pendiente, ni con dos corridas a la vez.
 * La base falsa IMITA el índice único de 202611172330 (una pendiente por cliente + sede + tema_norm → error 23505), y registra el orden de lecturas y escrituras
 * para probar que las dos corridas leyeron ANTES de que cualquiera escribiera (la carrera real). US$ 0.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rutaPreguntas, type PuertoDelCerebro } from '../src/lib/dueno-preguntas/preguntas'

const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-11-17T19:00:00Z')
const WF = { workflow_id: 'cerebroVigilar01', workflow_execution_id: '990001' }
const CEREBRO = { oficina: 'cerebro', agente: 'vigilante-de-hechos' }
const FIN = { oficina: 'financiera', agente: 'chief-financial-officer' }
type Fila = Record<string, unknown>
const clave = (f: Fila) => [f.client_id, f.sede_clave ?? '', f.tema_norm].join('|')

function baseConIndice(semilla: Fila[] = [], opc: { sinIndice?: boolean; fallaAlCerrar?: boolean } = {}) {
  const filas: Fila[] = semilla.map((f) => ({ ...f }))
  const pasos: string[] = []
  const db = {
    from(t: string) {
      const fs_: Array<[string, unknown]> = [], desde: Array<[string, string]> = []
      let op = 'select', datos: Fila = {}
      const filtrar = () => filas.filter((r) => fs_.every(([a, b]) => r[a] === b) && desde.every(([a, b]) => String(r[a]) >= b))
      const q: any = {
        select: () => q, eq: (a: string, b: unknown) => (fs_.push([a, b]), q), gte: (a: string, b: unknown) => (desde.push([a, String(b)]), q), limit: () => q,
        insert: (d: Fila) => ((op = 'insert'), (datos = d), q), update: (d: Fila) => ((op = 'update'), (datos = d), q),
        then(ok: (v: unknown) => void) {
          if (t !== 'dueno_preguntas') return ok({ data: [], error: null })
          pasos.push(op)
          if (op === 'insert') {
            const nueva = { creado_en: AHORA.toISOString(), ...datos }
            if (!opc.sinIndice && filas.some((r) => r.estado === 'pendiente' && clave(r) === clave(nueva))) return ok({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dueno_preguntas_una_pendiente_por_tema"' } })
            filas.push(nueva)
            return ok({ data: null, error: null })
          }
          if (op === 'update' && opc.fallaAlCerrar) return ok({ data: null, error: { message: 'permission denied' } })
          if (op === 'update') { const hit = filtrar(); for (const r of hit) Object.assign(r, datos); return ok({ data: hit.map((r) => ({ id: r.id })), error: null }) }
          ok({ data: filtrar(), error: null })
        },
      }
      return q
    },
  }
  return { db, filas, pasos }
}
const cerebro: PuertoDelCerebro = { async respuestas() { return { ok: true, respuestas: [] } }, async guardar() { return { ok: true, ficha_id: null } } }
let n = 0
const deps = (db: unknown) => ({ db: db as never, cerebro, ahora: AHORA, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` })
const pedir = (quien: Fila, extra: Fila = {}) => ({ accion: 'preguntar', client_id: C, ...WF, preguntado_por: quien, tema: 'zona de entrega de Olón', pregunta: '¿A qué zona entregan desde Olón?', canal: 'dashboard · Tu oficina', ...extra })
const pendientes = (filas: Fila[]) => filas.filter((f) => f.estado === 'pendiente')

describe('dos corridas a la vez no le preguntan dos veces lo mismo al dueño', () => {
  it('🔴 dos inserciones a la vez (misma oficina): las dos leen antes de escribir; la base deja UNA y la otra recibe «repetida» con el id de la que ganó', async () => {
    const b = baseConIndice()
    const [r1, r2] = await Promise.all([rutaPreguntas(deps(b.db), pedir(CEREBRO)), rutaPreguntas(deps(b.db), pedir(CEREBRO))])
    // la carrera es real: ninguna escritura antes de que las dos terminaran de leer
    expect(b.pasos.slice(0, b.pasos.indexOf('insert')).filter((p) => p === 'select').length).toBe(4) // 2 lecturas por corrida (recientes + exactas)
    expect(pendientes(b.filas)).toHaveLength(1)
    const ganadora = [r1, r2].find((r) => r.body.registrada === true)!
    const perdedora = [r1, r2].find((r) => r.body.registrada === false)!
    expect(perdedora.status).toBe(200)
    expect(perdedora.body).toMatchObject({ ok: true, registrada: false, repetida: true, choque: true, pregunta_id: ganadora.body.pregunta_id })
  })
  it('🔴 dos oficinas a la vez: la perdedora recibe «ya_preguntada» con la pendiente de la otra', async () => {
    const b = baseConIndice()
    const [r1, r2] = await Promise.all([rutaPreguntas(deps(b.db), pedir(CEREBRO)), rutaPreguntas(deps(b.db), pedir(FIN))])
    expect(pendientes(b.filas)).toHaveLength(1)
    const perdedora = [r1, r2].find((r) => r.body.registrada === false)!
    expect(perdedora.body).toMatchObject({ ya_preguntada: true, choque: true, pendiente: { pregunta_id: pendientes(b.filas)[0].id } })
  })
  it('🔴 misma oficina pero OTRO agente: la perdedora recibe «ya_preguntada», no «repetida»', async () => {
    const b = baseConIndice()
    const [r1, r2] = await Promise.all([rutaPreguntas(deps(b.db), pedir(CEREBRO)), rutaPreguntas(deps(b.db), pedir({ oficina: 'cerebro', agente: 'otro-vigilante' }))])
    const perdedora = [r1, r2].find((r) => r.body.registrada === false)!
    expect(perdedora.body).toMatchObject({ ya_preguntada: true, choque: true })
    expect(perdedora.body.repetida).toBeUndefined()
  })
  it('🔴 control: SIN el índice la misma carrera deja dos pendientes (la prueba sí mide la carrera)', async () => {
    const b = baseConIndice([], { sinIndice: true })
    await Promise.all([rutaPreguntas(deps(b.db), pedir(CEREBRO)), rutaPreguntas(deps(b.db), pedir(CEREBRO))])
    expect(pendientes(b.filas)).toHaveLength(2)
  })
  it('🔴 otra sede u otro tema no chocan', async () => {
    const b = baseConIndice()
    const [r1, r2] = await Promise.all([rutaPreguntas(deps(b.db), pedir(CEREBRO)), rutaPreguntas(deps(b.db), pedir(CEREBRO, { tema: 'fecha de apertura de Olón', pregunta: '¿Cuándo abre Olón?' }))])
    expect([r1.body.registrada, r2.body.registrada]).toEqual([true, true])
    expect(pendientes(b.filas)).toHaveLength(2)
  })
})

describe('la regla de las 72 h y `forzar` siguen valiendo, sin dejar dos pendientes', () => {
  const vieja = (extra: Fila = {}) => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', client_id: C, sede_clave: null, tema: 'zona de entrega de Olón', tema_norm: '', pregunta: '¿?', canal: 'x', ...FIN, estado: 'pendiente', creado_en: '2026-11-13T10:00:00Z', ...extra })
  async function conTemaNorm(extra: Fila = {}) {
    // el tema_norm real sale de la misma función que usa la ruta
    const b0 = baseConIndice([], { sinIndice: true })
    await rutaPreguntas(deps(b0.db), pedir(CEREBRO))
    return vieja({ tema_norm: b0.filas[0].tema_norm, ...extra })
  }
  it('🔴 una pendiente idéntica de MÁS de 72 h se cierra como «vencida» (con motivo, sin borrar) y entra la nueva: queda una sola pendiente', async () => {
    const b = baseConIndice([await conTemaNorm()])
    const r = await rutaPreguntas(deps(b.db), pedir(CEREBRO))
    expect(r.body).toMatchObject({ registrada: true })
    expect(b.filas).toHaveLength(2)
    expect(b.filas[0]).toMatchObject({ estado: 'vencida', motivo: expect.stringContaining('72 h') })
    expect(pendientes(b.filas)).toHaveLength(1)
  })
  it('🔴 una idéntica RECIENTE no se toca: «ya_preguntada» (aunque el parecido de palabras no la hubiera visto)', async () => {
    const b = baseConIndice([await conTemaNorm({ creado_en: '2026-11-17T18:00:00Z', tema: 'xx' })])
    const r = await rutaPreguntas(deps(b.db), pedir(CEREBRO))
    expect(r.body).toMatchObject({ registrada: false, ya_preguntada: true, pendiente: { pregunta_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } })
    expect(r.body.choque).toBeUndefined()
    expect(b.filas[0].estado).toBe('pendiente')
  })
  it('🔴 una pendiente del mismo tema en OTRA sede no se toca ni frena', async () => {
    const b = baseConIndice([await conTemaNorm({ creado_en: '2026-11-17T18:00:00Z', sede_clave: 'olon' })])
    const r = await rutaPreguntas(deps(b.db), pedir(CEREBRO))
    expect(r.body).toMatchObject({ registrada: true })
    expect(b.filas[0].estado).toBe('pendiente')
    expect(pendientes(b.filas)).toHaveLength(2)
  })
  it('🔴 si no se puede cerrar la vieja, NO se registra la nueva (502): nunca quedan dos', async () => {
    const b = baseConIndice([await conTemaNorm()], { fallaAlCerrar: true })
    const r = await rutaPreguntas(deps(b.db), pedir(CEREBRO))
    expect(r.status).toBe(502)
    expect(b.filas).toHaveLength(1)
    expect(b.pasos).not.toContain('insert')
  })
  it('🔴 con `forzar`, la pendiente reciente se cierra como «obsoleta» con motivo y entra la nueva', async () => {
    const b = baseConIndice([await conTemaNorm({ creado_en: '2026-11-17T18:00:00Z' })])
    const r = await rutaPreguntas(deps(b.db), pedir(CEREBRO, { forzar: true }))
    expect(r.body).toMatchObject({ registrada: true })
    expect(b.filas[0]).toMatchObject({ estado: 'obsoleta', motivo: expect.stringContaining('forzar') })
    expect(pendientes(b.filas)).toHaveLength(1)
  })
})

describe('la migración 202611172330', () => {
  const sql = fs.readFileSync('supabase/migrations/202611172330_dueno_preguntas_una_pendiente_por_tema.sql', 'utf8')
  const rev = fs.readFileSync('supabase/reversas/202611172330_dueno_preguntas_una_pendiente_por_tema_REVERSA.sql', 'utf8')
  it('🔴 índice ÚNICO parcial sobre (cliente, sede, tema_norm) solo de las pendientes, la misma clave que imita la prueba', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS dueno_preguntas_una_pendiente_por_tema\s+ON public\.dueno_preguntas \(client_id, coalesce\(sede_clave, ''\), tema_norm\)\s+WHERE estado = 'pendiente';/)
  })
  it('🔴 las duplicadas previas se cierran como «obsoleta» con motivo, dejando la más vieja; nada se borra', () => {
    expect(sql).toMatch(/PARTITION BY client_id, coalesce\(sede_clave, ''\), tema_norm ORDER BY creado_en, id/)
    expect(sql).toMatch(/SET estado = 'obsoleta',\s+motivo = '[^']+'/)
    expect(sql).toMatch(/o\.n > 1/)
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i)
    expect(sql.indexOf('UPDATE')).toBeLessThan(sql.indexOf('CREATE UNIQUE INDEX'))
  })
  it('🔴 la reversa solo quita el índice', () => {
    expect(rev).toMatch(/DROP INDEX IF EXISTS public\.dueno_preguntas_una_pendiente_por_tema;/)
    expect(rev).not.toMatch(/\bUPDATE\b|\bDELETE\b/i)
  })
})
