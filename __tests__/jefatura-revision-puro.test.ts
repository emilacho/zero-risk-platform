/**
 * JEFATURA como oficina propia · J2 · las piezas PURAS: el contrato de entrada, el formato del plan (texto plano + bloque de resolución, condición 1 de CC#3),
 * la mejor versión aceptable (corrección 2 de CC#3) y las guardas G3–G7. US$ 0: sin base, sin red, sin modelo.
 */
import { describe, expect, it } from 'vitest'
import { validarEntrada } from '../src/lib/jefatura/revision/contrato'
import {
  MARCA_DE_FIN_DE_RESOLUCION, MARCA_DE_INICIO_DE_RESOLUCION, MINIMO_DE_CARACTERES_DEL_PLAN, procesarSalidaDeRevision, separarTextoYResolucion, TOPE_DE_CARACTERES_DEL_PLAN,
} from '../src/lib/jefatura/revision/formatos'
import { elegirVersion, esProductoDeUnaRevision, etiquetaDeVersion, planDeGuardado, PORCENTAJE_MINIMO_DEL_LARGO, resultadoTrasElegir, type EvaluacionDeVersion } from '../src/lib/jefatura/revision/plan'
import { resolverCierre, textoDelAviso } from '../src/lib/jefatura/revision/cierre'
import { estadoInicial, fichaNueva } from '../src/lib/revision-comun'
import { sobre } from './_helpers/jefatura-revision'

const plan = (n: number) => 'x'.repeat(n)
const bloque = (r: unknown) => `${MARCA_DE_INICIO_DE_RESOLUCION}\n${JSON.stringify({ respuestas: r })}\n${MARCA_DE_FIN_DE_RESOLUCION}`
const TOMADA = [{ id: 'jefe-1-0', estado: 'tomada', razon: 'ok' }]

describe('contrato de entrada', () => {
  it('acepta un sobre completo y guarda lo que ignora', () => {
    const s = sobre('pieza') as { payload: Record<string, unknown> } & Record<string, unknown>
    s.dry_run = true
    s.payload.client_id = 'otro'
    const v = validarEntrada(s)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.ignorados.join(' ')).toMatch(/dry_run en la raíz[\s\S]*payload\.client_id/)
  })
  it.each([
    ['tipo desconocido', (s: any) => { s.artifact_type = 'cimiento' }],
    ['sin artifact_id', (s: any) => { delete s.artifact_id }],
    ['sin client_id (lo pone el flujo en la raíz)', (s: any) => { delete s.client_id }],
    ['client_id solo dentro del payload', (s: any) => { s.payload.client_id = s.client_id; delete s.client_id }],
    ['sin texto', (s: any) => { s.payload.texto = '  ' }],
    ['devolver_a incompleto', (s: any) => { s.payload.devolver_a = { tipo: 'correo', destino: 'x' } }],
    ['productores vacíos', (s: any) => { s.payload.productores = [] }],
    ['chequeos_previos mal formados', (s: any) => { s.payload.chequeos_previos = { pasaron: true } }],
    ['contexto mal formado', (s: any) => { s.payload.contexto = [{ titulo: 'x' }] }],
    ['tope_restante negativo', (s: any) => { s.payload.tope_restante_usd = -1 }],
    ['versión 0', (s: any) => { s.payload.version = 0 }],
    ['simulación con dry_run = false', (s: any) => { s.payload.dry_run = false; s.payload.simulacion = { fichas: 'bloquea' } }],
  ])('rechaza: %s', (_n, mutar) => {
    const s = sobre('pieza') as any
    mutar(s)
    const v = validarEntrada(s)
    expect(v.ok).toBe(false)
  })
  it('un cuerpo que no es objeto o sin payload = entrada inválida', () => {
    expect(validarEntrada(null).ok).toBe(false)
    expect(validarEntrada([]).ok).toBe(false)
    expect(validarEntrada({ artifact_type: 'plan' }).ok).toBe(false)
  })
  it('dry_run ausente / no booleano = código `dry_run_obligatorio`', () => {
    const s = sobre('plan') as any
    delete s.payload.dry_run
    const v = validarEntrada(s)
    expect(v.ok === false && v.codigo).toBe('dry_run_obligatorio')
  })
})

