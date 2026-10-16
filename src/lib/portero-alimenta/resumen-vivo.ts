/**
 * EL RESUMEN VIVO DEL CLIENTE (15-oct · mejora 3) · lo primero que leen las oficinas. UNA ficha por cliente (y una por sede con competencia propia) que el portero
 * reescribe cada día tras su corrida: quién es, qué vende y a qué precio vigente, cifras con tendencia, qué dicen los clientes (temas con conteo), competencia vigilada,
 * contexto que le aplica y HUECOS. Todo se arma POR CÓDIGO desde las fichas vivas (US$ 0, sin modelo): cada afirmación lleva su `[ficha:xxxxxxxx · fecha]` y nada va sin fuente.
 * Versión nueva = `reemplaza`; la vieja queda retirada con su fecha (nada se borra). Se lee en UNA llamada por la misma vía de consulta del cerebro (clase `resumen_vivo`).
 * Apagado por `PORTERO_RESUMEN_VIVO` (sin él no se escribe nada).
 */
import { normalizar } from '../manual/texto'
import { PREFIJO_DE_VENTAS } from './brazos/propios'
import type { FichaDeBrazo } from './brazos/tipos'
import { claveDeAlcance, sedesDeFicha } from './sedes-fuentes'

type Fila = Record<string, unknown>
export interface FichaParaResumen { id: string; clase: string; titulo: string; contenido: string; atributo: string | null; observado_en: string | null; fecha_fuente: string | null; vigente_hasta: string | null; retirada_en: string | null; provenance_tag: unknown; creado_en?: string | null }

export const CLASE_DEL_RESUMEN = 'resumen_vivo'
export const ATRIBUTO_DEL_RESUMEN = 'resumen:cliente'
export const atributoDeSede = (clave: string) => `resumen:sede:${clave}`
const MAX_POR_SECCION = 8
/** candidatos de «Quién es» que ve el agente del pulido (él elige cuáles describen al negocio) */
export const CANDIDATOS_DE_QUIEN_ES = 10
const DIAS_PARA_TENDENCIA = 60
const DIA = 86_400_000

