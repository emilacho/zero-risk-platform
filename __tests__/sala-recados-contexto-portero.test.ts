/**
 * C · lo que el portero VE de la sala: los destinos activos y los recados abiertos del cliente (solo lectura), y que la ruta `razonar` lo lleva cableado.
 * El portero NO abre recados: el contexto solo LEE (el almacén que se le da aquí falla si alguien intenta escribir).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAXIMO_DE_RECADOS_QUE_VE_EL_PORTERO, contextoParaElPortero } from '../src/lib/sala-recados/contexto-portero'
import type { Almacen, Destino, Recado } from '../src/lib/sala-recados/puerta'

const DESTINOS: Destino[] = [
  { destino: 'apify', tipo: 'herramienta', flujo_que_reparte: null, plazo_minutos: 30, estado_del_brazo: 'opera', activo: true },
  { destino: 'video', tipo: 'herramienta', flujo_que_reparte: null, plazo_minutos: 60, estado_del_brazo: 'por_configurar', activo: true },
  { destino: 'dueno', tipo: 'persona', flujo_que_reparte: null, plazo_minutos: 60, estado_del_brazo: 'opera', activo: false },
]
const recado = (id: number, c: string, extra: Partial<Recado> = {}): Recado => ({ id, client_id: c, clave_de_agrupacion: 'k' + id, que_falta: 'falta ' + id, para_el_trabajo: {}, bloquea: false, pedido_original: null, destino: 'apify', razon_del_destino: null, estado: 'abierto', plazo_en: null, avisado_en: null, retomado_en: null, creado_en: null, cerrado_en: null, ficha_ids: null, prueba: false, ...extra })

/** un almacén que SOLO deja leer: cualquier escritura es un error de la prueba */
function soloLectura(filas: Recado[], fallar = false): { almacen: Almacen; lecturas: string[] } {
  const lecturas: string[] = []
  const noEscribe = async (): Promise<never> => { throw new Error('el portero NO escribe recados') }
  return {
    lecturas,
    almacen: {
      listarDestinos: async () => { lecturas.push('destinos'); if (fallar) throw new Error('base caída'); return DESTINOS },
      abiertosDe: async (c, p) => { lecturas.push('abiertos'); return filas.filter((f) => f.client_id === c && f.prueba === p && (f.estado === 'abierto' || f.estado === 'repartido')) },
      leerDestino: noEscribe, buscarAbierto: noEscribe, buscarNoConseguidoReciente: noEscribe, contarAbiertos: noEscribe, leerPorId: noEscribe, insertar: noEscribe, cerrar: noEscribe,
    },
  }
}

describe('contextoParaElPortero', () => {
  it('ofrece los destinos ACTIVOS con su estado real (el dueño apagado no sale) y los recados abiertos del cliente con su número', async () => {
    const { almacen, lecturas } = soloLectura([recado(7, 'c1'), recado(8, 'c2'), recado(9, 'c1', { estado: 'cumplido' }), recado(10, 'c1', { prueba: true }), recado(11, 'c1', { estado: 'repartido', destino: 'video' })])
    const c = await contextoParaElPortero(almacen, 'c1')
    expect(c.destinos).toEqual([{ destino: 'apify', tipo: 'herramienta', estado_del_brazo: 'opera' }, { destino: 'video', tipo: 'herramienta', estado_del_brazo: 'por_configurar' }])
    expect(c.abiertos).toEqual([{ numero: 7, que_falta: 'falta 7', destino: 'apify' }, { numero: 11, que_falta: 'falta 11', destino: 'video' }])
    expect(lecturas.sort()).toEqual(['abiertos', 'destinos']) // solo leyó
  })
  it('un cliente sin recados: destinos sí, abiertos vacíos', async () => {
    const c = await contextoParaElPortero(soloLectura([recado(1, 'otro')]).almacen, 'c1')
    expect(c.abiertos).toEqual([])
    expect(c.destinos).toHaveLength(2)
  })
  it(`no le muestra al portero más de ${MAXIMO_DE_RECADOS_QUE_VE_EL_PORTERO} recados`, async () => {
    const c = await contextoParaElPortero(soloLectura(Array.from({ length: 80 }, (_x, i) => recado(i + 1, 'c1', { clave_de_agrupacion: 'k' + i }))).almacen, 'c1')
    expect(c.abiertos).toHaveLength(MAXIMO_DE_RECADOS_QUE_VE_EL_PORTERO)
  })
  it('si la base falla, falla (quien lo llama —razonar— lo atrapa y sigue sin contexto; aquí no se disfraza de «vacío»)', async () => {
    await expect(contextoParaElPortero(soloLectura([], true).almacen, 'c1')).rejects.toThrow('base caída')
  })
})

describe('la ruta `razonar` lleva el contexto cableado y solo de lectura', () => {
  const ruta = fs.readFileSync(path.join(process.cwd(), 'src/app/api/brain/portero/razonar/route.ts'), 'utf8')
  it('pasa `leerRecados` con el contexto del almacén de la sala', () => {
    expect(ruta).toMatch(/leerRecados:\s*\(cliente\)\s*=>\s*contextoParaElPortero\(almacenDeSupabase\(\), cliente\)/)
  })
  it('ni la ruta ni el contexto abren, cierran ni escriben recados (ni siquiera nombran esas acciones)', () => {
    const contexto = fs.readFileSync(path.join(process.cwd(), 'src/lib/sala-recados/contexto-portero.ts'), 'utf8')
    for (const t of [ruta, contexto]) expect(t).not.toMatch(/\.insertar\(|\.cerrar\(|procesarRecado|accion:\s*['"]abrir/)
    const razonar = fs.readFileSync(path.join(process.cwd(), 'src/lib/cerebro/portero/razonar.ts'), 'utf8')
    expect(razonar).not.toMatch(/sala-recados|insertar|procesarRecado/)
  })
})
