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
  it('se niega sin la fila de 1500, con la palanca encendida o con lista ajena; es idempotente para el piloto (se exige la CONDICIÓN, no solo el mensaje)', () => {
    expect(MIG).toMatch(/IF v_actual IS NULL THEN\s+RAISE EXCEPTION 'mesa_de_analisis: no existe la palanca \(aplica antes 202611011500\)/)
    expect(MIG).toMatch(/IF v_actual ->> 'encendida' = 'true' OR jsonb_array_length\(v_clientes\) > 0 THEN\s+RAISE EXCEPTION 'mesa_de_analisis: la palanca ya está encendida o tiene clientes/)
    expect(MIG).toMatch(/IF v_actual ->> 'encendida' = 'true' AND v_clientes = to_jsonb\(ARRAY\[v_cliente\]\) THEN\s+RAISE NOTICE 'mesa_de_analisis: ya estaba encendida solo para el cliente de práctica · nada que hacer';\s+RETURN;/)
    expect(MIG).toMatch(/jsonb_build_object\('encendida', true, 'clientes', to_jsonb\(ARRAY\[v_cliente\]\)\)/)
    // el orden importa: primero «ya está así» (RETURN), después «está de otra forma» (EXCEPTION); al revés, el idempotente se negaría
    expect(MIG.indexOf("ya estaba encendida solo para el cliente")).toBeLessThan(MIG.indexOf('ya está encendida o tiene clientes'))
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
    expect(REV).toMatch(/IF v_actual IS NULL THEN\s+RAISE EXCEPTION 'mesa_de_analisis: no existe la palanca · nada que revertir'/)
    expect(REV).toMatch(/IF NOT \(v_actual ->> 'encendida' = 'true' AND v_actual -> 'clientes' = to_jsonb\(ARRAY\[v_cliente\]\)\) THEN\s+RAISE EXCEPTION 'mesa_de_analisis: el valor vivo \(%\) no es el que dejó 202611011700 · se decide a mano, no se pisa'/)
    expect(REV).toMatch(/SET valor = '\{"encendida": false, "clientes": \[\]\}'::jsonb/)
    expect(REV).toMatch(/IF v_actual ->> 'encendida' = 'false' AND COALESCE\(jsonb_array_length\(v_actual -> 'clientes'\), 0\) = 0 THEN\s+RAISE NOTICE 'mesa_de_analisis: ya estaba apagada · nada que hacer';\s+RETURN;/)
  })
  it('ninguno de los dos toca otra clave de cadena_config ni otra tabla: cada UPDATE es exactamente «UPDATE public.cadena_config SET valor = … WHERE clave = \'mesa_de_analisis\'»', () => {
    for (const sql of [MIG, REV]) {
      const updates = [...sql.matchAll(/UPDATE[\s\S]*?;/g)].map((m) => m[0].replace(/\s+/g, ' '))
      expect(updates).toHaveLength(1)
      expect(updates[0]).toMatch(/^UPDATE public\.cadena_config SET valor = .+ WHERE clave = 'mesa_de_analisis';$/)
      expect(updates[0]).not.toMatch(/<>|!=|NOT IN|OR /)
      expect(sql).not.toMatch(/\b(DELETE|INSERT|DROP|TRUNCATE|ALTER|CREATE)\b/)
      // la única lectura de otra tabla es clients (solo SELECT 1 … WHERE id = …)
      for (const m of sql.matchAll(/FROM public\.(\w+)/g)) expect(['cadena_config', 'clients']).toContain(m[1])
      for (const m of sql.matchAll(/SELECT valor INTO v_actual FROM public\.cadena_config WHERE clave = '(\w+)'/g)) expect(m[1]).toBe('mesa_de_analisis')
    }
  })
})
