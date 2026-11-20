/**
 * «Crear Campaña» · entrega 1, la base (GO de Lenovo a CC1 y CC3, 20-nov 20:05 Zúrich · mapa de CC4 con las 5 preguntas).
 * Lo que la migración 202611201900 y su reversa tienen que decir. Ensayada además en una base de prueba (pglite) fuera del repo:
 * raw/evidencia/2026-11-20-cc1-pedidos-de-campana/cadena-1900.mjs (39 comprobaciones).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const M = leer('supabase/migrations/202611201900_cadena_pedidos_de_campana.sql')
const R = leer('supabase/reversas/202611201900_cadena_pedidos_de_campana_REVERSA.sql')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const CODIGO = sinComentarios(M)

describe('crear campaña · la base de los pedidos', () => {
  it('🔴 solo aditiva y todo o nada: una tabla nueva, sin tocar ninguna tabla ni fila existente', () => {
    expect(M).toMatch(/^BEGIN;$/m)
    expect(M).toMatch(/^COMMIT;$/m)
    expect([...CODIGO.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1])).toEqual(['cadena_pedidos_de_campana'])
    const alteradas = [...CODIGO.matchAll(/ALTER TABLE\s+(?:public\.)?(\w+)/gi)].map((m) => m[1])
    expect(new Set(alteradas)).toEqual(new Set(['cadena_pedidos_de_campana']))
    expect(CODIGO).not.toMatch(/\b(DELETE|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i)
    expect(CODIGO).not.toMatch(/\bUPDATE\s+public\./i)
    expect(CODIGO).not.toMatch(/\bINSERT\s+INTO\b/i)
  })

  it('🔴 las 5 preguntas en columnas fijas (nombre, cambio, fechas, tope, brief libre) y sin público ni objetivo', () => {
    for (const c of [
      'client_id     text        NOT NULL', 'seco          boolean     NOT NULL DEFAULT false', 'llave         text        NOT NULL',
      'nombre        text        NOT NULL', 'cambio        text        NOT NULL', 'fecha_inicio  date,', 'fecha_fin     date,',
      "fechas_clave  jsonb       NOT NULL DEFAULT '[]'::jsonb", 'tope_usd      numeric(10,2) NOT NULL', 'brief_libre   text        NOT NULL',
      'pedido_por    text        NOT NULL', 'campana_id    uuid        REFERENCES public.cadena_campanas(id)',
    ]) expect(M).toContain(c)
    expect(CODIGO).not.toMatch(/\b(publico|audiencia|objetivo|respuestas)\b/)
    expect(M).toMatch(/IF n <> 14 THEN RAISE EXCEPTION/)
  })

  it('🔴 los candados de cada respuesta: textos no vacíos con largo máximo, tope positivo, fechas juntas y en orden (≤ 366 días), fechas clave en lista', () => {
    expect(M).toContain('CHECK (length(btrim(llave)) BETWEEN 1 AND 200)')
    expect(M).toContain('CHECK (length(btrim(nombre)) BETWEEN 1 AND 120)')
    expect(M).toContain('CHECK (length(btrim(cambio)) BETWEEN 1 AND 4000)')
    expect(M).toContain('CHECK (length(btrim(brief_libre)) BETWEEN 1 AND 100000)')
    expect(M).toContain('CHECK (tope_usd > 0)')
    expect(M).toContain('CHECK ((fecha_inicio IS NULL) = (fecha_fin IS NULL))')
    expect(M).toContain('CHECK (fecha_fin IS NULL OR (fecha_fin > fecha_inicio AND fecha_fin - fecha_inicio <= 366))')
    expect(M).toContain("CHECK (jsonb_typeof(fechas_clave) = 'array')")
    // 🟡 CC7 q22: quién pide no puede quedar en blanco
    expect(M).toContain('CHECK (length(btrim(pedido_por)) >= 1)')
  })

  it('🔴 CC7 q1-q3/q26 · CC6 p13 · las guardas del bloque final frenan de verdad: 7 RAISE EXCEPTION, ningún RAISE NOTICE, y la de «ya tiene filas»', () => {
    const bloque = CODIGO.slice(CODIGO.lastIndexOf('DO $$'))
    expect(bloque).toMatch(/END \$\$;/)
    expect(bloque.match(/RAISE EXCEPTION/g)?.length).toBe(7)
    expect(CODIGO).not.toMatch(/RAISE (NOTICE|WARNING|INFO|LOG|DEBUG)/)
    expect(bloque).toMatch(/IF EXISTS \(SELECT 1 FROM public\.cadena_pedidos_de_campana\) THEN\s+RAISE EXCEPTION 'cadena_pedidos_de_campana: la tabla nueva ya tiene filas'/)
    expect(bloque).toMatch(/IF n <> 14 THEN RAISE EXCEPTION/)
    expect(bloque).toMatch(/table_name = 'cadena_pedidos_de_campana'\) <> 14 THEN\s+RAISE EXCEPTION/)
    expect(bloque).toMatch(/OR has_table_privilege\('authenticated', 'public\.cadena_pedidos_de_campana', 'SELECT'\) THEN\s+RAISE EXCEPTION/)
    expect(bloque).toMatch(/indexdef LIKE 'CREATE UNIQUE INDEX %\(campana_id\) WHERE \(campana_id IS NOT NULL\)%'\) THEN\s+RAISE EXCEPTION/)
  })

  it('🔴 la llave es única por cliente y seco, y una campaña tiene un solo pedido', () => {
    expect(M).toContain('CONSTRAINT cadena_pedidos_de_campana_una_por_llave UNIQUE (client_id, seco, llave)')
    expect(M).toContain('CREATE UNIQUE INDEX IF NOT EXISTS cadena_pedidos_de_campana_una_campana ON public.cadena_pedidos_de_campana (campana_id) WHERE campana_id IS NOT NULL;')
  })

  it('🔴 el pedido no se edita: el candado compara la fila entera menos campana_id, y campana_id se pone una sola vez', () => {
    expect(M).toContain("IF (to_jsonb(NEW) - 'campana_id') IS DISTINCT FROM (to_jsonb(OLD) - 'campana_id') THEN")
    expect(M).toContain('IF OLD.campana_id IS NOT NULL AND NEW.campana_id IS DISTINCT FROM OLD.campana_id THEN')
    expect(M).toContain('CREATE TRIGGER cadena_pedidos_de_campana_candado BEFORE INSERT OR UPDATE ON public.cadena_pedidos_de_campana')
    expect(M).toMatch(/pg_trigger WHERE tgname = 'cadena_pedidos_de_campana_candado'[^;]*\(tgtype::int & 4\) <> 0 AND \(tgtype::int & 16\) <> 0/)
  })

  it('🔴 CC6 #1255 · el pedido solo se liga a SU campaña: mismo cliente, mismo seco y llave_de_campana = llave, al ligar y en un INSERT que ya la traiga', () => {
    expect(M).toContain("IF NEW.campana_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.campana_id IS NULL) THEN")
    expect(M).toContain('SELECT client_id, seco, llave_de_campana INTO c FROM public.cadena_campanas WHERE id = NEW.campana_id;')
    expect(M).toContain('IF FOUND AND (c.client_id IS DISTINCT FROM NEW.client_id OR c.seco IS DISTINCT FROM NEW.seco OR c.llave_de_campana IS DISTINCT FROM NEW.llave) THEN')
  })

  it('🔴 permisos de la cadena: seguridad por fila, nada para anon ni authenticated, service_role sin DELETE', () => {
    expect(M).toContain('ALTER TABLE public.cadena_pedidos_de_campana ENABLE ROW LEVEL SECURITY;')
    expect(M).toContain('REVOKE ALL ON public.cadena_pedidos_de_campana FROM PUBLIC, anon, authenticated;')
    expect(M).toContain('GRANT SELECT, INSERT, UPDATE ON public.cadena_pedidos_de_campana TO service_role;')
    expect(CODIGO).not.toMatch(/GRANT[^;]*DELETE[^;]*cadena_pedidos_de_campana/)
    expect(M).toMatch(/has_table_privilege\('anon', 'public\.cadena_pedidos_de_campana', 'SELECT'\)/)
    expect(M).toContain('NOTIFY pgrst')
  })

  it('🔴 la reversa: se niega si hay pedidos (no borra lo que contestó un dueño) y solo entonces quita la tabla y su función', () => {
    expect(R).toMatch(/^BEGIN;$/m)
    expect(R).toMatch(/^COMMIT;$/m)
    expect(R).toMatch(/SELECT EXISTS \(SELECT 1 FROM public\.cadena_pedidos_de_campana\)' INTO hay;\s+IF hay THEN\s+RAISE EXCEPTION/)
    expect(R.indexOf('RAISE EXCEPTION')).toBeLessThan(R.indexOf('DROP TABLE'))
    // nota de CC7: bloquea la tabla ANTES de mirar si está vacía
    expect(R.indexOf("EXECUTE 'LOCK TABLE public.cadena_pedidos_de_campana IN ACCESS EXCLUSIVE MODE';")).toBeGreaterThan(-1)
    expect(R.indexOf('LOCK TABLE')).toBeLessThan(R.indexOf('SELECT EXISTS'))
    expect(R).toContain('DROP TABLE IF EXISTS public.cadena_pedidos_de_campana;')
    expect(R).toContain('DROP FUNCTION IF EXISTS public.cadena_pedidos_de_campana_candado();')
    expect(sinComentarios(R)).not.toMatch(/\b(DELETE|TRUNCATE|cadena_campanas)\b/)
  })
})
