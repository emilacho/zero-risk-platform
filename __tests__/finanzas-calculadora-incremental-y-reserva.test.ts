/**
 * (CC#1 · 16-oct) (1) La pauta se dimensiona para lo que SE AÑADE a la línea base de ventas, no para la meta total. (2) La reserva del cierre sale de lo medido, sin bajar la defensa del tope. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { calcular } from '../src/lib/finanzas/calculadora'
import { entradaDesdeLaConversa } from '../src/lib/finanzas/conversa/entrada'
import type { DatoConProcedencia } from '../src/lib/finanzas/conversa/esquemas'
import { plantillaDelEncargo } from '../src/lib/finanzas/conversa/orquestador'
import { PISO_DE_RESERVA_DEL_RECIERRE_USD, PLANTILLA_FINANCIERA, RESERVA_DEL_CIERRE_USD, TECHO_DE_RESERVA_DEL_RECIERRE_USD, reservaDelCierre2 } from '../src/lib/finanzas/conversa/plantilla'
import type { EncargoDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { lineaBaseSemanal } from '../src/lib/finanzas/linea-base'
import type { Entrada } from '../src/lib/finanzas/tipos'
import { estadoInicial, type Estado } from '../src/lib/oficina/tipos'
import { siguientePaso } from '../src/lib/oficina/motor'

// números de práctica, sin cliente: meta 120/sem, 8 % de los resultados llegan a venta, costo por resultado 0,9 (arranque 30 % → 1,17)
const ENTRADA: Entrada = {
  meta_por_semana: 120, pasos: [{ tasa: 0.08 }], ticket: 10, margen: 0.4, referencia: { min: 0.8, max: 1, base: 0.9, tipo: 'supuesto', fuente: 'práctica' },
  dias_activos_por_semana: 7, canales: [], produccion: { monto: 0, origen: 'supuesto' },
}
const valor = (r: ReturnType<typeof calcular>, k: string) => (r.ok ? r.cifras[k]?.valor : undefined)

describe('CALCULADORA · la pauta compra solo lo que se AÑADE a la línea base', () => {
  it('sin línea base: igual que siempre (meta total) y lo DICE', () => {
    const r = calcular(ENTRADA)
    expect(valor(r, 'resultados_por_semana')).toBe(1500)
    expect(valor(r, 'pauta_rendimiento_semana')).toBe(1755)
    expect(r.ok && r.alertas.some((a) => a.includes('sin línea base'))).toBe(true)
    expect(r.ok && r.cifras.base_por_semana).toBeUndefined()
  })
  it('con línea base: la pauta sale de los resultados incrementales (el caso de práctica: ≈ 186, no 1.755)', () => {
    const r = calcular({ ...ENTRADA, base_por_semana: 107.14, base_fuente: 'punto de venta · 30 días' })
    expect(valor(r, 'base_por_semana')).toBe(107.14)
    expect(valor(r, 'meta_incremental_por_semana')).toBe(12.86)
    expect(valor(r, 'resultados_por_semana')).toBeCloseTo(160.75, 1)
    expect(valor(r, 'pauta_rendimiento_semana')).toBeCloseTo(188.08, 1)
    expect(r.ok && r.cifras.base_por_semana.fuente).toBe('punto de venta · 30 días')
    expect(r.ok && r.alertas.some((a) => a.includes('SE AÑADEN'))).toBe(true)
    expect(r.ok && r.alertas.some((a) => a.includes('sin línea base'))).toBe(false)
  })
  it('es general: el mismo cálculo con otra base y otra meta (no hay número fijo)', () => {
    const r = calcular({ ...ENTRADA, meta_por_semana: 50, base_por_semana: 40, pasos: [{ tasa: 0.5 }] })
    expect(valor(r, 'resultados_por_semana')).toBe(20)
    expect(valor(r, 'pauta_rendimiento_semana')).toBe(23.4)
  })
  it('la base que ya cubre la meta deja la pauta en 0, sin dividir ni inventar, y lo dice', () => {
    for (const base of [120, 150]) {
      const r = calcular({ ...ENTRADA, base_por_semana: base })
      expect(r.ok).toBe(true)
      expect(valor(r, 'pauta_rendimiento_semana')).toBe(0)
      expect(r.ok && r.alertas.some((a) => a.includes('ya cubre la meta'))).toBe(true)
      expect(r.ok && Number.isFinite(r.reparto.total_mes)).toBe(true)
    }
  })
  it('una base inválida (0, negativa, texto) se ignora como si no hubiera', () => {
    for (const b of [0, -5, Number.NaN, null, undefined]) expect(valor(calcular({ ...ENTRADA, base_por_semana: b as never }), 'pauta_rendimiento_semana')).toBe(1755)
  })
  it('el equilibrio también va sobre lo incremental: meta de equilibrio con base = base + la del mismo plan sin base', () => {
    // contribución por venta 4 (10 × 0,4); con producción fija para que el equilibrio exista
    const e: Entrada = { ...ENTRADA, ticket: 20, margen: 0.5, produccion: { monto: 100, origen: 'supuesto' } }
    const sin = calcular({ ...e, meta_por_semana: 10 })
    const con = calcular({ ...e, meta_por_semana: 110, base_por_semana: 100 })
    expect(sin.ok && con.ok).toBe(true)
    if (sin.ok && con.ok && sin.equilibrio.meta_de_equilibrio_semana != null) {
      expect(con.equilibrio.meta_de_equilibrio_semana).toBeCloseTo(100 + sin.equilibrio.meta_de_equilibrio_semana, 1)
      expect(con.equilibrio.cubre).toBe(sin.equilibrio.cubre)
      expect(con.equilibrio.meta_actual).toBe(110)
      if (sin.equilibrio.meta_sugerida_semana != null && con.equilibrio.meta_sugerida_semana != null) expect(con.equilibrio.meta_sugerida_semana).toBeGreaterThanOrEqual(100 + sin.equilibrio.meta_sugerida_semana - 1)
    }
  })
  it('el costo por venta del plan se reparte entre las ventas que SE AÑADEN', () => {
    const e: Entrada = { ...ENTRADA, ticket: 20, margen: 0.5, produccion: { monto: 100, origen: 'supuesto' } }
    const a = calcular({ ...e, base_por_semana: 100, meta_por_semana: 120 })
    expect(a.ok && a.alertas.find((x) => x.startsWith('dato que no bloquea'))).toBeTruthy()
  })
})

describe('LÍNEA BASE · de dónde sale (y de dónde no)', () => {
  const t = (clave: string, valor: unknown, desde: string, hasta: string, extra: Partial<DatoConProcedencia> = {}): DatoConProcedencia =>
    ({ clave, valor, procedencia: 'cerebro', fuente: 'cerebro · punto de venta', periodo: { tipo: 'ventana', desde, hasta }, estado: 'trajo', identidad: 'coincide', ...extra })
  const mes = t('metrica:pv:tickets:2026-10', 252, '2026-10-01', '2026-10-15')
  const treinta = t('metrica:pv:tickets:ultimos_30_dias', 460, '2026-09-16', '2026-10-15')
  it('toma la ventana más larga y la lleva a semana (460 en 30 días = 107,33)', () => {
    expect(lineaBaseSemanal({ datos: [mes, treinta] })?.por_semana).toBe(107.33)
    expect(lineaBaseSemanal({ datos: [treinta, mes] })?.por_semana).toBe(107.33)
  })
  it('una ventana de menos de 14 días no sirve', () => { expect(lineaBaseSemanal({ datos: [t('metrica:pv:tickets:2026-10', 100, '2026-10-01', '2026-10-10')] })).toBeNull() })
  it('lo dado al abrir gana sobre lo medido', () => { expect(lineaBaseSemanal({ datos: [treinta], dada: 90 })?.por_semana).toBe(90) })
  it('no usa datos de ensayo, huecos, otra identidad, sin lectura ni sin periodo', () => {
    for (const extra of [{ procedencia: 'de_ensayo' }, { procedencia: 'hueco' }, { procedencia: 'supuesto' }, { identidad: 'no_coincide' }, { identidad: 'no_comprobable' }, { estado: 'error' }] as Array<Partial<DatoConProcedencia>>)
      expect(lineaBaseSemanal({ datos: [{ ...treinta, ...extra } as DatoConProcedencia] })).toBeNull()
    expect(lineaBaseSemanal({ datos: [{ ...treinta, periodo: undefined }] })).toBeNull()
    expect(lineaBaseSemanal({ datos: [{ ...treinta, periodo: { desde: '2026-10-15', hasta: '2026-09-16' } }] })).toBeNull()
    expect(lineaBaseSemanal({ datos: [{ ...treinta, valor: 0 }] })).toBeNull()
    expect(lineaBaseSemanal({ datos: [{ ...treinta, valor: '460' }] })).toBeNull()
  })
  it('no confunde otras métricas (ticket promedio, ventas en dinero)', () => {
    expect(lineaBaseSemanal({ datos: [t('metrica:pv:ticket_promedio:ultimos_30_dias', 10.87, '2026-09-16', '2026-10-15'), t('metrica:pv:ventas:ultimos_30_dias', 4000, '2026-09-16', '2026-10-15')] })).toBeNull()
  })
  it('sin nada: null (y la calculadora lo dice)', () => { expect(lineaBaseSemanal({})).toBeNull(); expect(lineaBaseSemanal({ datos: [], dada: 'x' })).toBeNull() })
  it('de la conversa a la calculadora: la entrada lleva la base medida y la pauta sale incremental', () => {
    const planteo = { meta_por_semana: 120, zonas: [], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'compra', canales: [], no_se: [] }
    const redes = { agente: 'redes', resumen: 'x', supuestos: { costo_por_resultado: { min: 0.8, max: 1, base: 0.9 }, tasa_cierre: { min: 0.08, max: 0.08 } } }
    const r = entradaDesdeLaConversa({ planteo: planteo as never, consultas: { redes: redes as never }, expediente: { datos: [mes, treinta] } })
    expect(r.ok && r.entrada.base_por_semana).toBe(107.33)
    expect(r.ok && r.entrada.base_fuente).toContain('460 en 30 días')
    const sin = entradaDesdeLaConversa({ planteo: planteo as never, consultas: { redes: redes as never }, expediente: { datos: [] } })
    expect(sin.ok && sin.entrada.base_por_semana).toBeUndefined()
  })
})

describe('RESERVA DEL CIERRE · lo medido + margen, sin bajar la defensa', () => {
  it('la reserva general sale del máximo observado × 1,3 (0,33), no del 0,40 fijo', () => {
    expect(RESERVA_DEL_CIERRE_USD).toBe(0.33)
    expect(PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === 'cierre')?.tope_usd).toBe(0.33)
    // el re-cierre (cierre_2) reserva más: piso 0,40
    expect(PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === 'cierre_2')?.tope_usd).toBe(0.4)
  })
  it('el re-cierre (cierre 2) reserva el costo REAL del cierre 1 x 1,3, con piso 0,40 y techo 0,50 (medido 19-oct: 0,2287 a 0,3142 por una salida de 5.293 a 11.528 tokens)', () => {
    expect(PISO_DE_RESERVA_DEL_RECIERRE_USD).toBe(0.4)
    expect(TECHO_DE_RESERVA_DEL_RECIERRE_USD).toBe(0.5)
    expect(reservaDelCierre2(0.1489)).toBe(0.4)
    expect(reservaDelCierre2(0.189)).toBe(0.4)
    expect(reservaDelCierre2(0.3)).toBe(0.4) // 0,3 x 1,3 = 0,39 sube al piso
    expect(reservaDelCierre2(0.31)).toBe(0.41)
    expect(reservaDelCierre2(0.3142)).toBe(0.41) // lo que costo el re-cierre real: cabe con margen
    expect(reservaDelCierre2(0.38)).toBe(0.5)
    expect(reservaDelCierre2(5)).toBe(0.5)
    for (const x of [undefined, null, 0, -1, Number.NaN]) expect(reservaDelCierre2(x as never)).toBe(0.4)
  })
  const enc = (gasto: number, tope = 3): EncargoDeConversa => ({ id: 'e', client_id: 'c', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: gasto, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: { tope_encargo_usd: tope } })
  const turno = (paso: string, costo: number, estado: 'hecho' | 'fallo' = 'hecho'): TurnoDeConversa => ({ n: 1, paso, agente: 'x', ronda: 1, estado, costo_usd: costo, salida: {} })
  it('la plantilla del encargo toma el costo del cierre 1 hecho; sin él, no cambia', () => {
    const sin = plantillaDelEncargo(enc(1))
    expect(sin.pasos.find((p) => p.clave === 'cierre_2')?.tope_usd).toBe(0.4)
    const con = plantillaDelEncargo(enc(1), [turno('cierre', 0.33)])
    expect(con.pasos.find((p) => p.clave === 'cierre_2')?.tope_usd).toBe(0.43)
    expect(plantillaDelEncargo(enc(1), [turno('cierre', 0.21)]).pasos.find((p) => p.clave === 'cierre_2')?.tope_usd).toBe(0.4)
    expect(con.pasos.find((p) => p.clave === 'cierre')?.tope_usd).toBe(0.33)
    // un cierre fallido o sin costo no cuenta
    expect(plantillaDelEncargo(enc(1), [turno('cierre', 0.21, 'fallo')]).pasos.find((p) => p.clave === 'cierre_2')?.tope_usd).toBe(0.4)
    expect(plantillaDelEncargo(enc(1), [turno('cierre', 0)]).pasos.find((p) => p.clave === 'cierre_2')?.tope_usd).toBe(0.4)
  })
  // el caso real de la ronda 2: gasto 2,6027, tope del encargo 3,00, el cierre 1 costó ≈ 0,22
  const estadoAntesDelCierre2 = (gasto: number): Estado => {
    const i = PLANTILLA_FINANCIERA.pasos.findIndex((p) => p.clave === 'calculo_2')
    return { ...estadoInicial(), ultimo: i, pasos_ejecutados: i + 1, gasto_usd: gasto, artefactos: { bloque_2: { version: 1, version_consumida: 0, datos: { cambio: true } }, acuerdo: { version: 1, version_consumida: 1, datos: { requiere_ronda_2: true } } } }
  }
  it('con la reserva del re-cierre (0,40) el borde del tope 3,00 es 2,60: cabe con 2,60 y no con 2,6027', () => {
    const nueva = plantillaDelEncargo(enc(2.6), [turno('cierre', 0.22)])
    const cabe = siguientePaso(estadoAntesDelCierre2(2.6), nueva)
    expect(cabe.accion === 'ejecutar' && cabe.paso.clave).toBe('cierre_2')
    const no = siguientePaso(estadoAntesDelCierre2(2.6027), nueva)
    expect(no.accion === 'cierre_por_tope' && no.razon).toBe('tope_de_gasto')
  })
  it('la defensa NO baja: si lo cobrado más la reserva pasa del tope, el tope manda', () => {
    const nueva = plantillaDelEncargo(enc(2.70), [turno('cierre', 0.22)])
    const s = siguientePaso(estadoAntesDelCierre2(2.70), nueva)
    expect(s.accion).toBe('cierre_por_tope')
    expect(s.accion === 'cierre_por_tope' && s.razon).toBe('tope_de_gasto')
    // y el tope del encargo sigue sin pasar de 3,00 aunque la semilla pida más
    expect(plantillaDelEncargo(enc(0, 9), [turno('cierre', 0.22)]).limites.tope_encargo_usd).toBe(3)
  })
})

describe('RESERVA CONTRA HOLGURA DE LA PRUEBA · el tope total tambien frena', () => {
  const prueba = { limite_usd: 5, base_usd: 4.7238, encargo_base_usd: 2.8314 }
  const enc = (semilla: Record<string, unknown>): EncargoDeConversa => ({ id: 'e', client_id: 'c', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 2.8314, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla } as unknown as EncargoDeConversa)
  const antesDelCierre2 = (gasto: number): Estado => {
    const i = PLANTILLA_FINANCIERA.pasos.findIndex((p) => p.clave === 'calculo_2')
    return { ...estadoInicial(), ultimo: i, pasos_ejecutados: i + 1, gasto_usd: gasto, artefactos: { bloque_2: { version: 1, version_consumida: 0, datos: { cambio: true } }, acuerdo: { version: 1, version_consumida: 1, datos: { requiere_ronda_2: true } } } }
  }
  // tope del encargo holgado (3,60) para aislar la regla de la PRUEBA
  const FIRMA = { quien: 'Emilio', cuando: '2026-10-19T16:43+02:00', valor: 3.6, papel: 'p.md' }
  const con = (t: unknown) => plantillaDelEncargo(enc({ tope_encargo_usd: 3.6, firma_tope: FIRMA, tope_de_prueba: t }))
  it('la reserva NO cabe en la holgura (0,40 > 0,2762): no arranca y lo dice con la razon de la prueba', () => {
    const s = siguientePaso(antesDelCierre2(2.8314), con(prueba))
    expect(s.accion).toBe('cierre_por_tope')
    expect(s.accion === 'cierre_por_tope' && s.razon).toBe('tope_de_prueba')
    expect(s.accion === 'cierre_por_tope' && s.detalle).toContain('holgura de la prueba 0.2762')
  })
  it('la reserva cabe: con holgura amplia arranca; justo en el borde (reserva = holgura) tambien; un poco menos no', () => {
    expect(siguientePaso(antesDelCierre2(2.8314), con({ ...prueba, base_usd: 4.5 })).accion).toBe('ejecutar')
    expect(siguientePaso(antesDelCierre2(2.8314), con({ ...prueba, base_usd: 4.6 })).accion).toBe('ejecutar')
    expect(siguientePaso(antesDelCierre2(2.8314), con({ ...prueba, base_usd: 4.6001 })).accion).toBe('cierre_por_tope')
  })
  it('lo que el encargo gasta DESDE la base resta de la holgura; lo anterior a la base no se cuenta dos veces', () => {
    const pl = con({ ...prueba, base_usd: 4.5 })
    expect(siguientePaso(antesDelCierre2(2.8314 + 0.1001), pl).accion).toBe('cierre_por_tope') // holgura 0,5 - 0,1001 = 0,3999 < 0,40
    expect(siguientePaso(antesDelCierre2(2.8314 + 0.1), pl).accion).toBe('ejecutar')
    expect(siguientePaso(antesDelCierre2(2.0), pl).accion).toBe('ejecutar') // gasto menor que la base del encargo: ni suma ni resta
    // con la holgura justa (0,2762) un gasto POR DEBAJO de la base del encargo no la agranda: sigue sin caber 0,40
    const justa = siguientePaso(antesDelCierre2(2.0), con(prueba))
    expect(justa.accion === 'cierre_por_tope' && justa.razon).toBe('tope_de_prueba')
    expect(justa.accion === 'cierre_por_tope' && justa.detalle).toContain('holgura de la prueba 0.2762')
  })
  it('un paso sin reserva (codigo, tope 0) nunca se frena por la prueba, aunque la holgura sea negativa', () => {
    const pl = con({ ...prueba, base_usd: 6 })
    const i = PLANTILLA_FINANCIERA.pasos.findIndex((p) => p.clave === 'firma')
    const e = { ...antesDelCierre2(2.8314), ultimo: i - 1, artefactos: { ...antesDelCierre2(2.8314).artefactos, acuerdo_2: { version: 1, version_consumida: 0, datos: {} } } }
    const s = siguientePaso(e, pl)
    expect(s.accion === 'ejecutar' && s.paso.clave).toBe('firma')
  })
  it('el caso real de Naufrago (tope 3,20, gasto 2,8314): con reserva 0,40 el tope del ENCARGO ya frena (3,2314 > 3,20); el re-cierre exigiria tope >= 3,24', () => {
    const pl = plantillaDelEncargo(enc({ tope_encargo_usd: 3.2, firma_tope: { ...FIRMA, valor: 3.2 }, tope_de_prueba: { ...prueba, base_usd: 4.5 } }))
    const s = siguientePaso(antesDelCierre2(2.8314), pl)
    expect(s.accion === 'cierre_por_tope' && s.razon).toBe('tope_de_gasto')
  })
  it('el tope de la prueba rige tambien cuando el encargo NO pide tope propio (plantilla 1,50)', () => {
    const pl = plantillaDelEncargo(enc({ tope_de_prueba: { limite_usd: 1.2, base_usd: 0.9, encargo_base_usd: 0 } }))
    expect(pl.limites.tope_encargo_usd).toBe(1.5)
    expect(pl.limites.prueba).toEqual({ limite_usd: 1.2, base_usd: 0.9, encargo_base_usd: 0 })
    const s = siguientePaso(antesDelCierre2(0), pl) // el re-cierre reserva 0,40 > holgura 0,30
    expect(s.accion === 'cierre_por_tope' && s.razon).toBe('tope_de_prueba')
  })
  it('un infinito en cualquiera de los tres campos se rechaza (si no, el freno fallaria abierto)', () => {
    for (const campo of ['limite_usd', 'base_usd', 'encargo_base_usd'] as const) {
      for (const inf of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(con({ ...prueba, [campo]: inf }).limites.prueba).toBeUndefined()
    }
  })
  it('sin tope_de_prueba, o mal formado, no cambia nada', () => {
    for (const t of [undefined, null, {}, { ...prueba, limite_usd: 0 }, { ...prueba, base_usd: -1 }, { ...prueba, base_usd: '4' }, { ...prueba, encargo_base_usd: Number.NaN }]) {
      const pl = con(t)
      expect(pl.limites.prueba).toBeUndefined()
      expect(siguientePaso(antesDelCierre2(2.7), pl).accion).toBe('ejecutar')
    }
  })
})
