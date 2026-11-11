/**
 * 11-nov · GO Lenovo 02:52Z · el reel de la W46 falló AL FINAL (después de US$ 2,40 de mesa) porque el brazo no pudo leer las tarifas: el proveedor cambió el texto de `/estimate`
 * (ahora cobra POR SEGUNDO). Se prueba, sin red y a US$ 0:
 *  1 · cotizar primero: la sala de video estima GRATIS al abrir; si no puede, falla en el primer paso a US$ 0 (recuperable) y la mesa no se llama;
 *  2 · el lector de tarifas sin frases fijas: lee el texto REAL del 11-nov (leído con la llave real, solo estimación) y los tres del 31-oct; la descripción viaja en el fallo;
 *  3 · la instrucción del guion pide empezar en «## Plano 1», sin frases de trabajo del agente.
 * Dos clientes de rubros distintos: un restaurante (reel de Instagram, con fotos propias) y una empresa B2B de seguridad industrial (short de YouTube, sin fotos).
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '@/lib/cadena/hoja'
import { leerBriefCreativo } from '@/lib/cadena/brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '@/lib/cadena/conceptos'
import type { FormatosPorRed } from '@/lib/cadena/tipos'
import { costoEstimadoUsd, leerTarifas } from '@/lib/video/higgsfield'
import { DURACION_MIN_S } from '@/lib/video/parametros'
import { crearPuertos } from '../adaptadores'
import { FRASE_SIN_NOTAS_DE_TRABAJO, armarTarea } from '../mesa/pedidos'
import type { EstadoMesa } from '../mesa/tipos'
import { abrirEncargo } from '../orquestador'
import { enviarVideo } from '../orquestador-video'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import type { CotizacionDeVideo, PuertoDeVideo } from '../puertos'
import { esFallidoRecuperable } from '../reapertura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { PROMPT_DE_COTIZACION, pedidosParaCotizar } from '../video/pedido'
import { DbFalsa } from './dbfalsa'
import { FOTOS, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

// los textos EXACTOS que devolvió /estimate el 11-nov a las 02:58Z (gratis, con la llave real; no se creó ningún pedido)
const DESC_11NOV_TEXTO = 'Standard self-serve rates in USD per video second: 480p: $0.1177; 720p: $0.2647; 1080p: $0.6518. Total price = selected rate × output duration in seconds.'
const DESC_11NOV_REFERENCIA = 'Standard self-serve rates in USD per second of generated video.\n\n- Without video input: 480p: $0.1177; 720p: $0.2647; 1080p: $0.6518.\n- With video input: 480p: $0.1387; 720p: $0.3264; 1080p: $0.7858.\n\nTotal price = selected rate × output duration in seconds. Input video duration is not added to the billed duration. Image or audio references alone use the rate without video input.'

describe('las tarifas del proveedor sin frases fijas', () => {
  it('🔴 el texto REAL del 11-nov (por segundo): 720p · 8 s = US$ 2,12; 15 s = US$ 3,97', () => {
    const t = leerTarifas(DESC_11NOV_TEXTO)!
    expect(t).toMatchObject({ unidad: 'segundo', por_mil_tokens: { '480p': 0.1177, '720p': 0.2647, '1080p': 0.6518 } })
    expect(costoEstimadoUsd(t, { resolucion: '720p', relacion: '9:16', segundos: 8 })).toBeCloseTo(2.1176, 4)
    expect(costoEstimadoUsd(t, { resolucion: '720p', relacion: '9:16', segundos: 15 })).toBeCloseTo(3.9705, 4)
    expect(costoEstimadoUsd(t, { resolucion: '1080p', relacion: '16:9', segundos: 10 })).toBeCloseTo(6.518, 4)
  })
  it('🔴 con video de entrada: el SEGUNDO precio de cada resolución; el video de entrada no se cobra', () => {
    const t = leerTarifas(DESC_11NOV_REFERENCIA)!
    expect(t).toMatchObject({ unidad: 'segundo', por_mil_tokens: { '720p': 0.2647 }, con_video_entrada: { '480p': 0.1387, '720p': 0.3264, '1080p': 0.7858 } })
    expect(costoEstimadoUsd(t, { resolucion: '720p', relacion: '9:16', segundos: 8 })).toBeCloseTo(2.1176, 4)
    expect(costoEstimadoUsd(t, { resolucion: '720p', relacion: '9:16', segundos: 8, segundosDeEntrada: 5 })).toBeCloseTo(0.3264 * 8, 4)
  })
  it('🔴 el orden de las palabras no importa: precio antes o después de la resolución, otro relleno, otra puntuación', () => {
    expect(leerTarifas('Rates per second: 720p costs $0.30 and 1080p costs $0.70.')).toBeNull() // «costs» entre resolución y precio: no se adivina
    expect(leerTarifas('Price per output second — 480p $0.10, 720p $0.25, 1080p $0.60')).toMatchObject({ unidad: 'segundo', por_mil_tokens: { '480p': 0.1, '720p': 0.25, '1080p': 0.6 } })
    expect(leerTarifas('Billed per second of video: $0.25 at 720p, $0.60 at 1080p.')).toMatchObject({ unidad: 'segundo', por_mil_tokens: { '720p': 0.25, '1080p': 0.6 } })
  })
  it('🔴 fallo cerrado: sin unidad, sin precio o sin resolución no hay tarifas (el brazo no gasta a ciegas)', () => {
    expect(leerTarifas('480p: $0.1177; 720p: $0.2647.')).toBeNull() // no dice si es por segundo ni por tokens
    expect(leerTarifas('Rates per second vary by resolution; see the console.')).toBeNull()
    expect(leerTarifas('Each second costs $0.30.')).toBeNull()
    expect(leerTarifas('')).toBeNull()
  })
})

describe('el brazo devuelve la descripción del proveedor cuando no puede cotizar', () => {
  const env = { baseUrl: 'https://app.test', internalKey: 'k' }
  const pedido = pedidosParaCotizar({ brief: { formato: 'reel', red: 'instagram' }, fotos: [], clave: 'enc:brief' })
  if (!pedido.ok) throw new Error('pedido de cotización inválido')
  const ped = pedido.pedidos[0].pedido
  const p = { pedido: ped, client_id: 'c1', encargo_id: 'enc', tope_usd: 5, workflow_id: 'oficina:video_mesa', workflow_execution_id: 'enc:cotizar' }
  it('🔴 cotizar = el mismo brazo en `dry_run` (estima gratis, no envía): devuelve el costo', async () => {
    const vistos: Array<Record<string, unknown>> = []
    const f = (async (_u: string, init?: RequestInit) => { vistos.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ ok: true, dry_run: true, status: 'simulado', costo_estimado_usd: 2.1176, costo_lista_usd: 2.1176, ruta: 'bytedance/seedance-2.5/text-to-video' }), { status: 200 }) }) as unknown as typeof fetch
    const r = await crearPuertos(new DbFalsa() as never, env, f).video!.cotizar!(p)
    expect(r).toEqual({ ok: true, costo_estimado_usd: 2.1176, costo_lista_usd: 2.1176, ruta: 'bytedance/seedance-2.5/text-to-video' })
    expect(vistos[0]).toMatchObject({ dry_run: true, prompt: PROMPT_DE_COTIZACION, segundos: DURACION_MIN_S, tope_usd: 5, workflow_id: 'oficina:video_mesa' })
  })
  it('🔴 un 502 del brazo trae la descripción de precios: llega al que cotiza y al que envía', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'no_se_pudo_estimar', detail: 'no pude leer las tarifas de la descripción', descripcion_del_proveedor: 'Pricing changed, see dashboard.' }), { status: 502 })) as unknown as typeof fetch
    const P = crearPuertos(new DbFalsa() as never, env, f)
    expect(await P.video!.cotizar!(p)).toEqual({ ok: false, error: 'no pude leer las tarifas de la descripción', http: 502, descripcion: 'Pricing changed, see dashboard.' })
    expect(await P.video!.enviar({ ...p, dry_run: false })).toMatchObject({ ok: false, descripcion: 'Pricing changed, see dashboard.' })
  })
  it('una respuesta 200 que NO es de ensayo no cuenta como cotización (nunca se toma un envío por una estimación)', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, request_id: 'r1', status: 'queued', costo_estimado_usd: 2 }), { status: 202 })) as unknown as typeof fetch
    expect(await crearPuertos(new DbFalsa() as never, env, f).video!.cotizar!(p)).toMatchObject({ ok: false })
  })
})

// ───────────────────────── la sala de video cotiza al ABRIR · dos clientes de rubros distintos
const BRIEF_CREATIVO = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que la gente sepa lo que hacemos».',
  '## Insight', 'Nadie mira lo que no entiende en tres segundos.',
  '## Mensaje', 'Lo hacemos bien desde el primer día.',
  '## Objetivo', '30 consultas nuevas por semana.', '- instagram: que miren · «escríbenos»', '- youtube: que miren · «escríbenos»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: hecho a mano', '- prohibido: delicioso', '- lo que no se dice: precios',
  '## Faltantes', '- público: sin edades en el manual',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que la gente sepa lo que hacemos.', prohibidas: ['delicioso'] })

interface Cliente { nombre: string; client: string; red: string; formato: string; fila: string; fotos: typeof FOTOS }
const CLIENTES: Array<[string, Cliente]> = [
  ['restaurante (reel de Instagram, con fotos propias)', { nombre: 'Restaurante de práctica', client: 'cli-restaurante', red: 'instagram', formato: 'reel', fila: 'F1-S1-ig-r1', fotos: FOTOS }],
  ['B2B de seguridad industrial (short de YouTube, sin fotos)', { nombre: 'Seguridad de práctica', client: 'cli-seguridad', red: 'youtube', formato: 'short', fila: 'F1-S1-yt-s1', fotos: [] }],
]

function parteDe(C: Cliente): string {
  const formatos: FormatosPorRed = { [C.red]: [{ formato: C.formato, produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia: 'video_mesa' }] }
  const insC: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: C.red, huecos_por_semana: 1 }], prohibidas: ['delicioso'], fotos: C.fotos.length ? [C.fotos[0].id] : [] }
  const concepto = leerConcepto([
    '## Gran idea  Hecho a mano · Noventa días mostrando el oficio',
    '## Cómo se ve  Luz cálida, manos trabajando.',
    '## Capítulo F1 · Mostrar el oficio', 'Qué cuenta: el oficio · Objetivo de la fase (cita): «que la gente sepa» · Cómo se ve en este capítulo: planos cerrados',
    '## Banco de ideas',
    `- C1-I01 · ${C.red} · ${C.formato} · las manos trabajando · mensaje: lo hacemos bien · gancho: el primer gesto · protagonista: las manos · serie: ninguna · foto:${C.fotos.length ? C.fotos[0].id : 'ninguna'}`,
  ].join('\n'), insC)
  const fila: FilaDeHoja = { id: C.fila, fecha: '2026-11-12', hora: '09:00', red: C.red, formato: C.formato, pilar: 'producto', tema: 'las manos trabajando', datos: [], fase: 'F1', idea_ref: 'C1-I01' }
  const ins: InsumosDeLaHoja = { client_name: C.nombre, plan_id: '29d6daeb-a95a-4328-9c10-cf3cddc236f7', manual_version: 1, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46', brief: BRIEF_CREATIVO, brief_id: 'brf-abc-v1', concepto, concepto_id: 'con-abc-v1', filas: [fila], formatos }
  return escribirHoja(ins).texto_md
}

type Cotizador = (p: Parameters<NonNullable<PuertoDeVideo['cotizar']>>[0]) => Promise<CotizacionDeVideo>
function brazo(cotizar: Cotizador | null, registro: { cotizados: Array<Record<string, unknown>>; enviados: number }): PuertoDeVideo {
  return {
    enviar: async (p) => { registro.enviados++; return { ok: true, request_id: 'req-1', status: 'queued', costo_estimado_usd: 2, simulado: p.dry_run } },
    estado: async () => ({ ok: true, simulado: true }),
    ...(cotizar ? { cotizar: async (p: Parameters<Cotizador>[0]) => { registro.cotizados.push(p as unknown as Record<string, unknown>); return cotizar(p) } } : {}),
  }
}

describe.each(CLIENTES)('%s · la sala de video cotiza ANTES de la mesa', (_n, C) => {
  async function abrir(cotizar: Cotizador | null, dry_run = false, plantilla: typeof VIDEO_MESA = VIDEO_MESA) {
    const M = crearMemoria({ parte: parteDe(C), plantilla, fuentes: { fotos: C.fotos } })
    const MS = crearMesaEnMemoria()
    M.P.mesa = MS
    const reg = { cotizados: [] as Array<Record<string, unknown>>, enviados: 0 }
    M.P.video = brazo(cotizar, reg)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: C.fila, dry_run, familia: 'video_mesa' }, client_id: C.client, target_step_id: TARGET_STEP_PRODUCIR })
    const enc = [...M.encargos.values()][0]
    return { a, enc, reg, M, MS }
  }
  const rutasEsperadas = C.fotos.length ? ['texto', 'foto'] : ['texto']

  it('🔴 si el brazo NO puede cotizar, el encargo falla al abrir: US$ 0, primer paso (recuperable), sin mesa ni envío, con la descripción del proveedor', async () => {
    const { a, enc, reg, M } = await abrir(async () => ({ ok: false, error: 'no pude leer las tarifas de la descripción', descripcion: 'New pricing:\nsee the console.', http: 502 }))
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
    expect(String(a.cuerpo.motivo)).toContain('no pudo cotizar')
    expect(String(a.cuerpo.motivo)).toContain('«New pricing: see the console.»')
    expect(enc).toMatchObject({ estado: 'fallido', gasto_usd: 0 })
    expect(enc.estado_del_motor.pasos_ejecutados).toBe(0)
    expect(esFallidoRecuperable({ estado: enc.estado, gasto_usd: enc.gasto_usd, version_encargo: enc.version_encargo, pasos_ejecutados: enc.estado_del_motor.pasos_ejecutados })).toBe(true)
    expect(reg.cotizados).toHaveLength(1) // se corta en la primera ruta que no cotiza
    expect(reg.enviados).toBe(0)
    expect(M.gastos).toHaveLength(0)
  })
  it('🔴 sin el método de cotizar el encargo real tampoco abre la mesa (no se puede saber si el brazo cotiza)', async () => {
    const { a, enc, reg } = await abrir(null)
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
    expect(String(a.cuerpo.motivo)).toContain('no se puede cotizar el video antes de abrir la mesa')
    expect(enc.estado_del_motor.pasos_ejecutados).toBe(0)
    expect(reg.enviados).toBe(0)
  })
  it(`🔴 si cotiza, la mesa sigue y la cotización queda guardada · rutas: ${rutasEsperadas.join(' + ')}`, async () => {
    const { a, enc, reg } = await abrir(async (p) => ({ ok: true, costo_estimado_usd: p.pedido.fotos.length ? 2.2 : 2.1176, costo_lista_usd: 2.1176 }))
    expect(a.cuerpo.estado).not.toBe('fallido')
    expect(enc.estado_del_motor.pasos_ejecutados).toBeGreaterThanOrEqual(1)
    expect(reg.cotizados.map((x) => ((x.pedido as { fotos: string[] }).fotos.length ? 'foto' : 'texto'))).toEqual(rutasEsperadas)
    for (const x of reg.cotizados) {
      expect(x).toMatchObject({ client_id: C.client, workflow_id: 'oficina:video_mesa', tope_usd: (VIDEO_MESA.limites.video as { tope_por_video_usd: number }).tope_por_video_usd })
      expect(x.pedido).toMatchObject({ prompt: PROMPT_DE_COTIZACION, segundos: DURACION_MIN_S, resolucion: '720p', formato: C.formato })
      expect(String(x.workflow_execution_id)).toMatch(/:cotizar$/)
    }
    const cot = (enc.estado_del_motor.artefactos['encargo'].datos as { cotizacion: Array<{ ruta: string; costo_estimado_usd: number }> }).cotizacion
    expect(cot.map((x) => x.ruta)).toEqual(rutasEsperadas)
    expect(reg.enviados).toBe(0) // cotizar nunca envía
  })
  it('🔴 camino B encendido: si el cliente tiene fotos, también se cotiza UN plano con foto (imagen a video, 4 s); sin fotos, no', async () => {
    const B = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as object), plano_por_plano: true } } }
    const { enc, reg } = await abrir(async () => ({ ok: true, costo_estimado_usd: 1.06 }), false, B)
    const cot = (enc.estado_del_motor.artefactos['encargo'].datos as { cotizacion: Array<{ ruta: string }> }).cotizacion
    expect(cot.map((x) => x.ruta)).toEqual(C.fotos.length ? ['texto', 'foto', 'plano_foto'] : ['texto'])
    const plano = reg.cotizados.find((x) => (x.pedido as { plano?: boolean }).plano === true)?.pedido as { segundos: number; fotos: string[] } | undefined
    if (C.fotos.length) expect(plano && [plano.segundos, plano.fotos.length]).toEqual([4, 1])
    else expect(plano).toBeUndefined()
    expect(reg.enviados).toBe(0)
  })
  it('🔴 en seco no se cotiza (no sale a la red, como el envío)', async () => {
    const { a, reg } = await abrir(async () => ({ ok: false, error: 'no debería llamarse' }), true)
    expect(a.cuerpo.estado).not.toBe('fallido')
    expect(reg.cotizados).toHaveLength(0)
  })
  it('🔴 la ruta con foto también se cotiza: si solo esa falla, el encargo no abre', async () => {
    const { a } = await abrir(async (p) => (p.pedido.fotos.length ? { ok: false, error: 'la ruta con foto no cotiza' } : { ok: true, costo_estimado_usd: 2.1 }))
    if (C.fotos.length) expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
    else expect(a.cuerpo.estado).not.toBe('fallido')
  })
})

describe('el envío al brazo también guarda la descripción si falla al final', () => {
  it('🔴 el motivo del fallo del paso «video» trae lo que dijo el proveedor sobre sus precios', async () => {
    const ped = (pedidosParaCotizar({ brief: { formato: 'reel', red: 'instagram' }, fotos: [], clave: 'enc:brief' }) as { ok: true; pedidos: Array<{ pedido: unknown }> }).pedidos[0].pedido
    const enc = { id: 'enc', client_id: 'c1', familia: 'video_mesa', dry_run: false, estado_del_motor: { artefactos: { pedido_video: { version: 1, datos: { pedido: ped } } }, gasto_usd: 0, pasos_ejecutados: 3 } }
    const P = { video: { enviar: async () => ({ ok: false, error: 'no pude leer las tarifas de la descripción', descripcion: 'Rates\nchanged.' }), estado: async () => ({ ok: true, simulado: true }) } }
    const r = await enviarVideo(P as never, enc as never, VIDEO_MESA, VIDEO_MESA.pasos.find((x) => x.clave === 'video')!)
    expect(r.fallido).toContain('no pude leer las tarifas')
    expect(r.fallido).toContain('«Rates changed.»')
  })
})

describe('el guion no lleva frases de trabajo del agente (se corrige en la instrucción, no con un filtro)', () => {
  const est = { tipo: 'video', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] } as unknown as EstadoMesa
  const c = (tipo: 'video' | 'carrusel') => ({ cliente_nombre: 'Cliente', tipo, brief_id: 'F1-S1-ig-r1', brief_texto: '### F1-S1-ig-r1 · Instagram · reel\n- QUÉ ES: reel', manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 })
  it('🔴 al integrar y al devolver citas, la dirección recibe la instrucción de empezar en «## Plano 1» sin notas de trabajo', () => {
    for (const tipo of ['integrar', 'devolver_citas'] as const) {
      const t = armarTarea({ tipo, agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c: c('video') } as never)
      expect(t).toContain(FRASE_SIN_NOTAS_DE_TRABAJO)
      expect(t.indexOf(FRASE_SIN_NOTAS_DE_TRABAJO)).toBeLessThan(t.indexOf('## Plano 1 · 0–3 s'))
    }
    expect(FRASE_SIN_NOTAS_DE_TRABAJO).toMatch(/empieza directamente en «## Plano 1»/)
  })
  it('la instrucción es del guion: un carrusel no la recibe', () => {
    expect(armarTarea({ tipo: 'integrar', agente: 'creative-director-mesa', tarjeta: undefined, est: { ...est, tipo: 'carrusel' }, libro: [], c: c('carrusel') } as never)).not.toContain(FRASE_SIN_NOTAS_DE_TRABAJO)
  })
})
