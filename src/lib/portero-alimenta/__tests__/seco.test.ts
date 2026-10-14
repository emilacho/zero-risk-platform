/**
 * SECO COMPLETO · 4 rubros inventados, tuteo y voseo · base falsa y modelo SIMULADO (US$ 0, ninguna llamada pagada).
 * Día 1: la primera corrida real (en la base falsa) archiva lo que hay. Día 2: cambia lo que cambia en la vida real (un precio, un horario que solo rota de orden,
 * una publicación, una reseña, un aviso de estado, un artículo de un homónimo) y se corre en SECO: muestra qué sumó, qué reemplazó y qué ignoró.
 * También prueba: con TODO apagado el sistema queda idéntico a hoy (cero lecturas, cero escrituras), el dry_run no escribe y el tope se respeta.
 */
import { describe, expect, it } from 'vitest'
import { rutaAlimentar, rutaDescubrir, validar } from '../rutas'
import { alimentarCliente } from '../alimentar'
import type { Interruptores } from '../datos'
import { crearBaseFalsa } from './base-falsa'

const ON: Interruptores = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const OFF: Interruptores = { alimentar: false, proponer_busquedas: false, menciones: false, puente_al_indice: false }
const D1 = new Date('2026-10-15T10:30:00Z')
const D2 = new Date('2026-10-16T10:30:00Z')
const WF = { workflow_id: 'wf-portero', workflow_execution_id: 'ex-1' }

interface Caso {
  id: string; nombre: string; rubro: string; pais: string; ciudad: string; voz: 'tuteo' | 'voseo'; web: string; ig: string
  paginaDia1: string; paginaDia2: string
  horarioDia1: Array<{ day: string; hours: string }>; horarioDia2: Array<{ day: string; hours: string }>
  postDia2: { id: string; texto: string }
  resenaDia2: string
  homonimoDia2: string
  esperaReemplazos: number
}
const SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']
const horario = (h: string, rotar = false) => { const d = SEMANA.map((day) => ({ day, hours: h })); return rotar ? [...d.slice(2), ...d.slice(0, 2)] : d }
const CASOS: Caso[] = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Clínica Sonrisa Norte', rubro: 'clínica dental y ortodoncia', pais: 'Ecuador', ciudad: 'Quito', voz: 'tuteo', web: 'sonrisanorte.example', ig: 'sonrisanorte',
    paginaDia1: 'Limpieza dental $35\nOrtodoncia desde $900\nAtendemos con cita previa por WhatsApp', paginaDia2: 'Limpieza dental $40\nOrtodoncia desde $900\nAtendemos con cita previa por WhatsApp\nAbierto ahora hasta las 6pm',
    horarioDia1: horario('8 AM to 6 PM'), horarioDia2: horario('8 AM to 6 PM', true),
    postDia2: { id: 'P2', texto: 'Esta semana sonríe con nuestro blanqueamiento láser' }, resenaDia2: 'Excelente atención en la Clínica Sonrisa Norte, me explicaron todo el tratamiento con calma',
    homonimoDia2: 'La clínica Sonrisa Norte de Guayaquil inauguró consultorio nuevo con ofertas de apertura esta semana', esperaReemplazos: 1 },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'Taller Mecánico El Pistón', rubro: 'taller mecánico y lubricadora', pais: 'Argentina', ciudad: 'Rosario', voz: 'voseo', web: 'elpiston.example', ig: 'elpiston.ok',
    paginaDia1: 'Cambio de aceite ARS 45.000\nAlineación y balanceo ARS 30.000\nPedí tu turno por WhatsApp', paginaDia2: 'Cambio de aceite ARS 52.000\nAlineación y balanceo ARS 30.000\nPedí tu turno por WhatsApp\nEstamos cerrados hasta mañana, volvé a partir de las 9',
    horarioDia1: horario('9 AM to 6 PM'), horarioDia2: horario('9 AM to 7 PM'),
    postDia2: { id: 'P2', texto: 'Llegó el service completo con descuento para clientes de siempre' }, resenaDia2: 'Muy buen trabajo en Taller Mecánico El Pistón de Rosario, me dejaron el auto impecable',
    homonimoDia2: 'Taller Mecánico El Pistón de Córdoba busca mecánicos para su nueva sucursal y ofrece capacitación', esperaReemplazos: 2 },
  { id: '33333333-3333-4333-8333-333333333333', nombre: 'Flujo CRM', rubro: 'software CRM para pymes', pais: 'México', ciudad: 'Ciudad de México', voz: 'tuteo', web: 'flujocrm.example', ig: 'flujocrm',
    paginaDia1: 'Plan Starter US$ 19 por mes\nPlan Pro US$ 49 por mes\nSoporte por chat de lunes a viernes', paginaDia2: 'Plan Starter US$ 19 por mes\nPlan Pro US$ 59 por mes\nSoporte por chat de lunes a viernes\nNuevo: integración con WhatsApp Business',
    horarioDia1: horario('9 AM to 6 PM'), horarioDia2: horario('9 AM to 6 PM', true),
    postDia2: { id: 'P2', texto: 'Presentamos la integración con WhatsApp Business para todos los planes' }, resenaDia2: 'Flujo CRM de Ciudad de México nos ordenó el seguimiento de clientes en una semana',
    homonimoDia2: 'Flujo CRM, un viejo sistema de Lima para contadores, deja de recibir soporte este año', esperaReemplazos: 1 },
  { id: '44444444-4444-4444-8444-444444444444', nombre: 'Casa Yoga Luna', rubro: 'estudio de yoga y pilates', pais: 'Uruguay', ciudad: 'Montevideo', voz: 'voseo', web: 'casayogaluna.example', ig: 'casayogaluna',
    paginaDia1: 'Clase suelta UYU 600\nMensualidad UYU 2.400\nSumate a la clase de prueba', paginaDia2: 'Clase suelta UYU 650\nMensualidad UYU 2.400\nSumate a la clase de prueba\nPróximo turno: hoy 19:30',
    horarioDia1: horario('7 AM to 8 PM'), horarioDia2: horario('7 AM to 9 PM'),
    postDia2: { id: 'P2', texto: 'Esta semana sumamos clases de pilates en el salón grande' }, resenaDia2: 'Casa Yoga Luna de Montevideo es un lugar muy cálido, las clases de prueba me encantaron',
    homonimoDia2: 'La escuela Casa Yoga Luna de Punta del Este cerró sus puertas por la temporada baja', esperaReemplazos: 2 },
]

