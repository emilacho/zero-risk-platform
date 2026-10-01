// ⑤ GUARDA · ¿EL CORREDOR TRAE LOS LÍMITES DE «MIRAR AFUERA»? · CC#1 · 2026-10-01 · encargo Lenovo «poner en verde el PR #418» punto 3 (OBLIGATORIO · canon de Emilio: nada que dependa de que alguien se acuerde del orden de publicación).
// El flujo manda `mirar_afuera_limites` (máximo de pedidos y opciones permitidas) para que el SISTEMA los haga cumplir. Si el corredor NO trae ese cambio (PR #418) lo ignora EN SILENCIO y el agente
// quedaría con «máximo 4 / sin anuncios» sólo como texto. Por eso, ANTES de pagar, se le pregunta al corredor qué sabe hacer (`GET /health` → `capacidades`) y, si no trae los límites, la corrida se DETIENE con motivo.
// (La otra mitad —que Vercel leyó y reenviará los límites— se verifica en `⑥ ¿Aceptó el pedido?` con el ECO del acuse.)
const c = $('⑤ Armar el cuerpo del productor').first().json
const e = $input.first().json || {}
const r = e.body && typeof e.body === 'object' ? e.body : e
// el nodo HTTP falló (red, tiempo): n8n entrega `{error:{…}}` con `error` OBJETO
if (r.error && typeof r.error === 'object') {
  throw new Error('PIEZA_CORREDOR_NO_RESPONDE · no se pudo preguntar al corredor qué sabe hacer (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · no se puede dar por hecho que hará cumplir los límites de «mirar afuera» · se DETIENE antes de gastar')
}
const cap = r.capacidades && typeof r.capacidades === 'object' ? r.capacidades : null
if (!cap || !(Number(cap.mirar_afuera_limites) >= 1)) {
  throw new Error('PIEZA_CORREDOR_SIN_LIMITES · el corredor NO dice saber hacer cumplir los límites de «mirar afuera» (capacidades: ' + JSON.stringify(cap) + ') · sin ese cambio el máximo de pedidos y las opciones prohibidas quedarían como simple texto · se DETIENE antes de gastar · publicar primero el PR #418')
}
return [{ json: c }]
