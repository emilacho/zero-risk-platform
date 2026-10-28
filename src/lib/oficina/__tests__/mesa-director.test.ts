/**
 * LA MESA · la identidad del DIRECTOR CREATIVO (slug nuevo `creative-director-mesa`): el archivo, la fila de `agents` (SIN APLICAR, INACTIVA) y el modelo coinciden entre sí;
 * y el slug viejo `creative-director` (medios pagados: lo usan cascade-runner y 3 flujos) no se toca.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIRECTORIO } from './mesa-memoria'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const IDENTIDAD = leer('src/agents/identities/creative-director-mesa.md')
const MIGRACION = leer('supabase/migrations/202610281600_agents_creative_director_mesa.sql')
const REVERSA = leer('supabase/reversas/202610281600_agents_creative_director_mesa_REVERSA.sql')
const MIGRACION_DE_LA_MESA = leer('supabase/migrations/202610281500_oficina_la_mesa.sql')

describe('LA MESA · el director creativo', () => {
  it('el archivo de identidad es el v2 aprobado: tres reglas duras, orden de lectura manual → brief → plan, manual creado si falta, oficio creativo', () => {
    expect(IDENTIDAD).toMatch(/^---\nname: Director Creativo\n/)
    for (const frase of ['## Tres reglas duras', 'Trabajo en equipo obligatorio', 'No inventar datos que comprometan al cliente', 'Tope de gasto', 'MANUAL DE MARCA del cliente, (2) el BRIEF y el PLAN, (3)', 'el equipo lo CREA', 'Nunca te detienes por falta de manual', 'Conoces la especialidad de cada compañero', 'pedir_material', 'Primero al portero', '## Oficio creativo']) {
      expect(IDENTIDAD, frase).toContain(frase)
    }
    expect(IDENTIDAD).not.toMatch(/\b(vos|sabés|tenés|decilo)\b/i) // tuteo de Ecuador, nunca voseo
  })

  it('la migración inserta SOLO la fila nueva, inactiva, con el texto EXACTO del archivo y el modelo que ya pasa agents_model_check', () => {
    const texto = /\$ident\$([\s\S]*?)\$ident\$/.exec(MIGRACION)![1]
    expect(texto).toBe(IDENTIDAD)
    expect(MIGRACION).toMatch(/'creative-director-mesa', 'Director Creativo'/)
    expect(MIGRACION).toMatch(/'claude-opus-4-7', 'inactive', false/)
    expect(MIGRACION).toMatch(/ON CONFLICT \(name\) DO NOTHING/)
    expect(MIGRACION).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i)
    const check = leer('supabase/migrations/202610100100_agents_model_check_sonnet_5_5.sql')
    expect(check).toContain("'claude-opus-4-7'::text")
    expect(MIGRACION).not.toContain("'claude-opus-5-5'") // 5.5 exige ensanchar el CHECK primero (lo hace CC#2)
  })

  it('la reversa borra solo esa fila y se niega si ya está activa', () => {
    expect(REVERSA).toMatch(/creative-director-mesa está activa/)
    expect(REVERSA).toMatch(/DELETE FROM public\.agents WHERE name = 'creative-director-mesa' AND NOT is_active/)
    expect(REVERSA.match(/DELETE FROM/g)).toHaveLength(1)
  })

  it('la dirección del directorio (semilla de la migración de la mesa y arnés de pruebas) es el slug nuevo y el viejo no aparece', () => {
    expect(DIRECTORIO.find((t) => t.rol === 'direccion')!.agente).toBe('creative-director-mesa')
    expect(MIGRACION_DE_LA_MESA).toContain("('creative-director-mesa', 'direccion'")
    expect(MIGRACION_DE_LA_MESA).not.toMatch(/'creative-director'/)
  })

  it('el corredor deja usar las herramientas de la mesa al slug nuevo y NO al viejo (medios pagados)', () => {
    const registro = leer('services/agent-runner/src/lib/agent-mcp-registry.ts')
    const bloque = /export const MESA_ALLOW[\s\S]*?\]\)/.exec(registro)![0]
    expect(bloque).toContain("'creative-director-mesa'")
    expect(bloque).not.toMatch(/'creative-director'/)
  })
})
