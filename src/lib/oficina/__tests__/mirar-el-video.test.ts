/**
 * 11-nov · GO Lenovo 16:43 Zúrich (decisión de Emilio 16:41: «material premium sin ver el dinero») · UN AGENTE MIRA EL VIDEO ANTES DE LA BANDEJA.
 * Se prueba sin red y a US$ 0, por el CAMINO REAL (abrir → mesa → pedido → brazo → cuadros → mirada → chequeos → jefatura), con dos clientes de rubros distintos:
 * un restaurante (reel de Instagram, con fotos propias) y una empresa B2B de seguridad industrial (short de YouTube, sin fotos).
 *  · un cuadro del MEDIO de cada plano del guion (no una lista fija de instantes);
 *  · el agente JUZGA (el código solo lee `coincide`): si no coincide queda una ficha que bloquea con lo que faltó;
 *  · la jefatura recibe los cuadros como imágenes y lo que vio el agente como contexto;
 *  · sin cuadros, o sin poder leer al agente: ficha que bloquea, el video nunca pasa callado;
 *  · la migración siembra EXACTAMENTE la plantilla del código y se niega con encargos de video vivos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '@/lib/cadena/hoja'
import { leerBriefCreativo } from '@/lib/cadena/brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '@/lib/cadena/conceptos'
import type { FormatosPorRed } from '@/lib/cadena/tipos'
import { abrirEncargo, indicacionDe } from '../orquestador'
import { cabeLaVuelta, costoDeVolver, recibirVideo } from '../orquestador-video'
import { AGENTE_QUE_MIRA_EL_VIDEO, VIDEO_MESA } from '../plantillas/video-mesa'
import type { PuertoDeVideo } from '../puertos'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { sacarCuadros, duracionDeLaSalida } from '../video/cuadros'
import type { Plano } from '../video/guion'
import { instantesPorPlano, leerMirada, MAX_CUADROS_DEL_VIDEO, PASO_MIRAR_VIDEO, tareaDeLaMirada } from '../video/mirada'
import { procesarSalida } from '../salida'
import { validarPlantilla } from '../plantilla'
import type { Plantilla } from '../tipos'
import { CONTRATOS_EN_TEXTO } from '../pedidos'
import { jugar, type Turno } from './mesa-arnes'
import { FOTOS, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const MIG = fs.readFileSync(path.join(RAIZ, 'migrations', '202611111730_oficina_un_agente_mira_el_video.sql'), 'utf8')
const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202611111730_oficina_un_agente_mira_el_video_REVERSA.sql'), 'utf8')
const pasosDe = (sql: string) => JSON.parse(/\$pasos\$([\s\S]*?)\$pasos\$/.exec(sql)![1])
const indDe = (sql: string, d = 'ind') => JSON.parse(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`).exec(sql)![1])
const antesDe = (sql: string) => JSON.parse(/\$antes\$([\s\S]*?)\$antes\$/.exec(sql)![1])

const PLANOS: Plano[] = [
  { n: 1, desde: 0, hasta: 3, se_ve: 'la fachada del local' },
  { n: 2, desde: 3, hasta: 9, se_ve: 'el producto en primer plano' },
  { n: 3, desde: 9, hasta: 12, se_ve: 'el cierre con el nombre' },
]

describe('los cuadros: uno del medio de cada plano', () => {
  it('🔴 el instante sale de los segundos del guion, no de una lista fija', () => {
    expect(instantesPorPlano(PLANOS)).toEqual([{ plano: 1, segundo: 1.5 }, { plano: 2, segundo: 6 }, { plano: 3, segundo: 10.5 }])
  })
  it('🔴 un video más corto que el guion: el cuadro queda dentro del video', () => {
    expect(instantesPorPlano(PLANOS, 8).map((x) => x.segundo)).toEqual([1.5, 6, 7.9])
  })
  it('🔴 con más planos que el máximo: MAX cuadros repartidos parejo, primero y último incluidos; el pedido dice cuántos de cuántos', () => {
    const muchos: Plano[] = Array.from({ length: 41 }, (_, i) => ({ n: i + 1, desde: i, hasta: i + 1, se_ve: `p${i + 1}` }))
    const x = instantesPorPlano(muchos)
    expect(x).toHaveLength(MAX_CUADROS_DEL_VIDEO)
    expect(x[0].plano).toBe(1)
    expect(x[x.length - 1].plano).toBe(41)
    expect(new Set(x.map((c) => c.plano)).size).toBe(MAX_CUADROS_DEL_VIDEO)
    expect(instantesPorPlano(PLANOS, null, 2).map((c) => c.plano)).toEqual([1, 3])
    const t = tareaDeLaMirada({ cuadros: x.map((c) => ({ ...c, url: `https://c/${c.plano}.jpg` })), planos: muchos, segundos: 41, brief_texto: 'x', red: 'youtube', formato: 'short', contrato: '' })
    expect(t.images).toHaveLength(MAX_CUADROS_DEL_VIDEO)
    expect(t.task).toContain(`son ${MAX_CUADROS_DEL_VIDEO} de 41 planos`)
  })
  it('planos sin segundos válidos no dan cuadro', () => {
    expect(instantesPorPlano([{ n: 1, desde: 4, hasta: 4, se_ve: 'x' }, { n: 2, desde: Number.NaN, hasta: 3, se_ve: 'y' }, { n: 3, desde: 0, hasta: 2, se_ve: 'z' }])).toEqual([{ plano: 3, segundo: 1 }])
  })
  it('🔴 ffmpeg: mide la duración y pide UN cuadro por plano en su segundo; descarta lo que no es JPEG', async () => {
    const llamadas: string[][] = []
    const jpeg = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(2000, 1)])
    const ejecutar = async (_c: string, args: string[]) => {
      llamadas.push(args)
      if (args.includes('-hide_banner')) return { ok: true, salida: '  Duration: 00:00:12.04, start: 0.000000' }
      const salida = args[args.length - 1]
      // el plano 2 sale como basura (no JPEG): se descarta
      fs.writeFileSync(salida, salida.endsWith('p2.jpg') ? Buffer.alloc(2000, 7) : jpeg)
      return { ok: true, salida: '' }
    }
    const r = await sacarCuadros({ bytes: Buffer.from('mp4'), planos: PLANOS, ffmpeg: 'ffmpeg', ejecutar })
    expect(r.duracion_s).toBeCloseTo(12.04, 2)
    expect(r.cuadros.map((c) => [c.plano, c.segundo])).toEqual([[1, 1.5], [3, 10.5]])
    expect(llamadas.filter((a) => a.includes('-ss')).map((a) => a[a.indexOf('-ss') + 1])).toEqual(['1.5', '6', '10.5'])
  })
  it('sin ffmpeg no saca nada y lo dice', async () => {
    expect(await sacarCuadros({ bytes: Buffer.from('x'), planos: PLANOS, ffmpeg: null })).toMatchObject({ cuadros: [], causa: 'ffmpeg no está disponible en este servidor' })
    expect(duracionDeLaSalida('nada')).toBeNull()
  })
})

describe('la mirada: juzga el agente', () => {
  it('🔴 el pedido lleva la fila, los planos y cada cuadro con su plano y su segundo, en orden; no trae una lista de cosas que buscar', () => {
    const t = tareaDeLaMirada({ cuadros: [{ plano: 1, segundo: 1.5, url: 'https://c/1.jpg' }, { plano: 2, segundo: 6, url: 'https://c/2.jpg' }], planos: PLANOS, segundos: 12, brief_texto: 'FILA: el reel cuenta la fachada, el producto y el cierre', red: 'instagram', formato: 'reel', contrato: CONTRATOS_EN_TEXTO['mirada_video.v1'] })
    expect(t.images).toEqual(['https://c/1.jpg', 'https://c/2.jpg'])
    expect(t.task).toContain('FILA: el reel cuenta la fachada, el producto y el cierre')
    expect(t.task).toContain('- Plano 2 (3–9 s): el producto en primer plano')
    expect(t.task).toContain('- imagen 2: cuadro del plano 2, segundo 6')
    expect(t.task).toContain('lo importante lo decides tú')
    expect(t.task).toContain('"coincide"')
  })
  it('🔴 el esquema exige coincide, faltantes y por_plano; lo que el agente dijo se guarda sin inventar', () => {
    const bien = procesarSalida(JSON.stringify({ coincide: false, orden_respetado: true, faltantes: [{ plano: 2, que_falta: 'no se ve el producto' }], por_plano: [{ plano: 1, se_ve: 'la fachada' }], para_la_mesa: 'mostrar el producto en el plano 2' }), 'mirada_video.v1', 0, 1)
    expect(bien.ok).toBe(true)
    expect(leerMirada((bien as { valor: Record<string, unknown> }).valor)).toEqual({ coincide: false, orden_respetado: true, faltantes: [{ plano: 2, que_falta: 'no se ve el producto' }], por_plano: [{ plano: 1, se_ve: 'la fachada' }], para_la_mesa: 'mostrar el producto en el plano 2' })
    expect(procesarSalida(JSON.stringify({ faltantes: [], por_plano: [] }), 'mirada_video.v1', 0, 1).ok).toBe(false)
    expect(procesarSalida(JSON.stringify({ coincide: true, faltantes: [{ que_falta: '' }], por_plano: [] }), 'mirada_video.v1', 0, 1).ok).toBe(false)
    expect(leerMirada({ coincide: false, faltantes: [{ plano: 1, que_falta: 'x' }, { que_falta: '  ' }, 'basura'] }).faltantes).toEqual([{ plano: 1, que_falta: 'x' }])
    expect(leerMirada({ coincide: 'sí' }).coincide).toBe(false) // solo `true` es coincide
  })
})

// ───────────────────────── el camino real · dos clientes de rubros distintos
interface Cliente { nombre: string; client: string; red: string; formato: string; fila: string; fotos: typeof FOTOS }
const CLIENTES: Array<[string, Cliente]> = [
  ['restaurante (reel de Instagram, con fotos propias)', { nombre: 'Restaurante de práctica', client: 'cli-restaurante', red: 'instagram', formato: 'reel', fila: 'F1-S1-ig-r1', fotos: FOTOS }],
  ['B2B de seguridad industrial (short de YouTube, sin fotos)', { nombre: 'Seguridad de práctica', client: 'cli-seguridad', red: 'youtube', formato: 'short', fila: 'F1-S1-yt-s1', fotos: [] }],
]
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que la gente sepa lo que hacemos».', '## Insight', 'Nadie mira lo que no entiende en tres segundos.', '## Mensaje', 'Lo hacemos bien desde el primer día.',
  '## Objetivo', '30 consultas nuevas por semana.', '- instagram: que miren · «escríbenos»', '- youtube: que miren · «escríbenos»', '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: hecho a mano', '- prohibido: delicioso', '- lo que no se dice: precios', '## Faltantes', '- público: sin edades en el manual', '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que la gente sepa lo que hacemos.', prohibidas: ['delicioso'] })
function parteDe(C: Cliente): string {
  const formatos: FormatosPorRed = { [C.red]: [{ formato: C.formato, produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia: 'video_mesa' }] }
  const insC: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: C.red, huecos_por_semana: 1 }], prohibidas: ['delicioso'], fotos: C.fotos.length ? [C.fotos[0].id] : [] }
  const concepto = leerConcepto([
    '## Gran idea  Hecho a mano · Noventa días mostrando el oficio', '## Cómo se ve  Luz cálida, manos trabajando.',
    '## Capítulo F1 · Mostrar el oficio', 'Qué cuenta: el oficio · Objetivo de la fase (cita): «que la gente sepa» · Cómo se ve en este capítulo: planos cerrados', '## Banco de ideas',
    `- C1-I01 · ${C.red} · ${C.formato} · las manos trabajando · mensaje: lo hacemos bien · gancho: el primer gesto · protagonista: las manos · serie: ninguna · foto:${C.fotos.length ? C.fotos[0].id : 'ninguna'}`,
  ].join('\n'), insC)
  const fila: FilaDeHoja = { id: C.fila, fecha: '2026-11-12', hora: '09:00', red: C.red, formato: C.formato, pilar: 'producto', tema: 'las manos trabajando', datos: [], fase: 'F1', idea_ref: 'C1-I01' }
  const ins: InsumosDeLaHoja = { client_name: C.nombre, plan_id: '29d6daeb-a95a-4328-9c10-cf3cddc236f7', manual_version: 1, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46', brief: BRIEF, brief_id: 'brf-abc-v1', concepto, concepto_id: 'con-abc-v1', filas: [fila], formatos }
  return escribirHoja(ins).texto_md
}
const GUION = (citas: string) => [
  '## Plano 1 · 0–4 s', 'Se ve: la fachada del local con su letrero', 'Movimiento: acercamiento lento', 'Foto: ninguna',
  '## Plano 2 · 4–12 s', 'Se ve: unas manos trabajando el producto en primer plano', 'Movimiento: cámara fija', 'Texto en pantalla: Hecho a mano', 'Foto: ninguna',
  '## Audio', 'ambiente, sin voz', '## Pie', 'Lo hacemos bien desde el primer día. Escríbenos.', '## Etiquetas', '#hechoamano', '## Citas', citas,
].join('\n')
const MIRADA_BIEN = JSON.stringify({ coincide: true, orden_respetado: true, faltantes: [], por_plano: [{ plano: 1, se_ve: 'la fachada con el letrero' }, { plano: 2, se_ve: 'manos trabajando' }], para_la_mesa: '' })
const MIRADA_MAL = JSON.stringify({ coincide: false, orden_respetado: true, faltantes: [{ plano: 1, que_falta: 'no se ve la fachada: sale una calle vacía' }], por_plano: [{ plano: 1, se_ve: 'una calle vacía' }, { plano: 2, se_ve: 'manos trabajando' }], para_la_mesa: 'el plano 1 tiene que mostrar la fachada con el letrero' })

/** recorre el encargo ENTERO: mesa → brazo → cuadros → mirada (y, si el video vuelve, otra vez mesa → brazo → mirada) hasta la jefatura. `mirada(k)` = la k-ésima respuesta del agente (desde 0) */
async function recorrer(C: Cliente, o: { mirada: (k: number) => string; sinSacador?: boolean; costoVideo?: number; costoIntegrar?: number }) {
  const costoVideo = o.costoVideo ?? 2.12
  const M = crearMemoria({ parte: parteDe(C), plantilla: VIDEO_MESA, fuentes: { fotos: C.fotos } })
  const MS = crearMesaEnMemoria()
  M.P.mesa = MS
  const enviados: string[] = []
  const brazo: PuertoDeVideo = {
    enviar: async (p) => { enviados.push(p.workflow_execution_id); return { ok: true, request_id: `req-${enviados.length}`, status: 'queued', costo_estimado_usd: costoVideo, simulado: false } },
    estado: async () => ({ ok: true, simulado: true }),
    cotizar: async () => ({ ok: true, costo_estimado_usd: costoVideo, costo_lista_usd: costoVideo }),
  }
  M.P.video = brazo
  const descargados: string[] = []
  const descargar = M.P.descargar
  M.P.descargar = async (url) => { descargados.push(url); return descargar(url) }
  const sacados: Array<{ planos: Plano[]; bytes: number }> = []
  if (!o.sinSacador) M.P.sacarCuadros = async (bytes, planos) => { sacados.push({ planos, bytes: bytes.length }); return { duracion_s: 12, cuadros: instantesPorPlano(planos, 12).map((x) => ({ ...x, bytes: Buffer.from(`jpg-${x.plano}`) })) } }
  const sobres: Array<{ imagenes: string[]; contexto: Array<{ titulo: string; texto: string }> }> = []
  M.P.jefatura = async (s) => { const x = s as unknown as { payload: { imagenes?: string[]; contexto?: Array<{ titulo: string; texto: string }> } }; sobres.push({ imagenes: x.payload?.imagenes ?? [], contexto: x.payload?.contexto ?? [] }); return { estado: 'esperando', review_id: 'rev-1' } as never }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: C.fila, dry_run: false, familia: 'video_mesa' }, client_id: C.client, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  let aportes = 0
  const miradas: Turno[] = []
  const turnos: Turno[] = []
  const responder = (t: Turno) => {
    if (t.paso === PASO_MIRAR_VIDEO) { miradas.push(t); return { texto: o.mirada(miradas.length - 1), costo_usd: 0.12 } }
    if (t.tipo === 'aportar') { aportes++; return { texto: `Aporte de ${t.agente}.` } }
    if (t.tipo === 'responder') return { texto: 'Entendido: rehago el guion para que el video muestre lo que faltó.' }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION(Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé tal cual`).join('\n')), ...(o.costoIntegrar !== undefined ? { costo_usd: o.costoIntegrar } : {}) }
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el oficio a mano.' }
    return undefined
  }
  let r = await jugar(M, id, a, responder)
  turnos.push(...r.turnos)
  for (let vez = 1; vez <= 3 && r.ultima.cuerpo.accion === 'esperar_brazo'; vez++) {
    const nBrazo = Number((r.ultima.cuerpo.turno as { n: number }).n)
    const tras = await recibirVideo(M.P, id, nBrazo, { ok: true, status: 'completed', video_url: `https://bucket.test/video-final-${vez}.mp4`, url_proveedor: null, costo_usd: costoVideo, expires_at: null, copia: 'bucket', aviso: null })
    r = await jugar(M, id, tras, responder)
    turnos.push(...r.turnos)
  }
  const avisos = MS.filas.filter((x) => x.encargo_id === id && x.tipo === 'devuelve' && x.de === 'oficina-creativa')
  return { M, id, enc: M.encargos.get(id)!, fin: r.ultima, miradas, sobres, sacados, descargados, enviados, avisos, turnos }
}

