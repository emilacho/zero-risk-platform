/**
 * 20-nov · PUNTO 3 · tanda 1 (CC1 · certifican CC6 y CC7): la corrección de la imagen final, dos versiones y hasta tres vueltas.
 * Diseño v3 de CC5 (al pie de `2026-11-19-PLAN-CC5-lo-real-es-el-set.md`) con sus 9 condiciones. En seco, sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import {
  ARTEFACTO_CORRECCIONES_DE_IMAGEN, ARTEFACTO_EDICIONES_DE_IMAGEN, ARTEFACTO_PEDIDO_DE_CORRECCION, MARGEN_DE_LA_CORRECCION, PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION,
  VUELTAS_DE_CORRECCION_IMAGEN, conCorreccionDeImagen, correccionesVigentes, editarImagenes, fotosDeLaEdicion, imagenesConLaMejor, leerLaMirada, llaveDeLaEdicion, mirarCorreccion,
  pedidoDeLaCorreccion, saltoDeLaCorreccion, sinLecturaDeLaCorreccion, tareaDeLaCorreccion, vistasDe, type Correcciones,
} from '../mesa/correccion-imagen'
import { validarPlantilla } from '../plantilla'
import { procesarSalida } from '../salida'
import { CONTRATOS_EN_TEXTO } from '../pedidos'
import { VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN } from '../topes-por-duracion'
import type { Estado, Plantilla } from '../tipos'

const art = (datos: unknown) => ({ version: 1, version_consumida: 0, datos })
const FOTOS = [{ id: 'f-real', url: 'https://fotos.test/real.jpg' }, { id: 'f-2', url: 'https://fotos.test/2.jpg' }]
function estado(o: { items?: Array<Record<string, unknown>>; extra?: Record<string, unknown>; gasto?: number } = {}): Estado {
  const items = o.items ?? [
    { indice: 0, ref: 'hook', intento: 1, prompt_idx: 0, url: 'https://img.test/hook-0.png', generation_id: 'g0', prompt: 'ceviche en tazón', foto_referencia_id: 'f-real' },
    { indice: 1, ref: 'hook', intento: 1, prompt_idx: 1, url: 'https://img.test/hook-1.png', generation_id: 'g1', prompt: 'ceviche en tazón' },
    { indice: 2, ref: 'cierre', intento: 1, prompt_idx: 0, url: 'https://img.test/cierre-0.png', generation_id: 'g2', prompt: 'local de noche' },
    { indice: 3, ref: 'viejo', intento: 0, prompt_idx: 0, url: 'https://img.test/viejo.png', generation_id: 'gv', prompt: 'tanda vieja' },
  ]
  const artefactos: Record<string, unknown> = {
    encargo: art({ F: { fotos: FOTOS } }),
    imagenes: art({ ultimo_intento: 1, items }),
    prompts_validos: art({ por_ref: { hook: { prompts: [{ foto_de_referencia: 'f-real', otras_fotos_de_referencia: ['f-2'] }] }, cierre: { prompts: [{}] } } }),
  }
  for (const [k, v] of Object.entries(o.extra ?? {})) artefactos[k] = art(v)
  return { artefactos, fichas: [], vueltas: {}, pasos_ejecutados: 9, gasto_usd: o.gasto ?? 1 } as unknown as Estado
}
const conArt = (e: Estado, k: string, v: unknown): Estado => ({ ...e, artefactos: { ...(e.artefactos as Record<string, unknown>), [k]: art(v) } } as unknown as Estado)
const enc = (e: Estado, dry_run = false) => ({ id: '11111111-2222-3333-4444-555555555555', client_id: 'cli', dry_run, estado_del_motor: e }) as never

function plantilla(tope = 45): Plantilla {
  const generada = { tipo: 'si_artefacto', artefacto: 'direccion', campo: 'decision.modo', igual: 'generada' }
  return {
    tipo: 'carrusel', familia: 'carrusel_mesa', clase: 'contenido', indicaciones: {},
    limites: { tope_encargo_usd: tope, margen: 50, imagenes_generadas_max: 8 },
    pasos: [
      { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir', entrada: [], salida_artefacto: 'notas', tope_usd: 0 },
      { clave: 'imagen', tipo: 'codigo', quien: 'sala', funcion: 'imagen_ref', condicion: generada, entrada: [], salida_artefacto: 'imagenes', tope_usd: 0.2 },
      { clave: 'observar', tipo: 'codigo', quien: 'sala', funcion: 'mesa_observar', condicion: generada, entrada: ['imagenes'], salida_artefacto: 'observacion', tope_usd: 0.1 },
      { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', entrada: [], salida_artefacto: 'cierre', tope_usd: 0 },
    ],
  } as unknown as Plantilla
}
const plConCorreccion = (tope = 45) => conCorreccionDeImagen(plantilla(tope))
const sinCorreccion = (pl: Plantilla): Plantilla => ({ ...pl, pasos: pl.pasos.filter((p) => ![PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION].includes(p.clave)), indicaciones: { ...pl.indicaciones, 'design-image-prompt-engineer': [{ regla: 'x', aplica: 'guia' }] } } as Plantilla)

/** el kit como la fila viva: la vuelta de la jefatura a la mesa en 6 (`conVueltaPorReglaDura`, migración 202611181530) y margen 50 · esa fila ya trae errores del validador
 *  que no son de la corrección (jefatura 6 > 3): las pruebas miran solo los errores NUEVOS */
