// PLANEACIÓN · cierre del capítulo · CC#1 · 2026-10-12 · ronda 80 (parte del flujo VIVO con r78 aplicado; si el texto de un nodo cambió debajo, el constructor se detiene)
//   «Redactor (B4)»        → módulo r80 (el chequeo no se esquiva: TBD, por determinar, pendiente, n/d, guiones, celda vacía; nombres de personas) + las personas de la ficha en el contexto del chequeo
//   «¿Llegó la vuelta?»    → módulo r80 + estado_del_plan ('con_pendientes' | 'sin_marcas') y la línea de pendientes
//   «Guardar el plan»      → guarda estado_del_plan y pendientes en `provenance_tag` (el estado de la fila sigue 'draft': la base solo admite ese valor para esta clase)
//   «Plan → Drive (PDF)»   → el nombre del documento lleva «CON PENDIENTES · » si el chequeo marcó
//   NUEVOS (rama aparte, DESPUÉS del PDF y de la vuelta a la sala): «Aviso · plan con pendientes» → «Bandeja · plan con pendientes» → «Bandeja · comprobar» (si la bandeja no recibió el aviso, la corrida sale en ERROR a la vista: no se calla)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => readFileSync(join(aqui, f), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '')
export const MODULO_R78 = leer('plan-primer-nivel-r78.js')
export const MODULO_R80 = leer('plan-primer-nivel-r80.js')
export const NODOS = { b4: 'Redactor (B4)', vuelta: '¿Llegó la vuelta?', guardar: 'Guardar el plan', drive: 'Plan → Drive (PDF)', aviso: 'Aviso · plan con pendientes', bandeja: 'Bandeja · plan con pendientes', comprobar: 'Bandeja · comprobar' }

const unaVez = (s, a, b, quien) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(quien + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 80))
  return s.replace(a, () => b)
}
const conLF = (f) => (c) => { const crlf = c.includes('\r\n'); const r = f(c.split('\r\n').join('\n')); return crlf ? r.split('\n').join('\r\n') : r }

export const cambiarB4 = conLF((s) => {
  const q = NODOS.b4
  if (s.includes('function personasDeLaFicha')) throw new Error(q + ' ya trae el módulo r80')
  s = unaVez(s, MODULO_R78, MODULO_R80, q)
  s = unaVez(s, '    contexto_chequeo: ctxPN,', "    contexto_chequeo: Object.assign({}, ctxPN, { personas: personasDeLaFicha(ficha), nombre_cliente: ficha.name || null }),", q)
  return s
})

export const cambiarVuelta = conLF((s) => {
  const q = NODOS.vuelta
  if (s.includes('estado_del_plan')) throw new Error(q + ' ya trae el estado del plan')
  s = unaVez(s, MODULO_R78, MODULO_R80, q)
  s = unaVez(s, 'const bloqueChequeo = chequeoDelPlan ? bloqueDeRevisionDelPlan(chequeoDelPlan) : \'\';',
    'const bloqueChequeo = chequeoDelPlan ? bloqueDeRevisionDelPlan(chequeoDelPlan) : \'\';\n' +
    '// r80 · si el chequeo marca, el plan queda «con pendientes» (no listo, no para el cliente) y alguien se entera: la línea de pendientes va a la bandeja\n' +
    'const pendientes = chequeoDelPlan ? pendientesDelPlan(chequeoDelPlan) : null;\n' +
    "const estadoDelPlan = !llego ? null : (pendientes ? 'con_pendientes' : 'sin_marcas');", q)
  s = unaVez(s, '  registro_interno: registroInterno,', '  registro_interno: registroInterno,\n  estado_del_plan: estadoDelPlan,\n  con_pendientes: estadoDelPlan === \'con_pendientes\',\n  pendientes: pendientes,', q)
  return s
})

export const cambiarGuardar = (body) => unaVez(body, 'registro_interno: $json.registro_interno || null }', 'registro_interno: $json.registro_interno || null, estado_del_plan: $json.estado_del_plan || null, pendientes: $json.pendientes || null }', NODOS.guardar)

export const cambiarDrive = (body) => unaVez(body, "nombre: 'Plan de 90 dias · '", "nombre: ($('¿Llegó la vuelta?').first().json.con_pendientes ? 'CON PENDIENTES · ' : '') + 'Plan de 90 dias · '", NODOS.drive)