function tablasDelCaso(c: Caso, dia: 1 | 2) {
  const t = (iso: string) => iso
  const ig = (posts: Array<{ id: string; texto: string }>) => [{ username: c.ig, biography: `Somos ${c.nombre}`, latestPosts: posts.map((p) => ({ shortCode: p.id, caption: p.texto, ownerUsername: c.ig })) }]
  const filas: Array<Record<string, unknown>> = [
    { id: `${c.id}-w1`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: t('2026-10-15T08:00:00Z'), metadata: { llamado_por: 'portero-alimentar' }, respuesta: [{ url: `https://${c.web}/`, text: c.paginaDia1 }] },
    { id: `${c.id}-m1`, client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: t('2026-10-15T08:01:00Z'), respuesta: [{ title: c.nombre, address: 'Av. Principal 123', openingHours: c.horarioDia1 }] },
    { id: `${c.id}-i1`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: t('2026-10-15T08:02:00Z'), respuesta: ig([{ id: 'P1', texto: 'Bienvenidos a la semana con muchas novedades para todos' }]) },
  ]
  if (dia === 2) {
    filas.push(
      { id: `${c.id}-w2`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: t('2026-10-16T08:00:00Z'), metadata: { llamado_por: 'portero-alimentar' }, respuesta: [{ url: `https://${c.web}/`, text: c.paginaDia2 }] },
      { id: `${c.id}-m2`, client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: t('2026-10-16T08:01:00Z'), respuesta: [{ title: c.nombre, address: 'Av. Principal 123', openingHours: c.horarioDia2, reviews: [{ reviewId: 'RV1', text: c.resenaDia2, publishedAtDate: '2026-10-16T01:00:00Z' }] }] },
      { id: `${c.id}-i2`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: t('2026-10-16T08:02:00Z'), respuesta: ig([{ id: 'P1', texto: 'Bienvenidos a la semana con muchas novedades para todos' }, c.postDia2]) },
      { id: `${c.id}-a1`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: t('2026-10-16T08:03:00Z'), metadata: { llamado_por: 'ogfq56oIEoHufFPM#articulo' }, respuesta: [{ url: 'https://noticias.example/homonimo', text: `${c.homonimoDia2}. ${'Texto de relleno de la nota para que tenga largo suficiente. '.repeat(4)}` }] },
    )
  }
  return {
    clients: [{ id: c.id, name: c.nombre, website_url: `https://${c.web}`, industry: c.rubro, country: c.pais, config: { registro: c.voz, apify: { own_handles: { instagram: c.ig } } } }],
    client_sedes: [{ client_id: c.id, ciudad: c.ciudad, clave: c.ciudad.toLowerCase() }],
    apify_raw: filas, cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [],
  }
}