const nuevos = (con: Plantilla, base: Plantilla) => { const b = new Set(validarPlantilla(base)); return validarPlantilla(con).filter((x) => !b.has(x) && !/el artefacto «visual_direction»/.test(x)) }
async function kitVivoConCorreccion(): Promise<{ base: Plantilla; con: Plantilla }> {
  const { KIT_MESA_CON_PROPUESTAS } = await import('../plantillas/imagen-propuestas')
  const { conVueltaPorReglaDura } = await import('../plantillas/vuelta-por-regla-dura')
  const r = conVueltaPorReglaDura(KIT_MESA_CON_PROPUESTAS)
  const base = { ...r, limites: { ...r.limites, margen: 50 } } as Plantilla
  return { base, con: conCorreccionDeImagen(base) }
}

/** puertos falsos: cuentan las llamadas a la edición y a la mirada */
function puertos(o: { mirada?: (n: number, urls: string[]) => string; imagenOk?: boolean; ya?: { url: string; generation_id: string; costo_usd: number } | null } = {}) {
  const llamadas = { imagen: [] as Array<Record<string, unknown>>, revisor: [] as Array<{ urls: string[]; dry_run: boolean }>, ya: [] as string[] }
  let n = 0
  const P = {
    imagen: async (p: Record<string, unknown>) => {
      llamadas.imagen.push(p)
      if (o.imagenOk === false) return { ok: false, error: 'el generador devolvió 502' }
      return { ok: true, url: `https://img.test/ed-${llamadas.imagen.length}.png`, generation_id: `ge${llamadas.imagen.length}`, costo_usd: 0.012 }
    },
    imagenYaPedida: async (p: { llave: string }) => { llamadas.ya.push(p.llave); return o.ya ?? null },
    revisor: async (p: { imagenes_urls: string[]; dry_run: boolean }) => {
      llamadas.revisor.push({ urls: p.imagenes_urls, dry_run: p.dry_run })
      return { ok: true, texto: (o.mirada ?? (() => '{"mejor":"B","queda_bien":true,"lectura":"bien"}'))(n++, p.imagenes_urls), costo_usd: p.dry_run ? 0 : 0.004 }
    },
  }
  return { P: P as never, llamadas }
}

describe('el estado de la corrección', () => {
  it('agrupa la tanda vigente por imagen (sin la tanda vieja) y empieza en la vuelta 0 con todas pendientes', () => {
    const c = correccionesVigentes(estado())
    expect(Object.keys(c.imagenes).sort()).toEqual(['cierre', 'hook'])
    expect(c.imagenes.hook.versiones.map((v) => v.url)).toEqual(['https://img.test/hook-0.png', 'https://img.test/hook-1.png'])
    expect(c.imagenes.hook.foto_real_id).toBe('f-real')
    expect(c.vuelta).toBe(0)
    expect(Object.values(c.imagenes).every((i) => !i.cerrada)).toBe(true)
  })
  it('la foto de la sala 1 (sin ref) es «pieza»', () => {
    const c = correccionesVigentes(estado({ items: [{ indice: 0, intento: 1, url: 'https://img.test/p.png', generation_id: 'g', prompt: 'x' }] }))
    expect(Object.keys(c.imagenes)).toEqual(['pieza'])
  })
  it('si se regeneró la tanda, la corrección vieja no se arrastra', () => {
    const viejo = { ...correccionesVigentes(estado()), intento_imagenes: 0, vuelta: 2 }
    const c = correccionesVigentes(conArt(estado(), ARTEFACTO_CORRECCIONES_DE_IMAGEN, viejo))
    expect(c.vuelta).toBe(0)
  })
  it('vistas: en la vuelta 1, todas las generadas; después, la mejor y la última editada', () => {
    const c = correccionesVigentes(estado())
    expect(vistasDe(c.imagenes.hook)).toEqual([0, 1])
    const i = { ...c.imagenes.hook, versiones: [...c.imagenes.hook.versiones, { vuelta: 1, url: 'u', generation_id: null }], mejor: 1 }
    expect(vistasDe(i)).toEqual([1, 2])
    expect(vistasDe({ ...i, mejor: 2 })).toEqual([2])
  })
})

describe('1 · la mirada del creativo', () => {
  it('ve cada versión como imagen, la foto real y el contrato; le dice que NO califica', () => {
    const t = tareaDeLaCorreccion(estado(), { contrato: CONTRATOS_EN_TEXTO['correccion_imagen.v1'], fotos: FOTOS })
    expect(t.images).toEqual(['https://img.test/hook-0.png', 'https://img.test/hook-1.png', 'https://fotos.test/real.jpg', 'https://img.test/cierre-0.png'])
    expect(t.task).toMatch(/vuelta 1 de 3/)
    expect(t.task).toMatch(/No calificas/)
    expect(t.task).toMatch(/FOTO REAL del cliente «f-real»/)
    expect(t.task).toContain(CONTRATOS_EN_TEXTO['correccion_imagen.v1'])
  })
  it('el esquema lee la respuesta del contrato', () => {
    expect(procesarSalida('{"imagenes":[{"ref":"hook","elegida":1,"cambios":"el tazón de barro"}]}', 'correccion_imagen.v1', 0, 1)).toMatchObject({ ok: true })
    expect(procesarSalida('{"imagenes":[{"ref":"hook"}]}', 'correccion_imagen.v1', 1, 1)).toMatchObject({ ok: false })
  })
  it('la versión elegida es la base; una que no vio cae en su mejor; lo que no nombra queda sin cambios', () => {
    const r = pedidoDeLaCorreccion(estado(), { imagenes: [{ ref: 'hook', elegida: 1, cambios: '  el tazón de barro ' }, { ref: 'cierre', elegida: 7, cambios: 'más luz' }] })
    const pr = (r.artefacto as { por_ref: Record<string, { base: number; cambios: string }> }).por_ref
    expect(pr.hook).toMatchObject({ base: 1, cambios: 'el tazón de barro' })
    expect(pr.cierre).toMatchObject({ base: 0, cambios: 'más luz' })
    const r2 = pedidoDeLaCorreccion(estado(), { imagenes: [] })
    expect((r2.artefacto as { por_ref: Record<string, { cambios: string }> }).por_ref.hook.cambios).toBe('')
  })
  it('ilegible: nadie edita esa vuelta y queda una ficha (el encargo no se cae)', () => {
    const r = sinLecturaDeLaCorreccion(estado(), ['json_invalido'])
    expect(Object.values((r.artefacto as { por_ref: Record<string, { cambios: string }> }).por_ref).every((x) => x.cambios === '')).toBe(true)
    expect(JSON.stringify(r.fichas)).toMatch(/no se pudo leer/)
  })
})

