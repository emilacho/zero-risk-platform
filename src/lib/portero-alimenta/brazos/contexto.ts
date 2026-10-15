/**
 * BRAZO · CONTEXTO (feriados y temporada por país y zona) · US$ 0 · PURO · sin cliente.
 * Es un CATÁLOGO que alguien mantiene (dato, no lógica): se amplía una línea por país o por temporada. No hay API: el calendario de feriados de un país es corto y lo fija la ley;
 * una API gratuita agregaría una dependencia y (el caso del clima) una licencia no comercial. Clima y oleaje: FUERA por decisión de Emilio.
 *
 * Qué NO hace, a propósito:
 *   · no calcula «puentes»: en Ecuador el gobierno traslada algunos feriados al lunes o al viernes por decreto cada año; el catálogo dice la FECHA LEGAL y lo declara en cada ficha;
 *   · no inventa fechas de vacaciones escolares: las ventanas son TÍPICAS y cada ficha dice que las fija el ministerio cada año.
 * Las fichas son de zona: `client_id` = `zona:<país>` (nunca un cliente), `alcance` = zona, origen tercero.
 */
import { idDeZona } from '../../cerebro/zona'
import type { FichaDeBrazo, ResultadoDeUnBrazo } from './tipos'

export interface FeriadoFijo { mes: number; dia: number; nombre: string }
export interface FeriadoMovil { desdePascua: number; nombre: string }
export interface TemporadaDeZona {
  id: string
  nombre: string
  desde: { mes: number; dia: number }
  hasta: { mes: number; dia: number }
  /** palabras (sin tildes, minúsculas) que ubican una zona; `null` = todo el país */
  zonas: string[] | null
  /** familias de rubro a las que más les sirve (informativo); `null` = todas */
  rubros: string[] | null
  texto: string
}
export interface PaisDelCatalogo {
  nombre: string
  feriados_fijos: FeriadoFijo[]
  feriados_moviles: FeriadoMovil[]
  temporadas: TemporadaDeZona[]
  aviso_de_feriados: string
}

export const CATALOGO_DE_CONTEXTO: Record<string, PaisDelCatalogo> = {
  ec: {
    nombre: 'Ecuador',
    feriados_fijos: [
      { mes: 1, dia: 1, nombre: 'Año Nuevo' },
      { mes: 5, dia: 1, nombre: 'Día del Trabajo' },
      { mes: 5, dia: 24, nombre: 'Batalla de Pichincha' },
      { mes: 8, dia: 10, nombre: 'Primer Grito de Independencia' },
      { mes: 10, dia: 9, nombre: 'Independencia de Guayaquil' },
      { mes: 11, dia: 2, nombre: 'Día de Difuntos' },
      { mes: 11, dia: 3, nombre: 'Independencia de Cuenca' },
      { mes: 12, dia: 25, nombre: 'Navidad' },
    ],
    feriados_moviles: [
      { desdePascua: -48, nombre: 'Carnaval (lunes)' },
      { desdePascua: -47, nombre: 'Carnaval (martes)' },
      { desdePascua: -2, nombre: 'Viernes Santo' },
    ],
    aviso_de_feriados: 'Fecha legal del feriado. El gobierno puede trasladarlo al lunes o al viernes por decreto: la fecha de descanso real se confirma cada año.',
    temporadas: [
      { id: 'vacaciones_escolares_costa', nombre: 'Vacaciones escolares de la Costa', desde: { mes: 2, dia: 1 }, hasta: { mes: 3, dia: 31 }, zonas: ['costa', 'guayas', 'santa elena', 'manabi', 'esmeraldas', 'el oro', 'los rios', 'galapagos'], rubros: ['comida', 'alojamiento', 'turismo'],
        texto: 'Ventana típica del régimen Costa: hay más familias viajando y comiendo fuera. Las fechas exactas las fija el ministerio de educación cada año.' },
      { id: 'vacaciones_escolares_sierra', nombre: 'Vacaciones escolares de la Sierra y Amazonía', desde: { mes: 7, dia: 1 }, hasta: { mes: 8, dia: 31 }, zonas: ['sierra', 'pichincha', 'azuay', 'imbabura', 'cotopaxi', 'tungurahua', 'chimborazo', 'loja', 'amazonia', 'napo', 'pastaza'], rubros: ['comida', 'alojamiento', 'turismo'],
        texto: 'Ventana típica del régimen Sierra-Amazonía; muchas familias de la Sierra bajan a la Costa. Las fechas exactas las fija el ministerio de educación cada año.' },
      { id: 'ballenas_jorobadas', nombre: 'Temporada de ballenas jorobadas', desde: { mes: 6, dia: 15 }, hasta: { mes: 9, dia: 30 }, zonas: ['santa elena', 'manabi', 'olon', 'montanita', 'puerto lopez', 'salinas', 'ayangue', 'machalilla'], rubros: ['turismo', 'alojamiento', 'comida'],
        texto: 'Avistamiento en la costa central del Pacífico ecuatoriano (de junio a septiembre, con el pico en julio y agosto): más visitantes en la zona.' },
      { id: 'lluvias_costa', nombre: 'Época lluviosa de la Costa', desde: { mes: 1, dia: 1 }, hasta: { mes: 5, dia: 31 }, zonas: ['costa', 'guayas', 'santa elena', 'manabi', 'esmeraldas', 'el oro', 'los rios'], rubros: null,
        texto: 'Época de lluvias y calor en la Costa (aprox. enero a mayo): la lluvia mueve el reparto y la salida a comer.' },
    ],
  },
}

