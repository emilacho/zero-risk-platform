/**
 * LAS FILAS QUE QUEDARON ATRÁS SIN PRODUCIR (GO de Lenovo 10-nov 18:14Z · camino A aceptado 18:24Z · nace APAGADO).
 * Una fila validada (o lista para brief) cuya fecha ya pasó en la zona del cliente nunca entra a un lote (`lotesVencidos` solo toma `fecha >= hoy`): se perdía en silencio.
 * Reparto del trabajo (regla de Emilio «juzgar = agente; verificar exacto = código»):
 *   · DETECTAR es código (`filasPasadas`): la regla de fechas es exacta;
 *   · DECIDIR qué hacer con cada fila (reubicar, fusionar o descartar) es del agente (la mesa de reubicación de la oficina, un solo miembro: jefe-marketing);
 *   · VERIFICAR la propuesta es código (`verificarDecisiones`): fechas, plazos, días abiertos, máximo por día y dependencias. Lo que no cumple se DESCARTA con la razón del código
 *     (nunca se aplica a medias) y queda escrito en los avisos de la fila.
 * Este módulo es PURO: no lee la base ni la red.
 */
import { createHash } from 'node:crypto'
import { diaSemanaIso, diasEntre, esFechaIso, lunesDe, minutos, sumarDias } from './fechas'
import { leadDeFormato } from './lotes'
import type { Fila, FormatosPorRed, SedeInfo } from './tipos'

/** los estados de una fila que todavía esperan producirse (los mismos que toma el reparto en lotes) */
export const ESTADOS_SIN_PRODUCIR: readonly Fila['estado'][] = ['validada', 'lista_para_brief']
/** los estados que ya no cuentan para el máximo por día ni para las dependencias */
const ESTADOS_FUERA: readonly Fila['estado'][] = ['cancelada', 'perdio_su_fecha', 'descartada_sin_fuente', 'vencida_sin_brazo']
/** el tope de intentos de una misma decisión (misma huella): después, un solo aviso y nada más (sin bucle) */
export const MAX_INTENTOS_DE_REUBICACION = 2
export const PREFIJO_REUBICACION = 'reubicación: '

/** las filas sin producir cuya fecha es ANTERIOR a hoy (en la zona del cliente). Una fila de hoy o futura NUNCA entra. */
export function filasPasadas(filas: readonly Fila[], hoy: string): Fila[] {
  return filas.filter((f) => ESTADOS_SIN_PRODUCIR.includes(f.estado) && esFechaIso(f.fecha) && f.fecha < hoy)
}

/** 10-nov · 🟡 CC7 punto 2 · una fila que YA fue reubicada una vez (su aviso lo dice) no se vuelve a reubicar: si otra vez quedó atrás, el código la descarta sin agente */
export const MARCA_DE_REUBICADA = `${PREFIJO_REUBICACION}reubicada del `
export const yaReubicada = (f: Fila): boolean => (f.avisos ?? []).some((a) => typeof a === 'string' && a.startsWith(MARCA_DE_REUBICADA))
export const descarteDeSegundaVez = (f: Fila): { fila_id: string; aviso: string } => ({
  fila_id: f.id,
  aviso: `${PREFIJO_REUBICACION}perdió su fecha (${f.fecha}) · ya se había reubicado una vez y volvió a quedar atrás: se descarta sin otra decisión`,
})

/** la huella de una decisión: la campaña, la versión del calendario y las filas pasadas (ordenadas). La misma tanda de filas = la misma decisión. */
export const huellaDeReubicacion = (campanaId: string, version: number, filaIds: readonly string[]): string =>
  `${campanaId}:v${version}:${createHash('sha256').update([...filaIds].sort().join(',')).digest('hex').slice(0, 12)}`

export type Decision =
  | { fila_id: string; accion: 'reubicar'; fecha: string; razon: string }
  | { fila_id: string; accion: 'fusionar'; destino: string; razon: string }
  | { fila_id: string; accion: 'descartar'; razon: string }

