// PLAN v3 · V1 · la semilla del catálogo cumple su FORMA (diseño §4 + §13.3 bis + §14.7 + §17.3). Devuelve la lista de errores; vacía = válida. PURO.
// La prueba de mutación de V1 quita una fila crítica y exige que esta función la detecte.
import { validarAlta, TABLAS } from '../catalogo-agregar/nucleo.mjs'

const TRAMOS = ['recoleccion', 'oficina', 'redaccion', 'jefatura', 'cupo_ficha']
const GRUPOS = ['verificacion', 'ausencia', 'supuesto', 'dominio', 'periodo']
const FUENTES_PROPIAS = ['mapas_ficha', 'resenas_mapas', 'instagram_perfil', 'menciones_redes', 'sitio_web']
const PROHIBIDAS = ['naufrago', 'náufrago', 'guayaquil', 'quito', 'gualaceo', 'olon', 'olón', 'peniche', 'restaurante', 'pizzeria', 'odontolog', 'dental']

export function verificarSemilla(semilla) {
  const errores = []
  const ids = {
    fuentes: new Set((semilla.fuentes ?? []).map((f) => f.fuente_id)),
    tipos: new Set((semilla.tipos ?? []).map((t) => t.tipo_id)),
  }
  const existe = (tabla, _col, valor) => (tabla === 'fuentes' ? ids.fuentes : ids.tipos).has(valor)

  // 1 · cada fila pasa la MISMA validación que el alta de V12 (las columnas de control las pone el guion, no la semilla)
  for (const nombre of Object.keys(TABLAS)) {
    const clave = TABLAS[nombre].clave
    const vistas = new Set()
    for (const fila of semilla[nombre] ?? []) {
      const { pais: _p, ...limpia } = fila
      const r = validarAlta(nombre, limpia, existe)
      if (!r.ok) errores.push(`${nombre}.${fila[clave] ?? '?'}: ${r.errores.join('; ')}`)
      if (vistas.has(fila[clave])) errores.push(`${nombre}: clave repetida «${fila[clave]}»`)
      vistas.add(fila[clave])
    }
  }

  // 2 · filas críticas (quitar una rompe la forma)
  const tipos = new Map((semilla.tipos ?? []).map((t) => [t.tipo_id, t]))
  const reglas = semilla.reglas ?? []
  if (!ids.fuentes.has('cerebro_vivo')) errores.push('falta la fuente `cerebro_vivo` (brazo primario, §14.1)')
  if (!tipos.get('precio')?.moneda_requerida) errores.push('falta el tipo `precio` con moneda_requerida (U1/U5)')
  if (!reglas.some((r) => r.clase === 'moneda_pais' && r.pais)) errores.push('falta al menos una fila país→moneda (G3: sin ella el piloto saldría «sin bloque»)')
  const espera = reglas.find((r) => r.regla_id === 'param_espera_listo_min')
  if (espera?.parametros?.minutos !== 45) errores.push('«cerebro listo» espera 45 min (aviso 15-oct), no ' + (espera?.parametros?.minutos ?? 'ausente'))
  if (reglas.find((r) => r.regla_id === 'param_listo_dias_rastro')?.parametros?.dias !== 2) errores.push('falta N de «listo» = 2 días (S3 del §17.2)')
  if (!reglas.some((r) => r.regla_id === 'param_lee_crudo_del_alta' && r.parametros?.valor === true)) errores.push('falta `lee_crudo_del_alta` = true por omisión (S4, §17.3)')
  for (const g of GRUPOS) if (!(semilla.lexico ?? []).some((l) => l.grupo === g)) errores.push(`falta el léxico del grupo «${g}» (G7)`)
  for (const t of TRAMOS) if (!(semilla.topes ?? []).some((x) => x.tramo === t && !x.fuente_id)) errores.push(`falta el tope del tramo «${t}»`)
  const suma = ['recoleccion', 'oficina', 'redaccion', 'jefatura'].reduce((a, t) => a + ((semilla.topes ?? []).find((x) => x.tramo === t)?.usd ?? 0), 0)
  if (Math.abs(suma - 3.4) > 1e-9) errores.push(`la suma de topes por tramo debe ser 3,40 (§17.3); es ${suma.toFixed(2)}`)
  for (const f of FUENTES_PROPIAS) {
    if (!reglas.some((r) => r.clase === 'identidad' && r.operador === 'delegada_en_portero' && r.aplica_a?.fuente === f)) errores.push(`la fuente propia «${f}» no tiene su fila de identidad delegada en el portero (§14.2)`)
  }
  // 3 · lo que rev. 3 SACÓ: ninguna regla de identidad propia
  for (const r of reglas) if (String(r.operador).startsWith('coincide_')) errores.push(`regla «${r.regla_id}»: los operadores coincide_* salieron del conjunto cerrado (§14.2.3)`)
  // 4 · reintentos = 0 en lo que cobra (G1)
  for (const f of semilla.fuentes ?? []) if (f.proveedor === 'apify' && (f.reintentos ?? 0) !== 0) errores.push(`fuente «${f.fuente_id}»: sin reintento en lo que cobra (G1)`)
  // 5 · agnóstico: ningún cliente, lugar ni rubro en la semilla
  const texto = JSON.stringify(semilla).toLowerCase()
  for (const p of PROHIBIDAS) if (texto.includes(p)) errores.push(`la semilla no es agnóstica: nombra «${p}»`)
  return errores
}
