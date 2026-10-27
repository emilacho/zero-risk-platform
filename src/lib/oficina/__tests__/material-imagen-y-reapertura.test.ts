/**
 * (d) carrusel y kit no dejan láminas vacías · la imagen generada no inventa datos (condiciones 1 y 5 de CC#3 sobre la imagen sin foto) · (e) reabrir una pieza que ya gastó cuando se declara la causa corregida.
 * US$ 0: generador y portero simulados.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, avanzar, recibirResultado } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { POST_IMG } from '../plantillas/post-img'
import { MAX_VERSIONES_POR_BRIEF, causaValida, decidirReapertura } from '../reapertura'
import { chequearPrompts } from '../reglas-de-imagen'
import { motivosDeInvencion, reglasDeInvencion, seccionDeImagenSinFoto, TERMINOS_NO_INVENTADOS } from '../prompts-sin-invencion'
import { TARGET_STEP_PRODUCIR, validarSobre } from '../sobre'
import type { Plantilla } from '../tipos'
import { CLIENTE, FUENTES, PARTE, crearMemoria } from './memoria'

const j = (x: unknown) => JSON.stringify(x)

// ───────────────────────── (d) carrusel · «ninguna» deja de ser una lámina vacía
const BRIEF_CARRUSEL = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el plato del día
- PROTAGONISTA: El plato del día. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- VOCABULARIO OBLIGATORIO:
  - plato
- PROHIBIDO:
  - premium
- SINTAXIS: Frases cortas.
- VISUAL: El plato aparece completo. No aparecen personas.
- VISUAL OBLIGATORIO:
  - El plato aparece completo
- VISUAL PROHIBIDO:
  - No aparecen personas
- LLAMADO A LA ACCIÓN: Escríbenos por WhatsApp
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const REGLAS = { obligatorio: [{ id: 'o1', texto: 'el plato completo', claves: ['plato'], cita: 'El plato aparece completo' }], prohibido: [{ id: 'p1', texto: 'personas', claves: ['personas'], cita: 'No aparecen personas' }] }
const direccionNinguna = (refs: string[]) => j({ resumen: 'Sin foto apta', estilo: 'directo', imagenes: refs.map((ref) => ({ ref, modo: 'ninguna', motivo: 'no hay foto del cliente que sirva' })), reglas_de_imagen: REGLAS })

async function hastaLaDireccion(limites: Record<string, unknown>, refs: string[]) {
  const plantilla: Plantilla = { ...CARRUSEL_IG_V1, limites: { ...CARRUSEL_IG_V1.limites, ...limites } }
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla, fuentes: { fotos: [] } })
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: plantilla.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  let r = await avanzar(M.P, id)
  r = await recibirResultado(M.P, id, (r.cuerpo.turno as { n: number }).n, { texto: 'material', costo_usd: 0.05 })
  expect((r.cuerpo.turno as { paso: string }).paso).toBe('direccion_visual')
  r = await recibirResultado(M.P, id, (r.cuerpo.turno as { n: number }).n, { texto: direccionNinguna(refs), costo_usd: 0.07 })
  const vd = M.encargos.get(id)!.estado_del_motor.artefactos['visual_direction'].datos as Record<string, any>
  return { M, id, r, vd, fichas: M.encargos.get(id)!.estado_del_motor.fichas }
}

describe('(d) «ninguna» ya no deja una lámina vacía', () => {
  it('APAGADO (sin `generar_cuando_no_hay_foto`) es el comportamiento de hoy: «ninguna» se queda en «ninguna»', async () => {
    const { vd, r } = await hastaLaDireccion({}, ['hook', 'proof'])
    expect(vd.refs_generadas).toEqual([])
    expect((r.cuerpo.turno as { paso: string }).paso).not.toBe('prompts')
  })
  it('ENCENDIDO: las láminas con imagen pasan a «generada» (rotuladas con ficha) y las tipográficas de marca (cta) se quedan sin imagen, declaradas', async () => {
    const { vd, fichas, r } = await hastaLaDireccion({ generar_cuando_no_hay_foto: true, imagenes_generadas_max: 8 }, ['hook', 'proof', 'cta'])
    expect(vd.refs_generadas).toEqual(['hook', 'proof'])
    expect(vd.imagenes.find((i: { ref: string }) => i.ref === 'cta').modo).toBe('ninguna')
    expect(fichas.filter((f) => f.id.startsWith('vd-generada-por-falta-')).map((f) => f.id).sort()).toEqual(['vd-generada-por-falta-hook', 'vd-generada-por-falta-proof'])
    expect(fichas.every((f) => f.gravedad === 'sugerencia')).toBe(true)
    expect((r.cuerpo.turno as { paso: string }).paso).toBe('prompts')
  })
  it('los roles sin imagen son DATO de plantilla', async () => {
    const { vd } = await hastaLaDireccion({ generar_cuando_no_hay_foto: true, imagenes_generadas_max: 8, roles_sin_imagen: ['hook'] }, ['hook', 'cta'])
    expect(vd.refs_generadas).toEqual(['cta'])
  })
  it('el TOPE de imágenes generadas es dato: con 8 se generan las 5; con el tope viejo (2) las demás salen declaradas', async () => {
    const cinco = ['hook', 'problem', 'reframe', 'proof', 'benefit']
    const alto = await hastaLaDireccion({ generar_cuando_no_hay_foto: true, imagenes_generadas_max: 8 }, cinco)
    expect(alto.vd.refs_generadas).toEqual(cinco)
    const bajo = await hastaLaDireccion({ generar_cuando_no_hay_foto: true, imagenes_generadas_max: 2 }, cinco)
    expect(bajo.vd.refs_generadas).toEqual(['hook', 'problem'])
    expect(bajo.fichas.some((f) => /más de 2 imágenes generadas/.test(f.que ?? ''))).toBe(true)
  })
  it('si la política del cliente PROHÍBE generar, no se genera aunque falte la foto', async () => {
    const { vd } = await hastaLaDireccion({ generar_cuando_no_hay_foto: true, politica_imagen_generada: 'prohibida' }, ['hook'])
    expect(vd.refs_generadas).toEqual([])
  })
  it('el pedido de los prompts lleva el contexto del cliente y la lista de lo que NO se inventa (solo con la plantilla encendida)', async () => {
    const on = await hastaLaDireccion({ generar_cuando_no_hay_foto: true, imagenes_generadas_max: 8 }, ['hook'])
    const t = String(((on.r.cuerpo.turno as { pedido: { task: string } }).pedido).task)
    expect(t).toMatch(/Si una imagen se GENERA/)
    expect(t).toMatch(/Productos verificados: Ceviches/)
    expect(t).toMatch(/no pidas etiquetas, sellos, certificaciones, normas ni lecturas/)
    const off = await hastaLaDireccion({}, ['hook'])
    expect(JSON.stringify(off.r.cuerpo)).not.toMatch(/Si una imagen se GENERA/)
  })
})

// ───────────────────────── la imagen generada no inventa datos
const ON = { generar_cuando_no_hay_foto: true }
const reglas = () => reglasDeInvencion(ON)!
const COMPETENCIA = [{ url: 'https://www.megaseguro.com/p/123', texto_visible: 'EXTINTORES MEGA SEGURO 2x1', handle: '@mega.seguro' }]

describe('prompts-sin-invencion · lo que una imagen generada no puede pedir (condición 1 de CC#3)', () => {
  it('apagado = nulo; encendido = reglas', () => {
    expect(reglasDeInvencion(undefined)).toBeNull()
    expect(reglasDeInvencion({ generar_cuando_no_hay_foto: false })).toBeNull()
    expect(reglasDeInvencion({ generar_cuando_no_hay_foto: 'true' })).toBeNull()
    expect(reglasDeInvencion(ON)).not.toBeNull()
  })
  it.each([
    ['un precio', 'Un plato de ceviche, precio $7.00 en el borde'],
    ['dólares escritos', 'Un cartel que dice 7 USD el plato'],
    ['un porcentaje', 'Un extintor rojo con 20% de descuento'],
    ['un teléfono', 'Una mesa con un cartel: llama al 0997744288'],
    ['un usuario', 'Un plato y el usuario @naufrago.ec'],
    ['un enlace', 'Un plato junto a www.naufrago.ec'],
    ['un logotipo', 'Un extintor con el logotipo de la marca bien grande'],
    ['un eslogan', 'Un extintor y un eslogan debajo'],
    ['texto legible', 'Un extintor con texto legible en el cuerpo'],
  ])('rechaza %s', (_n, p) => { expect(motivosDeInvencion(p, reglas()).length).toBeGreaterThan(0) })
  it.each([
    ['un manómetro con su lectura', 'Un extintor rojo con el manómetro marcando 150 psi'],
    ['una etiqueta', 'Un extintor con una etiqueta de inspección en el cuerpo'],
    ['un sello de certificación', 'Un extintor con un sello de certificación visible'],
    ['una norma', 'Un extintor que cumple la norma NFPA 10'],
    ['la fecha de vencimiento', 'Un extintor con la fecha de vencimiento en la etiqueta'],
  ])('rubros regulados / de seguridad (extintores): rechaza %s', (_n, p) => { expect(motivosDeInvencion(p, reglas()).length).toBeGreaterThan(0) })
  it('lo negado SÍ vale («sin logotipos ni texto», «sin etiquetas»)', () => {
    expect(motivosDeInvencion('Un extintor rojo sobre una pared blanca, luz natural. Sin logotipos, sin texto legible, sin etiquetas ni sellos.', reglas())).toEqual([])
  })
  it('un prompt limpio pasa', () => {
    expect(motivosDeInvencion('Un extintor de polvo químico rojo apoyado en una pared blanca, luz natural lateral, fondo desenfocado de una bodega ordenada.', reglas())).toEqual([])
  })
  it('la lista de términos es DATO de plantilla', () => {
    const r = reglasDeInvencion({ ...ON, terminos_no_inventados: ['casco'] })!
    expect(motivosDeInvencion('Un obrero con casco', r).length).toBeGreaterThan(0)
    expect(motivosDeInvencion('Un extintor con manómetro', r)).toEqual([])
    expect(TERMINOS_NO_INVENTADOS).toEqual(expect.arrayContaining(['manometro', 'sello', 'certificacion', 'norma', 'etiqueta']))
  })
})

describe('prompts-sin-invencion · la competencia es SOLO estilo, en palabras propias (condición 5 de CC#3)', () => {
  const r = () => reglasDeInvencion(ON, COMPETENCIA)!
  it('el prompt NUNCA contiene la dirección, el usuario ni el texto visible de una foto de la competencia', () => {
    expect(motivosDeInvencion('Un extintor con el cartel EXTINTORES MEGA SEGURO 2x1', r()).length).toBeGreaterThan(0)
    expect(motivosDeInvencion('Un extintor como el de megaseguro.com', r()).length).toBeGreaterThan(0)
    expect(motivosDeInvencion('Un extintor al estilo de mega.seguro', r()).length).toBeGreaterThan(0)
  })
  it('en palabras propias pasa', () => {
    expect(motivosDeInvencion('Un extintor rojo sobre fondo claro, encuadre frontal y limpio', r())).toEqual([])
  })
  it('la sección del pedido incluye el estilo de la referencia SOLO como palabras (sin URL, sin texto visible, sin usuario)', () => {
    const t = seccionDeImagenSinFoto({ fotos: [{ que_muestra: 'extintor rojo en una pared' }], referencias: [{ origen: 'competencia', que_muestra: 'Extintores en fila sobre estantería metálica, luz fría', producto_visto: ['extintor'] }], vocabulario_de_productos: ['Extintores'] })
    expect(t).toMatch(/competencia: Extintores en fila/)
    expect(t).toMatch(/jamás copies su texto, su enlace ni su usuario/)
    expect(t).not.toMatch(/https?:\/\//)
  })
  it('una referencia propia del cliente no se cuenta como referencia ajena en el estilo', () => {
    const t = seccionDeImagenSinFoto({ fotos: [], referencias: [{ origen: 'propia', que_muestra: 'foto propia' }], vocabulario_de_productos: [] })
    expect(t).not.toMatch(/foto propia\b.*competencia/)
    expect(t).toMatch(/Referencias de estilo de otras cuentas \(SOLO palabras[^)]*\): \(ninguna\)/)
  })
  it('chequearPrompts con las reglas encendidas deja pasar solo los prompts limpios; apagadas = igual que hoy', () => {
    const lista = ['Un extintor con el logotipo grande', 'Un extintor rojo, luz natural, sin texto']
    const propios = { marcas_ajenas: [] as string[] }
    const sin = { obligatorio: [], prohibido: [] }
    expect(chequearPrompts(lista, sin, propios).pasan).toEqual([0, 1])
    expect(chequearPrompts(lista, sin, propios, null).pasan).toEqual([0, 1])
    const con = chequearPrompts(lista, sin, propios, reglas())
    expect(con.pasan).toEqual([1]); expect(con.fallan[0].indice).toBe(0)
  })
})

// ───────────────────────── (e) reabrir una pieza que ya gastó
const rastro = (o: Partial<{ estado: string; gasto_usd: number; version_encargo: number; pasos_ejecutados: number }> = {}) => ({ estado: 'fallido', gasto_usd: 1.2, version_encargo: 1, pasos_ejecutados: 5, ...o })
const CAUSA = 'el generador de imágenes devolvía error por la llave caducada; ya se renovó'

describe('(e) reabrir una pieza que ya gastó, con la causa corregida declarada', () => {
  it('SIN causa un fallido que ya gastó no se reabre (como hoy)', () => {
    expect(decidirReapertura(rastro())).toEqual({ accion: 'devolver' })
    expect(decidirReapertura(rastro(), undefined)).toEqual({ accion: 'devolver' })
  })
  it('CON causa válida se reabre como la versión siguiente y la causa viaja', () => {
    expect(decidirReapertura(rastro(), CAUSA)).toEqual({ accion: 'reabrir', version: 2, por_causa: CAUSA })
    expect(decidirReapertura(rastro({ estado: 'cerrado_por_tope' }), CAUSA)).toMatchObject({ accion: 'reabrir', version: 2 })
  })
  it('el TOPE de versiones sigue intacto: la versión 3 no abre una cuarta ni con causa', () => {
    expect(MAX_VERSIONES_POR_BRIEF).toBe(3)
    expect(decidirReapertura(rastro({ version_encargo: 2 }), CAUSA)).toMatchObject({ accion: 'reabrir', version: 3 })
    expect(decidirReapertura(rastro({ version_encargo: 3 }), CAUSA)).toEqual({ accion: 'devolver' })
  })
  it('un encargo vivo o ya entregado no se reabre jamás, ni con causa', () => {
    for (const estado of ['abierto', 'en_paso', 'cerrado']) expect(decidirReapertura(rastro({ estado }), CAUSA)).toEqual({ accion: 'devolver' })
  })
  it('la causa tiene que ser una frase de verdad (10–300 caracteres)', () => {
    for (const c of ['', 'sí', 'arreglado', 'x'.repeat(301), 7, null, undefined]) expect(causaValida(c)).toBe(false)
    expect(decidirReapertura(rastro(), 'arreglado')).toEqual({ accion: 'devolver' })
    expect(causaValida(CAUSA)).toBe(true)
  })
  it('el sobre valida la causa y la limpia', () => {
    const base = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false }
    expect(validarSobre({ ...base, reabrir_causa_corregida: 'x' })).toMatchObject({ ok: false, codigo: 'entrada_invalida' })
    const ok = validarSobre({ ...base, reabrir_causa_corregida: `  ${CAUSA}  ` })
    expect(ok.ok && ok.sobre.reabrir_causa_corregida).toBe(CAUSA)
    const sin = validarSobre(base)
    expect(sin.ok && sin.sobre.reabrir_causa_corregida).toBeUndefined()
  })
  it('de punta a punta: la pieza que ya gastó y falló se reabre con la causa; sin ella, el mismo sobre devuelve el encargo viejo', async () => {
    const M = crearMemoria({ plantilla: POST_IMG, fuentes: FUENTES })
    const sobre = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }
    const a = await abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const viejo = M.encargos.get(String(a.cuerpo.encargo_id))!
    viejo.estado = 'fallido'; viejo.gasto_usd = 1.1; viejo.estado_del_motor = { ...viejo.estado_del_motor, pasos_ejecutados: 6 }
    const sinCausa = await abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(sinCausa.cuerpo.encargo_id).toBe(viejo.id)
    expect(M.encargos.size).toBe(1)
    const conCausa = await abrirEncargo(M.P, { cuerpo: { ...sobre, reabrir_causa_corregida: CAUSA }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const nuevo = M.encargos.get(String(conCausa.cuerpo.encargo_id))!
    expect(nuevo.id).not.toBe(viejo.id)
    expect(nuevo.version_encargo).toBe(2)
    expect(nuevo.sala_ref).toMatchObject({ reapertura: { causa_corregida: CAUSA, desde_version: 1 } })
    expect(nuevo.gasto_usd).toBe(0) // el gasto de la versión vieja queda en la vieja: el tope de la nueva es entero
    expect(viejo.estado).toBe('fallido') // la fila vieja no se toca
  })
})
