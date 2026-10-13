/**
 * JEFATURA como oficina propia · J2 · la MÁQUINA de UNA revisión de punta a punta, con almacén en memoria y GPT/agentes simulados (US$ 0, sin red).
 * Cubre las reglas del diseño v4 §3: 1 (GPT ve la versión corregida y nada del hilo), 2 (corrección de fondo no tomada = con desacuerdo), 3 (hallazgo de GPT no tomado no es desacuerdo),
 * 4 (GPT sin respuesta = sin segunda mirada + aviso), 5 (formato roto tras el reintento = fallida), 6 (productor muerto), 7 (sin ficha que bloquea no hay corrección), 8 (chequeos primero),
 * 9 (sin ciclos), 10 (un solo aviso agregado) y 11 (el plan: A → B → C, sin otra vuelta).
 */
import { describe, expect, it } from 'vitest'
import { almacenEnMemoria, correr, politica, puertosDePrueba, sobre, TEXTO_DEL_PLAN } from './_helpers/jefatura-revision'
import { abrirRevision, avanzar, elegirVersionDelPlan as elegirVersion, recibirResultado, vigiar } from '../src/lib/jefatura/revision/orquestador'
import { auditarPedidoDeAgente } from '../src/lib/jefatura/revision/pedidos'

const pasosDe = (c: Awaited<ReturnType<typeof correr>>) => c.turnos.map((t) => t.paso)
const sal = (c: Awaited<ReturnType<typeof correr>>) => c.final.cuerpo.salida as Record<string, any>

describe('la puerta: interruptores, dry_run y guardas', () => {
  it('APAGADA = 409: no abre, no gasta, no llama al revisor, ni siquiera en seco', async () => {
    const { P, rastro, mem } = puertosDePrueba({ almacen: almacenEnMemoria({ config: { estado: 'apagada', tipos_activos: ['pieza'], clientes_ensayo: ['cliente-prueba'] } }) })
    const r = await abrirRevision(P, sobre('pieza'))
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'jefatura_no_abre', motivo: 'apagada' })
    expect(mem.revisiones.size).toBe(0)
    expect(rastro.guardados).toHaveLength(0)
    expect(rastro.llamadasAlRevisor).toHaveLength(0)
  })
  it('sin dry_run booleano = 400 (un valor que parece seco y no lo es pagaría creyendo que no)', async () => {
    const { P, mem } = puertosDePrueba()
    for (const malo of [undefined, 'true', 1, null]) {
      const s = sobre('pieza') as { payload: Record<string, unknown> }
      if (malo === undefined) delete s.payload.dry_run
      else s.payload.dry_run = malo
      const r = await abrirRevision(P, s)
      expect(r.status).toBe(400)
      expect(r.cuerpo.error).toBe('dry_run_obligatorio')
    }
    expect(mem.revisiones.size).toBe(0)
  })
  it('en ensayo solo abre para clientes de ensayo y para tipos activos', async () => {
    const { P } = puertosDePrueba()
    expect((await abrirRevision(P, sobre('pieza', { client_id: 'otro-cliente' }))).cuerpo).toMatchObject({ motivo: 'fuera_del_ensayo' })
    const { P: P2 } = puertosDePrueba({ almacen: almacenEnMemoria({ config: { estado: 'ensayo', tipos_activos: ['plan'], clientes_ensayo: ['cliente-prueba'] } }) })
    expect((await abrirRevision(P2, sobre('pieza'))).cuerpo).toMatchObject({ motivo: 'tipo_no_activo' })
  })
  it('encendida exige el renglón activo (is_active) además de tipos_activos; en ensayo no hace falta', async () => {
    const enc = { estado: 'encendida' as const, tipos_activos: ['pieza'], clientes_ensayo: [] }
    const { P } = puertosDePrueba({ almacen: almacenEnMemoria({ config: enc }) })
    expect((await abrirRevision(P, sobre('pieza'))).cuerpo).toMatchObject({ motivo: 'politica_inactiva' })
    const { P: P2 } = puertosDePrueba({ almacen: almacenEnMemoria({ config: enc, activas: ['pieza'] }) })
    expect((await abrirRevision(P2, sobre('pieza'))).status).toBe(200)
  })
  it('G3: una versión producida por la jefatura NUNCA abre otra revisión (409 sin_otra_vuelta)', async () => {
    const { P, mem } = puertosDePrueba()
    const r = await abrirRevision(P, sobre('plan', { payload: { generado_por_jefatura: '00000000-0000-4000-8000-000000000009' } }))
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('sin_otra_vuelta')
    expect(mem.revisiones.size).toBe(0)
  })
  it('regla 8: con `necesita_humano` del validador por código la jefatura NO abre', async () => {
    const { P, mem } = puertosDePrueba()
    const r = await abrirRevision(P, sobre('estrategia', { payload: { chequeos_previos: { pasaron: false, necesita_humano: true, marcas: ['S03'] } } }))
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('chequeos_detienen')
    expect(mem.revisiones.size).toBe(0)
  })
  it('el manual no tiene revisor de fondo: no abre (no-circularidad)', async () => {
    const { P } = puertosDePrueba({ almacen: almacenEnMemoria({ config: { estado: 'ensayo', tipos_activos: ['manual'], clientes_ensayo: ['cliente-prueba'] } }) })
    const r = await abrirRevision(P, sobre('manual'))
    expect(r.status).toBe(422)
    expect(r.cuerpo.error).toBe('politica_invalida')
  })
  it('un tipo sin renglón = 404; sin presupuesto del padre = 409', async () => {
    const { P } = puertosDePrueba({ almacen: almacenEnMemoria({ filas: {} }) })
    expect((await abrirRevision(P, sobre('pieza'))).status).toBe(404)
    const { P: P2 } = puertosDePrueba()
    expect((await abrirRevision(P2, sobre('pieza', { payload: { tope_restante_usd: 0 } }))).cuerpo).toMatchObject({ motivo: 'sin_presupuesto' })
  })
  it('el tope efectivo es el menor entre el de la política, el que le queda al padre y 10', async () => {
    const { P, mem } = puertosDePrueba()
    await abrirRevision(P, sobre('pieza', { payload: { tope_restante_usd: 0.4 } }))
    expect([...mem.revisiones.values()][0].tope_usd).toBe(0.4)
    const { P: P2, mem: m2 } = puertosDePrueba()
    await abrirRevision(P2, sobre('pieza', { payload: { tope_restante_usd: 99 } }))
    expect([...m2.revisiones.values()][0].tope_usd).toBe(1.5)
  })
  it('abrir dos veces la misma revisión devuelve la existente (idempotente), no abre otra', async () => {
    const { P, mem } = puertosDePrueba()
    await abrirRevision(P, sobre('brief', { id: 'brief-9' }))
    const r2 = await abrirRevision(P, sobre('brief', { id: 'brief-9' }))
    expect(r2.cuerpo.accion).toBe('ya_existia')
    expect(mem.revisiones.size).toBe(1)
  })
})

