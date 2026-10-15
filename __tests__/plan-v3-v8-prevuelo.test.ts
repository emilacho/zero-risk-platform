/**
 * Plan v3 · V8 · el pre-vuelo. Reloj simulado y almacén de corridas en memoria que IMITA las garantías de la base (una activa por cliente, insert-once, compare-and-set).
 * Sin red, sin Apify, sin modelo, US$ 0. Mutaciones: la regla que autoriza el relleno, la lectura de la señal antes de vencer, el cupo y el compare-and-set.
 */
import { describe, expect, it } from 'vitest'
import { prevuelo, REGLAS_DE_PREVUELO, sumaDeTopes, huecosATipos, type CupoDelCliente, type LecturaDeCupo, type LecturaDeFicha, type LecturaDeSenal, type PuertosDePrevuelo, type ReglasDePrevuelo, type SenalDeListo } from '../src/lib/planeacion/prevuelo'
import type { FilaDeCorrida, PuertoDeCorridas } from '../src/lib/planeacion/corridas'
import { crearSnapshot, type FilasDelCatalogo } from '../src/lib/planeacion/dato-v1/catalogo'
import { planificarRelleno } from '../src/lib/planeacion/dato-v1/relleno'
import semilla from '../src/lib/planeacion/catalogo/semilla.json'

const FILAS = semilla as unknown as FilasDelCatalogo
const snap = crearSnapshot(FILAS)
const CID = 'cliente-practica-01'
const MIN = 60_000

interface Mundo { P: PuertosDePrevuelo; filas: FilaDeCorrida[]; avanzar(min: number): void; llamadasA: { listo: number; ficha: number; cupo: number; apify: number } }
function mundo(o: {
  senal?: (minuto: number) => LecturaDeSenal
  ficha?: LecturaDeFicha
  cupo?: LecturaDeCupo
  catalogo?: PuertosDePrevuelo['catalogo']
  perderCarrera?: boolean
  filas?: FilaDeCorrida[]
  t0?: number
} = {}): Mundo {
  let t = o.t0 ?? Date.parse('2026-10-15T15:00:00Z')
  const filas: FilaDeCorrida[] = o.filas ?? []
  let seq = 0
  const vivo = (f: FilaDeCorrida) => f.estado === 'esperando' || f.estado === 'corriendo'
  const llamadasA = { listo: 0, ficha: 0, cupo: 0, apify: 0 }
  const corridas: PuertoDeCorridas = {
    ahora: () => new Date(t),
    async insertarUnaVez(f) {
      const ya = filas.find((x) => x.client_id === f.client_id && x.corrida === f.corrida)
      if (ya) return { creada: false, fila: ya }
      if (vivo(f as FilaDeCorrida) && filas.some((x) => x.client_id === f.client_id && vivo(x))) return { choque: true }
      const fila: FilaDeCorrida = { ...f, id: `id-${++seq}`, actualizado_en: new Date(t).toISOString() }
      filas.push(fila)
      return { creada: true, fila }
    },
    async leer(c, k) { return filas.find((x) => x.client_id === c && x.corrida === k) ?? null },
    async activaDe(c) { return filas.find((x) => x.client_id === c && vivo(x)) ?? null },
    async avanzarSi(c, k, n, cambios) {
      const f = filas.find((x) => x.client_id === c && x.corrida === k && vivo(x) && x.intentos === n)
      if (!f || o.perderCarrera) return null
      Object.assign(f, cambios, { actualizado_en: new Date(t).toISOString() })
      return { ...f }
    },
    async vivasVencidas() { return [] },
  }
  const minutoDe = () => {
    const f = filas[0]
    return f ? Math.round((t - Date.parse(f.espera_desde)) / MIN) : 0
  }
  const P: PuertosDePrevuelo = {
    ahora: () => new Date(t),
    corridas,
    catalogo: o.catalogo ?? (async () => ({ ok: true as const, snapshot: snap })),
    async ficha() { llamadasA.ficha++; return o.ficha ?? { ok: true, existe: true, manual_vigente: true, manual_version: 6, moneda_declarada: 'USD', pais: 'Ecuador' } },
    async cupo() { llamadasA.cupo++; return o.cupo ?? { ok: true, cap_usd: 8, generico_usd: 8, override_usd: null, gastado_24h_usd: 0 } },
    async senal() { llamadasA.listo++; return (o.senal ?? (() => ({ ok: true as const, senal: { listo: true, completando: false, motivo: 'listo', desde: null, huecos: [] } })))(minutoDe()) },
  }
  return { P, filas, avanzar: (m) => { t += m * MIN }, llamadasA }
}
const listo = (extra: Partial<SenalDeListo> = {}): LecturaDeSenal => ({ ok: true, senal: { listo: true, completando: false, motivo: 'cerebro listo', desde: '2026-10-15T14:00:00Z', huecos: [], ...extra } })
const noListo = (extra: Partial<SenalDeListo> = {}): LecturaDeSenal => ({ ok: true, senal: { listo: false, completando: false, motivo: 'el portero todavía no ha corrido', desde: null, huecos: [], ...extra } })
const entrada = (extra: Record<string, unknown> = {}) => ({ client_id: CID, corrida: 'plan-001', ...extra })