const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const corto = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const cita = (f: FichaParaResumen) => `[ficha:${f.id.slice(0, 8)} · ${(f.fecha_fuente ?? f.observado_en ?? '').slice(0, 10) || 'sin fecha'}]`
const vigente = (f: FichaParaResumen, ahora: Date) => !f.retirada_en && (!f.vigente_hasta || Date.parse(f.vigente_hasta) >= ahora.getTime())
/** texto legal que casi todo sitio trae y que NO dice quién es el negocio (política de privacidad, términos, cookies…): datos del idioma, se amplían sin tocar la lógica */
export const TEXTO_LEGAL: RegExp[] = [/\b(privacidad|privacy|cookies?|terminos y condiciones|terms of|aviso legal|proteccion de datos|data protection|gdpr|lopdp|habeas data)\b/]
const esTextoLegal = (t: string) => TEXTO_LEGAL.some((r) => r.test(normalizar(t)))
/** una cifra es una MEDIDA que cambia (puntaje, reseñas, seguidores…); el nombre, la dirección o el teléfono de una ficha de Mapas son perfil, no cifras */
export const ATRIBUTOS_DE_CIFRA = /(puntaje|resenas|seguidores|publicaciones|rating|followers|score|likes|visitas|suscriptores)/
/** las ventas del punto de venta tienen SU sección (una ficha por mes: en «Cifras» serían 60 líneas) */
const esDeVentas = (f: FichaParaResumen) => (f.atributo ?? '').startsWith(PREFIJO_DE_VENTAS)
const esCifra = (f: FichaParaResumen) => !esDeVentas(f) && (f.clase === 'metrica' || ATRIBUTOS_DE_CIFRA.test(normalizar(f.atributo ?? '')))
const coma = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',')
const datosDe = (f: FichaParaResumen): Fila => (esObjeto(f.provenance_tag) && esObjeto((f.provenance_tag as Fila).datos) ? ((f.provenance_tag as Fila).datos as Fila) : {})
const numero = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const pct = (a: number, b: number) => `${a >= b ? 'sube' : 'baja'} ${Math.abs(Math.round(((a - b) / b) * 100))} %`
/** un fragmento de página (menos de 5 palabras o empieza por número: «1 qué datos capturamos») no presenta a nadie */
const esFragmento = (t: string) => { const w = normalizar(t).split(' ').filter(Boolean); return w.length < 5 || /^\d/.test(w[0]) }
const primeraCifra = (s: string): number | null => { const m = s.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2').match(/\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null }

const PALABRAS_VACIAS = new Set(['para', 'pero', 'como', 'esta', 'este', 'esto', 'estos', 'estas', 'muy', 'mas', 'mucho', 'todo', 'todos', 'solo', 'sobre', 'entre', 'desde', 'hasta', 'porque', 'cuando', 'donde', 'tiene', 'tienen', 'tengo', 'fue', 'son', 'ser', 'hay', 'una', 'unos', 'unas', 'con', 'sin', 'por', 'del', 'los', 'las', 'que', 'nos', 'les', 'sus', 'mis', 'the', 'and', 'for', 'with', 'very', 'that', 'this', 'was', 'had', 'but', 'you', 'our', 'are'])
/** temas con conteo: las palabras que más se repiten en las reseñas y comentarios (por código, sin modelo) */
export function temasConConteo(textos: string[], max = 6): Array<{ tema: string; veces: number }> {
  const c = new Map<string, number>()
  for (const t of textos) for (const w of new Set(normalizar(t).split(' '))) if (w.length >= 5 && !PALABRAS_VACIAS.has(w) && !/^\d+$/.test(w)) c.set(w, (c.get(w) ?? 0) + 1)
  return [...c.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([tema, veces]) => ({ tema, veces }))
}

/** las líneas de la sección de ventas (puro) */
export function lineasDeVentas(vivas: FichaParaResumen[], ahora: Date): string[] {
  const deVentas = vivas.filter((f) => f.clase === 'metrica' && esDeVentas(f))
  const porMetrica = (metrica: string, sufijoDeTienda = false) => deVentas.filter((f) => new RegExp(`^${PREFIJO_DE_VENTAS}${metrica}:\\d{4}-\\d{2}${sufijoDeTienda ? ':tienda-[a-z0-9-]+' : ''}$`).test(f.atributo ?? ''))
  const periodoDe = (f: FichaParaResumen) => (/(\d{4}-\d{2})/.exec(f.atributo ?? '') ?? [])[1] ?? ''
  const ingresos = new Map<string, FichaParaResumen>()
  for (const f of porMetrica('ingreso')) { const k = periodoDe(f); const x = ingresos.get(k); if (!x || (f.observado_en ?? '') > (x.observado_en ?? '')) ingresos.set(k, f) }
  const mesActual = new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 7)
  const cerrados = [...ingresos.entries()].filter(([k, f]) => k < mesActual && datosDe(f).en_curso === false && numero(datosDe(f).ingreso) !== null).sort((a, b) => (a[0] < b[0] ? -1 : 1))
  // la serie arranca en el primer mes con ventas (los meses de antes de abrir no son «ventas cero»)
  const i0 = cerrados.findIndex(([, f]) => (numero(datosDe(f).tickets) ?? 0) > 0)
  const serie = i0 < 0 ? [] : cerrados.slice(i0)
  const out: string[] = []
  const actual = ingresos.get(mesActual)
  // la ventana móvil de 30 días: lo que cubre «el mes pasado» mientras el plan del punto de venta no deja leer más atrás
  const ventana = deVentas.filter((f) => f.atributo === `${PREFIJO_DE_VENTAS}ingreso:ultimos_30_dias`).sort((a, b) => ((b.observado_en ?? '') < (a.observado_en ?? '') ? -1 : 1))[0]
  if (!serie.length && !(actual && datosDe(actual).en_curso === true) && !ventana) return out
  if (serie.length) {
    const [p, f] = serie[serie.length - 1]
    const d = datosDe(f)
    const prev = serie.length > 1 ? serie[serie.length - 2] : null
    const pv = prev ? numero(datosDe(prev[1]).ingreso) : null
    const vs = prev && pv && pv > 0 ? `; frente a ${prev[0]} ${pct(numero(d.ingreso) as number, pv)}` : ''
    const aprox = typeof d.aproximado_hasta === 'string' ? `; las listas de días, horas e ítems llegan hasta el ${d.aproximado_hasta}` : ''
    out.push(`- Último mes cerrado, ${p}: ${coma(numero(d.ingreso) as number)} en ${numero(d.tickets) ?? 0} tickets (ticket promedio ${coma(numero(d.ticket_promedio) ?? 0)})${vs}${aprox} ${cita(f)}`)
  }
  if (actual && datosDe(actual).en_curso === true) {
    const d = datosDe(actual)
    out.push(`- Mes en curso, ${mesActual} (parcial, no comparable con un mes cerrado): ${coma(numero(d.ingreso) ?? 0)} en ${numero(d.tickets) ?? 0} tickets ${cita(actual)}`)
  }
  if (ventana && datosDe(ventana).ventana_hasta) {
    const d = datosDe(ventana)
    out.push(`- Últimos 30 días (hasta el ${String(d.ventana_hasta)}): ${coma(numero(d.ingreso) ?? 0)} en ${numero(d.tickets) ?? 0} tickets (ticket promedio ${coma(numero(d.ticket_promedio) ?? 0)}) ${cita(ventana)}`)
  }
  if (serie.length >= 2) {
    const dir = serie.length >= 6
      ? (() => { const v = serie.map(([, g]) => numero(datosDe(g).ingreso) ?? 0); const u = v.slice(-3).reduce((a, b) => a + b, 0), a = v.slice(-6, -3).reduce((x, y) => x + y, 0); return a > 0 ? ` · los últimos 3 meses ${pct(u, a)} frente a los 3 anteriores` : '' })()
      : ''
    out.push(`- Tendencia de ${serie.length} meses cerrados (ingreso por mes)${dir}: ${serie.map(([k, g]) => `${k} ${coma(numero(datosDe(g).ingreso) as number)} ${cita(g)}`).join(' · ')}`)
  }
  const ultimo = serie.length ? serie[serie.length - 1][0] : mesActual
  const deMes = (metrica: string, sufijo = false) => porMetrica(metrica, sufijo).filter((f) => periodoDe(f) === ultimo).sort((a, b) => ((b.observado_en ?? '') < (a.observado_en ?? '') ? -1 : 1))
  const dh = deMes('dias_y_horas')[0]
  if (dh) out.push(linea(dh, 220))
  const it = deMes('items')[0]
  if (it) out.push(linea(it, 260))
  const tiendas = deMes('ingreso', true)
  if (tiendas.length) out.push(`- Por tienda en ${ultimo}: ${tiendas.map((f) => `${corto(String(datosDe(f).tienda ?? f.titulo), 40)} ${coma(numero(datosDe(f).ingreso) ?? 0)} ${cita(f)}`).join(' · ')}`)
  return out
}

