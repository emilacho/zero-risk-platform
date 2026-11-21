/**
 * LO QUE SE LE PIDE A CADA AGENTE EN SU TURNO · puro. Texto libre en español (tuteo): el agente lee primero el manual, luego el brief y el plan, ve el directorio del equipo y el tablero,
 * y entrega su aporte como lo haría un profesional de su especialidad. NO hay formulario ni topes de caracteres. Solo tres reglas duras.
 */
import { seccionDelDirectorio } from './directorio'
import { refDe } from './libro'
import { COTAS, profundidadMaximaDe, type Aporte, type EstadoMesa, type Tarjeta, type TipoDePieza } from './tipos'
import { NOMBRE_DE_LA_PIEZA } from './aprendizaje'
import type { FotoEtiquetada } from '../fotos'
import { CABECERA_SALTAR_EDITOR } from '../../cadena/constantes'
import { AGENTE_GANCHO_DE_VIDEO, METODO_GANCHO_POR_OMISION, fichasEnTexto, leerFichasPorRed, metodoDeAsiento } from '../../cadena/metodos'
import { BRIEF_GUIA_NO_REGLA } from '../brief'
import { TITULOS_DEL_BRIEF, TITULOS_OBLIGATORIOS_DEL_BRIEF } from '../../cadena/brief-creativo'
import { fichaPorOmision } from '../../video/parametros'
import { tareaDelIngeniero, type ImagenARedactar } from './prompts'
import { lineaDeLaCriticaAlDirigir, seccionDeLaCriticaParaLaDireccion, tareaDeLaCritica } from './critica'
import { fotosALaVista, fotosDeLaLista, REGLA_DE_LOS_ELEMENTOS_REALES, rotuloDeLaFoto } from './fotos-a-la-vista'
import { seccionDelCerebro, type IndiceDeLaMesa } from './indice-del-cerebro'
import type { ImagenDelPedido } from '../../imagenes-del-pedido'
import type { RellenoPendiente } from './de-la-cadena'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'
import { esDeUnAutor, tareaDelAutor } from './un-autor'

export type TipoDeTurno = 'dirigir' | 'aportar' | 'responder' | 'integrar' | 'devolver_citas' | 'rellenar_banco' | 'redactar_prompts' | 'criticar'

export interface ContextoDeTurno {
  cliente_nombre: string
  tipo: TipoDePieza
  brief_id: string
  brief_texto: string
  manual_texto: string
  plan_texto: string | null
  fotos: FotoEtiquetada[]
  /** 18-nov · lo que el cerebro tiene del cliente para esta pieza (el índice que la mesa pidió al abrir): va ENTERO en la cabecera; sin él, la mesa trabaja como antes */
  cerebro?: IndiceDeLaMesa
  /** lo que el portero ya trajo (texto de los aportes `material` va en el tablero) */
  tope_usd: number
  gasto_usd: number
  /** Sprint 2 · S2-1 · solo video: la duración y las propuestas que dice la plantilla (dato) */
  video?: ParametrosDelVideo
  /** 19-nov · ADENDA 1 · P2b (CC5): el bloque del perfil del público (el mismo que leen la jefatura y los pedidos de la oficina) · ausente/vacío = sin sección */
  perfil_texto?: string
}

/** UNA sola función de recorte: nunca corta callado (ADENDAS 5 y 6 de la ORDEN del 31-oct). Sin nombre del documento conserva el aviso corto de siempre. */
const recorta = (t: string, n: number, doc?: string) => (t.length <= n ? t : t.slice(0, n) + (doc ? `\n[… recortado: ${n} de ${t.length} caracteres de ${doc}]` : '\n[…recortado]'))

/**
 * LA DIETA: cuánto de cada documento recibe cada familia de mesa.
 * 19-nov · ADENDA 1 · P2 (CC5 · GO Lenovo 05:17Z · firma de Emilio 18-nov «nada se recorta» y «cada agente recibe los originales completos», que DEROGA la ADENDA 6 / D3):
 *   todas las mesas que leen el manual, el marco o el plan los reciben ENTEROS, hasta el techo del pedido (`TOPE_REAL_DEL_PEDIDO`, con el aviso de recorte si un documento solo
 *   lo pasara). Antes las piezas y el video leían 7000 del manual, 5000 del brief y 3000 del plan: en el reel auditado (INGENIERIA-INVERSA-CC7, 18-nov) la hipótesis B del plan
 *   (carácter 15 114) y el tema de la semana (desde el 11 752) nunca llegaron. La gran idea ahora también recibe el plan (antes 0).
 *   Un 0 no es un recorte: es un documento que esa mesa no usa (fallidos y banco no leen el plan; fallidos tampoco el manual).
 */
const ENTERO = TOPE_REAL_DEL_PEDIDO
export const DIETA: Record<TipoDePieza, { manual: number; marco: number; plan: number }> = {
  carrusel: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  kit: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  post: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  brief: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  concepto: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  video: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  // la reubicación decide fechas: lee los tres enteros
  reubicacion: { manual: ENTERO, marco: ENTERO, plan: ENTERO },
  // 11-nov · la revisión de fallidos juzga causas contra arreglos: lee el marco (las causas y los arreglos) entero; el manual y el plan no los usa
  fallidos: { manual: 0, marco: ENTERO, plan: 0 },
  // 17-nov · la corrección del banco: la idea, la corrección y sus hermanas (el marco) y el manual (la voz) enteros; el plan no lo usa
  banco: { manual: ENTERO, marco: ENTERO, plan: 0 },
}

/**
 * el tablero: TODOS los aportes, cada uno ENTERO.
 * 19-nov · ADENDA 1 · P2 (CC5 · firma de Emilio «nada se recorta»): antes iban enteros solo los 10 más recientes hasta 12 000 (cada uno a 2500) y el resto a 220.
 * En el reel auditado (INGENIERIA-INVERSA-CC7): A12 «De A10 solo vi completo el plano 1», A17 «texto recortado en el tablero», y la crítica leyó mal lo que A9 y A15 habían elegido.
 */
