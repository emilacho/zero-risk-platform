/**
 * GO Lenovo 11-nov · PRIORIDAD 1 · «la mesa confía en la familia» (CC4).
 * Caso real W46 de Náufrago: la cadena mandó la fila «foto» a `post_img` y la sala la rechazó porque el texto no decía «imagen».
 * La oficina ya no vuelve a adivinar la familia por el texto: confía en la que decidió la cadena y, como red, usa LA MISMA tabla de la cadena.
 * Dos clientes de rubros distintos (restaurante y una consultora B2B de práctica), con la tabla de formatos tal como está en producción hoy.
 */
import { describe, expect, it } from 'vitest'
import type { FormatosPorRed } from '@/lib/cadena/tipos'
import { seccionDelBrief } from '../brief'
import { briefEsDeLaFamilia, briefEsDelEncargo } from '../familia-del-brief'
import { abrirEncargo } from '../orquestador'
import type { FuentesCompletas } from '../puertos'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, PARTE_REAL, crearMemoria } from './memoria'

const f = (formato: string, familia: string | null) => ({ formato, produccion: 'opera' as const, lead_dias: 3, max_por_dia: 2, familia })
/** la tabla de formatos de la cadena como está en producción (lectura 11-nov) */
const TABLA: FormatosPorRed = {
  instagram: [f('foto', 'post_img'), f('carrusel', 'carrusel_ig_v1'), f('historia', 'kit_historias'), f('reel', 'video_mesa'), f('anuncio_imagen', null), f('anuncio_carrusel', null)],
  facebook: [f('foto', 'post_img'), f('carrusel', 'carrusel_ig_v1'), f('historia', 'kit_historias'), f('reel', 'video_mesa'), f('anuncio_imagen', null)],
  linkedin: [f('foto', 'post_img'), f('carrusel', 'carrusel_ig_v1'), f('texto', null)],
  tiktok: [f('video', 'video_mesa')],
  youtube: [f('short', 'video_mesa'), f('video', null)],
}

/** el cuerpo del brief de imagen del parte real, con la cabecera que escribe la hoja por código («### <fila> · <Red> · <formato>») */
const CUERPO = seccionDelBrief(PARTE_REAL, 'BRF-0003')!.split('\n').slice(1).join('\n')
const parteCon = (id: string, red: string, formato: string) => `# Parte de trabajo\n\n## Briefs\n\n### ${id} · ${red} · ${formato}\n${CUERPO}\n`

const CLIENTES = [
  { client_id: CLIENTE, rubro: 'restaurante', red: 'Instagram', fila: 's1-d4-jue_foto_olon', fuentes: {} as Partial<FuentesCompletas>, otra_pieza: { formato: 'reel', familia: 'video_mesa' }, sin_sala: 'anuncio_imagen' },
  { client_id: 'practica-b2b-consultora', rubro: 'consultora B2B', red: 'LinkedIn', fila: 's1-d2-mar_foto_linkedin', fuentes: { palabras_prohibidas: ['barato', 'garantizado'], palabras_duras: ['barato', 'garantizado'], telefonos: [] as string[], handles: [] as string[] } as Partial<FuentesCompletas>, otra_pieza: { formato: 'carrusel', familia: 'carrusel_ig_v1' }, sin_sala: 'texto' },
]

async function abrirCon(c: (typeof CLIENTES)[number], formato: string, familia: string, tabla: FormatosPorRed | 'falla' | null = TABLA) {
  const M = crearMemoria({ parte: parteCon(c.fila, c.red, formato), fuentes: c.fuentes })
  if (tabla === 'falla') M.P.formatosDeLaCadena = async () => { throw new Error('base caída') }
  else if (tabla) M.P.formatosDeLaCadena = async () => tabla
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: c.fila, dry_run: true, familia }, client_id: c.client_id, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, a, enc: M.encargos.get(String(a.cuerpo.encargo_id)) }
}

