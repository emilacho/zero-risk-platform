/**
 * CAMBIO 4 · la jefatura de piezas revisa el sentido contra la ficha (PLAN CC4 + ADENDA 1 · lo que mide CC7 en su RESPUESTA al plan).
 * La hoja de cada cliente se arma con la función REAL de la cadena (`fichaEnLineas`), así la prueba lee lo mismo que lee la oficina: Náufrago y 2 dobles de otro rubro.
 */
import { describe, expect, it } from 'vitest'
import { fichaEnLineas, type FichaDeOferta } from '../../cadena/ficha-de-oferta'
import {
  centavos, chequeosExactos, citaVerificada, contextoDeLaFicha, fichaDeLaHoja, hallazgosDelJefe, leerHallazgoDeSentido, marcaDeVuelta, preciosDelTexto, repartir,
  type Hallazgo,
} from '../sentido-contra-la-ficha'

/** una sección de hoja como la escribe `src/lib/cadena/hoja.ts` (OFERTA + FICHA DE LA OFERTA como lista + el resto de campos) */
function hoja(oferta: string | null, ficha: FichaDeOferta | null | 'sin_fichas', fecha: string, extra: string[] = []): string {
  const L = ['### F-01 · Instagram · post', `- QUÉ ES: post para Instagram`, `- OFERTA: ${oferta ?? 'sin oferta en la fila · declarado'}`]
  if (ficha === 'sin_fichas') L.push('- FICHA DE LA OFERTA: sin fichas de hechos todavía · declarado')
  else if (!ficha) L.push(`- FICHA DE LA OFERTA: sin ficha para «${oferta}» · declarado`)
  else { L.push('- FICHA DE LA OFERTA:'); for (const l of fichaEnLineas(ficha, fecha)) L.push(`  - ${l}`) }
  L.push('- MENSAJE (uno): lo de la pieza', ...extra)
  return L.join('\n')
}

// tres clientes de rubros distintos (agnóstico: «oferta», nunca un rubro en el código)
const CLIENTES: Array<{ nombre: string; ficha: FichaDeOferta; precioBien: string; precioMal: string }> = [
  {
    nombre: 'Náufrago (comida)',
    ficha: { clave: 'olon', nombre: 'Olón', que_es: { valor: 'cocina de mar a domicilio', fuente: 'ficha:1' }, oferta_y_precio: [{ valor: 'combo del día $8,50', fuente: 'manual:precios' }, { valor: 'promo de apertura $5', fuente: 'plan:p2', vigente_hasta: '2026-11-10' }], no_se_puede_afirmar: [{ valor: 'atención en local antes de diciembre', fuente: 'cerebro:dueno · client_sede_datos:9', vigente_desde: '2026-11-01' }] },
    precioBien: 'Pide el combo del día a $8.50', precioMal: 'Pide el combo del día a $9.90',
  },
  {
    nombre: 'tienda en línea (doble)',
    ficha: { clave: 'linea-hogar', nombre: 'Línea hogar', que_es: { valor: 'textiles para el hogar', fuente: 'ficha:2' }, oferta_y_precio: [{ valor: 'juego de sábanas USD 1.200', fuente: 'manual:catalogo' }, { valor: 'envío gratis desde $50', fuente: 'plan:p1', vigente_hasta: '2026-11-10' }] },
    precioBien: 'Juego de sábanas a USD 1200', precioMal: 'Juego de sábanas a USD 1,2',
  },
  {
    nombre: 'servicio profesional (doble)',
    ficha: { clave: 'asesoria-tributaria', nombre: 'Asesoría tributaria', que_es: { valor: 'declaración anual para personas', fuente: 'ficha:3' }, oferta_y_precio: [{ valor: 'declaración anual 120 dólares', fuente: 'manual:tarifas' }, { valor: 'primera consulta gratis', fuente: 'plan:p3', vigente_desde: '2026-12-01' }] },
    precioBien: 'La declaración anual por 120 dólares', precioMal: 'La declaración anual por 150 dólares',
  },
]

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
      const ex = chequeosExactos(f, 'Pide el combo a $99')
      expect(ex.hallazgos).toEqual([])
      expect(ex.declarado[0]).toMatch(/^sin ficha para esta oferta/)
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