export interface EntradaDelResumen {
  client_id: string
  nombre: string | null
  rubro: string | null
  ahora: Date
  /** todas las fichas VIVAS del cliente (incluye las retiradas recientes: sirven para la tendencia) */
  fichas: FichaParaResumen[]
  /** fichas de zona (feriados, temporada) que le tocan por país */
  zona: FichaParaResumen[]
  sedes: Array<{ clave: string; ciudad: string | null }>
}
export interface SalidaDelResumen { cliente: FichaDeBrazo; sedes: FichaDeBrazo[]; huecos: string[]; secciones: Record<string, number>; /** el mismo resumen con los CANDIDATOS de «Quién es» (lo que recibe el agente del pulido) */ texto_para_el_agente: string }

function linea(f: FichaParaResumen, largo = 160): string { return `- ${corto(f.contenido, largo)} ${cita(f)}` }

/** arma el texto del resumen (puro) */
export function armarResumen(e: EntradaDelResumen, opciones: { candidatos?: boolean } = {}): { texto: string; huecos: string[]; secciones: Record<string, number> } {
  const vivas = e.fichas.filter((f) => vigente(f, e.ahora))
  const por = (...clases: string[]) => vivas.filter((f) => clases.includes(f.clase)).sort((a, b) => ((b.observado_en ?? '') < (a.observado_en ?? '') ? -1 : 1))
  const huecos: string[] = []
  const secciones: Record<string, number> = {}
  const partes: string[] = []
  const sec = (clave: string, titulo: string, lineas: string[], hueco: string, max = MAX_POR_SECCION) => {
    secciones[clave] = lineas.length
    if (!lineas.length) { huecos.push(hueco); partes.push(`## ${titulo}\n- (sin datos: ${hueco})`); return }
    partes.push(`## ${titulo}\n${lineas.slice(0, max).join('\n')}`)
  }

  // quién es · lo que el cliente dice de sí mismo (su sitio)
  const sitio = e.fichas.filter((f) => f.clase === 'sitio' && !f.retirada_en && !esTextoLegal(f.contenido) && !esFragmento(f.contenido)).sort((a, b) => ((a.creado_en ?? a.observado_en ?? '') < (b.creado_en ?? b.observado_en ?? '') ? -1 : 1))
  // con `candidatos` (el texto que ve el agente): hasta 10 fichas del sitio con largo de descripción (ni cortísimas ni páginas enteras); sin él (el armado por código): las 3 primeras de siempre
  const sitioElegido = opciones.candidatos ? sitio.filter((f) => { const n = normalizar(f.contenido).split(' ').filter(Boolean).length; return n >= 6 && n <= 45 }).slice(0, CANDIDATOS_DE_QUIEN_ES) : sitio.slice(0, 3)
  // y lo que dicen su ficha de Mapas y su bio (nombre, categoría, dirección, horario, teléfono): perfil, no cifras
  const perfil = por('mapas', 'instagram').filter((f) => !esCifra(f) && !esTextoLegal(f.contenido)).slice(0, 5)
  sec('quien_es', `Quién es${e.nombre ? ` · ${e.nombre}` : ''}${e.rubro ? ` (${e.rubro})` : ''}`, [...sitioElegido.map((f) => linea(f, 200)), ...perfil.map((f) => linea(f, 140))], 'no hay fichas de su sitio ni de su ficha de Mapas', opciones.candidatos ? CANDIDATOS_DE_QUIEN_ES + 5 : MAX_POR_SECCION)

  // qué vende y a qué precio vigente
  // si el cliente tiene más de una sede y la fuente de cada precio está asignada a una sede, los precios van POR SEDE (cada línea dice la suya): precios distintos entre sedes no son una contradicción
  const precios = por('precio', 'horario')
  const grupos = new Map<string, FichaParaResumen[]>()
  for (const f of precios) { const k = claveDeAlcance(sedesDeFicha(f.provenance_tag)); grupos.set(k, [...(grupos.get(k) ?? []), f]) }
  const hayPorSede = [...grupos.keys()].some((k) => k !== '')
  if (!hayPorSede) sec('precios', 'Qué vende y a qué precio (vigente)', precios.map((f) => linea(f, 140)), 'no hay precios ni horarios vigentes')
  else {
    const ciudadDe = new Map(e.sedes.map((s) => [s.clave, s.ciudad]))
    const orden = [...grupos.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a < b ? -1 : 1))
    const porGrupo = Math.max(3, Math.ceil(MAX_POR_SECCION / orden.length))
    const lineas = orden.flatMap((k) => {
      const rotulo = k === '' ? 'todas las sedes' : k.split(',').map((c) => `sede ${c}${ciudadDe.get(c) ? ` (${ciudadDe.get(c)})` : ''}`).join(' y ')
      return (grupos.get(k) ?? []).slice(0, porGrupo).map((f) => `- [${rotulo}] ${corto(f.contenido, 140)} ${cita(f)}`)
    })
    sec('precios', 'Qué vende y a qué precio (vigente, por sede: pueden diferir entre sedes)', lineas, 'no hay precios ni horarios vigentes', lineas.length)
  }

  // cifras con tendencia: la última de cada atributo y, si hay una versión retirada de los últimos 60 días, la dirección
  const cifras: string[] = []
  const claves = new Set(por('mapas', 'metrica', 'instagram').filter(esCifra).map((f) => f.atributo ?? f.id))
  for (const k of claves) {
    const dela = e.fichas.filter((f) => (f.atributo ?? f.id) === k && ['mapas', 'metrica', 'instagram'].includes(f.clase)).sort((a, b) => ((b.observado_en ?? '') < (a.observado_en ?? '') ? -1 : 1))
    const actual = dela.find((f) => vigente(f, e.ahora))
    if (!actual) continue
    const previa = dela.find((f) => f.id !== actual.id && f.observado_en && Date.parse(f.observado_en) >= e.ahora.getTime() - DIAS_PARA_TENDENCIA * DIA)
    let tendencia = ''
    if (previa) {
      const a = primeraCifra(actual.contenido), b = primeraCifra(previa.contenido)
      if (a !== null && b !== null) tendencia = a > b ? ` · subió (antes ${b})` : a < b ? ` · bajó (antes ${b})` : ' · igual que antes'
    }
    cifras.push(`- ${corto(actual.contenido, 160)}${tendencia} ${cita(actual)}`)
  }
  sec('cifras', 'Cifras y su tendencia', cifras, 'no hay cifras de Mapas, redes ni punto de venta')

  // ventas del punto de venta: el último mes cerrado y la tendencia de los meses (todo por código desde las fichas `metrica:loyverse:*`; solo ingresos)
  // solo aparece si el cliente tiene punto de venta conectado: sin él no es un hueco de todos los rubros
  const ventas = lineasDeVentas(vivas, e.ahora)
  if (ventas.length) sec('ventas', 'Ventas del punto de venta (solo ingresos)', ventas, '', 14)

  // qué dicen los clientes: temas con conteo de reseñas y comentarios
  const opiniones = por('resenas', 'comentarios', 'mencion')
  const temas = temasConConteo(opiniones.map((f) => f.contenido))
  const lineasOp = opiniones.length ? [`- ${opiniones.length} opinión(es) vigente(s); temas que más se repiten: ${temas.length ? temas.map((t) => `${t.tema} (${t.veces})`).join(', ') : 'ninguno repetido'} ${cita(opiniones[0])}`] : []
  sec('opiniones', 'Qué dicen los clientes', lineasOp, 'no hay reseñas ni comentarios')

  // competencia vigilada
  const comp = por('competidor_vigilado')
  sec('competencia', 'Competencia vigilada', comp.map((f) => `- ${corto(f.titulo, 80)}: ${corto(f.contenido, 140)} ${cita(f)}`), 'no hay competidores vigilados')

  // contexto que le aplica (feriados y temporada del país)
  const ctx = e.zona.filter((f) => vigente(f, e.ahora)).slice(0, MAX_POR_SECCION)
  sec('contexto', 'Contexto que le aplica', ctx.map((f) => linea(f, 140)), 'no hay contexto de su país')

  const cabecera = `RESUMEN VIVO · ${e.nombre ?? e.client_id.slice(0, 8)} · armado el ${e.ahora.toISOString().slice(0, 10)} por código desde las fichas vivas (cada línea cita su ficha; nada sin fuente)`
  const pie = huecos.length ? `\n## Huecos\n${huecos.map((h) => `- ${h}`).join('\n')}` : ''
  return { texto: `${cabecera}\n\n${partes.join('\n\n')}${pie}`, huecos, secciones }
}

