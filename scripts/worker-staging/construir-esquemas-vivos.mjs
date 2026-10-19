// Esquemas de Apify como DATO (19-oct · cambió `streamers~youtube-scraper`: `downloadSubtitles` desapareció, nació `transcriptionAndSubtitle`; el validador del Servicio tenía la copia vieja).
// UNA sola fuente: `esquemas-apify/esquemas.json` (esquema congelado de cada función + mapa de campos renombrados + campos que se fueron sin mapa). De ahí salen, ya escritos, el código del validador
// del Servicio de Apify (3lyknrP3PoS2KzUf) y el del relector del lunes (Smu6A18qr1XJ2uzB). Ningún actor, campo ni valor está escrito en código: todo es dato.
//
// Qué hace el validador con esos datos, por llamada:
//   · campo viejo con renombre en el mapa  → se manda con el nombre nuevo (y su valor traducido si el mapa lo dice) y se anota en `avisos`;
//   · campo que SE FUE y no tiene mapa     → NO se llama al raspador (cobraría y devolvería vacío): responde «sin dato por cambio del raspador» (rechazo con `sin_dato_por_cambio`) y avisa UNA vez a #alertas;
//   · campo que el esquema nunca declaró   → como siempre: aviso escrito, se manda igual (medido: algunos actores lo aceptan).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
export const ARCHIVO_DE_ESQUEMAS = RAIZ + 'scripts/worker-staging/esquemas-apify/esquemas.json'
export const leerEsquemas = (ruta = ARCHIVO_DE_ESQUEMAS) => JSON.parse(fs.readFileSync(ruta, 'utf8'))

const NOMBRE_DEL_VALIDADOR = 'Validar el cuerpo contra el esquema'
const NOMBRE_DE_LA_SALIDA = 'skipped-response'
const NOMBRE_DEL_IF = 'IF cuerpo_ok?'
const NODO_AVISO_IF = 'IF avisar cambio?'
const NODO_AVISO = 'Avisar cambio del raspador'
const URL_DEL_AVISO = 'https://zero-risk-platform.vercel.app/api/brain/alimentar/aviso-de-raspador'

const ordenado = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
const unicos = (xs) => [...new Set(xs)]

/**
 * Compara el esquema congelado con el de hoy y devuelve el dato NUEVO + los cambios (puro).
 * `hoy` = { funcion: { acepta, obligatorios } | null } (null = no se pudo leer: no se toca nada y se dice).
 *   · desaparecido con renombre en el mapa cuyo destino existe hoy → `resueltos_por_mapa` (no es grave);
 *   · desaparecido sin mapa (o con mapa hacia un campo que tampoco existe) → `sin_mapa` (GRAVE) y pasa a `retirados`;
 *   · un campo retirado que vuelve a existir sale de `retirados`.
 */
export function reconciliar(datos, hoy, ahora = new Date()) {
  const nuevo = JSON.parse(JSON.stringify(datos))
  nuevo.renombres = nuevo.renombres || {}
  nuevo.retirados = nuevo.retirados || {}
  const cambios = []
  const ilegibles = []
  for (const [fn, e] of Object.entries(datos.funciones)) {
    const h = hoy[fn]
    if (!h || !Array.isArray(h.acepta)) { ilegibles.push(fn); continue }
    const seFueron = e.acepta.filter((x) => !h.acepta.includes(x))
    const llegaron = h.acepta.filter((x) => !e.acepta.includes(x))
    const oblNuevos = (h.obligatorios || []).filter((x) => !(e.obligatorios || []).includes(x))
    const oblMenos = (e.obligatorios || []).filter((x) => !(h.obligatorios || []).includes(x))
    const mapa = nuevo.renombres[fn] || {}
    const resueltos = seFueron.filter((c) => mapa[c] && h.acepta.includes(mapa[c].a)).map((c) => ({ de: c, a: mapa[c].a }))
    const sinMapa = seFueron.filter((c) => !(mapa[c] && h.acepta.includes(mapa[c].a)))
    const volvieron = (nuevo.retirados[fn] || []).filter((c) => h.acepta.includes(c))
    if (seFueron.length || llegaron.length || oblNuevos.length || oblMenos.length || volvieron.length) {
      cambios.push({ funcion: fn, actor: e.actor, campos_que_ya_no_existen: seFueron, campos_nuevos: llegaron, resueltos_por_mapa: resueltos, sin_mapa: sinMapa, obligatorios_nuevos: oblNuevos, obligatorios_que_dejaron_de_serlo: oblMenos, grave: sinMapa.length > 0 || oblNuevos.length > 0 })
    }
    nuevo.funciones[fn] = { actor: e.actor, acepta: [...h.acepta], obligatorios: [...(h.obligatorios || [])] }
    const retirados = unicos([...(nuevo.retirados[fn] || []).filter((c) => !h.acepta.includes(c)), ...sinMapa])
    if (retirados.length) nuevo.retirados[fn] = retirados.sort(); else delete nuevo.retirados[fn]
  }
  nuevo.congelado_en = ahora.toISOString().slice(0, 10)
  nuevo.funciones = ordenado(nuevo.funciones)
  return { datos: nuevo, cambios, ilegibles, hay_cambios: cambios.length > 0, graves: cambios.filter((c) => c.grave).length }
}

