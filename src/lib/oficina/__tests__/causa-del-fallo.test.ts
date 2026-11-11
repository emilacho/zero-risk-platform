/**
 * 11-nov · GO Lenovo (decisión de Emilio 15:24) · reel de Olón (encargo 6d3e9086): cerró `fallido` con US$ 2,40 tras 16 pasos y la fila no decía por qué (turnos con `error` nulo).
 * La causa real solo estaba en la alarma de Slack de las 02:44:44Z: «el brazo de video no aceptó el pedido: no pude leer las tarifas de la descripción» (el proveedor cambió su
 * texto de tarifas a «por segundo»; lo arregló #1026). Aquí se prueba el punto 3 del GO: TODO cierre `fallido` guarda su causa legible en `estado_del_motor.fallo`.
 * Dos clientes de rubros distintos: un restaurante (reel de Instagram) y una empresa B2B de seguridad industrial (short de YouTube). Sin red, a US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { causaDelFallo, conCausaDelFallo, MAX_MOTIVO, MOTIVO_SIN_DECLARAR, motivoLegible } from '../causa-del-fallo'
import { fallar } from '../orquestador'
import type { Encargo } from '../puertos'
import { estadoInicial, type Estado } from '../tipos'
import { crearMemoria } from './memoria'

// el motivo LITERAL de la alarma del 11-nov 02:44:44Z (#alertas) y el estado real del encargo al fallar (lectura de la base, solo lectura)
const MOTIVO_OLON = 'el brazo de video no aceptó el pedido: no pude leer las tarifas de la descripción'
const estadoOlon = (): Estado => ({ ...estadoInicial(), ultimo: 2, pasos_ejecutados: 16, gasto_usd: 2.398932, vueltas: { 'material:hecho': 1 } })

const CLIENTES: Array<[string, { client: string; brief: string; familia: string }]> = [
  ['restaurante (reel de Instagram)', { client: 'cli-restaurante', brief: 's1-d6-sab_reel_olon', familia: 'video_mesa' }],
  ['B2B de seguridad industrial (short de YouTube)', { client: 'cli-seguridad', brief: 'F1-S1-yt-s1', familia: 'video_mesa' }],
]

function encargoEn(M: ReturnType<typeof crearMemoria>, o: { id: string; client: string; brief: string; familia: string; estado: Estado; version?: number; sala_ref?: Record<string, unknown> | null }): Encargo {
  const enc: Encargo = {
    id: o.id, client_id: o.client, parte_id: 'parte-1', brief_id: o.brief, tipo_de_grupo: 'video', familia: o.familia, version_encargo: o.version ?? 1, estado: 'en_paso',
    estado_del_motor: o.estado, con_desacuerdo: false, imagen_generada: false, tope_usd: 10, gasto_usd: o.estado.gasto_usd, dry_run: false, prueba: false,
    sala_ref: o.sala_ref ?? null, salida_output_id: null, hitl_queue_id: null,
  }
  M.encargos.set(enc.id, JSON.parse(JSON.stringify(enc)))
  return enc
}

describe('la causa del fallo · pura', () => {
  const ahora = new Date('2026-11-11T02:44:44Z')
  it('🔴 guarda el motivo, la hora, los pasos y el gasto al fallar', () => {
    expect(conCausaDelFallo(estadoOlon(), MOTIVO_OLON, ahora).fallo).toEqual({ motivo: MOTIVO_OLON, en: '2026-11-11T02:44:44.000Z', pasos_ejecutados: 16, gasto_usd: 2.398932 })
  })
  it('🔴 un motivo vacío o que no es texto queda declarado como «sin motivo» (nunca un fallido mudo)', () => {
    for (const m of ['', '   ', null, undefined, 42, '\n\t']) expect(conCausaDelFallo(estadoInicial(), m, ahora).fallo?.motivo).toBe(MOTIVO_SIN_DECLARAR)
  })
  it('🔴 limpia caracteres de control y espacios repetidos; recorta a MAX_MOTIVO', () => {
    expect(motivoLegible('lo que dijo el proveedor:\n«New\tpricing»\u0000  ')).toBe('lo que dijo el proveedor: «New pricing»')
    const largo = motivoLegible('x'.repeat(MAX_MOTIVO + 500))
    expect(largo).toHaveLength(MAX_MOTIVO)
  })
  it('🔴 la PRIMERA causa gana: un segundo fallar no la pisa', () => {
    const una = conCausaDelFallo(estadoOlon(), MOTIVO_OLON, ahora)
    const dos = conCausaDelFallo(una, 'otro motivo después', new Date('2026-11-11T03:00:00Z'))
    expect(dos.fallo).toEqual(una.fallo)
  })
  it('no toca el resto del estado', () => {
    const e = estadoOlon()
    const { fallo, ...resto } = conCausaDelFallo(e, MOTIVO_OLON, ahora)
    expect(fallo).toBeDefined()
    expect(resto).toEqual(e)
  })
  it('🔴 el lector: null para los fallidos viejos sin causa o con basura; la causa para los nuevos', () => {
    expect(causaDelFallo(estadoOlon())).toBeNull()
    expect(causaDelFallo(null)).toBeNull()
    expect(causaDelFallo({ fallo: { motivo: '' } })).toBeNull()
    expect(causaDelFallo({ fallo: 'texto suelto' })).toBeNull()
    expect(causaDelFallo({ fallo: { motivo: 'algo', pasos_ejecutados: '3' } })).toEqual({ motivo: 'algo', en: '', pasos_ejecutados: 3, gasto_usd: 0 })
  })
})

describe.each(CLIENTES)('%s · `fallar` deja la causa en el encargo, no solo en el aviso', (_n, C) => {
  it('🔴 el caso de Olón: fallido al final (16 pasos, US$ 2,40) con la causa del brazo guardada en la fila', async () => {
    const M = crearMemoria()
    const enc = encargoEn(M, { id: `enc-${C.client}`, client: C.client, brief: C.brief, familia: C.familia, estado: estadoOlon() })
    const r = await fallar(M.P, enc, MOTIVO_OLON)
    expect(r.cuerpo).toMatchObject({ estado: 'fallido', motivo: MOTIVO_OLON })
    const fila = M.encargos.get(enc.id)!
    expect(fila.estado).toBe('fallido')
    expect(fila.gasto_usd).toBe(2.398932)
    expect(causaDelFallo(fila.estado_del_motor)).toEqual({ motivo: MOTIVO_OLON, en: M.P.ahora().toISOString(), pasos_ejecutados: 16, gasto_usd: 2.398932 })
    // la alarma sigue saliendo igual (una por incidente)
    expect(M.llamadas.avisos.filter((a) => a.texto.includes(MOTIVO_OLON))).toHaveLength(1)
  })
  it('🔴 el que muere al abrir (US$ 0, paso 0) también guarda su causa', async () => {
    const M = crearMemoria()
    const enc = encargoEn(M, { id: `enc0-${C.client}`, client: C.client, brief: C.brief, familia: C.familia, estado: estadoInicial() })
    await fallar(M.P, enc, 'no se pudieron leer las fuentes del cliente: timeout')
    expect(causaDelFallo(M.encargos.get(enc.id)!.estado_del_motor)).toMatchObject({ motivo: 'no se pudieron leer las fuentes del cliente: timeout', pasos_ejecutados: 0, gasto_usd: 0 })
  })
  it('🔴 una versión reabierta (v2) que vuelve a fallar guarda SU causa (el aviso va al hilo)', async () => {
    const M = crearMemoria()
    const enc = encargoEn(M, { id: `enc2-${C.client}`, client: C.client, brief: C.brief, familia: C.familia, estado: estadoOlon(), version: 2 })
    await fallar(M.P, enc, 'el brazo de video no entregó (failed): nsfw')
    expect(causaDelFallo(M.encargos.get(enc.id)!.estado_del_motor)?.motivo).toBe('el brazo de video no entregó (failed): nsfw')
  })
})

describe('las mesas de la cadena que fallan también guardan su causa', () => {
  for (const familia of ['brief_mesa', 'concepto_mesa', 'reubicacion_mesa']) {
    it(`🔴 ${familia}: la fila queda fallida con la causa (aunque la cadena no reciba la entrega)`, async () => {
      const M = crearMemoria()
      const enc = encargoEn(M, { id: `enc-${familia}`, client: 'cli-seguridad', brief: 'brief-cadena', familia, estado: { ...estadoInicial(), pasos_ejecutados: 4, gasto_usd: 0.8 }, sala_ref: { tipo_de_mesa: familia.replace('_mesa', ''), campana_id: 'camp-1', version: 1 } })
      await fallar(M.P, enc, 'el paso «mesa» murió dos veces (sin vuelta en 15 min)')
      const fila = M.encargos.get(enc.id)!
      expect(fila.estado).toBe('fallido')
      expect(causaDelFallo(fila.estado_del_motor)).toMatchObject({ motivo: 'el paso «mesa» murió dos veces (sin vuelta en 15 min)', pasos_ejecutados: 4, gasto_usd: 0.8 })
    })
  }
})
