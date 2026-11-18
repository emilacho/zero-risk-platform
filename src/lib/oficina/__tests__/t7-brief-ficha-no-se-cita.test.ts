/**
 * T7 · segundo intento · 18-nov · GO Lenovo (opción 1) tras el brief v2 de la campaña devuelto por una cita de la FICHA de la oferta.
 * (1) Lo que sale de la ficha NUNCA va dentro de `> «…»`: va solo en «Hechos de las ofertas», con «(fuente: …)». La ficha puede resumir el plan, así que un valor suyo
 *     dentro de una cita nunca es literal del plan. El chequeo NO cambia: se prueba que la regla llega a la dirección creativa por el CAMINO REAL (`armarTarea` con el marco
 *     de `marcoDelBrief`) y que el chequeo de hoy aprueba el brief que la sigue y devuelve el que no.
 * (2) La (b): de una LISTA se cita UN punto (el brief v1 unió cuatro viñetas con «. »).
 * Agnóstico al rubro: el plan y la ficha son de una tienda en línea inventada para la prueba.
 */
import { describe, expect, it } from 'vitest'
import { armarTarea, type ContextoDeTurno, type TipoDeTurno } from '@/lib/oficina/mesa/pedidos'
import type { EstadoMesa } from '@/lib/oficina/mesa/tipos'
import { leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO, REGLA_DE_LA_CITA_DE_LISTA, REGLA_DE_LOS_HECHOS_DE_LA_FICHA } from '@/lib/cadena/brief-creativo'
import { marcoDelBrief } from '@/lib/cadena/mesas'
import { clienteA, contextoDe } from '@/lib/cadena/__fixtures__/clientes'

const est: EstadoMesa = { tipo: 'brief', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] }
const marco = marcoDelBrief({ ctx: contextoDe(clienteA()), estrategia: clienteA().estrategia, version: 1, devolucion: null, nota: null })
const c: ContextoDeTurno = { cliente_nombre: 'Cliente', tipo: 'brief', brief_id: 'brf-1', brief_texto: marco, manual_texto: 'manual', plan_texto: clienteA().planTexto, fotos: [], tope_usd: 10, gasto_usd: 0 }
const tarea = (tipo: TipoDeTurno) => armarTarea({ tipo, agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c, faltanCitas: 'A1' })

describe('las reglas llegan a la dirección creativa (camino real)', () => {
  for (const t of ['dirigir', 'integrar', 'devolver_citas'] as TipoDeTurno[]) {
    it(`turno «${t}»: la tarea lleva la regla de la ficha y la de la lista`, () => {
      const x = tarea(t)
      expect(x).toContain(REGLA_DE_LOS_HECHOS_DE_LA_FICHA)
      expect(x).toContain(REGLA_DE_LA_CITA_DE_LISTA)
    })
  }
  it('la referencia las lleva una vez cada una, y lo que dice cada regla', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO.split(REGLA_DE_LOS_HECHOS_DE_LA_FICHA)).toHaveLength(2)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO.split(REGLA_DE_LA_CITA_DE_LISTA)).toHaveLength(2)
    expect(REGLA_DE_LOS_HECHOS_DE_LA_FICHA).toMatch(/NUNCA va dentro de una cita, aunque su fuente sea el plan/)
    expect(REGLA_DE_LOS_HECHOS_DE_LA_FICHA).toMatch(/va solo en «Hechos de las ofertas», en su línea con «\(fuente: …\)»/)
    expect(REGLA_DE_LA_CITA_DE_LISTA).toMatch(/cita UN punto por `> «…»`/)
  })
  it('la sección «Hechos de las ofertas» dice que sus líneas nunca van dentro de una cita', () => {
    const linea = REFERENCIA_DEL_BRIEF_CREATIVO.split('\n').find((l) => l.startsWith('## Hechos de las ofertas'))!
    expect(linea).toContain('nunca dentro de una cita `> «…»` (la ficha no es el plan)')
  })
  it('lo que NO va en el brief ya no dice que los datos de la ficha llegan «citados»', () => {
    const linea = REFERENCIA_DEL_BRIEF_CREATIVO.split('\n').find((l) => l.startsWith('Lo que NO va en el brief'))!
    expect(linea).not.toMatch(/citados de la ficha/)
    expect(linea).toContain('copiados de la ficha de cada oferta, con su fuente')
  })
})

