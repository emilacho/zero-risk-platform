/**
 * Las indicaciones al agente (diseño v2 §9, §11.1) · van por `extra`/`task`; NO se edita `identity_content`.
 * Agnósticas: ningún nombre, ciudad ni rubro de un cliente; los ejemplos usan rubros inventados y valores marcados como ejemplo.
 * El contrato de salida lo impone el esquema (`esquemas/index.ts`); aquí se dicen las reglas que un esquema no puede decir.
 */
import type { ContextoDelCliente } from './almacen'
import type { ConceptoLeido } from './conceptos'
import type { ClaseDeFecha, Estrategia, Ficha, Fila, Hallazgo } from './tipos'
import { reglaDeIdioma, reglaDeRegistro, type RegistroDelCliente } from './registro'
import type { FechaEspecialVerificada } from './validador-calendario'
import { contextoDeEstado } from '../sedes/por-abrir'
import { TOPE_REAL_DEL_PEDIDO } from '../limites-de-tamano'
import { diaSemanaIso, esFechaIso, fechaDeFila } from './fechas'
import { ideasQueVolvieronAlBanco } from './reubicacion'

const REGLAS_BASE = [
  'Respondes SOLO con el objeto que pide el formato de salida. No escribas nada fuera de él.',
  '@REGISTRO@',
  'No inventes datos. Todo dato concreto (precio, medida, horario, dirección, cantidad, reseña) necesita una referencia (`ref`) a un id de la lista de REFERENCIAS; si no hay referencia, no lo escribas: déjalo como pendiente.',
  'No afirmes origen, frescura, porción, trazabilidad ni garantías («recién», «del día», «alcanza para N», «garantizado», «100 %»…) sin una referencia que lo diga.',
  'No escribas fechas absolutas, ni totales, ni porcentajes de reparto: el sistema los calcula. Tú das semana + día de la semana (1 = lunes … 7 = domingo) + hora (HH:MM).',
  'Un solo formato por pieza, elegido de los formatos permitidos de esa red. Si el formato es de video, igual se planea (el sistema lo marca como en espera).',
]

/** r75 · H2 · las reglas comunes llevan el REGISTRO DEL CLIENTE (su manual o su país), no uno fijo del proyecto */
const reglasComunes = (registro: RegistroDelCliente | undefined, idioma?: string | null): string[] => {
  const base = REGLAS_BASE.map((x) => (x === '@REGISTRO@' ? reglaDeRegistro(registro) : x))
  // 31-oct (T3): el idioma de la ficha, si lo hay; sin dato la lista es la de siempre
  const i = reglaDeIdioma(idioma)
  return i ? [...base, i] : base
}
const lineas = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')

export interface PedidoDeEstrategia { ctx: ContextoDelCliente; formatosPermitidos: Record<string, string[]>; version: number; diasDeCampana?: number; correccion?: Ficha[]
  /** 09-nov (GO Lenovo · B): el día 1 y el último día de la campaña (`YYYY-MM-DD`). Con ellos la tarea dice desde cuándo se cuentan los días; sin ellos, la tarea de siempre */
  fechaInicio?: string | null; fechaFin?: string | null
  /** 09-nov · F: el día 1 DEL PLAN (su ventana). Si difiere del de la campaña, las fechas del plan se cuentan desde él y se corren en bloque */
  diaUnoDelPlan?: string | null
  /** 10-nov (fechas sin fuente · D): las llaves de fechas que YA existen para el país del cliente (y sus temporadas). El agente reusa la misma si es la misma fecha */
  llavesDeFechas?: LlaveDeFecha[] }

/** una llave de fecha ya guardada: la llave estable, su ámbito y, si se sabe, su clase */
export interface LlaveDeFecha { llave: string; ambito: string; clase?: ClaseDeFecha | null }

export function lineaDeLlavesDeFechas(llaves: LlaveDeFecha[] | undefined): string {
  const l = llaves ?? []
  return `# LLAVES DE FECHAS QUE YA EXISTEN (para este país y este negocio · la usada más recientemente primero)\n${l.length ? l.map((x) => `- ${x.llave} · ámbito ${x.ambito}${x.clase ? ` · ${x.clase}` : ''}`).join('\n') : '(ninguna todavía)'}`
}

