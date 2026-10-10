/**
 * EL CHEQUEO DE HECHOS DEL MANUAL (S3 y S5) · R3 certeza · R4 procedencia · R5 sede≠origen · R7 dudas. PURO, sin modelo.
 *
 * Solo se chequean MARCAS DE HECHO dentro de las frases (palabra de certeza · cifra · lugar de origen · cita atribuida · fecha). Todo lo demás es creativo y NO se mira:
 * tono, voz, personalidad, valores, ideas, propuestas, adjetivos. Si una frase creativa CONTIENE una marca, solo esa cláusula se evalúa y se corrige.
 *
 * Estados de un hecho (el código los calcula; el autor NO los escribe):
 *   verificado             · hay respaldo en una fuente primaria que el cliente no escribió de sí mismo para vender (humana), o una cifra/fecha/lugar/cita presente en lo propio
 *   afirmacion_del_cliente · lo dice el cliente de sí mismo (su sitio, su red): se cita literal «el cliente dice: «…»» (firma D2); una certeza propia NUNCA es «verificado»
 *   sin_cita               · ninguna fuente primaria lo respalda
 *   solo_sintesis          · lo respalda únicamente un resumen de agente (R4: no es fuente)
 *   con_duda               · tenía respaldo, pero un agente dejó escrita una duda sobre este mismo hecho (R7)
 * LÍMITE DECLARADO: «la cita existe y es primaria» ≠ «la cita respalda el sentido». Las cifras y fechas se comprueban por PRESENCIA. Lo demás lo ven GPT ciego y Emilio.
 */
import { buscarCerteza, mencionaCerteza, PALABRAS_DE_CERTEZA_ES, type PalabraDeCerteza } from './palabras-de-certeza.es'
import { esPrimaria, resolverCita, type Fuente, type TipoDeFuente } from './procedencia'
import { dudasAtadas, type Duda } from './dudas'
import { frasePideOrigen, lugaresMencionados, papelDelLugar, respaldoDeOrigen } from './lugares'
import { contenidoCompartido, contieneLiteral, normalizar, palabrasDe, partirEnClausulas, partirEnFrases } from './texto'

export type Marca = 'certeza' | 'cifra' | 'lugar' | 'cita' | 'fecha'
export type EstadoDeHecho = 'verificado' | 'afirmacion_del_cliente' | 'sin_cita' | 'solo_sintesis' | 'con_duda'
export const ESTADOS_SIN_RESPALDO: EstadoDeHecho[] = ['sin_cita', 'solo_sintesis', 'con_duda']
/** de peor a mejor: el estado de una cláusula con varias marcas es el peor de ellos */
const PEOR: EstadoDeHecho[] = ['sin_cita', 'solo_sintesis', 'con_duda', 'afirmacion_del_cliente', 'verificado']

export interface CitaDeAutor { frase: string; literal: string; fuente_id: string }
export interface DetalleDeMarca { marca: Marca; estado: EstadoDeHecho; texto: string; cita_literal: string | null; fuente_id: string | null; motivo: string | null }
export interface Hecho {
  campo: string
  ruta: string
  frase: string
  clausula: string
  marcas: Marca[]
  estado: EstadoDeHecho
  cita_literal: string | null
  fuente: { id: string; tipo: TipoDeFuente; rotulo: string; url?: string } | null
  motivo: string | null
  duda: string | null
  detalle: DetalleDeMarca[]
}

export interface EntradaDeHechos {
  manual: Record<string, unknown>
  fuentes: Fuente[]
  citas?: CitaDeAutor[]
  dudas?: Duda[]
  excluir?: string[]
  certeza?: PalabraDeCerteza[]
}
export interface InformeDeHechos { hechos: Hecho[]; resumen: Record<EstadoDeHecho, number>; sin_respaldo: Hecho[] }

/** campos que NO son prosa a chequear: listas de términos, visuales, la frase propia que escribe el código y datos internos */
export const CAMPOS_EXCLUIDOS = ['forbidden_words', 'required_terminology', 'primary_colors', 'typography', 'tagline', 'frases_propias', 'eslogan_literal', 'client_id', 'competitor_mentions_policy', 'logo_usage_notes', 'visual']

