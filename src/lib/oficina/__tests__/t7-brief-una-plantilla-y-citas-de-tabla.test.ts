/**
 * T7 · 18-nov · DIAGNÓSTICO CC5 de los briefs devueltos · GO Lenovo (antes del reenvío).
 * (1) UNA sola plantilla del brief: la mesa recibía la referencia del marco Y la convención vieja de la oficina («## Mensaje», «por red: objetivo · llamado», sin «Público»);
 *     el brief salió dos veces con el formato viejo. Se prueba el CAMINO REAL: el texto que `armarTarea` le da a la dirección creativa en cada turno que escribe el brief,
 *     con el marco que arma la cadena (`marcoDelBrief`).
 * (2) Las citas de TABLA: el brief aplanaba la fila y le sumaba los nombres de las columnas. La referencia pide citar UNA celda; la celda tal cual pasa el chequeo de hoy.
 * (3) La devolución dice HASTA DÓNDE coincide una cita rota (solo texto: no agrega bloqueos).
 * Agnóstico al rubro: la tabla es de una tienda en línea inventada para la prueba.
 */
import { describe, expect, it } from 'vitest'
import { armarTarea, CONVENCION_DE_LA_PIEZA, type ContextoDeTurno, type TipoDeTurno } from '@/lib/oficina/mesa/pedidos'
import type { EstadoMesa } from '@/lib/oficina/mesa/tipos'
import { hastaDondeCoincide, leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO, REGLA_DE_LA_CITA_DE_TABLA, SECCIONES_DEL_BRIEF, TITULO_DE_LA_SECCION, TITULOS_DEL_BRIEF, TITULOS_OBLIGATORIOS_DEL_BRIEF } from '@/lib/cadena/brief-creativo'
import { marcoDelBrief } from '@/lib/cadena/mesas'
import { clienteA, contextoDe } from '@/lib/cadena/__fixtures__/clientes'

const est: EstadoMesa = { tipo: 'brief', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] }
const marco = marcoDelBrief({ ctx: contextoDe(clienteA()), estrategia: clienteA().estrategia, version: 1, devolucion: null, nota: null })
const c: ContextoDeTurno = { cliente_nombre: 'Cliente', tipo: 'brief', brief_id: 'brf-1', brief_texto: marco, manual_texto: 'manual', plan_texto: clienteA().planTexto, fotos: [], tope_usd: 10, gasto_usd: 0 }
const tarea = (tipo: TipoDeTurno) => armarTarea({ tipo, agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c, faltanCitas: 'A1' })
const TURNOS_QUE_ESCRIBEN: TipoDeTurno[] = ['dirigir', 'integrar', 'devolver_citas']

