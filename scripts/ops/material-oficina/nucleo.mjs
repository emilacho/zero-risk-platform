/**
 * EL FLUJO `oficina · turno` (bTbWL9lUvQCfStAz) Y EL TURNO DE MATERIAL · CC#2 · 2026-10-27 · SIN APLICAR.
 * Cuando la oficina le pide material al portero devuelve `esperar_material`; el nodo «③ ¿Y ahora?» tiene que terminar esa ejecución SIN error y sin despertar a nadie (el aviso del portero reanuda el encargo por
 * `POST /api/oficina/material-vuelta`). Sin esta rama el nodo lanza OFICINA_TURNO_RECHAZADO. ORDEN OBLIGATORIO: este cambio se PUBLICA (con respaldo y reversa, sin corridas vivas) ANTES de encender `material_activo`.
 * Pura: recibe el JSON del flujo y devuelve el nuevo (no toca nada vivo). Repetible: si el nodo ya la tiene, se niega.
 */
export const NODO_Y_AHORA = '③ ¿Y ahora?'
const LINEA_ESPERAR = "if (status === 200 && b.accion === 'esperar' && b.turno) return [{ json: { ruta: 'esperar', turno_body: { encargo_id: c.encargo_id, turno: b.turno } } }]"
const LINEA_JEFATURA = "if (status === 200 && b.accion === 'esperar_jefatura') return []"
export const LINEA_MATERIAL = "// 200 `esperar_material` → el encargo espera al portero: la ejecución termina SIN error y sin ítems (nada se despierta; el aviso del portero reanuda por /api/oficina/material-vuelta, o el vigía a los 20–30 min)\nif (status === 200 && b.accion === 'esperar_material') return []"

export function conEsperaDelMaterial(flujo) {
  const nodos = (flujo.nodes ?? []).filter((n) => n.name === NODO_Y_AHORA)
  if (nodos.length !== 1) throw new Error(`se esperaba UN nodo «${NODO_Y_AHORA}» y hay ${nodos.length}: el flujo cambió, se revisa`)
  const nuevo = JSON.parse(JSON.stringify(flujo))
  const n = nuevo.nodes.find((x) => x.name === NODO_Y_AHORA)
  const js = String(n.parameters.jsCode ?? '').split('\r\n').join('\n')
  if (js.includes('esperar_material')) throw new Error(`«${NODO_Y_AHORA}» ya conoce esperar_material`)
  // va justo después de la rama de la jefatura (si el nodo la tiene) o de la de «esperar»
  const ancla = js.includes(LINEA_JEFATURA) ? LINEA_JEFATURA : LINEA_ESPERAR
  if (js.split(ancla).length !== 2) throw new Error(`«${NODO_Y_AHORA}»: la línea ancla no aparece una sola vez: el nodo cambió, se revisa`)
  n.parameters.jsCode = js.replace(ancla, () => ancla + '\n' + LINEA_MATERIAL)
  return nuevo
}
