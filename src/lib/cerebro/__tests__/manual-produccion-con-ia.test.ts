/**
 * Encargo 16 (21-nov) · «Cómo se produce con IA» se escribe: el pedido sale del cerebro entero, el agente va POR FLUJO
 * (aquí no se llama a ningún modelo) y la escritura es una versión nueva del manual que SOLO agrega la sección.
 * US$ 0 · base falsa.
 */
import { describe, expect, it } from 'vitest'
import { armarPedidoDeLaSeccion, FOTOS_EN_EL_PEDIDO, HECHOS_EN_EL_PEDIDO, JUICIO_DE_REFERENCIA, prepararProduccionConIa, versionQueVale } from '../manual-produccion-con-ia'
import { escribirProduccionConIa, MIN_DEL_TEXTO, TOPE_DEL_TEXTO } from '../../manual/produccion-con-ia'
import { CAMPO_POR_CLAVE } from '../../manual/campos-del-manual'
import { estadoDelManual } from '../../portero-alimenta/estado-del-manual'
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
    foto('ref', { owner_role: 'referencia', papel: 'referencia', que_muestra: 'plato ajeno que inspira', relevancia_juicio: 'sirve' }),
    foto('ref-no', { owner_role: 'referencia', papel: 'referencia', que_muestra: 'plato ajeno juzgado que-no', relevancia_juicio: 'no_sirve' }),
    foto('ref-duda', { owner_role: 'referencia', papel: 'referencia', que_muestra: 'plato ajeno dudoso', relevancia_juicio: 'dudoso' }),
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
  const insumos = { nombre: 'Náufrago', voz: 'Tuteo cercano', reglas: ['sin dobles'], fotos: [foto('f1', { oferta: 'encocado', fecha_origen: '2026-11-07' })], hechos: [{ titulo: 'Horario', contenido: 'de 12 a 20', observado_en: '2026-11-06T00:00:00Z' }], referencias: [{ que_muestra: 'plato ajeno', caption: null }], sedes: [] as Record<string, unknown>[], datosDeSedes: [] }
  it('🔴 lleva la forma firmada (prosa, sin marcas ni prohibidos, idioma del manual) y el material con su etiqueta y su fecha', () => {
    const t = armarPedidoDeLaSeccion(insumos)
    expect(t).toContain('«Cómo se produce con IA»')
    expect(t).toContain('PROSA corrida')
    expect(t).toContain('Sin marcas tipo «siempre de foto real / se crea / libre» y sin lista de prohibidos')
    expect(t).toContain('MISMO idioma y trato')
    expect(t).toContain('Tuteo cercano')
    expect(t).toContain('oferta: encocado')
    expect(t).toContain('fecha: 2026-11-07')
    expect(t).toContain('Horario (2026-11-06): de 12 a 20') // encargo 17: el hecho viaja con su fecha
    expect(t).toContain('plato ajeno')
    expect(t).not.toContain('AÚN NO tiene fotos propias')
  })
  it('🔴 (encargo 17) pide una GUÍA PARA PRODUCIR, no una pieza literaria: porqué del registro, citas, todas las sedes, cuál vale y referencias', () => {
    const t = armarPedidoDeLaSeccion(insumos)
    expect(t).toContain('GUÍA PARA PRODUCIR')
    expect(t).toContain('No es un resumen del manual ni una pieza literaria')
    expect(t).toContain('REGISTRO VISUAL del negocio y su PORQUÉ')
    expect(t).toContain('citando la foto o el hecho del que sale')
    expect(t).toContain('TODAS las sedes y ofertas')
    expect(t).toContain('una sede sin local o solo de entrega NO se omite')
    expect(t).toContain('di CUÁL VALE, nombrando su fuente y su fecha')
    expect(t).toContain('la palabra más reciente del dueño manda')
    expect(t).toContain('REFERENCIAS QUE SIRVEN')
    expect(t).toContain('no cambies de registro ni una vez') // el trato del manual, reforzado (falla ① del encargo 17)
  })
  it('🔴 (encargo 17) las SEDES van en el pedido con la versión que vale por campo: la del dueño sobre la raspada, con fuente y fecha', () => {
    const sedes = [{ id: 's-gye', clave: 'guayaquil', ciudad: 'Guayaquil' }, { id: 's-olon', clave: 'olon', ciudad: 'Olon' }]
    const datosDeSedes = [
      { sede_id: 's-gye', campo: 'direccion', valor: 'Avenida 8 NO', fuente: 'sitio', fecha: '2026-10-30' },
      { sede_id: 's-gye', campo: 'direccion', valor: 'Av. del dueño 123', fuente: 'dueno', fecha: '2026-10-20' },
      { sede_id: 's-gye', campo: 'horario', valor: 'jueves a lunes 07:00–15:00', fuente: 'sitio', fecha: '2026-10-30' },
    ]
    const t = armarPedidoDeLaSeccion({ ...insumos, sedes, datosDeSedes })
    expect(t).toContain('SEDES DEL CLIENTE')
    expect(t).toContain('sede «guayaquil» (Guayaquil)')
    expect(t).toContain('sede «olon» (Olon): sin datos registrados todavía') // una sede sin datos TAMBIÉN va: no se omite
    expect(t).toContain('direccion: Av. del dueño 123 (dueno, 2026-10-20)') // la palabra del dueño manda aunque la raspada sea más nueva
    expect(t).not.toContain('Avenida 8 NO')
    expect(t).toContain('horario: jueves a lunes 07:00–15:00 (sitio, 2026-10-30)') // sin palabra del dueño, la más nueva con su fuente
  })
  it('una foto sin fecha lo dice («sin fecha»): el agente no puede arbitrar versiones a ciegas', () => {
    const t = armarPedidoDeLaSeccion({ ...insumos, fotos: [foto('f9', { fecha_origen: null, posted_at: null })] })
    expect(t).toContain('sin fecha')
  })
  it('sin fotos propias: el pedido lo dice y pide decirlo en la primera frase', () => {
    const t = armarPedidoDeLaSeccion({ ...insumos, fotos: [] })
    expect(t).toContain('AÚN NO tiene fotos propias')
    expect(t).toContain('dilo en la primera frase')
  })
})

