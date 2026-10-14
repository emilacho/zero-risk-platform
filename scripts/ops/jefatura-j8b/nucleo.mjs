// J8b · LO QUE SE RETIRA DE JULIO Y LA CABECERA DEL EDITOR · núcleo puro · CC#1 · 14-oct · diseño v4 §9 y §11.2 (todo con respaldo; NADA se ejecuta aquí: las funciones solo calculan).
//  1. cabecera `x-skip-editor-middleware: 1` en «② Agente (run-sdk)» de `bTbWL9lUvQCfStAz` (el texto de la oficina: `content-creator` está en la lista del editor viejo)
//  2. desactivar el voto de julio `hi5nwPCGUWHkGnT7` (activo y huérfano), solo si NADIE lo referencia
//  3. `is_active = false` en las 4 filas de contenido de `jefatura_grading_policies` (nunca las 3 del cimiento)
//  4. cerrar con respaldo las filas `editor_escalation` pendientes de `hitl_pending_approvals` (solo ese `approval_type`)
export const FLUJO_OFICINA = 'bTbWL9lUvQCfStAz'
export const FLUJO_VOTO = 'hi5nwPCGUWHkGnT7'
export const NODO_AGENTE = '② Agente (run-sdk)'
export const CABECERA = { name: 'x-skip-editor-middleware', value: '1' }
export const TIPOS_DE_CONTENIDO = ['ad_creative', 'copy', 'email', 'landing']
export const TIPOS_DEL_CIMIENTO = ['brand_book', 'icp', 'competitive']
export const ESTADOS_PENDIENTES = ['pending', 'notified', 'escalated']

const copia = (x) => JSON.parse(JSON.stringify(x))

/** el flujo de la oficina con la cabecera en su nodo del agente. Cambia SOLO ese nodo y SOLO la lista de cabeceras. Se niega si ya la trae o si el nodo no es único. */
export function conCabeceraDelEditor(flujo) {
  const nodos = (flujo.nodes ?? []).filter((n) => n.name === NODO_AGENTE)
  if (nodos.length !== 1) throw new Error(`se esperaba UN nodo «${NODO_AGENTE}» y hay ${nodos.length}: el flujo cambió, se revisa`)
  const nuevo = copia(flujo)
  const n = nuevo.nodes.find((x) => x.name === NODO_AGENTE)
  if (n.type !== 'n8n-nodes-base.httpRequest') throw new Error(`«${NODO_AGENTE}» ya no es un nodo HTTP`)
  const hp = n.parameters.headerParameters?.parameters
  if (n.parameters.sendHeaders !== true || !Array.isArray(hp)) throw new Error(`«${NODO_AGENTE}» no envía cabeceras como se esperaba`)
  if (hp.some((h) => String(h.name).toLowerCase() === CABECERA.name)) throw new Error(`«${NODO_AGENTE}» ya trae la cabecera ${CABECERA.name}`)
  hp.push({ ...CABECERA })
  return nuevo
}

/** quién referencia un flujo (por su id) dentro de los demás: nodos que ejecutan un sub-flujo o llaman a su webhook. Un voto «huérfano» es el que devuelve lista vacía. */
export function referenciasA(flujos, id, { excepto = /** @type {string[]} */ ([]) } = {}) {
  const out = []
  for (const f of flujos) {
    if (f.id === id || excepto.includes(f.id)) continue
    for (const n of f.nodes ?? []) if (JSON.stringify(n.parameters ?? {}).includes(id)) out.push({ flujo: f.id, nombre: f.name, nodo: n.name })
  }
  return out
}

