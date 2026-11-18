/**
 * 17-nov · cambio 4 · D1 (regla dura firmada por Emilio) · PEDIDO-CC4-a-CC3: la hoja escribe «OFERTA CERRADA EN SU FECHA» solo cuando
 * la ficha dice POR CÓDIGO (el `tipo` del hecho del cerebro) que la oferta está cerrada o aún no existe en la fecha de la fila.
 * Sin dato, sin ficha o sin fecha legible: no se escribe nada (las hojas de hoy no cambian). Camino real: los hechos entran por `fichasConHechos`.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { CAMPO_CIERRE_DE_LA_HOJA, fichaDeLaHoja } from '@/lib/oficina/sentido-contra-la-ficha'
import { chequeosExactos } from '@/lib/oficina/exactos-de-la-ficha'
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
const hoja = (fichas: FichaDeOferta[] | undefined, filas: FilaDeHoja[], hechos?: HechoDelNegocioPorOferta[] | null) => escribirHoja({
  client_name: 'cliente de prueba', plan_id: 'plan-1', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief: BRIEF, brief_id: 'brf-1', concepto, concepto_id: 'con-1', filas, formatos: FORMATOS, fichas, ...(hechos !== undefined ? { hechos } : {}),
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

/**
 * 18-nov · RESPUESTA-LENOVO-a-CC3-CC7 (#1147) · la ficha es la FOTO del inicio de la campaña: el estado de la oferta en la fecha de la fila
 * se lee EN VIVO de los hechos del cerebro al armar la hoja; si los dos chocan, manda el cerebro (y la hoja lo avisa).
 */
describe('D1 en vivo · un cierre registrado en el cerebro DESPUÉS de la ficha llega a la hoja', () => {
  const CIERRE_TARDE = hecho({ tipo: 'cierre_retiro', valor: 'el brunch se retira desde el 19', vigente_desde: '2026-11-19', fecha_de_la_fuente: '2026-11-18' })
  const FOTO_CERRADA = () => fichasConHechos(BASE, [hecho({ tipo: 'cierre_retiro', valor: 'se retiró', vigente_desde: '2026-11-18' })])
  it('🔴 foto abierta + cerebro de hoy con cierre ⇒ el campo, con la fuente del cerebro, y el aviso del choque', () => {
    const h = hoja(BASE, [fila({ id: 'p-1', oferta: 'brunch' })], [CIERRE_TARDE])
    expect(seccion(h.texto_md, 'p-1')).toContain(`${CAMPO} el brunch se retira desde el 19 (fuente: cerebro:dueno · ficha:f1 · dicho el 2026-11-18 · confianza alta)`)
    expect(h.avisos.some((a) => a.startsWith('p-1:') && a.includes('CERRADA') && a.includes('manda el cerebro'))).toBe(true)
  })
  it('🔴 foto cerrada + cerebro de hoy sin el cierre ⇒ sin campo (manda el cerebro) y avisa que está ABIERTA', () => {
    const h = hoja(FOTO_CERRADA(), [fila({ id: 'p-1', oferta: 'brunch' })], [])
    expect(h.texto_md).not.toContain(CAMPO)
    expect(h.avisos.some((a) => a.startsWith('p-1:') && a.includes('ABIERTA') && a.includes('manda el cerebro'))).toBe(true)
  })
  it('🔴 los dos coinciden ⇒ el campo del cerebro de hoy y ningún aviso de choque', () => {
    const h = hoja(fichasConHechos(BASE, [CIERRE_TARDE]), [fila({ id: 'p-1', oferta: 'brunch' })], [CIERRE_TARDE])
    expect(seccion(h.texto_md, 'p-1')).toContain(`${CAMPO} el brunch se retira desde el 19`)
    expect(h.avisos.filter((a) => a.includes('manda el cerebro'))).toEqual([])
  })
  it('🔴 el cierre vivo respeta la fecha de la fila: la del 18 sigue abierta, la del 19 lo lleva', () => {
    const h = hoja(BASE, [fila({ id: 'p-18', oferta: 'brunch', fecha: '2026-11-18' }), fila({ id: 'p-19', oferta: 'brunch', fecha: '2026-11-19' })], [CIERRE_TARDE]).texto_md
    expect(seccion(h, 'p-18')).not.toContain(CAMPO)
    expect(seccion(h, 'p-19')).toContain(CAMPO)
  })
  it('🔴 cierre vivo de OTRA oferta ⇒ nada para esta', () => {
    expect(hoja(BASE, [fila({ id: 'p-1', oferta: 'brunch' })], [{ ...CIERRE_TARDE, oferta: 'cena' }]).texto_md).not.toContain(CAMPO)
  })
  it('🔴 sin fichas (o sin la ficha de la oferta), el cierre vivo igual llega; sin oferta en la fila, nada', () => {
    expect(seccion(hoja(undefined, [fila({ id: 'p-1', oferta: 'brunch' })], [CIERRE_TARDE]).texto_md, 'p-1')).toContain(CAMPO)
    expect(seccion(hoja([{ clave: 'cena', que_es: { valor: 'cena', fuente: 'manual:menu' } }], [fila({ id: 'p-1', oferta: 'brunch' })], [CIERRE_TARDE]).texto_md, 'p-1')).toContain(CAMPO)
    expect(hoja(BASE, [fila({ id: 'p-1' })], [{ ...CIERRE_TARDE, oferta: null }]).texto_md).not.toContain(CAMPO)
  })
  it('🔴 los hechos no se pudieron leer (null) ⇒ vale la foto y se avisa; nunca se calla', () => {
    const h = hoja(FOTO_CERRADA(), [fila({ id: 'p-1', oferta: 'brunch' })], null)
    expect(seccion(h.texto_md, 'p-1')).toContain(`${CAMPO} se retiró`)
    expect(h.avisos.some((a) => a.startsWith('p-1:') && a.includes('no se pudieron leer en vivo'))).toBe(true)
  })
  it('🔴 sin lectura en vivo (almacén que no la sabe) ⇒ la hoja es la de antes, sin avisos nuevos', () => {
    const h = hoja(FOTO_CERRADA(), [fila({ id: 'p-1', oferta: 'brunch' })])
    expect(seccion(h.texto_md, 'p-1')).toContain(`${CAMPO} se retiró`)
    expect(h.avisos.filter((a) => a.includes('cerebro') || a.includes('en vivo'))).toEqual([])
  })
})