describe('pieza · el orden firmado: jefe → corrige el dueño → GPT ciego → decide el dueño → cierre', () => {
  it('sin fichas, GPT con opinión y los dueños la toman: recorre fondo → segunda mirada → decisiones y cierra LIMPIA (el desacuerdo solo viene de lo de fondo)', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza'))
    expect(pasosDe(c)).toEqual(['revision_fondo', 'decision:content-creator', 'decision:marketing_instagram_curator'])
    expect(c.final.cuerpo.resultado).toBe('limpia')
    expect(rastro.avisos).toHaveLength(0)
    expect(sal(c).simulado).toBe(true)
    expect(rastro.llamadasAlRevisor).toHaveLength(0) // en seco NUNCA se llama al proveedor
  })
  it('regla 7: sin ficha que bloquea NO hay turno de corrección', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'sugerencia' } }))
    expect(pasosDe(c).some((p) => p.startsWith('correccion:'))).toBe(false)
  })
  it('con ficha que bloquea en «texto»: corrige SOLO el dueño del texto y GPT ve la pieza CORREGIDA', async () => {
    const { P, rastro } = puertosDePrueba()
    // modo real (no seco) para que GPT llame al puerto y quede su pedido
    const c = await correr(P, sobre('pieza', { dry_run: false }), (t) => {
      if (t.paso === 'revision_fondo') return { texto: JSON.stringify({ fichas: [{ que: 'el pie promete un descuento que no existe', donde: 'texto', contra_que: 'el brief', gravedad: 'bloquea', propuesta: 'quitar el descuento' }] }) }
      if (t.paso === 'correccion:content-creator') {
        const id = /^- \[([^\]\n]+)\]/m.exec(String(t.pedido.task))![1]
        return { texto: JSON.stringify({ respuestas: [{ id, estado: 'tomada', razon: 'ok' }], pieza: { pie_de_foto: 'PIE CORREGIDO SIN DESCUENTO', hashtags: ['#a'] } }), costo_usd: 0.07 }
      }
      return { texto: JSON.stringify({ respuestas: [...String(t.pedido.task).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => ({ id: m[1], estado: 'no_tomada', razon: 'no aplica' })) }), costo_usd: 0.07 }
    })
    expect(pasosDe(c)).toEqual(['revision_fondo', 'correccion:content-creator', 'decision:content-creator', 'decision:marketing_instagram_curator'])
    expect(rastro.llamadasAlRevisor).toHaveLength(1)
    const ciego = rastro.llamadasAlRevisor[0].texto
    expect(ciego).toContain('PIE CORREGIDO SIN DESCUENTO')
    expect(ciego).not.toContain('Pie de foto original')
    // CIEGO: nada del hilo ni de las fichas del jefe
    for (const prohibido of ['el pie promete un descuento que no existe', 'quitar el descuento', 'jefe-marketing', 'bloquea', 'fichas']) expect(ciego).not.toContain(prohibido)
    expect(ciego).toContain('Tono cercano. Tuteo.')
    expect(c.final.cuerpo.resultado).toBe('limpia')
  })
  it('el jefe recibe los documentos «contra qué» (el manual) del contexto y la línea de contexto de su tipo', async () => {
    const { P } = puertosDePrueba()
    const a = await abrirRevision(P, sobre('plan'))
    const task = String((a.cuerpo.turno as { pedido: { task: string } }).pedido.task)
    expect(task).toContain('## Documentos')
    expect(task).toContain('Tono cercano. Tuteo.')
    expect(task).toContain('Estás revisando el plan de 90 días contra manual de marca vigente')
  })
  it('el revisor real recibe el contexto para el libro de invocaciones (revisión, número de paso y cliente): así el gasto de GPT se ve en el libro central (condición 5)', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), (t) => (t.paso === 'revision_fondo' ? { texto: '{"fichas":[]}' } : { texto: '{"respuestas":[]}' }))
    expect(rastro.llamadasAlRevisor).toHaveLength(1)
    const id = String(c.aperturas[0].cuerpo.revision_id)
    expect(rastro.llamadasAlRevisor[0].contexto).toEqual({ revision_id: id, n: 2, client_id: 'cliente-prueba' })
  })
  it('regla 2: la corrección de fondo NO tomada = con_desacuerdo; sin otra vuelta (un solo turno de corrección) y UN solo aviso', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', toma: 'nada' } }))
    expect(c.final.cuerpo.resultado).toBe('con_desacuerdo')
    expect(pasosDe(c).filter((p) => p === 'correccion:content-creator')).toHaveLength(1)
    expect(sal(c).desacuerdos.length).toBe(1)
    expect(rastro.avisos).toHaveLength(1)
  })
  it('regla 3: un hallazgo de GPT NO tomado lleva su razón y NO es desacuerdo', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'ninguna', toma: 'nada' } }))
    expect(c.final.cuerpo.resultado).toBe('limpia')
    const noTomadas = sal(c).respuestas.filter((x: any) => x.origen === 'externa' && x.estado === 'no_tomada')
    expect(noTomadas.length).toBeGreaterThan(0)
    expect(noTomadas.every((x: any) => x.razon)).toBe(true)
  })
  it('la opinión de GPT llega a TODOS los que hicieron algo (una ficha por parte) y se guarda como OPINIÓN', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza'))
    const ext = sal(c).respuestas.filter((x: any) => x.origen === 'externa')
    expect(ext.map((x: any) => x.donde).sort()).toEqual(['imagen', 'texto'])
    expect(sal(c).opinion_externa.texto).toMatch(/simulado/)
  })
  it('quien dirige la imagen toma la opinión: la jefatura devuelve «imagen por rehacer» como dato (la oficina hace la única re-imagen)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { toma: 'todo' } }))
    expect(sal(c).imagen_por_rehacer).toBe(true)
  })
  it('regla 4: GPT sin respuesta tras los reintentos ⇒ sin_segunda_mirada + UN aviso; no frena y no hay decisión', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { gpt: 'falla_red' } }))
    expect(c.final.cuerpo.resultado).toBe('sin_segunda_mirada')
    expect(sal(c).marcas).toEqual({ con_desacuerdo: false, sin_segunda_mirada: true })
    expect(pasosDe(c)).toEqual(['revision_fondo'])
    expect(rastro.avisos).toHaveLength(1)
    expect(rastro.avisos[0]).toMatch(/Sin segunda mirada/)
  })
  it('un 401 (llave o modelo equivocados) tampoco bloquea: sin_segunda_mirada', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { gpt: 'falla_401' } }))
    expect(c.final.cuerpo.resultado).toBe('sin_segunda_mirada')
  })
  it('las dos marcas pueden venir juntas: con desacuerdo Y sin segunda mirada (resultado: con_desacuerdo; un solo aviso)', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', toma: 'nada', gpt: 'falla_red' } }))
    expect(sal(c).marcas).toEqual({ con_desacuerdo: true, sin_segunda_mirada: true })
    expect(c.final.cuerpo.resultado).toBe('con_desacuerdo')
    expect(rastro.avisos).toHaveLength(1)
  })
  it('GPT con respuesta vacía no es «sin segunda mirada» (contestó) y no hay decisión', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { gpt: 'vacio' } }))
    expect(c.final.cuerpo.resultado).toBe('limpia')
    expect(pasosDe(c)).toEqual(['revision_fondo'])
  })
  it('una ficha del jefe sobre una parte sin dueño queda declarada sin tomar ⇒ con_desacuerdo (nunca se pierde)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), (t) => (t.paso === 'revision_fondo' ? { texto: JSON.stringify({ fichas: [{ que: 'el formato no cumple', donde: 'formato', contra_que: 'la red', gravedad: 'bloquea', propuesta: 'ajustar' }] }) } : { texto: JSON.stringify({ respuestas: [] }) }))
    expect(c.final.cuerpo.resultado).toBe('con_desacuerdo')
    expect(sal(c).desacuerdos[0]).toMatch(/formato/)
  })
})

