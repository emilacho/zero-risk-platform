/**
 * LO QUE SE LE PIDE A CADA AGENTE EN SU TURNO · puro. Texto libre en español (tuteo): el agente lee primero el manual, luego el brief y el plan, ve el directorio del equipo y el tablero,
 * y entrega su aporte como lo haría un profesional de su especialidad. NO hay formulario ni topes de caracteres. Solo tres reglas duras.
 */
import { seccionDelDirectorio } from './directorio'
import { refDe } from './libro'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta, type TipoDePieza } from './tipos'
import { NOMBRE_DE_LA_PIEZA } from './aprendizaje'
import type { FotoEtiquetada } from '../fotos'
import { CABECERA_SALTAR_EDITOR } from '../../cadena/constantes'
import { AGENTE_GANCHO_DE_VIDEO, METODO_GANCHO_POR_OMISION, fichasEnTexto, leerFichasPorRed, metodoDeAsiento } from '../../cadena/metodos'
import { BRIEF_GUIA_NO_REGLA } from '../brief'

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
  video: { manual: 7000, marco: 5000, plan: 3000 },
  // la reubicación decide fechas: el marco (las filas, plazos y horarios) completo; el manual y el plan solo como contexto
  reubicacion: { manual: 20000, marco: 60000, plan: 20000 },
  // 11-nov · la revisión de fallidos juzga causas contra arreglos: el marco (las causas y los arreglos) completo; el manual y el plan no hacen falta
  fallidos: { manual: 0, marco: 80000, plan: 0 },
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

/**
 * T8 · 31-oct · UNA VOZ DE GANCHO POR VIDEO (auditoría 5 del plan v3) · FIRMA 01-nov «hoja sin reja»: el gancho de la hoja es SUGERIDO; el gancho FINAL del video corto lo escribe
 * la mesa de piezas por UNA voz: `marketing_short_video_editing_coach` con el método `short-video-scripter` pegado a su tarea (la misma voz que fijó la FIRMA del 31-oct
 * «calendario y gancho» en la cadena · `AGENTE_GANCHO_DE_VIDEO`). Quien edita el video lo integra en el guion; nadie más propone un gancho aparte (ni el estratega de TikTok/Reels,
 * ni la dirección). La retención (`marketing_video_optimization_specialist`) ya no está en el video corto: aporta en la familia propia del video largo de YouTube (FIRMA 01-nov punto 4).
 * Dos ganchos en paralelo es un bug de la mesa, no una riqueza. Los asientos son los de `oficina_directorio` (dato); aquí solo se nombra quién tiene la voz y quién la integra.
 */
export const VOZ_DEL_GANCHO: string = AGENTE_GANCHO_DE_VIDEO
export const QUIEN_INTEGRA_EL_GANCHO = 'video-editor'
export const REGLA_DEL_GANCHO = `UNA sola voz de gancho por video: el gancho (lo que pasa en los primeros 3 segundos) lo propone únicamente ${VOZ_DEL_GANCHO}; ${QUIEN_INTEGRA_EL_GANCHO} lo integra en el guion. Nadie más propone un gancho aparte, y el guion lleva un solo gancho.`
/** lo que se le dice a cada asiento de la mesa de video sobre el gancho, según quién es */
export function reglaDelGanchoPara(agente: string): string {
  if (agente === VOZ_DEL_GANCHO) return `Eres la ÚNICA voz del gancho de este video: propón UN gancho (los primeros 3 segundos: qué se ve y por qué detiene el scroll) y la puerta de retención que lo sostiene. El GANCHO SUGERIDO del brief es un punto de partida que puedes mejorar, no una obligación. Un solo gancho final, no alternativas (si tu método te pide comparar 2 o 3 familias, compáralas y ENTREGA UNO, diciendo cuál y por qué). No escribes el guion entero ni eliges la dirección visual.\n\n${METODO_GANCHO_POR_OMISION}`
  if (agente === QUIEN_INTEGRA_EL_GANCHO) return `El gancho NO lo propones tú: lo propone ${VOZ_DEL_GANCHO} (míralo en el tablero o pídeselo con \`mesa_pedir\`); tú lo integras en el guion como primer plano. Nunca escribas un gancho alternativo.`
  return `No propongas un gancho: el gancho del video es de ${VOZ_DEL_GANCHO} (una sola voz) y lo integra ${QUIEN_INTEGRA_EL_GANCHO}. Aporta solo lo que tu especialidad suma al resto del video.`
}