/** la ficha del resumen del cliente y la de cada sede con competencia propia (puro) */
export function fichasDeResumen(e: EntradaDelResumen): SalidaDelResumen {
  const dia = e.ahora.toISOString().slice(0, 10)
  const base = armarResumen(e)
  const comun = { brazo: 'resumen' as const, alcance: 'cliente' as const, client_id: e.client_id, clase: CLASE_DEL_RESUMEN, origen: 'plataforma' as const, fuente_url: null, fecha_fuente: dia, observado_en: e.ahora.toISOString(), vigente_hasta: new Date(e.ahora.getTime() + 2 * DIA).toISOString(), decision: 'reemplaza' as const }
  const cliente: FichaDeBrazo = { ...comun, ref: `brazo:resumen:cliente:${dia}`, atributo: ATRIBUTO_DEL_RESUMEN, titulo: `Resumen vivo · ${e.nombre ?? 'cliente'}`, contenido: base.texto, sobre: e.nombre ?? undefined, datos: { huecos: base.huecos, secciones: base.secciones } }
  const sedes: FichaDeBrazo[] = []
  if (e.sedes.length >= 2) {
    for (const s of e.sedes) {
      const propias = e.fichas.filter((f) => f.clase === 'competidor_vigilado' && !f.retirada_en && esObjeto(f.provenance_tag) && esObjeto((f.provenance_tag as Fila).datos) && String(((f.provenance_tag as Fila).datos as Fila).sede ?? '') === s.clave)
      if (!propias.length) continue
      const texto = `RESUMEN VIVO DE LA SEDE ${s.clave}${s.ciudad ? ` (${s.ciudad})` : ''} · ${dia}\n\n## Competencia vigilada de esta sede\n${propias.slice(0, MAX_POR_SECCION).map((f) => `- ${corto(f.titulo, 80)}: ${corto(f.contenido, 140)} ${cita(f)}`).join('\n')}`
      sedes.push({ ...comun, ref: `brazo:resumen:sede:${s.clave}:${dia}`, atributo: atributoDeSede(s.clave), titulo: `Resumen vivo · sede ${s.clave}`, contenido: texto, datos: { sede: s.clave } })
    }
  }
  return { cliente, sedes, huecos: base.huecos, secciones: base.secciones, texto_para_el_agente: armarResumen(e, { candidatos: true }).texto }
}

