// J8b · EL GUION (las órdenes) con el mundo INYECTADO · CC#1 · 14-oct. Todo lo que toca n8n, la base o los archivos entra por `T`: así las guardas se prueban con un n8n y una base de mentira
// (reparo R2 de CC#3: el `main()` no tenía pruebas). La CLI (`jefatura-j8b.mjs`) solo arma el `T` real y llama a `ejecutar`.
// T = { ahora(), enVuelo(), flujo(id), flujos() → [{id}], ejecuciones(id) → [{id,status,startedAt}], respaldarFlujo(id, ruta) → {ok, texto}, diferencia(id, ruta) → {iguales, texto},
//       putFlujo(id, cuerpo), desactivar(id), rest(tabla, consulta, { method, body, prefer }), sha(texto), fs: { existe(p), leer(p), escribir(p, s), mkdir(p) } }
// Códigos de salida: 0 bien · 2 uso o carpeta mala · 3 una condición previa no se cumple (n8n ocupado, falta una confirmación, falta un paso anterior) · 4 el vivo no es igual al respaldo · 5 el respaldo falló · 6 el voto tiene llamadores vivos.
import { dentroDeLaBoveda, direccionesDe, ejecucionesRecientes, FLUJO_OFICINA, FLUJO_VOTO, NODO_AGENTE, paraLaOficina, pasosDeJ8b, planDeFilasDeContenido, planDePendientes, referenciasA } from './nucleo.mjs'

export const CABECERA_DEL_EDITOR = 'x-skip-editor-middleware'
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const cimiento = (xs) => JSON.stringify(xs.filter((f) => ['brand_book', 'icp', 'competitive'].includes(f.artifact_type)))
/** ¿la oficina viva ya lleva la cabecera en su nodo del agente? */
export const tieneLaCabecera = (flujo) => (flujo.nodes ?? []).find((n) => n.name === NODO_AGENTE)?.parameters?.headerParameters?.parameters?.some((h) => String(h.name).toLowerCase() === CABECERA_DEL_EDITOR) === true

