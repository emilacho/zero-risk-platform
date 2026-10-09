/**
 * Afinando lo que las mutaciones dejaron vivo: cada prueba nace de una mutación que sobrevivía.
 */
import { describe, it, expect } from 'vitest'
import { nivelEfectivo, resolverDato, sumarDias, validarTodo, type Hallazgo, type InsumosCalendario, type PiezaAgente, type Referencia, type TandaAgente } from '../index'
import { clienteA, filasDe, formatosDeLaMigracion, piezaBuena, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'

const FORMATOS = formatosDeLaMigracion()
const c = clienteA()
const bueno = tandaBuena(c)

function insumos(cl: ClienteFixture, t: TandaAgente, extra: Partial<InsumosCalendario> = {}): InsumosCalendario {
  return {
    campana: cl.campana, estrategia: cl.estrategia, planTexto: cl.planTexto, formatos: FORMATOS, sedes: cl.sedes, referencias: cl.referencias,
    clientId: cl.clientId, ahora: cl.ahora, filas: filasDe(cl, t, FORMATOS), forbiddenWords: cl.forbiddenWords, conocidos: cl.conocidos, ...extra,
  }
}
const conPieza = (t: TandaAgente, semana: number, slot: string, cambios: Partial<PiezaAgente>): TandaAgente => ({
  ...t, piezas: t.piezas.map((p) => (p.semana === semana && p.slot === slot ? { ...p, ...cambios } : p)),
})
const val = (t: TandaAgente, extra: Partial<InsumosCalendario> = {}) => validarTodo(insumos(c, t, extra))
const dicen = (hs: Hallazgo[], chequeo: string, re: RegExp) => hs.some((h) => h.chequeo === chequeo && re.test(h.ficha.que))

describe('afinando lo que las mutaciones dejaron vivo', () => {
  it('V06: un día cerrado se dice como «cerrada ese día», no como una hora mal puesta', () => {
    expect(dicen(val(conPieza(bueno, 1, 'c', { dia_semana: 2, requiere_abierto: true, hora: '10:00' })), 'V06', /cerrada ese día/)).toBe(true)
  })
  it('V02: «foto o reel» se dice como «no es uno solo»', () => {
    expect(dicen(val(conPieza(bueno, 1, 'a', { formato: 'foto o reel' })), 'V02', /no es uno solo/)).toBe(true)
  })
  it('V05: una red excluida por el plan se dice como excluida', () => {
    expect(dicen(val(conPieza(bueno, 1, 'a', { red: 'tiktok', formato: 'video' })), 'V05', /excluida por el plan/)).toBe(true)
  })
  it('V04: una pieza fuera del rango de la campaña, con la fecha derivada correcta, se bloquea por el rango', () => {
    const t = { ...bueno, piezas: [...bueno.piezas, { ...piezaBuena(c, 1, 'a', 'x'), semana: 14, slot: 'z' }] }
    expect(dicen(val(t), 'V04', /fuera de la campaña/)).toBe(true)
  })
  it('V04: una fecha dentro del rango pero que no es la que deriva el código se bloquea', () => {
    const base = insumos(c, bueno)
    const filas = base.filas.map((f, i) => (i === 0 ? { ...f, fecha: sumarDias(f.fecha, 1) } : f))
    expect(dicen(validarTodo({ ...base, filas }), 'V04', /no es la que deriva el código/)).toBe(true)
  })
  it('V09: un pilar que se aleja más de 10 puntos de su meta bloquea', () => {
    const t = { ...bueno, piezas: bueno.piezas.map((p) => ({ ...p, pilar: 'menu' })) }
    expect(val(t).some((h) => h.chequeo === 'V09' && h.severidad === 'bloquea')).toBe(true)
  })
  it('V11: una dependencia a una fila posterior, a una inexistente o a un video que espera, bloquea', () => {
    const base = insumos(c, bueno)
    const [primera, ...resto] = base.filas
    const ultima = resto[resto.length - 1]
    expect(dicen(validarTodo({ ...base, filas: [{ ...primera, depende_de: [ultima.id] }, ...resto] }), 'V11', /no es anterior/)).toBe(true)
    expect(dicen(validarTodo({ ...base, filas: [{ ...primera, depende_de: ['no-existe'] }, ...resto] }), 'V11', /no existe/)).toBe(true)
    const video = { ...resto[0], estado: 'espera_video' as const, formato: 'reel' }
    const filas = [primera, video, ...resto.slice(1)].map((f, i) => (i === 3 ? { ...f, depende_de: [video.id] } : f))
    expect(dicen(validarTodo({ ...base, filas }), 'V11', /video que espera/)).toBe(true)
  })
  it('C02: dos valores del mismo nivel para un dato de riesgo alto bloquean la fila', () => {
    const a: Referencia = { id: 's1', client_id: c.clientId, origen: 'sede_datos', fuente: 'sitio', sede: 'centro', texto: 'abre a las 07:00' }
    const b: Referencia = { id: 's2', client_id: c.clientId, origen: 'sede_datos', fuente: 'sitio', sede: 'centro', texto: 'abre a las 08:00' }
    const dato = { dato: 'Horario', valor: '07:00', clase: 'alto' as const, ref: 's1', nivel: 'F2' as const, opcional: false }
    const hs = val(conPieza(bueno, 1, 'a', { tema: 'Abrimos a las 07:00', datos: [dato] }), {
      referencias: [...c.referencias, a, b],
      candidatosPorDato: { horario: [{ valor: '07:00', ref: a }, { valor: '08:00', ref: b }] },
    })
    expect(hs.some((h) => h.chequeo === 'C02' && h.severidad === 'bloquea')).toBe(true)
  })
  it('C01: el dato usa el valor de menor rango y gana el de mayor rango → bloquea', () => {
    const f0: Referencia = { id: 'f0', client_id: c.clientId, origen: 'ficha', firmada: true, vigente: true, texto: 'abre a las 07:00' }
    const mapas: Referencia = { id: 'mp', client_id: c.clientId, origen: 'sede_datos', fuente: 'mapas', sede: 'centro', texto: 'abre a las 08:00' }
    const dato = { dato: 'Horario', valor: '08:00', clase: 'alto' as const, ref: 'mp', nivel: 'F2' as const, opcional: false }
    const hs = val(conPieza(bueno, 1, 'a', { tema: 'Abrimos a las 08:00', datos: [dato] }), {
      referencias: [...c.referencias, f0, mapas],
      candidatosPorDato: { horario: [{ valor: '07:00', ref: f0 }, { valor: '08:00', ref: mapas }] },
    })
    expect(hs.some((h) => h.chequeo === 'C01' && h.severidad === 'bloquea')).toBe(true)
  })
  it('el manual es F1 y la ficha firmada es F0 (condición 4): el manual no tiene el rango máximo', () => {
    expect(nivelEfectivo({ id: 'm', client_id: 'c', origen: 'manual', texto: '' }).nivel).toBe('F1')
    expect(nivelEfectivo({ id: 'p', client_id: 'c', origen: 'plan', texto: '' }).nivel).toBe('F1')
    expect(nivelEfectivo({ id: 'f', client_id: 'c', origen: 'ficha', firmada: true, vigente: true, texto: '' }).nivel).toBe('F0')
    expect(nivelEfectivo({ id: 'f', client_id: 'c', origen: 'ficha', vigente: true, texto: '' }).nivel).toBe('F2')
    const manual: Referencia = { id: 'm', client_id: 'c', origen: 'manual', texto: 'abre a las 09:00' }
    const ficha: Referencia = { id: 'f', client_id: 'c', origen: 'ficha', firmada: true, vigente: true, texto: 'abre a las 07:00' }
    expect(resolverDato([{ valor: '09:00', ref: manual }, { valor: '07:00', ref: ficha }], 'alto', []).valor).toBe('07:00')
  })
  it('una pieza de video que no está en el patrón nace espera_video por la tabla de formatos', () => {
    const t = { ...bueno, piezas: [...bueno.piezas, { ...piezaBuena(c, 1, 'a', 'Un reel'), slot: 'r', dia_semana: 3, formato: 'reel', hora: '18:00' }] }
    const f = filasDe(c, t, FORMATOS).find((x) => x.id === 's1-d3-r')!
    expect(f.estado).toBe('espera_video')
    expect(f.origen).toBe('agente')
  })
})
