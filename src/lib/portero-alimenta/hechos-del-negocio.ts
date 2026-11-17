/**
 * HECHOS DEL NEGOCIO COMO DATO (ENCARGO 2 de Cerebro · 17-nov · firma de Emilio · ADENDA «la unidad es la OFERTA»).
 * El cerebro GUARDA y SIRVE hechos con fuente; no los inventa ni los redacta. Cada hecho va atado a una OFERTA (hoy, para los clientes con sedes, la oferta es la sede:
 * su `clave` es la misma que trae la fila del calendario) y dice: tipo, valor, desde/hasta, fuente (su `provenance_tag`), fecha de la fuente y confianza.
 *
 *  · NO hay tabla nueva: se DERIVA al leer de lo que ya existe (no se duplica): las sedes del alta (`client_sedes`), los datos de cada sede (`client_sede_datos`, con su
 *    retiro y su motivo), lo que el dueño respondió (`cerebro_fichas` de clase `dato_del_dueno`, por la puerta del dueño) y el estado que fija la ficha del cliente
 *    (`clients.config.apify.sedes_estado`). Por eso está «al día» siempre: lo que cambia en esas fuentes cambia el hecho en la siguiente lectura.
 *  · Lo que no tiene fuente sale «no consta» (`sin_dato`): nunca se rellena.
 *  · HUECOS: falta un hecho esencial (desde cuándo atiende una oferta, cuándo abre la que está por abrir, desde cuándo está cerrada, a qué zona entrega la que entrega a
 *    domicilio, dónde atiende un cliente sin ofertas registradas) o dos fuentes distintas se contradicen sobre el estado de una oferta. Cada hueco trae la pregunta para el
 *    dueño; el portero la crea por la ruta de la plataforma (`hechos-preguntas.ts`). Un hueco ya respondido por el dueño (mismo tema) se cierra con su respuesta, citada.
 *  · Juzgar no es de este código: solo extrae lo EXACTO (una fecha escrita, el estado que ya calcula `sedes/por-abrir`). Una respuesta sin fecha exacta («la próxima semana»)
 *    se cita tal cual y el «desde» queda «no consta».
 *  · Nombres de campo acordados con CC3 y CC6 (PROPUESTA-CC-CEREBRO-a-CC3-nombres-de-campo…, fijado 17-nov 17:24Z); la forma de la oficina (`HechoDelNegocio {que, valor,
 *    donde, desde, fuente}` de CC4) se sirve de la misma fila: lo vencido no llega como actual y la confianza baja viaja en el texto.
 */
import { normalizar } from '../manual/texto'
import { esExactamenteElMismoTema } from './dueno'
import { estadoDeApertura, type EstadoDeSede } from '../sedes/por-abrir'
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Fila => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fila) : {})
const dia = (v: unknown): string | null => { const t = Date.parse(txt(v)); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null }

export const NO_CONSTA = 'no consta'
/** filas leídas por tabla y cliente (si se alcanza, se dice: «lectura recortada») */
export const TOPE_DE_LECTURA = 2000
export const TIPOS_DE_HECHO = ['sede', 'apertura', 'cierre_retiro', 'zona_de_entrega', 'aun_no_existe'] as const
export type TipoDeHecho = (typeof TIPOS_DE_HECHO)[number]
export type Confianza = 'alta' | 'media' | 'baja'
/** el rótulo de cada tipo en la forma de la oficina (`que`) */
export const QUE_ES_CADA_TIPO: Record<TipoDeHecho, string> = { sede: 'sede', apertura: 'apertura', cierre_retiro: 'cierre o retiro', zona_de_entrega: 'zona de entrega', aun_no_existe: 'aún no existe' }

