/**
 * 21-nov · «REINTENTAR AHORA» UN PASO AGOTADO (GO Lenovo 03:55Z, opción c · CC4 · debug de la corrida).
 * Un paso de la cadena que quedó en `intentos_agotados` espera hoy al tramo siguiente de medio día (la regla de «no insistir en el mismo tramo», `nucleo.ts`).
 * Cuando lo que agotó los intentos fue un error NUESTRO ya arreglado, un operador (CC7 por script o llamada; sin botón en el tablero) concede aquí una llave nueva
 * `<base>:rmanual-<UTC>` con sus 3 intentos. El próximo pase del flujo de ese paso la usa (`prepararCorrida`).
 *
 * Reglas:
 *   · NO mueve ni borra corridas: el registro de auditoría queda igual. El permiso se anota en la libreta `cadena_config.reintentos_manuales`
 *     (quién, cuándo, por qué y la llave que se agotó), con escritura condicional (dos operadores a la vez no se pisan).
 *   · Solo para un paso de verdad AGOTADO (la misma regla de `prepararCorrida`, `estadoDeLaLlave`); si el paso puede seguir solo, 409 y no se anota nada.
 *   · La misma bolsa y el mismo candado del tope de la campaña: si el intento no cabe (ni agrandando la bolsa hasta el tope), 409. Al usarse, `prepararCorrida` lo mira otra vez.
 *   · No vale para una campaña en `necesita_humano` (ni cerrada ni reemplazada) ni para las de CAMPANAS_SIN_REINTENTO_MANUAL.
 *   · Agnóstico: cualquier paso que cuenta intentos (estrategia, calendario, fechas, fichas). El brief no: su vuelta no pasa por `prepararCorrida`.
 *   · Idempotente: si ya hay un permiso con intentos libres para esa llave, devuelve el mismo (`ya_estaba`) y no anota otro.
 */
import type { Almacen, Corrida, EstadoCampana } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { MAXIMO_DE_INTENTOS, topeDelPaso, type Paso } from './constantes'
import {
  baseDeLaLlave, bolsaAgrandada, bolsaDelPaso, CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, esDeLaLlave, estadoDeLaLlave, llaveDeReintentoManual, permisosDeLaLibreta, permisoVigente,
  type PermisoDeReintento,
} from './nucleo'

/** los pasos que cuentan intentos con `prepararCorrida` */
export const PASOS_CON_REINTENTO_MANUAL: readonly Paso[] = ['estrategia', 'calendario', 'fechas', 'fichas']
/** campañas a las que NUNCA se les concede (decisión de Lenovo 21-nov 03:55Z): si se reanudan, sus anuncios entran a producir */
export const CAMPANAS_SIN_REINTENTO_MANUAL: readonly string[] = ['36e66179-3061-4a7d-94db-932a900d9515']
const ESTADOS_SIN_REINTENTO: readonly EstadoCampana[] = ['necesita_humano', 'cerrada', 'reemplazada']
export const LARGO_MAXIMO_DEL_POR_QUE = 500

