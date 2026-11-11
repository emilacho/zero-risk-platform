/**
 * Motor de colaterales · tramo 2a (CC1 · certifica CC7). Reglas: CRITERIOS v2 + adendas 1-4 + PLAN tramo 2 + su adenda 1,
 * corregidos por la regla de Emilio (13:13Z: juzgar = agente, verificar lo exacto = código) y la CORRECCIÓN de Lenovo (13:16Z: agnóstico, sin listas, ≥ 2 clientes).
 * Fixtures: registros REALES de DOS clientes de rubros distintos, leídos el 10-nov:
 *   · A · restaurante (extractos literales de su gran idea, brief y estrategia)
 *   · B · B2B industrial (su plan y su estrategia, enteros, en JSON)
 * Los nombres y palabras de los clientes viven SOLO en los fixtures; el código no los conoce (prueba «agnóstico» al final).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { red, pedazosDe, claves, type Edicion, type Pedazo } from '../red'
import { gravedadVerificada, INSTRUCCION_DE_GRAVEDAD } from '../gravedad'
import { yaCoincide, separarYaCoincide, verificarSalida, aplicarEnPedazo, aplicarEnDocumento, puedeLanzarMotor, puedeAplicarEn, notaSinColaterales, type SalidaDelAgente } from '../motor'

// ── las ediciones de prueba: una por cliente, sacadas de frases que sus documentos de abajo sí repiten ──
const A_INSIGHT: Edicion = { documento: 'brief', seccion: 'Insight', antes: 'sabe que el bueno viene de la costa', despues: 'sabe que el bueno viene de la playa' }
const A_OBJECION: Edicion = { documento: 'plan', seccion: '3 · La audiencia', antes: '¿será tan bueno como en la costa?', despues: '¿será tan bueno como en la playa?' }
const CONDICION_B = 'activar cuando exista perfil LinkedIn de empresa creado y validado'
const B_CONDICION: Edicion = { documento: 'plan', seccion: 'canales', antes: CONDICION_B, despues: 'activar cuando exista perfil LinkedIn de empresa creado, validado y con su primera publicación' }
const fila = (id: string, afecta: boolean, razon = afecta ? '' : 'no habla de lo editado') => ({ id, afecta, razon })

describe('red de palabras · solo aguas abajo, con sección y posición · dos clientes', () => {
  it('A (brief → gran idea): la cita del insight y el mensaje del capítulo salen como candidatos, con su sección', () => {
    const { candidatos } = red(A_INSIGHT, { gran_idea: A.gran_idea_v3 })
    expect(candidatos.find((p) => p.texto.includes(A_INSIGHT.antes))?.seccion).toBe('Por qué funciona')
    expect(candidatos.some((p) => p.seccion.startsWith('Capítulo desbloquear'))).toBe(true)
  })
  it('B (plan JSON → estrategia JSON): las dos citas literales de la condición salen, por su ruta', () => {
    const { candidatos } = red(B_CONDICION, { estrategia: B.estrategia })
    const rutas = candidatos.filter((p) => p.texto === CONDICION_B).map((p) => p.ruta)
    expect(rutas).toEqual(['excluidos[0].cita_plan', 'dependencias[0].cita_plan'])
  })
  it('nunca aguas arriba: una edición del brief no trae pedazos del plan ni del manual; una del plan no trae del manual', () => {
    expect(red(A_INSIGHT, { gran_idea: A.gran_idea_v3, plan: A_INSIGHT.antes, manual: A_INSIGHT.antes }).candidatos.every((p) => p.documento === 'gran_idea')).toBe(true)
    expect(red(B_CONDICION, { estrategia: B.estrategia, manual: CONDICION_B }).candidatos.every((p) => p.documento === 'estrategia')).toBe(true)
  })
  it('cada pedazo markdown guarda su posición exacta: en `inicio` está su texto', () => {
    for (const t of [A.gran_idea_v3, A.brief_v2, A.brief_v4]) for (const p of pedazosDe('brief', t)) expect(t.slice(p.inicio, p.inicio + p.texto.length)).toBe(p.texto)
  })
  it('un documento sin texto (abierto, vacío) no aporta candidatos', () => {
    expect(red(A_OBJECION, { gran_idea: '', brief: '' }).candidatos).toEqual([])
  })
  it('las claves salen de la frase ENTERA del «antes», con números', () => {
    expect(claves('desde $3,50 la unidad')).toEqual(['desde', '3,50', 'unidad'].filter((w) => w !== 'desde'))
  })
})

describe('gravedad · la juzga el agente; el código solo verifica lo exacto (falla cerrado)', () => {
  const ok = { de_fondo: false, razon: `cambia «${A_OBJECION.antes}» por «${A_OBJECION.despues}» sin cambiar a quién se le habla` }
  it('un veredicto completo del agente se respeta, en los dos sentidos', () => {
    expect(gravedadVerificada(ok, A_OBJECION.antes, A_OBJECION.despues).gravedad).toBe('normal')
    expect(gravedadVerificada({ ...ok, de_fondo: true }, A_OBJECION.antes, A_OBJECION.despues).gravedad).toBe('fondo')
  })
  it('sabotaje: sin veredicto, sin razón o con una razón que no cita el antes y el después → de fondo', () => {
    expect(gravedadVerificada(null, A_OBJECION.antes, A_OBJECION.despues).gravedad).toBe('fondo')
    expect(gravedadVerificada({ de_fondo: false, razon: '  ' }, A_OBJECION.antes, A_OBJECION.despues)).toEqual({ gravedad: 'fondo', motivo: 'sin_razon' })
    expect(gravedadVerificada({ de_fondo: false, razon: 'es un cambio menor' }, A_OBJECION.antes, A_OBJECION.despues).gravedad).toBe('fondo')
  })
  it('certificación CC7 (526d1c3): citar SOLO el antes, o SOLO el después, no basta → de fondo · dos clientes', () => {
    for (const e of [A_OBJECION, B_CONDICION]) {
      expect(e.despues.includes(e.antes) || e.antes.includes(e.despues)).toBe(false) // el caso tiene sentido: ninguno contiene al otro
      expect(gravedadVerificada({ de_fondo: false, razon: `cambia «${e.antes}» por otra cosa` }, e.antes, e.despues)).toEqual({ gravedad: 'fondo', motivo: 'razon_no_cita_antes_y_despues' })
      expect(gravedadVerificada({ de_fondo: false, razon: `ahora dice «${e.despues}»` }, e.antes, e.despues)).toEqual({ gravedad: 'fondo', motivo: 'razon_no_cita_antes_y_despues' })
    }
  })
  it('la misma regla vale para el otro cliente', () => {
    const r = { de_fondo: false, razon: `«${B_CONDICION.antes}» → «${B_CONDICION.despues}»` }
    expect(gravedadVerificada(r, B_CONDICION.antes, B_CONDICION.despues).gravedad).toBe('normal')
  })
  it('la instrucción es UNA para todos: habla de público, oferta e idea, sin ningún dato de un cliente', () => {
    expect(INSTRUCCION_DE_GRAVEDAD).toMatch(/a quién le hablamos/)
    expect(INSTRUCCION_DE_GRAVEDAD).toMatch(/qué ofrecemos/)
    expect(INSTRUCCION_DE_GRAVEDAD).toMatch(/idea central/)
  })
})

describe('R1 · «ya coincide» lo resuelve el código y nunca llama al agente', () => {
  it('A: el brief v4 que ya dice el «después» ya coincide', () => {
    const p = red(A_OBJECION, { brief: A.brief_v4 }).candidatos.find((x) => x.texto.includes(A_OBJECION.despues))!
    expect(yaCoincide(p, A_OBJECION)).toBe(true)
  })
  it('B: si la estrategia ya cita la condición nueva, ya coincide; si todos coinciden, 0 llamadas', () => {
    const est = B.estrategia.split(CONDICION_B).join(B_CONDICION.despues)
    const { candidatos } = red({ ...B_CONDICION, antes: 'perfil LinkedIn de empresa' }, { estrategia: est })
    const conDespues = candidatos.filter((p) => p.texto.includes(B_CONDICION.despues))
    expect(conDespues.length).toBe(2)
    expect(separarYaCoincide(conDespues, B_CONDICION).al_agente).toEqual([])
  })
  it('sabotaje: un pedazo que todavía dice el «antes» NO ya coincide (aunque también diga el después)', () => {
    expect(yaCoincide({ texto: `${A_OBJECION.antes} y ${A_OBJECION.despues}` }, A_OBJECION)).toBe(false)
  })
})

describe('verificar la salida del agente · solo lo exacto', () => {
  const textos = { gran_idea: A.gran_idea_v3 }
  const { candidatos } = red(A_INSIGHT, textos)
  const cita = candidatos.find((p) => p.texto.includes(A_INSIGHT.antes))!
  const todos = (afectan: string[] = []) => candidatos.map((p) => fila(p.id, afectan.includes(p.id)))
  const ok: SalidaDelAgente = { revisados: todos([cita.id]), colaterales: [{ id: cita.id, documento: 'gran_idea', antes: 'viene de la costa', despues: 'viene de la playa', porque: 'cita del insight' }], no_aparece: [] }

  it('una salida buena se acepta completa, con razón por cada descartado', () => {
    const v = verificarSalida(A_INSIGHT, candidatos, textos, ok)
    expect(v.completa).toBe(true)
    expect(v.aceptados).toHaveLength(1)
    expect(v.descartados).toHaveLength(candidatos.length - 1)
  })
  it('B: una salida buena del otro cliente también (JSON, por ruta)', () => {
    const t = { estrategia: B.estrategia }
    const c = red(B_CONDICION, t).candidatos
    const ids = c.filter((p) => p.texto === CONDICION_B).map((p) => p.id)
    const s: SalidaDelAgente = { revisados: c.map((p) => fila(p.id, ids.includes(p.id))), colaterales: ids.map((id) => ({ id, documento: 'estrategia', antes: CONDICION_B, despues: B_CONDICION.despues, porque: 'cita literal del plan' })), no_aparece: [] }
    const v = verificarSalida(B_CONDICION, c, t, s)
    expect([v.completa, v.aceptados.length]).toEqual([true, 2])
  })
  it('sabotaje: falta un id → no se acepta entera', () => {
    const v = verificarSalida(A_INSIGHT, candidatos, textos, { ...ok, revisados: ok.revisados.slice(1) })
    expect([v.completa, v.faltan.length]).toEqual([false, 1])
  })
  it('sabotaje (nota 3 CC7): un descartado sin razón → no se acepta entera', () => {
    const v = verificarSalida(A_INSIGHT, candidatos, textos, { ...ok, revisados: ok.revisados.map((r) => (!r.afecta && r.id === candidatos.find((p) => p.id !== cita.id)!.id ? { ...r, razon: ' ' } : r)) })
    expect([v.completa, v.sin_razon.length]).toEqual([false, 1])
  })
  it('sabotaje: un «no aparece» que sí aparece → no se acepta entera; uno verdadero sí', () => {
    expect(verificarSalida(A_INSIGHT, candidatos, textos, { ...ok, no_aparece: [{ documento: 'gran_idea', termino: 'leyenda' }] }).completa).toBe(false)
    expect(verificarSalida(A_INSIGHT, candidatos, textos, { ...ok, no_aparece: [{ documento: 'gran_idea', termino: 'transferencia' }] }).completa).toBe(true)
  })
  it('sabotaje: un «antes» que está en el documento pero NO en su pedazo se rechaza', () => {
    const otro = candidatos.find((p) => p.id !== cita.id && !p.texto.includes('viene de la costa'))!
    const s: SalidaDelAgente = { ...ok, revisados: todos([otro.id]), colaterales: [{ id: otro.id, documento: 'gran_idea', antes: 'viene de la costa', despues: 'viene de la playa', porque: 'x' }] }
    expect(verificarSalida(A_INSIGHT, candidatos, textos, s).rechazados[0]?.motivo).toBe('antes_no_literal_en_su_pedazo')
  })
  it('sabotaje: retoque en un pedazo marcado «no afecta», id ajeno, documento cambiado o antes = después se rechazan', () => {
    const m = (s: Partial<SalidaDelAgente>) => verificarSalida(A_INSIGHT, candidatos, textos, { ...ok, ...s }).rechazados[0]?.motivo
    expect(m({ revisados: todos([]) })).toBe('no_marcado_como_afecta')
    expect(m({ colaterales: [{ ...ok.colaterales[0], id: 'C999' }] })).toBe('id_desconocido')
    expect(m({ colaterales: [{ ...ok.colaterales[0], documento: 'plan' }] })).toBe('documento_distinto_al_pedazo')
    expect(m({ colaterales: [{ ...ok.colaterales[0], despues: 'viene de la costa' }] })).toBe('antes_igual_a_despues')
  })
  it('sabotaje: aguas arriba se rechaza aunque el agente lo pida', () => {
    const p: Pedazo = { id: 'C1', documento: 'manual', seccion: 'x', texto: CONDICION_B, inicio: 0, ruta: null }
    const s: SalidaDelAgente = { revisados: [fila('C1', true)], colaterales: [{ id: 'C1', documento: 'manual', antes: CONDICION_B, despues: B_CONDICION.despues, porque: 'x' }], no_aparece: [] }
    expect(verificarSalida(B_CONDICION, [p], { manual: CONDICION_B }, s).rechazados[0]?.motivo).toBe('aguas_arriba')
  })
  it('el código NO juzga el registro: un «después» en cualquier registro pasa la verificación exacta (lo juzga la jefatura contra el manual del cliente)', () => {
    const s: SalidaDelAgente = { ...ok, colaterales: [{ ...ok.colaterales[0], despues: 'viene de la playa, vení y pagás' }] }
    expect(verificarSalida(A_INSIGHT, candidatos, textos, s).aceptados).toHaveLength(1)
  })
})

describe('aplicar · en la POSICIÓN de su pedazo, nunca buscando en todo el documento', () => {
  const r = (p: Pedazo, antes: string, despues: string) => ({ pedazo: p, antes, despues, porque: 'x' })
  it('falla CC7 (d3b0e4a): el texto del pedazo aparece ANTES dentro de una frase más larga → se retoca SOLO el pedazo', () => {
    const mensaje = A.brief_v2.split('\n').find((l) => l.includes('pagas en efectivo al recibir'))!
    const doc = `## Mensaje\n\n${mensaje}\n\n## Paso 3\n\npagas en efectivo al recibir`
    const p = { ...pedazosDe('brief', doc).find((x) => x.seccion === 'Paso 3')!, id: 'C1' }
    const nuevo = aplicarEnPedazo(doc, r(p, 'pagas en efectivo al recibir', 'pagas en efectivo o por transferencia al recibir'))
    expect(nuevo).toBe(`## Mensaje\n\n${mensaje}\n\n## Paso 3\n\npagas en efectivo o por transferencia al recibir`)
  })
  it('lo mismo con los trozos de una línea larga partida por « · »', () => {
    const larga = `${'x'.repeat(390)} · repetido aquí adentro · y otra vez · repetido aquí adentro`
    const doc = `## S\n${larga}`
    const ps = pedazosDe('gran_idea', doc).map((p, i) => ({ ...p, id: `C${i + 1}` }))
    const segundo = ps.filter((p) => p.texto === 'repetido aquí adentro')[1]
    const nuevo = aplicarEnPedazo(doc, r(segundo, 'aquí', 'allá'))
    expect(nuevo).toBe(`## S\n${'x'.repeat(390)} · repetido aquí adentro · y otra vez · repetido allá adentro`)
  })
  it('sabotaje: nunca un reemplazo global — dos pedazos iguales, se retocan los dos y nada más', () => {
    const linea = pedazosDe('gran_idea', A.gran_idea_v3).find((p) => p.texto.includes('que conoces de la costa'))!.texto
    const doc = `## A\n${linea}\n## B\n${linea}\n## C\nla costa queda igual`
    const ps = pedazosDe('gran_idea', doc).filter((p) => p.texto === linea.trim()).map((p, i) => ({ ...p, id: `C${i + 1}` }))
    // el «después» es MÁS LARGO: si se aplicara de adelante hacia atrás, el primero correría la posición del segundo
    const { texto, aplicados } = aplicarEnDocumento(doc, ps.map((p) => r(p, 'de la costa', 'de la playa del norte')))
    expect(aplicados).toHaveLength(2)
    expect(texto.split('de la playa del norte').length - 1).toBe(2)
    expect(texto.endsWith('la costa queda igual')).toBe(true)
  })
  it('si en la posición ya no está el pedazo (alguien lo tocó), queda sin aplicar — no se pisa', () => {
    const doc = '## A\nuna frase de prueba con su antes'
    const p = { ...pedazosDe('plan', doc)[0], id: 'C1' }
    // en la misma posición sigue estando «su antes», pero el pedazo ya NO es el mismo texto: no se pisa
    const tocado = `## A\n${'su antes y otra frase distinta'.padEnd(p.texto.length, '.')}`
    expect(tocado.slice(p.inicio, p.inicio + p.texto.length)).toContain('su antes')
    const { aplicados, sin_aplicar } = aplicarEnDocumento(tocado, [r(p, 'su antes', 'su después')])
    expect([aplicados.length, sin_aplicar.length]).toEqual([0, 1])
  })
  it('B · JSON: escribe por la ruta y no toca nada más del documento', () => {
    const p = { ...pedazosDe('estrategia', B.estrategia).find((x) => x.ruta === 'dependencias[0].cita_plan')!, id: 'C1' }
    const nuevo = JSON.parse(aplicarEnPedazo(B.estrategia, r(p, CONDICION_B, B_CONDICION.despues)))
    const viejo = JSON.parse(B.estrategia)
    expect(nuevo.dependencias[0].cita_plan).toBe(B_CONDICION.despues)
    expect(nuevo.excluidos[0].cita_plan).toBe(CONDICION_B)
    nuevo.dependencias[0].cita_plan = viejo.dependencias[0].cita_plan
    expect(nuevo).toEqual(viejo)
  })
  it('B · JSON: si el valor de la ruta cambió, queda sin aplicar', () => {
    const p = { ...pedazosDe('estrategia', B.estrategia).find((x) => x.ruta === 'dependencias[0].cita_plan')!, id: 'C1' }
    const tocada = JSON.stringify({ ...JSON.parse(B.estrategia), dependencias: [{ cita_plan: `${CONDICION_B} (cambiada por otra edición)` }] })
    expect(aplicarEnDocumento(tocada, [r(p, CONDICION_B, 'x')]).sin_aplicar).toHaveLength(1)
  })
})

describe('R2 · encendido calculado en el instante (al guardar y al aplicar)', () => {
  const HOY = new Set(['plan', 'pieza']) // filas activas reales de jefatura_grading_policies (10-nov)
  it('con las filas de hoy, el plan NO lanza el motor y dice qué falta', () => {
    expect(puedeLanzarMotor('plan', HOY)).toEqual({ ok: false, faltan: ['estrategia', 'brief', 'gran_idea', 'calendario'] })
  })
  it('con las filas de hoy, el calendario y la pieza sí', () => {
    expect([puedeLanzarMotor('calendario', HOY).ok, puedeLanzarMotor('pieza', HOY).ok]).toEqual([true, true])
  })
  it('sabotaje CC6 (orden corregido): pantalla del calendario abierta, se apaga la fila de la pieza, se guarda → no se lanza', () => {
    expect([puedeLanzarMotor('calendario', HOY).ok, puedeLanzarMotor('calendario', new Set(['plan'])).ok]).toEqual([true, false])
  })
  it('línea 3 CC7 + H1: al aplicar se vuelve a mirar la fila del destino', () => {
    expect([puedeAplicarEn('pieza', HOY), puedeAplicarEn('pieza', new Set(['plan'])), puedeAplicarEn('brief', HOY)]).toEqual([true, false, false])
  })
  it('la nota del historial dice qué fila falta (adenda 4)', () => {
    expect(notaSinColaterales(['gran_idea'])).toBe('no se revisaron colaterales: falta la fila activa de gran_idea')
  })
})

describe('agnóstico (CORRECCIÓN Lenovo 13:16Z)', () => {
  it('ningún archivo del motor nombra a un cliente, una ciudad, un rubro ni un dato de sus documentos', () => {
    const DIR = 'src/lib/colaterales'
    const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => path.join(DIR, f))
    expect(archivos.map((a) => path.basename(a)).sort()).toEqual(['almacen.ts', 'aplicar.ts', 'escritores.ts', 'gravedad.ts', 'motor.ts', 'puerta.ts', 'puertos-supabase.ts', 'red.ts', 'turno.ts', 'vuelta.ts'])
    const PROHIBIDAS = ['naufrago', 'náufrago', 'olon', 'olón', 'guayaquil', 'ecuador', 'ceviche', 'encebollado', 'costa', 'playa', 'restaurante', 'motorizado', 'extintor', 'bomberos', 'linkedin', 'seguridad industrial', 'zero risk']
    for (const f of archivos) {
      const t = fs.readFileSync(f, 'utf8').toLowerCase()
      for (const p of PROHIBIDAS) expect(t.includes(p), `${f} nombra «${p}»`).toBe(false)
    }
  })
})
