/**
 * J8a · EL PASO `jefatura` DE LA OFICINA · pruebas (CC#1 · 14-oct). US$ 0: sin red, sin modelo, sin base.
 * (1) las 3 plantillas con jefatura son válidas, no tienen los pasos viejos y conservan lo que se conserva; las de julio no se tocan;
 * (2) IGUALDAD: con las mismas respuestas simuladas, la plantilla de julio (jefe → corrige → GPT → decide) y la nueva (el paso `jefatura` con la jefatura REAL en memoria) dejan lo mismo en la bandeja;
 * (3) una revisión `fallida`, `incompleta_por_tope`, que no se pudo abrir o que nunca contestó NO pierde la pieza: llega a la bandeja marcada, por familia;
 * (4) espera y reanudación: el encargo queda esperando, la entrega repetida no duplica y la de otro encargo se rechaza.
 */
import { describe, expect, it } from 'vitest'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import { almacenEnMemoria, correr as correrJefatura, puertosDePrueba } from '../../../../__tests__/_helpers/jefatura-revision'
import { abrirEncargo, jefaturaSinRespuesta, recibirJefatura } from '../orquestador'
import { aplicarSalidaDeJefatura, productoresDeLaPieza, sobreDeLaRevision } from '../paso-jefatura'
import { registrarPaso, siguientePaso } from '../motor'
import { validarPlantilla } from '../plantilla'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA, PASOS_QUE_SE_VAN, POST_IMG_CON_JEFATURA } from '../plantillas/con-jefatura'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { AperturaDeJefatura } from '../puertos'
import type { Plantilla } from '../tipos'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, PARTE, PIEZA_OK, REGLAS_CEVICHE, correr, crearMemoria, direccionGenerada, observacion, type Guion, type Memoria } from './memoria'

const j = (x: unknown) => JSON.stringify(x)
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const idsDe = (t: string, pref: string) => [...t.matchAll(new RegExp(`\\[(${pref}-[^\\]]+)\\]`, 'g'))].map((x) => x[1])

// ═══════════════════════════════════════════════════════════ 1 · las plantillas
describe('las 3 plantillas con el paso `jefatura`', () => {
  const casos: Array<[string, Plantilla, Plantilla]> = [['post_img', POST_IMG, POST_IMG_CON_JEFATURA], ['carrusel_ig_v1', CARRUSEL_IG_V1, CARRUSEL_IG_CON_JEFATURA], ['kit_historias', KIT_HISTORIAS, KIT_HISTORIAS_CON_JEFATURA]]
  for (const [nombre, vieja, nueva] of casos) {
    describe(nombre, () => {
      it('es una plantilla VÁLIDA para el motor (el vocabulario cerrado acepta el paso nuevo)', () => { expect(validarPlantilla(nueva)).toEqual([]) })
      it('no trae ninguno de los pasos viejos de revisión, corrección, opinión externa ni decisión', () => {
        const claves = nueva.pasos.map((p) => p.clave)
        for (const quitado of PASOS_QUE_SE_VAN) expect(claves).not.toContain(quitado)
        expect(nueva.pasos.some((p) => p.tipo === 'externo')).toBe(false)
        expect(JSON.stringify(nueva)).not.toMatch(/jefe-marketing|opinion_libre\.v1|"fichas\.v1"/)
      })
      it('tiene UN solo paso `jefatura`, en el lugar del jefe, sin gasto propio y sin contrato de salida', () => {
        const pj = nueva.pasos.filter((p) => p.tipo === 'jefatura')
        expect(pj).toHaveLength(1)
        expect(pj[0]).toMatchObject({ clave: 'jefatura', quien: 'jefatura', tope_usd: 0, condicion: { tipo: 'siempre' }, salida_artefacto: 'respuesta_imagen' })
        expect(pj[0].salida).toBeUndefined()
        const i = nueva.pasos.findIndex((p) => p.clave === 'jefatura')
        expect(nueva.pasos[i - 1].clave).toBe('chequeos') // justo después de los chequeos duros, donde estaba el jefe
        expect(pj[0].entrada).toEqual(vieja.pasos.find((p) => p.clave === 'revision_jefe')!.entrada)
      })
      it('conserva los chequeos duros, la re-imagen, la entrega, el cierre y el tope del encargo', () => {
        const nuevas = nueva.pasos.map((p) => p.clave)
        for (const k of ['chequeos', 'chequeos_2', 'chequeos_3', 'reimagen_prompts', 'reimagen_imagen', 'reimagen_mirar', 'entrega', 'cierre']) expect(nuevas).toContain(k)
        expect(nueva.limites).toEqual(vieja.limites)
        expect(nueva.pasos.length).toBeLessThan(vieja.pasos.length)
      })
      it('la plantilla de julio NO cambió (la migración y las pruebas del motor la congelan)', () => {
        expect(vieja.pasos.map((p) => p.clave)).toContain('revision_jefe')
        expect(vieja.pasos.map((p) => p.clave)).toContain('revisor_externo')
      })
    })
  }
  it('la indicación del jefe de marketing sale de la oficina (como revisor vive en la política de la jefatura); las de quienes producen se conservan', () => {
    for (const [, vieja, nueva] of casos) {
      expect(nueva.indicaciones['jefe-marketing']).toBeUndefined()
      for (const a of Object.keys(vieja.indicaciones).filter((x) => x !== 'jefe-marketing')) expect(nueva.indicaciones[a]).toEqual(vieja.indicaciones[a])
    }
  })
  it('una plantilla con un paso `jefatura` mal armado NO se puede activar', () => {
    const rota = JSON.parse(JSON.stringify(POST_IMG_CON_JEFATURA)) as Plantilla
    const p = rota.pasos.find((x) => x.clave === 'jefatura')!
    p.tope_usd = 0.5; p.quien = 'otro'
    const e = validarPlantilla(rota).join(' | ')
    expect(e).toMatch(/su tope debe ser 0/); expect(e).toMatch(/se llama «jefatura»/)
  })
})

