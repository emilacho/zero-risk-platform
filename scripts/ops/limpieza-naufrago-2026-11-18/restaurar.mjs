// VUELTA ATRÁS de la limpieza de Náufrago · re-inserta desde el respaldo, de la raíz a las hojas (el orden inverso al borrado)
// La API de la base no acepta una consulta grande (413 con 21 MB): los datos viajan en TANDAS de ~1,5 MB.
// uso:
//   node restaurar.mjs <carpeta> --fidelidad                  · SOLO LECTURA: cada fila de cada archivo del respaldo, puesta en su tabla con
//                                                               `jsonb_populate_recordset`, es IGUAL a una fila viva (texto de la fila entera), y la cuenta cuadra.
//                                                               Prueba que el respaldo repone exactamente lo que hay hoy. US$ 0.
//   node restaurar.mjs <carpeta> --ensayo-completo <mig.sql>  · en UNA transacción que SIEMPRE se deshace: copia cada conjunto a una tabla temporal (dentro de la base),
//                                                               huellas, la migración entera, la reposición (de la raíz a las hojas) desde esas copias, las 3 libretas,
//                                                               huellas otra vez. Prueba la ida y la vuelta juntas contra la base real (orden, llaves, columnas generadas). US$ 0.
//   node restaurar.mjs <carpeta> --ensayo <tabla>             · una tabla sin hijas vivas: borra su conjunto, lo repone desde el archivo y deshace.
//   node restaurar.mjs <carpeta> --aplicar                    · la vuelta atrás de verdad (solo si se pide): tabla por tabla y tanda por tanda (cada tanda es atómica),
//                                                               de la raíz a las hojas; si una falla, para ahí y dice cuál. Al final, las 3 libretas con su valor entero.
// Las columnas generadas (`hitl_queue.documento`) no se insertan: la base las recalcula.
import fs from 'node:fs'
import path from 'node:path'
import { CONJUNTOS, LIBRETAS, sql } from './conjuntos.mjs'

const [dir, modo, arg] = process.argv.slice(2)
const leer = (t) => JSON.parse(fs.readFileSync(path.join(dir, 'tablas', `${t}.json`), 'utf8'))
const etiqueta = (t) => `$r_${t}_${Date.now().toString(36)}$`
const MAX = 1_500_000
/** parte las filas en tandas de hasta MAX bytes de JSON (una fila más grande que MAX va sola) */
function tandas(filas) {
  const out = []
  let actual = [], peso = 0
  for (const f of filas) {
    const p = JSON.stringify(f).length
    if (actual.length && peso + p > MAX) { out.push(actual); actual = []; peso = 0 }
    actual.push(f); peso += p
  }
  if (actual.length) out.push(actual)
  return out
}
async function columnas(tabla) {
  const r = await sql(`select string_agg(quote_ident(column_name), ', ' order by ordinal_position) c from information_schema.columns where table_schema = 'public' and table_name = '${tabla}' and is_generated = 'NEVER'`)
  return r[0].c
}
const json = (x, t) => { const e = etiqueta(t); return `${e}${JSON.stringify(x)}${e}::jsonb` }
const insertar = (tabla, cols, filas) => `insert into public.${tabla} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${tabla}, ${json(filas, tabla)});`
const huellaDe = (tabla, donde) => `(select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.${tabla} t where ${donde})`

