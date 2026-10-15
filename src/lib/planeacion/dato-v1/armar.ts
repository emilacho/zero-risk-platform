/**
 * PLAN v3 · CONEXIÓN · ARMAR EL `dato.v1` DE UN CLIENTE (CC#1 · 15-oct). Junta lo que YA existe (V1 catálogo · V14 lector del cerebro · V2 normalizador · V4 semilla compacta · V3 planificador de relleno)
 * en UNA llamada que el flujo de planeación hace detrás de `plan_v3:true`. SOLO LEE (US$ 0: sin modelo, sin Apify, sin escribir): cerebro (fichas vivas) → crudo (`apify_raw` filtrado por la compuerta del `portero`) → normaliza.
 *
 * 🔴 `dry_run`: ausente = REAL (como la sala); solo `true` es ensayo (todo `de_ensayo`); un valor que no es booleano se rechaza.
 * 🔴 NO sale a Apify: el relleno que el catálogo permitiría va en `relleno_plan` como INFORMACIÓN (quien lo ejecute es el brazo, con su tope); aquí nunca se gasta.
 * 🔴 Una lectura que FALLA no es «no hay nada»: devuelve `{ ok:false }` y el flujo sigue como hoy (apagado = idéntico).
 */
import { contextoDelCliente } from '../../portero-alimenta/alimentar'
import { leerCatalogo, type Db as DbCatalogo } from '../catalogo/leer'
import type { CatalogoSnapshot } from './catalogo'
import { crudoAEntradas, faltantesDeLasVias, fichasAEntradas, leerCrudo, leerFichasVivas, type Db } from './lector-cerebro'
import { normalizarDatos } from './normalizador'
import { planificarRelleno, type PlanDeRelleno } from './relleno'
import { armarSemillaCompacta, type SemillaCompacta } from './semilla-compacta'
import type { DatoV1, EntradaCruda } from './tipos'

export interface EntradaDelDato {
  client_id: unknown
  /** ausente = REAL; solo `true` es ensayo; no booleano = 400 */
  dry_run?: unknown
  /** la señal de V8/V9 (`relleno_permitido`): sin ella, el planificador no autoriza NADA */
  relleno_permitido?: unknown
  /** lo que el cerebro todavía no tiene (V8/V9 `huecos_tipos`): con huecos, el relleno solo puede ir a eso o a lo vencido */
  huecos_tipos?: unknown
}

export type ResultadoDelDato =
  | {
      ok: true
      plan_version: 'v3'
      dry_run: boolean
      catalogo_version: string
      catalogo_huella: string
      datos: DatoV1[]
      criticos: string[]
      descartados: Array<{ fuente_id: string; tipo_id: string; motivo: string; identidad: string }>
      semilla: SemillaCompacta
      lexico: Record<string, string[]>
      relleno_plan: PlanDeRelleno
      resumen: { del_cerebro: number; del_crudo: number; datos: number; huecos: number; descartados: number; ruido: number; repetidas: number; faltantes: string[]; cubiertos: Array<{ tipo_id: string; via: string }> }
      recolectado_en: string
    }
  | { ok: false; error: 'entrada_invalida' | 'dry_run_no_booleano' | 'catalogo_no_aplicado' | 'catalogo_incompleto' | 'lectura_fallida'; detalle: string }

const GRUPOS_DE_LEXICO = ['verificacion', 'ausencia', 'ausencia_excluye', 'supuesto', 'dominio', 'periodo'] as const

export function lexicoDe(snap: CatalogoSnapshot): Record<string, string[]> {
  return Object.fromEntries(GRUPOS_DE_LEXICO.map((g) => [g, snap.filas.lexico.filter((l) => l.grupo === g).flatMap((l) => l.terminos)]))
}

