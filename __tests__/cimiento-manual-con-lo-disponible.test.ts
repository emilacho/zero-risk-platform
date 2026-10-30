/**
 * EL MANUAL TRABAJA CON LO QUE HAYA DISPONIBLE (CC#1 · 20-oct · firma de Emilio 15:22 · señal de Lenovo 15:30; rehace #661). US$ 0.
 * Se EJECUTA el texto real de cada nodo del Cimiento (Fan-out prep · Uso · Mezclar · Juez · Promote · Return) con el mundo simulado.
 * Dos casos de demostración: (A) el trato de la prueba real (solo Instagram) · (B) un cliente DESDE CERO (solo nombre, rubro y ciudad).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/ssLtwYPt7zxuvnM2')
const M = await import(pathToFileURL(path.join(D, 'construir-manual-con-lo-disponible-2026-10-20.mjs')).href)
type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const leer = (f: string, dir = D) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Flujo
const antes = leer('ssLtwYPt7zxuvnM2-ANTES-manual-con-lo-disponible-2026-10-20.json')
const nuevo = leer('ssLtwYPt7zxuvnM2-ARREGLADO-manual-con-lo-disponible-2026-10-20.json')
const seco = leer('ssLtwYPt7zxuvnM2-ARREGLADO-seco-2026-10-19.json', path.resolve(D, '../modo-seco'))
const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x }
const cod = (f: Flujo, n: string) => String(nodo(f, n).parameters.jsCode)
const N = M.N as Record<string, string>

type Mundo = { nodos?: Record<string, any>; todos?: Record<string, any[]>; json?: any }
/** el motor en miniatura: $('nodo').first()/.all() salen del mundo; un nodo que no corrió LANZA, como en n8n */
function correr(code: string, m: Mundo) {
  const nodos = m.nodos ?? {}
  const $ = (n: string) => {
    if (!(n in nodos) && !(m.todos && n in m.todos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: nodos[n] }), all: () => (m.todos?.[n] ?? [nodos[n]]).map((j) => ({ json: j })) }
  }
  return new Function('$', '$json', '$input', '$workflow', '$execution', code)($, m.json ?? {}, { first: () => ({ json: m.json ?? {} }), all: () => [{ json: m.json ?? {} }] }, { id: 'ssLtwYPt7zxuvnM2' }, { id: 'EX-1' }) as Array<{ json: any }>
}

// ───── los dos casos de demostración
const TRATO = { client_id: 'c-1', client_name: 'Cliente X', industry: 'rubro de prueba', website: '', country: 'EC', location: 'Guayaquil, EC' }
const INSTAGRAM = 'Perfil de Instagram · Biografía: Seguridad Industrial · Venta y recarga de extintores · Señalética\nSeguidores: 800\nPublicaciones recientes: 12 · ' + 'x'.repeat(200)
const COMPETIDORES = [{ name: 'Competidor 1' }, { name: 'Competidor 2' }]
const ICP = { segments: ['empresas medianas'], pain_points: ['incumplimiento'], goals: [], objections: [], preferred_channels: [] }
const RESUMEN = 'Resumen del descubrimiento del negocio con suficiente texto para contar como fuente real de la corrida. '.repeat(2)
const CASO_A = { // el trato de la prueba: solo el Instagram propio llegó
  deal: TRATO, paquete: { discovery_summary: RESUMEN, competitors: COMPETIDORES, icp_signals: ICP, materia_cliente: { sitio_estado: 'sin_dato', sitio_texto: '', instagram_estado: 'trajo', instagram_propio: INSTAGRAM, frase_propia: '' } },
}
const CASO_B = { // desde cero: solo nombre, rubro y ciudad; el descubrimiento no alcanzó a traer nada
  deal: TRATO, paquete: { discovery_summary: '', competitors: [], materia_cliente: null },
}
const mundoFanout = (c: { deal: any; paquete: any }) => ({ nodos: { 'Validate Deal Data': c.deal, 'Confirm barato · competitor list': { discovery_package: c.paquete } } })
const fan = (f: Flujo, c: { deal: any; paquete: any }) => correr(cod(f, N.fanout), mundoFanout(c))[0].json

