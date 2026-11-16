/**
 * S2-7 · REVISIÓN DE CLIPS (CC2 · GO-LENOVO sprint 2, firma de Emilio 16-nov 21:55) · certifica CC7.
 * Tres cuadros por plano (inicio, medio, final) + señales medidas con ffmpeg (cambios de escena, negro, congelado, duración); el agente juzga cada clip contra su ROL
 * y contra su IMAGEN CLAVE (S2-3). Las señales son DATO para el agente: el código no las convierte en veredicto (sin barras duras).
 * El dato de prueba de las señales es SALIDA REAL de ffmpeg (`fixtures/senales-ffmpeg-real.txt`: video de 9 s con negro 0–1, testsrc 1–4, rojo quieto 4–6,
 * testsrc2 6–7,52 y barras quietas 7,52–9,04). Con ffmpeg disponible (CI lo trae), la última prueba corre la pasada REAL sobre un video generado.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rutaDeFfmpeg } from '@/lib/portero-alimenta/videos-del-cerebro'
import { FILTROS_DE_SENALES, sacarCuadros } from '../video/cuadros'
import type { Plano } from '../video/guion'
import { nombreDelCuadro, PASO_MIRAR_VIDEO, senalesDeLaSalida, tareaDeLaMirada, type CuadroDelVideo } from '../video/mirada'
import { CONTRATOS_EN_TEXTO } from '../pedidos'
import { MAX_IMAGENES } from '@/lib/imagenes-del-pedido'
import { armarPedidoV } from '../orquestador-video'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import type { Estado } from '../tipos'

const REAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'senales-ffmpeg-real.txt'), 'utf8')
const PLANOS: Plano[] = [
  { n: 1, desde: 0, hasta: 2, se_ve: 'la entrada', rol: 'captar' },
  { n: 2, desde: 2, hasta: 5, se_ve: 'el producto', rol: 'prueba', producto: true, estado_final: 'el producto servido' },
  { n: 3, desde: 5, hasta: 7.5, se_ve: 'el equipo', rol: 'situar' },
  { n: 4, desde: 7.5, hasta: 9, se_ve: 'el cierre', rol: 'llamado' },
]

describe('las señales de ffmpeg, repartidas por plano (salida REAL)', () => {
  it('🔴 negro, congelado y cambios de escena caen en su plano; el corte en la frontera entre planos es la transición pedida, no un corte dentro', () => {
    const s = senalesDeLaSalida(REAL, PLANOS, 9.04)
    expect(s.duracion_s).toBe(9.04)
    expect(s.por_plano).toEqual([
      { plano: 1, cortes: [1], negro_s: 1, congelado_s: 1 },
      { plano: 2, cortes: [4], negro_s: 0, congelado_s: 1 },
      { plano: 3, cortes: [6], negro_s: 0, congelado_s: 1 },
      // el corte de 7,52 está pegado a la frontera 7,5: es la transición, no cuenta; el último congelado no trae fin: llega hasta la duración medida
      { plano: 4, cortes: [], negro_s: 0, congelado_s: 1.48 }, // 7,52 → 9 (el plano termina antes que el video)
    ])
  })
  it('🔴 sin nada que medir, cero (no se inventa); planos sin segundos válidos no tienen señales', () => {
    expect(senalesDeLaSalida('', PLANOS.slice(0, 1), 2).por_plano).toEqual([{ plano: 1, cortes: [], negro_s: 0, congelado_s: 0 }])
    expect(senalesDeLaSalida(REAL, [{ n: 9, desde: 3, hasta: 3, se_ve: 'x' }], 9).por_plano).toEqual([])
  })
  it('los filtros son instrumentos de medida: negro, congelado y escena, con la coma del umbral escapada para ffmpeg', () => {
    expect(FILTROS_DE_SENALES).toBe('blackdetect=d=0.2:pix_th=0.10,freezedetect=n=-50dB:d=0.6,select=gt(scene' + String.fromCharCode(92) + ',0.35),showinfo')
  })
})

describe('el pedido al agente que mira: cada clip contra su rol y su imagen clave', () => {
  const cuadros: CuadroDelVideo[] = PLANOS.slice(0, 2).flatMap((p) => (['inicio', 'medio', 'final'] as const).map((parte, i) => ({ plano: p.n, segundo: p.desde + i, parte, url: `https://c/${nombreDelCuadro({ plano: p.n, parte })}` })))
  const t = tareaDeLaMirada({
    cuadros, planos: PLANOS, segundos: 9, brief_texto: 'FILA: la pieza cuenta el producto', red: 'instagram', formato: 'reel', contrato: CONTRATOS_EN_TEXTO['mirada_video.v1'],
    imagenes_clave: [{ n: 2, url: 'https://ic/2.png' }], senales: senalesDeLaSalida(REAL, PLANOS, 9.04),
  })
  it('🔴 las imágenes van por plano: la imagen clave primero (si la hubo) y luego inicio, medio y final', () => {
    expect(t.images).toEqual(['https://c/plano-1-inicio.jpg', 'https://c/plano-1-medio.jpg', 'https://c/plano-1-final.jpg', 'https://ic/2.png', 'https://c/plano-2-inicio.jpg', 'https://c/plano-2-medio.jpg', 'https://c/plano-2-final.jpg'])
    expect(t.task).toContain('- imagen 4: IMAGEN CLAVE del plano 2 (lo que se aprobó antes de filmar')
    expect(t.task).toContain('- imagen 5: cuadro del plano 2 (inicio), segundo 2')
    expect(t.task).toContain('- imagen 7: cuadro del plano 2 (final), segundo 4')
    expect(t.task).toContain('son 2 de 4 planos')
  })
  it('🔴 cada plano lleva su rol, cómo termina y lo que midió ffmpeg; la duración medida va en la pieza', () => {
    expect(t.task).toContain('- Plano 2 (2–5 s) · rol: prueba: el producto · producto en cuadro: sí · cómo termina: el producto servido · medido: 1 cambio(s) de escena dentro del plano (s 4); 1 s de imagen congelada')
    expect(t.task).toContain('- Plano 1 (0–2 s) · rol: captar: la entrada · medido: 1 cambio(s) de escena dentro del plano (s 1); 1 s en negro; 1 s de imagen congelada')
    expect(t.task).toContain('Un video de 9 s (medido: 9.04 s)')
  })
  it('🔴 las señales son DATO: el pedido lo dice y no trae una lista de cosas que buscar; juzga el agente', () => {
    expect(t.task).toContain('Es un DATO, no un veredicto')
    expect(t.task).toContain('si cada clip cumple su ROL en la historia y si cuenta lo mismo que su imagen clave')
    expect(t.task).toContain('lo importante lo decides tú')
  })
  it('🔴 un plano donde ffmpeg no midió nada raro lo dice así (no queda una línea de medición vacía)', () => {
    const v = tareaDeLaMirada({ cuadros, planos: PLANOS.slice(0, 1), segundos: 2, brief_texto: 'x', red: 'instagram', formato: 'reel', contrato: '', senales: senalesDeLaSalida('', PLANOS.slice(0, 1), 2) })
    expect(v.task).toContain('- Plano 1 (0–2 s) · rol: captar: la entrada · medido: sin cortes, negro ni congelado')
  })
  it('sin señales ni imágenes clave (un video viejo o ffmpeg que no midió): el pedido es el de siempre, sin inventar mediciones', () => {
    const v = tareaDeLaMirada({ cuadros, planos: PLANOS, segundos: 9, brief_texto: 'x', red: 'instagram', formato: 'reel', contrato: '' })
    expect(v.images).toEqual(cuadros.map((c) => c.url))
    expect(v.task).not.toContain('medido')
    expect(v.task).not.toContain('Lo que midió ffmpeg')
    expect(v.task).not.toContain('IMAGEN CLAVE')
  })
})

describe('el sacador: cuadros y señales', () => {
  const jpeg = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.alloc(2000, 1)])
  it('🔴 si la pasada de señales falla, los cuadros salen igual y las señales quedan en null (la mirada nunca se frena por medir)', async () => {
    const ejecutar = async (_c: string, args: string[]) => {
      if (args.includes('-f')) return { ok: false, salida: 'filtro desconocido' }
      if (args.includes('-hide_banner')) return { ok: true, salida: '  Duration: 00:00:09.04, start: 0.000000' }
      fs.writeFileSync(args[args.length - 1], jpeg)
      return { ok: true, salida: '' }
    }
    const r = await sacarCuadros({ bytes: Buffer.from('mp4'), planos: PLANOS, ffmpeg: 'ffmpeg', ejecutar })
    expect(r.cuadros).toHaveLength(12)
    expect(r.senales).toBeNull()
    expect(r.causa).toBeUndefined()
  })
  it('🔴 la pasada de señales usa los filtros y su salida se reparte por plano', async () => {
    const pasadas: string[][] = []
    const ejecutar = async (_c: string, args: string[]) => {
      if (args.includes('-f')) { pasadas.push(args); return { ok: true, salida: REAL } }
      if (args.includes('-hide_banner')) return { ok: true, salida: '  Duration: 00:00:09.04, start: 0.000000' }
      fs.writeFileSync(args[args.length - 1], jpeg)
      return { ok: true, salida: '' }
    }
    const r = await sacarCuadros({ bytes: Buffer.from('mp4'), planos: PLANOS, ffmpeg: 'ffmpeg', ejecutar })
    expect(pasadas).toHaveLength(1)
    expect(pasadas[0][pasadas[0].indexOf('-vf') + 1]).toBe(FILTROS_DE_SENALES)
    expect(r.senales).toEqual(senalesDeLaSalida(REAL, PLANOS, 9.04))
  })
  const ff = process.env.FFMPEG_PATH || rutaDeFfmpeg()
  it.skipIf(!ff)('🔴 ffmpeg REAL: un video generado da 3 cuadros JPEG por plano y las señales de verdad (negro, congelado, cortes)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'))
    try {
      const mp4 = path.join(dir, 'p.mp4')
      const s = 's=320x568:r=25'
      execFileSync(ff!, ['-v', 'error', '-f', 'lavfi', '-i', `color=black:${s}:d=1`, '-f', 'lavfi', '-i', `testsrc=${s}:d=3`, '-f', 'lavfi', '-i', `color=red:${s}:d=2`, '-f', 'lavfi', '-i', `testsrc2=${s}:d=1.5`, '-f', 'lavfi', '-i', `smptebars=${s}:d=1.5`, '-filter_complex', '[0][1][2][3][4]concat=n=5:v=1:a=0,format=yuv420p', '-y', mp4])
      const r = await sacarCuadros({ bytes: fs.readFileSync(mp4), planos: PLANOS, ffmpeg: ff })
      expect(r.duracion_s).toBeGreaterThan(8.9)
      expect(r.cuadros).toHaveLength(12)
      for (const c of r.cuadros) expect(c.bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')
      const p = new Map(r.senales!.por_plano.map((x) => [x.plano, x]))
      expect(p.get(1)!.negro_s).toBeGreaterThan(0.8)
      expect(p.get(2)!.cortes.some((c) => Math.abs(c - 4) < 0.1)).toBe(true)
      expect(p.get(3)!.congelado_s).toBeGreaterThan(0.8)
      expect(p.get(4)!.cortes).toEqual([])
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  }, 60_000)
})

describe('el límite de imágenes del servicio (CC7 🔴 · MAX_IMAGENES)', () => {
  const planosDe = (k: number): Plano[] => Array.from({ length: k }, (_, i) => ({ n: i + 1, desde: i * 2, hasta: i * 2 + 2, se_ve: `p${i + 1}` }))
  const cuadrosDe = (planos: Plano[]): CuadroDelVideo[] => planos.flatMap((p) => (['inicio', 'medio', 'final'] as const).map((parte) => ({ plano: p.n, segundo: p.desde, parte, url: `https://c/${nombreDelCuadro({ plano: p.n, parte })}` })))
  const clavesDe = (planos: Plano[]) => planos.map((p) => ({ n: p.n, url: `https://ic/${p.n}.png` }))
  const pedir = (k: number, conClaves = true) => { const planos = planosDe(k); return tareaDeLaMirada({ cuadros: cuadrosDe(planos), planos, segundos: k * 2, brief_texto: 'x', red: 'youtube', formato: 'short', contrato: '', ...(conClaves ? { imagenes_clave: clavesDe(planos) } : {}) }) }
  it('🔴 el peor caso (12 planos con imagen clave = 48) no pasa el límite; TODOS los planos llevan su cuadro del medio y el pedido lo declara', () => {
    const t = pedir(12)
    expect(t.images.length).toBeLessThanOrEqual(MAX_IMAGENES)
    expect(t.images).toHaveLength(MAX_IMAGENES)
    for (let n = 1; n <= 12; n++) expect(t.images).toContain(`https://c/plano-${n}-medio.jpg`)
    // lo que queda va a las imágenes clave, en orden
    expect(t.images.filter((u) => u.startsWith('https://ic/'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `https://ic/${n}.png`))
    expect(t.task).toContain(`(el pedido admite ${MAX_IMAGENES} imágenes: en los planos 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 no van todas las suyas; juzga lo que ves)`)
  })
  it('🔴 un reel de 6 planos (24): medio + imagen clave + final en todos, y el arranque en los que caben; por plano, en orden', () => {
    const t = pedir(6)
    expect(t.images).toHaveLength(MAX_IMAGENES)
    expect(t.images.slice(0, 4)).toEqual(['https://ic/1.png', 'https://c/plano-1-inicio.jpg', 'https://c/plano-1-medio.jpg', 'https://c/plano-1-final.jpg'])
    expect(t.images.slice(-3)).toEqual(['https://ic/6.png', 'https://c/plano-6-medio.jpg', 'https://c/plano-6-final.jpg'])
    expect(t.task).toContain('en los planos 3, 4, 5, 6 no van todas las suyas')
  })
  it('🔴 hasta el límite exacto (5 planos con imagen clave = 20) no se recorta nada ni se declara', () => {
    const t = pedir(5)
    expect(t.images).toHaveLength(20)
    expect(t.task).not.toContain('el pedido admite')
  })
  it('🔴 más planos que el límite: un cuadro del medio por plano, repartidos parejo (primero y último), y dice cuántos de cuántos', () => {
    const t = pedir(25, false)
    expect(t.images).toHaveLength(MAX_IMAGENES)
    expect(t.images.every((u) => u.endsWith('-medio.jpg'))).toBe(true)
    expect(t.images[0]).toBe('https://c/plano-1-medio.jpg')
    expect(t.images[MAX_IMAGENES - 1]).toBe('https://c/plano-25-medio.jpg')
    expect(t.task).toContain(`son ${MAX_IMAGENES} de 25 planos`)
  })
  it('🔴 el pedido REAL del paso (armarPedidoV con el dato del encargo) tampoco pasa el límite', () => {
    const planos = planosDe(12)
    const art = (d: unknown) => ({ version: 1, version_consumida: 0, datos: d })
    const e = { ultimo: 1, pasos_ejecutados: 9, gasto_usd: 20, vueltas: {}, fichas: [], artefactos: {
      encargo: art({ brief: { texto: 'FILA', red: 'youtube', formato: 'short' }, proporcion: '9:16', F: { fotos: [] } }),
      guion: art({ planos, segundos: 24 }),
      imagenes_clave: art({ fase: 'final', planos: clavesDe(planos), hay_imagenes: true }),
      cuadros_video: art({ cuadros: cuadrosDe(planos), hay_cuadros: true, senales: null }),
    } } as unknown as Estado
    const t = armarPedidoV(VIDEO_MESA.pasos.find((p) => p.clave === PASO_MIRAR_VIDEO)!, e)!
    expect(t.images.length).toBeLessThanOrEqual(MAX_IMAGENES)
  })
})
