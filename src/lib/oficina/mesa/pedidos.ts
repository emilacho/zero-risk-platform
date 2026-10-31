/**
 * LO QUE SE LE PIDE A CADA AGENTE EN SU TURNO · puro. Texto libre en español (tuteo): el agente lee primero el manual, luego el brief y el plan, ve el directorio del equipo y el tablero,
 * y entrega su aporte como lo haría un profesional de su especialidad. NO hay formulario ni topes de caracteres. Solo tres reglas duras.
 */
import { seccionDelDirectorio } from './directorio'
import { refDe } from './libro'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta, type TipoDePieza } from './tipos'
import type { FotoEtiquetada } from '../fotos'
import { CABECERA_SALTAR_EDITOR } from '../../cadena/constantes'
import { fichasEnTexto, leerFichasPorRed, metodoDeAsiento } from '../../cadena/metodos'

export type TipoDeTurno = 'dirigir' | 'aportar' | 'responder' | 'integrar' | 'devolver_citas'

export interface ContextoDeTurno {
  cliente_nombre: string
  tipo: TipoDePieza
  brief_id: string
  brief_texto: string
  manual_texto: string
  plan_texto: string | null
  fotos: FotoEtiquetada[]
  /** lo que el portero ya trajo (texto de los aportes `material` va en el tablero) */
  tope_usd: number
  gasto_usd: number
}

/** UNA sola función de recorte: nunca corta callado (ADENDAS 5 y 6 de la ORDEN del 31-oct). Sin nombre del documento conserva el aviso corto de siempre. */
const recorta = (t: string, n: number, doc?: string) => (t.length <= n ? t : t.slice(0, n) + (doc ? `\n[… recortado: ${n} de ${t.length} caracteres de ${doc}]` : '\n[…recortado]'))

/**
 * LA DIETA: cuánto de cada documento recibe cada familia de mesa. Es un DATO: los valores de las mesas de piezas son los de HOY (ADENDA 6: no cambian hasta que Emilio firme D3);
 * las mesas de la cadena reciben el manual COMPLETO (ADENDA 4), con un límite muy alto solo contra desbordes y el aviso de recorte si algo se cortara.
 * El plan: el brief lo recibe COMPLETO (es su fuente); el concepto NO (el brief ya es su lectura del plan).
 */
export const DIETA: Record<TipoDePieza, { manual: number; marco: number; plan: number }> = {
  carrusel: { manual: 7000, marco: 5000, plan: 3000 },
  kit: { manual: 7000, marco: 5000, plan: 3000 },
  brief: { manual: 120000, marco: 40000, plan: 120000 },
  concepto: { manual: 120000, marco: 60000, plan: 0 },
}

/** el tablero: lo más reciente completo, lo antiguo en resumen (el líder mantiene el hilo; los demás no releen todo) */
export function tableroEnTexto(libro: Aporte[], max = 12000): string {
  if (!libro.length) return '(el tablero está vacío: eres el primero)'
  const filas = libro.map((a) => ({ a, cab: `**${refDe(a)}** · ${a.de}${a.para ? ` → ${a.para}` : ''} · ${a.tipo}` }))
  let total = 0
  const salida: string[] = []
  for (let i = filas.length - 1; i >= 0; i--) {
    const { a, cab } = filas[i]
    const completo = `${cab}\n${recorta(a.texto, 2500)}`
    const resumen = `${cab}\n${recorta(a.texto, 220)}`
    const t = total + completo.length <= max && salida.length < 10 ? completo : resumen
    total += t.length
    salida.unshift(t)
  }
  return salida.join('\n\n')
}

export const LISTA_DE_FOTOS = (fotos: FotoEtiquetada[]): string => {
  const propias = fotos.filter((f) => (f.origen ?? 'propia') === 'propia').slice(0, 24)
  if (!propias.length) return '(el cliente no tiene fotos propias disponibles)'
  return propias.map((f) => `- ${f.id} · ${f.que_muestra ?? 'sin descripción'}${f.con_personas ? ' · con personas' : ''}${f.etiqueta_confianza ? ` · confianza ${f.etiqueta_confianza}` : ''}`).join('\n')
}

