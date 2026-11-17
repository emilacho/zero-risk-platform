/**
 * CAMBIO 4 · punto 2 · LO EXACTO POR CÓDIGO contra la ficha (en rama, sin publicar hasta la firma de Emilio) · casos de CC7 · US$ 0.
 * Náufrago y 2 dobles, con la hoja armada por la función real de la cadena.
 */
import { describe, expect, it } from 'vitest'
import { centavos, chequeosExactos, preciosDelTexto } from '../exactos-de-la-ficha'
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
