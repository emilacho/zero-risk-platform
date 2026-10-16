/**
 * La firma del jefe financiero (CC#1 · 16-oct): (1) lo que el dueño confirmó cuenta como COMPROBADO, no como «dado por verificado»; (2) un hallazgo crítico que el jefe marcó `resuelto`
 * no cuenta contra la firma. Y los casos contrarios: lo no confirmado sigue exigiendo prueba, un crítico abierto sigue bloqueando. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { calcular } from '../src/lib/finanzas/calculadora'
import { esConfirmadoPorElDueno, separarDadoPorVerificado } from '../src/lib/finanzas/confirmado-por-dueno'
import { cerrar, derivar } from '../src/lib/finanzas/conversa/orquestador'
import { PLANTILLA_FINANCIERA } from '../src/lib/finanzas/conversa/plantilla'
import type { PuertosDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { validarAcuerdo } from '../src/lib/finanzas/conversa/esquemas'
import { decidirFirma, resueltosSinEstado } from '../src/lib/finanzas/firma'
import type { Entrada } from '../src/lib/finanzas/tipos'
import { estadoInicial } from '../src/lib/oficina/tipos'

const RESPUESTAS = [
  { clave: 'presupuesto_de_pauta', valor: '200 por semana (moneda de la ficha del cliente)', literal: '200 por semana (moneda de la ficha del cliente)' },
  { clave: 'costo_por_plato', valor: '2,10 por plato (dato del dueño; no es un margen calculado)', literal: '2,10 por plato (dato del dueño; no es un margen calculado)' },
  { clave: 'lista_propia_de_clientes', valor: 'no tiene lista propia de clientes', literal: 'no tiene lista propia de clientes' },
  { clave: 'pixel_de_seguimiento', valor: 'no tiene píxel', literal: 'no tiene píxel' },
  { clave: 'apertura_de_la_sede', valor: 'la sede norte sin abrir', literal: 'la sede norte sin abrir' },
]

describe('REGLA 1 · lo que el dueño confirmó', () => {
  it('una línea del plan que dice «confirmado por el dueño» Y coincide con una respuesta suya cuenta como comprobada', () => {
    for (const l of [
      'presupuesto de pauta $200/semana (confirmado por dueño)',
      'costo por plato $2.10 (confirmado por dueño — dato contable, no margen calculado)',
      'sin lista de contactos propia (confirmado por dueño)',
      'sin píxel de seguimiento (confirmado por el dueño)',
      'sede norte sin abrir (confirmado por dueño)',
    ]) expect(esConfirmadoPorElDueno(l, RESPUESTAS), l).toBe(true)
  })
  it('«2,10», «2.10» y «$2.10» son la misma cifra', () => {
    const r = [{ clave: 'x', literal: 'cuesta 2,10 cada una' }]
    for (const l of ['cada una cuesta 2.10 (confirmado por dueño)', 'cuesta $2,10 cada una (confirmado por el dueño)']) expect(esConfirmadoPorElDueno(l, r)).toBe(true)
  })
  it('CASO CONTRARIO: sin la marca de confirmación NO cuenta, aunque use su dato', () => {
    expect(esConfirmadoPorElDueno('margen bruto ~40% sobre el producto: (3.50 − 2.10) / 3.50', RESPUESTAS)).toBe(false)
    expect(esConfirmadoPorElDueno('presupuesto de pauta 200 por semana', RESPUESTAS)).toBe(false)
  })
  it('CASO CONTRARIO: decir «confirmado por el dueño» sin una respuesta real que lo respalde NO cuenta (el agente no se comprueba a sí mismo)', () => {
    expect(esConfirmadoPorElDueno('el local abre a las 8 (confirmado por dueño)', RESPUESTAS)).toBe(false)
    expect(esConfirmadoPorElDueno('presupuesto de pauta $200/semana (confirmado por dueño)', [])).toBe(false)
    expect(esConfirmadoPorElDueno('presupuesto de pauta $900/semana (confirmado por dueño)', [{ clave: 'otra_cosa', literal: 'abre a las 8' }])).toBe(false)
  })
  it('separa lo confirmado de lo que sigue sin comprobar', () => {
    const s = separarDadoPorVerificado(['presupuesto de pauta $200/semana (confirmado por dueño)', 'ticket promedio 10,87 (30 días)', 'tasa de cierre 8 % (resuelto por el jefe)'], RESPUESTAS)
    expect(s.confirmado_por_el_dueno).toHaveLength(1)
    expect(s.sin_comprobar).toEqual(['ticket promedio 10,87 (30 días)', 'tasa de cierre 8 % (resuelto por el jefe)'])
  })
})

describe('REGLA 2 · hallazgos resueltos', () => {
  const h = (severidad: 'critico' | 'alto', estado?: 'abierto' | 'resuelto') => ({ severidad, que: 'x', ...(estado ? { estado } : {}) })
  it('un crítico RESUELTO no bloquea la firma', () => {
    expect(decidirFirma({ hallazgos: [h('critico', 'resuelto'), h('critico', 'resuelto'), h('alto')], correcciones_hechas: 0 })).toEqual({ estado: 'firmado', criticos: 0, criticos_resueltos: 2 })
  })
  it('CASO CONTRARIO: un crítico abierto, o sin estado, sigue bloqueando', () => {
    expect(decidirFirma({ hallazgos: [h('critico', 'abierto')], correcciones_hechas: 1 }).estado).toBe('sin_firma')
    expect(decidirFirma({ hallazgos: [h('critico')], correcciones_hechas: 1 }).estado).toBe('sin_firma')
    expect(decidirFirma({ hallazgos: [h('critico')], correcciones_hechas: 0 }).estado).toBe('requiere_correccion')
    expect(decidirFirma({ hallazgos: [h('critico', 'resuelto'), h('critico', 'abierto')], correcciones_hechas: 1 })).toMatchObject({ estado: 'sin_firma', criticos: 1, criticos_resueltos: 1 })
  })
  it('el texto «RESUELTO» sin estado NO se acepta en silencio: se detecta', () => {
    expect(resueltosSinEstado([{ que: 'Presupuesto: RESUELTO. todo bien' }, { que: 'LTV: alerta vigente' }, { que: 'Tasa: resuelta en la ronda 1', estado: 'resuelto' }, { que: 'otro, resuelto', estado: undefined }])).toHaveLength(2)
  })
  it('el esquema acepta abierto/resuelto, acepta su ausencia y rechaza otro valor', () => {
    const base = { salida: 'sale', hallazgos: [{ severidad: 'critico', que: 'x', estado: 'resuelto' }], conflictos_resueltos: [], preguntas_a_emilio: [] }
    expect(validarAcuerdo(base).ok).toBe(true)
    expect(validarAcuerdo({ ...base, hallazgos: [{ severidad: 'critico', que: 'x' }] }).ok).toBe(true)
    const mal = validarAcuerdo({ ...base, hallazgos: [{ severidad: 'critico', que: 'x', estado: 'listo' }] })
    expect(mal.ok).toBe(false)
  })
  it('derivar: un crítico resuelto no pide ronda 2 ni alude a nadie; uno abierto sí', () => {
    const cierre = PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === 'cierre')!
    const resuelto = derivar(cierre, { salida: 'sale', hallazgos: [{ severidad: 'critico', que: 'x', alude: 'fpa', estado: 'resuelto' }], conflictos_resueltos: [], preguntas_a_emilio: [] })
    expect(resuelto).toMatchObject({ criticos: 0, criticos_resueltos: 1, requiere_ronda_2: false, alude: { fpa: false } })
    const abierto = derivar(cierre, { salida: 'sale', hallazgos: [{ severidad: 'critico', que: 'x', alude: 'fpa' }], conflictos_resueltos: [], preguntas_a_emilio: [] })
    expect(abierto).toMatchObject({ criticos: 1, requiere_ronda_2: true, alude: { fpa: true } })
  })
})

describe('EL CIERRE (cerrar) con las dos reglas', () => {
  const ENTRADA: Entrada = { meta_por_semana: 120, pasos: [{ tasa: 0.08 }], ticket: 10, margen: 0.4, referencia: { min: 0.8, max: 1, base: 0.9, tipo: 'supuesto', fuente: 'práctica' }, dias_activos_por_semana: 7, canales: [], produccion: { monto: 0, origen: 'supuesto' }, base_por_semana: 100 }
  const calc = calcular(ENTRADA)
  if (!calc.ok) throw new Error('la entrada de práctica debe calcular')
  const mundo = (opts: { hallazgos: unknown[]; verificado: string[]; respuestas?: typeof RESPUESTAS; dry_run?: boolean }) => {
    const guardados: unknown[] = []
    const P = {
      tableros: {
        invocacionDelJefe: async () => true,
        guardarTablero: async (t: unknown) => { guardados.push(t); return { id: 'tab-1' } },
        actualizarTablero: async (_id: string, patch: { estado: string }) => { guardados.push(patch) },
      },
      ahora: () => new Date(1_700_000_000_000),
    } as unknown as PuertosDeConversa
    const e = { id: 'enc-1', client_id: 'cliente-prueba', estado: 'en_curso', estado_del_motor: estadoInicial(), gasto_usd: 1, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: opts.dry_run ?? false, semilla: { respuestas_del_dueno: opts.respuestas ?? RESPUESTAS } } as never
    const arts = {
      bloque: { hay_bloque: true, bloque: calc, entrada: ENTRADA, huella: 'h1' },
      acuerdo: { salida: 'sale_ajustada', hallazgos: opts.hallazgos, requiere_ronda_2: false },
      planteo_fijado: { dado_por_verificado: opts.verificado },
    } as Record<string, Record<string, any>>
    return { P, e, arts, guardados }
  }
  const CONF = ['presupuesto de pauta $200/semana (confirmado por dueño)', 'costo por plato $2.10 (confirmado por dueño)']

  it('todo lo dado por verificado viene del dueño y los críticos están resueltos → FIRMADO, sale ajustada, sin tope', async () => {
    const m = mundo({ hallazgos: [{ severidad: 'critico', que: 'A: RESUELTO.', estado: 'resuelto' }, { severidad: 'medio', que: 'B: alerta vigente' }], verificado: CONF })
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto).toMatchObject({ estado: 'firmado', salida: 'sale_ajustada', tope_aplicado: false, criticos_abiertos: 0, criticos_resueltos: 1, alerta_verificado: null })
    expect(r.artefacto.confirmado_por_el_dueno).toEqual(CONF)
    expect(r.artefacto.dado_por_verificado_sin_comprobar).toEqual([])
    expect(r.sin_acuerdo).toBe(false)
  })
  it('CASO CONTRARIO 1: queda algo dado por verificado SIN respaldo → sale con alerta y tope (pero firma si no hay críticos abiertos)', async () => {
    const m = mundo({ hallazgos: [{ severidad: 'critico', que: 'A', estado: 'resuelto' }], verificado: [...CONF, 'ticket promedio 10,87 (30 días)'] })
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto).toMatchObject({ salida: 'sale_con_alerta', tope_aplicado: true, estado: 'firmado' })
    expect(r.artefacto.dado_por_verificado_sin_comprobar).toEqual(['ticket promedio 10,87 (30 días)'])
    expect(String(r.artefacto.alerta_verificado)).toContain('ticket promedio')
    expect(String(r.artefacto.alerta_verificado)).not.toContain('presupuesto de pauta')
  })
  it('CASO CONTRARIO 2: «confirmado por el dueño» sin respuesta del dueño que lo respalde sigue exigiendo prueba', async () => {
    const m = mundo({ hallazgos: [], verificado: CONF, respuestas: [] })
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto).toMatchObject({ salida: 'sale_con_alerta', tope_aplicado: true })
    expect(r.artefacto.confirmado_por_el_dueno).toEqual([])
  })
  it('CASO CONTRARIO 3: un crítico abierto sigue bloqueando la firma', async () => {
    const m = mundo({ hallazgos: [{ severidad: 'critico', que: 'A', estado: 'abierto' }, { severidad: 'critico', que: 'B', estado: 'resuelto' }], verificado: CONF })
    const m2 = mundo({ hallazgos: [{ severidad: 'critico', que: 'A' }], verificado: CONF })
    for (const x of [m, m2]) {
      x.arts.acuerdo.requiere_ronda_2 = true // ya hubo ronda 2: sin otra corrección
      const r = await cerrar(x.P, x.e, x.arts)
      expect(r.artefacto.estado).toBe('sin_firma')
      expect(r.sin_acuerdo).toBe(true)
    }
  })
  it('el texto «RESUELTO» sin estado cuenta como abierto y se AVISA', async () => {
    const m = mundo({ hallazgos: [{ severidad: 'critico', que: 'Presupuesto: RESUELTO. ya está' }], verificado: [] })
    m.arts.acuerdo.requiere_ronda_2 = true
    const r = await cerrar(m.P, m.e, m.arts)
    expect(r.artefacto.estado).toBe('sin_firma')
    expect(String(r.artefacto.alerta_hallazgos_sin_estado)).toContain('no traen estado')
  })
  it('en seco no se escribe nada y el resultado es el mismo', async () => {
    const m = mundo({ hallazgos: [{ severidad: 'critico', que: 'A', estado: 'resuelto' }], verificado: CONF, dry_run: true })
    const r = await cerrar(m.P, m.e, m.arts)
    expect(m.guardados).toEqual([])
    expect(r.artefacto.criticos_resueltos).toBe(1)
  })
})
