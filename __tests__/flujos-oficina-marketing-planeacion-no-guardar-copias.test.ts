/**
 * 01-nov · ADENDA 5 · «Pedir cambios» no guarda una versión que es COPIA del plan anterior. US$ 0, sin red; se ejecuta el CÓDIGO REAL de los nodos.
 * Dos candados INDEPENDIENTES (cada uno se prueba solo, con el otro apagado):
 *   1. «Pedir el plan al redactor» manda force_restart cuando hay un plan anterior que reescribir.
 *   2. «② ¿Es copia del plan anterior?» compara antes de guardar: 1.ª copia ⇒ un reintento forzado; 2.ª ⇒ no se guarda nada y el pedido queda `fallido` con «sin cambios reales».
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DETALLE_SIN_CAMBIOS, NODO_COPIA, NODO_COPIA_CABLE, NODO_COPIA_CAMBIO, NODO_COPIA_DETENER, NODO_COPIA_PREGUNTA, NODO_COPIA_REINTENTO, NODO_COPIA_RESUMEN, NODO_COPIA_VOLVIO } from '../scripts/ops/oficina-marketing/no-guardar-copias.mjs'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const nodo = (n: string) => nuevo.nodes.find((x: any) => x.name === n)
const destinos = (n: string) => (nuevo.connections[n]?.main ?? []).map((g: any[]) => g.map((c) => c.node))
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor

const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ANTERIOR = '# Plan de 90 días\n\nSemana 1: lanzar la carta de Olón.\nSemana 2: reels de producto.'
const REESCRITURA = { reescritura: true, plan_anterior: { id: 'p-1', version: 1, texto: ANTERIOR }, version_nueva: 2, cambios_del_dueno: 'Más reels', plan_cambio_id: 'c-1' }
const BASE = { pedido: 'PEDIDO ORIGINAL', cliente_id: CLIENTE, redactor_elegido: 'campaign-brief-agent', client_name: 'Náufrago' }

/** ejecuta el código real de «② ¿Es copia…?»; `corridas` = cuántas veces ya corrió este nodo en la corrida ($runIndex) */
const comparar = async (plan: any, re: any, corridas = 0) => {
  const codigo = nodo(NODO_COPIA).parameters.jsCode
  const $ = (n: string) => {
    if (n === 'Plan anterior · leer') { if (re === 'NO_EJECUTADO') throw new Error('no ejecutado'); return { first: () => ({ json: re }) } }
    if (n === 'Redactor · elegir') return { last: () => ({ json: BASE }) }
    throw new Error('nodo no previsto ' + n)
  }
  const salida = await new AsyncFunction('$', '$input', '$runIndex', codigo)($, { first: () => ({ json: plan }) }, corridas)
  return salida[0].json
}

