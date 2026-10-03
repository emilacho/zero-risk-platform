// COPIA DE FOTOS · 5/5 · ANOTAR · CC#1 · 2026-09-29 · 03-oct: cada fila guarda TODO su contexto (texto · fecha · enlace del post · posición · medio real · huella). Re-raspar completa las filas viejas (upsert). VERIFICA cada subida contra lo que se bajó (largo y firma del archivo) antes
// de anotarla como `ok`: una subida dañada se DECLARA (no_bajo · «subida dañada») y nunca se da por buena.
const SB = 'https://ordaeyxvvvdqsznsecjx.supabase.co'
const auth = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }
const metas = $('Fotos · revisar').all().map((i) => i.json)
const subidas = $input.all()
const fallasPrevias = (metas[0] && metas[0]._fallas) || []
const total = (metas[0] && metas[0]._total) || metas.length
const duplicadas = (metas[0] && metas[0]._duplicadas) || []
const filas = []
for (let i = 0; i < metas.length; i++) {
  const m = metas[i]
  const s = subidas[i] && subidas[i].json
  const fila = { client_id: m.client_id, owner_role: m.owner_role, handle: m.handle, post_id: m.post_id, tipo: m.tipo, url: null, estado: 'no_bajo', causa: null, caption: m.caption || null, posted_at: m.posted_at || null, post_url: m.post_url || null, posicion: m.posicion || null, medio: m.medio || null, hash_archivo: m.hash_archivo || null }
  const url = SB + '/storage/v1/object/public/client-social-images/' + m.path
  if (!s || (s.statusCode && s.statusCode >= 300) || s.error) {
    fila.causa = 'subida rechazada · ' + (s && (s.statusCode ? 'HTTP ' + s.statusCode : String((s.error && s.error.message) || s.error).slice(0, 100)))
  } else {
    const c = await this.helpers.httpRequest({ url: url + '?nc=' + Date.now(), method: 'GET', encoding: 'arraybuffer', returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000 })
    const g = Buffer.from(c.body || [])
    if (c.statusCode !== 200 || g.length !== m.bytes || g.slice(0, 4).toString('hex') !== m.magic) {
      fila.causa = 'subida dañada · esperado ' + m.bytes + ' B (' + m.magic + ') · hay ' + g.length + ' B (' + g.slice(0, 4).toString('hex') + ') · HTTP ' + c.statusCode
    } else {
      fila.url = url
      fila.estado = 'ok'
    }
  }
  filas.push(fila)
}
const w = await this.helpers.httpRequest({
  url: SB + '/rest/v1/client_social_images?on_conflict=client_id,owner_role,handle,post_id', method: 'POST', json: true,
  returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000, body: filas,
  headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
})
if (w.statusCode >= 300) throw new Error('COPIA_FOTOS_SIN_ANOTAR · la tabla respondió HTTP ' + w.statusCode + ' · ' + JSON.stringify(w.body).slice(0, 200))
const malas = filas.filter((f) => f.estado !== 'ok').concat(fallasPrevias)
if (malas.length) {
  throw new Error('FOTOS_NO_BAJARON · ' + malas.length + ' de ' + total + ' · ' + malas.slice(0, 5).map((f) => f.handle + '/' + f.post_id + ' → ' + f.causa).join(' | '))
}
return [{ json: { copia_fotos: 'ok', fotos: filas.length, duplicadas_no_subidas: duplicadas.length, duplicadas, perfiles: [...new Set(filas.map((f) => f.owner_role + ':' + f.handle))] } }]
