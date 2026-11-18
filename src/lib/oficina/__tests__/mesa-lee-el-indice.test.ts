/**
 * 18-nov · LA MESA LEE EL ÍNDICE DEL CEREBRO (firma de Emilio 16:53 Zúrich · contrato con CC-CEREBRO al pie de
 * `PROPUESTA-CC2-a-CC-CEREBRO-el-lado-de-la-mesa-indice-y-entrega.md`). US$ 0: el cerebro es simulado.
 * Fixture REAL: el texto de la hoja del reel de Olón (encargo 57101e2a, `- OFERTA: olon`, red Instagram) y su fila.
 * La respuesta del índice tiene la forma del contrato con fichas reales del caso: el horario 4f26e79b y la leyenda deb890b0 en la base
 * de Olón; feaa8639 marcada «otra oferta: guayaquil»; el número 9999 no existe → «no consta».
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { avanzarMesa } from '../mesa/orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, parteCon, jugar } from './mesa-arnes'
import type { PuertoDelCerebro, PuertoDelIndice } from '../puertos'
import type { EstadoMesa } from '../mesa/tipos'
import { fichaDeLaHoja } from '../sentido-contra-la-ficha'
import { registrarHerramienta } from '../mesa/herramienta'
import { pedidoDeAgente } from '../mesa/pedidos'
import { fichasEnTexto, leerEntrega, leerIndice, numerosPedidos, ofertaDeLaHoja, pedidoDelIndice, seccionDelCerebro, type PedidoDeFichas, type PedidoDelIndice } from '../mesa/indice-del-cerebro'

const HOJA = JSON.parse(fs.readFileSync(path.join(__dirname, '../__fixtures__/mesa-reel-olon-57101e2a-hoja-real.json'), 'utf8')) as {
  encargo_id: string; client_id: string; fila: { id: string; fecha: string; hora: string }; brief: { red: string; protagonista: string; texto: string }
}

const BASE_OLON = [
  'HECHO · horario de Olón (ref 4f26e79b): martes a domingo, 08:00 a 16:00.',
  'HECHO · la leyenda del náufrago (ref deb890b0): el local nació de la historia de un pescador que llegó a la playa de Olón.',
].join('\n')
const LISTA = [
  '1. horario de atención · Olón (ref 4f26e79b)',
  '2. la leyenda del náufrago (ref deb890b0)',
  '3. horario de atención · otra oferta: guayaquil (ref feaa8639)',
].join('\n')
const INDICE_OK = { ok: true as const, body: { estado: 'ok', base_de_la_pieza: BASE_OLON, fijo: 'NO DEBE LEERSE (hay base_de_la_pieza)', lista_texto: LISTA, huella: 'h-olon-1', consulta_id: 'c-1', lecturas: [] } }
const ENTREGA = (p: PedidoDeFichas) => ({
  ok: true as const,
  body: {
    entregas: p.numeros.flatMap((n): Array<Record<string, unknown>> => n === 1 ? [{ numero: 1, ref: '4f26e79b', contenido: 'Olón · martes a domingo · 08:00 a 16:00 · lunes cerrado', sede: 'olon', estado: 'vigente', vencido: false }]
      : n === 3 ? [{ numero: 3, ref: 'feaa8639', contenido: 'Guayaquil · lunes a domingo · 12:00 a 22:00', sede: 'guayaquil', marca: 'otra oferta: guayaquil', estado: 'vigente', vencido: false }]
      : [{ numero: n, estado: 'no_consta', motivo: 'ese número no está en el índice' }]),
    consulta_id: 'c-2',
  },
})

/** una mesa de pieza con el índice simulado (y, si se pide, también el portero de siempre, para ver que su pedido mezclado NO sale) */
async function abrir(o: { indice?: () => Awaited<ReturnType<PuertoDelIndice['indice']>>; conCerebro?: boolean; dry?: boolean } = {}) {
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA })
  M.P.mesa = crearMesaEnMemoria()
  const indices: PedidoDelIndice[] = [], entregas: PedidoDeFichas[] = [], mezclados: unknown[] = []
  M.P.indice = {
    indice: async (p) => { indices.push(p); return (o.indice ?? (() => INDICE_OK))() },
    entregar: async (p) => { entregas.push(p); return ENTREGA(p) },
  }
  if (o.conCerebro) {
    M.P.cerebro = {
      avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta',
      pedir: async (p) => { mezclados.push(p); return { ok: true, body: { estado: 'completo', costo_usd: 0, huecos: [] } } },
      leerPedido: async () => ({ ok: false, error: 'no se usa' }),
    } satisfies PuertoDelCerebro
  }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: o.dry ?? true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const est = () => M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
  return { M, a, id, est, indices, entregas, mezclados }
}