export function tableroEnTexto(libro: Aporte[], o: { materialArriba?: boolean } = {}): string {
  if (!libro.length) return '(el tablero está vacío: eres el primero)'
  // 19-nov · ADENDA 1 · P2b: con `materialArriba`, lo que trajo el portero ya va entero en su propio <documento> (arriba); en el tablero queda su lugar y su ref, sin repetir el texto
  const texto = (a: Aporte) => (o.materialArriba && a.tipo === 'material' ? `(lo que trajo el portero: está arriba, entero, en «${TITULO_DEL_PORTERO}»; cítalo como ${refDe(a)})` : a.texto)
  return libro.map((a) => `**${refDe(a)}** · ${a.de}${a.para ? ` → ${a.para}` : ''} · ${a.tipo}\n${texto(a)}`).join('\n\n')
}

/** 19-nov · ADENDA 1 · P2b (CC5): lo que reunió el portero como un DOCUMENTO propio de la mesa (antes solo dentro del tablero), cada entrega con su ref para citarla */
export const TITULO_DEL_PORTERO = 'Lo que reunió el portero'
export function seccionDelPortero(libro: Aporte[]): string[] {
  const material = libro.filter((a) => a.tipo === 'material')
  if (!material.length) return []
  return [`## ${TITULO_DEL_PORTERO} (cítalo con su A<n>)`, documento('el portero', material.map((a) => `**${refDe(a)}** · ${a.de}\n${a.texto}`).join('\n\n')), '']
}

/** 18-nov · «los creativos ven las fotos»: con `aLaVista`, cada foto dice si llega adjunta como imagen o solo como descripción; sin él, la lista es la de siempre (la reusa el aviso del video) */
export const LISTA_DE_FOTOS = (fotos: FotoEtiquetada[], aLaVista?: ReadonlySet<string>): string => {
  const propias = fotosDeLaLista(fotos)
  if (!propias.length) return '(el cliente no tiene fotos propias disponibles)'
  // en la mesa (con `aLaVista`) cada foto se nombra con el MISMO rótulo con que viaja su imagen (`foto:<id>`): el modelo ve un solo nombre por foto
  return propias.map((f) => `- ${aLaVista ? rotuloDeLaFoto(f.id) : f.id} · ${f.que_muestra ?? 'sin descripción'}${f.oferta?.trim() ? ` · oferta: ${f.oferta.trim()}` : ''}${f.con_personas ? ' · con personas' : ''}${f.etiqueta_confianza ? ` · confianza ${f.etiqueta_confianza}` : ''}${aLaVista ? (aLaVista.has(f.id) ? ' · a la vista' : ' · solo descripción (no llega como imagen; si la necesitas, pídela con `pedir_material`)') : ''}`).join('\n')
}

/**
 * 31-oct · brief creativo de la campaña (`brief_creativo.v1`).
 * 18-nov (T7 · DIAGNÓSTICO CC5 · GO Lenovo): UNA sola plantilla. Esta convención repetía sus propias secciones («## Mensaje», «por red: objetivo · llamado», sin «Público»)
 * y contradecía la referencia del marco: en T7 el brief salió dos veces con el formato viejo. Ahora NO repite nada: remite a la referencia y sus títulos salen de la
 * misma fuente (`TITULOS_DEL_BRIEF` de la cadena).
 */