export const PREFIJO_PENDIENTE = 'PENDIENTE: '
export const PREFIJO_DECLARACION = 'el cliente dice: '
/** firma D2: lo que el cliente dice de sí mismo se escribe como cita literal */
export const declaracionDelCliente = (literal: string): string => `${PREFIJO_DECLARACION}«${literal.trim().replace(/[«»]/g, '')}»`

const ENMASCARAR = [/el cliente dice:\s*«[^»]*»/gi, /PENDIENTE:[^.;\n]*/g]
const enmascarar = (t: string): string => ENMASCARAR.reduce((a, r) => a.replace(r, ' '), t)

export interface HojaDeTexto { campo: string; ruta: string; texto: string }
/** todas las cadenas de texto del manual con su ruta («campo», «campo[2]», «campo.sub») */
export function hojasDeTexto(manual: Record<string, unknown>, excluir: string[] = CAMPOS_EXCLUIDOS): HojaDeTexto[] {
  const out: HojaDeTexto[] = []
  const visitar = (v: unknown, ruta: string, campo: string): void => {
    if (typeof v === 'string') { if (v.trim()) out.push({ campo, ruta, texto: v }); return }
    if (Array.isArray(v)) { v.forEach((x, i) => visitar(x, `${ruta}[${i}]`, campo)); return }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) visitar(x, `${ruta}.${k}`, campo)
  }
  for (const [k, v] of Object.entries(manual)) { if (k.startsWith('_') || excluir.includes(k)) continue; visitar(v, k, k) }
  return out
}

