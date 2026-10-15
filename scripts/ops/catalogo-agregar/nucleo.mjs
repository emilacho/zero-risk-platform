// PLAN v3 · V12 · el alta de una fila del catálogo del plan (`plan_catalogo_*`) · CC#2 · 15-oct · núcleo PURO (sin red, sin disco). Diseño §4.1–§4.4.
// Reglas: (1) una fila nueva = `version + 1`, NUNCA se edita en sitio; (2) valida ANTES de escribir (operador existe, parámetros del tipo correcto, fuente/tipo referenciado existe);
// (3) con respaldo previo (lo hace el guion); (4) un operador NUEVO es código, no fila (§4.4): se rechaza.
// ⚠️ SUPUESTO DECLARADO: los nombres de columnas son los del diseño §4.1; V1 (CC#1) crea las tablas. Si V1 cambia un nombre, se cambia SOLO `TABLAS` aquí.

// rev. 3 §14.2: la identidad la decide el criterio del `portero` (UN solo juicio): salen los `coincide_*`; entra `delegada_en_portero`
export const OPERADORES = ['delegada_en_portero', 'rango', 'edad_max_h', 'igual_unidad', 'difiere_mas_de', 'precede', 'contiene_termino', 'n_minimo']
export const CRITICIDADES = ['critica', 'normal', 'baja']
export const CLASES_DE_REGLA = ['identidad', 'contradiccion', 'precedencia', 'cambio_material', 'moneda_pais', 'parametro']
export const VIAS = ['cerebro', 'crudo', 'relleno']
export const GRUPOS_DE_LEXICO = ['verificacion', 'ausencia', 'supuesto', 'dominio', 'periodo']

const t = {
  str: (min = 1, max = 400) => ({ k: 'str', min, max }),
  num: (min = 0, max = Number.MAX_SAFE_INTEGER) => ({ k: 'num', min, max }),
  int: (min = 0, max = 1_000_000) => ({ k: 'int', min, max }),
  bool: () => ({ k: 'bool' }),
  enu: (v) => ({ k: 'enum', v }),
  arrStr: (min = 0, max = 200) => ({ k: 'arrStr', min, max }),
  obj: () => ({ k: 'obj' }),
}

/** columnas de negocio por tabla (las de control — version, vigente, desde, pais — las pone el guion). `req` = obligatorias. */
export const TABLAS = {
  fuentes: {
    tabla: 'plan_catalogo_fuentes', clave: 'fuente_id',
    req: ['fuente_id', 'proveedor', 'funcion', 'criticidad', 'plazo_s', 'tope_usd'],
    campos: { fuente_id: t.str(1, 80), proveedor: t.str(1, 80), funcion: t.str(1, 80), via: t.enu(VIAS), provee: t.arrStr(0, 40), alcance: t.str(1, 80), aplica_si: t.obj(), criticidad: t.enu(CRITICIDADES), reintentos: t.int(0, 3), plazo_s: t.int(1, 900), tope_usd: t.num(0, 5), forma: t.arrStr(0, 80), moldes_de_ensayo: t.arrStr(0, 20), identidad_campos: t.arrStr(0, 40), da_ausencia_con: t.str(1, 200) },
  },
  tipos: {
    tabla: 'plan_catalogo_tipos', clave: 'tipo_id',
    req: ['tipo_id', 'unidad', 'frescura_limite_h', 'critico'],
    campos: { tipo_id: t.str(1, 80), atributo_cerebro: t.str(1, 80), clase_dato: t.enu(['atributo', 'acumula']), unidad: t.str(1, 40), moneda_requerida: t.bool(), rango: t.obj(), frescura_limite_h: t.num(0.1, 24 * 365), critico: t.bool(), tolerancia_redondeo: t.num(0, 1), n_minimo: t.int(0, 1000), periodo_requerido: t.bool(), comparable_con: t.arrStr(0, 40), via_preferida: t.enu(VIAS) },
  },
  reglas: {
    tabla: 'plan_catalogo_reglas', clave: 'regla_id',
    req: ['regla_id', 'clase', 'operador', 'parametros', 'aplica_a', 'severidad'],
    campos: { regla_id: t.str(1, 80), clase: t.enu(CLASES_DE_REGLA), operador: t.enu(OPERADORES), parametros: t.obj(), aplica_a: t.obj(), severidad: t.enu(['bloquea', 'avisa']) },
  },
  lexico: {
    tabla: 'plan_catalogo_lexico', clave: 'lexico_id',
    req: ['lexico_id', 'idioma', 'grupo', 'terminos'],
    campos: { lexico_id: t.str(1, 80), idioma: t.str(2, 8), grupo: t.enu(GRUPOS_DE_LEXICO), terminos: t.arrStr(1, 500) },
  },
  topes: {
    tabla: 'plan_catalogo_topes', clave: 'tope_id',
    req: ['tope_id', 'tramo', 'usd', 'contador'],
    campos: { tope_id: t.str(1, 80), tramo: t.str(1, 40), fuente_id: t.str(1, 80), usd: t.num(0, 10), contador: t.str(1, 80) },
  },
}