const NOMBRE_DEL_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
/** B · la línea del día 1: fecha, día de la semana, duración y fecha de fin. Vacía si falta la fecha de inicio (la tarea queda byte a byte como antes) */
export function lineaDelDiaUno(fechaInicio: string | null | undefined, fechaFin: string | null | undefined, dias: number, diaUnoDelPlan?: string | null): string {
  if (!fechaInicio || !esFechaIso(fechaInicio)) return ''
  const fin = fechaFin && esFechaIso(fechaFin) ? fechaFin : null
  const base = `El día 1 de la campaña es el ${NOMBRE_DEL_DIA[diaSemanaIso(fechaInicio)]} ${fechaInicio}; la campaña dura ${dias} días${fin ? ` y termina el ${NOMBRE_DEL_DIA[diaSemanaIso(fin)]} ${fin} (día ${dias})` : ''}.`
  // F (09-nov · firma de Emilio): la campaña arrancó en otra fecha que la del plan → la cronología del plan se corre ENTERA, en bloque; los feriados reales no se mueven
  if (diaUnoDelPlan && esFechaIso(diaUnoDelPlan) && diaUnoDelPlan !== fechaInicio) {
    return `${base} El plan cuenta sus fechas desde SU día 1, el ${NOMBRE_DEL_DIA[diaSemanaIso(diaUnoDelPlan)]} ${diaUnoDelPlan}: si el plan da una FECHA, conviértela a día contando desde el ${diaUnoDelPlan} (así el día N del plan es el día N de la campaña y toda su cronología se corre en bloque, sin perder ningún tramo). Todo «dia», «dia_desde» y «dia_hasta» es ese día. Las fechas especiales reales (feriados, Navidad, fechas comerciales) no se corren: quedan en su fecha de calendario.`
  }
  return `${base} Todo «dia», «dia_desde» y «dia_hasta» se cuenta desde ese día 1: si el plan da una FECHA, conviértela a su día de campaña contando desde el día 1.`
}

/**
 * 17-nov · Sprint 4 · A entrega 2 · el LECTOR de las fichas de hechos por oferta (el ejecutivo de cuentas de *Launch!* §11.2: junta los hechos del trabajo
 * antes de que los creativos escriban). Una vez por campaña. Escribe DATOS citados, nunca piezas ni ideas. Los hechos del cerebro (lugar, fechas, zonas)
 * los suma el código después y mandan sobre lo que el lector lea: aquí se le muestran para que no los contradiga ni los vuelva a deducir.
 */
