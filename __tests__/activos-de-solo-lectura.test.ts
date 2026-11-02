/**
 * Punto 2 del encargo «errores del plan», firma de Emilio (01-nov): lo que el dueño declaró que no toca la agencia no se propone editar; se propone como pedido a él. Dos clientes. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { activoDeSoloLectura, controlarActivosDeSoloLectura } from '../src/lib/planeacion/coherencia-del-plan'
import { abrirRevision, fichasDeLoNegado } from '../src/lib/jefatura/revision/orquestador'
import { puertosDePrueba, sobre } from './_helpers/jefatura-revision'

const WEB = { tema: 'solo lectura · sitio web', frases_negadas: [] }
const FICHA = { tema: 'Solo lectura: ficha de Google', frases_negadas: [] }

describe('leer el activo', () => {
  it('sale del tema; otro tema no es un activo', () => {
    expect(activoDeSoloLectura('solo lectura · sitio web')).toBe('sitio web')
    expect(activoDeSoloLectura('Solo lectura: ficha de Google')).toBe('ficha de Google')
    expect(activoDeSoloLectura('origen del marisco')).toBeNull()
    expect(activoDeSoloLectura('solo lectura · ')).toBeNull()
  })
})

describe('🔴 proponer tocarlo se marca', () => {
  const VARIOS = { tema: 'solo lectura · sitio web, sitio, mi-negocio.com', frases_negadas: [] }
  it('las frases REALES del plan: un activo tiene varios nombres, y basta uno', () => {
    expect(controlarActivosDeSoloLectura('Instalar píxel de Meta en mi-negocio.com.', [VARIOS])).toHaveLength(1)
    expect(controlarActivosDeSoloLectura('Corregir la discrepancia de horario entre el sitio (07:00-15:00) y el Instagram (08:00-16:00).', [VARIOS])).toHaveLength(1)
  })
  it('🔴 palabra entera (hueco 1 de CC3): «web» no es «website» ni «webinar», con la palabra sí', () => {
    const W = [{ tema: 'solo lectura · web' }]
    expect(controlarActivosDeSoloLectura('Actualizar el website de la competencia.', W)).toEqual([])
    expect(controlarActivosDeSoloLectura('Editar el webinar del mes.', W)).toEqual([])
    expect(controlarActivosDeSoloLectura('Actualizar la web.', W)).toHaveLength(1)
  })
  it('un nombre de menos de 3 letras no cuenta (hueco 2 de CC3): si no, casi todo coincidiría', () => {
    expect(controlarActivosDeSoloLectura('Editar el de la casa.', [{ tema: 'solo lectura · de' }])).toEqual([])
  })
  it('verbos en inglés y otro separador del tema (hueco 3 de CC3)', () => {
    expect(controlarActivosDeSoloLectura('Update the store page.', [{ tema: 'Solo lectura - store page' }])).toHaveLength(1)
    expect(activoDeSoloLectura('solo lectura – tienda')).toBe('tienda')
  })
  it('marca cada frase, hasta tres', () => {
    expect(controlarActivosDeSoloLectura('Editar el sitio. Corregir el sitio. Cambiar el sitio. Actualizar el sitio.', [VARIOS])).toHaveLength(3)
  })
  it('un nombre es palabra entera y completo: «sitio» no es «propósito» ni «sitios», y «sitio web» pide las dos', () => {
    expect(controlarActivosDeSoloLectura('Cambiar los sitios de reparto.', [{ tema: 'solo lectura · sitio' }])).toEqual([])
    expect(controlarActivosDeSoloLectura('Cambiar el sitio de reparto.', [WEB])).toEqual([])
  })
  it('el caso real y otro cliente', () => {
    expect(controlarActivosDeSoloLectura('Semana 1: actualizar el horario en el sitio web.', [WEB])).toEqual([expect.objectContaining({ estado: 'no_cuadra', que: expect.stringMatching(/propone tocar «sitio web»[^]*pedido al dueño/) })])
    expect(controlarActivosDeSoloLectura('Paso 2: editar la ficha de Google con fotos nuevas.', [FICHA])).toHaveLength(1)
  })
  it('sin tildes ni mayúsculas, y dentro de una tabla', () => {
    expect(controlarActivosDeSoloLectura('| 1 | INSTALAR el píxel en el SITIO WEB | x |', [WEB])).toHaveLength(1)
  })
})

describe('🔴 lo que no se marca', () => {
  it('proponerlo como pedido al dueño', () => {
    expect(controlarActivosDeSoloLectura('Pedirle al dueño actualizar el horario en el sitio web.', [WEB])).toEqual([])
    expect(controlarActivosDeSoloLectura('Sugerir al cliente corregir el sitio web.', [WEB])).toEqual([])
    expect(controlarActivosDeSoloLectura('El dueño decide si cambiar el sitio web.', [WEB])).toEqual([])
  })
  it('mencionarlo sin proponer tocarlo, o decir que no se toca', () => {
    expect(controlarActivosDeSoloLectura('Los pedidos llegan por el sitio web.', [WEB])).toEqual([])
    expect(controlarActivosDeSoloLectura('El sitio web no se toca: no se cambia nada.', [WEB])).toEqual([])
  })
  it('una acción y el activo en frases distintas no se juntan', () => {
    expect(controlarActivosDeSoloLectura('Actualizar el calendario. El sitio web sigue igual.', [WEB])).toEqual([])
  })
  it('sin el hecho declarado no hay control: no todo cliente lo pide', () => {
    expect(controlarActivosDeSoloLectura('Actualizar el sitio web.', [{ tema: 'otra cosa' }])).toEqual([])
  })
})

describe('🔴 entra al ciclo', () => {
  it('es ficha que bloquea y dice cómo corregirlo', () => {
    expect(fichasDeLoNegado('Actualizar el sitio web.', [WEB])[0]).toMatchObject({ gravedad: 'bloquea', origen: 'jefe', propuesta: expect.stringMatching(/pedido al dueño/) })
  })
  it('al abrir la revisión queda guardada', async () => {
    const { P } = puertosDePrueba()
    P.hechosDelDueno = async () => [WEB]
    const r = await abrirRevision(P, sobre('plan', { texto: 'Actualizar el horario en el sitio web.' }))
    const rev = await P.almacen.leerRevision(String(r.cuerpo.revision_id))
    expect(rev!.estado_del_motor.fichas.some((f) => /propone tocar/.test(f.que ?? ''))).toBe(true)
  })
})