const CONVENCION_DEL_BRIEF = [
  'Entrega el BRIEF CREATIVO de la campaña tal como lo pide la referencia «El brief creativo de campaña» del marco (sección 2): qué va en cada sección, cómo se cita y lo que NO va en el brief está ahí. El código lee estas secciones, cada una como `## Título`:',
  ...TITULOS_DEL_BRIEF.map((t) => `- ## ${t}`),
  `Obligatorias: ${TITULOS_OBLIGATORIOS_DEL_BRIEF.join(' · ')}. Nada de cifras ni datos del cliente sin fuente: lo que no esté en el material del portero, el manual o el plan va en «Faltantes», nunca se rellena. Toda cita va literal. Idioma y trato: los del manual del cliente.`,
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
  '- luz: <cómo es la luz de toda la campaña> · porqué: <por qué>',
  '- encuadre: <cómo se encuadra> · porqué: <por qué>',
  '- fotos propias: <cuándo y cuáles se usan, foto:<id>> · porqué: <por qué>',
  '- nunca se muestra: <lo que ninguna pieza muestra> · porqué: <por qué>',
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
  '- C<fase>-I<nn> · <red> · <formato o cualquiera> · <idea en una línea> · mensaje: <UNA frase propia de esta idea, al servicio del mensaje de campaña> · gancho: <lo que detiene el scroll> · protagonista: <uno> · serie: S1 · cuadros: <cuántas pantallas pide la idea: una historia o un post = 1; «swipe a…» o una secuencia = una por pantalla> · duración: <SOLO si la idea es video (reel, short, tiktok, video): cuánto dura y por qué, p. ej. «20 s · porque…»> · foto:<id>|ninguna',
  'Cada idea de video trae SIEMPRE su duración estimada con su porqué: es parte del cómo de la idea, como su formato (el brief no la decide). El guion puede ajustarla después.',
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

/**
 * 16-nov · Sprint 2 · S2-1 (CC1) · lo que la plantilla del video dice de la duración y de las propuestas (DATO: `limites.video`). Sin él, la mesa trabaja como hasta hoy:
 * un solo guion, con la duración que admite el modelo por omisión (17-nov · T1: su ficha; antes, 8 a 15 s fijos).
 */
export interface ParametrosDelVideo {
  segundos_min: number
  segundos_max: number
  /** cuántas propuestas completas presenta la mesa para la aprobación del dueño (1 = un solo guion, como hasta hoy) */
  propuestas: number
  /** 18-nov · T5 tramo 3 · la plantilla compone el video (`limites.video.componer: true`): solo entonces la hoja ofrece «## Subtítulos» */
  componer?: boolean
}
export const VIDEO_POR_OMISION: ParametrosDelVideo = { segundos_min: fichaPorOmision().segundos_min, segundos_max: fichaPorOmision().segundos_max, propuestas: 1 }

/** el plano de la HOJA (Sprint 2 · S2-1): lo que se pide por plano; el traductor tolera lo que falte y lo avisa */
const PLANO_DE_LA_HOJA = (n: number, tiempos: string, extra = '') => [
  `## Plano ${n} · ${tiempos}${extra}`,
  'Rol: captar | situar | informar | prueba | giro | conclusion | llamado | ambiente   (guía: si es otro, nómbralo)',
  'Dice: … (la información NUEVA que da este plano; si no da nada nuevo, sobra)',
  'Intención: … (lo que logra en quien mira)',
  'Se ve: … (qué muestra la cámara: producto, lugar, acción, personas)',
  'Producto: sí | no   (¿sale el producto en cuadro?)',
  'Tamaño: … (general, medio, primer plano, detalle) · Lente: … · Luz: …',
  'Movimiento: … (UN solo movimiento de cámara: fija, paneo, acercamiento, cámara en mano…)',
  'Termina en: … (cómo queda el cuadro al final: posición, luz, utilería; el plano siguiente lo continúa)',
  'Texto en pantalla: … (solo si lo lleva; literal, corto: se compone en edición, la IA no lo escribe)',
  'Foto: foto:<id de una foto propia>, foto:<id> · <por qué la elegiste, en una frase> | ninguna   (en todo plano que muestre un elemento real del cliente: producto o plato, el local, un uniforme, un empaque; la 1.ª es el cuadro, las demás van de referencia)',
  'Personajes: <los nombres de «## Personajes» que salen en este plano> | ninguno   (solo si la pieza tiene personajes; un personaje de la marca que sale en cuadro va aquí)',
  'Prompt de imagen: … (en inglés: el cuadro clave del plano, con el tipo de imagen y el estilo que fija el manual del cliente para producir con IA (si el manual no trae esa sección, su DIRECCIÓN DE FOTOGRAFÍA), sin texto en la imagen)',
  'Prompt de video: … (en inglés: solo el movimiento y la cámara desde ese cuadro, el proceso de la acción y cómo termina)',
].join('\n')

/** 17-nov · Sprint 3 · T2 · la ficha de personaje: herramienta opcional (Emilio 11:58 «nada obligatorio»): la mesa la escribe solo si la pieza tiene personajes que vuelven en varios planos */
const PERSONAJES_DE_LA_PIEZA = [
  '## Personajes   (opcional: solo si alguien vuelve a salir en varios planos, o si sale un personaje de la marca; si no, no escribas esta sección)',
  '- <Nombre>: <cómo es: edad, rasgos, pelo, ropa> · Fotos: foto:<id> (solo fotos propias que lo muestren; una persona real, solo con su permiso registrado)',
  '- Un personaje de la marca (mascota, ilustración, figura) lleva SIEMPRE la foto que lo muestra en «Fotos:». Si ninguna lo muestra, se escribe como nuevo: «- <Nombre>: <cómo es> · creación nueva · basada en foto:<id>» (la foto es solo base de estilo), nunca «uno parecido» como si fuera el real.',
]

const CIERRE_DE_LA_PIEZA = ['## Audio', '<lo que suena: música, ambiente, voz, diálogo o locución, lo que pida la pieza>', '## Pie', '<el pie de foto de la publicación>', '## Etiquetas', '#una #otra']
/** 18-nov · T5 tramo 3 · la sección de subtítulos se ofrece SOLO si la plantilla compone el video (`limites.video.componer`): apagado, la hoja es la de siempre, letra por letra */
const SUBTITULOS_DE_LA_PIEZA = ['## Subtítulos   (opcional: solo si la pieza tiene voz y los quieres; si no, no escribas esta sección)', 'sí · Energía: alta | conversacion | calma · Idioma: <el de la voz, en dos letras: es, en, pt…>']
const cierreDeLaPieza = (v: ParametrosDelVideo) => [...CIERRE_DE_LA_PIEZA.slice(0, 2), ...(v.componer ? SUBTITULOS_DE_LA_PIEZA : []), ...CIERRE_DE_LA_PIEZA.slice(2)]

/** T8 · 31-oct · el GUION del video corto (la mesa lo escribe; el brazo lo filma tal cual) · Sprint 2 · S2-1: la HOJA DE PLANOS y, si la plantilla lo pide, N propuestas */
export function convencionDelGuion(v: ParametrosDelVideo = VIDEO_POR_OMISION): string {
  const dura = v.segundos_min === v.segundos_max ? `${v.segundos_min} s` : `de ${v.segundos_min} a ${v.segundos_max} s`
  const variasPropuestas = v.propuestas > 1
  const cuerpo = variasPropuestas
    ? [
        `# Propuesta 1 · <nombre corto>`,
        'Concepto: <la idea de este video en una frase>',
        'Duración: <N s> · Red: <la red> · Objetivo: <lo que tiene que lograr>',
        'Por qué: <por qué esta propuesta logra el objetivo>',
        ...PERSONAJES_DE_LA_PIEZA,
        PLANO_DE_LA_HOJA(1, '0–3 s'),
        '## Plano 2 · 3–8 s   (…una sección por plano)',
        ...cierreDeLaPieza(v),
        `# Propuesta 2 · <nombre corto>   (…lo mismo, hasta la Propuesta ${v.propuestas})`,
        '# Citas',
        'A3 usé: <qué tomaste de ese aporte>',
        'A5 descarté: <por qué no lo usaste>',
      ]
    : [...PERSONAJES_DE_LA_PIEZA, PLANO_DE_LA_HOJA(1, '0–3 s'), `## Plano 2 · 3–8 s   (…una sección por plano; el video dura ${dura} en total)`, ...cierreDeLaPieza(v), '## Citas', 'A3 usé: <qué tomaste de ese aporte>', 'A5 descarté: <por qué no lo usaste>']
  return [
    variasPropuestas
      ? `Escribe ${v.propuestas} PROPUESTAS COMPLETAS y DISTINTAS del video (concepto, duración, red, objetivo y su hoja de planos cada una). El dueño elige UNA antes de producir: no son variantes de lo mismo, son caminos distintos que valga la pena comparar. Usa esta convención ligera (no es un formulario):`
      : 'Escribe el GUION COMPLETO del video como HOJA DE PLANOS, con esta convención ligera (no es un formulario: es para que el equipo de video lo filme tal cual):',
    variasPropuestas ? 'Tu respuesta SON las propuestas y nada más: empieza directamente en «# Propuesta 1». No escribas antes ni después lo que vas a hacer, lo que leíste o que ya tienes lo necesario.' : FRASE_SIN_NOTAS_DE_TRABAJO,
    '```',
    ...cuerpo,
    '```',
    `La duración la propones tú según el plan, la red y el objetivo de la pieza, ${dura}; los tiempos de cada plano van en su encabezado y suman la duración del video.`,
    'Cada plano cumple UN rol en la historia y da información nueva; el producto entra pronto. Lo que escribes en cada campo es EXACTAMENTE lo que usa el equipo de video: una sola versión final, sin "Variante A/B", sin markdown.',
    `El Plano 1 es el gancho y hay UNO solo${variasPropuestas ? ' por propuesta' : ''}: el que propuso ${VOZ_DEL_GANCHO} e integró ${QUIEN_INTEGRA_EL_GANCHO}. Si en el tablero hay dos ganchos, ${variasPropuestas ? 'cada propuesta lleva uno y los demás se citan' : `el guion lleva el de ${VOZ_DEL_GANCHO} y el otro se cita como descartado`}.`,
    'Las fotos propias del cliente son la referencia de lo que muestran (nómbrala en «Foto:»): en qué plano va cada una lo decides tú, también en los de ambiente (la fachada, el local, el equipo). No inventes textos, precios ni sellos en pantalla que no estén en el brief, el manual o el material del portero. Se pueden mostrar personas y rostros generados; nunca la cara de una persona real identificable sin permiso.',
    'El pie ("## Pie") es el texto de publicación final, sin hashtags (esos van solo en "## Etiquetas", una vez cada uno) y con la voz del manual.',
  ].join('\n')
}

/** 17-nov · tramo B · la FOTO con mesa: UNA imagen (foto propia, generada o ninguna), lo que va escrito sobre ella y el texto de la publicación. Lo escrito sobre la imagen es opcional: la mesa decide si la foto lleva texto */
const CONVENCION_DEL_POST = [
  'Escribe la PIEZA COMPLETA con esta convención ligera (es para quien compone y publica; no es un formulario):',
  '```',
  '## Objetivo',
  '<qué tiene que lograr esta publicación, en una frase> · <el llamado>',
  '## Concepto',
  '<la idea de la pieza, en una frase>',
  '## Pieza',
  'Sobre-título: … (opcional)',
  'Título: … (lo que va escrito sobre la imagen; vacío si la imagen va sin texto)',
  'Texto: … (opcional)',
  'Llamado: … (opcional)',
  'Qué se ve: <la escena: lugar, quién, qué pasa, luz>',
  'Imagen: foto:<id de una foto propia> | generar: <qué debe mostrarse> | ninguna',
  '## Pie',
  '<el texto de la publicación>',
  '## Etiquetas',
  '#una #otra',
  '## Citas',
  'A3 usé: <qué tomaste de ese aporte>',
  'A5 descarté: <por qué no lo usaste>',
  '```',
  'Lo que escribes en Sobre-título, Título, Texto y Llamado es EXACTAMENTE lo que se compone sobre la imagen: una sola versión final por campo. El pie («## Pie») es el texto de publicación final, sin hashtags (van solo en «## Etiquetas») y con la voz del manual.',
].join('\n')

export const CONVENCION_DE_LA_PIEZA = (tipo: TipoDePieza, video?: ParametrosDelVideo): string => tipo === 'brief' ? CONVENCION_DEL_BRIEF : tipo === 'concepto' ? CONVENCION_DEL_CONCEPTO : tipo === 'video' ? convencionDelGuion(video) : tipo === 'carrusel'
  ? [
      'Escribe la PIEZA COMPLETA con esta convención ligera (no es un formulario: es para que el equipo de dibujo la lea):',
      '```',
      '## Objetivo',
      '<qué tiene que lograr esta pieza, en una frase> · <el llamado>',
      '## Concepto',
      '<la idea de la pieza entera, en una frase>',
      '## Lámina 1 · hook',
      'Título: …',
      'Texto: …',
      'Llamado: … (solo en la lámina que lo lleve)',
      'Qué se ve: <la escena de ESTA lámina: lugar, quién, qué pasa, luz>',
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
  : tipo === 'post' ? CONVENCION_DEL_POST
  : [
      'Escribe la PIEZA COMPLETA con esta convención ligera: una sección por elemento del brief, con su identificador. Si un elemento necesita más de un cuadro (p. ej. un «swipe» a otra imagen), escribe una sección por cuadro con el MISMO identificador («## e01 · cuadro 2»): cada cuadro es una historia más, con el mismo destino, día y hora:',
      '```',
      '## Objetivo',
      '<qué tiene que lograr esta pieza, en una frase> · <el llamado>',
      '## <ref del elemento>',
      'Título: …',
      'Texto: …',
      'Llamado: …',
      'Ambiente: …',
      'Qué se ve: <la escena de ESTE elemento: lugar, quién, qué pasa, luz>',
      'Firma: <la línea chica al pie del cuadro (marca · zona · web), si lleva; si no, no escribas el campo>',
      'Imagen: foto:<id de una foto propia> | generar: <qué debe mostrarse> | ninguna',
      '## Citas',
      'A3 usé: <qué tomaste de ese aporte>',
      'A5 descarté: <por qué no lo usaste>',
      '```',
    ].join('\n')

/** «de 8 a 15 s» · la duración que admite la plantilla (dato; sin él, la del modelo) */
const duracionDe = (v?: ParametrosDelVideo) => { const x = v ?? VIDEO_POR_OMISION; return x.segundos_min === x.segundos_max ? `${x.segundos_min} s` : `de ${x.segundos_min} a ${x.segundos_max} s` }

const REGLAS_DURAS = (c: ContextoDeTurno): string => [
  '## Las únicas tres reglas duras',
  `1. **Gasto.** La pieza tiene un tope de US$ ${c.tope_usd.toFixed(2)} (ya se gastó US$ ${c.gasto_usd.toFixed(2)}). Cuida cada turno: no repitas lo que ya está en el tablero.`,
  '2. **No inventes datos que comprometan al cliente**: certificaciones, normas, precios, cifras, teléfonos, usuarios, marcas ajenas ni nada que no esté en el manual, el brief, el plan, las fotos o el material del portero. Si te falta un dato, dilo o pídelo; no lo rellenes. Una imagen generada tampoco debe mostrar textos, sellos, normas ni lecturas de instrumentos inventados.',
  c.tipo === 'video'
    ? `3. **El guion debe poder filmarse por un modelo de video**: planos con sus segundos (${duracionDe(c.video)} en total), qué se ve en cada uno, el movimiento de cámara y la foto propia de referencia si la hay. Voz, diálogo, locución, rostros y personajes generados los decides tú según la pieza; lo único que no va es la cara o la voz de una persona real identificable sin su permiso registrado. El modelo no escribe letras: el texto que deba verse va en «Texto en pantalla» del plano y se compone después con la marca. Lo demás es tu criterio.`
    : '3. **La pieza debe poder dibujarse**: cada lámina es un título, un texto corto, un llamado (si lo lleva) y una imagen. Lo demás es tu criterio; sin límites de caracteres: si algo es largo, el dibujo se ajusta o el equipo lo parte.',
].join('\n')

/** 18-nov · con el índice del cerebro, el empleado pide por número los originales completos y los lee en su mismo turno */
const HERRAMIENTA_PEDIR_FICHAS = '- `pedir_fichas(numeros)`: te trae, en este mismo turno, el original completo de las fichas del índice «Lo que sabemos del cliente» que pidas por su número. Si un número no existe, dice «no consta».'

/** 18-nov · T7d (encargo de Lenovo, arreglos 2 y 3): la forma de trato la fija el manual y la juzga el agente (no hay lista de código); el texto entregado no narra el trabajo */
export const LA_FORMA_DE_TRATO = '- **La forma de trato es la del manual.** Si el manual tutea, tutea siempre, también en mensajes, ganchos y llamados: nunca voseo. Se escribe «pídelo», «pagas», «sabes», «ven», «mira»; nunca «pedilo», «pagás», «sabés», «vení», «mirá».'
export const FORMA_DE_TRATO_Y_SIN_CHARLA = [
  '## Cómo escribes',
  LA_FORMA_DE_TRATO,
  '- **Tu respuesta es el texto que se entrega, no el relato de tu trabajo.** No narres lo que vas a hacer o lo que te dijo el sistema («voy a leer el tablero…», «el sistema indica…»): empieza directamente con el contenido.',
].join('\n')

const HERRAMIENTAS = (tipo: TipoDePieza): string => [
  '## Cómo trabajas con el equipo',
  'Trabajamos en EQUIPO sobre este tablero. Tu respuesta final de este turno ES tu aporte (texto libre, escrito como lo haría un profesional de tu especialidad). Si necesitas algo de un compañero:',
  '- `mesa_pedir(a, que, para_que)`: le anotas un pedido en el tablero; responde en SU turno (no esperas).',
  '- `mesa_devolver(a, comentarios)`: le devuelves su aporte con comentarios.',
  '- `pedir_material(que, para_que)`: si te falta material del cerebro del cliente (datos, fotos, hechos), se lo pides al portero; lo que trae vuelve al tablero. Úsalo solo si de verdad lo necesitas; si no, sigue.',
  `Máximo ${profundidadMaximaDe(tipo)} niveles de pedidos encadenados y ${COTAS.MAX_IDAS_VUELTAS_POR_PAREJA} idas y vueltas con un mismo compañero: después decide la dirección creativa con lo que haya.`,
].join('\n')

/**
 * 18-nov · RELLENO DEL BANCO (CC1 · la (b) de Lenovo): la dirección ya integró la gran idea; el banco no llega a la cuota del plan en UN capítulo. Escribe solo las que faltan.
 * No reescribe la integración: lo que escriba se suma al banco detrás de las ideas del equipo (con ids únicos).
 */
export function tareaDelRelleno(r: RellenoPendiente | undefined): string {
  if (!r) return '## Tu turno · DIRECCIÓN CREATIVA: relleno del banco\nNo hay capítulo pendiente: contesta «Sin aporte: el banco ya llega a la cuota».'
  const total = r.redes.reduce((n, x) => n + x.faltan, 0)
  return [
    `## Tu turno · DIRECCIÓN CREATIVA: completa el banco del capítulo «${r.capitulo}»`,
    `Tu gran idea ya está integrada y no se toca. Al banco de este capítulo le faltan **${total} ideas** para cubrir el calendario del plan:`,
    ...r.redes.map((x) => `- ${x.red}: faltan ${x.faltan} (la cuota es ${x.esperadas})`),
    '',
    `Escribe SOLO las ideas que faltan, una por línea, con el formato del banco y numeradas desde **C${r.prefijo}-I${String(r.desde).padStart(2, '0')}**:`,
    `- C${r.prefijo}-I${String(r.desde).padStart(2, '0')} · <red> · <formato> · <idea> · mensaje: <mensaje propio> · gancho: <gancho> · duración: <solo si es video: «N s · porqué»>`,
    'Cada idea cuenta lo que dice el capítulo en tu gran idea, con un mensaje y un gancho que no repiten los de las ideas que ya están. No inventes datos del cliente: usa lo que está en el tablero y en el marco.',
    ...(r.ya_estan.length ? ['', '## Ya están en el banco de este capítulo (no las repitas)', ...r.ya_estan.map((i) => `- ${i.id} · ${i.red} · ${i.mensaje}`)] : []),
  ].join('\n')
}

/** 19-nov · GO Lenovo «la gran idea sin el plan» (firma de Emilio 20:39, decisión del 18-nov): lo que lee la gran idea donde las demás mesas leen el plan */
export const LA_GRAN_IDEA_SIN_PLAN = '(el brief de la campaña ya es la lectura del plan: no se repite aquí)'

export function armarTarea(o: { tipo: TipoDeTurno; agente: string; tarjeta: Tarjeta | undefined; est: EstadoMesa; libro: Aporte[]; c: ContextoDeTurno; pedido?: Aporte; faltanCitas?: string; extra?: string; metodo?: string; /** Sprint 1 · mejora 4 · las imágenes a generar de la pieza integrada (turno del ingeniero de prompts) */ imagenesARedactar?: ImagenARedactar[]; /** 18-nov · relleno del banco: qué capítulo y cuántas faltan por red (lo calcula de-la-cadena con la lectura de la cadena) */ relleno?: RellenoPendiente }): string {
  if (o.c.tipo === 'reubicacion') return tareaDeReubicacion(o)
  if (o.c.tipo === 'fallidos') return tareaDeFallidos(o)
  if (o.c.tipo === 'banco') return tareaDelBanco(o)
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
    FORMA_DE_TRATO_Y_SIN_CHARLA,
    '',
    HERRAMIENTAS(c.tipo),
    ...(c.cerebro ? [HERRAMIENTA_PEDIR_FICHAS] : []),
    '',
    seccionDelDirectorio(est.directorio_congelado, agente),
    '',
    '## 1 · Manual de marca (léelo PRIMERO)',
    documento('el manual de marca', recorta(c.manual_texto || '(sin manual)', DIETA[c.tipo].manual, 'el manual de marca')),
    '',
    c.tipo === 'brief' ? '## 2 · El marco de la campaña (estrategia, fases, canales, hitos, sedes y fechas)' : c.tipo === 'concepto' ? '## 2 · El brief de la campaña y las fases de la estrategia' : `## 2 · El brief de este entregable (${BRIEF_GUIA_NO_REGLA})`,
    documento(c.tipo === 'brief' ? 'el marco de la campaña' : c.tipo === 'concepto' ? 'el brief de la campaña' : 'el brief de este entregable', recorta(c.brief_texto, DIETA[c.tipo].marco, 'el marco')),
    '',
    '## 3 · El plan de trabajo',
    // 19-nov · GO Lenovo (firma de Emilio 20:39): la gran idea parte del brief, que ya es la lectura del plan; el plan entero va a la jefatura · las demás mesas lo reciben entero
    ...(c.tipo === 'concepto' ? [LA_GRAN_IDEA_SIN_PLAN] : [
      c.plan_texto ? documento('el plan de trabajo', recorta(c.plan_texto, DIETA[c.tipo].plan, 'el plan')) : '(sin plan)',
    ]),
    '',
    // 19-nov · ADENDA 1 · P2b: el perfil del público, entero, como un documento más (antes la mesa no lo recibía)
    ...(c.perfil_texto ? ['## El perfil del público', documento('el perfil del público', c.perfil_texto), ''] : []),
    '## Fotos propias del cliente (ids para `Imagen: foto:<id>`)',
    LISTA_DE_FOTOS(c.fotos, new Set(fotosALaVista(c.fotos).map((f) => f.id))),
    '',
    ...(fotosDeLaLista(c.fotos).length ? [REGLA_DE_LOS_ELEMENTOS_REALES, ''] : []),
    ...seccionDelPortero(libro),
    ...(c.cerebro ? [seccionDelCerebro(c.cerebro), ''] : []),
    '## Tablero (aportes hasta ahora; cita con A<n>)',
    tableroEnTexto(libro, { materialArriba: true }),
    '',
  ].join('\n')

  // Sprint 4 · E · lo que la dirección sabe de la crítica de esta ronda (solo si la mesa tiene crítico; sin él, la tarea es la de siempre)
  const laCritica = tipo === 'integrar' || tipo === 'devolver_citas' ? seccionDeLaCriticaParaLaDireccion(est, libro) : null
  // 21-nov (#36 del barrido) · al abrir, la dirección sabe que la crítica corre sola: no la pide aparte (la doble crítica de T7d)
  const laCriticaAlDirigir = tipo === 'dirigir' ? lineaDeLaCriticaAlDirigir(est) : null
  const tu: Record<TipoDeTurno, string> = {
    dirigir: [
      '## Tu turno · DIRECCIÓN CREATIVA: abre la pieza',
      ...(c.tipo === 'brief'
        ? ['Lee el manual, el plan, la estrategia (el marco) y lo que el portero trajo al tablero. Escribe el **brief creativo de la campaña** con las secciones de la referencia «El brief creativo de campaña» del marco (lo único que hay que comunicar es UNA proposición; los faltantes se declaran, nunca se rellenan). Si te falta material del cliente, pídelo con `pedir_material`.']
        : c.tipo === 'concepto'
        ? ['PRIMERO lee el brief de la campaña con estos 6 criterios: (1) un solo mensaje, (2) insight real, (3) objetivo claro, (4) está planteado como problema y no como solución, (5) es fiel al plan y al manual, (6) se puede crear con lo que trajo el portero. Si alguno falla, **devuelve el brief UNA vez**: escribe una sección `## Devolución del brief` con los puntos que fallan y nada más (la mesa se cierra y la cadena pide un brief nuevo). Si el brief sirve, sigue: del brief y el manual, escribe **EL PROBLEMA en una frase**, y reparte lo que necesitas de cada compañero. Cada uno propondrá 2 o 3 caminos distintos con su porqué, pensados para 90 días.']
        : c.tipo === 'video'
        ? [`Lee el manual, luego el brief y el plan. Escribe tu **idea rectora** del video corto${(c.video?.propuestas ?? 1) > 1 ? ` y los ${c.video!.propuestas} caminos DISTINTOS que vas a proponer al dueño (cada uno con su concepto, duración, red y objetivo)` : ''}: qué vas a contar y en cuántos segundos (los propones tú según el plan, la red y el objetivo: ${duracionDe(c.video)}), con qué estructura de planos y qué rol cumple cada uno, qué fotos propias sirven de referencia y qué necesitas de cada compañero (guion y pedido al generador, storyboard, el gancho final y su puerta de retención (el coach, única voz), texto del pie, coherencia de Instagram o formato nativo de TikTok/Reels si están en la mesa).`, REGLA_DEL_GANCHO + ' Tú no propones el gancho: lo pides y lo integras en la pieza.']
        : ['Lee el manual, luego el brief y el plan. Abre con **`Objetivo de la pieza:`** qué tiene que lograr esta pieza, en una frase, y su llamado (parte del OBJETIVO y del concepto que trae el brief; si el brief no lo dice, decláralo tú y dilo). Luego escribe tu **idea rectora**: qué vas a contar, con qué tono y estructura, qué escena muestra cada lámina o elemento (no copies los planos del brief: el «visual de la campaña» es referencia), qué imágenes imaginas (fotos propias vs. generadas) y qué necesitas de cada compañero.']),
      'El equipo completo participa en cada pieza: la oficina se formó con estos especialistas por razones concretas. Cada uno aportará su especialidad; no escribas tú todo. Si ya sabes que te falta material del cliente, pídelo con `pedir_material`.',
      ...(laCriticaAlDirigir ? [laCriticaAlDirigir] : []),
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
        : [...(c.tipo === 'video' ? [REGLA_DEL_GANCHO] : []), CONVENCION_DE_LA_PIEZA(c.tipo, c.video)]),
      ...(o.extra ? ['', o.extra] : []),
      ...(laCritica ? ['', laCritica] : []),
    ].join('\n'),
    devolver_citas: [
      '## Tu turno · DIRECCIÓN CREATIVA: completa las citas',
      // 18-nov · la devolución NO reescribe la pieza (Emilio 14:00, Lenovo 13:08Z opción 1): el director escribe solo las citas que faltan y el código las pega
      'Tu integración anterior queda guardada y **no se reescribe**. Al revisar sus citas, el código encontró esto:',
      o.faltanCitas ?? '- algunas especialidades del equipo no están citadas (revisa cada aporte del tablero)',
      '',
      '**Escribe SOLO las líneas de cita que faltan**, una por línea, con el formato de siempre: `A<n> usé: <por qué>` o `A<n> descarté: <por qué>`. Tú decides, con criterio, si cada aporte lo usaste o lo descartaste; el motivo dice algo concreto.',
      'No repitas la pieza ni agregues nada más: el código pega tus líneas dentro de «## Citas» de tu integración, y una línea nueva de un A<n> reemplaza la que ya tenía.',
    ].join('\n'),
    rellenar_banco: tareaDelRelleno(o.relleno),
    redactar_prompts: tareaDelIngeniero(o.imagenesARedactar ?? []),
    criticar: tareaDeLaCritica(agente),
  }
  // 19-nov · la tanda B (un solo autor): el autor escribe y los especialistas revisan; los turnos que cambian son dirigir, aportar e integrar (los demás, los de siempre)
  if (esDeUnAutor(est) && (tipo === 'dirigir' || tipo === 'aportar' || tipo === 'integrar')) {
    tu[tipo] = tareaDelAutor({ tipo, agente, libro, propuestas: c.video?.propuestas ?? est.imagen?.propuestas ?? 1, convencion: CONVENCION_DE_LA_PIEZA(c.tipo, c.video) })
  }
  return cab + seccionDeIndicacion(o.tarjeta, agente) + (o.metodo ? o.metodo + '\n\n' : '') + antesDeEscribir(tipo) + tu[tipo]
}

