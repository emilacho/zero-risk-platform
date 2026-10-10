import { describe, expect, it } from 'vitest'
import { estadoInicial, evaluar, registrarPaso, validarPlantilla } from '../index'
import type { Ficha, Plantilla } from '../index'
import { esCarrusel, esKitDeHistorias, elementosDelKit, parsearBrief } from '../brief'
import {
  armarLaminasDeCarrusel, armarLaminasDeKit, chequeosDeLaminas, cifrasFueraDeFuentes, problemasDeContrato, problemasDeHistoria, problemasDeKit, refsInvalidos, textoFueraDelAutor,
  type ContextoDeChequeoLaminas,
} from '../laminas'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { POST_IMG } from '../plantillas/post-img'
import { procesarSalida } from '../salida'
import { simular } from './simular'

const f = (o: Partial<Ficha>): Ficha => ({ id: 'a', origen: 'jefe', donde: 'texto', gravedad: 'bloquea', estado: 'abierta', ...o })
const gen = { direccion_visual: { costo_usd: 0, artefacto: { hay_generadas: true, requiere_mirar: true } }, chequear_prompts: { costo_usd: 0, artefacto: { ninguno: false } } }
const noRegen = { mirar: { costo_usd: 0, artefacto: { veredicto: { regenerar: false } } } }

describe('las plantillas de las salas 2 y 3 son válidas contra el vocabulario cerrado', () => {
  for (const [nombre, p] of [['carrusel_ig_v1', CARRUSEL_IG_V1], ['kit_historias', KIT_HISTORIAS]] as const) {
    it(`${nombre}: validarPlantilla no da errores`, () => { expect(validarPlantilla(p)).toEqual([]) })
    it(`${nombre}: el margen cubre 3 reintentos + las vueltas (1 + 2)`, () => { expect(p.limites.margen).toBeGreaterThanOrEqual(6) })
    it(`${nombre}: toda regla de indicación tiene aplicador y ninguna nombra a un cliente`, () => {
      for (const reglas of Object.values(p.indicaciones)) for (const r of reglas) expect(r.aplica).toMatch(/^(codigo:[a-z_]+|jefe|gpt|guia)$/)
      const todo = JSON.stringify(p).toLowerCase()
      for (const x of ['naufrago', 'náufrago', 'guayaquil', 'ceviche', 'ecuador', 'rukut', 'perez', 'pérez']) expect(todo).not.toContain(x)
    })
    it(`${nombre}: ningún paso es de tipo brazo (el brazo se llama por una función de código, no por un tipo nuevo)`, () => { expect(p.pasos.filter((x) => x.tipo === 'brazo')).toEqual([]) })
    it(`${nombre}: no tiene brazo de publicación`, () => { expect(JSON.stringify(p)).not.toMatch(/publicar_en|\/api\/social|meta-social|publish/i) })
  }
  it('no cambia el vocabulario: los tipos de condición y de paso son los de la sala 1', () => {
    const tipos = (p: Plantilla) => new Set(p.pasos.flatMap((s) => [s.condicion.tipo, ...(s.vuelve_a ? [s.vuelve_a.si.tipo] : [])]))
    for (const p of [CARRUSEL_IG_V1, KIT_HISTORIAS]) for (const t of tipos(p)) expect(['siempre', 'si_artefacto', 'si_fichas_abiertas', 'si_cambio', 'cualquiera']).toContain(t)
  })
  it('una plantilla que inventa una función, un esquema o un validador sigue rechazada', () => {
    const c = JSON.parse(JSON.stringify(CARRUSEL_IG_V1)) as Plantilla
    c.pasos[0].funcion = 'publicar_en_instagram'; c.pasos[3].salida = { esquema: 'inventado.v1', reintento_formato: 1 }; c.pasos[3].valida = ['confiar']
    const e = validarPlantilla(c).join('|')
    expect(e).toMatch(/publicar_en_instagram/); expect(e).toMatch(/inventado\.v1/); expect(e).toMatch(/confiar/)
  })
  it('un paso de código con tope solo si gasta imagen', () => {
    const c = JSON.parse(JSON.stringify(CARRUSEL_IG_V1)) as Plantilla
    c.pasos.find((s) => s.clave === 'armar')!.tope_usd = 1
    expect(validarPlantilla(c).join('|')).toMatch(/no tiene modelo/)
  })
})

