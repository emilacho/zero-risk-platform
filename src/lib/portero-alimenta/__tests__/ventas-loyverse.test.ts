/**
 * Ventas reales del punto de venta (Loyverse) en el cerebro · 15-oct (firma de Emilio). US$ 0 · sin red · llave FALSA.
 * Lo que se prueba: relleno de 12 meses cerrados (una vez), el mes en curso se reemplaza y los cerrados no cambian, una ficha por mes y por métrica (y por tienda),
 * solo ingresos, sin llave = «sin material», la llave nunca sale, el resumen vivo muestra el último mes cerrado y la tendencia, y 3 rubros distintos.
 */
import { describe, expect, it } from 'vitest'
import { BRAZOS_APAGADOS, correrBrazos } from '../brazos'
import { cerrarPorFusion, leerSnapshot, MAX_PAGINAS_DEL_RELLENO, resumirVentas, mesesCerradosHasta, ventasPorMes, type Fetch } from '../brazos/propios'
import { armarResumen, type FichaParaResumen } from '../resumen-vivo'
import { crearBaseFalsa } from './base-falsa'

const TOKEN = 'tok-loyverse-FALSO-999'
const HOY = new Date('2026-10-15T15:00:00Z')
const PROPIOS = { ...BRAZOS_APAGADOS, propios: true }
const respuesta = (cuerpo: unknown, ok = true, status = 200) => ({ ok, status, json: async () => cuerpo })

type Recibo = Record<string, unknown>
const recibo = (n: number, total: number, cuando: string, extra: Record<string, unknown> = {}): Recibo => ({
  receipt_number: String(n), receipt_type: 'SALE', total_money: total, created_at: cuando,
  line_items: [{ item_name: `Plato ${n % 3}`, quantity: 1, total_money: total }], ...extra,
})
/** 3 recibos por mes, el día 10 a mediodía local (17:00Z), con total creciente: 100·k, 50·k, 30·k */
function historia(meses: string[], k0 = 1, extra: (i: number) => Record<string, unknown> = () => ({})): Recibo[] {
  const out: Recibo[] = []
  meses.forEach((m, i) => {
    const k = k0 + i
    ;[100 * k, 50 * k, 30 * k].forEach((t, j) => out.push(recibo(i * 10 + j, t, `${m}-1${j}T17:00:00Z`, extra(j))))
  })
  return out
}
const mesesDeLaHistoria = [...mesesCerradosHasta(HOY), '2026-10']

/** Loyverse falso: filtra por fecha, entrega del más nuevo al más viejo, pagina por cursor; cuenta llamadas */
function loyverse(universo: Recibo[], o: { tiendas?: Array<{ id: string; name: string }>; porPagina?: number; falla?: number; /** el plan solo deja leer N días atrás: un pedido que empiece antes responde 402 */ limiteDias?: number; /** entrega del más viejo al más nuevo (por omisión, al revés) */ ascendente?: boolean } = {}) {
  const llamadas: string[] = []
  const fetch: Fetch = async (url, init) => {
    llamadas.push(url)
    if (init?.headers?.Authorization !== `Bearer ${TOKEN}`) return respuesta({}, false, 401)
    if (o.falla) return respuesta({}, false, o.falla)
    if (o.limiteDias) {
      const u0 = new URL(url)
      const min0 = u0.searchParams.get('created_at_min'), max0 = u0.searchParams.get('created_at_max')
      if (min0 && max0 && new Date(max0).getTime() - new Date(min0).getTime() > o.limiteDias * 86_400_000) return respuesta({ errors: [{ code: 'PAYMENT_REQUIRED' }] }, false, 402)
    }
    if (url.includes('/stores')) return respuesta({ stores: o.tiendas ?? [] })
    const u = new URL(url)
    const min = u.searchParams.get('created_at_min') ?? '', max = u.searchParams.get('created_at_max') ?? '9'
    const desde = Number(u.searchParams.get('cursor') ?? 0)
    const t = (x: Recibo) => new Date(String(x.created_at)).toISOString()
    const todos = universo.filter((r) => t(r) >= new Date(min).toISOString() && t(r) <= new Date(max).toISOString()).sort((a, b) => ((t(a) < t(b) ? 1 : -1) * (o.ascendente ? -1 : 1)))
    const tam = o.porPagina ?? 250
    const pagina = todos.slice(desde, desde + tam)
    return respuesta({ receipts: pagina, ...(desde + tam < todos.length ? { cursor: String(desde + tam) } : {}) })
  }
  return { fetch, llamadas, receipts: () => llamadas.filter((l) => l.includes('/receipts')) }
}

const CLIENTES = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Náufrago', slug: 'naufrago', rubro: 'restaurante de mariscos', env: 'CLIENTE_NAUFRAGO_LOYVERSE_TOKEN' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Clínica Sonrisa Norte', slug: 'clinica-sonrisa-norte', rubro: 'clínica dental', env: 'CLIENTE_CLINICA_SONRISA_NORTE_LOYVERSE_TOKEN' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Flujo CRM', slug: 'flujo-crm', rubro: 'software B2B', env: 'CLIENTE_FLUJO_CRM_LOYVERSE_TOKEN' },
]

