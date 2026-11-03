/** M2 · bordes que las mutaciones dejaron vivos (hallazgos reales de comportamiento, no de relleno). */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { borradorDeContentText, leerInsumos, prepararRevision, type Insumos } from '../revision'
import { guardarBorrador, armarTarjeta } from '../borrador'
import { cerrarRevision } from '../revision'
import { promoverManualRevisado } from '../promover'
import { rutaBorrador, rutaOpinion, validarCuerpo } from '../rutas'
import { F, filaInstagram, filaSitio, PROPIOS } from './apoyo'

const C = '11111111-1111-4111-8111-111111111111'
const ins = (o: Partial<Insumos> & { fuentes?: Insumos['fuentes'] }): Insumos => ({ client_id: C, client_name: 'X', version_vigente: 1, manual: {}, fuentes: [], dudas: [], propios: { handles: [] }, filas_leidas: 0, foto: { version: 1, huella: 'h', creado_en: null }, ...o })

describe('prepararRevision · «sin hallazgos» solo cuando de verdad no hay nada que hacer', () => {
  const propia = F('b', 'primaria_propia', 'Sonríe sin miedo, siempre contigo!', 'instagram', 'biografia')
  it('sin hechos sin respaldo y con tagline puesto ⇒ sin hallazgos', () => {
    expect(prepararRevision(ins({ manual: { voice: 'cálida', tagline: 'Ya está' }, fuentes: [propia] })).sin_hallazgos).toBe(true)
  })
  it('sin hechos pero con un eslogan hallado y tagline vacío ⇒ SÍ hay algo que hacer (falta el eslogan)', () => {
    expect(prepararRevision(ins({ manual: { voice: 'cálida', tagline: null }, fuentes: [propia] })).sin_hallazgos).toBe(false)
    expect(prepararRevision(ins({ manual: { voice: 'cálida' }, fuentes: [propia] })).sin_hallazgos).toBe(false)
  })
  it('sin hechos, sin eslogan hallado y tagline vacío ⇒ sin hallazgos (no hay de dónde sacar uno)', () => {
    expect(prepararRevision(ins({ manual: { voice: 'cálida', tagline: null }, fuentes: [] })).sin_hallazgos).toBe(true)
  })
  it('un hecho sin respaldo ⇒ hay hallazgos aunque el tagline esté', () => {
    expect(prepararRevision(ins({ manual: { mision: 'Con trazabilidad verificable.', tagline: 'x' }, fuentes: [propia] })).sin_hallazgos).toBe(false)
  })
})