/** un hecho del negocio tal como lo sirve el cerebro (forma completa, acordada con CC3) */
export interface HechoDelNegocioPorOferta {
  /** la clave de la oferta (la del calendario); null = de todo el negocio */
  oferta: string | null
  /** la sede, solo cuando la oferta es física */
  sede_id: string | null
  tipo: TipoDeHecho
  valor: string
  /** AAAA-MM-DD · null = no consta */
  vigente_desde: string | null
  vigente_hasta: string | null
  /** el provenance_tag: de dónde sale, citable («dueno · cerebro_fichas:<id>») */
  fuente: string
  /** cuándo lo dijo la fuente (AAAA-MM-DD) */
  fecha_de_la_fuente: string | null
  confianza: Confianza
}
/** lo que falta: se dice, no se rellena */
export interface SinDato { oferta: string | null; tipo: TipoDeHecho; que_falta: string }
/** un hueco que se le pregunta al dueño */
export interface HuecoDeHechos {
  clase: 'falta' | 'contradiccion'
  oferta: string | null
  /** tema de la pregunta (texto libre: la plataforma y la puerta del dueño lo comparan por palabras) */
  tema: string
  pregunta: string
  motivo: string
}
export interface HechosDelNegocio { hechos: HechoDelNegocioPorOferta[]; sin_dato: SinDato[]; huecos: HuecoDeHechos[] }

export interface EntradaDeHechos {
  sedes: Array<{ id: string; clave: string; ciudad?: string | null }>
  /** filas de `client_sede_datos` del cliente (las retiradas se ignoran aquí) */
  datosDeSede: Array<{ id?: string; sede_id?: string | null; campo?: string | null; valor_texto?: string | null; fuente?: string | null; fuente_ref?: string | null; observado_en?: string | null; retirada_en?: string | null }>
  /** fichas `dato_del_dueno` vigentes del cliente */
  fichasDelDueno: Array<{ id?: string; sede?: string | null; observado_en?: string | null; retirada_en?: string | null; descartada?: boolean | null; provenance_tag?: unknown }>
  /** `clients.config` del cliente (solo importa `apify.sedes_estado`) */
  config?: unknown
}

// ── fechas EXACTAS escritas en una respuesta (código: verificar exacto) ──
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const valida = (a: number, m: number, d: number): string | null => {
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const f = new Date(Date.UTC(a, m - 1, d))
  return f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.toISOString().slice(0, 10) : null
}
/** la fecha COMPLETA (día, mes y año) que trae un texto, si trae UNA sola; «la próxima semana», «marzo de 2019» o dos fechas distintas → null */
export function fechaExactaEnElTexto(texto: string): string | null {
  // los números con sus separadores se leen del texto TAL CUAL (normalizar borra «-», «/» y «.»); los meses, del texto normalizado (sin tildes)
  const crudo = texto.toLowerCase()
  const t = normalizar(texto).replace(/setiembre/g, 'septiembre')
  const halladas = new Set<string>()
  for (const m of crudo.matchAll(/(?<![\d/.-])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d/.-])/g)) { const f = valida(+m[1], +m[2], +m[3]); if (f) halladas.add(f) }
  for (const m of crudo.matchAll(/(?<![\d/.-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?![\d/.-])/g)) { const f = valida(+m[4], +m[3], +m[1]); if (f) halladas.add(f) }
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MESES.join('|')})\\s+(?:de|del)\\s+(\\d{4})\\b`, 'g'))) { const f = valida(+m[3], MESES.indexOf(m[2]) + 1, +m[1]); if (f) halladas.add(f) }
  return halladas.size === 1 ? [...halladas][0] : null
}

// ── temas de las preguntas (texto fijo por oferta: así el tema se reconoce igual en la plataforma y en la puerta del dueño) ──
/** el día anterior a una fecha AAAA-MM-DD (calendario, en UTC) */
export const diaAnterior = (f: string): string => new Date(Date.parse(`${f}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

export const temaDeApertura = (clave: string): string => `fecha apertura ${clave}`
export const temaDeCierre = (clave: string): string => `fecha cierre ${clave}`
export const temaDeZona = (clave: string): string => `zona entrega ${clave}`
export const temaDeEstado = (clave: string): string => `estado actual ${clave}`
export const TEMA_SIN_OFERTAS = 'donde atiende el negocio'

