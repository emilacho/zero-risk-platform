/**
 * LA JEFATURA REVISA CON LA MISMA CARPETA QUE EL REDACTOR · 01-nov · encargo de Emilio «jefatura con carpeta y sin límites de tamaño» (punto 1).
 * Causa: «JEF · armar» mandaba a la jefatura solo el manual, la ficha y lo que dijo el dueño. El redactor, además, lee la CARPETA del cliente
 * (resumen vivo + informes de la mesa de análisis) y las páginas del sitio; el revisor no, y por eso marcó como falta cosas que el cerebro sí sabía.
 * Qué hace: en «JEF · armar» (plan) suma al `contexto` tres documentos ENTEROS (sin recorte propio), leídos del mismo paquete que recibe el redactor:
 *   · «Carpeta del cliente · resumen vivo»  · «Carpeta del cliente · informes de la mesa de análisis»  · «Páginas del sitio del cliente».
 * Si no hay carpeta vigente o ninguna página, lo DECLARA en un documento («sin carpeta vigente…») en vez de omitirlo callado.
 * Solo toca ese nodo. La plataforma ya recibe `payload.contexto` sin tope (revision/contrato.ts) y lo pega entero (revision/pedidos.ts).
 */
import { cambiarCodigo } from './lib.mjs'

export const BLOQUE_CARPETA_DE_LA_JEFATURA = `// 01-nov · LA JEFATURA REVISA CON LA MISMA CARPETA QUE EL REDACTOR (encargo de Emilio): resumen vivo + informes + páginas del sitio, ENTEROS (sin recorte propio).
// Se lee del mismo paquete que recibe «Redactor (B4)»; si no se puede leer, se DECLARA en un documento (nunca se omite callado).
const paquete = (() => { for (const nn of ['FIN · devolver el paquete', 'FIN · ¿trae finanzas_id?']) { try { const j = $(nn).first().json; if (j && typeof j === 'object' && Array.isArray(j.material)) return j } catch (x) {} } return null })()
const material = paquete ? paquete.material : []
let carpeta = null
for (const m of material) { if (m && m.brazo === 'cerebro' && m.datos && typeof m.datos === 'object' && m.datos.contexto_del_cliente && typeof m.datos.contexto_del_cliente === 'object') carpeta = m.datos.contexto_del_cliente }
const rv = carpeta && carpeta.resumen_vivo && typeof carpeta.resumen_vivo === 'object' ? carpeta.resumen_vivo : {}
const resumenVivo = String(rv.texto || '').trim() || (Array.isArray(rv.sedes) ? rv.sedes.map((s) => String((s && s.texto) || '').trim()).filter(Boolean).join('\\n\\n') : '')
const informes = carpeta && Array.isArray(carpeta.informes) ? carpeta.informes.filter((i) => i && typeof i === 'object' && String(i.texto || '').trim()) : []
const paginas = material.filter((m) => m && m.estado === 'trajo' && m.brazo !== 'cerebro' && /sitio|web|pagina|página|menu|menú|carta|tienda/i.test(String(m.objetivo || '')) && m.datos)
if (resumenVivo) contexto.push({ titulo: 'Carpeta del cliente · resumen vivo', texto: resumenVivo, funcion: 'sedes, horarios y canales actuales del negocio; manda sobre datos viejos de otros documentos' })
if (informes.length) contexto.push({ titulo: 'Carpeta del cliente · informes de la mesa de análisis', texto: informes.map((i) => (i.titulo ? '### ' + String(i.titulo) + '\\n' : '') + String(i.texto)).join('\\n\\n'), funcion: 'lo que el redactor leyó de la investigación' })
if (paginas.length) contexto.push({ titulo: 'Páginas del sitio del cliente', texto: paginas.map((m) => '### ' + String(m.objetivo || 'sitio') + (m.fuente ? ' (' + String(m.fuente) + ')' : '') + '\\n' + JSON.stringify(m.datos)).join('\\n\\n'), funcion: 'precios, menú, canales de pedido y textos publicados en el sitio' })
if (!resumenVivo && !informes.length) contexto.push({ titulo: 'Carpeta del cliente', texto: 'SIN CARPETA VIGENTE: el redactor no tuvo resumen vivo ni informes de la mesa de análisis para este plan. No marques como falta lo que no puedas contrastar con los demás documentos.', funcion: 'aviso' })
if (!paginas.length) contexto.push({ titulo: 'Páginas del sitio del cliente', texto: 'SIN PÁGINAS DEL SITIO en el material de este plan. No marques como inventado un precio o un dato que pudiera venir del sitio sin poder contrastarlo.', funcion: 'aviso' })
`

export function construirJefaturaConCarpeta(f) {
  cambiarCodigo(f, 'JEF · armar', 'const marcas = (v.chequeo_del_plan', BLOQUE_CARPETA_DE_LA_JEFATURA + 'const marcas = (v.chequeo_del_plan')
}
