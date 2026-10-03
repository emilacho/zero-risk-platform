// ③ GUARDA · las fotos propias del cliente · CC#1 · 2026-10-01 · 03-oct: CADA FOTO CON SU CONTEXTO (texto · fecha · enlace · posición · medio · producto) y SIN la repetida (`duplicado_de`) · la lógica `raicesDe` / `entradaDeProtagonista` viene de fotos-contexto-logica.js (pegada arriba por el constructor). Entrada: las filas `client_social_images` del cliente con owner_role=propio y estado=ok.
// 🔴 Reglas (todas DECLARADAS, ninguna calla):
//   · sólo se aceptan fotos de NUESTRO almacén (bucket client-social-images): una URL de afuera DETIENE la corrida (nunca se manda al corredor una dirección ajena · y Instagram corta al corredor, ver doc 01 §2.2)
//   · el corredor aborta TODO el pedido si UNA foto no baja, sin cobro y sin fila: por eso aquí se COMPRUEBA cada una (HEAD · 200 · tipo imagen · tamaño) y la que no sirve se EXCLUYE y se DECLARA con su causa
//   · límites medidos en el código del corredor: 20 imágenes por pedido · 10 MB por imagen · prudencia del proveedor: 5 MB por imagen y 32 MB en base64 por pedido (no verificados · se aplican como tope duro de este flujo)
//   · lo que no cabe se DECLARA (`fotos_no_enviadas` con sus ids) · nunca se recorta callado · sin fotos NO es un fallo: la pieza sale sin ellas y lo dice
const prev = $('② GUARDA · sin manual aprobado se DETIENE').first().json
// 🔴 UN ERROR DE LA BASE NO ES «VACÍO» (certificación CC#3 · 01-oct): el nodo HTTP de la consulta tiene `onError: continueRegularOutput` y, si la base falla, entrega un ítem `{error:{…}}`
// (o PostgREST contesta un OBJETO `{code, message}` en vez de una lista). Leerlo como «sin fotos» seguiría hacia el nodo que PAGA. Se DETIENE con su motivo.
const _filas = $input.all().map((i) => i.json)
const _falla = _filas.find((r) => r && ((r.error !== undefined && r.error !== null) || (r.code !== undefined && r.message !== undefined && r.id === undefined)))
if (_falla) {
  const _m = _falla.error && typeof _falla.error === 'object' ? (_falla.error.message || _falla.error.name) : (_falla.error || _falla.message)
  throw new Error('PIEZA_FOTOS_CONSULTA_FALLO · la consulta a la base FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «sin fotos» · se DETIENE y NO escribe nada')
}
const MAX_IMAGENES = 20
const MAX_BYTES_POR_IMAGEN = 5 * 1024 * 1024
const MAX_BASE64_TOTAL = 32 * 1024 * 1024
const ALMACEN = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/client-social-images\//
const TIPOS = /^image\/(jpeg|png|webp|gif)$/i

const filas = $input.all().map((i) => i.json).filter((r) => r && r.id && r.url)
for (const f of filas) {
  if (!ALMACEN.test(String(f.url))) {
    throw new Error('PIEZA_FOTO_FUERA_DEL_ALMACEN · la foto ' + f.id + ' no está en nuestro almacén (' + String(f.url).slice(0, 80) + ') · se DETIENE: sólo se mandan al corredor fotos de client-social-images')
  }
}
// 03-oct · SIN DUPLICADOS: la portada de un carrusel es su hijo 1 (misma huella): la fila repetida trae `duplicado_de` y no se manda · se DECLARA
const duplicadas_ocultas = filas.filter((f) => f.duplicado_de).map((f) => f.id)
const vivas = filas.filter((f) => !f.duplicado_de)
// las más recientes primero (la consulta ya las trae ordenadas) · si hay que recortar al tope, las fotos cuyo texto nombra algo del PROTAGONISTA del brief van primero (orden estable: no se pierde la que importa)
// (esta prioridad es amplia a propósito: la decisión exacta de «cuál es el producto» la toma ⑤, que ya conoce la marca y sus ciudades)
const _prot = productoDelBrief(prev.brief, [])
const _prioridad = (f) => (_prot && raicesDe(f.caption || '', []).some((r) => _prot.raices.indexOf(r) !== -1) ? 0 : 1)
const ordenadas = vivas.map((f, i) => ({ f, i })).sort((a, b) => _prioridad(a.f) - _prioridad(b.f) || a.i - b.i).map((x) => x.f)
const candidatas = ordenadas.slice(0, MAX_IMAGENES)
const no_enviadas = ordenadas.slice(MAX_IMAGENES).map((f) => f.id)