describe('el pedido del índice sale de la hoja REAL de la pieza (Olón, 57101e2a)', () => {
  it('oferta y sede = la línea OFERTA de la hoja; canal = la red; tema = el protagonista; la pieza con su fila', () => {
    const oferta = fichaDeLaHoja(HOJA.brief.texto).oferta
    expect(oferta).toBe('olon')
    const p = pedidoDelIndice({ client_id: HOJA.client_id, encargo_id: HOJA.encargo_id, fila: HOJA.fila, oferta, canal: HOJA.brief.red, tema: HOJA.brief.protagonista, agente: 'oficina-creativa' })
    expect(p).toEqual({
      cliente: HOJA.client_id, sede: 'olon', oferta: 'olon', canal: 'Instagram', tema: HOJA.brief.protagonista,
      pieza: { encargo_id: HOJA.encargo_id, fila: { id: 's4-d5-vie_reel_olon', hora: '09:00', fecha: '2026-11-27' } }, agente: 'oficina-creativa',
    })
  })
  it('«sin oferta en la fila · declarado» no es una sede: el pedido va sin sede (el cerebro avisa y todo cuenta como de la pieza)', () => {
    expect(ofertaDeLaHoja('sin oferta en la fila · declarado')).toBeUndefined()
    expect(ofertaDeLaHoja('  ')).toBeUndefined()
    const p = pedidoDelIndice({ client_id: 'c', encargo_id: 'e', oferta: 'sin oferta en la fila · declarado', canal: '', tema: null, agente: 'oficina-creativa' })
    expect(p).toEqual({ cliente: 'c', pieza: { encargo_id: 'e' }, agente: 'oficina-creativa' })
  })
})

describe('lo que la mesa guarda del índice', () => {
  it('base de la pieza (antes que lo fijo), índice, huella y consulta', () => {
    expect(leerIndice(INDICE_OK.body, 'olon')).toEqual({ base: BASE_OLON, lista_texto: LISTA, huella: 'h-olon-1', consulta_id: 'c-1', sede: 'olon' })
  })
  it('sin base_de_la_pieza lee lo fijo; con aviso lo guarda', () => {
    expect(leerIndice({ fijo: 'lo fijo', lista_texto: LISTA, huella: 'h', aviso: 'la pieza no dijo su sede' }, null)).toEqual({ base: 'lo fijo', lista_texto: LISTA, huella: 'h', sede: null, aviso: 'la pieza no dijo su sede' })
  })
  it('sin huella o sin lista no hay índice (no se podría pedir por número)', () => {
    expect(leerIndice({ lista_texto: LISTA }, null)).toBeNull()
    expect(leerIndice({ huella: 'h', lista_texto: '   ' }, null)).toBeNull()
    expect(leerIndice(null, null)).toBeNull()
  })
})

