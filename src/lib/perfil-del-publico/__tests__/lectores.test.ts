/**
 * PERFIL DEL PÚBLICO · T2 · lectores de las piezas (oficina) y el chequeo «frase del público sin fuente».
 * Dos clientas de práctica de rubros distintos (las mismas de T1): una cafetería de consumo en Madrid y un proveedor industrial B2B en Monterrey.
 */
import { describe, expect, it } from 'vitest'
import { bloqueDelPerfil, ENCABEZADO_DEL_PERFIL, frasesDelPublicoSinFuente, perfilDelAdjunto, REGLA_DEL_PERFIL, SIN_PERFIL_LEIDO, type PerfilParaLectores } from '../lectores'
import { TIPO_DEL_INFORME } from '../perfil'
import { construirTarea, type ContextoDePedido } from '../../oficina/pedidos'
import { construirTareaLaminas, type ContextoLaminas } from '../../oficina/pedidos-laminas'
import { chequeosDePost, type FuentesDelCliente } from '../../oficina/chequeos'

const PERFIL_CAFE = [
  '[perfil del público · vecinos del barrio · OBSERVADO en voces públicas: no es dato del cliente]',
  '## Cómo habla',
  '- «un café con leche y una tostada, como siempre» [voz:11111111-1111-4111-8111-111111111111] [voz:22222222-2222-4222-8222-222222222222] — el pedido de rutina',
  '- «me pilla de camino al curro» [voz:33333333-3333-4333-8333-333333333333] [voz:44444444-4444-4444-8444-444444444444] — por qué entra',
].join('\n')
const PERFIL_B2B = [
  '[perfil del público · jefes de mantenimiento · OBSERVADO en voces públicas: no es dato del cliente]',
  '## Cómo habla',
  '- «que no se me pare la línea» [voz:55555555-5555-4555-8555-555555555555] [voz:66666666-6666-4666-8666-666666666666] — lo que más teme',
].join('\n')
const adjunto = (informes: Array<{ tipo: string; texto: string; fecha_de_corte?: string }>) => ({ informes, informes_estado: 'ok' as const })

describe('del adjunto del cliente al perfil para los lectores', () => {
  it('toma SOLO el informe `perfil_del_publico` (no el de competencia ni el de voz del público) con su corte', () => {
    const p = perfilDelAdjunto(adjunto([{ tipo: 'competencia', texto: 'otra cosa' }, { tipo: 'voz_del_publico', texto: 'opiniones' }, { tipo: TIPO_DEL_INFORME, texto: PERFIL_CAFE, fecha_de_corte: '2026-11-26T10:00:00Z' }]))
    expect(p).toEqual({ estado: 'vigente', texto: PERFIL_CAFE, fecha_de_corte: '2026-11-26T10:00:00Z', ficha_id: null })
  })
  it('sin informe de perfil ⇒ `sin_perfil`; un perfil vacío no cuenta', () => {
    expect(perfilDelAdjunto(adjunto([{ tipo: 'competencia', texto: 'x' }]))).toEqual({ estado: 'sin_perfil' })
    expect(perfilDelAdjunto(adjunto([{ tipo: TIPO_DEL_INFORME, texto: '   ' }]))).toEqual({ estado: 'sin_perfil' })
  })
  it('🔴 si los informes no se pudieron leer, se DICE (nunca se disfraza de «no hay perfil»)', () => {
    expect(perfilDelAdjunto({ informes: [], informes_estado: 'no_se_pudo_leer', informes_detalle: 'base caída' })).toEqual({ estado: 'no_se_pudo_leer', detalle: 'base caída' })
    expect(perfilDelAdjunto(null).estado).toBe('no_se_pudo_leer')
  })
})