/** 31-oct · brief creativo de la campaña (`brief_creativo.v1`): UN brief corto, con secciones fijas que el código lee; lo que falta se declara en «Faltantes», nunca se rellena */
const CONVENCION_DEL_BRIEF = [
  'Entrega el BRIEF CREATIVO de la campaña con esta convención (secciones fijas, cortas; el código las lee):',
  '```',
  '## De qué parte del plan sale',
  '<cita LITERAL del plan, entre comillas>',
  '## Insight',
  '<una verdad del público, en 1–2 frases>',
  '## Mensaje',
  '<UN solo mensaje de campaña>',
  '## Objetivo',
  '<objetivo de la campaña, medible> y por red: - <red>: objetivo · llamado',
  '## Tono',
  '<voz y trato del manual, en 2 líneas>',
  '## Obligatorios',
  '- vocabulario: … · - prohibido: … · - lo que no se dice: …',
  '## Faltantes',
  '- <campo>: <qué falta> (nunca se rellena)',
  '## Contradicciones plan vs manual',
  '- <qué> · plan dice · manual dice · qué se hizo',
  '## Citas',
  'A1 usé: <del portero> …',
  '```',
  'Un solo mensaje. Cita el plan literalmente. Nada de cifras ni datos del cliente sin fuente: lo que no esté en el material del portero, el manual o el plan va en «Faltantes». Idioma y trato: los del manual del cliente.',
].join('\n')

/** 31-oct · concepto de campaña (`concepto.v1`, contrato de la cadena): gran idea paraguas + capítulos por fase + series + banco de ideas (líneas que el código lee) */
const CONVENCION_DEL_CONCEPTO = [
  'Entrega el CONCEPTO de la campaña con esta convención (secciones fijas; el código las lee y lo que falte se declara):',
  '```',
  '## Gran idea',
  '<nombre> · <frase paraguas de 90 días>',
  '## Por qué funciona',
  '<atado al insight del brief, citándolo>',
  '## Cómo se ve',
  '<dirección visual: paleta/estilo del manual, qué aparece, qué no, fotos propias de referencia foto:<id>>',
  '## Cómo suena',
  '<voz, trato del manual, ritmo>',
  '## Capítulo <clave de fase> · <nombre>      (uno por fase de la estrategia)',
  'Qué cuenta: … · Objetivo de la fase (cita): … · Cómo se ve en este capítulo: …',
  'Series: - S1 · <nombre> · <qué cuenta> · redes: …',
  '## Ideas que salen',
  '- C1-I04: <por qué sale>',
  '## Caminos descartados y por qué',
  '- <camino> · <motivo>',
  '## Citas',
  'A3 usé: <qué tomaste de ese aporte>',
  'A5 descarté: <por qué no lo usaste>',
  '```',
  'El BANCO DE IDEAS lo escriben los miembros en sus aportes de la ronda 2, una línea por idea, EXACTAMENTE así:',
  '- C<fase>-I<nn> · <red> · <formato o cualquiera> · <idea en una línea> · mensaje: <UNA frase propia de esta idea, al servicio del mensaje de campaña> · gancho: <lo que detiene el scroll> · protagonista: <uno> · serie: S1 · foto:<id>|ninguna',
  'Cada idea con mensaje y gancho PROPIOS (distintos entre ideas); cubre cada red de la estrategia en cada capítulo. Las ideas NO llevan datos con valor (precios, horarios, cifras): el estratega los pone con su referencia. La integración lista cuáles ideas quedan y cuáles salen.',
].join('\n')

const CONVENCION_DE_LA_PIEZA = (tipo: TipoDePieza): string => tipo === 'brief' ? CONVENCION_DEL_BRIEF : tipo === 'concepto' ? CONVENCION_DEL_CONCEPTO : tipo === 'carrusel'
  ? [
      'Escribe la PIEZA COMPLETA con esta convención ligera (no es un formulario: es para que el equipo de dibujo la lea):',
      '```',
      '## Lámina 1 · hook',
      'Título: …',
      'Texto: …',
      'Llamado: … (solo en la lámina que lo lleve)',
      'Imagen: foto:<id de una foto propia> | generar: <qué debe mostrarse> | ninguna',
      '## Lámina 2 · problem   (…una sección por lámina, de 2 a 10)',
      '## Pie',
      '<el pie de foto>',
      '## Etiquetas',
      '#una #otra',
      '## Citas',
      'A3 usé: <qué tomaste de ese aporte>',
      'A5 descarté: <por qué no lo usaste>',
      '```',
      'Lo que escribes en Título, Texto y Llamado es EXACTAMENTE lo que se dibuja: una sola versión final por campo, sin "Variante A/B", sin etiquetas de formato ("Titular nativo", "Texto en imagen"), sin límites entre paréntesis ni markdown. Si quieres dejar alternativas, ponlas bajo "## Alternativas" (no se dibujan). Las instrucciones para quien dibuja o publica van en "Imagen:" o en tus aportes, no dentro del texto de la lámina.',
      'El pie ("## Pie") es el texto de publicación final, sin hashtags (esos van solo en "## Etiquetas", una vez cada uno) y con la voz del manual.',
    ].join('\n')
  : [
      'Escribe la PIEZA COMPLETA con esta convención ligera: una sección por elemento del brief, con su identificador:',
      '```',
      '## <ref del elemento>',
      'Título: …',
      'Texto: …',
      'Llamado: …',
      'Ambiente: …',
      'Imagen: foto:<id de una foto propia> | generar: <qué debe mostrarse> | ninguna',
      '## Citas',
      'A3 usé: <qué tomaste de ese aporte>',
      'A5 descarté: <por qué no lo usaste>',
      '```',
    ].join('\n')

