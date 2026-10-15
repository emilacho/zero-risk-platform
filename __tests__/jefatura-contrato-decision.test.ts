/**
 * J6 ter · el contrato del paso «decisión» (15-oct). El modelo real contestó `"estado":"tomado"` (masculino) y el validador exigía `tomada|no_tomada`: la revisión cayó a `fallida` 2 de 2.
 *  (a) el pedido fija el literal exacto con un ejemplo válido;  (b) el validador normaliza variantes INEQUÍVOCAS (género, mayúsculas, tildes, espacios) y lo anota; lo ambiguo sigue fallando.
 * Entradas: las salidas REALES del modelo en J6 bis (agent_invocations 179243/179244/179246/179247), grabadas en `fixtures/jefatura-j6bis`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizarEnumerados, plegarEnumerado, procesarSalida, type Esq } from '../src/lib/oficina/salida'
import { procesarSalidaDeRevision, separarTextoYResolucion, MARCA_DE_FIN_DE_RESOLUCION, MARCA_DE_INICIO_DE_RESOLUCION } from '../src/lib/jefatura/revision/formatos'
import { REGLA_DEL_ESTADO, tareaDeCorreccion, tareaDeDecision } from '../src/lib/jefatura/revision/pedidos'

const REAL = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/jefatura-j6bis/salidas-reales-decision.json'), 'utf8')) as Record<string, { salida: string }>
const estado = (v: unknown) => ((v as any).respuestas as Array<{ estado: string }>).map((r) => r.estado)

describe('(b) las salidas REALES de J6 bis', () => {
  for (const id of ['179244', '179247']) {
    it(`${id}: «tomado» + texto después del JSON ⇒ ahora pasa, normalizado y anotado (resolucion.v1 y resolucion_solo.v1)`, () => {
      for (const esquema of ['resolucion.v1', 'resolucion_solo.v1']) {
        const r = procesarSalidaDeRevision(REAL[id].salida, esquema, 1, 1)
        expect(r.ok, esquema).toBe(true)
        if (!r.ok) return
        expect(estado(r.valor)).toEqual(['tomada'])
        expect(r.normalizados).toEqual(['$.respuestas[0].estado: «tomado» → «tomada»'])
      }
    })
    it(`${id}: con la oficina (sin pedir normalizar) sigue fallando igual que antes`, () => {
      const r = procesarSalida(REAL[id].salida, 'resolucion.v1', 1, 1)
      expect(r.ok).toBe(false)
      if (!r.ok && r.accion === 'falla_visible') expect(r.errores.join(' ')).toContain('«tomado» fuera de')
    })
  }
  for (const id of ['179243', '179246']) {
    it(`${id}: claves inventadas («item», «decision», «tomar») NO se adivinan: sigue pidiendo el reintento con el error literal`, () => {
      const r = procesarSalidaDeRevision(REAL[id].salida, 'resolucion.v1', 0, 1)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.accion).toBe('reintentar')
    })
  }
})

describe('(b) normalizador de enumerados · tabla', () => {
  const ESTADO: Esq = { t: 'enum', v: ['tomada', 'no_tomada'] }
  const una = (v: unknown) => { const a: string[] = []; return { v: normalizarEnumerados(ESTADO, v, '$', a), a } }
  it.each([['tomado', 'tomada'], ['Tomada', 'tomada'], ['TOMADA', 'tomada'], ['  tomada ', 'tomada'], ['no tomado', 'no_tomada'], ['No_Tomado', 'no_tomada'], ['no-tomada', 'no_tomada'], ['NO TOMADA', 'no_tomada'], ['no  tomado', 'no_tomada']])(
    '«%s» → «%s»', (entrada, salida) => {
      const r = una(entrada)
      expect(r.v).toBe(salida)
      expect(r.a).toHaveLength(1)
    })
  it.each([['tomar'], ['tomar_parcial'], ['aceptada'], ['sí'], ['tomada parcialmente'], ['no tomó'], ['notomada'], [''], ['   '], [1], [null], [true]])('lo ambiguo o ajeno queda tal cual: %j', (entrada) => {
    const r = una(entrada)
    expect(r.v).toBe(entrada)
    expect(r.a).toHaveLength(0)
  })
  it('un valor ya válido no se anota', () => {
    const r = una('tomada')
    expect(r.v).toBe('tomada')
    expect(r.a).toEqual([])
  })
  it('si DOS valores permitidos coinciden, no se elige ninguno', () => {
    const a: string[] = []
    expect(normalizarEnumerados({ t: 'enum', v: ['tomada', 'tomado'] }, 'TOMADA ', '$', a)).toBe('TOMADA ')
    expect(a).toEqual([])
  })
  it('plegar: tildes, espacios y guiones', () => { expect(plegarEnumerado('  Sugerén-cia  X ')).toBe('sugeren_cia_x') })
  it('otros enumerados de la jefatura: gravedad y modo (género)', () => {
    const grav: Esq = { t: 'enum', v: ['bloquea', 'sugerencia'] }
    const modo: Esq = { t: 'enum', v: ['real', 'generada', 'ninguna'] }
    expect(normalizarEnumerados(grav, 'Bloquea')).toBe('bloquea')
    expect(normalizarEnumerados(grav, 'SUGERENCIA ')).toBe('sugerencia')
    expect(normalizarEnumerados(grav, 'bloqueante')).toBe('bloqueante')
    expect(normalizarEnumerados(modo, 'generado')).toBe('generada')
    expect(normalizarEnumerados(modo, 'Real')).toBe('real')
    expect(normalizarEnumerados(modo, 'Ninguno')).toBe('ninguna')
  })
  it('un valor mixto (true|false|"no_se_ve") no se toca con «Sí»/«no»', () => {
    const e: Esq = { t: 'enum', v: [true, false, 'no_se_ve'] }
    expect(normalizarEnumerados(e, 'Sí')).toBe('Sí')
    expect(normalizarEnumerados(e, 'no')).toBe('no')
    expect(normalizarEnumerados(e, 'No se ve')).toBe('no_se_ve')
  })
})

describe('(b) en las demás rutas de la jefatura', () => {
  it('fichas.v1: gravedad en otra forma pasa y se anota', () => {
    const r = procesarSalidaDeRevision('{"fichas":[{"que":"x","donde":"y","contra_que":"z","gravedad":"Bloquea","propuesta":"p"}]}', 'fichas.v1', 1, 1)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.normalizados).toEqual(['$.fichas[0].gravedad: «Bloquea» → «bloquea»'])
  })
  it('bloque de resolución del plan: «no tomado» pasa', () => {
    const r = separarTextoYResolucion(`${MARCA_DE_INICIO_DE_RESOLUCION}\n{"respuestas":[{"id":"a","estado":"no tomado","razon":"x"}]}\n${MARCA_DE_FIN_DE_RESOLUCION}`, { exigirTexto: false })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.respuestas[0].estado).toBe('no_tomada'); expect(r.normalizados).toHaveLength(1) }
  })
  it('plan_texto_y_resolucion.v1: lo ambiguo en el bloque sigue fallando', () => {
    const r = procesarSalidaDeRevision(`${MARCA_DE_INICIO_DE_RESOLUCION}\n{"respuestas":[{"id":"a","estado":"tomar","razon":"x"}]}\n${MARCA_DE_FIN_DE_RESOLUCION}`, 'plan_texto_y_resolucion.v1', 1, 1)
    expect(r.ok).toBe(false)
  })
  it('mutación: sin normalizar (flag apagado) el mismo «tomado» vuelve a fallar', () => {
    expect(procesarSalida(REAL['179244'].salida, 'resolucion.v1', 1, 1, { normalizar: false }).ok).toBe(false)
    expect(procesarSalida(REAL['179244'].salida, 'resolucion.v1', 1, 1, { normalizar: true }).ok).toBe(true)
  })
})

describe('(a) el pedido fija el literal exacto con un ejemplo válido', () => {
  const dueno = { agente: 'content-creator', donde: ['texto'] } as any
  const comun = { politica: {} as any, payload: {} as any, tipo: 'pieza' as any, dueno, texto: 'La pieza', fichas: [{ id: 'jefe-0-1', que: 'q', donde: 'texto', contra_que: 'c', propuesta: 'p', gravedad: 'bloquea' as const }], version_actual: 'A' as const }
  it('la regla dice «tomada»/«no_tomada», femenino, y trae un JSON de ejemplo que el propio validador acepta', () => {
    expect(REGLA_DEL_ESTADO).toContain('"tomada"')
    expect(REGLA_DEL_ESTADO).toContain('"no_tomada"')
    expect(REGLA_DEL_ESTADO).toMatch(/femenino/)
    const ejemplo = REGLA_DEL_ESTADO.slice(REGLA_DEL_ESTADO.indexOf('{"respuestas"'))
    const r = procesarSalida(ejemplo.replace('<id de una ficha>', 'a').replace('<id de otra ficha>', 'b'), 'resolucion_solo.v1', 1, 1)
    expect(r.ok).toBe(true)
  })
  it('decisión: todas las variantes de esquema llevan la regla', () => {
    for (const esquema of ['resolucion.v1', 'resolucion_solo.v1', 'resolucion_objeto.v1', 'resolucion_parcial.v1', 'plan_texto_y_resolucion.v1']) {
      const t = tareaDeDecision({ ...comun, esquema, opinion: 'opinión' })
      expect(t.task, esquema).toContain(REGLA_DEL_ESTADO)
    }
  })
  it('corrección: todas las variantes de esquema llevan la regla', () => {
    for (const esquema of ['resolucion.v1', 'resolucion_solo.v1', 'resolucion_objeto.v1', 'resolucion_parcial.v1', 'plan_texto_y_resolucion.v1']) {
      const t = tareaDeCorreccion({ ...comun, esquema })
      expect(t.task, esquema).toContain(REGLA_DEL_ESTADO)
    }
  })
})