describe('plan · texto plano + bloque de resolución (condición 1 de CC#3)', () => {
  it('el tope del texto es ≥ 40.000 caracteres y el mínimo evita un resumen', () => {
    expect(TOPE_DE_CARACTERES_DEL_PLAN).toBeGreaterThanOrEqual(40_000)
    expect(MINIMO_DE_CARACTERES_DEL_PLAN).toBe(1_000)
  })
  it('acepta un plan de 34.000 caracteres (el máximo medido) más su bloque, sin meterlo en un JSON', () => {
    const r = separarTextoYResolucion(`${plan(34_000)}\n${bloque(TOMADA)}`, { exigirTexto: true })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.texto).toHaveLength(34_000); expect(r.respuestas).toEqual(TOMADA) }
  })
  it('rechaza un plan que pasa el tope', () => {
    const r = separarTextoYResolucion(`${plan(TOPE_DE_CARACTERES_DEL_PLAN + 1)}\n${bloque(TOMADA)}`, { exigirTexto: false })
    expect(r.ok).toBe(false)
  })
  it('rechaza un «plan» demasiado corto (un resumen no es el plan)', () => {
    const r = separarTextoYResolucion(`${plan(MINIMO_DE_CARACTERES_DEL_PLAN - 1)}\n${bloque(TOMADA)}`, { exigirTexto: false })
    expect(r.ok === false && r.errores[0]).toMatch(/demasiado corto/)
  })
  it('solo el bloque = «no tomé nada» (texto null); con exigirTexto, falla', () => {
    const r = separarTextoYResolucion(bloque([{ id: 'x', estado: 'no_tomada', razon: 'no aplica' }]), { exigirTexto: false })
    expect(r.ok && r.texto).toBeNull()
    expect(separarTextoYResolucion(bloque(TOMADA), { exigirTexto: true }).ok).toBe(false)
  })
  it.each([
    ['sin bloque', plan(2000)],
    ['bloque sin cerrar', `${plan(2000)}\n${MARCA_DE_INICIO_DE_RESOLUCION}\n{"respuestas":[]}`],
    ['JSON roto dentro del bloque', `${plan(2000)}\n${MARCA_DE_INICIO_DE_RESOLUCION}\n{no es json}\n${MARCA_DE_FIN_DE_RESOLUCION}`],
    ['resolución sin `respuestas`', `${plan(2000)}\n${MARCA_DE_INICIO_DE_RESOLUCION}\n{"otra":1}\n${MARCA_DE_FIN_DE_RESOLUCION}`],
    ['estado inventado', `${plan(2000)}\n${bloque([{ id: 'a', estado: 'quizá', razon: 'x' }])}`],
    ['razón vacía', `${plan(2000)}\n${bloque([{ id: 'a', estado: 'tomada', razon: '' }])}`],
    ['texto después del bloque', `${plan(2000)}\n${bloque(TOMADA)}\nGracias por tu tiempo`],
    ['salida vacía', '   '],
  ])('falla visible (nunca rellena): %s', (_n, salida) => {
    expect(separarTextoYResolucion(salida, { exigirTexto: false }).ok).toBe(false)
  })
  it('una cerca ``` que envuelve TODO el plan se quita; el contenido no cambia', () => {
    const t = plan(1500)
    const r = separarTextoYResolucion('```markdown\n' + t + '\n```\n' + bloque(TOMADA), { exigirTexto: true })
    expect(r.ok && r.texto).toBe(t)
    expect(r.ok && r.envoltorio_limpiado).toBe(true)
  })
  it('si el plan nombra el delimitador en su cuerpo, vale el ÚLTIMO bloque (el del final)', () => {
    const t = `${plan(1500)}\nexplicación del marcador ${MARCA_DE_INICIO_DE_RESOLUCION} dentro del texto`
    const r = separarTextoYResolucion(`${t}\n${bloque(TOMADA)}`, { exigirTexto: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.texto).toBe(t)
  })
  it('procesarSalidaDeRevision: un fallo de formato pide UN reintento con el error literal; el segundo fallo es falla visible', () => {
    const roto = plan(2000)
    const a = procesarSalidaDeRevision(roto, 'plan_texto_y_resolucion.v1', 0, 1)
    expect(a.ok === false && a.accion).toBe('reintentar')
    expect(a.ok === false && a.accion === 'reintentar' && a.mensaje_de_error).toContain(MARCA_DE_INICIO_DE_RESOLUCION)
    const b = procesarSalidaDeRevision(roto, 'plan_texto_y_resolucion.v1', 1, 1)
    expect(b.ok === false && b.accion).toBe('falla_visible')
  })
  it('procesarSalidaDeRevision: devuelve texto_plan solo si hay texto', () => {
    const con = procesarSalidaDeRevision(`${plan(1200)}\n${bloque(TOMADA)}`, 'plan_texto_y_resolucion.v1', 0, 1)
    expect(con.ok && con.valor.texto_plan).toHaveLength(1200)
    const sin = procesarSalidaDeRevision(bloque([{ id: 'a', estado: 'no_tomada', razon: 'x' }]), 'plan_texto_y_resolucion.v1', 0, 1)
    expect(sin.ok && 'texto_plan' in sin.valor).toBe(false)
  })
  it('los esquemas JSON propios validan y los de la oficina se delegan sin cambio', () => {
    expect(procesarSalidaDeRevision('{"respuestas":[{"id":"a","estado":"tomada","razon":"x"}],"objeto":{"k":1}}', 'resolucion_objeto.v1', 0, 1).ok).toBe(true)
    expect(procesarSalidaDeRevision('{"respuestas":[],"filas":[{"fila_id":"f1","tema":"t"}]}', 'resolucion_parcial.v1', 0, 1).ok).toBe(true)
    expect(procesarSalidaDeRevision('{"respuestas":[],"filas":[{"tema":"sin id"}]}', 'resolucion_parcial.v1', 1, 1).ok).toBe(false)
    expect(procesarSalidaDeRevision('{"fichas":[]}', 'fichas.v1', 0, 1).ok).toBe(true)
    expect(procesarSalidaDeRevision('{"respuestas":[{"id":"a","estado":"tomada","razon":"x"}]}', 'resolucion_solo.v1', 0, 1).ok).toBe(true)
    const desconocido = procesarSalidaDeRevision('{}', 'no_existe.v1', 1, 1)
    expect(desconocido.ok === false && desconocido.accion).toBe('falla_visible')
  })
})

