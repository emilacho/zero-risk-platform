// Encargo «alta sin idioma fijo» (CC#1 2026-10-11 · firma de Emilio: agnóstico; el registro de las piezas lo deciden el manual declarado o el país del cliente). Desde la raíz del repo:
//   node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-idioma-agnostico.mjs
// Parte del respaldo ANTES (el flujo vivo) y escribe el ARREGLADO · NO toca n8n (eso lo hace n8n-flujo.mjs restaurar --ejecutar).
// El Transform del alta escribía FIJO `idioma: "español de Ecuador · sin voseo (tú, no vos…)"` para TODO cliente. Ahora la línea de idioma sale del país (o del último tramo de la ubicación)
// de la ficha del trato, con la MISMA tabla país → trato que ya usa el detector de trato (`src/lib/trato/trato-logica.js` · POR_PAIS) más los códigos de dos letras. Sin país, o con un país
// que la tabla no conoce, queda VACÍO y lo DECLARA (`idioma_estado`): nunca se adivina. Si el manual declara otro registro, el manual manda (esa regla vive en el detector, no aquí).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const TRANSFORM = '[JEFATURA] Transform discovery→package'
const FIJO = 'const m = { idioma: "español de Ecuador · sin voseo (tú, no vos: «sabes», «pides», «pagas»)", sitio_estado: null,'
const lf = (s) => String(s ?? '').replace(/\r\n/g, '\n')

/** el bloque que el Transform pega ANTES de armar `materia_cliente` · puro: recibe el trato cerrado (`Validate Deal Data`) y devuelve la línea de idioma */
export const BLOQUE = `// r65 (CC#1 2026-10-11) · EL IDIOMA Y EL REGISTRO SALEN DEL PAÍS DEL CLIENTE · nada fijo. Misma tabla país → trato que el detector de trato (POR_PAIS) + los códigos de dos letras.
// Sin país (o con un país que la tabla no conoce) la línea queda VACÍA y se declara en \`idioma_estado\` · el manual declarado, si existe, manda sobre esto (lo resuelve el detector).
const _PAIS_TRATO = { argentina: 'vos', ar: 'vos', uruguay: 'vos', uy: 'vos', paraguay: 'vos', py: 'vos', ecuador: 'tu', ec: 'tu', mexico: 'tu', mx: 'tu', peru: 'tu', pe: 'tu', chile: 'tu', cl: 'tu', espana: 'tu', es: 'tu', bolivia: 'tu', bo: 'tu', venezuela: 'tu', ve: 'tu', panama: 'tu', pa: 'tu', 'costa rica': 'usted', cr: 'usted' }
const _idiomaDelCliente = (deal) => {
  const sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()
  const d = deal && typeof deal === 'object' ? deal : {}
  const pais = sinTildes(d.country) || sinTildes(String(d.location || '').split(/[·|,;\\/]/).pop())
  if (!pais) return { texto: '', estado: 'pendiente_sin_pais', pais: null }
  const registro = _PAIS_TRATO[pais]
  if (!registro) return { texto: '', estado: 'pais_sin_registro_conocido', pais: pais }
  const nombre = registro === 'tu' ? 'tuteo («tú»)' : registro === 'vos' ? 'voseo («vos»)' : 'trato de usted'
  return { texto: 'español · ' + nombre + ' · por el país del cliente (' + pais + ') · si el manual declara otro registro, manda el manual', estado: 'por_pais', pais: pais }
}
let _idioma_cliente = { texto: '', estado: 'pendiente_sin_pais', pais: null }
try { _idioma_cliente = _idiomaDelCliente($('Validate Deal Data').first().json) } catch (e) { _idioma_cliente = { texto: '', estado: 'pendiente_sin_pais', pais: null } }
`

export function construirCodigo(antes) {
  const c = lf(antes)
  if (c.includes('_idiomaDelCliente')) throw new Error('el Transform ya trae el idioma por país · no construir dos veces')
  if (c.split(FIJO).length !== 2) throw new Error('no encuentro el idioma fijo del Transform (una sola vez) · PARO')
  const ancla = 'const materia_cliente = (() => {'
  if (c.split(ancla).length !== 2) throw new Error('no encuentro el ancla de materia_cliente · PARO')
  return c
    .replace(ancla, BLOQUE + ancla)
    .replace(FIJO, 'const m = { idioma: _idioma_cliente.texto, idioma_estado: _idioma_cliente.estado, idioma_pais: _idioma_cliente.pais, sitio_estado: null,')
}

export function construirFlujo(antes) {
  const f = JSON.parse(JSON.stringify(antes))
  const n = f.nodes.find((x) => x.name === TRANSFORM)
  if (!n) throw new Error(`no encontré «${TRANSFORM}»`)
  n.parameters.jsCode = construirCodigo(n.parameters.jsCode)
  n.notes = ((n.notes || '') + '\nr65 · el idioma de materia_cliente sale del país del cliente (misma tabla que el detector de trato) · vacío y declarado si no se sabe.').trim()
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-idioma-agnostico.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'alta-ANTES-idioma-2026-10-11.json'), 'utf8'))
  writeFileSync(join(aqui, 'alta-ARREGLADO-idioma-2026-10-11.json'), JSON.stringify(construirFlujo(antes), null, 1) + '\n')
  console.log('construida · el Transform del alta saca el idioma del país del cliente')
}
