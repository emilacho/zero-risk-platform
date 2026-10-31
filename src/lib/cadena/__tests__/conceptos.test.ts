/**
 * `concepto.v1` · el contrato que la mesa de creativos entrega y la cadena lee por código (diseño v5 §4 · plan v2 T1).
 * Estas pruebas FIJAN el contrato para CC2 (mesa) y CC3 (certificación): lo que falta se declara; solo «sin gran idea» o «sin banco» lo dejan en `sin_concepto`.
 */
import { describe, expect, it } from 'vitest'
import {
  claveDeTexto, contienePalabraEntera, CONTRATO_CONCEPTO, fotosCitadas, hallazgosDelConcepto, huecosPorRed, idDeBrief, idDeConcepto, ideaDelBanco, ideasDelTexto, insumosDesdeEstrategia,
  leerConcepto, leerIdea, resumenDelBanco, seccionesDe, semanasDeFase, tieneCifraInventada, tieneDatoConValor, type InsumosDelConcepto,
} from '../conceptos'

const INS: InsumosDelConcepto = {
  fases: [{ clave: 'F1', nombre: 'Lanzamiento', semanas: 1 }, { clave: 'F2', nombre: 'Crecimiento', semanas: 1 }],
  redes: [{ red: 'ig', huecos_por_semana: 2 }, { red: 'fb', huecos_por_semana: 1 }],
  prohibidas: ['barato', 'el mejor del mundo'],
  fotos: ['f-01', 'f-02'],
}

const CONCEPTO = `## Gran idea         La mesa larga · Noventa días para volver a sentarse juntos
## Por qué funciona  El insight del brief dice «la gente no viene por el plato, viene por la mesa»; la idea lo convierte en costumbre.
## Cómo se ve        Luz cálida, madera, manos sobre la mesa; paleta del manual; foto:f-01 como referencia. No aparecen personas de espaldas.
## Cómo suena        Voz cercana, el trato que fija el manual, frases cortas.
## Capítulo F1 · Abrir la mesa
   Qué cuenta: la mesa se abre y cada silla tiene nombre · Objetivo de la fase (cita): «que nos conozcan los vecinos del barrio» · Cómo se ve en este capítulo: planos cerrados, una silla vacía
   Series: - S1 · Sillas con nombre · cada semana una silla y su historia · redes: ig, fb
## Capítulo F2 · La mesa crece
   Qué cuenta: más sillas, más historias · Objetivo de la fase (cita): «que vuelvan» · Cómo se ve en este capítulo: planos abiertos
   Series: - S2 · Volver · quien vuelve trae a alguien · redes: ig
## Banco de ideas
- C1-I01 · ig · carrusel · la primera silla: la de la abuela · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí antes que tú? · protagonista: la silla · serie: S1 · foto:f-01
- C1-I02 · ig · reel · la mesa vacía a las 6 y llena a las 8 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: S1 · foto:ninguna
- C1-I03 · fb · imagen · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna
- C2-I01 · ig · carrusel · el que volvió trajo a su hermano · mensaje: volver es traer a alguien · gancho: la segunda vez nunca vienes solo · protagonista: dos hermanos · serie: S2 · foto:f-02
- C2-I02 · ig · reel · la mesa de los domingos · mensaje: el domingo la mesa es de todos · gancho: ¿a qué hora se llena un domingo? · protagonista: la mesa · serie: S2 · foto:ninguna
- C2-I03 · fb · imagen · la cuenta la paga la casa (una vez) · mensaje: hoy te invita la mesa · gancho: hay un día en que no pagas · protagonista: la mesa · serie: ninguna · foto:ninguna
## Ideas que salen   - C1-I04: repetía la idea de la silla vacía
## Caminos descartados y por qué
- «El plato del día»: habla del producto, no de la mesa (A2 lo descartó)
## Citas             A3 usé: la reseña del portero sobre «la mesa grande»
`

