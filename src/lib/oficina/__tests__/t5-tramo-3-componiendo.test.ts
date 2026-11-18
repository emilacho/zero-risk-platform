/**
 * 18-nov · Sprint 3 · T5 tramo 3 · EL PASO «COMPONIENDO» (CC4 · la vara de CC7: RESPUESTA-CC7-a-CC4-tramo-3-lo-que-voy-a-medir.md).
 * El encargo entero con la mesa, el brazo falso del camino B y un SERVICIO DE RENDER falso: las fases se retoman entre vueltas del vigía sin
 * repetir pedidos, el plazo cuenta desde la hora guardada, máximo 2 renders, una alarma por incidente, el texto sale de los cortes reales,
 * nada se inventa, el compuesto solo tras bajarlo y guardarlo, los borradores nunca llaman al servicio y el libro no suma nada. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { datos } from '../ayudas'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { abrirEncargo } from '../orquestador'
import { sondearPlanos, sondearVideos } from '../orquestador-video'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { PuertoDeComposicionDeVideo, EstadoDelTrabajoDeRender } from '../puertos'
import type { Plantilla } from '../tipos'
import { MINUTOS_PARA_RENDIR, NOMBRE_DEL_UNIDO, PEDIDOS_DE_RENDER_MAX, type InfoDelCompuesto } from '../video/motor-composicion'
import type { PedidoDeVideoCompuesto } from '../../../../packages/carousel-engine/src/video-html'
import { SEGUNDOS_DE_CIERRE } from '../../../../packages/carousel-engine/src/video-html'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { ALMACEN, PLANTILLA_B, brazo, enviados3, hecho } from './s2-4-arnes'

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)])
type Est = { estado: EstadoDelTrabajoDeRender; error?: string } | { falla: string; reintentar: boolean }

/** el servicio de render falso: cada lectura toma el siguiente estado del guion (el último se repite) */
function servicio(o: { renders?: Est[]; analisis?: Array<Est & { palabras?: unknown[] }>; rendir?: Array<{ falla: string; reintentar: boolean } | 'ok'>; bajar?: 'ok' | { falla: string; reintentar: boolean } } = {}) {
  const reg = { analizar: [] as unknown[], analisis: 0, rendir: [] as PedidoDeVideoCompuesto[], archivos: [] as Array<Array<{ nombre: string; url: string }>>, render: 0, bajar: 0 }
  const toma = <T,>(xs: T[] | undefined, i: number, por: T): T => (xs?.length ? xs[Math.min(i, xs.length - 1)] : por)
  const S: PuertoDeComposicionDeVideo = {
    async analizar(p) { reg.analizar.push(p); return { ok: true, id: `an-${reg.analizar.length}` } },
    async analisis() {
      const e = toma(o.analisis, reg.analisis++, { estado: 'listo' as const, palabras: [] })
      if ('falla' in e) return { ok: false, error: e.falla, reintentar: e.reintentar }
      return { ok: true, estado: e.estado, error: e.error ?? null, resultado: e.estado === 'listo' ? { palabras: (e as { palabras?: unknown[] }).palabras ?? [], inicio_de_voz: null, motor: 'whisper', golpes: null, bpm: null, confianza: null, avisos: [] } : null }
    },
    async rendir(p) {
      const r = toma(o.rendir, reg.rendir.length, 'ok' as const)
      reg.rendir.push(p.pedido); reg.archivos.push(p.archivos)
      return r === 'ok' ? { ok: true, id: `r-${reg.rendir.length}`, fonts_faltantes: [] } : { ok: false, error: r.falla, reintentar: r.reintentar }
    },
    async render() {
      const e = toma(o.renders, reg.render++, { estado: 'listo' as const })
      return 'falla' in e ? { ok: false, error: e.falla, reintentar: e.reintentar } : { ok: true, estado: e.estado, error: e.error ?? null, segundos_de_render: 42 }
    },
    async bajar() { reg.bajar++; const b = o.bajar ?? 'ok'; return b === 'ok' ? { ok: true, mp4: MP4 } : { ok: false, error: b.falla, reintentar: b.reintentar } },
  }
  return { S, reg }
}

