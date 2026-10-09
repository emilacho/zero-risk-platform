/**
 * /api/cadena/filas · /fechas (diseño v2 §5.3, §7, §10).
 * `filas`: listar, lotes por fecha para el vigía, marcar estados con transiciones legales.
 * `fechas`: cobertura (una investigación por tipo, ámbito y año, máx. 3 intentos) y guardar con la cita comprobada POR CÓDIGO contra el texto descargado.
 */
import { createHash } from 'node:crypto'
import type { Almacen } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { modeloDeLaCadena, CABECERA_SALTAR_EDITOR } from './constantes'
import { ESQUEMA_FECHAS_ESPECIALES } from './esquemas'
import { tareaDeFechas } from './indicaciones'
import { prepararCorrida } from './nucleo'
import { cuerpoDeRunSdk } from './pasos'
import { validarEsquemaDeSalida } from '@/lib/salida-estructurada'
import { esFechaIso, restarDias, semanaIso } from './fechas'
import { citaAparece, normalizar } from './texto'
import type { Fila } from './tipos'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const MARCAS_LEGALES: Partial<Record<Fila['estado'], Fila['estado'][]>> = {
  validada: ['lista_para_brief', 'briefeada', 'cancelada'],
  lista_para_brief: ['briefeada', 'cancelada'],
  briefeada: ['en_oficina', 'perdio_su_fecha', 'cancelada'],
  en_oficina: ['aprobada', 'perdio_su_fecha', 'cancelada'],
  en_investigacion: ['validada', 'descartada_sin_fuente', 'cancelada'],
  espera_video: ['validada', 'vencida_sin_brazo', 'cancelada'],
}

export async function filasListar(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const estado = cadena(cuerpo.estado)
  const version = Math.max(1, await al.ultimaVersionDeCalendario(id))
  const filas = (await al.filas(id, version)).filter((f) => !estado || f.estado === estado)
  return { status: 200, cuerpo: { filas, total: filas.length, version, campana: { id: c.id, plan_id: c.plan_id, client_id: c.client_id, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, estado: c.estado, seco: c.seco } } }
}

/**
 * Los lotes que toca briefear HOY: filas `validada`/`lista_para_brief` cuya `fecha − lead_dias − holgura ≤ hoy`, sin video, agrupadas por semana ISO.
 * La clave de idempotencia de un lote es `campana:semana-iso:version` (CC#3: el sobre repetido no abre un viaje nuevo).
 */
export async function filasLotes(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  if (c.estado !== 'activa') return { status: 200, cuerpo: { lotes: [], motivo: `la campaña está ${c.estado}` } }
  const formatos = await al.formatos()
  const holgura = typeof (await al.leerConfig('holgura_dias')) === 'number' ? ((await al.leerConfig('holgura_dias')) as number) : 3
  const hoy = (cadena(cuerpo.hoy) ?? ahora).slice(0, 10)
  const version = Math.max(1, await al.ultimaVersionDeCalendario(id))
  const vencen = (await al.filas(id, version)).filter((f) => {
    if (f.estado !== 'validada' && f.estado !== 'lista_para_brief') return false
    const lead = (formatos[f.red] ?? []).find((x) => x.formato === f.formato)?.lead_dias ?? 3
    return restarDias(f.fecha, lead + holgura) <= hoy && f.fecha >= hoy
  })
  const porSemana = new Map<string, Fila[]>()
  for (const f of vencen) porSemana.set(semanaIso(f.fecha), [...(porSemana.get(semanaIso(f.fecha)) ?? []), f])
  const lotes = [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([lote, fs]) => ({ lote, fila_ids: fs.map((f) => f.id), idempotency_key: `${c.id}:${lote}:${version}` }))
  return { status: 200, cuerpo: { lotes, version } }
}

