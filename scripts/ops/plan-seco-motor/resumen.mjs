#!/usr/bin/env node
/**
 * Resumen de una corrida del doble chequeo: llamadas a agentes (con reintentos), gasto simulado, lo que salió por fuera y el estado en la base en memoria.
 *   node resumen.mjs <carpeta de la corrida> [--desde S] [--json salida.json]
 */
import fs from 'node:fs'
import path from 'node:path'

const a = process.argv.slice(2)
const flag = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined }
const L = fs.readFileSync(path.join(a[0], 'traza.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x))
const desde = Number(flag('--desde') ?? 0)
const ag = L.filter((x) => x.tipo === 'agente' && x.t_s >= desde)
for (const j of ag) console.log(`${String(j.t_s).padStart(7)}s ${j.agente} · ${j.paso} · #${j.intento} · entra ${j.chars_entrada} · sale ${j.chars_salida} · tope ${j.tope_usd}${j.con_vuelta ? ' · con vuelta' : ''}${j.fallo_provocado ? ` · FALLO ${j.fallo_provocado}` : ''}`)
const rep = {}
for (const j of ag) { const k = `${j.ejecucion}|${j.paso}`; rep[k] = (rep[k] || 0) + 1 }
const repetidos = Object.entries(rep).filter(([, n]) => n > 1)
console.log(`llamadas a agentes: ${ag.length} · repetidas en el mismo paso: ${repetidos.length ? repetidos.map(([k, n]) => `${k.split('|')[1]}×${n}`).join(', ') : 'ninguna'}`)
for (const t of ['reuso_del_punto_de_control', 'agente_sin_vuelta', 'error_arnes']) { const f = L.filter((x) => x.tipo === t); if (f.length) console.log(`${t}: ${f.length} · ${JSON.stringify(f[0]).slice(0, 200)}`) }
const sim = {}
for (const j of L.filter((x) => x.tipo === 'simulado')) sim[j.ruta] = (sim[j.ruta] || 0) + 1
console.log('rutas simuladas:', JSON.stringify(sim))
const base = await fetch('http://localhost:4100/__tabla?t=agent_invocations').then((r) => r.json()).catch(() => [])
console.log('libro simulado US$:', Math.round(base.filter((x) => x.status === 'simulado').reduce((s, x) => s + Number(x.cost_usd || 0), 0) * 100) / 100)
if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify({ agentes: ag, repetidos, simulado: sim }, null, 1))
