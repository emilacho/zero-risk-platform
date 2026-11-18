/**
 * 18-nov · LA MESA LEE EL ÍNDICE DEL CEREBRO, SIN CASILLAS (firma de Emilio 16:53 Zúrich + corrección 19:19 Zúrich · contrato con CC-CEREBRO de
 * 18:34Z al pie de `PROPUESTA-CC2-a-CC-CEREBRO-el-lado-de-la-mesa-indice-y-entrega.md`). US$ 0: el cerebro es simulado.
 * Fixture REAL: el texto de la hoja del reel de Olón (encargo 57101e2a) y su fila. La respuesta del índice tiene la forma del contrato con fichas
 * reales del caso: el horario de Olón 4f26e79b, la leyenda deb890b0 (dato del dueño, sin sede) y el horario de Guayaquil feaa8639, que llega
 * COMO DATO (sede guayaquil), sin filtro ni marca; el número 9999 no existe → «no consta».
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
import { registrarHerramienta } from '../mesa/herramienta'
import { pedidoDeAgente } from '../mesa/pedidos'
import { baseEnTexto, fichasEnTexto, hojaDeLaPieza, leerEntrega, leerIndice, numerosPedidos, pedidoDelIndice, piezaParaElCerebro, seccionDelCerebro, type PedidoDeFichas, type PedidoDelIndice } from '../mesa/indice-del-cerebro'

const HOJA = JSON.parse(fs.readFileSync(path.join(__dirname, '../__fixtures__/mesa-reel-olon-57101e2a-hoja-real.json'), 'utf8')) as {
  encargo_id: string; client_id: string; fila: { id: string; fecha: string; hora: string }; brief: { red: string; protagonista: string; texto: string }
}

/** las casillas que Emilio sacó del contrato: si alguna llega al cerebro, responde 400 */
const CASILLAS = ['sede', 'oferta', 'tema', 'canal', 'para_que']

const BASE_COMPLETA = [
  { numero: null, ref: 'manual-v3', sede: null, fecha_fuente: '2026-11-01', fuente: 'manual', texto: 'Manual de marca vigente: voz cálida, costeña.' },
  { numero: 1, ref: '4f26e79b', sede: 'olon', fecha_fuente: '2026-10-20', fuente: 'ficha_del_cliente', texto: 'Olón · martes a domingo · 08:00 a 16:00 · lunes cerrado' },
  { numero: 2, ref: 'deb890b0', sede: null, fecha_fuente: '2026-09-02', fuente: 'dato_del_dueno', texto: 'La leyenda del náufrago: un pescador que llegó a la playa de Olón.' },
  { numero: 3, ref: 'feaa8639', sede: 'guayaquil', fecha_fuente: '2026-10-20', fuente: 'ficha_del_cliente', texto: 'Guayaquil · lunes a domingo · 12:00 a 22:00' },
]
const LISTA = [
  '1. horario de atención (ref 4f26e79b) · sede olon · fuente ficha_del_cliente',
  '2. la leyenda del náufrago (ref deb890b0) · sin sede · fuente dato_del_dueno',
  '3. horario de atención (ref feaa8639) · sede guayaquil · fuente ficha_del_cliente',
].join('\n')
const INDICE_OK = { ok: true as const, body: { estado: 'ok', base_completa: BASE_COMPLETA, fijo: 'NO DEBE LEERSE (hay base_completa)', lista_texto: LISTA, huella: 'h-olon-1', consulta_id: 'c-1', rastro: {} } }
const ENTREGA = (p: PedidoDeFichas) => ({
  ok: true as const,
  body: {
    entregas: p.numeros.map((n): Record<string, unknown> => n === 1 ? { numero: 1, ref: '4f26e79b', contenido: 'Olón · martes a domingo · 08:00 a 16:00 · lunes cerrado', sede: 'olon', fecha_fuente: '2026-10-20', fuente: 'ficha_del_cliente', estado: 'vigente', vencido: false }
      : n === 3 ? { numero: 3, ref: 'feaa8639', contenido: 'Guayaquil · lunes a domingo · 12:00 a 22:00', sede: 'guayaquil', fecha_fuente: '2026-10-20', fuente: 'ficha_del_cliente', estado: 'vigente', vencido: false }
      : { numero: n, estado: 'no_consta', motivo: 'ese número no está en el índice' }),
    consulta_id: 'c-2',
  },
})

