/**
 * Plan v3 · V13 · `plan_corridas` (S2 del diseño §17.1 + el menor de CC#3). Reloj simulado y un almacén en memoria que IMITA las garantías de la base
 * (UNIQUE (client_id, corrida), índice único parcial «una activa por cliente», compare-and-set). Sin red, sin gasto.
 * Las «mutaciones» quitan una garantía del almacén (o del módulo) y comprueban que la prueba correspondiente se rompe.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, barrer, cerrar, correr, ESPERA_MAXIMA_MIN, GRACIA_DEL_BARRIDO_MIN, reintentar, TECHO_DE_CORRIDA_MIN, vencibles, type FilaDeCorrida, type PuertoDeCorridas } from '../src/lib/planeacion/corridas'
import { almacenDeCorridas } from '../src/lib/planeacion/corridas-supabase'

const MIN = 60_000
function mundo(o: { sinIndiceParcial?: boolean; sinCompareAndSet?: boolean; sinInsertOnce?: boolean } = {}) {
  let t = Date.parse('2026-10-15T12:00:00Z')
  const filas: FilaDeCorrida[] = []
  let seq = 0
  const vivo = (f: FilaDeCorrida) => f.estado === 'esperando' || f.estado === 'corriendo'
  const P: PuertoDeCorridas = {
    ahora: () => new Date(t),
    async insertarUnaVez(f) {
      const ya = filas.find((x) => x.client_id === f.client_id && x.corrida === f.corrida)
      if (ya && !o.sinInsertOnce) return { creada: false, fila: ya }
      if (!ya && !o.sinIndiceParcial && vivo(f as FilaDeCorrida) && filas.some((x) => x.client_id === f.client_id && vivo(x))) return { choque: true }
      const fila: FilaDeCorrida = { ...f, id: `id-${++seq}`, actualizado_en: new Date(t).toISOString() }
      if (ya) { Object.assign(ya, { espera_desde: f.espera_desde, vence_en: f.vence_en }); return { creada: true, fila: ya } } // sin insert-once: pisa el reloj
      filas.push(fila)
      return { creada: true, fila }
    },
    async leer(c, k) { return filas.find((x) => x.client_id === c && x.corrida === k) ?? null },
    async activaDe(c) { return filas.find((x) => x.client_id === c && vivo(x)) ?? null },
    async avanzarSi(c, k, n, cambios) {
      const f = filas.find((x) => x.client_id === c && x.corrida === k && vivo(x) && (o.sinCompareAndSet || x.intentos === n))
      if (!f) return null
      Object.assign(f, cambios, { actualizado_en: new Date(t).toISOString() })
      return { ...f }
    },
    async vivasVencidas(iso) { return filas.filter((x) => vivo(x) && x.vence_en < iso).map((x) => ({ ...x })) },
  }
  return { P, filas, avanzar: (min: number) => { t += min * MIN }, hora: () => new Date(t).toISOString() }
}
const E = { client_id: 'cliente-a', corrida: 'c-1', dry_run: true }

describe('abrir · el primer pre-vuelo crea la fila y fija el reloj', () => {
  it('crea en «esperando» con espera_desde ahora y vence_en +45 min', async () => {
    const w = mundo()
    const r = await abrir(w.P, E)
    expect(r.status).toBe(200)
    if (r.status !== 200 || r.accion !== 'abierta') throw new Error('no abrió')
    expect(r.fila.estado).toBe('esperando')
    expect(r.fila.espera_desde).toBe(w.hora())
    expect(Date.parse(r.fila.vence_en) - Date.parse(r.fila.espera_desde)).toBe(ESPERA_MAXIMA_MIN * MIN)
    expect(r.reintentar_en_s).toBe(300)
  })
  it('entrada inválida ⇒ 400 y nada escrito', async () => {
    const w = mundo()
    const r = await abrir(w.P, { client_id: '', corrida: 'x'.repeat(121), dry_run: 'no' as unknown as boolean })
    expect(r.status).toBe(400)
    expect(w.filas).toHaveLength(0)
  })
  it('(a) un reinicio a los 12 min NO reinicia el reloj: la siguiente lectura cuenta desde el primer pre-vuelo', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(12)
    const r = await abrir(w.P, E) // el flujo se reinicia y vuelve a pedir abrir
    expect(r.status === 200 && r.accion === 'continua').toBe(true)
    if (r.status !== 200 || r.accion !== 'continua') return
    expect(r.fila.espera_desde).toBe(new Date(Date.parse(w.hora()) - 12 * MIN).toISOString())
    expect(r.vencida).toBe(false)
    w.avanzar(ESPERA_MAXIMA_MIN - 12) // la espera completa desde el PRIMER pre-vuelo (no desde el reinicio)
    const r2 = await abrir(w.P, E)
    expect(r2.status === 200 && r2.accion === 'continua' && r2.vencida).toBe(true)
  })
  it('mutación: sin insert-once el reinicio pisa espera_desde ⇒ la prueba (a) se rompe', async () => {
    const w = mundo({ sinInsertOnce: true })
    await abrir(w.P, E)
    w.avanzar(12)
    // con un almacén que pisa, la fila deja de contar desde el primer pre-vuelo
    const primera = w.filas[0].espera_desde
    await w.P.insertarUnaVez({ client_id: E.client_id, corrida: E.corrida, estado: 'esperando', espera_desde: w.hora(), vence_en: w.hora(), intentos: 0, motivo: null, dry_run: true })
    expect(w.filas[0].espera_desde).not.toBe(primera)
  })
})

describe('la espera es de 45 min (AVISO-LENOVO 15-oct)', () => {
  it('la constante vale 45 y vence_en = espera_desde + 45', async () => {
    expect(ESPERA_MAXIMA_MIN).toBe(45)
    const w = mundo()
    const r = await abrir(w.P, E)
    if (r.status !== 200 || r.accion !== 'abierta') throw new Error('no abrió')
    expect(Date.parse(r.fila.vence_en) - Date.parse(r.fila.espera_desde)).toBe(45 * MIN)
  })
  it('a los 44 min NO está vencida (sigue esperando: «completando» a los 44); a los 45 sí', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(44)
    const a = await abrir(w.P, E)
    expect(a.status === 200 && a.accion === 'continua' && a.vencida).toBe(false)
    w.avanzar(1)
    const b = await abrir(w.P, E)
    expect(b.status === 200 && b.accion === 'continua' && b.vencida).toBe(true)
  })
  it('el barrido no toca una espera de 31–44 min (con 30 la habría vencido) y sí la que pasó su vencimiento + gracia', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(40)
    expect((await barrer(w.P)).vencidas).toHaveLength(0)
    w.avanzar(ESPERA_MAXIMA_MIN + GRACIA_DEL_BARRIDO_MIN - 40 + 1) // pasada la gracia
    expect((await barrer(w.P)).vencidas).toHaveLength(1)
  })
  it('10 lecturas cada 5 min caben en la espera (minutos 0, 5, …, 45)', () => {
    expect(ESPERA_MAXIMA_MIN / (300 / 60) + 1).toBe(10)
  })
})

describe('corrección 1 de CC#3 · el barrido no mata la última lectura (gracia)', () => {
  it('el barrido a 45:01 NO toca la espera: la lectura 10 llega, está vencida y corre «con lo del alta»', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(ESPERA_MAXIMA_MIN) // 45:00 · vence_en
    w.avanzar(1 / 60) // 45:01
    expect(await barrer(w.P)).toEqual({ vencidas: [], falladas: [], saltadas: [] })
    expect(w.filas[0].estado).toBe('esperando')
    const r = await abrir(w.P, E) // el re-disparo de la última lectura
    expect(r.status === 200 && r.accion === 'continua' && r.vencida).toBe(true)
    expect(await correr(w.P, { ...E, motivo: 'espera vencida: corre con lo del alta y lo declara' })).toMatchObject({ status: 200, accion: 'avanzada' })
    expect(w.filas[0].estado).toBe('corriendo')
  })
  it('sin ningún re-disparo, el barrido la libera pasada la gracia (no queda atrapado el cliente)', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(ESPERA_MAXIMA_MIN + GRACIA_DEL_BARRIDO_MIN - 1)
    expect((await barrer(w.P)).vencidas).toHaveLength(0)
    w.avanzar(2)
    expect((await barrer(w.P)).vencidas).toHaveLength(1)
    expect(w.filas[0].estado).toBe('vencida')
  })
  it('la gracia es de al menos 2 re-disparos y NO aplica a `corriendo` (su techo ya es el plazo)', async () => {
    expect(GRACIA_DEL_BARRIDO_MIN * 60).toBeGreaterThanOrEqual(2 * 300)
    const w = mundo()
    await abrir(w.P, E)
    await correr(w.P, E)
    w.avanzar(TECHO_DE_CORRIDA_MIN + 1)
    expect((await barrer(w.P)).falladas).toHaveLength(1)
  })
  it('el dry_run del barrido usa la MISMA regla (vencibles)', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(ESPERA_MAXIMA_MIN + 1)
    expect(await vencibles(w.P)).toHaveLength(0)
    w.avanzar(GRACIA_DEL_BARRIDO_MIN)
    expect(await vencibles(w.P)).toHaveLength(1)
  })
  it('mutación: sin gracia (barrido a vence_en) la 7.ª/última lectura encuentra la fila ya vencida', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(ESPERA_MAXIMA_MIN + 1)
    // lo que haría el barrido SIN gracia: pasar a `vencida` todo lo que superó vence_en
    const sinGracia = await w.P.vivasVencidas(w.hora())
    for (const f of sinGracia) await w.P.avanzarSi(f.client_id, f.corrida, f.intentos, { estado: 'vencida' })
    expect(await abrir(w.P, E)).toMatchObject({ status: 200, accion: 'terminada' })
  })
})

describe('corrección 2 de CC#3 · un re-disparo con otro dry_run no continúa la corrida', () => {
  it('real sobre una corrida creada en seco ⇒ 409 dry_run_distinto, la fila no cambia', async () => {
    const w = mundo()
    await abrir(w.P, { ...E, dry_run: true })
    const antes = JSON.stringify(w.filas[0])
    const r = await abrir(w.P, { ...E, dry_run: false })
    expect(r).toMatchObject({ status: 409, error: 'dry_run_distinto', dry_run_de_la_corrida: true, dry_run_pedido: false })
    expect(JSON.stringify(w.filas[0])).toBe(antes)
  })
  it('seco sobre una corrida creada real ⇒ 409 (el otro sentido)', async () => {
    const w = mundo()
    await abrir(w.P, { ...E, dry_run: false })
    expect(await abrir(w.P, { ...E, dry_run: true })).toMatchObject({ status: 409, error: 'dry_run_distinto', dry_run_de_la_corrida: false, dry_run_pedido: true })
  })
  it('el mismo dry_run sigue continuando; y una corrida terminada con otro dry_run también avisa (no «terminada» engañosa)', async () => {
    const w = mundo()
    await abrir(w.P, { ...E, dry_run: true })
    expect(await abrir(w.P, { ...E, dry_run: true })).toMatchObject({ status: 200, accion: 'continua' })
    await cerrar(w.P, { ...E, estado: 'hecha' })
    expect(await abrir(w.P, { ...E, dry_run: false })).toMatchObject({ status: 409, error: 'dry_run_distinto' })
  })
})

describe('una corrida activa por cliente', () => {
  it('(c) otra corrida con una activa ⇒ 409 corrida_activa, sin fila nueva', async () => {
    const w = mundo()
    await abrir(w.P, E)
    const r = await abrir(w.P, { ...E, corrida: 'c-2' })
    expect(r).toMatchObject({ status: 409, error: 'corrida_activa', corrida_activa: 'c-1', estado: 'esperando' })
    expect(w.filas).toHaveLength(1)
  })
  it('otro cliente no se ve afectado', async () => {
    const w = mundo()
    await abrir(w.P, E)
    expect((await abrir(w.P, { ...E, client_id: 'cliente-b' })).status).toBe(200)
  })
  it('la carrera entre la lectura y el insert la ataja el índice parcial (choque ⇒ 409)', async () => {
    const w = mundo()
    const P2: PuertoDeCorridas = { ...w.P, async activaDe() { return null } } // las dos leen «no hay activa»…
    await abrir(w.P, E) // …pero la primera ya insertó
    const r = await abrir({ ...P2, activaDe: (async () => { const f = w.filas[0]; return f ? { ...f } : null }) as PuertoDeCorridas['activaDe'] }, { ...E, corrida: 'c-2' })
    expect(r.status).toBe(409)
  })
  it('mutación: sin el índice parcial dos corridas quedan vivas (el almacén ya no protege)', async () => {
    const w = mundo({ sinIndiceParcial: true })
    const P2: PuertoDeCorridas = { ...w.P, activaDe: async () => null }
    await abrir(P2, E)
    await abrir(P2, { ...E, corrida: 'c-2' })
    expect(w.filas.filter((f) => f.estado === 'esperando')).toHaveLength(2)
  })
  it('una corrida terminada libera al cliente: otra corrida puede abrirse', async () => {
    const w = mundo()
    await abrir(w.P, E)
    await cerrar(w.P, { ...E, estado: 'hecha' })
    expect((await abrir(w.P, { ...E, corrida: 'c-2' })).status).toBe(200)
  })
  it('re-abrir una corrida terminada no la revive: devuelve «terminada»', async () => {
    const w = mundo()
    await abrir(w.P, E)
    await cerrar(w.P, { ...E, estado: 'fallida', motivo: 'x' })
    const r = await abrir(w.P, E)
    expect(r).toMatchObject({ status: 200, accion: 'terminada' })
  })
})

describe('(b) dos re-disparos simultáneos con el mismo n: un solo plan', () => {
  it('gana uno; el otro recibe «perdiste_la_carrera» y no hace nada', async () => {
    const w = mundo()
    await abrir(w.P, E)
    const [a, b] = await Promise.all([reintentar(w.P, { ...E, intentos_esperado: 0 }), reintentar(w.P, { ...E, intentos_esperado: 0 })])
    const acciones = [a, b].map((r) => (r.status === 200 ? r.accion : r.status)).sort()
    expect(acciones).toEqual(['avanzada', 'perdiste_la_carrera'])
    expect(w.filas[0].intentos).toBe(1)
  })
  it('mutación: sin compare-and-set los dos «avanzan» y el plan se duplicaría', async () => {
    const w = mundo({ sinCompareAndSet: true })
    await abrir(w.P, E)
    const [a, b] = await Promise.all([reintentar(w.P, { ...E, intentos_esperado: 0 }), reintentar(w.P, { ...E, intentos_esperado: 0 })])
    expect([a, b].every((r) => r.status === 200 && r.accion === 'avanzada')).toBe(true)
  })
  it('un re-disparo sobre una corrida terminada o inexistente ⇒ 409 corrida_no_viva', async () => {
    const w = mundo()
    expect(await reintentar(w.P, { ...E, intentos_esperado: 0 })).toMatchObject({ status: 409, error: 'corrida_no_viva', estado: null })
    await abrir(w.P, E); await cerrar(w.P, { ...E, estado: 'hecha' })
    expect(await reintentar(w.P, { ...E, intentos_esperado: 0 })).toMatchObject({ status: 409, error: 'corrida_no_viva', estado: 'hecha' })
  })
  it('intentos_esperado inválido ⇒ 400', async () => {
    const w = mundo()
    expect((await reintentar(w.P, { ...E, intentos_esperado: -1 })).status).toBe(400)
    expect((await reintentar(w.P, { ...E, intentos_esperado: 1.5 })).status).toBe(400)
  })
})

describe('correr y cerrar', () => {
  it('correr: esperando → corriendo con el techo de una corrida en marcha; solo desde esperando', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(10)
    const r = await correr(w.P, { ...E, motivo: 'cerebro listo' })
    expect(r.status === 200 && r.accion === 'avanzada').toBe(true)
    if (r.status === 200 && r.accion === 'avanzada') {
      expect(r.fila.estado).toBe('corriendo')
      expect(Date.parse(r.fila.vence_en)).toBe(Date.parse(w.hora()) + TECHO_DE_CORRIDA_MIN * MIN)
    }
    expect(await correr(w.P, E)).toMatchObject({ status: 409, estado: 'corriendo' })
  })
  it('cerrar: solo hecha|fallida y solo desde un estado vivo', async () => {
    const w = mundo()
    await abrir(w.P, E)
    expect((await cerrar(w.P, { ...E, estado: 'vencida' as never })).status).toBe(400)
    expect(await cerrar(w.P, { ...E, estado: 'hecha' })).toMatchObject({ status: 200, accion: 'avanzada' })
    expect(await cerrar(w.P, { ...E, estado: 'fallida' })).toMatchObject({ status: 409, estado: 'hecha' })
  })
})

describe('barrido · vence_en pasa a vencida/fallida y libera al cliente', () => {
  it('esperando vencida ⇒ vencida; corriendo vencida ⇒ fallida; lo que no venció no se toca', async () => {
    const w = mundo()
    await abrir(w.P, { client_id: 'a', corrida: 'ca', dry_run: true })
    await abrir(w.P, { client_id: 'b', corrida: 'cb', dry_run: true })
    await correr(w.P, { client_id: 'b', corrida: 'cb' })
    await abrir(w.P, { client_id: 'c', corrida: 'cc', dry_run: true })
    w.avanzar(ESPERA_MAXIMA_MIN + GRACIA_DEL_BARRIDO_MIN + 1)
    await abrir(w.P, { client_id: 'd', corrida: 'cd', dry_run: true }) // fresca
    const r1 = await barrer(w.P)
    expect(r1.vencidas).toHaveLength(2) // a y c (esperando)
    expect(r1.falladas).toHaveLength(0) // b corre con techo de 100 min
    w.avanzar(TECHO_DE_CORRIDA_MIN)
    const r2 = await barrer(w.P)
    expect(r2.falladas).toHaveLength(1) // b
    expect(r2.vencidas).toHaveLength(1) // d (esperando)
    expect(w.filas.find((f) => f.client_id === 'b')).toMatchObject({ estado: 'fallida' })
    expect(w.filas.find((f) => f.client_id === 'a')).toMatchObject({ estado: 'vencida' })
  })
  it('es idempotente y libera el cupo del cliente', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(ESPERA_MAXIMA_MIN + GRACIA_DEL_BARRIDO_MIN + 1)
    await barrer(w.P)
    expect(await barrer(w.P)).toEqual({ vencidas: [], falladas: [], saltadas: [] })
    expect((await abrir(w.P, { ...E, corrida: 'c-2' })).status).toBe(200)
  })
  it('un avance justo antes del barrido no se pisa (compare-and-set): queda «saltada»', async () => {
    const w = mundo()
    await abrir(w.P, E)
    w.avanzar(ESPERA_MAXIMA_MIN + GRACIA_DEL_BARRIDO_MIN + 1)
    const P2: PuertoDeCorridas = { ...w.P, async vivasVencidas(iso) { const v = await w.P.vivasVencidas(iso); await reintentar(w.P, { ...E, intentos_esperado: 0 }); return v } }
    const r = await barrer(P2)
    expect(r.saltadas).toHaveLength(1)
    expect(w.filas[0].estado).toBe('esperando')
  })
})

describe('adaptador de Supabase · traduce el puerto sin lógica propia', () => {
  it('insertar: 23505 ⇒ choque; conflicto de (client_id,corrida) ⇒ relee la fila existente', async () => {
    const fila: FilaDeCorrida = { id: '1', client_id: 'a', corrida: 'c', estado: 'esperando', espera_desde: 'x', vence_en: 'y', intentos: 0, motivo: null, dry_run: true, actualizado_en: 'z' }
    const dbChoque = { from: () => ({ upsert: () => ({ select: async () => ({ data: null, error: { message: 'dup', code: '23505' } }) }) }) }
    expect(await almacenDeCorridas(dbChoque).insertarUnaVez({ ...fila })).toEqual({ choque: true })
    const dbYa = { from: () => ({ upsert: () => ({ select: async () => ({ data: [], error: null }) }), select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [fila], error: null }) }) }) }) }) }
    expect(await almacenDeCorridas(dbYa).insertarUnaVez({ ...fila })).toMatchObject({ creada: false })
  })
  it('avanzarSi filtra por intentos y por estado vivo (el compare-and-set vive en la consulta)', async () => {
    const llamadas: string[] = []
    const q: any = { update: () => q, eq: (k: string, v: unknown) => { llamadas.push(`eq:${k}=${String(v)}`); return q }, in: (k: string, v: unknown[]) => { llamadas.push(`in:${k}=${v.join('|')}`); return q }, select: async () => ({ data: [], error: null }) }
    expect(await almacenDeCorridas({ from: () => q }).avanzarSi('a', 'c', 3, { intentos: 4 })).toBeNull()
    expect(llamadas).toEqual(expect.arrayContaining(['eq:intentos=3', 'in:estado=esperando|corriendo', 'eq:client_id=a', 'eq:corrida=c']))
  })
})

describe('la migración y su reversa', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202610151100_plan_corridas_apagada.sql'), 'utf8')
  const rev = readFileSync(join(process.cwd(), 'supabase/reversas/202610151100_plan_corridas_apagada_REVERSA.sql'), 'utf8')
  it('una tabla, índice único parcial por cliente, estados cerrados, sin permisos para anon/authenticated', () => {
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(1)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS plan_corridas_una_activa_por_cliente[\s\S]*\(client_id\) WHERE estado IN \('esperando', 'corriendo'\)/)
    expect(sql).toMatch(/CHECK \(estado IN \('esperando', 'corriendo', 'hecha', 'vencida', 'fallida'\)\)/)
    expect(sql).toMatch(/UNIQUE \(client_id, corrida\)/)
    expect(sql).toMatch(/REVOKE ALL ON public\.plan_corridas FROM anon, authenticated/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/GRANT[^;]*TO (anon|authenticated)/)
  })
  it('la reversa se niega a borrar con filas y solo toca esa tabla', () => {
    expect(rev).toMatch(/RAISE EXCEPTION/)
    expect(rev.match(/DROP TABLE/g)).toHaveLength(1)
    expect(rev).toMatch(/DROP TABLE IF EXISTS public\.plan_corridas;/)
  })
})
