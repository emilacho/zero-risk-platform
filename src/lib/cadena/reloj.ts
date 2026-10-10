/**
 * /api/cadena/esperas · el reloj del vigía (diseño v2 §7.3 + condición 2 de CC#3).
 * Una pasada: latido · escalones de las esperas (una sola vez cada uno) · acción al vencer · llamadas colgadas · liberación de video · invariante V21 · avisos AGREGADOS por campaña.
 * El vigía manda los avisos; esta ruta decide cuáles y los devuelve (en ensayo o en seco se REGISTRAN, no se mandan).
 */
import type { Almacen, EsperaFila } from './almacen'
import { autorizarLlamada, cadena, err, type Respuesta } from './autorizar'
import { escalonQueToca, invarianteDeReloj, type Violacion } from './esperas'
import { abrirEsperaDe, resolverEsperas } from './nucleo'
import type { Fila } from './tipos'

type Linea = { campana_id: string; texto: string }

export async function relojDeLaCadena(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  // el vigía no es de un cliente: su `workflow_id` tiene que ser uno de los flujos de la cadena
  const wf = cadena(cuerpo.workflow_id), ex = cadena(cuerpo.workflow_execution_id)
  if (!wf || !ex) return err(400, 'E-WORKFLOW-CTX', 'la llamada necesita workflow_id y workflow_execution_id (los dos, siempre)')
  const flujos = await al.leerConfig('flujos')
  if (!(Array.isArray(flujos) && flujos.includes(wf))) return err(403, 'E-WORKFLOW-DESCONOCIDO', 'el reloj solo lo llama un flujo de la cadena')
  const estado = await al.leerConfig('estado_cadena')
  const seco = cuerpo.seco === true
  if (estado === 'apagada' && !seco) return { status: 200, cuerpo: { inactivo: true, motivo: 'la cadena está apagada: sin latido ni alarmas (nada que vigilar)' } }

  const lineas: Linea[] = []
  const aplicado: string[] = []
  const previo = await al.leerConfig('ultimo_latido')
  const latidoMax = typeof (await al.leerConfig('latido_max_horas')) === 'number' ? ((await al.leerConfig('latido_max_horas')) as number) : 18

  // 1 · llamadas colgadas: pasado su plazo se marcan vencidas (el siguiente `preparar` abre el intento que sigue)
  for (const c of await al.corridasEnCurso()) {
    if (c.plazo_en && Date.parse(ahora) > Date.parse(c.plazo_en)) {
      await al.cerrarCorrida(c.id, { estado: 'vencida', error: 'la llamada pasó su plazo sin volver' })
      aplicado.push(`corrida ${c.id} (${c.paso}) vencida`)
      lineas.push({ campana_id: c.campana_id, texto: `la llamada de ${c.paso} pasó su plazo sin volver (corrida ${c.id})` })
    }
  }

  // 2 · escalones de las esperas
  for (const e of await al.esperasVivas()) {
    const rung = escalonQueToca(e, ahora)
    if (rung === null) continue
    await al.actualizarEspera(e.id, { rung_enviado: rung })
    if (rung === 1) lineas.push({ campana_id: e.campana_id, texto: `recordatorio: ${e.objeto_tipo} ${e.objeto_id} sigue esperando` })
    else if (rung === 2) lineas.push({ campana_id: e.campana_id, texto: `alerta: ${e.objeto_tipo} ${e.objeto_id} lleva demasiado esperando` })
    else {
      aplicado.push(await alVencer(al, e, ahora, lineas))
      await al.actualizarEspera(e.id, { estado: 'vencida', rung_enviado: 3 })
    }
  }

  // 2b · barrido de campañas ATASCADAS (#466 C3 de CC#3): una campaña que sigue armando su estrategia o su calendario y cuya última llamada murió (vencida · fallida · cerrada por tope),
  //      sin ninguna en curso, no la mira nadie más: se avisa con «qué hacer». Una campaña sin llamadas (recién abierta) no es un atasco.
  for (const c of await al.campanasEnArmado()) {
    const corridas = (await al.corridasDeCampana(c.id)).sort((a, b) => a.id - b.id)
    if (!corridas.length || corridas.some((x) => x.estado === 'en_curso')) continue
    const ultima = corridas[corridas.length - 1]
    if (ultima.estado === 'ok') continue
    lineas.push({ campana_id: c.id, texto: `la campaña quedó en «${c.estado}»: su última llamada (${ultima.paso}, intento ${ultima.intento}) terminó ${ultima.estado} y no hay ninguna en curso. Qué hacer: reenviar el sobre del plan para que la cadena reintente` })
  }

  // 3 · el brazo de video: cuando opera, las filas que esperaban pasan a `validada`
  if ((await al.estadoDelBrazo('video')) === 'opera') {
    for (const c of await al.campanasActivas()) {
      const v = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
      const ids = (await al.filas(c.id, v)).filter((f) => f.estado === 'espera_video').map((f) => f.id)
      if (ids.length) {
        await al.cambiarEstadoDeFilas(c.id, v, ids, 'validada')
        for (const id of ids) await resolverEsperas(al, c.id, 'espera_video', id)
        aplicado.push(`${ids.length} fila(s) de video liberadas en ${c.id}`)
      }
    }
  }

  // 4 · el invariante V21 (con el latido ANTERIOR: así se ve que el vigía estuvo parado) y el latido nuevo
  const violaciones = await violacionesDeReloj(al, ahora, typeof previo === 'string' ? previo : null, latidoMax)
  await al.escribirConfig('ultimo_latido', ahora)
  for (const v of violaciones) lineas.push({ campana_id: 'sistema', texto: `V21 · ${v.tipo}: ${v.detalle}` })

  // 5 · resumen semanal (pausadas y video en espera): una línea por campaña, no por fila
  if (cuerpo.resumen === true) {
    for (const c of [...(await al.campanasActivas()), ...(await al.campanasEnEspera())]) {
      const v = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
      const fs = await al.filas(c.id, v)
      const video = fs.filter((f) => f.estado === 'espera_video')
      if (c.estado === 'pausada' || video.length) lineas.push({ campana_id: c.id, texto: `resumen: campaña ${c.estado}${video.length ? ` · ${video.length} pieza(s) de video esperando al brazo (la más próxima ${video.map((f) => f.fecha).sort()[0]})` : ''}` })
    }
  }

  // agregado por campaña: un solo mensaje por campaña y pasada (la protección contra el ruido)
  const porCampana = new Map<string, string[]>()
  for (const l of lineas) porCampana.set(l.campana_id, [...(porCampana.get(l.campana_id) ?? []), l.texto])
  const alertas = [...porCampana.entries()].map(([campana_id, ls]) => ({ campana_id, lineas: ls }))
  // en ensayo o en seco los avisos se REGISTRAN, no se mandan (salvo que `alertas_en_ensayo` diga «enviar»)
  const enviar = !seco && (estado === 'encendida' || (estado === 'ensayo' && (await al.leerConfig('alertas_en_ensayo')) === 'enviar'))
  return { status: 200, cuerpo: { latido: ahora, aplicado, violaciones, alertas, enviar_alertas: enviar } }
}