describe('una fila «foto» que la cadena manda a post_img se produce (dos clientes, dos rubros)', () => {
  for (const c of CLIENTES) {
    it(`${c.rubro} · ${c.red} · foto → post_img abre y sigue (no falla por la palabra)`, async () => {
      const { a, enc } = await abrirCon(c, 'foto', 'post_img')
      expect(a.status).toBe(200)
      expect(a.cuerpo).not.toMatchObject({ estado: 'fallido' })
      expect(enc?.estado).not.toBe('fallido')
      expect(enc?.estado_del_motor.pasos_ejecutados).toBeGreaterThanOrEqual(1) // pasó el paso «abrir»
    })
  }
})

describe('sabotaje · un formato que cae por error en post_img sigue frenando, con su razón', () => {
  for (const c of CLIENTES) {
    it(`${c.rubro} · ${c.red} · ${c.otra_pieza.formato} que llega como post_img no se produce aquí`, async () => {
      const { a, enc } = await abrirCon(c, c.otra_pieza.formato, 'post_img')
      expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
      expect(String(a.cuerpo.motivo)).toContain(`manda a la familia ${c.otra_pieza.familia}; esta sala es post_img`)
      expect(enc?.gasto_usd).toBe(0)
    })
    it(`${c.rubro} · ${c.red} · ${c.sin_sala} (sin sala en la tabla) que llega como post_img no se produce aquí`, async () => {
      const { a } = await abrirCon(c, c.sin_sala, 'post_img')
      expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
      expect(String(a.cuerpo.motivo)).toMatch(/no le da ninguna sala/)
    })
  }
})

describe('briefEsDeLaFamilia · la regla, sin sala', () => {
  const b = (red: string, formato: string) => ({ id: 'X', red, formato })
  it('manda la tabla de la cadena, sin importar mayúsculas ni tildes', () => {
    expect(briefEsDeLaFamilia(b('Instagram', 'Foto'), 'post_img', TABLA)).toEqual({ ok: true })
    expect(briefEsDeLaFamilia(b('LINKEDIN', 'foto'), 'post_img', TABLA)).toEqual({ ok: true })
    expect(briefEsDeLaFamilia(b('TikTok', 'video'), 'video_mesa', TABLA)).toEqual({ ok: true })
  })
  it('las variantes de la mesa son la misma pieza (carrusel_mesa ≡ carrusel_ig_v1)', () => {
    expect(briefEsDeLaFamilia(b('Instagram', 'carrusel'), 'carrusel_mesa', TABLA)).toEqual({ ok: true })
    expect(briefEsDeLaFamilia(b('Instagram', 'historia'), 'kit_mesa', TABLA)).toEqual({ ok: true })
  })
  it('otra clase de pieza frena: carrusel en video, reel en carrusel, foto en kit', () => {
    expect(briefEsDeLaFamilia(b('Instagram', 'carrusel'), 'video_mesa', TABLA).ok).toBe(false)
    expect(briefEsDeLaFamilia(b('Instagram', 'reel'), 'carrusel_ig_v1', TABLA).ok).toBe(false)
    expect(briefEsDeLaFamilia(b('Facebook', 'foto'), 'kit_historias', TABLA).ok).toBe(false)
  })
  it('lo que la tabla no conoce (el brief de kit «kit», que agrupa filas) lo decide la familia del encargo', () => {
    expect(briefEsDeLaFamilia(b('Instagram', 'kit'), 'kit_historias', TABLA)).toEqual({ ok: true })
  })
  it('sin tabla, o si leerla falla, manda la familia del encargo (no se adivina por el texto)', async () => {
    expect(briefEsDeLaFamilia(b('Instagram', 'foto'), 'post_img', null)).toEqual({ ok: true })
    expect(await briefEsDelEncargo(b('Instagram', 'reel'), 'post_img', async () => { throw new Error('caída') })).toEqual({ ok: true })
    expect(await briefEsDelEncargo(b('Instagram', 'reel'), 'post_img')).toEqual({ ok: true })
    expect((await briefEsDelEncargo(b('Instagram', 'reel'), 'post_img', async () => TABLA)).ok).toBe(false)
  })
})

describe('el puerto que falla no tumba la sala', () => {
  it('con la tabla caída, una foto en post_img abre igual', async () => {
    const { a } = await abrirCon(CLIENTES[0], 'foto', 'post_img', 'falla')
    expect(a.status).toBe(200)
    expect(a.cuerpo).not.toMatchObject({ estado: 'fallido' })
  })
})
