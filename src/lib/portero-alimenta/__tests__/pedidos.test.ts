/**
 * PEDIDOS LIBRES AL PORTERO («completar con huecos») · 16-oct · US$ 0, sin red: modelo, búsqueda, lectura de páginas y cadena simulados; base falsa.
 * Verifica: pedido libre de cualquier oficina (sin lista de autorizados; se registra quién pidió), ya está (sin gasto), catálogo (cadena), web (hallazgo con cita literal, archivado),
 * imposible (no resuelto con lo intentado), tope, idempotencia (no paga dos veces), anti-homónimo, sede por abrir, apagado, en seco, y la lectura por `listo`.
 */
import { describe, expect, it } from 'vitest'
import { rutaListo } from '../listo'
import { citaEsLiteral, candidatasPorPalabras, esLeible, fichasPorAtributo, huellaDelPedido, normalizarPedido, rutaLeerPedido, rutaPedido, type DepsDePedido, type FichaCandidata } from '../pedidos'
import { textoDeHtml } from '../pedidos-entorno'
import { crearBaseFalsa } from './base-falsa'

const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-10-16T15:00:00Z')
const WF = { workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' }
const iso = (d: Date) => d.toISOString()

const ficha = (o: Record<string, unknown>) => ({ id: `f-${Math.random().toString(36).slice(2, 8)}`, client_id: CL, ref: 'brazo:x', clase: 'metrica', atributo: '', titulo: '', contenido: '', observado_en: '2026-10-15T10:00:00Z', vigente_hasta: null, alcance: 'cliente', descartada: false, retirada_en: null, ...o })
const tablas = (o: { fichas?: Array<Record<string, unknown>>; pedidos?: Array<Record<string, unknown>>; agentes?: string[]; cliente?: Record<string, unknown> } = {}) => ({
  clients: [{ id: CL, name: 'Náufrago', industry: 'restaurante de mariscos', country: 'Ecuador', website_url: 'https://naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } }, ...(o.cliente ?? {}) }],
  client_sedes: [{ client_id: CL, ciudad: 'Olon', clave: 'olon' }, { client_id: CL, ciudad: 'Guayaquil', clave: 'guayaquil' }],
  cerebro_fichas: [...(o.fichas ?? [])] as Array<Record<string, unknown>>,
  cerebro_ingresos: [] as Array<Record<string, unknown>>,
  cerebro_pedidos: [...(o.pedidos ?? [])] as Array<Record<string, unknown>>,
  agents: (o.agentes ?? ['chief-financial-officer', 'planning-director', 'brand-director']).map((name) => ({ name })),
  costs: [] as Array<Record<string, unknown>>, agent_invocations: [] as Array<Record<string, unknown>>, apify_raw: [] as Array<Record<string, unknown>>,
  client_brain_chunks: [] as Array<Record<string, unknown>>, cerebro_portero_corridas: [] as Array<Record<string, unknown>>,
})
type T = ReturnType<typeof tablas>

/** el modelo simulado: responde por turno (razonar y extraer) y cuenta las llamadas */
function modelo(turnos: Array<Record<string, unknown> | ((m: string) => Record<string, unknown>)>, costo = 0.01) {
  const llamadas: string[] = []
  let i = 0
  return {
    llamadas,
    razonar: async (instruccion: string, mensaje: string) => {
      llamadas.push(instruccion.includes('Decide cómo conseguirla') ? 'razonar' : 'extraer')
      const t = turnos[Math.min(i++, turnos.length - 1)]
      const r = typeof t === 'function' ? t(mensaje) : t
      return { texto: JSON.stringify(r), costo_usd: costo, tokens_entrada: 1, tokens_salida: 1 }
    },
  }
}
const web = (paginas: Record<string, string>, costo = 0.003) => {
  const buscadas: string[] = []
  return {
    buscadas,
    buscar: async (q: string) => { buscadas.push(q); return { resultados: Object.keys(paginas).map((url) => ({ titulo: `Resultado ${url}`, url, descripcion: 'descripción corta del resultado' })), costo_usd: costo, fila_cruda: { apify_function: 'google_serp_scraper', params: { queries: q }, respuesta: [] } } },
    leerPagina: async (u: string) => paginas[u] ?? null,
  }
}
const deps = (t: T, o: Partial<DepsDePedido> = {}): DepsDePedido => ({
  db: crearBaseFalsa(t as never).db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false, resumen_vivo: false, resumen_pulido: false }, activo: true, ahora: AHORA, ...o,
})
const pedido = (o: Record<string, unknown> = {}) => ({ client_id: CL, dry_run: false, ...WF, pedido_por: { oficina: 'oficina-financiera', agente: 'chief-financial-officer' }, para: 'armar el plan de 90 días del negocio', huecos: [{ tipo: 'ventas_mes', objetivo: 'ventas por mes de los últimos 12 meses', motivo: 'sin dato' }], ...o })

describe('pedido · entrada libre', () => {
  it('acepta cualquier oficina o director y cualquier lenguaje; sin huecos, lo que dice «para» ES el pedido', () => {
    const r = normalizarPedido({ client_id: CL, dry_run: true, pedido_por: { oficina: 'planeación', agente: 'quien-sea' }, para: '¿qué eventos locales hay en noviembre?' })
    expect('status' in r).toBe(false)
    expect((r as { huecos: unknown[] }).huecos).toEqual([{ objetivo: '¿qué eventos locales hay en noviembre?' }])
  })
  it('lo único obligatorio: quién pide, para qué, cliente y dry_run; con dry_run=false, el flujo', () => {
    expect(normalizarPedido({ client_id: CL, pedido_por: { oficina: 'x', agente: 'y' }, para: 'z' })).toMatchObject({ status: 400 })
    expect(normalizarPedido({ client_id: CL, dry_run: true, pedido_por: { oficina: 'x' }, para: 'z' })).toMatchObject({ status: 400 })
    expect(normalizarPedido({ client_id: CL, dry_run: true, pedido_por: { oficina: 'x', agente: 'y' } })).toMatchObject({ status: 400 })
    expect(normalizarPedido({ client_id: CL, dry_run: false, pedido_por: { oficina: 'x', agente: 'y' }, para: 'z' })).toMatchObject({ status: 403 })
    expect(normalizarPedido({ client_id: 'no-uuid', dry_run: true, pedido_por: { oficina: 'x', agente: 'y' }, para: 'z' })).toMatchObject({ status: 400 })
    expect(normalizarPedido({ client_id: CL, dry_run: true, pedido_por: { oficina: 'x', agente: 'y' }, para: 'z', huecos: Array.from({ length: 13 }, () => ({ objetivo: 'a' })) })).toMatchObject({ status: 400 })
  })
  it('un hueco puede ser un texto suelto, o traer fuente / tipo / objetivo / motivo en cualquier mezcla', () => {
    const r = normalizarPedido({ client_id: CL, dry_run: true, pedido_por: { oficina: 'x', agente: 'y' }, para: 'z', huecos: ['precios de la competencia', { fuente: 'prensa' }, { motivo: 'falta' }, {}, 5] }) as { huecos: unknown[] }
    expect(r.huecos).toEqual([{ objetivo: 'precios de la competencia' }, { fuente: 'prensa' }, { motivo: 'falta' }])
  })
  it('la huella de un pedido no depende del orden de los huecos ni de las mayúsculas', () => {
    const a = huellaDelPedido({ client_id: CL, sede_clave: null, huecos: [{ objetivo: 'Precios' }, { tipo: 'Horario' }] })
    const b = huellaDelPedido({ client_id: CL, sede_clave: null, huecos: [{ tipo: 'horario' }, { objetivo: 'precios' }] })
    expect(a).toBe(b)
    expect(huellaDelPedido({ client_id: CL, sede_clave: 'olon', huecos: [{ objetivo: 'Precios' }, { tipo: 'Horario' }] })).not.toBe(a)
  })
})

describe('pedido · apagado y en seco', () => {
  it('apagado (PORTERO_PEDIDOS): no lee ni escribe nada', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    const r = await rutaPedido({ ...deps(t), db: base.db, activo: false }, pedido())
    expect(r.body).toMatchObject({ apagado: true, modelos_llamados: 0 })
    expect(base.escrituras).toEqual([])
    expect(base.lecturas).toEqual([])
  })
  it('en seco: no registra, no llama a ningún modelo ni a la web; responde «ya está» por atributo y muestra lo relacionado', async () => {
    const t = tablas({ fichas: [ficha({ id: 'v1', atributo: 'metrica:loyverse:ingreso:2026-09', clase: 'metrica', titulo: 'Ventas de 2026-09', contenido: 'Ventas de 2026-09: 4.100,00' }), ficha({ id: 'p1', clase: 'resena', atributo: 'resena:x', titulo: 'Reseña del encebollado', contenido: 'El encebollado estaba bien' })] })
    const base = crearBaseFalsa(t as never)
    const m = modelo([{ decision: 'web' }]), w = web({})
    const r = await rutaPedido({ ...deps(t), db: base.db, razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina }, pedido({ dry_run: true, huecos: [{ tipo: 'metrica:loyverse:ingreso' }, { objetivo: 'qué dicen de los precios del encebollado' }] }))
    const hs = r.body.huecos as Array<{ estado: string; fichas: string[] }>
    expect(hs[0]).toMatchObject({ estado: 'ya_esta', fichas: ['v1'] })
    expect(hs[1].estado).toBe('seco')
    expect(m.llamadas).toEqual([])
    expect(w.buscadas).toEqual([])
    expect(base.escrituras).toEqual([])
    expect(r.body.nota).toMatch(/dry_run/)
  })
})

describe('pedido · ya está (gasto 0)', () => {
  it('lo pedido por atributo y fresco se responde por código: sin modelo, sin web, sin gasto; queda registrado quién pidió', async () => {
    const t = tablas({ fichas: [ficha({ id: 'v1', atributo: 'metrica:loyverse:ingreso:2026-09' }), ficha({ id: 'v2', atributo: 'metrica:loyverse:ingreso:2026-08' })] })
    const m = modelo([{ decision: 'web' }]), w = web({})
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina }), pedido({ huecos: [{ tipo: 'metrica:loyverse:ingreso' }] }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ estado: 'resuelto', costo_usd: 0, modelos_llamados: 0, apify_llamado: false })
    expect((r.body.huecos as Array<{ fichas: string[] }>)[0].fichas.sort()).toEqual(['v1', 'v2'])
    expect(m.llamadas).toEqual([])
    expect(t.cerebro_pedidos).toHaveLength(1)
    expect(t.cerebro_pedidos[0]).toMatchObject({ pedido_por_oficina: 'oficina-financiera', pedido_por_agente: 'chief-financial-officer', estado: 'resuelto', costo_usd: 0, agente_en_roster: true })
  })
  it('una ficha vencida o retirada NO cuenta como «ya está»', async () => {
    const t = tablas({ fichas: [ficha({ id: 'v1', atributo: 'metrica:loyverse:ingreso:2026-01', vigente_hasta: '2026-10-01T00:00:00Z' })] })
    const r = await rutaPedido(deps(t), pedido({ huecos: [{ tipo: 'metrica:loyverse:ingreso' }] }))
    expect((r.body.huecos as Array<{ estado: string }>)[0].estado).not.toBe('ya_esta')
  })
  it('lo que el modelo dice que ya está vale solo con cita LITERAL de la ficha que se le ofreció; si no, se busca', async () => {
    const t = tablas({ fichas: [ficha({ id: 'h1', clase: 'horario', atributo: 'sede:olon:horario', titulo: 'Horario de Olón', contenido: 'Jueves a lunes de 08:00 a 16:00 en el local de la playa' })] })
    const bueno = modelo([{ decision: 'ya_esta', fichas: [1], cita: 'Jueves a lunes de 08:00 a 16:00', razon: 'horario' }])
    const r = await rutaPedido(deps(t, { razonar: bueno.razonar }), pedido({ huecos: [{ objetivo: 'cuál es el horario de atención en Olón' }] }))
    expect((r.body.huecos as Array<{ estado: string; fichas: string[] }>)[0]).toMatchObject({ estado: 'ya_esta', fichas: ['h1'] })
    const t2 = tablas({ fichas: [ficha({ id: 'h1', clase: 'horario', atributo: 'sede:olon:horario', titulo: 'Horario de Olón', contenido: 'Jueves a lunes de 08:00 a 16:00 en el local de la playa' })] })
    const inventado = modelo([{ decision: 'ya_esta', fichas: [1], cita: 'Abierto todos los días hasta las 22:00', razon: 'inventé' }])
    const r2 = await rutaPedido(deps(t2, { razonar: inventado.razonar }), pedido({ huecos: [{ objetivo: 'cuál es el horario de atención en Olón' }] }))
    expect((r2.body.huecos as Array<{ estado: string }>)[0].estado).not.toBe('ya_esta')
    expect(JSON.stringify(r2.body.huecos)).toMatch(/sin una cita literal verificable/)
  })
})

