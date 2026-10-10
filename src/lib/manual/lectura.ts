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

/** «Campos provisionales (sin respaldo completo en lo raspado): a, b.» — o '' si no hay ninguno */
export function avisoDeProvisionales(contentText: unknown): string {
  const c = camposDelManual(contentText)
  return c && c.provisionales.length ? `Campos provisionales (sin respaldo completo en lo raspado; se leen como orientación, no como dato firme): ${c.provisionales.join(', ')}.` : ''
}
