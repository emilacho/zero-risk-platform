// ⑤ ARMAR EL CUERPO DEL PRODUCTOR · CC#1 · 2026-10-01 · 03-oct: CADA FOTO CON TODO SU CONTEXTO (texto · fecha · enlace · qué producto es) + la regla «sólo fotos del producto del brief» + el TRATO de la marca (tú · vos · usted) · lógica de fotos-contexto-logica.js y trato-logica.js pegada arriba por el constructor. Un solo agente (`campaign-brief-agent`) lee UN brief, mira las fotos reales del cliente, usa «mirar afuera» para lo que falte y ESCRIBE la pieza.
// 🔴 MODO SECO DE VERDAD: `dry_run` viaja en el CUERPO que se manda a /api/agents/run-sdk (`cuerpo.dry_run`) y el HTTP siguiente manda EXACTAMENTE `JSON.stringify($json.cuerpo)`.
// 🔴 `force_restart:true` es obligatorio: sin él el corredor sirve un punto de control guardado (vuelve en 0,7 s sin haber corrido).
// 🔴 `callback_mode:'runner'`: la vuelta la entrega el CORREDOR (no muere en los 800 s de Vercel) · SÓLO para campaign-brief-agent (lista cerrada en run-sdk).
// 🔴 `thinking_mode:'disabled'`: el razonamiento interno era ~90 % de la salida y revienta el máximo por respuesta (medido 30-sep) · una pieza cabe sobra.
// Agnóstico: nada de este nodo nombra a un cliente · los datos del negocio salen de la ficha.
const prev = $('④ ¿Ya hay pieza de este brief? · guarda').first().json
// 🔴 UN ERROR DE LA BASE NO ES «VACÍO» (certificación CC#3 · 01-oct): el nodo HTTP de la consulta tiene `onError: continueRegularOutput` y, si la base falla, entrega un ítem `{error:{…}}`
// (o PostgREST contesta un OBJETO `{code, message}` en vez de una lista). Leerlo como «el cliente» seguiría hacia el nodo que PAGA. Se DETIENE con su motivo.
// 🔴 02-oct: entre la ficha y este nodo hay ahora «⑤ GUARDA · sedes y voz» (trae `sedes_info`); la ficha se lee por su NOMBRE (es antecesora). Con la entrada vieja (la ficha misma) todo funciona como antes y las sedes quedan «no leídas».
const _entrada = $input.first().json || {}
const _traeSedes = Object.prototype.hasOwnProperty.call(_entrada, 'sedes_info')
const _filas = (_traeSedes ? $('⑤ Ficha del cliente').all() : $input.all()).map((i) => i.json)
const sedesInfo = _traeSedes ? _entrada.sedes_info : { error: 'la lectura de sedes no está en el camino de este flujo' }
const _falla = _filas.find((r) => r && ((r.error !== undefined && r.error !== null) || (r.code !== undefined && r.message !== undefined && r.id === undefined)))
if (_falla) {
  const _m = _falla.error && typeof _falla.error === 'object' ? (_falla.error.message || _falla.error.name) : (_falla.error || _falla.message)
  throw new Error('PIEZA_FICHA_CONSULTA_FALLO · la consulta a la base FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «el cliente» · se DETIENE y NO escribe nada')
}
let ficha = {}
try { const f = _filas[0]; ficha = Array.isArray(f) ? f[0] || {} : f || {} } catch (e) { ficha = {} }
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
// 🔴 02-oct · MAPAS con la CIUDAD y la DIRECCIÓN de cada sede, no con el país (con «Ecuador» trajo la ficha de OTRO negocio, Gualaceo). Sin ubicación en la ficha NO se ofrece `ficha_en_mapas`.
const sedesResueltas = sedesInfo && Array.isArray(sedesInfo.sedes) ? sedesInfo.sedes : []
// 🔴 02-oct · LA VOZ: los textos de los posts propios del cliente (si existen; si no, se DECLARA en el pedido)
const textosDeVoz = sedesInfo && Array.isArray(sedesInfo.textos_propios) ? sedesInfo.textos_propios : []
const ubicaciones = ubicacionesParaMapas(sedesResueltas, ficha)