describe('brief = solo marca (F17)', () => {
  it('con ficha que bloquea: sin corrección ni decisión; con_desacuerdo y UN aviso; las fichas se guardan', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('brief', { simulacion: { fichas: 'bloquea' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo'])
    expect(c.final.cuerpo.resultado).toBe('con_desacuerdo')
    expect(rastro.avisos).toHaveLength(1)
    expect(sal(c).respuestas.some((x: any) => x.origen === 'jefe' && x.estado === 'abierta')).toBe(true)
  })
  it('sin fichas: limpia y sin avisos; un parte entero es UNA revisión', async () => {
    const { P, rastro, mem } = puertosDePrueba()
    const c = await correr(P, sobre('brief'))
    expect(c.final.cuerpo.resultado).toBe('limpia')
    expect(rastro.avisos).toHaveLength(0)
    expect(mem.revisiones.size).toBe(1)
  })
})

describe('plan (F16 + F20): A → B (corrección) → C (decisión), sin otra vuelta', () => {
  it('bloquea + GPT con opinión + toma algo: fondo → corrección (B) → GPT sobre B → decisión (C); 3 versiones con su texto', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'algo' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo', 'correccion:campaign-brief-agent', 'decision:campaign-brief-agent'])
    const s = sal(c)
    expect(s.versiones.map((v: any) => v.etiqueta)).toEqual(['A', 'B', 'C'])
    expect(s.versiones[1].texto).toContain('versión corregida')
    expect(s.versiones[2].texto).toContain('versión final')
    expect(s.versiones[0].texto).toBe(TEXTO_DEL_PLAN)
    expect(s.resultado).toBe('limpia')
  })
  it('sin ficha que bloquea pero GPT deja texto y el redactor toma algo: no hay B, hay C directo desde A', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'ninguna', toma: 'algo' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo', 'decision:campaign-brief-agent'])
    expect(sal(c).versiones.map((v: any) => v.etiqueta)).toEqual(['A', 'B'])
  })
  it('«toma nada»: la decisión corre CORTA (solo el bloque, sin texto del plan) y no hay versión nueva', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'ninguna', toma: 'nada' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo', 'decision:campaign-brief-agent'])
    expect(sal(c).versiones).toHaveLength(1)
    expect(sal(c).resultado).toBe('limpia')
  })
  it('«GPT sin hallazgos»: no hay decisión', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'ninguna', gpt: 'sin_hallazgos' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo'])
  })
  it('bloquea + GPT sin hallazgos: solo B (corrección), sin decisión', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea', gpt: 'vacio' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo', 'correccion:campaign-brief-agent'])
    expect(sal(c).versiones.map((v: any) => v.etiqueta)).toEqual(['A', 'B'])
  })
  it('bloquea y el redactor NO la toma: con_desacuerdo, el plan A sigue (sin versión nueva)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'nada', gpt: 'vacio' } }))
    expect(c.final.cuerpo.resultado).toBe('con_desacuerdo')
    expect(sal(c).versiones).toHaveLength(1)
  })
  it('a la corrección le llega el PEDIDO ORIGINAL, el plan A, SOLO las fichas que bloquean y las tres líneas (sin ficha de sugerencia ni opinión de GPT)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan'), (t) => {
      if (t.paso === 'revision_fondo') return { texto: JSON.stringify({ fichas: [{ que: 'FICHA GRAVE', donde: 'sección 4', contra_que: 'el manual', gravedad: 'bloquea', propuesta: 'ajustar la oferta' }, { que: 'FICHA SUGERENCIA', donde: 'sección 2', contra_que: 'el manual', gravedad: 'sugerencia', propuesta: 'matiz' }] }) }
      return undefined
    })
    const corr = c.turnos.find((t) => t.paso === 'correccion:campaign-brief-agent')!
    const task = String(corr.pedido.task)
    expect(task).toContain('PEDIDO ORIGINAL DEL PLAN')
    expect(task).toContain('## El plan actual (A)')
    expect(task).toContain('FICHA GRAVE')
    expect(task).not.toContain('FICHA SUGERENCIA')
    expect(task).toContain('Escribe la versión nueva COMPLETA del plan.')
    expect(task).toContain('No inventes cifras')
    expect(task).toContain('<<<RESOLUCION>>>')
  })
  it('a la decisión le llegan el plan vigente, la opinión de GPT y la instrucción de decidir (una versión final como máximo)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'algo' } }))
    const dec = c.turnos.find((t) => t.paso === 'decision:campaign-brief-agent')!
    const task = String(dec.pedido.task)
    expect(task).toContain('## El plan vigente (B)')
    expect(task).toContain('La opinión de un revisor externo')
    expect(task).toContain('es la última, no habrá otra revisión')
    expect(task).not.toMatch(/FICHA|hallazgo de fondo/)
  })
  it('nunca vuelve a `jefe-marketing` ni a GPT: aunque haya B y C, `revision_fondo` y `segunda_mirada` corren UNA vez', async () => {
    const { P, mem } = puertosDePrueba()
    await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea', toma: 'algo' } }))
    const pasos = [...mem.pasos.values()][0].map((p) => p.paso)
    expect(pasos.filter((p) => p === 'revision_fondo')).toHaveLength(1)
    expect(pasos.filter((p) => p === 'segunda_mirada')).toHaveLength(1)
  })
  it('una versión dicha «tomada» sin texto, o texto sin nada tomado, se pide de nuevo UNA vez y si no, falla visible', async () => {
    const { P } = puertosDePrueba()
    const plan = TEXTO_DEL_PLAN
    const bloque = (estado: string, id: string) => `\n<<<RESOLUCION>>>\n{"respuestas":[{"id":"${id}","estado":"${estado}","razon":"x"}]}\n<<<FIN_RESOLUCION>>>`
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'bloquea' } }), (t) => {
      if (t.paso !== 'correccion:campaign-brief-agent') return undefined
      const id = /^- \[([^\]\n]+)\]/m.exec(String(t.pedido.task))![1]
      return { texto: bloque('tomada', id) } // dice que tomó la ficha pero no entrega el plan (las dos veces)
    })
    expect(c.final.cuerpo.resultado).toBe('fallida')
    expect(c.turnos.filter((t) => t.paso === 'correccion:campaign-brief-agent')).toHaveLength(2)
    void plan
  })
})

