/**
 * CAMBIO 4 · punto 2 · LO EXACTO POR CÓDIGO contra la ficha (en rama, sin publicar hasta la firma de Emilio) · casos de CC7 · US$ 0.
 * Náufrago y 2 dobles, con la hoja armada por la función real de la cadena.
 */
import { describe, expect, it } from 'vitest'
import { campoDeLaHoja, centavos, chequeosExactos, fichaConCierreVivo, preciosDelTexto } from '../exactos-de-la-ficha'
import type { HechoDelNegocioPorOferta } from '../../cadena/ficha-de-oferta'
import { aplicarSalidaDeJefatura, datosDeLaJefatura, prefijoDeLaBandeja } from '../paso-jefatura'
import { fichaDeLaHoja } from '../sentido-contra-la-ficha'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import type { Estado } from '../tipos'
import { CLIENTES, hoja } from './_ficha-de-prueba'

describe('sin ficha · lo exacto no corre y lo declara', () => {
  it.each([
    ['la campaña no tiene fichas', hoja('olon', 'sin_fichas', '2026-11-20')],
    ['la oferta no tiene ficha', hoja('guayaquil', null, '2026-11-20')],
    ['la hoja no trae el campo', '### F-01 · Instagram · post\n- QUÉ ES: post'],
  ])('%s', (_c, h) => {
    const ex = chequeosExactos(fichaDeLaHoja(h), 'Pide el combo a $99')
    expect(ex.hallazgos).toEqual([])
    expect(ex.declarado[0]).toMatch(/^sin ficha para esta oferta/)
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

  it('CC7 🟡 4 · una moneda de letras pegada a otra palabra no es precio: «IQ 100», «XBs 5», «AS/ 3» → 0 precios; «Q 100» y «Bs 5» sí', () => {
    expect(preciosDelTexto('Un test de IQ 100, el modelo XBs 5 y la talla AS/ 3')).toEqual([])
    expect(preciosDelTexto('Q 100 y Bs 5').map((p) => p.centavos)).toEqual([10000, 500])
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
    const g = fichaDeLaHoja(hoja('x', { clave: 'x', que_es: { valor: 'algo', fuente: 'ficha:9' } }, '2026-11-20'))
    const r = chequeosExactos(g, 'por $10')
    expect(r.hallazgos).toEqual([])
    expect(r.declarado.join(' ')).toMatch(/no trae un precio vigente/)
  })

  it('un precio VENCIDO en la fecha de la fila no cuenta como vigente', () => {
    // «promo de apertura $5» venció el 10-nov: en una fila del 20-nov, $5 en la pieza es un hallazgo
    const f = fichaDeLaHoja(hoja('olon', CLIENTES[0].ficha, '2026-11-20'))
    expect(chequeosExactos(f, 'promo a $5').hallazgos.some((h) => /\$5/.test(h.que))).toBe(true)
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
  it('CC7 🟡 3 · un dato vencido CORTO («2x1») se mide como palabra entera: la pieza que lo usa da hallazgo; «12x1» no', () => {
    const ficha = { ...CLIENTES[0].ficha, oferta_y_precio: [{ valor: 'combo del día $8,50', fuente: 'manual:precios' }, { valor: '2x1', fuente: 'plan:p9', vigente_hasta: '2026-11-10' }] }
    const f = fichaDeLaHoja(hoja('olon', ficha, '2026-11-20'))
    expect(chequeosExactos(f, 'Hoy 2x1 en todo').hallazgos).toEqual([expect.objectContaining({ destino: 'pieza', que: expect.stringMatching(/^D2 · .*«2x1»/) })])
    expect(chequeosExactos(f, 'Hoy 12x1 en todo').hallazgos).toEqual([])
    // CC7 ADENDA 1 · n6 · el borde de DETRÁS: «2x12» no es «2x1» (un falso D2 frenaría por error)
    expect(chequeosExactos(f, 'Hoy 2x12 en todo').hallazgos).toEqual([])
  })

  it('el destino «hoja» lleva el rótulo de la hoja donde aparece el dato (para que el receptor sepa a qué insumo vuelve)', () => {
    const { ficha, precioMal } = CLIENTES[0]
    const precio = chequeosExactos(fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20', ['- LLAMADO A LA ACCIÓN: pide el combo a $9,90'])), precioMal).hallazgos[0]
    expect(precio).toMatchObject({ destino: 'hoja', campo_de_la_hoja: 'LLAMADO A LA ACCIÓN' })
    const vencido = chequeosExactos(fichaDeLaHoja(hoja('linea-hogar', CLIENTES[1].ficha, '2026-11-20', ['- SUGERENCIAS:', '  - envío gratis desde $50'])), 'Sábanas').hallazgos[0]
    expect(vencido).toMatchObject({ destino: 'hoja', campo_de_la_hoja: 'SUGERENCIAS' })
    expect(campoDeLaHoja('texto suelto con $9,90', () => true)).toBeNull()
  })
  it('CC7 m4 · el dato de la hoja que está FUERA de todo rótulo: vuelve a la hoja, pero SIN `campo_de_la_hoja` (no se inventa un insumo)', () => {
    const { ficha, precioMal } = CLIENTES[0]
    const h = chequeosExactos(fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20', ['pide el combo a $9,90'])), precioMal).hallazgos[0]
    expect(h).toMatchObject({ destino: 'hoja' })
    expect(h).not.toHaveProperty('campo_de_la_hoja')
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

describe('D1 · oferta cerrada o que aún no existe en la fecha de la fila (por el tipo del hecho del cerebro · #1145)', () => {
  const conCierre = (tipo: 'cierre_retiro' | 'aun_no_existe' | 'sede', d: { vigente_desde?: string; vigente_hasta?: string }) => ({ ...CLIENTES[2].ficha, no_se_puede_afirmar: [{ valor: 'la oferta no se da en este tramo', fuente: 'cerebro:dueno · hechos:4', tipo, ...d }] })
  it.each(CLIENTES)('$nombre · sin hecho que la cierre: D1 no dispara', ({ ficha, precioBien }) => {
    expect(chequeosExactos(fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20')), precioBien).hallazgos).toEqual([])
  })
  it('cierre desde antes de la fecha de la fila → calendario, regla dura, con la línea citable', () => {
    const f = fichaDeLaHoja(hoja('asesoria-tributaria', conCierre('cierre_retiro', { vigente_desde: '2026-11-15' }), '2026-11-20'))
    expect(f.cierre).toMatch(/^la oferta no se da en este tramo \(fuente: cerebro:/)
    const h = chequeosExactos(f, 'La declaración anual por 120 dólares').hallazgos
    expect(h).toEqual([expect.objectContaining({ destino: 'calendario', origen: 'codigo' })])
    expect(h[0].que).toMatch(/^D1 · /)
    expect(f.lineas).toContain(h[0].linea_de_la_ficha)
  })
  it('«aún no existe» hasta E: la fila del día E+1 ya vale (sin D1); la del día E, no', () => {
    const ficha = conCierre('aun_no_existe', { vigente_hasta: '2026-11-30' })
    expect(chequeosExactos(fichaDeLaHoja(hoja('asesoria-tributaria', ficha, '2026-11-30')), '').hallazgos.map((x) => x.destino)).toEqual(['calendario'])
    expect(chequeosExactos(fichaDeLaHoja(hoja('asesoria-tributaria', ficha, '2026-12-01')), '').hallazgos).toEqual([])
  })
  it('un hecho que no cierra (sede) no dispara D1', () => {
    expect(chequeosExactos(fichaDeLaHoja(hoja('asesoria-tributaria', conCierre('sede', {}), '2026-11-20')), '').hallazgos).toEqual([])
  })
  it('sin ficha no hay D1 aunque la hoja traiga el campo', () => {
    const h = `${hoja('x', null, '2026-11-20')}\n- OFERTA CERRADA EN SU FECHA: cerrada (fuente: cerebro:x)`
    expect(chequeosExactos(fichaDeLaHoja(h), '').hallazgos).toEqual([])
  })
})

describe('D1 con los hechos VIVOS (CC7 19:44Z): un cierre registrado después de armar la hoja también frena', () => {
  const { ficha } = CLIENTES[2]
  const cierre = (d: Partial<HechoDelNegocioPorOferta> = {}): HechoDelNegocioPorOferta => ({ oferta: ficha.clave, tipo: 'cierre_retiro', valor: 'la oferta se suspende', vigente_desde: '2026-11-18', fuente: 'dueno:chat-17nov', ...d })
  const sinCierre = () => fichaDeLaHoja(hoja(ficha.clave, ficha, '2026-11-20'))
  it('🔴 ficha guardada SIN cierre + hecho vivo de cierre en la fecha de la fila → D1 frena (calendario, regla dura) y se declara de dónde viene', () => {
    expect(sinCierre().cierre).toBeUndefined()
    const v = fichaConCierreVivo(sinCierre(), [cierre()], '2026-11-20')
    expect(v.ficha.cierre).toMatch(/^la oferta se suspende \(fuente: cerebro:dueno:chat-17nov/)
    expect(v.declarado.join(' ')).toMatch(/hechos vivos/)
    const h = chequeosExactos(v.ficha, '').hallazgos
    expect(h).toEqual([expect.objectContaining({ destino: 'calendario', origen: 'codigo', que: expect.stringMatching(/^D1 · /) })])
    expect(v.ficha.lineas).toContain(h[0].linea_de_la_ficha)
  })
  it('el cierre vivo que empieza DESPUÉS de la fila no frena; el de otra oferta tampoco; uno de todo el negocio sí', () => {
    expect(fichaConCierreVivo(sinCierre(), [cierre({ vigente_desde: '2026-11-25' })], '2026-11-20').ficha.cierre).toBeUndefined()
    expect(fichaConCierreVivo(sinCierre(), [cierre({ oferta: 'otra-oferta' })], '2026-11-20').ficha.cierre).toBeUndefined()
    expect(fichaConCierreVivo(sinCierre(), [cierre({ oferta: null })], '2026-11-20').ficha.cierre).toBeTruthy()
  })
  it('una sede o una apertura viva no cierra', () => {
    expect(fichaConCierreVivo(sinCierre(), [cierre({ tipo: 'sede' }), cierre({ tipo: 'apertura' })], '2026-11-20').ficha.cierre).toBeUndefined()
  })
  it('sin fecha legible de la fila, sin hechos o sin ficha: la ficha queda igual y se declara por qué (nunca afirma)', () => {
    for (const fecha of [null, 'ilegible'] as const) {
      const v = fichaConCierreVivo(sinCierre(), [cierre()], fecha)
      expect(v.ficha).toEqual(sinCierre())
      expect(v.declarado.join(' ')).toMatch(/sin fecha legible/)
    }
    expect(fichaConCierreVivo(sinCierre(), null, '2026-11-20').declarado.join(' ')).toMatch(/no se pudieron leer/)
    const sf = fichaDeLaHoja(hoja('x', null, '2026-11-20'))
    expect(fichaConCierreVivo(sf, [cierre({ oferta: null })], '2026-11-20')).toEqual({ ficha: sf, declarado: [] })
  })
  it('si la hoja ya trae el cierre, los hechos vivos no lo duplican', () => {
    const conCierre = fichaDeLaHoja(hoja(ficha.clave, { ...ficha, no_se_puede_afirmar: [{ valor: 'cerrada', fuente: 'cerebro:x', tipo: 'cierre_retiro' }] }, '2026-11-20'))
    expect(fichaConCierreVivo(conCierre, [cierre()], '2026-11-20').ficha).toBe(conCierre)
  })
})

describe('lo exacto dentro del paso jefatura', () => {
  const H = hoja('olon', CLIENTES[0].ficha, '2026-11-20')
  const estado = (): Estado => ({ pasos_ejecutados: 4, fichas: [], artefactos: {}, gasto_usd: 0, vueltas: {} }) as unknown as Estado
  const salida = (): SalidaDeRevision => ({ revision_id: 'r', resultado: 'cerrada', desacuerdos: [], respuestas: [], marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, costo_usd: 0 }) as unknown as SalidaDeRevision
  const aplicar = (pieza: string, conExactos = true) => {
    const e = estado()
    const res = aplicarSalidaDeJefatura({ familia: 'post', clase: 'post_img' } as never, e, salida(), { reImagen: () => ({ re_imagen: false }), puedeVolverALaMesa: () => true, sentido: { ficha: fichaDeLaHoja(H), textoDeLaPieza: pieza, filaId: 'F-7', encargoId: 'enc-1', yaDevueltas: new Set(), ...(conExactos ? { exactos: chequeosExactos } : {}) } })
    e.fichas = res.fichas ?? []
    e.artefactos = { respuesta_imagen: { version: 1, datos: res.artefacto } } as never
    return { res, j: datosDeLaJefatura(e)!, prefijo: prefijoDeLaBandeja(e) }
  }
  it('el precio que no está vuelve a la mesa como corrección, sin devolución', () => {
    const { res, j } = aplicar('Pide el combo a $9,90')
    expect((res.artefacto as { vuelve_a_la_mesa?: boolean }).vuelve_a_la_mesa).toBe(true)
    expect((res.artefacto as { aviso_a_la_mesa: string }).aviso_a_la_mesa).toMatch(/sentido · pieza: D3 · el precio «\$9,90»/)
    expect(j.sentido!.devoluciones).toEqual([])
  })
  it('el precio vigente no da hallazgo: la pieza sigue limpia', () => {
    const { res, j, prefijo } = aplicar('Pide el combo a $8,50')
    expect(res.fichas).toBeUndefined()
    expect(j.sentido!.hallazgos).toEqual([])
    expect(prefijo).toBe('')
  })
  it('sin el chequeo enchufado (lo publicable), el mismo precio NO da hallazgo: solo juzga el jefe', () => {
    const { res, j } = aplicar('Pide el combo a $9,90', false)
    expect((res.artefacto as { vuelve_a_la_mesa?: boolean }).vuelve_a_la_mesa).toBeUndefined()
    expect(j.sentido!.hallazgos).toEqual([])
  })
})

describe('agnóstico', () => {
  it('el código no nombra ningún rubro', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(new URL('../exactos-de-la-ficha.ts', import.meta.url), 'utf8')).not.toMatch(/\b(sede|local|plato|restaurante|men[uú])\b/i)
  })
})