/**
 * Lee la propuesta del agente: una línea por fila, `- <fila_id> · reubicar · AAAA-MM-DD · razón`, `- <fila_id> · fusionar · <fila destino> · razón` o `- <fila_id> · descartar · razón`.
 * Lectura de FORMATO, no juicio: lo que no tiene esa forma no es una decisión. Si una fila aparece dos veces, vale la primera.
 */
export function leerDecisiones(texto: string | null | undefined): Decision[] {
  const out: Decision[] = []
  const vistas = new Set<string>()
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.+)$/.exec(linea)
    if (!m) continue
    const partes = m[1].split(/\s+·\s+/).map((x) => x.trim())
    if (partes.length < 3) continue
    const [fila_id, accion0] = partes
    const accion = accion0.toLowerCase()
    if (!fila_id || vistas.has(fila_id)) continue
    let d: Decision | null = null
    if (accion === 'reubicar' && partes.length >= 4) d = { fila_id, accion, fecha: partes[2], razon: partes.slice(3).join(' · ') }
    else if (accion === 'fusionar' && partes.length >= 4) d = { fila_id, accion, destino: partes[2], razon: partes.slice(3).join(' · ') }
    else if (accion === 'descartar') d = { fila_id, accion, razon: partes.slice(2).join(' · ') }
    if (!d) continue
    vistas.add(fila_id)
    out.push(d)
  }
  return out
}

export interface ContextoDeReubicacion {
  hoy: string
  campana: { fecha_inicio: string; fecha_fin: string }
  /** TODAS las filas de la versión vigente del calendario (las pasadas incluidas) */
  filas: readonly Fila[]
  formatos: FormatosPorRed
  sedes: readonly SedeInfo[]
}

/** lo que se aplica a cada fila pasada: el cambio exacto y la nota que queda en sus avisos */
export type Cambio =
  | { fila_id: string; tipo: 'reubicar'; fecha: string; semana: number; dia_semana: number; aviso: string }
  | { fila_id: string; tipo: 'fusionar'; destino: string; aviso: string; aviso_destino: string }
  | { fila_id: string; tipo: 'descartar'; aviso: string; rechazo: string | null }

const semanaDe = (fechaInicio: string, fecha: string): number => Math.floor(diasEntre(lunesDe(fechaInicio), fecha) / 7) + 1
const activa = (f: Fila) => !ESTADOS_FUERA.includes(f.estado)

/** por qué una fecha nueva NO vale para esta fila; null si vale. `ocupacion` cuenta lo ya puesto en cada día por red y formato (incluye lo reubicado antes en esta misma decisión). */
function razonContraLaFecha(f: Fila, fecha: string, x: ContextoDeReubicacion, ocupacion: Map<string, number>, fechaFinal: Map<string, string>): string | null {
  if (!esFechaIso(fecha)) return `«${fecha}» no es una fecha AAAA-MM-DD`
  if (fecha < x.campana.fecha_inicio || fecha > x.campana.fecha_fin) return `el ${fecha} cae fuera de la campaña (${x.campana.fecha_inicio} a ${x.campana.fecha_fin})`
  const lead = leadDeFormato(x.formatos, f)
  const primerDia = sumarDias(x.hoy, lead)
  if (fecha < primerDia) return `el ${fecha} no alcanza el plazo de producción: ${f.formato} necesita ${lead} días desde hoy (${x.hoy}); el primer día posible es el ${primerDia}`
  if (f.requiere_abierto && x.sedes.length > 0) {
    const sede = x.sedes.find((s) => s.clave === f.sede)
    if (sede?.horario) {
      const tramos = sede.horario[diaSemanaIso(fecha)] ?? []
      if (tramos.length === 0) return `la pieza exige local abierto y la sede ${sede.clave} está cerrada ese día de la semana (${fecha})`
      const hora = minutos(f.hora)
      if (hora != null && !tramos.some((t) => { const a = minutos(t.abre), c = minutos(t.cierra); return a != null && c != null && hora >= a && hora <= c })) return `la hora ${f.hora} cae fuera del horario de la sede ${sede.clave} el ${fecha}`
    }
  }
  const max = (x.formatos[f.red] ?? []).find((y) => y.formato === f.formato)?.max_por_dia
  const clave = `${fecha}|${f.red}|${f.formato}`
  if (typeof max === 'number' && (ocupacion.get(clave) ?? 0) >= max) return `el ${fecha} ya tiene ${ocupacion.get(clave)} de ${f.formato} en ${f.red} (máximo ${max} por día)`
  for (const dep of f.depende_de) {
    const fd = fechaFinal.get(dep)
    if (fd && fd > fecha) return `depende de ${dep}, que sale el ${fd}: no puede salir antes`
  }
  for (const otra of x.filas) {
    if (otra.id === f.id || !activa(otra) || !otra.depende_de.includes(f.id)) continue
    // una fila pasada que todavía no se decidió no frena: cuando le toque, su propia dependencia se verifica contra esta fecha
    const fo = fechaFinal.get(otra.id)
    if (fo && fo < fecha) return `${otra.id} depende de esta fila y sale el ${fo}: esta no puede salir después`
  }
  return null
}