const PLAN = [
  '# Plan de la tienda',
  'Probamos dos ángulos por tanda.',
  '| Semana | Acción | Responsable |',
  '|---|---|---|',
  '| Pauta tienda semana 2 | Agencia — $40, formato video, envío rápido |',
  '**Los indicadores adelantados:**',
  '- Pedidos entregados atribuibles a pauta — semanal',
  '- Devoluciones por talla — semanal',
  'El público son personas que compran ropa en línea por primera vez y temen no poder devolverla.',
].join('\n')
// el valor de la ficha RESUME el plan (su fuente es el plan, pero no es literal)
const VALOR_DE_LA_FICHA = 'Pauta liviana, videos de envío rápido y cambios fáciles'
const brief = (rutas: string[], hechos: string[], comoSabremos: string[] = ['Los indicadores del plan, cada semana.']) => [
  '## De qué parte del plan sale', '«Probamos dos ángulos por tanda.»',
  '## Público', 'Personas que compran ropa en línea por primera vez.',
  '## Insight', 'Comprar sin probarse da miedo.',
  '## Lo único que hay que comunicar', 'Si no te queda, lo cambias sin costo.',
  '## Rutas vivas del plan', ...rutas,
  '## Hechos de las ofertas', ...hechos,
  '## Objetivo', 'Las ventas que pide el plan.',
  '## Cómo sabremos que funcionó', ...comoSabremos,
  '## Tono', 'Cercano y claro.',
  '## Obligatorios', '- vocabulario: cambio', '- prohibido: garantizado', '- lo que no se dice: nada',
  '## Faltantes', '- ninguno: nada',
  '## Citas', 'A1 usé: el plan',
].join('\n')
const ins = { planTexto: PLAN, prohibidas: ['garantizado'] }
const deCitas = (b: string[]) => b.filter((x) => /no está literal en el/.test(x))

describe('(1) lo de la ficha, nunca en una cita · el chequeo de hoy', () => {
  it('el brief que pone el valor de la ficha en `> «…»` se devuelve (lo que pasó en la v2)', () => {
    const l = leerBriefCreativo(brief([`> «${VALOR_DE_LA_FICHA}» (ficha de la oferta, objetivo)`], ['- Tienda · objetivo: lo de la ficha (fuente: plan)']), ins)
    expect(deCitas(l.bloqueos)).toHaveLength(1)
    expect(deCitas(l.bloqueos)[0]).toContain(VALOR_DE_LA_FICHA.slice(0, 40))
  })
  it('el brief que sigue la regla (el valor en «Hechos de las ofertas» con su fuente, y la ruta nombrada fuera de la cita) NO se devuelve por citas', () => {
    const l = leerBriefCreativo(brief(['Semana 2 (ruta de la ficha, ver «Hechos de las ofertas»).'], [`- Tienda · objetivo de la semana 2: ${VALOR_DE_LA_FICHA} (fuente: plan)`]), ins)
    expect(deCitas(l.bloqueos)).toEqual([])
  })
})

describe('(2) de una lista se cita UN punto · el chequeo de hoy', () => {
  it('dos viñetas unidas con «. » en una cita se devuelven (lo que pasó en la v1)', () => {
    const l = leerBriefCreativo(brief(['Semana 2.'], ['- sin ficha de la oferta'], ['> «Pedidos entregados atribuibles a pauta — semanal. Devoluciones por talla — semanal»']), ins)
    expect(deCitas(l.bloqueos)).toHaveLength(1)
  })
  it('un punto por cita pasa', () => {
    const l = leerBriefCreativo(brief(['Semana 2.'], ['- sin ficha de la oferta'], ['> «Pedidos entregados atribuibles a pauta — semanal»', '', '> «Devoluciones por talla — semanal»']), ins)
    expect(deCitas(l.bloqueos)).toEqual([])
  })
})
