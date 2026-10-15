/**
 * Plan v3 · V1 · los 5 catálogos + semilla. Sin red, sin base, sin gasto.
 *   · la semilla pasa la MISMA validación que el alta de V12 y trae las filas críticas;
 *   · la migración y la reversa versionadas son EXACTAMENTE lo que el generador produce desde la semilla (no se separan);
 *   · el esquema de la migración coincide con las columnas que V12 valida (si V1 cambia un nombre, esta prueba rompe);
 *   · mutaciones: quitar una fila crítica, o romper una garantía de la migración, hace morir ≥ 1 prueba.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as gen from '../scripts/ops/plan-v3-catalogo/generar-migracion.mjs'
import * as ver from '../scripts/ops/plan-v3-catalogo/verificar-semilla.mjs'
import * as nucleo from '../scripts/ops/catalogo-agregar/nucleo.mjs'
import semillaJson from '../src/lib/planeacion/catalogo/semilla.json'

type Semilla = Record<string, Array<Record<string, unknown>>>
const generarSql = gen.generarSql as unknown as (s: unknown) => string
const generarReversa = gen.generarReversa as unknown as (s: unknown) => string
const ESQUEMA = gen.ESQUEMA as unknown as Record<string, { clave: string; semilla: string; columnas: Array<[string, string, string]> }>
const verificar = ver.verificarSemilla as unknown as (s: unknown) => string[]
const TABLAS = nucleo.TABLAS as unknown as Record<string, { tabla: string; clave: string; req: string[]; campos: Record<string, unknown> }>
const clonar = (): Semilla => JSON.parse(JSON.stringify(semillaJson))
const raiz = join(__dirname, '..')
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), 'utf8')

describe('V1 · la semilla', () => {
  it('es válida: cada fila pasa el alta de V12, las referencias existen y trae las filas críticas', () => {
    expect(verificar(semillaJson)).toEqual([])
  })
  it('trae la espera de 45 min (aviso 15-oct), N de «listo» = 2 y el crudo del alta por omisión', () => {
    const r = (semillaJson as unknown as Semilla).reglas
    expect(r.find((x) => x.regla_id === 'param_espera_listo_min')?.parametros).toMatchObject({ minutos: 45, cada_s: 300 })
    expect(r.find((x) => x.regla_id === 'param_listo_dias_rastro')?.parametros).toMatchObject({ dias: 2 })
    expect(r.find((x) => x.regla_id === 'param_lee_crudo_del_alta')?.parametros).toMatchObject({ valor: true, max_filas: 400 })
  })
  it('G3: la fila país→moneda existe y es la única vía (rotulada), no hay moneda «por omisión» en código', () => {
    const f = (semillaJson as unknown as Semilla).reglas.find((x) => x.clase === 'moneda_pais')
    expect(f).toMatchObject({ pais: 'EC', parametros: { moneda: 'USD' } })
    expect(String((f as { parametros: { rotulo: string } }).parametros.rotulo)).toMatch(/nadie la declaró/)
  })
  it('las métricas numéricas van primero al cerebro (B de CC-CEREBRO ya publicado) y el atributo coincide con las fichas reales', () => {
    const t = new Map((semillaJson as unknown as Semilla).tipos.map((x) => [x.tipo_id, x]))
    expect(t.get('puntaje_resenas')).toMatchObject({ via_preferida: 'cerebro', atributo_cerebro: 'metrica:mapas:puntaje' })
    expect(t.get('resenas_total')).toMatchObject({ atributo_cerebro: 'metrica:mapas:resenas' })
    expect(t.get('seguidores')).toMatchObject({ atributo_cerebro: 'metrica:instagram:seguidores' })
    expect(t.get('publicaciones_n')).toMatchObject({ atributo_cerebro: 'metrica:instagram:publicaciones' })
    expect(t.get('visitas_periodo')).toMatchObject({ via_preferida: 'relleno', periodo_requerido: true })
  })
})

describe('V1 · mutaciones de la semilla (cada una debe ser detectada)', () => {
  const mutantes: Array<[string, (s: Semilla) => void, RegExp]> = [
    ['quitar el tipo precio', (s) => { s.tipos = s.tipos.filter((t) => t.tipo_id !== 'precio') }, /precio|aplica_a|precio/],
    ['quitar la fuente cerebro_vivo', (s) => { s.fuentes = s.fuentes.filter((f) => f.fuente_id !== 'cerebro_vivo') }, /cerebro_vivo/],
    ['quitar la fila país→moneda', (s) => { s.reglas = s.reglas.filter((r) => r.clase !== 'moneda_pais') }, /país→moneda|moneda/],
    ['espera de 30 min en vez de 45', (s) => { ((s.reglas.find((r) => r.regla_id === 'param_espera_listo_min') as { parametros: { minutos: number } }).parametros).minutos = 30 }, /45 min/],
    ['quitar el léxico de ausencia', (s) => { s.lexico = s.lexico.filter((l) => l.grupo !== 'ausencia') }, /ausencia/],
    ['quitar el tope de la oficina', (s) => { s.topes = s.topes.filter((t) => t.tramo !== 'oficina') }, /oficina/],
    ['subir un tope y romper la suma 3,40', (s) => { s.topes.find((t) => t.tramo === 'redaccion')!.usd = 2 }, /3,40/],
    ['quitar la identidad delegada de una fuente propia', (s) => { s.reglas = s.reglas.filter((r) => r.regla_id !== 'identidad_mapas_ficha') }, /mapas_ficha/],
    ['volver a un operador coincide_* (salieron en rev. 3)', (s) => { s.reglas[0].operador = 'coincide_telefono' }, /coincide_|uno de/],
    ['un reintento en lo que cobra (G1)', (s) => { s.fuentes.find((f) => f.fuente_id === 'mapas_ficha')!.reintentos = 1 }, /reintento/],
    ['una regla que apunta a una fuente que no existe', (s) => { s.reglas[1].aplica_a = { fuente: 'no_existe' } }, /no existe/],
    ['un tipo con vía inválida', (s) => { s.tipos[0].via_preferida = 'internet' }, /uno de/],
    ['nombrar un cliente en la semilla (no agnóstica)', (s) => { (s.lexico[0].terminos as string[]).push('naufrago') }, /agn[oó]stica/],
  ]
  for (const [nombre, mutar, esperado] of mutantes) {
    it(`detecta: ${nombre}`, () => {
      const s = clonar()
      mutar(s)
      const errores = verificar(s)
      expect(errores.length).toBeGreaterThan(0)
      expect(errores.join(' | ')).toMatch(esperado)
    })
  }
})

describe('V1 · la migración y su reversa', () => {
  it('el archivo versionado es EXACTAMENTE lo que el generador produce desde la semilla', () => {
    expect(leer('supabase', 'migrations', gen.NOMBRE_MIGRACION as string)).toBe(generarSql(semillaJson))
  })
  it('la reversa versionada es exactamente la generada', () => {
    expect(leer('supabase', 'reversas', (gen.NOMBRE_MIGRACION as string).replace('.sql', '_REVERSA.sql'))).toBe(generarReversa(semillaJson))
  })
  it('el esquema coincide con las columnas que valida V12 (si V1 cambia un nombre, esto rompe)', () => {
    for (const [nombre, def] of Object.entries(TABLAS)) {
      const t = ESQUEMA[def.tabla]
      expect(t, `falta la tabla ${def.tabla}`).toBeTruthy()
      const enSql = t.columnas.map(([c]) => c).sort()
      expect(enSql, nombre).toEqual(Object.keys(def.campos).sort())
      expect(t.clave).toBe(def.clave)
    }
  })
  it('cada tabla: RLS, sin permisos a anon/authenticated, política solo de service_role, una vigente por clave, idempotente', () => {
    const sql = generarSql(semillaJson)
    for (const tabla of Object.keys(ESQUEMA)) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${tabla} (`)
      expect(sql).toContain(`REVOKE ALL ON public.${tabla} FROM anon, authenticated;`)
      expect(sql).toContain(`ALTER TABLE public.${tabla} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE ON public.${tabla} TO service_role;`)
      expect(sql).toMatch(new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${tabla}_una_vigente ON public\\.${tabla} \\(\\w+\\) WHERE vigente;`))
    }
    expect(sql).not.toMatch(/GRANT [A-Z, ]+ ON public\.plan_catalogo_\w+ TO (anon|authenticated)/)
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE|ALTER TABLE public\.(?!plan_catalogo_)/)
    expect((sql.match(/ON CONFLICT \(\w+, version\) DO NOTHING;/g) ?? []).length).toBe(Object.values(ESQUEMA).reduce((a, d) => a + (semillaJson as unknown as Semilla)[d.semilla].length, 0))
  })
  it('la reversa se niega a borrar si hay más filas que la semilla y solo toca las cinco tablas del catálogo', () => {
    const r = generarReversa(semillaJson)
    for (const [tabla, d] of Object.entries(ESQUEMA)) {
      expect(r).toContain(`IF n > ${(semillaJson as unknown as Semilla)[d.semilla].length} THEN`)
      expect(r).toContain(`DROP TABLE IF EXISTS public.${tabla};`)
    }
    expect(r).toMatch(/RAISE EXCEPTION/)
    expect((r.match(/DROP TABLE/g) ?? []).length).toBe(5)
  })
  it('mutación: una semilla distinta produce otra migración (la prueba de igualdad no es vacía)', () => {
    const s = clonar()
    s.topes[0].usd = 0.41
    expect(generarSql(s)).not.toBe(leer('supabase', 'migrations', gen.NOMBRE_MIGRACION as string))
  })
})
