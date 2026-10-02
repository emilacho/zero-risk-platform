/**
 * LOS TRES DEFECTOS DE LOS CHEQUEOS QUE ENCONTRÓ LA CERTIFICACIÓN (CC#3 · 02-oct · «la primera pieza real») · CC#1 · construcción en seco · US$ 0.
 *
 *   ① FALSO POSITIVO «directo a tu puerta»: la frase estaba DOS veces en el texto, pegada a un punto («puerta.»), y la búsqueda por espacios no la veía.
 *   ② EL BOTÓN: el brief dice «Botón: «Enviar mensaje» → WhatsApp +593…». El teléfono es el DESTINO del botón (no es copy: ruido) y el botón sí tiene que nombrarse en la pieza.
 *   ③ LAS NEGACIONES del prompt de imagen: se decía «hay una negación» sin decir cuáles ni en qué idioma; el pedido no le enseñaba a traducir las negaciones del brief a positivo.
 *
 * Cada defecto se demuestra con la pieza REAL que certificó CC#3 (textos copiados de su informe) y con su ROJO: la misma pieza contra el chequeo de ANTES.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const CH = require(join(DIR, 'pieza-chequeos.js'))
const BRIEF = JSON.parse(readFileSync(join(DIR, 'fixtures', 'brf-0006.json'), 'utf8'))

// la pieza de la primera corrida real (texto en español de Ecuador; el voseo «Escribinos» era del brief y se trata aparte)
const PIEZA_REAL = {
  titular: 'Ceviche de Olón · $7 · delivery GYE',
  texto_principal:
    'Ceviche de Olón a $7 con delivery Guayaquil, de jueves a lunes de 7am a 3pm. Marisco de Olón directo a tu puerta. Escríbenos por WhatsApp. ' +
    'Cada porción sale del mar al plato: te lo llevamos directo a tu puerta.',
  prompt_imagen: 'A plate of ceviche fills the frame, warm natural light. No people, no logo, no text overlay, no sauce bottles in frame.',
  fuente_imagen: 'cliente',
  no_pude_cumplir: [],
  que_miro: ['instagram', 'ficha_en_mapas'],
}
const hallazgo = (r: { hallazgos: { chequeo: string; detalle: string }[] }, c: string) => r.hallazgos.filter((h) => h.chequeo === c)

describe('① «directo a tu puerta» pegada a un punto SÍ está', () => {
  it('la pieza real (la frase dos veces, una con punto) ya no da «término obligatorio ausente»', () => {
    const r = CH.chequearPieza(BRIEF, PIEZA_REAL, { forbidden_words: [] })
    expect(hallazgo(r, 'termino_obligatorio_ausente')).toEqual([])
  })
  it('el punto, la coma, los dos puntos, el guion y la barra separan; NO inventa coincidencias dentro de otra palabra', () => {
    const t = (s: string) => CH.normalizar(s)
    expect(CH.palabraPresente(t('Pídelo ya. Directo a tu puerta.'), 'directo a tu puerta')).toBe(true)
    expect(CH.palabraPresente(t('envío: directo a tu puerta, hoy'), 'directo a tu puerta')).toBe(true)
    expect(CH.palabraPresente(t('delivery/directo a tu puerta'), 'directo a tu puerta')).toBe(true)
    expect(CH.palabraPresente(t('marisco-de-Olón fresco'), 'marisco de Olón')).toBe(true)
    // una palabra contenida en otra NO cuenta (la búsqueda sigue siendo por palabra completa)
    expect(CH.palabraPresente(t('ceviches de olonia'), 'ceviche')).toBe(false)
    expect(CH.palabraPresente(t('barato'), 'rato')).toBe(false)
  })
  it('lo que de verdad falta SIGUE detectándose (control positivo del chequeo)', () => {
    const sin = { ...PIEZA_REAL, texto_principal: 'Ceviche de Olón a $7 con delivery Guayaquil, de jueves a lunes de 7am a 3pm.' }
    const r = CH.chequearPieza(BRIEF, sin, { forbidden_words: [] })
    expect(hallazgo(r, 'termino_obligatorio_ausente')[0].detalle).toContain('directo a tu puerta')
  })
  it('una prohibida pegada a un punto TAMBIÉN se ve (el mismo defecto, del otro lado)', () => {
    const con = { ...PIEZA_REAL, texto_principal: 'Probá el mejor. Ceviche de Olón.' }
    const r = CH.chequearPieza({ ...BRIEF, prohibido: ['el mejor'] }, con, { forbidden_words: [] })
    expect(hallazgo(r, 'palabra_prohibida').length).toBe(1)
  })
})

describe('② el botón del llamado a la acción', () => {
  it('el teléfono del destino del botón ya NO se exige en el texto (es el destino del botón, no copy)', () => {
    const r = CH.chequearPieza(BRIEF, PIEZA_REAL, { forbidden_words: [] })
    expect(hallazgo(r, 'llamado_ausente')).toEqual([])
  })
  it('🔴 el botón «Enviar mensaje» SÍ se pide nombrarlo: la pieza real no lo nombra ⇒ hallazgo (candidato, no fatal)', () => {
    const r = CH.chequearPieza(BRIEF, PIEZA_REAL, { forbidden_words: [] })
    const h = hallazgo(r, 'boton_sin_mencion')
    expect(h.length).toBe(1)
    expect(h[0].detalle).toContain('Enviar mensaje')
    expect(r.fatales).not.toContain('boton_sin_mencion')
  })
  it('si la pieza nombra el botón, no hay hallazgo (con tilde, mayúsculas o pegado a un punto)', () => {
    const con = { ...PIEZA_REAL, texto_principal: PIEZA_REAL.texto_principal + ' Toca «ENVIAR MENSAJE».' }
    expect(hallazgo(CH.chequearPieza(BRIEF, con, { forbidden_words: [] }), 'boton_sin_mencion')).toEqual([])
  })
  it('un llamado SIN botón conserva su comportamiento de siempre: el teléfono/enlace/@ sí se exigen', () => {
    const b = { ...BRIEF, llamado_a_la_accion: 'Escribe al +593 997 744 288 o a www.naufrago.ec' }
    const r = CH.chequearPieza(b, PIEZA_REAL, { forbidden_words: [] })
    expect(hallazgo(r, 'llamado_ausente').length).toBe(2)
    expect(hallazgo(r, 'boton_sin_mencion')).toEqual([])
  })
  it('un botón con enlace de destino (→ https://…): el enlace del destino tampoco se exige; el rótulo sí', () => {
    const b = { ...BRIEF, llamado_a_la_accion: 'Botón: «Reservar» → https://naufrago.ec/reservas' }
    const r = CH.chequearPieza(b, PIEZA_REAL, { forbidden_words: [] })
    expect(hallazgo(r, 'llamado_ausente')).toEqual([])
    expect(hallazgo(r, 'boton_sin_mencion')[0].detalle).toContain('Reservar')
  })
  it('datosDelLlamado y botonDelLlamado se pueden usar solos', () => {
    expect(CH.botonDelLlamado(BRIEF.llamado_a_la_accion)).toEqual({ etiqueta: 'Enviar mensaje', destino: 'WhatsApp Business +593 997 744 288.' })
    expect(CH.botonDelLlamado('Escribe al +593 997 744 288')).toBeNull()
    expect(CH.datosDelLlamado(BRIEF.llamado_a_la_accion)).toEqual([])
  })
})

describe('③ las negaciones del prompt de imagen: se dicen TODAS, en español o en inglés', () => {
  it('el prompt real tiene 4 negaciones y el hallazgo las nombra a las 4 (antes: «una negación» y nada más)', () => {
    const r = CH.chequearPieza(BRIEF, PIEZA_REAL, { forbidden_words: [] })
    const h = hallazgo(r, 'prompt_con_negaciones')
    expect(h.length).toBe(1)
    for (const f of ['no people', 'no logo', 'no text overlay', 'no sauce bottles in frame']) expect(h[0].detalle.toLowerCase()).toContain(f)
    expect(h[0].detalle).toMatch(/4/)
  })
  it('detecta también «without», «not», «never» y «avoid» (el prompt va en inglés y la regla sólo miraba español)', () => {
    for (const p of ['a plate without people', 'the plate, not a bowl', 'never a logo', 'avoid text overlay']) {
      expect(hallazgo(CH.chequearPieza(BRIEF, { ...PIEZA_REAL, prompt_imagen: p }, { forbidden_words: [] }), 'prompt_con_negaciones').length).toBe(1)
    }
  })
  it('un prompt en positivo NO da hallazgo (control positivo) · ni «nothing» ni «know» ni «note» por contener «no»', () => {
    for (const p of ['A single plate of ceviche on a wooden table, warm light, shallow depth of field', 'a plate; I know the note about notes', 'un plato solo sobre una mesa de madera, luz cálida']) {
      expect(hallazgo(CH.chequearPieza(BRIEF, { ...PIEZA_REAL, prompt_imagen: p }, { forbidden_words: [] }), 'prompt_con_negaciones')).toEqual([])
    }
  })
  it('el pedido que arma el flujo le enseña al productor a traducir las negaciones del BRIEF a positivo', () => {
    const js = readFileSync(join(DIR, 'n5-armar-cuerpo.js'), 'utf8')
    expect(js).toMatch(/negaci[oó]n/i)
    expect(js).toMatch(/no aparecen personas/i) // el caso real: el brief dice «No aparecen personas…» y el productor lo copió
    expect(js).toMatch(/en positivo/i)
  })
})
