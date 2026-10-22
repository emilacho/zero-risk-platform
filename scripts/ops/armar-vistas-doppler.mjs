#!/usr/bin/env node
// VISTAS DE MÍNIMO PRIVILEGIO EN DOPPLER · cada lugar (agent-runner, n8n, CI) recibe SOLO lo que usa, como REFERENCIAS al proyecto fuente (`${zero-risk.prd.NOMBRE}`), nunca como copia.
// (22-oct · ENCARGO «rotación rápida con Doppler» · medido: una referencia entre proyectos resuelve al mismo valor, largo 64 = 64.)
// Este guion NUNCA lee un valor: solo nombres. Es repetible: cada vez que Emilio pega una llave nueva en `prd`, se vuelve a correr y las vistas completan las que faltaban.
//
// Uso: node scripts/ops/armar-vistas-doppler.mjs --seco                       (qué haría)
//      node scripts/ops/armar-vistas-doppler.mjs --ejecutar [--vista zero-risk-runner]
import { spawnSync } from 'node:child_process'
import { ejecutarDoppler } from './generar-secretos-grupo-c.mjs'

export const FUENTE = { proyecto: 'zero-risk', config: 'prd' }

/** proyecto de la vista → { uso, nombres }. Los nombres salen del README del runner, de ci.yml y de los `$env` que leen los flujos de n8n (medido el 22-oct). Servicios purgados (GHL, Higgsfield, Ideogram) NO se incluyen. */
export const VISTAS = {
  'zero-risk-runner': {
    uso: 'agent-runner (Railway)',
    nombres: ['INTERNAL_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'BRAINTRUST_API_KEY', 'BRAINTRUST_PROJECT_ID'],
  },
  'zero-risk-n8n': {
    uso: 'n8n (Railway): lo que los flujos leen por $env',
    nombres: [
      'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'INTERNAL_API_KEY', 'N8N_API_KEY', 'N8N_BASE_URL', 'N8N_WEBHOOK_BASE', 'N8N_PUBLIC_URL',
      'SLACK_BOT_TOKEN', 'SLACK_WEBHOOK_URL', 'SLACK_WEBHOOK_URL_EQUIPO', 'ZERO_RISK_API_URL', 'RAILWAY_AGENT_RUNNER_URL',
      'SALA_CALLBACK_API_KEY', 'SALA_INGRESS_API_KEY', 'SALA_DISPATCH_KEY', 'SALA_CALLBACK_URL', 'SALA_INGRESS_URL', 'SALA_INTAKE_URL', 'SALA_HITL_RESOLVE_BASE_URL',
      'APIFY_API_TOKEN', 'APIFY_TOKEN', 'APIFY_PAUSA_MS', 'META_ACCESS_TOKEN', 'GOOGLE_ACCESS_TOKEN', 'NOTION_PARENT_PAGE_ID', 'MC_BASE_URL', 'MC_API_TOKEN', 'DEAL_WON_WEBHOOK_KEY',
      'VERCEL_DEPLOY_URL', 'VERCEL_API_TOKEN', 'POSTHOG_API_URL', 'POSTHOG_PERSONAL_API_KEY', 'OPENAI_API_KEY', 'FIRECRAWL_API_KEY', 'FIRECRAWL_API_URL', 'GOOGLE_PSI_KEY',
      'UPTIMEROBOT_API_KEY', 'CADENA_VIGIA_PING_URL', 'HEALTHCHECK_API_KEY', 'HEALTHCHECKS_PING_URL', 'HEALTHCHECK_BACKUP_URL', 'DATAFORSEO_AUTH', 'SERPER_API_KEY',
      'DEFAULT_CLIENT_ID', 'COST_ALERT_THRESHOLD_USD', 'COST_ALERT_COOLDOWN_HOURS',
    ],
  },
  'zero-risk-ci': {
    uso: 'GitHub Actions (CI y respaldo diario)',
    nombres: ['N8N_API_KEY', 'N8N_BASE_URL', 'SLACK_WEBHOOK_URL_EQUIPO', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'],
  },
}

/** qué hacer con una vista, dados los nombres que hay en la fuente y los que ya tiene la vista (solo nombres) */
export function planearVista(deseados, enFuente, enVista) {
  const fuente = new Set(enFuente), vista = new Set(enVista)
  const unicos = [...new Set(deseados)]
  return {
    crear: unicos.filter((n) => fuente.has(n) && !vista.has(n)),
    ya: unicos.filter((n) => fuente.has(n) && vista.has(n)),
    pendientes: unicos.filter((n) => !fuente.has(n)),                       // aún no existen en la fuente (Emilio no las ha pegado)
    sobrantes: enVista.filter((n) => !unicos.includes(n) && !n.startsWith('DOPPLER_')),
  }
}

const nombresDe = (proyecto, config, run) => {
  const r = ejecutarDoppler(['secrets', '--only-names', '--json', '-p', proyecto, '-c', config], { run })
  if (!r.ok) return { ok: false, error: r.error, nombres: [] }
  try { return { ok: true, nombres: Object.keys(JSON.parse(r.salida)) } } catch { return { ok: false, error: 'respuesta ilegible', nombres: [] } }
}

export function ejecutar({ seco = true, solo = null, run = spawnSync, log = console.log } = {}) {
  const fuente = nombresDe(FUENTE.proyecto, FUENTE.config, run)
  if (!fuente.ok) { log(`✖ no pude leer los nombres de ${FUENTE.proyecto}/${FUENTE.config}: ${fuente.error}`); return { ok: false } }
  const resumen = {}
  for (const [proyecto, v] of Object.entries(VISTAS)) {
    if (solo && proyecto !== solo) continue
    let existentes = nombresDe(proyecto, 'prd', run)
    if (!existentes.ok) {
      if (seco) existentes = { ok: true, nombres: [] }
      else {
        const c = ejecutarDoppler(['projects', 'create', proyecto, '--description', `Vista mínima: ${v.uso} (solo referencias a ${FUENTE.proyecto}/${FUENTE.config})`], { run })
        if (!c.ok) { log(`✖ ${proyecto}: no se pudo crear el proyecto (${c.error})`); resumen[proyecto] = { ok: false }; continue }
        existentes = nombresDe(proyecto, 'prd', run)
        if (!existentes.ok) { log(`✖ ${proyecto}: no se pudo leer tras crearlo`); resumen[proyecto] = { ok: false }; continue }
      }
    }
    const p = planearVista(v.nombres, fuente.nombres, existentes.nombres)
    const hechas = []
    if (!seco) for (const n of p.crear) {
      const w = ejecutarDoppler(['secrets', 'set', n, '--silent', '-p', proyecto, '-c', 'prd'], { entrada: '${' + `${FUENTE.proyecto}.${FUENTE.config}.${n}` + '}', run })
      if (w.ok) hechas.push(n); else log(`✖ ${proyecto}/${n}: ${w.error}`)
    }
    log(`${seco ? 'SECO' : '✔'} ${proyecto} (${v.uso}): ${seco ? 'crearía' : 'creadas'} ${seco ? p.crear.length : hechas.length} · ya estaban ${p.ya.length} · pendientes de que existan en la fuente ${p.pendientes.length}${p.sobrantes.length ? ` · sobrantes (no se tocan) ${p.sobrantes.join(', ')}` : ''}`)
    if (p.pendientes.length) log(`   pendientes: ${p.pendientes.join(', ')}`)
    resumen[proyecto] = { ok: true, creadas: hechas, ya: p.ya, pendientes: p.pendientes, sobrantes: p.sobrantes }
  }
  return { ok: Object.values(resumen).every((x) => x.ok), resumen }
}

function main(argv) {
  const i = argv.indexOf('--vista')
  const solo = i >= 0 ? argv[i + 1] : null
  if (!argv.includes('--seco') && !argv.includes('--ejecutar')) { console.log('Uso: --seco | --ejecutar [--vista zero-risk-runner|zero-risk-n8n|zero-risk-ci]'); return 2 }
  return ejecutar({ seco: !argv.includes('--ejecutar'), solo }).ok ? 0 : 1
}

if (process.argv[1]?.endsWith('armar-vistas-doppler.mjs')) process.exit(main(process.argv.slice(2)))