/**
 * Verifica la propuesta del agente contra las reglas exactas y devuelve UN cambio por cada fila pasada (las que el agente no decidió o decidió mal se descartan con la razón del código).
 * Nunca toca una fila que no sea pasada: una decisión sobre una fila de hoy o futura se ignora (y lo dice el rechazo).
 */
export function verificarDecisiones(pasadas: readonly Fila[], decisiones: readonly Decision[], x: ContextoDeReubicacion): { cambios: Cambio[]; ignoradas: string[] } {
  const idsPasadas = new Set(pasadas.map((f) => f.id))
  const ignoradas = decisiones.filter((d) => !idsPasadas.has(d.fila_id)).map((d) => `${d.fila_id}: no es una fila pasada sin producir (no se toca)`)
  const porFila = new Map(decisiones.filter((d) => idsPasadas.has(d.fila_id)).map((d) => [d.fila_id, d]))
  const ocupacion = new Map<string, number>()
  for (const f of x.filas) if (activa(f) && !idsPasadas.has(f.id)) ocupacion.set(`${f.fecha}|${f.red}|${f.formato}`, (ocupacion.get(`${f.fecha}|${f.red}|${f.formato}`) ?? 0) + 1)
  // la fecha final de cada fila (las pasadas que se reubican la cambian; las demás quedan)
  const fechaFinal = new Map(x.filas.filter(activa).map((f) => [f.id, f.fecha]))
  for (const id of idsPasadas) fechaFinal.delete(id)
  const cambios: Cambio[] = []
  const descartar = (f: Fila, rechazo: string | null, razon: string): Cambio => ({ fila_id: f.id, tipo: 'descartar', rechazo, aviso: `${PREFIJO_REUBICACION}perdió su fecha (${f.fecha}) · ${rechazo ? `la propuesta no cumple: ${rechazo}` : razon}` })
  // en orden de fecha: las dependencias se resuelven en el orden en que salen
  for (const f of [...pasadas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))) {
    const d = porFila.get(f.id)
    if (!d) { cambios.push(descartar(f, 'el agente no decidió esta fila', '')); continue }
    if (!d.razon.trim()) { cambios.push(descartar(f, `la decisión «${d.accion}» no trae su razón`, '')); continue }
    if (d.accion === 'descartar') { cambios.push(descartar(f, null, d.razon)); continue }
    if (d.accion === 'reubicar') {
      const no = razonContraLaFecha(f, d.fecha, x, ocupacion, fechaFinal)
      if (no) { cambios.push(descartar(f, no, '')); continue }
      const clave = `${d.fecha}|${f.red}|${f.formato}`
      ocupacion.set(clave, (ocupacion.get(clave) ?? 0) + 1)
      fechaFinal.set(f.id, d.fecha)
      cambios.push({ fila_id: f.id, tipo: 'reubicar', fecha: d.fecha, semana: semanaDe(x.campana.fecha_inicio, d.fecha), dia_semana: diaSemanaIso(d.fecha), aviso: `${PREFIJO_REUBICACION}reubicada del ${f.fecha} al ${d.fecha} · ${d.razon}` })
      continue
    }
    const destino = x.filas.find((y) => y.id === d.destino)
    const no = !destino ? `la fila destino «${d.destino}» no existe en el calendario`
      : idsPasadas.has(destino.id) ? `la fila destino ${destino.id} también quedó atrás (no es futura)`
      : !ESTADOS_SIN_PRODUCIR.includes(destino.estado) ? `la fila destino ${destino.id} no está validada (está «${destino.estado}»)`
      : destino.fecha < x.hoy ? `la fila destino ${destino.id} no es futura (${destino.fecha})`
      : null
    if (no || !destino) { cambios.push(descartar(f, no, '')); continue }
    cambios.push({ fila_id: f.id, tipo: 'fusionar', destino: destino.id, aviso: `${PREFIJO_REUBICACION}fusionada con ${destino.id} (${destino.fecha}) · ${d.razon}`, aviso_destino: `${PREFIJO_REUBICACION}absorbe a ${f.id} (era del ${f.fecha}) · ${d.razon}` })
  }
  return { cambios, ignoradas }
}

