/**
 * 17-nov · cambio 4 · firma de Emilio (20:34 Zúrich): «oferta inexistente o cerrada en la fecha» se decide POR CÓDIGO, contra la ficha.
 * Para eso, el dato que viene de un hecho del cerebro guarda su `tipo` (`DatoDeFicha.tipo`); lo del lector nunca lo trae.
 */
import { describe, expect, it } from 'vitest'
import { datoDelHecho, fichasConHechos, leerFichasDelLector, ofertaCerradaOInexistenteEn, type FichaDeOferta, type HechoDelNegocioPorOferta } from '../ficha-de-oferta'

const h = (x: Partial<HechoDelNegocioPorOferta>): HechoDelNegocioPorOferta => ({ oferta: 'of-1', sede_id: null, tipo: 'cierre_retiro', valor: 'se retira', vigente_desde: null, vigente_hasta: null, fuente: 'dueno · client_sede_datos:9', fecha_de_la_fuente: '2026-11-01', confianza: 'alta', ...x })
const vacia = (clave: string): FichaDeOferta => ({ clave })
const conHecho = (x: Partial<HechoDelNegocioPorOferta>, base: FichaDeOferta[] = [vacia('of-1')]) => fichasConHechos(base, [h(x)])[0]

describe('el tipo del hecho viaja en la ficha', () => {
  it('🔴 datoDelHecho copia el tipo; cada tipo del cerebro llega con el suyo', () => {
    for (const tipo of ['sede', 'apertura', 'cierre_retiro', 'zona_de_entrega', 'aun_no_existe'] as const) expect(datoDelHecho(h({ tipo }))!.tipo).toBe(tipo)
  })
  it('🔴 lo que entrega el lector NO trae tipo, aunque el lector lo mande (no se puede hacer pasar por un hecho del cerebro)', () => {
    const f = leerFichasDelLector({ fichas: [{ clave: 'of-1', no_se_puede_afirmar: [{ valor: 'cerrada', fuente: 'web', tipo: 'cierre_retiro' }] }] }).fichas[0]
    expect(f.no_se_puede_afirmar![0].tipo).toBeUndefined()
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-01')).toBeNull()
  })
  it('🔴 el cierre del cerebro queda en la ficha con su tipo, junto a la línea del choque (que no lo lleva)', () => {
    const f = conHecho({ vigente_desde: '2026-12-01' }, leerFichasDelLector({ fichas: [{ clave: 'of-1', se_puede_afirmar: [{ valor: 'abre todos los días', fuente: 'web' }] }] }).fichas)
    const conTipo = f.no_se_puede_afirmar!.filter((d) => d.tipo)
    expect(conTipo.map((d) => [d.tipo, d.valor])).toEqual([['cierre_retiro', 'se retira']])
    expect(f.no_se_puede_afirmar!.some((d) => !d.tipo && d.valor.startsWith('choque con el cerebro'))).toBe(true)
  })
})

describe('ofertaCerradaOInexistenteEn · exacto por código, con la fecha de la FILA', () => {
  it('🔴 cierre desde D: el día anterior no; D y después, sí (devuelve el dato del cerebro)', () => {
    const f = conHecho({ vigente_desde: '2026-12-01' })
    expect(ofertaCerradaOInexistenteEn(f, '2026-11-30')).toBeNull()
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-01')).toMatchObject({ tipo: 'cierre_retiro', valor: 'se retira' })
    expect(ofertaCerradaOInexistenteEn(f, '2027-03-01')).not.toBeNull()
  })
  it('🔴 cierre sin fecha: cerrada en cualquier fecha de fila', () => {
    expect(ofertaCerradaOInexistenteEn(conHecho({}), '2026-01-01')).not.toBeNull()
  })
  it('🔴 «aún no existe» hasta E (último día sin abrir, acuerdo con CC-CEREBRO): E sí; E+1 (el día que abre) ya no', () => {
    const f = conHecho({ tipo: 'aun_no_existe', valor: 'aún no abre', vigente_hasta: '2026-12-14' })
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-14')).toMatchObject({ tipo: 'aun_no_existe' })
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-15')).toBeNull()
  })
  it('🔴 un cierre temporal (desde y hasta): fuera del tramo, la oferta vale', () => {
    const f = conHecho({ vigente_desde: '2026-12-24', vigente_hasta: '2026-12-26' })
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-23')).toBeNull()
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-25')).not.toBeNull()
    expect(ofertaCerradaOInexistenteEn(f, '2026-12-27')).toBeNull()
  })
  it('🔴 los demás tipos (sede, apertura, zona) nunca la cierran', () => {
    for (const tipo of ['sede', 'apertura', 'zona_de_entrega'] as const) expect(ofertaCerradaOInexistenteEn(conHecho({ tipo, valor: 'algo' }), '2026-12-01')).toBeNull()
  })
  it('🔴 sin ficha o sin fecha legible de la fila: no afirma nada (nunca devuelve una pieza por una fecha que no se pudo leer)', () => {
    const f = conHecho({})
    expect(ofertaCerradaOInexistenteEn(null, '2026-12-01')).toBeNull()
    expect(ofertaCerradaOInexistenteEn(f, null)).toBeNull()
    expect(ofertaCerradaOInexistenteEn(f, 'el martes')).toBeNull()
  })
  it('🔴 un hecho de TODO el negocio (oferta: null) cierra todas las ofertas', () => {
    const [a, b] = fichasConHechos([vacia('of-1'), vacia('of-2')], [h({ oferta: null, valor: 'el negocio cerró' })])
    expect(ofertaCerradaOInexistenteEn(a, '2026-12-01')).not.toBeNull()
    expect(ofertaCerradaOInexistenteEn(b, '2026-12-01')).not.toBeNull()
  })
  it('🔴 un hecho de OTRA oferta no la cierra', () => {
    const [, b] = fichasConHechos([vacia('of-1'), vacia('of-2')], [h({ oferta: 'of-1' })])
    expect(ofertaCerradaOInexistenteEn(b, '2026-12-01')).toBeNull()
  })
})