const REGLAS_DURAS = (c: ContextoDeTurno): string => [
  '## Las únicas tres reglas duras',
  `1. **Gasto.** La pieza tiene un tope de US$ ${c.tope_usd.toFixed(2)} (ya se gastó US$ ${c.gasto_usd.toFixed(2)}). Cuida cada turno: no repitas lo que ya está en el tablero.`,
  '2. **No inventes datos que comprometan al cliente**: certificaciones, normas, precios, cifras, teléfonos, usuarios, marcas ajenas ni nada que no esté en el manual, el brief, el plan, las fotos o el material del portero. Si te falta un dato, dilo o pídelo; no lo rellenes. Una imagen generada tampoco debe mostrar textos, sellos, normas ni lecturas de instrumentos inventados.',
  '3. **La pieza debe poder dibujarse**: cada lámina es un título, un texto corto, un llamado (si lo lleva) y una imagen. Lo demás es tu criterio; sin límites de caracteres: si algo es largo, el dibujo se ajusta o el equipo lo parte.',
].join('\n')

const HERRAMIENTAS = [
  '## Cómo trabajas con el equipo',
  'Trabajamos en EQUIPO sobre este tablero. Tu respuesta final de este turno ES tu aporte (texto libre, escrito como lo haría un profesional de tu especialidad). Si necesitas algo de un compañero:',
  '- `mesa_pedir(a, que, para_que)`: le anotas un pedido en el tablero; responde en SU turno (no esperas).',
  '- `mesa_devolver(a, comentarios)`: le devuelves su aporte con comentarios.',
  '- `pedir_material(que, para_que)`: si te falta material del cerebro del cliente (datos, fotos, hechos), se lo pides al portero; lo que trae vuelve al tablero. Úsalo solo si de verdad lo necesitas; si no, sigue.',
  `Máximo ${COTAS.MAX_PROFUNDIDAD} niveles de pedidos encadenados y ${COTAS.MAX_IDAS_VUELTAS_POR_PAREJA} idas y vueltas con un mismo compañero: después decide la dirección creativa con lo que haya.`,
].join('\n')

