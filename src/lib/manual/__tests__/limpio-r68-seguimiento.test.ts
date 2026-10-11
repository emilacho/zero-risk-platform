/**
 * Seguimiento de #499 (CC#3 §A.4-a): una prueba por cada mutación que sobrevivió en `limpieza.ts`: comillas «…», bordes del corte de oraciones, oración huérfana en minúscula,
 * listas de términos, longitud mínima de una palabra prohibida, abreviatura de lo quitado. Los casos que son SIMPLEMENTE equivalentes se quitaron del código (ver el papel).
 */
import { describe, expect, it } from 'vitest'
import { limpiarManual, palabrasProhibidasDelManual, quitarNombresInternos, repararFragmentos, usaPalabraProhibida } from '../limpieza'

describe('comillas «…»: dentro de una cita no se corta ni se juzga', () => {
  it('un punto dentro de «…» no parte la oración, aunque lo que sigue empiece en minúscula', () => {
    const t = 'Dice «sirve ceviche. con delivery» siempre. Otra frase sana.'
    expect(repararFragmentos(t).texto).toBe(t)
  })
  it('tras cerrar la cita el corte vuelve a funcionar (el contador de comillas se desanida)', () => {
    expect(repararFragmentos('Dice «hola. adiós» ya. , cola rota. Frase sana.').texto).toBe('Frase sana.')
  })
  it('una cita sin cerrar no se traga el resto del campo para siempre', () => {
    expect(repararFragmentos('Abre «cita sin cerrar. Otra frase. , rota. Final sana.').quitadas).toEqual([])
  })
})

describe('bordes del corte de oraciones', () => {
  it('el punto final de la línea corta (la última oración es una oración)', () => {
    expect(repararFragmentos('Frase uno. , resto roto.').texto).toBe('')
    expect(repararFragmentos('Frase uno. Frase dos. , resto roto.').texto).toBe('Frase uno.')
  })
  it('abreviaturas y números con punto no cortan: «vs.», «etc.», «3.» y la dirección «naufrago.ec»', () => {
    for (const t of ['Cuesta menos vs. la competencia y más. Otra.', 'Hay pan, queso, etc. y leche. Fin.', 'Son 3. y además 4. Fin.', 'Ver cliente.test para más. Fin.']) expect(repararFragmentos(t).texto).toBe(t)
  })
  it('signos distintos de punto también cortan: ! ? …', () => {
    expect(repararFragmentos('¡Hola! , rota. Sana.').texto).toBe('Sana.')
    expect(repararFragmentos('¿Listo? , rota. Sana.').texto).toBe('Sana.')
    expect(repararFragmentos('Bien… , rota. Sana.').texto).toBe('Sana.')
  })
  it('una oración de 1-2 letras («A.») no se salta su propio punto: tras ella el corte sigue bien', () => {
    expect(repararFragmentos('Frase. A. , rota.').texto).toBe('Frase.')
    expect(repararFragmentos('Frase. Sí. , rota. Sana.').texto).toBe('Frase. Sana.')
  })
  it('cada línea se trata aparte (lo roto de un renglón no arrastra al siguiente)', () => {
    expect(repararFragmentos('Línea sana uno.\nLínea dos. , rota.\nLínea tres sana.').texto).toBe('Línea sana uno.\nLínea tres sana.')
  })
})

describe('oración huérfana en minúscula', () => {
  it('una oración que arranca en minúscula tras un punto es resto de algo cortado y sale', () => {
    expect(repararFragmentos('Sirve ceviche. con delivery. Otra frase.')).toMatchObject({ texto: 'Sirve ceviche. Otra frase.', quitadas: ['con delivery.'] })
  })
  it('pero un nombre o dirección que arranca en minúscula NO es huérfano: «naufrago.ec es…», «iPhone», «#etiqueta», «@usuario»', () => {
    for (const t of ['Visita nuestra web. naufrago.ec es la dirección.', 'Compra. iPhone y más.', 'Mira. #hashtag aquí.', 'Escríbenos. @usuario responde.']) expect(repararFragmentos(t).texto).toBe(t)
  })
  it('el primer renglón nunca es «continuación»: un valor corto en minúscula se queda', () => {
    expect(repararFragmentos('producto').texto).toBe('producto')
    expect(repararFragmentos('producto. otra').quitadas).toEqual(['otra'])
  })
  it('una coma o dos puntos al arranque de una oración borra también la introducción sin sujeto que la antecede', () => {
    expect(repararFragmentos('Intro sin sujeto. ; sigue. Sana.').texto).toBe('Sana.')
    expect(repararFragmentos('Intro sin sujeto. : sigue. Sana.').texto).toBe('Sana.')
  })
})