describe('la sección «Lo que sabemos del cliente» va ENTERA', () => {
  it('la base, el índice con su marca de otra oferta y cómo pedir por número, sin recorte', () => {
    const larga = BASE_OLON + '\n' + 'dato largo de la base · '.repeat(4000)
    const s = seccionDelCerebro({ base: larga, lista_texto: LISTA, huella: 'h', sede: 'olon' })
    expect(s).toContain('## Lo que sabemos del cliente')
    expect(s).toContain(larga.trim())
    expect(s).toContain('3. horario de atención · otra oferta: guayaquil (ref feaa8639)')
    expect(s).toContain('`pedir_fichas`')
    expect(s).toMatch(/no lo tomes como de esta pieza/)
    expect(s).not.toMatch(/recort|…\s*\(/)
  })
})

describe('al abrir una mesa de pieza: UNA lectura del índice y sin el pedido mezclado', () => {
  it('pide el índice una vez, lo guarda y el pedido mezclado al portero NO sale', async () => {
    const { M, id, est, indices, mezclados } = await abrir({ conCerebro: true, dry: false })
    expect(indices).toHaveLength(1)
    expect(indices[0]).toMatchObject({ cliente: CLIENTE, agente: 'oficina-creativa', pieza: { encargo_id: id } })
    expect(est().indice).toMatchObject({ huella: 'h-olon-1', base: BASE_OLON })
    expect(mezclados).toHaveLength(0)
    await avanzarMesa(M.P, M.encargos.get(id)!, M.plantilla!.plantilla as never, 0)
    expect(indices).toHaveLength(1)
  })
  it('cada turno de la mesa lee la sección con la base entera y la herramienta, y va sin empuje', async () => {
    const { M, id, a } = await abrir()
    const { turnos } = await jugar(M, id, a)
    expect(turnos.length).toBeGreaterThan(3)
    for (const t of turnos) {
      expect(t.task, t.paso).toContain('## Lo que sabemos del cliente')
      expect(t.task, t.paso).toContain(BASE_OLON)
      expect(t.task, t.paso).toContain('pedir_fichas(numeros, para_que)')
    }
    const pedido = (a.cuerpo.turno as { pedido: { extra: Record<string, unknown> } }).pedido
    expect(pedido.extra.sin_empuje).toBe(true)
  })
  it('si el índice falla, la mesa NO se frena: deja el motivo y abre con el pedido de siempre', async () => {
    const { est, mezclados, a } = await abrir({ indice: () => ({ ok: false, error: 'HTTP 503' }), conCerebro: true, dry: false })
    expect(est().indice).toBeUndefined()
    expect(est().marcas.indice_sin_respuesta).toBe('HTTP 503')
    expect(mezclados).toHaveLength(1)
    expect(a.status).toBeLessThan(500)
  })
  it('índice sin huella = como si fallara (motivo visible) y la mesa sigue', async () => {
    const { est } = await abrir({ indice: () => ({ ok: true, body: { lista_texto: LISTA } }) })
    expect(est().indice).toBeUndefined()
    expect(est().marcas.indice_sin_respuesta).toBe('el índice no trajo huella ni lista')
  })
  it('sin el puerto del índice todo sigue como antes: ni sección ni herramienta ni sin_empuje', async () => {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA })
    M.P.mesa = crearMesaEnMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const { turnos } = await jugar(M, String(a.cuerpo.encargo_id), a)
    for (const t of turnos) { expect(t.task).not.toContain('## Lo que sabemos del cliente'); expect(t.task).not.toContain('pedir_fichas') }
    expect((a.cuerpo.turno as { pedido: { extra: Record<string, unknown> } }).pedido.extra.sin_empuje).toBeUndefined()
  })
})

