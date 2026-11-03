/** R6 (provisional viaja), la puerta final (S5), la evidencia del juez (D1) y el pedido a GPT ciego (D3). Cliente sintético. Sin modelo. */
import { describe, expect, it } from 'vitest'
import { aplicarMeta, armarPedidoDelManual, camposFirmes, evaluarHechos, evidenciaParaElJuez, fuentesDeRaspado, metaDeCampos, ordenarMateria, preguntaDelManual, recomprobar, restituirPendientes } from '..'
import { F, filaInstagram, filaSitio, PROPIOS } from './apoyo'

const propio = (id: string, t: string) => F(id, 'primaria_propia', t)
const sintesis = (id: string, t: string) => F(id, 'sintesis', t, 'otro')
const MANUAL = {
  positioning: 'Una clínica cálida y cercana, con implantes certificados y atención todos los días.',
  voice_description: 'Voz cálida y juguetona. Tutea siempre.',
  mision: 'Cuidar sonrisas, con trazabilidad verificable de cada material.',
  tagline: null,
}

describe('la puerta final · 03-nov, decisión de Emilio: no toca el texto', () => {
  const fuentes = [propio('s', 'Hacemos implantes certificados con cita previa. Hola. Somos los mejores del barrio.')]
  it('una marca sin respaldo se queda en el texto; nada queda como retirado', () => {
    const r = recomprobar({}, MANUAL, { fuentes })
    expect(r.manual.mision).toBe(MANUAL.mision)
    expect(r.retirados).toEqual([]); expect(r.cambios).toEqual([])
    expect(JSON.stringify(r.manual)).not.toContain('PENDIENTE')
    expect(r.manual.voice_description).toBe(MANUAL.voice_description)
  })
  it('lo que el cliente dice de sí mismo tampoco se reescribe como «el cliente dice»', () => {
    const m = { positioning: 'Somos los mejores del barrio.' }
    const r = recomprobar({}, m, { fuentes })
    expect(r.manual.positioning).toBe(m.positioning)
    expect(r.informe.hechos[0].estado).toBe('afirmacion_del_cliente')
  })
  it('una afirmación `con_duda` NO se borra (tiene respaldo): queda marcada provisional para que decida una persona', () => {
    const m = { positioning: 'El producto viene de Playa Azul.' }
    const fs = [propio('s', 'Traemos el producto de Playa Azul cada mañana.')]
    const inf = evaluarHechos({ manual: m, fuentes: fs, dudas: [{ origen: 'ICP', frase: 'No sé si el producto viene de Playa Azul', terminos: ['producto', 'viene', 'playa', 'azul'] }] })
    expect(inf.hechos[0].estado).toBe('con_duda')
    expect(metaDeCampos(m, inf).positioning).toMatchObject({ estado: 'con_pendientes', provisional: true, pendientes: 1 })
  })
})

describe('R6 · «provisional» viaja a TODOS los campos y a todos los lectores', () => {
  it('`_field_meta` queda en TODOS los campos de texto (también `positioning`), con su estado', () => {
    const inf = evaluarHechos({ manual: MANUAL, fuentes: [propio('s', 'Hacemos implantes certificados y atención todos los días con cita previa.')] })
    const m = aplicarMeta(MANUAL, inf)
    expect(Object.keys(m._field_meta as object).sort()).toEqual(['mision', 'positioning', 'voice_description'])
    expect((m._field_meta as Record<string, unknown>).voice_description).toMatchObject({ estado: 'sin_hechos', provisional: false })
    // 03-nov · una palabra de certeza sin respaldo ya no deja el campo provisional ni se lee como verificado
    expect((m._field_meta as Record<string, unknown>).mision).toMatchObject({ estado: 'sin_hechos', provisional: false })
    expect((m._field_meta as Record<string, unknown>).positioning).toMatchObject({ estado: 'afirmacion_del_cliente', provisional: false })
  })
  it('una cifra sin fuente sí deja el campo provisional', () => {
    const c = { precio: 'Cuesta $45 la consulta.' }
    expect(metaDeCampos(c, evaluarHechos({ manual: c, fuentes: [] })).precio).toMatchObject({ estado: 'con_pendientes', provisional: true, pendientes: 1 })
  })
  it('conserva lo que el campo ya traía en _field_meta y pisa solo el estado', () => {
    const m = aplicarMeta({ ...MANUAL, _field_meta: { mision: { fuente: 'Discovery', provisional: true, gateado: false } } }, evaluarHechos({ manual: MANUAL, fuentes: [] }))
    expect((m._field_meta as Record<string, Record<string, unknown>>).mision).toMatchObject({ fuente: 'Discovery', gateado: false, estado: 'sin_hechos', provisional: false })
  })
  it('`camposFirmes`: firmes, provisionales (F2 con aviso) y sin revisar (manual anterior al ciclo: ni se firma ni se condena); un PENDIENTE en el texto basta', () => {
    const r = camposFirmes({
      a: 'texto a', b: 'texto b', c: 'texto c', d: 'Algo. PENDIENTE: dato sin fuente (45)', e: 'texto e',
      _field_meta: { a: { estado: 'verificado', provisional: false }, b: { estado: 'con_pendientes', provisional: true }, d: { estado: 'verificado', provisional: false }, e: { provisional: true, gateado: false } },
    })
    expect(r).toEqual({ firmes: ['a'], provisionales: ['b', 'd', 'e'], sin_revisar: ['c'] })
  })
})

