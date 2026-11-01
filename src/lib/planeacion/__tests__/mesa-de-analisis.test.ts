/**
 * 01-nov · LA MESA DE ANÁLISIS (FIRMA de Emilio 08:42Z puntos 1 y 3) · lógica pura + las migraciones REALES leídas · US$ 0, sin base ni red.
 *   · la palanca está apagada por omisión y solo enciende al cliente listado;
 *   · los topes: US$ 1 por analista (≤ 2) y US$ 5 por mesa; lo que no cabe queda en 0;
 *   · el material lleva el resumen vivo entero y las fichas rotuladas con su id, con el recorte dicho;
 *   · el informe se lee sin creerle: citas ajenas no cuentan, «sin dato» no es hallazgo, mercado acepta fuente+fecha;
 *   · la tarea no fija idioma ni trato, prohíbe nombrar personas y está en tuteo (nunca voseo);
 *   · la migración 1500 siembra 5 analistas en Estrategia con la marca `analisis` y la palanca apagada; la 1510 cambia UNA frase con guarda md5.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAZOS } from '../contrato-brazos'
import {
  ANALISTAS, armarMaterial, cuerpoDelInforme, esTipoDeAnalisis, leerInforme, leerPalanca, MESA, repartirTopes, rotuloDe, tareaDeAnalisis,
  TIPOS_DE_ANALISIS, TOPE_DE_LA_MESA_USD, TOPE_DEL_INFORME, TOPE_DEL_MATERIAL, TOPE_POR_ANALISTA_USD,
} from '../mesa-de-analisis'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const leer = (carpeta: string, nombre: string) => fs.readFileSync(path.join(RAIZ, carpeta, nombre), 'utf8')
const M1500 = '202611011500_mesa_de_analisis_5_analistas_en_directorio_y_palanca'
const M1510 = '202611011510_agents_campaign_brief_agent_idioma_del_manual'
const C = '11111111-1111-4111-8111-111111111111'
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AJENA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('mesa de análisis · los analistas y el brazo', () => {
  it('cinco tipos, cada uno con su agente; `analisis` es un brazo del contrato', () => {
    expect([...TIPOS_DE_ANALISIS]).toEqual(['mercado', 'competencia', 'voz_del_publico', 'escucha_x', 'retencion'])
    expect(Object.values(ANALISTAS).map((a) => a.agente)).toEqual(['market_research_analyst', 'competitive-intelligence-agent', 'feedback-synthesizer', 'x-twitter-intelligence-analyst', 'growth-hacker'])
    expect(BRAZOS).toContain('analisis')
    expect(esTipoDeAnalisis('competencia')).toBe(true)
    expect(esTipoDeAnalisis('creativos')).toBe(false)
    expect(ANALISTAS.mercado.exige).toBe('fuente_y_fecha')
    expect(Object.values(ANALISTAS).filter((a) => a.exige === 'cita')).toHaveLength(4)
  })
})

describe('mesa de análisis · la palanca (apagada por omisión)', () => {
  it('sin fila, sin `encendida: true` o sin el cliente en la lista: apagada; solo enciende al cliente listado', () => {
    expect(leerPalanca(undefined, C).encendida).toBe(false)
    expect(leerPalanca(null, C).motivo).toMatch(/apagada por omisión/)
    expect(leerPalanca({ encendida: false, clientes: [C] }, C).encendida).toBe(false)
    expect(leerPalanca({ encendida: 'true', clientes: [C] }, C).encendida).toBe(false)
    expect(leerPalanca({ encendida: true, clientes: [] }, C).motivo).toMatch(/no está en/)
    expect(leerPalanca({ encendida: true }, C).encendida).toBe(false)
    expect(leerPalanca({ encendida: true, clientes: ['otro', C] }, C).encendida).toBe(true)
  })
})

describe('mesa de análisis · los topes', () => {
  it('US$ 1 por analista por omisión, nunca más de 2; la mesa no pasa de US$ 5 (FIRMA 01-nov: los 5 tipos caben): el que no cabe queda en 0; un tipo inválido no gasta', () => {
    expect(TOPE_POR_ANALISTA_USD).toBe(1); expect(TOPE_DE_LA_MESA_USD).toBe(5)
    expect(repartirTopes([{ tipo: 'mercado' }, { tipo: 'competencia', tope_usd: 0.5 }, { tipo: 'retencion', tope_usd: 9 }])).toEqual([1, 0.5, 1])
    expect(repartirTopes(TIPOS_DE_ANALISIS.map((tipo) => ({ tipo })))).toEqual([1, 1, 1, 1, 1])
    expect(repartirTopes(TIPOS_DE_ANALISIS.map((tipo) => ({ tipo })).concat({ tipo: 'mercado' }))).toEqual([1, 1, 1, 1, 1, 0])
    expect(repartirTopes([{ tipo: 'mercado', tope_usd: 2 }, { tipo: 'competencia', tope_usd: 2 }, { tipo: 'voz_del_publico' }, { tipo: 'retencion' }])).toEqual([2, 2, 1, 0])
    expect(repartirTopes([{ tipo: null, tope_usd: 1 }, { tipo: 'mercado' }])).toEqual([0, 1])
  })
})

describe('mesa de análisis · el material', () => {
  it('el resumen vivo va entero; las fichas van rotuladas con su id y solo se recortan al tope real, diciéndolo', () => {
    const largo = 'x'.repeat(9000)
    const m = armarMaterial({ resumen_vivo: largo, fichas: [{ ficha_id: F1, clase: 'resenas', fecha: '2026-10-30T00:00:00Z', contenido: 'muy  rico\n volvería' }] })
    expect(m.texto).toContain(largo)
    expect(m.texto).toContain(`[${F1}] (resenas · 2026-10-30) muy rico volvería`)
    expect(m.ids).toEqual([F1]); expect(m.recortado).toBe(false); expect(m.con_resumen_vivo).toBe(true)
    const muchas = Array.from({ length: 30 }, (_, i) => ({ ficha_id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, clase: 'sitio', fecha: null, contenido: 'y'.repeat(400) }))
    const r = armarMaterial({ resumen_vivo: null, fichas: muchas.map((f) => ({ ...f, contenido: 'y'.repeat(TOPE_DEL_MATERIAL / 10) })) })
    expect(r.recortado).toBe(true)
    expect(r.ids.length).toBeLessThan(30)
    expect(r.texto).toMatch(new RegExp(`se recortó al tope de ${TOPE_DEL_MATERIAL}`))
    expect(r.texto).toContain('RESUMEN VIVO DEL CLIENTE: no hay todavía.')
  })
})

describe('mesa de análisis · el informe se lee sin creerle', () => {
  const material = [F1, F2]
  it('cuenta solo los hallazgos con cita del material; las citas ajenas se descartan; «sin dato» no cuenta; el rótulo se antepone', () => {
    const salida = [`- Las reseñas repiten «lento» [${F1}] · riesgo`, `- Nadie responde preguntas [${F2}] [${AJENA}]`, '- Esto lo estimo yo sin cita', '- sin dato sobre precios', 'texto suelto'].join('\n')
    const l = leerInforme(salida, ANALISTAS.voz_del_publico, material)
    expect(l.hallazgos).toBe(2); expect(l.lineas_sin_sosten).toBe(2)
    expect([...l.citas].sort()).toEqual([F1, F2]); expect(l.citas_ajenas).toBe(1)
    expect(l.informe.startsWith(rotuloDe('voz_del_publico'))).toBe(true)
    expect(l.declara_sin_dato).toBe(true)
  })
  it('acepta el id corto (8 hex) como lo escriben los analistas y lo expande al id completo; un corto que no casa no es cita ni «ajena» (corrida 209744)', () => {
    const c1 = F1.slice(0, 8), c2 = F2.slice(0, 8)
    const salida = [
      `- Ocho marisquerías en el malecón [fichas: ${c1}, ${c2} · 2026-10-20] · riesgo`,
      `- Segmento semanal invisible · [ficha:${c2} · ficha:${c1}]`,
      `- Feriado largo el 2 y 3 [${c1.toUpperCase()} · 2026-11-02]`,
      '- Esto cita un corto que no está en el material [ficha:deadbeef] · no sostiene',
      '- Esto trae una fecha pegada 20261102 y nada más · no sostiene',
    ].join('\n')
    const l = leerInforme(salida, ANALISTAS.competencia, material)
    expect(l.hallazgos).toBe(3); expect(l.lineas_sin_sosten).toBe(2)
    expect([...l.citas].sort()).toEqual([F1, F2]); expect(l.citas_ajenas).toBe(0)
    const cuerpo = cuerpoDelInforme({ client_id: C, analista: ANALISTAS.competencia, informe: l, fecha_de_corte: '2026-11-01T00:00:00Z', workflow_id: 'w', workflow_execution_id: 'e' })
    expect(cuerpo?.citas.sort()).toEqual([F1, F2])
  })
  it('un id corto repetido entre dos fichas del material no identifica a ninguna; el UUID completo sigue mandando', () => {
    const gemela = `${F1.slice(0, 8)}-9999-4999-8999-999999999999`
    const l = leerInforme(`- hallazgo con corto ambiguo [${F1.slice(0, 8)}]\n- hallazgo con completo [${gemela}]`, ANALISTAS.retencion, [F1, gemela])
    expect(l.hallazgos).toBe(1); expect(l.citas).toEqual([gemela]); expect(l.citas_ajenas).toBe(0)
  })
  it('mercado acepta una señal con fuente Y fecha aunque no cite ficha (mira hacia afuera); los demás no', () => {
    const senal = '- Crece la demanda de X · fuente: INEC (inec.gob.ec) · fecha: 2026-09 · confianza media'
    expect(leerInforme(senal, ANALISTAS.mercado, material).hallazgos).toBe(1)
    expect(leerInforme(senal, ANALISTAS.competencia, material).hallazgos).toBe(0)
  })
  it('un informe que pasa del tope se recorta y lo dice; sin citas no hay cuerpo para archivar', () => {
    const l = leerInforme('- ' + 'z'.repeat(TOPE_DEL_INFORME + 50), ANALISTAS.retencion, material)
    expect(l.recortado).toBe(true); expect(l.informe.length).toBeLessThanOrEqual(TOPE_DEL_INFORME + rotuloDe('retencion').length + 1)
    expect(cuerpoDelInforme({ client_id: C, analista: ANALISTAS.retencion, informe: l, fecha_de_corte: '2026-11-01T00:00:00Z', workflow_id: 'w', workflow_execution_id: 'e' })).toBeNull()
    const con = leerInforme(`- vuelve poca gente [${F1}]`, ANALISTAS.retencion, material)
    const cuerpo = cuerpoDelInforme({ client_id: C, analista: ANALISTAS.retencion, informe: con, fecha_de_corte: '2026-11-01T00:00:00Z', workflow_id: 'w', workflow_execution_id: 'e' })
    expect(cuerpo).toMatchObject({ client_id: C, tipo: 'retencion', citas: [F1], dry_run: false, pedido_por: { oficina: MESA, agente: 'growth-hacker' }, workflow_id: 'w', workflow_execution_id: 'e' })
  })
})

describe('mesa de análisis · la tarea', () => {
  const material = armarMaterial({ resumen_vivo: 'resumen', fichas: [{ ficha_id: F1, clase: 'resenas', fecha: null, contenido: 'rico' }] })
  const ficha = { nombre: 'Un negocio', rubro: 'cafetería', plaza: 'Cuenca', pais: 'Ecuador' }
  it('en tuteo (nunca voseo), sin nombres de personas, sin fijar idioma ni trato cuando el flujo no los trae, con rótulo, tope y material', () => {
    for (const a of Object.values(ANALISTAS)) {
      const t = tareaDeAnalisis({ analista: a, ficha, material, idioma: null, trato: null, proposito: 'para el plan' })
      // «vos» aparece como VALOR del trato («tú, vos, usted u otro»): el voseo se busca por conjugación
      expect(t).not.toMatch(/\b(sabés|tenés|decí|escribí|podés|respondé|hacé)\b/i)
      expect(t).toMatch(/NO nombres a ninguna persona/)
      expect(t).toMatch(/el del manual del cliente; si no lo conoces, el idioma oficial de Ecuador/)
      expect(t).toMatch(/Trato: el que fija el manual del cliente/)
      expect(t).not.toMatch(/\b(español|inglés|English|Spanish)\b/)
      expect(t).toContain(rotuloDe(a.tipo)); expect(t).toContain(material.texto)
      expect(t).toContain('Para qué sirve en el plan: para el plan')
    }
    const con = tareaDeAnalisis({ analista: ANALISTAS.competencia, ficha, material, idioma: 'español', trato: 'tú', metodo: 'MÉTODO X' })
    expect(con).toMatch(/Idioma: español\. Trato: tú\./); expect(con).toContain('MÉTODO X')
  })
})

describe('mesa de análisis · la migración 1500 (directorio + palanca) y su reversa', () => {
  const SQL = leer('migrations', `${M1500}.sql`)
  const REV = leer('reversas', `${M1500}_REVERSA.sql`)
  const filas = [...SQL.matchAll(/\(\$d\$([\w-]+)\$d\$, \$d\$(\w+)\$d\$,[\s\S]*?ARRAY\[\$d\$analisis\$d\$\][\s\S]*?\$d\$(\w+)\$d\$\)/g)].map((m) => ({ agente: m[1], rol: m[2], equipo: m[3] }))
  it('siembra exactamente los 5 analistas del código, como miembros de Estrategia con la marca `analisis`, sin tocar otras tarjetas', () => {
    expect(filas.map((f) => f.agente)).toEqual(Object.values(ANALISTAS).map((a) => a.agente))
    expect(filas.every((f) => f.rol === 'miembro' && f.equipo === 'estrategia')).toBe(true)
    expect(SQL).toMatch(/ON CONFLICT \(agente\) DO NOTHING/)
    expect(SQL).not.toMatch(/UPDATE public\.oficina_directorio/); expect(SQL).not.toMatch(/DELETE FROM/)
    expect(SQL).toMatch(/IF n <> 5 THEN RAISE EXCEPTION/); expect(SQL).toMatch(/IF e <> 6 THEN RAISE EXCEPTION/)
    expect(SQL).toMatch(/market_research_analyst no puede tener marcas de la mesa de creativos/)
  })
  it('cada tarjeta dice idioma y trato del manual (no fija ninguno) y no nombra personas; nada en voseo', () => {
    const cuerpo = SQL.slice(SQL.indexOf('INSERT INTO public.oficina_directorio'), SQL.indexOf('ON CONFLICT (agente)'))
    expect((cuerpo.match(/que fija el manual del cliente/g) ?? []).length).toBe(5)
    expect(cuerpo).not.toMatch(/\b(sabés|tenés|decí|escribí|podés|respondé|hacé)\b/i)
    expect(cuerpo).not.toMatch(/\b(español|inglés|Ecuador|Náufrago)\b/)
  })
  it('la palanca nace APAGADA y solo si no existe; la reversa se niega con encargos abiertos, saca solo esas 5 tarjetas y no pisa una palanca encendida', () => {
    expect(SQL).toMatch(/INSERT INTO public\.cadena_config \(clave, valor\) VALUES \('mesa_de_analisis', '\{"encendida": false, "clientes": \[\]\}'::jsonb\)\s*ON CONFLICT \(clave\) DO NOTHING/)
    expect(REV).toMatch(/estado IN \('abierto', 'en_paso'\)[\s\S]*RAISE EXCEPTION/)
    expect(REV).toMatch(/DELETE FROM public\.oficina_directorio[\s\S]*AND equipo = 'estrategia' AND rol = 'miembro' AND pertinente_en = ARRAY\['analisis'\]::text\[\]/)
    for (const a of Object.values(ANALISTAS)) expect(REV).toContain(`'${a.agente}'`)
    expect(REV).toMatch(/DELETE FROM public\.cadena_config WHERE clave = 'mesa_de_analisis' AND \(valor ->> 'encendida'\) IS DISTINCT FROM 'true'/)
    expect(REV).not.toMatch(/campaign-brief-agent|creative-director-mesa/)
  })
})

describe('mesa de análisis · la migración 1510 (idioma del brief) y su reversa', () => {
  const SQL = leer('migrations', `${M1510}.sql`)
  const REV = leer('reversas', `${M1510}_REVERSA.sql`)
  const VIEJA = "'Briefs in English for internal use.'"
  const NUEVA = "'Briefs in the language and with the form of address (tú, vos, usted or other) that the client''s brand manual sets; if the manual does not set them, use the official language of the client''s country and do not invent the form of address.'"
  it('cambia UNA frase de campaign-brief-agent con guarda md5 antes y después; no toca otra fila ni otra columna de identidad', () => {
    expect(SQL).toContain(`replace(identity_content,\n         ${VIEJA},\n         ${NUEVA})`)
    expect(SQL).toMatch(/WHERE name = 'campaign-brief-agent'\s+AND md5\(identity_content\) = 'd546e93e6299aadb7651643e5348f95e'/)
    expect(SQL).toMatch(/IF h <> '1d80697d2016da0993495b51a2458a80' THEN RAISE EXCEPTION/)
    expect((SQL.match(/UPDATE public\.agents/g) ?? []).length).toBe(1)
    expect(SQL).not.toMatch(/SET model|is_active|identity_source/)
    expect(SQL).not.toMatch(/\b(español|Spanish|Ecuador)\b/)
  })
  it('la reversa hace el reemplazo inverso con la guarda del md5 nuevo y exige volver al md5 viejo', () => {
    expect(REV).toContain(`replace(identity_content,\n         ${NUEVA},\n         ${VIEJA})`)
    expect(REV).toMatch(/AND md5\(identity_content\) = '1d80697d2016da0993495b51a2458a80'/)
    expect(REV).toMatch(/IF h <> 'd546e93e6299aadb7651643e5348f95e' THEN RAISE EXCEPTION/)
  })
})
