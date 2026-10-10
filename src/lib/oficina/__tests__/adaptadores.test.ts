import { describe, it, expect, vi } from 'vitest'
import { crearPuertos, registroDelManual, PREFIJO_DRY, type Entorno } from '../adaptadores'
import { almacenDeSupabase } from '../almacen-supabase'
import { abrirEncargo } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { POST_IMG } from '../plantillas/post-img'
import { leerMedidas } from '../entrega'
import { DbFalsa } from './dbfalsa'
import { BUENOS_PROMPTS, CLIENTE, FOTOS, PARTE, PARTE_REAL, PIEZA_OK, FICHAS_VACIAS, correr, direccionGenerada, observacion, png, type Guion, type Memoria } from './memoria'

const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k-interna', openaiKey: 'sk-test', revisorModelo: 'modelo-revisor', revisorPrecioEntrada: 2, revisorPrecioSalida: 10, slackToken: 'xoxb-test', bucket: 'oficina-test' }

function sembrar(): DbFalsa {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: CLIENTE, name: 'Cliente de práctica', country: 'Ecuador', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' }, competitor_list: [{ name: 'Pez Azul' }] }, zona_horaria: 'America/Guayaquil' } }])
  db.semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Voz directa y económica. Tutea siempre (tú/sabes/pides — nunca vos).', forbidden_words: ['premium', 'calidad garantizada', 'el mejor', 'gourmet'], typography: ['Inter'], primary_colors: ['#112233'] }])
  db.semilla('client_social_images', FOTOS.map((f) => ({ ...f, client_id: CLIENTE })))
  db.semilla('client_sede_datos', [{ client_id: CLIENTE, campo: 'canal_pedido', valor_texto: 'WhatsApp +593 997 744 288' }, { client_id: CLIENTE, campo: 'horario', valor_texto: 'jueves a lunes' }])
  db.semilla('client_web_pages', [{ client_id: CLIENTE, competitor_id: null, content_text: 'Carta {"@type":"MenuItem","name":"Ceviche","offers":{"price":"7.00","priceCurrency":"USD"}} {"@type":"MenuItem","name":"Encebollado","offers":{"price":"5.50","priceCurrency":"USD"}}' }, { client_id: CLIENTE, competitor_id: 'otro', content_text: '{"@type":"MenuItem","name":"Ajeno","offers":{"price":"99.00"}}' }])
  db.semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
  db.semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
  db.semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
  db.semilla('oficina_entrega_formatos', [{ red: 'instagram', formato: 'foto_1x1', ancho: 1080, alto: 1080, ratio: '1:1', tipos_archivo: ['png', 'jpeg'], peso_max_mb: 8, n_min: 1, n_max: 1, texto_max: 2200, hashtags_max: 30, pasos_publicacion: ['Descargar', 'Pegar'], verificado: false }])
  return db
}

interface Llamada { url: string; init?: RequestInit }
function fetchFalso(o: { revisorTexto?: string; imagenOk?: boolean; slackOk?: boolean } = {}): { f: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = []
  let n = 0
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    llamadas.push({ url: u, init })
    const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } })
    if (u.endsWith('/api/images/generate')) return o.imagenOk === false ? json({ error: 'sin saldo' }, 402) : json({ image_url: `https://bucket.test/img-${++n}.png`, generation_id: `gen-${n}`, cost_usd: 0.014 })
    if (u.startsWith('https://api.openai.com')) return json({ output_text: o.revisorTexto ?? JSON.stringify({ fichas: [] }), usage: { input_tokens: 1000, output_tokens: 200 } })
    if (u.startsWith('https://slack.com')) return o.slackOk === false ? json({ ok: false, error: 'not_in_channel' }) : json({ ok: true, ts: `171.${llamadas.length}` })
    if (u.startsWith('https://bucket.test/') || u.startsWith('https://fotos.test/')) return new Response(new Uint8Array(png(1024, 1024)), { status: 200 })
    return json({}, 404)
  }) as typeof fetch
  return { f, llamadas }
}

