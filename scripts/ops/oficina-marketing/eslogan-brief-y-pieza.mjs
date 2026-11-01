/**
 * 01-nov · ADENDA 1 del equipo del manual · PARTE 4 · EL ESLOGAN REAL LLEGA AL BRIEF, A LA CADENA POR FILAS Y A LA PIEZA.
 * Hallazgo (HALLAZGO-CC2-brief-y-pieza-no-reciben-el-eslogan): los tres flujos piden el manual con una lista FIJA de columnas de `client_brand_books` y `tagline` no estaba. Con #817 el eslogan queda guardado ahí.
 * Ahora: (1) el GET trae `tagline`; (2) la guarda lo pasa como `manual_tagline` (texto acotado, sin saltos); (3) el nodo que arma el pedido imprime «ESLOGAN QUE EL CLIENTE YA USA» con la misma regla que el plan:
 * es un hecho de la marca, se usa; otro eslogan va como PROPUESTA, declarada. Sin `tagline`, el pedido queda IDÉNTICO a hoy.
 *   · Brief `PQdIgbuFexuBsoh8` y copia por filas `BNXqlaX1oHSfZIpF` (mismo código): el bloque va tras el texto del manual.
 *   · Pieza `lVCLzxQCKNkd3uS0`: el bloque va antes del brief; si el brief pide otro, se declara en `no_pude_cumplir`.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

const SELECT_VIEJO = 'forbidden_words,required_terminology,'
const SELECT_NUEVO = 'forbidden_words,required_terminology,tagline,'

// la guarda del brief y de la cadena copian `manual_texto`; la de la pieza copia `manual_voz`
const GUARDA_ANCLA_TEXTO = "    manual_texto: String(m.content_text || ''),\n"
const GUARDA_TAGLINE = "    // 01-nov · el eslogan real del cliente (client_brand_books.tagline) viaja al nodo que arma el pedido; vacío ⇒ ''\n    manual_tagline: typeof m.tagline === 'string' ? m.tagline.replace(/\\s+/g, ' ').trim().slice(0, 300) : '',\n"
const GUARDA_PIEZA_ANCLA = '    manual_voz: { voice_description: m.voice_description || null'

const bloque = (regla) => `// 01-nov · EL ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE) · viene de client_brand_books.tagline. Sin texto, el pedido queda idéntico a hoy.
// 01-nov · UNA SOLA FUENTE: si el nodo «② Leer los datos del negocio» trajo el eslogan resuelto (el del dueño gana), ese es el que se imprime; la columna tagline solo sirve si la fuente no respondió.
const _esloganDeLaFuente = (function () { try { const r = $('② Leer los datos del negocio').first().json; const e = r && r.body && !r.error ? r.body.eslogan : null; return e && typeof e === 'object' && typeof e.texto === 'string' && e.texto.replace(/\\s+/g, ' ').trim() ? e : null } catch (x) { return null } })();
const _esloganTexto = _esloganDeLaFuente ? _esloganDeLaFuente.texto.replace(/\\s+/g, ' ').trim().slice(0, 300) : (typeof prev.manual_tagline === 'string' ? prev.manual_tagline.trim() : '');
const _esloganFuente = _esloganDeLaFuente && typeof _esloganDeLaFuente.fuente === 'string' ? _esloganDeLaFuente.fuente.replace(/\\s+/g, ' ').trim().slice(0, 300) : '';
const bloqueEslogan = _esloganTexto
  ? [
      '══════ ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE) ══════',
      '«' + _esloganTexto + '»',
      ...(_esloganFuente ? ['Fuente: ' + _esloganFuente] : []),
      ${JSON.stringify(regla)},
      '',
    ]
  : [];
`

const REGLA_BRIEF = 'REGLA: este eslogan es un HECHO de la marca, no una opción. Úsalo cuando el entregable pide eslogan o hilo de marca. Si el plan o tú proponen otro, dilo con todas sus letras en «contradicciones_plan_vs_manual» y rotúlalo PROPUESTA; no lo cambies en silencio.'
const REGLA_PIEZA = 'REGLA: este eslogan es un HECHO de la marca, no una opción. Si la pieza lleva eslogan, es éste. Si el brief pide otro, no lo reemplaces en silencio: declara la diferencia en «no_pude_cumplir» y rotula cualquier otro como PROPUESTA.'

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
