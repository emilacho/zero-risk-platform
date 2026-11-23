/**
 * Encargo 16 (21-nov) · «Cómo se produce con IA» se escribe: el pedido sale del cerebro entero, el agente va POR FLUJO
 * (aquí no se llama a ningún modelo) y la escritura es una versión nueva del manual que SOLO agrega la sección.
 * US$ 0 · base falsa.
 */
import { describe, expect, it } from 'vitest'
import { armarPedidoDeLaSeccion, FOTOS_EN_EL_PEDIDO, prepararProduccionConIa } from '../manual-produccion-con-ia'
import { escribirProduccionConIa, MIN_DEL_TEXTO, TOPE_DEL_TEXTO } from '../../manual/produccion-con-ia'
import { CAMPO_POR_CLAVE } from '../../manual/campos-del-manual'
import { crearBaseFalsa } from '../../portero-alimenta/__tests__/base-falsa'

const C1 = 'c0000000-0000-4000-8000-000000000016'
const AHORA = new Date('2026-11-23T12:00:00Z')
const DRAFT = { voice_description: 'Tuteo cercano, de cevichería de playa: fresco, directo y con sal.', positioning: 'La cevichería de Olón', produccion_con_ia: undefined as unknown, reglas_de_escritura: ['nada de signos de exclamación dobles'] }
const manual = (extra: Record<string, unknown> = {}) => ({ id: 'bb-3', client_id: C1, version: 3, content_text: JSON.stringify({ brand_book_draft: { ...DRAFT, ...extra }, approved_by: 'emilio', approved_at: '2026-11-18T15:32:00Z', fidelity_passed: true }), human_validated: true, tagline: 'Donde el mar te espera', primary_colors: ['#0a4'], typography: null, imagery_style: null, logo_usage_notes: null })
const foto = (id: string, extra: Record<string, unknown> = {}) => ({ id, client_id: C1, estado: 'ok', owner_role: 'propio', papel: 'propio', tipo: 'post_image', que_muestra: 'ceviche de concha en mesa de madera', producto_visto: ['ceviche'], texto_visible: null, tipo_de_toma: 'cenital', formato: 'cuadrado', con_personas: false, oferta: null, fecha_origen: null, posted_at: '2026-11-10T12:00:00Z', created_at: '2026-11-10T12:00:00Z', caption: 'x', duplicado_de: null, hash_archivo: null, etiquetada_en: '2026-11-11T00:00:00Z', ...extra })
const base = (t: Record<string, Array<Record<string, unknown>>> = {}, opciones: Parameters<typeof crearBaseFalsa>[1] = {}) => crearBaseFalsa({
  clients: [{ id: C1, name: 'Náufrago de Prueba' }],
  client_brand_books: [manual()],
  client_social_images: [
    foto('f1', { oferta: 'encocado de viernes', fecha_origen: '2026-11-07' }),
    foto('f2', { tipo: 'maps_foto', que_muestra: 'fachada con luz de tarde' }),
    foto('dup', { duplicado_de: 'f1' }),
    foto('ref', { owner_role: 'referencia', papel: 'referencia', que_muestra: 'plato ajeno que inspira' }),
    foto('rota', { estado: 'no_bajo' }),
  ],
  cerebro_fichas: [
    { id: 'h1', client_id: C1, clase: 'dato_del_dueno', titulo: 'Horario real', contenido: 'Abre jueves a domingo, de 12 a 20.', vigente_hasta: null, descartada: false, retirada_en: null },
    { id: 'h2', client_id: C1, clase: 'precio', titulo: 'Ceviche', contenido: '$12', vigente_hasta: null, descartada: false, retirada_en: null },
    { id: 'h-retirada', client_id: C1, clase: 'dato_del_dueno', titulo: 'viejo', contenido: 'x', vigente_hasta: null, descartada: false, retirada_en: '2026-11-01T00:00:00Z' },
    { id: 'h-vencida', client_id: C1, clase: 'precio', titulo: 'promo', contenido: 'x', vigente_hasta: '2026-10-01T00:00:00Z', descartada: false, retirada_en: null },
  ],
  ...t,
}, opciones)