describe('versionQueVale (puro)', () => {
  it('por campo y sede: la más nueva del DUEÑO si la hay; si el dueño no habló, la más nueva que haya', () => {
    const r = versionQueVale([
      { sede_id: 's1', campo: 'direccion', valor: 'vieja del dueño', fuente: 'dueno', fecha: '2026-10-01' },
      { sede_id: 's1', campo: 'direccion', valor: 'nueva del dueño', fuente: 'dueno', fecha: '2026-11-01' },
      { sede_id: 's1', campo: 'direccion', valor: 'raspada más nueva', fuente: 'sitio', fecha: '2026-11-20' },
      { sede_id: 's1', campo: 'horario', valor: 'raspado viejo', fuente: 'sitio', fecha: '2026-10-01' },
      { sede_id: 's1', campo: 'horario', valor: 'raspado nuevo', fuente: 'mapas', fecha: '2026-11-10' },
      { sede_id: 's2', campo: 'direccion', valor: 'de la otra sede', fuente: 'sitio', fecha: '2026-09-01' },
    ])
    expect(r).toContainEqual(expect.objectContaining({ sede_id: 's1', campo: 'direccion', valor: 'nueva del dueño' }))
    expect(r).toContainEqual(expect.objectContaining({ sede_id: 's1', campo: 'horario', valor: 'raspado nuevo' }))
    expect(r).toContainEqual(expect.objectContaining({ sede_id: 's2', campo: 'direccion', valor: 'de la otra sede' }))
    expect(r).toHaveLength(3)
  })
})