describe('(1) una sola plantilla del brief · lo que recibe la dirección creativa', () => {
  for (const t of TURNOS_QUE_ESCRIBEN) {
    it(`turno «${t}»: no pide «## Mensaje» ni un llamado por red`, () => {
      const x = tarea(t)
      expect(x).not.toMatch(/## Mensaje\b/)
      expect(x).not.toMatch(/objetivo · llamado/)
      expect(x).not.toMatch(/por red[^\n]*llamado/i)
      expect(x).not.toMatch(/UN mensaje/)
    })
  }
  it('la convención de la mesa nombra TODAS las secciones obligatorias con su título de la plantilla', () => {
    const conv = CONVENCION_DE_LA_PIEZA('brief')
    for (const k of TITULOS_OBLIGATORIOS_DEL_BRIEF) expect(conv).toContain(`## ${k}`)
    expect(conv).toContain('## Público')
    expect(conv).toContain('## Cómo sabremos que funcionó')
    expect(conv).toContain('## Lo único que hay que comunicar')
  })
  it('🟡 k5 (CC7): la línea «Obligatorias» nombra EXACTAMENTE las 8 del lector, no todas las secciones', () => {
    const linea = CONVENCION_DE_LA_PIEZA('brief').split('\n').find((l) => l.startsWith('Obligatorias: '))!
    const nombradas = linea.slice('Obligatorias: '.length).split('. ')[0].split(' · ')
    expect(nombradas).toEqual(['De qué parte del plan sale', 'Insight', 'Lo único que hay que comunicar', 'Público', 'Objetivo', 'Cómo sabremos que funcionó', 'Tono', 'Obligatorios'])
    expect(nombradas).not.toContain('Faltantes')
    expect(nombradas).not.toContain('Citas')
  })
  it('la convención sale de la MISMA fuente que el lector: cada sección del brief, una vez, con el título que pide la plantilla', () => {
    const conv = CONVENCION_DE_LA_PIEZA('brief')
    const pedidas = [...conv.matchAll(/^- ## (.+)$/gm)].map((m) => m[1].trim())
    expect(pedidas).toEqual(SECCIONES_DEL_BRIEF.map((k) => TITULO_DE_LA_SECCION[k] ?? k))
    expect(pedidas).toEqual([...TITULOS_DEL_BRIEF])
  })
  it('la convención remite a la referencia del marco, que la dirección tiene en su tarea', () => {
    expect(CONVENCION_DE_LA_PIEZA('brief')).toContain('«El brief creativo de campaña»')
    expect(tarea('integrar')).toContain('# El brief creativo de campaña')
  })
})

const PLAN = [
  '# Plan de la tienda',
  'Probamos dos ángulos por tanda.',
  '',
  '| Tanda | Ángulo A | Ángulo B |',
  '|---|---|---|',
  '| 1 (sem 1-2) | Envío en 24 horas a todo el país | Cambios sin costo durante 30 días |',
  '| 2 (sem 3-4, si no hay ganador) | Variante del ganador | Reseñas de compradores verificados |',
  '',
  'El público son personas que compran ropa en línea por primera vez y temen no poder devolverla.',
].join('\n')
const brief = (rutas: string[], publico = 'Personas que compran ropa en línea por primera vez.') => [
  '## De qué parte del plan sale', '«Probamos dos ángulos por tanda.»',
  '## Público', publico,
  '## Insight', 'Comprar sin probarse da miedo.',
  '## Lo único que hay que comunicar', 'Si no te queda, lo cambias sin costo.',
  '## Rutas vivas del plan', ...rutas,
  '## Objetivo', 'Las ventas que pide el plan.',
  '## Cómo sabremos que funcionó', 'Los indicadores del plan, cada semana.',
  '## Tono', 'Cercano y claro.',
  '## Obligatorios', '- vocabulario: cambio', '- prohibido: garantizado', '- lo que no se dice: nada',
  '## Faltantes', '- ninguno: nada',
  '## Citas', 'A1 usé: el plan',
].join('\n')
const ins = { planTexto: PLAN, prohibidas: ['garantizado'] }
const deCitas = (b: string[]) => b.filter((x) => /no está literal en el/.test(x))

describe('(2) las citas de tabla: una celda tal cual', () => {
  it('la referencia del brief lleva la regla de la tabla', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain(REGLA_DE_LA_CITA_DE_TABLA)
    expect(REGLA_DE_LA_CITA_DE_TABLA).toMatch(/UNA celda tal cual/)
    expect(REGLA_DE_LA_CITA_DE_TABLA).toMatch(/fila y la columna se nombran FUERA de la cita/)
  })
  it('la celda citada sola, con la fila y la columna fuera de la cita, PASA el chequeo de hoy', () => {
    const l = leerBriefCreativo(brief(['Tanda 1, ángulo A:', '> «Envío en 24 horas a todo el país»', '', 'Tanda 1, ángulo B:', '> «Cambios sin costo durante 30 días»']), ins)
    expect(deCitas(l.bloqueos)).toEqual([])
  })
  it('la fila aplanada con los nombres de las columnas dentro de la cita NO pasa (lo que pasó en T7)', () => {
    const l = leerBriefCreativo(brief(['> «Tanda 1 (sem 1-2) · Ángulo A: Envío en 24 horas a todo el país · Ángulo B: Cambios sin costo durante 30 días»']), ins)
    expect(deCitas(l.bloqueos)).toHaveLength(1)
  })
})

describe('(3) la devolución dice hasta dónde coincide la cita', () => {
  it('una cita que cambia una palabra: la devolución nombra las últimas palabras que sí coinciden', () => {
    const l = leerBriefCreativo(brief(['Tanda 1, ángulo A:', '> «Envío en 24 horas a todo el país»'], '> «El público son personas que compran ropa en línea por primera vez y temen no poder cambiarla.»'), ins)
    const d = deCitas(l.bloqueos)
    expect(d).toHaveLength(1)
    expect(d[0]).toContain('coincide con el plan hasta «…primera vez y temen no poder» y desde ahí cambia')
    expect(d[0]).toContain('una cita nunca se corrige')
  })
  it('una cita inventada desde la primera palabra lo dice', () => {
    const l = leerBriefCreativo(brief(['> «Zapatillas importadas con descuento permanente»']), ins)
    expect(deCitas(l.bloqueos)[0]).toContain('ni su comienzo está en el plan')
  })
  it('es solo texto: la cita literal no lleva pista, y la cantidad de bloqueos no cambia', () => {
    expect(hastaDondeCoincide(PLAN, 'Envío en 24 horas a todo el país')).toBeNull()
    const roto = leerBriefCreativo(brief(['> «Envío en 48 horas a todo el país»']), ins)
    expect(roto.bloqueos.filter((x) => /no está literal/.test(x))).toHaveLength(1)
    expect(hastaDondeCoincide(PLAN, 'Envío en 48 horas a todo el país')).toBe('Envío en')
  })
  it('con una elisión, la pista es del tramo que se rompe', () => {
    expect(hastaDondeCoincide(PLAN, 'Probamos dos ángulos por tanda … personas que compran zapatos')).toBe('personas que compran')
  })
  it('🟡 k4 (CC7): una cita del MANUAL rota a la mitad recibe la pista contra el manual, no contra el plan', () => {
    const manual = 'Hablamos siempre de tú y con calma, como un vecino que te ayuda.'
    const md = brief(['> «Envío en 24 horas a todo el país»']).replace('## Tono\nCercano y claro.', '## Tono\nEl manual dice: «Hablamos siempre de tú y con prisa, como un vecino que te ayuda.»')
    const d = deCitas(leerBriefCreativo(md, { ...ins, manualTexto: manual }).bloqueos)
    expect(d).toHaveLength(1)
    expect(d[0]).toContain('no está literal en el manual')
    expect(d[0]).toContain('coincide con el manual hasta «…Hablamos siempre de tú y con» y desde ahí cambia')
  })
  it('🟡 k6 (CC7): la pista lee el documento con el MISMO lector que el chequeo (plan guardado como JSON, con comillas y saltos escritos)', () => {
    const planJson = JSON.stringify({ resumen: 'Plan de la tienda.', publico: 'El comprador dice "quiero probármela" y teme no poder devolverla.' })
    const cita = 'El comprador dice "quiero probármela" y teme no poder cambiarla'
    expect(hastaDondeCoincide(planJson, cita)).toBe('"quiero probármela" y teme no poder')
    const md = brief(['> «Envío en 24 horas a todo el país»'], `> «${cita}.»`)
    const d = deCitas(leerBriefCreativo(md, { ...ins, planTexto: planJson }).bloqueos)
    expect(d.some((x) => x.includes('coincide con el plan hasta «…"quiero probármela" y teme no poder»'))).toBe(true)
  })
  it('🟡 k6 (CC7): con negritas en el plan, la pista da las palabras de antes del corte', () => {
    const plan = 'El comprador **teme no poder devolverla** si no le queda.'
    expect(hastaDondeCoincide(plan, 'El comprador teme no poder cambiarla si no le queda')).toBe('El comprador teme no poder')
  })
})
