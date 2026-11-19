/**
 * 19-nov · EL DIRECTOR CREATIVO DE LA GRAN IDEA (`director-gran-idea`) · borrador de Lenovo con ok de Emilio (18-nov 23:06 Zúrich) · CC1.
 * Reemplaza a `creative-director-mesa` SOLO en la mesa de la gran idea (`concepto_mesa`); el de siempre se queda en las mesas de pieza y en `banco_mesa`.
 * Lo que se mide: el archivo = el texto de la migración (byte a byte) = el borrador aprobado + la línea de la duración; la migración y su reversa
 * cambian SOLO quién dirige `concepto`; con el directorio resultante, la gran idea la dirige el nuevo y todo lo demás sigue igual; el nuevo tiene las herramientas de la mesa y lee las notas de dirección.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { destinatarioDe } from '../mesa/aprendizaje'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import type { Tarjeta, TipoDePieza } from '../mesa/tipos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const IDENTIDAD = leer('src/agents/identities/director-gran-idea.md')
const MIGRACION = leer('supabase/migrations/202611191630_agents_director_gran_idea.sql')
const REVERSA = leer('supabase/reversas/202611191630_agents_director_gran_idea_REVERSA.sql')
const REGISTRO = leer('services/agent-runner/src/lib/agent-mcp-registry.ts')

/** las tarjetas de dirección VIVAS de hoy (SELECT a producción 19-nov 15:55Z), más dos miembros de la gran idea */
const t = (agente: string, rol: string, pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: '', sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo: true, version: 1 } as Tarjeta)
const HOY: Tarjeta[] = [
  t('campaign-brief-agent', 'direccion', ['brief:dirige']),
  t('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige']),
  t('jefe-marketing', 'direccion', ['reubicacion:dirige', 'fallidos:dirige']),
  t('content-creator', 'miembro', ['carrusel', 'concepto']),
  t('whimsy-injector', 'miembro', ['concepto']),
]
/** lo que deja la migración: la tarjeta nueva + `concepto:dirige` fuera de la de siempre (array_remove) */
const DESPUES: Tarjeta[] = [
  ...HOY.map((x) => (x.agente === 'creative-director-mesa' ? { ...x, pertinente_en: x.pertinente_en.filter((p) => p !== 'concepto:dirige') } : x)),
  t('director-gran-idea', 'direccion', ['concepto:dirige']),
]

describe('director de la gran idea · la identidad', () => {
  it('🔴 el texto de la migración es EXACTO el del archivo', () => {
    const texto = /\$ident\$([\s\S]*?)\$ident\$/.exec(MIGRACION)![1]
    expect(texto).toBe(IDENTIDAD)
  })
  it('🔴 es el borrador aprobado: alcance de la hipótesis, trato justo, verdad del público, idea producible, integrar diciendo por qué; sin formato de salida propio', () => {
    expect(IDENTIDAD).toMatch(/^---\nname: Director Creativo de la Gran Idea\n/)
    for (const frase of [
      '## Lo que cuidas, y por qué', '**El alcance de cada hipótesis.**', 'Un nombre corto de serie no reemplaza al alcance: va junto a él.',
      '**Cada hipótesis recibe un trato justo.**', '**Busca la verdad del público antes que la frase.**', 'escríbela con su prueba',
      'Cada idea tiene que poder producirse con ese material.', '**Cuando integras la mesa, no contradices un aporte sin decir por qué.**',
      'No resumes ni renombras las hipótesis.', 'en su idioma y su tono',
    ]) expect(IDENTIDAD, frase).toContain(frase)
    // la doble revisión de Lenovo sacó el formato de salida, el número único, la lista fija de ángulos y el plan
    expect(IDENTIDAD).not.toMatch(/Lo que entregas|opinion_libre|número único|humor|\bplan\b/i)
    expect(IDENTIDAD).not.toMatch(/\b(vos|sabés|tenés|decilo|podés)\b/i) // tuteo, nunca voseo
    expect(IDENTIDAD).not.toMatch(/Náufrago|Olón|encebollado/i) // agnóstico: no nombra a ningún cliente
  })
  it('🔴 lleva la línea de la duración (GO de la duración): cada idea de video, cuánto dura y por qué', () => {
    expect(IDENTIDAD).toContain('Cada idea de video lleva además cuánto dura y por qué (por ejemplo, «20 s · porque muestra tres momentos»)')
  })
})

