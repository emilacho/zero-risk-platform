/**
 * POST /api/jefatura/revisiones · abre (o lee) una revisión de la jefatura como oficina propia. J3 · NADIE la llama todavía y la jefatura nace APAGADA:
 * con `jefatura_config.estado = 'apagada'` devuelve 409 (no abre, no gasta, ni siquiera en seco). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503; la llave interna no vale).
 *  · abrir (por omisión, o `accion: 'abrir'`): el sobre único { artifact_type, artifact_id, client_id, journey_id, payload } con `payload.dry_run` OBLIGATORIO y booleano (ausente = 400).
 *    Respuestas de la puerta: 409 `jefatura_no_abre` (apagada / tipo no activo / fuera del ensayo / renglón inactivo / sin presupuesto), 409 `sin_otra_vuelta` (G3), 409 `chequeos_detienen` (regla 8), 404 `tipo_sin_politica`.
 *  · `{ accion: 'leer', revision_id }`
 *  · `{ accion: 'elegir_version', revision_id, evaluaciones:[{etiqueta,marcas,largo}], id_de_a, existentes:[{id,version_de}] }` · solo el plan: la mejor versión aceptable y qué guardar.
 *  · `{ accion: 'marcar_reemplazo', provenance_tag, por, en? }` → `{ provenance_tag }` ENTERO (puro, no escribe): la planeación lee la fila, llama aquí y escribe lo que vuelve (G5 / condición 2 de CC#3).
 *  · `{ accion: 'provenance_de_version', provenance_tag, etiqueta, version, version_de, jefatura_revision_id }` → `{ provenance_tag }` de la versión nueva (hereda `type` y `trust_level`).
 */
import { NextResponse } from 'next/server'
import { abrirRevision, armarSalida, elegirVersionDelPlan } from '@/lib/jefatura/revision/orquestador'
import { provenanceConReemplazo, provenanceDeVersionNueva } from '@/lib/jefatura/revision/plan'
import { resolverCierre } from '@/lib/jefatura/revision/cierre'
import { ESTADOS_TERMINALES } from '@/lib/jefatura/revision/puertos'
import { checkLlaveDeLaSala, esObjeto, puertosReales, UUID } from '@/lib/jefatura/revision/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// GPT (hasta 200 s con sus reintentos) corre DENTRO de esta ruta cuando abrir llega hasta la segunda mirada
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  const accion = cuerpo.accion === undefined ? 'abrir' : cuerpo.accion
  if (!['abrir', 'leer', 'elegir_version', 'marcar_reemplazo', 'provenance_de_version'].includes(String(accion))) return NextResponse.json({ error: 'entrada_invalida', errores: ['`accion` debe ser abrir, leer, elegir_version, marcar_reemplazo o provenance_de_version'] }, { status: 400 })
  // las dos de `provenance_tag` son PURAS (no tocan la base): ni siquiera se construyen los puertos
  if (accion === 'marcar_reemplazo' || accion === 'provenance_de_version') {
    try {
      if (accion === 'marcar_reemplazo') {
        if (typeof cuerpo.por !== 'string') return NextResponse.json({ error: 'entrada_invalida', errores: ['`por` debe ser el id de la versión que reemplaza'] }, { status: 400 })
        return NextResponse.json({ provenance_tag: provenanceConReemplazo(cuerpo.provenance_tag, { por: cuerpo.por, en: typeof cuerpo.en === 'string' ? cuerpo.en : new Date().toISOString() }) }, { status: 200 })
      }
      const et = cuerpo.etiqueta, ver = cuerpo.version
      if ((et !== 'B' && et !== 'C') || (ver !== 2 && ver !== 3) || typeof cuerpo.version_de !== 'string' || typeof cuerpo.jefatura_revision_id !== 'string') return NextResponse.json({ error: 'entrada_invalida', errores: ['hacen falta `etiqueta` (B o C), `version` (2 o 3), `version_de` y `jefatura_revision_id`'] }, { status: 400 })
      return NextResponse.json({ provenance_tag: provenanceDeVersionNueva(cuerpo.provenance_tag, { etiqueta: et, version: ver, version_de: cuerpo.version_de, jefatura_revision_id: cuerpo.jefatura_revision_id }) }, { status: 200 })
    } catch (e) {
      // el objeto era parcial, o la versión ya fue reemplazada: se dice y NO se escribe nada
      return NextResponse.json({ error: 'provenance_invalido', detalle: e instanceof Error ? e.message : String(e) }, { status: 400 })
    }
  }
  try {
    const { P } = puertosReales()
    if (accion === 'abrir') {
      const { accion: _a, ...sobre } = cuerpo
      void _a
      const r = await abrirRevision(P, sobre)
      return NextResponse.json(r.cuerpo, { status: r.status })
    }
    if (typeof cuerpo.revision_id !== 'string' || !UUID.test(cuerpo.revision_id)) return NextResponse.json({ error: 'entrada_invalida', errores: ['`revision_id` debe ser un uuid'] }, { status: 400 })
    if (accion === 'leer') {
      const rev = await P.almacen.leerRevision(cuerpo.revision_id)
      if (!rev) return NextResponse.json({ error: 'revision_inexistente' }, { status: 404 })
      const cerrada = (ESTADOS_TERMINALES as readonly string[]).includes(rev.estado)
      return NextResponse.json({
        revision_id: rev.id, artifact_type: rev.artifact_type, artifact_id: rev.artifact_id, estado: rev.estado, resultado: rev.resultado, marcas: rev.marcas, gasto_usd: rev.gasto_usd, tope_usd: rev.tope_usd, dry_run: rev.dry_run,
        fichas: rev.estado_del_motor.fichas, ...(cerrada ? { salida: armarSalida(rev, resolverCierre(rev.estado_del_motor, { tope: rev.estado === 'cerrada_por_tope', fallida: rev.estado === 'fallida' })) } : {}),
      }, { status: 200 })
    }
    // elegir_version
    const ev = cuerpo.evaluaciones, existentes = cuerpo.existentes ?? []
    const errores: string[] = []
    if (!Array.isArray(ev) || ev.length === 0 || !ev.every((x) => esObjeto(x) && typeof x.etiqueta === 'string' && typeof x.marcas === 'number' && typeof x.largo === 'number')) errores.push('`evaluaciones` debe ser una lista de { etiqueta, marcas, largo }')
    if (typeof cuerpo.id_de_a !== 'string' || cuerpo.id_de_a === '') errores.push('`id_de_a` debe ser el id de la fila del plan original')
    if (!Array.isArray(existentes) || !existentes.every((x) => esObjeto(x) && typeof x.id === 'string' && (x.version_de === null || typeof x.version_de === 'string'))) errores.push('`existentes` debe ser una lista de { id, version_de }')
    if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
    const r = await elegirVersionDelPlan(P, cuerpo.revision_id, { evaluaciones: ev as never, idDeA: cuerpo.id_de_a as string, existentes: existentes as never })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'jefatura_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