// ───────────── el validador del Servicio
export function codigoDelValidador(datos) {
  const esquemas = Object.fromEntries(Object.entries(datos.funciones).map(([f, e]) => [f, { acepta: e.acepta, obligatorios: e.obligatorios || [] }]))
  return `// 🔴 LA MITAD QUE APIFY NO HACE POR NOSOTROS.
// Apify SÍ rechaza si falta un campo obligatorio, pero un campo que NO CONOCE lo ignora en silencio, cobra y devuelve cero.
// Esquemas, renombres y campos retirados son DATO (scripts/worker-staging/esquemas-apify/esquemas.json, congelado el ${datos.congelado_en}); este código no sabe de ningún actor.
// Re-congelar: node scripts/ops/recongelar-esquemas.mjs aplicar --ejecutar (respalda los dos flujos y deja la reversa).
const ESQUEMAS = ${JSON.stringify(esquemas)};
const RENOMBRES = ${JSON.stringify(datos.renombres || {})};
const RETIRADOS = ${JSON.stringify(datos.retirados || {})};

const ctx = $input.first().json;
const fn = ctx.apify_function;
const esq = ESQUEMAS[fn];
if (!esq || !esq.acepta) {
  // sin esquema conocido no se inventa un veredicto · se deja pasar y se declara
  return [{ json: { ...ctx, cuerpo_ok: true, esquema_desconocido: true } }];
}
const cuerpo = { ...(ctx.cuerpo || {}) };
const avisos = [];
const sinMapa = [];
// 1 · campo VIEJO con renombre en el mapa → nombre nuevo (y valor traducido si el mapa lo dice)
const mapa = RENOMBRES[fn] || {};
for (const viejo of Object.keys(mapa)) {
  if (!(viejo in cuerpo) || esq.acepta.includes(viejo)) continue;
  const r = mapa[viejo];
  let valor = cuerpo[viejo];
  if (r.valores) {
    const k = String(valor);
    if (!Object.prototype.hasOwnProperty.call(r.valores, k)) { sinMapa.push(viejo + ' (el valor «' + k + '» no tiene traducción en el mapa)'); delete cuerpo[viejo]; continue; }
    valor = r.valores[k];
  }
  delete cuerpo[viejo];
  if (!(r.a in cuerpo)) cuerpo[r.a] = valor;
  avisos.push(fn + ' · el raspador renombró «' + viejo + '» a «' + r.a + '» · se mandó con el nombre nuevo (mapa de renombres)');
}
// 2 · campo que SE FUE y no tiene mapa → NO se llama al raspador: cobraría y devolvería vacío como si fuera dato
for (const k of Object.keys(cuerpo)) {
  if ((RETIRADOS[fn] || []).includes(k) && !esq.acepta.includes(k)) sinMapa.push(k);
}
if (sinMapa.length) {
  const detalle = 'campo(s) que ya no existen en el raspador y no tienen mapa de renombre: ' + sinMapa.join(', ');
  const est = $getWorkflowStaticData('global');
  est.avisados = est.avisados || {};
  const clave = fn + '|' + sinMapa.slice().sort().join(',');
  const primera = !est.avisados[clave];
  if (primera) est.avisados[clave] = new Date().toISOString();
  return [{ json: { ...ctx, cuerpo_ok: false, validation_error: true, sin_dato_por_cambio: true,
    errors: [fn + ' · sin dato por cambio del raspador · ' + detalle + ' · NO se llamó al raspador (no se entrega vacío como si fuera dato)'],
    aviso_cambio: primera ? { funcion: fn, motivo: 'campo_desaparecido', detalle } : null } }];
}
const mandados = Object.keys(cuerpo);
const desconocidos = mandados.filter((k) => !esq.acepta.includes(k));
const faltan = (esq.obligatorios || []).filter((k) => !mandados.includes(k));
// 🔴 LA REGLA, medida y no supuesta (05-sep):
//   FALTA UN OBLIGATORIO  → RECHAZO.
//   CAMPO DESCONOCIDO     → AVISO, no rechazo (medido: algunos actores aceptan campos que su esquema no declara).
if (faltan.length) {
  return [{ json: { ...ctx, cuerpo_ok: false, validation_error: true,
    errors: [fn + ' · falta obligatorio · ' + faltan.join(', ')] } }];
}
return [{ json: { ...ctx, cuerpo, cuerpo_ok: true,
  avisos: avisos.concat(desconocidos.length
    ? [fn + ' · el raspador no declara · ' + desconocidos.join(', ') + ' · se manda igual (medido: algunos lo aceptan) pero queda ESCRITO']
    : []) } }];
`
}

