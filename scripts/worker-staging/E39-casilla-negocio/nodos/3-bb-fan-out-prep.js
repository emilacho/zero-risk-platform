// Brand Book · Fan-out prep · paso 2 · arma el grounding compartido para las 3
// lentes (brand-strategist · editor-en-jefe · jefe-client-success). Corre DESPUÉS
// de FASE 2 (Aggregate Apify listo) · fuera del gate Camino III. NO INSERT.

const dealData = $('Validate Deal Data').first().json;
const clientId = dealData.client_id;
const discoveryPkg =
  ($('Confirm barato · competitor list').first().json.discovery_package) || {};
const apifyAgg = (() => {
  try { return $('[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)').first().json; }
  catch (e) { return {}; }
})();

// 2026-08-04 (diff v2) · EL ICP LLEGA POR LA BASE, NO POR LA MEMORIA.
// En el tiro 76543 `discovery_package.icp_signals` vino con los 8 arreglos VACÍOS mientras
// `client_icp_documents` SÍ tenía el dato (el pain de la barrera idiomática). El escritor
// inventaba el ICP y el juez no podía fundamentarlo. Se carga de la base ANTES del fan-out
// para que la evidencia llegue PRIMERO al que escribe y después al que juzga.
//
// Lector `.all()` (🔴 CC#2): n8n parte los arrays de respuesta en ÍTEMS · con limit=5 el nodo
// emite 5 ítems y `.first()` tomaría 1 de 5 ⇒ el arreglo quedaría INERTE, degradando en verde.
// El `.filter` descarta además el {} de `alwaysOutputData` y el ítem de paso de `continueRegularOutput`.
const icpRows = (() => { try {
  return $('[BB] Load ICP (canon)').all()
    .map((i) => i.json)
    .filter((r) => r && (r.audience_segment || r.pain_points || r.goals));
} catch (e) { return []; } })();
// tope POR TAMAÑO, no sólo por cantidad · el presupuesto real del juez es ~1.735 chars
const capTxt = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
// 2026-08-07 (A · el recorte tiraba el segmento que el borrador AFIRMA) · el tope era 3 sobre
// 5 filas: se caian "Turista nacional ecuatoriano" y "Residente local y visitante recurrente
// de Olon". El borrador real de 76543 afirma un "SEGMENTO 3 · Comensal local / habitual de
// encebollado" = la fila 5. El juez veia el reclamo SIN la evidencia y lo castigaba
// (icp_summary 0.72/0.68). Tope 3->5 = el `limit=5` del lector: no puede haber mas filas.
const TOPE_ICP = 5;
// Reparto POR RONDA, no aplanado: aplanando, los 5 primeros dolores salian TODOS de las filas
// 1-2 y los segmentos 3-5 llegaban con nombre pero sin dolores ni objetivos (media reparacion).
// La ronda toma 1 por fila y da la vuelta => los 5 segmentos representados por 21 chars mas.
// Medido contra las 5 filas reales: 1345->1366 ch, tope 1700 (margen 334).
// 2026-08-08 (ATRIBUCION) · el juez veia 5 dolores en lista PLANA sin saber de que segmento era
// cada uno ⇒ no podia verificar "SEGMENTO 3 · Comensal local · pains: ..." ⇒ techo medido 0.845
// (8 muestras · 4/8 cruzan). Ahora cada dato viaja con su etiqueta [Sn].
// DEDUP fusionando etiquetas: un dato declarado por dos segmentos sale UNA vez como [S2,3] ·
// mas informativo y mas corto que repetirlo. CC#2: sin numeros repetidos + etiquetas ordenadas.
const flatIcp = (k) => {
  const porFila = icpRows.slice(0, TOPE_ICP)
    .map((s) => (Array.isArray(s[k]) ? s[k] : (s[k] ? [s[k]] : [])).filter(Boolean));
  const vistos = new Map();                       // texto -> [segmentos que lo declaran]
  for (let v = 0; vistos.size < TOPE_ICP; v++) {
    let sumo = false;
    for (let i = 0; i < porFila.length; i++) {
      if (porFila[i][v] === undefined) continue;
      sumo = true;
      const t = capTxt(porFila[i][v], 110);
      if (vistos.has(t)) { const a = vistos.get(t); if (a.indexOf(i + 1) === -1) a.push(i + 1); }
      else if (vistos.size < TOPE_ICP) vistos.set(t, [i + 1]);
    }
    if (!sumo) break;   // ninguna fila tiene el indice v => se agotaron => termina
  }
  return [...vistos.entries()].map(([t, ss]) => '[S' + ss.slice().sort((a, b) => a - b).join(',') + '] ' + t);
};
// ── LOS DOS CAMPOS QUE FALTABAN (2026-09-02 · GO Emilio) ──────────────────
// De los 11 campos que el descubrimiento recolecta para el perfil, al redactor
// le viajaban 5. Medido: el manual de GoEurope tiene EXACTAMENTE los 4 campos
// que se le pasan (dolores, metas, objeciones, canales) y nada mas. No fue el
// empleado ni el codigo: el pedido nunca los pidio, en NINGUNA version.
//
// Entran DOS, y por que:
//   decision_criteria  = "por que te eligen a vos" · materia prima de las
//                        propuestas de valor y los mensajes clave, que hoy
//                        salen provisionales (confianza 0,60). Solape con lo
//                        que ya viaja: 0,14 ⇒ aporta nuevo.
//   buying_process     = el camino real hasta la compra · materia prima del
//                        angulo de cliente (0,68) y la retencion (0,42), dos
//                        de las tres secciones mas flojas. Solape: 0,30.
// NO entran (medidos y descartados):
//   jobs_to_be_done    = las metas en otra gramatica · el mas caro (429 ch)
//   budget_range       = el precio YA le llega por el descubrimiento (CHF ...)
//   information_sources / key_messages_for_segment = VACIOS en 58 de 58 fichas
//
// ── EL FRENO DE PRESUPUESTO · por que existe ──────────────────────────────
// El tope de ~1.700 que menciona el comentario de arriba NO esta en el codigo:
// es una nota de medicion del 08-ago, tomada contra un pedido que desde
// entonces crecio de 8.419 a 10.199 caracteres sin que nadie la re-midiera.
// Los topes que SI se aplican son duros y silenciosos:
//     JSON.stringify(grounding).slice(0, 6800)   y   task.slice(0, 7900)
// Medido en la corrida real de GoEurope (exec 118856):
//     grounding 6.098/6.800 (margen 702) · pedido mas largo 7.314/7.900 (586)
// A 5 items x 110 los dos campos cuestan +768 ⇒ REVIENTAN los dos topes y el
// recorte parte el JSON por la mitad, en silencio. A 3 x 110 cuestan +578 y
// entran por OCHO caracteres. Ocho no es un margen: es una casualidad.
// Por eso el tamano no se fija, se PRESUPUESTA: se arma a 3 x 110 y si no
// entra en el presupuesto se recorta SOLO lo nuevo, nunca lo que ya viajaba.
const TOPE_ICP_NUEVOS = 3;
const CAP_ICP_NUEVOS = 110;
// 520 ch = el costo JSON de los dos a 3x110 medido en GoEurope (578) menos un
// margen deliberado. Sube o baja este numero y no se toca nada mas.
const PRESUPUESTO_ICP_NUEVOS = 520;
// Igual que flatIcp pero con tope y cap propios · misma forma de etiquetas [Sn].
const flatIcpNuevo = (k) => {
  const porFila = icpRows.slice(0, TOPE_ICP)
    .map((s) => (Array.isArray(s[k]) ? s[k] : (s[k] ? [s[k]] : [])).filter(Boolean));
  const vistos = new Map();
  for (let v = 0; vistos.size < TOPE_ICP_NUEVOS; v++) {
    let sumo = false;
    for (let i = 0; i < porFila.length; i++) {
      if (porFila[i][v] === undefined) continue;
      sumo = true;
      const t = capTxt(porFila[i][v], CAP_ICP_NUEVOS);
      if (vistos.has(t)) { const a = vistos.get(t); if (a.indexOf(i + 1) === -1) a.push(i + 1); }
      else if (vistos.size < TOPE_ICP_NUEVOS) vistos.set(t, [i + 1]);
    }
    if (!sumo) break;
  }
  return [...vistos.entries()].map(([t, ss]) => '[S' + ss.slice().sort((a, b) => a - b).join(',') + '] ' + t);
};
// Costo REAL en el JSON que se recorta (clave + comillas + comas), no el largo del texto.
const _costoJson = (clave, arr) => (arr.length ? JSON.stringify({ [clave]: arr }).length - 2 : 0);
// Recorta SOLO los dos nuevos hasta entrar. Prioridad medida: los criterios de
// decision valen mas que el proceso de compra (solape 0,14 vs 0,30), asi que el
// que pierde items primero es el proceso de compra. Si aun asi no entra, se
// vacian los dos: el pedido queda EXACTAMENTE como hoy, nunca truncado.
const _ajustarNuevos = (crit, compra) => {
  let c = crit.slice(), p = compra.slice();
  const costo = () => _costoJson('decision_criteria', c) + _costoJson('buying_process', p);
  while (costo() > PRESUPUESTO_ICP_NUEVOS && (c.length || p.length)) {
    if (p.length >= c.length && p.length) p.pop();
    else if (c.length) c.pop();
  }
  return { decision_criteria: c, buying_process: p, _recortado: (c.length !== crit.length || p.length !== compra.length) };
};
const _nuevosIcp = _ajustarNuevos(flatIcpNuevo('decision_criteria'), flatIcpNuevo('buying_process'));

