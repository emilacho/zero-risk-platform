/** Librerías puras del portero que alimenta: datos, horario, metadata del sitio, filtro, juez, archivo, plan, gasto y propuestas. Clientes INVENTADOS de otros rubros (tuteo y voseo). US$ 0. */
import { describe, expect, it } from 'vitest'
import { clasificarLinea, compararLineas } from '../../cerebro/diario/comparar'
import { contenidoDeMapas, contenidoDeSitio, huellaDeMapas, lineasDeTexto } from '../../cerebro/diario/huella'
import { varianteDelCliente, transitoriosDe, interruptoresDelEntorno, TOPE_DEL_PORTERO_USD } from '../datos'
import { horarioCanonico } from '../horario'
import { lineasDeMetadata } from '../sitio-metadata'
import { filtrarUnidad, segundasSenales, type ContextoDelCliente } from '../filtro'
import { aplicarGuardas, citaEsLiteral, juzgar, type ItemParaJuzgar } from '../juez'
import { planDeArchivo } from '../archivar'
import { descubrir, articulosParaLeer, ACTOR_DE_MENCIONES } from '../plan'
import { COSTO_MAXIMO_POR_FUNCION, gastoDelDia } from '../gasto'
import { validarBusquedas } from '../propuestas'
import { claveDeAtributo, huellaDeTexto, unidadesDeRaspados, type Unidad } from '../unidades'

const TODO_APAGADO = { alimentar: false, proponer_busquedas: false, menciones: false, puente_al_indice: false }
const TODO_ENCENDIDO = { alimentar: true, proponer_busquedas: true, menciones: true, puente_al_indice: true }

describe('los cuatro defectos medidos el 14-oct', () => {
  it('1 · el orden de los días no es un cambio de horario (Mapas 12-oct)', () => {
    const a = [{ day: 'domingo', hours: '8 AM to 4 PM' }, { day: 'lunes', hours: '8 AM to 4 PM' }, { day: 'martes', hours: 'Cerrado' }]
    const b = [{ day: 'lunes', hours: '8 AM to 4 PM' }, { day: 'martes', hours: 'Cerrado' }, { day: 'domingo', hours: '8 AM to 4 PM' }]
    expect(horarioCanonico(a)).toBe(horarioCanonico(b))
    expect(huellaDeMapas(contenidoDeMapas({ title: 'X', openingHours: a }))).toBe(huellaDeMapas(contenidoDeMapas({ title: 'X', openingHours: b })))
    // y una franja distinta SÍ cambia
    const c = [{ day: 'lunes', hours: '8 AM to 5 PM' }, { day: 'martes', hours: 'Cerrado' }, { day: 'domingo', hours: '8 AM to 4 PM' }]
    expect(horarioCanonico(c)).not.toBe(horarioCanonico(b))
    // dos franjas el mismo día en otro orden tampoco es un cambio
    const m1 = [{ day: 'lunes', hours: '8 AM to 12 PM' }, { day: 'lunes', hours: '2 PM to 6 PM' }]
    const m2 = [{ day: 'lunes', hours: '2 PM to 6 PM' }, { day: 'lunes', hours: '8 AM to 12 PM' }]
    expect(horarioCanonico(m1)).toBe(horarioCanonico(m2))
  })
  it('2 · el menú del sitio hecho con JavaScript se lee desde `metadata` (JSON-LD)', () => {
    const metadata = { description: 'Clases de yoga para todos los niveles', jsonLd: [[{ '@type': 'LocalBusiness', name: 'Casa Luna', telephone: '+598 99 123 456', hasMenu: { '@type': 'Menu', hasMenuSection: [{ '@type': 'MenuSection', hasMenuItem: [{ '@type': 'MenuItem', name: 'Clase suelta', offers: { '@type': 'Offer', price: '650', priceCurrency: 'UYU' } }] }] } }]] }
    const l = lineasDeMetadata(metadata)
    expect(l).toContain('producto clase suelta precio 650 uyu')
    const c = contenidoDeSitio([{ url: 'https://x.example/', text: 'Casa Luna' }], undefined, metadata)
    expect(c.lineas).toContain('producto clase suelta precio 650 uyu')
    expect(clasificarLinea('producto clase suelta precio 650 uyu')).toBe('precio')
  })
  it('3 · una moneda sin «$» (ARS, UYU, EUR, S/) es precio', () => {
    expect(clasificarLinea('cambio de aceite ars 52 000')).toBe('precio')
    expect(clasificarLinea('mensualidad uyu 2 400')).toBe('precio')
    const euro = lineasDeTexto('Clase suelta 8 € por persona').duraderas
    expect(clasificarLinea(euro[0])).toBe('precio')
    const sol = lineasDeTexto('Corte de pelo S/ 25 todos los días').duraderas
    expect(clasificarLinea(sol[0])).toBe('precio')
    expect(clasificarLinea('atendemos con cita previa por whatsapp')).toBe('texto')
  })
  it('4 · avisos en voseo son transitorios para el cliente de voseo; el tuteo es la variante por omisión', () => {
    expect(varianteDelCliente({})).toBe('es_tuteo')
    expect(varianteDelCliente({ pais: 'Ecuador' })).toBe('es_tuteo')
    expect(varianteDelCliente({ pais: 'Argentina' })).toBe('es_voseo')
    expect(varianteDelCliente({ pais: 'UY' })).toBe('es_voseo')
    expect(varianteDelCliente({ pais: 'Argentina', registro: 'tuteo' })).toBe('es_tuteo')
    const vos = transitoriosDe('es_voseo')
    const tu = transitoriosDe('es_tuteo')
    const aviso = 'estamos cerrados hasta manana volve a partir de las 9'
    expect(vos.some((r) => r.test(aviso))).toBe(true)
    expect(tu.some((r) => r.test(aviso))).toBe(false)
    expect(tu.some((r) => r.test('hoy no abrimos volvemos manana'))).toBe(true)
    const d = compararLineas(['abrimos de lunes a sabado de 9 a 18 hs'], ['abrimos de lunes a sabado de 9 a 18 hs', aviso], vos)
    expect(d.nuevas.find((x) => x.linea === aviso)?.clase).toBe('transitorio')
  })
})