export function armarTarea(o: { tipo: TipoDeTurno; agente: string; tarjeta: Tarjeta | undefined; est: EstadoMesa; libro: Aporte[]; c: ContextoDeTurno; pedido?: Aporte; faltanCitas?: string; extra?: string; metodo?: string }): string {
  const { tipo, agente, est, libro, c } = o
  // la mesa de concepto tiene dos rondas: la 1 elige UNA gran idea entre caminos; la 2 la desarrolla en capítulos, series e ideas (la integración final lleva la convención)
  const ronda = libro.filter((a) => a.tipo === 'integra').length + 1
  const soloEleccion = c.tipo === 'concepto' && ronda === 1 && !est.cierre_forzado
  const cab = [
    `# Mesa de trabajo · ${c.cliente_nombre} · ${c.tipo === 'carrusel' ? 'carrusel' : c.tipo === 'brief' ? 'brief creativo de la campaña' : c.tipo === 'concepto' ? 'gran idea de la campaña' : 'kit de historias'} ${c.brief_id}`,
    `Eres **${agente}**${o.tarjeta ? ` — ${o.tarjeta.especialidad}` : ''}. Estás en la oficina creativa de la agencia.`,
    '',
    REGLAS_DURAS(c),
    '',
    HERRAMIENTAS,
    '',
    seccionDelDirectorio(est.directorio_congelado, agente),
    '',
    '## 1 · Manual de marca (léelo PRIMERO)',
    recorta(c.manual_texto || '(sin manual)', DIETA[c.tipo].manual, 'el manual de marca'),
    '',
    c.tipo === 'brief' ? '## 2 · El marco de la campaña (estrategia, fases, canales, hitos, sedes y fechas)' : c.tipo === 'concepto' ? '## 2 · El brief de la campaña y las fases de la estrategia' : '## 2 · El brief de este entregable',
    recorta(c.brief_texto, DIETA[c.tipo].marco, 'el marco'),
    '',
    '## 3 · El plan de trabajo',
    c.tipo === 'concepto' ? '(el brief de la campaña ya es la lectura del plan: no se repite aquí)' : c.plan_texto ? recorta(c.plan_texto, DIETA[c.tipo].plan, 'el plan') : '(sin plan)',
    '',
    '## Fotos propias del cliente (ids para `Imagen: foto:<id>`)',
    LISTA_DE_FOTOS(c.fotos),
    '',
    '## Tablero (aportes hasta ahora; cita con A<n>)',
    tableroEnTexto(libro),
    '',
  ].join('\n')

  const tu: Record<TipoDeTurno, string> = {
    dirigir: [
      '## Tu turno · DIRECCIÓN CREATIVA: abre la pieza',
      ...(c.tipo === 'brief'
        ? ['Lee el manual, el plan, la estrategia (el marco) y lo que el portero trajo al tablero. Escribe el **brief creativo de la campaña**: UN insight, UN mensaje, objetivo, tono, obligatorios y faltantes declarados (nunca los rellenes). Si te falta material del cliente, pídelo con `pedir_material`.']
        : c.tipo === 'concepto'
        ? ['PRIMERO lee el brief de la campaña con estos 6 criterios: (1) un solo mensaje, (2) insight real, (3) objetivo claro, (4) está planteado como problema y no como solución, (5) es fiel al plan y al manual, (6) se puede crear con lo que trajo el portero. Si alguno falla, **devuelve el brief UNA vez**: escribe una sección `## Devolución del brief` con los puntos que fallan y nada más (la mesa se cierra y la cadena pide un brief nuevo). Si el brief sirve, sigue: del brief y el manual, escribe **EL PROBLEMA en una frase**, y reparte lo que necesitas de cada compañero. Cada uno propondrá 2 o 3 caminos distintos con su porqué, pensados para 90 días.']
        : ['Lee el manual, luego el brief y el plan. Escribe tu **idea rectora**: qué vas a contar, con qué tono y estructura, qué imágenes imaginas (fotos propias vs. generadas) y qué necesitas de cada compañero.']),
      'El equipo completo participa en cada pieza: la oficina se formó con estos especialistas por razones concretas. Cada uno aportará su especialidad; no escribas tú todo. Si ya sabes que te falta material del cliente, pídelo con `pedir_material`.',
    ].join('\n'),
    aportar: [
      `## Tu turno · aporta tu especialidad (${agente})`,
      ...(c.tipo === 'concepto'
        ? [ronda === 1
          ? '**RONDA 1 · CAMINOS.** Propón 2 o 3 caminos DISTINTOS para la gran idea de la campaña, cada uno con su porqué (atado al insight del brief), pensados para 90 días. Todavía no escribas ideas sueltas por red.'
          : '**RONDA 2 · DESARROLLO.** La dirección ya eligió la gran idea (míralo en el tablero). Desarróllala desde tu especialidad: para cada capítulo (fase) de la estrategia, series y IDEAS del banco, una línea por idea con el formato exacto de la convención (`- C<fase>-I<nn> · red · formato · idea · mensaje: … · gancho: … · protagonista: … · serie: S1 · foto:<id>|ninguna`). Cada idea con su mensaje y su gancho PROPIOS.']
        : []),
      'La dirección creativa ya abrió la pieza (mírala en el tablero). Tu aporte es obligatorio y debe ser tuyo: lo que SOLO tu especialidad sabe hacer para esta pieza (propuestas concretas, texto, ritmo, descripción de imágenes, etc.), no un “de acuerdo”.',
      'Sé concreto: la dirección creativa citará lo que use de ti y justificará lo que descarte.',
      'Si de verdad tu especialidad no tiene nada que sumar a ESTA pieza, o está bien como va, dilo en una línea que empiece por «Sin aporte:» y di por qué; es una respuesta válida (la dirección creativa la cita como descartada o ya cubierta). No rellenes por cumplir.',
    ].join('\n'),
    responder: [
      `## Tu turno · te hicieron un pedido`,
      o.pedido ? `${refDe(o.pedido)} · ${o.pedido.de} te pide:\n> ${o.pedido.texto}` : '',
      'Respóndelo con lo que tu especialidad puede dar. Si la respuesta depende de material que no tienes, pídelo con `pedir_material`; no lo inventes.',
    ].join('\n'),
    integrar: [
      soloEleccion ? '## Tu turno · DIRECCIÓN CREATIVA: elige UNA gran idea' : c.tipo === 'concepto' ? '## Tu turno · DIRECCIÓN CREATIVA: integra y entrega el concepto' : '## Tu turno · DIRECCIÓN CREATIVA: integra y entrega la pieza',
      'Integra lo que aportó el equipo. Decide con criterio: puedes usar, ajustar o descartar cada aporte, pero **cita cuáles usaste y cuáles descartaste, con el motivo**, en la sección “Citas” (referencias A<n>). Cada especialidad del equipo debe aparecer citada.',
      ...(soloEleccion
        ? ['Elige UNA gran idea paraguas entre los caminos del equipo (puedes combinar). Escribe `## Gran idea` (<nombre> · <frase paraguas de 90 días>), por qué la elegiste, y **`## Caminos descartados y por qué`**. Cita lo que usaste y descartaste en `## Citas` (A<n>). Todavía no desarrolles capítulos ni banco: eso es la ronda 2.']
        : [CONVENCION_DE_LA_PIEZA(c.tipo)]),
      ...(o.extra ? ['', o.extra] : []),
    ].join('\n'),
    devolver_citas: [
      '## Tu turno · DIRECCIÓN CREATIVA: completa las citas',
      `Tu integración anterior no citó a: ${o.faltanCitas ?? '(ver abajo)'}. Entrega la pieza completa otra vez (la misma convención) y, en “Citas”, di qué usaste y qué descartaste —con motivo— de cada aporte del tablero.`,
      CONVENCION_DE_LA_PIEZA(c.tipo),
    ].join('\n'),
  }
  return cab + seccionDeIndicacion(o.tarjeta, agente) + (o.metodo ? o.metodo + '\n\n' : '') + tu[tipo]
}