export interface PedidoDeFichas {
  ctx: ContextoDelCliente
  version: number
  /** la fecha de hoy (AAAA-MM-DD): para decir qué ya venció o todavía no empieza */
  hoy: string
  /** los hechos del negocio que sirve el cerebro, ya como texto; `null` = todavía no disponibles */
  hechosDelCerebro: string[] | null
}
export function tareaDeFichas(p: PedidoDeFichas): string {
  return [
    '# Qué te pido',
    'Eres quien junta los HECHOS de lo que vende este negocio, antes de que los creativos escriban. Lee el PLAN, el MANUAL de marca y las REFERENCIAS, y devuelve UNA ficha por cada OFERTA: lo que una pieza puede vender (un lugar, un producto, un plan, un servicio, una línea o un evento).',
    'No escribes piezas, ideas, mensajes ni llamados: solo datos, cada uno con su fuente.',
    '',
    '# Reglas',
    lineas(reglasComunes(p.ctx.registro, p.ctx.idioma)),
    lineas([
      '`clave`: si la oferta es una de las SEDES de la lista, usa su clave TAL CUAL; si no, una clave corta en minúsculas con guiones (ejemplo inventado: «plan-anual»). La misma clave que el calendario pondrá en la pieza.',
      'Cada dato lleva `fuente`: el id de una REFERENCIA (por ejemplo `manual:…`, `plan:…`) o una cita literal corta del plan o del manual. Un dato sin fuente se descarta: no lo escribas.',
      '`vigente_desde` y `vigente_hasta` (`AAAA-MM-DD`): solo si la fuente dice desde o hasta cuándo vale (una promoción, una apertura, un cierre). Si no lo dice, déjalos vacíos.',
      '`red`: solo para lo que cambia según la red (por ejemplo, cómo se compra desde una red u otra). Si vale para todas, vacío.',
      '`no_se_puede_afirmar`: lo que el material dice que NO es cierto o que todavía no existe. `que_nunca_mostrar`: lo que una imagen no puede enseñar de esta oferta.',
      // 18-nov (GO Lenovo, T7) · «con su cita» se leía como texto literal: el objetivo es un DATO con su `fuente` (como los demás), no una cita del plan
      '`objetivo_por_fecha`: lo que el PLAN quiere de esta oferta en cada tramo de fechas, con su `fuente` (el id de la referencia, como en los demás datos). El objetivo puede resumir el plan: es un dato, no una cita literal.',
      'Lo que no encuentres queda vacío; no lo rellenes. Lo que falte y haga falta para una pieza va en `pendientes`, en una línea.',
      'Los HECHOS DEL NEGOCIO (del cerebro) mandan: no los contradigas ni los repitas con otras palabras; el sistema los suma a la ficha.',
    ]),
    '',
    `# Hoy\n${p.hoy} (lo que ya venció a esta fecha o todavía no empieza se escribe igual, con sus fechas: el sistema lo marca)`,
    '',
    `# SEDES del negocio\n${p.ctx.sedes.length ? p.ctx.sedes.map((s) => `- ${s.clave}${s.nombre ? ` (${s.nombre})` : ''}${contextoDeEstado(s.estado) ? ` · ${contextoDeEstado(s.estado)}` : ''}`).join('\n') : '(el negocio no tiene sedes registradas)'}`,
    '',
    `# HECHOS DEL NEGOCIO (del cerebro)\n${p.hechosDelCerebro === null ? '(hechos del negocio: aún no disponibles)' : p.hechosDelCerebro.length ? p.hechosDelCerebro.map((h) => `- ${h}`).join('\n') : '(el cerebro no tiene hechos de este negocio: no consta)'}`,
    '',
    `# REFERENCIAS (ids que puedes citar en \`fuente\`)\n${referencias(p.ctx)}`,
    '',
    `# PLAN\n${p.ctx.planTexto}`,
    '',
    `# MANUAL DE MARCA\n${p.ctx.manualTexto}`,
    `\n(versión de las fichas ${p.version})`,
  ].join('\n')
}

