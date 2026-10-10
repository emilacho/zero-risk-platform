/** Librerías puras del diario: huella, comparar, reseñas, topes, limpieza, cruce, oportunidades y plan de ampliación. Cliente SINTÉTICO de otro rubro. */
import { describe, expect, it } from 'vitest'
import { avisosDePiezas } from '../avisar'
import { clasificarLinea, compararLineas, decidir, resumirDiferencia } from '../comparar'
import { contenidoDeInstagram, contenidoDeMapas, contenidoDeSitio, esTransitoria, huellaDeInstagram, huellaDeLineas, huellaDeMapas, lineasDeTexto, TRANSITORIOS_ES } from '../huella'
import { planDeLimpieza, provenanceDeSintesis } from '../ordenar'
import { planDeAmpliacion, COSTO_MAXIMO_USD } from '../plan'
import { oportunidadDeComentarios, oportunidadDeResenas, oportunidadesDeCambios } from '../preparar'
import { frasePorSenales, senalesDeComentarios, senalesDeResenas } from '../resenas'
import { decidirGasto, recortarAlTope, TOPE_DIARIO_POR_CLIENTE_USD } from '../topes'

describe('huella', () => {
  it('las líneas de estado son transitorias y no cuentan; el orden de las líneas tampoco', () => {
    const a = lineasDeTexto('Servicio de limpieza dental completa\nCerrado, vuelve hoy 9am\nCita previa por WhatsApp siempre')
    expect(a.transitorias).toEqual(['cerrado vuelve hoy 9am'])
    const b = lineasDeTexto('Cita previa por WhatsApp siempre\nAbierto ahora hasta las 6pm\nServicio de limpieza dental completa')
    expect(huellaDeLineas(a.duraderas)).toBe(huellaDeLineas(b.duraderas))
    expect(huellaDeLineas(a.duraderas)).not.toBe(huellaDeLineas([...a.duraderas, 'una linea nueva de verdad']))
  })
  it('los patrones de transitorios son un DATO y se pueden ampliar sin tocar la lógica', () => {
    expect(esTransitoria('promocion de la semana termina hoy')).toBe(false)
    expect(esTransitoria('promocion de la semana termina hoy', [...TRANSITORIOS_ES, /termina hoy$/])).toBe(true)
  })
  it('las líneas muy cortas y repetidas no cuentan', () => {
    expect(lineasDeTexto('hola\nhola\nMenu del dia con precios claros\nMenu del dia con precios claros').duraderas).toEqual(['menu del dia con precios claros'])
  })
  it('Instagram: solo biografía y leyendas PROPIAS; contadores, vistas y publicaciones de otros no entran; el orden de las publicaciones no importa', () => {
    const base = { username: 'Clinica_X', biography: 'Sonrisas sin miedo', latestPosts: [{ shortCode: 'B', caption: 'Segunda', ownerUsername: 'clinica_x', likesCount: 5 }, { shortCode: 'A', caption: 'Primera', ownerUsername: 'clinica_x', likesCount: 9 }, { shortCode: 'Z', caption: 'Ajena', ownerUsername: 'otra' }] }
    const h1 = huellaDeInstagram(contenidoDeInstagram(base))
    const h2 = huellaDeInstagram(contenidoDeInstagram({ ...base, followersCount: 999, latestPosts: [...base.latestPosts].reverse().map((p) => ({ ...p, likesCount: 1000, commentsCount: 3 })) }))
    expect(h1).toBe(h2)
    expect(contenidoDeInstagram(base).publicaciones.map((p) => p.id)).toEqual(['A', 'B'])
    expect(huellaDeInstagram(contenidoDeInstagram({ ...base, biography: 'Sonrisas con miedo' }))).not.toBe(h1)
  })
  it('Mapas: solo la ficha; el puntaje y el conteo de reseñas no cuentan', () => {
    const f = { title: 'Clínica X', address: 'Calle 1', phone: '555', totalScore: 4.8, reviewsCount: 24 }
    expect(huellaDeMapas(contenidoDeMapas(f))).toBe(huellaDeMapas(contenidoDeMapas({ ...f, totalScore: 3.1, reviewsCount: 999 })))
    expect(huellaDeMapas(contenidoDeMapas(f))).not.toBe(huellaDeMapas(contenidoDeMapas({ ...f, address: 'Calle 2' })))
  })
  it('sitio: el texto de varias páginas se une y deduplica', () => {
    expect(contenidoDeSitio([{ url: 'a', text: 'Linea repetida del sitio' }, { url: 'b', text: 'Linea repetida del sitio\nOtra linea distinta aqui' }]).lineas).toHaveLength(2)
  })
})

