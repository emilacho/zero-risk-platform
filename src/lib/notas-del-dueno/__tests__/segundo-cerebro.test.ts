import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../../oficina/orquestador'
import { TARGET_STEP_PRODUCIR } from '../../oficina/sobre'
import { validarPlantilla } from '../../oficina/plantilla'
import { POST_IMG } from '../../oficina/plantillas/post-img'
import { CARRUSEL_IG_V1 } from '../../oficina/plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../../oficina/plantillas/kit-historias'
import { POST_IMG_CON_JEFATURA, CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA } from '../../oficina/plantillas/con-jefatura'
import { conSegundoCerebro, MARGEN_EXTRA, PASO_DE_DISENO } from '../../oficina/plantillas/con-segundo-cerebro'
import type { Plantilla } from '../../oficina/tipos'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PIEZA_OK, FICHAS_VACIAS, crearMemoria, correr, direccionGenerada, observacion, type Guion, type Memoria } from '../../oficina/__tests__/memoria'
import type { NotaVista } from '../autorevision'

const j = (x: unknown) => JSON.stringify(x)
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const NOTAS: NotaVista[] = [
  { id: 'nota-1', texto: 'El dueño rechazó «Post del lunes»: «No uses la palabra ceviche en mayúsculas»' },
  { id: 'nota-2', texto: '(vale para todos los clientes) El dueño comentó sobre «Post»: «Escribe frases cortas»' },
]
const PIEZA = JSON.parse(PIEZA_OK) as Record<string, unknown>
const CORREGIDA = { ...PIEZA, pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp.' }
const sinChoque = j({ choca: false, hallazgos: [] })
const conChoque = (pieza: Record<string, unknown>, campo = 'pie_de_foto', nota_id = 'nota-2') => j({ choca: true, hallazgos: [{ nota_id, campo, que_choca: 'la frase era larga', que_cambio: 'la acorté' }], corregida: pieza })

interface Registro { client_id: string; encargo_id: string; agente: string; paso: string; notas_vistas: string[]; choco: boolean; cambios: unknown[]; costo_usd: number; clave_unica: string }
type PuertoDeNotas = NonNullable<Memoria['P']['notas']>
const guionPost = (o: Partial<Guion> = {}): Guion => ({
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  texto: () => ({ texto: PIEZA_OK }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  corrige: () => ({ texto: '{"respuestas": []}' }), decide: () => ({ texto: '{"respuestas": []}' }), decide_imagen: () => ({ texto: '{"respuestas": []}' }),
  reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }), reimagen_mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  autorevision_texto: () => ({ texto: sinChoque }), autorevision_diseno: () => ({ texto: sinChoque }),
  ...o,
})
/** las notas se ponen ANTES de abrir: el paso que las lee corre dentro de la apertura, antes del primer empleado */
async function abierto(plantilla: Plantilla = conSegundoCerebro(POST_IMG), notas?: NotaVista[] | PuertoDeNotas, dry_run = true) {
  const M = crearMemoria({ plantilla })
  const reg: Registro[] = []
  if (Array.isArray(notas)) M.P.notas = { leer: async () => notas, registrar: async (r) => { reg.push(r) } }
  else if (notas) M.P.notas = notas
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run, familia: plantilla.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  expect(a.status).toBe(200)
  return { M, id: String(a.cuerpo.encargo_id), reg }
}
/** lo que ve un agente de verdad: la «entrega actual» que viene dentro del pedido de la auto-revisión */
const entregaActual = (tarea: string): Record<string, unknown> => {
  const desde = tarea.indexOf('Tu entrega actual:')
  const abre = tarea.indexOf('```json', desde)
  const cierra = tarea.indexOf('```', abre + 7)
  return JSON.parse(tarea.slice(abre + 7, cierra))
}
const arte = (M: Memoria, id: string, n: string) => M.encargos.get(id)!.estado_del_motor.artefactos[n]?.datos as Record<string, any>
const piezaFinal = (M: Memoria, id: string) => arte(M, id, 'pieza_post')