describe('el cableado', () => {
  it('«Guardar el plan» solo se alcanza pasando por la comparación (o por «no es copia» / «no detener»)', () => {
    const entran: string[] = []
    for (const [k, v] of Object.entries<any>(nuevo.connections)) for (const g of v.main) for (const c of g) if (c.node === 'Guardar el plan') entran.push(k)
    expect(entran.sort()).toEqual([NODO_COPIA_DETENER].sort())
    expect(destinos('Validar · ¿se pide?')).toEqual([['Validar · pedir'], [NODO_COPIA]])
    expect(destinos('Validar · ¿pasó?')[0]).toEqual([NODO_COPIA])
    expect(destinos(NODO_COPIA)).toEqual([[NODO_COPIA_REINTENTO]])
    expect(destinos(NODO_COPIA_REINTENTO)).toEqual([['Pedir el plan al redactor'], [NODO_COPIA_DETENER]])
    expect(destinos(NODO_COPIA_DETENER)).toEqual([[NODO_COPIA_PREGUNTA], ['Guardar el plan']])
  })
  it('el final «sin cambios reales»: marca el pedido (si hay), resume, avisa a la sala UNA vez y cierra por el mismo cierre que «repetida»; no abre compuerta ni aviso de bandeja', () => {
    expect(destinos(NODO_COPIA_PREGUNTA)).toEqual([[NODO_COPIA_CAMBIO], [NODO_COPIA_RESUMEN]])
    expect(destinos(NODO_COPIA_CAMBIO)).toEqual([[NODO_COPIA_RESUMEN]])
    expect(destinos(NODO_COPIA_RESUMEN)).toEqual([[NODO_COPIA_CABLE]])
    expect(destinos(NODO_COPIA_CABLE)).toEqual([[NODO_COPIA_VOLVIO]])
    expect(destinos(NODO_COPIA_VOLVIO)).toEqual([['V9 · armar el cierre']])
    const cambio = nodo(NODO_COPIA_CAMBIO).parameters
    expect(cambio.method).toBe('PATCH')
    expect(cambio.url).toContain('/rest/v1/plan_cambios?id=eq.')
    expect(cambio.jsonBody).toContain("estado: 'fallido'")
    expect(cambio.jsonBody).toContain(JSON.stringify(DETALLE_SIN_CAMBIOS))
    const cable = nodo(NODO_COPIA_CABLE).parameters.jsonBody
    expect(cable).toContain("resultado: 'no_corrio_sin_cambios_reales'")
    expect(cable).toContain(JSON.stringify(DETALLE_SIN_CAMBIOS))
    expect(cable.split("resultado: '").length).toBe(2)
    expect(JSON.stringify([NODO_COPIA_CAMBIO, NODO_COPIA_RESUMEN, NODO_COPIA_CABLE, NODO_COPIA_VOLVIO].map((n) => destinos(n)))).not.toMatch(/Compuerta|Bandeja|Aviso|Cable de vuelta · sala|BRIEF/)
  })
  it('sin llaves pegadas en los nodos nuevos', () => {
    const t = JSON.stringify([NODO_COPIA, NODO_COPIA_CAMBIO, NODO_COPIA_CABLE, NODO_COPIA_VOLVIO].map(nodo))
    expect(t).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9]{10,}/)
    expect(t).toContain('$env.SUPABASE_SERVICE_ROLE_KEY')
  })
  it('el tag del plan guardado lleva `comparacion_fallo` solo cuando es true', () => {
    expect(nodo('Guardar el plan').parameters.jsonBody).toContain('comparacion_fallo: $json.comparacion_fallo === true ? true : undefined')
  })
})

describe('candado 1 · «Pedir el plan al redactor» fuerza el reinicio al reescribir (el candado 2 NO interviene)', () => {
  const pedir = async (previos: Record<string, unknown[]>, entrada: any = BASE, body: any = { client_id: CLIENTE }) => {
    let cuerpo: any = null
    await recorrer(nuevo, 'Pedir el plan al redactor', entrada, { previos: { 'Webhook · planeacion': [{ body }], ...previos }, env: { INTERNAL_API_KEY: 'i' }, http: (_u: string, _h: any, c: any) => { cuerpo = c; return { statusCode: 200, body: {} } }, hasta: ['Esperar al redactor'] })
    return cuerpo
  }
  it('con plan anterior (reescritura) ⇒ force_restart true aunque el disparo no lo traiga', async () => {
    expect((await pedir({ 'Plan anterior · leer': [REESCRITURA] })).force_restart).toBe(true)
  })
  it('plan de cero (sin reescritura) ⇒ sigue en false, como hoy', async () => {
    expect((await pedir({ 'Plan anterior · leer': [{ reescritura: false }] })).force_restart).toBe(false)
  })
  it('lo que ya lo forzaba sigue forzando (disparo con force_restart · reintento de forma)', async () => {
    expect((await pedir({ 'Plan anterior · leer': [{ reescritura: false }] }, BASE, { client_id: CLIENTE, force_restart: true })).force_restart).toBe(true)
    expect((await pedir({ 'Plan anterior · leer': [{ reescritura: false }] }, { ...BASE, reintento_forma: true })).force_restart).toBe(true)
  })
  it('si «Plan anterior · leer» no se ejecutó (flujo viejo/disparo sin ciclo) ⇒ no rompe y queda en false', async () => {
    expect((await pedir({})).force_restart).toBe(false)
  })
})