const CODIGO_AVISO = `// r80 · el plan con marcas NO queda «listo» en silencio: una línea para quien administra la agencia, en la bandeja (qué falta). Sin marcas: no sale ningún elemento y la rama termina aquí.
const v = $('${NODOS.vuelta.replace(/'/g, "\\'")}').first().json;
if (!v.con_pendientes) return [];
let planId = null;
try { const g = $('${NODOS.guardar}').first().json; const gb = (g && g.body) ? g.body : g; const fila = Array.isArray(gb) ? gb[0] : gb; planId = (fila && fila.id) || null; } catch (x) { planId = null; }
const quien = String(v.client_name || 'el cliente');
const linea = ('Plan de 90 días de ' + quien + ' con pendientes: ' + String(v.pendientes || 'el chequeo marcó el plan')).slice(0, 480);
const cuerpo = {
  type: 'plan_con_pendientes',
  title: linea,
  client_id: v.client_id || null,
  priority: 'high',
  agent_name: 'planeacion',
  risk_type: 'strategic_decision',
  output_preview: linea,
  payload: { plan_id: planId, estado_del_plan: v.estado_del_plan, marcas: (v.chequeo_del_plan && v.chequeo_del_plan.marcas) || [], para_el_cliente: false },
};
if (planId && v.client_id) cuerpo.output_id = planId;
return [{ json: { cuerpo } }];
`

const CODIGO_COMPROBAR = `// r80 · si la bandeja NO recibió el aviso, la corrida sale en ERROR a la vista (el plan ya está guardado y entregado a la sala: esto va al final a propósito)
const r = $input.first().json || {};
const hay = r.id || (r.item && r.item.id) || (r.ok === true) || (r.data && r.data.id);
if (!hay) throw new Error('PLAN_CON_PENDIENTES_SIN_AVISO · la bandeja no recibió el aviso (' + JSON.stringify(r).slice(0, 300) + ') · el plan está guardado como «con pendientes»: avisar a mano');
return [{ json: { aviso_en_bandeja: true, respuesta: r } }];
`

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.filter((y) => y.name === n); if (x.length !== 1) throw new Error(x.length + ' nodos «' + n + '»'); return x[0] }
  if (copia.nodes.some((n) => n.name === NODOS.aviso)) throw new Error('el flujo ya trae el aviso de plan con pendientes')
  nodo(NODOS.b4).parameters.jsCode = cambiarB4(nodo(NODOS.b4).parameters.jsCode)
  nodo(NODOS.vuelta).parameters.jsCode = cambiarVuelta(nodo(NODOS.vuelta).parameters.jsCode)
  nodo(NODOS.guardar).parameters.jsonBody = cambiarGuardar(nodo(NODOS.guardar).parameters.jsonBody)
  nodo(NODOS.drive).parameters.jsonBody = cambiarDrive(nodo(NODOS.drive).parameters.jsonBody)
  const g = nodo(NODOS.guardar)
  const [x, y] = g.position
  copia.nodes.push(
    { id: 'plan-r80-aviso', name: NODOS.aviso, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 160, y + 240], parameters: { jsCode: CODIGO_AVISO } },
    { id: 'plan-r80-bandeja', name: NODOS.bandeja, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 320, y + 240],
      notes: 'ronda 80 · una línea para quien administra la agencia, en la bandeja de revisión humana · el plan queda «con pendientes», no para el cliente · US$ 0',
      parameters: { method: 'POST', url: "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') }}/api/hitl/queue", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
        options: { response: { response: { neverError: true } }, timeout: 30000 } } },
    { id: 'plan-r80-comprobar', name: NODOS.comprobar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 480, y + 240], parameters: { jsCode: CODIGO_COMPROBAR } },
  )
  // la rama del aviso va SEGUNDA: el PDF y la vuelta a la sala corren primero; si el aviso falla, el error llega al final y no corta lo demás
  const sal = copia.connections[NODOS.guardar]
  if (!sal || !sal.main || !sal.main[0] || sal.main[0].length !== 1 || sal.main[0][0].node !== NODOS.drive) throw new Error('«Guardar el plan» no sale solo hacia el PDF: el flujo cambió debajo')
  sal.main[0].push({ node: NODOS.aviso, type: 'main', index: 0 })
  copia.connections[NODOS.aviso] = { main: [[{ node: NODOS.bandeja, type: 'main', index: 0 }]] }
  copia.connections[NODOS.bandeja] = { main: [[{ node: NODOS.comprobar, type: 'main', index: 0 }]] }
  return copia
}

if (process.argv[1] && process.argv[1].endsWith('construir-r80.mjs')) {
  const { writeFileSync } = await import('node:fs')
  const antes = JSON.parse(readFileSync(join(aqui, process.argv[2] || 'planeacion-ANTES-r80-2026-10-12.json'), 'utf8'))
  writeFileSync(join(aqui, 'planeacion-ARREGLADO-r80-2026-10-12.json'), JSON.stringify(construirFlujo(antes), null, 2))
  console.log('ok')
}
