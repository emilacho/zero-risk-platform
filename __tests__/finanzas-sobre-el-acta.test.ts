/**
 * 04-nov · finanzas sobre el acta de la mesa (Emilio 18:42Z, opción A). Con acta, el reparto es de marketing y finanzas mide si se paga. Sin acta, nada cambia.
 */
import { describe, expect, it } from 'vitest'
import { calcular, repartoDeLaMesa, repartoInverso } from '../src/lib/finanzas/calculadora'
import { entradaDesdeLaConversa } from '../src/lib/finanzas/conversa/entrada'
import { CANALES_VALIDOS } from '../src/lib/finanzas/conversa/omision'
import { abrirConversacion, avanzar, plantillaDelEncargo } from '../src/lib/finanzas/conversa/orquestador'
import { estadoInicial } from '../src/lib/oficina/tipos'
import type { AlmacenDeConversa, EncargoDeConversa, PedidoAlModelo, PuertosDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { PLANTILLA_FINANCIERA } from '../src/lib/finanzas/conversa/plantilla'
import { claveDeCanal, costoDeLaMesa, planteoDelActa, viabilidadDelBloque } from '../src/lib/finanzas/conversa/sobre-el-acta'
import { resumenDelBloque } from '../src/lib/finanzas/resumen'
import type { ActaV1 } from '../src/lib/planeacion/mesa/acta'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const textoDelResumen = (b: Bloque) => resumenDelBloque(b).lineas.join('\n')
const ACTA: ActaV1 = { esquema: 'acta.v1', numero: { meta: 40, por_que: 'x' }, servicio: 's', audiencia: 'a', oferta: 'o', canales: [{ canal: 'WhatsApp', peso: 0.9, razon: 'r' }, { canal: 'Instagram pagado', peso: 0.1, razon: 'r' }], camino: 'c', prueba: 'p', no_se_hace: [], no_se: ['lo que no sé'], costos_de_la_mesa: { redes: { min: 2, max: 4 } }, aportes_que_faltan: ['crecimiento'] }
const EXP = { planteo_inicial: { zonas: ['z'], dias_y_horarios: { dias_activos_por_semana: 5 }, evento: 'pedido' } }
const base: Entrada = { meta_por_semana: 40, referencia: { min: 2, max: 4, tipo: 'supuesto', fuente: 'f', fecha: '2026-11-04' }, dias_activos_por_semana: 5 }

describe('la lista de canales', () => {
  it('🔴 WhatsApp es válido', () => { expect(CANALES_VALIDOS).toContain('whatsapp') })
  it.each([['WhatsApp', 'whatsapp'], ['whats app', 'whatsapp'], ['Instagram pagado', 'meta_ig'], ['Meta', 'meta_ig'], ['facebook', 'meta_ig'], ['Google Ads', 'busqueda_pagada'], ['Búsqueda paga', 'busqueda_pagada'], ['SEM', 'busqueda_pagada'], ['Búsqueda local', 'busqueda_local'], ['Google Maps', 'busqueda_local'], ['TikTok', 'video_corto'], ['YouTube', 'video_largo'], ['LinkedIn', 'profesional_b2b'], ['Correo', 'base_propia']])('🔴 «%s» → %s', (n, c) => { expect(claveDeCanal(n)).toBe(c) })
  it('🔴 lo que no se reconoce entra con su nombre: la lista no le cierra el paso a la mesa', () => {
    expect(claveDeCanal('Radio local')).toBe('Radio local')
    expect(claveDeCanal('Instagram orgánico')).toBe('Instagram orgánico')
  })
})

describe('el reparto de la mesa', () => {
  const canales = [{ canal: 'whatsapp', peso: 0.9, piso_diario: 0 }, { canal: 'meta_ig', peso: 0.1, piso_diario: 0 }]
  it('🔴 90 % en WhatsApp queda 90 %: Meta no sube a 60', () => {
    const r = repartoDeLaMesa({ necesario: 1000, produccion: null, canales })
    expect(r.metaIg).toBeCloseTo(100)
    expect(r.otros[0]).toMatchObject({ canal: 'whatsapp', monto: 900, activo: true })
    expect(r.totalMes).toBe(1000)
  })
  it('🔴 sin Meta en el acta, Meta recibe 0', () => { expect(repartoDeLaMesa({ necesario: 1000, produccion: null, canales: [canales[0]] }).metaIg).toBe(0) })
  it('🔴 un canal diferido no recibe ni cuenta en el peso', () => {
    const r = repartoDeLaMesa({ necesario: 1000, produccion: null, canales: [{ canal: 'meta_ig', peso: 0.5, piso_diario: 0 }, { canal: 'x', peso: 0.5, piso_diario: 0, activo: false, condicion: 'cuando' }] })
    expect(r.metaIg).toBe(1000)
    expect(r.otros[0]).toMatchObject({ monto: 0, activo: false })
    expect(r.otros[0].motivo).toMatch(/diferido.*cuando/)
  })
  it('🔴 bajo su piso conserva su parte y se dice', () => {
    const r = repartoDeLaMesa({ necesario: 300, produccion: null, canales: [{ canal: 'x', peso: 1, piso_diario: 50 }] })
    expect(r.otros[0].monto).toBe(300)
    expect(r.sumado).toBe(0)
    expect(r.otros[0].motivo).toMatch(/piso/)
  })
  it('🔴 producción va aparte: monto fijo, fracción y su tope', () => {
    expect(repartoDeLaMesa({ necesario: 1000, produccion: { monto: 200, origen: 'plan' }, canales })).toMatchObject({ totalMes: 1200, montoProd: 200 })
    const f = repartoDeLaMesa({ necesario: 800, produccion: { fraccion: 0.2, origen: 'plan' }, canales })
    expect(f.totalMes).toBeCloseTo(1000)
    expect(f.montoProd).toBeCloseTo(200)
    const t = repartoDeLaMesa({ necesario: 600, produccion: { monto: 9000, origen: 'plan' }, canales })
    expect(t.totalMes).toBeCloseTo(1000)
    expect(t.montoProd).toBeCloseTo(400)
  })
  it('🔴 sin la marca del acta, el cálculo de hoy no cambia: Meta sigue en su mínimo', () => {
    const r = calcular({ ...base, canales: [{ canal: 'whatsapp', peso: 0.9, piso_diario: 0 }] })
    if (!r.ok) throw new Error('no calculó')
    expect(r.reparto.parte_meta_ig).toBeGreaterThanOrEqual(0.6)
    expect(r.reparto).not.toHaveProperty('de_la_mesa')
    expect(r.cifras.meta_ig_mes.formula).toContain('60 %')
    expect(repartoInverso({ metaIgNecesario: 1000, produccion: null, canales: [] }).totalMes).toBeCloseTo(1000)
  })
  it('🔴 con la marca: partes que suman, y Meta con su peso', () => {
    const r = calcular({ ...base, reparto_de_la_mesa: true, canales })
    if (!r.ok) throw new Error('no calculó')
    expect(r.reparto.parte_meta_ig).toBeCloseTo(0.1, 2)
    expect(r.reparto.de_la_mesa).toBe(true)
    expect(r.cifras.meta_ig_mes.formula).not.toContain('60 %')
    const suma = r.reparto.meta_ig + r.reparto.produccion.monto + r.reparto.otros.reduce((s, o) => s + o.monto, 0)
    expect(suma).toBeCloseTo(r.reparto.total_mes, 2)
    expect(r.calendario.meta_ig_total).toBeLessThan(r.calendario.total)
  })
  it('🔴 el equilibrio se calcula con el reparto de la mesa', () => {
    const con = calcular({ ...base, ticket: 10, margen: 0.5, reparto_de_la_mesa: true, canales })
    const sin = calcular({ ...base, ticket: 10, margen: 0.5, canales: [{ canal: 'whatsapp', peso: 0.9, piso_diario: 0 }] })
    if (!con.ok || !sin.ok) throw new Error('no calculó')
    expect(con.reparto.total_mes).not.toBe(sin.reparto.total_mes)
  })
  it('🔴 el resumen no dice «al menos 60 %» si lo decidió la mesa', () => {
    const r = calcular({ ...base, reparto_de_la_mesa: true, canales })
    if (!r.ok) throw new Error('no calculó')
    expect(textoDelResumen(r)).toContain('como lo decidió la mesa')
    expect(textoDelResumen(r)).not.toContain('al menos 60')
    const hoy = calcular(base)
    if (!hoy.ok) throw new Error('no calculó')
    expect(textoDelResumen(hoy)).toContain('al menos 60')
  })
})

describe('del acta al planteo', () => {
  const p = planteoDelActa(ACTA, EXP) as Record<string, any>
  it('🔴 meta, días y canales salen del acta y la ficha, sin un agente', () => {
    expect(p).toMatchObject({ meta_por_semana: 40, zonas: ['z'], evento: 'pedido', reparto_de_la_mesa: true })
    expect(p.dias_y_horarios.dias_activos_por_semana).toBe(5)
    expect(p.canales.map((c: { canal: string }) => c.canal)).toEqual(['whatsapp', 'meta_ig'])
  })
  it('🔴 dos nombres del mismo canal suman', () => {
    const q = planteoDelActa({ ...ACTA, canales: [{ canal: 'Instagram', peso: 0.5, razon: 'r' }, { canal: 'Facebook', peso: 0.5, razon: 'r' }] }, EXP) as Record<string, any>
    expect(q.canales).toEqual([{ canal: 'meta_ig', peso: 1 }])
  })
  it('🔴 el aporte que falta y el canal sin costo se declaran', () => {
    expect(p.huecos_de_la_mesa.join()).toMatch(/whatsapp \(90 %\)/)
    expect(p.huecos_de_la_mesa.join()).toMatch(/crecimiento/)
    expect(p.no_se).toContain('lo que no sé')
  })
  it('🔴 los huecos llegan a las alertas del cálculo', () => {
    const e = entradaDesdeLaConversa({ planteo: p as never, consultas: {} as never, expediente: { fecha: '2026-11-04' } as never })
    expect(e.ok && e.alertas.join()).toMatch(/sin costo por resultado/)
    expect(e.ok && e.alertas.join()).not.toMatch(/mínimo del 60/)
  })
  it('🔴 la entrada trae todos los canales, también Meta, y el costo de la mesa', () => {
    const e = entradaDesdeLaConversa({ planteo: p as never, consultas: {} as never, expediente: { fecha: '2026-11-04' } as never })
    expect(e.ok && e.entrada.reparto_de_la_mesa).toBe(true)
    expect(e.ok && e.entrada.canales?.map((c) => c.canal)).toContain('meta_ig')
    expect(e.ok && e.entrada.referencia).toMatchObject({ min: 2, max: 4, tipo: 'supuesto' })
  })
  it('🔴 sin ningún costo no se inventa: el cálculo declara que no hay base', () => {
    const q = planteoDelActa({ ...ACTA, costos_de_la_mesa: {} }, EXP)
    expect(q).not.toHaveProperty('referencia_de_la_mesa')
    expect(entradaDesdeLaConversa({ planteo: q as never, consultas: {} as never, expediente: { fecha: 'f' } as never })).toMatchObject({ ok: false })
  })
  it('🔴 el costo se pondera solo entre los canales que lo tienen', () => {
    const r = costoDeLaMesa([{ canal: 'meta_ig', peso: 0.5 }, { canal: 'busqueda_pagada', peso: 0.25 }, { canal: 'whatsapp', peso: 0.25 }], { redes: { min: 2, max: 2 }, busqueda: { min: 8, max: 8 } })
    expect(r.rango?.base).toBeCloseTo(4)
    expect(r.sin_costo).toEqual([{ canal: 'whatsapp', peso: 0.25 }])
  })
})

describe('la plantilla', () => {
  const e = (semilla: object) => ({ semilla }) as never
  const claves = (p: { pasos: Array<{ clave: string }> }) => p.pasos.map((x) => x.clave)
  it('🔴 sin acta es exactamente la de hoy', () => { expect(claves(plantillaDelEncargo(e({})))).toEqual(claves(PLANTILLA_FINANCIERA)) })
  it('🔴 con acta nadie vuelve a decidir canales', () => {
    expect(claves(plantillaDelEncargo(e({ acta: ACTA })))).toEqual(['abrir', 'planteo_del_acta', 'fpa', 'calculo', 'cierre', 'fpa_2', 'calculo_2', 'cierre_2', 'firma'])
  })
  it('🔴 el jefe lee el planteo que salió del acta', () => {
    const cierre = plantillaDelEncargo(e({ acta: ACTA })).pasos.find((x) => x.clave === 'cierre')!
    expect(cierre.entrada).toContain('planteo')
    expect(PLANTILLA_FINANCIERA.pasos.find((x) => x.clave === 'cierre')!.entrada).not.toContain('planteo')
  })
})

describe('un acta mal formada no se ignora', () => {
  it('🔴 400, sin abrir', async () => {
    let abierto = 0
    const P = { config: async () => ({ estado: 'encendida', conversa: 'encendido', clientes_ensayo: [] }), almacen: { crearEncargo: async () => { abierto++; return { ok: false, error: 'x' } } }, ahora: () => new Date() } as never
    const r = await abrirConversacion(P, { client_id: 'c', dry_run: false, semilla: { acta: { ...ACTA, canales: [] } } })
    expect(r).toMatchObject({ status: 400, cuerpo: { error: 'acta_invalida' } })
    expect(abierto).toBe(0)
  })
})

describe('¿se paga?', () => {
  const b = (o: object) => ({ veredictos: { base: 'sigo' }, costos: { base: 3 }, techo: { por_resultado: 5 }, equilibrio: { cubre: true, meta_actual: 40, meta_de_equilibrio_semana: 30 }, ...o }) as unknown as Bloque
  it('🔴 se paga: sin marca', () => { expect(viabilidadDelBloque(b({}))).toEqual({ no_viable: false, motivo: null, cifra: null }) })
  it('🔴 no cubre el equilibrio: no viable, con la cifra', () => {
    const v = viabilidadDelBloque(b({ equilibrio: { cubre: false, meta_actual: 40, meta_de_equilibrio_semana: 90 } }))
    expect(v).toMatchObject({ no_viable: true, cifra: 90 })
    expect(v.motivo).toMatch(/equilibrio está en 90/)
  })
  it('🔴 el costo pasa el paro: no viable, con la cifra', () => { expect(viabilidadDelBloque(b({ veredictos: { base: 'paro' } }))).toMatchObject({ no_viable: true, cifra: 3 }) })
  it('🔴 sin cálculo no se dice que no sirve', () => { expect(viabilidadDelBloque(null)).toMatchObject({ no_viable: false, cifra: null }) })
})

describe('de punta a punta, con modelo falso', () => {
  const rango = (min: number, max: number, base: number) => ({ min, max, base })
  const FPA = (ticket: number) => ({ agente: 'finance-fpa-analyst', resumen: 'r', supuestos: { ticket: rango(ticket, ticket, ticket), margen: rango(0.5, 0.5, 0.5), tasa_cierre: rango(0.5, 0.5, 0.5), costo_por_resultado: rango(2, 4, 3) }, preguntas_a_otros: [], alertas: [] })
  const PLANTEO = { meta_por_semana: 14, zonas: ['z'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'pedido', canales: [{ canal: 'meta_ig', peso: 1 }], no_se: [] }
  const ACUERDO = { salida: 'sale', hallazgos: [], conflictos_resueltos: [], preguntas_a_emilio: [] }
  function mundo(ticket: number) {
    const encargos = new Map<string, EncargoDeConversa>()
    const turnos: TurnoDeConversa[] = []
    const arts: Record<string, Record<string, unknown>> = {}
    const llamadas: PedidoAlModelo[] = []
    const almacen: AlmacenDeConversa = {
      async crearEncargo(n) { const e: EncargoDeConversa = { id: 'e1', client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: n.dry_run, semilla: n.semilla }; encargos.set('e1', e); return { ok: true, encargo: structuredClone(e), nuevo: true } },
      async leerEncargo(id) { const e = encargos.get(id); return e ? structuredClone(e) : null },
      async guardar(ch) { const e = encargos.get(ch.encargo_id)!; e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd; if (ch.estado) e.estado = ch.estado; if (ch.turno) turnos.push(ch.turno); if (ch.artefacto) arts[ch.artefacto.tipo] = structuredClone(ch.artefacto.contenido) },
      async artefactos() { return structuredClone(arts) },
      async turnos() { return structuredClone(turnos) },
    }
    const P = {
      almacen,
      modelo: { async invocar(q: PedidoAlModelo) { llamadas.push(q); return { ok: true, salida: JSON.stringify(q.paso.startsWith('cierre') ? ACUERDO : /^(planteo|ajuste)/.test(q.paso) ? PLANTEO : FPA(ticket)), costo_usd: 0.1 } } },
      slack: { async publicar() { return { ok: true, ts: '1.1' } }, async leer(x: { desde_ts: string | null }) { return { ok: true, mensajes: [], leido_hasta: x.desde_ts } } },
      tableros: { async guardarTablero() { return { id: 't', version: 1 } }, async actualizarTablero() {}, async invocacionDelJefe() { return true } },
      async config() { return { estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'enciende' } },
      ahora: () => new Date('2026-11-04T12:00:00Z'), canalDelHilo: 'C', emilio_id: 'U',
    } as unknown as PuertosDeConversa
    return { P, llamadas, arts, encargos }
  }
  async function correr(ticket: number, acta: ActaV1 = ACTA) {
    const m = mundo(ticket)
    const a = await abrirConversacion(m.P, { client_id: 'c', dry_run: false, semilla: { evento: 'pedido', dias_activos_por_semana: 5, acta } })
    expect(a.status).toBe(200)
    for (let i = 0; i < 20; i++) { const r = await avanzar(m.P, a.cuerpo.encargo_id as string); if (r.cuerpo.terminado) break }
    return m
  }
  it('🔴 solo hablan el analista y el jefe, y cada uno sabe que la mesa ya decidió', async () => {
    const m = await correr(100)
    expect(m.llamadas.map((l) => l.paso)).toEqual(['fpa', 'cierre'])
    for (const l of m.llamadas) { expect(l.tarea).toContain('ya decidió canales y peso'); expect(l.tarea).toContain('Instagram pagado') }
    expect(m.encargos.get('e1')!.estado).toBe('cerrado')
  })
  it('🔴 el reparto del tablero es el del acta, y el hueco queda dicho', async () => {
    const m = await correr(100)
    const b = (m.arts.bloque as { bloque: Bloque; alertas_de_entrada: string[] })
    expect(b.bloque.reparto.parte_meta_ig).toBeCloseTo(0.1, 2)
    expect(b.bloque.reparto.otros[0]).toMatchObject({ canal: 'whatsapp', activo: true })
    expect(b.alertas_de_entrada.join()).toMatch(/whatsapp \(90 %\)/)
  })
  it('🔴 si se paga, la firma no pide devolver', async () => {
    expect(((await correr(100)).arts.cierre as { viabilidad: unknown }).viabilidad).toMatchObject({ no_viable: false })
  })
  it('🔴 si no se paga, la firma lo dice con la cifra, y aun así firma', async () => {
    const m = await correr(1)
    const v = (m.arts.cierre as { viabilidad: { no_viable: boolean; cifra: number | null; motivo: string } }).viabilidad
    expect(v.no_viable).toBe(true)
    expect(v.motivo).toBeTruthy()
    expect(m.encargos.get('e1')!.estado).toBe('cerrado')
  })
  it('🔴 sin acta todo es lo de hoy: el planteo lo pide un agente, y la firma no lleva viabilidad', async () => {
    const m = mundo(100)
    const a = await abrirConversacion(m.P, { client_id: 'c', dry_run: false, semilla: { evento: 'pedido', dias_activos_por_semana: 5 } })
    for (let i = 0; i < 25; i++) { const r = await avanzar(m.P, a.cuerpo.encargo_id as string); if (r.cuerpo.terminado) break }
    expect(m.llamadas[0].paso).toBe('planteo')
    expect(m.llamadas.map((l) => l.paso)).toContain('ajuste')
    for (const l of m.llamadas) expect(l.tarea).not.toContain('ya decidió canales y peso')
    expect(m.arts.cierre).toBeDefined()
    expect(m.arts.cierre).not.toHaveProperty('viabilidad')
    expect(m.arts.expediente).not.toHaveProperty('acta')
    expect((m.arts.bloque as { bloque: Bloque }).bloque.reparto).not.toHaveProperty('de_la_mesa')
  })

  it('🔴 las ventas del sitio llegan al expediente que leen los especialistas', async () => {
    const m = mundo(100)
    const ventas = { estado: 'medido', pedidos_reales: 0, texto: 'sin ventas reales por el sitio todavía' }
    const a = await abrirConversacion(m.P, { client_id: 'c', dry_run: false, semilla: { evento: 'pedido', dias_activos_por_semana: 5, ventas_del_negocio: ventas } as never })
    for (let i = 0; i < 25; i++) { const r = await avanzar(m.P, a.cuerpo.encargo_id as string); if (r.cuerpo.terminado) break }
    expect(m.arts.expediente).toMatchObject({ ventas_del_negocio: ventas })
    expect(m.llamadas.find((l) => l.paso === 'fpa')?.tarea).toContain('sin ventas reales por el sitio todavía')
  })
})

describe('el equilibrio con el reparto de la mesa', () => {
  const canales = [{ canal: 'whatsapp', peso: 0.9, piso_diario: 0 }, { canal: 'meta_ig', peso: 0.1, piso_diario: 0 }]
  it('🔴 sin el mínimo de Meta, un plan que se paga no sale como que no se paga', () => {
    const r0 = calcular({ ...base, reparto_de_la_mesa: true, canales })
    if (!r0.ok) throw new Error('no calculó')
    const marca = r0.reparto.marca / r0.reparto.meta_ig
    // la contribución cubre la pauta (costo ÷ (1 − marca)) con 30 % de holgura; con el total inflado por el 60 %, no la cubriría
    const ticket = ((r0.costos.base / (1 - marca)) * 1.3) / 0.5
    const r = calcular({ ...base, ticket, margen: 0.5, reparto_de_la_mesa: true, canales })
    if (!r.ok) throw new Error('no calculó')
    expect(r.equilibrio.cubre).toBe(true)
  })
})

describe('reservas de CC3 sobre #908', () => {
  const EXPED = { fecha: '2026-11-04' } as never
  const delActa = (canales: ActaV1['canales']) => entradaDesdeLaConversa({ planteo: planteoDelActa({ ...ACTA, canales }, EXP) as never, consultas: {} as never, expediente: EXPED })
  it('🔴 un canal para después no entra al reparto: monto 0 y su motivo', () => {
    const e = delActa([{ canal: 'Instagram', peso: 1, razon: 'r' }, { canal: 'TikTok', peso: 0.5, razon: 'r', activo: false, condicion: 'cuando haya video' }])
    if (!e.ok) throw new Error('sin entrada')
    const r = calcular(e.entrada)
    if (!r.ok) throw new Error('no calculó')
    const fila = r.reparto.otros.find((x) => x.canal === 'video_corto')
    expect(fila).toMatchObject({ monto: 0, activo: false })
    expect(fila?.motivo).toMatch(/diferido.*cuando haya video/)
    expect(r.reparto.parte_meta_ig).toBeCloseTo(1, 2)
  })
  it('🔴 un acta sin Meta no recibe la alerta del 60 %', () => {
    const e = delActa([{ canal: 'Google Ads', peso: 1, razon: 'r' }])
    expect(e.ok).toBe(false)
    const conCosto = entradaDesdeLaConversa({ planteo: planteoDelActa({ ...ACTA, canales: [{ canal: 'Google Ads', peso: 1, razon: 'r' }], costos_de_la_mesa: { busqueda: { min: 1, max: 2 } } }, EXP) as never, consultas: {} as never, expediente: EXPED })
    if (!conCosto.ok) throw new Error('sin entrada')
    expect(conCosto.alertas.join()).not.toMatch(/60 %|Meta\+Instagram/)
  })
  it('🔴 sin cálculo lo dice', () => { expect(viabilidadDelBloque(null).motivo).toBe('sin cálculo: no se pudo medir') })
})
