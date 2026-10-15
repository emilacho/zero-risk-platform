/**
 * JEFATURA como oficina propia · J2 · (a) la regla dura del editor y `extra.workflow_execution_id` (diseño §9.4 a/b), (b) los pedidos: línea de contexto, tres líneas, GPT ciego, tuteo,
 * (c) la tabla por tipo hecha plantilla, (d) lo común es una FACHADA (la oficina no se toca). US$ 0.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { barrerTexto } from '../scripts/ops/barrer-voseo.mjs'
import { EDITOR_WHITELIST, requiresEditorReview } from '../src/lib/editor-routing'
import { CABECERA_SALTAR_EDITOR as CABECERA_DE_LA_CADENA } from '../src/lib/cadena/constantes'
import * as comun from '../src/lib/revision-comun'
import * as motorOficina from '../src/lib/oficina/motor'
import * as salidaOficina from '../src/lib/oficina/salida'
import * as revisorOficina from '../src/lib/revisor-gpt'
import * as libroDelRevisor from '../src/lib/revisor-gpt-libro'
import { armarPedidoCiego, armarPedidoDeAgente, auditarPedidoDeAgente, CABECERA_SALTAR_EDITOR, CLAVES_PERMITIDAS_EN_EXTRA, documentosDeLaLinea, tareaDeCorreccion, tareaDeDecision, tareaDeRevisionDeFondo, TRES_LINEAS_DEL_PLAN } from '../src/lib/jefatura/revision/pedidos'
import { atiende, CLAVE_DE_CORRECCION, CLAVE_DE_DECISION, duenosDe, esquemaDelDueno, plantillaDePolitica, politicaDeFila, TOPE_MAXIMO_DE_REVISION_USD, topeDelPaso } from '../src/lib/jefatura/revision/politicas'
import { TIPOS_DE_REVISION } from '../src/lib/jefatura/revision/contrato'
import { FILAS_DE_POLITICA, politica, sobre } from './_helpers/jefatura-revision'

const TIPOS_CON_FILA = ['plan', 'estrategia', 'calendario', 'brief', 'pieza'] as const
const datos = (o: Record<string, unknown> = {}) => ({ agente: 'content-creator', task: 't', esquema: 'resolucion.v1', indicacion: 'i', paso: 'correccion:content-creator', revision_id: 'r1', dispatch_key: 'r1:2', max_budget_usd: 0.2, dry_run: true, client_id: 'c', ...o })

describe('regla dura del editor (aviso 5.2 · certificación §4)', () => {
  it('la cabecera es la misma que la de la cadena', () => { expect(CABECERA_SALTAR_EDITOR).toBe(CABECERA_DE_LA_CADENA) })
  it('el pedido lleva SIEMPRE la cabecera y `extra` solo con las 4 claves permitidas', () => {
    const p = armarPedidoDeAgente(datos())
    expect(p.headers_requeridos).toEqual({ 'x-skip-editor-middleware': '1' })
    expect(Object.keys(p.extra).sort()).toEqual([...CLAVES_PERMITIDAS_EN_EXTRA].sort())
    expect(p.force_restart).toBe(true)
    expect(auditarPedidoDeAgente(p)).toEqual([])
  })
  it('la simulación y la marca de reintento solo viajan cuando corresponde: en seco la simulación; el pedido REAL nunca la lleva', () => {
    const sim = { fichas: 'bloquea' as const }
    expect(armarPedidoDeAgente(datos({ dry_run: true, simulacion: sim })).simulacion).toEqual(sim)
    expect(armarPedidoDeAgente(datos({ dry_run: false, simulacion: sim })).simulacion).toBeUndefined()
    expect(armarPedidoDeAgente(datos({ dry_run: true })).simulacion).toBeUndefined()
    expect(armarPedidoDeAgente(datos({ reintento_formato: true })).reintento_formato).toBe(true)
    expect(armarPedidoDeAgente(datos()).reintento_formato).toBeUndefined()
  })
  it('colar `workflow_execution_id` (o cualquier otra clave) en `extra` revienta al armar el pedido', () => {
    expect(() => armarPedidoDeAgente(datos({ extra_ajeno: { workflow_execution_id: 'exec-1' } }))).toThrow(/workflow_execution_id/)
    expect(() => armarPedidoDeAgente(datos({ extra_ajeno: { cualquiera: 1 } }))).toThrow(/cualquiera/)
  })
  it('la auditoría atrapa los tres errores: extra con workflow_execution_id, agente de la lista sin cabecera, y falta de force_restart', () => {
    const bueno = armarPedidoDeAgente(datos())
    expect(auditarPedidoDeAgente({ ...bueno, extra: { ...bueno.extra, workflow_execution_id: 'e' } }).join(' ')).toMatch(/resucita a los 3 revisores/)
    expect(auditarPedidoDeAgente({ ...bueno, headers_requeridos: {} }).join(' ')).toMatch(/content-creator.*cabecera/)
    expect(auditarPedidoDeAgente({ ...bueno, headers_requeridos: { 'x-skip-editor-middleware': '0' } }).length).toBeGreaterThan(0)
    expect(auditarPedidoDeAgente({ ...bueno, force_restart: false }).join(' ')).toMatch(/force_restart/)
    expect(auditarPedidoDeAgente({ ...bueno, extra: { ...bueno.extra, otra: 1 } }).join(' ')).toMatch(/extra\.otra/)
    expect(auditarPedidoDeAgente(null)).toEqual(['el pedido no es un objeto'])
  })
  it('un agente FUERA de la lista sin cabecera no es error (la cabecera es inocua), pero uno DE la lista sí', () => {
    const fuera = { ...armarPedidoDeAgente(datos({ agente: 'campaign-brief-agent' })), headers_requeridos: {} }
    expect(requiresEditorReview('campaign-brief-agent')).toBe(false)
    expect(auditarPedidoDeAgente(fuera)).toEqual([])
    const dentro = { ...armarPedidoDeAgente(datos({ agente: 'social-media-strategist' })), headers_requeridos: {} }
    expect(requiresEditorReview('social-media-strategist')).toBe(true)
    expect(auditarPedidoDeAgente(dentro).length).toBeGreaterThan(0)
  })
  it('CADA agente de CADA política (productores y revisor de fondo) arma un pedido que pasa la auditoría', () => {
    const slugs = new Set<string>()
    for (const t of TIPOS_CON_FILA) { const p = politica(t); slugs.add(p.revisor_fondo!); for (const x of p.productores) slugs.add(x.agente) }
    expect([...slugs].sort()).toEqual(['campaign-brief-agent', 'content-creator', 'jefe-marketing', 'marketing_instagram_curator', 'social-media-strategist'])
    for (const s of slugs) expect(auditarPedidoDeAgente(armarPedidoDeAgente(datos({ agente: s }))), s).toEqual([])
  })
  it('la lista del editor no se toca: los agentes que usa la jefatura que SÍ están en ella son los de siempre (content-creator, social-media-strategist)', () => {
    expect(Object.keys(EDITOR_WHITELIST)).toHaveLength(14)
    const enLista = ['jefe-marketing', 'campaign-brief-agent', 'content-creator', 'social-media-strategist', 'marketing_instagram_curator'].filter(requiresEditorReview).sort()
    expect(enLista).toEqual(['content-creator', 'social-media-strategist'])
  })
})

describe('los pedidos', () => {
  it('jefe-marketing: UNA línea de contexto del tipo con los documentos de la política, sin reglas ni criterios nuevos', () => {
    const esperadas: Record<string, RegExp> = {
      plan: /^Estás revisando el plan de 90 días contra manual de marca vigente, ficha del cliente y lo que dijo el dueño\.$/m,
      estrategia: /^Estás revisando la estrategia contra manual de marca vigente y plan vigente\.$/m,
      calendario: /^Estás revisando el calendario contra manual de marca vigente, plan vigente, estrategia validada y fechas verificadas\.$/m,
      brief: /^Estás revisando el parte de briefs contra manual de marca vigente, plan vigente y filas del calendario\.$/m,
    }
    for (const t of ['plan', 'estrategia', 'calendario', 'brief'] as const) {
      const pol = politica(t)
      const r = tareaDeRevisionDeFondo({ politica: pol, payload: (sobre(t).payload as never), tipo: t, texto: 'ARTEFACTO', duenos: duenosDe(pol.productores) })
      expect(r.task, t).toMatch(esperadas[t])
      expect(r.indicacion).toMatch(/^Estás revisando/)
      expect(r.task).not.toMatch(/\{documentos\}/)
      expect(r.esquema).toBe('fichas.v1')
      // sin reglas ni criterios nuevos: solo el formato
      expect(r.task).not.toMatch(/debes|nunca|siempre|criterio|rúbrica|puntúa|califica/i)
    }
  })
  it('la pieza conserva la indicación que ya tenía la plantilla (cinco reglas del jefe) y pide el «donde» por parte', () => {
    const pol = politica('pieza')
    const r = tareaDeRevisionDeFondo({ politica: pol, payload: sobre('pieza').payload as never, tipo: 'pieza', texto: 'PIEZA', duenos: duenosDe(pol.productores) })
    expect(r.task).toMatch(/No reescribes la pieza: señalas y propones\./)
    expect(r.task).toMatch(/«texto» y «imagen»/)
  })
  it('los documentos de la línea salen de la política en minúscula inicial', () => { expect(documentosDeLaLinea(politica('estrategia'))).toBe('manual de marca vigente y plan vigente') })
  it('a la corrección del plan: pedido original + plan actual + SOLO las fichas dadas + las tres líneas + el formato; la decisión lleva la opinión y la instrucción', () => {
    const pol = politica('plan'); const d = duenosDe(pol.productores)[0]
    const c = tareaDeCorreccion({ politica: pol, payload: sobre('plan').payload as never, tipo: 'plan', dueno: d, esquema: 'plan_texto_y_resolucion.v1', texto: 'PLAN A', fichas: [{ id: 'f1', que: 'grave', donde: 's4' }], version_actual: 'A' })
    for (const l of TRES_LINEAS_DEL_PLAN) expect(c.task).toContain(l)
    expect(c.task.indexOf('PEDIDO ORIGINAL')).toBeLessThan(c.task.indexOf('## El plan actual (A)'))
    expect(c.task).toContain('- [f1] (bloquea) en s4: grave')
    const dec = tareaDeDecision({ politica: pol, payload: sobre('plan').payload as never, tipo: 'plan', dueno: d, esquema: 'plan_texto_y_resolucion.v1', texto: 'PLAN B', fichas: [{ id: 'e1', donde: 'general' }], opinion: 'OPINION DE GPT', version_actual: 'B' })
    expect(dec.task).toContain('OPINION DE GPT')
    expect(dec.task).toContain('Si no tomas nada, responde solo la resolución, sin texto del plan.')
    expect(dec.task).toContain('es la última, no habrá otra revisión')
  })
  it('GPT es CIEGO por construcción: el pedido es la pregunta D3, lo revisado y el contexto; no hay parámetro por donde entren fichas o hilo', () => {
    const r = armarPedidoCiego({ tipo: 'plan', texto: 'EL PLAN COMPLETO', contexto: [{ titulo: 'Manual de marca vigente', texto: 'MANUAL', funcion: 'manda' }], huecos_de_la_politica: politica('plan').huecos_pregunta })
    expect(r.texto.indexOf('Te comparto')).toBe(0)
    expect(r.texto.indexOf('## El plan de 90 días')).toBeLessThan(r.texto.indexOf('## Contexto de la marca'))
    expect(r.texto).toContain('el plan de campaña de 90 días, que se usa para guiar toda la producción de la campaña')
    expect(r.texto).not.toMatch(/ficha|jefe|bloquea|hilo|corrección/i)
    // la firma de la función: solo estos campos
    expect(armarPedidoCiego.length).toBe(1)
    const fuente = readFileSync(resolve(__dirname, '..', 'src', 'lib', 'jefatura', 'revision', 'pedidos.ts'), 'utf8')
    const firma = /export function armarPedidoCiego\(a: \{([^}]*(?:\{[^}]*\}[^}]*)*)\}\)/.exec(fuente)?.[1] ?? ''
    expect(firma).not.toMatch(/fichas|estado|hilo|resoluciones/)
  })
  it('TUTEO: ninguna instrucción interna que arma la jefatura lleva voseo (barrido con la herramienta del proyecto)', () => {
    const textos: string[] = [...TRES_LINEAS_DEL_PLAN]
    for (const t of TIPOS_CON_FILA) {
      const pol = politica(t); const d = duenosDe(pol.productores)[0]
      const pl = sobre(t).payload as never
      textos.push(pol.indicacion_fondo ?? '')
      textos.push(tareaDeRevisionDeFondo({ politica: pol, payload: pl, tipo: t, texto: 'x', duenos: duenosDe(pol.productores) }).task)
      const esq = esquemaDelDueno(pol, d)
      textos.push(tareaDeCorreccion({ politica: pol, payload: pl, tipo: t, dueno: d, esquema: esq, texto: 'x', fichas: [{ id: 'a', donde: 'texto', que: 'q' }], version_actual: 'A' }).task)
      textos.push(tareaDeDecision({ politica: pol, payload: pl, tipo: t, dueno: d, esquema: esq, texto: 'x', fichas: [{ id: 'a', donde: 'texto' }], opinion: 'o', version_actual: 'A' }).task)
    }
    for (const x of textos) expect(barrerTexto(x).cambios, x.slice(0, 60)).toEqual([])
  })
})

describe('la tabla por tipo, hecha política y plantilla', () => {
  it('cada tipo con fila se arma; el cimiento y el contenido de julio NO sirven como revisión', () => {
    for (const t of TIPOS_CON_FILA) expect(politicaDeFila({ ...FILAS_DE_POLITICA[t] }).ok, t).toBe(true)
    expect(politicaDeFila({ artifact_type: 'brand_book', artifact_class: 'cimiento' }).ok).toBe(false)
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.pieza, artifact_class: 'contenido' }).ok).toBe(false)
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.pieza, artifact_type: 'copy' }).ok).toBe(false)
  })
  it.each([
    ['revisión que vota', { judgment_enabled: true }],
    ['sin revisor de fondo', { revisor_fondo: null }],
    ['re-entrega inventada', { reentrega: 'siempre' }],
    ['destino inventado', { destino_cierre: 'correo' }],
    ['tope sobre el máximo', { tope_revision_usd: TOPE_MAXIMO_DE_REVISION_USD + 1 }],
    ['tope 0', { tope_revision_usd: 0 }],
    ['con re-entrega y sin esquema', { esquema_correccion: null }],
  ])('una fila mal armada no se usa a medias: %s', (_n, cambios) => { expect(politicaDeFila({ ...FILAS_DE_POLITICA.pieza, ...cambios }).ok).toBe(false) })
  it('el tope máximo es 10 LITERAL: 10 pasa, 10,01 no (no depende de la constante)', () => {
    expect(TOPE_MAXIMO_DE_REVISION_USD).toBe(10)
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.pieza, tope_revision_usd: 10 }).ok).toBe(true)
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.pieza, tope_revision_usd: 10.01 }).ok).toBe(false)
  })
  it('la no-circularidad del manual vive en el CÓDIGO: ni con un revisor de fondo declarado se acepta como revisión', () => {
    const conRevisor = { ...FILAS_DE_POLITICA.manual, revisor_fondo: 'jefe-marketing', reentrega: 'ninguna', destino_cierre: 'siguiente_paso', tope_revision_usd: 1, productores: [] }
    const r = politicaDeFila(conRevisor)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/no-circularidad/)
  })
  it('el jefe recibe los documentos del contexto en SU pedido (no solo el artefacto)', () => {
    const pol = politica('estrategia')
    const payload = { ...(sobre('estrategia').payload as object), contexto: [{ titulo: 'Plan vigente', texto: 'TEXTO DEL PLAN VIGENTE', funcion: 'la estrategia sale de él' }] } as never
    const r = tareaDeRevisionDeFondo({ politica: pol, payload, tipo: 'estrategia', texto: 'ARTEFACTO', duenos: duenosDe(pol.productores) })
    expect(r.task).toContain('### Plan vigente — la estrategia sale de él')
    expect(r.task).toContain('TEXTO DEL PLAN VIGENTE')
  })
  it('el manual no tiene revisor (no-circularidad) y brief no necesita esquema ni productores de corrección', () => {
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.manual }).ok).toBe(false)
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.brief }).ok).toBe(true)
  })
  it('el plan: tope de revisión 5,00; corrección y decisión 2,00; versión nueva', () => {
    const p = politica('plan')
    expect(p.tope_revision_usd).toBe(5)
    expect([topeDelPaso(p, 'revision_fondo'), topeDelPaso(p, 'correccion'), topeDelPaso(p, 'segunda_mirada'), topeDelPaso(p, 'decision')]).toEqual([0.2, 2, 0.5, 2])
    expect(p.reentrega).toBe('version_nueva')
    expect(p.destino_cierre).toBe('siguiente_paso')
  })
  it('solo la pieza termina en la bandeja', () => { for (const t of TIPOS_CON_FILA) expect(politica(t).destino_cierre).toBe(t === 'pieza' ? 'bandeja' : 'siguiente_paso') })
  it('los pasos por defecto cuando la fila no trae topes', () => {
    const p = politica('pieza', { tope_paso_usd: {} })
    expect([topeDelPaso(p, 'revision_fondo'), topeDelPaso(p, 'correccion'), topeDelPaso(p, 'segunda_mirada'), topeDelPaso(p, 'decision')]).toEqual([0.2, 0.2, 0.5, 0.2])
  })
  it('plantilla de la pieza: jefe → una corrección POR dueño → GPT → una decisión POR dueño → cierre', () => {
    const pol = politica('pieza')
    const pl = plantillaDePolitica(pol, pol.productores, 1.5)
    expect(pl.pasos.map((x) => x.clave)).toEqual(['revision_fondo', CLAVE_DE_CORRECCION('content-creator'), CLAVE_DE_CORRECCION('marketing_instagram_curator'), 'segunda_mirada', CLAVE_DE_DECISION('content-creator'), CLAVE_DE_DECISION('marketing_instagram_curator'), 'cierre'])
    expect(pl.pasos.find((x) => x.clave === 'segunda_mirada')).toMatchObject({ tipo: 'externo', quien: 'GPT', ronda: 2 })
    expect(pl.pasos.find((x) => x.clave === 'revision_fondo')).toMatchObject({ quien: 'jefe-marketing', ronda: 1, salida: { esquema: 'fichas.v1' } })
    // sin ciclos: ningún paso vuelve atrás
    expect(pl.pasos.some((x) => x.vuelve_a)).toBe(false)
  })
  it('brief («solo marca»): ni corrección ni decisión', () => {
    const pol = politica('brief')
    expect(plantillaDePolitica(pol, pol.productores, 1).pasos.map((x) => x.clave)).toEqual(['revision_fondo', 'segunda_mirada', 'cierre'])
  })
  it('plan: un solo dueño (comodín) con corrección y decisión en el esquema de texto plano + bloque', () => {
    const pol = politica('plan')
    const pl = plantillaDePolitica(pol, pol.productores, 5)
    expect(pl.pasos.map((x) => x.clave)).toEqual(['revision_fondo', 'correccion:campaign-brief-agent', 'segunda_mirada', 'decision:campaign-brief-agent', 'cierre'])
    expect(pl.pasos[1].salida?.esquema).toBe('plan_texto_y_resolucion.v1')
    expect(pl.pasos[1].condicion).toEqual({ tipo: 'si_fichas_abiertas', origen: 'jefe', gravedad: 'bloquea' })
    expect(pl.pasos[3].condicion).toEqual({ tipo: 'si_fichas_abiertas', origen: 'externa' })
  })
  it('el tope de la plantilla es el menor entre el de la revisión, la política y 10', () => {
    const pol = politica('plan')
    expect(plantillaDePolitica(pol, pol.productores, 0.4).limites.tope_encargo_usd).toBe(0.4)
    expect(plantillaDePolitica(pol, pol.productores, 99).limites.tope_encargo_usd).toBe(5)
  })
  it('esquema por dueño: en la pieza solo el texto entrega pieza corregida; quien dirige la imagen solo responde', () => {
    const pol = politica('pieza')
    const [texto, imagen] = duenosDe(pol.productores)
    expect(esquemaDelDueno(pol, texto)).toBe('resolucion.v1')
    expect(esquemaDelDueno(pol, imagen)).toBe('resolucion_solo.v1')
    expect(atiende(texto, 'texto')).toBe(true)
    expect(atiende(texto, 'imagen')).toBe(false)
    expect(atiende({ agente: 'x', dondes: [], comodin: true }, 'cualquier cosa')).toBe(true)
  })
  it('hay una fila de política por cada tipo del contrato', () => { expect(Object.keys(FILAS_DE_POLITICA).sort()).toEqual([...TIPOS_DE_REVISION].sort()) })
})

describe('lo común es una FACHADA: la oficina no se toca y la jefatura importa solo de ahí', () => {
  it('re-exporta tal cual (misma identidad) el motor, los contratos de formato y el revisor GPT de la oficina', () => {
    expect(comun.siguientePaso).toBe(motorOficina.siguientePaso)
    expect(comun.registrarPaso).toBe(motorOficina.registrarPaso)
    expect(comun.evaluar).toBe(motorOficina.evaluar)
    expect(comun.procesarSalida).toBe(salidaOficina.procesarSalida)
    expect(comun.ESQUEMAS).toBe(salidaOficina.ESQUEMAS)
    expect(comun.validar).toBe(salidaOficina.validar)
    expect(comun.llamarRevisorGpt).toBe(revisorOficina.llamarRevisorGpt)
    expect(comun.PREGUNTA_AL_REVISOR).toBe(revisorOficina.PREGUNTA_AL_REVISOR)
    expect(comun.ESPERAS_DEL_REVISOR_MS).toBe(revisorOficina.ESPERAS_DEL_REVISOR_MS)
    expect(comun.llamarRevisorGptConLibro).toBe(libroDelRevisor.llamarRevisorGptConLibro)
  })
  it('los esquemas nuevos de la jefatura NO se añaden a `ESQUEMAS` de la oficina (su comportamiento no cambia)', () => {
    for (const k of ['resolucion_objeto.v1', 'resolucion_parcial.v1', 'plan_texto_y_resolucion.v1', 'bloque_de_resolucion']) expect(k in comun.ESQUEMAS).toBe(false)
    for (const k of ['fichas.v1', 'resolucion.v1', 'resolucion_solo.v1', 'opinion_libre.v1']) expect(k in comun.ESQUEMAS).toBe(true)
  })
  it('ningún archivo de la jefatura (revisión) importa de la oficina directamente: todo va por `revision-comun`', () => {
    const dir = resolve(__dirname, '..', 'src', 'lib', 'jefatura', 'revision')
    expect(existsSync(dir)).toBe(true)
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const s = readFileSync(resolve(dir, f), 'utf8')
      expect(s, f).not.toMatch(/from ['"][^'"]*\/oficina\//)
      expect(s, f).not.toMatch(/from ['"][^'"]*revisor-gpt['"]/)
    }
  })
  it('y nadie la llama todavía: nada fuera de su carpeta (y de las rutas /api/jefatura/{revisiones,turnos,vigia}, que son J3) importa la revisión de la jefatura, salvo el paso `jefatura` de la oficina (J8a: tipos, puerto y adaptador)', () => {
    const buscar = (dir: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name)
        if (e.isDirectory()) { if (!/node_modules|\.next/.test(e.name)) buscar(p, acc) } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p)
      }
      return acc
    }
    const raiz = resolve(__dirname, '..', 'src')
    const permitido = /\/lib\/jefatura\/revision\/|\/app\/api\/jefatura\/(revisiones|turnos|vigia)\/|\/__tests__\//
    const importadores = buscar(raiz).filter((f) => !permitido.test(f.split(String.fromCharCode(92)).join('/')) && /from ['"][^'"]*jefatura\/revision/.test(readFileSync(f, 'utf8')))
    // J8a · la ÚNICA puerta de la oficina hacia la jefatura: el paso `jefatura` (su módulo puro, su tipo de puerto, su orquestador y su adaptador). Cualquier otro importador sigue siendo un error.
    expect(importadores.map((f) => f.replace(/\\/g, '/').split('/src/')[1]).sort()).toEqual(['lib/cadena/almacen-supabase.ts', 'lib/oficina/adaptadores.ts', 'lib/oficina/orquestador.ts', 'lib/oficina/paso-jefatura.ts', 'lib/oficina/puertos.ts']) // J7: la cadena lee la config y la política de la jefatura por SU almacén (punto de espera «antes de pasar»); no nombra tablas `jefatura_*` ni abre revisiones
  }, 60_000)
})