describe('plan · coherencia entre lo que se toma y lo que se entrega (en la corrección Y en la decisión)', () => {
  const bloque = (estado: 'tomada' | 'no_tomada', id: string) => `<<<RESOLUCION>>>\n{"respuestas":[{"id":"${id}","estado":"${estado}","razon":"x"}]}\n<<<FIN_RESOLUCION>>>`
  const ids = (t: { pedido: Record<string, unknown> }) => [...String(t.pedido.task).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => m[1])
  const conRespuesta = (paso: string, hacer: (id: string) => string) => async (sim: Record<string, unknown>) => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: sim }), (t) => (t.paso === paso ? { texto: hacer(ids(t)[0]) } : undefined))
    return c
  }
  it('decisión: «tomé algo» sin entregar la versión final → se pide de nuevo UNA vez; si repite, FALLIDA', async () => {
    const c = await conRespuesta('decision:campaign-brief-agent', (id) => bloque('tomada', id))({ fichas: 'ninguna' })
    expect(c.final.cuerpo.resultado).toBe('fallida')
    expect(c.turnos.filter((t) => t.paso === 'decision:campaign-brief-agent')).toHaveLength(2)
    expect(String(c.turnos[c.turnos.length - 1].pedido.task)).toMatch(/Dijiste que tomaste algo de la opinión pero no entregaste la versión final/)
  })
  it('decisión: entregó una versión pero no tomó nada → se pide de nuevo; si repite, FALLIDA', async () => {
    const c = await conRespuesta('decision:campaign-brief-agent', (id) => `${TEXTO_DEL_PLAN}\n${bloque('no_tomada', id)}`)({ fichas: 'ninguna' })
    expect(c.final.cuerpo.resultado).toBe('fallida')
    expect(String(c.turnos[c.turnos.length - 1].pedido.task)).toMatch(/Entregaste una versión del plan pero no tomaste nada/)
  })
  it('corrección: entregó una versión nueva pero no tomó ninguna ficha → se pide de nuevo; si repite, FALLIDA', async () => {
    const c = await conRespuesta('correccion:campaign-brief-agent', (id) => `${TEXTO_DEL_PLAN}\n${bloque('no_tomada', id)}`)({ fichas: 'bloquea' })
    expect(c.final.cuerpo.resultado).toBe('fallida')
    expect(String(c.turnos[c.turnos.length - 1].pedido.task)).toMatch(/no tomaste ninguna ficha/)
  })
  it('si la segunda respuesta ya es coherente, el reintento sale bien y el plan sigue', async () => {
    let intento = 0
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: { fichas: 'ninguna' } }), (t) => {
      if (t.paso !== 'decision:campaign-brief-agent') return undefined
      const id = ids(t)[0]
      return { texto: ++intento === 1 ? bloque('tomada', id) : `${TEXTO_DEL_PLAN} + final\n${bloque('tomada', id)}` }
    })
    expect(c.final.cuerpo.resultado).toBe('limpia')
    expect(sal(c).versiones.map((v: any) => v.etiqueta)).toEqual(['A', 'B'])
  })
})

