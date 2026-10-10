// Construye el alta y el Servicio ARREGLADOS (relevo 51) a partir de los respaldos ANTES. Desde la raiz del repo: node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-r51.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
const R = 'scripts/worker-staging/'
const alta = JSON.parse(fs.readFileSync(R + 'LyVoKcrypS5uLyuu/alta-ANTES-2026-10-10-r51.json', 'utf8'))
const svc = JSON.parse(fs.readFileSync(R + '3lyknrP3PoS2KzUf/servicio-ANTES-2026-10-10-r51.json', 'utf8'))
const nodo = (w, n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('no hallé el nodo ' + n); return x }
const cambia = (texto, a, b, que) => { if (texto.split(a).length !== 2) throw new Error('ancla no única o ausente: ' + que); return texto.replace(a, () => b) }
const idDe = (s) => { const h = crypto.createHash('sha1').update(s).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32) }

// ───────────── ALTA · 1 · Transform: la materia por código, sin corte por la cabeza ni en silencio
{
  const n = nodo(alta, '[JEFATURA] Transform discovery→package')
  let c = n.parameters.jsCode
  c = cambia(c, "    m.sitio_texto = String(s.sitio_texto || '').slice(0, 3500);\n  } catch (e) { m.sitio_estado = 'no_disponible'; }\n",
`    const _t = String(s.sitio_texto || '');
    // R2 (relevo 51) · nunca un corte por la cabeza EN SILENCIO: si se corta, el texto lo dice
    m.sitio_texto = _t.length > 3500 ? _t.slice(0, 3500) + '\\n[recortado por la cabeza: se leyeron 3500 de ' + _t.length + ' caracteres]' : _t;
  } catch (e) { m.sitio_estado = 'no_disponible'; }
  // R2 + R1 (relevo 51) · la materia ORDENADA POR CÓDIGO y recortada POR BLOQUE con aviso (ruta /api/manual/materia), y la frase propia LITERAL.
  // Si la ruta no contesta, se conserva lo de antes y se DECLARA (materia_estado), nunca en silencio.
  m.materia_estado = 'no_pedida'; m.frase_propia = null; m.estado_frase_propia = 'sin_dato'; m.frases_repetidas = []; m.materia_recortes = [];
  try {
    const r2 = $('[R2] Materia del cliente por código').first().json || {};
    if (r2.ok === true) {
      m.materia_estado = r2.estado === 'trajo' ? 'trajo' : 'sin_dato';
      if (r2.estado === 'trajo') {
        m.materia_recortes = Array.isArray(r2.recortes) ? r2.recortes : [];
        m.estado_frase_propia = r2.estado_eslogan || 'sin_dato';
        m.frase_propia = (r2.eslogan && r2.eslogan.literal) ? String(r2.eslogan.literal) : null;
        m.frases_repetidas = (Array.isArray(r2.frases_repetidas) ? r2.frases_repetidas : []).map((f) => f && f.literal).filter(Boolean).slice(0, 10);
        // lo que ven las lentes: la frase propia primero (la sacó el código, literal) y luego la materia ordenada
        m.sitio_texto = (m.frase_propia ? 'FRASE PROPIA DEL CLIENTE (literal, sacada por código de su título y su biografía): «' + m.frase_propia + '»\\n\\n' : '') + String(r2.texto || '');
        m.sitio_caracteres_total = Number(r2.total_original) || m.sitio_caracteres_total;
      }
    } else { m.materia_estado = 'sin_respuesta'; }
  } catch (e) { m.materia_estado = 'no_disponible'; }
`, 'transform · sitio')
  c = cambia(c, "if (r.ok === true) m.instagram_propio = String(r.datos || '').slice(0, 1000);",
    "if (r.ok === true) { const _d = String(r.datos || ''); m.instagram_propio = _d.length > 8000 ? _d.slice(0, 8000) + '\\n[recortado: se leyeron 8000 de ' + _d.length + ' caracteres]' : _d; }", 'transform · instagram')
  n.parameters.jsCode = c
}