if (modo === '--fidelidad') {
  let malas = 0
  for (const c of CONJUNTOS) {
    const filas = leer(c.tabla)
    let iguales = 0
    for (const t of tandas(filas)) {
      const [{ n }] = await sql(`select count(*)::int n from jsonb_populate_recordset(null::public.${c.tabla}, ${json(t, c.tabla)}) r where r::text in (select t::text from public.${c.tabla} t where ${c.donde})`)
      iguales += n
    }
    const [{ vivas }] = await sql(`select count(*)::int vivas from public.${c.tabla} where ${c.donde}`)
    const ok = iguales === filas.length && filas.length === c.esperado && vivas === c.esperado
    if (!ok) malas++
    console.log(`${ok ? '✔' : '✘'} ${c.tabla}: respaldo ${filas.length} · iguales a una fila viva ${iguales} · vivas ${vivas} · esperado ${c.esperado}`)
  }
  console.log(malas ? `FIDELIDAD CON ${malas} TABLAS MAL` : 'FIDELIDAD COMPLETA')
  process.exitCode = malas ? 1 : 0
} else if (modo === '--ensayo-completo') {
  const migracion = fs.readFileSync(arg, 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, '').replace(/^set local lock_timeout[^;]*;$/m, '')
  const huellas = (cual) => [
    ...CONJUNTOS.map((c) => `insert into _huellas select '${cual}', '${c.tabla}', ${huellaDe(c.tabla, c.donde)};`),
    `insert into _huellas select '${cual}', 'libretas', (select md5(string_agg(clave || '=' || valor::text, '|' order by clave)) from public.cadena_config where clave in (${LIBRETAS.map((l) => `'${l}'`).join(', ')}));`,
  ]
  const partes = ['begin;', 'create temp table _huellas (cuando text, tabla text, huella text) on commit drop;',
    `create temp table _libretas on commit drop as select clave, valor from public.cadena_config where clave in (${LIBRETAS.map((l) => `'${l}'`).join(', ')});`]
  for (const c of CONJUNTOS) partes.push(`create temp table _r_${c.tabla} on commit drop as select * from public.${c.tabla} where ${c.donde};`)
  partes.push(...huellas('antes'), migracion)
  for (const c of [...CONJUNTOS].reverse()) { const cols = await columnas(c.tabla); partes.push(`insert into public.${c.tabla} (${cols}) select ${cols} from _r_${c.tabla};`) }
  partes.push('update public.cadena_config k set valor = l.valor from _libretas l where l.clave = k.clave;')
  partes.push(...huellas('despues'))
  partes.push(`do $fin$ declare d text; begin
    d := (select string_agg(a.tabla, ', ') from _huellas a join _huellas b on b.tabla = a.tabla and b.cuando = 'despues' where a.cuando = 'antes' and a.huella is distinct from b.huella);
    raise exception 'ENSAYO-COMPLETO conjuntos=% distintas=%', (select count(*) from _huellas where cuando = 'antes'), coalesce(d, 'ninguna');
  end $fin$;`)
  partes.push('rollback;')
  try { await sql(partes.join('\n'), false); console.log('✘ el ensayo no terminó en su excepción: revisar'); process.exitCode = 1 }
  catch (e) { const m = String(e).match(/ENSAYO-COMPLETO[^"\\]*/); console.log(m ? m[0] : `✘ ${String(e).slice(0, 700)}`); process.exitCode = m && /distintas=ninguna/.test(m[0]) ? 0 : 1 }
} else if (modo === '--ensayo') {
  const c = CONJUNTOS.find((x) => x.tabla === arg)
  if (!c) { console.log('tabla fuera de la lista'); process.exit(1) }
  const filas = leer(c.tabla), cols = await columnas(c.tabla)
  if (JSON.stringify(filas).length > MAX) { console.log('tabla grande: usa --fidelidad y --ensayo-completo'); process.exit(1) }
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
  for (const c of [...CONJUNTOS].reverse()) {
    const filas = leer(c.tabla)
    if (!filas.length) continue
    const cols = await columnas(c.tabla)
    const ts = tandas(filas)
    for (const [i, t] of ts.entries()) {
      try { await sql(`begin;\n${insertar(c.tabla, cols, t)}\ncommit;`, false) }
      catch (e) { console.log(`✘ PARA en ${c.tabla}, tanda ${i + 1}/${ts.length}: ${String(e).slice(0, 400)}`); process.exit(1) }
    }
    console.log(`… ${c.tabla}: ${filas.length} en ${ts.length} tanda(s)`)
  }
  const libs = JSON.parse(fs.readFileSync(path.join(dir, 'tablas', 'cadena_config_libretas.json'), 'utf8')).filter((l) => LIBRETAS.includes(l.clave))
  await sql(`begin;\n${libs.map((l) => `update public.cadena_config set valor = ${json(l.valor, 'lib')}, actualizado_en = now() where clave = '${l.clave}';`).join('\n')}\ncommit;`, false)
  for (const c of CONJUNTOS) { const [{ n }] = await sql(`select count(*)::int n from public.${c.tabla} where ${c.donde}`); console.log(`${n === c.esperado ? '✔' : '✘'} ${c.tabla}: ${n} (respaldo ${c.esperado})`) }
} else console.log('uso: node restaurar.mjs <carpeta> --fidelidad | --ensayo-completo <migracion.sql> | --ensayo <tabla> | --aplicar')