// ═══════════════════════════════════════════════════════════ 2 · lo que se manda a la jefatura
describe('lo que el paso manda a la jefatura', () => {
  const enc = { id: '00000000-0000-4000-8000-000000000001', client_id: CLIENTE, familia: 'post_img', tope_usd: 10, dry_run: false, sala_ref: { _journey_id: 'journey-9' } }
  const e = { ultimo: 3, pasos_ejecutados: 5, gasto_usd: 1.5, vueltas: {}, artefactos: { pieza_post: { version: 2, version_consumida: 1, datos: {} } }, fichas: [{ id: 'chk0-0', origen: 'chequeo' as const, donde: 'texto', gravedad: 'bloquea' as const, estado: 'abierta' as const, que: 'precio sin fuente' }, { id: 'chk0-1', origen: 'chequeo' as const, donde: 'hashtags', gravedad: 'sugerencia' as const, estado: 'tomada' as const, que: 'ya resuelto' }] }
  const material = { pieza: 'Pie de foto…', imagenes: ['https://img.test/1.png'], contexto: [{ titulo: 'Manual de marca del cliente', funcion: 'lo vigente', texto: 'M' }] }
  it('es la entrada de la ruta de la jefatura: tipo pieza, el encargo como artefacto, cliente y recorrido, sin `devolver_a` (lo pone el adaptador)', () => {
    const s = sobreDeLaRevision(enc, { familia: 'post_img' }, e, material)
    expect(s).toMatchObject({ artifact_type: 'pieza', artifact_id: enc.id, client_id: CLIENTE, journey_id: 'journey-9' })
    expect(s.payload).toMatchObject({ texto: 'Pie de foto…', imagenes: ['https://img.test/1.png'], familia: 'post_img', dry_run: false, version: 2, generado_por_jefatura: null })
    expect('devolver_a' in s.payload).toBe(false)
    expect(s.payload.contexto).toEqual(material.contexto)
  })
  it('las marcas de los chequeos duros abiertos viajan como DATO (marcas heredadas) y como chequeos previos; las ya resueltas no', () => {
    const s = sobreDeLaRevision(enc, { familia: 'post_img' }, e, material)
    expect(s.payload.marcas_heredadas).toEqual(['texto: precio sin fuente'])
    expect(s.payload.chequeos_previos).toEqual({ pasaron: false, necesita_humano: false, marcas: ['texto: precio sin fuente'] })
  })
  it('lo que le queda al encargo del tope es lo que la jefatura puede gastar (nunca negativo)', () => {
    expect(sobreDeLaRevision(enc, { familia: 'post_img' }, e, material).payload.tope_restante_usd).toBe(8.5)
    expect(sobreDeLaRevision(enc, { familia: 'post_img' }, { ...e, gasto_usd: 12 }, material).payload.tope_restante_usd).toBe(0)
  })
  it('quién corrige cada parte según la familia (reparo 2 de CC#3): el carrusel suma a quien dibuja y el kit a quien estructura', () => {
    expect(productoresDeLaPieza('post_img').map((p) => `${p.donde}:${p.agente}`)).toEqual(['texto:content-creator', 'hashtags:content-creator', 'imagen:marketing_instagram_curator'])
    expect(productoresDeLaPieza('carrusel').map((p) => p.donde)).toContain('laminas')
    expect(productoresDeLaPieza('carrusel').find((p) => p.donde === 'laminas')!.agente).toBe('carousel-designer')
    expect(productoresDeLaPieza('kit').find((p) => p.donde === 'estructura')!.agente).toBe('design-visual-storyteller')
    expect(sobreDeLaRevision(enc, { familia: 'carrusel_ig_v1' }, e, material).payload.productores).toEqual(productoresDeLaPieza('carrusel'))
    expect(sobreDeLaRevision(enc, { familia: 'kit_historias' }, e, material).payload.productores).toEqual(productoresDeLaPieza('kit'))
  })
  it('traducir una salida: lo que no se tomó es desacuerdo (jefe · bloquea), la opinión externa es OPINIÓN y la pieza corregida es versión nueva', () => {
    const salida = { revision_id: 'r1', resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false }, desacuerdos: ['texto: falta el precio (no tomada: no lo sé)'], respuestas: [{ ficha_id: 'x', origen: 'externa', donde: 'texto', estado: 'no_tomada', razon: 'no aplica' }],
      artefacto_final: { pieza: { pie_de_foto: 'Nuevo pie' } }, opinion_externa: { texto: 'me gustó', modelo: 'm' }, imagen_por_rehacer: false, costo_usd: 0.3, simulado: false, versiones: [], pasos: 3, trace_id: 't', devolver_a: null, artifact_type: 'pieza', artifact_id: enc.id } as unknown as SalidaDeRevision
    const r = aplicarSalidaDeJefatura({ familia: 'post_img' }, { ...e, artefactos: { ...e.artefactos, pieza_post: { version: 1, version_consumida: 1, datos: { pie_de_foto: 'viejo', hashtags: ['#a'] } } } }, salida, { reImagen: () => ({}) })
    expect(r.fichas!.filter((f) => f.origen === 'jefe')).toMatchObject([{ gravedad: 'bloquea', estado: 'no_tomada', donde: 'texto' }])
    expect(r.fichas!.filter((f) => f.origen === 'externa')).toMatchObject([{ gravedad: 'sugerencia', estado: 'no_tomada', razon: 'no aplica', que: 'me gustó' }])
    expect(r.otros_artefactos!['pieza_post']).toEqual({ pie_de_foto: 'Nuevo pie', hashtags: ['#a'] })
    expect(r.otros_artefactos!['fichas_externas']).toEqual({ opinion: 'me gustó', modelo: 'm' })
    // 💰 R1 de CC#3: el gasto de la revisión SUMA al del encargo (antes se registraba en 0 y los pasos siguientes veían todo el tope otra vez)
    expect(r.costo_usd).toBe(0.3)
  })
})

