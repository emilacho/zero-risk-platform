// ③b ARMAR LAS TANDAS · CC#1 · 2026-09-29. Parte la lista cerrada en tandas de `tanda` entregables (1-3, por defecto 2): una salida por tanda.
// Cada tanda es UNA llamada al redactor; cada una debe caber en los 800 s de la función de Vercel (~2 entregables ≈ 8 min medidos).
const c = $input.first().json
const ents = c.lista.entregables
const n = c.tanda
const tandas = []
for (let i = 0; i < ents.length; i += n) tandas.push(ents.slice(i, i + n))
return tandas.map((lote, k) => ({
  json: {
    tanda_n: k + 1,
    tandas_total: tandas.length,
    ids: lote.map((e) => String(e.id)),
    entregables_lista: lote,
  },
}))
