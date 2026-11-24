/**
 * RETOMAR DESDE EL PUNTO EXACTO DONDE SE CAYÓ · GO Lenovo 24-nov (decisión de Emilio 11:45 Zúrich) · entrega 1: las mesas.
 * Los textos de falla son los REALES del encargo 9aac063b (la gran idea de Náufrago, leídos de `oficina_turnos` el 24-nov, solo lectura):
 * el turno 26 murió con «Credit balance is too low» y el turno 14 con «sin vuelta en 24 min».
 * US$ 0: equipo simulado, base en memoria, sin red ni modelo.
 */
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado } from '../orquestador'
import { estadoDeLaMesa, reanudarMesa } from '../mesa/orquestador'
import { abrirMesaDeLaCadena, type SobreDeLaCadena } from '../mesa/de-la-cadena'
import { BRIEF_MESA, CONCEPTO_MESA } from '../plantillas/mesa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { causaExterna, cerroPorCausaExterna, cuentaComoIntentoFallido, PREFIJO_TURNO_EN_PAUSA } from '../mesa/causa-externa'
import { siguienteDeLaMesa } from '../mesa/planificador'
import type { Aporte, EstadoMesa, Tarjeta } from '../mesa/tipos'
import { DIRECTORIO } from './mesa-memoria'
import { montar } from './mesa-arnes'

// los textos reales (encargo 9aac063b-7a8f-4507-86bd-1d41ae276051)
const SIN_SALDO = 'el agente FALLÓ · el empleado FALLÓ · Credit balance is too low · gastado ≈ US$ 0.0000 · lo escrito hasta ahí es PARCIAL y no se da por respuesta'
const SIN_VUELTA = 'sin vuelta en 24 min'

describe('la causa externa · lista cerrada', () => {
  it('el saldo agotado real es causa externa «saldo»', () => {
    expect(causaExterna({ error: SIN_SALDO })).toEqual({ clave: 'saldo', motivo: SIN_SALDO })
  })
  it('un turno sin vuelta (el vigía) NO es causa externa: un turno colgado puede ser del agente', () => {
    expect(causaExterna({ error: SIN_VUELTA })).toBeNull()
  })
  it('las fallas del agente o de su respuesta no son externas', () => {
    for (const e of ['respuesta vacía', 'el formato no cumple el esquema', 'el agente FALLÓ · invalid model', '']) expect(causaExterna({ error: e })).toBeNull()
    expect(causaExterna({})).toBeNull()
  })
  it('el proveedor saturado, caído o la red sí lo son', () => {
    expect(causaExterna({ error: 'Overloaded' })?.clave).toBe('limite_del_proveedor')
    expect(causaExterna({ error: 'rate_limit_error: too many requests' })?.clave).toBe('limite_del_proveedor')
    expect(causaExterna({ error: 'run-sdk devolvió status 529' })?.clave).toBe('limite_del_proveedor')
    expect(causaExterna({ error: 'HTTP 503 desde el corredor' })?.clave).toBe('proveedor_caido')
    expect(causaExterna({ error: 'Internal server error' })?.clave).toBe('proveedor_caido')
    expect(causaExterna({ error: 'fetch failed' })?.clave).toBe('red')
    expect(causaExterna({ error: 'socket hang up' })?.clave).toBe('red')
    expect(causaExterna({ error: 'ECONNRESET' })?.clave).toBe('red')
  })
  it('un número suelto no es un código: «US$ 0.0500» o «500 palabras» no son un 500', () => {
    expect(causaExterna({ error: 'el agente entregó 500 palabras de más · gastado ≈ US$ 0.0500' })).toBeNull()
    expect(causaExterna({ error: 'status 400 · entrada inválida' })).toBeNull()
  })
  it('el código del corredor (`upstream_status`) y el pedido que no llegó también cuentan; un 4xx no', () => {
    expect(causaExterna({ error: 'el corredor contestó roto', upstream_status: 502 })?.clave).toBe('proveedor_caido')
    expect(causaExterna({ error: 'el corredor contestó roto', upstream_status: 429 })?.clave).toBe('limite_del_proveedor')
    expect(causaExterna({ error: 'el corredor contestó roto', upstream_status: 400 })).toBeNull()
    expect(causaExterna({ error: 'el nodo HTTP falló', pedido_no_llego: true })?.clave).toBe('red')
    expect(causaExterna({ pedido_no_llego: true })).toEqual({ clave: 'red', motivo: 'el pedido del turno no llegó' })
  })
})

