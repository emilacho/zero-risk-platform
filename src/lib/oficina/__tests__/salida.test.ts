import { describe, it, expect } from 'vitest'
import { limpiarSalida, procesarSalida } from '../salida'

const buenos = { prompts: [{ prompt: 'Un plato visto desde arriba, luz natural lateral, madera clara, sin personas ni texto.', idea_en_una_linea: 'Cenital con luz de ventana' }, { prompt: 'Plato a nivel de mesa con fondo de cocina real desenfocado y luz cálida de tarde.', idea_en_una_linea: 'Nivel de mesa' }] }

describe('① el formato de la salida lo hace cumplir el código', () => {
  it('limpia la cerca ```json (lo que hizo Sonnet 4.6 en la prueba de CC#3)', () => {
    const r = procesarSalida('```json\n' + JSON.stringify(buenos) + '\n```', 'prompts.v1', 0, 1)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envoltorio_limpiado).toBe(true)
  })
  it('limpia prosa antes y después de las llaves', () => {
    const r = procesarSalida('Claro, aquí va:\n' + JSON.stringify(buenos) + '\nEspero que sirva.', 'prompts.v1', 0, 1)
    expect(r.ok).toBe(true)
  })
  it('JSON puro (como Fable) pasa sin marca de envoltorio', () => {
    const r = procesarSalida(JSON.stringify(buenos), 'prompts.v1', 0, 1)
    expect(r.ok && r.envoltorio_limpiado).toBe(false)
  })
  it('IGNORA el tamaño que escriba el agente (lo pone la sala) y lo anota', () => {
    const r = procesarSalida(JSON.stringify({ ...buenos, tamaño: 'Feed de Instagram — cuadrado o vertical' }), 'prompts.v1', 0, 1)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.valor).not.toHaveProperty('tamaño'); expect(r.descartados).toContain('$.tamaño') }
  })
  it('descarta también el tamaño escrito dentro de cada prompt', () => {
    const p = { prompts: buenos.prompts.map((x) => ({ ...x, size: '1024x1536' })) }
    const r = procesarSalida(JSON.stringify(p), 'prompts.v1', 0, 1)
    expect(r.ok && r.descartados.length).toBe(2)
  })
  it('salida inválida ⇒ UN reintento con el error literal; el segundo fallo es VISIBLE (nunca se rellena)', () => {
    const mala = JSON.stringify({ prompts: [buenos.prompts[0]] }) // 1 prompt: se piden 2 o 3
    const a = procesarSalida(mala, 'prompts.v1', 0, 1)
    expect(a.ok).toBe(false)
    if (!a.ok) { expect(a.accion).toBe('reintentar'); if (a.accion === 'reintentar') expect(a.mensaje_de_error).toMatch(/faltan elementos/) }
    const b = procesarSalida(mala, 'prompts.v1', 1, 1)
    expect(b.ok).toBe(false)
    if (!b.ok) { expect(b.accion).toBe('falla_visible'); if (b.accion === 'falla_visible') expect(b.ficha.gravedad).toBe('bloquea') }
  })
  it('con reintento_formato = 0 falla visible de una vez', () => {
    const r = procesarSalida('no es json', 'prompts.v1', 0, 0)
    expect(!r.ok && r.accion).toBe('falla_visible')
  })
  it('un campo que el contrato no admite se rechaza (no se acepta «lo que sobra»)', () => {
    const r = procesarSalida(JSON.stringify({ ...buenos, comentario: 'hola' }), 'prompts.v1', 1, 1)
    expect(r.ok).toBe(false)
  })
  it('un esquema no registrado falla visible', () => {
    const r = procesarSalida('{}', 'inventado.v1', 0, 1)
    expect(!r.ok && r.accion).toBe('falla_visible')
  })
  it('limpiarSalida: vacío y sin llaves', () => {
    expect(limpiarSalida('').ok).toBe(false)
    expect(limpiarSalida('solo texto').ok).toBe(false)
  })
})

describe('esquemas de la observación y de las fichas', () => {
  it('la observación acepta presente = true | false | "no_se_ve" y rechaza otro valor', () => {
    const ok = { imagenes: [{ indice: 0, reglas: [{ id: 'a', presente: 'no_se_ve' }], texto_en_imagen: [], marcas: [], personas: 0 }], preferencia: [0] }
    expect(procesarSalida(JSON.stringify(ok), 'observacion_imagen.v1', 0, 1).ok).toBe(true)
    const mala = JSON.parse(JSON.stringify(ok)); mala.imagenes[0].reglas[0].presente = 'quizás'
    expect(procesarSalida(JSON.stringify(mala), 'observacion_imagen.v1', 1, 1).ok).toBe(false)
  })
  it('una ficha exige qué, dónde, contra qué, gravedad y propuesta', () => {
    expect(procesarSalida(JSON.stringify({ fichas: [{ que: 'x', donde: 'texto', gravedad: 'bloquea' }] }), 'fichas.v1', 1, 1).ok).toBe(false)
    expect(procesarSalida(JSON.stringify({ fichas: [{ que: 'x', donde: 'texto', contra_que: 'manual', gravedad: 'bloquea', propuesta: 'y' }] }), 'fichas.v1', 0, 1).ok).toBe(true)
  })
  it('la resolución responde ítem por ítem con «tomada» o «no_tomada» y razón', () => {
    expect(procesarSalida(JSON.stringify({ respuestas: [{ id: 'a', estado: 'tomada', razon: 'ok' }] }), 'resolucion.v1', 0, 1).ok).toBe(true)
    expect(procesarSalida(JSON.stringify({ respuestas: [{ id: 'a', estado: 'quizás', razon: 'ok' }] }), 'resolucion.v1', 1, 1).ok).toBe(false)
  })
})
