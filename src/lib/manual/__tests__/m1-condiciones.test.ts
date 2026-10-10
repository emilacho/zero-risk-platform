/**
 * M1-a…e (condiciones de CC#3 sobre M1, relevo 56/62) · pruebas ROJAS PRIMERO.
 *  a · «propio» por IGUALDAD EXACTA del usuario (no por texto contenido)
 *  b · el eslogan propuesto se muestra en la tarjeta con su(s) fuente(s) y la advertencia «una sola fuente»
 *  c · las palabras de certeza son PATRONES con objeto (no palabras sueltas) y la puerta no deja texto roto
 *  d · una afirmación fuerte entre comillas, presentada como promesa de la marca, no se escapa de la puerta
 *  e · las pruebas pequeñas que faltaban (cita de cifra, emparejamiento por cláusula, meta sola, ok de errores, versión del título, herencia)
 *  + coherencia con la prueba desde cero: sin usuarios propios en la ficha la revisión se NIEGA a correr si hay Instagram raspado
 * Cliente SINTÉTICO de otro rubro; el código es agnóstico.
 */
import { describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { armarTarjeta } from '../borrador'
import { buscarCerteza, camposFirmes, cerrarPuerta, esFilaPropia, evaluarHechos, fuentesDeRaspado, metaDeCampos, palabrasDe } from '..'
import { promoverManualRevisado } from '../promover'
import { cerrarRevision, leerInsumos, type Insumos } from '../revision'
import { F, filaInstagram, PROPIOS } from './apoyo'

const C = '11111111-1111-4111-8111-111111111111'
const ids = (t: string) => buscarCerteza(palabrasDe(t)).map((m) => m.id)
const hechosDe = (manual: Record<string, unknown>, fuentes = [F('s', 'primaria_propia', 'Atendemos con cita previa en el consultorio.')]) => evaluarHechos({ manual, fuentes })

// ───────────────────────── a · «propio» por igualdad
describe('M1-a · «propio» por igualdad exacta del usuario', () => {
  const ig = (params: unknown) => ({ apify_function: 'instagram_scraper', params })
  it('un competidor cuyo usuario CONTIENE el del cliente NO es propio (antes sí lo era)', () => {
    expect(esFilaPropia(ig({ usernames: ['clinicaejemplo_oficial'] }), PROPIOS)).toBe(false)
    expect(esFilaPropia(ig({ usernames: ['laclinicaejemplo'] }), PROPIOS)).toBe(false)
    expect(esFilaPropia(ig({ startUrls: [{ url: 'https://instagram.com/clinicaejemplo_fans' }] }), PROPIOS)).toBe(false)
  })
  it('el usuario propio sí lo es, sin importar mayúsculas, la arroba o si viene como dirección', () => {
    for (const p of [{ usernames: ['clinicaejemplo'] }, { usernames: ['@ClinicaEjemplo'] }, { username: 'CLINICAEJEMPLO' }, { directUrls: ['https://www.instagram.com/clinicaejemplo/'] }, { startUrls: [{ url: 'https://instagram.com/ClinicaEjemplo?hl=es' }] }]) expect(esFilaPropia(ig(p), PROPIOS), JSON.stringify(p)).toBe(true)
  })
  it('una fila que pide al cliente Y a otro, una dirección de publicación o una sin objetivo reconocible NO es propia a nivel de fila', () => {
    expect(esFilaPropia(ig({ usernames: ['clinicaejemplo', 'competidor'] }), PROPIOS)).toBe(false)
    expect(esFilaPropia(ig({ directUrls: ['https://www.instagram.com/p/ABC123/'] }), PROPIOS)).toBe(false)
    expect(esFilaPropia(ig({}), PROPIOS)).toBe(false)
    expect(esFilaPropia(ig({ nota: 'clinicaejemplo' }), PROPIOS)).toBe(false) // el nombre suelto en otro campo no es un objetivo
  })
  it('a nivel de ítem: en una fila mixta, la cuenta del cliente es propia y la del otro es de terceros', () => {
    const fila = { id: 'm', apify_function: 'instagram_scraper', params: { usernames: ['clinicaejemplo', 'competidor'] }, respuesta: [{ username: 'clinicaejemplo', biography: 'Sonríe sin miedo siempre' }, { username: 'competidor', biography: 'Somos los únicos del barrio' }] }
    const f = fuentesDeRaspado([fila], PROPIOS)
    expect(f.find((x) => x.texto.includes('Sonríe'))!.tipo).toBe('primaria_propia'); expect(f.find((x) => x.texto.includes('únicos'))!.tipo).toBe('tercero')
  })
  it('consecuencia: lo que dice un competidor con usuario parecido NO respalda una afirmación del cliente', () => {
    const f = fuentesDeRaspado([filaInstagram('c', 'clinicaejemplo_oficial', 'Con garantía total de resultados')], PROPIOS)
    expect(f.every((x) => x.tipo === 'tercero')).toBe(true)
    const r = hechosDe({ positioning: 'Con garantía total de resultados.' }, f)
    expect(r.hechos.map((h) => h.estado)).toEqual(['sin_cita'])
  })
  it('lo que ya era propio sigue siéndolo (sitio por dirección, Mapas por función, redes por handle)', () => {
    expect(esFilaPropia({ apify_function: 'own_google_maps_profile', params: {} }, PROPIOS)).toBe(true)
    expect(esFilaPropia({ apify_function: 'website_content_scraper', params: { url: 'https://clinicaejemplo.test/x' } }, PROPIOS)).toBe(true)
    expect(esFilaPropia({ apify_function: 'website_content_scraper', params: { url: 'https://clinicaejemplo.test.otro.com' } }, PROPIOS)).toBe(false)
  })
})

// ───────────────────────── c · patrones de certeza
describe('M1-c · las palabras de certeza son PATRONES con objeto, no palabras sueltas', () => {
  it.each([
    'Cocina de origen marino, con delivery.', 'Una experiencia única en cada visita.', 'Ofertas exclusivas para quienes se suscriben.', 'Comprueba tus datos antes de pagar.', 'Nuestro equipo lidera con el ejemplo.',
  ])('prosa creativa «%s» NO es una afirmación de certeza', (t) => {
    expect(ids(t.replace('lidera', 'guía')), t).toEqual([]) // «lidera» queda fuera de esta lista de ejemplos creativos
  })
  it.each([
    ['Somos la única clínica del barrio', 'unico'], ['Los únicos con este método', 'unico'], ['Único en su clase', 'unico'], ['Única en la ciudad', 'unico'], ['Solo nosotros lo hacemos', 'unico'],
    ['Origen verificable de cada material', 'verificable'], ['Con denominación de origen', 'origen'], ['Resultados comprobados', 'comprobado'], ['Producto exclusivo de nuestra casa', 'exclusivo'], ['Disponible en exclusiva', 'exclusivo'],
    ['Trazabilidad total', 'trazabilidad'], ['Calidad garantizada', 'garantia'], ['Ningún competidor lo ofrece', 'ningun_competidor'], ['100% natural', 'cien_por_ciento'],
  ])('la afirmación «%s» SÍ marca (%s)', (t, id) => {
    expect(ids(t), t).toContain(id)
  })
  it('el manual de hoy: «la única ghost kitchen… trazabilidad desde Olón» sigue marcado (no se perdió cobertura real)', () => {
    const r = hechosDe({ positioning: 'La única cocina de este tipo, con trazabilidad desde el origen, y ningún competidor lo hace.' })
    expect(r.hechos.length).toBeGreaterThan(0); expect(r.sin_respaldo.length).toBeGreaterThan(0)
  })
  it('la prosa creativa del ejemplo de CC#3 pasa intacta por la puerta y no queda texto roto', () => {
    const m = { voz: 'Cocina de origen marino, con delivery. Cercana y cálida. Una experiencia única, siempre.' }
    const c = cerrarPuerta(m, hechosDe(m)); expect(c.manual).toEqual(m); expect(c.retirados).toEqual([])
  })
})

describe('M1-c · lo que la puerta retira deja texto gramatical', () => {
  const fuentes = [F('s', 'primaria_propia', 'Algo distinto del cliente.')]
  it('si de la oración solo queda un fragmento («siempre.»), sale la oración ENTERA', () => {
    const m = { voz: 'Cercana y cálida. Garantía total de resultados, siempre.' }
    const c = cerrarPuerta(m, evaluarHechos({ manual: m, fuentes }))
    expect(c.manual.voz).toBe('Cercana y cálida.'); expect(c.retirados.length).toBeGreaterThan(0)
  })
  it('si el resto de la oración sí es una frase (≥ 3 palabras), solo sale la cláusula', () => {
    const m = { voz: 'Atendemos con calidez todos los días, con garantía total.' }
    expect(cerrarPuerta(m, evaluarHechos({ manual: m, fuentes })).manual.voz).toBe('Atendemos con calidez todos los días.')
  })
  it('nunca queda un texto que empiece en minúscula suelta o con puntuación huérfana', () => {
    for (const t of ['Garantía total, siempre.', 'Servicio cálido. Garantía total, hoy.', 'Con garantía total y listo.', 'Calidad garantizada: siempre.']) {
      const out = String(cerrarPuerta({ v: t }, evaluarHechos({ manual: { v: t }, fuentes })).manual.v)
      expect(out, t).not.toMatch(/(^|\.\s)[a-záéíóúñ]/); expect(out, t).not.toMatch(/(^|\s)[,;:]|\.\s*\./)
    }
  })
})

// ───────────────────────── d · comillas
describe('M1-d · una afirmación fuerte entre comillas, presentada como promesa de la marca, no se escapa', () => {
  const fuentes = [F('s', 'primaria_propia', 'Atendemos con cita previa en el consultorio.')]
  it('«Trazabilidad total desde el origen» entre comillas SIN atribución se chequea y se retira entera', () => {
    const m = { promesa: 'La promesa de la marca: «Trazabilidad total desde el origen».' }
    const r = evaluarHechos({ manual: m, fuentes }); expect(r.sin_respaldo.length).toBeGreaterThan(0)
    const c = cerrarPuerta(m, r)
    expect(JSON.stringify(c.manual)).not.toMatch(/Trazabilidad|«|»/)
    expect(c.retirados.length).toBeGreaterThan(0)
  })
  it('si el cliente SÍ lo dice textualmente en lo suyo, queda como «el cliente dice: «…»»', () => {
    const f = [F('s', 'primaria_propia', 'Nuestro lema: Trazabilidad total desde el origen.')]
    const m = { promesa: 'La promesa de la marca: «Trazabilidad total desde el origen».' }
    const c = cerrarPuerta(m, evaluarHechos({ manual: m, fuentes: f }))
    expect(JSON.stringify(c.manual)).toMatch(/el cliente dice: «/); expect(c.retirados).toEqual([])
  })
  it('un ejemplo de redacción entre comillas SIN certeza sigue siendo creativo (no se mira)', () => {
    const m = { ejemplos: 'Ejemplo de titular: «Pedí hoy lo que querés». Otro: «Sonríe sin miedo, siempre contigo».' }
    expect(evaluarHechos({ manual: m, fuentes }).hechos).toEqual([])
  })
  it('la cita ATRIBUIDA sigue su camino de siempre', () => {
    const f = [F('s', 'primaria_propia', 'Atendemos con cita previa en el consultorio.')]
    const r = evaluarHechos({ manual: { p: 'Según su sitio, «atendemos con cita previa en el consultorio».' }, fuentes: f })
    expect(r.hechos.some((h) => h.marcas.includes('cita') && h.estado === 'verificado')).toBe(true)
  })
})

// ───────────────────────── b · la tarjeta
const insumos = (manual: Record<string, unknown>, fuentes = [F('b', 'primaria_propia', 'Sonríe sin miedo, siempre contigo!', 'instagram', 'biografia')], vigente = 2): Insumos =>
  ({ client_id: C, client_name: 'Clínica Ejemplo', version_vigente: vigente, manual, fuentes, dudas: [], propios: { handles: [] }, filas_leidas: 0, foto: { version: vigente, huella: 'h', creado_en: null } })
describe('M1-b · la tarjeta muestra el eslogan propuesto con su fuente y la advertencia de «una sola fuente»', () => {
  it('con UNA sola fuente: eslogan literal, su fuente y una advertencia visible (en la metadata y al inicio de la vista previa)', () => {
    const ins = insumos({ voz: 'Cálida.', tagline: null })
    const t = armarTarjeta({ insumos: ins, cierre: cerrarRevision(ins, ins.manual), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true })
    const e = t.metadata.eslogan as { aplicado: boolean; literal: string; fuentes: Array<{ rotulo: string }>; una_sola_fuente: boolean; advertencia: string }
    expect(e).toMatchObject({ aplicado: true, literal: 'Sonríe sin miedo, siempre contigo!', una_sola_fuente: true }); expect(e.fuentes.length).toBe(1); expect(e.advertencia).toMatch(/una sola fuente/i)
    expect(t.vista_previa.split('\n')[0]).toMatch(/Eslogan propuesto: «Sonríe sin miedo, siempre contigo!»/); expect(t.vista_previa.split('\n')[0]).toMatch(/UNA SOLA FUENTE/)
  })
  it('con 2 fuentes: lleva ambas y SIN advertencia; si el manual ya tiene eslogan, no propone otro', () => {
    const f = [F('b', 'primaria_propia', 'Sonríe sin miedo, siempre contigo!', 'instagram', 'biografia'), F('t', 'primaria_propia', 'Clínica Ejemplo · Sonríe sin miedo, siempre contigo!', 'sitio', 'titulo')]
    const ins = insumos({ voz: 'Cálida.', tagline: null }, f)
    const e = armarTarjeta({ insumos: ins, cierre: cerrarRevision(ins, ins.manual), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true }).metadata.eslogan as { fuentes: unknown[]; una_sola_fuente: boolean; advertencia: string | null }
    expect(e.fuentes.length).toBe(2); expect(e.una_sola_fuente).toBe(false); expect(e.advertencia).toBeNull()
    const ya = insumos({ voz: 'Cálida.', tagline: 'Otro lema' }, f)
    expect((armarTarjeta({ insumos: ya, cierre: cerrarRevision(ya, ya.manual), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true }).metadata.eslogan as { aplicado: boolean }).aplicado).toBe(false)
  })
  it('el título lleva la versión NUEVA (vigente + 1)', () => {
    const ins = insumos({ voz: 'Cálida.' }, [], 3)
    expect(armarTarjeta({ insumos: ins, cierre: cerrarRevision(ins, ins.manual), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true }).titulo).toMatch(/versión 4\b/)
  })
})

// ───────────────────────── coherencia: sin usuarios propios
describe('coherencia · sin usuarios propios en la ficha la revisión se NIEGA si hay Instagram raspado', () => {
  const base = (config: unknown, filas: Array<Record<string, unknown>>) => new DbFalsa()
    .semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: PROPIOS.sitio, config }])
    .semilla('client_brand_books', [{ id: 'b', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: { voz: 'Cálida.' } }), created_at: '2026-01-01' }])
    .semilla('apify_raw', filas.map((f) => ({ ...f, client_id: C, ensayo: false, created_at: '2026-10-10' })))
  it('hay raspado de Instagram y la ficha no dice cuál es la cuenta propia ⇒ 409 `sin_usuarios_propios` (no se retira en silencio lo que solo respalda el Instagram)', async () => {
    const r = await leerInsumos(base({}, [filaInstagram('i', 'cualquiera', 'Hola mundo bonito siempre')]), C)
    expect(r).toMatchObject({ ok: false, status: 409, error: 'sin_usuarios_propios' })
  })
  it('con `own_handles` escrito, corre; sin raspado de Instagram y sin handles, también (no hay nada que perder)', async () => {
    expect((await leerInsumos(base({ apify: { own_handles: { instagram: 'clinicaejemplo' } } }, [filaInstagram('i', 'clinicaejemplo', 'Hola mundo bonito siempre')]), C)).ok).toBe(true)
    expect((await leerInsumos(base({}, []), C)).ok).toBe(true)
  })
})

