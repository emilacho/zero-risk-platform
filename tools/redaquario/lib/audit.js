// RedAquario · AUDIT LOG local (spec §Audit trail: cada arranque → línea en log local).
// Append-only · JSONL · una línea por evento. Sin red · sin PII más allá del ts+autor.

import fs from 'node:fs';
import path from 'node:path';

/**
 * appendAudit — agrega una línea JSONL al log local. Crea el dir si falta.
 * `nowIso` se inyecta para testabilidad (evita Date en el path puro de tests).
 */
function appendAudit(logPath, evento, nowIso) {
  const linea = JSON.stringify({ t: nowIso, ...evento }) + '\n';
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, linea, 'utf8');
  return linea;
}

/** formatAuditLine — versión pura (para tests): NO toca disco, sólo serializa. */
function formatAuditLine(evento, nowIso) {
  return JSON.stringify({ t: nowIso, ...evento });
}

export { appendAudit, formatAuditLine };
