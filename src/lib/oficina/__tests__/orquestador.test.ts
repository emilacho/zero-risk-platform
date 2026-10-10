import { describe, it, expect } from 'vitest'
import { abrirEncargo, avanzar, recibirResultado } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PARTE_OTRO_PRODUCTO, PARTE_REAL, PIEZA_OK, FICHAS_VACIAS, crearMemoria, correr, direccionGenerada, direccionReal, observacion, REGLAS_CEVICHE, type Guion, type Memoria } from './memoria'

const sobre = (o: Record<string, unknown> = {}) => ({ parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img', ...o })
const abrir = (M: Memoria, cuerpo: unknown = sobre(), extra: Record<string, unknown> = {}) => abrirEncargo(M.P, { cuerpo, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR, ...extra })
const indicesDe = (tarea: string) => [...tarea.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const idsDe = (tarea: string, pref: string) => [...tarea.matchAll(new RegExp(`\\[(${pref}-[^\\]]+)\\]`, 'g'))].map((x) => x[1])

const guionGenerada = (o: { mirar?: Guion[string]; texto?: string; jefe?: Guion[string]; corrige?: Guion[string]; decide?: Guion[string]; prompts?: string } = {}): Guion => ({
  paquete: () => ({ texto: 'material del portero: fotos etiquetadas, sedes, manual vigente' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: o.prompts ?? BUENOS_PROMPTS }),
  mirar: o.mirar ?? ((_n, t) => ({ texto: observacion(indicesDe(t)) })),
  texto: () => ({ texto: o.texto ?? PIEZA_OK }),
  revision_jefe: o.jefe ?? (() => ({ texto: FICHAS_VACIAS })),
  corrige: o.corrige ?? (() => ({ texto: '{"respuestas": []}' })),
  decide: o.decide ?? (() => ({ texto: '{"respuestas": []}' })),
})

async function abierto(M: Memoria, cuerpo: unknown = sobre()) {
  const a = await abrir(M, cuerpo)
  expect(a.status).toBe(200)
  return String(a.cuerpo.encargo_id)
}

describe('la puerta de la oficina: apagada, pasarela y entrada válida', () => {
  it('la oficina APAGADA no abre nada (409) y dice que el sobre sigue por la pieza simple', async () => {
    const M = crearMemoria({ config: { estado: 'apagada', familias_activas: [] } })
    const r = await abrir(M)
    expect(r.status).toBe(409); expect(r.cuerpo.motivo).toBe('oficina_apagada')
    expect(M.encargos.size).toBe(0)
  })
  it('sin familia ⇒ pasarela (409, no abre)', async () => {
    const M = crearMemoria()
    const r = await abrir(M, { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true })
    expect(r.status).toBe(409); expect(r.cuerpo.motivo).toBe('sin_familia')
  })
  it('familia no activa ⇒ pasarela', async () => {
    const M = crearMemoria({ config: { familias_activas: ['otra'] } })
    expect((await abrir(M)).cuerpo.motivo).toBe('familia_no_activa')
  })
  it('dry_run ausente ⇒ 400 ANTES de gastar nada', async () => {
    const M = crearMemoria()
    const r = await abrir(M, { parte_id: PARTE, brief_id: 'BRF-0003', familia: 'post_img' })
    expect(r.status).toBe(400); expect(r.cuerpo.error).toBe('dry_run_ausente')
    expect(M.encargos.size + M.llamadas.imagen + M.llamadas.revisor).toBe(0)
  })
  it('un origen que no es `producir` se rechaza', async () => {
    const M = crearMemoria()
    const r = await abrirEncargo(M.P, { cuerpo: sobre(), client_id: CLIENTE, target_step_id: 'router.dispatch.otro.otro' })
    expect(r.status).toBe(400)
  })
  it('el client_id que venga dentro del payload se ignora (y se anota)', async () => {
    const M = crearMemoria()
    const r = await abrir(M, sobre({ client_id: 'otro-cliente' }))
    expect(r.cuerpo.ignorados).toEqual(['client_id'])
    expect([...M.encargos.values()][0].client_id).toBe(CLIENTE)
  })
  it('es IDEMPOTENTE: el mismo pedido no abre dos encargos', async () => {
    const M = crearMemoria()
    const a = await abrir(M); const b = await abrir(M)
    expect(M.encargos.size).toBe(1); expect(b.cuerpo.accion).toBe('ya_existia'); expect(b.cuerpo.encargo_id).toBe(a.cuerpo.encargo_id)
  })
  it('una plantilla INACTIVA no abre', async () => {
    const M = crearMemoria(); M.plantilla!.activo = false
    expect((await abrir(M)).cuerpo.error).toBe('plantilla_inactiva')
  })
})

describe('rama FOTO GENERADA · punta a punta con modelo simulado (dry_run)', () => {
  it('recorre el camino firmado y cierra sin llamar a ningún proveedor ni escribir salida/bandeja', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima, pasos } = await correr(M, id, guionGenerada())
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'prompts', 'mirar', 'texto', 'revision_jefe'])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: false, simulado: true, resultado_para_la_sala: 'encargo_en_bandeja' })
    expect(M.llamadas.imagenReal).toBe(0); expect(M.llamadas.revisorReal).toBe(0)
    expect(M.llamadas.salida).toBe(0); expect(M.llamadas.bandeja).toHaveLength(0); expect(M.llamadas.guardadoDeArchivos).toBe(0)
    expect(M.llamadas.imagen).toBe(2) // el tercer prompt no cubría lo obligatorio y NO se generó
  })
  it('el prompt que no cubre un obligatorio NO se genera (control ②) y el tamaño que escribió el agente se ignoró', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    await correr(M, id, guionGenerada())
    const e = M.encargos.get(id)!.estado_del_motor
    const pv = e.artefactos['prompts_validos'].datos as { indices: number[]; fallan: Array<{ indice: number; motivos: string[] }> }
    expect(pv.indices).toEqual([0, 1])
    expect(pv.fallan[0]).toMatchObject({ indice: 2 }); expect(pv.fallan[0].motivos.join(' ')).toMatch(/obligatorio/)
    expect(JSON.stringify(e.artefactos['prompts'].datos)).not.toMatch(/tamaño|Feed de Instagram/)
  })
  it('el gasto se suma por paso y las imágenes entran al libro UNA vez cada una', async () => {
    const M = crearMemoria()
    const id = await abierto(M, sobre({ dry_run: false }))
    await correr(M, id, guionGenerada())
    const enc = M.encargos.get(id)!
    expect(enc.gasto_usd).toBeCloseTo(6 * 0.07 + 0.1 + 2 * 0.014, 6) // 6 pasos de empleado + revisor + 2 imágenes
    expect(M.gastos.filter((g) => g.concepto === 'imagen')).toHaveLength(2)
    expect(M.gastos.filter((g) => g.concepto === 'revisor_externo')).toHaveLength(1)
    expect(new Set(M.gastos.filter((g) => g.ref_id).map((g) => `${g.ref_tabla}:${g.ref_id}`)).size).toBe(M.gastos.filter((g) => g.ref_id).length)
  })
  it('cada paso queda en el libro con su dispatch_key único y los artefactos con huella', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    await correr(M, id, guionGenerada())
    const ts = [...M.turnos.get(id)!.values()]
    expect(ts.every((t) => t.estado === 'hecho')).toBe(true)
    const llaves = ts.map((t) => t.dispatch_key).filter(Boolean)
    expect(new Set(llaves).size).toBe(llaves.length)
    expect(M.artefactos.every((a) => /^[0-9a-f]{64}$/.test(a.sha256))).toBe(true)
  })
  it('el pedido de cada empleado lleva el contrato, el brief y el aviso del cerebro; el de la imagen, las URL', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { tareas } = await correr(M, id, guionGenerada())
    expect(tareas['direccion_visual'][0]).toMatch(/cerebro/); expect(tareas['direccion_visual'][0]).toMatch(/BRF-0003/); expect(tareas['direccion_visual'][0]).toMatch(/la sala comprueba que la cita existe/)
    expect(tareas['prompts'][0]).toMatch(/OBLIGATORIO/); expect(tareas['prompts'][0]).toMatch(/no escribas tamaño/)
    expect(tareas['mirar'][0]).toMatch(/índice 0/); expect(tareas['mirar'][0]).toMatch(/DESCRIBES/)
    expect(tareas['texto'][0]).toMatch(/997 744 288/) // datos verificados del cliente
  })
})

