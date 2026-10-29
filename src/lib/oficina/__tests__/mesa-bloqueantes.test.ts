/**
 * LA MESA · bloqueantes de CERTIFICACION-CC3-la-mesa (28-oct) y los 9 mutantes que sobrevivieron (P04 · P10 · L01 · H04 · O01 · O02 · O04 · E02 · D03).
 * US$ 0: equipo simulado, base en memoria, sin red ni modelo. L01 y T4 viven en mesa-puro.test.ts; D03 en __tests__/carousel-ajuste-de-texto-mesa.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, avanzar, recibirResultado } from '../orquestador'
import { avanzarMesa, recibirResultadoMesa } from '../mesa/orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { registrarHerramienta } from '../mesa/herramienta'
import { observacionDeLaMesa } from '../mesa/evidencia'
import { tableroParaLaJefatura } from '../mesa/libro'
import { cotaAgotada, reservaDeLoQueSigue, siguienteDeLaMesa, techoDe } from '../mesa/planificador'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta } from '../mesa/tipos'
import { revisarPasosMuertos } from '../vigia'
import { DbFalsa } from './dbfalsa'
import { DIRECTORIO } from './mesa-memoria'
import { BRIEF_CARRUSEL, LAMINAS_OK, jugar, montar, parteCon, pieza } from './mesa-arnes'

// ───────────────────────── ayudas del planificador (puro)
const DIR: Tarjeta[] = DIRECTORIO.map((t) => ({ ...t }))
const DIRECCION = 'creative-director-mesa'
const est = (o: Partial<EstadoMesa> = {}): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: DIR, direccion: DIRECCION, turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, ...o })
let contador = 0
const A = (o: Partial<Aporte> & Pick<Aporte, 'de' | 'tipo'>): Aporte => { contador++; return { id: `id-${contador}`, encargo_id: 'e1', n: contador, para: null, texto: 'texto del aporte', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: 'x', creado_en: '2026-10-28T00:00:00Z', ...o } }
const ctx = (g = 0.5, tope = 5, img = false) => ({ gasto_usd: g, tope_usd: tope, hayImagenGenerada: img })
const PERTINENTES = ['content-creator', 'carousel-designer', 'marketing_instagram_curator']
/** el libro de una pieza ya integrada con todas las citas (sin imagen generada) */
function libroIntegrado(): Aporte[] {
  contador = 0
  const l = [A({ de: DIRECCION, tipo: 'dirige' }), ...PERTINENTES.map((de) => A({ de, tipo: 'aporta' }))]
  const cita = ['A2 usé: el titular del gancho', 'A3 usé: el ritmo de las láminas', 'A4 usé: la dirección visual del plato'].join('\n')
  return [...l, A({ de: DIRECCION, tipo: 'integra', texto: `## Lámina 1\nTítulo: hola\n\n## Citas\n${cita}` })]
}

describe('BLOQUEANTE 2 · la cota de la mesa RESERVA lo que viene después (imagen + observador + jefatura)', () => {
  it('con imagen generada se reservan 2,0 y sin ella 1,7 (incluye la revisión de la jefatura, US$ 1,50); el turno reserva 0,6: la cota salta cuando gasto + 0,6 + lo que sigue pasa el tope', () => {
    expect(reservaDeLoQueSigue(true)).toBe(2)
    expect(reservaDeLoQueSigue(false)).toBe(1.7)
    const e = est()
    expect(cotaAgotada(e, ctx(2.4, 5, true))).toBeNull() // 2,4 + 0,6 + 2,0 = 5,0 · no pasa
    expect(cotaAgotada(e, ctx(2.41, 5, true))).toMatch(/lo que sigue/)
    expect(cotaAgotada(e, ctx(2.7, 5, false))).toBeNull() // 2,7 + 0,6 + 1,7 = 5,0
    expect(cotaAgotada(e, ctx(2.71, 5, false))).toMatch(/lo que sigue/)
  })
  it('la integración «con lo que hay» puede pasar del tope pero no se come lo que viene después: bajo el techo ×1,2 tiene que caber también lo que sigue', () => {
    contador = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' })]
    const techo = techoDe(5)
    expect(techo).toBe(6)
    // 3,4 + 0,6 + 2,0 = 6,0 → cabe: integra; 3,41 → no cabe: a dibujar sin otra integración (la reserva incluye la revisión de la jefatura, US$ 1,50)
    expect(siguienteDeLaMesa(est(), l, ctx(3.4, 5, true))).toMatchObject({ accion: 'turno', tipo: 'integrar' })
    expect(siguienteDeLaMesa(est(), l, ctx(3.41, 5, true))).toMatchObject({ accion: 'seguir_a_dibujar' })
    // sin imagen la reserva es menor: 3,7 + 0,6 + 1,7 = 6,0
    expect(siguienteDeLaMesa(est(), l, ctx(3.7, 5, false))).toMatchObject({ accion: 'turno', tipo: 'integrar' })
    expect(siguienteDeLaMesa(est(), l, ctx(3.71, 5, false))).toMatchObject({ accion: 'seguir_a_dibujar' })
  })
})