// el bloque, suelto (para probar sus reglas una por una)
const bloque = new Function(M.BLOQUE + '\nreturn { udDisponible, usoDeLoDisponible }')() as { udDisponible: (g: any) => any; usoDeLoDisponible: (d: any, g: any) => any }
const GROUND_A = fan(nuevo, CASO_A)._grounding_refs
const GROUND_B = fan(nuevo, CASO_B)._grounding_refs
const BORRADOR_BUENO = { positioning: 'Seguridad industrial con venta y recarga de extintores y señalética para empresas medianas.', icp_summary: 'Empresas medianas que necesitan cumplir la norma y evitar sanciones por incumplimiento.', voice_description: 'Cercana y técnica, como en su perfil: «Venta y recarga de extintores».', personalidad: ['técnica'], tagline_opciones: [], mensajes_clave: [] }

describe('qué recibe el manual · los dos casos (el Fan-out real, antes y después)', () => {
  it('🔴 A · el trato de la prueba (solo Instagram): el manual recibe el perfil, el público ideal, los competidores y el resumen; y la regla de «con lo disponible»', () => {
    const j = fan(nuevo, CASO_A)
    const disp = bloque.udDisponible(j._grounding_refs)
    expect(disp.propio).toEqual(['el perfil de Instagram del cliente'])
    expect(disp.contexto).toEqual(['el público ideal', 'los competidores', 'el resumen del descubrimiento'])
    for (const lente of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) {
      expect(j.tasks[lente]).toContain('CON LO DISPONIBLE (regla del dueño)')
      expect(j.tasks[lente]).toContain('Venta y recarga de extintores') // el texto del perfil llega a CADA lente
    }
  })
  it('🔴 B · cliente DESDE CERO (solo nombre, rubro y ciudad): no hay fuentes, el manual igual recibe el pedido y la regla; la vara no tiene qué exigir ⇒ la cadena sigue', () => {
    const j = fan(nuevo, CASO_B)
    expect(bloque.udDisponible(j._grounding_refs)).toEqual({ propio: [], contexto: [] })
    for (const lente of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) expect(j.tasks[lente]).toContain('PROPUESTA (no es dato del cliente)')
    expect(j._grounding_refs).toMatchObject({ client_name: 'Cliente X', industry: 'rubro de prueba' })
  })
  it('🔴 la evidencia NO cede un carácter: lo que el manual recibía antes lo sigue recibiendo igual; solo se suma la regla, y el tope sube exactamente lo que ella pesa', () => {
    for (const c of [CASO_A, CASO_B]) {
      const a = fan(antes, c), n = fan(nuevo, c)
      expect(n._grounding_refs).toEqual(a._grounding_refs)
      expect(n._corte.evidencia_omitida).toEqual(a._corte.evidencia_omitida)
      expect(n._corte.tope).toBe(a._corte.tope + M.REGLA_CON_LO_DISPONIBLE.length)
      for (const l of Object.keys(a.tasks)) expect(n.tasks[l].length).toBe(a.tasks[l].length + M.REGLA_CON_LO_DISPONIBLE.length)
      for (const l of Object.keys(a.tasks)) expect(n._corte.margen_por_lente[l]).toBe(a._corte.margen_por_lente[l])
    }
  })
  it('el pedido de ANTES no trae la regla (así se ve que el cambio es de esta pieza)', () => {
    expect(fan(antes, CASO_A).tasks['editor-en-jefe']).not.toContain('CON LO DISPONIBLE')
  })
})