describe('datos', () => {
  it('el tope del portero es US$ 1,50 (firma 14-oct) y todos los interruptores nacen apagados', () => {
    expect(TOPE_DEL_PORTERO_USD).toBe(1.5)
    expect(interruptoresDelEntorno({})).toEqual(TODO_APAGADO)
    expect(interruptoresDelEntorno({ PORTERO_ALIMENTAR: 'on' }).alimentar).toBe(true)
    expect(interruptoresDelEntorno({ PORTERO_ALIMENTAR: 'true' }).alimentar).toBe(false)
  })
})

const ctx: ContextoDelCliente = { nombre: 'Casa Yoga Luna', ubicacion: ['Montevideo'], handles: ['casayogaluna'], dominios: ['casayogaluna.example'], telefonos: ['+598 99 123 456'] }
const unidad = (o: Partial<Unidad>): Unidad => ({ fuente: 'articulo', ref: 'https://prensa.example/a', unidad_ref: 'u1', texto: 'x', clase_dato: 'acumula', atributo: null, autoria: 'tercero', huella: 'h1', fecha_fuente: null, apify_raw_id: 'raw1', observado_en: '2026-10-15T10:00:00.000Z', ...o })

describe('filtro «es el cliente y es nuevo»', () => {
  const vacias = new Set<string>()
  it('lo propio ya viene confirmado; lo repetido y lo transitorio no se juzgan', () => {
    expect(filtrarUnidad(unidad({ autoria: 'propia', fuente: 'sitio', texto: 'clase de prueba gratis para nuevos alumnos' }), ctx, vacias).estado).toBe('propio')
    const u = unidad({ autoria: 'propia', fuente: 'sitio', texto: 'clase de prueba gratis para nuevos alumnos', huella: 'hh', unidad_ref: 'l1' })
    expect(filtrarUnidad(u, ctx, new Set([`sitio|l1|hh`])).estado).toBe('repetida')
    expect(filtrarUnidad(unidad({ autoria: 'propia', fuente: 'sitio', texto: 'cerrado vuelve hoy a las 8am' }), ctx, vacias).estado).toBe('ruido')
  })
  it('un tercero necesita el nombre ENTERO y una segunda señal; solo el nombre es «sin confirmar»', () => {
    const conCiudad = unidad({ texto: 'La escuela Casa Yoga Luna de Montevideo abrió un nuevo salón con clases para principiantes' })
    expect(filtrarUnidad(conCiudad, ctx, vacias).estado).toBe('propio')
    const soloNombre = unidad({ texto: 'Casa Yoga Luna fue elegida por una revista de turismo en un listado nacional de estudios' })
    expect(filtrarUnidad(soloNombre, ctx, vacias).estado).toBe('sin_confirmar')
    const otro = unidad({ texto: 'Yoga Luna Nueva abrió su sede en otra ciudad con precios de promoción lanzamiento' })
    expect(filtrarUnidad(otro, ctx, vacias).estado).toBe('ajeno')
    expect(segundasSenales('escribenos a hola@casayogaluna.example', ctx)).toContain('dominio casayogaluna.example')
    expect(segundasSenales('llámanos al 099 123 456', ctx)).toContain('teléfono propio')
  })
  it('un texto corto de un tercero no vale la pena', () => {
    expect(filtrarUnidad(unidad({ texto: 'Casa Yoga Luna' }), ctx, vacias).estado).toBe('ruido')
  })
})

