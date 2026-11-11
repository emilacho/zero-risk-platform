/**
 * 11-nov · GO Lenovo 16:34 Zúrich (decisión de Emilio) · las fotos del guion se encuentran por su NOMBRE CORTO, y si el guion nombra fotos que no existen el pedido
 * VUELVE UNA SOLA VEZ a la mesa con el aviso de cuáles. Precedente: el reel W47 nombró sus 4 fotos por el nombre corto (9f71b0e9…), el pedido las buscó por el id completo,
 * no halló ninguna y el video salió desde el texto, sin fotos (US$ 3,18). Sin freno: un cliente sin fotos sigue con el video desde el texto.
 * Dos clientes de rubros distintos, en seco y a US$ 0: un restaurante (reel de Instagram, con fotos propias) y una empresa B2B de seguridad industrial (short de YouTube, sin fotos).
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '@/lib/cadena/hoja'
import { leerBriefCreativo } from '@/lib/cadena/brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '@/lib/cadena/conceptos'
import type { FormatosPorRed } from '@/lib/cadena/tipos'
import type { Tarjeta } from '../mesa/tipos'
import { abrirEncargo } from '../orquestador'
import { avisoDeFotosALaMesa, quedaVueltaALaMesa } from '../orquestador-video'
import { validarPlantilla } from '../plantilla'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import type { PuertoDeVideo } from '../puertos'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado, Plantilla } from '../tipos'
import { armarPedidoDeLaOficina, buscarFotoPropia } from '../video/pedido'
import type { TraduccionDeGuion } from '../video/guion'
import { FOTOS, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'

const corto = (id: string) => id.slice(0, 8)
/** las fotos de práctica con id COMPLETO (como en la base: uuid), para que el nombre corto del guion no sea igual al id */
const FOTOS_UUID = FOTOS.map((f, i) => ({ ...f, id: `${f.id}-1111-4111-8111-${String(i).padStart(12, '0')}` }))
const F0 = FOTOS_UUID[0], F1 = FOTOS_UUID[1]

describe('buscar una foto propia por su nombre corto', () => {
  const propias = [{ id: 'abc12345-0000-4000-8000-000000000001', url: 'https://f.test/1.jpg' }, { id: 'abc99999-0000-4000-8000-000000000002', url: 'https://f.test/2.jpg' }, { id: 'def00000-0000-4000-8000-000000000003', url: 'https://f.test/3.jpg' }]
  it('🔴 el id completo, el nombre corto (única que empieza así) y sin importar mayúsculas: es esa', () => {
    expect(buscarFotoPropia('abc12345-0000-4000-8000-000000000001', propias)).toEqual({ url: 'https://f.test/1.jpg' })
    expect(buscarFotoPropia('abc12345', propias)).toEqual({ url: 'https://f.test/1.jpg' })
    expect(buscarFotoPropia(' DEF0 ', propias)).toEqual({ url: 'https://f.test/3.jpg' })
  })
  it('🔴 si empiezan así varias es ambigua (no se adivina); si ninguna, no existe; vacío no es ninguna', () => {
    expect(buscarFotoPropia('abc', propias)).toEqual({ ambigua: 2 })
    expect(buscarFotoPropia('zzz11111', propias)).toBeNull()
    expect(buscarFotoPropia('', propias)).toBeNull()
    expect(buscarFotoPropia('abc12345', [])).toBeNull()
  })
})