describe('el bloque del perfil: contexto, no mandato', () => {
  it('vigente: encabezado, regla y el texto entero; sin perfil: vacío; sin leer: dicho', () => {
    const b = bloqueDelPerfil({ estado: 'vigente', texto: PERFIL_B2B, fecha_de_corte: '2026-11-26T10:00:00Z', ficha_id: 'f1' })
    expect(b.startsWith(`${ENCABEZADO_DEL_PERFIL}\n${REGLA_DEL_PERFIL} Corte del perfil: 2026-11-26.\n`)).toBe(true)
    expect(b).toContain(PERFIL_B2B)
    expect(ENCABEZADO_DEL_PERFIL).toMatch(/no es dato del cliente · contexto, no mandato/)
    expect(bloqueDelPerfil({ estado: 'sin_perfil' })).toBe('')
    expect(bloqueDelPerfil({ estado: 'no_se_pudo_leer', detalle: 'x' })).toBe(SIN_PERFIL_LEIDO)
  })
})

// ─────────────────────────────────────────────────────────── la tarea de las piezas
const ctxPieza = (perfil?: PerfilParaLectores) => ({
  fuentes: { cliente_nombre: 'Cafetería de práctica', manual_texto: 'manual de la cafetería', plan_texto: null, fuentes: { precios: [] }, propios: { telefonos: [], handles: [] }, ...(perfil ? { perfil_del_publico: perfil } : {}) },
  brief: { id: 'BRF-1', texto: 'brief del post', red: 'instagram', formato: 'foto_1x1' }, proporcion: '1:1', estado: { fichas: [] }, reglas: { obligatorio: [], prohibido: [] }, imagenesAMirar: [], art: () => undefined,
}) as unknown as ContextoDePedido
const ctxLaminas = (perfil?: PerfilParaLectores) => ({
  brief: { id: 'BRF-9', texto: 'brief del carrusel', red: 'linkedin', formato: 'carrusel' },
  fuentes: { manual_texto: 'manual del proveedor', plan_texto: '', propios: { telefonos: [], handles: [] }, fuentes: { precios: [] }, ...(perfil ? { perfil_del_publico: perfil } : {}) },
  estado: { fichas: [] }, art: () => undefined, limites: {}, elementos: [], plataforma: 'linkedin', familia: 'carrusel_mesa', refsValidos: [], refsGeneradas: [], sinFoto: false, png: [],
}) as unknown as ContextoLaminas

describe('las tareas de las piezas (texto y láminas) llevan el perfil UNA vez', () => {
  it('🔴 sin perfil (o sin el campo), la tarea es IDÉNTICA byte a byte a la de antes', () => {
    expect(construirTarea('texto', ctxPieza({ estado: 'sin_perfil' })).task).toBe(construirTarea('texto', ctxPieza()).task)
    expect(construirTareaLaminas('direccion_visual', ctxLaminas({ estado: 'sin_perfil' })).task).toBe(construirTareaLaminas('direccion_visual', ctxLaminas()).task)
  })
  it('🔴 con perfil: aparece una sola vez, después del brief, en la pieza de la cafetería y en las láminas del proveedor', () => {
    const t = construirTarea('texto', ctxPieza({ estado: 'vigente', texto: PERFIL_CAFE, fecha_de_corte: null, ficha_id: null })).task
    expect(t.split(ENCABEZADO_DEL_PERFIL)).toHaveLength(2)
    expect(t.indexOf(ENCABEZADO_DEL_PERFIL)).toBeGreaterThan(t.indexOf('brief del post'))
    expect(t).toContain('me pilla de camino al curro')
    const l = construirTareaLaminas('direccion_visual', ctxLaminas({ estado: 'vigente', texto: PERFIL_B2B, fecha_de_corte: null, ficha_id: null })).task
    expect(l.split(ENCABEZADO_DEL_PERFIL)).toHaveLength(2)
    expect(l).toContain('que no se me pare la línea')
    expect(l).not.toContain('me pilla de camino') // el perfil de la otra clienta no viaja
  })
  it('si el perfil no se pudo leer, la tarea lo dice y pide no atribuir frases al público', () => {
    expect(construirTarea('texto', ctxPieza({ estado: 'no_se_pudo_leer', detalle: 'x' })).task).toContain(SIN_PERFIL_LEIDO)
  })
})