describe('candado 2 · «② ¿Es copia del plan anterior?» (el candado 1 puede estar apagado: aquí no se mira el force_restart)', () => {
  it('no es reescritura ⇒ el ítem pasa intacto, solo suma la marca «no»', async () => {
    const plan = { texto: ANTERIOR, client_id: CLIENTE, caracteres: 80 }
    expect(await comparar(plan, { reescritura: false })).toEqual({ ...plan, copia_del_plan_anterior: 'no' })
    expect(await comparar(plan, 'NO_EJECUTADO')).toEqual({ ...plan, copia_del_plan_anterior: 'no' })
  })
  it('texto distinto, aunque sea por UNA línea ⇒ NO es copia', async () => {
    const plan = { texto: ANTERIOR.replace('reels de producto', 'reels de producto y de equipo'), client_id: CLIENTE }
    expect((await comparar(plan, REESCRITURA)).copia_del_plan_anterior).toBe('no')
    expect((await comparar({ texto: ANTERIOR + '\nSemana 3: nueva.', client_id: CLIENTE }, REESCRITURA)).copia_del_plan_anterior).toBe('no')
  })
  it('copia exacta, o con otros espacios y saltos ⇒ la 1.ª vez pide UN reintento forzado con el pedido original', async () => {
    for (const texto of [ANTERIOR, '  ' + ANTERIOR.replace(/\n/g, '\r\n\r\n') + '\n\n', ANTERIOR.replace(/ /g, '  ')]) {
      const r = await comparar({ texto, client_id: CLIENTE }, REESCRITURA, 0)
      expect(r.copia_del_plan_anterior).toBe('reintentar')
      expect(r.reintento_forma).toBe(true)
      expect(r.pedido).toBe('PEDIDO ORIGINAL')
      expect(r.redactor_elegido).toBe('campaign-brief-agent')
    }
  })
  it('copia otra vez en el reintento ⇒ DETENER (cap explícito, sin tercer intento)', async () => {
    const r = await comparar({ texto: ANTERIOR, client_id: CLIENTE, client_name: 'Náufrago', caracteres: 80 }, REESCRITURA, 1)
    expect(r).toEqual({ copia_del_plan_anterior: 'detener', client_id: CLIENTE, client_name: 'Náufrago', caracteres: 80 })
  })
  it('el guardado trae al final «Qué cambió» pero el redactor devolvió el MISMO plan ⇒ sigue siendo copia', async () => {
    for (const seccion of ['\n\n## Qué cambió\n- Más reels: aplicado', '\n\n**Qué cambió**\nnada', '\n\nQue cambió: x']) {
      const re = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto: ANTERIOR + seccion } }
      expect((await comparar({ texto: ANTERIOR, client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('reintentar')
    }
  })
  it('«Qué cambió» tras el título, en medio o en el lugar de la del modelo ⇒ el mismo plan sigue siendo copia (la quita de AMBOS textos)', async () => {
    const SEC = ['## Qué cambió', '- Más reels: aplicado', '- Otra cosa: aplicado', ''].join('\n')
    const PLAN = ['# Plan de 90 días', '', '## Semana 1', 'lanzar la carta de Olón.', '', '## Semana 2', 'reels de producto.'].join('\n')
    const conSeccion = [
      PLAN.replace('## Semana 1', SEC + '\n## Semana 1'), // tras el título
      PLAN.replace('## Semana 2', SEC + '\n## Semana 2'), // en medio
      PLAN + '\n\n' + SEC, // al final
    ]
    for (const texto of conSeccion) {
      const re = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto } }
      expect((await comparar({ texto: PLAN, client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('reintentar')
    }
  })
  it('«Qué cambió» en negritas o con dos puntos termina en el siguiente título de CUALQUIER rango', async () => {
    for (const marca of ['**Qué cambió**', 'Qué cambió:']) {
      const guardado = ['# Plan', '', marca, '- a', '', '## Semana 1', 'lanzar la carta.'].join('\n')
      const re = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto: guardado } }
      expect((await comparar({ texto: ['# Plan', '', '## Semana 1', 'lanzar la carta.'].join('\n'), client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('reintentar')
      expect((await comparar({ texto: ['# Plan', '', '## Semana 1', 'lanzar otra carta.'].join('\n'), client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('no')
    }
  })
  it('sección justo tras el título y un párrafo suelto antes del primer subtítulo (donde la inserta la plataforma): corte corto ⇒ sigue siendo copia; si el párrafo cambia ⇒ NO', async () => {
    const guardado = ['# Plan', '', '## Qué cambió', '- a', '- b', '', 'Párrafo suelto de intro.', '', '## Semana 1', 'lanzar la carta.'].join('\n')
    const re = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto: guardado } }
    expect((await comparar({ texto: ['# Plan', '', 'Párrafo suelto de intro.', '', '## Semana 1', 'lanzar la carta.'].join('\n'), client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('reintentar')
    expect((await comparar({ texto: ['# Plan', '', 'Otro párrafo de intro.', '', '## Semana 1', 'lanzar la carta.'].join('\n'), client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('no')
    expect((await comparar({ texto: ['# Plan', '', 'Párrafo suelto de intro.', '', '## Semana 1', 'lanzar la carta y más.'].join('\n'), client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('no')
  })
  it('la sección termina en el siguiente título del mismo o mayor rango; lo que viene después SÍ cuenta', async () => {
    const guardado = '# Plan de 90 días\n\n## Qué cambió\n- A\n### detalle\n- B\n\n## Semana 1\nlanzar la carta de Olón.'
    const re = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto: guardado } }
    expect((await comparar({ texto: '# Plan de 90 días\n\n## Semana 1\nlanzar la carta de Olón.', client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('reintentar')
    expect((await comparar({ texto: '# Plan de 90 días\n\n## Semana 1\nlanzar la carta de Guayaquil.', client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('no')
  })
  it('dos secciones «Qué cambió» DISTINTAS con el resto igual ⇒ copia; un cambio real de una línea fuera de la sección ⇒ NO', async () => {
    const A = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto: '# T\n\n## Qué cambió\n- uno\n\n## Resto\nigual' } }
    expect((await comparar({ texto: '# T\n\n## Qué cambió\n- otro distinto\n\n## Resto\nigual', client_id: CLIENTE }, A, 0)).copia_del_plan_anterior).toBe('reintentar')
    expect((await comparar({ texto: '# T\n\n## Qué cambió\n- uno\n\n## Resto\nigual y un poco más', client_id: CLIENTE }, A, 0)).copia_del_plan_anterior).toBe('no')
  })
  it('lo que sobra al final del guardado NO es la sección «Qué cambió» (cambio real) ⇒ no es copia', async () => {
    const re = { ...REESCRITURA, plan_anterior: { ...REESCRITURA.plan_anterior, texto: ANTERIOR + '\n\nSemana 3: sorteo' } }
    expect((await comparar({ texto: ANTERIOR, client_id: CLIENTE }, re, 0)).copia_del_plan_anterior).toBe('no')
  })
  it('comparación imposible (plan anterior sin texto legible, o plan nuevo vacío) ⇒ NO se calla ni se bloquea: pasa rotulado `comparacion_fallo`', async () => {
    for (const re of [{ ...REESCRITURA, plan_anterior: { id: 'p-1', texto: '' } }, { ...REESCRITURA, plan_anterior: { id: 'p-1', texto: 42 } }, { ...REESCRITURA, plan_anterior: null }]) {
      const r = await comparar({ texto: ANTERIOR, client_id: CLIENTE }, re)
      expect(r.copia_del_plan_anterior).toBe('no')
      expect(r.comparacion_fallo).toBe(true)
    }
    expect((await comparar({ texto: '   ', client_id: CLIENTE }, REESCRITURA)).comparacion_fallo).toBe(true)
  })
})

describe('las puertas (IF) y el final, ejecutados', () => {
  it('«reintentar» vuelve al redactor, «detener» sigue al final, cualquier otra cosa guarda', async () => {
    for (const [valor, esperado] of [['reintentar', 'Pedir el plan al redactor'], ['detener', NODO_COPIA_PREGUNTA], ['no', 'Guardar el plan'], [undefined, 'Guardar el plan']] as const) {
      const r = await recorrer(nuevo, NODO_COPIA_REINTENTO, { copia_del_plan_anterior: valor, texto: 'x' }, { hasta: ['Pedir el plan al redactor', NODO_COPIA_PREGUNTA, 'Guardar el plan'] })
      expect(r.ultimo).toBe(esperado)
    }
  })
  it('con pedido de cambios: PATCH «fallido» con el detalle verdadero y cierre sin plan guardado', async () => {
    const vistas: any[] = []
    const r = await recorrer(nuevo, NODO_COPIA_PREGUNTA, { copia_del_plan_anterior: 'detener' }, {
      previos: { 'Webhook · planeacion': [{ body: { client_id: CLIENTE, plan_cambio_id: 'c-1', _sala_correlation_id: 'corr-1' } }] },
      env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', SALA_CALLBACK_URL: 'https://sala/cb', INTERNAL_API_KEY: 'i' },
      http: (url: string, _h: any, cuerpo: any) => { vistas.push({ url, cuerpo }); return { statusCode: 200, body: { ok: true, event_id: 'e-1' } } },
      hasta: [NODO_COPIA_VOLVIO],
    })
    expect(r.pasos).toEqual([NODO_COPIA_PREGUNTA, NODO_COPIA_CAMBIO, NODO_COPIA_RESUMEN, NODO_COPIA_CABLE, NODO_COPIA_VOLVIO])
    expect(r.pasos).not.toContain('Guardar el plan')
    const patch = vistas.find((v) => /plan_cambios/.test(String(v.url)))
    expect(String(patch.url)).toContain('id=eq.c-1')
    expect(JSON.stringify(patch.cuerpo)).toContain('sin cambios reales')
    const cables = vistas.filter((v) => /sala\/cb/.test(String(v.url)))
    expect(cables.length).toBe(1)
    expect(cables[0].cuerpo.resultado).toBe('no_corrio_sin_cambios_reales')
    expect(cables[0].cuerpo.motivo).toBe(DETALLE_SIN_CAMBIOS)
    expect(cables[0].cuerpo._sala_correlation_id).toBe('corr-1')
  })
  it('sin pedido de cambios (disparo a mano): no hay PATCH, pero sí resumen y cable', async () => {
    const vistas: any[] = []
    const r = await recorrer(nuevo, NODO_COPIA_PREGUNTA, { copia_del_plan_anterior: 'detener' }, {
      previos: { 'Webhook · planeacion': [{ body: { client_id: CLIENTE } }] },
      env: { SALA_CALLBACK_URL: 'https://sala/cb', INTERNAL_API_KEY: 'i' },
      http: (url: string, _h: any, cuerpo: any) => { vistas.push({ url, cuerpo }); return { statusCode: 200, body: { ok: true, event_id: 'e-1' } } },
      hasta: [NODO_COPIA_VOLVIO],
    })
    expect(r.pasos).toEqual([NODO_COPIA_PREGUNTA, NODO_COPIA_RESUMEN, NODO_COPIA_CABLE, NODO_COPIA_VOLVIO])
    expect(vistas.some((v) => /plan_cambios/.test(String(v.url)))).toBe(false)
  })
  const volvio = async (respuesta: any, corr: string | null) => {
    const $ = () => ({ first: () => ({ json: { body: { _sala_correlation_id: corr } } }) })
    return new AsyncFunction('$', '$input', nodo(NODO_COPIA_VOLVIO).parameters.jsCode)($, { first: () => ({ json: respuesta }) })
  }
  it('un cable que no vuelve, despachado por la sala, falla RUIDOSO (no queda mudo); a mano no hay a quién contestar', async () => {
    await expect(volvio({ ok: false, code: 'x' }, 'corr-1')).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
    await expect(volvio({}, 'corr-1')).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
    expect((await volvio({ ok: true, event_id: 'e-9' }, 'corr-1'))[0].json).toEqual({ cierre: 'no_corrio_sin_cambios_reales', vuelta_ok: true, vuelta_detalle: 'e-9', despachado_por_la_sala: true })
    expect((await volvio({ ok: false }, null))[0].json.vuelta_ok).toBe(false)
  })
})
