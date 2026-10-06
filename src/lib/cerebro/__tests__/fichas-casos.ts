/** Fichas de PRUEBA para el paso 3: se SUMAN a la base de ejemplo (la base de ejemplo sola no las trae, para que nada de lo ya medido cambie). */
import { A, AHORA, B, Z, tablasDeLaBase, type Tablas } from './casos'

const DIA = 86_400_000
export const dias = (n: number): string => new Date(AHORA.getTime() - n * DIA).toISOString()
export const hace = dias

/** una ficha con todas sus columnas (las que el lector pide) y lo mínimo por defecto */
export function ficha(id: string, cliente: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, client_id: cliente, ingreso_id: 'ing-1', ref: `estable-${id}`, clase: 'servicio', titulo: `Ficha ${id}`, que_es: `Qué es la ficha ${id}`, contenido: `Texto completo de la ficha ${id}. `.repeat(6),
    archivo_nombre: null, archivo_tipo: null, archivo_enlace: null, archivo_bytes: null, origen: 'dueno', fecha_fuente: dias(5), reconfirmado_en: null, plazo: null, vigente_hasta: null,
    version_de: null, retirada_en: null, motivo_retirada: null, producto: null, sede: null, propiedad: 'propia', porque: null, descartada: false, residual: false, creado_en: dias(5), prueba: false,
    ...extra,
  }
}

export function fichasDeEjemplo(): Array<Record<string, unknown>> {
  return [
    ficha('fa-1', A, { clase: 'servicio_nuevo', titulo: 'Servicio nuevo del dueño', plazo: 'catalogo_y_direccion', producto: ['Servicio uno'], sede: 'norte' }),
    // vencida: fecha explícita del material ya pasada
    ficha('fa-2', A, { clase: 'oferta', titulo: 'Oferta que ya pasó', origen: 'su_fuente', fecha_fuente: dias(40), vigente_hasta: dias(10) }),
    // reconfirmada hace 3 días: el plazo de 7 se cuenta desde la reconfirmación, no desde los 40 días de la fuente
    ficha('fa-3', A, { clase: 'horario', titulo: 'Horario reconfirmado', origen: 'plataforma', plazo: 'precio_oferta_horario', fecha_fuente: dias(40), reconfirmado_en: dias(3) }),
    // plazo que no está en la lista: sin plazo
    ficha('fa-4', A, { clase: 'nota', titulo: 'Plazo inventado', plazo: 'plazo_que_no_existe', fecha_fuente: dias(400) }),
    // dos versiones de la misma cosa: la 2 reemplaza a la 1
    ficha('fa-5', A, { clase: 'politica', titulo: 'Política · versión vieja', fecha_fuente: dias(30) }),
    ficha('fa-6', A, { clase: 'politica', titulo: 'Política · versión nueva', fecha_fuente: dias(2), version_de: 'fa-5' }),
    ficha('fa-7', A, { clase: 'promo', titulo: 'Promoción retirada', retirada_en: dias(2), motivo_retirada: 'ya no está en su fuente', plazo: 'precio_oferta_horario', fecha_fuente: dias(60) }),
    ficha('fa-8', A, { clase: 'basura', titulo: 'Descartada por el modelo', descartada: true }),
    // un archivo sin texto: solo su ficha
    ficha('fa-9', A, { clase: 'video', titulo: 'Video del local', contenido: null, archivo_nombre: 'local.mp4', archivo_tipo: 'video/mp4', archivo_bytes: 5_000_000, archivo_enlace: 'https://almacen.example/local.mp4' }),
    ficha('fa-10', A, { clase: 'opinion', titulo: 'Texto de un tercero', origen: 'tercero', propiedad: 'ajena' }),
    ficha('fa-11', A, { clase: 'sin_clasificar', titulo: 'Sin clasificar', propiedad: 'incierta', residual: true }),
    // marcada como PRUEBA: no existe para la lista
    ficha('fa-12', A, { clase: 'prueba', titulo: 'Ficha de prueba', prueba: true }),
    // la MISMA foto que ya vive en client_social_images (im-1): no se duplica
    ficha('fa-dup', A, { clase: 'foto', titulo: 'Foto repetida', contenido: null, archivo_nombre: 'im-1.jpg', archivo_tipo: 'image/jpeg', archivo_enlace: 'https://bucket/im-1.jpg' }),
    // de OTROS clientes
    ficha('fz-1', Z, { titulo: 'Ficha de Z' }),
    ficha('fb-1', B, { titulo: 'Ficha de B' }),
  ]
}

export function tablasConFichas(): Tablas {
  return { ...tablasDeLaBase(), cerebro_fichas: fichasDeEjemplo() }
}
