/**
 * Garantías del tramo 1 (casos escritos antes del código):
 *   · SOLO LECTURA por construcción: el código del cerebro no contiene ninguna operación de escritura;
 *   · AGNÓSTICO: ninguna palabra de un cliente, una ciudad, un rubro o un producto concreto;
 *   · NO TOCA LO VEDADO: no importa los módulos del alta ni del corredor, y este PR no modifica los archivos vedados;
 *   · los plazos viven en UN solo lugar, legible y cambiable sin tocar la lógica.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAZOS_EN_DIAS, cargarPlazos } from '../plazos'

const RAIZ = path.resolve(__dirname, '../../../..')
const CARPETA = path.resolve(__dirname, '..')
const codigo = (): Array<{ archivo: string; texto: string }> =>
  fs.readdirSync(CARPETA).filter((f) => /\.(ts|json)$/.test(f)).map((f) => ({ archivo: f, texto: fs.readFileSync(path.join(CARPETA, f), 'utf8') }))

/** Sin comentarios: las advertencias de un comentario no cuentan como código. */
const sinComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('solo lectura por construcción', () => {
  it('ninguna operación de escritura en el código del cerebro', () => {
    const prohibidas = [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bDELETE\s+FROM\b/i, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/, /\.rpc\(/, /supabase-js/]
    for (const { archivo, texto } of codigo()) {
      if (archivo.endsWith('.json')) continue
      const t = sinComentarios(texto)
      for (const p of prohibidas) expect(t, `${archivo} contiene ${p}`).not.toMatch(p)
    }
  })
})

describe('agnóstico', () => {
  it('ninguna regla nombra un cliente, una ciudad, un rubro ni un producto', () => {
    const nombres = /n[aá]ufrago|peniche|ceviche|encebollado|ol[oó]n\b|guayaquil|rukut|loyverse|payphone|marisco|seguridad industrial|ghost kitchen/i
    for (const { archivo, texto } of codigo()) expect(texto, archivo).not.toMatch(nombres)
  })
})

describe('no toca lo vedado', () => {
  const VEDADOS = [
    'services/agent-runner/src/lib/brain-enrichment.ts',
    'src/app/api/brain/ingest-source/route.ts',
    'src/lib/brain/persist-chunks.ts',
    'src/lib/brain/portero.ts',
    'src/lib/onboarding-orchestrator.ts',
    'src/lib/discovery-output/persist-brain.ts',
    'src/app/api/competitors/scrape-verify/route.ts',
    'src/app/api/brain/reembed-source-row/route.ts',
    'src/app/api/brain/reindex-stale/route.ts',
    'src/app/api/client-brain/[client_id]/route.ts',
    'src/lib/client-brain.ts',
  ]
  it('el código del cerebro no importa ningún módulo vedado', () => {
    for (const { archivo, texto } of codigo()) {
      if (archivo.endsWith('.json')) continue
      for (const m of sinComentarios(texto).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        expect(m[1], `${archivo} importa ${m[1]}`).not.toMatch(/brain\/(persist-chunks|portero|embed)|ingest-source|brain-enrichment|onboarding-orchestrator|persist-brain|client-brain|ingress-filter/)
      }
    }
  })
  it('este PR no modifica los archivos vedados (comparado con origin/main)', () => {
    const rama = process.env.GITHUB_HEAD_REF || execSync('git rev-parse --abbrev-ref HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim()
    if (rama !== 'feat/cerebro-tramo-1') return // la garantía es de ESTE PR; en otras ramas no aplica
    const esShallow = execSync('git rev-parse --is-shallow-repository', { cwd: RAIZ, encoding: 'utf8' }).trim() === 'true'
    let cambiados: string
    if (esShallow) {
      execSync('git fetch --no-tags --depth=1 origin main:refs/remotes/origin/main', { cwd: RAIZ, stdio: 'pipe' })
      cambiados = execSync('git diff --name-only origin/main HEAD', { cwd: RAIZ, encoding: 'utf8' })
    } else {
      cambiados = execSync('git diff --name-only origin/main...HEAD', { cwd: RAIZ, encoding: 'utf8' })
    }
    const lista = cambiados.split(/\r?\n/).filter(Boolean)
    expect(lista.length, 'el diff contra origin/main salió vacío: no se pudo comparar').toBeGreaterThan(0)
    const tocados = lista.filter((f) => VEDADOS.includes(f) || /LyVoKcrypS5uLyuu|lVCLzxQCKNkd3uS0/.test(f) || /^supabase\/migrations\//.test(f))
    expect(tocados, `modifica lo vedado: ${tocados.join(', ')}`).toEqual([])
  })
})

describe('plazos de vencimiento', () => {
  it('están en un solo lugar (plazos.json), legibles y con la unidad dicha', () => {
    const crudo = JSON.parse(fs.readFileSync(path.join(CARPETA, 'plazos.json'), 'utf8')) as Record<string, unknown>
    expect(crudo.unidad).toBe('dias')
    expect(Object.keys(PLAZOS_EN_DIAS).length).toBeGreaterThanOrEqual(10)
    for (const [clase, dias] of Object.entries(PLAZOS_EN_DIAS)) expect(dias === null || (Number.isInteger(dias) && dias > 0), clase).toBe(true)
  })
  it('los valores propuestos por el diseño', () => {
    expect(PLAZOS_EN_DIAS).toMatchObject({
      precio_oferta_horario: 7, catalogo_y_direccion: 30, publicacion_propia: 14, perfil_propio: 30, ficha_mapas_propia: 30,
      anuncio_competencia: 14, sitio_competencia: 30, plan: 90, normativa: 180, configuracion_externa: 30, sin_plazo: null,
    })
  })
  it('un valor roto no se acepta en silencio: se rechaza con el motivo', () => {
    expect(() => cargarPlazos({ unidad: 'dias', plazos: { precio_oferta_horario: -1 } })).toThrow(/precio_oferta_horario/)
    expect(() => cargarPlazos({ unidad: 'horas', plazos: {} })).toThrow(/unidad/)
  })
  it('un plazo pasado por parámetro reemplaza al del archivo (se cambia por dato, sin tocar la lógica)', () => {
    expect(cargarPlazos({ unidad: 'dias', plazos: { precio_oferta_horario: 3 } }, { precio_oferta_horario: 1 }).precio_oferta_horario).toBe(1)
  })
})
