/**
 * 17-nov · RESPUESTA a Lenovo «el brief trae el cómo» (historia de la mini-prueba, kit `503a8f5b`): la descripción visual de la idea del banco llegaba 3 veces y como DATO
 * (QUÉ ES, IDEA DEL BANCO, IDEA DE LA PIEZA) y el brief no traía FIJO/LIBRE porque la gran idea de la campaña es anterior a las partes de «cómo se ve».
 * Ahora, en TODA clase de brief (post, carrusel, kit sin fila, video): la idea llega como FIJO (id, mensaje, protagonista), lo LIBRE siempre, y su descripción visual UNA vez y bajo SUGERENCIAS.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { escribirHoja, idDelKit, LIBRE_DE_LA_PIEZA, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'

const COMO = 'texto sobre fondo púrpura oscuro, Caveat turquesa, swipe a la fachada'
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 4 }], prohibidas: [], fotos: [] }
// una gran idea VIEJA (sin las partes de «cómo se ve»): el caso de Náufrago
const CONCEPTO = leerConcepto([
  '## Gran idea  Ya llegó · El norte también come de Olón', '## Cómo se ve  Púrpura y turquesa.',
  '## Capítulo F1 · Llegar', 'Qué cuenta: llegamos · Objetivo de la fase (cita): «que el norte sepa» · Cómo se ve en este capítulo: tipografía',
  '## Banco de ideas',
  `- C1-I08 · ig · historia · ${COMO} · mensaje: ya llegó al norte · gancho: ya llegó. · protagonista: el local · serie: S1 · foto:ninguna`,
  `- C1-I09 · ig · post · ${COMO} (post) · mensaje: pídelo hoy · gancho: g9 · protagonista: el encebollado · serie: S1 · foto:ninguna`,
  `- C1-I10 · ig · carrusel · ${COMO} (carrusel) · mensaje: de Olón al norte · gancho: g10 · protagonista: la ruta · serie: S1 · foto:ninguna`,
  `- C1-I11 · ig · reel · ${COMO} (reel) · mensaje: llega caliente · gancho: g11 · protagonista: el motorizado · serie: S1 · foto:ninguna`,
].join('\n'), INS_C)
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el norte sepa».', '## Insight', 'Nadie sabía.', '## Mensaje', 'Ya llegó.',
  '## Público', 'Vecinos del norte que piden comida a domicilio entre semana.', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 pedidos nuevos por semana.',
  '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: encebollado', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que el norte sepa.', prohibidas: [] })
const FORMATOS: FormatosPorRed = { ig: [
  { formato: 'historia', produccion: 'opera', lead_dias: 1, max_por_dia: 3, familia: 'kit_historias' },
  { formato: 'post', produccion: 'opera', lead_dias: 1, max_por_dia: 1, familia: 'post_img' },
  { formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'carrusel_ig_v1' },
  { formato: 'reel', produccion: 'opera', lead_dias: 5, max_por_dia: 1, familia: 'video_mesa' },
] }
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-20', hora: '10:00', red: 'ig', formato: 'post', pilar: 'conveniencia', tema: 'tema de la fila', datos: [], fase: 'F1', idea_ref: 'C1-I09', ...o })
const INS: InsumosDeLaHoja = {
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief: BRIEF, brief_id: 'brf-v1', concepto: CONCEPTO, concepto_id: 'con-v1', formatos: FORMATOS,
  filas: [
    fila({ id: 'kit-fila', formato: 'historia', idea_ref: 'C1-I08' }),
    fila({ id: 'post-fila', formato: 'post', idea_ref: 'C1-I09' }),
    fila({ id: 'carr-fila', formato: 'carrusel', idea_ref: 'C1-I10' }),
    fila({ id: 'reel-fila', formato: 'reel', idea_ref: 'C1-I11' }),
  ],
}
const h = escribirHoja(INS)
const CASOS: Array<[string, string, string]> = [[idDelKit('2026-W47'), 'C1-I08', COMO], ['post-fila', 'C1-I09', `${COMO} (post)`], ['carr-fila', 'C1-I10', `${COMO} (carrusel)`], ['reel-fila', 'C1-I11', `${COMO} (reel)`]]

describe('el brief no trae el cómo como orden · las 4 clases (kit sin fila, post, carrusel, video) con una gran idea vieja', () => {
  it('salen los 4 briefs', () => {
    expect(h.briefs.map((b) => b.brief_id).sort()).toEqual(CASOS.map((c) => c[0]).sort())
  })
  for (const [id, ideaId, como] of CASOS) {
    it(`${id}: la descripción del banco aparece UNA vez y bajo SUGERENCIAS; QUÉ ES, IDEA DEL BANCO e IDEA DE LA PIEZA no la repiten`, () => {
      const b = parsearBrief(h.texto_md, id)!
      expect(b.texto.split(como).length - 1).toBe(1)
      expect(b.texto).toContain(`- SUGERENCIAS:\n  - cómo la imaginó el banco (${ideaId}): ${como} · la mesa puede mejorarla o reemplazarla diciendo por qué`)
      expect(b.que_es).not.toContain(COMO)
      expect(b.texto).toMatch(new RegExp(`^- IDEA DEL BANCO: ${ideaId} · serie S1 · cómo la imaginó el banco: en SUGERENCIAS$`, 'm'))
      expect(b.idea_de_la_pieza).toBeUndefined()
    })
    it(`${id}: LO DECIDIDO trae FIJO (la idea: id y mensaje, sin el cómo) y LIBRE`, () => {
      const ld = parsearBrief(h.texto_md, id)!.lo_decidido!
      expect(ld[0]).toMatch(new RegExp(`^FIJO · idea de esta pieza: ${ideaId} · mensaje: `))
      expect(ld[0]).not.toContain(COMO)
      expect(ld).toContain(LIBRE_DE_LA_PIEZA)
    })
  }
  it('QUÉ ES dice la clase, la red y el mensaje (el del kit, como lo lee la oficina para saber que es un kit)', () => {
    expect(parsearBrief(h.texto_md, idDelKit('2026-W47'))!.que_es).toBe('Kit semanal de historias y estados (1 elemento) · mensaje: ya llegó al norte')
    expect(parsearBrief(h.texto_md, 'post-fila')!.que_es).toBe('post para Ig · mensaje: pídelo hoy')
  })
  it('una fila con idea PROPIA la conserva como IDEA DE LA PIEZA (manda la fila)', () => {
    const h2 = escribirHoja({ ...INS, filas: [fila({ id: 'post-fila', concepto: { idea: 'la idea propia de la fila' } })] })
    expect(parsearBrief(h2.texto_md, 'post-fila')!.idea_de_la_pieza).toBe('la idea propia de la fila')
  })
})