const DIA_MS = 86_400_000
const dos = (n: number) => String(n).padStart(2, '0')
const fechaIso = (d: Date) => `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d))
const NOMBRE_DEL_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const NOMBRE_DEL_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const lindaFecha = (d: Date) => `${NOMBRE_DEL_DIA[d.getUTCDay()]} ${d.getUTCDate()} de ${NOMBRE_DEL_MES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`

/** Domingo de Pascua (calendario gregoriano · algoritmo anónimo) */
export function pascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return utc(anio, mes, dia)
}

export interface FeriadoDelAnio { fecha: string; nombre: string; fechaDate: Date }
export function feriadosDe(pais: string, anio: number): FeriadoDelAnio[] {
  const c = CATALOGO_DE_CONTEXTO[pais.toLowerCase()]
  if (!c) return []
  const p = pascua(anio)
  const todos = [
    ...c.feriados_fijos.map((f) => ({ d: utc(anio, f.mes, f.dia), nombre: f.nombre })),
    ...c.feriados_moviles.map((f) => ({ d: new Date(p.getTime() + f.desdePascua * DIA_MS), nombre: f.nombre })),
  ]
  return todos.map((x) => ({ fecha: fechaIso(x.d), nombre: x.nombre, fechaDate: x.d })).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
}

export interface OpcionesDeContexto { pais: string; ahora: Date; /** cuántos días hacia adelante se fichan (por omisión 120) */ horizonteDias?: number }

/** las fichas de zona del horizonte: feriados que caen en él y temporadas que lo cruzan. Pura: devuelve fichas, no escribe. */
export function fichasDeContexto(o: OpcionesDeContexto): ResultadoDeUnBrazo {
  const pais = o.pais.trim().toLowerCase()
  const c = CATALOGO_DE_CONTEXTO[pais]
  if (!c) return { brazo: 'contexto', estado: 'sin_material', detalle: `el catálogo no tiene el país «${o.pais}»`, fichas: [], declarado: [`sin catálogo de contexto para «${o.pais}»: no se fichó nada`] }
  const hoy = utc(o.ahora.getUTCFullYear(), o.ahora.getUTCMonth() + 1, o.ahora.getUTCDate())
  const fin = new Date(hoy.getTime() + (o.horizonteDias ?? 120) * DIA_MS)
  const iso = o.ahora.toISOString()
  const cid = idDeZona(pais)
  const fichas: FichaDeBrazo[] = []
  for (const anio of [hoy.getUTCFullYear(), hoy.getUTCFullYear() + 1]) {
    for (const f of feriadosDe(pais, anio)) {
      if (f.fechaDate < hoy || f.fechaDate > fin) continue
      const contenido = `${f.nombre} · ${lindaFecha(f.fechaDate)} (${c.nombre}). ${c.aviso_de_feriados}`
      fichas.push({
        brazo: 'contexto', alcance: 'zona', client_id: cid, ref: `brazo:contexto:${pais}:feriado:${f.fecha}`, atributo: `contexto:${pais}:feriado:${f.fecha}`, clase: 'contexto_feriado',
        titulo: `Feriado · ${f.nombre} · ${f.fecha}`, contenido, origen: 'tercero', fuente_url: null, fecha_fuente: f.fecha, observado_en: iso,
        vigente_hasta: new Date(f.fechaDate.getTime() + DIA_MS).toISOString(), decision: 'reemplaza', sobre: c.nombre,
      })
    }
    for (const t of c.temporadas) {
      const desde = utc(anio, t.desde.mes, t.desde.dia), hasta = utc(anio, t.hasta.mes, t.hasta.dia)
      if (hasta < hoy || desde > fin) continue
      const donde = t.zonas ? `zonas: ${t.zonas.slice(0, 6).join(', ')}` : 'todo el país'
      const para = t.rubros ? `útil sobre todo para: ${t.rubros.join(', ')}` : 'útil para cualquier rubro'
      fichas.push({
        brazo: 'contexto', alcance: 'zona', client_id: cid, ref: `brazo:contexto:${pais}:temporada:${t.id}:${anio}`, atributo: `contexto:${pais}:temporada:${t.id}:${anio}`, clase: 'contexto_temporada',
        titulo: `Temporada · ${t.nombre} · ${anio}`, contenido: `${t.nombre} · del ${lindaFecha(desde)} al ${lindaFecha(hasta)} (${c.nombre}; ${donde}; ${para}). ${t.texto}`,
        origen: 'tercero', fuente_url: null, fecha_fuente: fechaIso(desde), observado_en: iso, vigente_hasta: new Date(hasta.getTime() + DIA_MS).toISOString(), decision: 'reemplaza', sobre: c.nombre,
      })
    }
  }
  return { brazo: 'contexto', estado: fichas.length ? 'listo' : 'sin_material', fichas, declarado: ['feriados: fecha legal, los traslados por decreto no se calculan', 'temporadas: ventanas típicas del catálogo, no fechas oficiales del año'] }
}
