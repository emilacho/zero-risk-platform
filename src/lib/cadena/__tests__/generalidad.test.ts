/**
 * La cadena es agnóstica de industria y de cliente · prueba ESTÁTICA permanente (diseño v2 §11.1).
 *
 * Escanea el código de `src/lib/cadena/` (sin pruebas ni fixtures, y sin comentarios) contra nombres, ciudades y rubros de
 * clientes reales o de ejemplo. La lista base es fija; la lista de clientes de la base se arma cuando el flujo corre en CI
 * con credenciales (no aquí): este escaneo es el piso, no el techo.
 *
 * Y la regla de Emilio (cero contacto con el cliente): el código no tiene ningún destino, columna ni valor que apunte al dueño del negocio.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return /^(__tests__|__fixtures__|esquemas)$/.test(n) ? [] : archivos(p)
    return /\.ts$/.test(n) ? [p] : []
  })
}
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CODIGO = archivos(DIR).map((f) => ({ f, src: sinComentarios(readFileSync(f, 'utf8')) }))

describe('agnóstica: ni un cliente, ni una ciudad, ni un rubro en el código de la cadena', () => {
  it('hay código que escanear', () => {
    expect(CODIGO.length).toBeGreaterThanOrEqual(10)
  })
  const PROHIBIDO = [
    /n[aá]ufrago/i, /p[eé]rez/i, /seguridad industrial/i, /guayaquil/i, /\bol[oó]n\b/i, /cuenca/i, /gualaceo/i, /\bquito\b/i, /ecuador/i,
    /restaurante/i, /cafeter[ií]a/i, /veterinari/i, /marisco/i, /camar[oó]n/i, /\bcl[ií]nica\b/i,
  ]
  for (const re of PROHIBIDO) {
    it(`ningún archivo de código nombra ${re}`, () => {
      const malos = CODIGO.filter((c) => re.test(c.src)).map((c) => c.f.split(/[\\/]/).pop())
      expect(malos).toEqual([])
    })
  }
})

describe('cero contacto con el cliente: ningún destino ni valor apunta al dueño', () => {
  it('el código no pide nada al dueño: ni «dueno» ni «dueño» como valor, columna o destino', () => {
    const malos = CODIGO.filter((c) => /due[nñ]o|owner/i.test(c.src)).map((c) => c.f.split(/[\\/]/).pop())
    expect(malos).toEqual([])
  })
  it('no hay recados, ni contacto, ni WhatsApp al cliente', () => {
    const malos = CODIGO.filter((c) => /sala_recados|recado|contactar al cliente/i.test(c.src.replace(/sala_destinos_de_recado/g, ''))).map((c) => c.f.split(/[\\/]/).pop())
    expect(malos).toEqual([])
  })
})

describe('funciones puras: el validador no tiene red ni base dentro', () => {
  it('ningún módulo de la cadena importa red, base ni sistema de archivos (salvo el almacén de Supabase, que es EL lugar de la base)', () => {
    const malos = CODIGO.filter((c) => !/almacen-supabase.ts$/.test(c.f)).filter((c) => /from ['"](?:node:)?(?:fs|http|https|net|child_process|@supabase|pg)\b|\bfetch\(|getSupabase|process\.env/.test(c.src)).map((c) => c.f.split(/[\\/]/).pop())
    expect(malos).toEqual([])
  })
})

describe('un solo lugar nombra las tablas de la cadena', () => {
  it('solo `almacen-supabase.ts` (y la migración) escriben `from(\'cadena_…\')` en todo el código de la aplicación', () => {
    const raiz = join(__dirname, '..', '..', '..', '..')
    const recorrer = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = join(d, n)
      if (/^(node_modules|\.next|__tests__|__fixtures__)$/.test(n)) return []
      return statSync(p).isDirectory() ? recorrer(p) : /\.tsx?$/.test(n) ? [p] : []
    })
    const malos = recorrer(join(raiz, 'src')).filter((f) => !/almacen-supabase\.ts$/.test(f) && /from\(\s*['"]cadena_/.test(readFileSync(f, 'utf8'))).map((f) => f.split(/[\/]/).slice(-3).join('/'))
    expect(malos).toEqual([])
  })
  it('las 7 rutas existen, piden la llave interna y no tocan la base directamente', () => {
    const raiz = join(__dirname, '..', '..', '..', 'app', 'api', 'cadena')
    for (const r of ['campanas', 'estrategia', 'calendario', 'validar', 'filas', 'fechas', 'esperas']) {
      const src = readFileSync(join(raiz, r, 'route.ts'), 'utf8')
      expect(src).toMatch(/atender\(request,/)
      expect(src).not.toMatch(/getSupabase/)
    }
    expect(readFileSync(join(DIR, 'puerta-http.ts'), 'utf8')).toMatch(/checkInternalKey\(request\)[\s\S]{0,200}status: 401/)
  })
})
