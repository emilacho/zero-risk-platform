/**
 * 17-nov · Sprint 2 · S2-3 (CC2) · el BORRADOR de las imágenes clave por propuesta y los dos cuadros de los planos largos.
 * Contrato con CC1 (#1075) y CC5 (la tarjeta «Propuestas»): `imagenes_clave = { fase: 'borrador', propuestas: [{ id, planos: [{ n, url, imagenes[] }], costo_usd }] }`;
 * con la propuesta aprobada corre `imagenes_clave_final` (la MISMA función, en final). Decisión de Lenovo 16-nov 22:23: el plano de más de 3 s lleva dos cuadros en el borrador.
 * Orden de pasos acordado: mesa → imagenes_clave → (borrador_video · CC3) → aprobar_propuestas → imagenes_clave_final → revisar_imagenes_clave → pedido…
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { abrirEncargo, recibirDecisionDelDueno, type Respuesta } from '../orquestador'
import { armarPedidoV, ejecutarCodigoV } from '../orquestador-video'
import { validarPlantilla } from '../plantilla'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado, Paso, Plantilla } from '../tipos'
import {
  imagenesClaveVigentes, llevaDosCuadros, PASO_IMAGENES_CLAVE, PASO_IMAGENES_CLAVE_FINAL, PASO_REVISAR_IMAGENES_CLAVE, promptDeImagenClave, promptDelCierre,
  SEGUNDOS_PARA_DOS_CUADROS, type ImagenesClave, type PlanoDeLaHoja,
} from '../video/imagen-clave'
import { propuestasDeLaDecision } from '@/lib/direccion/decisiones-propuestas'
import { CLIENTE, FOTOS, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'

const FOTO = FOTOS[0]
const PASO = VIDEO_MESA.pasos.find((p) => p.clave === PASO_IMAGENES_CLAVE)!
const PASO_FINAL: Paso = { ...PASO, clave: PASO_IMAGENES_CLAVE_FINAL, salida_artefacto: PASO_IMAGENES_CLAVE_FINAL }

// ───────────────────────── las piezas puras
describe('los dos cuadros de un plano largo (decisión de Lenovo 16-nov 22:23)', () => {
  const base: PlanoDeLaHoja = { n: 2, desde: 3, hasta: 6, se_ve: 'el plato en la mesa', rol: 'antojo', estado_final: 'el plato servido, vapor arriba', movimiento: 'paneo lento' }
  it('🔴 dura MÁS de 3 s y la hoja dice cómo termina ⇒ dos cuadros; 3 s justos, o sin cómo termina, uno', () => {
    expect(SEGUNDOS_PARA_DOS_CUADROS).toBe(3)
    expect(llevaDosCuadros(base)).toBe(false) // 3 s justos
    expect(llevaDosCuadros({ ...base, hasta: 6.5 })).toBe(true)
    expect(llevaDosCuadros({ ...base, hasta: 9, estado_final: undefined })).toBe(true) // basta el movimiento
    expect(llevaDosCuadros({ ...base, hasta: 9, estado_final: undefined, movimiento: undefined })).toBe(false) // sin cómo termina no se inventa el cierre
  })
  it('🔴 el cierre es el MISMO prompt base congelado al final: último cuadro del clip, con el estado final de la hoja', () => {
    const p = { ...base, hasta: 9 }
    const arranque = promptDeImagenClave(p, { total: 3, proporcion: '9:16' })
    const cierre = promptDelCierre(p, { total: 3, proporcion: '9:16' })
    expect(cierre).toContain('It will be the LAST frame of the clip of this shot.')
    expect(cierre).not.toContain('It will be the first frame')
    expect(cierre).toContain('Freeze the END of the shot, not its start: el plato servido, vapor arriba.')
    expect(cierre).toContain('Scene: el plato en la mesa') // la escena es la misma
    expect(cierre).toContain('No text, letters') // la regla del texto también
    expect(arranque).toContain('It will be the first frame of the clip of this shot.')
    // sin estado final, el cierre sale del movimiento
    expect(promptDelCierre({ ...p, estado_final: undefined }, { total: 3, proporcion: '9:16' })).toContain('the moment right after this movement ends: paneo lento')
  })
})

describe('las imágenes clave VIGENTES (las que leen la revisión, el clip y la mirada)', () => {
  const art = (x: Record<string, unknown>) => ({ artefactos: Object.fromEntries(Object.entries(x).map(([k, d]) => [k, { version: 1, version_consumida: 0, datos: d }])) }) as unknown as Pick<Estado, 'artefactos'>
  it('🔴 las del borrador NUNCA (son para que el dueño elija); con la final, la final; sin propuestas, las de imagenes_clave', () => {
    expect(imagenesClaveVigentes(art({ imagenes_clave: { fase: 'borrador', planos: [], propuestas: [] } }))).toBeNull()
    expect(imagenesClaveVigentes(art({ imagenes_clave: { fase: 'borrador', planos: [] }, imagenes_clave_final: { fase: 'final', planos: [{ n: 1, url: 'F' }] } }))?.planos[0].url).toBe('F')
    expect(imagenesClaveVigentes(art({ imagenes_clave: { fase: 'final', planos: [{ n: 1, url: 'H' }] } }))?.planos[0].url).toBe('H')
    expect(imagenesClaveVigentes(art({}))).toBeNull()
    // si las dos son finales, manda la del paso final
    expect(imagenesClaveVigentes(art({ imagenes_clave: { fase: 'final', planos: [{ n: 1, url: 'H' }] }, imagenes_clave_final: { fase: 'final', planos: [{ n: 1, url: 'F' }] } }))?.planos[0].url).toBe('F')
  })
  it('🔴 la revisión con visión no recibe imágenes del borrador', () => {
    const e = encargoReal({ fase: 'propuesta' }).estado_del_motor
    e.artefactos.imagenes_clave = { version: 1, version_consumida: 0, datos: { fase: 'borrador', planos: [], propuestas: [{ id: 'P1', planos: [{ n: 1, url: 'https://img.test/b.png', imagenes: ['https://img.test/b.png'] }], costo_usd: 0 }], hay_imagenes: false } }
    const t = armarPedidoV(VIDEO_MESA.pasos.find((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)!, e)!
    expect(t.images).toEqual([])
  })
  it('🔴 con la propuesta aprobada, la revisión y la mirada leen la tanda FINAL (imagenes_clave_final), no la del borrador', () => {
    const e = encargoReal({ fase: 'aprobada' }).estado_del_motor
    e.artefactos.imagenes_clave = { version: 1, version_consumida: 0, datos: { fase: 'borrador', planos: [{ n: 1, url: 'https://img.test/borrador.png' }], propuestas: [], hay_imagenes: false } }
    e.artefactos.imagenes_clave_final = { version: 1, version_consumida: 0, datos: { fase: 'final', planos: [{ n: 1, url: 'https://img.test/final-1.png', foto_referencia_id: null }, { n: 2, url: 'https://img.test/final-2.png', foto_referencia_id: null }], hay_imagenes: true } }
    const rev = armarPedidoV(VIDEO_MESA.pasos.find((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)!, e)!
    expect(rev.images).toEqual(['https://img.test/final-1.png', 'https://img.test/final-2.png'])
    e.artefactos.cuadros_video = { version: 1, version_consumida: 0, datos: { cuadros: [{ plano: 1, segundo: 1, url: 'https://c/plano-1-medio.jpg', parte: 'medio' }, { plano: 2, segundo: 6, url: 'https://c/plano-2-medio.jpg', parte: 'medio' }], senales: null } }
    const mir = armarPedidoV(VIDEO_MESA.pasos.find((p) => p.clave === 'mirar_video')!, e)!
    expect(mir.images).toContain('https://img.test/final-1.png')
    expect(mir.images).not.toContain('https://img.test/borrador.png')
  })
})

// ───────────────────────── el paso, con el generador de verdad (dry_run false, memoria que cobra 0,014 por imagen)
const hoja = (n: number, desde: number, hasta: number, x: Partial<PlanoDeLaHoja> = {}): PlanoDeLaHoja => ({ n, desde, hasta, se_ve: `escena ${n}`, ...x })
const PROPUESTAS = [
  { id: 'P1', planos: [hoja(1, 0, 3, { producto: true, foto_id: FOTO.id }), hoja(2, 3, 9, { estado_final: 'la mesa llena' })] },
  { id: 'P2', planos: [hoja(1, 0, 5, { producto: true, foto_id: FOTO.id, estado_final: 'el pan partido' }), hoja(2, 5, 8)] },
]
function encargoReal(o: { fase: 'propuesta' | 'aprobada'; gasto?: number; propuestas?: typeof PROPUESTAS }) {
  const ps = (o.propuestas ?? PROPUESTAS).map((p) => ({ id: p.id, nombre: p.id, concepto: '', segundos: 9, red: 'instagram', objetivo: '', por_que: '', texto: '', guion: { planos: p.planos, segundos: 9 } }))
  return {
    id: 'enc-1', client_id: 'cli-1', familia: 'video_mesa', dry_run: false,
    estado_del_motor: {
      ultimo: 1, pasos_ejecutados: 4, gasto_usd: o.gasto ?? 1, vueltas: {}, fichas: [],
      artefactos: {
        encargo: { version: 1, version_consumida: 1, datos: { brief: { texto: 'FILA', red: 'instagram' }, proporcion: '9:16', F: { fotos: FOTOS } } },
        propuestas_video: { version: 1, version_consumida: 0, datos: { ronda: 1, propuestas: ps, citas: '', avisos: [] } },
        ...(o.fase === 'aprobada' ? {
          aprobacion_propuestas: { version: 1, version_consumida: 0, datos: { estado: 'aprobada', propuesta_id: 'P2', ronda: 1 } },
          guion: { version: 1, version_consumida: 0, datos: { planos: (o.propuestas ?? PROPUESTAS)[1].planos } },
        } : {}),
      },
    } as unknown as Estado,
  }
}

describe('el paso imagenes_clave en la fase de PROPUESTAS (borrador)', () => {
  it('🔴 una tanda por propuesta, en borrador (low); primero el arranque de todos los planos y después los cierres de los largos, con la MISMA foto', async () => {
    const M = crearMemoria({})
    const s = await ejecutarCodigoV(M.P, encargoReal({ fase: 'propuesta' }) as never, VIDEO_MESA, PASO)
    // 4 arranques (P1·1, P1·2, P2·1, P2·2) + 2 cierres (P1·2 dura 6 s; P2·1 dura 5 s). P2·2 dura 3 s: uno
    expect(M.llamadas.imagen).toBe(6)
    expect(M.llamadas.imagenCalidades.every((x) => x.quality === 'low' && x.size === '1024x1536')).toBe(true)
    expect(M.llamadas.imagenCalidades.slice(0, 4).every((x) => x.prompt.includes('first frame'))).toBe(true)
    expect(M.llamadas.imagenCalidades.slice(4).every((x) => x.prompt.includes('LAST frame'))).toBe(true)
    expect(M.llamadas.imagenCalidades[4].prompt).toContain('la mesa llena')
    expect(M.llamadas.imagenCalidades[5].prompt).toContain('el pan partido')
    // la foto: la del plano de producto en su arranque y en su cierre; los de ambiente, ninguna
    expect(M.llamadas.imagenFotos).toEqual([FOTO.id, null, FOTO.id, null, null, FOTO.id])
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a.fase).toBe('borrador')
    expect(a.planos).toEqual([])
    expect(a.hay_imagenes).toBe(false) // la revisión con visión no se llama en el borrador: lo mira el dueño
    expect(a.propuestas!.map((p) => p.id)).toEqual(['P1', 'P2'])
    const [p1, p2] = a.propuestas!
    expect(p1.planos.map((x) => [x.n, x.url, x.imagenes])).toEqual([[1, 'https://img.test/1.png', ['https://img.test/1.png']], [2, 'https://img.test/2.png', ['https://img.test/2.png', 'https://img.test/5.png']]])
    expect(p2.planos.map((x) => [x.n, x.url, x.imagenes])).toEqual([[1, 'https://img.test/3.png', ['https://img.test/3.png', 'https://img.test/6.png']], [2, 'https://img.test/4.png', ['https://img.test/4.png']]])
    // el costo: por plano, por propuesta y del paso; un gasto por imagen
    expect(p1.planos[1].costo_usd).toBeCloseTo(0.028, 6)
    expect(p1.costo_usd).toBeCloseTo(0.042, 6)
    expect(p2.costo_usd).toBeCloseTo(0.042, 6)
    expect(s.res.costo_usd).toBeCloseTo(0.084, 6)
    expect(s.gastos).toHaveLength(6)
    expect(s.res.fichas ?? []).toEqual([])
  })
  it('🔴 el tope reparte: con lugar solo para los arranques, TODAS las propuestas tienen storyboard y los cierres quedan con ficha', async () => {
    const M = crearMemoria({})
    const pl: Plantilla = { ...VIDEO_MESA, pasos: VIDEO_MESA.pasos.map((p) => (p.clave === PASO_IMAGENES_CLAVE ? { ...p, tope_usd: 0.06 } : p)) }
    const s = await ejecutarCodigoV(M.P, encargoReal({ fase: 'propuesta' }) as never, pl, pl.pasos.find((p) => p.clave === PASO_IMAGENES_CLAVE)!)
    expect(M.llamadas.imagen).toBe(4) // 4 × 0,014 = 0,056; un quinto pasaría 0,06
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a.propuestas!.every((p) => p.planos.length === 2 && !p.planos_sin_imagen)).toBe(true)
    expect(a.propuestas!.flatMap((p) => p.planos.map((x) => x.imagenes!.length))).toEqual([1, 1, 1, 1])
    expect((s.res.fichas ?? []).map((f) => [f.id, f.que])).toEqual([
      ['imagen-clave-4-P1-tope-cierre-2', expect.stringContaining('el plano 2 de la propuesta P1 dura más de 3 s y quedó con un solo cuadro')],
      ['imagen-clave-4-P2-tope-cierre-1', expect.stringContaining('el plano 1 de la propuesta P2 dura más de 3 s y quedó con un solo cuadro')],
    ])
    expect(s.res.costo_usd).toBeCloseTo(0.056, 6)
  })
  it('🔴 un arranque que falla deja su plano sin imagen (con ficha de SU propuesta) y sin cierre; las demás siguen', async () => {
    const M = crearMemoria({})
    M.imagenFalla = (n: number) => n === 2 // el arranque de P1·2
    const s = await ejecutarCodigoV(M.P, encargoReal({ fase: 'propuesta' }) as never, VIDEO_MESA, PASO)
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a.propuestas![0]).toMatchObject({ id: 'P1', planos_sin_imagen: [2] })
    expect(a.propuestas![0].planos.map((x) => x.n)).toEqual([1])
    expect(a.propuestas![1].planos.map((x) => x.n)).toEqual([1, 2])
    expect((s.res.fichas ?? []).map((f) => f.id)).toEqual(['imagen-clave-4-P1-falla-2'])
    expect(M.llamadas.imagen).toBe(5) // 4 arranques (uno falló) + 1 cierre (el de P2·1); el de P1·2 no se pide
  })
  it('🔴 una propuesta sin planos queda con su ficha; las demás tienen su storyboard', async () => {
    const M = crearMemoria({})
    const s = await ejecutarCodigoV(M.P, encargoReal({ fase: 'propuesta', propuestas: [PROPUESTAS[0], { id: 'P2', planos: [] }] }) as never, VIDEO_MESA, PASO)
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a.propuestas!.map((p) => [p.id, p.planos.length])).toEqual([['P1', 2], ['P2', 0]])
    expect((s.res.fichas ?? []).map((f) => f.id)).toEqual(['imagen-clave-4-P2-sin-planos'])
  })
})

describe('el paso en FINAL (la propuesta aprobada) y el video sin propuestas', () => {
  it('🔴 imagenes_clave_final: la elegida en máxima calidad, un cuadro por plano (los dos cuadros son del borrador)', async () => {
    const M = crearMemoria({})
    const s = await ejecutarCodigoV(M.P, encargoReal({ fase: 'aprobada' }) as never, VIDEO_MESA, PASO_FINAL)
    expect(M.llamadas.imagenCalidades.map((x) => x.quality)).toEqual(['max', 'max'])
    expect(M.llamadas.imagenFotos).toEqual([FOTO.id, null])
    const a = s.res.artefacto as unknown as ImagenesClave
    expect(a).toMatchObject({ fase: 'final', hay_imagenes: true })
    expect(a.propuestas).toBeUndefined()
    expect(a.planos.map((x) => x.imagenes)).toEqual([['https://img.test/1.png'], ['https://img.test/2.png']])
  })
  it('🔴 sin propuestas, imagenes_clave ya sale en final y el paso final la COPIA sin gastar (nunca se paga dos veces)', async () => {
    const M = crearMemoria({})
    const e = encargoReal({ fase: 'aprobada' })
    delete (e.estado_del_motor.artefactos as Record<string, unknown>).propuestas_video
    delete (e.estado_del_motor.artefactos as Record<string, unknown>).aprobacion_propuestas
    const primera = await ejecutarCodigoV(M.P, e as never, VIDEO_MESA, PASO)
    expect(M.llamadas.imagen).toBe(2)
    e.estado_del_motor.artefactos.imagenes_clave = { version: 1, version_consumida: 0, datos: primera.res.artefacto! }
    const s = await ejecutarCodigoV(M.P, e as never, VIDEO_MESA, PASO_FINAL)
    expect(M.llamadas.imagen).toBe(2)
    expect(s.res.costo_usd).toBe(0)
    expect(s.gastos).toBeUndefined()
    expect(s.res.artefacto).toMatchObject({ fase: 'final', copiado_de: 'imagenes_clave', planos: (primera.res.artefacto as unknown as ImagenesClave).planos })
  })
})

describe('la tarjeta «Propuestas» lee el borrador (contrato con CC1 y CC5)', () => {
  it('🔴 cada plano de cada propuesta trae su imagen y sus cuadros; el costo del borrador es el de SU propuesta', async () => {
    const M = crearMemoria({})
    const enc = encargoReal({ fase: 'propuesta' })
    const s = await ejecutarCodigoV(M.P, enc as never, VIDEO_MESA, PASO)
    enc.estado_del_motor.artefactos.imagenes_clave = { version: 1, version_consumida: 0, datos: s.res.artefacto! }
    const t = propuestasDeLaDecision({ id: enc.id, brief_id: 'B' }, enc.estado_del_motor as never, VIDEO_MESA.pasos as never)!
    expect(t.lista.map((p) => p.id)).toEqual(['P1', 'P2'])
    expect(t.lista[0].planos.map((x) => [x.imagen_url, x.imagenes])).toEqual([['https://img.test/1.png', ['https://img.test/1.png']], ['https://img.test/2.png', ['https://img.test/2.png', 'https://img.test/5.png']]])
    expect(t.lista[1].planos[0].imagenes).toEqual(['https://img.test/3.png', 'https://img.test/6.png'])
    expect(t.lista.map((p) => p.costo?.borrador_usd)).toEqual([0.042, 0.042])
  })
})

// ───────────────────────── el camino entero con la plantilla del orden acordado (en ensayo, como el de CC1)
const PASO_APROBAR: Paso = {
  clave: 'aprobar_propuestas', tipo: 'codigo', quien: 'sala', funcion: 'aprobar_propuestas', condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: 'aprobacion_propuestas', tope_usd: 0,
  vuelve_a: { paso: 'mesa', max: 2, si: { tipo: 'si_artefacto', artefacto: 'aprobacion_propuestas', campo: 'vuelve_a_la_mesa', igual: true } },
}
/** mesa → imagenes_clave → aprobar_propuestas → imagenes_clave_final → revisar_imagenes_clave (sobre la final) → pedido… */
const conElOrdenAcordado = (propuestas: number): Plantilla => {
  const sin = VIDEO_MESA.pasos.filter((p) => p.clave !== PASO_IMAGENES_CLAVE && p.clave !== PASO_REVISAR_IMAGENES_CLAVE)
  const rev = VIDEO_MESA.pasos.find((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)!
  const i = sin.findIndex((p) => p.clave === 'mesa')
  const revFinal: Paso = { ...rev, condicion: { tipo: 'si_artefacto', artefacto: PASO_IMAGENES_CLAVE_FINAL, campo: 'hay_imagenes', igual: true }, entrada: [PASO_IMAGENES_CLAVE_FINAL, 'guion'] }
  return { ...VIDEO_MESA, pasos: [...sin.slice(0, i + 1), PASO, PASO_APROBAR, PASO_FINAL, revFinal, ...sin.slice(i + 1)], limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 15, propuestas } } }
}
async function montar(propuestas = 3) {
  const pl = conElOrdenAcordado(propuestas)
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: pl })
  M.P.mesa = crearMesaEnMemoria(TRAS_2012)
  M.P.video = { enviar: async () => ({ ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true }), estado: async () => ({ ok: true, simulado: true }) }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const TRES = [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
  const responder = (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: tres caminos para el pan.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: [propuestas > 1 ? TRES : PROPUESTA(1, 'El vapor', 12), '# Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé'].join('\n') }
    return { texto: `Respuesta de ${t.agente}.` }
  }
  return { M, id, pl, a, seguir: (r: Respuesta) => jugar(M, id, r, responder, 80) }
}

