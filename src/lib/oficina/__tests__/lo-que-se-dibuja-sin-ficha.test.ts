/**
 * 28-nov · GO Lenovo «la ficha de diseño sale pintada dentro de las láminas de la historia»: al dibujo solo llega lo que se ve.
 * El material es la historia REAL de la mesa (28-nov, nombres cambiados): la dirección escribió la ficha de diseño (tabla «| Bloque | Contenido | Tipografía |»)
 * en «Texto» y la condición de publicación «*(publicar si … antes del 6-dic)*» como línea suelta, y el dibujo pintó las dos. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { esNotaDelDirector, limpiarTexto, notasEnCursiva, traducirPieza } from '../mesa/traductor'
import { traducirPropuestasDeImagen } from '../mesa/propuestas-imagen'
import { traducirGuion } from '../video/guion'
import { CONVENCION_DE_LA_PIEZA, LO_QUE_SE_DIBUJA } from '../mesa/pedidos'

const REAL = readFileSync(join(__dirname, 'fixtures', 'pieza-real-historia-con-ficha.md'), 'utf8')
const REF = 's2-d6-ig_historia_sab_prueba'
const OPC = { refsDelKit: [REF], tipoPorRef: { [REF]: 'historia' as const }, preguntasHechas: 99 }
const FICHA = /\|\s*-{3}|\| *Bloque *\||Tipograf[ií]a|publicar si/i
const TABLA = ['| Bloque | Contenido |', '|---|---|', '| Cita | «lo mejor de la semana» |'].join('\n')

describe('la historia REAL con su ficha → nada de la ficha llega al dibujo', () => {
  it('ninguna propuesta pinta la tabla ni la condición; sin texto final que dibujar, la pieza no se inventa (viaja a la jefatura como texto)', () => {
    const tp = traducirPropuestasDeImagen(REAL, 'kit', { objetivo: 2, ronda: 1, traduccion: OPC })
    if (tp.ok) for (const p of tp.resultado.propuestas) expect(JSON.stringify(p.laminas)).not.toMatch(FICHA)
    else expect(tp.motivo).toBe('ninguna propuesta trae láminas que se puedan leer')
    // el mismo texto como pieza suelta: tampoco dibuja la ficha
    const t = traducirPieza(REAL.split('## s2-d6-ig_historia_sab_prueba · versión B')[0], 'kit', OPC)
    if (t.ok) expect(JSON.stringify(t.copy_kit)).not.toMatch(FICHA)
  })
})

describe('la vara común: ficha en tabla y nota en cursiva no son texto de la pieza', () => {
  it('una tabla markdown es nota del director; un texto con barras sueltas no', () => {
    expect(esNotaDelDirector(TABLA)).toBe(true)
    expect(esNotaDelDirector(limpiarTexto(TABLA))).toBe(true)
    expect(esNotaDelDirector('| Bloque | Contenido |')).toBe(true)
    // markdown admite la tabla sin barra al borde: la delata su línea de guiones
    expect(esNotaDelDirector('Bloque | Contenido\n---|---\nCita | lo mejor de la semana')).toBe(true)
    expect(esNotaDelDirector('pide hoy | paga al recibir')).toBe(false)
    expect(esNotaDelDirector('Envío gratis - hoy')).toBe(false)
  })
  it('la nota en cursiva entre paréntesis se quita y se nombra; el resto del texto queda', () => {
    const v = 'Pide hoy tu almuerzo *(publicar si llega el permiso antes del 6-dic)*'
    expect(limpiarTexto(v)).toBe('Pide hoy tu almuerzo')
    expect(notasEnCursiva(v)).toEqual(['*(publicar si llega el permiso antes del 6-dic)*'])
    expect(limpiarTexto('_(solo si aprueba el dueño)_ Gracias')).toBe('Gracias')
    expect(limpiarTexto('Abrimos (de 9 a 18)')).toBe('Abrimos (de 9 a 18)')
    expect(notasEnCursiva('Abrimos (de 9 a 18)')).toEqual([])
  })
})

describe('todas las familias: el texto bueno se dibuja, la ficha y la nota no, y se avisa', () => {
  it('kit', () => {
    const md = ['## Objetivo', 'que pidan hoy · marca.ec', `## ${REF}`, 'Título: Pide hoy *(publicar si llega el permiso)*', 'Texto:', TABLA, 'Qué se ve: el plato en la mesa', 'Imagen: ninguna'].join('\n')
    const t = traducirPieza(md, 'kit', OPC)
    expect(t.ok).toBe(true)
    expect(t.copy_kit![0].headline).toBe('Pide hoy')
    expect(t.copy_kit![0].body).toBeUndefined()
    expect(t.avisos.join(' | ')).toMatch(/el título traía la nota «\*\(publicar si llega el permiso\)\*» del director y no se dibujó/)
    expect(t.avisos.join(' | ')).toMatch(/el texto traía una nota del director y no se dibujó/)
  })
  it('carrusel', () => {
    const md = ['## Objetivo', 'que pidan · marca.ec', '## Lámina 1 · hook', 'Título: Pide hoy *(si aprueba el dueño)*', 'Texto:', TABLA, 'Imagen: ninguna', '## Lámina 2 · cierre', 'Título: Escríbenos', 'Imagen: ninguna', '## Pie', 'Te esperamos.'].join('\n')
    const t = traducirPieza(md, 'carrusel')
    expect(t.ok).toBe(true)
    expect(t.laminas![0].headline).toBe('Pide hoy')
    expect(t.laminas![0].body).toBeUndefined()
    expect(t.avisos.join(' | ')).toMatch(/lámina 1: el título traía la nota «\*\(si aprueba el dueño\)\*» del director/)
    expect(t.avisos.join(' | ')).toMatch(/lámina 1: el texto traía una nota del director y no se dibujó/)
  })
  it('foto con texto (post)', () => {
    const md = ['## Objetivo', 'que pidan · marca.ec', '## Pieza', 'Título: Pide hoy *(publicar el sábado si hay stock)*', 'Texto:', TABLA, 'Qué se ve: el plato', 'Imagen: ninguna', '## Pie', 'Te esperamos.'].join('\n')
    const t = traducirPieza(md, 'post')
    expect(t.ok).toBe(true)
    expect(t.pieza_post!.texto_en_imagen.titular).toBe('Pide hoy')
    expect(t.pieza_post!.texto_en_imagen.bajada).toBeUndefined()
    expect(t.avisos.join(' | ')).toMatch(/el título traía la nota «\*\(publicar el sábado si hay stock\)\*» del director y no se escribió sobre la imagen/)
    expect(t.avisos.join(' | ')).toMatch(/el texto traía una nota del director y no se escribió sobre la imagen/)
  })
  it('video: el texto en pantalla no compone la ficha ni la nota', () => {
    const md = ['## Plano 1 · 0–4 s', 'Se ve: el plato humeante', 'Texto en pantalla: Pide hoy *(si aprueba el dueño)*', '## Plano 2 · 4–8 s', 'Se ve: la puerta del local', 'Texto en pantalla:', TABLA, '## Pie', 'Te esperamos.'].join('\n')
    const t = traducirGuion(md, { preguntasHechas: 99 })
    expect(t.planos[0].texto_en_pantalla).toBe('Pide hoy')
    expect(t.planos[1].texto_en_pantalla).toBeUndefined()
    expect(t.avisos.join(' | ')).toMatch(/plano 1: el texto en pantalla traía la nota «\*\(si aprueba el dueño\)\*» del director y no se compone/)
    expect(t.avisos.join(' | ')).toMatch(/plano 2: el texto en pantalla traía una nota del director y no se compone/)
  })
})

describe('la convención del kit ahora dice qué se dibuja (antes solo la del carrusel, el post y el video lo decían)', () => {
  it('el kit lleva la regla, con dónde va la ficha y dónde la condición de publicación', () => {
    expect(CONVENCION_DE_LA_PIEZA('kit')).toContain(LO_QUE_SE_DIBUJA)
    expect(LO_QUE_SE_DIBUJA).toMatch(/sin tablas/)
    expect(LO_QUE_SE_DIBUJA).toMatch(/«Qué se ve» o «Ambiente»/)
    expect(LO_QUE_SE_DIBUJA).toMatch(/condiciones de publicación .*«## Alternativas»/)
  })
})
