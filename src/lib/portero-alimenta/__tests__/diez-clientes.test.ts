/**
 * LOS DIEZ CLIENTES DE PRUEBA PERMANENTES (16-oct · firma de Emilio) · US$ 0 · base falsa, sin Apify ni modelo, nada se escribe en producción.
 * Diez negocios de rubros y países distintos pasan por TODAS las etapas del cerebro. Cualquier cambio futuro del cerebro debe pasar con los diez:
 * si algo se vuelve a hacer «a la medida» de un solo cliente, aquí se rompe.
 * Cubre: despertar y listo · alimentar (filtro de identidad con homónimos, precios en su moneda, transitorios de su variante) · contexto por país · canal y radios por sede ·
 * términos de demanda y plan del día · ventas en SU hora local · resumen vivo · auditoría y vigilante · pedido libre · escala (la base recorta a 1.000 filas).
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { rutaDespertar } from '../despertar'
import { rutaListo } from '../listo'
import { clientesActivos } from '../clientes'
import { rutaNoCorrio } from '../no-corrio'
import { rutaDescubrir, reconciliarYEnviar } from '../rutas'
import { rutaPedido } from '../pedidos'
import { evaluarCliente } from '../vigilante'
import { armarResumen, cargarEntradaDelResumen, type FichaParaResumen } from '../resumen-vivo'
import { BRAZOS_APAGADOS, correrBrazos, paisDeLaFicha } from '../brazos'
import { fichasDeContexto, CATALOGO_DE_CONTEXTO } from '../brazos/contexto'
import { terminosDeDemanda } from '../brazos/demanda'
import { brazoDePropios, type Fetch } from '../brazos/propios'
import { radioDeSede, sedesConPunto } from '../brazos/sedes'
import { rubroCompitePorCercania } from '../brazos/sedes'
import { familiasDelRubro } from '../../fuentes-publicas/plan'
import { TRANSITORIOS_COMUNES } from '../datos'
import { esTransitoria } from '../../cerebro/diario/huella'
import { desfaseDelCliente } from '../zona-horaria'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON, REAL, montar } from './fixtures-despertar'

const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const alimentar = (t: T, c: ClienteSintetico, extra: Record<string, unknown> = {}) =>
  alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: { ...ON, resumen_vivo: true }, ahora: AHORA, ...WF, ...extra })
const fichasDe = (t: T, c: ClienteSintetico) => t.cerebro_fichas.filter((f) => f.client_id === c.id && f.clase !== 'resumen_vivo')
const tuteoYVoseo = (c: ClienteSintetico) => `${c.nombre} (${c.pais} · ${c.voz})`

describe('los diez clientes de prueba son diez (rubros, países, canales y fuentes distintas)', () => {
  it('la muestra cubre lo que pidió Emilio', () => {
    expect(DIEZ_CLIENTES).toHaveLength(10)
    expect(new Set(DIEZ_CLIENTES.map((c) => c.id)).size).toBe(10)
    expect(new Set(DIEZ_CLIENTES.map((c) => c.iso)).size).toBeGreaterThanOrEqual(7)
    expect(DIEZ_CLIENTES.filter((c) => c.iso !== 'ec').length).toBeGreaterThanOrEqual(2)
    expect(DIEZ_CLIENTES.some((c) => c.voz === 'voseo')).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => !c.ig)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => !c.mapas)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => c.pos === null)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => c.pos === 'otro')).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => c.sedes.length >= 3)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => !c.compitePorCercania)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => c.nombre.split(' ').length === 1)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => !c.web)).toBe(true)
    expect(JSON.stringify(DIEZ_CLIENTES)).not.toMatch(/n[aá]ufrago|olon|loyverse_mapa/i)
  })
})

describe('despertar y listo', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}: despierta, queda «completando» y no rompe si falta una fuente`, async () => {
      const t = tablasDe(c)
      const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, cerebro_listo: false, apify_llamado: false })
      const l = await rutaListo(montar(t, { ahora: new Date(AHORA.getTime() + 600_000) }).deps, { client_id: c.id })
      expect(l.status).toBe(200)
      expect(l.body).toMatchObject({ listo: false, completando: true })
    })
  }
})

describe('alimentar: identidad, precios en su moneda y transitorios de su variante', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}`, async () => {
      const t = tablasDe(c)
      const r = await alimentar(t, c)
      expect(r.estado).toBe('hecha')
      expect(r.errores).toEqual([])
      const f = fichasDe(t, c)
      const fuentes = Number(!!c.web && c.pagina.length > 0) + Number(c.mapas) + Number(!!c.ig)
      expect(fuentes > 0 ? f.length : 0).toBeGreaterThan(fuentes > 0 ? 0 : -1)
      const texto = JSON.stringify(f.map((x) => `${x.titulo} ${x.contenido}`)).toLowerCase()
      // el homónimo de otra ciudad nunca entra como si fuera el cliente
      expect(texto).not.toContain('av. otra 99')
      // cada línea con un precio (en SU moneda y con SUS separadores) queda como ficha de precio
      for (const linea of c.pagina.filter((l) => /\d/.test(l) && /(\$|usd|cop|mxn|ars|clp|s\/|€|desde)/i.test(l) && !/\d{1,2}:\d{2}/.test(l))) {
        const palabra = linea.split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        expect(f.some((x) => String(x.atributo ?? '').startsWith('precio:') && String(x.atributo).includes(palabra.slice(0, 5))), `precio de «${linea}»`).toBe(true)
      }
      // el aviso de estado de SU variante («Abierto ahora», «Volvé a las 9», «Estamos cerrados hasta mañana») no es un dato del negocio
      const dicho = c.transitorio.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '')
      expect(f.some((x) => String(x.contenido ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '') === dicho), `transitorio «${c.transitorio}»`).toBe(false)
      // repetir no duplica
      const otra = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, forzar: true, ...WF })
      expect(otra.plan?.resumen.suma ?? 0).toBe(0)
    })
  }
  it('qué es un estado de este momento y qué es un dato permanente del negocio', () => {
    for (const t of ['abierto ahora', 'cerrado hoy', 'ahora mismo cerrado', 'abierto', 'en este momento abierto', 'cerrado ahora vuelve manana a las 8']) expect(esTransitoria(t, TRANSITORIOS_COMUNES), t).toBe(true)
    for (const d of ['abierto las 24 horas', 'cerrado los domingos', 'abierto de lunes a viernes de 8 a 18', 'ahora tambien con servicio a domicilio']) expect(esTransitoria(d, TRANSITORIOS_COMUNES), d).toBe(false)
  })
  it('«Abierto las 24 horas» es un dato permanente y NO se descarta (solo «abierto ahora» es un estado)', async () => {
    const c = DIEZ_CLIENTES.find((x) => x.nombre.startsWith('Farmacia'))!
    const t = tablasDe(c)
    await alimentar(t, c)
    expect(fichasDe(t, c).some((x) => /abierto las 24 horas/i.test(String(x.contenido)))).toBe(true)
  })
})

describe('contexto (feriados) por país: no solo Ecuador', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}: el país sale de la ficha y su catálogo trae feriados`, () => {
      expect(paisDeLaFicha(tablasDe(c).clients[0])).toBe(c.iso)
      expect(CATALOGO_DE_CONTEXTO[c.iso], `catálogo de ${c.iso}`).toBeDefined()
      const r = fichasDeContexto({ pais: c.iso, ahora: AHORA, horizonteDias: 400 })
      expect(r.estado).toBe('listo')
      expect(r.fichas.length).toBeGreaterThan(3)
      expect(r.fichas.every((f) => f.client_id === `zona:${c.iso}` && f.alcance === 'zona')).toBe(true)
    })
  }
})

describe('canal y radio por sede, según el rubro', () => {
  for (const c of DIEZ_CLIENTES.filter((x) => x.sedes.length)) {
    it(`${tuteoYVoseo(c)}: ${c.compitePorCercania ? 'compite por cercanía' : 'no compite por cercanía'}`, () => {
      const familias = familiasDelRubro(c.rubro)
      expect(rubroCompitePorCercania(familias)).toBe(c.compitePorCercania)
      const sedes = sedesConPunto({ nombreDelCliente: c.nombre, sedes: c.sedes.map((s) => ({ id: s.clave, clave: s.clave, ciudad: s.ciudad })), datos: c.sedes.filter((s) => s.tipo_de_atencion).map((s) => ({ sede_id: s.clave, campo: 'tipo_de_atencion', valor_texto: s.tipo_de_atencion!, observado_en: null })), config: {}, filas: [], familias })
      expect(sedes).toHaveLength(c.sedes.length)
      for (const s of sedes) {
        expect(s.canal).toBe(c.compitePorCercania ? 'local' : 'sin_local') // sin dato del canal, el rubro lo deduce
        expect(radioDeSede(familias, s) !== null).toBe(c.compitePorCercania)
      }
    })
  }
  it('un negocio que no compite por cercanía: el rubro lo deduce «sin local» (software) o el dato lo dice (tienda en línea, que el rubro «comercio» no distingue de una tienda física)', () => {
    for (const c of DIEZ_CLIENTES.filter((x) => !x.compitePorCercania)) {
      const familias = familiasDelRubro(c.rubro)
      const deducido = sedesConPunto({ nombreDelCliente: c.nombre, sedes: [{ id: 'x', clave: 'unica', ciudad: 'Ciudad' }], datos: [], config: {}, filas: [], familias })[0]
      const dicho = sedesConPunto({ nombreDelCliente: c.nombre, sedes: [{ id: 'x', clave: 'unica', ciudad: 'Ciudad' }], datos: [], config: { apify: { canal_por_sede: { unica: 'sin_local' } } }, filas: [], familias })[0]
      expect(dicho).toMatchObject({ canal: 'sin_local', canal_origen: 'dato' })
      expect(radioDeSede(familias, dicho)).toBeNull()
      if (rubroCompitePorCercania(familias) === false) { expect(deducido).toMatchObject({ canal: 'sin_local', canal_origen: 'deducido' }); expect(radioDeSede(familias, deducido)).toBeNull() }
      else expect(deducido).toMatchObject({ canal: 'local', canal_origen: 'deducido' }) // sin el dato, el rubro dice «local»: por eso el alta o el dueño lo declaran
    }
  })
})

describe('qué se busca: los términos salen del rubro del cliente (nunca el genérico de otro)', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}`, () => {
      const t = terminosDeDemanda({ rubro: c.rubro, familias: familiasDelRubro(c.rubro) })
      expect(t.length).toBeGreaterThanOrEqual(1)
      // ningún término está repetido dentro de otro («abogados» dentro de «estudio abogados»)
      for (const x of t) for (const y of t) if (x !== y) expect(` ${y.toLowerCase()} `.includes(` ${x.toLowerCase()} `), `«${x}» repetido dentro de «${y}»`).toBe(false)
      // un hotel «boutique» es alojamiento, no una tienda de ropa
      if (c.nombre.startsWith('Hotel')) expect(familiasDelRubro(c.rubro)).toEqual(['alojamiento'])
      const palabrasDelRubro = c.rubro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
      for (const termino of t) {
        const n = termino.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
        expect(n.every((w) => palabrasDelRubro.includes(w)), `«${termino}» no sale del rubro «${c.rubro}»`).toBe(true)
      }
    })
  }
})

describe('plan del día y brazos: cada cliente pide solo lo que tiene y todo lo omitido se dice', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}`, async () => {
      const t = tablasDe(c)
      const p = await rutaDescubrir(montar(t).deps, { client_id: c.id, dry_run: true, ...WF })
      expect(p.status).toBe(200)
      const plan = p.body.plan as { hacer: Array<{ fuente: string; params: Record<string, unknown> }>; no_cubiertas: Array<{ fuente: string }>; costo_maximo_del_plan_usd: number }
      const fuentes = plan.hacer.map((a) => a.fuente)
      expect(fuentes.includes('instagram')).toBe(!!c.ig)
      expect(fuentes.includes('sitio')).toBe(!!c.web)
      // Mapas por la CIUDAD de cada sede (nunca por la clave de la sede: «norte», «centro»)
      const mapas = plan.hacer.find((a) => a.fuente === 'mapas')
      if (c.sedes.length) {
        const buscadas = (mapas?.params.searchStringsArray as string[] | undefined) ?? []
        const ciudades = [...new Set(c.sedes.map((s) => s.ciudad.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))]
        for (const q of buscadas) expect(ciudades.some((ci) => q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().endsWith(ci))).toBe(true)
        expect(buscadas.length).toBe(Math.min(3, ciudades.length))
        if (ciudades.length > 3) expect(plan.no_cubiertas.some((n) => n.fuente === 'mapas')).toBe(true)
      } else expect(mapas).toBeUndefined()
      // 31-oct «guardar todo»: el sitio propio entero (hasta 200 páginas) tiene un máximo de US$ 1,50; lo demás sigue por debajo de US$ 0,5
      const sitioPlan = plan.hacer.find((a) => a.fuente === 'sitio')
      if (sitioPlan) expect(sitioPlan.params).toMatchObject({ maxCrawlPages: 200, maxCrawlDepth: 10 })
      expect(plan.costo_maximo_del_plan_usd - (sitioPlan ? 1.5 : 0)).toBeLessThan(0.5)
      // los brazos, todos encendidos y en seco, no rompen y no gastan
      const b = await correrBrazos({ db: crearBaseFalsa(tablasDe(c) as never).db, brazos: { ...BRAZOS_APAGADOS, contexto: true, demanda: true, competencia: true, propios: true }, cliente: t.clients[0], client_id: c.id, filas: [], ahora: AHORA, dry_run: true, env: {}, fetch: async () => { throw new Error('sin red') } })
      expect(b.errores).toEqual([])
      expect(b.por_brazo.contexto?.estado).toBe('listo')
      expect(b.costo_modelo_usd ?? 0).toBe(0)
    })
  }
})

describe('orden de ejecución del plan: la posición por sede y la competencia no quedan al final (el flujo omite «por tiempo» lo último)', () => {
  const MIERCOLES = new Date('2026-10-14T15:00:00Z')
  for (const c of DIEZ_CLIENTES.filter((x) => x.sedes.length && x.compitePorCercania)) {
    it(`${tuteoYVoseo(c)}`, async () => {
      const t = tablasDe(c)
      ;(t.clients[0].config as Record<string, unknown>).apify = { ...(t.clients[0].config as { apify: object }).apify, competitor_list: [{ name: 'Competidor Uno', website: 'https://uno.example', instagram: 'unocompetidor', competitor_type: 'direct' }] }
      const m = montar(t, { ahora: MIERCOLES })
      const p = await rutaDescubrir({ ...m.deps, brazos: { ...BRAZOS_APAGADOS, demanda: true, competencia: true } } as never, { client_id: c.id, dry_run: true, ...WF })
      const fuentes = ((p.body.plan as { hacer: Array<{ fuente: string }> }).hacer).map((a) => a.fuente)
      const i = (f: string) => fuentes.indexOf(f)
      expect(i('demanda'), fuentes.join(',')).toBeGreaterThan(-1)
      for (const ultima of ['prensa', 'resenas', 'videos', 'menciones', 'busqueda_propuesta']) if (i(ultima) >= 0) expect(i('demanda')).toBeLessThan(i(ultima))
      // y lo propio sigue primero
      for (const propia of ['sitio', 'instagram', 'mapas']) if (i(propia) >= 0) expect(i(propia)).toBeLessThan(i('demanda'))
    })
  }
})

describe('ventas del punto de venta: el mes, el día y la hora son los del CLIENTE', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}: la hora local sale de su zona (declarada o de su país)`, () => {
      const d = desfaseDelCliente(tablasDe(c).clients[0], AHORA)
      expect(d.horas).toBe(c.desfase)
      expect(d.origen).not.toBe('sin_dato')
    })
  }
  it('sin zona declarada ni país de zona única se lee en UTC y se DICE (no se asume la de Ecuador)', async () => {
    expect(desfaseDelCliente({ country: 'México', config: {} }, AHORA)).toMatchObject({ horas: 0, origen: 'sin_dato' })
    const recibo = { receipt_type: 'SALE', total_money: 10, created_at: '2026-10-10T02:30:00Z', line_items: [{ item_name: 'X', quantity: 1, total_money: 10 }] }
    const fetch: Fetch = async () => ({ ok: true, status: 200, json: async () => ({ receipts: [recibo] }) })
    const mes = async (c: ClienteSintetico) => {
      const t = tablasDe(c)
      ;(t.clients[0].config as { apify: Record<string, unknown> }).apify.punto_de_venta = 'loyverse'
      const r = await brazoDePropios({ client_id: c.id, slug: 'x', config: t.clients[0].config, ahora: AHORA, env: { CLIENTE_X_LOYVERSE_TOKEN: 'llave-falsa' }, fetch, desfaseHoras: desfaseDelCliente(t.clients[0], AHORA).horas })
      return String(r.fichas.find((f) => String(f.atributo).startsWith('metrica:loyverse:dias_y_horas:2026-10'))?.contenido)
    }
    // un recibo a las 02:30 UTC: en Colombia (UTC−5) son las 21:00 del día anterior; en España (UTC+2) son las 04:00
    expect(await mes(DIEZ_CLIENTES.find((c) => c.iso === 'co')!)).toMatch(/21:00/)
    expect(await mes(DIEZ_CLIENTES.find((c) => c.iso === 'es')!)).toMatch(/04:00/)
  })
  it('de punta a punta por los brazos: cada cliente archiva sus ventas en SU hora (Colombia 21:00, España 04:00) y, sin zona declarada, lo dice', async () => {
    const recibo = { receipt_type: 'SALE', total_money: 10, created_at: '2026-10-10T02:30:00Z', line_items: [{ item_name: 'X', quantity: 1, total_money: 10 }] }
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({ receipts: [recibo] }) })
    const horas = async (c: ClienteSintetico, sinZona = false) => {
      const t = tablasDe(c)
      if (sinZona) (t.clients[0] as Record<string, unknown>).config = { registro: c.voz }
      else (t.clients[0].config as { apify: Record<string, unknown> }).apify.punto_de_venta = 'loyverse'
      const r = await correrBrazos({ db: crearBaseFalsa(t as never).db, brazos: { ...BRAZOS_APAGADOS, propios: true }, cliente: t.clients[0], client_id: c.id, filas: [], ahora: AHORA, dry_run: false, env: { [`CLIENTE_${String(t.clients[0].slug).toUpperCase().replace(/-/g, '_')}_LOYVERSE_TOKEN`]: 'llave-falsa' }, fetch })
      return { texto: String(t.cerebro_fichas.find((f) => String(f.atributo).startsWith('metrica:loyverse:dias_y_horas:2026-10'))?.contenido), declarado: r.por_brazo.propios?.declarado.join(' ') ?? '' }
    }
    expect((await horas(DIEZ_CLIENTES.find((c) => c.iso === 'co' && c.nombre.startsWith('Farmacia'))!)).texto).toMatch(/21:00/)
    expect((await horas(DIEZ_CLIENTES.find((c) => c.iso === 'es')!)).texto).toMatch(/04:00/)
    const sinZona = await horas(DIEZ_CLIENTES.find((c) => c.iso === 'es')!, true)
    expect(sinZona.texto).toMatch(/02:00/) // UTC, no la hora de Ecuador
    expect(sinZona.declarado).toMatch(/zona horaria del cliente no está declarada/)
  })
  it('P3 · el punto de venta es un dato: «otro» manda al importador de CSV, «ninguno» no pide llave, y sin dato se pide la de Loyverse diciendo cómo declarar otro', async () => {
    const corre = async (pdv?: string) => (await brazoDePropios({ client_id: DIEZ_CLIENTES[0].id, slug: 'cliente-x', config: { apify: pdv ? { punto_de_venta: pdv } : {} }, ahora: AHORA, env: {}, fetch: async () => { throw new Error('sin red') } })).declarado.join(' | ')
    expect(await corre('otro')).toMatch(/distinto de Loyverse.*importador de exportaciones \(CSV/)
    expect(await corre('otro')).not.toMatch(/LOYVERSE_TOKEN/)
    expect(await corre('ninguno')).toMatch(/el cliente no tiene/)
    expect(await corre('ninguno')).not.toMatch(/LOYVERSE_TOKEN/)
    expect(await corre('loyverse')).toMatch(/falta CLIENTE_CLIENTE_X_LOYVERSE_TOKEN \(el cliente usa Loyverse\)/)
    expect(await corre()).toMatch(/si el cliente no usa Loyverse, dilo en config\.apify\.punto_de_venta/)
    // y la tienda en línea de la muestra ya lo declara
    expect(((tablasDe(DIEZ_CLIENTES.find((c) => c.pos === 'otro')!).clients[0].config as { apify: { punto_de_venta?: string } }).apify.punto_de_venta)).toBe('otro')
  })
  it('un cliente sin punto de venta Loyverse (otro sistema o ninguno) no rompe: se DICE y sigue', async () => {
    for (const c of DIEZ_CLIENTES.filter((x) => x.pos !== 'loyverse')) {
      const r = await brazoDePropios({ client_id: c.id, slug: 'sin-llave', config: {}, ahora: AHORA, env: {}, fetch: async () => { throw new Error('sin red') } })
      expect(r.estado).toBe('sin_material')
      expect(r.declarado.join(' ')).toMatch(/falta CLIENTE_SIN_LLAVE_LOYVERSE_TOKEN/)
    }
  })
})

describe('resumen vivo, auditoría y vigilante con cada cliente', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}`, async () => {
      const t = tablasDe(c)
      const r = await alimentar(t, c)
      expect(r.errores).toEqual([])
      const base = crearBaseFalsa(t as never)
      const ent = await cargarEntradaDelResumen(base.db as never, { client_id: c.id, nombre: c.nombre, rubro: c.rubro, ahora: AHORA, zonas: [], sedes: c.sedes.map((s) => ({ clave: s.clave, ciudad: s.ciudad })) })
      expect(ent.ok).toBe(true)
      if (!ent.ok) return
      const res = armarResumen(ent.entrada)
      expect(res.texto).toContain(`Quién es · ${c.nombre}`)
      // ningún texto fijo de otro rubro: sin punto de venta no hay sección de ventas
      expect(/Ventas del punto de venta/.test(res.texto)).toBe(false)
      expect(res.texto).not.toMatch(/ceviche|encebollado|mariscos/i)
      // el vigilante: sin problemas de «no pude comprobar» (columnas, puente, auditoría)
      const dia = AHORA.toISOString().slice(0, 10)
      const ev = await evaluarCliente({ ...montar(t).deps, db: crearBaseFalsa(t as never).db } as never, { client_id: c.id, nombre: c.nombre }, { alimentar: { ok: true } }, AHORA, dia, { sinGasto: true })
      expect(ev.r.problemas.filter((p) => /no pude comprobar/.test(p)), JSON.stringify(ev.r.problemas)).toEqual([])
    })
  }
})

describe('pedido libre de una oficina', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${tuteoYVoseo(c)}: en seco responde sin gastar y sin inventar`, async () => {
      const t = { ...tablasDe(c), agents: [{ name: 'planning-director' }], cerebro_pedidos: [] as Array<Record<string, unknown>> } as T
      const m = montar(t)
      const r = await rutaPedido({ ...m.deps, activo: true, nuevoId: () => crypto.randomUUID() } as never, { client_id: c.id, dry_run: true, ...WF, pedido_por: { oficina: 'estrategia', agente: 'planning-director' }, para: 'precios vigentes', huecos: [{ objetivo: 'precios vigentes' }] })
      expect(r.status).toBeLessThan(500)
      expect(JSON.stringify(r.body)).not.toMatch(/n[aá]ufrago/i)
      expect((t as unknown as T).costs ?? []).toHaveLength(0)
    })
  }
})

describe('los diez juntos: quién es cliente activo y quién no corrió hoy', () => {
  const juntos = (): T => {
    const out: T = {}
    for (const c of DIEZ_CLIENTES) for (const [k, v] of Object.entries(tablasDe(c))) (out[k] ??= []).push(...v)
    return out
  }
  it('los diez tienen manual y plan: los diez son clientes activos (un cliente sin manual se excluye con su motivo)', async () => {
    const t = juntos()
    t.clients.push({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Sin manual', config: {} })
    const r = await clientesActivos(crearBaseFalsa(t as never).db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos.clientes.map((x) => x.client_id).sort()).toEqual(DIEZ_CLIENTES.map((x) => x.id).sort())
    expect(r.datos.excluidos).toEqual([{ client_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', motivos: expect.arrayContaining(['sin manual de marca']) }])
  })
  it('«no corrió»: nueve corrieron hoy y uno no; solo ese se avisa, con su nombre', async () => {
    const t = juntos()
    const dia = AHORA.toISOString().slice(0, 10)
    const faltante = DIEZ_CLIENTES[6]
    for (const c of DIEZ_CLIENTES.filter((x) => x.id !== faltante.id)) t.cerebro_portero_corridas.push({ id: `r-${c.id}`, client_id: c.id, dia, estado: 'hecha', resumen: {} })
    const avisos: string[] = []
    const r = await rutaNoCorrio({ ...montar(t).deps, db: crearBaseFalsa(t as never).db, estadoDelFlujo: async () => ({ ok: true, activo: true }), avisar: async (x) => { avisos.push(x); return { ok: true, detalle: 'entregado' } } }, { dry_run: false })
    const v = r.body.clientes as Array<{ client_id: string; veredicto: string }>
    expect(v.filter((x) => x.veredicto === 'corrio')).toHaveLength(9)
    expect(v.filter((x) => x.veredicto === 'no_corrio').map((x) => x.client_id)).toEqual([faltante.id])
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain(faltante.nombre)
  })
})

describe('escala: la base devuelve como mucho 1.000 filas y el cerebro no se confunde', () => {
  const c = DIEZ_CLIENTES[1]
  // nombres sin dígitos (la clave de un precio ignora los números): 1400 → «bebaa»
  const nombre = (i: number) => String(i).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
  const unaFicha = (i: number): Record<string, unknown> => ({ id: `f-${String(i).padStart(5, '0')}`, client_id: c.id, ref: `portero:sitio:${i}`, clase: 'precio', titulo: `sitio · precio:producto ${nombre(i)}`, contenido: `producto ${nombre(i)} $ ${i}`, atributo: `precio:producto ${nombre(i)}`, origen: 'su_fuente', propiedad: 'propia', descartada: false, retirada_en: null, prueba: false, creado_en: '2026-10-01T00:00:00Z', observado_en: '2026-10-01T00:00:00Z', huella: `h${i}`, provenance_tag: {} })
  it('con 1.500 fichas vivas, un precio que cambia reemplaza a SU ficha (no se duplica) aunque esté pasada la fila 1.000', async () => {
    const t = tablasDe(c)
    t.cerebro_fichas = Array.from({ length: 1500 }, (_, i) => unaFicha(i))
    t.apify_raw = [{ id: 'w', client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: AHORA.toISOString(), respuesta: [{ url: `${c.web}/`, text: `Producto ${nombre(1400)} $ 9999` }] }]
    const llamarModelo = async (_i: string, m: string) => ({ texto: JSON.stringify({ decisiones: [{ n: Number(/^\[(\d+)\]/m.exec(m)?.[1] ?? 1), decision: 'reemplaza', reemplaza_ficha: 'f-01400', cita: `producto ${nombre(1400)}`, razon: 'cambió' }] }), costo_usd: 0, tokens_entrada: 1, tokens_salida: 1 })
    const r = await alimentarCliente({ db: crearBaseFalsa(t as never, { topeDeFilas: 1000 }).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, llamarModelo, ...WF })
    expect(r.errores).toEqual([])
    expect(r.plan?.resumen.reemplaza).toBe(1)
    expect((t.cerebro_fichas.find((f) => f.id === 'f-01400') as Record<string, unknown>).retirada_en).toBeTruthy()
  })
  it('el puente no saca trozos de fichas que sí existen cuando hay más de 1.000', async () => {
    const t = tablasDe(c)
    t.cerebro_fichas = Array.from({ length: 1500 }, (_, i) => unaFicha(i))
    t.client_brain_chunks = Array.from({ length: 1500 }, (_, i) => ({ id: `c${i}`, client_id: c.id, source_table: 'cerebro_fichas', source_id: `f-${String(i).padStart(5, '0')}` }))
    const m = montar(t as never)
    const base = crearBaseFalsa(t as never, { topeDeFilas: 1000 })
    const r = await reconciliarYEnviar({ ...m.deps, db: base.db } as never, c.id, true)
    expect(r.errores).toEqual([])
    expect(r.puente).toMatchObject({ a_sacar: 0, pendientes: 0 })
  })
})