const icpDesdeBase = icpRows.length ? {
  // CC#2 · la etiqueta se ata a la POSICION DE FILA, no al orden despues de filtrar: un
  // audience_segment vacio correria los indices y [S3] dejaria de ser la fila 3. Y toda fila
  // recibe etiqueta (con nombre o sin el) ⇒ NUNCA una [Sn] huerfana en dolores/objetivos.
  segments: icpRows.slice(0, TOPE_ICP).map((s, i) => '[S' + (i + 1) + '] ' +
    (s.audience_segment ? capTxt(s.audience_segment, 90) : '(segmento sin nombre)')),
  pain_points: flatIcp('pain_points'),
  goals: flatIcp('goals'),
  objections: flatIcp('objections'),
  preferred_channels: flatIcp('preferred_channels'),
  // Los dos nuevos van AL FINAL y solo si tienen contenido: un cliente sin
  // estos datos produce un bloque byte-identico al de hoy.
  ...(_nuevosIcp.decision_criteria.length ? { decision_criteria: _nuevosIcp.decision_criteria } : {}),
  ...(_nuevosIcp.buying_process.length ? { buying_process: _nuevosIcp.buying_process } : {}),
} : null;
// preferencia: lo de la CORRIDA si vino poblado · la base como fuente cuando no
const _icpMem = discoveryPkg.icp_signals || discoveryPkg.icp || null;
const _memTieneAlgo = !!_icpMem && Object.keys(_icpMem).some((k) => Array.isArray(_icpMem[k]) && _icpMem[k].length);
const icpFinal = _memTieneAlgo ? _icpMem : icpDesdeBase;

