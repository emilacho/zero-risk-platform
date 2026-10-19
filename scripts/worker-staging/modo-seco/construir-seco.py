#!/usr/bin/env python
"""
MODO SECO DEL ALTA (CC#1 · noche del 19-oct · orden de Lenovo 23:40) · constructor.

Toma los respaldos ANTES de cuatro flujos (alta, segunda fase, cimiento, lazo A) y escribe los ARREGLADO con el modo seco propagado.
Regla de oro: SIN `dry_run:true` en el pedido, NINGÚN flujo cambia de conducta (cada cambio es `dry ? lo seco : lo de siempre`).

  uso: python construir-seco.py <carpeta con los ANTES> <carpeta de salida>
       (los ANTES se llaman  <ID>-ANTES-seco-2026-10-19.json  y salen como  <ID>-ARREGLADO-seco-2026-10-19.json)
"""
import json, re, sys, os

IDS = {'LyVoKcrypS5uLyuu': 'ALTA', 'wu1DUAXIuEG5nNTX': 'SEGUNDA', 'ssLtwYPt7zxuvnM2': 'CIMIENTO', 'kSSAvCbEfHs2Hoa0': 'LAZO_A'}
ECO = "(($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/dry-run/eco')"


def cargar(ruta):
    w = json.load(open(ruta, encoding='utf-8'))
    cont = w if 'nodes' in w else next(v for v in w.values() if isinstance(v, dict) and 'nodes' in v)
    return w, cont


def nodo(cont, nombre, prefijo=False):
    c = [n for n in cont['nodes'] if (n['name'].startswith(nombre) if prefijo else n['name'] == nombre)]
    assert len(c) == 1, ('nodo no único o ausente', nombre, len(c))
    return c[0]


def insertar_en_cuerpo_plantilla(n, dry):
    """cuerpo `={ ... }` (JSON con plantillas): agrega `"dry_run": {{ dry }},` como primera clave"""
    jb = n['parameters']['jsonBody']
    assert jb.startswith('={') and not jb.startswith('={{'), ('cuerpo no es plantilla', n['name'])
    assert '"dry_run"' not in jb, ('ya tiene dry_run', n['name'])
    n['parameters']['jsonBody'] = '={\n  "dry_run": {{ ' + dry + ' }},' + jb[2:]


def reemplazar_unico(texto, a, b, donde):
    assert texto.count(a) == 1, ('patrón no único', donde, a[:60], texto.count(a))
    return texto.replace(a, b)


def cambiar_dry_false(n, dry, patron, nuevo):
    jb = n['parameters']['jsonBody']
    n['parameters']['jsonBody'] = reemplazar_unico(jb, patron, nuevo, n['name'])


def cambiar_a_eco(n, dry):
    """el nodo apunta al eco cuando es seco y a su destino de siempre cuando no. Agrega la llave interna SOLO en seco (nunca en real: algunos destinos son de terceros)."""
    p = n['parameters']
    u = str(p.get('url', ''))
    assert 'dry-run/eco' not in u, ('ya apunta al eco', n['name'])
    m = re.match(r'^=\{\{(.*)\}\}(.*)$', u, re.S)
    if m:
        interno = '(' + m.group(1).strip() + ')' + ((" + '" + m.group(2).replace("'", "\\'") + "'") if m.group(2) else '')
    else:
        interno = "'" + u.replace("'", "\\'") + "'"
    p['url'] = '={{ ' + dry + ' ? ' + ECO + ' : ' + interno + ' }}'
    p['sendHeaders'] = True
    hp = p.setdefault('headerParameters', {}).setdefault('parameters', [])
    if not any(h.get('name', '').lower() == 'x-api-key' for h in hp):
        hp.append({'name': 'x-api-key', 'value': '={{ ' + dry + ' ? $env.INTERNAL_API_KEY : \'\' }}'})


