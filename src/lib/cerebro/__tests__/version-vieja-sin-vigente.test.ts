/**
 * VERSIÓN VIEJA (encargo 05-nov «versión vieja, puente y teléfono», punto 1) · US$ 0 · base simulada.
 * Regla general: una versión reemplazada nunca dice «la vigente es X» si X no está vigente (retirada, rechazada, cerrada, vencida o fuera de la lista).
 * Dice «la última versión es X y tampoco está vigente», con su motivo, y que no queda ninguna vigente. Caso real: informe `bdfb6130` → `cf0f29d8` (retirado) de Náufrago.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { entregarContenido } from '../portero/entregar'
import { sinVigenteQueNoLoEs } from '../estado-en-plataforma'
import type { Ficha } from '../tipos'
import { A, AHORA, crearBaseFalsa } from './casos'
import { dias, ficha, tablasConFichas } from './fichas-casos'

const de = (lineas: Ficha[], id: string): Ficha => lineas.find((x) => x.ref === `cerebro_fichas:${id}`) as Ficha
const montar = (fichas: Array<Record<string, unknown>>) => { const t = tablasConFichas(); t.cerebro_fichas = fichas; return crearBaseFalsa(t).consulta }
const entregar = async (fichas: Array<Record<string, unknown>>, id: string) => {
  const r = await entregarContenido(montar(fichas), { cliente: A, refs: [`cerebro_fichas:${id}`] }, { ahora: AHORA })
  return (r.cuerpo.material as Array<Record<string, unknown>>)[0]
}
const RETIRO = { retirada_en: dias(2), motivo_retirada: 'la plataforma lo cerró: rechazado en la revisión' }

describe('la versión vieja apunta a la más nueva solo si esa está vigente', () => {
  it('la más nueva vigente: sigue diciendo «la vigente es» (lo de siempre no cambia)', async () => {
    const fs = [ficha('bdfb6130', A), ficha('cf0f29d8', A, { version_de: 'bdfb6130' })]
    const l = (await construirListaCorta(montar(fs), A, { ahora: AHORA })).lineas
    expect(de(l, 'bdfb6130').ref_de_la_vigente).toBe('cerebro_fichas:cf0f29d8')
    expect(de(l, 'bdfb6130').sin_version_vigente).toBeUndefined()
    const m = await entregar(fs, 'bdfb6130')
    expect(m.ref_de_la_vigente).toBe('cerebro_fichas:cf0f29d8')
    expect(String(m.aviso)).toContain('la vigente es cerebro_fichas:cf0f29d8 (versión 2)')
  })

  it('caso real: la más nueva está RETIRADA → nunca «la vigente es»; dice cuál es la última, por qué no vale y que no hay vigente', async () => {
    const fs = [ficha('bdfb6130', A, RETIRO), ficha('cf0f29d8', A, { version_de: 'bdfb6130', ...RETIRO })]
    const l = (await construirListaCorta(montar(fs), A, { ahora: AHORA })).lineas
    const vieja = de(l, 'bdfb6130')
    expect(vieja.ref_de_la_vigente).toBeUndefined()
    expect(vieja).toMatchObject({ ref_de_la_ultima_version: 'cerebro_fichas:cf0f29d8', sin_version_vigente: true, vigente: false })
    expect(vieja.ultima_version_no_vigente).toMatch(/^NO VIGENTE · RETIRADA desde .* rechazado en la revisión/)
    const m = await entregar(fs, 'bdfb6130')
    expect(m.ref_de_la_vigente).toBeUndefined()
    expect(m).toMatchObject({ ref_de_la_ultima_version: 'cerebro_fichas:cf0f29d8', sin_version_vigente: true, vigente: false })
    expect(String(m.aviso)).not.toContain('la vigente es')
    expect(String(m.aviso)).toContain('la última versión es cerebro_fichas:cf0f29d8 (versión 2) y tampoco está vigente (NO VIGENTE · RETIRADA desde')
    expect(String(m.aviso)).toContain('· sin versión vigente')
    // ningún texto de la entrega nombra como vigente a la retirada
    expect(JSON.stringify(m)).not.toMatch(/vigente es cerebro_fichas:cf0f29d8/)
  })

  it('cadena de tres con la última retirada: las dos viejas dicen lo mismo, ninguna «la vigente es»', async () => {
    const fs = [ficha('v1', A), ficha('v2', A, { version_de: 'v1' }), ficha('v3', A, { version_de: 'v2', ...RETIRO })]
    const l = (await construirListaCorta(montar(fs), A, { ahora: AHORA })).lineas
    for (const id of ['v1', 'v2']) expect([de(l, id).ref_de_la_vigente, de(l, id).ref_de_la_ultima_version, de(l, id).sin_version_vigente]).toEqual([undefined, 'cerebro_fichas:v3', true])
    expect(de(l, 'v3').vigente).toBe(false)
  })
})

describe('la regla es general: cualquier línea, cualquier motivo de no vigencia', () => {
  const linea = (ref: string, o: Partial<Ficha> = {}): Ficha => ({ ref, estante: 'E1', clase: 'plan', titulo: 't', que_es: 'q', origen: 'su_fuente', estado: 'x', fecha_fuente: null, vigente_hasta: null, vencido: false, peso_estimado: 1, ...o }) as Ficha
  it('rechazada, cerrada o vencida por la plataforma: su propio motivo viaja', () => {
    for (const motivo of ['NO VIGENTE · rechazado en la plataforma por dueño: plan con errores', 'NO VIGENTE · su revisión venció sin aprobación', 'NO VIGENTE · marcado como no válido']) {
      const [vieja] = sinVigenteQueNoLoEs([linea('o:1', { version: 1, vigente: false, reemplazada: true, ref_de_la_vigente: 'o:2' }), linea('o:2', { version: 2, vigente: false, aviso: `algo antes · ${motivo}` })])
      expect(vieja).toMatchObject({ ref_de_la_ultima_version: 'o:2', ultima_version_no_vigente: motivo, sin_version_vigente: true })
      expect(vieja.ref_de_la_vigente).toBeUndefined()
    }
  })
  it('la última no vigente sin aviso: se dice igual que no está vigente', () => {
    const [vieja] = sinVigenteQueNoLoEs([linea('o:1', { version: 1, vigente: false, reemplazada: true, ref_de_la_vigente: 'o:2' }), linea('o:2', { version: 2, vigente: false })])
    expect(vieja.ultima_version_no_vigente).toBe('no está vigente')
  })
  it('la última fuera de la lista: no se afirma que esté vigente', () => {
    const [vieja] = sinVigenteQueNoLoEs([linea('o:1', { version: 1, vigente: false, reemplazada: true, ref_de_la_vigente: 'o:9' })])
    expect(vieja).toMatchObject({ ref_de_la_ultima_version: 'o:9', sin_version_vigente: true })
    expect(vieja.ultima_version_no_vigente).toMatch(/no está en la lista/)
  })
  it('la «última» que a su vez figura como reemplazada tampoco es vigente', () => {
    const [vieja] = sinVigenteQueNoLoEs([linea('o:1', { version: 1, vigente: false, reemplazada: true, ref_de_la_vigente: 'o:2' }), linea('o:2', { version: 2, vigente: true, reemplazada: true })])
    expect(vieja.sin_version_vigente).toBe(true)
  })
  it('las líneas sin versión vieja no se tocan (misma referencia de objeto)', () => {
    const a = linea('o:1'), b = linea('o:2', { version: 1, vigente: true })
    const [x, y] = sinVigenteQueNoLoEs([a, b])
    expect(x).toBe(a); expect(y).toBe(b)
  })
})