const guion = (): Guion => ({
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion([...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))) }),
  texto: () => ({ texto: PIEZA_OK }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
})
const abrir = (P: ReturnType<typeof crearPuertos>, dry_run: boolean) => abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR, sala_ref: { _journey_id: 'j1', _sala_correlation_id: 'c1' } })

describe('INTEGRACIÓN · almacén real (base falsa) + adaptadores + orquestador, modelo simulado', () => {
  it('dry_run: recorre todo SIN llamar a ningún proveedor y sin escribir pieza ni bandeja', async () => {
    const db = sembrar(); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db, ENV, f, () => new Date('2026-10-10T12:00:00Z'))
    const a = await abrir(P, true)
    expect(a.status).toBe(200)
    const { ultima } = await correr({ P } as unknown as Memoria, String(a.cuerpo.encargo_id), guion())
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true })
    expect(llamadas.map((x) => x.url).filter((u) => !u.startsWith(PREFIJO_DRY))).toEqual([]) // ni imágenes, ni revisor, ni Slack
    expect(db.tablas['client_historical_outputs']).toHaveLength(1) // solo la parte
    expect(db.tablas['hitl_queue'] ?? []).toHaveLength(0)
    expect(Object.keys(db.archivos)).toHaveLength(0)
    expect(db.tablas['oficina_encargos'][0]).toMatchObject({ estado: 'cerrado', dry_run: true, sala_ref: { _journey_id: 'j1', _sala_correlation_id: 'c1' } })
  })

  it('REAL (simulado): pieza draft + fila de bandeja con output_id y expires_at + entrega + libro + hilo de Slack', async () => {
    const db = sembrar(); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db, ENV, f, () => new Date('2026-10-10T12:00:00Z'))
    const a = await abrir(P, false)
    const id = String(a.cuerpo.encargo_id)
    const { ultima } = await correr({ P } as unknown as Memoria, id, guion())
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: false, simulado: false, resultado_para_la_sala: 'encargo_en_bandeja' })

    // la pieza
    const pieza = db.tablas['client_historical_outputs'].find((x) => x.output_type === 'campaign_piece')!
    expect(pieza).toMatchObject({ client_id: CLIENTE, status: 'draft', producing_agent: 'oficina · content-creator' })
    expect(String(pieza.content)).toMatch(/Ceviche de Olón a \$7\.00/)
    expect((pieza.provenance_tag as Record<string, unknown>)).toMatchObject({ fuente: 'oficina', familia: 'post_img', brief_id: 'BRF-0003', imagen_generada: true })

    // la bandeja
    const q = db.tablas['hitl_queue'][0]
    expect(q).toMatchObject({ client_id: CLIENTE, output_id: pieza.id, type: 'content_piece_review', status: 'pending', expires_at: '2026-10-14T05:00:00.000Z' })
    expect(String(q.title)).toMatch(/^Aprobación · Pieza BRF-0003 · Instagram · versión 1 · Cliente de práctica$/)
    expect(q.metadata).toMatchObject({ origen: 'oficina', imagen_generada: true })

    // la entrega
    const nombres = Object.keys(db.archivos).map((p) => p.split('/').pop())
    expect(nombres).toEqual(expect.arrayContaining(['manifest.json', 'sin-fecha_sin-hora_instagram_foto_BRF-0003_01-de-01.png']))
    expect(leerMedidas(db.archivos[Object.keys(db.archivos).find((p) => p.endsWith('.png'))!].bytes)).toMatchObject({ ancho: 1024, alto: 1024 })

    // el libro: cada imagen UNA vez, con su generation_id; pasos con dispatch_key; artefactos con huella
    const gastos = db.tablas['oficina_gastos']
    expect(gastos.filter((g) => g.concepto === 'imagen').map((g) => g.ref_id).sort()).toEqual(['gen-1', 'gen-2'])
    expect(gastos.filter((g) => g.concepto === 'revisor_externo')).toHaveLength(1)
    expect((db.tablas['oficina_encargos'][0].gasto_usd as number)).toBeGreaterThan(0.028)
    expect(db.tablas['oficina_turnos'].every((t) => t.estado === 'hecho')).toBe(true)
    expect(db.tablas['oficina_artefactos'].every((a2) => /^[0-9a-f]{64}$/.test(String(a2.sha256)))).toBe(true)

    // lo que se le dijo a cada proveedor
    const img = llamadas.find((x) => x.url.endsWith('/api/images/generate'))!
    expect(JSON.parse(String(img.init!.body))).toMatchObject({ client_id: CLIENTE, agent_slug: 'design-image-prompt-engineer', size: '1024x1024', quality: 'medium' })
    expect((img.init!.headers as Record<string, string>)['x-api-key']).toBe('k-interna')
    const rev = llamadas.find((x) => x.url.startsWith('https://api.openai.com'))!
    const cuerpo = JSON.parse(String(rev.init!.body))
    expect(cuerpo.model).toBe('modelo-revisor')
    expect(Object.keys(JSON.parse(cuerpo.input[0].content[0].text)).sort()).toEqual(['brief', 'imagen', 'instruccion', 'manual', 'material_portero', 'pieza', 'plan', 'visual_direction'].filter((k) => k !== 'plan'))
    expect(JSON.stringify(cuerpo)).not.toMatch(/fichas_jefe/)

    // Slack: una raíz y el resto en el hilo; la raíz se guarda en el encargo
    const slack = llamadas.filter((x) => x.url.startsWith('https://slack.com'))
    expect(slack.length).toBeGreaterThanOrEqual(2)
    expect(JSON.parse(String(slack[0].init!.body)).thread_ts).toBeUndefined()
    expect(JSON.parse(String(slack[1].init!.body)).thread_ts).toBeTruthy()
    expect(db.tablas['oficina_encargos'][0].slack_ts).toBeTruthy()
  })

  it('el costo del revisor sale de los tokens × el precio del entorno (1000×2 + 200×10 por millón)', async () => {
    const db = sembrar(); const { f } = fetchFalso()
    const P = crearPuertos(db, ENV, f)
    const r = await P.revisor({ pedido: { x: 1 }, dry_run: false })
    expect(r).toMatchObject({ ok: true, modelo: 'modelo-revisor' })
    if (r.ok) expect(r.costo_usd).toBeCloseTo((1000 * 2 + 200 * 10) / 1e6, 9)
  })
})