// centinelas · 'unknown' NO es evidencia · se filtra EN EL ORIGEN porque el que inventa
// es el ESCRITOR (las lentes), no sólo el juez · cubre a los dos consumidores de una vez.
const SENTINELAS = new Set(['unknown', 'no especificado', 'n/a', 'na', '-', '']);
const ev = (v) => { const s = String(v == null ? '' : v).trim().toLowerCase(); return SENTINELAS.has(s) ? '' : String(v).trim(); };

// Evidencia real ya en el brain · es el grounding de las 3 lentes (cero invención).
const grounding = {
  client_id: clientId,
  client_name: ev(dealData.client_name),
  industry: ev(dealData.industry),
  website: ev(dealData.website),
  discovery_summary: discoveryPkg.discovery_summary || '',
  // E39 (CC#2 2026-09-15) · tercer y ultimo filtro · aca la casilla entra a la
  // EVIDENCIA de las tres lentes. NO figura en _SACRIFICIO_EV a proposito: el
  // resumen es sacrificable, que ES el negocio no.
  business_model: discoveryPkg.business_model || '',
  competitors: (discoveryPkg.competitors || []).slice(0, 8),
  icp_signals: icpFinal,
  apify_sources: (apifyAgg.sources || apifyAgg.results || []).slice(0, 10),
  _icp_source: _memTieneAlgo ? 'corrida' : (icpRows.length ? 'client_icp_documents' : 'ninguna'),
  _icp_rows: icpRows.length,
};