describe('comparar', () => {
  it('clasifica precio, horario, texto y transitorio', () => {
    expect(clasificarLinea('combo familiar $12 50')).toBe('precio')
    expect(clasificarLinea('atendemos de lunes a viernes de 9am a 6pm')).toBe('horario')
    expect(clasificarLinea('cerrado vuelve hoy 7am')).toBe('transitorio')
    expect(clasificarLinea('conoce nuestro equipo y su historia')).toBe('texto')
  })
  it('sin previa ⇒ nuevo; misma huella ⇒ sin cambio; distinta ⇒ versión nueva con la línea que cambió', () => {
    expect(decidir(null, { huella: 'x', lineas: [] })).toEqual({ accion: 'nuevo' })
    expect(decidir({ id: '1', huella: 'x', lineas: ['a'] }, { huella: 'x', lineas: ['a'] })).toEqual({ accion: 'sin_cambio' })
    const d = decidir({ id: '1', huella: 'x', lineas: ['plato a $5'] }, { huella: 'y', lineas: ['plato a $6'] })
    expect(d.accion).toBe('version_nueva')
    if (d.accion === 'version_nueva') { expect(d.previa_id).toBe('1'); expect(d.diferencia.nuevas).toEqual([{ linea: 'plato a $6', clase: 'precio' }]); expect(d.diferencia.quitadas).toEqual([{ linea: 'plato a $5', clase: 'precio' }]) }
  })
  it('el resumen separa lo transitorio de lo real', () => {
    const r = resumirDiferencia(compararLineas(['cerrado vuelve el lunes 7am'], ['cerrado vuelve hoy 7am', 'combo nuevo $9', 'abrimos los domingos de 10am a 2pm']))
    expect(r.transitorias).toEqual({ nuevas: 1, quitadas: 1 }); expect(r.cambio_real).toEqual({ nuevas: 2, quitadas: 0 }); expect(r.por_clase).toEqual({ precio: 1, horario: 1, texto: 0 })
  })
})

