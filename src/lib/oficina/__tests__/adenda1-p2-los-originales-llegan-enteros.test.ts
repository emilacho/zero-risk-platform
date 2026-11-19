/**
 * 19-nov · ADENDA 1 · P2 (CC5 · GO Lenovo 05:17Z · firma de Emilio 18-nov «cada agente recibe los originales completos» y «nada se recorta»).
 * Los 4 casos del reel auditado (INGENIERIA-INVERSA-CC7-reel-olon, 18-nov) como PRUEBAS de que el original llega entero, no como arreglos sueltos:
 *   1 · el tema de la semana («Surf, comunidad y playa») no llegaba a la hoja de pieza: solo se escribía si la fila no tenía idea del banco
 *   2 · «sin WhatsApp»: el plan pedía «WhatsApp Business activo» antes de pautar y la ficha lo dejó PENDIENTE; el pendiente no viajaba y las piezas dijeron «pide por WhatsApp»
 *   3 · la B de Guayaquil: la hipótesis B del plan está en el carácter 15 114 (plan real de 54 265); las piezas leían 3000 del plan
 *   4 · la frase de la gran idea: el brief de la pieza (la hoja) se cortaba a 5000; ahora llega entero, con la gran idea y todo lo que viene detrás
 * Más: el tablero llega con cada aporte entero (antes 2500 / 220) y la gran idea recibe el plan (antes 0).
 * Sin red, sin modelo, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { armarTarea, tableroEnTexto, tareaDelRelleno } from '../mesa/pedidos'
import { parsearBrief } from '../brief'
import { escribirHoja, CAMPO_PENDIENTES_DE_LA_FICHA, CAMPO_TEMA_DE_LA_FILA, type FilaDeHoja, type InsumosDeLaHoja } from '../../cadena/hoja'
import { leerBriefCreativo } from '../../cadena/brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../../cadena/conceptos'
import type { FormatosPorRed } from '../../cadena/tipos'
import type { Aporte, EstadoMesa, TipoDePieza } from '../mesa/tipos'
import { TOPE_REAL_DEL_PEDIDO } from '@/lib/limites-de-tamano'

// ── el plan: largo como el real (54 265), con lo que importa DONDE estaba en el real
const relleno = (n: number, c = '·') => c.repeat(n)
const DEPENDENCIA_WAB = 'Antes del primer anuncio pagado: medición de pedidos comprobada, WhatsApp Business activo, ficha de Maps verificada.'
const HIPOTESIS_B = 'Hipótesis B · Origen: el encebollado de Olón llega a tu barrio en Guayaquil'
const SURF = 'Semana 4 · Surf, comunidad y playa'
const FINAL_DEL_PLAN = 'ÚLTIMA LÍNEA DEL PLAN'
const PLAN = [relleno(3948), DEPENDENCIA_WAB, relleno(11752 - 3948 - DEPENDENCIA_WAB.length), SURF, relleno(15114 - 11752 - SURF.length), HIPOTESIS_B, relleno(54265 - 15114 - HIPOTESIS_B.length - FINAL_DEL_PLAN.length), FINAL_DEL_PLAN].join('')

// ── la hoja: una fila con idea del banco (el caso que perdía el tema)
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «primera pauta: prueba A contra B».',
  '## Insight', 'El antojo de la playa se queda en la ciudad.',
  '## Mensaje', 'El encebollado que recuerdas ya llega a tu barrio.',
  '## Público', 'Turistas de playa y vecinos de la ciudad (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan.', '## Objetivo', 'Pedidos directos.', '- ig: que lo pidan · «pídelo directo»',
  '## Tono', 'Cercano.',
  '## Obligatorios', '- vocabulario: producto del día', '- prohibido: experiencia gastronómica', '- lo que no se dice: precio en la playa',
  '## Faltantes', '- número de WhatsApp no confirmado',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: ['experiencia gastronómica'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: [], fotos: ['f-01'] }
const FRASE_DE_LA_GRAN_IDEA = 'Saliste de la playa. El encebollado no.'
const CONCEPTO = leerConcepto([
  `## Gran idea  El encebollado no se fue a ningún lado · ${FRASE_DE_LA_GRAN_IDEA}`,
  '## Cómo se ve  Luz de mañana, vapor, bowl.',
  '## Capítulo F1 · Cimientos', 'Qué cuenta: la prueba está en el caldo · Objetivo de la fase (cita): «primera pauta» · Cómo se ve en este capítulo: cenital',
  '## Banco de ideas',
  '- C1-I01 · ig · carrusel · desayuno en la terraza · mensaje: así empieza el día · gancho: la luz sobre el bowl · protagonista: el bowl · serie: ninguna · foto:f-01',
].join('\n'), INS_C)
const FORMATOS: FormatosPorRed = { ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'imagen_fija' }] }
const FILA: FilaDeHoja = { id: 'S4-ig-01', fecha: '2026-11-27', hora: '09:00', red: 'ig', formato: 'carrusel', pilar: 'producto_antojo', tema: 'Surf, comunidad y playa', datos: [], fase: 'F1', idea_ref: 'C1-I01' }
const PENDIENTE_WAB = 'Si WhatsApp Business está activo'
const INS = (extra: Partial<InsumosDeLaHoja> = {}): InsumosDeLaHoja => ({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 5, manual_id: 'man-1', hoy: '2026-11-18', lote_key: '2026-W48',
  brief: BRIEF, brief_id: 'brf-abc-v1', concepto: CONCEPTO, concepto_id: 'con-abc-v1', filas: [FILA], formatos: FORMATOS, ...extra,
})

// ── la mesa
const est = (tipo: TipoDePieza): EstadoMesa => ({ tipo, directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: false } as unknown as EstadoMesa)
const tarea = (tipo: TipoDePieza, o: { brief_texto?: string; manual_texto?: string; plan_texto?: string | null; libro?: Aporte[] } = {}) =>
  armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est: est(tipo), libro: o.libro ?? [], c: { cliente_nombre: 'Cliente', tipo, brief_id: 'S4-ig-01', brief_texto: o.brief_texto ?? 'brief', manual_texto: o.manual_texto ?? 'manual', plan_texto: o.plan_texto === undefined ? PLAN : o.plan_texto, fotos: [], tope_usd: 5, gasto_usd: 0 } })
const PIEZAS: TipoDePieza[] = ['carrusel', 'kit', 'post', 'video']

describe('ADENDA 1 · P2 · caso 3 · la B de Guayaquil: el plan llega ENTERO a quien hace la pieza', () => {
  it('el plan de prueba es como el real: 54 265 caracteres, con la B en el 15 114 y el tema de la semana en el 11 752', () => {
    expect(PLAN.length).toBe(54265)
    expect(PLAN.indexOf(HIPOTESIS_B)).toBe(15114)
    expect(PLAN.indexOf(SURF)).toBe(11752)
  })
  it.each([...PIEZAS, 'concepto' as const, 'brief' as const])('🔴 %s: la hipótesis B, el tema de la semana y la última línea del plan llegan, sin aviso de recorte', (tipo) => {
    const t = tarea(tipo)
    expect(t).toContain(HIPOTESIS_B)
    expect(t).toContain(SURF)
    expect(t).toContain(FINAL_DEL_PLAN)
    expect(t).toContain(PLAN)
    expect(t).not.toMatch(/\[… recortado: \d+ de \d+ caracteres de el plan\]/)
  })
  it('🔴 la gran idea ya no dice «el brief ya es la lectura del plan»: recibe el plan', () => {
    expect(tarea('concepto')).not.toContain('ya es la lectura del plan')
  })
  it('🔴 el manual entero también (antes 7000 en las piezas)', () => {
    const manual = `${relleno(60_000, 'm')}FINAL-DEL-MANUAL`
    for (const tipo of PIEZAS) expect(tarea(tipo, { manual_texto: manual }), tipo).toContain('FINAL-DEL-MANUAL')
  })
})

describe('ADENDA 1 · P2 · caso 1 · el tema de la semana llega a la hoja de pieza y a la mesa', () => {
  it('🔴 con idea del banco, la hoja escribe el TEMA DE LA FILA y su pilar (antes solo si no había idea)', () => {
    const h = escribirHoja(INS())
    const b = parsearBrief(h.texto_md, 'S4-ig-01')!
    expect(b).toBeTruthy()
    expect(h.texto_md).toMatch(new RegExp(`^- ${CAMPO_TEMA_DE_LA_FILA}: Surf, comunidad y playa · pilar: producto_antojo$`, 'm'))
    // la mesa recibe la sección de su pieza tal cual (`brief_texto`)
    for (const tipo of PIEZAS) expect(tarea(tipo, { brief_texto: b.texto }), tipo).toContain('Surf, comunidad y playa · pilar: producto_antojo')
  })
})

describe('ADENDA 1 · P2 · caso 2 · «sin WhatsApp»: el pendiente de la ficha y la dependencia del plan llegan', () => {
  it('🔴 la hoja escribe lo que la ficha NO sabe, como pendiente (no como hecho)', () => {
    const h = escribirHoja(INS({ pendientes_de_las_fichas: [PENDIENTE_WAB, 'Número activo de pedidos por plaza'] }))
    const b = parsearBrief(h.texto_md, 'S4-ig-01')!
    expect(b.texto).toContain(`- ${CAMPO_PENDIENTES_DE_LA_FICHA}:\n  - ${PENDIENTE_WAB}\n  - Número activo de pedidos por plaza`)
    for (const tipo of PIEZAS) expect(tarea(tipo, { brief_texto: b.texto }), tipo).toContain(PENDIENTE_WAB)
  })
  it('sin pendientes, la hoja no agrega la línea (una hoja vieja no cambia)', () => {
    expect(escribirHoja(INS()).texto_md).not.toContain(CAMPO_PENDIENTES_DE_LA_FICHA)
    expect(escribirHoja(INS({ pendientes_de_las_fichas: [] })).texto_md).not.toContain(CAMPO_PENDIENTES_DE_LA_FICHA)
  })
  it('🔴 la dependencia del plan («WhatsApp Business activo» antes de pautar) llega a cada mesa de pieza', () => {
    for (const tipo of PIEZAS) expect(tarea(tipo), tipo).toContain(DEPENDENCIA_WAB)
  })
})

describe('ADENDA 1 · P2 · caso 4 · la frase de la gran idea: el brief de la pieza llega ENTERO', () => {
  it('🔴 un brief de pieza de 20 000 caracteres llega entero, con la gran idea y lo que viene detrás (antes 5000)', () => {
    const b = parsearBrief(escribirHoja(INS()).texto_md, 'S4-ig-01')!
    expect(b.texto).toContain(FRASE_DE_LA_GRAN_IDEA)
    const largo = `${relleno(15_000, 'b')}\n${b.texto}\n${relleno(5_000, 'c')}FIN-DEL-BRIEF`
    for (const tipo of PIEZAS) {
      const t = tarea(tipo, { brief_texto: largo })
      expect(t, tipo).toContain(FRASE_DE_LA_GRAN_IDEA)
      expect(t, tipo).toContain('FIN-DEL-BRIEF')
      expect(t, tipo).not.toContain('de el marco]')
    }
  })
})

describe('ADENDA 1 · P2 · el tablero: cada aporte ENTERO, todos', () => {
  const aporte = (n: number, largo: number): Aporte => ({ n, de: `miembro-${n}`, tipo: 'aporte', texto: `A${n}-INICIO ${relleno(largo, 'x')} A${n}-FINAL` } as unknown as Aporte)
  it('🔴 24 aportes de 5000 caracteres: los 24 llegan con su final (antes: 10 recientes a 2500 y el resto a 220)', () => {
    const libro = Array.from({ length: 24 }, (_, i) => aporte(i + 1, 5000))
    const t = tableroEnTexto(libro)
    for (let i = 1; i <= 24; i++) expect(t, `A${i}`).toContain(`A${i}-FINAL`)
    expect(t).not.toContain('recortado')
    expect(tarea('carrusel', { libro })).toContain('A1-FINAL')
  })
  it('el orden es el del libro (el más viejo primero)', () => {
    const t = tableroEnTexto([aporte(1, 10), aporte(2, 10)])
    expect(t.indexOf('A1-INICIO')).toBeLessThan(t.indexOf('A2-INICIO'))
  })
})

describe('ADENDA 1 · P2 · un documento que pasa el techo del pedido se recorta AVISANDO (nunca callado)', () => {
  it('el plan de más del techo trae el aviso con los dos números', () => {
    const enorme = relleno(TOPE_REAL_DEL_PEDIDO + 10, 'p')
    expect(tarea('carrusel', { plan_texto: enorme })).toContain(`[… recortado: ${TOPE_REAL_DEL_PEDIDO} de ${TOPE_REAL_DEL_PEDIDO + 10} caracteres de el plan]`)
  })
})

describe('ADENDA 1 · P2 · el relleno del banco ve TODAS las ideas que ya están, con su mensaje entero', () => {
  it('🔴 80 ideas con mensajes de 400 caracteres: las 80 llegan con su final (antes 60 ideas y 140 caracteres)', () => {
    const ya_estan = Array.from({ length: 80 }, (_, i) => ({ id: `C1-I${String(i + 1).padStart(2, '0')}`, red: 'ig', mensaje: `${relleno(400, 'm')} FIN-${i + 1}.` }))
    const t = tareaDelRelleno({ capitulo: 'F1', prefijo: '1', desde: 81, redes: [{ red: 'ig', faltan: 2, esperadas: 82 }], ya_estan })
    for (let i = 1; i <= 80; i++) expect(t, `idea ${i}`).toContain(`FIN-${i}.`)
  })
})