// Un item por lente · cada uno con su task scoped a su skill (disciplina de fan-out:
// solo los 3 contribuyentes relevantes · NO los 38 · §150).
const _PROSA =
  'Construí TU sección del brand book SOLO desde la evidencia real del cliente abajo ' +
  '(web/redes/discovery/Apify). NO inventes. CUANDO TENGAS TU SECCIÓN LISTA, LLAMÁ EL TOOL ' +
  '`emit_brand_section` con tus campos (pasá `lens` con tu nombre de lente). NO narres la ' +
  'respuesta · usá el tool · es la ÚNICA forma en que tu sección llega al consolidador. ' +
  // 2026-08-08 (LINEA DEL ESCRITOR) · la leyenda de las [Sn] vivia SOLO en [BB] Judge prep: el
  // escritor recibia la notacion sin explicacion NI instruccion. Dos riesgos: (1) tener que
  // inferir el mapeo, (2) COPIAR las etiquetas al manual ⇒ el artefacto que se promueve a canon
  // saldria contaminado con notacion interna. Superficie estrenada 07-ago · la prueba de $0.20
  // no la cubre (inyecta el borrador viejo con las lentes apagadas) ⇒ correria 1a vez en el tiro.
  'Las etiquetas [Sn] del ICP indican a qué segmento pertenece cada dato (un dato puede ' +
  'pertenecer a varios) · usalas para NO mezclar segmentos · NUNCA las copies al texto del ' +
  'brand book. ' +
  'Grounding cada afirmación en la evidencia.';
// FASE 1 p2 (2026-08-09) · se parte la prosa de la evidencia para poder poner la INSTRUCCION
// ANTES de la evidencia en las lentes que crecen (H2). `base` se reconstruye IDENTICO a como
// estaba: brand-strategist lo sigue usando y su tarea sale BYTE-IDENTICA (Q2b · protege el gate).
// ── TOPE REAL · 14.000 · copiado del gemelo [BB] Judge prep (2026-09-03) ──────────
// Acá vivía: «guard final · run-sdk rechaza task > 8000 chars (E-INPUT-INVALID)».
// Era falso DOS veces y sobrevivió tres semanas:
//  (1) el endpoint NUNCA rechazó · sanitizeString RECORTA EN SILENCIO
//      (src/lib/validation.ts:15-20 · documentado en run-sdk/route.ts:241-247);
//  (2) desde el 11-ago los DOS topes reales están en 16.000 y atados por una prueba
//      (contracts/inputs/agents-run-sdk.json:18 · TASK_MAX_CHARS · task-cap.test.ts).
// El número NO se inventa: el gemelo [BB] Judge prep midió 12.770 de pedido entero y
// eligió 14.000 — ~10% sobre lo medido y 2.000 de colchón contra el techo del endpoint.
// Mismo criterio, mismo número.
const TOPE_TASK = 14000;
const CAB_EV = '\n\nEVIDENCIA:\n';