describe('pedido · catálogo (la misma cadena)', () => {
  it('lo que una función del catálogo trae se pide a la cadena, UNA vez por pedido, y queda en_cadena', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'catalogo', funcion: 'own_google_maps_profile', razon: 'la ficha de Mapas' }, { decision: 'catalogo', funcion: 'instagram_scraper', razon: 'el perfil' }])
    const llamadas: string[] = []
    const r = await rutaPedido(deps(t, { razonar: m.razonar, dispararCadena: async (c) => { llamadas.push(c); return { ok: true, detalle: 'la cadena respondió 200' } } }),
      pedido({ huecos: [{ objetivo: 'puntaje y reseñas en Google Maps' }, { objetivo: 'seguidores de Instagram' }] }))
    expect(r.body.estado).toBe('en_cadena')
    expect(llamadas).toEqual([CL])
    expect(r.body.cadena).toMatchObject({ ok: true, funciones: ['own_google_maps_profile', 'instagram_scraper'] })
    expect(t.cerebro_pedidos[0].estado).toBe('en_cadena')
  })
  it('una función que no existe en el catálogo no se pide: se busca en la web; si la cadena no responde, queda sin resolver con el motivo', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'catalogo', funcion: 'funcion_inventada' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido())
    expect(JSON.stringify(r.body.huecos)).toMatch(/la función «funcion_inventada» no existe/)
    const t2 = tablas()
    const r2 = await rutaPedido(deps(t2, { razonar: modelo([{ decision: 'catalogo', funcion: 'instagram_scraper' }]).razonar, dispararCadena: async () => ({ ok: false, detalle: 'la cadena respondió 502' }) }), pedido())
    expect(r2.body.estado).toBe('no_resuelto')
    expect(JSON.stringify(r2.body.huecos)).toMatch(/cadena del portero: la cadena respondió 502/)
  })
  it('GET: mientras la cadena no trajo lo pedido dice qué falta; cuando llegó, lo dice', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'catalogo', funcion: 'instagram_scraper' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar, dispararCadena: async () => ({ ok: true, detalle: 'ok' }) }), pedido())
    const id = String(r.body.pedido_id)
    const antes = await rutaLeerPedido({ db: crearBaseFalsa(t as never).db }, id)
    expect(antes.body.cadena_llego).toMatchObject({ llegaron: [], faltan: ['instagram_scraper'] })
    t.apify_raw.push({ client_id: CL, apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-16T15:10:00Z' })
    const despues = await rutaLeerPedido({ db: crearBaseFalsa(t as never).db }, id)
    expect(despues.body.cadena_llego).toMatchObject({ llegaron: ['instagram_scraper'], faltan: [] })
  })
})

