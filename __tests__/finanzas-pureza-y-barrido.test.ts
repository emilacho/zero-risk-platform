/**
 * OFICINA FINANCIERA · pureza y BARRIDO AGNÓSTICO (CC#1 · 14-oct · rev. 9). Este mismo archivo viaja en TODAS las ramas de la oficina y barre los archivos que cada una trae
 * (R4 de CC#3): ninguna rama queda sin el barrido de sus propios archivos.
 *  · PUREZA (R2): la calculadora y todo `src/lib/finanzas/**` salvo la lectura del hilo NO pueden llamar a la red, ni a un modelo ni a un proveedor: la prueba FALLA si aparece `fetch`.
 *  · BARRIDO (R3): nombres de clientes, ciudades, países, rubros, productos, días y patrones de un plan concreto, fuera de los DATOS (catálogos sembrados). La prueba de detección
 *    INSERTA la palabra en una copia de un archivo real y comprueba que el barrido FALLA (no es una tautología).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const existe = (r: string) => fs.existsSync(path.join(RAIZ, r))
const leer = (r: string) => fs.readFileSync(path.join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n')
const archivosDe = (d: string): string[] => (!existe(d) ? [] : fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivosDe(path.join(d, e.name)) : [path.join(d, e.name).replace(/\\/g, '/')])))

// ───────────────────────────────────────────────────────── PUREZA
const PROHIBIDO_EN_LO_PURO = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\baxios\b/, /node-fetch/, /@anthropic-ai/, /\bopenai\b/i, /from 'node:(https?|net|child_process|dgram)'/, /\bchat\.postMessage\b/, /\bconversations\.(open|replies)\b/, /api\.anthropic\.com/, /slack\.com\/api/]
/** `process.env` solo donde se lee la llave interna (la ruta); y `fetch` solo en la lectura del hilo (F7), que lo recibe por parámetro */
export function purezaDe(archivo: string, texto: string): string[] {
  const cuerpo = quitarComentarios(texto, archivo)
  const malos: string[] = []
  const esHilo = archivo.endsWith('hilo-slack.ts')
  for (const r of PROHIBIDO_EN_LO_PURO) {
    // la lectura del hilo es la ÚNICA que puede llamar a Slack (recibe `fetch` y la llave por parámetro)
    if (esHilo && (r.source === '\\bfetch\\s*\\(' || r.source.startsWith('\\bconversations') || r.source.startsWith('slack'))) continue
    if (r.test(cuerpo)) malos.push(r.source)
  }
  if (/process\.env/.test(cuerpo) && !archivo.endsWith('/ruta.ts')) malos.push('process.env')
  return malos
}

// ───────────────────────────────────────────────────────── BARRIDO
const NOMBRES_CONCRETOS = [
  'naufrago', 'náufrago', 'peniche', 'seguridad industrial', 'olón', 'olon ', 'guayaquil', 'quito', 'bogotá', 'bogota', 'medellín', 'medellin', 'cuenca', 'manabí', 'manabi', 'santa elena', 'manta ',
  'ecuador', 'colombia', 'méxico', 'mexico', 'españa', 'perú', 'argentina', 'chile', 'lima ', 'madrid', 'barcelona',
]
const PALABRAS_DE_NEGOCIO = [
  'restaurante', 'encebollado', 'ceviche', 'sopa', 'pizzer', 'cafeter', 'gimnasio', 'dentista', 'abogado', 'hotel', 'peluquer', 'barber',
  'whatsapp', 'delivery', 'tienda', 'envío', 'jueves a lunes', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
  'pedidos rastreables', 'pedido mínimo', 'mixto', 'bebida', '15/75',
]
export function quitarComentarios(texto: string, archivo: string): string {
  if (archivo.endsWith('.sql')) return texto.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n')
}
/** en SQL, los INSERT son DATOS sembrados (catálogos): se quitan antes de buscar palabras de negocio */
export function sinDatos(texto: string, archivo: string): string {
  return archivo.endsWith('.sql') ? texto.replace(/INSERT INTO[\s\S]*?ON CONFLICT[^;]*;/g, '') : texto
}
export function barrer(texto: string, archivo: string): string[] {
  const completo = texto.toLowerCase()
  const codigo = sinDatos(quitarComentarios(texto, archivo), archivo).toLowerCase()
  return [...NOMBRES_CONCRETOS.filter((p) => completo.includes(p)), ...PALABRAS_DE_NEGOCIO.filter((p) => codigo.includes(p))]
}

const CANDIDATOS = [
  'src/lib/finanzas/calculadora.ts', 'src/lib/finanzas/tipos.ts', 'src/lib/finanzas/repartir.ts', 'src/lib/finanzas/firma.ts', 'src/lib/finanzas/ruta.ts', 'src/lib/finanzas/resumen.ts',
  'src/lib/finanzas/preguntas.ts', 'src/lib/finanzas/hilo-slack.ts', 'src/lib/finanzas/almacen-supabase.ts',
  'src/app/api/finanzas/bloque/route.ts', 'src/app/api/finanzas/tablero/route.ts',
  'scripts/worker-staging/finanzas-f3/construir-f3.mjs', 'scripts/worker-staging/finanzas-f4/chequeos-finanzas.js', 'scripts/worker-staging/finanzas-f4/construir-f4.mjs',
  'supabase/migrations/202610141800_finanzas_oficina_apagada.sql', 'scripts/ops/instalar-identidades-finanzas.mjs',
]
const PRESENTES = CANDIDATOS.filter(existe)

