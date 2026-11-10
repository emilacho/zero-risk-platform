/**
 * Los contextos de práctica con que se sacó la FOTO de main (760b1fc) de las tareas de la oficina SIN perfil.
 * La foto (`tarea-sin-perfil.foto-de-main.json`) y la prueba usan ESTOS mismos contextos: si cambian, la foto se vuelve a sacar desde main.
 * Dos clientas de práctica de rubros distintos: una cafetería en Madrid (pieza) y un proveedor industrial B2B en Monterrey (láminas).
 */
import type { ContextoDePedido } from '../../oficina/pedidos'
import type { ContextoLaminas } from '../../oficina/pedidos-laminas'

export const CLAVES_DE_TEXTO = ['direccion_visual', 'prompts', 'mirar', 'texto', 'revision_jefe', 'corrige', 'decide', 'reimagen_prompts', 'decide_imagen'] as const
export const CLAVES_DE_LAMINAS = ['direccion_visual', 'narrativa', 'prompts', 'mirar', 'texto', 'laminas', 'revision_jefe', 'corrige_texto', 'decide_texto', 'ajusta_laminas', 'corrige_laminas', 'decide_laminas', 'reimagen_prompts', 'decide_imagen', 'corrige_estructura', 'decide_estructura'] as const

/** con plan y sin plan: la sección del perfil va justo después del plan, así que los dos caminos cuentan */
export const contextoDePieza = (conPlan: boolean): ContextoDePedido => ({
  fuentes: { cliente_nombre: 'Cafetería de práctica', manual_texto: 'manual de la cafetería', plan_texto: conPlan ? 'plan de 90 días de la cafetería' : null, fuentes: { precios: ['café 1,50 €'] }, propios: { telefonos: ['+34 600 000 001'], handles: ['@cafe.practica'] } },
  brief: { id: 'BRF-1', texto: 'brief del post', red: 'instagram', formato: 'foto_1x1' }, proporcion: '1:1', estado: { fichas: [] }, reglas: { obligatorio: [], prohibido: [] }, imagenesAMirar: [], art: () => undefined,
}) as unknown as ContextoDePedido

export const contextoDeLaminas = (conPlan: boolean): ContextoLaminas => ({
  brief: { id: 'BRF-9', texto: 'brief del carrusel', red: 'linkedin', formato: 'carrusel' },
  fuentes: { manual_texto: 'manual del proveedor', plan_texto: conPlan ? 'plan de 90 días del proveedor' : '', propios: { telefonos: [], handles: [] }, fuentes: { precios: [] } },
  estado: { fichas: [] }, art: () => undefined, limites: {}, elementos: [], plataforma: 'linkedin', familia: 'carrusel_mesa', refsValidos: [], refsGeneradas: [], sinFoto: false, png: [],
}) as unknown as ContextoLaminas