describe('condiciones con lista (`donde` y `si_cambio`)', () => {
  const e0 = estadoInicial()
  it('si_fichas_abiertas con lista de «donde»', () => {
    const e = { ...e0, fichas: [f({ donde: 'hashtags' })] }
    expect(evaluar({ tipo: 'si_fichas_abiertas', origen: 'jefe', donde: ['texto', 'hashtags'] }, e)).toBe(true)
    expect(evaluar({ tipo: 'si_fichas_abiertas', origen: 'jefe', donde: ['laminas', 'imagen'] }, e)).toBe(false)
    expect(evaluar({ tipo: 'si_fichas_abiertas', origen: 'jefe', donde: 'hashtags' }, e)).toBe(true)
  })
  it('si_cambio con lista: basta que cambie UNO', () => {
    const e = { ...e0, artefactos: { a: { version: 1, version_consumida: 1, datos: {} }, b: { version: 2, version_consumida: 1, datos: {} } } }
    expect(evaluar({ tipo: 'si_cambio', artefacto: ['a', 'b'] }, e)).toBe(true)
    expect(evaluar({ tipo: 'si_cambio', artefacto: ['a'] }, e)).toBe(false)
    expect(evaluar({ tipo: 'si_cambio', artefacto: 'b' }, e)).toBe(true)
  })
  it('la plantilla de la sala 1 sigue igual (no usa listas)', () => { expect(JSON.stringify(POST_IMG)).not.toMatch(/"donde":\[/) })
})

describe('el motor recorre el carrusel sin conocerlo', () => {
  it('sin imágenes generadas: se salta prompts, chequeo, imagen y mirar', () => {
    const { claves, final } = simular(CARRUSEL_IG_V1, {})
    expect(claves).toEqual(['abrir', 'paquete', 'asignar_fotos', 'direccion_visual', 'elegir_version', 'texto', 'laminas', 'armar', 'render', 'chequeos', 'revision_jefe', 'revisor_externo', 'entrega', 'cierre'])
    expect(final.accion).toBe('fin')
  })
  it('con imágenes generadas: prompts → chequeo → imagen → mirar → elegir', () => {
    const { claves } = simular(CARRUSEL_IG_V1, { ...gen, ...noRegen })
    expect(claves.slice(3, 10)).toEqual(['direccion_visual', 'prompts', 'chequear_prompts', 'imagen', 'mirar', 'elegir_version', 'texto'])
  })
  it('regenerar ≤ 2 veces: la imagen sale 3 veces como máximo y el motor sigue de largo', () => {
    const { claves, final } = simular(CARRUSEL_IG_V1, { ...gen, mirar: { costo_usd: 0, artefacto: { veredicto: { regenerar: true } } } })
    expect(claves.filter((c) => c === 'imagen')).toHaveLength(3)
    expect(final.accion).toBe('fin')
  })
  it('si ningún prompt pasa, el ingeniero repite UNA vez', () => {
    const { claves } = simular(CARRUSEL_IG_V1, { ...gen, chequear_prompts: { costo_usd: 0, artefacto: { ninguno: true } }, ...noRegen })
    expect(claves.filter((c) => c === 'prompts')).toHaveLength(2)
  })
  it('un hallazgo del jefe sobre el TEXTO: corrige el autor, el diseñador recorta de nuevo y se vuelve a armar, dibujar y chequear', () => {
    const { claves } = simular(CARRUSEL_IG_V1, {
      revision_jefe: { costo_usd: 0, artefacto: {}, fichas: [f({ id: 't1', donde: 'texto' })] },
      corrige_texto: { costo_usd: 0, artefacto: { texto_base: 'x' }, resoluciones: [{ id: 't1', estado: 'tomada', razon: 'ok' }] },
    })
    expect(claves.slice(claves.indexOf('revision_jefe'), claves.indexOf('revisor_externo'))).toEqual(['revision_jefe', 'corrige_texto', 'ajusta_laminas', 'armar_2', 'render_2', 'chequeos_2'])
  })
  it('un hallazgo del jefe SOLO de láminas: corrige el diseñador, sin tocar al autor', () => {
    const { claves } = simular(CARRUSEL_IG_V1, {
      revision_jefe: { costo_usd: 0, artefacto: {}, fichas: [f({ id: 'l1', donde: 'laminas' })] },
      corrige_laminas: { costo_usd: 0, artefacto: { laminas: [] }, resoluciones: [{ id: 'l1', estado: 'tomada', razon: 'ok' }] },
    })
    expect(claves).toContain('corrige_laminas'); expect(claves).not.toContain('corrige_texto'); expect(claves).not.toContain('ajusta_laminas')
    expect(claves).toContain('armar_2')
  })
  it('un hallazgo sobre la IMAGEN no abre ninguna corrección (solo «mirar» rehace la imagen)', () => {
    const { claves } = simular(CARRUSEL_IG_V1, { revision_jefe: { costo_usd: 0, artefacto: {}, fichas: [f({ donde: 'imagen' })] } })
    expect(claves.some((c) => c.startsWith('corrige') || c.startsWith('ajusta'))).toBe(false)
  })
  it('una sugerencia del jefe no abre corrección; una ficha externa sí (ronda 2) y se vuelve a dibujar', () => {
    const sug = simular(CARRUSEL_IG_V1, { revision_jefe: { costo_usd: 0, artefacto: {}, fichas: [f({ gravedad: 'sugerencia' })] } })
    expect(sug.claves.some((c) => c.startsWith('corrige'))).toBe(false)
    const ext = simular(CARRUSEL_IG_V1, {
      revisor_externo: { costo_usd: 0, artefacto: {}, fichas: [f({ id: 'x1', origen: 'externa', donde: 'texto', gravedad: 'sugerencia' })] },
      decide_texto: { costo_usd: 0, artefacto: { texto_base: 'y' }, resoluciones: [{ id: 'x1', estado: 'tomada', razon: 'ok' }] },
    })
    expect(ext.claves.slice(ext.claves.indexOf('revisor_externo'), ext.claves.indexOf('entrega'))).toEqual(['revisor_externo', 'decide_texto', 'ajusta_laminas_2', 'armar_3', 'render_3', 'chequeos_3'])
  })
  it('no hay una tercera ronda: aunque queden fichas abiertas, termina', () => {
    const { final, claves } = simular(CARRUSEL_IG_V1, { revisor_externo: { costo_usd: 0, artefacto: {}, fichas: [f({ id: 'q', origen: 'externa', donde: 'texto' })] }, decide_texto: { costo_usd: 0, artefacto: { texto_base: 'z' }, resoluciones: [{ id: 'q', estado: 'no_tomada', razon: 'no' }] } })
    expect(final.accion).toBe('fin'); expect(claves.filter((c) => c === 'revisor_externo')).toHaveLength(1)
  })
})

describe('el motor recorre el kit de historias sin conocerlo', () => {
  it('sin generadas: narrativa antes del texto, y el diseño/entrega al final', () => {
    const { claves, final } = simular(KIT_HISTORIAS, {})
    expect(claves).toEqual(['abrir', 'paquete', 'asignar_fotos', 'direccion_visual', 'narrativa', 'elegir_version', 'texto', 'armar', 'render', 'chequeos', 'revision_jefe', 'revisor_externo', 'entrega', 'cierre'])
    expect(final.accion).toBe('fin')
  })
  it('un hallazgo de ESTRUCTURA lo atiende el narrador y el kit se vuelve a armar', () => {
    const { claves } = simular(KIT_HISTORIAS, {
      revision_jefe: { costo_usd: 0, artefacto: {}, fichas: [f({ id: 's1', donde: 'estructura' })] },
      corrige_estructura: { costo_usd: 0, artefacto: { elementos: [] }, resoluciones: [{ id: 's1', estado: 'tomada', razon: 'ok' }] },
    })
    expect(claves.slice(claves.indexOf('revision_jefe'), claves.indexOf('revisor_externo'))).toEqual(['revision_jefe', 'corrige_estructura', 'armar_2', 'render_2', 'chequeos_2'])
  })
  it('un hallazgo de TEXTO lo atiende el autor y el kit se vuelve a armar (el texto va directo a la lámina: no hay re-recorte)', () => {
    const { claves } = simular(KIT_HISTORIAS, {
      revision_jefe: { costo_usd: 0, artefacto: {}, fichas: [f({ id: 'k', donde: 'texto' })] },
      corrige_texto: { costo_usd: 0, artefacto: { elementos: [] }, resoluciones: [{ id: 'k', estado: 'tomada', razon: 'ok' }] },
    })
    expect(claves).toContain('corrige_texto'); expect(claves).toContain('armar_2'); expect(claves).not.toContain('ajusta_laminas')
  })
  it('con generadas: regenerar ≤ 2 y la sala sigue de largo', () => {
    const { claves, final } = simular(KIT_HISTORIAS, { ...gen, mirar: { costo_usd: 0, artefacto: { veredicto: { regenerar: true } } } })
    expect(claves.filter((c) => c === 'imagen')).toHaveLength(3); expect(final.accion).toBe('fin')
  })
})

describe('registrarPaso con los artefactos de las salas 2 y 3', () => {
  it('el re-recorte se dispara solo cuando el autor cambia el texto (el artefacto sube de versión)', () => {
    let e = estadoInicial()
    const i = CARRUSEL_IG_V1.pasos.findIndex((s) => s.clave === 'texto')
    e = registrarPaso(e, CARRUSEL_IG_V1, i, { costo_usd: 0, artefacto: { texto_base: 'a' } })
    expect(e.artefactos.copy_carrusel.version).toBe(1)
    e = registrarPaso(e, CARRUSEL_IG_V1, CARRUSEL_IG_V1.pasos.findIndex((s) => s.clave === 'armar'), { costo_usd: 0, artefacto: {} })
    expect(evaluar({ tipo: 'si_cambio', artefacto: 'copy_carrusel' }, e)).toBe(false)
  })
})

// ───────────────────────── formato de salida (control ①)
describe('los esquemas de salida de las salas 2 y 3 los hace cumplir el código', () => {
  const lam = (o: object = {}) => ({ rol: 'hook', headline: 'Titular corto', ...o })
  it('laminas.v1 acepta una salida válida, aunque venga con cerca ```json y prosa', () => {
    const r = procesarSalida('Aquí va:\n```json\n' + JSON.stringify({ laminas: [lam(), lam({ rol: 'cta', headline: 'Pide ya', cta: 'Pídelo' })] }) + '\n```\nListo.', 'laminas.v1', 0, 1)
    expect(r.ok).toBe(true)
  })
  it('laminas.v1 IGNORA plataforma, tamaño y preguntas abiertas (los pone la sala) y los anota', () => {
    const r = procesarSalida(JSON.stringify({ platform: 'tiktok', platforms_requested: ['a', 'b'], open_questions: ['¿qué color?'], laminas: [lam({ size: '1x1' })] }), 'laminas.v1', 0, 1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.valor)).toEqual(['laminas'])
      expect(r.descartados.join('|')).toMatch(/platform/); expect(r.descartados.join('|')).toMatch(/open_questions/); expect(r.descartados.join('|')).toMatch(/size/)
    }
  })
  it('laminas.v1: un titular de 91 caracteres, un rol inventado o un campo extra → reintento 1 vez; y luego falla visible', () => {
    for (const mal of [lam({ headline: 'x'.repeat(91) }), lam({ rol: 'gancho' }), lam({ video: 'a.mp4' })]) {
      const t = JSON.stringify({ laminas: [mal] })
      expect(procesarSalida(t, 'laminas.v1', 0, 1)).toMatchObject({ ok: false, accion: 'reintentar' })
      expect(procesarSalida(t, 'laminas.v1', 1, 1)).toMatchObject({ ok: false, accion: 'falla_visible' })
    }
  })
  it('estructura.v1 NO admite ningún texto de imagen (el narrador solo pone estructura)', () => {
    const buena = { elementos: [{ ref: 'e01', rol: 'apertura', beat: 'presentar', mood: 'cálido', foto_slot: 'e01' }] }
    expect(procesarSalida(JSON.stringify(buena), 'estructura.v1', 0, 1).ok).toBe(true)
    for (const extra of [{ headline: 'Hola' }, { texto: 'Compra ya' }, { cta: 'Pide' }, { video: 'x' }]) {
      const mala = { elementos: [{ ...buena.elementos[0], ...extra }] }
      expect(procesarSalida(JSON.stringify(mala), 'estructura.v1', 1, 1)).toMatchObject({ ok: false, accion: 'falla_visible' })
    }
  })
  it('copy_kit.v1 y la resolución del kit exigen el ref de cada elemento', () => {
    expect(procesarSalida(JSON.stringify({ elementos: [{ headline: 'Hola' }] }), 'copy_kit.v1', 1, 1)).toMatchObject({ ok: false })
    expect(procesarSalida(JSON.stringify({ elementos: [{ ref: 'e01', headline: 'Hola', acompanamiento: 'Texto' }] }), 'copy_kit.v1', 0, 1).ok).toBe(true)
  })
  it('prompts_por_ref.v1: de 2 a 3 prompts por imagen, y el tamaño que escriba el agente se descarta', () => {
    const p = (n: number) => ({ imagenes: [{ ref: 'hook', prompts: Array.from({ length: n }, () => ({ prompt: 'Un plato servido sobre una mesa de madera clara, luz natural lateral', idea_en_una_linea: 'plato', size: '1x1' })) }] })
    expect(procesarSalida(JSON.stringify(p(1)), 'prompts_por_ref.v1', 1, 1)).toMatchObject({ ok: false })
    const ok = procesarSalida(JSON.stringify(p(3)), 'prompts_por_ref.v1', 0, 1)
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.descartados.length).toBe(3)
  })
  it('direccion_imagenes.v1: cada imagen trae su ref, su modo y su motivo', () => {
    const base = { resumen: 'x', reglas_de_imagen: { obligatorio: [], prohibido: [] } }
    expect(procesarSalida(JSON.stringify({ ...base, imagenes: [{ ref: 'hook', modo: 'generada', motivo: 'no hay foto' }] }), 'direccion_imagenes.v1', 0, 1).ok).toBe(true)
    expect(procesarSalida(JSON.stringify({ ...base, imagenes: [{ ref: 'hook', modo: 'inventada', motivo: 'x' }] }), 'direccion_imagenes.v1', 1, 1)).toMatchObject({ ok: false })
  })
})