interface Db { from: (t: string) => any }
/** lee las fichas del cliente y las de zona; una lectura fallida se DICE y no se escribe un resumen a medias */
export async function cargarEntradaDelResumen(db: Db, o: { client_id: string; nombre: string | null; rubro: string | null; ahora: Date; zonas: string[]; sedes: Array<{ clave: string; ciudad: string | null }> }): Promise<{ ok: true; entrada: EntradaDelResumen } | { ok: false; detalle: string }> {
  const desde = new Date(o.ahora.getTime() - DIAS_PARA_TENDENCIA * DIA).toISOString()
  const campos = 'id, clase, titulo, contenido, atributo, observado_en, fecha_fuente, vigente_hasta, retirada_en, provenance_tag, descartada, creado_en'
  const q = await db.from('cerebro_fichas').select(campos).eq('client_id', o.client_id).limit(3000)
  if (q.error) return { ok: false, detalle: `cerebro_fichas: ${String(q.error.message).slice(0, 120)}` }
  const todas = (Array.isArray(q.data) ? q.data : []) as Array<FichaParaResumen & { descartada?: boolean }>
  const fichas = todas.filter((f) => !f.descartada && f.clase !== CLASE_DEL_RESUMEN && (!f.retirada_en || (f.observado_en ?? '') >= desde))
  const zona: FichaParaResumen[] = []
  for (const z of o.zonas) {
    const zq = await db.from('cerebro_fichas').select(campos).eq('client_id', z).limit(200)
    if (zq.error) return { ok: false, detalle: `cerebro_fichas (zona ${z}): ${String(zq.error.message).slice(0, 120)}` }
    zona.push(...((Array.isArray(zq.data) ? zq.data : []) as Array<FichaParaResumen & { descartada?: boolean }>).filter((f) => !f.descartada && !f.retirada_en))
  }
  return { ok: true, entrada: { client_id: o.client_id, nombre: o.nombre, rubro: o.rubro, ahora: o.ahora, fichas, zona, sedes: o.sedes } }
}