describe('el PEDIDO que recibe n8n para cada empleado', () => {
  it('lleva la indicación real de ESE agente, el tope del paso, el razonamiento apagado, el dry_run y el cliente; el curador recibe las URL de las imágenes', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pedidos } = await correr(M, id, guionGenerada())
    const p = pedidos['prompts'][0] as { agent_name: string; extra: { indicacion_oficina: string; paso_de_la_oficina: string; encargo_id: string }; max_budget_usd: number; thinking_mode: string; dry_run: boolean; client_id: string }
    expect(p.agent_name).toBe('design-image-prompt-engineer')
    const lineas = p.extra.indicacion_oficina.split('\n')
    expect(lineas[0]).toBe('Indicación de esta sala (capa local; el texto de tu identidad no cambia):')
    expect(lineas[1]).toMatch(/^1\. Propones 2 o 3 prompts/)
    expect(lineas).toHaveLength(6) // encabezado + las 5 reglas firmadas
    expect(p.extra).toMatchObject({ paso_de_la_oficina: 'prompts', encargo_id: id })
    expect(p).toMatchObject({ max_budget_usd: 0.2, thinking_mode: 'disabled', dry_run: true, client_id: CLIENTE })
    const m = pedidos['mirar'][0] as { agent_name: string; images: Array<{ url: string }> }
    expect(m.agent_name).toBe('marketing_instagram_curator'); expect(m.images.length).toBeGreaterThan(0); expect(m.images[0].url.startsWith('https://dry.test/')).toBe(true)
    expect((pedidos['paquete'][0] as { destino: string; cuerpo: { cliente: string; voy_a_producir: Record<string, unknown> } }).cuerpo).toMatchObject({ cliente: CLIENTE, voy_a_producir: { entregable: 'BRF-0003', red: 'Instagram' } })
  })
})

