/**
 * EL NODO VISUAL, DENTRO DEL CIMIENTO, ANTES DEL PROMOTE · construcción, a costo cero · CC#1 · 2026-09-26
 * · §144 Emilio. Se construye contra la captura REAL del cimiento vivo (`ssLtwYPt7zxuvnM2` v`a0b67fad`,
 * tomada el 26-sep antes de tocar nada) — no un fixture inventado: si el flujo real cambia de forma,
 * el constructor tiene que fallar ruidoso, no publicar algo distinto de lo pensado.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const CIMIENTO_VIVO = 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/evidencia/2026-09-26-NODO-VISUAL/cimiento-vivo-antes.json'
const vivo = JSON.parse(readFileSync(CIMIENTO_VIVO, 'utf8'))

describe('el cimiento vivo capturado el 26-sep tiene la forma que el constructor asume', () => {
  it('30 nodos · apagado · versión a0b67fad · las dos ramas hacia Promote prep existen tal como se midieron', () => {
    expect(vivo.nodes).toHaveLength(30)
    expect(vivo.active).toBe(false)
    expect(vivo.versionId.slice(0, 8)).toBe('a0b67fad')
    expect(vivo.connections['[BB] IF · fidelidad PASS'].main[0]).toEqual([{ node: '[BB] Promote prep', type: 'main', index: 0 }])
    expect(vivo.connections['[BB] IF · ciclos agotados'].main[0]).toEqual([{ node: '[BB] Promote prep', type: 'main', index: 0 }])
  })
})

describe('construir() · el nodo entra en el único punto que el diseño pide, y nada más cambia', async () => {
  const { construir, diferencias, NODO, PROMOTE_PREP, IF_FIDELIDAD, IF_CICLOS, codigoDelNodo } = await import('../scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-nodo-visual.mjs')
  const construido = construir(vivo)

  it('31 nodos (uno más) · el nodo nuevo está, con onError continueRegularOutput', () => {
    expect(construido.nodes).toHaveLength(31)
    const nodo = construido.nodes.find((n: { name: string }) => n.name === NODO)
    expect(nodo).toBeTruthy()
    expect(nodo.type).toBe('n8n-nodes-base.code')
    expect(nodo.onError).toBe('continueRegularOutput')
    expect(nodo.parameters.jsCode).toBe(codigoDelNodo())
  })

  it('las DOS ramas que hoy llegan a Promote prep se retargetean al nodo nuevo · el nodo nuevo sale hacia Promote prep', () => {
    expect(construido.connections[IF_FIDELIDAD].main[0]).toEqual([{ node: NODO, type: 'main', index: 0 }])
    expect(construido.connections[IF_CICLOS].main[0]).toEqual([{ node: NODO, type: 'main', index: 0 }])
    expect(construido.connections[NODO]).toEqual({ main: [[{ node: PROMOTE_PREP, type: 'main', index: 0 }]] })
  })

  it('las OTRAS salidas de esos dos IF (rama no-pass · rama con ciclos) quedan exactamente iguales', () => {
    expect(construido.connections[IF_FIDELIDAD].main[1]).toEqual(vivo.connections[IF_FIDELIDAD].main[1])
    expect(construido.connections[IF_CICLOS].main[1]).toEqual(vivo.connections[IF_CICLOS].main[1])
  })

  it('ningún otro nodo cambia de contenido (parámetros idénticos) · sólo cambian las conexiones que se esperaba tocar', () => {
    const dif = diferencias(vivo, construido)
    expect(dif.borrados).toHaveLength(0)
    expect(dif.nuevos).toEqual([NODO])
    expect(dif.cambiados).toHaveLength(0) // el diff de "cambiados" mira parámetros de nodo, no conexiones
    expect(dif.conexionesIguales).toBe(false) // las conexiones SÍ cambian: es justo lo que se construyó
    // y la única diferencia de conexiones son las tres tocadas a propósito
    const conexAntesSinTocar = { ...vivo.connections }
    const conexDespuesSinTocar = { ...construido.connections }
    delete conexAntesSinTocar[IF_FIDELIDAD]; delete conexDespuesSinTocar[IF_FIDELIDAD]
    delete conexAntesSinTocar[IF_CICLOS]; delete conexDespuesSinTocar[IF_CICLOS]
    delete conexDespuesSinTocar[NODO] // no existía antes
    expect(conexDespuesSinTocar).toEqual(conexAntesSinTocar)
  })

  it('no se toca ningún otro nodo con `Promote` en el nombre · el Promote sigue exactamente como estaba', () => {
    const antes = vivo.nodes.find((n: { name: string }) => n.name === PROMOTE_PREP)
    const despues = construido.nodes.find((n: { name: string }) => n.name === PROMOTE_PREP)
    expect(despues.parameters).toEqual(antes.parameters)
    expect(despues.position).toEqual(antes.position)
  })

  it('los settings del flujo se preservan (mismo subconjunto que el resto de los constructores de este proyecto)', () => {
    expect(construido.settings).toEqual(
      Object.fromEntries(
        ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
          .filter((k) => vivo.settings?.[k] !== undefined)
          .map((k) => [k, vivo.settings[k]]),
      ),
    )
  })

  it('no construye dos veces', () => {
    expect(() => construir(construido)).toThrow(/ya existe/)
  })

  it('el código embebido en el nodo no depende de `module.exports` ni de `require`', () => {
    const nodo = construido.nodes.find((n: { name: string }) => n.name === NODO)
    expect(nodo.parameters.jsCode).not.toContain('module.exports')
    expect(nodo.parameters.jsCode).not.toMatch(/\brequire\(/)
    // y usa this.helpers.httpRequest, no `fetch` (el fix del 2026-07-01 que rompió el Promote original)
    expect(nodo.parameters.jsCode).toContain('this.helpers.httpRequest')
    expect(nodo.parameters.jsCode).not.toMatch(/[^.]fetch\(/)
  })

  it('R5 · el cuerpo hacia run-sdk nunca manda la clave client_id (el comentario que EXPLICA la ausencia sí puede decir la palabra)', () => {
    const nodo = construido.nodes.find((n: { name: string }) => n.name === NODO)
    const cuerpoRunSdk = nodo.parameters.jsCode.split("url: ($env.ZERO_RISK_API_URL")[1]
    expect(cuerpoRunSdk).not.toMatch(/client_id\s*:/) // prohíbe la CLAVE (`client_id: ...`), no el comentario que dice «SIN client_id»
    expect(cuerpoRunSdk).toMatch(/SIN client_id, a propósito/)
    expect(nodo.parameters.jsCode).toContain("agent: 'jefe-marketing'")
    expect(nodo.parameters.jsCode).toContain("images_mode: 'base64'")
  })

  it('falla ruidoso si el flujo no tiene la forma esperada (no adivina, no publica algo distinto)', async () => {
    const { construir: construirDeNuevo } = await import('../scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-nodo-visual.mjs')
    const roto = JSON.parse(JSON.stringify(vivo))
    roto.connections['[BB] IF · fidelidad PASS'].main[0] = [{ node: 'otro-nodo', type: 'main', index: 0 }]
    expect(() => construirDeNuevo(roto)).toThrow(/no apunta sólo a/)
    const sinNodo = JSON.parse(JSON.stringify(vivo))
    sinNodo.nodes = sinNodo.nodes.filter((n: { name: string }) => n.name !== '[BB] Promote prep')
    expect(() => construirDeNuevo(sinNodo)).toThrow(/no encontré/)
  })
})
