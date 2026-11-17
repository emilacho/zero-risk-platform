/**
 * 17-nov · S2-1 (CC1) con la biblioteca de CC4 (S2-2) · entrega aparte, anotada en la certificación de S2-1:
 *  · los ROLES del plano son UNA lista, la de la biblioteca (el guion la re-exporta; no hay copia que se desalinee);
 *  · los AVISOS de ritmo de la guía del cliente van al guion al cerrar la mesa de video (un guion o cada propuesta). Avisan: nunca rechazan ni frenan.
 *  Sin puerto de biblioteca, con la tabla caída o sin ritmos que apliquen: ningún aviso y la pieza cierra igual. US$ 0, todo en seco.
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { avisosDeRitmoDelGuion, ritmosDelVideo } from '../mesa/orquestador'
import { ROLES_DEL_PLANO as ROLES_DE_LA_BIBLIOTECA, leerRitmos } from '../video/biblioteca'
import { ROLES_DEL_PLANO as ROLES_DEL_GUION } from '../video/guion'
import { abrirEncargo } from '../orquestador'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Encargo, Puertos } from '../puertos'
import type { Plantilla } from '../tipos'
import { FILAS_RITMOS, LECTURA_DE_LA_SEMILLA } from './biblioteca-semilla'
import { CLIENTE, FOTOS, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'
import { VIDEO_MESA_ANTES_DE_S2_3 } from './video-mesa-antes-de-s2-3'

const RS = leerRitmos(FILAS_RITMOS)
const AVISO_2_PLANOS = (s: number) => `${s} s con 2 planos: la guía de ritmo «reel de 9 a 15 s» sugiere de 4 a 6`

/** un guion de 12 s con 2 planos; el producto entra en el plano 1 (o en ninguno) */
const GUION = (producto: boolean) => [
  '## Plano 1 · 0–3 s', 'Rol: gancho', 'Se ve: el pan recién salido del horno, el vapor sube', `Producto: ${producto ? 'sí' : 'no'}`, 'Movimiento: acercamiento lento', `Foto: foto:${FOTOS[0].id}`,
  '## Plano 2 · 3–12 s', 'Rol: llamado', 'Se ve: la puerta abierta con la mesa puesta', 'Producto: no', 'Movimiento: cámara fija',
  '## Audio', 'ambiente de cocina, sin voz',
  '## Pie', 'Hay mesa desde las siete.',
  '## Etiquetas', '#pan #desayuno',
  '## Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé',
].join('\n')
const TRES = [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10), '# Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé'].join('\n')
const CON_PROPUESTAS: Plantilla = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 30, propuestas: 3 } } }

type Biblioteca = 'ok' | 'caida' | 'sin_puerto' | 'sin_ritmos' | 'con_red'
/** CC6 (r3/r8) · una guía de la RED del brief (instagram) que cubre la misma duración que la general, con otros topes de planos: debe ganar la de la red */
const RITMO_DE_LA_RED = { ...FILAS_RITMOS.find((r) => r.id === 'reel-9-15')!, id: 'reel-ig', nombre: 'reel de Instagram', red: 'instagram', planos_min: 5, planos_max: 6 }
const AVISO_DE_LA_RED = (s: number) => `${s} s con 2 planos: la guía de ritmo «reel de Instagram» sugiere de 5 a 6`
async function correr(plantilla: Plantilla, texto: string, biblioteca: Biblioteca) {
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla })
  const MS = crearMesaEnMemoria(TRAS_2012)
  let pedidos = 0
  if (biblioteca !== 'sin_puerto') {
    Object.assign(MS, {
      bibliotecaDeVideo: async () => {
        pedidos++
        if (biblioteca === 'caida') throw new Error('tabla caída')
        const l = LECTURA_DE_LA_SEMILLA('Restaurante y panadería')
        return biblioteca === 'sin_ritmos' ? { ...l, ritmos: [] } : biblioteca === 'con_red' ? { ...l, ritmos: [...l.ritmos, RITMO_DE_LA_RED] } : l
      },
    })
  }
  M.P.mesa = MS
  /** el CONTENIDO de cada artefacto que se escribe (la memoria solo guarda su huella): ahí viajan los avisos del cierre (`avisos_del_traductor`) */
  const contenidos: Array<Record<string, unknown>> = []
  const guardar = M.P.almacen.guardar.bind(M.P.almacen)
  M.P.almacen.guardar = async (c) => { if (c.artefacto?.contenido) contenidos.push(c.artefacto.contenido as Record<string, unknown>); return guardar(c) }
  const enviados: unknown[] = []
  M.P.video = {
    enviar: async (p) => { enviados.push(p); return { ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true } },
    estado: async () => ({ ok: true, simulado: true }),
  } as Puertos['video']
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const { ultima } = await jugar(M, id, a, (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan sale del horno.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto }
    return { texto: `Respuesta de ${t.agente}.` }
  }, 120)
  const e = M.encargos.get(id)!.estado_del_motor
  const cierre = [...contenidos].reverse().find((x) => Array.isArray(x.avisos_del_traductor))?.avisos_del_traductor as string[] | undefined
  return { ultima, e, pedidos, enviados, cierre }
}
const avisosDelGuion = (e: { artefactos: Record<string, { datos: unknown }> }) => (e.artefactos['guion']?.datos as { avisos: string[] }).avisos

