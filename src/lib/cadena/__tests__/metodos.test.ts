/**
 * LOS MÉTODOS COMO CAPA LOCAL (FIRMA de Emilio · 31-oct 20:01Z) · CC#1 · certifica CC#3 (condiciones: idioma del manual · sin dependencias del repositorio · commit fijado).
 *  · calendario: con la gran idea la tarea trae el MÉTODO de colocación; sin gran idea la tarea es la de hoy, byte a byte; `cadena_config.metodos.calendario` lo apaga (false) o lo reemplaza (texto); si la configuración no se puede leer, va el de omisión;
 *  · gancho: la tarea de `marketing_short_video_editing_coach` trae las 4 puertas, las familias con nombre, el texto en pantalla, el aviso sintético, la regla de referencias y UNA voz; el esquema `gancho_video.v1` es válido;
 *  · los dos textos: sin memoria/registro/ECHO/SHIP/trend-spotter/hash/publicar, sin fijar idioma ni trato, con la procedencia fijada al commit.
 * US$ 0, sin modelo.
 */
import { describe, expect, it } from 'vitest'
import { validarEsquemaDeSalida } from '@/lib/salida-estructurada'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { AGENTE_POR_PASO } from '../constantes'
import { leerConcepto } from '../conceptos'
import { ESQUEMA_GANCHO_DE_VIDEO, ESQUEMAS } from '../esquemas'
import { tareaDeCalendario } from '../indicaciones'
import {
  AGENTE_GANCHO_DE_VIDEO, CLAVE_DE_METODOS, FAMILIAS_DE_GANCHO, METODO_CALENDARIO_POR_OMISION, METODO_GANCHO_POR_OMISION, METODOS_ORIGEN, metodoDeCalendario, metodoDeGancho, metodoSegunConfig,
  PUERTAS_DE_RETENCION, tareaDeGanchoDeVideo,
} from '../metodos'

const A = clienteA()
const CONCEPTO = leerConcepto([
  '## Gran idea  La mesa larga · Noventa días', '## Cómo se ve  Luz.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: se abre', '## Banco de ideas',
  '- C1-I01 · instagram · reel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
].join('\n'), { fases: [{ clave: 'f1', semanas: 13 }], redes: [{ red: 'instagram', huecos_por_semana: 1 }], prohibidas: [], fotos: [] })
const base = { ctx: contextoDe(A), estrategia: A.estrategia, tanda: 1, semanas: [1, 2, 3, 4], filasPrevias: [] }

/** lo que NO puede quedar de los métodos originales (sus dependencias) */
const DEPENDENCIAS_DEL_REPOSITORIO = /memory\/|channel-registry|registry-events|\bECHO\b|SHIP\b|social-quality-auditor|trend-spotter|\bhash\b|package_ref|publish|queue|ndjson|hot-cache|open-loops|NEEDS_INPUT|voice.card|norm card/i
/** lo que NO puede hacer un método: fijar idioma o trato (eso lo dice el manual del cliente vía `reglaDeRegistro`/`reglaDeIdioma`) */
const FIJA_IDIOMA_O_TRATO = /\b(tuteo|voseo|vosea|tutea|trata de usted|en español|in english|en inglés)\b/i