describe('el planificador ya no cuenta las caídas externas como intentos (también en un libro de antes)', () => {
  it('las notas reales: la de saldo no cuenta, la de «sin vuelta» sí, la de pausa no', () => {
    expect(cuentaComoIntentoFallido({ tipo: 'nota', texto: `turno_fallido: ${SIN_SALDO}` })).toBe(false)
    expect(cuentaComoIntentoFallido({ tipo: 'nota', texto: `turno_fallido: ${SIN_VUELTA}` })).toBe(true)
    expect(cuentaComoIntentoFallido({ tipo: 'nota', texto: `${PREFIJO_TURNO_EN_PAUSA}: ${SIN_SALDO}` })).toBe(false)
    expect(cuentaComoIntentoFallido({ tipo: 'aporta', texto: 'turno_fallido: algo' })).toBe(false)
    // una nota del agente que no es una caída (un rastro, un aviso) nunca cuenta como intento
    expect(cuentaComoIntentoFallido({ tipo: 'nota', texto: 'el índice no trajo huella ni lista' })).toBe(false)
  })
  it('cerroPorCausaExterna: solo el ÚLTIMO aporte y solo si es una caída externa (de pausa o de turno fallido)', () => {
    const n = (texto: string, tipo = 'nota') => ({ tipo, texto })
    expect(cerroPorCausaExterna([n('dirige', 'dirige'), n(`${PREFIJO_TURNO_EN_PAUSA}: ${SIN_SALDO}`)])).toMatchObject({ clave: 'saldo' })
    expect(cerroPorCausaExterna([n('dirige', 'dirige'), n(`turno_fallido: ${SIN_SALDO}`)])).toMatchObject({ clave: 'saldo' })
    expect(cerroPorCausaExterna([n(`turno_fallido: ${SIN_SALDO}`), n('la integración', 'integra')])).toBeNull()
    expect(cerroPorCausaExterna([n(`turno_fallido: ${SIN_VUELTA}`)])).toBeNull()
    expect(cerroPorCausaExterna([n('Credit balance is too low (una nota cualquiera)')])).toBeNull()
    expect(cerroPorCausaExterna([])).toBeNull()
  })

  const DIR: Tarjeta[] = DIRECTORIO.map((t) => ({ ...t }))
  const DIRECCION = 'creative-director-mesa'
  const est = (): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: DIR, direccion: DIRECCION, turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null })
  let k = 0
  const A = (o: Partial<Aporte> & Pick<Aporte, 'de' | 'tipo'>): Aporte => { k++; return { id: `id-${k}`, encargo_id: 'e1', n: k, para: null, texto: 'texto del aporte', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: null, ...o } as Aporte }
  const ctx = { gasto_usd: 0.5, tope_usd: 5, hayImagenGenerada: false }
  const base = (): Aporte[] => { k = 0; return [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'carousel-designer', tipo: 'aporta' })] }

  it('la forma de 9aac063b: tres caídas por saldo del especialista que faltaba → se le vuelve a convocar (antes la mesa seguía sin él)', () => {
    const libro = [...base(), ...[1, 2, 3].map(() => A({ de: 'marketing_instagram_curator', tipo: 'nota', texto: `turno_fallido: ${SIN_SALDO}` }))]
    expect(siguienteDeLaMesa(est(), libro, ctx)).toMatchObject({ accion: 'turno', agente: 'marketing_instagram_curator', tipo: 'aportar' })
  })
  it('control: tres caídas que SÍ son del agente lo dejan fuera, como siempre', () => {
    const libro = [...base(), ...[1, 2, 3].map(() => A({ de: 'marketing_instagram_curator', tipo: 'nota', texto: `turno_fallido: ${SIN_VUELTA}` }))]
    const sig = siguienteDeLaMesa(est(), libro, ctx)
    expect(sig).not.toMatchObject({ agente: 'marketing_instagram_curator' })
  })
  it('el director con tres caídas por saldo al integrar: vuelve a integrar (no «seguir a dibujar» con la integración vieja)', () => {
    const libro = [...base(), A({ de: 'marketing_instagram_curator', tipo: 'aporta' }), ...[1, 2, 3].map(() => A({ de: DIRECCION, tipo: 'nota', texto: `turno_fallido: ${SIN_SALDO}` }))]
    expect(siguienteDeLaMesa(est(), libro, ctx)).toMatchObject({ accion: 'turno', agente: DIRECCION, tipo: 'integrar' })
  })
  it('control: el director con tres caídas propias no integra', () => {
    const libro = [...base(), A({ de: 'marketing_instagram_curator', tipo: 'aporta' }), ...[1, 2, 3].map(() => A({ de: DIRECCION, tipo: 'nota', texto: `turno_fallido: ${SIN_VUELTA}` }))]
    expect(siguienteDeLaMesa(est(), libro, ctx).accion).toBe('seguir_a_dibujar')
  })
})

