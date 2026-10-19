/**
 * ARREGLO 2 DE LA CADENA (CC#1 · 19-oct): archivar un cliente cierra sus viajes abiertos, por REGLA (trigger) y no a mano.
 * La conducta se probó en la base real dentro de una transacción que se REVIERTE (4 casos + 5 mutaciones; ver LISTO-CC1-arreglos-1-2);
 * aquí queda lo que se puede vigilar sin base: la forma del archivo, que sea idempotente, que no destruya nada y que la reversa no corra sola.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..')
const MIGRACION = path.join(RAIZ, 'supabase/migrations/202610191000_cerrar_viajes_al_archivar.sql')
const REVERSA = path.join(RAIZ, 'supabase/reversas/202610191000_cerrar_viajes_al_archivar_REVERSA.sql')
const sql = fs.readFileSync(MIGRACION, 'utf8')
const sinComentarios = sql.replace(/--.*$/gm, '')

describe('cerrar los viajes al archivar un cliente', () => {
  it('la reversa existe y NO vive en migrations (una herramienta de migraciones la correría sola)', () => {
    expect(fs.existsSync(REVERSA)).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).some((f) => /REVERSA/i.test(f))).toBe(false)
    const rev = fs.readFileSync(REVERSA, 'utf8')
    expect(rev).toMatch(/DROP TRIGGER IF EXISTS trg_cerrar_viajes_al_archivar ON public\.clients/)
    expect(rev).toMatch(/DROP FUNCTION IF EXISTS public\.cerrar_viajes_al_archivar_cliente\(\)/)
  })
  it('es idempotente y no destruye nada', () => {
    expect(sinComentarios).toMatch(/CREATE OR REPLACE FUNCTION public\.cerrar_viajes_al_archivar_cliente\(\)/)
    expect(sinComentarios).toMatch(/DROP TRIGGER IF EXISTS trg_cerrar_viajes_al_archivar ON public\.clients/)
    for (const peligro of [/DROP TABLE/i, /TRUNCATE/i, /DELETE\s+FROM/i, /ALTER TABLE/i, /DROP COLUMN/i]) expect(sinComentarios).not.toMatch(peligro)
  })
  it('solo se dispara cuando cambia archived_at o status, y solo cierra viajes ABIERTOS de ESE cliente', () => {
    expect(sinComentarios).toMatch(/AFTER UPDATE OF archived_at, status ON public\.clients/)
    expect(sinComentarios).toMatch(/NEW\.archived_at IS NOT NULL AND OLD\.archived_at IS NULL/)
    expect(sinComentarios).toMatch(/NEW\.status = 'churned' AND OLD\.status IS DISTINCT FROM 'churned'/)
    expect(sinComentarios).toMatch(/WHERE client_id = NEW\.id/)
    expect(sinComentarios).toMatch(/status IN \('initiated', 'active', 'paused_hitl'\)/)
  })
  it('cierra con un estado que la tabla admite (abandoned) y deja constancia; no toca otra tabla', () => {
    expect(sinComentarios).toMatch(/SET status = 'abandoned'/)
    expect(sinComentarios).toMatch(/outcome = 'cliente_archivado'/)
    expect(sinComentarios.match(/UPDATE public\.\w+/g)).toEqual(['UPDATE public.client_journey_state'])
  })
  it('la función es SECURITY DEFINER con search_path fijo (no depende de quién archive)', () => {
    expect(sinComentarios).toMatch(/SECURITY DEFINER SET search_path = public/)
  })
})