/** una mesa de pieza con el índice simulado (y, si se pide, también el portero de siempre, para ver que su pedido mezclado NO sale) */
async function abrir(o: { indice?: () => Awaited<ReturnType<PuertoDelIndice['indice']>>; entregar?: (p: PedidoDeFichas) => Awaited<ReturnType<PuertoDelIndice['entregar']>>; conCerebro?: boolean; dry?: boolean } = {}) {
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA })
  M.P.mesa = crearMesaEnMemoria()
  const indices: PedidoDelIndice[] = [], entregas: PedidoDeFichas[] = [], mezclados: unknown[] = []
  M.P.indice = {
    indice: async (p) => { indices.push(p); return (o.indice ?? (() => INDICE_OK))() },
    entregar: async (p) => { entregas.push(p); return (o.entregar ?? ENTREGA)(p) },
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

describe('la pieza manda su HOJA completa, sin casillas (hoja REAL de Olón, 57101e2a)', () => {
  it('la hoja va entera (brief + plan) y el pedido no trae sede, oferta, tema, canal ni para_que', () => {
    const pieza = piezaParaElCerebro({ encargo_id: HOJA.encargo_id, fila: HOJA.fila, brief_texto: HOJA.brief.texto, plan_texto: 'El plan de la campaña: semana 4.' })
    const p = pedidoDelIndice({ client_id: HOJA.client_id, agente: 'oficina-creativa', pieza })
    expect(p).toEqual({ cliente: HOJA.client_id, agente: 'oficina-creativa', pieza: { encargo_id: HOJA.encargo_id, fila: { id: 's4-d5-vie_reel_olon', hora: '09:00', fecha: '2026-11-27' }, hoja: pieza.hoja } })
    expect(pieza.hoja.startsWith(HOJA.brief.texto.trim())).toBe(true)
    expect(pieza.hoja).toContain('- OFERTA: olon')
    expect(pieza.hoja).toContain('## El plan de trabajo\nEl plan de la campaña: semana 4.')
    expect(pieza.hoja.length).toBeGreaterThan(HOJA.brief.texto.trim().length)
    for (const c of CASILLAS) { expect(p).not.toHaveProperty(c); expect(p.pieza).not.toHaveProperty(c) }
  })
  it('sin plan, la hoja es el brief entero; sin fila, no va fila', () => {
    expect(hojaDeLaPieza('  la hoja  ', null)).toBe('la hoja')
    expect(piezaParaElCerebro({ encargo_id: 'e', brief_texto: 'h', plan_texto: '' })).toEqual({ encargo_id: 'e', hoja: 'h' })
  })
})

describe('lo que la mesa guarda del índice', () => {
  it('la base completa como texto (sede, fecha y fuente como dato en el encabezado de cada cosa), índice, huella y consulta', () => {
    const ix = leerIndice(INDICE_OK.body)!
    expect(ix).toMatchObject({ lista_texto: LISTA, huella: 'h-olon-1', consulta_id: 'c-1' })
    expect(ix.base).toContain('### Fijo · manual-v3 · sin sede · fecha 2026-11-01 · fuente manual\nManual de marca vigente: voz cálida, costeña.')
    expect(ix.base).toContain('### Ficha 1 · 4f26e79b · sede olon · fecha 2026-10-20 · fuente ficha_del_cliente\nOlón · martes a domingo · 08:00 a 16:00 · lunes cerrado')
    expect(ix.base).toContain('### Ficha 3 · feaa8639 · sede guayaquil · fecha 2026-10-20 · fuente ficha_del_cliente\nGuayaquil · lunes a domingo · 12:00 a 22:00')
    expect(ix.base).not.toContain('NO DEBE LEERSE')
  })
  it('nada se filtra: la ficha de Guayaquil está en la base de una pieza de Olón, sin marca «otra oferta» ni «no es tuyo»', () => {
    const ix = leerIndice(INDICE_OK.body)!
    for (const f of BASE_COMPLETA) expect(ix.base).toContain(f.texto)
    expect(ix.base).not.toMatch(/otra oferta|no es tuyo|de_la_pieza/i)
  })
  it('sin base_completa lee lo fijo; un texto se respeta tal cual; con aviso lo guarda', () => {
    expect(leerIndice({ fijo: 'lo fijo', lista_texto: LISTA, huella: 'h', aviso: 'sin manual vigente' })).toEqual({ base: 'lo fijo', lista_texto: LISTA, huella: 'h', aviso: 'sin manual vigente' })
    expect(baseEnTexto(42)).toBe('')
  })
  it('sin huella o sin lista no hay índice (no se podría pedir por número)', () => {
    expect(leerIndice({ lista_texto: LISTA })).toBeNull()
    expect(leerIndice({ huella: 'h', lista_texto: '   ' })).toBeNull()
    expect(leerIndice(null)).toBeNull()
  })
})

describe('la sección «Lo que sabemos del cliente» va ENTERA', () => {
  it('la base completa, el índice y cómo pedir por número, sin recorte; la sede se lee como dato', () => {
    const larga = baseEnTexto(BASE_COMPLETA) + '\n' + 'dato largo de la base · '.repeat(4000)
    const s = seccionDelCerebro({ base: larga, lista_texto: LISTA, huella: 'h' })
    expect(s).toContain('## Lo que sabemos del cliente')
    expect(s).toContain(larga.trim())
    expect(s).toContain(LISTA)
    expect(s).toContain('`pedir_fichas`')
    expect(s).toMatch(/son un dato, no un filtro/)
    expect(s).not.toMatch(/recort|otra oferta|no lo tomes como de esta pieza/)
  })
})

describe('al abrir una mesa de pieza: UNA lectura del índice y sin el pedido mezclado', () => {
  it('pide el índice una vez con la hoja de la pieza, lo guarda y el pedido mezclado al portero NO sale', async () => {
    const { M, id, est, indices, mezclados } = await abrir({ conCerebro: true, dry: false })
    expect(indices).toHaveLength(1)
    expect(indices[0]).toMatchObject({ cliente: CLIENTE, agente: 'oficina-creativa', pieza: { encargo_id: id } })
    expect(indices[0].pieza.hoja).toContain('BRF-0100')
    // o17 (CC6): la apertura le pasa el plan del encargo a la hoja (no solo la función que la arma)
    expect(indices[0].pieza.hoja).toContain('## El plan de trabajo\nPLAN DE TRABAJO DE PRUEBA: serie de posts de producto antes de la pauta.')
    for (const c of CASILLAS) { expect(indices[0]).not.toHaveProperty(c); expect(indices[0].pieza).not.toHaveProperty(c) }
    expect(est().indice).toMatchObject({ huella: 'h-olon-1' })
    expect(est().indice!.base).toContain('Olón · martes a domingo')
    expect(mezclados).toHaveLength(0)
    await avanzarMesa(M.P, M.encargos.get(id)!, M.plantilla!.plantilla as never, 0)
    expect(indices).toHaveLength(1)
  })
  it('cada turno de la mesa lee la sección con la base completa y la herramienta, y va sin empuje', async () => {
    const { M, id, a } = await abrir()
    const { turnos } = await jugar(M, id, a)
    expect(turnos.length).toBeGreaterThan(3)
    for (const t of turnos) {
      expect(t.task, t.paso).toContain('## Lo que sabemos del cliente')
      expect(t.task, t.paso).toContain('Guayaquil · lunes a domingo · 12:00 a 22:00')
      expect(t.task, t.paso).toContain('pedir_fichas(numeros)')
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
  it('el agente del turno pide 1, 3 y 9999: llegan los dos horarios con su sede como dato y «no consta»', async () => {
    const { M, a, id, entregas } = await abrir()
    const r = await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: agenteDe(a), numeros: [1, 3, 9999, 1], para_que: 'esto no viaja' })
    expect(r.status).toBe(200)
    expect(r.cuerpo.ok).toBe(true)
    expect(entregas).toHaveLength(1)
    expect(entregas[0]).toMatchObject({ cliente: CLIENTE, numeros: [1, 3, 9999], huella: 'h-olon-1', pieza: { encargo_id: id }, agente: agenteDe(a) })
    expect(entregas[0].pieza.hoja).toContain('BRF-0100')
    for (const c of CASILLAS) { expect(entregas[0]).not.toHaveProperty(c); expect(entregas[0].pieza).not.toHaveProperty(c) }
    const t = String(r.cuerpo.fichas)
    expect(t).toContain('### Número 1 · 4f26e79b · sede olon · fecha 2026-10-20 · fuente ficha_del_cliente\nOlón · martes a domingo · 08:00 a 16:00 · lunes cerrado')
    expect(t).toContain('### Número 3 · feaa8639 · sede guayaquil · fecha 2026-10-20 · fuente ficha_del_cliente\nGuayaquil · lunes a domingo · 12:00 a 22:00')
    expect(t).toMatch(/### Número 9999 · sin sede\nNo consta: ese número no está en el índice/)
  })
  it('si la lista del cerebro cambió (huella_actual), nada se da por entregado', async () => {
    const { M, a, id } = await abrir({ entregar: () => ({ ok: true, body: { huella_actual: 'h-olon-2', entregas: [{ numero: 1, contenido: 'NO DEBE LLEGAR', estado: 'vigente' }] } }) })
    const r = await registrarHerramienta(M.P, { herramienta: 'pedir_fichas', encargo_id: id, de: agenteDe(a), numeros: [1] })
    expect(String(r.cuerpo.fichas)).toContain('No consta: la lista del cerebro cambió')
    expect(String(r.cuerpo.fichas)).not.toContain('NO DEBE LLEGAR')
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
    expect(f.map((x) => [x.numero, x.estado, x.motivo ?? null])).toEqual([[2, 'ok', null], [9999, 'no_consta', 'el número no está en el índice'], [5, 'no_consta', 'el cerebro no devolvió este número']])
    expect(fichasEnTexto(f)).toContain('### Número 2 · deb890b0 · sin sede\nla leyenda completa')
    expect(fichasEnTexto(f)).toContain('### Número 5\nNo consta: el cerebro no devolvió este número. No lo des por sabido.')
  })
  it('la forma real de #1185: `material` (con `estado` de la ficha) y `no_consta` con su motivo, que llega al empleado', () => {
    // forma de `src/lib/cerebro/portero/indice.ts` de #1185 (`8753afc8`): material[] lleva el estado de la FICHA; no_consta[] lleva el motivo
    const body = {
      estado: 'ok',
      material: [
        { numero: 1, ref: 'ficha:30557c31', estado_de_lectura: 'ok', texto: 'Horario de Olón: 12:00 a 22:00', estado: 'vigente', sede: 'olon', fecha_fuente: '2026-11-10', fuente: 'dueño' },
        { numero: 3, ref: 'ficha:b51fa4e4', estado_de_lectura: 'error_de_lectura', texto: null, sede: 'guayaquil' },
      ],
      no_consta: [{ numero: 9999, estado: 'no_consta', motivo: 'ese número no está en la lista' }],
      huella: 'h1',
    }
    const f = leerEntrega(body, [1, 3, 9999])
    expect(f.map((x) => [x.numero, x.estado, x.motivo ?? null])).toEqual([[1, 'ok', null], [3, 'error_de_lectura', null], [9999, 'no_consta', 'ese número no está en la lista']])
    const t = fichasEnTexto(f)
    expect(t).toContain('### Número 1 · ficha:30557c31 · sede olon · fecha 2026-11-10 · fuente dueño\nHorario de Olón: 12:00 a 22:00')
    expect(t).toContain('### Número 3 · ficha:b51fa4e4 · sede guayaquil\nNo consta. No lo des por sabido.')
    expect(t).toContain('### Número 9999 · sin sede\nNo consta: ese número no está en la lista.')
    expect(t).not.toContain('el cerebro no devolvió este número')
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