describe('S5 · recomprobar lo que devolvió el autor', () => {
  const fuentes = [propio('s', 'Hacemos implantes certificados con cita previa.')]
  const antes = { positioning: 'Clínica cercana. PENDIENTE: afirmación sin fuente («trazabilidad»)', mision: 'Cuidar sonrisas.' }
  it('si el autor mete un hecho sin cita, se queda en el texto y se dice qué metió', () => {
    const despues = { positioning: 'Clínica cercana. PENDIENTE: afirmación sin fuente («trazabilidad»)', mision: 'Cuidar sonrisas, con garantía total de resultados.' }
    const r = recomprobar(antes, despues, { fuentes })
    expect(r.limpio).toBe(false)
    expect(r.introducidos.map((h) => h.clausula)).toEqual(['con garantía total de resultados'])
    expect(r.manual.mision).toBe(despues.mision)
    expect(r.retirados).toEqual([])
  })
  it('un PENDIENTE heredado de una versión vieja no se restituye: la puerta no escribe marcas', () => {
    const despues = { positioning: 'Clínica cercana.', mision: 'Cuidar sonrisas.' }
    const r = recomprobar(antes, despues, { fuentes })
    expect(r.manual.positioning).toBe('Clínica cercana.'); expect(r.retirados).toEqual([])
    expect(restituirPendientes(antes, despues).manual.mision).toBe('Cuidar sonrisas.')
  })
  it('si el autor devuelve algo limpio y con respaldo, la puerta no cambia nada y el resultado trae `_field_meta` de todos los campos', () => {
    const despues = { positioning: 'Clínica cercana. PENDIENTE: afirmación sin fuente («trazabilidad»)', mision: 'Cuidar sonrisas con implantes certificados con cita previa.' }
    const r = recomprobar(antes, despues, { fuentes })
    expect(r.limpio).toBe(true); expect(r.cambios.filter((c) => c.por === 'retirada')).toEqual([])
    expect(Object.keys(r.manual._field_meta as object).sort()).toEqual(['mision', 'positioning'])
  })
})

describe('D1 · el juez de fidelidad recibe SOLO fuente cruda (R4 aplicada al juez)', () => {
  const fuentes = [propio('p', 'Texto propio del cliente.'), F('h', 'humana', 'Dato firmado por la dueña.', 'alta', 'dato'), sintesis('x', 'Resumen escrito por un modelo.'), F('t', 'tercero', 'Texto de un competidor.')]
  it('excluye síntesis y terceros (y dice cuáles excluyó); incluye propia y humana', () => {
    const e = evidenciaParaElJuez(fuentes)
    expect(e.texto).toContain('Texto propio del cliente.'); expect(e.texto).toContain('Dato firmado por la dueña.')
    expect(e.texto).not.toContain('Resumen escrito por un modelo.'); expect(e.texto).not.toContain('competidor')
    expect(e.fuentes_usadas).toEqual(['p', 'h'])
    expect(e.excluidas).toEqual([{ id: 'x', tipo: 'sintesis' }, { id: 't', tipo: 'tercero' }])
  })
  it('un tope que corta una fuente lo dice dentro del texto', () => {
    const e = evidenciaParaElJuez([propio('p', 'a'.repeat(2000)), propio('q', 'b'.repeat(2000))], 1000)
    expect(e.recortada).toBe(true); expect(e.texto).toMatch(/\[bloque recortado: se leyeron \d+ de \d+ caracteres\]/)
  })
})

describe('D3 · el pedido a GPT ciego usa la MISMA pregunta que la oficina; ciego por construcción', () => {
  const materia = ordenarMateria(fuentesDeRaspado([filaSitio('s', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo', text: 'Atendemos con cita previa.' }]), filaInstagram('i', 'clinicaejemplo', 'Sonríe sin miedo')], PROPIOS))
  it('la pregunta del manual sale de los cuatro huecos y trae la misma indicación que la de una pieza', () => {
    const q = preguntaDelManual()
    expect(q.startsWith('Te comparto el manual de marca de un negocio, que se usa para guiar todo lo que se produzca para ese negocio, apunta a ')).toBe(true)
    expect(q).toContain('Sé concreto y apóyate en lo que ves; distingue lo que observas de lo que supones sobre el público.')
    expect(q).not.toMatch(/\{|\}/)
    expect(preguntaDelManual({ publico: 'familias', objetivo: 'más citas' })).toContain('apunta a familias y busca más citas')
  })
  it('orden: pregunta → el manual completo → el material crudo rotulado por bloque y función; sin reglas ni hallazgos', () => {
    const p = armarPedidoDelManual({ manualEnLimpio: 'MANUAL EN LIMPIO', materia })
    const pos = ['## El manual de marca', '## Material crudo de las páginas y redes propias'].map((x) => p.texto.indexOf(x))
    expect(pos[0]).toBeGreaterThan(0); expect(pos[0]).toBeLessThan(pos[1])
    expect(p.texto).toContain('### Título y descripción del sitio propio — lo que el cliente publicó de sí mismo')
    expect(p.texto).toContain('Atendemos con cita previa.'); expect(p.texto).toContain('Sonríe sin miedo')
    expect(p.texto).not.toMatch(/sin_cita|solo_sintesis|PENDIENTE:|gravedad|rúbrica|fichas|puntaje|fidelidad/)
    expect(p.imagenes).toEqual([])
    expect(armarPedidoDelManual.length).toBe(1) // solo recibe lo que se le pasa: no hay por dónde colar el estado del ciclo
  })
  it('si hay bloques recortados, el pedido lo dice', () => {
    const grande = ordenarMateria(fuentesDeRaspado([filaSitio('s', [{ url: 'https://www.clinicaejemplo.test/x', text: 'a '.repeat(5000) }])], PROPIOS))
    expect(armarPedidoDelManual({ manualEnLimpio: 'M', materia: grande }).texto).toMatch(/Algunos bloques están recortados \(otras_paginas: 3000 de \d+ caracteres\)/)
  })
})
