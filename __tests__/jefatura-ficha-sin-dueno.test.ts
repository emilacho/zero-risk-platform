/**
 * J6 cuarto · fichas bloqueantes SIN DUEÑO (J6 ter, revisión 962842d3). El jefe escribió `donde` libre («texto — etiquetas») y `atiende()` comparaba EXACTO con «texto»:
 * la ficha bloqueante quedó sin dueño y sin corrección, en silencio. Ahora: (a) el `donde` se normaliza por prefijo, (b) una bloqueante sin dueño NUNCA pasa en silencio
 * (marca `ficha_sin_dueno` + línea en el aviso), (c) el pedido trae un ejemplo válido de `donde`. Mismo patrón revisado: el `id` que devuelve el modelo.
 * Entradas: las 9 fichas REALES de las revisiones de J6 ter (`fixtures/jefatura-j6ter`).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { correr, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { atiende, casarId, duenosDe, normalizarDonde } from '../src/lib/jefatura/revision/politicas'
import { fichasSinDueno, resolverCierre, textoDelAviso } from '../src/lib/jefatura/revision/cierre'
import { estadoInicial, fichaNueva } from '../src/lib/revision-comun'

type FichaReal = { ficha_id: string; origen: string; donde: string; gravedad: 'bloquea' | 'sugerencia'; que: string; contra_que: string | null; propuesta: string | null }
const REAL = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/jefatura-j6ter/fichas-reales.json'), 'utf8')) as Record<string, FichaReal[]>
const DE_SERVICIOS = REAL['962842d3-31fb-419e-a73c-923c4d263bb6'].filter((f) => f.origen === 'jefe')
const DE_RESTAURANTE = REAL['21b3b404-b149-4ca1-abae-756346076d2d'].filter((f) => f.origen === 'jefe')

const DUENOS = duenosDe([{ donde: 'texto', agente: 'content-creator' }, { donde: 'imagen', agente: 'marketing_instagram_curator' }])
const pasosDe = (c: Awaited<ReturnType<typeof correr>>) => c.turnos.map((t) => t.paso)
const sal = (c: Awaited<ReturnType<typeof correr>>) => c.final.cuerpo.salida as Record<string, any>

describe('(a) normalizarDonde · las fichas REALES de J6 ter', () => {
  it('el defecto: con comparación exacta NINGUNA ficha «texto — …» tenía dueño', () => {
    const libres = [...DE_SERVICIOS, ...DE_RESTAURANTE].filter((f) => f.donde !== 'texto')
    expect(libres.length).toBeGreaterThanOrEqual(6)
    for (const f of libres) expect(DUENOS.some((d) => atiende(d, f.donde))).toBe(false)
  })
  it('después: todas las del jefe (9) caen en «texto» y conservan el original', () => {
    for (const f of [...DE_SERVICIOS, ...DE_RESTAURANTE]) {
      const n = normalizarDonde(f.donde, DUENOS)
      expect(n.donde, f.donde).toBe('texto')
      expect(n.ambiguo).toBe(false)
      expect(n.original === null ? f.donde === 'texto' : n.original === f.donde).toBe(true)
    }
  })
  it.each([
    ['texto — etiquetas', 'texto'], ['Texto - primera línea', 'texto'], ['TEXTO: el cierre', 'texto'], ['texto, segunda línea', 'texto'], ['texto (hashtags)', 'texto'],
    ['Imagen — composición', 'imagen'], ['imagen: el encuadre', 'imagen'], ['texto primera línea', 'texto'], ['  Texto  ', 'texto'],
  ])('«%s» → «%s»', (entrada, esperado) => { expect(normalizarDonde(entrada, DUENOS).donde).toBe(esperado) })
  it.each([['texto e imagen'], ['la imagen y el texto'], ['general'], ['etiquetas'], ['']])('no se adivina: «%s»', (entrada) => {
    const n = normalizarDonde(entrada, DUENOS)
    expect(n.donde).toBe(entrada)
    expect(n.original).toBeNull()
  })
  it('lo que nombra dos dondes conocidos se declara AMBIGUO', () => {
    expect(normalizarDonde('texto e imagen', DUENOS).ambiguo).toBe(true)
    expect(normalizarDonde('la imagen y el texto', DUENOS).ambiguo).toBe(true)
    expect(normalizarDonde('general', DUENOS).ambiguo).toBe(false)
    // el PREFIJO antes del separador manda: lo que sigue es el detalle
    expect(normalizarDonde('texto — y la imagen', DUENOS)).toMatchObject({ donde: 'texto', ambiguo: false })
  })
  it('con un dueño comodín no hace falta tocar nada', () => {
    const plan = duenosDe([{ donde: '*', agente: 'strategy-planner' }])
    expect(normalizarDonde('sección 3 — objetivos', plan)).toEqual({ donde: 'sección 3 — objetivos', original: null, ambiguo: false })
  })
})

describe('(a) de punta a punta con la máquina real (US$ 0, simulada)', () => {
  const noTomar = (t: { pedido: Record<string, unknown> }) => ({ texto: JSON.stringify({ respuestas: [...String(t.pedido.task).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => ({ id: m[1], estado: 'no_tomada', razon: 'no aplica' })) }), costo_usd: 0.04 })
  const jefe = (fichas: unknown[]) => (t: { paso: string; pedido: Record<string, unknown> }) => (t.paso === 'revision_fondo' ? { texto: JSON.stringify({ fichas }) } : t.paso.startsWith('decision:') ? noTomar(t) : undefined)
  const tomarTodo = (t: { pedido: Record<string, unknown> }) => ({ texto: JSON.stringify({ respuestas: [...String(t.pedido.task).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => ({ id: m[1], estado: 'tomada', razon: 'ok' })), pieza: { pie_de_foto: 'PIE', hashtags: ['#a', '#b', '#c'] } }), costo_usd: 0.05 })

  it('la ficha REAL «texto — etiquetas» (bloquea) ahora SÍ abre la corrección del dueño del texto', async () => {
    const real = DE_SERVICIOS.find((f) => f.donde === 'texto — etiquetas')!
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), (t) => {
      if (t.paso === 'revision_fondo') return { texto: JSON.stringify({ fichas: [{ que: real.que, donde: real.donde, contra_que: real.contra_que ?? 'manual', gravedad: 'bloquea', propuesta: real.propuesta ?? 'agregar' }] }) }
      if (t.paso.startsWith('correccion:') || t.paso.startsWith('decision:')) return tomarTodo(t)
      return undefined
    })
    expect(pasosDe(c)).toContain('correccion:content-creator')
    expect(sal(c).marcas.ficha_sin_dueno).toBeUndefined()
    expect(sal(c).resultado).not.toBe('con_desacuerdo')
  })
  it('el texto original del jefe queda en la ficha que ve el dueño', async () => {
    const { P } = puertosDePrueba()
    let visto = ''
    await correr(P, sobre('pieza', { dry_run: false }), (t) => {
      if (t.paso === 'revision_fondo') return { texto: JSON.stringify({ fichas: [{ que: 'son 2 etiquetas', donde: 'texto — etiquetas', contra_que: 'manual', gravedad: 'bloquea', propuesta: 'agregar una' }] }) }
      if (t.paso === 'correccion:content-creator') { visto = String(t.pedido.task); return tomarTodo(t) }
      if (t.paso.startsWith('decision:')) return tomarTodo(t)
      return undefined
    })
    expect(visto).toContain('(bloquea) en texto:')
    expect(visto).toContain('[el jefe la situó en «texto — etiquetas»]')
  })
  it('«Imagen — composición» se normaliza a «imagen» y va al dueño de la imagen', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), (t) => {
      if (t.paso === 'revision_fondo') return { texto: JSON.stringify({ fichas: [{ que: 'el encuadre corta el plato', donde: 'Imagen — composición', contra_que: 'brief', gravedad: 'bloquea', propuesta: 'recuadrar' }] }) }
      if (t.paso.startsWith('correccion:') || t.paso.startsWith('decision:')) return tomarTodo(t)
      return undefined
    })
    expect(pasosDe(c)).toContain('correccion:marketing_instagram_curator')
    expect(pasosDe(c)).not.toContain('correccion:content-creator')
  })

  it('(b) una bloqueante que NO se puede normalizar no pasa en silencio: con_desacuerdo + marca + línea en el aviso', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), jefe([{ que: 'el tono no es el del manual', donde: 'tono general', contra_que: 'manual', gravedad: 'bloquea', propuesta: 'ajustar' }]))
    expect(pasosDe(c).some((p) => p.startsWith('correccion:'))).toBe(false)
    expect(sal(c).resultado).toBe('con_desacuerdo')
    expect(sal(c).marcas).toMatchObject({ con_desacuerdo: true, ficha_sin_dueno: true })
    expect(String(sal(c).desacuerdos[0])).toContain('sin dueño: ningún empleado atiende «tono general»')
    expect(rastro.avisos).toHaveLength(1)
    expect(rastro.avisos[0]).toContain('ficha sin dueño')
    expect(rastro.avisos[0]).toContain('tono general')
  })
  it('(b) lo ambiguo («texto e imagen») también se declara con la marca', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), jefe([{ que: 'x', donde: 'texto e imagen', contra_que: 'manual', gravedad: 'bloquea', propuesta: 'y' }]))
    expect(sal(c).marcas.ficha_sin_dueno).toBe(true)
  })
  it('la forma de siempre NO cambia cuando no hay ficha sin dueño (la marca nueva no aparece)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), jefe([{ que: 'x', donde: 'texto', contra_que: 'manual', gravedad: 'sugerencia', propuesta: 'y' }]))
    expect(Object.keys(sal(c).marcas).sort()).toEqual(['con_desacuerdo', 'sin_segunda_mirada'])
  })
})

describe('(b) cierre · piezas puras', () => {
  const abierta = (donde: string) => fichaNueva('jefe-0-0', 'jefe', donde, 'bloquea', 'q', 'c', 'p')
  it('fichasSinDueno: solo abierta + bloquea + nadie la atiende', () => {
    expect(fichasSinDueno([abierta('texto — x')], DUENOS)).toHaveLength(1)
    expect(fichasSinDueno([abierta('texto')], DUENOS)).toHaveLength(0)
    expect(fichasSinDueno([{ ...abierta('texto — x'), estado: 'no_tomada' }], DUENOS)).toHaveLength(0)
    expect(fichasSinDueno([{ ...abierta('x'), gravedad: 'sugerencia' }], DUENOS)).toHaveLength(0)
  })
  it('un dueño comodín atiende todo: no hay ficha sin dueño', () => {
    expect(fichasSinDueno([abierta('lo que sea')], duenosDe([{ donde: '*', agente: 'planner' }]))).toHaveLength(0)
  })
  it('resolverCierre sin `duenos` se comporta como antes (compatibilidad)', () => {
    const e = { ...estadoInicial(), fichas: [abierta('texto — x')] }
    const c = resolverCierre(e, { tope: false, fallida: false })
    expect(c.marcas).toEqual({ con_desacuerdo: true, sin_segunda_mirada: false })
    expect(c.desacuerdos[0]).toContain('(sin dueño o sin camino de corrección)')
  })
  it('con `duenos` marca y rotula; el aviso lo dice', () => {
    const e = { ...estadoInicial(), fichas: [abierta('texto — x')] }
    const c = resolverCierre(e, { tope: false, fallida: false, duenos: DUENOS })
    expect(c.marcas.ficha_sin_dueno).toBe(true)
    expect(textoDelAviso(c, { tipo: 'pieza', artifact_id: 'a1', gasto_usd: 0.2, simulado: false })).toMatch(/ficha sin dueño/)
  })
})

describe('mismo patrón · el id que devuelve el modelo se casa por forma, no por texto exacto', () => {
  const IDS = ['ext-2-texto', 'jefe-0-1']
  it.each([['[ext-2-texto]'], ['`ext-2-texto`'], ['EXT-2-TEXTO'], ['ext-2-texto.'], [' «ext-2-texto» '], ['"ext-2-texto"']])('«%s» ⇒ ext-2-texto', (x) => { expect(casarId(x, IDS)).toBe('ext-2-texto') })
  it('lo que no coincide con uno solo no se adivina', () => {
    expect(casarId('ext-2', IDS)).toBeNull()
    expect(casarId('jefe-0-9', IDS)).toBeNull()
    expect(casarId('x', ['ID-1', 'id-1'])).toBeNull()
  })
  it('en la máquina: una decisión con el id entre corchetes cuenta como respondida (no «el empleado no respondió»)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), (t) => {
      if (t.paso.startsWith('decision:')) {
        const ids = [...String(t.pedido.task).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => `[${m[1].toUpperCase()}]`)
        return { texto: JSON.stringify({ respuestas: ids.map((id) => ({ id, estado: 'no_tomada', razon: 'no aplica' })) }), costo_usd: 0.04 }
      }
      return undefined
    })
    const resp = sal(c).respuestas as Array<{ razon: string | null }>
    expect(resp.some((r) => r.razon === 'el empleado no respondió este hallazgo')).toBe(false)
  })
})

describe('(c) el pedido de fichas trae un ejemplo válido de «donde»', () => {
  it('pide SOLO la palabra, manda el detalle a «que» y muestra el JSON', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza'), (t) => (t.paso === 'revision_fondo' ? { texto: '{"fichas":[]}' } : undefined))
    const pedido = String(c.turnos.find((t) => t.paso === 'revision_fondo')!.pedido.task)
    expect(pedido).toContain('pon SOLO una de estas palabras, tal cual')
    expect(pedido).toContain('El detalle (qué línea, qué etiqueta) va en «que», nunca en «donde»')
    expect(pedido).toMatch(/Ejemplo válido: \{"que":"[^"]+","donde":"(texto|imagen)"/)
  })
})
