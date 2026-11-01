/**
 * ESTADO DE SEDE «solo delivery» (01-nov · firma de Emilio · agnóstico). Una sede que vende por domicilio aunque su local no haya abierto. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { estadoDeSedeDichoPorElDueno } from '../src/lib/portero-alimenta/dueno'
import { estadoDeApertura, estadoDeLasSedes, esTemaDeEstadoDeSede, REGLA_SOLO_DELIVERY, sedesPorAbrir, sedesSoloDelivery, textoDeEstado } from '../src/lib/sedes/por-abrir'
import { ACCIONES } from '../src/lib/oficina/tablero/acciones'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

describe('lo que dice un texto libre', () => {
  it.each([
    'Estamos en esa ciudad SOLO por delivery, el local abre en un mes',
    'solamente a domicilio',
    'únicamente delivery',
    'opera solo por delivery',
    'Solo vendemos por delivery',
    'solo operamos a domicilio',
    'sin local, por ahora por delivery',
    'atendemos por delivery y no tenemos, sin local todavía',
  ])('«%s» → solo_delivery', (t) => { expect(estadoDeApertura(t)).toBe('solo_delivery') })
  it.each<[string, string | null]>([
    ['no solo delivery, también en el local', null],
    ['tenemos delivery y local', null],
    ['ya abrió el local; antes era solo delivery', 'abierta'],
    ['ya abrimos, antes solo a domicilio', 'abierta'],
    ['todavía no abre', 'por_abrir'],
    ['por abrir', 'por_abrir'],
    ['cerrada definitivamente', 'cerrada'],
    ['solo de lunes a viernes', null],
    ['', null],
  ])('«%s» → %s (no se confunde)', (t, e) => { expect(estadoDeApertura(t)).toBe(e) })
  it('el tema de la pregunta cuenta como estado de sede', () => {
    expect(esTemaDeEstadoDeSede('modalidad de delivery')).toBe(true); expect(esTemaDeEstadoDeSede('reparto a domicilio')).toBe(true); expect(esTemaDeEstadoDeSede('precio del plato')).toBe(false)
  })
})

describe('el estado por sede', () => {
  const datos = (valor: string, en = '2026-11-01') => ({ clave: 'b', campo: 'estado_de_la_sede', valor_texto: valor, observado_en: en })
  it('se escribe y se vuelve a leer igual; la declaración más nueva manda sobre «por abrir» y deja de contarse como por abrir', () => {
    expect(textoDeEstado('solo_delivery')).toBe('solo delivery')
    const e = { datosDeSede: [datos('por abrir', '2026-10-15'), datos(textoDeEstado('solo_delivery'))] }
    expect(estadoDeLasSedes(e).get('b')).toBe('solo_delivery')
    expect(sedesSoloDelivery(e).has('b')).toBe(true)
    expect(sedesPorAbrir(e).has('b')).toBe(false)
  })
  it('🔴 sin declaración NO se deduce: «solo domicilio» en tipo de atención + «por abrir» sigue siendo por abrir', () => {
    const e = { datosDeSede: [datos('por abrir'), { clave: 'b', campo: 'tipo_de_atencion', valor_texto: 'solo domicilio (sin local)', observado_en: '2026-11-01' }] }
    expect(estadoDeLasSedes(e).get('b')).toBe('por_abrir'); expect(sedesSoloDelivery(e).size).toBe(0)
  })
  it('la ficha del cliente también lo puede decir, y manda', () => {
    expect(sedesSoloDelivery({ config: { apify: { sedes_estado: { b: 'solo_delivery' } } }, datosDeSede: [datos('abierta')] }).has('b')).toBe(true)
  })
  it('una sede después abierta deja de ser solo delivery', () => {
    expect(sedesSoloDelivery({ datosDeSede: [datos('solo delivery', '2026-11-01'), datos('abierta', '2026-12-01')] }).size).toBe(0)
  })
})

describe('la puerta del dueño lo aplica', () => {
  const SEDES = [{ id: '1', clave: 'norte', ciudad: 'Ciudad Norte' }, { id: '2', clave: 'sur', ciudad: 'Ciudad Sur' }]
  it('una respuesta clara sobre una sede nombrada es estado de esa sede', () => {
    expect(estadoDeSedeDichoPorElDueno({ tema: 'apertura de la sede', sede_clave: null }, 'En Ciudad Sur solo por delivery, el local abre en un mes', SEDES)).toEqual({ sede: { id: '2', clave: 'sur' }, estado: 'solo_delivery' })
  })
  it('si no se sabe de qué sede habla, no se aplica', () => {
    expect(estadoDeSedeDichoPorElDueno({ tema: 'apertura de la sede', sede_clave: null }, 'solo por delivery', SEDES)).toBeNull()
  })
})

describe('«Pedir cambios» también lo declara', () => {
  const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const P = '11111111-1111-4111-8111-111111111111'
  const AHORA = new Date('2026-11-01T17:00:00Z')
  const plan = { id: P, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', created_at: '2026-10-30T10:00:00Z', provenance_tag: {} }
  const sedes = [{ id: 's1', client_id: C, clave: 'norte', ciudad: 'Ciudad Norte' }, { id: 's2', client_id: C, clave: 'sur', ciudad: 'Ciudad Sur' }, { id: 's3', client_id: 'otro', clave: 'x', ciudad: 'Ciudad X' }]
  const pedir = (db: DbFalsa, texto: string) => ACCIONES['plan-cambios']({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo: { plan_id: P, texto, confirmo_gasto: true, tope_usd: 5 }, reviewer: 'emilio' })
  const base = () => new DbFalsa().semilla('client_historical_outputs', [plan]).semilla('client_sedes', sedes)
  it('texto claro + una sede: fila nueva con origen dueño y su cita; el pedido sigue y lo dice', async () => {
    const db = base().semilla('client_sede_datos', [{ id: 'd0', client_id: C, sede_id: 's2', campo: 'estado_de_la_sede', valor_texto: 'por abrir', fuente: 'dueno' }])
    const texto = 'En Ciudad Sur estamos SOLO por delivery, el local abre en un mes'
    const s = await pedir(db, texto)
    expect(s.status).toBe(200)
    expect(s.cuerpo.sede_declarada).toEqual({ sede: 'sur', guardado: true })
    const f = db.tablas['client_sede_datos']
    expect(f).toHaveLength(2) // la anterior no se borra
    expect(f[0].valor_texto).toBe('por abrir')
    expect(f[1]).toMatchObject({ client_id: C, sede_id: 's2', campo: 'estado_de_la_sede', valor_texto: 'solo delivery', valor_norm: { estado: 'solo_delivery' }, fuente: 'dueno', alcance: 'sede', observado_en: AHORA.toISOString() })
    expect(String(f[1].fuente_ref)).toContain(`plan_cambios:${String(s.cuerpo.plan_cambio_id)}`)
    expect(String(f[1].fuente_ref)).toContain(texto.slice(0, 40))
    expect(s.despertar_flujo).toBeDefined()
  })
  it.each([
    ['no dice ese estado', 'En Ciudad Sur cambia la meta por semana'],
    ['no dice de qué sede', 'estamos solo por delivery'],
    ['nombra dos sedes', 'en Ciudad Sur y en Ciudad Norte solo por delivery'],
    ['lo niega', 'en Ciudad Sur no solo delivery'],
  ])('%s: no se toca ninguna sede y el pedido sigue', async (_n, texto) => {
    const db = base()
    const s = await pedir(db, texto)
    expect(s.status).toBe(200); expect(s.cuerpo.sede_declarada).toBeUndefined()
    expect(db.tablas['client_sede_datos'] ?? []).toHaveLength(0)
  })
  it('un negocio con una sola sede no necesita nombrarla; una sede de OTRO cliente no cuenta', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan]).semilla('client_sedes', [sedes[0], sedes[2]])
    const s = await pedir(db, 'solo por delivery')
    expect(s.cuerpo.sede_declarada).toEqual({ sede: 'norte', guardado: true })
    expect(db.tablas['client_sede_datos'][0].sede_id).toBe('s1')
  })
  it('🔴 si no se pudo guardar, el pedido no se frena y lo dice', async () => {
    const db = base(); db.fallar['client_sede_datos'] = 'CHECK violado'
    const s = await pedir(db, 'En Ciudad Sur solo por delivery')
    expect(s.status).toBe(200)
    expect(s.cuerpo.sede_declarada).toEqual({ sede: 'sur', guardado: false, detalle: 'CHECK violado' })
  })
})

describe('la regla para quien planea', () => {
  it('permite domicilio y awareness y prohíbe prometer el local', () => {
    expect(REGLA_SOLO_DELIVERY).toMatch(/SÍ se le planean piezas de domicilio y de awareness/)
    expect(REGLA_SOLO_DELIVERY).toMatch(/ninguna promete local abierto/)
    expect(REGLA_SOLO_DELIVERY).toMatch(/requiere_abierto siempre false/)
  })
})