const cambiarCodigo = (nodo, nuevo) => { const crlf = String(nodo.parameters.jsCode).includes('\r\n'); nodo.parameters.jsCode = crlf ? nuevo.split('\n').join('\r\n') : nuevo }

export function servicioConEsquemasVivos(flujo, datos) {
  const f = JSON.parse(JSON.stringify(flujo))
  const val = f.nodes.find((n) => n.name === NOMBRE_DEL_VALIDADOR)
  const sal = f.nodes.find((n) => n.name === NOMBRE_DE_LA_SALIDA)
  const si = f.nodes.find((n) => n.name === NOMBRE_DEL_IF)
  if (!val || !sal || !si) throw new Error('faltan el validador, su IF o la salida de rechazo')
  cambiarCodigo(val, codigoDelValidador(datos))
  // la respuesta de rechazo DICE que fue un cambio del raspador
  const marca = '    validation_error: rechazo,'
  const codigoSalida = String(sal.parameters.jsCode)
  if (!codigoSalida.includes('sin_dato_por_cambio')) {
    const lf = codigoSalida.split('\r\n').join('\n')
    if (lf.split(marca).length !== 2) throw new Error('skipped-response: esperaba 1 ocurrencia de validation_error')
    cambiarCodigo(sal, lf.replace(marca, marca + '\n    sin_dato_por_cambio: ctx.sin_dato_por_cambio === true,'))
  }
  // el aviso: una rama LATERAL de la salida «no» del IF (no toca la respuesta): IF → HTTP a #alertas
  if (!f.nodes.some((n) => n.name === NODO_AVISO_IF)) {
    const posIf = si.position || [0, 0]
    f.nodes.push({
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'aviso-cond', leftValue: '={{ $json.aviso_cambio ? "si" : "no" }}', rightValue: 'si', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
      id: 'avisar-cambio-if', name: NODO_AVISO_IF, type: 'n8n-nodes-base.if', typeVersion: si.typeVersion, position: [posIf[0] + 240, posIf[1] + 220],
      notes: 'Solo la PRIMERA vez que un campo desaparece sin mapa (la sordina vive en el validador, en los datos estáticos del flujo): una línea a #alertas',
    })
    f.nodes.push({
      parameters: {
        method: 'POST', url: URL_DEL_AVISO, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ dry_run: $json.dry_run === true, funcion: $json.aviso_cambio.funcion, motivo: $json.aviso_cambio.motivo, detalle: $json.aviso_cambio.detalle }) }}',
        options: { timeout: 10000, response: { response: { neverError: true } } },
      },
      id: 'avisar-cambio-http', name: NODO_AVISO, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [posIf[0] + 480, posIf[1] + 220],
    })
    const sal0 = f.connections[NOMBRE_DEL_IF].main
    sal0[1] = [...(sal0[1] || []), { node: NODO_AVISO_IF, type: 'main', index: 0 }]
    f.connections[NODO_AVISO_IF] = { main: [[{ node: NODO_AVISO, type: 'main', index: 0 }], []] }
  }
  return f
}

// ───────────── el relector del lunes
export function codigoDelRelectorUnoPorRaspador(datos) {
  const lista = Object.entries(datos.funciones).map(([funcion, e]) => ({ funcion, actor: e.actor, acepta: e.acepta, obligatorios: e.obligatorios || [] }))
  return `// Los esquemas CONGELADOS el ${datos.congelado_en}, tal como los usa el validador del Servicio: salen de scripts/worker-staging/esquemas-apify/esquemas.json (la misma fuente que el validador).
// Si Apify cambia uno, esto lo ve el lunes siguiente.
//
// 🔴 POR QUÉ EXISTE: los cuatro defectos vivieron meses porque NADIE MIRABA, y el síntoma era «éxito con cero filas».
const CONGELADO = ${JSON.stringify(lista)};
const RENOMBRES = ${JSON.stringify(datos.renombres || {})};
return CONGELADO.map((c) => ({ json: { ...c, renombres: RENOMBRES[c.funcion] || {} } }));
`
}