// ───────────── ALTA · 2 · nodo nuevo: la materia por código (entre «Load landscape_summary» y «Transform»)
const ref = nodo(alta, '[JEFATURA] Load landscape_summary (canon)')
const NR2 = '[R2] Materia del cliente por código'
alta.nodes.push({
  parameters: {
    method: 'POST',
    url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/manual/materia",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ client_id: $('Validate Deal Data').first().json.client_id }) }}",
    options: { response: { response: { neverError: true } }, timeout: 60000 },
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [ref.position[0] + 220, ref.position[1] - 160],
  id: idDe(NR2), name: NR2, onError: 'continueRegularOutput',
})
alta.connections['[JEFATURA] Load landscape_summary (canon)'] = { main: [[{ node: NR2, type: 'main', index: 0 }]] }
alta.connections[NR2] = { main: [[{ node: '[JEFATURA] Transform discovery→package', type: 'main', index: 0 }]] }

// ───────────── ALTA · 3 · el descubridor: regla de citar, papel del lugar, la duda se conserva, el resumen no es fuente
{
  const n = nodo(alta, 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)')
  const reglas =
    " + String.fromCharCode(10) + '' + String.fromCharCode(10) + 'EVIDENCE RULES (mandatory) · (1) Every statement about the client carries its literal quote and where it came from. What the client says about itself is written as: the client says: «quote», and NEVER as a verified fact. (2) Words that raise certainty (traceability, verified, certified, guaranteed, only, first, best, no competitor, origin) may appear ONLY if that same word or a verification is in a primary source (the client site, its own social profile, its own maps profile). (3) Separate every place by ROLE: headquarters, delivery zone, product origin, market. A place that is only where the business is located must NEVER be used as the origin of the product. (4) If you have a doubt about a fact, do not drop it: write it at the end of competitive_landscape_summary under the heading DUDAS. (5) Your summary is a synthesis, not a source: later steps may not cite it as evidence.'"
  const a = "Return discovery report only AFTER the tool was called.'"
  n.parameters.jsonBody = cambia(n.parameters.jsonBody, a, a + reglas, 'descubridor')
}

// ───────────── ALTA · 4 · el chequeo de hechos DENTRO (código; ruta /api/manual/hechos), en serie tras «el cimiento pasó»
const NH = '[HECHOS] Chequeo por código del manual'
const NU = '[HECHOS] Unir el informe al ítem'
{
  const iff = nodo(alta, 'IF track_pass (¿el cimiento pasó de verdad?)')
  alta.nodes.push({
    parameters: {
      method: 'POST',
      url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/manual/hechos",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ client_id: $('Validate Deal Data').first().json.client_id }) }}",
      options: { response: { response: { neverError: true } }, timeout: 60000 },
    },
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [iff.position[0] + 180, iff.position[1] - 120],
    id: idDe(NH), name: NH, onError: 'continueRegularOutput',
  })
  alta.nodes.push({
    parameters: {
      jsCode:
`// Une el informe de hechos al ítem que ya venía (el resto del alta lo lee igual) · si la ruta no contestó, lo DICE.
const base = $('IF track_pass (¿el cimiento pasó de verdad?)').first().json || {};
let h = {};
try { h = $('${NH}').first().json || {}; } catch (e) { h = {}; }
const ok = h.ok === true;
return [{ json: Object.assign({}, base, { chequeo_hechos: ok
  ? { estado: 'revisado', manual_version: h.manual_version ?? null, total_hechos: h.total_hechos, resumen: h.resumen, sin_respaldo_n: Array.isArray(h.sin_respaldo) ? h.sin_respaldo.length : 0, sin_respaldo: (h.sin_respaldo || []).slice(0, 20) }
  : { estado: 'no_se_pudo', motivo: String(h.error || h.detail || 'la ruta no contestó') } }) }];`,
    },
    type: 'n8n-nodes-base.code', typeVersion: 2, position: [iff.position[0] + 400, iff.position[1] - 120], id: idDe(NU), name: NU,
  })
  const salida = alta.connections['IF track_pass (¿el cimiento pasó de verdad?)'].main
  if (salida[0].length !== 1 || salida[0][0].node !== '[MODELB] Emit · cimiento.promoted') throw new Error('la rama true del IF no es la esperada')
  salida[0] = [{ node: NH, type: 'main', index: 0 }]
  alta.connections[NH] = { main: [[{ node: NU, type: 'main', index: 0 }]] }
  alta.connections[NU] = { main: [[{ node: '[MODELB] Emit · cimiento.promoted', type: 'main', index: 0 }]] }
  // la carga de la segunda fase lleva el informe
  const c = nodo(alta, 'Armar carga · segunda fase')
  c.parameters.jsCode = cambia(c.parameters.jsCode, "  discovery_result_note:", "  // relevo 51 · el chequeo de hechos por código del manual recién promovido (null si la ruta no contestó)\n  chequeo_hechos: (() => { try { return $('" + NU + "').first().json.chequeo_hechos || null; } catch (e) { return null; } })(),\n  discovery_result_note:", 'carga')
}

// ───────────── SERVICIO · el rótulo «propio» solo cuando el objetivo es propio (metadata.target_kind === 'own')
{
  const n = nodo(svc, 'transform-sections')
  let c = n.parameters.jsCode
  c = cambia(c, 'const sectionLabel = {\n  facebook_ads_library_scraper', 'const sectionLabelBase = {\n  facebook_ads_library_scraper', 'servicio · base')
  c = cambia(c, "}[apifyFunction] || 'apify_scrape';\n",
`}[apifyFunction] || 'apify_scrape';
// relevo 51 · el rótulo dice de quién es: SOLO cuando quien llama declara que el objetivo es PROPIO (metadata.target_kind === 'own').
// Sin esa marca (corrida diaria, planeación…) nada cambia. La bio propia ya no se archiva como «competidor».
const rotuloPropio = { instagram_scraper: 'instagram_propio', facebook_page_scraper: 'facebook_page_propia', linkedin_company_scraper: 'linkedin_propio', tiktok_profile_scraper: 'tiktok_propio', youtube_channel_scraper: 'youtube_channel_propio', twitter_scraper: 'twitter_propio' };
const esPropio = !!(body && body.metadata && body.metadata.target_kind === 'own');
const sectionLabel = (esPropio && rotuloPropio[apifyFunction]) ? rotuloPropio[apifyFunction] : sectionLabelBase;
`, 'servicio · rótulo')
  n.parameters.jsCode = c
}

fs.writeFileSync(R + 'LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r51.json', JSON.stringify(alta, null, 1))
fs.writeFileSync(R + '3lyknrP3PoS2KzUf/servicio-ARREGLADO-2026-10-10-r51.json', JSON.stringify(svc, null, 1))
console.log('ok · alta', alta.nodes.length, 'nodos · servicio', svc.nodes.length)
