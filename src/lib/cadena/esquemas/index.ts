/**
 * Esquemas de salida estructurada de la cadena (diseño v2 §9.4) · JSON Schema REAL (no la forma abreviada del diseño · CC#3 condición 7).
 * Una sola fuente: la ruta `/api/cadena/<paso>` (acción `preparar`) devuelve el esquema completo y el flujo n8n no lo duplica.
 * Subconjunto que acepta `salida-estructurada.ts`: nada de minLength/maxLength/minimum/maximum/pattern/format/$ref; eso se valida en el código.
 * Todo campo es obligatorio (el texto vacío significa «ninguno»): el modo estructurado se comporta mejor sin campos opcionales.
 * Cambios respecto al diseño por las correcciones de Emilio: `origen` = plan | estrategia | alta y `pedir_a` = portero | sistema (nunca el dueño).
 */
const texto = { type: 'string' } as const
const entero = { type: 'integer' } as const
const bool = { type: 'boolean' } as const
const listaDeTexto = { type: 'array', items: texto } as const
const objeto = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const lista = (items: unknown) => ({ type: 'array', items })

export const ESQUEMA_ESTRATEGIA = objeto({
  canales: lista(objeto({
    red: texto, rol: { enum: ['principal', 'replica', 'no'] }, motivo: texto,
    frecuencia: objeto({ feed_semana: entero, historias_semana: entero, anuncios_semana: entero }),
    formatos: listaDeTexto,
  })),
  excluidos: lista(objeto({ red: texto, cita_plan: texto })),
  pilares: lista(objeto({ clave: texto, nombre: texto, pct: entero })),
  fases: lista(objeto({ clave: texto, dia_desde: entero, dia_hasta: entero, objetivo: texto, cita_plan: texto })),
  hitos: lista(objeto({ clave: texto, dia: entero, tipo: { enum: ['revision', 'lanzamiento', 'corte'] }, cita_plan: texto })),
  dependencias: lista(objeto({ antes: texto, despues: texto, regla: texto, cita_plan: texto })),
  fechas_que_importan: lista(objeto({ tipo: texto, ambito: texto, origen: { enum: ['plan', 'estrategia', 'alta'] }, cita_plan: texto, motivo: texto })),
  patron_semanal: lista(objeto({ slot: texto, dia_semana: entero, hora: texto, red: texto, formato: texto, pilar: texto, requiere_abierto: bool, sede: texto })),
  piezas_fijas: lista(objeto({ clave: texto, semana: entero, slot: texto, tema: texto, refs: listaDeTexto })),
  pendientes: lista(objeto({ clave: texto, que_falta: texto, desbloquea: listaDeTexto, pedir_a: { enum: ['portero', 'sistema'] } })),
  alertas: lista(objeto({ texto, ref: texto })),
})

/** SIN campo de fecha ni de total: el modelo NO puede escribirlos (el formato lo impide, no solo la indicación). */
export const ESQUEMA_CALENDARIO_TANDA = objeto({
  piezas: lista(objeto({
    semana: entero, dia_semana: entero, slot: texto, hora: texto, red: texto, formato: texto, pilar: texto, tema: texto, sede: texto,
    requiere_abierto: bool, depende_de: listaDeTexto, pieza_fija: texto,
    datos: lista(objeto({ dato: texto, valor: texto, clase: { enum: ['alto', 'medio', 'bajo'] }, ref: texto, nivel: { enum: ['F0', 'F1', 'F2', 'F3'] }, opcional: bool })),
    pendientes: listaDeTexto,
  })),
  ajustes_al_patron: lista(objeto({ semana: entero, slot: texto, accion: { enum: ['omitir', 'mover', 'agregar'] }, motivo: texto })),
})

/** los 16 campos del brief de un entregable (REFERENCIA-el-brief-de-un-entregable.md §2) */
export const ESQUEMA_BRIEF_FILA = objeto({
  fila_id: texto,
  briefs: lista(objeto({
    identificador: texto, que_es: texto, de_que_parte_del_plan_sale: texto, objetivo_en_la_plataforma: texto,
    segmento: objeto({ es: texto, no_es: texto }),
    protagonista: texto, hipotesis: texto, limites_plataforma: texto, vocabulario_obligatorio: listaDeTexto, prohibido: listaDeTexto,
    sintaxis: texto, visual: texto, llamado: texto,
    variantes: objeto({ cantidad: entero, que_varia: texto }),
    negativos: listaDeTexto, aprueba_y_para_cuando: texto,
    declarado_pendiente: lista(objeto({ campo: texto, que_falta: texto })),
    muestra_visual: objeto({ piezas_miradas: entero, fotos: entero, videos: entero, no_se_pudo_observar: texto }),
  })),
})

/** solo se usa si el cliente declaró tipos de fechas · `tipo`, `ambito` y `alcance` son texto libre: el esquema no fija categorías de ningún rubro */
export const ESQUEMA_FECHAS_ESPECIALES = objeto({
  tipo: texto, ambito: texto, anio: entero,
  fechas: lista(objeto({ fecha: texto, nombre: texto, alcance: texto, fuente_url: texto, cita_literal: texto })),
  no_encontrado: listaDeTexto,
})

export const ESQUEMAS = {
  'estrategia.v1': ESQUEMA_ESTRATEGIA,
  'calendario_tanda.v1': ESQUEMA_CALENDARIO_TANDA,
  'brief_fila.v1': ESQUEMA_BRIEF_FILA,
  'fechas_especiales.v1': ESQUEMA_FECHAS_ESPECIALES,
} as const