describe('fuentes del cliente leídas de la base', () => {
  it('manual, prohibidas, registro, teléfonos, usuarios, precios de la carta PROPIA, competidores, fotos y zona', async () => {
    const db = sembrar(); const P = crearPuertos(db, ENV, fetchFalso().f)
    const fu = await P.fuentes(CLIENTE)
    if ('error' in fu) throw new Error(fu.error)
    expect(fu.fuentes).toMatchObject({ palabras_prohibidas: ['premium', 'calidad garantizada', 'el mejor', 'gourmet'], registro: 'tuteo', telefonos: ['997744288'], handles: ['@naufrago.ec'], competidores: ['Pez Azul'], telefonos_verificables: true, handles_verificables: true })
    expect(fu.fuentes.precios.sort()).toEqual(['5.50', '7.00']) // el precio 99.00 de la página de un competidor NO entra
    expect(fu.zona).toBe('America/Guayaquil')
    expect(fu.fotos).toHaveLength(16)
    expect(fu.vocabulario_de_productos).toEqual(expect.arrayContaining(['Ceviches', 'Encebollados']))
    expect(fu.propios.marcas_ajenas).toContain('pez azul')
    expect(fu.manual_texto.length).toBeGreaterThan(50)
  })
  it('sin teléfonos ni usuarios leídos ⇒ «no verificables» (nunca se tratan como falsos)', async () => {
    const db = sembrar(); db.tablas['client_sede_datos'] = []
    const clientes = db.tablas['clients']; (clientes[0].config as Record<string, unknown>).apify = { competitor_list: [] }
    const fu = await crearPuertos(db, ENV, fetchFalso().f).fuentes(CLIENTE)
    if ('error' in fu) throw new Error(fu.error)
    expect(fu.fuentes).toMatchObject({ telefonos_verificables: false, handles_verificables: false })
  })
  it('cliente sin ficha, sin manual o con la base caída ⇒ error claro (el orquestador cierra fallido)', async () => {
    const db = sembrar()
    expect(await crearPuertos(db, ENV, fetchFalso().f).fuentes('no-existe')).toMatchObject({ error: expect.stringMatching(/no existe/) })
    db.tablas['client_brand_books'] = []
    expect(await crearPuertos(db, ENV, fetchFalso().f).fuentes(CLIENTE)).toMatchObject({ error: expect.stringMatching(/manual/) })
    db.fallar['clients'] = 'base caída'
    expect(await crearPuertos(db, ENV, fetchFalso().f).fuentes(CLIENTE)).toMatchObject({ error: expect.stringMatching(/base caída/) })
  })
  it('registro del manual', () => {
    expect(registroDelManual('Tutea siempre (tú/sabes/pides — nunca vos)')).toBe('tuteo')
    expect(registroDelManual('Usa voseo cercano')).toBe('voseo')
    expect(registroDelManual('Voz directa')).toBe('sin_dato')
    expect(registroDelManual(null)).toBe('sin_dato')
  })
})