const item = (o: Partial<ItemParaJuzgar> = {}): ItemParaJuzgar => ({ n: 1, unidad_clave: 'sitio|l', fuente: 'sitio', autoria: 'propia', clase_dato: 'atributo', atributo: 'precio:clase suelta', texto: 'clase suelta uyu 650', fecha: '2026-10-15', vigente: { ficha_id: 'F-OLD', texto: 'clase suelta uyu 600', fecha: '2026-10-01', atributo: 'precio:clase suelta' }, ...o })
const resp = (o: unknown) => JSON.stringify({ decisiones: [o] })

describe('el juez · las guardas las hace cumplir el código', () => {
  it('reemplaza válido: apunta a la vigente ofrecida y cita literal', () => {
    const [d] = aplicarGuardas([item()], resp({ n: 1, decision: 'reemplaza', reemplaza_ficha: 'F-OLD', cita: 'clase suelta uyu 650', razon: 'subió el precio' }))
    expect(d).toMatchObject({ decision: 'reemplaza', reemplaza_ficha: 'F-OLD', decidido_por: 'modelo' })
  })
  it('apunta a una ficha que no es la vigente ofrecida ⇒ suma (nunca reemplaza otra ficha, ni de otro cliente)', () => {
    const [d] = aplicarGuardas([item()], resp({ n: 1, decision: 'reemplaza', reemplaza_ficha: 'F-DE-OTRO-CLIENTE', cita: 'clase suelta uyu 650', razon: 'x' }))
    expect(d.decision).toBe('suma')
    expect(d.reemplaza_ficha).toBeNull()
    expect(d.degradada_por).toMatch(/no era la vigente/)
  })
  it('una publicación, reseña o mención NUNCA reemplaza: se suma', () => {
    const [d] = aplicarGuardas([item({ clase_dato: 'acumula', atributo: null })], resp({ n: 1, decision: 'reemplaza', reemplaza_ficha: 'F-OLD', cita: 'clase suelta uyu 650', razon: 'x' }))
    expect(d.decision).toBe('suma')
  })
  it('sin vigente no hay qué reemplazar', () => {
    const [d] = aplicarGuardas([item({ vigente: null })], resp({ n: 1, decision: 'reemplaza', reemplaza_ficha: 'F-OLD', cita: 'clase suelta uyu 650', razon: 'x' }))
    expect(d.decision).toBe('suma')
  })
  it('sin cita literal en el texto nuevo ⇒ duda (se archiva incierta y no se entrega)', () => {
    const [d] = aplicarGuardas([item()], resp({ n: 1, decision: 'reemplaza', reemplaza_ficha: 'F-OLD', cita: 'una frase inventada por el modelo', razon: 'x' }))
    expect(d.decision).toBe('duda')
    expect(citaEsLiteral('uyu 650', 'clase suelta uyu 650')).toBe(true)
    expect(citaEsLiteral('uyu 65', 'clase suelta uyu 650')).toBe(false)
    expect(citaEsLiteral(null, 'x')).toBe(false)
  })
  it('«nada» y «duda» respetan lo que dijo el modelo', () => {
    expect(aplicarGuardas([item()], resp({ n: 1, decision: 'nada', cita: 'clase suelta uyu 650', razon: 'mismo dato' }))[0].decision).toBe('nada')
    expect(aplicarGuardas([item()], resp({ n: 1, decision: 'duda', razon: 'no se' }))[0].decision).toBe('duda')
  })
  it('cualquier falla ⇒ SUMA con fecha: jamás se retira nada por un error', () => {
    for (const texto of [null, 'esto no es json', '{"decisiones":"no es lista"}', resp({ n: 1, decision: 'borrar_todo' }), '{"decisiones":[]}']) {
      const [d] = aplicarGuardas([item()], texto)
      expect(d.decision).toBe('suma')
      expect(d.reemplaza_ficha).toBeNull()
      expect(d.decidido_por).toBe('sistema')
    }
  })
  it('juzgar: respeta el tope de llamadas y el de gasto; lo que no cabe se ACUMULA con motivo', async () => {
    const muchos = Array.from({ length: 45 }, (_, i) => item({ n: i + 1, texto: `clase suelta uyu ${650 + i}` }))
    let llamadas = 0
    const llamar = async (_i: string, m: string) => { llamadas++; const ns = [...m.matchAll(/^\[(\d+)\]/gm)].map((x) => Number(x[1])); return { texto: JSON.stringify({ decisiones: ns.map((n) => ({ n, decision: 'nada', cita: 'clase suelta', razon: 'x' })) }), costo_usd: 0.01, tokens_entrada: 1, tokens_salida: 1 } }
    const r = await juzgar(muchos, llamar, { maxLlamadas: 2, topeDeGastoUsd: 1 })
    expect(llamadas).toBe(2)
    expect(r.decisiones).toHaveLength(45)
    expect(r.decisiones.slice(0, 40).every((d) => d.decision === 'nada')).toBe(true)
    expect(r.decisiones.slice(40).every((d) => d.decision === 'suma' && d.degradada_por === 'tope de llamadas del día')).toBe(true)
    expect(r.omitidos_por_tope).toBe(5)
    const sinPlata = await juzgar([item()], llamar, { maxLlamadas: 3, topeDeGastoUsd: 0 })
    expect(sinPlata.llamadas).toBe(0)
    expect(sinPlata.decisiones[0].decision).toBe('suma')
  })
  it('juzgar: una llamada que lanza no tumba nada: todo se suma', async () => {
    const r = await juzgar([item(), item({ n: 2 })], async () => { throw new Error('timeout') }, { maxLlamadas: 3, topeDeGastoUsd: 1 })
    expect(r.decisiones.map((d) => d.decision)).toEqual(['suma', 'suma'])
    expect(r.fallas).toEqual(['timeout'])
  })
})

