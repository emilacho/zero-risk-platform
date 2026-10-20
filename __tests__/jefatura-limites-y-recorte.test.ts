/**
 * LOS LÍMITES DE LONGITUD LLEGAN AL AGENTE Y UN TEXTO DE APOYO LARGO SE RECORTA, NO TUMBA LA DECISIÓN (CC#1 · 20-oct · encargo de Lenovo 22:40 · parte 2 de la noche). US$ 0, todo simulado.
 * Medido en la tercera prueba real: la revisión del plan quedó `fallida` porque `razon` pasó de 600 caracteres, un máximo que el agente nunca recibe; el reintento (otro US$ 0,30) tampoco lo acortó.
 *  (a) cada paso de la jefatura le dice al agente TODOS los máximos del esquema que lo valida (sale del propio esquema: no se desalinean);
 *  (b) `razon`, `que`, `donde`, `contra_que` y `propuesta` que se pasan se RECORTAN con marca; un id, un estado o un entregable (plan, objeto, filas, pieza) NUNCA se recortan.
 */
import { describe, expect, it } from 'vitest'
import { correr, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { CAMPOS_RECORTABLES, ESQUEMAS_DE_REVISION, limitesDelFormato, MARCA_DE_FIN_DE_RESOLUCION, MARCA_DE_INICIO_DE_RESOLUCION, procesarSalidaDeRevision, recortarTextosLargos } from '../src/lib/jefatura/revision/formatos'
import { ESQUEMAS, type Esq } from '../src/lib/revision-comun'

const ESQUEMAS_DE_LA_JEFATURA = ['fichas.v1', 'resolucion.v1', 'resolucion_solo.v1', 'resolucion_objeto.v1', 'resolucion_parcial.v1', 'plan_texto_y_resolucion.v1', 'resolucion_laminas.v1', 'resolucion_copy_kit.v1', 'resolucion_estructura.v1']
const esquemaDe = (id: string): Esq => (id === 'plan_texto_y_resolucion.v1' ? ESQUEMAS_DE_REVISION['bloque_de_resolucion'] : (ESQUEMAS_DE_REVISION[id] ?? ESQUEMAS[id]))
/** todos los máximos de un esquema, sacados aparte de la función que se prueba */
function todosLosMaximos(e: Esq, nombre = '', out: Array<{ nombre: string; max: number; de: 'caracteres' | 'elementos' }> = []): typeof out {
  if (e.t === 'str' && e.max !== undefined) out.push({ nombre, max: e.max, de: 'caracteres' })
  if (e.t === 'arr') { if (e.max !== undefined) out.push({ nombre, max: e.max, de: 'elementos' }); todosLosMaximos(e.de, e.de.t === 'str' ? `cada elemento de ${nombre}` : nombre, out) }
  if (e.t === 'obj') for (const [k, s] of Object.entries(e.props ?? {})) todosLosMaximos(s, k, out)
  return out
}

describe('(a) el agente recibe TODOS los máximos de su esquema', () => {
  it('🔴 para cada esquema de la jefatura, el párrafo dice cada máximo de cada campo (nombre y número), tal como está en el esquema', () => {
    for (const id of ESQUEMAS_DE_LA_JEFATURA) {
      const texto = limitesDelFormato(id)
      expect(texto, id).toContain('LÍMITES DEL FORMATO')
      const maximos = todosLosMaximos(esquemaDe(id)).filter((m) => m.nombre !== '')
      expect(maximos.length, id).toBeGreaterThan(0)
      for (const m of maximos) expect(texto, `${id} · ${m.nombre}`).toContain(`${m.nombre}: máximo ${m.max} ${m.de}`)
    }
  })
  it('los casos que importan: razon 600 y respuestas 12 en las resoluciones; las fichas dicen sus cuatro textos; el plan dice su rango', () => {
    for (const id of ['resolucion_solo.v1', 'resolucion_objeto.v1', 'resolucion_parcial.v1', 'resolucion.v1', 'plan_texto_y_resolucion.v1']) { const t = limitesDelFormato(id); expect(t).toContain('razon: máximo 600 caracteres'); expect(t).toContain('respuestas: máximo 12 elementos') }
    const f = limitesDelFormato('fichas.v1'); for (const c of ['que: máximo 500', 'donde: máximo 200', 'contra_que: máximo 400', 'fichas: máximo 12 elementos']) expect(f).toContain(c)
    expect(limitesDelFormato('plan_texto_y_resolucion.v1')).toMatch(/entre 1\.000 y 40\.000 caracteres/)
  })
  it('pide una razón corta (400) y explica qué se recorta y qué se rechaza', () => {
    const t = limitesDelFormato('resolucion_solo.v1')
    expect(t).toContain('máximo 400 caracteres'); expect(t).toContain('RECORTA'); expect(t).toContain('rehacerla')
  })
  it('un esquema sin máximos o desconocido no agrega nada', () => {
    expect(limitesDelFormato('opinion_libre.v1')).toBe(''); expect(limitesDelFormato('no_existe.v9')).toBe('')
  })
  it('🔴 en los pedidos REALES de cada paso (plan, pieza, estrategia, calendario): fondo, corrección y decisión llevan el párrafo con `razon` 600', async () => {
    for (const tipo of ['plan', 'pieza', 'estrategia', 'calendario'] as const) {
      const { P } = puertosDePrueba()
      const c = await correr(P, sobre(tipo, { simulacion: { fichas: 'bloquea', toma: 'algo' } }))
      const pasos = c.turnos.filter((t) => t.agente)
      expect(pasos.length, tipo).toBeGreaterThanOrEqual(2)
      for (const t of pasos) {
        const task = String((t.pedido as { task?: string }).task ?? '')
        expect(task, `${tipo} · ${t.paso}`).toContain('LÍMITES DEL FORMATO')
        if (t.paso !== 'revision_fondo') expect(task, `${tipo} · ${t.paso}`).toContain('razon: máximo 600 caracteres')
        else expect(task, `${tipo} · ${t.paso}`).toContain('que: máximo 500 caracteres')
      }
    }
  })
})

const BLOQUE = (razon: string, extra = '') => `${MARCA_DE_INICIO_DE_RESOLUCION}\n{"respuestas":[{"id":"f1","estado":"no_tomada","razon":${JSON.stringify(razon)}}${extra}]}\n${MARCA_DE_FIN_DE_RESOLUCION}`
const PLAN = `# Plan de 90 días\n${'Párrafo del plan con datos y fuentes. '.repeat(60)}`

describe('(b) un texto de apoyo largo se recorta con marca y la decisión sobrevive', () => {
  it('🔴 EL CASO DE LA PRUEBA: el bloque de resolución del plan con una razón de 700 y de 1.600 caracteres ⇒ válido, razón recortada con marca, id y estado intactos', () => {
    for (const largo of [601, 700, 1600, 5000]) {
      const r = procesarSalidaDeRevision(BLOQUE('r'.repeat(largo)), 'plan_texto_y_resolucion.v1', 0, 1)
      expect(r.ok, `largo ${largo}`).toBe(true)
      if (!r.ok) continue
      const resp = (r.valor.respuestas as Array<{ id: string; estado: string; razon: string }>)[0]
      expect(resp.id).toBe('f1'); expect(resp.estado).toBe('no_tomada')
      expect(resp.razon.length).toBeLessThanOrEqual(600); expect(resp.razon).toContain(`recortado: se escribieron ${largo} caracteres`); expect(resp.razon.startsWith('r'.repeat(300))).toBe(true)
      expect(r.normalizados?.some((n) => n.startsWith('recortado') && n.includes(`${largo} →`))).toBe(true)
    }
  })
  it('justo en el límite (600) NO se toca; 601 sí', () => {
    const exacto = procesarSalidaDeRevision(BLOQUE('x'.repeat(600)), 'plan_texto_y_resolucion.v1', 0, 1)
    expect(exacto.ok && (exacto.valor.respuestas as Array<{ razon: string }>)[0].razon).toBe('x'.repeat(600)); expect(exacto.ok && exacto.normalizados).toBeFalsy()
    const uno = procesarSalidaDeRevision(BLOQUE('x'.repeat(601)), 'plan_texto_y_resolucion.v1', 0, 1)
    expect(uno.ok && (uno.valor.respuestas as Array<{ razon: string }>)[0].razon.length).toBeLessThanOrEqual(600); expect(uno.ok && uno.normalizados?.length).toBe(1)
  })
  it('el texto del plan y las demás respuestas pasan intactos; solo se recorta lo largo (dos respuestas, una larga)', () => {
    const extra = `,{"id":"f2","estado":"tomada","razon":"corta y buena"}`
    const r = procesarSalidaDeRevision(`${PLAN}\n${BLOQUE('y'.repeat(900), extra)}`, 'plan_texto_y_resolucion.v1', 0, 1)
    expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.valor.texto_plan).toBe(PLAN.trim()); const rs = r.valor.respuestas as Array<{ id: string; estado: string; razon: string }>
    expect(rs.map((x) => [x.id, x.estado])).toEqual([['f1', 'no_tomada'], ['f2', 'tomada']]); expect(rs[1].razon).toBe('corta y buena'); expect(rs[0].razon.length).toBeLessThanOrEqual(600)
  })
  it('los esquemas propios (objeto / parcial): la razón larga se recorta y el objeto o las filas pasan sin tocarse', () => {
    const o = procesarSalidaDeRevision(JSON.stringify({ respuestas: [{ id: 'a', estado: 'tomada', razon: 'z'.repeat(1500) }], objeto: { tema: 't'.repeat(5000) } }), 'resolucion_objeto.v1', 0, 1)
    expect(o.ok).toBe(true); if (o.ok) { expect((o.valor.respuestas as Array<{ razon: string }>)[0].razon.length).toBeLessThanOrEqual(600); expect((o.valor.objeto as { tema: string }).tema).toBe('t'.repeat(5000)) }
    const p = procesarSalidaDeRevision(JSON.stringify({ respuestas: [{ id: 'a', estado: 'tomada', razon: 'z'.repeat(1500) }], filas: [{ fila_id: 'f1', texto: 'n'.repeat(9000) }] }), 'resolucion_parcial.v1', 0, 1)
    expect(p.ok).toBe(true); if (p.ok) { expect((p.valor.filas as Array<{ texto: string }>)[0].texto).toBe('n'.repeat(9000)) }
  })
  it('los esquemas de la oficina (resolución sin entregable, resolución de pieza, fichas): razon, que, contra_que y propuesta largos se recortan; el id y la gravedad no', () => {
    const s = procesarSalidaDeRevision(JSON.stringify({ respuestas: [{ id: 'a', estado: 'no_tomada', razon: 'k'.repeat(2000) }] }), 'resolucion_solo.v1', 0, 1)
    expect(s.ok).toBe(true); if (s.ok) expect((s.valor.respuestas as Array<{ razon: string }>)[0].razon.length).toBeLessThanOrEqual(600)
    const r = procesarSalidaDeRevision('```json\n' + JSON.stringify({ respuestas: [{ id: 'a', estado: 'tomada', razon: 'k'.repeat(900) }], pieza: { pie_de_foto: 'pie bueno', hashtags: ['#a'] } }) + '\n```', 'resolucion.v1', 0, 1)
    expect(r.ok).toBe(true); if (r.ok) { expect(r.envoltorio_limpiado).toBe(true); expect((r.valor.pieza as { pie_de_foto: string }).pie_de_foto).toBe('pie bueno') }
    const f = procesarSalidaDeRevision(JSON.stringify({ fichas: [{ que: 'q'.repeat(800), donde: 'texto', contra_que: 'c'.repeat(700), gravedad: 'bloquea', propuesta: 'p'.repeat(5000) }] }), 'fichas.v1', 0, 1)
    expect(f.ok).toBe(true); if (f.ok) { const x = (f.valor.fichas as Array<Record<string, string>>)[0]; expect(x.que.length).toBeLessThanOrEqual(500); expect(x.contra_que.length).toBeLessThanOrEqual(400); expect(x.propuesta.length).toBeLessThanOrEqual(4000); expect(x.gravedad).toBe('bloquea'); expect(x.donde).toBe('texto'); expect(f.normalizados?.length).toBe(3) }
  })
  it('🔴 lo que NO se recorta sigue rechazándose (reintento y luego falla visible): un id de 100 caracteres, un estado inválido, 13 respuestas, un pie de foto de 4.000, un plan de 41.000, un objeto/filas vacíos de contenido válido', () => {
    const rechazos: Array<[string, string]> = [
      [JSON.stringify({ respuestas: [{ id: 'i'.repeat(100), estado: 'tomada', razon: 'ok' }] }), 'resolucion_solo.v1'],
      [JSON.stringify({ respuestas: [{ id: 'a', estado: 'quizás', razon: 'ok' }] }), 'resolucion_solo.v1'],
      [JSON.stringify({ respuestas: Array.from({ length: 13 }, (_, i) => ({ id: `a${i}`, estado: 'tomada', razon: 'ok' })) }), 'resolucion_solo.v1'],
      [JSON.stringify({ respuestas: [{ id: 'a', estado: 'tomada', razon: 'ok' }], pieza: { pie_de_foto: 'p'.repeat(4000), hashtags: ['#a'] } }), 'resolucion.v1'],
      [`${'P'.repeat(41000)}\n${BLOQUE('ok')}`, 'plan_texto_y_resolucion.v1'],
    ]
    for (const [salida, esquema] of rechazos) {
      const primero = procesarSalidaDeRevision(salida, esquema, 0, 1); expect(primero.ok, esquema).toBe(false); expect(!primero.ok && primero.accion).toBe('reintentar')
      const segundo = procesarSalidaDeRevision(salida, esquema, 1, 1); expect(segundo.ok, esquema).toBe(false); expect(!segundo.ok && segundo.accion).toBe('falla_visible')
    }
  })
  it('un JSON roto o una razón vacía siguen dando el mensaje de siempre (el recorte no los esconde)', () => {
    const roto = procesarSalidaDeRevision('{"respuestas":[{"id":"a"', 'resolucion_solo.v1', 0, 1); expect(roto.ok).toBe(false)
    const vacia = procesarSalidaDeRevision(JSON.stringify({ respuestas: [{ id: 'a', estado: 'tomada', razon: '' }] }), 'resolucion_solo.v1', 0, 1); expect(vacia.ok).toBe(false)
  })
  it('la función pura: copia (no muta), solo toca campos recortables con string, y la marca cabe siempre en el máximo', () => {
    const esq = ESQUEMAS_DE_REVISION['bloque_de_resolucion']
    const entrada = { respuestas: [{ id: 'a'.repeat(79), estado: 'tomada', razon: 'r'.repeat(650) }] }
    const copia = JSON.parse(JSON.stringify(entrada)); const hechos: string[] = []
    const salida = recortarTextosLargos(esq, entrada, hechos) as typeof entrada
    expect(entrada).toEqual(copia); expect(salida.respuestas[0].id).toBe('a'.repeat(79)); expect(salida.respuestas[0].razon.length).toBeLessThanOrEqual(600); expect(hechos).toHaveLength(1)
    expect([...CAMPOS_RECORTABLES].sort()).toEqual(['contra_que', 'donde', 'propuesta', 'que', 'razon'])
    for (const largo of [601, 999, 1000, 9999, 10000]) { const s = recortarTextosLargos(esq, { respuestas: [{ id: 'a', estado: 'tomada', razon: 'q'.repeat(largo) }] }, []) as typeof entrada; expect(s.respuestas[0].razon.length).toBeLessThanOrEqual(600) }
    // un campo recortable que no es string o que no está en el esquema no se toca
    expect(recortarTextosLargos(esq, { respuestas: [{ id: 'a', estado: 'tomada', razon: 12345 }] }, [])).toEqual({ respuestas: [{ id: 'a', estado: 'tomada', razon: 12345 }] })
  })
})