describe('2 · la edición', () => {
  const conPedido = (por_ref: Record<string, { base: number; cambios: string }>, e = estado()) => conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref })
  it('edita SOBRE la elegida (la generada va como base), con la foto real PRIMERA entre las otras, con su llave; solo las que piden cambios', async () => {
    const { P, llamadas } = puertos()
    const s = await editarImagenes(P, enc(conPedido({ hook: { base: 1, cambios: 'tazón de barro' }, cierre: { base: 0, cambios: '' } })))
    expect(llamadas.imagen).toHaveLength(1)
    const p = llamadas.imagen[0] as { foto: { url: string }; otras_fotos: Array<{ id: string }>; prompt: string; llave: string; dry_run: boolean }
    expect(p.foto.url).toBe('https://img.test/hook-1.png')
    expect(p.otras_fotos.map((f) => f.id)[0]).toBe('f-real')
    expect(p.prompt).toMatch(/Change ONLY this.*tazón de barro/)
    expect(p.llave).toBe(llaveDeLaEdicion('11111111-2222-3333-4444-555555555555', 'hook', 1))
    expect(p.dry_run).toBe(false)
    expect(s.res.costo_usd).toBeCloseTo(0.012)
    expect(s.gastos).toHaveLength(1)
  })
  it('🔴 en seco: 0 llamadas al generador y el gasto no sube', async () => {
    const { P, llamadas } = puertos()
    const s = await editarImagenes(P, enc(conPedido({ hook: { base: 0, cambios: 'x' } }), true))
    expect(llamadas.imagen).toHaveLength(0)
    expect(llamadas.ya).toHaveLength(0)
    expect(s.res.costo_usd).toBe(0)
    expect(s.gastos).toHaveLength(0)
  })
  it('🔴 una edición ya pagada con la misma llave se reusa (no se paga dos veces)', async () => {
    const { P, llamadas } = puertos({ ya: { url: 'https://img.test/ya.png', generation_id: 'gya', costo_usd: 0.011 } })
    const s = await editarImagenes(P, enc(conPedido({ hook: { base: 0, cambios: 'x' } })))
    expect(llamadas.imagen).toHaveLength(0)
    expect((s.res.artefacto as { por_ref: Record<string, { version: { url: string }; reusada: boolean }> }).por_ref.hook).toMatchObject({ reusada: true, version: { url: 'https://img.test/ya.png' } })
  })
  it('la llave es una por (encargo, imagen, vuelta) y cabe en 40', () => {
    const ks = new Set([llaveDeLaEdicion('a', 'hook', 1), llaveDeLaEdicion('a', 'hook', 2), llaveDeLaEdicion('a', 'cierre', 1), llaveDeLaEdicion('b', 'hook', 1)])
    expect(ks.size).toBe(4)
    for (const k of ks) expect(k.length).toBeLessThanOrEqual(40)
    expect(llaveDeLaEdicion('a', 'hook', 1)).toBe(llaveDeLaEdicion('a', 'hook', 1))
  })
  it('nunca más de 15 otras fotos, la real primera y sin repetir', () => {
    const muchas = Array.from({ length: 20 }, (_, k) => ({ id: `f${k}`, url: `u${k}` }))
    const r = fotosDeLaEdicion({ id: 'f3', url: 'u3' }, muchas)
    expect(r).toHaveLength(15)
    expect(r[0].id).toBe('f3')
    expect(r.filter((f) => f.id === 'f3')).toHaveLength(1)
  })
})