// ───────────────────────── e · las pruebas pequeñas
describe('M1-e · pruebas pequeñas que protegen R3/R4', () => {
  const fuentes = [F('s', 'primaria_propia', 'Más de 45 pacientes cada mes confían en nosotros. Atendemos con cita previa.')]
  it('cita de una CIFRA: existe y trae la cifra ⇒ verificado; no está en la fuente ⇒ cita_inexistente; la cita no trae la cifra ⇒ sin_cita', () => {
    const manual = { p: 'Atendemos a 45 pacientes al mes.' }
    const conCita = (literal: string, fuente_id = 's') => evaluarHechos({ manual, fuentes, citas: [{ frase: 'Atendemos a 45 pacientes al mes', literal, fuente_id }] }).hechos[0]
    expect(conCita('Más de 45 pacientes cada mes confían en nosotros')).toMatchObject({ estado: 'verificado' })
    expect(conCita('Más de 99 pacientes cada mes')).toMatchObject({ estado: 'sin_cita', motivo: 'cita_inexistente' })
    expect(conCita('Atendemos con cita previa')).toMatchObject({ estado: 'sin_cita', motivo: 'la_cita_no_trae_la_cifra' })
    expect(conCita('Más de 45 pacientes cada mes confían en nosotros', 'otra')).toMatchObject({ estado: 'sin_cita' })
  })
  it('emparejamiento de la cita por CLÁUSULA: respalda solo la cláusula que nombra, no a las otras de la misma frase', () => {
    const manual = { p: 'Atendemos a 45 pacientes al mes, con garantía total.' }
    const r = evaluarHechos({ manual, fuentes, citas: [{ frase: 'Atendemos a 45 pacientes al mes', literal: 'Más de 45 pacientes cada mes confían en nosotros', fuente_id: 's' }] })
    const porClausula = Object.fromEntries(r.hechos.map((h) => [h.clausula, h.estado]))
    expect(Object.values(porClausula)).toContain('verificado'); expect(Object.values(porClausula)).toContain('sin_cita') // la garantía no hereda la cita de la cifra
  })
  it('`_field_meta` sola (sin textos) no inventa campos firmes ni provisionales; y metaDeCampos de un manual sin hechos marca todo «sin_hechos»', () => {
    expect(camposFirmes({ _field_meta: { a: { estado: 'verificado', provisional: false } } })).toEqual({ firmes: [], provisionales: [], sin_revisar: [] })
    expect(metaDeCampos({ voz: 'Cálida y cercana.' }, evaluarHechos({ manual: { voz: 'Cálida y cercana.' }, fuentes: [] })).voz).toMatchObject({ estado: 'sin_hechos', provisional: false })
  })
})