/**
 * 11-nov · GO Lenovo 02:52Z (punto 3) · el guion guardado del reel de la W46 empezaba con una frase de trabajo del agente («Voy a leer los aportes completos del tablero… Tengo todo lo que necesito…»).
 * Se corrige en la INSTRUCCIÓN (no con un filtro por código: regla de Emilio). La jefatura lo verá igual en su revisión.
 */
export const FRASE_SIN_NOTAS_DE_TRABAJO = 'Tu respuesta ES el guion y nada más: empieza directamente en «## Plano 1». No escribas antes ni después lo que vas a hacer, lo que leíste o que ya tienes lo necesario: todo lo que escribas viaja con el guion.'

/** T8 · 31-oct · el GUION del video corto (la mesa lo escribe; el brazo lo filma tal cual) */
const CONVENCION_DEL_GUION = [
  'Escribe el GUION COMPLETO del video con esta convención ligera (no es un formulario: es para que el brazo de video lo filme tal cual):',
  FRASE_SIN_NOTAS_DE_TRABAJO,
  '```',
  '## Plano 1 · 0–3 s',
  'Se ve: … (qué muestra la cámara: producto, lugar, acción; sin rostros reconocibles de personas reales)',
  'Movimiento: … (cámara fija, paneo, acercamiento, cámara en mano…)',
  'Texto en pantalla: … (solo si lo lleva; literal, corto)',
  'Foto: foto:<id de una foto propia> | ninguna   (la foto real de referencia de ese plano)',
  '## Plano 2 · 3–8 s   (…una sección por plano; el video dura de 8 a 15 segundos en total)',
  '## Audio',
  '<música o sonido ambiente que acompaña; SIN voz ni narración>',
  '## Pie',
  '<el pie de foto de la publicación>',
  '## Etiquetas',
  '#una #otra',
  '## Citas',
  'A3 usé: <qué tomaste de ese aporte>',
  'A5 descarté: <por qué no lo usaste>',
  '```',
  'Lo que escribes en «Se ve», «Movimiento» y «Texto en pantalla» es EXACTAMENTE lo que se le pide al modelo de video: una sola versión final, sin "Variante A/B", sin markdown. Los tiempos de cada plano van en su encabezado y suman la duración del video (8–15 s).',
  `El Plano 1 es el gancho y hay UNO solo: el que propuso ${VOZ_DEL_GANCHO} e integró ${QUIEN_INTEGRA_EL_GANCHO}. Si en el tablero hay dos ganchos, el guion lleva el de ${VOZ_DEL_GANCHO} y el otro se cita como descartado.`,
  'Las fotos propias del cliente son la referencia visual de cada plano (el modelo las usa para no inventar el producto ni el lugar): nombra la que corresponda en «Foto:». No inventes textos, precios ni sellos en pantalla que no estén en el brief, el manual o el material del portero.',
  'El pie ("## Pie") es el texto de publicación final, sin hashtags (esos van solo en "## Etiquetas", una vez cada uno) y con la voz del manual.',
].join('\n')

