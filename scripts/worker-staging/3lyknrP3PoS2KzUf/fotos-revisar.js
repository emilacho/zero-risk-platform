// COPIA DE FOTOS · 3/5 · REVISAR · CC#1 · 2026-09-29 · 03-oct: SIN DUPLICADOS (huella SHA-256 · la portada de un carrusel es su hijo 1: se queda UNA y la repetida se DECLARA, no se sube) y el contexto de cada foto viaja a la tabla.
// (la lógica `sha256Hex` viene de fotos-contexto-logica.js, pegada arriba por el constructor) Mira lo que bajó CADA foto: si no es una imagen entera, se DECLARA aquí
// (fila estado=no_bajo con la causa exacta) y no pasa a subirse. Pasan solo las buenas, con su huella para verificar la subida.
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const metas = $('Fotos · lista').all().map((i) => i.json)
const entradas = $input.all()
const host = (u) => String(u).split('/')[2] || 'host desconocido'
const buenas = []
const fallas = []
const duplicadas = []
const vistas = {}
// el contexto que acompaña a cada fila (lo trae `Fotos · lista`)
const contexto = (m) => ({ caption: m.caption || null, posted_at: m.posted_at || null, post_url: m.post_url || null, posicion: m.posicion || null, medio: m.medio || null })
for (let i = 0; i < metas.length; i++) {
  const m = metas[i]
  const e = entradas[i]
  let causa = null
  let buf = null
  let ct = null
  if (!e) causa = 'sin respuesta del paso de descarga'
  else if (e.json && e.json.error) causa = 'red · ' + String(e.json.error.message || e.json.error).slice(0, 110)
  else if (e.json && e.json.statusCode && e.json.statusCode !== 200) causa = 'HTTP ' + e.json.statusCode
  else if (!e.binary || !e.binary.data) causa = 'la respuesta no trajo archivo'
  else {
    buf = await this.helpers.getBinaryDataBuffer(i, 'data')
    const h = buf.slice(0, 4).toString('hex')
    ct = h.startsWith('ffd8ff') ? 'image/jpeg' : h === '89504e47' ? 'image/png' : h === '52494646' && buf.slice(8, 12).toString('ascii') === 'WEBP' ? 'image/webp' : null
    if (!ct) causa = 'no es una imagen (empieza con ' + h + ' · ' + String(e.binary.data.mimeType || 'sin tipo') + ')'
    else if (buf.length > 10 * 1024 * 1024) causa = 'demasiado grande · ' + buf.length + ' B'
  }
  if (causa) {
    fallas.push({ client_id: m.client_id, owner_role: m.owner_role, handle: m.handle, post_id: m.post_id, tipo: m.tipo, url: null, estado: 'no_bajo', causa: causa + ' · ' + host(m.src), ...contexto(m) })
    continue
  }
  // 🔴 la MISMA imagen dos veces dentro de un post (portada = hijo 1) no se sube dos veces: se queda la primera y la repetida se declara
  const hash = sha256Hex(buf)
  const claveDup = String(m.post_id).replace(/-c\d+$/, '') + '|' + hash
  if (vistas[claveDup] !== undefined) { duplicadas.push({ post_id: m.post_id, igual_a: vistas[claveDup], hash }); continue }
  vistas[claveDup] = m.post_id
  const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg'
  buenas.push({
    json: { ...m, ct, hash_archivo: hash, bytes: buf.length, magic: buf.slice(0, 4).toString('hex'), path: m.client_id + '/' + m.owner_role + '/' + m.handle + '/' + m.post_id + '.' + ext },
    binary: { data: e.binary.data },
  })
}
// las que no bajaron se DECLARAN ya en la tabla (aunque nada más suba)
if (fallas.length) {
  const w = await this.helpers.httpRequest({
    url: SB + '/rest/v1/client_social_images?on_conflict=client_id,owner_role,handle,post_id', method: 'POST', json: true,
    returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000, body: fallas,
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  if (w.statusCode >= 300) throw new Error('COPIA_FOTOS_SIN_ANOTAR · la tabla respondió HTTP ' + w.statusCode + ' · ' + JSON.stringify(w.body).slice(0, 200))
}
const resumen = (fs) => fs.length + ' de ' + metas.length + ' · ' + fs.slice(0, 5).map((f) => f.handle + '/' + f.post_id + ' → ' + f.causa).join(' | ')
if (!buenas.length) {
  if (fallas.length) throw new Error('FOTOS_NO_BAJARON · ' + resumen(fallas))
  return []
}
buenas.forEach((b) => { b.json._fallas = fallas; b.json._total = metas.length; b.json._duplicadas = duplicadas })
return buenas