describe('el camino entero · mesa → borrador por propuesta → el dueño elige → final', () => {
  it('la plantilla del orden acordado es válida', () => {
    expect(validarPlantilla(conElOrdenAcordado(3))).toEqual(validarPlantilla(VIDEO_MESA))
  })
  it('🔴 la tarjeta muestra el storyboard de las 3 propuestas; al aprobar P2, la final sale de la elegida y el borrador queda como estaba', async () => {
    const T = await montar()
    await T.seguir(T.a)
    const e1 = T.M.encargos.get(T.id)!.estado_del_motor
    const b = e1.artefactos.imagenes_clave.datos as unknown as ImagenesClave
    expect(b.fase).toBe('borrador')
    expect(b.propuestas!.map((p) => [p.id, p.planos.length])).toEqual([['P1', 2], ['P2', 2], ['P3', 2]])
    expect(T.M.llamadas.imagenCalidades.map((x) => x.quality)).toEqual(Array(6).fill('low'))
    expect(e1.artefactos.imagenes_clave_final).toBeUndefined() // espera al dueño: nada en final todavía
    const t = propuestasDeLaDecision({ id: T.id, brief_id: 'F1-S1-ig-r1' }, e1 as never, T.pl.pasos as never)!
    expect(t.lista.every((p) => p.planos.every((x) => !!x.imagen_url))).toBe(true)
    const d = await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' })
    await T.seguir(d)
    const e2 = T.M.encargos.get(T.id)!.estado_del_motor
    const f = e2.artefactos.imagenes_clave_final.datos as unknown as ImagenesClave
    expect(f.fase).toBe('final')
    expect(f.planos.map((x) => x.n)).toEqual([1, 2])
    expect(T.M.llamadas.imagenCalidades.slice(6).map((x) => x.quality)).toEqual(['max', 'max'])
    // el prompt final del plano 2 es el de la hoja de la ELEGIDA (P2 dura 15 s: «3–15 s»)
    expect(e2.artefactos.imagenes_clave.datos).toEqual(e1.artefactos.imagenes_clave.datos)
    expect(imagenesClaveVigentes(e2)).toBe(f)
  })
  it('🔴 sin propuestas (una sola hoja), el storyboard sale en final una vez y el paso final lo copia: 2 imágenes, no 4', async () => {
    const T = await montar(1)
    await T.seguir(T.a)
    const e = T.M.encargos.get(T.id)!.estado_del_motor
    expect(T.M.llamadas.imagen).toBe(2)
    expect(e.artefactos.imagenes_clave_final.datos).toMatchObject({ fase: 'final', copiado_de: 'imagenes_clave' })
  })
})
