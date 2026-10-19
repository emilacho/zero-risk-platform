/**
 * AVISO DE «CAMBIÓ UN RASPADOR» (19-oct · cambio de esquema de Apify) · POST /api/brain/alimentar/aviso-de-raspador
 * Lo llaman dos flujos de n8n cuando un campo que se manda a un raspador de Apify YA NO EXISTE y no hay mapa de renombre (el Servicio rechaza la llamada y dice «sin dato por cambio del raspador»)
 * y cuando el relector del lunes ve cambios sin resolver. Pone UNA línea en #alertas con el bot de Slack. NO decide cuándo avisar: la sordina («una vez por cambio») vive en n8n
 * (`$getWorkflowStaticData`), porque allí está el estado del flujo; esta ruta solo valida y entrega. US$ 0 · no llama a Apify ni a un modelo · no lee ni escribe en la base.
 */
import type { Respuesta } from './rutas'

export interface DepsDeAvisoDeRaspador { avisar: (texto: string) => Promise<{ ok: boolean; detalle: string }> }
const FUNCION = /^[a-z][a-z0-9_]{0,63}$/
const MOTIVOS = ['campo_desaparecido', 'cambio_sin_resolver'] as const
export type MotivoDeAviso = (typeof MOTIVOS)[number]
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
/** una línea: sin saltos ni comillas de código que rompan el formato de Slack */
const limpio = (s: string, max: number) => s.replace(/[\r\n`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

export function textoDelAviso(funcion: string, motivo: MotivoDeAviso, detalle: string): string {
  const que = motivo === 'campo_desaparecido'
    ? `el raspador «${funcion}» ya no acepta un campo que se le manda · ${detalle}. Mientras no se re-congele, el brazo responde «sin dato por cambio del raspador» y NO entrega vacío como si fuera dato`
    : `cambió el esquema de «${funcion}» en Apify · ${detalle}`
  return `:warning: [RASPADOR] ${que}. Arreglo: node scripts/ops/recongelar-esquemas.mjs aplicar --ejecutar (respalda y deja reversa)`
}

export async function rutaAvisoDeRaspador(deps: DepsDeAvisoDeRaspador, cuerpo: unknown): Promise<Respuesta> {
  if (!esObjeto(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  if (typeof cuerpo.dry_run !== 'boolean') return err(400, 'dry_run_obligatorio', '`dry_run` es obligatorio y debe ser true o false')
  const funcion = typeof cuerpo.funcion === 'string' ? cuerpo.funcion.trim() : ''
  if (!FUNCION.test(funcion)) return err(400, 'entrada_invalida', '`funcion` debe ser el nombre de una función del Servicio (minúsculas y guion bajo)')
  const motivo = MOTIVOS.find((m) => m === cuerpo.motivo)
  if (!motivo) return err(400, 'entrada_invalida', `\`motivo\` debe ser ${MOTIVOS.join(' o ')}`)
  const detalle = typeof cuerpo.detalle === 'string' ? limpio(cuerpo.detalle, 600) : ''
  if (!detalle) return err(400, 'entrada_invalida', '`detalle` es obligatorio (qué campo, qué pasó)')
  const texto = textoDelAviso(funcion, motivo, detalle)
  if (cuerpo.dry_run) return { status: 200, body: { ok: true, dry_run: true, enviado: false, texto } }
  const r = await deps.avisar(texto)
  // un aviso que Slack no confirmó NO se da por entregado: n8n lo ve y no marca la sordina
  return { status: r.ok ? 200 : 502, body: { ok: r.ok, enviado: r.ok, detalle: r.detalle, texto } }
}
