/**
 * EL PÚBLICO IDEAL (noche 19-oct · CC#1) · lo que el redactor del plan recibe del descubrimiento del alta.
 * Texto plano que se PEGA TAL CUAL dentro del nodo «Redactor (B4)» de la planeación; la prueba `__tests__/planeacion-publico-ideal.test.ts` ejecuta ESTE MISMO texto.
 * `filas`: las filas de `client_icp_documents` del cliente (ya ordenadas por prioridad). `limpiar`: la función del redactor que quita nombres de personas.
 * Agnóstico: ningún cliente, rubro ni ciudad. No inventa nada: solo ordena lo que la fila trae y lo rotula como NO confirmado por el dueño.
 */
function bloqueDelPublicoIdeal(filas, limpiar) {
  var lista = (Array.isArray(filas) ? filas : []).filter(function (f) { return f && typeof f === 'object' })
  if (!lista.length) return []
  var limpio = typeof limpiar === 'function' ? limpiar : function (t) { return t }
  var plano = function (v) {
    if (v === null || v === undefined) return ''
    if (Array.isArray(v)) return v.map(plano).filter(Boolean).join(', ')
    if (typeof v === 'object') return Object.keys(v).map(function (k) { var x = plano(v[k]); return x ? (k + ': ' + x) : '' }).filter(Boolean).join('; ')
    return String(v).replace(/\s+/g, ' ').trim()
  }
  var corta = function (t, n) { return t.length > n ? t.slice(0, n - 3).trim() + '...' : t }
  var CAMPOS = [['goals', 'Quieren'], ['pain_points', 'Dolores'], ['objections', 'Objeciones'], ['preferred_channels', 'Canales donde están'], ['key_messages_for_segment', 'Mensajes que les sirven'], ['buying_process', 'Cómo deciden'], ['geography', 'Dónde'], ['content_preferences', 'Contenido que prefieren']]
  var L = []
  L.push('══════ PÚBLICO IDEAL (del descubrimiento del alta · NO confirmado por el dueño) ══════')
  L.push('Sale del descubrimiento automático del negocio. Úsalo para orientar el mensaje y los canales; NO lo escribas como un dato confirmado ni le pongas cifras que no traiga. Si algo de lo que sabe el negocio (confirmado) lo contradice, vale lo confirmado.')
  var total = 0
  lista.slice(0, 6).forEach(function (f) {
    var seg = corta(plano(f.audience_segment), 120)
    if (!seg) return
    var partes = []
    CAMPOS.forEach(function (c) { var t = plano(f[c[0]]); if (t) partes.push(c[1] + ': ' + corta(t, 240)) })
    var linea = limpio('- ' + seg + (partes.length ? ' · ' + partes.join(' · ') : ''))
    if (total + linea.length > 2400) return
    total += linea.length
    L.push(linea)
  })
  if (L.length <= 2) return []
  L.push('')
  return L
}