describe('la vara de uso · reglas del bloque', () => {
  it('había fuente y la voz quedó PENDIENTE (o vacía) ⇒ NO usó lo disponible; el rótulo del motivo dice qué fuentes había', () => {
    for (const voz of ['PENDIENTE', '  pendiente: sin dato ', '', undefined, 'No determinada']) {
      const r = bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: voz }, GROUND_A)
      expect(r.ok).toBe(false); expect(r.sin_usar).toHaveLength(1)
      expect(r.sin_usar[0]).toMatchObject({ campo: 'voice_description' }); expect(r.sin_usar[0].fuente).toContain('el perfil de Instagram del cliente')
    }
  })
  it('usó lo que había ⇒ pasa, aunque sea poco (un borrador corto con el perfil usado)', () => {
    expect(bloque.usoDeLoDisponible(BORRADOR_BUENO, GROUND_A)).toMatchObject({ ok: true, sin_usar: [] })
  })
  it('🔴 desde cero: NO había nada ⇒ no hay qué usar ⇒ pasa, incluso con la voz PENDIENTE (la cadena nunca se detiene por falta de contenido propio)', () => {
    for (const voz of ['PENDIENTE', '', 'PROPUESTA (no es dato del cliente): sobria y cercana.']) expect(bloque.usoDeLoDisponible({ positioning: '', icp_summary: '', voice_description: voz }, GROUND_B).ok).toBe(true)
  })
  it('sin texto propio pero con contexto (público ideal / competidores): la voz armada sin decir PROPUESTA ⇒ falta el rótulo; con el rótulo ⇒ pasa', () => {
    const g = { ...GROUND_A, materia_cliente: null }
    const sin = bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: 'Cercana, técnica y directa, pensada para empresas medianas.' }, g)
    expect(sin.ok).toBe(false); expect(sin.sin_usar[0]).toMatchObject({ campo: 'voice_description', rotulo: true })
    expect(bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: 'PROPUESTA (no es dato del cliente): cercana y técnica.' }, g).ok).toBe(true)
    expect(bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: 'Propuesta (no es dato del cliente): cercana.' }, g).ok).toBe(true)
  })
  it('🔴 CC#3 pedido 1 · una voz de RELLENO no es «usó lo disponible»: las 16 variantes medidas por CC#3 (y los textos cortos) hacen fallar la vara habiendo fuentes', () => {
    const relleno = ['Por determinar', 'A definir', 'Sin información', 'No hay información disponible', 'Not available', 'Unknown', 'N/D', 'No aplica', 'Sin voz definida', 'Ninguna', '—', '...', '-', 'x', 'Pendiente de definir', 'PENDIENTE']
    for (const voz of relleno) { const r = bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: voz }, GROUND_A); expect(r.ok, voz).toBe(false); expect(r.sin_usar[0].campo).toBe('voice_description') }
    // cada palabra de la lista, aun dentro de un texto largo que EMPIEZA con ella (relleno con adorno), cae por el regex y no solo por el largo
    for (const ini of ['Por determinar', 'A definir', 'Sin información', 'No hay información', 'Not available', 'Unknown', 'N/D', 'No aplica', 'Sin voz', 'Ninguna']) expect(bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: ini + ' por ahora, se completará cuando el cliente envíe más material.' }, GROUND_A).ok, ini).toBe(false)
    // largo mínimo: 39 no pasa, 40 sí
    expect(bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: 'a'.repeat(39) }, GROUND_A).ok).toBe(false)
    expect(bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, voice_description: 'Cercana' + ' y técnica'.repeat(4) }, GROUND_A).ok).toBe(true)
  })
  it('con texto propio, la voz NO necesita el rótulo (viene del cliente)', () => {
    expect(bloque.usoDeLoDisponible(BORRADOR_BUENO, GROUND_A).ok).toBe(true)
  })
  it('positioning / icp_summary vacíos habiendo con qué escribirlos ⇒ sin usar; sin fuentes no se exige', () => {
    const r = bloque.usoDeLoDisponible({ ...BORRADOR_BUENO, positioning: '', icp_summary: 'corto' }, GROUND_A)
    expect(r.sin_usar.map((x: any) => x.campo).sort()).toEqual(['icp_summary', 'positioning'])
    expect(bloque.usoDeLoDisponible({ positioning: '', icp_summary: '' }, GROUND_B).ok).toBe(true)
  })
  it('un sitio o perfil de menos de 100/200 caracteres, o con estado distinto de «trajo», NO cuenta como fuente propia', () => {
    const g = (m: any) => ({ materia_cliente: m })
    expect(bloque.udDisponible(g({ sitio_estado: 'trajo', sitio_texto: 'corto' })).propio).toEqual([])
    expect(bloque.udDisponible(g({ instagram_estado: 'sin_dato', instagram_propio: 'x'.repeat(500) })).propio).toEqual([])
    expect(bloque.udDisponible(g({ sitio_estado: 'trajo', sitio_texto: 'x'.repeat(250) })).propio).toEqual(['el sitio del cliente'])
    expect(bloque.udDisponible(g({ frase_propia: 'Somos así' })).propio).toEqual(['la frase propia del cliente'])
    expect(bloque.udDisponible(null)).toEqual({ propio: [], contexto: [] })
  })
  it('es agnóstico: el bloque no nombra clientes, rubros ni ciudades', () => {
    expect(M.BLOQUE).not.toMatch(/n[aá]ufrago|p[eé]rez|guayaquil|quito|restaurante|extintor/i)
  })
})