describe('BLOQUEANTE 2 · T9 · si el tope corta, la pieza LLEGA a la bandeja (nunca «nada entregado»)', () => {
  it('turnos de US$ 0,9 (el caso de CC#3): la mesa deja lugar para dibujar y la pieza llega a la bandeja', async () => {
    const { M, a, id } = await montar({ dry_run: false })
    const { ultima } = await jugar(M, id, a, (t) => ({ texto: t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? pieza() : `aporte de ${t.agente}`, costo_usd: 0.9 }))
    expect(String(ultima.cuerpo.estado)).not.toBe('fallido')
    expect(M.llamadas.bandeja.length).toBeGreaterThanOrEqual(1)
    expect(ultima.cuerpo.output_id ?? M.llamadas.salida).toBeTruthy()
    expect(M.encargos.get(id)!.gasto_usd).toBeLessThanOrEqual(6 + 0.9)
  })

  it('turnos tan caros que el tope corta antes de armar nada: el texto del equipo va a la bandeja marcado «cerrado por tope» (no se pierde)', async () => {
    const { M, a, id } = await montar({ dry_run: false })
    const { ultima } = await jugar(M, id, a, (t) => ({ texto: t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? pieza() : `aporte de ${t.agente}`, costo_usd: 2.5 }))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado_por_tope', con_desacuerdo: true })
    expect(M.llamadas.bandeja).toHaveLength(1)
    expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/SIN DIBUJAR/)
    expect(String(M.llamadas.bandeja[0].vista_previa)).toMatch(/aporte de|Idea|Lámina/)
    expect(M.encargos.get(id)!.estado).toBe('cerrado_por_tope')
    expect(M.llamadas.render).toBe(0)
  })

  it('O01 · el techo absoluto (tope × 1,2) CIERRA en el orquestador: con el primer turno pasado del techo no hay segundo turno y lo escrito llega a la bandeja', async () => {
    const { M, a, id } = await montar({ dry_run: false })
    const { ultima, turnos } = await jugar(M, id, a, (t) => ({ texto: `Idea de ${t.agente}: un gancho con el plato del día`, costo_usd: techoDe(5) + 0.5 }))
    expect(turnos).toHaveLength(1)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado_por_tope' })
    expect(M.llamadas.bandeja).toHaveLength(1)
    expect(M.llamadas.avisos.some((x) => x.canal === 'alertas' && /Cierre por tope/.test(x.texto))).toBe(true)
  })
})

describe('O01 · el techo absoluto cierra DENTRO de la mesa', () => {
  // el motor corta primero cuando el gasto pasa el tope de la plantilla; esta es la segunda red: la mesa por sí sola, con un motor que no cortaría
  it('con el gasto en el techo ×1,2 la mesa no abre otro turno: cierra por tope y lo escrito llega a la bandeja', async () => {
    const { M, MS, a, id } = await montar({ dry_run: false })
    const t = a.cuerpo.turno as { n: number }
    await recibirResultadoMesa(M.P, id, t.n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.2, workflow_execution_id: 'ex-1' })
    const enc = M.encargos.get(id)!
    enc.estado_del_motor.gasto_usd = techoDe(5); enc.gasto_usd = techoDe(5)
    const turnosAntes = MS.filas.length
    const pl = { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, tope_encargo_usd: 100 } }
    const r = await avanzarMesa(M.P, (await M.P.almacen.leerEncargo(id))!, pl, pl.pasos.findIndex((x) => x.funcion === 'mesa'))
    expect(r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado_por_tope' })
    expect(MS.filas).toHaveLength(turnosAntes) // no se abrió ni se anotó nada más
    expect(M.llamadas.bandeja).toHaveLength(1)
    // con el gasto lejos del techo la mesa sigue trabajando (abre un turno)
    const { M: M2, a: a2, id: id2 } = await montar({ dry_run: false })
    await recibirResultadoMesa(M2.P, id2, (a2.cuerpo.turno as { n: number }).n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.2, workflow_execution_id: 'ex-1' })
    const e2 = M2.encargos.get(id2)!
    e2.estado_del_motor.gasto_usd = 1; e2.gasto_usd = 1
    const r2 = await avanzarMesa(M2.P, (await M2.P.almacen.leerEncargo(id2))!, pl, pl.pasos.findIndex((x) => x.funcion === 'mesa'))
    expect(r2.cuerpo).toMatchObject({ accion: 'esperar' })
  })
})

