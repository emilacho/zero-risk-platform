// CC#1 · 20-oct · LA RONDA 1 SE FIRMA «CON ALERTA» CUANDO EL TOPE O EL PLAZO CORTAN LA RONDA 2 (encargo de Lenovo 20:00, parte 4-bis · opción 1 · sin subir el tope de US$ 1,50).
//   node construir-firma-ronda1-2026-10-20.mjs   → parte del ARREGLADO de #665 (planeacion-ARREGLADO-fin-cierra-2026-10-20.json) y escribe planeacion-ARREGLADO-firma-ronda1-2026-10-20.json
// La plataforma ahora firma la ronda 1 (turno `firma` + artefacto `cierre`) al cerrar por tope o por plazo. La planeación tiene que LEERLA aunque el estado sea `cierre_por_tope`:
// cambia UN nodo, «FIN · cerrar la oficina», en tres puntos: (A) «vencido» ya no corta antes de leer; (B) si la lectura del cierre falla y venció, sigue siendo «vencido» (no «sin_bloque»);
// (C) «cierre_por_tope» solo es «vencido» si NO hay una firma con tablero; con tablero se sigue por el camino de siempre (firmado ⇒ números firmados; sin firmar ⇒ `sin_firma` con sus números).
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODO = 'FIN · cerrar la oficina'
const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
export function cambiarCerrar(codigo) {
  if (codigo.includes('idDeLaFirma')) throw new Error('«FIN · cerrar la oficina» ya lee la firma de la ronda 1 · no construir dos veces')
  let s = unaVez(codigo, "if (dec.finanzas_motivo) return [{ json: { finanzas_id: null, finanzas_motivo: dec.finanzas_motivo } }]",
    "// «vencido» ya no corta aquí: la plataforma pudo firmar la ronda 1 al cerrar por plazo, y se lee abajo\nif (dec.finanzas_motivo && dec.finanzas_motivo !== 'vencido') return [{ json: { finanzas_id: null, finanzas_motivo: dec.finanzas_motivo } }]", 'A')
  s = unaVez(s, "if (!leido || Number(leido.statusCode) !== 200) return [{ json: { finanzas_id: null, finanzas_motivo: 'sin_bloque' } }]",
    "if (!leido || Number(leido.statusCode) !== 200) return [{ json: { finanzas_id: null, finanzas_motivo: dec.finanzas_motivo === 'vencido' ? 'vencido' : 'sin_bloque' } }]", 'B')
  s = unaVez(s, "if (estado === 'cierre_por_tope') return [{ json: { finanzas_id: null, finanzas_motivo: 'vencido' } }]",
    "// tope o plazo cortaron la ronda 2: si la plataforma firmó la ronda 1 (hay tablero), se lee esa firma; si no, «vencido» como siempre\nconst idDeLaFirma = salida && typeof salida.finanzas_id === 'string' && salida.finanzas_id ? salida.finanzas_id : null\nif ((estado === 'cierre_por_tope' || dec.finanzas_motivo === 'vencido') && !idDeLaFirma) return [{ json: { finanzas_id: null, finanzas_motivo: 'vencido' } }]", 'C')
  return s
}
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('falta el nodo ' + NODO)
  n.parameters.jsCode = cambiarCerrar(n.parameters.jsCode)
  return copia
}
const aqui = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'planeacion-ARREGLADO-fin-cierra-2026-10-20.json'), 'utf8'))
  fs.writeFileSync(join(aqui, 'planeacion-ARREGLADO-firma-ronda1-2026-10-20.json'), JSON.stringify(construirFlujo(w), null, 2))
  console.log('escrito')
}
