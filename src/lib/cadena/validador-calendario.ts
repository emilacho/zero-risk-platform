/**
 * Validador del CALENDARIO · código puro, sin modelo (diseño v2 §5, §10.2).
 * Entra la tanda ya fusionada y fechada por el código; sale la lista de hallazgos. No lee la base: el flujo le pasa los insumos.
 * 34 chequeos en total entre estrategia y calendario (V19 RETIRADO: nada bloquea la apertura por fechas).
 *
 * Alcance de la corrección (§10.4): `fila` (se parchea sola) o `tanda` (frecuencia y reparto son del conjunto).
 */
import { hallarAfirmaciones, hallarFechasEnTema, hallarVoseo, type LexicoAfirmaciones } from './afirmaciones'
import { diaDeCampana, diaSemanaIso, fechaDeFila, minutos, sumarDias } from './fechas'
import { alcanza, nivelEfectivo, resolverDato, type Candidato } from './fuentes'
import { normalizar } from './texto'
import type { Ajuste, Alcance, Clase, DatoDeterminado, Estrategia, Fila, FormatosPorRed, Hallazgo, Referencia, SedeInfo, Severidad } from './tipos'

export interface FechaEspecialVerificada {
  id: string
  fecha: string
  nombre: string
  tipo: string
  ambito: string
  /** `local` si vale solo para un ámbito (ciudad/región); `nacional` para todo el país */
  alcance: 'nacional' | 'local'
  estado: 'verificada' | 'pendiente'
}

export interface InsumosCalendario {
  campana: { fecha_inicio: string; fecha_fin: string; tanda: number; semanas: number[] }
  estrategia: Estrategia
  planTexto: string
  formatos: FormatosPorRed
  sedes: SedeInfo[]
  referencias: Referencia[]
  clientId: string
  /** fecha de hoy (YYYY-MM-DD): para decir «viejo» a lo observado hace más de 90 días */
  ahora: string
  filas: Fila[]
  filasPrevias?: Fila[]
  ajustes?: Ajuste[]
  /** SOLO las de los tipos que el cliente declaró; lista vacía = no hay chequeo de fechas especiales más allá de la regla general */
  fechasEspeciales?: FechaEspecialVerificada[]
  forbiddenWords?: string[]
  /** nombres propios que NO son un origen de producto (sedes, nombre del negocio) */
  conocidos?: string[]
  /** léxico de afirmaciones leído de cadena_config.lexico_afirmaciones (dato, no código); sin él, la base del idioma */
  lexico?: LexicoAfirmaciones
  totalesDeclarados?: { total_filas?: number; por_pilar?: Record<string, number> }
  /** candidatos por tipo de dato (p. ej. «horario»): activan C01–C04 */
  candidatosPorDato?: Record<string, Candidato[]>
  toleranciaAperturaMin?: number
}

const ALCANCE: Record<string, Alcance> = {
  V01: 'tanda', V02: 'fila', V03: 'fila', V04: 'fila', V05: 'fila', V06: 'fila', V07: 'fila', V07b: 'fila', V08: 'tanda', V09: 'tanda', V10: 'tanda',
  V11: 'tanda', V12: 'tanda', V13: 'fila', V14: 'fila', V15: 'fila', V16: 'fila', V17: 'tanda', V18: 'tanda', V20: 'fila', V22: 'fila',
  C01: 'fila', C02: 'fila', C03: 'fila', C04: 'fila',
}

/** Chequeos cuyo fallo significa «falta un dato con fuente»: tras la única corrección, la FILA sale o se cambia (cero contacto con el cliente). */
export const CHEQUEOS_DE_DATO_FALTANTE = new Set(['V06', 'V07', 'V14', 'V16', 'V22', 'C02'])

function h(chequeo: string, severidad: Severidad, f: Pick<Fila, 'id'> | null, que: string, contra: string, propuesta: string, donde?: string): Hallazgo {
  return {
    chequeo, severidad, fila_id: f?.id ?? null, alcance: ALCANCE[chequeo] ?? 'fila',
    ficha: { que, donde: donde ?? (f ? `fila ${f.id}` : 'tanda'), contra_que: contra, gravedad: severidad, propuesta },
  }
}

