#!/usr/bin/env node
/**
 * Lee del n8n LOCAL (su sqlite) lo que corrió: nodo por nodo, con hora, intentos, tamaño y claves de entrada y salida. Es la traza que pide CC7.
 *   node ver.mjs <carpeta n8n-datos> [--ultima | --id N] [--json salida.json] [--nodo "nombre"]   (imprime también el error)
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parse } from 'flatted'

const a = process.argv.slice(2)
const flag = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined }
const db = new DatabaseSync(path.join(a[0], '.n8n', 'database.sqlite'), { readOnly: true })
const lista = db.prepare('select id, status, workflowId, startedAt, stoppedAt, mode from execution_entity order by id desc limit 12').all()
if (a.includes('--lista')) { console.table(lista); process.exit(0) }
const id = flag('--id') ?? lista.find((e) => e.workflowId === (flag('--flujo') ?? 'X9F0zp6LQ2xGEYVS'))?.id
const fila = db.prepare('select data from execution_data where executionId = ?').get(Number(id))
const ejec = db.prepare('select * from execution_entity where id = ?').get(Number(id))
const d = parse(fila.data)
const rd = d.resultData.runData
const pasos = []
for (const [nombre, corridas] of Object.entries(rd)) corridas.forEach((c, i) => {
  const items = c.data?.main?.flat().filter(Boolean).flat() ?? []
  const salida = items.map((x) => x.json)
  const txt = JSON.stringify(salida)
  pasos.push({ nodo: nombre, corrida: i, inicio: c.startTime, ms: c.executionTime, estado: c.executionStatus, items: items.length, chars_salida: txt?.length ?? 0, claves: salida[0] && typeof salida[0] === 'object' ? Object.keys(salida[0]).slice(0, 12) : [], status_http: salida[0]?.statusCode, error: c.error ? String(c.error.message).slice(0, 300) : undefined })
})
pasos.sort((x, y) => x.inicio - y.inicio)
const ultimo = d.resultData.lastNodeExecuted
console.log(`ejecución ${id} · ${ejec.status} · ${ejec.startedAt} → ${ejec.stoppedAt} · ${pasos.length} pasos · último: ${ultimo}`)
if (d.resultData.error) console.log('ERROR:', String(d.resultData.error.message).slice(0, 600), '| nodo:', d.resultData.error.node?.name)
if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify({ id, estado: ejec.status, inicio: ejec.startedAt, fin: ejec.stoppedAt, ultimo, error: d.resultData.error?.message ?? null, pasos }, null, 1))
if (flag('--nodo')) { const c = rd[flag('--nodo')]; console.log(JSON.stringify(c?.at(-1)?.data?.main?.flat().filter(Boolean).flat().map((x) => x.json) ?? c?.at(-1)?.error ?? null).slice(0, Number(flag('--largo') ?? 2500))); process.exit(0) }
const cola = Number(flag('--cola') ?? 40)
for (const p of pasos.slice(-cola)) console.log(`${new Date(p.inicio).toISOString().slice(11, 19)} ${String(p.ms).padStart(6)}ms ${p.estado === 'success' ? ' ' : '!'} ${p.nodo}${p.corrida ? ` #${p.corrida + 1}` : ''} · ${p.chars_salida}c${p.status_http ? ` · http ${p.status_http}` : ''}${p.error ? ` · ERROR ${p.error}` : ''}`)