describe('mejor versión aceptable', () => {
  const ev = (a: [number, number], b?: [number, number], c?: [number, number]): EvaluacionDeVersion[] => [{ etiqueta: 'A', marcas: a[0], largo: a[1] }, ...(b ? [{ etiqueta: 'B' as const, marcas: b[0], largo: b[1] }] : []), ...(c ? [{ etiqueta: 'C' as const, marcas: c[0], largo: c[1] }] : [])]
  it('solo A: se adopta A', () => { expect(elegirVersion(ev([1, 100]))).toMatchObject({ adoptada: 'A', ultima: 'A', adoptoLaUltima: true }) })
  it('B mejora: se adopta B', () => { expect(elegirVersion(ev([2, 100], [1, 100]))).toMatchObject({ adoptada: 'B', adoptoLaUltima: true }) })
  it('empate de marcas = pasa (no más marcas que la anterior)', () => { expect(elegirVersion(ev([2, 100], [2, 100])).adoptada).toBe('B') })
  it('B empeora: se queda A', () => { expect(elegirVersion(ev([1, 100], [2, 100]))).toMatchObject({ adoptada: 'A', ultima: 'B', adoptoLaUltima: false }) })
  it('caso del seco «B mejora y C empeora»: B', () => { expect(elegirVersion(ev([3, 100], [1, 100], [2, 100])).adoptada).toBe('B') })
  it('caso del seco «C pasa contra A pero es peor que B»: B (se compara con la anterior ACEPTADA, no con A)', () => {
    const r = elegirVersion(ev([3, 100], [1, 100], [2, 100]))
    expect(r.adoptada).toBe('B')
    expect(r.razones.find((x) => x.etiqueta === 'C')).toMatchObject({ pasa: false, contra: 'B' })
  })
  it('B empeora pero C mejora respecto de A: C (B no fue aceptada, C se compara contra A)', () => {
    const r = elegirVersion(ev([2, 100], [3, 100], [1, 100]))
    expect(r).toMatchObject({ adoptada: 'C', adoptoLaUltima: true, aceptadas: ['A', 'C'] })
    expect(r.razones.find((x) => x.etiqueta === 'C')?.contra).toBe('A')
  })
  it('todas mejoran: C', () => { expect(elegirVersion(ev([3, 100], [2, 100], [1, 100])).adoptada).toBe('C') })
  it('solo A y C (sin B): C se compara contra A', () => { expect(elegirVersion(ev([2, 100], undefined, [1, 100]))).toMatchObject({ adoptada: 'C', ultima: 'C' }) })
  it('una versión demasiado corta (< 60 % del largo de A) no pasa aunque tenga menos marcas', () => {
    expect(PORCENTAJE_MINIMO_DEL_LARGO).toBe(0.6)
    expect(elegirVersion(ev([3, 1000], [0, 599])).adoptada).toBe('A')
    expect(elegirVersion(ev([3, 1000], [0, 600])).adoptada).toBe('B')
  })
  it('falta A, A repetida, etiqueta inválida o números inválidos = error (no se adivina)', () => {
    expect(() => elegirVersion([{ etiqueta: 'B', marcas: 0, largo: 1 }])).toThrow(/falta la versión A/)
    expect(() => elegirVersion([...ev([0, 1]), { etiqueta: 'A', marcas: 0, largo: 1 }])).toThrow(/repetida/)
    expect(() => elegirVersion([{ etiqueta: 'Z' as never, marcas: 0, largo: 1 }])).toThrow(/no válida/)
    expect(() => elegirVersion(ev([-1, 100]))).toThrow(/no válidos/)
    expect(() => elegirVersion(ev([0, 0]))).toThrow(/largo 0/)
  })
  it('las etiquetas siguen la versión (1 = A, 2 = B, 3 = C)', () => {
    expect([1, 2, 3].map(etiquetaDeVersion)).toEqual(['A', 'B', 'C'])
  })
})

