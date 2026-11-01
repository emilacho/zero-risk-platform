/**
 * Punto 1 del encargo «errores del plan», firma de Emilio (01-nov): cada sede con sus datos y su fuente; dos horarios de dos sedes no son una discrepancia. Con dos clientes de rubros distintos. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { adjuntoDelCliente, REGLA_DE_LAS_SEDES } from '../src/lib/portero-alimenta/contexto-del-cliente'
import { textoDeLaCarpeta } from '../src/lib/jefatura/revision/carpeta-para-revisar'

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const sede = (id: string, clave: string, ciudad: string, o: Record<string, unknown> = {}) => ({ id, client_id: C, clave, ciudad, ...o })
const dato = (sede_id: string | null, campo: string, valor_texto: string, fuente: string, observado_en = '2026-10-01', o: Record<string, unknown> = {}) => ({ client_id: C, sede_id, campo, valor_texto, fuente, observado_en, ...o })
const base = (sedes: unknown[], datos: unknown[]) => new DbFalsa().semilla('client_sedes', sedes as never).semilla('client_sede_datos', datos as never).semilla('cerebro_fichas', []).semilla('client_brand_books', [])

describe('🔴 cada sede con lo suyo', () => {
  const dos = () => base([sede('a', 'cuenca', 'Cuenca'), sede('b', 'loja', 'Loja')], [dato('a', 'horario', 'lunes a viernes 8-17', 'dueno'), dato('b', 'horario', 'sábados 9-13', 'mapas')])
  it('dos horarios distintos quedan cada uno en su sede, con su fuente', async () => {
    const c = await adjuntoDelCliente(dos() as never, C)
    expect(c.sedes).toEqual([
      { clave: 'cuenca', ciudad: 'Cuenca', datos: [{ campo: 'horario', valor: 'lunes a viernes 8-17', fuente: 'dueno' }] },
      { clave: 'loja', ciudad: 'Loja', datos: [{ campo: 'horario', valor: 'sábados 9-13', fuente: 'mapas' }] },
    ])
  })
  it('el revisor lee la regla y no mezcla: el dato de una no aparece bajo la otra', async () => {
    const t = textoDeLaCarpeta(await adjuntoDelCliente(dos() as never, C))
    expect(t).toContain(REGLA_DE_LAS_SEDES)
    const cuenca = t.slice(t.indexOf('### Cuenca'), t.indexOf('### Loja'))
    expect(cuenca).toContain('lunes a viernes 8-17'); expect(cuenca).not.toContain('sábados 9-13')
    expect(t.slice(t.indexOf('### Loja'))).toContain('sábados 9-13')
  })
  it('de un mismo campo y fuente queda el más nuevo; de fuentes distintas, los dos', async () => {
    const db = base([sede('a', 'x', 'X'), sede('b', 'y', 'Y')], [dato('a', 'horario', 'viejo', 'mapas', '2026-01-01'), dato('a', 'horario', 'nuevo', 'mapas', '2026-09-01'), dato('a', 'horario', 'de la red', 'instagram', '2026-02-01')])
    const a = (await adjuntoDelCliente(db as never, C)).sedes![0].datos.map((d) => d.valor).sort()
    expect(a).toEqual(['de la red', 'nuevo'])
  })
  it('una sede sin datos lo dice; un dato de toda la cuenta no se le atribuye a ninguna', async () => {
    const c = await adjuntoDelCliente(base([sede('a', 'x', 'X'), sede('b', 'y', 'Y')], [dato(null, 'canal_pedido', 'de la cuenta', 'instagram')]) as never, C)
    expect(c.sedes!.flatMap((s) => s.datos)).toEqual([])
    expect(textoDeLaCarpeta(c)).toContain('sin datos guardados')
  })
  it('un dato sin valor no se cita', async () => {
    const c = await adjuntoDelCliente(base([sede('a', 'x', 'X'), sede('b', 'y', 'Y')], [dato('a', 'horario', '  ', 'mapas')]) as never, C)
    expect(c.sedes![0].datos).toEqual([])
  })
  it('los datos de otro cliente no entran', async () => {
    const c = await adjuntoDelCliente(base([sede('a', 'x', 'X'), sede('b', 'y', 'Y')], [dato('a', 'horario', 'AJENO', 'mapas', '2026-10-01', { client_id: 'otro' })]) as never, C)
    expect(JSON.stringify(c.sedes)).not.toContain('AJENO')
  })
})

describe('🔴 una sola sede: nada cambia', () => {
  it('ni el campo ni el texto', async () => {
    const c = await adjuntoDelCliente(base([sede('a', 'x', 'X')], [dato('a', 'horario', 'siempre', 'dueno')]) as never, C)
    expect(c).not.toHaveProperty('sedes')
    expect(textoDeLaCarpeta(c)).not.toMatch(/Las sedes del cliente|siempre/)
  })
  it('sin sedes, o con la lectura caída, la carpeta viaja igual', async () => {
    expect(await adjuntoDelCliente(new DbFalsa().semilla('cerebro_fichas', []) as never, C)).not.toHaveProperty('sedes')
    const fichas = new DbFalsa().semilla('cerebro_fichas', [])
    const caida = { from: (t: string) => { if (t === 'client_sedes') throw new Error('caída'); return fichas.from(t) } }
    const c = await adjuntoDelCliente(caida as never, C)
    expect(c).not.toHaveProperty('sedes'); expect(c.resumen_vivo).toBeDefined()
  })
})