describe('V8 · la entrada y `dry_run`', () => {
  it('dry_run AUSENTE = real; true = ensayo; no booleano = se rechaza', async () => {
    const real = await prevuelo(entrada(), mundo().P)
    expect(real).toMatchObject({ decision: 'correr', dry_run: false })
    const seco = await prevuelo(entrada({ dry_run: true, corrida: 'plan-002' }), mundo().P)
    expect(seco).toMatchObject({ decision: 'correr', dry_run: true })
    for (const raro of ['true', 1, null, 'false']) expect(await prevuelo(entrada({ dry_run: raro }), mundo().P), String(raro)).toMatchObject({ decision: 'no_corre', motivo: 'dry_run_no_booleano' })
  })
  it('client_id y corrida obligatorios', async () => {
    expect(await prevuelo({ client_id: '', corrida: 'x' }, mundo().P)).toMatchObject({ motivo: 'entrada_invalida' })
    expect(await prevuelo({ client_id: CID, corrida: '   ' }, mundo().P)).toMatchObject({ motivo: 'entrada_invalida' })
    expect(await prevuelo({ client_id: CID, corrida: 'x'.repeat(121) }, mundo().P)).toMatchObject({ motivo: 'entrada_invalida' })
  })
  it('un ensayo no gasta: no mide el cupo', async () => {
    const m = mundo({ cupo: { ok: true, cap_usd: 0.1, generico_usd: 8, override_usd: 0.1, gastado_24h_usd: 0 } })
    expect((await prevuelo(entrada({ dry_run: true }), m.P)).decision).toBe('correr')
    expect(m.llamadasA.cupo).toBe(0)
  })
})

describe('V8 · las guardas FALLAN CERRADO y dicen por qué', () => {
  it('el catálogo sin aplicar, incompleto o ilegible: no corre', async () => {
    for (const [causa, esperado] of [['catalogo_no_aplicado', 'catalogo_no_aplicado'], ['catalogo_incompleto', 'catalogo_incompleto'], ['lectura_fallida', 'lectura_fallida']] as const) {
      const m = mundo({ catalogo: async () => ({ ok: false, causa, detalle: 'x' }) })
      expect(await prevuelo(entrada(), m.P), causa).toMatchObject({ decision: 'no_corre', motivo: esperado, relleno_permitido: false })
      expect(m.filas).toHaveLength(0) // no abrió corrida
    }
  })
  it('un error al leer la ficha NO es «cliente inexistente» ni «sin manual»', async () => {
    const r = await prevuelo(entrada(), mundo({ ficha: { ok: false, error: 'boom' } }).P)
    expect(r).toMatchObject({ motivo: 'lectura_fallida' })
    expect(r.detalle).toMatch(/ficha/)
  })
  it('cliente inexistente (E79) y sin manual vigente', async () => {
    expect(await prevuelo(entrada(), mundo({ ficha: { ok: true, existe: false, manual_vigente: false, manual_version: null, moneda_declarada: null, pais: null } }).P)).toMatchObject({ motivo: 'cliente_inexistente' })
    expect(await prevuelo(entrada(), mundo({ ficha: { ok: true, existe: true, manual_vigente: false, manual_version: null, moneda_declarada: 'USD', pais: 'Ecuador' } }).P)).toMatchObject({ motivo: 'sin_manual_vigente' })
  })
  it('moneda: declarada o fila del país (G3: «Ecuador» por nombre); sin ninguna no corre (U5)', async () => {
    const ficha = (moneda: string | null, pais: string | null): LecturaDeFicha => ({ ok: true, existe: true, manual_vigente: true, manual_version: 1, moneda_declarada: moneda, pais })
    expect((await prevuelo(entrada(), mundo({ ficha: ficha(null, 'Ecuador') }).P)).decision).toBe('correr')
    expect((await prevuelo(entrada({ corrida: 'b' }), mundo({ ficha: ficha('COP', 'Colombia') }).P)).decision).toBe('correr')
    expect(await prevuelo(entrada({ corrida: 'c' }), mundo({ ficha: ficha(null, 'Atlantida') }).P)).toMatchObject({ decision: 'no_corre', motivo: 'sin_moneda' })
    expect(await prevuelo(entrada({ corrida: 'd' }), mundo({ ficha: ficha(null, null) }).P)).toMatchObject({ motivo: 'sin_moneda' })
  })
})

