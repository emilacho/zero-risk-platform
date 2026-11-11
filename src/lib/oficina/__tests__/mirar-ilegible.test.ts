/**
 * 11-nov · GO Lenovo 12:52 Zúrich · la foto del 12-nov cayó dos veces porque «mirar» devolvió un JSON con una coma sobrante (`… pan)"]}, ], "prefer…` → `Unexpected token ']'`).
 * Arreglo con la forma de #1014: (1) lectura tolerante de la FORMA (solo la coma sobrante antes de un cierre); (2) el reintento que ya existía (uno);
 * (3) si tampoco se lee, «no pude leer» NUNCA es «descartar»: la imagen sigue sin juzgar y una ficha que bloquea pide que la mire una persona. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { sinLecturaDeMirarL } from '../orquestador-laminas'
import { procesarSalida, quitarComasSobrantes } from '../salida'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { estadoInicial, type Estado, type Paso } from '../tipos'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, FOTOS, PARTE, PARTE_OTRO_PRODUCTO, crearMemoria, correr, direccionGenerada, direccionReal, observacion, type Guion, type Memoria } from './memoria'

const abierto = async (M: Memoria, brief = 'BRF-0003') => String((await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: brief, dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })).cuerpo.encargo_id)
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const PIEZA = JSON.stringify({ pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp al 0997744288.', hashtags: ['#ceviche'] })
/** la misma forma rota que devolvió el curador el 11-nov: una coma antes del `]` que cierra la lista de imágenes */
const conComaSobrante = (json: string) => json.replace(/\}\]\s*,\s*"preferencia"/, '}, ], "preferencia"')

describe('lectura tolerante de la forma · solo la coma sobrante antes de un cierre', () => {
  it('🔴 quita la coma antes de `]` y de `}`, y cuenta cuántas quitó', () => {
    expect(quitarComasSobrantes('{"a":[1,2,],"b":{"c":1,},}')).toEqual({ json: '{"a":[1,2],"b":{"c":1}}', quitadas: 3 })
    expect(quitarComasSobrantes('{"a":[{"x":1}, ], "p":[0]}')).toEqual({ json: '{"a":[{"x":1} ], "p":[0]}', quitadas: 1 })
    expect(quitarComasSobrantes('{"a":[1,\n  ]}').quitadas).toBe(1)
  })
  it('🔴 una coma DENTRO de un texto no se toca (ni con comillas escapadas antes)', () => {
    expect(quitarComasSobrantes('{"a":"uno, ]","b":"dice \\"hola, }\\" y sigue"}')).toEqual({ json: '{"a":"uno, ]","b":"dice \\"hola, }\\" y sigue"}', quitadas: 0 })
  })
  it('🔴 la respuesta real del 11-nov se lee, y queda anotado que se arregló la forma', () => {
    const roto = conComaSobrante(observacion([0, 1]))
    expect(roto).toContain('}, ], "preferencia"')
    expect(() => JSON.parse(roto)).toThrow(/Unexpected token/)
    const r = procesarSalida(roto, 'observacion_imagen.v1', 0, 1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.valor.imagenes as unknown[]).length).toBe(2)
      expect(r.normalizados).toContainEqual(expect.stringMatching(/1 coma\(s\) sobrante\(s\) antes de un cierre/))
    }
  })
  it('🔴 lo que no es solo una coma sigue pidiendo el reintento con el error ORIGINAL; un JSON sano no se anota', () => {
    const r = procesarSalida('{"imagenes": [ {"indice": 0 } "suelto" ] }', 'observacion_imagen.v1', 0, 1)
    expect(r).toMatchObject({ ok: false, accion: 'reintentar' })
    if (!r.ok && r.accion === 'reintentar') expect(r.mensaje_de_error).toMatch(/json_invalido/)
    const sano = procesarSalida(observacion([0]), 'observacion_imagen.v1', 0, 1)
    expect(sano.ok && sano.normalizados).toBeFalsy()
  })
})

