/**
 * P4 y P5 del encargo de correcciones (29-oct) · el formato de Facebook existe y la mesa reserva el dinero de la jefatura. US$ 0, sin red.
 * Lee la migración tal como está en el repositorio: si alguien cambia el tope de la revisión sin ajustar la reserva de la mesa (o al revés), la prueba lo dice.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { politicaDeFila } from '../../jefatura/revision/politicas'
import { chequeosDeEntrega, manifiesto, type FilaDeFormato } from '../entrega'
import { COTAS } from '../mesa/tipos'
import { reservaDeLoQueSigue } from '../mesa/planificador'

const RAIZ = join(__dirname, '..', '..', '..', '..')
const MIGRACION = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610291500_oficina_formatos_redes_y_tope_de_jefatura.sql'), 'utf8')
const REVERSA = readFileSync(join(RAIZ, 'supabase', 'reversas', '202610291500_oficina_formatos_redes_y_tope_de_jefatura_REVERSA.sql'), 'utf8')

const topeDeLaRevision = Number(/tope_revision_usd\s*=\s*([0-9.]+),/.exec(MIGRACION)?.[1])
const topesPorPaso = JSON.parse(/tope_paso_usd\s*=\s*'(\{[^']+\})'/.exec(MIGRACION)![1]) as Record<string, number>

describe('P4 · hay especificación técnica para Facebook y las demás redes activas', () => {
  it('la migración trae el carrusel de Facebook y las filas de LinkedIn y TikTok, todas SIN verificar (avisan, no bloquean)', () => {
    for (const par of ["'facebook', 'carrusel'", "'facebook', 'foto_1x1'", "'facebook', 'foto_4x5'", "'facebook', 'historia'", "'linkedin', 'carrusel'", "'tiktok', 'carrusel'"]) expect(MIGRACION).toContain(par)
    const filas = MIGRACION.split('\n').filter((l) => /^\s+\('(facebook|linkedin|tiktok)'/.test(l))
    expect(filas.length).toBe(8)
    for (const f of filas) expect(f).toMatch(/NULL, NULL, false\)[,]?\s*$/)
    expect(MIGRACION).toContain('ON CONFLICT (red, formato) DO NOTHING')
  })
  it('con la fila de Facebook, el carrusel de 6 láminas 1080×1350 YA NO dice «no hay especificación técnica»', () => {
    const fila: FilaDeFormato = { red: 'facebook', formato: 'carrusel', ancho: 1080, alto: 1350, tipos_archivo: ['png', 'jpeg'], peso_max_mb: 8, n_min: 2, n_max: 10, texto_max: 2200, hashtags_max: 10, verificado: false }
    // PNG mínimo válido de 1080×1350 (solo el encabezado que lee `leerMedidas`)
    const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(0x0d0a1a0a, 4); png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'ascii'); png.writeUInt32BE(1080, 16); png.writeUInt32BE(1350, 20)
    const archivos = Array.from({ length: 6 }, (_, i) => ({ nombre: `lamina-${i + 1}.png`, bytes: png }))
    const man = manifiesto(archivos, {})
    const sin = chequeosDeEntrega(archivos, null, { pie_de_foto: 'x', hashtags: [] }, man)
    expect(sin.map((f) => f.que).join(' | ')).toMatch(/no hay especificación técnica/)
    const con = chequeosDeEntrega(archivos, fila, { pie_de_foto: 'x', hashtags: [] }, man)
    expect(con.map((f) => f.que).join(' | ')).not.toMatch(/no hay especificación técnica/)
    expect(con.filter((f) => f.gravedad === 'bloquea')).toEqual([])
  })
})

describe('P5 · la jefatura alcanza a revisar una pieza completa dentro del tope de la pieza', () => {
  it('el tope de la revisión sube de US$ 0,50 a US$ 1,50 y la política resultante es válida para el código', () => {
    expect(topeDeLaRevision).toBe(1.5)
    const r = politicaDeFila({
      artifact_type: 'pieza', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: 'jefe-marketing', reentrega: 'parcial', destino_cierre: 'bandeja', esquema_correccion: 'resolucion.v1',
      productores: [{ donde: 'texto', agente: 'content-creator' }], contra_que: { documentos: [{ clave: 'manual', titulo: 'Manual' }] }, tope_revision_usd: topeDeLaRevision, tope_paso_usd: topesPorPaso,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.politica.tope_revision_usd).toBe(1.5)
  })
  it('lo que costó la revisión de la pieza real (0,4278 con 5 pasos) cabe 3 veces y cada paso tiene holgura sobre lo que gastó', () => {
    expect(topeDeLaRevision / 0.427755).toBeGreaterThan(3)
    expect(topesPorPaso.revision_fondo).toBeGreaterThanOrEqual(0.157534 * 2)
    expect(topesPorPaso.correccion).toBeGreaterThanOrEqual(0.082008 * 3)
    expect(topesPorPaso.segunda_mirada).toBeGreaterThanOrEqual(0.03563 * 4)
    expect(topesPorPaso.decision).toBeGreaterThanOrEqual(0.083422 * 2)
    // la suma de los pasos de una revisión completa (fondo + 2 correcciones + segunda mirada + decisión) cabe en el tope de la revisión
    expect(topesPorPaso.revision_fondo + 2 * topesPorPaso.correccion + topesPorPaso.segunda_mirada + topesPorPaso.decision).toBeLessThanOrEqual(topeDeLaRevision * 1.0 + 0.0001)
  })
  it('la mesa RESERVA ese dinero antes de seguir conversando: lo que sigue (con o sin imagen) ≥ tope de la revisión + el armado', () => {
    expect(COTAS.RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD).toBeGreaterThanOrEqual(topeDeLaRevision + 0.1)
    expect(COTAS.RESERVA_DE_LO_QUE_SIGUE_CON_IMAGEN_USD).toBeGreaterThanOrEqual(topeDeLaRevision + 0.3)
    expect(reservaDeLoQueSigue(true)).toBeGreaterThan(reservaDeLoQueSigue(false))
  })
  it('la jefatura nunca recibe menos de su tope: con la reserva, la mesa deja de gastar antes de que quede menos que el tope de la revisión', () => {
    const tope = 5
    const ultimoGastoQueLaMesaAcepta = tope - COTAS.RESERVA_POR_TURNO_USD - COTAS.RESERVA_DE_LO_QUE_SIGUE_CON_IMAGEN_USD
    const quedaParaLaJefatura = tope - ultimoGastoQueLaMesaAcepta
    expect(quedaParaLaJefatura).toBeGreaterThanOrEqual(topeDeLaRevision)
  })
  it('la reversa devuelve los valores de antes y solo borra lo no verificado', () => {
    expect(REVERSA).toMatch(/tope_revision_usd = 0\.50/)
    expect(REVERSA).toMatch(/verificado = false/)
  })
})