const CONVENCION_DE_LA_PIEZA = (tipo: TipoDePieza): string => tipo === 'brief' ? CONVENCION_DEL_BRIEF : tipo === 'concepto' ? CONVENCION_DEL_CONCEPTO : tipo === 'video' ? CONVENCION_DEL_GUION : tipo === 'carrusel'
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
  c.tipo === 'video'
    ? '3. **El guion debe poder filmarse por un modelo de video**: planos con sus segundos (8 a 15 s en total), qué se ve en cada uno, el movimiento de cámara y la foto propia de referencia si la hay. Sin voces ni narración (solo música o ambiente), sin rostros reconocibles de personas reales, sin texto en pantalla que no esté escrito literalmente en el guion. Lo demás es tu criterio.'
    : '3. **La pieza debe poder dibujarse**: cada lámina es un título, un texto corto, un llamado (si lo lleva) y una imagen. Lo demás es tu criterio; sin límites de caracteres: si algo es largo, el dibujo se ajusta o el equipo lo parte.',
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
  if (o.c.tipo === 'reubicacion') return tareaDeReubicacion(o)
  if (o.c.tipo === 'fallidos') return tareaDeFallidos(o)
  const { tipo, agente, est, libro, c } = o
  // la mesa de concepto tiene dos rondas: la 1 elige UNA gran idea entre caminos; la 2 la desarrolla en capítulos, series e ideas (la integración final lleva la convención)
  const ronda = libro.filter((a) => a.tipo === 'integra').length + 1
  const soloEleccion = c.tipo === 'concepto' && ronda === 1 && !est.cierre_forzado
  const cab = [
    `# Mesa de trabajo · ${c.cliente_nombre} · ${NOMBRE_DE_LA_PIEZA[c.tipo]} ${c.brief_id}`,
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
    c.tipo === 'brief' ? '## 2 · El marco de la campaña (estrategia, fases, canales, hitos, sedes y fechas)' : c.tipo === 'concepto' ? '## 2 · El brief de la campaña y las fases de la estrategia' : `## 2 · El brief de este entregable (${BRIEF_GUIA_NO_REGLA})`,
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
        : c.tipo === 'video'
        ? ['Lee el manual, luego el brief y el plan. Escribe tu **idea rectora** del video corto: qué vas a contar en 8–15 segundos, con qué estructura de planos, qué fotos propias sirven de referencia y qué necesitas de cada compañero (guion y pedido al generador, storyboard, el gancho final y su puerta de retención (el coach, única voz), texto del pie, coherencia de Instagram o formato nativo de TikTok/Reels si están en la mesa).', REGLA_DEL_GANCHO + ' Tú no propones el gancho: lo pides y lo integras en la pieza.']
        : ['Lee el manual, luego el brief y el plan. Escribe tu **idea rectora**: qué vas a contar, con qué tono y estructura, qué imágenes imaginas (fotos propias vs. generadas) y qué necesitas de cada compañero.']),
      'El equipo completo participa en cada pieza: la oficina se formó con estos especialistas por razones concretas. Cada uno aportará su especialidad; no escribas tú todo. Si ya sabes que te falta material del cliente, pídelo con `pedir_material`.',
    ].join('\n'),
    aportar: [
      `## Tu turno · aporta tu especialidad (${agente})`,
      ...(c.tipo === 'concepto'
        ? [ronda === 1
          ? '**RONDA 1 · CAMINOS.** Propón 2 o 3 caminos DISTINTOS para la gran idea de la campaña, cada uno con su porqué (atado al insight del brief), pensados para 90 días. Todavía no escribas ideas sueltas por red.'
          : '**RONDA 2 · DESARROLLO.** La dirección ya eligió la gran idea (míralo en el tablero). Desarróllala desde tu especialidad: para cada capítulo (fase) de la estrategia, series y IDEAS del banco, una línea por idea con el formato exacto de la convención (`- C<fase>-I<nn> · red · formato · idea · mensaje: … · gancho: … · protagonista: … · serie: S1 · foto:<id>|ninguna`). Cada idea con su mensaje y su gancho PROPIOS.']
        : c.tipo === 'video'
        ? [reglaDelGanchoPara(agente)]
        : []),
      'La dirección creativa ya abrió la pieza (mírala en el tablero). Tu aporte es obligatorio y debe ser tuyo: lo que SOLO tu especialidad sabe hacer para esta pieza (propuestas concretas, texto, ritmo, descripción de imágenes, etc.), no un “de acuerdo”.',
      'Sé concreto: la dirección creativa citará lo que use de ti y justificará lo que descarte.',
      'Si de verdad tu especialidad no tiene nada que sumar a ESTA pieza, o está bien como va, dilo en una línea que empiece por «Sin aporte:» y di por qué; es una respuesta válida (la dirección creativa la cita como descartada o ya cubierta). No rellenes por cumplir.',
    ].join('\n'),
    responder: [
      `## Tu turno · te hicieron un pedido`,
      o.pedido ? `${refDe(o.pedido)} · ${o.pedido.de} te pide:\n> ${o.pedido.texto}` : '',
      'Respóndelo con lo que tu especialidad puede dar. Si la respuesta depende de material que no tienes, pídelo con `pedir_material`; no lo inventes.',
      ...(c.tipo === 'video' ? [reglaDelGanchoPara(agente)] : []),
    ].join('\n'),
    integrar: [
      soloEleccion ? '## Tu turno · DIRECCIÓN CREATIVA: elige UNA gran idea' : c.tipo === 'concepto' ? '## Tu turno · DIRECCIÓN CREATIVA: integra y entrega el concepto' : '## Tu turno · DIRECCIÓN CREATIVA: integra y entrega la pieza',
      'Integra lo que aportó el equipo. Decide con criterio: puedes usar, ajustar o descartar cada aporte, pero **cita cuáles usaste y cuáles descartaste, con el motivo**, en la sección “Citas” (referencias A<n>). Cada especialidad del equipo debe aparecer citada.',
      ...(soloEleccion
        ? ['Elige UNA gran idea paraguas entre los caminos del equipo (puedes combinar). Escribe `## Gran idea` (<nombre> · <frase paraguas de 90 días>), por qué la elegiste, y **`## Caminos descartados y por qué`**. Cita lo que usaste y descartaste en `## Citas` (A<n>). Todavía no desarrolles capítulos ni banco: eso es la ronda 2.']
        : [...(c.tipo === 'video' ? [REGLA_DEL_GANCHO] : []), CONVENCION_DE_LA_PIEZA(c.tipo)]),
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

/**
 * 10-nov · la mesa de REUBICACIÓN (GO de Lenovo 18:14Z · camino A): no hay pieza, ni fotos, ni equipo, ni portero. La dirige jefe-marketing: decide, fila por fila, qué hacer con lo que
 * quedó atrás. Juzgar es suyo; las fechas, plazos y días abiertos los verifica el código de la cadena después (lo que no cumpla se descarta con la razón del código).
 */
function tareaDeReubicacion(o: { tipo: TipoDeTurno; agente: string; tarjeta: Tarjeta | undefined; libro: Aporte[]; c: ContextoDeTurno }): string {
  const { c, agente, libro } = o
  const final = o.tipo !== 'dirigir'
  return [
    `# Mesa de reubicación · ${c.cliente_nombre} · ${c.brief_id}`,
    `Eres **${agente}**${o.tarjeta ? ` — ${o.tarjeta.especialidad}` : ''}. Algunas filas del calendario de la campaña ya pasaron su fecha y nunca se produjeron. Decides qué hacer con cada una.`,
    '',
    '## Reglas',
    `1. **Gasto.** Esta decisión tiene un tope de US$ ${c.tope_usd.toFixed(2)} (ya se gastó US$ ${c.gasto_usd.toFixed(2)}).`,
    '2. **Por cada fila pasada, una decisión con su razón:** reubicarla en una fecha nueva, fusionarla con una fila que viene, o descartarla. Piensa en lo que la fila cuenta, en su lugar dentro de la campaña y en lo que ya viene; no hay respuesta por defecto.',
    '3. **El código verifica después** que la fecha nueva caiga dentro de la campaña, a partir de hoy más el plazo de producción de su formato, en un día abierto si la pieza exige local, sin pasar el máximo por día y sin romper dependencias. Lo que no cumpla se descarta. Una fila que viene nunca se toca.',
    '4. **No inventes datos del cliente.** Decides con lo que está abajo.',
    '',
    o.tarjeta ? seccionDeIndicacion(o.tarjeta, agente) : '',
    '## El marco (las filas, plazos, máximos y horarios)',
    recorta(c.brief_texto, DIETA.reubicacion.marco, 'el marco'),
    '',
    '## Contexto · manual de marca',
    recorta(c.manual_texto || '(sin manual)', DIETA.reubicacion.manual, 'el manual de marca'),
    '',
    '## Contexto · plan de trabajo',
    c.plan_texto ? recorta(c.plan_texto, DIETA.reubicacion.plan, 'el plan') : '(sin plan)',
    '',
    '## Tablero (lo que ya escribiste)',
    tableroEnTexto(libro),
    '',
    final ? '## Tu turno · entrega la decisión final' : '## Tu turno · decide',
    final
      ? 'Escribe la decisión FINAL: una línea por fila pasada, con la forma exacta de «Cómo responder» del marco. Solo cuentan esas líneas; lo demás es tu nota.'
      : 'Razona fila por fila y escribe tu decisión con la forma exacta de «Cómo responder» del marco. En el turno siguiente la entregas como final.',
  ].join('\n')
}

/** 11-nov · la mesa de revisión de fallidos (GO de Lenovo 16:46 Zúrich): juzga, pieza por pieza, si un arreglo publicado corrige la causa guardada del fallo. El código verifica después. */
function tareaDeFallidos(o: { tipo: TipoDeTurno; agente: string; tarjeta: Tarjeta | undefined; libro: Aporte[]; c: ContextoDeTurno }): string {
  const { c, agente, libro } = o
  const final = o.tipo !== 'dirigir'
  return [
    `# Revisión de piezas fallidas · ${c.cliente_nombre} · ${c.brief_id}`,
    `Eres **${agente}**${o.tarjeta ? ` — ${o.tarjeta.especialidad}` : ''}. Algunas piezas de la campaña fallaron después de gastar. Decides si un cambio publicado después ya corrigió la causa de cada fallo.`,
    '',
    '## Reglas',
    `1. **Gasto.** Esta revisión tiene un tope de US$ ${c.tope_usd.toFixed(2)} (ya se gastó US$ ${c.gasto_usd.toFixed(2)}). Rehacer una pieza vuelve a gastar dentro del tope de la campaña.`,
    '2. **Por cada pieza, un veredicto con su razón:** rehacerla nombrando el cambio que corrige su causa, o dejarla como está. No hay respuesta por defecto: juzga por lo que dice la causa y lo que hace cada cambio.',
    '3. **El código verifica después** que el cambio nombrado esté en la lista y sea posterior al fallo, que la pieza siga sin rehacerse, que su fecha no haya pasado y que quepa en el tope. Lo que no cumpla no se rehace.',
    '4. **No inventes cambios ni causas.** Decides con lo que está abajo.',
    '',
    o.tarjeta ? seccionDeIndicacion(o.tarjeta, agente) : '',
    '## El marco (las piezas, sus causas y los cambios publicados)',
    recorta(c.brief_texto, DIETA.fallidos.marco, 'el marco'),
    '',
    '## Tablero (lo que ya escribiste)',
    tableroEnTexto(libro),
    '',
    final ? '## Tu turno · entrega los veredictos finales' : '## Tu turno · decide',
    final
      ? 'Escribe los veredictos FINALES: una línea por pieza, con la forma exacta de «Cómo responder» del marco. Solo cuentan esas líneas; lo demás es tu nota.'
      : 'Razona pieza por pieza y escribe tus veredictos con la forma exacta de «Cómo responder» del marco. En el turno siguiente los entregas como finales.',
  ].join('\n')
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
export function pedidoDeAgente(o: { agente: string; task: string; encargo_id: string; client_id: string; dry_run: boolean; paso: string; reserva_usd: number; es_pieza?: boolean }): Record<string, unknown> {
  return {
    agent_name: o.agente, task: o.task, images: [], esquema: 'opinion_libre.v1',
    // 04-nov · de qué trabajo es la llamada: el encargo es la pieza · las cadenas (brief, concepto) aún no tienen id firmado: «sin dato»
    ...(o.es_pieza ? { trabajo_tipo: 'pieza', trabajo_id: o.encargo_id } : {}),
    extra: { indicacion_oficina: 'Mesa de trabajo: aportas como profesional de tu especialidad; texto libre.', paso_de_la_oficina: o.paso, encargo_id: o.encargo_id, mesa: true, mesa_agente: o.agente },
    max_budget_usd: o.reserva_usd, thinking_mode: 'disabled', dry_run: o.dry_run, client_id: o.client_id, workflow_hint: 'oficina · turno',
    // 31-oct: la mesa NO pasa por el editor de run-sdk (los jueces de la jefatura quedan fuera de la mesa, ADR-020); la cabecera va SIEMPRE
    headers_requeridos: { [CABECERA_SALTAR_EDITOR]: '1' },
  }
}
