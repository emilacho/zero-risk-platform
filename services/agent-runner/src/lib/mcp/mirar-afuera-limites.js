// LÍMITES DE «MIRAR AFUERA» POR CORRIDA · CC#1 · 2026-10-01 · lógica PURA (la usa el servidor MCP y las pruebas).
//
// 🔴 POR QUÉ EXISTE (certificación CC#3 del flujo de la pieza · 01-oct): «máximo 4 pedidos» y «sin anuncios_en_meta/anuncios_en_google» eran TEXTO del pedido al agente. El esquema de la herramienta
// ofrecía los NUEVE `que_mirar` y el Servicio de Apify no tiene tope ni contador por agente: un agente que desobedeciera podía gastar sin freno (hasta US$ 0,98 por pedido de anuncios de Meta).
// Ahora un pedido PUEDE traer límites y el SISTEMA los hace cumplir, en DOS capas:
//   1. el ESQUEMA de la herramienta sólo ofrece las opciones permitidas (el modelo ni siquiera puede nombrar las otras)
//   2. el servidor CUENTA los pedidos de la corrida y rechaza el N+1 ANTES de llegar al Servicio (un rechazo no gasta nada)
//
// OPT-IN PURO: sin límites en el pedido, nada cambia (ni el esquema, ni el conteo, ni las claves del entorno). Sólo afecta a quien los pida.
// El contador vive en el proceso del servidor MCP, que el SDK arranca por cada `query()`: es POR CORRIDA (un reintento transitorio del SDK arranca otro proceso y reinicia el conteo:
// peor caso declarado = el cupo × los intentos del SDK, 3 como tope, sólo en fallos transitorios de capacidad).

const { CATALOGO } = require('./apify-catalogo.js')

/** un cupo mayor que esto es un error de tipeo, no una autorización (hay 9 opciones y el agente no necesita más de unas pocas) */
const LIMITE_MAXIMO_DE_PEDIDOS = 20

const primero = (candidatos) => candidatos.find((c) => c !== undefined)

/**
 * Valida el campo del pedido `mirar_afuera_limites` { max_pedidos?: int 1..20, permitidos?: string[] ⊂ catálogo }.
 * Toma el PRIMER candidato presente (camelCase / snake_case / dentro de `context`). Ausente ⇒ {ok:true, valor:null}. Mal escrito ⇒ {ok:false, motivo}: NO se ignora (ignorarlo dejaría pasar un cupo que se creía puesto).
 * Devuelve el valor en camelCase: { maxPedidos: number|null, permitidos: string[]|null }.
 */
function resolverLimites(...candidatos) {
  const c = primero(candidatos)
  if (c === undefined) return { ok: true, valor: null }
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return { ok: false, motivo: 'mirar_afuera_limites debe ser un objeto { max_pedidos, permitidos } (llegó ' + JSON.stringify(c) + ')' }
  const hayMax = 'max_pedidos' in c || 'maxPedidos' in c
  const hayPerm = 'permitidos' in c
  if (!hayMax && !hayPerm) return { ok: false, motivo: 'mirar_afuera_limites debe traer max_pedidos y/o permitidos (llegó un objeto sin ninguno)' }
  let maxPedidos = null
  if (hayMax) {
    const m = 'max_pedidos' in c ? c.max_pedidos : c.maxPedidos
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > LIMITE_MAXIMO_DE_PEDIDOS) {
      return { ok: false, motivo: 'max_pedidos debe ser un entero entre 1 y ' + LIMITE_MAXIMO_DE_PEDIDOS + ' (llegó ' + JSON.stringify(m) + ')' }
    }
    maxPedidos = m
  }
  let permitidos = null
  if (hayPerm) {
    const p = c.permitidos
    if (!Array.isArray(p) || p.length === 0 || p.some((x) => typeof x !== 'string')) {
      return { ok: false, motivo: 'permitidos debe ser una lista NO vacía de textos (llegó ' + JSON.stringify(p) + ')' }
    }
    const desconocidas = p.filter((x) => !Object.prototype.hasOwnProperty.call(CATALOGO, x))
    if (desconocidas.length) {
      return { ok: false, motivo: 'permitidos trae opciones que no existen: ' + desconocidas.join(', ') + ' · las que existen: ' + Object.keys(CATALOGO).join(', ') }
    }
    permitidos = [...new Set(p)]
  }
  return { ok: true, valor: { maxPedidos, permitidos } }
}

/** Lee los límites que el registro pone en el entorno del servidor. Variables ausentes o ilegibles ⇒ sin límites (como siempre). */
function leerLimitesDeEntorno(env) {
  const crudoMax = env && env.MIRAR_AFUERA_MAX_PEDIDOS
  const n = Number(crudoMax)
  const maxPedidos = crudoMax !== undefined && crudoMax !== '' && Number.isInteger(n) && n >= 1 && n <= LIMITE_MAXIMO_DE_PEDIDOS ? n : null
  const crudoPerm = env && env.MIRAR_AFUERA_PERMITIDOS
  const lista = typeof crudoPerm === 'string' ? crudoPerm.split(',').map((x) => x.trim()).filter((x) => Object.prototype.hasOwnProperty.call(CATALOGO, x)) : []
  return { maxPedidos, permitidos: lista.length ? [...new Set(lista)] : null }
}

/** Lo que el registro pone en el entorno del servidor · SIN límites ⇒ objeto vacío (el entorno de siempre) */
function entornoDeLimites(limites) {
  const out = {}
  if (!limites) return out
  if (typeof limites.maxPedidos === 'number') out.MIRAR_AFUERA_MAX_PEDIDOS = String(limites.maxPedidos)
  if (Array.isArray(limites.permitidos) && limites.permitidos.length) out.MIRAR_AFUERA_PERMITIDOS = limites.permitidos.join(',')
  return out
}

/**
 * El control de UNA corrida. `revisar(que_mirar)` decide y, si acepta, TOMA un cupo de forma SÍNCRONA (los pedidos «todos de una vez» no pueden colarse).
 * Una opción no permitida se rechaza SIN gastar cupo. Sin límites: siempre acepta (y cuenta, para poder auditar).
 */
function crearControl(limites) {
  const maxPedidos = limites && typeof limites.maxPedidos === 'number' ? limites.maxPedidos : null
  const permitidos = limites && Array.isArray(limites.permitidos) && limites.permitidos.length ? limites.permitidos : null
  let usados = 0
  return {
    revisar(queMirar) {
      if (permitidos && !permitidos.includes(queMirar)) {
        return { ok: false, codigo: 'opcion_no_permitida', motivo: 'en esta corrida NO se puede mirar «' + queMirar + '» · lo permitido: ' + permitidos.join(', ') + ' · no se hizo ningún pedido' }
      }
      if (maxPedidos !== null && usados >= maxPedidos) {
        return { ok: false, codigo: 'limite_de_pedidos', motivo: 'se alcanzó el máximo de ' + maxPedidos + ' pedidos de esta corrida · no se hizo este pedido · trabaja con lo que ya miraste y declara lo que falte' }
      }
      usados++
      return { ok: true }
    },
    usados: () => usados,
  }
}

module.exports = { LIMITE_MAXIMO_DE_PEDIDOS, resolverLimites, leerLimitesDeEntorno, entornoDeLimites, crearControl }
