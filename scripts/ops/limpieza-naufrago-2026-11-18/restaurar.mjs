// VUELTA ATRÁS de la limpieza de Náufrago · re-inserta desde el respaldo, de la raíz a las hojas (el orden inverso al borrado)
// uso:
//   node restaurar.mjs <carpeta> --ensayo <tabla>   · en UNA transacción: borra el conjunto de esa tabla, lo re-inserta desde el respaldo, compara la
//                                                     huella de las filas antes y después, y SIEMPRE deshace (la transacción termina en excepción). US$ 0, no cambia nada.
//   node restaurar.mjs <carpeta> --aplicar          · la vuelta atrás de verdad (solo si se pide): todo en una transacción, más el valor entero de las 3 libretas.
// Las columnas generadas (`hitl_queue.documento`) no se insertan: la base las recalcula.
import fs from 'node:fs'
import path from 'node:path'
import { CONJUNTOS, LIBRETAS, sql } from './conjuntos.mjs'

const [dir, modo, tablaEnsayo] = process.argv.slice(2)
const leer = (t) => JSON.parse(fs.readFileSync(path.join(dir, 'tablas', `${t}.json`), 'utf8'))
const etiqueta = (t) => `$r_${t}_${Date.now().toString(36)}$`

async function columnas(tabla) {
  const r = await sql(`select string_agg(quote_ident(column_name), ', ' order by ordinal_position) c from information_schema.columns where table_schema = 'public' and table_name = '${tabla}' and is_generated = 'NEVER'`)
  return r[0].c
}
const insertar = (tabla, cols, filas) => { const e = etiqueta(tabla); return `insert into public.${tabla} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${tabla}, ${e}${JSON.stringify(filas)}${e}::jsonb);` }
const huellaDe = (tabla, donde) => `(select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.${tabla} t where ${donde})`

if (modo === '--ensayo') {
  const c = CONJUNTOS.find((x) => x.tabla === tablaEnsayo)
  if (!c) { console.log('tabla fuera de la lista'); process.exit(1) }
  const filas = leer(c.tabla), cols = await columnas(c.tabla)
  const q = `do $ensayo$ declare antes text; despues text; n int; m int; begin
    antes := ${huellaDe(c.tabla, c.donde)};
    delete from public.${c.tabla} where ${c.donde}; get diagnostics n = row_count;
    ${insertar(c.tabla, cols, filas)} get diagnostics m = row_count;
    despues := ${huellaDe(c.tabla, c.donde)};
    raise exception 'ENSAYO-VUELTA-ATRAS tabla=${c.tabla} borradas=% repuestas=% iguales=% antes=% despues=%', n, m, (antes = despues), antes, despues;
  end $ensayo$;`
  try { await sql(q, false); console.log('✘ el ensayo no terminó en su excepción: revisar'); process.exitCode = 1 }
  catch (e) { const m = String(e).match(/ENSAYO-VUELTA-ATRAS[^"\\]*/); console.log(m ? m[0] : `✘ ${String(e).slice(0, 600)}`); process.exitCode = m && /iguales=t/.test(m[0]) ? 0 : 1 }
} else if (modo === '--aplicar') {
  const partes = ['begin;']
  for (const c of [...CONJUNTOS].reverse()) { const filas = leer(c.tabla); if (filas.length) partes.push(insertar(c.tabla, await columnas(c.tabla), filas)) }
  for (const l of JSON.parse(fs.readFileSync(path.join(dir, 'tablas', 'cadena_config_libretas.json'), 'utf8'))) { const e = etiqueta('lib'); if (LIBRETAS.includes(l.clave)) partes.push(`update public.cadena_config set valor = ${e}${JSON.stringify(l.valor)}${e}::jsonb, actualizado_en = now() where clave = '${l.clave}';`) }
  partes.push('commit;')
  await sql(partes.join('\n'), false)
  for (const c of CONJUNTOS) { const [{ n }] = await sql(`select count(*)::int n from public.${c.tabla} where ${c.donde}`); console.log(`${n === c.esperado ? '✔' : '✘'} ${c.tabla}: ${n} (respaldo ${c.esperado})`) }
} else console.log('uso: node restaurar.mjs <carpeta> --ensayo <tabla> | --aplicar')
