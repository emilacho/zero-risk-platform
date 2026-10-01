// ⑤ ARMAR EL CUERPO DEL PRODUCTOR · CC#1 · 2026-10-01. Un solo agente (`campaign-brief-agent`) lee UN brief, mira las fotos reales del cliente, usa «mirar afuera» para lo que falte y ESCRIBE la pieza.
// 🔴 MODO SECO DE VERDAD: `dry_run` viaja en el CUERPO que se manda a /api/agents/run-sdk (`cuerpo.dry_run`) y el HTTP siguiente manda EXACTAMENTE `JSON.stringify($json.cuerpo)`.
// 🔴 `force_restart:true` es obligatorio: sin él el corredor sirve un punto de control guardado (vuelve en 0,7 s sin haber corrido).
// 🔴 `callback_mode:'runner'`: la vuelta la entrega el CORREDOR (no muere en los 800 s de Vercel) · SÓLO para campaign-brief-agent (lista cerrada en run-sdk).
// 🔴 `thinking_mode:'disabled'`: el razonamiento interno era ~90 % de la salida y revienta el máximo por respuesta (medido 30-sep) · una pieza cabe sobra.
// Agnóstico: nada de este nodo nombra a un cliente · los datos del negocio salen de la ficha.
const prev = $('④ ¿Ya hay pieza de este brief? · guarda').first().json
// 🔴 UN ERROR DE LA BASE NO ES «VACÍO» (certificación CC#3 · 01-oct): el nodo HTTP de la consulta tiene `onError: continueRegularOutput` y, si la base falla, entrega un ítem `{error:{…}}`
// (o PostgREST contesta un OBJETO `{code, message}` en vez de una lista). Leerlo como «el cliente» seguiría hacia el nodo que PAGA. Se DETIENE con su motivo.
const _filas = $input.all().map((i) => i.json)
const _falla = _filas.find((r) => r && ((r.error !== undefined && r.error !== null) || (r.code !== undefined && r.message !== undefined && r.id === undefined)))
if (_falla) {
  const _m = _falla.error && typeof _falla.error === 'object' ? (_falla.error.message || _falla.error.name) : (_falla.error || _falla.message)
  throw new Error('PIEZA_FICHA_CONSULTA_FALLO · la consulta a la base FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «el cliente» · se DETIENE y NO escribe nada')
}
let ficha = {}
try { const f = $input.first().json; ficha = Array.isArray(f) ? f[0] || {} : f || {} } catch (e) { ficha = {} }
// sin ficha no hay nombre, ni sitio, ni Instagram: el pedido saldría para «el cliente» y el agente gastaría raspado en ruido
if (!ficha || !ficha.id) throw new Error('PIEZA_SIN_FICHA · la consulta de la ficha del cliente ' + prev.client_id + ' volvió sin fila · se DETIENE y NO escribe nada')
const nombre = String(ficha.name || ficha.client_name || 'el cliente')
const cfg = ficha.config && typeof ficha.config === 'object' ? ficha.config : {}
const apify = cfg.apify && typeof cfg.apify === 'object' ? cfg.apify : {}
const propios = apify.own_handles && typeof apify.own_handles === 'object' ? apify.own_handles : {}
const primero = (v) => (Array.isArray(v) ? v.find((x) => typeof x === 'string' && x.trim()) : typeof v === 'string' && v.trim() ? v : null)
const instagram = primero(propios.instagram)
const sitioCrudo = [ficha.website, ficha.website_url, ficha.sitio_web, ficha.domain, ficha.dominio].find((x) => typeof x === 'string' && x.trim())
const sitio = sitioCrudo ? String(sitioCrudo).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') : null
const donde = [ficha.country, ficha.market, ficha.city].find((x) => typeof x === 'string' && x.trim()) || null

// las herramientas que SÍ tienen dato para este cliente (no se le ofrece al agente lo que no hay a quién mirar)
const pedidos = []
const ofrecidas = []
if (instagram) { ofrecidas.push('instagram'); pedidos.push('     - que_mirar = instagram            · de_quien = ' + String(instagram).replace(/^@/, '')) }
ofrecidas.push('ficha_en_mapas')
pedidos.push('     - que_mirar = ficha_en_mapas       · de_quien = ' + nombre + (donde ? ' · donde = ' + donde : ''))
if (sitio) { ofrecidas.push('leer_el_sitio'); pedidos.push('     - que_mirar = leer_el_sitio        · de_quien = ' + sitio) }
ofrecidas.push('que_dice_el_buscador')
pedidos.push('     - que_mirar = que_dice_el_buscador · de_quien = ' + nombre + (donde ? ' ' + donde : ''))
const sinDato = []
if (!instagram) sinDato.push('instagram (no hay un Instagram propio registrado para este cliente)')
if (!sitio) sinDato.push('leer_el_sitio (no hay sitio propio registrado para este cliente)')