const etiqueta = (f) => (String(f.tipo || 'foto') + ' · ' + String(f.post_id || f.id)).slice(0, 80)
const medir = async (f) => {
  try {
    const r = await this.helpers.httpRequest({ method: 'HEAD', url: f.url, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 8000 })
    const h = (r && r.headers) || {}
    const ct = String(h['content-type'] || '').split(';')[0].trim()
    const bytes = Number(h['content-length'])
    if (!r || r.statusCode !== 200) return { f, causa: 'HTTP ' + (r && r.statusCode) }
    if (!TIPOS.test(ct)) return { f, causa: 'no es una imagen aceptada (' + (ct || 'sin tipo') + ')' }
    if (!Number.isFinite(bytes) || bytes <= 0) return { f, causa: 'sin tamaño declarado' }
    if (bytes > MAX_BYTES_POR_IMAGEN) return { f, causa: 'pesa ' + bytes + ' bytes (> ' + MAX_BYTES_POR_IMAGEN + ')' }
    return { f, bytes, ct }
  } catch (e) {
    return { f, causa: 'no se pudo comprobar · ' + String((e && (e.code || e.message)) || e).slice(0, 120) }
  }
}
const medidas = await Promise.all(candidatas.map(medir))
const excluidas = medidas.filter((m) => m.causa).map((m) => ({ id: m.f.id, label: etiqueta(m.f), causa: m.causa }))
let buenas = medidas.filter((m) => !m.causa)
// el total en base64 (×4/3) tampoco puede pasar: lo que sobra se EXCLUYE y se declara (de las más viejas hacia atrás)
let total = 0
const dentro = []
for (const m of buenas) {
  if ((total + m.bytes) * 4 / 3 > MAX_BASE64_TOTAL) { excluidas.push({ id: m.f.id, label: etiqueta(m.f), causa: 'el total en base64 pasaría de 32 MB' }); continue }
  total += m.bytes
  dentro.push(m)
}
const fotos = dentro.map((m) => ({ url: m.f.url, label: etiqueta(m.f) }))
// 03-oct · las filas CON TODO SU CONTEXTO: ⑤ las clasifica contra el producto del brief y arma lo que ve el productor (fotos de verdad · con su texto, fecha y enlace)
const fotos_filas = dentro.map((m) => ({ id: m.f.id, handle: m.f.handle || null, tipo: m.f.tipo || null, post_id: m.f.post_id || null, url: m.f.url, caption: m.f.caption || null, posted_at: m.f.posted_at || null, post_url: m.f.post_url || null, posicion: m.f.posicion || null, medio: m.f.medio || null, producto: Array.isArray(m.f.producto) ? m.f.producto : [], producto_fuente: m.f.producto_fuente || 'desconocido' }))
return [{
  json: {
    ...prev,
    fotos,
    fotos_filas,
    fotos_duplicadas_ocultas: duplicadas_ocultas,
    fotos_en_la_tabla: filas.length,
    fotos_enviadas: fotos.length,
    fotos_no_enviadas: no_enviadas,
    fotos_excluidas: excluidas,
    fotos_bytes: total,
    sin_fotos: fotos.length === 0,
  },
}]
