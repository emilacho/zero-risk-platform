// PLANEACIÓN · ronda 74 · CC#2 · 2026-10-12 · dos nodos y NADA más (conexiones y ajustes idénticos), partiendo del flujo VIVO:
//   «La referencia del producto» → reescrita AGNÓSTICA (sin la regla fija del 60 %, sin firmas ni reglas internas, sin el ejemplo de otro caso, sin rubros)
//   «¿Llegó la vuelta?»           → el bloque «Lo que NO se buscó y por qué» deja de llevar nombres internos ante el cliente (lenguaje llano); el detalle va al registro interno (salida del nodo)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODOS = { referencia: 'La referencia del producto', vuelta: '¿Llegó la vuelta?' }
export const TEXTO_DE_REFERENCIA = readFileSync(join(aqui, 'referencia-del-producto.md'), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '') + '\n'

export const codigoDeLaReferencia = () => [
  '// [PLANEACIÓN] La referencia del producto · v4 AGNÓSTICA · ronda 74 (2026-10-12)',
  '// El documento que el redactor lee para saber qué es un plan de 90 días. Viaja entero en el pedido. No nombra clientes, lugares, rubros, firmas ni reglas internas.',
  '// Fuente en el repositorio: scripts/worker-staging/X9F0zp6LQ2xGEYVS/referencia-del-producto.md',
  'const TEXTO = ' + JSON.stringify(TEXTO_DE_REFERENCIA) + ';',
  '',
  'return [{ json: {',
  '  texto: TEXTO,',
  '  caracteres: TEXTO.length,',
  "  de_donde: 'referencia-del-producto.md · v4 agnóstica (ronda 74)',",
  '} }];',
  '',
].join('\n')

const VIEJA = "return t + '\\n' + descartados.map((d) => '- ' + String((d && d.objetivo) || '(sin nombre)') + ' — ' + String((d && d.motivo) || '(sin motivo declarado)')).join('\\n');"
const NUEVA = [
  "// r74 · ante el cliente, lenguaje llano: ningún nombre interno (guiones bajos) en el plan; el detalle original queda en la salida del nodo (`no_se_busco_interno`)",
  "const llano = (v, vacio) => { const s = String(v == null ? '' : v).trim(); return s ? s.replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, (m) => m.split('_').join(' ')) : vacio; };",
  "return t + '\\n' + descartados.map((d) => '- ' + llano(d && d.objetivo, '(sin nombre)') + ' — ' + llano(d && d.motivo, '(sin motivo declarado)')).join('\\n');",
].join('\n')
const SALIDA_VIEJA = '  descartados_declarados: llego && Array.isArray(descartados) ? descartados.length : null,'
const SALIDA_NUEVA = SALIDA_VIEJA + '\n  no_se_busco_interno: llego && Array.isArray(descartados) ? descartados : null,'

export const cambiarVuelta = (codigo) => {
  const crlf = codigo.includes('\r\n'); let s = codigo.split('\r\n').join('\n')
  if (s.includes('no_se_busco_interno')) throw new Error('«¿Llegó la vuelta?» ya tiene el cambio de la ronda 74')
  for (const [a, b] of [[VIEJA, NUEVA], [SALIDA_VIEJA, SALIDA_NUEVA]]) {
    const n = s.split(a).length - 1
    if (n !== 1) throw new Error(NODOS.vuelta + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 70))
    s = s.replace(a, () => b)
  }
  return crlf ? s.split('\n').join('\r\n') : s
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('no está el nodo ' + n); return x }
  const r = nodo(NODOS.referencia)
  if (r.parameters.jsCode.includes('v4 AGNÓSTICA')) throw new Error('la referencia ya es la v4')
  r.parameters.jsCode = codigoDeLaReferencia()
  nodo(NODOS.vuelta).parameters.jsCode = cambiarVuelta(nodo(NODOS.vuelta).parameters.jsCode)
  return copia
}