describe('el pedido al brazo con nombres cortos', () => {
  const guion = (fotos_ids: string[]): TraduccionDeGuion => ({ ok: true, planos: [{ n: 1, desde: 0, hasta: 12, se_ve: 'el plato servido' }] as never, segundos: 12, audio: 'ambiente', pie_de_foto: 'pie', hashtags: [], fotos_ids, avisos: [] })
  const brief = { formato: 'reel', red: 'instagram' }
  it('🔴 el caso del W47: 2 nombres cortos de fotos propias ⇒ las 2 direcciones viajan, en el orden del guion; nada «no hallado»', () => {
    expect(F0.id).toHaveLength(36)
    const a = armarPedidoDeLaOficina({ guion: guion([corto(F1.id), corto(F0.id)]), brief, fotos: FOTOS_UUID, clave: 'k' })
    if (!a.ok) throw new Error(a.errores.join())
    expect(a.pedido.fotos).toEqual([F1.url, F0.url])
    expect(a.pedido.fotos_no_halladas).toEqual([])
    expect(a.ambiguas).toEqual([])
  })
  it('🔴 un nombre que no existe y uno ambiguo quedan «no hallados» (el ambiguo, también marcado); una foto de la competencia no cuenta como propia', () => {
    const otras = [{ ...F0, id: `${corto(F0.id)}-aaaa-4000-8000-000000000009`, url: 'https://fotos.test/gemela.jpg' }, { ...F1, id: 'c0c0c0c0-0000-4000-8000-000000000001', origen: 'competencia' as const }]
    const a = armarPedidoDeLaOficina({ guion: guion([corto(F0.id), 'zzzz9999', 'c0c0c0c0']), brief, fotos: [...FOTOS_UUID, ...otras], clave: 'k' })
    if (!a.ok) throw new Error(a.errores.join())
    expect(a.pedido.fotos).toEqual([])
    expect(a.pedido.fotos_no_halladas).toEqual([corto(F0.id), 'zzzz9999', 'c0c0c0c0'])
    expect(a.ambiguas).toEqual([corto(F0.id)])
  })
})

describe('el aviso con que el pedido vuelve a la mesa', () => {
  it('🔴 con fotos: dice cuáles no existen, cuáles son ambiguas y lista las propias por nombre corto con lo que muestran', () => {
    const t = avisoDeFotosALaMesa(['zzzz9999', 'abc'], ['abc'], FOTOS_UUID)
    expect(t).toContain('la foto «zzzz9999» no existe entre las fotos propias del cliente')
    expect(t).toContain('el nombre «abc» coincide con varias fotos')
    expect(t).toContain('Fotos propias disponibles:')
    expect(t).toContain(`- ${corto(F0.id)} · `)
    expect(t).toContain(String(F0.que_muestra).replace(/\s+/g, ' ').trim().slice(0, 40))
    expect(t).toContain('Integra el guion completo otra vez')
  })
  it('🔴 sin fotos: dice que el cliente no tiene fotos propias y que el video sale desde el texto (no frena)', () => {
    const t = avisoDeFotosALaMesa(['9f71b0e9'], [], [])
    expect(t).toContain('«9f71b0e9» no existe')
    expect(t).toContain('El cliente no tiene fotos propias')
    expect(t).not.toContain('Fotos propias disponibles')
  })
})

describe('la vuelta es dato de la plantilla, máximo 1', () => {
  const e = (vueltas: Record<string, number>) => ({ vueltas } as unknown as Estado)
  it('🔴 la plantilla video_mesa es válida y su paso `pedido` vuelve a `mesa` una sola vez, solo si el pedido lo pide', () => {
    // la vuelta no agrega errores a la plantilla (los 2 que ya tenía no son de la vuelta); una vuelta hacia adelante sí sería un error
    expect(validarPlantilla(VIDEO_MESA).filter((x) => /vuelve_a|«pedido»/.test(x))).toEqual([])
    const haciaAdelante: Plantilla = { ...VIDEO_MESA, pasos: VIDEO_MESA.pasos.map((p) => (p.clave === 'pedido' ? { ...p, vuelve_a: { ...p.vuelve_a!, paso: 'video' } } : p)) }
    expect(validarPlantilla(haciaAdelante).some((x) => /vuelve_a solo puede volver hacia atrás/.test(x))).toBe(true)
    expect(VIDEO_MESA.pasos[2]).toMatchObject({ clave: 'pedido', vuelve_a: { paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'pedido_video', campo: 'vuelve_a_la_mesa', igual: true } } })
    expect(quedaVueltaALaMesa(VIDEO_MESA, e({}))).toBe(true)
    expect(quedaVueltaALaMesa(VIDEO_MESA, e({ pedido: 1 }))).toBe(false)
    const sinVuelta: Plantilla = { ...VIDEO_MESA, pasos: VIDEO_MESA.pasos.map((p) => { const { vuelve_a: _v, ...resto } = p; void _v; return resto }) }
    expect(quedaVueltaALaMesa(sinVuelta, e({}))).toBe(false)
  })
})