describe('la mesa queda EN PAUSA y se retoma desde el mismo paso', () => {
  type T = { n: number; paso: string; agente: string }
  const turno = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo.turno as T

  it('una caída por saldo NO cierra ni entrega: queda en_paso, sin turno corriendo, con la pausa a la vista y UN aviso', async () => {
    const { M, MS, a, id } = await montar()
    const dirige = await recibirResultado(M.P, id, turno(a).n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.05, workflow_execution_id: 'ex-0' })
    const t = turno(dirige)
    const r = await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0, workflow_execution_id: 'ex-1' })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'en_pausa_por_causa_externa', encargo_id: id, causa: 'saldo', agente: t.agente, tipo: 'aportar' })
    const enc = M.encargos.get(id)!
    expect(enc.estado).toBe('en_paso')
    const est = estadoDeLaMesa(enc.estado_del_motor)!
    expect(est.pausa_externa).toMatchObject({ causa: 'saldo', motivo: SIN_SALDO, agente: t.agente, tipo: 'aportar', paso: t.paso, n: t.n })
    expect(est.turno_abierto).toBeNull()
    expect(await M.P.almacen.turnoAbierto(id)).toBeNull()
    // en el libro: una nota de pausa, ninguna de «turno_fallido» (no cuenta como intento)
    const notas = MS.filas.filter((f) => f.tipo === 'nota' && f.de === t.agente)
    expect(notas.map((f) => f.texto)).toEqual([`${PREFIJO_TURNO_EN_PAUSA}: ${SIN_SALDO}`])
    // UNA alarma, en #alertas, que dice que lo hecho sigue guardado
    expect(M.llamadas.avisos).toHaveLength(1)
    expect(M.llamadas.avisos[0]).toMatchObject({ canal: 'alertas' })
    expect(M.llamadas.avisos[0].texto).toMatch(/EN PAUSA/)
    expect(M.llamadas.avisos[0].texto).toMatch(/sin saldo/)
    // nada se entregó a la bandeja ni a la cadena
    expect(M.llamadas.bandeja).toHaveLength(0)
  })

  it('«siguiente» retoma EXACTAMENTE el paso caído (mismo agente, mismo tipo) y quita la pausa; lo hecho antes no se repite', async () => {
    const { M, MS, a, id } = await montar()
    const dirige = await recibirResultado(M.P, id, turno(a).n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.05, workflow_execution_id: 'ex-0' })
    const t = turno(dirige)
    await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })
    const sigue = await avanzar(M.P, id)
    expect(sigue.cuerpo).toMatchObject({ accion: 'esperar' })
    expect(turno(sigue).agente).toBe(t.agente)
    expect(turno(sigue).paso).toBe(t.paso)
    expect(estadoDeLaMesa(M.encargos.get(id)!.estado_del_motor)!.pausa_externa ?? null).toBeNull()
    // el «dirige» pagado sigue en el libro una sola vez: la dirección no se vuelve a convocar
    expect(MS.filas.filter((f) => f.tipo === 'dirige')).toHaveLength(1)
    expect(turno(sigue).agente).not.toBe('creative-director-mesa')
  })

  it('el saldo sigue en cero: cada reanudación vuelve a la pausa SIN gastar los reintentos; la mesa nunca cierra; las alarmas siguientes van al hilo', async () => {
    const { M, MS, a, id } = await montar()
    const dirige = await recibirResultado(M.P, id, turno(a).n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.05 })
    const caido = turno(dirige).agente
    let actual = dirige
    for (let i = 0; i < 6; i++) {
      const t = turno(actual)
      expect(t.agente).toBe(caido)
      const r = await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })
      expect(r.cuerpo.accion).toBe('en_pausa_por_causa_externa')
      expect(M.encargos.get(id)!.estado).toBe('en_paso')
      actual = await avanzar(M.P, id)
    }
    expect(MS.filas.filter((f) => f.tipo === 'nota' && f.texto.startsWith('turno_fallido'))).toHaveLength(0)
    expect(M.llamadas.avisos.map((x) => x.canal)).toEqual(['alertas', 'hilo', 'hilo', 'hilo', 'hilo', 'hilo'])
    // vuelve el saldo: el mismo agente entrega y la mesa sigue su camino normal
    const t = turno(actual)
    expect(t.agente).toBe(caido)
    const r = await recibirResultado(M.P, id, t.n, { texto: `Aporte de ${caido}: propuesta concreta para la pieza.`, costo_usd: 0.05 })
    expect(r.cuerpo.accion).toBe('esperar')
    expect(turno(r).agente).not.toBe(caido)
    expect(MS.filas.filter((f) => f.de === caido && f.tipo === 'aporta')).toHaveLength(1)
  })

  it('el director cae por saldo AL INTEGRAR: la mesa no entrega la integración vieja; al retomar, integra él', async () => {
    const { M, a, id } = await montar()
    let actual = a
    // la mesa juega normal hasta que le toca integrar a la dirección
    for (let i = 0; i < 30; i++) {
      const t = turno(actual)
      if (t.paso.startsWith('mesa:integrar:')) break
      const texto = t.paso.startsWith('mesa:dirigir:') ? 'Idea rectora: el plato del día' : `Aporte de ${t.agente}: propuesta concreta para la pieza.`
      actual = await recibirResultado(M.P, id, t.n, { texto, costo_usd: 0.05 })
    }
    const t = turno(actual)
    expect(t.paso).toMatch(/^mesa:integrar:/)
    for (let i = 0; i < 4; i++) {
      const r = await recibirResultado(M.P, id, turno(actual).n, { error: SIN_SALDO, costo_usd: 0 })
      expect(r.cuerpo.accion).toBe('en_pausa_por_causa_externa')
      actual = await avanzar(M.P, id)
      expect(turno(actual).paso).toBe(t.paso)
    }
    expect(M.llamadas.bandeja).toHaveLength(0)
    expect(['en_paso']).toContain(M.encargos.get(id)!.estado)
  })

  it('control: una falla que NO es externa sigue como siempre (nota «turno_fallido», cuenta como intento, sin pausa)', async () => {
    const { M, MS, a, id } = await montar()
    const dirige = await recibirResultado(M.P, id, turno(a).n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.05 })
    const t = turno(dirige)
    const r = await recibirResultado(M.P, id, t.n, { error: 'respuesta vacía', costo_usd: 0 })
    expect(r.cuerpo.accion).toBe('esperar')
    expect(estadoDeLaMesa(M.encargos.get(id)!.estado_del_motor)!.pausa_externa ?? null).toBeNull()
    expect(MS.filas.filter((f) => f.tipo === 'nota' && f.de === t.agente).map((f) => f.texto)).toEqual(['turno_fallido: respuesta vacía'])
    expect(M.llamadas.avisos).toHaveLength(0)
  })
})