export async function reintentarAhora(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id), paso = cadena(cuerpo.paso), quien = cadena(cuerpo.quien), porQue = cadena(cuerpo.por_que)
  if (!id || !paso || !quien || !porQue) return err(400, 'E-CAMPOS', 'faltan campana_id, paso, quien o por_que (el registro dice quién lo pidió y por qué)')
  if (!(PASOS_CON_REINTENTO_MANUAL as readonly string[]).includes(paso)) return err(400, 'E-PASO', `paso debe ser uno de: ${PASOS_CON_REINTENTO_MANUAL.join(' | ')} (el brief no cuenta intentos por aquí)`)
  if (porQue.length > LARGO_MAXIMO_DEL_POR_QUE) return err(400, 'E-POR-QUE', `por_que admite hasta ${LARGO_MAXIMO_DEL_POR_QUE} caracteres`)
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id, { humano: true })
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  if (CAMPANAS_SIN_REINTENTO_MANUAL.includes(c.id)) return err(409, 'E-REINTENTO-EXCLUIDA', 'esta campaña no admite reintento manual (decisión de Lenovo)')
  if (ESTADOS_SIN_REINTENTO.includes(c.estado)) return err(409, 'E-REINTENTO-ESTADO', `una campaña ${c.estado} no admite reintento manual`)

  const delPaso = (await al.corridasDeCampana(c.id)).filter((x) => x.paso === paso)
  const ultima = delPaso.reduce<Corrida | null>((m, x) => (!m || x.id > m.id ? x : m), null)
  if (!ultima) return err(409, 'E-REINTENTO-SIN-CORRIDAS', `el paso ${paso} no tiene corridas en esta campaña: no hay nada agotado`)
  const base = baseDeLaLlave(ultima.clave_idempotencia)
  const deLaBase = delPaso.filter((x) => esDeLaLlave(x.clave_idempotencia, base))
  if (deLaBase.some((x) => x.estado === 'ok')) return err(409, 'E-REINTENTO-YA-HECHO', `el paso ${paso} (${base}) ya terminó bien`)
  const viva = deLaBase.find((x) => x.estado === 'en_curso' && !(x.plazo_en && Date.parse(ahora) > Date.parse(x.plazo_en)))
  if (viva) return err(409, 'E-EN-CURSO', 'ya hay una llamada en curso para este paso (dentro de su plazo)', { corrida_id: viva.id })

  const usadas = (k: string) => delPaso.filter((x) => x.clave_idempotencia === k).length
  const vigente = await permisoVigente(al, c.id, paso, base)
  if (vigente && usadas(vigente.llave) < MAXIMO_DE_INTENTOS) return { status: 200, cuerpo: { ok: true, ya_estaba: true, permiso: vigente, intentos_libres: MAXIMO_DE_INTENTOS - usadas(vigente.llave) } }
  const e = estadoDeLaLlave(delPaso, base, ahora)
  if (!e.agotada) return err(409, 'E-REINTENTO-NO-AGOTADO', `el paso ${paso} no está agotado: el flujo sigue solo con ${e.llave} (intento ${e.intento})`, { llave: e.llave, intento: e.intento })

  // la misma bolsa y el mismo candado del tope de la campaña (sin escribir: `prepararCorrida` agranda la bolsa si hace falta, nunca más allá del tope)
  const bolsa = await bolsaDelPaso(al, c, paso as Paso)
  const reserva = bolsa.gastado + topeDelPaso(paso as Paso)
  if (reserva > bolsa.presupuesto) {
    const nueva = bolsaAgrandada(c, paso as Paso)
    if (nueva === null || reserva > nueva) return err(409, 'E-PRESUPUESTO', `el intento no cabe: gastado US$ ${bolsa.gastado.toFixed(2)} + tope US$ ${topeDelPaso(paso as Paso).toFixed(2)} > bolsa US$ ${(nueva ?? bolsa.presupuesto).toFixed(2)}`)
  }

  const permiso: PermisoDeReintento = { campana_id: c.id, paso, clave_agotada: base, llave: llaveDeReintentoManual(base, ahora), quien, por_que: porQue, cuando: ahora }
  if (!(await anotarEnLaLibreta(al, permiso))) return err(409, 'E-LIBRETA-OCUPADA', 'otro operador escribió la libreta a la vez: vuelve a pedirlo')
  return { status: 200, cuerpo: { ok: true, permiso, intentos_libres: MAXIMO_DE_INTENTOS } }
}

/** agrega el permiso a la libreta con escritura condicional (2 intentos); sin escritura condicional en el almacén, escribe directo */
async function anotarEnLaLibreta(al: Almacen, p: PermisoDeReintento): Promise<boolean> {
  if (!al.leerConfigConSello || !al.escribirConfigSiSello) {
    await al.escribirConfig(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [...permisosDeLaLibreta(await al.leerConfig(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS)), p])
    return true
  }
  for (let i = 0; i < 2; i++) {
    const actual = await al.leerConfigConSello(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS)
    if (await al.escribirConfigSiSello(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [...permisosDeLaLibreta(actual?.valor), p], actual?.sello ?? null)) return true
  }
  return false
}