describe('prepararProduccionConIa', () => {
  it('🔴 lee el cerebro entero: fotos propias (sin copias ni rotas), hechos vigentes y referencias, con la versión base del manual', async () => {
    const { db } = base()
    const r = await prepararProduccionConIa(db, C1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.insumos).toMatchObject({ client_name: 'Náufrago de Prueba', version_base: 3, fotos_propias: 2, con_oferta: 1, hechos: 2, referencias: 1, sedes: 0, sin_fotos_propias: false, ya_existe: false })
    expect(r.insumos.task).toContain('fachada con luz de tarde')
    expect(r.insumos.task).toContain('Abre jueves a domingo')
    expect(r.insumos.task).not.toContain('viejo') // la ficha retirada no entra
    expect(r.insumos.task).toContain('Tuteo cercano, de cevichería de playa')
  })
  it('🔴 (encargo 17) solo entran las referencias juzgadas «sirve»: las no_sirve y las dudosas quedan fuera', async () => {
    const { db } = base()
    const r = await prepararProduccionConIa(db, C1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.insumos.referencias).toBe(1)
    expect(r.insumos.task).toContain('plato ajeno que inspira')
    expect(r.insumos.task).not.toContain('juzgado que-no')
    expect(r.insumos.task).not.toContain('plato ajeno dudoso')
    expect(JUICIO_DE_REFERENCIA).toBe('sirve')
  })
  it('🔴 (encargo 17) las sedes del cliente entran al pedido con sus datos, y una lectura caída de sedes se declara', async () => {
    const t = {
      client_sedes: [{ id: 's-gye', client_id: C1, clave: 'guayaquil', ciudad: 'Guayaquil' }, { id: 's-olon', client_id: C1, clave: 'olon', ciudad: 'Olon' }],
      client_sede_datos: [
        { client_id: C1, sede_id: 's-gye', campo: 'direccion', valor_texto: 'Avenida 8 NO', fuente: 'sitio', observado_en: '2026-10-30T12:00:00Z' },
        { client_id: C1, sede_id: 's-gye', campo: 'estado_de_la_sede', valor_texto: 'abierta', fuente: 'dueno', observado_en: '2026-11-09T05:00:00Z' },
      ],
    }
    const r = await prepararProduccionConIa(base(t).db, C1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.insumos.sedes).toBe(2)
    expect(r.insumos.task).toContain('sede «guayaquil» (Guayaquil)')
    expect(r.insumos.task).toContain('estado_de_la_sede: abierta (dueno, 2026-11-09)')
    expect(r.insumos.task).toContain('sede «olon» (Olon): sin datos registrados todavía')
    const caida = await prepararProduccionConIa(base(t, { fallaEn: 'client_sede_datos' }).db, C1)
    expect(caida).toMatchObject({ ok: false, error: 'lectura_fallida' })
    expect(!caida.ok && caida.detalle).toContain('client_sede_datos')
    // (CC6 p12) también la lista de sedes: si cae en silencio, el pedido saldría sin sedes, que es justo el error de v6
    const caidaSedes = await prepararProduccionConIa(base(t, { fallaEn: 'client_sedes' }).db, C1)
    expect(caidaSedes).toMatchObject({ ok: false, error: 'lectura_fallida' })
    expect(!caidaSedes.ok && caidaSedes.detalle).toContain('client_sedes')
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
  it('🟡 (CC6 k10 · k11 en #1275) con un hecho MÁS que el corte, se quedan los más NUEVOS: el más viejo queda fuera (el orden se ejerce de verdad)', async () => {
    // el más viejo va PRIMERO en la tabla: sin orden (k10) o del más viejo al más nuevo (k11) entraría al pedido
    const hecho = (i: number, extra: Record<string, unknown> = {}) => ({ id: `hx${i}`, client_id: C1, clase: 'precio', titulo: `hecho-nuevo-${i}`, contenido: `$${i}`, vigente_hasta: null, descartada: false, retirada_en: null, observado_en: new Date(Date.UTC(2026, 10, 20, 0, i)).toISOString(), ...extra })
    const tabla = [
      hecho(0, { id: 'hx-viejo', titulo: 'el-hecho-mas-viejo', observado_en: '2026-10-01T00:00:00.000Z' }),
      ...Array.from({ length: HECHOS_EN_EL_PEDIDO }, (_x, i) => hecho(i + 1)),
    ]
    const { db } = base({ cerebro_fichas: tabla })
    const r = await prepararProduccionConIa(db, C1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.insumos.hechos).toBe(HECHOS_EN_EL_PEDIDO)
    expect(r.insumos.task).toContain('hecho-nuevo-1') // el más viejo DE LOS NUEVOS sí entra: caben exactamente los 40
    expect(r.insumos.task).not.toContain('el-hecho-mas-viejo') // sin dato de orden, esto se colaría
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
    const json = JSON.parse(String(fila.content_text)) as { brand_book_draft: Record<string, unknown>; approved_by: string; fidelity_passed: boolean }
    expect(json.brand_book_draft.produccion_con_ia).toBe(PROSA.trim())
    expect(json.brand_book_draft.voice_description).toBe(DRAFT.voice_description)
    expect(json.brand_book_draft.positioning).toBe(DRAFT.positioning)
    expect(json.approved_by).toBe('emilio') // la firma del vigente no se pisa
    expect(json.fidelity_passed).toBe(true)
    expect(fila).toMatchObject({ version: 4, human_validated: true, auto_generated_from: 'manual_produccion_con_ia', tagline: 'Donde el mar te espera' })
    const marca = (fila.provenance_tag as Record<string, unknown>).seccion_produccion_con_ia as Record<string, unknown>
    expect(marca).toMatchObject({ workflow_id: 'wf-16', workflow_execution_id: 'ex-1', en: AHORA.toISOString() })
    expect(fila.primary_colors).toEqual(['#0a4']) // la columna viaja tal cual: la fila nueva es la COPIA del vigente + la sección
  })
  it('🔴 (CC6 #1275) la procedencia ENTERA se conserva: la jefatura sigue siendo jefatura, y ni `gate_nota` ni `brand_values` ni las 6 columnas cambian', async () => {
    // una vigente como las vivas: validada por la JEFATURA, con edición del dueño, nota del gate, brand_values [] y las 6 columnas llenas
    const PROCEDENCIA_VIVA = {
      type: 'evidence', source: 'fidelity_gate', trust_level: 'tenant_trusted',
      validado_por: 'jefatura', validado_en: '2026-11-18T15:32:00Z', validado_via: 'gate_de_fidelidad',
      editado_por_dueno: { por: 'emilio', en: '2026-11-19T10:00:00Z', campos: ['tagline'] },
      manual_cambio_id: 'mc-77', relleno_de_columnas: { en: '2026-11-17T00:00:00Z', columnas: ['typography'] },
    }
    const vigente = {
      ...manual(), provenance_tag: PROCEDENCIA_VIVA, gate_nota: 'salió al tope, no alcanzó la vara', brand_values: [],
      tone_guidelines: { formal: false }, writing_style: 'claro y directo', imagery_style: 'luz natural de tarde',
      logo_usage_notes: 'sin sombras', competitor_mentions_policy: 'nunca nombrarlos', compliance_notes: 'ninguna',
    }
    const antes = estadoDelManual([{ ...vigente }])
    const t = base({ client_brand_books: [vigente] })
    const r = await escribirProduccionConIa(t.db, { client_id: C1, texto: PROSA, version_base: 3, dry_run: false, workflow_id: 'wf-16', workflow_execution_id: 'ex-1', ahora: AHORA, nuevoId: () => 'bb-4' })
    expect(r).toMatchObject({ ok: true, version: 4 })
    const fila = t.escrituras.find((w) => w.tabla === 'client_brand_books' && w.op === 'insert')!.fila as Record<string, unknown>
    // campo por campo: TODO lo que no es la sección queda IDÉNTICO al vigente (gate_nota, brand_values, las 6 columnas, human_validated…)
    const cambian = new Set(['id', 'version', 'auto_generated_from', 'provenance_tag', 'content_text'])
    for (const k of Object.keys(vigente)) if (!cambian.has(k)) expect(fila[k], `columna ${k}`).toEqual(vigente[k as keyof typeof vigente])
    // la procedencia: CADA clave del vigente sigue con su valor, y solo se SUMA la marca de la sección
    const tag = fila.provenance_tag as Record<string, unknown>
    for (const [k, v] of Object.entries(PROCEDENCIA_VIVA)) expect(tag[k], `provenance_tag.${k}`).toEqual(v)
    expect(tag.seccion_produccion_con_ia).toMatchObject({ escrita_por: 'agente por flujo', workflow_id: 'wf-16', en: AHORA.toISOString() })
    // el rótulo del manual dice LO MISMO antes y después: la jefatura NO pasa a «validado por el dueño»
    const despues = estadoDelManual([fila, { ...vigente }])
    expect(antes.estado).toBe('validado_por_la_jefatura')
    expect(despues.estado).toBe('validado_por_la_jefatura')
    expect(despues.texto).toContain('jefatura')
  })
  it('🟡 (CC6 k8 en #1275) una vigente SIN validar sigue SIN validar: escribir una sección no es una firma — human_validated queda en false y el rótulo dice «propuesta» antes y después', async () => {
    // como `df7e47cc` en vivo: propuesta del sistema, sin validado_por en la procedencia
    const vigente = { ...manual(), human_validated: false, provenance_tag: { type: 'evidence', source: 'onboarding' } }
    const antes = estadoDelManual([{ ...vigente }])
    const t = base({ client_brand_books: [vigente] })
    const r = await escribirProduccionConIa(t.db, { client_id: C1, texto: PROSA, version_base: 3, dry_run: false, workflow_id: 'wf-16', workflow_execution_id: 'ex-1', ahora: AHORA, nuevoId: () => 'bb-4' })
    expect(r).toMatchObject({ ok: true, version: 4 })
    const fila = t.escrituras.find((w) => w.tabla === 'client_brand_books' && w.op === 'insert')!.fila as Record<string, unknown>
    expect(fila.human_validated).toBe(false) // la misma clase de firma falsa del 🔴 1, por el otro lado
    const despues = estadoDelManual([fila, { ...vigente }])
    expect(antes.estado).toBe('propuesta_sin_validar')
    expect(despues.estado).toBe('propuesta_sin_validar')
    expect(despues.texto).toContain('propuesta')
  })
  it('🟡 (CC6 k7 en #1275) la versión nueva ESTRENA identidad: el insert lleva el id nuevo y no arrastra created_at ni updated_at del vigente', async () => {
    const vigente = { ...manual(), created_at: '2026-11-10T00:00:00.000Z', updated_at: '2026-11-12T00:00:00.000Z' }
    const t = base({ client_brand_books: [vigente] })
    const r = await escribirProduccionConIa(t.db, { client_id: C1, texto: PROSA, version_base: 3, dry_run: false, workflow_id: 'wf-16', workflow_execution_id: 'ex-1', ahora: AHORA, nuevoId: () => 'bb-nuevo' })
    expect(r).toMatchObject({ ok: true, version: 4, id: 'bb-nuevo' })
    const fila = t.escrituras.find((w) => w.tabla === 'client_brand_books' && w.op === 'insert')!.fila as Record<string, unknown>
    expect(fila.id).toBe('bb-nuevo') // con el id viejo, el insert chocaría con la clave y TODA escritura respondería «version_vigente_cambio»
    expect('created_at' in fila).toBe(false) // la fecha de nacimiento es de la versión nueva, no la heredada
    expect('updated_at' in fila).toBe(false)
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