const PLANTILLA_C: Plantilla = { ...PLANTILLA_B, limites: { ...PLANTILLA_B.limites, video: { ...(PLANTILLA_B.limites.video as Record<string, unknown>), componer: true } } }
const guion = (subtitulos: string[] = []) => [
  '## Plano 1 · 0–4 s', 'Rol: captar', 'Se ve: el pan recién salido del horno', 'Producto: sí', 'Movimiento: acercamiento lento', 'Texto en pantalla: Pan del día', 'Foto: ninguna',
  '## Plano 2 · 4–8 s', 'Rol: informar', 'Se ve: una mano parte el pan', 'Producto: sí', 'Movimiento: cámara fija', 'Foto: ninguna',
  '## Plano 3 · 8–12 s', 'Rol: llamado', 'Se ve: la puerta abierta con la mesa puesta', 'Producto: no', 'Movimiento: cámara fija', 'Texto en pantalla: Reserva hoy', 'Foto: ninguna',
  '## Audio', 'voz en off que invita a pasar', ...subtitulos, '## Pie', 'Hay mesa desde las siete.', '## Etiquetas', '#pan',
  '## Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé',
].join('\n')

async function hastaElBrazo(o: { plantilla?: Plantilla; guion?: string; servicio?: PuertoDeComposicionDeVideo | null } = {}) {
  const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: o.plantilla ?? PLANTILLA_C })
  M.P.mesa = crearMesaEnMemoria(TRAS_2012)
  M.P.video = b.v
  if (o.servicio) M.P.componerVideo = o.servicio
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: false, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const g = o.guion ?? guion()
  const { ultima } = await jugar(M, id, a, (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan sale del horno.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: g }
    return { texto: `Respuesta de ${t.agente}.` }
  }, 120)
  expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo' })
  const n = Number((ultima.cuerpo.turno as { n: number }).n)
  const T0 = new Date('2026-11-18T03:00:00Z').getTime()
  /** una vuelta del vigía a los `min` minutos */
  const vuelta = (min: number) => sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-18T02:58:00Z' }], new Date(T0 + min * 60_000))
  const enc = () => M.encargos.get(id)!
  const video = () => datos(enc().estado_del_motor, 'video') as unknown as { video_url: string; aviso: string | null; costo_usd: number; compuesto?: InfoDelCompuesto } | undefined
  const turno = () => M.turnos.get(id)!.get(n)!
  const alarmas = () => M.llamadas.avisos.filter((x) => x.canal === 'alertas' && /sin componer/.test(x.texto))
  return { M, id, b, vuelta, enc, video, turno, alarmas }
}

describe('1 · apagado no cambia nada · sin servicio, el unido con UN aviso', () => {
  it('🔴 sin `componer` en la plantilla: el video unido sale en la misma vuelta y el servicio no se llama', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ plantilla: PLANTILLA_B, servicio: s.S })
    await x.vuelta(1)
    expect(x.video()?.video_url).toMatch(/video-unido-/)
    expect(x.video()?.compuesto).toBeUndefined()
    expect(x.video()?.aviso).toBeNull()
    expect(s.reg).toMatchObject({ analizar: [], rendir: [], render: 0, bajar: 0 })
  })
  it('🔴 con `componer` y SIN servicio: el unido en la misma vuelta, un aviso y ninguna alarma', async () => {
    const x = await hastaElBrazo({ servicio: null })
    await x.vuelta(1)
    expect(x.video()?.video_url).toMatch(/video-unido-/)
    expect(x.video()?.aviso).toMatch(/servicio de render no está configurado/)
    expect(x.video()?.compuesto).toMatchObject({ compuesto: false, pedidos_de_render: 0 })
    expect(x.alarmas()).toHaveLength(0)
  })
})

