// JEF · armar · PRUEBA DE PIEZA · J7(pieza) · CC#1 · 2026-10-14 · arma la entrada de la ruta con la pieza que llegó por el webhook. NO lanza: si algo no cuadra, `abrir = false`.
// `devolver_a = ninguno`: el resultado queda en `jefatura_revisiones` (la bandeja de la pieza la escribe la oficina en J8a, no este flujo). Con `dry_run = true` puede traer `simulacion`.
const CFG = __CFG__
const jef = { fase: 'no_abre', motivo: '', plazo_fin: Date.now() + CFG.plazo_s * 1000 }
const e = $('⓪ Entrada · llave').first().json
const sobre = {
  artifact_type: 'pieza',
  artifact_id: e.artifact_id,
  client_id: e.client_id,
  journey_id: e.journey_id,
  payload: {
    texto: e.texto,
    familia: e.familia,
    dry_run: e.dry_run,
    devolver_a: { tipo: 'ninguno', destino: '' },
    chequeos_previos: { pasaron: true, necesita_humano: false, marcas: [] },
    ...(e.contexto.length ? { contexto: e.contexto } : {}),
    ...(e.imagenes.length ? { imagenes: e.imagenes } : {}),
    ...(e.productores.length ? { productores: e.productores } : {}),
    ...(e.marcas_heredadas.length ? { marcas_heredadas: e.marcas_heredadas } : {}),
    ...(e.tope_restante_usd !== null ? { tope_restante_usd: e.tope_restante_usd } : {}),
    ...(e.simulacion ? { simulacion: e.simulacion } : {}),
  },
}
return [{ json: { jef: { ...jef, fase: 'abrir', motivo: '' }, abrir: true, sobre } }]