export function tareaDeEstrategia(p: PedidoDeEstrategia): string {
  const corr = p.correccion?.length
    ? `\n\n# CORRECCIÓN (única)\nTu respuesta anterior falló estos chequeos. Corrige SOLO esto, sin rehacer lo demás:\n${p.correccion.map((f, i) => `${i + 1}. [${f.donde}] ${f.que} → ${f.propuesta}`).join('\n')}`
    : ''
  return [
    '# Qué te pido',
    'Lee el PLAN de marketing y el MANUAL de marca de este negocio y devuelve su ESTRATEGIA de redes como un objeto estructurado (canales, excluidos, pilares, fases, hitos, dependencias, fechas que importan, patrón semanal, piezas fijas, pendientes, alertas).',
    '',
    '# Reglas',
    lineas(reglasComunes(p.ctx.registro, p.ctx.idioma)),
    lineas([
      'Toda `cita_plan` es una frase LITERAL del plan (copiada tal cual). Si el plan no lo dice, no es una regla del plan: no lo cites; si lo propones tú, ponlo como propuesta con su motivo.',
      `Los pilares suman 100. Las fases caen dentro de ${p.diasDeCampana ?? 90} días.`,
      ...[lineaDelDiaUno(p.fechaInicio, p.fechaFin, p.diasDeCampana ?? 90, p.diaUnoDelPlan)].filter(Boolean),
      'Cada dependencia lleva `cantidad`: cuántas piezas de `antes` pide la regla antes de la primera de `despues`, como NÚMERO (si el plan dice «tres posts», pon 3; si no dice cuántas, 1).',
      '`tolerancia_frecuencia` dice cuántas piezas por semana y red puede desviarse el calendario de la frecuencia antes de que el sistema lo frene (`feed`, `historias`, `anuncios`; 0 = exacta). Si el plan no dice nada, usa feed 0, historias 1, anuncios 1; si el plan pide más rigor o da más holgura, sigue al plan.',
      '`fechas_que_importan` es una lista de TIPOS de fechas que le importan a ESTE negocio (feriados locales, temporadas, eventos del sector, fechas comerciales… o ninguna). No inventes tipos «por si acaso». Si declaras uno, di su origen (plan | estrategia | alta) y un motivo concreto.',
      'Cada fecha que declares lleva su `clase`, y la decides tú razonando sobre lo que ES la fecha (no por las palabras de su nombre): `feriado_publico` si es una fecha del país o de un lugar, igual para todos los negocios de ahí (Navidad, Año Nuevo, un feriado nacional o local); `temporada_del_negocio` si es un tramo propio de ESTE negocio (su temporada alta, su cosecha, el tramo del año en que más vende).',
      '`llave`: la llave estable de esa fecha, en minúsculas y con guiones bajos. Mira la lista LLAVES DE FECHAS QUE YA EXISTEN: si tu fecha es la MISMA que una de la lista (aunque tú la escribirías distinto), usa esa llave y ese ámbito tal cual y pon `llave_nueva` en false. Si en la lista hay dos o más que son la misma fecha escrita de formas distintas, usa la PRIMERA que aparece (la lista va de la usada más recientemente a la menos). Solo si ninguna es la misma, crea una nueva y pon `llave_nueva` en true.',
      'En una `temporada_del_negocio`, `desde` y `hasta` (`YYYY-MM-DD`) son el tramo que dice el PLAN, y `cita_plan` es la frase literal del plan que lo dice. Si el plan no dice cuándo es, deja `desde`, `hasta` y `cita_plan` vacíos: queda pendiente y el sistema consigue la fecha por su vía. Nunca pongas una fecha que el plan no dice. En un `feriado_publico`, `desde` y `hasta` van vacíos: su fecha la verifica el sistema con las fuentes oficiales.',
      '`patron_semanal`: los slots que se repiten cada semana (día, hora, red, formato, pilar, sede). Usa solo redes y formatos permitidos. `requiere_abierto` solo si la pieza depende de que un local esté abierto; si el negocio no tiene local, siempre false.',
      '`pendientes`: lo que falta saber, con qué pieza desbloquea y quién lo pide (`portero` = el cerebro del cliente, `sistema` = investigarlo con fuente). Nunca se le pregunta nada a nadie del negocio.',
    ]),
    '',
    `# Formatos permitidos por red\n${Object.entries(p.formatosPermitidos).map(([r, f]) => `- ${r}: ${f.join(', ')}`).join('\n')}`,
    '',
    `# SEDES del negocio\n${p.ctx.sedes.length ? p.ctx.sedes.map((s) => `- ${s.clave}${s.nombre ? ` (${s.nombre})` : ''}${contextoDeEstado(s.estado) ? ` · ${contextoDeEstado(s.estado)}` : ''}`).join('\n') : '(el negocio no tiene sedes registradas)'}`,
    '',
    lineaDeLlavesDeFechas(p.llavesDeFechas),
    '',
    `# REFERENCIAS (ids que puedes citar en \`ref\`)\n${referencias(p.ctx)}`,
    '',
    `# PLAN\n${p.ctx.planTexto}`,
    '',
    `# MANUAL DE MARCA\n${p.ctx.manualTexto}`,
    `\n(versión de estrategia ${p.version})`,
    corr,
  ].join('\n')
}

