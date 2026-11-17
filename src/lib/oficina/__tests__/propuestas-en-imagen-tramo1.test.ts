/**
 * 17-nov · propuestas también en IMAGEN · tramo 1 (CC1 · contrato CC5 v1 §1a): la integración de la mesa de imagen con N propuestas → `propuestas_imagen`.
 * Lo que mide CC6 (NOTA «lo que voy a medir»): 1 nada se pierde (título pegado, texto antes, cuáles faltan) · 2 las láminas de cada propuesta = las que escribió la mesa,
 * con los cuadros del kit (#1120) · 7 el video no cambia (sus pruebas pasan sin tocar). US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { ARTEFACTO_PROPUESTAS_IMAGEN, sinCabeceraDeLaPropuesta, traducirPropuestasDeImagen } from '../mesa/propuestas-imagen'

const KIT = (n: number, nombre: string, foto = 'foto:062ec4fa') => [
  `# Propuesta ${n} · ${nombre}`,
  `Concepto: ${nombre.toLowerCase()} · Objetivo: que pidan desde casa · Por qué: el origen convence`,
  '## Lámina 1 · El gancho', 'Título: ya llegó.', 'Texto: —', 'Llamado: —', 'Firma: el encebollado de Olón · naufrago.ec', 'Qué se ve: la puerta abierta de la cocina', 'Imagen: ninguna',
  '## Lámina 2 · La prueba de origen', 'Título: Nació en Olón.', 'Texto: Ahora pídelo desde casa.', 'Llamado: naufrago.ec', `Imagen: ${foto}`,
].join('\n')
const POST = (n: number, nombre: string, imagen = 'foto:f-01') => [
  `# Propuesta ${n} · ${nombre}`,
  '## Objetivo', 'Que vengan a probar el plato del día · Escríbenos',
  '## Pieza', 'Sobre-título: Hoy en la casa', `Título: ${nombre}`, 'Texto: Recién salido de la cocina', 'Llamado: Escríbenos', 'Qué se ve: el plato sobre la mesa de madera', `Imagen: ${imagen}`,
  '## Pie', 'Hoy te esperamos con el plato del día.',
  '## Etiquetas', '#platodeldia #almuerzo',
].join('\n')
const CARRUSEL = (n: number, nombre: string) => [
  `# Propuesta ${n} · ${nombre}`,
  '## Lámina 1 · hook', `Título: ${nombre}`, 'Imagen: generar: la olla humeando',
  '## Lámina 2 · proof', 'Título: Desde 1998 en Olón', 'Texto: La receta de la abuela',
  '## Lámina 3 · cta', 'Título: Pídelo hoy', 'Llamado: naufrago.ec',
  '## Pie', 'El encebollado de siempre, ahora en Quito.',
  '## Etiquetas', '#encebollado',
].join('\n')
const OPC_KIT = { refsDelKit: ['e01'], tipoPorRef: { e01: 'historia' as const } }

describe('propuestas en imagen · la integración → propuestas_imagen (contrato §1a)', () => {
  it('el artefacto se llama como dice el contrato', () => expect(ARTEFACTO_PROPUESTAS_IMAGEN).toBe('propuestas_imagen'))
  it('🔴 kit · 3 propuestas, cada una con sus 2 cuadros (los de #1120), su copy, lo que se ve y la foto propia sin url', () => {
    const r = traducirPropuestasDeImagen([KIT(1, 'La puerta'), KIT(2, 'El origen'), KIT(3, 'La mesa')].join('\n'), 'kit', { objetivo: 3, traduccion: OPC_KIT })
    if (!r.ok) throw new Error(r.motivo)
    const p = r.resultado
    expect(p.clase).toBe('kit')
    expect(p.propuestas.map((x) => [x.id, x.nombre])).toEqual([['P1', 'La puerta'], ['P2', 'El origen'], ['P3', 'La mesa']])
    expect(p.propuestas[0].laminas).toEqual([
      // con «Imagen: ninguna» el traductor del kit no guarda «Qué se ve» (comportamiento de hoy, de CC3): se_ve va ausente, no se inventa
      { n: 1, rol: 'e01', headline: 'ya llegó.' },
      { n: 2, rol: 'e01-c2', headline: 'Nació en Olón.', body: 'Ahora pídelo desde casa.', cta: 'naufrago.ec', foto: { origen: 'real', foto_id: '062ec4fa' } },
    ])
    expect(p.propuestas[0]).toMatchObject({ concepto: 'la puerta', objetivo: 'que pidan desde casa', por_que: 'el origen convence' })
    // el texto de cada propuesta viaja entero (al aprobar es la pieza que se fabrica)
    expect(p.propuestas[1].texto.startsWith('# Propuesta 2 · El origen')).toBe(true)
    expect(p.propuestas[1].texto).toContain('Nació en Olón.')
    expect(p.avisos.filter((a) => /quedan|antes de la primera/.test(a))).toEqual([])
  })
  it('🔴 foto (post) · 1 lámina «pieza» con los 4 textos, el pie y las etiquetas en copy; clase post_img', () => {
    const r = traducirPropuestasDeImagen([POST(1, 'El plato de hoy'), POST(2, 'La olla grande', 'generar: la olla en el fogón'), POST(3, 'La mesa del barrio')].join('\n'), 'post', { objetivo: 3 })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.resultado.clase).toBe('post_img')
    const [p1, p2] = r.resultado.propuestas
    expect(p1.laminas).toEqual([{ n: 1, rol: 'pieza', eyebrow: 'Hoy en la casa', headline: 'El plato de hoy', body: 'Recién salido de la cocina', cta: 'Escríbenos', se_ve: 'el plato sobre la mesa de madera', foto: { origen: 'real', foto_id: 'f-01' } }])
    expect(p1.copy).toMatchObject({ pie_de_foto: 'Hoy te esperamos con el plato del día.', hashtags: ['#platodeldia', '#almuerzo'] })
    expect(p2.laminas[0].foto).toEqual({ origen: 'generada' })
    expect(r.resultado.propuestas).toHaveLength(3)
  })
  it('🔴 carrusel · 3 láminas por propuesta, en orden, con su rol; la imagen generada de la portada', () => {
    const r = traducirPropuestasDeImagen([CARRUSEL(1, 'El vapor'), CARRUSEL(2, 'La abuela'), CARRUSEL(3, 'Quito')].join('\n'), 'carrusel', { objetivo: 3 })
    if (!r.ok) throw new Error(r.motivo)
    const p = r.resultado.propuestas[0]
    expect(p.laminas.map((l) => [l.n, l.rol, l.headline])).toEqual([[1, 'hook', 'El vapor'], [2, 'proof', 'Desde 1998 en Olón'], [3, 'cta', 'Pídelo hoy']])
    expect(p.laminas[0].foto).toEqual({ origen: 'generada' })
    expect(p.laminas[0].se_ve).toBe('la olla humeando')
    expect(p.copy?.pie_de_foto).toBe('El encebollado de siempre, ahora en Quito.')
  })
  it('🔴 nada se pierde (mismo molde que el video): un título pegado se corta y las 3 salen', () => {
    const md = ['Voy a revisar el tablero antes de integrar.' + KIT(1, 'La puerta'), KIT(2, 'El origen'), KIT(3, 'La mesa')].join('\n')
    const r = traducirPropuestasDeImagen(md, 'kit', { objetivo: 3, traduccion: OPC_KIT })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.resultado.propuestas.map((p) => p.nombre)).toEqual(['La puerta', 'El origen', 'La mesa'])
  })
  it('🔴 una propuesta sin láminas que se lean se descarta CON su título, y «quedan N» dice cuál y por qué', () => {
    const md = [POST(1, 'El plato de hoy'), '# Propuesta 2 · Vacía', 'Concepto: nada', POST(3, 'La mesa del barrio')].join('\n')
    const r = traducirPropuestasDeImagen(md, 'post', { objetivo: 3 })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.resultado.propuestas.map((p) => [p.id, p.nombre])).toEqual([['P1', 'El plato de hoy'], ['P2', 'La mesa del barrio']])
    expect(r.resultado.avisos.some((a) => a.startsWith('«Propuesta 2 · Vacía» se descartó:'))).toBe(true)
    expect(r.resultado.avisos).toContain('se pidieron 3 propuestas y quedan 2 (se descartó «Propuesta 2 · Vacía» por sus láminas): se presentan las que hay')
  })
  it('🔴 la cabecera de la propuesta (Concepto · Objetivo · Por qué) se aparta SOLO si es solo eso: con un campo de la pieza antes de la 1.ª lámina, se deja y el traductor lo avisa', () => {
    expect(sinCabeceraDeLaPropuesta(['Concepto: a · Objetivo: b', 'Por qué: c', '', '## Lámina 1', 'Título: x'])).toEqual(['## Lámina 1', 'Título: x'])
    const conCampo = ['Concepto: a', 'Título: se queda', '## Lámina 1', 'Título: x']
    expect(sinCabeceraDeLaPropuesta(conCampo)).toEqual(conCampo)
    const md = ['# Propuesta 1 · A', 'Concepto: a', 'Título: suelto antes de la lámina', '## Lámina 1 · El gancho', 'Título: ya llegó.', 'Imagen: ninguna', KIT(2, 'B')].join('\n')
    const r = traducirPropuestasDeImagen(md, 'kit', { objetivo: 2, traduccion: OPC_KIT })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.resultado.avisos.some((x) => /^P1: texto antes del primer título/.test(x))).toBe(true)
  })
  it('los avisos de la traducción de cada propuesta viajan con su id (no se mezclan)', () => {
    const r = traducirPropuestasDeImagen([KIT(1, 'La puerta'), KIT(2, 'El origen')].join('\n'), 'kit', { objetivo: 2, traduccion: OPC_KIT })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.resultado.avisos.filter((a) => !/^P\d: /.test(a))).toEqual([])
  })
  it('ninguna se puede leer ⇒ ok:false con su motivo (el motor no presenta una tarjeta vacía)', () => {
    const r = traducirPropuestasDeImagen('# Propuesta 1 · A\nConcepto: x\n# Propuesta 2 · B\nConcepto: y', 'post', { objetivo: 2 })
    expect(r.ok).toBe(false)
  })
})