/** el marco que lee el agente: lo pasado, lo que viene, los plazos, los horarios y la forma exacta de la respuesta */
export function marcoDeReubicacion(pasadas: readonly Fila[], x: ContextoDeReubicacion, clienteNombre: string): string {
  const linea = (f: Fila) => `- ${f.id} · ${f.fecha} · ${f.red} · ${f.formato} · pilar: ${f.pilar ?? '—'} · tema: ${f.tema ?? '—'} · idea: ${f.idea_ref ?? '—'} · sede: ${f.sede ?? '—'}${f.requiere_abierto ? ' · exige local abierto' : ''}${f.depende_de.length ? ` · depende de: ${f.depende_de.join(', ')}` : ''} · plazo de producción: ${leadDeFormato(x.formatos, f)} días`
  const futuras = x.filas.filter((f) => activa(f) && f.fecha >= x.hoy && !pasadas.some((p) => p.id === f.id)).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const maximos = Object.entries(x.formatos).flatMap(([red, fs]) => fs.filter((y) => typeof y.max_por_dia === 'number').map((y) => `- ${red} · ${y.formato}: máximo ${y.max_por_dia} por día`))
  const horarios = x.sedes.map((s) => `- ${s.clave}: ${s.horario ? Object.entries(s.horario).map(([d, t]) => `día ${d} ${(t ?? []).map((y) => `${y.abre}–${y.cierra}`).join(', ') || 'cerrado'}`).join(' · ') : 'sin horario conocido'}`)
  return [
    `# Filas del calendario de ${clienteNombre} que quedaron atrás sin producir`,
    `Hoy es ${x.hoy} (zona del cliente). La campaña va del ${x.campana.fecha_inicio} al ${x.campana.fecha_fin}.`,
    '', '## Las filas pasadas (decide cada una)', ...pasadas.map(linea),
    '', '## Las filas que vienen (no se tocan; sirven para fusionar o para no amontonar)', ...(futuras.length ? futuras.map(linea) : ['- (ninguna)']),
    '', '## Máximos por día', ...(maximos.length ? maximos : ['- (sin máximos declarados)']),
    '', '## Horarios de las sedes (día 1 = lunes)', ...(horarios.length ? horarios : ['- (el negocio no tiene sedes)']),
    '', '## Cómo responder',
    'Por cada fila pasada, UNA línea con una de estas formas (la razón es obligatoria):',
    '- <fila_id> · reubicar · AAAA-MM-DD · razón',
    '- <fila_id> · fusionar · <fila_id destino de las que vienen> · razón',
    '- <fila_id> · descartar · razón',
    'Una fecha nueva tiene que caer dentro de la campaña, a partir de hoy más el plazo de producción de su formato, en un día abierto si exige local, sin pasar el máximo por día y sin romper dependencias. El código lo verifica: lo que no cumpla se descarta.',
  ].join('\n')
}