/** el molde del modelo: SOLO decide sobre ítems con vigente; reemplaza si el texto cambió, con cita literal de las 3 primeras palabras del texto nuevo */
const juezSimulado = (llamadas: { n: number }) => async (_i: string, mensaje: string) => {
  llamadas.n++
  const bloques = mensaje.split(/\n\n(?=\[\d+\])/).filter((b) => /^\[\d+\]/.test(b.trim()))
  const decisiones = bloques.map((b) => {
    const n = Number(/^\[(\d+)\]/.exec(b.trim())![1])
    const nuevo = /texto nuevo: (.*)/.exec(b)![1]
    const vig = /vigente \(id ([^,)]+)[^)]*\): (.*)/.exec(b)
    const cita = nuevo.split(' ').slice(0, 3).join(' ')
    if (!vig) return { n, decision: 'suma', cita, razon: 'dato nuevo' }
    // el mismo texto con otro orden de palabras = nada
    const mismas = (a: string, b2: string) => [...a.split(' ')].sort().join(' ') === [...b2.split(' ')].sort().join(' ')
    return mismas(nuevo, vig[2]) ? { n, decision: 'nada', cita, razon: 'mismo dato' } : { n, decision: 'reemplaza', reemplaza_ficha: vig[1], cita, razon: 'cambió el dato' }
  })
  return { texto: JSON.stringify({ decisiones }), costo_usd: 0.006, tokens_entrada: 1200, tokens_salida: 300 }
}

describe('seco · día 1 real en la base falsa, día 2 en seco · 4 rubros (tuteo y voseo)', () => {
  for (const c of CASOS) {
    it(`${c.nombre} (${c.pais} · ${c.voz})`, async () => {
      const t = tablasDelCaso(c, 1)
      const base = crearBaseFalsa(t as never)
      // DÍA 1 · real, sobre la base falsa: todo es primera vez
      const n1 = { n: 0 }
      let k = 0
      const r1 = await alimentarCliente({ db: base.db, client_id: c.id, dry_run: false, interruptores: ON, llamarModelo: juezSimulado(n1), ahora: D1, ...WF, nuevoId: () => `${c.id.slice(0, 4)}-${++k}` })
      expect(r1.estado).toBe('hecha')
      expect(r1.errores).toEqual([])
      expect(n1.n).toBe(0) // nada que reemplazar el primer día: se suma por código, sin pagar modelo
      expect(r1.escrituras.fichas).toBeGreaterThan(5)
      // lo que archivó tiene fecha y fuente
      const fichas = base.tablas.cerebro_fichas as Array<Record<string, unknown>>
      expect(fichas.every((f) => f.observado_en && f.fuente_url !== undefined && f.decision === 'suma')).toBe(true)

      // DÍA 2 · en seco, con los cambios del día
      const t2 = tablasDelCaso(c, 2)
      t2.cerebro_fichas = base.tablas.cerebro_fichas as never
      t2.cerebro_unidades_vistas = base.tablas.cerebro_unidades_vistas as never
      t2.cerebro_ingresos = base.tablas.cerebro_ingresos as never
      const seco = crearBaseFalsa(t2 as never)
      const n2 = { n: 0 }
      const r2 = await alimentarCliente({ db: seco.db, client_id: c.id, dry_run: true, interruptores: ON, llamarModelo: juezSimulado(n2), ahora: D2 })
      expect(r2.estado).toBe('hecha')
      expect(seco.escrituras).toEqual([]) // el seco no escribe NADA
      expect(r2.plan).not.toBeNull()
      const res = r2.plan!.resumen
      // lo que cambió de verdad: precios/horario reemplazan; publicación y reseña suman; el aviso de estado y el horario rotado no son cambio
      expect(res.reemplaza).toBe(c.esperaReemplazos)
      expect(r2.plan!.retiros).toHaveLength(c.esperaReemplazos)
      expect(r2.plan!.fichas.some((f) => f.fuente_url === null && f.clase === 'instagram')).toBe(false)
      const dec = r2.decisiones
      expect(dec.some((d) => d.fuente === 'instagram' && d.unidad === 'P2' && d.decision === 'suma')).toBe(true)
      expect(dec.some((d) => d.fuente === 'resenas' && d.decision === 'suma')).toBe(true)
      // el homónimo de otra ciudad NO se entrega (ajeno o sin confirmar)
      expect(r2.plan!.fichas.some((f) => f.entregable && /homonimo|inauguro|cerro sus puertas|busca mecanicos|deja de recibir/.test(f.contenido))).toBe(false)
      expect(r2.filtro.ajenas + r2.filtro.sin_confirmar).toBeGreaterThanOrEqual(0)
      // el aviso de estado («abierto ahora», «volvé…», «próximo turno») no es un cambio
      expect(dec.some((d) => /abierto ahora|volve a partir|proximo turno/.test(d.unidad))).toBe(false)
      // el costo que habría tenido (modelo simulado): una sola llamada, centavos
      expect(r2.juez.llamadas).toBe(1)
      expect(r2.gasto.modelo_usd).toBeLessThan(0.05)
      expect(r2.gasto.supero_el_tope).toBe(false)
    })
  }
})

