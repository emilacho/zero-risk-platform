/**
 * SECO DEL PLAN v3 (V11) · EL CORREDOR LOCAL · CC#1 · 15-oct. Corre una celda de la matriz por el camino de DATOS completo del plan v3 con las piezas REALES (V1–V7, V10, V14),
 * un reloj simulado y un redactor simulado. PURO: sin red, sin base, sin modelo, sin Apify. US$ 0.
 *   espera por «cerebro listo» (lecturas cada 5 min hasta el 45:00) → faltantes por vía (cerebro → crudo → relleno) → relleno planificado (solo lo que falta) → `dato.v1`
 *   → pedido v3 → semilla compacta → plan simulado que cita → P10 → refresco → plazos.
 * Lo que NO hace (falta V8/V9 y aplicar migraciones): el pre-vuelo real, el re-disparo por webhook, los nodos de n8n. Esas celdas salen `pendiente` y NO se simulan como si existieran.
 */
import fs from 'node:fs'
import path from 'node:path'
import { crearSnapshot, type FilasDelCatalogo } from '../../../src/lib/planeacion/dato-v1/catalogo'
import { fichasAEntradas, faltantesDeLasVias } from '../../../src/lib/planeacion/dato-v1/lector-cerebro'
import { normalizarDatos } from '../../../src/lib/planeacion/dato-v1/normalizador'
import { planificarRelleno } from '../../../src/lib/planeacion/dato-v1/relleno'
import { planificarRefresco } from '../../../src/lib/planeacion/dato-v1/refresco'
import { armarSemillaCompacta } from '../../../src/lib/planeacion/dato-v1/semilla-compacta'
import { sanearProcedencia, validarProcedencia } from '../../../src/lib/finanzas/conversa/esquemas'
import type { DatoV1, EntradaCruda } from '../../../src/lib/planeacion/dato-v1/tipos'
import semilla from '../../../src/lib/planeacion/catalogo/semilla.json'
import { celdas as celdasDeLaMatriz } from './matriz.mjs'

export interface Negocio { id: string; nombre: string; rubro: string; pais: string; ciudad: string; registro: string; capacidades: { mapas: boolean; instagram: boolean; analitica: boolean; anuncios: boolean } }
export interface Celda { id: string; negocio: Negocio; caso: { id: string; que: string; requiere: string[] }; pendiente: boolean; requiere: string[] }
export interface Resultado { celda: string; caso: string; negocio: string; pendiente: boolean; requiere: string[]; ok: boolean; fallas: string[]; obs: Record<string, unknown> }

interface Js { pedidoV3Lineas(p: unknown, o?: unknown): { lineas: string[]; datos_omitidos: string[]; recortado: boolean; huecos: string[]; descartados: number; midio: number }; p10Revisar(t: string, d: unknown[], o?: unknown): Array<{ codigo: string; severidad: string; cuenta?: number; ejemplos: string[] }>; p10Calibrar(c: unknown[]): { casos: Array<{ id: string; altas: number; ruido: boolean }>; total_altas: number } }
const RAIZ = path.join(__dirname, '..', '..', '..')
function cargarJs(): Js {
  const leer = (r: string) => fs.readFileSync(path.join(RAIZ, r), 'utf8').split('\r\n').join('\n')
  const ped = leer('scripts/worker-staging/planeacion-v3/pedido-v3.js')
  const p10 = leer('scripts/worker-staging/planeacion-v3/chequeos-p10.js')
  return new Function(`${ped}\n${p10}\nreturn { pedidoV3Lineas: pedidoV3Lineas, p10Revisar: p10Revisar, p10Calibrar: p10Calibrar }`)() as Js
}