def construir_alta(cont):
    DRY = "$('Validate Deal Data').first().json.dry_run === true"
    # 1 · el validador normaliza el seco (solo booleano; cualquier otra cosa se para ANTES de gastar)
    v = nodo(cont, 'Validate Deal Data')
    c = v['parameters']['jsCode']
    assert 'MODO SECO' not in c
    cola = "return [{ json: b }];"
    assert c.rstrip().endswith(cola), 'el validador no termina como se esperaba'
    c = c.rstrip()[: -len(cola)] + (
        "// MODO SECO (noche 19-oct · CC#1) — `dry_run` ausente = real (como siempre); `true` = seco; cualquier otra cosa se PARA antes de gastar.\n"
        "if (b.dry_run !== undefined && b.dry_run !== null && typeof b.dry_run !== 'boolean') {\n"
        "  throw new Error('DRY_RUN_NO_BOOLEANO — `dry_run` debe ser true o false (llegó ' + JSON.stringify(b.dry_run) + '): no se corre nada.');\n"
        "}\n"
        "b.dry_run = b.dry_run === true;\n"
        + cola + "\n")
    v['parameters']['jsCode'] = c
    # 2 · las cinco llamadas a agentes
    for pref in ['Call Onboarding Specialist: Auto-Discovery Dispatch', 'Competitor Verdict', 'Re-gate INLINE', '[RD] Dispatch', '[RD] Re-dispatch']:
        insertar_en_cuerpo_plantilla(nodo(cont, pref, prefijo=True), DRY)
    # 3 · lo que no tiene modo seco propio → eco
    cambiar_a_eco(nodo(cont, '[APIFY] Scrape-Verify'), DRY)
    cambiar_a_eco([n for n in cont['nodes'] if 'Completar lo que falta' in n['name']][0], DRY)
    # 4 · lo que ya tenía dry_run pero fijo en falso, o solo por el ítem
    cambiar_dry_false([n for n in cont['nodes'] if 'FUENTES] Llamar al Servicio' in n['name']][0], DRY, 'dry_run: false', 'dry_run: ' + DRY)
    cambiar_dry_false([n for n in cont['nodes'] if 'Despertar el cerebro' in n['name']][0], DRY, 'dry_run: false', 'dry_run: ' + DRY)
    e57 = [n for n in cont['nodes'] if n['name'].startswith('E57') and 'planeaci' in n['name']][0]
    cambiar_dry_false(e57, DRY, '"dry_run": false,', '"dry_run": {{ ' + DRY + ' }},')
    aw = [n for n in cont['nodes'] if '[APIFY-WIRE] Call Apify Service Workflow' in n['name']][0]
    cambiar_dry_false(aw, DRY, 'dry_run: $json.dry_run === true', 'dry_run: ($json.dry_run === true || ' + DRY + ')')
    # 4b · el veredicto: en seco la respuesta de un agente es un texto canónico SIN veredicto; el seco ensaya el cable, así que el veredicto simulado es «confirmar» (hallazgo del ensayo 20-oct)
    for pref in ['Parse veredicto', 'Parse re-gate veredicto']:
        pn = nodo(cont, pref, prefijo=True)
        c = pn['parameters']['jsCode']
        assert 'MODO SECO' not in c
        marca = "if (perdida) { veredicto = 'no_se';"
        c = reemplazar_unico(c, marca, (
            "// MODO SECO (noche 19-oct · CC#1) — en seco la respuesta del agente es un texto canónico sin veredicto: el seco ensaya el cable, el veredicto simulado es «confirmar».\n"
            "let _seco = false; try { _seco = $('Validate Deal Data').first().json.dry_run === true; } catch (e) { _seco = false; }\n"
            "if (_seco) { perdida = null; veredicto = 'confirmar'; razones = ['modo seco: veredicto simulado']; confianza = 1; }\n") + marca, pn['name'])
        pn['parameters']['jsCode'] = c
    # 5 · las cargas que se le pasan a los sub-flujos llevan el seco
    tr = [n for n in cont['nodes'] if n['name'].startswith('[JEFATURA] Transform')][0]
    c = tr['parameters']['jsCode']
    c = reemplazar_unico(c, "  website: dealData.website || dealData.domain, discovery_package,", "  website: dealData.website || dealData.domain, discovery_package,\n  dry_run: dealData.dry_run === true,", tr['name'])
    # en seco el descubridor devuelve su texto canónico (sin descubrimiento real): el resumen simulado deja pasar el cable; SIN seco la regla de siempre (se PARA)
    c = reemplazar_unico(c, "const discovery_summary = String(src.discovery_summary || src.competitive_landscape_summary || '');",
                         "const discovery_summary = String(src.discovery_summary || src.competitive_landscape_summary || (dealData.dry_run === true ? 'MODO SECO: resumen simulado del descubrimiento (no hay datos reales)' : ''));", tr['name'])
    tr['parameters']['jsCode'] = c
    ac = [n for n in cont['nodes'] if n['name'].startswith('Armar carga')][0]
    c = ac['parameters']['jsCode']
    c = reemplazar_unico(c, "  _sala_correlation_id: v._sala_correlation_id,\n  // los cuatro", "  _sala_correlation_id: v._sala_correlation_id,\n  dry_run: v.dry_run === true,\n  // los cuatro", ac['name'])
    ac['parameters']['jsCode'] = c