/** columnas que el guion pone y que NO se aceptan de quien da de alta */
export const COLUMNAS_DE_CONTROL = ['version', 'vigente', 'desde', 'pais']

const esObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function valida(def, v) {
  switch (def.k) {
    case 'str': return typeof v === 'string' && v.trim().length >= def.min && v.length <= def.max ? null : `texto de ${def.min} a ${def.max} caracteres`
    case 'num': return typeof v === 'number' && Number.isFinite(v) && v >= def.min && v <= def.max ? null : `número entre ${def.min} y ${def.max}`
    case 'int': return Number.isInteger(v) && v >= def.min && v <= def.max ? null : `entero entre ${def.min} y ${def.max}`
    case 'bool': return typeof v === 'boolean' ? null : 'verdadero o falso'
    case 'enum': return def.v.includes(v) ? null : `uno de ${def.v.join(' | ')}`
    case 'arrStr': return Array.isArray(v) && v.length >= def.min && v.length <= def.max && v.every((x) => typeof x === 'string' && x.trim() !== '') ? null : `lista de ${def.min} a ${def.max} textos no vacíos`
    case 'obj': return esObj(v) ? null : 'un objeto'
    default: return 'tipo desconocido'
  }
}

/**
 * Valida una fila nueva. `existe(tabla, clave, valor)` → boolean (puerto): comprueba que la fuente/tipo referenciado exista.
 * Devuelve `{ ok, errores[], fila }` (`fila` = solo las columnas de negocio, ya limpias).
 */
export function validarAlta(tipoDeTabla, fila, existe = () => true) {
  const T = TABLAS[tipoDeTabla]
  if (!T) return { ok: false, errores: [`tabla «${tipoDeTabla}» desconocida (una de ${Object.keys(TABLAS).join(', ')})`] }
  if (!esObj(fila)) return { ok: false, errores: ['la fila debe ser un objeto'] }
  const errores = []
  for (const c of COLUMNAS_DE_CONTROL) if (c in fila) errores.push(`«${c}» lo pone el guion (version + 1); no se acepta en la alta`)
  for (const c of T.req) if (fila[c] === undefined || fila[c] === null) errores.push(`falta «${c}»`)
  const limpia = {}
  for (const [c, v] of Object.entries(fila)) {
    if (COLUMNAS_DE_CONTROL.includes(c)) continue
    const def = T.campos[c]
    if (!def) { errores.push(`columna «${c}» no existe en ${T.tabla}`); continue }
    if (v === null || v === undefined) continue
    const e = valida(def, v)
    if (e) errores.push(`«${c}»: ${e}`)
    else limpia[c] = v
  }
  if (errores.length) return { ok: false, errores }
  // referencias: la fuente / el tipo nombrado debe existir. (Un operador nuevo es CÓDIGO, §4.4: ya lo rechaza el enum.)
  if (tipoDeTabla === 'reglas') {
    const a = limpia.aplica_a
    if (!a.fuente && !a.tipo) errores.push('«aplica_a» debe nombrar una `fuente` o un `tipo`')
    if (a.fuente && !existe('fuentes', 'fuente_id', a.fuente)) errores.push(`la fuente «${a.fuente}» no existe en el catálogo`)
    if (a.tipo && !existe('tipos', 'tipo_id', a.tipo)) errores.push(`el tipo «${a.tipo}» no existe en el catálogo`)
  }
  if (tipoDeTabla === 'fuentes' && Array.isArray(limpia.provee)) {
    for (const t of limpia.provee) if (!existe('tipos', 'tipo_id', t)) errores.push(`«provee»: el tipo «${t}» no existe`)
  }
  if (tipoDeTabla === 'topes' && limpia.fuente_id && !existe('fuentes', 'fuente_id', limpia.fuente_id)) errores.push(`la fuente «${limpia.fuente_id}» no existe en el catálogo`)
  if (tipoDeTabla === 'tipos' && Array.isArray(limpia.comparable_con)) {
    for (const c of limpia.comparable_con) if (c !== limpia.tipo_id && !existe('tipos', 'tipo_id', c)) errores.push(`«comparable_con»: el tipo «${c}» no existe`)
  }
  return errores.length ? { ok: false, errores } : { ok: true, errores: [], fila: limpia }
}

/** la fila que se inserta: `version = max(versiones de esa clave) + 1`; entra NO vigente y el guion la voltea al final (la anterior se marca no vigente) */
export function filaNueva(fila, versionesExistentes, { pais = null, ahora = new Date() } = {}) {
  const max = versionesExistentes.reduce((m, v) => Math.max(m, Number(v) || 0), 0)
  return { ...fila, version: max + 1, vigente: false, desde: ahora.toISOString(), pais }
}
