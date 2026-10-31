/**
 * LA HOJA DE PRODUCCIÓN por código (hoja.v1) · escribe EXACTAMENTE lo que la oficina ya lee (`src/lib/oficina/brief.ts`). Ida y vuelta con el lector real.
 */
import { describe, expect, it } from 'vitest'
import { elementosDelKit, esKitDeHistorias, parsearBrief, planDeOrigen, proporcionDelBrief, fechaLimiteDelBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { escribirHoja, fechaEnLetras, filasDelKit, idDelKit, lineaDeElemento, RE_ID_DE_BRIEF, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'

const PLAN = '## Fase 1\nObjetivo: que el barrio sepa que la cocina abre temprano.'
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el barrio sepa que la cocina abre temprano».',
  '## Insight', 'La gente desayuna de pie.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', '30 desayunos nuevos por semana.', '- ig: que miren el pan · «ven a desayunar»', '- whatsapp: que respondan · «responde este estado»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: delicioso', '- lo que no se dice: precios',
  '## Faltantes', '- público: sin edades en el manual',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: ['delicioso'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: ['delicioso'], fotos: ['f-01'] }
const CONCEPTO = leerConcepto([
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Capítulo F1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «que el barrio sepa» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · ig · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:f-01',
  '- C1-I02 · ig · historia · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira · protagonista: la mesa · serie: ninguna · foto:ninguna',
].join('\n'), INS_C)
const FORMATOS: FormatosPorRed = {
  ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'imagen_fija' }, { formato: 'historia', produccion: 'opera', lead_dias: 1, max_por_dia: 3, familia: 'kit_historias' }, { formato: 'reel', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 1, familia: null }],
  whatsapp: [{ formato: 'estado', produccion: 'opera', lead_dias: 1, max_por_dia: 2, familia: 'kit_historias' }],
}
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-12', hora: '09:00', red: 'ig', formato: 'carrusel', pilar: 'producto', tema: 'la primera silla', datos: [], fase: 'F1', idea_ref: 'C1-I01', ...o })
const INS = (filas: FilaDeHoja[], extra: Partial<InsumosDeLaHoja> = {}): InsumosDeLaHoja => ({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 3, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46',
  brief: BRIEF, brief_id: 'brf-abc-v1', concepto: CONCEPTO, concepto_id: 'con-abc-v1', filas, formatos: FORMATOS, ...extra,
})

