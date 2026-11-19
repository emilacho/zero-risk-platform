// 19-nov · CC5 · G9 (GO Lenovo 07:59Z · opción A 08:15Z): la alarma del CI contra recortes nuevos.
// Regla: «nada se recorta». Un corte nuevo de texto, de trozos o de fotos rompe el CI salvo que lleve su marca con razón y firma.
// Los que ya existían el 19-nov quedan congelados en `cortes-existentes.json`, cada uno con su clase; esa lista solo se achica.
// Este archivo es la regla exacta (qué es un corte, dónde se mira, qué es una marca válida). Juzgar si la razón es buena es del certificador.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Qué cuenta como corte. Agnóstico: no adivina si recorta texto, una lista de trozos o de fotos; los tres cuentan igual. */
export const PATRONES = [
  { nombre: 'slice desde el inicio', re: /\.slice\(\s*0\s*,/ },
  { nombre: 'slice desde el final', re: /\.slice\(\s*-/ },
  { nombre: 'substring desde el inicio', re: /\.substring\(\s*0\s*,/ },
  { nombre: 'substr', re: /\.substr\(/ },
  { nombre: 'función que trunca o recorta', re: /\b(?:truncat\w*|truncar\w*|recort\w*)\s*\(/i },
]

export const EXTENSIONES = /\.(?:ts|tsx|mjs|js|cjs)$/

/** Lo que no se mira, cada cosa con su razón. */
export const EXCLUIDAS = [
  { re: /(^|\/)(node_modules|__tests__|__fixtures__|__mocks__|tests?|fixtures)\//, razon: 'pruebas y datos de prueba: recortan para comparar, no para mandar a nadie' },
  { re: /\.test\.[cm]?[jt]sx?$/, razon: 'pruebas' },
  { re: /^(supabase|sql)\//, razon: 'lo histórico de las migraciones: ya corrió y no se reescribe (Lenovo 07:59Z)' },
  { re: /^(docs|evidence|outputs|n8n-workflows)\//, razon: 'documentos y copias guardadas, no código que corre' },
]

export const excluida = (archivo) => EXCLUIDAS.some((e) => e.re.test(archivo))

/** Los archivos que se miran: los guardados en git (lo ignorado no cuenta), con extensión de código y fuera de lo excluido. */
export function archivosAMirar(raiz) {
  const salida = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 28 })
  return salida.split('\0').filter((a) => a && EXTENSIONES.test(a) && !excluida(a)).sort()
}

export const normalizar = (linea) => linea.replace(/\s+/g, ' ').trim()

/** La lista guarda la huella de la línea, no su texto: así no copia código (ni nombres de tablas, ni nada que otras guardas vigilen). */
// corte: la huella es un prefijo fijo de un hash, no texto de nadie · firma CC5 2026-11-19
export const huella = (linea) => createHash('sha256').update(normalizar(linea)).digest('hex').slice(0, 16)

const esComentario =(l) => /^\s*(\/\/|\/\*|\*)/.test(l)

/** La marca: en la misma línea o en la de arriba.
 *  `// corte: <razón> · firma <quién> <AAAA-MM-DD>`
 *  `// corte (lectura): <razón> · firma <quién> <AAAA-MM-DD> · papel raw/<…>.md · autoriza Lenovo|Emilio`
 *  «lectura» = el corte toca algo que lee un agente, un documento o la base: es una excepción con dueño (Lenovo 08:15Z). */
const MARCA = /(?:\/\/|\/\*)\s*corte(?:\s*\((\w+)\))?\s*:\s*(.*?)\s*(?:\*\/\s*\}?)?$/

export function leerMarca(linea) {
  const m = MARCA.exec(linea)
  if (!m) return null
  const tipo = m[1] ?? 'corte'
  const partes = m[2].split(/\s*·\s+/) // «corte: · firma …» deja la razón vacía (no la confunde con la firma)
  const razon = (partes.shift() ?? '').trim()
  const campo = (n) => partes.find((p) => p.startsWith(n + ' '))?.slice(n.length + 1).trim() ?? null
  return { tipo, razon, firma: campo('firma'), papel: campo('papel'), autoriza: campo('autoriza') }
}

const RAZON_VACIA = /^(?:|\.+|…|<.*>|todo|tbd|x+|razón|razon|-+)$/i

/** Los problemas de una marca (lista vacía = válida). Revisa la forma exacta; si la razón es honesta lo juzga el certificador. */
export function problemasDeLaMarca(m) {
  const p = []
  if (!['corte', 'lectura'].includes(m.tipo)) p.push(`el tipo «${m.tipo}» no existe: usa «corte:» o «corte (lectura):»`)
  if (RAZON_VACIA.test(m.razon)) p.push('falta la razón: escribe por qué este corte tiene que existir')
  if (!m.firma || !/^\S+\s+\d{4}-\d{2}-\d{2}$/.test(m.firma)) p.push('falta la firma: «· firma <quién> <AAAA-MM-DD>»')
  if (m.tipo === 'lectura') {
    if (!m.papel || !/^raw\/\S+\.md$/.test(m.papel)) p.push('un corte de lectura nombra el papel donde se firmó: «· papel raw/<…>.md»')
    if (!m.autoriza || !/^(Lenovo|Emilio)$/.test(m.autoriza)) p.push('un corte de lectura lo autoriza Lenovo, o Emilio si es su documento: «· autoriza Lenovo»')
  }
  return p
}

/** Los cortes de un archivo: [{ archivo, n, linea, patrones, marca }] (marca = la de la línea o la de arriba, o null). */
export function cortesDelArchivo(archivo, texto) {
  const lineas = texto.split(/\r?\n/)
  const out = []
  lineas.forEach((l, i) => {
    if (esComentario(l)) return
    const patrones = PATRONES.filter((p) => p.re.test(l)).map((p) => p.nombre)
    if (!patrones.length) return
    const marca = leerMarca(l) ?? (i > 0 && esComentario(lineas[i - 1]) ? leerMarca(lineas[i - 1]) : null)
    out.push({ archivo, n: i + 1, linea: normalizar(l), huella: huella(l), patrones, marca })
  })
  return out
}

export function todosLosCortes(raiz) {
  return archivosAMirar(raiz).flatMap((a) => cortesDelArchivo(a, readFileSync(path.join(raiz, a), 'utf8')))
}

export const CLASES = ['registro', 'fecha-o-id', 'foto-de-n8n', 'por-revisar-en-G8']

const llave = (archivo, linea, clase) => `${archivo}\u0000${linea}\u0000${clase ?? ''}`

/** Cuenta por (archivo, huella) las entradas de la lista. */
export function contarLista(cortes) {
  const m = new Map()
  for (const c of cortes) {
    const k = llave(c.archivo, c.huella)
    m.set(k, (m.get(k) ?? 0) + c.veces)
  }
  return m
}

/** La revisión completa. Devuelve los problemas agrupados; todo vacío = verde. */
export function revisar({ cortes, lista, listaBase }) {
  const sinMarca = cortes.filter((c) => !c.marca)
  const marcasMalas = cortes.filter((c) => c.marca && problemasDeLaMarca(c.marca).length).map((c) => ({ ...c, problemas: problemasDeLaMarca(c.marca) }))

  const enLista = contarLista(lista.cortes)
  const enCodigo = new Map()
  for (const c of sinMarca) {
    const k = llave(c.archivo, c.huella)
    enCodigo.set(k, [...(enCodigo.get(k) ?? []), c])
  }
  const nuevos = []
  for (const [k, cs] of enCodigo) {
    const permitidas = enLista.get(k) ?? 0
    if (cs.length > permitidas) nuevos.push(...cs.slice(permitidas))
  }
  const sobranEnLista = []
  for (const [k, veces] of enLista) {
    const hay = enCodigo.get(k)?.length ?? 0
    if (hay < veces) {
      const [archivo, h] = k.split('\u0000')
      const e = lista.cortes.find((c) => c.archivo === archivo && c.huella === h)
      sobranEnLista.push({ archivo, n: e?.n, linea: `huella ${h} (la línea ${e?.n ?? '?'} al congelar)`, veces, hay })
    }
  }
  const clasesMalas = lista.cortes.filter((c) => !CLASES.includes(c.clase))

  const creceLaLista = []
  if (listaBase) {
    const base = new Map()
    for (const c of listaBase.cortes) {
      const k = llave(c.archivo, c.huella, c.clase)
      base.set(k, (base.get(k) ?? 0) + c.veces)
    }
    const ahora = new Map()
    for (const c of lista.cortes) {
      const k = llave(c.archivo, c.huella, c.clase)
      ahora.set(k, (ahora.get(k) ?? 0) + c.veces)
    }
    for (const [k, veces] of ahora) {
      const antes = base.get(k) ?? 0
      if (veces > antes) {
        const [archivo, h, clase] = k.split('\u0000')
        creceLaLista.push({ archivo, linea: `huella ${h}`, clase, antes, ahora: veces })
      }
    }
  }
  return { nuevos, marcasMalas, sobranEnLista, clasesMalas, creceLaLista }
}

/** Solo para congelar la lista el 19-nov (no se vuelve a usar para agregar): pone a cada corte existente su clase. */
export function claseParaCongelar(c) {
  if (c.archivo.startsWith('scripts/worker-staging/')) return 'foto-de-n8n'
  const l = c.linea
  // si la línea nombra algo que lee un agente o un documento, va a G8 aunque también tenga un error o una fecha
  const tocaLoQueSeLee = /contenido|content|texto|prompt|mensajes?\b|brief|manual|\bplan\b|resumen|documento|pedido|tarea|instruc/i.test(l)
  if (!tocaLoQueSeLee && /console\.|logger\.|\bthrow\b|new Error\(|\.(?:error|warn)\(|\b(?:e|err|error)\.message\b|\bString\(\s*(?:e|err|error)\b|error_message|errorMessage|\berror\s*:/.test(l)) return 'registro'
  // fecha o id solo si TODOS los cortes de la línea son de fecha o de id (una línea que además corta otra cosa va a G8)
  let resto = l.replace(/\.toISOString\(\)\s*\.(?:slice|substring)\(\s*0\s*,\s*\d+\s*\)/g, '')
  if (/fecha|date|iso|_at\b|\bts\b|\bdia\b|día|hoy|\bmes\b/i.test(l)) resto = resto.replace(/\.slice\(\s*0\s*,\s*(?:4|7|10|13|16|19)\s*\)/g, '')
  if (/\bid\b|_id\b|uuid|sha|hash|commit|exec/i.test(l)) resto = resto.replace(/\.slice\(\s*0\s*,\s*(?:6|7|8|12)\s*\)/g, '')
  if (resto !== l && !PATRONES.some((p) => p.re.test(resto))) return 'fecha-o-id'
  return 'por-revisar-en-G8'
}

export const MENSAJE = [
  'No cortes. Si de verdad hace falta, márcalo con su razón y su firma, en la misma línea o en la de arriba:',
  '  // corte: <por qué tiene que existir> · firma <quién> <AAAA-MM-DD>',
  'Si el corte toca algo que lee un agente, un documento o la base, es una excepción con dueño:',
  '  // corte (lectura): <por qué> · firma <quién> <AAAA-MM-DD> · papel raw/<papel donde se firmó>.md · autoriza Lenovo',
  '(o «autoriza Emilio» si es su documento). La lista de cortes que ya existían (scripts/cortes/cortes-existentes.json) solo se achica: no le agregues líneas.',
].join('\n')
