/**
 * 02-nov · A3 · EL RELOJ DEL CICLO DE VIDA DE LOS INCIDENTES · flujo NUEVO, nace INACTIVO. Encargo: SENAL-LENOVO-publicar-pedir-cambios-al-manual-y-A3 (punto 2); contrato: LISTO-CC1-para-certificar-ciclo-de-incidentes (#809).
 * Cada hora llama a `POST /api/incidentes/ciclo-de-vida` con `{"ejecutar": true}` y la llave interna. La regla vive en el código de la plataforma; este flujo solo la dispara.
 * No llama a ningún agente, no gasta, no avisa a Slack (regla «menos ruido»). Si la respuesta no es la esperada FALLA A LA VISTA (la ejecución queda en error en n8n).
 *   node scripts/ops/oficina-marketing/construir-reloj-ciclo-de-vida.mjs   → escribe nuevo/reloj-ciclo-de-vida.json (NO toca n8n)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AQUI, codigo, conectar, http } from './lib.mjs'

export const NOMBRE = 'Zero Risk — Reloj del ciclo de vida de incidentes (cada hora · A3 · CC#2)'
export const RELOJ = 'Reloj · cada hora'
export const LLAMAR = '① Aplicar el ciclo de vida'
export const COMPROBAR = '② Comprobar la respuesta (falla a la vista)'
const URL_CICLO = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/incidentes/ciclo-de-vida' }}"

export const CODIGO_COMPROBAR = `// A3 · el reloj NO decide nada: solo exige que la plataforma haya contestado bien. Cualquier otra cosa deja la ejecución en ERROR (visible en n8n).
const r = $input.first().json || {};
const estado = Number(r.statusCode);
const cuerpo = (r.body && typeof r.body === 'object') ? r.body : {};
if (estado !== 200) throw new Error('CICLO_DE_VIDA_NO_200 · la plataforma contestó ' + (Number.isFinite(estado) ? estado : 'nada') + ' · ' + JSON.stringify(cuerpo).slice(0, 200));
if (cuerpo.ok !== true) throw new Error('CICLO_DE_VIDA_SIN_OK · ' + JSON.stringify(cuerpo).slice(0, 200));
if (cuerpo.ejecutado !== true) throw new Error('CICLO_DE_VIDA_NO_EJECUTO · la respuesta fue solo informativa (¿llegó el cuerpo {"ejecutar": true}?)');
if (cuerpo.completo === false) throw new Error('CICLO_DE_VIDA_INCOMPLETO · alguna fuente no se pudo leer; lo ya cerrado queda cerrado · ' + JSON.stringify(cuerpo.fuentes || {}).slice(0, 200));
return [{ json: { ok: true, ejecutado: true, total_cerrado: Number(cuerpo.total) || 0, generado_en: cuerpo.generado_en || null } }];`

export function construirRelojCicloDeVida() {
  const f = { id: 'PENDIENTE-RELOJ-CICLO-DE-VIDA', name: NOMBRE, nodes: [], connections: {}, settings: { executionOrder: 'v1' } }
  f.nodes.push({ name: RELOJ, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '7 * * * *' }] } } })
  const llamar = http(LLAMAR, URL_CICLO, [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }], '={{ JSON.stringify({ ejecutar: true }) }}', 60000)
  f.nodes.push({ ...llamar, position: [260, 0] })
  f.nodes.push({ ...codigo(COMPROBAR, CODIGO_COMPROBAR), position: [520, 0] })
  conectar(f, RELOJ, LLAMAR)
  conectar(f, LLAMAR, COMPROBAR)
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-reloj-ciclo-de-vida.mjs')) {
  const f = construirRelojCicloDeVida()
  const dir = path.join(AQUI, 'nuevo')
  fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, 'reloj-ciclo-de-vida.json')
  fs.writeFileSync(archivo, JSON.stringify(f, null, 2) + '\n')
  console.log('escrito', path.relative(process.cwd(), archivo), '· nodos', f.nodes.length)
}