const CONFIANZA_POR_FUENTE: Record<string, Confianza> = { dueno: 'alta', mapas: 'alta', config: 'media', sitio: 'media', instagram: 'media', facebook: 'media', tiktok: 'media', alta: 'media' }
const NOMBRE_DE_FUENTE: Record<string, string> = { dueno: 'el dueño', mapas: 'su ficha de Google Maps', sitio: 'su sitio web', instagram: 'Instagram', config: 'la ficha del cliente', alta: 'el registro del alta' }

interface Fuente { origen: string; ref: string; fecha: string | null }
const etiqueta = (f: Fuente): string => `${f.origen} · ${f.ref}`
const respuestaDe = (f: EntradaDeHechos['fichasDelDueno'][number]): { tema: string; respuesta: string; sedes: string[]; respondido: string | null } => {
  const d = obj(obj(f.provenance_tag).datos)
  const sedes = Array.isArray(d.sedes) ? (d.sedes as unknown[]).map(txt).filter(Boolean) : []
  return { tema: txt(d.tema), respuesta: txt(d.respuesta), sedes: sedes.length ? sedes : txt(f.sede) ? [txt(f.sede)] : [], respondido: dia(d.respondido_en) ?? dia(f.observado_en) }
}

const CAMPOS_DE_ESTADO = new Set(['estado de la sede', 'estado', 'apertura'])
const CAMPOS_DE_ZONA = new Set(['zona de entrega', 'zona entrega', 'zona', 'cobertura', 'zonas de entrega'])
const campo = (c: unknown): string => normalizar(txt(c)).replace(/_/g, ' ')
const estadoDeValor = (v: string): EstadoDeSede | null => {
  const t = normalizar(v).replace(/_/g, ' ')
  if (t === 'por abrir' || t === 'sin abrir') return 'por_abrir'
  if (t === 'abierta' || t === 'abierto' || t === 'activa') return 'abierta'
  if (t === 'cerrada' || t === 'cerrado') return 'cerrada'
  return estadoDeApertura(t)
}
const TEXTO_DEL_ESTADO: Record<EstadoDeSede, string> = { abierta: 'abierta', por_abrir: 'por abrir', cerrada: 'cerrada' }
const entregaADomicilio = (atencion: string): boolean => /\b(domicilio|delivery|entrega|envio|envios|a casa)\b/.test(normalizar(atencion))

