/**
 * Filas de VIDEO en la tabla de formatos de entrega · GO Lenovo 11-nov 15:38 · CC3 · US$ 0, sin red.
 * El reel W47 llegó a la bandeja con «no hay especificación técnica para este formato y red». Lee la migración TAL COMO ESTÁ en el repositorio y la
 * pasa por el MISMO camino que usa la oficina: (red, formatoDeEntrega(formatoDeVideo(brief))) → fila → chequeosDeEntrega con un mp4 como el del reel real.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chequeosDeEntrega, manifiesto, type FilaDeFormato } from '../entrega'
import { formatoDeEntrega, formatoDeVideo } from '../video/pedido'

const RAIZ = join(__dirname, '..', '..', '..', '..')
const MIGRACION = readFileSync(join(RAIZ, 'supabase', 'migrations', '202611111600_oficina_formatos_de_video.sql'), 'utf8')
const REVERSA = readFileSync(join(RAIZ, 'supabase', 'reversas', '202611111600_oficina_formatos_de_video_REVERSA.sql'), 'utf8')

// cada fila del INSERT: ('red', 'formato', ancho, alto, 'ratio', ARRAY['mp4'], peso, n_min, n_max, texto_max, hashtags_max, ARRAY[...], fuente, verificado_en, verificado)
const FILA = /^\s+\('([a-z]+)', '([a-z_0-9]+)', (\d+), (\d+), '([0-9:]+)', ARRAY\[([^\]]*)\], ([0-9.]+), (\d+), (\d+), (\d+), (\d+), ARRAY\[([^\]]*)\], (NULL|'[^']*'), (NULL|'[^']*'), (true|false)\),?\s*$/
const lista = (s: string) => s.split(/',\s*'/).map((x) => x.replace(/^'|'$/g, ''))
const FILAS: FilaDeFormato[] = MIGRACION.split('\n').filter((l) => /^\s+\('/.test(l)).map((l) => {
  const m = FILA.exec(l)
  if (!m) throw new Error('fila que no se entiende: ' + l)
  return { red: m[1], formato: m[2], ancho: +m[3], alto: +m[4], tipos_archivo: lista(m[6]), peso_max_mb: +m[7], n_min: +m[8], n_max: +m[9], texto_max: +m[10], hashtags_max: +m[11], pasos_publicacion: lista(m[12]), verificado: m[15] === 'true' }
})
const buscar = (red: string, formato: string) => FILAS.find((f) => f.red === red && f.formato === formato) ?? null

// los briefs de video de las 5 redes canónicas (las de `cadena_formatos_por_red` con familia video_mesa, más LinkedIn), con el formato tal como llega en el brief
const BRIEFS_DE_VIDEO = [
  { red: 'Instagram', formato: 'reel' },
  { red: 'Facebook', formato: 'reel' },
  { red: 'TikTok', formato: 'video' },
  { red: 'YouTube', formato: 'short' },
  { red: 'LinkedIn', formato: 'video' },
]
const redDeEntrega = (red: string) => red.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() // la misma normalización que `orquestador-video.ts:192`

// un mp4 como el del reel real (caja `ftyp`, 11,76 MB) y el pie y las 15 etiquetas que dejó la jefatura
const mp4 = (bytes: number) => { const b = Buffer.alloc(bytes); b.writeUInt32BE(32, 0); b.write('ftypisom', 4, 'ascii'); return b }
const PIE = 'El encebollado de Olón ya está en zona norte. Pídelo en naufrago.ec — pagas en efectivo al recibir.'
const ETIQUETAS = ['#naufrago', '#encebollado', '#mariscos', '#guayaquil', '#naufrago_ec', '#zonaNorte', '#ceviche', '#Ecuador', '#comidaecuatoriana', '#encebollados', '#olon', '#santaelena', '#naufragoec', '#mariscofresco', '#deliveryguayaquil']

describe('filas de video en los formatos de entrega', () => {
  it('🔴 la migración trae exactamente las 5 filas de video, en mp4, 1080×1920, 9:16, un archivo, SIN verificar, y solo amplía', () => {
    expect(FILAS.map((f) => `${f.red}·${f.formato}`)).toEqual(['instagram·reel', 'facebook·reel', 'tiktok·video', 'youtube·short', 'linkedin·video'])
    for (const f of FILAS) {
      expect(f, f.red).toMatchObject({ ancho: 1080, alto: 1920, tipos_archivo: ['mp4'], n_min: 1, n_max: 1, verificado: false })
      expect(f.pasos_publicacion!.length, f.red).toBeGreaterThan(0)
    }
    expect(MIGRACION.split('\n').filter((l) => /^\s+\('/.test(l)).every((l) => /'9:16'/.test(l))).toBe(true)
    expect(MIGRACION).toContain('ON CONFLICT (red, formato) DO NOTHING')
    expect(MIGRACION).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i)
  })
  it.each(BRIEFS_DE_VIDEO)('🔴 $red · $formato: la oficina encuentra su fila por el MISMO camino que usa al empaquetar', (b) => {
    const clave = formatoDeEntrega(formatoDeVideo({ red: b.red, formato: b.formato } as never))
    expect(buscar(redDeEntrega(b.red), clave)).not.toBeNull()
  })
  it.each(BRIEFS_DE_VIDEO)('🔴 $red · $formato: el mp4 del reel real YA NO dice «no hay especificación técnica» y no bloquea nada', (b) => {
    const fila = buscar(redDeEntrega(b.red), formatoDeEntrega(formatoDeVideo({ red: b.red, formato: b.formato } as never)))
    const archivos = [{ nombre: `2026-11-16_1000_${redDeEntrega(b.red)}_${b.formato}_x_01-de-01.mp4`, bytes: mp4(11758598) }]
    const man = manifiesto(archivos, {})
    const sin = chequeosDeEntrega(archivos, null, { pie_de_foto: PIE, hashtags: ETIQUETAS }, man)
    expect(sin.map((f) => f.que).join(' | ')).toMatch(/no hay especificación técnica/)
    const con = chequeosDeEntrega(archivos, fila, { pie_de_foto: PIE, hashtags: ETIQUETAS }, man)
    expect(con.map((f) => f.que).join(' | ')).not.toMatch(/no hay especificación técnica/)
    expect(con.filter((f) => f.gravedad === 'bloquea')).toEqual([])
    // las medidas de un video no se leen por código: lo declara, como sugerencia
    expect(con.some((f) => f.gravedad === 'sugerencia' && /no se verificaron por código \(el formato pide 1080×1920\)/.test(f.que ?? ''))).toBe(true)
    // y, con tantas etiquetas como admite esa red, es lo ÚNICO que dice: ni el peso (11,76 MB) ni el texto del reel real disparan un aviso
    const justas = chequeosDeEntrega(archivos, fila, { pie_de_foto: PIE, hashtags: ETIQUETAS.slice(0, fila!.hashtags_max) }, man)
    expect(justas.map((f) => f.que)).toEqual([expect.stringMatching(/las medidas y la duración del video no se verificaron por código/)])
  })
  it('🔴 Instagram admite las 15 etiquetas que pide el manual sin avisar; un video de más de 250 MB solo AVISA (la fila no está verificada)', () => {
    const fila = buscar('instagram', 'reel')!
    const chico = chequeosDeEntrega([{ nombre: 'a.mp4', bytes: mp4(1024) }], fila, { pie_de_foto: PIE, hashtags: ETIQUETAS }, manifiesto([{ nombre: 'a.mp4', bytes: mp4(1024) }], {}))
    expect(chico.filter((f) => f.donde === 'hashtags')).toEqual([])
    const pesado = { nombre: 'b.mp4', bytes: mp4(251 * 1024 * 1024) }
    const r = chequeosDeEntrega([pesado], fila, { pie_de_foto: PIE, hashtags: ETIQUETAS }, manifiesto([pesado], {}))
    expect(r.filter((f) => /pesa .* MB y el límite es 250/.test(f.que ?? '')).map((f) => f.gravedad)).toEqual(['sugerencia'])
  })
  it('🔴 la reversa quita exactamente esas 5 filas, solo si siguen sin verificar, y nada más', () => {
    expect(REVERSA).toMatch(/WHERE verificado = false/)
    const pares = [...REVERSA.matchAll(/\('([a-z]+)','([a-z_0-9]+)'\)/g)].map((m) => `${m[1]}·${m[2]}`)
    expect(pares).toEqual(FILAS.map((f) => `${f.red}·${f.formato}`))
    expect(REVERSA).not.toMatch(/\b(UPDATE|DROP|ALTER|TRUNCATE|INSERT)\b/i)
    expect(REVERSA.match(/DELETE FROM/g)).toHaveLength(1)
  })
})