const SALIDA_CONSOLIDADOR = (draft: any, ground: any, ciclo = 1) => ({ brand_book_draft: draft, cycle: 1, _fidelity_cycle: ciclo, corrections: [], _grounding_refs: ground })
const USO = (draft: any, ground: any, ciclo = 1, tasks: any = { 'editor-en-jefe': 'PEDIDO ORIGINAL' }) =>
  correr(cod(nuevo, N.uso), { json: SALIDA_CONSOLIDADOR(draft, ground, ciclo), nodos: { [N.fanout]: { tasks } } })[0].json

describe('«Uso · ¿usó lo disponible?» · la corrección que vuelve (una sola vez)', () => {
  it('🔴 la voz PENDIENTE habiendo Instagram ⇒ pide la voz otra vez: el pedido ORIGINAL del editor-en-jefe + el reparo, y cabe en el tope del campo', () => {
    const j = USO({ ...BORRADOR_BUENO, voice_description: 'PENDIENTE' }, GROUND_A)
    expect(j._uso_repetir_voz).toBe(true); expect(j._uso.ok).toBe(false)
    expect(j._uso_pedido_voz.startsWith('PEDIDO ORIGINAL')).toBe(true); expect(j._uso_pedido_voz).toContain('REPARO'); expect(j._uso_pedido_voz).toContain('el perfil de Instagram')
    expect(j.brand_book_draft.voice_description).toBe('PENDIENTE') // el borrador no se toca aquí
  })
  it('el pedido original largo se recorta para que quepa (≤ 15.900) y el reparo NO se pierde', () => {
    const j = USO({ ...BORRADOR_BUENO, voice_description: '' }, GROUND_A, 1, { 'editor-en-jefe': 'o'.repeat(15890) })
    expect(j._uso_pedido_voz.length).toBeLessThanOrEqual(15900); expect(j._uso_pedido_voz).toContain('REPARO')
  })
  it('🔴 SOLO la primera pasada: en la segunda no se vuelve a pedir (no es un lazo)', () => {
    expect(USO({ ...BORRADOR_BUENO, voice_description: 'PENDIENTE' }, GROUND_A, 2)._uso_repetir_voz).toBe(false)
  })
  it('si usó todo lo que había, o no había nada, NO se pide nada (sin gasto)', () => {
    expect(USO(BORRADOR_BUENO, GROUND_A)._uso_repetir_voz).toBe(false)
    expect(USO({ voice_description: 'PENDIENTE' }, GROUND_B)._uso_repetir_voz).toBe(false)
  })
  it('lo que falla en positioning NO se pide al editor-en-jefe (eso lo corrige el Lazo A, que sí reescribe lo gateado)', () => {
    expect(USO({ ...BORRADOR_BUENO, positioning: '' }, GROUND_A)._uso_repetir_voz).toBe(false)
  })
  it('si el nodo del pedido original no corrió, no revienta: pide solo el reparo', () => {
    const j = correr(cod(nuevo, N.uso), { json: SALIDA_CONSOLIDADOR({ ...BORRADOR_BUENO, voice_description: '' }, GROUND_A) })[0].json
    expect(j._uso_repetir_voz).toBe(true); expect(j._uso_pedido_voz).toContain('REPARO')
  })
})