describe('2 · las fases se retoman entre vueltas, sin repetir pedidos · plazo desde la hora guardada · máximo 2 renders', () => {
  it('🔴 5 vueltas con el render en fila ⇒ 1 pedido; los clips no se vuelven a preguntar ni a unir; el encargo sigue en paso con el brazo corriendo', async () => {
    const s = servicio({ renders: [{ estado: 'en_fila' }] })
    const x = await hastaElBrazo({ servicio: s.S })
    for (const m of [1, 2, 3, 4, 5]) expect((await x.vuelta(m)).reanudar).toEqual([])
    expect(s.reg.rendir).toHaveLength(1)
    expect(s.reg.render).toBe(4)
    expect(x.b.reg.uniones).toBe(1)
    expect(x.b.reg.preguntados).toHaveLength(3)
    expect(x.enc().estado).toBe('en_paso')
    expect(x.turno().estado).toBe('corriendo')
    expect(x.video()).toBeUndefined()
  })
  it('🔴 un render fallido ⇒ un 2.º pedido; el 2.º falla ⇒ NUNCA un 3.º: el unido con el aviso', async () => {
    const s = servicio({ renders: [{ estado: 'en_fila' }, { estado: 'fallido', error: 'chromium murió' }, { estado: 'en_fila' }, { estado: 'fallido', error: 'otra vez' }] })
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1); await x.vuelta(2)
    expect(s.reg.rendir).toHaveLength(1)
    await x.vuelta(3)
    expect(s.reg.rendir).toHaveLength(2)
    await x.vuelta(4); await x.vuelta(5)
    expect(s.reg.rendir).toHaveLength(PEDIDOS_DE_RENDER_MAX)
    await x.vuelta(6)
    expect(s.reg.rendir).toHaveLength(2)
    expect(x.video()?.video_url).toMatch(/video-unido-/)
    expect(x.video()?.aviso).toMatch(/sin textos ni cierre de marca: el render falló \(otra vez\)/)
    expect(x.video()?.compuesto).toMatchObject({ compuesto: false, pedidos_de_render: 2 })
  })
  it('🔴 el plazo cuenta desde la hora GUARDADA del pedido: a los 19 min espera; a los 20 min, el unido', async () => {
    const s = servicio({ renders: [{ estado: 'rindiendo' }] })
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1)
    await x.vuelta(1 + MINUTOS_PARA_RENDIR - 1)
    expect(x.video()).toBeUndefined()
    await x.vuelta(1 + MINUTOS_PARA_RENDIR)
    expect(x.video()?.aviso).toMatch(/el render no terminó en 20 min/)
    expect(s.reg.rendir).toHaveLength(1)
  })
  it('el servicio no acepta el pedido por algo pasajero: cuenta como pedido; se pide otra vez en la vuelta siguiente y el 2.º entra', async () => {
    const s = servicio({ rendir: [{ falla: 'servicio de render 503', reintentar: true }, 'ok'] })
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1)
    expect(s.reg.rendir).toHaveLength(1)
    expect(x.video()).toBeUndefined()
    await x.vuelta(2)
    expect(s.reg.rendir).toHaveLength(2)
    await x.vuelta(3)
    expect(x.video()?.compuesto).toMatchObject({ compuesto: true, pedidos_de_render: 2 })
  })
  it('el servicio rechaza el pedido por algo que no se arregla solo (400): el unido en el acto, sin 2.º pedido', async () => {
    const s = servicio({ rendir: [{ falla: 'servicio de render 400: html de más', reintentar: false }] })
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1)
    expect(s.reg.rendir).toHaveLength(1)
    expect(x.video()?.aviso).toMatch(/no aceptó el video \(servicio de render 400/)
  })
})

describe('3 · una alarma por incidente', () => {
  it('🔴 un render que falla dos veces a lo largo de 6 vueltas: UNA sola alarma (la vuelta que cierra)', async () => {
    const s = servicio({ renders: [{ estado: 'en_fila' }, { estado: 'fallido' }, { estado: 'en_fila' }, { estado: 'fallido' }] })
    const x = await hastaElBrazo({ servicio: s.S })
    for (const m of [1, 2, 3, 4, 5, 6]) await x.vuelta(m)
    expect(x.alarmas()).toHaveLength(1)
  })
  it('lo que sale bien no alarma', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1); await x.vuelta(2)
    expect(x.video()?.compuesto).toMatchObject({ compuesto: true })
    expect(x.alarmas()).toHaveLength(0)
  })
})

