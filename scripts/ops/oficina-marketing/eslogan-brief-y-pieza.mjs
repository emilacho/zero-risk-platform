/**
 * 02-nov · ADENDA 3 del equipo del manual · LA FRASE QUE EL CLIENTE USA LLEGA AL BRIEF, A LA CADENA POR FILAS Y A LA PIEZA COMO CONTEXTO (reemplaza la parte 4 del 01-nov, que la trataba como hecho obligatorio).
 * Los tres flujos piden el manual con una lista FIJA de columnas de `client_brand_books`; el GET trae `tagline`, la guarda lo pasa como `manual_tagline` y el nodo que arma el pedido imprime «UNA FRASE QUE EL CLIENTE USA (contexto)».
 * Sin obligación: se usa, se adapta o se propone otra mejor; las propuestas son aporte creativo y no se justifican. Solo si la declaró el dueño manda (palabra del dueño). Sin `tagline`, el pedido queda IDÉNTICO a hoy.
 *   · Brief `PQdIgbuFexuBsoh8` y copia por filas `BNXqlaX1oHSfZIpF` (mismo código): el bloque va tras el texto del manual.
 *   · Pieza `lVCLzxQCKNkd3uS0`: el bloque va antes del brief.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

const SELECT_VIEJO = 'forbidden_words,required_terminology,'
const SELECT_NUEVO = 'forbidden_words,required_terminology,tagline,'

// la guarda del brief y de la cadena copian `manual_texto`; la de la pieza copia `manual_voz`
const GUARDA_ANCLA_TEXTO = "    manual_texto: String(m.content_text || ''),\n"
const GUARDA_TAGLINE = "    // 01-nov · el eslogan real del cliente (client_brand_books.tagline) viaja al nodo que arma el pedido; vacío ⇒ ''\n    manual_tagline: typeof m.tagline === 'string' ? m.tagline.replace(/\\s+/g, ' ').trim().slice(0, 300) : '',\n"
const GUARDA_PIEZA_ANCLA = '    manual_voz: { voice_description: m.voice_description || null'

const bloque = (regla) => `// 02-nov · UNA FRASE QUE EL CLIENTE USA (contexto, sin obligación) · viene de client_brand_books.tagline. Sin texto, el pedido queda idéntico a hoy.
const bloqueEslogan = (typeof prev.manual_tagline === 'string' && prev.manual_tagline.trim())
  ? [
      '══════ UNA FRASE QUE EL CLIENTE USA (contexto) ══════',
      '«' + prev.manual_tagline.trim() + '»',
      ${JSON.stringify(regla)},
      '',
    ]
  : [];
`

const REGLA_BRIEF = 'Es contexto sobre cómo se presenta hoy el cliente, no una obligación: úsala, adáptala o propón otra mejor, libremente; tus propuestas son aporte creativo y no necesitan justificarse. Si la declaró el dueño (palabra del dueño), manda, y aun así puedes sugerir variantes como propuesta.'
const REGLA_PIEZA = 'Es contexto sobre cómo se presenta hoy el cliente, no una obligación: si la pieza lleva frase de marca puedes usarla, adaptarla o proponer otra mejor, libremente; tus propuestas son aporte creativo. Si la declaró el dueño (palabra del dueño), manda, y aun así puedes sugerir variantes como propuesta.'

function selectNuevo(f, nombre) {
  const n = nodo(f, nombre)
  const u = n.parameters.url
  if (typeof u !== 'string' || u.indexOf(SELECT_VIEJO) < 0 || u.indexOf(SELECT_VIEJO) !== u.lastIndexOf(SELECT_VIEJO)) throw new Error(`«${nombre}»: la lista de columnas no aparece exactamente una vez`)
  n.parameters.url = u.replace(SELECT_VIEJO, () => SELECT_NUEVO)
}

/** brief y cadena por filas: mismos nombres de nodo, mismo código */
export function construirEsloganEnBrief(f, { cargar, guarda, armar }) {
  selectNuevo(f, cargar)
  cambiarCodigo(f, guarda, GUARDA_ANCLA_TEXTO, GUARDA_ANCLA_TEXTO + GUARDA_TAGLINE)
  cambiarCodigo(f, armar, '\nconst pedido = [\n  REGLAS,\n', '\n' + bloque(REGLA_BRIEF) + '\nconst pedido = [\n  REGLAS,\n')
  cambiarCodigo(f, armar, "  prev.manual_texto || '(el manual no trae texto)',\n", "  prev.manual_texto || '(el manual no trae texto)',\n  ...bloqueEslogan,\n")
}

export function construirEsloganEnPieza(f, { cargar, guarda, armar }) {
  selectNuevo(f, cargar)
  cambiarCodigo(f, guarda, GUARDA_PIEZA_ANCLA, GUARDA_TAGLINE + GUARDA_PIEZA_ANCLA)
  cambiarCodigo(f, armar, "\nconst pedido = [REGLAS, '', '════════ EL BRIEF ════════', prev.brief_texto].join('\\n')", '\n' + bloque(REGLA_PIEZA) + "\nconst pedido = [REGLAS, '', ...bloqueEslogan, '════════ EL BRIEF ════════', prev.brief_texto].join('\\n')")
}