const MEZCLAR = (previo: any, respuesta: any) => correr(cod(nuevo, N.mezclar), { json: respuesta, nodos: { [N.uso]: previo } })[0].json
describe('«Uso · mezclar la voz» · lo que vuelve reemplaza SOLO la voz', () => {
  const previo = () => USO({ ...BORRADOR_BUENO, voice_description: 'PENDIENTE', tagline_opciones: ['T1'] }, GROUND_A)
  it('🔴 la voz nueva reemplaza voz/personalidad/tagline/mensajes que traiga; lo demás del borrador queda IGUAL', () => {
    const r = MEZCLAR(previo(), { body: { brand_section: { voice_description: { valor: 'Cercana y técnica, como en su perfil.', fuente: 'perfil', confianza: 0.8 }, personalidad: ['técnica', 'cercana'], mensajes_clave: [], positioning: 'NO DEBE PISARSE' } } })
    expect(r.brand_book_draft.voice_description).toBe('Cercana y técnica, como en su perfil.'); expect(r.brand_book_draft.personalidad).toEqual(['técnica', 'cercana'])
    expect(r.brand_book_draft.positioning).toBe(BORRADOR_BUENO.positioning); expect(r.brand_book_draft.icp_summary).toBe(BORRADOR_BUENO.icp_summary)
    expect(r.brand_book_draft.tagline_opciones).toEqual(['T1']); expect(r.brand_book_draft.mensajes_clave).toEqual([]) // vacío no pisa
    expect(r._uso_reintento).toEqual({ corrio: true, mezclados: ['voice_description', 'personalidad'], voz_nueva: true })
    expect(r.brand_book_draft._field_meta.voice_description).toMatchObject({ provisional: true, gateado: false, lente: 'editor-en-jefe', reintento_uso: true, fuente: 'perfil', confianza: 0.8 })
  })
  it('si no volvió nada útil (error, vacío, texto sin JSON) el borrador sigue como estaba', () => {
    for (const resp of [{ error: 'x' }, { body: {} }, { body: { response: 'sin json' } }, { body: { brand_section: { voice_description: '  ' } } }]) {
      const r = MEZCLAR(previo(), resp)
      expect(r.brand_book_draft.voice_description).toBe('PENDIENTE'); expect(r._uso_reintento.voz_nueva).toBe(false)
    }
  })
  it('acepta la respuesta como texto con JSON dentro', () => {
    const r = MEZCLAR(previo(), { body: { response: 'Aquí va: {"voice_description":"Voz nueva con cita."}' } })
    expect(r.brand_book_draft.voice_description).toBe('Voz nueva con cita.')
  })
  it('la confianza se acota a 0-1 y la fuente se recorta', () => {
    const r = MEZCLAR(previo(), { body: { brand_section: { voice_description: { valor: 'v', fuente: 'f'.repeat(500), confianza: 7 } } } })
    expect(r.brand_book_draft._field_meta.voice_description.confianza).toBe(1); expect(r.brand_book_draft._field_meta.voice_description.fuente.length).toBe(200)
  })
})