describe('4 · los segundos del texto salen de los cortes reales · 5 · nada se inventa', () => {
  it('🔴 textos en [0,4] y el remate («llamado») va en el cierre con la firma de la marca; el servicio baja el unido por su nombre', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1)
    const p = s.reg.rendir[0]
    expect(p.segundos).toBe(12)
    expect(p.textos).toEqual([{ desde: 0, hasta: 4, texto: 'Pan del día' }])
    expect(p.cierre).toEqual({ titular: 'Reserva hoy', desde: 12 - SEGUNDOS_DE_CIERRE })
    expect(p.firma).toBe('@naufrago.ec')
    expect(p.video).toBe(NOMBRE_DEL_UNIDO)
    expect(s.reg.archivos[0]).toEqual([{ nombre: NOMBRE_DEL_UNIDO, url: expect.stringMatching(/video-unido-/) }])
  })
  it('🔴 sin «## Subtítulos» en el guion: no se transcribe y el pedido no trae subtítulos', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1)
    expect(s.reg.analizar).toHaveLength(0)
    expect('subtitulos' in s.reg.rendir[0]).toBe(false)
  })
  it('🔴 con subtítulos pedidos y la transcripción FALLIDA: sin subtítulos y con aviso (nunca se inventan); el render sigue en la misma vuelta', async () => {
    const s = servicio({ analisis: [{ estado: 'fallido', error: 'whisper no cargó' }] })
    const x = await hastaElBrazo({ servicio: s.S, guion: guion(['## Subtítulos', 'sí · Energía: alta']) })
    await x.vuelta(1)
    expect(s.reg.analizar).toHaveLength(1)
    expect(s.reg.rendir).toHaveLength(0)
    await x.vuelta(2)
    expect(s.reg.rendir).toHaveLength(1)
    expect('subtitulos' in s.reg.rendir[0]).toBe(false)
    await x.vuelta(3)
    expect(x.video()?.aviso).toMatch(/sin subtítulos: la transcripción falló \(whisper no cargó\)/)
    expect(x.video()?.compuesto).toMatchObject({ compuesto: true, subtitulos: null })
  })
  it('🔴 con subtítulos pedidos y palabras con tiempo: van agrupados con la energía de la pieza', async () => {
    const palabras = [{ texto: 'Pasa', desde: 0.2, hasta: 0.5 }, { texto: 'y', desde: 0.5, hasta: 0.6 }, { texto: 'prueba', desde: 0.6, hasta: 1.0 }, { texto: 'el', desde: 1.4, hasta: 1.5 }, { texto: 'pan', desde: 1.5, hasta: 1.9 }]
    const s = servicio({ analisis: [{ estado: 'listo', palabras }] })
    const x = await hastaElBrazo({ servicio: s.S, guion: guion(['## Subtítulos', 'sí · Energía: alta']) })
    await x.vuelta(1); await x.vuelta(2); await x.vuelta(3)
    expect(s.reg.analizar[0]).toMatchObject({ voz: { nombre: NOMBRE_DEL_UNIDO, url: expect.stringMatching(/video-unido-/) }, musica: null })
    const sub = s.reg.rendir[0].subtitulos ?? []
    expect(sub.flatMap((g) => g.palabras.map((w) => w.texto))).toEqual(['Pasa', 'y', 'prueba', 'el', 'pan'])
    expect(x.video()?.compuesto).toMatchObject({ compuesto: true, subtitulos: sub.length })
  })
  it('con subtítulos pedidos y la transcripción que nunca termina: a los 10 min sigue sin subtítulos', async () => {
    const s = servicio({ analisis: [{ estado: 'en_fila' }] })
    const x = await hastaElBrazo({ servicio: s.S, guion: guion(['## Subtítulos', 'sí']) })
    await x.vuelta(1); await x.vuelta(10)
    expect(s.reg.rendir).toHaveLength(0)
    await x.vuelta(11)
    expect(s.reg.rendir).toHaveLength(1)
  })
})