// 🔴 03-oct · CADA FOTO CON SU CONTEXTO: el texto, la fecha y el enlace de la publicación de cada foto, y qué producto nombra ese texto, contra el producto de ESTE brief.
// Sin la lista de filas con contexto (flujo viejo) todo funciona como antes: las fotos van como {url, label} y no hay regla de producto.
const _filasFotos = Array.isArray(prev.fotos_filas) ? prev.fotos_filas : null
const excluirProducto = excluirDe({ nombre: nombre, handles: [instagram].concat((_filasFotos || []).map((f) => f.handle)).filter(Boolean), ciudades: sedesResueltas.map((s) => s.ciudad), market: ficha.market, country: ficha.country })
// el producto de ESTE brief (su protagonista ∩ su vocabulario obligatorio) · las alternativas que el brief niega («No el X») · y los productos que el dueño declara en la ficha (`config.productos`)
// la regla de «sólo fotos del producto» vale para piezas de IMAGEN (una bio o una configuración no llevan foto de plato)
const productoBrief = productoDelBrief(prev.brief, excluirProducto)
const _esDeImagen = /^(imagen|carrusel)$/.test(sinTildes(prev.brief && prev.brief.tipo_de_pieza))
const catalogoProductos = catalogoDelBrief(prev.brief, productoBrief, ficha, excluirProducto)
const clasif = _filasFotos ? clasificarFotos(_filasFotos, { producto: _esDeImagen ? productoBrief : null, catalogo: catalogoProductos, excluir: excluirProducto, maxImagenes: 20 }) : null
const fotosAEnviar = clasif ? clasif.fotos.map((f) => ({ url: f.url, label: f.label })) : prev.fotos
// 🔴 03-oct · EL TRATO sale del manual (o de la ficha), no de una regla fija
const trato = resolverTrato(prev.manual_voz, ficha)

// las herramientas que SÍ tienen dato para este cliente (no se le ofrece al agente lo que no hay a quién mirar)
const pedidos = []
const ofrecidas = []
if (instagram) { ofrecidas.push('instagram'); pedidos.push('     - que_mirar = instagram            · de_quien = ' + String(instagram).replace(/^@/, '')) }
if (ubicaciones.length) {
  ofrecidas.push('ficha_en_mapas')
  ubicaciones.forEach((u) => pedidos.push('     - que_mirar = ficha_en_mapas       · de_quien = ' + nombre + ' · donde = ' + u.donde))
}
if (sitio) { ofrecidas.push('leer_el_sitio'); pedidos.push('     - que_mirar = leer_el_sitio        · de_quien = ' + sitio) }
ofrecidas.push('que_dice_el_buscador')
pedidos.push('     - que_mirar = que_dice_el_buscador · de_quien = ' + nombre + (ubicaciones.length ? ' ' + ubicaciones[0].ciudad : donde ? ' ' + donde : ''))
const sinDato = []
if (!instagram) sinDato.push('instagram (no hay un Instagram propio registrado para este cliente)')
if (!sitio) sinDato.push('leer_el_sitio (no hay sitio propio registrado para este cliente)')
if (!ubicaciones.length) sinDato.push('ficha_en_mapas (la ficha del cliente no trae ciudad ni dirección de ninguna sede: sin ubicación la búsqueda trae negocios homónimos de otras ciudades)')
// una búsqueda de Mapas por sede: el máximo de pedidos crece con ellas (base 4 · 1 por sede adicional) para que tener 2 sedes no deje sin cupo al Instagram o al sitio
const maxPedidos = 4 + Math.max(0, ubicaciones.length - 1)