/** los hechos del negocio de UN cliente, sus «no consta» y sus huecos. Puro: quien llama le da lo que ya leyó */
export function hechosDelNegocio(e: EntradaDeHechos, _ahora: Date): HechosDelNegocio {
  const hechos: HechoDelNegocioPorOferta[] = []
  const sin_dato: SinDato[] = []
  const huecos: HuecoDeHechos[] = []
  const respuestas = e.fichasDelDueno.filter((f) => !f.retirada_en && f.descartada !== true).map((f) => ({ f, r: respuestaDe(f) })).filter((x) => x.r.tema && x.r.respuesta)
  /** la respuesta MÁS NUEVA del dueño a ese tema: tema EXACTO (normalizado), la misma regla de la puerta del dueño; sin importar si se guardó con o sin sede.
   *  Por palabras no sirve: «fecha apertura guayaquil» y «fecha apertura olon» comparten 2 de 3 y serían «el mismo tema» */
  const respuestaAlTema = (tema: string) => respuestas.filter((x) => esExactamenteElMismoTema(x.r.tema, tema)).sort((a, b) => String(b.r.respondido).localeCompare(String(a.r.respondido)))[0] ?? null
  const datos = e.datosDeSede.filter((d) => !d.retirada_en && txt(d.sede_id))
  const cfg = obj(obj(obj(e.config).apify).sedes_estado)

  if (!e.sedes.length) {
    sin_dato.push({ oferta: null, tipo: 'sede', que_falta: 'dónde atiende o vende el negocio (no hay ofertas registradas)' })
    const r = respuestaAlTema(TEMA_SIN_OFERTAS)
    if (r) hechos.push({ oferta: null, sede_id: null, tipo: 'sede', valor: `según el dueño: «${r.r.respuesta}»`, vigente_desde: null, vigente_hasta: null, fuente: `dueno · cerebro_fichas:${txt(r.f.id)}`, fecha_de_la_fuente: r.r.respondido, confianza: 'alta' })
    else huecos.push({ clase: 'falta', oferta: null, tema: TEMA_SIN_OFERTAS, pregunta: '¿Dónde atiende o vende tu negocio (locales, ciudades o en línea) y desde cuándo?', motivo: 'el cliente no tiene ofertas registradas' })
    return { hechos, sin_dato, huecos }
  }

  for (const s of e.sedes) {
    const clave = txt(s.clave)
    const nombre = txt(s.ciudad) ? `${txt(s.ciudad)} (${clave})` : clave
    const mios = datos.filter((d) => txt(d.sede_id) === s.id).sort((a, b) => String(b.observado_en ?? '').localeCompare(String(a.observado_en ?? '')))
    const fuenteDeDato = (d: (typeof mios)[number]): Fuente => ({ origen: txt(d.fuente) || 'sitio', ref: `client_sede_datos:${txt(d.id)}`, fecha: dia(d.observado_en) })

    // ── el ESTADO de la oferta por cada clase de fuente (la más nueva de cada una); dueño = sus datos de sede + sus respuestas de apertura
    const porFuente = new Map<string, { estado: EstadoDeSede; fuente: Fuente }>()
    const anotar = (clase: string, estado: EstadoDeSede | null, fuente: Fuente) => { if (!estado) return; const a = porFuente.get(clase); if (!a || String(fuente.fecha ?? '') > String(a.fuente.fecha ?? '')) porFuente.set(clase, { estado, fuente }) }
    for (const d of mios.filter((x) => CAMPOS_DE_ESTADO.has(campo(x.campo)))) anotar(txt(d.fuente) === 'dueno' ? 'dueno' : 'otra', estadoDeValor(txt(d.valor_texto)), fuenteDeDato(d))
    for (const x of respuestas.filter((y) => y.r.sedes.includes(clave) && normalizar(y.r.tema).includes('apertura') && !esExactamenteElMismoTema(y.r.tema, temaDeApertura(clave)))) anotar('dueno', estadoDeApertura(x.r.respuesta), { origen: 'dueno', ref: `cerebro_fichas:${txt(x.f.id)}`, fecha: x.r.respondido })
    if (txt(cfg[clave])) anotar('config', estadoDeValor(txt(cfg[clave])), { origen: 'config', ref: `clients.config.apify.sedes_estado.${clave}`, fecha: null })
    // la ficha del cliente manda; si no, el dueño; si no, otra fuente (el mismo orden que `sedes/por-abrir`)
    const vigente = porFuente.get('config') ?? porFuente.get('dueno') ?? porFuente.get('otra') ?? null
    const distintos = new Set([...porFuente.values()].map((v) => v.estado))
    if (distintos.size > 1) {
      const lados = [...porFuente.values()].map((v) => `«${TEXTO_DEL_ESTADO[v.estado]}» según ${NOMBRE_DE_FUENTE[v.fuente.origen] ?? v.fuente.origen}${v.fuente.fecha ? ` (${v.fuente.fecha})` : ''}`)
      // ya respondida: la respuesta entra por la puerta del dueño como dato de la sede (fuente dueño, más nueva); no se vuelve a preguntar
      if (!respuestaAlTema(temaDeEstado(clave))) huecos.push({ clase: 'contradiccion', oferta: clave, tema: temaDeEstado(clave), pregunta: `Tengo datos distintos sobre ${nombre}: ${lados.join(' y ')}. ¿Cuál es el estado actual?`, motivo: `fuentes en desacuerdo: ${lados.join(' · ')}` })
    }

    // ── atención (qué es la oferta) y la sede como hecho
    const atencion = mios.find((d) => campo(d.campo) === 'tipo de atencion')
    const direccion = mios.find((d) => campo(d.campo) === 'direccion' && txt(d.fuente) === 'mapas') ?? mios.find((d) => campo(d.campo) === 'direccion')
    const base = atencion ?? direccion
    const fuenteBase: Fuente = base ? fuenteDeDato(base) : { origen: 'alta', ref: `client_sedes:${s.id}`, fecha: null }
    // la dirección, si viene de OTRO dato que la atención, lleva su propia cita (cada parte de la línea con su fuente y su fecha)
    const citaDireccion = direccion && base !== direccion ? (() => { const f = fuenteDeDato(direccion); return ` (${etiqueta(f)}${f.fecha ? ` · ${f.fecha}` : ''})` })() : ''
    const valorBase = `${nombre}${atencion ? ` · atención: ${txt(atencion.valor_texto)}` : ''}${direccion ? ` · dirección: ${txt(direccion.valor_texto)}${citaDireccion}` : ''}`
    const hecho = (tipo: TipoDeHecho, valor: string, f: Fuente, extra: Partial<HechoDelNegocioPorOferta> = {}): HechoDelNegocioPorOferta =>
      ({ oferta: clave, sede_id: s.id, tipo, valor, vigente_desde: null, vigente_hasta: null, fuente: etiqueta(f), fecha_de_la_fuente: f.fecha, confianza: CONFIANZA_POR_FUENTE[f.origen] ?? 'baja', ...extra })

    const estado = vigente?.estado ?? null
    const rApertura = respuestaAlTema(temaDeApertura(clave))
    const fechaApertura = rApertura ? fechaExactaEnElTexto(rApertura.r.respuesta) : null
    // la respuesta del dueño SOBRE LA FECHA se cita en el texto con su propia ficha: la fuente del hecho es la del ESTADO (quien dijo «abierta» / «cerrada»), no la de la fecha
    const citaDeFecha = (x: NonNullable<typeof rApertura>): string => ` · sobre la fecha, el dueño dijo «${x.r.respuesta}» (${x.r.respondido ?? 'sin fecha'} · cerebro_fichas:${txt(x.f.id)})`
    const fuenteDeLaFecha = (x: NonNullable<typeof rApertura>): Fuente => ({ origen: 'dueno', ref: `cerebro_fichas:${txt(x.f.id)}`, fecha: x.r.respondido })

    if (estado === 'cerrada') {
      // retiro: la oferta deja de ser actual. Sin fecha de cierre, el hecho dice «cerrada» con la fuente que lo dijo, y el «desde» no consta
      const rCierre = respuestaAlTema(temaDeCierre(clave))
      const fechaCierre = rCierre ? fechaExactaEnElTexto(rCierre.r.respuesta) : null
      hechos.push(hecho('cierre_retiro', `${nombre} cerrada${rCierre ? citaDeFecha(rCierre) : ''}`, vigente!.fuente, { vigente_desde: fechaCierre }))
      if (!fechaCierre) sin_dato.push({ oferta: clave, tipo: 'cierre_retiro', que_falta: 'desde qué fecha está cerrada' })
      if (!rCierre) huecos.push({ clase: 'falta', oferta: clave, tema: temaDeCierre(clave), pregunta: `¿Desde qué fecha está cerrada ${nombre}?`, motivo: 'oferta cerrada sin fecha de cierre' })
      continue
    }
    if (estado === 'por_abrir') {
      // aún no existe: no es una oferta actual; si se sabe cuándo abre, la apertura queda como hecho futuro («AÚN NO VIGENTE» en la ficha)
      // `vigente_hasta` es el ÚLTIMO día que vale (igual que en todo el sistema): el día anterior a abrir; el día de la apertura ya no es «por abrir» (CC6 · acordado con CC3)
      hechos.push(hecho('aun_no_existe', `${nombre} por abrir (todavía no atiende)`, vigente!.fuente, { vigente_hasta: fechaApertura ? diaAnterior(fechaApertura) : null }))
      // la fecha prevista la dijo el dueño: esa respuesta ES la fuente de este hecho
      if (fechaApertura && rApertura) hechos.push(hecho('apertura', `${nombre} abre el ${fechaApertura} · el dueño dijo «${rApertura.r.respuesta}»`, fuenteDeLaFecha(rApertura), { vigente_desde: fechaApertura }))
      else sin_dato.push({ oferta: clave, tipo: 'apertura', que_falta: `qué fecha tiene prevista para abrir${rApertura ? ` (el dueño dijo «${rApertura.r.respuesta}», sin fecha exacta)` : ''}` })
      if (!rApertura) huecos.push({ clase: 'falta', oferta: clave, tema: temaDeApertura(clave), pregunta: `¿Qué fecha tienes prevista para abrir ${nombre}?`, motivo: 'oferta por abrir sin fecha prevista' })
      continue
    }
    // abierta, o sin estado declarado pero registrada: la oferta existe hoy
    hechos.push(hecho('sede', valorBase, fuenteBase))
    if (estado === 'abierta') hechos.push(hecho('apertura', `${nombre} abierta${rApertura ? citaDeFecha(rApertura) : ''}`, vigente!.fuente, { vigente_desde: fechaApertura }))
    // sin estado declarado pero con la fecha del dueño: la apertura es su respuesta
    else if (fechaApertura && rApertura) hechos.push(hecho('apertura', `${nombre} atiende desde ${fechaApertura} · el dueño dijo «${rApertura.r.respuesta}»`, fuenteDeLaFecha(rApertura), { vigente_desde: fechaApertura }))
    if (!fechaApertura) sin_dato.push({ oferta: clave, tipo: 'apertura', que_falta: `desde qué fecha atiende${rApertura ? ` (el dueño dijo «${rApertura.r.respuesta}», sin fecha exacta)` : ''}` })
    if (!rApertura) huecos.push({ clase: 'falta', oferta: clave, tema: temaDeApertura(clave), pregunta: `¿Desde qué fecha atiende ${nombre}? Si no recuerdas el día exacto, dime el mes y el año.`, motivo: 'oferta sin fecha de inicio' })

    // ── zona de entrega: solo si la oferta entrega a domicilio
    const zona = mios.find((d) => CAMPOS_DE_ZONA.has(campo(d.campo)))
    const rZona = respuestaAlTema(temaDeZona(clave))
    if (zona) hechos.push(hecho('zona_de_entrega', `${nombre}: ${txt(zona.valor_texto)}`, fuenteDeDato(zona)))
    else if (rZona) hechos.push(hecho('zona_de_entrega', `${nombre}: según el dueño «${rZona.r.respuesta}»`, { origen: 'dueno', ref: `cerebro_fichas:${txt(rZona.f.id)}`, fecha: rZona.r.respondido }))
    else if (atencion && entregaADomicilio(txt(atencion.valor_texto))) {
      sin_dato.push({ oferta: clave, tipo: 'zona_de_entrega', que_falta: 'a qué zonas entrega a domicilio' })
      huecos.push({ clase: 'falta', oferta: clave, tema: temaDeZona(clave), pregunta: `¿A qué zonas entregas a domicilio desde ${nombre}?`, motivo: 'entrega a domicilio sin zona declarada' })
    }
  }
  // un hecho con fin ya pasado no se sirve como actual en la forma de la oficina (ver `formaDeLaOficina`); aquí se conserva entero
  return { hechos, sin_dato, huecos }
}