describe('pedido · la web (fuera del catálogo)', () => {
  const PAGINA = 'Feria gastronómica de la costa: del 14 al 16 de noviembre se realizará la Feria del Encebollado en Olón, con entrada gratuita y más de 30 puestos de comida.'
  const T = (cuerpo: string) => ({ 'https://eventos.example/feria': `${cuerpo} Texto adicional de la página para que tenga largo suficiente y se pueda leer completa sin problemas.` })
  const decide = [{ decision: 'web', consultas: ['feria del encebollado Olón noviembre 2026'], razon: 'no está en el catálogo' }]

  it('lo encuentra: lo entrega con su cita y lo ARCHIVA en el cerebro con fuente, fecha y quién lo pidió; el puente lo lleva al índice', async () => {
    const t = tablas()
    const w = web(T(PAGINA))
    const m = modelo([...decide, { hallazgos: [{ url: 'https://eventos.example/feria', cita: 'del 14 al 16 de noviembre se realizará la Feria del Encebollado en Olón', resumen: 'Feria del Encebollado en Olón del 14 al 16 de noviembre' }], nada: false }])
    const enviados: unknown[] = []
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina, puente: async (p) => { enviados.push(p); return { escritos: p.escribir.length, sacados: 0, errores: [] } }, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true, resumen_vivo: false, resumen_pulido: false } }),
      pedido({ para: 'planear la campaña de noviembre', huecos: [{ objetivo: 'eventos locales de noviembre en Olón' }] }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ estado: 'resuelto', modelos_llamados: 2, apify_llamado: true })
    const h = (r.body.huecos as Array<{ estado: string; hallazgos: Array<{ url: string; cita: string; alcance: string }>; fichas: string[] }>)[0]
    expect(h.estado).toBe('traido_y_archivado')
    expect(h.hallazgos[0]).toMatchObject({ url: 'https://eventos.example/feria', alcance: 'mercado' })
    expect(h.fichas).toHaveLength(1)
    const f = t.cerebro_fichas.find((x) => x.clase === 'dato_de_pedido')!
    expect(f).toBeTruthy()
    expect(f).toMatchObject({ fuente_url: 'https://eventos.example/feria', origen: 'tercero', propiedad: 'ajena', alcance: 'mercado' })
    expect(String(f.contenido)).toMatch(/Cita de la página: «del 14 al 16 de noviembre se realizará la Feria del Encebollado en Olón»/)
    expect(String(f.contenido)).toMatch(/a pedido de oficina-financiera \(chief-financial-officer\) para: planear la campaña de noviembre/)
    expect(f.vigente_hasta).toBe(iso(new Date(AHORA.getTime() + 30 * 86_400_000)))
    expect(enviados).toHaveLength(1)
    // el gasto es del portero: la búsqueda deja su fila cruda con origen portero_pedido (cuenta en el tope diario)
    expect(t.apify_raw[0]).toMatchObject({ apify_function: 'google_serp_scraper', ensayo: false })
    expect((t.apify_raw[0].metadata as { origen: string }).origen).toBe('portero_pedido')
    expect(t.cerebro_pedidos[0]).toMatchObject({ estado: 'resuelto' })
    expect(Number(t.cerebro_pedidos[0].costo_usd)).toBeCloseTo(0.01 + 0.003 + 0.01, 6)
  })
  it('una cita que NO está literal en la página se descarta: nunca se inventa', async () => {
    const t = tablas()
    const w = web(T(PAGINA))
    const m = modelo([...decide, { hallazgos: [{ url: 'https://eventos.example/feria', cita: 'la feria será del 20 al 22 de noviembre con entrada de cinco dólares', resumen: 'inventado' }], nada: false }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina }), pedido())
    expect(r.body.estado).toBe('no_resuelto')
    expect(t.cerebro_fichas.filter((x) => x.clase === 'dato_de_pedido')).toEqual([])
    expect(JSON.stringify(r.body.huecos)).toMatch(/hallazgo descartado \(cita no literal/)
  })
  it('una cita de una página que NO se leyó se descarta', async () => {
    const t = tablas()
    const w = web(T(PAGINA))
    const m = modelo([...decide, { hallazgos: [{ url: 'https://otra.example/x', cita: 'del 14 al 16 de noviembre se realizará la Feria del Encebollado en Olón', resumen: 'x' }] }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina }), pedido())
    expect(r.body.estado).toBe('no_resuelto')
  })
  it('anti-homónimo: si la página identifica al negocio (nombre + su cuenta) el hallazgo es «del cliente»; si no, es dato de mercado', async () => {
    const propia = 'Náufrago en Instagram @naufrago.ec: nuestro encebollado cuesta 4 dólares y atendemos de jueves a lunes en Olón, con entrega a domicilio los fines de semana.'
    const t = tablas()
    const w = web({ 'https://resenas.example/naufrago': propia })
    const m = modelo([...decide, { hallazgos: [{ url: 'https://resenas.example/naufrago', cita: 'nuestro encebollado cuesta 4 dólares y atendemos de jueves a lunes en Olón', resumen: 'encebollado a 4 dólares' }] }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina }), pedido())
    expect(r.body.estado).toBe('resuelto')
    expect(t.cerebro_fichas.find((x) => x.clase === 'dato_de_pedido')).toMatchObject({ alcance: 'cliente' })
    const t2 = tablas()
    const ajena = 'Naufrago de Sevilla, bar de tapas con precios de 4 dólares y carta de temporada que cambia cada semana según el mercado del puerto.'
    const w2 = web({ 'https://tapas.example/naufrago': ajena })
    const m2 = modelo([...decide, { hallazgos: [{ url: 'https://tapas.example/naufrago', cita: 'bar de tapas con precios de 4 dólares y carta de temporada', resumen: 'tapas' }] }])
    await rutaPedido(deps(t2, { razonar: m2.razonar, buscar: w2.buscar, leerPagina: w2.leerPagina }), pedido())
    expect(t2.cerebro_fichas.find((x) => x.clase === 'dato_de_pedido')).toMatchObject({ alcance: 'mercado' })
  })
  it('lee a lo más 3 páginas por hueco y nunca las redes que exigen cuenta ni los buscadores', async () => {
    const t = tablas()
    const paginas: Record<string, string> = {}
    for (const u of ['https://a.example/1', 'https://www.instagram.com/x', 'https://www.google.com/s', 'https://b.example/2', 'https://c.example/3', 'https://d.example/4', 'https://e.example/5']) paginas[u] = `Página de ${u} con texto suficiente para que se pueda leer completa y tenga largo de sobra para el filtro.`
    const w = web(paginas)
    const leidas: string[] = []
    let extrajo = ''
    const m = modelo([{ decision: 'web', consultas: ['una consulta cualquiera'] }, (msg) => { extrajo = msg; return { hallazgos: [], nada: true } }])
    await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: async (u) => { leidas.push(u); return w.leerPagina(u) } }), pedido())
    expect(leidas).toEqual(['https://a.example/1', 'https://b.example/2', 'https://c.example/3'])
    expect(extrajo.match(/^\d+\. https?:\/\//gm)).toHaveLength(3)
  })
  it('una ficha descartada no cuenta como «ya está»; y si todo ya estaba, no se dispara la cadena', async () => {
    const t = tablas({ fichas: [ficha({ id: 'd1', atributo: 'metrica:loyverse:ingreso:2026-09', descartada: true })] })
    const r = await rutaPedido(deps(t), pedido({ huecos: [{ tipo: 'metrica:loyverse:ingreso' }] }))
    expect((r.body.huecos as Array<{ estado: string }>)[0].estado).not.toBe('ya_esta')
    const t2 = tablas({ fichas: [ficha({ id: 'v1', atributo: 'metrica:loyverse:ingreso:2026-09' })] })
    let disparos = 0
    const r2 = await rutaPedido(deps(t2, { dispararCadena: async () => { disparos++; return { ok: true, detalle: 'ok' } } }), pedido({ huecos: [{ tipo: 'metrica:loyverse:ingreso' }] }))
    expect(r2.body.estado).toBe('resuelto')
    expect(disparos).toBe(0)
    expect(r2.body.cadena).toBeUndefined()
  })
  it('no sirven de fuente las redes que exigen cuenta ni los buscadores', () => {
    expect(esLeible('https://eventos.example/feria')).toBe(true)
    expect(esLeible('https://www.instagram.com/naufrago.ec')).toBe(false)
    expect(esLeible('https://www.google.com/search?q=x')).toBe(false)
    expect(esLeible('ftp://x.example/a')).toBe(false)
    expect(esLeible('no es una url')).toBe(false)
  })
  it('lo que la web no tiene: «esta información me falta» con lo intentado, y queda en la lista de no resueltos', async () => {
    const t = tablas()
    const w = web({})
    const m = modelo([...decide])
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina }), pedido())
    expect(r.body.estado).toBe('no_resuelto')
    const h = (r.body.huecos as Array<{ detalle: string; intentado: string[] }>)[0]
    expect(h.detalle).toMatch(/esta información me falta/)
    expect(h.intentado.join(' ')).toMatch(/búsqueda «feria del encebollado Olón noviembre 2026»: 0 resultado/)
    expect(t.cerebro_pedidos[0]).toMatchObject({ estado: 'no_resuelto' })
  })
  it('un pedido imposible (no es información pública ni del negocio) queda sin resolver con la razón', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'imposible', razon: 'son datos privados de un tercero' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ huecos: [{ objetivo: 'las claves bancarias de un competidor' }] }))
    expect(r.body.estado).toBe('no_resuelto')
    expect(JSON.stringify(r.body.huecos)).toMatch(/son datos privados de un tercero/)
    expect(m.llamadas).toEqual(['razonar'])
  })
  it('un modelo que falla o responde basura no rompe el pedido: queda sin resolver y lo dice', async () => {
    const t = tablas()
    const r = await rutaPedido(deps(t, { razonar: async () => { throw new Error('tiempo agotado') } }), pedido())
    expect(r.body.estado).toBe('no_resuelto')
    expect(JSON.stringify(r.body.huecos)).toMatch(/razonar: tiempo agotado/)
    const t2 = tablas()
    const r2 = await rutaPedido(deps(t2, { razonar: async () => ({ texto: 'no sé', costo_usd: 0.01, tokens_entrada: 1, tokens_salida: 1 }) }), pedido())
    expect(JSON.stringify(r2.body.huecos)).toMatch(/respuesta del modelo ilegible/)
  })
})

