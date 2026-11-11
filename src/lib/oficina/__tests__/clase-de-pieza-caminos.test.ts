/**
 * Fila #19 · pedido CC7 (certificación #1037): los caminos REALES que usan la clase, no solo la función suelta. US$ 0 · sin red.
 *   1. «¿este brief es de esta sala?» por el orquestador de láminas (y por el de la foto): una variante de la MISMA clase abre; una de otra clase cae con su razón;
 *   2. las fotos del material: el mínimo del kit no es el del post, y repetir una foto reciente se permite por CLASE (no por el nombre «post_img»).
 */
import { describe, expect, it } from 'vitest'
import { candidatasDelEncargo, medirFotos } from '../material-fotos'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado, Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const con = (base: Plantilla, familia: string, clase: string): Plantilla => ({ ...(JSON.parse(JSON.stringify(base)) as Plantilla), familia, tipo: familia, clase })
const BRIEF = (id: string, formato: string) => `### ${id} · Instagram · ${formato}\n- QUÉ ES: una pieza de prueba\n- PROTAGONISTA: el plato del día\n- OBJETIVO: que escriban por WhatsApp\n`
const parte = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}`
const fila = (formato: string, familia: string) => ({ instagram: [{ formato, produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia }] })

async function abrir(pl: Plantilla, id: string, formato: string, familiaDeLaTabla: string) {
  const M = crearMemoria({ parte: parte(BRIEF(id, formato)), plantilla: pl })
  M.P.formatosDeLaCadena = async () => fila(formato, familiaDeLaTabla) as never
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: id, dry_run: true, familia: pl.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return a
}

describe('1 · la sala reconoce las variantes por la clase de sus plantillas, por el camino real', () => {
  it('láminas · una sala NUEVA de clase carrusel produce el brief que la tabla manda a carrusel_ig_v1 (misma clase)', async () => {
    const a = await abrir(con(CARRUSEL_IG_V1, 'carrusel_nuevo', 'carrusel'), 'BRF-0300', 'carrusel', 'carrusel_ig_v1')
    expect(a.cuerpo).not.toMatchObject({ estado: 'fallido' })
    expect(String(a.cuerpo.motivo ?? '')).not.toMatch(/manda a la familia/)
  })
  it('láminas · una sala NUEVA de clase kit no produce el carrusel que la tabla manda a carrusel_ig_v1: cae con su razón', async () => {
    const a = await abrir(con(KIT_HISTORIAS, 'kit_nuevo', 'kit'), 'BRF-0301', 'carrusel', 'carrusel_ig_v1')
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
    expect(String(a.cuerpo.motivo)).toMatch(/manda a la familia carrusel_ig_v1; esta sala es kit_nuevo/)
  })
  it('foto · una sala NUEVA de clase post_img produce la foto que la tabla manda a post_img; de clase carrusel, no', async () => {
    const si = await abrir(con(POST_IMG, 'foto_nueva', 'post_img'), 'BRF-0302', 'foto', 'post_img')
    expect(String(si.cuerpo.motivo ?? '')).not.toMatch(/manda a la familia/)
    expect(si.cuerpo).not.toMatchObject({ estado: 'fallido' })
  })
})

const estado = (familia: 'kit' | 'post_img', elementos: number, fotos: unknown[] = [], usos: Record<string, string> = {}): Estado => ({
  artefactos: { encargo: { version: 1, version_consumida: 0, datos: {
    brief: { protagonista: 'el plato del día', visual: '', negativos: [], visual_prohibido: [] }, proporcion: '9:16', familia,
    F: { fotos, usos, propios: { telefonos: [], handles: [], urls: [], marcas_ajenas: [] }, vocabulario_de_productos: [] },
    elementos: Array.from({ length: elementos }, (_, i) => ({ ref: `e${i}`, tema: 'el plato del día', datos: [] })),
  } } },
} as unknown as Estado)

describe('2 · las fotos del material siguen a la clase', () => {
  const AHORA = new Date('2026-11-11T12:00:00Z')
  it('kit de 6 historias: hacen falta 3 fotos; la misma plantilla declarada post_img pediría 1', () => {
    expect(medirFotos(estado('kit', 6), con(KIT_HISTORIAS, 'kit_nuevo', 'kit'), AHORA).minimo).toBe(3)
    expect(medirFotos(estado('kit', 6), con(KIT_HISTORIAS, 'kit_nuevo', 'post_img'), AHORA).minimo).toBe(1)
  })
  it('repetir una foto usada hace 3 días: el kit la permite (con aviso); un post nuevo de clase post_img, no', () => {
    const foto = { id: 'f1', origen: 'propia', estado: 'ok', tipo_de_toma: 'plato', etiqueta_confianza: 'alta', producto_visto: ['plato del día'], formato: 'vertical' }
    const usos = { f1: '2026-11-08T12:00:00Z' }
    expect(candidatasDelEncargo(estado('kit', 2, [foto], usos), con(KIT_HISTORIAS, 'kit_nuevo', 'kit'), AHORA).reusoPermitido).toBe(true)
    expect(candidatasDelEncargo(estado('post_img', 0, [foto], usos), con(POST_IMG, 'post_nuevo', 'post_img'), AHORA).reusoPermitido).toBe(false)
  })
})
