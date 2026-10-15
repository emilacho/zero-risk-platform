/**
 * PLAN v3 · V2 · EL NORMALIZADOR `dato.v1` (diseño §5.2 + §14.2). UN solo módulo: el mismo en el seco y en producción. Pasos fijos (nada llama a un modelo):
 *   forma → rango → unidad/moneda/formato → estado → periodo y fecha → identidad → frescura → duplicados → contradicción → origen y confianza.
 *
 * 🔴 IDENTIDAD (rev. 3 §14.2): este módulo NO reimplementa nada. IMPORTA `filtrarUnidad`/`esSobreElCliente` y `fichaPropiaDeMapas` del `portero` y mapea su veredicto
 *    (propio→coincide · sin_confirmar→no_comprobable · ajeno→no_coincide · ruido/repetida→no es un dato). Un cambio de CC-CEREBRO en esas firmas rompe la
 *    prueba de paridad A PROPÓSITO y avisa antes de aplicarse.
 * Los operadores viven en `OPERADORES` y se inyectan: la prueba de mutación reemplaza UNO y comprueba que ≥ 1 prueba muere.
 */
import { filtrarUnidad, esSobreElCliente, type ContextoDelCliente, type Veredicto } from '../../portero-alimenta/filtro'
import { fichaPropiaDeMapas } from '../../portero-alimenta/mapas-propia'
import type { Unidad } from '../../portero-alimenta/unidades'
import { huellaDeTexto } from '../../portero-alimenta/unidades'
import { normalizar } from '../../manual/texto'
import { difiereMasDe, leerNumero } from './cifras'
import type { CatalogoSnapshot, FilaDeFuente, FilaDeTipo } from './catalogo'
import type {
  Alcance, Confianza, ContradiccionDeDato, DatoV1, EntradaCruda, EntradaDeIdentidad, EstadoDeDato, FrescuraDeDato, IdentidadDeDato, Origen, PaqueteDeDatos, PeriodoDeDato, ValorDeDato, Via,
} from './tipos'

export interface ContextoDeNormalizacion {
  ahora: Date
  /** `true` ⇒ ensayo. Ausente o `false` ⇒ REAL (R1: la sala no manda `dry_run`; «ausente = real» es lo que hace funcionar producción) */
  dry_run?: boolean
  cliente: ContextoDelCliente
  /** huellas ya vistas (`fuente|unidad_ref|huella`): el filtro del `portero` las marca `repetida` */
  vistas?: ReadonlySet<string>
  /** país de la ficha (G3: sugiere moneda SOLO si hay una fila en el catálogo) */
  pais?: string | null
  /** moneda declarada en la ficha o el manual */
  moneda_declarada?: string | null
}

// ───────────────────────────────────────────────────────────────────────── identidad
export type ResultadoDeIdentidad = IdentidadDeDato | { ruido: true; motivo: string }
const POR_PORTERO: Record<string, 'coincide' | 'no_comprobable' | 'no_coincide'> = { propio: 'coincide', sin_confirmar: 'no_comprobable', ajeno: 'no_coincide' }
const unidadMinima = (texto: string, a: { autoria: 'propia' | 'tercero'; de_ficha_propia?: boolean }): Unidad => ({
  fuente: 'mencion', ref: '', unidad_ref: huellaDeTexto(texto), texto, clase_dato: 'acumula', atributo: null, autoria: a.autoria, huella: huellaDeTexto(texto),
  fecha_fuente: null, apify_raw_id: '', observado_en: '', de_ficha_propia: a.de_ficha_propia,
})
/** el mapeo veredicto del `portero` → identidad del plan (el plan NO inventa uno propio) */
export function identidadDeVeredicto(v: Veredicto): ResultadoDeIdentidad {
  if (v.estado === 'ruido' || v.estado === 'repetida') return { ruido: true, motivo: v.motivo }
  const estado = POR_PORTERO[v.estado]
  return { estado, senales: [], por_que: v.motivo, identidad_por: 'portero' }
}