describe('concepto.v1 · lectura completa', () => {
  const c = leerConcepto(CONCEPTO, INS)
  it('lee la gran idea (nombre · frase), por qué funciona, cómo se ve y cómo suena', () => {
    expect(c.contrato).toBe(CONTRATO_CONCEPTO)
    expect(c.gran_idea).toEqual({ nombre: 'La mesa larga', frase: 'Noventa días para volver a sentarse juntos' })
    expect(c.por_que_funciona).toContain('la gente no viene por el plato')
    expect(c.como_se_ve).toContain('foto:f-01')
    expect(c.como_suena).toContain('Voz cercana')
  })
  it('un capítulo por fase, con qué cuenta, objetivo citado, cómo se ve y sus series', () => {
    expect(c.capitulos.map((k) => [k.clave, k.fase, k.nombre])).toEqual([['F1', 'F1', 'Abrir la mesa'], ['F2', 'F2', 'La mesa crece']])
    expect(c.capitulos[0].que_cuenta).toBe('la mesa se abre y cada silla tiene nombre')
    expect(c.capitulos[0].objetivo_cita).toBe('«que nos conozcan los vecinos del barrio»')
    expect(c.capitulos[0].como_se_ve).toBe('planos cerrados, una silla vacía')
    expect(c.capitulos[0].series).toEqual([{ id: 'S1', nombre: 'Sillas con nombre', que_cuenta: 'cada semana una silla y su historia', redes: ['ig', 'fb'] }])
    expect(c.capitulos[1].series[0].redes).toEqual(['ig'])
  })
  it('el banco: 6 ideas válidas, cada una con su capítulo, mensaje, gancho, serie y foto', () => {
    expect(c.banco.map((i) => i.id)).toEqual(['C1-I01', 'C1-I02', 'C1-I03', 'C2-I01', 'C2-I02', 'C2-I03'])
    const i = c.banco[0]
    expect(i).toMatchObject({ capitulo: 'F1', red: 'ig', formato: 'carrusel', idea: 'la primera silla: la de la abuela', mensaje: 'aquí siempre hay una silla para ti', gancho: '¿quién se sentaba aquí antes que tú?', protagonista: 'la silla', serie: 'S1', foto: 'f-01' })
    expect(c.banco[1].foto).toBeNull()
    expect(c.banco[2].serie).toBe('ninguna')
    expect(c.banco[3].capitulo).toBe('F2')
  })
  it('ideas que salen, caminos descartados, citas, fotos citadas; sin devolución del brief', () => {
    expect(c.ideas_que_salen).toEqual([{ id: 'C1-I04', motivo: 'repetía la idea de la silla vacía' }])
    expect(c.caminos_descartados).toContain('El plato del día')
    expect(c.citas).toContain('A3 usé')
    expect(c.fotos_citadas).toEqual(['f-01', 'f-02'])
    expect(c.devolucion_del_brief).toBeNull()
  })
  it('cumple el mínimo (huecos × semanas) y queda `ok` sin avisos', () => {
    expect(c.estado).toBe('ok')
    expect(c.bloqueos).toEqual([])
    expect(c.banco_parcial).toEqual([])
    expect(c.avisos).toEqual([])
    expect(c.ideas_descartadas).toEqual([])
  })
  it('el resumen para Emilio: conteo por red y capítulo + hasta 3 ejemplos por capítulo', () => {
    const r = resumenDelBanco(c)
    expect(r.total).toBe(6)
    expect(r.por_red).toEqual({ ig: 4, fb: 2 })
    expect(r.por_capitulo).toEqual({ F1: 3, F2: 3 })
    expect(r.ejemplos.F1.map((e) => e.id)).toEqual(['C1-I01', 'C1-I02', 'C1-I03'])
    expect(resumenDelBanco(c, 1).ejemplos.F2).toHaveLength(1)
    expect(r.parcial).toEqual([])
  })
  it('la hoja toma el MENSAJE de la idea citada (`idea_ref`), nunca del mensaje de campaña', () => {
    expect(ideaDelBanco(c, 'C2-I01')?.mensaje).toBe('volver es traer a alguien')
    expect(ideaDelBanco(c, 'C9-I99')).toBeNull()
    expect(ideaDelBanco(c, null)).toBeNull()
  })
})