type Tablas = { cerebro_fichas: Array<Record<string, unknown>>; cerebro_ingresos: Array<Record<string, unknown>> }
const nuevaBase = (): { t: Tablas; db: ReturnType<typeof crearBaseFalsa>['db'] } => { const t: Tablas = { cerebro_fichas: [], cerebro_ingresos: [] }; return { t, db: crearBaseFalsa(t as never).db } }
const correr = (c: (typeof CLIENTES)[number], db: ReturnType<typeof crearBaseFalsa>['db'], fetch: Fetch, ahora: Date, extra: { dry_run?: boolean; env?: Record<string, string>; config?: unknown; /** el plan de Loyverse de hoy: solo deja leer 31 días (sin esto, el de «historial ilimitado»: 400 días) */ limitado?: boolean } = {}) =>
  correrBrazos({ db, brazos: PROPIOS, cliente: { id: c.id, name: c.name, slug: c.slug, country: 'Ecuador', industry: c.rubro, config: extra.config ?? {} }, client_id: c.id, filas: [], ahora, dry_run: extra.dry_run ?? false, env: extra.env ?? { [c.env]: TOKEN, ...(extra.limitado ? {} : { PORTERO_LOYVERSE_HISTORIAL_DIAS: '400' }) }, fetch })
const vivas = (t: Tablas, prefijo: string) => t.cerebro_fichas.filter((f) => !f.retirada_en && String(f.atributo).startsWith(prefijo))
const aResumen = (f: Record<string, unknown>): FichaParaResumen => ({ id: String(f.id), clase: String(f.clase), titulo: String(f.titulo), contenido: String(f.contenido), atributo: (f.atributo as string) ?? null, observado_en: (f.observado_en as string) ?? null, fecha_fuente: (f.fecha_fuente as string) ?? null, vigente_hasta: (f.vigente_hasta as string) ?? null, retirada_en: (f.retirada_en as string) ?? null, provenance_tag: f.provenance_tag, creado_en: (f.creado_en as string) ?? null })

