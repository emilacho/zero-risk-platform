/**
 * EL REGISTRO DEL PLAN, REVISADO POR CÓDIGO (ronda 68) · texto plano apto para pegar en un nodo Code de n8n (sin require/import/export).
 * El plan ya sale pedido en el registro del cliente (tuteo / voseo / usted); aquí el CÓDIGO comprueba el texto que volvió del redactor:
 *   · registro tuteo: las formas de voseo se CORRIGEN con la tabla del barrido (`scripts/ops/barrer-voseo.mjs`; una prueba exige que sean la misma). Las formas en -í que también son un
 *     pasado («pedí») solo se tocan al ARRANCAR una oración o tras «y/o/e/u» o puntuación (imperativo); lo citado entre «…» o `…` no se toca.
 *   · otro registro (voseo, usted) o formas que no se pueden arreglar sin riesgo: se MARCAN (conteo y formas), no se reescriben.
 * Agnóstico: la tabla es de la lengua, no de un cliente.
 */
var _VOS_A_TU = {
  "sos": "eres", "sabés": "sabes", "tenés": "tienes", "podés": "puedes", "querés": "quieres", "decís": "dices", "hacés": "haces", "ponés": "pones", "venís": "vienes",
  "pedís": "pides", "vivís": "vives", "escribís": "escribes", "salís": "sales", "sentís": "sientes", "creés": "crees", "leés": "lees", "elegís": "eliges",
  "seguís": "sigues", "repetís": "repites", "conocés": "conoces", "entendés": "entiendes", "necesitás": "necesitas", "usás": "usas", "mirás": "miras",
  "llamás": "llamas", "buscás": "buscas", "mandás": "mandas", "hablás": "hablas", "pagás": "pagas", "encontrás": "encuentras", "usá": "usa", "llamá": "llama",
  "pasá": "pasa", "agregá": "agrega", "declará": "declara", "priorizá": "prioriza", "tratá": "trata", "mirá": "mira", "probá": "prueba", "comprobá": "comprueba",
  "revisá": "revisa", "diagnosticá": "diagnostica", "verificá": "verifica", "confirmá": "confirma", "aclará": "aclara", "explicá": "explica", "calculá": "calcula",
  "marcá": "marca", "cambiá": "cambia", "ignorá": "ignora", "completá": "completa", "aplicá": "aplica", "ejecutá": "ejecuta", "publicá": "publica", "activá": "activa",
  "apagá": "apaga", "buscá": "busca", "guardá": "guarda", "mandá": "manda", "enviá": "envía", "sacá": "saca", "quitá": "quita", "cargá": "carga", "generá": "genera",
  "creá": "crea", "armá": "arma", "dejá": "deja", "tomá": "toma", "cuidá": "cuida", "evitá": "evita", "contá": "cuenta", "ayudá": "ayuda", "cerrá": "cierra",
  "empezá": "empieza", "pensá": "piensa", "ubicá": "ubica", "separá": "separa", "juntá": "junta", "compará": "compara", "limitá": "limita", "respetá": "respeta",
  "citá": "cita", "copiá": "copia", "pegá": "pega", "nombrá": "nombra", "listá": "lista", "anotá": "anota", "registrá": "registra", "clasificá": "clasifica",
  "identificá": "identifica", "determiná": "determina", "estimá": "estima", "validá": "valida", "contrastá": "contrasta", "cotejá": "coteja", "adjuntá": "adjunta",
  "incorporá": "incorpora", "agrupá": "agrupa", "filtrá": "filtra", "seleccioná": "selecciona", "asigná": "asigna", "reservá": "reserva", "aprobá": "aprueba",
  "rechazá": "rechaza", "cancelá": "cancela", "continuá": "continúa", "terminá": "termina", "finalizá": "finaliza", "entregá": "entrega", "preguntá": "pregunta",
  "trabajá": "trabaja", "utilizá": "utiliza", "informá": "informa", "recomendá": "recomienda", "sugerí": "sugiere", "andá": "ve", "hablá": "habla", "fijá": "fija",
  "asegurá": "asegura", "acordá": "acuerda", "elegí": "elige", "devolvé": "devuelve", "mantené": "mantén", "respondé": "responde", "leé": "lee", "poné": "pon",
  "tené": "ten", "hacé": "haz", "decí": "di", "corré": "corre", "volvé": "vuelve", "resolvé": "resuelve", "rehacé": "rehaz", "rehacelo": "rehazlo", "sumá": "suma",
  "dividí": "divide", "ofrecé": "ofrece", "conocé": "conoce", "comprendé": "comprende", "vendé": "vende", "prometé": "promete", "emití": "emite",
  "construí": "construye", "describí": "describe", "escribí": "escribe", "decidí": "decide", "definí": "define", "incluí": "incluye", "vení": "ve", "salí": "sal",
  "seguí": "sigue", "descubrí": "descubre", "pedí": "pide", "resumí": "resume", "medí": "mide", "abrí": "abre", "repetí": "repite", "corregí": "corrige",
  "recibí": "recibe", "dirigí": "dirige", "invitá": "invita", "distinguí": "distingue", "cumplí": "cumple", "sumate": "súmate", "elegilo": "elígelo", "hacelo": "hazlo",
  "fijate": "fíjate", "asegurate": "asegúrate", "acordate": "acuérdate", "olvidate": "olvídate", "andate": "vete", "quedate": "quédate", "cuidate": "cuídate",
  "ponete": "ponte", "animate": "anímate", "apurate": "apúrate", "calmate": "cálmate", "mirate": "mírate", "sentate": "siéntate", "enterate": "entérate",
  "avisate": "avísate", "pedilo": "pídelo", "pedila": "pídela", "decilo": "dilo", "decila": "dila", "decime": "dime", "decíles": "diles", "usalo": "úsalo",
  "usala": "úsala", "usalas": "úsalas", "usalos": "úsalos", "mandalo": "mándalo", "escribinos": "escríbenos", "dejalo": "déjalo", "tomalo": "tómalo",
  "mostrame": "muéstrame", "contame": "cuéntame", "avisame": "avísame", "mandame": "mándame", "escribilo": "escríbelo", "buscalo": "búscalo", "hagás": "hagas",
  "tengás": "tengas", "digás": "digas", "vayás": "vayas", "seás": "seas", "pongás": "pongas", "sepás": "sepas", "decidís": "decides", "corrés": "corres",
  "rompés": "rompes", "completés": "completes", "metés": "metes", "preferís": "prefieres", "parate": "párate", "apoyate": "apóyate", "esperá": "espera",
  "estructurá": "estructura", "procurá": "procura", "ahorrá": "ahorra", "enumerá": "enumera", "orientá": "orienta", "imaginá": "imagina", "despachás": "despachas",
  "consultás": "consultas", "marcalo": "márcalo", "marcala": "márcala", "consultalo": "consúltalo", "repetilo": "repítelo", "perdé": "pierde", "entendé": "entiende",
  "seguinos": "síguenos", "contanos": "cuéntanos", "llamanos": "llámanos", "etiquetanos": "etiquétanos", "perdés": "pierdes", "olvidás": "olvidas", "tirás": "tiras",
  "tirala": "tírala", "tirame": "tírame", "acordás": "acuerdas", "dejás": "dejas", "alcanzás": "alcanzas", "pensás": "piensas", "llevás": "llevas", "ayudás": "ayudas",
  "tocás": "tocas", "manejás": "manejas", "ejecutás": "ejecutas", "preguntás": "preguntas", "dependés": "dependes", "cuidás": "cuidas", "estudiás": "estudias",
  "demostrás": "demuestras", "aprobás": "apruebas", "recordá": "recuerda", "pasame": "pásame", "mostrale": "muéstrale", "votás": "votas", "llenás": "llenas",
  "dejalos": "déjalos", "dejala": "déjala", "dejalas": "déjalas", "hacelos": "hazlos", "ponelo": "ponlo", "ponela": "ponla", "aplicás": "aplicas",
  "integrás": "integras", "reescribís": "reescribes", "corregís": "corriges", "revisás": "revisas", "confirmás": "confirmas", "verificás": "verificas",
  "enviás": "envías", "guardás": "guardas", "generás": "generas", "creás": "creas", "definís": "defines", "declarás": "declaras", "agregás": "agregas",
  "mantenés": "mantienes", "tratás": "tratas", "comprobás": "compruebas", "probás": "pruebas", "integrá": "integra", "reescribí": "reescribe", "mejorá": "mejora",
  "elaborá": "elabora", "explorá": "explora", "borrá": "borra", "ilustrá": "ilustra", "demostrá": "demuestra", "mostrá": "muestra", "considerá": "considera",
  "prepará": "prepara", "compará": "compara", "analizá": "analiza", "evaluá": "evalúa", "reevaluá": "reevalúa", "enfocá": "enfoca", "ordená": "ordena",
  "ponderá": "pondera", "apoyá": "apoya", "basá": "basa", "fundá": "funda", "corregilo": "corrígelo", "podes": "puedes", "tenes": "tienes", "queres": "quieres",
  "decis": "dices",
}
var _VOS_AMBIGUO_CON_PASADO = function (k) { return /í$/.test(k) && k !== 'vení' && k !== 'decí' }
/** ¿lo que viene a continuación está donde se escribe un imperativo? (arranque de oración o de viñeta, tras coma / dos puntos / comillas, o tras y/o/e/u) */
function _enPosicionImperativa(antes) {
  return /(^|[.!?…:;\n]\s*|[-—–*•]\s*|[(\[¿¡"]\s*|,\s*)$/.test(antes) || /\b(y|o|e|u)\s+$/i.test(antes)
}
var _PREP_VOS = /^(a|de|para|con|por|sin|sobre|entre|desde|hacia|hasta|según|segun)$/i

function _mayusculaComoLaOriginal(orig, nueva) {
  if (orig === orig.toUpperCase()) return nueva.toUpperCase() // las claves tienen ≥ 3 letras: una «Y» suelta no llega hasta aquí
  if (orig[0] !== orig[0].toLowerCase()) return nueva.charAt(0).toUpperCase() + nueva.slice(1)
  return nueva
}

/** corrige (registro tuteo) o solo marca (otros) · devuelve { texto, corregidas:[{antes,despues}], restantes:[forma] } */
function corregirRegistroDelPlan(texto, registro) {
  var entrada = String(texto === undefined || texto === null ? '' : texto)
  var corregidas = []
  if (registro !== 'tuteo') return { texto: entrada, corregidas: corregidas, restantes: [] }
  // lo citado no se toca: «…», `…` y direcciones
  var partes = entrada.split(/(«[^»]*»|`[^`]*`|https?:\/\/\S+)/)
  var out = partes.map(function (trozo, i) {
    if (i % 2 === 1) return trozo
    return trozo.replace(/(^|[^\p{L}\p{N}_])(\p{L}+)(?![\p{L}\p{N}_])/gu, function (m, pre, palabra, pos) {
      var k = palabra.toLowerCase()
      var nueva = null
      if (k === 'vos') {
        var prev = (trozo.slice(0, pos + pre.length).match(/(\p{L}+)\s*$/u) || [])[1] || ''
        if (/^con$/i.test(prev)) return m // «con vos» ⇒ «contigo» cambia dos palabras: se deja marcado
        nueva = _PREP_VOS.test(prev) ? 'ti' : 'tú'
      } else if (Object.prototype.hasOwnProperty.call(_VOS_A_TU, k)) {
        if (palabra === 'SOS') return m
        if (_VOS_AMBIGUO_CON_PASADO(k)) {
          if (!_enPosicionImperativa(trozo.slice(0, pos + pre.length))) return m
        }
        nueva = _VOS_A_TU[k]
      }
      if (!nueva) return m
      var final = _mayusculaComoLaOriginal(palabra, nueva)
      corregidas.push({ antes: palabra, despues: final })
      return pre + final
    })
  })
  var resultado = out.join('')
  var posibles = voseoDesconocido(resultado).map(function (f) { return f + ' (posible)' })
  return { texto: resultado, corregidas: corregidas, restantes: formasDeVoseo(resultado).concat(posibles) }
}

// ── lo que la tabla NO conoce: SOLO se marca, nunca se reescribe (ronda 68 · seguimiento)
// Una lista de excepciones evita marcar palabras corrientes que terminan igual (más, país, cafés, está, modelo…).
function _conjunto(lista) { var o = {}; lista.split(/\s+/).forEach(function (w) { if (w) o[w] = true }); return o }
var _EXC_ACENTUADAS = _conjunto('más además jamás después país atrás detrás quizás demás compás anís cafés bebés papás mamás sofás tés canapés purés comités rosés interés inglés francés portugués holandés japonés irlandés danés cortés revés través marqués ananás estés estás aguarrás')
var _EXC_FINAL_ACENTUADO = _conjunto('está será hará dará podrá tendrá vendrá saldrá valdrá pondrá habrá cabrá querrá sabrá allá acá papá mamá sofá maná ananá café bebé canapé comité rosé puré bidé jabalí esquí rubí bisturí maní')
var _EXC_CLITICO = _conjunto('telenovela aguacate chocolate paralelo disparate cancela cazuela mandela escalera consuelo abuelo modelo anhelo aleluya nacela parcela novela vitela tutela cuchilla bolsillo semilla')
var _CLITICOS_DE_VOS = /^(\p{L}{3,})(ale|ele|ile|ame|eme|ime|ate|ete|ite|alo|elo|ilo|ala|ela|ila|alas|elas|alos|elos|anos|enos|inos)$/u

/** formas que PARECEN voseo y no están en la tabla: acabados -ás/-és/-ís, imperativos en -á/-é/-í al arrancar una frase y con clítico (preguntale, dame…). Devuelve las formas tal como están escritas. */
function voseoDesconocido(texto) {
  var sin = String(texto ?? '').replace(/«[^»]*»|`[^`]*`|https?:\/\/\S+/g, ' ')
  var hallados = [], vistos = {}
  var re = /(^|[^\p{L}\p{N}_])(\p{L}+)(?![\p{L}\p{N}_])/gu
  var m
  while ((m = re.exec(sin)) !== null) {
    var palabra = m[2], k = palabra.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(_VOS_A_TU, k)) continue // ya las cubren la corrección y formasDeVoseo («sos»/«SOS» está en la tabla; «vos» no cumple ninguna regla de abajo)
    var posImperativa = _enPosicionImperativa(sin.slice(0, m.index + m[1].length))
    var marca = false
    if (/^\p{L}{2,}(ás|és|ís)$/u.test(k)) marca = !_EXC_ACENTUADAS[k] && !/(ar|er|ir|dr|br|rr)ás$/.test(k) // futuros en -rás (tendrás, harás) son tuteo
    else if (posImperativa && !_EXC_FINAL_ACENTUADO[k]) {
      if (/([bcdfghjklmnñpqrstvwxyz]|[iu])á$/.test(k)) marca = k.length >= 5 && !/(ar|er|ir)á$/.test(k)
      else if (/[bcdfghjklmnñpqrstvwxyz]é$/.test(k)) marca = k.length >= 5
      else if (/[bcdfghjklmnñpqrstvwxyz]í$/.test(k)) marca = k.length >= 6
      else if (k.length >= 9 && _CLITICOS_DE_VOS.test(k)) marca = !_EXC_CLITICO[k]
    }
    if (marca && !vistos[k]) { vistos[k] = true; hallados.push(palabra) }
  }
  return hallados
}

/** las formas de voseo que siguen en el texto (fuera de lo citado), para marcar lo que no se pudo corregir */
function formasDeVoseo(texto) {
  var sin = String(texto).replace(/«[^»]*»|`[^`]*`/g, ' ')
  var hallados = {}
  var re = /(^|[^\p{L}\p{N}_])(\p{L}+)(?![\p{L}\p{N}_])/gu
  var m
  while ((m = re.exec(sin)) !== null) {
    var k = m[2].toLowerCase()
    if (k === 'vos' || (Object.prototype.hasOwnProperty.call(_VOS_A_TU, k) && m[2] !== 'SOS' && !_VOS_AMBIGUO_CON_PASADO(k))) hallados[k] = (hallados[k] || 0) + 1
  }
  return Object.keys(hallados).map(function (k) { return k + (hallados[k] > 1 ? ' ×' + hallados[k] : '') })
}

/** lo que el sistema escribe al final del plan cuando algo no cuadra (nada si todo está bien) */
function bloqueDeRevisionDeRegistro(r, registro) {
  if (!r || (!r.restantes.length && registro === 'tuteo')) return ''
  if (registro === 'tuteo') return '\n\n## Revisión del registro (la hace el sistema)\n- Quedan formas de voseo (o que lo parecen) que no se corrigieron solas: ' + r.restantes.join(', ') + '. El registro de la marca es tuteo: revisar a mano.'
  return ''
}