describe('(b) de punta a punta: la revisión del plan YA NO queda «fallida» por una razón larga', () => {
  it('🔴 la decisión del plan contesta con una razón de 1.600 caracteres: la revisión sigue, el paso no se reintenta (ni se paga dos veces) y la traza anota el recorte', async () => {
    const { P, mem } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'ninguna', toma: 'nada', gpt: 'con_hallazgos' } }), (t) => {
      if (!t.paso.startsWith('decision')) return undefined
      const ids = [...String((t.pedido as { task?: string }).task ?? '').matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1])
      expect(ids.length).toBeGreaterThan(0)
      return { texto: `${MARCA_DE_INICIO_DE_RESOLUCION}\n${JSON.stringify({ respuestas: ids.map((id) => ({ id, estado: 'no_tomada', razon: 'L'.repeat(1600) })) })}\n${MARCA_DE_FIN_DE_RESOLUCION}` }
    })
    expect(c.final.cuerpo.resultado).not.toBe('fallida')
    const decisiones = c.turnos.filter((t) => t.paso.startsWith('decision'))
    expect(decisiones.length).toBeGreaterThanOrEqual(1); expect(decisiones.length).toBe(new Set(decisiones.map((d) => d.paso)).size) // sin segundo intento del mismo paso
    const trazas = JSON.stringify([...mem.pasos.values()].flat().map((p) => p.traza ?? null))
    expect(trazas).toContain('recortado')
  })
})