async function alVencer(al: Almacen, e: EsperaFila, ahora: string, lineas: Linea[]): Promise<string> {
  const v = Math.max(1, await al.ultimaVersionDeCalendario(e.campana_id))
  const marcar = async (estado: Fila['estado']) => { await al.cambiarEstadoDeFilas(e.campana_id, v, [e.objeto_id], estado) }
  switch (e.accion_al_vencer) {
    case 'perdio_su_fecha': await marcar('perdio_su_fecha'); lineas.push({ campana_id: e.campana_id, texto: `la pieza ${e.objeto_id} perdió su fecha sin aprobarse: no se publica` }); return `${e.objeto_id} perdió su fecha`
    case 'vencida_sin_brazo': await marcar('vencida_sin_brazo'); lineas.push({ campana_id: e.campana_id, texto: `la pieza de video ${e.objeto_id} venció sin brazo de video: no se sustituye` }); return `${e.objeto_id} vencida sin brazo`
    case 'fila_sale': await marcar('descartada_sin_fuente'); lineas.push({ campana_id: e.campana_id, texto: `la pieza ${e.objeto_id} salió: su dato no consiguió fuente` }); return `${e.objeto_id} salió sin fuente`
    case 'pausada': {
      const c = await al.campana(e.campana_id)
      if (c && c.estado === 'necesita_humano') {
        const n = await al.actualizarCampana(c.id, { estado: 'pausada', estado_motivo: 'pasaron 7 días en necesita_humano' })
        await abrirEsperaDe(al, n, 'campana_pausada', n.id, 'campaña pausada: se revisa en el resumen semanal', ahora, {}, `pausa:${n.id}:${ahora.slice(0, 10)}`)
        lineas.push({ campana_id: c.id, texto: 'la campaña pasó a pausada tras 7 días esperando a Emilio' })
      }
      return `campaña ${e.campana_id} pausada`
    }
    case 'resumen_semanal': {
      const c = await al.campana(e.campana_id)
      if (c && c.estado === 'pausada') await abrirEsperaDe(al, c, 'campana_pausada', c.id, 'sigue pausada: se revisa otra semana', ahora, {}, `pausa:${c.id}:${ahora.slice(0, 10)}`)
      return `pausa de ${e.campana_id} renovada`
    }
    default: return `${e.objeto_tipo} ${e.objeto_id}: ${e.accion_al_vencer}`
  }
}

export async function violacionesDeReloj(al: Almacen, ahora: string, ultimoLatido: string | null, latidoMaxHoras: number): Promise<Violacion[]> {
  const esperas = await al.esperasVivas()
  const campanas = [...(await al.campanasEnEspera())]
  const filasEnEspera: { id: string; estado: string; campana_id: string }[] = []
  for (const c of [...(await al.campanasActivas()), ...campanas]) {
    const v = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
    for (const f of await al.filas(c.id, v)) if (f.estado === 'en_investigacion' || f.estado === 'espera_video') filasEnEspera.push({ id: f.id, estado: f.estado, campana_id: c.id })
  }
  return invarianteDeReloj({
    ahora, esperas, campanasEnEspera: campanas.map((c) => ({ id: c.id, estado: c.estado })), filasEnEspera,
    esperasPorCampana: esperas.map((e) => ({ campana_id: e.campana_id, objeto_tipo: e.objeto_tipo, objeto_id: e.objeto_id })),
    corridasEnCurso: (await al.corridasEnCurso()).map((c) => ({ id: c.id, plazo_en: c.plazo_en })), ultimoLatido, latidoMaxHoras,
  })
}
