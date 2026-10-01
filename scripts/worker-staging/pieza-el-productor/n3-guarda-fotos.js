// ③ GUARDA · las fotos propias del cliente · CC#1 · 2026-10-01. Entrada: las filas `client_social_images` del cliente con owner_role=propio y estado=ok.
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
// las más recientes primero (la consulta ya las trae ordenadas) · el tope se declara
const candidatas = filas.slice(0, MAX_IMAGENES)
const no_enviadas = filas.slice(MAX_IMAGENES).map((f) => f.id)

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
return [{
  json: {
    ...prev,
    fotos,
    fotos_en_la_tabla: filas.length,
    fotos_enviadas: fotos.length,
    fotos_no_enviadas: no_enviadas,
    fotos_excluidas: excluidas,
    fotos_bytes: total,
    sin_fotos: fotos.length === 0,
  },
}]