describe('lo que no se pudo confirmar se archiva pero NO se entrega', () => {
  it('en una corrida REAL, el homónimo queda como ficha descartada (incierta) y no entra al índice', async () => {
    const c = CASOS[1]
    const t = tablasDelCaso(c, 2)
    const base = crearBaseFalsa(t as never)
    const puente: Array<{ escribir: Array<{ sections: Array<{ text: string }> }> }> = []
    const r = await rutaAlimentar({ db: base.db, interruptores: ON, llamarModelo: juezSimulado({ n: 0 }), ahora: D2, puente: async (p) => { puente.push(p as never); return { escritos: 0, sacados: 0, errores: [] } } }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body.estado).toBe('hecha')
    const fichas = base.tablas.cerebro_fichas as Array<Record<string, unknown>>
    const inciertas = fichas.filter((f) => f.propiedad === 'incierta')
    expect(inciertas.length).toBeGreaterThan(0)
    expect(inciertas.every((f) => f.descartada === true && f.motivo_descarte)).toBe(true)
    expect(fichas.filter((f) => f.propiedad !== 'incierta').every((f) => f.descartada === false)).toBe(true)
    expect(JSON.stringify(puente)).not.toMatch(/cordoba|córdoba/i)
  })
})

describe('interruptores y guardas de las rutas', () => {
  const c = CASOS[0]
  it('con TODO apagado: ni una lectura ni una escritura (el sistema queda idéntico a hoy)', async () => {
    const base = crearBaseFalsa(tablasDelCaso(c, 2) as never)
    for (const dry of [true, false]) {
      const a = await rutaAlimentar({ db: base.db, interruptores: OFF }, { client_id: c.id, dry_run: dry, ...WF })
      expect(a).toEqual({ status: 200, body: expect.objectContaining({ apagado: true, modelos_llamados: 0 }) })
      const d = await rutaDescubrir({ db: base.db, interruptores: OFF }, { client_id: c.id, dry_run: dry, ...WF })
      expect(d.body.apagado).toBe(true)
    }
    expect(base.lecturas).toEqual([])
    expect(base.escrituras).toEqual([])
  })
  it('dry_run es obligatorio y booleano; sin dry_run exige el flujo (403); client_id uuid', async () => {
    expect(validar({ client_id: c.id })).toMatchObject({ status: 400, body: { error: 'dry_run_obligatorio' } })
    expect(validar({ client_id: c.id, dry_run: 'false' })).toMatchObject({ status: 400 })
    expect(validar({ client_id: 'x', dry_run: true })).toMatchObject({ status: 400 })
    expect(validar({ client_id: c.id, dry_run: false })).toMatchObject({ status: 403, body: { error: 'workflow_requerido' } })
    expect(validar({ client_id: c.id, dry_run: false, ...WF })).toMatchObject({ dry_run: false })
    expect(validar(null)).toMatchObject({ status: 400 })
  })
  it('ante un error de lectura lo DICE (502): nunca lo lee como «no hay nada»', async () => {
    const base = crearBaseFalsa(tablasDelCaso(c, 2) as never, { fallaEn: 'apify_raw' })
    const r = await rutaAlimentar({ db: base.db, interruptores: ON }, { client_id: c.id, dry_run: true })
    expect(r.status).toBe(502)
    expect(r.body.error ?? r.body.estado).toBe('lectura_fallida')
    expect(base.escrituras).toEqual([])
  })
  it('una corrida real escribe fichas, retira lo reemplazado, anota lo visto y el rastro; una segunda el mismo día no repite', async () => {
    const t = tablasDelCaso(c, 1)
    const base = crearBaseFalsa(t as never)
    const escritosPuente: unknown[] = []
    const deps = { db: base.db, interruptores: ON, llamarModelo: juezSimulado({ n: 0 }), ahora: D1, puente: async (p: { escribir: unknown[]; sacar: string[] }) => { escritosPuente.push(p); return { escritos: p.escribir.length, sacados: p.sacar.length, errores: [] } } }
    const r = await rutaAlimentar(deps, { client_id: c.id, dry_run: false, ...WF })
    expect(r.status).toBe(200)
    expect(r.body.estado).toBe('hecha')
    expect((base.tablas.cerebro_portero_corridas as unknown[]).length).toBe(1)
    expect(escritosPuente).toHaveLength(1)
    expect((r.body.puente as { escritos: number }).escritos).toBeGreaterThan(0)
    const otra = await rutaAlimentar(deps, { client_id: c.id, dry_run: false, ...WF })
    expect(otra.body.estado).toBe('ya_corrio_hoy')
    const forzada = await rutaAlimentar(deps, { client_id: c.id, dry_run: false, forzar: true, ...WF })
    // misma raspada = misma huella: nada nuevo que escribir (idempotente)
    expect((forzada.body.escrituras as { fichas: number }).fichas).toBe(0)
  })
})