describe('archivar · nada se borra, todo con fecha y fuente', () => {
  const ahora = new Date('2026-10-15T12:00:00Z')
  let k = 0
  const nuevoId = () => `ficha-${++k}`
  const u = unidad({ fuente: 'sitio', autoria: 'propia', clase_dato: 'atributo', atributo: 'precio:clase suelta', clase_de_linea: 'precio', texto: 'clase suelta uyu 650', huella: 'hh', unidad_ref: 'l1', ref: 'https://casa.example/' })
  it('reemplaza: la vieja queda con su motivo y sale del índice; la nueva trae version_de, fecha y fuente', () => {
    const d = [{ n: 1, decision: 'reemplaza' as const, reemplaza_ficha: 'F-OLD', razon: 'subió', cita: 'uyu 650', decidido_por: 'modelo' as const }]
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: u, item: item() }], decisiones: d, descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId })
    expect(p.fichas).toHaveLength(1)
    expect(p.fichas[0]).toMatchObject({ version_de: 'F-OLD', decision: 'reemplaza', atributo: 'precio:clase suelta', origen: 'su_fuente', propiedad: 'propia', entregable: true, plazo: 'precio_oferta_horario' })
    expect(p.fichas[0].observado_en).toBe(u.observado_en)
    expect(p.fichas[0].provenance_tag).toMatchObject({ trust_level: 'untrusted', respaldo_en: { tabla: 'apify_raw', id: 'raw1' } })
    expect(p.retiros).toEqual([{ id: 'F-OLD', reemplazada_por: p.fichas[0].id, motivo_retirada: expect.stringContaining('reemplazada por') }])
    expect(p.sacar_del_indice).toEqual(['F-OLD'])
    expect(p.puente).toHaveLength(1)
    expect(p.puente[0].metadata).not.toHaveProperty('apify_function') // lo propio llega al corredor
    expect(p.vistas[0]).toMatchObject({ veredicto: 'reemplaza', ficha_id: p.fichas[0].id })
  })
  it('un tercero va al índice marcado como raspado ajeno (el corredor no lo inyecta sin sello)', () => {
    const t = unidad({ fuente: 'resenas', texto: 'muy buena atencion y clases', huella: 'h9', unidad_ref: 'r9' })
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: t, item: item({ clase_dato: 'acumula', atributo: null, autoria: 'tercero' }) }], decisiones: [{ n: 1, decision: 'suma', reemplaza_ficha: null, razon: '', cita: null, decidido_por: 'sistema' }], descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId })
    expect(p.fichas[0]).toMatchObject({ origen: 'tercero', propiedad: 'ajena' })
    expect(p.puente[0].metadata).toHaveProperty('apify_function', 'portero_diario_tercero')
  })
  it('duda y sin_confirmar se archivan INCIERTAS y no se entregan ni van al índice; nada y descartadas solo dejan la huella', () => {
    const p = planDeArchivo({
      client_id: 'C1',
      items: [{ unidad: u, item: item() }, { unidad: unidad({ huella: 'h2', unidad_ref: 'u2' }), item: item() }],
      decisiones: [{ n: 1, decision: 'duda', reemplaza_ficha: null, razon: 'x', cita: null, decidido_por: 'modelo' }, { n: 2, decision: 'nada', reemplaza_ficha: null, razon: 'x', cita: 'x', decidido_por: 'modelo' }],
      descartadas: [{ unidad: unidad({ huella: 'h3', unidad_ref: 'u3' }), estado: 'ajeno', motivo: 'm' }, { unidad: unidad({ huella: 'h4', unidad_ref: 'u4' }), estado: 'repetida', motivo: 'm' }],
      sin_confirmar: [unidad({ huella: 'h5', unidad_ref: 'u5' })], ahora, puente_al_indice: true, nuevoId,
    })
    expect(p.fichas.map((f) => [f.decision, f.propiedad, f.entregable])).toEqual([['duda', 'incierta', false], ['duda', 'incierta', false]])
    expect(p.puente).toHaveLength(0)
    expect(p.retiros).toHaveLength(0)
    expect(p.vistas.map((v) => v.veredicto).sort()).toEqual(['ajeno', 'duda', 'nada', 'repetida', 'sin_confirmar'])
    expect(p.resumen).toMatchObject({ nada: 1, duda: 1, ajenas: 1, repetidas: 1, sin_confirmar: 1 })
  })
  it('sin el interruptor del puente no se arma ningún trozo del índice', () => {
    const d = [{ n: 1, decision: 'suma' as const, reemplaza_ficha: null, razon: '', cita: null, decidido_por: 'sistema' as const }]
    expect(planDeArchivo({ client_id: 'C1', items: [{ unidad: u, item: item() }], decisiones: d, descartadas: [], sin_confirmar: [], ahora, puente_al_indice: false, nuevoId }).puente).toHaveLength(0)
  })
})