describe('un «siguiente» repetido no abre otro paso', () => {
  it('con un paso ya esperando, ENTREGA DE NUEVO el mismo pedido (mismo número y misma dispatch_key) y no gasta ni escribe de más', async () => {
    const M = crearMemoria()
    const a = await abrir(M)
    const id = String(a.cuerpo.encargo_id)
    const t1 = a.cuerpo.turno as { n: number; dispatch_key: string; pedido: Record<string, unknown> }
    const filas = M.turnos.get(id)!.size
    const b = await avanzar(M.P, id)
    const t2 = b.cuerpo.turno as { n: number; dispatch_key: string; pedido: Record<string, unknown> }
    expect(b.cuerpo.reentrega).toBe(true)
    expect(t2.n).toBe(t1.n); expect(t2.dispatch_key).toBe(t1.dispatch_key); expect(t2.pedido).toEqual(t1.pedido)
    expect(M.turnos.get(id)!.size).toBe(filas)
  })
})

describe('control ③ · mirar la imagen y regenerar ≤ 2 veces', () => {
  it('si la imagen falla el obligatorio se regenera, y a la 3.ª se descarta: ficha que bloquea y la pieza sigue SIN imagen', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima, pasos } = await correr(M, id, guionGenerada({ mirar: (_n, t) => ({ texto: observacion(indicesDe(t), { falta: 'o1' }) }) }))
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(3) // 1 + 2 regeneraciones
    expect(M.llamadas.imagen).toBe(6)
    const e = M.encargos.get(id)!.estado_del_motor
    expect((e.artefactos['imagen_final'].datos as { origen: string }).origen).toBe('ninguna')
    expect(e.fichas.some((f) => f.donde === 'imagen' && f.gravedad === 'bloquea' && f.estado === 'abierta')).toBe(true)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: true, resultado_para_la_sala: 'con_desacuerdo' })
  })
  it('una regeneración y luego pasa: 4 imágenes, sin desacuerdo', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima, pasos } = await correr(M, id, guionGenerada({ mirar: (n, t) => ({ texto: observacion(indicesDe(t), n === 1 ? { falta: 'o1' } : {}) }) }))
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(2)
    expect(M.llamadas.imagen).toBe(4)
    expect(ultima.cuerpo.con_desacuerdo).toBe(false)
    expect((M.encargos.get(id)!.estado_del_motor.artefactos['imagen_final'].datos as { origen: string }).origen).toBe('generada')
  })
  it('un teléfono AJENO en la imagen hace fallar esa versión (lo decide el código)', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pasos } = await correr(M, id, guionGenerada({ mirar: (n, t) => ({ texto: observacion(indicesDe(t), n === 1 ? { ajeno: 'RUKUTÚ 0997664119 @rukutuio' } : {}) }) }))
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(2)
  })
  it('si ningún prompt pasa el brief, el ingeniero repite UNA vez; sigue sin pasar ⇒ no se gasta en imágenes y la pieza sale sin imagen, declarado', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const malos = JSON.stringify({ prompts: [{ prompt: 'Un ceviche en un bowl de madera.', idea_en_una_linea: 'a' }, { prompt: 'Otro ceviche distinto, en cerámica.', idea_en_una_linea: 'b' }] })
    const { ultima, pasos } = await correr(M, id, guionGenerada({ prompts: malos }))
    expect(pasos.filter((p) => p === 'prompts')).toHaveLength(2)
    expect(pasos).not.toContain('mirar') // se salta solo: no hay imágenes
    expect(M.llamadas.imagen).toBe(0)
    expect(ultima.cuerpo).toMatchObject({ con_desacuerdo: true })
    expect(M.encargos.get(id)!.estado_del_motor.fichas.map((f) => f.id)).toEqual(expect.arrayContaining(['prompts-ninguno', 'mirar-sin-imagen']))
  })
  it('si el generador cae, la pieza no se atasca: ficha y sigue', async () => {
    const M = crearMemoria(); M.imagenFalla = () => true
    const id = await abierto(M)
    const { ultima } = await correr(M, id, guionGenerada())
    expect(ultima.cuerpo.estado).toBe('cerrado'); expect(ultima.cuerpo.con_desacuerdo).toBe(true)
  })
})

