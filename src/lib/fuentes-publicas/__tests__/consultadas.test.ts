/** Fuentes públicas · «en qué se basó el manual»: el conteo sale de salidas REALES grabadas (ronda 75) y el manual lo muestra solo si hay algo que contar. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fuentesConsultadas, lineasDeFuentesConsultadas } from '..'
import { renderManualLimpio } from '../../brand-book-render-limpio'

const DIR = path.join(process.cwd(), '__tests__', 'fixtures', 'fuentes-reales-r75')
const real = (fn: string) => ({ apify_function: fn, respuesta: (JSON.parse(fs.readFileSync(path.join(DIR, fn + '.json'), 'utf8')) as { respuesta: unknown[] }).respuesta, ensayo: false })

describe('cuenta lo que se miró de verdad', () => {
  const c = fuentesConsultadas(['resenas_google_maps', 'resenas_tripadvisor', 'resenas_facebook', 'publicaciones_facebook', 'videos_instagram', 'videos_tiktok', 'videos_youtube'].map(real))
  it('reseñas por plataforma; la página que no existe (error del actor) no cuenta', () => {
    expect(c.resenas.por_plataforma['Google Maps']).toBe(2) // una de las 3 reseñas reales es solo estrellas, sin texto: no se cuenta como leída
    expect(c.resenas.por_plataforma['Tripadvisor']).toBe(3)
    expect(c.resenas.por_plataforma['Facebook']).toBeUndefined()
    expect(c.resenas.total).toBe(5)
  })
  it('videos: vistos y de cuántos se leyó lo que dicen (TikTok trae solo un enlace al subtítulo, no el texto)', () => {
    expect(c.videos.por_red.Instagram.vistos).toBe(3)
    expect(c.videos.por_red.Instagram.con_transcripcion).toBeGreaterThan(0)
    expect(c.videos.por_red.YouTube.con_transcripcion).toBeGreaterThan(0)
    expect(c.videos.vistos).toBe(c.videos.por_red.Instagram.vistos + c.videos.por_red.TikTok.vistos + c.videos.por_red.YouTube.vistos)
    expect(c.videos.con_transcripcion).toBeLessThan(c.videos.vistos)
  })
  it('un ensayo y las funciones de otro tipo no cuentan', () => {
    expect(fuentesConsultadas([{ ...real('videos_instagram'), ensayo: true }, { apify_function: 'instagram_scraper', respuesta: [{ caption: 'x' }], ensayo: false }]).videos.vistos).toBe(0)
  })
  it('las líneas del manual son llanas y vacías si no se miró nada', () => {
    const l = lineasDeFuentesConsultadas(c)
    expect(l.join(' ')).toMatch(/Reseñas públicas leídas: 5/)
    expect(l.join(' ')).toMatch(/Videos mirados: \d+; con voz de verdad \(se leyó lo que dicen\): \d+; los otros \d+ sin audio, con música o con ruido/)
    expect(lineasDeFuentesConsultadas(fuentesConsultadas([]))).toEqual([])
  })
})

describe('el manual en limpio', () => {
  const bb = { positioning: 'Un negocio local que cuida su cocina.', proposito: 'Que más gente pueda comer bien.' }
  it('sin fuentes consultadas el manual sale IGUAL que antes', () => {
    const a = renderManualLimpio({ brand_book: bb, client_name: 'Cliente Demo' })
    const b = renderManualLimpio({ brand_book: bb, client_name: 'Cliente Demo', fuentes_consultadas: [] })
    expect(b.texto).toBe(a.texto)
  })
  it('con fuentes consultadas lleva una sección al final con el conteo', () => {
    const r = renderManualLimpio({ brand_book: bb, client_name: 'Cliente Demo', fuentes_consultadas: ['Videos mirados: 3; con voz de verdad (se leyó lo que dicen): 3; los otros 0 sin audio, con música o con ruido (Instagram 3).'] })
    expect(r.secciones).toContain('fuentes_consultadas')
    expect(r.texto).toMatch(/EN QUÉ SE BASÓ ESTE MANUAL[\s\S]*Videos mirados: 3/)
    expect(r.texto.trimEnd().endsWith('(Instagram 3).')).toBe(true)
  })
})

describe('ronda 76 · «se leyó lo que dicen» solo cuenta la voz de verdad', () => {
  const c = fuentesConsultadas([real('videos_instagram')])
  it('con las transcripciones reales: la música («Bam bam bilam…») cuenta como visto pero NO como con voz', () => {
    expect(c.videos.vistos).toBe(3)
    expect(c.videos.con_transcripcion).toBe(3)
    expect(c.videos.con_voz).toBe(c.videos.con_transcripcion - 1)
    expect(lineasDeFuentesConsultadas(c).join(' ')).toContain(`con voz de verdad (se leyó lo que dicen): ${c.videos.con_voz}; los otros 1 sin audio`)
  })
})
