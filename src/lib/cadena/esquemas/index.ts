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

/**
 * 31-oct (nuevo orden · T1): el calendario por tanda con la IDEA DE MESA por pieza (`idea_de_mesa` = el id de la idea del banco del concepto, `C<fase>-I<nn>`, o «» si la fila no realiza ninguna).
 * Mismas prohibiciones que v1 (sin fecha, sin total). La cadena de hoy sigue con v1; v2 lo usa el paso calendario cuando la palanca `nuevo_orden` está encendida (T3).
 * El `brief_fila.v1` (brief por publicación) se retiró: nadie lo usa; el brief es UNO por campaña (`brief_creativo.v1`, texto) y la hoja la escribe código.
 */
export const ESQUEMA_CALENDARIO_TANDA_V2 = objeto({
  piezas: lista(objeto({
    semana: entero, dia_semana: entero, slot: texto, hora: texto, red: texto, formato: texto, pilar: texto, tema: texto, sede: texto,
    requiere_abierto: bool, depende_de: listaDeTexto, pieza_fija: texto, idea_de_mesa: texto,
    datos: lista(objeto({ dato: texto, valor: texto, clase: { enum: ['alto', 'medio', 'bajo'] }, ref: texto, nivel: { enum: ['F0', 'F1', 'F2', 'F3'] }, opcional: bool })),
    pendientes: listaDeTexto,
  })),
  ajustes_al_patron: lista(objeto({ semana: entero, slot: texto, accion: { enum: ['omitir', 'mover', 'agregar'] }, motivo: texto })),
})

/** solo se usa si el cliente declaró tipos de fechas · `tipo`, `ambito` y `alcance` son texto libre: el esquema no fija categorías de ningún rubro */
export const ESQUEMA_FECHAS_ESPECIALES = objeto({
  tipo: texto, ambito: texto, anio: entero,
  fechas: lista(objeto({ fecha: texto, nombre: texto, alcance: texto, fuente_url: texto, cita_literal: texto })),
  no_encontrado: listaDeTexto,
})

/**
 * 31-oct (FIRMA de Emilio · gancho de video corto · UNA voz): la salida de `marketing_short_video_editing_coach` con el método `short-video-scripter` (`metodos.ts`).
 * 2–3 ganchos de familias con nombre + el elegido; la puerta de retención por tramos (0-2s · 2-5s · 5-15s · cierre) con línea hablada, texto en pantalla y plano;
 * el cierre (bucle o llamada); el aviso de contenido sintético con su decisión explícita; datos con `ref` y pendientes. Spec para grabar: nada se renderiza ni se publica.
 * T8 lo cablea sobre la hoja; aquí vive el contrato para que la tarea y el esquema nazcan juntos (M1: contrato antes del primer smoke).
 */
export const ESQUEMA_GANCHO_DE_VIDEO = objeto({
  ganchos: lista(objeto({ familia: texto, linea_hablada: texto, texto_en_pantalla: texto })),
  elegido: entero,
  por_que: texto,
  tramos: lista(objeto({ ventana: { enum: ['0-2s', '2-5s', '5-15s', 'cierre'] }, linea_hablada: texto, texto_en_pantalla: texto, plano: texto })),
  cierre: objeto({ tipo: { enum: ['bucle', 'llamada'] }, llamada: texto }),
  aviso_sintetico: objeto({ incluir: bool, linea: texto, motivo: texto }),
  datos: lista(objeto({ dato: texto, valor: texto, ref: texto })),
  pendientes: listaDeTexto,
})

export const ESQUEMAS = {
  'estrategia.v1': ESQUEMA_ESTRATEGIA,
  'calendario_tanda.v1': ESQUEMA_CALENDARIO_TANDA,
  'calendario_tanda.v2': ESQUEMA_CALENDARIO_TANDA_V2,
  'fechas_especiales.v1': ESQUEMA_FECHAS_ESPECIALES,
  'gancho_video.v1': ESQUEMA_GANCHO_DE_VIDEO,
} as const
