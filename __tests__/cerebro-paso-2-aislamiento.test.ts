/**
 * PASO 2 DEL CEREBRO · pruebas PERMANENTES contra depuración futura (lo pidió Emilio: «mira mitigar futuro debugging innecesario»).
 * Escritas ANTES de la migración. Valen para siempre y NO dependen del nombre de la rama.
 *
 *   A · NADIE más toca las tablas nuevas ni las 4 columnas nuevas: ni un productor, ni un flujo, ni el alta, ni un guion. (El permiso de la base no lo impide:
 *       todos usan la MISMA llave de servicio. Lo impide esta prueba.)
 *   B · NADIE pide «todas las columnas» (`select *`) de `client_social_images`: un campo más no puede romper a un lector. Una única excepción, con su razón.
 *   C · NADIE escribe en `client_social_images` salvo quienes ya lo hacían (el Servicio de Apify y un guion de una sola vez): un escritor nuevo falla hasta que se declare.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const CARPETAS = ['src', 'services', 'scripts', 'supabase', 'n8n-workflows', 'packages', 'tools', 'sql', '__tests__']
const EXTENSIONES = /\.(ts|tsx|js|mjs|cjs|json|sql|sh|yml|yaml)$/
const SALTAR = /(^|\/)(node_modules|\.next|\.git|evidence|outputs|fixtures)(\/|$)/

function archivos(dir: string, salida: string[] = []): string[] {
  const abs = path.join(RAIZ, dir)
  if (!fs.existsSync(abs)) return salida
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (SALTAR.test(rel)) continue
    if (e.isDirectory()) archivos(rel, salida)
    else if (EXTENSIONES.test(e.name) && fs.statSync(path.join(RAIZ, rel)).size < 3_000_000) salida.push(rel)
  }
  return salida
}
const TODOS = CARPETAS.flatMap((c) => archivos(c))
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

// ───────────────────────── A · las tablas y columnas nuevas son solo del portero del cerebro
export const NOMBRES_NUEVOS = /\b(cerebro_ingresos|cerebro_fichas|que_muestra|producto_visto|etiquetada_en|etiqueta_modelo|texto_visible|etiqueta_confianza)\b/
/** quién PUEDE nombrarlas: la migración y su reversa, los guiones de auditoría, el cerebro (su carpeta), la ruta del portero y estas dos pruebas */
export const PUEDEN_NOMBRARLAS = [
  /^supabase\/migrations\/202610060100_cerebro_paso_2_tablas_y_columnas\.sql$/,
  /^supabase\/reversas\/202610060100_cerebro_paso_2_REVERSA\.sql$/,
  /^supabase\/migrations\/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza\.sql$/,
  /^supabase\/reversas\/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza_REVERSA\.sql$/,
  /^scripts\/audit\/cerebro-tablas-no-las-usa-nadie\.mjs$/,
  /^scripts\/audit\/cerebro-paso-2-verifica-base\.mjs$/,
  /^src\/lib\/cerebro\//,
  /^src\/app\/api\/brain\/portero\//,
  /^__tests__\/cerebro-paso-2-(aislamiento|migracion)\.test\.ts$/,
  /^__tests__\/cerebro-fotos-2-columnas\.test\.ts$/,
]
export const quienNombra = (archivosYTextos: Array<{ rel: string; texto: string }>): string[] =>
  archivosYTextos.filter(({ rel, texto }) => NOMBRES_NUEVOS.test(texto) && !PUEDEN_NOMBRARLAS.some((r) => r.test(rel))).map((x) => x.rel)