describe('3 · la mirada de otro proveedor decide', () => {
  const paraMirar = (por_ref: Record<string, { base: number; cambios: string }>, ed: Record<string, unknown>, e = estado()) =>
    conArt(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref }), ARTEFACTO_EDICIONES_DE_IMAGEN, { vuelta: 1, por_ref: ed })
  const nueva = (url: string) => ({ version: { vuelta: 1, url, generation_id: 'gn' }, costo_usd: 0.012, llave: 'ed:x' })
  const corr = (r: { res: { artefacto?: unknown } }) => r.res.artefacto as unknown as Correcciones

  it('queda bien con la editada → cierra «queda_bien» y la mejor es la nueva; compara A (antes) y B (después)', async () => {
    const { P, llamadas } = puertos({ mirada: () => '{"mejor":"B","queda_bien":true,"lectura":"ok"}' })
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 1, cambios: 'barro' }, cierre: { base: 0, cambios: '' } }, { hook: nueva('https://img.test/n.png') })), plConCorreccion())
    expect(llamadas.revisor[0].urls).toEqual(['https://img.test/hook-1.png', 'https://img.test/n.png'])
    const c = corr(r)
    expect(c.imagenes.hook).toMatchObject({ cerrada: true, motivo_de_cierre: 'queda_bien', mejor: 2 })
    expect(c.imagenes.cierre).toMatchObject({ cerrada: true, motivo_de_cierre: 'sin_cambios' })
    expect(c.sigue).toBe(false)
    const im = r.res.otros_artefactos?.imagenes as { items: Array<{ ref?: string; url: string; intento: number }>; ultimo_intento: number }
    expect(im.ultimo_intento).toBe(1)
    expect(im.items.filter((x) => x.intento === 1).map((x) => [x.ref, x.url])).toEqual([['hook', 'https://img.test/n.png'], ['cierre', 'https://img.test/cierre-0.png']])
    expect(im.items.some((x) => x.ref === 'viejo')).toBe(true)
  })
  it('🔴 «sin cambios» no cierra solo: si la mirada dice que no queda bien, la vuelta cuenta y sigue', async () => {
    const { P, llamadas } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"el tazón es de plástico"}' })
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 0, cambios: '' }, cierre: { base: 0, cambios: '' } }, {})), plConCorreccion())
    expect(llamadas.revisor).toHaveLength(2)
    const c = corr(r)
    expect(c.imagenes.hook.cerrada).toBe(false)
    expect(c.imagenes.hook.lectura).toMatch(/plástico/)
    expect(c.sigue).toBe(true)
    expect(r.res.otros_artefactos).toBeUndefined()
  })
  it('🔴 no mejoró (prefiere A) → cierra con la anterior, progreso monótono', async () => {
    const { P } = puertos({ mirada: () => '{"mejor":"A","queda_bien":false,"lectura":"empeoró"}' })
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 1, cambios: 'x' } }, { hook: nueva('n') }, estado({ items: [
      { indice: 0, ref: 'hook', intento: 1, url: 'a0', generation_id: 'g', prompt: 'p' }, { indice: 1, ref: 'hook', intento: 1, url: 'a1', generation_id: 'g', prompt: 'p' }] }))), plConCorreccion())
    const c = corr(r)
    expect(c.imagenes.hook).toMatchObject({ cerrada: true, motivo_de_cierre: 'no_mejoro', mejor: 1 })
    expect((r.res.otros_artefactos?.imagenes as { items: Array<{ url: string }> }).items[0].url).toBe('a1')
  })
  it('🔴 lo que ya quedó bien no se vuelve a mirar ni a editar en la vuelta siguiente', async () => {
    const c0 = correccionesVigentes(estado())
    c0.imagenes.cierre.cerrada = true; c0.imagenes.cierre.motivo_de_cierre = 'queda_bien'; c0.vuelta = 1
    const e = conArt(estado(), ARTEFACTO_CORRECCIONES_DE_IMAGEN, c0)
    const { P, llamadas } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"x"}' })
    const ed = await editarImagenes(P, enc(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 2, por_ref: { hook: { base: 0, cambios: 'a' }, cierre: { base: 0, cambios: 'b' } } })))
    expect(llamadas.imagen).toHaveLength(1)
    expect(Object.keys((ed.res.artefacto as { por_ref: object }).por_ref)).toEqual(['hook'])
    const t = tareaDeLaCorreccion(e, { contrato: '', fotos: FOTOS })
    expect(t.task).not.toMatch(/«cierre»/)
  })
  it('🔴 en la vuelta 3 lo pendiente cierra «tope_de_vueltas» con la mejor y su ficha «quedó pendiente»', async () => {
    const c0 = correccionesVigentes(estado()); c0.vuelta = 2
    const e = conArt(estado(), ARTEFACTO_CORRECCIONES_DE_IMAGEN, c0)
    const { P } = puertos({ mirada: () => '{"mejor":"B","queda_bien":false,"lectura":"falta brillo"}' })
    const r = await mirarCorreccion(P, enc(conArt(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 3, por_ref: { hook: { base: 0, cambios: 'más brillo' }, cierre: { base: 0, cambios: '' } } }), ARTEFACTO_EDICIONES_DE_IMAGEN, { vuelta: 3, por_ref: { hook: nueva('n3') } })), plConCorreccion())
    const c = corr(r)
    expect(c.vuelta).toBe(VUELTAS_DE_CORRECCION_IMAGEN)
    expect(c.imagenes.hook.motivo_de_cierre).toBe('tope_de_vueltas')
    expect(c.sigue).toBe(false)
    expect(JSON.stringify(r.res.fichas)).toMatch(/quedó pendiente: más brillo/)
  })
  it('🔴 no cabe otra vuelta en el tope → sale la mejor con su ficha «no cupo», sin cierre por tope', async () => {
    const { P } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"x"}' })
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 0, cambios: '' }, cierre: { base: 0, cambios: '' } }, {}, estado({ gasto: 44.9 }))), plConCorreccion(45))
    const c = corr(r)
    expect(c.sigue).toBe(false)
    expect(Object.values(c.imagenes).every((i) => i.motivo_de_cierre === 'no_cupo')).toBe(true)
    expect(JSON.stringify(r.res.fichas)).toMatch(/no cupo/)
    expect(r.res.otros_artefactos?.imagenes).toBeDefined()
  })
  it('el techo de seguridad del motor agotado (nunca debería pasar con el techo alto) también cierra «tope_de_vueltas», sin contradecir al motor', async () => {
    const { P } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"x"}' })
    const e = { ...paraMirar({ hook: { base: 0, cambios: '' }, cierre: { base: 0, cambios: '' } }, {}), vueltas: { [PASO_MIRAR_CORRECCION]: 2 } } as Estado
    const c = corr(await mirarCorreccion(P, enc(e), plConCorreccion()))
    expect(c.sigue).toBe(false)
    expect(Object.values(c.imagenes).every((i) => i.motivo_de_cierre === 'tope_de_vueltas')).toBe(true)
  })
  it('🔴 la jefatura devuelve la pieza: la imagen ya aceptada se conserva en su tanda y NO gasta otra vuelta; solo se corrige la rehecha (CC6)', async () => {
    // así deja `imagenes` la regeneración tras la vuelta a la mesa: los items viejos en su tanda (1) y solo la imagen rehecha en la nueva (2)
    const e = estado({ items: [
      { indice: 0, ref: 'hook', intento: 1, url: 'https://img.test/hook-corregida.png', generation_id: 'g0', prompt: 'p', corregida_en_la_vuelta: 1 },
      { indice: 1, ref: 'cierre', intento: 1, url: 'https://img.test/cierre-0.png', generation_id: 'g2', prompt: 'q' },
      { indice: 2, ref: 'cierre', intento: 2, url: 'https://img.test/cierre-nueva.png', generation_id: 'g3', prompt: 'q' },
    ] })
    const im = (e.artefactos as Record<string, { datos: Record<string, unknown> }>).imagenes.datos
    im.ultimo_intento = 2
    const viejo = { ...correccionesVigentes(estado()), intento_imagenes: 1, vuelta: 1 }
    const e2 = conArt(e, ARTEFACTO_CORRECCIONES_DE_IMAGEN, viejo)
    expect(Object.keys(correccionesVigentes(e2).imagenes)).toEqual(['cierre'])
    expect(saltoDeLaCorreccion(e2)).toBeNull()
    const { P, llamadas } = puertos()
    await editarImagenes(P, enc(conArt(e2, ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref: { hook: { base: 0, cambios: 'otra vez' }, cierre: { base: 0, cambios: 'más luz' } } })))
    expect(llamadas.imagen).toHaveLength(1)
    expect((llamadas.imagen[0] as { foto: { url: string } }).foto.url).toBe('https://img.test/cierre-nueva.png')
  })
  it('🔴 sin imágenes pendientes (la regeneración no rehizo ninguna), el creativo NO se llama y la mirada no reescribe las imágenes', async () => {
    const e = estado()
    const im = (e.artefactos as Record<string, { datos: Record<string, unknown> }>).imagenes.datos
    im.ultimo_intento = 2
    const s = saltoDeLaCorreccion(e)
    expect(s).toMatchObject({ costo_usd: 0, artefacto: { por_ref: {}, sin_pendientes: true } })
    const { P, llamadas } = puertos()
    const r = await mirarCorreccion(P, enc(conArt(e, ARTEFACTO_PEDIDO_DE_CORRECCION, s!.artefacto)), plConCorreccion())
    expect(llamadas.revisor).toHaveLength(0)
    expect(r.res.otros_artefactos).toBeUndefined()
    expect(r.res.costo_usd).toBe(0)
  })
  it('el salto está cableado en el orquestador (antes de armar el pedido del agente)', async () => {
    const fs = await import('node:fs')
    const fuente = fs.readFileSync(new URL('../orquestador.ts', import.meta.url), 'utf8')
    expect(fuente).toMatch(/paso\.clave === PASO_CORREGIR_IMAGEN \? saltoDeLaCorreccion\(e, enc\.dry_run\)/)
  })
  it('🔴 en ensayo la corrección se salta sin llamar al creativo (imágenes simuladas, como la revisión de las imágenes clave del video)', async () => {
    expect(saltoDeLaCorreccion(estado(), true)).toMatchObject({ costo_usd: 0, artefacto: { por_ref: {}, en_ensayo: true } })
    expect(saltoDeLaCorreccion(estado(), false)).toBeNull()
    const { P, llamadas } = puertos()
    const e = conArt(estado(), ARTEFACTO_PEDIDO_DE_CORRECCION, saltoDeLaCorreccion(estado(), true)!.artefacto)
    await editarImagenes(P, enc(e, true))
    expect(llamadas.imagen).toHaveLength(0)
    const r = await mirarCorreccion(P, enc(e, true), plConCorreccion())
    expect(llamadas.revisor).toHaveLength(0)
    expect(r.res).toMatchObject({ costo_usd: 0, artefacto: { sigue: false, en_ensayo: true } })
    expect(r.res.otros_artefactos).toBeUndefined()
    expect(r.res.fichas).toBeUndefined()
  })
  it('la edición falló → sale la mejor con su aviso; la mirada ilegible → sale la elegida, sin confirmar', async () => {
    const { P } = puertos({ mirada: () => 'no sé' })
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 0, cambios: 'x' }, cierre: { base: 0, cambios: '' } }, { hook: { costo_usd: 0, llave: 'k', error: '502' } })), plConCorreccion())
    const c = corr(r)
    expect(c.imagenes.hook.motivo_de_cierre).toBe('fallo_la_edicion')
    expect(c.imagenes.cierre.motivo_de_cierre).toBe('sin_lectura')
  })
  it('🔴 registro: una fila por (imagen, vuelta) con su motivo, su llave y «donde: final»', async () => {
    const { P } = puertos()
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 1, cambios: 'barro' }, cierre: { base: 0, cambios: '' } }, { hook: nueva('n') })), plConCorreccion())
    const f = corr(r).filas
    expect(f.map((x) => [x.ref, x.vuelta, x.motivo_de_cierre, x.donde])).toEqual([['hook', 1, 'queda_bien', 'final'], ['cierre', 1, 'sin_cambios', 'final']])
    expect(f[0]).toMatchObject({ llave: 'ed:x', elegida: 1, version_nueva: 2, cambios: 'barro' })
  })
  it('🔴 en seco la mirada va en seco (el revisor recibe dry_run) y no suma gasto', async () => {
    const { P, llamadas } = puertos()
    const r = await mirarCorreccion(P, enc(paraMirar({ hook: { base: 0, cambios: '' } }, {}), true), plConCorreccion())
    expect(llamadas.revisor.every((x) => x.dry_run)).toBe(true)
    expect(r.res.costo_usd).toBe(0)
    expect(r.gastos).toHaveLength(0)
  })
  it('la mirada se lee estricta: sin queda_bien booleano no hay lectura', () => {
    expect(leerLaMirada('{"mejor":"B","queda_bien":true,"lectura":"ok"}')).toEqual({ mejor: 'B', queda_bien: true, lectura: 'ok' })
    expect(leerLaMirada('{"queda_bien":"sí"}')).toBeNull()
    expect(leerLaMirada('nada')).toBeNull()
  })
  it('imagenesConLaMejor conserva la forma del item y la tanda', () => {
    const c = correccionesVigentes(estado())
    const im = imagenesConLaMejor(estado(), c) as { items: Array<Record<string, unknown>> }
    expect(im.items.find((x) => x.ref === 'hook')).toMatchObject({ prompt: 'ceviche en tazón', intento: 1, foto_referencia_id: 'f-real' })
  })
})

