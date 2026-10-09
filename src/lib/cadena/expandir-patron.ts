/**
 * Expansión del patrón semanal y fusión con lo que el agente escribe (diseño v2 §6, §10.5).
 *
 * El agente NUNCA escribe una fecha ISO, un total ni un porcentaje: da `semana + día + hora`. Este módulo pone la fecha
 * y arma el panorama de 12 semanas SIN modelo (filas `esquema`, sin tema); las tandas de 4 semanas se materializan después.
 */
import { diaDeCampana, fechaDeFila } from './fechas'
import type { Ajuste, Estrategia, Fila, FormatosPorRed, PiezaAgente, TandaAgente } from './tipos'

export interface CampanaFechas { fecha_inicio: string; fecha_fin: string }

export function idDeFila(semana: number, dia: number, slot: string): string {
  return `s${semana}-d${dia}-${slot}`
}

function esVideo(formatos: FormatosPorRed, red: string, formato: string): boolean {
  const f = (formatos[red] ?? []).find((x) => x.formato === formato)
  return f ? f.produccion === 'espera_brazo' : false
}

/** El panorama: una fila `esquema` por cada slot del patrón y cada semana pedida, dentro de las fechas de la campaña. */
export function expandirPatron(e: Pick<Estrategia, 'patron_semanal' | 'piezas_fijas'>, c: CampanaFechas, semanas: number[], tanda: number, formatos: FormatosPorRed): Fila[] {
  const filas: Fila[] = []
  for (const semana of semanas) {
    for (const s of e.patron_semanal) {
      const fecha = fechaDeFila(c.fecha_inicio, semana, s.dia_semana)
      if (fecha < c.fecha_inicio || fecha > c.fecha_fin) continue
      const fija = e.piezas_fijas.find((p) => p.semana === semana && p.slot === s.slot)
      filas.push({
        id: idDeFila(semana, s.dia_semana, s.slot),
        tanda, semana, dia_semana: s.dia_semana, fecha,
        hora: s.hora, red: s.red, formato: s.formato, pilar: s.pilar,
        tema: fija ? fija.tema : null,
        sede: s.sede || null,
        requiere_abierto: s.requiere_abierto,
        depende_de: [], datos: [], pendientes: [],
        pieza_fija: fija ? fija.clave : null,
        origen: 'patron',
        estado: esVideo(formatos, s.red, s.formato) ? 'espera_video' : 'esquema',
        avisos: [],
      })
    }
  }
  return filas
}

export interface Fusion { filas: Fila[]; ignoradas: string[] }

/**
 * Fusiona lo que el agente escribió con el esquema de la tanda:
 *  · la pieza que cae en un slot del patrón lo rellena (tema, datos…); la fecha SIEMPRE la pone el código;
 *  · una pieza fuera del patrón entra como fila `agente` (la regla de V08 decide si sobra);
 *  · `ajustes_al_patron` con `omitir` quita el slot de esa semana; `mover` no se aplica solo (la pieza trae su día);
 *  · el estado de video lo decide la tabla de formatos, nunca el agente (V20).
 */
export function fusionarTanda(esquema: Fila[], t: TandaAgente, e: Pick<Estrategia, 'piezas_fijas'>, c: CampanaFechas, tanda: number, formatos: FormatosPorRed): Fusion {
  const ignoradas: string[] = []
  const omitidos = new Set((t.ajustes_al_patron ?? []).filter((a: Ajuste) => a.accion === 'omitir').map((a) => `${a.semana}|${a.slot}`))
  const porId = new Map<string, Fila>()
  for (const f of esquema) {
    const slot = f.id.replace(/^s\d+-d\d+-/, '')
    if (omitidos.has(`${f.semana}|${slot}`)) { ignoradas.push(`omitido por ajuste: ${f.id}`); continue }
    porId.set(f.id, { ...f })
  }
  for (const p of t.piezas ?? []) {
    const id = idDeFila(p.semana, p.dia_semana, p.slot)
    const fecha = fechaDeFila(c.fecha_inicio, p.semana, p.dia_semana)
    const fija = (e.piezas_fijas ?? []).find((x) => x.semana === p.semana && x.slot === p.slot)
    const base: Fila = porId.get(id) ?? {
      id, tanda, semana: p.semana, dia_semana: p.dia_semana, fecha, hora: null, red: p.red, formato: p.formato, pilar: null, tema: null,
      sede: null, requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'propuesta', avisos: [],
    }
    porId.set(id, aplicarPieza(base, p, fija?.clave ?? null, fecha, formatos))
  }
  const filas = [...porId.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.id.localeCompare(b.id))
  return { filas, ignoradas }
}

function aplicarPieza(base: Fila, p: PiezaAgente, fijaClave: string | null, fecha: string, formatos: FormatosPorRed): Fila {
  return {
    ...base,
    fecha, // SIEMPRE derivada por el código
    hora: p.hora || base.hora,
    red: p.red || base.red,
    formato: p.formato || base.formato,
    pilar: p.pilar || base.pilar,
    tema: p.tema,
    sede: p.sede || base.sede,
    requiere_abierto: !!p.requiere_abierto,
    depende_de: Array.isArray(p.depende_de) ? p.depende_de : [],
    datos: Array.isArray(p.datos) ? p.datos : [],
    pendientes: Array.isArray(p.pendientes) ? p.pendientes : [],
    pieza_fija: p.pieza_fija || fijaClave || base.pieza_fija,
    estado: esVideo(formatos, p.red || base.red, p.formato || base.formato) ? 'espera_video' : 'propuesta',
  }
}

/** Día de campaña de cada fila (para V11/V12). */
export function diaDeFila(c: CampanaFechas, f: Pick<Fila, 'fecha'>): number {
  return diaDeCampana(c.fecha_inicio, f.fecha)
}
