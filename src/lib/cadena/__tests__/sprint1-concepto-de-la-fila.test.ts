/**
 * 16-nov · Sprint 1 · Mejoras 1 y 2 (CC1) · la fila del calendario lleva el CONCEPTO de su pieza y la hoja lo escribe; la oficina lee el OBJETIVO y el concepto.
 *  · `calendario_tanda.v3`: cada pieza trae `concepto` (idea, qué se ve, mensaje, emoción, foto, llamado); el texto vacío = «no lo sé».
 *  · la fusión lo deja en la fila (solo las partes con texto; nada = null) y la hoja escribe IDEA DE LA PIEZA · QUÉ SE VE · EMOCIÓN · FOTO A USAR, y su mensaje y llamado mandan.
 *  · sin concepto: la hoja lo arma de la idea del banco y AVISA (nunca bloquea); la línea VISUAL dice que es la referencia de la CAMPAÑA.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { resumenDelEncargo } from '@/lib/oficina/pedidos'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { ESQUEMAS, ESQUEMA_CALENDARIO_TANDA_V2, ESQUEMA_CALENDARIO_TANDA_V3, ESQUEMA_CALENDARIO_TANDA_V4 } from '../esquemas'
import { conceptoLimpio, expandirPatron, fusionarTanda, idDeFila } from '../expandir-patron'
import { formatosDeLaMigracion } from '../__fixtures__/clientes'
import { escribirHoja, PREFIJO_VISUAL_DE_CAMPANA, QUIEN_DECIDE_EL_COMO, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import { CONCEPTO_DE_CADA_PIEZA } from '../indicaciones'
import type { Estrategia, FormatosPorRed, PiezaAgente, TandaAgente } from '../tipos'

const PLAN = '## Fase 1\nObjetivo: que el barrio sepa que la cocina abre temprano.'
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el barrio sepa que la cocina abre temprano».',
  '## Insight', 'La gente desayuna de pie.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', '30 desayunos nuevos por semana.', '- ig: que miren el pan · «ven a desayunar»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre', '- prohibido: delicioso', '- lo que no se dice: precios',
  '## Faltantes', '- ninguno',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: ['delicioso'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: ['delicioso'], fotos: ['f-01'] }
const CONCEPTO = leerConcepto([
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Capítulo F1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «que el barrio sepa» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · ig · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:f-01',
].join('\n'), INS_C)
const FORMATOS: FormatosPorRed = { ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'imagen_fija' }] }
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-12', hora: '09:00', red: 'ig', formato: 'carrusel', pilar: 'producto', tema: 'la primera silla', datos: [], fase: 'F1', idea_ref: 'C1-I01', ...o })
const INS = (filas: FilaDeHoja[]): InsumosDeLaHoja => ({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 3, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46',
  brief: BRIEF, brief_id: 'brf-abc-v1', concepto: CONCEPTO, concepto_id: 'con-abc-v1', filas, formatos: FORMATOS,
})
const CONCEPTO_PROPIO = { idea: 'la silla vacía que espera al vecino', que_se_ve: 'una silla de madera junto a la mesa larga, pan recién horneado, luz de las siete', mensaje: 'siempre hay una silla para ti', emocion: 'bienvenida', foto: 'foto:f-01', llamado: 'ven a desayunar mañana' }

describe('calendario_tanda.v3 · el concepto de cada pieza', () => {
  it('v3 = v2 + `concepto` con sus seis partes (todas obligatorias en la forma: el texto vacío es «no lo sé»); v2 sigue en el registro tal cual', () => {
    const piezaV3 = (ESQUEMA_CALENDARIO_TANDA_V3.properties.piezas as { items: unknown }).items as { required: string[]; properties: Record<string, { required?: string[] }> }
    const piezaV2 = (ESQUEMA_CALENDARIO_TANDA_V2.properties.piezas as { items: unknown }).items as { required: string[] }
    expect(piezaV3.required).toEqual(expect.arrayContaining([...piezaV2.required, 'concepto']))
    expect(piezaV3.required.length).toBe(piezaV2.required.length + 1)
    expect(piezaV3.properties.concepto.required).toEqual(['idea', 'que_se_ve', 'mensaje', 'emocion', 'foto', 'llamado'])
    expect(ESQUEMAS['calendario_tanda.v2']).toBe(ESQUEMA_CALENDARIO_TANDA_V2)
    expect(ESQUEMAS['calendario_tanda.v3']).toBe(ESQUEMA_CALENDARIO_TANDA_V3)
  })
  // 17-nov · Sprint 4 · F (v5): el calendario ya no escribe la idea, el mensaje, el llamado ni las fotos: solo objetivo y público de la fecha
  it('(Sprint 4 · F) la tarea pide solo objetivo y público; NO pide idea, mensaje, llamado ni fotos; no reescribe la idea; lo que no sepa queda vacío', () => {
    for (const k of ['objetivo', 'publico']) expect(CONCEPTO_DE_CADA_PIEZA).toContain(`\`${k}\``)
    for (const k of ['`idea`', '`mensaje`', '`llamado`', '`fotos_disponibles`', 'que_se_ve', 'emocion', '`foto`']) expect(CONCEPTO_DE_CADA_PIEZA).not.toContain(k)
    expect(CONCEPTO_DE_CADA_PIEZA).toMatch(/NO reescribes su idea, su mensaje/)
    expect(CONCEPTO_DE_CADA_PIEZA).toMatch(/déjala vacía/)
  })
  it('(GO 22:04) v4 = v3 con el concepto estratégico; v3 sigue en el registro tal cual (filas guardadas)', () => {
    const piezaV4 = (ESQUEMA_CALENDARIO_TANDA_V4.properties.piezas as { items: unknown }).items as { required: string[]; properties: Record<string, { required?: string[] }> }
    const piezaV3 = (ESQUEMA_CALENDARIO_TANDA_V3.properties.piezas as { items: unknown }).items as { required: string[] }
    expect(piezaV4.required).toEqual(piezaV3.required)
    expect(piezaV4.properties.concepto.required).toEqual(['idea', 'objetivo', 'mensaje', 'publico', 'llamado', 'fotos_disponibles'])
    expect(ESQUEMAS['calendario_tanda.v4']).toBe(ESQUEMA_CALENDARIO_TANDA_V4)
    expect(ESQUEMAS['calendario_tanda.v3']).toBe(ESQUEMA_CALENDARIO_TANDA_V3)
  })
  it('conceptoLimpio lee lo estratégico (fotos sin repetir ni vacías) y conserva lo creativo de una fila v3', () => {
    expect(conceptoLimpio({ idea: 'i', objetivo: ' o ', mensaje: '', publico: 'p', llamado: '', fotos_disponibles: ['foto:a', ' foto:a ', '', 3] })).toEqual({ idea: 'i', objetivo: 'o', publico: 'p', fotos_disponibles: ['foto:a'] })
    expect(conceptoLimpio({ idea: '', objetivo: '', mensaje: '', publico: '', llamado: '', fotos_disponibles: [] })).toBeNull()
    expect(conceptoLimpio({ que_se_ve: 'x', emocion: 'y', foto: 'z' })).toEqual({ que_se_ve: 'x', emocion: 'y', foto: 'z' })
  })
  it('conceptoLimpio: solo las partes con texto; nada (o algo que no es objeto) = null', () => {
    expect(conceptoLimpio({ idea: ' una idea ', que_se_ve: '', mensaje: 'm', emocion: '  ', foto: '', llamado: '' })).toEqual({ idea: 'una idea', mensaje: 'm' })
    expect(conceptoLimpio({ idea: '', que_se_ve: '', mensaje: '', emocion: '', foto: '', llamado: '' })).toBeNull()
    expect(conceptoLimpio(undefined)).toBeNull()
    expect(conceptoLimpio(['x'])).toBeNull()
    expect(conceptoLimpio({ idea: 3 })).toBeNull()
  })
})

describe('la hoja escribe el concepto de la pieza y la oficina lo lee', () => {
  // 17-nov · Sprint 4 · F: con idea del banco, la idea y el mensaje de la fila vieja NO llegan (manda la idea de los creativos); su llamado queda como respaldo (paso 3)
  it('(GO 22:04 · Sprint 4 F) fila v3 guardada: lo creativo llega SOLO como SUGERENCIAS; su idea y su mensaje NO llegan (manda el banco); su llamado es respaldo; sin aviso', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-01', concepto: CONCEPTO_PROPIO })]))
    expect(h.avisos).toEqual([])
    const b = parsearBrief(h.texto_md, 'F1-S1-ig-01')!
    expect(b.idea_de_la_pieza).toBeUndefined()
    expect(h.texto_md).not.toContain('la silla vacía que espera al vecino')
    expect(b.que_se_ve).toBeUndefined()
    expect(b.mensaje).toBe('aquí siempre hay una silla para ti')
    expect(h.texto_md).not.toMatch(/^- MENSAJE \(uno\): siempre hay una silla para ti$/m)
    expect(b.llamado).toBe('ven a desayunar mañana')
    expect(h.texto_md).not.toMatch(/^- (QUÉ SE VE|EMOCIÓN|FOTO A USAR):/m)
    expect(h.texto_md).toMatch(/^- IDEA DEL BANCO: C1-I01 · la primera silla · mensaje: aquí siempre hay una silla para ti/m)
    expect(h.texto_md).toContain('- SUGERENCIAS:\n  - qué se ve: una silla de madera')
    expect(h.texto_md).toContain('  - emoción: bienvenida')
    expect(h.texto_md).toContain('  - foto: foto:f-01')
    expect(h.texto_md).toContain(`- QUIÉN DECIDE EL CÓMO: ${QUIEN_DECIDE_EL_COMO}`)
    // la foto de la fila y la del banco son la misma (foto:f-01 = f-01): una sola, como material
    expect(h.texto_md).toContain('- FOTOS DISPONIBLES:\n  - foto:f-01 (material; la mesa decide si la usa)\n- QUIÉN')
  })
  it('(GO 22:04) fila v4 (estratégica): su objetivo y su público mandan; las fotos son material; la única SUGERENCIA es cómo imaginó la idea el banco', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-01', concepto: { idea: 'la silla', objetivo: 'que guarden la publicación', mensaje: 'm', publico: 'vecinos madrugadores', llamado: 'ven', fotos_disponibles: ['foto:f-09'] } })]))
    expect(h.avisos).toEqual([])
    const b = parsearBrief(h.texto_md, 'F1-S1-ig-01')!
    expect(b.objetivo).toBe('que guarden la publicación')
    expect(h.texto_md).toContain('- PÚBLICO: vecinos madrugadores')
    expect(h.texto_md).toContain('  - foto:f-09 (material; la mesa decide si la usa)')
    expect(h.texto_md).toContain('  - f-01 (material; la mesa decide si la usa)')
    // 17-nov · Sprint 4 · F: sin lo creativo de una v3 no hay SUGERENCIAS; la idea del banco va tal cual en IDEA DEL BANCO y el mensaje de la fila no llega
    expect(h.texto_md).not.toContain('- SUGERENCIAS:')
    expect(h.texto_md).not.toContain('- MENSAJE (uno): m\n')
  })
  it('sin concepto propio: se arma de la idea del banco; NO suma avisos de la hoja (serían hallazgos del parte: una reja de hecho); el mensaje, el llamado y el público son los de siempre; ninguna escena impuesta', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-01' })]))
    expect(h.avisos).toEqual([])
    const b = parsearBrief(h.texto_md, 'F1-S1-ig-01')!
    // sin idea propia de la fila NO hay IDEA DE LA PIEZA; 17-nov · Sprint 4 · F: la descripción del banco va UNA vez, tal cual, en IDEA DEL BANCO
    expect(b.idea_de_la_pieza).toBeUndefined()
    // 19-nov · ADENDA 1 · P2: la descripción va una vez en IDEA DEL BANCO; la otra aparición es el TEMA DE LA FILA (el fixture usa el mismo texto)
    expect(h.texto_md.split('la primera silla').length - 1).toBe(2)
    expect(h.texto_md).toMatch(/^- TEMA DE LA FILA: la primera silla · pilar: producto$/m)
    expect(h.texto_md).toMatch(/^- IDEA DEL BANCO: C1-I01 · la primera silla · /m)
    expect(b.que_se_ve).toBeUndefined()
    expect(b.mensaje).toBe('aquí siempre hay una silla para ti')
    expect(b.llamado).toBe('«ven a desayunar»')
    expect(h.texto_md).toContain('- PÚBLICO: Vecinos del barrio que desayunan fuera entre semana (del plan).')
    expect(h.texto_md).toContain('  - f-01 (material; la mesa decide si la usa)')
  })
  it('la línea VISUAL dice que es la referencia de estilo de la CAMPAÑA (los planos del capítulo no se confunden con la escena de la pieza)', () => {
    const b = parsearBrief(escribirHoja(INS([fila({ id: 'F1-S1-ig-01', concepto: CONCEPTO_PROPIO })])).texto_md, 'F1-S1-ig-01')!
    expect(b.visual.startsWith(PREFIJO_VISUAL_DE_CAMPANA)).toBe(true)
    expect(b.visual).toContain('planos cerrados')
  })
  it('la oficina lee el OBJETIVO de la hoja (antes no lo leía)', () => {
    const b = parsearBrief(escribirHoja(INS([fila({ id: 'F1-S1-ig-01' })])).texto_md, 'F1-S1-ig-01')!
    expect(b.objetivo).toBe('que miren el pan')
  })
})

describe('Mejora 1 · la jefatura recibe el objetivo, no el mensaje', () => {
  const b = parsearBrief(escribirHoja(INS([fila({ id: 'F1-S1-ig-01', concepto: CONCEPTO_PROPIO })])).texto_md, 'F1-S1-ig-01')!
  it('con objetivo en el brief: «lo que busca» es el objetivo, distinto del mensaje', () => {
    expect(b.objetivo).not.toBe(b.mensaje)
    expect(resumenDelEncargo(b).objetivo).toBe('que miren el pan')
  })
  it('un parte viejo sin OBJETIVO sigue con el mensaje (no queda vacío)', () => {
    const viejo = { ...b, objetivo: undefined }
    // 17-nov · Sprint 4 · F: el mensaje es el de la idea del banco (el de la fila vieja ya no manda)
    expect(resumenDelEncargo(viejo).objetivo).toBe('aquí siempre hay una silla para ti')
  })
})

describe('la fusión de la tanda deja el concepto en su fila', () => {
  const slot = (o: Record<string, unknown>) => ({ slot: 'a', dia_semana: 1, hora: '10:00', red: 'instagram', formato: 'foto', pilar: 'p1', requiere_abierto: false, sede: '', ...o })
  const e = { patron_semanal: [slot({ slot: 'a' }), slot({ slot: 'b', dia_semana: 3 })], piezas_fijas: [] } as unknown as Estrategia
  const camp = { fecha_inicio: '2026-10-05', fecha_fin: '2026-12-27' }
  const F = formatosDeLaMigracion()
  const mesa = { banco: [{ id: 'C1-I01' }], fases: [{ clave: 'F1', dia_desde: 1, dia_hasta: 90 }] }
  const pieza = (slot: string, dia: number, concepto?: Record<string, string>): PiezaAgente => ({ semana: 1, dia_semana: dia, slot, hora: '', red: '', formato: '', pilar: '', tema: `tema ${slot}`, sede: '', requiere_abierto: false, depende_de: [], pieza_fija: '', datos: [], pendientes: [], idea_de_mesa: 'C1-I01', ...(concepto ? { concepto } : {}) })
  const VACIO = { idea: '', que_se_ve: '', mensaje: '', emocion: '', foto: '', llamado: '' }
  it('con la gran idea: la pieza con concepto lo deja limpio en su fila; la que lo trae vacío queda en null', () => {
    const t: TandaAgente = { ajustes_al_patron: [], piezas: [pieza('a', 1, { ...VACIO, idea: ' la silla ', mensaje: 'm' }), pieza('b', 3, VACIO)] }
    const { filas } = fusionarTanda(expandirPatron(e, camp, [1], 1, F), t, e, camp, 1, F, mesa)
    expect(filas.find((f) => f.id === idDeFila(1, 1, 'a'))!.concepto).toEqual({ idea: 'la silla', mensaje: 'm' })
    expect(filas.find((f) => f.id === idDeFila(1, 3, 'b'))!.concepto).toBeNull()
  })
  it('la corrección de SOLO las piezas que fallaron no borra el concepto de las demás filas', () => {
    const guardadas = expandirPatron(e, camp, [1], 1, F).map((f) => ({ ...f, concepto: { idea: `idea de ${f.id}` } }))
    const t: TandaAgente = { ajustes_al_patron: [], piezas: [pieza('a', 1, { ...VACIO, idea: 'nueva' })] }
    const { filas } = fusionarTanda(guardadas, t, e, camp, 1, F, mesa)
    expect(filas.find((f) => f.id === idDeFila(1, 1, 'a'))!.concepto).toEqual({ idea: 'nueva' })
    expect(filas.find((f) => f.id === idDeFila(1, 3, 'b'))!.concepto).toEqual({ idea: `idea de ${idDeFila(1, 3, 'b')}` })
  })
  it('sin la gran idea (la cadena de hoy): la fusión no agrega concepto', () => {
    const t: TandaAgente = { ajustes_al_patron: [], piezas: [pieza('a', 1, { ...VACIO, idea: 'x' })] }
    const { filas } = fusionarTanda(expandirPatron(e, camp, [1], 1, F), t, e, camp, 1, F)
    expect(filas.every((f) => !('concepto' in f))).toBe(true)
  })
})