// ═══════════════════════════════════════════════════════════ 3 · fixtures de las tres familias
const sobreEncargo = (familia: string, brief_id: string, dry_run = false) => ({ parte_id: PARTE, brief_id, dry_run, familia })
const BRIEF_CARRUSEL = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el plato del día
- PROTAGONISTA: El plato del día. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- VOCABULARIO OBLIGATORIO:
  - plato
- PROHIBIDO:
  - premium
- SINTAXIS: Frases cortas.
- VISUAL: El plato aparece completo. No aparecen personas.
- VISUAL OBLIGATORIO:
  - El plato aparece completo
- VISUAL PROHIBIDO:
  - No aparecen personas
- LLAMADO A LA ACCIÓN: Escríbenos por WhatsApp
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`
const BRIEF_KIT = `### BRF-0200 · Instagram · kit_historias
- QUÉ ES: Kit semanal de historias y estados
- PROTAGONISTA: El plato del día.
- LÍMITES: 9:16
- VISUAL: Fondo de la marca, sin personas.
- ELEMENTOS:
  - 2026-10-14 18:30 | historia | el plato del día | producto | precio 7.00
  - 2026-10-15 09:00 | estado | horario de la semana | servicio
  - 2026-10-16 12:00 | historia | mensaje de la semana | marca