describe('descubrir · qué pide hoy el portero', () => {
  const cliente = { id: 'C1', name: 'Casa Yoga Luna', website_url: 'https://casayogaluna.example', config: { apify: { own_handles: { instagram: 'casayogaluna' }, url_reparto: ['https://app.example/luna'] } } }
  const base = { cliente, rubro: 'estudio de yoga y pilates', pais: 'Uruguay', ciudad: 'Montevideo', enlaces: ['https://www.facebook.com/casayogaluna'], redes: { instagram: 'casayogaluna', facebook: 'https://www.facebook.com/casayogaluna', youtube: 'https://www.youtube.com/@luna' }, publicaciones_propias: ['AAA111', 'BBB222'], gastado_hoy_usd: 0, interruptores: TODO_APAGADO }
  it('pide TODO diario: sitio, Instagram, Mapas con ciudad, comentarios, reparto, prensa, videos', () => {
    const p = descubrir(base)
    const fuentes = new Set(p.hacer.map((a) => a.fuente))
    for (const f of ['sitio', 'instagram', 'mapas', 'comentarios', 'reparto', 'prensa']) expect(fuentes.has(f as never)).toBe(true)
    expect(p.hacer.find((a) => a.fuente === 'mapas')?.params).toMatchObject({ searchStringsArray: ['Casa Yoga Luna Montevideo'], maxCrawledPlacesPerSearch: 1, scrapeReviewsPersonalData: false })
    expect(p.hacer.some((a) => a.funcion === 'menciones_en_redes')).toBe(false)
    expect(p.hacer.some((a) => a.fuente === 'busqueda_propuesta')).toBe(false)
    expect(p.tope_usd).toBe(1.5)
    expect(p.costo_maximo_del_plan_usd).toBeLessThanOrEqual(1.5)
    // las reseñas de Mapas salen de la misma corrida de Mapas: no se piden dos veces
    expect(p.hacer.filter((a) => a.funcion === 'resenas_google_maps')).toHaveLength(0)
  })
  it('sin ciudad ni ficha de Mapas NO se busca por nombre (homónimo): queda «no cubierta»', () => {
    const p = descubrir({ ...base, ciudad: '' })
    expect(p.hacer.some((a) => a.fuente === 'mapas')).toBe(false)
    expect(p.hacer.some((a) => a.fuente === 'prensa')).toBe(false)
    expect(p.no_cubiertas.map((n) => n.fuente)).toEqual(expect.arrayContaining(['mapas', 'prensa']))
  })
  it('el tope de US$ 1,50 y el de corridas CORTAN con motivo', () => {
    const casiLleno = descubrir({ ...base, gastado_hoy_usd: 1.45 })
    expect(casiLleno.omitidas.length).toBeGreaterThan(0)
    expect(casiLleno.omitidas.every((o) => /tope/.test(o.por_que))).toBe(true)
    expect(casiLleno.costo_maximo_del_plan_usd + 1.45).toBeLessThanOrEqual(1.5 + 1e-9)
    const lleno = descubrir({ ...base, gastado_hoy_usd: 1.5 })
    expect(lleno.hacer).toHaveLength(0)
  })
  it('las búsquedas propuestas y las menciones solo entran con su interruptor; máximo 3', () => {
    const q = ['"Casa Yoga Luna" Montevideo retiro de yoga', '"Casa Yoga Luna" Montevideo evento', '"Casa Yoga Luna" Montevideo entrevista', '"Casa Yoga Luna" Montevideo premio']
    expect(descubrir({ ...base, busquedas_propuestas: q }).hacer.some((a) => a.fuente === 'busqueda_propuesta')).toBe(false)
    const on = descubrir({ ...base, interruptores: TODO_ENCENDIDO, busquedas_propuestas: q })
    expect(on.hacer.filter((a) => a.fuente === 'busqueda_propuesta')).toHaveLength(3)
    const m = on.hacer.find((a) => a.fuente === 'menciones')
    expect(m?.funcion).toBe(ACTOR_DE_MENCIONES.funcion)
    expect(m?.metadata.target_kind).toBe('third_party')
  })
  it('articulosParaLeer: nunca el sitio propio, ni redes, ni lo ya visto; solo si nombra al cliente; máximo 3', () => {
    const r = articulosParaLeer([
      { url: 'https://casayogaluna.example/blog', title: 'Casa Yoga Luna' },
      { url: 'https://www.instagram.com/p/x', title: 'Casa Yoga Luna' },
      { url: 'https://diario.example/a', title: 'Casa Yoga Luna abre nuevo salón' },
      { url: 'https://diario.example/b', title: 'Otro tema' },
      { url: 'https://revista.example/c', description: 'la escuela Casa Yoga Luna ganó' },
      { url: 'https://vista.example/d', title: 'Casa Yoga Luna' },
      { url: 'https://extra.example/e', title: 'Casa Yoga Luna' },
      { url: 'https://visto.example/f', title: 'Casa Yoga Luna' },
    ], { sitioPropio: 'https://casayogaluna.example', yaVistas: new Set(['https://visto.example/f']), nombreCoincide: (t) => /casa yoga luna/i.test(t) })
    expect(r).toEqual(['https://diario.example/a', 'https://revista.example/c', 'https://vista.example/d'])
  })
})