describe('las plantillas con el segundo cerebro', () => {
  const familias: Array<[string, Plantilla, Plantilla]> = [['post_img', POST_IMG, POST_IMG_CON_JEFATURA], ['carrusel_ig_v1', CARRUSEL_IG_V1, CARRUSEL_IG_CON_JEFATURA], ['kit_historias', KIT_HISTORIAS, KIT_HISTORIAS_CON_JEFATURA]]
  for (const [nombre, sola, conJ] of familias) {
    for (const [etiqueta, base] of [['sin jefatura', sola], ['con jefatura', conJ]] as const) {
      it(`${nombre} ${etiqueta}: sigue siendo una plantilla válida y no cambia lo que ya tenía`, () => {
        expect(validarPlantilla(base)).toEqual([])
        const p = conSegundoCerebro(base)
        expect(validarPlantilla(p)).toEqual([])
        const claves = p.pasos.map((x) => x.clave)
        const originales = base.pasos.map((x) => x.clave)
        expect(claves.filter((c) => !['leer_notas', 'autorevision_texto', 'autorevision_diseno'].includes(c))).toEqual(originales)
        expect(claves.indexOf('leer_notas')).toBe(claves.indexOf('abrir') + 1)
        expect(claves.indexOf('autorevision_texto')).toBe(claves.indexOf('texto') + 1)
        expect(claves.indexOf('autorevision_diseno')).toBe(claves.indexOf(PASO_DE_DISENO[sola.tipo]) + 1)
        expect(p.limites.margen).toBe(base.limites.margen + MARGEN_EXTRA)
        expect(base.pasos.some((x) => x.clave === 'leer_notas')).toBe(false) // la base no se toca
      })
    }
  }
  it('cada auto-revisión es del MISMO agente que el paso que revisa, deja su entrega en el mismo artefacto y solo corre si hay notas', () => {
    const p = conSegundoCerebro(POST_IMG)
    for (const [clave, revisa] of [['autorevision_texto', 'texto'], ['autorevision_diseno', 'direccion_visual']] as const) {
      const a = p.pasos.find((x) => x.clave === clave)!, r = p.pasos.find((x) => x.clave === revisa)!
      expect(a).toMatchObject({ tipo: 'agente', quien: r.quien, salida_artefacto: r.salida_artefacto, revisa, salida: { esquema: 'autorevision.v1', reintento_formato: 1 }, condicion: { tipo: 'si_artefacto', artefacto: 'notas_del_dueno', campo: 'hay', igual: true } })
      expect(a.entrada).toEqual([r.salida_artefacto, 'notas_del_dueno'])
    }
  })
  it('las jefaturas y la segunda mirada no cambian: sus pasos son idénticos a los de la base', () => {
    const base = POST_IMG_CON_JEFATURA, p = conSegundoCerebro(base)
    for (const c of ['jefatura', 'chequeos', 'chequeos_2', 'chequeos_3', 'entrega', 'cierre']) expect(p.pasos.find((x) => x.clave === c)).toEqual(base.pasos.find((x) => x.clave === c))
  })
  it('una plantilla a la que le falta un paso no se transforma en silencio', () => {
    expect(() => conSegundoCerebro({ ...POST_IMG, pasos: POST_IMG.pasos.filter((x) => x.clave !== 'texto') })).toThrow(/no tiene los pasos/)
  })
  it('el validador rechaza una auto-revisión mal puesta', () => {
    const p = conSegundoCerebro(POST_IMG)
    const mal = (cambio: (x: Plantilla) => void) => { const c = JSON.parse(JSON.stringify(p)) as Plantilla; cambio(c); return validarPlantilla(c) }
    expect(mal((c) => { c.pasos.find((x) => x.clave === 'autorevision_texto')!.quien = 'otro-agente' }).join('|')).toMatch(/mismo agente/)
    expect(mal((c) => { c.pasos.find((x) => x.clave === 'autorevision_texto')!.salida_artefacto = 'otra_cosa' }).join('|')).toMatch(/mismo artefacto/)
    expect(mal((c) => { c.pasos.find((x) => x.clave === 'autorevision_texto')!.revisa = 'abrir' }).join('|')).toMatch(/solo se auto-revisa un paso de agente/)
    expect(mal((c) => { c.pasos.find((x) => x.clave === 'autorevision_texto')!.revisa = 'cierre' }).join('|')).toMatch(/no es un paso anterior/)
    expect(mal((c) => { delete c.pasos.find((x) => x.clave === 'autorevision_texto')!.revisa }).join('|')).toMatch(/van juntos/)
    expect(mal((c) => { c.pasos.find((x) => x.clave === 'texto')!.revisa = 'abrir' }).join('|')).toMatch(/van juntos/)
  })
})

