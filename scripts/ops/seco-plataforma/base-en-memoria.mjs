/**
 * BASE EN MEMORIA para el doble chequeo en seco: habla lo justo del protocolo de Supabase para que las rutas REALES funcionen sin tocar la base real.
 * No valida columnas: una columna mal escrita en el código no falla aquí. Tampoco aplica valores por defecto de la base ni permisos: eso se declara en lo que el seco no prueba.
 *
 * Una tabla se guarda como `tabla` o, si está en otra área, como `area.tabla`.
 */
import { randomUUID } from 'node:crypto'

const respuesta = (status, cuerpo, cabeceras = {}) => ({ status, cuerpo, cabeceras })
const errorDe = (status, code, message) => respuesta(status, { code, message, details: null, hint: null })
const texto = (v) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** `a,b,in.(c,d)` → partes, sin cortar dentro de paréntesis ni comillas */
function partir(s) {
  const partes = []
  let nivel = 0, comillas = false, actual = ''
  for (const ch of s) {
    if (ch === '"') comillas = !comillas
    if (!comillas && ch === '(') nivel++
    if (!comillas && ch === ')') nivel--
    if (ch === ',' && nivel === 0 && !comillas) { partes.push(actual); actual = '' } else actual += ch
  }
  if (actual) partes.push(actual)
  return partes
}

const sinComillas = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v)
const comoLike = (patron, banderas) => new RegExp('^' + patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.') + '$', banderas)

/** Lee el valor de una columna, también `config->>x` y `config->a->b` */
function valorDe(fila, col) {
  const m = col.split(/->>?/)
  let v = fila[m[0]]
  for (const k of m.slice(1)) v = v && typeof v === 'object' ? v[k] : undefined
  return v
}

/** ¿`col` cumple `op.valor`? Lanza si el operador no está: mejor un error visible que un filtro que deja pasar todo */
export function cumple(fila, col, expresion) {
  const negado = expresion.startsWith('not.')
  const e = negado ? expresion.slice(4) : expresion
  const punto = e.indexOf('.')
  const op = e.slice(0, punto), crudo = e.slice(punto + 1)
  const v = valorDe(fila, col)
  let r
  if (op === 'eq') r = v === true || v === false ? String(v) === crudo : v !== null && v !== undefined && texto(v) === sinComillas(crudo)
  else if (op === 'neq') r = v !== null && v !== undefined && texto(v) !== sinComillas(crudo)
  else if (op === 'is') r = crudo === 'null' ? v === null || v === undefined : String(v) === crudo
  else if (op === 'in') r = partir(crudo.replace(/^\(|\)$/g, '')).map(sinComillas).includes(texto(v))
  else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (v === null || v === undefined) r = false
    else {
      const [a, b] = typeof v === 'number' ? [v, Number(crudo)] : [String(v), sinComillas(crudo)]
      r = op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b
    }
  } else if (op === 'like') r = v !== null && v !== undefined && comoLike(sinComillas(crudo)).test(String(v))
  else if (op === 'ilike') r = v !== null && v !== undefined && comoLike(sinComillas(crudo), 'i').test(String(v))
  else if (op === 'cs') { const q = JSON.parse(crudo); r = v && typeof v === 'object' && Object.entries(q).every(([k, x]) => JSON.stringify(v[k]) === JSON.stringify(x)) }
  else throw new Error('operador no soportado por la base en memoria: ' + op)
  return negado ? !r : r
}

const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function filtrosDe(params) {
  const f = []
  for (const [k, v] of params) {
    if (RESERVADOS.has(k)) continue
    if (k === 'or') {
      const opciones = partir(v.replace(/^\(|\)$/g, '')).map((p) => { const i = p.indexOf('.'); return [p.slice(0, i), p.slice(i + 1)] })
      f.push((fila) => opciones.some(([c, e]) => cumple(fila, c, e)))
    } else f.push((fila) => cumple(fila, k, v))
  }
  return f
}

/** `select=a,b,alias:c,config->x`. Lo incrustado (`otra(...)`) no está: lanza para que se vea */
function proyectar(fila, select) {
  if (!select || select === '*') return structuredClone(fila)
  const fuera = {}
  for (const parte of partir(select)) {
    const p = parte.trim()
    if (p === '*') { Object.assign(fuera, structuredClone(fila)); continue }
    if (p.includes('(')) throw new Error('la base en memoria no incrusta tablas: ' + p)
    const [alias, col] = p.includes(':') && !p.includes('::') ? p.split(':') : [null, p]
    const limpio = col.split('::')[0]
    const nombre = alias ?? limpio.split(/->>?/).pop()
    const v = valorDe(fila, limpio)
    fuera[nombre] = v === undefined ? null : structuredClone(v)
  }
  return fuera
}

function ordenar(filas, order) {
  if (!order) return filas
  const claves = order.split(',').map((o) => { const [c, dir] = o.split('.'); return { c, asc: dir !== 'desc' } })
  return [...filas].sort((a, b) => {
    for (const { c, asc } of claves) {
      const x = a[c], y = b[c]
      if (x === y) continue
      if (x === null || x === undefined) return asc ? 1 : -1
      if (y === null || y === undefined) return asc ? -1 : 1
      return (x > y ? 1 : -1) * (asc ? 1 : -1)
    }
    return 0
  })
}

/**
 * @param semilla `{ tablas: { nombre: filas[] }, unicas: [{ tabla, columnas, donde?: { columna: valores[] } }] }`
 *   Las únicas reproducen los índices de la base de los que depende el código, como «una mesa abierta por cliente».
 */