// ───────────────────────── de punta a punta, en seco: la hoja real → la mesa → el pedido (vuelve o no) → el brazo simulado
const tj = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, indicacion: [], activo: true, version: 1 })
const DIRECTORIO_VIDEO: Tarjeta[] = [tj('creative-director-mesa', 'direccion', ['video:dirige']), tj('video-editor', 'miembro', ['video']), tj('portero', 'portero', [])]
const DIRECCION = 'creative-director-mesa'

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
const RESTAURANTE: Cliente = { nombre: 'Restaurante de práctica', client: 'cli-restaurante', red: 'instagram', formato: 'reel', fila: 'F1-S1-ig-r1', fotos: FOTOS_UUID }
const SEGURIDAD: Cliente = { nombre: 'Seguridad de práctica', client: 'cli-seguridad', red: 'youtube', formato: 'short', fila: 'F1-S1-yt-s1', fotos: [] }

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

/** un guion de 2 planos; `foto1` y `foto2` son lo que el guion escribe en «Foto:» (nombre corto, id, o «ninguna») */
const GUION = (foto1: string, foto2: string) => [
  '## Plano 1 · 0–4 s', 'Se ve: las manos trabajando sobre la mesa, luz cálida', 'Movimiento: acercamiento lento', `Foto: ${foto1}`,
  '## Plano 2 · 4–12 s', 'Se ve: el trabajo terminado sobre la mesa', 'Movimiento: cámara fija', 'Texto en pantalla: Hecho a mano', `Foto: ${foto2}`,
  '## Audio', 'ambiente, sin voz',
  '## Pie', 'Hecho a mano desde el primer día. Escríbenos.',
  '## Etiquetas', '#hechoamano',
  '## Citas', 'A2 usé: la estructura de dos planos',
].join('\n')

function brazoSimulado(registro: Array<Record<string, unknown>>): PuertoDeVideo {
  return {
    enviar: async (p) => { registro.push(p as unknown as Record<string, unknown>); return { ok: true, request_id: `req-${registro.length}`, status: 'simulado', costo_estimado_usd: 2.1, simulado: p.dry_run } },
    estado: async () => ({ ok: true, simulado: true }),
  }
}

/** juega la pieza: la dirección integra `guiones[k]` en su k-ésima integración (el último se repite) */
async function jugarVideo(C: Cliente, guiones: string[]) {
  const M = crearMemoria({ parte: parteDe(C), plantilla: VIDEO_MESA, fuentes: { fotos: C.fotos } })
  const MS = crearMesaEnMemoria(DIRECTORIO_VIDEO)
  M.P.mesa = MS
  const enviados: Array<Record<string, unknown>> = []
  M.P.video = brazoSimulado(enviados)
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: C.fila, dry_run: true, familia: 'video_mesa' }, client_id: C.client, target_step_id: TARGET_STEP_PRODUCIR })
  expect(a.status).toBe(200)
  const id = String(a.cuerpo.encargo_id)
  let integraciones = 0
  const { ultima, turnos } = await jugar(M, id, a, (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el oficio en dos planos. Pido la estructura a video-editor.' }
    if (t.tipo === 'aportar') return { texto: 'Dos planos: el gesto y el resultado.' }
    if (t.tipo === 'responder') return { texto: 'Entendido: rehago el guion con las fotos que sí hay.' }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: guiones[Math.min(integraciones++, guiones.length - 1)] }
    return undefined
  })
  const enc = M.encargos.get(id)!
  const libro = MS.filas.filter((x) => x.encargo_id === id)
  const avisos = libro.filter((x) => x.tipo === 'devuelve' && x.de === 'oficina-creativa')
  return { M, ultima, turnos, enc, enviados, avisos, libro }
}
const fotosDelPedido = (enviados: Array<Record<string, unknown>>) => (enviados[0].pedido as { fotos: string[] }).fotos