describe('estrategia y calendario: re-entrega completa / parcial, después del validador', () => {
  it('estrategia: la corrección devuelve el OBJETO ENTERO y reemplaza al anterior', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('estrategia', { texto: JSON.stringify({ pilares: ['a', 'b'] }), simulacion: { fichas: 'bloquea', toma: 'todo', gpt: 'vacio' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo', 'correccion:social-media-strategist'])
    expect(sal(c).artefacto_final.objeto).toMatchObject({ pilares: ['a', 'b'], simulado: true })
  })
  it('calendario: la corrección devuelve SOLO las filas que cambia y se funden por `fila_id`', async () => {
    const { P } = puertosDePrueba()
    const filas = [{ fila_id: 'f1', tema: 'viejo' }, { fila_id: 'f2', tema: 'igual' }]
    const c = await correr(P, sobre('calendario', { texto: JSON.stringify(filas), simulacion: { fichas: 'bloquea', toma: 'todo', gpt: 'vacio' } }))
    const f = sal(c).artefacto_final.filas as Array<Record<string, unknown>>
    expect(f).toEqual([{ fila_id: 'f1', tema: '(simulado) fila corregida' }, { fila_id: 'f2', tema: 'igual' }])
  })
})

describe('regla 5, 6 y topes: formato roto, productor muerto, cierre por tope', () => {
  it('regla 5: formato roto → UN reintento con el error literal → si vuelve a fallar, FALLIDA (nunca relleno) y aviso', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', productor: 'formato_roto_siempre' } }))
    // el jefe responde bien; el productor responde roto dos veces
    expect(c.final.cuerpo.resultado).toBe('fallida')
    expect(c.turnos.filter((t) => t.paso === 'correccion:content-creator')).toHaveLength(2)
    expect(String(c.turnos[2].pedido.task)).toMatch(/no cumple el formato/)
    expect(c.turnos[2].pedido.reintento_formato).toBe(true)
    expect(c.turnos[1].pedido.reintento_formato).toBeUndefined()
    expect(rastro.avisos).toHaveLength(1)
  })
  it('`formato_roto` rompe SOLO el primer intento: el reintento sale bien y la revisión sigue (no es fallida)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', productor: 'formato_roto' } }))
    expect(c.final.cuerpo.resultado).not.toBe('fallida')
    expect(c.turnos.filter((t) => t.paso === 'correccion:content-creator')).toHaveLength(2)
  })
  it('regla 6: un productor que murió (error del turno) cierra FALLIDA con aviso', async () => {
    const { P, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', productor: 'muerto' } }))
    expect(c.final.cuerpo.resultado).toBe('fallida')
    expect(rastro.avisos).toHaveLength(1)
  })
  it('tope: antes de un paso, gasto + tope del paso > tope ⇒ cerrada_por_tope (incompleta_por_tope) + aviso; el artefacto sigue marcado', async () => {
    const { P, mem, rastro } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { tope: 'exceso', fichas: 'bloquea' } }))
    expect(c.final.cuerpo.resultado).toBe('incompleta_por_tope')
    expect([...mem.revisiones.values()][0].estado).toBe('cerrada_por_tope')
    expect(rastro.avisos).toHaveLength(1)
  })
  it('el gasto real de los turnos se suma y frena: con costos altos el siguiente paso no arranca', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('brief', { dry_run: false, payload: { tope_restante_usd: 0.6 } }), (t) => (t.paso === 'revision_fondo' ? { texto: '{"fichas":[]}', costo_usd: 0.3 } : undefined))
    // 0,3 gastados + 0,5 de GPT > 0,6 ⇒ cierra por tope antes de la segunda mirada
    expect(c.final.cuerpo.resultado).toBe('incompleta_por_tope')
  })
  it('simulacion.reentrega = ninguna fuerza el camino «solo marca» aunque el tipo tenga re-entrega', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', reentrega: 'ninguna' } }))
    expect(pasosDe(c)).toEqual(['revision_fondo'])
    expect(c.final.cuerpo.resultado).toBe('con_desacuerdo')
  })
})