/** T6: la indicación propia del agente (dato del directorio) · va ANTES de su turno y nunca toca su identidad · sin indicación no añade nada */
export function seccionDeIndicacion(t: Tarjeta | undefined, agente: string): string {
  const ind = (t?.indicacion ?? []).map((x) => x.trim()).filter(Boolean)
  return ind.length ? ['## Indicación de la oficina para ti (' + agente + ')', ...ind.map((x) => '- ' + x), '', ''].join('\n') : ''
}

/** agentes de la mesa que llevan un método de CC#1 y cuáles de las dos lecturas de `cadena_config` necesita cada uno (el método no va en la identidad: va en la tarea, después del marco y antes del formato de salida) */
export const ASIENTOS_CON_METODO: Readonly<Record<string, 'pieza' | 'fichas_por_red'>> = { 'content-creator': 'pieza', marketing_instagram_curator: 'fichas_por_red' }

/** T6: el método del asiento (`cadena_config.metodos`; apagado o sin método = nada) y, para el curador, las fichas por red como dato con su caducidad · puro */
export function seccionDeMetodo(agente: string, metodos: unknown, fichas: unknown, hoy: string): string {
  const cual = ASIENTOS_CON_METODO[agente]
  if (!cual) return ''
  const m = metodoDeAsiento(agente, metodos)
  const f = cual === 'fichas_por_red' ? leerFichasPorRed(fichas) : []
  const partes = [m, f.length ? fichasEnTexto(f, f.map((x) => x.red), hoy) : null].filter((x): x is string => !!x && !!x.trim())
  return partes.length ? ['## Método de la oficina para ti (guía, no formato)', ...partes].join('\n\n') : ''
}

/** el pedido que consume el flujo de turnos de n8n (mismo molde que la v1: `agent_name`, `task`, `images`, `esquema`…) */
export function pedidoDeAgente(o: { agente: string; task: string; encargo_id: string; client_id: string; dry_run: boolean; paso: string; reserva_usd: number }): Record<string, unknown> {
  return {
    agent_name: o.agente, task: o.task, images: [], esquema: 'opinion_libre.v1',
    extra: { indicacion_oficina: 'Mesa de trabajo: aportas como profesional de tu especialidad; texto libre.', paso_de_la_oficina: o.paso, encargo_id: o.encargo_id, mesa: true, mesa_agente: o.agente },
    max_budget_usd: o.reserva_usd, thinking_mode: 'disabled', dry_run: o.dry_run, client_id: o.client_id, workflow_hint: 'oficina · turno',
    // 31-oct: la mesa NO pasa por el editor de run-sdk (los jueces de la jefatura quedan fuera de la mesa, ADR-020); la cabecera va SIEMPRE
    headers_requeridos: { [CABECERA_SALTAR_EDITOR]: '1' },
  }
}
