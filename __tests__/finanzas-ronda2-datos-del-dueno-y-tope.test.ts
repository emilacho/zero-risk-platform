/**
 * Ronda 2 de la oficina financiera (CC#3 · 16-oct): (1) las respuestas del dueño entran por DATO (`semilla.respuestas_del_dueno`), sin hilo de Slack;
 * (2) el tope PROPIO de un encargo (`semilla.tope_encargo_usd`) solo sube el de la plantilla, con techo. US$ 0: todo simulado.
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { avanzar, firmaDeTopeValida, plantillaDelEncargo, respuestasDeLaSemilla, TOPE_MAXIMO_POR_ENCARGO_USD } from '../src/lib/finanzas/conversa/orquestador'
import { PLANTILLA_FINANCIERA } from '../src/lib/finanzas/conversa/plantilla'
import type { AlmacenDeConversa, EncargoDeConversa, PedidoAlModelo, PuertosDeConversa, Semilla } from '../src/lib/finanzas/conversa/puertos'
import type { ConfigDeFinanzas } from '../src/lib/finanzas/ruta'

const CLIENTE = 'cliente-prueba'
const PLANTEO = { meta_por_semana: 14, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 1 }], no_se: [] }
const CONFIG_OK: ConfigDeFinanzas = { estado: 'ensayo', clientes_ensayo: [CLIENTE], preguntas_slack: 'apagado', conversa: 'ensayo' }
const RESPUESTAS = [{ clave: 'pauta_por_semana', valor: 200, literal: 'pauta 200 por semana' }, { clave: 'costo_plato', valor: 2.1, literal: 'el plato me cuesta 2,10' }]

function mundo(semilla: Semilla, gasto = 0) {
  const pedidos: PedidoAlModelo[] = []
  const e: EncargoDeConversa & { en_vuelo?: string | null } = {
    id: 'enc-1', client_id: CLIENTE, estado: 'en_curso', estado_del_motor: { ...estadoInicial(), gasto_usd: gasto }, gasto_usd: gasto, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla,
  } as unknown as EncargoDeConversa
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: structuredClone(e), nuevo: true } },
    async leerEncargo() { return structuredClone(e) },
    async guardar(ch) { e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd; if (ch.estado !== undefined) e.estado = ch.estado },
    async artefactos() { return {} },
    async turnos() { return [] },
  }
  const P: PuertosDeConversa = {
    almacen,
    modelo: { async invocar(p) { pedidos.push(p); return { ok: true, salida: JSON.stringify(PLANTEO), costo_usd: 0.1 } } },
    slack: { async publicar() { return { ok: false } }, async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts, sin_acceso: 'no_configurado' } } },
    tableros: {} as PuertosDeConversa['tableros'],
    config: async () => CONFIG_OK,
    ahora: () => new Date(1_700_000_000_000),
    canalDelHilo: '', emilio_id: '',
  }
  return { P, pedidos, e }
}

describe('respuestas del dueño por dato', () => {
  it('sin respuestas, el pedido al agente no cambia: no menciona al dueño', async () => {
    const m = mundo({})
    await avanzar(m.P, 'enc-1'); await avanzar(m.P, 'enc-1')
    expect(m.pedidos.length).toBeGreaterThan(0)
    expect(m.pedidos.every((p) => !p.tarea.includes('dato confirmado por él'))).toBe(true)
  })
  it('con respuestas, el pedido al agente las trae marcadas como dato confirmado por el dueño, con su literal', async () => {
    const m = mundo({ respuestas_del_dueno: RESPUESTAS })
    await avanzar(m.P, 'enc-1'); await avanzar(m.P, 'enc-1')
    const t = m.pedidos[0]?.tarea ?? ''
    expect(t).toContain('respuesta del dueño: dato confirmado por él')
    expect(t).toContain('pauta 200 por semana')
    expect(t).toContain('el plato me cuesta 2,10')
  })
  it('solo entran las bien formadas y hasta 20', () => {
    const malas = [null, { clave: '', valor: 1, literal: 'x' }, { clave: 'a', valor: 1, literal: '' }, { clave: 'b', literal: 'x' }, { clave: 7, valor: 1, literal: 'x' }] as unknown as Semilla['respuestas_del_dueno']
    expect(respuestasDeLaSemilla({ respuestas_del_dueno: [...malas!, ...RESPUESTAS] })).toEqual(RESPUESTAS)
    expect(respuestasDeLaSemilla({ respuestas_del_dueno: Array.from({ length: 30 }, (_, i) => ({ clave: `k${i}`, valor: i, literal: `l${i}` })) })).toHaveLength(20)
    expect(respuestasDeLaSemilla({ respuestas_del_dueno: 'no-es-lista' as unknown as Semilla['respuestas_del_dueno'] })).toEqual([])
    expect(respuestasDeLaSemilla(undefined)).toEqual([])
  })
})

describe('tope propio del encargo', () => {
  const encargo = (semilla: Semilla) => ({ semilla } as unknown as EncargoDeConversa)
  it('sin tope propio o con uno menor o inválido, la plantilla queda en 1,50', () => {
    for (const t of [undefined, 1, 1.5, 0, -3, NaN, Infinity, '3' as unknown as number]) expect(plantillaDelEncargo(encargo({ tope_encargo_usd: t })).limites.tope_encargo_usd).toBe(1.5)
  })
  it('un tope mayor sube el de ESE encargo y nunca pasa del techo; la plantilla base no se toca', () => {
    expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 2.5 })).limites.tope_encargo_usd).toBe(2.5)
    expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 99 })).limites.tope_encargo_usd).toBe(TOPE_MAXIMO_POR_ENCARGO_USD)
    expect(PLANTILLA_FINANCIERA.limites.tope_encargo_usd).toBe(1.5)
  })
  it('con 1,45 gastados: sin tope propio cierra por tope sin llamar al modelo; con tope 3 el modelo sí se llama', async () => {
    const correr = async (m: ReturnType<typeof mundo>) => { let r = await avanzar(m.P, 'enc-1'); for (let i = 0; i < 4 && !r.cuerpo.terminado && m.pedidos.length === 0; i++) r = await avanzar(m.P, 'enc-1'); return r }
    const sin = mundo({}, 1.45)
    const r1 = await correr(sin)
    expect(r1.cuerpo.estado).toBe('cierre_por_tope')
    expect(sin.pedidos).toHaveLength(0)
    const con = mundo({ tope_encargo_usd: 3 }, 1.45)
    await correr(con)
    expect(con.pedidos.length).toBeGreaterThan(0)
  })
})

describe('tope por encima del techo: solo con firma registrada', () => {
  const encargo = (semilla: Semilla) => ({ semilla } as unknown as EncargoDeConversa)
  const firma = { quien: 'Emilio', cuando: '2026-10-19T16:43+02:00', valor: 3.2, papel: '00-meta/FIRMA-EMILIO-2026-10-16-ronda2.md' }
  it('con firma bien formada el tope llega hasta el valor firmado y no más', () => {
    expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 3.2, firma_tope: firma })).limites.tope_encargo_usd).toBe(3.2)
    expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 99, firma_tope: firma })).limites.tope_encargo_usd).toBe(3.2)
  })
  it('sin firma o con firma mal formada sigue el techo de 3,00', () => {
    const malas = [undefined, null, {}, { ...firma, quien: '' }, { ...firma, cuando: ' ' }, { ...firma, papel: '' }, { ...firma, valor: '3.2' }, { ...firma, valor: NaN }, { ...firma, valor: Infinity }] as unknown as Array<Semilla['firma_tope']>
    for (const f of malas) expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 3.2, firma_tope: f })).limites.tope_encargo_usd).toBe(TOPE_MAXIMO_POR_ENCARGO_USD)
    expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 3.2 })).limites.tope_encargo_usd).toBe(TOPE_MAXIMO_POR_ENCARGO_USD)
  })
  it('una firma por debajo del techo no lo baja', () => {
    expect(plantillaDelEncargo(encargo({ tope_encargo_usd: 5, firma_tope: { ...firma, valor: 2 } })).limites.tope_encargo_usd).toBe(TOPE_MAXIMO_POR_ENCARGO_USD)
  })
  it('la firma sola no sube el tope: hace falta pedirlo en tope_encargo_usd', () => {
    expect(plantillaDelEncargo(encargo({ firma_tope: firma })).limites.tope_encargo_usd).toBe(1.5)
    expect(firmaDeTopeValida(firma)).toBe(true)
  })
})