describe('un siguiente repetido, respuestas repetidas y el vigía', () => {
  it('un «siguiente» repetido ENTREGA DE NUEVO el mismo pedido (mismo número y misma dispatch_key): no abre otro turno de pago', async () => {
    const { P, mem } = puertosDePrueba()
    const a = await abrirRevision(P, sobre('pieza'))
    const t1 = a.cuerpo.turno as { n: number; dispatch_key: string }
    const b = await avanzar(P, String(a.cuerpo.revision_id))
    expect(b.cuerpo.reentrega).toBe(true)
    expect((b.cuerpo.turno as { n: number; dispatch_key: string }).dispatch_key).toBe(t1.dispatch_key)
    expect([...mem.pasos.values()][0]).toHaveLength(1)
  })
  it('una respuesta repetida (ya registrada) no se cuenta dos veces', async () => {
    const { P, mem } = puertosDePrueba()
    const a = await abrirRevision(P, sobre('brief'))
    const id = String(a.cuerpo.revision_id)
    const t = a.cuerpo.turno as { n: number; pedido: { molde: { texto: string } } }
    await recibirResultado(P, id, t.n, { texto: t.pedido.molde.texto, costo_usd: 0.1 })
    const gasto = [...mem.revisiones.values()][0].gasto_usd
    const repetida = await recibirResultado(P, id, t.n, { texto: t.pedido.molde.texto, costo_usd: 0.1 })
    // una respuesta repetida (un reintento legítimo del flujo) NO es un error: avanza de nuevo (200), no devuelve 409
    expect(repetida.status).toBe(200)
    expect(['esperar', 'cerrado']).toContain(repetida.cuerpo.accion)
    expect([...mem.revisiones.values()][0].gasto_usd).toBe(gasto)
  })
  it('un turno que no es el esperado = 409', async () => {
    const { P } = puertosDePrueba()
    const a = await abrirRevision(P, sobre('brief'))
    const r = await recibirResultado(P, String(a.cuerpo.revision_id), 99, { texto: '{}' })
    expect(r.status).toBe(409)
  })
  it('vigía: un paso sin vuelta se marca muerto y se reintenta UNA vez; si vuelve a morir, fallida + aviso', async () => {
    const { P, mem, rastro } = puertosDePrueba()
    const a = await abrirRevision(P, sobre('brief'))
    const id = String(a.cuerpo.revision_id)
    const v1 = await vigiar(P, P.ahora())
    expect(v1.reanudar).toEqual([id])
    // se reanuda: el mismo paso, mismo número (la fila se reemplaza)
    const b = await avanzar(P, id)
    expect(b.cuerpo.accion).toBe('esperar')
    const v2 = await vigiar(P, P.ahora())
    expect(v2.fallidos).toEqual([id])
    expect([...mem.revisiones.values()][0].estado).toBe('fallida')
    expect(rastro.avisos).toHaveLength(1)
  })
})

