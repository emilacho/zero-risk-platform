/**
 * 17-nov · S2-4 tramo 2 (CC1) · cada clip del camino B arranca de la imagen clave FINAL de su plano (#1072/#1076): es su primer cuadro, manda sobre la foto propia
 * (que ya fue su referencia al dibujarla) y pasa por el encuadre como cualquier foto (aviso de CC3: una imagen clave cuadrada daría un plano cuadrado en un reel).
 * El texto del clip es el «Prompt de video» de la hoja cuando arranca de su imagen clave. US$ 0: puertos falsos.
 */
import { describe, expect, it } from 'vitest'
import { ejecutarCodigoV } from '../orquestador-video'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { encuadrarFotos } from '../video/motor-planos'
import { pedidosPorPlano, promptDelClip, promptDelPlano, type PedidoDePlano } from '../video/planos'
import { PASO_IMAGENES_CLAVE, PASO_IMAGENES_CLAVE_FINAL } from '../video/imagen-clave'
import type { FotoEtiquetada } from '../fotos'
import type { Plantilla } from '../tipos'

const ALMACEN = 'https://abcd.supabase.co/storage/v1/object/public/oficina'
const FOTOS: FotoEtiquetada[] = [{ id: '9f71b0e9-0000-4000-8000-000000000001', url: `${ALMACEN}/fotos/fachada.jpg`, origen: 'propia' }]
const IC = (n: number, fase = 'final') => `${ALMACEN}/imagenes-clave/${fase}/p${n}.png`
const guion = {
  ok: true, segundos: 12, audio: 'olas', pie_de_foto: 'pie', hashtags: ['#a'], fotos_ids: [], avisos: [], texto: 'guion',
  planos: [
    { n: 1, desde: 0, hasta: 4, se_ve: 'Fachada al amanecer', foto_id: FOTOS[0].id, prompt_video: 'Acercamiento lento hacia la puerta; termina con la puerta abierta.' },
    { n: 2, desde: 4, hasta: 8, se_ve: 'Olla hirviendo', movimiento: 'cámara fija' },
    { n: 3, desde: 8, hasta: 12, se_ve: 'Cierre con el logo', foto_id: FOTOS[0].id },
  ],
}
const brief = { id: 'F1-S1-ig-r1', red: 'Instagram', formato: 'reel', prohibido: [], aprueba: '', texto: 'brief' }
const pedidos = (imagenesClave?: Array<{ n: number; url: string }>) =>
  (pedidosPorPlano({ guion, brief, fotos: FOTOS, clave: 'enc1:F1:v1', relacion: '9:16', ...(imagenesClave ? { imagenesClave } : {}) }) as { ok: true; pedidos: PedidoDePlano[] }).pedidos

describe('pedidosPorPlano · el primer cuadro de cada clip', () => {
  it('🔴 con imagen clave: es el primer cuadro (manda sobre la foto propia) y el texto es el «Prompt de video» de la hoja', () => {
    const p = pedidos([1, 2, 3].map((n) => ({ n, url: IC(n) })))
    expect(p.map((x) => [x.n, x.fotos[0], x.primer_cuadro])).toEqual([[1, IC(1), 'imagen_clave'], [2, IC(2), 'imagen_clave'], [3, IC(3), 'imagen_clave']])
    expect(p[0].prompt).toBe('Acercamiento lento hacia la puerta; termina con la puerta abierta. Audio: olas')
    // sin «Prompt de video»: el texto de siempre del plano
    expect(p[1].prompt).toBe(promptDelPlano(guion.planos[1], 'olas'))
  })
  it('sin imagen clave: la foto propia del plano o solo el texto (como antes)', () => {
    const p = pedidos()
    expect(p.map((x) => [x.n, x.fotos[0] ?? null, x.primer_cuadro])).toEqual([[1, FOTOS[0].url, 'foto_propia'], [2, null, 'texto'], [3, FOTOS[0].url, 'foto_propia']])
    expect(p[0].prompt).toBe(promptDelPlano(guion.planos[0], 'olas'))
  })
  it('imagen clave de SOLO algunos planos: el resto sigue con su foto o su texto; una url vacía no cuenta', () => {
    const p = pedidos([{ n: 2, url: IC(2) }, { n: 3, url: '  ' }])
    expect(p.map((x) => x.primer_cuadro)).toEqual(['foto_propia', 'imagen_clave', 'foto_propia'])
  })
  it('foto citada que no existe pero hay imagen clave: no se avisa «foto no hallada» (el clip tiene su primer cuadro)', () => {
    const g = { ...guion, planos: guion.planos.map((x) => (x.n === 3 ? { ...x, foto_id: 'no-existe' } : x)) }
    const sin = (pedidosPorPlano({ guion: g, brief, fotos: FOTOS, clave: 'k', relacion: '9:16' }) as { ok: true; pedidos: PedidoDePlano[] }).pedidos
    expect(sin[2].foto_no_hallada).toBeTruthy()
    const con = (pedidosPorPlano({ guion: g, brief, fotos: FOTOS, clave: 'k', relacion: '9:16', imagenesClave: [{ n: 3, url: IC(3) }] }) as { ok: true; pedidos: PedidoDePlano[] }).pedidos
    expect(con[2].foto_no_hallada).toBeFalsy()
  })
  it('promptDelClip · respeta el máximo y sin audio pone el de omisión', () => {
    expect(promptDelClip({ ...guion.planos[0] }, '', 3600)).toBe('Acercamiento lento hacia la puerta; termina con la puerta abierta. Audio: música o sonido ambiente acorde a la escena.')
    expect(promptDelClip({ ...guion.planos[0] }, 'olas', 20)).toHaveLength(20)
    expect(promptDelClip({ ...guion.planos[0], prompt_video: '   ' }, 'olas')).toBe(promptDelPlano(guion.planos[0], 'olas'))
  })
})

