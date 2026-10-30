// N3 + ADENDA 7 · prueba de la regla «propio» (client_web_pages) contra la base real, dentro de una transacción que SIEMPRE se deshace. MUTANTE=<nombre> aplica un cambio a la regla y la prueba debe fallar.
// Uso: doppler run -p zero-risk -c prd -- node scripts/ops/prueba-rotulo-propio.mjs   (aplica encima de lo ya publicado la migración 202610301600 dentro de la transacción)
import fs from 'node:fs'
import { sql } from './lib-sql-ops.mjs'
const mutante = process.env.MUTANTE
let mig = fs.readFileSync(new URL('../../supabase/migrations/202610301600_client_web_pages_propio_con_lo_que_hay.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^BEGIN;|COMMIT;|NOTIFY[^\n]*/gm, '')
const MUT = {
  sin_sufijo: ["host LIKE '%.' || sitio", "host LIKE '%' || sitio"],
  sin_redes: ["IF sitio <> '' AND NOT (sitio = ANY (redes)) THEN", "IF sitio <> '' THEN"],
  sin_handles: ["IF position(h IN lower(coalesce(p_url, ''))) > 0 THEN RETURN true; END IF;", ""],
  handle_corto: ["IF length(h) >= 3 THEN", "IF length(h) >= 0 THEN"],
  sin_base: ['RETURN NOT hay_base;', 'RETURN false;'],
  sin_proteccion: ["\n     AND NOT EXISTS (SELECT 1 FROM public.client_web_pages w WHERE w.client_id = NEW.client_id AND w.url = NEW.url AND w.owner_role = 'propio')", ''],
  solo_propio: ["IF NEW.owner_role = 'propio' AND NOT", 'IF NOT'],
  sin_meta: ["NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('rotulo_original', 'propio', 'rotulado_por', 'regla-propio-en-el-origen');", ''],
}
if (mutante) { const [a, b] = MUT[mutante]; if (!mig.includes(a)) throw new Error('mutante sin ancla: ' + mutante); mig = mig.replace(a, b) }
const U = (n) => `90000000-0000-4000-8000-00000000000${n}`
const [C1, C2, C3, C4, C5] = [1, 2, 3, 4, 5].map(U)
const ORDEN = [
  [C1, 'https://www.ejemplo-cafe.ec/menu', 'p-'], [C1, 'https://ejemplo-cafe.ec', 'p-'], [C1, 'https://blog.ejemplo-cafe.ec/x', 'p-'],
  [C1, 'https://www.tripadvisor.es/Restaurant-Cafe-Ejemplo', 'rm'], [C1, 'https://notejemplo-cafe.ec/', 'rm'], [C1, 'https://pixnoy.com/profile/cafeejemplo/', 'p-'], [C1, 'https://www.instagram.com/otrohomonimo', 'rm'],
  [C2, 'https://www.instagram.com/mimarca/', 'p-'], [C2, 'https://www.instagram.com/otra/', 'rm'], [C2, 'https://x.com/ab', 'rm'],
  [C3, 'https://cualquiera.com/', 'p-'], // sin sitio y sin cuentas: nada con qué comparar → se conserva
  [C1, 'https://rival.com/', 'c-'],
  [C4, 'https://pixnoy.com/profile/solomarca/', 'p-'], [C4, 'https://scribd.com/homonimo', 'rm'], // sin sitio, con cuenta: la cuenta es la base
  [C5, 'https://www.instagram.com/lo-que-sea/', 'p-'], // su «sitio» es una red social y no tiene cuentas: sin base → se conserva
  [C1, 'https://viejo-propio-ajeno.com/', 'p-'], // ya existía como propio: la re-escritura NO lo baja
]
const ins = (c, u, r = 'propio') => `INSERT INTO client_web_pages (client_id,url,owner_role) VALUES ('${c}','${u}','${r}');`
const q = `BEGIN;
${mig}
INSERT INTO clients (id,name,slug,website_url,config) VALUES
 ('${C1}','Prueba N3 uno','prueba-n3-uno','https://www.ejemplo-cafe.ec','{"own_social_handles":{"instagram":"@CafeEjemplo"}}'),
 ('${C2}','Prueba N3 dos','prueba-n3-dos','https://www.instagram.com/mimarca','{"apify":{"own_handles":{"instagram":"mimarca"}},"own_social_handles":{"x":"ab"}}'),
 ('${C3}','Prueba N3 tres','prueba-n3-tres',NULL,'{}'),
 ('${C4}','Prueba N3 cuatro','prueba-n3-cuatro',NULL,'{"own_social_handles":{"instagram":"solomarca"}}'),
 ('${C5}','Prueba N3 cinco','prueba-n3-cinco','https://www.instagram.com/mimarca5','{}');
${ORDEN.filter(([, u, e]) => e !== 'c-' && !u.includes('viejo-propio')).map(([c, u]) => ins(c, u)).join('\n')}
INSERT INTO client_web_pages (client_id,url,owner_role,competitor_id) SELECT '${C1}','https://rival.com/','competidor',id FROM client_competitive_landscape LIMIT 1;
ALTER TABLE client_web_pages DISABLE TRIGGER client_web_pages_rotular_propio;
${ins(C1, 'https://viejo-propio-ajeno.com/')}
ALTER TABLE client_web_pages ENABLE TRIGGER client_web_pages_rotular_propio;
INSERT INTO client_web_pages (client_id,url,owner_role) VALUES ('${C1}','https://viejo-propio-ajeno.com/','propio') ON CONFLICT (client_id,url) DO UPDATE SET owner_role=EXCLUDED.owner_role;
INSERT INTO client_web_pages (client_id,url,owner_role) VALUES ('${C1}','https://www.tripadvisor.es/Restaurant-Cafe-Ejemplo','propio') ON CONFLICT (client_id,url) DO UPDATE SET owner_role=EXCLUDED.owner_role;
DO $$ DECLARE r text; BEGIN
 SELECT string_agg(coalesce(substr(w.owner_role,1,1)||(CASE WHEN w.metadata ? 'rotulo_original' THEN 'm' ELSE '-' END),'??'),',' ORDER BY v.n) INTO r FROM (VALUES ${ORDEN.map(([c, u], i) => `(${i},'${c}'::uuid,'${u}')`).join(',')}) v(n,c,u) LEFT JOIN client_web_pages w ON w.client_id=v.c AND w.url=v.u;
 RAISE EXCEPTION 'RESULTADO %', r; END $$;`
let out
try { await sql(q); out = 'SIN RESULTADO' } catch (e) { out = String(e.message) }
let msg = out; try { msg = JSON.parse(out.slice(out.indexOf('{'))).message } catch {}
const m = msg.match(/RESULTADO ([^"\\]*)/)
if (!m) { console.log(out.slice(0, 600)); process.exit(2) }
const got = m[1].split('\n')[0].trim().split(',')
let malos = 0
ORDEN.forEach(([, u, e], i) => { if (got[i] !== e) { malos++; console.log('✗', u, 'esperado', e, 'salió', got[i]) } })
console.log(malos ? `FALLAN ${malos}/${ORDEN.length}` : `OK ${ORDEN.length}/${ORDEN.length}`, mutante ? `(mutante ${mutante})` : '')
process.exit(malos ? 1 : 0)