describe('el precio · exacto, por código (casos de CC7)', () => {
  it('cifras: 12,50 = 12.5 = $12.50 · 1.200 = 1200 ≠ 1,2', () => {
    expect(centavos('12,50')).toBe(1250)
    expect(centavos('12.5')).toBe(1250)
    expect(preciosDelTexto('$12.50')[0].centavos).toBe(1250)
    expect(centavos('1.200')).toBe(120000)
    expect(centavos('1200')).toBe(120000)
    expect(centavos('1,2')).toBe(120)
    expect(centavos('1.200')).not.toBe(centavos('1,2'))
  })

  it('lo que no es precio no dispara: fechas, horas, %, teléfonos, 2x1, cantidades sueltas', () => {
    expect(preciosDelTexto('Del 21/11 al 30/11, de 12:30 a 15:00, 20 % menos, llama al 0991234567, 2x1 y 3 sabores')).toEqual([])
  })

  it.each(CLIENTES)('$nombre · el precio vigente no da hallazgo; uno que no está, sí (va a la pieza si la hoja no lo trae)', ({ ficha, precioBien, precioMal }) => {
    const f = fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20'))
    expect(chequeosExactos(f, precioBien).hallazgos).toEqual([])
    const mal = chequeosExactos(f, precioMal).hallazgos
    expect(mal).toHaveLength(1)
    expect(mal[0]).toMatchObject({ destino: 'pieza', origen: 'codigo' })
  })

  it('el precio equivocado que trae la HOJA vuelve a la hoja, no a la pieza', () => {
    const { ficha, precioMal } = CLIENTES[0]
    const f = fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20', ['- LLAMADO A LA ACCIÓN: pide el combo a $9,90']))
    expect(chequeosExactos(f, precioMal).hallazgos[0].destino).toBe('hoja')
  })

  it('una pieza sin precio no dispara nada · una ficha sin precio vigente no compara y lo declara', () => {
    const f = fichaDeLaHoja(hoja('olon', CLIENTES[0].ficha, '2026-11-20'))
    expect(chequeosExactos(f, 'Ven a probar lo nuevo').hallazgos).toEqual([])
    const sinPrecio: FichaDeOferta = { clave: 'x', que_es: { valor: 'algo', fuente: 'ficha:9' } }
    const g = fichaDeLaHoja(hoja('x', sinPrecio, '2026-11-20'))
    const r = chequeosExactos(g, 'por $10')
    expect(r.hallazgos).toEqual([])
    expect(r.declarado.join(' ')).toMatch(/no trae un precio vigente/)
  })

  it('un precio VENCIDO en la fecha de la fila no cuenta como vigente', () => {
    // «promo de apertura $5» venció el 10-nov: en una fila del 20-nov, $5 en la pieza es un hallazgo
    const f = fichaDeLaHoja(hoja('olon', CLIENTES[0].ficha, '2026-11-20'))
    const r = chequeosExactos(f, 'promo a $5').hallazgos
    expect(r.some((h) => /\$5/.test(h.que))).toBe(true)
  })
})

describe('dato VENCIDO / AÚN NO VIGENTE que se usa igual · con la fecha DE LA FILA, nunca con hoy', () => {
  it('positivo: la hoja usa el dato vencido → hoja', () => {
    const f = fichaDeLaHoja(hoja('linea-hogar', CLIENTES[1].ficha, '2026-11-20', ['- LLAMADO A LA ACCIÓN: envío gratis desde $50']))
    const h = chequeosExactos(f, 'Sábanas nuevas').hallazgos
    expect(h).toEqual([expect.objectContaining({ destino: 'hoja', origen: 'codigo' })])
    expect(h[0].linea_de_la_ficha).toMatch(/^oferta y precio: VENCIDO · envío gratis desde \$50/)
  })
  it('positivo: solo la pieza lo usa → pieza', () => {
    const f = fichaDeLaHoja(hoja('asesoria-tributaria', CLIENTES[2].ficha, '2026-11-20'))
    expect(chequeosExactos(f, 'Tu primera consulta gratis').hallazgos).toEqual([expect.objectContaining({ destino: 'pieza' })])
  })
  it('negativo: nadie lo usa → nada', () => {
    const f = fichaDeLaHoja(hoja('linea-hogar', CLIENTES[1].ficha, '2026-11-20'))
    expect(chequeosExactos(f, 'Sábanas nuevas').hallazgos).toEqual([])
  })
  it('fila FUTURA: lo que hoy está «aún no vigente» en su fecha ya vale → sin hallazgo', () => {
    // «primera consulta gratis» empieza el 1-dic: la fila es del 5-dic, así que la ficha de la hoja ya no lo marca
    const f = fichaDeLaHoja(hoja('asesoria-tributaria', CLIENTES[2].ficha, '2026-12-05'))
    expect(chequeosExactos(f, 'Tu primera consulta gratis').hallazgos).toEqual([])
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
  const h = (destino: Hallazgo['destino']): Hallazgo => ({ destino, origen: 'codigo', que: 'x', linea_de_la_ficha: 'l' })
  it('una devolución por fila y destino: repetir el hallazgo no la duplica', () => {
    const r = repartir([h('hoja'), h('hoja'), h('calendario')], 'F-01', 'enc-1', new Set())
    expect(r.devoluciones.map((d) => d.llave)).toEqual(['F-01:hoja', 'F-01:calendario'])
  })
  it('el segundo hallazgo del mismo destino (ya devuelto) va a una persona y no abre otra devolución', () => {
    const r = repartir([h('hoja')], 'F-01', 'enc-2', new Set(['F-01:hoja']))
    expect(r.devoluciones).toEqual([])
    expect(r.a_humano).toHaveLength(1)
    expect(r.vuelve_a).toEqual(['hoja'])
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
