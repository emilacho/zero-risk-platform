/**
 * POST /api/perfil-del-publico · la puerta del PERFIL DEL PÚBLICO (T1 · GO de Lenovo por Emilio 10-nov · apagado hasta el «dale» de T3).
 * Cablea las dependencias reales de `correrPerfil` (src/lib/perfil-del-publico/corrida.ts); la lógica y sus garantías viven allá y se prueban allá.
 *
 *   · exige la llave interna, `dry_run` explícito y la firma REAL de la corrida (workflow_id + execution id): el redactor solo se invoca vía flujo;
 *   · PALANCA APAGADA POR OMISIÓN (`cadena_config.perfil_del_publico` = { encendida, clientes[] });
 *   · crédito de Apify leído por el mismo lector que la puerta del Servicio (#977), pero aquí una lectura caída es «sin crédito»;
 *   · voces: tabla propia `perfil_publico_voces` (fuera del cerebro) + fichas de habla del cerebro leídas por su consulta pública (US$ 0);
 *   · raspado por el Servicio de Apify existente, con la firma de quien llama; lo crudo se lee de vuelta de `apify_raw` por `llamado_por`;
 *   · el perfil se archiva por la puerta de informes del cerebro (`POST /api/brain/alimentar/informe`), como cualquier oficina.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { correrPerfil } from '@/lib/perfil-del-publico/corrida'
import { dependenciasReales } from '@/lib/perfil-del-publico/dependencias'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) return NextResponse.json({ error: 'no_autorizado', detalle: auth.reason }, { status: 401 })
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!c || typeof c !== 'object') return NextResponse.json({ error: 'entrada_invalida', detalle: 'el cuerpo debe ser JSON' }, { status: 400 })
  const client_id = txt(c.client_id)
  if (!UUID.test(client_id)) return NextResponse.json({ error: 'entrada_invalida', detalle: '`client_id` debe ser un uuid' }, { status: 400 })
  // 🔴 el ensayo se DECIDE, no se asume: asumir `false` sería gastar sin que nadie lo pidiera
  if (typeof c.dry_run !== 'boolean') return NextResponse.json({ error: 'entrada_invalida', detalle: 'falta `dry_run` explícito (true o false) · no se hizo nada' }, { status: 400 })
  const workflow_id = txt(c.workflow_id), workflow_execution_id = txt(c.workflow_execution_id)
  // 🔴 el redactor SOLO se invoca vía flujo: sin firma no hay corrida
  if (!workflow_id || !workflow_execution_id) return NextResponse.json({ error: 'sin_firma', detalle: 'falta la firma de la corrida (workflow_id y workflow_execution_id) · no se hizo nada' }, { status: 403 })
  try {
    const r = await correrPerfil(dependenciasReales({ client_id, workflow_id, workflow_execution_id, idioma: txt(c.idioma) || null, trato: txt(c.trato) || null }), {
      client_id, dry_run: c.dry_run, workflow_id, workflow_execution_id, ...(typeof c.tope_usd === 'number' ? { tope_usd: c.tope_usd } : {}),
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: 'se_rompio', detalle: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 })
  }
}
