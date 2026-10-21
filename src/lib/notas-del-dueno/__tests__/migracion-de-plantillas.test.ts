import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validarPlantilla } from '../../oficina/plantilla'
import { POST_IMG_CON_JEFATURA, CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA } from '../../oficina/plantillas/con-jefatura'
import { conSegundoCerebro } from '../../oficina/plantillas/con-segundo-cerebro'
import type { Plantilla } from '../../oficina/tipos'

const raiz = path.resolve(__dirname, '../../../..')
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8')
const MIGRACION = leer('supabase/migrations/202610211600_oficina_segundo_cerebro_plantillas.sql')
const REVERSA = leer('supabase/reversas/202610211600_oficina_segundo_cerebro_plantillas_REVERSA.sql')
const BASES: Array<[string, Plantilla]> = [['post_img', POST_IMG_CON_JEFATURA], ['carrusel_ig_v1', CARRUSEL_IG_CON_JEFATURA], ['kit_historias', KIT_HISTORIAS_CON_JEFATURA]]

/** los bloques «pasos / limites / tipo / version» de cada UPDATE */
function filas(sql: string, versionPrevia: number) {
  const re = /\$pasos\$([\s\S]*?)\$pasos\$::jsonb,\s*limites = \$lim\$([\s\S]*?)\$lim\$::jsonb,\s*version = version \+ 1\s*WHERE tipo = '([a-z_0-9]+)' AND version = (\d+);/g
  return [...sql.matchAll(re)].map((m) => ({ pasos: JSON.parse(m[1]) as Plantilla['pasos'], limites: JSON.parse(m[2]) as Plantilla['limites'], tipo: m[3], version: Number(m[4]) })).filter((f) => f.version === versionPrevia)
}

describe('la migración de las plantillas vivas', () => {
  const f = filas(MIGRACION, 3)
  it('actualiza exactamente las tres familias, cada una desde la version 3', () => { expect(f.map((x) => x.tipo).sort()).toEqual(['carrusel_ig_v1', 'kit_historias', 'post_img']) })
  for (const [tipo, base] of BASES) {
    it(`${tipo}: lo que se escribe en la base es EXACTAMENTE lo que el código define (sin deriva)`, () => {
      const esperado = conSegundoCerebro(base)
      const fila = f.find((x) => x.tipo === tipo)!
      expect(fila.pasos).toEqual(JSON.parse(JSON.stringify(esperado.pasos)))
      expect(fila.limites).toEqual(JSON.parse(JSON.stringify(esperado.limites)))
    })
    it(`${tipo}: lo que se escribe es una plantilla válida para el motor`, () => {
      const fila = f.find((x) => x.tipo === tipo)!
      const p: Plantilla = { ...conSegundoCerebro(base), pasos: fila.pasos, limites: fila.limites }
      expect(validarPlantilla(p)).toEqual([])
    })
  }
  it('trae sus guardas: sin encargos en vuelo, version = 3 y las tres filas al final', () => {
    expect(MIGRACION).toContain("estado IN ('abierto', 'en_paso')")
    expect(MIGRACION).toContain('RAISE EXCEPTION')
    expect(MIGRACION.match(/AND version = 3;/g)).toHaveLength(3)
    expect(MIGRACION).toContain('<> 3')
    expect(MIGRACION).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
  it('NO crea ni borra tablas ni cambia la jefatura', () => {
    expect(MIGRACION).not.toMatch(/CREATE TABLE|DROP TABLE|DELETE FROM|TRUNCATE/i)
  })
})

describe('la reversa de las plantillas', () => {
  const f = filas(REVERSA, 4)
  it('restaura las tres familias a la version 3 viva (con el paso de la jefatura y SIN el segundo cerebro)', () => {
    expect(f.map((x) => x.tipo).sort()).toEqual(['carrusel_ig_v1', 'kit_historias', 'post_img'])
    for (const x of f) {
      const claves = x.pasos.map((p) => p.clave)
      expect(claves).toContain('jefatura')
      expect(claves.some((c) => c === 'leer_notas' || c.startsWith('autorevision'))).toBe(false)
      expect(x.pasos.some((p) => p.revisa !== undefined)).toBe(false)
    }
  })
  it('trae las mismas guardas y exige las tres filas en version 5', () => {
    expect(REVERSA).toContain("estado IN ('abierto', 'en_paso')")
    expect(REVERSA).toContain('version = 5')
    expect(REVERSA.match(/AND version = 4;/g)).toHaveLength(3)
  })
  it('lo que restaura es idéntico, paso por paso, a las constantes de la jefatura de hoy (la base viva era igual a ellas)', () => {
    for (const [tipo, base] of BASES) expect(f.find((x) => x.tipo === tipo)!.pasos).toEqual(JSON.parse(JSON.stringify(base.pasos)))
  })
})