describe('restaurante (reel de Instagram, con fotos propias) · de punta a punta en seco', () => {
  it('🔴 el W47 corregido: el guion nombra las fotos por su nombre corto ⇒ viajan al brazo, sin volver a la mesa', async () => {
    const { ultima, enviados, avisos, enc } = await jugarVideo(RESTAURANTE, [GUION(`foto:${corto(F0.id)}`, corto(F1.id))])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(enviados).toHaveLength(1)
    expect(fotosDelPedido(enviados)).toEqual([F0.url, F1.url])
    expect(avisos).toHaveLength(0)
    expect(enc.estado_del_motor.vueltas['pedido'] ?? 0).toBe(0)
    expect(enc.estado_del_motor.fichas.some((f) => f.id.startsWith('video-fotos-no-halladas'))).toBe(false)
  })
  it('🔴 el guion nombra una foto que no existe ⇒ vuelve UNA vez a la mesa con el aviso; la dirección contesta, rehace y el brazo recibe las fotos que sí hay', async () => {
    const { ultima, enviados, avisos, enc, turnos } = await jugarVideo(RESTAURANTE, [GUION('zzzz9999', corto(F1.id)), GUION(corto(F0.id), corto(F1.id))])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({ para: DIRECCION })
    expect(avisos[0].texto).toContain('la foto «zzzz9999» no existe entre las fotos propias del cliente')
    expect(avisos[0].texto).toContain(`- ${corto(F0.id)} · `)
    // la dirección contesta el aviso y vuelve a integrar; el brazo recibe UN solo pedido, con el guion nuevo
    const iAviso = turnos.findIndex((t) => t.tipo === 'responder' && t.agente === DIRECCION)
    expect(iAviso).toBeGreaterThan(0)
    expect(turnos[iAviso].task).toContain('zzzz9999')
    expect(turnos.slice(iAviso + 1).some((t) => t.tipo === 'integrar' && t.agente === DIRECCION)).toBe(true)
    expect(enviados).toHaveLength(1)
    expect(fotosDelPedido(enviados)).toEqual([F0.url, F1.url])
    expect(enc.estado_del_motor.vueltas['pedido']).toBe(1)
    expect(enc.estado_del_motor.artefactos['guion'].version).toBe(2)
    expect((enc.estado_del_motor.artefactos['pedido_video'].datos as { vuelve_a_la_mesa: boolean }).vuelve_a_la_mesa).toBe(false)
  })
  it('🔴 si el guion rehecho TAMPOCO halla la foto, no vuelve una segunda vez: sigue de largo como antes, con la ficha (sin freno)', async () => {
    const { ultima, enviados, avisos, enc } = await jugarVideo(RESTAURANTE, [GUION('zzzz9999', 'ninguna'), GUION('zzzz9999', 'ninguna')])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(avisos).toHaveLength(1)
    expect(enviados).toHaveLength(1)
    expect(fotosDelPedido(enviados)).toEqual([])
    expect(enc.estado_del_motor.vueltas['pedido']).toBe(1)
    expect(enc.estado_del_motor.fichas.some((f) => f.id.startsWith('video-fotos-no-halladas') && /zzzz9999/.test(String(f.que)))).toBe(true)
  })
})

describe('B2B de seguridad industrial (short de YouTube, sin fotos) · de punta a punta en seco', () => {
  it('🔴 sin fotos y el guion no nombra ninguna ⇒ sigue como hoy: el video desde el texto, sin volver a la mesa', async () => {
    const { ultima, enviados, avisos, enc } = await jugarVideo(SEGURIDAD, [GUION('ninguna', 'ninguna')])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(avisos).toHaveLength(0)
    expect(enviados).toHaveLength(1)
    expect(fotosDelPedido(enviados)).toEqual([])
    expect(enc.estado_del_motor.vueltas['pedido'] ?? 0).toBe(0)
  })
  it('🔴 sin fotos y el guion nombra una ⇒ vuelve una vez con «el cliente no tiene fotos propias»; rehecho sin fotos, el video sale desde el texto', async () => {
    const { ultima, enviados, avisos, enc } = await jugarVideo(SEGURIDAD, [GUION('9f71b0e9', 'ninguna'), GUION('ninguna', 'ninguna')])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toContain('El cliente no tiene fotos propias')
    expect(enviados).toHaveLength(1)
    expect(fotosDelPedido(enviados)).toEqual([])
    expect(enc.estado_del_motor.vueltas['pedido']).toBe(1)
    expect(enc.estado_del_motor.fichas.some((f) => f.id.startsWith('video-fotos-no-halladas'))).toBe(false)
  })
})