export interface PedidoDeCalendario {
  ctx: ContextoDelCliente
  estrategia: Estrategia
  tanda: number
  semanas: number[]
  filasPrevias: Fila[]
  /** corrección: solo las filas que fallaron + sus fichas */
  correccion?: { fichas: Ficha[]; filas: Fila[]; modo: 'filas' | 'tanda' }
  /** 31-oct (nuevo orden · T3): la GRAN IDEA aprobada; con ella la tarea trae # GRAN IDEA, un # CAPÍTULO por fase de la tanda con su banco, # FECHAS ESPECIALES, y la salida es `calendario_tanda.v2` (`idea_de_mesa`). Ausente = la tarea de hoy, byte a byte. */
  concepto?: { leido: ConceptoLeido; version: number }
  /** las fechas que el cliente declaró y el código verificó (ninguna = se dice) · 11-nov: van SIEMPRE, con o sin `concepto` */
  fechasEspeciales?: FechaEspecialVerificada[]
  /** 31-oct (FIRMA de Emilio · capa local): el MÉTODO de colocación (`metodos.ts`, `social-calendar-builder` sin sus dependencias) · solo se pega con `concepto`; `null`/ausente = sin método (la tarea de hoy) */
  metodo?: string | null
  /** 17-nov · Sprint 4 · A entrega 2: las ofertas que tienen ficha de hechos (el lector corre antes); sin ellas la tarea queda como antes, byte a byte */
  ofertas?: Array<{ clave: string; nombre?: string | null }>
  /** 18-nov (DECISIÓN DE EMILIO · día 1 = apertura): el primer y el último día de la campaña. Si una semana de la tanda tiene días fuera de la campaña, la tarea lo dice; ausente = la tarea de antes, byte a byte */
  fechaInicio?: string | null
  fechaFin?: string | null
}

/** 18-nov · el día 1 ya no es lunes (es el día de apertura): la semana 1 y la última pueden tener días fuera de la campaña. La línea los nombra solo si la tanda los toca; si no, vacía */
export function lineaDeDiasFueraDeLaCampana(semanas: number[], fechaInicio: string | null | undefined, fechaFin: string | null | undefined): string {
  if (!fechaInicio || !esFechaIso(fechaInicio)) return ''
  const fin = fechaFin && esFechaIso(fechaFin) ? fechaFin : null
  const partes: string[] = []
  if (semanas.some((s) => fechaDeFila(fechaInicio, s, 1) < fechaInicio)) partes.push(`la campaña empieza el ${NOMBRE_DEL_DIA[diaSemanaIso(fechaInicio)]} ${fechaInicio} (día 1): en esa semana no pongas piezas en los días anteriores`)
  if (fin && semanas.some((s) => fechaDeFila(fechaInicio, s, 7) > fin)) partes.push(`la campaña termina el ${NOMBRE_DEL_DIA[diaSemanaIso(fin)]} ${fin}: en esa semana no pongas piezas en los días posteriores`)
  return partes.length ? `Días fuera de la campaña: ${partes.join('; ')}. Una pieza fuera de la campaña se bloquea.` : ''
}

/** las ofertas con ficha: el calendario pone su clave en `sede` (es lo que la hoja usa para traer la ficha de cada pieza) */
function seccionDeOfertas(p: PedidoDeCalendario): string[] {
  if (!p.ofertas?.length) return []
  const lista = p.ofertas.map((o) => `- ${o.clave}${o.nombre ? ` (${o.nombre})` : ''}`).join('\n')
  return [`# OFERTAS (las que tienen ficha de hechos)\n${lista}\nEn \`sede\` pon la clave de la oferta que vende cada pieza, TAL CUAL: una de esta lista o la de una sede. Si la pieza no vende ninguna, déjala vacía.`, '']
}