// ───────────────────────── marcas
const RE_CIFRA = /\$\s?\d[\d.,]*|\d[\d.,]*\s?%|\b\d{1,2}[:h]\d{2}\b|\b\d[\d.,]*\d\b|\b\d{2,}\b/g
const RE_FECHA = /\b(desde(?:\s+el)?|fundad[oa]\s+en|inaugurad[oa]\s+en|abrimos\s+en|nacio\s+en|desde\s+hace)\s+((?:19|20)\d{2})\b/i
const RE_CITA = /[«“"]([^»”"]{8,})[»”"]/g
/** la frase atribuye lo citado a alguien (cuando no, la cita es un ejemplo de redacción y es creativa: no se chequea) */
const RE_ATRIBUCION = /\b(segun|dice|dicen|afirma|afirman|declara|declaran|publica|publican|escribe|escriben|asegura|aseguran|promete|prometen|su (bio|biografia|sitio|web|perfil)|el cliente)\b/
const soloDigitos = (s: string): string => s.replace(/(?<=\d)[.,](?=\d)/g, '').replace(/[^\d%]/g, '')

function extraerCifras(clausula: string): string[] {
  const out: string[] = []
  for (const m of clausula.matchAll(RE_CIFRA)) {
    const t = m[0]
    const d = soloDigitos(t)
    if (!d) continue
    if (/^(19|20)\d{2}$/.test(d)) continue // los años van por «fecha»
    if (d.replace('%', '').length < 2 && !/[%$]/.test(t)) continue // una cifra suelta de un dígito no es un dato
    out.push(d)
  }
  return [...new Set(out)]
}

interface Oracion { f: Fuente; texto: string; palabras: string[] }
interface Indice { oraciones: Oracion[]; digitosPorFuente: Map<string, Set<string>>; fuentes: Fuente[] }
function indexar(fuentes: Fuente[]): Indice {
  const oraciones: Oracion[] = []
  const digitosPorFuente = new Map<string, Set<string>>()
  for (const f of fuentes) {
    if (f.tipo !== 'tercero') for (const o of partirEnFrases(f.texto)) oraciones.push({ f, texto: o, palabras: palabrasDe(o) }) // lo de terceros no habla del cliente: solo respalda cifras del mercado
    const d = new Set<string>()
    for (const m of f.texto.matchAll(RE_CIFRA)) { const x = soloDigitos(m[0]); if (x) { d.add(x); d.add(x.replace('%', '')) } }
    for (const m of f.texto.matchAll(/\b(?:19|20)\d{2}\b/g)) d.add(m[0])
    digitosPorFuente.set(f.id, d)
  }
  return { oraciones, digitosPorFuente, fuentes }
}

const mejorTipo = (tipos: TipoDeFuente[]): TipoDeFuente | null => (tipos.includes('humana') ? 'humana' : tipos.includes('primaria_propia') ? 'primaria_propia' : tipos.includes('tercero') ? 'tercero' : tipos.includes('sintesis') ? 'sintesis' : null)

interface Soporte { estado: EstadoDeHecho; cita: string | null; fuente: Fuente | null; motivo: string | null }
const SIN: Soporte = { estado: 'sin_cita', cita: null, fuente: null, motivo: null }

/** una certeza propia (primaria_propia) es «afirmación del cliente»; solo una fuente humana la verifica */
function porTipoDeCerteza(tipo: TipoDeFuente | null, cita: string, f: Fuente | null): Soporte {
  if (tipo === 'humana') return { estado: 'verificado', cita, fuente: f, motivo: null }
  if (tipo === 'primaria_propia') return { estado: 'afirmacion_del_cliente', cita, fuente: f, motivo: 'lo dice el cliente de sí mismo' }
  if (tipo === 'sintesis') return { estado: 'solo_sintesis', cita, fuente: f, motivo: 'solo lo respalda un resumen de agente' }
  return SIN
}
/** una cifra, fecha, lugar o cita presente en lo propio SÍ es un dato verificado de lo que el cliente publica */
function porTipoDeDato(tipo: TipoDeFuente | null, cita: string, f: Fuente | null): Soporte {
  if (tipo === 'humana' || tipo === 'primaria_propia') return { estado: 'verificado', cita, fuente: f, motivo: null }
  if (tipo === 'tercero') return { estado: 'verificado', cita, fuente: f, motivo: 'respaldo de un tercero: habla del mercado, no del cliente' }
  if (tipo === 'sintesis') return { estado: 'solo_sintesis', cita, fuente: f, motivo: 'solo lo respalda un resumen de agente' }
  return SIN
}

function citaDe(citas: CitaDeAutor[] | undefined, frase: string, clausula: string): CitaDeAutor | null {
  const nf = normalizar(frase), nc = normalizar(clausula)
  return (citas ?? []).find((c) => { const x = normalizar(c.frase); return x === nf || x === nc || (x.length >= 8 && (nf.includes(x) || nc.includes(x))) }) ?? null
}

function soporteDeCerteza(id: string, clausula: string, frase: string, ix: Indice, lista: PalabraDeCerteza[], cita: CitaDeAutor | null): Soporte {
  // 0 · la cita del autor, si trae una: tiene que existir tal cual y decir la misma palabra
  if (cita) {
    const r = resolverCita(cita, ix.fuentes)
    if (!r.existe) return { ...SIN, motivo: r.motivo === 'fuente_desconocida' ? 'cita_de_fuente_desconocida' : 'cita_inexistente' }
    if (!mencionaCerteza(palabrasDe(cita.literal), id, lista)) return { ...SIN, motivo: 'la_cita_no_dice_la_palabra' }
    return porTipoDeCerteza(r.tipo, cita.literal, r.fuente)
  }
  // 1 · la cláusula reproduce literal una frase propia del cliente
  if (palabrasDe(clausula).length >= 3) {
    const lit = ix.fuentes.find((f) => (f.tipo === 'primaria_propia' || f.tipo === 'humana') && contieneLiteral(f.texto, clausula))
    if (lit) return porTipoDeCerteza(lit.tipo, clausula.trim(), lit)
  }
  // 2 · una oración de una fuente con LA MISMA palabra de certeza y contexto compartido (≥ 2 palabras de contenido, sin contar la certeza)
  const sinCerteza = (t: string) => { const w = palabrasDe(t); const m = new Set(buscarCerteza(w, lista).flatMap((x) => Array.from({ length: x.palabra.split(' ').length }, (_, k) => x.indice + k))); return w.filter((_, i) => !m.has(i)).join(' ') }
  const base = sinCerteza(frase)
  const halladas = ix.oraciones.filter((o) => mencionaCerteza(o.palabras, id, lista) && contenidoCompartido(sinCerteza(o.texto), base) >= 2)
  if (!halladas.length) return SIN
  const tipo = mejorTipo(halladas.map((o) => o.f.tipo))
  const o = halladas.find((x) => x.f.tipo === tipo)!
  return porTipoDeCerteza(tipo, o.texto.trim(), o.f)
}

function soporteDeCifra(digitos: string, ix: Indice, cita: CitaDeAutor | null): Soporte {
  if (cita) {
    const r = resolverCita(cita, ix.fuentes)
    if (!r.existe) return { ...SIN, motivo: 'cita_inexistente' }
    if (!soloDigitos(cita.literal).includes(digitos.replace('%', '')) && !soloDigitos(cita.literal).includes(digitos)) return { ...SIN, motivo: 'la_cita_no_trae_la_cifra' }
    return porTipoDeDato(r.tipo, cita.literal, r.fuente)
  }
  const dentro = ix.fuentes.filter((f) => ix.digitosPorFuente.get(f.id)?.has(digitos) || ix.digitosPorFuente.get(f.id)?.has(digitos.replace('%', '')))
  const tipo = mejorTipo(dentro.map((f) => f.tipo))
  const f = dentro.find((x) => x.tipo === tipo) ?? null
  return porTipoDeDato(tipo, f ? `la cifra ${digitos} aparece en «${f.rotulo}»` : '', f)
}

function soporteDeLugar(clausula: string, lugares: string[], ix: Indice, cita: CitaDeAutor | null): Soporte {
  if (cita) {
    const r = resolverCita(cita, ix.fuentes)
    if (!r.existe) return { ...SIN, motivo: 'cita_inexistente' }
    const papel = lugares.map((l) => papelDelLugar(cita.literal, l)).find((p) => p === 'origen_producto')
    if (!papel) return { ...SIN, motivo: 'la_cita_no_dice_que_es_el_origen' }
    return porTipoDeDato(r.tipo, cita.literal, r.fuente)
  }
  const primaria = respaldoDeOrigen(lugares, ix.fuentes, true)
  if (primaria?.papel === 'origen_producto') return porTipoDeDato(primaria.fuente.tipo, primaria.oracion, primaria.fuente)
  // la cláusula reproduce literal lo que el cliente dice de sí mismo
  if (palabrasDe(clausula).length >= 3) {
    const lit = ix.fuentes.find((f) => (f.tipo === 'primaria_propia' || f.tipo === 'humana') && contieneLiteral(f.texto, clausula))
    if (lit) return porTipoDeCerteza(lit.tipo, clausula.trim(), lit)
  }
  const sintesis = respaldoDeOrigen(lugares, ix.fuentes.filter((f) => f.tipo === 'sintesis'), false)
  if (sintesis?.papel === 'origen_producto') return { estado: 'solo_sintesis', cita: sintesis.oracion, fuente: sintesis.fuente, motivo: 'solo lo respalda un resumen de agente' }
  if (primaria) return { ...SIN, motivo: primaria.papel === 'sede' ? 'sede_no_es_origen' : primaria.papel === 'sin_papel' ? 'lugar_sin_papel_de_origen' : `el_lugar_es_${primaria.papel}_no_origen` }
  return { ...SIN, motivo: 'lugar_ausente_de_las_fuentes' }
}

function soporteDeFecha(anio: string, ix: Indice): Soporte {
  const dentro = ix.fuentes.filter((f) => f.tipo !== 'tercero' && ix.digitosPorFuente.get(f.id)?.has(anio))
  const tipo = mejorTipo(dentro.map((f) => f.tipo))
  const f = dentro.find((x) => x.tipo === tipo) ?? null
  return porTipoDeDato(tipo, f ? `el año ${anio} aparece en «${f.rotulo}»` : '', f)
}

function soporteDeCita(literal: string, ix: Indice): Soporte {
  const dentro = ix.fuentes.filter((f) => f.tipo !== 'tercero' && contieneLiteral(f.texto, literal))
  const tipo = mejorTipo(dentro.map((f) => f.tipo))
  const f = dentro.find((x) => x.tipo === tipo) ?? null
  return porTipoDeDato(tipo, f ? literal : '', f)
}

// ───────────────────────── el chequeo
export function evaluarHechos(e: EntradaDeHechos): InformeDeHechos {
  const lista = e.certeza ?? PALABRAS_DE_CERTEZA_ES
  const ix = indexar(e.fuentes)
  const dudas = e.dudas ?? []
  const hechos: Hecho[] = []
  for (const h of hojasDeTexto(e.manual, e.excluir ?? CAMPOS_EXCLUIDOS)) {
    for (const frase of partirEnFrases(enmascarar(h.texto))) {
      // las citas atribuidas se evalúan a nivel de frase (una cita puede cruzar comas)
      const citasTexto = [...frase.matchAll(RE_CITA)].map((m) => m[0])
      const restante = citasTexto.reduce((a, c) => a.replace(c, ' '), frase)
      for (const c of citasTexto) {
        const lit = c.slice(1, -1)
        if (palabrasDe(lit).length < 3) continue
        if (!RE_ATRIBUCION.test(normalizar(restante))) continue
        const s = soporteDeCita(lit, ix)
        hechos.push(armar(h, frase, c, ['cita'], [{ marca: 'cita', texto: lit, s }], dudas))
      }
      for (const clausula of partirEnClausulas(restante)) {
        const detalle: Array<{ marca: Marca; texto: string; s: Soporte }> = []
        const palabras = palabrasDe(clausula)
        const cita = citaDe(e.citas, frase, clausula)
        for (const m of buscarCerteza(palabras, lista)) detalle.push({ marca: 'certeza', texto: m.palabra, s: soporteDeCerteza(m.id, clausula, frase, ix, lista, cita) })
        for (const d of extraerCifras(clausula)) detalle.push({ marca: 'cifra', texto: d, s: soporteDeCifra(d, ix, cita) })
        const f = RE_FECHA.exec(clausula)
        if (f) detalle.push({ marca: 'fecha', texto: f[2], s: soporteDeFecha(f[2], ix) })
        if (frasePideOrigen(clausula)) {
          const lugares = lugaresMencionados(clausula)
          if (lugares.length) detalle.push({ marca: 'lugar', texto: lugares.join(' / '), s: soporteDeLugar(clausula, lugares, ix, cita) })
        }
        if (detalle.length) hechos.push(armar(h, frase, clausula, [...new Set(detalle.map((d) => d.marca))], detalle, dudas))
      }
    }
  }
  const resumen: Record<EstadoDeHecho, number> = { verificado: 0, afirmacion_del_cliente: 0, sin_cita: 0, solo_sintesis: 0, con_duda: 0 }
  for (const h of hechos) resumen[h.estado]++
  return { hechos, resumen, sin_respaldo: hechos.filter((h) => ESTADOS_SIN_RESPALDO.includes(h.estado)) }
}

function armar(h: HojaDeTexto, frase: string, clausula: string, marcas: Marca[], detalle: Array<{ marca: Marca; texto: string; s: Soporte }>, dudas: Duda[]): Hecho {
  const peor = detalle.reduce((a, d) => (PEOR.indexOf(d.s.estado) < PEOR.indexOf(a.s.estado) ? d : a), detalle[0])
  let estado = peor.s.estado
  let duda: string | null = null
  if (estado === 'verificado') {
    const atadas = dudasAtadas(clausula + ' ' + frase, dudas)
    if (atadas.length) { estado = 'con_duda'; duda = atadas[0].frase }
  }
  return {
    campo: h.campo, ruta: h.ruta, frase, clausula, marcas, estado,
    cita_literal: peor.s.cita, fuente: peor.s.fuente ? { id: peor.s.fuente.id, tipo: peor.s.fuente.tipo, rotulo: peor.s.fuente.rotulo, ...(peor.s.fuente.url ? { url: peor.s.fuente.url } : {}) } : null,
    motivo: peor.s.motivo, duda,
    detalle: detalle.map((d) => ({ marca: d.marca, estado: d.s.estado, texto: d.texto, cita_literal: d.s.cita, fuente_id: d.s.fuente?.id ?? null, motivo: d.s.motivo })),
  }
}

export { esPrimaria }