describe('director de la gran idea · la migración y su reversa', () => {
  it('🔴 inserta la fila nueva ACTIVA en Opus 5.5 sin pisar nada, y su tarjeta dirige SOLO `concepto`', () => {
    expect(MIGRACION).toMatch(/SELECT 'director-gran-idea', 'Director Creativo de la Gran Idea'/)
    expect(MIGRACION).toMatch(/\$ident\$, 'claude-opus-5-5', 'active', true\n/)
    expect(MIGRACION.match(/ON CONFLICT \((name|agente)\) DO NOTHING/g)).toHaveLength(2)
    expect(MIGRACION).toMatch(/\$d\$director-gran-idea\$d\$, \$d\$direccion\$d\$/)
    expect(MIGRACION).toMatch(/ARRAY\[\$d\$concepto:dirige\$d\$\], \$d\$creativo\$d\$/)
  })
  it('🔴 a creative-director-mesa SOLO le quita `concepto:dirige`: no toca su fila de agents ni sus mesas de pieza', () => {
    const updates = MIGRACION.match(/UPDATE[^;]*;/g) ?? []
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatch(/array_remove\(pertinente_en, 'concepto:dirige'\)[\s\S]*WHERE agente = 'creative-director-mesa'/)
    expect(MIGRACION).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i)
    expect(MIGRACION).not.toMatch(/UPDATE public\.agents/)
    // la guarda comprueba que la gran idea tenga UNA dirección y que el de siempre conserve sus mesas
    expect(MIGRACION).toMatch(/IF n <> 1 OR quien <> 'director-gran-idea'/)
    expect(MIGRACION).toContain("ARRAY['carrusel', 'kit', 'post', 'video:dirige', 'banco:dirige']")
  })
  it('🔴 la reversa devuelve la gran idea al de siempre, APAGA al nuevo sin borrarlo y comprueba el resultado', () => {
    expect(REVERSA).toMatch(/array_append\(pertinente_en, 'concepto:dirige'\)[\s\S]*WHERE agente = 'creative-director-mesa'/)
    expect(REVERSA).toMatch(/SET activo = false[^;]*WHERE agente = 'director-gran-idea'/)
    expect(REVERSA).toMatch(/SET is_active = false, status = 'inactive' WHERE name = 'director-gran-idea'/)
    expect(REVERSA).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i)
    expect(REVERSA).toMatch(/quien <> 'creative-director-mesa'/)
  })
})

describe('director de la gran idea · quién dirige cada mesa', () => {
  const TIPOS: TipoDePieza[] = ['carrusel', 'kit', 'post', 'video', 'banco', 'brief', 'reubicacion', 'fallidos']
  it('🔴 hoy la gran idea la dirige creative-director-mesa; después, director-gran-idea', () => {
    expect(direccionDe(HOY, 'concepto')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(DESPUES, 'concepto')?.agente).toBe('director-gran-idea')
  })
  it('🔴 todas las demás mesas siguen con la misma dirección (el nuevo no se cuela por el respaldo de las piezas)', () => {
    for (const tipo of TIPOS) expect(direccionDe(DESPUES, tipo)?.agente ?? null, tipo).toBe(direccionDe(HOY, tipo)?.agente ?? null)
    expect(direccionDe(DESPUES, 'banco')?.agente).toBe('creative-director-mesa')
  })
  it('🔴 los miembros de la gran idea no cambian y el director nuevo no aporta como miembro', () => {
    expect(especialistasPertinentes(DESPUES, 'concepto', false)).toEqual(especialistasPertinentes(HOY, 'concepto', false))
    expect(especialistasPertinentes(DESPUES, 'concepto', false)).not.toContain('director-gran-idea')
  })
  it('🔴 tiene las herramientas de la mesa (MESA_ALLOW del servicio de agentes) y lee las notas de dirección', () => {
    const mesa = /export const MESA_ALLOW[^=]*= new Set\(\[([\s\S]*?)\]\)/.exec(REGISTRO)![1]
    expect(mesa).toContain("'director-gran-idea'")
    expect(destinatarioDe('director-gran-idea')).toBe('direccion')
  })
})