describe('procedencia y limpieza de los dos métodos', () => {
  it('🔴 el commit está fijado (40 hex), con fecha, licencia y rutas; y los dos textos lo citan', () => {
    expect(METODOS_ORIGEN.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(METODOS_ORIGEN.commit).toBe('6391e62ddbba2a096b52605c93529e733d018b3b')
    expect(METODOS_ORIGEN.licencia).toBe('Apache-2.0')
    expect(METODOS_ORIGEN.fecha).toBe('2026-10-31T16:42:01Z')
    for (const t of [METODO_CALENDARIO_POR_OMISION, METODO_GANCHO_POR_OMISION]) {
      expect(t).toContain(`${METODOS_ORIGEN.repositorio} @ ${METODOS_ORIGEN.commit.slice(0, 7)}`)
      expect(t).toContain('Apache-2.0')
    }
  })
  it('🔴 sin dependencias del repositorio de origen y sin fijar idioma ni trato', () => {
    for (const t of [METODO_CALENDARIO_POR_OMISION, METODO_GANCHO_POR_OMISION]) {
      expect(t).not.toMatch(DEPENDENCIAS_DEL_REPOSITORIO)
      expect(t).not.toMatch(FIJA_IDIOMA_O_TRATO)
      expect(t).not.toMatch(/\bvos\b|\bten[eé]s\b|\bsab[eé]s\b/i) // sin voseo (el texto interno es español de Ecuador)
    }
  })
  it('las proporciones son supuestos de partida, no reglas ni promesas', () => {
    expect(METODO_CALENDARIO_POR_OMISION).toMatch(/supuesto de partida/)
    expect(METODO_CALENDARIO_POR_OMISION).toMatch(/no las escribas en ninguna pieza ni las presentes como promesa/)
    expect(METODO_GANCHO_POR_OMISION).toMatch(/No afirmes «duración ideal» ni «mejor hora»/)
  })
})

describe('calendario · el método se pega SOLO con la gran idea y se gobierna por configuración', () => {
  it('🔴 sin concepto la tarea es la de hoy byte a byte aunque venga `metodo`; con concepto trae el MÉTODO después del banco y antes de las reglas', () => {
    const sin = tareaDeCalendario(base)
    expect(tareaDeCalendario({ ...base, metodo: METODO_CALENDARIO_POR_OMISION })).toBe(sin)
    expect(sin).not.toContain('# MÉTODO')
    const con = tareaDeCalendario({ ...base, concepto: { leido: CONCEPTO, version: 1 }, metodo: METODO_CALENDARIO_POR_OMISION })
    expect(con).toContain('# MÉTODO (capa local · social-calendar-builder')
    expect(con.indexOf('# BANCO DE IDEAS DEL CAPÍTULO f1')).toBeLessThan(con.indexOf('# MÉTODO'))
    expect(con.indexOf('# MÉTODO')).toBeLessThan(con.indexOf('# Reglas'))
    // y el registro/idioma siguen viniendo de las reglas, no del método
    expect(con).toContain('- Escribe en tuteo (tú). Nada de voseo.')
    // con concepto pero sin método (apagado): las secciones de la gran idea y nada más
    const apagado = tareaDeCalendario({ ...base, concepto: { leido: CONCEPTO, version: 1 }, metodo: null })
    expect(apagado).toContain('# GRAN IDEA')
    expect(apagado).not.toContain('# MÉTODO')
  })
  it('🔴 el método dice lo que la firma pide: hueco por hueco desde el banco del capítulo, reparto por pilares, héroe/centro/ayuda, dar antes que pedir, cola = patrón, sin repetir, momentos = fechas verificadas', () => {
    const m = METODO_CALENDARIO_POR_OMISION
    expect(m).toMatch(/BANCO DEL CAPÍTULO de esa fase cuya red coincida/)
    expect(m).toMatch(/`idea_de_mesa`/)
    expect(m).toMatch(/porcentajes de los pilares/)
    expect(m).toMatch(/héroe \/ centro \/ ayuda/i)
    expect(m).toMatch(/Dar antes que pedir/)
    expect(m).toMatch(/no planifiques más piezas que las del patrón/)
    expect(m).toMatch(/OMÍTELO en `ajustes_al_patron`/)
    expect(m).toMatch(/una idea del banco se usa UNA vez por campaña/i)
    expect(m).toMatch(/FECHAS ESPECIALES verificadas por el código/)
    expect(m).toMatch(/aquí no se escribe la pieza ni el guion/)
  })
  it('metodoSegunConfig: ausente/true/objeto raro → el de omisión · false → null (apagado) · texto → el texto · texto vacío → el de omisión', () => {
    for (const c of [undefined, null, {}, { calendario: true }, { calendario: 42 }, { gancho: false }, 'x']) expect(metodoSegunConfig(c, 'calendario', 'POR_OMISION')).toBe('POR_OMISION')
    expect(metodoSegunConfig({ calendario: false }, 'calendario', 'POR_OMISION')).toBeNull()
    expect(metodoSegunConfig({ calendario: '  otro método  ' }, 'calendario', 'POR_OMISION')).toBe('otro método')
    expect(metodoSegunConfig({ calendario: '   ' }, 'calendario', 'POR_OMISION')).toBe('POR_OMISION')
    // cada método se gobierna por su propia llave
    expect(metodoSegunConfig({ calendario: false }, 'gancho', 'G')).toBe('G')
    expect(metodoSegunConfig({ gancho: false }, 'gancho', 'G')).toBeNull()
  })
  it('🔴 metodoDeCalendario/metodoDeGancho leen `cadena_config.metodos`; si la lectura LANZA, va el de omisión (el método no se apaga por una base caída)', async () => {
    const al = new AlmacenMemoria({ config: {} })
    expect(await metodoDeCalendario(al)).toBe(METODO_CALENDARIO_POR_OMISION)
    expect(await metodoDeGancho(al)).toBe(METODO_GANCHO_POR_OMISION)
    const apagado = new AlmacenMemoria({ config: { [CLAVE_DE_METODOS]: { calendario: false, gancho: 'mi gancho' } } })
    expect(await metodoDeCalendario(apagado)).toBeNull()
    expect(await metodoDeGancho(apagado)).toBe('mi gancho')
    const roto = new AlmacenMemoria({ config: {} })
    roto.leerConfig = async () => { throw new Error('base caída') }
    expect(await metodoDeCalendario(roto)).toBe(METODO_CALENDARIO_POR_OMISION)
    expect(await metodoDeGancho(roto)).toBe(METODO_GANCHO_POR_OMISION)
  })
  it('el agente del calendario sigue siendo social-media-strategist (la firma cambia su modelo como dato, migración 202610312005; no su identidad)', () => {
    expect(AGENTE_POR_PASO.calendario).toBe('social-media-strategist')
  })
})

describe('gancho de video corto · UNA voz, método short-video-scripter', () => {
  const pedido = {
    ctx: { registro: 'vos' as const, idioma: null },
    idea: CONCEPTO.banco[0],
    red: 'instagram', formato: 'reel', objetivo: 'guardar' as const, duracion_s: 20,
    gran_idea: 'La mesa larga · Noventa días',
    brief: '## Mensaje\nHay mesa desde las siete.\n## Tono\nCercano.',
    referencias: [{ id: 'R1', texto: 'Abre a las 07:00 de lunes a sábado' }],
    medios_sinteticos: false,
  }
  it('🔴 la voz es marketing_short_video_editing_coach y la tarea trae las 4 puertas, las 6 familias, texto en pantalla, aviso sintético, referencias y «una sola voz»', () => {
    expect(AGENTE_GANCHO_DE_VIDEO).toBe('marketing_short_video_editing_coach')
    expect(PUERTAS_DE_RETENCION).toEqual(['0-2s', '2-5s', '5-15s', 'cierre'])
    expect(FAMILIAS_DE_GANCHO).toHaveLength(6)
    const t = tareaDeGanchoDeVideo({ ...pedido, metodo: METODO_GANCHO_POR_OMISION })
    expect(t).toContain('# MÉTODO (capa local · short-video-scripter')
    expect(t).toMatch(/0–2 s GANCHO/)
    expect(t).toMatch(/2–5 s CONFIRMACIÓN/)
    expect(t).toMatch(/5–15 s ENTREGA/)
    expect(t).toMatch(/CIERRE: bucle/)
    for (const f of FAMILIAS_DE_GANCHO) expect(t).toContain(f)
    expect(t).toMatch(/texto en pantalla/i)
    expect(t).toMatch(/Aviso de contenido sintético/)
    expect(t).toContain('# MEDIOS SINTÉTICOS\nNO: el video se graba con medios reales.')
    expect(t).toContain('- R1: Abre a las 07:00 de lunes a sábado')
    expect(t).toMatch(/Una sola voz: el gancho es tuyo/)
    expect(t).toContain('- C1-I01 · instagram · reel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho de concepto: ¿quién se sentaba aquí?')
    expect(t).toContain('de unos 20 segundos, cuyo objetivo es que guarden el video')
  })
  it('🔴 idioma y trato: la tarea lleva el registro del cliente (voseo aquí) y el idioma de la ficha si lo hay; el método no los fija', () => {
    const t = tareaDeGanchoDeVideo({ ...pedido, metodo: METODO_GANCHO_POR_OMISION })
    expect(t).toContain('- Escribe en voseo (vos). Nada de tuteo.')
    expect(t).not.toContain('Idioma de todo lo que escribas')
    const en = tareaDeGanchoDeVideo({ ...pedido, ctx: { registro: 'sin_dato', idioma: 'english' }, metodo: METODO_GANCHO_POR_OMISION })
    expect(en).toContain('- Idioma de todo lo que escribas: english.')
    expect(en).toContain('no está fijado ni por su manual ni por su país')
    expect(METODO_GANCHO_POR_OMISION).not.toMatch(FIJA_IDIOMA_O_TRATO)
  })
  it('sin método (apagado) la tarea conserva las reglas y los insumos; la estrategia de la red entra como contexto, nunca como autoría; medios sintéticos SÍ se declara', () => {
    const t = tareaDeGanchoDeVideo({ ...pedido, metodo: null, medios_sinteticos: true, estrategia_de_red: 'TikTok: 3 cortes en los primeros 5 s.' })
    expect(t).not.toContain('# MÉTODO')
    expect(t).toContain('# Reglas')
    expect(t).toContain('# MEDIOS SINTÉTICOS\nSÍ: el video usará medios sintéticos realistas.')
    expect(t).toContain('# ESTRATEGIA DE LA RED (contexto · no es tuya la autoría del gancho)\nTikTok: 3 cortes en los primeros 5 s.')
    expect(tareaDeGanchoDeVideo({ ...pedido, referencias: [] })).toContain('(no hay referencias: no escribas datos concretos)')
  })
  it('🔴 el contrato `gancho_video.v1` es un esquema válido del modo estructurado y exige ganchos, elegido, tramos con ventana fija, cierre, aviso, datos y pendientes', () => {
    expect(ESQUEMAS['gancho_video.v1']).toBe(ESQUEMA_GANCHO_DE_VIDEO)
    const r = validarEsquemaDeSalida(ESQUEMA_GANCHO_DE_VIDEO)
    expect(r.ok, JSON.stringify(r)).toBe(true)
    expect(r.ok && r.hash).toBeTruthy()
    expect(ESQUEMA_GANCHO_DE_VIDEO.required).toEqual(['ganchos', 'elegido', 'por_que', 'tramos', 'cierre', 'aviso_sintetico', 'datos', 'pendientes'])
    expect((ESQUEMA_GANCHO_DE_VIDEO.properties.tramos as { items: { properties: { ventana: { enum: string[] } } } }).items.properties.ventana.enum).toEqual([...PUERTAS_DE_RETENCION])
  })
})