describe.each(CLIENTES)('ventas de Loyverse · $rubro', (c) => {
  it('relleno de 12 meses cerrados + mes en curso: una ficha por mes y métrica, atributo metrica:loyverse:<métrica>:<AAAA-MM>', async () => {
    const { t, db } = nuevaBase()
    const lv = loyverse(historia(mesesDeLaHistoria))
    const r = await correr(c, db, lv.fetch, HOY)
    expect(r.errores).toEqual([])
    expect(r.por_brazo.propios?.estado).toBe('listo')
    const ingresos = vivas(t, 'metrica:loyverse:ingreso:')
    expect(ingresos.map((f) => f.atributo).sort()).toEqual([...mesesDeLaHistoria.map((m) => `metrica:loyverse:ingreso:${m}`), 'metrica:loyverse:ingreso:ultimos_30_dias'])
    expect(mesesDeLaHistoria[0]).toBe('2025-10')
    for (const m of mesesDeLaHistoria) for (const met of ['tickets', 'ticket_promedio', 'dias_y_horas', 'items']) expect(vivas(t, `metrica:loyverse:${met}:${m}`)).toHaveLength(1)
    // 13 meses × 5 métricas + la ventana móvil de 30 días (5)
    expect(vivas(t, 'metrica:loyverse:')).toHaveLength(70)
    // cada mes trae su cifra exacta (en el 1.er mes: 100 + 50 + 30)
    const octubre25 = ingresos.find((f) => f.atributo === 'metrica:loyverse:ingreso:2025-10')!
    expect((octubre25.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(180)
    expect(octubre25).toMatchObject({ clase: 'metrica', alcance: 'cliente', propiedad: 'propia', origen: 'plataforma', vigente_hasta: null })
    expect((octubre25.provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ periodo: '2025-10', desde: '2025-10-01', hasta: '2025-10-31', en_curso: false, tickets: 3, ticket_promedio: 60 })
    // el mes en curso va rotulado parcial y vence si el brazo deja de correr
    const actual = ingresos.find((f) => f.atributo === 'metrica:loyverse:ingreso:2026-10')!
    expect(String(actual.contenido)).toMatch(/MES EN CURSO, parcial/)
    expect((actual.provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-15', en_curso: true })
    expect(actual.vigente_hasta).not.toBeNull()
  })

  it('solo ingresos: ninguna ficha habla de margen ni de costo; la moneda es la del punto de venta', async () => {
    const { t, db } = nuevaBase()
    await correr(c, db, loyverse(historia(mesesDeLaHistoria)).fetch, HOY)
    const fichas = vivas(t, 'metrica:loyverse:')
    expect(fichas.length).toBeGreaterThan(0)
    for (const f of fichas) {
      expect(String(f.atributo)).not.toMatch(/margen|costo|utilidad/)
      expect(String(f.contenido)).toMatch(/Solo ingresos/)
      expect(String(f.contenido).replace(/no es margen/gi, '')).not.toMatch(/margen|utilidad|ganancia|costo (de|del|total)/i)
      expect(String(f.contenido)).not.toMatch(/US\$/)
    }
  })

  it('segunda corrida el mismo día: 0 escrituras y UNA sola lectura (el mes en curso); los meses cerrados no se piden', async () => {
    const { t, db } = nuevaBase()
    const lv = loyverse(historia(mesesDeLaHistoria))
    await correr(c, db, lv.fetch, HOY)
    const n = t.cerebro_fichas.length
    const lv2 = loyverse(historia(mesesDeLaHistoria))
    const r = await correr(c, db, lv2.fetch, HOY)
    expect(r.archivo).toMatchObject({ escritas: 0, retiradas: 0, errores: [] })
    expect(t.cerebro_fichas).toHaveLength(n)
    expect(lv2.receipts()).toHaveLength(1)
    expect(decodeURIComponent(lv2.receipts()[0])).toMatch(/created_at_min=2026-09-15T15:00:00.000Z/) // la ventana móvil de 30 días (cubre el mes en curso)
  })

  it('al día siguiente el mes en curso se REEMPLAZA (la versión vieja queda retirada, nada se borra) y los meses cerrados no cambian', async () => {
    const { t, db } = nuevaBase()
    const base = historia(mesesDeLaHistoria)
    await correr(c, db, loyverse(base).fetch, HOY)
    const cerradosAntes = JSON.stringify(vivas(t, 'metrica:loyverse:ingreso:2025').map((f) => [f.id, f.contenido]))
    const manana = new Date('2026-10-16T15:00:00Z')
    const r = await correr(c, db, loyverse([...base, recibo(999, 70, '2026-10-16T14:00:00Z')]).fetch, manana)
    expect(r.errores).toEqual([])
    const actual = t.cerebro_fichas.filter((f) => f.atributo === 'metrica:loyverse:ingreso:2026-10')
    expect(actual).toHaveLength(2)
    expect(actual.filter((f) => !f.retirada_en)).toHaveLength(1)
    expect(actual.find((f) => f.retirada_en)!.motivo_retirada).toMatch(/reemplazada por/)
    expect((actual.find((f) => !f.retirada_en)!.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(2340 + 70) // el mes 13 (k=13): 1300 + 650 + 390, más el recibo nuevo
    expect(JSON.stringify(vivas(t, 'metrica:loyverse:ingreso:2025').map((f) => [f.id, f.contenido]))).toBe(cerradosAntes)
  })

  it('al cerrar el mes, la parcial se reemplaza por la final y desde entonces no se reescribe', async () => {
    const { t, db } = nuevaBase()
    const base = historia(mesesDeLaHistoria)
    await correr(c, db, loyverse(base).fetch, HOY)
    const noviembre = new Date('2026-11-02T15:00:00Z')
    const lv = loyverse([...base, recibo(1000, 10, '2026-10-31T23:30:00Z')])
    const r = await correr(c, db, lv.fetch, noviembre)
    expect(r.errores).toEqual([])
    const oct = vivas(t, 'metrica:loyverse:ingreso:2026-10')
    expect(oct).toHaveLength(1)
    expect((oct[0].provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ en_curso: false })
    expect(oct[0].vigente_hasta).toBeNull()
    // octubre ahora es mes cerrado: una lectura más tarde ya NO lo vuelve a pedir
    const lv2 = loyverse([...base])
    await correr(c, db, lv2.fetch, new Date('2026-11-03T15:00:00Z'))
    expect(decodeURIComponent(lv2.receipts()[0])).toMatch(/created_at_min=2026-10-04T15:00:00.000Z/) // octubre ya está archivado: solo la ventana de 30 días
  })

  it('el resumen vivo muestra el último mes cerrado y la tendencia de 12 meses, cada línea con su cita; «Cifras» no se llena', async () => {
    const { t, db } = nuevaBase()
    await correr(c, db, loyverse(historia(mesesDeLaHistoria)).fetch, HOY)
    const fichas = t.cerebro_fichas.map(aResumen)
    const r = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: HOY, fichas, zona: [], sedes: [] })
    expect(r.texto).toContain('## Ventas del punto de venta (solo ingresos)')
    const seccion = r.texto.split('## ').find((s) => s.startsWith('Ventas del punto de venta'))!
    expect(seccion).toMatch(/Último mes cerrado, 2026-09: [\d.,]+ en 3 tickets/)
    expect(seccion).toMatch(/Tendencia de 12 meses cerrados/)
    expect(seccion).toMatch(/2025-10 180,00/)
    expect(seccion).toMatch(/Mes en curso, 2026-10 \(parcial/)
    expect(seccion).toMatch(/Días con más tickets/)
    for (const l of seccion.split('\n').filter((x) => x.startsWith('- '))) expect(l).toMatch(/\[ficha:[0-9a-f]{8} · \d{4}-\d{2}-\d{2}\]/)
    const cifras = r.texto.split('## ').find((s) => s.startsWith('Cifras y su tendencia'))!
    expect(cifras).not.toMatch(/Ventas de|ticket/i)
    expect(r.secciones.ventas).toBeGreaterThanOrEqual(4)
  })

  it('un cliente sin punto de venta: el resumen NO tiene sección de ventas ni un hueco nuevo', () => {
    const r = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: HOY, fichas: [], zona: [], sedes: [] })
    expect(r.texto).not.toMatch(/Ventas del punto de venta/)
    expect(r.huecos).toHaveLength(6) // los de siempre: ninguno nuevo por no tener punto de venta
    expect(r.secciones.ventas).toBeUndefined()
  })

  it('sin llave NO es un error: «sin material», con el nombre de la variable, sin una sola llamada ni escritura', async () => {
    const { t, db } = nuevaBase()
    let llamadas = 0
    const r = await correr(c, db, async () => { llamadas++; return respuesta({}) }, HOY, { env: {} })
    expect(r.por_brazo.propios?.estado).toBe('sin_material')
    expect(r.por_brazo.propios?.declarado.join(' ')).toContain(c.env)
    expect(llamadas).toBe(0)
    expect(t.cerebro_fichas).toEqual([])
  })

  it('la llave de OTRO cliente no sirve: cada cliente usa la suya', async () => {
    const { t, db } = nuevaBase()
    const otra = CLIENTES.find((x) => x.id !== c.id)!
    let llamadas = 0
    const r = await correr(c, db, async () => { llamadas++; return respuesta({}) }, HOY, { env: { [otra.env]: TOKEN } })
    expect(r.por_brazo.propios?.estado).toBe('sin_material')
    expect(llamadas).toBe(0)
    expect(t.cerebro_fichas).toEqual([])
  })

  it('en seco calcula el plan y no escribe nada', async () => {
    const { t, db } = nuevaBase()
    const r = await correr(c, db, loyverse(historia(mesesDeLaHistoria)).fetch, HOY, { dry_run: true })
    expect(r.archivo?.escritas).toBe(0)
    expect(r.archivo?.plan.length).toBe(70)
    expect(t.cerebro_fichas).toEqual([])
    expect(t.cerebro_ingresos).toEqual([])
  })

  it('la llave no sale en ninguna ficha, resultado ni URL', async () => {
    const { t, db } = nuevaBase()
    const lv = loyverse(historia(mesesDeLaHistoria))
    const r = await correr(c, db, lv.fetch, HOY)
    expect(JSON.stringify(r)).not.toContain(TOKEN)
    expect(JSON.stringify(t)).not.toContain(TOKEN)
    expect(lv.llamadas.every((u) => !u.includes(TOKEN))).toBe(true)
  })
})

describe('ventas de Loyverse · bordes', () => {
  const c = CLIENTES[0]
  it('una tienda con 2 sedes: ficha del total y una por tienda, con el nombre del punto de venta', async () => {
    const { t, db } = nuevaBase()
    const rs = historia(mesesDeLaHistoria, 1, (j) => ({ store_id: j === 0 ? 'S-OLON' : 'S-GYE' }))
    const lv = loyverse(rs, { tiendas: [{ id: 'S-OLON', name: 'Olón' }, { id: 'S-GYE', name: 'Guayaquil Centro' }] })
    const r = await correr(c, db, lv.fetch, HOY)
    expect(r.errores).toEqual([])
    expect(lv.llamadas.filter((u) => u.includes('/stores'))).toHaveLength(1)
    const sep = vivas(t, 'metrica:loyverse:ingreso:2026-09')
    expect(sep.map((f) => f.atributo).sort()).toEqual(['metrica:loyverse:ingreso:2026-09', 'metrica:loyverse:ingreso:2026-09:tienda-guayaquil-centro', 'metrica:loyverse:ingreso:2026-09:tienda-olon'])
    const olon = sep.find((f) => String(f.atributo).endsWith('tienda-olon'))!
    expect(String(olon.titulo)).toMatch(/tienda «Olón»/)
    // la tienda con 1 de 3 recibos (el de 100·k) + la otra con 2 (50·k y 30·k)
    expect((olon.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(100 * 12)
    // el total sigue siendo el total y no se duplica
    expect((sep.find((f) => f.atributo === 'metrica:loyverse:ingreso:2026-09')!.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(180 * 12)
    // y el resumen vivo la separa
    const res = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: HOY, fichas: t.cerebro_fichas.map(aResumen), zona: [], sedes: [] })
    expect(res.texto).toMatch(/Por tienda en 2026-09: Guayaquil Centro [\d,]+ \[ficha:[0-9a-f]{8}[^\n]*Olón [\d,]+ \[ficha:/)
  })

  it('una sola tienda NO genera fichas por tienda', async () => {
    const { t, db } = nuevaBase()
    await correr(c, db, loyverse(historia(mesesDeLaHistoria, 1, () => ({ store_id: 'S-UNICA' }))).fetch, HOY)
    expect(t.cerebro_fichas.some((f) => String(f.atributo).includes(':tienda-'))).toBe(false)
  })

  it('una ficha del mes en curso que no cambió RENUEVA su vigencia (si no, vencería con el mes a medias) y no se reescribe', async () => {
    const { t, db } = nuevaBase()
    const base = historia(mesesDeLaHistoria)
    await correr(c, db, loyverse(base).fetch, HOY)
    const antes = vivas(t, 'metrica:loyverse:ingreso:2026-10')[0]
    const hasta0 = String(antes.vigente_hasta)
    const ventanaAntes = String(vivas(t, 'metrica:loyverse:ingreso:ultimos_30_dias')[0].vigente_hasta)
    const n = t.cerebro_fichas.length
    const r = await correr(c, db, loyverse(base).fetch, new Date('2026-10-17T15:00:00Z'))
    expect(t.cerebro_fichas).toHaveLength(n)
    expect(r.archivo?.escritas).toBe(0)
    expect(String(vivas(t, 'metrica:loyverse:ingreso:2026-10')[0].vigente_hasta) > hasta0).toBe(true)
    // la ventana móvil también renueva (si no, vencería con el brazo funcionando)
    expect(String(vivas(t, 'metrica:loyverse:ingreso:ultimos_30_dias')[0].vigente_hasta) > ventanaAntes).toBe(true)
    // en seco no se renueva nada
    const antesDelSeco = JSON.stringify(t.cerebro_fichas.map((f) => [f.id, f.vigente_hasta]))
    await correr(c, db, loyverse(base).fetch, new Date('2026-10-19T15:00:00Z'), { dry_run: true })
    expect(JSON.stringify(t.cerebro_fichas.map((f) => [f.id, f.vigente_hasta]))).toBe(antesDelSeco)
  })

  it('un negocio que abrió hace 3 meses: los meses sin recibos dicen «sin ventas» y la tendencia arranca en el primer mes con ventas', async () => {
    const { t, db } = nuevaBase()
    const recientes = ['2026-07', '2026-08', '2026-09', '2026-10']
    await correr(c, db, loyverse(historia(recientes)).fetch, HOY)
    const ingreso = vivas(t, 'metrica:loyverse:ingreso:')
    expect(ingreso).toHaveLength(14) // 13 meses + la ventana de 30 días
    expect(String(ingreso.find((f) => f.atributo === 'metrica:loyverse:ingreso:2026-03')!.contenido)).toMatch(/Sin ventas registradas/)
    // los meses sin ventas solo llevan la ficha de ingreso (no 5)
    expect(vivas(t, 'metrica:loyverse:tickets:')).toHaveLength(5) // 3 meses cerrados con ventas + el mes en curso + la ventana de 30 días
    const res = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: HOY, fichas: t.cerebro_fichas.map(aResumen), zona: [], sedes: [] })
    expect(res.texto).toMatch(/Tendencia de 3 meses cerrados/)
    expect(res.texto).not.toMatch(/2026-03 0,00/)
    // y los meses vacíos tampoco se vuelven a pedir al día siguiente
    const lv = loyverse(historia(recientes))
    await correr(c, db, lv.fetch, new Date('2026-10-16T15:00:00Z'))
    expect(decodeURIComponent(lv.receipts()[0])).toMatch(/created_at_min=2026-09-16T15:00/) // solo la ventana: los meses vacíos ya están archivados
  })

  it('reembolsos y recibos anulados: el ingreso es la venta neta de anuladas y los reembolsos van aparte', async () => {
    const { t, db } = nuevaBase()
    const rs = [recibo(1, 100, '2026-09-10T17:00:00Z'), recibo(2, 40, '2026-09-11T17:00:00Z', { cancelled_at: '2026-09-11T18:00:00Z' }), recibo(3, -20, '2026-09-12T17:00:00Z', { receipt_type: 'REFUND' })]
    await correr(c, db, loyverse(rs).fetch, HOY)
    const f = vivas(t, 'metrica:loyverse:ingreso:2026-09')[0]
    expect((f.provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ ingreso: 100, tickets: 1, reembolsos: 20 })
    expect(String(f.contenido)).toMatch(/1 recibos anulados no cuentan/)
  })

  it('el huso es el local (UTC−5): un recibo de las 23:30 del último día entra en ESE mes, no en el siguiente', () => {
    const r = ventasPorMes([recibo(1, 10, '2026-09-30T23:30:00Z'), recibo(2, 20, '2026-10-01T04:30:00Z'), recibo(3, 30, '2026-10-01T05:30:00Z')], {})
    expect(r.meses.map((m) => [m.periodo, m.resumen.ingreso])).toEqual([['2026-09', 30], ['2026-10', 30]])
  })

  it('lectura recortada: el mes más viejo leído queda incompleto, NO se archiva y se declara; los demás sí', async () => {
    const { t, db } = nuevaBase()
    // 130 páginas de 1 recibo (más que el tope del relleno): se leen los 120 más nuevos
    const muchos: Recibo[] = []
    // un recibo cada 2 días: los 130 llegan a ~8 meses atrás; los meses de antes NO se alcanzan a leer (no se inventan como «sin ventas»)
    for (let i = 0; i < MAX_PAGINAS_DEL_RELLENO + 10; i++) muchos.push(recibo(i, 10, new Date(Date.UTC(2026, 9, 15, 12) - i * 86_400_000 * 2).toISOString()))
    const r = await correr(c, db, loyverse(muchos, { porPagina: 1 }).fetch, HOY)
    expect(r.por_brazo.propios?.declarado.join(' ')).toMatch(/incompleto y no se archivó/)
    const meses = vivas(t, 'metrica:loyverse:ingreso:').map((f) => String(f.atributo).slice(-7)).sort()
    expect(meses.length).toBeGreaterThan(0)
    // nada de «sin ventas» inventado para lo que no se alcanzó a leer, ni ventana móvil con una lectura a medias
    expect(vivas(t, 'metrica:loyverse:ingreso:').some((f) => /Sin ventas registradas/.test(String(f.contenido)))).toBe(false)
    expect(vivas(t, 'metrica:loyverse:ingreso:ultimos_30_dias')).toEqual([])
    // el más viejo leído (≈ 120 recibos × 3 días atrás = 360 días) no está
    const viejoLeido = new Date(Date.UTC(2026, 9, 15, 12) - (MAX_PAGINAS_DEL_RELLENO - 1) * 86_400_000 * 2).toISOString().slice(0, 7)
    expect(meses).not.toContain(viejoLeido)
  })

  it('un 401 o un 429 se DICEN con su código, no escriben nada y no tumban al brazo', async () => {
    for (const falla of [401, 429]) {
      const { t, db } = nuevaBase()
      const r = await correr(c, db, loyverse(historia(mesesDeLaHistoria), { falla }).fetch, HOY)
      expect(r.por_brazo.propios?.estado).toBe('sin_material')
      expect(r.por_brazo.propios?.declarado.join(' ')).toContain(String(falla))
      expect(t.cerebro_fichas).toEqual([])
    }
  })

  it('si no se pueden leer los meses ya archivados, el brazo falla en voz alta en vez de volver a rellenar a ciegas', async () => {
    const t: Tablas = { cerebro_fichas: [], cerebro_ingresos: [] }
    const db = crearBaseFalsa(t as never, { fallaEn: 'cerebro_fichas' }).db
    const r = await correr(c, db, loyverse(historia(mesesDeLaHistoria)).fetch, HOY)
    expect(r.por_brazo.propios?.estado).toBe('fallo')
    expect(t.cerebro_fichas).toEqual([])
  })

  it('el mapa de ítems que confirma el dueño rotula los ítems; sin él, son nombres del punto de venta', async () => {
    const { t, db } = nuevaBase()
    await correr(c, db, loyverse(historia(['2026-09'])).fetch, HOY, { config: { apify: { loyverse_mapa_de_items: { 'Plato 0': 'Ceviche mixto (carta web)' } } } })
    const items = vivas(t, 'metrica:loyverse:items:2026-09')[0]
    expect(String(items.contenido)).toMatch(/Ceviche mixto \(carta web\) \(en el punto de venta: «Plato 0»\)/)
    expect(String(items.contenido)).toMatch(/sin equivalencia confirmada/)
  })
})

describe('ventas de Loyverse · el plan de hoy solo deja leer 31 días atrás', () => {
  const c = CLIENTES[0]
  // el proveedor rechaza lo que empiece antes de 31 días: se pide con una hora de margen
  const MIN_PERMITIDO = (ahora: Date) => ahora.getTime() - 31 * 86_400_000 + 3_600_000
  /** todos los pedidos de recibos de una lista de URL empiezan DENTRO de lo que deja el plan */
  const dentroDelPlan = (urls: string[], ahora: Date) => urls.every((u) => new Date(new URL(u).searchParams.get('created_at_min') ?? 0).getTime() >= MIN_PERMITIDO(ahora))

  it('nunca pide más atrás de lo que deja el plan: lee la ventana de 30 días, archiva el mes en curso y la ventana, y DICE lo que no puede rellenar', async () => {
    const { t, db } = nuevaBase()
    const lv = loyverse(historia(mesesDeLaHistoria), { limiteDias: 31 })
    const r = await correr(c, db, lv.fetch, HOY, { limitado: true })
    expect(r.errores).toEqual([])
    expect(r.por_brazo.propios?.estado).toBe('listo')
    expect(lv.receipts()).toHaveLength(1)
    expect(dentroDelPlan(lv.receipts(), HOY)).toBe(true)
    expect(lv.llamadas.some((u) => u.includes('/stores'))).toBe(false)
    // lo que sí hay: el mes en curso (parcial) y los últimos 30 días; NINGÚN mes cerrado inventado
    expect(vivas(t, 'metrica:loyverse:ingreso:').map((f) => f.atributo).sort()).toEqual(['metrica:loyverse:ingreso:2026-10', 'metrica:loyverse:ingreso:ultimos_30_dias'])
    expect(r.por_brazo.propios?.declarado.join(' ')).toMatch(/12 mes\(es\) cerrado\(s\) anterior\(es\) fuera de lo que deja leer el plan \(31 días\)/)
    expect(vivas(t, 'metrica:loyverse:ingreso:ultimos_30_dias')[0].vigente_hasta).not.toBeNull()
    // el resumen vivo lo muestra tal cual: mes en curso y ventana móvil, sin «último mes cerrado»
    const res = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: HOY, fichas: t.cerebro_fichas.map(aResumen), zona: [], sedes: [] })
    expect(res.texto).toMatch(/Mes en curso, 2026-10 \(parcial/)
    expect(res.texto).toMatch(/Últimos 30 días \(hasta el 2026-10-15\)/)
    expect(res.texto).not.toMatch(/Último mes cerrado/)
  })

  it('con el plan ampliado (variable del entorno) el relleno de 12 meses corre solo', async () => {
    const { t, db } = nuevaBase()
    const lv = loyverse(historia(mesesDeLaHistoria), { limiteDias: 400 })
    await correr(c, db, lv.fetch, HOY, { env: { [c.env]: TOKEN, PORTERO_LOYVERSE_HISTORIAL_DIAS: '400' } })
    expect(vivas(t, 'metrica:loyverse:ingreso:2025-10')).toHaveLength(1)
    expect(vivas(t, 'metrica:loyverse:ingreso:2026-09')).toHaveLength(1)
  })

  it('un mes que termina se CIERRA por fusión aunque su comienzo ya no se pueda leer: ingreso y tickets exactos, listas rotuladas hasta la última lectura', async () => {
    const { t, db } = nuevaBase()
    // octubre completo: 3 recibos por día-semana de siempre + ventas de la noche del 31 que llegan DESPUÉS de la última lectura
    const octubre = [...historia(['2026-10'], 13), recibo(4999, 11, '2026-10-31T13:00:00Z')] // 08:00 local del 31: ya está en la última lectura
    const tarde = [
      recibo(5001, 77, '2026-10-31T23:10:00Z'), recibo(5002, 23, '2026-11-01T03:30:00Z'), // 18:10 y 22:30 locales del 31 de octubre
      recibo(5003, -20, '2026-11-01T02:00:00Z', { receipt_type: 'REFUND' }), recibo(5004, 15, '2026-11-01T01:00:00Z', { cancelled_at: '2026-11-01T01:05:00Z' }),
    ]
    const noviembre = [recibo(6001, 40, '2026-11-01T17:00:00Z')]
    const universo = [...historia(mesesDeLaHistoria.filter((m) => m < '2026-10')), ...octubre, ...tarde, ...noviembre]
    // 1) la última lectura de octubre: el 31 por la mañana (hora local)
    const treintaYUno = new Date('2026-10-31T15:00:00Z')
    await correr(c, db, loyverse(universo, { limiteDias: 31 }).fetch, treintaYUno, { limitado: true })
    const parcial = vivas(t, 'metrica:loyverse:ingreso:2026-10')[0]
    expect((parcial.provenance_tag as { datos: { snapshot: unknown } }).datos.snapshot).toBeTruthy()
    // 2) el 3 de noviembre: octubre ya no se puede leer entero (empezó hace más de 31 días); noviembre empieza
    const tres = new Date('2026-11-03T15:00:00Z')
    const lv = loyverse(universo, { limiteDias: 31 })
    const r = await correr(c, db, lv.fetch, tres, { limitado: true })
    expect(r.errores).toEqual([])
    expect(dentroDelPlan(lv.receipts(), tres)).toBe(true)
    const oct = vivas(t, 'metrica:loyverse:ingreso:2026-10')
    expect(oct).toHaveLength(1)
    const d = (oct[0].provenance_tag as { datos: Record<string, unknown>; metrica: { valor: number } })
    expect(d.datos).toMatchObject({ en_curso: false, aproximado_hasta: '2026-10-31' })
    // exacto: 1300 + 650 + 390 (el mes 13) + 77 + 23 de la noche del 31
    expect(d.metrica.valor).toBe(2340 + 100 + 11)
    expect(d.datos.tickets).toBe(6)
    expect(d.datos).toMatchObject({ reembolsos: 20 })
    expect(String(oct[0].contenido)).toMatch(/1 recibos anulados no cuentan/)
    // y el resumen vivo avisa hasta dónde llegan las listas
    const resumen = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: tres, fichas: t.cerebro_fichas.map(aResumen), zona: [], sedes: [] })
    expect(resumen.texto).toMatch(/Último mes cerrado, 2026-10: 2451,00 en 6 tickets[^\n]*las listas de días, horas e ítems llegan hasta el 2026-10-31/)
    expect(oct[0].vigente_hasta).toBeNull()
    expect(String(oct[0].contenido)).toMatch(/solo deja leer 31 días atrás/)
    // y desde entonces ya no se reescribe
    const n = t.cerebro_fichas.length
    const lv2 = loyverse(universo, { limiteDias: 31 })
    await correr(c, db, lv2.fetch, new Date('2026-11-04T15:00:00Z'), { limitado: true })
    expect(vivas(t, 'metrica:loyverse:ingreso:2026-10')).toHaveLength(1)
    expect(vivas(t, 'metrica:loyverse:ingreso:2026-10')[0].id).toBe(oct[0].id)
    expect(t.cerebro_fichas.length).toBeGreaterThanOrEqual(n)
  })

  it('si el plan se amplió después de guardar la parcial, el mes se cierra LEYÉNDOLO entero (exacto, sin «aproximado»)', async () => {
    const { t, db } = nuevaBase()
    const universo = [...historia(['2026-10'], 13), recibo(5001, 77, '2026-10-31T23:10:00Z')]
    await correr(c, db, loyverse(universo, { limiteDias: 31 }).fetch, new Date('2026-10-31T15:00:00Z'), { limitado: true })
    await correr(c, db, loyverse(universo, { limiteDias: 400 }).fetch, new Date('2026-11-03T15:00:00Z'))
    const oct = vivas(t, 'metrica:loyverse:ingreso:2026-10')
    expect(oct).toHaveLength(1)
    expect((oct[0].provenance_tag as { datos: Record<string, unknown> }).datos.aproximado_hasta).toBeUndefined()
    expect((oct[0].provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(2340 + 77)
  })

  it('en el borde exacto del límite (el instante en que el mes pasado cumple 31 días) no se pide más atrás de lo permitido', async () => {
    const { db } = nuevaBase()
    const borde = new Date('2026-11-01T05:00:00Z')
    const lv = loyverse(historia(['2026-10']), { limiteDias: 31 })
    await correr(c, db, lv.fetch, borde, { limitado: true })
    expect(dentroDelPlan(lv.receipts(), borde)).toBe(true)
  })

  it('un mes que terminó sin ninguna lectura parcial guardada NO se inventa: se declara', async () => {
    const { t, db } = nuevaBase()
    const lv = loyverse(historia(['2026-10']), { limiteDias: 31 })
    const r = await correr(c, db, lv.fetch, new Date('2026-11-03T15:00:00Z'), { limitado: true })
    expect(vivas(t, 'metrica:loyverse:ingreso:2026-10')).toEqual([])
    expect(r.por_brazo.propios?.declarado.join(' ')).toMatch(/fuera de lo que deja leer el plan/)
  })

  it('cerrarPorFusion: los días de OTRO mes que traiga la lectura fresca no entran al cierre', () => {
    const snap = { cubre_hasta: '2026-10-31T15:00:00Z', tickets: 1, ingreso: 10, reembolsos: 0, anuladas: 0, dias: [{ f: '2026-10-30', ingreso: 10, tickets: 1, reembolsos: 0, anuladas: 0 }], por_item: [], por_hora: [], por_dia: [] }
    const fresco = resumirVentas([recibo(1, 5, '2026-10-31T22:00:00Z'), recibo(2, 99, '2026-11-02T17:00:00Z')], { periodo: '2026-10' })
    const f = cerrarPorFusion(snap, fresco, '2026-10')
    expect(f).toMatchObject({ ingreso: 15, tickets: 2, aproximado: '2026-10-31' })
  })

  it('una lectura parcial dañada no sirve para cerrar un mes (forma exacta o nada)', async () => {
    const bueno = { cubre_hasta: '2026-10-31T15:00:00Z', dias: [{ f: '2026-10-03', ingreso: 5, tickets: 1, reembolsos: 0, anuladas: 0 }], tickets: 1, ingreso: 5, reembolsos: 0, anuladas: 0 }
    expect(leerSnapshot({ ...bueno, cubre_hasta: 'ayer' })).toBeNull()
    expect(leerSnapshot({ ...bueno, dias: 'no' })).toBeNull()
    expect(leerSnapshot({ ...bueno, ingreso: null })).toBeNull()
    expect(leerSnapshot(null)).toBeNull()
    expect(leerSnapshot({ cubre_hasta: '2026-10-31T15:00:00Z', dias: [{ f: 'x' }], tickets: 1, ingreso: 1, reembolsos: 0, anuladas: 0 })).toBeNull()
    expect(leerSnapshot({ cubre_hasta: '2026-10-31T15:00:00Z', dias: [], tickets: '3', ingreso: 1, reembolsos: 0, anuladas: 0 })).toBeNull()
    expect(leerSnapshot({ cubre_hasta: '2026-10-31T15:00:00Z', dias: [{ f: '2026-10-03', ingreso: 5, tickets: 1, reembolsos: 0, anuladas: 0 }], tickets: 1, ingreso: 5, reembolsos: 0, anuladas: 0 })).toMatchObject({ tickets: 1 })
  })
})

describe('ventas de Loyverse · más bordes', () => {
  const c = CLIENTES[0]
  it('el mes en curso es el LOCAL: a las 22:00 del 31 (ya 1.º en UTC) sigue siendo octubre', async () => {
    const { t, db } = nuevaBase()
    await correr(c, db, loyverse(historia(['2026-10'], 13), { limiteDias: 31 }).fetch, new Date('2026-10-31T15:00:00Z'), { limitado: true })
    const res = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: new Date('2026-11-01T03:00:00Z'), fichas: t.cerebro_fichas.map(aResumen).map((f) => ({ ...f, vigente_hasta: null })), zona: [], sedes: [] })
    expect(res.texto).toMatch(/Mes en curso, 2026-10 \(parcial/)
  })

  it('un mes que ya terminó y solo tiene su lectura parcial NO se muestra como «cerrado» (hasta que se cierre)', async () => {
    const { t, db } = nuevaBase()
    await correr(c, db, loyverse(historia(['2026-10'], 13), { limiteDias: 31 }).fetch, new Date('2026-10-31T15:00:00Z'), { limitado: true })
    const res = armarResumen({ client_id: c.id, nombre: c.name, rubro: c.rubro, ahora: new Date('2026-11-03T15:00:00Z'), fichas: t.cerebro_fichas.map(aResumen).map((f) => ({ ...f, vigente_hasta: null })), zona: [], sedes: [] })
    expect(res.texto).not.toMatch(/Último mes cerrado, 2026-10/)
  })

  it('lectura recortada con el proveedor entregando del más viejo al más nuevo: queda incompleto el más NUEVO, no el más viejo', async () => {
    const { t, db } = nuevaBase()
    const muchos: Recibo[] = []
    for (let i = 0; i < MAX_PAGINAS_DEL_RELLENO + 10; i++) muchos.push(recibo(i, 10, new Date(Date.UTC(2026, 9, 15, 12) - i * 86_400_000 * 3).toISOString()))
    const r = await correr(c, db, loyverse(muchos, { porPagina: 1, ascendente: true }).fetch, HOY)
    // se leyeron los 120 MÁS VIEJOS (i = 129…10): el más nuevo leído cae el 15-sep (30 días antes del 15-oct) y ese mes quedó a medias
    expect(r.por_brazo.propios?.declarado.join(' ')).toMatch(/incompleto y no se archivó/)
    const meses = vivas(t, 'metrica:loyverse:ingreso:').map((f) => String(f.atributo).slice(-7))
    expect(meses).not.toContain('2026-09')
    expect(meses).toContain('2026-08')
  })
})