describe('las listas de términos NO son prosa', () => {
  const manual = {
    forbidden_words: ['artesanal', 'exclusivo'],
    required_terminology: ['origen verificable (campo_x)', 'delivery'],
    tagline_opciones: ['«Cuando tengas hambre» [frase propia del cliente, verbatim, sitio]', 'Pide ya (icp_signals)'],
    voz: 'Cercana y cálida.',
  }
  it('forbidden_words, required_terminology y tagline_opciones no se limpian (quedan tal cual)', () => {
    const r = limpiarManual(manual)
    expect(r.manual.forbidden_words).toEqual(manual.forbidden_words)
    expect(r.manual.required_terminology).toEqual(manual.required_terminology)
    expect(r.manual.tagline_opciones).toEqual(manual.tagline_opciones)
    expect(r.quitados).toEqual([])
  })
  it('y las palabras de forbidden_words no se quitan de sí mismas: la lista sigue completa aunque el manual las "use"', () => {
    expect(limpiarManual({ forbidden_words: ['artesanal'], voz: 'Cálida.' }).manual.forbidden_words).toEqual(['artesanal'])
  })
})

describe('palabras prohibidas: largo mínimo', () => {
  it('una "palabra" de 2 letras no se toma (de, la, el vaciarían todo el manual)', () => {
    expect(palabrasProhibidasDelManual({ forbidden_words: ['de', 'la', 'ab'] })).toEqual([])
    const m = { forbidden_words: ['de'], voz: 'Cocina de la casa de siempre.' }
    expect(limpiarManual(m).manual.voz).toBe(m.voz)
  })
  it('una de 3 letras SÍ se toma (borde): «gas» prohibida quita la oración que la usa', () => {
    expect(palabrasProhibidasDelManual({ forbidden_words: ['gas'] })).toEqual(['gas'])
    expect(limpiarManual({ forbidden_words: ['gas'], voz: 'Cocina a gas. Cercana y cálida.' }).manual.voz).toBe('Cercana y cálida.')
  })
  it('acepta frases ("calidad garantizada") y tolera el plural simple', () => {
    expect(usaPalabraProhibida('Ofrecemos calidad garantizada hoy', ['calidad garantizada'])).toBe('calidad garantizada')
    expect(usaPalabraProhibida('Los platos premiums', ['premium'])).toBe('premium')
  })
})

describe('lo que se quitó queda registrado, con el texto (recortado a 200 caracteres cuando no hay bloque)', () => {
  it('un identificador suelto largo: el registro guarda a lo sumo 200 caracteres del texto', () => {
    const largo = `${'palabra '.repeat(40)}campo_interno_x ${'cierre '.repeat(10)}`
    const r = limpiarManual({ voz: largo })
    const q = r.quitados.find((x) => x.motivo === 'nombre_interno_citado')!
    expect(q.texto.length).toBeLessThanOrEqual(200)
    expect(q.texto.length).toBeGreaterThan(190)
  })
  it('un texto de exactamente 200 caracteres se guarda entero; uno de 201 se corta en 200', () => {
    const base = 'campo_x ' + 'a'.repeat(192) // 200
    expect(limpiarManual({ voz: base }).quitados[0].texto).toBe(base.trim().slice(0, 200).trim())
    expect(limpiarManual({ voz: base + 'b' }).quitados[0].texto.length).toBeLessThanOrEqual(200)
  })
  it('un bloque quitado se guarda como bloque (no el texto entero)', () => {
    expect(limpiarManual({ voz: 'Cálida y cercana (icp_signals) siempre.' }).quitados[0].texto).toBe('(icp_signals)')
  })
})

describe('rutas profundas: una lista que se queda con un elemento vacío lo pierde, incluso anidada', () => {
  it('visual.reglas.debe[1] vacío tras la limpieza sale de la lista; el resto se queda en su orden', () => {
    const m = { forbidden_words: ['artesanal'], visual: { reglas: { debe: ['Buena regla uno', 'Mostrar lo artesanal', 'Buena regla tres'] } } }
    expect((limpiarManual(m).manual as any).visual.reglas.debe).toEqual(['Buena regla uno', 'Buena regla tres'])
  })
  it('una ruta que atraviesa un nulo no rompe la limpieza', () => {
    expect(() => limpiarManual({ visual: { reglas: null }, forbidden_words: ['gas'], voz: 'Cálida.' })).not.toThrow()
  })
})

describe('nombres internos: los bordes que no deben tocarse', () => {
  it('«ICP» suelto como sigla de producto no es la etiqueta interna; sí «ICP goals»', () => {
    expect(quitarNombresInternos('El ICP del cliente (ICP goals S2: «x») importa.').texto).toBe('El ICP del cliente importa.')
  })
})