/** las secciones de la gran idea para la tanda: solo los capítulos (fases) que caen en sus semanas; el banco de cada uno con sus ideas tal cual */
function seccionesDelConcepto(p: PedidoDeCalendario): string[] {
  if (!p.concepto) return []
  const c = p.concepto.leido
  const diaIni = (Math.min(...p.semanas) - 1) * 7 + 1, diaFin = Math.max(...p.semanas) * 7
  const fases = p.estrategia.fases.filter((f) => f.dia_desde <= diaFin && f.dia_hasta >= diaIni)
  const out: string[] = [
    '',
    `# GRAN IDEA (concepto aprobado · versión ${p.concepto.version})`,
    c.gran_idea ? `${c.gran_idea.nombre} · ${c.gran_idea.frase}` : '(sin nombre)',
    c.por_que_funciona ? `Por qué funciona: ${c.por_que_funciona}` : '',
    c.como_se_ve ? `Cómo se ve: ${c.como_se_ve}` : '',
    c.como_suena ? `Cómo suena: ${c.como_suena}` : '',
    'Cada pieza realiza UNA idea del banco del capítulo de su fase y la cita en `idea_de_mesa` (su id exacto); el MENSAJE de la pieza es el de esa idea, no el mensaje de campaña. Si ninguna idea le sirve, `idea_de_mesa` va vacío y lo dices en `pendientes`.',
  ].filter((x) => x !== '')
  for (const f of fases) {
    const cap = c.capitulos.find((x) => x.fase === f.clave) ?? c.capitulos.find((x) => x.clave.toLowerCase() === f.clave.toLowerCase()) ?? null
    out.push('', `# CAPÍTULO ${f.clave}${cap ? ` · ${cap.nombre}` : ''} (días ${f.dia_desde}–${f.dia_hasta})`)
    if (!cap) { out.push('(el concepto no trae capítulo para esta fase: trabaja con la gran idea y dilo en `pendientes`)'); continue }
    if (cap.que_cuenta) out.push(`Qué cuenta: ${cap.que_cuenta}`)
    if (cap.como_se_ve) out.push(`Cómo se ve en este capítulo: ${cap.como_se_ve}`)
    for (const s of cap.series) out.push(`- serie ${s.id} · ${s.nombre} · ${s.que_cuenta} · redes: ${s.redes.join(', ')}`)
    const ideas = c.banco.filter((i) => i.capitulo === cap.clave || i.capitulo === cap.fase)
    out.push(`# BANCO DE IDEAS DEL CAPÍTULO ${f.clave}`)
    out.push(ideas.length ? ideas.map((i) => `- ${i.id} · ${i.red} · ${i.formato} · ${i.idea} · mensaje: ${i.mensaje} · gancho: ${i.gancho}${i.serie ? ` · serie: ${i.serie}` : ''}${i.foto ? ` · foto:${i.foto}` : ''}`).join('\n') : '(banco vacío para este capítulo: dilo en `pendientes`)')
  }
  // 19-nov · C2 (condición de Lenovo 06:54Z, «que nada se pierda»): las ideas de las filas que salieron por el calendario móvil vuelven al banco y se ofrecen PRIMERO, de cualquier capítulo
  const volvieron = ideasQueVolvieronAlBanco(p.filasPrevias, c.banco)
  if (volvieron.length) {
    out.push('', '# IDEAS QUE VOLVIERON AL BANCO (su fila perdió la fecha en una tanda anterior y no encontró otra: si calzan con esta tanda, úsalas antes que otras)')
    out.push(volvieron.map((i) => `- ${i.id} · capítulo ${i.capitulo} · ${i.red} · ${i.formato} · ${i.idea} · mensaje: ${i.mensaje} · gancho: ${i.gancho}`).join('\n'))
  }
  return out
}

/** 11-nov (reglas rígidas #5): la lista de fechas verificadas va SIEMPRE (con o sin gran idea): el agente cita su `fecha:<id>` y el código verifica esa fecha */
function seccionDeFechas(p: PedidoDeCalendario): string {
  return ['# FECHAS ESPECIALES (verificadas por el código)', p.fechasEspeciales?.length ? p.fechasEspeciales.map((x) => `- fecha:${x.id} · ${x.hasta && x.hasta !== x.fecha ? `${x.fecha} → ${x.hasta}` : x.fecha} · ${x.nombre} (${x.tipo})${x.origen === 'cliente' ? ' · temporada del negocio (la dio el cliente)' : ''}`).join('\n') : '(ninguna declarada para esta campaña)'].join('\n')
}

/**
 * 16-nov · lo que se le pide al calendario para cada pieza (campo `concepto`).
 * 17-nov · Sprint 4 · F (`calendario_tanda.v5`, firma de Emilio 17:01 Zúrich): la pieza nace de la idea del banco; el calendario ya NO escribe la idea, el mensaje,
 * el llamado ni las fotos (antes v4 los reescribía y la hoja los anteponía a los de los creativos). Solo pone lo suyo, como el plan de medios de una agencia.
 */
