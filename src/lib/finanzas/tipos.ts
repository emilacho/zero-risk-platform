/**
 * OFICINA FINANCIERA · tipos (F2 · CC#1 · 2026-10-14) · diseño `raw/tasks/2026-10-14-DISENO-CC1-oficina-financiera-v2.md` rev. 8.
 * AGNÓSTICO: nada de este módulo nombra un rubro, ciudad, cliente, producto, evento ni día. Todo lo que depende del cliente entra por `Entrada` (parámetros opcionales con rango).
 */
export type TipoDeCifra = 'dato' | 'supuesto' | 'sin_base'

/** Una cifra del bloque: nunca una celda vacía (si falta, `sin_base` con motivo). */
export interface Cifra {
  valor: number | null
  min?: number
  max?: number
  tipo: TipoDeCifra
  fuente: string
  fecha?: string
  formula?: string
  motivo?: string
}

export interface Referencia {
  /** costo por resultado de mercado (rango). La `base` por omisión es el punto medio */
  min: number
  max: number
  base?: number
  tipo: 'dato' | 'supuesto'
  fuente: string
  fecha?: string
}

export interface Paso { tasa: number; fuente?: string }
export interface Canal { canal: string; peso: number; piso_diario: number; activo?: boolean; condicion?: string }
export interface Produccion { fraccion?: number; monto?: number; origen: 'plan' | 'supuesto' }
export interface EventoAlterno { nombre: string; referencia: Referencia }

export interface Entrada {
  /** resultados FINALES (ventas, citas atendidas, altas…) por semana: la unidad de todo el cálculo */
  meta_por_semana: number
  pasos?: Paso[]
  ticket?: number | null
  margen?: number | null
  periodos?: number | null
  costo_entrega?: number | null
  referencia: Referencia | null
  arranque?: { min: number; base: number; max: number }
  dias_activos_por_semana: number
  horizonte_dias?: number | null
  ciclo_dias?: number | null
  /** parte de Meta+IG que va a marca (la trae el plan; si no, 0,20 «supuesto») */
  marca?: number | null
  produccion?: Produccion | null
  canales?: Canal[]
  evento_alterno?: EventoAlterno | null
  /** porcentaje de la casa sobre la contribución (fila de `settings`); 0,70 por omisión */
  h?: number
  /** piso de plataforma por conjunto y por día activo (0 = sin piso conocido) */
  piso_plataforma?: number
  /** factor por semana sobre la pauta base (0 = sin pauta de rendimiento); por omisión 12 semanas */
  calendario?: number[]
}

export type Veredicto = 'sigo' | 'ajusto' | 'ajusto_recorte' | 'paro'

export interface FilaDeReparto { canal: string; monto: number; activo: boolean; motivo?: string }

export interface Bloque {
  ok: true
  cifras: Record<string, Cifra>
  veredictos: { cota_baja: Veredicto; base: Veredicto; cota_alta: Veredicto; sens_menos: Veredicto; sens_mas: Veredicto }
  costos: { cota_baja: number; base: number; cota_alta: number }
  techo: { por_resultado: number; ajusto_hasta: number; recorte_desde: number; paro_desde: number; sin_valor_monetario: boolean }
  aprendizaje: { resultados_por_semana: number; diario: number; minimo_por_conjunto: number; conjuntos: number; dilucion: boolean; limitado: boolean }
  alterno: null | { nombre: string; costo: number; minimo_por_conjunto: number; conjuntos: number }
  reparto: { total_mes: number; meta_ig: number; marca: number; rendimiento: number; produccion: { monto: number; fraccion: number; origen: string }; otros: FilaDeReparto[]; sumado_a_meta_ig: number; parte_meta_ig: number }
  calendario: { por_semana: number[]; rendimiento_total: number; meta_ig_total: number; produccion_total: number; total: number; prueba: { diez: number; quince: number; veinte: number } }
  primera_lectura_dia: number
  costo_por_venta: number
  alertas: string[]
  /** plan v3 · V7: la meta semanal en que el plan se paga (supuesto) y si la meta actual la cubre */
  equilibrio: Equilibrio
  /** R14: cuántas cifras son dato, supuesto o «sin base»; «firmado» no significa «verdadero» */
  confianza: Confianza
}
export interface Equilibrio {
  meta_de_equilibrio_semana: number | null
  meta_actual: number
  cubre: boolean | null
  meta_sugerida_semana: number | null
  contribucion_por_venta: number | null
  motivo: string | null
}
export interface Confianza { datos: number; supuestos: number; sin_base: number; total: number; nivel: 'confirmado' | 'parcial' | 'casi_todo_supuesto' | 'sin_base'; manda_sin_base: boolean; texto: string }
export interface Rechazo { ok: false; errores: string[] }
export type Resultado = Bloque | Rechazo