/** Clase de un formato para contar frecuencia: feed, historias o anuncios. */
export function claseDeFormato(formato: string): 'feed' | 'historias' | 'anuncios' {
  if (/^anuncio/.test(formato)) return 'anuncios'
  if (/^(historia|estado)/.test(formato)) return 'historias'
  return 'feed'
}

const DIAS: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 }
const PALABRAS_FECHA_ESPECIAL = /\b(feriado|festivo|puente|temporada (?:alta|baja)|vacaciones|black friday|cyber ?monday|navidad|ano nuevo|dia (?:de la madre|del padre|del nino|de la mujer|del trabajo|de san valentin|de los difuntos|de la independencia)|san valentin|carnaval|semana santa|halloween|fiestas (?:patrias|de))\b/

const activa = (f: Fila) => f.estado !== 'cancelada' && f.estado !== 'descartada_sin_fuente'
const materializada = (f: Fila) => f.estado !== 'esquema'
/** lo que se valida: materializada y viva (una fila que salió o se canceló ya no se juzga) */
const validable = (f: Fila) => materializada(f) && activa(f)

export function validarCalendario(ins: InsumosCalendario): Hallazgo[] {
  const out: Hallazgo[] = []
  const { campana, estrategia } = ins
  const filas = ins.filas
  const previas = ins.filasPrevias ?? []
  const todas = [...previas, ...filas]
  const porId = new Map(todas.map((f) => [f.id, f]))
  const refPorId = new Map(ins.referencias.map((r) => [r.id, r]))
  const sedesClaves = ins.sedes.map((s) => s.clave)
  const conocidos = [...(ins.conocidos ?? []), ...sedesClaves, ...ins.sedes.map((s) => s.nombre ?? '').filter(Boolean)]
  const excluidas = new Set(estrategia.excluidos.map((x) => x.red))
  const canalesActivos = new Map(estrategia.canales.filter((c) => c.rol !== 'no').map((c) => [c.red, c]))

  // ─── V01 · cobertura de la tanda: sin esquemas sin tema, sin filas fuera de las semanas, sin solapes con la tanda anterior
  for (const f of filas) {
    if (f.estado === 'esquema') out.push(h('V01', 'bloquea', f, `el slot ${f.id} quedó sin tema`, 'patrón semanal de la estrategia', 'escribir el tema de ese slot u omitirlo con un ajuste motivado'))
    else if (f.tanda === campana.tanda && !campana.semanas.includes(f.semana)) out.push(h('V01', 'bloquea', f, `la fila cae en la semana ${f.semana}, fuera de la tanda (${campana.semanas.join(', ')})`, 'semanas de la tanda', 'ponerla en una semana de la tanda'))
  }
  const idsPrevios = new Set(previas.map((f) => f.id))
  for (const f of filas) if (idsPrevios.has(f.id)) out.push(h('V01', 'bloquea', f, 'la fila se solapa con una de la tanda anterior', 'tanda anterior', 'quitar la repetida'))
  for (const s of campana.semanas) {
    const hayPatron = estrategia.patron_semanal.length > 0
    if (hayPatron && !filas.some((f) => f.semana === s) && !(ins.ajustes ?? []).some((a) => a.semana === s)) {
      out.push(h('V01', 'bloquea', null, `la semana ${s} no tiene ninguna fila`, 'la tanda cubre todas sus semanas', 'cubrir la semana', `semana ${s}`))
    }
  }

  for (const f of filas.filter(validable)) {
    // ─── V02 · un solo formato, de la lista
    if (/[\/+,;]|\s(?:o|y|u|e|and)\s/i.test(f.formato)) out.push(h('V02', 'bloquea', f, `el formato «${f.formato}» no es uno solo`, 'un solo formato por fila', 'elegir UN formato'))
    else if (!(ins.formatos[f.red] ?? []).some((x) => x.formato === f.formato)) out.push(h('V02', 'bloquea', f, `el formato «${f.formato}» no existe para ${f.red}`, 'cadena_formatos_por_red', 'usar un formato de la lista de esa red'))

    // ─── V03 · el día que dice el tema no contradice la fila
    const nTema = normalizar(f.tema ?? '')
    for (const [nombre, n] of Object.entries(DIAS)) {
      if (new RegExp(`\\b(?:este|el|cada|todos los)\\s+${nombre}\\b`).test(nTema) && n !== f.dia_semana) {
        out.push(h('V03', 'aviso', f, `el tema habla de «${nombre}» pero la fila es el día ${f.dia_semana}`, 'día derivado de la fecha', 'alinear el tema con el día o quitar el día del tema'))
        break
      }
    }

    // ─── V04 · fecha dentro de la campaña y la que deriva el código
    if (f.fecha < campana.fecha_inicio || f.fecha > campana.fecha_fin) out.push(h('V04', 'bloquea', f, `la fecha ${f.fecha} cae fuera de la campaña (${campana.fecha_inicio} → ${campana.fecha_fin})`, 'fecha de inicio guardada', 'mover la pieza dentro de la campaña'))
    if (f.fecha !== fechaDeFila(campana.fecha_inicio, f.semana, f.dia_semana)) out.push(h('V04', 'bloquea', f, `la fecha ${f.fecha} no es la que deriva el código de semana ${f.semana} día ${f.dia_semana}`, 'fecha derivada', 'no escribir fechas: el código las pone'))

    // ─── V05 · red conocida, no excluida y prevista por la estrategia
    if (!ins.formatos[f.red]) out.push(h('V05', 'bloquea', f, `la red «${f.red}» no existe en los formatos permitidos`, 'cadena_formatos_por_red', 'usar una red conocida'))
    else if (excluidas.has(f.red)) out.push(h('V05', 'bloquea', f, `la red ${f.red} está excluida por el plan`, 'excluidos de la estrategia', 'quitar la pieza o cambiar de red'))
    else if (!canalesActivos.has(f.red)) out.push(h('V05', 'bloquea', f, `la red ${f.red} no es un canal de la estrategia`, 'canales de la estrategia', 'usar un canal de la estrategia'))
    else {
      const c = canalesActivos.get(f.red)!
      if (c.formatos.length && !c.formatos.includes(f.formato)) out.push(h('V05', 'aviso', f, `el formato ${f.formato} no está entre los de la estrategia para ${f.red}`, 'formatos del canal', 'usar un formato del canal'))
    }

    // ─── V06 · la hora cae dentro del horario de la sede (y se usa el dato de más rango; sin horario NUNCA es «ok»)
    if (f.requiere_abierto) {
      const sede = ins.sedes.find((s) => s.clave === f.sede)
      const hora = minutos(f.hora)
      if (!sede || !sede.horario) out.push(h('V06', 'aviso', f, 'no hay horario de la sede: no se puede comprobar la hora', 'client_sede_datos', 'PENDIENTE: horario de la sede (se investiga con fuente)'))
      else if (hora == null) out.push(h('V06', 'bloquea', f, 'la fila exige local abierto pero no trae una hora válida', 'hora HH:MM', 'poner la hora'))
      else {
        const tramos = sede.horario[f.dia_semana] ?? []
        const tol = f.formato.startsWith('anuncio') ? 0 : ins.toleranciaAperturaMin ?? 0
        if (tramos.length === 0) out.push(h('V06', 'bloquea', f, `la sede ${sede.clave} está cerrada ese día de la semana`, 'horario de la sede', 'mover la pieza a un día abierto o a una que no requiera local abierto'))
        else if (!tramos.some((t) => { const a = minutos(t.abre), c = minutos(t.cierra); return a != null && c != null && hora >= a - tol && hora <= c })) {
          out.push(h('V06', 'bloquea', f, `la hora ${f.hora} cae fuera del horario de la sede ${sede.clave} (${tramos.map((t) => `${t.abre}–${t.cierra}`).join(', ')})`, 'horario de la sede', 'poner la hora dentro del horario'))
        }
      }
    }

    // ─── V07 · regla general: ninguna fecha especial entra sin fuente (por FILA; la lista vacía no bloquea nada)
    if (PALABRAS_FECHA_ESPECIAL.test(nTema)) {
      const verificadas = new Map((ins.fechasEspeciales ?? []).filter((x) => x.estado === 'verificada').map((x) => [x.id, x]))
      const respaldo = f.datos.find((d) => d.dato === 'fecha_especial' && verificadas.has(d.ref.replace(/^fecha:/, '')))
      if (!respaldo) out.push(h('V07', 'bloquea', f, 'el tema cita una fecha especial sin fuente verificada', 'ninguna fecha especial entra al calendario sin fuente', 'quitar la mención o respaldarla con una fecha verificada; si no hay fuente, la fila sale o se cambia'))
      else {
        const fe = verificadas.get(respaldo.ref.replace(/^fecha:/, ''))!
        if (fe.fecha === f.fecha && f.requiere_abierto) out.push(h('V07', 'bloquea', f, `la fila cae en «${fe.nombre}» (${fe.fecha}) y exige local abierto`, 'fecha especial verificada', 'mover la pieza a otro día o cambiarla por una que no requiera local abierto'))
      }
    }

    // ─── V13 · fechas absolutas y «día N» escritas en el tema
    for (const fe of hallarFechasEnTema(f.tema ?? '')) {
      const esHito = fe.diaN != null && estrategia.hitos.some((x) => x.dia === fe.diaN)
      if (!esHito) out.push(h('V13', 'aviso', f, `el tema escribe «${fe.texto}»`, 'las fechas las pone el código', 'quitar la fecha del tema'))
    }

    // ─── V15 · palabras prohibidas del manual y voseo
    const prohibidas = (ins.forbiddenWords ?? []).map(normalizar).filter(Boolean)
    for (const p of prohibidas) if (new RegExp(`(?:^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`).test(nTema)) out.push(h('V15', 'bloquea', f, `el tema usa la palabra prohibida «${p}»`, 'palabras prohibidas del manual', 'reescribir sin esa palabra'))
    const vos = hallarVoseo(f.tema ?? '')
    if (vos.length) out.push(h('V15', 'bloquea', f, `el tema usa voseo («${vos[0]}»)`, 'tuteo (regla de idioma del proyecto)', 'reescribir en tuteo'))

    // ─── V16 · nunca reseñas ni testimonios con nombre sin procedencia
    if (/\b(?:resena|testimonio|opinion de|dice (?:que )?[a-z]+ )\b/.test(nTema) || /[“"][^”"]{12,}[”"]/.test(f.tema ?? '')) {
      const procede = f.datos.some((d) => d.dato === 'resena' && refPorId.get(d.ref) && ['F0', 'F1'].includes(nivelEfectivo(refPorId.get(d.ref)!).nivel))
      if (!procede) out.push(h('V16', 'bloquea', f, 'el tema cita una reseña o testimonio sin ficha de procedencia', 'regla «no inventar reseñas»', 'quitar la cita; las frases con nombre y foto no se escriben'))
    }

    // ─── V20 · la marca de video es la de la tabla, no la que quiera el agente
    const fmt = (ins.formatos[f.red] ?? []).find((x) => x.formato === f.formato)
    if (fmt) {
      const debeEsperar = fmt.produccion === 'espera_brazo'
      if (debeEsperar && f.estado !== 'espera_video') out.push(h('V20', 'bloquea', f, `el formato ${f.formato} espera al brazo de video pero la fila no está marcada espera_video`, 'cadena_formatos_por_red', 'marcar espera_video: no se esconde un video como otra cosa'))
      if (!debeEsperar && f.estado === 'espera_video') out.push(h('V20', 'bloquea', f, `la fila está marcada espera_video pero ${f.formato} no es de video`, 'cadena_formatos_por_red', 'quitar la marca'))
    }

    out.push(...chequeoDeDatos(f, ins, refPorId, conocidos))
  }

  // ─── V08 · frecuencia por red y semana
  out.push(...chequeoFrecuencia(ins))

  // ─── V09 · reparto de pilares (lo calcula el código)
  out.push(...chequeoPilares(ins))

  // ─── V10 · totales declarados
  if (ins.totalesDeclarados) {
    const real = filas.filter((f) => activa(f) && materializada(f)).length
    if (ins.totalesDeclarados.total_filas != null && ins.totalesDeclarados.total_filas !== real) out.push(h('V10', 'aviso', null, `el total declarado (${ins.totalesDeclarados.total_filas}) no coincide con el recalculado (${real})`, 'los totales los calcula el código', 'no declarar totales'))
    // por pilar: lo declarado también se recalcula (el agente no declara totales; si lo hace, que coincida)
    const vivas = filas.filter((f) => activa(f) && materializada(f))
    for (const [pilar, n] of Object.entries(ins.totalesDeclarados.por_pilar ?? {})) {
      const r = vivas.filter((f) => f.pilar === pilar).length
      if (n !== r) out.push(h('V10', 'aviso', null, `el total declarado del pilar «${pilar}» (${n}) no coincide con el recalculado (${r})`, 'los totales los calcula el código', 'no declarar totales'))
    }
  }

  // ─── V11 · dependencias entre filas y las del plan; nunca hacia un video que espera
  for (const f of filas.filter(validable)) {
    for (const dep of f.depende_de) {
      const a = porId.get(dep)
      if (!a) out.push(h('V11', 'bloquea', f, `depende de «${dep}», que no existe`, 'dependencias', 'quitar la dependencia o apuntar a una fila real'))
      else if (a.estado === 'espera_video') out.push(h('V11', 'bloquea', f, `depende de una pieza de video que espera al brazo (${dep})`, 'ninguna fila depende de un video', 'quitar la dependencia: si el plan exige un video antes, queda pendiente'))
      else if (a.fecha >= f.fecha) out.push(h('V11', 'bloquea', f, `depende de ${dep}, que sale el ${a.fecha}: no es anterior al ${f.fecha}`, 'la antecesora va antes', 'mover una de las dos'))
    }
  }
  for (const d of estrategia.dependencias) {
    const despues = todas.filter((x) => activa(x) && (x.pieza_fija?.startsWith(d.despues) || x.formato === d.despues))
    if (!despues.length) continue
    const primera = despues.map((x) => x.fecha).sort()[0]
    const antes = todas.filter((x) => activa(x) && x.fecha < primera && (x.pieza_fija?.startsWith(d.antes) || x.formato === d.antes))
    const exigidas = /(\d+)\s*(?:posts?|piezas?|publicaciones?)/i.exec(d.regla)
    const n = exigidas ? Number(exigidas[1]) : 1
    if (antes.length < n) out.push(h('V11', 'bloquea', null, `«${d.despues}» sale el ${primera} y antes solo hay ${antes.length} de «${d.antes}» (la regla pide ${n})`, d.cita_plan || d.regla, 'mover «' + d.despues + '» después de completar «' + d.antes + '»', `dependencia ${d.antes}→${d.despues}`))
  }

  // ─── V12 · revisiones: toda fila «revisión» cae en un hito de revisión del plan
  const diasRevision = estrategia.hitos.filter((x) => x.tipo === 'revision').map((x) => x.dia)
  for (const f of filas.filter(validable)) {
    if (/\b(?:revision|ritual de revision|checkpoint)\b/.test(normalizar(f.tema ?? ''))) {
      const dia = diaDeCampana(campana.fecha_inicio, f.fecha)
      if (!diasRevision.includes(dia)) out.push(h('V12', 'bloquea', f, `una fila de revisión cae en el día ${dia} y el plan fija las revisiones en ${diasRevision.join(', ') || '(ninguna)'}`, 'hitos del plan', 'poner la revisión en un día del plan o quitarla'))
    }
  }

  // ─── V17 · tope por día y red; una pieza por red y minuto
  const porDia = new Map<string, Fila[]>()
  for (const f of filas.filter((x) => activa(x) && materializada(x))) porDia.set(`${f.fecha}|${f.red}`, [...(porDia.get(`${f.fecha}|${f.red}`) ?? []), f])
  for (const [k, fs] of porDia) {
    const tope = Math.min(...fs.map((f) => (ins.formatos[f.red] ?? []).find((x) => x.formato === f.formato)?.max_por_dia ?? Infinity))
    if (fs.length > tope) out.push(h('V17', 'aviso', null, `${fs.length} piezas el mismo día en ${fs[0].red} (tope ${tope})`, 'max_por_dia', 'repartir', `día ${k.split('|')[0]}`))
    const minutosUsados = new Map<string, number>()
    for (const f of fs.filter((x) => x.hora)) minutosUsados.set(f.hora!, (minutosUsados.get(f.hora!) ?? 0) + 1)
    for (const [m, c] of minutosUsados) if (c > 1) out.push(h('V17', 'aviso', null, `${c} piezas en ${fs[0].red} a las ${m} el mismo día`, 'una pieza por minuto', 'separar las horas', `día ${k.split('|')[0]}`))
  }

  // ─── V18 · cada pendiente de la estrategia desbloquea algo que existe
  const claves = new Set([...estrategia.patron_semanal.map((s) => s.slot), ...todas.map((f) => f.id), ...todas.map((f) => f.pieza_fija ?? ''), ...estrategia.piezas_fijas.map((p) => p.clave)])
  for (const p of estrategia.pendientes) for (const d of p.desbloquea ?? []) if (!claves.has(d)) out.push(h('V18', 'aviso', null, `el pendiente ${p.clave} desbloquea «${d}», que no existe`, 'lista consolidada de pendientes', 'corregir la clave'))
  return out
}

function chequeoDeDatos(f: Fila, ins: InsumosCalendario, refPorId: Map<string, Referencia>, conocidos: string[]): Hallazgo[] {
  const out: Hallazgo[] = []
  const tema = f.tema ?? ''
  const encontrados = hallarAfirmaciones(tema, conocidos, { lexico: ins.lexico })
  const compacto = (s: string) => normalizar(s).replace(/[\s.,]/g, '')

  const validarDato = (d: DatoDeterminado, claseMin: Clase) => {
    const clase = maxClase(d.clase, claseMin)
    const ref = refPorId.get(d.ref)
    if (!ref) { out.push(h('V22', 'bloquea', f, `el dato «${d.dato}» apunta a una referencia que no existe (${d.ref || 'vacía'})`, 'cada referencia es un id real', 'citar una referencia real o declarar el dato como pendiente')); return false }
    if (ref.client_id !== ins.clientId) { out.push(h('V22', 'bloquea', f, `el dato «${d.dato}» apunta a una referencia de OTRO cliente (${ref.id})`, 'la referencia pertenece a este client_id', 'usar una referencia de este cliente')); return false }
    const al = alcanza(clase, ref, d.valor, ins.ahora)
    if (!al.ok) { out.push(h('V14', 'bloquea', f, `el dato «${d.dato}: ${d.valor}» no está respaldado: ${al.razon}`, 'jerarquía de fuentes F0 > F1 > F2 > F3', 'respaldarlo con una fuente suficiente, cambiar el tema o quitar el dato; si no hay fuente, la fila sale')); return false }
    for (const a of al.avisos) out.push(h('V14', 'aviso', f, a === 'no_firmado' ? `el dato «${d.dato}» se apoya en una fuente sin firma del alta` : `el dato «${d.dato}» tiene más de 90 días`, 'jerarquía de fuentes', 'se avisa en el brief'))
    // C01–C04 con los candidatos que trajo el flujo
    const cands = ins.candidatosPorDato?.[normalizar(d.dato)]
    if (cands?.length) {
      const r = resolverDato(cands, clase, ins.sedes.map((s) => s.clave), ins.ahora)
      for (const c of r.choques) {
        if (c.id === 'C04') out.push(h('C04', 'aviso', f, c.detalle, 'sede ajena al cliente', 'no se usa'))
      }
      if (r.estado === 'conflicto') out.push(h('C02', 'bloquea', f, `el dato «${d.dato}» tiene dos valores del mismo nivel: ${r.candidato}…`, 'riesgo alto sin desempate', 'la fila queda en investigación'))
      else if (r.estado === 'ok' && r.valor != null && normalizar(r.valor) !== normalizar(d.valor)) {
        const choque = r.choques.find((c) => c.id === 'C01')
        out.push(h(choque ? 'C01' : 'C02', 'bloquea', f, `el dato «${d.dato}» usa «${d.valor}» pero gana «${r.valor}» (${r.nivel})`, 'gana el nivel más alto', 'usar el valor de mayor rango'))
      } else if (r.estado === 'ok' && nivelEfectivo(ref).nivel === 'F1' && r.nivel === 'F0' && r.ref !== ref.id) {
        out.push(h('C03', 'aviso', f, `el plan/manual choca con lo firmado en el alta para «${d.dato}»`, 'gana F0', 'el plan se corrige por la vía de planeación'))
      }
    }
    return true
  }

  // 1 · cada cifra y afirmación del TEXTO necesita un dato declarado que la respalde (o un pendiente)
  for (const hl of encontrados) {
    // D2 (relevo 41): una AFIRMACIÓN se cubre solo si el `valor` (no el texto libre `dato`) contiene la frase detectada; una cifra, como siempre, por valor o dato
    const cubre = f.datos.find((d) => compacto(hl.tipo === 'afirmacion' ? d.valor : `${d.valor} ${d.dato}`).includes(compacto(hl.texto)))
    if (!cubre) {
      const excusado = f.pendientes.some((p) => compacto(p).includes(compacto(hl.texto)) || normalizar(p).includes(normalizar(hl.subtipo)))
      if (excusado) out.push(h('V14', 'aviso', f, `«${hl.texto}» queda pendiente de fuente`, 'datos con fuente', 'se investiga con fuente; si no hay, la fila sale'))
      else out.push(h('V14', 'bloquea', f, hl.tipo === 'cifra' ? `la cifra «${hl.texto}» (${hl.subtipo}) no está en datos[] con fuente` : `la afirmación «${hl.texto}» (${hl.subtipo}) no tiene respaldo`, 'cada cifra y cada afirmación de origen, frescura, porción, trazabilidad o garantía necesita respaldo F0/F1/F2', 'respaldarla en datos[], cambiar el tema o quitarla'))
    } else {
      // …y la referencia citada debe CONTENER la frase entera: un valor suelto que sí aparece en el plan no respalda «llega el mismo día»
      const ref = refPorId.get(cubre.ref)
      if (hl.tipo === 'afirmacion' && ref && ref.client_id === ins.clientId && !compacto(ref.texto).includes(compacto(hl.texto))) {
        out.push(h('V14', 'bloquea', f, `la afirmación «${hl.texto}» (${hl.subtipo}) cita una referencia que no la dice (${cubre.ref})`, 'la referencia contiene la afirmación entera', 'citar la fuente que lo dice, cambiar el tema o quitarla'))
      } else validarDato(cubre, hl.clase)
    }
  }
  // 2 · los datos declarados aunque no estén en el texto también se validan
  const ya = new Set(encontrados.flatMap((hl) => f.datos.filter((d) => compacto(`${d.valor} ${d.dato}`).includes(compacto(hl.texto))).map((d) => d.dato + d.valor)))
  for (const d of f.datos) if (!ya.has(d.dato + d.valor) && d.dato !== 'fecha_especial' && d.dato !== 'resena') validarDato(d, 'bajo')
  return out
}

const ORDEN_CLASE: Record<Clase, number> = { bajo: 0, medio: 1, alto: 2 }
const maxClase = (a: Clase, b: Clase): Clase => (ORDEN_CLASE[a] >= ORDEN_CLASE[b] ? a : b)

function chequeoFrecuencia(ins: InsumosCalendario): Hallazgo[] {
  const out: Hallazgo[] = []
  const { campana, estrategia } = ins
  const vivas = ins.filas.filter((f) => activa(f) && materializada(f))
  const slotRed = new Map(estrategia.patron_semanal.map((s) => [s.slot, s.red]))
  for (const semana of campana.semanas) {
    const lunes = fechaDeFila(campana.fecha_inicio, semana, 1)
    const domingo = sumarDias(lunes, 6)
    const completa = lunes >= campana.fecha_inicio && domingo <= campana.fecha_fin
    for (const c of estrategia.canales.filter((x) => x.rol !== 'no')) {
      for (const clase of ['feed', 'historias', 'anuncios'] as const) {
        const meta = clase === 'feed' ? c.frecuencia.feed_semana : clase === 'historias' ? c.frecuencia.historias_semana : c.frecuencia.anuncios_semana
        const real = vivas.filter((f) => f.semana === semana && f.red === c.red && claseDeFormato(f.formato) === clase).length
        const holgura = (ins.ajustes ?? []).filter((a) => a.semana === semana && slotRed.get(a.slot) === c.red && a.accion !== 'mover').length
        const dif = Math.abs(real - meta)
        if (dif <= holgura) continue
        const tolerancia = clase === 'feed' ? 0 : 1
        const sev: Severidad = !completa ? 'aviso' : dif > tolerancia && (clase === 'feed' || dif > 1) ? 'bloquea' : 'aviso'
        if (dif > 0) out.push(h('V08', sev, null, `semana ${semana}, ${c.red}, ${clase}: ${real} piezas y la estrategia pide ${meta}`, 'frecuencia de la estrategia', 'ajustar la cantidad', `semana ${semana} · ${c.red}`))
      }
    }
  }
  return out
}

function chequeoPilares(ins: InsumosCalendario): Hallazgo[] {
  const vivas = ins.filas.filter((f) => activa(f) && materializada(f) && f.pilar)
  if (!vivas.length) return []
  const out: Hallazgo[] = []
  for (const p of ins.estrategia.pilares) {
    const real = (vivas.filter((f) => f.pilar === p.clave).length / vivas.length) * 100
    const dif = Math.abs(real - p.pct)
    if (dif > 10) out.push(h('V09', 'bloquea', null, `el pilar ${p.clave} pesa ${real.toFixed(0)} % y la meta es ${p.pct} %`, 'reparto de pilares', 'rebalancear', `pilar ${p.clave}`))
    else if (dif > 5) out.push(h('V09', 'aviso', null, `el pilar ${p.clave} pesa ${real.toFixed(0)} % y la meta es ${p.pct} %`, 'reparto de pilares', 'rebalancear', `pilar ${p.clave}`))
  }
  const conocidas = new Set(ins.estrategia.pilares.map((p) => p.clave))
  for (const f of vivas) if (!conocidas.has(f.pilar!)) out.push(h('V09', 'bloquea', f, `el pilar «${f.pilar}» no existe en la estrategia`, 'pilares de la estrategia', 'usar un pilar de la estrategia'))
  return out
}

/** V07b · candidatas: SOLO si el cliente declaró fechas tipo «feriados» Y tiene filas que exigen local abierto. Un cliente sin horario NUNCA lo dispara. */
export function chequearCandidatas(ins: InsumosCalendario): Hallazgo[] {
  const declara = ins.estrategia.fechas_que_importan.some((x) => /feriad/i.test(x.tipo))
  const fe = (ins.fechasEspeciales ?? []).filter((x) => x.estado === 'verificada')
  if (!declara || fe.length === 0) return []
  const out: Hallazgo[] = []
  for (const f of ins.filas.filter((x) => activa(x) && materializada(x) && x.requiere_abierto)) {
    const ajeno = fe.find((x) => x.fecha === f.fecha && x.alcance === 'local' && x.ambito !== f.sede)
    const puente = fe.find((x) => x.alcance === 'nacional' && ((diaSemanaIso(x.fecha) === 1 && x.fecha === sumarDias(f.fecha, 1)) || (diaSemanaIso(x.fecha) === 5 && x.fecha === sumarDias(f.fecha, -1))))
    if (ajeno) out.push({ ...h('V07b', 'aviso', f, `la fila exige local abierto y el ${f.fecha} es feriado verificado de otro ámbito («${ajeno.nombre}»)`, 'fecha candidata', 'avisar en el brief'), alcance: 'fila' })
    else if (puente) out.push({ ...h('V07b', 'aviso', f, `la fila exige local abierto junto al feriado «${puente.nombre}» (posible puente)`, 'fecha candidata', 'avisar en el brief'), alcance: 'fila' })
  }
  return out
}

export function validarTodo(ins: InsumosCalendario): Hallazgo[] {
  return [...validarCalendario(ins), ...chequearCandidatas(ins)]
}
