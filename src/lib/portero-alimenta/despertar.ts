/**
 * EL CEREBRO DESPIERTA CON EL RASPADO DEL ALTA (15-oct · firma de Emilio: «el cerebro despierte con ese primer raspado … y continúe su trabajo a partir de eso»).
 * `POST /api/brain/alimentar/despertar` · lo llama el alta al final (tras manual y cimiento). US$ 0: NO llama a Apify; usa lo que el alta ya dejó en `apify_raw` (solo `ensayo = false`):
 *  1. lo pasa por el MISMO filtro anti-homónimos y el MISMO archivar del portero (`alimentarCliente`) → `cerebro_fichas` con `observado_en` y `fuente_url`, y marca las unidades
 *     en `cerebro_unidades_vistas` (la corrida diaria no las repite);
 *  2. deja una fila en `cerebro_portero_corridas` con `resumen.tipo = 'despertar'` (NO bloquea la corrida diaria del mismo día: esa la reemplaza);
 *  3. el puente lleva las fichas al índice (en pasadas, hasta `quedan = 0`);
 *  4. dice qué FALTA (lo que el plan diario pediría y el alta no trajo) y cuánto se ahorra. Esta ruta NO llama a Apify (vive en Vercel; Apify se pide desde n8n): deja el rastro
 *     «completando» y responde `pedir_ahora: true`; el alta encadena a continuación la MISMA cadena del portero (descubrir → ampliar → artículos → reseñas y videos → alimentar → puente → vigilar)
 *     con el mismo planificador, filtro, archivar, cobertura y tope. Esa cadena reemplaza la fila del despertar (la corrida diaria) y `cerebro_listo` pasa a true (ver `listo.ts`: espera máxima
 *     y huecos declarados);
 *  5. el vigilante se aplica igual: si algo falla apaga el portero y avisa a #alertas; si todo va bien, silencio.
 * Señal «cerebro listo» = la cadena que pide lo que falta TERMINÓ (o se venció la espera y se declaran huecos) + `quedan = 0` + vigilante sin problemas; aquí siempre sale false con `completando`. `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id (el alta).
 */
import { alimentarCliente, type Db } from './alimentar'
import { FLUJO_DEL_PORTERO_POR_OMISION } from './no-corrio'
import { gastoDeHoy, reconciliarYEnviar, rutaDescubrir, validar, type DepsDeRutas, type Respuesta } from './rutas'
import { ESPERA_DEL_REINTENTO_MS, esSoloNoPudeComprobar, evaluarCliente, lineaDeAlerta, type ResultadoDeCliente } from './vigilante'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const esRespuesta = (x: unknown): x is Respuesta => esObjeto(x) && typeof (x as { status?: unknown }).status === 'number' && esObjeto((x as { body?: unknown }).body)
export const MAX_PASADAS_DEL_PUENTE = 12

export interface DepsDeDespertar extends DepsDeRutas {
  /** apaga el flujo del portero diario si el despertar deja un problema; en pruebas es un registro */
  apagar?: (workflowId: string) => Promise<{ ok: boolean; detalle: string }>
  avisar?: (texto: string) => Promise<{ ok: boolean; detalle: string }>
  esperar?: (ms: number) => Promise<void>
  /** el flujo del portero diario (el que se apaga si algo falla) */
  workflowIdPortero?: string
}