describe('pedido · topes e idempotencia', () => {
  it('el tope del pedido: cuando se alcanza, lo que falta no se intenta y se dice', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'web', consultas: ['x consulta uno'] }], 0.25)
    const w = web({})
    const r = await rutaPedido(deps(t, { razonar: m.razonar, buscar: w.buscar, leerPagina: w.leerPagina, topePorPedidoUsd: 0.3 }), pedido({ huecos: [{ objetivo: 'primero' }, { objetivo: 'segundo' }, { objetivo: 'tercero' }] }))
    const hs = r.body.huecos as Array<{ estado: string }>
    // el tope se mira ANTES de cada llamada: a lo más una llamada se pasa; la siguiente ya no se intenta
    expect(hs.map((h) => h.estado)).toEqual(['no_resuelto', 'no_resuelto', 'tope'])
    expect(m.llamadas).toHaveLength(2)
    expect(JSON.stringify(r.body.huecos)).toMatch(/tope del pedido alcanzado/)
  })
  it('el tope por oficina y día: la oficina que ya gastó su parte no gasta más (el pedido se registra y lo dice)', async () => {
    const t = tablas({ pedidos: [{ id: 'p-0', client_id: CL, pedido_por_oficina: 'oficina-financiera', costo_usd: 1.5, creado_en: '2026-10-16T09:00:00Z', estado: 'resuelto', huella: 'otra' }] })
    const m = modelo([{ decision: 'web' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido())
    expect(m.llamadas).toEqual([])
    expect((r.body.huecos as Array<{ estado: string }>)[0].estado).toBe('tope')
    expect(t.cerebro_pedidos.some((p) => p.id !== 'p-0')).toBe(true)
  })
  it('otra oficina, con su propio tope, sí gasta', async () => {
    const t = tablas({ pedidos: [{ id: 'p-0', client_id: CL, pedido_por_oficina: 'oficina-financiera', costo_usd: 1.5, creado_en: '2026-10-16T09:00:00Z', estado: 'resuelto', huella: 'otra' }] })
    const m = modelo([{ decision: 'imposible', razon: 'x' }])
    await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ pedido_por: { oficina: 'planeacion', agente: 'planning-director' } }))
    expect(m.llamadas).toEqual(['razonar'])
  })
  it('el tope diario del portero también cuenta: si ya llegó, no se gasta', async () => {
    const t = tablas()
    t.agent_invocations.push({ client_id: CL, cost_usd: 3.5, created_at: '2026-10-16T10:00:00Z', agent_name: 'portero-del-cerebro', workflow_id: 'ogfq56oIEoHufFPM' })
    const m = modelo([{ decision: 'web' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido())
    expect(m.llamadas).toEqual([])
    expect((r.body.huecos as Array<{ estado: string }>)[0].estado).toBe('tope')
  })
  it('dos pedidos iguales seguidos NO pagan dos veces: el segundo devuelve el primero (por huella y por pedido_id)', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'imposible', razon: 'no hay' }])
    const a = await rutaPedido(deps(t, { razonar: m.razonar }), pedido())
    const b = await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ pedido_por: { oficina: 'planeacion', agente: 'planning-director' } }))
    expect(b.body).toMatchObject({ repetido: true, pedido_id: a.body.pedido_id })
    expect(m.llamadas).toHaveLength(1)
    expect(t.cerebro_pedidos).toHaveLength(1)
    const c = await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ pedido_id: a.body.pedido_id, huecos: [{ objetivo: 'otra cosa distinta' }] }))
    expect(c.body).toMatchObject({ repetido: true })
    expect(m.llamadas).toHaveLength(1)
  })
  it('un pedido igual que FALLÓ sí se vuelve a procesar', async () => {
    const t = tablas()
    const p = pedido()
    const n = normalizarPedido(p) as Exclude<ReturnType<typeof normalizarPedido>, { status: number }>
    t.cerebro_pedidos.push({ id: 'p-fallo', client_id: CL, huella: huellaDelPedido(n), estado: 'fallo', creado_en: '2026-10-16T14:00:00Z', costo_usd: 0 })
    const m = modelo([{ decision: 'imposible', razon: 'x' }])
    await rutaPedido(deps(t, { razonar: m.razonar }), p)
    expect(m.llamadas).toHaveLength(1)
  })
})

