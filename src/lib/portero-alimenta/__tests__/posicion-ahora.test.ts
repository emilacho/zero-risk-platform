/**
 * LA POSICIÓN POR SEDE «AHORA» (16-oct) · por diseño corre los miércoles; para ejercerla una vez (encender el brazo) hay un pedido explícito `forzar_posicion`.
 * Sin el pedido, un día que no es miércoles no pide la búsqueda de posición de ninguna sede; con el pedido, la pide para cada sede que compite por cercanía. Los diez clientes de prueba.
 */
import { describe, expect, it } from 'vitest'
import { rutaDescubrir } from '../rutas'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe } from './diez-clientes.tablas'
import { ON } from './fixtures-despertar'

const VIERNES = new Date('2026-10-16T15:00:00Z')
const BRAZOS = { contexto: false, demanda: true, competencia: false, propios: false }
const accionesDeDemanda = (plan: { hacer: Array<{ fuente: string; params?: Record<string, unknown> }> }) => plan.hacer.filter((a) => a.fuente === 'demanda' && !/ubicar/.test(String(a.params?._brazo ?? '')))

describe('posición por sede: su día (miércoles) o un pedido explícito', () => {
  for (const c of DIEZ_CLIENTES.filter((x) => x.compitePorCercania && x.sedes.length)) {
    it(`${c.nombre}: un viernes no pide posición; con forzar_posicion la pide por cada sede`, async () => {
      const t = tablasDe(c)
      // cada sede con punto propio (como si Mapas ya la hubiera ubicado)
      t.client_sede_datos = c.sedes.flatMap((s) => [{ client_id: c.id, sede_id: `${c.id}-${s.clave}`, campo: 'lat', valor_numero: -0.18, fuente: 'dueno' }, { client_id: c.id, sede_id: `${c.id}-${s.clave}`, campo: 'lng', valor_numero: -78.48, fuente: 'dueno' }])
      const deps = { db: crearBaseFalsa(t as never).db, interruptores: { ...ON, resumen_vivo: false }, brazos: BRAZOS, ahora: VIERNES }
      const sin = await rutaDescubrir(deps as never, { client_id: c.id, dry_run: true })
      const con = await rutaDescubrir(deps as never, { client_id: c.id, dry_run: true, forzar_posicion: true })
      const planSin = (sin.body as { plan: { hacer: Array<{ fuente: string; params?: Record<string, unknown> }> } }).plan
      const planCon = (con.body as { plan: { hacer: Array<{ fuente: string; params?: Record<string, unknown> }> } }).plan
      expect(accionesDeDemanda(planSin)).toHaveLength(0)
      expect(accionesDeDemanda(planCon).length).toBeGreaterThan(0)
    })
  }
})