describe('V8 · el cupo (§13.1)', () => {
  const cupo = (over: Partial<CupoDelCliente>): LecturaDeCupo => ({ ok: true, cap_usd: 8, generico_usd: 8, override_usd: null, gastado_24h_usd: 0, ...over })
  it('la suma de topes sale del catálogo (3,40)', () => {
    expect(sumaDeTopes(snap)).toBe(3.4)
  })
  it('con cupo de sobra corre; con la ficha en 1,5 no corre y dice a cuánto subirla', async () => {
    expect((await prevuelo(entrada(), mundo({ cupo: cupo({}) }).P)).decision).toBe('correr')
    const r = await prevuelo(entrada({ corrida: 'b' }), mundo({ cupo: cupo({ cap_usd: 1.5, override_usd: 1.5 }) }).P)
    expect(r).toMatchObject({ decision: 'no_corre', motivo: 'falta_cupo', sube_la_ficha_a: 4 })
    expect(r.detalle).toMatch(/falta cupo/)
  })
  it('lo ya gastado en 24 h cuenta: con 5,00 gastados y el techo en 8 no alcanza (3,40) y pide subir la ficha… que no sirve si el techo es el genérico', async () => {
    const r = await prevuelo(entrada(), mundo({ cupo: cupo({ gastado_24h_usd: 5 }) }).P)
    expect(r).toMatchObject({ decision: 'no_corre', motivo: 'techo_generico_insuficiente' })
    expect(r.detalle).toMatch(/solo baja el techo/)
  })
  it('si el techo es el de la ficha (más bajo que el genérico), SÍ se arregla subiéndola', async () => {
    const r = await prevuelo(entrada(), mundo({ cupo: cupo({ cap_usd: 2, override_usd: 2, gastado_24h_usd: 0.5 }) }).P)
    expect(r).toMatchObject({ motivo: 'falta_cupo', sube_la_ficha_a: 4.5 })
  })
  it('un error al leer el gasto NO es «cero gastado»', async () => {
    expect(await prevuelo(entrada(), mundo({ cupo: { ok: false, error: 'boom' } }).P)).toMatchObject({ motivo: 'lectura_fallida' })
  })
})