// ───────────────────────── lo puro de las láminas
describe('el texto de las láminas es del autor', () => {
  const copia = { texto_base: 'Cada mañana empieza igual.\nPero hoy cambia: pruébalo gratis.\nPídelo por mensaje', pie_de_foto: 'Un plato que se pide solo.', llamado: 'Escríbenos' }
  it('un recorte literal pasa (sin importar mayúsculas, tildes ni puntuación)', () => {
    expect(textoFueraDelAutor([{ rol: 'hook', headline: 'Cada mañana empieza igual', body: 'pero HOY cambia', cta: 'escribenos' }], copia)).toEqual([])
  })
  it('una paráfrasis o un texto nuevo NO pasa', () => {
    const r = textoFueraDelAutor([{ rol: 'hook', headline: 'Cada día es igual' }, { rol: 'cta', headline: 'Pídelo por mensaje', cta: 'Compra ya' }], copia)
    expect(r.map((x) => `${x.lamina}:${x.campo}`)).toEqual(['1:headline', '2:cta'])
  })
  it('un trozo que cruza dos frases del autor y las une con otras palabras NO pasa', () => {
    expect(textoFueraDelAutor([{ rol: 'hook', headline: 'Cada mañana pruébalo gratis' }], copia)).toHaveLength(1)
  })
  it('un campo vacío no cuenta', () => { expect(textoFueraDelAutor([{ rol: 'hook', headline: 'Pídelo por mensaje', body: '  ' }], copia)).toEqual([]) })
})