describe('la sala de la foto · «mirar» con la respuesta mal armada', () => {
  // dos clientes/productos (el ceviche y otro producto de la parte) y los dos modos (imagen generada y foto real)
  const generada = (mirar: Guion['mirar']): Guion => ({
    paquete: () => ({ texto: 'material' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
    mirar, texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  })
  it('🔴 con la coma sobrante del 11-nov: se lee al primer intento (sin reintento ni gasto extra) y la pieza cierra', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pasos, ultima } = await correr(M, id, generada((_n, t) => ({ texto: conComaSobrante(observacion(indicesDe(t))) })))
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(1)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it.each([
    ['ceviche', undefined],
    ['otro producto de la parte', PARTE_OTRO_PRODUCTO],
  ])('🔴 %s · ilegible las dos veces: la pieza NO cae; la imagen generada sigue SIN juzgar y una ficha que bloquea pide que la mire una persona', async (_n, parte) => {
    const M = crearMemoria(parte ? { parte } : {})
    const id = await abierto(M)
    let veces = 0
    const { ultima } = await correr(M, id, generada(() => { veces++; return { texto: '{esto no es json' } }))
    expect(veces).toBe(2) // el reintento que ya existía, y nada más
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
    const e = M.encargos.get(id)!.estado_del_motor
    expect(e.artefactos['observacion_imagen'].datos).toMatchObject({ sin_lectura: true, veredicto: { regenerar: false } })
    expect((e.artefactos['observacion_imagen'].datos.veredicto as { pasan: number[] }).pasan.length).toBeGreaterThan(0)
    expect(e.artefactos['imagen_elegida'].datos).toMatchObject({ elegido: true })
    const ficha = e.fichas.find((f) => f.id.startsWith('mirar-sin-lectura-'))
    expect(ficha).toMatchObject({ gravedad: 'bloquea', donde: 'imagen' })
    expect(ficha!.que).toMatch(/no se pudo leer dos veces/)
  })
  it('🔴 foto real: ilegible las dos veces NO descarta la foto (antes la pieza caía); sale con la foto y la ficha que bloquea', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    const foto = FOTOS.find((f) => f.id === 'ef0921ad')!
    expect(foto).toBeTruthy()
    const g: Guion = { paquete: () => ({ texto: 'material' }), direccion_visual: () => ({ texto: direccionReal(foto.id) }), mirar: () => ({ texto: '[[ roto' }), texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }) }
    const { pasos, ultima } = await correr(M, id, g)
    const e = M.encargos.get(id)!.estado_del_motor
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(2) // la foto sí se mira (CC2: que la prueba no pase en vacío)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
    expect(e.artefactos['imagen_final'].datos).toMatchObject({ origen: 'real', foto_id: foto.id })
    expect(e.fichas.some((f) => f.id.startsWith('mirar-sin-lectura-') && f.gravedad === 'bloquea')).toBe(true)
  })
  it('🔴 re-imagen de la FOTO ilegible las dos veces, recorrida por el orquestador: NO cae, se queda la imagen anterior, solo ficha de sugerencia y sin observación nueva (CC7 · huecos 1 y 2)', async () => {
    const M = crearMemoria()
    M.revisorTexto = () => ({ ok: true, texto: 'La imagen se ve fría y plana.', costo_usd: 0.1, modelo: 'sim' })
    const id = String((await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })).cuerpo.encargo_id)
    const toma = (_n: number, t: string) => ({ texto: JSON.stringify({ respuestas: [...t.matchAll(/\[(ext-[^\]]+)\]/g)].map((x) => ({ id: x[1], estado: 'tomada', razon: 'sí, está plana' })) }) })
    const nada = () => ({ texto: '{"respuestas": []}' })
    let reVeces = 0
    const g: Guion = {
      ...generada((_n, t) => ({ texto: observacion(indicesDe(t)) })),
      corrige: nada, decide: nada, decide_imagen: toma, reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }),
      reimagen_mirar: () => { reVeces++; return { texto: '{esto no es json' } },
    }
    const { pasos, ultima } = await correr(M, id, g)
    expect(pasos).toContain('reimagen_prompts') // la re-imagen sí se pidió: la prueba no pasa en vacío
    expect(reVeces).toBe(2) // su reintento, y nada más
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
    const e = M.encargos.get(id)!.estado_del_motor
    expect((e.artefactos['imagen_final'].datos as { url: string }).url).toMatch(/img\.test\/[12]\./) // la primera, intacta
    expect(e.artefactos['observacion_imagen'].datos.sin_lectura).toBeUndefined() // la observación buena de la primera mirada no se pisa
    expect(e.fichas.some((f) => f.id.startsWith('reimagen-sin-lectura-') && f.gravedad === 'sugerencia')).toBe(true)
    expect(e.fichas.some((f) => f.id.startsWith('mirar-sin-lectura-'))).toBe(false)
    expect(e.fichas.some((f) => f.donde === 'imagen' && f.gravedad === 'bloquea' && f.estado === 'abierta')).toBe(false) // ya tenía una imagen buena
  })
  it('🔴 una mirada SANA sigue juzgando como siempre (la imagen que no cumple no pasa): el respaldo solo entra cuando no se pudo leer', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima } = await correr(M, id, generada((_n, t) => ({ texto: observacion(indicesDe(t), { falta: 'o1' }) })))
    const e = M.encargos.get(id)!.estado_del_motor
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
    expect(e.artefactos['observacion_imagen'].datos.sin_lectura).toBeUndefined()
    expect(e.fichas.some((f) => f.id.startsWith('mirar-sin-lectura-'))).toBe(false)
  })
})