describe('el libro de costos ya no es ciego', () => {
  const ahora = new Date('2026-10-15T15:00:00Z')
  const fila = (service: string, amount: number | null, es = 'detalle_de_llamada', client = 'C1', created = '2026-10-15T10:30:00Z') => ({ service, amount_usd: amount, created_at: created, description: JSON.stringify({ es, client_id: client }) })
  it('una fila sin importe vale su MÁXIMO declarado; con importe, lo que dice; la reconciliación y otros clientes no cuentan', () => {
    const g = gastoDelDia({
      clientId: 'C1', ahora, invocacionesUsd: [0.006, 0.006],
      libro: [fila('apify:own_google_maps_profile', 0), fila('apify:resenas_google_maps', null), fila('apify:website_content_scraper', 0.0228), fila('apify', 0.82, 'reconciliacion_del_dia'), fila('apify:own_google_maps_profile', 0, 'detalle_de_llamada', 'OTRO'), fila('apify:own_google_maps_profile', 0, 'detalle_de_llamada', 'C1', '2026-10-14T10:30:00Z')],
    })
    expect(g.filas_sin_importe).toBe(2)
    expect(g.estimado_por_maximo_usd).toBeCloseTo(COSTO_MAXIMO_POR_FUNCION.own_google_maps_profile.usd + COSTO_MAXIMO_POR_FUNCION.resenas_google_maps.usd, 6)
    expect(g.apify_usd).toBeCloseTo(0.1 + 0.1 + 0.0228, 6)
    expect(g.modelo_usd).toBeCloseTo(0.012, 6)
    expect(g.total_usd).toBeCloseTo(0.2348, 6)
  })
  it('la fila de reconciliación del día de una función NO se suma otra vez, aunque traiga importe', () => {
    const g = gastoDelDia({ clientId: 'C1', ahora, invocacionesUsd: [], libro: [fila('apify:website_content_scraper', 0.5, 'reconciliacion_del_dia'), fila('apify:website_content_scraper', 0.02)] })
    expect(g.apify_usd).toBeCloseTo(0.02, 6)
  })
  it('una función desconocida sin importe vale el máximo por omisión (nunca 0)', () => {
    expect(gastoDelDia({ clientId: 'C1', ahora, invocacionesUsd: [], libro: [fila('apify:funcion_nueva', 0)] }).apify_usd).toBeGreaterThan(0)
  })
})