describe('contrato de lámina', () => {
  const ok = Array.from({ length: 5 }, (_, i) => ({ rol: ['hook', 'problem', 'reframe', 'benefit', 'cta'][i], headline: `H${i}` }))
  const cant = { laminas_min: 5, laminas_max: 10 }
  it('5 láminas con roles conocidos y un solo llamado: cumple', () => { expect(problemasDeContrato(ok.map((l, i) => (i === 4 ? { ...l, cta: 'Pide' } : l)), cant)).toEqual([]) })
  it('cuenta fuera de rango, tope de caracteres, rol desconocido y dos llamados', () => {
    expect(problemasDeContrato(ok.slice(0, 3), cant).join('|')).toMatch(/3 láminas/)
    expect(problemasDeContrato([{ ...ok[0], headline: 'x'.repeat(91) }, ...ok.slice(1)], cant).join('|')).toMatch(/91 caracteres/)
    expect(problemasDeContrato([{ ...ok[0], rol: 'gancho' }, ...ok.slice(1)], cant).join('|')).toMatch(/desconocido/)
    expect(problemasDeContrato(ok.map((l) => ({ ...l, cta: 'Pide' })), cant).join('|')).toMatch(/solo una/)
  })
  it('historia: titular y texto dentro de los topes del dato', () => {
    expect(problemasDeHistoria([{ ref: 'e01', headline: 'x'.repeat(61), body: 'y'.repeat(141) }], { headline_historia: 60, body_historia: 140 })).toHaveLength(2)
    expect(problemasDeHistoria([{ ref: 'e01', headline: 'ok' }], { headline_historia: 60, body_historia: 140 })).toEqual([])
  })
  it('refs inválidos', () => { expect(refsInvalidos(['hook', 'raro', 'raro'], ['hook', 'cta'])).toEqual(['raro']) })
})