describe('rama FOTO REAL', () => {
  const guion = (foto: string): Guion => ({
    paquete: () => ({ texto: 'material' }),
    direccion_visual: () => ({ texto: direccionReal(foto) }),
    mirar: () => ({ texto: JSON.stringify({ imagenes: [{ indice: 0, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 }], preferencia: [0] }) }),
    texto: () => ({ texto: JSON.stringify({ pie_de_foto: 'Encebollado a $5.50. Pídelo por WhatsApp al 0997744288.', hashtags: ['#encebollado'] }) }),
    revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  })
  it('elige una candidata, la mira (confianza media), la entrega y registra el uso de la foto; no genera nada', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    const { ultima, pasos } = await correr(M, id, guion('ef0921ad'))
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'mirar', 'texto', 'revision_jefe'])
    expect(M.llamadas.imagen).toBe(0)
    expect(M.usos).toEqual([{ foto_id: 'ef0921ad', rol: 'pieza' }])
    expect(ultima.cuerpo.con_desacuerdo).toBe(false)
    const fin = M.encargos.get(id)!.estado_del_motor.artefactos['imagen_final'].datos as { origen: string; url: string; nota: string }
    expect(fin).toMatchObject({ origen: 'real', url: 'https://fotos.test/ef0921ad.jpg' }); expect(fin.nota).toMatch(/recortar/)
  })
  it('si el curador elige una foto que NO es candidata, el código manda generar (no confía en el modelo)', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    const g = { ...guion('7a75e500'), prompts: () => ({ texto: BUENOS_PROMPTS }) } as Guion
    const { pasos } = await correr(M, id, { ...g, mirar: (_n, t) => ({ texto: JSON.stringify({ imagenes: indicesDe(t).map((indice) => ({ indice, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 })), preferencia: indicesDe(t) }) }) })
    expect(pasos).toContain('prompts')
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((f) => f.id === 'vd-foto-invalida')).toBe(true)
  })
  it('para el brief de ceviche las 16 fotos reales NO sirven y la sala lo dice con motivo', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    await correr(M, id, guionGenerada())
    const cf = M.encargos.get(id)!.estado_del_motor.artefactos['candidatas_foto'].datos as { candidatas: unknown[]; descartadas: Array<{ id: string; motivos: string[] }>; protagonistas: string[] }
    expect(cf.candidatas).toHaveLength(0); expect(cf.protagonistas).toEqual(['Ceviches'])
    expect(cf.descartadas.find((d) => d.id === '7a75e500')!.motivos.join(' ')).toMatch(/teléfono 997664119/)
  })
})