/**
 * 19-nov · ADENDA 1 · P1 · EL MOLDE COMÚN DEL PEDIDO (CC5 · GO Lenovo 05:17Z · firma de Emilio 18-nov, Lenovo 15:32Z):
 *   (b) los documentos van ARRIBA, cada uno en `<documento fuente="…">`; la instrucción y las notas del dueño van al final;
 *   (c) antes de escribir, el agente COPIA textual lo que los originales dicen del alcance (zona, canal, público, oferta);
 *   (d) el pedido dice qué se conserva tal cual;
 *   (e) el pedido CIERRA reescribiendo el objetivo (`cierreConElObjetivo`, que el orquestador pega detrás de las notas del dueño).
 * El bloque «Alcance (copiado):» va solo en los turnos que escriben en el TABLERO (dirigir, aportar, responder): en los que entregan algo que el código lee
 * (la integración, el relleno, los prompts, la crítica) no se agrega nada a la salida; la devolución de citas no lleva molde (solo escribe líneas de cita).
 */
export const documento = (fuente: string, texto: string): string => `<documento fuente="${fuente}">\n${texto}\n</documento>`
export const ALCANCE_COPIADO = 'Alcance (copiado):'
const TURNOS_DEL_TABLERO: ReadonlySet<TipoDeTurno> = new Set(['dirigir', 'aportar', 'responder'])
export const LO_QUE_SE_CONSERVA =
  'Conserva TAL CUAL lo que viene de los documentos: cifras, precios, horarios, direcciones, sedes, nombres propios, cuentas y canales del cliente, lo prohibido del manual y lo que esté marcado como pendiente (un pendiente nunca se afirma como hecho: se dice que falta).'
