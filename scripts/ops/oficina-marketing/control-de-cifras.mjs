/**
 * 01-nov · CONTROL DE CIFRAS del plan (orden Lenovo 12:36Z, tramo 1, ítem 3). Agnóstico: no sabe de ningún cliente.
 * Cada cifra con unidad del cliente que el plan escribe debe estar en el material que se le dio al redactor (el pedido: ficha, carpeta, cerebro)
 * o llevar un rótulo en su línea (supuesto, estimado, meta, escenario, presupuesto…). Lo que no cumple NO marca el plan ni lo vuelve «con pendientes»:
 * va como AVISO (`avisos_de_cifras` en la salida y `cifras_sin_respaldo` en el registro interno), porque calibrado sobre el plan real de la corrida 209744 (117 cifras: 98 con respaldo,
 * 16 rotuladas, 3 avisos; el ingenuo daba 38) un control duro volvería ruido lo que sí es derivado legítimo. Nunca bloquea, nunca corrige.
 * Se ignoran: años, teléfonos, direcciones web, @usuarios, fechas «12 oct», números chicos sin unidad.
 */
import { cambiarCodigo } from './lib.mjs'

export const CODIGO_CIFRAS = `// 01-nov · control de cifras del plan: avisa de las cifras con unidad que no están en lo que se le dio al redactor ni llevan rótulo. Aviso, nunca marca.
function revisarCifrasDelPlan(texto, material) {
  var canon = function (crudo) {
    var t = String(crudo).replace(/[^\\d.,]/g, '').replace(/[.,]+$/, '')
    if (!t) return null
    t = t.replace(/[.,](?=\\d{3}(?!\\d))/g, '').replace(',', '.')
    var v = Number(t)
    return isFinite(v) ? v : null
  }
  var limpio = function (s) {
    return String(s).replace(/https?:\\/\\/\\S+/g, ' ').replace(/\\+\\d{2,3}[\\d\\s-]{6,}/g, ' ').replace(/@[\\w.]+/g, ' ').replace(/\\b\\d{1,2}\\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)[a-z]*\\b/gi, ' ').replace(/\\b(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)[a-z]*\\s*\\d{1,2}\\b/gi, ' ')
  }
  var tokens = function (s) {
    var out = [], re = /\\d[\\d.,]*/g, m
    while ((m = re.exec(s))) { var v = canon(m[0]); if (v !== null) out.push({ v: v, crudo: m[0], i: m.index }) }
    return out
  }
  var conocidas = tokens(limpio(material)).map(function (x) { return x.v })
  var respaldada = function (v) {
    for (var k = 0; k < conocidas.length; k++) { var c = conocidas[k]; if (Math.abs(c - v) <= Math.max(0.05, 0.01 * Math.abs(c))) return true }
    return false
  }
  var ROTULO = /supuest|estimad|propuest|meta\\b|metas\\b|objetivo|escenario|hip[oó]tesis|aprox|≈|~|presupuesto|inversi[oó]n|subir a|bajar a|\\/d[ií]a|por d[ií]a|entre |rango|umbral|tope|supera|ajusto|si el |si la |cuando |al cierre|semana\\s*\\d|mes\\s*\\d|d[ií]a\\s*\\d|fase|paso|puerta|pregunta|decisi[oó]n/i
  var lineas = String(texto).split('\\n'), total = 0, con = 0, sin = [], vistos = {}
  for (var a = 0; a < lineas.length; a++) {
    var l = limpio(lineas[a]), rotulada = ROTULO.test(l), ts = tokens(l)
    for (var b = 0; b < ts.length; b++) {
      var t = ts[b], v = t.v
      if (v >= 1900 && v <= 2100 && String(t.crudo).replace(/[^\\d]/g, '').length === 4) continue
      var ctx = l.slice(Math.max(0, t.i - 3), t.i + t.crudo.length + 12)
      var conUnidad = /[$%★]|US\\$|reseñ|ticket|visita|seguidor|personas|pedido|cliente|publicaci/i.test(ctx)
      if (!(conUnidad || v >= 100 || (String(t.crudo).indexOf('.') >= 0 && String(t.crudo).length > 2))) continue
      total++
      if (respaldada(v)) { con++; continue }
      if (rotulada) continue
      var k2 = String(v) + '|' + a
      if (vistos[k2]) continue
      vistos[k2] = 1
      sin.push({ cifra: t.crudo, linea: lineas[a].trim().slice(0, 140) })
    }
  }
  return { evaluadas: total, con_respaldo: con, sin_respaldo: sin.slice(0, 12), hay_aviso: sin.length > 0 }
}
`

export function construirControlDeCifras(f) {
  const v = '¿Llegó la vuelta?'
  // la función va antes de su primer uso; el material es el pedido que recibió el redactor
  cambiarCodigo(f, v, '// r73 · chequeo del plan por código (P1–P6)',
    CODIGO_CIFRAS + "// r73 · chequeo del plan por código (P1–P6)")
  cambiarCodigo(f, v, 'const bloqueChequeo = chequeoDelPlan ?',
    "// 01-nov · control de cifras: AVISO (no marca, no cambia el estado del plan)\nlet avisosDeCifras = null;\ntry { const pedidoDelRedactor = String($('Redactor (B4)').first().json.pedido || ''); avisosDeCifras = llego && pedidoDelRedactor.trim().length > 0 ? revisarCifrasDelPlan(textoRevisado, pedidoDelRedactor) : null; } catch (x) { avisosDeCifras = null; }\nconst bloqueChequeo = chequeoDelPlan ?")
  cambiarCodigo(f, v, 'revision_del_registro: bloqueRevision || null,',
    "revision_del_registro: bloqueRevision || null, cifras_sin_respaldo: avisosDeCifras && avisosDeCifras.hay_aviso ? avisosDeCifras.sin_respaldo : null,")
  cambiarCodigo(f, v, '  chequeo_del_plan: chequeoDelPlan,', '  chequeo_del_plan: chequeoDelPlan,\n  avisos_de_cifras: avisosDeCifras,')
}