// ─────────────────────────────────────────────────────────── el chequeo
describe('chequeo «frase del público sin fuente» (aviso, nunca bloqueo)', () => {
  it('🔴 la frase atribuida al público que SÍ está en el perfil no se marca; la inventada sí, con su motivo', () => {
    expect(frasesDelPublicoSinFuente('Como dicen los vecinos: «un café con leche y una tostada, como siempre».', PERFIL_CAFE)).toEqual([])
    expect(frasesDelPublicoSinFuente('Como dicen en el barrio, «el mejor café del mundo».', PERFIL_CAFE)).toEqual([{ frase: 'el mejor café del mundo', motivo: 'se la atribuye al público y no está textual en el perfil del público' }])
    expect(frasesDelPublicoSinFuente('Lo que dicen los jefes de planta: «parar es perder plata».', PERFIL_B2B)).toHaveLength(1)
    expect(frasesDelPublicoSinFuente('Nuestros clientes dicen “que no se me pare la línea”.', PERFIL_B2B)).toEqual([])
  })
  it('🔴 sin perfil vigente, toda frase atribuida al público es «sin fuente»', () => {
    expect(frasesDelPublicoSinFuente('La gente dice «me pilla de camino al curro».', null)).toEqual([{ frase: 'me pilla de camino al curro', motivo: 'se la atribuye al público y no hay perfil del público vigente que la respalde' }])
  })
  it('🔴 no se pasa de listo: una cita sin atribución al público (un eslogan de la marca) no se marca; tampoco una palabra suelta', () => {
    expect(frasesDelPublicoSinFuente('Nuestro lema: «el café que te espera».', null)).toEqual([])
    expect(frasesDelPublicoSinFuente('Como dicen, «sí».', null)).toEqual([])
  })
  it('límite conocido (escrito en el diseño): un modismo sin comillas pasa', () => {
    expect(frasesDelPublicoSinFuente('Como dicen por aquí, está de lujo.', null)).toEqual([])
  })
  it('la frase no tiene que coincidir en tildes, mayúsculas ni signos; sí en palabras completas', () => {
    expect(frasesDelPublicoSinFuente('Como dicen: «QUE NO SE ME PARE LA LINEA!»', PERFIL_B2B)).toEqual([])
    expect(frasesDelPublicoSinFuente('Como dicen: «que no se me pare la lin»', PERFIL_B2B)).toHaveLength(1)
  })
})

const FUENTES_CHEQUEO: FuentesDelCliente = { palabras_prohibidas: [], telefonos: [], handles: [], precios: [], competidores: [], registro: 'tuteo', telefonos_verificables: false, handles_verificables: false }
const post = (pie: string) => ({ pieza: { pie_de_foto: pie, hashtags: [] }, limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false } })

describe('el chequeo entra en los chequeos duros del post', () => {
  it('🔴 con el perfil leído: la frase inventada da UNA sugerencia (nunca bloquea); la del perfil, nada', () => {
    const malo = chequeosDePost({ ...post('Como dicen los vecinos, «el mejor café del mundo».'), fuentes: { ...FUENTES_CHEQUEO, perfil_del_publico_texto: PERFIL_CAFE } }).filter((x) => /frase del público/.test(x.que ?? ''))
    expect(malo).toHaveLength(1)
    expect(malo[0]).toMatchObject({ gravedad: 'sugerencia', donde: 'texto', origen: 'chequeo' })
    expect(chequeosDePost({ ...post('Como dicen los vecinos, «me pilla de camino al curro».'), fuentes: { ...FUENTES_CHEQUEO, perfil_del_publico_texto: PERFIL_CAFE } }).filter((x) => /frase del público/.test(x.que ?? ''))).toEqual([])
  })
  it('también mira el llamado', () => {
    const c = chequeosDePost({ pieza: { pie_de_foto: 'Hola', hashtags: [], llamado: 'Como dice la gente, «ven ya mismo»' }, limites: post('').limites, fuentes: { ...FUENTES_CHEQUEO, perfil_del_publico_texto: null } })
    expect(c.filter((x) => /frase del público/.test(x.que ?? ''))).toHaveLength(1)
  })
  it('sin el campo (quien no pidió el perfil), el chequeo no corre: los chequeos de siempre quedan iguales', () => {
    expect(chequeosDePost({ ...post('Como dicen los vecinos, «el mejor café del mundo».'), fuentes: FUENTES_CHEQUEO }).filter((x) => /frase del público/.test(x.que ?? ''))).toEqual([])
  })
})

