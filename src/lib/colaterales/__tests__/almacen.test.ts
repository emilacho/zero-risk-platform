/**
 * Colaterales · tramo 2b (CC1 · certifican CC7/CC6) · el historial: migración 202611101700 + su almacén.
 * La base falsa RECHAZA columnas que la migración no crea (lección: una base falsa que no valida columnas deja pasar nombres inventados).
 * Pedazos de DOS clientes de rubros distintos (restaurante en markdown, B2B industrial en JSON), salidos de sus registros reales.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { pedazosDe, type Pedazo } from '../red'
import { baseFalsa, COLUMNAS, ACTUALIZABLES } from './base-falsa'
import { DOCUMENTOS } from '../../cadena/dependencias-de-documentos'
import { almacenDeColaterales, PasoNoPermitido, PASOS_DE_EDICION, PASOS_DE_RETOQUE, type NuevaEdicion, type NuevoRetoque } from '../almacen'

const RAIZ = process.cwd()
const MIG = 'supabase/migrations/202611101700_colaterales_ediciones_y_retoques.sql'
const REV = 'supabase/reversas/202611101700_colaterales_ediciones_y_retoques_REVERSA.sql'
const crudo = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf8').replace(/\r/g, '')
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '')
const sql = sinComentarios(crudo(MIG))

const conId = (p: Omit<Pedazo, 'id'>, i: number): Pedazo => ({ id: `C${i + 1}`, ...p })
const PED_A = pedazosDe('gran_idea', A.gran_idea_v3).map(conId) // markdown · posición
const PED_B = pedazosDe('estrategia', B.plan).map(conId) // JSON · ruta
const EDICION_A: NuevaEdicion = { client_id: 'cliente-a', documento: 'brief', documento_ref: 'brief-a', version_base: '2', seccion: 'Insight', antes: 'viene de la costa', despues: 'viene de la playa', llave: 'cliente-a:brief:2:llave-1' }
const EDICION_B: NuevaEdicion = { client_id: 'cliente-b', documento: 'plan', documento_ref: 'plan-b', version_base: '1', seccion: 'canales', antes: 'creado y validado', despues: 'creado, validado y con su primera publicación', llave: 'cliente-b:plan:1:llave-1' }
const propuesto = (p: Pedazo, antes: string, despues: string): NuevoRetoque => ({ pedazo: p, documento_ref: 'doc', version_base: '3', afecta: true, razon: 'repite lo editado', antes, despues, porque: 'repite lo editado', estado: 'propuesto' })

describe('almacén · una edición = un trabajo (línea 4 de CC7) · dos clientes', () => {
  it('crear: nueva en «recibida»; la misma llave otra vez devuelve LA MISMA, sin abrir otra fila', async () => {
    for (const e of [EDICION_A, EDICION_B]) {
      const { db, tablas } = baseFalsa()
      const al = almacenDeColaterales(db)
      const uno = await al.crearEdicion(e)
      expect(uno.nueva).toBe(true)
      expect(uno.edicion.estado).toBe('recibida')
      const dos = await al.crearEdicion(e)
      expect(dos).toEqual({ edicion: uno.edicion, nueva: false })
      expect(tablas.colaterales_ediciones).toHaveLength(1)
    }
  })

  it('tomar recibida → en_curso: el primero gana, el segundo recibe false («ya en curso»)', async () => {
    const { db } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_A)
    expect(await al.pasarEdicion(edicion.id, 'recibida', 'en_curso')).toBe(true)
    expect(await al.pasarEdicion(edicion.id, 'recibida', 'en_curso')).toBe(false)
    expect(await al.pasarEdicion(edicion.id, 'en_curso', 'lista', { version_nueva: '3' })).toBe(true)
  })

  it('pasos que no existen se niegan ANTES de tocar la base (lista no vuelve a en_curso; recibida no salta a lista)', async () => {
    const { db } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_B)
    await expect(al.pasarEdicion(edicion.id, 'recibida', 'lista')).rejects.toBeInstanceOf(PasoNoPermitido)
    await expect(al.pasarEdicion(edicion.id, 'lista', 'en_curso')).rejects.toBeInstanceOf(PasoNoPermitido)
  })

  it('R2 sin cumplir: recibida → sin_motor con su nota (no se lanza el motor)', async () => {
    const { db, tablas } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_A)
    expect(await al.pasarEdicion(edicion.id, 'recibida', 'sin_motor', { nota: 'no se revisaron colaterales: falta la fila activa de gran_idea' })).toBe(true)
    expect(tablas.colaterales_ediciones[0]).toMatchObject({ estado: 'sin_motor', nota: expect.stringContaining('gran_idea') })
  })

  it('un error de la base se LANZA: un insert caído no se lee como «ya existe» y una lectura caída no se lee como «vacío»', async () => {
    await expect(almacenDeColaterales(baseFalsa({ fallarInsert: 'colaterales_ediciones' }).db).crearEdicion(EDICION_A)).rejects.toThrow(/connection reset/)
    await expect(almacenDeColaterales(baseFalsa({ fallarLectura: true }).db).retoquesDe('x')).rejects.toThrow(/statement timeout/)
  })
})

describe('almacén · retoques con su posición o su ruta · dos clientes', () => {
  it('guarda pedazos markdown (posición) y JSON (ruta) con columnas que la migración SÍ crea', async () => {
    const { db, tablas } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_A)
    const md = PED_A.find((p) => p.texto.includes('costa'))!
    const js = PED_B.find((p) => p.texto.includes('creado y validado'))!
    expect(md.inicio).toBeGreaterThanOrEqual(0)
    expect(js.ruta).toMatch(/\S/)
    const n = await al.guardarRetoques(edicion.id, [
      propuesto(md, 'costa', 'playa'),
      { ...propuesto(js, 'creado y validado', 'creado, validado y con su primera publicación') },
      { pedazo: PED_A.find((p) => p !== md)!, documento_ref: 'doc', version_base: '3', afecta: false, razon: 'no habla de lo editado', antes: null, despues: null, porque: null, estado: 'descartado' },
    ])
    expect(n).toBe(3)
    const filas = tablas.colaterales_retoques
    expect(filas.find((f) => f.pedazo_id === md.id)).toMatchObject({ pedazo_inicio: md.inicio, pedazo_ruta: null, pedazo_texto: md.texto, seccion: md.seccion })
    expect(filas.find((f) => f.pedazo_id === js.id && f.documento === 'estrategia')).toMatchObject({ pedazo_inicio: -1, pedazo_ruta: js.ruta })
  })

  it('si la base guarda menos retoques de los pedidos, se LANZA (no se da por guardado lo que no está)', async () => {
    const { db } = baseFalsa({ devolverMenos: true })
    await expect(almacenDeColaterales(db).guardarRetoques('e', [propuesto(PED_A[0], PED_A[0].texto.slice(0, 5), 'otro')])).rejects.toThrow(/se pidieron 1 y se guardaron 0/)
  })

  it('una columna inventada la rechaza la base falsa (la prueba de columnas sí muerde)', async () => {
    const { db } = baseFalsa()
    const r = (await (db.from('colaterales_retoques') as any).insert({ edicion_id: 'x', columna_que_no_existe: 1 }).select('id')) as { error: { code: string } | null }
    expect(r.error?.code).toBe('42703')
  })

  it('el mismo pedazo dos veces en la misma edición choca (unique edicion_id + pedazo_id) y se LANZA', async () => {
    const { db } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_B)
    const p = PED_B[0]
    await al.guardarRetoques(edicion.id, [propuesto(p, p.texto.slice(0, 5), 'otro')])
    await expect(al.guardarRetoques(edicion.id, [propuesto(p, p.texto.slice(0, 5), 'otro')])).rejects.toThrow(/duplicate/)
  })

  it('línea 1 de CC6: frenado por la jefatura se rehace UNA vez; la segunda falla lo deja «rechazado» y no hay tercer intento', async () => {
    const { db, tablas } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_A)
    await al.guardarRetoques(edicion.id, [propuesto(PED_A[1], PED_A[1].texto.slice(0, 6), 'otra cosa')])
    const t = tablas.colaterales_retoques[0]
    const id = String(t.id)
    expect(await al.frenadoPorJefatura(id, 0, 'registro distinto al del manual')).toBe('rehacer')
    expect(t.estado).toBe('propuesto') // «rehacer» no escribe nada por sí solo
    expect(await al.pasarRetoque(id, 'propuesto', 'propuesto', { despues: 'otra cosa, en el registro del manual' })).toBe(true)
    expect(t.rehechos).toBe(1)
    expect(await al.pasarRetoque(id, 'propuesto', 'propuesto', { despues: 'tercer intento' })).toBe(false) // tope 1
    expect(t.despues).toBe('otra cosa, en el registro del manual')
    expect(await al.frenadoPorJefatura(id, 1, 'sigue fuera del registro')).toBe('rechazado')
    expect(t).toMatchObject({ estado: 'rechazado', motivo: 'sigue fuera del registro' })
    expect(PASOS_DE_RETOQUE.rechazado).toEqual([]) // final: no frena nada ni vuelve
  })

  it('aplicado → deshecho sí; deshecho → aplicado y ya_coincide → propuesto no (R1 nunca crea pendiente)', async () => {
    const { db, tablas } = baseFalsa()
    const al = almacenDeColaterales(db)
    const { edicion } = await al.crearEdicion(EDICION_B)
    await al.guardarRetoques(edicion.id, [propuesto(PED_B[2], PED_B[2].texto.slice(0, 4), 'cambio')])
    const id = String(tablas.colaterales_retoques[0].id)
    expect(await al.pasarRetoque(id, 'propuesto', 'aprobado')).toBe(true)
    expect(await al.pasarRetoque(id, 'aprobado', 'aplicado', { version_resultante: '4' })).toBe(true)
    expect(await al.pasarRetoque(id, 'aplicado', 'deshecho')).toBe(true)
    await expect(al.pasarRetoque(id, 'deshecho', 'aplicado')).rejects.toBeInstanceOf(PasoNoPermitido)
    await expect(al.pasarRetoque(id, 'ya_coincide', 'propuesto')).rejects.toBeInstanceOf(PasoNoPermitido)
    expect(PASOS_DE_RETOQUE.ya_coincide).toEqual([])
  })
})

describe('migración 202611101700 · permisos cerrados y reversa', () => {
  const sentencias = (s: string) => s.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)

  it('crea SOLO las dos tablas propias, con seguridad por fila, dentro de una transacción', () => {
    expect([...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual(['colaterales_ediciones', 'colaterales_retoques'])
    expect(sql).toMatch(/alter table public\.colaterales_ediciones enable row level security;/)
    expect(sql).toMatch(/alter table public\.colaterales_retoques enable row level security;/)
    expect(sql.indexOf('begin;')).toBeLessThan(sql.indexOf('create table'))
    expect(sql.indexOf('commit;')).toBeGreaterThan(sql.lastIndexOf('create policy'))
    expect(sql).not.toMatch(/\b(alter|drop|truncate|delete from|insert into|update)\s+(table\s+)?public\.(?!colaterales_)/i)
  })

  it('línea 3 de CC6: primero revoke all a public, anon y authenticated; luego el servidor recibe SOLO select, insert y update de las columnas de estado', () => {
    for (const t of ['colaterales_ediciones', 'colaterales_retoques']) {
      const quita = sql.indexOf(`revoke all on public.${t} from public, anon, authenticated, service_role;`)
      const da = sql.indexOf(`grant select, insert on public.${t} to service_role;`)
      const actualiza = sql.search(new RegExp(`grant update \\([^)]*\\) on public\\.${t} to service_role;`))
      expect(quita, t).toBeGreaterThan(-1)
      expect(da, t).toBeGreaterThan(quita)
      expect(actualiza, t).toBeGreaterThan(quita)
    }
    expect(sentencias(sql).filter((l) => /^grant\b/i.test(l))).toEqual([
      'grant select, insert on public.colaterales_ediciones to service_role',
      'grant select, insert on public.colaterales_retoques to service_role',
      'grant update (estado, version_nueva, gravedad, gravedad_motivo, nota, workflow_execution_id, updated_at) on public.colaterales_ediciones to service_role',
      'grant update (estado, despues, porque, motivo, rehechos, version_resultante, revision_id, updated_at) on public.colaterales_retoques to service_role',
    ])
    // lo que identifica la edición o el pedazo, y lo que pidió el dueño, NO se puede actualizar
    for (const k of ['id', 'client_id', 'documento', 'documento_ref', 'version_base', 'seccion', 'antes', 'despues', 'llave', 'created_at']) expect(ACTUALIZABLES.colaterales_ediciones.has(k), k).toBe(false)
    for (const k of ['id', 'edicion_id', 'documento', 'documento_ref', 'version_base', 'pedazo_id', 'pedazo_inicio', 'pedazo_ruta', 'pedazo_texto', 'seccion', 'afecta', 'razon', 'antes', 'created_at']) expect(ACTUALIZABLES.colaterales_retoques.has(k), k).toBe(false)
    for (const t of ['colaterales_ediciones', 'colaterales_retoques']) for (const k of ACTUALIZABLES[t]) expect(COLUMNAS[t].has(k), `${t}.${k}`).toBe(true)
    expect(sql).not.toMatch(/grant[^;]*\b(delete|truncate|trigger|references|all)\b/i)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+[^;]*\b(anon|authenticated|public)\b/i)
  })

  it('el historial no cae en cascada: las dos llaves foráneas son on delete restrict (nota CC7/CC6 · Lenovo 15:32Z)', () => {
    expect(sql).toMatch(/client_id uuid not null references public\.clients\(id\) on delete restrict,/)
    expect(sql).toMatch(/edicion_id uuid not null references public\.colaterales_ediciones\(id\) on delete restrict,/)
    expect(sql).not.toMatch(/on delete (cascade|set null|set default)/i)
  })

  it('la base guarda lo que el código promete: llave única, un pedazo por edición, rehechos ≤ 1, posición o ruta, cambio real', () => {
    expect(sql).toMatch(/constraint colaterales_ediciones_una_por_llave unique \(llave\)/)
    expect(sql).toMatch(/constraint colaterales_retoques_un_pedazo_por_edicion unique \(edicion_id, pedazo_id\)/)
    expect(sql).toMatch(/rehechos smallint not null default 0 check \(rehechos between 0 and 1\)/)
    expect(sql).toMatch(/check \(\(pedazo_ruta is null\) = \(pedazo_inicio >= 0\)\)/)
    expect(sql).toMatch(/razon text not null check \(char_length\(btrim\(razon\)\) > 0\)/)
    expect(sql).toMatch(/constraint colaterales_ediciones_antes_distinto check \(antes <> despues\)/)
    expect(sql).not.toMatch(/costo|cost_usd|gasto/i) // el costo sale de los recibos (línea 5 de CC7), no se escribe aquí
  })

  it('los documentos y los estados de la base son EXACTAMENTE los del código', () => {
    const listas = [...sql.matchAll(/check \((?:documento|estado) in \(([^)]*)\)\)/g)].map((m) => m[1].split(',').map((x) => x.trim().replace(/'/g, '')))
    expect(listas).toHaveLength(4)
    expect(listas[0]).toEqual([...DOCUMENTOS])
    expect(listas[2]).toEqual([...DOCUMENTOS])
    expect(listas[1].sort()).toEqual(Object.keys(PASOS_DE_EDICION).sort())
    expect(listas[3].sort()).toEqual(Object.keys(PASOS_DE_RETOQUE).sort())
  })

  it('la reversa vive FUERA de migrations, se niega con historial y quita las dos tablas (hija primero)', () => {
    expect(fs.existsSync(path.join(RAIZ, 'supabase/migrations/202611101700_colaterales_ediciones_y_retoques_REVERSA.sql'))).toBe(false)
    const r = sinComentarios(crudo(REV))
    expect(r).toMatch(/exists \(select 1 from public\.colaterales_ediciones\) then\s+raise exception/)
    expect(r).toMatch(/exists \(select 1 from public\.colaterales_retoques\) then\s+raise exception/)
    expect(r.indexOf('drop table if exists public.colaterales_retoques;')).toBeLessThan(r.indexOf('drop table if exists public.colaterales_ediciones;'))
    expect(r.indexOf('raise exception')).toBeLessThan(r.indexOf('drop table'))
  })

  it('certificación CC6 p7: TODA regla de acceso de las dos tablas es `to service_role`; ninguna a anon, authenticated ni public', () => {
    const reglas = [...sql.matchAll(/create policy\s+(\w+)\s+on\s+public\.(\w+)([^;]*?)(?:;|\bend if)/gi)].map((m) => ({ nombre: m[1], tabla: m[2], resto: m[3].replace(/\s+/g, ' ') }))
    expect(reglas.map((r) => r.tabla).sort()).toEqual(['colaterales_ediciones', 'colaterales_retoques'])
    for (const r of reglas) {
      expect(r.resto, r.nombre).toMatch(/\bto service_role\b/i)
      expect(r.resto, r.nombre).not.toMatch(/\bto\b[^;]*\b(anon|authenticated|public)\b/i)
    }
    // ninguna otra forma de crear o cambiar reglas en la migración
    expect((sql.match(/create policy/gi) ?? []).length).toBe(2)
    expect(sql).not.toMatch(/alter policy/i)
  })

  it('certificación CC6 r3/r2: la reversa es UNA transacción (begin; al inicio, commit; al final) y no vacía tablas', () => {
    const r = sinComentarios(crudo(REV)).trim()
    const sentencias = r.split(/\n/).map((l) => l.trim()).filter(Boolean)
    expect(sentencias[0]).toBe('begin;')
    const fin = sentencias.indexOf('commit;')
    expect(fin).toBeGreaterThan(0)
    expect(sentencias.slice(fin + 1)).toEqual(["notify pgrst, 'reload schema';"])
    expect(r).not.toMatch(/\btruncate\b/i)
    expect(r).not.toMatch(/\bdelete\s+from\b/i)
  })

  it('sin retrocesos colados en las expresiones (lección #985) y sin palabras de un cliente en lo nuevo', () => {
    for (const a of [MIG, REV, 'src/lib/colaterales/almacen.ts', 'src/lib/colaterales/__tests__/almacen.test.ts']) expect(crudo(a).includes('\u0008'), a).toBe(false)
    for (const a of [MIG, REV, 'src/lib/colaterales/almacen.ts']) expect(crudo(a), a).not.toMatch(/guayac|ecuador|n[aá]ufrago|olon|p[eé]rez|seguridad industrial|linkedin|costa|playa/i)
  })
})
