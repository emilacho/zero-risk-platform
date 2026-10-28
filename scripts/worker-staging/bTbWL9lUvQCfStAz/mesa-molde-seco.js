// ── 28-oct · LA MESA EN SECO · el equipo simulado habla como el real (texto libre, citas A<n>) y la dirección USA la herramienta `pedir_material` DE VERDAD (llamada a la plataforma; en seco el portero no cuesta).
// Solo afecta al modo seco: en real este bloque no se ejecuta.
if (e.dry_run === true && p.esquema === 'opinion_libre.v1') {
  const respuesta = (campos) => [{ json: { ...e, simulado: true, resultado_body: { accion: 'resultado', encargo_id: e.encargo_id, n: t.n, costo_usd: 0, workflow_execution_id: $execution.id, ...campos } } }]
  const agente = String(p.agent_name || '')
  const tarea = String(p.task || '')
  if (!(p.extra && p.extra.mesa === true)) return respuesta({ texto: '(simulado) opinión de ' + agente })
  const turno = /DIRECCIÓN CREATIVA: abre/.test(tarea) ? 'dirigir' : /DIRECCIÓN CREATIVA: (integra|completa)/.test(tarea) ? 'integrar' : /te hicieron un pedido/.test(tarea) ? 'responder' : /aporta tu especialidad/.test(tarea) ? 'aportar' : ''
  if (!turno) return respuesta({ error: 'OFICINA_SIN_MOLDE_SIMULADO · la mesa pidió un turno que el modelo simulado no conoce (' + agente + ') · se DETIENE' })
  if (turno === 'dirigir') {
    const r = await this.helpers.httpRequest({ url: 'https://zero-risk-platform.vercel.app/api/oficina/mesa/herramienta', method: 'POST', headers: { 'x-api-key': String($env.INTERNAL_API_KEY || ''), 'content-type': 'application/json' }, body: { herramienta: 'pedir_material', encargo_id: e.encargo_id, de: agente, que: '(simulado) datos verificados del cliente: servicios y horarios', para_que: '(simulado) para el texto de las láminas' }, json: true, ignoreHttpStatusErrors: true, timeout: 20000 })
    if (!r || r.ok !== true) return respuesta({ error: 'MESA_SECO · pedir_material no quedó anotado en el tablero: ' + JSON.stringify(r).slice(0, 300) })
    return respuesta({ texto: '(simulado) Idea rectora: contar el servicio en cinco láminas con tono cercano. Pedí material al portero (' + r.ref + ') y espero el aporte de cada especialista.' })
  }
  if (turno === 'aportar' || turno === 'responder') return respuesta({ texto: '(simulado) Aporte de ' + agente + ': propuesta concreta de mi especialidad para esta pieza.' })
  // integrar: la pieza completa en la convención de la mesa y UNA cita por cada aporte del tablero (con motivo)
  const aportes = [...tarea.matchAll(/^\*\*A(\d+)\*\* · (\S+)(?: → \S+)? · (aporta|responde|material|dirige)\s*$/gm)].map((m) => ({ n: m[1], de: m[2] }))
  const f = /## Fotos propias[^\n]*\n(?:[^\n]*\n)*?- ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) ·/.exec(tarea)
  const laminas = [['hook', 'Primera lámina simulada', 'Gancho de prueba'], ['problem', 'Segunda lámina simulada', 'El problema de prueba'], ['benefit', 'Tercera lámina simulada', 'El beneficio de prueba'], ['proof', 'Cuarta lámina simulada', 'La prueba de prueba'], ['cta', 'Quinta lámina simulada', 'Escríbenos']]
  const pieza = []
  laminas.forEach(([rol, titulo, texto], i) => { pieza.push('## Lámina ' + (i + 1) + ' · ' + rol, 'Título: ' + titulo, 'Texto: (simulado) ' + texto); if (rol === 'cta') pieza.push('Llamado: Escríbenos'); pieza.push('Imagen: ' + (i === 0 && f ? 'foto:' + f[1] : 'ninguna')) })
  pieza.push('## Pie', '(simulado) pie de foto de prueba', '## Etiquetas', '#simulado #ensayo', '## Citas')
  for (const a of aportes) pieza.push('A' + a.n + ' usé: (simulado) tomé el aporte de ' + a.de + ' para la pieza')
  return respuesta({ texto: pieza.join('\n') })
}

