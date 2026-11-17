/**
 * S2-3 · UNA IMAGEN CLAVE POR PLANO ANTES DE FILMAR (CC2 · GO-LENOVO sprint 2, firma de Emilio 16-nov 21:55) · certifica CC7.
 * Sin red y a US$ 0, por el CAMINO REAL (abrir → mesa → imagenes_clave → revisar_imagenes_clave → pedido → brazo → cuadros → mirada → jefatura), con dos clientes de rubros distintos:
 * un restaurante (reel de Instagram, con fotos propias) y una empresa B2B de seguridad industrial (short de YouTube, sin fotos: el camino «sin foto» de Emilio).
 *  · una imagen vertical por plano; la foto real SOLO en el plano de producto; sin foto apta se genera desde la hoja;
 *  · borrador y final son el MISMO pedido con otra calidad (dato de la plantilla);
 *  · la revisión con visión AVISA: devuelve UNA vez a la mesa y luego sigue con una ficha de sugerencia (nunca bloquea ni tumba el encargo).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '@/lib/cadena/hoja'
import { leerBriefCreativo } from '@/lib/cadena/brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '@/lib/cadena/conceptos'
import type { FormatosPorRed } from '@/lib/cadena/tipos'
import { abrirEncargo } from '../orquestador'
import { armarPedidoV, cabeLaVuelta, costoDeVolver, ejecutarCodigoV, procesarValorV, recibirVideo } from '../orquestador-video'
import { MAX_IMAGENES } from '@/lib/imagenes-del-pedido'
import { AGENTE_QUE_MIRA_EL_VIDEO, AGENTE_QUE_REVISA_LAS_IMAGENES_CLAVE, TOPE_DE_LAS_IMAGENES_CLAVE_USD, TOPE_DE_VIDEO_MESA_USD, VIDEO_MESA } from '../plantillas/video-mesa'
import type { PuertoDeVideo } from '../puertos'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { instantesPorPlano, PASO_MIRAR_VIDEO, senalesDeLaSalida } from '../video/mirada'
import {
  avisoDeLaRevisionALaMesa, CALIDAD_DE_IMAGEN_CLAVE, calidadDeLaFase, esPlanoDeProducto, faseDeProduccion, leerRevisionDeImagenesClave, PASO_IMAGENES_CLAVE, PASO_REVISAR_IMAGENES_CLAVE,
  pedidosDeImagenClave, promptDeImagenClave, tareaDeLaRevisionDeImagenesClave, type PlanoDeLaHoja,
} from '../video/imagen-clave'
import { procesarSalida } from '../salida'
import { validarPlantilla } from '../plantilla'
import { CONTRATOS_EN_TEXTO } from '../pedidos'
import type { Estado, Plantilla } from '../tipos'
import { jugar, type Turno } from './mesa-arnes'
import { FOTOS, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { VIDEO_MESA_ANTES_DE_S2_3 } from './video-mesa-antes-de-s2-3'

const FOTO = FOTOS[0]
const SENALES_REALES = fs.readFileSync(path.join(__dirname, 'fixtures', 'senales-ffmpeg-real.txt'), 'utf8')
const OTRA = FOTOS[1]
const aptas = [{ id: FOTO.id, url: FOTO.url }, { id: OTRA.id, url: OTRA.url }]

// ───────────────────────── las piezas puras
describe('la fase y la calidad son DATO; el borrador y el final piden lo mismo', () => {
  it('🔴 la fase es la de CC1 (`faseDeLaProduccion` · #1070), una sola verdad: borrador con propuestas sin aprobar; final con la aprobada o sin propuestas (el video de hoy)', () => {
    const art = (x: Record<string, unknown>) => ({ artefactos: Object.fromEntries(Object.entries(x).map(([k, d]) => [k, { version: 1, version_consumida: 0, datos: d }])) }) as unknown as Pick<Estado, 'artefactos'>
    expect(faseDeProduccion(art({ propuestas_video: {} }))).toBe('borrador')
    expect(faseDeProduccion(art({ propuestas_video: {}, aprobacion_propuestas: { estado: 'observaciones' } }))).toBe('borrador')
    expect(faseDeProduccion(art({ propuestas_video: {}, aprobacion_propuestas: { estado: 'aprobada', propuesta_id: 'P2' } }))).toBe('final')
    expect(faseDeProduccion(art({ guion: {} }))).toBe('final')
    expect(faseDeProduccion(art({}))).toBe('final')
    expect(faseDeProduccion(null)).toBe('final')
  })
  it('🔴 la calidad de cada fase la dice la plantilla; si está mal escrita, la de por omisión (nunca frena)', () => {
    expect(VIDEO_MESA.limites.imagen_clave).toEqual(CALIDAD_DE_IMAGEN_CLAVE)
    expect(CALIDAD_DE_IMAGEN_CLAVE).toEqual({ borrador: { quality: 'low', size: '1024x1536' }, final: { quality: 'max', size: '1024x1536' } })
    expect(calidadDeLaFase({ imagen_clave: { final: { quality: 'high', size: '1536x1024' } } }, 'final')).toEqual({ quality: 'high', size: '1536x1024' })
    expect(calidadDeLaFase({ imagen_clave: { final: { quality: '', size: '1024x1536' } } }, 'final')).toEqual(CALIDAD_DE_IMAGEN_CLAVE.final)
    expect(calidadDeLaFase({}, 'borrador')).toEqual(CALIDAD_DE_IMAGEN_CLAVE.borrador)
  })
  it('🔴 el prompt: el de la hoja si lo trae; si no, todo lo que la hoja sabe del plano; siempre vertical y SIN texto', () => {
    const p: PlanoDeLaHoja = { n: 2, desde: 3, hasta: 6, se_ve: 'el plato en la mesa', rol: 'prueba', intencion: 'que se antoje', lente: '50 mm cerrado', luz: 'lateral cálida', estado_final: 'el plato servido', movimiento: 'paneo lento', texto_en_pantalla: 'NO DEBE IR' }
    const t = promptDeImagenClave(p, { total: 4, proporcion: '9:16' })
    for (const x of ['shot 2 of 4', '(9:16)', 'Narrative role of the shot: prueba', 'Scene: el plato en la mesa', 'Intention: que se antoje', 'Lens / shot size: 50 mm cerrado', 'Light: lateral cálida', 'End state of the shot: el plato servido', 'paneo lento', 'No text, letters']) expect(t).toContain(x)
    expect(t).not.toContain('NO DEBE IR')
    const propio = promptDeImagenClave({ ...p, prompt_imagen: 'A plate of ceviche on a wooden table' }, { total: 4, proporcion: '9:16' })
    expect(propio).toContain('A plate of ceviche on a wooden table')
    expect(propio).not.toContain('Scene: el plato en la mesa')
    expect(propio).toContain('No text, letters')
  })
  it('🔴 la foto real SOLO en los planos de producto; la que nombra la hoja si es apta; los de ambiente nunca llevan la foto', () => {
    const planos: PlanoDeLaHoja[] = [
      { n: 1, desde: 0, hasta: 3, se_ve: 'la calle', producto: false, foto_id: FOTO.id }, // ambiente aunque nombre foto: sin foto
      { n: 2, desde: 3, hasta: 6, se_ve: 'el plato', producto: true, foto_id: OTRA.id },
      { n: 3, desde: 6, hasta: 9, se_ve: 'el plato de cerca', producto: true },
      { n: 4, desde: 9, hasta: 12, se_ve: 'el cierre' },
    ]
    const r = pedidosDeImagenClave({ planos, aptas, proporcion: '9:16' })
    expect(r.pedidos.map((x) => x.foto?.id ?? null)).toEqual([null, OTRA.id, FOTO.id, null])
    expect(r.pedidos.map((x) => x.sin_foto_apta)).toEqual([false, false, false, false])
    expect(r.no_aptas).toEqual([])
    // determinista: el borrador y el final de la misma hoja piden EXACTAMENTE lo mismo
    expect(pedidosDeImagenClave({ planos, aptas, proporcion: '9:16' })).toEqual(r)
  })
  it('🔴 sin saber qué fotos muestran el protagonista (`rotar: false`): solo lleva foto el plano que la nombra; el resto se genera desde la hoja', () => {
    const planos: PlanoDeLaHoja[] = [{ n: 1, desde: 0, hasta: 3, se_ve: 'a', producto: true, foto_id: FOTO.id }, { n: 2, desde: 3, hasta: 6, se_ve: 'b', producto: true }]
    const r = pedidosDeImagenClave({ planos, aptas, proporcion: '9:16', rotar: false })
    expect(r.pedidos.map((x) => [x.foto?.id ?? null, x.sin_foto_apta])).toEqual([[FOTO.id, false], [null, true]])
  })
  it('🔴 la hoja nombra una foto que no sirve: queda anotada y el plano rota (o se genera si no hay aptas)', () => {
    const planos: PlanoDeLaHoja[] = [{ n: 5, desde: 0, hasta: 3, se_ve: 'a', foto_id: 'no-existe' }]
    expect(esPlanoDeProducto(planos[0])).toBe(true) // nombra una foto ⇒ es de producto
    expect(pedidosDeImagenClave({ planos, aptas, proporcion: '9:16' })).toMatchObject({ pedidos: [{ n: 5, foto: { id: FOTO.id } }], no_aptas: [{ n: 5, id: 'no-existe' }] })
    expect(pedidosDeImagenClave({ planos, aptas: [], proporcion: '9:16' })).toMatchObject({ pedidos: [{ n: 5, foto: null, sin_foto_apta: true }], no_aptas: [{ n: 5, id: 'no-existe' }] })
  })
  it('🔴 la revisión: el esquema exige coincide y por_plano; lo que dijo el agente se guarda sin inventar; el aviso a la mesa trae solo lo que no coincide', () => {
    const v = procesarSalida(JSON.stringify({ coincide: false, por_plano: [{ plano: 1, coincide: true, correccion: '' }, { plano: 2, coincide: false, correccion: 'el plato tiene que ser el de la foto' }], para_la_mesa: 'respetar el producto' }), 'revision_imagenes_clave.v1', 0, 1)
    expect(v.ok).toBe(true)
    const r = leerRevisionDeImagenesClave((v as { valor: Record<string, unknown> }).valor)
    expect(r).toEqual({ coincide: false, por_plano: [{ plano: 1, coincide: true, correccion: '' }, { plano: 2, coincide: false, correccion: 'el plato tiene que ser el de la foto' }], para_la_mesa: 'respetar el producto' })
    const aviso = avisoDeLaRevisionALaMesa(r)
    expect(aviso).toContain('- plano 2: el plato tiene que ser el de la foto')
    expect(aviso).not.toContain('- plano 1')
    expect(aviso).toContain('Lo que pide el agente: respetar el producto')
    expect(procesarSalida(JSON.stringify({ por_plano: [] }), 'revision_imagenes_clave.v1', 0, 1).ok).toBe(false)
    expect(leerRevisionDeImagenesClave({ coincide: 'sí', por_plano: [{ plano: 'x' }, 'basura'] })).toEqual({ coincide: false, por_plano: [], para_la_mesa: '' })
  })
  it('🔴 el pedido del revisor: cada imagen con su plano y, en los de producto, la foto REAL al lado como vara; no trae lista de cosas que buscar', () => {
    const t = tareaDeLaRevisionDeImagenesClave({
      imagenes: [{ n: 1, url: 'https://i/1.png', prompt: '', foto_referencia_id: null, referencia_usada: false, costo_usd: 0, generation_id: 'g1' }, { n: 2, url: 'https://i/2.png', prompt: '', foto_referencia_id: FOTO.id, referencia_usada: true, costo_usd: 0, generation_id: 'g2' }],
      planos: [{ n: 1, desde: 0, hasta: 3, se_ve: 'la calle', rol: 'situar' }, { n: 2, desde: 3, hasta: 6, se_ve: 'el plato', producto: true }, { n: 3, desde: 6, hasta: 9, se_ve: 'el cierre' }],
      fotos: [{ id: FOTO.id, url: FOTO.url }], brief_texto: 'FILA: el plato del día', red: 'instagram', contrato: CONTRATOS_EN_TEXTO['revision_imagenes_clave.v1'],
    })
    expect(t.images).toEqual(['https://i/1.png', 'https://i/2.png', FOTO.url])
    expect(t.task).toContain('- imagen 2: imagen clave del plano 2 (hecha sobre la foto real')
    expect(t.task).toContain(`- imagen 3: la foto REAL «${FOTO.id}» del cliente: es la vara del producto del plano 2`)
    expect(t.task).toContain('- Plano 1 (0–3 s): rol: situar · se ve: la calle')
    expect(t.task).toContain('los planos 3 no tienen imagen')
    expect(t.task).toContain('FILA: el plato del día')
    expect(t.task).toContain('Lo importante lo decides tú')
    expect(t.task).toContain('"por_plano"')
  })
})

// ───────────────────────── la plantilla
describe('la plantilla video_mesa con las imágenes clave', () => {
  it('🔴 los 2 pasos van entre la mesa y el pedido; la revisión vuelve a la mesa UNA vez y solo mira si hay imágenes; la plantilla es válida', () => {
    expect(VIDEO_MESA.pasos.map((p) => p.clave)).toEqual(['abrir', 'mesa', PASO_IMAGENES_CLAVE, PASO_REVISAR_IMAGENES_CLAVE, 'pedido', 'video', 'cuadros_video', PASO_MIRAR_VIDEO, 'chequeos', 'jefatura', 'chequeos_2', 'entrega', 'cierre'])
    expect(VIDEO_MESA.pasos[2]).toMatchObject({ tipo: 'codigo', funcion: 'imagenes_clave', tope_usd: TOPE_DE_LAS_IMAGENES_CLAVE_USD, salida_artefacto: 'imagenes_clave' })
    expect(VIDEO_MESA.pasos[3]).toMatchObject({ tipo: 'agente', quien: AGENTE_QUE_REVISA_LAS_IMAGENES_CLAVE, salida: { esquema: 'revision_imagenes_clave.v1', reintento_formato: 1 }, condicion: { tipo: 'si_artefacto', artefacto: 'imagenes_clave', campo: 'hay_imagenes', igual: true }, vuelve_a: { paso: 'mesa', max: 1 } })
    expect(AGENTE_QUE_REVISA_LAS_IMAGENES_CLAVE).toBe(AGENTE_QUE_MIRA_EL_VIDEO) // el ojo independiente: no escribe la hoja
    // no agrega ningún error a los que la plantilla ya tenía (la mesa y copy_video viven fuera de la lista de funciones: así desde T8)
    expect(validarPlantilla(VIDEO_MESA)).toEqual(validarPlantilla(VIDEO_MESA_ANTES_DE_S2_3))
  })
  it('🔴 la segunda filmación (regla premium) sigue cabiendo: lo gastado al mirar (≈ 22) + volver (19,6) ≤ 45', () => {
    expect(TOPE_DE_VIDEO_MESA_USD).toBe(45)
    const mirar = VIDEO_MESA.pasos.find((p) => p.clave === PASO_MIRAR_VIDEO)!
    const volver = costoDeVolver(VIDEO_MESA, mirar)
    // imagenes 3 + revisión 0,5 + pedido 0 + video 15 + cuadros 0 + mirada 0,5 + un turno de la mesa 0,6
    expect(volver).toBeCloseTo(19.6, 6)
    const e = (gasto: number) => ({ gasto_usd: gasto }) as unknown as Estado
    expect(cabeLaVuelta(VIDEO_MESA, e(3 + 3 + 0.5 + 15 + 0.5), volver)).toBe(true)
    expect(cabeLaVuelta(VIDEO_MESA, e(45 - 19.6 + 0.01), volver)).toBe(false)
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
const GUION = (C: Cliente, citas: string) => [
  '## Plano 1 · 0–4 s', 'Se ve: la fachada del local con su letrero', 'Movimiento: acercamiento lento', 'Foto: ninguna',
  '## Plano 2 · 4–12 s', 'Se ve: unas manos trabajando el producto en primer plano', 'Movimiento: cámara fija', 'Texto en pantalla: Hecho a mano', `Foto: ${C.fotos.length ? `foto:${C.fotos[0].id}` : 'ninguna'}`,
  '## Audio', 'ambiente, sin voz', '## Pie', 'Lo hacemos bien desde el primer día. Escríbenos.', '## Etiquetas', '#hechoamano', '## Citas', citas,
].join('\n')
const REV_BIEN = JSON.stringify({ coincide: true, por_plano: [{ plano: 1, coincide: true, correccion: '' }, { plano: 2, coincide: true, correccion: '' }], para_la_mesa: '' })
const REV_MAL = JSON.stringify({ coincide: false, por_plano: [{ plano: 1, coincide: true, correccion: '' }, { plano: 2, coincide: false, correccion: 'las manos no se ven: sale solo el fondo' }], para_la_mesa: 'el plano 2 tiene que mostrar las manos con el producto' })
const MIRADA_BIEN = JSON.stringify({ coincide: true, orden_respetado: true, faltantes: [], por_plano: [{ plano: 1, se_ve: 'la fachada' }, { plano: 2, se_ve: 'manos trabajando' }], para_la_mesa: '' })
const MIRADA_MAL = JSON.stringify({ coincide: false, orden_respetado: true, faltantes: [{ plano: 1, que_falta: 'no se ve la fachada' }], por_plano: [{ plano: 1, se_ve: 'una calle' }], para_la_mesa: 'mostrar la fachada' })

// 17-nov (CC1 · condición de CC6 para la reserva 30) · `costoVideo`: lo que cobra cada filmación (720p ≈ 5,3 · 1080p ≈ 13); `gastoPrevio`: lo que la mesa (y, cuando se encienda, el borrador) ya gastó, cargado en el PRIMER turno de dirección
async function recorrer(C: Cliente, o: { revision: (k: number) => string; mirada?: (k: number) => string; dry_run?: boolean; imagenFalla?: (n: number) => boolean; costoVideo?: number; gastoPrevio?: number }) {
  const costoVideo = o.costoVideo ?? 2.12
  let previoCargado = false
  const M = crearMemoria({ parte: parteDe(C), plantilla: VIDEO_MESA, fuentes: { fotos: C.fotos } })
  if (o.imagenFalla) M.imagenFalla = o.imagenFalla
  M.P.mesa = crearMesaEnMemoria()
  const MS = M.P.mesa as ReturnType<typeof crearMesaEnMemoria>
  const enviados: string[] = []
  const brazo: PuertoDeVideo = {
    enviar: async (p) => { enviados.push(p.workflow_execution_id); return { ok: true, request_id: `req-${enviados.length}`, status: 'queued', costo_estimado_usd: costoVideo, simulado: p.dry_run } },
    estado: async () => ({ ok: true, simulado: true }),
    cotizar: async () => ({ ok: true, costo_estimado_usd: costoVideo, costo_lista_usd: costoVideo }),
  }
  M.P.video = brazo
  // S2-7 · el sacador devuelve 3 cuadros por plano y las señales leídas de una salida REAL de ffmpeg
  M.P.sacarCuadros = async (_b, planos) => ({ duracion_s: 12, cuadros: instantesPorPlano(planos, 12).map((x) => ({ ...x, bytes: Buffer.from(`jpg-${x.plano}-${x.parte}`) })), senales: senalesDeLaSalida(SENALES_REALES, planos, 12) })
  if (!o.dry_run) M.P.jefatura = async () => ({ estado: 'esperando', review_id: 'rev-1' }) as never
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: C.fila, dry_run: o.dry_run === true, familia: 'video_mesa' }, client_id: C.client, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  let aportes = 0
  const revisiones: Turno[] = []
  const miradas: Turno[] = []
  const turnos: Turno[] = []
  const responder = (t: Turno) => {
    if (t.paso === PASO_REVISAR_IMAGENES_CLAVE) { revisiones.push(t); return { texto: o.revision(revisiones.length - 1), costo_usd: 0.11 } }
    if (t.paso === PASO_MIRAR_VIDEO) { miradas.push(t); return { texto: (o.mirada ?? (() => MIRADA_BIEN))(miradas.length - 1), costo_usd: 0.12 } }
    if (t.tipo === 'aportar') { aportes++; return { texto: `Aporte de ${t.agente}.` } }
    if (t.tipo === 'responder') return { texto: 'Entendido: corrijo la hoja.' }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION(C, Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé tal cual`).join('\n')) }
    if (t.tipo === 'dirigir') { const previo = !previoCargado && o.gastoPrevio !== undefined ? o.gastoPrevio : undefined; previoCargado = true; return { texto: 'Idea rectora: el oficio a mano.', ...(previo !== undefined ? { costo_usd: previo } : {}) } }
    return undefined
  }
  let r = await jugar(M, id, a, responder)
  turnos.push(...r.turnos)
  for (let vez = 1; vez <= 3 && r.ultima.cuerpo.accion === 'esperar_brazo'; vez++) {
    const nBrazo = Number((r.ultima.cuerpo.turno as { n: number }).n)
    const tras = await recibirVideo(M.P, id, nBrazo, { ok: true, status: 'completed', video_url: `https://bucket.test/video-${vez}.mp4`, url_proveedor: null, costo_usd: costoVideo, expires_at: null, copia: 'bucket', aviso: null })
    r = await jugar(M, id, tras, responder)
    turnos.push(...r.turnos)
  }
  const avisos = MS.filas.filter((x) => x.encargo_id === id && x.tipo === 'devuelve' && x.de === 'oficina-creativa')
  return { M, id, enc: M.encargos.get(id)!, fin: r.ultima, revisiones, miradas, enviados, avisos, turnos }
}
const ic = (enc: { estado_del_motor: Estado }) => enc.estado_del_motor.artefactos['imagenes_clave'].datos as { fase: string; calidad: { quality: string; size: string }; planos: Array<{ n: number; url: string; foto_referencia_id: string | null; referencia_usada: boolean; costo_usd: number; prompt: string }>; hay_imagenes: boolean; planos_sin_imagen?: number[]; simulado?: boolean }
const fichasDe = (enc: { estado_del_motor: Estado }, donde: string) => enc.estado_del_motor.fichas.filter((f) => f.donde === donde && f.estado === 'abierta')

describe.each(CLIENTES)('%s · el camino real con las imágenes clave', (_n, C) => {
  const conFotos = C.fotos.length > 0
  it('🔴 una imagen vertical por plano a la calidad FINAL, la foto real solo en el plano de producto; la revisión ve el storyboard; sigue al video y a la jefatura', async () => {
    const r = await recorrer(C, { revision: () => REV_BIEN })
    expect(r.M.llamadas.imagen).toBe(2)
    expect(r.M.llamadas.imagenFotos).toEqual([null, conFotos ? FOTO.id : null])
    expect(r.M.llamadas.imagenCalidades.map((x) => [x.size, x.quality])).toEqual([['1024x1536', 'max'], ['1024x1536', 'max']])
    expect(r.M.llamadas.imagenCalidades[0].prompt).toContain('Scene: la fachada del local con su letrero')
    expect(r.M.llamadas.imagenCalidades[1].prompt).toContain('No text, letters')
    expect(r.M.llamadas.imagenCalidades[1].prompt).not.toContain('Hecho a mano') // el texto en pantalla no va a la imagen
    const x = ic(r.enc)
    expect(x).toMatchObject({ fase: 'final', calidad: { quality: 'max', size: '1024x1536' }, hay_imagenes: true })
    expect(x.planos.map((p) => [p.n, p.foto_referencia_id, p.referencia_usada])).toEqual([[1, null, false], [2, conFotos ? FOTO.id : null, conFotos]])
    // el gasto de cada imagen entra al libro de la oficina
    expect(r.M.gastos.filter((g) => g.concepto === 'imagen').map((g) => g.cost_usd)).toEqual([0.014, 0.014])
    // la revisión: el ojo independiente, una vez, con el storyboard
    expect(r.revisiones).toHaveLength(1)
    expect(r.revisiones[0].agente).toBe(AGENTE_QUE_REVISA_LAS_IMAGENES_CLAVE)
    expect(r.revisiones[0].task).toContain('- imagen 1: imagen clave del plano 1')
    if (conFotos) expect(r.revisiones[0].task).toContain(`la foto REAL «${FOTO.id}» del cliente`)
    expect(r.revisiones[0].task).toContain(C.fila)
    expect(r.enc.estado_del_motor.artefactos['revision_imagenes_clave'].datos).toMatchObject({ coincide: true, vuelve_a_la_mesa: false })
    expect(fichasDe(r.enc, 'revision_imagen_clave')).toHaveLength(0)
    expect(fichasDe(r.enc, 'imagen_clave')).toHaveLength(0)
    expect(r.avisos).toHaveLength(0)
    expect(r.enviados).toHaveLength(1)
    expect(r.miradas).toHaveLength(1)
    // S2-7 · quien mira el video ve, por plano, la imagen clave y luego inicio, medio y final, con lo que midió ffmpeg
    const urls = x.planos.map((p) => p.url)
    expect(r.miradas[0].images!.slice(0, 4)).toEqual([urls[0], expect.stringMatching(/plano-1-inicio.jpg$/), expect.stringMatching(/plano-1-medio.jpg$/), expect.stringMatching(/plano-1-final.jpg$/)])
    expect(r.miradas[0].images![4]).toBe(urls[1])
    expect(r.miradas[0].images!).toHaveLength(8)
    expect(r.miradas[0].task).toContain('- imagen 1: IMAGEN CLAVE del plano 1')
    expect(r.miradas[0].task).toContain('Lo que midió ffmpeg')
    expect(r.miradas[0].task.split('\n').find((l) => l.startsWith('- Plano 1 (0–4 s)'))).toContain('medido: 1 cambio(s) de escena dentro del plano (s 1); 1 s en negro')
    expect(r.enc.estado_del_motor.artefactos['cuadros_video'].datos).toMatchObject({ senales: { duracion_s: 12 } })
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
  })
  it('🔴 la revisión NO coincide ⇒ vuelve SOLA a la mesa UNA vez con la corrección; la hoja v2 rehace las imágenes; la segunda coincide: sigue limpio', async () => {
    const r = await recorrer(C, { revision: (k) => (k === 0 ? REV_MAL : REV_BIEN) })
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0].texto).toContain('ANTES de filmar')
    expect(r.avisos[0].texto).toContain('- plano 2: las manos no se ven: sale solo el fondo')
    expect(r.avisos[0].texto).toContain('Lo que pide el agente: el plano 2 tiene que mostrar las manos con el producto')
    expect(r.enc.estado_del_motor.artefactos['guion'].version).toBe(2)
    expect(r.M.llamadas.imagen).toBe(4)
    expect(r.revisiones).toHaveLength(2)
    expect(r.enc.estado_del_motor.vueltas[PASO_REVISAR_IMAGENES_CLAVE]).toBe(1)
    expect(r.enviados).toHaveLength(1) // el video se filma UNA vez: después de que el storyboard quedó bien
    expect(fichasDe(r.enc, 'revision_imagen_clave')).toHaveLength(0)
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
  })
  it('🔴 NO coincide tampoco a la segunda ⇒ no vuelve otra vez (sin lazo): sigue al video con una ficha de SUGERENCIA (avisa, no bloquea)', async () => {
    const r = await recorrer(C, { revision: () => REV_MAL })
    expect(r.avisos).toHaveLength(1)
    expect(r.revisiones).toHaveLength(2)
    expect(r.enc.estado_del_motor.vueltas[PASO_REVISAR_IMAGENES_CLAVE]).toBe(1)
    expect(r.enviados).toHaveLength(1)
    const f = fichasDe(r.enc, 'revision_imagen_clave')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ gravedad: 'sugerencia', origen: 'chequeo', propuesta: 'el plano 2 tiene que mostrar las manos con el producto' })
    expect(f[0].que).toContain('plano 2: las manos no se ven: sale solo el fondo')
    expect(f[0].que).toContain('ya volvió una vez a la mesa')
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
  })
  it('🔴 la respuesta del revisor no se puede leer dos veces: el video sigue con una ficha de sugerencia (nunca se cae el encargo)', async () => {
    const r = await recorrer(C, { revision: () => 'no es JSON' })
    expect(r.revisiones).toHaveLength(2)
    expect(r.enc.estado).not.toBe('fallido')
    expect(fichasDe(r.enc, 'revision_imagen_clave')[0]).toMatchObject({ gravedad: 'sugerencia' })
    expect(fichasDe(r.enc, 'revision_imagen_clave')[0].que).toContain('nadie pudo confirmar que las imágenes clave cuentan lo que pide la hoja')
    expect(r.enviados).toHaveLength(1)
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
  })
  it('🔴 la mirada del video NO coincide ⇒ vuelve a la mesa (como antes) y la hoja nueva rehace el storyboard antes del segundo video; la vuelta CABE en 45', async () => {
    const r = await recorrer(C, { revision: () => REV_BIEN, mirada: (k) => (k === 0 ? MIRADA_MAL : MIRADA_BIEN) })
    expect(r.enviados).toHaveLength(2)
    expect(r.miradas).toHaveLength(2)
    expect(r.revisiones).toHaveLength(2)
    expect(r.M.llamadas.imagen).toBe(4)
    expect(r.enc.estado_del_motor.vueltas[PASO_MIRAR_VIDEO]).toBe(1)
    expect(r.enc.estado).not.toBe('cerrado_por_tope')
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
  })
  it('🔴 una imagen falla: ese plano queda sin imagen con una ficha de sugerencia; la revisión mira las que hay; el video sigue', async () => {
    const r = await recorrer(C, { revision: () => REV_BIEN, imagenFalla: (n) => n === 1 })
    const x = ic(r.enc)
    expect(x.planos.map((p) => p.n)).toEqual([2])
    expect(x.planos_sin_imagen).toEqual([1])
    expect(fichasDe(r.enc, 'imagen_clave').map((f) => [f.gravedad, f.que])).toEqual([['sugerencia', 'el generador no devolvió la imagen clave del plano 1: proveedor caído']])
    expect(r.revisiones).toHaveLength(1)
    expect(r.revisiones[0].task).toContain('los planos 1 no tienen imagen')
    expect(r.enviados).toHaveLength(1)
  })
  it('🔴 en ensayo las imágenes son simuladas: quedan en el artefacto, pero NO se llama al revisor (no hay nada que mirar)', async () => {
    const r = await recorrer(C, { revision: () => REV_BIEN, dry_run: true })
    expect(r.M.llamadas.imagen).toBe(2)
    expect(r.M.llamadas.imagenReal).toBe(0)
    expect(ic(r.enc)).toMatchObject({ hay_imagenes: false, simulado: true })
    expect(ic(r.enc).planos).toHaveLength(2)
    expect(r.revisiones).toHaveLength(0)
    expect(r.fin.cuerpo).toMatchObject({ accion: 'cerrado', simulado: true })
  })
})

// ───────────────────────── la fase de propuestas (borrador) · el paso solo, con un encargo armado a mano
// ───────────────────────── CC7 16-nov · dinero y tope de imágenes
describe('la revisión de las imágenes clave · dinero y límite del pedido (CC7)', () => {
  const revisar = VIDEO_MESA.pasos.find((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)!
  const estado = (gasto: number) => ({ ultimo: 1, pasos_ejecutados: 5, gasto_usd: gasto, vueltas: {}, fichas: [], artefactos: {} }) as unknown as Estado
  const MAL = { coincide: false, por_plano: [{ plano: 2, coincide: false, correccion: 'el producto no es el de la foto' }], para_la_mesa: 'usar el producto real' }
  it('🔴 NO coincide pero volver NO cabe en el tope: no vuelve a la mesa y deja la ficha de sugerencia que lo dice', () => {
    const volver = costoDeVolver(VIDEO_MESA, revisar)
    expect(volver).toBeGreaterThan(0)
    const sinLugar = procesarValorV(revisar, MAL, estado(TOPE_DE_VIDEO_MESA_USD - volver + 0.01), VIDEO_MESA)!
    expect(sinLugar.res.artefacto).toMatchObject({ vuelve_a_la_mesa: false })
    expect(sinLugar.res.fichas).toHaveLength(1)
    expect(sinLugar.res.fichas![0]).toMatchObject({ gravedad: 'sugerencia', donde: 'revision_imagen_clave' })
    expect(sinLugar.res.fichas![0].que).toContain('no volvió a la mesa: rehacer la hoja y sus imágenes no cabe en el tope del encargo')
    // con lugar, la misma revisión SÍ vuelve
    const conLugar = procesarValorV(revisar, MAL, estado(3), VIDEO_MESA)!
    expect(conLugar.res.artefacto).toMatchObject({ vuelve_a_la_mesa: true })
    expect(conLugar.res.fichas ?? []).toHaveLength(0)
  })
  const im = (n: number, foto: string | null) => ({ n, url: `https://i/${n}.png`, prompt: '', foto_referencia_id: foto, referencia_usada: !!foto, costo_usd: 0, generation_id: `g${n}` })
  const base = { brief_texto: 'x', red: 'instagram', contrato: '' }
  it('🔴 nunca pasa el límite de imágenes del servicio: 12 planos de producto con fotos distintas ⇒ las 12 imágenes clave y las fotos que caben, y dice cuáles no', () => {
    const fotos = Array.from({ length: 12 }, (_, i) => ({ id: `f${i + 1}`, url: `https://f/${i + 1}.jpg` }))
    const planos: PlanoDeLaHoja[] = fotos.map((_, i) => ({ n: i + 1, desde: i, hasta: i + 1, se_ve: 'el producto', producto: true }))
    const t = tareaDeLaRevisionDeImagenesClave({ ...base, imagenes: planos.map((p) => im(p.n, `f${p.n}`)), planos, fotos })
    expect(t.images).toHaveLength(MAX_IMAGENES)
    for (const p of planos) expect(t.images).toContain(`https://i/${p.n}.png`)
    expect(t.task).toContain(`no se muestra: el pedido admite ${MAX_IMAGENES} imágenes`)
  })
  it('🔴 la misma foto real de varios planos se muestra UNA vez y los demás la citan', () => {
    const fotos = [{ id: 'f1', url: 'https://f/1.jpg' }]
    const planos: PlanoDeLaHoja[] = [1, 2, 3].map((n) => ({ n, desde: n, hasta: n + 1, se_ve: 'x', producto: true }))
    const t = tareaDeLaRevisionDeImagenesClave({ ...base, imagenes: planos.map((p) => im(p.n, 'f1')), planos, fotos })
    expect(t.images).toEqual(['https://i/1.png', 'https://f/1.jpg', 'https://i/2.png', 'https://i/3.png'])
    expect(t.task).toContain('la vara del producto del plano 3 es la foto REAL «f1», ya mostrada como imagen 2')
  })
  it('🔴 más imágenes clave que el límite: se reparten parejo (primera y última), el resto se declara sin imagen', () => {
    const planos: PlanoDeLaHoja[] = Array.from({ length: 30 }, (_, i) => ({ n: i + 1, desde: i, hasta: i + 1, se_ve: 'x' }))
    const t = tareaDeLaRevisionDeImagenesClave({ ...base, imagenes: planos.map((p) => im(p.n, null)), planos, fotos: [] })
    expect(t.images).toHaveLength(MAX_IMAGENES)
    expect(t.images[0]).toBe('https://i/1.png')
    expect(t.images[MAX_IMAGENES - 1]).toBe('https://i/30.png')
    expect(t.task).toMatch(/los planos [\d, ]+ no tienen imagen/)
  })
})

describe('el paso imagenes_clave por fase', () => {
  const paso = VIDEO_MESA.pasos.find((p) => p.clave === PASO_IMAGENES_CLAVE)!
  const encargo = (_fase: string | undefined, o: { gasto?: number; candidatas?: Array<{ id: string; cercana?: boolean }>; planos?: PlanoDeLaHoja[] } = {}) => ({
    id: 'enc-1', client_id: 'cli-1', familia: 'video_mesa', dry_run: false,
    estado_del_motor: {
      ultimo: 1, pasos_ejecutados: 4, gasto_usd: o.gasto ?? 3, vueltas: {}, fichas: [],
      artefactos: {
        encargo: { version: 1, version_consumida: 1, datos: { brief: { texto: 'FILA', red: 'instagram' }, proporcion: '9:16', F: { fotos: FOTOS } } },
        guion: { version: 1, version_consumida: 0, datos: { planos: o.planos ?? [{ n: 1, desde: 0, hasta: 3, se_ve: 'la calle' }, { n: 2, desde: 3, hasta: 9, se_ve: 'el plato', producto: true }, { n: 3, desde: 9, hasta: 12, se_ve: 'el plato de cerca', producto: true }] } },
        ...(o.candidatas ? { candidatas_foto: { version: 1, version_consumida: 0, datos: { candidatas: o.candidatas } } } : {}),
      },
    } as unknown as Estado,
  })
  it('🔴 la calidad es DATO de la plantilla: con la del borrador sale low, con la final sale max; el MISMO prompt y la MISMA foto', async () => {
    // (el borrador real llega con las propuestas de CC1, parte B: aquí la plantilla pone la calidad del borrador en la fase final para ejercer el mismo camino)
    const conBorrador: Plantilla = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, imagen_clave: { ...CALIDAD_DE_IMAGEN_CLAVE, final: CALIDAD_DE_IMAGEN_CLAVE.borrador } } as never }
    const corre = async (pl: Plantilla) => { const M = crearMemoria({}); const s = await ejecutarCodigoV(M.P, encargo('final', { candidatas: [{ id: FOTO.id }] }) as never, pl, paso); return { M, s } }
    const b = await corre(conBorrador)
    const f = await corre(VIDEO_MESA)
    expect(b.M.llamadas.imagenCalidades.map((x) => x.quality)).toEqual(['low', 'low', 'low'])
    expect(f.M.llamadas.imagenCalidades.map((x) => x.quality)).toEqual(['max', 'max', 'max'])
    expect(b.M.llamadas.imagenCalidades.map((x) => x.prompt)).toEqual(f.M.llamadas.imagenCalidades.map((x) => x.prompt))
    expect(b.M.llamadas.imagenFotos).toEqual(f.M.llamadas.imagenFotos)
    // con candidatas, los dos planos de producto usan la foto apta; el de ambiente, ninguna
    expect(f.M.llamadas.imagenFotos).toEqual([null, FOTO.id, FOTO.id])
    expect(b.s.res.artefacto).toMatchObject({ fase: 'final', calidad: { quality: 'low' } })
    expect(f.s.res.artefacto).toMatchObject({ fase: 'final', calidad: { quality: 'max', size: '1024x1536' } })
  })
  it('🔴 sin candidatas: un plano de producto sin foto nombrada se GENERA desde la hoja (no se adivina la foto)', async () => {
    const M = crearMemoria({})
    await ejecutarCodigoV(M.P, encargo('final') as never, VIDEO_MESA, paso)
    expect(M.llamadas.imagenFotos).toEqual([null, null, null])
  })
  it('🔴 la hoja nombra la foto por su NOMBRE CORTO: se resuelve a la foto propia', async () => {
    const M = crearMemoria({})
    // las fotos de prueba ya se llaman con 8 letras: el nombre corto es el más corto que sigue siendo único
    const corto = [3, 4, 5, 6].map((k) => FOTO.id.slice(0, k)).find((c) => FOTOS.filter((x) => x.id.startsWith(c)).length === 1)!
    expect(corto.length).toBeLessThan(FOTO.id.length)
    const s = await ejecutarCodigoV(M.P, encargo('final', { planos: [{ n: 1, desde: 0, hasta: 5, se_ve: 'el plato', foto_id: corto }] }) as never, VIDEO_MESA, paso)
    expect(M.llamadas.imagenFotos).toEqual([FOTO.id])
    expect(s.res.artefacto).toMatchObject({ planos: [{ n: 1, foto_referencia_id: FOTO.id, referencia_usada: true }] })
    expect(s.res.fichas ?? []).toEqual([])
  })
  it('🔴 la ruta generó SIN la foto: no cuenta como usada, queda sin referencia y con una ficha que dice por qué', async () => {
    const M = crearMemoria({})
    M.referenciaNoUsada = () => 'la foto no es PNG, JPEG ni WEBP'
    const s = await ejecutarCodigoV(M.P, encargo('final', { planos: [{ n: 1, desde: 0, hasta: 5, se_ve: 'el plato', foto_id: FOTO.id }] }) as never, VIDEO_MESA, paso)
    expect(s.res.artefacto).toMatchObject({ planos: [{ n: 1, foto_referencia_id: null, referencia_usada: false }] })
    expect((s.res.fichas ?? []).map((f) => [f.gravedad, f.que])).toEqual([['sugerencia', expect.stringContaining('se generó sin la foto real')]])
  })
  it('🔴 el tope del paso: ya no se pide otra imagen si no cabe (la primera siempre se mide); los planos sin imagen quedan con su ficha', async () => {
    const M = crearMemoria({})
    // la memoria cobra 0,014 por imagen; con un tope de 0,02 cabe la primera y la segunda no
    const pl: Plantilla = { ...VIDEO_MESA, pasos: VIDEO_MESA.pasos.map((p) => (p.clave === PASO_IMAGENES_CLAVE ? { ...p, tope_usd: 0.02 } : p)) }
    const s = await ejecutarCodigoV(M.P, encargo('final') as never, pl, pl.pasos.find((p) => p.clave === PASO_IMAGENES_CLAVE)!)
    expect(M.llamadas.imagen).toBe(1)
    expect(s.res.artefacto).toMatchObject({ planos_sin_imagen: [2, 3] })
    expect((s.res.fichas ?? []).map((f) => f.que)).toEqual([expect.stringContaining('el plano 2 quedó sin imagen clave: no cabía otra imagen'), expect.stringContaining('el plano 3 quedó sin imagen clave')])
    expect(s.res.costo_usd).toBeCloseTo(0.014, 6)
    // y nunca pasa lo que le queda al encargo: con 44,99 gastados de 45 tampoco
    const M2 = crearMemoria({})
    await ejecutarCodigoV(M2.P, encargo('final', { gasto: 44.99 }) as never, VIDEO_MESA, paso)
    expect(M2.llamadas.imagen).toBe(1)
  })
  it('🔴 el pedido del revisor lleva las imágenes clave y la foto real de los planos de producto', () => {
    const e = encargo('final').estado_del_motor
    e.artefactos['imagenes_clave'] = { version: 1, version_consumida: 0, datos: { planos: [{ n: 2, url: 'https://img.test/2.png', foto_referencia_id: FOTO.id, referencia_usada: true, prompt: '', costo_usd: 0.014, generation_id: 'g' }], hay_imagenes: true } }
    const t = armarPedidoV(VIDEO_MESA.pasos.find((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)!, e)!
    expect(t.esquema).toBe('revision_imagenes_clave.v1')
    expect(t.images).toEqual(['https://img.test/2.png', FOTO.url])
  })
})

// ───────────────────────── 17-nov · CC1 · la segunda filmación con el encargo en 45 (condición de CC6 para la reserva 30 · RESPUESTA Lenovo 05:20)
// Lo previo al video (mesa + imágenes clave) ≈ 17 según la NOTA de CC6: se carga en el primer turno de dirección (16,6 + lo que cuestan aquí las imágenes y su revisión).
// La regla: la mirada solo vuelve a filmar si lo gastado al mirar + volver (19,6) ≤ 45. Si no cabe, NO se cierra por tope antes de la jefatura: sigue con una ficha
// que bloquea y dice cuánto haría falta y cuánto va (la ve una persona). Ningún gasto fuera del libro: lo que el encargo dice que gastó es la suma del libro.
describe.each(CLIENTES)('%s · la segunda filmación con el encargo en 45 (3 casos de CC6)', (_n, C) => {
  const PREVIO = 16.6
  // cada recorrido tiene su propia memoria con UN encargo: el libro entero es el de ese encargo
  const suma = (r: Awaited<ReturnType<typeof recorrer>>) => +r.M.gastos.reduce((t, g) => t + Number(g.cost_usd), 0).toFixed(4)
  it('🔴 1 · la primera a 720p (≈ 5,3): la segunda ENTRA: 2 filmaciones, 2 miradas, sin cierre por tope y dentro de 45', async () => {
    const r = await recorrer(C, { revision: () => REV_BIEN, mirada: (k) => (k === 0 ? MIRADA_MAL : MIRADA_BIEN), costoVideo: 5.3, gastoPrevio: PREVIO })
    expect(r.enviados).toHaveLength(2)
    expect(r.miradas).toHaveLength(2)
    expect(r.enc.estado).not.toBe('cerrado_por_tope')
    expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
    expect(r.enc.estado_del_motor.gasto_usd).toBeLessThanOrEqual(45)
    expect(r.enc.estado_del_motor.fichas.some((x) => (x.que ?? '').includes('no se rehízo solo'))).toBe(false)
    expect(+r.enc.estado_del_motor.gasto_usd.toFixed(4)).toBe(suma(r))
  })
  for (const [nombre, costoVideo, previo] of [['2 · la primera a 1080p (≈ 13)', 13, PREVIO], ['3 · con el borrador delante (≈ 7) y la primera a 720p', 5.3, PREVIO + 7]] as const) {
    it(`🔴 ${nombre}: la segunda NO cabe ⇒ UNA filmación, sin cierre por tope, a la jefatura con la ficha que bloquea y dice la reserva, el tope y lo que va; el gasto es el del libro`, async () => {
      const r = await recorrer(C, { revision: () => REV_BIEN, mirada: () => MIRADA_MAL, costoVideo, gastoPrevio: previo })
      expect(r.enviados).toHaveLength(1)
      expect(r.miradas).toHaveLength(1)
      expect(r.enc.estado).not.toBe('cerrado_por_tope')
      expect(r.fin.cuerpo.accion).toBe('esperar_jefatura')
      const f = r.enc.estado_del_motor.fichas.find((x) => x.donde === 'mirada' && x.estado === 'abierta')!
      expect(f).toMatchObject({ gravedad: 'bloquea' })
      expect(f.que).toContain('no se rehízo solo: volver a la mesa y filmar otro video (reserva US$ 19.60) pasa el tope del encargo (US$ 45; van US$ ')
      expect(r.enc.estado_del_motor.gasto_usd + 19.6).toBeGreaterThan(45)
      expect(+r.enc.estado_del_motor.gasto_usd.toFixed(4)).toBe(suma(r))
    })
  }
})