describe('reseñas y comentarios · SOLO señales agregadas (C3)', () => {
  const resenas = [
    ...Array.from({ length: 23 }, (_, i) => ({ stars: 5, text: `Excelente atención número ${i}` })),
    { stars: 1, text: 'Muy lenta la entrega, tardaron demasiado' }, { stars: 2, text: 'La entrega fue lenta otra vez' }, { stars: 1, text: 'Entrega lenta y fría' }, { stars: 2, text: 'Todo bien menos la lentitud' },
  ]
  it('cuenta estrellas y encuentra la queja repetida (≥ 3 reseñas) sin devolver ni un texto', () => {
    const s = senalesDeResenas(resenas)
    expect(s.total).toBe(27); expect(s.por_estrellas['5']).toBe(23); expect(s.por_estrellas['1']).toBe(2)
    expect(s.quejas_repetidas.map((q) => q.termino)).toContain('entrega')
    expect(JSON.stringify(s)).not.toMatch(/Excelente|tardaron|fría/i)
    expect(frasePorSenales(s)).toMatch(/23 de 27 reseñas de 5 estrellas; queja repetida:/)
  })
  it('un término en menos de 3 reseñas no es queja; con 100 reseñas de tope; estrellas inválidas se descartan', () => {
    expect(senalesDeResenas([{ stars: 1, text: 'tardanza' }, { stars: 1, text: 'tardanza' }]).quejas_repetidas).toEqual([])
    const muchas = Array.from({ length: 130 }, () => ({ stars: 5 }))
    const s = senalesDeResenas(muchas); expect(s.total).toBe(100); expect(s.descartadas).toBe(30)
    expect(senalesDeResenas([{ stars: 9 }, { stars: 'x' }, {}]).descartadas).toBe(3)
    expect(senalesDeResenas([]).proporcion_5).toBeNull()
  })
  it('comentarios: temas repetidos, sin texto', () => {
    const s = senalesDeComentarios(['Quiero la promo de verano', 'La promo está genial', 'Dónde está la promo', 'otro', 5, ''])
    expect(s.total).toBe(4); expect(s.temas_repetidos.map((t) => t.termino)).toEqual(['promo'])
    expect(JSON.stringify(s)).not.toMatch(/verano|genial/)
  })
  it('las oportunidades salen agregadas y sin cita; sin datos no hay oportunidad', () => {
    const ahora = new Date('2026-10-10T00:00:00Z')
    const o = oportunidadDeResenas(senalesDeResenas(resenas), ahora)!
    expect(o).toMatchObject({ clase: 'senal_de_resenas', cita: null }); expect(o.dato).not.toMatch(/Excelente/)
    expect(oportunidadDeResenas(senalesDeResenas([]), ahora)).toBeNull()
    expect(oportunidadDeComentarios(senalesDeComentarios([]), ahora)).toBeNull()
    expect(oportunidadDeComentarios(senalesDeComentarios(['hola promo', 'otra promo', 'la promo']), ahora)!.dato).toMatch(/tema repetido: promo/)
  })
})

describe('topes · D-4 US$ 1,00 por cliente y día', () => {
  it('el tope es 1,00 y el corte es exacto: justo en el tope pasa, un poco más no', () => {
    expect(TOPE_DIARIO_POR_CLIENTE_USD).toBe(1)
    expect(decidirGasto(0.9, 0.1).permitido).toBe(true)
    const no = decidirGasto(0.9, 0.100001); expect(no.permitido).toBe(false); expect(no.motivo).toMatch(/no cabe/)
    expect(decidirGasto(1, 0).permitido).toBe(true)
    expect(decidirGasto(Number.NaN, 0.1)).toMatchObject({ permitido: false, motivo: 'gasto_no_medible' })
    expect(decidirGasto(0.2, -1).permitido).toBe(false)
    expect(decidirGasto(2, 0.1).restante_usd).toBe(0)
  })
  it('recortarAlTope deja pasar en orden lo que cabe, dice por qué omite y limita a 4 corridas', () => {
    const r = recortarAlTope([{ usd_max: 0.5, n: 1 }, { usd_max: 0.4, n: 2 }, { usd_max: 0.2, n: 3 }, { usd_max: 0.05, n: 4 }], 0)
    expect(r.hacer.map((a) => a.n)).toEqual([1, 2, 4]); expect(r.omitidas.map((o) => o.accion.n)).toEqual([3]); expect(r.omitidas[0].por_que).toMatch(/no cabe/)
    const cinco = recortarAlTope(Array.from({ length: 5 }, (_, n) => ({ usd_max: 0.01, n })), 0)
    expect(cinco.hacer).toHaveLength(4); expect(cinco.omitidas[0].por_que).toMatch(/4 corridas/)
  })
})

