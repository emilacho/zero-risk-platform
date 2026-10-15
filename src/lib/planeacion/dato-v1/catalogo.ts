/**
 * PLAN v3 · V2 · EL SNAPSHOT DEL CATÁLOGO (diseño §4.3). «Armar el paquete» lee las cinco tablas UNA vez por corrida y mete un snapshot con `version` y `huella`:
 * los chequeos y el redactor leen DEL SNAPSHOT, nunca de la base → la corrida es reproducible y un alta no cambia una corrida en curso.
 * Aquí solo se arma y se consulta; la lectura de la base es de V3 (`/api/planeacion/catalogo`).
 */
import { createHash } from 'node:crypto'
import type { Via } from './tipos'

export interface FilaDeFuente { fuente_id: string; proveedor: string; funcion: string; via: Via; provee?: string[]; alcance?: string | null; criticidad: 'critica' | 'normal' | 'baja'; reintentos?: number; plazo_s: number; tope_usd: number; forma?: string[]; moldes_de_ensayo?: string[]; identidad_campos?: string[]; da_ausencia_con?: string | null; version?: number }
export interface FilaDeTipo { tipo_id: string; atributo_cerebro?: string | null; clase_dato?: 'atributo' | 'acumula'; unidad: string; moneda_requerida?: boolean; rango?: { min?: number; max?: number } | null; frescura_limite_h: number; critico?: boolean; tolerancia_redondeo?: number; n_minimo?: number; periodo_requerido?: boolean; comparable_con?: string[]; via_preferida?: Via; version?: number }
export interface FilaDeRegla { regla_id: string; clase: string; operador: string; parametros: Record<string, unknown>; aplica_a: { fuente?: string; tipo?: string }; severidad: 'bloquea' | 'avisa'; pais?: string | null; version?: number }
export interface FilaDeLexico { lexico_id: string; idioma: string; grupo: string; terminos: string[]; pais?: string | null; version?: number }
export interface FilaDeTope { tope_id: string; tramo: string; fuente_id?: string | null; usd: number; contador: string; version?: number }
export interface FilasDelCatalogo { fuentes: FilaDeFuente[]; tipos: FilaDeTipo[]; reglas: FilaDeRegla[]; lexico: FilaDeLexico[]; topes: FilaDeTope[] }

export interface CatalogoSnapshot {
  version: string
  huella: string
  fuente(id: string): FilaDeFuente | undefined
  tipo(id: string): FilaDeTipo | undefined
  /** reglas de una clase que aplican a una fuente o a un tipo */
  reglas(clase: string, a: { fuente?: string; tipo?: string }): FilaDeRegla[]
  /** un parámetro del catálogo (fila `clase=parametro`), por `regla_id` */
  parametro<T = unknown>(regla_id: string, campo: string, porOmision: T): T
  /** moneda sugerida por país (G3): SOLO una fila del catálogo; sale rotulada `supuesto`, nunca `medido` */
  monedaDePais(pais: string | null | undefined): { moneda: string; rotulo: string } | null
  terminos(grupo: string, idioma?: string): string[]
  tope(tramo: string): number | null
  filas: FilasDelCatalogo
}

/** `version` = la mayor versión de fila vigente (texto) · `huella` = sha256 del contenido canónico: dos corridas con la misma huella leyeron el mismo catálogo */
export function crearSnapshot(filas: FilasDelCatalogo): CatalogoSnapshot {
  const orden = <T extends Record<string, unknown>>(xs: T[], k: keyof T): T[] => [...xs].sort((a, b) => String(a[k]).localeCompare(String(b[k])))
  const canon = {
    fuentes: orden(filas.fuentes as unknown as Record<string, unknown>[], 'fuente_id'), tipos: orden(filas.tipos as unknown as Record<string, unknown>[], 'tipo_id'),
    reglas: orden(filas.reglas as unknown as Record<string, unknown>[], 'regla_id'), lexico: orden(filas.lexico as unknown as Record<string, unknown>[], 'lexico_id'),
    topes: orden(filas.topes as unknown as Record<string, unknown>[], 'tope_id'),
  }
  const huella = createHash('sha256').update(JSON.stringify(canon)).digest('hex').slice(0, 16)
  const maxV = Math.max(1, ...[...filas.fuentes, ...filas.tipos, ...filas.reglas, ...filas.lexico, ...filas.topes].map((f) => f.version ?? 1))
  const porFuente = new Map(filas.fuentes.map((f) => [f.fuente_id, f]))
  const porTipo = new Map(filas.tipos.map((t) => [t.tipo_id, t]))
  return {
    version: `v${maxV}`, huella, filas,
    fuente: (id) => porFuente.get(id),
    tipo: (id) => porTipo.get(id),
    reglas: (clase, a) => filas.reglas.filter((r) => r.clase === clase && ((a.fuente && r.aplica_a.fuente === a.fuente) || (a.tipo && r.aplica_a.tipo === a.tipo))),
    parametro: <T,>(id: string, campo: string, porOmision: T): T => {
      const r = filas.reglas.find((x) => x.regla_id === id && x.clase === 'parametro')
      const v = r?.parametros?.[campo]
      return (v === undefined ? porOmision : v) as T
    },
    monedaDePais: (pais) => {
      if (!pais) return null
      const quita = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
      const p = quita(pais)
      // la ficha del cliente trae el país como NOMBRE («Ecuador») o como código («EC»): la fila lo admite por su código o por sus `nombres`
      const r = filas.reglas.find((x) => {
        if (x.clase !== 'moneda_pais') return false
        const nombres = Array.isArray(x.parametros?.nombres) ? (x.parametros.nombres as unknown[]).filter((n): n is string => typeof n === 'string').map(quita) : []
        return quita(x.pais ?? '') === p || nombres.includes(p)
      })
      const m = r?.parametros?.moneda
      return typeof m === 'string' ? { moneda: m, rotulo: typeof r?.parametros?.rotulo === 'string' ? (r.parametros.rotulo as string) : `${m} por omisión del país: nadie la declaró` } : null
    },
    terminos: (grupo, idioma = 'es') => filas.lexico.filter((l) => l.grupo === grupo && l.idioma === idioma).flatMap((l) => l.terminos),
    tope: (tramo) => filas.topes.find((t) => t.tramo === tramo && !t.fuente_id)?.usd ?? null,
  }
}