export function crearBase(semilla = {}) {
  const tablas = structuredClone(semilla.tablas ?? {})
  const unicas = semilla.unicas ?? []
  const fotoInicial = structuredClone(tablas)

  const choca = (nombre, nueva, excepto) => unicas.filter((u) => u.tabla === nombre).find((u) => {
    const aplica = (f) => Object.entries(u.donde ?? {}).every(([c, vs]) => vs.includes(f[c]))
    if (!aplica(nueva)) return false
    return (tablas[nombre] ?? []).some((f) => f !== excepto && aplica(f) && u.columnas.every((c) => f[c] === nueva[c]))
  })

  const conDefectos = (f) => {
    const ahora = new Date().toISOString()
    return { id: randomUUID(), ...f, ...(f.creado_en === undefined ? { creado_en: ahora } : {}), ...(f.created_at === undefined ? { created_at: ahora } : {}) }
  }

  /** @param p `{ metodo, ruta: '/rest/v1/tabla', query: URLSearchParams, cabeceras, cuerpo }` */
  function atender(p) {
    const tabla = p.ruta.replace(/^\/rest\/v1\//, '')
    const area = p.cabeceras['accept-profile'] ?? p.cabeceras['content-profile']
    const nombre = area && area !== 'public' ? area + '.' + tabla : tabla
    if (area && area !== 'public' && !Object.keys(tablas).some((t) => t.startsWith(area + '.'))) return errorDe(406, 'PGRST106', 'The schema must be one of the following: public')
    if (!(nombre in tablas)) {
      if (p.metodo === 'GET' || p.metodo === 'HEAD') return errorDe(404, 'PGRST205', "Could not find the table '" + nombre + "' in the schema cache")
      tablas[nombre] = []
    }
    const filas = tablas[nombre]
    const prefer = p.cabeceras.prefer ?? ''
    const devolver = /return=representation/.test(prefer)
    const unObjeto = /application\/vnd\.pgrst\.object/.test(p.cabeceras.accept ?? '')
    const select = p.query.get('select')
    const entregar = (lista, status) => {
      if (unObjeto) {
        if (lista.length !== 1) return errorDe(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned')
        return respuesta(status, lista[0])
      }
      return respuesta(status, lista)
    }

    if (p.metodo === 'GET' || p.metodo === 'HEAD') {
      const filtros = filtrosDe(p.query)
      const elegidas = ordenar(filas.filter((f) => filtros.every((fn) => fn(f))), p.query.get('order'))
      const desde = Number(p.query.get('offset') ?? 0)
      const rango = /(\d+)-(\d+)/.exec(p.cabeceras.range ?? '')
      const inicio = rango ? Number(rango[1]) : desde
      const tope = rango ? Number(rango[2]) - inicio + 1 : p.query.get('limit') ? Number(p.query.get('limit')) : elegidas.length
      const pagina = elegidas.slice(inicio, inicio + tope).map((f) => proyectar(f, select))
      const cabeceras = /count=/.test(prefer) ? { 'content-range': (pagina.length ? inicio + '-' + (inicio + pagina.length - 1) : '*') + '/' + elegidas.length } : {}
      const r = entregar(pagina, 200)
      return { ...r, cabeceras, cuerpo: p.metodo === 'HEAD' ? null : r.cuerpo }
    }

    if (p.metodo === 'POST') {
      const lista = Array.isArray(p.cuerpo) ? p.cuerpo : [p.cuerpo]
      const fusionar = /resolution=merge-duplicates/.test(prefer)
      const ignorar = /resolution=ignore-duplicates/.test(prefer)
      const conflicto = (p.query.get('on_conflict') ?? 'id').split(',')
      const salieron = []
      for (const f of lista) {
        const ya = fusionar || ignorar ? filas.find((x) => conflicto.every((c) => x[c] === f[c])) : null
        if (ya) {
          if (fusionar) { Object.assign(ya, structuredClone(f)); salieron.push(ya) }
          continue
        }
        const nueva = conDefectos(structuredClone(f))
        if (choca(nombre, nueva)) return errorDe(409, '23505', 'duplicate key value violates unique constraint')
        filas.push(nueva)
        salieron.push(nueva)
      }
      return devolver ? entregar(salieron.map((f) => proyectar(f, select)), 201) : respuesta(201, null)
    }

    if (p.metodo === 'PATCH') {
      const filtros = filtrosDe(p.query)
      const elegidas = filas.filter((f) => filtros.every((fn) => fn(f)))
      for (const f of elegidas) if (choca(nombre, { ...f, ...p.cuerpo }, f)) return errorDe(409, '23505', 'duplicate key value violates unique constraint')
      for (const f of elegidas) Object.assign(f, structuredClone(p.cuerpo))
      return devolver ? entregar(elegidas.map((f) => proyectar(f, select)), 200) : respuesta(204, null)
    }

    if (p.metodo === 'DELETE') {
      const filtros = filtrosDe(p.query)
      const quedan = filas.filter((f) => !filtros.every((fn) => fn(f)))
      const borradas = filas.filter((f) => filtros.every((fn) => fn(f)))
      tablas[nombre] = quedan
      return devolver ? entregar(borradas.map((f) => proyectar(f, select)), 200) : respuesta(204, null)
    }

    return errorDe(405, 'SECO', 'método no soportado: ' + p.metodo)
  }

  return {
    atender,
    tablas: () => tablas,
    /** qué tablas cambiaron desde que arrancó: lo que la corrida escribió */
    cambios() {
      const fuera = {}
      for (const t of new Set([...Object.keys(tablas), ...Object.keys(fotoInicial)])) {
        const antes = fotoInicial[t] ?? [], ahora = tablas[t] ?? []
        if (JSON.stringify(antes) !== JSON.stringify(ahora)) fuera[t] = { antes: antes.length, ahora: ahora.length }
      }
      return fuera
    },
  }
}