describe('propuestas de búsqueda', () => {
  const c = { nombre: 'Casa Yoga Luna', ciudad: 'Montevideo', ya_buscadas: ['"Casa Yoga Luna" Montevideo'] }
  const r = (b: unknown) => JSON.stringify({ busquedas: b })
  it('acepta hasta 3 que nombren al cliente y la ciudad; rechaza el resto con motivo', () => {
    const v = validarBusquedas(r([
      { texto: '"Casa Yoga Luna" Montevideo retiros', por_que: 'a' },
      { texto: '"Casa Yoga Luna" Montevideo', por_que: 'repite' },
      { texto: 'mejores estudios de yoga Montevideo', por_que: 'sin nombre' },
      { texto: '"Casa Yoga Luna" Montevideo https://x.example', por_que: 'url' },
      { texto: '"Casa Yoga Luna" Montevideo site:diario.example', por_que: 'operador' },
      { texto: '"Casa Yoga Luna" Montevideo entrevista', por_que: 'b' },
      { texto: '"Casa Yoga Luna" Montevideo premios', por_que: 'c' },
      { texto: '"Casa Yoga Luna" Montevideo eventos', por_que: 'd' },
      { texto: '"Casa Yoga Luna" Montevideo talleres', por_que: 'e' },
    ]), c)
    expect(v.aceptadas.map((x) => x.texto)).toEqual(['"Casa Yoga Luna" Montevideo retiros', '"Casa Yoga Luna" Montevideo entrevista', '"Casa Yoga Luna" Montevideo premios'].slice(0, 3).map((x) => x))
    expect(v.rechazadas.map((x) => x.motivo)).toEqual(expect.arrayContaining(['repite una búsqueda ya hecha', 'no nombra al cliente por su nombre entero', 'trae una dirección, un correo o un teléfono', 'usa operadores de búsqueda']))
  })
  it('un modelo que falla o responde basura no propone nada', () => {
    expect(validarBusquedas(null, c).aceptadas).toEqual([])
    expect(validarBusquedas('hola', c).aceptadas).toEqual([])
  })
})

