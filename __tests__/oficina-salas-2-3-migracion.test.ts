/**
 * OFICINA · SALAS 2 Y 3 · la FORMA de la migración de datos y de su reversa (pruebas permanentes).
 * La migración queda SIN APLICAR. Debe ser SOLO datos (dos plantillas INACTIVAS idénticas al código y tres formatos sin verificar), repetible y sin encender nada; la reversa debe NEGARSE a borrar si hay historia.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../src/lib/oficina/plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../src/lib/oficina/plantillas/kit-historias'
import { validarPlantilla } from '../src/lib/oficina/plantilla'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610100200_oficina_salas_2_3.sql'
const REVERSA = 'supabase/reversas/202610100200_oficina_salas_2_3_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sinComentarios = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/^\s*--.*$/, '')).join('\n')
const bloque = (s: string, etiqueta: string): unknown => {
  const m = new RegExp(`\\$${etiqueta}\\$([\\s\\S]*?)\\$${etiqueta}\\$`).exec(s)
  return m ? JSON.parse(m[1]) : undefined
}
const filaDe = (s: string, tipo: string): string => {
  const ini = s.indexOf(`'${tipo}', '${tipo}'`)
  return ini < 0 ? '' : s.slice(ini, s.indexOf('ON CONFLICT (tipo) DO NOTHING', ini))
}

describe('la migración: SOLO datos, repetible y sin encender nada', () => {
  const s = sinComentarios(MIGRACION)
  it('existe, y la reversa NO está en supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true)
    expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)REVERSA(_|\.)/i.test(f))).toEqual([])
  })
  it('no crea ni altera tablas, no borra ni actualiza: solo INSERT ... ON CONFLICT DO NOTHING', () => {
    for (const prohibido of [/\bCREATE\s+TABLE\b/i, /\bALTER\s+TABLE\b/i, /\bDROP\b/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+[\w.]+\s+SET\b/i, /\bGRANT\b/i, /\bCREATE\s+(POLICY|TRIGGER|FUNCTION)\b/i]) expect(s, String(prohibido)).not.toMatch(prohibido)
    const inserts = [...s.matchAll(/INSERT INTO public\.([a-z_]+)/g)].map((m) => m[1])
    expect(inserts).toEqual(['oficina_tipos_de_grupo', 'oficina_tipos_de_grupo', 'oficina_entrega_formatos'])
    expect([...s.matchAll(/ON CONFLICT[^;]*DO NOTHING/g)]).toHaveLength(3)
    expect(s).toMatch(/^\s*BEGIN;/m); expect(s).toMatch(/COMMIT;/)
  })
  it('NO enciende nada: no toca la llave de la oficina y las dos plantillas nacen inactivas', () => {
    expect(s).not.toMatch(/oficina_config/)
    for (const t of ['carrusel_ig_v1', 'kit_historias']) expect(filaDe(s, t)).toMatch(/,\s*false\s*\)\s*$/)
  })
  it('cada plantilla sembrada es VÁLIDA contra el vocabulario cerrado (la migración 202610100300 la lleva después a la definición actual del código: ver su prueba)', () => {
    for (const [tipo, p] of [['carrusel_ig_v1', CARRUSEL_IG_V1], ['kit_historias', KIT_HISTORIAS]] as const) {
      const f = filaDe(s, tipo)
      expect(validarPlantilla({ ...p, pasos: bloque(f, 'pasos') as never, indicaciones: bloque(f, 'ind') as never, limites: bloque(f, 'lim') as never })).toEqual([])
      expect(bloque(f, 'lim')).toEqual(JSON.parse(JSON.stringify(p.limites))) // los límites no cambiaron
    }
  })
  it('las tres especificaciones de entrega nacen SIN VERIFICAR (los límites avisan, no bloquean) y no inventan formatos que el motor no produce', () => {
    const f = s.slice(s.indexOf('INSERT INTO public.oficina_entrega_formatos'))
    const filas = [...f.matchAll(/\('([a-z]+)', '([a-z_0-9]+)', (\d+), (\d+), '([0-9:]+)'/g)].map((m) => `${m[1]}/${m[2]} ${m[3]}x${m[4]} ${m[5]}`)
    expect(filas).toEqual(['instagram/carrusel 1080x1350 4:5', 'instagram/historia 1080x1920 9:16', 'whatsapp/estado 1080x1920 9:16'])
    expect((f.match(/, NULL, NULL, false\)/g) ?? []).length).toBe(3)
    expect(f).not.toMatch(/, true\)/)
  })
  it('agnóstica: ningún dato sembrado nombra a un cliente, una ciudad o un producto', () => {
    const todo = leer(MIGRACION).toLowerCase()
    for (const x of ['naufrago', 'náufrago', 'guayaquil', 'ceviche', 'ecuador', 'rukut', 'perez', 'pérez']) expect(todo).not.toContain(x)
  })
})

describe('la reversa: se niega a borrar si hay historia', () => {
  const r = sinComentarios(REVERSA)
  it('comprueba los encargos ANTES de borrar y solo borra lo que sembró la migración', () => {
    expect(r).toMatch(/FROM public\.oficina_encargos WHERE tipo_de_grupo IN \('carrusel_ig_v1', 'kit_historias'\)/)
    expect(r).toMatch(/IF n > 0 THEN RAISE EXCEPTION 'REVERSA ABORTADA/)
    expect(r).toMatch(/DELETE FROM public\.oficina_tipos_de_grupo WHERE tipo IN \('carrusel_ig_v1', 'kit_historias'\);/) // jamás la plantilla de la sala 1
    expect(r.indexOf('RAISE EXCEPTION')).toBeLessThan(r.indexOf('DELETE FROM'))
    const borra = [...r.matchAll(/DELETE FROM public\.([a-z_]+)/g)].map((m) => m[1])
    expect(borra).toEqual(['oficina_tipos_de_grupo', 'oficina_entrega_formatos'])
    expect(r).not.toMatch(/\bDROP\b|\bTRUNCATE\b/i)
    expect(r).toMatch(/verificado = false/) // una especificación que alguien ya verificó no se borra
  })
})