export async function armarDatoV1(db: Db & DbCatalogo, e: EntradaDelDato, ahora: Date = new Date()): Promise<ResultadoDelDato> {
  if (typeof e.client_id !== 'string' || !e.client_id.trim()) return { ok: false, error: 'entrada_invalida', detalle: '`client_id` es obligatorio' }
  if (e.dry_run !== undefined && typeof e.dry_run !== 'boolean') return { ok: false, error: 'dry_run_no_booleano', detalle: '`dry_run` solo puede ser true o false (ausente = real)' }
  const client_id = e.client_id.trim()
  const dry = e.dry_run === true

  const cat = await leerCatalogo(db)
  if (!cat.ok) return { ok: false, error: cat.causa, detalle: cat.detalle }
  const snap = cat.snapshot

  const fichas = await leerFichasVivas(db, client_id)
  if (!fichas.ok) return { ok: false, error: 'lectura_fallida', detalle: fichas.error }
  const crudo = await leerCrudo(db, client_id)
  if (!crudo.ok) return { ok: false, error: 'lectura_fallida', detalle: crudo.error }

  const delCerebro: EntradaCruda[] = fichasAEntradas(fichas.fichas, snap).entradas
  const delCrudo: EntradaCruda[] = crudoAEntradas(crudo.filas, crudo.cliente, crudo.sedes, snap).entradas

  // qué falta por vías (cerebro → crudo → relleno). El relleno solo es INFORMACIÓN aquí.
  // «requerido» = lo que alguna fuente del catálogo puede ir a buscar, o es crítico. Lo OPCIONAL del cerebro (las ventas del punto de venta) no es una falta en un cliente que no lo tiene:
  // ese cliente sale IGUAL que hoy (sin error, sin bloqueo y sin dato inventado).
  const provistos = new Set(snap.filas.fuentes.flatMap((f) => f.provee ?? []))
  const requeridos = snap.filas.tipos.filter((t) => provistos.has(t.tipo_id) || t.critico === true).map((t) => t.tipo_id)
  const v = faltantesDeLasVias({ snapshot: snap, ahora, requeridos, del_cerebro: delCerebro, del_crudo: delCrudo })
  const huecos = Array.isArray(e.huecos_tipos) ? (e.huecos_tipos as unknown[]).filter((x): x is string => typeof x === 'string') : null
  const faltantes = huecos && huecos.length ? v.faltantes.filter((f) => f.motivo === 'vencida' || huecos.includes(f.tipo_id)) : v.faltantes
  const relleno = planificarRelleno({ snapshot: snap, faltantes, cerebro_listo: e.relleno_permitido === true })

  // lo que el cerebro cubre fresco no se lee otra vez del crudo
  const cubiertosPorCerebro = new Set(v.cubiertos.filter((c) => c.via === 'cerebro').map((c) => c.tipo_id))
  const crudoUtil = delCrudo.filter((x) => !cubiertosPorCerebro.has(x.tipo_id))

  const cfg = (crudo.cliente.config ?? {}) as { moneda?: unknown; currency?: unknown }
  const moneda = typeof cfg.moneda === 'string' ? cfg.moneda : typeof cfg.currency === 'string' ? cfg.currency : null
  const pais = typeof crudo.cliente.country === 'string' ? crudo.cliente.country : null
  const paquete = normalizarDatos(
    [...delCerebro, ...crudoUtil],
    { ahora, ...(dry ? { dry_run: true } : {}), cliente: contextoDelCliente(crudo.cliente as never, crudo.sedes as never), pais, moneda_declarada: moneda },
    snap,
  )
  const semilla = armarSemillaCompacta(paquete.datos, { snapshot: snap })
  return {
    ok: true,
    plan_version: 'v3',
    dry_run: dry,
    catalogo_version: snap.version,
    catalogo_huella: snap.huella,
    datos: paquete.datos,
    criticos: snap.filas.tipos.filter((t) => t.critico === true).map((t) => t.tipo_id),
    descartados: paquete.descartados as never,
    semilla,
    lexico: lexicoDe(snap),
    relleno_plan: relleno,
    resumen: {
      del_cerebro: delCerebro.length, del_crudo: delCrudo.length, datos: paquete.datos.length,
      huecos: paquete.datos.filter((d) => d.origen === 'hueco').length, descartados: paquete.descartados.length, ruido: paquete.ruido, repetidas: paquete.repetidas,
      faltantes: v.faltantes.map((f) => f.tipo_id), cubiertos: v.cubiertos,
    },
    recolectado_en: ahora.toISOString(),
  }
}