describe('armarPedidoDeLaSeccion (puro)', () => {
  const insumos = { nombre: 'Náufrago', voz: 'Tuteo cercano', reglas: ['sin dobles'], fotos: [foto('f1', { oferta: 'encocado', fecha_origen: '2026-11-07' })], hechos: [{ titulo: 'Horario', contenido: 'de 12 a 20' }], referencias: [{ que_muestra: 'plato ajeno', caption: null }] }
  it('🔴 lleva la forma firmada (prosa, sin marcas ni prohibidos, idioma del manual) y el material con su etiqueta', () => {
    const t = armarPedidoDeLaSeccion(insumos)
    expect(t).toContain('«Cómo se produce con IA»')
    expect(t).toContain('PROSA corrida')
    expect(t).toContain('Sin marcas tipo «siempre de foto real / se crea / libre» y sin lista de prohibidos')
    expect(t).toContain('MISMO idioma y trato')
    expect(t).toContain('Tuteo cercano')
    expect(t).toContain('oferta: encocado')
    expect(t).toContain('fecha: 2026-11-07')
    expect(t).toContain('Horario: de 12 a 20')
    expect(t).toContain('plato ajeno')
    expect(t).not.toContain('AÚN NO tiene fotos propias')
  })
  it('sin fotos propias: el pedido lo dice y pide decirlo en la primera frase', () => {
    const t = armarPedidoDeLaSeccion({ ...insumos, fotos: [] })
    expect(t).toContain('AÚN NO tiene fotos propias')
    expect(t).toContain('dilo en la primera frase')
  })
})

describe('prepararProduccionConIa', () => {
  it('🔴 lee el cerebro entero: fotos propias (sin copias ni rotas), hechos vigentes y referencias, con la versión base del manual', async () => {
    const { db } = base()
    const r = await prepararProduccionConIa(db, C1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.insumos).toMatchObject({ client_name: 'Náufrago de Prueba', version_base: 3, fotos_propias: 2, con_oferta: 1, hechos: 2, referencias: 1, sin_fotos_propias: false, ya_existe: false })
    expect(r.insumos.task).toContain('fachada con luz de tarde')
    expect(r.insumos.task).toContain('Abre jueves a domingo')
    expect(r.insumos.task).not.toContain('viejo') // la ficha retirada no entra
    expect(r.insumos.task).toContain('Tuteo cercano, de cevichería de playa')
  })
  it('un cliente sin fotos propias prepara igual y lo declara', async () => {
    const { db } = base({ client_social_images: [] })
    const r = await prepararProduccionConIa(db, C1)
    expect(r.ok && r.insumos.sin_fotos_propias).toBe(true)
    expect(r.ok && r.insumos.task).toContain('AÚN NO tiene fotos propias')
  })
  it('si el manual ya trae la sección → ya_existe (y con `reescribir: true` prepara igual)', async () => {
    const { db } = base({ client_brand_books: [manual({ produccion_con_ia: 'ya escrita' })] })
    const r = await prepararProduccionConIa(db, C1)
    expect(r).toMatchObject({ ok: false, status: 409, error: 'ya_existe' })
    const r2 = await prepararProduccionConIa(db, C1, { reescribir: true })
    expect(r2.ok && r2.insumos.ya_existe).toBe(true)
  })
  it('sin manual no hay sección (nace con el manual); sin cliente, 404; una lectura caída se declara', async () => {
    expect(await prepararProduccionConIa(base({ client_brand_books: [] }).db, C1)).toMatchObject({ ok: false, error: 'sin_manual' })
    expect(await prepararProduccionConIa(base({ clients: [] }).db, C1)).toMatchObject({ ok: false, status: 404 })
    const caida = await prepararProduccionConIa(base({}, { fallaEn: 'client_social_images' }).db, C1)
    expect(caida).toMatchObject({ ok: false, error: 'lectura_fallida' })
    expect(!caida.ok && caida.detalle).toContain('client_social_images')
  })
  it('el pedido lleva a lo más FOTOS_EN_EL_PEDIDO fotos (lo demás queda para otra versión, nada se corta a medias)', async () => {
    const muchas = Array.from({ length: 80 }, (_x, i) => foto(`m${i}`))
    const { db } = base({ client_social_images: muchas })
    const r = await prepararProduccionConIa(db, C1)
    expect(r.ok && r.insumos.fotos_propias).toBe(FOTOS_EN_EL_PEDIDO)
  })
})