- LLAMADO A LA ACCIÓN: Escríbenos
`
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const REGLAS_L = { obligatorio: [{ id: 'o1', texto: 'el plato completo', claves: ['plato'], cita: 'El plato aparece completo' }], prohibido: [{ id: 'p1', texto: 'personas', claves: ['personas'], cita: 'No aparecen personas' }] }
const sinImagenes = j({ resumen: 'Fondo de la marca', imagenes: [], reglas_de_imagen: { obligatorio: [], prohibido: [] } })
const conImagenGenerada = (ref: string) => j({ resumen: 'Luz natural lateral', estilo: 'directo', imagenes: [{ ref, modo: 'generada', motivo: 'no hay foto real que sirva' }], reglas_de_imagen: REGLAS_L })
const promptsDe = (refs: string[]) => j({ imagenes: refs.map((ref) => ({ ref, prompts: [
  { prompt: 'Un plato servido sobre una mesa de madera clara, luz natural lateral. El plato aparece completo. Sin personas, sin texto', idea_en_una_linea: 'cenital' },
  { prompt: 'A nivel de mesa, fondo de cocina desenfocado. El plato aparece completo. Sin personas ni logos', idea_en_una_linea: 'nivel de mesa' }] })), tamaño: '1080x1350' })
const observacionL = (indices: number[]) => j({ imagenes: indices.map((indice) => ({ indice, reglas: [{ id: 'o1', presente: true, evidencia: 'v' }, { id: 'p1', presente: false, evidencia: 'no hay' }, { id: 'brief-o1', presente: true, evidencia: 'v' }, { id: 'brief-p1', presente: false, evidencia: 'no hay' }], texto_en_imagen: [], marcas: [], personas: 0, producto: 'plato' })), preferencia: indices })
const TEXTO_BASE = 'Cada mañana empieza igual.\nHoy cambia el plato del día.\nPrueba el plato del día.\nLo preparamos al momento.\nEscríbenos por WhatsApp'
const COPIA = { texto_base: TEXTO_BASE, pie_de_foto: 'El plato del día te espera.', hashtags: ['#plato'], llamado: 'Escríbenos por WhatsApp' }
const LAMINAS = [
  { rol: 'hook', headline: 'Cada mañana empieza igual' }, { rol: 'problem', headline: 'Hoy cambia el plato del día' }, { rol: 'reframe', headline: 'Prueba el plato del día' },
  { rol: 'benefit', headline: 'Lo preparamos al momento' }, { rol: 'cta', headline: 'Escríbenos por WhatsApp', cta: 'Escríbenos por WhatsApp' },
]
const ESTRUCTURA = { elementos: [
  { ref: 'e01', rol: 'apertura', beat: 'presentar el plato', mood: 'cálido', foto_slot: 'e01' }, { ref: 'e02', rol: 'servicio', beat: 'cuándo y dónde', mood: 'claro' }, { ref: 'e03', rol: 'cierre', beat: 'invitar', mood: 'cercano' },
] }
const COPY_KIT = { elementos: [
  { ref: 'e01', headline: 'El plato del día', body: 'Hoy cuesta 7.00', acompanamiento: 'Hoy: el plato del día. Pídelo por mensaje.', hashtags: ['#plato'] },
  { ref: 'e02', headline: 'Abrimos de jueves a lunes', acompanamiento: 'Horario de la semana.' },
  { ref: 'e03', headline: 'Escríbenos', cta: 'Escríbenos', acompanamiento: 'Te esperamos.' },
] }

interface Familia { nombre: string; vieja: Plantilla; nueva: Plantilla; parte?: string; brief_id: string; familia: string; guionBase: Guion; ficha: { que: string; donde: string }; piezaCorregida: Record<string, unknown> }
const FAMILIAS: Familia[] = [
  {
    nombre: 'post_img', vieja: POST_IMG, nueva: POST_IMG_CON_JEFATURA, brief_id: 'BRF-0003', familia: 'post_img', ficha: { que: 'el pie de foto promete un envío que el plan no menciona', donde: 'texto' },
    piezaCorregida: { pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp al 0997744288 (envío según zona).', hashtags: ['#ceviche', '#olon'], llamado: 'Pídelo por WhatsApp' },
    guionBase: {
      paquete: () => ({ texto: 'material del portero: fotos etiquetadas, sedes, manual vigente' }), direccion_visual: () => ({ texto: direccionGenerada(REGLAS_CEVICHE) }), prompts: () => ({ texto: BUENOS_PROMPTS }),
      mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }), texto: () => ({ texto: PIEZA_OK }), reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }), reimagen_mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
    },
  },
  {
    nombre: 'carrusel', vieja: CARRUSEL_IG_V1, nueva: CARRUSEL_IG_CON_JEFATURA, parte: parteCon(BRIEF_CARRUSEL), brief_id: 'BRF-0100', familia: 'carrusel_ig_v1', ficha: { que: 'el llamado a la acción no coincide con el brief', donde: 'texto' },
    piezaCorregida: { pie_de_foto: 'El plato del día te espera. Escríbenos.', hashtags: ['#plato'], llamado: 'Escríbenos por WhatsApp' },
    guionBase: {
      paquete: () => ({ texto: 'material del portero' }), direccion_visual: () => ({ texto: sinImagenes }), prompts: () => ({ texto: promptsDe(['hook']) }), mirar: (_n, t) => ({ texto: observacionL(indicesDe(t)) }),
      reimagen_prompts: () => ({ texto: promptsDe(['hook']) }), reimagen_mirar: (_n, t) => ({ texto: observacionL(indicesDe(t)) }), texto: () => ({ texto: j(COPIA) }), laminas: () => ({ texto: j({ laminas: LAMINAS }) }),
    },
  },
  {
    nombre: 'kit', vieja: KIT_HISTORIAS, nueva: KIT_HISTORIAS_CON_JEFATURA, parte: parteCon(BRIEF_KIT), brief_id: 'BRF-0200', familia: 'kit_historias', ficha: { que: 'el horario de la semana no coincide con el manual', donde: 'texto' },
    piezaCorregida: {},
    guionBase: {
      paquete: () => ({ texto: 'material del portero' }), direccion_visual: () => ({ texto: sinImagenes }), prompts: () => ({ texto: promptsDe(['e01']) }), mirar: (_n, t) => ({ texto: observacionL(indicesDe(t)) }),
      reimagen_prompts: () => ({ texto: promptsDe(['e01']) }), reimagen_mirar: (_n, t) => ({ texto: observacionL(indicesDe(t)) }), narrativa: () => ({ texto: j(ESTRUCTURA) }), texto: () => ({ texto: j(COPY_KIT) }),
    },
  },
]

// cómo contesta cada empleado en cada escenario (los MISMOS textos para la plantilla de julio y para la jefatura)
interface Escenario { nombre: string; fichas: Array<{ gravedad: 'bloquea' | 'sugerencia'; donde: string }>; corrige: 'tomar' | 'no_tomar'; opinion: string; decide: 'tomar' | 'no_tomar'; sinSegunda?: boolean }
const ESCENARIOS: Escenario[] = [
  { nombre: 'limpia: sin fichas y sin opinión', fichas: [], corrige: 'tomar', opinion: '', decide: 'no_tomar' },
  { nombre: 'una ficha de fondo que el autor TOMA', fichas: [{ gravedad: 'bloquea', donde: 'texto' }], corrige: 'tomar', opinion: '', decide: 'no_tomar' },
  { nombre: 'una ficha de fondo que NO se toma (desacuerdo)', fichas: [{ gravedad: 'bloquea', donde: 'texto' }], corrige: 'no_tomar', opinion: '', decide: 'no_tomar' },
  { nombre: 'una sugerencia (no bloquea, no se corrige)', fichas: [{ gravedad: 'sugerencia', donde: 'texto' }], corrige: 'tomar', opinion: '', decide: 'no_tomar' },
  { nombre: 'GPT opina y el autor la toma', fichas: [], corrige: 'tomar', opinion: 'La pieza podría decir más del plato.', decide: 'tomar' },
  { nombre: 'GPT opina y el autor NO la toma', fichas: [], corrige: 'tomar', opinion: 'La pieza podría decir más del plato.', decide: 'no_tomar' },
  { nombre: 'sin segunda mirada (GPT no contesta)', fichas: [], corrige: 'tomar', opinion: '', decide: 'no_tomar', sinSegunda: true },
]
const fichasJson = (f: Familia, s: Escenario) => j({ fichas: s.fichas.map((x) => ({ que: f.ficha.que, donde: x.donde, contra_que: 'manual', gravedad: x.gravedad, propuesta: 'ajustar' })) })
const respuestasDe = (ids: string[], estado: 'tomada' | 'no_tomada') => ids.map((id) => ({ id, estado, razon: estado === 'tomada' ? 'agregado' : 'no aplica' }))
const piezaSi = (f: Familia, tomar: boolean) => (tomar && Object.keys(f.piezaCorregida).length ? { pieza: f.piezaCorregida } : {})

/** el guion de la plantilla de JULIO: jefe, quien corrige, GPT (por el puerto del revisor) y quien decide */
function guionViejo(f: Familia, s: Escenario): Guion {
  const corrige = (_n: number, t: string) => ({ texto: j({ respuestas: respuestasDe(idsDe(t, 'jefe'), s.corrige === 'tomar' ? 'tomada' : 'no_tomada'), ...(f.nombre === 'post_img' ? piezaSi(f, s.corrige === 'tomar') : {}) }) })
  const decide = (_n: number, t: string) => ({ texto: j({ respuestas: respuestasDe(idsDe(t, 'ext'), s.decide === 'tomar' ? 'tomada' : 'no_tomada') }) })
  const sinTexto = () => ({ texto: '{"respuestas": []}' })
  return { ...f.guionBase, revision_jefe: () => ({ texto: fichasJson(f, s) }), corrige: corrige, corrige_texto: corrige, ajusta_laminas: sinTexto, corrige_laminas: sinTexto, corrige_estructura: sinTexto, decide: decide, decide_texto: decide, decide_laminas: sinTexto, decide_estructura: sinTexto, ajusta_laminas_2: sinTexto, decide_imagen: sinTexto } as Guion
}
/** cómo contesta cada turno de la jefatura REAL (en memoria) en ese escenario */
const responderJefatura = (f: Familia, s: Escenario) => (t: { paso: string; pedido: Record<string, unknown> }) => {
  const task = String(t.pedido.task ?? '')
  if (t.paso === 'revision_fondo') return { texto: fichasJson(f, s) }
  if (t.paso.startsWith('correccion:')) return { texto: j({ respuestas: respuestasDe(idsDe(task, 'jefe'), s.corrige === 'tomar' ? 'tomada' : 'no_tomada'), ...(t.paso.endsWith('content-creator') && f.nombre === 'post_img' ? piezaSi(f, s.corrige === 'tomar') : {}) }) }
  // como en la plantilla de julio: quien dirige la imagen no toma la opinión salvo que la prueba lo pida (esa es la re-imagen)
  if (t.paso.startsWith('decision:')) return { texto: j({ respuestas: respuestasDe(idsDe(task, 'ext'), s.decide === 'tomar' && !t.paso.endsWith('marketing_instagram_curator') ? 'tomada' : 'no_tomada') }) }
  return undefined
}

/** conecta el puerto de la oficina con la jefatura REAL en memoria: la revisión corre completa y cierra dentro de la llamada */
function conLaJefatura(M: Memoria, o: { responder: ReturnType<typeof responderJefatura>; opinion?: string; sinSegunda?: boolean; config?: Parameters<typeof almacenEnMemoria>[0] }) {
  const mem = almacenEnMemoria(o.config ?? { config: { estado: 'ensayo', tipos_activos: ['pieza'], clientes_ensayo: [CLIENTE] }, activas: ['pieza'] })
  const { P: PJ } = puertosDePrueba({ almacen: mem, revisor: () => (o.sinSegunda ? { ok: false, error: 'GPT no contestó', costo_usd: 0, intentos: [] } : { ok: true, texto: o.opinion ?? '', costo_usd: 0.1, modelo: 'revisor-simulado' }) })
  const sobres: Array<Record<string, unknown>> = []
  const salidas: SalidaDeRevision[] = []
  M.P.jefatura = async (sobre): Promise<AperturaDeJefatura> => {
    sobres.push(sobre as never)
    const c = await correrJefatura(PJ, { ...sobre, payload: { ...sobre.payload, devolver_a: { tipo: 'webhook', destino: 'https://zero-risk-platform.vercel.app/api/jefatura/oficina-vuelta' } } } as never, o.responder as never)
    if (c.final.status === 409) return { estado: 'no_abre', motivo: String(c.final.cuerpo.motivo ?? c.final.cuerpo.error) }
    if (c.final.cuerpo.accion === 'cerrado') { salidas.push(c.final.cuerpo.salida as SalidaDeRevision); return { estado: 'cerrada', salida: c.final.cuerpo.salida as SalidaDeRevision } }
    return { estado: 'error', motivo: JSON.stringify(c.final.cuerpo).slice(0, 200) }
  }
  return { mem, sobres, salidas }
}

async function abrir(f: Familia, plantilla: Plantilla) {
  const M = crearMemoria({ ...(f.parte ? { parte: f.parte } : {}), plantilla })
  const a = await abrirEncargo(M.P, { cuerpo: sobreEncargo(f.familia, f.brief_id), client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  expect(a.status).toBe(200)
  return { M, id: String(a.cuerpo.encargo_id) }
}

/** lo que ve quien aprueba y lo que queda en el encargo, SIN el gasto ni los pasos (que cambian por diseño) */
function observable(M: Memoria, id: string) {
  const enc = M.encargos.get(id)!
  const b = (M.llamadas.bandeja[0]?.metadata ?? {}) as Record<string, any>
  const s = (M.llamadas.salidas[0] ?? { contenido: {}, metadata: {} }) as { contenido: Record<string, any>; titulo?: string }
  return {
    estado: enc.estado, con_desacuerdo: enc.con_desacuerdo, hayBandeja: M.llamadas.bandeja.length === 1,
    fichasDeFondoSinTomar: enc.estado_del_motor.fichas.filter((x) => x.origen === 'jefe' && x.gravedad === 'bloquea' && x.estado !== 'tomada').map((x) => [x.donde, x.estado]),
    // la jefatura rotula la opinión también para quien responde por los hashtags, las láminas o la estructura (la plantilla de julio solo para el texto y la imagen): esas líneas extra no cuentan
    opinion: enc.estado_del_motor.fichas.filter((x) => x.origen === 'externa' && ['texto', 'imagen'].includes(x.donde)).map((x) => [x.donde, x.estado]).sort(),
    marca: { sin_segunda_mirada: b.sin_segunda_mirada ?? false, con_desacuerdo: b.con_desacuerdo, desacuerdos: (b.desacuerdos ?? []).map((d: string) => d.split(':')[0]), imagen_por_rehacer: b.imagen_por_rehacer ?? false, re_imagen_hecha: b.re_imagen_hecha ?? false, opinion: b.opinion_externa ? { el_autor: b.opinion_externa.el_autor?.estado ?? null } : null },
    titulo: M.llamadas.bandeja[0]?.titulo, pie: s.contenido.pie_de_foto ?? null, texto_base: s.contenido.texto_base ?? null,
  }
}

// ═══════════════════════════════════════════════════════════ 4 · IGUALDAD con la plantilla de julio
describe('IGUALDAD: lo que queda en la bandeja es lo mismo con la plantilla de julio y con el paso `jefatura`', () => {
  for (const f of FAMILIAS) {
    describe(f.nombre, () => {
      for (const s of ESCENARIOS) {
        it(s.nombre, async () => {
          const v = await abrir(f, f.vieja)
          v.M.revisorTexto = () => (s.sinSegunda ? { ok: false, error: 'GPT no contestó', costo_usd: 0, intentos: [] } : { ok: true, texto: s.opinion, costo_usd: 0.1, modelo: 'revisor-simulado' })
          await correr(v.M, v.id, guionViejo(f, s))
          const n = await abrir(f, f.nueva)
          conLaJefatura(n.M, { responder: responderJefatura(f, s), opinion: s.opinion, sinSegunda: s.sinSegunda })
          const r = await correr(n.M, n.id, f.guionBase)
          expect(r.ultima.cuerpo.accion).toBe('cerrado')
          expect(observable(n.M, n.id)).toEqual(observable(v.M, v.id))
          expect(observable(n.M, n.id).hayBandeja).toBe(true)
        })
      }
    })
  }

  it('la re-imagen de la opinión es la MISMA: si quien dirige la imagen toma la opinión, la oficina rehace la imagen una sola vez (post con imagen generada)', async () => {
    const f = FAMILIAS[0]
    const respuestaImagen = (t: string, tomar: boolean) => j({ respuestas: respuestasDe(idsDe(t, 'ext'), tomar ? 'tomada' : 'no_tomada') })
    const v = await abrir(f, f.vieja)
    v.M.revisorTexto = () => ({ ok: true, texto: 'La imagen podría ser más cálida.', costo_usd: 0.1, modelo: 'revisor-simulado' })
    await correr(v.M, v.id, { ...guionViejo(f, ESCENARIOS[0]), decide: (_n, t) => ({ texto: respuestaImagen(t, false) }), decide_imagen: (_n, t) => ({ texto: respuestaImagen(t, true) }) })
    const n = await abrir(f, f.nueva)
    conLaJefatura(n.M, { opinion: 'La imagen podría ser más cálida.', responder: (t) => (t.paso === 'revision_fondo' ? { texto: FICHAS_VACIAS } : t.paso.startsWith('decision:') ? { texto: respuestaImagen(String(t.pedido.task), t.paso.endsWith('marketing_instagram_curator')) } : undefined) })
    await correr(n.M, n.id, f.guionBase)
    expect(v.M.llamadas.imagen).toBe(4) // 2 de la primera tanda + 2 de la re-imagen
    expect(n.M.llamadas.imagen).toBe(v.M.llamadas.imagen)
    expect(observable(n.M, n.id)).toEqual(observable(v.M, v.id))
    expect(n.M.encargos.get(n.id)!.estado_del_motor.vueltas['reimagen_imagen'] ?? 0).toBe(v.M.encargos.get(v.id)!.estado_del_motor.vueltas['reimagen_imagen'] ?? 0)
  })
})

// ═══════════════════════════════════════════════════════════ 5 · una revisión que no se completa NUNCA pierde la pieza
const salidaSintetica = (resultado: string, o: Record<string, unknown> = {}): SalidaDeRevision => ({
  revision_id: 'rev-1', artifact_type: 'pieza', artifact_id: 'x', resultado, marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false,
  desacuerdos: [], costo_usd: 0.4, pasos: 3, trace_id: 'jefatura:rev-1', devolver_a: null, simulado: false, ...o,
} as unknown as SalidaDeRevision)

describe('una revisión fallida, incompleta, que no abrió o que no contestó: la pieza llega a la bandeja MARCADA', () => {
  for (const f of FAMILIAS) {
    describe(f.nombre, () => {
      const llegaMarcada = (M: Memoria, id: string, marca: RegExp, meta: Record<string, unknown>) => {
        const enc = M.encargos.get(id)!
        expect(enc.estado).toBe('cerrado')
        expect(M.llamadas.bandeja).toHaveLength(1)
        expect(String(M.llamadas.bandeja[0].titulo)).toMatch(marca)
        expect(M.llamadas.bandeja[0].metadata).toMatchObject({ con_desacuerdo: true, ...meta })
        expect(M.llamadas.salidas).toHaveLength(1)
        expect(enc.con_desacuerdo).toBe(true)
        expect(M.llamadas.avisos.some((a) => a.canal === 'alertas')).toBe(true)
      }
      it('la revisión FALLA de verdad (el jefe no contesta): «REVISIÓN INCOMPLETA»', async () => {
        const { M, id } = await abrir(f, f.nueva)
        conLaJefatura(M, { responder: (() => ({ error: 'el empleado murió' })) as never })
        const r = await correr(M, id, f.guionBase)
        expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: true, resultado_para_la_sala: 'con_desacuerdo' })
        llegaMarcada(M, id, /^⚠️ REVISIÓN INCOMPLETA · /, { revision_incompleta: true, jefatura_resultado: 'fallida' })
        expect(r.ultima.cuerpo.desacuerdos).toEqual(expect.arrayContaining([expect.stringMatching(/revisión: incompleta \(fallida\)/)]))
      })
      it('la revisión se corta por TOPE: «REVISIÓN INCOMPLETA»', async () => {
        const { M, id } = await abrir(f, f.nueva)
        M.P.jefatura = async () => ({ estado: 'cerrada', salida: salidaSintetica('incompleta_por_tope') })
        await correr(M, id, f.guionBase)
        llegaMarcada(M, id, /^⚠️ REVISIÓN INCOMPLETA · /, { revision_incompleta: true, jefatura_resultado: 'incompleta_por_tope' })
      })
      it('la jefatura NO abre (apagada): «SIN REVISAR», nunca se hace pasar por revisada', async () => {
        const { M, id } = await abrir(f, f.nueva)
        conLaJefatura(M, { responder: () => undefined, config: { config: { estado: 'apagada', tipos_activos: [], clientes_ensayo: [] } } })
        await correr(M, id, f.guionBase)
        llegaMarcada(M, id, /^⚠️ SIN REVISAR · /, { sin_revisar: true, jefatura_resultado: 'sin_revisar' })
        expect(M.encargos.get(id)!.estado_del_motor.fichas.filter((x) => x.origen === 'jefe')).toEqual([])
      })
      it('el puerto de la jefatura no está configurado: «SIN REVISAR» (falla visible, no se pierde)', async () => {
        const { M, id } = await abrir(f, f.nueva)
        expect(M.P.jefatura).toBeUndefined()
        await correr(M, id, f.guionBase)
        llegaMarcada(M, id, /^⚠️ SIN REVISAR · /, { sin_revisar: true })
      })
      it('la revisión da error al abrirse (el puerto devuelve error): «SIN REVISAR» con el motivo', async () => {
        const { M, id } = await abrir(f, f.nueva)
        M.P.jefatura = async () => ({ estado: 'error', motivo: 'almacén caído' })
        await correr(M, id, f.guionBase)
        llegaMarcada(M, id, /^⚠️ SIN REVISAR · /, { sin_revisar: true, motivo_sin_revisar: 'almacén caído' })
      })
      it('una revisión LIMPIA no agrega ninguna marca de incompleta ni de sin revisar', async () => {
        const { M, id } = await abrir(f, f.nueva)
        M.P.jefatura = async () => ({ estado: 'cerrada', salida: salidaSintetica('limpia') })
        await correr(M, id, f.guionBase)
        expect(String(M.llamadas.bandeja[0].titulo)).not.toMatch(/INCOMPLETA|SIN REVISAR/)
        expect(M.llamadas.bandeja[0].metadata).toMatchObject({ con_desacuerdo: false })
        expect(M.llamadas.bandeja[0].metadata).not.toHaveProperty('revision_incompleta')
        expect(M.encargos.get(id)!.con_desacuerdo).toBe(false)
      })
    })
  }
})

// ═══════════════════════════════════════════════════════════ 6 · esperar y reanudar
describe('el encargo espera a la jefatura y se reanuda cuando entrega', () => {
  async function esperando(f: Familia = FAMILIAS[0]) {
    const { M, id } = await abrir(f, f.nueva)
    M.P.jefatura = async (): Promise<AperturaDeJefatura> => ({ estado: 'esperando', revision_id: 'rev-1' })
    const r = await correr(M, id, f.guionBase)
    return { M, id, r, f }
  }
  it('al abrirse la revisión el encargo queda ESPERANDO (turno «corriendo» de tipo jefatura) y nada se escribe todavía', async () => {
    const { M, id, r } = await esperando()
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'esperar_jefatura', revision_id: 'rev-1', turno: { paso: 'jefatura', tipo: 'jefatura' } })
    const t = [...M.turnos.get(id)!.values()].find((x) => x.estado === 'corriendo')!
    expect(t).toMatchObject({ paso: 'jefatura', tipo: 'jefatura', cost_usd: 0 }); expect(t.dispatch_key).toBe(`${id}:${t.n}`)
    expect(M.encargos.get(id)!.estado).toBe('en_paso')
    expect(M.llamadas.salidas).toHaveLength(0); expect(M.llamadas.bandeja).toHaveLength(0)
  })
  it('un «siguiente» repetido mientras espera no abre otra revisión ni otro turno', async () => {
    const { M, id } = await esperando()
    let aperturas = 0
    M.P.jefatura = async () => { aperturas++; return { estado: 'esperando', revision_id: 'rev-2' } }
    const { avanzar } = await import('../orquestador')
    const r = await avanzar(M.P, id)
    expect(aperturas).toBe(0); expect(r.cuerpo.accion).toBe('esperar_jefatura'); expect([...M.turnos.get(id)!.values()].filter((x) => x.estado === 'corriendo')).toHaveLength(1)
  })
  it('cuando la jefatura entrega, el encargo aplica la salida, termina y llega a la bandeja', async () => {
    const { M, id } = await esperando()
    const salida = salidaSintetica('con_desacuerdo', { artifact_id: id, marcas: { con_desacuerdo: true, sin_segunda_mirada: false }, desacuerdos: ['texto: falta el precio (no tomada: no lo sé)'], artefacto_final: { pieza: { pie_de_foto: 'Pie corregido por la jefatura', hashtags: ['#ceviche'], llamado: 'Pídelo' } } })
    const r = await recibirJefatura(M.P, id, salida)
    expect(r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: true })
    expect(M.llamadas.bandeja).toHaveLength(1)
    expect((M.llamadas.salidas[0] as { contenido: { pie_de_foto: string } }).contenido.pie_de_foto).toBe('Pie corregido por la jefatura')
    expect([...M.turnos.get(id)!.values()].find((x) => x.paso === 'jefatura')).toMatchObject({ estado: 'hecho', tipo: 'jefatura' })
  })
  it('la entrega REPETIDA no duplica nada (una sola pieza y una sola bandeja)', async () => {
    const { M, id } = await esperando()
    const salida = salidaSintetica('limpia', { artifact_id: id })
    await recibirJefatura(M.P, id, salida)
    const otra = await recibirJefatura(M.P, id, salida)
    expect(otra.cuerpo.accion).toBe('cerrado'); expect(M.llamadas.bandeja).toHaveLength(1); expect(M.llamadas.salidas).toHaveLength(1)
  })
  it('la salida de OTRO encargo se rechaza (409) y no cambia nada', async () => {
    const { M, id } = await esperando()
    const r = await recibirJefatura(M.P, id, salidaSintetica('limpia', { artifact_id: '00000000-0000-4000-8000-0000000000ff' }))
    expect(r.status).toBe(409); expect(r.cuerpo.error).toBe('salida_de_otro_encargo'); expect(M.llamadas.bandeja).toHaveLength(0)
    expect((await recibirJefatura(M.P, '00000000-0000-4000-8000-0000000000aa', salidaSintetica('limpia'))).status).toBe(404)
  })
  it('si la revisión nunca contesta, el vigía la da por perdida: la pieza sigue «SIN REVISAR» y avisa; repetirlo no duplica', async () => {
    const { M, id } = await esperando()
    const r = await jefaturaSinRespuesta(M.P, id, 'sin vuelta en 90 min')
    expect(r.cuerpo).toMatchObject({ accion: 'cerrado', con_desacuerdo: true })
    expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/^⚠️ SIN REVISAR · /)
    expect(M.llamadas.avisos.some((a) => a.canal === 'alertas' && /no contestó/.test(a.texto))).toBe(true)
    await jefaturaSinRespuesta(M.P, id, 'otra vez'); expect(M.llamadas.bandeja).toHaveLength(1)
  })
  for (const f of FAMILIAS.slice(1)) {
    it(`${f.nombre}: espera y reanuda igual (la entrega aplica la pieza y sigue con armar, dibujar y chequear)`, async () => {
      const { M, id } = await esperando(f)
      const r = await recibirJefatura(M.P, id, salidaSintetica('limpia', { artifact_id: id }))
      expect(r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' }); expect(M.llamadas.bandeja).toHaveLength(1)
    })
  }
})

// ═══════════════════════════════════════════════════════════ 7 · lo que la oficina conserva
describe('lo que NO se tocó', () => {
  it('con la plantilla de julio (sin paso jefatura) la oficina se comporta como siempre: jefe, corrige, GPT y decide', async () => {
    const f = FAMILIAS[0]
    const { M, id } = await abrir(f, f.vieja)
    const { pasos } = await correr(M, id, guionViejo(f, ESCENARIOS[2]))
    expect(pasos).toContain('revision_jefe'); expect(pasos).toContain('corrige')
    expect(M.P.jefatura).toBeUndefined()
  })
  it('los chequeos duros siguen corriendo DESPUÉS de la jefatura: la pieza corregida se vuelve a chequear (chequeos_2)', async () => {
    const f = FAMILIAS[0]
    const { M, id } = await abrir(f, f.nueva)
    conLaJefatura(M, { responder: responderJefatura(f, ESCENARIOS[1]) })
    await correr(M, id, f.guionBase)
    const turnos = [...M.turnos.get(id)!.values()].map((t) => t.paso)
    expect(turnos.indexOf('jefatura')).toBeGreaterThan(turnos.indexOf('chequeos'))
    expect(turnos.indexOf('chequeos_2')).toBeGreaterThan(turnos.indexOf('jefatura'))
    expect(turnos).not.toContain('revision_jefe'); expect(turnos).not.toContain('revisor_externo')
  })
  it('el gasto de la revisión SUMA al del encargo (lo que ve el tope), sin escribir otra fila en el libro de gastos de la oficina', async () => {
    const f = FAMILIAS[0]
    const n = await abrir(f, f.nueva); conLaJefatura(n.M, { responder: responderJefatura(f, ESCENARIOS[0]) }); await correr(n.M, n.id, f.guionBase)
    expect(n.M.gastos.filter((g) => g.concepto === 'revisor_externo')).toHaveLength(0)
    const turnos = [...n.M.turnos.get(n.id)!.values()]
    const deLaJefatura = turnos.find((t) => t.paso === 'jefatura')!
    expect(deLaJefatura.cost_usd).toBeGreaterThan(0)
    // el gasto del encargo = lo que costaron TODOS sus turnos, incluido el de la jefatura
    expect(n.M.encargos.get(n.id)!.gasto_usd).toBeCloseTo(turnos.reduce((a, t) => a + Number(t.cost_usd ?? 0), 0), 6)
  })
  it('con el encargo casi en su tope, el gasto de la revisión lo CIERRA POR TOPE: la re-imagen ya no ve «todo el tope otra vez»', () => {
    const pl = POST_IMG_CON_JEFATURA
    const idx = pl.pasos.findIndex((p) => p.clave === 'jefatura')
    const e0 = { ultimo: idx - 1, pasos_ejecutados: 5, gasto_usd: pl.limites.tope_encargo_usd - 0.1, vueltas: {}, artefactos: { pieza_post: { version: 1, version_consumida: 1, datos: {} }, visual_direction: { version: 1, version_consumida: 1, datos: { decision: { modo: 'generada' } } } }, fichas: [] }
    const res = aplicarSalidaDeJefatura(pl, e0, salidaSintetica('limpia', { costo_usd: 0.4 }), { reImagen: () => ({}) })
    const e1 = registrarPaso(e0, pl, idx, res)
    expect(e1.gasto_usd).toBeCloseTo(pl.limites.tope_encargo_usd + 0.3, 6)
    expect(siguientePaso(e1, pl)).toMatchObject({ accion: 'cierre_por_tope', razon: 'tope_de_gasto' })
    // y una revisión que no costó nada no mueve el gasto
    expect(registrarPaso(e0, pl, idx, aplicarSalidaDeJefatura(pl, e0, salidaSintetica('limpia', { costo_usd: 0 }), { reImagen: () => ({}) })).gasto_usd).toBeCloseTo(e0.gasto_usd, 6)
  })
})