describe('limpio y ordenado · solo fichas, nunca se borra', () => {
  const AHORA = new Date('2026-10-10T12:00:00Z')
  const f = (o: Record<string, unknown>) => ({ id: 'f', creado_en: '2026-10-01T00:00:00Z', origen: 'tercero', ...o }) as never
  it('duplicados: se conserva la primaria (dueño / su fuente) y luego la más antigua; las demás se retiran', () => {
    const p = planDeLimpieza([f({ id: 'a', huella: 'h', creado_en: '2026-10-05T00:00:00Z' }), f({ id: 'b', huella: 'h', origen: 'dueno', creado_en: '2026-10-09T00:00:00Z' }), f({ id: 'c', huella: 'h', creado_en: '2026-10-02T00:00:00Z' }), f({ id: 'd', huella: 'otra' })], AHORA)
    expect(p.duplicados).toEqual([{ id: 'c', conservar_id: 'b' }, { id: 'a', conservar_id: 'b' }])
  })
  it('vencidas: pasó la fecha y no se reconfirmó después; una reconfirmada después de su fecha o una sin fecha no', () => {
    const p = planDeLimpieza([f({ id: 'v', vigente_hasta: '2026-10-09T00:00:00Z' }), f({ id: 'r', vigente_hasta: '2026-10-09T00:00:00Z', reconfirmado_en: '2026-10-09T10:00:00Z' }), f({ id: 'sin' }), f({ id: 'fut', vigente_hasta: '2026-10-20T00:00:00Z' })], AHORA)
    expect(p.vencidas).toEqual([{ id: 'v' }])
  })
  it('lo ya retirado no se toca; una vencida no cuenta como duplicado; lo propio sin rótulo se marca propia', () => {
    const p = planDeLimpieza([f({ id: 'x', huella: 'h', retirada_en: '2026-10-01T00:00:00Z' }), f({ id: 'y', huella: 'h' }), f({ id: 'z', huella: 'h', vigente_hasta: '2026-10-01T00:00:00Z' }), f({ id: 'm', origen: 'su_fuente' }), f({ id: 'k', origen: 'su_fuente', propiedad: 'ajena' })], AHORA)
    expect(p.duplicados).toEqual([]); expect(p.vencidas).toEqual([{ id: 'z' }]); expect(p.marcar_propias).toEqual([{ id: 'm' }])
  })
  it('B3 · lo que un modelo escribe a partir de lo raspado nace como SÍNTESIS con enlace a lo crudo, jamás como fuente propia', () => {
    expect(provenanceDeSintesis('raw-1')).toEqual({ type: 'evidence', source: 'agent_synthesis', trust_level: 'untrusted', respaldo_en: { tabla: 'apify_raw', id: 'raw-1' } })
  })
})

describe('avisar · solo el cruce puro (D-5: sin output_id no hay aviso)', () => {
  const d = compararLineas(['combo familiar $12 50', 'sopa $3'], ['combo familiar $13 00', 'sopa $3'])
  it('avisa a las piezas CON vínculo que mencionan un importe que ya no está; las demás se cuentan sin vínculo y no se adivina', () => {
    const r = avisosDePiezas(d, [{ output_id: 'o1', tipo: 'brief', texto: 'Promoción: combo familiar a $12.50 hoy' }, { output_id: null, tipo: 'brief', texto: 'combo a $12.50' }, { output_id: 'o2', tipo: 'brief', texto: 'Sopa a $3 todo el mes' }])
    expect(r.avisos).toEqual([{ output_id: 'o1', dato: '$12.50', clase: 'precio', motivo: expect.stringContaining('$12.50') }])
    expect(r.sin_vinculo).toBe(1)
  })
  it('un importe que sigue vigente no genera aviso', () => {
    expect(avisosDePiezas(compararLineas(['a $5'], ['a $5', 'b $7']), [{ output_id: 'o', tipo: 'x', texto: 'a $5' }]).avisos).toEqual([])
  })
})

describe('oportunidades de cambios', () => {
  it('de lo nuevo salen precio / horario / texto con su línea literal como cita; lo transitorio no; el texto se limita a 10', () => {
    const ahora = new Date('2026-10-10T00:00:00Z')
    const nuevas = ['cerrado vuelve hoy 7am', 'combo nuevo $9', 'abrimos los domingos de 10am a 2pm', ...Array.from({ length: 14 }, (_, i) => `novedad numero ${i} del negocio`)]
    const o = oportunidadesDeCambios('sitio', compararLineas([], nuevas), ahora)
    expect(o.filter((x) => x.clase === 'precio_cambio')).toHaveLength(1); expect(o.filter((x) => x.clase === 'horario_cambio')).toHaveLength(1)
    expect(o.filter((x) => x.clase === 'texto_nuevo')).toHaveLength(10)
    expect(o.every((x) => x.cita === x.dato)).toBe(true); expect(o.some((x) => /cerrado/.test(x.dato))).toBe(false)
  })
})