def construir_segunda(cont):
    DRY = "$('Datos del alta').first().json.dry_run === true"
    for pref in ['Create Notion Client Workspace', 'Create Success Plan in Notion', 'Schedule Kickoff Call (Cal.com)', 'Alert Slack: Onboarding Initiated']:
        cambiar_a_eco(nodo(cont, pref), DRY)


def construir_cimiento(cont):
    DRY = "$('Validate Deal Data').first().json.dry_run === true"
    # 1 · el validador deja pasar el seco
    v = nodo(cont, 'Validate Deal Data')
    c = v['parameters']['jsCode']
    c = reemplazar_unico(c, "_sala_correlation_id: inp._sala_correlation_id || null, _journey_id: inp._journey_id || null } }];", "_sala_correlation_id: inp._sala_correlation_id || null, _journey_id: inp._journey_id || null, dry_run: inp.dry_run === true } }];", v['name'])
    v['parameters']['jsCode'] = c
    # 2 · el atajo seco: en seco el cimiento NO corre agentes; devuelve su contrato de «pasó» marcado como seco y el padre sigue
    conex = cont['connections']
    siguiente = conex['Validate Deal Data']['main'][0]
    assert [x['node'] for x in siguiente] == ['Confirm barato · competitor list'], siguiente
    si = {'id': 'seco-if', 'name': 'SECO · ¿es una corrida en seco?', 'type': 'n8n-nodes-base.if', 'typeVersion': 2, 'position': [1300, 40],
          'notes': 'Modo seco (noche 19-oct · CC#1): en seco el cimiento no llama a ningún agente. Sin dry_run:true todo sigue igual.',
          'parameters': {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2}, 'conditions': [{'id': 'seco', 'leftValue': '={{ ' + DRY + ' }}', 'rightValue': True, 'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}], 'combinator': 'and'}, 'options': {}}}
    ret = {'id': 'seco-retorno', 'name': 'SECO · devolver el contrato al padre', 'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': [1540, -60],
           'notes': 'Devuelve EXACTAMENTE el contrato del cimiento (`_cimiento_return`) como «pasó», marcado `dry_run`/`track_reason: dry_run`; no promueve nada, no escribe nada.',
           'parameters': {'jsCode': (
               "// MODO SECO (noche 19-oct · CC#1) — el cimiento NO corre en seco: devuelve su contrato de «pasó» para que el padre pruebe el resto del cable.\n"
               "const v = $('Validate Deal Data').first().json;\n"
               "return [{ json: {\n"
               "  fidelity_scores: {}, brand_book_draft: {}, client_id: v.client_id || null,\n"
               "  track_pass: true, track_published: true, track_marked: false, track_exhausted: false, fidelity_cycle: 1,\n"
               "  track_reason: 'dry_run', lazo_a: null, judge_incomplete: false, _return_source: 'dry_run',\n"
               "  pdf_manual: { solicitado: false, acuse: null, nota: 'modo seco: no se pidió el PDF' },\n"
               "  dry_run: true, _cimiento_return: true\n"
               "} }];\n")}}
    cont['nodes'].extend([si, ret])
    conex['Validate Deal Data'] = {'main': [[{'node': si['name'], 'type': 'main', 'index': 0}]]}
    conex[si['name']] = {'main': [[{'node': ret['name'], 'type': 'main', 'index': 0}], [{'node': 'Confirm barato · competitor list', 'type': 'main', 'index': 0}]]}
    # 3 · defensa en profundidad: aunque el atajo fallara, el pase a canon y la copia a Drive apuntan al eco en seco
    cambiar_a_eco(nodo(cont, '[BB] Promote → canon'), DRY)
    cambiar_a_eco(nodo(cont, '[BB] Manual → Drive (PDF)'), DRY)


CONSTRUCTORES = {'ALTA': construir_alta, 'SEGUNDA': construir_segunda, 'CIMIENTO': construir_cimiento}


def main():
    entrada, salida = sys.argv[1], sys.argv[2]
    os.makedirs(salida, exist_ok=True)
    for id_, nombre in IDS.items():
        src = os.path.join(entrada, f'{id_}-ANTES-seco-2026-10-19.json')
        w, cont = cargar(src)
        if nombre in CONSTRUCTORES:
            CONSTRUCTORES[nombre](cont)
        dst = os.path.join(salida, f'{id_}-ARREGLADO-seco-2026-10-19.json')
        open(dst, 'w', encoding='utf-8').write(json.dumps(w, ensure_ascii=False, indent=2))
        print(nombre, id_, 'nodos', len(cont['nodes']), '->', os.path.basename(dst))


if __name__ == '__main__':
    main()
