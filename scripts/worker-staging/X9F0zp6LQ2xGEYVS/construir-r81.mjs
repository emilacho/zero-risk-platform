// PLANEACIÓN · ronda 81 · CC#1 · 2026-10-13 · P7 del chequeo del plan, corregido en el ORIGEN (parte del flujo VIVO con r80 aplicado; si el texto de un nodo cambió debajo, el constructor se detiene)
//   «Redactor (B4)»     → módulo r81: el redactor NO recibe los nombres propios de personas (los de la ficha + los que sus propios insumos nombran junto a un rol, menos los que la ficha declara para mostrar)
//                         y recibe la regla «nombra a las personas por su función»; el chequeo (P7) vigila esos mismos nombres
//   «¿Llegó la vuelta?» → módulo r81 (el chequeo no cambia; el módulo es el mismo texto en los dos nodos)
// Agnóstico: ningún nombre ni lista de nombres; las personas salen de datos de cada cliente. P4 (presupuesto) NO se toca.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => readFileSync(join(aqui, f), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '')
export const MODULO_R80 = leer('plan-primer-nivel-r80.js')
export const MODULO_R81 = leer('plan-primer-nivel-r81.js')
export const NODOS = { b4: 'Redactor (B4)', vuelta: '¿Llegó la vuelta?' }

const unaVez = (s, a, b, quien) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(quien + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 80))
  return s.replace(a, () => b)
}
const conLF = (f) => (c) => { const crlf = c.includes('\r\n'); const r = f(c.split('\r\n').join('\n')); return crlf ? r.split('\n').join('\r\n') : r }

export const cambiarB4 = conLF((s) => {
  const q = NODOS.b4
  if (s.includes('function personasAProteger')) throw new Error(q + ' ya trae el módulo r81')
  s = unaVez(s, MODULO_R80, MODULO_R81, q)
  s = unaVez(s, 'moneda: monedaDelCliente(ficha, manual) };', 'moneda: monedaDelCliente(ficha, manual), nombres_visibles: nombresVisibles(ficha) };', q)
  s = unaVez(s, 'const casa = ent.casa || {};',
    '// r81 · las personas que NO deben llegar al plan: las de la ficha + las que los propios insumos nombran junto a un rol, menos las que la ficha declara para mostrar.\n' +
    '// El redactor recibe los insumos SIN esos nombres (cada uno pasa a «quien lleva el negocio»): no puede copiar lo que no ve. El chequeo (P7) vigila los mismos nombres.\n' +
    'const textoDeLosInsumos = [JSON.stringify(fichaSinInternos.ficha), JSON.stringify(manual), JSON.stringify(ent.material || []), JSON.stringify(ent.descartados || []), JSON.stringify(ent.hechos_del_dueno || [])].join(\'\\n\');\n' +
    'const PROTEGIDAS = personasAProteger(ficha, textoDeLosInsumos, ctxPN.nombres_visibles);\n' +
    'const limpio = (t) => sinPersonas(t, PROTEGIDAS, ficha.name);\n' +
    'const casa = ent.casa || {};', q)
  s = unaVez(s, 'JSON.stringify(fichaSinInternos.ficha, null, 1),', 'limpio(JSON.stringify(fichaSinInternos.ficha, null, 1)),', q)
  s = unaVez(s, "Object.keys(manual).length ? JSON.stringify(manual, null, 1) : '(no hay manual aprobado cargado)',", "Object.keys(manual).length ? limpio(JSON.stringify(manual, null, 1)) : '(no hay manual aprobado cargado)',", q)
  for (const b of ['bloqueTrajo', 'bloqueSinDato', 'bloqueSinResp', 'bloqueDesc']) s = unaVez(s, '\n' + b + ',\n', '\nlimpio(' + b + '),\n', q)
  s = unaVez(s, '...bloqueDelDueno(ent.hechos_del_dueno),', "...bloqueDelDueno((Array.isArray(ent.hechos_del_dueno) ? ent.hechos_del_dueno : []).map(function (h) { return typeof h === 'string' ? limpio(h) : h; })),", q)
  s = unaVez(s, "'F. Un dueno unico del resultado y un ritual corto de 15-20 minutos cada 10-14 dias.',", "'F. Un dueno unico del resultado (nombrado por su funcion, por ejemplo «el dueño del negocio», nunca por su nombre propio) y un ritual corto de 15-20 minutos cada 10-14 dias.',", q)
  s = unaVez(s, 'personas: personasDeLaFicha(ficha), nombre_cliente: ficha.name || null }', 'personas: PROTEGIDAS, nombre_cliente: ficha.name || null }', q)
  return s
})

export const cambiarVuelta = conLF((s) => {
  const q = NODOS.vuelta
  if (s.includes('function personasAProteger')) throw new Error(q + ' ya trae el módulo r81')
  return unaVez(s, MODULO_R80, MODULO_R81, q)
})

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.filter((y) => y.name === n); if (x.length !== 1) throw new Error(x.length + ' nodos «' + n + '»'); return x[0] }
  nodo(NODOS.b4).parameters.jsCode = cambiarB4(nodo(NODOS.b4).parameters.jsCode)
  nodo(NODOS.vuelta).parameters.jsCode = cambiarVuelta(nodo(NODOS.vuelta).parameters.jsCode)
  return copia
}

if (process.argv[1] && process.argv[1].endsWith('construir-r81.mjs')) {
  const { writeFileSync } = await import('node:fs')
  const antes = JSON.parse(readFileSync(join(aqui, process.argv[2] || 'planeacion-ANTES-r81-2026-10-13.json'), 'utf8'))
  writeFileSync(join(aqui, 'planeacion-ARREGLADO-r81-2026-10-13.json'), JSON.stringify(construirFlujo(antes), null, 2))
  console.log('ok')
}