export function antesDeEscribir(tipo: TipoDeTurno): string {
  if (tipo === 'devolver_citas') return ''
  return [
    '## Antes de escribir',
    ...(TURNOS_DEL_TABLERO.has(tipo)
      ? [`Empieza tu respuesta con **«${ALCANCE_COPIADO}»**: copia TEXTUAL de los documentos de arriba lo que dicen de la **zona** (ciudad, sede o barrio), el **canal** (red y formato), el **público** y la **oferta**, cada uno con su fuente entre paréntesis. Si los documentos no lo dicen, escribe «no lo dicen»; no lo completes tú. Después, tu aporte (si te toca abrir la pieza, el «Objetivo de la pieza:» va justo debajo del alcance).`]
      : ['Antes de entregar, revisa tu trabajo contra el alcance que el equipo copió en el tablero («Alcance (copiado):»): zona, canal, público y oferta. No agregues ese bloque a tu entrega.']),
    LO_QUE_SE_CONSERVA,
    '',
    '',
  ].join('\n')
}
const OBJETIVO_DE_LA_HOJA = /^- OBJETIVO: (.+)$/m
/** (e) la última sección del pedido: el objetivo, reescrito (va DETRÁS de las notas y los cambios del dueño) */
export function cierreConElObjetivo(c: Pick<ContextoDeTurno, 'tipo' | 'brief_texto'>, tipo: TipoDeTurno): string {
  // la devolución de citas no lleva molde; reubicación, fallidos y banco tienen su propio armador (su molde va aparte)
  if (tipo === 'devolver_citas' || c.tipo === 'reubicacion' || c.tipo === 'fallidos' || c.tipo === 'banco') return ''
  const objetivo = c.tipo === 'brief'
    ? 'un brief creativo fiel al plan y al manual, con UN solo mensaje que la campaña tiene que comunicar'
    : c.tipo === 'concepto'
    ? 'una gran idea que sirva a todo el plan de la campaña y sea fiel a su brief'
    : (() => { const m = OBJETIVO_DE_LA_HOJA.exec(c.brief_texto); return m ? `que esta pieza logre su objetivo: «${m[1].trim()}»` : 'que esta pieza logre el objetivo de su brief (el brief no lo declara: decláralo tú y dilo)' })()
  return `\n\n## Lo que importa\nEl objetivo: ${objetivo}. Todo lo que escribas en este turno sirve a eso.`
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

/** 17-nov · la mesa «corrección del banco» (GO de Lenovo · cambio 4): la dirección de la gran idea, como CREADORA, toma o no una corrección de la jefatura sobre UNA idea. El código verifica después. */
function tareaDelBanco(o: { tipo: TipoDeTurno; agente: string; tarjeta: Tarjeta | undefined; libro: Aporte[]; c: ContextoDeTurno }): string {
  const { c, agente, libro } = o
  const final = o.tipo !== 'dirigir'
  return [
    `# Corrección de una idea del banco · ${c.cliente_nombre} · ${c.brief_id}`,
    `Eres **${agente}**${o.tarjeta ? ` — ${o.tarjeta.especialidad}` : ''}. Escribiste la gran idea de esta campaña y su banco de ideas. La jefatura encontró un problema en UNA idea y te la devuelve: tú decides si tomas la corrección entera, en parte o no la tomas.`,
    '',
    '## Reglas',
    `1. **Gasto.** Esta corrección tiene un tope de US$ ${c.tope_usd.toFixed(2)} (ya se gastó US$ ${c.gasto_usd.toFixed(2)}).`,
    '2. **Solo esta idea.** Puedes cambiar su idea, su mensaje, su gancho o su protagonista, o retirarla del banco. No cambias la red, el formato, la serie ni otras ideas.',
    '3. **Una regla dura se toma sí o sí.** Si el marco dice que la corrección cita una regla dura, «no la tomo» no vale: corrígela o retírala.',
    '4. **No inventes datos.** La línea de la ficha que cita la jefatura es el dato; no agregues ofertas, precios ni fechas que no estén en el marco.',
    '5. **El código verifica después** que la idea siga como estaba, que solo cambies esos campos y que expliques lo que no tomas. Lo que no cumpla no se escribe.',
    // 18-nov · observación de CC6 en #1173: esta mesa REESCRIBE líneas del banco, así que también lleva la forma de trato del manual (solo eso: su formato de respuesta es otro)
    `6. ${LA_FORMA_DE_TRATO.replace(/^- /, '')}`,
    '',
    o.tarjeta ? seccionDeIndicacion(o.tarjeta, agente) : '',
    '## El marco (la idea, la corrección y las otras ideas de su capítulo)',
    recorta(c.brief_texto, DIETA.banco.marco, 'el marco'),
    '',
    '## El manual de marca (contexto de la voz)',
    recorta(c.manual_texto || '(sin manual)', DIETA.banco.manual, 'el manual de marca'),
    '',
    '## Tablero (lo que ya escribiste)',
    tableroEnTexto(libro),
    '',
    final ? '## Tu turno · entrega tu respuesta final' : '## Tu turno · decide',
    final
      ? 'Escribe tu respuesta FINAL con la forma exacta de «Cómo responder» del marco: un solo bloque JSON al final. Solo cuenta ese bloque; lo demás es tu nota.'
      : 'Razona la corrección y escribe tu respuesta con la forma exacta de «Cómo responder» del marco. En el turno siguiente la entregas como final.',
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
export function pedidoDeAgente(o: { agente: string; task: string; encargo_id: string; client_id: string; dry_run: boolean; paso: string; reserva_usd: number; es_pieza?: boolean; /** 18-nov · las fotos propias a la vista (`imagenesDelTurno`); sin ellas, el pedido de siempre */ images?: ImagenDelPedido[]; /** 18-nov · la mesa ya lee el índice del cerebro: el corredor no empuja trozos (lo lee en `extra.sin_empuje`) */ sin_empuje?: boolean }): Record<string, unknown> {
  return {
    agent_name: o.agente, task: o.task, images: o.images ?? [], esquema: 'opinion_libre.v1',
    // 04-nov · de qué trabajo es la llamada: el encargo es la pieza · las cadenas (brief, concepto) aún no tienen id firmado: «sin dato»
    ...(o.es_pieza ? { trabajo_tipo: 'pieza', trabajo_id: o.encargo_id } : {}),
    extra: { indicacion_oficina: 'Mesa de trabajo: aportas como profesional de tu especialidad; texto libre.', paso_de_la_oficina: o.paso, encargo_id: o.encargo_id, mesa: true, mesa_agente: o.agente, ...(o.sin_empuje ? { sin_empuje: true } : {}) },
    max_budget_usd: o.reserva_usd, thinking_mode: 'maximo', dry_run: o.dry_run, client_id: o.client_id, workflow_hint: 'oficina · turno',
    // 31-oct: la mesa NO pasa por el editor de run-sdk (los jueces de la jefatura quedan fuera de la mesa, ADR-020); la cabecera va SIEMPRE
    headers_requeridos: { [CABECERA_SALTAR_EDITOR]: '1' },
  }
}