/** LA LECTURA DE LAS OFICINAS: el resumen vigente del cliente en UNA llamada (y los de sus sedes). Una falla de lectura se DICE; sin resumen = `null`, no un texto inventado. */
export async function leerResumenVivo(db: Db, clientId: string): Promise<{ ok: true; cliente: { id: string; titulo: string; contenido: string; observado_en: string | null } | null; sedes: Array<{ id: string; titulo: string; contenido: string }> } | { ok: false; detalle: string }> {
  const q = await db.from('cerebro_fichas').select('id, titulo, contenido, atributo, observado_en, retirada_en, descartada').eq('client_id', clientId).eq('clase', CLASE_DEL_RESUMEN).limit(50)
  if (q.error) return { ok: false, detalle: `cerebro_fichas: ${String(q.error.message).slice(0, 120)}` }
  const vivas = ((Array.isArray(q.data) ? q.data : []) as Array<Record<string, unknown>>).filter((x) => !x.retirada_en && !x.descartada).sort((a, b) => (String(b.observado_en ?? '') < String(a.observado_en ?? '') ? -1 : 1))
  const c = vivas.find((x) => x.atributo === ATRIBUTO_DEL_RESUMEN)
  return {
    ok: true,
    cliente: c ? { id: String(c.id), titulo: String(c.titulo), contenido: String(c.contenido), observado_en: (c.observado_en as string | null) ?? null } : null,
    sedes: vivas.filter((x) => String(x.atributo ?? '').startsWith('resumen:sede:')).map((x) => ({ id: String(x.id), titulo: String(x.titulo), contenido: String(x.contenido) })),
  }
}
