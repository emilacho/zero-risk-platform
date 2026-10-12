// PLANEACIÓN · el plan sin huecos ni fugas · CC#1 · 2026-10-12 · ronda 78 (parte del flujo VIVO; si el texto de un nodo cambió debajo, el constructor se detiene)
//   «Redactor (B4)»        → módulo r78 (presupuesto con cifra y rango de mercado con fuente, sin reparto fijo, bloque «lo que sabe el negocio») + lo del dueño en el pedido
//   «¿Llegó la vuelta?»    → módulo r78 (P4 marca celdas «A calcular»; P7 marca la fuga del dueño) · el plan del cliente = SOLO el texto del redactor; lo interno va al registro interno
//   «Guardar el plan»      → guarda el registro interno en `provenance_tag.registro_interno`
//   NUEVOS: «Lo que dijo el dueño» (HTTP a la función compartida) y «Unir lo del dueño al paquete» (si la lectura falla, la corrida SE DETIENE: un fallo no se lee como «no dijo nada»)
// El detector de voseo ya no marca «escríbenos», «llámanos», «cuéntanos» (tuteo esdrújulo con clítico).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => readFileSync(join(aqui, f), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '')
export const MODULO_R73 = leer('plan-primer-nivel.js')
export const MODULO_R78 = leer('plan-primer-nivel-r78.js')
export const NODOS = { b4: 'Redactor (B4)', vuelta: '¿Llegó la vuelta?', guardar: 'Guardar el plan', guarda2: '② GUARDA · sin referencia del producto se DETIENE', dueno: 'Lo que dijo el dueño', unir: 'Unir lo del dueño al paquete' }

const unaVez = (s, a, b, quien) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(quien + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 80))
  return s.replace(a, () => b)
}
const conLF = (f) => (c) => { const crlf = c.includes('\r\n'); const r = f(c.split('\r\n').join('\n')); return crlf ? r.split('\n').join('\r\n') : r }

export const cambiarB4 = conLF((s) => {
  const q = NODOS.b4
  if (s.includes('function bloqueDelDueno')) throw new Error(q + ' ya trae el bloque del dueño')
  s = unaVez(s, MODULO_R73, MODULO_R78, q)
  s = unaVez(s, '...bloquePrimerNivel(ctxPN),', '...bloquePrimerNivel(ctxPN),\n...bloqueDelDueno(ent.hechos_del_dueno),', q)
  s = unaVez(s, '    registro_usado: registroDelCliente,', '    registro_usado: registroDelCliente,\n    hechos_del_dueno_usados: Array.isArray(ent.hechos_del_dueno) ? ent.hechos_del_dueno.length : 0,', q)
  return s
})

export const cambiarVuelta = conLF((s) => {
  const q = NODOS.vuelta
  if (s.includes('registro_interno')) throw new Error(q + ' ya separa el registro interno')
  s = unaVez(s, MODULO_R73, MODULO_R78, q)
  // lo que llega al cliente: SOLO el texto del redactor (sin la revisión del registro, sin el aviso del chequeo, sin el bloque de lo no buscado del sistema)
  s = unaVez(s, "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + bloqueRevision + bloqueChequeo + '\\n\\n' + bloqueDescartados + '\\n' : textoDelRedactor;",
    "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + '\\n' : textoDelRedactor;\n" +
    '// r78 · lo interno NO va al plan del cliente: va al registro interno (se guarda con el plan y queda en la salida del nodo)\n' +
    'const registroInterno = llego ? { revision_del_registro: bloqueRevision || null, aviso_del_chequeo: bloqueChequeo || null, no_se_busco_del_sistema: bloqueDescartados || null } : null;', q)
  s = unaVez(s, '  chequeo_del_plan: chequeoDelPlan,', '  chequeo_del_plan: chequeoDelPlan,\n  registro_interno: registroInterno,', q)
  // el detector de voseo: «escríbenos», «llámanos», «cuéntanos» son tuteo (esdrújula con clítico), no voseo
  s = unaVez(s, 'else if (k.length >= 9 && _CLITICOS_DE_VOS.test(k)) marca = !_EXC_CLITICO[k]', 'else if (k.length >= 9 && _CLITICOS_DE_VOS.test(k)) marca = !_EXC_CLITICO[k] && !_ESDRUJULA_DE_TUTEO.test(k)', q)
  s = unaVez(s, 'var _EXC_CLITICO = ', '// r78 · tuteo esdrújulo con clítico (escríbenos, llámanos): la sílaba acentuada va ANTES de la consonante + vocal + clítico; el voseo («miráme», «decímelo») no\nvar _ESDRUJULA_DE_TUTEO = /[áéíóú][^aeiouáéíóú]{1,3}[ae](nos|les|los|las|se)$/\nvar _EXC_CLITICO = ', q)
  return s
})

