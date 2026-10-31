/**
 * LOS MÉTODOS COMO CAPA LOCAL (FIRMA de Emilio · 31-oct 20:01Z) · CC#1 · certifica CC#3 (condiciones: idioma del manual · sin dependencias del repositorio · commit fijado).
 *  · calendario: con la gran idea la tarea trae el MÉTODO de colocación; sin gran idea la tarea es la de hoy, byte a byte; `cadena_config.metodos.calendario` lo apaga (false) o lo reemplaza (texto); si la configuración no se puede leer, va el de omisión;
 *  · gancho: la tarea de `marketing_short_video_editing_coach` trae las 4 puertas, las familias con nombre, el texto en pantalla, el aviso sintético, la regla de referencias y UNA voz; el esquema `gancho_video.v1` es válido;
 *  · los dos textos: sin memoria/registro/ECHO/SHIP/trend-spotter/hash/publicar, sin fijar idioma ni trato, con la procedencia fijada al commit.
 * US$ 0, sin modelo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validarEsquemaDeSalida } from '@/lib/salida-estructurada'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { REFERENCIA_DEL_BRIEF_CREATIVO } from '../brief-creativo'
import { AGENTE_POR_PASO } from '../constantes'
import { leerConcepto } from '../conceptos'
import { ESQUEMA_GANCHO_DE_VIDEO, ESQUEMAS } from '../esquemas'
import { tareaDeCalendario } from '../indicaciones'
import { calendarioPreparar } from '../index'
import { briefAbrir, conceptoAbrir, conceptoDecidir, marcoDelBrief, recibirBrief, recibirConcepto } from '../mesas'
import {
  AGENTE_GANCHO_DE_VIDEO, AUTOCONTROL_PENDIENTE, CLAVE_DE_METODOS, DIAS_DE_REVISION_DE_FICHA, FAMILIAS_DE_GANCHO, fichaDeRed, fichasEnTexto, GUIA_NO_FORMATO, leerFichasPorRed,
  LISTA_DE_CONTROL_DEL_PLAN, METODO_BRIEF_POR_OMISION, METODO_CALENDARIO_POR_OMISION, METODO_FICHAS_POR_RED_POR_OMISION, METODO_GANCHO_POR_OMISION, METODO_MERCADO_POR_OMISION,
  METODO_PIEZA_POR_OMISION, METODO_POR_AGENTE, metodoDe, metodoDeAsiento, metodoDeCalendario, metodoDeGancho, METODOS_ORIGEN, METODOS_ORIGEN_COREY, METODOS_POR_OMISION, metodoSegunConfig,
  PUERTAS_DE_RETENCION, RUTAS_FIRMA_2, tareaDeGanchoDeVideo, type ClaveDeMetodo,
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

// ───────────────────────────────────────────────────────── FIRMA 2 (31-oct 20:29Z) · brief · mercado · pieza · fichas por red · plan (lista de control) · GUÍA, no formato

const FIRMA_2: Array<[ClaveDeMetodo, string, string]> = [
  ['brief', METODO_BRIEF_POR_OMISION, 'message-house-builder'],
  ['mercado', METODO_MERCADO_POR_OMISION, 'audience-belief-mapper'],
  ['pieza', METODO_PIEZA_POR_OMISION, 'social-creative-builder'],
  ['fichas_por_red', METODO_FICHAS_POR_RED_POR_OMISION, 'platform-norm-profiler'],
]

describe('firma 2 · procedencia, limpieza y la regla común «guía, no formato»', () => {
  it('🔴 los cuatro de aaron citan el MISMO commit fijado y su ruta existe; el de Corey cita su commit (40 hex), fecha y MIT', () => {
    for (const [clave, t, nombre] of FIRMA_2) {
      expect(t).toContain(`# MÉTODO (capa local · ${nombre} · ${METODOS_ORIGEN.repositorio} @ ${METODOS_ORIGEN.commit.slice(0, 7)} · Apache-2.0)`)
      expect(RUTAS_FIRMA_2[clave as keyof typeof RUTAS_FIRMA_2]).toMatch(new RegExp(`${nombre}/SKILL\\.md$`))
    }
    expect(METODOS_ORIGEN_COREY.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(METODOS_ORIGEN_COREY.commit).toBe('88c79f6528a9347420e57ceb1fff9a60de651768')
    expect(METODOS_ORIGEN_COREY).toMatchObject({ repositorio: 'coreyhaines31/marketingskills', fecha: '2026-10-30T23:28:36Z', licencia: 'MIT', rutas: { plan: 'skills/marketing-plan/SKILL.md' } })
    expect(LISTA_DE_CONTROL_DEL_PLAN).toContain(`marketing-plan (lista de control) · ${METODOS_ORIGEN_COREY.repositorio} @ 88c79f6 · MIT)`)
  })
  it('🔴 los siete textos: sin dependencias del repositorio de origen, sin fijar idioma ni trato, sin voseo; los cinco nuevos traen la regla «GUÍA, no formato»', () => {
    for (const t of Object.values(METODOS_POR_OMISION)) {
      expect(t).not.toMatch(DEPENDENCIAS_DEL_REPOSITORIO)
      expect(t).not.toMatch(FIJA_IDIOMA_O_TRATO)
      expect(t).not.toMatch(/\bvos\b|\bten[eé]s\b|\bsab[eé]s\b/i)
      expect(t).not.toMatch(/claims.ledger|AARRR|SaaS|software/i) // ni el libro de afirmaciones del original ni el vocabulario de software de Corey
    }
    expect(GUIA_NO_FORMATO).toMatch(/GUÍA, no formato obligatorio/)
    for (const [, t] of FIRMA_2) expect(t).toContain(GUIA_NO_FORMATO)
    expect(LISTA_DE_CONTROL_DEL_PLAN).toMatch(/Lista de control, no formato/)
  })
  it('🔴 una dimensión por agente (F5): siete empleados, siete métodos distintos, y nadie recibe dos; un empleado sin método recibe null', () => {
    expect(Object.keys(METODO_POR_AGENTE).sort()).toEqual(['campaign-brief-agent', 'content-creator', 'jefe-marketing', 'market_research_analyst', 'marketing_instagram_curator', 'marketing_short_video_editing_coach', 'social-media-strategist'])
    expect(new Set(Object.values(METODO_POR_AGENTE)).size).toBe(7)
    expect(Object.keys(METODOS_POR_OMISION).sort()).toEqual([...new Set(Object.values(METODO_POR_AGENTE))].sort())
    expect(metodoDeAsiento('content-creator', undefined)).toBe(METODO_PIEZA_POR_OMISION)
    expect(metodoDeAsiento('content-creator', { pieza: false })).toBeNull()
    expect(metodoDeAsiento('content-creator', { pieza: 'otro' })).toBe('otro')
    expect(metodoDeAsiento('content-creator', { calendario: false })).toBe(METODO_PIEZA_POR_OMISION) // la llave de otro no lo apaga
    expect(metodoDeAsiento('jefe-marketing', {})).toBe(LISTA_DE_CONTROL_DEL_PLAN)
    expect(metodoDeAsiento('qa-reviewer-A', {})).toBeNull()
  })
  it('metodoDe lee `cadena_config.metodos` por llave; si la lectura LANZA, va el de omisión', async () => {
    const al = new AlmacenMemoria({ config: { [CLAVE_DE_METODOS]: { brief: false, mercado: 'x' } } })
    expect(await metodoDe(al, 'brief')).toBeNull()
    expect(await metodoDe(al, 'mercado')).toBe('x')
    expect(await metodoDe(al, 'pieza')).toBe(METODO_PIEZA_POR_OMISION)
    al.leerConfig = async () => { throw new Error('base caída') }
    expect(await metodoDe(al, 'brief')).toBe(METODO_BRIEF_POR_OMISION)
  })
  it('content-humanizer (punto 7) NO está construido: queda documentado como pendiente de la verificación de CC#3', () => {
    expect(AUTOCONTROL_PENDIENTE.metodo).toBe('content-humanizer')
    expect(AUTOCONTROL_PENDIENTE.estado).toMatch(/pendiente de verificación de CC#3/)
    expect(Object.keys(METODOS_POR_OMISION)).not.toContain('autocontrol')
  })
})

describe('firma 2 · lo que dice cada método (lo que la firma pide)', () => {
  it('brief: casa del mensaje (techo + tres pilares con prueba), silla vacía, números con referencia, ángulos por red, lo sin fuente va a Faltantes', () => {
    const m = METODO_BRIEF_POR_OMISION
    expect(m).toMatch(/TECHO .* TRES PILARES/)
    expect(m).toMatch(/Cada pilar lleva su PRUEBA/)
    expect(m).toMatch(/silla vacía/)
    expect(m).toMatch(/Números antes que adjetivos, pero solo números con referencia/)
    expect(m).toMatch(/Ángulos por red, no copia/)
    expect(m).toMatch(/«\[sin fuente\]» en «Faltantes»/)
  })
  it('mercado: público del plan (nunca «todos»), creencias + objeciones + cuatro fuerzas, palabras literales, señal = fuente y fecha, «sin dato» en vez de estimar', () => {
    const m = METODO_MERCADO_POR_OMISION
    expect(m).toMatch(/nunca «todos»/)
    expect(m).toMatch(/CREENCIAS/)
    expect(m).toMatch(/OBJECIONES/)
    expect(m).toMatch(/CUATRO FUERZAS .*empuje.*atracción.*ansiedad.*hábito/)
    expect(m).toMatch(/palabras literales del público/)
    expect(m).toMatch(/escribe «sin dato» y qué habría que mirar; no estimes/)
    expect(m).toMatch(/NO analices|competidor/) // no se mete en competencia: solo marca lo sin fuente
  })
  // FIRMA 5 de Emilio (31-oct 21:09Z): lo perdido del Trend Researcher que aplica a marketing digital, como capa local (identidad intacta)
  it('🔴 mercado · FIRMA 5: proceso con triangulación, fuentes con credibilidad y sesgo, métodos cualitativos (sin encuestas ni patentes), necesidades no cubiertas y barreras, escenarios con probabilidad, mapa con espacios en blanco en dos páginas, URGENTE', () => {
    const m = METODO_MERCADO_POR_OMISION
    expect(m).toContain('# MÉTODO (capa local · product-trend-researcher (proceso, sin producto)')
    expect(m).toMatch(/recolectar .*→ .*patrones y anomalías → .*contexto .*→ .*impacto → VALIDAR por triangulación → pronosticar con intervalo → /)
    expect(m).toMatch(/CREDIBILIDAD .*oficial .*prensa .*gremio .*foro .*red social/)
    expect(m).toMatch(/SESGO declarado/)
    expect(m).toMatch(/al menos dos fuentes independientes/)
    expect(m).toMatch(/análisis de contenido .*monitoreo de medios con detección de sesgo/)
    expect(m).toMatch(/Nada de encuestas, patentes ni flujos de inversión/)
    expect(m).toMatch(/necesidades no cubiertas y barreras de adopción/)
    expect(m).toMatch(/dos o tres escenarios con su probabilidad/)
    expect(m).toMatch(/MAPA DEL MERCADO .*ESPACIOS EN BLANCO/)
    expect(m).toMatch(/sin analizar competidores uno por uno/)
    expect(m).toMatch(/cabe en dos páginas/)
    expect(m).toMatch(/«URGENTE»/)
    // sigue siendo una capa local: el de creencias queda intacto delante y la procedencia es la misma (commit fijado)
    expect(m.indexOf('audience-belief-mapper')).toBeLessThan(m.indexOf('product-trend-researcher'))
    expect(m).not.toMatch(FIJA_IDIOMA_O_TRATO)
    expect(m).not.toMatch(DEPENDENCIAS_DEL_REPOSITORIO)
  })
  it('pieza: nativa por red (nunca copia), gancho de taxonomía cumplido por el cuerpo, enlace según la ficha, carrusel con roles/≈70 %/alt, lista negativa, promesas con referencia', () => {
    const m = METODO_PIEZA_POR_OMISION
    expect(m).toMatch(/nunca pegues el mismo texto en dos redes/)
    expect(m).toMatch(/pregunta · a contracorriente · cifra · historia · brecha de curiosidad · prueba · punto de vista/)
    expect(m).toMatch(/una brecha de curiosidad que el cuerpo no cierra es un defecto/)
    expect(m).toMatch(/El enlace va donde la ficha de la red diga/)
    expect(m).toMatch(/≈ 70 % del máximo de la red \(supuesto de partida/)
    expect(m).toMatch(/UNA línea de texto alternativo por lámina/)
    expect(m).toMatch(/nada de mecánicas de cebo/)
    expect(m).toMatch(/Promesas y datos solo con referencia/)
  })
  it('fichas por red: ficha = dato por red, filas DOCUMENTADA/FOLCLORE con fuente, fechas de verificación y revisión (90 días), vencida = no se confía, folclore nunca es regla', () => {
    const m = METODO_FICHAS_POR_RED_POR_OMISION
    expect(m).toMatch(/Una FICHA por red, como dato/)
    expect(m).toMatch(/DOCUMENTADA .* o FOLCLORE/)
    expect(m).toMatch(/El folclore nunca es regla/)
    expect(m).toContain(`${DIAS_DE_REVISION_DE_FICHA} días por omisión`)
    expect(m).toMatch(/VENCIDA: se marca y no se confía hasta re-verificarla/)
  })
  it('plan (SOLO lista de control): las superficies en lenguaje de cualquier negocio, hoja de ruta por semanas con fechas y meta por semana, lo que NO se hace, señales de plan genérico; no manda formato', () => {
    const m = LISTA_DE_CONTROL_DEL_PLAN
    for (const s of ['Resumen ejecutivo', 'Marco estratégico', 'Estado actual', 'Cómo nos conocen (adquisición)', 'Primera experiencia (activación)', 'Vuelven (retención)', 'Recomiendan (referidos)', 'Ingresos', 'Hoja de ruta de 90 días por semanas con fechas', 'Más allá de los 90 días', 'Herramientas y canales', 'Lo que NO se hace y por qué', 'Medición y decisiones abiertas', 'Señales de plan genérico']) {
      expect(m, s).toContain(s)
    }
    expect(m).toMatch(/la meta por semana que lo mide/) // encaja con el validador de forma (meta por semana)
    expect(m).toMatch(/No agregues secciones por cumplir/)
    expect(m).not.toMatch(/##|plantilla|template/i)
  })
})

describe('firma 2 · cableado propio · el brief creativo lleva la casa del mensaje como guía', () => {
  const A = clienteA()
  const AHORA = '2026-10-09T12:00:00Z'
  const CAMP = 'camp-m'
  const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP }
  function almacen(config: Record<string, unknown> = {}) {
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: contextoDe(A) },
      planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] }, ...config },
      journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const campana: Campana = {
      id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
      estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
    }
    const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
    al.campanas.push(campana)
    al.estrategias.push(estrategia)
    return al
  }
  const base = { ctx: contextoDe(A), estrategia: A.estrategia, version: 1, devolucion: null, nota: null }

  it('🔴 marcoDelBrief: sin método es el de hoy byte a byte; con método lo pega como GUÍA para la dirección del brief, después de la referencia y antes del plan', () => {
    const hoy = marcoDelBrief(base)
    expect(marcoDelBrief({ ...base, metodo: null })).toBe(hoy)
    expect(marcoDelBrief({ ...base, metodo: undefined })).toBe(hoy)
    expect(hoy).not.toContain('# MÉTODO')
    const con = marcoDelBrief({ ...base, metodo: METODO_BRIEF_POR_OMISION })
    expect(con).toContain('# GUÍA PARA LA DIRECCIÓN DEL BRIEF (campaign-brief-agent · no es formato)')
    expect(con).toContain('# MÉTODO (capa local · message-house-builder')
    expect(con.indexOf(REFERENCIA_DEL_BRIEF_CREATIVO)).toBeLessThan(con.indexOf('# GUÍA PARA LA DIRECCIÓN'))
    expect(con.indexOf('# GUÍA PARA LA DIRECCIÓN')).toBeLessThan(con.indexOf('# PLAN'))
    // la referencia (el formato del brief) sigue intacta: el método no la cambia
    expect(con).toContain(REFERENCIA_DEL_BRIEF_CREATIVO)
  })
  it('🔴 briefAbrir pega el método de omisión; `cadena_config.metodos.brief = false` lo apaga; un texto lo reemplaza', async () => {
    const con = await briefAbrir(almacen(), wf, AHORA)
    expect(con.status, JSON.stringify(con.cuerpo)).toBe(200)
    expect((con.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('# MÉTODO (capa local · message-house-builder')
    const sin = await briefAbrir(almacen({ [CLAVE_DE_METODOS]: { brief: false } }), wf, AHORA)
    expect((sin.cuerpo.sobre as { marco_texto: string }).marco_texto).not.toContain('# MÉTODO')
    const otro = await briefAbrir(almacen({ [CLAVE_DE_METODOS]: { brief: 'mi casa del mensaje' } }), wf, AHORA)
    expect((otro.cuerpo.sobre as { marco_texto: string }).marco_texto).toContain('# GUÍA PARA LA DIRECCIÓN DEL BRIEF (campaign-brief-agent · no es formato)\nmi casa del mensaje')
  })
})

describe('firma 2 · la lista de control del plan es DATO (migración 202610312006, en copia hasta T9)', () => {
  const lf = (s: string) => s.replace(/\r\n/g, '\n')
  const sql = lf(readFileSync(join(process.cwd(), 'supabase/migrations/202610312006_cadena_config_planeacion_lista_de_control.sql'), 'utf8'))
  const reversa = lf(readFileSync(join(process.cwd(), 'supabase/reversas/202610312006_cadena_config_planeacion_lista_de_control_REVERSA.sql'), 'utf8'))
  it('🔴 siembra `cadena_config.planeacion.lista_de_control` con el MISMO texto que la constante, sin pisar una lista ya puesta, exigiendo la fila de 202610312001', () => {
    expect(sql).toContain(`to_jsonb($lista$${LISTA_DE_CONTROL_DEL_PLAN}$lista$::text)`)
    expect(sql).toMatch(/jsonb_set\(\s*valor,\s*'\{lista_de_control\}'/)
    expect(sql).toMatch(/AND NOT \(valor \? 'lista_de_control'\)/)
    expect(sql).toMatch(/aplica primero 202610312001/)
    expect(sql).toMatch(/NO APLICADA/)
  })
  it('la reversa quita SOLO la clave `lista_de_control` (redactor e indicacion quedan)', () => {
    expect(reversa).toMatch(/valor - 'lista_de_control'/)
    expect(reversa).not.toMatch(/'redactor'|'indicacion'/)
    expect(reversa).toMatch(/NO APLICADA/)
  })
})

describe('firma 2 · fichas por red como dato que caduca', () => {
  const fichas = {
    instagram: { verificada_en: '2026-10-01', revisar_antes_de: '2026-12-30', filas: [
      { dato: 'pie de foto', valor: '2.200 caracteres', tipo: 'documentada', fuente: 'help.instagram.com', verificada_en: '2026-10-01' },
      { dato: 'mejor hora', valor: 'mañana', tipo: 'folclore', fuente: 'blog X', verificada_en: '2026-10-01' },
      { dato: 'raro', valor: 'x', tipo: 'inventado', fuente: '', verificada_en: '' },
    ] },
    linkedin: { verificada_en: '2026-06-01', revisar_antes_de: '2026-08-30', filas: [{ dato: 'enlace', valor: 'primer comentario', tipo: 'folclore', fuente: 'folclore de LinkedIn', verificada_en: '2026-06-01' }] },
    tiktok: { verificada_en: 'ayer', revisar_antes_de: '2026-12-30', filas: [] },
    youtube: 'no es una ficha',
    // menor 2 de CC3 (X12): con fechas pero SIN `filas` no es una ficha (se descarta por forma, no se inventa una vacía)
    threads: { verificada_en: '2026-10-01', revisar_antes_de: '2026-12-30' },
  }
  it('🔴 leerFichasPorRed ignora lo que no tiene forma (fecha ilegible, texto suelto, sin filas) y las filas con tipo desconocido; fichaDeRed marca la VENCIDA', () => {
    const f = leerFichasPorRed(fichas)
    expect(f.map((x) => x.red)).toEqual(['instagram', 'linkedin'])
    expect(f[0].filas.map((x) => x.tipo)).toEqual(['documentada', 'folclore'])
    expect(fichaDeRed(f, 'Instagram', '2026-10-31')).toMatchObject({ vencida: false })
    expect(fichaDeRed(f, 'linkedin', '2026-10-31')).toMatchObject({ vencida: true })
    expect(fichaDeRed(f, 'linkedin', '2026-08-29')).toMatchObject({ vencida: false })
    // menor 3 de CC3 (X08): el borde es el MISMO día de `revisar_antes_de`: ese día ya está vencida («revisar antes de»)
    expect(fichaDeRed(f, 'linkedin', '2026-08-30')).toMatchObject({ vencida: true })
    expect(fichaDeRed(f, 'linkedin', '2026-08-29T23:59:59Z')).toMatchObject({ vencida: false })
    expect(fichaDeRed(f, 'tiktok', '2026-10-31')).toBeNull()
    expect(fichaDeRed(f, 'threads', '2026-10-31')).toBeNull()
    for (const c of [null, 'x', [], 42]) expect(leerFichasPorRed(c)).toEqual([])
  })
  it('fichasEnTexto: cada fila con su tipo y fuente; la vencida lleva la marca; la red sin ficha se declara (no se inventa)', () => {
    const t = fichasEnTexto(leerFichasPorRed(fichas), ['instagram', 'linkedin', 'tiktok'], '2026-10-31')
    expect(t).toContain('## instagram · verificada 2026-10-01 · revisar antes de 2026-12-30\n- pie de foto: 2.200 caracteres [documentada · help.instagram.com · 2026-10-01]')
    expect(t).toContain('- mejor hora: mañana [folclore · blog X · 2026-10-01]')
    expect(t).toContain('## linkedin · verificada 2026-06-01 · revisar antes de 2026-08-30 · VENCIDA: no confiar hasta re-verificar')
    expect(t).toContain('## tiktok · SIN FICHA (no inventes la norma; usa lo conservador y dilo)')
    expect(t).not.toContain('raro')
  })
})

describe('reserva de CC3 (certificación firma 1+2) · el pegado del método del calendario en `calendarioPreparar` (pasos.ts)', () => {
  const A = clienteA()
  const AHORA = '2026-10-09T12:00:00Z'
  const CAMP = 'camp-cal'
  const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
  const MARCA = '# MÉTODO (capa local · social-calendar-builder'
  function almacen(palanca: boolean, config: Record<string, unknown> = {}) {
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: contextoDe(A) },
      planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: palanca ? [A.clientId] : [] }, ...config },
      journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const campana: Campana = {
      id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
      estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
    }
    const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
    al.campanas.push(campana)
    al.estrategias.push(estrategia)
    return al
  }
  const BRIEF = [
    '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
    '## Insight', 'La gente del barrio desayuna de pie.', '## Mensaje', 'Hay mesa desde las siete.',
    '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
    '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: pan de masa madre', '- prohibido: barato; gratis', '- lo que no se dice: precios',
    '## Faltantes', '- público: el manual no dice edades', '## Contradicciones plan vs manual', '- ninguna',
  ].join('\n')
  const GRAN_IDEA = [
    '## Gran idea  La mesa larga · Noventa días para sentarse juntos', '## Por qué funciona  El insight dice que la gente desayuna de pie.',
    '## Cómo se ve  Luz cálida.', '## Cómo suena  Voz cercana.',
    '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
    '## Banco de ideas',
    '- C1-I01 · instagram · foto · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
    '- C1-I02 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  ].join('\n')
  const entrega = (version: number, texto: string) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })
  async function conGranIdeaAprobada(al: AlmacenMemoria) {
    expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
    expect(await recibirBrief(al, entrega(1, BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200)
    expect(await recibirConcepto(al, entrega(1, GRAN_IDEA), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).status).toBe(200)
    return al
  }
  const tareaDe = async (al: AlmacenMemoria) => {
    const p = await calendarioPreparar(al, { ...wf(), tanda: 1 }, AHORA)
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200)
    expect(p.cuerpo.accion).toBeUndefined()
    return (p.cuerpo.run_sdk as { task: string }).task
  }

  it('🔴 con la gran idea aprobada, el pedido del calendario lleva el MÉTODO de colocación (el de omisión, con su procedencia)', async () => {
    const t = await tareaDe(await conGranIdeaAprobada(almacen(true)))
    expect(t).toContain(MARCA)
    expect(t).toContain(METODO_CALENDARIO_POR_OMISION)
    expect(t).toContain('# GRAN IDEA (concepto aprobado · versión 1)')
  })
  it('🔴 sin gran idea (palanca apagada = la cadena de hoy) el pedido NO lleva método y el método NI SE LEE de la configuración; con palanca y sin gran idea, la tanda espera (no hay pedido)', async () => {
    const sinIdea = almacen(false)
    const lecturas: string[] = []
    const leerConfig = sinIdea.leerConfig.bind(sinIdea)
    sinIdea.leerConfig = async (k: string) => { lecturas.push(k); return leerConfig(k) }
    expect(await tareaDe(sinIdea)).not.toContain('# MÉTODO')
    // menor de CC3 (X16): pegar «siempre» sería equivalente en la salida (tareaDeCalendario lo descarta sin concepto), pero NO en las lecturas: sin gran idea no se consulta `metodos`
    expect(lecturas).not.toContain(CLAVE_DE_METODOS)
    const p = await calendarioPreparar(almacen(true), { ...wf(), tanda: 1 }, AHORA)
    expect(p.status).toBe(200)
    expect(p.cuerpo.accion).toBe('esperar_concepto')
    expect(p.cuerpo.run_sdk).toBeUndefined()
  })
  it('🔴 `cadena_config.metodos.calendario = false` lo apaga aunque haya gran idea; un texto lo reemplaza', async () => {
    const sin = await tareaDe(await conGranIdeaAprobada(almacen(true, { [CLAVE_DE_METODOS]: { calendario: false } })))
    expect(sin).not.toContain('# MÉTODO')
    expect(sin).toContain('# GRAN IDEA (concepto aprobado · versión 1)')
    const otro = await tareaDe(await conGranIdeaAprobada(almacen(true, { [CLAVE_DE_METODOS]: { calendario: 'coloca lo fuerte el lunes' } })))
    expect(otro).toContain('coloca lo fuerte el lunes')
    expect(otro).not.toContain(MARCA)
  })
})
