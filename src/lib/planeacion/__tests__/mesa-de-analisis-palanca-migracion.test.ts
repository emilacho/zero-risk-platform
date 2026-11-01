/**
 * La migración 202611011700 (palanca de la mesa ENCENDIDA solo para el cliente de práctica) y su reversa, leídas del repositorio.
 * Prevuelo CC3 01-nov: el piloto está en `onboarding` y NO hay ningún cliente `active` en la base; una guarda `status = 'active'` se habría negado con el «dale».
 * Aquí se fija el CONTRATO del texto (lo que el ensayo en copia ejecuta): estados admitidos, guardas, idempotencia y reversa exacta. Nada se aplica.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..', '..', '..', '..')
const NOMBRE = '202611011700_mesa_de_analisis_palanca_encendida_cliente_piloto'
const lf = (p: string) => readFileSync(p, 'utf8').replace(/\r/g, '')
const MIG = lf(join(RAIZ, 'supabase', 'migrations', `${NOMBRE}.sql`))
const REV = lf(join(RAIZ, 'supabase', 'reversas', `${NOMBRE}_REVERSA.sql`))
const UUID = /'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/

describe('migración 202611011700 · palanca de la mesa para el cliente de práctica (NO se aplica aquí)', () => {
  it('admite al cliente en onboarding o active y niega paused/churned/inexistente (el piloto está en onboarding)', () => {
    expect(MIG).toMatch(/status IN \('onboarding', 'active'\)/)
    expect(MIG).not.toMatch(/status = 'active'/)
    expect(MIG).toMatch(/no existe o su status no es onboarding\/active · no se enciende/)
  })
  it('se niega sin la fila de 1500, con la palanca encendida o con lista ajena; es idempotente para el piloto', () => {
    expect(MIG).toMatch(/no existe la palanca \(aplica antes 202611011500\)/)
    expect(MIG).toMatch(/ya está encendida o tiene clientes .* se decide a mano, no se pisa/)
    expect(MIG).toMatch(/ya estaba encendida solo para el cliente de práctica · nada que hacer/)
    expect(MIG).toMatch(/jsonb_build_object\('encendida', true, 'clientes', to_jsonb\(ARRAY\[v_cliente\]\)\)/)
  })
  it('migración y reversa nombran al MISMO cliente por id (y solo uno)', () => {
    const idMig = MIG.match(UUID)?.[0]
    const idRev = REV.match(UUID)?.[0]
    expect(idMig).toBeTruthy()
    expect(idRev).toBe(idMig)
    expect(MIG.match(new RegExp(UUID.source, 'g'))).toHaveLength(1)
    expect(REV.match(new RegExp(UUID.source, 'g'))).toHaveLength(1)
  })
  it('la reversa vuelve a {"encendida": false, "clientes": []} SOLO si el valor vivo es exactamente el de la migración', () => {
    expect(REV).toMatch(/v_actual ->> 'encendida' = 'true' AND v_actual -> 'clientes' = to_jsonb\(ARRAY\[v_cliente\]\)/)
    expect(REV).toMatch(/no es el que dejó 202611011700 · se decide a mano, no se pisa/)
    expect(REV).toMatch(/'\{"encendida": false, "clientes": \[\]\}'::jsonb/)
    expect(REV).toMatch(/ya estaba apagada · nada que hacer/)
  })
  it('ninguno de los dos toca otra clave de cadena_config ni otra tabla', () => {
    for (const sql of [MIG, REV]) {
      for (const m of sql.matchAll(/UPDATE public\.(\w+)/g)) expect(m[1]).toBe('cadena_config')
      expect(sql).not.toMatch(/DELETE|INSERT|DROP|TRUNCATE/)
      for (const m of sql.matchAll(/WHERE clave = '(\w+)'/g)) expect(m[1]).toBe('mesa_de_analisis')
    }
  })
})