describe('concepto.v1 · lo que bloquea (sin_concepto) y lo que solo se declara', () => {
  it('sin «## Gran idea» ⇒ sin_concepto', () => {
    const c = leerConcepto(CONCEPTO.replace('## Gran idea         La mesa larga · Noventa días para volver a sentarse juntos\n', ''), INS)
    expect(c.estado).toBe('sin_concepto')
    expect(c.bloqueos).toEqual(['sin «## Gran idea» (nombre · frase paraguas)'])
    expect(c.banco).toHaveLength(6)
  })
  it('sin ninguna línea de idea ⇒ sin_concepto; con ideas pero ninguna válida ⇒ sin_concepto con otro motivo', () => {
    const sinBanco = leerConcepto(CONCEPTO.replace(/^- C\d.*\n/gm, ''), INS)
    expect(sinBanco.estado).toBe('sin_concepto')
    expect(sinBanco.bloqueos[0]).toMatch(/sin banco de ideas \(ninguna línea/)
    const sinMensajes = leerConcepto(CONCEPTO.replace(/mensaje: [^·]+·/g, 'mensaje: ·'), INS)
    expect(sinMensajes.estado).toBe('sin_concepto')
    expect(sinMensajes.bloqueos[0]).toMatch(/ninguna idea con mensaje y gancho propios/)
    expect(sinMensajes.ideas_descartadas).toHaveLength(6)
    expect(sinMensajes.ideas_descartadas[0].motivo).toBe('sin `mensaje:`')
  })
  it('un mensaje repetido se compara NORMALIZADO (sin tildes, mayúsculas ni puntuación): la segunda idea se descarta y se declara', () => {
    const md = CONCEPTO.replace('mensaje: la mesa se llena de a poco', 'mensaje: ¡AQUÍ siempre hay una silla para ti!')
    const c = leerConcepto(md, INS)
    expect(c.banco.map((i) => i.id)).not.toContain('C1-I02')
    expect(c.ideas_descartadas).toEqual([expect.objectContaining({ id: 'C1-I02', motivo: 'mensaje repetido (igual al de C1-I01)' })])
    expect(c.estado).toBe('ok')
    expect(c.avisos.join('\n')).toMatch(/banco parcial: faltan 1 ideas \(ig × F1: 1\)/)
  })
  it('un gancho repetido también descarta; una idea sin gancho también', () => {
    const c = leerConcepto(CONCEPTO.replace('gancho: hay un día en que no pagas', 'gancho: la segunda vez nunca vienes solo').replace('gancho: mira lo que pasa en dos horas', 'gancho:'), INS)
    expect(c.ideas_descartadas.map((d) => [d.id, d.motivo])).toEqual([['C1-I02', 'sin `gancho:`'], ['C2-I03', 'gancho repetido (igual al de C2-I01)']])
  })
  it('id duplicado con otra línea ⇒ la segunda se descarta; la MISMA línea repetida (integración + aporte) cuenta una sola vez', () => {
    const repetida = CONCEPTO + '\n## Aporte de content-creator\n- C1-I01 · ig · carrusel · la primera silla: la de la abuela · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí antes que tú? · protagonista: la silla · serie: S1 · foto:f-01\n'
    expect(leerConcepto(repetida, INS).ideas_descartadas).toEqual([])
    const distinta = CONCEPTO + '\n- C1-I01 · fb · imagen · otra cosa · mensaje: otro · gancho: otro gancho · protagonista: x · serie: ninguna · foto:ninguna\n'
    expect(leerConcepto(distinta, INS).ideas_descartadas).toEqual([expect.objectContaining({ id: 'C1-I01', motivo: 'id duplicado (ya hay otra idea con ese id)' })])
  })
  it('las ideas se reconocen en CUALQUIER sección (los aportes de los miembros) y las de «Ideas que salen» no entran', () => {
    const md = CONCEPTO + '\n## Aporte de design-visual-storyteller\n- C2-I04 · fb · imagen · la mesa vista desde arriba · mensaje: desde arriba todos caben · gancho: cuenta las manos · protagonista: manos · serie: ninguna · foto:ninguna\n- C1-I04 · ig · reel · la silla vacía · mensaje: x · gancho: y · protagonista: z · serie: ninguna · foto:ninguna\n'
    const c = leerConcepto(md, INS)
    expect(c.banco.map((i) => i.id)).toContain('C2-I04')
    expect(c.banco.map((i) => i.id)).not.toContain('C1-I04')
    expect(c.ideas_descartadas).toEqual([])
  })
  it('falta un capítulo ⇒ se declara (no bloquea); una idea que apunta a un capítulo inexistente también', () => {
    const c = leerConcepto(CONCEPTO.replace(/## Capítulo F2[\s\S]*?(?=## Banco)/, ''), { ...INS, fases: [...INS.fases, { clave: 'F3', semanas: 1 }] })
    expect(c.estado).toBe('ok')
    expect(c.avisos).toContain('falta el capítulo de la fase F2 (Crecimiento)')
    expect(c.avisos).toContain('falta el capítulo de la fase F3')
    // las ideas C2-* siguen apuntando a F2 por la clave de la fase aunque no haya capítulo escrito
    expect(c.banco.find((i) => i.id === 'C2-I01')?.capitulo).toBe('F2')
    const c2 = leerConcepto(CONCEPTO + '\n- C7-I01 · ig · reel · x · mensaje: otro mensaje · gancho: otro gancho · protagonista: p · serie: ninguna · foto:ninguna\n', INS)
    expect(c2.avisos).toContain('la idea C7-I01 apunta a un capítulo que no existe')
    expect(c2.banco.find((i) => i.id === 'C7-I01')?.capitulo).toBeNull()
  })
  it('los capítulos también se resuelven por ORDEN (C1 = primera fase) cuando la clave de la fase no es numérica', () => {
    const ins = { ...INS, fases: [{ clave: 'lanzamiento', semanas: 1 }, { clave: 'crecimiento', semanas: 1 }] }
    const md = CONCEPTO.replace('## Capítulo F1 ·', '## Capítulo 1 ·').replace('## Capítulo F2 ·', '## Capítulo 2 ·')
    const c = leerConcepto(md, ins)
    expect(c.capitulos.map((k) => k.fase)).toEqual(['lanzamiento', 'crecimiento'])
    expect(c.banco.map((i) => i.capitulo)).toEqual(['lanzamiento', 'lanzamiento', 'lanzamiento', 'crecimiento', 'crecimiento', 'crecimiento'])
    expect(c.avisos).toEqual([])
  })
  it('mínimo = huecos × semanas: si no alcanza, «banco parcial: faltan N ideas (red × capítulo)» y el detalle; ninguna idea en una red ⇒ aviso propio', () => {
    const c = leerConcepto(CONCEPTO, { ...INS, fases: [{ clave: 'F1', semanas: 4 }, { clave: 'F2', semanas: 4 }], redes: [...INS.redes, { red: 'tiktok', huecos_por_semana: 1 }] })
    expect(c.estado).toBe('ok')
    expect(c.banco_parcial).toEqual([
      { red: 'ig', capitulo: 'F1', faltan: 6, esperadas: 8, hay: 2 }, { red: 'fb', capitulo: 'F1', faltan: 3, esperadas: 4, hay: 1 }, { red: 'tiktok', capitulo: 'F1', faltan: 4, esperadas: 4, hay: 0 },
      { red: 'ig', capitulo: 'F2', faltan: 6, esperadas: 8, hay: 2 }, { red: 'fb', capitulo: 'F2', faltan: 3, esperadas: 4, hay: 1 }, { red: 'tiktok', capitulo: 'F2', faltan: 4, esperadas: 4, hay: 0 },
    ])
    expect(c.avisos).toContain('ninguna idea para tiktok en el capítulo de la fase F1')
    expect(c.avisos.find((a) => a.startsWith('banco parcial'))).toBe('banco parcial: faltan 26 ideas (ig × F1: 6 · fb × F1: 3 · tiktok × F1: 4 · ig × F2: 6 · fb × F2: 3 · tiktok × F2: 4)')
    expect(resumenDelBanco(c).parcial).toHaveLength(6)
  })
  it('cifra «,77», palabra prohibida (entera, sin tildes ni mayúsculas), dato con valor en una idea y foto inexistente ⇒ avisos, nunca bloqueo', () => {
    const md = CONCEPTO
      .replace('la cuenta la paga la casa (una vez)', 'la cuenta la paga la casa: 12,77 dólares, BARATO')
      .replace('la mesa de los domingos', 'la mesa de los domingos a las 13:00')
      .replace('foto:f-02', 'foto:f-99')
    const c = leerConcepto(md, INS)
    expect(c.estado).toBe('ok')
    expect(c.avisos).toEqual(expect.arrayContaining([
      'hay una cifra «,77» (dato inventado)',
      'palabra prohibida del manual: «barato»',
      'la idea C2-I02 trae un dato con valor (precio, hora, cifra): el estratega lo pone con su referencia',
      'la idea C2-I03 trae un dato con valor (precio, hora, cifra): el estratega lo pone con su referencia',
      'la foto «f-99» no existe entre las fotos propias',
    ]))
    expect(contienePalabraEntera('es el barato', 'barato')).toBe(true)
    expect(contienePalabraEntera('es baratísimo', 'barato')).toBe(false)
    // reserva 4 de CC3: casos que SÍ discriminan «entera» de «contiene» (contienen la subcadena y deben dar false)
    expect(contienePalabraEntera('son baratos', 'barato')).toBe(false)
    expect(contienePalabraEntera('todo desbaratado', 'barato')).toBe(false)
    expect(contienePalabraEntera('más barato, imposible', 'barato')).toBe(true)
    expect(contienePalabraEntera('EL MEJOR DEL MUNDO', 'el mejor del mundo')).toBe(true)
    expect(contienePalabraEntera('el mejor del mundo', 'mejor del mun')).toBe(false)
  })
  it('la devolución del brief (primer turno de la dirección) se lee tal cual', () => {
    const md = CONCEPTO + '\n## Devolución del brief\n- dos mensajes (criterio 1)\n- el objetivo no es medible (criterio 3)\n'
    expect(leerConcepto(md, INS).devolucion_del_brief).toBe('- dos mensajes (criterio 1)\n- el objetivo no es medible (criterio 3)')
  })
  it('la gran idea puede ir en la línea siguiente al título; sin frase paraguas se avisa', () => {
    const c = leerConcepto(CONCEPTO.replace('## Gran idea         La mesa larga · Noventa días para volver a sentarse juntos', '## Gran idea\nLa mesa larga'), INS)
    expect(c.gran_idea).toEqual({ nombre: 'La mesa larga', frase: '' })
    expect(c.avisos).toContain('la gran idea no trae frase paraguas (solo nombre)')
  })
  it('los hallazgos para `cadena_validaciones`: bloqueos bloquean, avisos avisan, objeto concepto', () => {
    const h = hallazgosDelConcepto(leerConcepto(CONCEPTO.replace(/^- C\d.*\n/gm, ''), { ...INS, fases: [...INS.fases, { clave: 'F3', semanas: 1 }] }))
    expect(h[0]).toMatchObject({ chequeo: 'concepto', severidad: 'bloquea', fila_id: null, alcance: 'tanda', ficha: { contra_que: 'concepto.v1', gravedad: 'bloquea' } })
    expect(h.filter((x) => x.severidad === 'aviso').length).toBeGreaterThan(0)
  })
})

describe('piezas sueltas del contrato', () => {
  it('leerIdea: una línea que no es idea es null; los campos faltantes quedan vacíos (nada se inventa)', () => {
    expect(leerIdea('- S1 · algo')).toBeNull()
    expect(leerIdea('texto suelto')).toBeNull()
    expect(leerIdea('- C1-I1 · ig · reel · x')).toBeNull() // «I1»: el número lleva al menos dos cifras
    expect(leerIdea('- C1-I07 · ig · reel · una idea · mensaje: m · gancho: g')).toMatchObject({ id: 'C1-I07', red: 'ig', formato: 'reel', idea: 'una idea', mensaje: 'm', gancho: 'g', protagonista: '', serie: null, foto: null })
    expect(ideasDelTexto('- C1-I01 · ig · reel · a · mensaje: m · gancho: g\n- C1-I02 · fb · imagen · b · mensaje: n · gancho: h').map((i) => i.id)).toEqual(['C1-I01', 'C1-I02'])
  })
  it('reserva 1 de CC3: una idea descartada (sin gancho) y luego CORREGIDA con el mismo id entra al banco; la corregida no es «duplicado»', () => {
    const md = `## Gran idea  X · y\n## Banco de ideas\n- C1-I01 · ig · reel · a · mensaje: m\n## Integración\n- C1-I01 · ig · reel · a · mensaje: m · gancho: g\n`
    const c = leerConcepto(md, INS)
    expect(c.banco.map((i) => [i.id, i.gancho])).toEqual([['C1-I01', 'g']])
    expect(c.ideas_descartadas).toEqual([expect.objectContaining({ id: 'C1-I01', motivo: 'sin `gancho:`' })])
    // la misma línea descartada repetida no se declara dos veces; una línea DISTINTA con el id ya en el banco sí es duplicado
    const c2 = leerConcepto(md.replace('- C1-I01 · ig · reel · a · mensaje: m\n', '- C1-I01 · ig · reel · a · mensaje: m\n- C1-I01 · ig · reel · a · mensaje: m\n') + '- C1-I01 · fb · imagen · otra · mensaje: z · gancho: w\n', INS)
    expect(c2.ideas_descartadas.map((d) => d.motivo)).toEqual(['sin `gancho:`', 'id duplicado (ya hay otra idea con ese id)'])
    expect(c2.banco).toHaveLength(1)
  })
  it('reserva 2 de CC3: viñetas «*», «1.» e id en negrita se leen; una línea con forma de idea que no se reconoce se DECLARA, no desaparece', () => {
    expect(leerIdea('* C1-I05 · ig · reel · a · mensaje: m · gancho: g')?.id).toBe('C1-I05')
    expect(leerIdea('1. C1-I05 · ig · reel · a · mensaje: m · gancho: g')?.id).toBe('C1-I05')
    expect(leerIdea('- **C1-I05** · ig · reel · a · mensaje: m · gancho: g')?.id).toBe('C1-I05')
    expect(leerIdea('- c1-i05 · ig · reel · a · mensaje: m · gancho: g')).toBeNull()
    const md = `## Gran idea  X · y\n## Banco de ideas\n- C1-I01 · ig · reel · a · mensaje: m · gancho: g\n- c1-i05 · ig · reel · b · mensaje: n · gancho: h\nC1-I06 ig · reel · sin viñeta\n## Ideas que salen\n- C1-I04: repetida\n`
    const c = leerConcepto(md, INS)
    expect(c.banco.map((i) => i.id)).toEqual(['C1-I01'])
    expect(c.ideas_descartadas.map((d) => [d.id, d.motivo.split(' (')[0]])).toEqual([['c1-i05', 'formato de línea no reconocido'], ['C1-I06', 'formato de línea no reconocido']])
  })
  it('reserva 3 de CC3: un « · » dentro de `mensaje:` o `gancho:` NO corta el campo (la hoja toma el MENSAJE de ahí)', () => {
    const i = leerIdea('- C1-I07 · ig · reel · una idea · mensaje: aquí · allá · gancho: ¿vienes · o no? · protagonista: la mesa')!
    expect(i.mensaje).toBe('aquí · allá')
    expect(i.gancho).toBe('¿vienes · o no?')
    expect(i.protagonista).toBe('la mesa')
    expect(i.idea).toBe('una idea')
  })
  it('seccionesDe: solo `## ` abre sección; `###` no; lo que precede a la primera sección se ignora', () => {
    const s = seccionesDe('preámbulo\n## A  x\ncuerpo a\n### no es sección\n## B\n')
    expect(s.map((x) => [x.titulo, x.cuerpo])).toEqual([['A  x', 'cuerpo a\n### no es sección'], ['B', '']])
  })
  it('claveDeTexto / cifras / datos con valor / fotos', () => {
    expect(claveDeTexto('¡AQUÍ siempre, hay una silla!')).toBe('aqui siempre hay una silla')
    expect(tieneCifraInventada('vale 12,77')).toBe(true)
    expect(tieneCifraInventada('vale 12,70 y 1977')).toBe(false)
    expect(tieneDatoConValor('cuesta $ 5')).toBe(true)
    expect(tieneDatoConValor('a las 13:00')).toBe(true)
    expect(tieneDatoConValor('un 20 % menos')).toBe(true)
    expect(tieneDatoConValor('la mesa de los domingos')).toBe(false)
    expect(tieneDatoConValor('3 hermanos')).toBe(false)
    expect(fotosCitadas('foto:a-1 y foto:ninguna y foto: b2 y foto:a-1')).toEqual(['a-1', 'b2'])
  })
  it('ids de la oficina: con-<campaña12>-v<n> y brf-<campaña12>-v<n>', () => {
    expect(idDeConcepto('0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 2)).toBe('con-0a2ffbd4957c-v2')
    expect(idDeBrief('0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', 1)).toBe('brf-0a2ffbd4957c-v1')
  })
  it('insumos desde la estrategia: semanas por fase (hacia arriba), huecos por red, solo redes principal/réplica', () => {
    expect(semanasDeFase({ dia_desde: 1, dia_hasta: 30 })).toBe(5)
    expect(semanasDeFase({ dia_desde: 31, dia_hasta: 60 })).toBe(5)
    expect(semanasDeFase({ dia_desde: 1, dia_hasta: 7 })).toBe(1)
    expect(huecosPorRed([{ red: 'ig' }, { red: 'ig' }, { red: 'fb' }])).toEqual([{ red: 'ig', huecos_por_semana: 2 }, { red: 'fb', huecos_por_semana: 1 }])
    const ins = insumosDesdeEstrategia({
      fases: [{ clave: 'F1', dia_desde: 1, dia_hasta: 30, objetivo: 'o', cita_plan: 'c' }],
      patron_semanal: [{ slot: 'a', dia_semana: 1, hora: '10:00', red: 'ig', formato: 'reel', pilar: 'p', requiere_abierto: false, sede: 's' }, { slot: 'b', dia_semana: 2, hora: '10:00', red: 'tiktok', formato: 'video', pilar: 'p', requiere_abierto: false, sede: 's' }],
      canales: [{ red: 'ig', rol: 'principal' }, { red: 'tiktok', rol: 'no' }],
    }, ['x'], ['f1'])
    expect(ins).toEqual({ fases: [{ clave: 'F1', semanas: 5 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: ['x'], fotos: ['f1'] })
  })
})
