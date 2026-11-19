/**
 * 19-nov · #1085 · CON LA LLAVE CAÍDA, LA PUERTA DE CRÉDITO PASA CON ALERTA (decisión de Lenovo 22:25Z, regla de Emilio «nada se para»).
 * Si la cuenta de Apify no se puede leer, la puerta sigue dejando pasar (`creditoSinLeer`); lo que de verdad gasta lo frena el tope de la campaña.
 * Lo nuevo: eso ya no pasa callado. Se abre UNA alarma por incidente en `#alertas`, por la única puerta de avisos (`lib/avisos`):
 *  · la misma lectura caída repetida solo cuenta (no publica otra); un detalle distinto va al hilo de la misma alarma;
 *  · cuando la cuenta se vuelve a leer, la alarma se cierra con «Resuelto» en su hilo; si vuelve a caer, es un incidente nuevo.
 * NUNCA lanza ni cambia la respuesta de la puerta: un fallo al avisar (base o Slack caídos) no frena el raspado. No gasta (no llama a Apify ni a agentes).
 */
import { avisar, cerrar, errorLimpio, type Dependencias } from '../avisos/nucleo'

export const CLAVE_CREDITO_SIN_LEER = 'apify:credito:sin-leer'
export const ORIGEN_DE_LA_PUERTA = 'api/apify/credito'
export const TITULO_CREDITO_SIN_LEER = 'Apify: no se pudo leer la cuenta · la puerta de crédito deja pasar sin medir'

export type Lectura = { ok: true } | { ok: false; detalle: string }
export type ResultadoDelAviso = 'abrio' | 'reabrio' | 'repetida' | 'cambio' | 'cerro' | 'nada' | 'fallo'

/** abre (o cuenta) la alarma si la lectura cayó; la cierra si la lectura volvió · nunca lanza */
export async function avisarLecturaDelCredito(r: Lectura, d: Dependencias | null): Promise<ResultadoDelAviso> {
  if (!d) return 'fallo'
  try {
    if (r.ok) return (await cerrar(d, CLAVE_CREDITO_SIN_LEER, 'La cuenta de Apify se volvió a leer: la puerta de crédito vuelve a medir')).cerrado ? 'cerro' : 'nada'
    const g = await avisar(d, {
      clave: CLAVE_CREDITO_SIN_LEER,
      tipo: 'alarma',
      origen: ORIGEN_DE_LA_PUERTA,
      origen_tipo: 'plataforma',
      titulo: TITULO_CREDITO_SIN_LEER,
      detalle: `Motivo: ${errorLimpio(r.detalle || 'sin detalle')}. Las corridas de Apify siguen; el gasto lo frena el tope de cada campaña. Revisar la llave de Apify del despliegue.`,
    })
    return g.accion === 'contestada' ? 'nada' : g.accion
  } catch {
    return 'fallo'
  }
}