describe('hoja.v1 · ida y vuelta con el lector de la oficina', () => {
  it('un brief por fila, identificado por el fila_id, que `parsearBrief` lee con todos sus campos', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-01' })]))
    expect(BRIEF.estado).toBe('validada'); expect(CONCEPTO.estado).toBe('ok')
    expect(h.avisos).toEqual([])
    expect(planDeOrigen(h.texto_md)).toBe('11111111-2222-3333-4444-555555555555')
    const b = parsearBrief(h.texto_md, 'F1-S1-ig-01')!
    expect(b).not.toBeNull()
    expect(b.red).toBe('Ig'); expect(b.formato).toBe('carrusel')
    expect(b.mensaje).toBe('aquí siempre hay una silla para ti')
    expect(b.protagonista).toBe('la silla')
    expect(b.vocabulario_obligatorio).toEqual(['pan de masa madre', 'mesa larga'])
    expect(b.prohibido).toEqual(['delicioso'])
    expect(b.negativos).toEqual(['precios', 'delicioso'])
    expect(b.llamado).toBe('«ven a desayunar»')
    expect(b.sintaxis).toBe('Cercano y directo.')
    expect(b.visual).toContain('Luz cálida'); expect(b.visual).toContain('planos cerrados'); expect(b.visual).toContain('foto f-01')
    expect(b.variantes).toBe('1')
    expect(proporcionDelBrief(b)).toBe('4:5')
    expect(fechaLimiteDelBrief(b.aprueba)).toEqual({ fecha: '2026-11-12', hora: '00:00' })
    expect(b.aprueba).toContain('a las 09:00')
    expect(esKitDeHistorias(b)).toBe(false)
    expect(b.texto).toContain('- GRAN IDEA: La mesa larga · Noventa días para sentarse juntos')
    expect(b.texto).toContain('- CAPÍTULO DE LA FASE: F1 · Abrir la mesa · la mesa se abre')
    expect(b.texto).toContain('- BRIEF DE CAMPAÑA: brf-abc-v1')
    expect(b.texto).toContain('- MENSAJE DE CAMPAÑA: Hay mesa desde las siete.')
    expect(h.briefs).toEqual([{ brief_id: 'F1-S1-ig-01', fila_id: 'F1-S1-ig-01', fila_ids: ['F1-S1-ig-01'], familia: 'imagen_fija', red: 'ig', formato: 'carrusel', idea_ref: 'C1-I01' }])
    expect(h.provenance).toMatchObject({ hoja: true, contrato: 'hoja.v1', lote_key: '2026-W46', fila_ids: ['F1-S1-ig-01'], familias_por_brief: [{ brief_id: 'F1-S1-ig-01', fila_id: 'F1-S1-ig-01', familia: 'imagen_fija' }], kit: null, seco: false, valido: true })
  })
  it('una fila SIN idea del banco: el mensaje sale del tema y se DECLARA (aviso + texto); nada se inventa', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-02', idea_ref: null, tema: 'el pan de las siete' })]))
    const b = parsearBrief(h.texto_md, 'F1-S1-ig-02')!
    expect(b.mensaje).toBe('el pan de las siete · sin idea del banco')
    expect(b.texto).toContain('- IDEA DEL BANCO: ninguna · declarado')
    expect(h.avisos).toEqual(['F1-S1-ig-02: sin idea del banco (tema «el pan de las siete») · el mensaje sale del tema y se declara'])
    expect(h.texto_md).toContain('## Avisos de la hoja\n- F1-S1-ig-02: sin idea del banco')
  })
  it('una idea_ref que no está en el banco se declara; un formato sin familia también (el sobre saldrá sin sala)', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-03', idea_ref: 'C1-I99', formato: 'reel' })]))
    expect(h.avisos).toEqual(expect.arrayContaining([expect.stringMatching(/C1-I99.*no está en el banco/), expect.stringMatching(/ig · reel sin familia/), expect.stringMatching(/sin idea del banco/)]))
    expect(h.briefs[0].familia).toBeNull()
    expect(h.briefs[0].idea_ref).toBeNull()
  })
  it('las filas de la familia kit_historias de un lote van en UN brief de kit con ELEMENTOS que `elementosDelKit` lee; fecha y hora DE LA FILA', () => {
    const filas = [
      fila({ id: 'F1-S1-ig-01' }),
      fila({ id: 'F1-S1-wa-01', red: 'whatsapp', formato: 'estado', fecha: '2026-11-13', hora: '18:00', tema: 'el estado del jueves', pilar: 'comunidad', idea_ref: null, datos: [{ dato: 'horario', valor: '07:00 | 11:00; cierra', clase: 'alto', ref: 'sitio', nivel: 'F1' } as any] }),
      fila({ id: 'F1-S1-ig-h1', formato: 'historia', fecha: '2026-11-11', hora: '08:30', tema: 'la mesa a las 7', pilar: 'producto', idea_ref: 'C1-I02' }),
      fila({ id: 'F1-S1-ig-h2', formato: 'historia', fecha: '2026-11-11', hora: null, tema: 'sin hora', pilar: 'producto', idea_ref: null }),
    ]
    const h = escribirHoja(INS(filas))
    expect(filasDelKit(filas, FORMATOS).map((f) => f.id)).toEqual(['F1-S1-ig-h2', 'F1-S1-ig-h1', 'F1-S1-wa-01'])
    expect(h.texto_md).toContain('## Entregables (2)')
    const kit = parsearBrief(h.texto_md, 'kit-2026-W46')!
    expect(kit).not.toBeNull()
    expect(kit.red).toBe('Ig'); expect(kit.formato).toBe('kit')
    expect(esKitDeHistorias(kit)).toBe(true)
    expect(proporcionDelBrief(kit)).toBe('9:16')
    expect(kit.mensaje).toBe('la mesa se llena de a poco') // lo macro: la primera fila del kit CON idea
    const { elementos, ilegibles } = elementosDelKit(kit)
    expect(ilegibles).toEqual([])
    expect(elementos.map((e) => [e.fecha, e.hora, e.destino, e.tema, e.pilar, e.datos])).toEqual([
      ['2026-11-11', null, 'historia', 'sin hora', 'producto', []],
      ['2026-11-11', '08:30', 'historia', 'la mesa a las 7', 'producto', []],
      ['2026-11-13', '18:00', 'estado', 'el estado del jueves', 'comunidad', ['horario: 07:00 / 11:00, cierra']],
    ])
    expect(kit.texto).toContain('- FILAS: F1-S1-ig-h2, F1-S1-ig-h1, F1-S1-wa-01')
    expect(h.briefs.map((b) => [b.brief_id, b.fila_id, b.familia])).toEqual([['F1-S1-ig-01', 'F1-S1-ig-01', 'imagen_fija'], ['kit-2026-W46', null, 'kit_historias']])
    expect(h.provenance.kit).toEqual({ brief_id: 'kit-2026-W46', fila_ids: ['F1-S1-ig-h2', 'F1-S1-ig-h1', 'F1-S1-wa-01'], elementos: expect.any(Array) })
    expect(h.provenance.fila_ids).toHaveLength(4)
    // la fila suelta sigue intacta en la hoja
    expect(parsearBrief(h.texto_md, 'F1-S1-ig-01')!.mensaje).toBe('aquí siempre hay una silla para ti')
  })
  it('un lote sin filas de kit no tiene brief de kit; una fila con id inválido como brief se omite y se declara', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-01' }), fila({ id: 'con espacios' })]))
    expect(h.provenance.kit).toBeNull()
    expect(h.briefs).toHaveLength(1)
    expect(h.avisos).toEqual(['fila «con espacios» con id inválido como brief · se omite de la hoja'])
    expect(RE_ID_DE_BRIEF.test('F1-S1-ig-01')).toBe(true)
  })
  it('el modo seco se declara en el encabezado y en la procedencia; sin filas la hoja no es válida', () => {
    const h = escribirHoja(INS([], { seco: true }))
    expect(h.texto_md).toContain('⚠️ MODO SECO')
    expect(h.provenance).toMatchObject({ seco: true, valido: false })
    expect(h.texto_md).toContain('## Entregables (0)')
  })
  it('faltantes y contradicciones del brief creativo pasan a la hoja declarados', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-01' })]))
    expect(h.texto_md).toContain('## Faltantes del brief creativo (declarados, no rellenados)\n- público — sin edades en el manual')
    expect(h.texto_md).toContain('## Contradicciones plan ↔ manual (declaradas, no obedecidas)\n(ninguna declarada)')
  })
  it('piezas sueltas: fecha en letras, línea de elemento (| y ; se neutralizan), id del kit saneado', () => {
    expect(fechaEnLetras('2026-11-12')).toBe('12 de noviembre de 2026')
    expect(fechaEnLetras('2026-13-40')).toBe('2026-13-40')
    expect(lineaDeElemento(fila({ id: 'x', fecha: '2026-11-12', hora: '9:00', tema: 'a | b', pilar: 'p;q', datos: [{ dato: 'd', valor: 'v;w', clase: 'alto', ref: 'r', nivel: 'F1' } as any] }))).toBe('2026-11-12 9:00 | historia | a / b | p;q | d: v,w')
    expect(idDelKit('2026 W46/x')).toBe('kit-2026-W46-x')
    expect(RE_ID_DE_BRIEF.test(idDelKit('2026-W46'))).toBe(true)
  })
})