export async function rutaDespertar(deps: DepsDeDespertar, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if (esRespuesta(v)) return v
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const dia = ahora.toISOString().slice(0, 10)

  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return { status: 502, body: { error: 'lectura_fallida', detalle: g.detalle } }
  // si ya había un despertar de hoy esperando la cadena, la espera NO se reinicia (el reloj absoluto vive en la base: despertar dos veces no estira la espera ni vuelve a pedir)
  const previa = await deps.db.from('cerebro_portero_corridas').select('resumen').eq('client_id', v.client_id).eq('dia', dia).limit(1)
  if (previa.error) return { status: 502, body: { error: 'lectura_fallida', detalle: `cerebro_portero_corridas: ${previa.error.message}` } }
  const rp = lista(previa.data)[0]?.resumen
  const dp = esObjeto(rp) && esObjeto(rp.despertar) ? rp.despertar : null
  const completandoPrevio = dp && esObjeto(dp.completando) && typeof dp.completando.desde === 'string' ? dp.completando.desde : null
  const r = await alimentarCliente({
    db: deps.db, client_id: v.client_id, dry_run: v.dry_run, interruptores: deps.interruptores, llamarModelo: deps.llamarModelo, pulirResumen: deps.pulirResumen, ahora, despertar: true,
    gasto_de_hoy_usd: g.gasto.total_usd, workflow_id: v.workflow_id || undefined, workflow_execution_id: v.workflow_execution_id || undefined,
  })
  if (r.estado === 'cliente_inexistente') return { status: 404, body: { error: 'cliente_inexistente', detalle: r.detalle } }
  if (r.estado === 'lectura_fallida') return { status: 502, body: { error: 'lectura_fallida', detalle: r.detalle } }
  if (r.estado === 'ya_corrio_hoy') return { status: 200, body: { ok: true, dry_run: v.dry_run, estado: r.estado, detalle: 'ya corrió la corrida diaria de hoy: el despertar no hace falta', cerebro_listo: null, modelos_llamados: 0 } }

  // el puente en pasadas hasta quedan = 0 (o sin progreso)
  let puente: Record<string, unknown> | null = null
  if (deps.interruptores.puente_al_indice && r.ok) {
    let anterior = Infinity
    for (let i = 0; i < MAX_PASADAS_DEL_PUENTE; i++) {
      const x = await reconciliarYEnviar(deps, v.client_id, v.dry_run)
      puente = { ...x.puente, pasadas: i + 1 }
      r.errores.push(...x.errores)
      const quedan = typeof x.puente.quedan === 'number' ? x.puente.quedan : 0
      if (v.dry_run || x.errores.length || x.puente.lectura_fallida === true || quedan === 0 || quedan >= anterior) break
      anterior = quedan
    }
  }
  const quedan = puente && typeof puente.quedan === 'number' ? puente.quedan : null
  const conErrores = r.errores.length > 0

  // lo que falta: el plan diario menos lo que el alta ya trajo (solo lee; sin modelo; sin propuestas)
  const d = await rutaDescubrir({ ...deps, llamarModelo: undefined, interruptores: { ...deps.interruptores, proponer_busquedas: false } }, { client_id: v.client_id, dry_run: true, cubrir_con_el_alta: true })
  const plan = d.status === 200 && esObjeto(d.body.plan) ? d.body.plan : null
  const cub = d.status === 200 && esObjeto(d.body.cubierto_por_el_alta) ? d.body.cubierto_por_el_alta : null
  const lectura = d.status === 200 ? null : `no pude calcular lo que falta: ${String(d.body.detalle ?? d.body.error ?? d.status).slice(0, 120)}`
  const falta = plan ? lista(plan.hacer).map((a) => ({ fuente: a.fuente, funcion: a.funcion, objetivo: a.objetivo, usd_max: a.usd_max })) : []
  const resumenDelDespertar = {
    unidades: r.unidades, filtro: r.filtro, fichas_nuevas: r.plan?.fichas.length ?? 0, ya_existian: r.filtro.repetidas,
    ya_cubierto: cub ? lista(cub.cubiertas).length : null, ahorro_usd: cub ? Number(cub.ahorro_usd) || 0 : null, falta: falta.length, falta_usd_max: Math.round(falta.reduce((s, a) => s + (Number(a.usd_max) || 0), 0) * 1e6) / 1e6,
  }
  const completando = { desde: completandoPrevio ?? ahora.toISOString(), falta: falta.map((a) => ({ fuente: a.fuente, funcion: a.funcion, objetivo: a.objetivo })) }
  const body: Record<string, unknown> = {
    ok: r.ok && !conErrores, dry_run: v.dry_run, estado: conErrores && r.estado === 'hecha' ? 'con_errores' : r.estado, ...resumenDelDespertar,
    cubiertas: cub ? cub.cubiertas : [], por_pedir_en_la_corrida_diaria: falta, ...(lectura ? { aviso_de_lectura: lectura } : {}),
    decisiones: r.decisiones.length, escrituras: r.escrituras, puente, errores: r.errores, juez: r.juez, modelos_llamados: r.juez.llamadas, apify_llamado: false,
  }
  if (v.dry_run) return { status: 200, body: { ...body, cerebro_listo: null, nota: 'dry_run: no se escribió nada, no se apagó nada y no se avisó' } }

  // el rastro: tipo despertar (ya lo dejó alimentarCliente) + el resumen propio; si el puente falló, la fila lo dice
  const fila = await deps.db.from('cerebro_portero_corridas').select('id, resumen').eq('client_id', v.client_id).eq('dia', dia).limit(1)
  const filaDeHoy = fila.error ? null : lista(fila.data)[0] ?? null
  const erroresDeRastro: string[] = []
  if (fila.error) erroresDeRastro.push(`rastro: ${fila.error.message}`)
  else if (!filaDeHoy) erroresDeRastro.push('rastro: no hay fila de hoy después de despertar')

  // el vigilante, igual que en la corrida diaria (sin la condición de gasto: el despertar no gasta y el gasto del día es del alta)
  const cierre = { fin: 'hecho', clientes: [{ cliente: v.client_id, errores: r.errores, puente: { quedan: quedan ?? 0, falla: puente?.lectura_fallida === true ? 'lectura fallida' : null }, alimentar: r.estado, plan_fallo: null }] }
  const cl = await deps.db.from('clients').select('name').eq('id', v.client_id).limit(1)
  const nombre = cl.error ? null : (lista(cl.data)[0]?.name as string | undefined) ?? null
  let ev = await evaluarCliente({ db: deps.db, interruptores: deps.interruptores, ahora }, { client_id: v.client_id, nombre }, cierre, ahora, dia, { sinGasto: true })
  let intentos = 1
  if (esSoloNoPudeComprobar([ev.r])) {
    await (deps.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))))(ESPERA_DEL_REINTENTO_MS)
    ev = await evaluarCliente({ db: deps.db, interruptores: deps.interruptores, ahora }, { client_id: v.client_id, nombre }, cierre, ahora, dia, { sinGasto: true })
    intentos = 2
  }
  const res: ResultadoDeCliente = ev.r
  const hayProblemas = res.problemas.length > 0
  if (filaDeHoy) {
    const resumen = esObjeto(filaDeHoy.resumen) ? filaDeHoy.resumen : {}
    const u = await deps.db.from('cerebro_portero_corridas').update({
      ...(conErrores ? { estado: 'con_errores' } : {}),
      resumen: { ...resumen, despertar: { ...resumenDelDespertar, completando }, vigilante: { ok: !hayProblemas, problemas: res.problemas, revisado_en: ahora.toISOString(), workflow_execution_id: v.workflow_execution_id, intentos } },
    }).eq('id', String(filaDeHoy.id))
    if (u.error) erroresDeRastro.push(`rastro: ${u.error.message}`)
  }
  if (erroresDeRastro.length) body.errores_de_rastro = erroresDeRastro

  // «cerebro listo» = corrida hecha + quedan 0 + vigilante en paz; y el alta tiene que haber dejado ALGO (si no raspó nada, el cerebro sigue vacío: la corrida diaria raspa todo, como hoy)
  const sinRaspado = r.unidades === 0
  // el despertar solo archivó lo que el alta trajo: el cerebro NO está listo hasta que la cadena que pide lo que falta termine (o venza la espera y se declaren huecos)
  const archivadoBien = !conErrores && quedan === 0 && !hayProblemas && r.estado === 'hecha'
  body.cerebro_listo = false
  if (archivadoBien) { body.pedir_ahora = true; body.completando = completando; body.motivo_no_listo = 'falta lo que el alta no trajo: la cadena del portero lo pide a continuación' }
  else body.pedir_ahora = false
  if (sinRaspado) body.sin_raspado_del_alta = true
  body.vigilante = { ok: !hayProblemas, problemas: res.problemas, intentos }
  if (hayProblemas) {
    const wf = deps.workflowIdPortero || FLUJO_DEL_PORTERO_POR_OMISION
    const ap = deps.apagar ? await deps.apagar(wf).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin forma de apagar el flujo' }
    const texto = lineaDeAlerta([res], ap.ok, wf, intentos, 'al despertar con el alta')
    const av = deps.avisar ? await deps.avisar(texto).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
    body.apagado = ap; body.aviso = { ...av, texto }
    return { status: ap.ok && av.ok ? 200 : 502, body: { ...body, ok: false } }
  }
  return { status: conErrores ? 502 : 200, body }
}

export type { Db }