describe('pedir_fichas: los originales completos en el mismo turno', () => {
  const agenteDe = (a: { cuerpo: Record<string, unknown> }) => (a.cuerpo.turno as { agente: string }).agente
  it('el agente del turno pide 1, 3 y 9999: llegan el horario de Olón, el de Guayaquil marcado y «no consta»', async () => {
    const { M, a, id, entregas } = await abrir()
    const r = await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: agenteDe(a), numeros: [1, 3, 9999, 1], para_que: 'el horario del reel' })
    expect(r.status).toBe(200)
    expect(r.cuerpo.ok).toBe(true)
    expect(entregas).toHaveLength(1)
    expect(entregas[0]).toMatchObject({ cliente: CLIENTE, numeros: [1, 3, 9999], huella: 'h-olon-1', pieza: { encargo_id: id }, agente: agenteDe(a), para_que: 'el horario del reel' })
    const t = String(r.cuerpo.fichas)
    expect(t).toContain('Olón · martes a domingo · 08:00 a 16:00 · lunes cerrado')
    expect(t).toContain('### Número 3 · feaa8639 · otra oferta: guayaquil')
    expect(t).toMatch(/### Número 9999\nNo consta: ese número no está en el índice/)
  })
  it('no escribe el tablero', async () => {
    const { M, a, id } = await abrir()
    const antes = (await M.P.mesa!.libro(id)).length
    await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: agenteDe(a), numeros: [1] })
    expect((await M.P.mesa!.libro(id)).length).toBe(antes)
  })
  it('fuera de turno no entrega nada', async () => {
    const { M, id, entregas } = await abrir()
    const r = await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: 'otro-agente', numeros: [1] })
    expect(r.status).toBe(409)
    expect(entregas).toHaveLength(0)
  })
  it('sin números válidos, sin índice o con el cerebro caído: error legible, nunca éxito', async () => {
    const { M, a, id } = await abrir()
    const sin = await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: agenteDe(a), numeros: [0, -2, 'x'] })
    expect(sin.cuerpo).toMatchObject({ ok: false })
    M.P.indice = { indice: async () => INDICE_OK, entregar: async () => ({ ok: false, error: 'HTTP 500' }) }
    const caido = await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: agenteDe(a), numeros: [1] })
    expect(caido.cuerpo.ok).toBe(false)
    expect(String(caido.cuerpo.motivo)).toContain('HTTP 500')
    const f = await abrir({ indice: () => ({ ok: false, error: 'caído' }) })
    const sinIndice = await registrarHerramienta(f.M.P, { herramienta: 'pedir_fichas', encargo_id: f.id, de: agenteDe(f.a), numeros: [1] })
    expect(sinIndice.cuerpo.ok).toBe(false)
    expect(f.entregas).toHaveLength(0)
  })
})

describe('leer la entrega (puro)', () => {
  it('números: enteros positivos, sin repetir, en su orden', () => {
    expect(numerosPedidos([3, '12', 3, 0, -1, 1.5, 'a', ' 7 '])).toEqual([3, 12, 7])
    expect(numerosPedidos('3')).toEqual([])
  })
  it('lee también la forma de hoy (material[].texto + numeros_invalidos) y un número que no vuelve sale «no consta»', () => {
    const f = leerEntrega({ material: [{ numero: 2, ref: 'deb890b0', estado_de_lectura: 'ok', texto: 'la leyenda completa' }], numeros_invalidos: [9999] }, [2, 9999, 5])
    expect(f).toEqual([
      { numero: 2, estado: 'ok', contenido: 'la leyenda completa', ref: 'deb890b0' },
      { numero: 9999, estado: 'no_consta', motivo: 'el número no está en el índice' },
      { numero: 5, estado: 'no_consta', motivo: 'el cerebro no devolvió este número' },
    ])
    expect(fichasEnTexto(f)).toContain('### Número 5\nNo consta: el cerebro no devolvió este número. No lo des por sabido.')
  })
  it('el contenido va completo, sin recorte', () => {
    const largo = 'x'.repeat(200000)
    expect(fichasEnTexto(leerEntrega({ entregas: [{ numero: 1, contenido: largo, estado: 'vigente' }] }, [1]))).toContain(largo)
  })
})

describe('el pedido al corredor', () => {
  it('sin_empuje va en extra solo cuando se pide', () => {
    const base = { agente: 'a', task: 't', encargo_id: 'e', client_id: 'c', dry_run: true, paso: 'p', reserva_usd: 1 }
    expect((pedidoDeAgente({ ...base, sin_empuje: true }).extra as Record<string, unknown>).sin_empuje).toBe(true)
    expect((pedidoDeAgente(base).extra as Record<string, unknown>).sin_empuje).toBeUndefined()
  })
})