describe('los roles del plano son UNA lista: la de la biblioteca', () => {
  it('el guion re-exporta la MISMA lista (no una copia)', () => {
    expect(ROLES_DEL_GUION).toBe(ROLES_DE_LA_BIBLIOTECA)
    expect([...ROLES_DEL_GUION]).toEqual(['captar', 'situar', 'informar', 'prueba', 'giro', 'conclusion', 'llamado', 'ambiente'])
  })
})

describe('avisosDeRitmoDelGuion · lo puro', () => {
  const plano = (desde: number, hasta: number, producto?: boolean) => ({ desde, hasta, ...(producto === undefined ? {} : { producto }) })
  it('cuenta los planos por su duración (hasta − desde) y marca el producto solo con «sí»', () => {
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 3, true), plano(3, 12, false)] } as never, null, RS)).toEqual([AVISO_2_PLANOS(12)])
    // el producto entra en el plano 2 (a los 4 s) ⇒ avisa tarde
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 4), plano(4, 6, true), plano(6, 9), plano(9, 12)] } as never, null, RS))
      .toEqual(['el producto entra a los 4 s: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s'])
    // «producto: no» o sin dato no cuentan como producto
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 3, false), plano(3, 6), plano(6, 9), plano(9, 12)] } as never, null, RS))
      .toEqual(['el producto no aparece en ningún plano: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s'])
    // dentro de la guía: sin avisos
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 2, true), plano(2, 5), plano(5, 8), plano(8, 12)] } as never, null, RS)).toEqual([])
  })
  it('la duración de cada plano es hasta − desde (no hasta): el producto que entra a los 2 s no avisa', () => {
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 1), plano(1, 2), plano(2, 3, true), plano(3, 12)] } as never, null, RS)).toEqual([])
  })
  it('un plano con tiempos al revés cuenta 0 (lo anula la biblioteca, no resta): el producto entra a los 3 s y avisa', () => {
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 3), plano(5, 1), plano(1, 4, true), plano(4, 12)] } as never, null, RS))
      .toEqual(['el producto entra a los 3 s: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s'])
  })
  it('sin ritmos o sin planos: ningún aviso', () => {
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [plano(0, 12)] } as never, null, [])).toEqual([])
    expect(avisosDeRitmoDelGuion({ segundos: 12, planos: [] } as never, null, RS)).toEqual([])
  })
})

describe('ritmosDelVideo · la guía del cliente para el cierre', () => {
  const enc = { client_id: CLIENTE } as Encargo
  it('sin puerto o con la tabla caída: ninguna guía (nunca frena)', async () => {
    expect(await ritmosDelVideo({} as Puertos, enc)).toEqual([])
    expect(await ritmosDelVideo({ mesa: { bibliotecaDeVideo: async () => { throw new Error('caída') } } } as unknown as Puertos, enc)).toEqual([])
  })
  it('con la biblioteca: los ritmos del cliente, pedidos con su id', async () => {
    const vistos: string[] = []
    const r = await ritmosDelVideo({ mesa: { bibliotecaDeVideo: async (c: string) => { vistos.push(c); return LECTURA_DE_LA_SEMILLA('Restaurante y panadería') } } } as unknown as Puertos, enc)
    expect(vistos).toEqual([CLIENTE])
    expect(r.map((x) => x.id)).toContain('reel-9-15')
  })
})

