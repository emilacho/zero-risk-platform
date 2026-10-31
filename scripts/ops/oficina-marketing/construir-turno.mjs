/**
 * T5 · paso 3 · el flujo `oficina · turno` (`bTbWL9lUvQCfStAz`) para el nuevo orden.
 *   node scripts/ops/oficina-marketing/construir-turno.mjs        · escribe nuevo/bTbWL9lUvQCfStAz.json
 * Qué cambia (y SOLO esto):
 *   · «③ ¿Y ahora?»: (a) `esperar_jefatura` (el encargo espera a la jefatura) ya no es un rechazo: termina la ejecución como `esperar_material`, sin ítems (la jefatura reanuda por su ruta; hoy el vivo lo trataría como error);
 *     (b) cuando el encargo cierra y la CADENA devolvió `siguiente.sobre` (brief validado → abrir el concepto · gran idea aprobada → correr la tanda…), el sobre viaja en el ítem como `siguiente_sobre`.
 *   · Después del cable de vuelta entran 3 nodos «③ Sobre · …»: si hay sobre, se lo manda a la SALA (`/api/sala/intake`, igual que el vigía) para que la puerta vuelva a entrar (empuje inmediato; el vigía es el respaldo y comparte la clave de idempotencia).
 *     La sala contesta 200 siempre: `ok:false` DETIENE (con el código), `kind:'duplicate'` es éxito.
 * Sin `siguiente_sobre` (todo lo de hoy) los nodos nuevos no hacen nada.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, escribirNuevo, http, leerVivo, si } from './lib.mjs'

const ID = 'bTbWL9lUvQCfStAz'
const URL_SALA = '={{ $env.SALA_INTAKE_URL || "https://zero-risk-platform.vercel.app/api/sala/intake" }}'

export const CODIGO_SOBRE_LEIDO = `// ③ SOBRE · ¿ENTRÓ A LA SALA? · la sala contesta 200 SIEMPRE: el éxito o el rechazo viene en el cuerpo · duplicate = ya había entrado (el vigía o un reintento) = éxito
const s = $('③ ¿Y ahora?').last().json
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('OFICINA_SOBRE_NO_LLEGO · la llamada a la sala falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · el vigía reemitirá el sobre · se DETIENE')
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status === 200 && b.ok === true) return [{ json: { entro: true, kind: b.kind || null, clave: s.siguiente_sobre && s.siguiente_sobre.idempotency_key || null } }]
throw new Error('OFICINA_SOBRE_RECHAZADO · la sala contestó ' + status + ' · ' + String(b.code || b.error || 'sin código') + ' · ' + String(b.detail || b.detalle || 'sin detalle').slice(0, 200) + ' · el vigía reemitirá el sobre · se DETIENE')
`

export function construirTurno() {
  const f = leerVivo(ID)
  cambiarCodigo(f, '③ ¿Y ahora?',
    "if (status === 200 && b.accion === 'esperar_material') return []",
    "if (status === 200 && b.accion === 'esperar_material') return []\n// 200 `esperar_jefatura` → el encargo espera a la jefatura: igual que el material, la ejecución termina sin error y sin ítems (la jefatura reanuda por su ruta; el vigía de respaldo)\nif (status === 200 && b.accion === 'esperar_jefatura') return []")
  cambiarCodigo(f, '③ ¿Y ahora?',
    "return [{ json: { ruta: 'cable', payload_cable: {",
    "// T5 · si la cadena devolvió con qué sobre vuelve a entrar la puerta (brief validado · gran idea aprobada…), viaja en el ítem\n  const sig = b.entrega_a_la_cadena && b.entrega_a_la_cadena.siguiente && b.entrega_a_la_cadena.siguiente.sobre\n  return [{ json: { ruta: 'cable', siguiente_sobre: sig && typeof sig === 'object' ? sig : null, payload_cable: {")
  agregarNodo(f, si('③ Sobre · ¿hay siguiente?', "={{ !!$('③ ¿Y ahora?').last().json.siguiente_sobre }}"), '③ Cable de vuelta · sala', 260, 0)
  agregarNodo(f, http('③ Sobre · a la sala', URL_SALA, [{ name: 'x-api-key', value: '={{ $env.SALA_INGRESS_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }], "={{ JSON.stringify($('③ ¿Y ahora?').last().json.siguiente_sobre) }}", 20000), '③ Cable de vuelta · sala', 520, -80)
  agregarNodo(f, codigo('③ Sobre · ¿entró?', CODIGO_SOBRE_LEIDO), '③ Cable de vuelta · sala', 780, -80)
  conectar(f, '③ Cable de vuelta · sala', '③ Sobre · ¿hay siguiente?')
  conectar(f, '③ Sobre · ¿hay siguiente?', '③ Sobre · a la sala', 0)
  conectar(f, '③ Sobre · a la sala', '③ Sobre · ¿entró?')
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-turno.mjs')) console.log(escribirNuevo(construirTurno()))