describe('la plantilla', () => {
  it('🔴 los tres pasos van entre «imagen» y «observar», ubicados por clave, con la condición de la imagen', () => {
    const pl = plConCorreccion()
    expect(pl.pasos.map((p) => p.clave)).toEqual(['abrir', 'imagen', PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION, 'observar', 'cierre'])
    for (const k of [PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION]) expect(pl.pasos.find((p) => p.clave === k)?.condicion).toEqual(plantilla().pasos[1].condicion)
  })
  it('🔴 la vuelta vuelve a la mirada del creativo, máx. 2 regresos (3 vueltas), si `sigue`', () => {
    const m = plConCorreccion().pasos.find((p) => p.clave === PASO_MIRAR_CORRECCION)
    expect(m?.vuelve_a).toEqual({ paso: PASO_CORREGIR_IMAGEN, max: 2, si: { tipo: 'si_artefacto', artefacto: ARTEFACTO_CORRECCIONES_DE_IMAGEN, campo: 'sigue', igual: true } })
  })
  it('🔴 el margen sube con la cuenta escrita (+8 = 2 × 3 + 2) y las vueltas quedan en los límites', () => {
    const pl = plConCorreccion()
    expect(MARGEN_DE_LA_CORRECCION).toBe(8)
    expect(pl.limites.margen).toBe(58)
    expect((pl.limites as Record<string, unknown>).vueltas_de_correccion_imagen).toBe(3)
  })
  it('la edición reserva lo cotizado por imagen generada (8 × 0,07); la vuelta se salta si no cabe', () => {
    expect(plConCorreccion().pasos.find((p) => p.clave === PASO_EDITAR_IMAGEN)?.tope_usd).toBe(0.56)
    expect(VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN.claves).toContain(PASO_MIRAR_CORRECCION)
  })
  it('es idempotente y no toca la plantilla de entrada; sin «imagen» seguida de «observar», se niega', () => {
    const base = plantilla()
    const una = conCorreccionDeImagen(base)
    expect(conCorreccionDeImagen(una).pasos.length).toBe(una.pasos.length)
    expect(base.pasos).toHaveLength(4)
    const rota = { ...base, pasos: base.pasos.filter((p) => p.clave !== 'observar') } as Plantilla
    expect(() => conCorreccionDeImagen(rota)).toThrow(/imagen.*observar/)
  })
  it('🔴 las tres mesas reales con la corrección pasan la validación completa, con los pasos en su lugar', async () => {
    const { POST_MESA_CON_CORRECCION, CARRUSEL_MESA_CON_CORRECCION, KIT_MESA_CON_CORRECCION } = await import('../plantillas/imagen-correccion')
    const { POST_MESA_CON_PROPUESTAS } = await import('../plantillas/imagen-propuestas')
    for (const pl of [POST_MESA_CON_CORRECCION, CARRUSEL_MESA_CON_CORRECCION, KIT_MESA_CON_CORRECCION]) {
      // la corrección no agrega errores a los que la mesa ya tenía (la mesa se valida aparte por sus propias reglas)
      const antes = new Set(validarPlantilla(sinCorreccion(pl)).map((x) => x.replace(/paso «[^»]+»/, 'paso')))
      expect(validarPlantilla(pl).filter((x) => !antes.has(x.replace(/paso «[^»]+»/, 'paso')))).toEqual([])
      expect(validarPlantilla({ ...pl, indicaciones: {} }).filter((x) => /design-image-prompt-engineer/.test(x))).toHaveLength(1)
      expect(pl.indicaciones['design-image-prompt-engineer']).toEqual(expect.arrayContaining([expect.objectContaining({ regla: expect.stringContaining('NO las calificas') })]))
      const c = pl.pasos.map((p) => p.clave)
      expect(c.slice(c.indexOf('imagen'), c.indexOf('observar') + 1)).toEqual(['imagen', PASO_CORREGIR_IMAGEN, PASO_EDITAR_IMAGEN, PASO_MIRAR_CORRECCION, 'observar'])
    }
    expect(POST_MESA_CON_CORRECCION.pasos.length).toBe(POST_MESA_CON_PROPUESTAS.pasos.length + 3)
  })

  it('🔴 el validador acepta la vuelta de la corrección ANIDADA en la de la jefatura, pero no otra vuelta anidada que el código no salta', async () => {
    // en código, el kit es la mesa que trae la vuelta de la jefatura a la mesa (como las tres filas vivas)
    const { KIT_MESA_CON_CORRECCION: CARRUSEL_MESA_CON_CORRECCION } = await import('../plantillas/imagen-correccion')
    expect(CARRUSEL_MESA_CON_CORRECCION.pasos.find((p) => p.clave === 'jefatura')?.vuelve_a?.paso).toBe('mesa')
    expect(validarPlantilla(CARRUSEL_MESA_CON_CORRECCION).filter((x) => /se solapan/.test(x))).toEqual([])
    const otra = { ...CARRUSEL_MESA_CON_CORRECCION, pasos: CARRUSEL_MESA_CON_CORRECCION.pasos.map((p) => (p.clave === PASO_MIRAR_CORRECCION ? { ...p, clave: 'otra_vuelta' } : p)) } as Plantilla
    expect(validarPlantilla(otra)).toContain('las vueltas de «otra_vuelta» y «jefatura» se solapan o se anidan')
  })
  it('🔴 (a) LENOVO: con la jefatura envolviendo, el techo del motor es 2 × (1 + 6) = 14 y el margen sube a 14 × 3 + 2 = 44; la cuenta que decide va por imagen', async () => {
    const { base, con: KIT_MESA_CON_CORRECCION } = await kitVivoConCorreccion()
    const m = KIT_MESA_CON_CORRECCION.pasos.find((p) => p.clave === PASO_MIRAR_CORRECCION)
    expect(m?.vuelve_a?.max).toBe(14)
    expect(KIT_MESA_CON_CORRECCION.limites.margen).toBe(50 + 44)
    expect(base.limites.margen).toBe(50)
    expect(nuevos(KIT_MESA_CON_CORRECCION, base)).toEqual([])
    // sin vuelta que la envuelva, el techo es el de una pasada (2) y el margen +8
    expect(plConCorreccion().pasos.find((p) => p.clave === PASO_MIRAR_CORRECCION)?.vuelve_a?.max).toBe(2)
  })
  it('🔴 (a) una tanda NUEVA tras la devolución tiene sus 3 vueltas aunque el encargo ya haya gastado regresos (la cuenta es por imagen)', async () => {
    const { con: KIT_MESA_CON_CORRECCION } = await kitVivoConCorreccion()
    const { P } = puertos({ mirada: () => '{"queda_bien":false,"lectura":"x"}' })
    // tanda 2 (tras la jefatura), su vuelta 1; el encargo ya gastó 2 regresos de la corrección en la tanda 1
    const e = { ...conArt(conArt(estado(), ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref: {} }), ARTEFACTO_EDICIONES_DE_IMAGEN, { vuelta: 1, por_ref: {} }), vueltas: { [PASO_MIRAR_CORRECCION]: 2, jefatura: 1 } } as Estado
    const c = (await mirarCorreccion(P, enc(e), KIT_MESA_CON_CORRECCION)).res.artefacto as unknown as Correcciones
    expect(c.vuelta).toBe(1)
    expect(c.sigue).toBe(true)
    expect(Object.values(c.imagenes).every((i) => !i.cerrada)).toBe(true)
  })
  it('🔴 (a) el validador abre el techo SOLO para esta vuelta anidada: las demás siguen en 1–3, y esta no pasa de 3 por pasada', async () => {
    const { con: KIT_MESA_CON_CORRECCION } = await kitVivoConCorreccion()
    const con = (clave: string, max: number) => ({ ...KIT_MESA_CON_CORRECCION, pasos: KIT_MESA_CON_CORRECCION.pasos.map((p) => (p.clave === 'aprobar_propuestas' ? { ...p, vuelve_a: { ...p.vuelve_a!, max: clave === 'aprobar_propuestas' ? max : p.vuelve_a!.max } } : p.clave === PASO_MIRAR_CORRECCION ? { ...p, vuelve_a: { ...p.vuelve_a!, max: clave === PASO_MIRAR_CORRECCION ? max : p.vuelve_a!.max } } : p)) }) as Plantilla
    expect(validarPlantilla(con('aprobar_propuestas', 4))).toContain('paso «aprobar_propuestas»: vuelve_a.max debe ser 1, 2 o 3')
    expect(validarPlantilla(con(PASO_MIRAR_CORRECCION, 21)).filter((x) => /mirar_correccion.*vuelve_a\.max/.test(x))).toEqual([])
    expect(validarPlantilla(con(PASO_MIRAR_CORRECCION, 22))).toContain('paso «mirar_correccion»: vuelve_a.max debe estar entre 1 y 21 (3 por cada pasada de las vueltas que la envuelven)')
    const jef = KIT_MESA_CON_CORRECCION.pasos.find((p) => p.clave === 'jefatura')
    expect(jef?.vuelve_a?.max).toBe(6)
  })
})