describe('esta rama trae archivos de la oficina financiera y TODOS se barren', () => {
  it('hay al menos un archivo presente (si no, la prueba no vigila nada)', () => { expect(PRESENTES.length).toBeGreaterThan(0) })
  for (const f of PRESENTES) {
    it(`${f}: sin nombres concretos ni palabras de negocio en reglas, fórmulas, rutas, contratos ni plantillas`, () => {
      expect(barrer(leer(f), f)).toEqual([])
    })
  }
})

describe('PUREZA · la calculadora y lo demás de src/lib/finanzas no llaman a la red, a un modelo ni a un proveedor (R2)', () => {
  const lib = archivosDe('src/lib/finanzas').filter((f) => f.endsWith('.ts'))
  it('hay archivos que vigilar', () => { if (existe('src/lib/finanzas')) expect(lib.length).toBeGreaterThan(0) })
  for (const f of lib) {
    it(`${f}: sin fetch, sin proveedores de modelos, sin Slack${f.endsWith('hilo-slack.ts') ? ' (salvo la lectura del hilo, que recibe fetch y llave por parámetro)' : ''}`, () => {
      expect(purezaDe(f, leer(f))).toEqual([])
    })
  }
  it('la lectura del hilo NO lee variables de entorno (la llave entra por parámetro)', () => {
    if (existe('src/lib/finanzas/hilo-slack.ts')) expect(leer('src/lib/finanzas/hilo-slack.ts')).not.toMatch(/process\.env/)
  })
})

describe('el barrido y la pureza DETECTAN de verdad (insertan la palabra en una copia de un archivo real)', () => {
  const base = PRESENTES[0]
  const texto = leer(base)
  for (const p of ['restaurante', 'WhatsApp', 'Cuenca', 'Manabí', 'jueves', 'delivery', 'encebollado', 'tienda', 'Náufrago']) {
    it(`si «${p}» apareciera en el código de ${base}, el barrido falla`, () => {
      expect(barrer(texto, base)).toEqual([])
      const sucio = base.endsWith('.sql') ? `${texto}\nSELECT '${p}';` : `${texto}\nconst regla = 'cuando el cliente es ${p}'\n`
      expect(barrer(sucio, base).length).toBeGreaterThan(0)
    })
  }
  it('un nombre concreto se detecta AUNQUE esté en un comentario; una palabra de negocio en un comentario no cuenta', () => {
    expect(barrer('// cliente Náufrago\nconst x = 1', 'a.ts').length).toBeGreaterThan(0)
    expect(barrer('// el pedido por whatsapp\nconst x = 1', 'a.ts')).toEqual([])
    expect(barrer("INSERT INTO t (a) VALUES ('Visita a la tienda') ON CONFLICT (a) DO NOTHING;", 'a.sql')).toEqual([])
    expect(barrer("INSERT INTO t (a) VALUES ('Guayaquil') ON CONFLICT (a) DO NOTHING;", 'a.sql').length).toBeGreaterThan(0)
  })
  it('la pureza falla si aparece fetch, un proveedor o una variable de entorno de llaves', () => {
    expect(purezaDe('src/lib/finanzas/calculadora.ts', 'export const x = 1')).toEqual([])
    expect(purezaDe('src/lib/finanzas/calculadora.ts', "const r = await fetch('https://x')").length).toBeGreaterThan(0)
    expect(purezaDe('src/lib/finanzas/calculadora.ts', "import OpenAI from 'openai'").length).toBeGreaterThan(0)
    expect(purezaDe('src/lib/finanzas/calculadora.ts', 'const k = process.env.ANTHROPIC_API_KEY').length).toBeGreaterThan(0)
    expect(purezaDe('src/lib/finanzas/firma.ts', "await fetch('https://slack.com/api/chat.postMessage')").length).toBeGreaterThan(0)
    // un fetch en un comentario no cuenta; la ruta sí puede leer su variable
    expect(purezaDe('src/lib/finanzas/calculadora.ts', '// nunca fetch(...)\nexport const y = 2')).toEqual([])
    expect(purezaDe('src/lib/finanzas/ruta.ts', 'const e = process.env')).toEqual([])
    // la lectura del hilo SÍ usa fetch (recibido por parámetro) pero no llaves de entorno
    expect(purezaDe('src/lib/finanzas/hilo-slack.ts', "const f = p.fetch ?? fetch\nawait f(url.toString())")).toEqual([])
    expect(purezaDe('src/lib/finanzas/hilo-slack.ts', 'const k = process.env.SLACK_BOT_TOKEN').length).toBeGreaterThan(0)
  })
})