describe.each(CLIENTES)('%s · el camino real: el video se mira antes de la jefatura', (_n, C) => {
  it('🔴 coincide: cuadros del medio de cada plano → el agente mira → la jefatura recibe los cuadros y lo que vio', async () => {
    const r = await recorrer(C, { mirada: () => MIRADA_BIEN })
    expect(r.descargados).toContain('https://bucket.test/video-final-1.mp4')
    expect(r.enviados).toHaveLength(1)
    expect(r.avisos).toHaveLength(0)
    expect(r.enc.estado_del_motor.vueltas[PASO_MIRAR_VIDEO] ?? 0).toBe(0)
    expect(r.sacados).toHaveLength(1)
    expect(r.sacados[0].planos.map((p) => [p.n, p.desde, p.hasta])).toEqual([[1, 0, 4], [2, 4, 12]])
    const cuadros = r.enc.estado_del_motor.artefactos['cuadros_video'].datos as { cuadros: Array<{ plano: number; segundo: number; url: string }>; hay_cuadros: boolean }
    expect(cuadros.hay_cuadros).toBe(true)
    expect(cuadros.cuadros.map((c) => [c.plano, c.segundo])).toEqual([[1, 2], [2, 8]])
    expect(cuadros.cuadros[0].url).toMatch(new RegExp(`^https://bucket\\.test/oficina/${C.client}/${r.id}/cuadros-\\d+/plano-1\\.jpg$`))
    // el agente que mira es el de la plantilla, ve los cuadros en orden y recibe la fila
    expect(r.miradas).toHaveLength(1)
    expect(r.miradas[0].agente).toBe(AGENTE_QUE_MIRA_EL_VIDEO)
    expect(r.miradas[0].task).toContain('- imagen 1: cuadro del plano 1, segundo 2')
    expect(r.miradas[0].task).toContain('Plano 2 (4–12 s): unas manos trabajando el producto en primer plano')
    expect(r.miradas[0].task).toContain(C.fila)
    expect(r.enc.estado_del_motor.artefactos['mirada_video'].datos).toMatchObject({ coincide: true })
    expect(r.enc.estado_del_motor.fichas.filter((f) => f.donde === 'mirada' && f.estado === 'abierta')).toHaveLength(0)
    // la jefatura: los cuadros entre sus imágenes y lo que vio el agente en su contexto
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
    expect(r.sobres).toHaveLength(1)
    for (const c of cuadros.cuadros) expect(r.sobres[0].imagenes).toContain(c.url)
    const ctx = r.sobres[0].contexto.find((x) => x.titulo === 'Lo que vio el agente que miró el video')
    expect(ctx?.texto).toContain('coincide con el guion y la fila')
    expect(ctx?.texto).toContain('plano 1: la fachada con el letrero')
    // el gasto del agente entra al libro de la oficina
    expect(r.M.gastos.some((g) => g.concepto === 'modelo' && Math.abs(g.cost_usd - 0.12) < 1e-9)).toBe(true)
  })
  it('🔴 NO coincide ⇒ el video vuelve SOLO a la mesa UNA vez con lo que faltó; la dirección rehace el guion, se filma otro video y la segunda mirada coincide: limpio a la jefatura', async () => {
    const r = await recorrer(C, { mirada: (k) => (k === 0 ? MIRADA_MAL : MIRADA_BIEN) })
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0].texto).toContain('NO cuenta lo que pide el guion')
    expect(r.avisos[0].texto).toContain('- plano 1: no se ve la fachada: sale una calle vacía')
    expect(r.avisos[0].texto).toContain('Lo que pide el agente: el plano 1 tiene que mostrar la fachada con el letrero')
    // la dirección contesta el aviso y vuelve a integrar: guion v2 → otra clave de pedido → OTRO video
    const iAviso = r.turnos.findIndex((t) => t.tipo === 'responder')
    expect(iAviso).toBeGreaterThan(0)
    expect(r.turnos[iAviso].task).toContain('no se ve la fachada')
    expect(r.enc.estado_del_motor.artefactos['guion'].version).toBe(2)
    expect(r.enviados).toHaveLength(2)
    expect(r.enviados[0]).not.toBe(r.enviados[1])
    expect(r.miradas).toHaveLength(2)
    expect(r.sacados).toHaveLength(2)
    expect(r.descargados).toContain('https://bucket.test/video-final-2.mp4')
    expect(r.enc.estado_del_motor.vueltas[PASO_MIRAR_VIDEO]).toBe(1)
    // a la jefatura llega UNA vez, ya con el video bueno, y sin ficha de la mirada
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
    expect(r.sobres).toHaveLength(1)
    expect(r.sobres[0].contexto.find((x) => x.titulo === 'Lo que vio el agente que miró el video')?.texto).toContain('coincide con el guion y la fila')
    expect(r.enc.estado_del_motor.fichas.filter((f) => f.donde === 'mirada' && f.estado === 'abierta')).toHaveLength(0)
  })
  it('🔴 NO coincide tampoco a la segunda ⇒ no vuelve otra vez (sin lazo): sigue a la jefatura con una ficha QUE BLOQUEA con lo que faltó', async () => {
    const r = await recorrer(C, { mirada: () => MIRADA_MAL })
    expect(r.avisos).toHaveLength(1)
    expect(r.enviados).toHaveLength(2)
    expect(r.miradas).toHaveLength(2)
    expect(r.enc.estado_del_motor.vueltas[PASO_MIRAR_VIDEO]).toBe(1)
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
    expect(r.sobres).toHaveLength(1)
    const f = r.enc.estado_del_motor.fichas.find((x) => x.donde === 'mirada' && x.estado === 'abierta')
    expect(f).toMatchObject({ gravedad: 'bloquea', origen: 'chequeo' })
    expect(f!.que).toContain('plano 1: no se ve la fachada: sale una calle vacía')
    expect(f!.propuesta).toBe('el plano 1 tiene que mostrar la fachada con el letrero')
    expect(r.sobres[0].contexto.find((x) => x.titulo === 'Lo que vio el agente que miró el video')?.texto).toContain('NO coincide')
  })
  it('🔴 (sonda CC7) NO coincide pero NO cabe filmar otro video en el tope: no vuelve (nunca se cierra por tope antes de la jefatura): sigue con la ficha que lo dice', async () => {
    const r = await recorrer(C, { mirada: () => MIRADA_MAL, costoVideo: 4.5, costoIntegrar: 0.4 })
    expect(r.enc.estado).not.toBe('cerrado_por_tope')
    expect(r.avisos).toHaveLength(0)
    expect(r.enviados).toHaveLength(1)
    expect(r.miradas).toHaveLength(1)
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
    expect(r.sobres).toHaveLength(1)
    const f = r.enc.estado_del_motor.fichas.find((x) => x.donde === 'mirada' && x.estado === 'abierta')
    expect(f).toMatchObject({ gravedad: 'bloquea' })
    expect(f!.que).toContain('plano 1: no se ve la fachada: sale una calle vacía')
    expect(f!.que).toContain('no se rehízo solo: volver a la mesa y filmar otro video (reserva US$ 6.10) pasa el tope del encargo (US$ 10')
    expect((r.enc.estado_del_motor.artefactos['mirada_video'].datos as { vuelve_a_la_mesa: boolean }).vuelve_a_la_mesa).toBe(false)
  })
  it('🔴 sin quien saque los cuadros: el agente NO se llama y queda una ficha que bloquea («nadie miró el video»)', async () => {
    const r = await recorrer(C, { mirada: () => MIRADA_BIEN, sinSacador: true })
    expect(r.miradas).toHaveLength(0)
    const f = r.enc.estado_del_motor.fichas.find((x) => x.donde === 'mirada' && x.estado === 'abierta')
    expect(f).toMatchObject({ gravedad: 'bloquea' })
    expect(f!.que).toContain('nadie miró el video antes de la bandeja: el sacador de cuadros no está conectado')
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
  })
  it('🔴 la respuesta del agente no se puede leer dos veces: el video sigue SIN juzgar con una ficha que bloquea (nunca se cae el encargo)', async () => {
    const r = await recorrer(C, { mirada: () => 'no es JSON' })
    expect(r.miradas).toHaveLength(2) // la respuesta y su reintento de formato
    expect(r.enc.estado).not.toBe('fallido')
    const f = r.enc.estado_del_motor.fichas.find((x) => x.donde === 'mirada' && x.estado === 'abierta')
    expect(f!.que).toContain('nadie pudo confirmar que el video cuenta lo que pide el guion')
    expect(r.sobres[0].contexto.some((x) => x.titulo === 'Lo que vio el agente que miró el video')).toBe(false)
  })
})

