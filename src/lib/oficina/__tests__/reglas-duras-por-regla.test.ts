/**
 * REVISIÓN 2 · cada regla dura de la lista firmada (DECISION-EMILIO 17-nov) sale del CÓDIGO de su regla con `dura: true` y, si sigue abierta al cierre, FRENA.
 * Su contraparte: la misma regla cuando no se puede verificar (o lo de criterio) NO es dura y al cierre es una observación declarada.
 * Agnóstico: las listas y los límites llegan como dato del cliente (dos rubros).
 */
import { describe, expect, it } from 'vitest'
import { chequeosDePost, type ContextoDeChequeo } from '../chequeos'
import { chequeosDeEntrega, manifiesto } from '../entrega'
import { chequeosDeLaminas, type ContextoDeChequeoLaminas } from '../laminas'
import { fichasAlCierre } from '../reglas-duras'
import { fichaNueva } from '../ayudas'
import type { Ficha } from '../tipos'
import { FORMATO_1X1 } from './memoria'

const FUENTES = { palabras_prohibidas: [], palabras_duras: [], telefonos: ['0997744288'], handles: ['@cevicheria'], precios: ['7.00'], competidores: [], moneda: 'USD', registro: 'tuteo', telefonos_verificables: true, handles_verificables: true }
const post = (pie: string, o: Partial<ContextoDeChequeo> = {}): Ficha[] => chequeosDePost({ pieza: { pie_de_foto: pie, hashtags: [], llamado: null }, fuentes: FUENTES, limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: true }, ...o } as unknown as ContextoDeChequeo)
const frena = (fs: Ficha[]) => fichasAlCierre({ fichas: fs.map((f) => ({ ...f, estado: 'abierta' as const })) })

const CASOS: Array<[string, () => Ficha[], RegExp]> = [
  ['1 · voseo con manual en tuteo', () => post('Pedilo hoy, está buenísimo'), /voseo/],
  ['2 · teléfono ajeno con lista verificable', () => post('Escríbenos al 0991112233'), /teléfono/],
  ['2 · usuario @ ajeno con lista verificable', () => post('Síguenos en @otracuenta'), /usuario @otracuenta/],
  ['3 · precio en otra moneda', () => post('Hoy a 7.00 EUR'), /otra moneda/],
  ['3 · precio fuera de la lista', () => post('Hoy a $9.99'), /no está en la lista/],
  ['4 · hashtags sobre el límite verificado', () => post('Hoy', { pieza: { pie_de_foto: 'Hoy', hashtags: ['#a', '#b', '#c'], llamado: null }, limites: { pie_de_foto_max: 2200, hashtags_max: 2, limites_verificados: true } } as never), /hashtags/],
  ['4 · largo sobre el límite verificado', () => post('x'.repeat(50), { limites: { pie_de_foto_max: 10, hashtags_max: 30, limites_verificados: true } } as never), /caracteres/],
  ['5 · imagen generada sin declarar', () => post('Hoy', { imagen: { generada: true, declarada_en_bandeja: false } }), /generada/],
  ['6 · sin fila del formato', () => chequeosDeEntrega([], null, { pie_de_foto: '', hashtags: [] }, manifiesto([], {})), /especificación técnica/],
  ['6 · cantidad de archivos', () => chequeosDeEntrega([], FORMATO_1X1, { pie_de_foto: '', hashtags: [] }, manifiesto([], {})), /archivo/],
  ['7 · lámina fuera de contrato', () => laminas({ problemas_de_contrato: ['3 láminas; el contrato pide de 4 a 6'] }), /contrato pide/],
  ['7 · kit incompleto', () => laminas({ familia: 'kit', problemas_de_kit: ['falta la historia del martes'] }), /martes/],
  ['7 · imagen sin lámina', () => laminas({ imagenes_sin_lamina: ['hook'] }), /ninguna lámina la usa/],
]
function laminas(o: Partial<ContextoDeChequeoLaminas>): Ficha[] {
  return chequeosDeLaminas({
    familia: 'carrusel', fuentes: { ...FUENTES, registro: 'sin_dato', telefonos_verificables: false, handles_verificables: false, precios: [] },
    limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false }, prohibidas_del_brief: [],
    texto_del_autor: { texto: 'Hoy', hashtags: [] }, textos_de_laminas: ['Hoy'], fuentes_de_cifras: [],
    fonts_faltantes: [], imagenes_sin_lamina: [], fotos_reusadas: [], problemas_de_contrato: [], texto_fuera_del_autor: [], problemas_de_armado: [], problemas_de_kit: [], ...o,
  } as unknown as ContextoDeChequeoLaminas)
}

describe('revisión 2 · cada regla dura de la lista frena al cierre', () => {
  it.each(CASOS)('regla %s: la ficha sale dura del código de la regla y, abierta al cierre, FRENA', (_n, hacer, que) => {
    const fs = hacer().filter((f) => que.test(f.que ?? ''))
    expect(fs.length).toBeGreaterThan(0)
    for (const f of fs) expect(f).toMatchObject({ gravedad: 'bloquea', dura: true })
    expect(frena(fs).frenan).toHaveLength(fs.length)
    expect(frena(fs).observaciones).toEqual([])
  })
})

describe('revisión 2 · lo que NO es de la lista no frena: es observación declarada', () => {
  it('la misma regla sin poder verificarse (lista no leída, límite sin verificar, registro sin dato) no es dura', () => {
    const fs = [
      ...post('Escríbenos al 0991112233', { fuentes: { ...FUENTES, telefonos_verificables: false } } as never),
      ...post('Pedilo hoy', { fuentes: { ...FUENTES, registro: 'sin_dato' } } as never),
      ...post('x'.repeat(50), { limites: { pie_de_foto_max: 10, hashtags_max: 30, limites_verificados: false } } as never),
    ]
    expect(fs.length).toBeGreaterThan(0)
    for (const f of fs) expect(f.dura).toBeUndefined()
    expect(frena(fs).frenan).toEqual([])
  })
  it('una ficha de un agente (jefe, segunda mirada, cualquiera) que dice «bloquea» es criterio: observación, aunque cite una regla', () => {
    const jefe = fichaNueva('jefe-1-0', 'jefe', 'texto', 'bloquea', 'el precio no está en la lista (regla 3)', 'revisión')
    const externa = fichaNueva('ext-1', 'externa', 'imagen', 'bloquea', 'no me gusta la luz', 'opinión')
    const c = frena([jefe, externa])
    expect(c.frenan).toEqual([])
    expect(c.en_la_cadena).toEqual([])
    expect(c.observaciones).toHaveLength(2)
  })
  it('lo duro devuelto a la cadena no frena aquí (lo frena el receptor): queda «en la cadena»', () => {
    const dev = { ...fichaNueva('sentido-4-0', 'jefe', 'calendario', 'bloquea', 'sentido · calendario: D1 · cerrada', 'ficha'), dura: true as const }
    const c = frena([dev])
    expect(c.en_la_cadena).toHaveLength(1)
    expect(c.frenan).toEqual([])
  })
  it('una ficha ya tomada no cuenta', () => {
    const [f] = post('Hoy a $9.99')
    expect(fichasAlCierre({ fichas: [{ ...f, estado: 'tomada' }] }).frenan).toEqual([])
  })
})