export function codigoDelRelectorComparar() {
  return `const congelados = $('Uno por raspador').all().map((i) => i.json);
const hoy = $input.all().map((i) => i.json);
const cambios = [];
for (let k = 0; k < congelados.length; k++) {
  const c = congelados[k];
  const inp = hoy[k] && hoy[k].data && hoy[k].data.actorDefinition && hoy[k].data.actorDefinition.input;
  if (!inp) { cambios.push({ funcion: c.funcion, que: 'no se pudo leer el esquema hoy' }); continue; }
  const aceptaHoy = Object.keys(inp.properties || {});
  const oblHoy = inp.required || [];
  const seFueron = (c.acepta || []).filter((x) => !aceptaHoy.includes(x));
  const llegaron = aceptaHoy.filter((x) => !(c.acepta || []).includes(x));
  const oblNuevos = oblHoy.filter((x) => !(c.obligatorios || []).includes(x));
  const oblMenos = (c.obligatorios || []).filter((x) => !oblHoy.includes(x));
  const mapa = c.renombres || {};
  // un campo que se fue pero tiene renombre (hacia un campo que existe hoy) NO es grave: el validador ya lo traduce
  const resueltos = seFueron.filter((x) => mapa[x] && aceptaHoy.includes(mapa[x].a));
  const sinMapa = seFueron.filter((x) => !resueltos.includes(x));
  if (seFueron.length || oblNuevos.length || oblMenos.length || llegaron.length) {
    cambios.push({ funcion: c.funcion, actor: c.actor, campos_que_ya_no_existen: seFueron, resueltos_por_mapa: resueltos, sin_mapa: sinMapa,
      obligatorios_nuevos: oblNuevos, obligatorios_que_dejaron_de_serlo: oblMenos, campos_nuevos: llegaron, grave: sinMapa.length > 0 || oblNuevos.length > 0 });
  }
}
// UNA sola vez por cambio: lo ya avisado (misma función y mismos campos) no se repite cada lunes; se avisa de nuevo solo si el cambio es otro
const est = $getWorkflowStaticData('global');
est.avisados = est.avisados || {};
const nuevos = [];
for (const c of cambios) {
  const clave = c.funcion + '|' + JSON.stringify([c.campos_que_ya_no_existen, c.campos_nuevos, c.obligatorios_nuevos, c.obligatorios_que_dejaron_de_serlo, c.que || '']);
  if (est.avisados[clave]) continue;
  est.avisados[clave] = new Date().toISOString();
  nuevos.push(c);
}
const graves = nuevos.filter((c) => c.grave || c.que);
if (!nuevos.length) return [{ json: { hay_cambios: false, graves: 0, cambios: [] } }];
return nuevos.map((c) => ({ json: { hay_cambios: true, graves: graves.length, funcion: c.funcion,
  detalle: (c.que ? c.que : 'ya no existen: ' + (c.campos_que_ya_no_existen.join(', ') || '—') + (c.resueltos_por_mapa.length ? ' (con mapa: ' + c.resueltos_por_mapa.join(', ') + ')' : '') + ' · sin mapa: ' + (c.sin_mapa.join(', ') || '—') + ' · obligatorios nuevos: ' + (c.obligatorios_nuevos.join(', ') || '—') + ' · campos nuevos: ' + (c.campos_nuevos.join(', ') || '—')).slice(0, 560), grave: !!(c.grave || c.que) } }));
`
}

export function relectorConEsquemasVivos(flujo, datos) {
  const f = JSON.parse(JSON.stringify(flujo))
  const uno = f.nodes.find((n) => n.name === 'Uno por raspador')
  const cmp = f.nodes.find((n) => n.name === 'Comparar contra lo congelado')
  const campana = f.nodes.find((n) => n.name === 'Tocar la campana')
  if (!uno || !cmp || !campana) throw new Error('faltan nodos del relector')
  cambiarCodigo(uno, codigoDelRelectorUnoPorRaspador(datos))
  cambiarCodigo(cmp, codigoDelRelectorComparar())
  // la campana ahora entra por la ruta del portero (#alertas, con el bot) en vez del webhook de #equipo; una llamada por cambio nuevo
  campana.parameters = {
    method: 'POST', url: URL_DEL_AVISO, sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
    sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ dry_run: false, funcion: $json.funcion, motivo: "cambio_sin_resolver", detalle: $json.detalle }) }}',
    options: { timeout: 10000, response: { response: { neverError: true } } },
  }
  return f
}
