/**
 * 17-nov · DIAGNÓSTICO de la historia pobre de la mini-prueba (CC6), arreglo (e) · GO Lenovo `arreglo-historia-pobre`:
 * la idea del banco C1-I08 era de 2 cuadros («swipe a fachada de Olón») y el kit la contaba como 1 elemento. La cadena AVISA (no bloquea) cuando una idea declara más cuadros que
 * su elemento, y la mesa lo recibe dicho en el brief. Quién juzga cuántos cuadros pide una idea: quien la escribe (`cuadros: N` en la línea del banco). La cadena solo compara números.
 */
import { describe, expect, it } from 'vitest'
import { elementosDelKit, parsearBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, leerIdea, MAXIMO_DE_CUADROS_POR_IDEA, type InsumosDelConcepto } from '../conceptos'
import { lineaDeIdea, lineaSeLeeIgual } from '../banco-de-ideas'
import { cuadrosDeMasEnElKit, escribirHoja, idDelKit, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'

const LINEA = (cuadros: string | null) => `- C1-I08 · ig · historia · texto sobre fondo púrpura, swipe a la fachada · mensaje: ya llegó · gancho: ya llegó. · protagonista: el local · serie: S1${cuadros === null ? '' : ` · cuadros: ${cuadros}`} · foto:ninguna`

describe('la línea del banco · `cuadros: N` declarado por quien la escribe', () => {
  it('se lee como número entero; sin el campo no aparece (las ideas viejas no cambian)', () => {
    expect(leerIdea(LINEA('2'))!.cuadros).toBe(2)
    expect(leerIdea(LINEA('1'))!.cuadros).toBe(1)
    const vieja = leerIdea(LINEA(null))!
    expect('cuadros' in vieja).toBe(false)
    expect(vieja.foto).toBeNull(); expect(vieja.serie).toBe('S1')
  })
  it('lo que no es un número entero de 1 a 10 no se lee (no se adivina)', () => {
    for (const v of ['dos', '0', '2.5', String(MAXIMO_DE_CUADROS_POR_IDEA + 1), '']) expect('cuadros' in leerIdea(LINEA(v))!).toBe(false)
    expect(leerIdea(LINEA(String(MAXIMO_DE_CUADROS_POR_IDEA)))!.cuadros).toBe(MAXIMO_DE_CUADROS_POR_IDEA)
  })
  it('editar una idea del banco conserva sus cuadros (ida y vuelta) y la comparación los mira', () => {
    const i = leerIdea(LINEA('2'))!
    const l = lineaDeIdea(i)
    expect(leerIdea(l)!.cuadros).toBe(2)
    expect(lineaSeLeeIgual(i, l)).toBe(true)
    expect(lineaSeLeeIgual(i, lineaDeIdea({ ...i, cuadros: 3 }))).toBe(false)
    expect(lineaDeIdea(leerIdea(LINEA(null))!)).not.toContain('cuadros')
  })
})

// ───────────── la hoja
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: [], fotos: [] }
const concepto = (lineas: string[]) => leerConcepto([
  '## Gran idea  Ya llegó · El norte también come de Olón', '## Cómo se ve  Púrpura, turquesa.',
  '## Capítulo F1 · Llegar', 'Qué cuenta: llegamos · Objetivo de la fase (cita): «que el norte sepa» · Cómo se ve en este capítulo: tipografía',
  '## Banco de ideas', ...lineas,
].join('\n'), INS_C)
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el norte sepa».', '## Insight', 'Nadie sabía.', '## Mensaje', 'Ya llegó.',
  '## Público', 'Vecinos del norte que piden comida a domicilio entre semana.', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 pedidos nuevos por semana.',
  '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: encebollado', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que el norte sepa.', prohibidas: [] })
const FORMATOS: FormatosPorRed = { ig: [{ formato: 'historia', produccion: 'opera', lead_dias: 1, max_por_dia: 3, familia: 'kit_historias' }] }
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-20', hora: '10:00', red: 'ig', formato: 'historia', pilar: 'conveniencia', tema: 'ya llegó', datos: [], fase: 'F1', idea_ref: 'C1-I08', ...o })
const INS = (filas: FilaDeHoja[], lineas: string[]): InsumosDeLaHoja => ({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief: BRIEF, brief_id: 'brf-v1', concepto: concepto(lineas), concepto_id: 'con-v1', filas, formatos: FORMATOS,
})
const ID = idDelKit('2026-W47')

describe('la hoja · avisa (no bloquea) cuando la idea pide más cuadros que su elemento del kit', () => {
  it('🔴 el caso de la mini-prueba: idea de 2 cuadros en 1 elemento → aviso + «CUADROS QUE PIDE LA IDEA» en el brief del kit; el kit sale igual', () => {
    const h = escribirHoja(INS([fila({ id: 's2-d5-vie_historia_gye' })], [LINEA('2')]))
    expect(h.avisos).toEqual([`${ID}: la idea C1-I08 pide 2 cuadros y el kit la cuenta como 1 elemento (s2-d5-vie_historia_gye) · la mesa lo recibe en «CUADROS QUE PIDE LA IDEA»`])
    const b = parsearBrief(h.texto_md, ID)!
    expect(b.texto).toContain('- CUADROS QUE PIDE LA IDEA:')
    expect(b.texto).toContain('2026-11-20 10:00 (s2-d5-vie_historia_gye): 2 cuadros · idea C1-I08')
    // no bloquea: el brief del kit y su elemento siguen como siempre
    expect(h.briefs.map((x) => x.brief_id)).toEqual([ID])
    expect(elementosDelKit(b).elementos).toHaveLength(1)
  })
  it('idea de 1 cuadro o sin el campo (ideas viejas): ni aviso ni línea nueva, la hoja es la de antes', () => {
    for (const l of [LINEA('1'), LINEA(null)]) {
      const h = escribirHoja(INS([fila({ id: 's2-d5-vie_historia_gye' })], [l]))
      expect(h.avisos).toEqual([])
      expect(h.texto_md).not.toContain('CUADROS QUE PIDE LA IDEA')
    }
  })
  it('solo los elementos con idea de más de 1 cuadro, cada uno con su fila', () => {
    const c = concepto([LINEA('3'), '- C1-I09 · ig · historia · otra · mensaje: m · gancho: g · protagonista: p · serie: S1 · cuadros: 1 · foto:ninguna'])
    const r = cuadrosDeMasEnElKit([fila({ id: 'a', hora: '09:00' }), fila({ id: 'b', idea_ref: 'C1-I09' }), fila({ id: 'c', idea_ref: null })], c)
    expect(r).toEqual([{ fila_id: 'a', cuando: '2026-11-20 09:00', idea: 'C1-I08', cuadros: 3 }])
  })
})