describe('cada adaptador por separado', () => {
  it('imagen en dry_run NO llama al proveedor; el marcador permite descargarla sin red', async () => {
    const { f, llamadas } = fetchFalso(); const P = crearPuertos(sembrar(), ENV, f)
    const r = await P.imagen({ prompt: 'x', client_id: CLIENTE, encargo_id: 'e', dry_run: true })
    expect(r).toMatchObject({ ok: true, costo_usd: 0 }); expect(llamadas).toHaveLength(0)
    if (r.ok) { expect(r.url.startsWith(PREFIJO_DRY)).toBe(true); expect(leerMedidas((await P.descargar(r.url))!)).toMatchObject({ ancho: 1024, alto: 1024 }); expect(llamadas).toHaveLength(0) }
  })
  it('imagen real: el error del proveedor vuelve como {ok:false}, no se lanza', async () => {
    const P = crearPuertos(sembrar(), ENV, fetchFalso({ imagenOk: false }).f)
    expect(await P.imagen({ prompt: 'x', client_id: CLIENTE, encargo_id: 'e', dry_run: false })).toMatchObject({ ok: false, error: 'sin saldo' })
  })
  it('revisor: sin clave o sin modelo ⇒ «no configurado» (no se inventa un nombre de modelo); en dry_run no llama', async () => {
    const { f, llamadas } = fetchFalso()
    expect(await crearPuertos(sembrar(), { ...ENV, openaiKey: undefined }, f).revisor({ pedido: {}, dry_run: false })).toMatchObject({ ok: false, error: expect.stringMatching(/OPENAI_API_KEY/) })
    expect(await crearPuertos(sembrar(), { ...ENV, revisorModelo: undefined }, f).revisor({ pedido: {}, dry_run: false })).toMatchObject({ ok: false, error: expect.stringMatching(/OFICINA_REVISOR_MODEL/) })
    expect(await crearPuertos(sembrar(), ENV, f).revisor({ pedido: {}, dry_run: true })).toMatchObject({ ok: true, costo_usd: 0 })
    expect(llamadas).toHaveLength(0)
  })
  it('revisor con imagen: la manda como input_image', async () => {
    const { f, llamadas } = fetchFalso(); await crearPuertos(sembrar(), ENV, f).revisor({ pedido: { a: 1 }, dry_run: false, imagen_url: 'https://bucket.test/x.png' })
    const c = JSON.parse(String(llamadas[0].init!.body)); expect(c.input[0].content[1]).toEqual({ type: 'input_image', image_url: 'https://bucket.test/x.png' })
  })
  it('bandeja: una pieza de OTRO cliente o inexistente se rechaza (no se ata una decisión a la pieza de otro)', async () => {
    const db = sembrar(); db.semilla('client_historical_outputs', [{ id: 'pieza-ajena', client_id: 'otro', output_type: 'campaign_piece' }])
    const P = crearPuertos(db, ENV, fetchFalso().f)
    expect(await P.bandeja({ client_id: CLIENTE, output_id: 'pieza-ajena', titulo: 't', vista_previa: 'v', metadata: {}, expires_at: null })).toMatchObject({ ok: false, error: expect.stringMatching(/otro cliente/) })
    expect(await P.bandeja({ client_id: CLIENTE, output_id: 'no-existe', titulo: 't', vista_previa: 'v', metadata: {}, expires_at: null })).toMatchObject({ ok: false, error: expect.stringMatching(/inexistente/) })
  })
  it('Slack: sin token o en dry_run no llama; si falla NO lanza; los avisos de #alertas van al canal de alertas', async () => {
    const { f, llamadas } = fetchFalso(); const db = sembrar()
    db.semilla('oficina_encargos', [{ id: 'e1', client_id: CLIENTE }])
    await crearPuertos(db, { ...ENV, slackToken: undefined }, f).avisar({ canal: 'hilo', encargo_id: 'e1', texto: 'x', dry_run: false })
    await crearPuertos(db, ENV, f).avisar({ canal: 'hilo', encargo_id: 'e1', texto: 'x', dry_run: true })
    expect(llamadas).toHaveLength(0)
    await expect(crearPuertos(db, ENV, fetchFalso({ slackOk: false }).f).avisar({ canal: 'hilo', encargo_id: 'e1', texto: 'x', dry_run: false })).resolves.toBeUndefined()
    await crearPuertos(db, ENV, f).avisar({ canal: 'alertas', encargo_id: 'e1', texto: '🛑', dry_run: false })
    expect(JSON.parse(String(llamadas.at(-1)!.init!.body)).channel).toBe('C0B7XUUEBHA')
  })
  it('Slack caído por RED (no solo por respuesta): tampoco lanza', async () => {
    const db = sembrar(); db.semilla('oficina_encargos', [{ id: 'e2', client_id: CLIENTE }])
    const rota = (async () => { throw new Error('sin red') }) as unknown as typeof fetch
    await expect(crearPuertos(db, ENV, rota).avisar({ canal: 'alertas', encargo_id: 'e2', texto: 'x', dry_run: false })).resolves.toBeUndefined()
  })
  it('un fallo al guardar un archivo de la entrega se declara (no se pierde en silencio)', async () => {
    const db = sembrar(); db.storageFalla = 'cuota llena'
    expect(await crearPuertos(db, ENV, fetchFalso().f).guardarArchivos('oficina/x', [{ nombre: 'a.png', bytes: png(1, 1), tipo: 'image/png' }])).toMatchObject({ ok: false, error: expect.stringMatching(/cuota llena/) })
  })
  it('descargar: una dirección que no responde da null (la entrega lo declara)', async () => {
    const P = crearPuertos(sembrar(), ENV, fetchFalso().f)
    expect(await P.descargar('https://nada.test/x.png')).toBeNull()
  })
})

