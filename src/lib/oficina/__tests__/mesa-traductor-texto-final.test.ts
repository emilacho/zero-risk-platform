/**
 * P1 y P2 del encargo de correcciones (29-oct) · el armado usa SOLO el texto final que integró el director.
 * El material es la pieza REAL de la mesa (BRF-0002 · encargo 8adbfb3d): el director dejó fichas técnicas («Titular nativo FB (≤40 car.)», «Variante A/B», «Texto en imagen:»),
 * y las láminas salieron con eso escrito encima. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { elegirVariante, esNotaDelDirector, limpiarPie, limpiarTexto, nombreDeCampo, traducirPieza } from '../mesa/traductor'
import { textoParaCopiar } from '../entrega'

const REAL = readFileSync(join(__dirname, 'fixtures', 'pieza-real-mesa-brf0002.md'), 'utf8')
const PROHIBIDO = /\*\*|`|≤|variante\s+[ab]\b|titular nativo|descripci[oó]n nativa|texto en imagen|car\.\)/i

describe('la pieza REAL de la mesa → láminas con texto final (P1)', () => {
  const t = traducirPieza(REAL, 'carrusel')
  it('traduce las 6 láminas y NINGUNA lleva notas del director, markdown ni «≤»', () => {
    expect(t.ok).toBe(true)
    expect(t.laminas).toHaveLength(6)
    for (const l of t.laminas!) for (const campo of [l.headline, l.body, l.cta, l.eyebrow]) if (campo) expect(campo, `lámina ${l.orden}`).not.toMatch(PROHIBIDO)
    expect(t.copy_carrusel!.texto_base).not.toMatch(PROHIBIDO)
  })
  it('cada título es el de la variante elegida (A: la primera, porque el director no marcó una) y la B queda de alternativa', () => {
    const titulos = t.laminas!.map((l) => l.headline)
    expect(titulos).toEqual(['¿Tu extintor pasa la inspección?', 'Etiqueta de recarga vigente', 'Manómetro en zona verde', 'Sello de seguridad intacto', 'Cilindro sin daños visibles', 'Cotiza tu recarga por WhatsApp'])
    expect(t.alternativas?.join(' | ')).toContain('Extintor sin recarga = multa segura')
    expect(t.avisos.join(' | ')).toMatch(/variantes del título; se usó la A/)
  })
  it('el cuerpo y la descripción nativa quedan en su sitio: cuerpo → texto, descripción → sobre-título; «Texto en imagen» no se cuela', () => {
    const l = t.laminas!
    expect(l[0]).toMatchObject({ headline: '¿Tu extintor pasa la inspección?', eyebrow: 'Lo que el Bombero va a revisar' })
    expect(l[0].body).toBeUndefined()
    expect(l[1]).toMatchObject({ eyebrow: 'Punto 1 de la inspección', body: 'La etiqueta debe mostrar fecha de última recarga y próximo vencimiento. Si está vencida o ilegible, es observación directa.' })
    expect(l[2].body).toMatch(/^La aguja debe estar en el rango verde/)
    expect(JSON.stringify(l)).not.toMatch(/Logo Zero Risk en esquina|Chip|numeración discreta/)
  })
  it('la instrucción «Botón nativo de Facebook…» no se dibuja como llamado', () => {
    expect(t.laminas![5].cta).toBeUndefined()
    expect(t.laminas![5].eyebrow).toBe('Zero Risk — respuesta rápida')
  })
  it('las imágenes: «foto:`0443a42d`» es la foto propia (antes se perdía por las comillas inversas) y lo condicional se queda con lo que SÍ se genera', () => {
    const im = t.imagenes
    expect(im[0]).toEqual({ ref: 'hook', modo: 'real', foto_id: '0443a42d' })
    expect(im[1]).toMatchObject({ modo: 'generada' })
    const manometro = im[2] as { modo: string; descripcion: string }
    expect(manometro.modo).toBe('generada')
    expect(manometro.descripcion).toMatch(/^plano detalle de manómetro/)
    expect(manometro.descripcion).not.toMatch(/Verificar primero/)
    expect(im[5].modo).toBe('ninguna')
  })
})

describe('el pie de publicación es el que integró el director (P2)', () => {
  const t = traducirPieza(REAL, 'carrusel')
  it('abre con el texto de publicación elegido (variante A) y cierra con su `## Pie`; sin notas ni separadores ni hashtags dentro', () => {
    expect(t.pie_de_foto.startsWith('Si el Cuerpo de Bomberos llega hoy, ¿tu extintor pasa la revisión?')).toBe(true)
    expect(t.pie_de_foto).toContain('¿Tu extintor ya tiene la recarga al día? Escríbenos por WhatsApp')
    expect(t.pie_de_foto).not.toMatch(/mismo para ambas|---|#extintores|multa es tuya/)
    expect(t.alternativas?.join(' | ')).toContain('la multa es tuya')
  })
  it('los hashtags salen una sola vez: lista sin repetir, y el texto para copiar no los duplica aunque el pie los traiga', () => {
    expect(t.hashtags).toHaveLength(10)
    const copiable = textoParaCopiar({ pie_de_foto: `${t.pie_de_foto}\n\n${t.hashtags.join(' ')}`, hashtags: t.hashtags })
    expect(copiable.match(/#extintores\b/g)).toHaveLength(1)
    expect(copiable.match(/#ZeroRisk/g)).toHaveLength(1)
  })
  it('hashtags repetidos (también con otra mayúscula) se cuentan una vez', () => {
    const md = '## Lámina 1 · hook\nTítulo: Hola\n## Pie\nTexto.\n## Etiquetas\n#Uno #uno #Dos #UNO'
    expect(traducirPieza(md, 'carrusel').hashtags).toEqual(['#Uno', '#Dos'])
  })
  it('el director puede marcar la variante elegida y esa gana (aunque no sea la primera)', () => {
    const md = '## Texto de publicación · VARIANTE A\nUno.\n## Texto de publicación · VARIANTE B (elegida)\nDos.\n## Lámina 1 · hook\nTítulo: Hola\n'
    expect(traducirPieza(md, 'carrusel').pie_de_foto).toBe('Dos.')
  })
})

describe('piezas que ya venían bien siguen igual', () => {
  it('la convención ligera de siempre (Título/Texto/Llamado/Imagen, Pie, Etiquetas)', () => {
    const md = ['## Lámina 1 · hook', 'Título: Tu extintor, al día', 'Texto: Revisa la etiqueta', 'Imagen: foto:abc12345', '## Lámina 2 · cta', 'Título: Escríbenos', 'Llamado: Cotiza hoy', 'Imagen: ninguna', '## Pie', 'Un pie sencillo.', '## Etiquetas', '#a #b'].join('\n')
    const t = traducirPieza(md, 'carrusel')
    expect(t.laminas).toEqual([{ orden: 1, rol: 'hook', headline: 'Tu extintor, al día', body: 'Revisa la etiqueta' }, { orden: 2, rol: 'cta', headline: 'Escríbenos', cta: 'Cotiza hoy' }])
    expect(t.pie_de_foto).toBe('Un pie sencillo.')
    expect(t.hashtags).toEqual(['#a', '#b'])
    expect(t.alternativas).toBeUndefined()
  })
  it('una línea «Etiqueta: …» desconocida ya no se pega al campo anterior', () => {
    const md = '## Lámina 1 · hook\nTítulo: Hola\n**Texto en imagen:** logo abajo\ncontinúa la nota\nTexto: Cuerpo real\n'
    const l = traducirPieza(md, 'carrusel').laminas![0]
    expect(l.headline).toBe('Hola'); expect(l.body).toBe('Cuerpo real')
  })
  it('un título que es SOLO una nota se descarta y se pregunta una vez (no se dibuja la nota)', () => {
    const md = '## Lámina 1 · hook\nTítulo: Titular nativo FB\n'
    const t = traducirPieza(md, 'carrusel')
    expect(t.ok).toBe(false)
  })
})

describe('utilidades', () => {
  it('nombreDeCampo quita lo que el director le pone al lado', () => {
    expect(nombreDeCampo('Titular nativo FB (≤40 car.)')).toBe('titular')
    expect(nombreDeCampo('Cuerpo (texto nativo debajo de imagen)')).toBe('cuerpo')
    expect(nombreDeCampo('Descripción nativa FB (≤30 car.)')).toBe('descripcion')
  })
  it('limpiarTexto y esNotaDelDirector', () => {
    expect(limpiarTexto('**Hola** `mundo` (≤40 car.)')).toBe('Hola mundo')
    expect(esNotaDelDirector('Variante A: x')).toBe(true)
    expect(esNotaDelDirector('El extintor de 5 kg ≤ 40 cm')).toBe(true)
    expect(esNotaDelDirector('Revisa tu extintor hoy')).toBe(false)
  })
  it('limpiarPie quita notas entre paréntesis, separadores y líneas de solo hashtags', () => {
    expect(limpiarPie('*(nota para el equipo)*\n\nTexto real.\n---\n#a #b')).toBe('Texto real.')
  })
  it('elegirVariante: la marcada gana; sin marca, la primera; vacío → null', () => {
    expect(elegirVariante([])).toBeNull()
    expect(elegirVariante([{ letra: 'A', texto: 'a', elegida: false }, { letra: 'B', texto: 'b', elegida: true }])!.usada.letra).toBe('B')
    expect(elegirVariante([{ letra: 'A', texto: 'a', elegida: false }, { letra: 'B', texto: 'b', elegida: false }])!.usada.letra).toBe('A')
  })
})