describe('la sala de láminas · el mismo respaldo', () => {
  const paso = (clave: string) => ({ clave, tipo: 'agente', quien: 'marketing_instagram_curator' }) as unknown as Paso
  const estado = (): Estado => ({
    ...estadoInicial(),
    pasos_ejecutados: 7,
    artefactos: {
      encargo: { datos: { brief: {}, proporcion: '4:5', F: { fotos: [] }, familia: 'carrusel', plataforma: 'instagram', elementos: [] } },
      visual_direction: { datos: { imagenes: [{ ref: 'hook', modo: 'generada' }, { ref: 'cierre', modo: 'generada' }], refs_generadas: ['hook', 'cierre'] } },
      imagenes: { datos: { ultimo_intento: 1, items: [{ indice: 0, intento: 1, url: 'https://x/0.png', ref: 'hook' }, { indice: 1, intento: 1, url: 'https://x/1.png', ref: 'cierre' }] } },
    },
  }) as unknown as Estado
  it('🔴 mirar ilegible: cada imagen mostrada queda aceptada SIN juzgar, ninguna lámina sale sin imagen y hay UNA ficha que bloquea', () => {
    const r = sinLecturaDeMirarL(paso('mirar'), estado(), ['json_invalido: Unexpected token ]'])
    expect(r.artefacto).toMatchObject({ sin_lectura: true, aceptadas: { hook: [0], cierre: [1] }, veredicto: { pasan: [0, 1], regenerar: false, refs_sin_imagen: [] } })
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas![0]).toMatchObject({ gravedad: 'bloquea', donde: 'imagen' })
    expect(r.fichas![0].que).toContain('json_invalido: Unexpected token ]')
  })
  it('🔴 re-imagen ilegible: no pisa nada (sin artefacto), solo se dice', () => {
    const r = sinLecturaDeMirarL(paso('reimagen_mirar'), estado(), ['json_invalido'])
    expect(r.artefacto).toBeUndefined()
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas![0]).toMatchObject({ gravedad: 'sugerencia' })
  })
})