describe('el cierre de la mesa de video lleva los avisos de ritmo al guion', () => {
  it('🔴 un guion de 12 s con 2 planos ⇒ el guion avisa los planos de menos; la pieza cierra igual y el video se pide', async () => {
    const r = await correr(VIDEO_MESA_ANTES_DE_S2_3, GUION(true), 'ok')
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(r.enviados).toHaveLength(1)
    expect(avisosDelGuion(r.e)).toContain(AVISO_2_PLANOS(12))
    expect(avisosDelGuion(r.e).filter((a) => a.includes('guía de ritmo'))).toHaveLength(1)
  })
  it('sin producto en cuadro ⇒ también lo avisa', async () => {
    const r = await correr(VIDEO_MESA_ANTES_DE_S2_3, GUION(false), 'ok')
    expect(avisosDelGuion(r.e)).toContain('el producto no aparece en ningún plano: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s')
  })
  it.each(['caida', 'sin_puerto', 'sin_ritmos'] as const)('biblioteca %s ⇒ ningún aviso de ritmo y la pieza cierra igual', async (b) => {
    const r = await correr(VIDEO_MESA_ANTES_DE_S2_3, GUION(true), b)
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(r.enviados).toHaveLength(1)
    expect(avisosDelGuion(r.e).some((a) => a.includes('guía de ritmo'))).toBe(false)
  })
  it('🔴 con N propuestas, el guion de CADA una lleva SUS avisos (por su duración)', async () => {
    const r = await correr(CON_PROPUESTAS, TRES, 'ok')
    const pv = r.e.artefactos['propuestas_video']?.datos as { propuestas: Array<{ id: string; guion: { avisos: string[] } }> }
    expect(pv.propuestas.map((p) => p.id)).toEqual(['P1', 'P2', 'P3'])
    expect(pv.propuestas.map((p) => p.guion.avisos.filter((a) => a.includes('guía de ritmo')))).toEqual([[AVISO_2_PLANOS(12)], [AVISO_2_PLANOS(15)], [AVISO_2_PLANOS(10)]])
  })
  it('🔴 (CC6 r3) con una guía de la red del brief y una general para la misma duración, el guion único recibe el aviso de la de la RED', async () => {
    const r = await correr(VIDEO_MESA_ANTES_DE_S2_3, GUION(true), 'con_red')
    const deRitmo = avisosDelGuion(r.e).filter((a) => a.includes('guía de ritmo'))
    expect(deRitmo).toEqual([AVISO_DE_LA_RED(12)])
  })
  it('🔴 (CC6 r8) lo mismo con N propuestas: cada guion recibe el aviso de la guía de la RED', async () => {
    const r = await correr(CON_PROPUESTAS, TRES, 'con_red')
    const pv = r.e.artefactos['propuestas_video']?.datos as { propuestas: Array<{ guion: { avisos: string[] } }> }
    expect(pv.propuestas.map((p) => p.guion.avisos.filter((a) => a.includes('guía de ritmo')))).toEqual([[AVISO_DE_LA_RED(12)], [AVISO_DE_LA_RED(15)], [AVISO_DE_LA_RED(10)]])
  })
  it('🔴 (CC6 + CC5) la tarjeta «Propuestas» lee `propuestas_video.avisos`: ahí van los de ritmo con el id de su propuesta; el cierre no los repite', async () => {
    const r = await correr(CON_PROPUESTAS, TRES, 'ok')
    const pv = r.e.artefactos['propuestas_video']?.datos as { avisos: string[] }
    const esperados = [`P1 · ${AVISO_2_PLANOS(12)}`, `P2 · ${AVISO_2_PLANOS(15)}`, `P3 · ${AVISO_2_PLANOS(10)}`]
    expect(pv.avisos.filter((a) => a.includes('guía de ritmo'))).toEqual(esperados)
    expect(r.cierre?.filter((a) => a.includes('guía de ritmo'))).toEqual(esperados)
    expect(new Set(r.cierre).size).toBe(r.cierre!.length)
  })
  it('con N propuestas y la biblioteca caída: ninguna lleva aviso de ritmo', async () => {
    const r = await correr(CON_PROPUESTAS, TRES, 'caida')
    const pv = r.e.artefactos['propuestas_video']?.datos as { propuestas: Array<{ guion: { avisos: string[] } }> }
    expect(pv.propuestas).toHaveLength(3)
    for (const p of pv.propuestas) expect(p.guion.avisos.some((a) => a.includes('guía de ritmo'))).toBe(false)
    expect((r.e.artefactos['propuestas_video']?.datos as { avisos: string[] }).avisos.some((a) => a.includes('guía de ritmo'))).toBe(false)
  })
})
