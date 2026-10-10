// Relevo 54 · D-3 firmado: el alta acepta el campo OPCIONAL `url_reparto` y lo manda a /api/clients/upsert (que lo guarda en clients.config.apify.url_reparto).
// Parte del alta ARREGLADA del relevo 51 y cambia UN nodo («Persist Client to Supabase»: un campo más en el cuerpo). Desde la raiz del repo: node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-r54.mjs
import fs from 'node:fs'
const R = 'scripts/worker-staging/LyVoKcrypS5uLyuu/'
const w = JSON.parse(fs.readFileSync(R + 'alta-ARREGLADA-2026-10-10-r51.json', 'utf8'))
const n = w.nodes.find((x) => x.name === 'Persist Client to Supabase')
if (!n) throw new Error('no hallé Persist Client to Supabase')
const a = "brand_fonts: $('Validate Deal Data').first().json.client_brand_fonts\n}"
if (n.parameters.jsonBody.split(a).length !== 2) throw new Error('ancla del cuerpo no única o ausente')
n.parameters.jsonBody = n.parameters.jsonBody.replace(a, () => "brand_fonts: $('Validate Deal Data').first().json.client_brand_fonts,\n  url_reparto: $('Validate Deal Data').first().json.url_reparto || undefined   // D-3 (r54) · opcional · la ruta lo valida y lo guarda en clients.config.apify.url_reparto\n}")
fs.writeFileSync(R + 'alta-ARREGLADA-2026-10-10-r54.json', JSON.stringify(w, null, 1))
console.log('ok')