describe('unidades', () => {
  it('claveDeAtributo: el producto sin cifras ni monedas; lo que no es precio/horario no tiene clave', () => {
    expect(claveDeAtributo('limpieza dental $40', 'precio')).toBe('precio:limpieza dental')
    expect(claveDeAtributo('cambio de aceite ars 52 000', 'precio')).toBe('precio:cambio aceite')
    expect(claveDeAtributo('aceptamos tarjetas', 'texto')).toBeNull()
    expect(huellaDeTexto('Hola  MUNDO') ).toBe(huellaDeTexto('hola mundo'))
  })
  it('instagram: la bio es atributo, las publicaciones acumulan; los ensayos jamás entran', () => {
    const filas = [
      { id: 'r1', apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-15T10:00:00Z', respuesta: [{ username: 'casayogaluna', biography: 'Yoga para todos', latestPosts: [{ shortCode: 'AAA', caption: 'Clase nueva los martes', ownerUsername: 'casayogaluna' }] }] },
      { id: 'r2', apify_function: 'instagram_scraper', ensayo: true, created_at: '2026-10-15T11:00:00Z', respuesta: [{ username: 'casayogaluna', biography: 'ENSAYO INVENTADO', latestPosts: [] }] },
      { id: 'r3', apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-15T09:00:00Z', respuesta: [{ username: 'otra_cuenta', biography: 'No es del cliente', latestPosts: [] }] },
    ]
    const us = unidadesDeRaspados(filas, { propios: { sitio: null, handles: ['casayogaluna'] } })
    expect(us.map((x) => `${x.unidad_ref}:${x.clase_dato}`).sort()).toEqual(['AAA:acumula', 'bio:atributo'])
    expect(us.every((x) => x.autoria === 'propia')).toBe(true)
  })
})