describe('lo que el código decide aunque el curador diga otra cosa', () => {
  it('«ninguna imagen» sin foto apta ⇒ el código manda generar (el canon: nunca se pide nada al dueño)', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const ninguna = JSON.stringify({ resumen: 'sin imagen', decision: { modo: 'ninguna', motivo: 'no hay foto' }, reglas_de_imagen: REGLAS_CEVICHE })
    const { pasos } = await correr(M, id, { ...guionGenerada(), direccion_visual: () => ({ texto: ninguna }) })
    expect(pasos).toContain('prompts')
    const e = M.encargos.get(id)!.estado_del_motor
    expect(e.fichas.some((f) => f.id === 'vd-ninguna')).toBe(true)
    expect((e.artefactos['visual_direction'].datos.decision as { modo: string }).modo).toBe('generada')
  })
  it('una regla de imagen con cita INVENTADA se descarta y el prompt ya no la ve', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const inventada = { ...REGLAS_CEVICHE, obligatorio: [...REGLAS_CEVICHE.obligatorio, { id: 'o9', texto: 'una flor en el plato', claves: ['flor'], cita: 'El plato lleva una flor de hibisco encima' }] }
    const { tareas } = await correr(M, id, { ...guionGenerada(), direccion_visual: () => ({ texto: direccionGenerada(inventada) }) })
    const e = M.encargos.get(id)!.estado_del_motor
    expect(e.fichas.some((f) => f.id === 'vd-regla-o9')).toBe(true)
    expect((e.artefactos['visual_direction'].datos.reglas_de_imagen as { obligatorio: unknown[] }).obligatorio).toHaveLength(2)
    expect(tareas['prompts'][0]).not.toMatch(/flor/)
  })
})

describe('el contrato de formato en el orquestador', () => {
  it('JSON inválido ⇒ UN reintento con el error literal; si luego cumple, sigue', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima, pasos, tareas } = await correr(M, id, guionGenerada({ prompts: undefined }) && { ...guionGenerada(), prompts: (n) => ({ texto: n === 1 ? 'no soy json' : BUENOS_PROMPTS }) })
    expect(pasos.filter((p) => p === 'prompts')).toHaveLength(2)
    expect(tareas['prompts'][1]).toMatch(/Corrección de formato/)
    expect(ultima.cuerpo.estado).toBe('cerrado')
  })
  it('la cerca ```json se limpia sin reintento', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pasos } = await correr(M, id, { ...guionGenerada(), prompts: () => ({ texto: '```json\n' + BUENOS_PROMPTS + '\n```' }) })
    expect(pasos.filter((p) => p === 'prompts')).toHaveLength(1)
  })
  it('dos fallos de formato ⇒ el encargo cierra FALLIDO y visible (aviso a #alertas), nunca relleno', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima } = await correr(M, id, { ...guionGenerada(), direccion_visual: () => ({ texto: 'basura' }) })
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(M.encargos.get(id)!.estado).toBe('fallido')
    expect(M.llamadas.avisos.some((a) => a.canal === 'alertas' && /fallido/i.test(a.texto))).toBe(true)
  })
  it('un turno que vuelve con error cierra el encargo como fallido', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima } = await correr(M, id, { ...guionGenerada(), texto: () => ({ error: 'timeout' }) })
    expect(ultima.cuerpo.estado).toBe('fallido')
    expect([...M.turnos.get(id)!.values()].some((t) => t.estado === 'fallo')).toBe(true)
  })
  it('una respuesta con el número de turno equivocado se rechaza (409) y una repetida no se cuenta dos veces', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const mal = await recibirResultado(M.P, id, 99, { texto: 'x' })
    expect(mal.status).toBe(409)
    const a = await avanzar(M.P, id) // paquete esperando
    const t = a.cuerpo.turno as { n: number }
    const r1 = await recibirResultado(M.P, id, t.n, { texto: 'material', costo_usd: 0.03 })
    const gasto = M.encargos.get(id)!.gasto_usd
    const r2 = await recibirResultado(M.P, id, t.n, { texto: 'material', costo_usd: 0.03 })
    expect(r1.cuerpo.accion).toBe('esperar'); expect(r2.status).toBe(200)
    expect(M.encargos.get(id)!.gasto_usd).toBe(gasto)
  })
})

