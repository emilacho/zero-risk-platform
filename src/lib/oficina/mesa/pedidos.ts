/**
 * LO QUE SE LE PIDE A CADA AGENTE EN SU TURNO · puro. Texto libre en español (tuteo): el agente lee primero el manual, luego el brief y el plan, ve el directorio del equipo y el tablero,
 * y entrega su aporte como lo haría un profesional de su especialidad. NO hay formulario ni topes de caracteres. Solo tres reglas duras.
 */
import { seccionDelDirectorio } from './directorio'
import { refDe } from './libro'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta, type TipoDePieza } from './tipos'
import type { FotoEtiquetada } from '../fotos'
import { CABECERA_SALTAR_EDITOR } from '../../cadena/constantes'

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

const recorta = (t: string, n: number) => (t.length <= n ? t : t.slice(0, n) + '\n[…recortado]')

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

/** 31-oct · calendario: lo que entrega la dirección es UNA lista de ideas por hueco de la tanda (no es una pieza dibujable) */
const CONVENCION_DEL_CALENDARIO = [
  'Entrega la lista de IDEAS de la tanda con esta convención ligera (no es un formulario: es para que quien ordena el calendario la lea):',
  '```',
  '## <hueco: semana · día · red · formato> (tal cual aparece en el marco)',
  'Idea elegida: <tema + gancho + idea visual en 2–3 líneas>',
  'Viene de: A3 (y A5 si combinaste)',
  'Alternativa: <otra idea breve, si la hay>',
  '## Citas',
  'A3 usé: <qué tomaste de ese aporte>',
  'A5 descarté: <por qué no lo usaste>',
  '```',
  'Cada hueco del marco tiene UNA idea elegida. No repitas un tema ya usado en las filas previas. Si un hueco es una pieza fija o una fecha especial, respétala y propón solo el ángulo. No inventes datos del cliente (precios, horarios, cifras): una idea puede PEDIR un dato, nunca fabricarlo.',
].join('\n')

const CONVENCION_DE_LA_PIEZA = (tipo: TipoDePieza): string => tipo === 'calendario' ? CONVENCION_DEL_CALENDARIO : tipo === 'carrusel'
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

export function armarTarea(o: { tipo: TipoDeTurno; agente: string; tarjeta: Tarjeta | undefined; est: EstadoMesa; libro: Aporte[]; c: ContextoDeTurno; pedido?: Aporte; faltanCitas?: string; extra?: string }): string {
  const { tipo, agente, est, libro, c } = o
  const cab = [
    `# Mesa de trabajo · ${c.cliente_nombre} · ${c.tipo === 'carrusel' ? 'carrusel' : c.tipo === 'calendario' ? 'ideas del calendario' : 'kit de historias'} ${c.brief_id}`,
    `Eres **${agente}**${o.tarjeta ? ` — ${o.tarjeta.especialidad}` : ''}. Estás en la oficina creativa de la agencia.`,
    '',
    REGLAS_DURAS(c),
    '',
    HERRAMIENTAS,
    '',
    seccionDelDirectorio(est.directorio_congelado, agente),
    '',
    '## 1 · Manual de marca (léelo PRIMERO)',
    recorta(c.manual_texto || '(sin manual)', 7000),
    '',
    c.tipo === 'calendario' ? '## 2 · El marco de la tanda (huecos, plan, sedes, filas previas, fechas)' : '## 2 · El brief de este entregable',
    recorta(c.brief_texto, c.tipo === 'calendario' ? 14000 : 5000),
    '',
    '## 3 · El plan de trabajo',
    c.plan_texto ? recorta(c.plan_texto, 3000) : '(sin plan)',
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
      ...(c.tipo === 'calendario'
        ? ['Lee el manual y el marco de la tanda. Escribe tu **idea rectora de la tanda**: qué vas a contar a lo largo de las semanas, con qué ritmo y series, qué huecos necesitan más imaginación y qué necesitas de cada compañero. Cada compañero aportará ideas concretas POR HUECO (tema · gancho · idea visual · por qué). Tú ordenas y eliges después.']
        : ['Lee el manual, luego el brief y el plan. Escribe tu **idea rectora**: qué vas a contar, con qué tono y estructura, qué imágenes imaginas (fotos propias vs. generadas) y qué necesitas de cada compañero.']),
      'El equipo completo participa en cada pieza: la oficina se formó con estos especialistas por razones concretas. Cada uno aportará su especialidad; no escribas tú todo. Si ya sabes que te falta material del cliente, pídelo con `pedir_material`.',
    ].join('\n'),
    aportar: [
      `## Tu turno · aporta tu especialidad (${agente})`,
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
      '## Tu turno · DIRECCIÓN CREATIVA: integra y entrega la pieza',
      'Integra lo que aportó el equipo. Decide con criterio: puedes usar, ajustar o descartar cada aporte, pero **cita cuáles usaste y cuáles descartaste, con el motivo**, en la sección “Citas” (referencias A<n>). Cada especialidad del equipo debe aparecer citada.',
      CONVENCION_DE_LA_PIEZA(c.tipo),
      ...(o.extra ? ['', o.extra] : []),
    ].join('\n'),
    devolver_citas: [
      '## Tu turno · DIRECCIÓN CREATIVA: completa las citas',
      `Tu integración anterior no citó a: ${o.faltanCitas ?? '(ver abajo)'}. Entrega la pieza completa otra vez (la misma convención) y, en “Citas”, di qué usaste y qué descartaste —con motivo— de cada aporte del tablero.`,
      CONVENCION_DE_LA_PIEZA(c.tipo),
    ].join('\n'),
  }
  return cab + tu[tipo]
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