/** CC7 (RESPUESTA 23:49Z) · los DOS lados: lo que escribe la hoja lo lee la oficina como D1 dura. Un cambio de nombre en un solo lado no pasa callado */
describe('D1 cruzado · la hoja escribe, la oficina lee y frena', () => {
  const CIERRE = hecho({ tipo: 'cierre_retiro', valor: 'el brunch se retiró', vigente_desde: '2026-11-18' })
  it('el nombre del campo es el mismo en los dos lados', () => {
    expect(CAMPO_OFERTA_CERRADA).toBe(CAMPO_CIERRE_DE_LA_HOJA)
  })
  for (const [nombre, fichas, hechos] of [
    ['cierre en la foto de la ficha', fichasConHechos(BASE, [CIERRE]), undefined],
    ['cierre registrado después (en vivo)', BASE, [CIERRE]],
    ['cierre en vivo y sin ficha', undefined, [CIERRE]],
  ] as const) {
    it(`🔴 ${nombre} ⇒ la oficina lee el cierre y D1 manda la fila al calendario como regla dura`, () => {
      const s = seccion(hoja(fichas as FichaDeOferta[] | undefined, [fila({ id: 'p-1', oferta: 'brunch' })], hechos as HechoDelNegocioPorOferta[] | undefined).texto_md, 'p-1')
      const f = fichaDeLaHoja(s)
      expect(f.cierre).toMatch(/^el brunch se retiró \(fuente: cerebro:/)
      expect(chequeosExactos(f, '').hallazgos).toEqual([expect.objectContaining({ destino: 'calendario', origen: 'codigo', que: expect.stringMatching(/^D1 · /) })])
    })
  }
  it('sin cierre, la oficina no lee ninguno y D1 no dispara', () => {
    const f = fichaDeLaHoja(seccion(hoja(BASE, [fila({ id: 'p-1', oferta: 'brunch' })], []).texto_md, 'p-1'))
    expect(f.cierre).toBeUndefined()
    expect(chequeosExactos(f, '').hallazgos.filter((h) => h.que.startsWith('D1'))).toEqual([])
  })
})