describe('rondas: jefe-marketing → el que escribe corrige → revisor ciego → el que escribe decide', () => {
  it('ficha del jefe que bloquea ⇒ corrige el AUTOR DEL TEXTO, se re-chequea y la ficha queda tomada', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pasos, tareas, ultima } = await correr(M, id, guionGenerada({
      jefe: () => ({ texto: JSON.stringify({ fichas: [{ que: 'el pie no menciona la entrega', donde: 'texto', contra_que: 'brief', gravedad: 'bloquea', propuesta: 'agregar delivery' }] }) }),
      corrige: (_n, t) => ({ texto: JSON.stringify({ respuestas: idsDe(t, 'jefe').map((fid) => ({ id: fid, estado: 'tomada', razon: 'agregado' })), pieza: { pie_de_foto: 'Ceviche de Olón a $7.00 con delivery. Pídelo al 0997744288.', hashtags: ['#ceviche'] } }) }),
    }))
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'prompts', 'mirar', 'texto', 'revision_jefe', 'corrige'])
    expect(tareas['corrige'][0]).toMatch(/el pie no menciona la entrega/)
    const e = M.encargos.get(id)!.estado_del_motor
    expect(e.fichas.filter((f) => f.origen === 'jefe').every((f) => f.estado === 'tomada')).toBe(true)
    expect(String(e.artefactos['pieza_post'].datos.pie_de_foto)).toMatch(/delivery/)
    expect(e.artefactos['pieza_post'].version).toBe(2)
    expect(ultima.cuerpo.con_desacuerdo).toBe(false)
  })
  it('una sugerencia del jefe NO abre «corrige»', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pasos } = await correr(M, id, guionGenerada({ jefe: () => ({ texto: JSON.stringify({ fichas: [{ que: 'x', donde: 'texto', contra_que: 'y', gravedad: 'sugerencia', propuesta: 'z' }] }) }) }))
    expect(pasos).not.toContain('corrige')
  })
  it('el revisor ciego recibe SOLO la lista cerrada (nada del hilo ni de las fichas del jefe)', async () => {
    const M = crearMemoria()
    let visto: Record<string, unknown> = {}
    const original = M.P.revisor
    M.P.revisor = async (p) => { visto = p.pedido; return original(p) }
    const id = await abierto(M)
    await correr(M, id, guionGenerada({ jefe: () => ({ texto: JSON.stringify({ fichas: [{ que: 'SECRETO-DEL-JEFE', donde: 'texto', contra_que: 'y', gravedad: 'sugerencia', propuesta: 'z' }] }) }) }))
    expect(Object.keys(visto).sort()).toEqual(['brief', 'imagen', 'instruccion', 'manual', 'material_portero', 'pieza', 'plan', 'visual_direction'])
    expect(JSON.stringify(visto)).not.toMatch(/SECRETO-DEL-JEFE|fichas_jefe/)
  })
  it('hallazgo del revisor ciego ⇒ «decide»: el autor lo toma o no, con razón', async () => {
    const M = crearMemoria()
    M.revisorTexto = () => ({ ok: true, texto: JSON.stringify({ fichas: [{ que: 'el tono es corto', donde: 'texto', contra_que: 'manual', gravedad: 'sugerencia', propuesta: 'alargar' }] }), costo_usd: 0.12, modelo: 'sim' })
    const id = await abierto(M)
    const { pasos, ultima } = await correr(M, id, guionGenerada({ decide: (_n, t) => ({ texto: JSON.stringify({ respuestas: idsDe(t, 'ext').map((fid) => ({ id: fid, estado: 'no_tomada', razon: 'el manual pide frases cortas' })) }) }) }))
    expect(pasos.at(-1)).toBe('decide')
    expect(M.encargos.get(id)!.estado_del_motor.fichas.find((f) => f.origen === 'externa')).toMatchObject({ estado: 'no_tomada', razon: 'el manual pide frases cortas' })
    expect(ultima.cuerpo.con_desacuerdo).toBe(false) // no_tomada de una SUGERENCIA no bloquea
  })
  it('una ficha del jefe sobre la IMAGEN que bloquea no tiene dueño en esta ronda: se declara sin tomar y el encargo sale con desacuerdo', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { pasos, ultima } = await correr(M, id, guionGenerada({ jefe: () => ({ texto: JSON.stringify({ fichas: [{ que: 'la imagen no se parece al plato', donde: 'imagen', contra_que: 'brief', gravedad: 'bloquea', propuesta: 'rehacer' }] }) }) }))
    expect(pasos).not.toContain('corrige')
    expect(ultima.cuerpo).toMatchObject({ con_desacuerdo: true })
  })
  it('si el revisor externo no responde, la pieza sigue y sale marcada con desacuerdo (no se atasca)', async () => {
    const M = crearMemoria(); M.revisorTexto = () => ({ ok: false, error: 'sin acceso al modelo' })
    const id = await abierto(M)
    const { ultima, pasos } = await correr(M, id, guionGenerada())
    expect(pasos).not.toContain('decide')
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: true })
  })
  it('el revisor externo que devuelve basura dos veces ⇒ pieza sin segunda mirada, con desacuerdo', async () => {
    const M = crearMemoria(); M.revisorTexto = () => ({ ok: true, texto: 'no json', costo_usd: 0.1, modelo: 'sim' })
    const id = await abierto(M)
    const { ultima } = await correr(M, id, guionGenerada())
    expect(M.llamadas.revisor).toBe(2)
    expect(ultima.cuerpo.con_desacuerdo).toBe(true)
  })
})