export function resolverIdentidad(e: EntradaDeIdentidad | null | undefined, fuente: FilaDeFuente | undefined, ctx: ContextoDeNormalizacion, snap: CatalogoSnapshot, via?: Via): ResultadoDeIdentidad {
  // FALLA CERRADO (R1 de CC#3): sin entrada de identidad, el `coincide` por omisión es SOLO para una fuente que por diseño no trae campos de identidad,
  // no tiene regla de identidad en el catálogo y no es el cerebro (una ficha del cerebro debe declarar `via: 'portero'`, no se presume).
  if (!e) {
    const tieneRegla = !!fuente && snap.reglas('identidad', { fuente: fuente.fuente_id }).length > 0
    const porDiseno = !!fuente && (fuente.identidad_campos?.length ?? 0) === 0 && !tieneRegla && fuente.proveedor !== 'cerebro'
    return porDiseno
      ? { estado: 'coincide', senales: [], por_que: 'fuente sin campos ni regla de identidad por diseño: pertenece al cliente por su clave', identidad_por: 'fuente' }
      : { estado: 'no_comprobable', senales: [], por_que: 'la fuente no trajo con qué comprobar que es de este negocio', identidad_por: 'normalizador' }
  }
  switch (e.via) {
    case 'portero':
      // O1 de CC#3: `via: 'portero'` es SOLO para una ficha viva del cerebro (ya pasó su filtro); lo que viene del crudo o del relleno NO lo trae
      return via === 'cerebro'
        ? { estado: 'coincide', senales: [], por_que: 'ficha viva: ya pasó el filtro del portero', identidad_por: 'portero' }
        : { estado: 'no_comprobable', senales: [], por_que: '«ficha viva del portero» solo vale para lo que viene del cerebro; el crudo y el relleno pasan por la compuerta', identidad_por: 'normalizador' }
    case 'crudo_filtrado':
      // V14: el crudo entra SOLO tras la compuerta del portero (`filtrar`), y solo como `via: 'crudo'`; con otra vía no vale
      return via === 'crudo'
        ? { estado: 'coincide', senales: [], por_que: 'pasó la compuerta del portero (filtrar) sobre lo ya raspado', identidad_por: 'portero' }
        : { estado: 'no_comprobable', senales: [], por_que: '«crudo filtrado» solo vale para lo que viene del crudo', identidad_por: 'normalizador' }
    case 'consulta_propia': return { estado: 'coincide', senales: [], por_que: 'la consulta se hizo con una clave propia del cliente (declarada en su ficha)', identidad_por: 'fuente' }
    case 'ninguna': return { estado: 'no_comprobable', senales: [], por_que: 'la fuente no trae campos de identidad', identidad_por: 'normalizador' }
    case 'texto': {
      const r = identidadDeVeredicto(filtrarUnidad(unidadMinima(e.texto, e), ctx.cliente, ctx.vistas ?? new Set()))
      if ('ruido' in r) return r
      // capa de etiqueta del plan (§14.2.4): la sede distinta es `parcial`; NO afloja ni aprieta el veredicto del portero
      return r.estado === 'coincide' && e.sede_distinta ? { ...r, estado: 'parcial', por_que: `${r.por_que} · sede distinta de la ficha` } : r
    }
    case 'mapas': {
      const r = fichaPropiaDeMapas(e.items, ctx.cliente)
      if (r.ambigua) return { estado: 'no_comprobable', senales: [], por_que: `ficha de Mapas ambigua (${r.candidatas} candidatas): ninguna`, identidad_por: 'portero' }
      if (!r.ficha) return { estado: 'no_coincide', senales: [], por_que: `ninguna ficha es del cliente (${r.descartadas.length} descartadas)`, identidad_por: 'portero' }
      const t = String(r.ficha.title ?? '')
      return { estado: 'coincide', senales: t ? [`título «${t.slice(0, 60)}»`] : [], por_que: 'ficha de Mapas del cliente (título exacto + sede, o nombre + identidad)', identidad_por: 'portero' }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────── frescura
export function resolverFrescura(medido_en: string | null | undefined, vigente_hasta: string | null | undefined, limite_h: number, ahora: Date): FrescuraDeDato {
  if (!medido_en || Number.isNaN(Date.parse(medido_en))) return { edad_h: null, limite_h, estado: 'sin_fecha' }
  const t = Date.parse(medido_en)
  const edad_h = Math.max(0, (ahora.getTime() - t) / 3_600_000)
  // dos relojes: el límite del tipo y el `vigente_hasta` de la ficha; manda el que venza antes (§14.1)
  const venceTipo = t + limite_h * 3_600_000
  const venceFicha = vigente_hasta && !Number.isNaN(Date.parse(vigente_hasta)) ? Date.parse(vigente_hasta) : Infinity
  const vence = Math.min(venceTipo, venceFicha)
  return { edad_h: Math.round(edad_h * 10) / 10, limite_h, estado: ahora.getTime() > vence ? 'viejo' : 'fresco', vence_en: new Date(vence).toISOString() }
}

// ───────────────────────────────────────────────────────────────────────── contenido con imperativos (regla 3)
const RE_IMPERATIVO = /\b(ignora|ignore|ignorar|olvida|olvidate|forget|disregard|desestima)\b.{0,40}\b(instrucciones|instructions|prompt|reglas|todo lo anterior|anterior|previous)\b|\b(a partir de ahora|from now on|eres ahora|you are now|system prompt|nuevas instrucciones|new instructions)\b|\b(responde|contesta|escribe|di)\s+(solo|siempre|unicamente|que)\b/
export const tieneImperativos = (texto: string): boolean => RE_IMPERATIVO.test(normalizar(texto))

// ───────────────────────────────────────────────────────────────────────── valor
const vacio = (x: unknown): boolean => {
  if (x === null || x === undefined) return true
  if (typeof x === 'string') return x.trim() === ''
  if (Array.isArray(x)) return x.length === 0
  if (typeof x === 'object') return Object.values(x as Record<string, unknown>).every(vacio)
  return false
}
const textoDe = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 200) : typeof x === 'number' ? String(x) : null)

interface Resuelto { estado: EstadoDeDato; valor: ValorDeDato; motivo: string | null; marcas: string[] }
export function resolverEstadoYValor(e: EntradaCruda, fuente: FilaDeFuente, tipo: FilaDeTipo, ctx: ContextoDeNormalizacion, snap: CatalogoSnapshot): Resuelto {
  const pasan: EstadoDeDato[] = ['error', 'agotado', 'rechazado', 'no_aplica', 'no_declarado', 'omitido', 'sin_respuesta', 'viejo_reciclado']
  const base = (estado: EstadoDeDato, motivo: string | null, marcas: string[] = [], valor: ValorDeDato = {}): Resuelto => ({ estado, valor, motivo, marcas })
  if (e.estado === 'sin_dato') {
    // «fui, miré, y no hay»: solo vale como vacío declarado si la fila de la fuente dice cómo declara el 0 (§3.2 V1)
    return fuente.da_ausencia_con ? base('vacio_declarado', null, [], { numero: 0, unidad: tipo.unidad }) : base('registro_sin_campos', 'la fuente no declara cómo dice «0 elementos»')
  }
  if (e.estado !== 'trajo') return pasan.includes(e.estado) ? base(e.estado, e.estado === 'viejo_reciclado' ? 'respuesta de una corrida anterior' : null) : base('registro_sin_campos', 'estado desconocido')
  // F5 · respuesta vieja repetida
  if (e.solicitado_en && e.medido_en && Date.parse(e.medido_en) < Date.parse(e.solicitado_en)) return base('viejo_reciclado', 'respuesta de una corrida anterior')
  // F4 · la forma declarada de la fuente
  const forma = fuente.forma ?? []
  if (e.campos && forma.length) {
    const faltan = forma.filter((k) => e.campos![k] === undefined)
    if (faltan.length) return base('registro_sin_campos', `formato inesperado: faltan ${faltan.slice(0, 3).join(', ')}`, ['contrato_roto'])
  }
  // V1 · vacío declarado / V2 · registro sin campos
  if (e.items_count === 0) return fuente.da_ausencia_con ? base('vacio_declarado', null, [], { numero: 0, unidad: tipo.unidad }) : base('registro_sin_campos', 'cero elementos sin declaración de la fuente')
  if (vacio(e.contenido) && vacio(e.campos)) return base('registro_sin_campos', 'el registro no trae campos con valor')
  const marcas: string[] = []
  if (e.reintentado) marcas.push('reintentado')
  if (e.truncado?.si) marcas.push('truncado')
  const crudo = e.contenido ?? e.campos
  if (tipo.unidad === 'texto') {
    const t = textoDe(crudo)
    if (!t) return base('registro_sin_campos', 'sin texto legible', marcas)
    if (tieneImperativos(t) || (e.texto_libre && tieneImperativos(e.texto_libre))) return base('trajo', null, [...marcas, 'contenido_con_imperativos'], { unidad: 'texto' })
    return base('trajo', null, marcas, { texto_corto: t, unidad: 'texto' })
  }
  const lectura = leerNumero(typeof crudo === 'object' && crudo !== null ? (crudo as Record<string, unknown>).valor ?? (crudo as Record<string, unknown>).numero : crudo)
  if (!lectura.ok) return base('registro_sin_campos', `cifra no legible: ${lectura.motivo}`, marcas)
  const { numero } = lectura.cifra
  const r = tipo.rango
  if (r && ((r.min !== undefined && numero < r.min) || (r.max !== undefined && numero > r.max))) return base('registro_sin_campos', `valor fuera de rango (${numero})`, [...marcas, 'fuera_de_rango'])
  const valor: ValorDeDato = { numero, unidad: lectura.cifra.unidad ?? tipo.unidad }
  if (tipo.moneda_requerida) {
    const moneda = lectura.cifra.moneda ?? e.moneda ?? ctx.moneda_declarada ?? undefined
    if (moneda) valor.moneda = moneda.toUpperCase()
    else {
      const sug = snap.monedaDePais(ctx.pais)
      // G3: una moneda que viene de la fila del país entra como `supuesto` rotulado; sin fila ⇒ no se puede decir (U1/U5)
      if (sug) { valor.moneda = sug.moneda; marcas.push('moneda_supuesta') } else return base('registro_sin_campos', 'sin moneda declarada', [...marcas, 'moneda_no_comprobable'])
    }
  }
  return base('trajo', null, marcas, valor)
}

// ───────────────────────────────────────────────────────────────────────── origen y confianza (regla 1 del §2)
export interface InsumosDeOrigen {
  estado: EstadoDeDato; ensayo: boolean; identidad: IdentidadDeDato; frescura: FrescuraDeDato; tipo: FilaDeTipo; marcas: string[]
  origen_ficha?: EntradaCruda['origen_ficha']; fuente_id: string
}
export function resolverOrigen(i: InsumosDeOrigen): { origen: Origen; motivo: string | null } {
  if (i.ensayo) return { origen: 'de_ensayo', motivo: null }
  if (i.estado !== 'trajo' && i.estado !== 'vacio_declarado') return { origen: 'hueco', motivo: i.estado }
  if (i.identidad.estado === 'no_coincide') return { origen: 'hueco', motivo: 'otro_negocio' }
  if (i.identidad.estado === 'no_comprobable') return { origen: 'hueco', motivo: 'sin_comprobar_identidad' }
  if (i.frescura.estado === 'viejo' && i.tipo.critico) return { origen: 'hueco', motivo: 'vencido' }
  if (i.marcas.includes('contenido_con_imperativos')) return { origen: 'hueco', motivo: 'contenido_con_imperativos' }
  // G4: en esta tanda `dueno` NO existe como origen nuevo: lo del dueño entra como `supuesto` rotulado; el manual también es una declaración, no una medida
  if (i.origen_ficha === 'dueno' || i.fuente_id === 'manual_vigente' || i.marcas.includes('moneda_supuesta')) return { origen: 'supuesto', motivo: null }
  return { origen: 'medido', motivo: null }
}

export function resolverConfianza(i: { origen: Origen; identidad: IdentidadDeDato; frescura: FrescuraDeDato; tipo: FilaDeTipo; n?: number | null; juzgado_por?: EntradaCruda['juzgado_por']; propiedad?: EntradaCruda['propiedad']; marcas: string[] }): Confianza {
  if (i.origen === 'hueco' || i.origen === 'de_ensayo') return 'baja'
  if (i.identidad.estado === 'no_comprobable') return 'baja'
  if (i.propiedad === 'incierta') return 'baja'
  const minimo = i.tipo.n_minimo ?? 0
  if (minimo > 0 && (i.n ?? minimo) < minimo) return 'baja'
  let c: Confianza = 'alta'
  if (i.identidad.estado === 'parcial' || i.frescura.estado === 'viejo' || i.frescura.estado === 'sin_fecha' || i.juzgado_por === 'modelo' || i.origen === 'supuesto' || i.marcas.includes('reintentado') || i.marcas.includes('truncado')) c = 'media'
  return c
}

// ───────────────────────────────────────────────────────────────────────── contradicción y precedencia (§5.5 / §14.1)
export function resolverContradicciones(datos: DatoV1[], snap: CatalogoSnapshot): void {
  // solo se contradicen los datos de un ATRIBUTO (un valor vigente: horario, puntaje, precio de ESE producto); lo que se acumula (reseñas, menciones) se suma, no se contradice
  const grupos = new Map<string, DatoV1[]>()
  for (const d of datos) {
    if (!d.citable || d.estado !== 'trajo' || d.derivado.si) continue
    const tipo = snap.tipo(d.tipo_id)
    if (tipo?.clase_dato === 'acumula') continue
    const familia = [d.tipo_id, ...(tipo?.comparable_con ?? [])].sort().join('+')
    const k = `${familia}|${d.atributo ?? ''}`
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  for (const todos of grupos.values()) {
    if (todos.length < 2 || !todos.slice(1).some((x) => difiere(todos[0], x, snap))) continue
    const tipos = [...new Set(todos.map((x) => x.tipo_id))]
    const regla = tipos.map((t) => snap.reglas('precedencia', { tipo: t })[0]).find(Boolean)
    const contradiccion: ContradiccionDeDato = regla
      ? { con: [], regla: regla.regla_id, gana: ganador(todos, (regla.parametros.orden as string[]) ?? ['dueno', 'medido_mas_reciente', 'manual', 'supuesto'], String(regla.parametros.empate ?? 'cerebro')) }
      : { con: [], regla: null, gana: null, motivo: 'sin_regla_de_precedencia' }
    for (const x of todos) {
      x.contradice = { ...contradiccion, con: todos.filter((y) => y.id !== x.id).map((y) => y.id) }
      x.marcas = [...new Set([...x.marcas, 'contradice'])]
      if (!regla) x.confianza = 'baja'
    }
  }
}
function difiere(a: DatoV1, b: DatoV1, snap: CatalogoSnapshot): boolean {
  if (a.id === b.id) return false
  if (a.valor.numero !== undefined && b.valor.numero !== undefined) {
    const r = snap.reglas('contradiccion', { tipo: a.tipo_id })[0] ?? snap.reglas('contradiccion', { tipo: b.tipo_id })[0]
    const p = (r?.parametros ?? {}) as { abs?: number; rel?: number }
    return difiereMasDe(a.valor.numero, b.valor.numero, p)
  }
  if (a.valor.texto_corto !== undefined && b.valor.texto_corto !== undefined) return normalizar(a.valor.texto_corto) !== normalizar(b.valor.texto_corto)
  return false
}
function rangoDe(d: DatoV1): string {
  if (d.marcas.includes('del_dueno')) return 'dueno'
  if (d.fuente_id === 'manual_vigente') return 'manual'
  if (d.origen === 'supuesto') return 'supuesto'
  return 'medido_mas_reciente'
}
function ganador(ds: DatoV1[], orden: string[], empate: string): string {
  const pos = (d: DatoV1) => { const i = orden.indexOf(rangoDe(d)); return i < 0 ? orden.length : i }
  const mejor = Math.min(...ds.map(pos))
  const top = ds.filter((d) => pos(d) === mejor)
  const reciente = [...top].sort((a, b) => Date.parse(b.medido_en ?? '1970-01-01') - Date.parse(a.medido_en ?? '1970-01-01'))
  const fecha = reciente[0].medido_en
  const empatados = reciente.filter((d) => d.medido_en === fecha)
  return (empatados.find((d) => d.via === empate) ?? empatados[0]).id
}

// ───────────────────────────────────────────────────────────────────────── operadores (inyectables)
export const OPERADORES = { resolverIdentidad, resolverFrescura, resolverEstadoYValor, resolverOrigen, resolverConfianza, resolverContradicciones }
export type Operadores = typeof OPERADORES

// ───────────────────────────────────────────────────────────────────────── el normalizador
export function normalizarDatos(entradas: EntradaCruda[], ctx: ContextoDeNormalizacion, snap: CatalogoSnapshot, op: Operadores = OPERADORES): PaqueteDeDatos {
  const descartados: PaqueteDeDatos['descartados'] = []
  let ruido = 0
  // D1 · duplicados dentro de la MISMA fuente: una por `(fuente, huella)`; se deja la más antigua (empate: la primera)
  const vistos = new Map<string, number>()
  const conservar: EntradaCruda[] = []
  let repetidas = 0
  const ordenadas = entradas.map((e, i) => ({ e, i }))
  for (const { e, i } of ordenadas) {
    if (!e.huella) { conservar[i] = e; continue }
    const k = `${e.fuente_id}|${e.huella}`
    const previo = vistos.get(k)
    if (previo === undefined) { vistos.set(k, i); conservar[i] = e; continue }
    repetidas++
    const a = conservar[previo]
    if (Date.parse(e.medido_en ?? '9999') < Date.parse(a.medido_en ?? '9999')) { delete conservar[previo]; conservar[i] = e; vistos.set(k, i) }
  }
  const datos: DatoV1[] = []
  let n = 0
  for (const e of conservar) {
    if (!e) continue
    const fuente = snap.fuente(e.fuente_id)
    const tipo = snap.tipo(e.tipo_id)
    const id = `D${++n}`
    const ensayo = ctx.dry_run === true || e.molde === true
    const alcance: Alcance = e.origen_ficha === 'tercero' || e.propiedad === 'tercero' ? 'tercero' : e.alcance ?? (fuente?.alcance as Alcance | undefined) ?? 'cliente'
    const periodo: PeriodoDeDato = e.periodo ?? { tipo: tipo?.periodo_requerido ? 'desconocido' : 'instante' }
    // N10 · fila de catálogo ausente: nunca «medido seguro»
    if (!fuente || !tipo) {
      datos.push({ id, fuente_id: e.fuente_id, tipo_id: e.tipo_id, atributo: e.atributo ?? null, valor: {}, origen: ensayo ? 'de_ensayo' : 'hueco', estado: 'registro_sin_campos', medido_en: e.medido_en ?? null, ejecucion: e.ejecucion ?? null, periodo, alcance,
        identidad: { estado: 'no_comprobable', senales: [], por_que: 'sin fila de catálogo' }, frescura: { edad_h: null, limite_h: 0, estado: 'sin_fecha' }, contradice: null, truncado: e.truncado ?? { si: false },
        derivado: { si: false, de: [] }, confianza: 'baja', motivo: 'fila_de_catalogo_ausente', marcas: ['sin_regla', 'completar_el_catalogo'], via: e.via ?? null, citable: false, fuente_url: e.fuente_url ?? null, rotulo: null })
      continue
    }
    const r = op.resolverEstadoYValor(e, fuente, tipo, ctx, snap)
    const ident = op.resolverIdentidad(e.identidad, fuente, ctx, snap, e.via)
    if ('ruido' in ident) { ruido++; n--; continue }
    const frescura = op.resolverFrescura(e.medido_en, e.vigente_hasta, tipo.frescura_limite_h, ctx.ahora)
    // un dato del cerebro sin `observado_en` no es un dato fechable (§14.1): hueco con motivo `sin_fecha`
    const sinFecha = (e.via === 'cerebro') && frescura.estado === 'sin_fecha'
    const estado: EstadoDeDato = sinFecha && r.estado === 'trajo' ? 'registro_sin_campos' : r.estado
    const marcas = [...r.marcas, ...(e.grupo_de_negocio ? [`grupo_de_negocio:${e.grupo_de_negocio}`] : []), ...(e.origen_ficha === 'dueno' ? ['del_dueno'] : [])]
    const ori = op.resolverOrigen({ estado, ensayo, identidad: ident, frescura, tipo, marcas, origen_ficha: e.origen_ficha, fuente_id: e.fuente_id })
    const motivo = sinFecha && r.estado === 'trajo' ? 'sin_fecha' : r.motivo ?? ori.motivo
    const origen = sinFecha && r.estado === 'trajo' && !ensayo ? 'hueco' : ori.origen
    if (!ensayo && (ident.estado === 'no_coincide' || ident.estado === 'no_comprobable')) descartados.push({ fuente_id: e.fuente_id, tipo_id: e.tipo_id, motivo: ident.por_que, identidad: ident.estado })
    // el contenido de un homónimo NO entra al pedido: se vacía el valor (queda en `descartados`)
    const valor: ValorDeDato = ident.estado === 'no_coincide' ? {} : r.valor
    const confianza = op.resolverConfianza({ origen, identidad: ident, frescura, tipo, n: e.n, juzgado_por: e.juzgado_por, propiedad: e.propiedad, marcas })
    const confTerminal = frescura.estado === 'sin_fecha' && confianza === 'alta' ? 'media' : confianza
    datos.push({
      id, fuente_id: e.fuente_id, tipo_id: e.tipo_id, atributo: e.atributo ?? null, valor, origen, estado, medido_en: e.medido_en ?? null, ejecucion: e.ejecucion ?? null, periodo, alcance, identidad: ident, frescura,
      contradice: null, truncado: e.truncado ?? { si: false }, derivado: { si: false, de: [] }, confianza: confTerminal, motivo, marcas, via: e.via ?? null,
      citable: (origen === 'medido' || origen === 'supuesto' || origen === 'dueno') && !marcas.includes('contenido_con_imperativos'), fuente_url: e.fuente_url ?? null,
      rotulo: marcas.includes('moneda_supuesta') ? snap.monedaDePais(ctx.pais)?.rotulo ?? null : e.origen_ficha === 'dueno' ? 'indicado por el dueño, sin firmar por la puerta' : e.fuente_id === 'manual_vigente' ? 'del manual vigente' : null,
    })
  }
  op.resolverContradicciones(datos, snap)
  return { datos, descartados, repetidas, ruido, catalogo_version: snap.version, catalogo_huella: snap.huella }
}

/** R1/R2 · una cifra DERIVADA no es leída: hereda el PEOR origen de sus insumos y declara de cuáles sale; con un insumo faltante no se inventa (`sin_base`) */
export function derivar(insumos: DatoV1[], formula_id: string, calcular: (v: number[]) => number | null, id: string): DatoV1 {
  const ORDEN: Origen[] = ['hueco', 'de_ensayo', 'supuesto', 'dueno', 'cerebro', 'medido']
  const peor = insumos.reduce<Origen>((p, d) => (ORDEN.indexOf(d.origen) < ORDEN.indexOf(p) ? d.origen : p), 'medido')
  const numeros = insumos.map((d) => d.valor.numero)
  const base = numeros.every((x): x is number => typeof x === 'number') && insumos.every((d) => d.estado === 'trajo' || d.estado === 'vacio_declarado')
  const res = base ? calcular(numeros as number[]) : null
  const ok = res !== null && Number.isFinite(res)
  return {
    id, fuente_id: 'derivado', tipo_id: formula_id, atributo: null, valor: ok ? { numero: res as number } : {}, origen: ok ? peor : 'hueco', estado: ok ? 'trajo' : 'registro_sin_campos',
    medido_en: insumos.map((d) => d.medido_en).filter(Boolean).sort()[0] ?? null, ejecucion: null, periodo: { tipo: 'desconocido' }, alcance: 'cliente',
    identidad: { estado: 'coincide', senales: [], por_que: 'derivado de datos del cliente' }, frescura: { edad_h: null, limite_h: 0, estado: 'sin_fecha' }, contradice: null, truncado: { si: false },
    derivado: { si: true, de: insumos.map((d) => d.id), formula_id }, confianza: ok && peor === 'medido' ? 'media' : 'baja', motivo: ok ? null : 'sin_base', marcas: ok ? [] : ['sin_base'], via: null,
    citable: ok && (peor === 'medido' || peor === 'supuesto'), fuente_url: null, rotulo: ok && peor === 'supuesto' ? 'supuesto' : null,
  }
}

export { esSobreElCliente }
