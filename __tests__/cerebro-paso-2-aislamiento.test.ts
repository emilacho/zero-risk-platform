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
export const NOMBRES_NUEVOS = /\b(cerebro_ingresos|cerebro_fichas|que_muestra|producto_visto|etiquetada_en|etiqueta_modelo|texto_visible|etiqueta_confianza|con_personas|tipo_de_toma)\b/
/** quién PUEDE nombrarlas: la migración y su reversa, los guiones de auditoría, el cerebro (su carpeta), la ruta del portero y estas dos pruebas */
export const PUEDEN_NOMBRARLAS = [
  /^supabase\/migrations\/202610060100_cerebro_paso_2_tablas_y_columnas\.sql$/,
  /^supabase\/reversas\/202610060100_cerebro_paso_2_REVERSA\.sql$/,
  /^supabase\/migrations\/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza\.sql$/,
  /^supabase\/reversas\/202610070100_cerebro_fotos_texto_visible_y_etiqueta_confianza_REVERSA\.sql$/,
  /^supabase\/migrations\/202610080300_cerebro_fotos_toma\.sql$/,
  /^supabase\/reversas\/202610080300_cerebro_fotos_toma_REVERSA\.sql$/,
  /^__tests__\/relevo-19-migraciones\.test\.ts$/,
  /^scripts\/n8n-nodos\/cerebro-diario-etiquetar\.js$/,
  /^__tests__\/cerebro-diario-etiquetado\.test\.ts$/,
  // ronda 69 · copias VERSIONADAS (respaldo para la reversa y flujo arreglado) del flujo «Cerebro · ponerse al día (diario)»: contienen el nodo de etiquetado del portero que ya existía; el cambio de esta ronda es solo la cabecera de la llave de Apify
  /^scripts\/worker-staging\/EZXAFQvKZsJlvGNO\/cerebro-diario-(ANTES|ARREGLADO)-ronda69-2026-10-11\.json$/,
  /^scripts\/audit\/cerebro-tablas-no-las-usa-nadie\.mjs$/,
  /^scripts\/audit\/cerebro-paso-2-verifica-base\.mjs$/,
  /^src\/lib\/cerebro\//,
  // 28-oct · LA MESA: el tablero del equipo MUESTRA al compañero la lista de fotos propias del cliente (solo LECTURA de las columnas de etiqueta ya cargadas); no escribe nada
  /^src\/lib\/oficina\/mesa\/pedidos\.ts$/,
  /^src\/app\/api\/brain\/portero\//,
  // 14-oct · EL PORTERO QUE ALIMENTA (firma de Emilio 14-oct): el MISMO portero del cerebro, en su propia carpeta (fuera de `src/lib/cerebro/` porque la vigilancia de la condición 1 prohíbe
  // partir textos del PEDIDO en esa carpeta; aquí se filtra material raspado, no el pedido). Escribe `cerebro_fichas`/`cerebro_ingresos` y las 2 tablas nuevas de su migración (SIN APLICAR).
  /^src\/lib\/portero-alimenta\//,
  /^src\/app\/api\/brain\/alimentar\//,
  /^supabase\/migrations\/202610141500_cerebro_portero_alimenta\.sql$/,
  /^supabase\/reversas\/202610141500_cerebro_portero_alimenta_REVERSA\.sql$/,
  // 15-oct · el alcance de la ficha (nuevos brazos): una columna anulable en `cerebro_fichas`
  /^supabase\/migrations\/202610151500_cerebro_alcance_de_la_ficha\.sql$/,
  /^supabase\/reversas\/202610151500_cerebro_alcance_de_la_ficha_REVERSA\.sql$/,
  /^scripts\/ops\/portero-(alimenta-seco|limpiar-repetidas)\.ts$/,
  // 15-oct · el seco de la auditoría diaria: solo LEE fichas y crudos reales para medir falsos errores antes de que pueda apagar nada
  /^scripts\/ops\/auditoria-seco\.ts$/,
  // 16-oct · (asignar-fuentes-a-sedes versiona fichas por la función de reasignación del portero) · el importador de las exportaciones CSV de Loyverse escribe por la MISMA función del portero (`archivarFichasDeBrazos`) y lee lo ya archivado; la lista de pedidos no resueltos solo LEE `cerebro_pedidos`
  /^scripts\/ops\/(importar-ventas-loyverse-csv|escribir-pedidos-no-resueltos|asignar-fuentes-a-sedes)\.ts$/,
  // 16-oct · P2: la migración de las pausas por cliente (referencia a clients; el vigilante la usa) y su reversa
  /^supabase\/migrations\/202610161600_cerebro_portero_pausas\.sql$/,
  /^supabase\/reversas\/202610161600_cerebro_portero_pausas_REVERSA\.sql$/,
  // 16-oct · la puerta del dueño: su migración (la tabla de preguntas pendientes referencia `cerebro_fichas`) y su reversa
  /^supabase\/migrations\/202610161500_cerebro_dueno_preguntas\.sql$/,
  /^supabase\/reversas\/202610161500_cerebro_dueno_preguntas_REVERSA\.sql$/,
  // 29-oct · el aprendizaje del dueño: su migración (ensancha el alcance de la ficha y crea el índice, el catálogo y las medidas) y su reversa
  /^supabase\/migrations\/202610291600_cerebro_aprendizaje_del_dueno\.sql$/,
  /^supabase\/reversas\/202610291600_cerebro_aprendizaje_del_dueno_REVERSA\.sql$/,
  /^scripts\/worker-staging\/ogfq56oIEoHufFPM\//,
  // el puente: `ingest-source` acepta `cerebro_fichas` como origen de trozos (única puerta de escritura de evidencia al índice)
  /^src\/app\/api\/brain\/ingest-source\/route\.ts$/,
  // plan v3 · V14 (15-oct): el LECTOR del plan lee `cerebro_fichas` (y el crudo por la misma compuerta del portero) para armar el brazo primario. Solo SELECT: no escribe nada.
  /^src\/lib\/planeacion\/dato-v1\/lector-cerebro\.ts$/,
  // plan v3 · V11: el kit del seco solo CUENTA filas (contadores antes/después); no las lee ni las escribe
  /^scripts\/ops\/plan-v3-seco\/matriz\.mjs$/,
  /^__tests__\/plan-v3-v14-lector-cerebro\.test\.ts$/,
  // plan v3 · conexión (15-oct): la prueba arma una base EN MEMORIA con `cerebro_fichas` para ejercer el lector; no toca la base real
  /^__tests__\/plan-v3-conexion\.test\.ts$/,
  // plan v3 · ventas del punto de venta como dato (16-oct): la prueba lee las 10 fichas reales de un archivo y arma una base EN MEMORIA; no toca la base real
  /^__tests__\/plan-v3-ventas-loyverse\.test\.ts$/,
  /^__tests__\/fixtures\/ventas-loyverse\//,
  /^__tests__\/cerebro-paso-2-(aislamiento|migracion)\.test\.ts$/,
  /^__tests__\/cerebro-fotos-2-columnas\.test\.ts$/,
  // oficina de creativos (sala 1) · LECTURA de las etiquetas de las fotos para descartar las que no sirven: los ÚNICOS que las nombran son el lector `fotos.ts` y el adaptador que las SELECCIONA (`adaptadores.ts`); no escriben nada
  /^src\/lib\/oficina\/(fotos|adaptadores)\.ts$/,
  /^src\/lib\/oficina\/__tests__\/fotos-chequeos\.test\.ts$/,
  // oficina · el MATERIAL que se le pide al portero (27-oct): LEE las etiquetas (nunca escribe) para rotular lo que el portero trae, armar las referencias de estilo en palabras y marcar el origen de cada imagen
  /^src\/lib\/oficina\/(material|prompts-sin-invencion|marcas-de-origen)\.ts$/,
  /^src\/lib\/oficina\/__tests__\/(material|material-imagen-y-reapertura|adaptadores)\.test\.ts$/,
  /^__tests__\/oficina-material-ruta-migracion-flujo\.test\.ts$/,
  // videos (31-oct): la prueba y la lectura leen etiquetas de las capturas de los videos
  /^__tests__\/videos-y-pdf-escaneados\.test\.ts$/,
  /^src\/lib\/cerebro\/portero\/videos-lectura\.ts$/,
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
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-ANTES-2026-10-10-r51.json': 'copia VERSIONADA del flujo del Servicio de Apify antes del cambio del relevo 51 (respaldo para la reversa) · contiene los nodos «Fotos · …» que ya existían; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-ARREGLADO-2026-10-10-r51.json': 'copia VERSIONADA del flujo del Servicio de Apify tras el cambio del relevo 51 (solo cambia transform-sections) · los nodos «Fotos · …» son los mismos de siempre; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-rol-propio-2026-10-21.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de que el rol propio/competidor de las fotos lo decida la llamada (respaldo para la reversa) · contiene los nodos «Fotos · …» que ya existían; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-rol-propio-2026-10-21.json': 'copia VERSIONADA del flujo del Servicio de Apify con el rol de las fotos decidido por la llamada (solo cambia el código de «Fotos · lista») · los nodos «Fotos · …» son los mismos de siempre; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-fotos-competencia-2026-10-27.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de que Mapas, sitios de competidores y anuncios dejen fotos con su origen (respaldo para la reversa) · contiene los nodos «Fotos · …» que ya existían',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-fotos-competencia-2026-10-27.json': 'copia VERSIONADA del flujo del Servicio de Apify con las fotos de competencia y referencias (solo cambia el código de «Fotos · lista» y «Fotos · revisar») · los nodos «Fotos · …» son los mismos escritores ya declarados',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-guardar-todo-2026-10-31.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de «guardar todo» (respaldo para la reversa) · contiene los nodos «Fotos · …» que el Servicio ya tenía',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-guardar-todo-2026-10-31.json': 'copia VERSIONADA del flujo del Servicio de Apify con todas las imágenes y capturas de los sitios (cambia «Fotos · lista» y «Fotos · revisar») · los nodos «Fotos · …» son los mismos de siempre',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-ronda68-2026-10-11.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de la ronda 68 (respaldo para la reversa) · contiene los nodos «Fotos · …» que ya existían; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-ronda68-2026-10-11.json': 'copia VERSIONADA del flujo del Servicio de Apify tras la ronda 68 (cambian «Guardar lo crudo», «Armar el cuerpo del raspador» y «Armar la fila de la libreta») · los nodos «Fotos · …» son los mismos de siempre; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-ronda69-2026-10-11.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de la ronda 69 (respaldo para la reversa) · contiene los nodos «Fotos · …» que ya existían; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-ronda69-2026-10-11.json': 'copia VERSIONADA del flujo del Servicio de Apify tras la ronda 69 (la llave de Apify pasa de la dirección a la cabecera) · los nodos «Fotos · …» son los mismos de siempre; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-fuentes-2026-10-12.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de las fuentes públicas (respaldo para la reversa) · contiene los nodos «Fotos · …» que ya existían; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-fuentes-2026-10-12.json': 'copia VERSIONADA del flujo del Servicio de Apify con las 9 funciones de fuentes públicas (aditivo) · los nodos «Fotos · …» son los mismos de siempre; no es un escritor nuevo',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-VIVO-antes-r75-2026-10-12.json': 'respaldo del flujo del Servicio de Apify justo antes de corregir la lectura de los subtítulos de YouTube (ronda 75) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-VIVO-antes-r76-2026-10-12.json': 'respaldo del flujo del Servicio de Apify justo antes de la ronda 76 (importe estable + voz real) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-importe-r76-2026-10-12.json': 'copia VERSIONADA del flujo del Servicio de Apify con el importe estable y la voz real (ronda 76) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-planv3-v8-2026-10-15.json': 'respaldo del flujo del Servicio de Apify antes de V8 del plan v3 (origen y tope por llamada) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-planv3-v8-2026-10-15.json': 'copia VERSIONADA del Servicio de Apify con V8 del plan v3 (aditivo: origen, workflow_execution_id, tope_usd) · los nodos «Fotos · …» siguen idénticos, solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-esquemas-vivos-2026-10-19.json': 'respaldo del flujo del Servicio de Apify antes de los esquemas como dato (19-oct) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-transcripciones-2026-10-19.json': 'respaldo del flujo del Servicio de Apify antes de leer las transcripciones de video (19-oct) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-transcripciones-2026-10-19.json': 'copia VERSIONADA del Servicio de Apify con el nodo «Leer transcripciones» (aditivo) · los nodos «Fotos · …» siguen idénticos, solo su copia',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-esquemas-vivos-2026-10-19.json':'copia VERSIONADA del Servicio de Apify con el validador de esquemas como dato (aditivo: renombres, «sin dato por cambio del raspador», aviso) · los nodos «Fotos · …» siguen idénticos, solo su copia',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-geolocalizacion-2026-10-15.json': 'respaldo del flujo del Servicio de Apify antes de reenviar customGeolocation (competencia por sede) · solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-geolocalizacion-2026-10-15.json': 'copia VERSIONADA del Servicio de Apify con customGeolocation reenviado a google_maps_scraper (aditivo) · los nodos «Fotos · …» siguen idénticos, solo su copia, no escribe nada',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-guardar-todo-2-2026-10-31.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de «guardar todo» parte 2 (respaldo para la reversa) · solo conserva el nombre de la tabla dentro del flujo, no la escribe',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-guardar-todo-2-2026-10-31.json': 'copia VERSIONADA del flujo del Servicio de Apify con fondos CSS, GIF y PDF enlazados (parte 2) · solo conserva el nombre de la tabla dentro del flujo, no la escribe',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-menciones-2026-10-14.json': 'copia VERSIONADA del flujo del Servicio de Apify antes de sumar menciones_en_redes (respaldo para la reversa) · solo conserva el nombre de la tabla dentro del flujo, no la escribe',
  'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-menciones-2026-10-14.json': 'copia VERSIONADA del flujo del Servicio de Apify con menciones_en_redes (aditivo) · solo conserva el nombre de la tabla dentro del flujo, no la escribe',
}
/** quién, DENTRO de src/ y services/, puede escribir en client_social_images: solo la ruta `etiquetar` del portero (paso 4) y solo UPDATE de las 4 columnas de etiqueta */
export const ESCRITORES_DE_ETIQUETAS_EN_SRC: Record<string, string> = {
  'src/lib/cerebro/portero/etiqueta-escritura.ts': 'paso 4 · la ruta `etiquetar` del portero: PATCH de las 4 columnas de etiqueta de UNA foto, filtrado por el id de la foto Y el cliente',
}
/** quién, DENTRO de src/, puede INSERTAR filas (copia de fotos propias): solo la ficha propia de Mapas, confirmada por el portero (31-oct · parte 2); jamás escribe columnas de etiqueta */
export const ESCRITORES_DE_COPIA_EN_SRC: Record<string, string> = {
  'src/lib/portero-alimenta/fotos-de-mapas-propia.ts': 'copia las fotos de la ficha de Mapas que `fichaPropiaDeMapas` confirma como del cliente (nombre exacto o cuenta propia; ambigua u homónimo = ninguna) como propio/maps_foto',
  'src/lib/portero-alimenta/videos-del-cerebro.ts': 'guarda las capturas de momentos clave de los videos (tipo video_captura, enlazadas por video_id) que el portero baja; solo inserta, jamás toca columnas de etiqueta',
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
    expect(escriben.sort(), `escriben en client_social_images sin estar declarados: ${escriben.join(', ')}`).toEqual([...Object.keys(ESCRITORES_DE_ETIQUETAS_EN_SRC), ...Object.keys(ESCRITORES_DE_COPIA_EN_SRC)].sort())
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
  it('el escritor de COPIA en src/ no toca jamás las columnas de etiqueta ni borra', () => {
    for (const rel of Object.keys(ESCRITORES_DE_COPIA_EN_SRC)) {
      const t = leer(rel).split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
      expect(/que_muestra|producto_visto|etiqueta_modelo|etiqueta_confianza|texto_visible|tipo_de_toma|con_personas|etiquetada_en/.test(t), `${rel}: no escribe columnas de etiqueta`).toBe(false)
      expect(/method:\s*['"`](DELETE|PATCH)['"`]/.test(t), `${rel}: no borra ni actualiza`).toBe(false)
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