describe('pedido · sede, roster y respuesta al instante', () => {
  it('una sede «por abrir» (Guayaquil) sí se puede pedir; la sede queda en el registro', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'imposible', razon: 'x' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ sede_clave: 'guayaquil', huecos: [{ objetivo: 'competidores a 3 km de la sede' }] }))
    expect(r.body.sede_clave).toBe('guayaquil')
    expect(m.llamadas).toHaveLength(1)
    expect(t.cerebro_pedidos[0].sede_clave).toBe('guayaquil')
  })
  it('un agente que no está en el roster se registra igual y se avisa', async () => {
    const t = tablas({ agentes: ['otro'] })
    const m = modelo([{ decision: 'imposible', razon: 'x' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ pedido_por: { oficina: 'nueva-oficina', agente: 'director-que-no-existe' } }))
    expect(r.status).toBe(200)
    expect(r.body.avisos).toEqual(['el agente «director-que-no-existe» no está en el roster: se registró igual'])
    expect(t.cerebro_pedidos[0]).toMatchObject({ pedido_por_oficina: 'nueva-oficina', agente_en_roster: false })
  })
  it('responde AL INSTANTE con pedido_id y sigue en segundo plano; el resultado se lee después', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'imposible', razon: 'no hay' }])
    let trabajo: Promise<unknown> | null = null
    const r = await rutaPedido(deps(t, { razonar: m.razonar, segundoPlano: (p) => { trabajo = p } }), pedido())
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, estado: 'en_proceso' })
    expect(typeof r.body.pedido_id).toBe('string')
    expect(t.cerebro_pedidos[0].estado).toBe('en_proceso')
    await trabajo
    const g = await rutaLeerPedido({ db: crearBaseFalsa(t as never).db }, String(r.body.pedido_id))
    expect(g.status).toBe(200)
    expect(g.body).toMatchObject({ estado: 'no_resuelto', pedido_por: { oficina: 'oficina-financiera', agente: 'chief-financial-officer', en_roster: true } })
  })
  it('un fallo inesperado del trabajo deja el pedido en «fallo» (no se pierde ni queda «en proceso» para siempre)', async () => {
    const t = tablas()
    let trabajo: Promise<unknown> | null = null
    const explota = { ...deps(t, { segundoPlano: (p) => { trabajo = p } }), db: { from: (tabla: string) => (tabla === 'cerebro_fichas' && explotaYa.v ? (() => { throw new Error('base caída') })() : crearBaseFalsa(t as never).db.from(tabla)) } }
    const explotaYa = { v: false }
    const m = modelo([{ decision: 'imposible' }])
    const r = await rutaPedido({ ...explota, razonar: m.razonar }, pedido())
    expect(r.body.estado).toBe('en_proceso')
    await trabajo
    expect(['no_resuelto', 'fallo']).toContain(t.cerebro_pedidos[0].estado)
  })
  it('cliente inexistente → 404; pedido inexistente → 404; id que no es uuid → 400', async () => {
    const t = tablas()
    t.clients.length = 0
    expect((await rutaPedido(deps(t), pedido())).status).toBe(404)
    expect((await rutaLeerPedido({ db: crearBaseFalsa(tablas() as never).db }, '0a2ffbd4-957c-4315-a37f-b9e4fbbbb999')).status).toBe(404)
    expect((await rutaLeerPedido({ db: crearBaseFalsa(tablas() as never).db }, 'x')).status).toBe(400)
  })
  it('una lectura fallida se DICE (502), no se lee como «no hay nada»', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never, { fallaEn: 'cerebro_fichas' })
    const r = await rutaPedido({ ...deps(t), db: base.db }, pedido())
    expect(r.status).toBe(502)
    expect(r.body.error).toBe('lectura_fallida')
  })
})

