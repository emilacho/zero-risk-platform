/**
 * INSTALACIONES E1 (oficina de marketing · PLAN v3 T7 · FIRMA de Emilio 31-oct 16:30Z) · CC#1.
 * Tres agentes del repositorio de origen (MIT) entran a la mesa: encanto de marca, formato corto e imágenes con personas. LinkedIn Content Creator queda
 * DIFERIDO (E1: solo cuando un cliente use LinkedIn). Aquí vive lo que es DATO y no identidad:
 *  · la procedencia fijada al commit (la misma que llevan los `.md` y la migración `202610312007`);
 *  · la INDICACIÓN OBLIGATORIA de cada uno (la identidad queda en inglés tal cual; la indicación dice en qué idioma y trato responde y qué NO hace);
 *  · la tarjeta de directorio SUGERIDA (`oficina_directorio` es de CC2: la siembra en T6 con estos textos; las condiciones `si_…` las calcula la cadena).
 * Puro: sin base ni red. Las identidades NO se tocan por aquí (protocolo identity_content).
 */

/** el origen de las tres identidades, fijado al commit (el `.md` y la migración lo citan; la prueba lo cruza) */
export const ORIGEN_E1 = {
  repositorio: 'msitarzewski/agency-agents',
  commit: 'b37b5bb33b78f2c1d6567d98e25ca818e3259219',
  fecha: '2026-10-25T00:37:22Z',
  licencia: 'MIT',
  titular: 'Copyright (c) 2025 AgentLand Contributors',
} as const

/** ADENDA idioma agnóstico (31-oct 15:40Z): la pieza sigue el idioma y el trato del manual del cliente; nunca un registro fijo */
export const INDICACION_IDIOMA_DEL_MANUAL =
  'Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.'

export interface TarjetaSugerida {
  rol: 'miembro'
  especialidad: string
  sabe_hacer: readonly string[]
  necesita: readonly string[]
  entrega: readonly string[]
  /** `concepto` siempre · `concepto:si_video` solo si la estrategia tiene video · `carrusel:si_personas` solo si una imagen generada lleva personas */
  pertinente_en: readonly string[]
}

export interface InstalacionE1 {
  agente: string
  display_name: string
  archivo: string
  ruta_de_origen: string
  /** true = el `.md` omite secciones del origen (solo Whimsy: su código e interfaces); false = texto tal cual */
  recortado: boolean
  /** la indicación obligatoria: va con el pedido de cada turno (dato de la fila del directorio / indicaciones del tipo de grupo), nunca dentro de la identidad */
  indicacion: readonly string[]
  tarjeta: TarjetaSugerida
}

