/**
 * 19-nov · G5b (A′ · CC1 03:47Z) · la hoja copia al brief de una pieza de VIDEO la duración que declaró quien escribió la idea del banco («duración: N s · porqué»).
 * El campo de la idea lo suma CC1 en `conceptos.ts` (revisión aparte): mientras tanto ninguna idea lo trae y la hoja no cambia. Sin él la hoja no escribe nada:
 * la oficina abre con la de por omisión y lo avisa. Una pieza que no es de video no lleva duración.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'

const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 2 }], prohibidas: [], fotos: [] }
const LINEAS = [
  '- C1-I01 · ig · reel · la historia del local en tres momentos · mensaje: ya llegó · gancho: ya llegó. · protagonista: el local · serie: ninguna · foto:ninguna',
  '- C1-I02 · ig · carrusel · el menú · mensaje: ya llegó · gancho: el menú. · protagonista: el plato · serie: ninguna · foto:ninguna',
]
const concepto = (duracion?: string) => {
  const c = leerConcepto([
    '## Gran idea  Ya llegó · El norte también come de Olón', '## Cómo se ve  Púrpura, turquesa.',
    '## Capítulo F1 · Llegar', 'Qué cuenta: llegamos · Objetivo de la fase (cita): «que el norte sepa» · Cómo se ve en este capítulo: tipografía',
    '## Banco de ideas', ...LINEAS,
  ].join('\n'), INS_C)
  // el campo aún no lo lee `conceptos.ts` (lo suma CC1): se pone a mano en las dos ideas, como lo dejará su parseo
  if (duracion !== undefined) for (const i of c.banco as unknown as Array<Record<string, unknown>>) i.duracion = duracion
  return c
}
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el norte sepa».', '## Insight', 'Nadie sabía.', '## Mensaje', 'Ya llegó.',
  '## Público', 'Vecinos del norte que piden comida a domicilio entre semana.', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 pedidos nuevos por semana.',
  '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: encebollado', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que el norte sepa.', prohibidas: [] })
const FORMATOS: FormatosPorRed = { ig: [
  { formato: 'reel', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia: 'video_mesa' },
  { formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 2, familia: 'carrusel_ig' },
] }
const FILAS: FilaDeHoja[] = [
  { id: 'F1-reel', fecha: '2026-11-20', hora: '10:00', red: 'ig', formato: 'reel', pilar: 'conveniencia', tema: 'ya llegó', datos: [], fase: 'F1', idea_ref: 'C1-I01' },
  { id: 'F1-carrusel', fecha: '2026-11-21', hora: '10:00', red: 'ig', formato: 'carrusel', pilar: 'conveniencia', tema: 'el menú', datos: [], fase: 'F1', idea_ref: 'C1-I02' },
]
const hoja = (duracion?: string) => escribirHoja({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief: BRIEF, brief_id: 'brf-v1', concepto: concepto(duracion), concepto_id: 'con-v1', filas: FILAS, formatos: FORMATOS,
} as InsumosDeLaHoja).texto_md

describe('G5b · la hoja y la duración de la pieza de video', () => {
  it('🔴 la idea declara su duración: el brief del reel la lleva tal cual y la oficina la lee', () => {
    const t = hoja('45 s · tres momentos de la historia')
    expect(parsearBrief(t, 'F1-reel')?.duracion).toBe('45 s · tres momentos de la historia')
  })
  it('🔴 una pieza que no es de video no lleva duración, aunque la idea la traiga', () => {
    expect(parsearBrief(hoja('45 s · lo que sea'), 'F1-carrusel')?.duracion).toBeUndefined()
  })
  it('🔴 sin el campo (hoy: ninguna idea lo trae) la hoja no cambia: ni una línea de duración', () => {
    expect(hoja()).not.toMatch(/DURACIÓN/)
    expect(hoja('   ')).toBe(hoja())
  })
})