export const cambiarGuardar = (body) => unaVez(body, 'caracteres: $json.caracteres }', 'caracteres: $json.caracteres, registro_interno: $json.registro_interno || null }', NODOS.guardar)

const CODIGO_UNIR = `// r78 · lo que dijo el dueño, entregado por la función compartida (no por casualidad del cerebro). Si la lectura FALLA, la corrida SE DETIENE: un fallo no se lee como «no dijo nada».
const base = $('${NODOS.guarda2}').first().json;
const d = $input.first().json || {};
if (d.ok !== true) {
  throw new Error('PLANEACION_SIN_LECTURA_DE_LO_DEL_DUENO · no se pudo leer lo que el dueño declaró (' + [d.error, d.detail].filter(Boolean).join(' · ') + ') · la corrida SE DETIENE antes de invocar y NO se gasta');
}
return [{ json: Object.assign({}, base, { hechos_del_dueno: Array.isArray(d.hechos) ? d.hechos : [] }), pairedItem: { item: 0 } }];
`

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.filter((y) => y.name === n); if (x.length !== 1) throw new Error(x.length + ' nodos «' + n + '»'); return x[0] }
  if (copia.nodes.some((n) => n.name === NODOS.dueno)) throw new Error('el flujo ya trae el nodo de lo del dueño')
  nodo(NODOS.b4).parameters.jsCode = cambiarB4(nodo(NODOS.b4).parameters.jsCode)
  nodo(NODOS.vuelta).parameters.jsCode = cambiarVuelta(nodo(NODOS.vuelta).parameters.jsCode)
  nodo(NODOS.guardar).parameters.jsonBody = cambiarGuardar(nodo(NODOS.guardar).parameters.jsonBody)
  const g = nodo(NODOS.guarda2)
  const [x, y] = g.position
  copia.nodes.push(
    { id: 'plan-r78-dueno', name: NODOS.dueno, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 160, y + 120],
      notes: 'ronda 78 · lo que el dueño corrigió o declaró, por la función compartida `datosDelDueno` · solo lectura, US$ 0',
      parameters: { method: 'POST', url: "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') }}/api/cliente/datos-del-dueno", sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ client_id: ($('Webhook · planeacion').first().json.body || {}).client_id }) }}",
        options: { response: { response: { neverError: true } }, timeout: 30000 } } },
    { id: 'plan-r78-unir', name: NODOS.unir, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 320, y + 120], parameters: { jsCode: CODIGO_UNIR } },
  )
  copia.connections[NODOS.guarda2] = { main: [[{ node: NODOS.dueno, type: 'main', index: 0 }]] }
  copia.connections[NODOS.dueno] = { main: [[{ node: NODOS.unir, type: 'main', index: 0 }]] }
  copia.connections[NODOS.unir] = { main: [[{ node: NODOS.b4, type: 'main', index: 0 }]] }
  return copia
}

if (process.argv[1] && process.argv[1].endsWith('construir-r78.mjs')) {
  const { writeFileSync } = await import('node:fs')
  const antes = JSON.parse(readFileSync(join(aqui, 'planeacion-ANTES-r78-2026-10-12.json'), 'utf8'))
  writeFileSync(join(aqui, 'planeacion-ARREGLADO-r78-2026-10-12.json'), JSON.stringify(construirFlujo(antes), null, 2))
  console.log('ok')
}
