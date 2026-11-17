/**
 * CAMBIO 4 · la jefatura de piezas revisa el sentido contra la ficha (PLAN CC4 + ADENDA 1 · lo que mide CC7 en su RESPUESTA al plan).
 * La hoja de cada cliente se arma con la función REAL de la cadena (`fichaEnLineas`), así la prueba lee lo mismo que lee la oficina: Náufrago y 2 dobles de otro rubro.
 * Lo exacto por código (punto 2) se prueba aparte, en `exactos-de-la-ficha.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { fichaEnLineas } from '../../cadena/ficha-de-oferta'
import { citaVerificada, contextoDeLaFicha, fichaDeLaHoja, hallazgosDelJefe, leerHallazgoDeSentido, marcaDeVuelta, repartir, type Hallazgo } from '../sentido-contra-la-ficha'
import { CLIENTES, hoja } from './_ficha-de-prueba'

describe('la ficha se lee tal cual de la hoja', () => {
  it.each(CLIENTES)('$nombre · con ficha: las líneas son las de fichaEnLineas, sin copiar aparte', ({ ficha }) => {
    const f = fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20'))
    expect(f.estado).toBe('con_ficha')
    expect(f.oferta).toBe(ficha.clave)
    expect(f.lineas).toEqual(fichaEnLineas(ficha, '2026-11-20'))
    const doc = contextoDeLaFicha(f)!
    expect(doc.titulo).toBe('Ficha de la oferta')
    for (const l of f.lineas) expect(doc.texto).toContain(l)
    // el resto de la hoja no trae la lista de la ficha (ahí se busca si la hoja USA un dato)
    expect(f.resto).not.toContain('(fuente: ')
  })

  it('sin ficha · los tres casos dan «sin ficha», ningún documento y ningún regreso', () => {
    const casos = [
      fichaDeLaHoja(hoja('olon', 'sin_fichas', '2026-11-20')), // la campaña no tiene fichas
      fichaDeLaHoja(hoja('guayaquil', null, '2026-11-20')), // la campaña tiene fichas pero no de esta oferta
      fichaDeLaHoja('### F-01 · Instagram · post\n- QUÉ ES: post'), // hoja vieja, sin el campo (o la tabla no respondió)
    ]
    for (const f of casos) {
      expect(f.estado).toBe('sin_ficha')
      expect(contextoDeLaFicha(f)).toBeNull()
      // el jefe no tiene contra qué citar: nada se lee como sentido, NADA vuelve al calendario
      const j = hallazgosDelJefe(['texto: sentido · calendario: la oferta no existe — ficha: «qué es: algo»'], f)
      expect(j.hallazgos).toEqual([])
      expect(repartir(j.hallazgos, 'F-01', 'enc-1', new Set()).devoluciones).toEqual([])
    }
  })

  it('una oferta «… · declarado» no se toma como oferta', () => {
    expect(fichaDeLaHoja(hoja(null, 'sin_fichas', '2026-11-20')).oferta).toBeNull()
  })
})

describe('el sentido · lo juzga el jefe, el código verifica la cita y el destino', () => {
  const f = fichaDeLaHoja(hoja('olon', CLIENTES[0].ficha, '2026-11-20'))
  const linea = f.lineas.find((l) => l.startsWith('NO se puede afirmar'))!

  it('lee el formato del hallazgo (con tildes, mayúsculas y «donde:» delante)', () => {
    expect(leerHallazgoDeSentido('texto: Sentido · Calendario: la pieza anuncia el local — ficha: «atención en local antes de diciembre»')).toEqual({ destino_dicho: 'calendario', que: 'la pieza anuncia el local', cita: 'atención en local antes de diciembre' })
    expect(leerHallazgoDeSentido('texto: falta el llamado')).toBeNull()
  })

  it('cita verificada con la línea entera o con su valor', () => {
    expect(citaVerificada(linea, f)).toBe(linea)
    expect(citaVerificada('Atención en local antes de diciembre', f)).toBe(linea)
    expect(citaVerificada('atención en local todo el año', f)).toBeNull()
  })

  it.each(['hoja', 'calendario', 'banco', 'pieza'] as const)('destino %s: va a ese destino (y a ninguno otro)', (d) => {
    const { hallazgos, resto } = hallazgosDelJefe([`texto: sentido · ${d}: no cuadra — ficha: «atención en local antes de diciembre»`, 'texto: otra cosa'], f)
    expect(resto).toEqual(['texto: otra cosa'])
    expect(hallazgos).toEqual([{ destino: d, origen: 'jefe', que: 'no cuadra', linea_de_la_ficha: linea }])
    const r = repartir(hallazgos, 'F-01', 'enc-1', new Set())
    if (d === 'pieza') { expect(r.a_la_mesa).toHaveLength(1); expect(r.devoluciones).toEqual([]) }
    else { expect(r.a_la_mesa).toEqual([]); expect(r.devoluciones.map((x) => x.destino)).toEqual([d]); expect(r.vuelve_a).toEqual([d]) }
  })

  it('cita que no está en la ficha → pieza, marcada «cita no verificada» (nunca a un paso de atrás)', () => {
    const { hallazgos } = hallazgosDelJefe(['texto: sentido · calendario: no cuadra — ficha: «algo que la ficha no dice»'], f)
    expect(hallazgos[0]).toMatchObject({ destino: 'pieza', cita_no_verificada: true, linea_de_la_ficha: null })
    const r = repartir(hallazgos, 'F-01', 'enc-1', new Set())
    expect(r.devoluciones).toEqual([])
    expect(r.cita_no_verificada).toBe(true)
    expect(r.a_la_mesa[0]).toMatch(/cita no verificada/)
  })

  it('sin cita → pieza, marcada', () => {
    expect(hallazgosDelJefe(['texto: sentido · hoja: no cuadra'], f).hallazgos[0]).toMatchObject({ destino: 'pieza', cita_no_verificada: true })
  })

  it('destino fuera de los cuatro → pieza, marcada', () => {
    expect(hallazgosDelJefe(['texto: sentido · estrategia: no cuadra — ficha: «atención en local antes de diciembre»'], f).hallazgos[0]).toMatchObject({ destino: 'pieza', cita_no_verificada: true })
  })
})

describe('el regreso · llave única y tope', () => {
  const h = (destino: Hallazgo['destino']): Hallazgo => ({ destino, origen: 'jefe', que: 'x', linea_de_la_ficha: 'l' })
  it('una devolución por fila y destino: repetir el hallazgo no la duplica', () => {
    const r = repartir([h('hoja'), h('hoja'), h('calendario')], 'F-01', 'enc-1', new Set())
    expect(r.devoluciones.map((d) => d.llave)).toEqual(['F-01:hoja', 'F-01:calendario'])
  })
  it('el mismo destino ya devuelto NO reabre (firma de Emilio): queda registrado, sin devolución nueva y sin salida a persona', () => {
    const r = repartir([h('hoja')], 'F-01', 'enc-2', new Set(['F-01:hoja']))
    expect(r.devoluciones).toEqual([])
    expect(r.no_reabre).toHaveLength(1)
    expect(r.vuelve_a).toEqual([])
    expect(Object.keys(r)).not.toContain('a_humano')
  })
  it('lo que vuelve a la mesa lleva su número [S1]…; lo del código va marcado «regla dura»', () => {
    const r = repartir([h('pieza'), { ...h('pieza'), origen: 'codigo' }], 'F-01', 'enc-1', new Set())
    expect(r.enviadas.map((x) => [x.id, x.dura])).toEqual([['S1', false], ['S2', true]])
    expect(r.a_la_mesa[0]).toMatch(/^\[S1\] sentido · pieza: x/)
    expect(r.a_la_mesa[1]).toMatch(/regla dura: se toma sí o sí/)
    expect(r.devoluciones).toEqual([])
  })
  it('una devolución del código a la cadena va marcada dura', () => {
    expect(repartir([{ ...h('hoja'), origen: 'codigo' }], 'F-01', 'enc-1', new Set()).devoluciones[0].dura).toBe(true)
  })
  it('sin fila conocida, nada se devuelve a la cadena: va a la pieza', () => {
    expect(repartir([h('calendario')], null, 'enc-1', new Set()).a_la_mesa).toHaveLength(1)
  })
  it('la marca de la bandeja', () => {
    expect(marcaDeVuelta(['hoja', 'calendario'])).toBe('⚠️ VUELVE A HOJA Y CALENDARIO · ')
    expect(marcaDeVuelta([])).toBe('')
  })
})

describe('agnóstico', () => {
  it('el código del módulo no nombra ningún rubro', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../sentido-contra-la-ficha.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/\b(sede|local|plato|restaurante|men[uú])\b/i)
  })
})