const nFotos = fotosAEnviar.length
const bloqueFotos = clasif
  ? bloqueDeFotos(clasif, nombre)
  : nFotos > 0
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
  '   Reglas: MÁXIMO ' + maxPedidos + ' pedidos en total. Haz todos los que necesites de una sola vez, en la misma vuelta, no uno por uno. NO uses anuncios_en_meta ni anuncios_en_google ni ninguna',
  '   otra opción: cuestan mucho y no las necesitas. Lee siempre el campo `cero` de cada respuesta: distingue «se miró y no hay» de «no se pudo mirar». Si algo no se pudo mirar, dilo; no lo rellenes.',
  sinDato.length ? '   Para este cliente NO tienes: ' + sinDato.join(' · ') + '.' : '',
  '   Lo que devuelve mirar_afuera NO entra al cerebro del cliente: es lo que se vio ahora, sin sello. Antes de citar una ficha de Mapas comprueba que el nombre y la CIUDAD sean los del cliente (bloque D): una ficha de otra ciudad es OTRO negocio y no la uses.',
  '',
  bloqueDeSedes(sedesResueltas, sedesInfo && sedesInfo.error ? sedesInfo : null),
  '',
  bloqueDeVoz(textosDeVoz),
  '',
  bloqueDeTrato(trato),
  '',
  'Reglas de la pieza:',
  '1. Respeta los límites de caracteres del brief. Usa el vocabulario obligatorio. NUNCA uses una palabra prohibida (solo pueden aparecer en la lista «prohibido» del brief, no en tu texto).',
  '2. UN solo mensaje: el del brief. El llamado a la acción es el del brief.',
  '3. No inventes datos que no estén en el brief, en las fotos o en lo que te devolvió mirar_afuera. El horario, la dirección y el teléfono salen del brief o del bloque D (con su fuente), nunca de tu memoria ni de otra ciudad.',
  '4. El prompt para la imagen va EN POSITIVO: describe lo que SÍ aparece («un plato solo sobre una mesa de madera»), no lo que no. Los generadores de imagen manejan mal las instrucciones en negativo.',
  '   El brief a veces describe lo visual con NEGACIONES («No aparecen personas, no aparece logo, no aparece texto sobre la imagen»): NO las copies al prompt. Tradúcelas a lo que sí se ve («el plato ocupa el encuadre completo sobre la mesa, con luz cálida»).',
  '   En el prompt de imagen no escribas ninguna de estas palabras: no, not, without, never, avoid, sin, ni, evita. Si quieres decir algo con ellas, cámbialo por lo que sí está en la imagen.',
  '5. La fuente de la imagen la decide el brief, no tú: repite cuál es en «fuente_imagen» (cliente = una foto real del negocio · generada = la hace el generador desde tu prompt · dueno = la toma el dueño). Si el brief no lo dice, escribe «no_declarada».',
  '6. «foto_referencia»: la CLAVE (F01, F02…) de la foto que usaste de referencia del producto y por qué; null si no usaste ninguna. Si la imagen es del cliente es obligatoria. Nunca uses de referencia una foto marcada «NO es el producto».',
  '',
  'Responde EXCLUSIVAMENTE con UN bloque JSON (nada de texto antes ni después) con esta forma exacta:',
  '{ "pieza": {',
  '  "titular": "…",',
  '  "texto_principal": "…",',
  '  "prompt_imagen": "…",',
  '  "fuente_imagen": "cliente|generada|dueno|no_declarada",',
  '  "no_pude_cumplir": [ "qué del brief no pudiste cumplir y por qué · [] si todo" ],',
  '  "foto_referencia": { "foto": "F01", "por_que": "…" } | null,',
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
  mirar_afuera_limites: { max_pedidos: maxPedidos, permitidos: ofrecidas },
  // las fotos propias (nuestro almacén) · el corredor las baja y las codifica · Instagram no se manda nunca
  ...(nFotos > 0 ? { images: fotosAEnviar, images_mode: 'base64' } : {}),
}
// lo que viaja con la pieza (y se guarda en su provenance): el estado de las sedes y de la voz · quien aprueba ve de dónde salió cada dato
const sedes_resumen = sedesInfo && sedesInfo.error
  ? { leidas: false, error: String(sedesInfo.error).slice(0, 200) }
  : { leidas: true, sedes: sedesResueltas.map((s) => ({ ciudad: s.ciudad, horario: s.horario.estado, direccion: s.direccion.estado, canal_pedido: s.canal_pedido.estado })), descartes: (sedesInfo && sedesInfo.descartes) || [] }
const voz_resumen = { textos: textosDeVoz.length, fechas: textosDeVoz.map((t) => t.fecha) }
// 03-oct · lo que viaja con la pieza: qué foto es cada una (clave · rol · producto) y la regla con que se comprobará la pieza en ⑦
const fotos_ctx = clasif ? clasif.fotos.map((f) => ({ ref: f.ref, id: f.id, post_id: f.post_id, fecha: f.fecha, enlace: f.enlace, medio: f.medio, posicion: f.posicion, rol: f.rol, producto: f.producto, producto_fuente: f.producto_fuente })) : []
const fotos_regla = clasif ? { regla_activa: clasif.regla_activa, sin_foto_del_producto: clasif.sin_foto_del_producto, producto_del_brief: clasif.producto_del_brief, raices_del_producto: clasif.raices_del_producto, de_referencia: clasif.de_referencia, fotos: fotos_ctx, catalogo: catalogoProductos } : { regla_activa: false, fotos: [], catalogo: [] }
return [{ json: { ...prev, ...(clasif ? { fotos_enviadas: nFotos, fotos_no_enviadas: (prev.fotos_no_enviadas || []).concat(clasif.no_enviadas), fotos_ocultas_por_repetidas: (prev.fotos_duplicadas_ocultas || []).concat(clasif.duplicadas_ocultas) } : {}), fotos_ctx, fotos_regla, trato, client_name: nombre, cuerpo, pedido_caracteres: pedido.length, herramientas_ofrecidas: pedidos.length, max_pedidos_mirar_afuera: maxPedidos, sedes_resumen, sedes_resueltas: sedesResueltas, voz_resumen } }]