describe('plan de ampliación', () => {
  const AHORA = new Date('2026-10-10T12:00:00Z')
  const base = { cliente: { id: 'c', name: 'Clínica Ejemplo', config: {} }, ultima: {}, publicaciones_propias: ['AAA', 'BBB', 'CCC', 'DDD'], gastado_hoy_usd: 0, corridas_de_resenas_hoy: 0, ahora: AHORA }
  it('Mapas propio con reseñas: nombre exacto, 1 resultado, 100 reseñas, SIN datos personales', () => {
    const m = planDeAmpliacion(base).hacer.find((a) => a.fuente === 'mapas')!
    expect(m.funcion).toBe('own_google_maps_profile')
    expect(m.params).toMatchObject({ searchStringsArray: ['Clínica Ejemplo'], maxCrawledPlacesPerSearch: 1, maxReviews: 100, scrapeReviewsPersonalData: false })
    expect(m.metadata).toEqual({ target_kind: 'own', llamado_por: 'cerebro-diario-ampliacion' })
    expect(m.medido).toBe(false)
  })
  it('comentarios: las 3 publicaciones propias más nuevas; sin publicaciones vigiladas queda «no cubierta»', () => {
    const c = planDeAmpliacion(base).hacer.find((a) => a.fuente === 'comentarios')!
    expect((c.params as { directUrls: string[] }).directUrls).toEqual(['https://www.instagram.com/p/AAA/', 'https://www.instagram.com/p/BBB/', 'https://www.instagram.com/p/CCC/'])
    expect(planDeAmpliacion({ ...base, publicaciones_propias: [] }).no_cubiertas.some((n) => n.fuente === 'comentarios')).toBe(true)
  })
  it('D-3 · reparto: sin `url_reparto` en el alta queda «no cubierta»; con direcciones, una acción por dirección (máx. 2) y cada 7 días', () => {
    expect(planDeAmpliacion(base).no_cubiertas.some((n) => n.fuente === 'reparto')).toBe(true)
    const cfg = { apify: { url_reparto: ['https://reparto.test/a', 'https://reparto.test/b', 'https://reparto.test/c', 'no-es-url'] } }
    const p = planDeAmpliacion({ ...base, cliente: { ...base.cliente, config: cfg } })
    expect(p.hacer.filter((a) => a.fuente === 'reparto')).toHaveLength(2)
    const reciente = planDeAmpliacion({ ...base, cliente: { ...base.cliente, config: cfg }, ultima: { reparto: '2026-10-08T00:00:00Z' } })
    expect(reciente.hacer.some((a) => a.fuente === 'reparto')).toBe(false)
  })
  it('lo ya visto hoy no se repite; las reseñas tienen tope de 1 corrida por día; sin nombre no se busca en Mapas', () => {
    expect(planDeAmpliacion({ ...base, ultima: { mapas: '2026-10-10T08:00:00Z', comentarios: '2026-10-10T08:00:00Z' } }).hacer).toEqual([])
    const p = planDeAmpliacion({ ...base, corridas_de_resenas_hoy: 1 })
    expect(p.hacer.some((a) => a.fuente === 'mapas')).toBe(false); expect(p.omitidas.some((o) => o.fuente === 'resenas')).toBe(true)
    expect(planDeAmpliacion({ ...base, cliente: { id: 'c', name: '  ', config: {} } }).no_cubiertas.some((n) => n.fuente === 'mapas')).toBe(true)
  })
  it('el tope de US$ 1,00 se aplica en el plan: con US$ 0,99 ya gastados no cabe ninguna acción cara', () => {
    const p = planDeAmpliacion({ ...base, gastado_hoy_usd: 0.99 })
    expect(p.hacer).toEqual([]); expect(p.omitidas.length).toBeGreaterThan(0); expect(p.omitidas[0].por_que).toMatch(/no cabe/)
    expect(COSTO_MAXIMO_USD.website_content_scraper.medido).toBe(true)
  })
})
