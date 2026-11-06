// «Armar el aviso» · CC#1 · 2026-09-30. Un solo mensaje por pasada con los hallazgos NUEVOS de severidad alta.
const a = $input.first().json
const base = ($env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').split('/').slice(0, 3).join('/')
const QUE_HACER = {
  termino_y_no_entrego: 'el resultado está guardado: hay que recuperarlo y revisar el proceso que lo esperaba (agent_invocations · punto de control)',
  nunca_arranco: 'el trabajo no corrió y no costó nada: hay que pedirlo de nuevo',
  sin_senales_de_vida: 'hay que ver si el servidor de los empleados se reinició y pedirlo de nuevo si no hay resultado (corredor Railway)',
  error_sin_entrega: 'el proceso puede seguir esperando: hay que abrirlo y cancelarlo (ejecución n8n)',
}
const lineas = a.avisos.slice(0, 8).map((x) => {
  const inv = x.invocacion ? ' · invocación `' + String(x.invocacion.id || '?').slice(0, 8) + '` (' + Math.round((x.invocacion.duracion_ms || 0) / 1000) + ' s · US$ ' + x.invocacion.costo_usd + ')' : ''
  return '• *' + x.clasificacion + '* — ' + x.que + '\n   agente `' + x.agente + '` · ejecución <' + base + '/workflow/_/executions/' + x.ejecucion + '|' + x.ejecucion + '> · edad ' + Math.round(x.edad_s / 60) + ' min · intentos de vuelta ' + x.intentos + (x.ultimo_intento ? ' (' + x.ultimo_intento + ')' : '') + inv + '\n   → ' + (QUE_HACER[x.clasificacion] || 'revisar')
})
const extra = a.avisos.length > 8 ? '\n… y ' + (a.avisos.length - 8) + ' más (ver agent_dispatch_reconciliations)' : ''
return [{ json: { ...a, titulo: 'Despachos huérfanos: ' + a.avisos.length + ' nuevo(s)', texto: lineas.join('\n') + extra, claves: a.avisos.map((x) => x.dispatch_key) } }]
