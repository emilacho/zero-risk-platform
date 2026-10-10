/**
 * Las indicaciones al agente (diseño v2 §9, §11.1) · van por `extra`/`task`; NO se edita `identity_content`.
 * Agnósticas: ningún nombre, ciudad ni rubro de un cliente; los ejemplos usan rubros inventados y valores marcados como ejemplo.
 * El contrato de salida lo impone el esquema (`esquemas/index.ts`); aquí se dicen las reglas que un esquema no puede decir.
 */
import type { ContextoDelCliente } from './almacen'
import type { Estrategia, Ficha, Fila, Hallazgo } from './tipos'

const REGLAS_COMUNES = [
  'Respondes SOLO con el objeto que pide el formato de salida. No escribas nada fuera de él.',
  'Escribe en tuteo (tú). Nada de voseo.',
  'No inventes datos. Todo dato concreto (precio, medida, horario, dirección, cantidad, reseña) necesita una referencia (`ref`) a un id de la lista de REFERENCIAS; si no hay referencia, no lo escribas: déjalo como pendiente.',
  'No afirmes origen, frescura, porción, trazabilidad ni garantías («recién», «del día», «alcanza para N», «garantizado», «100 %»…) sin una referencia que lo diga.',
  'No cites reseñas ni testimonios de personas.',
  'No escribas fechas absolutas, ni totales, ni porcentajes de reparto: el sistema los calcula. Tú das semana + día de la semana (1 = lunes … 7 = domingo) + hora (HH:MM).',
  'Un solo formato por pieza, elegido de los formatos permitidos de esa red. Si el formato es de video, igual se planea (el sistema lo marca como en espera).',
]

const lineas = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')

export interface PedidoDeEstrategia { ctx: ContextoDelCliente; formatosPermitidos: Record<string, string[]>; version: number; correccion?: Ficha[] }

export function tareaDeEstrategia(p: PedidoDeEstrategia): string {
  const corr = p.correccion?.length
    ? `\n\n# CORRECCIÓN (única)\nTu respuesta anterior falló estos chequeos. Corrige SOLO esto, sin rehacer lo demás:\n${p.correccion.map((f, i) => `${i + 1}. [${f.donde}] ${f.que} → ${f.propuesta}`).join('\n')}`
    : ''
  return [
    '# Qué te pido',
    'Lee el PLAN de marketing y el MANUAL de marca de este negocio y devuelve su ESTRATEGIA de redes como un objeto estructurado (canales, excluidos, pilares, fases, hitos, dependencias, fechas que importan, patrón semanal, piezas fijas, pendientes, alertas).',
    '',
    '# Reglas',
    lineas(REGLAS_COMUNES),
    lineas([
      'Toda `cita_plan` es una frase LITERAL del plan (copiada tal cual). Si el plan no lo dice, no es una regla del plan: no lo cites; si lo propones tú, ponlo como propuesta con su motivo.',
      'Los pilares suman 100. Las fases caen dentro de 90 días.',
      '`fechas_que_importan` es una lista de TIPOS de fechas que le importan a ESTE negocio (feriados locales, temporadas, eventos del sector, fechas comerciales… o ninguna). Lo normal es la lista VACÍA: no inventes tipos «por si acaso». Si declaras uno, di su origen (plan | estrategia | alta) y un motivo concreto.',
      '`patron_semanal`: los slots que se repiten cada semana (día, hora, red, formato, pilar, sede). Usa solo redes y formatos permitidos. `requiere_abierto` solo si la pieza depende de que un local esté abierto; si el negocio no tiene local, siempre false.',
      '`pendientes`: lo que falta saber, con qué pieza desbloquea y quién lo pide (`portero` = el cerebro del cliente, `sistema` = investigarlo con fuente). Nunca se le pregunta nada a nadie del negocio.',
    ]),
    '',
    `# Formatos permitidos por red\n${Object.entries(p.formatosPermitidos).map(([r, f]) => `- ${r}: ${f.join(', ')}`).join('\n')}`,
    '',
    `# SEDES del negocio\n${p.ctx.sedes.length ? p.ctx.sedes.map((s) => `- ${s.clave}${s.nombre ? ` (${s.nombre})` : ''}`).join('\n') : '(el negocio no tiene sedes registradas)'}`,
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
}

export function tareaDeCalendario(p: PedidoDeCalendario): string {
  const e = p.estrategia
  const corr = p.correccion
    ? `\n\n# CORRECCIÓN (única)\n${p.correccion.modo === 'tanda' ? 'Tu tanda falló chequeos de conjunto: vuelve a entregarla ENTERA.' : 'Devuelve SOLO las piezas que fallaron, corregidas (mismo slot, semana y día).'}\nFichas:\n${p.correccion.fichas.map((f, i) => `${i + 1}. [${f.donde}] ${f.que} → ${f.propuesta}`).join('\n')}\nFilas que fallaron:\n${p.correccion.filas.map((f) => `- ${f.id}: ${f.tema ?? '(sin tema)'}`).join('\n')}`
    : ''
  return [
    '# Qué te pido',
    `Materializa la TANDA ${p.tanda} del calendario editorial (semanas ${p.semanas.join(', ')}). Para cada slot del patrón semanal y cada semana, escribe el tema de la pieza; agrega las piezas fijas del plan y los ajustes puntuales.`,
    '',
    '# Reglas',
    lineas(REGLAS_COMUNES),
    lineas([
      'Respeta el patrón semanal, los pilares, la frecuencia por red y las alertas de la ESTRATEGIA. Una pieza fija de la estrategia usa su `pieza_fija` y su tema.',
      'Si una pieza depende de otra (el plan lo pide), pon el id de la antecesora en `depende_de` (formato `s<semana>-d<día>-<slot>`); nunca dependas de una pieza de video.',
      'Cada dato concreto del tema va en `datos` con `dato`, `valor` tal como aparece en la referencia, `clase` (alto = precio, horario, dirección, medida, reseña, cifras; medio = ingredientes/descripciones; bajo = ambiente), `ref`, `nivel` y `opcional`.',
      'Si no tienes referencia para un dato, cambia el tema por uno que no lo necesite, o escríbelo en `pendientes`. Un tema sin datos concretos es mejor que un dato inventado.',
      'Si omites un slot de una semana, dilo en `ajustes_al_patron` con su motivo.',
    ]),
    '',
    `# ESTRATEGIA (vigente)\n${JSON.stringify({ canales: e.canales, pilares: e.pilares, fases: e.fases, hitos: e.hitos, dependencias: e.dependencias, patron_semanal: e.patron_semanal, piezas_fijas: e.piezas_fijas, alertas: e.alertas })}`,
    '',
    `# SEDES y horarios\n${p.ctx.sedes.length ? p.ctx.sedes.map((s) => `- ${s.clave}: ${s.horario ? JSON.stringify(s.horario) : '(sin horario conocido)'}`).join('\n') : '(sin sedes)'}`,
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
  const MAX = 40_000
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
    .slice(0, 60)
    .map((r) => `- ${r.id} [${r.origen}${r.firmada ? ', firmada' : ''}${r.fuente ? `, ${r.fuente}` : ''}${r.sede ? `, sede ${r.sede}` : ''}]: ${r.texto.replace(/\s+/g, ' ').slice(0, 280)}`)
    .join('\n')
}

/** las fichas de una corrección salen de los hallazgos que bloquean */
export const fichasDe = (hs: Hallazgo[]): Ficha[] => hs.filter((h) => h.severidad === 'bloquea').map((h) => h.ficha)
