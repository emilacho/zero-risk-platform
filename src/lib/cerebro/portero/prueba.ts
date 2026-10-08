/**
 * LA LISTA DE PRUEBA · permite correr el dorado ENTERO por la ruta `razonar` (y por el flujo que la llama) con listas inventadas.
 * No abre ninguna puerta: la ruta NO lee ninguna tabla cuando recibe una (la lista inventada reemplaza a la lectura, no se suma a ella),
 * no devuelve contenido (solo números y las referencias de la propia lista), se registra MARCADA como prueba y SIN `client_id`,
 * y exige el mismo `workflow_id` y la misma llave interna que siempre. Se acepta solo con `prueba: true` explícito y con tamaño acotado.
 */
import type { Estado, Ficha, ListaCorta, Origen } from '../tipos'
import { NOMBRES_DE_FUENTE } from '../tipos'

export const MAXIMO_DE_LINEAS_DE_PRUEBA = 800
export const MAXIMO_DE_CARACTERES_DE_PRUEBA = 400_000

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esTexto = (v: unknown): v is string => typeof v === 'string'
const fechaOnull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export type ListaDePrueba = { ok: true; lista: ListaCorta } | { ok: false; errores: string[] }

/** `null` = no hay lista de prueba (la ruta lee la base como siempre) */
export function leerListaDePrueba(prueba: unknown, lista: unknown, cliente: string, ahora: Date): ListaDePrueba | null {
  if (lista === undefined) return null
  if (prueba !== true) return { ok: false, errores: ['`lista_de_prueba` solo se acepta con `prueba: true`'] }
  if (!Array.isArray(lista) || lista.length === 0) return { ok: false, errores: ['`lista_de_prueba` debe ser una lista con al menos una ficha'] }
  if (lista.length > MAXIMO_DE_LINEAS_DE_PRUEBA) return { ok: false, errores: [`\`lista_de_prueba\` pasa de ${MAXIMO_DE_LINEAS_DE_PRUEBA} líneas`] }
  let caracteres = 0
  try { caracteres = JSON.stringify(lista).length } catch { return { ok: false, errores: ['`lista_de_prueba` no se puede leer'] } }
  if (caracteres > MAXIMO_DE_CARACTERES_DE_PRUEBA) return { ok: false, errores: [`\`lista_de_prueba\` pasa de ${MAXIMO_DE_CARACTERES_DE_PRUEBA} caracteres`] }
  const errores: string[] = []
  const lineas: Ficha[] = []
  lista.forEach((x, i) => {
    if (!esObjeto(x) || !esTexto(x.ref) || !x.ref || !esTexto(x.estante) || !x.estante || !esTexto(x.clase) || !esTexto(x.titulo) || typeof x.peso_estimado !== 'number' || !Number.isFinite(x.peso_estimado) || x.peso_estimado < 0) {
      errores.push(`ficha ${i + 1}: faltan o están mal ref, estante, clase, titulo o peso_estimado`)
      return
    }
    // solo los campos que el portero usa: nada más pasa (ni `contenido` ni campos extra)
    lineas.push({
      ref: x.ref, estante: x.estante as Ficha['estante'], clase: x.clase, titulo: x.titulo, que_es: esTexto(x.que_es) ? x.que_es : '',
      origen: (esTexto(x.origen) ? x.origen : 'su_fuente') as Origen, estado: (esTexto(x.estado) ? x.estado : 'visto_en_su_fuente') as Estado,
      fecha_fuente: fechaOnull(x.fecha_fuente), vigente_hasta: fechaOnull(x.vigente_hasta), vencido: x.vencido === true,
      ...(typeof x.version === 'number' ? { version: x.version } : {}), ...(typeof x.vigente === 'boolean' ? { vigente: x.vigente } : {}),
      ...(Array.isArray(x.producto) && x.producto.every(esTexto) ? { producto: x.producto as string[] } : {}),
      ...(typeof x.versiones_anteriores === 'number' ? { versiones_anteriores: x.versiones_anteriores } : {}),
      // lo que decide si una cosa se puede entregar: pasa igual que en la lista real (la lista de prueba no puede traer lo que la real no trae)
      ...(typeof x.valida === 'boolean' ? { valida: x.valida } : {}), ...(typeof x.reemplazada === 'boolean' ? { reemplazada: x.reemplazada } : {}), ...(esTexto(x.aviso) ? { aviso: x.aviso } : {}),
      // de `datos` solo pasa la familia (el nivel más fino de las listas grandes); precio y lo demás no
      ...(esObjeto(x.datos) && esTexto(x.datos.familia) && x.datos.familia.trim() ? { datos: { familia: x.datos.familia } } : {}),
      peso_estimado: x.peso_estimado,
    })
  })
  if (errores.length) return { ok: false, errores: errores.slice(0, 10) }
  return {
    ok: true,
    lista: { cliente_id: cliente, generada_en: ahora.toISOString(), estado: 'ok', lineas, fuentes: Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, { estado: 'ok', n: 0 }])) as ListaCorta['fuentes'] },
  }
}
