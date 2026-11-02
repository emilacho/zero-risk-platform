/**
 * 02-nov · datos de sede de OTROS negocios (tiendas de Uber Eats rotuladas «sitio»): la regla, el retiro con motivo, el relleno para todos y el recolector.
 * Corre con los DIEZ clientes de práctica; el caso central es la «tienda homónima en una app de reparto».
 */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from '../../portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from '../../portero-alimenta/__tests__/diez-clientes.fixtures'
import { esFilaAjena, esPaginaDeReparto, motivoDeRetiro, retirarSedeDatosAjenos } from '../ajenas'
import { recolectarSedes } from '../recolectar'
import { baseDeFicha } from '../../propio/regla-propio'

const AHORA = new Date('2026-11-02T14:00:00.000Z')
const slug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ficha = (c: ClienteSintetico) => ({ id: c.id, name: c.nombre, website_url: c.web, config: { apify: { own_handles: c.ig ? { instagram: c.ig } : {} } } })
const tiendaHomonima = (c: ClienteSintetico) => `https://www.ubereats.com/store/${slug(c.nombre)}-otra-sede/abc123?srsltid=zz`
const dominio = (c: ClienteSintetico) => (c.web ? c.web.replace(/\/$/, '') : null)
let n = 0
const fila = (c: ClienteSintetico, fuente: string, fuente_ref: string | null, extra: Record<string, unknown> = {}) => ({ id: `f${++n}`, client_id: c.id, sede_id: 's1', campo: 'direccion', valor_texto: 'Calle falsa 123', fuente, fuente_ref, alcance: 'sede', observado_en: '2026-10-16T00:00:00Z', retirada_en: null, motivo_retirada: null, ...extra })

