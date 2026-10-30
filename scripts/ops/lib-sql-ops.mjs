// Consulta SQL por la API de administración de Supabase (necesita SUPABASE_ACCESS_TOKEN y NEXT_PUBLIC_SUPABASE_URL; con `doppler run -p zero-risk -c prd --`). Nunca imprime la llave.
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
export async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })
  const t = await r.text()
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 600))
  return JSON.parse(t)
}