describe('V8 · la espera por «cerebro listo» (45 min, reanudable, reloj en la base)', () => {
  it('primer pre-vuelo sin listo: ESPERA, abre la fila con espera_desde y pide re-disparar en 5 min', async () => {
    const m = mundo({ senal: () => noListo({ completando: true, motivo: 'el despertar espera lo que el alta no trajo' }) })
    const r = await prevuelo(entrada(), m.P)
    expect(r).toMatchObject({ decision: 'esperar', relleno_permitido: false, reintentar_en_s: 300, intentos: 1 })
    expect(r.declara.join(' ')).toMatch(/sigue completando/)
    expect(m.filas).toHaveLength(1)
    expect(m.filas[0]).toMatchObject({ estado: 'esperando', espera_desde: r.espera_desde })
    expect(Date.parse(r.vence_en!) - Date.parse(r.espera_desde!)).toBe(45 * MIN)
  })
  it('un reinicio a los 12 min NO reinicia el reloj (espera_desde queda el del primer pre-vuelo)', async () => {
    const m = mundo({ senal: () => noListo() })
    const a = await prevuelo(entrada(), m.P)
    m.avanzar(12)
    const b = await prevuelo(entrada(), m.P)
    expect(b.espera_desde).toBe(a.espera_desde)
    expect(b.minutos_esperados).toBe(12)
    expect(b.decision).toBe('esperar')
  })
  it('listo a los 20 min: CORRE y recién ahí el relleno queda permitido', async () => {
    const m = mundo({ senal: (min) => (min >= 20 ? listo() : noListo()) })
    expect((await prevuelo(entrada(), m.P)).relleno_permitido).toBe(false)
    m.avanzar(10)
    expect((await prevuelo(entrada(), m.P)).decision).toBe('esperar')
    m.avanzar(10)
    const r = await prevuelo(entrada(), m.P)
    expect(r).toMatchObject({ decision: 'correr', relleno_permitido: true })
    expect(m.filas[0].estado).toBe('corriendo')
  })
  it('44 min sin listo: sigue esperando (no vence antes de tiempo)', async () => {
    const m = mundo({ senal: () => noListo({ completando: true }) })
    await prevuelo(entrada(), m.P)
    m.avanzar(44)
    const r = await prevuelo(entrada(), m.P)
    expect(r.decision).toBe('esperar')
    expect(r.relleno_permitido).toBe(false)
  })
  it('la lectura del 45:00 EXACTO cuenta: listo en ese minuto ⇒ corre (se lee la señal antes de vencer)', async () => {
    const m = mundo({ senal: (min) => (min >= 45 ? listo() : noListo({ completando: true })) })
    await prevuelo(entrada(), m.P)
    m.avanzar(45)
    expect(await prevuelo(entrada(), m.P)).toMatchObject({ decision: 'correr', relleno_permitido: true })
  })
  it('sin listo a los 45:00: VENCE, corre con lo del alta, lo declara y NO rellena con Apify', async () => {
    const m = mundo({ senal: () => noListo({ completando: true }) })
    await prevuelo(entrada(), m.P)
    m.avanzar(45)
    const r = await prevuelo(entrada(), m.P)
    expect(r).toMatchObject({ decision: 'correr_con_lo_del_alta', relleno_permitido: false })
    expect(r.motivo).toMatch(/vencido/)
    expect(r.declara.join(' ')).toMatch(/No se rellenó con Apify/)
    expect(m.filas[0].estado).toBe('corriendo')
  })
  it('una señal ILEGIBLE no es «listo» ni «no listo»: se reintenta; si toda la espera fue ilegible es `señal_ausente`, distinta de `vencido`', async () => {
    const m = mundo({ senal: () => ({ ok: false, error: 'listo 502: lectura_fallida' }) })
    const a = await prevuelo(entrada(), m.P)
    expect(a).toMatchObject({ decision: 'esperar', relleno_permitido: false })
    expect(a.motivo).toMatch(/no se pudo leer/)
    m.avanzar(45)
    const b = await prevuelo(entrada(), m.P)
    expect(b).toMatchObject({ decision: 'correr_con_lo_del_alta', relleno_permitido: false })
    expect(b.motivo).toMatch(/señal_ausente/)
    expect(b.motivo).not.toMatch(/vencido/)
  })
  it('una señal ilegible y luego legible y lista: corre', async () => {
    let n = 0
    const m = mundo({ senal: () => (++n < 3 ? { ok: false, error: 'x' } : listo()) })
    await prevuelo(entrada(), m.P); m.avanzar(5)
    await prevuelo(entrada(), m.P); m.avanzar(5)
    expect(await prevuelo(entrada(), m.P)).toMatchObject({ decision: 'correr', relleno_permitido: true })
  })
})

describe('V8 · un solo plan', () => {
  it('otra corrida del mismo cliente ya está viva ⇒ 409 corrida_activa, sin gasto', async () => {
    const m = mundo({ senal: () => noListo() })
    await prevuelo(entrada({ corrida: 'plan-A' }), m.P)
    const r = await prevuelo(entrada({ corrida: 'plan-B' }), m.P)
    expect(r).toMatchObject({ decision: 'no_corre', motivo: 'corrida_activa', relleno_permitido: false })
    expect(m.filas).toHaveLength(1)
  })
  it('dos re-disparos con el mismo intento: gana UNO (compare-and-set); el otro no hace nada', async () => {
    const m = mundo({ senal: () => noListo(), perderCarrera: false })
    await prevuelo(entrada(), m.P)
    m.avanzar(5)
    const perdedor = mundo({ senal: () => noListo(), filas: m.filas, perderCarrera: true, t0: Date.parse('2026-10-15T15:05:00Z') })
    expect(await prevuelo(entrada(), perdedor.P)).toMatchObject({ decision: 'no_corre', motivo: 'otro_re_disparo_gano' })
  })
  it('una corrida que YA está corriendo no se vuelve a arrancar (ya_en_marcha) y una terminada se informa', async () => {
    const m = mundo({ senal: () => listo() })
    await prevuelo(entrada(), m.P)
    expect(await prevuelo(entrada(), m.P)).toMatchObject({ decision: 'ya_en_marcha', relleno_permitido: false })
    m.filas[0].estado = 'hecha'
    expect(await prevuelo(entrada(), m.P)).toMatchObject({ decision: 'terminada' })
  })
  it('un re-disparo REAL no continúa una corrida de ensayo (ni al revés)', async () => {
    const m = mundo({ senal: () => noListo() })
    await prevuelo(entrada({ dry_run: true }), m.P)
    expect(await prevuelo(entrada(), m.P)).toMatchObject({ decision: 'no_corre', motivo: 'dry_run_distinto' })
  })
})