describe('escribirProduccionConIa', () => {
  const PROSA = 'La luz de la tarde en la fachada y el ceviche servido en mesa de madera marcan el registro: todo lo que muestra producto sale de sus fotos reales. '.repeat(3)
  it('🔴 guarda una versión NUEVA que SOLO agrega la sección: las demás secciones, el eslogan y la herencia quedan intactos', async () => {
    const t = base()
    const r = await escribirProduccionConIa(t.db, { client_id: C1, texto: PROSA, version_base: 3, dry_run: false, workflow_id: 'wf-16', workflow_execution_id: 'ex-1', ahora: AHORA, nuevoId: () => 'bb-4' })
    expect(r).toMatchObject({ ok: true, dry_run: false, version: 4, id: 'bb-4', solo_cambia: 'produccion_con_ia' })
    const ins = t.escrituras.find((w) => w.tabla === 'client_brand_books' && w.op === 'insert')!
    const fila = ins.fila as Record<string, unknown>
    const json = JSON.parse(String(fila.content_text)) as { brand_book_draft: Record<string, unknown>; approved_by: string; gate_nota: string }
    expect(json.brand_book_draft.produccion_con_ia).toBe(PROSA.trim())
    expect(json.brand_book_draft.voice_description).toBe(DRAFT.voice_description)
    expect(json.brand_book_draft.positioning).toBe(DRAFT.positioning)
    expect(json.approved_by).toBe('emilio') // la firma del vigente no se pisa
    expect(json.gate_nota).toContain('solo se agregó la sección')
    expect(fila).toMatchObject({ version: 4, human_validated: true, auto_generated_from: 'manual_produccion_con_ia', tagline: 'Donde el mar te espera' })
    expect((fila.provenance_tag as Record<string, unknown>).workflow_id).toBe('wf-16')
    expect(fila.primary_colors).toEqual(['#0a4']) // la herencia de columnas, como en la promoción
  })
  it('en seco valida todo y NO escribe nada', async () => {
    const t = base()
    const r = await escribirProduccionConIa(t.db, { client_id: C1, texto: PROSA, version_base: 3, dry_run: true })
    expect(r).toMatchObject({ ok: true, dry_run: true, version: null })
    expect(t.escrituras).toEqual([])
  })
  it('nada se recorta: el texto corto y el pasado de tope se RECHAZAN con su largo y su tope', async () => {
    const corto = await escribirProduccionConIa(base().db, { client_id: C1, texto: 'muy corta', version_base: 3, dry_run: false })
    expect(corto).toMatchObject({ ok: false, status: 400, error: 'texto_invalido' })
    expect(!corto.ok && corto.detalle).toContain(String(MIN_DEL_TEXTO))
    const largo = await escribirProduccionConIa(base().db, { client_id: C1, texto: 'x'.repeat(TOPE_DEL_TEXTO + 1), version_base: 3, dry_run: false })
    expect(largo).toMatchObject({ ok: false, status: 400, error: 'texto_demasiado_largo' })
    expect(!largo.ok && largo.detalle).toContain(String(TOPE_DEL_TEXTO))
    expect(!largo.ok && largo.detalle).toContain(String(TOPE_DEL_TEXTO + 1))
  })
  it('la versión vigente cambió desde que se preparó → nada se pisa y se declara', async () => {
    const r = await escribirProduccionConIa(base().db, { client_id: C1, texto: PROSA, version_base: 2, dry_run: false })
    expect(r).toMatchObject({ ok: false, status: 409, error: 'version_vigente_cambio' })
  })
})

describe('la sección en el catálogo del manual', () => {
  it('existe, es texto, editable en el dashboard y NO obligatoria (un manual sin ella no queda incompleto)', () => {
    expect(CAMPO_POR_CLAVE.produccion_con_ia).toMatchObject({ tipo: 'texto', ruta: 'produccion_con_ia', editable: true, obligatorio: false, etiqueta: 'Cómo se produce con IA' })
  })
})
