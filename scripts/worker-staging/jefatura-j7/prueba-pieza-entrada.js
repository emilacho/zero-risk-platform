// ⓪ ENTRADA · LLAVE · PRUEBA DE PIEZA · J7(pieza) · CC#1 · 2026-10-14 · flujo `zero-risk/jefatura-prueba-pieza` (INACTIVO). Revisa una pieza YA PRODUCIDA con la puerta de la jefatura; no produce nada.
// 15-oct (firma de Emilio «si a todo»): acepta TAMBIÉN `x-api-key` = `INTERNAL_API_KEY` (por `$env`, nunca pegada), sin quitar la llave de despacho. Nada más del flujo cambia.
// Solo valida: la llave (despacho o interna), `dry_run` booleano (ausente NO se lee como real ni como seco) y lo mínimo de la pieza. Nada de aquí paga.
const w = $input.first().json || {}
const body = w.body && typeof w.body === 'object' && !Array.isArray(w.body) ? w.body : {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}
const despacho = String($env.SALA_DISPATCH_KEY || '').trim()
const interna = String($env.INTERNAL_API_KEY || '').trim()
if (!despacho && !interna) throw new Error('PRUEBA_PIEZA_CERRADA · el motor no tiene ninguna llave (SALA_DISPATCH_KEY ni INTERNAL_API_KEY) · el flujo queda cerrado · E67.')
// comparación en tiempo constante: se recorre SIEMPRE la longitud de la esperada; una cabecera de otro largo nunca coincide
const igual = (dada, esperada) => {
  if (!esperada) return false
  const d = String(dada || '')
  let ok = d.length === esperada.length
  for (let i = 0; i < esperada.length; i++) ok = d.charCodeAt(i) === esperada.charCodeAt(i) && ok
  return ok
}
// cada llave solo vale en SU cabecera: la de despacho en `x-sala-dispatch-key`, la interna en `x-api-key` (una no sustituye a la otra)
const okDespacho = igual(headers['x-sala-dispatch-key'], despacho)
const okInterna = igual(headers['x-api-key'], interna)
if (!okDespacho && !okInterna) throw new Error('PRUEBA_PIEZA_PROCEDENCIA_INVALIDA · llave de despacho o interna ausente o incorrecta · E67.')
if (typeof body.dry_run !== 'boolean') throw new Error('PRUEBA_PIEZA_SIN_DRY_RUN · dry_run debe ser booleano (true o false) · se DETIENE antes de abrir nada')
if (typeof body.client_id !== 'string' || !/^[A-Za-z0-9_-]{3,80}$/.test(body.client_id)) throw new Error('PRUEBA_PIEZA_CLIENTE_INVALIDO · client_id debe ser texto simple (letras, números, guion) · se DETIENE')
if (typeof body.texto !== 'string' || !body.texto.trim()) throw new Error('PRUEBA_PIEZA_SIN_TEXTO · falta el texto de la pieza · se DETIENE')
if (typeof body.artifact_id !== 'string' || !/^[A-Za-z0-9_.:-]{3,120}$/.test(body.artifact_id)) throw new Error('PRUEBA_PIEZA_ARTEFACTO_INVALIDO · artifact_id debe ser texto simple y único por pieza · se DETIENE')
const lista = (v) => (Array.isArray(v) ? v : [])
return [{ json: {
  client_id: body.client_id,
  artifact_id: body.artifact_id,
  journey_id: typeof body.journey_id === 'string' && body.journey_id ? body.journey_id : null,
  dry_run: body.dry_run,
  texto: body.texto,
  familia: typeof body.familia === 'string' && body.familia ? body.familia : 'post_img',
  imagenes: lista(body.imagenes).filter((u) => typeof u === 'string'),
  contexto: lista(body.contexto).filter((c) => c && typeof c.titulo === 'string' && typeof c.texto === 'string'),
  productores: lista(body.productores).filter((p) => p && typeof p.donde === 'string' && typeof p.agente === 'string'),
  marcas_heredadas: lista(body.marcas_heredadas).filter((m) => typeof m === 'string'),
  tope_restante_usd: typeof body.tope_restante_usd === 'number' && Number.isFinite(body.tope_restante_usd) && body.tope_restante_usd >= 0 ? body.tope_restante_usd : null,
  simulacion: body.dry_run === true && body.simulacion && typeof body.simulacion === 'object' ? body.simulacion : null,
} }]
