// ⑥ SECO · SIN VUELTA · CC#1 · 2026-09-29. En modo seco no se avisa a la sala ni se escribe nada, pero se demuestra qué se habría avisado.
const c = $input.first().json
return [{
  json: {
    seco: true,
    sin_vuelta: true,
    escrituras_reales: 0,
    no_se_escribio_en: ['client_historical_outputs', 'Drive (texto-a-drive)', 'la sala (SALA_CALLBACK_URL)'],
    motivo: c.motivo,
    detalle: c.detalle,
    habria_avisado: c.payload_cable,
    formas_validas: !!(c.payload_cable && c.payload_cable.event_type === 'run_completed' && c.payload_cable.worker_name === 'brief' && c.payload_cable.resultado === 'parte_sin_vuelta'),
  },
}]
