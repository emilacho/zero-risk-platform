/**
 * Garantías de los lectores de archivo (paso 5 del cerebro): sin red, sin escribir, sin ejecutar, sin secretos, sin tocar lo vedado
 * y con SOLO una biblioteca nueva. Casos escritos ANTES del código.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CARPETA = path.resolve(__dirname, '..')
const RAIZ = path.resolve(__dirname, '../../../../..')
const sinComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const archivos = (): Array<{ nombre: string; texto: string }> =>
  fs.readdirSync(CARPETA).filter((f) => f.endsWith('.ts') || f.endsWith('.cjs')).map((f) => ({ nombre: f, texto: sinComentarios(fs.readFileSync(path.join(CARPETA, f), 'utf8')) }))

describe('los lectores no salen a ninguna red ni ejecutan nada', () => {
  it('hay archivos que revisar', () => { expect(archivos().length).toBeGreaterThanOrEqual(7) })
  it.each([
    ['fetch(', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/], ['http/https', /from\s+['"](node:)?https?['"]/], ['net/dns/tls', /from\s+['"](node:)?(net|dns|tls|dgram)['"]/],
    ['child_process', /child_process/], ['eval', /\beval\s*\(/], ['new Function', /new\s+Function\s*\(/], ['vm', /from\s+['"](node:)?vm['"]/],
  ])('ningún archivo usa %s', (_n, patron) => {
    for (const { nombre, texto } of archivos()) expect(texto, nombre).not.toMatch(patron)
  })
  it('no escribe en el disco ni lee variables de entorno (no hay secretos)', () => {
    for (const { nombre, texto } of archivos()) {
      expect(texto, nombre).not.toMatch(/writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|copyFile/)
      expect(texto, nombre).not.toMatch(/process\.env/)
    }
  })
})

describe('imports permitidos', () => {
  it('solo node:zlib, node:crypto, node:worker_threads, node:path y archivos de la misma carpeta (`unpdf` solo lo carga el hilo, por require)', () => {
    for (const { nombre, texto } of archivos()) {
      for (const m of texto.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        expect(m[1], `${nombre} importa ${m[1]}`).toMatch(/^(node:zlib|node:crypto|node:worker_threads|node:path|\.\/[a-z0-9-]+)$/)
      }
    }
  })
  it('no usa nada vedado: ni flujos, ni corredor, ni `lib/brain`, ni el filtro de seguridad, ni las tablas nuevas', () => {
    for (const { nombre, texto } of archivos()) {
      expect(texto, nombre).not.toMatch(/agent-runner|run-sdk|lib\/brain|ingress-filter|ingest-source|persist-chunks|cerebro_ingresos|cerebro_fichas|client_social_images|supabase/)
    }
  })
})

describe('la única biblioteca nueva es unpdf, con versión fija en el manifiesto', () => {
  it('package.json agrega `unpdf` y ninguna otra de lectura de archivos', () => {
    const p = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(p.dependencies.unpdf).toBe('1.8.1') // versión EXACTA (sin ^): subirla es una decisión, no un accidente
    for (const prohibida of ['pdfjs-dist', 'pdf-parse', 'mammoth', 'xlsx', 'exceljs', 'jszip', 'adm-zip', 'unzipper', 'papaparse', 'csv-parse']) expect(p.dependencies[prohibida], prohibida).toBeUndefined()
  })
})

describe('el aislamiento del PDF: el hilo es lo único que carga unpdf y solo `pdf.ts` crea hilos', () => {
  it('unpdf solo se carga dentro de trabajador-pdf.cjs (ni un import estático, ni un require, en ningún otro archivo)', () => {
    for (const { nombre, texto } of archivos()) {
      if (nombre === 'trabajador-pdf.cjs') continue
      expect(texto, nombre).not.toMatch(/['"]unpdf['"]/)
    }
  })
  it('solo `pdf.ts` importa worker_threads o crea hilos; el hilo solo hace require de node:worker_threads y unpdf', () => {
    for (const { nombre, texto } of archivos()) {
      if (nombre === 'pdf.ts' || nombre === 'trabajador-pdf.cjs') continue
      expect(texto, nombre).not.toMatch(/worker_threads|new\s+Worker\s*\(/)
    }
    const hilo = archivos().find((a) => a.nombre === 'trabajador-pdf.cjs')
    expect(hilo, 'falta el archivo del hilo').toBeDefined()
    expect([...(hilo?.texto ?? '').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]).sort()).toEqual(['node:worker_threads', 'unpdf'])
  })
})

describe('el hilo del PDF viaja en el empaquetado del servidor (probado con un `next build` real: ver la señal)', () => {
  it('next.config.js lo incluye a mano para las rutas del portero: el archivo del hilo y `unpdf` (nadie los importa de forma estática)', () => {
    const t = fs.readFileSync(path.join(RAIZ, 'next.config.js'), 'utf8')
    expect(t).toMatch(/outputFileTracingIncludes:\s*\{[^}]*'\/api\/brain\/portero\/\*\*'/)
    expect(t).toContain("./src/lib/cerebro/archivos/trabajador-pdf.cjs")
    expect(t).toContain("./node_modules/unpdf/**/*")
  })
  it('el archivo que `pdf.ts` busca es el mismo que next.config.js incluye', () => {
    const t = fs.readFileSync(path.join(CARPETA, 'pdf.ts'), 'utf8')
    expect(t).toMatch(/path\.join\(process\.cwd\(\),\s*'src',\s*'lib',\s*'cerebro',\s*'archivos',\s*'trabajador-pdf\.cjs'\)/)
    expect(fs.existsSync(path.join(CARPETA, 'trabajador-pdf.cjs'))).toBe(true)
  })
})
