/**
 * R6 en los LECTORES · «provisional viaja». Un lector del manual (cerebro, oficina…) pregunta aquí qué campos del manual vigente son firmes y cuáles provisionales y recibe,
 * si los hay, UNA línea de aviso para anexarla a lo que lee. Un manual anterior al ciclo (sin `_field_meta`) NO se condena: sus campos salen «sin revisar» y no generan aviso.
 * PURO. Un `content_text` ilegible o sin borrador → sin aviso (el lector sigue como hoy).
 */
import { camposFirmes, type CamposFirmes } from './firmes'
import { borradorDeContentText } from './revision'

export function camposDelManual(contentText: unknown): CamposFirmes | null {
  const d = borradorDeContentText(contentText)
  return d ? camposFirmes(d) : null
}

const lineaDeProvisionales = (campos: string[]): string => (campos.length ? `Campos provisionales (sin respaldo completo en lo raspado; se leen como orientación, no como dato firme): ${campos.join(', ')}.` : '')

/** «Campos provisionales (sin respaldo completo en lo raspado): a, b.» — o '' si no hay ninguno */
export function avisoDeProvisionales(contentText: unknown): string {
  const c = camposDelManual(contentText)
  return c ? lineaDeProvisionales(c.provisionales) : ''
}

/**
 * 02-nov · firma de Emilio: lo que declara el dueño vive en marketing, no en el cerebro. Este aviso es para quien lee en marketing: dice lo que él validó y deja de leerlo como provisional.
 * El lector del cerebro sigue con `avisoDeProvisionales`, sin cambios.
 */
export function avisoDelManualConValidados(contentText: unknown): string {
  const c = camposDelManual(contentText)
  if (!c) return ''
  const validados = c.validados_por_el_dueno ?? []
  return [
    validados.length ? `Campos validados por el dueño, tal como están: ${validados.join(', ')}.` : '',
    lineaDeProvisionales(c.provisionales.filter((x) => !validados.includes(x))),
  ].filter(Boolean).join(' ')
}