const nFotos = prev.fotos.length
const bloqueFotos = nFotos > 0
  ? ['B) LAS FOTOS REALES DEL NEGOCIO. Van adjuntas a este mensaje: son ' + nFotos + ' foto' + (nFotos === 1 ? '' : 's') + ' propias de ' + nombre + '.',
     '   Míralas todas ANTES de escribir el prompt de imagen. En ese prompt describe solo lo que de verdad se ve en ellas (el producto, la luz, el encuadre, el fondo, los objetos).',
     '   No inventes elementos que no aparezcan.'].join('\n')
  : ['B) LAS FOTOS REALES DEL NEGOCIO. Para este cliente NO hay fotos propias disponibles. No las inventes: escribe el prompt de imagen solo desde el brief y declara en',
     '   «no_pude_cumplir» que no hubo fotos reales de apoyo.'].join('\n')

const REGLAS = [
  'Abajo va un brief de una pieza de marketing. Ya está todo decidido: el mensaje, el vocabulario, lo prohibido, los límites y el llamado.',
  '',
  'Tu trabajo NO es opinar sobre el brief ni rehacerlo. Es ESCRIBIR la pieza que el brief pide, para el cliente «' + nombre + '».',
  '',
  'Para escribirla tienes TRES fuentes, y las usas en este orden:',
  '',
  'A) EL BRIEF (abajo). Manda sobre todo lo demás. Léelo completo primero.',
  '',
  bloqueFotos,
  '',
  'C) LA HERRAMIENTA mirar_afuera. Úsala cuando te falte un dato real del negocio que ni el brief ni las fotos traen. Puedes pedir:',
  pedidos.join('\n'),
  '   Reglas: MÁXIMO 4 pedidos en total. Haz todos los que necesites de una sola vez, en la misma vuelta, no uno por uno. NO uses anuncios_en_meta ni anuncios_en_google ni ninguna',
  '   otra opción: cuestan mucho y no las necesitas. Lee siempre el campo `cero` de cada respuesta: distingue «se miró y no hay» de «no se pudo mirar». Si algo no se pudo mirar, dilo; no lo rellenes.',
  sinDato.length ? '   Para este cliente NO tienes: ' + sinDato.join(' · ') + '.' : '',
  '',
  'Reglas de la pieza:',
  '1. Respeta los límites de caracteres del brief. Usa el vocabulario obligatorio. NUNCA uses una palabra prohibida (solo pueden aparecer en la lista «prohibido» del brief, no en tu texto).',
  '2. UN solo mensaje: el del brief. El llamado a la acción es el del brief.',
  '3. No inventes datos que no estén en el brief, en las fotos o en lo que te devolvió mirar_afuera.',
  '4. El prompt para la imagen va EN POSITIVO: describe lo que SÍ aparece («un plato solo sobre una mesa de madera»), no lo que no. Los generadores de imagen manejan mal las instrucciones en negativo.',
  '5. La fuente de la imagen la decide el brief, no tú: repite cuál es en «fuente_imagen» (cliente = una foto real del negocio · generada = la hace el generador desde tu prompt · dueno = la toma el dueño). Si el brief no lo dice, escribe «no_declarada».',
  '',
  'Responde EXCLUSIVAMENTE con UN bloque JSON (nada de texto antes ni después) con esta forma exacta:',
  '{ "pieza": {',
  '  "titular": "…",',
  '  "texto_principal": "…",',
  '  "prompt_imagen": "…",',
  '  "fuente_imagen": "cliente|generada|dueno|no_declarada",',
  '  "no_pude_cumplir": [ "qué del brief no pudiste cumplir y por qué · [] si todo" ],',
  '  "que_miro": [ "una línea por cada pedido a mirar_afuera (qué pediste, qué volvió, qué usaste) y una línea sobre qué tomaste de las fotos · si no pediste nada: «no pedí nada» y por qué" ]',
  '} }',
  'Si el brief no pide titular (p. ej. una bio), deja «titular» como cadena vacía.',
].filter((x) => x !== '').join('\n')

const pedido = [REGLAS, '', '════════ EL BRIEF ════════', prev.brief_texto].join('\n')

const cuerpo = {
  agent: 'campaign-brief-agent',
  task: pedido,
  client_id: prev.client_id,
  workflow_id: $workflow.id,
  workflow_execution_id: $execution.id,
  callback_url: $execution.resumeUrl,
  callback_mode: 'runner',
  force_restart: true,
  // 🔴 EL INTERRUPTOR LLEGA AL NODO QUE PAGA
  dry_run: prev.dry_run === true,
  // TOPE DURO por llamada · SIEMPRE presente (el sobre lo valida o pone el de fábrica) · el corredor lo hace cumplir
  max_budget_usd: prev.tope_usd,
  thinking_mode: 'disabled',
  // 🔴 «máximo 4 pedidos» y «sin anuncios de pago» los hace cumplir el SISTEMA (el corredor monta la herramienta con ESTAS opciones y este cupo), no el texto del pedido · certificación CC#3 · cierra el punto 3
  // Exige que el corredor tenga el cambio de `mirar_afuera_limites` (PR aparte): sin él, Vercel descarta el campo y la herramienta queda como hoy (el texto sigue pidiéndolo, pero no se hace cumplir).
  mirar_afuera_limites: { max_pedidos: 4, permitidos: ofrecidas },
  // las fotos propias (nuestro almacén) · el corredor las baja y las codifica · Instagram no se manda nunca
  ...(nFotos > 0 ? { images: prev.fotos, images_mode: 'base64' } : {}),
}
return [{ json: { ...prev, client_name: nombre, cuerpo, pedido_caracteres: pedido.length, herramientas_ofrecidas: pedidos.length } }]