describe('reanudar · la gran idea que YA cerró por la caída (la forma de 9aac063b) · GO Lenovo 10:53Z', () => {
  const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
  const DIRECCION = 'director-gran-idea'
  const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo: true, version: 1 })
  const DIR_CONCEPTO: Tarjeta[] = [
    tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']), tarjeta(DIRECCION, 'direccion', ['concepto:dirige']),
    tarjeta('content-creator', 'miembro', ['concepto']), tarjeta('design-visual-storyteller', 'miembro', ['concepto']), tarjeta('portero', 'portero', []),
  ]
  const sobre = (tipo: 'brief' | 'concepto'): SobreDeLaCadena => ({ tipo_de_mesa: tipo, client_id: CLIENTE, campana_id: CAMPANA, version: 1, dry_run: false, marco_texto: '# Marco de la campaña\n- fase 1 · lanzamiento · días 1-30', condiciones: [] })
  type R = { cuerpo: Record<string, unknown>; status: number }
  const tt = (r: R) => r.cuerpo.turno as { n: number; paso: string; agente: string }
  type Reabre = () => Promise<{ ok: true; estado?: string } | { ok: false; error?: string }>

  async function montarConcepto(o: { reabre?: Reabre; tipo?: 'brief' | 'concepto' } = {}) {
    const tipo = o.tipo ?? 'concepto'
    const pl = tipo === 'brief' ? BRIEF_MESA : CONCEPTO_MESA
    const M = crearMemoria({ plantilla: pl, config: { familias_activas: [pl.familia] } })
    const MS = crearMesaEnMemoria(DIR_CONCEPTO)
    M.P.mesa = MS
    const llamadas: Array<Record<string, unknown>> = []
    const reabre: Reabre = o.reabre ?? (async () => ({ ok: true, estado: 'abierta' }))
    M.P.cadena = {
      entregarBrief: async () => ({ ok: true, estado: 'validada' }), entregarConcepto: async () => ({ ok: true, estado: 'lista' }),
      reabrirConcepto: async (p) => { llamadas.push(p); return reabre() },
    }
    M.P.cerebro = { avisarA: 'https://x/api/oficina/material-vuelta', pedir: async () => ({ ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [] } }), leerPedido: async () => ({ ok: false, error: 'no se usa' }) }
    const a = await abrirMesaDeLaCadena(M.P, sobre(tipo), avanzar)
    return { M, MS, a: a as R, id: String(a.cuerpo.encargo_id ?? ''), llamadas }
  }
  type Montada = Awaited<ReturnType<typeof montarConcepto>>
  /** juega hasta que le toque integrar a la dirección (el turno queda abierto) */
  async function hastaIntegrar(m: Montada): Promise<R> {
    let ult = m.a
    for (let i = 0; i < 30 && ult.cuerpo.accion === 'esperar'; i++) {
      const t = tt(ult)
      if (t.paso.startsWith('mesa:integrar:')) return ult
      ult = (await recibirResultado(m.M.P, m.id, t.n, { texto: `aporte de ${t.agente}`, costo_usd: 0.08 })) as R
    }
    throw new Error(`la mesa no llegó a integrar: ${JSON.stringify(ult.cuerpo).slice(0, 200)}`)
  }
  /** lo que dejó el código de ANTES: tres caídas anotadas como `turno_fallido` y el encargo `cerrado` (entregó la integración vieja) */
  async function cerrarComoAntes(m: Montada, t: { n: number; paso: string; agente: string }, nota = SIN_SALDO) {
    for (let i = 0; i < 3; i++) await m.MS.aportar({ encargo_id: m.id, de: t.agente, para: null, tipo: 'nota', texto: `turno_fallido: ${nota}`, refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
    const enc = m.M.encargos.get(m.id)!
    const est = estadoDeLaMesa(enc.estado_del_motor)!
    const mesa = enc.estado_del_motor.artefactos.mesa
    await m.M.P.almacen.guardar({
      encargo_id: m.id, estado_del_motor: { ...enc.estado_del_motor, artefactos: { ...enc.estado_del_motor.artefactos, mesa: { ...mesa, datos: { ...est, turno_abierto: null } as never } } },
      gasto_usd: enc.estado_del_motor.gasto_usd, estado: 'cerrado', turno: { n: t.n, paso: t.paso, tipo: 'agente', agente: t.agente, estado: 'fallo', error: nota, dispatch_key: `${m.id}:${t.n}`, cost_usd: 0 } as never,
    })
  }

  it('cerró por saldo: la cadena reabre la v1, el encargo vuelve a en_paso con el MISMO libro y el director integra (no se repite ningún aporte pagado)', async () => {
    const m = await montarConcepto()
    const t = tt(await hastaIntegrar(m))
    expect(t.agente).toBe(DIRECCION)
    const aportesAntes = m.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo !== 'nota').length
    await cerrarComoAntes(m, t)
    expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado')
    const r = await reanudarMesa(m.M.P, m.id)
    expect(m.llamadas).toEqual([{ campana_id: CAMPANA, version: 1, encargo_id: m.id }])
    expect(m.M.encargos.get(m.id)!.estado).toBe('en_paso')
    expect(r.cuerpo.accion).toBe('esperar')
    expect(tt(r as R).agente).toBe(DIRECCION)
    expect(tt(r as R).paso).toMatch(/^mesa:integrar:/)
    expect(m.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo !== 'nota')).toHaveLength(aportesAntes)
    expect(estadoDeLaMesa(m.M.encargos.get(m.id)!.estado_del_motor)!.marcas.reanudada_tras_cierre).toBe(1)
  })
  it('y la integración que llega se entrega a la cadena como siempre', async () => {
    const m = await montarConcepto()
    const t = tt(await hastaIntegrar(m))
    await cerrarComoAntes(m, t)
    const r = (await reanudarMesa(m.M.P, m.id)) as R
    const libro = m.MS.filas.filter((a) => a.encargo_id === m.id)
    const integra = `## Gran idea\nLa isla que cuenta\n## Citas\n${libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: lo que propone ${a.de}`).join('\n')}`
    let ult = (await recibirResultado(m.M.P, m.id, tt(r).n, { texto: integra, costo_usd: 0.5 })) as R
    for (let i = 0; i < 10 && ult.cuerpo.accion === 'esperar'; i++) {
      const u = tt(ult)
      ult = (await recibirResultado(m.M.P, m.id, u.n, { texto: u.paso.includes('integrar') || u.paso.includes('citas') ? integra : `aporte de ${u.agente}`, costo_usd: 0.1 })) as R
    }
    expect(ult.cuerpo.accion).toBe('cerrado')
    expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado')
  })
  it('control: una mesa que cerró por su camino normal (la dirección integró) NO se reabre y la cadena ni se entera', async () => {
    const m = await montarConcepto()
    const t = tt(await hastaIntegrar(m))
    await cerrarComoAntes(m, t)
    await m.MS.aportar({ encargo_id: m.id, de: DIRECCION, para: null, tipo: 'integra', texto: '## Gran idea\nx', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.5, workflow_execution_id: null })
    const r = await reanudarMesa(m.M.P, m.id)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('no_cerro_por_causa_externa')
    expect(m.llamadas).toHaveLength(0)
    expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado')
  })
  it('control: cerró por caídas que NO son externas («sin vuelta»): no se reabre', async () => {
    const m = await montarConcepto()
    const t = tt(await hastaIntegrar(m))
    await cerrarComoAntes(m, t, SIN_VUELTA)
    const r = await reanudarMesa(m.M.P, m.id)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('no_cerro_por_causa_externa')
    expect(m.llamadas).toHaveLength(0)
  })
  it('la cadena no acepta reabrir (p. ej. Emilio ya decidió): 409 y el encargo sigue cerrado', async () => {
    const m = await montarConcepto({ reabre: async () => ({ ok: false, error: 'la versión 1 no está esperando a Emilio (lista/aprobado): no se reabre' }) })
    const t = tt(await hastaIntegrar(m))
    await cerrarComoAntes(m, t)
    const r = await reanudarMesa(m.M.P, m.id)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'la_cadena_no_reabre' })
    expect(String(r.cuerpo.detalle)).toMatch(/esperando a Emilio/)
    expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado')
  })
  it('un encargo fallido, uno que no existe, o una mesa de brief cerrada: 409/404 con su porqué', async () => {
    const m = await montarConcepto()
    const t = tt(await hastaIntegrar(m))
    await cerrarComoAntes(m, t)
    const enc = m.M.encargos.get(m.id)!
    await m.M.P.almacen.guardar({ encargo_id: m.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.estado_del_motor.gasto_usd, estado: 'fallido' })
    expect((await reanudarMesa(m.M.P, m.id)).status).toBe(409)
    expect((await reanudarMesa(m.M.P, '00000000-0000-4000-8000-000000000000')).status).toBe(404)
    const b = await montarConcepto({ tipo: 'brief' })
    await cerrarComoAntes(b, tt(b.a))
    const rb = await reanudarMesa(b.M.P, b.id)
    expect(rb.status).toBe(409)
    expect(rb.cuerpo.error).toBe('no_se_reanuda')
    expect(b.llamadas).toHaveLength(0)
  })
  it('una mesa trabajando (en_paso sin pausa) no se «reanuda»; una en pausa sí, desde el paso caído', async () => {
    const m = await montarConcepto()
    const ri = await hastaIntegrar(m)
    expect((await reanudarMesa(m.M.P, m.id)).cuerpo.error).toBe('no_esta_en_pausa')
    const p = await recibirResultado(m.M.P, m.id, tt(ri).n, { error: SIN_SALDO, costo_usd: 0 })
    expect(p.cuerpo.accion).toBe('en_pausa_por_causa_externa')
    const r = (await reanudarMesa(m.M.P, m.id)) as R
    expect(r.cuerpo.accion).toBe('esperar')
    expect(tt(r).paso).toBe(tt(ri).paso)
    expect(m.llamadas).toHaveLength(0)
  })
})