const PREP_JUEZ = (draft: any, ground: any, ciclo = 1) => ({ brand_book_draft: draft, cycle: 1, _fidelity_cycle: ciclo, _grounding_refs: ground, _campos_cortados: [] })
const SCORES = (o: Record<string, number>) => ({ body: { fidelity_scores: { scores: { positioning: 0.95, icp_summary: 0.95, voice_description: 0.9, customer_angle: 0.9, retention_notes: 0.9, ...o } } } })
const JUEZ = (f: Flujo, prep: any, respuesta: any, lazo?: any) => correr(cod(f, N.juez), { json: respuesta, nodos: { '[BB] Judge prep': prep, ...(lazo ? { '[BB] Lazo A prep': lazo } : {}) } })[0].json
describe('el juez · la vara es fidelidad Y uso de lo disponible', () => {
  it('🔴 fiel (0.95) pero con la voz PENDIENTE habiendo Instagram ⇒ NO pasa (antes del arreglo pasaba)', () => {
    const prep = PREP_JUEZ({ ...BORRADOR_BUENO, voice_description: 'PENDIENTE' }, GROUND_A)
    expect(JUEZ(antes, prep, SCORES({})).fidelity.pass).toBe(true)
    const j = JUEZ(nuevo, prep, SCORES({}))
    expect(j.fidelity.pass).toBe(false); expect(j.fidelity.uso.sin_usar[0].campo).toBe('voice_description'); expect(j.fidelity.low_fields).toEqual([])
  })
  it('usó lo que había ⇒ pasa; desde cero (nada que usar) ⇒ pasa; no hay estado «sin contenido propio» en ningún nodo', () => {
    expect(JUEZ(nuevo, PREP_JUEZ(BORRADOR_BUENO, GROUND_A), SCORES({})).fidelity.pass).toBe(true)
    expect(JUEZ(nuevo, PREP_JUEZ({ positioning: 'Propuesta de posicionamiento a partir del rubro.', icp_summary: 'Resumen propuesto del público a partir del rubro.', voice_description: 'PENDIENTE' }, GROUND_B), SCORES({})).fidelity.pass).toBe(true)
    expect(JSON.stringify(nuevo)).not.toContain('sin_contenido_propio')
  })
  it('la fidelidad baja sigue bloqueando aunque el uso esté bien (la vara anterior no se aflojó)', () => {
    const j = JUEZ(nuevo, PREP_JUEZ(BORRADOR_BUENO, GROUND_A), SCORES({ positioning: 0.4 }))
    expect(j.fidelity.pass).toBe(false); expect(j.fidelity.low_fields).toEqual(['positioning'])
  })
  it('🔴 si lo ÚNICO que falla es la voz (que ya tuvo su corrección) el ciclo se AGOTA y sale marcado: no se paga otra vuelta del Lazo A que no puede arreglarla', () => {
    const j = JUEZ(nuevo, PREP_JUEZ({ ...BORRADOR_BUENO, voice_description: 'PENDIENTE' }, GROUND_A), SCORES({}))
    expect(j.fidelity.exhausted).toBe(true)
    // pero si falla positioning (gateado) en la 1ª pasada, el Lazo A SÍ se usa: no se agota
    const k = JUEZ(nuevo, PREP_JUEZ({ ...BORRADOR_BUENO, positioning: '' }, GROUND_A), SCORES({ positioning: 0.4 }))
    expect(k.fidelity.exhausted).toBe(false)
    // y la fidelidad baja con la voz bien tampoco agota
    expect(JUEZ(nuevo, PREP_JUEZ(BORRADOR_BUENO, GROUND_A), SCORES({ positioning: 0.4 })).fidelity.exhausted).toBe(false)
  })
  it('el progreso cuenta que el uso mejore: en la 2ª pasada, menos campos sin usar que en la anterior es progreso aunque la fidelidad no suba', () => {
    const prep = PREP_JUEZ({ ...BORRADOR_BUENO, positioning: '' , voice_description: 'PENDIENTE' }, GROUND_A, 2)
    const lazo = { best_gated_mean: 0.9, best_draft: { viejo: true }, best_uso_n: 3 }
    expect(JUEZ(nuevo, prep, SCORES({ positioning: 0.9, icp_summary: 0.9 }), lazo).no_progress).toBe(false)
    expect(JUEZ(nuevo, prep, SCORES({ positioning: 0.9, icp_summary: 0.9 }), { ...lazo, best_uso_n: 2 }).no_progress).toBe(true)
  })
  it('mantiene lo demás de la salida del juez (misma forma que antes + `uso`)', () => {
    const prep = PREP_JUEZ(BORRADOR_BUENO, GROUND_A)
    const a = JUEZ(antes, prep, SCORES({})), n = JUEZ(nuevo, prep, SCORES({}))
    const { uso, ...resto } = n.fidelity
    expect(uso).toBeTruthy(); expect(resto).toEqual(a.fidelity)
    expect({ ...n, fidelity: undefined }).toEqual({ ...a, fidelity: undefined })
  })
})