/** la forma de la OFICINA (CC4): lo vencido no llega como actual; el fin y la confianza baja viajan en el texto; lo que no consta llega como «no consta» */
export function formaDeLaOficina(h: HechosDelNegocio, ahora: Date): Array<{ que: string; valor: string; donde: string | null; desde: string | null; fuente: string | null }> {
  const hoy = ahora.toISOString().slice(0, 10)
  const actuales = h.hechos.filter((x) => !(x.vigente_hasta && x.vigente_hasta < hoy))
  return [
    ...actuales.map((x) => ({
      que: QUE_ES_CADA_TIPO[x.tipo],
      valor: `${x.valor}${x.tipo === 'cierre_retiro' && x.vigente_desde ? (x.vigente_desde <= hoy ? ` · cerrada desde ${x.vigente_desde}` : ` · cierra el ${x.vigente_desde}`) : ''}${x.tipo !== 'cierre_retiro' && x.vigente_desde && x.vigente_desde > hoy ? ` · AÚN NO VIGENTE (empieza el ${x.vigente_desde})` : ''}${x.vigente_hasta ? ` · hasta ${x.vigente_hasta}` : ''}${x.confianza === 'baja' ? ' (confianza baja)' : ''}`,
      donde: x.oferta,
      desde: x.vigente_desde,
      fuente: `${x.fuente}${x.fecha_de_la_fuente ? ` · dicho el ${x.fecha_de_la_fuente}` : ''}`,
    })),
    ...h.sin_dato.map((s) => ({ que: QUE_ES_CADA_TIPO[s.tipo], valor: `${NO_CONSTA}: ${s.que_falta}`, donde: s.oferta, desde: null, fuente: null })),
  ]
}

