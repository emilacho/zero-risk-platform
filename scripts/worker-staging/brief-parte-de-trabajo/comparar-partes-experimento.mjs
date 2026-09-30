// COMPARA EL PARTE DEL EXPERIMENTO (razonamiento apagado) CON EL PARTE RESCATADO · CC#1 · 2026-10-01 · sólo lectura · US$ 0.
//   node comparar-partes-experimento.mjs <carpeta-del-experimento> <carpeta-del-rescatado>
// 1) repara el JSON del parte nuevo SOLO para poder leerlo (comillas dobles sin escapar dentro de un texto) · NO toca lo guardado
// 2) corre los MISMOS chequeos puros (`brief-chequeos.js`) contra el mismo manual y el mismo plan · 3) mide completitud, largo y forma de cada brief
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { chequear } = require(join(aqui, 'brief-chequeos.js'))
const [dirNuevo, dirViejo] = process.argv.slice(2)

// ── reparación mínima: una comilla dentro de un texto sólo CIERRA el texto si lo que sigue es estructura JSON ──
export function repararComillas(s) {
  let out = '', dentro = false, reparadas = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (!dentro) { out += ch; if (ch === '"') dentro = true; continue }
    if (ch === '\\') { out += ch + (s[i + 1] ?? ''); i++; continue }
    if (ch !== '"') { out += ch; continue }
    let j = i + 1
    while (j < s.length && /\s/.test(s[j])) j++
    const sig = s[j]
    let cierra = sig === ':' || sig === '}' || sig === ']' || sig === undefined
    if (sig === ',') {
      let k = j + 1
      while (k < s.length && /\s/.test(s[k])) k++
      cierra = s[k] === '"' || s[k] === '{' || s[k] === '[' || s[k] === '}' || s[k] === ']'
    }
    if (cierra) { out += ch; dentro = false } else { out += '\\"'; reparadas++ }
  }
  return { texto: out, reparadas }
}
const cuerpoJson = (t) => { const m = t.match(/```json\s*([\s\S]*?)```\s*$/); return m ? m[1] : t }

const ex = JSON.parse(fs.readFileSync(join(dirNuevo, fs.readdirSync(dirNuevo).find((f) => f.startsWith('ejecucion-'))), 'utf8'))
const nodo = (n) => ((ex.data.resultData.runData[n] || [])[0] || {}).data?.main?.[0]?.[0]?.json
const vuelta = nodo('③ ¿Llegó la vuelta?')
const manual = { forbidden_words: vuelta.forbidden_words || [], required_terminology: vuelta.required_terminology || [] }
const planTexto = vuelta.plan_texto

const respuestaNueva = fs.readFileSync(join(dirNuevo, 'respuesta-del-redactor.txt'), 'utf8')
const rep = repararComillas(cuerpoJson(respuestaNueva))
const nuevo = JSON.parse(rep.texto).parte
const viejo = JSON.parse(fs.readFileSync(join(dirViejo, 'parte.json'), 'utf8')).parte

const CAMPOS = ['id', 'plataforma', 'tipo_de_pieza', 'que_es', 'de_que_parte_del_plan', 'objetivo', 'segmento', 'protagonista', 'mensaje', 'hipotesis', 'limites', 'vocabulario_obligatorio', 'prohibido', 'sintaxis', 'visual', 'llamado_a_la_accion', 'variantes', 'negativos', 'aprueba_y_para_cuando', 'presupuesto']
const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
const medir = (parte) => {
  const e = parte.entregables || []
  const ch = chequear(parte, manual, planTexto)
  const chars = e.map((x) => JSON.stringify(x).length)
  return {
    entregables: e.length,
    pendientes_declarados: (parte.pendientes_declarados || []).length,
    huecos: (parte.huecos || []).length,
    contradicciones_plan_vs_manual: (parte.contradicciones_plan_vs_manual || []).length,
    campos_vacios_en_total: e.reduce((a, x) => a + CAMPOS.filter((c) => vacio(x[c])).length, 0),
    entregables_con_todos_los_campos: e.filter((x) => CAMPOS.every((c) => !vacio(x[c]))).length,
    caracteres_por_entregable_prom: Math.round(chars.reduce((a, b) => a + b, 0) / Math.max(1, chars.length)),
    caracteres_total: JSON.stringify(parte).length,
    variantes_prom: +(e.reduce((a, x) => a + (Array.isArray(x.variantes) ? x.variantes.length : 0), 0) / Math.max(1, e.length)).toFixed(2),
    negativos_prom: +(e.reduce((a, x) => a + (Array.isArray(x.negativos) ? x.negativos.length : 0), 0) / Math.max(1, e.length)).toFixed(2),
    plataformas: Object.fromEntries(Object.entries(e.reduce((a, x) => { a[x.plataforma] = (a[x.plataforma] || 0) + 1; return a }, {})).sort()),
    tipos: Object.fromEntries(Object.entries(e.reduce((a, x) => { a[x.tipo_de_pieza] = (a[x.tipo_de_pieza] || 0) + 1; return a }, {})).sort()),
    chequeos_ok: ch.ok,
    hallazgos_por_chequeo: ch.por_chequeo,
    hallazgos: ch.hallazgos.map((h) => `${h.entregable} · ${h.chequeo} · ${String(h.detalle).slice(0, 140)}`),
  }
}
const informe = { reparacion_json: { comillas_escapadas: rep.reparadas, nota: 'sólo para poder leer el parte; lo guardado NO se tocó' }, nuevo: medir(nuevo), rescatado: medir(viejo) }
fs.writeFileSync(join(dirNuevo, 'comparacion-con-el-rescatado.json'), JSON.stringify(informe, null, 1))
fs.writeFileSync(join(dirNuevo, 'parte-reparado-para-lectura.json'), JSON.stringify({ parte: nuevo }, null, 1))
console.log(JSON.stringify(informe, null, 1))