describe('Promote y retorno · dejan registrado qué había y qué no se usó', () => {
  const promover = (f: Flujo, fidelity: any) => correr(cod(f, N.promote), { json: { fidelity, brand_book_draft: BORRADOR_BUENO }, nodos: { '[BB] Guardia de procedencia': { _procedencia: 'padre' }, 'Validate Deal Data': { client_id: 'c-1' } } })[0].json
  const fid = (pass: boolean, uso: any, extra: any = {}) => ({ pass, threshold: 0.85, scores: {}, uso, low_fields: [], ...extra })
  const USO_MAL = { ok: false, sin_usar: [{ campo: 'voice_description', motivo: 'la voz quedó vacía o PENDIENTE habiendo con qué armarla' }], disponibles: { propio: ['el perfil de Instagram del cliente'], contexto: [] } }
  it('🔴 un manual que no usó lo disponible SALE (no se detiene), marcado «salio_al_tope», con la nota de qué no se usó, y el registro dentro del manual', () => {
    const r = promover(nuevo, fid(false, USO_MAL))
    expect(r.should_persist).toBe(true); expect(r.gate_outcome).toBe('salio_al_tope')
    expect(r.promote_body.gate_nota).toContain('no usó lo disponible'); expect(r.promote_body.gate_nota).toContain('voice_description'); expect(r.promote_body.gate_nota).toContain('salió al tope')
    expect(r.promote_body.brand_book.uso_de_lo_disponible).toEqual(USO_MAL)
  })
  it('un manual que pasó: `paso_la_vara`, sin nota; los únicos estados siguen siendo paso_la_vara | salio_al_tope', () => {
    const r = promover(nuevo, fid(true, { ok: true, sin_usar: [], disponibles: { propio: [], contexto: [] } }))
    expect(r.gate_outcome).toBe('paso_la_vara'); expect(r.promote_body.gate_nota).toBeNull(); expect(r.promote_body.approved_by).toBe('faithfulness_check')
    expect(JSON.stringify(nuevo.nodes.map((n) => n.parameters.jsCode))).not.toMatch(/gate_outcome:\s*['"](?!paso_la_vara|salio_al_tope)/)
  })
  it('sin `uso` (juez viejo) la nota es la de siempre', () => {
    expect(promover(nuevo, fid(false, undefined)).promote_body.gate_nota).toBe('salió al tope, no alcanzó la vara')
    expect(promover(antes, fid(false, undefined)).promote_body.gate_nota).toBe('salió al tope, no alcanzó la vara')
  })
  const volver = (f: Flujo, fidelity: any) => correr(cod(f, N.retorno), { json: { fidelity, brand_book_draft: BORRADOR_BUENO } })[0].json
  it('el retorno al padre dice la razón: no_uso_lo_disponible (si solo falló eso) y conserva las demás razones', () => {
    expect(volver(nuevo, fid(false, USO_MAL, { exhausted: true })).track_reason).toBe('no_uso_lo_disponible')
    expect(volver(nuevo, fid(false, USO_MAL, { exhausted: true })).uso_de_lo_disponible).toEqual(USO_MAL)
    expect(volver(nuevo, fid(false, USO_MAL, { low_fields: ['positioning'], exhausted: true })).track_reason).toBe('ciclos_agotados')
    expect(volver(nuevo, fid(false, undefined, { low_fields: ['positioning'] })).track_reason).toBe('fidelidad_baja')
    expect(volver(nuevo, fid(true, USO_MAL)).track_reason).toBe('pass')
    expect(volver(nuevo, fid(false, USO_MAL, { judge_incomplete: true })).track_reason).toBe('juez_incompleto')
    expect(volver(nuevo, fid(false, USO_MAL, { exhausted: true })).track_published).toBe(true)
  })
})

describe('Lazo A prep · lleva la cuenta del uso', () => {
  it('best_uso_n = cuántos campos quedaron sin usar (0 si no hay `uso`)', () => {
    const lazo = (fidelity: any) => correr(cod(nuevo, '[BB] Lazo A prep'), { json: { fidelity, brand_book_draft: BORRADOR_BUENO }, nodos: { '[BB] Judge prep': { _grounding_refs: GROUND_A }, 'Validate Deal Data': { client_id: 'c-1' } } })[0].json
    expect(lazo({ uso: { sin_usar: [{}, {}] } }).best_uso_n).toBe(2); expect(lazo({}).best_uso_n).toBe(0)
  })
})

describe('la forma del cambio', () => {
  const nombres = (f: Flujo) => f.nodes.map((n) => n.name)
  it('🔴 LINAJE: el ANTES == el modo seco ya aplicado (nodos y cables); el constructor reproduce el ARREGLADO; no se construye dos veces', () => {
    const porNombre = (f: Flujo) => Object.fromEntries(f.nodes.map((n) => [n.name, n])) // el orden del arreglo no es parte del flujo; el contenido por nombre sí
    expect(antes.nodes).toHaveLength(seco.nodes.length); expect(porNombre(antes)).toEqual(porNombre(seco)); expect(JSON.stringify(antes.connections)).toBe(JSON.stringify(seco.connections))
    expect(JSON.stringify(M.construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => M.construirFlujo(nuevo)).toThrow(/ya trae el uso/)
  })
  it('cambian 5 nodos y entran 4 nuevos; todo lo demás es byte a byte igual', () => {
    expect(nuevo.nodes).toHaveLength(antes.nodes.length + 4)
    const iguales = antes.nodes.filter((n) => JSON.stringify(n) === JSON.stringify(nodo(nuevo, n.name)))
    const cambiados = antes.nodes.filter((n) => !iguales.includes(n)).map((n) => n.name).sort()
    expect(cambiados).toEqual([N.fanout, N.juez, N.promote, N.retorno, '[BB] Lazo A prep'].sort())
    expect(nombres(nuevo).filter((x) => !nombres(antes).includes(x)).sort()).toEqual([N.uso, N.siRepetir, N.pedir, N.mezclar].sort())
  })
  it('🔴 los cables: Consolidador → Uso → ¿repetir? → (sí: pedir → mezclar | no) → Judge prep; el resto de los cables, iguales', () => {
    const c = nuevo.connections
    expect(c[N.consolidador].main).toEqual([[{ node: N.uso, type: 'main', index: 0 }]])
    expect(c[N.uso].main[0]).toEqual([{ node: N.siRepetir, type: 'main', index: 0 }])
    expect(c[N.siRepetir].main).toEqual([[{ node: N.pedir, type: 'main', index: 0 }], [{ node: N.judgePrep, type: 'main', index: 0 }]])
    expect(c[N.pedir].main[0]).toEqual([{ node: N.mezclar, type: 'main', index: 0 }]); expect(c[N.mezclar].main[0]).toEqual([{ node: N.judgePrep, type: 'main', index: 0 }])
    const resto = (x: Record<string, any>) => Object.fromEntries(Object.entries(x).filter(([k]) => ![N.consolidador, N.uso, N.siRepetir, N.pedir, N.mezclar].includes(k)))
    expect(resto(c)).toEqual(resto(antes.connections))
    expect(antes.connections[N.consolidador].main).toEqual([[{ node: N.judgePrep, type: 'main', index: 0 }]])
  })
  it('🔴 el pedido de la voz: una sola llamada, SIN reintento (un reintento cobraría dos veces), al editor-en-jefe, con workflow_id y el cuerpo como texto', () => {
    const p = nodo(nuevo, N.pedir)
    expect(p.type).toBe('n8n-nodes-base.httpRequest'); expect(p.parameters.retryOnFail).toBeFalsy()
    expect(p.parameters.jsonBody).toContain('"agent": "editor-en-jefe"'); expect(p.parameters.jsonBody).toContain('"workflow_execution_id"'); expect(p.parameters.jsonBody).toContain('_uso_pedido_voz')
    // lo mismo que usa la lente real del editor: misma URL, misma autenticación
    const lente = nodo(nuevo, 'Lente · editor-en-jefe')
    expect(p.parameters.url).toBe(lente.parameters.url); expect(JSON.stringify(p.parameters.headerParameters ?? null)).toBe(JSON.stringify(lente.parameters.headerParameters ?? null))
    expect(nodo(nuevo, N.pedir).parameters.method === undefined || typeof nodo(nuevo, N.pedir).parameters.method === 'string').toBe(true)
  })
  it('el IF mira un booleano real; los nodos de código compilan y no traen CRLF mezclado ni llaves ni clientes', () => {
    for (const n of [N.uso, N.mezclar, N.fanout, N.juez, N.promote, N.retorno, '[BB] Lazo A prep']) expect(() => new Function('$', '$json', '$input', '$workflow', '$execution', cod(nuevo, n))).not.toThrow()
    const CRLF = String.fromCharCode(13, 10)
    for (const n of antes.nodes) if (n.parameters.jsCode) expect(cod(nuevo, n.name).includes(CRLF)).toBe(String(n.parameters.jsCode).includes(CRLF))
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    expect(nodo(nuevo, N.siRepetir).parameters.conditions.conditions[0].leftValue).toBe('={{ $json._uso_repetir_voz === true }}')
  })
  it('un pedido de voz del Fan-out sigue cabiendo: el tope de la lente subió justo lo que pesa la regla', () => {
    expect(cod(nuevo, N.fanout)).toContain('+ REGLA_CON_LO_DISPONIBLE.length')
  })
})