describe('sin notas, todo queda igual que antes', () => {
  it('sin puerto de notas la plantilla nueva hace los mismos pasos, con el mismo gasto y la misma pieza que la vieja', async () => {
    const a = await abierto(POST_IMG), b = await abierto(conSegundoCerebro(POST_IMG))
    const ra = await correr(a.M, a.id, guionPost()), rb = await correr(b.M, b.id, guionPost())
    expect(rb.pasos).toEqual(ra.pasos)
    expect(rb.pasos.some((p) => p.startsWith('autorevision'))).toBe(false)
    expect(piezaFinal(b.M, b.id)).toEqual(piezaFinal(a.M, a.id))
    expect(b.M.encargos.get(b.id)!.gasto_usd).toBe(a.M.encargos.get(a.id)!.gasto_usd)
    expect(rb.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(arte(b.M, b.id, 'notas_del_dueno')).toEqual({ hay: false, notas: [] })
  })
  it('con el puerto pero sin notas: tampoco se llama a nadie de más', async () => {
    const { M, id, reg } = await abierto(undefined, [])
    const r = await correr(M, id, guionPost())
    expect(r.pasos.some((p) => p.startsWith('autorevision'))).toBe(false)
    expect(reg).toHaveLength(0)
  })
  it('si leer las notas falla, la pieza sigue como siempre y el motivo queda anotado', async () => {
    const { M, id } = await abierto(undefined, { leer: async () => { throw new Error('base caída') }, registrar: async () => {} })
    const r = await correr(M, id, guionPost())
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(r.pasos.some((p) => p.startsWith('autorevision'))).toBe(false)
    expect(arte(M, id, 'notas_del_dueno')).toMatchObject({ hay: false, error: 'base caída' })
  })
})

describe('con notas: el productor se auto-revisa', () => {
  it('las notas SOLO viajan en el pedido de la auto-revisión, que lleva el mismo contexto del paso que revisa, la entrega actual y el contrato', async () => {
    const { M, id } = await abierto(undefined, NOTAS)
    const r = await correr(M, id, guionPost())
    expect(r.pasos).toContain('autorevision_texto')
    expect(r.pasos).toContain('autorevision_diseno')
    const sec = r.tareas['autorevision_texto'][0]
    expect(sec).toContain('nota-1'); expect(sec).toContain('No uses la palabra ceviche en mayúsculas'); expect(sec).toContain('(vale para todos los clientes)')
    expect(sec).toContain('Ceviche de Olón a $7.00')            // su entrega actual
    expect(sec).toContain(r.tareas['texto'][0].slice(0, 400))   // el mismo contexto de siempre (manual, brief…)
    expect(sec).toContain('"choca": false')
    // el pedido original del paso NO trae las notas, ni el de nadie más
    for (const [paso, ts] of Object.entries(r.tareas)) if (!paso.startsWith('autorevision')) for (const t of ts) { expect(t).not.toContain('nota-1'); expect(t).not.toContain('No uses la palabra ceviche') }
    expect(M.llamadas.revisorPedidos.join('\n')).not.toContain('No uses la palabra ceviche')
    const ped = r.pedidos['autorevision_texto'][0]
    expect(ped).toMatchObject({ esquema: 'autorevision.v1', max_budget_usd: 0.15, agent_name: 'content-creator', extra: expect.objectContaining({ paso_de_la_oficina: 'autorevision_texto' }) })
    expect(r.pedidos['autorevision_diseno'][0]).toMatchObject({ agent_name: 'marketing_instagram_curator', esquema: 'autorevision.v1' })
    expect(r.tareas['autorevision_diseno'][0]).toContain('Luz natural lateral')
  })
  it('si nada choca, la pieza sigue TAL CUAL y la auto-revisión queda anotada sin cambios', async () => {
    const sola = await abierto(POST_IMG)
    await correr(sola.M, sola.id, guionPost())
    const { M, id, reg } = await abierto(undefined, NOTAS)
    const r = await correr(M, id, guionPost())
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(piezaFinal(M, id)).toEqual(piezaFinal(sola.M, sola.id))
    expect(M.encargos.get(id)!.estado_del_motor.artefactos['pieza_post'].version).toBe(sola.M.encargos.get(sola.id)!.estado_del_motor.artefactos['pieza_post'].version)
    expect(reg.map((x) => [x.paso, x.choco, x.agente, x.notas_vistas])).toEqual([['autorevision_diseno', false, 'marketing_instagram_curator', ['nota-1', 'nota-2']], ['autorevision_texto', false, 'content-creator', ['nota-1', 'nota-2']]])
    expect(M.encargos.get(id)!.gasto_usd).toBeGreaterThan(sola.M.encargos.get(sola.id)!.gasto_usd) // las dos llamadas se pagan y se cuentan
    expect(reg.map((x) => x.costo_usd)).toEqual([0.07, 0.07]) // y el rastro guarda lo que costó cada una
  })
  it('si chocó, la pieza corregida reemplaza a la original, pasa los chequeos duros y llega a la bandeja', async () => {
    const { M, id, reg } = await abierto(undefined, NOTAS)
    const r = await correr(M, id, guionPost({ autorevision_texto: () => ({ texto: conChoque(CORREGIDA) }) }), 80)
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(piezaFinal(M, id).pie_de_foto).toBe('Ceviche de Olón a $7.00. Pídelo por WhatsApp.')
    expect(piezaFinal(M, id).hashtags).toEqual(['#ceviche', '#olon'])
    expect(M.encargos.get(id)!.estado_del_motor.artefactos['pieza_post'].version).toBeGreaterThan(1)
    const t = reg.find((x) => x.paso === 'autorevision_texto')!
    expect(t).toMatchObject({ choco: true, cambios: [{ nota_id: 'nota-2', campo: 'pie_de_foto', que_choca: 'la frase era larga', que_cambio: 'la acorté' }] })
    expect(t.clave_unica).toMatch(new RegExp(`^${id}:autorevision_texto:\\d+$`))
  })
  it('la pieza corregida se vuelve a chequear por código: un teléfono inventado en la corrección no pasa', async () => {
    const { M, id } = await abierto(undefined, NOTAS)
    const r = await correr(M, id, guionPost({ autorevision_texto: () => ({ texto: conChoque({ ...PIEZA, pie_de_foto: 'Ceviche a $7.00. Llama al 0999999999.' }) }) }), 80)
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    const fs = M.encargos.get(id)!.estado_del_motor.fichas
    expect(fs.some((f) => f.origen === 'chequeo' && f.gravedad === 'bloquea')).toBe(true) // los chequeos duros siguen mandando sobre lo que el productor corrigió
  })
  it('la auto-revisión del que diseña corrige la dirección visual y lo que viene después la usa', async () => {
    const { M, id } = await abierto(undefined, NOTAS)
    // como lo haría un agente de verdad: parte de la entrega que ve en el pedido y cambia solo el estilo
    const r = await correr(M, id, guionPost({ autorevision_diseno: (_n, t) => ({ texto: conChoque({ ...entregaActual(t), estilo: 'fotografía cálida y cercana, sin filtros' }, 'estilo', 'nota-1') }) }), 80)
    expect(r.tareas['autorevision_diseno'][0]).not.toContain('reglas_rechazadas')            // lo que el código agregó después no se le muestra al agente
    expect(r.pasos.filter((p) => p === 'autorevision_diseno')).toHaveLength(1)               // y la corrección valió a la primera
    expect(arte(M, id, 'visual_direction').estilo).toBe('fotografía cálida y cercana, sin filtros')
    expect(r.tareas['prompts'][0]).toContain('fotografía cálida y cercana, sin filtros')   // el ingeniero de prompts ya trabaja con la dirección corregida
    expect(arte(M, id, 'visual_direction').decision).toMatchObject({ modo: 'generada' })    // los campos que el código deriva siguen ahí
  })
  it('una ficha que el validador levanta de nuevo no se duplica', async () => {
    const { M, id } = await abierto(undefined, NOTAS)
    const ninguna = { ...JSON.parse(direccionGenerada()), decision: { modo: 'ninguna', motivo: 'sin imagen' } }
    await correr(M, id, guionPost({ direccion_visual: () => ({ texto: j(ninguna) }), autorevision_diseno: (_n, t) => ({ texto: conChoque({ ...entregaActual(t), decision: { modo: 'ninguna', motivo: 'sin foto apta y sin imagen' } }, 'decision', 'nota-1') }) }), 80)
    expect(arte(M, id, 'visual_direction').decision.motivo).toBe('sin foto apta y sin imagen') // la corrección SÍ valió (no es un caso vacío) y el validador volvió a levantar la misma ficha
    const ids = M.encargos.get(id)!.estado_del_motor.fichas.map((f) => f.id)
    expect(ids.filter((x) => x === 'vd-ninguna')).toHaveLength(1)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('con notas: lo que sale mal nunca rompe la entrega', () => {
  const casos: Array<[string, (n: number) => { texto?: string; error?: string }]> = [
    ['el agente no contesta', () => ({ error: 'se cortó' })],
    ['responde algo que no es JSON', () => ({ texto: 'no sé qué decir' })],
    ['dice que nada chocó pero trae cambios', () => ({ texto: j({ choca: false, hallazgos: [], corregida: CORREGIDA }) })],
    ['dice que chocó sin nombrar ninguna nota', () => ({ texto: j({ choca: true, hallazgos: [], corregida: CORREGIDA }) })],
    ['cita una nota que no existe', () => ({ texto: conChoque(CORREGIDA, 'pie_de_foto', 'nota-99') })],
    ['cambia un campo que no nombró', () => ({ texto: conChoque({ ...CORREGIDA, hashtags: ['#otro'] }) })],
    ['nombra un campo que no cambió', () => ({ texto: conChoque(CORREGIDA, 'llamado') })],
    ['dice que chocó pero entrega la misma pieza', () => ({ texto: conChoque(PIEZA) })],
    ['la pieza corregida no cumple el formato', () => ({ texto: conChoque({ pie_de_foto: 'solo texto' }) })],
    ['cambia solo lo que nombró pero rompe el formato del campo (un pie de foto de 4.000 caracteres)', () => ({ texto: conChoque({ ...PIEZA, pie_de_foto: 'x'.repeat(4000) }) })],
    ['cambia solo lo que nombró pero con un tipo equivocado (un número en vez de texto)', () => ({ texto: conChoque({ ...PIEZA, pie_de_foto: 12345 }) })],
    ['trae más de 6 hallazgos', () => ({ texto: j({ choca: true, hallazgos: Array.from({ length: 7 }, () => ({ nota_id: 'nota-2', campo: 'pie_de_foto', que_choca: 'x', que_cambio: 'y' })), corregida: CORREGIDA }) })],
  ]
  for (const [nombre, respuesta] of casos) {
    it(`${nombre}: un reintento y, si sigue mal, la pieza sigue tal cual y el encargo NO falla`, async () => {
      const sola = await abierto(POST_IMG)
      await correr(sola.M, sola.id, guionPost())
      const { M, id, reg } = await abierto(undefined, NOTAS)
      let llamadas = 0
      const r = await correr(M, id, guionPost({ autorevision_texto: (n) => { llamadas++; return respuesta(n) } }), 80)
      expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
      expect(piezaFinal(M, id)).toEqual(piezaFinal(sola.M, sola.id))
      const t = reg.filter((x) => x.paso === 'autorevision_texto')
      expect(t).toHaveLength(1)
      expect(t[0].choco).toBe(false)
      if (nombre.startsWith('el agente no contesta')) expect(t[0].cambios).toEqual([{ sin_respuesta: 'se cortó' }]) // se anota POR QUÉ no hubo auto-revisión
      expect(llamadas).toBeLessThanOrEqual(2)
      if (!nombre.startsWith('el agente no contesta')) expect(llamadas).toBe(2) // se le dio UNA oportunidad con el error literal
    })
  }
  it('el reintento lleva el error literal y, si el agente se corrige, la corrección vale', async () => {
    const { M, id, reg } = await abierto(undefined, NOTAS)
    const r = await correr(M, id, guionPost({ autorevision_texto: (n) => ({ texto: n === 1 ? conChoque(CORREGIDA, 'pie_de_foto', 'nota-99') : conChoque(CORREGIDA) }) }), 80)
    expect(r.tareas['autorevision_texto'][1]).toContain('nota-99')
    expect(r.tareas['autorevision_texto'][1]).toContain('citas notas que no existen')
    expect(piezaFinal(M, id).pie_de_foto).toBe('Ceviche de Olón a $7.00. Pídelo por WhatsApp.')
    expect(reg.find((x) => x.paso === 'autorevision_texto')).toMatchObject({ choco: true })
  })
  it('si registrar el rastro falla, la pieza sigue su camino', async () => {
    const { M, id } = await abierto(undefined, { leer: async () => NOTAS, registrar: async () => { throw new Error('tabla sin permiso') } })
    const r = await correr(M, id, guionPost({ autorevision_texto: () => ({ texto: conChoque(CORREGIDA) }) }), 80)
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(piezaFinal(M, id).pie_de_foto).toBe('Ceviche de Olón a $7.00. Pídelo por WhatsApp.')
  })
})

describe('carrusel y kit de historias', () => {
  const BRIEF_CARRUSEL = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el plato del día
- PROTAGONISTA: El plato del día. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- VOCABULARIO OBLIGATORIO:
  - plato
- PROHIBIDO:
  - premium
- SINTAXIS: Frases cortas.
- VISUAL: El plato aparece completo. No aparecen personas.
- VISUAL OBLIGATORIO:
  - El plato aparece completo
- VISUAL PROHIBIDO:
  - No aparecen personas
- LLAMADO A LA ACCIÓN: Escríbenos por WhatsApp
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`
  const parte = `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${BRIEF_CARRUSEL}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
  const TEXTO_BASE = 'Cada mañana empieza igual.\nHoy cambia el plato del día.\nPrueba el plato del día.\nLo preparamos al momento.\nEscríbenos por WhatsApp'
  const COPIA = { texto_base: TEXTO_BASE, pie_de_foto: 'El plato del día te espera.', hashtags: ['#plato'], llamado: 'Escríbenos por WhatsApp' }
  const LAMINAS = [
    { rol: 'hook', headline: 'Cada mañana empieza igual' }, { rol: 'problem', headline: 'Hoy cambia el plato del día' }, { rol: 'reframe', headline: 'Prueba el plato del día' },
    { rol: 'benefit', headline: 'Lo preparamos al momento' }, { rol: 'cta', headline: 'Escríbenos por WhatsApp', cta: 'Escríbenos por WhatsApp' },
  ]
  const sinImagenes = j({ resumen: 'Fondo de la marca', imagenes: [], reglas_de_imagen: { obligatorio: [], prohibido: [] } })
  const guion = (o: Partial<Guion> = {}): Guion => ({
    paquete: () => ({ texto: 'material del portero' }), direccion_visual: () => ({ texto: sinImagenes }), texto: () => ({ texto: j(COPIA) }), laminas: () => ({ texto: j({ laminas: LAMINAS }) }),
    revision_jefe: () => ({ texto: FICHAS_VACIAS }), corrige_texto: () => ({ texto: '{"respuestas": []}' }), ajusta_laminas: () => ({ texto: '{"respuestas": []}' }), corrige_laminas: () => ({ texto: '{"respuestas": []}' }),
    decide_texto: () => ({ texto: '{"respuestas": []}' }), decide_imagen: () => ({ texto: '{"respuestas": []}' }), ajusta_laminas_2: () => ({ texto: '{"respuestas": []}' }), decide_laminas: () => ({ texto: '{"respuestas": []}' }),
    autorevision_texto: () => ({ texto: sinChoque }), autorevision_diseno: () => ({ texto: sinChoque }), ...o,
  })
  async function carrusel(notas?: NotaVista[]) {
    const plantilla = conSegundoCerebro(CARRUSEL_IG_V1)
    const M = crearMemoria({ parte, plantilla })
    const reg: Registro[] = []
    if (notas) M.P.notas = { leer: async () => notas, registrar: async (r) => { reg.push(r) } }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: plantilla.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.status).toBe(200)
    return { M, id: String(a.cuerpo.encargo_id), reg }
  }
  it('carrusel sin notas: los mismos pasos de siempre', async () => {
    const { M, id } = await carrusel()
    const r = await correr(M, id, guion())
    expect(r.pasos).toEqual(['paquete', 'direccion_visual', 'texto', 'laminas', 'revision_jefe'])
  })
  it('carrusel con notas: el que escribe y el diseñador de láminas se auto-revisan, y la corrección pasa el contrato de las láminas', async () => {
    const { M, id, reg } = await carrusel(NOTAS)
    const corregidas = LAMINAS.map((l, i) => (i === 1 ? { ...l, body: 'Prueba el plato del día' } : l))
    const r = await correr(M, id, guion({ autorevision_diseno: () => ({ texto: conChoque({ laminas: corregidas }, 'laminas', 'nota-2') }) }), 80)
    expect(r.pasos).toEqual(['paquete', 'direccion_visual', 'texto', 'autorevision_texto', 'laminas', 'autorevision_diseno', 'revision_jefe'])
    expect(r.pedidos['autorevision_diseno'][0]).toMatchObject({ agent_name: 'carousel-designer', esquema: 'autorevision.v1' })
    expect(r.tareas['autorevision_texto'][0]).toContain('nota-1')
    for (const [paso, ts] of Object.entries(r.tareas)) if (!paso.startsWith('autorevision')) for (const t of ts) expect(t).not.toContain('No uses la palabra ceviche')
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(reg.find((x) => x.paso === 'autorevision_diseno')).toMatchObject({ choco: true, agente: 'carousel-designer' })
  })
  it('carrusel: una lámina corregida con texto que no está en el copy (inventado) se descarta y la original sigue', async () => {
    const { M, id, reg } = await carrusel(NOTAS)
    const inventada = LAMINAS.map((l, i) => (i === 1 ? { ...l, headline: 'Hoy cambia tu almuerzo' } : l))
    const r = await correr(M, id, guion({ autorevision_diseno: () => ({ texto: conChoque({ laminas: inventada }, 'laminas', 'nota-2') }) }), 80)
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(arte(M, id, 'laminas').laminas[1].headline).toBe('Hoy cambia el plato del día')
    // el reintento lleva el mensaje ESPECÍFICO del validador (no uno genérico)
    expect(r.tareas['autorevision_diseno'][1]).toContain('no cumple lo que la sala comprueba por código')
    expect(reg.find((x) => x.paso === 'autorevision_diseno')).toMatchObject({ choco: false })
  })
  it('carrusel: una lámina corregida que rompe el contrato (headline de 200 caracteres) se descarta y la original sigue', async () => {
    const { M, id, reg } = await carrusel(NOTAS)
    const rotas = LAMINAS.map((l, i) => (i === 0 ? { ...l, headline: 'x'.repeat(200) } : l))
    const r = await correr(M, id, guion({ autorevision_diseno: () => ({ texto: conChoque({ laminas: rotas }, 'laminas', 'nota-2') }) }), 80)
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(arte(M, id, 'laminas').laminas[0].headline).toBe('Cada mañana empieza igual')
    expect(reg.find((x) => x.paso === 'autorevision_diseno')).toMatchObject({ choco: false })
  })
})