describe('la regla dura del editor y la traza M1', () => {
  it('TODO pedido entregado pasa la auditoría: cabecera x-skip-editor-middleware: 1, force_restart, sin extra.workflow_execution_id', async () => {
    const { P } = puertosDePrueba()
    for (const tipo of ['plan', 'estrategia', 'calendario', 'brief', 'pieza'] as const) {
      const c = await correr(P, sobre(tipo, { id: `${tipo}-auditoria`, simulacion: { fichas: 'bloquea', toma: 'algo' } }))
      expect(c.turnos.length).toBeGreaterThan(0)
      for (const t of c.turnos) {
        expect(auditarPedidoDeAgente(t.pedido), `${tipo} ${t.paso}`).toEqual([])
        expect((t.pedido.headers_requeridos as Record<string, string>)['x-skip-editor-middleware']).toBe('1')
        expect(Object.keys(t.pedido.extra as object).sort()).toEqual(['dispatch_key', 'indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id'])
        expect(t.pedido.force_restart).toBe(true)
        expect(t.pedido.callback_mode).toBe('runner')
        expect(t.pedido.workflow_hint).toBe('jefatura · turno')
      }
    }
  })
  it('cada paso deja su traza M1 (namespace jefatura: role, review_id, nominal_agent, contra_que_ref, cycle 0) y GPT su costo en el libro propio', async () => {
    const { P, mem } = puertosDePrueba()
    await correr(P, sobre('pieza', { dry_run: false }), (t) => (t.paso === 'revision_fondo' ? { texto: '{"fichas":[]}', costo_usd: 0.06 } : { texto: '{"respuestas":[]}', costo_usd: 0.05 }))
    const pasos = [...mem.pasos.values()][0]
    const gpt = pasos.find((p) => p.paso === 'segunda_mirada')!
    expect(gpt.concepto).toBe('revisor_externo')
    expect(gpt.cost_usd).toBe(0.04)
    const jefe = pasos.find((p) => p.paso === 'revision_fondo')!
    const j = (jefe.traza as { jefatura: Record<string, unknown> }).jefatura
    expect(j).toMatchObject({ role: 'fondo', cycle: 0, nominal_agent: 'jefe-marketing', artifact_type: 'pieza' })
    expect(j.contra_que_ref).toEqual(['manual', 'plan', 'brief', 'material_portero', 'visual_direction'])
    expect((gpt.traza as { jefatura: Record<string, unknown> }).jefatura).toMatchObject({ role: 'ciego', effective_model: 'gpt-prueba' })
  })
})

