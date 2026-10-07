/**
 * Garantías del portero (rutas nuevas): no tocan lo vedado, el modelo se llama en UN solo lugar y con los topes dichos,
 * y las lecturas no tienen ninguna operación de escritura. Casos escritos antes del código.
 */
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
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
const EXCEPCION_DEL_FILTRO = 'src/lib/cerebro/portero/recibir/seguridad.ts'
const codigo = (): Array<{ archivo: string; texto: string }> => [...leer(PORTERO), ...leer(RUTAS)]

describe('las cuatro rutas existen y están protegidas', () => {
  it.each(['indice', 'entregar', 'razonar', 'recibir'])('%s exporta POST y comprueba la llave interna', (n) => {
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
      // `.update(` solo cuenta cuando sale de una tabla (`.from('x').update(`): calcular una huella también se llama así
      for (const p of [/\.insert\(/, /\.from\(\s*['"`][^'"`]+['"`]\s*\)\s*\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/, /supabase-js/, /\bINSERT\s+INTO\b/i, /\bDELETE\s+FROM\b/i]) expect(t, `${archivo} contiene ${p}`).not.toMatch(p)
    }
  })
  it('solo CUATRO archivos hacen una petición que no es de lectura: la llamada al modelo, el registro, la escritura de las columnas de etiqueta (paso 4) y el escritor de `recibir` (paso 7)', () => {
    const conPost = codigo().filter(({ texto }) => /method:\s*(['"](POST|PUT|PATCH|DELETE)['"]|metodo)/.test(sinComentarios(texto))).map((c) => c.archivo.replace(/^src\/lib\/cerebro\/portero\//, '')).sort()
    expect(conPost).toEqual(['etiqueta-escritura.ts', 'modelo.ts', 'recibir/escritura.ts', 'registro.ts'])
  })
  it('el escritor de `recibir` habla SOLO con `cerebro_ingresos` y `cerebro_fichas`, sin ninguna dirección escrita en el código, y no usa otro verbo que POST, PATCH y DELETE', () => {
    const t = sinComentarios(fs.readFileSync(path.join(PORTERO, 'recibir/escritura.ts'), 'utf8'))
    expect([...new Set(t.match(/cerebro_[a-z_]+/g) ?? [])].sort()).toEqual(['cerebro_fichas', 'cerebro_ingresos'])
    expect(t.match(/https?:\/\/[^'"`\s)]+/g) ?? []).toEqual([])
    expect(t).not.toMatch(/client_social_images|client_brain|agent_invocations|\bPUT\b/)
    expect([...new Set([...t.matchAll(/pedir\(\s*'([A-Z]+)'/g)].map((m) => m[1]))].sort()).toEqual(['DELETE', 'PATCH', 'POST'])
  })
  it('la escritura de etiquetas es solo PATCH, no trae ninguna dirección fija (usa la base que se le pasa) y solo nombra las 4 columnas', () => {
    const t = sinComentarios(fs.readFileSync(path.join(PORTERO, 'etiqueta-escritura.ts'), 'utf8'))
    expect([...t.matchAll(/method:\s*['"](\w+)['"]/g)].map((m) => m[1])).toEqual(['PATCH'])
    expect(t.match(/https?:\/\/[^'"`\s)]+/g) ?? []).toEqual([])
    expect(t).toMatch(/client_social_images/)
    expect(t).not.toMatch(/\.(insert|upsert|delete)\(|DELETE FROM|INSERT INTO/i)
  })
  it('la bajada de la foto solo hace GET (lectura), sin seguir saltos', () => {
    const t = sinComentarios(fs.readFileSync(path.join(PORTERO, 'almacen.ts'), 'utf8'))
    expect(t).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/)
    expect(t).toMatch(/redirect:\s*['"]error['"]/)
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
        expect(m[1], `${archivo} importa ${m[1]}`).not.toMatch(/agent-runner|run-sdk|brain-enrichment|ingest-source|persist-chunks|lib\/brain\/|onboarding-orchestrator|persist-brain|client-brain|log-invocation\/route/)
        // ÚNICA EXCEPCIÓN FIRMADA (paso 7): `recibir/seguridad.ts` puede importar la función pura del filtro; ningún otro archivo
        if (archivo !== EXCEPCION_DEL_FILTRO) expect(m[1], `${archivo} importa ${m[1]}`).not.toMatch(/ingress-filter/)
      }
    }
  })
  it('la excepción del filtro es de UN solo archivo y solo importa su función pura (el filtro mismo no se modificó)', () => {
    const conFiltro = codigo().filter(({ texto }) => /from\s+['"][^'"]*ingress-filter[^'"]*['"]/.test(sinComentarios(texto))).map((c) => c.archivo)
    expect(conFiltro).toEqual([EXCEPCION_DEL_FILTRO])
    const t = sinComentarios(fs.readFileSync(path.join(RAIZ, EXCEPCION_DEL_FILTRO), 'utf8'))
    expect(t).toMatch(/import \{ DEFAULT_ROUTE_POLICY, runIngressFilter \} from '\.\.\/\.\.\/\.\.\/ingress-filter'/)
    expect(t).toMatch(/shadow_mode: false/)
    expect(t).toMatch(/skip_classifier: true/)
  })
  it('este PR solo agrega archivos de src/lib/cerebro y de src/app/api/brain/portero (comparado con origin/main)', () => {
    const rama = process.env.GITHUB_HEAD_REF || execSync('git rev-parse --abbrev-ref HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim()
    if (rama !== 'feat/cerebro-portero-rutas' && rama !== 'fix/cerebro-portero-arreglo-medicion' && rama !== 'feat/cerebro-paso-1-aprobacion-y-vencidos') return // la garantía es de ESTE PR; en otras ramas no aplica
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

// ───────────────────────── las 3 debilidades que señaló CC#3 en la certificación del paso 7 (§1)
const todosLosArchivos = (carpeta: string): Array<{ archivo: string; texto: string }> => {
  const salida: Array<{ archivo: string; texto: string }> = []
  const recorrer = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') recorrer(p) } else if (/\.ts$/.test(e.name)) salida.push({ archivo: path.relative(RAIZ, p).replace(/\\/g, '/'), texto: fs.readFileSync(p, 'utf8') })
    }
  }
  recorrer(carpeta)
  return salida
}
/** el código del cerebro entero (la carpeta de lectura, el portero, los lectores de archivo) y las rutas del portero */
const codigoDelCerebro = (): Array<{ archivo: string; texto: string }> => [...todosLosArchivos(path.join(RAIZ, 'src/lib/cerebro')), ...leer(RUTAS)]
/** a dónde apunta de verdad un `import`: una ruta relativa o con `@/` se resuelve; un paquete se deja como está */
const destinoDelImport = (archivo: string, especificador: string): string => {
  if (especificador.startsWith('@/')) return `src/${especificador.slice(2)}`
  if (especificador.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(archivo), especificador))
  return especificador
}
const IMPORTS = (texto: string): string[] => [...sinComentarios(texto).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])

describe('debilidad (b) · ningún import llega a lo vedado, escrito como se escriba (ruta relativa, `@/`, con o sin `lib/`)', () => {
  const VEDADO = /^(src\/lib\/brain(\/|$)|src\/lib\/client-brain|src\/lib\/onboarding-orchestrator|src\/app\/api\/agents\/run-sdk|src\/app\/api\/brain\/(ingest-source|reembed-source-row|reindex-stale)|src\/app\/api\/client-brain|services\/agent-runner|src\/lib\/discovery-output|src\/lib\/ingress-filter(\/|$))/
  it('el destino REAL de cada import del cerebro no es una carpeta vedada (la única excepción es `recibir/seguridad.ts` hacia la carpeta del filtro)', () => {
    let revisados = 0
    for (const { archivo, texto } of codigoDelCerebro()) {
      for (const esp of IMPORTS(texto)) {
        revisados++
        const destino = destinoDelImport(archivo, esp)
        if (archivo === EXCEPCION_DEL_FILTRO && /^src\/lib\/ingress-filter$/.test(destino)) continue
        expect(destino, `${archivo} importa ${esp}`).not.toMatch(VEDADO)
        expect(esp, `${archivo} importa ${esp}`).not.toMatch(/(^|\/)brain(\/|$)/) // `brain/` escrito de cualquier forma
      }
    }
    expect(revisados).toBeGreaterThan(100)
  })
  it('ni `require(`, ni `import(` dinámico, ni `export … from` hacia lo vedado', () => {
    for (const { archivo, texto } of codigoDelCerebro()) {
      const t = sinComentarios(texto)
      for (const m of t.matchAll(/(?:require\(|import\(|export[^'"\n]*from\s*)\s*['"]([^'"]+)['"]/g)) {
        const destino = destinoDelImport(archivo, m[1])
        expect(destino, `${archivo} → ${m[1]}`).not.toMatch(VEDADO)
      }
    }
  })
})

describe('debilidad (a) · `recibir/seguridad.ts` importa del filtro EXACTAMENTE dos nombres y nada más', () => {
  it('un solo import hacia la carpeta del filtro, con el conjunto exacto de nombres {DEFAULT_ROUTE_POLICY, runIngressFilter}, y solo desde su índice', () => {
    const t = sinComentarios(fs.readFileSync(path.join(RAIZ, EXCEPCION_DEL_FILTRO), 'utf8'))
    const imports = [...t.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]*ingress-filter[^'"]*)['"]/g)]
    expect(imports).toHaveLength(1)
    expect(imports[0][1]).toBeUndefined()
    expect(imports[0][2].split(',').map((x) => x.trim()).filter(Boolean).sort()).toEqual(['DEFAULT_ROUTE_POLICY', 'runIngressFilter'])
    expect(imports[0][3]).toBe('../../../ingress-filter')
    // ninguna otra forma de llegar al filtro (import por defecto, `* as`, `require`, dinámico, ruta profunda)
    expect(t.match(/ingress-filter/g)).toHaveLength(1)
    expect(t).not.toMatch(/require\(|import\(|import\s+\*|classifier_client|ClassifierClient|gates\//)
  })
  it('en TODO el código del cerebro, `ingress-filter` solo aparece en ese archivo (ni como texto)', () => {
    const quienes = codigoDelCerebro().filter(({ texto }) => /ingress-filter/.test(sinComentarios(texto))).map((c) => c.archivo)
    expect(quienes).toEqual([EXCEPCION_DEL_FILTRO])
  })
  it('el código de `recibir` no menciona la cuarentena del filtro ni escribe en ella', () => {
    for (const { archivo, texto } of todosLosArchivos(path.join(PORTERO, 'recibir'))) expect(sinComentarios(texto), archivo).not.toMatch(/quarantine|cuarentena/i)
  })
})

describe('debilidad (c) · la carpeta del filtro NO cambia (huella permanente)', () => {
  /** huella de los 9 archivos de `src/lib/ingress-filter/` (sin pruebas, con saltos de línea normalizados): si alguien toca el filtro a propósito, cambia esta línea y se ve en la revisión */
  const HUELLA_DEL_FILTRO = 'ab8c4031a22dbc23b011132a96e5433f596b1e7f09345a3aed21b7046d72ffec'
  it('la huella de `src/lib/ingress-filter/` es la de siempre', () => {
    const archivos = todosLosArchivos(path.join(RAIZ, 'src/lib/ingress-filter')).sort((a, b) => (a.archivo < b.archivo ? -1 : 1))
    const h = crypto.createHash('sha256')
    for (const { archivo, texto } of archivos) { h.update(`${archivo}\n`); h.update(texto.replace(/\r\n/g, '\n')); h.update('\n--\n') }
    expect(archivos).toHaveLength(9)
    expect(h.digest('hex')).toBe(HUELLA_DEL_FILTRO)
  })
})