describe('armar lo que se dibuja', () => {
  const img = (u: string) => ({ origen: 'generada' as const, url: u })
  it('carrusel: la imagen de un rol va en la PRIMERA lámina con ese rol; un rol sin lámina se declara', () => {
    const r = armarLaminasDeCarrusel([{ rol: 'hook', headline: 'A' }, { rol: 'hook', headline: 'B' }, { rol: 'cta', headline: 'C', cta: 'Pide' }], { hook: img('https://x/h.png'), proof: img('https://x/p.png') })
    expect(r.slides.map((s) => s.background_image_url)).toEqual(['https://x/h.png', null, null])
    expect(r.sinLamina).toEqual(['proof'])
    expect(r.slides[2].cta).toBe('Pide')
  })
  it('carrusel: una lámina sin imagen lleva null, nunca undefined ni una dirección inventada', () => {
    expect(armarLaminasDeCarrusel([{ rol: 'hook', headline: 'A' }], {}).slides[0]).toEqual({ headline: 'A', background_image_url: null, pie: null })
  })
  it('carrusel: el pie es «desliza» (SIN flecha: la tipografía no la trae y saldría un cuadrito ▯) en todas menos la última, que no lleva pie', () => {
    const { slides } = armarLaminasDeCarrusel([{ rol: 'hook', headline: 'A' }, { rol: 'proof', headline: 'B' }, { rol: 'cta', headline: 'C' }], {})
    expect(slides.map((x) => x.pie)).toEqual(['desliza', 'desliza', null])
    expect(JSON.stringify(slides)).not.toMatch(/[→↑←↗]/)
  })
  it('kit: una lámina por elemento de la ESTRUCTURA con el texto del autor, sin pie ni indicador', () => {
    const r = armarLaminasDeKit(
      [{ ref: 'e01', rol: 'apertura', beat: 'x', mood: 'm', foto_slot: 'e01' }, { ref: 'e02', rol: 'cierre', beat: 'y', mood: 'm' }],
      [{ ref: 'e02', headline: 'Dos' }, { ref: 'e01', headline: 'Uno', body: 'texto' }], { e01: img('https://x/1.png') })
    expect(r.refs).toEqual(['e01', 'e02']); expect(r.problemas).toEqual([])
    expect(r.slides[0]).toMatchObject({ headline: 'Uno', body: 'texto', background_image_url: 'https://x/1.png', pie: null, ocultar_indicador: true })
    expect(r.slides[1].background_image_url).toBeNull()
  })
  it('kit: un elemento sin texto, o un texto sin elemento, es un problema (no se rellena)', () => {
    const r = armarLaminasDeKit([{ ref: 'e01', rol: 'a', beat: 'b', mood: 'c' }], [{ ref: 'e09', headline: 'Otro' }], {})
    expect(r.problemas).toHaveLength(2); expect(r.slides).toEqual([])
  })
  it('kit: un elemento por fila del brief; dos al mismo día, hora y destino se avisan', () => {
    expect(problemasDeKit([{ ref: 'e01' }, { ref: 'e02' }], ['e01']).join('|')).toMatch(/«e02».*no tiene lámina/)
    expect(problemasDeKit([{ ref: 'e01', fecha: '2026-10-14', hora: '18:30', destino: 'historia' }, { ref: 'e02', fecha: '2026-10-14', hora: '18:30', destino: 'historia' }], ['e01', 'e02']).join('|')).toMatch(/mismo día/)
    expect(problemasDeKit([{ ref: 'e01', fecha: '2026-10-14', hora: '18:30', destino: 'historia' }, { ref: 'e02', fecha: '2026-10-14', hora: '18:30', destino: 'estado' }], ['e01', 'e02'])).toEqual([])
  })
})