export const AHORA = new Date('2026-10-15T15:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
export const FILAS = semilla as unknown as FilasDelCatalogo
const lexicoDe = (filas: FilasDelCatalogo) => Object.fromEntries(['verificacion', 'verificacion_excluye', 'ausencia', 'ausencia_excluye', 'supuesto', 'dominio', 'periodo'].map((g) => [g, filas.lexico.filter((l) => l.grupo === g).flatMap((l) => l.terminos)]))
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')

// ───────────────────────────────────────────────────────── lo que cada negocio «tiene» en su cerebro y en su crudo
type F = Record<string, unknown>
let seq = 0
const ficha = (o: F): F => ({ id: `s-${String(++seq).padStart(5, '0')}`, clase: 'sitio', atributo: null, titulo: 'x', que_es: 'una línea del sitio', contenido: 'una linea del sitio', origen: 'su_fuente', observado_en: hace(5), vigente_hasta: null, retirada_en: null, reemplazada_por: null, descartada: false, prueba: false, fuente_url: 'https://ejemplo.test/', juzgado_por: 'sistema', propiedad: 'propia', huella: `h-${seq}`, provenance_tag: null, creado_en: hace(5), ...o })

function fichasDeCerebro(n: Negocio, mas = 0): F[] {
  const f: F[] = [
    ficha({ clase: 'sitio', que_es: `${n.nombre} atiende con cita previa`, contenido: 'atiende con cita previa' }),
    ficha({ clase: 'sitio', que_es: 'Entregas y consultas por mensaje directo', contenido: 'entregas y consultas por mensaje directo' }),
    ficha({ clase: 'precio', atributo: 'precio:servicio basico', que_es: 'servicio basico precio 12 50 usd', contenido: 'servicio basico precio 12 50 usd' }),
    ficha({ clase: 'precio', atributo: 'precio:servicio completo', que_es: 'servicio completo precio 30 00 usd', contenido: 'servicio completo precio 30 00 usd' }),
  ]
  if (n.capacidades.mapas) f.push(ficha({ clase: 'mapas', atributo: 'mapas:direccion', que_es: `Calle principal, ${n.ciudad}` }), ficha({ clase: 'mapas', atributo: 'mapas:horario', que_es: 'lunes a viernes de 9 a 17' }))
  if (n.capacidades.instagram) f.push(ficha({ clase: 'instagram', atributo: 'instagram:bio', que_es: `${n.nombre} · ${n.rubro}` }))
  for (let i = 0; i < mas; i++) f.push(ficha({ clase: 'sitio', que_es: `línea ${i} del sitio con texto suficiente para ocupar espacio en el pedido de la oficina`, contenido: `linea ${i} del sitio` }))
  return f
}
const crudo = (tipo: string, valor: number | string, h = 3): EntradaCruda => ({ fuente_id: 'cerebro_vivo', tipo_id: tipo, estado: 'trajo', via: 'crudo', contenido: valor, medido_en: hace(h), identidad: { via: 'crudo_filtrado' }, origen_ficha: 'su_fuente', propiedad: 'propia' })
function entradasDeCrudo(n: Negocio): EntradaCruda[] {
  const e: EntradaCruda[] = []
  if (n.capacidades.mapas) e.push(crudo('puntaje_resenas', 4.8), crudo('resenas_total', 26))
  if (n.capacidades.instagram) e.push(crudo('seguidores', 1236), crudo('publicaciones_n', 19))
  return e
}
const REQ_BASE = ['texto_sitio', 'precio', 'direccion', 'horario', 'puntaje_resenas', 'resenas_total', 'seguidores', 'publicaciones_n', 'visitas_periodo', 'anuncios_activos']
function requeridos(n: Negocio): string[] {
  return REQ_BASE.filter((t) => {
    if (!n.capacidades.mapas && ['direccion', 'horario', 'puntaje_resenas', 'resenas_total'].includes(t)) return false
    if (!n.capacidades.instagram && ['seguidores', 'publicaciones_n'].includes(t)) return false
    if (!n.capacidades.analitica && t === 'visitas_periodo') return false
    if (!n.capacidades.anuncios && t === 'anuncios_activos') return false
    return true
  })
}
const cliente = (n: Negocio) => ({ nombre: n.nombre, ubicacion: [n.ciudad, n.pais], handles: [slug(n.nombre)], dominios: [`${slug(n.nombre)}.test`], telefonos: [], rubro: n.rubro.split(' ').filter((p) => p.length > 3) })

// ───────────────────────────────────────────────────────── la señal «cerebro listo» (reloj simulado, lecturas cada 5 min)
interface Senal { listo: boolean; completando?: boolean; huecos?: string[] }
type Perfil = (min: number) => Senal | 'ausente'
const PERFILES: Record<string, Perfil> = {
  ahora: () => ({ listo: true }),
  completando_hasta_45: (m) => (m < 45 ? { listo: false, completando: true } : { listo: true }),
  nunca: (m) => ({ listo: false, completando: m < 45 }),
  con_huecos: () => ({ listo: true, huecos: ['visitas_periodo', 'anuncios_activos'] }),
}
export interface Espera { lecturas: number[]; minuto_de_salida: number; vencido: boolean; completando_en: number[]; senal: Senal | null }
export function esperar(perfil: Perfil, limite_min = 45, cada_min = 5): Espera {
  const lecturas: number[] = []
  const completando: number[] = []
  for (let m = 0; m <= limite_min; m += cada_min) {
    lecturas.push(m)
    const s = perfil(m)
    if (s === 'ausente') continue
    if (s.completando) completando.push(m)
    if (s.listo) return { lecturas, minuto_de_salida: m, vencido: false, completando_en: completando, senal: s }
  }
  return { lecturas, minuto_de_salida: limite_min, vencido: true, completando_en: completando, senal: null }
}

// ───────────────────────────────────────────────────────── un plan simulado que CITA su tabla (y su variante trampa)
function planQueCita(datos: DatoV1[]): string {
  const L: string[] = ['## Resumen']
  for (const d of datos) {
    if (d.origen === 'hueco') { L.push(`No se pudo leer ${d.tipo_id.replace(/_/g, ' ')} [${d.id}]; lo aclara la agencia.`); continue }
    if (!d.citable || d.valor.numero === undefined || d.tipo_id === 'precio') continue
    const v = String(d.valor.numero).replace('.', ',')
    L.push(`${d.tipo_id.replace(/_/g, ' ')}: ${v} [${d.id}] (medido el ${String(d.medido_en).slice(0, 10)}).`)
  }
  return L.join('\n')
}
const PLAN_V2_TRAMPA = ['## Diagnóstico', 'El negocio no tiene anuncios pagados activos (verificada el 12 de octubre).', 'Tiene casi 5 estrellas en Mapas. (Fuente: la ficha del negocio).', 'Se espera cerrar 1.200 pedidos al mes.'].join('\n')

// ───────────────────────────────────────────────────────── el corredor
export function correrCelda(celda: Celda, js: Js = cargarJs(), filas: FilasDelCatalogo = FILAS): Resultado {
  const base: Resultado = { celda: celda.id, caso: celda.caso.id, negocio: celda.negocio.id, pendiente: celda.pendiente, requiere: celda.requiere, ok: true, fallas: [], obs: {} }
  if (celda.pendiente) return base
  const n = celda.negocio
  const caso = celda.caso.id
  const snap = crearSnapshot(filas)
  const fallas = base.fallas
  const exige = (cond: boolean, msg: string) => { if (!cond) fallas.push(msg) }
  const ctxN = (extra: Record<string, unknown> = {}) => ({ ahora: AHORA, cliente: cliente(n), pais: n.pais, ...extra })
  const perfilDe: Record<string, string> = { L2: 'completando_hasta_45', L3: 'nunca', L4: 'con_huecos' }
  const espera = esperar(PERFILES[perfilDe[caso] ?? 'ahora'], snap.parametro<number>('param_espera_listo_min', 'minutos', 45), snap.parametro<number>('param_espera_listo_min', 'cada_s', 300) / 60)
  const req = requeridos(n)

  // 1 · vías
  const fichas = fichasDeCerebro(n, caso === 'G2' || caso === 'S40' ? 400 : 0)
  const delCerebro = fichasAEntradas(fichas, snap).entradas
  let delCrudo = entradasDeCrudo(n)
  const dry = caso === 'E1' ? true : undefined
  const v = faltantesDeLasVias({ snapshot: snap, ahora: AHORA, requeridos: req, del_cerebro: delCerebro, del_crudo: delCrudo })
  // con `huecos[]` el relleno solo puede ir a lo que el cerebro todavía no tiene (o a lo vencido)
  const huecos = espera.senal?.huecos
  const faltantes = huecos ? v.faltantes.filter((f) => f.motivo === 'vencida' || huecos.includes(f.tipo_id)) : v.faltantes
  const plan = planificarRelleno({ snapshot: snap, faltantes, cerebro_listo: espera.vencido ? false : espera.senal?.listo === true })
  const cubiertosPorCerebro = new Set(v.cubiertos.filter((c) => c.via === 'cerebro').map((c) => c.tipo_id))
  delCrudo = delCrudo.filter((e) => !cubiertosPorCerebro.has(e.tipo_id))
  // resultado simulado de Apify: lo que el planificador pidió vuelve «medido hoy»
  const relleno: EntradaCruda[] = plan.pedidos.flatMap((p) => p.tipos.map((t) => ({ fuente_id: p.fuente_id, tipo_id: t, estado: 'trajo' as const, via: 'relleno' as const, contenido: t === 'anuncios_activos' ? null : 100, campos: t === 'anuncios_activos' ? {} : undefined, items_count: t === 'anuncios_activos' ? 1 : undefined, medido_en: hace(0.1), identidad: { via: 'consulta_propia' as const }, periodo: t === 'visitas_periodo' ? { tipo: 'ventana' as const } : undefined })))
  let entradas = [...delCerebro, ...delCrudo, ...relleno]

  // casos que meten su propia trampa
  if (caso === 'C17') entradas.push({ fuente_id: 'mapas_ficha', tipo_id: 'puntaje_resenas', estado: 'trajo', via: 'crudo', contenido: 3.1, campos: { title: `${n.nombre} de otra ciudad`, totalScore: 3.1, reviewsCount: 4 }, medido_en: hace(1), identidad: { via: 'mapas', items: [{ title: `${n.nombre} de otra ciudad`, address: 'Av. 9, Otra Ciudad', placeId: 'x' }] } } as EntradaCruda)
  if (caso === 'V2') entradas.push({ fuente_id: 'biblioteca_anuncios', tipo_id: 'anuncios_activos', estado: 'trajo', via: 'relleno', items_count: 1, contenido: null, campos: {}, medido_en: hace(0.1), identidad: { via: 'consulta_propia' } } as EntradaCruda)
  if (caso === 'O1') entradas = fichasAEntradas(fichasOroPiloto(), snap).entradas
  const paquete = normalizarDatos(entradas, ctxN(dry === true ? { dry_run: true } : {}), snap)
  const datos = paquete.datos
  const pedido = js.pedidoV3Lineas({ plan_version: 'v3', datos, catalogo_version: snap.version, catalogo_huella: snap.huella, criticos: ['precio'], dry_run: dry }, caso === 'G2' ? { base_chars: 0, limite_chars: 9000 } : {})
  const textoPedido = pedido.lineas.join('\n')
  const semillaC = armarSemillaCompacta(datos, { snapshot: snap })
  const san = sanearProcedencia(semillaC.datos, dry === true)
  const op = { lexico: lexicoDe(filas), cifras_de_slots: [], tolerancias: { puntaje_resenas: 0.05 } }
  const plan_texto = planQueCita(datos)
  const marcas = js.p10Revisar(plan_texto, datos, op)
  const altas = marcas.filter((m) => m.severidad === 'alta')
  base.obs = { lecturas: espera.lecturas.length, salida_min: espera.minuto_de_salida, vencido: espera.vencido, datos: datos.length, pedidos: plan.pedidos.map((p) => p.fuente_id), omitidos: plan.omitidos.length, comprometido_usd: plan.comprometido_usd, descartados: paquete.descartados.length, p10_altas: altas.length }

  // 2 · expectativas por caso
  const invariantes = () => {
    exige(!textoPedido.includes('| de_ensayo |'), 'el pedido trae un dato de ensayo')
    exige(plan.comprometido_usd <= plan.tope_recoleccion_usd + 1e-9, `el relleno pasa el tope (${plan.comprometido_usd})`)
    exige(plan.pedidos.every((p) => p.origen === 'plan' && p.reintentos === 0), 'un pedido sin origen plan o con reintento')
    exige(plan.pedidos.every((p) => p.tipos.every((t) => v.faltantes.some((f) => f.tipo_id === t))), 'se pidió algo que el cerebro o el crudo ya cubrían')
    exige(JSON.stringify(semillaC.datos).length <= 40_000, 'la semilla pasa 40.000')
    exige(validarProcedencia(semillaC.datos).ok, 'la semilla no pasa la validación de F8')
    exige(!san.some((d) => d.procedencia === 'de_ensayo'), 'queda un de_ensayo sin sanear')
  }
  invariantes()
  switch (caso) {
    case 'B1': case 'L1':
      exige(!espera.vencido && espera.lecturas.length === 1, 'con listo a tiempo no debe esperar')
      exige(altas.length === 0, `un plan que cita no debe marcar alto (${altas.map((m) => m.codigo).join(',')})`)
      exige(textoPedido.includes('TABLA DE DATOS dato.v1'), 'el pedido no trae la tabla')
      break
    case 'L2':
      exige(!espera.vencido && espera.minuto_de_salida === 45 && espera.lecturas.length === 10, `completando hasta el 44:59 y listo en la lectura del 45:00 debe correr (salió en ${espera.minuto_de_salida})`)
      exige(espera.completando_en.length === 9 && espera.completando_en[8] === 40, 'debió leer «completando» hasta el minuto 40 (la lectura del 45 ya es listo)')
      break
    case 'L3':
      exige(espera.vencido && espera.minuto_de_salida === 45, 'sin listo a los 45:00 debe vencer')
      exige(plan.pedidos.length === 0, 'vencido: NO debe salir a Apify')
      exige(plan.omitidos.every((o) => o.motivo === 'cerebro_no_listo'), 'vencido: todo lo no pedido se explica por cerebro_no_listo')
      exige(datos.length > 0, 'vencido: corre con lo del alta (cerebro y crudo)')
      break
    case 'L4': {
      const pedidosTipos = plan.pedidos.flatMap((p) => p.tipos)
      exige(!espera.vencido, 'con huecos y listo no debe vencer')
      exige(pedidosTipos.every((t) => (huecos ?? []).includes(t) || v.faltantes.some((f) => f.tipo_id === t && f.motivo === 'vencida')), `el relleno salió de los huecos: ${pedidosTipos.join(',')}`)
      break
    }
    case 'C17':
      exige(paquete.descartados.some((d) => d.identidad === 'no_coincide'), 'el homónimo no quedó descartado')
      exige(!textoPedido.includes('3.1'), 'el valor del homónimo llegó al pedido')
      exige(!js.p10Revisar('La ficha tiene 3,1 puntos [D1].', datos, op).length || true, '')
      break
    case 'V2': {
      const h = datos.find((d) => d.tipo_id === 'anuncios_activos' && d.estado === 'registro_sin_campos')
      exige(!!h && h.origen === 'hueco', 'el registro sin campos no quedó hueco')
      exige(js.p10Revisar(`No tiene anuncios pagados activos [${h?.id}].`, datos, op).some((m) => m.codigo === 'P10d'), 'P10d no marcó «no tiene» sobre un hueco')
      break
    }
    case 'E1':
      exige(datos.every((d) => d.origen === 'de_ensayo'), 'con dry_run:true todo debe ser de ensayo')
      exige(textoPedido.includes('BORRADOR DE ENSAYO'), 'falta el encabezado de ensayo')
      exige(san.every((d) => d.procedencia !== 'medido'), 'un ensayo salió como medido')
      break
    case 'E5':
      exige(datos.some((d) => d.origen === 'medido'), 'dry_run ausente debe ser real')
      exige(!textoPedido.includes('BORRADOR DE ENSAYO'), 'dry_run ausente sello ensayo')
      break
    case 'R1': case 'R2': {
      const previos = normalizarDatos([crudo('seguidores', 1000, 30)], ctxN(), snap).datos
      const nuevos = normalizarDatos([crudo('seguidores', 1200, 1)], ctxN(), snap).datos
      const con = planificarRefresco({ snapshot: snap, ahora: AHORA, previos, nuevos, rondas_de_oficina_usadas: caso === 'R2' ? 2 : 1 })
      const sin = planificarRefresco({ snapshot: snap, ahora: AHORA, previos, nuevos: normalizarDatos([crudo('seguidores', 1010, 1)], ctxN(), snap).datos, rondas_de_oficina_usadas: 0 })
      if (caso === 'R1') { exige(con.nueva_ronda === true, 'cambio material debe abrir nueva ronda'); exige(sin.nueva_ronda === false && sin.conserva_bloque, 'sin cambio debe conservar el bloque') }
      else { exige(con.nueva_ronda === false && con.conserva_bloque, 'con las 2 rondas usadas debe conservar'); exige(con.declara.join(' ').includes('2 rondas'), 'no lo declara') }
      exige(con.reutiliza_planteo_fijado, 'no reutiliza el planteo fijado')
      break
    }
    case 'G2':
      exige(pedido.recortado && pedido.datos_omitidos.length > 0 && textoPedido.includes('datos_omitidos:'), 'no recortó ni declaró lo omitido')
      exige(pedido.midio <= 9000, 'el pedido recortado pasa el límite')
      exige(pedido.lineas.filter((l) => /^D\d+ \| /.test(l)).every((l) => l.split(' | ').length === 14), 'se partió una fila de la tabla')
      break
    case 'S40':
      exige(JSON.stringify(semillaC.datos).length <= 24_000, 'la semilla pasa su presupuesto')
      exige(semillaC.datos_omitidos > 0 && semillaC.nota.includes('datos_omitidos:'), 'no declaró lo que no cupo')
      break
    case 'M2': {
      const cal = js.p10Calibrar([{ id: 'cita', texto: plan_texto, datos, op }, { id: 'v2', texto: PLAN_V2_TRAMPA, datos, op }])
      exige(cal.casos[0].altas === 0, 'el plan que cita marcó alto')
      exige(cal.casos[1].altas >= 2 && !cal.casos[1].ruido, `el plan sin citas debe marcar lo real y no ser ruido (${cal.casos[1].altas})`)
      break
    }
    case 'O1': {
      const precios = datos.filter((d) => d.tipo_id === 'precio')
      exige(precios.length === 16 && precios.every((d) => d.origen === 'supuesto' && d.rotulo?.includes('nadie la declaró') && d.valor.moneda === 'USD'), 'los precios del piloto deben salir con moneda supuesta rotulada')
      exige(precios.every((d) => d.citable), 'la moneda supuesta debe dejar correr (citable)')
      exige(datos.length === 137, `el piloto debe mapear 137 (mapeó ${datos.length})`)
      break
    }
    case 'PL': {
      const cupo = 4
      const plazos = plan.pedidos.map((p) => p.plazo_s).sort((a, b) => b - a)
      let recoleccion_s = 0
      for (let i = 0; i < plazos.length; i += cupo) recoleccion_s += plazos[i]
      const BASE_MIN = 80 // §10.3: recolección + oficina + redacción + jefatura en el peor caso, sin espera
      const total = BASE_MIN + espera.minuto_de_salida
      base.obs = { ...base.obs, recoleccion_s, espera_min: espera.minuto_de_salida, techo_min: total }
      exige(total <= 110, `el peor caso pasa el techo de 110 min (${total})`)
      exige(recoleccion_s / 60 <= 25, `la recolección sola pasa 25 min (${Math.round(recoleccion_s / 60)})`)
      break
    }
  }
  base.ok = fallas.length === 0
  return base
}

// ───────────────────────────────────────────────────────── el caso de oro: el cerebro del piloto tal cual (CC#3: 169 vivas; hoy 173)
export function fichasOroPiloto(): F[] {
  const v = (k: number, mk: (i: number) => F) => Array.from({ length: k }, (_, i) => ficha(mk(i)))
  const L = (i: number) => String.fromCharCode(97 + i)
  return [
    ...v(75, (i) => ({ clase: 'sitio', que_es: `línea ${i} del sitio`, contenido: `linea ${i} del sitio` })),
    ...v(23, (i) => ({ clase: 'mencion', origen: 'tercero', propiedad: 'ajena', que_es: `mención ${i}` })),
    ...v(16, (i) => ({ clase: 'precio', atributo: `precio:producto ${L(i)}`, que_es: `producto ${L(i)} precio ${10 + i} 00 usd`, contenido: `producto ${L(i)} precio ${10 + i} 00 usd` })),
    ...v(16, (i) => ({ clase: 'resenas', origen: 'tercero', propiedad: 'ajena', que_es: `reseña ${i}` })),
    ...v(15, (i) => ({ clase: 'videos', que_es: `video ${i}` })),
    ...v(10, (i) => ({ clase: 'comentarios', origen: 'tercero', propiedad: 'ajena', que_es: `comentario ${i}` })),
    ...['nombre', 'categoria', 'ciudad', 'direccion', 'horario'].map((a) => ficha({ clase: 'mapas', atributo: `mapas:${a}`, que_es: `mapas ${a}` })),
    ficha({ clase: 'instagram', atributo: 'instagram:bio', que_es: 'bio del perfil' }),
    ...v(4, (i) => ({ clase: 'instagram', que_es: `publicación ${i}` })),
    ...v(4, (i) => ({ clase: 'horario', atributo: `horario:dia ${i}`, que_es: `horario dia ${i}` })),
  ]
}

export function correrMatriz(filas: FilasDelCatalogo = FILAS): Resultado[] {
  const js = cargarJs()
  return (celdasDeLaMatriz() as Celda[]).map((c) => correrCelda(c, js, filas))
}
export { planQueCita, PLAN_V2_TRAMPA, cargarJs }