describe('el encuadre también pasa por la imagen clave (aviso de CC3)', () => {
  it('🔴 cada imagen clave se encuadra a la proporción de la red y el plano viaja con el ENCUADRE', async () => {
    const encuadres: string[] = []
    const P = {
      video: { async encuadrar(p: { url: string; relacion: string }) { encuadres.push(`${p.url}@${p.relacion}`); return { ok: true as const, bytes: Buffer.from('jpg') } } },
      async guardarArchivos(ruta: string, a: Array<{ nombre: string }>) { return { ok: true as const, urls: Object.fromEntries(a.map((x) => [x.nombre, `${ALMACEN}/${ruta}/${x.nombre}`])) } },
    }
    const r = await encuadrarFotos(P as never, { id: 'enc1', client_id: 'cli1', dry_run: false }, pedidos([1, 2, 3].map((n) => ({ n, url: IC(n) }))), 1)
    expect(encuadres).toEqual([1, 2, 3].map((n) => `${IC(n)}@9:16`))
    expect(r.ok && r.planos.every((p) => p.fotos[0].includes('/encuadres/'))).toBe(true)
  })
})

// el paso «pedido» del encargo lee las imágenes clave vigentes (la FINAL; nunca el borrador)
const conB: Plantilla = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as object), plano_por_plano: true } } }
const pasoPedido = VIDEO_MESA.pasos.find((p) => p.clave === 'pedido')!
const enc = (extra: Record<string, unknown>) => ({
  id: 'enc1', client_id: 'cli1', brief_id: brief.id, familia: 'video_mesa', dry_run: false,
  estado_del_motor: {
    artefactos: {
      encargo: { version: 1, datos: { brief, proporcion: '9:16', F: { fotos: FOTOS }, familia: 'video', plataforma: 'instagram-reel', elementos: [], formato_video: 'reel' } },
      guion: { version: 1, datos: structuredClone(guion) },
      ...extra,
    },
    gasto_usd: 0, pasos_ejecutados: 3, fichas: [],
  },
})
const ic = (fase: string) => ({ version: 1, datos: { fase, calidad: fase === 'final' ? 'alta' : 'baja', hay_imagenes: true, planos: [1, 2, 3].map((n) => ({ n, url: IC(n, fase), prompt: 'p' })) } })

describe('el paso «pedido» toma las imágenes clave del encargo', () => {
  const planosDe = async (extra: Record<string, unknown>) => ((await ejecutarCodigoV({} as never, enc(extra) as never, conB, pasoPedido)).res.artefacto as { planos: PedidoDePlano[] }).planos
  it('🔴 con la imagen clave FINAL: cada clip arranca de la suya', async () => {
    expect((await planosDe({ [PASO_IMAGENES_CLAVE_FINAL]: ic('final') })).map((p) => p.fotos[0])).toEqual([1, 2, 3].map((n) => IC(n, 'final')))
  })
  it('🔴 solo la de BORRADOR (la de las propuestas): no se usa para el video final; sigue la foto propia', async () => {
    expect((await planosDe({ [PASO_IMAGENES_CLAVE]: ic('borrador') })).map((p) => p.primer_cuadro)).toEqual(['foto_propia', 'texto', 'foto_propia'])
  })
  it('sin imágenes clave: como antes', async () => {
    expect((await planosDe({})).map((p) => p.primer_cuadro)).toEqual(['foto_propia', 'texto', 'foto_propia'])
  })
})