/** el bloque «Hechos del negocio» en texto: cada línea citada y con fecha; lo que no tiene fuente dice «no consta» */
export function bloqueDeHechosEnTexto(h: HechosDelNegocio, ahora: Date): string {
  const lineas = formaDeLaOficina(h, ahora).map((x) => `- ${x.donde ?? 'todo el negocio'} · ${x.que}: ${x.valor}${x.desde ? ` · desde ${x.desde}` : ''}${x.fuente ? ` · fuente: ${x.fuente}` : ''}`)
  return ['# HECHOS DEL NEGOCIO (por oferta; cada línea con su fuente y su fecha; «no consta» = no hay dato, no lo supongas)', ...lineas].join('\n')
}

export type LecturaDeHechosDelNegocio =
  | ({ estado: 'ok'; texto: string; oficina: { hechos: ReturnType<typeof formaDeLaOficina> } } & HechosDelNegocio)
  | { estado: 'no_se_pudo_leer'; detalle: string }

/** lee las fuentes de UN cliente y deriva sus hechos. Nunca lanza: si una lectura falla, lo dice */
export async function leerHechosDelNegocio(db: Db, clientId: string, ahora: Date = new Date()): Promise<LecturaDeHechosDelNegocio> {
  try {
    const [s, d, f, c] = await Promise.all([
      db.from('client_sedes').select('id, clave, ciudad').eq('client_id', clientId),
      // tablas chicas por cliente (decenas de filas): una lectura con tope, SIN orden (el orden lo pone el código; la carpeta del portero no se ordena por fecha en la base)
      db.from('client_sede_datos').select('id, sede_id, campo, valor_texto, fuente, fuente_ref, observado_en, retirada_en').eq('client_id', clientId).is('retirada_en', null).limit(TOPE_DE_LECTURA),
      db.from('cerebro_fichas').select('id, sede, observado_en, retirada_en, descartada, provenance_tag').eq('client_id', clientId).eq('clase', 'dato_del_dueno').is('retirada_en', null).limit(TOPE_DE_LECTURA),
      db.from('clients').select('config').eq('id', clientId).limit(1),
    ])
    const fallo = [['client_sedes', s.error], ['client_sede_datos', d.error], ['cerebro_fichas', f.error], ['clients', c.error]].find(([, e]) => e)
    if (fallo) return { estado: 'no_se_pudo_leer', detalle: `${fallo[0]}: ${String((fallo[1] as { message?: string })?.message ?? fallo[1]).slice(0, 160)}` }
    // recortada NO es completa: no se sirve como si lo fuera
    const recortada = [d, f].find((x) => ((x.data ?? []) as unknown[]).length >= TOPE_DE_LECTURA)
    if (recortada) return { estado: 'no_se_pudo_leer', detalle: `lectura recortada a ${TOPE_DE_LECTURA} filas: los hechos no estarían completos` }
    const h = hechosDelNegocio({ sedes: (s.data ?? []) as EntradaDeHechos['sedes'], datosDeSede: (d.data ?? []) as EntradaDeHechos['datosDeSede'], fichasDelDueno: (f.data ?? []) as EntradaDeHechos['fichasDelDueno'], config: obj(((c.data ?? []) as Fila[])[0]).config }, ahora)
    return { estado: 'ok', ...h, oficina: { hechos: formaDeLaOficina(h, ahora) }, texto: bloqueDeHechosEnTexto(h, ahora) }
  } catch (e) {
    return { estado: 'no_se_pudo_leer', detalle: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}
