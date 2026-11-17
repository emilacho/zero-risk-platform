/**
 * La puerta de incidentes PROPIA del vigía (tabla `proveedor_incidentes`) · condiciones de CC6 (NOTA-CC6-a-CC2-tabla-de-incidentes-lo-que-voy-a-medir, 17-nov):
 * se comporta como la del portero (mismo texto no publica · distinto va al hilo · cerrada abre otra · base caída publica) y, además, dos vigías a la vez no abren dos mensajes.
 * La base falsa hace cumplir la llave primaria (23505), los filtros `eq`/`is` de los UPDATE y RECHAZA columnas que la migración no tiene.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { avisar, publicarEnSlack, resolver, TABLA, type DbDeIncidentes, type Publicar } from '../incidentes'

const MIGRACION = readFileSync(join(__dirname, '../../../../supabase/migrations/202611171100_proveedor_incidentes.sql'), 'utf8')
const COLUMNAS = new Set([...MIGRACION.matchAll(/^\s{2}([a-z_]+)\s+(text|integer|timestamptz)/gm)].map((m) => m[1]))

type Fila = Record<string, unknown>
function baseFalsa(o: { leerFalla?: boolean; escribirFalla?: boolean } = {}) {
  const filas = new Map<string, Fila>()
  const llamadas: string[] = []
  const valida = (f: Fila) => { for (const k of Object.keys(f)) if (!COLUMNAS.has(k)) throw new Error(`columna inexistente: ${k}`) }
  const db = {
    from(t: string) {
      if (t !== TABLA) throw new Error(`tabla equivocada: ${t}`)
      const consulta = (op: 'select' | 'insert' | 'update', datos?: Fila) => {
        const filtros: Array<(f: Fila) => boolean> = []
        let devolver = op === 'select'
        const q = {
          eq(c: string, v: unknown) { filtros.push((f) => f[c] === v); return q },
          is(c: string, v: null) { filtros.push((f) => (f[c] ?? null) === v); return q },
          select() { devolver = true; return q },
          limit() { return q },
          then(res: (r: { data: unknown; error: { code?: string; message?: string } | null }) => unknown, rej?: (e: unknown) => unknown) {
            const correr = () => {
              llamadas.push(op)
              if (op === 'select') return o.leerFalla ? { data: null, error: { message: 'base caída' } } : { data: [...filas.values()].filter((f) => filtros.every((p) => p(f))).map((f) => ({ ...f })), error: null }
              if (o.escribirFalla) return { data: null, error: { message: 'no escribe' } }
              valida(datos!)
              if (op === 'insert') {
                const c = String(datos!.clave)
                if (filas.has(c)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
                filas.set(c, { ...datos })
                return { data: devolver ? [{ clave: c }] : null, error: null }
              }
              const tocadas = [...filas.values()].filter((f) => filtros.every((p) => p(f)))
              for (const f of tocadas) Object.assign(f, datos)
              return { data: devolver ? tocadas.map((f) => ({ clave: f.clave })) : null, error: null }
            }
            return Promise.resolve().then(correr).then(res, rej)
          },
        }
        return q
      }
      return { select: () => consulta('select'), insert: (f: Fila) => consulta('insert', f), update: (f: Fila) => consulta('update', f) }
    },
  } as unknown as DbDeIncidentes
  return { db, filas, llamadas }
}
const slack = (ok = true) => {
  let n = 0
  const publicar = vi.fn<Publicar>(async () => (ok ? { ok: true, ts: `ts-${++n}` } : { ok: false, error: 'Slack respondió 500' }))
  return publicar
}
const reloj = (iso: string) => () => new Date(iso)
const T1 = '🔴 Apify · la llave no sirve: respondió 401'
const T2 = '🟠 Apify · la cuenta frena por tope o permiso: respondió 402'

describe('la migración', () => {
  it('es una tabla nueva sin nada `cerebro_*`, con RLS, solo service_role y su reversa que se niega con filas', () => {
    expect(MIGRACION).toMatch(/CREATE TABLE IF NOT EXISTS public\.proveedor_incidentes/)
    expect(MIGRACION).toMatch(/clave\s+text PRIMARY KEY/)
    expect(MIGRACION).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(MIGRACION).toMatch(/TO service_role/)
    expect(MIGRACION).toMatch(/REVOKE ALL ON public\.proveedor_incidentes FROM anon, authenticated/)
    expect(MIGRACION).not.toMatch(/^GRANT[^;]*(anon|authenticated)/m)
    expect(MIGRACION.replace(/^--.*$/gm, '')).not.toMatch(/cerebro_/) // en el SQL (los comentarios sí la nombran: «sin depender de cerebro_alertas»)
    const reversa = readFileSync(join(__dirname, '../../../../supabase/reversas/202611171100_proveedor_incidentes_REVERSA.sql'), 'utf8')
    expect(reversa).toMatch(/RAISE EXCEPTION/)
    expect(COLUMNAS).toEqual(new Set(['clave', 'canal', 'thread_ts', 'titulo', 'ultimo_detalle', 'repeticiones', 'abierto_en', 'ultima_en', 'cerrado_en']))
  })
})

describe('avisar · igual que la puerta del portero', () => {
  it('la primera vez abre un mensaje en el canal y guarda su hilo', async () => {
    const b = baseFalsa(), p = slack()
    const r = await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    expect(r).toMatchObject({ ok: true, accion: 'abrio' })
    expect(p).toHaveBeenCalledWith(T1)
    expect(b.filas.get('lectura:apify')).toMatchObject({ thread_ts: 'ts-1', ultimo_detalle: T1, cerrado_en: null, canal: 'C0B7XUUEBHA' })
  })
  it('el mismo texto otra vez NO publica: solo cuenta y refresca la hora', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    const r = await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T09:00:00Z') })(T1, 'lectura:apify')
    expect(r.accion).toBe('repetida')
    expect(p).toHaveBeenCalledTimes(1)
    expect(b.filas.get('lectura:apify')).toMatchObject({ repeticiones: 1, ultima_en: '2026-11-17T09:00:00.000Z' })
  })
  it('un texto distinto va al HILO del incidente, no al canal', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    const r = await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T09:00:00Z') })(T2, 'lectura:apify')
    expect(r.accion).toBe('hilo')
    expect(p).toHaveBeenLastCalledWith(T2, 'ts-1')
    expect(b.filas.get('lectura:apify')).toMatchObject({ ultimo_detalle: T2, thread_ts: 'ts-1' })
  })
  it('cerrado → el siguiente aviso abre un mensaje NUEVO (un segundo apagón no queda callado)', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    await resolver({ db: b.db, publicar: p, ahora: reloj('2026-11-17T10:00:00Z') })('lectura:apify', 'volvió')
    const r = await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-18T08:00:00Z') })(T1, 'lectura:apify')
    expect(r.accion).toBe('abrio')
    expect(p).toHaveBeenLastCalledWith(T1)
    expect(b.filas.get('lectura:apify')).toMatchObject({ thread_ts: 'ts-3', cerrado_en: null, repeticiones: 0 })
  })
  it('sin actividad en 24 h → abre uno nuevo', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    expect((await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-18T07:59:00Z') })(T1, 'lectura:apify')).accion).toBe('repetida')
    expect((await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-19T08:00:00Z') })(T1, 'lectura:apify')).accion).toBe('abrio')
  })
  it('la base no deja leer → publica igual como alarma nueva (mejor uno de más) y no escribe', async () => {
    const b = baseFalsa({ leerFalla: true }), p = slack()
    const r = await avisar({ db: b.db, publicar: p })(T1, 'lectura:apify')
    expect(r).toMatchObject({ ok: true, accion: 'abrio' })
    expect(p).toHaveBeenCalledWith(T1)
    expect(b.llamadas).toEqual(['select'])
  })
  it('la base lee pero no deja escribir → publica igual y lo dice', async () => {
    const b = baseFalsa({ escribirFalla: true }), p = slack()
    const r = await avisar({ db: b.db, publicar: p })(T1, 'lectura:apify')
    expect(r).toMatchObject({ ok: true, accion: 'abrio', detalle: expect.stringContaining('no se pudo anotar') })
    expect(p).toHaveBeenCalledTimes(1)
  })
})

describe('avisar · dos vigías a la vez (condición 2 de CC6)', () => {
  it('dos avisos simultáneos del mismo incidente → UNA fila y UN mensaje', async () => {
    const b = baseFalsa(), p = slack()
    const o = { db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') }
    const [r1, r2] = await Promise.all([avisar(o)(T1, 'lectura:apify'), avisar(o)(T1, 'lectura:apify')])
    expect(p).toHaveBeenCalledTimes(1)
    expect([r1.accion, r2.accion].sort()).toEqual(['abrio', 'en_curso'])
    expect(b.filas.size).toBe(1)
  })
  it('reabrir un cerrado a la vez → la reserva es condicionada: un solo mensaje', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    await resolver({ db: b.db, publicar: p, ahora: reloj('2026-11-17T09:00:00Z') })('lectura:apify')
    p.mockClear()
    const o = { db: b.db, publicar: p, ahora: reloj('2026-11-17T12:00:00Z') }
    await Promise.all([avisar(o)(T1, 'lectura:apify'), avisar(o)(T1, 'lectura:apify')])
    expect(p).toHaveBeenCalledTimes(1)
  })
  it('una reserva reciente sin hilo (otro vigía abriendo) → no publica; una vieja (se cayó a mitad) → se vuelve a tomar', async () => {
    const b = baseFalsa(), p = slack()
    b.filas.set('lectura:apify', { clave: 'lectura:apify', canal: 'C0B7XUUEBHA', thread_ts: null, ultimo_detalle: T1, repeticiones: 0, abierto_en: '2026-11-17T08:00:00.000Z', ultima_en: '2026-11-17T08:00:00.000Z', cerrado_en: null })
    expect((await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:04:00Z') })(T1, 'lectura:apify')).accion).toBe('en_curso')
    expect(p).not.toHaveBeenCalled()
    expect((await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:06:00Z') })(T1, 'lectura:apify')).accion).toBe('abrio')
    expect(p).toHaveBeenCalledTimes(1)
  })
  it('Slack no confirma al abrir → falla y SUELTA la reserva: la próxima lectura vuelve a intentar', async () => {
    const b = baseFalsa()
    const r = await avisar({ db: b.db, publicar: slack(false), ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    expect(r).toMatchObject({ ok: false, accion: 'fallo' })
    expect(b.filas.get('lectura:apify')).toMatchObject({ thread_ts: null, cerrado_en: '2026-11-17T08:00:00.000Z' })
    const p = slack()
    expect((await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:01:00Z') })(T1, 'lectura:apify')).accion).toBe('abrio')
  })
  it('Slack dice ok pero sin el id del mensaje → falla y suelta la reserva (sin hilo no se puede seguir el incidente)', async () => {
    const b = baseFalsa()
    const sinTs = vi.fn<Publicar>(async () => ({ ok: true }))
    expect((await avisar({ db: b.db, publicar: sinTs, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')).accion).toBe('fallo')
    expect(b.filas.get('lectura:apify')).toMatchObject({ thread_ts: null, cerrado_en: '2026-11-17T08:00:00.000Z' })
  })
  it('Slack no confirma en el hilo → falla y no anota el texto nuevo (se reintenta)', async () => {
    const b = baseFalsa()
    await avisar({ db: b.db, publicar: slack(), ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    const r = await avisar({ db: b.db, publicar: slack(false), ahora: reloj('2026-11-17T09:00:00Z') })(T2, 'lectura:apify')
    expect(r.accion).toBe('fallo')
    expect(b.filas.get('lectura:apify')).toMatchObject({ ultimo_detalle: T1 })
  })
})

describe('resolver', () => {
  it('abierto → cierra y dice «✅ Resuelto · nota» en su HILO', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    const r = await resolver({ db: b.db, publicar: p, ahora: reloj('2026-11-17T10:00:00Z') })('lectura:apify', 'volvió: Apify responde bien')
    expect(r.accion).toBe('cerro')
    expect(p).toHaveBeenLastCalledWith('✅ Resuelto · volvió: Apify responde bien', 'ts-1')
    expect(b.filas.get('lectura:apify')).toMatchObject({ cerrado_en: '2026-11-17T10:00:00.000Z' })
  })
  it('sin incidente, ya cerrado o sin hilo → no publica nada (cada hora con 200 no hace ruido)', async () => {
    const b = baseFalsa(), p = slack()
    expect((await resolver({ db: b.db, publicar: p })('lectura:apify')).accion).toBe('sin_incidente')
    b.filas.set('x', { clave: 'x', thread_ts: null, cerrado_en: null, ultima_en: '2026-11-17T08:00:00.000Z' })
    expect((await resolver({ db: b.db, publicar: p })('x')).accion).toBe('sin_incidente')
    b.filas.set('y', { clave: 'y', thread_ts: 'ts-9', cerrado_en: '2026-11-17T08:00:00.000Z', ultima_en: '2026-11-17T08:00:00.000Z' })
    expect(await resolver({ db: b.db, publicar: p })('y')).toMatchObject({ accion: 'sin_incidente', detalle: 'no había un incidente abierto con esa clave' })
    expect(b.llamadas.filter((x) => x === 'update')).toEqual([]) // uno ya cerrado no se vuelve a escribir
    expect(p).not.toHaveBeenCalled()
  })
  it('dos «volvió» simultáneos → un solo mensaje', async () => {
    const b = baseFalsa(), p = slack()
    await avisar({ db: b.db, publicar: p, ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    p.mockClear()
    const o = { db: b.db, publicar: p, ahora: reloj('2026-11-17T10:00:00Z') }
    await Promise.all([resolver(o)('lectura:apify', 'volvió'), resolver(o)('lectura:apify', 'volvió')])
    expect(p).toHaveBeenCalledTimes(1)
  })
  it('Slack no confirma el «volvió» → el incidente vuelve a quedar abierto (la próxima lectura buena reintenta)', async () => {
    const b = baseFalsa()
    await avisar({ db: b.db, publicar: slack(), ahora: reloj('2026-11-17T08:00:00Z') })(T1, 'lectura:apify')
    const r = await resolver({ db: b.db, publicar: slack(false), ahora: reloj('2026-11-17T10:00:00Z') })('lectura:apify')
    expect(r.accion).toBe('fallo')
    expect(b.filas.get('lectura:apify')?.cerrado_en).toBeNull()
  })
  it('la base no deja leer → falla, sin publicar', async () => {
    const p = slack()
    expect((await resolver({ db: baseFalsa({ leerFalla: true }).db, publicar: p })('lectura:apify')).ok).toBe(false)
    expect(p).not.toHaveBeenCalled()
  })
})

describe('publicarEnSlack', () => {
  it('va a #alertas con la llave del bot; ok solo con ok:true; en el hilo lleva thread_ts', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, ts: '171.1' })))
    expect(await publicarEnSlack({ token: 'xoxb', fetchImpl: f as unknown as typeof fetch })('hola', 'ts-1')).toEqual({ ok: true, ts: '171.1' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(JSON.parse(String(init.body))).toEqual({ channel: 'C0B7XUUEBHA', text: 'hola', thread_ts: 'ts-1' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer xoxb')
    const no = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'channel_not_found' })))
    expect(await publicarEnSlack({ token: 'x', fetchImpl: no as unknown as typeof fetch })('hola')).toMatchObject({ ok: false, error: expect.stringContaining('channel_not_found') })
    expect(await publicarEnSlack({ token: '' })('hola')).toMatchObject({ ok: false })
  })
})
