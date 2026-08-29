import fs from 'node:fs';
const [src, out, titulo] = process.argv.slice(2);
const w = JSON.parse(fs.readFileSync(new URL(src, import.meta.url), 'utf8'));
const F = '```';
let t = `# ${titulo}\n\n**${w.nodes.length} nodos** · generado desde el payload compuesto · para revisión\n\n`;
for (const n of w.nodes) {
  t += `## ${n.name}\n\n\`${n.type}\` v${n.typeVersion}${n.disabled ? ' · **[APAGADO]**' : ''}\n\n`;
  const js = n.parameters && n.parameters.jsCode;
  t += F + (js ? 'js' : 'json') + '\n' + (js || JSON.stringify(n.parameters, null, 1)) + '\n' + F + '\n\n';
}
t += `## conexiones\n\n${F}json\n${JSON.stringify(w.connections, null, 1)}\n${F}\n`;
fs.writeFileSync(new URL(out, import.meta.url), t);
console.log('escrito', out, '·', t.length, 'bytes ·', w.nodes.length, 'nodos');