describe('la regla: una fila «sitio» solo vale si la página es del cliente', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: su dominio vale; la tienda homónima de una app de reparto no`, () => {
      const base = baseDeFicha(ficha(c))
      if (dominio(c)) expect(esFilaAjena(base, { fuente: 'sitio', fuente_ref: `${dominio(c)}/contacto`, retirada_en: null })).toBe(false)
      expect(esFilaAjena(base, { fuente: 'sitio', fuente_ref: tiendaHomonima(c), retirada_en: null })).toBe(true)
      expect(esFilaAjena(base, { fuente: 'sitio', fuente_ref: 'https://www.rappi.com.ec/restaurantes/' + slug(c.nombre), retirada_en: null })).toBe(true)
      expect(esFilaAjena(base, { fuente: 'sitio', fuente_ref: 'https://www.pedidosya.com.ec/restaurantes/' + slug(c.nombre), retirada_en: null })).toBe(true)
    })
  }
  it('lo que no es «sitio» (instagram, mapas, dueño), lo que no trae dirección y lo ya retirado no se toca', () => {
    const c = DIEZ_CLIENTES[0]
    const base = baseDeFicha(ficha(c))
    for (const fuente of ['instagram', 'mapas', 'dueno']) expect(esFilaAjena(base, { fuente, fuente_ref: tiendaHomonima(c), retirada_en: null })).toBe(false)
    expect(esFilaAjena(base, { fuente: 'sitio', fuente_ref: null, retirada_en: null })).toBe(false)
    expect(esFilaAjena(base, { fuente: 'sitio', fuente_ref: tiendaHomonima(c), retirada_en: '2026-11-02T00:00:00Z' })).toBe(false)
  })
  it('un cliente sin sitio ni cuentas no puede probar nada: una fila «sitio» suya es ajena', () => {
    expect(esFilaAjena(baseDeFicha({ website_url: null, config: {} }), { fuente: 'sitio', fuente_ref: 'https://cualquiera.example/x', retirada_en: null })).toBe(true)
  })
  it('reconoce las apps de reparto y no confunde el dominio propio', () => {
    expect(esPaginaDeReparto('https://www.ubereats.com/store/x/1')).toBe(true)
    expect(esPaginaDeReparto('https://www.rappi.com.ec/x')).toBe(true)
    expect(esPaginaDeReparto('https://pedidosya.com.ec/x')).toBe(true)
    expect(esPaginaDeReparto('https://miubereats.example/x')).toBe(false)
    expect(esPaginaDeReparto('https://naufrago.ec/menu')).toBe(false)
  })
  it('el motivo dice qué era, de dónde y quién la retiró', () => {
    const m = motivoDeRetiro({ fuente_ref: 'https://www.ubereats.com/store/x/1' }, 'el cerebro', AHORA)
    expect(m).toMatch(/app de reparto/)
    expect(m).toMatch(/ubereats\.com/)
    expect(m).toMatch(/el cerebro la retiró el 2026-11-02/)
  })
})

describe('el relleno: retira con motivo, en seco primero, para todos los clientes', () => {
  const montar = () => {
    const filas: ReturnType<typeof fila>[] = []
    for (const c of DIEZ_CLIENTES) {
      if (dominio(c)) filas.push(fila(c, 'sitio', `${dominio(c)}/contacto`))
      filas.push(fila(c, 'sitio', tiendaHomonima(c)), fila(c, 'sitio', tiendaHomonima(c) + '&x=2', { campo: 'horario' }))
      filas.push(fila(c, 'mapas', 'https://www.google.com/maps/place/x'), fila(c, 'dueno', 'dijo el dueño'))
    }
    return crearBaseFalsa({ client_sede_datos: filas, clients: DIEZ_CLIENTES.map(ficha) })
  }
  it('en seco cuenta por cliente y no escribe nada', async () => {
    const b = montar()
    const r = await retirarSedeDatosAjenos(b.db as never, { dry_run: true, ahora: AHORA })
    expect(r.ok).toBe(true)
    expect(r.total).toBe(DIEZ_CLIENTES.length * 2)
    expect(r.por_cliente).toHaveLength(DIEZ_CLIENTES.length)
    for (const c of r.por_cliente) expect(c.ajenas).toBe(2)
    expect(b.escrituras).toHaveLength(0)
  })
  it('de verdad: retira solo las ajenas, con fecha y motivo; las demás quedan vigentes', async () => {
    const b = montar()
    const r = await retirarSedeDatosAjenos(b.db as never, { dry_run: false, ahora: AHORA, quien: 'CC-CEREBRO' })
    expect(r.ok).toBe(true)
    expect(r.total).toBe(DIEZ_CLIENTES.length * 2)
    const t = b.tablas.client_sede_datos as ReturnType<typeof fila>[]
    const retiradas = t.filter((f) => f.retirada_en)
    expect(retiradas).toHaveLength(DIEZ_CLIENTES.length * 2)
    for (const f of retiradas) { expect(f.fuente).toBe('sitio'); expect(String(f.fuente_ref)).toMatch(/ubereats/); expect(f.retirada_en).toBe(AHORA.toISOString()); expect(String(f.motivo_retirada)).toMatch(/CC-CEREBRO la retiró/) }
    for (const f of t.filter((x) => !x.retirada_en)) expect(String(f.fuente_ref)).not.toMatch(/ubereats/)
    expect(t.filter((x) => x.fuente === 'mapas' && x.retirada_en)).toHaveLength(0)
    expect(t.filter((x) => x.fuente === 'dueno' && x.retirada_en)).toHaveLength(0)
    // cada retiro filtra por la fila Y por su cliente Y solo si sigue vigente
    for (const e of b.escrituras) expect(e.filtros?.map(([c]) => c).sort()).toEqual(['client_id', 'id', 'retirada_en'])
  })
  it('es idempotente: la segunda vez no hay nada que retirar', async () => {
    const b = montar()
    await retirarSedeDatosAjenos(b.db as never, { dry_run: false, ahora: AHORA })
    const antes = b.escrituras.length
    const r2 = await retirarSedeDatosAjenos(b.db as never, { dry_run: false, ahora: AHORA })
    expect(r2.total).toBe(0)
    expect(b.escrituras.length).toBe(antes)
  })
  it('con client_id solo mira a ese cliente', async () => {
    const b = montar()
    const r = await retirarSedeDatosAjenos(b.db as never, { clientId: DIEZ_CLIENTES[3].id, dry_run: false, ahora: AHORA })
    expect(r.por_cliente.map((c) => c.client_id)).toEqual([DIEZ_CLIENTES[3].id])
    const t = b.tablas.client_sede_datos as ReturnType<typeof fila>[]
    expect(t.filter((f) => f.retirada_en).every((f) => f.client_id === DIEZ_CLIENTES[3].id)).toBe(true)
  })
  it('si la base rechaza la lectura o el retiro, lo dice (no finge que limpió)', async () => {
    const lee = await retirarSedeDatosAjenos(crearBaseFalsa({}, { fallaEn: 'client_sede_datos' }).db as never, { dry_run: false })
    expect(lee.ok).toBe(false)
    expect(lee.error).toMatch(/leer los datos de sede/)
    const sinFichas = await retirarSedeDatosAjenos(crearBaseFalsa({ client_sede_datos: [fila(DIEZ_CLIENTES[0], 'sitio', tiendaHomonima(DIEZ_CLIENTES[0]))] }, { fallaEn: 'clients' }).db as never, { dry_run: false })
    expect(sinFichas.ok).toBe(false)
    expect(sinFichas.error).toMatch(/fichas de cliente/)
  })
})

describe('el recolector: la tienda homónima en una app de reparto no entra, se declara y lo viejo se retira', () => {
  const SEDE = (c: ClienteSintetico) => c.sedes[0] ?? { clave: 'quito', ciudad: 'Quito', direccion: 'Av. Siempre Viva 123' }
  const PAGINA = (c: ClienteSintetico) => c.nombre + ' <script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'Restaurant', name: c.nombre, address: { '@type': 'PostalAddress', streetAddress: SEDE(c).direccion, addressLocality: SEDE(c).ciudad }, telephone: '+593991234567', openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' }] }) + '</script>'
  const montar = (c: ClienteSintetico, urlReparto: string, rolDeLaPagina: string) =>
    crearBaseFalsa({
      clients: [ficha(c)],
      client_web_pages: [{ client_id: c.id, owner_role: rolDeLaPagina, url: urlReparto, content_text: PAGINA(c), crawled_at: '2026-10-30T12:00:00Z' }],
      client_sedes: [{ id: 'sede0', client_id: c.id, clave: slug(SEDE(c).ciudad), ciudad: SEDE(c).ciudad }],
      client_sede_datos: [fila(c, 'sitio', urlReparto, { id: 'vieja' })],
      apify_raw: [],
    })
  for (const c of DIEZ_CLIENTES.filter((x) => x.web)) {
    it(`${c.nombre}: página de reparto rotulada «propio» → no guarda nada nuevo, la declara y retira la vieja`, async () => {
      const url = tiendaHomonima(c)
      const b = montar(c, url, 'propio')
      const r = await recolectarSedes(b.db as never, c.id)
      expect(r.ok).toBe(true)
      expect(r.nuevas).toBe(0)
      expect(r.descartes.some((d) => d.fuente === 'reparto' && d.ref === url)).toBe(true)
      const t = b.tablas.client_sede_datos as ReturnType<typeof fila>[]
      expect(t.find((f) => f.id === 'vieja')?.retirada_en).toBeTruthy()
      expect(t.filter((f) => !f.retirada_en && String(f.fuente_ref).includes('ubereats'))).toHaveLength(0)
      // y la ficha de sedes no lleva nada de esa página
      expect(JSON.stringify(r.sedes)).not.toMatch(/ubereats/)
    })
  }
  it('control: la misma página en el dominio del cliente SÍ se lee (la prueba no pasa por no entender el contenido)', async () => {
    const c = DIEZ_CLIENTES[1]
    const b = montar(c, `${dominio(c)}/contacto`, 'propio')
    ;(b.tablas.client_sede_datos as unknown[]).length = 0
    const r = await recolectarSedes(b.db as never, c.id)
    expect(r.ok).toBe(true)
    expect(r.nuevas).toBeGreaterThan(0)
    expect(r.descartes.some((d) => d.fuente === 'reparto')).toBe(false)
  })
  it('una fila retirada no cuenta como lo último guardado ni sale en la ficha de sedes', async () => {
    const c = DIEZ_CLIENTES[1]
    const b = montar(c, `${dominio(c)}/contacto`, 'propio')
    ;(b.tablas.client_sede_datos as unknown[]).length = 0
    ;(b.tablas.client_sede_datos as unknown[]).push(fila(c, 'sitio', 'https://otro.example/x', { id: 'ret', retirada_en: '2026-11-02T00:00:00Z', valor_texto: 'DATO AJENO', sede_id: 'sede0' }))
    const r = await recolectarSedes(b.db as never, c.id)
    expect(JSON.stringify(r.sedes)).not.toMatch(/DATO AJENO/)
  })
})
