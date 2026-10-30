// N3 · prueba del rótulo «propio» contra la base real, dentro de una transacción que SIEMPRE se deshace. MUTANTE=<nombre> aplica un cambio a la regla y la prueba debe fallar.
// Prueba de N3 en la base REAL dentro de una transacción que SIEMPRE se deshace (RAISE al final): nada queda. Uso: doppler run -p zero-risk -c prd -- node prueba-n3.mjs [mutante]
import fs from 'node:fs'
import { sql } from './lib-sql-ops.mjs'
const mutante = process.env.MUTANTE
let mig = fs.readFileSync(new URL('../../supabase/migrations/202610301400_client_web_pages_rotulo_propio.sql', import.meta.url), 'utf8').replace(/^BEGIN;|COMMIT;|NOTIFY[^\n]*/gm, '')
const MUT = {
  sin_sufijo: ["host LIKE '%.' || sitio", "host LIKE '%' || sitio"],
  sin_redes: ["NOT (sitio = ANY (redes)) AND ", ""],
  sin_handles: ["IF length(h) >= 3 AND position(h IN lower(coalesce(p_url, ''))) > 0 THEN RETURN true; END IF;", ""],
  handle_corto: ["length(h) >= 3", "length(h) >= 0"],
  sin_trigger_propio: ["IF NEW.owner_role = 'propio' AND NOT", "IF NOT"],
  sin_meta: ["NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('rotulo_original', 'propio', 'rotulado_por', 'regla-propio-en-el-origen');", ""],
  sin_www: ["'^www\.', ''));\n  sitio", "'^zzz', ''));\n  sitio"],
}
if (mutante) { const [a, b] = MUT[mutante]; if (!mig.includes(a)) throw new Error('mutante sin ancla: ' + mutante); mig = mig.replace(a, b) }
const C1 = '90000000-0000-4000-8000-000000000001', C2 = '90000000-0000-4000-8000-000000000002', C3 = '90000000-0000-4000-8000-000000000003'
const ins = (c, u, r = 'propio') => `INSERT INTO client_web_pages (client_id,url,owner_role) VALUES ('${c}','${u}','${r}');`
const ORDEN = [[C1,'https://www.ejemplo-cafe.ec/menu'],[C1,'https://ejemplo-cafe.ec'],[C1,'https://blog.ejemplo-cafe.ec/x'],[C1,'https://www.tripadvisor.es/Restaurant-Cafe-Ejemplo'],[C1,'https://notejemplo-cafe.ec/'],[C1,'https://pixnoy.com/profile/cafeejemplo/'],[C1,'https://www.instagram.com/otrohomonimo'],[C2,'https://www.instagram.com/mimarca/'],[C2,'https://www.instagram.com/otra/'],[C2,'https://x.com/ab'],[C3,'https://cualquiera.com/'],[C1,'https://rival.com/']]
const q = `BEGIN;
${mig}
INSERT INTO clients (id,name,slug,website_url,config) VALUES
 ('${C1}','Prueba N3 uno','prueba-n3-uno','https://www.ejemplo-cafe.ec','{"own_social_handles":{"instagram":"@CafeEjemplo"}}'),
 ('${C2}','Prueba N3 dos','prueba-n3-dos','https://www.instagram.com/mimarca','{"apify":{"own_handles":{"instagram":"mimarca"}},"own_social_handles":{"x":"ab"}}'),
 ('${C3}','Prueba N3 tres','prueba-n3-tres',NULL,'{}');
${ins(C1, 'https://www.ejemplo-cafe.ec/menu')}
${ins(C1, 'https://ejemplo-cafe.ec')}
${ins(C1, 'https://blog.ejemplo-cafe.ec/x')}
${ins(C1, 'https://www.tripadvisor.es/Restaurant-Cafe-Ejemplo')}
${ins(C1, 'https://notejemplo-cafe.ec/')}
${ins(C1, 'https://pixnoy.com/profile/cafeejemplo/')}
${ins(C1, 'https://www.instagram.com/otrohomonimo')}
${ins(C2, 'https://www.instagram.com/mimarca/')}
${ins(C2, 'https://www.instagram.com/otra/')}
${ins(C2, 'https://x.com/ab')}
${ins(C3, 'https://cualquiera.com/')}
INSERT INTO client_web_pages (client_id,url,owner_role,competitor_id) SELECT '${C1}','https://rival.com/','competidor',id FROM client_competitive_landscape LIMIT 1;
INSERT INTO client_web_pages (client_id,url,owner_role) VALUES ('${C1}','https://www.ejemplo-cafe.ec/menu','propio') ON CONFLICT (client_id,url) DO UPDATE SET owner_role=EXCLUDED.owner_role;
INSERT INTO client_web_pages (client_id,url,owner_role) VALUES ('${C1}','https://www.tripadvisor.es/Restaurant-Cafe-Ejemplo','propio') ON CONFLICT (client_id,url) DO UPDATE SET owner_role=EXCLUDED.owner_role;
DO $$ DECLARE r text; BEGIN
 SELECT string_agg(coalesce(substr(w.owner_role,1,1)||(CASE WHEN w.metadata ? 'rotulo_original' THEN 'm' ELSE '-' END),'??'),',' ORDER BY v.n) INTO r FROM (VALUES ${ORDEN.map(([c,u],i)=>`(${i},'${c}'::uuid,'${u}')`).join(',')}) v(n,c,u) LEFT JOIN client_web_pages w ON w.client_id=v.c AND w.url=v.u;
 RAISE EXCEPTION 'RESULTADO %', r; END $$;`
let out
try { await sql(q); out = 'SIN RESULTADO' } catch (e) { out = String(e.message) }
let msg = out; try { msg = JSON.parse(out.slice(out.indexOf('{'))).message } catch {}
const m = msg.match(/RESULTADO ([^"\\]*)/)
if (!m) { console.log(out.slice(0, 600)); process.exit(2) }
const got = m[1].split("\n")[0].trim().split(",")
const esperado = ['p-','p-','p-','rm','rm','p-','rm','p-','rm','rm','rm','c-']
let malos = 0
esperado.forEach((e, i) => { if (got[i] !== e) { malos++; console.log('✗', ORDEN[i][1], 'esperado', e, 'salió', got[i]) } })
console.log(malos ? `FALLAN ${malos}/${esperado.length}` : `OK ${esperado.length}/${esperado.length}`, mutante ? `(mutante ${mutante})` : '')
process.exit(malos ? 1 : 0)