export const CONCEPTO_DE_CADA_PIEZA = [
  '# Lo que pones en cada pieza',
  'Cada pieza realiza una idea del banco tal como la crearon los creativos: NO reescribes su idea, su mensaje, su gancho ni su llamado, y no eliges fotos. Tú decides solo dónde, cuándo y para qué sirve esa pieza en el plan: la fecha, la red, el formato, la oferta que vende (en `sede`), y en `concepto`:',
  '- `objetivo`: lo que esta pieza tiene que lograr EN SU FECHA, atado al objetivo de su fase y de su red.',
  '- `publico`: a quién le habla esta pieza (del público del plan).',
  'Si la idea del banco no calza con la fecha o con un hecho que conoces, no la cambies: elige otra idea del banco o deja `idea_de_mesa` vacío y explícalo en `pendientes`.',
  'Si no sabes alguna parte, déjala vacía (el código lo avisa); no la inventes.',
].join('\n')

export function tareaDeCalendario(p: PedidoDeCalendario): string {
  const e = p.estrategia
  const corr = p.correccion
    ? `\n\n# CORRECCIÓN (única)\n${p.correccion.modo === 'tanda' ? 'Tu tanda falló chequeos de conjunto: vuelve a entregarla ENTERA.' : 'Devuelve SOLO las piezas que fallaron, corregidas (mismo slot, semana y día).'}\nFichas:\n${p.correccion.fichas.map((f, i) => `${i + 1}. [${f.donde}] ${f.que} → ${f.propuesta}`).join('\n')}\nFilas que fallaron:\n${p.correccion.filas.map((f) => `- ${f.id}: ${f.tema ?? '(sin tema)'}`).join('\n')}`
    : ''
  return [
    '# Qué te pido',
    `Materializa la TANDA ${p.tanda} del calendario editorial (semanas ${p.semanas.join(', ')}). Para cada slot del patrón semanal y cada semana, escribe el tema de la pieza; agrega las piezas fijas del plan y los ajustes puntuales.`,
    ...seccionesDelConcepto(p),
    ...(p.concepto && p.metodo ? ['', p.metodo] : []),
    // 16-nov · Sprint 1 · Mejora 2 · cada pieza lleva SU concepto (calendario_tanda.v3): la idea completa de esa pieza, no los planos de la campaña
    ...(p.concepto ? ['', CONCEPTO_DE_CADA_PIEZA] : []),
    '',
    '# Reglas',
    lineas(reglasComunes(p.ctx.registro, p.ctx.idioma)),
    lineas([
      'Respeta el patrón semanal, los pilares, la frecuencia por red y las alertas de la ESTRATEGIA. Una pieza fija de la estrategia usa su `pieza_fija` y su tema.',
      'Si una pieza depende de otra (el plan lo pide), pon el id de la antecesora en `depende_de` (formato `s<semana>-d<día>-<slot>`).',
      'La antecesora debe salir ANTES: otra fecha anterior, o el mismo día a una hora anterior. Una réplica en otra red el mismo día sale una hora después de la original (pon esa hora); el código ordena las que queden iguales y lo anota.',
      'Cada dato concreto del tema va en `datos` con `dato`, `valor` tal como aparece en la referencia, `clase` (alto = precio, horario, dirección, medida, reseña, cifras; medio = ingredientes/descripciones; bajo = ambiente), `ref`, `nivel` y `opcional`.',
      'Si el tema cita una fecha especial (un feriado, una temporada, una celebración), agrega en `datos` un dato `fecha_especial` cuya `ref` es el `fecha:<id>` de esa fecha en la lista FECHAS ESPECIALES. Si la fecha no está en la lista, no la cites.',
      'Si el tema cita una reseña, un testimonio o la opinión de una persona, agrega en `datos` un dato `resena` con la `ref` de su ficha. Si no hay ficha, no lo cites. Un eslogan o una frase del manual entre comillas no es una reseña.',
      'Si no tienes referencia para un dato, cambia el tema por uno que no lo necesite, o escríbelo en `pendientes`. Un tema sin datos concretos es mejor que un dato inventado.',
      'Si omites un slot de una semana, dilo en `ajustes_al_patron` con su motivo.',
      ...[lineaDeDiasFueraDeLaCampana(p.semanas, p.fechaInicio, p.fechaFin)].filter(Boolean),
    ]),
    '',
    `# ESTRATEGIA (vigente)\n${JSON.stringify({ canales: e.canales, pilares: e.pilares, fases: e.fases, hitos: e.hitos, dependencias: e.dependencias, patron_semanal: e.patron_semanal, piezas_fijas: e.piezas_fijas, alertas: e.alertas })}`,
    '',
    `# SEDES y horarios\n${p.ctx.sedes.length ? p.ctx.sedes.map((s) => `- ${s.clave}: ${s.horario ? JSON.stringify(s.horario) : '(sin horario conocido)'}${contextoDeEstado(s.estado) ? ` · ${contextoDeEstado(s.estado)}` : ''}`).join('\n') : '(sin sedes)'}`,
    '',
    ...seccionDeOfertas(p),
    seccionDeFechas(p),
    '',
    `# REFERENCIAS (ids que puedes citar en \`ref\`)\n${referencias(p.ctx)}`,
    p.filasPrevias.length ? `\n# Piezas de tandas anteriores (para no repetir temas)\n${p.filasPrevias.slice(-24).map((f) => `- ${f.id}: ${f.tema ?? ''}`).join('\n')}` : '',
    '',
    `# PLAN\n${p.ctx.planTexto}`,
    corr,
  ].join('\n')
}

