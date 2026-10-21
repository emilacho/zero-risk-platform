// DECIDIR Y ARMAR · CC#1 · 2026-10-21 · lógica en barrido-logica.js. El intento se anota SIEMPRE (huella + día): sin entradas nuevas no se repite, y hay tope por día.
const piso = $input.first().json
const eleg = $('Elegir el cliente').first().json
const nuevo = piso.brand_book_draft && piso.brand_book_draft.visual
const antes = eleg.brand_book_draft && eleg.brand_book_draft.visual
const est = $getWorkflowStaticData('global')
est.intentos = est.intentos || {}
const hoy = new Date().toISOString().slice(0, 10)
est.global = est.global && est.global.dia === hoy ? est.global : { dia: hoy, n: 0 }
est.global.n = (Number(est.global.n) || 0) + 1 // tope global del día entre todos los clientes (cada corrida del piso puede gastar un modelo)
const prev = est.intentos[eleg.client_id]
est.intentos[eleg.client_id] = { huella: eleg.huella, dia: hoy, n: (prev && prev.dia === hoy ? (Number(prev.n) || 0) : 0) + 1 }
const m = mejoraElVisual(antes, nuevo, nombreDeTipografiaObservada, eleg.columnas, { primary_colors: piso.brand_book_draft && piso.brand_book_draft.primary_colors, typography: piso.brand_book_draft && piso.brand_book_draft.typography })
if (!nuevo || !m.mejora) return [{ json: { client_id: eleg.client_id, promover: false, motivo: m.motivo, estado_antes: antes && antes.estado, estado_nuevo: nuevo && nuevo.estado, error: nuevo && nuevo.error } }]
const cuerpo = armarCuerpoDelManual({ borrador: piso.brand_book_draft, huella: eleg.huella, previo: eleg.previo, ahora: new Date().toISOString() })
return [{ json: { client_id: eleg.client_id, promover: true, motivo: m.motivo, estado_antes: antes && antes.estado, estado_nuevo: nuevo.estado, cuerpo: cuerpo } }]