describe('cifras que nadie le dio al autor', () => {
  const fuentes = ['Pedidos hasta las 21:00. El plato cuesta $7.00 y rinde para 2 personas.']
  it('un porcentaje inventado BLOQUEA; una cifra suelta inventada AVISA; las que están en las fuentes pasan', () => {
    const r = cifrasFueraDeFuentes(['Sube 50% tus ventas', 'Somos 35 en el equipo', 'Rinde para 2', 'Cuesta $7.00'], fuentes)
    expect(r).toEqual([{ cifra: '50%', porcentaje: true }, { cifra: '35', porcentaje: false }])
  })
  it('una hora o una fecha no se leen como cifra', () => { expect(cifrasFueraDeFuentes(['Hoy a las 18:30, el 14/10'], [''])).toEqual([]) })
})

describe('chequeos duros de las láminas', () => {
  const base = (): ContextoDeChequeoLaminas => ({
    familia: 'carrusel', fuentes: { palabras_prohibidas: ['premium'], telefonos: ['+593 997 744 288'], handles: ['@mi.marca'], precios: ['7.00'], competidores: [], registro: 'tuteo' },
    limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false }, prohibidas_del_brief: [],
    texto_del_autor: { texto: 'Pruébalo hoy', hashtags: ['#plato'] }, textos_de_laminas: ['Pruébalo hoy'], fuentes_de_cifras: ['Pruébalo hoy'],
    imagen_generada: false, fonts_faltantes: [], imagenes_sin_lamina: [], fotos_reusadas: [], problemas_de_contrato: [], texto_fuera_del_autor: [], problemas_de_armado: [], problemas_de_kit: [],
  })
  it('una pieza limpia no da fichas', () => { expect(chequeosDeLaminas(base())).toEqual([]) })
  it('la palabra prohibida, el voseo y un teléfono ajeno en el texto bloquean', () => {
    const c = base(); c.texto_del_autor = { texto: 'Un plato premium, pedilo al 0991112223', hashtags: [] }
    const q = chequeosDeLaminas(c).filter((x) => x.gravedad === 'bloquea').map((x) => x.que).join('|')
    expect(q).toMatch(/premium/); expect(q).toMatch(/voseo/); expect(q).toMatch(/teléfono/)
  })
  it('el contrato roto, el texto fuera del autor y la imagen sin lámina bloquean; la tipografía caída y la foto repetida avisan', () => {
    const c = base()
    c.problemas_de_contrato = ['3 láminas']; c.texto_fuera_del_autor = [{ lamina: 2, campo: 'headline', texto: 'inventado' }]; c.imagenes_sin_lamina = ['proof']; c.fonts_faltantes = ['Caveat']; c.fotos_reusadas = ['f1']
    const fs = chequeosDeLaminas(c)
    expect(fs.filter((x) => x.gravedad === 'bloquea').map((x) => x.donde).sort()).toEqual(['laminas', 'laminas', 'laminas'])
    expect(fs.filter((x) => x.gravedad === 'sugerencia').map((x) => x.que).join('|')).toMatch(/Caveat/)
    expect(fs.filter((x) => x.gravedad === 'sugerencia').map((x) => x.que).join('|')).toMatch(/f1/)
  })
  it('un porcentaje inventado bloquea', () => {
    const c = base(); c.textos_de_laminas = ['Sube 80% tus ventas']; c.texto_del_autor = { texto: 'Sube 80% tus ventas', hashtags: [] }
    expect(chequeosDeLaminas(c).some((x) => x.gravedad === 'bloquea' && /80%/.test(x.que ?? ''))).toBe(true)
  })
  it('todas las fichas son del origen «chequeo» y tienen id único', () => {
    const c = base(); c.problemas_de_contrato = ['a', 'b']; c.imagenes_sin_lamina = ['x', 'y']
    const fs = chequeosDeLaminas(c)
    expect(new Set(fs.map((x) => x.id)).size).toBe(fs.length); expect(fs.every((x) => x.origen === 'chequeo')).toBe(true)
  })
})