export async function filasMarcar(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  const estado = cadena(cuerpo.estado) as Fila['estado'] | null
  const ids = Array.isArray(cuerpo.fila_ids) ? (cuerpo.fila_ids as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (!id || !estado || !ids.length) return err(400, 'E-CAMPOS', 'faltan campana_id, estado o fila_ids')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const version = Math.max(1, await al.ultimaVersionDeCalendario(id))
  const filas = await al.filas(id, version)
  const ilegales: string[] = []
  for (const fid of ids) {
    const f = filas.find((x) => x.id === fid)
    if (!f) { ilegales.push(`${fid}: no existe`); continue }
    if (!(MARCAS_LEGALES[f.estado] ?? []).includes(estado)) ilegales.push(`${fid}: ${f.estado} → ${estado} no es una transición legal`)
    if (estado === 'lista_para_brief' || estado === 'briefeada') if (f.estado === 'espera_video') ilegales.push(`${fid}: una fila de video no entra a un lote`)
  }
  if (ilegales.length) return err(409, 'E-TRANSICION', ilegales.join(' · '))
  await al.cambiarEstadoDeFilas(id, version, ids, estado)
  return { status: 200, cuerpo: { ok: true, marcadas: ids.length } }
}

// ─────────────────────────────────────────────────────────────── FECHAS ESPECIALES (solo si el cliente declaró tipos)
const clave = (x: string) => normalizar(x).replace(/\s+/g, '_')

export async function fechasCobertura(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const pais = cadena(cuerpo.pais), tipo = cadena(cuerpo.tipo), ambito = cadena(cuerpo.ambito), anio = Number(cuerpo.anio)
  const id = cadena(cuerpo.campana_id)
  if (!pais || !tipo || !ambito || !Number.isInteger(anio) || !id) return err(400, 'E-CAMPOS', 'faltan campana_id, pais, tipo, ambito o anio')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const k = { pais: clave(pais), tipo: clave(tipo), ambito_clave: clave(ambito), anio }
  const cob = await al.coberturaDe(k.pais, k.tipo, k.ambito_clave, k.anio)
  if (cob?.estado === 'verificada') return { status: 200, cuerpo: { estado: 'ya_verificada' } }
  if (cob?.estado === 'sin_fuente' || (cob && cob.intentos >= 3)) {
    if (cob.estado !== 'sin_fuente') await al.guardarCobertura({ ...cob, estado: 'sin_fuente' })
    return { status: 200, cuerpo: { estado: 'sin_fuente', motivo: 'tras 3 intentos o sin dominios: solo las filas que dependen de esta fecha quedan sin fuente; la campaña sigue' } }
  }
  const dominios = ((await al.leerConfig('dominios_fechas')) as Record<string, string[]> | null)?.[`${k.tipo}|${k.pais}`] ?? []
  if (!dominios.length) {
    await al.guardarCobertura({ ...k, estado: 'sin_fuente', intentos: cob?.intentos ?? 0 })
    return { status: 200, cuerpo: { estado: 'sin_fuente', motivo: 'sin_dominios: no hay una lista de dominios permitidos para este tipo y país (cadena_config.dominios_fechas)' } }
  }
  const intentos = (cob?.intentos ?? 0) + 1
  await al.guardarCobertura({ ...k, estado: 'en_curso', intentos })
  return { status: 200, cuerpo: { estado: 'investigar', intento: intentos, dominios } }
}

/**
 * `preparar` de las fechas: recibe las páginas YA descargadas por el código (nodo HTTP) y devuelve el cuerpo completo del run-sdk + abre la corrida con plazo.
 * Una investigación por tipo, ámbito y año (la clave de la corrida); sin presupuesto o agotados los intentos, el tipo queda sin_fuente y la campaña sigue.
 */
export async function fechasPreparar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const pais = cadena(cuerpo.pais), tipo = cadena(cuerpo.tipo), ambito = cadena(cuerpo.ambito), anio = Number(cuerpo.anio), id = cadena(cuerpo.campana_id)
  const paginas = Array.isArray(cuerpo.paginas) ? (cuerpo.paginas as { url?: unknown; texto?: unknown }[]).filter((p): p is { url: string; texto: string } => typeof p.url === 'string' && typeof p.texto === 'string' && p.texto.trim() !== '') : []
  if (!pais || !tipo || !ambito || !Number.isInteger(anio) || !id) return err(400, 'E-CAMPOS', 'faltan campana_id, pais, tipo, ambito o anio')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  const k = { pais: clave(pais), tipo: clave(tipo), ambito_clave: clave(ambito), anio }
  if (!paginas.length) {
    const cob = await al.coberturaDe(k.pais, k.tipo, k.ambito_clave, k.anio)
    await al.guardarCobertura({ ...k, estado: 'sin_fuente', intentos: cob?.intentos ?? 0 })
    return { status: 200, cuerpo: { estado: 'sin_fuente', motivo: 'no se pudo descargar ninguna página: no hay nada que extraer (el tipo queda sin fuente; la campaña sigue)' } }
  }
  const esquema = validarEsquemaDeSalida(ESQUEMA_FECHAS_ESPECIALES)
  if (!esquema.ok || !esquema.valor || !esquema.hash) return err(500, 'E-ESQUEMA', 'el esquema de fechas no es válido')
  const modelo = await modeloDeLaCadena(al)
  const prep = await prepararCorrida(al, c, 'fechas', 'f:' + k.tipo + ':' + k.ambito_clave + ':' + anio, cadena(cuerpo.workflow_id)!, cadena(cuerpo.workflow_execution_id)!, ahora, modelo, esquema.hash)
  if (prep.tipo === 'ya_hecha') return { status: 200, cuerpo: { ya_hecha: true } }
  if (prep.tipo === 'en_curso') return err(409, 'E-EN-CURSO', 'ya hay una investigación en curso para este tipo (dentro de su plazo)')
  if (prep.tipo !== 'lista') {
    const cob = await al.coberturaDe(k.pais, k.tipo, k.ambito_clave, k.anio)
    await al.guardarCobertura({ ...k, estado: 'sin_fuente', intentos: cob?.intentos ?? 3 })
    return { status: 200, cuerpo: { estado: 'sin_fuente', motivo: prep.tipo === 'presupuesto_agotado' ? 'el presupuesto de planificación se agotó' : 'la investigación agotó sus 3 intentos' } }
  }
  return {
    status: 200,
    cuerpo: {
      corrida_id: prep.corrida.id, intento: prep.corrida.intento, plazo_en: prep.corrida.plazo_en, headers: { [CABECERA_SALTAR_EDITOR]: '1' },
      run_sdk: cuerpoDeRunSdk('fechas', modelo, tareaDeFechas({ tipo, ambito, anio, paginas }), esquema.valor, c.client_id, { contrato: 'fechas_especiales.v1' }),
    },
  }
}