describe('en ensayo el video no se mira (es simulado) y nada cambia', () => {
  it('dry_run: el paso de cuadros se registra simulado, sin descargar ni llamar al agente', async () => {
    const C = CLIENTES[0][1]
    const M = crearMemoria({ parte: parteDe(C), plantilla: VIDEO_MESA, fuentes: { fotos: C.fotos } })
    M.P.mesa = crearMesaEnMemoria()
    M.P.video = { enviar: async (p) => ({ ok: true, request_id: 'req-1', status: 'simulado', costo_estimado_usd: 2, simulado: p.dry_run }), estado: async () => ({ ok: true, simulado: true }) }
    let sacados = 0
    M.P.sacarCuadros = async () => { sacados++; return { duracion_s: 1, cuadros: [] } }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: C.fila, dry_run: true, familia: 'video_mesa' }, client_id: C.client, target_step_id: TARGET_STEP_PRODUCIR })
    let aportes = 0
    const { ultima, turnos } = await jugar(M, String(a.cuerpo.encargo_id), a, (t: Turno) => {
      if (t.tipo === 'aportar') { aportes++; return { texto: `Aporte de ${t.agente}.` } }
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION(Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé tal cual`).join('\n')) }
      return undefined
    })
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', simulado: true })
    expect(sacados).toBe(0)
    expect(turnos.some((t) => t.paso === PASO_MIRAR_VIDEO)).toBe(false)
    const enc = M.encargos.get(String(a.cuerpo.encargo_id))!
    expect(enc.estado_del_motor.artefactos['cuadros_video'].datos).toMatchObject({ simulado: true, hay_cuadros: false })
  })
})

describe('lo que cuesta volver a la mesa y si cabe', () => {
  const mirar = VIDEO_MESA.pasos.find((p) => p.clave === PASO_MIRAR_VIDEO)!
  const pedido = VIDEO_MESA.pasos.find((p) => p.clave === 'pedido')!
  const e = (gasto: number) => ({ gasto_usd: gasto }) as unknown as Parameters<typeof cabeLaVuelta>[1]
  it('🔴 la reserva son los topes de los pasos que se repiten (pedido, video, cuadros, mirada) más un turno de la mesa', () => {
    expect(costoDeVolver(VIDEO_MESA, mirar)).toBeCloseTo(0 + 5 + 0 + 0.5 + 0.6, 6)
    expect(costoDeVolver(VIDEO_MESA, pedido)).toBeCloseTo(0.6, 6)
    expect(costoDeVolver(VIDEO_MESA, { ...mirar, vuelve_a: { ...mirar.vuelve_a!, paso: 'no-existe' } })).toBe(Number.POSITIVE_INFINITY)
  })
  it('🔴 cabe justo en el tope; un centavo más, no; y respeta la holgura de la prueba', () => {
    expect(cabeLaVuelta(VIDEO_MESA, e(3.9), 6.1)).toBe(true)
    expect(cabeLaVuelta(VIDEO_MESA, e(3.91), 6.1)).toBe(false)
    const conPrueba = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, prueba: { limite_usd: 20, base_usd: 15, encargo_base_usd: 0 } } }
    expect(cabeLaVuelta(conPrueba, e(1), 6.1)).toBe(false)
    expect(cabeLaVuelta(conPrueba, e(1), 3)).toBe(true)
  })
})

describe('la plantilla: dos vueltas a la mesa y la indicación de quien mira', () => {
  it('🔴 el pedido y la mirada vuelven los dos a la mesa (anidadas, mismo destino): válido; con OTRO destino sigue prohibido', () => {
    const errores = validarPlantilla(VIDEO_MESA)
    expect(errores.filter((x) => /vuelve_a|vueltas|mirar_video|video-editor/.test(x))).toEqual([])
    const otroDestino: Plantilla = { ...VIDEO_MESA, pasos: VIDEO_MESA.pasos.map((p) => (p.clave === PASO_MIRAR_VIDEO ? { ...p, vuelve_a: { ...p.vuelve_a!, paso: 'abrir' } } : p)) }
    expect(validarPlantilla(otroDestino)).toContain('las vueltas de «pedido» y «mirar_video» se solapan o se anidan')
  })
  it('🔴 la indicación de quien mira llega con SU pedido (no con la mesa) y dice que juzga él', () => {
    expect(VIDEO_MESA.indicaciones[AGENTE_QUE_MIRA_EL_VIDEO]).toEqual([expect.objectContaining({ aplica: 'guia', regla: expect.stringContaining('juzgas tú') })])
    expect(indicacionDe(VIDEO_MESA, AGENTE_QUE_MIRA_EL_VIDEO)).toContain('1. Cuando miras el video terminado, juzgas tú')
    expect(indicacionDe(VIDEO_MESA, 'oficina-creativa')).toBe('')
    const sinIndicacion: Plantilla = { ...VIDEO_MESA, indicaciones: {} }
    expect(validarPlantilla(sinIndicacion)).toContain(`el agente «${AGENTE_QUE_MIRA_EL_VIDEO}» no tiene indicación`)
  })
})

describe('la migración 202611111730', () => {
  it('🔴 siembra EXACTAMENTE los pasos del código (11: cuadros_video y mirar_video entre video y chequeos)', () => {
    expect(pasosDe(MIG)).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.pasos)))
    expect(VIDEO_MESA.pasos.find((p) => p.clave === PASO_MIRAR_VIDEO)).toMatchObject({ tipo: 'agente', quien: AGENTE_QUE_MIRA_EL_VIDEO, salida: { esquema: 'mirada_video.v1', reintento_formato: 1 } })
  })
  it('🔴 la reversa devuelve los 9 pasos de antes (los mismos del código menos los 2 de la mirada)', () => {
    expect(pasosDe(REV)).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.pasos.filter((p) => p.clave !== 'cuadros_video' && p.clave !== PASO_MIRAR_VIDEO))))
  })
  it('🔴 no pisan: cada una exige el dato ENTERO de antes (la migración, el que deja 202611111700 de CC4 con la vuelta del pedido; la reversa, el de esta)', () => {
    const sinMirada = JSON.parse(JSON.stringify(VIDEO_MESA.pasos.filter((p) => p.clave !== 'cuadros_video' && p.clave !== PASO_MIRAR_VIDEO)))
    expect(antesDe(MIG)).toEqual(sinMirada)
    expect(antesDe(MIG)[2]).toMatchObject({ clave: 'pedido', vuelve_a: { paso: 'mesa', max: 1 } })
    expect(antesDe(REV)).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.pasos)))
    expect(VIDEO_MESA.pasos.find((p) => p.clave === PASO_MIRAR_VIDEO)?.vuelve_a).toEqual({ paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'mirada_video', campo: 'vuelve_a_la_mesa', igual: true } })
    for (const sql of [MIG, REV]) expect(sql).toContain("IS DISTINCT FROM $antes$")
    // las indicaciones: la migración pone la de quien mira (exige {} antes); la reversa vuelve a {} (exige la de la migración)
    expect(indDe(MIG)).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.indicaciones)))
    expect(indDe(MIG, 'ind_antes')).toEqual({})
    expect(indDe(REV)).toEqual({})
    expect(indDe(REV, 'ind_antes')).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.indicaciones)))
  })
  it('🔴 las dos se niegan con encargos de video vivos y comprueban los pasos antes y después; solo tocan las columnas pasos e indicaciones', () => {
    for (const sql of [MIG, REV]) {
      expect(sql).toContain("WHERE familia = 'video_mesa' AND estado IN ('abierto', 'en_paso')) THEN")
      expect(sql.match(/IS DISTINCT FROM ARRAY\[/g)).toHaveLength(2)
      const sentencias = sql.split('\n').filter((l) => !l.startsWith('--')).join('\n')
      expect(sentencias).not.toMatch(/\b(DELETE|DROP|TRUNCATE|INSERT)\b/i)
      expect(sentencias.match(/UPDATE public\.oficina_tipos_de_grupo SET pasos = /g)).toHaveLength(1)
      expect(sentencias.match(/UPDATE public\.oficina_tipos_de_grupo SET pasos = \$pasos\$[\s\S]*?\$pasos\$::jsonb, indicaciones = \$ind\$[\s\S]*?\$ind\$::jsonb WHERE familia = 'video_mesa';/g)).toHaveLength(1)
    }
  })
})
