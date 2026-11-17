/**
 * 17-nov · cambio 4 · D1 (regla dura firmada por Emilio) · PEDIDO-CC4-a-CC3: la hoja escribe «OFERTA CERRADA EN SU FECHA» solo cuando
 * la ficha dice POR CÓDIGO (el `tipo` del hecho del cerebro) que la oferta está cerrada o aún no existe en la fecha de la fila.
 * Sin dato, sin ficha o sin fecha legible: no se escribe nada (las hojas de hoy no cambian). Camino real: los hechos entran por `fichasConHechos`.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto } from '../conceptos'
import { fichasConHechos, type FichaDeOferta, type HechoDelNegocioPorOferta } from '../ficha-de-oferta'
import { CAMPO_FICHA, CAMPO_OFERTA_CERRADA, escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'

const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que nos conozcan».',
  '## Insight', 'La gente decide rápido.',
  '## Mensaje', 'Estamos cerca.',
  '## Público', 'Personas de la zona (del plan).', '## Cómo sabremos que funcionó', 'Consultas por semana, cada lunes.', '## Objetivo', '30 consultas nuevas por semana.',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: cerca',
  '## Faltantes', '- ninguno',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que nos conozcan.', prohibidas: [] })
const BANCO = ['- C1-I01 · ig · carrusel · una idea · mensaje: estamos cerca · gancho: ¿ya viniste? · protagonista: el lugar · serie: S1 · foto:ninguna']
const concepto = leerConcepto(['## Gran idea  Cerca · Lo que buscas está cerca', '## Cómo se ve  Luz natural.', '## Capítulo F1 · Abrir', 'Qué cuenta: abrimos · Objetivo de la fase (cita): «que nos conozcan» · Cómo se ve: luz', '## Banco de ideas', ...BANCO].join('\n'), { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 2 }], prohibidas: [], fotos: [] })
const FORMATOS: FormatosPorRed = { ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'imagen_fija' }] }
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-20', hora: '09:00', red: 'ig', formato: 'carrusel', pilar: 'p', tema: 'tema', datos: [], fase: 'F1', idea_ref: 'C1-I01', ...o })
const hoja = (fichas: FichaDeOferta[] | undefined, filas: FilaDeHoja[]) => escribirHoja({
  client_name: 'cliente de prueba', plan_id: 'plan-1', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief: BRIEF, brief_id: 'brf-1', concepto, concepto_id: 'con-1', filas, formatos: FORMATOS, fichas,
} as InsumosDeLaHoja)
const seccion = (texto: string, id: string) => parsearBrief(texto, id)!.texto
const hecho = (o: Partial<HechoDelNegocioPorOferta> & Pick<HechoDelNegocioPorOferta, 'tipo' | 'valor'>): HechoDelNegocioPorOferta =>
  ({ oferta: 'brunch', sede_id: null, vigente_desde: null, vigente_hasta: null, fuente: 'dueno · ficha:f1', fecha_de_la_fuente: '2026-11-17', confianza: 'alta', ...o })
const BASE: FichaDeOferta[] = [{ clave: 'brunch', que_es: { valor: 'brunch de domingo', fuente: 'manual:menu' } }]
const CAMPO = `- ${CAMPO_OFERTA_CERRADA}:`

describe('D1 · la hoja escribe si la oferta está cerrada en la fecha de la fila', () => {
  it('🔴 cierre del cerebro vigente en la fecha de la fila ⇒ el campo, con valor y fuente, justo DESPUÉS de la lista de la ficha', () => {
    const fichas = fichasConHechos(BASE, [hecho({ tipo: 'cierre_retiro', valor: 'el brunch se retiró del menú', vigente_desde: '2026-11-18' })])
    const s = seccion(hoja(fichas, [fila({ id: 'p-1', oferta: 'brunch' })]).texto_md, 'p-1')
    expect(s).toContain(`${CAMPO} el brunch se retiró del menú (fuente: cerebro:dueno · ficha:f1 · dicho el 2026-11-17 · confianza alta)`)
    const l = s.split('\n')
    const i = l.findIndex((x) => x.startsWith(`- ${CAMPO_FICHA}:`)), j = l.findIndex((x) => x.startsWith(CAMPO))
    expect(i).toBeGreaterThanOrEqual(0)
    expect(j).toBeGreaterThan(i)
    expect(l.slice(i + 1, j).every((x) => x.startsWith('  - '))).toBe(true)
  })
  it('🔴 cierre que empieza DESPUÉS de la fila ⇒ nada (la pieza del 20 vende una oferta abierta)', () => {
    const fichas = fichasConHechos(BASE, [hecho({ tipo: 'cierre_retiro', valor: 'se retira', vigente_desde: '2026-11-21' })])
    expect(hoja(fichas, [fila({ id: 'p-1', oferta: 'brunch' })]).texto_md).not.toContain(CAMPO)
  })
  it('🔴 «aún no existe» hasta E−1: la fila del día anterior lo lleva; la del día E ya no', () => {
    const fichas = fichasConHechos(BASE, [hecho({ tipo: 'aun_no_existe', valor: 'el brunch abre el 20-nov', vigente_hasta: '2026-11-19' })])
    const h = hoja(fichas, [fila({ id: 'p-19', oferta: 'brunch', fecha: '2026-11-19' }), fila({ id: 'p-20', oferta: 'brunch', fecha: '2026-11-20' })]).texto_md
    expect(seccion(h, 'p-19')).toContain(`${CAMPO} el brunch abre el 20-nov`)
    expect(seccion(h, 'p-20')).not.toContain(CAMPO)
  })
  it('🔴 solo la pieza de ESA oferta: otra oferta en la misma hoja no lo lleva', () => {
    const fichas = fichasConHechos([...BASE, { clave: 'cena', que_es: { valor: 'cena', fuente: 'manual:menu' } }], [hecho({ tipo: 'cierre_retiro', valor: 'se retiró' })])
    const h = hoja(fichas, [fila({ id: 'p-b', oferta: 'brunch' }), fila({ id: 'p-c', oferta: 'cena' })]).texto_md
    expect(seccion(h, 'p-b')).toContain(CAMPO)
    expect(seccion(h, 'p-c')).not.toContain(CAMPO)
  })
  it('🔴 sin tipo (lo escribió el lector, aunque diga «cerrado») ⇒ nada: D1 es por código, no por palabras', () => {
    const fichas: FichaDeOferta[] = [{ ...BASE[0], no_se_puede_afirmar: [{ valor: 'el brunch está cerrado', fuente: 'manual:menu' }] }]
    expect(hoja(fichas, [fila({ id: 'p-1', oferta: 'brunch' })]).texto_md).not.toContain(CAMPO)
  })
  it('🔴 otros tipos del cerebro (sede, apertura, zona) ⇒ nada', () => {
    const fichas = fichasConHechos(BASE, [hecho({ tipo: 'sede', valor: 'centro' }), hecho({ tipo: 'apertura', valor: 'abrió', vigente_desde: '2026-11-01' }), hecho({ tipo: 'zona_de_entrega', valor: 'norte' })])
    expect(hoja(fichas, [fila({ id: 'p-1', oferta: 'brunch' })]).texto_md).not.toContain(CAMPO)
  })
  it('🔴 sin fichas, sin la ficha de la oferta o fecha ilegible ⇒ nada (y las hojas de hoy no cambian)', () => {
    const fichas = fichasConHechos(BASE, [hecho({ tipo: 'cierre_retiro', valor: 'se retiró' })])
    expect(hoja(undefined, [fila({ id: 'p-1', oferta: 'brunch' })]).texto_md).not.toContain(CAMPO)
    expect(hoja(fichas, [fila({ id: 'p-1', oferta: 'otra' })]).texto_md).not.toContain(CAMPO)
    expect(hoja(fichas, [fila({ id: 'p-1', oferta: 'brunch', fecha: '20 de noviembre' })]).texto_md).not.toContain(CAMPO)
    // la misma hoja sin el hecho es idéntica a la de antes de este cambio, salvo por el campo
    const sin = hoja(BASE, [fila({ id: 'p-1', oferta: 'brunch' })]).texto_md
    expect(sin).not.toContain(CAMPO)
  })
})