describe('la migración 202611201400 dice lo mismo que el código', () => {
  const leer = async (r: string) => (await import('node:fs')).readFileSync(new URL(`../../../../${r}`, import.meta.url), 'utf8').replace(/\r/g, '')
  it('🔴 los 3 pasos literales son los de `pasosDeLaCorreccion` con techo 14 (la condición y el tope de la edición los pone la fila)', async () => {
    const { pasosDeLaCorreccion, techoDeLaCorreccion } = await import('../mesa/correccion-imagen')
    const sql = await leer('supabase/migrations/202611201400_oficina_correccion_de_la_imagen_final.sql')
    const lit = [...sql.matchAll(/-- PASO_LITERAL\n\s*\(\d, '(\{.*\})'::jsonb\)/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
    expect(lit).toHaveLength(3)
    const { con } = await kitVivoConCorreccion()
    const i = con.pasos.findIndex((p) => p.clave === PASO_CORREGIR_IMAGEN)
    expect(techoDeLaCorreccion(plantilla().pasos, 2, 1)).toBe(2)
    const codigo = pasosDeLaCorreccion({ tipo: 'siempre' }, { limites: { imagenes_generadas_max: 8 } } as never, 14).map((p) => ({ ...p, condicion: null, ...(p.clave === PASO_EDITAR_IMAGEN || p.clave === PASO_MIRAR_CORRECCION ? { tope_usd: null } : {}) }))
    expect(lit).toEqual(codigo)
    expect(con.pasos.slice(i, i + 3).map((p) => p.vuelve_a?.max ?? null)).toEqual([null, null, 14])
  })
  it('🔴 el margen (+44), las vueltas (3), el 0,07 de la edición, la guarda de la jefatura (6) y la indicación son los del código', async () => {
    const { margenDeLaCorreccion, INDICACION_DE_LA_CORRECCION, COSTO_ESTIMADO_POR_EDICION_USD, COSTO_RESERVADO_POR_MIRADA_DE_OTRO_PROVEEDOR_USD, RESERVA_POR_PIEZA_DE_LA_CORRECCION_USD: R } = await import('../mesa/correccion-imagen')
    const { VUELTAS_POR_REGLA_DURA } = await import('../plantillas/vuelta-por-regla-dura')
    const sql = await leer('supabase/migrations/202611201400_oficina_correccion_de_la_imagen_final.sql')
    expect(sql).toContain(`(g.limites->>'margen')::numeric + ${margenDeLaCorreccion(2 * (1 + VUELTAS_POR_REGLA_DURA))}, 'vueltas_de_correccion_imagen', ${VUELTAS_DE_CORRECCION_IMAGEN},`)
    expect(sql).toContain(`::numeric * ${COSTO_ESTIMADO_POR_EDICION_USD}, 4)`)
    expect(sql).toContain(`::numeric * ${COSTO_RESERVADO_POR_MIRADA_DE_OTRO_PROVEEDOR_USD}, 4)`)
    const caso = `CASE g.tipo WHEN 'post_mesa' THEN ${R.post_mesa} WHEN 'carrusel_mesa' THEN ${R.carrusel_mesa} WHEN 'kit_mesa' THEN ${R.kit_mesa} END`
    expect(sql).toContain(`(g.limites->>'reserva_por_pieza_usd')::numeric + ${caso}`)
    expect(sql).toContain(`(p->'vuelve_a'->>'max')::int = ${VUELTAS_POR_REGLA_DURA}`)
    const ind = JSON.parse(sql.match(/-- INDICACION_LITERAL\n\s*\|\| '(\[.*\])'::jsonb/)![1])
    expect(ind).toEqual([INDICACION_DE_LA_CORRECCION])
    const rev = await leer('supabase/reversas/202611201400_oficina_correccion_de_la_imagen_final_REVERSA.sql')
    expect(rev).toContain(`(g.limites->>'margen')::numeric - ${margenDeLaCorreccion(14)}`)
    expect(rev).toContain(`(g.limites->>'reserva_por_pieza_usd')::numeric - ${caso}`)
    const prefijo = 'Cuando miras las imágenes finales que pediste, NO las calificas'
    expect(INDICACION_DE_LA_CORRECCION.regla.startsWith(prefijo)).toBe(true)
    expect(rev).toContain(`'${prefijo}%'`)
  })
  it('las dos toman el candado con tiempo límite y se niegan con encargos vivos', async () => {
    for (const r of ['supabase/migrations/202611201400_oficina_correccion_de_la_imagen_final.sql', 'supabase/reversas/202611201400_oficina_correccion_de_la_imagen_final_REVERSA.sql']) {
      const sql = await leer(r)
      expect(sql).toMatch(/SET LOCAL lock_timeout = '5s';\nLOCK TABLE public\.oficina_encargos IN SHARE MODE;/)
      expect(sql).toMatch(/e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('post_mesa', 'carrusel_mesa', 'kit_mesa'\)/)
    }
  })
})