interface FechaExtraida { fecha: string; nombre: string; alcance: string; fuente_url: string; cita_literal: string }

/** La cita comprueba la fecha: aparece LITERAL en la página descargada Y menciona el día y el mes de esa fecha. */
export function citaRespaldaLaFecha(f: FechaExtraida, texto: string): boolean {
  if (!esFechaIso(f.fecha) || !citaAparece(texto, f.cita_literal)) return false
  const [, mm, dd] = f.fecha.split('-').map(Number) as [number, number, number]
  const c = normalizar(f.cita_literal)
  return new RegExp(`\\b0?${dd}\\b`).test(c) && c.includes(MESES[mm - 1]!)
}

export async function fechasGuardar(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const pais = cadena(cuerpo.pais), tipo = cadena(cuerpo.tipo), ambito = cadena(cuerpo.ambito), anio = Number(cuerpo.anio)
  const id = cadena(cuerpo.campana_id)
  const crudo = cuerpo.resultado as { success?: boolean; structured_output?: { fechas?: FechaExtraida[] }; cost_usd?: number; error?: string; fechas?: FechaExtraida[] } | undefined
  const resultado = (crudo?.structured_output ?? crudo) as { fechas?: FechaExtraida[] } | undefined
  const paginas = Array.isArray(cuerpo.paginas) ? (cuerpo.paginas as { url?: string; texto?: string }[]) : []
  if (!pais || !tipo || !ambito || !Number.isInteger(anio) || !id || !resultado || !Array.isArray(resultado.fechas)) return err(400, 'E-CAMPOS', 'faltan campana_id, pais, tipo, ambito, anio o resultado.fechas')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const k = { pais: clave(pais), tipo: clave(tipo), ambito_clave: clave(ambito), anio }
  const corridaId = Number(cuerpo.corrida_id)
  if (Number.isInteger(corridaId)) await al.cerrarCorrida(corridaId, { estado: crudo?.success === false ? 'fallida' : 'ok', costo_usd: typeof crudo?.cost_usd === 'number' ? crudo.cost_usd : null, plazo_en: null, error: crudo?.success === false ? String(crudo.error ?? 'la llamada falló').slice(0, 400) : null })
  const porUrl = new Map(paginas.filter((p) => typeof p.url === 'string' && typeof p.texto === 'string').map((p) => [p.url as string, p.texto as string]))
  const buenas: (FechaExtraida & { hash: string })[] = []
  const descartadas: string[] = []
  for (const f of resultado.fechas) {
    const texto = porUrl.get(f.fuente_url)
    if (texto === undefined) { descartadas.push(`${f.fecha}: la página ${f.fuente_url} no se descargó`); continue }
    if (!esFechaIso(f.fecha) || Number(f.fecha.slice(0, 4)) !== anio) { descartadas.push(`${f.fecha}: fecha inválida o de otro año`); continue }
    if (!citaRespaldaLaFecha(f, texto)) { descartadas.push(`${f.fecha}: la cita no aparece literal en la página o no menciona esa fecha`); continue }
    buenas.push({ ...f, hash: createHash('sha256').update(texto).digest('hex').slice(0, 24) })
  }
  // dos dominios que coinciden → doble fuente; si el mismo nombre trae fechas distintas → pendiente (C02)
  const porFecha = new Map<string, typeof buenas>()
  for (const b of buenas) porFecha.set(b.fecha, [...(porFecha.get(b.fecha) ?? []), b])
  const porNombre = new Map<string, Set<string>>()
  for (const b of buenas) porNombre.set(normalizar(b.nombre), (porNombre.get(normalizar(b.nombre)) ?? new Set()).add(b.fecha))
  let verificadas = 0
  for (const [fecha, grupo] of porFecha) {
    const dominios = new Set(grupo.map((g) => { try { return new URL(g.fuente_url).hostname } catch { return g.fuente_url } }))
    const choca = (porNombre.get(normalizar(grupo[0]!.nombre))?.size ?? 0) > 1
    const g = grupo[0]!
    await al.guardarFechaEspecial({ pais: k.pais, tipo: k.tipo, ambito: k.ambito_clave, anio, fecha, nombre: g.nombre, alcance: g.alcance, fuente_url: g.fuente_url, cita_literal: g.cita_literal, pagina_hash: g.hash, doble_fuente: dominios.size > 1, estado: choca ? 'pendiente' : 'verificada' })
    if (!choca) verificadas++
    else descartadas.push(`${fecha}: «${g.nombre}» tiene fechas distintas en distintas fuentes (C02): queda pendiente`)
  }
  const cob = await al.coberturaDe(k.pais, k.tipo, k.ambito_clave, anio)
  await al.guardarCobertura({ ...k, estado: verificadas > 0 ? 'verificada' : (cob?.intentos ?? 1) >= 3 ? 'sin_fuente' : 'en_curso', intentos: cob?.intentos ?? 1 })
  return { status: 200, cuerpo: { verificadas, descartadas, estado: verificadas > 0 ? 'verificada' : 'sin_verificar' } }
}