describe('A · nadie más toca las tablas ni las 4 columnas nuevas del cerebro', () => {
  it('ningún archivo del repositorio (código, guiones, constructores de flujos, flujos guardados) las nombra fuera de la lista corta', () => {
    const nombran = quienNombra(TODOS.map((rel) => ({ rel, texto: leer(rel) })))
    expect(nombran, `lo usan fuera de la lista permitida: ${nombran.join(', ')}`).toEqual([])
  })
  it('la propia prueba detecta a un intruso (un productor, un flujo y un guion que las nombren)', () => {
    const intrusos = quienNombra([
      { rel: 'src/lib/fotos/fotos-contexto-logica.js', texto: "select('cerebro_fichas')" },
      { rel: 'scripts/worker-staging/pieza-el-productor/n3-guarda-fotos.js', texto: 'rows.que_muestra' },
      { rel: 'n8n-workflows/live-snapshots/2026-10-07/pieza.json', texto: '"url":".../rest/v1/cerebro_ingresos?select=id"' },
      { rel: 'services/agent-runner/src/index.ts', texto: 'etiqueta_modelo' },
    ])
    expect(intrusos).toHaveLength(4)
    expect(quienNombra([{ rel: 'src/lib/cerebro/portero/futuro.ts', texto: 'cerebro_fichas' }, { rel: 'src/app/api/brain/portero/etiquetar/route.ts', texto: 'producto_visto' }])).toEqual([])
  })
  it('no existe ninguna tabla nueva `cerebro_*` en el código fuera de las dos aprobadas (el prefijo es de estas dos)', () => {
    const otras = new Set<string>()
    for (const rel of TODOS) {
      if (PUEDEN_NOMBRARLAS.some((r) => r.test(rel))) continue
      for (const m of leer(rel).matchAll(/\bfrom\(\s*['"`](cerebro_[a-z_]+)['"`]\s*\)|rest\/v1\/(cerebro_[a-z_]+)/g)) otras.add(m[1] ?? m[2])
    }
    expect([...otras]).toEqual([])
  })
})

// ───────────────────────── B · sin «select *» sobre client_social_images
/** la ÚNICA excepción: un guion manual de una sola vez (ya corrido el 03-oct) que lee todas las columnas y solo actualiza las que nombra */
export const EXCEPCIONES_SELECT_ESTRELLA: Record<string, string> = {
  'scripts/worker-staging/3lyknrP3PoS2KzUf/completar-contexto-fotos.mjs': 'guion manual de una sola vez (completar filas viejas, 03-oct): lee todas las columnas, no valida la forma y actualiza por PATCH solo las columnas que nombra',
}
export function usaSelectEstrella(texto: string): boolean {
  if (/client_social_images[^\n"'`]{0,300}[?&]select=\*/.test(texto) || /[?&]select=\*[^\n"'`]{0,300}client_social_images/.test(texto)) return true
  for (const m of texto.matchAll(/from\(\s*['"`]client_social_images['"`]\s*\)/g)) {
    const resto = texto.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 240)
    if (/^\s*\.select\(\s*(['"`]\*['"`])?\s*\)/.test(resto)) return true
  }
  return false
}
describe('B · nadie pide «todas las columnas» de client_social_images', () => {
  it('ningún archivo usa select * sobre esa tabla, salvo la excepción nombrada', () => {
    const usan = TODOS.filter((rel) => !/(^|\/)__tests__\//.test(rel) && !/\.test\.ts$/.test(rel)).filter((rel) => usaSelectEstrella(leer(rel)))
    expect(usan.sort()).toEqual(Object.keys(EXCEPCIONES_SELECT_ESTRELLA).sort())
  })
  it('la excepción es REAL: si el guion deja de usar select * (o desaparece), hay que quitarla de la lista', () => {
    for (const rel of Object.keys(EXCEPCIONES_SELECT_ESTRELLA)) {
      expect(fs.existsSync(path.join(RAIZ, rel)), `${rel} ya no existe`).toBe(true)
      expect(usaSelectEstrella(leer(rel)), `${rel} ya no usa select *: quitarlo de la lista`).toBe(true)
      expect(EXCEPCIONES_SELECT_ESTRELLA[rel].length).toBeGreaterThan(30) // con su razón escrita
    }
  })
  it('el detector ve las formas que importan y no se confunde con las columnas explícitas', () => {
    expect(usaSelectEstrella("fetch(SB + '/rest/v1/client_social_images?select=*&estado=eq.ok')")).toBe(true)
    expect(usaSelectEstrella("get('client_social_images?client_id=eq.1&select=*')")).toBe(true)
    expect(usaSelectEstrella("supabase.from('client_social_images').select('*').eq('client_id', c)")).toBe(true)
    expect(usaSelectEstrella('supabase.from("client_social_images").select()')).toBe(true)
    expect(usaSelectEstrella("supabase\n  .from('client_social_images')\n  .select(\n'*')")).toBe(true)
    expect(usaSelectEstrella("fetch(SB + '/rest/v1/client_social_images?select=id,url,estado')")).toBe(false)
    expect(usaSelectEstrella("supabase.from('client_social_images').select('id, url')")).toBe(false)
    expect(usaSelectEstrella("supabase.from('clients').select('*')")).toBe(false)
    expect(usaSelectEstrella("storage/v1/object/client-social-images/x?select=*")).toBe(false) // el almacén de archivos (con guiones) no es la tabla
  })
})

// ───────────────────────── C · quién escribe en client_social_images
/** quienes ya la escribían ANTES del paso 2 (el Servicio de Apify y un guion de una sola vez) */
export const ESCRITORES_CONOCIDOS: Record<string, string> = {
  'scripts/worker-staging/3lyknrP3PoS2KzUf/fotos-anotar.js': 'Servicio de Apify · nodo «Fotos · anotar» · upsert de las fotos de la cuenta propia',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/fotos-revisar.js': 'Servicio de Apify · nodo «Fotos · revisar» · upsert de las fotos que no se pudieron bajar',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/completar-contexto-fotos.mjs': 'guion manual de una sola vez · completa las filas viejas por PATCH',
}
/** quién, DENTRO de src/ y services/, puede escribir en client_social_images: solo la ruta `etiquetar` del portero (paso 4) y solo UPDATE de las 4 columnas de etiqueta */
export const ESCRITORES_DE_ETIQUETAS_EN_SRC: Record<string, string> = {
  'src/lib/cerebro/portero/etiqueta-escritura.ts': 'paso 4 · la ruta `etiquetar` del portero: PATCH de las 4 columnas de etiqueta de UNA foto, filtrado por el id de la foto Y el cliente',
}
export function escribeEnLaTabla(texto: string): boolean {
  for (const m of texto.matchAll(/rest\/v1\/client_social_images/g)) {
    // el PRIMER `method:` después de la dirección es el de ESA llamada (el que sigue puede ser de otra)
    const primero = /method:\s*['"`]([A-Z]+)['"`]/.exec(texto.slice(m.index ?? 0, (m.index ?? 0) + 400))
    if (primero && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(primero[1])) return true
  }
  for (const m of texto.matchAll(/from\(\s*['"`]client_social_images['"`]\s*\)/g)) {
    if (/^\s*\.(insert|upsert|update|delete)\(/.test(texto.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 120))) return true
  }
  return /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?client_social_images\b/i.test(texto)
}
describe('C · nadie escribe en client_social_images salvo quienes ya lo hacían', () => {
  const candidatos = TODOS.filter((rel) => !/(^|\/)__tests__\//.test(rel) && !/\.test\.ts$/.test(rel) && !/^supabase\/(migrations|reversas)\//.test(rel))
  it('el código del producto (src/ y services/) solo la escribe un escritor DECLARADO, y ese solo actualiza las 4 columnas de etiqueta', () => {
    const escriben = candidatos.filter((rel) => /^(src|services)\//.test(rel)).filter((rel) => escribeEnLaTabla(leer(rel)))
    expect(escriben.sort(), `escriben en client_social_images sin estar declarados: ${escriben.join(', ')}`).toEqual(Object.keys(ESCRITORES_DE_ETIQUETAS_EN_SRC).sort())
    for (const rel of Object.keys(ESCRITORES_DE_ETIQUETAS_EN_SRC)) {
      const t = leer(rel).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
      expect(/\bmethod:\s*['"`](POST|PUT|DELETE)['"`]/.test(t), `${rel}: solo se permite PATCH (actualizar), nunca insertar ni borrar`).toBe(false)
      expect(/\.(insert|upsert|delete)\(/.test(t), `${rel}: no puede insertar ni borrar filas`).toBe(false)
    }
  })
  it('cada escritor declarado exporta COLUMNAS_QUE_ESCRIBE y son EXACTAMENTE las 9 de etiqueta y toma (producto, url, caption… jamás)', async () => {
    for (const rel of Object.keys(ESCRITORES_DE_ETIQUETAS_EN_SRC)) {
      const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(RAIZ, rel)).href.replace(/\.ts$/, ''))
      expect([...mod.COLUMNAS_QUE_ESCRIBE].sort(), rel).toEqual(['con_personas', 'etiqueta_confianza', 'etiqueta_modelo', 'etiquetada_en', 'formato', 'producto_visto', 'que_muestra', 'texto_visible', 'tipo_de_toma'])
    }
  })
  it('en scripts/ solo la escriben los tres conocidos; un escritor nuevo falla hasta que se declare con su razón', () => {
    const escriben = candidatos.filter((rel) => rel.startsWith('scripts/')).filter((rel) => escribeEnLaTabla(leer(rel)))
    expect(escriben.sort()).toEqual(Object.keys(ESCRITORES_CONOCIDOS).sort())
  })
  it('el detector ve las formas de escribir', () => {
    expect(escribeEnLaTabla("url: SB + '/rest/v1/client_social_images?on_conflict=client_id', method: 'POST', json: true")).toBe(true)
    expect(escribeEnLaTabla("fetch(SB + '/rest/v1/client_social_images?id=eq.' + c.id, { method: 'PATCH', headers: h })")).toBe(true)
    expect(escribeEnLaTabla("await supabase.from('client_social_images').upsert(filas)")).toBe(true)
    expect(escribeEnLaTabla("supabase.from('client_social_images')\n .update({ que_muestra: 'x' })")).toBe(true)
    expect(escribeEnLaTabla('UPDATE public.client_social_images SET que_muestra = 1')).toBe(true)
    expect(escribeEnLaTabla("get('client_social_images?select=id,url&client_id=eq.1')")).toBe(false)
    expect(escribeEnLaTabla("supabase.from('client_social_images').select('id')")).toBe(false)
    expect(escribeEnLaTabla("method: 'POST', url: `${SB}/storage/v1/object/client-social-images/x.jpg`")).toBe(false) // el almacén de archivos no es la tabla
    expect(escribeEnLaTabla("url: base + '/rest/v1/client_social_images?client_id=eq.1', method: 'GET', json: true }) ... const r = await this.helpers.httpRequest({ method: 'POST'")).toBe(false) // una LECTURA seguida de otra llamada
  })
})