describe('leerInsumos / borradorDeContentText', () => {
  it('un borrador que no es un objeto (lista, texto, número) no cuenta: se dice ilegible, no se adivina', () => {
    for (const d of [[1], 'texto', 5, null]) expect(borradorDeContentText(JSON.stringify({ brand_book_draft: d }))).toBeNull()
    expect(borradorDeContentText(JSON.stringify({ brand_book_draft: { a: 1 } }))).toEqual({ a: 1 })
    expect(borradorDeContentText(JSON.stringify([1]))).toBeNull()
  })
  it('un cliente sin nombre se llama «cliente»; la ficha pone los datos humanos con prefijo y las redes propias salen de la configuración', async () => {
    const db = new DbFalsa().semilla('clients', [{ id: C, name: '', website_url: PROPIOS.sitio, city: 'Ciudad Ejemplo', config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
      .semilla('client_brand_books', [{ id: 'b', client_id: C, version: 4, content_text: JSON.stringify({ brand_book_draft: { a: 'x' } }), created_at: '2026-01-01' }])
      .semilla('apify_raw', [{ ...filaInstagram('i', 'clinicaejemplo', 'Hola mundo bonito siempre'), client_id: C, ensayo: false }])
    const r = await leerInsumos(db, C)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.insumos.client_name).toBe('cliente'); expect(r.insumos.version_vigente).toBe(4)
    expect(r.insumos.fuentes.some((f) => f.tipo === 'humana' && f.texto === 'city: Ciudad Ejemplo')).toBe(true)
    expect(r.insumos.fuentes.some((f) => f.tipo === 'primaria_propia' && f.canal === 'instagram')).toBe(true)
  })
})

describe('rutas · bordes', () => {
  it('el cuerpo debe ser un objeto: lista, nulo o texto ⇒ 400', () => {
    for (const mal of [[], null, 'x', 5]) expect((validarCuerpo(mal, { exigeDryRun: false }) as { status: number }).status).toBe(400)
  })
  it('costo exactamente en el tope NO lo supera; un centavo más sí', async () => {
    const db = new DbFalsa().semilla('clients', [{ id: C, name: 'X', config: {} }]).semilla('client_brand_books', [{ id: 'b', client_id: C, version: 1, content_text: JSON.stringify({ brand_book_draft: { a: 'x' } }) }])
    const f = (entrada: number) => (async () => new Response(JSON.stringify({ output_text: 'o', usage: { input_tokens: entrada, output_tokens: 0 } }), { status: 200 })) as unknown as typeof fetch
    const r1 = await rutaOpinion(db, { client_id: C, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e' }, { f: f(1_000_000), openaiKey: 'k', modelo: 'm', precioEntrada: 0.25, precioSalida: 0 })
    expect(r1.body).toMatchObject({ costo_usd: 0.25, supero_el_tope: false })
    const r2 = await rutaOpinion(db, { client_id: C, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e' }, { f: f(1_100_000), openaiKey: 'k', modelo: 'm', precioEntrada: 0.25, precioSalida: 0 })
    expect(r2.body).toMatchObject({ supero_el_tope: true })
  })
})

describe('tarjeta · las dudas atadas se muestran', () => {
  it('un hecho con respaldo pero con una duda del perfil de cliente ideal sale en `dudas` con la duda; los demás, no', () => {
    const fuentes = [F('s', 'primaria_propia', 'Atendemos 45 pacientes al mes.'), F('x', 'sintesis', 'resumen', 'otro')]
    const dudas = [{ origen: 'perfil', frase: 'No sé si atendemos 45 pacientes al mes', terminos: ['atendemos', '45', 'pacientes', 'mes'] }]
    const insu = ins({ manual: { p: 'Atendemos 45 pacientes al mes.' }, fuentes, dudas })
    const cierre = cerrarRevision(insu, { p: 'Atendemos 45 pacientes al mes.' })
    const t = armarTarjeta({ insumos: insu, cierre, costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true })
    expect((t.metadata.dudas as unknown[]).length).toBe(1)
    expect((t.metadata.dudas as Array<{ duda: string }>)[0].duda).toMatch(/No sé si/)
    const sin = armarTarjeta({ insumos: ins({ manual: { p: 'Atendemos 45 pacientes al mes.' }, fuentes }), cierre: cerrarRevision(ins({ manual: { p: 'Atendemos 45 pacientes al mes.' }, fuentes }), { p: 'Atendemos 45 pacientes al mes.' }), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true })
    expect(sin.metadata.dudas).toEqual([])
  })
})

describe('promover · bordes', () => {
  async function conBorrador(contenido: string) {
    const db = new DbFalsa().semilla('client_historical_outputs', [{ id: 'o1', client_id: C, output_type: 'brand_book_draft_revision', status: 'draft', content: contenido, provenance_tag: {} }])
      .semilla('client_brand_books', [{ id: 'b1', client_id: C, version: 1, tagline: 'Previo', primary_colors: null, typography: ['t'], content_text: '{}' }])
    return db
  }
  it('un borrador cuyo `manual` no es un objeto (o no existe) es ilegible y no se promueve', async () => {
    for (const c of ['{"manual":5,"version_base":1}', '{"version_base":1}', 'no json']) {
      const db = await conBorrador(c)
      expect(await promoverManualRevisado(db, { output_id: 'o1', client_id: C, aprobador: 'e', empujar: (() => ({ estado: 'apagado' })) as never })).toMatchObject({ ok: false, error: 'borrador_ilegible' })
      expect(db.tablas['client_brand_books']).toHaveLength(1)
    }
  })
  it('sin eslogan nuevo, el de la versión anterior se conserva; con eslogan nuevo, manda el nuevo', async () => {
    const sin = await conBorrador(JSON.stringify({ manual: { voice_description: 'v', tagline: null }, version_base: 1 }))
    await promoverManualRevisado(sin, { output_id: 'o1', client_id: C, aprobador: 'e', empujar: (() => ({ estado: 'apagado' })) as never })
    expect(sin.tablas['client_brand_books'][1].tagline).toBe('Previo')
    const con = await conBorrador(JSON.stringify({ manual: { voice_description: 'v', tagline: 'Nuevo' }, version_base: 1 }))
    await promoverManualRevisado(con, { output_id: 'o1', client_id: C, aprobador: 'e', empujar: (() => ({ estado: 'apagado' })) as never })
    expect(con.tablas['client_brand_books'][1].tagline).toBe('Nuevo')
    expect(con.tablas['client_brand_books'][1].typography).toEqual(['t']) // lo visual se hereda
  })
})

describe('guardarBorrador · sin cambios no escribe aunque dry_run sea false (y dry_run no escribe aunque haya cambios)', () => {
  it('dry_run=true con cambios ⇒ no escribe; sin cambios ⇒ no escribe', async () => {
    const insu = ins({ manual: { m: 'Con garantía total.' }, fuentes: [F('s', 'primaria_propia', 'otra cosa')] })
    const db = new DbFalsa()
    const conCambio = await guardarBorrador(db, { insumos: insu, cierre: cerrarRevision(insu, { m: 'Otro texto.' }), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: true })
    expect(conCambio).toMatchObject({ simulado: true, sin_cambios: false }); expect(db.tablas['client_historical_outputs']).toBeUndefined()
    const igual = ins({ manual: { m: 'Texto sin marcas.' } })
    const r = await guardarBorrador(db, { insumos: igual, cierre: cerrarRevision(igual, igual.manual), costo_usd: 0, workflow_id: 'w', workflow_execution_id: 'e', dry_run: false })
    expect(r).toMatchObject({ sin_cambios: true, simulado: false }); expect(db.tablas['client_historical_outputs']).toBeUndefined()
  })
})
void filaSitio; void rutaBorrador
