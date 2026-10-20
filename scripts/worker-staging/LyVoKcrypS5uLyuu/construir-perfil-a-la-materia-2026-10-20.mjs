// CC#1 · 20-oct · EL PERFIL DE LA RED LLEGA AL MANUAL ANTES DE ESCRIBIRLO (señal de Lenovo 15:30, punto 4).
//   node construir-perfil-a-la-materia-2026-10-20.mjs        → ANTES (respaldo del vivo) → ARREGLADO
// En la prueba real el perfil de Instagram se leyó a las 10:05, UN minuto DESPUÉS de escribirse el manual (10:04). Con la entrada del cliente (#659) el perfil se lee ANTES del descubridor
// (nodo «El perfil de la red, o el hueco»), pero solo viajaba en la tarea del descubridor. El manual lee `discovery_package.materia_cliente`, que arma «[JEFATURA] Transform discovery→package»:
// ahora, si el Instagram propio no llegó por el cable de la materia, entra el perfil ya leído. Cambia UN nodo; nodos nuevos y cables, ninguno.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
export const N_TRANSFORM = '[JEFATURA] Transform discovery→package'
const aqui = dirname(fileURLToPath(import.meta.url))
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
const unaVez = (s, viejo, nuevo, que) => { const n = s.split(viejo).length - 1; if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`); return s.replace(viejo, () => nuevo) }

export function cambiarTransform(codigo) {
  const crlf = codigo.includes(CR + LF)
  const s0 = codigo.split(CR + LF).join(LF)
  if (s0.includes('perfil_leido_antes_del_descubridor')) throw new Error('«Transform» ya trae el perfil en la materia · no construir dos veces')
  const s = unaVez(s0, `  } catch (e) { m.instagram_estado = 'no_disponible'; }
  return m;
})();`, `  } catch (e) { m.instagram_estado = 'no_disponible'; }
  // 🔴 EL PERFIL LLEGA AL MANUAL ANTES DE ESCRIBIRLO (20-oct): si el Instagram propio no vino por el cable de la materia pero el perfil YA se leyó antes del descubridor, ese es el texto propio del cliente.
  try {
    const _p = $('El perfil de la red, o el hueco').first().json || {};
    if (m.instagram_estado !== 'trajo' && _p.perfil_estado === 'trajo' && String(_p.perfil_texto || '').trim()) {
      const _d = String(_p.perfil_texto);
      m.instagram_propio = _d.length > 8000 ? _d.slice(0, 8000) + '\\n[recortado: se leyeron 8000 de ' + _d.length + ' caracteres]' : _d;
      m.instagram_estado = 'trajo';
      m.instagram_fuente = 'perfil_leido_antes_del_descubridor';
    }
  } catch (e) { /* el nodo no corrió (alta anterior a la entrada del cliente): no hay nada que sumar */ }
  return m;
})();`, 'cierre de la materia')
  return crlf ? s.split(LF).join(CR + LF) : s
}
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === N_TRANSFORM)
  if (!n) throw new Error('falta el nodo ' + N_TRANSFORM)
  n.parameters.jsCode = cambiarTransform(n.parameters.jsCode)
  return copia
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'LyVoKcrypS5uLyuu-ANTES-manual-con-lo-disponible-2026-10-20.json'), 'utf8'))
  const salida = join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-perfil-a-la-materia-2026-10-20.json')
  const nuevo = construirFlujo(w)
  fs.writeFileSync(salida, JSON.stringify(nuevo, null, 2))
  console.log('escrito', salida, '· nodos', nuevo.nodes.length)
}
