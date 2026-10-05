/**
 * La entrada de lectura del cerebro: une el adaptador de lectura REAL (solo GET) con la lista corta.
 * Es lo que usarán las rutas de solo lectura del tramo 2; en el tramo 1 solo lo usa la prueba con un cliente real.
 */
import { crearConsultaRest } from './consulta'
import { type Contenido, type OpcionesDeContenido, leerContenido } from './contenido'
import { construirListaCorta, type OpcionesListaCorta } from './lista-corta'
import type { ListaCorta } from './tipos'

export async function leerContenidoDeUnCliente(args: { url: string; llave: string; cliente: string; ref: string } & OpcionesDeContenido): Promise<Contenido> {
  const { url, llave, cliente, ref, ...opciones } = args
  return leerContenido(crearConsultaRest({ url, llave }), cliente, ref, opciones)
}

export async function leerUnCliente(args: { url: string; llave: string; cliente: string } & OpcionesListaCorta): Promise<ListaCorta> {
  const { url, llave, cliente, ...opciones } = args
  return construirListaCorta(crearConsultaRest({ url, llave }), cliente, opciones)
}
