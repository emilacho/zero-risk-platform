// CICLO DEL PLAN · tramo 2 · CC2 · «Hermanas · expandir»: un ítem por hermana de la corrida (A, y B o C no elegidas) para que el PATCH siguiente las marque una por una.
// Sin hermanas devuelve UN ítem `ninguna:true` (un Code que devolviera cero ítems cortaría la cadena de cierres en silencio); el IF siguiente lo deja pasar sin PATCH.
const c = $('Ciclo · armar cierres').first().json
const hs = Array.isArray(c.hermanas) ? c.hermanas.filter((h) => h && h.id && h.provenance_tag) : []
if (!hs.length) return [{ json: { ninguna: true } }]
return hs.map((h) => ({ json: { id: h.id, provenance_tag: h.provenance_tag } }))