/** la actualización de las filas de contenido: exactamente las 4, de clase contenido y activas hoy. Nunca el cimiento. */
export function planDeFilasDeContenido(filas) {
  if (!Array.isArray(filas)) throw new Error('las filas de la tabla de políticas no se leyeron')
  const cimiento = filas.filter((f) => TIPOS_DEL_CIMIENTO.includes(f.artifact_type))
  if (cimiento.length !== 3) throw new Error(`se esperaban las 3 filas del cimiento (solo para comprobar que NO se tocan) y hay ${cimiento.length}`)
  const contenido = filas.filter((f) => TIPOS_DE_CONTENIDO.includes(f.artifact_type))
  if (contenido.length !== 4) throw new Error(`se esperaban las 4 filas de contenido y hay ${contenido.length}`)
  for (const f of contenido) if (f.artifact_class !== 'contenido') throw new Error(`la fila ${f.artifact_type} no es de clase contenido (${f.artifact_class}): no se toca`)
  const activas = contenido.filter((f) => f.is_active === true)
  return {
    tipos: activas.map((f) => f.artifact_type).sort(),
    ya_apagadas: contenido.filter((f) => f.is_active !== true).map((f) => f.artifact_type).sort(),
    filtro: `artifact_type=in.(${TIPOS_DE_CONTENIDO.join(',')})&artifact_class=eq.contenido`,
    cuerpo: { is_active: false },
    cimiento: cimiento.map((f) => f.artifact_type).sort(),
  }
}

/** el cierre de las aprobaciones del editor viejo: SOLO `editor_escalation` y SOLO las que siguen abiertas; se marcan, no se borran */
export function planDePendientes(filas, { ahora, quien = 'editor apagado, cubierto por jefatura' }) {
  if (!Array.isArray(filas)) throw new Error('las filas de hitl_pending_approvals no se leyeron')
  const ajenas = filas.filter((f) => f.approval_type !== 'editor_escalation')
  const suyas = filas.filter((f) => f.approval_type === 'editor_escalation')
  const abiertas = suyas.filter((f) => ESTADOS_PENDIENTES.includes(f.status))
  return {
    total_editor_escalation: suyas.length,
    por_cerrar: abiertas.map((f) => f.item_id ?? f.id),
    ya_cerradas: suyas.length - abiertas.length,
    ajenas_que_no_se_tocan: ajenas.length,
    filtro: `approval_type=eq.editor_escalation&status=in.(${ESTADOS_PENDIENTES.join(',')})`,
    cuerpo: { status: 'expired', resolved_at: ahora, resolver: quien },
  }
}

/** ¿el texto de una dirección o ruta cae dentro de la bóveda de secretos? (los respaldos con texto de piezas van FUERA de ella) */
export const dentroDeLaBoveda = (ruta) => /zr-vault/i.test(String(ruta).replace(/\\/g, '/'))

/** el guion de J8b, en orden, con su reversa (para imprimirlo sin hacerlo) */
export function pasosDeJ8b() {
  return [
    { paso: 'respaldo', que: 'respaldar el flujo `bTbWL9lUvQCfStAz` y el voto `hi5nwPCGUWHkGnT7` (n8n-flujo.mjs respaldar), las 4+3 filas de la tabla de políticas y las filas `editor_escalation` (con huella sha256, FUERA de la bóveda)', reversa: 'los archivos de respaldo' },
    { paso: 'foto', que: 'foto de las 3 filas del cimiento y de `grade-cimiento` (jefatura-j1-antes-despues.mjs --guardar)', reversa: '—' },
    { paso: 'precondiciones', que: 'n8n con 0 corriendo y 0 esperando · `diferencia` del flujo vivo contra su respaldo (si otro CC lo cambió debajo, se detiene) · el voto sin referencias', reversa: '—' },
    { paso: 'cabecera', que: 'poner `x-skip-editor-middleware: 1` en «② Agente (run-sdk)» de la oficina (PUT del flujo; no cambia si está activo)', reversa: 'n8n-flujo.mjs restaurar bTbWL9lUvQCfStAz <respaldo> --ejecutar' },
    { paso: 'voto', que: 'desactivar `hi5nwPCGUWHkGnT7` (no se borra)', reversa: 'activar de nuevo con el respaldo (restaurar + activate)' },
    { paso: 'contenido', que: '`is_active = false` en `ad_creative`, `copy`, `email`, `landing`', reversa: '`is_active = true` en esas 4 con el respaldo' },
    { paso: 'pendientes', que: 'marcar `expired` las `editor_escalation` abiertas (no se borran)', reversa: 'volver `status` al valor del respaldo' },
    { paso: 'comprobar', que: 'las 3 filas del cimiento y `grade-cimiento` IDÉNTICOS a la foto; la oficina sigue inactiva; ninguna otra fila de la tabla de aprobaciones cambió', reversa: '—' },
  ]
}
