/**
 * POST /api/planeacion/validar-plan · la puerta del VALIDADOR DE FORMA del plan de 90 días (31-oct · T1 «lo afectado por la auditoría» · CC#1).
 *
 * La llama el flujo de planeación (nodo de CC#2) con el plan que volvió del redactor. No llama a ningún modelo ni lee la base: US$ 0.
 *   entrada  `{ texto, workflow_id, workflow_execution_id, semanas? }`  (llave interna · la firma de la corrida es obligatoria: cada reintento queda cruzable)
 *   salida   200 `{ ok: true, hallazgos: [], correccion: null }`
 *            200 `{ ok: false, hallazgos: [{ que, donde }], correccion: '<texto para pegar al pedido del reintento>' }`
 *            400 pedido inválido (sin texto · sin firma) · 401 sin llave · 413 texto demasiado largo
 * El reintento (1) → `fallo` → alerta en #alertas + `necesita_humano` los decide el FLUJO con esta respuesta.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validarFormaDelPlan } from '@/lib/planeacion/validador-plan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** un plan de 90 días real mide ~35.000 caracteres; esto deja holgura sin aceptar cualquier cosa */
export const TEXTO_MAXIMO = 400_000

const esTexto = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0

export async function POST(req: Request): Promise<Response> {
  const auth = checkInternalKey(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 })

  let cuerpo: Record<string, unknown>
  try {
    const txt = await req.text()
    if (txt.length > TEXTO_MAXIMO) return NextResponse.json({ ok: false, error: `el pedido mide ${txt.length} caracteres · el tope es ${TEXTO_MAXIMO}` }, { status: 413 })
    const j: unknown = JSON.parse(txt)
    if (!j || typeof j !== 'object' || Array.isArray(j)) return NextResponse.json({ ok: false, error: 'el pedido no es un objeto' }, { status: 400 })
    cuerpo = j as Record<string, unknown>
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'el pedido no es JSON válido · ' + (e instanceof Error ? e.message : String(e)) }, { status: 400 })
  }

  const faltan = [
    !esTexto(cuerpo.workflow_id) ? 'workflow_id' : '',
    !esTexto(cuerpo.workflow_execution_id) ? 'workflow_execution_id' : '',
  ].filter(Boolean)
  if (faltan.length) {
    return NextResponse.json({ ok: false, error: 'falta la firma de la corrida · ' + faltan.join(' y ') + ' · sin eso el reintento no se puede cruzar con quien lo pidió' }, { status: 400 })
  }
  if (typeof cuerpo.texto !== 'string') return NextResponse.json({ ok: false, error: 'falta `texto` (el plan que volvió del redactor, como texto)' }, { status: 400 })

  const semanas = typeof cuerpo.semanas === 'number' && Number.isInteger(cuerpo.semanas) && cuerpo.semanas > 0 ? cuerpo.semanas : undefined
  const r = validarFormaDelPlan(cuerpo.texto, { semanas })
  return NextResponse.json({
    ok: r.ok,
    hallazgos: r.hallazgos,
    correccion: r.correccion,
    workflow_id: cuerpo.workflow_id,
    workflow_execution_id: cuerpo.workflow_execution_id,
  })
}