describe('6 · el compuesto, solo tras bajarlo y guardarlo · 9 · el artefacto lo cuenta', () => {
  it('🔴 listo ⇒ se baja, se guarda y ESE es el video del encargo; el artefacto dice de qué unido salió', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ servicio: s.S })
    const r1 = await x.vuelta(1)
    expect(r1.reanudar).toEqual([])
    const r2 = await x.vuelta(2)
    expect(r2.reanudar).toEqual([x.id])
    expect(s.reg.bajar).toBe(1)
    expect(x.M.llamadas.archivos.some((a) => /^video-compuesto-\d+\.mp4$/.test(a))).toBe(true)
    expect(x.video()?.video_url).toMatch(/video-compuesto-/)
    expect(x.video()?.compuesto).toMatchObject({ compuesto: true, de: expect.stringMatching(/video-unido-/), textos: 1, con_cierre: true, segundos_de_render: 42, pedidos_de_render: 1 })
  })
  it('🔴 no se pudo bajar (no pasajero): el unido con el aviso, nunca un compuesto a medias', async () => {
    const s = servicio({ bajar: { falla: 'el servicio de render no devolvió un MP4', reintentar: false } })
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1); await x.vuelta(2)
    expect(x.video()?.video_url).toMatch(/video-unido-/)
    expect(x.video()?.aviso).toMatch(/no se pudo bajar el video compuesto/)
    expect(x.alarmas()).toHaveLength(1)
  })
  it('🔴 bajado pero no se pudo guardar: el unido con el aviso', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ servicio: s.S })
    await x.vuelta(1)
    const guardar = x.M.P.guardarArchivos
    x.M.P.guardarArchivos = async (ruta, archivos) => (archivos.some((a) => a.nombre.startsWith('video-compuesto-')) ? { ok: false, error: 'bucket lleno' } : guardar(ruta, archivos))
    await x.vuelta(2)
    expect(x.video()?.video_url).toMatch(/video-unido-/)
    expect(x.video()?.aviso).toMatch(/no se pudo guardar el video compuesto \(bucket lleno\)/)
  })
})

describe('7 · los borradores nunca llaman al servicio · 8 · el libro no suma nada', () => {
  it('🔴 un lote de borradores (propuestas) con `componer` encendido: se unen y el servicio no se toca', async () => {
    const s = servicio()
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    const enviados = enviados3.map((p) => ({ ...p, propuesta: 'P1' }))
    const enc = { id: 'enc1', client_id: 'cli1', brief_id: 'b', estado_del_motor: { artefactos: {}, gasto_usd: 0 } }
    const P = { video: b.v, componerVideo: s.S, ahora: () => new Date('2026-11-18T03:00:00Z'), async guardarArchivos(_r: string, a: Array<{ nombre: string }>) { return { ok: true as const, urls: { [a[0].nombre]: `${ALMACEN}/x.mp4` } } } }
    const r = await sondearPlanos(P as never, enc as never, enviados, '2026-11-18T02:58:00Z', new Date('2026-11-18T03:00:00Z'))
    expect(r).toMatchObject({ ok: true, status: 'borradores' })
    expect(s.reg).toMatchObject({ analizar: [], rendir: [], render: 0, bajar: 0 })
  })
  it('🔴 compuesto o no, el libro lleva lo MISMO: un gasto «video» por clip y nada más; el costo del video es el de los clips', async () => {
    const s = servicio()
    const x = await hastaElBrazo({ servicio: s.S })
    const antes = x.M.gastos.length
    await x.vuelta(1); await x.vuelta(2)
    const nuevos = x.M.gastos.slice(antes)
    expect(nuevos.map((g) => [g.concepto, g.cost_usd])).toEqual([['video', 1.06], ['video', 1.06], ['video', 1.06]])
    expect(x.video()?.costo_usd).toBeCloseTo(3.18, 6)
  })
})
