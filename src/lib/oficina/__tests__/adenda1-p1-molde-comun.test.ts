/**
 * 19-nov · ADENDA 1 · P1 · el molde común del pedido de la mesa (CC5 · GO Lenovo 05:17Z · firma de Emilio, Lenovo 15:32Z):
 *   (b) los documentos arriba, cada uno en `<documento fuente="…">`; la instrucción y las notas del dueño al final
 *   (c) copiar textual el alcance (zona, canal, público, oferta) antes de escribir
 *   (d) qué se conserva tal cual
 *   (e) el cierre reescribe el objetivo, DETRÁS de las notas del dueño
 * Sin red, sin modelo, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { ALCANCE_COPIADO, LO_QUE_SE_CONSERVA, antesDeEscribir, armarTarea, cierreConElObjetivo, documento, type TipoDeTurno } from '../mesa/pedidos'
import type { EstadoMesa, TipoDePieza } from '../mesa/tipos'

const est = (tipo: TipoDePieza): EstadoMesa => ({ tipo, directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: false } as unknown as EstadoMesa)
const BRIEF_DE_PIEZA = '## S4-ig-01\n- OBJETIVO: que pidan el desayuno por el canal directo\n- TEMA DE LA FILA: la mañana · pilar: producto'
const c = (tipo: TipoDePieza, brief_texto = BRIEF_DE_PIEZA) => ({ cliente_nombre: 'Cliente', tipo, brief_id: 'S4-ig-01', brief_texto, manual_texto: 'EL-MANUAL', plan_texto: 'EL-PLAN', fotos: [], tope_usd: 5, gasto_usd: 0 })
const tarea = (tipo: TipoDeTurno, pieza: TipoDePieza = 'carrusel') => armarTarea({ tipo, agente: 'creative-director-mesa', tarjeta: undefined, est: est(pieza), libro: [], c: c(pieza) })

describe('ADENDA 1 · P1 · (b) los documentos van arriba, cada uno con su fuente', () => {
  it('🔴 el manual, el brief y el plan van en <documento fuente="…">, antes del turno', () => {
    const t = tarea('dirigir')
    for (const [fuente, texto] of [['el manual de marca', 'EL-MANUAL'], ['el brief de este entregable', BRIEF_DE_PIEZA], ['el plan de trabajo', 'EL-PLAN']]) {
      expect(t, fuente).toContain(documento(fuente, texto))
      expect(t.indexOf(`<documento fuente="${fuente}">`), fuente).toBeLessThan(t.indexOf('## Tu turno'))
    }
  })
  it('el brief y la gran idea nombran su documento por lo que es', () => {
    expect(armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est: est('brief'), libro: [], c: c('brief', 'MARCO') })).toContain(documento('el marco de la campaña', 'MARCO'))
    expect(armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est: est('concepto'), libro: [], c: c('concepto', 'BRIEF') })).toContain(documento('el brief de la campaña', 'BRIEF'))
  })
})

describe('ADENDA 1 · P1 · (c) y (d) antes de escribir: el alcance copiado y lo que se conserva', () => {
  it.each(['dirigir', 'aportar', 'responder'] as const)('🔴 %s (escribe en el tablero): abre con «Alcance (copiado):» de zona, canal, público y oferta, y conserva', (tipo) => {
    const t = tarea(tipo)
    const antes = t.slice(t.indexOf('## Antes de escribir'), t.indexOf('## Tu turno'))
    expect(antes).toContain(`**«${ALCANCE_COPIADO}»**`)
    for (const k of ['**zona**', '**canal**', '**público**', '**oferta**', 'TEXTUAL', '«no lo dicen»']) expect(antes, k).toContain(k)
    expect(antes).toContain(LO_QUE_SE_CONSERVA)
  })
  it.each(['integrar', 'rellenar_banco', 'redactar_prompts', 'criticar'] as const)('🔴 %s (entrega algo que el código lee): conserva y revisa contra el alcance, SIN agregar el bloque a la salida', (tipo) => {
    const a = antesDeEscribir(tipo)
    expect(a).toContain(LO_QUE_SE_CONSERVA)
    expect(a).toContain('No agregues ese bloque a tu entrega')
    expect(a).not.toContain('Empieza tu respuesta')
  })
  it('la devolución de citas no lleva molde (solo escribe líneas de cita que el código pega)', () => {
    expect(antesDeEscribir('devolver_citas')).toBe('')
    expect(cierreConElObjetivo(c('carrusel'), 'devolver_citas')).toBe('')
  })
  it('lo que se conserva nombra los datos vitales y que un pendiente no se afirma', () => {
    for (const k of ['cifras', 'precios', 'horarios', 'direcciones', 'sedes', 'nombres propios', 'lo prohibido del manual', 'pendiente nunca se afirma']) expect(LO_QUE_SE_CONSERVA, k).toContain(k)
  })
})

describe('ADENDA 1 · P1 · (e) el cierre reescribe el objetivo', () => {
  it('🔴 pieza: el objetivo de la hoja, citado', () => {
    expect(cierreConElObjetivo(c('carrusel'), 'integrar')).toBe('\n\n## Lo que importa\nEl objetivo: que esta pieza logre su objetivo: «que pidan el desayuno por el canal directo». Todo lo que escribas en este turno sirve a eso.')
  })
  it('pieza sin OBJETIVO en la hoja: pide declararlo, no lo inventa', () => {
    expect(cierreConElObjetivo(c('video', '## S1\n- TEMA DE LA FILA: x'), 'aportar')).toContain('el brief no lo declara: decláralo tú y dilo')
  })
  it('brief y gran idea: su objetivo propio', () => {
    expect(cierreConElObjetivo(c('brief'), 'dirigir')).toContain('UN solo mensaje')
    expect(cierreConElObjetivo(c('concepto'), 'integrar')).toContain('una gran idea que sirva a todo el plan')
  })
  it('reubicación, fallidos y banco tienen su propio armador: sin este cierre', () => {
    for (const t of ['reubicacion', 'fallidos', 'banco'] as const) expect(cierreConElObjetivo(c(t), 'integrar'), t).toBe('')
  })
})