describe('qué guardar, en qué orden y sin duplicar (G4, G5, G7)', () => {
  const adop = (a: [number, number], b?: [number, number], c?: [number, number]) => elegirVersion([{ etiqueta: 'A', marcas: a[0], largo: a[1] }, ...(b ? [{ etiqueta: 'B' as const, marcas: b[0], largo: b[1] }] : []), ...(c ? [{ etiqueta: 'C' as const, marcas: c[0], largo: c[1] }] : [])])
  it('adoptada A: no se guarda nada y B/C quedan solo en la traza', () => {
    const p = planDeGuardado(adop([1, 100], [2, 100], [3, 100]), { idDeA: 'a', existentes: [], produjo: ['A', 'B', 'C'] })
    expect(p).toMatchObject({ guardar: [], vigente: 'A', reemplazos: [], solo_en_la_traza: ['B', 'C'] })
  })
  it('adoptada B: se guarda B (versión 2, hija de A); A se marca reemplazada; C solo en la traza', () => {
    const p = planDeGuardado(adop([3, 100], [1, 100], [2, 100]), { idDeA: 'a', existentes: [], produjo: ['A', 'B', 'C'] })
    expect(p.guardar).toEqual([{ etiqueta: 'B', version: 2, version_de: 'A' }])
    expect(p.reemplazos).toEqual([{ de: 'A', por: 'B' }])
    expect(p.solo_en_la_traza).toEqual(['C'])
  })
  it('adoptada C con B aceptada: B (v2, hija de A) y luego C (v3, hija de B); A→B y B→C; en ese orden', () => {
    const p = planDeGuardado(adop([3, 100], [2, 100], [1, 100]), { idDeA: 'a', existentes: [], produjo: ['A', 'B', 'C'] })
    expect(p.guardar.map((g) => [g.etiqueta, g.version, g.version_de])).toEqual([['B', 2, 'A'], ['C', 3, 'B']])
    expect(p.reemplazos).toEqual([{ de: 'A', por: 'B' }, { de: 'B', por: 'C' }])
    expect(p.vigente).toBe('C')
  })
  it('adoptada C con B rechazada: la cadena SALTA a B: C (v2) cuelga directo de A y B queda en la traza', () => {
    const p = planDeGuardado(adop([2, 100], [3, 100], [1, 100]), { idDeA: 'a', existentes: [], produjo: ['A', 'B', 'C'] })
    expect(p.guardar).toEqual([{ etiqueta: 'C', version: 2, version_de: 'A' }])
    expect(p.reemplazos).toEqual([{ de: 'A', por: 'C' }])
    expect(p.solo_en_la_traza).toEqual(['B'])
  })
  it('G4: si la hija de A ya existe (se reejecutó) se REUTILIZA; la de B no puede existir si B es nueva', () => {
    const p = planDeGuardado(adop([3, 100], [2, 100], [1, 100]), { idDeA: 'a', existentes: [{ id: 'b-ya', version_de: 'a' }], produjo: ['A', 'B', 'C'] })
    expect(p.guardar[0]).toMatchObject({ etiqueta: 'B', reutilizar_id: 'b-ya' })
    expect(p.guardar[1].reutilizar_id).toBeUndefined()
    const q = planDeGuardado(adop([3, 100], [2, 100], [1, 100]), { idDeA: 'a', existentes: [{ id: 'b-ya', version_de: 'a' }, { id: 'c-ya', version_de: 'b-ya' }], produjo: ['A', 'B', 'C'] })
    expect(q.guardar.map((g) => g.reutilizar_id)).toEqual(['b-ya', 'c-ya'])
  })
  it('G7: nunca más de 3 versiones (A, B, C) ni más de una hija por padre', () => {
    const p = planDeGuardado(adop([3, 100], [2, 100], [1, 100]), { idDeA: 'a', existentes: [], produjo: ['A', 'B', 'C'] })
    expect(p.guardar.length).toBeLessThanOrEqual(2)
    expect(Math.max(...p.guardar.map((g) => g.version))).toBeLessThanOrEqual(3)
    expect(new Set(p.guardar.map((g) => g.version_de)).size).toBe(p.guardar.length)
  })
})