/** @returns {Promise<{ codigo: number, lineas: string[] }>} */
export async function ejecutar(args, T) {
  const lineas = []
  const dice = (t) => lineas.push(t)
  const fin = (codigo, t) => { if (t) dice(t); return { codigo, lineas } }
  const orden = args[0]
  const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null }
  const aplicar = args.includes('--aplicar')
  const carpeta = flag('carpeta')
  const paso = (t) => dice((aplicar ? '▶ ' : '· (solo se imprime) ') + t)
  const archivo = (n) => `${String(carpeta).replace(/[\\/]+$/, '')}/${n}`
  const F_OFICINA = () => archivo(`respaldo-flujo-${FLUJO_OFICINA}.json`), F_VOTO = () => archivo(`respaldo-flujo-${FLUJO_VOTO}.json`)
  const exigirCarpeta = (escribe) => {
    if (!carpeta) return fin(2, 'falta --carpeta (la del respaldo)')
    if (dentroDeLaBoveda(carpeta)) return fin(2, 'la carpeta está dentro de la bóveda de secretos: los respaldos con texto de piezas van FUERA')
    if (escribe) T.fs.mkdir(carpeta)
    return null
  }
  const precondiciones = async () => { const v = await T.enVuelo(); return v !== 0 ? fin(3, `se detiene: n8n tiene ${v} ejecución(es) corriendo o esperando (debe haber 0)`) : null }
  const iguales = async (id, ruta) => { const r = await T.diferencia(id, ruta); return r.iguales ? null : fin(4, `se detiene: el flujo ${id} vivo NO es igual a su respaldo (otro cambio debajo):\n${r.texto ?? ''}`) }
  const cabeceraPuesta = async () => (tieneLaCabecera(await T.flujo(FLUJO_OFICINA)) ? null : fin(3, `se detiene: la cabecera ${CABECERA_DEL_EDITOR} aún NO está en la oficina viva: el orden firmado es jefatura probada en piezas → editor (cabecera) → voto y filas`))

  if (!orden || orden === 'plan') {
    dice('J8b · lo que se hace (en este orden) y cómo se deshace')
    pasosDeJ8b().forEach((p, i) => dice(`  ${i + 1}. [${p.paso}] ${p.que}\n       reversa: ${p.reversa}`))
    return fin(0, '\nAhora no se ha tocado nada.')
  }

  if (orden === 'respaldar') {
    const mala = exigirCarpeta(aplicar); if (mala) return mala
    paso(`respaldar en ${carpeta}: flujo ${FLUJO_OFICINA}, flujo ${FLUJO_VOTO}, filas de jefatura_grading_policies, filas editor_escalation`)
    if (!aplicar) return fin(0)
    for (const [id, ruta] of [[FLUJO_OFICINA, F_OFICINA()], [FLUJO_VOTO, F_VOTO()]]) { const r = await T.respaldarFlujo(id, ruta); dice(String(r.texto ?? '').trim()); if (!r.ok) return fin(5) }
    const pol = JSON.stringify(await T.rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc'), null, 2)
    T.fs.escribir(archivo('respaldo-politicas.json'), pol); dice('políticas · sha256 ' + T.sha(pol))
    const esc = JSON.stringify(await T.rest('hitl_pending_approvals', 'select=*&approval_type=eq.editor_escalation'), null, 2)
    T.fs.escribir(archivo('respaldo-editor-escalation.json'), esc); dice('editor_escalation · sha256 ' + T.sha(esc))
    return fin(0)
  }

  if (orden === 'comprobar') {
    const mala = exigirCarpeta(false); if (mala) return mala
    const pol = await T.rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc')
    const resp = JSON.parse(T.fs.leer(archivo('respaldo-politicas.json')))
    dice('cimiento idéntico al respaldo: ' + (cimiento(pol) === cimiento(resp)))
    dice('filas de contenido ahora: ' + JSON.stringify(pol.filter((f) => f.artifact_class === 'contenido').map((f) => [f.artifact_type, f.is_active])))
    const of = await T.flujo(FLUJO_OFICINA), vo = await T.flujo(FLUJO_VOTO)
    dice(`oficina: activa=${of.active} · cabecera en el agente: ${tieneLaCabecera(of)}`)
    dice(`voto: activo=${vo.active}`)
    dice('editor_escalation abiertas: ' + (await T.rest('hitl_pending_approvals', 'select=item_id&approval_type=eq.editor_escalation&status=in.(pending,notified,escalated)')).length)
    return fin(0)
  }

  if (orden === 'paso') {
    const cual = args[1]
    if (!['cabecera', 'voto', 'contenido', 'pendientes'].includes(cual)) return fin(2, 'paso desconocido: ' + cual)
    const mala = exigirCarpeta(false); if (mala) return mala
    const ocupado = await precondiciones(); if (ocupado) return ocupado

    if (cual === 'cabecera') {
      if (tieneLaCabecera(await T.flujo(FLUJO_OFICINA))) return fin(3, `se detiene: la oficina viva ya lleva la cabecera ${CABECERA_DEL_EDITOR} (no se pone dos veces)`)
      // el orden firmado se HACE cumplir: poner la cabecera exige declarar que la jefatura ya se probó en piezas (como el «dale» de J6)
      if (aplicar && !FECHA.test(String(flag('confirmo-j8a-probada') ?? ''))) return fin(3, 'se detiene: falta `--confirmo-j8a-probada AAAA-MM-DD` (la fecha en que CC#3 certificó J8a probada en piezas). Sin eso no se pone la cabecera.')
      const dif = await iguales(FLUJO_OFICINA, F_OFICINA()); if (dif) return dif
      const resp = JSON.parse(T.fs.leer(F_OFICINA()))
      const nuevo = paraLaOficina(resp)
      paso(`PUT del flujo ${FLUJO_OFICINA} con ${CABECERA_DEL_EDITOR}: 1 en «${NODO_AGENTE}» y la rama «esperar_jefatura» en «③ ¿Y ahora?» (${nuevo.nodes.length} nodos; no cambia si está activo)`)
      if (!aplicar) return fin(0)
      await T.putFlujo(FLUJO_OFICINA, { name: nuevo.name, nodes: nuevo.nodes, connections: nuevo.connections, settings: nuevo.settings })
      const despues = await T.flujo(FLUJO_OFICINA)
      dice(`activo (no se toca): ${despues.active} · cabecera puesta: ${tieneLaCabecera(despues)}`)
      return fin(0)
    }

    if (cual === 'voto') {
      const sinCab = await cabeceraPuesta(); if (sinCab) return sinCab
      const dif = await iguales(FLUJO_VOTO, F_VOTO()); if (dif) return dif
      const propio = await T.flujo(FLUJO_VOTO)
      const todos = []
      for (const w of await T.flujos()) todos.push(await T.flujo(w.id))
      const refs = referenciasA(todos, FLUJO_VOTO, { propio })
      if (refs.length) return fin(6, 'se detiene: el voto TIENE llamadores (por id o por dirección ' + JSON.stringify(direccionesDe(propio)) + '): ' + JSON.stringify(refs))
      const vistas = String(flag('ejecuciones-vistas') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      const dias = Number(flag('dias') ?? 7)
      const recientes = ejecucionesRecientes(await T.ejecuciones(FLUJO_VOTO), { ahora: T.ahora(), dias, vistas })
      if (recientes.length) return fin(6, `se detiene: el voto tiene ${recientes.length} ejecución(es) en los últimos ${dias} días que nadie reconoció (${recientes.map((e) => `${e.id}:${e.status}`).join(', ')}). Si las miraste y no son de un llamador, repite con --ejecuciones-vistas ${recientes.map((e) => e.id).join(',')}`)
      paso(`desactivar ${FLUJO_VOTO} (sin llamadores por id ni dirección en ${todos.length} flujos y sin ejecuciones sin reconocer en ${dias} días; no se borra)`)
      if (!aplicar) return fin(0)
      await T.desactivar(FLUJO_VOTO)
      dice('activo ahora: ' + (await T.flujo(FLUJO_VOTO)).active)
      return fin(0)
    }

    if (cual === 'contenido') {
      const sinCab = await cabeceraPuesta(); if (sinCab) return sinCab
      const filas = await T.rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc')
      const resp = JSON.parse(T.fs.leer(archivo('respaldo-politicas.json')))
      if (JSON.stringify(filas) !== JSON.stringify(resp)) return fin(4, 'se detiene: la tabla de políticas ya no es igual al respaldo')
      const plan = planDeFilasDeContenido(filas)
      paso(`UPDATE jefatura_grading_policies SET is_active=false WHERE ${plan.filtro} → ${plan.tipos.join(', ') || '(ya estaban apagadas)'} · cimiento intacto: ${plan.cimiento.join(', ')}`)
      if (!aplicar || !plan.tipos.length) return fin(0)
      const hechas = await T.rest('jefatura_grading_policies', plan.filtro, { method: 'PATCH', body: JSON.stringify(plan.cuerpo), prefer: 'return=representation' })
      dice('filas cambiadas: ' + hechas.map((f) => `${f.artifact_type}=${f.is_active}`).join(', '))
      const despues = await T.rest('jefatura_grading_policies', 'select=*&order=artifact_type.asc')
      dice('cimiento idéntico: ' + (cimiento(despues) === cimiento(resp)))
      return fin(0)
    }

    // pendientes
    const sinCab = await cabeceraPuesta(); if (sinCab) return sinCab
    if (!T.fs.existe(archivo('respaldo-editor-escalation.json'))) return fin(4, 'se detiene: falta el respaldo de las editor_escalation (paso «respaldar»)')
    const filas = await T.rest('hitl_pending_approvals', 'select=*&approval_type=eq.editor_escalation')
    const plan = planDePendientes(filas, { ahora: T.ahora() })
    paso(`marcar expired ${plan.por_cerrar.length} editor_escalation abierta(s) de ${plan.total_editor_escalation} (ya cerradas ${plan.ya_cerradas}; filas de otros tipos que NO se tocan: se filtra solo por approval_type)`)
    if (!aplicar || !plan.por_cerrar.length) return fin(0)
    const hechas = await T.rest('hitl_pending_approvals', plan.filtro, { method: 'PATCH', body: JSON.stringify(plan.cuerpo), prefer: 'return=representation' })
    dice('cerradas: ' + hechas.length)
    return fin(0)
  }

  return fin(2, 'orden desconocida: ' + orden)
}