describe('leer el brief de un carrusel y el de un kit', () => {
  const parte = [
    '## Briefs', '', '### BRF-0100 · Instagram · carrusel', '- QUÉ ES: carrusel educativo', '- PROTAGONISTA: el plato del día', '',
    '### BRF-0200 · Instagram · kit_historias', '- QUÉ ES: kit semanal de historias y estados', '- ELEMENTOS:',
    '  - 2026-10-14 18:30 | historia | el plato del día | producto | precio 7.00; rinde para 2',
    '  - 2026-10-15 | estado | horario de la semana | servicio',
    '  - sin fecha | estado | tema libre | marca',
    '  - mañana por la tarde | historia | tema | pilar',
    '  - 2026-10-16 | video | tema | pilar',
  ].join('\n')
  it('distingue carrusel, kit y post', () => {
    const c = parsearBrief(parte, 'BRF-0100')!, k = parsearBrief(parte, 'BRF-0200')!
    expect([esCarrusel(c), esKitDeHistorias(c)]).toEqual([true, false])
    expect([esCarrusel(k), esKitDeHistorias(k)]).toEqual([false, true])
  })
  it('los elementos del kit: fecha, hora, destino, tema, pilar y datos; lo ilegible NO se adivina', () => {
    const { elementos, ilegibles } = elementosDelKit(parsearBrief(parte, 'BRF-0200')!)
    expect(elementos.map((e) => [e.ref, e.fecha, e.hora, e.destino])).toEqual([['e01', '2026-10-14', '18:30', 'historia'], ['e02', '2026-10-15', null, 'estado'], ['e03', null, null, 'estado']])
    expect(elementos[0].datos).toEqual(['precio 7.00', 'rinde para 2'])
    expect(ilegibles).toHaveLength(2)
  })
})