// Las tres secciones a constantes: hay que conocer su largo ANTES de presupuestar la
// evidencia. El TEXTO de cada una queda byte-idéntico al de hoy.
const _SEC_BS = '\n\nTU SECCIÓN: positioning + icp (audience_segment, pains, goals).';
const _SEC_EJ = '\n\nTU SECCIÓN: voice_description + forbidden_words[] + required_terminology[]'
  + ' + personalidad[] (3-6 rasgos de la voz OBSERVADA en la evidencia · no aspiracionales)'
  + ' + tagline_opciones[] (2-3 · destilación del positioning · es una ELECCIÓN, no un hecho)'
  + ' + mensajes_clave[] (3-5 · desde los dolores/objetivos del ICP + el positioning).';
const _SEC_JCS = '\n\nTU SECCIÓN: customer_angle + retention_notes'
  + ' + mision (qué hace el negocio y para quién · 1-2 frases)'
  + ' + proposito (el "por qué", inferido de la evidencia · aspiracional · 1 frase)'
  + ' + propuestas_de_valor[] (3-5 · diferenciadores REALES contra los competidores de la evidencia).';

// FASE 1 p2 · Q2(b) del Consejero: los 6 campos nuevos van a las DOS lentes NO gateadas.
// brand-strategist NO se toca: emite los mismos 2 campos que hoy ⇒ un truncado de salida
// (P5) NO puede desplazar positioning/icp_summary, porque su carga util no cambio ni un byte.
// El estampado viaja en _meta (propiedad PARALELA · CC#1 la declaro en el esquema): ningun
// campo existente cambia de tipo ⇒ el gate queda byte-identico tambien a nivel de esquema.
const REGLA_PROV = '\nPara los campos NUEVOS agregá `_meta` con { fuente, confianza } por campo: `fuente` cita el fragmento de la EVIDENCIA que lo sostiene y `confianza` es 0..1. Si la evidencia NO alcanza para un campo, devolvelo VACÍO con confianza 0 · NUNCA lo inventes. Un campo vacío es un resultado honesto y esperado.';

// ── EVIDENCIA POR PRIORIDAD · ENTERA O NADA · nunca a mitad de cadena ────────────
// Antes había DOS recortes ciegos en fila: JSON.stringify(grounding).slice(0,6800) y
// después task.slice(0,7900). El 03-sep (exec 121007) partieron decision_criteria a
// mitad de cadena en DOS de las tres lentes — JSON roto — y NADA lo declaró.
// Método copiado del gemelo [BB] Judge prep (los NO gateados · enteros o nada · lo que
// no entra se declara): se arma por CLAVES · cada clave entra COMPLETA o no entra.
// icp_signals NO figura en el orden de sacrificio: es el bloque que las tres lentes
// tienen INSTRUCCIÓN de usar y adentro viven los campos nuevos. Ése es el ÚNICO cambio
// deliberado de prioridad frente al recorte ciego de hoy (hoy icp_signals muere ANTES
// que competitors sólo por su posición dentro del objeto, no por su valor).
const _SACRIFICIO_EV = ['apify_sources', 'competitors', 'discovery_summary'];
const _evidencia_omitida = [];
// El presupuesto se mide contra la lente MÁS APRETADA para que las tres sigan recibiendo
// la MISMA evidencia · propiedad de hoy que no se cambia.
const _FIJO_MAX = Math.max(
  _PROSA.length + _SEC_BS.length,
  _PROSA.length + _SEC_EJ.length + REGLA_PROV.length,
  _PROSA.length + _SEC_JCS.length + REGLA_PROV.length
);
const _PRESUP_EV = TOPE_TASK - _FIJO_MAX - CAB_EV.length;
const _evidencia = (() => {
  const g = {};
  for (const k of Object.keys(grounding)) g[k] = grounding[k];
  for (const k of _SACRIFICIO_EV) {
    if (JSON.stringify(g).length <= _PRESUP_EV) break;
    if (!(k in g)) continue;
    delete g[k];
    _evidencia_omitida.push(k);
  }
  return g;
})();
const _EV = CAB_EV + JSON.stringify(_evidencia);
const base = _PROSA + _EV;   // <- forma de HOY · brand-strategist sin cambios