describe('V8 · `huecos[]` del cerebro: solo eso puede ir a relleno', () => {
  it('traduce la `funcion` del hueco a los TIPOS que esa fuente provee; lo que no sabe traducir se declara', () => {
    const r = huecosATipos([
      { fuente: 'portero', funcion: 'instagram_scraper', objetivo: 'perfil' },
      { fuente: 'portero', funcion: 'funcion_que_nadie_conoce', objetivo: 'x' },
    ], snap)
    expect(r.tipos).toEqual(expect.arrayContaining(['seguidores', 'publicaciones_n', 'bio_red']))
    expect(r.sin_tipo).toEqual(['funcion_que_nadie_conoce'])
  })
  it('el pre-vuelo los entrega traducidos y los declara', async () => {
    const m = mundo({ senal: () => listo({ huecos: [{ fuente: 'portero', funcion: 'website_content_scraper', objetivo: 'sitio completo' }] }) })
    const r = await prevuelo(entrada(), m.P)
    expect(r.decision).toBe('correr')
    expect(r.huecos_tipos).toEqual(expect.arrayContaining(['texto_sitio', 'precio']))
    expect(r.declara.join(' ')).toMatch(/sin: sitio completo/)
  })
})

describe('V8 · SIN «cerebro listo» no sale NI UNA llamada a Apify (prueba de punta a punta con el planificador)', () => {
  /** lo que haría el flujo: pedir a Apify solo si el pre-vuelo lo permite; cuenta las llamadas */
  async function flujo(m: Mundo, reglas?: ReglasDePrevuelo) {
    const d = await prevuelo(entrada(), m.P, reglas)
    const plan = planificarRelleno({ snapshot: snap, faltantes: [{ tipo_id: 'seguidores', motivo: 'sin_ficha' }, { tipo_id: 'visitas_periodo', motivo: 'sin_ficha' }], cerebro_listo: d.relleno_permitido })
    m.llamadasA.apify += plan.pedidos.length
    return { d, plan }
  }
  it('no listo, vencido o señal ausente: cero llamadas a Apify en toda la espera', async () => {
    const m = mundo({ senal: () => noListo({ completando: true }) })
    let total = 0
    for (let i = 0; i <= 9; i++) { const { d } = await flujo(m); expect(d.relleno_permitido).toBe(false); m.avanzar(5); total = m.llamadasA.apify }
    expect(total).toBe(0)
    const venc = mundo({ senal: () => noListo() })
    await flujo(venc); venc.avanzar(45)
    const v = await flujo(venc)
    expect(v.d.decision).toBe('correr_con_lo_del_alta')
    expect(venc.llamadasA.apify).toBe(0)
    const aus = mundo({ senal: () => ({ ok: false, error: 'x' }) })
    await flujo(aus); aus.avanzar(45)
    await flujo(aus)
    expect(aus.llamadasA.apify).toBe(0)
  })
  it('con listo SÍ puede pedir, y solo lo que falta', async () => {
    const m = mundo({ senal: () => listo() })
    const { d, plan } = await flujo(m)
    expect(d.relleno_permitido).toBe(true)
    expect(plan.pedidos.length).toBeGreaterThan(0)
    expect(m.llamadasA.apify).toBe(plan.pedidos.length)
  })
  it('MUERE: si la regla autoriza el relleno con la señal ausente o no lista, el flujo SÍ llamaría a Apify', async () => {
    const rota: ReglasDePrevuelo = { autorizaRelleno: () => true }
    const m = mundo({ senal: () => noListo() })
    const { d } = await flujo(m, rota)
    expect(d.relleno_permitido).toBe(true)
    expect(m.llamadasA.apify).toBeGreaterThan(0)
    const bien = mundo({ senal: () => noListo() })
    await flujo(bien, REGLAS_DE_PREVUELO)
    expect(bien.llamadasA.apify).toBe(0)
  })
})

describe('V8 · solo lee (salvo la fila de la corrida) y no llama a nada de pago', () => {
  it('el módulo no importa ni nombra Apify, modelo ni escribe fuera de `plan_corridas`', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const f of ['src/lib/planeacion/prevuelo.ts', 'src/lib/planeacion/prevuelo-supabase.ts']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src).not.toMatch(/\bfetch\s*\(|process\.env|SALA_DISPATCH_KEY|callModel|anthropic|run-sdk\/route/i)
      expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
    }
  })
})
