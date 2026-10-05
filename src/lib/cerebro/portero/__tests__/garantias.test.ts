/**
 * Garantías del portero (rutas nuevas): no tocan lo vedado, el modelo se llama en UN solo lugar y con los topes dichos,
 * y las lecturas no tienen ninguna operación de escritura. Casos escritos antes del código.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../../../../..')
const PORTERO = path.resolve(__dirname, '..')
const RUTAS = path.join(RAIZ, 'src/app/api/brain/portero')
const sinComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const leer = (carpeta: string): Array<{ archivo: string; texto: string }> => {
  const salida: Array<{ archivo: string; texto: string }> = []
  const recorrer = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== '__tests__') recorrer(p) } else if (/\.ts$/.test(e.name)) salida.push({ archivo: path.relative(RAIZ, p).replace(/\\/g, '/'), texto: fs.readFileSync(p, 'utf8') })
    }
  }
  recorrer(carpeta)
  return salida
}
const codigo = (): Array<{ archivo: string; texto: string }> => [...leer(PORTERO), ...leer(RUTAS)]

describe('las tres rutas existen y están protegidas', () => {
  it.each(['indice', 'entregar', 'razonar'])('%s exporta POST y comprueba la llave interna', (n) => {
    const f = path.join(RUTAS, n, 'route.ts')
    expect(fs.existsSync(f)).toBe(true)
    const t = fs.readFileSync(f, 'utf8')
    expect(t).toMatch(/export\s+async\s+function\s+POST|export\s+const\s+POST/)
    expect(t).toMatch(/checkInternalKey/)
    expect(t).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})

describe('solo lectura, salvo el modelo y el registro', () => {
  it('ninguna escritura en la base ni cliente de base con escritura', () => {
    for (const { archivo, texto } of codigo()) {
      const t = sinComentarios(texto)
      for (const p of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/, /supabase-js/, /\bINSERT\s+INTO\b/i, /\bDELETE\s+FROM\b/i]) expect(t, `${archivo} contiene ${p}`).not.toMatch(p)
    }
  })
  it('solo DOS archivos hacen una petición que no es de lectura: la llamada al modelo y el registro', () => {
    const conPost = codigo().filter(({ texto }) => /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(sinComentarios(texto))).map((c) => path.basename(c.archivo)).sort()
    expect(conPost).toEqual(['modelo.ts', 'registro.ts'])
  })
  it('esos dos hablan con UN solo destino cada uno', () => {
    const modelo = sinComentarios(fs.readFileSync(path.join(PORTERO, 'modelo.ts'), 'utf8'))
    const registro = sinComentarios(fs.readFileSync(path.join(PORTERO, 'registro.ts'), 'utf8'))
    expect(modelo.match(/https?:\/\/[^'"`\s)]+/g)).toEqual(['https://api.anthropic.com/v1/messages'])
    expect(registro).toMatch(/\/api\/agents\/log-invocation/)
    expect(registro.match(/https?:\/\/[^'"`\s)]+/g) ?? []).toEqual([])
  })
})

describe('el modelo: una llamada, sin reintentos, sin temperatura, con la llave que ya existe', () => {
  it('modelo.ts no reintenta y no fija temperatura', () => {
    const t = sinComentarios(fs.readFileSync(path.join(PORTERO, 'modelo.ts'), 'utf8'))
    expect(t).not.toMatch(/retry|reintent|for\s*\(let attempt|while\s*\(/i)
    expect(t).not.toMatch(/temperature/)
    expect(t).toMatch(/AbortController/)
    expect(t).toMatch(/process\.env\.CLAUDE_API_KEY/)
  })
  it('la llave nunca se escribe en el código ni sale en una respuesta', () => {
    for (const { archivo, texto } of codigo()) {
      expect(texto, archivo).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/)
    }
    const t = sinComentarios(fs.readFileSync(path.join(PORTERO, 'razonar.ts'), 'utf8'))
    expect(t).not.toMatch(/CLAUDE_API_KEY/)
  })
})

describe('no toca lo vedado', () => {
  const VEDADOS = /^(services\/agent-runner\/|src\/app\/api\/agents\/run-sdk\/|src\/lib\/brain\/|src\/lib\/ingress-filter\/|src\/app\/api\/brain\/(ingest-source|reembed-source-row|reindex-stale)\/|src\/lib\/onboarding-orchestrator|src\/lib\/discovery-output\/|src\/app\/api\/competitors\/|src\/app\/api\/client-brain\/|src\/lib\/client-brain|supabase\/migrations\/|n8n-workflows\/|scripts\/worker-staging\/)/
  it('el código del portero no importa ningún módulo vedado', () => {
    for (const { archivo, texto } of codigo()) {
      for (const m of sinComentarios(texto).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        expect(m[1], `${archivo} importa ${m[1]}`).not.toMatch(/agent-runner|run-sdk|brain-enrichment|ingest-source|persist-chunks|lib\/brain\/|ingress-filter|onboarding-orchestrator|persist-brain|client-brain|log-invocation\/route/)
      }
    }
  })
  it('este PR solo agrega archivos de src/lib/cerebro y de src/app/api/brain/portero (comparado con origin/main)', () => {
    const rama = process.env.GITHUB_HEAD_REF || execSync('git rev-parse --abbrev-ref HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim()
    if (rama !== 'feat/cerebro-portero-rutas') return // la garantía es de ESTE PR; en otras ramas no aplica
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
    const vedados = lista.filter((f) => VEDADOS.test(f) || /LyVoKcrypS5uLyuu|lVCLzxQCKNkd3uS0/.test(f))
    expect(vedados, `modifica lo vedado: ${vedados.join(', ')}`).toEqual([])
    const fuera = lista.filter((f) => !/^(src\/lib\/cerebro\/|src\/app\/api\/brain\/portero\/)/.test(f))
    expect(fuera, `toca archivos fuera de lo firmado: ${fuera.join(', ')}`).toEqual([])
  })
})