export interface PedidoDeFechas { tipo: string; ambito: string; anio: number; paginas: { url: string; texto: string }[] }

/** Extraer fechas de un TIPO y un ÁMBITO que el cliente declaró, de páginas que el CÓDIGO ya descargó. El código luego comprueba cada cita contra la página. */
export function tareaDeFechas(p: PedidoDeFechas): string {
  const MAX = TOPE_REAL_DEL_PEDIDO
  let usado = 0
  const paginas = p.paginas.map((x) => { const t = x.texto.slice(0, Math.max(0, MAX - usado)); usado += t.length; return '## PÁGINA ' + x.url + '\n' + t }).join('\n\n')
  return [
    '# Qué te pido',
    'Del texto de las páginas de abajo, extrae las fechas de «' + p.tipo + '» que valen en «' + p.ambito + '» durante ' + p.anio + '.',
    '',
    '# Reglas',
    lineas([
      'Solo fechas que el texto dice EXPLÍCITAMENTE. No completes con lo que sepas ni calcules fechas que el texto no trae.',
      'Cada fecha lleva `fuente_url` (la página de donde sale) y `cita_literal`: la frase copiada TAL CUAL de esa página, que menciona el día y el mes. Si no puedes copiar la frase, no listes la fecha.',
      '`fecha` en formato AAAA-MM-DD. `alcance`: `nacional` si vale para todo el país, `local` si solo para el ámbito.',
      'Lo que busques y no encuentres va en `no_encontrado`. Una lista de fechas vacía es una respuesta válida.',
    ]),
    '',
    paginas,
  ].join('\n')
}

function referencias(ctx: ContextoDelCliente): string {
  if (!ctx.referencias.length) return '(no hay referencias: no escribas datos concretos)'
  return ctx.referencias
    .filter((r) => r.origen !== 'trozo' || r.confianza === 'system_trusted' || r.confianza === 'tenant_trusted')
    .map((r) => `- ${r.id} [${r.origen}${r.firmada ? ', firmada' : ''}${r.fuente ? `, ${r.fuente}` : ''}${r.sede ? `, sede ${r.sede}` : ''}]: ${r.texto.replace(/\s+/g, ' ')}`)
    .join('\n')
}

/** las fichas de una corrección salen de los hallazgos que bloquean */
export const fichasDe = (hs: Hallazgo[]): Ficha[] => hs.filter((h) => h.severidad === 'bloquea').map((h) => h.ficha)