describe('BLOQUEANTE 1 · el tablero y las citas llegan a la jefatura', () => {
  const tablero = (l: Aporte[]) => tableroParaLaJefatura(l, l.at(-1)!.texto, PERTINENTES)
  it('lista cada aporte con su referencia, lo que la dirección dice que usó y descartó, y lo que el código comprobó', () => {
    contador = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige', texto: 'Idea rectora: el plato del día' }), A({ de: 'content-creator', tipo: 'aporta', texto: 'Tres titulares' }), A({ de: 'carousel-designer', tipo: 'aporta', texto: 'Ritmo 5 láminas' }), A({ de: 'marketing_instagram_curator', tipo: 'aporta', texto: 'Foto propia 3' }),
      A({ de: DIRECCION, tipo: 'integra', texto: '## Citas\nA2 usé: el titular del gancho\nA3 usé: el ritmo de las láminas\nA4 descarté: la foto propia 3 choca con la proporción\nA9 usé: un aporte que no existe' })]
    const t = tablero(l)
    expect(t).toMatch(/A2 · content-creator · aporta: Tres titulares/)
    expect(t).toMatch(/## Aportes que la dirección dice que USÓ\n- A2 \(content-creator\): el titular del gancho/)
    expect(t).toMatch(/## Aportes que la dirección dice que DESCARTÓ\n- A4 \(marketing_instagram_curator\): la foto propia 3 choca/)
    expect(t).toMatch(/A9 \(NO EXISTE en el tablero\)/)
    expect(t).toMatch(/citas a aportes que no existen: A9/)
  })
  it('el tablero tiene tope de tamaño (el contexto de una revisión no es ilimitado)', () => {
    contador = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige' }), ...Array.from({ length: 60 }, () => A({ de: 'content-creator', tipo: 'aporta', texto: 'x'.repeat(590) })), A({ de: DIRECCION, tipo: 'integra', texto: '## Citas\nA2 usé: algo bien concreto' })]
    const t = tableroParaLaJefatura(l, l.at(-1)!.texto, PERTINENTES, 3000)
    expect(t.length).toBeLessThan(3200)
    expect(t).toMatch(/recortado/)
  })
  it('punta a punta: la revisión de la jefatura recibe el tablero como un documento de contexto más (con los aportes reales del libro)', async () => {
    const { M, MS, a, id } = await montar()
    const sobres: Array<{ payload: { contexto: Array<{ titulo: string; texto: string; funcion?: string }> } }> = []
    M.P.jefatura = (async (sobre: never) => { sobres.push(sobre); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
    const { ultima } = await jugar(M, id, a)
    expect(ultima.cuerpo.accion).toBe('esperar_jefatura')
    expect(sobres).toHaveLength(1)
    const doc = sobres[0].payload.contexto.find((c) => /tablero del equipo/.test(c.titulo))
    expect(doc).toBeTruthy()
    expect(doc!.funcion).toMatch(/si cada aporte citado fue real/)
    const aporteDe = (de: string) => MS.filas.find((f) => f.de === de && f.tipo === 'aporta')!
    expect(doc!.texto).toContain(`A${aporteDe('content-creator').n} · content-creator · aporta`)
    expect(doc!.texto).toMatch(/Aportes que la dirección dice que USÓ/)
    // los documentos de siempre siguen ahí
    expect(sobres[0].payload.contexto.map((c) => c.titulo)).toEqual(expect.arrayContaining(['Manual de marca del cliente', 'El brief de este entregable']))
  })
})

describe('T7 · un texto de 2.000 caracteres no se rechaza, pero queda una ficha VISIBLE para la jefatura', () => {
  it('«texto muy largo para la lámina»: ficha abierta de sugerencia (nunca bloquea) que viaja a la jefatura como marca heredada', async () => {
    const enorme = 'palabra '.repeat(260).trim().slice(0, 2000)
    const laminas = LAMINAS_OK.map((l, i) => (i === 1 ? [l[0], l[1], enorme, l[3]] : l))
    const { M, a, id } = await montar()
    const sobres: Array<{ payload: { marcas_heredadas: string[]; chequeos_previos: { pasaron: boolean } } }> = []
    M.P.jefatura = (async (sobre: never) => { sobres.push(sobre); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
    await jugar(M, id, a, (t) => (t.tipo === 'integrar' ? { texto: pieza(laminas) } : undefined))
    const fichas = M.encargos.get(id)!.estado_del_motor.fichas
    const largas = fichas.filter((f) => /texto muy largo para la lámina/.test(f.que ?? ''))
    expect(largas.length).toBeGreaterThanOrEqual(1)
    expect(largas.every((f) => f.gravedad === 'sugerencia' && f.estado === 'abierta')).toBe(true)
    expect(fichas.filter((f) => f.gravedad === 'bloquea' && f.donde === 'laminas')).toHaveLength(0)
    expect(sobres).toHaveLength(1)
    expect(sobres[0].payload.marcas_heredadas.some((m) => /texto muy largo para la lámina/.test(m))).toBe(true)
    expect(sobres[0].payload.chequeos_previos.pasaron).toBe(false)
  })
})

describe('BLOQUEANTE 6 · el vigía de la oficina reconoce y reentrega los turnos `mesa:`', () => {
  const ahora = new Date('2026-10-28T15:00:00Z')
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString()
  async function conTurnoViejo(min: number) {
    const { M, MS, a, id } = await montar()
    const t = a.cuerpo.turno as { n: number; paso: string }
    const db = new DbFalsa()
    db.semilla('oficina_turnos', [{ encargo_id: id, n: t.n, paso: t.paso, tipo: 'agente', estado: 'corriendo', inicio: hace(min), workflow_execution_id: 'ex-1' }])
    return { M, MS, id, db, t }
  }
  it('lanzado sin acuse a los 3 min: se vuelve a entregar el MISMO turno (la reentrega devuelve el pedido del turno de la mesa)', async () => {
    const { M, id, db, t } = await conTurnoViejo(5)
    db.tablas['oficina_turnos'][0].workflow_execution_id = null
    const r = await revisarPasosMuertos(M.P, db as never, ahora)
    expect(r.reanudar).toEqual([id]); expect(r.fallidos).toEqual([])
    const again = await avanzar(M.P, id)
    expect(again.cuerpo).toMatchObject({ accion: 'esperar', reentrega: true, turno: { n: t.n, paso: t.paso } })
  })
  it('un turno de la mesa que no volvió en 12 min NO mata la pieza: queda anotado como turno fallido en el libro y la mesa sigue (el vigía la reanuda)', async () => {
    const { M, MS, id, db } = await conTurnoViejo(20)
    const r = await revisarPasosMuertos(M.P, db as never, ahora)
    expect(r.reanudar).toEqual([id]); expect(r.fallidos).toEqual([]); expect(r.cierres).toEqual([])
    expect(M.encargos.get(id)!.estado).not.toBe('fallido')
    expect(MS.filas.filter((f) => f.tipo === 'nota' && /turno_fallido: sin vuelta en 12 min/.test(f.texto))).toHaveLength(1)
    // la mesa sigue: vuelve a pedir el turno a la dirección (primer reintento de tres)
    const sigue = await avanzar(M.P, id)
    expect(sigue.cuerpo).toMatchObject({ accion: 'esperar', turno: { agente: DIRECCION } })
  })
  it('un especialista cuyo turno muere tres veces seguidas se omite y la mesa convoca al siguiente: tampoco así se cae la pieza', async () => {
    const { M, MS, a, id } = await montar()
    let actual = await recibirResultado(M.P, id, (a.cuerpo.turno as { n: number }).n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.05, workflow_execution_id: 'ex-0' })
    const muerto = (actual.cuerpo.turno as { agente: string }).agente
    expect(muerto).not.toBe(DIRECCION)
    for (let i = 0; i < 3; i++) {
      const t = actual.cuerpo.turno as { n: number; paso: string; agente: string }
      expect(t.agente).toBe(muerto)
      const db = new DbFalsa()
      db.semilla('oficina_turnos', [{ encargo_id: id, n: t.n, paso: t.paso, tipo: 'agente', estado: 'corriendo', inicio: hace(20), workflow_execution_id: 'ex-1' }])
      const r = await revisarPasosMuertos(M.P, db as never, ahora)
      expect(r.fallidos).toEqual([]); expect(r.reanudar).toEqual([id])
      actual = await avanzar(M.P, id)
    }
    expect(MS.filas.filter((f) => f.tipo === 'nota' && f.de === muerto)).toHaveLength(3)
    expect((actual.cuerpo.turno as { agente: string }).agente).not.toBe(muerto)
    expect(M.encargos.get(id)!.estado).not.toBe('fallido')
  })
  it('si la dirección misma no vuelve y no escribió nada, no hay pieza que entregar: falla visible (un tablero vacío no se inventa)', async () => {
    const { M, a, id } = await montar()
    let actual = a
    for (let i = 0; i < 3; i++) {
      const t = actual.cuerpo.turno as { n: number; paso: string }
      const db = new DbFalsa()
      db.semilla('oficina_turnos', [{ encargo_id: id, n: t.n, paso: t.paso, tipo: 'agente', estado: 'corriendo', inicio: hace(20), workflow_execution_id: 'ex-1' }])
      await revisarPasosMuertos(M.P, db as never, ahora)
      actual = await avanzar(M.P, id)
    }
    expect(M.encargos.get(id)!.estado).toBe('fallido')
  })
})

// ───────────────────────── mutantes de la mesa
describe('P04 · aportes nuevos desde la última integración OBLIGAN a re-integrar', () => {
  it('con todo citado y sin novedades se traduce; un aporte nuevo (responde o material) devuelve el turno a la dirección', () => {
    const l = libroIntegrado()
    expect(siguienteDeLaMesa(est(), l, ctx())).toEqual({ accion: 'traducir' })
    const conRespuesta = [...l, A({ de: 'content-creator', tipo: 'responde', para: DIRECCION })]
    expect(siguienteDeLaMesa(est(), conRespuesta, ctx())).toMatchObject({ accion: 'turno', agente: DIRECCION, tipo: 'integrar', motivo: 'hay aportes nuevos' })
    const conMaterial = [...l, A({ de: 'portero', tipo: 'material', para: 'content-creator' })]
    expect(siguienteDeLaMesa(est(), conMaterial, ctx())).toMatchObject({ accion: 'turno', tipo: 'integrar' })
    const conAporte = [...l, A({ de: 'carousel-designer', tipo: 'aporta' })]
    expect(siguienteDeLaMesa(est(), conAporte, ctx())).toMatchObject({ accion: 'turno', tipo: 'integrar' })
  })
  it('un aporte ANTERIOR a la integración no obliga a integrar otra vez (la frontera es el número de la integración)', () => {
    const l = libroIntegrado()
    expect(siguienteDeLaMesa(est(), l, ctx()).accion).toBe('traducir')
    // una nota o un pedido nuevos no son aportes: tampoco obligan
    expect(siguienteDeLaMesa(est(), [...l, A({ de: 'content-creator', tipo: 'nota', texto: 'turno_fallido: x' })], ctx()).accion).toBe('traducir')
  })
})

describe('P10 · un agente que falla 3 veces ya no se convoca', () => {
  const fallo = (de: string) => A({ de, tipo: 'nota', texto: 'turno_fallido: sin vuelta' })
  it('con 2 fallos todavía se le convoca; con 3 la mesa sigue sin él y convoca al siguiente', () => {
    contador = 0
    const base = [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' })]
    const dosFallos = [...base, fallo('carousel-designer'), fallo('carousel-designer')]
    expect(siguienteDeLaMesa(est(), dosFallos, ctx())).toMatchObject({ accion: 'turno', agente: 'carousel-designer', tipo: 'aportar' })
    const tresFallos = [...dosFallos, fallo('carousel-designer')]
    const sig = siguienteDeLaMesa(est(), tresFallos, ctx())
    expect(sig).toMatchObject({ accion: 'turno', tipo: 'aportar', agente: 'marketing_instagram_curator' })
    expect((sig as { agente: string }).agente).not.toBe('carousel-designer')
    expect(COTAS.REINTENTOS_DE_TURNO).toBe(3)
  })
  it('si los tres fallan, la mesa no se queda esperando a nadie: pasa a integrar con lo que hay', () => {
    contador = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), ...['carousel-designer', 'marketing_instagram_curator'].flatMap((de) => [fallo(de), fallo(de), fallo(de)])]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ accion: 'turno', agente: DIRECCION, tipo: 'integrar' })
  })
})

describe('H04 · la herramienta respeta la profundidad máxima de los pedidos encadenados', () => {
  async function respondiendoA(profundidad: number) {
    const { M, MS, a, id } = await montar()
    const pedido = (await MS.aportar({ encargo_id: id, de: DIRECCION, para: 'content-creator', tipo: 'pide', texto: 'pedido de partida', refs: [], responde_a: null, profundidad, costo_usd: 0, workflow_execution_id: null }))
    if (!pedido.ok) throw new Error('no se pudo sembrar')
    const mesa = M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
    mesa.turno_abierto = { n: 1, agente: 'content-creator', tipo: 'responder', responde_a: pedido.aporte.id }
    void a
    return { M, MS, id }
  }
  const pedir = (M: Awaited<ReturnType<typeof montar>>['M'], id: string) => registrarHerramienta(M.P, { herramienta: 'mesa_pedir', encargo_id: id, de: 'content-creator', a: 'carousel-designer', que: 'dime cuántas láminas necesita el gancho' })
  it(`un pedido nacido de uno de profundidad ${COTAS.MAX_PROFUNDIDAD} (llegaría a ${COTAS.MAX_PROFUNDIDAD + 1}) se rechaza con ok:false y no se anota`, async () => {
    const { M, MS, id } = await respondiendoA(COTAS.MAX_PROFUNDIDAD)
    const antes = MS.filas.length
    const r = await pedir(M, id)
    expect(r.cuerpo).toMatchObject({ ok: false }); expect(String(r.cuerpo.motivo)).toMatch(/encadenados/)
    expect(MS.filas).toHaveLength(antes)
  })
  it(`uno de profundidad ${COTAS.MAX_PROFUNDIDAD - 1} (llega justo al máximo) sí se anota, con su profundidad`, async () => {
    const { M, MS, id } = await respondiendoA(COTAS.MAX_PROFUNDIDAD - 1)
    const r = await pedir(M, id)
    expect(r.cuerpo).toMatchObject({ ok: true })
    expect(MS.filas.at(-1)).toMatchObject({ tipo: 'pide', de: 'content-creator', para: 'carousel-designer', profundidad: COTAS.MAX_PROFUNDIDAD })
  })
})

describe('O02 · el cupo de 3 pedidos de material al portero tiene tope', () => {
  it('con el cupo gastado el pedido se contesta «se agotó el cupo» sin llamar al portero (aunque haya cerebro) y la mesa sigue', async () => {
    const { M, MS, a, id } = await montar()
    let llamadasAlPortero = 0
    M.P.cerebro = new Proxy({}, { get: () => () => { llamadasAlPortero++; throw new Error('el portero no debía llamarse') } }) as never
    const { ultima } = await jugar(M, id, a, (t) => {
      if (t.agente === 'content-creator' && t.tipo === 'aportar') {
        ;(M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa).marcas.pedidos_de_material = 3
        void MS.aportar({ encargo_id: id, de: 'content-creator', para: 'portero', tipo: 'pide', texto: 'el precio vigente del plato', refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
      }
      return undefined
    })
    expect(llamadasAlPortero).toBe(0)
    expect(MS.filas.find((f) => f.tipo === 'material')?.texto).toMatch(/se agotó el cupo de pedidos de material/)
    expect(ultima.cuerpo.accion).toBe('cerrado')
  })
})

describe('O04 · una respuesta repetida o fuera de orden no duplica nada', () => {
  it('la misma respuesta dos veces: la segunda no vuelve a anotar el aporte ni a sumar el gasto; una de un turno que no existe = 409', async () => {
    const { M, MS, a, id } = await montar()
    const t = a.cuerpo.turno as { n: number }
    const primera = await recibirResultado(M.P, id, t.n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.3, workflow_execution_id: 'ex-1' })
    expect(primera.status).toBe(200)
    const gastoDespues = M.encargos.get(id)!.gasto_usd
    const dirigeAntes = MS.filas.filter((f) => f.tipo === 'dirige').length
    expect(dirigeAntes).toBe(1)
    const repetida = await recibirResultado(M.P, id, t.n, { texto: 'Otra idea distinta', costo_usd: 0.3, workflow_execution_id: 'ex-1b' })
    expect(repetida.status).toBe(200)
    expect(MS.filas.filter((f) => f.tipo === 'dirige')).toHaveLength(1)
    expect(MS.filas.find((f) => f.tipo === 'dirige')!.texto).toBe('Idea rectora: el plato del día')
    expect(M.encargos.get(id)!.gasto_usd).toBe(gastoDespues)
    const futura = await recibirResultado(M.P, id, 99, { texto: 'de un turno que no existe', costo_usd: 0.3 })
    expect(futura).toMatchObject({ status: 409, cuerpo: { error: 'turno_no_esperado' } })
    expect(M.encargos.get(id)!.gasto_usd).toBe(gastoDespues)
  })
  it('lo mismo llamando directo a la mesa (la compuerta propia del paso, sin pasar por la de la oficina): repetida = 200 sin duplicar; inexistente = 409', async () => {
    const { M, MS, a, id } = await montar()
    const t = a.cuerpo.turno as { n: number }
    await recibirResultadoMesa(M.P, id, t.n, { texto: 'Idea rectora: el plato del día', costo_usd: 0.3, workflow_execution_id: 'ex-1' })
    const gasto = M.encargos.get(id)!.gasto_usd
    const repetida = await recibirResultadoMesa(M.P, id, t.n, { texto: 'Otra idea distinta', costo_usd: 0.3, workflow_execution_id: 'ex-1b' })
    expect(repetida.status).toBe(200)
    expect(MS.filas.filter((f) => f.tipo === 'dirige')).toHaveLength(1)
    expect(M.encargos.get(id)!.gasto_usd).toBe(gasto)
    expect(await recibirResultadoMesa(M.P, id, 99, { texto: 'x', costo_usd: 0.3 })).toMatchObject({ status: 409, cuerpo: { error: 'turno_no_esperado' } })
    expect(await recibirResultadoMesa(M.P, 'no-existe', 1, { texto: 'x' })).toMatchObject({ status: 404 })
  })
})

describe('E02 · las marcas ajenas en una imagen la bloquean (las propias del cliente no)', () => {
  const item = [{ indice: 0, ref: 'hook' }]
  const lect = (marcas: string[]) => ({ 0: { texto_leido: [], marcas, personas: 0, leido: true } })
  it('una marca ajena rechaza la imagen con el motivo; ninguna aceptada', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: lect(['Coca-Cola']), permitido: ['hoy'], marcasPropias: ['Náufrago'] })
    expect(o.rechazadas).toHaveLength(1)
    expect(o.rechazadas[0].motivo).toMatch(/marca ajena: Coca-Cola/)
    expect(o.aceptadas).toEqual({})
  })
  it('la marca del cliente (con otra mayúscula o sin tilde) no cuenta como ajena y la imagen se acepta', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: lect(['NAUFRAGO']), permitido: ['hoy'], marcasPropias: ['Náufrago'] })
    expect(o.rechazadas).toHaveLength(0)
    expect(o.aceptadas).toEqual({ hook: [0] })
  })
  it('propia + ajena en la misma imagen: se rechaza solo por la ajena; sin marcas, se acepta', () => {
    const mixta = observacionDeLaMesa({ items: item, lecturas: lect(['Náufrago', 'Nike']), permitido: [], marcasPropias: ['Náufrago'] })
    expect(mixta.rechazadas[0].motivo).toMatch(/marca ajena: Nike/); expect(mixta.rechazadas[0].motivo).not.toMatch(/Náufrago/)
    expect(observacionDeLaMesa({ items: item, lecturas: lect([]), permitido: [], marcasPropias: ['Náufrago'] }).aceptadas).toEqual({ hook: [0] })
  })
  it('sin lectura del observador no se bloquea (se acepta con aviso): la falta de ojos no es una marca', () => {
    const o = observacionDeLaMesa({ items: item, lecturas: { 0: { texto_leido: [], marcas: [], personas: 0, leido: false } }, permitido: [] })
    expect(o.sin_lectura).toEqual([0]); expect(o.rechazadas).toHaveLength(0); expect(o.aceptadas).toEqual({ hook: [0] })
  })
})