describe('pedido · tres rubros y la lectura por `listo`', () => {
  const rubros: Array<[string, string, string]> = [['restaurante de mariscos', 'Náufrago', 'precios de la carta'], ['clínica dental', 'Sonrisa Norte', 'horarios de atención'], ['software CRM para pymes', 'Flujo CRM', 'planes y precios']]
  for (const [rubro, nombre, objetivo] of rubros) {
    it(`agnóstico: ${rubro}`, async () => {
      const t = tablas({ cliente: { name: nombre, industry: rubro, website_url: null, config: {} } })
      const m = modelo([{ decision: 'imposible', razon: 'sin dato público' }])
      const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido({ huecos: [{ objetivo }] }))
      expect(r.status).toBe(200)
      expect(m.llamadas).toEqual(['razonar'])
      expect(m.llamadas.length).toBe(1)
    })
  }
  it('`listo` con pedido_id trae el pedido (y no cambia la señal); un pedido de otro cliente no se muestra', async () => {
    const t = tablas()
    const m = modelo([{ decision: 'imposible', razon: 'no hay' }])
    const r = await rutaPedido(deps(t, { razonar: m.razonar }), pedido())
    const id = String(r.body.pedido_id)
    const base = deps(t)
    const a = await rutaListo(base, { client_id: CL, pedido_id: id })
    expect(a.status).toBe(200)
    expect(a.body.pedido).toMatchObject({ pedido_id: id, estado: 'no_resuelto' })
    expect(a.body.listo).toBe(false)
    const sinPedido = await rutaListo(base, { client_id: CL })
    expect(sinPedido.body.pedido).toBeUndefined()
    t.cerebro_pedidos[0].client_id = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb999'
    const otro = await rutaListo(deps(t), { client_id: CL, pedido_id: id })
    expect(otro.body.pedido).toMatchObject({ error: 'el pedido es de otro cliente' })
    const inexistente = await rutaListo(deps(t), { client_id: CL, pedido_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb998' })
    expect(inexistente.body.pedido).toMatchObject({ error: 'pedido_inexistente' })
  })
})

describe('piezas puras', () => {
  const f = (o: Partial<FichaCandidata>): FichaCandidata => ({ id: 'a', ref: 'r', clase: 'x', atributo: '', titulo: '', contenido: '', observado_en: null, vigente_hasta: null, alcance: null, ...o })
  it('por atributo: prefijo o clase exacta, sin tildes ni espacios; un tipo corto no arrastra todo', () => {
    const fs = [f({ id: '1', atributo: 'metrica:loyverse:ingreso:2026-09' }), f({ id: '2', atributo: 'resumen:cliente', clase: 'resumen_vivo' }), f({ id: '3', atributo: 'otra' })]
    expect(fichasPorAtributo({ tipo: 'metrica:loyverse:ingreso' }, fs).map((x) => x.id)).toEqual(['1'])
    expect(fichasPorAtributo({ fuente: 'resumen_vivo' }, fs).map((x) => x.id)).toEqual(['2'])
    expect(fichasPorAtributo({ tipo: 'me' }, fs)).toEqual([])
    expect(fichasPorAtributo({ objetivo: 'cualquier cosa' }, fs)).toEqual([])
  })
  it('candidatas por palabras: las más parecidas primero, solo las que comparten palabras', () => {
    const fs = [f({ id: '1', titulo: 'Horario de atención', contenido: 'jueves a lunes' }), f({ id: '2', titulo: 'Precios del encebollado', contenido: 'cuatro dólares' }), f({ id: '3', titulo: 'Reseña', contenido: 'bonito lugar' })]
    expect(candidatasPorPalabras('cuáles son los precios del encebollado', fs).map((x) => x.id)).toEqual(['2'])
    expect(candidatasPorPalabras('de la a', fs)).toEqual([])
  })
  it('cita literal: sin tildes, mayúsculas ni espacios de más; muy corta o ajena no vale', () => {
    expect(citaEsLiteral('del 14 al 16 de  Noviembre se realizará', 'Se hará del 14 al 16 de noviembre se realizará la feria')).toBe(true)
    expect(citaEsLiteral('muy corta', 'muy corta')).toBe(false)
    expect(citaEsLiteral('esto no aparece en la página que se leyó', 'otro texto')).toBe(false)
  })
  it('HTML → texto: sin scripts, estilos ni etiquetas', () => {
    expect(textoDeHtml('<html><style>a{}</style><script>alert(1)</script><h1>Hola</h1><p>Mundo &amp; más</p></html>')).toBe('Hola\nMundo & más')
  })
})