export const INSTALACIONES_E1: readonly InstalacionE1[] = [
  {
    agente: 'whimsy-injector',
    display_name: 'Whimsy Injector',
    archivo: 'src/agents/identities/whimsy-injector.md',
    ruta_de_origen: 'design/design-whimsy-injector.md',
    recortado: true,
    indicacion: [
      'Aportas ideas de personalidad y momentos de encanto (lo inesperado, lo que se comparte) para el contenido de redes de un negocio: la gran idea, un carrusel o un kit de historias. Nada de código, interfaces, animaciones, micro-interacciones ni gamificación: aquí no hay producto digital, hay piezas de contenido.',
      'Dos o tres momentos de encanto por capítulo o por pieza, cada uno en una frase, con el por qué encaja con la voz del manual. Si la marca pide sobriedad, lo dices y propones poco.',
      INDICACION_IDIOMA_DEL_MANUAL,
    ],
    tarjeta: {
      rol: 'miembro',
      especialidad: 'encanto de marca: los momentos inesperados y compartibles que hacen memorable una pieza',
      sabe_hacer: ['proponer momentos de encanto', 'dar personalidad a un mensaje sin perder la voz del manual', 'detectar dónde una pieza queda genérica'],
      necesita: ['manual de marca', 'brief', 'la idea o la pieza en curso'],
      entrega: ['momentos de encanto propuestos, con su por qué'],
      pertinente_en: ['concepto'],
    },
  },
  {
    agente: 'tiktok-strategist',
    display_name: 'TikTok Strategist',
    archivo: 'src/agents/identities/tiktok-strategist.md',
    ruta_de_origen: 'marketing/marketing-tiktok-strategist.md',
    recortado: false,
    indicacion: [
      'Solo cultura de formato corto y gancho: cómo se abre en 3 segundos, qué ritmo, qué formato nativo, cómo se adapta a Reels y Shorts. Nada de anuncios, Spark Ads, TopView, partnerships con creadores ni métricas objetivo: eso no se decide en la mesa.',
      'Las tendencias que cites son supuestos para que el equipo los verifique; no afirmes que un audio o un formato está de moda hoy.',
      INDICACION_IDIOMA_DEL_MANUAL,
    ],
    tarjeta: {
      rol: 'miembro',
      especialidad: 'formato corto vertical: gancho, ritmo y lenguaje nativo de TikTok, Reels y Shorts',
      sabe_hacer: ['gancho en 3 segundos', 'ritmo y estructura de un video corto', 'adaptar una idea a TikTok, Reels y Shorts'],
      necesita: ['brief', 'la idea o el guion en curso', 'qué redes están en la estrategia'],
      entrega: ['aporte de formato y gancho para el video'],
      pertinente_en: ['concepto:si_video', 'video:si_tiktok_o_reels'],
    },
  },
  {
    agente: 'inclusive-visuals-specialist',
    display_name: 'Inclusive Visuals Specialist',
    archivo: 'src/agents/identities/inclusive-visuals-specialist.md',
    ruta_de_origen: 'design/design-inclusive-visuals-specialist.md',
    recortado: false,
    indicacion: [
      'Revisas el pedido de imagen DESPUÉS de quien lo redacta y ANTES de generar: solo cuando la imagen lleva personas. Aportas lo que falta para que las personas se vean reales y dignas (rasgos distintos, edades, cuerpos, ropa y entorno del país del cliente) y los negativos que bloquean rostros clonados, texto o símbolos inventados y estereotipos.',
      'No redactas el pedido de nuevo ni decides la dirección visual: propones correcciones concretas al pedido existente. Si no conoces el contexto local, lo dices en vez de suponerlo.',
      INDICACION_IDIOMA_DEL_MANUAL,
    ],
    tarjeta: {
      rol: 'miembro',
      especialidad: 'representación real y digna de las personas en las imágenes que se generan',
      sabe_hacer: ['corregir un pedido de imagen para que las personas sean reales y diversas', 'negativos contra rostros clonados, texto y símbolos inventados', 'anclar la escena en el entorno del cliente'],
      necesita: ['el pedido de imagen redactado', 'identidad visual', 'país y público del cliente'],
      entrega: ['correcciones al pedido de imagen'],
      pertinente_en: ['carrusel:si_personas', 'kit:si_personas'],
    },
  },
] as const

/** E1: se instala solo cuando un cliente tenga LinkedIn en su estrategia (el piloto no lo tiene) */
export const DIFERIDOS_E1 = [
  { agente: 'linkedin-content-creator', ruta_de_origen: 'marketing/marketing-linkedin-content-creator.md', condicion: 'si_linkedin', motivo: 'solo cuando un cliente tenga LinkedIn en la estrategia (FIRMA E1)' },
] as const

export const SLUGS_E1: readonly string[] = INSTALACIONES_E1.map((i) => i.agente)

export const instalacionDe = (agente: string): InstalacionE1 | null => INSTALACIONES_E1.find((i) => i.agente === agente) ?? null

/** la indicación obligatoria como un solo texto (para pegarla al pedido del turno) */
export const indicacionDe = (agente: string): string | null => instalacionDe(agente)?.indicacion.join(' ') ?? null