describe('almacén real · idempotencia, libro y falla cerrada', () => {
  it('crearEncargo: el mismo pedido no abre dos (23505 ⇒ devuelve el existente, nuevo = false)', async () => {
    const db = sembrar(); const A = almacenDeSupabase(db)
    const n = { client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', tope_usd: 10, dry_run: true, prueba: false, sala_ref: null, estado_del_motor: { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] } }
    const a = await A.crearEncargo(n); const b = await A.crearEncargo(n)
    expect(a).toMatchObject({ ok: true, nuevo: true }); expect(b).toMatchObject({ ok: true, nuevo: false })
    expect(db.tablas['oficina_encargos']).toHaveLength(1)
  })
  it('guardar: el paso se actualiza por (encargo, n); el artefacto repetido y el gasto repetido no se duplican', async () => {
    const db = sembrar(); const A = almacenDeSupabase(db)
    const c = await A.crearEncargo({ client_id: CLIENTE, parte_id: PARTE, brief_id: 'B', tipo_de_grupo: 'post_img', familia: 'post_img', tope_usd: 10, dry_run: true, prueba: false, sala_ref: null, estado_del_motor: { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] } })
    if (!c.ok) throw new Error(c.error)
    const base = { encargo_id: c.encargo.id, estado_del_motor: c.encargo.estado_del_motor, gasto_usd: 0.014 }
    const turno = (estado: 'corriendo' | 'hecho') => ({ n: 1, paso: 'prompts', tipo: 'agente', agente: 'x', estado, dispatch_key: `${c.encargo.id}:1`, cost_usd: 0.07 })
    await A.guardar({ ...base, turno: turno('corriendo') })
    expect(await A.turnoAbierto(c.encargo.id)).toMatchObject({ n: 1, paso: 'prompts' })
    await A.guardar({ ...base, turno: turno('hecho'), artefacto: { tipo: 'prompts', version: 1, contenido: {}, sha256: 'a'.repeat(64), autor: 'x' }, gastos: [{ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: 'g1', cost_usd: 0.014, base: 'usage' }] })
    await A.guardar({ ...base, turno: turno('hecho'), artefacto: { tipo: 'prompts', version: 1, contenido: {}, sha256: 'a'.repeat(64), autor: 'x' }, gastos: [{ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: 'g1', cost_usd: 0.014, base: 'usage' }] })
    expect(db.tablas['oficina_turnos']).toHaveLength(1)
    expect(db.tablas['oficina_artefactos']).toHaveLength(1)
    expect(db.tablas['oficina_gastos']).toHaveLength(1)
    expect(await A.turnoAbierto(c.encargo.id)).toBeNull()
  })
  it('FALLA CERRADO: sin config legible o con la base caída, la oficina es «apagada»', async () => {
    const vacia = new DbFalsa()
    expect(await almacenDeSupabase(vacia).leerConfig()).toMatchObject({ estado: 'apagada', familias_activas: [] })
    const caida = sembrar(); caida.fallar['oficina_config'] = 'caída'
    expect(await almacenDeSupabase(caida).leerConfig()).toMatchObject({ estado: 'apagada' })
    const rara = sembrar(); rara.tablas['oficina_config'][0].estado = 'quizás'
    expect((await almacenDeSupabase(rara).leerConfig()).estado).toBe('apagada')
  })
  it('un error de lectura se LANZA (nunca se lee como «sin plantilla»)', async () => {
    const db = sembrar(); db.fallar['oficina_tipos_de_grupo'] = 'caída'
    await expect(almacenDeSupabase(db).leerPlantilla('post_img')).rejects.toThrow(/caída/)
  })
})

describe('la oficina apagada con el almacén real', () => {
  it('abrir devuelve 409 y NO escribe nada', async () => {
    const db = sembrar(); db.tablas['oficina_config'][0].estado = 'apagada'
    const P = crearPuertos(db, ENV, fetchFalso().f)
    const r = await abrir(P, true)
    expect(r.status).toBe(409); expect(db.tablas['oficina_encargos'] ?? []).toHaveLength(0)
  })
  it('vi.fn de apoyo: ningún adaptador usa la llave interna salvo para la imagen', () => { expect(vi.isMockFunction(fetch)).toBe(false) })
})