describe('chequeos duros del texto dentro del encargo', () => {
  it('una palabra prohibida del manual abre ficha del chequeo y el jefe ya la ve', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { tareas } = await correr(M, id, guionGenerada({ texto: JSON.stringify({ pie_de_foto: 'El mejor ceviche premium a $7.00. Pídelo al 0997744288.', hashtags: ['#ceviche'] }) }))
    expect(tareas['revision_jefe'][0]).toMatch(/palabra prohibida «premium»/)
  })
  it('precio fuera de la carta bloquea ⇒ con desacuerdo si nadie lo corrige', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { ultima } = await correr(M, id, guionGenerada({ texto: JSON.stringify({ pie_de_foto: 'Ceviche a $9.99. Pídelo al 0997744288.', hashtags: [] }) }))
    expect(ultima.cuerpo.con_desacuerdo).toBe(true)
  })
  it('el voseo del brief («pedilo») se marca porque el manual fija tuteo', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { tareas } = await correr(M, id, guionGenerada({ texto: JSON.stringify({ pie_de_foto: 'Ceviche a $7.00. Pedilo al 0997744288.', hashtags: [] }) }))
    expect(tareas['revision_jefe'][0]).toMatch(/voseo/)
  })
})

describe('salida real (dry_run = false): pieza draft + bandeja con output_id y vencimiento', () => {
  it('escribe la salida, la fila de la bandeja con `output_id` y `expires_at`, y guarda la entrega', async () => {
    const M = crearMemoria()
    const id = await abierto(M, sobre({ dry_run: false }))
    const { ultima } = await correr(M, id, guionGenerada())
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', simulado: false, output_id: '99999999-9999-4999-8999-999999999999', hitl_queue_id: '88888888-8888-4888-8888-888888888888', resultado_para_la_sala: 'encargo_en_bandeja' })
    expect(M.llamadas.imagenReal).toBe(2); expect(M.llamadas.revisorReal).toBe(1)
    const q = M.llamadas.bandeja[0] as { output_id: string; expires_at: string; titulo: string; metadata: Record<string, unknown> }
    expect(q.output_id).toBe('99999999-9999-4999-8999-999999999999')
    expect(q.expires_at).toBe('2026-10-14T05:00:00.000Z') // «antes del 14 de octubre de 2026» a las 00:00 de Guayaquil (UTC−5)
    expect(q.titulo).toMatch(/^Aprobación · Pieza BRF-0003 · Instagram · versión 1 · /)
    expect(q.metadata).toMatchObject({ origen: 'oficina', imagen_generada: true, oficina_encargo_id: id })
    const s = M.llamadas.salidas[0] as { metadata: Record<string, unknown> }
    expect(s.metadata).toMatchObject({ familia: 'post_img', brief_id: 'BRF-0003', imagen_generada: true })
  })
  it('la carpeta de entrega: imagen, texto para copiar, hoja de pasos y manifiesto con nombres ordenables', async () => {
    const M = crearMemoria()
    const id = await abierto(M, sobre({ dry_run: false }))
    await correr(M, id, guionGenerada())
    expect(M.llamadas.guardadoDeArchivos).toBe(1)
    expect(M.llamadas.archivos.sort()).toEqual([
      'manifest.json', 'sin-fecha_sin-hora_instagram_foto_BRF-0003_01-de-01.png', 'sin-fecha_sin-hora_instagram_foto_BRF-0003_01-de-01_publicar.md', 'sin-fecha_sin-hora_instagram_foto_BRF-0003_01-de-01_texto.txt',
    ].sort())
  })
  it('sin zona del cliente la pieza NO vence y se declara (expires_at nulo), nunca se inventa', async () => {
    const M = crearMemoria({ fuentes: { zona: null } })
    const id = await abierto(M, sobre({ dry_run: false }))
    await correr(M, id, guionGenerada())
    expect((M.llamadas.bandeja[0] as { expires_at: string | null }).expires_at).toBeNull()
  })
  it('con desacuerdo avisa a #alertas además del hilo', async () => {
    const M = crearMemoria()
    const id = await abierto(M, sobre({ dry_run: false }))
    await correr(M, id, guionGenerada({ texto: JSON.stringify({ pie_de_foto: 'Ceviche a $9.99.', hashtags: [] }) }))
    expect(M.llamadas.avisos.some((a) => a.canal === 'alertas' && /desacuerdo/i.test(a.texto))).toBe(true)
  })
})