// guard de ÚLTIMO RECURSO · con el reparto de arriba no debería morder nunca.
// Si muerde, se DECLARA (igual que _task_recortado del gemelo): nunca un corte mudo.
const _lentes_recortadas = [];
const cap = (t, lente) => {
  if (t.length <= TOPE_TASK) return t;
  _lentes_recortadas.push({ lente: lente, pedia: t.length, entro: TOPE_TASK });
  return t.slice(0, TOPE_TASK);
};

const lenses = [
  { lens: 'brand-strategist', agent: 'brand-strategist',
    task: cap(base + _SEC_BS, 'brand-strategist') },
  { lens: 'editor-en-jefe', agent: 'editor-en-jefe',
    task: cap(_PROSA + _SEC_EJ + REGLA_PROV + _EV, 'editor-en-jefe') },
  { lens: 'jefe-client-success', agent: 'jefe-client-success',
    task: cap(_PROSA + _SEC_JCS + REGLA_PROV + _EV, 'jefe-client-success') },
];

// FIX-FORWARD 2026-06-30 (Fix B · fan-out routing) · emití UN solo item con las
// 3 tasks keyed por lente · cada nodo-lente lee SU task ($json.tasks.<lente>).
// Antes emitía 3 items → n8n mandaba los 3 a cada nodo → mis-routing (solo 1
// lente emitía · exec 41641). Un item = cada lente corre 1 vez con su task.
const tasks = {
  'brand-strategist': lenses[0].task,
  'editor-en-jefe': lenses[1].task,
  'jefe-client-success': lenses[2].task,
};

// ── EL CORTE SE DECLARA · 2026-09-03 ─────────────────────────────────────────────
// _recortado se calculaba desde el 02-sep (L130) y NO SE USABA en ninguna parte: una
// única aparición en todo el nodo. Acá se usa por fin. Un corte silencioso de este nodo
// no vuelve a pasar: si algo se cede, sale en el dato y se puede avisar.
const _margen = (t) => TOPE_TASK - t.length;
const _corte = {
  hubo: _evidencia_omitida.length > 0 || _lentes_recortadas.length > 0 || _nuevosIcp._recortado === true,
  tope: TOPE_TASK,
  evidencia_omitida: _evidencia_omitida,
  lentes_recortadas: _lentes_recortadas,
  icp_nuevos_recortados: _nuevosIcp._recortado === true,
  chars_por_lente: {
    'brand-strategist': tasks['brand-strategist'].length,
    'editor-en-jefe': tasks['editor-en-jefe'].length,
    'jefe-client-success': tasks['jefe-client-success'].length,
  },
  margen_por_lente: {
    'brand-strategist': _margen(tasks['brand-strategist']),
    'editor-en-jefe': _margen(tasks['editor-en-jefe']),
    'jefe-client-success': _margen(tasks['jefe-client-success']),
  },
  client_id: clientId,
};
_corte.detalle = _corte.hubo
  ? ('CORTE en el armado del pedido · cliente ' + clientId
     + (_evidencia_omitida.length ? ' · evidencia omitida: ' + _evidencia_omitida.join(', ') : '')
     + (_lentes_recortadas.length ? ' · lentes recortadas: ' + _lentes_recortadas.map(function (x) { return x.lente + ' (' + x.pedia + '-' + x.entro + ')'; }).join(', ') : '')
     + (_nuevosIcp._recortado === true ? ' · campos ICP nuevos recortados por presupuesto' : ''))
  : '';
return [{ json: { tasks, client_id: clientId, _grounding_refs: grounding, _corte: _corte } }];