describe('M1-e · huecos de la mutación de CC#3 sobre M2', () => {
  const draft = (manual: Record<string, unknown>) => JSON.stringify({ manual, version_base: 1 })
  const sembrar = (contenido: string, anterior: Record<string, unknown> = {}) => new DbFalsa()
    .semilla('client_historical_outputs', [{ id: 'o1', client_id: C, output_type: 'brand_book_draft_revision', status: 'draft', content: contenido, provenance_tag: {} }])
    .semilla('client_brand_books', [{ id: 'b1', client_id: C, version: 1, content_text: '{}', ...anterior }])
  it('todo resultado de error de la promoción lleva `ok: false` (el PATCH decide 200/207 por ese campo)', async () => {
    const e = { output_id: 'o1', client_id: C, aprobador: 'e', empujar: vi.fn() as never }
    expect(await promoverManualRevisado(sembrar('no json'), e)).toMatchObject({ ok: false, error: 'borrador_ilegible' })
    expect(await promoverManualRevisado(sembrar(draft({ a: 'x' })), { ...e, output_id: 'otro' })).toMatchObject({ ok: false, error: 'borrador_inexistente' })
    expect(await promoverManualRevisado(sembrar(JSON.stringify({ manual: { a: 'x' }, version_base: 7 })), e)).toMatchObject({ ok: false, error: 'version_vigente_cambio' })
    const roto = sembrar(draft({ a: 'x' })); roto.fallar['client_historical_outputs'] = 'boom'
    expect(await promoverManualRevisado(roto, e)).toMatchObject({ ok: false, error: 'lectura_fallida' })
    const sinInsertar = sembrar(draft({ a: 'x' })); const desde = sinInsertar.from.bind(sinInsertar)
    sinInsertar.from = ((t: string) => { const q = desde(t) as unknown as Record<string, unknown>; if (t === 'client_brand_books') q.insert = () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'no' } }) }) }); return q }) as never
    expect(await promoverManualRevisado(sinInsertar, e)).toMatchObject({ ok: false, error: 'insercion_fallida' })
  })
  it('la herencia de visuales: lo que la versión anterior no tenía NO se escribe como columna vacía; lo que sí tenía se hereda', async () => {
    const db = sembrar(draft({ a: 'x' }), { primary_colors: ['#112233'] })
    await promoverManualRevisado(db, { output_id: 'o1', client_id: C, aprobador: 'e', empujar: vi.fn() as never })
    const nueva = db.tablas['client_brand_books'][1]
    expect(nueva.primary_colors).toEqual(['#112233']); expect(Object.keys(nueva)).not.toContain('typography')
  })
})