describe('resultado tras elegir y guarda G3', () => {
  const base = { resultado: 'limpia' as const, marcas: { con_desacuerdo: false, sin_segunda_mirada: false } }
  it('si no se adoptó la última, pasa a con_desacuerdo (con la marca)', () => {
    expect(resultadoTrasElegir(base, false)).toEqual({ resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false } })
  })
  it('si se adoptó la última, no cambia', () => { expect(resultadoTrasElegir(base, true)).toEqual(base) })
  it('nunca mejora un resultado: fallida e incompleta_por_tope siguen así', () => {
    expect(resultadoTrasElegir({ ...base, resultado: 'fallida' }, false).resultado).toBe('fallida')
    expect(resultadoTrasElegir({ ...base, resultado: 'incompleta_por_tope' }, false).resultado).toBe('incompleta_por_tope')
  })
  it('G3: solo un id no vacío cuenta como «producto de una revisión»', () => {
    expect(esProductoDeUnaRevision('abc')).toBe(true)
    for (const v of [undefined, null, '', '  ']) expect(esProductoDeUnaRevision(v)).toBe(false)
  })
})

describe('cierre (reglas 2, 3, 4)', () => {
  const con = (fs: ReturnType<typeof fichaNueva>[], ext?: Record<string, unknown>) => {
    const e = estadoInicial()
    e.fichas = fs
    if (ext) e.artefactos.fichas_externas = { version: 1, version_consumida: 0, datos: ext }
    return e
  }
  const jefe = (id: string, gravedad: 'bloquea' | 'sugerencia', estado: 'abierta' | 'tomada' | 'no_tomada') => ({ ...fichaNueva(id, 'jefe', 'texto', gravedad, 'q'), estado })
  it('limpia: sin fichas de fondo abiertas', () => { expect(resolverCierre(con([]), { tope: false, fallida: false }).resultado).toBe('limpia') })
  it('regla 2: una ficha de fondo que bloquea abierta o no tomada = con_desacuerdo', () => {
    expect(resolverCierre(con([jefe('a', 'bloquea', 'abierta')]), { tope: false, fallida: false }).resultado).toBe('con_desacuerdo')
    expect(resolverCierre(con([jefe('a', 'bloquea', 'no_tomada')]), { tope: false, fallida: false }).resultado).toBe('con_desacuerdo')
    expect(resolverCierre(con([jefe('a', 'bloquea', 'tomada')]), { tope: false, fallida: false }).resultado).toBe('limpia')
  })
  it('una sugerencia del jefe nunca es desacuerdo', () => { expect(resolverCierre(con([jefe('a', 'sugerencia', 'abierta')]), { tope: false, fallida: false }).resultado).toBe('limpia') })
  it('regla 3: una ficha EXTERNA no tomada no es desacuerdo', () => {
    const f = { ...fichaNueva('e', 'externa', 'texto', 'sugerencia', 'op'), estado: 'no_tomada' as const }
    expect(resolverCierre(con([f]), { tope: false, fallida: false }).resultado).toBe('limpia')
  })
  it('regla 3 (blindada): ni siquiera una ficha EXTERNA marcada «bloquea» y no tomada cuenta como desacuerdo (solo cuentan las del jefe)', () => {
    const f = { ...fichaNueva('e', 'externa', 'texto', 'bloquea', 'op'), estado: 'no_tomada' as const }
    expect(resolverCierre(con([f]), { tope: false, fallida: false })).toMatchObject({ resultado: 'limpia', marcas: { con_desacuerdo: false } })
    const g = { ...fichaNueva('e2', 'externa', 'texto', 'bloquea', 'op'), estado: 'abierta' as const }
    expect(resolverCierre(con([g]), { tope: false, fallida: false }).resultado).toBe('limpia')
  })
  it('regla 4: sin segunda mirada se marca; con desacuerdo también: las dos marcas viajan', () => {
    const c = resolverCierre(con([jefe('a', 'bloquea', 'abierta')], { sin_revision: true }), { tope: false, fallida: false })
    expect(c.marcas).toEqual({ con_desacuerdo: true, sin_segunda_mirada: true })
    expect(c.resultado).toBe('con_desacuerdo')
    expect(resolverCierre(con([], { sin_revision: true }), { tope: false, fallida: false }).resultado).toBe('sin_segunda_mirada')
  })
  it('tope y fallida mandan sobre lo demás', () => {
    expect(resolverCierre(con([]), { tope: true, fallida: false }).resultado).toBe('incompleta_por_tope')
    expect(resolverCierre(con([]), { tope: true, fallida: true }).resultado).toBe('fallida')
  })
  it('UN aviso agregado, y ninguno si cierra limpia', () => {
    const limpia = resolverCierre(con([]), { tope: false, fallida: false })
    expect(textoDelAviso(limpia, { tipo: 'plan', artifact_id: 'p1', gasto_usd: 0, simulado: false })).toBe('')
    const c = resolverCierre(con([jefe('a', 'bloquea', 'abierta'), jefe('b', 'bloquea', 'abierta'), jefe('c', 'bloquea', 'abierta'), jefe('d', 'bloquea', 'abierta')]), { tope: false, fallida: false })
    const t = textoDelAviso(c, { tipo: 'plan', artifact_id: 'p1', gasto_usd: 0, simulado: true })
    expect(t).toMatch(/\(seco\)/)
    expect(t).toMatch(/\+1 más/)
  })
})