describe('el freno de US$ 10 (aquí 0,20) y los fallos de entrada', () => {
  it('antes de arrancar un paso que pasaría el tope, cierra por tope y avisa; no revienta', async () => {
    const M = crearMemoria({ tope: 0.2 })
    const id = await abierto(M)
    const { ultima } = await correr(M, id, guionGenerada())
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado_por_tope', resultado_para_la_sala: 'cerrado_por_tope' })
    expect(M.llamadas.avisos.some((a) => a.canal === 'alertas' && /tope/i.test(a.texto))).toBe(true)
  })
  it('un tope pedido mayor que el de la plantilla se recorta a US$ 10', async () => {
    const M = crearMemoria()
    const r = await abrir(M, sobre({ tope_usd: 10 }))
    expect(M.encargos.get(String(r.cuerpo.encargo_id))!.tope_usd).toBe(10)
  })
  it('la parte que no existe o el brief que no está cierran fallido, visible', async () => {
    const M = crearMemoria(); M.P.parte = async () => null
    const a = await abrir(M)
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' })
    const N = crearMemoria({ parte: PARTE_REAL })
    const b = await abrir(N, sobre({ brief_id: 'BRF-0099' }))
    expect(b.cuerpo).toMatchObject({ estado: 'fallido' })
  })
  it('un brief que no es de imagen (configuración) no entra a esta sala', async () => {
    const M = crearMemoria()
    const r = await abrir(M, sobre({ brief_id: 'BRF-0001' }))
    expect(r.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(r.cuerpo.motivo)).toMatch(/no es un post de imagen/)
  })
  it('si no se pueden leer las fuentes del cliente, falla visible (no se sigue a ciegas)', async () => {
    const M = crearMemoria(); M.P.fuentes = async () => ({ error: 'base caída' })
    const r = await abrir(M)
    expect(r.cuerpo).toMatchObject({ estado: 'fallido' })
  })
})

describe('regla de canon: nada se pregunta al cliente', () => {
  it('ningún pedido de la oficina menciona «dueño» como destinatario de un recado', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const { tareas } = await correr(M, id, guionGenerada())
    const todo = Object.values(tareas).flat().join('\n')
    expect(todo).not.toMatch(/pide(r)? (la foto )?al due[ñn]o|pregunta(r)? al (cliente|due[ñn]o)/i)
  })
  it('las reglas de imagen de los fixtures son las del brief real y todas tienen su cita literal', () => {
    for (const r of [...REGLAS_CEVICHE.obligatorio, ...REGLAS_CEVICHE.prohibido]) expect(PARTE_REAL.toLowerCase()).toContain(r.cita.toLowerCase().replace(/[.]$/, ''))
  })
})
