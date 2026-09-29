// ③c JUNTAR LA LISTA Y LAS TANDAS · CC#1 · 2026-09-29. Arma el parte que ④ revisa. NO corrige nada: junta y declara.
// `llego_la_vuelta` = llegó la lista Y llegó CADA tanda. Si falta una vuelta, NO se guarda nada (regla de Emilio 29-sep).
const c = $('③a ¿Llegó la lista?').first().json
// La salida «terminado» del recorrido (SplitInBatches v3) acumula el resultado de TODAS las tandas que volvieron por el bucle.
// (`$('nodo').all()` dentro de un bucle solo devuelve la ÚLTIMA pasada: no sirve para juntarlas.)
const tandas = $input.all().map((i) => i.json).sort((a, b) => a.tanda_n - b.tanda_n)
const lista = c.lista
const llegoTodo = c.lista_llego === true && tandas.length > 0 && tandas.every((t) => t.llego === true)
const sinVuelta = tandas.filter((t) => t.llego !== true).map((t) => t.tanda_n)
const ilegibles = tandas.filter((t) => t.llego === true && t.legible !== true).map((t) => t.tanda_n)

// los briefs, en el orden de la lista; lo que falte se DECLARA (④ lo cuenta como entregable_sin_brief)
const porId = {}
for (const t of tandas) for (const e of t.entregables) if (e && e.id) porId[String(e.id)] = e
const listaIds = lista.entregables.map((e) => String(e.id))
const entregables = listaIds.map((id) => porId[id]).filter(Boolean)
const extras = Object.keys(porId).filter((id) => listaIds.indexOf(id) === -1) // briefs de ids que NO están en la lista

const parte = {
  entregables,
  pendientes_declarados: lista.pendientes_declarados || [],
  huecos: lista.huecos || [],
  contradicciones_plan_vs_manual: lista.contradicciones_plan_vs_manual || [],
  dependencias: lista.dependencias || [],
}
const crudos = tandas.filter((t) => t.texto_crudo).map((t) => 'TANDA ' + t.tanda_n + ':\n' + t.texto_crudo)
const costo = [c.lista_costo_usd].concat(tandas.map((t) => t.costo_usd)).filter((x) => typeof x === 'number').reduce((s, x) => s + x, 0)
return [{
  json: {
    ...c,
    llego_la_vuelta: llegoTodo,
    vuelta_real: c.lista_real === true && tandas.every((t) => t.llego_real === true),
    simulacro_usado: c.simulacro_usado === true || tandas.some((t) => t.simulacro_usado === true),
    tandas_total: tandas.length,
    tandas_sin_vuelta: sinVuelta,
    tandas_ilegibles: ilegibles,
    lista_ids: listaIds,
    ids_extra_no_pedidos: extras,
    texto: JSON.stringify({ parte }),
    caracteres: JSON.stringify({ parte }).length,
    respuestas_crudas_ilegibles: crudos,
    vuelta_costo_usd: costo || null,
    vuelta_modelo: c.lista_modelo,
    dry_runs_enviados: [c.cuerpo.dry_run].concat(tandas.map((t) => t.dry_run_enviado)),
    motivo: llegoTodo
      ? null
      : !c.lista_llego
        ? c.motivo
        : 'faltan vueltas: tandas sin llegar [' + sinVuelta.join(', ') + '] · NO se da por exitosa · NO se guarda nada' + (tandas.filter((t) => t.llego !== true && t.error_del_corredor).map((t) => ' · tanda ' + t.tanda_n + ': ' + t.error_del_corredor).join('')),
  },
}]
