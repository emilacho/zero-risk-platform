/**
 * 01-nov · DATOS DE PRUEBA POR CLIENTE, lado del flujo (orden Lenovo 12:36Z, tramo 1, ítem 4). Agnóstico. Convención y razón: `src/lib/planeacion/datos-de-prueba.ts` (rama `feat/cc2-datos-de-prueba-posthog`).
 * Convención en la ficha: `clients.config.datos_de_prueba = { distinct_ids[], rangos[{desde,hasta,nota?}], evento_bandera, nota }`. NO se escribe nada en la ficha de ningún cliente desde aquí.
 * Qué cambia (y SOLO esto):
 *   · «elegir brazos» manda `params.datos_de_prueba` al brazo de PostHog (la puerta valida, aplica y declara). Ausente ⇒ los params son los de hoy.
 *   · «Redactor (B4)» rotula la carpeta: un bloque «PRUEBAS DEL DUEÑO Y DE LA AGENCIA · NO SON CLIENTES» con las ventanas, la nota y la regla de lectura (lo registrado ahí no es demanda; en el punto de venta se rotula, no se resta).
 *     Las cuentas internas (`distinct_ids`) NO se escriben en el pedido: son opacas y el redactor no las necesita. Sin la convención en la ficha ⇒ el pedido es EXACTAMENTE el de hoy.
 */
import { agregarNodo, cambiarCodigo } from './lib.mjs'

void agregarNodo

export const B4_FUNCION_DATOS_DE_PRUEBA = `/**
 * (01-nov) PRUEBAS DEL DUEÑO Y DE LA AGENCIA · convención \`config.datos_de_prueba\` de la ficha. Rotula la carpeta: lo registrado en esas ventanas / por esas cuentas son pruebas, NO clientes.
 * Sin la convención (o sin nada utilizable) ⇒ [] (el pedido queda como hoy). Las cuentas internas no se escriben.
 */
function bloqueDeDatosDePrueba(cfg, limpiar) {
  var dp = cfg && typeof cfg === 'object' && cfg.datos_de_prueba && typeof cfg.datos_de_prueba === 'object' && !Array.isArray(cfg.datos_de_prueba) ? cfg.datos_de_prueba : null
  if (!dp) return []
  var limpio = typeof limpiar === 'function' ? limpiar : function (t) { return t }
  var fecha = /^\\d{4}-\\d{2}-\\d{2}/
  var ventanas = (Array.isArray(dp.rangos) ? dp.rangos : []).filter(function (r) { return r && typeof r === 'object' && fecha.test(String(r.desde || '')) && fecha.test(String(r.hasta || '')) }).slice(0, 10)
  var nCuentas = Array.isArray(dp.distinct_ids) ? dp.distinct_ids.filter(function (x) { return typeof x === 'string' && x.trim() }).length : 0
  var bandera = typeof dp.evento_bandera === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(dp.evento_bandera.trim()) ? dp.evento_bandera.trim() : ''
  var nota = typeof dp.nota === 'string' ? dp.nota.replace(/\\s+/g, ' ').trim().slice(0, 300) : ''
  if (!ventanas.length && !nCuentas && !bandera && !nota) return []
  var L = []
  L.push('══════ PRUEBAS DEL DUEÑO Y DE LA AGENCIA · NO SON CLIENTES ══════')
  L.push('Este negocio tiene registradas pruebas internas (el dueño o la agencia probando el sitio, un cobro o una caja). Lo que salga de ahí NO es demanda ni son clientes: no lo cuentes como tal en ninguna cifra del plan.')
  if (nCuentas || bandera) L.push('- La analítica del sitio YA las deja fuera antes de contar (' + (nCuentas ? nCuentas + ' cuenta(s) interna(s)' : '') + (nCuentas && bandera ? ' y ' : '') + (bandera ? 'los eventos marcados como prueba' : '') + '): no restes nada por tu cuenta.')
  ventanas.forEach(function (r) { L.push('- Ventana de pruebas: del ' + String(r.desde).slice(0, 10) + ' al ' + String(r.hasta).slice(0, 10) + ' (el último día no entra)' + (typeof r.nota === 'string' && r.nota.trim() ? ' · ' + limpio(r.nota.replace(/\\s+/g, ' ').trim().slice(0, 200)) : '') + '. Lo que el punto de venta, los pedidos o las reseñas muestren en esas fechas puede ser prueba: dilo como «posible prueba del dueño», no lo sumes a la demanda ni lo borres.') })
  if (nota) L.push('- Nota del negocio: ' + limpio(nota))
  L.push('')
  return L
}

`

export function construirDatosDePruebaDelFlujo(f) {
  // 1) los params de la analítica propia llevan la convención (solo si la ficha trae un objeto; ausente = los params de hoy)
  cambiarCodigo(f, 'elegir brazos',
    "return { params: { dominio: d, de_donde: 'el sitio de la ficha · la columna `domain` está vacía en todas las fichas' } };",
    "// 01-nov · pruebas del dueño / de la agencia (convención `config.datos_de_prueba`): la puerta de PostHog las deja fuera antes de contar. Ausente = los params de hoy.\n    const cfgPrueba = cliente.config && typeof cliente.config === 'object' ? cliente.config.datos_de_prueba : null;\n    const conPrueba = cfgPrueba && typeof cfgPrueba === 'object' && !Array.isArray(cfgPrueba) ? { datos_de_prueba: cfgPrueba } : {};\n    return { params: Object.assign({ dominio: d, de_donde: 'el sitio de la ficha · la columna `domain` está vacía en todas las fichas' }, conPrueba) };")
  // 2) la carpeta del redactor se rotula
  const b4 = 'Redactor (B4)'
  // la ficha que ve el redactor NO lleva la convención cruda (cuentas internas opacas): lo que necesita lo dice el bloque de abajo
  cambiarCodigo(f, b4, 'if (CLAVES_INTERNAS.test(k)) { quitadas.push(', "if (CLAVES_INTERNAS.test(k) || k === 'datos_de_prueba') { quitadas.push(")
  const ancla = '/**\n * EL PÚBLICO IDEAL (noche 19-oct'
  cambiarCodigo(f, b4, ancla, B4_FUNCION_DATOS_DE_PRUEBA + ancla)
  cambiarCodigo(f, b4, '...bloqueDelTextoLibre(ent.texto_libre_del_dueno, limpio),',
    '...bloqueDelTextoLibre(ent.texto_libre_del_dueno, limpio),\n...bloqueDeDatosDePrueba(ficha.config, limpio),')
}