describe('plan · elegir la mejor versión aceptable (la planeación mide con sus chequeos de código)', () => {
  const abrirYCerrarPlan = async (sim: Record<string, unknown>) => {
    const { P, mem } = puertosDePrueba()
    const c = await correr(P, sobre('plan', { simulacion: sim }))
    return { P, mem, id: String(c.aperturas[0].cuerpo.revision_id), c }
  }
  const ev = (a: [number, number], b?: [number, number], c?: [number, number]) => [{ etiqueta: 'A' as const, marcas: a[0], largo: a[1] }, ...(b ? [{ etiqueta: 'B' as const, marcas: b[0], largo: b[1] }] : []), ...(c ? [{ etiqueta: 'C' as const, marcas: c[0], largo: c[1] }] : [])]
  it('B mejora y C empeora ⇒ se adopta B; resultado con_desacuerdo; C solo en la traza', async () => {
    const { P, id } = await abrirYCerrarPlan({ fichas: 'bloquea', toma: 'algo' })
    const r = await elegirVersion(P, id, { evaluaciones: ev([2, 30000], [1, 30500], [3, 31000]), idDeA: 'A-id', existentes: [] })
    expect(r.cuerpo).toMatchObject({ adoptada: 'B', ultima: 'C', adopto_la_ultima: false, resultado: 'con_desacuerdo' })
    expect((r.cuerpo.plan_de_guardado as any).guardar.map((g: any) => g.etiqueta)).toEqual(['B'])
    expect((r.cuerpo.plan_de_guardado as any).solo_en_la_traza).toEqual(['C'])
  })
  it('C pasa contra A pero es peor que B ⇒ se adopta B', async () => {
    const { P, id } = await abrirYCerrarPlan({ fichas: 'bloquea', toma: 'algo' })
    const r = await elegirVersion(P, id, { evaluaciones: ev([3, 30000], [1, 30500], [2, 31000]), idDeA: 'A-id', existentes: [] })
    expect(r.cuerpo).toMatchObject({ adoptada: 'B', resultado: 'con_desacuerdo' })
  })
  it('todas pasan ⇒ se adopta C y el resultado no cambia', async () => {
    const { P, id } = await abrirYCerrarPlan({ fichas: 'bloquea', toma: 'algo' })
    const r = await elegirVersion(P, id, { evaluaciones: ev([2, 30000], [1, 30500], [1, 31000]), idDeA: 'A-id', existentes: [] })
    expect(r.cuerpo).toMatchObject({ adoptada: 'C', adopto_la_ultima: true, resultado: 'limpia' })
    expect((r.cuerpo.plan_de_guardado as any).guardar.map((g: any) => [g.etiqueta, g.version, g.version_de])).toEqual([['B', 2, 'A'], ['C', 3, 'B']])
  })
  it('las evaluaciones deben coincidir con las versiones producidas; solo existe para el plan y con la revisión cerrada', async () => {
    const { P, id } = await abrirYCerrarPlan({ fichas: 'bloquea', toma: 'algo' })
    expect((await elegirVersion(P, id, { evaluaciones: ev([1, 30000]), idDeA: 'A', existentes: [] })).status).toBe(400)
    const pieza = puertosDePrueba()
    const a = await abrirRevision(pieza.P, sobre('pieza'))
    expect((await elegirVersion(pieza.P, String(a.cuerpo.revision_id), { evaluaciones: ev([1, 1]), idDeA: 'A', existentes: [] })).status).toBe(409)
    const plan = puertosDePrueba()
    const ab = await abrirRevision(plan.P, sobre('plan'))
    expect((await elegirVersion(plan.P, String(ab.cuerpo.revision_id), { evaluaciones: ev([1, 1]), idDeA: 'A', existentes: [] })).cuerpo.error).toBe('revision_sin_cerrar')
  })
  it('reejecutar: si la hija de A ya existe se REUTILIZA (no se inserta otra, G4)', async () => {
    const { P, id } = await abrirYCerrarPlan({ fichas: 'bloquea', gpt: 'vacio' })
    const r = await elegirVersion(P, id, { evaluaciones: ev([2, 30000], [1, 30500]), idDeA: 'A-id', existentes: [{ id: 'B-ya', version_de: 'A-id' }] })
    expect((r.cuerpo.plan_de_guardado as any).guardar[0]).toMatchObject({ etiqueta: 'B', reutilizar_id: 'B-ya' })
  })
})

describe('política inválida y plantilla', () => {
  it('una política con re-entrega y sin productores no sirve', () => {
    expect(() => politica('pieza', { productores: [] })).toThrow(/al menos un productor/)
  })
})
